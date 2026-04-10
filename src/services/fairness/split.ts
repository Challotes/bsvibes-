/**
 * Payout split calculation — true no-custody.
 * Every sat in = every sat out in the same transaction.
 */

import { FAIRNESS_CONFIG } from "./config";
import type { ContributorWeight } from "./weights";

export interface SplitRecipient {
  pubkey: string;
  address: string;
  sats: number;
  type: "pool_share" | "boost_bonus" | "platform";
}

export interface SplitResult {
  platform: SplitRecipient;
  creatorBonus: SplitRecipient;
  pool: SplitRecipient[];
  totalDistributed: number;
  recipientCount: number;
}

/**
 * Calculate the payout split for a boot.
 * True no-custody: everyone gets paid, even 1 sat. No accumulation.
 */
export function calculateSplit(
  bootFeeSats: number,
  boostedPostPubkey: string,
  boostedPostAddress: string,
  platformAddress: string,
  weights: ContributorWeight[]
): SplitResult {
  const { platformCut, creatorBonus } = FAIRNESS_CONFIG;

  const platformSats = Math.floor(bootFeeSats * platformCut);
  const bonusSats = Math.floor(bootFeeSats * creatorBonus);
  const poolSats = bootFeeSats - platformSats - bonusSats;

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

  const pool: SplitRecipient[] = [];
  let distributedPool = 0;

  if (totalWeight > 0) {
    for (const contributor of weights) {
      const share = Math.floor(poolSats * (contributor.weight / totalWeight));
      if (share > 0) {
        pool.push({
          pubkey: contributor.pubkey,
          address: contributor.address,
          sats: share,
          type: "pool_share",
        });
        distributedPool += share;
      }
    }
  }

  // Remainder from rounding goes to the boosted post creator
  const remainder = poolSats - distributedPool;

  // Creator gets bonus + any rounding remainder.
  // When pool is empty, remainder already equals poolSats (the full pool),
  // so no extra addition is needed.
  const creatorTotal = bonusSats + remainder;

  // Check if creator is already in the pool — if so, combine their amounts
  const creatorPoolEntry = pool.find((p) => p.pubkey === boostedPostPubkey);
  if (creatorPoolEntry) {
    creatorPoolEntry.sats += bonusSats + remainder;
    creatorPoolEntry.type = "boost_bonus"; // Mark as bonus recipient
  }

  const creatorBonusEntry: SplitRecipient = creatorPoolEntry
    ? { pubkey: boostedPostPubkey, address: boostedPostAddress, sats: 0, type: "boost_bonus" }
    : {
        pubkey: boostedPostPubkey,
        address: boostedPostAddress,
        sats: creatorTotal,
        type: "boost_bonus",
      };

  const platformEntry: SplitRecipient = {
    pubkey: "platform",
    address: platformAddress,
    sats: platformSats,
    type: "platform",
  };

  // Build final recipient list (deduplicated — creator might be in pool already)
  const allRecipients = [
    platformEntry,
    ...(creatorPoolEntry ? [] : [creatorBonusEntry]),
    ...pool,
  ].filter((r) => r.sats > 0);

  return {
    platform: platformEntry,
    creatorBonus: creatorBonusEntry,
    pool,
    totalDistributed: allRecipients.reduce((sum, r) => sum + r.sats, 0),
    recipientCount: allRecipients.length,
  };
}
