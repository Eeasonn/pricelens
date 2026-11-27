// ============================================================
// 分析壳页头唯一性回归（2026-11-03 全量审查 P1）：
// dashboard / volume / pricing 三页共享 App.AnalysisShell——页头（PageHeader）
// 由壳渲染一次。pricing 曾自带 <PageHeader /> 与壳内页头叠加成双页头（经
// ?p=pricing 或 Agent 跳入即可复现），本测试锁定每页 header.lpl-page-header
// 恰好 1 个。
// 另锁：分析页的筛选条与页签 current 不回归（dashboard 有 FilterBar，
// 「价格走势」current 唯一且无预测 current）。
// 2026-11-27（演进版退场）：大盘走势 / 量价预测两页下线，页头唯一性用例随之
// 收敛到三页；原「量价预测入壳」两例与「迭代版通道三入口照常」两例随页面删除，
// 下线页的老链接兜底见 retiredPages.test.tsx。
// echarts 在 jsdom 无 canvas：mock 'echarts/core' 等模块（Chart 需要
// setOption/resize/clear/dispose），只验证 React 组装不验证图表渲染。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

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

import App from '../../App';

afterEach(cleanup);

describe('AnalysisShell 页头唯一性', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用（FiltersProvider 自带 try/catch 兜底） */
    }
  });

  it.each(['dashboard', 'volume', 'pricing'] as const)(
    '%s 页在分析壳内只渲染一个页头',
    (page) => {
      window.history.replaceState(null, '', `/?p=${page}`);
      render(<App />);
      expect(document.querySelectorAll('header.lpl-page-header')).toHaveLength(1);
    },
  );
});

describe('其余分析页不回归', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用（FiltersProvider 自带 try/catch 兜底） */
    }
  });

  it('dashboard 有 FilterBar，「价格走势」current 唯一且无预测 current', () => {
    window.history.replaceState(null, '', '/?p=dashboard');
    render(<App />);
    expect(document.querySelectorAll('.lpl-fb')).toHaveLength(1);
    const currents = Array.from(document.querySelectorAll('[aria-current="page"]'))
      .map((el) => (el.textContent ?? '').trim());
    expect(currents.filter((label) => label === '价格走势')).toHaveLength(1);
    expect(currents.some((label) => label.includes('量价预测'))).toBe(false);
  });
});
