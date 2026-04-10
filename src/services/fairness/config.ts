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
  freeBootsPerUser: 15,
  formulaVersion: "0.1.0",
} as const;
