import { describe, expect, it } from 'vitest';
import { buildSmoothPriceSegments, type SmoothPricePathPoint } from '../smoothPricePaths';

const point = (x: number, y: number | null, missing = false): SmoothPricePathPoint => ({ x, y, missing });

const startSlope = (segment: ReturnType<typeof buildSmoothPriceSegments>[number]): number =>
  (segment.c1.y - segment.p0.y) / (segment.c1.x - segment.p0.x);
const endSlope = (segment: ReturnType<typeof buildSmoothPriceSegments>[number]): number =>
  (segment.p1.y - segment.c2.y) / (segment.p1.x - segment.c2.x);

describe('buildSmoothPriceSegments（共享控制点的完整价格轨迹）', () => {
  it('缺采段是一条完整曲线，不按缺采周增加水平锚点', () => {
    const segments = buildSmoothPriceSegments([
      point(0, 100),
      point(10, null, true),
      point(20, null, true),
      point(30, null, true),
      point(40, 120),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].from).toBe(0);
    expect(segments[0].to).toBe(4);
    expect(segments[0].bridge).toBe(true);
    expect(segments[0].d.match(/C /g)).toHaveLength(1);
  });

  it('实线到虚线再到实线：每个接头共享同一切线', () => {
    const segments = buildSmoothPriceSegments([
      point(0, 100),
      point(10, 110),
      point(20, null, true),
      point(30, null, true),
      point(40, 115),
      point(50, 120),
    ]);
    expect(segments.map((s) => [s.from, s.to, s.bridge])).toEqual([
      [0, 1, false],
      [1, 4, true],
      [4, 5, false],
    ]);
    expect(endSlope(segments[0])).toBeCloseTo(startSlope(segments[1]), 10);
    expect(endSlope(segments[1])).toBeCloseTo(startSlope(segments[2]), 10);
  });

  it('局部极值两侧共享零切线，不形成尖角', () => {
    const segments = buildSmoothPriceSegments([
      point(0, 100),
      point(10, 110),
      point(20, null, true),
      point(30, 105),
      point(40, 115),
    ]);
    expect(endSlope(segments[0])).toBeCloseTo(0, 10);
    expect(startSlope(segments[1])).toBeCloseTo(0, 10);
    expect(endSlope(segments[1])).toBeCloseTo(0, 10);
    expect(startSlope(segments[2])).toBeCloseTo(0, 10);
  });

  it('非缺采的空值或隔离点仍切断轨迹，不用虚线跨过', () => {
    const segments = buildSmoothPriceSegments([
      point(0, 100),
      point(10, null, false),
      point(20, 120),
    ]);
    expect(segments).toEqual([]);
  });
});
