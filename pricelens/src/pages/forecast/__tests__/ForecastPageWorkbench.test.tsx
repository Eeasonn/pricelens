// ============================================================
// 量价预测 · 推演工作台 v2 页面组装冒烟（jsdom）：
// 六层卡片齐全、演示标识显式、摘要读数与模型一致、微调弹窗原因必填。
// 只验证 React 组装与交互开关，不验证图表像素（SVG 由 typecheck 保证结构）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

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

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import App from '../../../App';

afterEach(cleanup);

describe('量价预测推演工作台 v2 · 页面组装', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?p=forecast');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用 */
    }
  });

  it('渲染六层卡片、演示标识与主图摘要读数（W50 起库存修正）', () => {
    render(<App />);
    const text = document.body.textContent ?? '';
    for (const label of [
      '量价预测 · 推演工作台',
      '量价预测主图',
      '大盘 · 总量总线',
      '量价参考',
      '成本销毛',
      '库存验证',
      '推演纪要',
    ]) {
      expect(text).toContain(label);
    }
    // 演示数据显式标识（PRODUCT.md 数据边界）。
    expect(text).toContain('模拟数据');
    expect(text).toContain('演示');
    // 基准演示链：W50 起打折修正，缺口进摘要。
    expect(text).toContain('库存修正缺口（W50 起）');
    expect(text).toContain('9 折');
    // AI 判断标注（初始值）与理由栏预填。
    expect(text).toContain('AI 判断 · 可修改');
    expect(text).toContain('理由 · 为什么这么推');
    // 主图摘要四格。
    expect(text).toContain('预测期总销量');
    expect(text).toContain('大促峰 · W47');
    expect(text).toContain('预测期销毛');
  });

  it('预测周「微调」打开弹窗：原因未填禁用保存，填原因后可应用', () => {
    render(<App />);
    const tuneButtons = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent === '微调');
    expect(tuneButtons.length).toBe(8);
    fireEvent.click(tuneButtons[2]);
    expect(document.body.textContent).toContain('调整原因（必填）');
    const apply = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '应用并记录');
    expect(apply?.disabled).toBe(true);
    const reasonInput = document.querySelector('textarea[aria-label="调整原因（必填）"]') as HTMLTextAreaElement | null;
    expect(reasonInput).not.toBeNull();
    if (reasonInput) {
      fireEvent.change(reasonInput, { target: { value: '黑五主峰周，电商资源加投' } });
    }
    const applyAfter = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '应用并记录');
    expect(applyAfter?.disabled).toBe(false);
    if (applyAfter) {
      fireEvent.click(applyAfter);
    }
    // 应用后纪要留痕（手调类型 + 原因）。
    const text = document.body.textContent ?? '';
    expect(text).toContain('手调');
    expect(text).toContain('黑五主峰周，电商资源加投');
  });
});
