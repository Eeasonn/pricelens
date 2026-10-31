import type { MarginCostPoint } from './marginCost';

export interface MarginCostDomain {
  min: number;
  max: number;
  zeroRatio: number;
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
