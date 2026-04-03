import { describe, it, expect } from 'vitest';
import { rateLimit } from './rate-limit';

describe('rateLimit', () => {
  it('allows requests within the limit', () => {
    const key = `test-allow-${Date.now()}`;
    const config = { limit: 3, windowMs: 60_000 };

    expect(rateLimit(key, config).success).toBe(true);
    expect(rateLimit(key, config).success).toBe(true);
    expect(rateLimit(key, config).success).toBe(true);
  });

  it('blocks requests exceeding the limit', () => {
    const key = `test-block-${Date.now()}`;
    const config = { limit: 2, windowMs: 60_000 };

    rateLimit(key, config);
    rateLimit(key, config);
    const result = rateLimit(key, config);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetMs).toBeGreaterThan(0);
  });

  it('tracks remaining count correctly', () => {
    const key = `test-remaining-${Date.now()}`;
    const config = { limit: 3, windowMs: 60_000 };

    expect(rateLimit(key, config).remaining).toBe(2);
    expect(rateLimit(key, config).remaining).toBe(1);
    expect(rateLimit(key, config).remaining).toBe(0);
  });

  it('isolates different keys', () => {
    const config = { limit: 1, windowMs: 60_000 };
    const keyA = `test-iso-a-${Date.now()}`;
    const keyB = `test-iso-b-${Date.now()}`;

    rateLimit(keyA, config);
    // keyA exhausted, keyB should still work
    expect(rateLimit(keyB, config).success).toBe(true);
    expect(rateLimit(keyA, config).success).toBe(false);
  });
});
