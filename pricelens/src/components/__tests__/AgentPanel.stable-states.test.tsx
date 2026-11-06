// ============================================================
// t428u Batch1（稳定线）：Agent 面板结果卡 / 证据 / 状态交互测试。
// 覆盖：固定结构分节顺序、真实药丸动作（跳页导航 + 证据原地展开聚焦）、
// 证据快照未知时间显示「待确认」、无证据空态、running 可取消 + cancelled
// 可重试。echarts/ResizeObserver mock 同 AgentPanel.agentux-core.test.tsx。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function resetTo(path: string): void {
  window.history.replaceState(null, '', path);
  sessionStorage.clear();
  try { localStorage.clear(); } catch { /* FiltersProvider has an in-memory fallback. */ }
}

async function openPanelAndRunPriceAdvantage(): Promise<HTMLElement> {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
  const panel = screen.getByRole('dialog');
  fireEvent.click(within(panel).getByRole('button', { name: '价格优势' }));
  await waitFor(() => expect(within(panel).getByText('价格优势对比')).toBeTruthy(), { timeout: 4000 });
  return panel;
}

describe('t428u AgentPanel · 结果卡固定结构与证据', () => {
  beforeEach(() => resetTo('/?p=dashboard'));

  it('价格优势卡按 事实 → 计算与规则 → 判断边界 分节呈现', async () => {
    const panel = await openPanelAndRunPriceAdvantage();
    const sections = Array.from(panel.querySelectorAll('[data-agent-card-section]')).map((node) => node.getAttribute('data-agent-card-section'));
    expect(sections).toEqual(['事实', '计算与规则', '判断边界']);
    expect(within(panel).getByText(/按 .* × 渠道 × 周对齐折后价/)).toBeTruthy();
  });

  it('查看证据原地展开证据区并把焦点移到可聚焦标题；快照时间未知显示待确认', async () => {
    const panel = await openPanelAndRunPriceAdvantage();
    expect(within(panel).queryByText(/暂无快照/)).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: '查看证据' }));
    const summary = await waitFor(() => {
      const node = Array.from(panel.querySelectorAll('summary')).find((item) => (item.textContent ?? '').includes('证据与来源 · 1'));
      expect(node).toBeDefined();
      return node!;
    });
    const details = summary.closest('details');
    expect(details?.open).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(within(panel).getByText(/来源：统一价格聚合引擎 · 快照：待确认/)).toBeTruthy();
  });

  it('无证据的结果卡（筛选预览）诚实显示暂无快照，不渲染链接或数字', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
    const panel = screen.getByRole('dialog');
    const input = within(panel).getByLabelText('向 PriceLens Agent 提问');
    fireEvent.change(input, { target: { value: '只看本币' } });
    fireEvent.click(within(panel).getByRole('button', { name: '发送' }));
    await waitFor(() => expect(within(panel).getByText('筛选预览（尚未应用）')).toBeTruthy(), { timeout: 4000 });
    expect(within(panel).getByText(/暂无快照 · 待接入/)).toBeTruthy();
    expect(within(panel).queryByRole('link')).toBeNull();
  });
});

describe('t428u AgentPanel · 药丸动作真实跳转（保留当前上下文口径）', () => {
  beforeEach(() => resetTo('/?p=volume'));

  it('回看价格走势：从量价走势跳回价格走势页', async () => {
    const panel = await openPanelAndRunPriceAdvantage();
    expect(document.title).toContain('量价走势');
    fireEvent.click(within(panel).getByRole('button', { name: '回看价格走势' }));
    await waitFor(() => expect(document.title).toContain('价格走势'));
    expect(document.title).not.toContain('量价走势');
  });

  it('打开价格预警：跳到预警页', async () => {
    const panel = await openPanelAndRunPriceAdvantage();
    fireEvent.click(within(panel).getByRole('button', { name: '打开价格预警' }));
    await waitFor(() => expect(document.title).toContain('预警'));
  });
});

describe('t428u AgentPanel · running 可取消，cancelled 可重试', () => {
  beforeEach(() => resetTo('/?p=dashboard'));

  it('运行中点「取消本次调用」→ 已取消提示 + 重试本次查询入口', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
    const panel = screen.getByRole('dialog');
    fireEvent.click(within(panel).getByRole('button', { name: '价格优势' }));
    fireEvent.click(within(panel).getByRole('button', { name: '取消本次调用' }));
    await waitFor(() => expect(within(panel).getByText('已取消这次查询。')).toBeTruthy(), { timeout: 4000 });
    expect(within(panel).getByRole('button', { name: '重试本次查询' })).toBeTruthy();
  });
});
