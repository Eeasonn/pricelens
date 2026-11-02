import { describe, expect, it } from 'vitest';
import {
  DEMO_FORECAST_PROVENANCE,
  DEMO_INTELLIGENCE_PROVENANCE,
  REAL_ALERT_PROVENANCE,
  errorProvenance,
  freshnessLabel,
  missingProvenance,
  provenanceSummary,
} from '../provenance';

describe('shared source / freshness contract', () => {
  it('keeps source, data status, as-of and refresh metadata explicit', () => {
    expect(DEMO_FORECAST_PROVENANCE).toMatchObject({
      dataStatus: 'simulated',
      source: { kind: 'demo_seed', id: 'forecast-demo-seed' },
      asOf: 'W10',
      freshness: 'unknown',
    });
    expect(REAL_ALERT_PROVENANCE).toMatchObject({
      dataStatus: 'real',
      source: { kind: 'internal_fact' },
      asOf: '2026-W42',
      freshness: 'stale',
    });
    expect(DEMO_INTELLIGENCE_PROVENANCE.asOf).toBe('2026-10-30');
    expect(provenanceSummary(DEMO_FORECAST_PROVENANCE)).toContain('截至 W10');
  });

  it('represents missing and error states without inventing an as-of value', () => {
    const source = { id: 'test', label: '测试源', kind: 'adapter' as const };
    expect(missingProvenance(source, '尚未采集')).toMatchObject({ freshness: 'missing', asOf: null });
    expect(errorProvenance(source, '读取失败')).toMatchObject({ freshness: 'error', asOf: null });
    expect(freshnessLabel.error).toBe('读取失败');
  });
});
