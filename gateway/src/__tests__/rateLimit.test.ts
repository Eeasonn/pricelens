import { describe, expect, it } from 'vitest';
import { SlidingWindowRateLimiter } from '../rateLimit';

describe('SlidingWindowRateLimiter', () => {
  it('allows up to max requests then blocks with a retry hint', () => {
    const limiter = new SlidingWindowRateLimiter(3, 60_000);
    expect(limiter.check('1.2.3.4', 1_000)).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.check('1.2.3.4', 2_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check('1.2.3.4', 3_000)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = limiter.check('1.2.3.4', 4_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('slides the window: old hits expire and the key opens again', () => {
    const limiter = new SlidingWindowRateLimiter(1, 60_000);
    expect(limiter.check('ip', 0).allowed).toBe(true);
    expect(limiter.check('ip', 30_000).allowed).toBe(false);
    // 60s 窗口：t=61s 时 t=0 的命中已滑出。
    expect(limiter.check('ip', 61_000).allowed).toBe(true);
  });

  it('counts keys independently', () => {
    const limiter = new SlidingWindowRateLimiter(1, 60_000);
    expect(limiter.check('a', 0).allowed).toBe(true);
    expect(limiter.check('b', 0).allowed).toBe(true);
    expect(limiter.check('a', 1).allowed).toBe(false);
  });

  it('disables itself when max <= 0', () => {
    const limiter = new SlidingWindowRateLimiter(0, 60_000);
    for (let i = 0; i < 100; i += 1) expect(limiter.check('ip', i).allowed).toBe(true);
  });
});
