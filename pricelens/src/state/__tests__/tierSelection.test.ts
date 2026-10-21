// ============================================================
// 档位批量动作金测（第一百二十三轮）：顶部「按档位」主体模式退役后，
// 一键集结收进「选择产品」浮窗——该档全部我司配置逐配置追加成卡。
// 覆盖：配置级档位去重、追加去重（同型号同配置主品跳过）、卡数封顶、
// 对比区矩阵口径与配额收口、无新增原引用返回。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { tierOf } from '../../dataModel/aggregate';
import type { MainProduct, ProductSelection } from '../filtersTypes';
import { appendTierCards, configsInTier } from '../tierSelection';
import { autoComparesFor, cardQuota, MAINS_CAP, selKey } from '../mainSelection';

// 数据驱动取该国手机产业有我司产品的首个档位（不写死档位代码）
const ownRow = dimProduct.find((p) => p.is_own && p.industry === 'phone' && p.countries.includes('RU'))!;
const tier = tierOf(ownRow, 'RU');

describe('configsInTier（配置级档位去重）', () => {
  it('该档全部配置 ⊇ 我司配置；型号×配置粒度去重', () => {
    const all = configsInTier('phone', tier, 'RU');
    const own = configsInTier('phone', tier, 'RU', true);
    expect(all.length).toBeGreaterThan(0);
    expect(own.length).toBeGreaterThan(0);
    expect(new Set(all.map(selKey)).size).toBe(all.length);
    const allKeys = new Set(all.map(selKey));
    for (const s of own) expect(allKeys.has(selKey(s))).toBe(true);
  });

  it('我司配置全部来自我司型号且命中该档口径', () => {
    const own = configsInTier('phone', tier, 'RU', true);
    const ownModel = ownRow.sku_id.split('__')[0];
    expect(own.some((s) => s.modelId === ownModel)).toBe(true);
    const ownModels = new Set(dimProduct.filter((p) => p.is_own).map((p) => p.sku_id.split('__')[0]));
    expect(own.every((s) => ownModels.has(s.modelId))).toBe(true);
  });
});

describe('appendTierCards（档位批量成组：追加式、去重、封顶）', () => {
  it('该档我司配置逐配置追加成卡，对比区 = 矩阵口径且 ≤ 配额', () => {
    const own = configsInTier('phone', tier, 'RU', true);
    const out = appendTierCards('phone', tier, 'RU', []);
    expect(out).toHaveLength(Math.min(own.length, MAINS_CAP));
    for (const c of out) {
      expect(c.main).toBeTruthy();
      expect(c.compares.length).toBeLessThanOrEqual(cardQuota(c));
    }
    // 我司配置逐配置落卡（在配额内的部分一一对应）
    const outKeys = new Set(out.flatMap((c) => (c.main ? [selKey(c.main)] : [])));
    for (const s of own.slice(0, MAINS_CAP)) expect(outKeys.has(selKey(s))).toBe(true);
  });

  it('已有同型号同配置主品的卡跳过（去重），现有卡原样保留', () => {
    const own = configsInTier('phone', tier, 'RU', true);
    const first = own[0];
    const existing: MainProduct[] = [{ id: 'keep-1', main: first, compares: [] }];
    const out = appendTierCards('phone', tier, 'RU', existing);
    expect(out.filter((c) => c.main != null && selKey(c.main) === selKey(first))).toHaveLength(1);
    expect(out[0]).toBe(existing[0]); // 现有卡引用不动
    // 追加数 = 该档配置数 - 已有 1 条（封顶前）
    expect(out.length - existing.length).toBe(Math.min(own.length, MAINS_CAP) - 1);
  });

  it('卡数封顶 MAINS_CAP（现有占满即不再追加）', () => {
    const stuffed: MainProduct[] = Array.from({ length: MAINS_CAP }, (_, i) => ({
      id: `e${i}`,
      main: { modelId: `none-${i}`, romram: '8+128 GB', skuIds: [`none-${i}__8+128`] } as ProductSelection,
      compares: [],
    }));
    const out = appendTierCards('phone', tier, 'RU', stuffed);
    expect(out).toHaveLength(MAINS_CAP);
    expect(out).toBe(stuffed); // 无新增原引用返回
  });

  it('该档配置全部已有主品时原引用返回（空动作）', () => {
    const own = configsInTier('phone', tier, 'RU', true);
    const existing: MainProduct[] = own.map((s) => ({ id: `d${selKey(s)}`, main: s, compares: [] }));
    expect(appendTierCards('phone', tier, 'RU', existing)).toBe(existing);
  });

  it('新卡对比区与 autoComparesFor 同口径（矩阵主竞品在前、剔除自身配置）', () => {
    const out = appendTierCards('phone', tier, 'RU', []);
    for (const c of out) {
      if (!c.main) continue;
      const manual: MainProduct = { id: 'ref', main: c.main, compares: [] };
      expect(c.compares).toEqual(autoComparesFor(manual));
      expect(c.compares.every((x) => selKey(x) !== selKey(c.main!))).toBe(true);
    }
  });
});
