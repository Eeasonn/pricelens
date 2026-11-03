// ============================================================
// promoShared 单元测试（2026-11-03 量价页大促档期对齐）：
// ① 深度色三档定值（价格页 Chart 原硬编码值，抽 promoShared 后回归锁值）；
// ② scopedPromosOf：国家圈定 / 平台并集圈定（归一化大小写与非字母数字容忍）/
//    全渠道档期（platforms=null）恒显示 / 空平台集回落国家默认平台锚点。
// ============================================================
import { describe, expect, it } from 'vitest';
import { bandColorOf, normalizedPlatformKey, promoDepthDotColorOf, scopedPromosOf } from '../promoShared';
import { defaultPlatformAnchorOf } from '../../../dataModel/aggregate';
import type { DimPromo } from '../../../dataModel/types';

const P = (over: Partial<DimPromo>): DimPromo => ({
  promo_id: 'p1',
  country_code: 'RU',
  promo_name: 'BTS返校季',
  start_date: '2026-08-01',
  end_date: '2026-09-30',
  depth_hint: '深',
  platforms: null,
  channel_raw: 'ALL',
  ...over,
});

describe('bandColorOf / promoDepthDotColorOf（深度色定值回归）', () => {
  it('背景带三档 alpha：0.055 / 0.035 / 0.018（原 Chart.tsx 硬编码值）', () => {
    expect(bandColorOf('深')).toBe('rgba(235, 87, 87, 0.055)');
    expect(bandColorOf('中')).toBe('rgba(235, 87, 87, 0.035)');
    expect(bandColorOf('浅')).toBe('rgba(235, 87, 87, 0.018)');
  });

  it('事件卡深度点三档 alpha：0.75 / 0.5 / 0.3（原事件卡硬编码值）', () => {
    expect(promoDepthDotColorOf('深')).toBe('rgba(235, 87, 87, 0.75)');
    expect(promoDepthDotColorOf('中')).toBe('rgba(235, 87, 87, 0.5)');
    expect(promoDepthDotColorOf('浅')).toBe('rgba(235, 87, 87, 0.3)');
  });
});

describe('scopedPromosOf（国家 × 平台并集圈定）', () => {
  it('只保留国家命中的档期', () => {
    const out = scopedPromosOf({
      promos: [P({ promo_id: 'ru' }), P({ promo_id: 'de', country_code: 'DE' })],
      countryCode: 'RU',
      platforms: ['Ozon'],
    });
    expect(out.map((p) => p.promo_id)).toEqual(['ru']);
  });

  it('platforms=null（全渠道）恒显示；标注平台的档期命中并集才显示', () => {
    const out = scopedPromosOf({
      promos: [
        P({ promo_id: 'all', platforms: null }),
        P({ promo_id: 'ozon', platforms: ['Ozon'] }),
        P({ promo_id: 'yandex', platforms: ['Яндекс Маркет'] }),
      ],
      countryCode: 'RU',
      platforms: ['ozon'],
    });
    expect(out.map((p) => p.promo_id)).toEqual(['all', 'ozon']);
  });

  it('平台名归一化：大小写 / 空格 / 非字母数字差异不漏配', () => {
    expect(normalizedPlatformKey('Ozon МАРКЕТ 24')).toBe(normalizedPlatformKey('ozonмаркет24'));
    const out = scopedPromosOf({
      promos: [P({ promo_id: 'wild', platforms: ['Wildberries  ШИПКА'] })],
      countryCode: 'RU',
      platforms: ['WILDBERRIES'],
    });
    expect(out).toHaveLength(1);
  });

  it('平台集为空 → 回国家默认平台锚点（defaultPlatformAnchorOf），其平台档期仍显示', () => {
    const cc = 'RU';
    const dp = defaultPlatformAnchorOf(cc);
    const out = scopedPromosOf({
      promos: [P({ promo_id: 'dp-only', platforms: dp ? [dp.toUpperCase()] : [] })],
      countryCode: cc,
      platforms: new Set<string>(),
    });
    if (dp) expect(out.map((p) => p.promo_id)).toEqual(['dp-only']);
    else expect(out).toHaveLength(0);
  });

  it('空平台集 + 无默认平台档期 → 平台标注档期不显示、全渠道仍显示', () => {
    const cc = 'ZZ-NONE';
    const out = scopedPromosOf({
      promos: [
        P({ promo_id: 'all', country_code: cc, platforms: null }),
        P({ promo_id: 'x', country_code: cc, platforms: ['Ozon'] }),
      ],
      countryCode: cc,
      platforms: [],
    });
    expect(out.map((p) => p.promo_id)).toEqual(['all']);
  });
});
