// ============================================================
// t428u Batch1 返修 R8-1：异步响应迟到时的防串写守卫。
// AgentContext 在响应返回处有双重守卫：
//   1) runSequence（request id）不匹配 → 直接丢弃，不写任何状态；
//   2) 响应携带的 contextFingerprint 与请求不一致 → 结果保留但按
//      stale_context 标注，不冒充当前口径。
// 本文件用可挂起的 defaultAgentClient mock 精确控制响应到达时机。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AgentRunRequest } from '../../agent';

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

interface PendingRun {
  request: AgentRunRequest;
  /** 释放挂起的响应（可选覆写 summary / contextFingerprint，模拟远端迟到与串指纹）。 */
  release: (override?: { summary?: string; contextFingerprint?: string }) => void;
}

const bridge = vi.hoisted(() => ({ pending: [] as Array<{ request: unknown; release: (override?: { summary?: string; contextFingerprint?: string }) => void }> }));

vi.mock('../../agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent')>();
  return {
    ...actual,
    // 挂起式 client：run() 永不自行 settle，只有测试 release 才送达响应——
    // 模拟「远端已收到请求、响应晚到 / 取消后仍返回」的真实竞态。
    defaultAgentClient: () => ({
      run: (request: AgentRunRequest) =>
        new Promise((resolve) => {
          bridge.pending.push({
            request,
            release: (override: { summary?: string; contextFingerprint?: string } = {}) => {
              // signal 传 undefined：迟到响应在远端已算完，abort 追不上它
              void actual.runAgent(request.text, request.context, undefined, request.intent, request.forecastDraft, request.forecastSnapshot, request.forecastDataset)
                .then((response) => resolve({ ...response, ...override }));
            },
          });
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

afterEach(() => {
  cleanup();
  bridge.pending.length = 0;
});

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

describe('t428u 返修 R8 · AgentContext 迟到响应防串写', () => {
  it('request id 已过期的迟到响应被丢弃：不覆盖取消态，也不影响新会话写入', async () => {
    const panel = openPanel();
    await sendFromPanel(panel, '第一次查询');
    await waitFor(() => expect(bridge.pending.length).toBe(1));
    fireEvent.click(within(panel).getByRole('button', { name: '停止运行' }));
    await waitFor(() => expect(within(panel).getByText('已取消这次查询。')).toBeTruthy());
    await sendFromPanel(panel, '第二次查询');
    await waitFor(() => expect(bridge.pending.length).toBe(2));
    // 第一次的响应此刻迟到送达（summary 已被覆写成可识别文本）
    (bridge.pending[0] as PendingRun).release({ summary: '第一次查询的迟到结果' });
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    expect(within(panel).queryByText('第一次查询的迟到结果')).toBeNull();
    expect(within(panel).getByText('已取消这次查询。')).toBeTruthy();
    // 守卫没有误伤：新会话的响应仍正常写入
    (bridge.pending[1] as PendingRun).release({ summary: '第二次查询的结果' });
    await waitFor(() => expect(within(panel).getByText('第二次查询的结果')).toBeTruthy(), { timeout: 4000 });
  });

  it('响应携带的 contextFingerprint 与请求不一致：按 stale_context 标注，不冒充当前口径', async () => {
    const panel = openPanel();
    await sendFromPanel(panel, '查看当前我司产品价格概览');
    await waitFor(() => expect(bridge.pending.length).toBe(1));
    (bridge.pending[0] as PendingRun).release({ contextFingerprint: 'ctx-forged-scope' });
    await waitFor(() => expect(within(panel).getByText('筛选已变化 · 结果需重新确认')).toBeTruthy(), { timeout: 4000 });
    // 结果仍可查看（确定性结果不丢），但状态明确要求重新确认口径
    expect(within(panel).getAllByText(/已按当前页面整理/).length).toBeGreaterThan(0);
    expect(within(panel).queryByText('结果已在 Agent 面板生成')).toBeNull();
  });
});
