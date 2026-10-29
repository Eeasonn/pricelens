// ============================================================
// 定价推演页 · 计算链（纯函数，玻璃盒）：每一步都从证据出发——
// 大盘系数 = 大盘预估卡的未来四季同比；成本 = 成本预估卡的未来 12 月
// 同比（上市月取最新报价、按年化外推到周）；价格响应系数 = 调价事件
// 归因值推导（用户可改）。两场景测算骨架：
// 上市前 = 上一代首年 × 大盘 × 价格响应（较上一代开盘）× 竞品情景；
// 上市后 = 本品已销 +（上一代同期剩余 × 相对幅度 × 大盘 × 价格响应
// （较本品现价）× 竞品）——即一线「上一代同期 × 变化幅度」方法的公式化。
// 全部中间量随结果返回（chain），依据抽屉逐行复述同一条链。
// ============================================================
import {
  COMP_SCENARIOS,
  COST_FUTURE_LABELS,
  COST_HISTORY,
  CROSS_ELASTICITY,
  INCENTIVE_RATE,
  MARKET_FUTURE_LABELS,
  MARKET_HISTORY,
  PRODUCTS,
  UNCERTAINTY_BAND,
  type CompScenario,
  type PricingEvent,
  type ProductCase,
  type Scheme,
} from './mockData';

export type Scenario = 'pre' | 'post';

const r1 = (v: number): number => Math.round(v * 10) / 10;
const r0 = (v: number): number => Math.round(v);
const r2 = (v: number): number => Math.round(v * 100) / 100;

// ---------------- 大盘预估（未来 4 季：同季 × 同比，区间对称） ----------------

export interface ForecastPoint {
  label: string;
  mid: number;
  low: number;
  high: number;
}

/** Optional per-node overrides keyed by the forecast label. */
export interface ForecastOverrides {
  yoyPctByLabel?: Record<string, number | undefined>;
  bandPctByLabel?: Record<string, number | undefined>;
}

export function marketForecast(yoyPct: number, bandPct: number, overrides?: ForecastOverrides): ForecastPoint[] {
  const hist = MARKET_HISTORY;
  return MARKET_FUTURE_LABELS.map((label, i) => {
    const same = hist[hist.length - 4 + i].value;
    const nodeYoy = overrides?.yoyPctByLabel?.[label] ?? yoyPct;
    const nodeBand = overrides?.bandPctByLabel?.[label] ?? bandPct;
    const mid = r1(same * (1 + nodeYoy / 100));
    return { label, mid, low: r1(mid * (1 - nodeBand / 100)), high: r1(mid * (1 + nodeBand / 100)) };
  });
}

/** 大盘环比幅度（%）：季度 i 相对 i−1（预估段落入同一条序列） */
export function marketQoQ(forecast: ForecastPoint[]): (number | null)[] {
  const levels = [...MARKET_HISTORY.map((q) => q.value), ...forecast.map((f) => f.mid)];
  return levels.map((v, i) => (i === 0 ? null : r1((v / levels[i - 1] - 1) * 100)));
}

// ---------------- 成本预估（未来 12 个月：最新报价按年化外推） ----------------

/** 单台全成本基准 = 产品线最新月报价 */
export const COST_BASE = COST_HISTORY[COST_HISTORY.length - 1].value;

export function costForecast(yoyPct: number, bandPct: number, overrides?: ForecastOverrides): ForecastPoint[] {
  return COST_FUTURE_LABELS.map((label, i) => {
    const nodeYoy = overrides?.yoyPctByLabel?.[label] ?? yoyPct;
    const nodeBand = overrides?.bandPctByLabel?.[label] ?? bandPct;
    const mid = r0(COST_BASE * Math.pow(1 + nodeYoy / 100, (i + 1) / 12));
    return { label, mid, low: r0(mid * (1 - nodeBand / 100)), high: r0(mid * (1 + nodeBand / 100)) };
  });
}

export function costMoM(forecast: ForecastPoint[]): (number | null)[] {
  const levels = [...COST_HISTORY.map((m) => m.value), ...forecast.map((f) => f.mid)];
  return levels.map((v, i) => (i === 0 ? null : r2((v / levels[i - 1] - 1) * 100)));
}

/** 周龄 w 的单台成本：上市月 = 最新报价，按年化同比外推到周 */
export function costAtWeek(week: number, costYoyPct: number): number {
  return COST_BASE * Math.pow(1 + costYoyPct / 100, week / 52);
}

// ---------------- 价格响应系数推导（调价事件 → 系数区间与建议值） ----------------

export interface ElasticityView {
  /** 每次事件的推导系数（|归因变化% ÷ 调价幅度%|） */
  ratios: { anchor: string; ratio: number }[];
  min: number;
  max: number;
  suggested: number;
}

export function deriveElasticity(events: PricingEvent[]): ElasticityView {
  const ratios = events.map((e) => ({ anchor: e.anchor, ratio: r2(Math.abs(e.attributedPct / e.changePct)) }));
  const values = ratios.map((x) => x.ratio);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return { ratios, min: r1(Math.min(...values)), max: r1(Math.max(...values)), suggested: r1(mean) };
}

/** 场景证据集：上市前 = 上一代 3 次；上市后 = 本品 2 次（建议值来源）+ 上一代 3 次（参照） */
export interface EvidenceRow {
  group: 'cur' | 'prev';
  groupLabel: string;
  event: PricingEvent;
}

export function evidenceRows(product: ProductCase, scenario: Scenario): EvidenceRow[] {
  const prevRows: EvidenceRow[] = product.prev.events.map((event) => ({ group: 'prev', groupLabel: `上一代 ${product.prev.name}`, event }));
  if (scenario === 'pre') return prevRows;
  const curRows: EvidenceRow[] = product.cur.events.map((event) => ({ group: 'cur', groupLabel: `本品 ${product.cur.name}`, event }));
  return [...curRows, ...prevRows];
}

/** 建议系数：上市前 = 上一代均值；上市后 = 本品均值（更近的证据优先） */
export function suggestedElasticity(product: ProductCase, scenario: Scenario): number {
  return scenario === 'pre'
    ? deriveElasticity(product.prev.events).suggested
    : deriveElasticity(product.cur.events).suggested;
}

/** 推导区间（响应卡展示）：上市后覆盖本品 + 上一代全部事件 */
export function elasticityRange(product: ProductCase, scenario: Scenario): { min: number; max: number } {
  const rows = evidenceRows(product, scenario).map((r) => Math.abs(r.event.attributedPct / r.event.changePct));
  return { min: r1(Math.min(...rows)), max: r1(Math.max(...rows)) };
}

// ---------------- 竞品情景 ----------------

export const compChangePctOf = (sc: CompScenario): number => COMP_SCENARIOS.find((s) => s.key === sc)?.changePct ?? 0;
export const compFactorOf = (sc: CompScenario): number => 1 + CROSS_ELASTICITY * (compChangePctOf(sc) / 100);

// ---------------- 方案测算 ----------------

export interface PlanContext {
  scenario: Scenario;
  /** 大盘预估卡：未来四季同比 % */
  marketYoYPct: number;
  /** 成本预估卡：未来 12 个月同比 % */
  costYoyPct: number;
  /** 响应推导卡：当前取值 */
  elasticity: number;
  comp: CompScenario;
  /** Optional quarter/month node overrides from the scenario editor. */
  marketQuarterValues?: number[];
  costMonthValues?: number[];
  /** Optional week-level simulated prices (USD). When omitted, the plan price is reused. */
  weeklyPrices?: number[];
}

export function priceFactorOf(price: number, elasticity: number, anchorPrice: number): number {
  return Math.max(0.05, 1 - elasticity * (price / anchorPrice - 1));
}

/** 单台销毛：拟定价 ×（1−激励率）− 当周成本（成本预估曲线） */
export function unitMarginOf(price: number, week: number, costYoyPct: number): number {
  return price * (1 - INCENTIVE_RATE) - costAtWeek(week, costYoyPct);
}

export function costAtWeekWithNodes(week: number, costYoyPct: number, values?: number[]): number {
  if (!values || values.length === 0) return costAtWeek(week, costYoyPct);
  // Values include the current-month anchor followed by one node per forecast
  // month. Thus 13 values represent 12 intervals across the 52-week horizon.
  const span = values.length > 1 ? 52 / (values.length - 1) : 52;
  const month = Math.min(values.length - 1, Math.max(0, Math.floor(week / span)));
  const next = Math.min(values.length - 1, month + 1);
  const t = next === month ? 0 : (week - month * span) / span;
  return values[month] + (values[next] - values[month]) * Math.max(0, Math.min(1, t));
}

export function marketFactorAtWeek(ctx: PlanContext, week: number, offsetWeeks = 0): number {
  if (!ctx.marketQuarterValues || ctx.marketQuarterValues.length === 0) {
    return Math.max(0.2, 1 + ctx.marketYoYPct / 100);
  }
  const quarter = Math.min(ctx.marketQuarterValues.length - 1, Math.max(0, Math.floor(Math.max(0, week - offsetWeeks) / 13)));
  const baseline = MARKET_HISTORY[MARKET_HISTORY.length - 4 + quarter]?.value ?? MARKET_HISTORY[MARKET_HISTORY.length - 1].value;
  return Math.max(0.2, ctx.marketQuarterValues[quarter] / baseline);
}

export interface SchemeChain {
  scenario: Scenario;
  /** 价格响应锚点（上市前 = 上一代开盘价；上市后 = 本品现价） */
  anchorPrice: number;
  /** 上一代首年 SO（万台） */
  prevTotalWan: number;
  /** 本品已销（万台，仅上市后） */
  curTotalWan: number | null;
  /** 本品较上一代同期相对幅度（仅上市后） */
  relFactor: number | null;
  /** 上一代同期剩余周的原值合计（万台，仅上市后） */
  prevRemainWan: number | null;
  /** 剩余基线 = 上一代同期剩余 × 相对幅度（万台，仅上市后） */
  remainBaseWan: number | null;
  marketFactor: number;
  priceFactor: number;
  /** 拟定价较锚点 % */
  priceDeltaPct: number;
  compFactor: number;
  compChangePct: number;
  launchCost: number;
  yearEndCost: number;
}

export interface SchemeResult {
  scheme: Scheme;
  firstYearSoWan: number;
  p10Wan: number;
  p90Wan: number;
  launchUnitMargin: number;
  marginTotalYi: number;
  vsPrevSoPct: number;
  chain: SchemeChain;
}

const totalWan = (weeks: { so: number }[]): number => weeks.reduce((s, w) => s + w.so, 0) / 10;

export function productOf(key: string): ProductCase {
  return PRODUCTS.find((p) => p.key === key) ?? PRODUCTS[0];
}

/** 周序列构建（computeScheme 与预测图共用）：返回 52 周销量序列与实际段长度
 *  （上市前 actualCount=0 全为测算；上市后前 curLen 周为实际，剩余为测算） */
export function buildWeekly(ctx: PlanContext, product: ProductCase, price: number): { weekly: number[]; actualCount: number } {
  const compFactor = compFactorOf(ctx.comp);
  const simulatedPrice = (week: number): number => ctx.weeklyPrices?.[week] ?? price;
  if (ctx.scenario === 'pre') {
    const anchorPrice = product.prev.launchPrice;
    return {
      weekly: product.prev.weeks.map((w, week) => {
        const factor = marketFactorAtWeek(ctx, week) * priceFactorOf(simulatedPrice(week), ctx.elasticity, anchorPrice) * compFactor;
        return w.so * factor;
      }),
      actualCount: 0,
    };
  }
  const anchorPrice = product.cur.currentPrice;
  const curLen = product.cur.weeks.length;
  const relFactor = r2(totalWan(product.cur.weeks) / totalWan(product.prev.weeks.slice(0, curLen)));
  return {
    weekly: product.prev.weeks.map((w, week) => {
      if (week < curLen) return product.cur.weeks[week].so;
      const factor = marketFactorAtWeek(ctx, week, curLen) * priceFactorOf(simulatedPrice(week), ctx.elasticity, anchorPrice) * compFactor;
      return w.so * relFactor * factor;
    }),
    actualCount: curLen,
  };
}

/** 销量趋势预测图数据：实际线（已销段）+ 预估中枢虚线 + P10–P90 区间带 +
 *  上一代同期参照线（灰色），全 52 周口径 */
export interface ForecastSeries {
  weeks: string[];
  actual: (number | null)[];
  center: (number | null)[];
  low: (number | null)[];
  high: (number | null)[];
  prevRef: number[];
}

export function forecastSeries(ctx: PlanContext, product: ProductCase, price: number): ForecastSeries {
  const { weekly, actualCount } = buildWeekly(ctx, product, price);
  const r1v = (v: number): number => Math.round(v * 10) / 10;
  return {
    weeks: weekly.map((_, i) => 'W' + i),
    actual: weekly.map((v, i) => (i < actualCount ? r1v(v) : null)),
    center: weekly.map((v, i) => (i >= actualCount ? r1v(v) : i === actualCount - 1 ? r1v(v) : null)),
    low: weekly.map((v, i) => (i >= Math.max(actualCount, 1) ? r1v(v * (1 - UNCERTAINTY_BAND)) : null)),
    high: weekly.map((v, i) => (i >= Math.max(actualCount, 1) ? r1v(v * (1 + UNCERTAINTY_BAND)) : null)),
    prevRef: product.prev.weeks.map((w) => w.so),
  };
}

export function computeScheme(scheme: Scheme, ctx: PlanContext, product: ProductCase): SchemeResult {
  const marketFactor = ctx.marketQuarterValues?.length
    ? ctx.marketQuarterValues.reduce((sum, value, i) => {
        const baseline = MARKET_HISTORY[MARKET_HISTORY.length - 4 + i]?.value ?? MARKET_HISTORY[MARKET_HISTORY.length - 1].value;
        return sum + value / baseline;
      }, 0) / ctx.marketQuarterValues.length
    : Math.max(0.2, 1 + ctx.marketYoYPct / 100);
  const compFactor = compFactorOf(ctx.comp);
  const prevTotal = totalWan(product.prev.weeks);

  let anchorPrice: number;
  let curTotal: number | null = null;
  let relFactor: number | null = null;
  let prevRemain: number | null = null;
  let remainBase: number | null = null;

  if (ctx.scenario === 'pre') {
    anchorPrice = product.prev.launchPrice;
  } else {
    anchorPrice = product.cur.currentPrice;
    const curLen = product.cur.weeks.length;
    curTotal = totalWan(product.cur.weeks);
    relFactor = r2(curTotal / totalWan(product.prev.weeks.slice(0, curLen)));
    prevRemain = totalWan(product.prev.weeks.slice(curLen));
    remainBase = r1(prevRemain * relFactor);
  }

  const weekly = buildWeekly(ctx, product, scheme.price).weekly;
  const forecastStartPrice = ctx.weeklyPrices?.[ctx.scenario === 'post' ? product.cur.weeks.length : 0] ?? scheme.price;
  const launchPrice = ctx.weeklyPrices?.[0] ?? scheme.price;
  const firstYearSoWan = r1(weekly.reduce((s, v) => s + v, 0) / 10);
  const launchUnitMargin = Math.round(launchPrice * (1 - INCENTIVE_RATE) - costAtWeekWithNodes(0, ctx.costYoyPct, ctx.costMonthValues));
  const marginTotalYi = weekly.reduce((s, so, w) => {
    const weekPrice = ctx.weeklyPrices?.[w] ?? scheme.price;
    return s + so * (weekPrice * (1 - INCENTIVE_RATE) - costAtWeekWithNodes(w, ctx.costYoyPct, ctx.costMonthValues));
  }, 0) / 1e5;
  const priceFactor = priceFactorOf(forecastStartPrice, ctx.elasticity, anchorPrice);

  return {
    scheme,
    firstYearSoWan,
    p10Wan: r1(firstYearSoWan * (1 - UNCERTAINTY_BAND)),
    p90Wan: r1(firstYearSoWan * (1 + UNCERTAINTY_BAND)),
    launchUnitMargin,
    marginTotalYi: Math.round(marginTotalYi * 100) / 100,
    vsPrevSoPct: Math.round((firstYearSoWan / prevTotal - 1) * 1000) / 10,
    chain: {
      scenario: ctx.scenario,
      anchorPrice,
      prevTotalWan: r1(prevTotal),
      curTotalWan: curTotal != null ? r1(curTotal) : null,
      relFactor,
      prevRemainWan: prevRemain != null ? r1(prevRemain) : null,
      remainBaseWan: remainBase,
      marketFactor: r3(marketFactor),
      priceFactor: r3(priceFactor),
      priceDeltaPct: r1((forecastStartPrice / anchorPrice - 1) * 100),
      compFactor: r3(compFactor),
      compChangePct: compChangePctOf(ctx.comp),
      launchCost: Math.round(costAtWeekWithNodes(0, ctx.costYoyPct, ctx.costMonthValues)),
      yearEndCost: Math.round(costAtWeekWithNodes(51, ctx.costYoyPct, ctx.costMonthValues)),
    },
  };
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export function computeAll(schemes: Scheme[], ctx: PlanContext, product: ProductCase): SchemeResult[] {
  return schemes.map((s) => computeScheme(s, ctx, product));
}
