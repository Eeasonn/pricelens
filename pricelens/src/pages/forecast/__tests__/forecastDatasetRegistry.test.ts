import { describe, expect, it } from 'vitest';
import {
  createForecastDatasetAdapter,
  createSimpleFullFixture,
  resolveForecastDataset,
  simpleFullDataset,
  validateForecastDataset,
} from '../forecastDatasetRegistry';

describe('forecast dataset registry', () => {
  it('resolves the canonical simple demo fixture by default', () => {
    const result = resolveForecastDataset();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.modelId).toBe('simple-demo-v1');
    expect(result.dataset.meta.modelVersion).toBe('simple-demo-v1');
    expect(result.dataset.weeks).toHaveLength(24);
  });

  it('builds a deterministic 104-history + 8-forecast full fixture', () => {
    const again = createSimpleFullFixture();
    expect(simpleFullDataset).toEqual(again);
    expect(simpleFullDataset.meta.modelVersion).toBe('simple-full-v1');
    expect(simpleFullDataset.meta.currency).toBe('RUB');
    expect(simpleFullDataset.context.country).toBe('RU');
    expect(simpleFullDataset.weeks).toHaveLength(112);
    expect(simpleFullDataset.weeks.slice(0, 104).every((week) => week.status === 'actual' && week.observedSO != null)).toBe(true);
    expect(simpleFullDataset.weeks.slice(104).every((week) => week.status === 'forecast' && week.observedSO == null)).toBe(true);
  });

  it('returns an explicit empty state for an unknown model or scope', () => {
    const unknownModel = resolveForecastDataset({ modelId: 'complex-v9' });
    expect(unknownModel).toMatchObject({ status: 'empty', reason: 'unknown_model' });
    const unknownScope = resolveForecastDataset({
      modelId: 'simple-demo-v1',
      scope: { country: 'CN', channel: '直营电商' },
    });
    expect(unknownScope).toMatchObject({ status: 'empty', reason: 'scope_not_found' });
  });

  it('rejects empty and out-of-range model packs before the UI renders them', () => {
    const empty = validateForecastDataset({ ...simpleFullDataset, weeks: [] });
    expect(empty).toContain('没有可展示的周度数据');
    const outOfRange = validateForecastDataset({ ...simpleFullDataset, params: { ...simpleFullDataset.params, currentWeekIndex: 999 } });
    expect(outOfRange).toContain('当前周索引无效');
  });

  it('exposes ready, empty and error adapter states with provenance', async () => {
    const adapter = createForecastDatasetAdapter();
    const ready = await adapter.load({ modelId: 'simple-demo-v1' });
    expect(ready.state).toBe('ready');
    expect(ready.provenance.source.id).toBe('forecast-demo-seed');
    const empty = await adapter.load({ modelId: 'missing-model' });
    expect(empty.state).toBe('empty');
    if (empty.state === 'empty') expect(empty.reason).toBe('not_configured');
    const outOfScope = await adapter.load({ modelId: 'simple-demo-v1', scope: { country: 'CN' } });
    expect(outOfScope.state).toBe('empty');
    if (outOfScope.state === 'empty') expect(outOfScope.reason).toBe('out_of_scope');
    const broken = createForecastDatasetAdapter({
      broken: { ...simpleFullDataset, weeks: [], meta: { ...simpleFullDataset.meta, modelVersion: 'broken' } },
    });
    const error = await broken.load({ modelId: 'broken' });
    expect(error.state).toBe('error');
    if (error.state === 'error') expect(error.error.code).toBe('FORECAST_DATASET_INVALID');
  });
});

