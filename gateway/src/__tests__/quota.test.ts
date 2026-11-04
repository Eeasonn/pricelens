import { describe, expect, it } from 'vitest';
import { createDailyQuota, createKvDailyQuota, createMemoryDailyQuota, utcDayKey, type KvLike } from '../quota';

function fakeKv(initial: Record<string, string> = {}): KvLike & {
  store: Map<string, string>;
  puts: Array<{ key: string; value: string; options?: { expirationTtl?: number } }>;
  failGet: boolean;
  failPut: boolean;
} {
  const store = new Map(Object.entries(initial));
  const puts: Array<{ key: string; value: string; options?: { expirationTtl?: number } }> = [];
  const kv = {
    store,
    puts,
    failGet: false,
    failPut: false,
    async get(key: string): Promise<string | null> {
      if (kv.failGet) throw new Error('kv get unavailable');
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
      if (kv.failPut) throw new Error('kv put unavailable');
      puts.push({ key, value, options });
      store.set(key, value);
    },
  };
  return kv;
}

describe('utcDayKey', () => {
  it('formats a stable UTC day key', () => {
    expect(utcDayKey(new Date('2026-11-04T15:30:00Z'))).toBe('2026-11-04');
  });
});

describe('createMemoryDailyQuota', () => {
  it('counts up to max then blocks, and resets on day rollover', async () => {
    const quota = createMemoryDailyQuota(2);
    const day = new Date('2026-11-04T10:00:00Z');
    expect(await quota.consume(day)).toMatchObject({ allowed: true, used: 1, precision: 'memory-per-isolate' });
    expect(await quota.consume(day)).toMatchObject({ allowed: true, used: 2 });
    expect(await quota.consume(day)).toMatchObject({ allowed: false, used: 2 });
    expect(await quota.consume(new Date('2026-11-05T10:00:00Z'))).toMatchObject({ allowed: true, used: 1 });
  });

  it('is unlimited when max <= 0', async () => {
    const quota = createMemoryDailyQuota(0);
    for (let i = 0; i < 5; i += 1) expect((await quota.consume()).allowed).toBe(true);
  });
});

describe('createKvDailyQuota', () => {
  it('persists the counter with a TTL and blocks at the cap', async () => {
    const kv = fakeKv();
    const quota = createKvDailyQuota(kv, 2);
    const now = new Date('2026-11-04T10:00:00Z');
    expect(await quota.consume(now)).toMatchObject({ allowed: true, used: 1, precision: 'kv-daily' });
    expect(kv.puts[0]).toEqual({ key: 'quota:2026-11-04', value: '1', options: { expirationTtl: 60 * 60 * 48 } });
    expect(await quota.consume(now)).toMatchObject({ allowed: true, used: 2 });
    expect(await quota.consume(now)).toMatchObject({ allowed: false, used: 2 });
  });

  it('continues from the persisted counter', async () => {
    const kv = fakeKv({ 'quota:2026-11-04': '3' });
    const quota = createKvDailyQuota(kv, 3);
    expect(await quota.consume(new Date('2026-11-04T10:00:00Z'))).toMatchObject({ allowed: false, used: 3 });
  });

  it('fails open (allows + degraded) when KV is unavailable', async () => {
    const kv = fakeKv();
    kv.failGet = true;
    kv.failPut = true;
    const quota = createKvDailyQuota(kv, 1);
    const result = await quota.consume();
    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.precision).toBe('kv-daily');
  });

  it('skips storage entirely when unlimited', async () => {
    const kv = fakeKv();
    const quota = createKvDailyQuota(kv, 0);
    expect(await quota.consume()).toMatchObject({ allowed: true, used: 0, max: 0 });
    expect(kv.puts).toHaveLength(0);
  });
});

describe('createDailyQuota', () => {
  it('uses the KV bucket when bound and the memory bucket when not', async () => {
    expect(createDailyQuota(null, 10).precision).toBe('memory-per-isolate');
    expect(createDailyQuota(undefined, 10).precision).toBe('memory-per-isolate');
    expect(createDailyQuota(fakeKv(), 10).precision).toBe('kv-daily');
  });
});
