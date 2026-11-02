import type { MarginCostPoint } from './marginCost';

export interface MarginCostDomain {
  min: number;
  max: number;
  zeroRatio: number;
}

/** 分离后的 Y 轴值域：成本和销毛量纲相同但变化范围不同，不能共用一条刻度。 */
export interface MarginAxisDomain { min: number; max: number; zeroRatio: number }

function axisDomain(values: readonly number[]): MarginAxisDomain {
  if (values.length === 0) return { min: 0, max: 1, zeroRatio: 0 };
  let min = Math.min(0, ...values);
  let max = Math.max(1, ...values);
  if (!(max > min)) max = min + 1;
  return { min, max, zeroRatio: (0 - min) / (max - min) };
}

export function costAxisDomainOf(points: readonly Pick<MarginCostPoint, 'unitCost'>[]): MarginAxisDomain {
  return axisDomain(points.map((point) => point.unitCost));
}

export function marginAxisDomainOf(points: readonly Pick<MarginCostPoint, 'unitMargin'>[]): MarginAxisDomain {
  return axisDomain(points.map((point) => point.unitMargin));
}

export function axisTicksOf(domain: Pick<MarginAxisDomain, 'min' | 'max'>): number[] {
  const mid = (domain.min + domain.max) / 2;
  return [...new Set([domain.max, mid, domain.min].map((value) => Math.round(value * 100) / 100))].sort((a, b) => b - a);
}

export function marginCostDomainOf(
  points: readonly Pick<MarginCostPoint, 'unitCost' | 'unitMargin'>[],
): MarginCostDomain {
  if (points.length === 0) return { min: 0, max: 1, zeroRatio: 0 };
  const values = [0];
  for (const point of points) values.push(point.unitCost, point.unitMargin);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!(max > min)) {
    min = Math.min(0, min);
    max = Math.max(1, max, min + 1);
  }
  return { min, max, zeroRatio: (0 - min) / (max - min) };
}

export interface MonthStepSegment {
  monthId: string;
  startIndex: number;
  count: number;
  unitCost: number;
  unitMargin: number;
}

export const MARGIN_BAR_MAX_PX = 18;

/** 销毛柱宽取桶宽的 40%，并封顶，避免宽桶里柱子连成色块。 */
export function marginBarWidth(slotWidth: number): number {
  return Math.min(MARGIN_BAR_MAX_PX, Math.max(1, slotWidth * 0.4));
}

export function marginColumnMarks(
  points: readonly ({ unitMargin: number } | null)[],
): { index: number; unitMargin: number }[] {
  const bars: { index: number; unitMargin: number }[] = [];
  points.forEach((point, index) => {
    if (point) bars.push({ index, unitMargin: point.unitMargin });
  });
  return bars;
}

export function costStepPolyline(
  segments: readonly { startIndex: number; count: number; unitCost: number }[],
  slot: number,
  plotLeft: number,
): { x: number; cost: number }[] {
  const points: { x: number; cost: number }[] = [];
  for (const segment of segments) {
    const x0 = plotLeft + segment.startIndex * slot;
    const x1 = plotLeft + (segment.startIndex + segment.count) * slot;
    points.push({ x: x0, cost: segment.unitCost }, { x: x1, cost: segment.unitCost });
  }
  return points;
}

export function contiguousSegmentRuns<T extends { startIndex: number; count: number }>(segments: readonly T[]): T[][] {
  const runs: T[][] = [];
  for (const segment of segments) {
    const run = runs[runs.length - 1];
    const prev = run?.[run.length - 1];
    if (!run || !prev || prev.startIndex + prev.count !== segment.startIndex) runs.push([segment]);
    else run.push(segment);
  }
  return runs;
}

/** 以零基线为边：正值向上，负值向下，高度不截断。 */
export function signedBarBox(
  value: number,
  yOf: (value: number) => number,
  zeroY: number,
): { y: number; height: number } {
  const y = yOf(value);
  const top = Math.min(y, zeroY);
  return { y: top, height: Math.abs(y - zeroY) };
}

/** 与主图 xPxOf 相同：桶中心的横坐标。 */
export function marginCrossX(geom: { plotLeft: number; plotWidth: number; n: number }, hoverIdx: number): number {
  return geom.plotLeft + (geom.plotWidth / geom.n) * (hoverIdx + 0.5);
}

export function lastValidMarginIndex(points: readonly (unknown | null)[]): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index] != null) return index;
  }
  return null;
}

export interface MarginTipModel {
  kind: 'empty' | 'gap' | 'ready';
  cost?: string;
  margin?: string;
  rate?: string;
}

/** 明细卡里的成本销毛。竞品整段无数据是 empty；悬停到空桶是 gap，不借用别的月。 */
export function marginTipModel(input: {
  unavailable: boolean;
  point: { unitCost: number; unitMargin: number; marginRate: number } | null;
  formatMoney: (value: number) => string;
}): MarginTipModel {
  if (input.unavailable) return { kind: 'empty' };
  if (!input.point) return { kind: 'gap' };
  return {
    kind: 'ready',
    cost: input.formatMoney(input.point.unitCost),
    margin: input.formatMoney(input.point.unitMargin),
    rate: `${(input.point.marginRate * 100).toFixed(1)}%`,
  };
}

/** 悬停时竖线跟着手；移出后竖线回到最后一个有效点。 */
export function marginFocusIndex(count: number, hoverIdx: number | null, lastValid: number | null): number | null {
  if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < count) return hoverIdx;
  return lastValid;
}

/** 上限、中值、下限。负值区间额外保留 0，避免零基线没有刻度。 */
export function marginAxisTicks(domain: { min: number; max: number }): number[] {
  const mid = (domain.min + domain.max) / 2;
  const values = [domain.max, mid, domain.min];
  if (domain.min < 0 && domain.max > 0) values.push(0);
  const unique = [...new Set(values.map((value) => Math.round(value * 1000) / 1000))];
  unique.sort((a, b) => b - a);
  return unique;
}

export function monthStepSegmentsOf(
  points: readonly Pick<MarginCostPoint, 'monthId' | 'unitCost' | 'unitMargin'>[],
): MonthStepSegment[] {
  const segments: MonthStepSegment[] = [];
  points.forEach((point, index) => {
    const last = segments[segments.length - 1];
    if (last && last.monthId === point.monthId) {
      last.count += 1;
      return;
    }
    segments.push({
      monthId: point.monthId,
      startIndex: index,
      count: 1,
      unitCost: point.unitCost,
      unitMargin: point.unitMargin,
    });
  });
  return segments;
}
