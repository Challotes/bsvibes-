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

  // 2. Check server wallet
  const platformAddress = getServerAddress();
  if (!platformAddress) return { success: false, price: 0, recipients: 0, error: 'Server wallet not configured', isFree: false };

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

  // 6. Calculate the split
  const split = calculateSplit(
    actualPrice,
    post.pubkey,
    creatorAddress,
    platformAddress,
    weights
  );

  // 7. Build and broadcast the BSV split transaction
  const result = await buildSplitTransaction(split, postId);

  if (result.status !== 'success') {
    return {
      success: false,
      price: actualPrice,
      recipients: 0,
      error: result.status === 'insufficient_funds'
        ? 'Server wallet has insufficient funds'
        : result.status === 'broadcast_failed' ? result.error : result.status,
      isFree,
    };
  }

  // 8. BSV broadcast succeeded — now update SQLite (bootboard + grants + payouts)
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
    if (isFree) {
      const existing = db.prepare('SELECT pubkey FROM boot_grants WHERE pubkey = ?').get(booterPubkey);
      if (existing) {
        db.prepare('UPDATE boot_grants SET free_boots_used = free_boots_used + 1, total_boots = total_boots + 1 WHERE pubkey = ?').run(booterPubkey);
      } else {
        db.prepare('INSERT INTO boot_grants (pubkey, free_boots_used, total_boots) VALUES (?, 1, 1)').run(booterPubkey);
      }
    } else {
      const existing = db.prepare('SELECT pubkey FROM boot_grants WHERE pubkey = ?').get(booterPubkey);
      if (existing) {
        db.prepare('UPDATE boot_grants SET total_boots = total_boots + 1 WHERE pubkey = ?').run(booterPubkey);
      } else {
        db.prepare('INSERT INTO boot_grants (pubkey, free_boots_used, total_boots) VALUES (?, 0, 1)').run(booterPubkey);
      }
    }

    // Record payouts for audit trail
    const bootEventId = postId; // Use post_id as boot event identifier for simplicity

    // Platform payout
    if (split.platform.sats > 0) {
      db.prepare(
        'INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(bootEventId, 'platform', split.platform.address, split.platform.sats, 'platform', result.txid);
    }

    // Creator bonus
    if (split.creatorBonus.sats > 0) {
      db.prepare(
        'INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(bootEventId, split.creatorBonus.pubkey, split.creatorBonus.address, split.creatorBonus.sats, 'boost_bonus', result.txid);
    }

    // Pool shares
    for (const recipient of split.pool) {
      if (recipient.sats > 0) {
        db.prepare(
          'INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(bootEventId, recipient.pubkey, recipient.address, recipient.sats, 'pool_share', result.txid);
      }
    }
  })();

  return {
    success: true,
    txid: result.txid,
    price: actualPrice,
    recipients: split.recipientCount,
    isFree,
  };
}
