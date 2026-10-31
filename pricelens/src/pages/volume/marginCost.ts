import { bucketIdOfDate } from '../../components/FilterBar/timeUtils';
import type { SeriesPoint } from '../../dataModel/types';
import { hash01 } from '../../dataModel/volume';

export interface MarginCostPoint {
  bucketId: string;
  monthId: string;
  unitRevenue: number;
  unitCost: number;
  unitMargin: number;
  marginRate: number;
  simulated: true;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function monthOf(point: SeriesPoint): string | null {
  if (!point.anchorDate) return null;
  const date = new Date(point.anchorDate);
  if (Number.isNaN(date.getTime())) return null;
  return bucketIdOfDate(date, 'month');
}

export function marginCostOf(input: {
  modelId: string;
  romram: string;
  countryCode: string;
  points: readonly SeriesPoint[];
  bucketIds: readonly string[];
}): (MarginCostPoint | null)[] {
  const pricesByMonth = new Map<string, number[]>();
  const monthByBucket = new Map<string, string>();
  for (const point of input.points) {
    const monthId = monthOf(point);
    if (!monthId) continue;
    if (!monthByBucket.has(point.bucketId)) monthByBucket.set(point.bucketId, monthId);
    if (point.price != null && Number.isFinite(point.price) && point.price > 0) {
      const list = pricesByMonth.get(monthId) ?? [];
      list.push(point.price);
      pricesByMonth.set(monthId, list);
    }
  }

  const revenueByMonth = new Map<string, number>();
  for (const [monthId, prices] of pricesByMonth) {
    if (prices.length === 0) continue;
    const unitRevenue = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    if (unitRevenue > 0) revenueByMonth.set(monthId, unitRevenue);
  }
  if (revenueByMonth.size === 0) return input.bucketIds.map(() => null);

  const reference = median([...revenueByMonth.values()]);
  const ratio = 0.68 + 0.08 * hash01(`${input.countryCode}|${input.modelId}|${input.romram}`);
  const baseCost = reference * ratio;
  const pointByMonth = new Map<string, MarginCostPoint>();
  [...revenueByMonth.keys()].sort().forEach((monthId, index) => {
    const unitRevenue = revenueByMonth.get(monthId) ?? 0;
    const unitCost = baseCost
      * (1 - Math.min(0.12, index * 0.006))
      * (0.98 + 0.04 * hash01(`${input.countryCode}|${input.modelId}|${input.romram}|${monthId}`));
    const unitMargin = unitRevenue - unitCost;
    pointByMonth.set(monthId, {
      bucketId: monthId,
      monthId,
      unitRevenue,
      unitCost,
      unitMargin,
      marginRate: unitMargin / unitRevenue,
      simulated: true,
    });
  });

  return input.bucketIds.map((bucketId) => {
    const monthId = monthByBucket.get(bucketId);
    if (!monthId) return null;
    return pointByMonth.get(monthId) ?? null;
  });
}

export function marginCostAvailabilityOf(
  isOwn: boolean,
  points: readonly (MarginCostPoint | null)[],
): 'ready' | 'empty' {
  return isOwn && points.some((point) => point != null) ? 'ready' : 'empty';
}
