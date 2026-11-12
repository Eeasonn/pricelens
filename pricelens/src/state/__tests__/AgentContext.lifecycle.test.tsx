// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AgentEvent, AgentResponse } from '../../agent/contracts';

type Request = { text: string; runId?: string; clientRequestId: string; context: { fingerprint: string }; baseline?: AgentResponse };
type Pending = {
  request: Request;
  signal?: AbortSignal;
  emit: (event: Partial<AgentEvent>) => void;
  resolve: (summary?: string) => void;
  reject: (error: unknown) => void;
};

const bridge = vi.hoisted(() => ({ iterate: [] as Pending[], stable: [] as Pending[] }));

function responseFor(text: string, context: { fingerprint: string }): AgentResponse {
  return {
    intent: 'query', summary: `完成：${text}`, steps: [], citations: [], suggestions: [],
    contextFingerprint: context.fingerprint,
    cards: [{ kind: 'filter', id: `card-${text}`, title: '筛选预览', patch: { currency: 'local' }, changes: [] }],
  };
}

function clientFor(channel: keyof typeof bridge) {
  return {
    run: (request: Request, signal?: AbortSignal, onEvent?: (event: AgentEvent) => void) => new Promise<AgentResponse>((resolve, reject) => {
      let sequence = 0;
      bridge[channel].push({
        request, signal, reject,
        emit: (event) => onEvent?.({ id: `event-${++sequence}`, sequence, runId: request.runId!, timestamp: new Date().toISOString(), type: 'text.delta', status: 'partial_result', ...event }),
        resolve: (summary) => resolve({ ...responseFor(request.text, request.context), ...(summary ? { summary } : {}) }),
      });
    }),
  };
}

vi.mock('../../components/AlertCenter', () => ({ useAlerts: () => [] }));
vi.mock('../../agent', async (original) => ({
  ...await original<typeof import('../../agent')>(),
  runAgent: async (text: string, context: { fingerprint: string }) => responseFor(text, context),
  defaultAgentClient: () => clientFor('iterate'),
}));
vi.mock('../../agent-stable', async (original) => ({
  ...await original<typeof import('../../agent-stable')>(),
  runAgent: async (text: string, context: { fingerprint: string }) => responseFor(text, context),
  defaultAgentClient: () => clientFor('stable'),
}));

import { AgentProvider as IterateProvider, useAgent as useIterate } from '../AgentContext';
import { AgentProvider as StableProvider, useAgent as useStable } from '../AgentContextStable';
import { FiltersProvider } from '../FiltersContext';
import { PageProvider } from '../PageContext';

beforeEach(() => {
  if (!window.localStorage) {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, String(value)); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    } });
  }
  window.history.replaceState(null, '', '/?p=dashboard');
  window.localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  bridge.iterate.length = 0;
  bridge.stable.length = 0;
});

for (const channel of ['iterate', 'stable'] as const) {
  const Provider = channel === 'iterate' ? IterateProvider : StableProvider;
  const useAgent = channel === 'iterate' ? useIterate : useStable;
  const wrapper = ({ children }: { children: ReactNode }) => <PageProvider><FiltersProvider><Provider>{children}</Provider></FiltersProvider></PageProvider>;

  describe(`${channel} request lifecycle`, () => {
    it('admits one synchronous submission and keeps the assistant ID through completion', async () => {
      const { result } = renderHook(() => useAgent(), { wrapper });
      act(() => { void result.current.send('查询一'); void result.current.send('重复提交'); });
      await waitFor(() => expect(bridge[channel]).toHaveLength(1));
      expect(result.current.messages.filter((message) => message.role === 'user')).toHaveLength(1);
      const id = result.current.messages.find((message) => message.role === 'assistant')!.id;
      act(() => bridge[channel][0].emit({ delta: '已读取第一批事实' }));
      expect(result.current.messages.find((message) => message.id === id)?.text).toBe('已读取第一批事实');
      await act(async () => bridge[channel][0].resolve());
      expect(result.current.messages.filter((message) => message.role === 'assistant')).toHaveLength(1);
      expect(result.current.messages.find((message) => message.id === id)).toMatchObject({ text: '完成：查询一', status: 'completed', actionsLocked: false });
    });

    it('preserves cancelled partial output and isolates the next stream from late completion', async () => {
      const { result } = renderHook(() => useAgent(), { wrapper });
      act(() => { void result.current.send('旧查询'); });
      await waitFor(() => expect(bridge[channel]).toHaveLength(1));
      const old = bridge[channel][0];
      act(() => old.emit({ delta: '取消前已经生成的内容' }));
      const oldId = result.current.messages.find((message) => message.role === 'assistant')!.id;
      act(() => { result.current.stop(); void result.current.send('新查询'); });
      expect(old.signal?.aborted).toBe(true);
      await waitFor(() => expect(bridge[channel]).toHaveLength(2));
      act(() => bridge[channel][1].emit({ delta: '新查询正在生成' }));
      act(() => result.current.setDraft('还没发送的下一个问题'));
      await act(async () => old.resolve('不应出现的旧结果'));
      expect(result.current.running).toBe(true);
      expect(result.current.messages.find((message) => message.id === oldId)).toMatchObject({ text: '取消前已经生成的内容\n\n已取消这次查询。', status: 'cancelled', actionsLocked: true });
      expect(result.current.messages.slice(-1)[0]?.text).toBe('新查询正在生成');
      if ('partialText' in result.current) expect(result.current.partialText).toBe('新查询正在生成');
      expect(result.current.draft).toBe('还没发送的下一个问题');
      await act(async () => bridge[channel][1].resolve());
      expect(result.current.messages.slice(-1)[0]?.text).toBe('完成：新查询');
      expect(result.current.draft).toBe('还没发送的下一个问题');
    });

    it('ignores wrong-run and repeated stream events', async () => {
      const { result } = renderHook(() => useAgent(), { wrapper });
      act(() => { void result.current.send('查询'); });
      await waitFor(() => expect(bridge[channel]).toHaveLength(1));
      act(() => {
        bridge[channel][0].emit({ sequence: 1, delta: '有效' });
        bridge[channel][0].emit({ sequence: 1, delta: '重复' });
        bridge[channel][0].emit({ sequence: 20, runId: 'other-run', delta: '串流' });
        bridge[channel][0].emit({ sequence: 2, delta: '内容' });
      });
      expect(result.current.messages.slice(-1)[0]?.text).toBe('有效内容');
      await act(async () => bridge[channel][0].resolve());
    });

    it('retains partial evidence on failure without treating it as a finished actionable answer', async () => {
      const { result } = renderHook(() => useAgent(), { wrapper });
      act(() => { void result.current.send('查询'); });
      await waitFor(() => expect(bridge[channel]).toHaveLength(1));
      const pending = bridge[channel][0];
      act(() => {
        pending.emit({ delta: '已读取部分事实' });
        pending.emit({ type: 'card.patch', cardId: pending.request.baseline!.cards[0].id, card: pending.request.baseline!.cards[0] });
      });
      await act(async () => pending.reject(new Error('连接中断')));
      expect(result.current.messages.slice(-1)[0]).toMatchObject({ text: '已读取部分事实\n\n这次运行没有完成：连接中断', status: 'failed', kind: 'error', actionsLocked: true });
      expect(result.current.messages.slice(-1)[0]?.partialCards).toHaveLength(1);
      expect(result.current.messages.slice(-1)[0]?.response).toBeUndefined();
      expect(result.current.running).toBe(false);
    });

    it('aborts an active request on provider unmount', async () => {
      const { result, unmount } = renderHook(() => useAgent(), { wrapper });
      act(() => { void result.current.send('查询'); });
      await waitFor(() => expect(bridge[channel]).toHaveLength(1));
      const pending = bridge[channel][0];
      unmount();
      expect(pending.signal?.aborted).toBe(true);
      await act(async () => pending.resolve());
    });

    it('does not discard a next-question draft when cancelling the current answer', async () => {
      const { result } = renderHook(() => useAgent(), { wrapper });
      act(() => { void result.current.send('查询'); });
      await waitFor(() => expect(bridge[channel]).toHaveLength(1));
      act(() => result.current.setDraft('待发送的问题'));
      act(() => result.current.stop());
      expect(result.current.draft).toBe('待发送的问题');
      await act(async () => bridge[channel][0].resolve());
      expect(result.current.draft).toBe('待发送的问题');
    });
  });
}
