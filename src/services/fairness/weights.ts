/**
 * Contribution weight calculation.
 * sqrt(engagement) × time_decay per post, summed per contributor.
 * Resolves migration chains so upgraded users keep their history.
 */

import { FAIRNESS_CONFIG } from './config';
import { PublicKey } from '@bsv/sdk';

const { halfLifeDays, engagementMultiplier, scalingFn } = FAIRNESS_CONFIG;

// Cache weights to avoid full table scan on every boot.
// Invalidated after 30 seconds — weights only change when posts or boots change.
const WEIGHTS_CACHE_TTL_MS = 30_000;
let _cachedWeights: ContributorWeight[] | null = null;
let _weightsCachedAt = 0;

export interface ContributorWeight {
  pubkey: string;
  address: string;
  weight: number;
  postCount: number;
  totalBoots: number;
}

interface PostRow {
  pubkey: string;
  boot_count: number;
  created_at: string;
}

interface MigrationRow {
  from_pubkey: string;
  to_pubkey: string;
}

/**
 * Build a map from any old pubkey to its final (current) pubkey
 * by following the migration chain.
 *
 * Handles duplicate migrations from the same key (e.g. two upgrade attempts
 * from the same old key). In that case:
 *  - We collect ALL forward links as a multi-map (from → [to, to, ...])
 *  - For keys with multiple destinations, we pick the LATEST migration
 *    (highest DB id) as the canonical forward link
 *  - We also cover intermediate keys: if A→B and A→C both exist (A→C won),
 *    we add B→C so contributions from the intermediate key B are attributed to C
 *
 * Also detects and breaks cycles (defensive — should never occur in practice).
 */
function buildMigrationMap(db: import('better-sqlite3').Database): Map<string, string> {
  const migrations = db.prepare(
    'SELECT from_pubkey, to_pubkey FROM migrations ORDER BY id ASC'
  ).all() as MigrationRow[];

  // Build forward links — later rows overwrite earlier rows for the same from_pubkey,
  // so the latest migration from any given key always wins.
  const forward = new Map<string, string>();
  for (const m of migrations) {
    const existing = forward.get(m.from_pubkey);
    if (existing && existing !== m.to_pubkey) {
      // This is a re-upgrade: old key migrated again to a different destination.
      // The new destination takes over. We also need to route the previous
      // intermediate key (existing) to the new destination so contributions
      // made on the intermediate key are not orphaned.
      if (!forward.has(existing)) {
        forward.set(existing, m.to_pubkey);
      }
    }
    forward.set(m.from_pubkey, m.to_pubkey);
  }

  // Resolve chains: follow from_pubkey → to_pubkey → ... until no more hops.
  // visited set prevents infinite loops from any unexpected cycle.
  const resolved = new Map<string, string>();
  for (const key of forward.keys()) {
    let current = key;
    const visited = new Set<string>();
    while (forward.has(current) && !visited.has(current)) {
      visited.add(current);
      current = forward.get(current)!;
    }
    resolved.set(key, current);
  }

  return resolved;
}

/**
 * Derive BSV address from a pubkey string.
 */
function pubkeyToAddress(pubkey: string): string {
  try {
    return PublicKey.fromString(pubkey).toAddress().toString();
  } catch {
    return '';
  }
}

/**
 * Calculate contribution weights for all active contributors.
 * Results are cached for 30 seconds to avoid repeated full table scans.
 */
export function calculateWeights(db: import('better-sqlite3').Database): ContributorWeight[] {
  const now = Date.now();
  if (_cachedWeights && now - _weightsCachedAt < WEIGHTS_CACHE_TTL_MS) {
    return _cachedWeights;
  }

  const migrationMap = buildMigrationMap(db);

  // Get all signed posts with boot counts
  const posts = db.prepare(`
    SELECT p.pubkey, COALESCE(bc.boot_count, 0) as boot_count, p.created_at
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    WHERE p.pubkey IS NOT NULL
  `).all() as PostRow[];

  // Aggregate weights by resolved pubkey
  const byPubkey = new Map<string, { weight: number; posts: number; boots: number }>();

  for (const post of posts) {
    // Resolve migration: use the latest pubkey in the chain
    const resolvedPubkey = migrationMap.get(post.pubkey) ?? post.pubkey;

    const ageDays = (now - new Date(post.created_at.replace(' ', 'T') + 'Z').getTime()) / 86_400_000;
    const decay = Math.pow(0.5, ageDays / halfLifeDays);
    const engagement = 1 + (post.boot_count * engagementMultiplier);
    const postWeight = scalingFn(engagement) * decay;

    const entry = byPubkey.get(resolvedPubkey) ?? { weight: 0, posts: 0, boots: 0 };
    entry.weight += postWeight;
    entry.posts += 1;
    entry.boots += post.boot_count;
    byPubkey.set(resolvedPubkey, entry);
  }

  const result = Array.from(byPubkey.entries())
    .filter(([, data]) => data.weight > 0)
    .map(([pubkey, data]) => ({
      pubkey,
      address: pubkeyToAddress(pubkey),
      weight: data.weight,
      postCount: data.posts,
      totalBoots: data.boots,
    }))
    .filter((c) => c.address !== ''); // Exclude invalid pubkeys

  _cachedWeights = result;
  _weightsCachedAt = now;
  return result;
}
