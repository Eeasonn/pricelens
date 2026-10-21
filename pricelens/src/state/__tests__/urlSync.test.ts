import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { productSelectionOfSeriesKey } from '../urlSync';

// 第一百一十七轮：URL 主分析参数（main，旧名 own 兼容）不再限华为——
// 主分析/对比是用户指定的角色，任意品牌都可通过链接进入。
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
});
