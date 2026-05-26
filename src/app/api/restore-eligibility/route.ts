/**
 * GET /api/restore-eligibility?pubkey=<hex>
 *
 * Returns whether the supplied pubkey may be restored as an active identity.
 *
 * Background (E29): when a user rotates their key (A → B), a migration record
 * is written both on-chain (OP_RETURN) and server-side (migrations table).
 * The migration record is treated as a permanent revocation — like Google /
 * Apple invalidating sessions on a password change. Restoring a key that has
 * been rotated away would create a permanent attack surface for any pre-
 * rotation plaintext recovery file (which exists by default for every user's
 * first identity). See DECISIONS.md "Restore of rotated keys (Design C-strict)".
 *
 * Response shapes:
 * - `{ allowed: true }` — pubkey has no forward migration; restore proceeds.
 * - `{ allowed: false, rotatedAt: "<ISO>", newAddrPrefix: "<6-char>" }` —
 *   pubkey was rotated; restore must be rejected. The prefix is the first
 *   6 chars of the new P2PKH address (after the leading "1"), matching the
 *   `addr6` convention used by backup-template filenames.
 *
 * This is a read-only endpoint with no signing requirement: the migration
 * graph is public on-chain, so disclosing forward links via this endpoint
 * does not leak anything beyond what's already in the OP_RETURN log.
 *
 * Rate limited 30/min/IP to discourage scanning of the migration graph.
 */
import { type NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getForwardMigration } from "@/services/bsv/migration";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`restore-eligibility:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const pubkey = searchParams.get("pubkey")?.trim();

  // Compressed secp256k1 pubkeys are 33 bytes = 66 hex chars, starting with 02 or 03.
  // Uncompressed would be 130 hex chars starting with 04. Accept both shapes.
  if (!pubkey || !/^(02|03)[a-fA-F0-9]{64}$|^04[a-fA-F0-9]{128}$/.test(pubkey)) {
    return NextResponse.json({ error: "Invalid pubkey" }, { status: 400 });
  }

  const migration = await getForwardMigration(pubkey);
  if (!migration) {
    return NextResponse.json({ allowed: true });
  }

  // Derive the destination address from the to_pubkey. The migrations table
  // stores pubkeys only (no addresses), so we derive on demand. Same pattern
  // as src/services/fairness/weights.ts's pubkeyToAddress conversion.
  let newAddrPrefix: string | undefined;
  try {
    const { PublicKey } = await import("@bsv/sdk");
    const address = PublicKey.fromString(migration.toPubkey).toAddress().toString();
    // addr6 = address.slice(1, 7) — skip leading "1" of P2PKH, take next 6.
    // Matches the convention in src/services/bsv/backup-template.ts buildFilename.
    newAddrPrefix = address.slice(1, 7);
  } catch {
    // Malformed to_pubkey in DB — treat as missing prefix; caller still gets
    // the blocked verdict + rotatedAt, just without the addr hint.
  }

  return NextResponse.json({
    allowed: false,
    rotatedAt: migration.rotatedAt,
    newAddrPrefix,
  });
}
