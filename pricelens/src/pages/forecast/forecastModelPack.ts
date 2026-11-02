import type { DataProvenance } from '../../dataModel/provenance';
import type { ForecastDataset } from './forecastModel';
import type { ForecastFitRun, LearnedParameter } from './forecastLearning';
import type { ForecastSnapshot } from './forecastSnapshot';

/** Persistable model modes. A mode change always creates a new model id. */
export type ForecastModelMode = 'simple' | 'complex';
export type ForecastPackStatus = 'ready' | 'insufficient' | 'invalid';

export interface ForecastModelPackManifest {
  modelId: string;
  modelMode: ForecastModelMode;
  schemaVersion: string;
  scope: {
    country: string;
    industry?: string;
    channel: string;
    currency: string;
    product?: string;
  };
  factorSet: string[];
  constraintSet: string[];
  outputSet: string[];
  dataStatus: ForecastDataset['meta']['status'];
  createdAt: string;
  generatorVersion: string;
  fitVersion?: string;
}

export interface ForecastFactorConfig {
  role: 'demand_factor' | 'constraint' | 'accounting_output' | 'market_effect';
  kernel: string;
  learnable: boolean;
  lagWeeks?: number;
  decayDefinition?: 'half_life';
  prior?: Record<string, number>;
}

export interface ForecastAssumptions {
  simpleMarketEffect: 'neutral_market_size' | 'unknown';
  priceLagWeeks: number;
  supplyIsConstraint: true;
  costAffectsDemand: false;
  intervalStatus: 'uncalibrated' | 'calibrated';
}

export interface ForecastEventEffect {
  eventId: string;
  marketEffect: 'unknown' | 'neutral' | 'expansion' | 'substitution';
  evidence: string[];
  missingEvidence: string[];
}

export interface ForecastModelPack {
  manifest: ForecastModelPackManifest;
  provenance?: DataProvenance;
  factorConfig: Record<string, ForecastFactorConfig>;
  assumptions: ForecastAssumptions;
  fitRuns: ForecastFitRun[];
  learnedParameters: LearnedParameter[];
  forecastSnapshots: ForecastSnapshot[];
  eventEffects: ForecastEventEffect[];
}

export const SIMPLE_FACTOR_CONFIG: Readonly<Record<string, ForecastFactorConfig>> = {
  baseline: { role: 'demand_factor', kernel: 'trend+seasonality+lifecycle', learnable: true, prior: { trend: 0, seasonality: 1 } },
  price: { role: 'demand_factor', kernel: 'step', learnable: true, lagWeeks: 1, prior: { elasticity: -1.7 } },
  promo: { role: 'demand_factor', kernel: 'preheat_peak_aftermath', learnable: true, lagWeeks: 0, prior: { uplift: 0.08 } },
  competitor: { role: 'demand_factor', kernel: 'decay', learnable: true, decayDefinition: 'half_life', prior: { pressure: -0.12 } },
  supply: { role: 'constraint', kernel: 'censor', learnable: false },
  margin: { role: 'accounting_output', kernel: 'net_revenue_minus_cost', learnable: false },
};

export const COMPLEX_FACTOR_CONFIG: Readonly<Record<string, ForecastFactorConfig>> = {
  ...SIMPLE_FACTOR_CONFIG,
  marketSize: { role: 'market_effect', kernel: 'event-study+control-market', learnable: true, prior: { expansionRate: 0, substitutionRate: 0 } },
};

export const COMPLEX_MODEL_MANIFEST: ForecastModelPackManifest = {
  modelId: 'complex-v1',
  modelMode: 'complex',
  schemaVersion: 'forecast-schema-1',
  scope: { country: '*', channel: '*', currency: '*' },
  factorSet: ['baseline', 'price', 'promo', 'competitor', 'marketSize'],
  constraintSet: ['supply'],
  outputSet: ['inventory', 'dos', 'margin', 'market_size', 'share', 'expansion_rate', 'substitution_rate'],
  dataStatus: 'simulated',
  createdAt: '2026-11-02T00:00:00Z',
  generatorVersion: 'forecast-complex-schema-1.0',
};

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
  });
}

function eventEffectsOf(dataset: ForecastDataset): ForecastEventEffect[] {
  return dataset.competitorLaunches.map((event) => ({
    eventId: event.id,
    marketEffect: event.marketEffect,
    evidence: [],
    missingEvidence: event.missingEvidence ?? ['market_size_units', 'competitor_sellout', 'control_market'],
  }));
}

export function modelPackManifestOf(dataset: ForecastDataset, snapshot?: ForecastSnapshot): ForecastModelPackManifest {
  return {
    modelId: dataset.meta.modelVersion,
    modelMode: snapshot?.modelMode ?? 'simple',
    schemaVersion: snapshot?.schemaVersion ?? 'forecast-schema-1',
    scope: {
      country: dataset.context.country,
      industry: dataset.context.industry,
      channel: dataset.context.channel,
      currency: dataset.meta.currency,
      product: dataset.context.product,
    },
    factorSet: ['baseline', 'price', 'promo', 'competitor'],
    constraintSet: ['supply'],
    outputSet: ['inventory', 'dos', 'margin'],
    dataStatus: dataset.meta.status,
    createdAt: dataset.meta.generatedAt,
    generatorVersion: dataset.meta.source,
    fitVersion: snapshot?.fit.fitId,
  };
}

export function createForecastModelPack(dataset: ForecastDataset, snapshot?: ForecastSnapshot, provenance?: DataProvenance): ForecastModelPack {
  const fit = snapshot?.fit;
  return {
    manifest: modelPackManifestOf(dataset, snapshot),
    provenance,
    factorConfig: { ...SIMPLE_FACTOR_CONFIG },
    assumptions: {
      simpleMarketEffect: 'unknown',
      priceLagWeeks: Math.max(0, Math.round(dataset.params.effectivePriceLagWeeks ?? 1)),
      supplyIsConstraint: true,
      costAffectsDemand: false,
      intervalStatus: fit?.appliedToForecast && fit.residualLogScale != null ? 'calibrated' : 'uncalibrated',
    },
    fitRuns: fit ? [fit] : [],
    learnedParameters: snapshot?.learnedParameters ?? [],
    forecastSnapshots: snapshot ? [snapshot] : [],
    eventEffects: eventEffectsOf(dataset),
  };
}

/**
 * Validate the persistence boundary before writing a pack. The UI and Agent
 * must never receive a partially versioned pack or a complex model disguised
 * as a simple one.
 */
export function validateForecastModelPack(pack: ForecastModelPack): string[] {
  const errors: string[] = [];
  if (!pack.manifest.modelId || !pack.manifest.schemaVersion) errors.push('manifest 缺少 modelId 或 schemaVersion');
  if (!pack.manifest.scope.country || !pack.manifest.scope.channel || !pack.manifest.scope.currency) errors.push('manifest 缺少 scope');
  if (pack.manifest.modelMode === 'simple' && pack.manifest.factorSet.includes('marketSize')) errors.push('simple 模型不能携带 marketSize 因子');
  if (!pack.factorConfig.supply || pack.factorConfig.supply.role !== 'constraint') errors.push('缺少 supply constraint 配置');
  if (pack.assumptions.supplyIsConstraint !== true || pack.assumptions.costAffectsDemand !== false) errors.push('供给 / 成本边界不合法');
  if (pack.forecastSnapshots.some((snapshot) => snapshot.schemaVersion !== pack.manifest.schemaVersion)) errors.push('snapshot schemaVersion 与 manifest 不一致');
  if (pack.fitRuns.some((run) => run.modelId !== pack.manifest.modelId)) errors.push('fitRuns modelId 与 manifest 不一致');
  if (pack.eventEffects.some((event) => event.marketEffect === 'expansion' && !event.evidence.length)) errors.push('扩盘事件缺少证据');
  return errors;
}

export function serializeForecastModelPack(pack: ForecastModelPack): string {
  const errors = validateForecastModelPack(pack);
  if (errors.length) throw new Error(`模型包无法保存：${errors.join('；')}`);
  return JSON.stringify(pack, null, 2);
}

export function modelPackFingerprint(pack: ForecastModelPack): string {
  let hash = 2166136261;
  for (const char of stableJson(pack)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `mp-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
