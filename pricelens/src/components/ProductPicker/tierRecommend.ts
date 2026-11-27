// ============================================================
// 「同档位推荐」纯模型（2026-11-27 二轮改版 · 现价落档口径）：候选 = 与主品
// 配置按现价落入同一档位的「型号 × 配置」组（同国家、同产业、当前国家有数据），
// 按品牌分组，并给出可追溯的现价 / 价差 / 数据覆盖 / 来源状态。
// 口径（全部确定性、可解释——不做 AI 打分、不虚构数据）：
// · 主品档位 = 主品现价落档（dataModel/tierPrice.currentTierOfSelection）——
//   不再是 tier_by_country 声明档：现价 = 最新有价期全渠道价格点剔除
//   低于均值 30% 的异常低价后取最低（USD 口径）；主品无现价 = 无法推荐；
// · 候选 = 同国同产业有数据的全部组里现价落档与主品同档者（批量裁定
//   currentPricesByGroup，事实表只扫一遍）；去掉主品自身组与已在对比区的组；
// · 当前参考价 = 该组现价（同一 tierPrice 口径），币种随筛选；
// · 相对主品价差 = (候选现价 − 主品现价) / 主品现价；任一缺失 = null；
// · 数据覆盖 = 当前国家该配置有价的周数 / 全量周数（ZA = 有价月数 / 已发布月数）；
//   任意渠道有价即计入——只表达「有没有采到」，不代表取价口径；
// · 来源状态 = 周度平台实抓（真实）/ ZA 运营商小册子（真实）；无价 = 暂无价格；
// · 组内排序 = 与主品现价最接近者在前（|价差| 升序），无价殿后，再按名称——
//   「每品牌选 1 款」即取组内首位，规则在弹窗内明示。
// 无副作用、无 React；事实表在数据包置换时原位替换，索引一律按调用现算（不缓存）。
// ============================================================
import { dimTime, factPriceMonthly, factPriceWeekly } from '../../data';
import type { Industry } from '../../dataModel/types';
import type { FinancingTerm, FinancingType } from '../../dataModel/marketProfile';
import type { ProductSelection } from '../../state/filtersTypes';
import { selKey } from '../../state/mainSelection';
import { brandOfModel, defaultColorSkuIds, modelNameOf, type RomramNode } from '../ProductCascader/tree';
import type { CurrentPrice, GroupPriceEntry } from '../../dataModel/tierPrice';

/** 配置节点默认（最低价）颜色的最新折后价（币种随筛选）——树行尾「档位 · 现价」
 *  与 category1 快速切换的通用读数（树口径，与现价落档口径无关） */
export function referencePriceOf(node: RomramNode | undefined, currency: 'usd' | 'local'): number | null {
  if (!node) return null;
  const valueOf = (skuId: string): number | null => {
    const c = node.colors.find((x) => x.skuId === skuId);
    return c ? (currency === 'usd' ? c.latestUsd : c.latestLocal) : null;
  };
  const def = defaultColorSkuIds(node)[0];
  const viaDefault = def ? valueOf(def) : null;
  if (viaDefault != null) return viaDefault;
  const priced = node.colors
    .map((c) => (currency === 'usd' ? c.latestUsd : c.latestLocal))
    .filter((v): v is number => v != null);
  return priced.length ? Math.min(...priced) : null;
}

export interface CoverageInfo {
  /** 有价周数（ZA：有价月数） */
  covered: number;
  /** 全量周数（ZA：已发布月数） */
  total: number;
  /** 最新有价周 id（ZA：最新有价月 id）；无价 = null */
  latest: string | null;
}

/** 当前国家某配置的数据覆盖：任意渠道有价即计入；ZA 走运营商小册子月度事实
 *  （仅 PASS 行进入发布事实，与看板取数同口径） */
export function coverageOf(skuIds: readonly string[], countryCode: string): CoverageInfo {
  const skus = new Set(skuIds);
  if (countryCode === 'ZA') {
    const periods = new Set<string>();
    const allPeriods = new Set<string>();
    for (const row of factPriceMonthly) {
      if (row.country_code !== 'ZA' || row.price_local == null) continue;
      allPeriods.add(row.period_id);
      if (row.sku_id != null && skus.has(row.sku_id)) periods.add(row.period_id);
    }
    const sorted = [...periods].sort();
    return { covered: periods.size, total: allPeriods.size || 1, latest: sorted.length ? sorted[sorted.length - 1] : null };
  }
  const weeks = new Set<string>();
  for (const row of factPriceWeekly) {
    if (row.country_code !== countryCode || row.price_local == null) continue;
    if (skus.has(row.sku_id)) weeks.add(row.week_id);
  }
  const sorted = [...weeks].sort();
  return { covered: weeks.size, total: dimTime.length || 1, latest: sorted.length ? sorted[sorted.length - 1] : null };
}

export interface TierCandidate {
  sel: ProductSelection;
  key: string;
  brand: string;
  modelName: string;
  romram: string;
  /** 现价（USD，tierPrice 口径）；null = 该组最新期无价格点 */
  usd: number | null;
  /** 现价（本币，同一行）；null 同上 */
  local: number | null;
  /** 取价期（周 id / ZA 月 id）；无价 = null */
  period: string | null;
  /** 被剔除的异常低价点数（0 = 无剔除） */
  droppedCount: number;
  /** 相对主品价差（小数；正 = 比主品贵）；任一现价缺失 = null */
  diffPct: number | null;
  coverage: CoverageInfo;
}

export interface TierCandidateGroup {
  brand: string;
  items: TierCandidate[];
}

export interface TierRecommendInput {
  industry: Industry;
  /** 主品现价落档（band code）；null = 主品无现价、不出候选 */
  band: string;
  countryCode: string;
  financingType: FinancingType | null;
  financingTerms: FinancingTerm[];
  /** 主品现价 USD（同 currentTierOfSelection 口径）；null = 无法算价差 */
  mainUsd: number | null;
  /** 主品自身组 + 已在对比区的组（selKey）——不进候选 */
  excludeKeys: ReadonlySet<string>;
  /** 批量现价裁定（currentPricesByGroup 结果，调用方 useMemo 一次） */
  byGroup: ReadonlyMap<string, GroupPriceEntry>;
  /** 该国有数据的组键集（productHasDataInCountry 口径，financing-aware，调用方先算）。
   *  键可用 dimProduct 原值或归一键——内部统一归一后比对（2026-11-28 键归一修复） */
  dataKeys: ReadonlySet<string>;
  /** 组键 → 该组在当前国家覆盖的全部颜色 SKU（覆盖统计用） */
  groupSkus: ReadonlyMap<string, readonly string[]>;
  /** 品牌展示顺序（选择产品树的品牌序：我司置顶 → 矩阵列序 → 型号数） */
  brandOrder: readonly string[];
}

/** 候选价差排序：|价差| 升序（与主品现价最接近在前）→ 无价殿后 → 型号名 → 配置 */
const byCloseness = (a: TierCandidate, b: TierCandidate): number => {
  const da = a.diffPct == null ? Number.POSITIVE_INFINITY : Math.abs(a.diffPct);
  const db = b.diffPct == null ? Number.POSITIVE_INFINITY : Math.abs(b.diffPct);
  return da - db || a.modelName.localeCompare(b.modelName, undefined, { numeric: true }) || a.romram.localeCompare(b.romram, undefined, { numeric: true });
};

/** 构建同档候选（按品牌分组；组序 = brandOrder，未登记品牌按字母序殿后）：
 *  候选 = byGroup 里现价落档 == 主品档位、且该国有数据（dataKeys）的组 */
export function buildTierCandidates(input: TierRecommendInput): TierCandidateGroup[] {
  const byBrand = new Map<string, TierCandidate[]>();
  // 键归一（2026-11-28）：byGroup 键 = groupKeyOf（romram 空白剥离）；dataKeys/groupSkus
  // 由调用方按 dimProduct 原值键构建——查询侧统一归一后再查，两侧键口径解耦
  const normKey = (k: string): string => {
    const sep = k.indexOf('|');
    return `${k.slice(0, sep)}|${k.slice(sep + 1).replace(/\s+/g, '')}`;
  };
  const dataKeysNorm = new Set([...input.dataKeys].map(normKey));
  const groupSkusNorm = new Map<string, readonly string[]>();
  for (const [k, v] of input.groupSkus) groupSkusNorm.set(normKey(k), v);
  for (const [key, entry] of input.byGroup) {
    if (entry.tier !== input.band) continue;
    if (!dataKeysNorm.has(key)) continue;
    if (input.excludeKeys.has(selKey(entry.sel))) continue;
    const brand = brandOfModel(entry.sel.modelId);
    const cand: TierCandidate = {
      sel: entry.sel,
      key,
      brand,
      modelName: modelNameOf(entry.sel.modelId),
      romram: entry.sel.romram,
      usd: entry.price.usd,
      local: entry.price.local,
      period: entry.price.period,
      droppedCount: entry.price.dropped.length,
      diffPct: entry.price.usd != null && input.mainUsd != null && input.mainUsd > 0 ? (entry.price.usd - input.mainUsd) / input.mainUsd : null,
      coverage: coverageOf(groupSkusNorm.get(key) ?? [], input.countryCode),
    };
    const list = byBrand.get(brand);
    if (list) list.push(cand);
    else byBrand.set(brand, [cand]);
  }
  const rank = new Map(input.brandOrder.map((b, i) => [b, i] as const));
  return [...byBrand.entries()]
    .map(([brand, items]) => ({ brand, items: [...items].sort(byCloseness) }))
    .sort((a, b) => (rank.get(a.brand) ?? 999) - (rank.get(b.brand) ?? 999) || a.brand.localeCompare(b.brand));
}

/** 「每品牌选 1 款」：各组首位（= 与主品现价最接近、无价殿后；规则见 byCloseness） */
export function pickOnePerBrand(groups: readonly TierCandidateGroup[]): string[] {
  return groups.flatMap((g) => (g.items.length ? [g.items[0].key] : []));
}

/** 价差文案：+12.4% / −3.0% / 0.0%（U+2212 负号，与看板价差同语言）；无值 =「—」 */
export function diffPctText(diffPct: number | null): string {
  if (diffPct == null) return '—';
  const pct = diffPct * 100;
  if (Math.abs(pct) < 0.05) return '0.0%';
  return `${pct < 0 ? '−' : '+'}${Math.abs(pct).toFixed(1)}%`;
}

/** 覆盖文案：周 = 「23/27 周」；ZA 月度 = 「5/6 月」 */
export function coverageText(c: CoverageInfo, countryCode: string): string {
  return countryCode === 'ZA' ? `${c.covered}/${c.total} 月` : `${c.covered}/${c.total} 周`;
}

/** 最新时点文案：周 id → 2026W45；月 id → 2026-10 */
export function latestText(c: CoverageInfo): string {
  if (!c.latest) return '';
  const m = /^(\d{4})(\d{2})$/.exec(c.latest);
  if (!m) return c.latest;
  return dimTime.some((t) => t.week_id === c.latest)
    ? `${m[1]}W${Number(m[2])}`
    : `${m[1]}-${m[2]}`;
}

/** 期号文案（取价期：周 id → 2026W45；月 id → 2026-10）；与 latestText 同规则 */
export function periodText(period: string | null): string {
  return latestText({ covered: 0, total: 1, latest: period });
}

// CurrentPrice 类型透传（弹窗 tooltip 用，无需直接引 dataModel）
export type { CurrentPrice };
