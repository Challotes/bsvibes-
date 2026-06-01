"use server";

import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { generateAnonName } from "@/lib/utils";

async function getBsvSdk() {
  const { PublicKey, Signature } = await import("@bsv/sdk");
  return { PublicKey, Signature };
}

import { getForwardMigration, postMigrationOnChain } from "@/services/bsv/migration";
import { logPostOnChain } from "@/services/bsv/onchain";
import { executeBoot } from "@/services/fairness/boot-orchestrator";
import { getBootPriceForUser } from "@/services/fairness/pricing";
import type { BootboardData, BootboardHistoryRow, BootboardRow, Post } from "@/types";

export interface CreatePostResult {
  ok: boolean;
  reason?: "bad_input" | "missing_pubkey" | "rate_limited" | "invalid_signature";
}

export async function createPost(formData: FormData): Promise<CreatePostResult> {
  const content = formData.get("content");
  if (typeof content !== "string" || content.trim().length === 0)
    return { ok: false, reason: "bad_input" };
  if (content.length > 1000) return { ok: false, reason: "bad_input" };

  const author = formData.get("author");
  const authorName =
    typeof author === "string" && /^anon_[a-z0-9]{4}$/.test(author) ? author : generateAnonName();

  const signature = formData.get("signature");
  const pubkey = formData.get("pubkey");

  if (typeof pubkey !== "string" || pubkey.trim().length === 0)
    return { ok: false, reason: "missing_pubkey" };

  const rl = rateLimit(`createPost:${pubkey}`, { limit: 10, windowMs: 60_000 });
  if (!rl.success) return { ok: false, reason: "rate_limited" };

  if (typeof signature !== "string") return { ok: false, reason: "invalid_signature" };
  try {
    const { PublicKey, Signature } = await getBsvSdk();
    const messageBytes = Array.from(new TextEncoder().encode(content.trim()));
    const verified = PublicKey.fromString(pubkey).verify(
      messageBytes,
      Signature.fromDER(signature, "hex")
    );
    if (!verified) return { ok: false, reason: "invalid_signature" };
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }

  const result = db
    .prepare("INSERT INTO posts (content, author_name, signature, pubkey) VALUES (?, ?, ?, ?)")
    .run(
      content.trim(),
      authorName,
      typeof signature === "string" ? signature : null,
      typeof pubkey === "string" ? pubkey : null
    );

  // Fire-and-forget: log on-chain, update tx_id if successful
  const postId = result.lastInsertRowid as number;
  const trimmedContent = content.trim();
  const sigStr = typeof signature === "string" ? signature : null;
  const pkStr = typeof pubkey === "string" ? pubkey : null;

  logPostOnChain({ content: trimmedContent, author: authorName, signature: sigStr, pubkey: pkStr })
    .then((txid) => {
      if (txid) {
        db.prepare("UPDATE posts SET tx_id = ? WHERE id = ?").run(txid, postId);
      } else {
        console.error(`BSVibes: on-chain logging returned null for post ${postId}`);
      }
    })
    .catch((e) => {
      console.error(`BSVibes: on-chain logging failed for post ${postId}`, e);
    });

  return { ok: true };
}

export async function getPosts(beforeId?: number): Promise<Post[]> {
  if (beforeId !== undefined) {
    return db
      .prepare(`
      SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
      FROM posts p
      LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
        ON bc.post_id = p.id
      WHERE p.id < ?
      ORDER BY p.id DESC
      LIMIT 100
    `)
      .all(beforeId) as Post[];
  }
  return db
    .prepare(`
    SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    ORDER BY p.id DESC
    LIMIT 100
  `)
    .all() as Post[];
}

export async function getNewPosts(sinceId: number): Promise<Post[]> {
  if (!Number.isInteger(sinceId) || sinceId < 0) return [];
  return db
    .prepare(`
    SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    WHERE p.id > ?
    ORDER BY p.id DESC
  `)
    .all(sinceId) as Post[];
}

/**
 * Get posts that have been updated since the client last saw them.
 * Currently this means posts that recently received a tx_id (on-chain confirmation).
 * Returns posts with id <= sinceId that have a tx_id (the client may have them without tx_id).
 */
export async function getUpdatedPosts(knownIds: number[]): Promise<Post[]> {
  if (!knownIds.length) return [];
  // Only check posts the client already has — return those that now have a tx_id
  const placeholders = knownIds.map(() => "?").join(",");
  return db
    .prepare(`
    SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    WHERE p.id IN (${placeholders}) AND p.tx_id IS NOT NULL
    ORDER BY p.id DESC
  `)
    .all(...knownIds) as Post[];
}

export async function getOlderPosts(beforeId: number): Promise<Post[]> {
  if (!Number.isInteger(beforeId) || beforeId <= 0) return [];
  return getPosts(beforeId);
}

export async function getBootboard(): Promise<BootboardData> {
  const current = db
    .prepare(`
    SELECT b.*, p.content, p.author_name, p.signature
    FROM bootboard b
    JOIN posts p ON p.id = b.post_id
    WHERE b.held_until IS NULL
    ORDER BY b.booted_at DESC
    LIMIT 1
  `)
    .get() as BootboardRow | undefined;

  const history = db
    .prepare(`
    SELECT b.post_id, b.boosted_by, b.boosted_by_name, b.booted_at, b.held_until,
      CAST((julianday(b.held_until) - julianday(b.booted_at)) * 86400 AS INTEGER) as duration_seconds,
      p.content, p.author_name
    FROM bootboard b
    JOIN posts p ON p.id = b.post_id
    WHERE b.held_until IS NOT NULL
    ORDER BY b.held_until DESC
    LIMIT 50
  `)
    .all() as BootboardHistoryRow[];

  const stats = db
    .prepare(`
    SELECT COUNT(*) as total_boots FROM bootboard
  `)
    .get() as { total_boots: number };

  return { current: current ?? null, history, totalBoots: stats.total_boots };
}

export interface BootPostResult {
  processingMs: number;
  // Present on success
  success?: boolean;
  isFree?: boolean;
  txid?: string;
  recipients?: number;
  // Present when the client must handle payment
  requiresPayment?: boolean;
  bootPrice?: number;
  // Present on failure
  error?: string;
}

export async function bootPost(
  postId: number,
  boostedBy: string,
  boostedByName: string
): Promise<BootPostResult> {
  const start = performance.now();

  // Input validation
  if (!Number.isInteger(postId) || postId <= 0) return { processingMs: 0, error: "Invalid postId" };
  if (typeof boostedBy !== "string" || boostedBy.length > 200 || boostedBy.trim().length === 0)
    return { processingMs: 0, error: "Invalid boostedBy" };
  if (typeof boostedByName !== "string" || boostedByName.trim().length === 0)
    return { processingMs: 0, error: "Invalid boostedByName" };

  // 30 boots per minute per caller.
  const rl = rateLimit(`bootPost:${boostedBy}`, { limit: 30, windowMs: 60_000 });
  if (!rl.success) return { processingMs: 0, error: "Rate limit exceeded" };

  // Check whether this boot is free (server pays) or paid (client must build tx)
  const { isFree, price: bootPrice } = getBootPriceForUser(db, boostedBy);

  if (!isFree) {
    // Paid boot: client must build and broadcast the split transaction itself,
    // then call /api/boot-confirm. Return the price so the client can proceed.
    const processingMs = Math.round((performance.now() - start) * 100) / 100;
    return { processingMs, requiresPayment: true, bootPrice, isFree: false };
  }

  // Free boot: server wallet pays, orchestrator handles the full workflow.
  const result = await executeBoot(db, postId, boostedBy, boostedByName);

  const processingMs = Math.round((performance.now() - start) * 100) / 100;

  if (!result.success) {
    return { processingMs, error: result.error ?? "Boot failed", isFree: true };
  }

  return {
    processingMs,
    success: true,
    isFree: true,
    txid: result.txid,
    recipients: result.recipients,
  };
}

/**
 * Result type for `migrateIdentity`. `reason` is set on failure so callers can
 * distinguish rejection causes — particularly important for E31's stale-key
 * gate, which surfaces a different UI than a generic verification failure.
 */
export interface MigrateIdentityResult {
  success: boolean;
  reason?: "bad_message" | "invalid_signature" | "stale_key";
}

export async function migrateIdentity(
  oldPubkey: string,
  newPubkey: string,
  migrationSig: string,
  migrationMessage: string
): Promise<MigrateIdentityResult> {
  // Validate migration message structure — from_pubkey and to_pubkey must match params
  try {
    const parsed = JSON.parse(migrationMessage);
    if (parsed.from_pubkey !== oldPubkey || parsed.to_pubkey !== newPubkey) {
      console.warn("[BSVibes] migrateIdentity: message body does not match params");
      return { success: false, reason: "bad_message" };
    }
  } catch {
    return { success: false, reason: "bad_message" };
  }

  // Verify the migration signature — old key must have signed the message
  try {
    const { PublicKey, Signature } = await getBsvSdk();
    const messageBytes = Array.from(new TextEncoder().encode(migrationMessage));
    const verified = PublicKey.fromString(oldPubkey).verify(
      messageBytes,
      Signature.fromDER(migrationSig, "hex")
    );
    if (!verified) return { success: false, reason: "invalid_signature" };
  } catch {
    return { success: false, reason: "invalid_signature" };
  }

  // E31: reject if oldPubkey already has a forward migration on-chain.
  // Symmetric to E29's restore-eligibility check: a key that has been
  // rotated away is permanently retired for BSVibes' purposes. Without
  // this guard, anyone holding any past WIF could sign a new migration
  // and OVERWRITE the legitimate rotation (INSERT OR REPLACE below would
  // silently take over the chain head). See DECISIONS.md "E31 block
  // rotate-from-stale" + SECURITY_AUDIT.md BUG-11.
  try {
    const forward = await getForwardMigration(oldPubkey);
    if (forward) {
      console.warn(
        `[BSVibes] migrateIdentity: rejecting rotation from stale key ${oldPubkey.slice(0, 16)}… (already rotated to ${forward.toPubkey.slice(0, 16)}…)`
      );
      return { success: false, reason: "stale_key" };
    }
  } catch (e) {
    // Lookup failure: fail CLOSED here (not open) because allowing the
    // migrate through without the staleness check would re-open the very
    // bug E31 closes. Server-side DB error → reject the rotation; the
    // user retries later when the DB is healthy. This is one of the few
    // places fail-open would be the wrong default.
    console.error("[BSVibes] migrateIdentity: getForwardMigration error — rejecting", e);
    return { success: false, reason: "stale_key" };
  }

  // C7 fix: before replacing the migration row, check whether the existing to_pubkey
  // has any posts in the database. If it does, those posts would be orphaned (no migration
  // chain back to the contributor) once we overwrite the A→B row with A→C. Guard against
  // this by inserting a bridging migration B→C first so the full chain A→B→C is preserved.
  db.transaction(() => {
    const existingMigration = db
      .prepare("SELECT to_pubkey FROM migrations WHERE from_pubkey = ?")
      .get(oldPubkey) as { to_pubkey: string } | undefined;

    if (existingMigration) {
      const intermediatePubkey = existingMigration.to_pubkey;
      // Only bridge if the intermediate key actually posted something.
      const postCount = (
        db
          .prepare("SELECT COUNT(*) as count FROM posts WHERE pubkey = ?")
          .get(intermediatePubkey) as { count: number }
      ).count;

      if (postCount > 0) {
        // Insert bridging migration: intermediate → new. Use INSERT OR IGNORE so
        // a previously-recorded bridge is left intact with its own signature.
        db.prepare(
          "INSERT OR IGNORE INTO migrations (from_pubkey, to_pubkey, signature) VALUES (?, ?, ?)"
        ).run(intermediatePubkey, newPubkey, migrationSig);
      }
    }

    // Now replace (or insert) the original migration row pointing old → new.
    db.prepare(
      "INSERT OR REPLACE INTO migrations (from_pubkey, to_pubkey, signature) VALUES (?, ?, ?)"
    ).run(oldPubkey, newPubkey, migrationSig);
  })();

  // Fire-and-forget: post migration on-chain
  postMigrationOnChain({
    oldPubkey,
    newPubkey,
    migrationMessage,
    migrationSignature: migrationSig,
  })
    .then((txid) => {
      if (txid) {
        db.prepare("UPDATE migrations SET tx_id = ? WHERE from_pubkey = ? AND to_pubkey = ?").run(
          txid,
          oldPubkey,
          newPubkey
        );
      }
    })
    .catch(() => {
      // On-chain logging is best-effort
    });

  return { success: true };
}

/**
 * Verify that all pubkeys belonging to the caller's identity-set resolve to
 * the given currentPubkey via the migration chain. Returns healthy=true if
 * the caller's previous identities all resolve forward to currentPubkey,
 * or orphanedCount > 0 if any of the caller's prior pubkeys don't reach it.
 *
 * IMPORTANT: scoped to the caller's identity-set (transitive ancestors of
 * currentPubkey in the migration graph). Does NOT scan all posts/migrations
 * globally — that would count other users' migrations as orphaned.
 *
 * Called before key rotations to warn the user if rotating would orphan
 * their own posts.
 *
 * Scoped to caller's identity set — do NOT generalize this to global stats.
 */
export async function verifyMigrationChain(
  currentPubkey: string
): Promise<{ healthy: boolean; orphanedCount: number }> {
  // Build forward + reverse migration maps from the global migration table.
  // (Unique index on migrations.from_pubkey guarantees one outgoing edge per
  // source pubkey — see db.ts. So forward.set is safe to do unconditionally.)
  const migrations = db
    .prepare("SELECT from_pubkey, to_pubkey FROM migrations ORDER BY id ASC")
    .all() as Array<{ from_pubkey: string; to_pubkey: string }>;

  const forward = new Map<string, string>();
  const reverse = new Map<string, string[]>();
  for (const m of migrations) {
    forward.set(m.from_pubkey, m.to_pubkey);
    const list = reverse.get(m.to_pubkey);
    if (list) list.push(m.from_pubkey);
    else reverse.set(m.to_pubkey, [m.from_pubkey]);
  }

  // Resolve chains forward to terminus.
  function resolve(pubkey: string): string {
    let current = pubkey;
    const visited = new Set<string>();
    while (forward.has(current) && !visited.has(current)) {
      visited.add(current);
      current = forward.get(current) ?? current;
    }
    return current;
  }

  // Walk the reverse map from currentPubkey to collect ALL transitive
  // ancestors — every pubkey that eventually leads to currentPubkey going
  // forward. This is the caller's identity-set ("mine"). For a brand-new
  // identity with no migrations, mine = {currentPubkey}.
  const mine = new Set<string>([currentPubkey]);
  const queue: string[] = [currentPubkey];
  while (queue.length > 0) {
    const pubkey = queue.shift();
    if (!pubkey) break;
    const ancestors = reverse.get(pubkey);
    if (!ancestors) continue;
    for (const ancestor of ancestors) {
      if (!mine.has(ancestor)) {
        mine.add(ancestor);
        queue.push(ancestor);
      }
    }
  }

  // Count this user's previous pubkeys that have posts AND don't resolve to
  // currentPubkey. With proper scoping, the only failure mode is a forked or
  // broken chain — the actual case the warning exists to surface.
  let orphanedCount = 0;
  for (const pubkey of mine) {
    if (pubkey === currentPubkey) continue; // current is by definition not orphaned
    if (resolve(pubkey) !== currentPubkey) {
      // Only count if this pubkey actually has posts (orphaning a pubkey with
      // zero posts has no user-visible impact).
      const postCount = db
        .prepare("SELECT COUNT(*) as count FROM posts WHERE pubkey = ?")
        .get(pubkey) as { count: number };
      if (postCount.count > 0) {
        orphanedCount++;
      }
    }
  }

  return { healthy: orphanedCount === 0, orphanedCount };
}
