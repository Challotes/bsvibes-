'use server';

import { db } from '@/lib/db';
import { generateAnonName } from '@/lib/utils';
import { rateLimit } from '@/lib/rate-limit';
import { PublicKey, Signature } from '@bsv/sdk';
import { logPostOnChain } from '@/services/bsv/onchain';
import type { Post, BootboardRow, BootboardHistoryRow, BootboardData } from '@/types';

export async function createPost(formData: FormData): Promise<void> {
  const content = formData.get('content');
  if (typeof content !== 'string' || content.trim().length === 0) return;
  if (content.length > 1000) return;

  const author = formData.get('author');
  const authorName = typeof author === 'string' && /^anon_[a-z0-9]{4}$/.test(author)
    ? author
    : generateAnonName();

  // 10 posts per minute per author.
  const rl = rateLimit(`createPost:${authorName}`, { limit: 10, windowMs: 60_000 });
  if (!rl.success) return;

  const signature = formData.get('signature');
  const pubkey = formData.get('pubkey');

  // Verify signature server-side if both signature and pubkey are present.
  // Unsigned posts are still allowed (signature/pubkey will be null).
  if (typeof signature === 'string' && typeof pubkey === 'string') {
    try {
      const messageBytes = Array.from(new TextEncoder().encode(content.trim()));
      const verified = PublicKey.fromString(pubkey).verify(
        messageBytes,
        Signature.fromDER(signature, 'hex'),
      );
      if (!verified) return;
    } catch {
      return;
    }
  }

  const result = db.prepare(
    'INSERT INTO posts (content, author_name, signature, pubkey) VALUES (?, ?, ?, ?)'
  ).run(
    content.trim(),
    authorName,
    typeof signature === 'string' ? signature : null,
    typeof pubkey === 'string' ? pubkey : null
  );

  // Fire-and-forget: log on-chain, update tx_id if successful
  const postId = result.lastInsertRowid as number;
  const trimmedContent = content.trim();
  const sigStr = typeof signature === 'string' ? signature : null;
  const pkStr = typeof pubkey === 'string' ? pubkey : null;

  logPostOnChain({ content: trimmedContent, author: authorName, signature: sigStr, pubkey: pkStr })
    .then((txid) => {
      if (txid) {
        db.prepare('UPDATE posts SET tx_id = ? WHERE id = ?').run(txid, postId);
      }
    })
    .catch(() => {
      // On-chain logging is best-effort — post still exists in SQLite
    });
}

export async function getPosts(beforeId?: number): Promise<Post[]> {
  if (beforeId !== undefined) {
    return db.prepare(`
      SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
      FROM posts p
      LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
        ON bc.post_id = p.id
      WHERE p.id < ?
      ORDER BY p.id DESC
      LIMIT 100
    `).all(beforeId) as Post[];
  }
  return db.prepare(`
    SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    ORDER BY p.id DESC
    LIMIT 100
  `).all() as Post[];
}

export async function getNewPosts(sinceId: number): Promise<Post[]> {
  if (!Number.isInteger(sinceId) || sinceId < 0) return [];
  return db.prepare(`
    SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    WHERE p.id > ?
    ORDER BY p.id DESC
  `).all(sinceId) as Post[];
}

export async function getOlderPosts(beforeId: number): Promise<Post[]> {
  if (!Number.isInteger(beforeId) || beforeId <= 0) return [];
  return getPosts(beforeId);
}

export async function getBootboard(): Promise<BootboardData> {
  const current = db.prepare(`
    SELECT b.*, p.content, p.author_name, p.signature
    FROM bootboard b
    JOIN posts p ON p.id = b.post_id
    WHERE b.held_until IS NULL
    ORDER BY b.booted_at DESC
    LIMIT 1
  `).get() as BootboardRow | undefined;

  const history = db.prepare(`
    SELECT b.post_id, b.boosted_by, b.booted_at, b.held_until,
      CAST((julianday(b.held_until) - julianday(b.booted_at)) * 86400 AS INTEGER) as duration_seconds,
      p.content, p.author_name
    FROM bootboard b
    JOIN posts p ON p.id = b.post_id
    WHERE b.held_until IS NOT NULL
    ORDER BY b.held_until DESC
    LIMIT 50
  `).all() as BootboardHistoryRow[];

  const stats = db.prepare(`
    SELECT COUNT(*) as total_boots FROM bootboard
  `).get() as { total_boots: number };

  return { current: current ?? null, history, totalBoots: stats.total_boots };
}

export async function bootPost(postId: number, boostedBy: string): Promise<{ processingMs: number }> {
  const start = performance.now();

  // Input validation
  if (!Number.isInteger(postId) || postId <= 0) return { processingMs: 0 };
  if (
    typeof boostedBy !== 'string' ||
    boostedBy.length > 20 ||
    !/^anon_[a-z0-9]{4}$/.test(boostedBy)
  ) return { processingMs: 0 };

  // 5 boots per minute per caller.
  const rl = rateLimit(`bootPost:${boostedBy}`, { limit: 5, windowMs: 60_000 });
  if (!rl.success) return { processingMs: 0 };

  const processingMs = db.transaction(() => {
    // Validate postId exists
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
    if (!post) return null;

    // Close out current bootboard holder
    db.prepare(`
      UPDATE bootboard SET held_until = datetime('now')
      WHERE held_until IS NULL
    `).run();

    // New post takes the spot
    db.prepare(`
      INSERT INTO bootboard (post_id, boosted_by) VALUES (?, ?)
    `).run(postId, boostedBy);

    return Math.round((performance.now() - start) * 100) / 100;
  })();

  if (processingMs === null) return { processingMs: 0 };

  return { processingMs };
}
