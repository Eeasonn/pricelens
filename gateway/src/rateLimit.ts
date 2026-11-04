/**
 * 每 IP 速率限制：isolate 内存滑动窗。
 * 已知限制（如实声明）：per-isolate 语义——同一 colo 的多个 isolate 各自计数、
 * isolate 回收即清零，只能拦住单实例内的明显滥用；真正的硬限流靠
 * Cloudflare WAF 免费速率限制规则（配置步骤见 README）。
 */
export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  /** 剩余可用次数；-1 表示未启用限制。 */
  remaining: number;
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private static readonly MAX_TRACKED_KEYS = 10_000;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now: number = Date.now()): RateLimitDecision {
    if (this.max <= 0 || this.windowMs <= 0) {
      return { allowed: true, retryAfterSeconds: 0, remaining: -1 };
    }
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
        remaining: 0,
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > SlidingWindowRateLimiter.MAX_TRACKED_KEYS) this.prune(now);
    return { allowed: true, retryAfterSeconds: 0, remaining: this.max - recent.length };
  }

  /** 防止未知 IP 撑爆内存：只保留窗口内仍有命中的键。 */
  private prune(now: number): void {
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.hits) {
      if (!timestamps.some((timestamp) => timestamp > windowStart)) this.hits.delete(key);
      if (this.hits.size <= SlidingWindowRateLimiter.MAX_TRACKED_KEYS / 2) break;
    }
  }

  reset(): void {
    this.hits.clear();
  }
}
