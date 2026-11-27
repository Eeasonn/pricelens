import { describe, expect, it } from 'vitest';
import { forecastFixture } from '../forecastFixture';
import { fitForecastFactors } from '../forecastLearning';
import { simpleFullDataset } from '../forecastDatasetRegistry';

describe('forecast finite factor fitting', () => {
  it('keeps the demo prior when history is too short or censored', () => {
    const result = fitForecastFactors(forecastFixture, { fittedAt: '2026-11-02T00:00:00Z' });
    expect(result.status).toBe('fallback');
    expect(result.parameters.every((parameter) => parameter.fallback)).toBe(true);
    expect(result.excluded.censored).toBe(2);
    expect(result.parameters.find((parameter) => parameter.factor === 'price')?.coefficient).toBe(-1.7);
  });

  it('is deterministic for the same dataset and fit metadata', () => {
    const a = fitForecastFactors(forecastFixture, { fitId: 'fit-seeded', fittedAt: '2026-11-02T00:00:00Z' });
    const b = fitForecastFactors(forecastFixture, { fitId: 'fit-seeded', fittedAt: '2026-11-02T00:00:00Z' });
    expect(a).toEqual(b);
  });

  it('can graduate from prior fallback on the full adapter-shaped history', () => {
    const result = fitForecastFactors(simpleFullDataset, { fitId: 'fit-full-seeded', fittedAt: '2026-11-02T00:00:00Z' });
    expect(result.status).toBe('completed');
    expect(result.sampleCount).toBeGreaterThanOrEqual(12);
    expect(result.parameters.every((parameter) => !parameter.fallback)).toBe(true);
    expect(result.appliedToForecast).toBe(true);
    expect(result.qualityGate.passed).toBe(true);
    expect(result.application).toEqual(expect.objectContaining({
      baselineLogMultiplier: expect.closeTo(0.018, 3),
      priceElasticity: expect.closeTo(-1.55, 1),
      promoLogCoefficient: expect.closeTo(1.08, 1),
      competitorLogCoefficient: expect.closeTo(0.92, 1),
    }));
    expect(result.residualLogScale).toBeGreaterThan(0);
  });

  it('uses the same one-week effective price lag as the forecast model when the adapter omits effectivePrice', () => {
    const withExplicitLag = {
      ...simpleFullDataset,
      weeks: simpleFullDataset.weeks.map((week, index) => ({
        ...week,
        effectivePrice: simpleFullDataset.weeks[Math.max(0, index - 1)]?.price ?? week.price,
      })),
    };
    expect(fitForecastFactors(simpleFullDataset, { fitId: 'fit-lag', fittedAt: '2026-11-02T00:00:00Z' })).toEqual(
      fitForecastFactors(withExplicitLag, { fitId: 'fit-lag', fittedAt: '2026-11-02T00:00:00Z' }),
    );
  });

  it('requires independent competitor events instead of merely affected weeks', () => {
    const oneLaunch = {
      ...simpleFullDataset,
      competitorLaunches: [simpleFullDataset.competitorLaunches[0]],
      competitorPulses: [],
    };
    expect(fitForecastFactors(oneLaunch, { fitId: 'fit-one-event', fittedAt: '2026-11-02T00:00:00Z' }).status).toBe('fallback');
  });
});
