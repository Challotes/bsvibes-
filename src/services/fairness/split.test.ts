import { describe, expect, it } from "vitest";
import { calculateSplit } from "./split";
import type { ContributorWeight } from "./weights";

function makeWeight(pubkey: string, address: string, weight: number): ContributorWeight {
  return { pubkey, address, weight, postCount: 1, totalBoots: 0 };
}

describe("calculateSplit", () => {
  const platformAddr = "1Platform";
  const creatorPub = "creatorPub";
  const creatorAddr = "1Creator";

  it("distributes all sats — nothing lost to rounding", () => {
    const weights = [makeWeight("a", "1A", 10), makeWeight("b", "1B", 5), makeWeight("c", "1C", 3)];
    const result = calculateSplit(10_000, creatorPub, creatorAddr, platformAddr, weights);

    // totalDistributed must equal bootFeeSats — no sats leak
    expect(result.totalDistributed).toBe(10_000);
  });

  it("applies correct percentage splits", () => {
    const weights = [makeWeight("a", "1A", 1)];
    const result = calculateSplit(10_000, creatorPub, creatorAddr, platformAddr, weights);

    // Platform: 5% = 500
    expect(result.platform.sats).toBe(500);
    // Creator bonus: 15% = 1500 + rounding remainder
    // Pool: 80% = 8000, distributed to 'a'
    expect(result.pool[0].sats).toBe(8000);
    // Creator bonus gets the 1500 + any remainder
    expect(result.creatorBonus.sats).toBe(1500);
    expect(result.totalDistributed).toBe(10_000);
  });

  it("handles zero contributors — creator gets entire pool + bonus", () => {
    const result = calculateSplit(10_000, creatorPub, creatorAddr, platformAddr, []);

    expect(result.platform.sats).toBe(500);
    expect(result.pool).toHaveLength(0);
    // Creator gets bonus (1500) + entire pool (8000) as remainder
    expect(result.creatorBonus.sats).toBe(9500);
    expect(result.totalDistributed).toBe(10_000);
  });

  it("handles single contributor who is also the creator", () => {
    const weights = [makeWeight(creatorPub, creatorAddr, 10)];
    const result = calculateSplit(10_000, creatorPub, creatorAddr, platformAddr, weights);

    // Creator is in pool — their pool share gets merged with bonus
    expect(result.platform.sats).toBe(500);
    // Creator's pool entry should have pool share + bonus + remainder
    const creatorInPool = result.pool.find((p) => p.pubkey === creatorPub);
    expect(creatorInPool).toBeTruthy();
    expect(creatorInPool?.sats).toBe(9500); // 8000 pool + 1500 bonus + 0 remainder
    // creatorBonus entry should be 0 (merged into pool)
    expect(result.creatorBonus.sats).toBe(0);
    expect(result.totalDistributed).toBe(10_000);
  });

  it("handles minimum boot price (1000 sats)", () => {
    const weights = [makeWeight("a", "1A", 1)];
    const result = calculateSplit(1_000, creatorPub, creatorAddr, platformAddr, weights);

    expect(result.platform.sats).toBe(50); // 5% of 1000
    expect(result.totalDistributed).toBe(1_000);
  });

  it("handles odd amounts with rounding — remainder goes to creator", () => {
    // 999 sats: platform=49, bonus=149, pool=801
    // With 3 equal-weight contributors: 801/3 = 267 each = 801, remainder=0
    const weights = [makeWeight("a", "1A", 1), makeWeight("b", "1B", 1), makeWeight("c", "1C", 1)];
    const result = calculateSplit(999, creatorPub, creatorAddr, platformAddr, weights);

    expect(result.platform.sats).toBe(49);
    // Pool: 999 - 49 - 149 = 801. Each gets floor(801/3) = 267. Distributed = 801. Remainder = 0.
    expect(result.pool.reduce((s, r) => s + r.sats, 0)).toBe(801);
    expect(result.creatorBonus.sats).toBe(149); // 149 bonus + 0 remainder
    expect(result.totalDistributed).toBe(999);
  });

  it("handles very unequal weights", () => {
    const weights = [makeWeight("a", "1A", 100), makeWeight("b", "1B", 1)];
    const result = calculateSplit(10_000, creatorPub, creatorAddr, platformAddr, weights);

    // 'a' should get ~99% of pool, 'b' ~1%
    const aShare = result.pool.find((p) => p.pubkey === "a")?.sats;
    const bShare = result.pool.find((p) => p.pubkey === "b")?.sats;
    expect(aShare).toBeGreaterThan((bShare ?? 0) * 50);
    expect(result.totalDistributed).toBe(10_000);
  });

  it("filters out zero-sat pool entries from tiny weights", () => {
    const weights = [
      makeWeight("big", "1Big", 1000),
      makeWeight("tiny", "1Tiny", 0.001), // floor(8000 * 0.001/1000.001) = 0
    ];
    const result = calculateSplit(10_000, creatorPub, creatorAddr, platformAddr, weights);

    // Tiny contributor should be filtered out (0 sats)
    const tiny = result.pool.find((p) => p.pubkey === "tiny");
    expect(tiny).toBeUndefined();
    expect(result.totalDistributed).toBe(10_000);
  });
});
