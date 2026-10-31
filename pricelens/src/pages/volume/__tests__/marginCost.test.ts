import { describe, expect, it } from 'vitest';
import type { SeriesPoint } from '../../../dataModel/types';
import { marginCostAvailabilityOf, marginCostOf } from '../marginCost';

const point = (bucketId: string, anchorDate: string, price: number | null): SeriesPoint => ({
  bucketId, anchorDate, xLabel: bucketId, price, rrp: null,
  missing: price == null, offer: null, url: '', shopName: null,
});
const full = [
  point('202609', '2026-09-02', 1000),
  point('202610', '2026-09-09', 900),
  point('202611', '2026-09-16', 800),
  point('202612', '2026-09-23', null),
  point('202613', '2026-09-30', 1000),
  point('202614', '2026-10-07', 1100),
];
const input = { modelId: 'own-a', romram: '12+256 GB', countryCode: 'RU', points: full };

describe('marginCostOf', () => {
  it('满足销毛恒等式且所有点带模拟标识', () => {
    const rows = marginCostOf({ ...input, bucketIds: full.map((p) => p.bucketId) });
    for (const row of rows) {
      if (!row) continue;
      expect(row.unitMargin).toBeCloseTo(row.unitRevenue - row.unitCost, 8);
      expect(row.marginRate).toBeCloseTo(row.unitMargin / row.unitRevenue, 8);
      expect(row.simulated).toBe(true);
    }
  });

  it('同月形成平台且改变查看窗口不改变该月成本', () => {
    const all = marginCostOf({ ...input, bucketIds: full.map((p) => p.bucketId) });
    const sliced = marginCostOf({ ...input, bucketIds: ['202611', '202612', '202613'] });
    expect(all[2]?.unitCost).toBe(sliced[0]?.unitCost);
    expect(all[2]?.unitCost).toBe(all[3]?.unitCost);
    expect(all[2]?.unitCost).toBe(all[4]?.unitCost);
  });

  it('无有效价格的月份返回 null', () => {
    const rows = marginCostOf({ ...input, points: [point('202612', '2026-09-23', null)], bucketIds: ['202612'] });
    expect(rows).toEqual([null]);
  });

  it('收入低于成本时允许负销毛并保留零基线所需数值', () => {
    const crash = full.map((p, i) => i === full.length - 1 ? point(p.bucketId, p.anchorDate, 1) : p);
    const rows = marginCostOf({ ...input, points: crash, bucketIds: ['202614'] });
    expect(rows[0]?.unitMargin).toBeLessThan(0);
  });

  it('友商或全空序列显示空态，我方有效点为可展示', () => {
    expect(marginCostAvailabilityOf(false, [])).toBe('empty');
    expect(marginCostAvailabilityOf(true, [null])).toBe('empty');
    const rows = marginCostOf({ ...input, bucketIds: ['202614'] });
    expect(marginCostAvailabilityOf(true, rows)).toBe('ready');
  });
});
