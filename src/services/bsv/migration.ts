/**
 * Key rotation and on-chain migration for BSVibes.
 * When a user upgrades security, old key signs a migration to new key.
 */

/**
 * Look up a pubkey's forward migration record (if any).
 *
 * Returns the destination pubkey + creation timestamp when this pubkey has
 * been rotated forward; returns null when this pubkey is current (no forward
 * migration exists).
 *
 * Server-side only (queries SQLite directly). Shared between:
 * - E29 `/api/restore-eligibility` — gates restore on whether the key is stale
 * - E30 (planned) `createPost` + `boot-confirm` — gates mutations on whether
 *   the signing pubkey has been rotated away
 *
 * The migrations table has `idx_migrations_from_unique` on `from_pubkey` so
 * at most one row matches per pubkey. Returns the matching row's `to_pubkey`
 * and a normalized ISO timestamp.
 */
export interface ForwardMigration {
  toPubkey: string;
  rotatedAt: string; // ISO 8601 with trailing Z
}

export async function getForwardMigration(pubkey: string): Promise<ForwardMigration | null> {
  // Lazy import — this module is also used in client contexts above
  // (postMigrationOnChain runs in browser). The DB import is server-only.
  const { db } = await import("@/lib/db");
  const row = db
    .prepare("SELECT to_pubkey, created_at FROM migrations WHERE from_pubkey = ? LIMIT 1")
    .get(pubkey.trim()) as { to_pubkey: string; created_at: string } | undefined;
  if (!row) return null;
  // SQLite returns `YYYY-MM-DD HH:MM:SS` (UTC, no Z). Normalize to ISO with Z.
  // Matches the pattern in src/services/fairness/weights.ts.
  const rotatedAt = `${row.created_at.replace(" ", "T")}Z`;
  return { toPubkey: row.to_pubkey, rotatedAt };
}

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
    const { Script, OP } = await import("@bsv/sdk");
    const { buildAndBroadcast } = await import("./wallet");

    const payload = JSON.stringify({
      app: "bsvibes",
      type: "migration",
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
        lockingScript: opReturnScript as import("@bsv/sdk").LockingScript,
        satoshis: 0,
      },
    ]);

    return result.status === "success" ? result.txid : null;
  } catch (e) {
    console.error("BSVibes: migration on-chain logging failed", e);
    return null;
  }
}
