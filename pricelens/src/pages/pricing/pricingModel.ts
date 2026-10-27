// ============================================================
// 定价推演页 · 计算链（纯函数，玻璃盒）：三方案测算 = 上一代同期实际 ×
// 大盘系数 × 价格响应 × 竞品情景；销毛 = 拟定价 ×（1−激励率）− 当周成本。
// 全部中间量随结果一起返回（chain），依据抽屉逐行复述同一条链——
// 界面上看到的每个数字都能在抽屉里对到公式与输入。无随机、无隐藏参数。
// ============================================================
import {
  COMP_SCENARIOS,
  CROSS_ELASTICITY,
  INCENTIVE_RATE,
  PREV_GEN,
  PREV_GEN_WEEKS,
  UNCERTAINTY_BAND,
  costAt,
  type CompScenario,
} from './mockData';

export interface Assumptions {
  /** 大盘同比 %（负 = 收缩） */
  marketYoYPct: number;
  /** 成本涨幅 % */
  costUpPct: number;
  /** 价格响应系数（|销量变化 % / 价格变化 %|） */
  elasticity: number;
  comp: CompScenario;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  marketYoYPct: -8,
  costUpPct: 6,
  elasticity: 1.6,
  comp: 'hold',
};

export interface Scheme {
  key: 'A' | 'B' | 'C';
  name: string;
  tagline: string;
  /** 拟定价（决策变量，页面可改） */
  price: number;
}

export const DEFAULT_SCHEMES: Scheme[] = [
  { key: 'A', name: '方案 A · 稳健', tagline: '守住单台销毛', price: 1149 },
  { key: 'B', name: '方案 B · 基准', tagline: '沿用上一代开盘位', price: PREV_GEN.launchPrice },
  { key: 'C', name: '方案 C · 进取', tagline: '低开对标 Phone 17 现价', price: 1029 },
];

/** 竞品情景 → 竞品价格变化 %（换代涨价 = 下一代上市价高于现价） */
export const compChangePctOf = (sc: CompScenario): number =>
  COMP_SCENARIOS.find((s) => s.key === sc)?.changePct ?? 0;

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** 测算链中间量：抽屉逐行复述用 */
export interface SchemeChain {
  prevTotalWan: number;
  marketFactor: number;
  priceFactor: number;
  priceDeltaPct: number;
  compFactor: number;
  compChangePct: number;
  launchCost: number;
  yearEndCost: number;
}

export interface SchemeResult {
  scheme: Scheme;
  /** 首年预期 SO（万台） */
  firstYearSoWan: number;
  p10Wan: number;
  p90Wan: number;
  /** 上市月单台销毛（$） */
  launchUnitMargin: number;
  /** 首年销毛贡献（亿 $） */
  marginTotalYi: number;
  /** 首年 SO 较上一代同期 % */
  vsPrevSoPct: number;
  chain: SchemeChain;
}

export function priceFactorOf(price: number, elasticity: number, launchPrice: number): number {
  return Math.max(0.05, 1 - elasticity * (price / launchPrice - 1));
}

export function compFactorOf(sc: CompScenario): number {
  return 1 + CROSS_ELASTICITY * (compChangePctOf(sc) / 100);
}

/** 当周单台销毛：拟定价 ×（1−激励率）−（上一代成本曲线 × 成本涨幅） */
export function unitMarginOf(price: number, week: number, costUpPct: number): number {
  return price * (1 - INCENTIVE_RATE) - costAt(week) * (1 + costUpPct / 100);
}

export function computeScheme(scheme: Scheme, a: Assumptions): SchemeResult {
  const marketFactor = Math.max(0.2, 1 + a.marketYoYPct / 100);
  const priceFactor = priceFactorOf(scheme.price, a.elasticity, PREV_GEN.launchPrice);
  const compFactor = compFactorOf(a.comp);
  const weekFactor = marketFactor * priceFactor * compFactor;

  // 量：沿用上一代同期周形状（首销放量/档期放大/自然衰减全部保留），整体乘三系数
  const weeklySo = PREV_GEN_WEEKS.map((w) => w.so * weekFactor);
  const firstYearSoWan = round1(weeklySo.reduce((s, v) => s + v, 0) / 10);

  // 利：逐周销毛（成本随规模效应下降），全年加总
  const launchUnitMargin = Math.round(unitMarginOf(scheme.price, 0, a.costUpPct));
  const marginTotalYi = weeklySo.reduce((s, so, w) => s + so * unitMarginOf(scheme.price, w, a.costUpPct), 0) / 1e5;

  return {
    scheme,
    firstYearSoWan,
    p10Wan: round1(firstYearSoWan * (1 - UNCERTAINTY_BAND)),
    p90Wan: round1(firstYearSoWan * (1 + UNCERTAINTY_BAND)),
    launchUnitMargin,
    marginTotalYi: Math.round(marginTotalYi * 100) / 100,
    vsPrevSoPct: Math.round((firstYearSoWan / PREV_GEN.totalSoWan - 1) * 1000) / 10,
    chain: {
      prevTotalWan: PREV_GEN.totalSoWan,
      marketFactor: Math.round(marketFactor * 1000) / 1000,
      priceFactor: Math.round(priceFactor * 1000) / 1000,
      priceDeltaPct: Math.round((scheme.price / PREV_GEN.launchPrice - 1) * 1000) / 10,
      compFactor: Math.round(compFactor * 1000) / 1000,
      compChangePct: compChangePctOf(a.comp),
      launchCost: Math.round(costAt(0) * (1 + a.costUpPct / 100)),
      yearEndCost: Math.round(costAt(51) * (1 + a.costUpPct / 100)),
    },
  };
}

export function computeAll(schemes: Scheme[], a: Assumptions): SchemeResult[] {
  return schemes.map((s) => computeScheme(s, a));
}
