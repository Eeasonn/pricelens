// 因子证据卡的样本文案回归：总体拟合样本与因子可用样本必须明确区分。
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import FactorEvidence from '../FactorEvidence';
import type { FactorProfile } from '../forecastModel';
import type { ForecastFitRun } from '../forecastLearning';

afterEach(cleanup);

const profile: FactorProfile = {
  key: 'price',
  label: '消费者感知价格',
  scope: '需求',
  window: '调价后一周起持续生效',
  shape: '价格阶跃 × 1 周滞后',
  status: '固定先验',
  evidence: '历史调价周（模拟）',
  confidence: '中',
  sampleCount: 8,
  fitWindow: 'W1–W10',
  fallback: true,
};

const fit: ForecastFitRun = {
  fitId: 'fit-test',
  modelId: 'simple-demo-v1',
  schemaVersion: 'forecast-schema-1',
  fitWindow: { start: 'W1', end: 'W10' },
  sampleCount: 7,
  excluded: { censored: 2, confounded: 1, missing: 0 },
  metrics: { mae: null, rmse: null, coverage: null },
  qualityGate: {
    passed: false,
    reasons: ['测试样本不足'],
    minSampleCount: 24,
    sampleCount: 7,
    trainCount: 7,
    holdoutCount: 0,
    censoredRate: 0.2,
    independentEvents: { price: 1, promo: 1, competitor: 1 },
    coefficientFinite: true,
    holdoutRmse: null,
    holdoutCoverage: null,
  },
  residualLogScale: null,
  status: 'fallback',
  fittedAt: '2026-11-02T00:00:00Z',
  appliedToForecast: false,
  application: null,
  parameters: [],
};

describe('FactorEvidence sample wording', () => {
  it('distinguishes overall fit observations from factor-available observations', () => {
    const { container } = render(<FactorEvidence factorProfiles={[profile]} fit={fit} />);
    const text = container.textContent ?? '';
    expect(text).toContain('总体有效样本 7 周');
    expect(text).toContain('因子可用样本 8 周');
    expect(text).not.toContain('可用样本 7 周');
  });
});
