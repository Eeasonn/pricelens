import { afterEach, describe, expect, it, vi } from 'vitest';
import { dimProduct } from '../../data';
import { buildOverviewMatrix, buildSeries } from '../aggregate';
import { buildAlerts } from '../alerts';
import { DEFAULT_DATA_SCOPE } from '../scope';
import { getFxRate, saveFx } from '../../state/configStore';
import { perUsdOf } from '../../chart/PriceTrend/helpers';

const ownSku = dimProduct.find((p) => p.is_own && p.model_name === 'Pura 90s Pro' && p.romram.startsWith('12+256'))!;
const baseQuery = {
  scope: DEFAULT_DATA_SCOPE,
  groups: [{ modelId: ownSku.sku_id.split('__')[0], romram: ownSku.romram, skuIds: [ownSku.sku_id], isOwn: true }],
  granularity: 'week' as const,
  startBucket: '202641',
  endBucket: '202641',
  currency: 'usd' as const,
  agg: 'avg' as const,
};

describe('aggregate platform/source口径', () => {
  it('来源文案跟随平台/店铺选择，不再固定为 Ozon Россия', () => {
    expect(buildSeries({ ...baseQuery, platform: null })[0].points[0].shopName).toBe('Ozon Россия');
    expect(buildSeries({ ...baseQuery, platform: { platforms: ['DNS'], shopIds: [] } })[0].points[0].shopName).toBe('DNS');
    expect(buildSeries({ ...baseQuery, platform: { platforms: [], shopIds: ['shop-047'] } })[0].points[0].shopName).toBe('M.Video');
    expect(buildSeries({ ...baseQuery, platform: { platforms: ['DNS', 'M.Video'], shopIds: [] } })[0].points[0].shopName).toBe('DNS、M.Video');
  });
});

describe('reference FX getter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('perUsdOf(local) reads the saved reference FX rate', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    } });
    expect(getFxRate()).toBe(80);
    saveFx(92);
    expect(perUsdOf('local')).toBe(92);
    expect(perUsdOf('usd')).toBe(1);

    // The local fact remains canonical; changing the reference FX only changes
    // USD conversion, and all consumers must observe the same converted value.
    saveFx(80);
    const local80 = buildSeries({ ...baseQuery, currency: 'local', platform: null })[0].points[0].price;
    const overview80 = buildOverviewMatrix('usd')[1].models.find((m) => m.modelId === 'own-pura-90s-pro')!.rows.find((r) => r.romram.startsWith('12+256'))!.price;
    const key = `${ownSku.sku_id.split('__')[0]}__${ownSku.romram.replace(/\s+/g, '')}`;
    const alerts80 = buildAlerts({
      subs: [key],
      enabled: { 'price-change': true, promo: false, 'platform-gap': false, 'own-gap': false },
      thresholds: { 'price-change': 0.0001, promo: 0.01, 'platform-gap': 0.01, 'own-gap': 0.15 },
      currency: 'usd',
    });
    saveFx(92);
    const local92 = buildSeries({ ...baseQuery, currency: 'local', platform: null })[0].points[0].price;
    const overview92 = buildOverviewMatrix('usd')[1].models.find((m) => m.modelId === 'own-pura-90s-pro')!.rows.find((r) => r.romram.startsWith('12+256'))!.price;
    const alerts92 = buildAlerts({
      subs: [key],
      enabled: { 'price-change': true, promo: false, 'platform-gap': false, 'own-gap': false },
      thresholds: { 'price-change': 0.0001, promo: 0.01, 'platform-gap': 0.01, 'own-gap': 0.15 },
      currency: 'usd',
    });
    expect(local92).toBe(local80);
    expect(overview92).not.toBe(overview80);
    expect(alerts92.find((a) => a.weekId === alerts80[0]?.weekId)?.price).not.toBe(alerts80[0]?.price);
  });
});
