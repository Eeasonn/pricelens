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

  it('渲染五层卡片（参考居首/成本垫底）、演示标识与纲领要素', () => {
    render(<App />);
    const text = document.body.textContent ?? '';
    for (const label of [
      '量价预测 · 推演工作台',
      '量价预测主图',
      '量价参考',
      '大盘 · 总量总线',
      '库存验证',
      '成本销毛',
    ]) {
      expect(text).toContain(label);
    }
    // 推演纪要层已删除（Eason 2026-11-03 晚拍板）。
    expect(text).not.toContain('推演纪要');
    // 卡序（按 h2 标题 DOM 顺序）：主图 → 量价参考 → 大盘 → 库存验证 → 成本销毛垫底。
    const titles = Array.from(document.querySelectorAll('h2')).map((node) => (node.textContent ?? '').trim());
    const cardOrder = ['量价预测主图', '量价参考', '大盘 · 总量总线', '库存验证', '成本销毛']
      .map((label) => titles.findIndex((title) => title.includes(label)));
    expect(cardOrder.every((index) => index >= 0)).toBe(true);
    expect([...cardOrder].sort((a, b) => a - b)).toEqual(cardOrder);
    // 演示数据显式标识（PRODUCT.md 数据边界）。
    expect(text).toContain('模拟数据');
    expect(text).toContain('演示');
    // 量价参考 = 事实还原型输入因子卡：纯历史、无预测段。
    expect(text).toContain('纯历史 · 无预测段');
    expect(text).toContain('输入');
    expect(text).not.toContain('不进计算公式');
    // 大盘卡：AI 时间序列基线 + 预测格直接编辑 + 事件四件套。
    expect(text).toContain('下一季度预测（直接改格修正走势）');
    expect(text).toContain('影响大盘的关键事件（仅行业级 · 人工录入）');
    expect(text).toContain('下季预测');
    expect(text).toContain('衰减');
    // 库存验证：SI 按月给入 + 刚性砍话术。
    expect(text).toContain('人工 SI 计划（按月）');
    expect(text).toContain('刚性');
    // 基准演示链：W50 起刚性砍，缺口进摘要。
    expect(text).toContain('库存刚性修正（W50 起）');
    // AI 第一版标注与理由栏预填。
    expect(text).toContain('AI 推测 · 可改');
    expect(text).toContain('理由 · 为什么这么推');
    // 主图摘要四格。
    expect(text).toContain('预测期总销量');
    expect(text).toContain('大促峰 · W47');
    expect(text).toContain('预测期销毛（末端独立推测）');
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
