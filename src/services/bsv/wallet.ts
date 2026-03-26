/**
 * Server-side BSV wallet for funding OP_RETURN posts.
 * Loads key from BSV_SERVER_WIF env var.
 * This is a hot wallet for micro-transactions — keep balance small.
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

interface UTXO {
  tx_hash: string;
  tx_pos: number;
  value: number;
}

export async function getUtxos(): Promise<UTXO[]> {
  const address = getServerAddress();
  if (!address) return [];

  try {
    const res = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Build, sign, and broadcast a transaction with the given outputs.
 * Returns the txid on success, null on failure.
 */
export async function buildAndBroadcast(
  outputs: Array<{ lockingScript: any; satoshis: number }>
): Promise<string | null> {
  const key = getServerKey();
  if (!key) {
    console.warn('BSVibes: no BSV_SERVER_WIF configured, skipping on-chain');
    return null;
  }

  const utxos = await getUtxos();
  if (utxos.length === 0) {
    console.warn('BSVibes: server wallet has no UTXOs');
    return null;
  }

  try {
    const tx = new Transaction();

    // Add inputs from available UTXOs (use the first one with enough funds)
    // For OP_RETURN posts, even the smallest UTXO is enough
    const utxo = utxos[0];

    // Fetch the source transaction for signing
    const sourceTxRes = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/tx/${utxo.tx_hash}/hex`
    );
    if (!sourceTxRes.ok) {
      console.error('BSVibes: failed to fetch source tx');
      return null;
    }
    const sourceTxHex = await sourceTxRes.text();
    const sourceTransaction = Transaction.fromHex(sourceTxHex);

    tx.addInput({
      sourceTransaction,
      sourceOutputIndex: utxo.tx_pos,
      unlockingScriptTemplate: new P2PKH().unlock(key),
    });

    // Add the requested outputs (OP_RETURN etc)
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
      return tx.id('hex') as string;
    }

    console.error('BSVibes: broadcast failed', broadcastResult);
    return null;
  } catch (e) {
    console.error('BSVibes: transaction error', e);
    return null;
  }
}
