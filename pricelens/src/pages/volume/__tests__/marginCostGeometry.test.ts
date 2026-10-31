import { describe, expect, it } from 'vitest';
import {
  contiguousSegmentRuns,
  costStepPolyline,
  lastValidMarginIndex,
  marginAxisTicks,
  marginBarWidth,
  marginColumnMarks,
  marginCostDomainOf,
  marginCrossX,
  marginFocusIndex,
  marginReadoutIndex,
  monthStepSegmentsOf,
  signedBarBox,
} from '../marginCostGeometry';

describe('margin cost geometry', () => {
  it('负销毛包含零基线且不把负值截掉', () => {
    const domain = marginCostDomainOf([
      { unitCost: 100, unitMargin: -20 },
      { unitCost: 120, unitMargin: 40 },
    ]);
    expect(domain.min).toBeLessThanOrEqual(-20);
    expect(domain.max).toBeGreaterThanOrEqual(120);
    expect(domain.zeroRatio).toBeGreaterThan(0);
    expect(domain.zeroRatio).toBeLessThan(1);
  });

  it('同月只画平台，跨月才产生垂直跳变', () => {
    const segments = monthStepSegmentsOf([
      { monthId: '202609', unitCost: 100, unitMargin: 20 },
      { monthId: '202609', unitCost: 100, unitMargin: 20 },
      { monthId: '202610', unitCost: 90, unitMargin: 30 },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0].count).toBe(2);
    expect(segments[1].count).toBe(1);
  });

  it('销毛柱宽为桶宽的 40%，过宽时封顶，柱间留出空隙', () => {
    expect(marginBarWidth(40)).toBe(16);
    expect(marginBarWidth(40) / 40).toBeGreaterThanOrEqual(0.35);
    expect(marginBarWidth(40) / 40).toBeLessThanOrEqual(0.45);
    expect(marginBarWidth(100)).toBe(18);
    expect(40 - marginBarWidth(40)).toBeGreaterThan(marginBarWidth(40) * 0.5);
  });

  it('每个时间桶一根销毛柱，不把整月画成连续矩形', () => {
    expect(marginColumnMarks([
      { unitMargin: 10 },
      { unitMargin: 10 },
      null,
      { unitMargin: -5 },
    ]).map((bar) => bar.index)).toEqual([0, 1, 3]);
  });

  it('成本线只在月份变化处垂直跳变', () => {
    const points = costStepPolyline([
      { startIndex: 0, count: 2, unitCost: 100 },
      { startIndex: 2, count: 1, unitCost: 80 },
    ], 10, 4);
    expect(points.map((point) => point.cost)).toEqual([100, 100, 80, 80]);
    expect(points[1].x).toBe(points[2].x);
    expect(points[0].x).toBe(4);
    expect(points[1].x).toBe(24);
  });

  it('缺月的两段成本线断开，不跨空桶连线', () => {
    const runs = contiguousSegmentRuns([
      { startIndex: 0, count: 2 },
      { startIndex: 4, count: 1 },
    ]);
    expect(runs).toHaveLength(2);
  });

  it('crossX 落在 hoverIdx 对应桶的中心', () => {
    expect(marginCrossX({ plotLeft: 8, plotWidth: 240, n: 4 }, 0)).toBe(38);
    expect(marginCrossX({ plotLeft: 8, plotWidth: 240, n: 4 }, 3)).toBe(218);
  });

  it('未悬停时读数回到最后一个有效点，悬停空桶不借用别的点', () => {
    const points = [null, { id: 1 }, null, { id: 2 }, null];
    expect(lastValidMarginIndex(points)).toBe(3);
    expect(marginReadoutIndex(points, null)).toBe(3);
    expect(marginReadoutIndex(points, 1)).toBe(1);
    expect(marginReadoutIndex(points, 2)).toBeNull();
    expect(marginFocusIndex(points.length, null, 3)).toBe(3);
    expect(marginFocusIndex(points.length, 2, 3)).toBe(2);
  });

  it('纵轴至少三档，负值区间必须包含 0', () => {
    expect(marginAxisTicks({ min: 0, max: 1000 })).toEqual([1000, 500, 0]);
    const negative = marginAxisTicks({ min: -200, max: 1000 });
    expect(negative[0]).toBe(1000);
    expect(negative[negative.length - 1]).toBe(-200);
    expect(negative).toContain(0);
  });

  it('空序列没有有效点，单点域仍包含 0', () => {
    expect(lastValidMarginIndex([null, null])).toBeNull();
    expect(marginReadoutIndex([null], null)).toBeNull();
    const domain = marginCostDomainOf([{ unitCost: 80, unitMargin: 20 }]);
    expect(domain.min).toBeLessThanOrEqual(0);
    expect(domain.max).toBeGreaterThanOrEqual(80);
    expect(marginAxisTicks(domain)).toContain(0);
    expect(marginAxisTicks(domain).length).toBeGreaterThanOrEqual(3);
  });

  it('负销毛柱从零基线向下，正销毛柱向上', () => {
    const yOf = (value: number) => 50 - value;
    const below = signedBarBox(-20, yOf, yOf(0));
    expect(below.y).toBe(50);
    expect(below.y + below.height).toBe(70);
    const above = signedBarBox(30, yOf, yOf(0));
    expect(above.y).toBe(20);
    expect(above.y + above.height).toBe(50);
  });
});
