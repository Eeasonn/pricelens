// ============================================================
// 定价推演页 · 全模拟数据（第一百六十五轮波2，Eason「有理有据」四点）：
// 不接任何真实维表/事实表，一套自洽教学数据——
// ①大盘：示例市场分价格档容量 12 个季度实际 + 未来 4 季预估（用户可调）；
// ②成本：产品线单台全成本 24 个月实际 + 未来 12 个月预估（用户可调）；
// ③量价证据：两款产品（P80 Pro / P80 Pro Max）× 两场景（上市前推演按
//   上一代 3 次调价推导响应系数；上市后滚动按本品 2 次 + 上一代 3 次）。
// 全部确定性生成（无随机数），金测可锁数值；接入真实数据时仅替换本文件。
// ============================================================

/** 逐周口径：周龄 / 账面价（阶梯）/ 周成交均价 / 周销量（千台） */
export interface PrevWeek {
  week: number;
  rrp: number;
  asp: number;
  so: number;
}

/** 调价事件复盘：soPct = 调价后 N 周销量变化（朴素值）；attributedPct =
 *  扣除同期档期后的归因值；系数 = |attributedPct / changePct| */
export interface PricingEvent {
  week: number;
  anchor: string;
  changePct: number;
  soPct: number;
  /** 事件后观察周数（最新一次调价未满 4 周时为 3） */
  window: number;
  context: string;
  attributedPct: number;
}

export interface Scheme {
  key: string;
  name: string;
  tagline: string;
  price: number;
}

/** 一款产品的完整案例：上一代全史（52 周）+ 本品上市以来（14 周）+ 两场景默认方案 */
export interface ProductCase {
  key: 'std' | 'max';
  name: string;
  prev: { name: string; launchPrice: number; weeks: PrevWeek[]; events: PricingEvent[] };
  cur: { name: string; launchPrice: number; currentPrice: number; weeks: PrevWeek[]; events: PricingEvent[] };
  schemes: { pre: Scheme[]; post: Scheme[] };
}

// ---------------- ① 大盘：示例市场分价格档容量（万部/季） ----------------

export interface MarketPoint {
  label: string;
  value: number;
}

/** 12 个季度实际（24Q1 → 26Q3）：Q4 旺季 / Q1 谷底，同比温和下行 */
export const MARKET_HISTORY: MarketPoint[] = [
  { label: '24Q1', value: 428 }, { label: '24Q2', value: 447 }, { label: '24Q3', value: 496 }, { label: '24Q4', value: 521 },
  { label: '25Q1', value: 419 }, { label: '25Q2', value: 438 }, { label: '25Q3', value: 487 }, { label: '25Q4', value: 509 },
  { label: '26Q1', value: 402 }, { label: '26Q2', value: 424 }, { label: '26Q3', value: 471 },
];

/** 未来 4 个季度的标签（预估带落点） */
export const MARKET_FUTURE_LABELS = ['26Q4', '27Q1', '27Q2', '27Q3'];

/** 大盘预估默认假设：未来四季同比 / 区间宽度（用户可调） */
export const MARKET_DEFAULTS = { yoyPct: -6, bandPct: 8 };

// ---------------- ② 成本：产品线单台全成本（$/月） ----------------

/** 24 个月实际（2024-11 → 2026-10）：25 年中起温和上行（存储涨价周期） */
export const COST_HISTORY: MarketPoint[] = [
  { label: '24-11', value: 612 }, { label: '24-12', value: 611 }, { label: '25-01', value: 610 },
  { label: '25-02', value: 611 }, { label: '25-03', value: 612 }, { label: '25-04', value: 613 },
  { label: '25-05', value: 615 }, { label: '25-06', value: 617 }, { label: '25-07', value: 620 },
  { label: '25-08', value: 623 }, { label: '25-09', value: 627 }, { label: '25-10', value: 631 },
  { label: '25-11', value: 633 }, { label: '25-12', value: 635 }, { label: '26-01', value: 636 },
  { label: '26-02', value: 636 }, { label: '26-03', value: 637 }, { label: '26-04', value: 638 },
  { label: '26-05', value: 639 }, { label: '26-06', value: 640 }, { label: '26-07', value: 641 },
  { label: '26-08', value: 642 }, { label: '26-09', value: 643 }, { label: '26-10', value: 645 },
];

export const COST_FUTURE_LABELS = [
  '26-11', '26-12', '27-01', '27-02', '27-03', '27-04', '27-05', '27-06', '27-07', '27-08', '27-09', '27-10',
];

/** 成本预估默认假设：未来 12 个月同比 / 区间宽度（用户可调） */
export const COST_DEFAULTS = { yoyPct: 6, bandPct: 5 };

// ---------------- ③ 量价证据：上一代全史生成器 + 本品上市以来 ----------------

/** 促销/事件周的价格额外折扣与销量放大（口径 = 账面价 ×（基础折扣 + 事件折扣）） */
const PROMO_DISCOUNT: Record<number, number> = {
  14: -0.03, 26: -0.045, 27: -0.03, 40: -0.06, 41: -0.045, 48: -0.05, 49: -0.03,
};
const PROMO_LIFT: Record<number, number> = {
  14: 1.7, 26: 2.1, 27: 1.4, 40: 2.6, 41: 1.6, 48: 2.2, 49: 1.3,
};

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r0 = (v: number): number => Math.round(v);

/** 上一代 52 周：首销三周放量到峰值后按周 −2.5% 衰减见底；阶梯降价 × 档期放大 */
function makePrevWeeks(ladder: { from: number; price: number }[], peak: number, floor: number): PrevWeek[] {
  const baseSo = (w: number): number => (w <= 2 ? [peak * 0.73, peak * 0.937, peak][w] : Math.max(floor, peak * Math.pow(0.975, w - 2)));
  return Array.from({ length: 52 }, (_, w) => {
    const fit = ladder.filter((s) => s.from <= w);
    const rrp = fit[fit.length - 1].price;
    const asp = r0(rrp * (0.985 - w * 0.0006 + (PROMO_DISCOUNT[w] ?? 0)));
    return { week: w, rrp, asp, so: r1(baseSo(w) * (PROMO_LIFT[w] ?? 1)) };
  });
}

/** 本品上市以来逐周（阶梯调价 + 手工量序列，与事件表自洽） */
function makeCurWeeks(ladder: { from: number; price: number }[], so: number[]): PrevWeek[] {
  return so.map((s, w) => {
    const fit = ladder.filter((x) => x.from <= w);
    const rrp = fit[fit.length - 1].price;
    return { week: w, rrp, asp: r0(rrp * (0.985 - w * 0.0006)), so: s };
  });
}

/** 上一代 3 次调价（两产品共用骨架，幅度与背景各自成数） */
const PREV_EVENTS_STD: PricingEvent[] = [
  { week: 12, anchor: '①', changePct: -4.6, soPct: 9.8, window: 4, context: '同期无档期', attributedPct: 9.8 },
  { week: 26, anchor: '②', changePct: -4.8, soPct: 18.9, window: 4, context: '开学季', attributedPct: 8.6 },
  { week: 40, anchor: '③', changePct: -5.0, soPct: 21.5, window: 4, context: '黑五', attributedPct: 7.1 },
];
const PREV_EVENTS_MAX: PricingEvent[] = [
  { week: 12, anchor: '①', changePct: -4.6, soPct: 11.2, window: 4, context: '同期无档期', attributedPct: 11.2 },
  { week: 26, anchor: '②', changePct: -4.1, soPct: 20.4, window: 4, context: '开学季', attributedPct: 9.0 },
  { week: 40, anchor: '③', changePct: -5.4, soPct: 24.3, window: 4, context: '黑五', attributedPct: 8.1 },
];

/** 本品上市以来 14 周：两次调价（W6 / W11），量序列与事件表自洽 */
const CUR_SO_STD = [8.9, 11.4, 12.1, 9.8, 8.1, 7.2, 9.6, 9.3, 9.0, 8.7, 8.4, 10.3, 9.9, 9.5];
const CUR_SO_MAX = [6.9, 8.9, 9.4, 7.6, 6.3, 5.6, 7.5, 7.3, 7.0, 6.8, 6.6, 8.0, 7.7, 7.4];

const CUR_EVENTS_STD: PricingEvent[] = [
  { week: 6, anchor: '①', changePct: -4.3, soPct: 8.1, window: 4, context: '同期无档期', attributedPct: 8.1 },
  { week: 11, anchor: '②', changePct: -4.6, soPct: 13.8, window: 3, context: '年末小促', attributedPct: 6.3 },
];
const CUR_EVENTS_MAX: PricingEvent[] = [
  { week: 6, anchor: '①', changePct: -7.4, soPct: 12.9, window: 4, context: '同期无档期', attributedPct: 12.9 },
  { week: 11, anchor: '②', changePct: -4.0, soPct: 10.7, window: 3, context: '年末小促', attributedPct: 5.2 },
];

export const PRODUCTS: ProductCase[] = [
  {
    key: 'std',
    name: 'P80 Pro',
    prev: {
      name: 'P70 Pro',
      launchPrice: 1099,
      weeks: makePrevWeeks(
        [
          { from: 0, price: 1099 }, { from: 12, price: 1049 }, { from: 26, price: 999 }, { from: 40, price: 949 },
        ],
        12.6, 3.4,
      ),
      events: PREV_EVENTS_STD,
    },
    cur: {
      name: 'P80 Pro',
      launchPrice: 1149,
      currentPrice: 1049,
      weeks: makeCurWeeks(
        [
          { from: 0, price: 1149 }, { from: 6, price: 1099 }, { from: 11, price: 1049 },
        ],
        CUR_SO_STD,
      ),
      events: CUR_EVENTS_STD,
    },
    schemes: {
      pre: [
        { key: 'A', name: '方案 A · 稳健', tagline: '守住单台销毛', price: 1149 },
        { key: 'B', name: '方案 B · 基准', tagline: '沿用上一代开盘位', price: 1099 },
        { key: 'C', name: '方案 C · 进取', tagline: '低开对标 Phone 17 现价', price: 1029 },
      ],
      post: [
        { key: 'A', name: '方案 A · 回调', tagline: '收复开盘位', price: 1099 },
        { key: 'B', name: '方案 B · 维持', tagline: '现价滚动', price: 1049 },
        { key: 'C', name: '方案 C · 降价', tagline: '加速去化对标 Phone 17', price: 999 },
      ],
    },
  },
  {
    key: 'max',
    name: 'P80 Pro Max',
    prev: {
      name: 'P70 Pro Max',
      launchPrice: 1299,
      weeks: makePrevWeeks(
        [
          { from: 0, price: 1299 }, { from: 12, price: 1239 }, { from: 26, price: 1179 }, { from: 40, price: 1119 },
        ],
        9.8, 2.9,
      ),
      events: PREV_EVENTS_MAX,
    },
    cur: {
      name: 'P80 Pro Max',
      launchPrice: 1349,
      currentPrice: 1199,
      weeks: makeCurWeeks(
        [
          { from: 0, price: 1349 }, { from: 6, price: 1249 }, { from: 11, price: 1199 },
        ],
        CUR_SO_MAX,
      ),
      events: CUR_EVENTS_MAX,
    },
    schemes: {
      pre: [
        { key: 'A', name: '方案 A · 稳健', tagline: '守住单台销毛', price: 1349 },
        { key: 'B', name: '方案 B · 基准', tagline: '沿用上一代开盘位', price: 1299 },
        { key: 'C', name: '方案 C · 进取', tagline: '低开对标 S26 Ultra 现价', price: 1229 },
      ],
      post: [
        { key: 'A', name: '方案 A · 回调', tagline: '收复开盘位', price: 1299 },
        { key: 'B', name: '方案 B · 维持', tagline: '现价滚动', price: 1199 },
        { key: 'C', name: '方案 C · 降价', tagline: '加速去化对标 S26 Ultra', price: 1149 },
      ],
    },
  },
];

export const CUR_PRODUCT_STATUS = { pre: '拟上市', post: '已上市 14 周' };

export const COMPETITORS = [
  { name: 'Phone 17', launchPrice: 1099, currentPrice: 1029 },
  { name: 'S26 Ultra', launchPrice: 1299, currentPrice: 1199 },
];

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
