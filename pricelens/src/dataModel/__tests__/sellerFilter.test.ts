// ============================================================
// 卖家（seller）细化口径单测（第一百四十一轮）：渠道内默认取全部卖家最低在架价，
// PlatformQuery.seller 指定后取价收敛到该卖家。锚定：
//   - sellersOfChannel：覆盖周数降序、独立站渠道单卖家、OZON 3P 数百家；
//   - priceForSelection 带 seller = 该卖家行直算一致、≥ 渠道最低价；
//   - seller 不存在 = null（上层 applyScopeDefaults 会剥除，这里是最后防线）；
//   - buildSeries 带 seller：折线值 = 该卖家价（现价/取证店铺随行带出）。
// 作用域 RU / phone（nova 14 锚系列，与 alerts 金测同源）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, factPriceWeekly } from '../../data';
import { buildSeries, priceForSelection, sellersOfChannel } from '../aggregate';

const CC = 'RU';
const CH = 'RU:ozon:3P'; // 387 家卖家的多卖家渠道

const novaSku = dimProduct.find((p) => p.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const SOME_WEEK = '202636'; // nova 14 在 OZON 3P 有真实行（barePrice 金测同域）

describe('sellersOfChannel（渠道内卖家清单）', () => {
  it('OZON 3P 数百家、按覆盖周数降序；独立站渠道单卖家', () => {
    const sellers = sellersOfChannel(CC, CH);
    expect(sellers.length).toBeGreaterThan(50);
    for (let i = 1; i < sellers.length; i++) {
      expect(sellers[i - 1].weeks).toBeGreaterThanOrEqual(sellers[i].weeks);
    }
    const dns = sellersOfChannel(CC, 'RU:dns:独立站');
    expect(dns.length).toBe(1);
    expect(dns[0].weeks).toBeGreaterThan(0);
  });

  it('每家卖家 weeks ≥ 1 且 ≤ 全域周数（24）', () => {
    for (const x of sellersOfChannel(CC, CH)) {
      expect(x.weeks).toBeGreaterThanOrEqual(1);
      expect(x.weeks).toBeLessThanOrEqual(24);
    }
  });
});

describe('priceForSelection 的 seller 收敛', () => {
  it('指定卖家 = 该卖家最低行直算一致；恒 ≥ 渠道内全部卖家最低价', () => {
    // 该周该渠道实际有 nova 14 行的卖家（覆盖榜首位可能当周无此 SKU 行）
    const weekSellers = [
      ...new Set(
        factPriceWeekly
          .filter((r) => r.country_code === CC && r.channel_id === CH && r.week_id === SOME_WEEK && r.sku_id === novaSku.sku_id && r.price_local != null)
          .map((r) => r.seller),
      ),
    ];
    expect(weekSellers.length).toBeGreaterThan(0);
    const target = weekSellers[0];
    const chMin = priceForSelection(novaSku.sku_id, SOME_WEEK, CC, { platforms: [], shopIds: [CH] }, 'usd');
    const sellerHit = priceForSelection(
      novaSku.sku_id,
      SOME_WEEK,
      CC,
      { platforms: [], shopIds: [CH], seller: target },
      'usd',
    );
    expect(chMin).not.toBeNull();
    expect(sellerHit).not.toBeNull();
    expect(sellerHit!.row.seller).toBe(target);
    expect(sellerHit!.price).toBeGreaterThanOrEqual(chMin!.price);
  });

  it('seller = null 与不传同口径（渠道内最低）；不存在的卖家 = null（防线）', () => {
    const a = priceForSelection(novaSku.sku_id, SOME_WEEK, CC, { platforms: [], shopIds: [CH], seller: null }, 'usd');
    const b = priceForSelection(novaSku.sku_id, SOME_WEEK, CC, { platforms: [], shopIds: [CH] }, 'usd');
    expect(a?.price).toBe(b?.price);
    const ghost = priceForSelection(
      novaSku.sku_id,
      SOME_WEEK,
      CC,
      { platforms: [], shopIds: [CH], seller: '不存在的卖家' },
      'usd',
    );
    expect(ghost).toBeNull();
  });
});

describe('buildSeries 的 seller 收敛', () => {
  it('带 seller 的折线值 = 单点取价（同 SKU 同周）；shopName 前缀 = 渠道 · 卖家', () => {
    const weekSellers = [
      ...new Set(
        factPriceWeekly
          .filter((r) => r.country_code === CC && r.channel_id === CH && r.week_id === SOME_WEEK && r.sku_id === novaSku.sku_id && r.price_local != null)
          .map((r) => r.seller),
      ),
    ];
    const target = weekSellers[0];
    const [s] = buildSeries({
      scope: { countryCode: CC, industry: 'phone' },
      granularity: 'week',
      groups: [{ modelId: novaSku.model_id, romram: novaSku.romram, skuIds: [novaSku.sku_id], isOwn: true }],
      startBucket: '202619',
      endBucket: '202642',
      agg: 'avg',
      platform: { platforms: [], shopIds: [CH], seller: target },
      currency: 'usd',
    });
    expect(s).toBeDefined();
    const priced = s.points.find((p) => p.price != null && p.bucketId === SOME_WEEK);
    expect(priced).toBeDefined();
    const single = priceForSelection(novaSku.sku_id, SOME_WEEK, CC, { platforms: [], shopIds: [CH], seller: target }, 'usd');
    expect(priced!.price).toBe(Math.round(single!.price)); // SeriesPoint 价已取整
    expect(priced!.shopName).toContain(target);
  });
});
