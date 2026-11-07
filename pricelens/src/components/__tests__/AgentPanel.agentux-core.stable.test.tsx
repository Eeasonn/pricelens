// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// 2026-11-07 整合：稳定栈只在稳定构建启用，其测试按出货通道（STABLE）运行
vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
  resolveAppChannel: (): 'stable' => 'stable',
}));
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), clear: vi.fn(), dispose: vi.fn() })),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, ScatterChart: {} }));
vi.mock('echarts/components', () => ({
  GridComponent: {}, TooltipComponent: {}, LegendComponent: {}, MarkAreaComponent: {},
  MarkLineComponent: {}, MarkPointComponent: {}, DataZoomComponent: {}, BrushComponent: {}, VisualMapComponent: {},
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

describe('agentux-core AgentPanel interaction', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?p=dashboard');
    sessionStorage.clear();
    try { localStorage.clear(); } catch { /* FiltersProvider has an in-memory fallback. */ }
  });

  it('agentux-core opens explicit core chips and renders the deterministic price advantage card', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByRole('button', { name: '价格优势' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: '价格预警' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: '基础我司快搜' })).toBeTruthy();

    fireEvent.click(within(panel).getByRole('button', { name: '价格优势' }));
    await waitFor(() => expect(within(panel).getByText('价格优势对比')).toBeTruthy(), { timeout: 4000 });
    expect(within(panel).getByText('只看占优机型')).toBeTruthy();
    expect(within(panel).getAllByText('本地确定性').length).toBeGreaterThan(0);
  });

});
