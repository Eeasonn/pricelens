// ============================================================
// aggregate 平台/店铺口径 + 本币汇率注册（2026-10-20 真实数据版）：
// - 真实数据无平台因子：shopName = 所选渠道的显示名 · 店铺，取价 = 渠道集合内最低在架价；
// - 参考汇率已删（fact 行内汇率）：getFxRate() = 当前国家本币的最新 per-USD 中位数。
// 锚点均从 factPriceWeekly / dimChannel 独立直算，随数据重生成自动对齐。
// ============================================================
import { afterEach, describe, expect, it } from 'vitest';
import { dimChannel, dimProduct, factPriceWeekly, latestPerUsd } from '../../data';
import { buildSeries } from '../aggregate';
import { getFxRate, getLocalCurrency, setLocalCurrencyByCountry } from '../../state/fx';
import { perUsdOf } from '../../chart/PriceTrend/helpers';

// HUAWEI nova 14 12+256 GB（黑）：RU 同时有 DNS 与 OZON(3P) 行，是「渠道选择改取价」的锚 SKU。
// （RU 默认我司机型 Pura 90s Pro Max 仅有 DNS 行，改用 nova 14 覆盖多渠道口径。）
const anchorSku = dimProduct.find((p) => p.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const ANCHOR_WEEK = '202640'; // 该周 fact：DNS 28999₽ / OZON 3P 22099₽（行内汇率 85.45）

const baseQuery = {
  scope: { countryCode: 'RU', industry: 'phone' } as const,
  groups: [{ modelId: anchorSku.model_id, romram: anchorSku.romram, skuIds: [anchorSku.sku_id], isOwn: true }],
  granularity: 'week' as const,
  startBucket: ANCHOR_WEEK,
  endBucket: ANCHOR_WEEK,
  currency: 'usd' as const,
  agg: 'avg' as const,
};

/** fact 直算：某渠道集合内最低 price_usd（与 aggregate 的 minPriceRow 同口径、独立实现） */
function minUsdPrice(skuId: string, weekId: string, channelIds: string[]): number | null {
  const set = new Set(channelIds);
  const vals = factPriceWeekly
    .filter((r) => r.sku_id === skuId && r.week_id === weekId && set.has(r.channel_id) && r.price_usd != null)
    .map((r) => r.price_usd!);
  return vals.length ? Math.min(...vals) : null;
}

const channelsOfPlatform = (platform: string): string[] =>
  dimChannel.filter((c) => c.country_code === 'RU' && c.platform === platform).map((c) => c.channel_id);

describe('aggregate platform/source口径', () => {
  it('来源文案跟随渠道选择：缺省 = 该国默认平台（DNS），显式 OZON / 单渠道 shopId 各随其渠道', () => {
    const pt = (platform: { platforms: string[]; shopIds: [] | string[] } | null) =>
      buildSeries({ ...baseQuery, platform })[0].points[0];

    // 缺省 = RU 默认平台 DNS（dim_region.core_platforms[0]）。
    // 店铺名 'DNS' 已含在渠道显示名 'DNS 独立站' 内 → 冗余后缀省略，只显示渠道名。
    expect(pt(null)!.shopName).toBe('DNS 独立站');
    // 显式 OZON → 该平台最低价行（3P 渠道）文案以 OZON 开头（卖家名 UNREADABLE 不冗余，带出）
    expect(pt({ platforms: ['OZON'], shopIds: [] })!.shopName).toMatch(/^OZON/);
    // 勾到具体渠道（channel_id）→ 同渠道文案
    expect(pt({ platforms: [], shopIds: ['RU:dns:独立站'] })!.shopName).toBe('DNS 独立站');
    // 多平台并选取最低在架价：OZON 3P 22 099₽ < DNS 28 999₽ → 取价店铺随最低价渠道
    const union = pt({ platforms: ['DNS', 'OZON'], shopIds: [] })!;
    const expectUsd = minUsdPrice(anchorSku.sku_id, ANCHOR_WEEK, [...channelsOfPlatform('DNS'), ...channelsOfPlatform('OZON')]);
    expect(union.price).toBe(Math.round(expectUsd!));
    expect(union.shopName).toBe(pt({ platforms: ['OZON'], shopIds: [] })!.shopName);
  });

  it('取价 = 渠道集合内真实最低在架价（无平台因子）：单平台选择锚到 fact 直算', () => {
    const dns = buildSeries({ ...baseQuery, platform: { platforms: ['DNS'], shopIds: [] } })[0].points[0];
    const ozon = buildSeries({ ...baseQuery, platform: { platforms: ['OZON'], shopIds: [] } })[0].points[0];
    expect(dns!.price).toBe(Math.round(minUsdPrice(anchorSku.sku_id, ANCHOR_WEEK, channelsOfPlatform('DNS'))!));
    expect(ozon!.price).toBe(Math.round(minUsdPrice(anchorSku.sku_id, ANCHOR_WEEK, channelsOfPlatform('OZON'))!));
    // 锚周真实数据：OZON 明显低于 DNS（202640：22099₽ vs 28999₽），不应再有任何固定因子序
    expect(ozon!.price!).toBeLessThan(dns!.price!);
  });
});

describe('reference FX getter', () => {
  afterEach(() => {
    setLocalCurrencyByCountry('RU'); // 还原模块级本币注册，避免跨用例污染
  });

  it('getFxRate() = 当前国家本币的最新 per-USD（dim_fx 最新月中位数）；不再是可保存的用户参考汇率', () => {
    setLocalCurrencyByCountry('RU');
    // 84.04 = dim_fx RUB 202610 per_usd（ingest 从 fact 行内汇率取中位数）
    expect(getLocalCurrency()).toBe('RUB');
    expect(getFxRate()).toBe(latestPerUsd('RUB'));
    expect(getFxRate()).toBe(84.04);

    // 图表 perUsd 锚定与 FX 注册同源：local → 当前本币 per-USD；usd → 1
    expect(perUsdOf('local')).toBe(getFxRate());
    expect(perUsdOf('usd')).toBe(1);

    // 国家切换 → 本币注册随之切换（FiltersProvider 的行为）
    setLocalCurrencyByCountry('SA');
    expect(getFxRate()).toBe(latestPerUsd('SAR'));
    expect(getFxRate()).toBe(3.75); // SAR pegged: dim_fx 全月份恒 3.75
  });

  it('USD 折算恒为行内汇率，不随本币注册变化：切国前后同一查询 USD 值逐字节一致', () => {
    setLocalCurrencyByCountry('RU');
    const usdBefore = buildSeries({ ...baseQuery, currency: 'usd', platform: null })[0].points[0].price;
    const localBefore = buildSeries({ ...baseQuery, currency: 'local', platform: null })[0].points[0].price;
    setLocalCurrencyByCountry('SA'); // 只改展示态，不得影响数据层折算
    expect(buildSeries({ ...baseQuery, currency: 'usd', platform: null })[0].points[0].price).toBe(usdBefore);
    expect(buildSeries({ ...baseQuery, currency: 'local', platform: null })[0].points[0].price).toBe(localBefore);
    // 本币锚点：nova 14 12+256 DNS @202640 = 28 999 ₽（fact price_local 直读）
    expect(localBefore).toBe(28999);
  });
});
