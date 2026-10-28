// 生效对标取数单测（第一百一十六轮）：分国过滤、每配置 4 款硬上限、分组去重。
// 真实数据锚（dim_benchmark RU）对应用户评审案例：R 国 Pura 90s Pro 12+256 = 2 款竞品、
// Pura 80 Ultra 16+512 = 4 款；手动快照超限（旧版本遗留）时 benchmarkSkuIdsFor 兜底截断。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BENCHMARK_CAP_PER_CONFIG,
  benchmarkSkuIdsFor,
  groupsFromBenchmark,
  saveBenchmark,
} from '../configStore';
import { dimBenchmark, dimProduct } from '../../data';
import { modelIdOf } from '../../components/ProductCascader/tree';
import type { DimBenchmark } from '../../dataModel/types';

/** node 环境无 localStorage：装内存桩让 configStore 的手动快照路径可测 */
const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

const row = (sort: number, competitor_sku_id: string): DimBenchmark => ({
  country_code: 'RU',
  own_model_id: 'own-huawei-pura-90s-pro',
  own_romram: '12+256 GB',
  competitor_sku_id,
  sort,
  source: 'manual',
});

describe('benchmarkSkuIdsFor', () => {
  it('R 国 Pura 90s Pro 12+256 = 恰好 2 款（与看板实际带出一致）', () => {
    expect(benchmarkSkuIdsFor('own-huawei-pura-90s-pro', '12+256 GB', 'RU')).toEqual([
      'cmp-apple-iphone-17__8-256gb__black',
      'cmp-samsung-s26__12-256gb__black',
    ]);
  });

  it('R 国 Pura 80 Ultra 16+512 = 3 款且全部同 ROM（2026-10-29 拍板：1vs多不再全显，同 ROM 优先）', () => {
    const list = benchmarkSkuIdsFor('own-huawei-pura-80-ultra', '16+512 GB', 'RU');
    expect(list).toHaveLength(3);
    expect(new Set(list).size).toBe(3);
    // 同 ROM 512（此前全显口径配的是 1TB/256 错位档）
    expect(list).toEqual([
      'cmp-apple-iphone-air__512gb__black',
      'cmp-samsung-s25-ultra__12-512gb__white',
      'cmp-xiaomi-17__12-512gb__black',
    ]);
  });

  it('分国过滤：结果 = 该国维表行（115 轮前预览跨国聚合的回归锚）', () => {
    const ruRows = dimBenchmark
      .filter((r) => r.country_code === 'RU' && r.own_model_id === 'own-huawei-pura-90s-pro' && r.own_romram === '12+256 GB')
      .sort((a, b) => a.sort - b.sort)
      .map((r) => r.competitor_sku_id);
    expect(ruRows.length).toBeGreaterThan(0);
    expect(benchmarkSkuIdsFor('own-huawei-pura-90s-pro', '12+256 GB', 'RU')).toEqual(ruRows);
  });

  it(`手动快照超 ${BENCHMARK_CAP_PER_CONFIG} 款时按 sort 兜底截断（旧持久化回归锚）`, () => {
    const ruComps = dimProduct.filter((p) => !p.is_own && p.countries.includes('RU')).map((p) => p.sku_id);
    const rows = ruComps.slice(0, 6).map((sku, i) => row(i + 1, sku));
    expect(rows).toHaveLength(6);
    try {
      saveBenchmark(rows);
      const list = benchmarkSkuIdsFor('own-huawei-pura-90s-pro', '12+256 GB', 'RU');
      expect(list).toHaveLength(BENCHMARK_CAP_PER_CONFIG);
      expect(list).toEqual(ruComps.slice(0, BENCHMARK_CAP_PER_CONFIG));
    } finally {
      saveBenchmark(null); // 清理手动快照，避免影响其他用例
    }
  });
});

describe('groupsFromBenchmark', () => {
  it('按竞品「产品·配置」分组去重，组数 = 去重后 SKU 组数', () => {
    const own = [{ modelId: 'own-huawei-pura-90s-pro', romram: '12+256 GB', skuIds: [] as string[] }];
    const groups = groupsFromBenchmark(own);
    expect(groups).toHaveLength(2);
    const mids = groups.map((g) => g.modelId).map((mid) => dimProduct.find((p) => modelIdOf(p) === mid)?.model_name);
    expect(mids).toEqual(['iPhone 17', 'S26']);
    for (const g of groups) expect(g.skuIds.length).toBeGreaterThan(0);
  });

  it('多我司配置的并集每组不超过硬上限', () => {
    const own = [
      { modelId: 'own-huawei-pura-90s-pro', romram: '12+256 GB', skuIds: [] as string[] },
      { modelId: 'own-huawei-pura-80-ultra', romram: '16+512 GB', skuIds: [] as string[] },
    ];
    const groups = groupsFromBenchmark(own);
    expect(groups.length).toBeLessThanOrEqual(2 * BENCHMARK_CAP_PER_CONFIG);
    const keys = new Set(groups.map((g) => `${g.modelId}|${g.romram}`));
    expect(keys.size).toBe(groups.length);
  });
});
