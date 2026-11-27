import { forecastFixture } from './forecastFixture';
import {
  DEMO_FULL_FORECAST_PROVENANCE,
  type DataAdapter,
  type DataResult,
  errorProvenance,
  type DataProvenance,
} from '../../dataModel/provenance';
import type {
  CompetitorLaunch,
  FactorProfile,
  ForecastDataset,
  ForecastEvent,
  ForecastInputWeek,
  LifecyclePhase,
  PromoWindow,
  WeekStatus,
} from './forecastModel';

/** Model packages that are safe to expose from the local deterministic registry. */
export type ForecastModelId = 'simple-demo-v1' | 'simple-full-v1';

export interface ForecastDatasetScope {
  country?: string;
  channel?: string;
  product?: string;
  currency?: string;
  currentWeek?: string;
  weekRange?: string;
}

export interface ForecastDatasetLookupReady {
  status: 'ready';
  modelId: ForecastModelId;
  dataset: ForecastDataset;
  provenance: DataProvenance;
}

export interface ForecastDatasetLookupEmpty {
  status: 'empty';
  modelId?: string;
  scope?: ForecastDatasetScope;
  reason: 'unknown_model' | 'scope_not_found' | 'invalid_dataset';
  message: string;
  provenance: DataProvenance;
}

export type ForecastDatasetLookup = ForecastDatasetLookupReady | ForecastDatasetLookupEmpty;

/**
 * Adapter boundary for the next real data integration.  The UI only depends
 * on this result shape, so a network adapter can return `empty` or `error`
 * without throwing through React rendering.
 */
export interface ForecastDatasetQuery {
  modelId?: string;
  scope?: ForecastDatasetScope;
}

export type ForecastDatasetAdapterResult = DataResult<ForecastDataset>;

export interface ForecastDatasetAdapter extends DataAdapter<ForecastDatasetQuery, ForecastDataset> {}

/** The canonical UI dataset. Keep this registry entry immutable by convention. */
export const simpleDemoDataset = forecastFixture;

const FULL_HISTORY_WEEKS = 104;
const FULL_FORECAST_WEEKS = 8;
const FULL_WEEK_COUNT = FULL_HISTORY_WEEKS + FULL_FORECAST_WEEKS;
const FULL_START_DATE = Date.UTC(2024, 9, 28); // 2024-W44, Monday

function isoWeekDate(index: number): string {
  return new Date(FULL_START_DATE + index * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function phaseOf(week: number): LifecyclePhase {
  if (week <= 4) return 'launch';
  if (week <= 12) return 'growth';
  if (week <= 80) return 'mature';
  return 'decline';
}

function roundTo(value: number, digits = 0): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sourceIndexOf(weekIndex: number): number {
  return weekIndex % forecastFixture.weeks.length;
}

/**
 * Expand the 24-week UI seed into a deterministic 104-history + 8-forecast
 * adapter fixture. The expansion deliberately contains inputs only; derived
 * demand, inventory and margin remain the responsibility of computeForecast.
 */
export function createSimpleFullFixture(): ForecastDataset {
  // 造数先写外生事件，再按一组明确的真值参数生成历史 SO。
  // 这些真值只存在于 fixture 生成器，不会进入 ForecastDataset，避免 UI
  // 把验模答案误当成真实事实。fitForecastFactors 应在历史输入中重新估计它们。
  const promoWindows: PromoWindow[] = [
    { id: 'promo-full-black-friday', label: '黑五大促', start: 48, end: 49, depth: 0.1 },
    { id: 'promo-full-new-year', label: '年末清库促销', start: 52, end: 53, depth: 0.08 },
    { id: 'promo-full-618', label: '年中大促', start: 80, end: 81, depth: 0.12 },
    { id: 'promo-full-11-11', label: '双十一大促', start: 101, end: 102, depth: 0.1 },
  ];
  const competitorLaunches: CompetitorLaunch[] = [
    {
      id: 'cmp-full-iphone17-launch',
      label: 'iPhone 17 Pro 上市',
      week: 40,
      impact: -0.12,
      windowWeeks: 6,
      halfLifeWeeks: 6,
      marketEffect: 'unknown',
      simpleAssumption: 'neutral_market_size',
      missingEvidence: ['market_size_units', 'competitor_sellout', 'control_market'],
    },
    {
      id: 'cmp-full-s26-launch',
      label: 'S26 Ultra 上市',
      week: 88,
      impact: -0.1,
      windowWeeks: 6,
      halfLifeWeeks: 6,
      marketEffect: 'unknown',
      simpleAssumption: 'neutral_market_size',
      missingEvidence: ['market_size_units', 'competitor_sellout', 'control_market'],
    },
  ];
  const competitorPulses = [
    { id: 'cmp-full-iphone17-promo', label: 'iPhone 17 Pro 促销', week: 42, impact: -0.05 },
    { id: 'cmp-full-s26-promo', label: 'S26 Ultra 促销', week: 90, impact: -0.04 },
  ];
  const promoFactorTruth = (weekNumber: number): number => promoWindows.reduce((factor, promo) => {
    if (weekNumber >= promo.start && weekNumber <= promo.end) return factor * (1 + promo.depth * 1.55);
    if (weekNumber === promo.end + 1) return factor * 0.92;
    return factor;
  }, 1);
  const competitorPressureTruth = (weekNumber: number): number => {
    let pressure = 0;
    competitorLaunches.forEach((launch) => {
      const age = weekNumber - launch.week;
      if (age >= 0 && age < launch.windowWeeks) pressure -= Math.abs(launch.impact) * 0.5 ** (age / launch.halfLifeWeeks);
    });
    competitorPulses.forEach((pulse) => { if (pulse.week === weekNumber) pressure += pulse.impact; });
    return pressure;
  };
  // 真值只用于生成 fixture：base × exp(β0 + βprice·log(price/ref)
  // + βpromo·log(promoFactor) + βcompetitor·log(1+pressure))。
  const truth = { baseline: 0.018, price: -1.55, promo: 1.08, competitor: 0.92 };
  const weeks: ForecastInputWeek[] = Array.from({ length: FULL_WEEK_COUNT }, (_, index) => {
    const weekNumber = index + 1;
    const source = forecastFixture.weeks[sourceIndexOf(index)];
    const sourceBase = source.baseDemand ?? 0;
    const yearLift = 1 + Math.floor(index / 52) * 0.025;
    const lifecycleLift = index < 12 ? 0.94 + index * 0.01 : index > 80 ? 0.99 - (index - 80) * 0.003 : 1;
    const baseDemand = Math.max(0, Math.round(sourceBase * yearLift * lifecycleLift));
    const priceRatio = source.price / forecastFixture.params.referencePrice;
    const rrp = 89990;
    const price = roundTo(rrp * priceRatio, -2);
    // 留出促销周的供给足量，避免促销脉冲全部落在删失样本而无法识别；
    // 非促销周仍保留来源配额，继续提供真实的截断样本。
    const eventSupplyLift = promoFactorTruth(weekNumber) > 1 ? 1.35 : 1;
    const available = Math.max(0, Math.round(source.available * yearLift * eventSupplyLift));
    const si = Math.max(0, Math.round(source.si * yearLift));
    const cost = roundTo(52000 * (source.cost / 680), -2);
    const incentive = roundTo((source.incentive ?? 0) * (rrp / forecastFixture.params.referencePrice), -2);
    const actual = index < FULL_HISTORY_WEEKS;
    const effectiveSource = forecastFixture.weeks[sourceIndexOf(Math.max(0, index - 1))];
    const priceSignal = Math.log(Math.max(0.2, effectiveSource.price / forecastFixture.params.referencePrice));
    const promoFactor = promoFactorTruth(weekNumber);
    const pressure = competitorPressureTruth(weekNumber);
    const deterministicNoise = 1 + (((index * 17) % 11) - 5) * 0.004;
    const latentDemand = baseDemand * Math.exp(truth.baseline + truth.price * priceSignal + truth.promo * Math.log(promoFactor) + truth.competitor * Math.log(Math.max(1e-6, 1 + pressure))) * deterministicNoise;
    // Keep all historical rows observable while preserving deterministic censored
    // rows where the generated cap is below the latent demand.
    const proxySo = Math.max(0, Math.round(latentDemand));
    const observedSO = actual ? Math.min(available, proxySo) : undefined;
    const soStatus = actual ? (observedSO === available && proxySo > available ? 'censored' as const : 'observed' as const) : undefined;
    const status: WeekStatus = actual ? 'actual' : 'forecast';
    return {
      week: `W${weekNumber}`,
      date: isoWeekDate(index),
      status,
      dataStatus: 'simulated',
      phase: phaseOf(weekNumber),
      baseDemand,
      price,
      rrp,
      observedSO,
      soStatus,
      available,
      si,
      cost,
      incentive,
    };
  });

  const events: ForecastEvent[] = [
    { id: 'full-e01', weekLabel: 'W1', type: 'lifecycle', label: '当前产品上市', shape: '爬坡后平台', detail: '建立完整 Adapter 的生命周期基线' },
    { id: 'full-e02', weekLabel: 'W48–W49', type: 'promo', label: '黑五大促', shape: '平台脉冲', detail: '活动强度 10%，活动后一周透支回落' },
    { id: 'full-e03', weekLabel: 'W40', type: 'competitor', label: 'iPhone 17 Pro 上市', shape: '首周冲击后递减', detail: '简单版只作为份额压力，市场扩盘 / 分流待验证' },
    { id: 'full-e04', weekLabel: 'W88', type: 'competitor', label: 'S26 Ultra 上市', shape: '首周冲击后递减', detail: '简单版只作为份额压力，市场扩盘 / 分流待验证' },
    { id: 'full-e05', weekLabel: 'W80–W81', type: 'supply', label: '供应波动', shape: '供给上限', detail: '保留无约束需求，SO 按可供量截断' },
    { id: 'full-e06', weekLabel: 'W96', type: 'cost', label: '成本上调', shape: '成本阶跃', detail: '只影响销毛和价格底线，不修改需求' },
  ];

  const factorProfiles: FactorProfile[] = forecastFixture.factorProfiles.map((profile) => ({
    ...profile,
    window: 'W1–W112',
    evidence: '完整 Adapter 模拟输入 · 待拟合',
    status: profile.key === 'supply' ? '确定性计算' : '待学习',
    sampleCount: profile.key === 'supply' ? FULL_HISTORY_WEEKS : undefined,
    fitWindow: 'W1–W104',
    fallback: profile.key !== 'supply',
    exclusions: profile.key === 'supply' ? { censored: 0, confounded: 0, missing: 0 } : undefined,
  }));

  return {
    meta: {
      status: 'simulated',
      modelVersion: 'simple-full-v1',
      source: 'demo_seed_full',
      generatedAt: '2026-11-02',
      currency: 'RUB',
      note: '104 周历史 + 8 周预测的完整 Adapter 模拟数据，仅用于拟合和验模。',
      provenance: DEMO_FULL_FORECAST_PROVENANCE,
    },
    context: {
      country: 'RU',
      industry: 'phone',
      channel: 'DNS',
      product: 'HUAWEI Pura 80 Pro',
      competitors: ['HUAWEI Pura 70 Pro', 'Apple iPhone 17 Pro', 'Samsung S26 Ultra'],
      priceBand: 'RUB 80,000–120,000',
      currentWeek: 'W104',
      weekRange: 'W1–W112',
    },
    weeks,
    promoWindows,
    competitorLaunches,
    competitorPulses,
    events,
    factorProfiles,
    params: {
      referencePrice: 89990,
      priceElasticity: -1.7,
      promoLiftCoefficient: 1.6,
      promoAftermathFactor: 0.92,
      channelFeeRate: 0.14,
      initialInventory: 460,
      currentWeekIndex: FULL_HISTORY_WEEKS - 1,
      effectivePriceLagWeeks: 1,
    },
  };
}

/** Full adapter fixture is generated once and is deterministic for this build. */
export const simpleFullDataset = createSimpleFullFixture();

export const forecastDatasetRegistry: Readonly<Record<ForecastModelId, ForecastDataset>> = {
  'simple-demo-v1': simpleDemoDataset,
  'simple-full-v1': simpleFullDataset,
};

const adapterSource = {
  id: 'forecast-dataset-registry',
  label: '量价预测数据适配层',
  kind: 'adapter' as const,
  version: 'registry-v1',
};

/** Synchronous demo adapter; replace `load` with the real API call later. */
export const simpleForecastAdapter: ForecastDatasetAdapter = createForecastDatasetAdapter();

const scopeFields: Array<keyof ForecastDatasetScope> = ['country', 'channel', 'product', 'currency', 'currentWeek', 'weekRange'];

function scopeMatches(dataset: ForecastDataset, scope: ForecastDatasetScope | undefined): boolean {
  if (!scope) return true;
  const values: ForecastDatasetScope = {
    country: dataset.context.country,
    channel: dataset.context.channel,
    product: dataset.context.product,
    currency: dataset.meta.currency,
    currentWeek: dataset.context.currentWeek,
    weekRange: dataset.context.weekRange,
  };
  return scopeFields.every((field) => scope[field] == null || scope[field] === values[field]);
}

/** Guard the UI boundary so an empty or malformed model pack becomes an explicit state. */
export function validateForecastDataset(dataset: ForecastDataset): string | null {
  if (!dataset.weeks.length) return '当前预测数据集没有可展示的周度数据。';
  const currentIndex = dataset.params.currentWeekIndex;
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= dataset.weeks.length) {
    return '当前预测数据集的当前周索引无效，暂时无法生成预测。';
  }
  if (currentIndex >= dataset.weeks.length - 1) {
    return '当前预测数据集没有可展示的未来预测窗口。';
  }
  return null;
}

/** Resolve a model pack without silently falling back to another scope. */
export function resolveForecastDataset(query: { modelId?: string; scope?: ForecastDatasetScope } = {}): ForecastDatasetLookup {
  const modelId = query.modelId ?? 'simple-demo-v1';
  if (modelId !== 'simple-demo-v1' && modelId !== 'simple-full-v1') {
    return {
      status: 'empty',
      modelId,
      scope: query.scope,
      reason: 'unknown_model',
      message: `没有可用的预测数据集：${modelId}`,
      provenance: errorProvenance(adapterSource, '模型包未注册，无法读取预测数据。'),
    };
  }
  const dataset = forecastDatasetRegistry[modelId];
  const invalidReason = validateForecastDataset(dataset);
  if (invalidReason) {
    return {
      status: 'empty',
      modelId,
      scope: query.scope,
      reason: 'invalid_dataset',
      message: invalidReason,
      provenance: dataset.meta.provenance ?? errorProvenance(adapterSource, invalidReason),
    };
  }
  if (!scopeMatches(dataset, query.scope)) {
    return {
      status: 'empty',
      modelId,
      scope: query.scope,
      reason: 'scope_not_found',
      message: '当前国家、渠道、产品或时间范围没有匹配的预测数据。',
      provenance: dataset.meta.provenance ?? errorProvenance(adapterSource, '当前作用域没有预测数据。'),
    };
  }
  return { status: 'ready', modelId, dataset, provenance: dataset.meta.provenance ?? errorProvenance(adapterSource, '预测数据缺少来源元数据。') };
}

/**
 * Factory used by the real integration and by adapter contract tests.  A
 * caller can provide a server-backed registry or a cached response without
 * changing the UI boundary.  Invalid packs become an `error` result; a valid
 * pack with no matching scope becomes an explicit `empty` result.
 */
export function createForecastDatasetAdapter(
  registry: Readonly<Record<string, ForecastDataset>> = forecastDatasetRegistry,
): ForecastDatasetAdapter {
  return {
    id: 'forecast-dataset-adapter-v1',
    load(query = {}): ForecastDatasetAdapterResult {
      const modelId = query.modelId ?? 'simple-demo-v1';
      const dataset = registry[modelId];
      const source = dataset?.meta.provenance?.source ?? adapterSource;
      if (!dataset) {
        return {
          state: 'empty',
          provenance: errorProvenance(source, '模型包未注册，无法读取预测数据。'),
          reason: 'not_configured',
          message: `没有可用的预测数据集：${modelId}`,
        };
      }
      const invalidReason = validateForecastDataset(dataset);
      if (invalidReason) {
        return {
          state: 'error',
          provenance: errorProvenance(source, invalidReason),
          error: { code: 'FORECAST_DATASET_INVALID', message: invalidReason, retryable: false },
        };
      }
      if (!scopeMatches(dataset, query.scope)) {
        return {
          state: 'empty',
          provenance: dataset.meta.provenance ?? errorProvenance(source, '当前作用域没有预测数据。'),
          reason: 'out_of_scope',
          message: '当前国家、渠道、产品或时间范围没有匹配的预测数据。',
        };
      }
      return {
        state: 'ready',
        data: dataset,
        provenance: dataset.meta.provenance ?? errorProvenance(source, '预测数据缺少来源元数据。'),
      };
    },
  };
}

