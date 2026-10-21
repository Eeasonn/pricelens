// ============================================================
// 裸机口径金测（第一百二十五轮）：组合销售（套装）行不参与最低价比较，只在该周
// 无非套装行时才回退套装价。此前仅看板取价排除套装，总览现价/火花线、代表色、
// 平台价差、浮窗现价、量价折扣因子各自裸取 min——同一 SKU 同一周跨页面两个价格。
// 钉住：① minPriceOfRows 合成行语义；② 真实数据确有「套装更便宜」的周（测试有效）；
// ③ 看板单点取价选非套装最低；④ 总览矩阵现价 = 看板单点取价（同 SKU 同周同渠道）；
// ⑤ 平台价差逐平台同规则（独立直算对照）；⑥ 平台勾选国家合法性判定。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimChannel, dimProduct, dimRegion, factPriceWeekly } from '../../data';
import {
  buildOverviewMatrix,
  effectiveChannelIds,
  minPriceOfRows,
  platformPriceSpread,
  platformSelectionValidFor,
  priceForSelection,
} from '../aggregate';
import type { FactPriceWeekly } from '../types';

type Row = { id: string; price: number | null; bundle: boolean };
const r = (id: string, price: number | null, bundle = false): Row => ({ id, price, bundle });
const priceOf = (x: Row): number | null => x.price;

describe('minPriceOfRows（裸机口径纯函数）', () => {
  it('套装更便宜也不选套装；只剩套装才回退套装最低价', () => {
    expect(minPriceOfRows([r('a', 100), r('b', 80, true), r('c', 90)], priceOf)?.row.id).toBe('c');
    expect(minPriceOfRows([r('a', 100, true), r('b', 80, true)], priceOf)?.row.id).toBe('b');
  });

  it('null 价跳过；全 null / 空 → null；同价取先遇到者，prefer 可改平手规则', () => {
    expect(minPriceOfRows([r('a', null), r('b', null)], priceOf)).toBeNull();
    expect(minPriceOfRows([], priceOf)).toBeNull();
    expect(minPriceOfRows([r('a', 50), r('b', 50)], priceOf)?.row.id).toBe('a');
    const bySku = (c: { row: Row; price: number }, b: { row: Row; price: number }): boolean =>
      c.price < b.price || (c.price === b.price && c.row.id < b.row.id);
    expect(minPriceOfRows([r('b', 50), r('a', 50)], priceOf, bySku)?.row.id).toBe('a');
  });
});

// ---- 真实数据：「既有非套装行又有更便宜套装行」的 (国家, SKU, 周) ----
// 套装行集中在非默认平台（默认电渠渠道内不存在此类周），所以分叉只在
// 平台价差（全渠道）、总览显式多选平台、量价折扣因子（全渠道）三处显形——
// 本组按「该国全部平台」显式勾选构造查询，才能命中。
interface Group {
  cc: string;
  skuId: string;
  weekId: string;
  bareMin: number;
  bundleMin: number;
}
const platformsOf = (cc: string): string[] => [...new Set(dimChannel.filter((c) => c.country_code === cc).map((c) => c.platform))];
const allPlatformsQuery = (cc: string): { platforms: string[]; shopIds: string[] } => ({ platforms: platformsOf(cc), shopIds: [] });
const cheaperBundleGroups: Group[] = (() => {
  const byKey = new Map<string, FactPriceWeekly[]>();
  for (const row of factPriceWeekly) {
    if (row.price_usd == null) continue;
    const k = `${row.country_code}|${row.sku_id}|${row.week_id}`;
    const arr = byKey.get(k);
    if (arr) arr.push(row);
    else byKey.set(k, [row]);
  }
  const out: Group[] = [];
  for (const [k, rows] of byKey) {
    const bare = rows.filter((x) => !x.bundle).map((x) => x.price_usd!);
    const bundle = rows.filter((x) => x.bundle).map((x) => x.price_usd!);
    if (!bare.length || !bundle.length) continue;
    const bareMin = Math.min(...bare);
    const bundleMin = Math.min(...bundle);
    if (bundleMin < bareMin) {
      const [cc, skuId, weekId] = k.split('|');
      out.push({ cc, skuId, weekId, bareMin, bundleMin });
    }
  }
  return out;
})();

describe('真实数据：看板单点取价 / 总览现价 / 平台价差 同一裸机口径', () => {
  it('数据里确有「套装比非套装便宜」的周（否则本组测试无意义）；默认电渠内没有', () => {
    expect(cheaperBundleGroups.length).toBeGreaterThan(0);
    const inDefault = cheaperBundleGroups.filter((g) => {
      const set = new Set(effectiveChannelIds(g.cc, null));
      const rows = factPriceWeekly.filter((x) => x.country_code === g.cc && x.sku_id === g.skuId && x.week_id === g.weekId && set.has(x.channel_id));
      return rows.some((x) => x.bundle) && rows.some((x) => !x.bundle);
    });
    expect(inDefault).toHaveLength(0);
  });

  it('priceForSelection（全平台勾选）：取非套装最低，不被更便宜的套装行拉低', () => {
    for (const g of cheaperBundleGroups.slice(0, 50)) {
      const hit = priceForSelection(g.skuId, g.weekId, g.cc, allPlatformsQuery(g.cc), 'usd');
      expect(hit?.price).toBe(g.bareMin);
      expect(hit?.row.bundle).toBe(false);
    }
  });

  it('总览矩阵现价（全平台勾选、含竞品型号）= 看板单点取价（同 SKU · asOfWeek · 同平台集合）', () => {
    const cc = cheaperBundleGroups[0].cc;
    const industry = dimProduct.find((p) => p.sku_id === cheaperBundleGroups[0].skuId)!.industry;
    const q = allPlatformsQuery(cc);
    const bands = buildOverviewMatrix('usd', undefined, q, { countryCode: cc, industry });
    let checked = 0;
    let bundleAffected = 0;
    for (const m of bands.flatMap((b) => b.models)) {
      for (const row of m.rows) {
        if (row.price == null) continue;
        const hit = priceForSelection(row.skuId, row.asOfWeek, cc, q, 'usd');
        expect(hit?.price).toBe(row.price);
        checked++;
        if (cheaperBundleGroups.some((g) => g.cc === cc && g.skuId === row.skuId && g.weekId === row.asOfWeek)) bundleAffected++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(bundleAffected).toBeGreaterThan(0);
  });

  it('platformPriceSpread：逐平台非套装优先、只剩套装回退（与独立直算一致，升序）', () => {
    const platformOf = new Map(dimChannel.map((c) => [c.channel_id, c.platform]));
    for (const g of cheaperBundleGroups.slice(0, 50)) {
      const all = factPriceWeekly.filter(
        (x) => x.country_code === g.cc && x.sku_id === g.skuId && x.week_id === g.weekId && x.price_usd != null,
      );
      const expected = new Map<string, number>();
      for (const platform of new Set(all.map((x) => platformOf.get(x.channel_id)!))) {
        const mine = all.filter((x) => platformOf.get(x.channel_id) === platform);
        const bare = mine.filter((x) => !x.bundle).map((x) => x.price_usd!);
        const bundle = mine.filter((x) => x.bundle).map((x) => x.price_usd!);
        expected.set(platform, bare.length ? Math.min(...bare) : Math.min(...bundle));
      }
      const got = platformPriceSpread(g.skuId, g.weekId, g.cc, 'usd');
      expect(new Map(got.map((x) => [x.platform, x.price]))).toEqual(expected);
      expect(got.map((x) => x.price)).toEqual([...got.map((x) => x.price)].sort((a, b) => a - b));
    }
  });
});

describe('platformSelectionValidFor（平台勾选整体属于该国）', () => {
  // OZON 只在 RU；找一个启用国家不含 OZON 平台
  const ruPlatform = 'OZON';
  const otherCc = dimRegion.find(
    (x) => x.enabled && x.country_code !== 'RU' && !dimChannel.some((c) => c.country_code === x.country_code && c.platform === ruPlatform),
  )!.country_code;
  const ruChannel = dimChannel.find((c) => c.country_code === 'RU')!.channel_id;

  it('未选（null）恒合法；本国整平台 / 本国渠道合法', () => {
    expect(platformSelectionValidFor('RU', null)).toBe(true);
    expect(platformSelectionValidFor('RU', { platforms: [ruPlatform], shopIds: [] })).toBe(true);
    expect(platformSelectionValidFor('RU', { platforms: [], shopIds: [ruChannel] })).toBe(true);
  });

  it('旧国家的整平台 / 渠道带到新国家不合法（否则解析成空渠道集、整页空白）', () => {
    expect(platformSelectionValidFor(otherCc, { platforms: [ruPlatform], shopIds: [] })).toBe(false);
    expect(platformSelectionValidFor(otherCc, { platforms: [], shopIds: [ruChannel] })).toBe(false);
    expect(effectiveChannelIds(otherCc, { platforms: [ruPlatform], shopIds: [] })).toEqual([]);
  });

  it('不存在的渠道 id 不合法', () => {
    expect(platformSelectionValidFor('RU', { platforms: [], shopIds: ['RU:nope:1P'] })).toBe(false);
  });
});
