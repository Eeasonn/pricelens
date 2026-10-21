import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { lowestPriceColorSku } from '../../dataModel/aggregate';
import { productSelectionOfSeriesKey } from '../urlSync';

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
