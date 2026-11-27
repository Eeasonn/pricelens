// ============================================================
// 品牌全景草稿纯函数（2026-11-27「一个产业与产品入口、两种分析结构」）：
// 品牌全景 = 若干品牌 + 各品牌已选产品（型号 × 配置），没有默认主品、没有默认
// 价差基准——基准只能由用户显式选临时基准（baselineKey）。
// 与「产品对标」草稿（mains）分别保存：本文件只管 panorama 自身的增删 / 去重 /
// 合法性收口，不持有状态、不读写存储（持久化与按 国家×产业 会话快照在
// FiltersContext）。无条数上限（品牌数、每品牌产品数均不截断）。
// ============================================================
import type { Industry } from '../dataModel/types';
import type { FinancingTerm, FinancingType } from '../dataModel/marketProfile';
import { brandOfModel } from '../components/ProductCascader/tree';
import type { BrandPanorama, PanoramaBrand, ProductSelection } from './filtersTypes';
import { selKey, selectionValidFor } from './mainSelection';

/** 空草稿：未选品牌；Y 轴默认共享；无基准 */
export const EMPTY_PANORAMA: BrandPanorama = { brands: [], sharedY: true, baselineKey: null };

/** 品牌草稿内去重（同型号同配置保序去重） */
function uniqSels(sels: ProductSelection[]): ProductSelection[] {
  const seen = new Set<string>();
  return sels.filter((s) => {
    const k = selKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function panoramaBrandOf(p: BrandPanorama, brand: string): PanoramaBrand | undefined {
  return p.brands.find((b) => b.brand === brand);
}

/** 全部已选产品（按品牌序、品牌内选择序展平） */
export function panoramaSelsOf(p: BrandPanorama): ProductSelection[] {
  return p.brands.flatMap((b) => b.sels);
}

export function panoramaSelCount(p: BrandPanorama): number {
  return p.brands.reduce((n, b) => n + b.sels.length, 0);
}

/** 草稿收口：品牌内去重；无产品的品牌移除；基准不在已选中 = 清空 */
function settle(p: BrandPanorama): BrandPanorama {
  const brands = p.brands
    .map((b) => ({ brand: b.brand, sels: uniqSels(b.sels) }))
    .filter((b) => b.sels.length > 0);
  const keys = new Set(brands.flatMap((b) => b.sels.map(selKey)));
  return {
    brands,
    sharedY: p.sharedY !== false,
    baselineKey: p.baselineKey != null && keys.has(p.baselineKey) ? p.baselineKey : null,
  };
}

/** 写入某品牌的已选产品：空 = 移除该品牌；新品牌追加在末尾（已存在的保持原位）。
 *  内容与现状逐条相同（型号 × 配置 × 颜色 SKU 都一致）= 原引用返回，避免无谓的
 *  状态更新与持久化写入。 */
export function setBrandSels(p: BrandPanorama, brand: string, sels: ProductSelection[]): BrandPanorama {
  const uniq = uniqSels(sels);
  const cur = p.brands.find((b) => b.brand === brand);
  if (!cur && !uniq.length) return p; // 品牌不在草稿且无新增 = 空操作
  if (cur && !uniq.length) return settle({ ...p, brands: p.brands.filter((b) => b.brand !== brand) });
  if (cur && sameSels(cur.sels, uniq)) return p;
  const brands = cur
    ? p.brands.map((b) => (b.brand === brand ? { brand, sels: uniq } : b))
    : [...p.brands, { brand, sels: uniq }];
  return settle({ ...p, brands });
}

function sameSels(a: readonly ProductSelection[], b: readonly ProductSelection[]): boolean {
  return a.length === b.length && a.every((x, i) => selKey(x) === selKey(b[i]) && x.skuIds.join(',') === b[i].skuIds.join(','));
}

/** 向某品牌追加产品（与既有选择并集、去重） */
export function addBrandSels(p: BrandPanorama, brand: string, sels: ProductSelection[]): BrandPanorama {
  return setBrandSels(p, brand, [...(panoramaBrandOf(p, brand)?.sels ?? []), ...sels]);
}

/** 增删单个产品：品牌取自型号事实（brandOfModel），on=false 且品牌内无剩余 = 移除品牌 */
export function togglePanoramaSel(p: BrandPanorama, sel: ProductSelection, on: boolean): BrandPanorama {
  const brand = brandOfModel(sel.modelId);
  if (!brand) return p;
  const cur = panoramaBrandOf(p, brand)?.sels ?? [];
  if (!on && !cur.length) return p; // 取消一个本就不在草稿里的选择 = 空操作
  const k = selKey(sel);
  const next = on ? [...cur, sel] : cur.filter((s) => selKey(s) !== k);
  return setBrandSels(p, brand, next);
}

export function removePanoramaBrand(p: BrandPanorama, brand: string): BrandPanorama {
  return settle({ ...p, brands: p.brands.filter((b) => b.brand !== brand) });
}

/** 持久化 / 快照读入的形状校验（坏形状由调用方整体跳过，不作废筛选整包） */
export function isPanorama(value: unknown): value is BrandPanorama {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.brands)) return false;
  if (v.sharedY !== undefined && typeof v.sharedY !== 'boolean') return false;
  if (v.baselineKey !== undefined && v.baselineKey !== null && typeof v.baselineKey !== 'string') return false;
  return v.brands.every((b) => {
    if (typeof b !== 'object' || b === null || Array.isArray(b)) return false;
    const brand = b as Record<string, unknown>;
    return typeof brand.brand === 'string'
      && Array.isArray(brand.sels)
      && brand.sels.every((s) => {
        if (typeof s !== 'object' || s === null || Array.isArray(s)) return false;
        const sel = s as Record<string, unknown>;
        return typeof sel.modelId === 'string' && typeof sel.romram === 'string'
          && Array.isArray(sel.skuIds) && sel.skuIds.every((id) => typeof id === 'string');
      });
  });
}

/** 口径合法性收口（国家 / 产业 / 付费口径切换与读档时调用）：逐条按「型号 × 配置 ×
 *  国家 × 产业 × SKU」校验，不在目标口径有数据的剔除；品牌无剩余产品 = 移除；
 *  基准被剔除 = 回落无基准。返回原引用表示无需变更。 */
export function sanitizePanorama(
  p: BrandPanorama,
  countryCode: string,
  industry: Industry,
  financingType: FinancingType | null = null,
  financingTerms: FinancingTerm[] = [],
): BrandPanorama {
  if (!p.brands.length) return p.sharedY && p.baselineKey == null ? p : settle(p);
  let changed = false;
  const brands: PanoramaBrand[] = [];
  for (const b of p.brands) {
    const sels = uniqSels(b.sels).filter((s) => selectionValidFor(s, countryCode, industry, financingType, financingTerms));
    if (sels.length !== b.sels.length) changed = true;
    if (sels.length) brands.push({ brand: b.brand, sels });
    else changed = true;
  }
  if (!changed && (p.baselineKey == null || brands.some((b) => b.sels.some((s) => selKey(s) === p.baselineKey)))) return p;
  return settle({ ...p, brands });
}

/** selKey 还原为 `{modelId, romram}`（配置原文去空格后的形态；仅供键比对 / 反查维表） */
export function selKeyParts(key: string): { modelId: string; romramNorm: string } | null {
  const i = key.indexOf('|');
  if (i <= 0) return null;
  return { modelId: key.slice(0, i), romramNorm: key.slice(i + 1) };
}
