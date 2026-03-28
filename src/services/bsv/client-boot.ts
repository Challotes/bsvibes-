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

// ── SDK loader (same pattern as identity.ts) ────────────────

let _bsvSdkPromise: Promise<typeof import('@bsv/sdk')> | null = null;

function getBsvSdk(): Promise<typeof import('@bsv/sdk')> {
  if (!_bsvSdkPromise) {
    _bsvSdkPromise = import('@bsv/sdk');
  }
  return _bsvSdkPromise;
}

// ── WhatsOnChain helpers ────────────────────────────────────

async function fetchUtxos(address: string): Promise<WocUtxo[]> {
  const res = await fetch(`${WOC_BASE}/address/${address}/unspent`);
  if (!res.ok) {
    throw new Error(`UTXO fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // WoC returns null (not []) for addresses with no history at all
  if (!Array.isArray(data)) {
    return [];
  }
  return data as WocUtxo[];
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
 * Select UTXOs to cover the target amount.
 * Uses a simple largest-first strategy to minimize input count.
 */
function selectUtxos(
  utxos: WocUtxo[],
  targetSats: number,
): { selected: WocUtxo[]; total: number } | null {
  // Sort descending by value — fewer inputs = lower fee
  const sorted = [...utxos].sort((a, b) => b.value - a.value);

  const selected: WocUtxo[] = [];
  let total = 0;

  for (const utxo of sorted) {
    selected.push(utxo);
    total += utxo.value;
    if (total >= targetSats) {
      return { selected, total };
    }
  }

  return null; // Insufficient funds
}

// ── Main entry point ────────────────────────────────────────

/**
 * Build, sign, and broadcast a boot transaction entirely in the browser.
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

  try {
    const { Transaction, PrivateKey, P2PKH, Script, OP } = await getBsvSdk();

    // ── Parse private key ───────────────────────────────────
    let privateKey: InstanceType<typeof PrivateKey>;
    try {
      privateKey = PrivateKey.fromWif(wif);
    } catch {
      return { status: 'error', error: 'Invalid private key' };
    }

    // ── Fetch UTXOs ─────────────────────────────────────────
    const utxos = await fetchUtxos(userAddress);

    if (utxos.length === 0) {
      console.warn('[clientSideBoot] No UTXOs found for address:', userAddress, '— address may have no confirmed/unconfirmed outputs');
      return { status: 'insufficient_funds', balance: 0 };
    }

    const balance = utxos.reduce((sum, u) => sum + u.value, 0);

    // Estimate fee: ~150 bytes per input + ~34 per output + ~80 for OP_RETURN + overhead
    // Fee rate: 1 sat/byte. Divide byte count by 1000 gives sats (rounds up to nearest sat).
    const estimatedInputs = Math.min(utxos.length, 10);
    const estimatedFee = Math.max(
      1,
      Math.ceil((150 * estimatedInputs + 34 * (shares.length + 2) + 80) / 1000),
    );
    const totalNeeded = bootPriceSats + estimatedFee;

    // ── Select UTXOs ────────────────────────────────────────
    const selection = selectUtxos(utxos, totalNeeded);
    if (!selection) {
      console.warn(
        `[clientSideBoot] Insufficient funds: balance=${balance} sats, needed=${totalNeeded} sats (price=${bootPriceSats} + fee=${estimatedFee}), address=${userAddress}`,
      );
      return { status: 'insufficient_funds', balance };
    }

    // ── Fetch source transactions (parallel) ────────────────
    const sourceTxPromises = selection.selected.map(async (utxo) => {
      const hex = await fetchSourceTxHex(utxo.tx_hash);
      return { utxo, sourceTx: Transaction.fromHex(hex) };
    });

    let sourceTxs: Array<{ utxo: WocUtxo; sourceTx: InstanceType<typeof Transaction> }>;
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

    // Change output back to user
    tx.addOutput({
      lockingScript: new P2PKH().lock(userAddress),
      change: true,
    });

    // ── Fee calculation and signing ─────────────────────────
    await tx.fee();
    await tx.sign();

    // ── Broadcast ───────────────────────────────────────────
    const broadcastResult = await tx.broadcast();

    if (broadcastResult.status === 'success') {
      const txid = tx.id('hex') as string;
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
