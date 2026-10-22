// ============================================================
// 产品主数据 → 级联树（反馈第 1 条重构：RAM+ROM 独立一层、颜色列删除）
// 我司：系列 → 产品名（仅展开）→ RAM+ROM（勾选层）
// 竞品：品牌 → 产品名（仅展开）→ RAM+ROM（勾选层）
// modelId 约定 = sku_id 前缀（如 `own-pura-90s-pro-max`），与 dim_benchmark.own_model_id、
// prev/next_model_id 及 aggregate 的 modelId 同一 id 空间（已对真实产物核验）
// ============================================================
import { dimProduct, factPriceWeekly } from '../../data';
import type { DimProduct, Industry } from '../../dataModel/types';
import { effectiveChannelIds, lowestPriceColorSku, tierOf, tierOrderOf } from '../../dataModel/aggregate';
import { getCurrentCountry } from '../../state/currentScope';
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
  latestLocal: number | null; // 最新折后价（本币；当前国家默认电渠口径，取最大 week_id 的有值行）
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
  /** 品牌（统一树各列同语言：品牌点 + 名称） */
  brand: string;
  /** 首次采集周三（≈上市）；型号列按此新→旧排序 */
  launchDate: string;
  /** 退市（eol_date 有值）：置底灰显、仍可勾选做历史分析 */
  eol: boolean;
}

/** 我司层 1 = 系列；竞品层 1 = 品牌（结构通用） */
export interface GroupNode {
  key: string;
  title: string;
  models: ModelNode[];
}

/** 统一产品树（第一百一十七轮）：品牌 → 系列 → 型号 → 配置 */
export interface SeriesNode {
  key: string; // `${brand}|${series}`
  title: string;
  models: ModelNode[];
  eol: boolean; // 全部型号退市
  latestLaunch: string;
}

export interface BrandNode {
  key: string; // brand
  title: string;
  series: SeriesNode[];
  modelCount: number;
}

/** `12+256 GB` → `12+256`；`256 GB` → `256`；`1TB` → `1TB` */
export function shortRomram(romram: string): string {
  return romram.replace(/\s*GB$/i, '').trim();
}

/** 配置容量解析（排序用）：`12+256 GB` → [12, 256]；`16+1 TB` → [16, 1024]；
 *  `256 GB` → [0, 256]；无 GB/TB 单位（如 46mm GPS / —）→ [0, 0] 排最前，再按文本自然序。 */
export function parseCapacity(romram: string): [number, number] {
  if (!/\d\s*(gb|tb)(\b|$)/i.test(romram)) return [0, 0];
  const tb = /\d\s*tb(\b|$)/i.test(romram);
  const nums = (romram.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length === 0) return [0, 0];
  if (nums.length === 1) return [0, tb ? nums[0] * 1024 : nums[0]];
  const ram = nums[nums.length - 2];
  const rom = nums[nums.length - 1];
  return [ram, tb ? rom * 1024 : rom];
}

/** 配置列排序：存储（ROM）升序 → 内存（RAM）升序 → 文本自然序 */
export function compareRomram(a: string, b: string): number {
  const [ra, oa] = parseCapacity(a);
  const [rb, ob] = parseCapacity(b);
  return oa - ob || ra - rb || a.localeCompare(b, undefined, { numeric: true });
}

/** 型号列排序：在售在前（退市置底）→ 上市新→旧 → 名称自然序 */
function compareModel(a: ModelNode, b: ModelNode): number {
  return Number(a.eol) - Number(b.eol)
    || b.launchDate.localeCompare(a.launchDate)
    || a.label.localeCompare(b.label, undefined, { numeric: true });
}

/** 型号入门信息（选择产品浮窗型号行尾「档位 · 现价」）：现价 = 各配置默认
 *  （最低价）颜色 SKU 最新价的最低值（入门配置口径，币种随筛选）；档位 =
 *  该入门配置的配置级档位代码。无任何有价配置 → price 为 null。 */
export function modelEntryInfo(m: ModelNode, currency: 'usd' | 'local' = 'usd'): { tierCode: string; price: number | null } {
  let price: number | null = null;
  let tierCode = '';
  for (const r of m.romrams) {
    const def = defaultColorSkuIds(r)[0];
    const info = def ? r.colors.find((c) => c.skuId === def) : undefined;
    const v = info ? (currency === 'usd' ? info.latestUsd : info.latestLocal) : null;
    if (v == null) continue;
    if (price == null || v < price) {
      price = v;
      const row = dimProduct.find((p) => modelIdOf(p) === m.modelId && p.romram === r.romram);
      tierCode = row ? tierOf(row) : '';
    }
  }
  return { tierCode, price };
}

export type ModelSortMode = 'default' | 'price' | 'name';

/** 型号列排序（选择产品浮窗「默认 | 价格 | 名称」）：默认 = 树内现序（在售在前、
 *  上市新→旧）；价格 = 入门现价升序、无价殿后、同价按名称；名称 = 型号名文本序。 */
export function sortModelNodes(models: ModelNode[], mode: ModelSortMode, currency: 'usd' | 'local' = 'usd'): ModelNode[] {
  const byName = (a: ModelNode, b: ModelNode): number => a.label.localeCompare(b.label, undefined, { numeric: true });
  if (mode === 'default') return models;
  if (mode === 'name') return [...models].sort(byName);
  const priceOf = (m: ModelNode): number | null => modelEntryInfo(m, currency).price;
  return [...models].sort((a, b) => {
    const pa = priceOf(a);
    const pb = priceOf(b);
    if (pa == null && pb == null) return byName(a, b);
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb || byName(a, b);
  });
}

// ---- 最新折后价索引（懒构建一次；数据静态于模块装载） ----

let latestCache: { cc: string; values: Map<string, { local: number | null; usd: number | null }> } | null = null;

/** 配置变更（默认店铺覆盖保存/清除、对标矩阵更新）后由 FiltersContext 的
 *  CONFIG_CHANGED_EVENT 处理器调用：现价索引按默认店铺口径取数，覆盖变化须重建，
 *  否则选择产品树的行尾现价与图上折线两处数字不同步 */
export function invalidateLatestPriceCache(): void {
  latestCache = null;
}

/** 当前国家默认电渠口径下各 SKU 最新有值周的最低折后价（本币/USD）；
 *  裸机口径与 aggregate.minPriceOfRows 同规则（套装行仅在该周无非套装行时才用） */
function latestPrices(): Map<string, { local: number | null; usd: number | null }> {
  const cc = getCurrentCountry();
  if (latestCache?.cc === cc) return latestCache.values;
  const channels = new Set(effectiveChannelIds(cc, null));
  type Px = { local: number; usd: number | null };
  const best = new Map<string, { weekId: string; bare: Px | null; bundle: Px | null }>();
  for (const row of factPriceWeekly) {
    if (row.country_code !== cc || row.price_local == null || !channels.has(row.channel_id)) continue;
    let cur = best.get(row.sku_id);
    if (!cur || row.week_id > cur.weekId) {
      cur = { weekId: row.week_id, bare: null, bundle: null };
      best.set(row.sku_id, cur);
    } else if (row.week_id < cur.weekId) {
      continue;
    }
    const px: Px = { local: row.price_local, usd: row.price_usd };
    if (row.bundle) {
      if (!cur.bundle || px.local < cur.bundle.local) cur.bundle = px;
    } else if (!cur.bare || px.local < cur.bare.local) {
      cur.bare = px;
    }
  }
  const values = new Map<string, { local: number | null; usd: number | null }>();
  for (const [skuId, v] of best) {
    const pick = v.bare ?? v.bundle;
    if (pick) values.set(skuId, { local: pick.local, usd: pick.usd });
  }
  latestCache = { cc, values };
  return values;
}

function buildRomramNode(skus: DimProduct[], modelId: string, modelName: string, romram: string): RomramNode {
  const lp = latestPrices();
  const colors: ColorInfo[] = skus.map((s) => ({
    skuId: s.sku_id,
    color: s.color,
    latestLocal: lp.get(s.sku_id)?.local ?? null,
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
    const romrams = [...groupBy(modelSkus, (s) => s.romram).entries()]
      .map(([rom, romSkus]) => buildRomramNode(romSkus, modelId, model, rom))
      .sort((a, b) => compareRomram(a.romram, b.romram));
    const head = modelSkus[0];
    return {
      key: modelId,
      modelId,
      label: model,
      romrams,
      brand: head.brand,
      launchDate: head.launch_date,
      eol: modelSkus.every((s) => s.eol_date != null),
    };
  }).sort(compareModel);
}

/** 我司级联树（当前国家有数据的产品）：系列 → 产品名（仅展开）→ 配置（勾选层） */
export function buildOwnTree(industry: Industry = 'phone', countryCode: string = getCurrentCountry()): GroupNode[] {
  return [...groupBy(dimProduct.filter((p) => p.is_own && p.industry === industry && p.countries.includes(countryCode)), (p) => p.series).entries()].map(([series, skus]) => ({
    key: series,
    title: series,
    models: groupModels(skus),
  }));
}

/** 竞品级联树（当前国家、同产业）：品牌（按 §13 列序，多余品牌按字母序殿后）→ 产品名 → 配置 */
export function buildCompetitorTree(industry?: Industry, countryCode: string = getCurrentCountry()): GroupNode[] {
  const comp = dimProduct.filter((p) => !p.is_own && p.countries.includes(countryCode) && (industry == null || p.industry === industry));
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
  const priced = pool.filter((c) => c.latestLocal != null || c.latestUsd != null);
  if (priced.length) {
    const lowest = priced.reduce((a, b) =>
      ((a.latestUsd ?? a.latestLocal) ?? Infinity) <= ((b.latestUsd ?? b.latestLocal) ?? Infinity) ? a : b,
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

// ---------------- 统一产品树（第一百一十七轮，选择产品浮窗用） ----------------

/** 统一产品树（全部品牌，含华为；当前国家有数据、可选传产业收窄）：
 *  品牌（华为置顶 → §13 矩阵列序 → 型号数降序）→ 系列（在售在前、
 *  上市新→旧；全退市置底）→ 型号（在售在前、新→旧）→ 配置（容量升序）。
 *  竞品系列来自维表 series（scripts/series_rules.py 的「代际+产品线」规则）。 */
export function buildProductTree(industry?: Industry, countryCode: string = getCurrentCountry()): BrandNode[] {
  const rows = dimProduct.filter(
    (p) => p.countries.includes(countryCode) && (industry == null || p.industry === industry),
  );
  const ob = ownBrand();
  const brandRank = (b: string): number => {
    if (b === ob) return -1;
    const i = COMPETITOR_BRANDS.indexOf(b);
    return i >= 0 ? i : COMPETITOR_BRANDS.length;
  };
  const brands = [...groupBy(rows, (p) => p.brand).entries()].map(([brand, skus]) => {
    const models = groupModels(skus);
    const seriesMap = new Map<string, SeriesNode>();
    for (const m of models) {
      const seriesTitle = skus.find((s) => modelIdOf(s) === m.modelId)?.series ?? m.label;
      const key = `${brand}|${seriesTitle}`;
      let node = seriesMap.get(key);
      if (!node) {
        node = { key, title: seriesTitle, models: [], eol: true, latestLaunch: '' };
        seriesMap.set(key, node);
      }
      node.models.push(m);
      if (!m.eol) node.eol = false;
      if (m.launchDate > node.latestLaunch) node.latestLaunch = m.launchDate;
    }
    const series = [...seriesMap.values()].sort(
      (a, b) => Number(a.eol) - Number(b.eol) || b.latestLaunch.localeCompare(a.latestLaunch) || a.title.localeCompare(b.title, undefined, { numeric: true }),
    );
    return { key: brand, title: brand, series, modelCount: models.length } satisfies BrandNode;
  });
  return brands.sort(
    (a, b) => brandRank(a.key) - brandRank(b.key) || b.modelCount - a.modelCount || a.key.localeCompare(b.key),
  );
}

/** 树内搜索（选择产品浮窗）：按 品牌/系列/型号名 模糊匹配（大小写不敏感），
 *  命中型号的整条 祖先链（品牌→系列）保留；无命中返回空数组（调用方显空态）。 */
export function searchProductTree(tree: BrandNode[], query: string): BrandNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  const out: BrandNode[] = [];
  for (const brand of tree) {
    const seriesOut: SeriesNode[] = [];
    for (const s of brand.series) {
      const hit =
        brand.title.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)
        || s.models.some((m) => m.label.toLowerCase().includes(q));
      if (!hit) continue;
      const models = brand.title.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)
        ? s.models
        : s.models.filter((m) => m.label.toLowerCase().includes(q));
      if (!models.length) continue;
      seriesOut.push({ ...s, models });
    }
    if (seriesOut.length) {
      out.push({ ...brand, series: seriesOut, modelCount: seriesOut.reduce((n, s) => n + s.models.length, 0) });
    }
  }
  return out;
}

// ---------------- 档位筛选（第一百二十三轮：档位融入选择产品浮窗） ----------------

/** 该国某产业实际存在的价格档位（高→低；配置行去重，阶梯外档位殿后按代码序）。
 *  浮窗「档位」下拉的选项来源——只列有产品的档位，避免空选项。 */
export function tiersOfScope(industry?: Industry, countryCode: string = getCurrentCountry()): string[] {
  const present = new Set<string>();
  for (const p of dimProduct) {
    if (!p.countries.includes(countryCode) || (industry != null && p.industry !== industry)) continue;
    present.add(tierOf(p, countryCode));
  }
  const ladder = industry == null ? [] : [...tierOrderOf(industry)].reverse(); // 阶梯序高→低
  const rest = [...present].filter((t) => !ladder.includes(t)).sort();
  return [...ladder.filter((t) => present.has(t)), ...rest];
}

/** 档位筛选树（配置级档位：tier_by_country 分国优先，同型号不同配置可跨档）——
 *  品牌/系列/型号列只留含该档配置者，配置列只列该档配置；空层整链剪除。
 *  与树内搜索可叠加（先档位后搜索，两者都是纯剪枝）。 */
export function filterProductTreeByTier(
  tree: BrandNode[],
  tier: string,
  countryCode: string = getCurrentCountry(),
): BrandNode[] {
  const hitKeys = new Set<string>();
  for (const p of dimProduct) {
    if (!p.countries.includes(countryCode)) continue;
    if (tierOf(p, countryCode) !== tier) continue;
    hitKeys.add(`${modelIdOf(p)}|${p.romram}`);
  }
  const out: BrandNode[] = [];
  for (const brand of tree) {
    const seriesOut: SeriesNode[] = [];
    for (const s of brand.series) {
      const models = s.models
        .map((m) => ({ ...m, romrams: m.romrams.filter((r) => hitKeys.has(r.key)) }))
        .filter((m) => m.romrams.length > 0);
      if (models.length) seriesOut.push({ ...s, models });
    }
    if (seriesOut.length) {
      out.push({ ...brand, series: seriesOut, modelCount: seriesOut.reduce((n, s) => n + s.models.length, 0) });
    }
  }
  return out;
}
