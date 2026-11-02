import { describe, expect, it } from 'vitest';
import { createForecastSnapshot } from '../forecastSnapshot';
import { simpleDemoDataset, simpleFullDataset } from '../forecastDatasetRegistry';
import { COMPLEX_MODEL_MANIFEST, createForecastModelPack, modelPackFingerprint, serializeForecastModelPack, validateForecastModelPack } from '../forecastModelPack';

describe('forecast model pack persistence contract', () => {
  it('stores manifest, fit, learned parameters, snapshot and event effects together', () => {
    const snapshot = createForecastSnapshot(simpleDemoDataset);
    const pack = createForecastModelPack(simpleDemoDataset, snapshot);
    expect(validateForecastModelPack(pack)).toEqual([]);
    expect(pack.manifest.modelId).toBe('simple-demo-v1');
    expect(pack.manifest.modelMode).toBe('simple');
    expect(pack.fitRuns[0]?.fitId).toBe(snapshot.fit.fitId);
    expect(pack.learnedParameters).toHaveLength(snapshot.learnedParameters.length);
    expect(pack.forecastSnapshots[0]?.snapshotId).toBe(snapshot.snapshotId);
    expect(pack.eventEffects.some((event) => event.marketEffect === 'unknown')).toBe(true);
    expect(serializeForecastModelPack(pack)).toContain('"schemaVersion"');
    expect(modelPackFingerprint(pack)).toMatch(/^mp-[0-9a-f]{8}$/);
  });

  it('keeps complex-v1 as a separate schema with market-size fields', () => {
    expect(COMPLEX_MODEL_MANIFEST.modelMode).toBe('complex');
    expect(COMPLEX_MODEL_MANIFEST.factorSet).toContain('marketSize');
    expect(COMPLEX_MODEL_MANIFEST.outputSet).toContain('expansion_rate');
  });

  it('marks intervals calibrated only when the fit was actually applied', () => {
    const fallbackPack = createForecastModelPack(simpleDemoDataset, createForecastSnapshot(simpleDemoDataset));
    const learnedPack = createForecastModelPack(simpleFullDataset, createForecastSnapshot(simpleFullDataset));
    expect(fallbackPack.assumptions.intervalStatus).toBe('uncalibrated');
    expect(learnedPack.assumptions.intervalStatus).toBe('calibrated');
  });

  it('rejects a simple pack that silently introduces market-size factors', () => {
    const pack = createForecastModelPack(simpleDemoDataset, createForecastSnapshot(simpleDemoDataset));
    pack.manifest.factorSet = [...pack.manifest.factorSet, 'marketSize'];
    expect(validateForecastModelPack(pack)).toContain('simple 模型不能携带 marketSize 因子');
  });
});
