// ============================================================
// 量价页大促档期接线冒烟（2026-11-03 对齐价格页，方案 A 全量对齐）：
// ① 工具行 = promoOnly 形态：有「大促档期」一颗、无「促销权益」；
// ② 开关默认关 → 图上无档期带胶囊标志；点击原生 input 打开 → RU 默认口径下
//    档期（BTS返校季，全渠道）与面板窗口相交 → 胶囊标志行出现（经典折线分支，
//    Chart 内部白拿：带 / 胶囊 / 事件卡）；再点关闭 → 消失。
// echarts 在 jsdom 无 canvas：mock 'echarts/core' 等模块；ResizeObserver 报一次
// 固定宽度驱动 Chart/CostBarChart 完成几何测量（jsdom 无真实布局）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), clear: vi.fn(), dispose: vi.fn() })),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, ScatterChart: {} }));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  MarkAreaComponent: {},
  MarkLineComponent: {},
  MarkPointComponent: {},
  DataZoomComponent: {},
  BrushComponent: {},
  VisualMapComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const RO_WIDTH = 1200;
class ResizeObserverStub {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: Element): void {
    Object.defineProperty(el, 'clientWidth', { value: RO_WIDTH, configurable: true });
    this.cb([{ contentRect: { width: RO_WIDTH } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import App from '../../App';

afterEach(cleanup);

const promoTagButtons = (): HTMLElement[] =>
  Array.from(document.querySelectorAll('button[aria-label*="点击看档期详情"]'));

const promoCheckboxInput = (): HTMLInputElement | null => {
  const label = screen.getByText('大促档期').closest('label');
  return (label?.querySelector('input') as HTMLInputElement) ?? null;
};

describe('量价页 · 大促档期开关接线', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用（FiltersProvider 自带 try/catch 兜底） */
    }
  });

  it('工具行 promoOnly：有「大促档期」、无「促销权益」；默认关 → 图上无档期标志', () => {
    window.history.replaceState(null, '', '/?p=volume');
    render(<App />);
    expect(screen.getByText('大促档期')).toBeTruthy();
    expect(screen.queryByText('促销权益')).toBeNull();
    expect(promoTagButtons()).toHaveLength(0);
  });

  it('开关开 → 档期胶囊标志行出现（经典分支）；关 → 消失', () => {
    window.history.replaceState(null, '', '/?p=volume');
    render(<App />);
    const input = promoCheckboxInput();
    expect(input).toBeTruthy();
    expect(input!.checked).toBe(false);
    fireEvent.click(input!);
    expect(input!.checked).toBe(true);
    expect(promoTagButtons().length).toBeGreaterThan(0);
    fireEvent.click(input!);
    expect(promoTagButtons()).toHaveLength(0);
  });
});
