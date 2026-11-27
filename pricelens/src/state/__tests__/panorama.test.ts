// ============================================================
// 品牌全景草稿纯函数金测（2026-11-27）：多品牌增删去重、品牌随型号事实归属、
// 无默认品牌 / 基准、基准随产品移除清空、合法性收口（国家 × 产业）、读档形状校验。
// 真实数据驱动（品牌行按维表取，不写死型号）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import {
  EMPTY_PANORAMA,
  addBrandSels,
  isPanorama,
  panoramaBrandOf,
  panoramaSelCount,
  panoramaSelsOf,
  removePanoramaBrand,
  sanitizePanorama,
  setBrandSels,
  togglePanoramaSel,
} from '../panorama';
import type { BrandPanorama, ProductSelection } from '../filtersTypes';
import { selKey } from '../mainSelection';

type Row = (typeof dimProduct)[number];
const rowOf = (brand: string, industry = 'phone', cc = 'RU'): Row =>
  dimProduct.find((p) => p.brand === brand && p.industry === industry && p.countries.includes(cc))!;
const selOf = (row: Row): ProductSelection => ({ modelId: row.model_id, romram: row.romram, skuIds: [row.sku_id] });

const own = selOf(rowOf('HUAWEI'));
const samsung = selOf(rowOf('SAMSUNG'));
const apple = selOf(rowOf('APPLE'));
const samsung2 = selOf(dimProduct.find((p) => p.brand === 'SAMSUNG' && p.industry === 'phone' && p.countries.includes('RU') && p.model_id !== samsung.modelId)!);

describe('空草稿：无默认品牌 / 主品 / 基准', () => {
  it('brands 为空、无基准、Y 轴默认共享', () => {
    expect(EMPTY_PANORAMA.brands).toEqual([]);
    expect(EMPTY_PANORAMA.baselineKey).toBeNull();
    expect(EMPTY_PANORAMA.sharedY).toBe(true);
    expect(panoramaSelCount(EMPTY_PANORAMA)).toBe(0);
    expect(panoramaSelsOf(EMPTY_PANORAMA)).toEqual([]);
  });
});

describe('多品牌增删去重', () => {
  it('向多个品牌追加：品牌按追加序排列，计数与展平正确', () => {
    let p = addBrandSels(EMPTY_PANORAMA, 'HUAWEI', [own]);
    p = addBrandSels(p, 'SAMSUNG', [samsung]);
    p = addBrandSels(p, 'APPLE', [apple]);
    expect(p.brands.map((b) => b.brand)).toEqual(['HUAWEI', 'SAMSUNG', 'APPLE']);
    expect(panoramaSelCount(p)).toBe(3);
    expect(panoramaSelsOf(p).map(selKey)).toEqual([own, samsung, apple].map(selKey));
    // 不会因为加入选择而凭空出现基准
    expect(p.baselineKey).toBeNull();
  });

  it('同品牌内同型号同配置去重；重复追加不新增也不换位', () => {
    const p1 = addBrandSels(EMPTY_PANORAMA, 'SAMSUNG', [samsung, samsung]);
    expect(p1.brands[0].sels).toHaveLength(1);
    const p2 = addBrandSels(p1, 'SAMSUNG', [samsung]);
    expect(panoramaSelCount(p2)).toBe(1);
    const p3 = addBrandSels(p2, 'SAMSUNG', [samsung2, samsung]);
    expect(p3.brands[0].sels.map(selKey)).toEqual([samsung, samsung2].map(selKey)); // 保序去重
  });

  it('togglePanoramaSel：品牌取自型号事实，取消该品牌最后一个产品即移除品牌', () => {
    const p1 = togglePanoramaSel(EMPTY_PANORAMA, samsung, true);
    expect(panoramaBrandOf(p1, 'SAMSUNG')?.sels.map(selKey)).toEqual([selKey(samsung)]);
    expect(p1.brands).toHaveLength(1);
    const p2 = togglePanoramaSel(p1, samsung, false);
    expect(p2.brands).toEqual([]);
    expect(togglePanoramaSel(p2, samsung, false)).toBe(p2); // 空操作原引用返回
  });

  it('removePanoramaBrand 只移除指定品牌；setBrandSels 传空数组同样移除品牌', () => {
    let p = addBrandSels(EMPTY_PANORAMA, 'HUAWEI', [own]);
    p = addBrandSels(p, 'SAMSUNG', [samsung]);
    const gone = removePanoramaBrand(p, 'SAMSUNG');
    expect(gone.brands.map((b) => b.brand)).toEqual(['HUAWEI']);
    expect(setBrandSels(p, 'SAMSUNG', []).brands.map((b) => b.brand)).toEqual(['HUAWEI']);
    expect(setBrandSels(p, 'SAMSUNG', [apple, samsung2]).brands.map((b) => b.brand)).toEqual(['HUAWEI', 'SAMSUNG']); // 整体替换
  });
});

describe('临时基准只由用户显式选择', () => {
  it('基准键随草稿保留；基准产品被移除后基准清空；sharedY 取值不被改写', () => {
    const base: BrandPanorama = { brands: [{ brand: 'SAMSUNG', sels: [samsung, samsung2] }], sharedY: false, baselineKey: selKey(samsung) };
    expect(setBrandSels(base, 'APPLE', [apple]).baselineKey).toBe(selKey(samsung));
    const after = setBrandSels(base, 'SAMSUNG', [samsung2]);
    expect(after.baselineKey).toBeNull(); // 基准产品已不在草稿
    expect(after.sharedY).toBe(false);
    // 基准指向不在草稿里的产品 = 收口为无基准（任何一次写入都会对账）
    const ghostBase: BrandPanorama = { ...base, baselineKey: 'ghost|8+128GB' };
    expect(togglePanoramaSel(ghostBase, apple, true).baselineKey).toBeNull();
    expect(sanitizePanorama({ ...EMPTY_PANORAMA, brands: [{ brand: 'HUAWEI', sels: [own] }], baselineKey: 'ghost|8+128GB' }, 'RU', 'phone').baselineKey).toBeNull();
  });
});

describe('sanitizePanorama（国家 × 产业 × 配置合法性收口）', () => {
  it('全部仍有效：原引用返回（不做无谓改写）', () => {
    const p = addBrandSels(addBrandSels(EMPTY_PANORAMA, 'HUAWEI', [own]), 'SAMSUNG', [samsung]);
    expect(sanitizePanorama(p, 'RU', 'phone')).toBe(p);
  });

  it('切产业：不属于目标产业的产品剔除，空品牌移除，失效基准清空', () => {
    let p = addBrandSels(EMPTY_PANORAMA, 'HUAWEI', [own]);
    p = addBrandSels(p, 'SAMSUNG', [samsung]);
    p = { ...p, baselineKey: selKey(samsung) };
    const out = sanitizePanorama(p, 'RU', 'tablet');
    expect(out.brands).toEqual([]); // 手机产品在平板产业全部无效
    expect(out.baselineKey).toBeNull();
  });

  it('混入无效产品时只剔除无效项，有效品牌与产品保留', () => {
    const ghost: ProductSelection = { modelId: 'no-such-model', romram: '8+128 GB', skuIds: ['no-such-model__8+128'] };
    let p = addBrandSels(EMPTY_PANORAMA, 'SAMSUNG', [samsung, ghost]);
    p = addBrandSels(p, 'HUAWEI', [own]);
    const out = sanitizePanorama(p, 'RU', 'phone');
    expect(out.brands.map((b) => b.brand)).toEqual(['SAMSUNG', 'HUAWEI']);
    expect(panoramaBrandOf(out, 'SAMSUNG')?.sels.map(selKey)).toEqual([selKey(samsung)]);
    expect(out.baselineKey).toBeNull();
  });
});

describe('isPanorama（持久化 / 快照读入形状校验）', () => {
  it('合法草稿通过；坏形状整体拒绝', () => {
    expect(isPanorama(EMPTY_PANORAMA)).toBe(true);
    expect(isPanorama({ brands: [{ brand: 'SAMSUNG', sels: [samsung] }] })).toBe(true); // 可缺省 sharedY / baselineKey
    expect(isPanorama(null)).toBe(false);
    expect(isPanorama([])).toBe(false);
    expect(isPanorama({ brands: 'SAMSUNG' })).toBe(false);
    expect(isPanorama({ brands: [], sharedY: 'yes' })).toBe(false);
    expect(isPanorama({ brands: [], baselineKey: 7 })).toBe(false);
    expect(isPanorama({ brands: [{ brand: 'X', sels: [{ modelId: 'm', romram: 'r' }] }] })).toBe(false); // 缺 skuIds
    expect(isPanorama({ brands: [{ brand: 'X', sels: [{ modelId: 'm', romram: 'r', skuIds: [1] }] }] })).toBe(false); // skuIds 非字符串
    expect(isPanorama({ brands: [{ sels: [] }] })).toBe(false); // 缺品牌名
  });
});
