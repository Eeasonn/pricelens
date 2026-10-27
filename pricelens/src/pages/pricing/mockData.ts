// ============================================================
// 定价推演页 · 全模拟数据（第一百六十五轮）：不接任何真实维表/事实表，
// 一套自洽的教学数据——上一代 P70 Pro 示例市场 52 周量价全史、竞品价格
// 参照、3 次调价事件复盘（价格响应系数的证据来源）。全部确定性生成
// （无随机数），金测可锁数值。接入真实数据时替换本文件即可，页面与
// 计算链不动。
// ============================================================

/** 上一代逐周口径：周龄 / 账面价（阶梯）/ 周成交均价 / 周销量（千台） */
export interface PrevWeek {
  week: number;
  rrp: number;
  asp: number;
  so: number;
}

const RRP_LADDER: { from: number; price: number }[] = [
  { from: 0, price: 1099 },
  { from: 12, price: 1049 },
  { from: 26, price: 999 },
  { from: 40, price: 949 },
];

/** 促销周成交价的额外折扣（其余周 0）；口径 = 账面价 ×（基础折扣 + 事件折扣） */
const PROMO_DISCOUNT: Record<number, number> = {
  14: -0.03, 26: -0.045, 27: -0.03, 40: -0.06, 41: -0.045, 48: -0.05, 49: -0.03,
};

/** 促销周销量放大（其余周 1）：年中促 / 开学季 / 黑五 / 假日季 */
const PROMO_LIFT: Record<number, number> = {
  14: 1.7, 26: 2.1, 27: 1.4, 40: 2.6, 41: 1.6, 48: 2.2, 49: 1.3,
};

/** 首销三周放量后按周 −2.5% 衰减，3.4 千台见底 */
const baseSo = (w: number): number => (w <= 2 ? [9.2, 11.8, 12.6][w] : Math.max(3.4, 12.6 * Math.pow(0.975, w - 2)));

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r0 = (v: number): number => Math.round(v);

export const PREV_GEN_WEEKS: PrevWeek[] = Array.from({ length: 52 }, (_, w) => {
  const ladder = RRP_LADDER.filter((s) => s.from <= w);
  const rrp = ladder[ladder.length - 1].price;
  const asp = r0(rrp * (0.985 - w * 0.0006 + (PROMO_DISCOUNT[w] ?? 0)));
  return { week: w, rrp, asp, so: r1(baseSo(w) * (PROMO_LIFT[w] ?? 1)) };
});

export const PREV_GEN = {
  name: 'P70 Pro',
  launchPrice: 1099,
  /** 首年 SO 合计（万台） */
  totalSoWan: r1(PREV_GEN_WEEKS.reduce((s, w) => s + w.so, 0) / 10),
};

export const CUR_PRODUCT = { name: 'P80 Pro', status: '拟上市' };

export const COMPETITORS = [
  { name: 'Phone 17', launchPrice: 1099, currentPrice: 1029 },
  { name: 'S26 Ultra', launchPrice: 1299, currentPrice: 1199 },
];

/** 上一代单台成本曲线：上市 $632，随规模效应急速缓降 */
export const COST = { baseAtLaunch: 632, weeklyDecline: 0.65 };
export const costAt = (w: number): number => r0(COST.baseAtLaunch - COST.weeklyDecline * w);

/** 调价事件复盘（上一代 3 次）：so4wPct = 调价后 4 周销量变化的朴素值；
 *  attributedPct = 扣除同期档期后的归因值（响应系数 = |attributedPct / changePct|） */
export interface PricingEvent {
  week: number;
  anchor: string;
  changePct: number;
  so4wPct: number;
  context: string;
  attributedPct: number;
}

export const PRICING_EVENTS: PricingEvent[] = [
  { week: 12, anchor: '①', changePct: -4.6, so4wPct: 9.8, context: '同期无档期', attributedPct: 9.8 },
  { week: 26, anchor: '②', changePct: -4.8, so4wPct: 18.9, context: '开学季', attributedPct: 8.6 },
  { week: 40, anchor: '③', changePct: -5.0, so4wPct: 21.5, context: '黑五', attributedPct: 7.1 },
];

/** 价格响应系数：3 次事件归因值 2.13 / 1.79 / 1.42 → 参照区间与默认值 */
export const ELASTICITY = { min: 1.4, max: 2.1, default: 1.6 };

/** 固定口径（页内展示于依据抽屉，不做输入） */
export const INCENTIVE_RATE = 0.03;
export const UNCERTAINTY_BAND = 0.12;
export const CROSS_ELASTICITY = 0.35;

export type CompScenario = 'hold' | 'up' | 'down';

export const COMP_SCENARIOS: { key: CompScenario; label: string; changePct: number }[] = [
  { key: 'hold', label: '维持现价', changePct: 0 },
  { key: 'up', label: '换代涨价', changePct: 5 },
  { key: 'down', label: '换代降价', changePct: -3 },
];
