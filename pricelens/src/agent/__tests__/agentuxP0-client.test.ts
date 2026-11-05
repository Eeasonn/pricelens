import { describe, expect, it, vi } from 'vitest';
import { createSseAgentClient } from '../client';
import type { AgentEvent, AgentResponse } from '../contracts';

const response = (overrides: Partial<AgentResponse> = {}): AgentResponse => ({
  intent: 'query',
  summary: '本地确定性结果',
  steps: [],
  cards: [],
  citations: [],
  suggestions: [],
  contextFingerprint: 'ctx-local',
  ...overrides,
});

const streamResponse = (frames: string[]): Response => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      frames.forEach((frame) => controller.enqueue(encoder.encode(frame)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
};

describe('agentux P0 client protocol', () => {
  it('agentux P0-1 surfaces text.delta and card.patch frames in sequence', async () => {
    const baseline = response({
      cards: [{ kind: 'filter', id: 'card-1', title: '本地口径', patch: {}, changes: [] }],
    });
    const events: AgentEvent[] = [];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(streamResponse([
      `data: ${JSON.stringify({ event: { id: 'e1', runId: 'run-1', sequence: 1, type: 'text.delta', timestamp: '2026-11-06T00:00:00.000Z', delta: '正在解析' } })}\n\n`,
      `data: ${JSON.stringify({ event: { id: 'e2', runId: 'run-1', sequence: 2, type: 'card.patch', timestamp: '2026-11-06T00:00:00.001Z', cardId: 'card-1', cardPatch: { id: 'card-1', kind: 'filter', title: '远端尝试覆盖' } } })}\n\n`,
      `data: ${JSON.stringify({ response: response({ summary: '远端叙述', contextFingerprint: 'ctx-local', cards: baseline.cards }) })}\n\n`,
    ]));
    const result = await createSseAgentClient({ baseUrl: '/api/agent', fetcher }).run({ text: '查价', context: {} as never, clientRequestId: 'req-1', runId: 'run-1', baseline }, undefined, (event) => events.push(event));
    expect(events.map((event) => event.type)).toEqual(['text.delta', 'card.patch']);
    expect(events[0]?.delta).toBe('正在解析');
    expect(events[1]?.card?.id).toBe('card-1');
    expect(events[1]?.message).toContain('本地确定性数据校准');
    expect(result.summary).toBe('远端叙述');
  });

  it('agentux P0-1 drops frames that arrive after Stop aborts the run', async () => {
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: { id: 'e1', runId: 'run-stop', sequence: 1, type: 'text.delta', timestamp: '2026-11-06T00:00:00.000Z', delta: '首字' } })}\n\n`));
      },
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 }));
    const client = createSseAgentClient({ baseUrl: '/api/agent', fetcher, timeoutMs: 1000 });
    const controller = new AbortController();
    const events: AgentEvent[] = [];
    const pending = client.run({ text: '查价', context: {} as never, clientRequestId: 'req-stop', runId: 'run-stop', baseline: response() }, controller.signal, (event) => {
      events.push(event);
      controller.abort();
      setTimeout(() => {
        streamController?.enqueue(encoder.encode(`data: ${JSON.stringify({ event: { id: 'e2', runId: 'run-stop', sequence: 2, type: 'text.delta', timestamp: '2026-11-06T00:00:00.001Z', delta: '旧事件' } })}\n\n`));
        streamController?.close();
      }, 0);
    });
    await expect(pending).rejects.toThrow('已取消');
    expect(events.map((event) => event.delta)).toEqual(['首字']);
  });

  it('agentux P0-2 keeps deterministic cards and marks remote price or SKU tampering as calibrated', async () => {
    const baselineCard = { kind: 'filter' as const, id: 'card-price', title: 'Pura 90 S Pro · 12+512GB', patch: {}, changes: [{ label: 'SKU', before: '12+512GB', after: '12+512GB' }] };
    const baseline = response({ cards: [baselineCard], citations: [{ id: 'c1', kind: 'fact', label: '本地价格', detail: '¥6999' }] });
    const remote = response({ summary: '远端把价格改成 ¥1 并换了 SKU', cards: [{ ...baselineCard, title: 'Pura 90 S Pro · 8+256GB', changes: [{ label: 'SKU', before: '8+256GB', after: '8+256GB' }] }], citations: [], contextFingerprint: 'ctx-local' });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(streamResponse([`data: ${JSON.stringify({ response: remote })}\n\n`]));
    const result = await createSseAgentClient({ baseUrl: '/api/agent', fetcher }).run({ text: '查价', context: {} as never, clientRequestId: 'req-guard', baseline });
    expect(result.cards).toEqual(baseline.cards);
    expect(result.citations).toEqual(baseline.citations);
    expect(result.factGuard?.calibrated).toBe(true);
    expect(result.factGuard?.message).toContain('本地数据校准');
  });

  it('agentux P0-2 preserves a mismatched remote fingerprint for stale_context handling', async () => {
    const baseline = response({ contextFingerprint: 'ctx-request' });
    const remote = response({ summary: '来自另一口径', contextFingerprint: 'ctx-other', cards: [] });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(streamResponse([`data: ${JSON.stringify({ response: remote })}\n\n`]));
    const result = await createSseAgentClient({ baseUrl: '/api/agent', fetcher }).run({ text: '查价', context: {} as never, clientRequestId: 'req-stale', baseline });
    expect(result.contextFingerprint).toBe('ctx-other');
    expect(result.cards).toEqual([]);
  });
});
