// ============================================================
// 配置读写 + CONFIG_CHANGED_EVENT 广播（§13；键名见 lplKeys.ts）
// 筛选与配置负责人（Agent B）。
// 图表侧（Agent C）可只读引用：getFxRate。
// 第一百八十五轮（外部 UX 审计落地）：新增窄域恢复 API——
// clearBenchmarkEntry（单个配置的对标回默认），避免「恢复默认」误伤其他国家/型号
// 的人工配置。
// ============================================================
import { useEffect, useState } from 'react';
import { canEditConfig } from '../access/role';
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';
import { readBenchmarkMatrix } from './deriveConfig';
import { dimBenchmark, dimProduct, prevGenRomramKey, prevGenTargetsFor } from '../data';
import type { DimBenchmark, DimProduct } from '../dataModel/types';
import { lowestPriceColorSku } from '../dataModel/aggregate';
import type { ProductSelection } from './filtersTypes';
import { modelIdOf } from '../components/ProductCascader/tree';
import { getCurrentCountry } from './currentScope';
export { getFxRate } from './fx';

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

/** 每个我司「国家×型号×配置」的生效竞品硬上限（与维表截断、配置编辑侧同一条规则）。
 *  2026-11-02（Eason）：4 → 3，约束自动匹配矩阵带出的竞品数量；
 *  不限制筛选器中继续手动添加对比产品。 */
export const BENCHMARK_CAP_PER_CONFIG = 3;

/**
 * 生效的默认竞品矩阵。
 *
 * 2026-11-11 Eason：对标配置编辑恢复（按钮不再置灰），人工层以「按组覆盖」语义
 * 回归，取代 2026-11-10 的 matrix-only 临时口径——人工快照只覆盖其显式包含的
 * 「国家 × 型号 × 配置」组（整组替换为快照行），未覆盖的组照常随维表矩阵更新，
 * 不再有「存在即整表接管、矩阵更新被旧快照静默遮蔽」的问题。
 *
 * 按「国家 × 型号 × 配置（ROMRAM 去空格归一）」截到每配置 3 款
 * （BENCHMARK_CAP_PER_CONFIG，组内按 sort 升序、稳定）。
 */
export function getEffectiveBenchmark(): DimBenchmark[] {
  // 人工快照行（防御性过滤形状；组键 = 国家×型号×配置，ROMRAM 去空格归一）
  const manual = readJson<DimBenchmark[]>(LPL.cfgBenchmark);
  const manualRows = Array.isArray(manual)
    ? manual.filter((r) => r != null && typeof r === 'object' && typeof r.competitor_sku_id === 'string'
      && typeof r.country_code === 'string' && typeof r.own_model_id === 'string')
    : [];
  const manualGroups = new Set<string>();
  for (const r of manualRows) {
    manualGroups.add(`${r.country_code}|${r.own_model_id}|${(r.own_romram ?? '').replace(/\s+/g, '')}`);
  }
  // 矩阵行剔除被人工覆盖的组，再拼接人工行；首见去重——防御历史快照/潜在维表
  // 重复行（2026-11-10 曾因 >=N 档位解析 bug 产出重复行，见 ingest 侧修复）
  // 2026-11-18 配置表化：对标矩阵页签有行 = 整体替换数据层矩阵（原表模式 v3 包
  // 无内置矩阵时它就是唯一矩阵源；人工层「按组覆盖」语义不受影响）
  const matrixConfig = readBenchmarkMatrix();
  const matrixBase: DimBenchmark[] = matrixConfig ?? dimBenchmark;
  const rowsRaw: DimBenchmark[] = matrixBase.filter((r) => {
    const k = `${r.country_code}|${r.own_model_id}|${(r.own_romram ?? '').replace(/\s+/g, '')}`;
    return !manualGroups.has(k);
  });
  const seen = new Set<string>();
  const rows: DimBenchmark[] = [...rowsRaw, ...manualRows].filter((r) => {
    const k = `${r.country_code}|${r.own_model_id}|${(r.own_romram ?? '').replace(/\s+/g, '')}|${r.competitor_sku_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // 组内按 sort 升序取前 BENCHMARK_CAP_PER_CONFIG 款的竞品集合，再按原表顺序过滤——不重排整表
  const keep = new Map<string, Set<string>>();
  // own_romram 归一前兜底空串（维表行恒有该字段，防御历史形状）
  const groupOf = (r: DimBenchmark): string => `${r.country_code}|${r.own_model_id}|${(r.own_romram ?? '').replace(/\s+/g, '')}`;
  for (const r of [...rows].sort((a, b) => a.sort - b.sort)) {
    const key = groupOf(r);
    let set = keep.get(key);
    if (!set) {
      set = new Set();
      keep.set(key, set);
    }
    if (set.size < BENCHMARK_CAP_PER_CONFIG) set.add(r.competitor_sku_id);
  }
  return rows.filter((r) => keep.get(groupOf(r))?.has(r.competitor_sku_id));
}

/**
 * 某我司"产品名+ROMRAM"的默认竞品 SKU 列表（按 sort 升序，第 1=主竞品）。
 * 精确匹配 (own_model_id, own_romram)；无该 ROMRAM 行时回退型号级行；再无 → 空。
 * 约定：own_model_id = 型号 id（sku_id 前缀，如 `own-pura-90s-pro-max`，已对真实产物核验）。
 * 第一百一十六轮：输出钳在每配置上限内（BENCHMARK_CAP_PER_CONFIG，现为 3）——维表已按「人工→矩阵列序→替代→自动」截断，
 * 此处兜底早期手动配置/旧持久化等未经截断的来源。
 */
/** 人工对标快照行数（存在即整表接管语义的可见性：横幅提示 + 一键恢复默认用） */
export function manualBenchmarkCount(): number {
  const manual = readJson<DimBenchmark[]>(LPL.cfgBenchmark);
  return Array.isArray(manual) ? manual.length : 0;
}

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
export function groupsFromBenchmark(own: ProductSelection[], countryCode: string = getCurrentCountry()): ProductSelection[] {
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
    for (const skuId of benchmarkSkuIdsFor(sel.modelId, sel.romram, countryCode)) push(skuId);
  }
  return [...out.values()];
}

/** 保存竞品矩阵；传 null = 清除手动配置（回到 dimBenchmark 的 auto 默认）。
 *  2026-11-06 RBAC：查阅者角色写为 no-op（UI 已门控，此处为纵深防御） */
export function saveBenchmark(rows: DimBenchmark[] | null): void {
  if (!canEditConfig()) return;
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

/**
 * 第一百八十五轮（外部 UX 审计落地）：只把一个「国家×型号×配置」的对标恢复为系统
 * 默认，其他国家/型号/配置的行原样保留。手动快照是「存在即整表接管」语义
 * （getEffectiveBenchmark），单纯删掉该组的行会让它变成空白而不是回退默认——
 * 因此以当前生效矩阵为基底移除该组，再把维表默认行原样补回（与编辑弹窗整快照
 * 保存的既有设计一致，行来源 matrix/auto/substitute 随维表保留）；基底为空
 * （该组无任何对标）则整键清除，全表回默认。无手动快照时本就处于默认口径，
 * 直接返回，不凭空建快照。配置键与读取侧同样按去空格归一比较。
 */
export function clearBenchmarkEntry(countryCode: string, modelId: string, romram: string): void {
  if (!canEditConfig()) return;
  const manual = readJson<DimBenchmark[]>(LPL.cfgBenchmark);
  if (!Array.isArray(manual)) return;
  const key = romram.replace(/\s+/g, '');
  const sameEntry = (r: DimBenchmark): boolean =>
    (r.country_code ?? countryCode) === countryCode &&
    r.own_model_id === modelId &&
    (r.own_romram ?? '').replace(/\s+/g, '') === key;
  const next = [
    ...getEffectiveBenchmark().filter((r) => !sameEntry(r)),
    ...dimBenchmark.filter(sameEntry),
  ];
  if (next.length === 0) {
    try {
      localStorage.removeItem(LPL.cfgBenchmark);
    } catch {
      /* 忽略 */
    }
    return;
  }
  writeJson(LPL.cfgBenchmark, next);
}

// ---------------- 上一代配置（「匹配上一代」；数据源 = 数据包 prevGen 段） ----------------
// 2026-11-27 Eason 拍板：上一代关系要到 cat（配置）层级、不能只到 model，权威来源是服务器端
// 配置表 config_tables.xlsx「上一代配置」页签（server/prev_gen.py 解析进包）。原先的本机
// localStorage 覆盖表（LPL3.config.prevGen）、dim_product.prev_model_id 自动兜底与「按存储
// 规则猜同配置」一并退役——本模块只查包内映射，不再自行推断。

export interface PrevGenMatchResult {
  /** 新增的上一代勾选组（已剔除当前 own 里已有的组） */
  added: ProductSelection[];
  /** 已选产品中在包内查不到可用上一代配置的型号名（型号级去重；含映射指向的配置组
   *  在当前产品主数据里不存在的情况） */
  missing: string[];
}

/**
 * 「匹配上一代」：对每个已选我司组，用 (sel.modelId, sel.romram) 查包内 prevGen 映射
 * （prevGenTargetsFor）拿上一代配置组并带出。
 * - 配置组以包内映射为准（一对一 / 一对多 / 上一代为竞品均按映射原样带出），不做任何猜测；
 * - SKU = 该组最低价颜色（lowestPriceColorSku），无价数据回退该配置组首个产品行；
 * - 已在 own 里或已带出的上一代组不重复（幂等，可反复点击）；
 * - 包内无该组映射（含数据包没有 prevGen 段）的型号进 missing。
 */
export function groupsFromPrevGeneration(own: ProductSelection[]): PrevGenMatchResult {
  const added: ProductSelection[] = [];
  const missing: string[] = [];
  if (!own.length || !dimProduct.length) return { added, missing };

  const modelNameById = new Map<string, string>();
  /** 型号 →（配置组键 → 该配置组首个产品行）：包内给的是归一后的配置组（空配置为 '—'），
   *  ProductSelection.romram 要用主数据原值才能与选品树的组键对上 */
  const firstRowOfGroup = new Map<string, Map<string, DimProduct>>();
  for (const p of dimProduct) {
    const mid = modelIdOf(p);
    if (!modelNameById.has(mid)) modelNameById.set(mid, p.model_name);
    let groups = firstRowOfGroup.get(mid);
    if (!groups) {
      groups = new Map();
      firstRowOfGroup.set(mid, groups);
    }
    const groupKey = prevGenRomramKey(p.romram);
    if (!groups.has(groupKey)) groups.set(groupKey, p);
  }

  const selected = new Set(own.map((s) => `${s.modelId}|${prevGenRomramKey(s.romram)}`));
  const missingSeen = new Set<string>();

  for (const sel of own) {
    let matched = false; // 本组至少命中一个上一代配置组（带出，或已在选）
    for (const [prevMid, prevRomram] of prevGenTargetsFor(sel.modelId, sel.romram)) {
      const row = firstRowOfGroup.get(prevMid)?.get(prevGenRomramKey(prevRomram));
      if (!row) continue; // 映射指向的配置组在当前产品主数据里不存在（防御）
      matched = true;
      const key = `${prevMid}|${prevGenRomramKey(row.romram)}`;
      if (selected.has(key)) continue; // 已选中，不重复带出（幂等）
      selected.add(key);
      added.push({ modelId: prevMid, romram: row.romram, skuIds: [lowestPriceColorSku(prevMid, row.romram) ?? row.sku_id] });
    }
    if (!matched) {
      const name = modelNameById.get(sel.modelId) ?? sel.modelId;
      if (!missingSeen.has(name)) {
        missingSeen.add(name);
        missing.push(name);
      }
    }
  }
  return { added, missing };
}

// ---------------- 变更广播（§13：配置保存后主页立即生效） ----------------

/** 配置页保存成功后调用；FiltersContext 监听后重置竞品默认组 */
export function notifyConfigChanged(): void {
  window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT));
}

/** 配置版本号（2026-11-01 异常价格守卫随广播引入）：任何配置（默认店铺/异常守卫
 *  规则/人工裁定…）保存后自增。buildSeries 结果被 useMemo 缓存的页面（价格走势/
 *  量价/多平台/预警）把该版本号加进 memo 依赖，配置一改立即重算——无需各自另设
 *  监听。node 测试环境无 window，恒 0（不影响确定性）。 */
export function useConfigVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bump = (): void => setVersion((v) => v + 1);
    window.addEventListener(CONFIG_CHANGED_EVENT, bump);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, bump);
  }, []);
  return version;
}
