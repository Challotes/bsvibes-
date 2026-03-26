/**
 * Server-side BSV wallet with UTXO management.
 * Supports reservation, 0-conf chaining, multi-UTXO aggregation.
 */

import { PrivateKey, Transaction, P2PKH } from '@bsv/sdk';

let _serverKey: PrivateKey | null = null;

function getServerKey(): PrivateKey | null {
  if (_serverKey) return _serverKey;
  const wif = process.env.BSV_SERVER_WIF;
  if (!wif) return null;
  try {
    _serverKey = PrivateKey.fromWif(wif);
    return _serverKey;
  } catch (e) {
    console.error('BSVibes: invalid BSV_SERVER_WIF', e);
    return null;
  }
}

export function getServerAddress(): string | null {
  const key = getServerKey();
  if (!key) return null;
  return key.toPublicKey().toAddress().toString();
}

// ── UTXO Types ──────────────────────────────────────────────

interface UTXO {
  tx_hash: string;
  tx_pos: number;
  value: number;
  sourceTransaction?: Transaction; // For 0-conf chaining
}

export type BroadcastResult =
  | { status: 'success'; txid: string }
  | { status: 'insufficient_funds' }
  | { status: 'broadcast_failed'; error: string }
  | { status: 'no_wallet' };

// ── UTXO Manager ────────────────────────────────────────────

const _reserved = new Set<string>();
const _pendingChange: UTXO[] = []; // 0-conf change outputs from recent txs

function utxoKey(txHash: string, txPos: number): string {
  return `${txHash}:${txPos}`;
}

export async function getUtxos(): Promise<UTXO[]> {
  const address = getServerAddress();
  if (!address) return [];

  try {
    const res = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`
    );
    if (!res.ok) return [];
    const confirmed = (await res.json()) as UTXO[];
    // Merge confirmed UTXOs with pending change outputs
    return [..._pendingChange, ...confirmed];
  } catch {
    return [];
  }
}

export async function getBalance(): Promise<number> {
  const utxos = await getUtxos();
  return utxos
    .filter((u) => !_reserved.has(utxoKey(u.tx_hash, u.tx_pos)))
    .reduce((sum, u) => sum + u.value, 0);
}

/**
 * Reserve UTXOs that cover at least `neededSats`.
 * Returns reserved UTXOs or null if insufficient funds.
 */
async function reserveUtxos(neededSats: number): Promise<UTXO[] | null> {
  const utxos = await getUtxos();
  const selected: UTXO[] = [];
  let total = 0;

  for (const utxo of utxos) {
    const key = utxoKey(utxo.tx_hash, utxo.tx_pos);
    if (_reserved.has(key)) continue;

    _reserved.add(key);
    selected.push(utxo);
    total += utxo.value;

    if (total >= neededSats) return selected;
  }

  // Not enough — release what we selected
  for (const utxo of selected) {
    _reserved.delete(utxoKey(utxo.tx_hash, utxo.tx_pos));
  }
  return null;
}

function releaseUtxos(utxos: UTXO[]): void {
  for (const utxo of utxos) {
    _reserved.delete(utxoKey(utxo.tx_hash, utxo.tx_pos));
  }
}

/**
 * Fetch source transaction hex for signing (if not already available from 0-conf chain).
 */
async function getSourceTransaction(utxo: UTXO): Promise<Transaction | null> {
  if (utxo.sourceTransaction) return utxo.sourceTransaction;

  try {
    const res = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/tx/${utxo.tx_hash}/hex`
    );
    if (!res.ok) return null;
    const hex = await res.text();
    return Transaction.fromHex(hex);
  } catch {
    return null;
  }
}

// ── Build & Broadcast ───────────────────────────────────────

/**
 * Build, sign, and broadcast a transaction with the given outputs.
 * Supports multi-UTXO inputs and 0-conf chaining.
 */
export async function buildAndBroadcast(
  outputs: Array<{ lockingScript: any; satoshis: number }>
): Promise<BroadcastResult> {
  const key = getServerKey();
  if (!key) return { status: 'no_wallet' };

  const totalNeeded = outputs.reduce((sum, o) => sum + o.satoshis, 0) + 500; // +500 for estimated fee
  const utxos = await reserveUtxos(totalNeeded);

  if (!utxos) return { status: 'insufficient_funds' };

  try {
    const tx = new Transaction();

    // Add all reserved UTXOs as inputs
    for (const utxo of utxos) {
      const sourceTx = await getSourceTransaction(utxo);
      if (!sourceTx) {
        releaseUtxos(utxos);
        return { status: 'broadcast_failed', error: 'Failed to fetch source transaction' };
      }

      tx.addInput({
        sourceTransaction: sourceTx,
        sourceOutputIndex: utxo.tx_pos,
        unlockingScriptTemplate: new P2PKH().unlock(key),
      });
    }

    // Add requested outputs
    for (const output of outputs) {
      tx.addOutput(output);
    }

    // Change output back to server
    tx.addOutput({
      lockingScript: new P2PKH().lock(key.toPublicKey().toAddress()),
      change: true,
    });

    await tx.fee();
    await tx.sign();

    const broadcastResult = await tx.broadcast();

    if (broadcastResult.status === 'success') {
      const txid = tx.id('hex') as string;

      // 0-conf chain: add change output as immediately spendable UTXO
      const changeIndex = tx.outputs.length - 1;
      const changeSats = tx.outputs[changeIndex].satoshis;
      if (changeSats && changeSats > 0) {
        _pendingChange.push({
          tx_hash: txid,
          tx_pos: changeIndex,
          value: changeSats,
          sourceTransaction: tx, // Keep the tx object for signing
        });

        // Clean up old pending UTXOs (keep last 50)
        while (_pendingChange.length > 50) _pendingChange.shift();
      }

      // Release the spent UTXOs (they're consumed now)
      releaseUtxos(utxos);

      return { status: 'success', txid };
    }

    releaseUtxos(utxos);
    console.error('BSVibes: broadcast failed', broadcastResult);
    return { status: 'broadcast_failed', error: String(broadcastResult) };
  } catch (e) {
    releaseUtxos(utxos);
    console.error('BSVibes: transaction error', e);
    return { status: 'broadcast_failed', error: e instanceof Error ? e.message : String(e) };
  }
}
