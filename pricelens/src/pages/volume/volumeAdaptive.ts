import type { VolumeViewMode } from './volumeView';

export interface VolumeAdaptivePanel<S> {
  isMain: boolean;
  series: readonly S[];
}

/**
 * 量价时间自适应只统计当前画面上的产品。
 * 主产品视图不含对比产品；组内对比才把该组正在显示的竞品算进去。
 */
export function volumeAdaptiveSeries<S>(
  panels: readonly VolumeAdaptivePanel<S>[],
  mode: VolumeViewMode,
): S[] {
  const source = mode.kind === 'mains' ? panels.filter((panel) => panel.isMain) : panels;
  return source.flatMap((panel) => panel.series);
}
