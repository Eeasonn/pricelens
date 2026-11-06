// ============================================================
// t428u Batch1 返修 R3（二轮）：普通异常失败 ≠ cancelled。
// run() 抛出非 AbortError 异常时：runStatus=failed、错误消息可重试，
// 残留 running/queued 工具卡收敛为「失败」而非「已取消」；
// 用户取消（AbortError / stop）仍收敛为「已取消」。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AgentEvent, AgentRunRequest } from '../../agent';

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

// 先推流事件制造 running 工具卡，再以普通异常失败（非 AbortError）——
// 与远端 SSE 中途断流的真实失败形态一致。
const failureClient = vi.hoisted(() => ({
  rejectWith: '远端 Agent 服务异常' as string,
}));

vi.mock('../../agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent')>();
  return {
    ...actual,
    defaultAgentClient: () => ({
      run: (request: AgentRunRequest, _signal?: AbortSignal, onEvent?: (event: AgentEvent) => void) =>
        new Promise((_resolve, reject) => {
          const event = (sequence: number, type: AgentEvent['type'], message: string): void => {
            onEvent?.({
              id: `evt-${sequence}`,
              runId: request.runId ?? request.clientRequestId,
              sequence,
              type,
              status: 'tool_running',
              timestamp: new Date().toISOString(),
              message,
              tool: 'series.query',
              stepId: 'live-query',
            });
          };
          event(1, 'step.started', '正在读取确定性价格工具');
          event(2, 'step.updated', '正在读取真实价格事实');
          setTimeout(() => reject(new Error(failureClient.rejectWith)), 30);
        }),
    }),
  };
});

import App from '../../App';

beforeEach(() => {
  const w = window as unknown as { localStorage?: Storage };
  if (!w.localStorage) {
    const mem = new Map<string, string>();
    const shim: Storage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, String(v)),
      removeItem: (k) => void mem.delete(k),
      clear: () => void mem.clear(),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
    Object.defineProperty(w, 'localStorage', { configurable: true, value: shim });
  }
  window.history.replaceState(null, '', '/?p=dashboard');
  sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(cleanup);

function openPanel(): HTMLElement {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
  return screen.getByRole('dialog');
}

async function sendFromPanel(panel: HTMLElement, text: string): Promise<void> {
  const input = within(panel).getByLabelText('向 PriceLens Agent 提问');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(within(panel).getByRole('button', { name: '发送' }));
}

describe('t428u 返修 R3（二轮）· 普通异常失败不冒充取消', () => {
  it('非 AbortError 异常：runStatus=failed，残留 running 工具卡收敛为「失败」而非「已取消」', async () => {
    const panel = openPanel();
    await sendFromPanel(panel, '价格优势');
    await waitFor(() => expect(within(panel).getByText(/这次运行没有完成：远端 Agent 服务异常/)).toBeTruthy(), { timeout: 4000 });
    // 状态语义：failed 而非 cancelled
    expect(within(panel).getByText('运行失败 · 可重试')).toBeTruthy();
    expect(within(panel).queryByText('已取消本次运行')).toBeNull();
    expect(within(panel).queryByText('已取消这次查询。')).toBeNull();
    // 残留 running/queued 工具卡全部收敛为错误态，且带可见的失败说明
    expect(panel.querySelectorAll('[data-tool-status="running"], [data-tool-status="queued"]')).toHaveLength(0);
    expect(panel.querySelectorAll('[data-tool-status="cancelled"]')).toHaveLength(0);
    const failedCards = panel.querySelectorAll('[data-tool-status="failed"]');
    expect(failedCards.length).toBeGreaterThan(0);
    for (const card of failedCards) expect(card.textContent).toContain('失败');
    // 错误消息保留 prompt，可一键重试
    expect(within(panel).getByRole('button', { name: '重试' })).toBeTruthy();
  });
});
