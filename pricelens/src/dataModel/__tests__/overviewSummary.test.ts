import { describe, expect, it } from 'vitest';
import { buildOverviewMatrix } from '../aggregate';
import type { AlertItem } from '../alerts';
import { buildOverviewSummary, summarizeCompetitors } from '../overviewSummary';

describe('总览产业摘要', () => {
  const bands = buildOverviewMatrix('usd');

  it('统计我司型号、ROM 对标覆盖、深折扣 ROM 和最新已订阅预警', () => {
    const alerts = [
      { key: 'old', weekId: '202640' },
      { key: 'new-1', weekId: '202641' },
      { key: 'new-2', weekId: '202641' },
    ] as AlertItem[];
    const summary = buildOverviewSummary(bands, alerts);
    expect(summary.ownModels).toBe(14);
    expect(summary.mappingPct).toBeCloseTo(summary.mappedRoms / summary.ownRoms, 12);
    expect(summary.deepDiscountRoms).toBe(
      bands.flatMap((b) => b.models).filter((m) => m.isOwn).flatMap((m) => m.rows)
        .filter((r) => r.discountPct != null && r.discountPct <= -0.15).length,
    );
    expect(summary.latestAlertWeek).toBe('202641');
    expect(summary.latestAlertCount).toBe(2);
    expect(summary.alertTitle).toContain('已订阅产品');
  });

  it('空矩阵与空预警返回零值，且不把零预警表述为全产业无风险', () => {
    const summary = buildOverviewSummary([], []);
    expect(summary).toMatchObject({
      ownModels: 0,
      ownRoms: 0,
      mappedRoms: 0,
      mappingPct: 0,
      deepDiscountRoms: 0,
      latestAlertWeek: null,
      latestAlertCount: 0,
    });
    expect(summary.alertTitle).toContain('已订阅产品');
    expect(summary.alertTitle).not.toContain('全产业无风险');
  });
});

describe('总览竞品摘要', () => {
  const bands = buildOverviewMatrix('usd');

  it('按价差方向返回原始价差区间', () => {
    const pura = bands[1].models.find((m) => m.modelId === 'own-pura-90s-pro')!;
    const row = pura.rows.find((r) => r.romram.startsWith('12+256'))!;
    const comps = pura.comps.filter((c) => c.ownRomrams.includes(row.romram));
    const compSummary = summarizeCompetitors(row.price, comps, 'comp');
    const expectedDiffs = comps.map((c) => (c.price! - row.price!) / row.price!);
    expect(compSummary.count).toBe(comps.length);
    expect(compSummary.minDiff).toBeCloseTo(Math.min(...expectedDiffs), 12);
    expect(compSummary.maxDiff).toBeCloseTo(Math.max(...expectedDiffs), 12);
    const ownSummary = summarizeCompetitors(row.price, comps, 'own');
    expect(ownSummary.minDiff).toBeCloseTo(Math.min(...comps.map((c) => (row.price! - c.price!) / c.price!)), 12);
  });

  it('空竞品价格只从价格与价差区间排除，并在我司价格为空时保留价格区间、留空价差', () => {
    const comps = [{ price: 80 }, { price: null }, { price: 120 }];
    const summary = summarizeCompetitors(100, comps, 'comp');
    expect(summary.count).toBe(comps.length);
    expect(summary.minPrice).toBe(80);
    expect(summary.maxPrice).toBe(120);
    expect(summary.minDiff).toBeCloseTo(-0.2, 12);
    expect(summary.maxDiff).toBeCloseTo(0.2, 12);

    const ownSummary = summarizeCompetitors(100, comps, 'own');
    expect(ownSummary.minDiff).toBeCloseTo(-1 / 6, 12);
    expect(ownSummary.maxDiff).toBeCloseTo(0.25, 12);

    expect(summarizeCompetitors(null, [{ price: 80 }], 'comp')).toEqual({
      count: 1,
      minPrice: 80,
      maxPrice: 80,
      minDiff: null,
      maxDiff: null,
    });
    expect(summarizeCompetitors(null, [{ price: null }], 'comp')).toEqual({
      count: 1,
      minPrice: null,
      maxPrice: null,
      minDiff: null,
      maxDiff: null,
    });
  });
});
