import {
  BASELINE_DRAFT,
  computeForecast,
  type ComputedWeek,
  type ForecastComputation,
  type ForecastDataset,
  type ScenarioDraft,
  type CompetitorMarketEffect,
} from './forecastModel';
import { fitForecastFactors, learnedForecastOverridesOf, type ForecastFitRun } from './forecastLearning';
import { DEMO_FORECAST_PROVENANCE, type DataProvenance } from '../../dataModel/provenance';

export const FORECAST_SCHEMA_VERSION = 'forecast-schema-1';

export interface ForecastCompetitorEvent {
  kind: 'launch' | 'pulse';
  id: string;
  label: string;
  week: number;
  impact: number;
  marketEffect: CompetitorMarketEffect;
  marketClassification: {
    selected: CompetitorMarketEffect;
    candidates: Array<'expansion' | 'substitution'>;
    confidence: 'high' | 'medium' | 'low';
    requiredEvidence: string[];
  };
  windowWeeks?: number;
  halfLifeWeeks?: number;
  simpleAssumption?: 'neutral_market_size';
  missingEvidence?: string[];
}

export interface ForecastSnapshot {
  snapshotId: string;
  attemptId: string;
  contextFingerprint: string;
  schemaVersion: string;
  modelId: string;
  modelMode: 'simple' | 'complex';
  scope: {
    country: string;
    industry?: string;
    channel: string;
    product: string;
    currency: string;
    range: string;
  };
  dataStatus: ForecastDataset['meta']['status'];
  /** Shared source / as-of metadata carried into Agent explanations. */
  provenance: DataProvenance;
  current: ComputedWeek;
  historyWeeks: ComputedWeek[];
  forecastWeeks: ComputedWeek[];
  factors: ForecastDataset['factorProfiles'];
  /** 最近一次确定性 fit；样本不足时仍保留 fallback 和排除原因。 */
  fit: ForecastFitRun;
  learnedParameters: ForecastFitRun['parameters'];
  /** Explicitly records whether learned coefficients changed the demo forecast. */
  fitAppliedToForecast: boolean;
  /** Launches and one-week competitor pulses share one auditable event stream. */
  competitorEvents: ForecastCompetitorEvent[];
  kpi: ForecastComputation['kpi'];
  scenario: ForecastComputation['scenario'];
  /** 页面只读投影；持久化时由 history/forecast/factors/kpi 重建。 */
  computation: ForecastComputation;
}

function stableFingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fs-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createForecastSnapshot(
  dataset: ForecastDataset,
  draft: ScenarioDraft = BASELINE_DRAFT,
  contextFingerprint = 'forecast-demo-context',
  attemptId = `attempt-${dataset.meta.modelVersion}`,
): ForecastSnapshot {
  const fit = fitForecastFactors(dataset, { schemaVersion: FORECAST_SCHEMA_VERSION });
  // 只有 fit 的质量门槛通过且可生成校准残差尺度时，学习参数才进入预测；
  // 简单 demo 会稳定回退固定先验，避免“看起来学到了”却没有证据。
  const computation = computeForecast(dataset, draft, { learned: learnedForecastOverridesOf(fit) });
  const currentIndex = dataset.params.currentWeekIndex;
  const competitorEvents: ForecastCompetitorEvent[] = [
    ...dataset.competitorLaunches.map((event) => ({
      ...event,
      kind: 'launch' as const,
      marketClassification: event.marketClassification ?? {
        selected: event.marketEffect,
        candidates: ['expansion', 'substitution'] as Array<'expansion' | 'substitution'>,
        confidence: event.marketEffect === 'unknown' ? 'low' as const : 'medium' as const,
        requiredEvidence: event.missingEvidence ?? ['market_size_units', 'competitor_sellout', 'control_market'],
      },
    })),
    ...dataset.competitorPulses.map((event) => ({
      ...event,
      kind: 'pulse' as const,
      marketEffect: 'unknown' as const,
      marketClassification: {
        selected: 'unknown' as const,
        candidates: ['expansion', 'substitution'] as Array<'expansion' | 'substitution'>,
        confidence: 'low' as const,
        requiredEvidence: ['market_size_units', 'competitor_sellout', 'control_market'],
      },
      simpleAssumption: 'neutral_market_size' as const,
      missingEvidence: ['market_size_units', 'competitor_sellout', 'control_market'],
    })),
  ].sort((a, b) => a.week - b.week || (a.kind === 'launch' ? -1 : 1) - (b.kind === 'launch' ? -1 : 1));
  const scope = {
    country: dataset.context.country,
    industry: dataset.context.industry,
    channel: dataset.context.channel,
    product: dataset.context.product,
    currency: dataset.meta.currency,
    range: dataset.context.weekRange,
  };
  const identity = { scope, model: dataset.meta.modelVersion, draft, contextFingerprint, attemptId, schemaVersion: FORECAST_SCHEMA_VERSION };
  return {
    snapshotId: stableFingerprint(identity),
    attemptId,
    contextFingerprint,
    schemaVersion: FORECAST_SCHEMA_VERSION,
    modelId: dataset.meta.modelVersion,
    modelMode: 'simple',
    scope,
    dataStatus: dataset.meta.status,
    provenance: dataset.meta.provenance ?? DEMO_FORECAST_PROVENANCE,
    current: computation.current,
    historyWeeks: computation.weeks.slice(0, currentIndex + 1),
    forecastWeeks: computation.weeks.slice(currentIndex + 1),
    factors: dataset.factorProfiles,
    fit,
    learnedParameters: fit.parameters,
    fitAppliedToForecast: fit.appliedToForecast,
    competitorEvents,
    kpi: computation.kpi,
    scenario: computation.scenario,
    computation,
  };
}

