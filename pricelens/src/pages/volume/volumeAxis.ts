// ============================================================
// 第一百一十三轮（2026-10-21）量价看板 · 销量轴小工具：读数缩写 / 上限推导。
// 上限口径收敛为恒自动 = niceCeil(窗口内最大值)：原三档口径与单图上限覆写
// 已删（改由每图右侧「销量轴」拉伸柄直接调柱区高度，不再调数值口径）。
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
