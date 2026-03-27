/**
 * Full boot workflow coordinator.
 * Validates → prices → scores → splits → broadcasts → records.
 * SQLite bootboard only updates AFTER successful BSV broadcast.
 */

import type BetterSqlite3 from 'better-sqlite3';
import { getBootPrice, getBootPriceForUser } from './pricing';
import { calculateWeights } from './weights';
import { calculateSplit } from './split';
import { buildSplitTransaction } from './boot-payment';
import { FAIRNESS_CONFIG } from './config';
import { getServerAddress } from '@/services/bsv/wallet';

export interface BootResult {
  success: boolean;
  txid?: string;
  price: number;
  recipients: number;
  error?: string;
  isFree: boolean;
}

/**
 * Execute a full boot: validate, price, score, split, broadcast, record.
 */
export async function executeBoot(
  db: BetterSqlite3.Database,
  postId: number,
  booterPubkey: string
): Promise<BootResult> {
  // 1. Validate the post exists and is boostable (has pubkey)
  const post = db.prepare(
    'SELECT id, pubkey, author_name FROM posts WHERE id = ?'
  ).get(postId) as { id: number; pubkey: string | null; author_name: string } | undefined;

  if (!post) return { success: false, price: 0, recipients: 0, error: 'Post not found', isFree: false };
  if (!post.pubkey) return { success: false, price: 0, recipients: 0, error: 'Post is unsigned — cannot be booted', isFree: false };

  // 2. Check server wallet — if not configured, do SQLite-only boot (no on-chain split)
  const platformAddress = getServerAddress();

  // 3. Get dynamic price and check free boot eligibility
  const { price, isFree, freeRemaining } = getBootPriceForUser(db, booterPubkey);
  const actualPrice = isFree ? getBootPrice(db) : price; // Free boots still cost the server the dynamic price

  // 4. Calculate contribution weights (with migration chain resolution)
  const weights = calculateWeights(db);

  // 5. Derive boosted post creator's address from their pubkey
  let creatorAddress: string;
  try {
    const { PublicKey } = await import('@bsv/sdk');
    creatorAddress = PublicKey.fromString(post.pubkey).toAddress().toString();
  } catch {
    return { success: false, price: actualPrice, recipients: 0, error: 'Invalid creator pubkey', isFree };
  }

  // 6. Calculate the split (if wallet is configured)
  let txid: string | undefined;
  let recipientCount = 0;

  if (platformAddress) {
    const split = calculateSplit(
      actualPrice,
      post.pubkey,
      creatorAddress,
      platformAddress,
      weights
    );

    // 7. Build and broadcast the BSV split transaction
    const result = await buildSplitTransaction(split, postId);

    if (result.status === 'success') {
      txid = result.txid;
      recipientCount = split.recipientCount;
    }
    // If broadcast fails, we still proceed with the SQLite boot (graceful degradation)
  }

  // 8. Update SQLite (bootboard + grants + payouts)
  db.transaction(() => {
    // Close current bootboard holder
    db.prepare(`
      UPDATE bootboard SET held_until = datetime('now')
      WHERE held_until IS NULL
    `).run();

    // New post takes the spot
    db.prepare(`
      INSERT INTO bootboard (post_id, boosted_by) VALUES (?, ?)
    `).run(postId, booterPubkey);

    // Update free boot grants
    const existing = db.prepare('SELECT pubkey FROM boot_grants WHERE pubkey = ?').get(booterPubkey);
    if (isFree) {
      if (existing) {
        db.prepare('UPDATE boot_grants SET free_boots_used = free_boots_used + 1, total_boots = total_boots + 1 WHERE pubkey = ?').run(booterPubkey);
      } else {
        db.prepare('INSERT INTO boot_grants (pubkey, free_boots_used, total_boots) VALUES (?, 1, 1)').run(booterPubkey);
      }
    } else {
      if (existing) {
        db.prepare('UPDATE boot_grants SET total_boots = total_boots + 1 WHERE pubkey = ?').run(booterPubkey);
      } else {
        db.prepare('INSERT INTO boot_grants (pubkey, free_boots_used, total_boots) VALUES (?, 0, 1)').run(booterPubkey);
      }
    }
  })();

  return {
    success: true,
    txid,
    price: actualPrice,
    recipients: recipientCount,
    isFree,
  };
}
