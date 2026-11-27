// ============================================================
// 「同档位推荐」纯模型金测（2026-11-27 二轮改版 · 现价落档口径）：
// 候选 = 与主品现价落档同档、同国同产业有数据的组；排除、按品牌分组与就近排序、
// 每品牌选 1 款、覆盖与文案。真实数据驱动，不写死型号——主品取 RU 手机里
// 「现价落档同档竞品品牌数最多」的我司配置，保证多品牌组。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, dimTime } from '../../../data';
import { currentPricesByGroup, currentTierOfSelection, groupKeyOf } from '../../../dataModel/tierPrice';
import { buildProductTree, productHasDataInCountry, type BrandNode } from '../../ProductCascader';
import { brandOfModel } from '../../ProductCascader/tree';
import { selKey } from '../../../state/mainSelection';
import {
  buildTierCandidates,
  coverageOf,
  coverageText,
  diffPctText,
  latestText,
  periodText,
  pickOnePerBrand,
  type TierRecommendInput,
} from '../tierRecommend';

const CC = 'RU';
const INDUSTRY = 'phone';
const tree: BrandNode[] = buildProductTree(INDUSTRY, CC);
const brandOrder = tree.map((b) => b.key);

// 批量裁定一次（纯函数，测试内共享）；组键 → 覆盖 SKU 集（dimProduct 同口径）
const byGroup = currentPricesByGroup(INDUSTRY, CC);
const groupSkus = new Map<string, readonly string[]>();
for (const p of dimProduct) {
  if (p.industry !== INDUSTRY || !p.countries.includes(CC)) continue;
  const key = groupKeyOf(p.model_id, p.romram);
  const list = groupSkus.get(key);
  if (list) (list as string[]).push(p.sku_id);
  else groupSkus.set(key, [p.sku_id]);
}
const dataKeys = new Set<string>();
for (const p of dimProduct) {
  if (p.industry !== INDUSTRY) continue;
  if (productHasDataInCountry(p, CC, null, [])) dataKeys.add(groupKeyOf(p.model_id, p.romram));
}

const ownKeys = [...byGroup.keys()].filter((k) => {
  const [modelId] = k.split('|');
  return dimProduct.some((p) => p.model_id === modelId && p.is_own);
});

/** 主品 = 现价落档后同档竞品品牌数最多的我司组（数据驱动，保证多品牌分组覆盖） */
const mainKey = ownKeys
  .map((k) => {
    const entry = byGroup.get(k)!;
    const brands = entry.tier == null
      ? 0
      : new Set(
          [...byGroup.entries()]
            .filter(([gk, e]) => gk !== k && e.tier === entry.tier && dataKeys.has(gk))
            .map(([gk]) => brandOfModel(gk.split('|')[0]))
            .filter((b) => b !== brandOfModel(k.split('|')[0])),
        ).size;
    return { key: k, tier: entry.tier, brands, usd: entry.price.usd };
  })
  .filter((x) => x.tier != null)
  .sort((a, b) => b.brands - a.brands)[0];

const mainEntry = byGroup.get(mainKey.key)!;
const mainSel = mainEntry.sel;
const band = mainEntry.tier as string;

const build = (over: Partial<TierRecommendInput> = {}) =>
  buildTierCandidates({
    industry: INDUSTRY,
    band,
    countryCode: CC,
    financingType: null,
    financingTerms: [],
    mainUsd: mainEntry.price.usd,
    excludeKeys: new Set([selKey(mainSel)]),
    byGroup,
    dataKeys,
    groupSkus,
    brandOrder,
    ...over,
  });

describe('buildTierCandidates（现价同档 · 同国 · 排除 · 分组）', () => {
  it('主品现价落档与批量裁定一致（前置校验：测试数据驱动的前提成立）', () => {
    const single = currentTierOfSelection(mainSel, CC);
    expect(single.tier).toBe(band);
    expect(mainEntry.price.usd).not.toBeNull();
    expect(mainKey.brands).toBeGreaterThan(1); // 该档有多个竞品品牌（否则用例退化）
  });

  it('候选全部与主品同档、同国有数据；主品自身组与对比区组被排除', () => {
    const groups = build();
    const keys = groups.flatMap((g) => g.items.map((c) => c.key));
    expect(keys.length).toBeGreaterThan(0);
    for (const c of groups.flatMap((g) => g.items)) {
      expect(byGroup.get(c.key)?.tier).toBe(band);
      expect(dataKeys.has(c.key)).toBe(true);
      expect(selKey(c.sel)).not.toBe(selKey(mainSel));
    }
    // 与手工全量清单一致：byGroup 同档 ∩ dataKeys − 排除
    const expected = new Set(
      [...byGroup.entries()]
        .filter(([k, e]) => e.tier === band && dataKeys.has(k) && k !== mainKey.key)
        .map(([k]) => k),
    );
    // excludeKeys 用 selKey（空白归一）——本用例排除键就是主品自身
    expect(new Set(keys)).toEqual(expected);
    // 排除对比区组：把某个候选组塞进排除集后不再出现
    const someKey = keys[0];
    const someSel = byGroup.get(someKey)!.sel;
    const narrowed = build({ excludeKeys: new Set([selKey(mainSel), selKey(someSel)]) });
    expect(narrowed.flatMap((g) => g.items.map((c) => c.key))).not.toContain(someKey);
  });

  it('按品牌分组：组序 = 树品牌序；组内按与主品现价最接近在前，无价殿后', () => {
    const groups = build();
    const rank = new Map(brandOrder.map((b, i) => [b, i] as const));
    for (let i = 1; i < groups.length; i++) {
      expect((rank.get(groups[i - 1].brand) ?? 999)).toBeLessThanOrEqual(rank.get(groups[i].brand) ?? 999);
    }
    for (const g of groups) {
      const diffs = g.items.map((c) => (c.diffPct == null ? Number.POSITIVE_INFINITY : Math.abs(c.diffPct)));
      for (let i = 1; i < diffs.length; i++) expect(diffs[i]).toBeGreaterThanOrEqual(diffs[i - 1]);
    }
  });

  it('价差 = (候选现价 − 主品现价) ÷ 主品现价；候选现价来自批量裁定', () => {
    const groups = build();
    const flat = groups.flatMap((g) => g.items);
    const priced = flat.filter((c) => c.usd != null);
    expect(priced.length).toBeGreaterThan(0);
    for (const c of priced) {
      const entry = byGroup.get(c.key)!;
      expect(c.usd).toBe(entry.price.usd);
      expect(c.droppedCount).toBe(entry.price.dropped.length);
      expect(c.diffPct).toBeCloseTo(((c.usd as number) - (mainEntry.price.usd as number)) / (mainEntry.price.usd as number), 10);
    }
  });

  it('每品牌选 1 款 = 各组首位；空结果 = 空数组', () => {
    const groups = build();
    const picks = pickOnePerBrand(groups);
    expect(picks).toEqual(groups.map((g) => g.items[0].key));
    expect(pickOnePerBrand([])).toEqual([]);
    expect(pickOnePerBrand(build({ band: '__no_such_band__' }))).toEqual([]);
  });

  it('主品现价缺失（mainUsd null）→ 价差 null 不抛错', () => {
    const groups = build({ mainUsd: null });
    for (const c of groups.flatMap((g) => g.items)) expect(c.diffPct).toBeNull();
  });
});

describe('覆盖与文案', () => {
  it('coverageOf：有数据 SKU 的覆盖为正且不超过全量周数，最新周落在 dim_time；未知 SKU = 0 且无最新周', () => {
    const row = dimProduct.find((p) => p.industry === INDUSTRY && p.countries.includes(CC))!;
    const cov = coverageOf([row.sku_id], CC);
    expect(cov.covered).toBeGreaterThan(0);
    expect(cov.covered).toBeLessThanOrEqual(cov.total);
    expect(dimTime.some((t) => t.week_id === cov.latest)).toBe(true);
    const none = coverageOf(['no-such-sku'], CC);
    expect(none.covered).toBe(0);
    expect(none.latest).toBeNull();
    expect(coverageText(cov, CC)).toMatch(/^\d+\/\d+ 周$/);
  });

  it('diffPctText / latestText / periodText：符号、U+2212 负号与无值「—」', () => {
    expect(diffPctText(null)).toBe('—');
    expect(diffPctText(0.124)).toBe('+12.4%');
    expect(diffPctText(-0.03)).toBe('−3.0%');
    expect(diffPctText(0.0001)).toBe('0.0%');
    expect(latestText({ covered: 0, total: 1, latest: null })).toBe('');
    expect(latestText({ covered: 1, total: 1, latest: dimTime[dimTime.length - 1].week_id })).toMatch(/^2026W\d+$/);
    expect(periodText(dimTime[dimTime.length - 1].week_id)).toMatch(/^2026W\d+$/);
    expect(periodText(null)).toBe('');
    expect(periodText('202610')).toBe('2026-10');
  });
});
