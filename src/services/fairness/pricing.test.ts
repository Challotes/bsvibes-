import { describe, it, expect } from 'vitest';
import { calculateBootPrice } from './pricing';

describe('calculateBootPrice', () => {
  it('returns floor when contributors × rate is below floor', () => {
    // 1 contributor × 156 = 156 < 1000 floor
    expect(calculateBootPrice(1)).toBe(1_000);
  });

  it('scales linearly with contributors', () => {
    // 10 contributors × 156 = 1560
    expect(calculateBootPrice(10)).toBe(1_560);
  });

  it('returns ceiling when price exceeds max', () => {
    // 2000 contributors × 156 = 312,000 > 250,000 ceiling
    expect(calculateBootPrice(2000)).toBe(250_000);
  });

  it('returns exact value within range', () => {
    // 100 contributors × 156 = 15,600 (within range)
    expect(calculateBootPrice(100)).toBe(15_600);
  });

  it('handles zero contributors', () => {
    expect(calculateBootPrice(0)).toBe(1_000); // floor
  });
});
