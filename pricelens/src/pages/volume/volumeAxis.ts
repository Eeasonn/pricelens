// ============================================================
// 第112轮 量价看板 · 销量轴小工具：轴模式 / 读数缩写 / 单图上限推导。
// 纯函数：上限 = 单图覆写优先，自动 = niceCeil(窗口内最大值)，空值保底 1。
// ============================================================
import { niceCeil } from '../../dataModel/volume';

/** 销量轴口径：各图独立 / 三图一致（统一上限）/ 对数（柱高按 log1p 比） */
export type VolumeAxisMode = 'independent' | 'unified' | 'log';

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

/** 面板销量轴上限：覆写优先；自动 = niceCeil(最大值)（无数据保底 1，防除零） */
export function vMaxOf(values: (number | null)[], override: number | null): number {
  if (override != null && override > 0) return override;
  let max = 0;
  for (const v of values) if (v != null && v > max) max = v;
  return niceCeil(max);
}
