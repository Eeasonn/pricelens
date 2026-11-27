import {
  competitorPressureAt,
  promoFactorAt,
  type ForecastDataset,
  type LearnedForecastOverrides,
} from './forecastModel';

export type LearnedFactor = 'baseline' | 'price' | 'promo' | 'competitor';
export type FitConfidence = 'high' | 'medium' | 'low';

export interface LearnedParameter {
  factor: LearnedFactor;
  /** log-demand coefficient. See ForecastModel's application equation. */
  coefficient: number;
  prior: number;
  sampleCount: number;
  effectiveWeeks: number;
  confidence: FitConfidence;
  interval: [number, number] | null;
  exclusions: { censored: number; confounded: number; missing: number };
  fallback: boolean;
  reason?: string;
}

export interface FitQualityGate {
  passed: boolean;
  reasons: string[];
  minSampleCount: number;
  sampleCount: number;
  trainCount: number;
  holdoutCount: number;
  censoredRate: number;
  independentEvents: { price: number; promo: number; competitor: number };
  coefficientFinite: boolean;
  holdoutRmse: number | null;
  holdoutCoverage: number | null;
}

export interface ForecastFitRun {
  fitId: string;
  modelId: string;
  schemaVersion: string;
  fitWindow: { start: string; end: string };
  sampleCount: number;
  excluded: { censored: number; confounded: number; missing: number };
  /** Metrics are on log(SO / baseDemand), so they are comparable across product scale. */
  metrics: { mae: number | null; rmse: number | null; coverage: number | null };
  qualityGate: FitQualityGate;
  /** Residual log-demand scale used to produce calibrated P10/P50/P90 on future SO. */
  residualLogScale: number | null;
  status: 'completed' | 'fallback' | 'insufficient';
  fittedAt: string;
  /** True only when all quality checks pass and learned parameters are applied. */
  appliedToForecast: boolean;
  /** The exact parameter projection consumed by computeForecast when the gate passes. */
  application: LearnedForecastOverrides | null;
  parameters: LearnedParameter[];
}

/** Log-demand priors. The demo keeps these as fixed, explicit assumptions. */
const PRIOR: Record<LearnedFactor, number> = { baseline: 0, price: -1.7, promo: 1, competitor: 1 };
const MIN_SAMPLE_COUNT = 24;
const HOLDOUT_FRACTION = 0.2;
const Z80 = 1.2815515655;
const round = (value: number, digits = 4): number => Math.round(value * 10 ** digits) / 10 ** digits;

interface FitRow {
  index: number;
  features: [number, number, number];
  y: number;
}

interface CoefficientFit {
  coefficients: number[];
  stderr: number[];
}

function solve(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

function inverse(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = 0; j < 2 * n; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = 0; j < 2 * n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

function predict(row: FitRow, beta: number[]): number {
  return beta[0] + row.features.reduce((sum, feature, index) => sum + feature * beta[index + 1], 0);
}

function fitCoefficient(rows: FitRow[]): CoefficientFit | null {
  const n = 4;
  const xtx = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const xty = Array<number>(n).fill(0);
  rows.forEach((row) => {
    const base = [1, ...row.features];
    for (let i = 0; i < n; i += 1) {
      xty[i] += base[i] * row.y;
      for (let j = 0; j < n; j += 1) xtx[i][j] += base[i] * base[j];
    }
  });
  // Tiny deterministic ridge stabilizer; the quality gate still rejects a fit
  // with non-finite coefficients or poor holdout error.
  for (let index = 0; index < n; index += 1) xtx[index][index] += 1e-6;
  const beta = solve(xtx, xty);
  const inv = inverse(xtx);
  if (!beta || !inv || beta.some((value) => !Number.isFinite(value))) return null;
  const residuals = rows.map((row) => row.y - predict(row, beta));
  const sigma2 = residuals.reduce((sum, value) => sum + value * value, 0) / Math.max(1, rows.length - n);
  return {
    coefficients: beta,
    stderr: inv.map((row, i) => Math.sqrt(Math.max(0, sigma2 * row[i]))),
  };
}

function quantile(values: number[], probability: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, probability));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function independentEventCounts(dataset: ForecastDataset, historyLength: number): FitQualityGate['independentEvents'] {
  return {
    price: dataset.weeks.slice(1, historyLength).filter((week, index) => week.price !== dataset.weeks[index].price).length,
    promo: dataset.promoWindows.filter((window) => window.start <= historyLength).length,
    competitor: [
      ...dataset.competitorLaunches.filter((launch) => launch.week <= historyLength).map((launch) => launch.id),
      ...dataset.competitorPulses.filter((pulse) => pulse.week <= historyLength).map((pulse) => pulse.id),
    ].filter((id, index, all) => all.indexOf(id) === index).length,
  };
}

/**
 * Build the finite-factor design matrix. The target is log(SO / baseDemand),
 * so lifecycle/base-demand level is controlled before learning responses.
 * Censored SO is excluded rather than treated as demand.
 */
export function fitForecastFactors(
  dataset: ForecastDataset,
  options?: { fitId?: string; fittedAt?: string; schemaVersion?: string },
): ForecastFitRun {
  const history = dataset.weeks.slice(0, dataset.params.currentWeekIndex + 1);
  const excluded = { censored: 0, confounded: 0, missing: 0 };
  const rows: FitRow[] = [];
  history.forEach((week, index) => {
    if (week.soStatus === 'censored') { excluded.censored += 1; return; }
    if (week.observedSO == null || !Number.isFinite(week.observedSO) || !(week.baseDemand && week.baseDemand > 0)) {
      excluded.missing += 1;
      return;
    }
    const lagWeeks = Math.max(0, Math.round(dataset.params.effectivePriceLagWeeks ?? 1));
    const sourceIndex = Math.max(0, index - lagWeeks);
    const effectivePrice = week.effectivePrice ?? dataset.weeks[sourceIndex]?.price ?? week.price;
    const priceSignal = Math.log(Math.max(0.2, effectivePrice / dataset.params.referencePrice));
    const promoSignal = Math.log(Math.max(1e-6, promoFactorAt(dataset, index)));
    const pressureFactor = Math.max(1e-6, 1 + competitorPressureAt(dataset, index));
    const competitorSignal = Math.log(pressureFactor);
    // A simultaneous *price transition* and own promotion cannot identify either
    // effect in a one-row demo. A price level being below reference is not itself
    // confounding; only a contemporaneous change is excluded.
    const priceChanged = index > 0 && dataset.weeks[index - 1].price !== week.price;
    if (Math.abs(promoSignal) > 1e-9 && priceChanged) { excluded.confounded += 1; return; }
    rows.push({
      index,
      features: [priceSignal, promoSignal, competitorSignal],
      y: Math.log(Math.max(1, week.observedSO) / Math.max(1, week.baseDemand)),
    });
  });

  const holdoutCount = rows.length >= 10 ? Math.max(4, Math.floor(rows.length * HOLDOUT_FRACTION)) : 0;
  const trainRows = rows.slice(0, Math.max(0, rows.length - holdoutCount));
  const holdoutRows = rows.slice(Math.max(0, rows.length - holdoutCount));
  const fit = trainRows.length >= 8 ? fitCoefficient(trainRows) : null;
  const allFit = rows.length >= 8 ? fitCoefficient(rows) : null;
  const independentEvents = independentEventCounts(dataset, history.length);
  const coefficientFinite = Boolean(allFit?.coefficients.every((value) => Number.isFinite(value)));

  const holdoutResiduals = fit && holdoutRows.length
    ? holdoutRows.map((row) => row.y - predict(row, fit.coefficients))
    : [];
  const holdoutRmse = holdoutResiduals.length
    ? Math.sqrt(holdoutResiduals.reduce((sum, value) => sum + value * value, 0) / holdoutResiduals.length)
    : null;
  const residualScaleCandidate = quantile(holdoutResiduals.map(Math.abs), 0.8);
  const residualLogScale = residualScaleCandidate == null ? null : round(Math.max(0.01, residualScaleCandidate / Z80), 6);
  const holdoutCoverage = holdoutResiduals.length && residualLogScale
    ? holdoutResiduals.filter((value) => Math.abs(value) <= Z80 * residualLogScale).length / holdoutResiduals.length
    : null;
  const gateReasons: string[] = [];
  if (rows.length < MIN_SAMPLE_COUNT) gateReasons.push(`有效样本 ${rows.length} < ${MIN_SAMPLE_COUNT}`);
  const censoredRate = excluded.censored / Math.max(1, history.length);
  if (censoredRate >= 0.35) gateReasons.push(`删失比例 ${(censoredRate * 100).toFixed(1)}% ≥ 35%`);
  if (independentEvents.price < 3) gateReasons.push(`独立调价事件 ${independentEvents.price} < 3`);
  if (independentEvents.promo < 3) gateReasons.push(`独立促销窗口 ${independentEvents.promo} < 3`);
  if (independentEvents.competitor < 2) gateReasons.push(`独立竞品事件 ${independentEvents.competitor} < 2`);
  if (!fit || !allFit || !coefficientFinite) gateReasons.push('设计矩阵不可解或系数非有限');
  if (holdoutRows.length < 4) gateReasons.push(`留出验证样本 ${holdoutRows.length} < 4`);
  if (holdoutRmse != null && holdoutRmse > 0.45) gateReasons.push(`留出 RMSE ${holdoutRmse.toFixed(3)} > 0.45`);
  if (holdoutCoverage != null && holdoutCoverage < 0.6) gateReasons.push(`留出区间覆盖 ${(holdoutCoverage * 100).toFixed(1)}% < 60%`);
  const passed = gateReasons.length === 0;

  const estimated = allFit?.coefficients ?? [PRIOR.baseline, PRIOR.price, PRIOR.promo, PRIOR.competitor];
  const stderr = allFit?.stderr ?? [0, 0, 0, 0];
  const parameters = (['baseline', 'price', 'promo', 'competitor'] as LearnedFactor[]).map((factor, index) => {
    const coefficient = passed ? estimated[index] : PRIOR[factor];
    const spread = passed ? 1.96 * stderr[index] : 0;
    return {
      factor,
      coefficient: round(coefficient),
      prior: PRIOR[factor],
      sampleCount: rows.length,
      effectiveWeeks: rows.length,
      confidence: passed && stderr[index] < 0.12 ? 'high' : passed && stderr[index] < 0.25 ? 'medium' : 'low',
      interval: passed ? [round(coefficient - spread), round(coefficient + spread)] as [number, number] : null,
      exclusions: { ...excluded },
      fallback: !passed,
      reason: passed ? undefined : gateReasons.join('；'),
    } satisfies LearnedParameter;
  });

  const application = passed && allFit && residualLogScale != null
    ? {
      baselineLogMultiplier: round(allFit.coefficients[0], 6),
      priceElasticity: round(allFit.coefficients[1], 6),
      promoLogCoefficient: round(allFit.coefficients[2], 6),
      competitorLogCoefficient: round(allFit.coefficients[3], 6),
      residualLogScale,
    }
    : null;
  return {
    fitId: options?.fitId ?? `fit-${dataset.meta.modelVersion}`,
    modelId: dataset.meta.modelVersion,
    schemaVersion: options?.schemaVersion ?? 'forecast-schema-1',
    fitWindow: { start: history[0]?.week ?? '—', end: history[history.length - 1]?.week ?? '—' },
    sampleCount: rows.length,
    excluded,
    metrics: {
      mae: holdoutResiduals.length ? round(holdoutResiduals.reduce((sum, value) => sum + Math.abs(value), 0) / holdoutResiduals.length) : null,
      rmse: holdoutRmse == null ? null : round(holdoutRmse),
      coverage: holdoutCoverage == null ? null : round(holdoutCoverage),
    },
    qualityGate: {
      passed,
      reasons: gateReasons,
      minSampleCount: MIN_SAMPLE_COUNT,
      sampleCount: rows.length,
      trainCount: trainRows.length,
      holdoutCount: holdoutRows.length,
      censoredRate: round(censoredRate),
      independentEvents,
      coefficientFinite,
      holdoutRmse: holdoutRmse == null ? null : round(holdoutRmse),
      holdoutCoverage: holdoutCoverage == null ? null : round(holdoutCoverage),
    },
    residualLogScale: passed ? residualLogScale : null,
    status: passed ? 'completed' : rows.length ? 'fallback' : 'insufficient',
    fittedAt: options?.fittedAt ?? '2026-11-02T00:00:00Z',
    appliedToForecast: Boolean(application),
    application,
    parameters,
  };
}

export function learnedForecastOverridesOf(fit: ForecastFitRun): LearnedForecastOverrides | undefined {
  return fit.appliedToForecast && fit.application ? fit.application : undefined;
}
