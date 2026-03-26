/**
 * Multi-output BSV transaction builder for boot fee splits.
 * Single transaction: payer → all contributors + platform + OP_RETURN.
 */

import { Script, OP, P2PKH } from '@bsv/sdk';
import type { LockingScript } from '@bsv/sdk';
import { buildAndBroadcast, type BroadcastResult } from '@/services/bsv/wallet';
import { FAIRNESS_CONFIG } from './config';
import type { SplitResult } from './split';

/**
 * Build and broadcast the split transaction for a boot.
 */
export async function buildSplitTransaction(
  split: SplitResult,
  postId: number
): Promise<BroadcastResult> {
  const p2pkh = new P2PKH();

  // Collect all payment outputs (deduplicate by address)
  const outputsByAddress = new Map<string, number>();

  // Platform output
  if (split.platform.sats > 0) {
    outputsByAddress.set(
      split.platform.address,
      (outputsByAddress.get(split.platform.address) ?? 0) + split.platform.sats
    );
  }

  // Creator bonus (if not already merged into pool entry)
  if (split.creatorBonus.sats > 0) {
    outputsByAddress.set(
      split.creatorBonus.address,
      (outputsByAddress.get(split.creatorBonus.address) ?? 0) + split.creatorBonus.sats
    );
  }

  // Pool shares
  for (const recipient of split.pool) {
    if (recipient.sats > 0) {
      outputsByAddress.set(
        recipient.address,
        (outputsByAddress.get(recipient.address) ?? 0) + recipient.sats
      );
    }
  }

  // Build transaction outputs
  const outputs: Array<{ lockingScript: LockingScript; satoshis: number }> = [];

  for (const [address, sats] of outputsByAddress) {
    if (sats > 0) {
      outputs.push({
        lockingScript: p2pkh.lock(address) as LockingScript,
        satoshis: sats,
      });
    }
  }

  // OP_RETURN audit trail with split hash
  const splitData = Array.from(outputsByAddress.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([address, sats]) => `${address}:${sats}`)
    .join(',');

  // Simple hash: use the split data string as-is in the OP_RETURN (compact enough)
  const auditPayload = JSON.stringify({
    app: 'bsvibes',
    action: 'boot_split',
    post_id: postId,
    total: split.totalDistributed,
    recipients: outputsByAddress.size,
    formula_version: FAIRNESS_CONFIG.formulaVersion,
    ts: Date.now(),
  });

  const opReturnScript = new Script();
  opReturnScript.writeOpCode(OP.OP_FALSE);
  opReturnScript.writeOpCode(OP.OP_RETURN);
  opReturnScript.writeBin(Array.from(new TextEncoder().encode(auditPayload)));

  outputs.push({
    lockingScript: opReturnScript as LockingScript,
    satoshis: 0,
  });

  return buildAndBroadcast(outputs);
}
