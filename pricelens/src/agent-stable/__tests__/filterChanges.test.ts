import { describe, expect, it } from 'vitest';
import { buildFilterChanges } from '../core';
import { defaultFilters } from '../../state/FiltersContext';
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';

const own: ProductSelection = { modelId: 'own-huawei-nova-15', romram: '12+256 GB', skuIds: ['sku-b', 'sku-a'] };
const apple: ProductSelection = { modelId: 'cmp-apple-iphone-17-pro', romram: '12+256 GB', skuIds: ['apple-a'] };
const samsung: ProductSelection = { modelId: 'cmp-samsung-s26-ultra', romram: '12+256 GB', skuIds: ['samsung-a'] };
const baseCard: MainProduct = { id: 'card-a', main: own, compares: [apple], auto: true };
const state = { ...defaultFilters, mains: [baseCard] };
const patchWith = (card: MainProduct) => ({ mains: [card] });

describe('buildFilterChanges · 结构语义比较', () => {
  it('卡片 ID 与 SKU 顺序不同但选择语义相同，不产生误报', () => {
    const patch = patchWith({ ...baseCard, id: 'card-new', main: { ...own, skuIds: ['sku-a', 'sku-b'] } });
    expect(buildFilterChanges(state, patch)).toEqual([]);
  });

  it('对比产品变化必须进入预览', () => {
    const patch = patchWith({ ...baseCard, compares: [samsung] });
    expect(buildFilterChanges(state, patch)).toHaveLength(1);
    expect(buildFilterChanges(state, patch)[0].label).toBe('产品');
  });

  it('自动匹配开关与附加 SKU 变化都进入预览', () => {
    const autoOff = patchWith({ ...baseCard, auto: false });
    const extraSku = patchWith({ ...baseCard, main: { ...own, skuIds: ['sku-b', 'sku-a', 'sku-c'] } });
    expect(buildFilterChanges(state, autoOff)).toHaveLength(1);
    expect(buildFilterChanges(state, extraSku)).toHaveLength(1);
  });

  it('逐产品取价口径变化必须进入预览', () => {
    const patch = patchWith({ ...baseCard, main: { ...own, platform: { platforms: ['DNS'], shopIds: [], seller: null } } });
    expect(buildFilterChanges(state, patch)).toHaveLength(1);
  });
});
