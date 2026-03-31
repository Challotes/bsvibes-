/**
 * Client-side trustless boot transaction builder for BSVibes.
 *
 * Runs entirely in the BROWSER. The user's browser builds a multi-output
 * split transaction, signs it with their private key, and broadcasts
 * directly to the BSV network via ARC. Zero server custody.
 *
 * Flow:
 * 1. Receive contributor shares (fetched by caller from /api/boot-shares)
 * 2. Fetch user's UTXOs from WhatsOnChain
 * 3. Fetch source transaction hex for each UTXO from WhatsOnChain
 * 4. Build multi-output tx: one P2PKH per contributor + OP_RETURN metadata + change
 * 5. Sign with user's private key
 * 6. Broadcast via tx.broadcast() (SDK built-in ARC broadcaster)
 * 7. Return txid for caller to confirm with server
 *
 * Double-spend prevention:
 * - Promise-based mutex — only one clientSideBoot executes at a time
 * - Spent-set — tracks consumed UTXOs so stale WoC data is filtered out
 * - 0-conf chaining — change output from the last tx is immediately available
 *   as an input for the next, skipping the WoC fetch entirely when sufficient
 */

const WOC_BASE = 'https://api.whatsonchain.com/v1/bsv/main';

// ── Types ───────────────────────────────────────────────────

export interface BootShare {
  address: string;
  sats: number;
  type: string; // 'pool_share' | 'boost_bonus' | 'platform'
}

export interface ClientBootResult {
  status: 'success' | 'insufficient_funds' | 'broadcast_failed' | 'error';
  txid?: string;
  error?: string;
  balance?: number;
}

interface WocUtxo {
  tx_hash: string;
  tx_pos: number;
  value: number;
}

/** Extended UTXO with optional sourceTransaction for 0-conf chaining */
interface ClientUtxo extends WocUtxo {
  sourceTransaction?: import('@bsv/sdk').Transaction;
}

// ── SDK loader (same pattern as identity.ts) ────────────────

let _bsvSdkPromise: Promise<typeof import('@bsv/sdk')> | null = null;

function getBsvSdk(): Promise<typeof import('@bsv/sdk')> {
  if (!_bsvSdkPromise) {
    _bsvSdkPromise = import('@bsv/sdk');
  }
  return _bsvSdkPromise;
}

// ── Transaction Mutex ──────────────────────────────────────
// Only one clientSideBoot call executes at a time. Others queue.
// Same promise-chain pattern as the server wallet mutex.

let _txMutexChain: Promise<void> = Promise.resolve();

function acquireTxMutex(): Promise<() => void> {
  // biome-ignore lint: release is assigned synchronously in Promise constructor
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ticket = _txMutexChain.then(() => {});
  _txMutexChain = _txMutexChain.then(() => gate);
  return ticket.then(() => release);
}

// ── Spent tracking & 0-conf chaining ───────────────────────

/** UTXOs consumed as inputs — blacklist for stale WoC data */
const _spent = new Set<string>();

/** Change outputs from recent broadcasts, immediately spendable */
const _pendingChange: ClientUtxo[] = [];

function utxoKey(txHash: string, txPos: number): string {
  return `${txHash}:${txPos}`;
}

// ── WhatsOnChain helpers ────────────────────────────────────

async function fetchUtxos(address: string, neededSats?: number): Promise<ClientUtxo[]> {
  // If pending change covers our needs, skip the WoC fetch entirely
  if (neededSats !== undefined && _pendingChange.length > 0) {
    const pendingTotal = _pendingChange.reduce((sum, u) => sum + u.value, 0);
    if (pendingTotal >= neededSats) {
      return [..._pendingChange];
    }
  }

  const res = await fetch(`${WOC_BASE}/address/${address}/unspent`);
  if (!res.ok) {
    throw new Error(`UTXO fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // WoC returns null (not []) for addresses with no history at all
  if (!Array.isArray(data)) {
    return [..._pendingChange];
  }

  const wocUtxos = data as WocUtxo[];

  // Deduplicate: pending change UTXOs take priority (they have sourceTransaction)
  const pendingKeys = new Set(_pendingChange.map((u) => utxoKey(u.tx_hash, u.tx_pos)));
  const filtered = wocUtxos.filter((u) => {
    const key = utxoKey(u.tx_hash, u.tx_pos);
    return !pendingKeys.has(key) && !_spent.has(key);
  });

  // Clean up spent set: if WoC no longer returns a spent UTXO, it's confirmed spent
  const wocKeys = new Set(wocUtxos.map((u) => utxoKey(u.tx_hash, u.tx_pos)));
  for (const spentKey of _spent) {
    if (!wocKeys.has(spentKey)) {
      _spent.delete(spentKey);
    }
  }

  // Merge pending change + filtered WoC, sort largest first
  const all: ClientUtxo[] = [..._pendingChange, ...filtered];
  all.sort((a, b) => b.value - a.value);
  return all;
}

async function fetchSourceTxHex(txHash: string): Promise<string> {
  // Proxy through our server to avoid CORS on WoC /tx/hex endpoint
  const res = await fetch(`/api/tx-hex?txid=${txHash}`);
  if (!res.ok) {
    throw new Error(`Source tx fetch failed for ${txHash}: ${res.status}`);
  }
  return res.text();
}

// ── Validation ──────────────────────────────────────────────

function validateShares(shares: BootShare[], bootPriceSats: number): string | null {
  if (shares.length === 0) {
    return 'No shares provided';
  }

  const totalDistributed = shares.reduce((sum, s) => sum + s.sats, 0);

  if (totalDistributed !== bootPriceSats) {
    return `Share total ${totalDistributed} does not match boot price ${bootPriceSats}`;
  }

  for (const share of shares) {
    if (share.sats <= 0) {
      return `Invalid sats value ${share.sats} for address ${share.address}`;
    }
    if (!share.address || share.address.length < 25) {
      return `Invalid address: ${share.address}`;
    }
  }

  return null;
}

// ── UTXO selection ──────────────────────────────────────────

/**
 * Maximum inputs per boot transaction.
 *
 * Each P2PKH input is ~148 bytes. At 0.1 sat/byte (100 sat/kb):
 *   20 inputs  = ~2,960 bytes = ~296 sats fee — easily covered by boot price
 *   50 inputs  = ~7,400 bytes = ~740 sats fee — within boot price floor
 *
 * Capping at 20 keeps the fee well under 1,500 sats on any realistic BSV fee rate.
 * Users with >20 UTXOs consolidate at a rate of ~20 per boot (change output merges them).
 * A user with 290 UTXOs is fully consolidated after ~15 boots.
 */
const MAX_CONSOLIDATION_INPUTS = 20;

/**
 * Estimate the fee for a transaction with N inputs and M outputs (P2PKH).
 * Byte formula: 10 (overhead) + 148 * inputs + 34 * outputs + 80 (OP_RETURN est.)
 * Rate: 0.1 sat/byte (100 sat/kb) to match ARC's minimum policy.
 */
function estimateFee(inputCount: number, outputCount: number): number {
  const bytes = 10 + 148 * inputCount + 34 * outputCount + 80;
  return Math.max(100, Math.ceil(bytes * 0.1));
}

/**
 * Select UTXOs to cover the target amount, opportunistically consolidating extras.
 *
 * Strategy:
 * 1. Sort UTXOs smallest-first so tiny ones get swept up first.
 * 2. Fill up to MAX_CONSOLIDATION_INPUTS, re-calculating the fee budget each time.
 * 3. Stop early if we have enough value AND adding another input costs more in fee
 *    than the UTXO is worth (dust threshold).
 *
 * Effect: users with many tiny UTXOs consolidate ~20 per boot for free.
 * Users with a single large UTXO select just that one (unchanged behaviour).
 */
function selectUtxos(
  utxos: ClientUtxo[],
  bootPriceSats: number,
  outputCount: number,
): { selected: ClientUtxo[]; total: number; estimatedFee: number } | null {
  if (utxos.length === 0) return null;

  // Separate large UTXOs (can cover boot alone) from tiny ones
  // Smallest-first so tiny UTXOs get consumed on each boot
  const sorted = [...utxos].sort((a, b) => a.value - b.value);

  const selected: ClientUtxo[] = [];
  let total = 0;

  for (const utxo of sorted) {
    if (selected.length >= MAX_CONSOLIDATION_INPUTS) break;

    selected.push(utxo);
    total += utxo.value;

    const fee = estimateFee(selected.length, outputCount);
    const needed = bootPriceSats + fee;

    // We have enough. Check if the next UTXO is worth including.
    // Include it only if it's worth more than the marginal fee cost of one extra input.
    if (total >= needed) {
      const nextUtxo = sorted[selected.length]; // next candidate (not yet selected)
      if (!nextUtxo) break; // no more UTXOs
      const marginalFee = estimateFee(selected.length + 1, outputCount) - fee;
      if (nextUtxo.value <= marginalFee) break; // dust — stop here
      // Otherwise keep going to consolidate it
    }
  }

  const fee = estimateFee(selected.length, outputCount);
  if (total >= bootPriceSats + fee) {
    return { selected, total, estimatedFee: fee };
  }

  return null; // Insufficient funds
}

// ── Main entry point ────────────────────────────────────────

/**
 * Build, sign, and broadcast a boot transaction entirely in the browser.
 *
 * Uses a mutex to serialize calls — rapid clicks queue up instead of
 * racing for the same UTXOs. After each broadcast, the change output
 * is tracked for 0-conf chaining so the next boot can execute immediately.
 *
 * @param wif        - User's private key in WIF format
 * @param userAddress - User's BSV address (for change output)
 * @param postId     - The post being booted
 * @param shares     - Contributor payout shares (must sum to bootPriceSats)
 * @param bootPriceSats - Total boot price in satoshis
 */
export async function clientSideBoot(
  wif: string,
  userAddress: string,
  postId: number,
  shares: BootShare[],
  bootPriceSats: number,
): Promise<ClientBootResult> {
  // ── Validate inputs ─────────────────────────────────────
  const validationError = validateShares(shares, bootPriceSats);
  if (validationError) {
    return { status: 'error', error: validationError };
  }

  // ── Acquire mutex — only one tx builds at a time ────────
  const release = await acquireTxMutex();

  try {
    return await _clientSideBootInner(wif, userAddress, postId, shares, bootPriceSats);
  } finally {
    release();
  }
}

/**
 * Internal implementation — caller must hold the mutex.
 */
async function _clientSideBootInner(
  wif: string,
  userAddress: string,
  postId: number,
  shares: BootShare[],
  bootPriceSats: number,
): Promise<ClientBootResult> {
  try {
    const { Transaction, PrivateKey, P2PKH, Script, OP, SatoshisPerKilobyte } = await getBsvSdk();

    // ── Parse private key ───────────────────────────────────
    let privateKey: InstanceType<typeof PrivateKey>;
    try {
      privateKey = PrivateKey.fromWif(wif);
    } catch {
      return { status: 'error', error: 'Invalid private key' };
    }

    // ── Fetch UTXOs (with spent-filtering + pending change) ─
    // Use a conservative worst-case estimate for the pending-change shortcut check:
    // MAX_CONSOLIDATION_INPUTS inputs, shares.length + 2 outputs (payouts + OP_RETURN + change)
    const outputCount = shares.length + 2; // contributor outputs + OP_RETURN + change
    const worstCaseFee = estimateFee(MAX_CONSOLIDATION_INPUTS, outputCount);
    const totalNeeded = bootPriceSats + worstCaseFee;

    const utxos = await fetchUtxos(userAddress, totalNeeded);

    if (utxos.length === 0) {
      console.warn('[clientSideBoot] No UTXOs found for address:', userAddress, '— address may have no confirmed/unconfirmed outputs');
      return { status: 'insufficient_funds', balance: 0 };
    }

    const balance = utxos.reduce((sum, u) => sum + u.value, 0);

    // ── Select UTXOs (with opportunistic consolidation) ─────
    // Grabs up to MAX_CONSOLIDATION_INPUTS tiny UTXOs on every boot.
    // Users with fragmented wallets consolidate ~20 UTXOs per boot for free.
    const selection = selectUtxos(utxos, bootPriceSats, outputCount);
    if (!selection) {
      console.warn(
        `[clientSideBoot] Insufficient funds: balance=${balance} sats, needed=${bootPriceSats + worstCaseFee} sats, address=${userAddress}`,
      );
      return { status: 'insufficient_funds', balance };
    }
    const { estimatedFee } = selection;

    // ── Fetch source transactions (parallel) ────────────────
    // For 0-conf chained UTXOs, sourceTransaction is already attached — skip the fetch
    const sourceTxPromises = selection.selected.map(async (utxo) => {
      if (utxo.sourceTransaction) {
        return { utxo, sourceTx: utxo.sourceTransaction };
      }
      const hex = await fetchSourceTxHex(utxo.tx_hash);
      return { utxo, sourceTx: Transaction.fromHex(hex) };
    });

    let sourceTxs: Array<{ utxo: ClientUtxo; sourceTx: InstanceType<typeof Transaction> }>;
    try {
      sourceTxs = await Promise.all(sourceTxPromises);
    } catch (e) {
      return {
        status: 'broadcast_failed',
        error: `Failed to fetch source transactions: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // ── Build transaction ───────────────────────────────────
    const tx = new Transaction();

    // Add inputs
    for (const { utxo, sourceTx } of sourceTxs) {
      tx.addInput({
        sourceTransaction: sourceTx,
        sourceOutputIndex: utxo.tx_pos,
        unlockingScriptTemplate: new P2PKH().unlock(privateKey),
      });
    }

    // Add contributor payout outputs
    for (const share of shares) {
      tx.addOutput({
        lockingScript: new P2PKH().lock(share.address),
        satoshis: share.sats,
      });
    }

    // Add OP_RETURN metadata output
    const opReturnScript = new Script();
    opReturnScript.writeOpCode(OP.OP_FALSE);
    opReturnScript.writeOpCode(OP.OP_RETURN);

    const opReturnFields = [
      'bsvibes',       // app prefix
      'boot',          // action type
      String(postId),  // post being booted
      String(bootPriceSats), // total boot amount
      String(Date.now()),    // timestamp
    ];
    for (const field of opReturnFields) {
      opReturnScript.writeBin(Array.from(new TextEncoder().encode(field)));
    }

    tx.addOutput({
      lockingScript: opReturnScript as import('@bsv/sdk').LockingScript,
      satoshis: 0,
    });

    // Change output back to user — track its index for 0-conf chaining
    const changeOutputIndex = tx.outputs.length;
    tx.addOutput({
      lockingScript: new P2PKH().lock(userAddress),
      change: true,
    });

    // ── Fee calculation and signing ─────────────────────────
    // Use an explicit 50 sat/kb fee model — safely above ARC's minimum (~100 sat/kb
    // policy, but actual acceptance is lower) while being 10x cheaper than 500 sat/kb.
    // At 50 sat/kb a 20-input tx is ~163 sats — negligible relative to boot price.
    await tx.fee(new SatoshisPerKilobyte(100));
    await tx.sign();

    // If the fee consumed all remaining funds the change output will have 0 sats.
    // A 0-sat output is non-standard on BSV — remove it to avoid broadcast rejection.
    let hasChangeOutput = true;
    const changeOutputAfterFee = tx.outputs[changeOutputIndex];
    if (!changeOutputAfterFee?.satoshis || changeOutputAfterFee.satoshis <= 0) {
      tx.outputs.splice(changeOutputIndex, 1);
      hasChangeOutput = false;
    }

    // ── Broadcast ───────────────────────────────────────────
    const broadcastResult = await tx.broadcast();

    if (broadcastResult.status === 'success') {
      const txid = tx.id('hex') as string;

      // ── Track spent UTXOs ─────────────────────────────────
      // Blacklist consumed inputs so stale WoC responses don't resurrect them
      const spentKeys = new Set(selection.selected.map((u) => utxoKey(u.tx_hash, u.tx_pos)));
      for (const sk of spentKeys) {
        _spent.add(sk);
      }

      // Remove consumed UTXOs from pending change
      for (let i = _pendingChange.length - 1; i >= 0; i--) {
        const pendingKey = utxoKey(_pendingChange[i].tx_hash, _pendingChange[i].tx_pos);
        if (spentKeys.has(pendingKey)) {
          _pendingChange.splice(i, 1);
        }
      }

      // ── 0-conf chain: register change as immediately spendable ─
      if (hasChangeOutput) {
        const changeSats = tx.outputs[changeOutputIndex].satoshis;
        if (changeSats && changeSats > 0) {
          _pendingChange.push({
            tx_hash: txid,
            tx_pos: changeOutputIndex,
            value: changeSats,
            sourceTransaction: tx, // Keep tx object for signing next time
          });

          // Cap queues to avoid unbounded growth
          while (_pendingChange.length > 50) _pendingChange.shift();
          while (_spent.size > 200) {
            const first = _spent.values().next().value;
            if (first) _spent.delete(first);
          }
        }
      }

      return { status: 'success', txid };
    }

    return {
      status: 'broadcast_failed',
      error: typeof broadcastResult === 'object'
        ? JSON.stringify(broadcastResult)
        : String(broadcastResult),
    };
  } catch (e) {
    return {
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
