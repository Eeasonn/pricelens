/**
 * 日配额桶：绑定 KV 时持久计数；未绑定降级 isolate 内存计数，
 * 并通过 precision 如实上报（GET /api/agent/health 的 rateLimitPrecision）。
 * KV 是最终一致（读取侧有缓存），计数为近似值；KV 读写失败时 fail-open 放行
 * 并标记 degraded——配额是防滥用护栏，不是可用性开关。
 */
export type QuotaPrecision = 'kv-daily' | 'memory-per-isolate';

export interface QuotaResult {
  allowed: boolean;
  used: number;
  max: number;
  precision: QuotaPrecision;
  /** KV 读写失败但选择放行时为 true。 */
  degraded?: boolean;
}

export interface DailyQuota {
  readonly precision: QuotaPrecision;
  consume(now?: Date): Promise<QuotaResult>;
}

/** UTC 日键：跨时区口径稳定，与 KV TTL（48h）配合自动清理。 */
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** 最小 KV 接口：运行时直接传 KVNamespace，测试传内存假件，零网络。 */
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export function createMemoryDailyQuota(max: number): DailyQuota {
  const state = { day: '', used: 0 };
  return {
    precision: 'memory-per-isolate',
    async consume(now: Date = new Date()): Promise<QuotaResult> {
      const day = utcDayKey(now);
      if (state.day !== day) {
        state.day = day;
        state.used = 0;
      }
      if (max <= 0) return { allowed: true, used: state.used, max, precision: 'memory-per-isolate' };
      if (state.used >= max) {
        return { allowed: false, used: state.used, max, precision: 'memory-per-isolate' };
      }
      state.used += 1;
      return { allowed: true, used: state.used, max, precision: 'memory-per-isolate' };
    },
  };
}

const KV_QUOTA_TTL_SECONDS = 60 * 60 * 48;

export function createKvDailyQuota(kv: KvLike, max: number): DailyQuota {
  return {
    precision: 'kv-daily',
    async consume(now: Date = new Date()): Promise<QuotaResult> {
      const key = `quota:${utcDayKey(now)}`;
      if (max <= 0) return { allowed: true, used: 0, max, precision: 'kv-daily' };
      let used = 0;
      let degraded = false;
      try {
        used = Number((await kv.get(key)) ?? 0) || 0;
      } catch {
        degraded = true;
        used = 0;
      }
      if (!degraded && used >= max) {
        return { allowed: false, used, max, precision: 'kv-daily' };
      }
      try {
        await kv.put(key, String(used + 1), { expirationTtl: KV_QUOTA_TTL_SECONDS });
        used += 1;
      } catch {
        degraded = true;
      }
      return { allowed: true, used, max, precision: 'kv-daily', degraded: degraded || undefined };
    },
  };
}

export function createDailyQuota(kv: KvLike | null | undefined, max: number): DailyQuota {
  return kv ? createKvDailyQuota(kv, max) : createMemoryDailyQuota(max);
}
