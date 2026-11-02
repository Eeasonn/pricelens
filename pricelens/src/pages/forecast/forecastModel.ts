// ============================================================
// 量价预测 · Lifecycle OS 简单版确定性模型（forecast-simple-v1）
// 交接文档 docs/lifecycle-os-mvp/03 第 3/7 节：
//   无约束需求 = 基线 × 价格响应 × 促销响应 × 竞品压力
//   预测 SO = min(无约束需求, 可供量)；历史周优先保留 observedSO，并另外保存 forecastSO
//   期末库存 = 期初库存 + SI - SO
//   单台销毛 = 公司净收入 - 单台成本 - 单台激励；周销毛 = SO × 单台销毛
// 全部计算为纯函数：不读时间、不用随机数，同一输入两次计算逐字段一致。
// 成本只进入销毛链，绝不修改需求；供给只作 SO 上限。
// ============================================================
import type { DataProvenance } from '../../dataModel/provenance';

export type DataStatus = 'real' | 'simulated' | 'mixed';
export type WeekStatus = 'actual' | 'forecast';
export type LifecyclePhase = 'launch' | 'growth' | 'mature' | 'decline';
export type WeekSource = 'observed' | 'model' | 'forecast';
/** 观测 SO 的状态；预测周没有观测值，因此使用 missing，来源由 WeekSource 区分。 */
export type SoStatus = 'observed' | 'censored' | 'missing';
/** 竞品上市对市场总量的影响在简单版中不自动判定，必须显式保存未知状态。 */
export type CompetitorMarketEffect = 'unknown' | 'neutral' | 'expansion' | 'substitution';
export interface CompetitorMarketClassification {
  /** 当前采用的市场总量假设；unknown 表示只能保留两种情景。 */
  selected: CompetitorMarketEffect;
  /** 待验证的候选解释：竞品是扩盘，还是进入既有蛋糕分流。 */
  candidates: Array<'expansion' | 'substitution'>;
  confidence: 'high' | 'medium' | 'low';
  requiredEvidence: string[];
}

/** 交接文档第 7 节数据契约（照抄）+ 02 文档要求的自然周起始日期扩展字段。 */
export interface ForecastWeek {
  week: string;
  status: WeekStatus;
  /** 周结果来源：历史观测、历史模型回填或预测。 */
  source: WeekSource;
  /** 周度数据状态；Demo 会是 simulated，真实接入可为 real / mixed。 */
  dataStatus: DataStatus;
  phase: LifecyclePhase;
  baseDemand: number;
  price: number;
  /** 实际作用于需求响应的价格；默认使用前一周价格，避免把调价当周即时生效。 */
  effectivePrice: number;
  rrp: number;
  promoIntensity: number;
  /** 促销事件名（活动窗口 + 活动后一周透支期内携带；主账事件列据此归因回落周）。 */
  promoEvent?: string;
  competitorPressure: number;
  competitorEvent?: string;
  /** 模型估计的无约束需求；历史周也保留，用于偏差和权重学习。 */
  modelDemand: number;
  unconstrainedDemand: number;
  available: number;
  stockout: boolean;
  /** 历史观测 SO；预测周为空。 */
  observedSO?: number;
  soStatus: SoStatus;
  /** 供给约束后的模型 SO；历史观测与它分开保存。 */
  forecastSO: number;
  /** 预测分位数（仅预测窗口在有校准噪声时输出；P50 与 forecastSO 一致）。 */
  forecastP10?: number;
  forecastP50?: number;
  forecastP90?: number;
  /** 未删失历史周的观测 - 模型残差；删失周和预测周不伪造残差。 */
  residual?: number;
  so: number;
  si: number;
  inventory: number;
  cost: number;
  /** 单台即时激励费用，作为销毛链扣减项。 */
  incentive: number;
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
  dataStatus?: DataStatus;
  phase: LifecyclePhase;
  baseDemand?: number;
  price: number;
  rrp: number;
  effectivePrice?: number;
  observedSO?: number;
  soStatus?: SoStatus;
  coveragePct?: number;
  supplyCap?: number;
  openingInventory?: number;
  inventoryEndObserved?: number;
  available: number;
  si: number;
  cost: number;
  incentive?: number;
}

/** 促销事件窗口：活动期 + 活动后一周透支，不做永久外推。 */
export interface PromoWindow {
  id: string;
  label: string;
  start: number; // 含，1 起的生命周期周
  end: number; // 含
  depth: number; // 0–1 活动强度
}

/** 竞品上市：上市周起 windowWeeks 个自然周（含上市周）内冲击按真正半衰期递减。 */
export interface CompetitorLaunch {
  id: string;
  label: string;
  week: number; // 上市周（1 起）
  impact: number; // 负值，首周对我司需求的份额压力
  windowWeeks: number; // 默认 6：含上市周共 6 周
  halfLifeWeeks: number;
  /** 市场总量影响：简单版默认 unknown，不能把份额压力误写成扩盘或替代。 */
  marketEffect: CompetitorMarketEffect;
  marketClassification?: CompetitorMarketClassification;
  simpleAssumption?: 'neutral_market_size';
  missingEvidence?: string[];
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

export type FactorStatus = '固定先验' | '待学习' | '业务假设' | '方向性判断' | '确定性计算';

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
  sampleCount?: number;
  fitWindow?: string;
  fallback?: boolean;
  exclusions?: { censored: number; confounded: number; missing: number };
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
  /** 当前周（0 起下标；≤ 该下标为历史段，之后为预测窗口）。 */
  currentWeekIndex: number;
  /** 价格对需求的生效滞后周数；首期默认 1 周。 */
  effectivePriceLagWeeks?: number;
}

export interface ForecastDataset {
  meta: {
    status: DataStatus;
    modelVersion: string;
    source: string;
    generatedAt: string;
    /** ISO-like display currency. Demo uses USD; full adapter fixture uses RUB. */
    currency: string;
    note: string;
    /** Shared source / as-of contract used by forecast, Agent and adapters. */
    provenance?: DataProvenance;
  };
  context: {
    country: string;
    /** Product industry identifier used by snapshots and downstream adapters. */
    industry?: string;
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
  /** 计算 DOS 使用的滚动需求均值，便于计算路径和审计复核。 */
  rolling4wDemand: number;
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
  /** 本次计算是否使用了通过质量门槛的学习参数，以及区间是否可用。 */
  modelEvidence?: {
    learned: boolean;
    intervalCalibrated: boolean;
    parameterSource: 'prior' | 'learned';
  };
}

/**
 * 经过 fit 质量门槛后才可传入的模型覆盖项。
 * 这些字段是 log-demand 模型的应用参数：
 *   log(D / baseDemand) = baselineLogMultiplier
 *     + priceElasticity × log(price / referencePrice)
 *     + promoLogCoefficient × log(promoFactor)
 *     + competitorLogCoefficient × log(competitorFactor)
 * 默认不传时，继续使用简单版原有的线性乘法先验，保证旧数据和 What-if 口径稳定。
 */
export interface LearnedForecastOverrides {
  baselineLogMultiplier: number;
  priceElasticity: number;
  promoLogCoefficient: number;
  competitorLogCoefficient: number;
  residualLogScale?: number;
}

export interface ForecastComputeOptions {
  learned?: LearnedForecastOverrides;
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

/** 竞品压力：上市窗口内 -|impact| × 0.5^(age / halfLife) 逐周递减；脉冲周额外叠加。 */
export function competitorPressureAt(dataset: ForecastDataset, index: number): number {
  const week = index + 1;
  let pressure = 0;
  for (const launch of dataset.competitorLaunches) {
    const age = week - launch.week;
    if (age >= 0 && age < Math.max(0, launch.windowWeeks)) {
      const halfLife = Math.max(1e-6, launch.halfLifeWeeks);
      pressure -= Math.abs(launch.impact) * Math.pow(0.5, age / halfLife);
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
    (item) => week >= item.week && week < item.week + Math.max(0, item.windowWeeks),
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
 * 草稿只改预测窗口的价格 / 促销 / 可供量；历史段（≤ 当前周）永远保持基准。
 * 乘法链逐步取整，保证贡献瀑布各台阶严格可加、可手工复算。
 */
export function computeForecast(
  dataset: ForecastDataset,
  draft: ScenarioDraft = BASELINE_DRAFT,
  options: ForecastComputeOptions = {},
): ForecastComputation {
  const { params } = dataset;
  const current = params.currentWeekIndex;
  const draftActive = isDraftActive(draft);
  const learned = options.learned;
  const priceElasticity = learned?.priceElasticity ?? params.priceElasticity;
  const hasLearnedLogModel = Boolean(learned);
  const residualLogScale = Math.max(0, learned?.residualLogScale ?? 0);
  const weeks: ComputedWeek[] = [];
  let inventory = params.initialInventory;

  // 先计算情景价格序列，再按 lag 取需求响应价格。这样预测窗口的价格草稿也会
  // 从下一周开始生效；历史周保留输入价格，避免在主账中覆盖观测事实。
  const scenarioPrices = dataset.weeks.map((input, index) => {
    if (index <= current || !draftActive) return input.price;
    return Math.round(input.price * (1 + draft.priceDeltaPct / 100));
  });
  const priceLagWeeks = Math.max(0, Math.round(params.effectivePriceLagWeeks ?? 1));
  const effectivePriceAt = (index: number): number => {
    const sourceIndex = Math.max(0, index - priceLagWeeks);
    return scenarioPrices[sourceIndex] ?? scenarioPrices[index] ?? dataset.weeks[index].price;
  };

  dataset.weeks.forEach((input, index) => {
    const inDraftWindow = index > current;
    const drafted = inDraftWindow && draftActive;
    const price = scenarioPrices[index];
    const available = inDraftWindow ? Math.max(0, Math.round(input.available * (1 + draft.supplyDeltaPct / 100))) : input.available;
    // Adapter 可以提供已校验的 effectivePrice；What-if 激活时必须重新按情景价格
    // 取 lag，否则页面会出现标价已变但需求仍读旧价格的假象。
    const effectivePrice = draftActive ? effectivePriceAt(index) : (input.effectivePrice ?? effectivePriceAt(index));
    const dataStatus = input.dataStatus ?? dataset.meta.status;
    const baseDemand = Math.max(0, input.baseDemand ?? 0);

    // 价格响应：默认滞后一周生效，(effectivePrice / referencePrice)^elasticity（可学习弹性）。
    const priceRatio = Math.max(0.2, effectivePrice / params.referencePrice);
    const priceFactor = Math.pow(priceRatio, priceElasticity);
    // 促销响应：窗口内脉冲 + 活动后一周透支；草稿增量只加在预测窗口。
    let promoFactor = promoFactorAt(dataset, index);
    if (inDraftWindow) promoFactor = Math.max(0, promoFactor + draft.promoDeltaPct / 100);
    // 竞品压力：上市递减 + 脉冲；草稿不可改竞品事件。
    const pressure = competitorPressureAt(dataset, index);
    const competitorFactor = Math.max(0, 1 + pressure);

    // 质量门槛通过后使用可解释的 log-demand 学习参数；默认路径保持原有
    // 简单乘法先验。这样 demo 不会因为一次 fit 失败而静默改变预测口径。
    const learnedMultiplier = learned
      ? Math.exp(
        learned.baselineLogMultiplier
        + learned.priceElasticity * Math.log(priceRatio)
        + learned.promoLogCoefficient * Math.log(Math.max(1e-6, promoFactor))
        + learned.competitorLogCoefficient * Math.log(Math.max(1e-6, competitorFactor)),
      )
      : null;

    const afterPrice = Math.max(0, Math.round(baseDemand * priceFactor * (learned ? Math.exp(learned.baselineLogMultiplier) : 1)));
    const afterPromo = Math.max(0, Math.round(afterPrice * promoFactor));
    const modelDemand = Math.max(0, Math.round(learnedMultiplier == null ? afterPromo * competitorFactor : baseDemand * learnedMultiplier));
    const forecastSO = Math.min(modelDemand, available);
    const inputSoStatus = input.soStatus;
    const hasObservedSO = input.status === 'actual' && input.observedSO != null && input.soStatus !== 'missing';
    const soStatus: SoStatus = hasObservedSO ? (inputSoStatus ?? 'observed') : 'missing';
    // 历史段的 SO 使用观测值，预测段使用供给约束后的模型值。缺失的历史段
    // 保留 model 来源，不能伪装成 observed。
    const source: WeekSource = hasObservedSO ? 'observed' : input.status === 'forecast' ? 'forecast' : 'model';
    const so = hasObservedSO ? Math.max(0, Math.round(input.observedSO as number)) : forecastSO;
    const stockout = soStatus === 'censored' || available < modelDemand;
    inventory = inventory + input.si - so;

    const incentive = Math.max(0, input.incentive ?? 0);
    const companyNetRevenue = Math.round(price * (1 - params.channelFeeRate));
    const unitGrossMargin = companyNetRevenue - input.cost - incentive;
    const promoWindow = dataset.promoWindows.find((item) => index + 1 >= item.start && index + 1 <= item.end);
    // 事件窗口含活动后一周（与 promoFactorAt 的透支口径一致），供主账归因。
    const promoEventWindow = dataset.promoWindows.find((item) => index + 1 >= item.start && index + 1 <= item.end + 1);

    const forecastP50 = forecastSO;
    // 区间针对成交量而非无约束需求，供给上限会同步截断上下分位数，
    // 防止 P90 给出不可能成交的数字。历史周没有校准区间，避免伪造事实。
    const interval = input.status === 'forecast' && residualLogScale > 0
      ? {
        p10: Math.min(available, Math.max(0, Math.round(forecastP50 * Math.exp(-1.2815515655 * residualLogScale)))),
        p50: forecastP50,
        p90: Math.min(available, Math.max(0, Math.round(forecastP50 * Math.exp(1.2815515655 * residualLogScale)))),
      }
      : undefined;

    weeks.push({
      week: input.week,
      date: input.date,
      status: input.status,
      source,
      dataStatus,
      phase: input.phase,
      baseDemand,
      price,
      effectivePrice,
      rrp: input.rrp,
      promoIntensity: promoWindow ? promoWindow.depth : 0,
      promoEvent: promoEventWindow?.label,
      competitorPressure: roundTo(pressure, 4),
      competitorEvent: competitorEventAt(dataset, index),
      modelDemand,
      unconstrainedDemand: modelDemand,
      available,
      stockout,
      observedSO: hasObservedSO ? Math.max(0, Math.round(input.observedSO as number)) : undefined,
      soStatus,
      forecastSO,
      residual: hasObservedSO && soStatus === 'observed' ? so - forecastSO : undefined,
      so,
      forecastP10: interval?.p10,
      forecastP50: interval?.p50,
      forecastP90: interval?.p90,
      si: input.si,
      inventory,
      cost: input.cost,
      incentive,
      companyNetRevenue,
      unitGrossMargin,
      weeklyGrossMargin: so * unitGrossMargin,
      evidence: eventEvidence(dataset, index, drafted),
      // DOS 使用最近四周模型需求均值；即使历史 SO 是观测值，也不把 SO 下降
      // 误当成需求下降。首周不足四周时使用可用窗口均值。
      rolling4wDemand: 0,
      dos: 0,
      draft: drafted,
    });
  });

  // 需要在完整主账生成后计算滚动需求，避免在循环内复制一套边界逻辑。
  weeks.forEach((week, index) => {
    const window = weeks.slice(Math.max(0, index - 3), index + 1);
    const rolling4wDemand = window.reduce((total, item) => total + item.modelDemand, 0) / Math.max(1, window.length);
    week.rolling4wDemand = roundTo(rolling4wDemand, 1);
    week.dos = Math.round((week.inventory / Math.max(1, rolling4wDemand)) * 7);
  });

  const currentWeek = weeks[current];
  const pressureNow = currentWeek.competitorPressure;
  const risk = currentWeek.stockout
    ? { label: '供给截断', note: `${currentWeek.week} 可供量低于无约束需求，SO 按可供量截断` }
    : pressureNow < 0
      ? { label: '竞品压力', note: `${currentWeek.competitorEvent ?? '竞品事件'}影响窗口内，冲击逐周递减` }
      : { label: '无显著风险', note: '当前周可供量与需求匹配' };

  // 当前周瀑布：基线 → 价格 → 促销 → 竞品 → 无约束需求 → 供给截断 → SO。
  const currentPriceRatio = Math.max(0.2, currentWeek.effectivePrice / params.referencePrice);
  const priceFactorNow = Math.pow(currentPriceRatio, priceElasticity);
  const promoFactorNow = promoFactorAt(dataset, current);
  const baselineMultiplierNow = learned ? Math.exp(learned.baselineLogMultiplier) : 1;
  const promoResponseNow = learned
    ? Math.exp(learned.promoLogCoefficient * Math.log(Math.max(1e-6, promoFactorNow)))
    : promoFactorNow;
  const baselineStageNow = Math.max(0, Math.round(currentWeek.baseDemand * baselineMultiplierNow));
  const afterPriceNow = Math.max(0, Math.round(baselineStageNow * priceFactorNow));
  const afterPromoNow = Math.max(0, Math.round(afterPriceNow * promoResponseNow));
  const promoWindowNow = dataset.promoWindows.find(
    (item) => current + 1 >= item.start && current + 1 <= item.end + 1,
  );
  const drivers: DriverContribution[] = [
    {
      key: 'baseline',
      label: '需求基线',
      value: baselineStageNow,
      note: learned
        ? `趋势 + 季节 + 生命周期爬坡 / 衰减；学习校准乘数 ${baselineMultiplierNow.toFixed(3)}`
        : '趋势 + 季节 + 生命周期爬坡 / 衰减（不含本轮事件）',
      status: '固定先验',
    },
    {
      key: 'price',
      label: '消费者感知价格',
      value: afterPriceNow - baselineStageNow,
      note: `生效价 ${currentWeek.effectivePrice}（标价 ${currentWeek.price}，滞后 ${priceLagWeeks} 周）相对参考价 ${params.referencePrice}，弹性 ${(learned?.priceElasticity ?? params.priceElasticity).toFixed(2)}`,
      status: '固定先验',
    },
    {
      key: 'promo',
      label: '促销事件',
      value: afterPromoNow - afterPriceNow,
      note: promoWindowNow
        ? `${promoWindowNow.label}窗口内（强度 ${Math.round(promoWindowNow.depth * 100)}%），活动后一周回落${learned ? `；学习系数 ${(learned.promoLogCoefficient).toFixed(2)}` : ''}`
        : '当前周无促销窗口',
      status: '业务假设',
    },
    {
      key: 'competitor',
      label: '竞品压力',
      // Anchor the final stage to the computed model output so the displayed
      // waterfall remains exactly additive after independent rounding.
      value: currentWeek.unconstrainedDemand - afterPromoNow,
      note:
        pressureNow < 0
          ? `${currentWeek.competitorEvent ?? '竞品事件'}：上市后递减窗口，方向性判断${learned ? `；学习系数 ${(learned.competitorLogCoefficient).toFixed(2)}` : ''}`
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
  const baselineWeeks = draftActive ? computeForecast(dataset, BASELINE_DRAFT, options).weeks : weeks;
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
    modelEvidence: {
      learned: hasLearnedLogModel,
      intervalCalibrated: residualLogScale > 0,
      parameterSource: hasLearnedLogModel ? 'learned' : 'prior',
    },
  };
}
