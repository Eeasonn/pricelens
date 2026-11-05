// ============================================================
// 分析壳页头唯一性回归（2026-11-03 全量审查 P1；2026-11-04 WP6 扩量）：
// dashboard / volume / marketboard / pricing / forecast 五页共享
// App.AnalysisShell——页头（PageHeader）由壳渲染一次。pricing 曾自带
// <PageHeader /> 与壳内页头叠加成双页头（经 ?p=pricing 或 Agent 跳入即可
// 复现），本测试锁定每页 header.lpl-page-header 恰好 1 个。
// WP6（8.1）：forecast 入壳后另锁三件事——①不渲染 FilterBar（fixture
// 固定样本，showFilters=false）；②全页「量价预测」aria-current="page" 恰好
// 一处（页头管理页签组的预测特例已退役）；③其余分析页的筛选条与页签
// current 不回归（切页导航行为由 marketBoardTab.test.tsx 覆盖）。
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

  it.each(['dashboard', 'volume', 'marketboard', 'pricing', 'forecast'] as const)(
    '%s 页在分析壳内只渲染一个页头',
    (page) => {
      window.history.replaceState(null, '', `/?p=${page}`);
      render(<App />);
      expect(document.querySelectorAll('header.lpl-page-header')).toHaveLength(1);
    },
  );
});

describe('量价预测入壳（WP6 8.1）', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用 */
    }
  });

  it('forecast 页不渲染 FilterBar（showFilters=false，固定样本不伪装筛选联动）', () => {
    window.history.replaceState(null, '', '/?p=forecast');
    render(<App />);
    expect(document.querySelectorAll('.lpl-fb')).toHaveLength(0);
  });

  it('forecast 页全页「量价预测」aria-current="page" 恰好一处（ChartContentBar 常态标记）', () => {
    window.history.replaceState(null, '', '/?p=forecast');
    render(<App />);
    const forecastCurrents = Array.from(document.querySelectorAll('[aria-current="page"]'))
      .filter((el) => (el.textContent ?? '').includes('量价预测'));
    expect(forecastCurrents).toHaveLength(1);
    // 页头管理页签组不再有「量价预测」入口（单 current 的另一半）
    const headerButtons = Array.from(document.querySelectorAll('header.lpl-page-header button'));
    expect(headerButtons.some((button) => (button.textContent ?? '').trim() === '量价预测')).toBe(false);
  });

  it('其余分析页不回归：dashboard 有 FilterBar，「价格走势」current 唯一且无预测 current', () => {
    window.history.replaceState(null, '', '/?p=dashboard');
    render(<App />);
    expect(document.querySelectorAll('.lpl-fb')).toHaveLength(1);
    const currents = Array.from(document.querySelectorAll('[aria-current="page"]'))
      .map((el) => (el.textContent ?? '').trim());
    expect(currents.filter((label) => label === '价格走势')).toHaveLength(1);
    expect(currents.some((label) => label.includes('量价预测'))).toBe(false);
  });
});

// ============================================================
// 迭代版通道不回归（Eason 2026-11-05 双通道指令）：vitest 运行于 dev 形态
// （import.meta.env.DEV === true）= 迭代版——「大盘走势」「量价预测」
// 「情报中心」三入口照常显示、三页照常可达。稳定版行为由
// stableChannel.test.tsx（vi.mock stable）覆盖。
// ============================================================
describe('迭代版通道（本地 dev）三入口照常', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用 */
    }
  });

  it('页头有「情报中心」，图表页签有「大盘走势」「量价预测」', () => {
    window.history.replaceState(null, '', '/?p=dashboard');
    render(<App />);
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
    expect(buttons).toContain('情报中心');
    expect(buttons).toContain('大盘走势');
    expect(buttons).toContain('量价预测');
  });

  it('?p=intelligence 直达仍可达情报中心；?p=forecast 落在量价预测页', () => {
    window.history.replaceState(null, '', '/?p=intelligence');
    render(<App />);
    expect(document.title).toContain('情报中心');
    cleanup();
    window.history.replaceState(null, '', '/?p=forecast');
    render(<App />);
    expect(document.title).toContain('量价预测');
  });
});
