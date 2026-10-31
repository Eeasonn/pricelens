import type { RangeSpread } from './periodSummary';

export const SPREAD_CARD_W = 112;
/** 两张卡同一高度，只包住四行字，不跟随虚线间距拉高。 */
export const SPREAD_CARD_H = 72;

export interface SpreadCardModel {
  visible: boolean;
  high: string;
  low: string;
  middle: string;
  ariaLabel: string;
}

export function spreadCardModel(
  spread: RangeSpread,
  formatValue: (value: number) => string,
  name: string,
): SpreadCardModel {
  if (!spread.min || !spread.max || spread.spread == null) {
    return { visible: false, high: '', low: '', middle: '', ariaLabel: '' };
  }
  const high = formatValue(spread.max.value);
  const low = formatValue(spread.min.value);
  const delta = formatValue(spread.spread);
  const rate = spread.rate == null ? '—' : `${spread.rate.toFixed(1)}%`;
  return {
    visible: true,
    high,
    low,
    middle: `${delta} · ${rate}`,
    ariaLabel: `${name}区间最高 ${high}，最低 ${low}，极差 ${delta}，极差率 ${rate}`,
  };
}

export interface SpreadCardBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SpreadCardPlan {
  place: 'plot';
  price: SpreadCardBox;
  volume: SpreadCardBox;
}

/** 图上要避让的极值标记：圆点位置；价格最高/最低还带一个文字标签。 */
export interface SpreadExtremeMark {
  x: number;
  y: number;
  /** 文字标签相对圆点的位置；缺省 = 只有圆点没有标签 */
  label?: 'above' | 'below';
}

export interface SpreadCardPlanInput {
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  /** 本图右缘。销量卡不得超过它，避免盖到下一张图。 */
  frameRight?: number;
  /** 价格最高、最低虚线的像素 y。卡片默认居中夹在两条线之间。 */
  priceBandY?: readonly [number, number] | null;
  /** 销量最高、最低虚线的像素 y。 */
  volumeBandY?: readonly [number, number] | null;
  /** 需要避让的极值点与标签（价格与销量的最高、最低）。 */
  extremeMarks?: readonly SpreadExtremeMark[];
}

/** 固定高度，垂直居中夹在两条虚线之间，并限制在绘图区内。 */
export function spreadCardBandBox(
  highY: number,
  lowY: number,
  plotTop: number,
  plotHeight: number,
): { top: number; height: number } {
  const upper = Math.min(highY, lowY);
  const lower = Math.max(highY, lowY);
  const plotBottom = plotTop + plotHeight;
  const height = SPREAD_CARD_H;
  let top = (upper + lower) / 2 - height / 2;
  const maxTop = Math.max(plotTop, plotBottom - height);
  top = Math.min(maxTop, Math.max(plotTop, top));
  return { top, height };
}

const GAP = 8;
/** 圆点四周要留出的净空半径 */
const DOT_CLEAR = 5;
/** 极值文字标签的占位（居中于点上方/下方） */
const LABEL_W = 44;
const LABEL_H = 16;
/** 两张卡之间至少留出的缝 */
const CARD_GAP = 4;
/** 上下挪动找空位时的步长 */
const DODGE_STEP = 6;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

function markBoxes(marks: readonly SpreadExtremeMark[]): Box[] {
  const boxes: Box[] = [];
  for (const mark of marks) {
    boxes.push({ left: mark.x - DOT_CLEAR, top: mark.y - DOT_CLEAR, width: DOT_CLEAR * 2, height: DOT_CLEAR * 2 });
    if (mark.label) {
      boxes.push({
        left: mark.x - LABEL_W / 2,
        top: mark.label === 'above' ? mark.y - DOT_CLEAR - LABEL_H : mark.y + DOT_CLEAR,
        width: LABEL_W,
        height: LABEL_H,
      });
    }
  }
  return boxes;
}

/** 默认带内居中；盖住极值标记或另一张卡时，就近上下挪到不挡的位置，挪不动再回居中。 */
function placeCard(bandTop: number, left: number, plotTop: number, plotBottom: number, obstacles: Box[]): SpreadCardBox {
  const centered: SpreadCardBox = { left, top: bandTop, width: SPREAD_CARD_W, height: SPREAD_CARD_H };
  const minTop = plotTop;
  const maxTop = plotBottom - SPREAD_CARD_H;
  if (maxTop < minTop) return centered;
  const clearAt = (top: number): boolean => {
    const box: Box = { left, top, width: SPREAD_CARD_W, height: SPREAD_CARD_H };
    return !obstacles.some((o) => overlaps(box, o));
  };
  if (clearAt(centered.top)) return centered;
  const limit = maxTop - minTop;
  for (let step = DODGE_STEP; step <= limit + DODGE_STEP; step += DODGE_STEP) {
    for (const top of [bandTop - step, bandTop + step]) {
      if (top < minTop || top > maxTop) continue;
      if (clearAt(top)) return { left, top, width: SPREAD_CARD_W, height: SPREAD_CARD_H };
    }
  }
  return centered;
}

/** 价格卡贴左缘、销量卡贴右缘；垂直方向各自夹在自己的两条虚线之间，
 *  压住极值点/标签（或另一张卡）时就近上下错开。 */
export function spreadCardPlan(input: SpreadCardPlanInput): SpreadCardPlan {
  const plotRight = input.plotLeft + input.plotWidth;
  const plotBottom = input.plotTop + input.plotHeight;
  const priceLeft = input.plotLeft + GAP;
  let volumeLeft = plotRight - SPREAD_CARD_W - GAP;
  if (input.frameRight != null) volumeLeft = Math.min(volumeLeft, input.frameRight - SPREAD_CARD_W);
  const priceBand = input.priceBandY
    ? spreadCardBandBox(input.priceBandY[0], input.priceBandY[1], input.plotTop, input.plotHeight)
    : { top: input.plotTop, height: SPREAD_CARD_H };
  const volumeBand = input.volumeBandY
    ? spreadCardBandBox(input.volumeBandY[0], input.volumeBandY[1], input.plotTop, input.plotHeight)
    : { top: input.plotTop, height: SPREAD_CARD_H };
  const obstacles = markBoxes(input.extremeMarks ?? []);
  const price = placeCard(priceBand.top, priceLeft, input.plotTop, plotBottom, obstacles);
  const volume = placeCard(volumeBand.top, volumeLeft, input.plotTop, plotBottom, [
    ...obstacles,
    {
      left: price.left - CARD_GAP,
      top: price.top - CARD_GAP,
      width: price.width + CARD_GAP * 2,
      height: price.height + CARD_GAP * 2,
    },
  ]);
  return { place: 'plot', price, volume };
}
