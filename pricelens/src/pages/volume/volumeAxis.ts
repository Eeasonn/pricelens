// ============================================================
// 第一百一十三轮（2026-10-21）量价看板 · 销量轴小工具：读数缩写 / 上限推导。
// 上限默认 = niceCeil(窗口内最大值)；用户可在每图销量轴上直接输入最高值。
// ============================================================
import { niceCeil } from '../../dataModel/volume';
import { MIN_WINDOW } from '../../chart/PriceTrend/helpers';

/** 面板槽位 = 一个「产品 × 配置」选择 */
export interface VolumeSlot {
  modelId: string;
  romram: string;
}

/** 销量读数缩写：≥10000 → 12.4K，否则千分位整数 */
export function fmtVolume(v: number): string {
  if (v >= 10000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return Math.round(v).toLocaleString('en-US');
}

/** 面板销量轴上限：恒自动 = niceCeil(最大值)（无数据保底 1，防除零） */
export function vMaxOf(values: (number | null)[]): number {
  let max = 0;
  for (const v of values) if (v != null && v > max) max = v;
  return niceCeil(max);
}

export interface VolumeAxisLimits {
  /** null = 自动最高值（由当前查看窗口最大销量推导） */
  max: number | null;
}

/**
 * 将用户输入归一为可绘制的销量轴范围。
 * 销量轴以 0 为固定基线，只有最高值可调；轴范围和绘图区高度彼此独立，
 * 所以改最高值只改变柱高映射，不会改变卡片高度或零基线位置。
 */
export function volumeRangeOf(limits: VolumeAxisLimits | null | undefined, autoMax: number): [number, number] {
  const fallbackMax = Math.max(1, Number.isFinite(autoMax) ? autoMax : 1);
  const requestedMax = limits?.max != null && Number.isFinite(limits.max) ? Math.max(1, limits.max) : fallbackMax;
  return [0, requestedMax];
}

/** 单次最高值提交：空值恢复自动；输入小于 1 时保留最小可绘制跨度。 */
export function commitVolumeAxisLimit(
  current: VolumeAxisLimits | null | undefined,
  kind: 'max',
  value: number | null,
  autoMax: number,
): VolumeAxisLimits {
  const next: VolumeAxisLimits = { max: current?.max ?? null };
  if (value == null || !Number.isFinite(value)) {
    next.max = null;
    return next;
  }
  // `autoMax` is only used when the input is cleared; explicit values are allowed
  // to be lower than the current data maximum so the tallest bars visibly clip at
  // the fixed top edge, which is the intended "最高值" interaction.
  void autoMax;
  next.max = Math.max(1, value);
  return next;
}

export interface VolumeAxisClip {
  clipped: boolean;
  dataMax: number;
  effectiveMax: number;
}

export function volumeAxisClipOf(
  values: readonly (number | null)[],
  limits: VolumeAxisLimits | null | undefined,
  autoMax: number,
): VolumeAxisClip {
  let dataMax = 0;
  for (const value of values) {
    if (value != null && Number.isFinite(value) && value > dataMax) dataMax = value;
  }
  const effectiveMax = limits?.max ?? autoMax;
  return { clipped: dataMax > 0 && effectiveMax < dataMax, dataMax, effectiveMax };
}

/** 面板独立查看时间（第一百一十九轮）：非同步模式下面板的生效窗口。
 *  未单独调整过 = 回落共享窗口；否则钳入可调全域并保住最小窗口跨度。 */
export function normalizePanelWindow(
  pw: [number, number] | null,
  fallbackS: number,
  fallbackE: number,
  lo: number,
  hi: number,
): [number, number] {
  const cl = (v: number): number => Math.min(hi, Math.max(lo, v));
  if (!pw) return [cl(fallbackS), cl(fallbackE)];
  let s = cl(Math.min(pw[0], pw[1]));
  let e = cl(Math.max(pw[0], pw[1]));
  if (e - s < MIN_WINDOW - 1) {
    e = Math.min(hi, s + MIN_WINDOW - 1);
    s = Math.max(lo, e - (MIN_WINDOW - 1));
  }
  return [s, e];
}
