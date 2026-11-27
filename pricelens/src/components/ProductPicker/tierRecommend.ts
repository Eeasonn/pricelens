// ============================================================
// 「同档位推荐」纯模型（2026-11-27）：按主品配置在当前国家的分国档位
// （tier_by_country，缺省回落型号级 tier_code）取同档、同国家、同产业的全部
// 「型号 × 配置」候选，按品牌分组，并给出可追溯的现价 / 价差 / 数据覆盖 / 来源状态。
// 口径（全部确定性、可解释——不做 AI 打分、不虚构数据）：
// · 候选 = configsInTier（同产业同档位、当前国家有数据）去掉主品自身组与已在
//   对比区的组；
// · 当前参考价 = 该配置默认（最低价）颜色 SKU 在当前国家默认电渠口径下「最新有价
//   周 / 期」的折后价（与选择产品树行尾「现价」同源：tree.latestPrices），币种随
//   筛选；默认电渠无价 = null，界面显示「—」并标「暂无价格」；
// · 相对主品价差 = (候选现价 − 主品现价) / 主品现价；任一缺失 = null；
// · 数据覆盖 = 当前国家该配置有价的周数 / 全量周数（ZA = 有价月数 / 已发布月数）；
//   任意渠道有价即计入——只表达「有没有采到」，不代表取价口径；
// · 来源状态 = 周度平台实抓（真实）/ ZA 运营商小册子（真实）；无价 = 暂无价格；
// · 组内排序 = 与主品现价最接近者在前（|价差| 升序），无价殿后，再按名称——
//   「每品牌选 1 款」即取组内首位，规则在弹窗内明示。
// 无副作用、无 React；事实表在数据包置换时原位替换，索引一律按调用现算（不缓存）。
// ============================================================
import { dimProduct, dimTime, factPriceMonthly, factPriceWeekly } from '../../data';
import type { Industry } from '../../dataModel/types';
import type { FinancingTerm, FinancingType } from '../../dataModel/marketProfile';
import { tierOf } from '../../dataModel/aggregate';
import type { ProductSelection } from '../../state/filtersTypes';
import { selKey } from '../../state/mainSelection';
import { configsInTier } from '../../state/tierSelection';
import { brandOfModel, defaultColorSkuIds, modelNameOf, type RomramNode } from '../ProductCascader/tree';

const norm = (s: string): string => s.replace(/\s+/g, '');

/** 主品配置在当前国家的档位代码；型号 / 配置不在维表或维表无档位 = null */
export function tierOfSelection(sel: ProductSelection, countryCode: string): string | null {
  const row = dimProduct.find(
    (p) => p.model_id === sel.modelId && p.countries.includes(countryCode) && norm(p.romram) === norm(sel.romram),
  ) ?? dimProduct.find((p) => p.model_id === sel.modelId && norm(p.romram) === norm(sel.romram));
  if (!row) return null;
  const tier = tierOf(row, countryCode);
  return tier || null;
}

/** 配置当前参考价（显示币种）：默认最低价色 SKU 的最新价；默认色无价时回落该配置
 *  有价颜色里的最低价；全无价 = null */
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
  /** 当前参考价（显示币种）；null = 默认电渠无价 */
  price: number | null;
  coverage: CoverageInfo;
  /** 相对主品价差（小数；正 = 比主品贵）；任一现价缺失 = null */
  diffPct: number | null;
}

export interface TierCandidateGroup {
  brand: string;
  items: TierCandidate[];
}

export interface TierRecommendInput {
  industry: Industry;
  tier: string;
  countryCode: string;
  currency: 'usd' | 'local';
  financingType: FinancingType | null;
  financingTerms: FinancingTerm[];
  /** 主品现价（同 referencePriceOf 口径）；null = 无法算价差 */
  mainPrice: number | null;
  /** 主品自身组 + 已在对比区的组（selKey）——不进候选 */
  excludeKeys: ReadonlySet<string>;
  /** 配置节点索引（useTreeData().romramByKey） */
  romramByKey: ReadonlyMap<string, RomramNode>;
  /** 品牌展示顺序（选择产品树的品牌序：我司置顶 → 矩阵列序 → 型号数） */
  brandOrder: readonly string[];
}

/** 候选价差排序：|价差| 升序（与主品现价最接近在前）→ 无价殿后 → 型号名 → 配置 */
const byCloseness = (a: TierCandidate, b: TierCandidate): number => {
  const da = a.diffPct == null ? Number.POSITIVE_INFINITY : Math.abs(a.diffPct);
  const db = b.diffPct == null ? Number.POSITIVE_INFINITY : Math.abs(b.diffPct);
  return da - db || a.modelName.localeCompare(b.modelName, undefined, { numeric: true }) || a.romram.localeCompare(b.romram, undefined, { numeric: true });
};

/** 构建同档位候选（按品牌分组；组序 = brandOrder，未登记品牌按字母序殿后） */
export function buildTierCandidates(input: TierRecommendInput): TierCandidateGroup[] {
  const configs = configsInTier(input.industry, input.tier, input.countryCode, false, input.financingType, input.financingTerms);
  const byBrand = new Map<string, TierCandidate[]>();
  for (const sel of configs) {
    const key = selKey(sel);
    if (input.excludeKeys.has(key)) continue;
    const node = input.romramByKey.get(`${sel.modelId}|${sel.romram}`);
    const price = referencePriceOf(node, input.currency);
    const brand = brandOfModel(sel.modelId);
    const cand: TierCandidate = {
      sel,
      key,
      brand,
      modelName: modelNameOf(sel.modelId),
      romram: sel.romram,
      price,
      coverage: coverageOf(node ? node.colors.map((c) => c.skuId) : sel.skuIds, input.countryCode),
      diffPct: price != null && input.mainPrice != null && input.mainPrice > 0 ? (price - input.mainPrice) / input.mainPrice : null,
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
