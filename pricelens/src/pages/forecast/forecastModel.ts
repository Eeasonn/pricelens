// ============================================================
// 量价预测 · Lifecycle OS 简单版确定性模型（forecast-simple-v1）
// 交接文档 docs/lifecycle-os-mvp/03 第 3/7 节：
//   无约束需求 = 基线 × 价格响应 × 促销响应 × 竞品压力
//   SO = min(无约束需求, 可供量)
//   期末库存 = 期初库存 + SI - SO
//   单台销毛 = 公司净收入 - 单台成本；周销毛 = SO × 单台销毛
// 全部计算为纯函数：不读时间、不用随机数，同一输入两次计算逐字段一致。
// 成本只进入销毛链，绝不修改需求；供给只作 SO 上限。
// ============================================================

export type DataStatus = 'real' | 'simulated' | 'mixed';
export type WeekStatus = 'actual' | 'forecast';
export type LifecyclePhase = 'launch' | 'growth' | 'mature' | 'decline';

/** 交接文档第 7 节数据契约（照抄）+ 02 文档要求的自然周起始日期扩展字段。 */
export interface ForecastWeek {
  week: string;
  status: WeekStatus;
  phase: LifecyclePhase;
  baseDemand: number;
  price: number;
  rrp: number;
  promoIntensity: number;
  /** 促销事件名（活动窗口 + 活动后一周透支期内携带；主账事件列据此归因回落周）。 */
  promoEvent?: string;
  competitorPressure: number;
  competitorEvent?: string;
  unconstrainedDemand: number;
  available: number;
  stockout: boolean;
  so: number;
  si: number;
  inventory: number;
  cost: number;
  companyNetRevenue: number;
  unitGrossMargin: number;
  weeklyGrossMargin: number;
  evidence: string;
  /** 扩展字段：自然周起始日期（模拟），后续接完整 fixture 时沿用。 */
  date: string;
}

/** fixture 提供的每周输入事实（派生值全部由模型计算，不在 fixture 重复存储）。 */
export interface ForecastInputWeek {
  week: string;
  date: string;
  status: WeekStatus;
  phase: LifecyclePhase;
  baseDemand: number;
  price: number;
  rrp: number;
  available: number;
  si: number;
  cost: number;
}

/** 促销事件窗口：活动期 + 活动后一周透支，不做永久外推。 */
export interface PromoWindow {
  id: string;
  label: string;
  start: number; // 含，1 起的生命周期周
  end: number; // 含
  depth: number; // 0–1 活动强度
}

/** 竞品上市：上市周起 windowWeeks 周内冲击按 exp(-age / halfLife) 递减。 */
export interface CompetitorLaunch {
  id: string;
  label: string;
  week: number; // 上市周（1 起）
  impact: number; // 负值，首周对我司需求的份额压力
  windowWeeks: number; // 默认 6：上市 + 之后 6 周
  halfLifeWeeks: number;
}

/** 竞品单周促销脉冲：一周内叠加的额外压力。 */
export interface CompetitorPulse {
  id: string;
  label: string;
  week: number;
  impact: number;
}

export type ForecastEventType = 'lifecycle' | 'promo' | 'supply' | 'competitor' | 'cost';

export interface ForecastEvent {
  id: string;
  weekLabel: string;
  type: ForecastEventType;
  label: string;
  shape: string;
  detail: string;
}

export type FactorStatus = '模型学习' | '业务假设' | '方向性判断' | '确定性计算';

export interface FactorProfile {
  key: 'baseline' | 'price' | 'promo' | 'competitor' | 'supply';
  label: string;
  scope: string;
  window: string;
  shape: string;
  status: FactorStatus;
  evidence: string;
  confidence: '高' | '中' | '低';
  boundary?: string;
}

export interface ForecastModelParams {
  /** 价格响应参考价（与 RRP 同源）：价格因子 = (price / referencePrice)^elasticity。 */
  referencePrice: number;
  /** 价格弹性先验（可学习），负值 = 价格越高需求越低。 */
  priceElasticity: number;
  /** 活动期响应 = 1 + depth × promoLiftCoefficient。 */
  promoLiftCoefficient: number;
  /** 活动后一周透支系数。 */
  promoAftermathFactor: number;
  /** 渠道费率：公司净收入 = 价格 × (1 - channelFeeRate)。 */
  channelFeeRate: number;
  /** W1 期初库存。 */
  initialInventory: number;
  /** 当前周（0 起下标；≤ 该下标为实际周，之后为预测窗口）。 */
  currentWeekIndex: number;
}

export interface ForecastDataset {
  meta: {
    status: DataStatus;
    modelVersion: string;
    source: string;
    generatedAt: string;
    currency: 'USD';
    note: string;
  };
  context: {
    country: string;
    channel: string;
    product: string;
    competitors: string[];
    priceBand: string;
    currentWeek: string;
    weekRange: string;
  };
  weeks: ForecastInputWeek[];
  promoWindows: PromoWindow[];
  competitorLaunches: CompetitorLaunch[];
  competitorPulses: CompetitorPulse[];
  events: ForecastEvent[];
  factorProfiles: FactorProfile[];
  params: ForecastModelParams;
}

/** What-if 本地草稿：只作用于预测窗口（当前周之后），不写入任何真实数据。 */
export interface ScenarioDraft {
  /** 消费者感知价格变化（%，负 = 降价）。 */
  priceDeltaPct: number;
  /** 促销强度增量（百分点，直接加到促销响应上）。 */
  promoDeltaPct: number;
  /** 可供量变化（%）。 */
  supplyDeltaPct: number;
}

export const BASELINE_DRAFT: ScenarioDraft = { priceDeltaPct: 0, promoDeltaPct: 0, supplyDeltaPct: 0 };

export const isDraftActive = (draft: ScenarioDraft): boolean =>
  draft.priceDeltaPct !== 0 || draft.promoDeltaPct !== 0 || draft.supplyDeltaPct !== 0;

/** 计算结果周：契约周 + DOS + 草稿标记（展示层扩展，不回写 fixture）。 */
export interface ComputedWeek extends ForecastWeek {
  dos: number;
  /** 该周是否被 What-if 草稿重算（仅预测窗口可为 true）。 */
  draft: boolean;
}

export interface DriverContribution {
  key: 'baseline' | 'price' | 'promo' | 'competitor' | 'supply';
  label: string;
  /** 相对上一台阶的台数贡献（供给截断 ≤ 0）；逐步取整后各台阶严格可加。 */
  value: number;
  note: string;
  status: FactorStatus;
}

/** What-if 风险周：截断（可供量低于无约束需求）或库存穿零（期末库存 < 0，
 *  供给欠配信号）的预测周；同周并存按截断归组（与主账「截断」标签一致）。 */
export interface RiskWeek {
  week: string;
  kind: 'stockout' | 'negative';
}

export interface ScenarioSummary {
  active: boolean;
  forecastSo: number;
  baselineSo: number;
  soDelta: number;
  forecastMargin: number;
  baselineMargin: number;
  marginDelta: number;
  riskWeeks: RiskWeek[];
}

export interface ForecastComputation {
  weeks: ComputedWeek[];
  current: ComputedWeek;
  /** 当前周因子拆解（含供给截断）。 */
  drivers: DriverContribution[];
  /** 当前周各因子乘数（供计算路径抽屉展示）。 */
  factors: { priceFactor: number; promoFactor: number; competitorFactor: number };
  kpi: {
    so: number;
    unconstrainedDemand: number;
    inventory: number;
    dos: number;
    cumulativeGrossMargin: number;
    forecastGrossMargin: number;
    risk: { label: string; note: string };
  };
  scenario: ScenarioSummary;
}

const roundTo = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;

/** 促销响应：活动期 1 + depth × lift；活动后一周 × aftermath；其余周 1（不外推）。 */
export function promoFactorAt(dataset: ForecastDataset, index: number): number {
  const week = index + 1;
  let factor = 1;
  for (const promo of dataset.promoWindows) {
    if (week >= promo.start && week <= promo.end) factor *= 1 + promo.depth * dataset.params.promoLiftCoefficient;
    else if (week === promo.end + 1) factor *= dataset.params.promoAftermathFactor;
  }
  return factor;
}

/** 竞品压力：上市窗口内 -|impact| × exp(-age / halfLife) 逐周递减；脉冲周额外叠加。 */
export function competitorPressureAt(dataset: ForecastDataset, index: number): number {
  const week = index + 1;
  let pressure = 0;
  for (const launch of dataset.competitorLaunches) {
    const age = week - launch.week;
    if (age >= 0 && age <= launch.windowWeeks) {
      pressure -= Math.abs(launch.impact) * Math.exp(-age / launch.halfLifeWeeks);
    }
  }
  for (const pulse of dataset.competitorPulses) {
    if (week === pulse.week) pressure += pulse.impact;
  }
  return pressure;
}

/** 竞品事件名（脉冲优先，其次上市窗口），无事件返回 undefined。 */
export function competitorEventAt(dataset: ForecastDataset, index: number): string | undefined {
  const week = index + 1;
  const pulse = dataset.competitorPulses.find((item) => item.week === week);
  if (pulse) return pulse.label;
  const launch = dataset.competitorLaunches.find(
    (item) => week >= item.week && week <= item.week + item.windowWeeks,
  );
  return launch?.label;
}

function eventWeeksMatch(weekLabel: string, week: number): boolean {
  return weekLabel
    .split(/[–-]/)
    .map((token) => token.trim())
    .some((token) => token === `W${week}`);
}

function eventEvidence(dataset: ForecastDataset, index: number, draft: boolean): string {
  const week = index + 1;
  const names: string[] = [];
  const promo = dataset.promoWindows.find((item) => week >= item.start && week <= item.end + 1);
  if (promo) names.push(promo.label);
  const competitor = competitorEventAt(dataset, index);
  if (competitor) names.push(competitor);
  if (dataset.events.some((item) => item.type === 'supply' && eventWeeksMatch(item.weekLabel, week))) names.push('供应波动');
  if (dataset.events.some((item) => item.type === 'cost' && eventWeeksMatch(item.weekLabel, week))) names.push('成本上调');
  const prefix = names.length ? names.join(' + ') : '基线计算';
  const suffix = draft ? ' · 本地草稿' : '';
  return `${dataset.meta.source} · ${prefix} · ${dataset.meta.modelVersion}${suffix}`;
}

/**
 * 核心计算：给定数据集与本地草稿，输出周度主账 + KPI + 因子拆解 + 草稿摘要。
 * 草稿只改预测窗口的价格 / 促销 / 可供量；实际周（≤ 当前周）永远保持基准。
 * 乘法链逐步取整，保证贡献瀑布各台阶严格可加、可手工复算。
 */
export function computeForecast(dataset: ForecastDataset, draft: ScenarioDraft = BASELINE_DRAFT): ForecastComputation {
  const { params } = dataset;
  const current = params.currentWeekIndex;
  const draftActive = isDraftActive(draft);
  const weeks: ComputedWeek[] = [];
  let inventory = params.initialInventory;

  dataset.weeks.forEach((input, index) => {
    const inDraftWindow = index > current;
    const drafted = inDraftWindow && draftActive;
    const price = inDraftWindow ? Math.round(input.price * (1 + draft.priceDeltaPct / 100)) : input.price;
    const available = inDraftWindow ? Math.max(0, Math.round(input.available * (1 + draft.supplyDeltaPct / 100))) : input.available;

    // 价格响应：阶跃生效，(price / referencePrice)^elasticity（可学习弹性）。
    const priceFactor = Math.pow(Math.max(0.2, price / params.referencePrice), params.priceElasticity);
    // 促销响应：窗口内脉冲 + 活动后一周透支；草稿增量只加在预测窗口。
    let promoFactor = promoFactorAt(dataset, index);
    if (inDraftWindow) promoFactor = Math.max(0, promoFactor + draft.promoDeltaPct / 100);
    // 竞品压力：上市递减 + 脉冲；草稿不可改竞品事件。
    const pressure = competitorPressureAt(dataset, index);
    const competitorFactor = Math.max(0, 1 + pressure);

    const afterPrice = Math.max(0, Math.round(input.baseDemand * priceFactor));
    const afterPromo = Math.max(0, Math.round(afterPrice * promoFactor));
    const unconstrainedDemand = Math.max(0, Math.round(afterPromo * competitorFactor));

    const so = Math.min(unconstrainedDemand, available);
    const stockout = available < unconstrainedDemand;
    inventory = inventory + input.si - so;

    const companyNetRevenue = Math.round(price * (1 - params.channelFeeRate));
    const unitGrossMargin = companyNetRevenue - input.cost;
    const promoWindow = dataset.promoWindows.find((item) => index + 1 >= item.start && index + 1 <= item.end);
    // 事件窗口含活动后一周（与 promoFactorAt 的透支口径一致），供主账归因。
    const promoEventWindow = dataset.promoWindows.find((item) => index + 1 >= item.start && index + 1 <= item.end + 1);

    weeks.push({
      week: input.week,
      date: input.date,
      status: input.status,
      phase: input.phase,
      baseDemand: input.baseDemand,
      price,
      rrp: input.rrp,
      promoIntensity: promoWindow ? promoWindow.depth : 0,
      promoEvent: promoEventWindow?.label,
      competitorPressure: roundTo(pressure, 4),
      competitorEvent: competitorEventAt(dataset, index),
      unconstrainedDemand,
      available,
      stockout,
      so,
      si: input.si,
      inventory,
      cost: input.cost,
      companyNetRevenue,
      unitGrossMargin,
      weeklyGrossMargin: so * unitGrossMargin,
      evidence: eventEvidence(dataset, index, drafted),
      dos: Math.round((inventory / Math.max(1, unconstrainedDemand)) * 7),
      draft: drafted,
    });
  });

  const currentWeek = weeks[current];
  const pressureNow = currentWeek.competitorPressure;
  const risk = currentWeek.stockout
    ? { label: '供给截断', note: `${currentWeek.week} 可供量低于无约束需求，SO 按可供量截断` }
    : pressureNow < 0
      ? { label: '竞品压力', note: `${currentWeek.competitorEvent ?? '竞品事件'}影响窗口内，冲击逐周递减` }
      : { label: '无显著风险', note: '当前周可供量与需求匹配' };

  // 当前周瀑布：基线 → 价格 → 促销 → 竞品 → 无约束需求 → 供给截断 → SO。
  const priceFactorNow = Math.pow(Math.max(0.2, currentWeek.price / params.referencePrice), params.priceElasticity);
  const promoFactorNow = promoFactorAt(dataset, current);
  const afterPriceNow = Math.max(0, Math.round(currentWeek.baseDemand * priceFactorNow));
  const afterPromoNow = Math.max(0, Math.round(afterPriceNow * promoFactorNow));
  const promoWindowNow = dataset.promoWindows.find(
    (item) => current + 1 >= item.start && current + 1 <= item.end + 1,
  );
  const drivers: DriverContribution[] = [
    {
      key: 'baseline',
      label: '需求基线',
      value: currentWeek.baseDemand,
      note: '趋势 + 季节 + 生命周期爬坡 / 衰减（不含本轮事件）',
      status: '模型学习',
    },
    {
      key: 'price',
      label: '消费者感知价格',
      value: afterPriceNow - currentWeek.baseDemand,
      note: `价格 ${currentWeek.price} 相对参考价 ${params.referencePrice}，弹性 ${params.priceElasticity.toFixed(2)}`,
      status: '模型学习',
    },
    {
      key: 'promo',
      label: '促销事件',
      value: afterPromoNow - afterPriceNow,
      note: promoWindowNow
        ? `${promoWindowNow.label}窗口内（强度 ${Math.round(promoWindowNow.depth * 100)}%），活动后一周回落`
        : '当前周无促销窗口',
      status: '业务假设',
    },
    {
      key: 'competitor',
      label: '竞品压力',
      value: currentWeek.unconstrainedDemand - afterPromoNow,
      note:
        pressureNow < 0
          ? `${currentWeek.competitorEvent ?? '竞品事件'}：上市后递减窗口，方向性判断`
          : '当前周无竞品事件',
      status: '方向性判断',
    },
    {
      key: 'supply',
      label: '供给截断',
      value: currentWeek.so - currentWeek.unconstrainedDemand,
      note: currentWeek.stockout
        ? `可供量 ${currentWeek.available} 台，SO 被截断`
        : `可供量 ${currentWeek.available} 台，未形成截断`,
      status: '确定性计算',
    },
  ];

  // 草稿差异：基准周只在草稿激活时重算一次（递归一层即止：基准调用不再进此分支）。
  const baselineWeeks = draftActive ? computeForecast(dataset, BASELINE_DRAFT).weeks : weeks;
  const forecastWeeks = weeks.slice(current + 1);
  const baselineForecast = baselineWeeks.slice(current + 1);
  const forecastSo = forecastWeeks.reduce((total, week) => total + week.so, 0);
  const baselineSo = baselineForecast.reduce((total, week) => total + week.so, 0);
  const forecastMargin = forecastWeeks.reduce((total, week) => total + week.weeklyGrossMargin, 0);
  const baselineMargin = baselineForecast.reduce((total, week) => total + week.weeklyGrossMargin, 0);

  return {
    weeks,
    current: currentWeek,
    drivers,
    factors: {
      priceFactor: roundTo(priceFactorNow, 4),
      promoFactor: roundTo(promoFactorNow, 4),
      competitorFactor: roundTo(1 + pressureNow, 4),
    },
    kpi: {
      so: currentWeek.so,
      unconstrainedDemand: currentWeek.unconstrainedDemand,
      inventory: currentWeek.inventory,
      dos: currentWeek.dos,
      cumulativeGrossMargin: weeks.reduce((total, week) => total + week.weeklyGrossMargin, 0),
      forecastGrossMargin: forecastMargin,
      risk,
    },
    scenario: {
      active: draftActive,
      forecastSo,
      baselineSo,
      soDelta: forecastSo - baselineSo,
      forecastMargin,
      baselineMargin,
      marginDelta: forecastMargin - baselineMargin,
      // 风险周 = 截断周 ∪ 库存穿零周（2026-11-01 Eason 拍板并入）：按周序去重，
      // 同周并存优先标截断（当周可观测信号优先，与主账一致）。
      riskWeeks: forecastWeeks
        .filter((week) => week.stockout || week.inventory < 0)
        .map((week) => ({ week: week.week, kind: week.stockout ? ('stockout' as const) : ('negative' as const) })),
    },
  };
}
