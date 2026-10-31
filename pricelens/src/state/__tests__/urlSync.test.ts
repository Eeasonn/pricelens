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
      seller: null,
    });
    // 旧多选持久化：platforms 多值 → 取第一个（平台级兼容），shopIds 清空
    const multi: PlatformSelection = { platforms: ['OZON', 'DNS'], shopIds: [] };
    expect(normalizePlatformSelection(multi)).toEqual({ platforms: ['OZON'], shopIds: [] });
    // platforms 与 shopIds 同存：店铺级优先，platforms 不得残留
    expect(normalizePlatformSelection({ platforms: ['DNS'], shopIds: ['RU:ozon:1P'] })).toEqual({
      platforms: [],
      shopIds: ['RU:ozon:1P'],
      seller: null,
    });
    // 空选 / null → null（= 默认口径）；多值渠道取第一个。越界/未知渠道 id 保留原值，
    // 国家校验交给 applyScopeDefaults 的 platformSelectionValidFor（越界回落默认口径）
    expect(normalizePlatformSelection({ platforms: [], shopIds: [] })).toBeNull();
    expect(normalizePlatformSelection(null)).toBeNull();
    expect(normalizePlatformSelection({ platforms: [], shopIds: ['XX:ghost:1P', 'junk'] })).toEqual({
      platforms: [],
      shopIds: ['XX:ghost:1P'],
      seller: null,
    });
  });

  it('readUrlOverrides：shop= 解析为单渠道口径（platforms 为空，不再映射平台）', () => {
    const out = withWindowSearch('?c=RU&shop=RU:ozon:1P', () => readUrlOverrides());
    expect(out.filters.platform).toEqual({ platforms: [], shopIds: ['RU:ozon:1P'], seller: null });
  });

  it('readUrlOverrides：旧多值链接 plat=OZON,DNS 取第一个归一为平台级单选', () => {
    const out = withWindowSearch('?c=RU&plat=OZON,DNS', () => readUrlOverrides());
    expect(out.filters.platform).toEqual({ platforms: ['OZON'], shopIds: [] });
  });

  it('readUrlOverrides：plat 与 shop 同存时 shop 优先（单店口径）', () => {
    const out = withWindowSearch('?c=RU&plat=DNS&shop=RU:ozon:1P', () => readUrlOverrides());
    expect(out.filters.platform).toEqual({ platforms: [], shopIds: ['RU:ozon:1P'], seller: null });
  });

  it('readUrlOverrides：未带平台参数时不产生 platform 覆写', () => {
    const out = withWindowSearch('?c=RU&cur=usd', () => readUrlOverrides());
    expect(out.filters.platform).toBeUndefined();
  });
});

// ---------------- 卖家（seller）细化（第一百四十一轮） ----------------
describe('seller-level platform selection', () => {
  it('normalizePlatformSelection：单渠道保留 seller，多渠道/平台级/空串剥除', () => {
    expect(normalizePlatformSelection({ platforms: [], shopIds: ['RU:ozon:3P'], seller: 'Epicenter Huawei Store' })).toEqual({
      platforms: [],
      shopIds: ['RU:ozon:3P'],
      seller: 'Epicenter Huawei Store',
    });
    // 多渠道（旧多值兼容）：卖家无处附着，剥除
    expect(normalizePlatformSelection({ platforms: [], shopIds: ['RU:ozon:3P', 'RU:ozon:1P'], seller: 'X' })).toEqual({
      platforms: [],
      shopIds: ['RU:ozon:3P'],
      seller: null,
    });
    // 平台级：剥除
    expect(normalizePlatformSelection({ platforms: ['OZON'], shopIds: [], seller: 'X' })).toEqual({
      platforms: ['OZON'],
      shopIds: [],
    });
    // 空串 = 未选卖家
    expect(normalizePlatformSelection({ platforms: [], shopIds: ['RU:ozon:3P'], seller: '' })?.seller ?? null).toBeNull();
  });

  it('platformUrlParamsOf：店铺级带 seller，平台级/未选恒 null', () => {
    expect(platformUrlParamsOf({ platforms: [], shopIds: ['RU:ozon:3P'], seller: 'Epicenter' })).toEqual({
      plat: 'OZON',
      shop: 'RU:ozon:3P',
      seller: 'Epicenter',
    });
    expect(platformUrlParamsOf({ platforms: [], shopIds: ['RU:ozon:3P'] })).toEqual({
      plat: 'OZON',
      shop: 'RU:ozon:3P',
      seller: null,
    });
    expect(platformUrlParamsOf({ platforms: ['DNS'], shopIds: [] }).seller).toBeNull();
  });

  it('readUrlOverrides：seller= 仅与 shop= 同存时读入；无 shop 静默忽略', () => {
    const ok = withWindowSearch('?c=RU&shop=RU:ozon:3P&seller=Epicenter', () => readUrlOverrides());
    expect(ok.filters.platform).toEqual({ platforms: [], shopIds: ['RU:ozon:3P'], seller: 'Epicenter' });
    const noShop = withWindowSearch('?c=RU&plat=OZON&seller=Epicenter', () => readUrlOverrides());
    expect(noShop.filters.platform).toEqual({ platforms: ['OZON'], shopIds: [] });
  });
});

describe('platform/shop url params write', () => {
  it('platformUrlParamsOf：店铺级写 plat+shop（平台由维表反查），平台级只写 plat，未选两者皆空', () => {
    // 店铺级：plat 从 dimChannel 反查（RU:ozon:1P → OZON）
    expect(platformUrlParamsOf({ platforms: [], shopIds: ['RU:ozon:1P'] })).toEqual({ plat: 'OZON', shop: 'RU:ozon:1P', seller: null });
    // 仅平台级（旧兼容）：只写 plat=
    expect(platformUrlParamsOf({ platforms: ['DNS'], shopIds: [] })).toEqual({ plat: 'DNS', shop: null, seller: null });
    // 未选：两者皆 null（写侧删键）
    expect(platformUrlParamsOf(null)).toEqual({ plat: null, shop: null, seller: null });
    expect(platformUrlParamsOf({ platforms: [], shopIds: [] })).toEqual({ plat: null, shop: null, seller: null });
    // 维表查不到的渠道 id：按三段式 id 的平台段兜底反查
    expect(platformUrlParamsOf({ platforms: [], shopIds: ['XX:ghost:1P'] })).toEqual({ plat: 'ghost', shop: 'XX:ghost:1P', seller: null });
  });
});

// ---------------- 时间范围 / 价格显示 / 汇总口径入链（第一百三十八轮） ----------------
// rs/re = 手动范围（读入即退出自适应）；pt = 价格显示（d/r/dr）；agg = avg/min。
// 分享链接带全取数上下文，参数不合法静默忽略。
describe('range / priceTypes / agg url params', () => {
  it('rs/re 形状合法且有序 → 固定范围 + 退出自适应（链接范围 = 手动范围语义）', () => {
    const out = withWindowSearch('?c=RU&rs=202619&re=202636', () => readUrlOverrides());
    expect(out.filters.rangeStart).toBe('202619');
    expect(out.filters.rangeEnd).toBe('202636');
    expect(out.filters.adaptive).toBe(false);
  });

  it('季桶 id（YYYYQn）可读；范围倒挂 / 形状非法静默忽略（不写 adaptive）', () => {
    const ok = withWindowSearch('?rs=2026Q1&re=2026Q3', () => readUrlOverrides());
    expect(ok.filters.rangeStart).toBe('2026Q1');
    expect(ok.filters.rangeEnd).toBe('2026Q3');
    const inverted = withWindowSearch('?rs=202640&re=202610', () => readUrlOverrides());
    expect(inverted.filters.rangeStart).toBeUndefined();
    expect(inverted.filters.adaptive).toBeUndefined();
    const ugly = withWindowSearch('?rs=abc&re=202640', () => readUrlOverrides());
    expect(ugly.filters.rangeStart).toBeUndefined();
    expect(ugly.filters.adaptive).toBeUndefined();
  });

  it('pt=d/r/dr 三态与 agg=avg/min 读入；非法值忽略', () => {
    expect(withWindowSearch('?pt=dr&agg=min', () => readUrlOverrides()).filters).toMatchObject({
      priceTypes: { discounted: true, rrp: true },
      agg: 'min',
    });
    expect(withWindowSearch('?pt=d', () => readUrlOverrides()).filters.priceTypes).toEqual({ discounted: true, rrp: false });
    expect(withWindowSearch('?pt=r', () => readUrlOverrides()).filters.priceTypes).toEqual({ discounted: false, rrp: true });
    const bad = withWindowSearch('?pt=x&agg=max', () => readUrlOverrides());
    expect(bad.filters.priceTypes).toBeUndefined();
    expect(bad.filters.agg).toBeUndefined();
  });
});

describe('new product tabs url entry', () => {
  it('restores intelligence and forecast tabs from shared links', () => {
    expect(withWindowSearch('?p=intelligence', () => readUrlOverrides()).page).toBe('intelligence');
    expect(withWindowSearch('?p=forecast', () => readUrlOverrides()).page).toBe('forecast');
  });
});
