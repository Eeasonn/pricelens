import { describe, expect, it, vi } from 'vitest';
// 2026-11-07 整合：稳定栈只在稳定构建启用，其测试按出货通道（STABLE）运行
vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
  resolveAppChannel: (): 'stable' => 'stable',
}));
import { createSseAgentClient } from '../client';
import type { AgentEvent, AgentResponse } from '../contracts';

const baseline: AgentResponse = {
  intent: 'query',
  summary: '本地结果',
  steps: [],
  cards: [],
  citations: [],
  suggestions: [],
  contextFingerprint: 'ctx-stream',
};

describe('agentux-core streaming guard', () => {
  it('agentux-core emits incremental text before completion and drops frames after Stop', async () => {
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: { id: 'event-1', runId: 'run-stop', sequence: 1, type: 'text.delta', timestamp: '2026-11-06T00:00:00.000Z', delta: '首字' } })}\n\n`));
      },
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 }));
    const controller = new AbortController();
    const events: AgentEvent[] = [];
    const pending = createSseAgentClient({ baseUrl: '/api/agent', fetcher }).run(
      { text: '价格优势', context: {} as never, clientRequestId: 'req-stop', runId: 'run-stop', baseline },
      controller.signal,
      (event) => {
        events.push(event);
        controller.abort();
        setTimeout(() => {
          streamController?.enqueue(encoder.encode(`data: ${JSON.stringify({ event: { id: 'event-2', runId: 'run-stop', sequence: 2, type: 'text.delta', timestamp: '2026-11-06T00:00:00.001Z', delta: '旧事件' } })}\n\n`));
          streamController?.close();
        }, 0);
      },
    );
    await expect(pending).rejects.toThrow('已取消');
    expect(events.map((event) => event.delta)).toEqual(['首字']);
  });

  it('agentux-core exposes a failed remote step before an HTTP fallback response', async () => {
    const fallback: AgentResponse = {
      ...baseline,
      summary: '本地回退结果',
      provider: { name: '本地确定性回退', model: 'local' },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ fallback }), { status: 502, headers: { 'content-type': 'application/json' } }));
    const events: AgentEvent[] = [];
    const result = await createSseAgentClient({ baseUrl: '/api/agent', fetcher }).run(
      { text: '价格预警', context: {} as never, clientRequestId: 'req-fallback', runId: 'run-fallback', baseline },
      undefined,
      (event) => events.push(event),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'step.updated', status: 'failed', tool: 'catalog.resolve' });
    expect(events[0]?.message).toContain('远端 Agent 服务不可达');
    expect(result.provider?.name).toBe('本地确定性回退');
    expect(result.fallbackReason).toContain('502');
  });
});
