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

export async function getPosts(): Promise<PostRow[]> {
  return db.prepare(
    'SELECT * FROM posts ORDER BY created_at DESC LIMIT 100'
  ).all() as PostRow[];
}
