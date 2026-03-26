/**
 * Contribution weight calculation.
 * sqrt(engagement) × time_decay per post, summed per contributor.
 * Resolves migration chains so upgraded users keep their history.
 */

import { FAIRNESS_CONFIG } from './config';
import { PublicKey } from '@bsv/sdk';

const { halfLifeDays, engagementMultiplier, scalingFn } = FAIRNESS_CONFIG;

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
 */
function buildMigrationMap(db: import('better-sqlite3').Database): Map<string, string> {
  const migrations = db.prepare(
    'SELECT from_pubkey, to_pubkey FROM migrations'
  ).all() as MigrationRow[];

  // Build forward links
  const forward = new Map<string, string>();
  for (const m of migrations) {
    forward.set(m.from_pubkey, m.to_pubkey);
  }

  // Resolve chains: follow from_pubkey → to_pubkey → ... until no more hops
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
 */
export function calculateWeights(db: import('better-sqlite3').Database): ContributorWeight[] {
  const migrationMap = buildMigrationMap(db);
  const now = Date.now();

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

    const ageDays = (now - new Date(post.created_at + 'Z').getTime()) / 86_400_000;
    const decay = Math.pow(0.5, ageDays / halfLifeDays);
    const engagement = 1 + (post.boot_count * engagementMultiplier);
    const postWeight = scalingFn(engagement) * decay;

    const entry = byPubkey.get(resolvedPubkey) ?? { weight: 0, posts: 0, boots: 0 };
    entry.weight += postWeight;
    entry.posts += 1;
    entry.boots += post.boot_count;
    byPubkey.set(resolvedPubkey, entry);
  }

  return Array.from(byPubkey.entries())
    .filter(([, data]) => data.weight > 0)
    .map(([pubkey, data]) => ({
      pubkey,
      address: pubkeyToAddress(pubkey),
      weight: data.weight,
      postCount: data.posts,
      totalBoots: data.boots,
    }))
    .filter((c) => c.address !== ''); // Exclude invalid pubkeys
}
