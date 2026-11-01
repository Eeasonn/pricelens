// 区间极差：只描述当前选择区间内折后价与销量的最高、最低。
// 不跨产品汇总，不把极差解释成涨跌方向。
// 数值的文字组合在 spreadCards 里做；本文件只负责找极值与换算下标。

const isFiniteNumber = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

export function pricePointValid(v: number | null | undefined): v is number {
  return isFiniteNumber(v) && v > 0;
}

/** 0 是有效销量；null 与非有限值不是 */
export function volumePointValid(v: number | null | undefined): v is number {
  return isFiniteNumber(v);
}

export interface RangeExtremePoint {
  index: number;
  value: number;
}

export interface RangeSpread {
  validCount: number;
  min: RangeExtremePoint | null;
  max: RangeExtremePoint | null;
  spread: number | null;
  /** 百分比。最低值为 0 或没有有效点时为 null */
  rate: number | null;
  samePoint: boolean;
}

/** 区间内最早的最高点与最早的最低点。并列时不改用更晚的点。 */
export function rangeSpreadOf(
  values: readonly (number | null | undefined)[],
  valid: (v: number | null | undefined) => v is number,
): RangeSpread {
  let min: RangeExtremePoint | null = null;
  let max: RangeExtremePoint | null = null;
  let validCount = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!valid(value)) continue;
    validCount += 1;
    if (!min || value < min.value) min = { index, value };
    if (!max || value > max.value) max = { index, value };
  }
  if (!min || !max) {
    return { validCount: 0, min: null, max: null, spread: null, rate: null, samePoint: false };
  }
  const spread = max.value - min.value;
  return {
    validCount,
    min,
    max,
    spread,
    rate: min.value > 0 ? (spread / min.value) * 100 : null,
    samePoint: min.index === max.index,
  };
}

export interface RangeBand {
  /** 选择区间在当前视图中的起止桶，含两端。填充只铺这段，不向选区外延伸。 */
  startIndex: number;
  endIndex: number;
  high: number;
  low: number;
  /** 最高＝最低：只画一条细线，不做有高度的填充。 */
  flat: boolean;
  dots: { index: number; value: number }[];
}

/** 选择区间的上下界。下标已换成当前视图桶下标。 */
export function rangeBandInView(
  values: readonly (number | null | undefined)[],
  selStart: number,
  selEnd: number,
  viewStart: number,
  valid: (v: number | null | undefined) => v is number,
): RangeBand | null {
  const start = Math.max(0, Math.min(selStart, selEnd));
  const end = Math.max(selStart, selEnd);
  const spread = rangeSpreadOf(values.slice(start, end + 1), valid);
  if (!spread.min || !spread.max || spread.spread == null) return null;
  const offset = start - viewStart;
  const dots = spread.min.index === spread.max.index
    ? [{ index: spread.min.index + offset, value: spread.min.value }]
    : [
      { index: spread.max.index + offset, value: spread.max.value },
      { index: spread.min.index + offset, value: spread.min.value },
    ];
  return {
    startIndex: offset,
    endIndex: end - viewStart,
    high: spread.max.value,
    low: spread.min.value,
    flat: spread.spread === 0,
    dots,
  };
}

/** 区间带的横向范围：从选择起点的桶左缘到终点的桶右缘。 */
export function rangeBandFrame(
  plotLeft: number,
  plotWidth: number,
  n: number,
  startIndex: number,
  endIndex: number,
): { x: number; width: number } {
  if (n <= 0 || plotWidth <= 0) return { x: plotLeft, width: 0 };
  const slot = plotWidth / n;
  const start = Math.max(0, Math.min(Math.min(startIndex, endIndex), n - 1));
  const end = Math.max(0, Math.min(Math.max(startIndex, endIndex), n - 1));
  return { x: plotLeft + start * slot, width: (end - start + 1) * slot };
}

/**
 * 将图内拖选返回的“当前查看窗口内下标”还原为全量时间桶下标。
 * 图表本身只渲染查看窗口切片，摘要与极值使用完整序列上的同一区间。
 */
export function resolveSelectedWindow(
  viewStart: number,
  viewEnd: number,
  brush: readonly [number, number] | null | undefined,
): [number, number] {
  const lo = Math.min(viewStart, viewEnd);
  const hi = Math.max(viewStart, viewEnd);
  if (!brush) return [lo, hi];
  const brushLo = Math.min(brush[0], brush[1]);
  const brushHi = Math.max(brush[0], brush[1]);
  const clamp = (value: number): number => Math.min(hi, Math.max(lo, value));
  return [clamp(lo + brushLo), clamp(lo + brushHi)];
}

/** 与极值同一量级：任一侧达到 1 万则全部用「万」，否则千分位 */
export function formatVolumeAmount(n: number, wan: boolean): string {
  const negative = n < 0;
  const abs = Math.abs(n);
  const body = wan
    ? `${(abs / 10000).toFixed(1).replace(/\.0$/, '')}万`
    : Math.round(abs).toLocaleString('en-US');
  return negative ? `−${body}` : body;
}
