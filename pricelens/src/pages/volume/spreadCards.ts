import type { RangeSpread } from './periodSummary';

export const SPREAD_CARD_W = 148;
/** 两张幅度卡同一高度：标题、极差率、绝对差值、最低—最高四行（含内边距）。 */
export const SPREAD_CARD_H = 92;

export interface SpreadCardModel {
  visible: boolean;
  /** 最大字号。有极差率时是百分比；最低为 0 时改成绝对差值。 */
  primary: string;
  /** 第二层。有极差率时是绝对差值；最低为 0 时是「—」。 */
  secondary: string;
  /** 最低—最高，最小字号。 */
  span: string;
  ariaLabel: string;
}

export function spreadCardModel(
  spread: RangeSpread,
  formatValue: (value: number) => string,
  name: string,
): SpreadCardModel {
  if (!spread.min || !spread.max || spread.spread == null) {
    return { visible: false, primary: '', secondary: '', span: '', ariaLabel: '' };
  }
  const high = formatValue(spread.max.value);
  const low = formatValue(spread.min.value);
  const delta = formatValue(spread.spread);
  const span = `${low}–${high}`;
  if (spread.rate == null) {
    return {
      visible: true,
      primary: delta,
      secondary: '—',
      span,
      ariaLabel: `${name}极差 ${delta}，极差率 —，最低 ${low}，最高 ${high}`,
    };
  }
  const rate = `${spread.rate.toFixed(1)}%`;
  return {
    visible: true,
    primary: rate,
    secondary: delta,
    span,
    ariaLabel: `${name}极差率 ${rate}，极差 ${delta}，最低 ${low}，最高 ${high}`,
  };
}

/** 图下左右两张卡：贴住绘图区左右缘，同宽同高；放不下时一起缩小，避免叠在一起。 */
export function spreadCardRow(plotLeft: number, plotWidth: number): {
  priceLeft: number;
  volumeLeft: number;
  width: number;
  height: number;
} {
  const gap = 12;
  const room = Math.max(0, plotWidth - gap);
  const width = Math.min(SPREAD_CARD_W, Math.floor(room / 2));
  return {
    priceLeft: plotLeft,
    volumeLeft: plotLeft + plotWidth - width,
    width,
    height: SPREAD_CARD_H,
  };
}
