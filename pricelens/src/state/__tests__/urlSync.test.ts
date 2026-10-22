import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { lowestPriceColorSku } from '../../dataModel/aggregate';
import { normalizePlatformSelection, platformUrlParamsOf, productSelectionOfSeriesKey, readUrlOverrides } from '../urlSync';
import type { PlatformSelection } from '../filtersTypes';

// 第一百一十七轮：URL 主分析参数（main，旧名 own 兼容）不再限华为——
// 主分析/对比是用户指定的角色，任意品牌都可通过链接进入。
// 第一百二十三轮：按档位主体模式退役，旧链接的 m=tier / t= 参数静默忽略
// （readUrlOverrides 不再解析；readUrlOverrides 依赖 window，Node 金测
// 无法注入 location，故此处不覆盖该分支——解析层已无档位字段可写）。
// 第一百二十五轮：解析 main 时按链接自带的国家取代表色 SKU（此前按持久化国家，
// 跨国链接在该国无价即把主品整个丢掉）。
describe('series key selection', () => {
  it('resolves any-brand series keys (main analysis is role, not identity)', () => {
    const competitor = dimProduct.find((p) => !p.is_own)!;
    const key = `${competitor.sku_id.split('__')[0]}__${competitor.romram.replace(/\s+/g, '')}`;
    expect(productSelectionOfSeriesKey(key)?.modelId).toBe(competitor.sku_id.split('__')[0]);
  });

  it('returns null for unknown model or romram (hand-edited links are ignored)', () => {
    expect(productSelectionOfSeriesKey('cmp-not-exist__12256')).toBeNull();
    expect(productSelectionOfSeriesKey('no-separator')).toBeNull();
  });

  it('链接自带国家时按该国取代表色：只在非 RU 国家有数据的产品，缺省国家（RU）解析会丢、显式传国家能还原', () => {
    const foreign = dimProduct.find(
      (p) => !p.countries.includes('RU') && p.countries.length > 0 && lowestPriceColorSku(p.model_id, p.romram, p.countries[0]) != null,
    )!;
    expect(foreign).toBeDefined();
    const key = `${foreign.model_id}__${foreign.romram.replace(/\s+/g, '')}`;
    expect(productSelectionOfSeriesKey(key)).toBeNull();
    const sel = productSelectionOfSeriesKey(key, foreign.countries[0]);
    expect(sel?.modelId).toBe(foreign.model_id);
    expect(sel?.romram).toBe(foreign.romram);
    expect(sel?.skuIds[0].startsWith(`${foreign.model_id}__`)).toBe(true);
  });
});

// ---------------- 平台/店铺单选归一（筛选器选到「某平台下的某个店铺」） ----------------
// readUrlOverrides 只读 window.location.search（Node 金测无 location），
// 用最小伪 window 注入 search 串验证 plat=/shop= 的单选归一读写。
function withWindowSearch<T>(search: string, fn: () => T): T {
  const g = globalThis as { window?: unknown };
  const prev = g.window;
  g.window = { location: { search } };
  try {
    return fn();
  } finally {
    if (prev === undefined) delete g.window;
    else g.window = prev;
  }
}

describe('platform/shop single-select normalization', () => {
  it('normalizePlatformSelection：店铺级保留渠道 id 且 platforms 必须清空，多平台取第一个，空选/null = 默认口径', () => {
    // 店铺（渠道）级：保留 channel_id、platforms 清空——数据层 effectiveChannelIds
    // 为并集规则（platforms 命中即整平台渠道入池），店铺级残留 platforms 会放大口径
    expect(normalizePlatformSelection({ platforms: [], shopIds: ['RU:ozon:1P'] })).toEqual({
      platforms: [],
      shopIds: ['RU:ozon:1P'],
    });
    // 旧多选持久化：platforms 多值 → 取第一个（平台级兼容），shopIds 清空
    const multi: PlatformSelection = { platforms: ['OZON', 'DNS'], shopIds: [] };
    expect(normalizePlatformSelection(multi)).toEqual({ platforms: ['OZON'], shopIds: [] });
    // platforms 与 shopIds 同存：店铺级优先，platforms 不得残留
    expect(normalizePlatformSelection({ platforms: ['DNS'], shopIds: ['RU:ozon:1P'] })).toEqual({
      platforms: [],
      shopIds: ['RU:ozon:1P'],
    });
    // 空选 / null → null（= 默认口径）；多值渠道取第一个。越界/未知渠道 id 保留原值，
    // 国家校验交给 applyScopeDefaults 的 platformSelectionValidFor（越界回落默认口径）
    expect(normalizePlatformSelection({ platforms: [], shopIds: [] })).toBeNull();
    expect(normalizePlatformSelection(null)).toBeNull();
    expect(normalizePlatformSelection({ platforms: [], shopIds: ['XX:ghost:1P', 'junk'] })).toEqual({
      platforms: [],
      shopIds: ['XX:ghost:1P'],
    });
  });

  it('readUrlOverrides：shop= 解析为单渠道口径（platforms 为空，不再映射平台）', () => {
    const out = withWindowSearch('?c=RU&shop=RU:ozon:1P', () => readUrlOverrides());
    expect(out.filters.platform).toEqual({ platforms: [], shopIds: ['RU:ozon:1P'] });
  });

  it('readUrlOverrides：旧多值链接 plat=OZON,DNS 取第一个归一为平台级单选', () => {
    const out = withWindowSearch('?c=RU&plat=OZON,DNS', () => readUrlOverrides());
    expect(out.filters.platform).toEqual({ platforms: ['OZON'], shopIds: [] });
  });

  it('readUrlOverrides：plat 与 shop 同存时 shop 优先（单店口径）', () => {
    const out = withWindowSearch('?c=RU&plat=DNS&shop=RU:ozon:1P', () => readUrlOverrides());
    expect(out.filters.platform).toEqual({ platforms: [], shopIds: ['RU:ozon:1P'] });
  });

  it('readUrlOverrides：未带平台参数时不产生 platform 覆写', () => {
    const out = withWindowSearch('?c=RU&cur=usd', () => readUrlOverrides());
    expect(out.filters.platform).toBeUndefined();
  });
});

describe('platform/shop url params write', () => {
  it('platformUrlParamsOf：店铺级写 plat+shop（平台由维表反查），平台级只写 plat，未选两者皆空', () => {
    // 店铺级：plat 从 dimChannel 反查（RU:ozon:1P → OZON）
    expect(platformUrlParamsOf({ platforms: [], shopIds: ['RU:ozon:1P'] })).toEqual({ plat: 'OZON', shop: 'RU:ozon:1P' });
    // 仅平台级（旧兼容）：只写 plat=
    expect(platformUrlParamsOf({ platforms: ['DNS'], shopIds: [] })).toEqual({ plat: 'DNS', shop: null });
    // 未选：两者皆 null（写侧删键）
    expect(platformUrlParamsOf(null)).toEqual({ plat: null, shop: null });
    expect(platformUrlParamsOf({ platforms: [], shopIds: [] })).toEqual({ plat: null, shop: null });
    // 维表查不到的渠道 id：按三段式 id 的平台段兜底反查
    expect(platformUrlParamsOf({ platforms: [], shopIds: ['XX:ghost:1P'] })).toEqual({ plat: 'ghost', shop: 'XX:ghost:1P' });
  });
});
