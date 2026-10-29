// 窄域恢复单测（第一百八十五轮·外部 UX 审计落地）：
// clearBenchmarkEntry 只把目标「国家×型号×配置」回退维表默认，其他国家/型号/配置
// 原样保留，快照删空清键，无快照空操作，saveBenchmark(null) 全量语义不变；
// clearPrevGenOverridesForModels 只清指定型号的上一代覆盖，
// savePrevGenOverrides(null) 全量语义不变。
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  autoPrevModelId,
  benchmarkSkuIdsFor,
  clearBenchmarkEntry,
  clearPrevGenOverridesForModels,
  effectivePrevModelId,
  getEffectiveBenchmark,
  getPrevGenOverrides,
  saveBenchmark,
  savePrevGenOverrides,
} from '../configStore';
import { dimBenchmark, dimProduct } from '../../data';
import { LPL } from '../lplKeys';
import type { DimBenchmark } from '../../dataModel/types';

/** node 环境无 localStorage：装内存桩让 configStore 的手动快照路径可测（同 bench 测试） */
const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});
beforeEach(() => {
  mem.clear();
});

const rawBench = (): DimBenchmark[] | null => {
  const raw = mem.get(LPL.cfgBenchmark);
  return raw == null ? null : (JSON.parse(raw) as DimBenchmark[]);
};
const rawPrevGen = (): Record<string, string | null> | null => {
  const raw = mem.get(LPL.cfgPrevGen);
  return raw == null ? null : (JSON.parse(raw) as Record<string, string | null>);
};

/** 目标组：R 国 Pura 90s Pro 12+256 GB（维表默认 2 款：iPhone 17 / S26） */
const CC = 'RU';
const MID = 'own-huawei-pura-90s-pro';
const ROM = '12+256 GB';
const targetRows = dimBenchmark.filter(
  (r) => r.country_code === CC && r.own_model_id === MID && r.own_romram === ROM,
);
const isTarget = (r: DimBenchmark): boolean =>
  r.country_code === CC && r.own_model_id === MID && r.own_romram === ROM;

/** 手动快照里的假竞品必须是真实存在的 SKU（getEffectiveBenchmark 按主数据过滤） */
const realSku = (i: number): string =>
  dimProduct.filter((p) => !p.is_own).map((p) => p.sku_id)[i] ?? '';

describe('clearBenchmarkEntry（窄域恢复单个配置的对标）', () => {
  it('只把目标配置回退维表默认，其他国家/型号/配置的行原样保留', () => {
    // 模拟用户改过目标组：竞品换成另两款真实竞品、来源标人工；其余组 = 整份维表
    const modified = targetRows.map((r, i) => ({ ...r, competitor_sku_id: realSku(i), source: 'manual' as const }));
    saveBenchmark([...dimBenchmark.filter((r) => !isTarget(r)).map((r) => ({ ...r })), ...modified]);
    expect(benchmarkSkuIdsFor(MID, ROM, CC)).toEqual(modified.map((r) => r.competitor_sku_id));

    clearBenchmarkEntry(CC, MID, ROM);

    const after = rawBench() ?? [];
    // 目标组 = 维表默认行（SKU/sort/来源/备注逐字段一致）
    expect(after.filter(isTarget)).toEqual(targetRows);
    // 非目标行与维表逐行一致（顺序 = 维表原序）
    expect(after.filter((r) => !isTarget(r))).toEqual(dimBenchmark.filter((r) => !isTarget(r)));
    // 读取口径同步回到默认取数
    expect(benchmarkSkuIdsFor(MID, ROM, CC)).toEqual(targetRows.map((r) => r.competitor_sku_id));
  });

  it('别组的人工行不被误伤（他国同型号也保留）', () => {
    const deManual: DimBenchmark = {
      country_code: 'DE',
      own_model_id: MID,
      own_romram: ROM,
      competitor_sku_id: realSku(3),
      sort: 1,
      source: 'manual',
    };
    const ruManual: DimBenchmark = { ...targetRows[0], competitor_sku_id: realSku(4), source: 'manual' };
    saveBenchmark([deManual, ruManual]);

    clearBenchmarkEntry(CC, MID, ROM);

    const after = [...(rawBench() ?? [])].sort((a, b) => a.country_code.localeCompare(b.country_code));
    // DE 的人工行原样保留；RU 组补回维表默认 2 款
    expect(after).toEqual([deManual, ...targetRows].sort((a, b) => a.country_code.localeCompare(b.country_code)));
    expect(after.filter((r) => r.country_code === 'DE')).toEqual([deManual]);
  });

  it('快照因此删空则整键清除（全表回默认）', () => {
    // 维表里没有默认行的「幽灵组」，清掉后快照无行可剩 → 键应被移除
    const ghost: DimBenchmark = {
      country_code: CC,
      own_model_id: 'own-ghost-model',
      own_romram: '1+1 GB',
      competitor_sku_id: realSku(5),
      sort: 1,
      source: 'manual',
    };
    saveBenchmark([ghost]);
    expect(getEffectiveBenchmark()).toEqual([ghost]);

    clearBenchmarkEntry(CC, 'own-ghost-model', '1+1 GB');

    expect(mem.get(LPL.cfgBenchmark)).toBeUndefined();
    expect(getEffectiveBenchmark()).toEqual(dimBenchmark);
  });

  it('无手动快照时是空操作（本就是默认口径，不凭空建快照）', () => {
    clearBenchmarkEntry(CC, MID, ROM);
    expect(mem.get(LPL.cfgBenchmark)).toBeUndefined();
  });

  it('配置键按去空格归一匹配（12+256 GB ≈ 12+256GB）', () => {
    saveBenchmark([{ ...targetRows[0], competitor_sku_id: realSku(6), source: 'manual' as const }]);

    clearBenchmarkEntry(CC, MID, '12+256GB');

    expect((rawBench() ?? []).filter(isTarget)).toEqual(targetRows);
  });

  it('全量 API 原语义不变：saveBenchmark(null) 清整份快照回默认', () => {
    saveBenchmark([{ ...targetRows[0], competitor_sku_id: realSku(7), source: 'manual' as const }]);
    expect(benchmarkSkuIdsFor(MID, ROM, CC)).toEqual([realSku(7)]);

    saveBenchmark(null);

    expect(mem.get(LPL.cfgBenchmark)).toBeUndefined();
    expect(benchmarkSkuIdsFor(MID, ROM, CC)).toEqual(targetRows.map((r) => r.competitor_sku_id));
  });
});

describe('clearPrevGenOverridesForModels（窄域清除上一代覆盖）', () => {
  it('只清指定型号，其余型号保留；返回实际清除条数', () => {
    savePrevGenOverrides({ 'own-a': 'own-b', 'own-c': null, 'own-e': 'own-f' });

    const removed = clearPrevGenOverridesForModels(['own-a', 'own-c', 'own-z']);

    expect(removed).toBe(2);
    expect(rawPrevGen()).toEqual({ 'own-e': 'own-f' });
    expect(getPrevGenOverrides()).toEqual({ 'own-e': 'own-f' });
  });

  it('清空后整键移除，生效关系回产品主数据口径', () => {
    savePrevGenOverrides({ 'own-a': 'own-b' });
    expect(effectivePrevModelId('own-a')).toBe('own-b');

    const removed = clearPrevGenOverridesForModels(['own-a']);

    expect(removed).toBe(1);
    expect(mem.get(LPL.cfgPrevGen)).toBeUndefined();
    expect(effectivePrevModelId('own-a')).toBe(autoPrevModelId('own-a'));
  });

  it('无覆盖表时是空操作（返回 0、不落盘）', () => {
    expect(clearPrevGenOverridesForModels(['own-a'])).toBe(0);
    expect(mem.get(LPL.cfgPrevGen)).toBeUndefined();
  });

  it('全量 API 原语义不变：savePrevGenOverrides(null) 清整表', () => {
    savePrevGenOverrides({ 'own-a': 'own-b', 'own-x': null });

    savePrevGenOverrides(null);

    expect(mem.get(LPL.cfgPrevGen)).toBeUndefined();
    expect(getPrevGenOverrides()).toEqual({});
  });
});
