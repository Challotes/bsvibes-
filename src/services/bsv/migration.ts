/**
 * Key rotation and on-chain migration for BSVibes.
 * When a user upgrades security, old key signs a migration to new key.
 */

import { logPostOnChain } from './onchain';

interface MigrationData {
  oldPubkey: string;
  newPubkey: string;
  migrationMessage: string;
  migrationSignature: string;
}

/**
 * Post a migration record on-chain via OP_RETURN.
 * This creates a permanent, verifiable link from old key to new key.
 * Returns txid or null (fire-and-forget).
 */
export async function postMigrationOnChain(migration: MigrationData): Promise<string | null> {
  try {
    // Reuse the onchain service but with migration-specific payload
    const { Script, OP } = await import('@bsv/sdk');
    const { buildAndBroadcast } = await import('./wallet');

    const payload = JSON.stringify({
      app: 'bsvibes',
      type: 'migration',
      from_pubkey: migration.oldPubkey,
      to_pubkey: migration.newPubkey,
      signature: migration.migrationSignature,
      message: migration.migrationMessage,
      ts: Date.now(),
    });

    const opReturnScript = new Script();
    opReturnScript.writeOpCode(OP.OP_FALSE);
    opReturnScript.writeOpCode(OP.OP_RETURN);
    opReturnScript.writeBin(Array.from(new TextEncoder().encode(payload)));

    const result = await buildAndBroadcast([
      {
        lockingScript: opReturnScript as import('@bsv/sdk').LockingScript,
        satoshis: 0,
      },
    ]);

    return result.status === 'success' ? result.txid : null;
  } catch (e) {
    console.error('BSVibes: migration on-chain logging failed', e);
    return null;
  }
}
