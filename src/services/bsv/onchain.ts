/**
 * On-chain post logging via OP_RETURN.
 * Each post gets an OP_FALSE OP_RETURN transaction with its data.
 */

import { Script, OP } from '@bsv/sdk';
import type { LockingScript } from '@bsv/sdk';
import { buildAndBroadcast } from './wallet';

interface PostData {
  content: string;
  author: string;
  signature: string | null;
  pubkey: string | null;
}

/**
 * Log a post on-chain via OP_RETURN.
 * Returns txid on success, null on failure.
 * Failures are non-fatal — the post still exists in SQLite.
 */
export async function logPostOnChain(postData: PostData): Promise<string | null> {
  try {
    const payload = JSON.stringify({
      app: 'bsvibes',
      type: 'post',
      content: postData.content,
      author: postData.author,
      sig: postData.signature,
      pubkey: postData.pubkey,
      ts: Date.now(),
    });

    // Build OP_FALSE OP_RETURN script (BSV standard — provably unspendable)
    const opReturnScript = new Script();
    opReturnScript.writeOpCode(OP.OP_FALSE);
    opReturnScript.writeOpCode(OP.OP_RETURN);
    opReturnScript.writeBin(Array.from(new TextEncoder().encode(payload)));

    const txid = await buildAndBroadcast([
      {
        lockingScript: opReturnScript as LockingScript,
        satoshis: 0,
      },
    ]);

    return txid;
  } catch (e) {
    console.error('BSVibes: on-chain logging failed', e);
    return null;
  }
}
