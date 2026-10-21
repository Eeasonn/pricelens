// ============================================================
// 主分析卡纯函数金测（第一百一十七轮）：配额、自动匹配填充、v10 迁移、并集。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, dimBenchmark } from '../../data';
import type { MainProduct, ProductSelection } from '../filtersTypes';
import {
  MAX_LINES_PER_CHART,
  autoComparesFor,
  cardQuota,
  clampMains,
  flatSelections,
  groupToCards,
  isHuaweiModel,
  migrateV10,
  reapplyAuto,
  selKey,
} from '../mainSelection';

const ruOwn = dimProduct.find((p) => p.is_own && p.countries.includes('RU'))!;
const ruOwnModel = ruOwn.sku_id.split('__')[0];
const ruOwnRom = ruOwn.romram;
const ownSel: ProductSelection = {
  modelId: ruOwnModel,
  romram: ruOwnRom,
  skuIds: [ruOwn.sku_id],
};

describe('cardQuota（一张图 ≤8 条产品线，选择时收口）', () => {
  it('quota = 8 - 配置数，下限 0', () => {
    expect(cardQuota({ configs: [ownSel] })).toBe(MAX_LINES_PER_CHART - 1);
    expect(cardQuota({ configs: [] })).toBe(MAX_LINES_PER_CHART);
    const many = Array.from({ length: 10 }, () => ownSel);
    expect(cardQuota({ configs: many })).toBe(0);
  });
});

describe('autoComparesFor（矩阵并集 → 剔除自身 → 配额截断）', () => {
  it('华为配置卡产出矩阵对比且 ≤ 配额、不含主品自身配置', () => {
    const card: MainProduct = { modelId: ruOwnModel, configs: [ownSel], compares: [] };
    const comps = autoComparesFor(card);
    expect(comps.length).toBeGreaterThan(0);
    expect(comps.length).toBeLessThanOrEqual(cardQuota(card));
    expect(comps.every((c) => c.modelId !== ruOwnModel || c.romram !== ruOwnRom)).toBe(true);
    // 首个对比 = 该国矩阵 sort 序的主对标（country_code 过滤，与 benchmarkSkuIdsFor 同口径）
    const rows = dimBenchmark
      .filter((b) => b.own_model_id === ruOwnModel && b.own_romram === ruOwnRom && (b.country_code == null || b.country_code === 'RU'))
      .sort((a, b) => a.sort - b.sort);
    if (rows.length) {
      expect(comps[0].modelId).toBe(rows[0].competitor_sku_id.split('__')[0]);
    }
  });

  it('多配置卡：并集去重后仍受配额约束', () => {
    const modelRows = dimProduct.filter((p) => p.sku_id.startsWith(ruOwnModel + '__'));
    const roms = [...new Set(modelRows.map((p) => p.romram))].slice(0, 4);
    const configs = roms.map((r) => {
      const row = modelRows.find((p) => p.romram === r)!;
      return { modelId: ruOwnModel, romram: r, skuIds: [row.sku_id] };
    });
    const card: MainProduct = { modelId: ruOwnModel, configs, compares: [] };
    const comps = autoComparesFor(card);
    const keys = comps.map(selKey);
    expect(new Set(keys).size).toBe(keys.length); // 并集去重
    expect(comps.length).toBeLessThanOrEqual(cardQuota(card));
  });
});

describe('reapplyAuto（自动跟随：华为主品卡重算、非华为主品卡不动）', () => {
  it('华为卡对比区被矩阵产出替换；竞品卡手动对比区保留', () => {
    const comp = dimProduct.find((p) => !p.is_own && p.countries.includes('RU'))!;
    const compModel = comp.sku_id.split('__')[0];
    const manualCompare: ProductSelection = { modelId: compModel, romram: comp.romram, skuIds: [comp.sku_id] };
    const huaweiCard: MainProduct = { modelId: ruOwnModel, configs: [ownSel], compares: [manualCompare] };
    const compCard: MainProduct = {
      modelId: compModel,
      configs: [{ modelId: compModel, romram: comp.romram, skuIds: [comp.sku_id] }],
      compares: [ownSel],
    };
    const out = reapplyAuto([huaweiCard, compCard]);
    expect(out[0].compares.every((c) => c.modelId !== compModel)).toBe(true); // 矩阵产出替换手动挑选
    expect(out[1].compares).toEqual([ownSel]); // 非华为主品卡不动
    expect(isHuaweiModel(ruOwnModel)).toBe(true);
    expect(isHuaweiModel(compModel)).toBe(false);
  });
});

describe('migrateV10（own/competitors → 每主品卡自带对比区）', () => {
  it('自动模式：逐卡按矩阵重算', () => {
    const [cards] = [migrateV10([ownSel], [], true)];
    expect(cards).toHaveLength(1);
    expect(cards[0].modelId).toBe(ruOwnModel);
    expect(cards[0].compares.length).toBeGreaterThan(0);
  });

  it('手动模式：矩阵命中优先、同容量 fallback、卡配额截断', () => {
    const comps = autoComparesFor({ modelId: ruOwnModel, configs: [ownSel], compares: [] });
    const foreign = dimProduct.find(
      (p) => !p.is_own && p.countries.includes('RU') && p.romram.replace(/\s+/g, '') === comps[0]?.romram.replace(/\s+/g, '') && !comps.some((c) => c.modelId === p.sku_id.split('__')[0]),
    );
    const globalComps = foreign ? [comps[0], { modelId: foreign.sku_id.split('__')[0], romram: foreign.romram, skuIds: [foreign.sku_id] }] : comps;
    const cards = migrateV10([ownSel], globalComps, false);
    expect(cards[0].compares[0].modelId).toBe(comps[0].modelId); // 矩阵命中在前
    expect(cards[0].compares.some((c) => c.modelId === globalComps[globalComps.length - 1].modelId)).toBe(true); // 同容量 fallback 补位
    expect(cards[0].compares.length).toBeLessThanOrEqual(cardQuota(cards[0]));
  });

  it('纯竞品视角（own 空）：竞品型号各成一卡、无对比、≤8 卡', () => {
    const compSels: ProductSelection[] = dimProduct
      .filter((p) => !p.is_own && p.countries.includes('RU'))
      .slice(0, 12)
      .map((p) => ({ modelId: p.sku_id.split('__')[0], romram: p.romram, skuIds: [p.sku_id] }));
    const cards = migrateV10([], compSels, true);
    expect(cards.length).toBeLessThanOrEqual(MAX_LINES_PER_CHART);
    expect(cards.every((c) => c.compares.length === 0)).toBe(true);
  });
});

describe('flatSelections / groupToCards / clampMains', () => {
  it('并集按卡序去重，主品配置优先于对比区', () => {
    const comp = dimProduct.find((p) => !p.is_own && p.countries.includes('RU'))!;
    const compSel: ProductSelection = { modelId: comp.sku_id.split('__')[0], romram: comp.romram, skuIds: [comp.sku_id] };
    const cards: MainProduct[] = [
      { modelId: ruOwnModel, configs: [ownSel], compares: [compSel] },
      { modelId: comp.sku_id.split('__')[0], configs: [compSel], compares: [ownSel] },
    ];
    const { mainSels, compareSels } = flatSelections(cards);
    expect(mainSels).toHaveLength(2);
    expect(compareSels).toHaveLength(0); // 都已作为主品配置出现
  });

  it('groupToCards 按型号成卡保序', () => {
    const comp2 = dimProduct.find((p) => !p.is_own && p.countries.includes('RU') && p.sku_id !== dimProduct.find((q) => !q.is_own)!.sku_id)!;
    const cards = groupToCards([ownSel, { modelId: comp2.sku_id.split('__')[0], romram: comp2.romram, skuIds: [comp2.sku_id] }, ownSel]);
    expect(cards).toHaveLength(2);
    expect(cards[0].configs).toHaveLength(1); // 同型号同配置不重复
  });

  it('clampMains 只截对比区，配置全保留', () => {
    const comps = autoComparesFor({ modelId: ruOwnModel, configs: [ownSel], compares: [] });
    const over: MainProduct = { modelId: ruOwnModel, configs: [ownSel], compares: [...comps, ...comps, ...comps] };
    const clamped = clampMains([over]);
    expect(clamped[0].configs).toHaveLength(1);
    expect(clamped[0].compares.length).toBeLessThanOrEqual(cardQuota(clamped[0]));
  });
});
