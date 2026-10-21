// ============================================================
// 配置读写 + CONFIG_CHANGED_EVENT 广播（§13；键名见 lplKeys.ts）
// 筛选与配置负责人（Agent B）。
// 图表侧（Agent C）可只读引用：getFxRate / getCustomTiers。
// ============================================================
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';
import { dimBenchmark, dimProduct } from '../data';
import type { CurrencyMode, DimBenchmark } from '../dataModel/types';
import { lowestPriceColorSku } from '../dataModel/aggregate';
import type { ProductSelection } from './filtersTypes';
import { modelIdOf, shortRomram } from '../components/ProductCascader/tree';
import { getCurrentCountry } from './currentScope';
export { getFxRate } from './fx';

/** 图表侧保存的档位预设（§6.1 自定义档位），配置页列出可删 */
export interface CustomTierPreset {
  name: string;
  min: number;
  max: number;
  currency: CurrencyMode;
}

// ---------------- localStorage 基础读写（全部防御性） ----------------

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用（隐私模式/满）——静默降级为仅内存生效 */
  }
}

// ---------------- 默认竞品矩阵（LPL3.config.benchmark） ----------------

/** 每个我司「国家×型号×配置」的生效竞品硬上限（与维表截断、配置编辑侧同一条规则） */
export const BENCHMARK_CAP_PER_CONFIG = 4;

/**
 * 生效的默认竞品矩阵：用户手动配置（source=manual，存 LPL3.config.benchmark）优先，
 * 未配置时回退 src/data 的 dimBenchmark（source=auto）。
 */
export function getEffectiveBenchmark(): DimBenchmark[] {
  const manual = readJson<DimBenchmark[]>(LPL.cfgBenchmark);
  if (Array.isArray(manual)) {
    // 真实数据接入后 SKU/国家 id 空间全换：只认带国家码且竞品 SKU 仍存在的行；
    // 过滤后为空（典型 = 旧造数时代的手动快照）→ 视为无手动配置，回退维表默认
    const skuOk = new Set(dimProduct.map((p) => p.sku_id));
    const valid = manual.filter(
      (r) => r != null && typeof r === 'object' && typeof r.competitor_sku_id === 'string'
        && typeof r.country_code === 'string' && skuOk.has(r.competitor_sku_id),
    );
    if (valid.length > 0) return valid;
  }
  return dimBenchmark;
}

/**
 * 某我司"产品名+ROMRAM"的默认竞品 SKU 列表（按 sort 升序，第 1=主竞品）。
 * 精确匹配 (own_model_id, own_romram)；无该 ROMRAM 行时回退型号级行；再无 → 空。
 * 约定：own_model_id = 型号 id（sku_id 前缀，如 `own-pura-90s-pro-max`，已对真实产物核验）。
 * 第一百一十六轮：输出钳在每配置 4 款内——维表已按「人工→矩阵列序→替代→自动」截断，
 * 此处兜底早期手动配置/旧持久化等未经截断的来源。
 */
export function benchmarkSkuIdsFor(modelId: string, romram: string, countryCode: string = getCurrentCountry()): string[] {
  const rows = getEffectiveBenchmark().filter(
    (r) => r.own_model_id === modelId && (r.country_code == null || r.country_code === countryCode),
  );
  const exact = rows.filter((r) => r.own_romram === romram);
  const list = exact.length ? exact : rows;
  return [...list]
    .sort((a, b) => a.sort - b.sort)
    .slice(0, BENCHMARK_CAP_PER_CONFIG)
    .map((r) => r.competitor_sku_id);
}

/**
 * §5.2③：把我司勾选组映射为其配置组并集的竞品勾选组（ProductSelection[]）。
 * 配置给到哪个 SKU 就勾哪个 SKU（品牌色/颜色级）；SKU 不在主数据中时丢弃（防御）。
 * 输出顺序按 sort 升序（主竞品在前），多我司产品按其顺序拼接。
 */
export function groupsFromBenchmark(own: ProductSelection[]): ProductSelection[] {
  if (!own.length || !dimProduct.length) return [];
  const bySku = new Map(dimProduct.map((p) => [p.sku_id, p]));
  const out = new Map<string, ProductSelection>();
  const push = (skuId: string) => {
    const p = bySku.get(skuId);
    if (!p) return;
    const mid = modelIdOf(p);
    const key = `${mid}|${p.romram}`;
    const group = out.get(key) ?? { modelId: mid, romram: p.romram, skuIds: [] };
    if (!group.skuIds.includes(skuId)) group.skuIds.push(skuId);
    out.set(key, group);
  };
  for (const sel of own) {
    for (const skuId of benchmarkSkuIdsFor(sel.modelId, sel.romram)) push(skuId);
  }
  return [...out.values()];
}

/** 保存竞品矩阵；传 null = 清除手动配置（回到 dimBenchmark 的 auto 默认） */
export function saveBenchmark(rows: DimBenchmark[] | null): void {
  if (rows == null) {
    try {
      localStorage.removeItem(LPL.cfgBenchmark);
    } catch {
      /* 忽略 */
    }
    return;
  }
  writeJson(LPL.cfgBenchmark, rows);
}

// ---------------- 上一代关系（LPL3.config.prevGen；「匹配上一代」的数据源） ----------------

/** 上一代关系手动覆盖表：modelId → prevModelId（null = 显式置空；缺省键 = 回退 auto） */
export type PrevGenOverrides = Record<string, string | null>;

/** 手动维护的上一代覆盖表（防御性过滤：值必须是合法型号 id 或 null） */
export function getPrevGenOverrides(): PrevGenOverrides {
  const raw = readJson<PrevGenOverrides>(LPL.cfgPrevGen);
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PrevGenOverrides = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null) out[k] = null;
    else if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}

/** 保存上一代覆盖表；传 null/空表 = 清除手动维护（全部回退 dim_product 的 auto 关系） */
export function savePrevGenOverrides(map: PrevGenOverrides | null): void {
  if (map == null || Object.keys(map).length === 0) {
    try {
      localStorage.removeItem(LPL.cfgPrevGen);
    } catch {
      /* 忽略 */
    }
    return;
  }
  writeJson(LPL.cfgPrevGen, map);
}

/** auto 口径：dim_product.prev_model_id（型号级前后代，同型号各 SKU 共享；行可能缺键） */
export function autoPrevModelId(modelId: string): string | null {
  const row = dimProduct.find((p) => modelIdOf(p) === modelId);
  return row?.prev_model_id ?? null;
}

/** 生效上一代：手动维护（配置页）优先，未维护回退 dim_product auto */
export function effectivePrevModelId(modelId: string): string | null {
  const overrides = getPrevGenOverrides();
  if (Object.prototype.hasOwnProperty.call(overrides, modelId)) return overrides[modelId];
  return autoPrevModelId(modelId);
}

export interface PrevGenMatchResult {
  /** 新增的上一代勾选组（已剔除当前 own 里已有的组） */
  added: ProductSelection[];
  /** 已选产品中未维护上一代关系的型号名（含上一代=自身的防御情况） */
  missing: string[];
}

/**
 * 「匹配上一代」：为当前每个已选我司组找生效上一代型号，带出同配置（ROMRAM）组。
 * - ROMRAM 取法：与当前组完全相同 → 缩写相同（12+256 GB vs 12+256）→ 上一代首个配置；
 * - SKU = 该组最低价颜色（lowestPriceColorSku），无价数据回退该配置首个 SKU；
 * - 已在 own 中的上一代组不重复带出（幂等，可反复点击）。
 */
export function groupsFromPrevGeneration(own: ProductSelection[]): PrevGenMatchResult {
  const added: ProductSelection[] = [];
  const missing: string[] = [];
  if (!own.length || !dimProduct.length) return { added, missing };

  const modelNameById = new Map<string, string>();
  const romramsOfModel = new Map<string, string[]>();
  for (const p of dimProduct) {
    const mid = modelIdOf(p);
    if (!modelNameById.has(mid)) modelNameById.set(mid, p.model_name);
    const arr = romramsOfModel.get(mid) ?? [];
    if (!arr.includes(p.romram)) arr.push(p.romram);
    romramsOfModel.set(mid, arr);
  }

  const pickRomram = (prevMid: string, cur: string): string | null => {
    const list = romramsOfModel.get(prevMid) ?? [];
    if (!list.length) return null;
    if (list.includes(cur)) return cur;
    const short = shortRomram(cur);
    const sameShort = list.find((r) => shortRomram(r) === short);
    return sameShort ?? list[0];
  };

  for (const sel of own) {
    const prevMid = effectivePrevModelId(sel.modelId);
    // 防御：上一代 = 自身（数据环）视为未维护
    if (!prevMid || prevMid === sel.modelId || !romramsOfModel.get(prevMid)?.length) {
      missing.push(modelNameById.get(sel.modelId) ?? sel.modelId);
      continue;
    }
    const romram = pickRomram(prevMid, sel.romram);
    if (romram == null) {
      missing.push(modelNameById.get(sel.modelId) ?? sel.modelId);
      continue;
    }
    if (
      own.some((s) => s.modelId === prevMid && s.romram === romram) ||
      added.some((s) => s.modelId === prevMid && s.romram === romram)
    ) {
      continue; // 已选中，不重复带出（幂等）
    }
    let skuIds: string[] = [];
    const viaAggregate = lowestPriceColorSku(prevMid, romram);
    if (viaAggregate) skuIds = [viaAggregate];
    else {
      const first = dimProduct.find((p) => modelIdOf(p) === prevMid && p.romram === romram);
      if (first) skuIds = [first.sku_id];
    }
    if (skuIds.length) added.push({ modelId: prevMid, romram, skuIds });
  }
  return { added, missing };
}

// ---------------- 自定义档位（LPL3.config.customTiers，图表侧写入） ----------------

export function getCustomTiers(): CustomTierPreset[] {
  const list = readJson<CustomTierPreset[]>(LPL.cfgTiers);
  if (!Array.isArray(list)) return [];
  return list.filter(
    (t): t is CustomTierPreset =>
      t != null &&
      typeof t === 'object' &&
      typeof t.name === 'string' &&
      typeof t.min === 'number' &&
      typeof t.max === 'number' &&
      (t.currency === 'local' || t.currency === 'usd'),
  );
}

export function saveCustomTiers(tiers: CustomTierPreset[]): void {
  writeJson(LPL.cfgTiers, tiers);
}

// ---------------- 变更广播（§13：配置保存后主页立即生效） ----------------

/** 配置页保存成功后调用；FiltersContext 监听后重置竞品默认组 */
export function notifyConfigChanged(): void {
  window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT));
}
