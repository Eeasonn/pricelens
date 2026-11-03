// ============================================================
// 量价预测 · 推演工作台 v2 页面组装冒烟（jsdom）：
// 五层卡片齐全、演示标识显式、大盘卡单线连贯/事件三参数、摘要读数与模型
// 一致、微调弹窗原因必填（原因标注在主图手调处，无纪要层）。
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

  it('渲染五层卡片、演示标识、大盘单线连贯与事件三参数（W50 起库存修正）', () => {
    render(<App />);
    const text = document.body.textContent ?? '';
    for (const label of [
      '量价预测 · 推演工作台',
      '量价预测主图',
      '大盘 · 总量总线',
      '量价参考',
      '成本销毛',
      '库存验证',
    ]) {
      expect(text).toContain(label);
    }
    // 推演纪要层已删除（Eason 2026-11-03 晚拍板）。
    expect(text).not.toContain('推演纪要');
    // 演示数据显式标识（PRODUCT.md 数据边界）。
    expect(text).toContain('模拟数据');
    expect(text).toContain('演示');
    // 大盘卡：单线连贯（2025Q1 起）+ 只预测下一季 + 行业级事件三参数。
    expect(text).toContain('季度环比趋势（自 2026Q4 起逐季延续）');
    expect(text).toContain('影响大盘的关键事件（仅行业级）');
    expect(text).toContain('下季预测');
    expect(text).toContain('生效季');
    expect(text).toContain('持续');
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

  it('预测周「微调」打开弹窗：原因未填禁用保存，填原因后应用', () => {
    render(<App />);
    const tuneButtons = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent === '微调');
    expect(tuneButtons.length).toBe(8);
    fireEvent.click(tuneButtons[2]);
    expect(document.body.textContent).toContain('调整原因（必填）');
    // antd Button 中文两字自动字间空格（「应 用」），匹配用归一化。
    const applyButton = () => Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    expect(applyButton()?.disabled).toBe(true);
    const reasonInput = document.querySelector('textarea[aria-label="调整原因（必填）"]') as HTMLTextAreaElement | null;
    expect(reasonInput).not.toBeNull();
    if (reasonInput) {
      fireEvent.change(reasonInput, { target: { value: '黑五主峰周，电商资源加投' } });
    }
    expect(applyButton()?.disabled).toBe(false);
    const applyAfter = applyButton();
    if (applyAfter) {
      fireEvent.click(applyAfter);
    }
    // 无纪要层：原因随主图手调状态保留（模型层断言），页面不再展示留痕时间线。
    expect(document.body.textContent ?? '').not.toContain('推演纪要');
  });
});
