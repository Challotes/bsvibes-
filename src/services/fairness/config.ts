/**
 * Tunable fairness parameters — the governance surface.
 * Phase 1: hardcoded. Phase 2+: AI agent suggests/adjusts within ranges.
 */

export const FAIRNESS_CONFIG = {
  platformCut: 0.05,
  creatorBonus: 0.15,
  poolShare: 0.8,
  halfLifeDays: 30,
  engagementMultiplier: 1.5,
  scalingFn: Math.sqrt,
  bootPriceFloor: 1_000,
  bootPriceCeiling: 250_000,
  satsPerContributor: 156,
  priceCacheTtlMs: 60 * 60 * 1000,
  activeWindowDays: 30,
  // Phase 4: count only pubkeys with >= this many posts in the window toward the
  // dynamic boot price, so drive-by fake identities (one post each) can't inflate
  // the price real payers face. A genuine contributor crosses it; a spammer
  // minting one identity per post does not.
  minPostsForPricing: 3,
  // Launch pool epoch — the instant the fresh pool "opens". Posts whose created_at
  // is BEFORE this are pre-launch history: the backdated genesis seed + pre-launch
  // test posts. They are EXCLUDED from BOTH the 80% pool weight (weights.ts) and
  // the dynamic boot-price contributor count (pricing.ts), so the pool starts
  // fresh at launch. They STILL earn the pool-independent 15% creator bonus when
  // boosted (split.ts pays that by address, no gate). This is the pool's EPOCH,
  // not a temporary flag — PERMANENT by design (see the genesis plan / DECISIONS.md).
  // MUST be SQLite space-format UTC "YYYY-MM-DD HH:MM:SS" so it compares correctly
  // (BINARY collation → lexicographic == chronological) against posts.created_at,
  // which datetime('now') writes in the same UTC format. Set LAUNCH_TS at deploy to
  // the TRUE launch instant IN UTC (a blocking LAUNCH_CHECKLIST step). The fallback
  // is a far-future sentinel: if LAUNCH_TS is unset the pool stays empty (floor
  // price) rather than leaking pre-launch posts into real payouts — fail-closed on
  // the money path.
  launchTs: process.env.LAUNCH_TS ?? "2999-01-01 00:00:00",
  freeBootsPerUser: 15,
  // Server-wallet ops threshold (Phase 2 Build B): emit a low-balance alert when
  // the server wallet's spendable balance drops below this, so the operator can
  // top up BEFORE free boots start routing to paid.
  serverLowBalanceAlertSats: 10_000,
  formulaVersion: "0.1.0",
} as const;
