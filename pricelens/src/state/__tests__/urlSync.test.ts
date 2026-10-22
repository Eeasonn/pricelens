import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { lowestPriceColorSku } from '../../dataModel/aggregate';
import { normalizePlatformSelection, productSelectionOfSeriesKey, readUrlOverrides } from '../urlSync';
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

// ---------------- 平台单选归一（平台筛选器从多选改回单选） ----------------
// readUrlOverrides 只读 window.location.search（Node 金测无 location），
// 用最小伪 window 注入 search 串验证 plat=/shop= 的单选归一读取。
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

describe('platform single-select normalization', () => {
  it('normalizePlatformSelection：旧多平台取第一个，渠道下钻映射为其所属平台，空选/null = 默认电渠', () => {
    // 旧多选持久化：platforms 多值 → 取第一个，shopIds 清空
    const multi: PlatformSelection = { platforms: ['OZON', 'DNS'], shopIds: ['RU:ozon:1P'] };
    expect(normalizePlatformSelection(multi)).toEqual({ platforms: ['OZON'], shopIds: [] });
    // 旧店铺级勾选：单渠道 id → 其所属平台（dimChannel 反查 RU:ozon:1P → OZON）
    expect(normalizePlatformSelection({ platforms: [], shopIds: ['RU:ozon:1P'] })).toEqual({
      platforms: ['OZON'],
      shopIds: [],
    });
    // 空选 / null → null（= 该国默认电渠）；维表查不到的渠道 id 按三段式 id 的平台段兜底
    //（越界平台随后由 applyScopeDefaults 的 platformSelectionValidFor 回落默认电渠）；
    // 连平台段都解析不出 → null
    expect(normalizePlatformSelection({ platforms: [], shopIds: [] })).toBeNull();
    expect(normalizePlatformSelection(null)).toBeNull();
    expect(normalizePlatformSelection({ platforms: [], shopIds: ['XX:ghost:1P'] })).toEqual({
      platforms: ['ghost'],
      shopIds: [],
    });
    expect(normalizePlatformSelection({ platforms: [], shopIds: ['junk'] })).toBeNull();
  });

  it('readUrlOverrides：旧多值链接 plat=OZON,DNS 取第一个归一为单选', () => {
    const out = withWindowSearch('?c=RU&plat=OZON,DNS', () => readUrlOverrides());
    expect(out.filters.platform).toEqual({ platforms: ['OZON'], shopIds: [] });
  });

  it('readUrlOverrides：旧 shop= 渠道 id 映射为其所属平台，不再产生渠道级勾选', () => {
    const out = withWindowSearch('?c=RU&shop=RU:ozon:1P', () => readUrlOverrides());
    expect(out.filters.platform).toEqual({ platforms: ['OZON'], shopIds: [] });
  });

  it('readUrlOverrides：plat 与 shop 同存时 plat 优先（单选无并集语义）', () => {
    const out = withWindowSearch('?c=RU&plat=DNS&shop=RU:ozon:1P', () => readUrlOverrides());
    expect(out.filters.platform).toEqual({ platforms: ['DNS'], shopIds: [] });
  });

  it('readUrlOverrides：未带平台参数时不产生 platform 覆写', () => {
    const out = withWindowSearch('?c=RU&cur=usd', () => readUrlOverrides());
    expect(out.filters.platform).toBeUndefined();
  });
});
