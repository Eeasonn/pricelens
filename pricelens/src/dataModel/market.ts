// ============================================================
// 第118轮（2026-10-21）量价看板 · 大盘分析纯计算层。
// 口径：
//   - 大盘 = 当前国家 × 产业下全部「型号 × 配置」（颜色聚合在配置内）；
//   - 销量 = dataModel/volume（估算口径，台；调用方传入逐配置取数结果）；
//   - 档位 = 分国 tier_by_country（dimTier 产业阶梯，业务声明优先）；
//   - 堆叠结构 = 档位 × 品牌（100% 拉齐，自有品牌置底）；
//   - 时间堆叠（第120轮走查会）= 期序大盘柱：柱高 = 该期大盘总台数（绝对量），
//     柱内分段 = 品牌构成（序即自下而上堆叠序，brandOrder 首位品牌视觉置底）；
//     销量 null 的配置该期不计入，全缺期 total = 0 照常输出（画空档）；
//   - 环比贡献 = 选中期 − 上一期（台），品牌/产品两种粒度聚合，0 变化行不出。
// 全部纯函数、无随机数，可金测。
// ============================================================
import type { DimProduct, Industry } from './types';

/** 大盘配置（型号 × 配置粒度；同型号同配置多颜色归一） */
export interface MarketConfig {
  modelId: string;
  romram: string; // 展示配置（组内首个原文，含空格）
  brand: string;
  modelName: string;
  /** 产品粒度行标签：型号 + 配置 */
  label: string;
  tierCode: string;
}

export type MarketGranule = 'brand' | 'product';

export const marketKeyOf = (c: MarketConfig): string => `${c.modelId}|${c.romram.replace(/\s+/g, '')}`;

/** 枚举国家 × 产业下的大盘配置（首见序 = 维表序，确定性） */
export function marketConfigs(products: DimProduct[], cc: string, industry: Industry): MarketConfig[] {
  const groups = new Map<string, MarketConfig>();
  for (const p of products) {
    if (p.industry !== industry || !p.countries.includes(cc)) continue;
    const key = `${p.model_id}|${p.romram.replace(/\s+/g, '')}`;
    if (groups.has(key)) continue;
    groups.set(key, {
      modelId: p.model_id,
      romram: p.romram,
      brand: p.brand,
      modelName: p.model_name,
      label: `${p.model_name} ${p.romram}`,
      tierCode: p.tier_by_country?.[cc] ?? p.tier_code,
    });
  }
  return [...groups.values()];
}

/** 品牌序：自有品牌置顶，其余按合计销量降序（同量品牌名字典序，确定性） */
export function marketBrandOrder(
  configs: MarketConfig[],
  volByKey: Map<string, number | null>,
  ownBrand: string,
): string[] {
  const totals = new Map<string, number>();
  for (const c of configs) {
    const v = volByKey.get(marketKeyOf(c)) ?? null;
    if (v == null) continue;
    totals.set(c.brand, (totals.get(c.brand) ?? 0) + v);
  }
  return [...totals.keys()].sort((a, b) => {
    if (a === ownBrand) return -1;
    if (b === ownBrand) return 1;
    const d = (totals.get(b) ?? 0) - (totals.get(a) ?? 0);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

export interface TierStructure {
  tierCode: string;
  total: number;
  /** 按品牌序（自有置顶，其余量降序） */
  byBrand: { brand: string; vol: number }[];
}

/** 某一期的大盘结构：档位 → 品牌台数合计（销量为 null 的配置不计入）。
 *  tierOrder = 产业阶梯（低 → 高）；只返回 total > 0 的档位，按阶梯序。 */
export function tierStructure(
  configs: MarketConfig[],
  volByKey: Map<string, number | null>,
  tierOrder: string[],
  brandOrder: string[],
): TierStructure[] {
  const byTier = new Map<string, Map<string, number>>();
  for (const c of configs) {
    const v = volByKey.get(marketKeyOf(c)) ?? null;
    if (v == null || v <= 0) continue;
    let brands = byTier.get(c.tierCode);
    if (!brands) {
      brands = new Map<string, number>();
      byTier.set(c.tierCode, brands);
    }
    brands.set(c.brand, (brands.get(c.brand) ?? 0) + v);
  }
  const brandRank = new Map(brandOrder.map((b, i) => [b, i]));
  return tierOrder
    .filter((t) => (byTier.get(t)?.size ?? 0) > 0)
    .map((tierCode) => {
      const brands = byTier.get(tierCode)!;
      const byBrand = [...brands.entries()]
        .map(([brand, vol]) => ({ brand, vol }))
        .sort((a, b) => {
          const ra = brandRank.get(a.brand) ?? Number.MAX_SAFE_INTEGER;
          const rb = brandRank.get(b.brand) ?? Number.MAX_SAFE_INTEGER;
          return ra !== rb ? ra - rb : b.vol - a.vol;
        });
      return { tierCode, total: byBrand.reduce((acc, b) => acc + b.vol, 0), byBrand };
    });
}

export interface ContributionRow {
  key: string; // 品牌名 或 `${modelId}|${romram去空格}`
  label: string;
  brand: string; // 品牌点/品牌色
  tierCode: string;
  delta: number; // 台；正 = 拉动大盘，负 = 拖累大盘
}

/** 环比贡献拆解：Δ = 选中期 − 上一期（任一期缺采按 0 计 = 在架变化如实计入）；
 *  两期全缺的配置跳过；Δ = 0 的行不出；行按 |Δ| 降序（同量标签字典序） */
export function contributionRows(
  configs: MarketConfig[],
  prevVol: Map<string, number | null>,
  selVol: Map<string, number | null>,
  granule: MarketGranule,
): { rows: ContributionRow[]; total: number } {
  const agg = new Map<string, ContributionRow>();
  let total = 0;
  for (const c of configs) {
    const key = marketKeyOf(c);
    const pv = prevVol.get(key) ?? null;
    const sv = selVol.get(key) ?? null;
    if (pv == null && sv == null) continue;
    const delta = (sv ?? 0) - (pv ?? 0);
    total += delta;
    const rowKey = granule === 'brand' ? c.brand : key;
    const label = granule === 'brand' ? c.brand : c.label;
    const hit = agg.get(rowKey);
    if (hit) hit.delta += delta;
    else agg.set(rowKey, { key: rowKey, label, brand: c.brand, tierCode: c.tierCode, delta });
  }
  const rows = [...agg.values()].filter((r) => Math.round(r.delta) !== 0).map((r) => ({ ...r, delta: Math.round(r.delta) }));
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.label.localeCompare(b.label));
  return { rows, total: Math.round(total) };
}

/** 带符号整数文案：+94 / −177 / 0（U+2212 负号，全站数值同语言） */
export function fmtSignedInt(v: number): string {
  if (v === 0) return '0';
  return (v > 0 ? '+' : '−') + Math.abs(v).toLocaleString('en-US');
}

// ---------------- 时间轴堆叠（第120轮走查会：大盘卡柱状图改期序） ----------------

/** 单期大盘堆叠结构（时间柱一期的柱体） */
export interface MarketPeriodStack {
  /** 该期大盘合计台数（缺采配置不计入；无任何在架数据 = 0，渲染为空档） */
  total: number;
  /** 品牌分段，序 = 自下而上堆叠序：brandOrder 序（首位品牌视觉置底），
   *  序外品牌殿后（量降序）；仅含 vol > 0 的品牌 */
  byBrand: { brand: string; vol: number }[];
}

/** 期序大盘堆叠（第120轮）：横轴 = 查看范围各期，柱高 = 该期大盘总台数（绝对量），
 *  柱内分段 = 品牌构成。输入 = 调用方（组件）批量取数后展平的台数表：
 *  键 = `${marketKeyOf(c)}|${期下标}`（期下标 = 窗口内 0 起，缺项按缺采 = null 处理）；
 *  期数由键集推断（对每个配置自 0 起探测到首个缺键）。销量 null（或 ≤0）的配置该期
 *  不计入；total 为 0 的期照常输出（total 0 + 空 byBrand）以便画空档。
 *  tierFilter 非 null 时先过滤 configs 的 tierCode（无匹配配置 → 空数组）。 */
export function marketTimeStack(
  configs: MarketConfig[],
  volByKeyBucket: Map<string, number | null>,
  tierFilter: string | null,
  brandOrder: string[],
): MarketPeriodStack[] {
  const use = tierFilter == null ? configs : configs.filter((c) => c.tierCode === tierFilter);
  if (use.length === 0) return [];
  let n = 0;
  for (const c of use) {
    const base = marketKeyOf(c);
    while (volByKeyBucket.has(`${base}|${n}`)) n += 1;
  }
  const rank = new Map(brandOrder.map((b, i) => [b, i]));
  const out: MarketPeriodStack[] = [];
  for (let bi = 0; bi < n; bi++) {
    const byBrand = new Map<string, number>();
    let total = 0;
    for (const c of use) {
      const v = volByKeyBucket.get(`${marketKeyOf(c)}|${bi}`) ?? null;
      if (v == null || v <= 0) continue;
      total += v;
      byBrand.set(c.brand, (byBrand.get(c.brand) ?? 0) + v);
    }
    const segments = [...byBrand.entries()]
      .map(([brand, vol]) => ({ brand, vol }))
      .sort((a, b) => {
        const ra = rank.get(a.brand) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.brand) ?? Number.MAX_SAFE_INTEGER;
        return ra !== rb ? ra - rb : b.vol - a.vol;
      });
    out.push({ total, byBrand: segments });
  }
  return out;
}

/** 档位筛选选项：该国 × 产业下实际出现的价格档位（产业阶梯序，去重） */
export function marketTierOptions(configs: MarketConfig[], tierOrder: string[]): string[] {
  const present = new Set(configs.map((c) => c.tierCode));
  return tierOrder.filter((t) => present.has(t));
}
