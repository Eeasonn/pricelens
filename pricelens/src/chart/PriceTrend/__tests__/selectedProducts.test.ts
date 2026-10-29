import { describe, expect, it } from 'vitest';
import type { MainProduct, ProductSelection } from '../../../state/filtersTypes';
import { preferredSelectedProduct, selectedProductsOf } from '../selectedProducts';

const sel = (modelId: string, romram: string): ProductSelection => ({ modelId, romram, skuIds: [] });
const card = (id: string, main: ProductSelection | null, compares: ProductSelection[]): MainProduct => ({
  id,
  main,
  compares,
});

describe('多平台对比只在已选产品间切换', () => {
  it('按卡序展开：主品在前、对比在后，同型号同配置去重', () => {
    const list = selectedProductsOf([
      card('a', sel('m1', '8+256'), [sel('m2', '8+256'), sel('m1', '8+ 256')]),
      card('b', sel('m2', '8+256'), [sel('m3', '—')]),
    ]);
    expect(list.map((p) => p.modelId)).toEqual(['m1', 'm2', 'm3']);
  });

  it('空主品跳过，只留下对比', () => {
    expect(selectedProductsOf([card('a', null, [sel('m9', '12+256')])]).map((p) => p.modelId)).toEqual(['m9']);
  });

  it('默认产品取第一张有主品的卡', () => {
    const mains = [
      card('a', null, [sel('m9', '12+256')]),
      card('b', sel('m1', '8+256'), []),
    ];
    const options = selectedProductsOf(mains);
    expect(preferredSelectedProduct(mains, options)?.modelId).toBe('m1');
  });
});
