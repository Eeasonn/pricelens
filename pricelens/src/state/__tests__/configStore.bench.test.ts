// 生效对标取数单测（第一百一十六轮）：分国过滤、每配置硬上限（BENCHMARK_CAP_PER_CONFIG，
// 2026-11-02 起 = 3，与每组对比硬上限同值）、分组去重。
// 真实数据锚（dim_benchmark RU）对应用户评审案例：R 国 Pura 90s Pro 12+256 = 2 款竞品；
// matrix-only 口径（2026-11-10）：维表只发矩阵直配行（source='matrix'），「维表 4 行取
// sort 前三」锚点换到 AE nova 15 Max 8+256（维表该组 4 行、竞品全 256 ROM，截到前三）。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BENCHMARK_CAP_PER_CONFIG,
  benchmarkSkuIdsFor,
  getEffectiveBenchmark,
  groupsFromBenchmark,
  saveBenchmark,
} from '../configStore';
import { dimBenchmark, dimProduct } from '../../data';
import { LPL } from '../lplKeys';
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

  it('AE nova 15 Max 8+256 = 3 款且全部同 ROM（维表 4 行全同 ROM 256：X9D 12+256 / A36 8+256 / Redmi Note15 Pro 12+256 / X9D 8+256；configStore 侧按 BENCHMARK_CAP_PER_CONFIG=3 取 sort 前三）', () => {
    const list = benchmarkSkuIdsFor('own-huawei-nova-15-max', '8+256 GB', 'AE');
    expect(list).toHaveLength(3);
    expect(new Set(list).size).toBe(3);
    expect(list).toEqual([
      'cmp-honor-x9d__12-256gb__black',
      'cmp-samsung-a36__8-256gb__black',
      'cmp-xiaomi-redmi-note15-pro__12-256gb__blue',
    ]);
    // sort 第 4 行（X9D 8+256，同款另一配置）被每配置上限截掉
    expect(list).not.toContain('cmp-honor-x9d__8-256gb__black');
  });

  it('分国过滤：结果 = 该国维表行（115 轮前预览跨国聚合的回归锚）', () => {
    const ruRows = dimBenchmark
      .filter((r) => r.country_code === 'RU' && r.own_model_id === 'own-huawei-pura-90s-pro' && r.own_romram === '12+256 GB')
      .sort((a, b) => a.sort - b.sort)
      .map((r) => r.competitor_sku_id);
    expect(ruRows.length).toBeGreaterThan(0);
    expect(benchmarkSkuIdsFor('own-huawei-pura-90s-pro', '12+256 GB', 'RU')).toEqual(ruRows);
  });

  // matrix-only 临时口径（2026-11-10 Eason）：人工对标层停用，getEffectiveBenchmark 忽略人工快照；恢复人工层时解除 skip
  it.skip(`手动快照超 ${BENCHMARK_CAP_PER_CONFIG} 款时按 sort 兜底截断（旧持久化回归锚）`, () => {
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

  it('matrix-only：注入人工快照后 getEffectiveBenchmark/benchmarkSkuIdsFor 仍返回维表结果（快照被忽略）', () => {
    // 无快照时的生效视图 = 纯维表（截到每配置 3 款）
    const baseline = getEffectiveBenchmark();
    const baselineForTarget = benchmarkSkuIdsFor('own-huawei-pura-90s-pro', '12+256 GB', 'RU');
    expect(baselineForTarget.length).toBeGreaterThan(0);
    try {
      // 人工快照试图接管 RU Pura 90s Pro 12+256 组（换成快照行 + 幽灵竞品），saveBenchmark 照常落盘
      const ghost: DimBenchmark = {
        country_code: 'RU',
        own_model_id: 'own-huawei-pura-90s-pro',
        own_romram: '12+256 GB',
        competitor_sku_id: 'cmp-ghost__std__black',
        sort: 0,
        source: 'manual',
      };
      saveBenchmark([ghost]);
      // 快照确实写入 localStorage（保存/导入路径语义未删）
      expect(mem.get(LPL.cfgBenchmark)).not.toBeNull();
      // 但生效读取只认维表：整表与该组取数都不受快照影响
      expect(getEffectiveBenchmark()).toEqual(baseline);
      expect(benchmarkSkuIdsFor('own-huawei-pura-90s-pro', '12+256 GB', 'RU')).toEqual(baselineForTarget);
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
