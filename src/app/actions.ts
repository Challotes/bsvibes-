'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';

interface PostRow {
  id: number;
  content: string;
  author_name: string;
  signature: string | null;
  pubkey: string | null;
  tx_id: string | null;
  created_at: string;
}

function generateAnonName(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `anon_${suffix}`;
}

export async function createPost(formData: FormData): Promise<void> {
  const content = formData.get('content');
  if (typeof content !== 'string' || content.trim().length === 0) return;
  if (content.length > 1000) return;

  const author = formData.get('author');
  const authorName = typeof author === 'string' && /^anon_[a-z0-9]{4}$/.test(author)
    ? author
    : generateAnonName();

  const signature = formData.get('signature');
  const pubkey = formData.get('pubkey');

  db.prepare(
    'INSERT INTO posts (content, author_name, signature, pubkey) VALUES (?, ?, ?, ?)'
  ).run(
    content.trim(),
    authorName,
    typeof signature === 'string' ? signature : null,
    typeof pubkey === 'string' ? pubkey : null
  );

  revalidatePath('/');
}

export async function getPosts(): Promise<(PostRow & { boot_count: number })[]> {
  return db.prepare(`
    SELECT p.*, COALESCE(bc.boot_count, 0) as boot_count
    FROM posts p
    LEFT JOIN (SELECT post_id, COUNT(*) as boot_count FROM bootboard GROUP BY post_id) bc
      ON bc.post_id = p.id
    ORDER BY p.created_at DESC
    LIMIT 100
  `).all() as (PostRow & { boot_count: number })[];
}

interface BootboardRow {
  id: number;
  post_id: number;
  boosted_by: string;
  booted_at: string;
  held_until: string | null;
  content: string;
  author_name: string;
  signature: string | null;
}

interface BootboardHistoryRow {
  post_id: number;
  boosted_by: string;
  booted_at: string;
  held_until: string;
  duration_seconds: number;
  content: string;
  author_name: string;
}

export async function getBootboard(): Promise<{
  current: BootboardRow | null;
  history: BootboardHistoryRow[];
  totalBoots: number;
}> {
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

  // Close out current bootboard holder
  db.prepare(`
    UPDATE bootboard SET held_until = datetime('now')
    WHERE held_until IS NULL
  `).run();

  // New post takes the spot
  db.prepare(`
    INSERT INTO bootboard (post_id, boosted_by) VALUES (?, ?)
  `).run(postId, boostedBy);

  const processingMs = Math.round((performance.now() - start) * 100) / 100;

  revalidatePath('/');
  return { processingMs };
}
