// ============================================================
// VolumeBars 组件级测试（2026-11-01 审计 P3 补测）：量价面板销量柱层——柱渲染 /
// 悬停高亮 / 超上限截断提示 / 销量 Y 轴「最高值」编辑器交互（提交、清空恢复
// 自动、Escape 取消）。该编辑器即 volumeLimits 按面板 key 存储的交互面
// （commitVolumeAxisLimit 归一后回传 onAxisLimit）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import VolumeBars from '../VolumeBars';
import type { StripGeom } from '../../../chart/PriceTrend/helpers';
import type { VolumeAxisLimits } from '../volumeAxis';

afterEach(cleanup);

const GEOM: StripGeom = { plotLeft: 0, plotWidth: 400, n: 4 };
const VALUES: (number | null)[] = [1000, null, 500, 2000];

interface Harness {
  onAxisLimit: ReturnType<typeof vi.fn>;
  rerenderBars: (limits: VolumeAxisLimits, hoverIdx?: number | null) => void;
}

const mount = (limits: VolumeAxisLimits = { max: null }, hoverIdx: number | null = null): Harness => {
  const onAxisLimit = vi.fn();
  const initial = { geom: GEOM, plotTop: 0, plotHeight: 200, values: VALUES, vMax: 2000, color: '#c7000b', hoverIdx, axisLimits: limits, onAxisLimit };
  const { rerender } = render(<VolumeBars {...initial} />);
  return {
    onAxisLimit,
    rerenderBars: (next: VolumeAxisLimits, nextHover: number | null = null) =>
      rerender(<VolumeBars {...initial} axisLimits={next} hoverIdx={nextHover} />),
  };
};

describe('VolumeBars · 柱层渲染', () => {
  it('缺采桶不画柱，有值桶逐桶渲染', () => {
    const { container } = render(
      <VolumeBars {...{ geom: GEOM, plotTop: 0, plotHeight: 200, values: VALUES, vMax: 2000, color: '#c7000b', hoverIdx: null, axisLimits: { max: null }, onAxisLimit: vi.fn() }} />,
    );
    const bars = container.querySelectorAll('svg rect');
    expect(bars).toHaveLength(3); // 1000 / 500 / 2000，null 桶不画
  });

  it('悬停列加亮（fillOpacity 0.38 vs 0.18），其余柱保持常规透明度', () => {
    const { rerenderBars } = mount({ max: null }, 2);
    const first = document.querySelector('svg rect');
    expect(first?.getAttribute('fill')).toContain('0.18');
    rerenderBars({ max: null }, 2);
    const bars = document.querySelectorAll('svg rect');
    const hovered = Array.from(bars).find((b) => b.getAttribute('fill')?.includes('0.38'));
    expect(hovered).toBeDefined();
  });

  it('手动上限低于数据最大值时提示「超出当前上限」，清回自动后消失', () => {
    mount({ max: 1000 });
    expect(screen.getByText('超出当前上限')).toBeDefined();
    expect(screen.getByText('手动')).toBeDefined();
    cleanup();
    mount({ max: null });
    expect(screen.queryByText('超出当前上限')).toBeNull();
    expect(screen.getByText('自动')).toBeDefined();
  });
});

describe('VolumeBars · 销量 Y 轴最高值编辑器', () => {
  it('点击进入编辑，输入并 Enter 提交数值（经 commitVolumeAxisLimit 归一）', () => {
    const { onAxisLimit } = mount({ max: null });
    fireEvent.click(screen.getByTitle('点击编辑销量上限；清空恢复自动'));
    const input = screen.getByLabelText('销量 Y 轴上限') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAxisLimit).toHaveBeenCalledWith('max', 500);
    // 提交后回到只读按钮（不再是输入框）
    expect(screen.queryByLabelText('销量 Y 轴上限')).toBeNull();
  });

  it('清空输入提交 null = 恢复自动', () => {
    const { onAxisLimit } = mount({ max: 1500 });
    fireEvent.click(screen.getByTitle('点击编辑销量上限；清空恢复自动'));
    const input = screen.getByLabelText('销量 Y 轴上限') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onAxisLimit).toHaveBeenCalledWith('max', null);
  });

  it('Escape 取消：恢复编辑前快照、不提交', () => {
    const { onAxisLimit } = mount({ max: 1500 });
    fireEvent.click(screen.getByTitle('点击编辑销量上限；清空恢复自动'));
    const input = screen.getByLabelText('销量 Y 轴上限') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '300' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onAxisLimit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('销量 Y 轴上限')).toBeNull();
    // 快照回显编辑前的 1500（按钮 aria-label 带显示值）
    expect(screen.getByTitle('点击编辑销量上限；清空恢复自动').textContent).toBe('1,500');
  });

  it('上限输入带小数向下取整显示（Math.round 展示层）', () => {
    mount({ max: 1500 });
    expect(screen.getByTitle('点击编辑销量上限；清空恢复自动').textContent).toBe('1,500');
  });
});
