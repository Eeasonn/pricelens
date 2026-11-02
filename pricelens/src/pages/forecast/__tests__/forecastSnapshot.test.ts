import { describe, expect, it } from 'vitest';
import { forecastFixture } from '../forecastFixture';
import { simpleFullDataset } from '../forecastDatasetRegistry';
import { createForecastSnapshot, FORECAST_SCHEMA_VERSION } from '../forecastSnapshot';

describe('forecast snapshot contract', () => {
  it('keeps history, forecast, fit and competitor uncertainty in one deterministic snapshot', () => {
    const first = createForecastSnapshot(forecastFixture, undefined, 'ctx-seeded', 'attempt-seeded');
    const second = createForecastSnapshot(forecastFixture, undefined, 'ctx-seeded', 'attempt-seeded');

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe(FORECAST_SCHEMA_VERSION);
    expect(first.historyWeeks.every((week) => week.source === 'observed')).toBe(true);
    expect(first.forecastWeeks.every((week) => week.source === 'forecast')).toBe(true);
    expect(first.fit.status).toBe('fallback');
    expect(first.learnedParameters).toEqual(first.fit.parameters);
    expect(first.competitorEvents[0]?.marketEffect).toBe('unknown');
    expect(first.competitorEvents.some((event) => event.kind === 'pulse' && event.label === '竞品促销')).toBe(true);
    expect(first.scope.industry).toBe('phone');
    expect(first.contextFingerprint).toBe('ctx-seeded');
  });

  it('changes the snapshot identity when scenario inputs change', () => {
    const baseline = createForecastSnapshot(forecastFixture, undefined, 'ctx-seeded', 'attempt-seeded');
    const scenario = createForecastSnapshot(forecastFixture, { priceDeltaPct: -5, promoDeltaPct: 0, supplyDeltaPct: 0 }, 'ctx-seeded', 'attempt-seeded');
    expect(scenario.snapshotId).not.toBe(baseline.snapshotId);
    expect(scenario.forecastWeeks.some((week) => week.draft)).toBe(true);
  });

  it('applies only a quality-gated fit and exposes calibrated future quantiles', () => {
    const snapshot = createForecastSnapshot(simpleFullDataset, undefined, 'ctx-full', 'attempt-full');
    expect(snapshot.fitAppliedToForecast).toBe(true);
    expect(snapshot.fit.qualityGate.passed).toBe(true);
    expect(snapshot.computation.modelEvidence).toEqual({ learned: true, intervalCalibrated: true, parameterSource: 'learned' });
    const intervalWeeks = snapshot.forecastWeeks.filter((week) => week.forecastP10 != null && week.forecastP50 != null && week.forecastP90 != null);
    expect(intervalWeeks.length).toBe(simpleFullDataset.weeks.length - simpleFullDataset.params.currentWeekIndex - 1);
    expect(intervalWeeks.every((week) => (week.forecastP10 as number) <= (week.forecastP50 as number) && (week.forecastP50 as number) <= (week.forecastP90 as number))).toBe(true);
    const driverTotal = snapshot.computation.drivers.reduce((total, driver) => total + driver.value, 0);
    expect(driverTotal).toBe(snapshot.current.so);
    expect(snapshot.computation.drivers.filter((driver) => driver.key !== 'supply').reduce((total, driver) => total + driver.value, 0)).toBe(snapshot.current.unconstrainedDemand);
    expect(snapshot.competitorEvents.filter((event) => event.kind === 'launch').every((event) => event.marketClassification.candidates.includes('expansion') && event.marketClassification.candidates.includes('substitution'))).toBe(true);
  });
});
