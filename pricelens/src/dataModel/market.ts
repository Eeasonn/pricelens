// ============================================================
// 第118轮（2026-10-21）量价看板 · 大盘分析纯计算层。
// 第一百二十三轮（2026-10-22 走查会重做）：大盘卡改「档位分布」结构——
//   - 上方大盘图 = 某一期（默认最新）各价格档位的销量分布（tierStructure 单期口径），
//     原期序时间堆叠 marketTimeStack 退役（连同金测删除）；
//   - 环比贡献拆解 = 必选档位下的品牌行 + 行内展开的产品子行：
//     brandContribution 按档位过滤、Δ 降序（拉动最上、拖累最下），
//     原 |Δ| 排序的 contributionRows 与「品牌/产品」粒度切换一并并入本函数。
// 口径：
//   - 大盘 = 当前国家 × 产业下全部「型号 × 配置」（颜色聚合在配置内）；
//   - 销量 = dataModel/volume（估算口径，台；调用方传入逐配置取数结果）；
//   - 档位 = 分国 tier_by_country（dimTier 产业阶梯，业务声明优先）；
//   - 档位结构 = 某一期 档位 → 品牌台数合计（自有品牌置底，绝对量）；
//   - 环比贡献 = 当前期 − 上一期（台），任一期缺采按 0 计（在架变化如实计入），
//     两期全缺的配置跳过，Δ = 0 的行不出，品牌行与其产品子行均按 Δ 降序。
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
 *  tierOrder = 产业阶梯（低 → 高）；只返回 total > 0 的档位，按阶梯序。
 *  第一百二十三轮起即大盘图的横轴：每档一根柱，柱内分段 = byBrand（序首 = 自有 = 视觉置底）。 */
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

// ---------------- 环比贡献拆解（第一百二十三轮：必选档位 · 品牌行 + 产品子行） ----------------

/** 产品子行：该品牌在所选档位下的单个「型号 × 配置」的台数变化 */
export interface BrandProductRow {
  /** = marketKeyOf(配置) */
  key: string;
  /** 型号 + 配置 */
  label: string;
  delta: number; // 台；正 = 拉动，负 = 拖累
}

/** 品牌贡献行：行 = 品牌，products = 展开用的产品子行（均 Δ 降序） */
export interface BrandContributionRow {
  brand: string;
  /** 品牌合计 = 子行 Δ 之和（子行先取整再求和，与展示读数严格一致） */
  delta: number;
  products: BrandProductRow[];
}

/** 环比贡献拆解：只看所选档位，Δ = 当前期 − 上一期（任一期缺采按 0 计 = 在架变化
 *  如实计入）；两期全缺的配置跳过；Δ = 0 的品牌行/产品行不出；品牌行与其产品子行
 *  均按 Δ 降序（同量标签字典序）——拉动最大在最上、拖累最大在最下。
 *  total = 该档位全部变化的合计（= 品牌行 Δ 之和）。无该档位配置 → 空行 + 0。 */
export function brandContribution(
  configs: MarketConfig[],
  prevVol: Map<string, number | null>,
  selVol: Map<string, number | null>,
  tierCode: string,
): { rows: BrandContributionRow[]; total: number } {
  const byBrand = new Map<string, Map<string, BrandProductRow>>();
  for (const c of configs) {
    if (c.tierCode !== tierCode) continue;
    const key = marketKeyOf(c);
    const pv = prevVol.get(key) ?? null;
    const sv = selVol.get(key) ?? null;
    if (pv == null && sv == null) continue;
    const delta = Math.round((sv ?? 0) - (pv ?? 0));
    let products = byBrand.get(c.brand);
    if (!products) {
      products = new Map<string, BrandProductRow>();
      byBrand.set(c.brand, products);
    }
    const hit = products.get(key);
    if (hit) hit.delta += delta;
    else products.set(key, { key, label: c.label, delta });
  }
  const rows = [...byBrand.entries()]
    .map(([brand, products]) => {
      const subs = [...products.values()]
        .filter((p) => p.delta !== 0)
        .sort((a, b) => b.delta - a.delta || a.label.localeCompare(b.label));
      return { brand, delta: subs.reduce((acc, p) => acc + p.delta, 0), products: subs };
    })
    .filter((r) => r.delta !== 0)
    .sort((a, b) => b.delta - a.delta || a.brand.localeCompare(b.brand));
  return { rows, total: rows.reduce((acc, r) => acc + r.delta, 0) };
}

/** 带符号整数文案：+94 / −177 / 0（U+2212 负号，全站数值同语言） */
export function fmtSignedInt(v: number): string {
  if (v === 0) return '0';
  return (v > 0 ? '+' : '−') + Math.abs(v).toLocaleString('en-US');
}
