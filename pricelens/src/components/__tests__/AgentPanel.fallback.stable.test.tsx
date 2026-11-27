// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../agent-stable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent-stable')>();
  return {
    ...actual,
    defaultAgentClient: () => actual.withLocalFallback({
      run: async () => { throw new Error('Agent 服务异常（501）'); },
    }, actual.localAgentClient),
  };
});

import App from '../../App';

beforeEach(() => {
  window.history.replaceState(null, '', '/?p=dashboard');
  sessionStorage.clear();
  try { localStorage.clear(); } catch { /* FiltersProvider has an in-memory fallback. */ }
});
afterEach(cleanup);

describe('stable Agent · 本地回退透明度', () => {
  it('运行中展开工具活动，完成后就近披露回退原因与明确工具终态', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /打开 PriceAgent/ }));
    const panel = screen.getByRole('dialog');
    fireEvent.click(within(panel).getByRole('button', { name: '价格优势' }));

    await waitFor(() => expect(panel.querySelector('[data-agent-execution]')).not.toBeNull());
    expect((panel.querySelector('[data-agent-execution]') as HTMLDetailsElement).open).toBe(true);

    await waitFor(() => expect(within(panel).getByText('价格优势对比')).toBeTruthy(), { timeout: 4000 });
    const fallback = within(panel).getByText('本地回退结果', { exact: false }).closest('[data-agent-fallback]')!;
    expect(fallback.textContent).toContain('501');
    expect(fallback.textContent).toContain('开放原因分析');
    expect(fallback.tagName).toBe('DETAILS');
    expect((fallback as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(within(fallback as HTMLElement).getByText('本地回退结果', { exact: false }));
    expect((fallback as HTMLDetailsElement).open).toBe(true);
    const scope = panel.querySelector('[data-agent-scope]')!;
    expect(fallback.compareDocumentPosition(scope) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(panel).getByText(/执行记录 · \d+ 成功 · 1 失败/)).toBeTruthy();
    expect(within(panel).queryByText(/执行记录 · \d+\/\d+ 完成/)).toBeNull();
    expect((panel.querySelector('[data-agent-execution]') as HTMLDetailsElement).open).toBe(true);
  });
});
