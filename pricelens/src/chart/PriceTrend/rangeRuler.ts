// ============================================================
// 区间量尺（2026-11-06 Eason 拍板，规则见 .impeccable/surfaces/range-ruler-volume-skeleton.md）：
// 价格走势与量价走势共用的纯计算——选区内的读数（区间极差 / 区间涨跌）、幅度框两行
// 文案、量尺列位置、量带上限取整。图形绘制在 Chart.tsx。
// ============================================================
import { formatVolumeAmount, shouldUseWanUnits } from '../../pages/volume/periodSummary';

/** 区间读数方式：区间极差（最高与最低之差）| 区间涨跌（期末相对期初） */
export type RangeMode = 'extreme' | 'trend';

export const RANGE_MODE_LABEL: Record<RangeMode, string> = {
  extreme: '区间极差',
  trend: '区间涨跌',
};

/** 按钮 title：写清百分比的分母 */
export const RANGE_MODE_HINT: Record<RangeMode, string> = {
  extreme: '区间内最高与最低之差，百分比相对最低',
  trend: '期末相对期初的变化，百分比相对期初',
};

export interface RulerPoint {
  /** 全序列下标（不是区间内下标） */
  index: number;
  value: number;
}

export type RangeRuler =
  | { state: 'empty' }
  /** 区间内只有一个有效桶 */
  | { state: 'single'; a: RulerPoint }
  /** 有两个以上有效桶，但没有高低差（极差）或期末等于期初（涨跌） */
  | { state: 'flat'; a: RulerPoint; b: RulerPoint }
  /** a / b：极差 = 最高 / 最低；涨跌 = 期初 / 期末。dir 只在涨跌时非 0 */
  | { state: 'ok'; a: RulerPoint; b: RulerPoint; dir: -1 | 0 | 1; delta: number; rate: number | null };

export function rangeRulerOf(
  values: readonly (number | null | undefined)[],
  start: number,
  end: number,
  mode: RangeMode,
  valid: (v: number | null | undefined, index: number) => v is number,
): RangeRuler {
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(values.length - 1, Math.max(start, end));
  const idx: number[] = [];
  for (let i = lo; i <= hi; i += 1) if (valid(values[i], i)) idx.push(i);
  if (idx.length === 0) return { state: 'empty' };
  const at = (i: number): RulerPoint => ({ index: i, value: values[i] as number });
  if (idx.length === 1) return { state: 'single', a: at(idx[0]) };

  if (mode === 'trend') {
    const a = at(idx[0]);
    const b = at(idx[idx.length - 1]);
    const delta = b.value - a.value;
    if (delta === 0) return { state: 'flat', a, b };
    return { state: 'ok', a, b, dir: delta > 0 ? 1 : -1, delta, rate: a.value > 0 ? (delta / a.value) * 100 : null };
  }

  // 与量价页 periodSummary.rangeSpreadOf 同口径：取最早的最高点、最早的最低点
  // （这里直接遍历有效下标——有效判定要带下标，才能排除被隔离的周）
  let max = at(idx[0]);
  let min = at(idx[0]);
  for (const i of idx) {
    const v = values[i] as number;
    if (v > max.value) max = at(i);
    if (v < min.value) min = at(i);
  }
  const delta = max.value - min.value;
  if (delta === 0) return { state: 'flat', a: max, b: min };
  return { state: 'ok', a: max, b: min, dir: 0, delta, rate: min.value > 0 ? (delta / min.value) * 100 : null };
}

const signOf = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '±');

/** 幅度框两行：第一行率，第二行数量（价格 = 金额，销量 = 台） */
export function rangeRulerTexts(
  r: RangeRuler,
  opts: {
    kind: 'price' | 'volume';
    formatPrice: (v: number) => string;
    /** 粒度名词：周 / 月 / 季 */
    unitNoun: string;
    /** flat 时区分 0.0%（极差）与 ±0.0%（涨跌）；ok 态从 dir 判断 */
    mode?: RangeMode;
  },
): { primary: string; secondary: string } {
  const amountOf = (n: number, scale: readonly (number | null)[]): string => {
    if (opts.kind === 'price') return opts.formatPrice(Math.abs(n));
    const wan = shouldUseWanUnits(scale);
    return formatVolumeAmount(Math.abs(n), wan) + (wan ? '台' : ' 台');
  };
  if (r.state === 'empty') return { primary: '—', secondary: '—' };
  if (r.state === 'single') return { primary: '—', secondary: `仅 1 个有效${opts.unitNoun}` };
  if (r.state === 'flat') {
    return {
      primary: opts.mode === 'trend' ? '±0.0%' : '0.0%',
      secondary: amountOf(0, [0]),
    };
  }
  const scale = [r.a.value, r.b.value, Math.abs(r.delta)];
  const sign = r.dir === 0 ? '' : signOf(r.delta);
  const rate = r.rate == null ? '—' : `${sign}${Math.abs(r.rate).toFixed(1)}%`;
  return { primary: rate, secondary: `${sign}${amountOf(r.delta, scale)}` };
}

/** 量尺列横坐标：选区右外侧优先，放不下翻左外侧，都放不下放选区内靠右 */
export function rulerColumnOf(p: {
  bandLeft: number;
  bandRight: number;
  plotLeft: number;
  plotRight: number;
  chipW: number;
}): { x: number; side: 'right' | 'left' | 'inside' } {
  const GAP = 12;
  const EDGE = 4;
  const half = p.chipW / 2;
  if (p.bandRight + GAP + p.chipW + EDGE <= p.plotRight) return { x: p.bandRight + GAP + half, side: 'right' };
  if (p.bandLeft - GAP - p.chipW - EDGE >= p.plotLeft) return { x: p.bandLeft - GAP - half, side: 'left' };
  return { x: p.bandRight - 10 - half, side: 'inside' };
}

const BAND_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;

/** 量带上限（2026-11-06 Eason 拍板「收紧」）：最大值留 10% 余量后按细档向上取整 */
export function volumeBandMaxOf(maxValue: number): number {
  const t = maxValue * 1.1;
  if (!(t > 0) || !Number.isFinite(t)) return 0;
  const p = 10 ** Math.floor(Math.log10(t));
  const step = BAND_STEPS.find((s) => t / p <= s) ?? 10;
  return Number((step * p).toPrecision(12));
}

// ---------------- 量尺图层几何（纯计算；绘制在 RangeRulerLayer） ----------------

/** 幅度框固定高（两行：13px 率 行高 16 + 11px 数量 行高 14 = 30）。2026-11-07 改产品卡同款容器后
 *  34 → 40：1px 描边内上下各留 4px，字不贴边 */
export const RULER_CHIP_H = 40;
/** 幅度框左右内边距（与悬停产品卡同为 10px）+ 1px 描边 */
const CHIP_PAD_X = 10 + 1;
/** 箭头短于「框高 + 这个余量」时不画箭头，只留虚线连到框 */
const ARROW_MIN_EXTRA = 12;

export interface RulerLayerSide {
  kind: 'price' | 'volume';
  values: readonly (number | null | undefined)[];
  valid: (v: number | null | undefined, index: number) => v is number;
  /** 数值 → 像素 y */
  yOf: (v: number) => number;
  /** 该层纵向范围（像素），幅度框钳在其内 */
  top: number;
  bottom: number;
  color: string;
}

export interface RulerPointPx extends RulerPoint {
  x: number;
  y: number;
}

export interface RulerLayerPart {
  kind: 'price' | 'volume';
  ruler: RangeRuler;
  texts: { primary: string; secondary: string };
  color: string;
  top: number;
  bottom: number;
  a: RulerPointPx | null;
  b: RulerPointPx | null;
  /** 幅度框中心 y；null = 不出框（single / empty） */
  chipY: number | null;
  drawArrow: boolean;
}

export interface RulerLayerModel {
  single: boolean;
  bandLeft: number;
  bandRight: number;
  columnX: number;
  side: 'right' | 'left' | 'inside';
  chipW: number;
  parts: RulerLayerPart[];
}

export function rulerLayerOf(p: {
  mode: RangeMode;
  start: number;
  end: number;
  unitNoun: string;
  plotLeft: number;
  plotRight: number;
  colW: number;
  formatPrice: (v: number) => string;
  /** (文本, 字号, 字重) → 像素宽 */
  measure: (text: string, size: number, weight: number) => number;
  sides: RulerLayerSide[];
}): RulerLayerModel {
  const lo = Math.min(p.start, p.end);
  const hi = Math.max(p.start, p.end);
  const xOf = (i: number): number => p.plotLeft + p.colW * (i + 0.5);
  const px = (side: RulerLayerSide, pt: RulerPoint): RulerPointPx => ({ ...pt, x: xOf(pt.index), y: side.yOf(pt.value) });
  const parts: RulerLayerPart[] = p.sides.map((side) => {
    const ruler = rangeRulerOf(side.values, lo, hi, p.mode, side.valid);
    const texts = rangeRulerTexts(ruler, { kind: side.kind, formatPrice: p.formatPrice, unitNoun: p.unitNoun, mode: p.mode });
    const a = ruler.state === 'empty' ? null : px(side, ruler.a);
    const b = ruler.state === 'ok' || ruler.state === 'flat' ? px(side, ruler.b) : null;
    const half = RULER_CHIP_H / 2;
    const clampY = (y: number): number => Math.min(side.bottom - half, Math.max(side.top + half, y));
    let chipY: number | null = null;
    let drawArrow = false;
    if (ruler.state === 'ok' && a && b) {
      chipY = clampY((a.y + b.y) / 2);
      drawArrow = Math.abs(a.y - b.y) >= RULER_CHIP_H + ARROW_MIN_EXTRA;
    } else if (ruler.state === 'flat' && a) {
      chipY = clampY(a.y);
    }
    return { kind: side.kind, ruler, texts, color: side.color, top: side.top, bottom: side.bottom, a, b, chipY, drawArrow };
  });
  const chipW = parts.reduce(
    (w, part) =>
      part.chipY == null
        ? w
        : Math.max(w, Math.ceil(Math.max(p.measure(part.texts.primary, 13, 600), p.measure(part.texts.secondary, 11, 400))) + CHIP_PAD_X * 2),
    0,
  );
  const bandLeft = p.plotLeft + lo * p.colW;
  const bandRight = p.plotLeft + (hi + 1) * p.colW;
  const col = rulerColumnOf({ bandLeft, bandRight, plotLeft: p.plotLeft, plotRight: p.plotRight, chipW });
  return { single: lo === hi, bandLeft, bandRight, columnX: col.x, side: col.side, chipW, parts };
}

/** 无障碍朗读：一句话说清选区读数（销量注明模拟） */
export function rulerSummaryOf(
  model: RulerLayerModel,
  labels: { range: string; bucketOf: (index: number) => string; formatPrice: (v: number) => string; unitNoun: string },
): string {
  if (model.single) return `已选 ${labels.range}。请选择${labels.unitNoun}范围，才能看到变化幅度。`;
  const parts = model.parts.map((part) => {
    const name = part.kind === 'price' ? '价格' : '销量（模拟）';
    const fmt = (v: number): string => (part.kind === 'price' ? labels.formatPrice(v) : Math.round(v).toLocaleString('en-US'));
    const r = part.ruler;
    if (r.state === 'empty') return `${name}区间内无数据。`;
    if (r.state === 'single') return `${name}仅 1 个有效${labels.unitNoun}。`;
    if (r.state === 'flat') return `${name}${part.texts.primary === '±0.0%' ? '无变化' : '无波动'}。`;
    if (r.dir !== 0) {
      return `${name}期初 ${fmt(r.a.value)}（${labels.bucketOf(r.a.index)}），期末 ${fmt(r.b.value)}（${labels.bucketOf(r.b.index)}），涨跌 ${part.texts.primary}，${part.texts.secondary}。`;
    }
    return `${name}最高 ${fmt(r.a.value)}（${labels.bucketOf(r.a.index)}），最低 ${fmt(r.b.value)}（${labels.bucketOf(r.b.index)}），极差率 ${part.texts.primary}，极差 ${part.texts.secondary}。`;
  });
  return `已选 ${labels.range}。${parts.join('')}`;
}

/** 全量桶下标的选区 → 某个查看窗口内的下标（Chart 的 brush 按窗口切片计）；与窗口不相交 = null */
export function brushInWindow(range: readonly [number, number] | null, start: number, end: number): [number, number] | null {
  if (!range) return null;
  const lo = Math.max(Math.min(range[0], range[1]), start);
  const hi = Math.min(Math.max(range[0], range[1]), end);
  return lo > hi ? null : [lo - start, hi - start];
}
