// ============================================================
// 产品主数据 → 级联树（反馈第 1 条重构：RAM+ROM 独立一层、颜色列删除）
// 我司：系列 → 产品名（仅展开）→ RAM+ROM（勾选层）
// 竞品：品牌 → 产品名（仅展开）→ RAM+ROM（勾选层）
// modelId 约定 = sku_id 前缀（如 `own-pura-90s-pro-max`），与 dim_benchmark.own_model_id、
// prev/next_model_id 及 aggregate 的 modelId 同一 id 空间（已对真实产物核验）
// ============================================================
import { dimProduct, factPriceWeekly } from '../../data';
import type { DimProduct } from '../../dataModel/types';
import { lowestPriceColorSku } from '../../dataModel/aggregate';
import type { ProductSelection } from '../../state/filtersTypes';

/** 竞品品牌列顺序（§13 矩阵列序一致） */
export const COMPETITOR_BRANDS = ['APPLE', 'SAMSUNG', 'HONOR', 'XIAOMI'];

let ownBrandCache: string | null = null;

/** 我司品牌（触发器/面板品牌图标用；数据集内我司单品牌，缺省 HUAWEI） */
export function ownBrand(): string {
  if (!ownBrandCache) ownBrandCache = dimProduct.find((p) => p.is_own)?.brand ?? 'HUAWEI';
  return ownBrandCache;
}

let modelBrandCache: Map<string, string> | null = null;

/** 型号 id → 品牌（未知 id 返回空串，图标组件据此不出图） */
export function brandOfModel(modelId: string): string {
  if (!modelBrandCache) {
    modelBrandCache = new Map();
    for (const p of dimProduct) {
      const id = modelIdOf(p);
      if (!modelBrandCache.has(id)) modelBrandCache.set(id, p.brand);
    }
  }
  return modelBrandCache.get(modelId) ?? '';
}

/** 型号 id = sku_id 前缀（`own-xxx` / `cmp-xxx`），全数据集与 model_name 一一对应 */
export function modelIdOf(p: DimProduct): string {
  return p.sku_id.split('__')[0];
}

let modelNameCache: Map<string, string> | null = null;

/** 型号 id → 产品名（触发器/面板展示用；未知 id 回退显示 id 本身） */
export function modelNameOf(modelId: string): string {
  if (!modelNameCache) {
    modelNameCache = new Map();
    for (const p of dimProduct) {
      const id = modelIdOf(p);
      if (!modelNameCache.has(id)) modelNameCache.set(id, p.model_name);
    }
  }
  return modelNameCache.get(modelId) ?? modelId;
}

export interface ColorInfo {
  skuId: string;
  color: string; // '—' = 无颜色行（§8.1，不进颜色级联展示）
  latestRub: number | null; // 最新折后价（取该 SKU 最大 week_id 的有值行）
  latestUsd: number | null;
}

export interface RomramNode {
  key: string; // `${modelId}|${romram}`
  modelId: string;
  romram: string; // 主数据原值，如 '12+256 GB'
  shortRomram: string; // '12+256'
  label: string; // `Pura 90s Pro · 12+256`
  colors: ColorInfo[];
  selectableColors: ColorInfo[]; // color !== '—'
}

export interface ModelNode {
  key: string;
  modelId: string;
  label: string;
  romrams: RomramNode[];
}

/** 我司层 1 = 系列；竞品层 1 = 品牌（结构通用） */
export interface GroupNode {
  key: string;
  title: string;
  models: ModelNode[];
}

/** `12+256 GB` → `12+256`；`256 GB` → `256`；`1TB` → `1TB` */
export function shortRomram(romram: string): string {
  return romram.replace(/\s*GB$/i, '').trim();
}

// ---- 最新折后价索引（懒构建一次；数据静态于模块装载） ----

let latestCache: Map<string, { rub: number | null; usd: number | null }> | null = null;

function latestPrices(): Map<string, { rub: number | null; usd: number | null }> {
  if (latestCache) return latestCache;
  const best = new Map<string, { weekId: string; rub: number | null; usd: number | null }>();
  for (const row of factPriceWeekly) {
    const hasPrice = row.discounted_price_rub != null || row.discounted_price_usd != null;
    if (!hasPrice) continue;
    const cur = best.get(row.sku_id);
    if (!cur || row.week_id > cur.weekId) {
      best.set(row.sku_id, { weekId: row.week_id, rub: row.discounted_price_rub, usd: row.discounted_price_usd });
    }
  }
  latestCache = new Map();
  for (const [skuId, v] of best) latestCache.set(skuId, { rub: v.rub, usd: v.usd });
  return latestCache;
}

function buildRomramNode(skus: DimProduct[], modelId: string, modelName: string, romram: string): RomramNode {
  const lp = latestPrices();
  const colors: ColorInfo[] = skus.map((s) => ({
    skuId: s.sku_id,
    color: s.color,
    latestRub: lp.get(s.sku_id)?.rub ?? null,
    latestUsd: lp.get(s.sku_id)?.usd ?? null,
  }));
  const short = shortRomram(romram);
  return {
    key: `${modelId}|${romram}`,
    modelId,
    romram,
    shortRomram: short,
    label: `${modelName} · ${short}`,
    colors,
    selectableColors: colors.filter((c) => c.color !== '—'),
  };
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const arr = m.get(keyOf(r)) ?? [];
    arr.push(r);
    m.set(keyOf(r), arr);
  }
  return m;
}

function groupModels(skus: DimProduct[]): ModelNode[] {
  return [...groupBy(skus, (s) => s.model_name).entries()].map(([model, modelSkus]) => {
    const modelId = modelIdOf(modelSkus[0]);
    const romrams = [...groupBy(modelSkus, (s) => s.romram).entries()].map(([rom, romSkus]) =>
      buildRomramNode(romSkus, modelId, model, rom),
    );
    return { key: modelId, modelId, label: model, romrams };
  });
}

/** 我司级联树：系列 → 产品名（仅展开）→ RAM+ROM（勾选层，含前代同堂型号，§5.2②） */
export function buildOwnTree(): GroupNode[] {
  return [...groupBy(dimProduct.filter((p) => p.is_own), (p) => p.series).entries()].map(([series, skus]) => ({
    key: series,
    title: series,
    models: groupModels(skus),
  }));
}

/** 竞品级联树：品牌（按 §13 列序，多余品牌按字母序殿后）→ 产品名（仅展开）→ RAM+ROM（勾选层） */
export function buildCompetitorTree(): GroupNode[] {
  const comp = dimProduct.filter((p) => !p.is_own);
  const brandRank = (b: string): number => {
    const i = COMPETITOR_BRANDS.indexOf(b);
    return i >= 0 ? i : COMPETITOR_BRANDS.length;
  };
  return [...groupBy(comp, (p) => p.brand).entries()]
    .sort((a, b) => brandRank(a[0]) - brandRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([brand, skus]) => ({ key: brand, title: brand, models: groupModels(skus) }));
}

/** SKU 选项（品牌内按产品分组，供 Select group 用；配置页矩阵单元格复用） */
export function skuOptionLabel(p: DimProduct): string {
  const colorPart = p.color === '—' ? '' : ` · ${p.color}`;
  return `${p.model_name} · ${shortRomram(p.romram)}${colorPart}`;
}

// ---------------- 勾选组（ProductSelection[]）纯函数 ----------------

export function findSelection(list: ProductSelection[], node: RomramNode): ProductSelection | undefined {
  return list.find((s) => s.modelId === node.modelId && s.romram === node.romram);
}

/**
 * §5.2②：ROMRAM 勾选时的默认 SKU = 该 ROMRAM 下折后价最低的颜色（lowestPriceColorSku，
 * 空结果回退为本地按最新折后价取最低；再退化取首个颜色）。
 */
export function defaultColorSkuIds(node: RomramNode): string[] {
  const viaAggregate = lowestPriceColorSku(node.modelId, node.romram);
  if (viaAggregate && node.colors.some((c) => c.skuId === viaAggregate)) return [viaAggregate];
  const pool = node.selectableColors.length ? node.selectableColors : node.colors;
  if (!pool.length) return [];
  const priced = pool.filter((c) => c.latestRub != null || c.latestUsd != null);
  if (priced.length) {
    const lowest = priced.reduce((a, b) =>
      ((a.latestUsd ?? a.latestRub) ?? Infinity) <= ((b.latestUsd ?? b.latestRub) ?? Infinity) ? a : b,
    );
    return [lowest.skuId];
  }
  return [pool[0].skuId];
}

export function checkStateOfRomram(
  list: ProductSelection[],
  node: RomramNode,
): 'checked' | 'indeterminate' | 'none' {
  const sel = findSelection(list, node);
  if (!sel || !sel.skuIds.length) return 'none';
  // 与 SkuModal 可勾池同口径（'—' 颜色不进弹框时不算满选基数）
  const pool = node.selectableColors.length ? node.selectableColors : node.colors;
  return sel.skuIds.length >= pool.length ? 'checked' : 'indeterminate';
}

export function checkStateOfChildren(list: ProductSelection[], nodes: RomramNode[]): 'checked' | 'indeterminate' | 'none' {
  if (!nodes.length) return 'none';
  const flags = nodes.map((n) => checkStateOfRomram(list, n) !== 'none');
  if (flags.every(Boolean)) return 'checked';
  if (flags.some(Boolean)) return 'indeterminate';
  return 'none';
}

export function addRomram(list: ProductSelection[], node: RomramNode): ProductSelection[] {
  if (findSelection(list, node)) return list;
  return [...list, { modelId: node.modelId, romram: node.romram, skuIds: defaultColorSkuIds(node) }];
}

export function removeRomram(list: ProductSelection[], node: RomramNode): ProductSelection[] {
  return list.filter((s) => !(s.modelId === node.modelId && s.romram === node.romram));
}

export function addRomrams(list: ProductSelection[], nodes: RomramNode[]): ProductSelection[] {
  let next = list;
  for (const n of nodes) next = addRomram(next, n);
  return next;
}

export function removeRomrams(list: ProductSelection[], nodes: RomramNode[]): ProductSelection[] {
  let next = list;
  for (const n of nodes) next = removeRomram(next, n);
  return next;
}

/** SKU 抽屉勾选/取消；取消该组最后一个 SKU = 取消整个 ROMRAM（勾选组不允许空 SKU） */
export function toggleSku(list: ProductSelection[], node: RomramNode, skuId: string, next: boolean): ProductSelection[] {
  const sel = findSelection(list, node);
  if (next) {
    if (!sel) return [...list, { modelId: node.modelId, romram: node.romram, skuIds: [skuId] }];
    if (sel.skuIds.includes(skuId)) return list;
    return list.map((s) => (s === sel ? { ...s, skuIds: [...s.skuIds, skuId] } : s));
  }
  if (!sel) return list;
  const rest = sel.skuIds.filter((id) => id !== skuId);
  if (!rest.length) return removeRomram(list, node);
  return list.map((s) => (s === sel ? { ...s, skuIds: rest } : s));
}

/** 触发器/面板展示用：勾选组的显示名（产品名 · ROMRAM） */
export function selectionLabel(sel: ProductSelection): string {
  return `${modelNameOf(sel.modelId)} · ${shortRomram(sel.romram)}`;
}
