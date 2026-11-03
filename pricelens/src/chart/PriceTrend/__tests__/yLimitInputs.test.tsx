// ============================================================
// YLimitInputs 组件级测试（A1 收口，2026-11-02 Eason 拍板）：Y 轴范围控件
// 移驻工具行后的交互契约——① onYLimit/yRangeScale 不传 = 区块不渲染（量价页
// 等调用方零影响）；② 上限输入提交（K 缩写解析、清空恢复自动、箭头步进）；
// ③「自适应」一键交回两侧自动；④ parseLimitText 文法。
// 行为与退役的 YLimitHandles 竖排卡片逐项同源（见 yAxisLimits.test.ts 的
// computeYAxis 覆盖契约）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChartToolbar from '../ChartToolbar';
import { parseLimitText } from '../YLimitInputs';

afterEach(cleanup);

const SCALE = { min: 0, max: 1900, interval: 100 };

const mount = (opts: { withLimit?: boolean; limit?: { min: number | null; max: number | null } } = {}) => {
  const onYLimit = vi.fn();
  const props = {
    mode: 'cluster' as const,
    currency: 'usd' as const,
    priceTypesAfter: <span>隐藏对比产品</span>,
    ...(opts.withLimit === false
      ? {}
      : {
          onYLimit,
          yRangeScale: SCALE,
          yLimit: opts.limit ?? { min: null, max: null },
        }),
  };
  render(<ChartToolbar {...props} />);
  return { onYLimit };
};

describe('YLimitInputs · 渲染条件', () => {
  it('传入 onYLimit + yRangeScale 时渲染「Y 轴范围」控件组', () => {
    const { container } = render(<ChartToolbar mode="cluster" currency="usd" onYLimit={vi.fn()} yRangeScale={SCALE} yLimit={{ min: null, max: null }} />);
    expect(screen.getByRole('group', { name: 'Y 轴范围' })).toBeTruthy();
    expect(screen.getByLabelText('Y 轴上限')).toBeTruthy();
    expect(screen.getByLabelText('Y 轴下限')).toBeTruthy();
    expect(container.textContent).toContain('自适应');
  });

  it('不传 onYLimit（量价页等调用方）时整个区块不渲染', () => {
    render(<ChartToolbar mode="cluster" currency="usd" />);
    expect(screen.queryByRole('group', { name: 'Y 轴范围' })).toBeNull();
  });
});

describe('YLimitInputs · 受控编辑', () => {
  it('自动态：上限输入框显示轴顶自动值（K 缩写），自适应钮为选中态', () => {
    mount();
    expect((screen.getByLabelText('Y 轴上限') as HTMLInputElement).value).toBe('1.9K');
    expect(screen.getByRole('button', { name: 'Y 轴已自适应' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('手输 2500 失焦提交 onYLimit("max", 2500)', () => {
    const { onYLimit } = mount();
    const input = screen.getByLabelText('Y 轴上限') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2500' } });
    fireEvent.blur(input);
    expect(onYLimit).toHaveBeenCalledWith('max', 2500);
  });

  it('接受 K 缩写（2k → 2000）', () => {
    const { onYLimit } = mount();
    const input = screen.getByLabelText('Y 轴上限') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2k' } });
    fireEvent.blur(input);
    expect(onYLimit).toHaveBeenCalledWith('max', 2000);
  });

  it('清空输入失焦 = 恢复该侧自动（null）', () => {
    const { onYLimit } = mount({ limit: { min: null, max: 1500 } });
    const input = screen.getByLabelText('Y 轴上限') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onYLimit).toHaveBeenCalledWith('max', null);
  });

  it('上限 ▴ 箭头 = 自动值 +100（1900 → 2000，百位向上收口）', () => {
    const { onYLimit } = mount();
    fireEvent.click(screen.getByLabelText('上限增加 100'));
    expect(onYLimit).toHaveBeenCalledWith('max', 2000);
  });

  it('自定义态点「自适应」= 两侧一起交回自动', () => {
    const { onYLimit } = mount({ limit: { min: 0, max: 1500 } });
    fireEvent.click(screen.getByRole('button', { name: '恢复 Y 轴自适应' }));
    expect(onYLimit).toHaveBeenCalledWith('max', null);
    expect(onYLimit).toHaveBeenCalledWith('min', null);
  });
});

describe('parseLimitText 文法', () => {
  it('接受整数、K/k、M/m、千分位；空串 = null；非法 = NaN', () => {
    expect(parseLimitText('2000')).toBe(2000);
    expect(parseLimitText('2K')).toBe(2000);
    expect(parseLimitText('1.5k')).toBe(1500);
    expect(parseLimitText('1.2M')).toBe(1_200_000);
    expect(parseLimitText('1,900')).toBe(1900);
    expect(parseLimitText('')).toBeNull();
    expect(parseLimitText('  ')).toBeNull();
    expect(Number.isNaN(parseLimitText('abc'))).toBe(true);
  });
});
