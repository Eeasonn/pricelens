// ============================================================
// 分析壳页头唯一性回归（2026-11-03 全量审查 P1）：dashboard / volume /
// marketboard / pricing 四页共享 App.AnalysisShell——页头（PageHeader）由
// 壳渲染一次。pricing 曾自带 <PageHeader /> 与壳内页头叠加成双页头（经
// ?p=pricing 或 Agent 跳入即可复现），本测试锁定每页 header.lpl-page-header
// 恰好 1 个，防止后续新分析页再犯同款。
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

  it.each(['dashboard', 'volume', 'marketboard', 'pricing'] as const)(
    '%s 页在分析壳内只渲染一个页头',
    (page) => {
      window.history.replaceState(null, '', `/?p=${page}`);
      render(<App />);
      expect(document.querySelectorAll('header.lpl-page-header')).toHaveLength(1);
    },
  );
});
