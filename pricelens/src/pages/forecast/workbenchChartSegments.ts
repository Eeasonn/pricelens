// ============================================================
// 推演工作台 v2 图表通用几何纯函数（WP5 · 主图 / 成本图共用）
// 缺数段几何：连续有值段（实线）+ 缺失跨接段（虚线），缺数不造点；
// 预测起点从周状态派生（禁写死下标）；轴刻度由数据域生成（禁固定轴）。
// 全部为纯函数：不读时间、不用随机数、不依赖 DOM。
// ============================================================

/** 折线段：连续有值段渲染为实线，缺失跨接段渲染为虚线（两端为真实点）。 */
export interface WorkbenchLineSegment {
  /** 源数组下标区间 [from, to]（含两端）。 */
  from: number;
  to: number;
  /** true = 跨缺段：两端有值、中间缺数；false = 连续有值段。 */
  bridging: boolean;
}

const hasValue = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value);

/**
 * 把 `(number | null | undefined)[]` 切成可绘制段：
 * - 连续有值段（bridging=false）：全部下标有值；单点段（from === to）保留，
 *   渲染层可画点或跳过（path 只有 M，无 L）。
 * - 缺失跨接段（bridging=true）：相邻两个有值段之间直连两端真实点，
 *   中间缺失下标不产出任何点（缺数不造 0、不造插值）。
 * 首尾缺数只截断实段，不产生跨缺段（缺口贴边无可跨）。
 */
export function buildLineSegments(values: ReadonlyArray<number | null | undefined>): WorkbenchLineSegment[] {
  const segments: WorkbenchLineSegment[] = [];
  let runStart = -1;
  let lastRunEnd = -1;
  for (let index = 0; index < values.length; index += 1) {
    if (hasValue(values[index])) {
      if (runStart < 0) {
        if (lastRunEnd >= 0) segments.push({ from: lastRunEnd, to: index, bridging: true });
        runStart = index;
      }
    } else if (runStart >= 0) {
      segments.push({ from: runStart, to: index - 1, bridging: false });
      lastRunEnd = index - 1;
      runStart = -1;
    }
  }
  if (runStart >= 0) segments.push({ from: runStart, to: values.length - 1, bridging: false });
  return segments;
}

/**
 * 段 → SVG path d（1 位小数）。连续段 = M + 逐点 L；跨缺段只有两端点；
 * 单点段只有 M（无 L，渲染层据此跳过或画点标记）。
 */
export function segmentPathD(
  segment: WorkbenchLineSegment,
  pointAt: (index: number) => { x: number; y: number },
): string {
  const first = pointAt(segment.from);
  let d = `M${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  // 跨缺段只取两端真实点；连续段逐点连线。
  const points = segment.bridging
    ? [pointAt(segment.to)]
    : Array.from({ length: segment.to - segment.from }, (_, offset) => pointAt(segment.from + 1 + offset));
  for (const point of points) {
    d += ` L${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }
  return d;
}

/**
 * 预测起点 = 首个 `status === 'forecast'` 的下标；无预测周返回 -1。
 * 主图历史终点、预测线、今天分界与成本图共用该派生，禁止写死下标。
 */
export function firstForecastIndex(weeks: ReadonlyArray<{ status: 'actual' | 'forecast' }>): number {
  return weeks.findIndex((week) => week.status === 'forecast');
}

/**
 * 数据派生轴刻度：在 [min, max] 内取约 tickCount 个「好看」的等步长刻度
 * （步长 ∈ {1, 2, 5, 10} × 10^n，取最接近 span / tickCount 的候选）。
 * 范围平坦 / 倒置 / 非有限时返回空数组，由调用方回退（不造 NaN 刻度）。
 */
export function buildAxisTicks(min: number, max: number, tickCount = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min) || tickCount < 1) return [];
  const rawStep = (max - min) / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10]
    .map((mantissa) => mantissa * magnitude)
    .reduce((best, candidate) => (Math.abs(candidate - rawStep) < Math.abs(best - rawStep) ? candidate : best));
  const firstIndex = Math.ceil(min / step - 1e-9);
  const lastIndex = Math.floor(max / step + 1e-9);
  const ticks: number[] = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    ticks.push(Math.round(index * step * 1e6) / 1e6);
  }
  return ticks;
}
