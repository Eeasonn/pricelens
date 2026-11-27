// ============================================================
// 「同档位推荐」纯模型金测（2026-11-27）：同国同档候选、排除、按品牌分组与
// 就近排序、每品牌选 1 款、无价 / 无主品现价边界、覆盖与文案。真实数据驱动，
// 不写死型号（主品取 RU 手机里「同档竞品品牌数最多」的我司配置，保证多品牌组）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, dimTime } from '../../../data';
import { tierOf } from '../../../dataModel/aggregate';
import { buildProductTree, type BrandNode, type RomramNode } from '../../ProductCascader';
import { brandOfModel } from '../../ProductCascader/tree';
import type { ProductSelection } from '../../../state/filtersTypes';
import { selKey } from '../../../state/mainSelection';
import { configsInTier } from '../../../state/tierSelection';
import {
  buildTierCandidates,
  coverageOf,
  diffPctText,
  latestText,
  pickOnePerBrand,
  referencePriceOf,
  tierOfSelection,
} from '../tierRecommend';

const CC = 'RU';
const INDUSTRY = 'phone';
const tree: BrandNode[] = buildProductTree(INDUSTRY, CC);
const romramByKey = new Map<string, RomramNode>();
for (const b of tree) for (const s of b.series) for (const m of s.models) for (const r of m.romrams) romramByKey.set(r.key, r);
const brandOrder = tree.map((b) => b.key);

const ownRows = dimProduct.filter((p) => p.is_own && p.industry === INDUSTRY && p.countries.includes(CC));
const selOf = (row: (typeof dimProduct)[number]): ProductSelection => ({ modelId: row.model_id, romram: row.romram, skuIds: [row.sku_id] });

/** 主品 = 同档位里竞品品牌数最多的我司配置（数据驱动，保证用例覆盖多品牌分组） */
const main = ownRows
  .map((row) => ({ sel: selOf(row), tier: tierOf(row, CC) }))
  .map((x) => ({
    ...x,
    brands: new Set(
      configsInTier(INDUSTRY, x.tier, CC).filter((s) => brandOfModel(s.modelId) !== brandOfModel(x.sel.modelId)).map((s) => brandOfModel(s.modelId)),
    ).size,
  }))
  .sort((a, b) => b.brands - a.brands)[0];
const tier = main.tier;

const build = (over: Partial<Parameters<typeof buildTierCandidates>[0]> = {}) =>
  buildTierCandidates({
    industry: INDUSTRY,
    tier,
    countryCode: CC,
    currency: 'usd',
    financingType: null,
    financingTerms: [],
    mainPrice: 1000,
    excludeKeys: new Set([selKey(main.sel)]),
    romramByKey,
    brandOrder,
    ...over,
  });

describe('tierOfSelection（主品配置在当前国家的分国档位）', () => {
  it('返回维表按国家解析的档位；型号不在维表 = null', () => {
    expect(tier).toBeTruthy();
    expect(tierOfSelection(main.sel, CC)).toBe(tier);
    expect(tierOfSelection({ ...main.sel, modelId: 'no-such-model' }, CC)).toBeNull();
  });
});

describe('buildTierCandidates（同档 · 同国 · 同产业 · 排除 · 分组）', () => {
  const groups = build();

  it('每个候选都与主品同档位、同国家、同产业（型号 × 配置粒度）', () => {
    const items = groups.flatMap((g) => g.items);
    expect(items.length).toBeGreaterThan(0);
    for (const c of items) {
      const rows = dimProduct.filter((p) => p.model_id === c.sel.modelId && p.romram.replace(/\s+/g, '') === c.romram.replace(/\s+/g, ''));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.industry === INDUSTRY)).toBe(true);
      expect(rows.some((r) => r.countries.includes(CC))).toBe(true);
      expect(rows.some((r) => tierOf(r, CC) === tier)).toBe(true);
    }
    // 配置级去重
    expect(new Set(items.map((c) => c.key)).size).toBe(items.length);
  });

  it('候选全集 = 该国该产业该档位的全部配置（configsInTier 同口径），主品自身与显式排除项不进候选', () => {
    const all = configsInTier(INDUSTRY, tier, CC);
    const got = new Set(build().flatMap((g) => g.items.map((c) => c.key)));
    expect(got.size).toBe(all.length - 1); // 去掉主品自身
    for (const s of all) if (selKey(s) !== selKey(main.sel)) expect(got.has(selKey(s))).toBe(true);

    const victim = all.find((s) => selKey(s) !== selKey(main.sel))!;
    const withExclude = build({ excludeKeys: new Set([selKey(main.sel), selKey(victim)]) });
    expect(withExclude.flatMap((g) => g.items.map((c) => c.key))).not.toContain(selKey(victim));
  });

  it('按品牌分组：组内品牌一致，组序跟随选择产品树的品牌序，含多个竞品品牌', () => {
    expect(groups.length).toBeGreaterThanOrEqual(2);
    for (const g of groups) expect(g.items.every((c) => c.brand === g.brand)).toBe(true);
    const ranks = groups.map((g) => brandOrder.indexOf(g.brand));
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    expect(groups.some((g) => g.brand === 'HUAWEI')).toBe(true); // 含我司组（弹窗默认隐藏）
  });

  it('组内按与主品现价最接近排序（|价差| 升序、无价殿后），价差 =（候选 − 主品）÷ 主品', () => {
    for (const g of groups) {
      const dist = g.items.map((c) => (c.diffPct == null ? Number.POSITIVE_INFINITY : Math.abs(c.diffPct)));
      for (let i = 1; i < dist.length; i += 1) expect(dist[i]).toBeGreaterThanOrEqual(dist[i - 1] - 1e-12);
      for (const c of g.items) {
        if (c.price != null) expect(c.diffPct).toBeCloseTo((c.price - 1000) / 1000, 10);
        else expect(c.diffPct).toBeNull();
      }
    }
  });

  it('每品牌选 1 款 = 各组第一位（即最接近主品现价的那款），每组恰好一个', () => {
    const picks = pickOnePerBrand(groups);
    expect(picks).toHaveLength(groups.length);
    expect(new Set(picks).size).toBe(picks.length);
    groups.forEach((g, i) => expect(picks[i]).toBe(g.items[0].key));
    expect(pickOnePerBrand([])).toEqual([]);
  });
});

describe('无价 / 无主品现价边界', () => {
  it('候选在当前国家无价：现价与价差为 null，排到所在品牌组的最后', () => {
    const groups = build();
    const target = groups.flatMap((g) => g.items).find((c) => c.price != null && c.brand !== 'HUAWEI')!;
    // 抹掉该配置的树节点 = 默认电渠下取不到现价
    const poor = new Map(romramByKey);
    poor.delete(`${target.sel.modelId}|${target.sel.romram}`);
    const groups2 = build({ romramByKey: poor });
    const group = groups2.find((g) => g.brand === target.brand)!;
    const hit = group.items.find((c) => c.key === target.key)!;
    expect(hit.price).toBeNull();
    expect(hit.diffPct).toBeNull();
    expect(group.items[group.items.length - 1].key).toBe(target.key);
    expect(referencePriceOf(undefined, 'usd')).toBeNull();
    expect(referencePriceOf(undefined, 'local')).toBeNull();
  });

  it('主品无现价：全部价差为 null，候选与分组不受影响（仍按名称稳定排序）', () => {
    const groups = build({ mainPrice: null });
    expect(groups.flatMap((g) => g.items).every((c) => c.diffPct === null)).toBe(true);
    expect(groups.length).toBe(build().length);
  });

  it('档位为空串 / 无候选：返回空数组，pickOnePerBrand 不抛错', () => {
    expect(build({ tier: '__no_such_tier__' })).toEqual([]);
    expect(pickOnePerBrand(build({ tier: '__no_such_tier__' }))).toEqual([]);
  });
});

describe('覆盖与文案', () => {
  it('coverageOf：有数据 SKU 的覆盖为正且不超过全量周数，最新周落在 dim_time；未知 SKU = 0 且无最新周', () => {
    const row = dimProduct.find((p) => !p.is_own && p.industry === INDUSTRY && p.countries.includes(CC))!;
    const cov = coverageOf([row.sku_id], CC);
    expect(cov.total).toBe(dimTime.length);
    expect(cov.covered).toBeGreaterThanOrEqual(0);
    expect(cov.covered).toBeLessThanOrEqual(cov.total);
    if (cov.covered > 0) expect(dimTime.some((t) => t.week_id === cov.latest)).toBe(true);
    const none = coverageOf(['no-such-sku'], CC);
    expect(none).toEqual({ covered: 0, total: dimTime.length, latest: null });
  });

  it('diffPctText / latestText：符号、U+2212 负号与无值「—」', () => {
    expect(diffPctText(null)).toBe('—');
    expect(diffPctText(0.124)).toBe('+12.4%');
    expect(diffPctText(-0.03)).toBe('−3.0%');
    expect(diffPctText(0.0001)).toBe('0.0%');
    expect(latestText({ covered: 0, total: 1, latest: null })).toBe('');
    expect(latestText({ covered: 1, total: 1, latest: dimTime[dimTime.length - 1].week_id })).toMatch(/^2026W\d+$/);
  });
});
