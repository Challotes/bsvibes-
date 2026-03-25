// Shared domain types for BSVibes.

export interface Identity {
  name: string;
  address: string;
  wif: string;
}

// ── Posts ──────────────────────────────────────────────────────────────────

export interface PostRow {
  id: number;
  content: string;
  author_name: string;
  signature: string | null;
  pubkey: string | null;
  tx_id: string | null;
  created_at: string;
}

export type Post = PostRow & { boot_count: number };

// ── Bootboard ──────────────────────────────────────────────────────────────

export interface BootboardRow {
  id: number;
  post_id: number;
  boosted_by: string;
  booted_at: string;
  held_until: string | null;
  content: string;
  author_name: string;
  signature: string | null;
}

export interface BootboardHistoryRow {
  post_id: number;
  boosted_by: string;
  booted_at: string;
  held_until: string;
  duration_seconds: number;
  content: string;
  author_name: string;
}

export interface BootboardData {
  current: BootboardRow | null;
  history: BootboardHistoryRow[];
  totalBoots: number;
}
