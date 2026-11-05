import { describe, expect, it, vi } from 'vitest';
import { createSseAgentClient, mergeRemoteResponse } from '../client';
import type { AgentEvent, AgentResponse } from '../contracts';

const baseline: AgentResponse = {
  intent: 'query',
  summary: '本地确定性结果',
  steps: [{ id: 'step-1', tool: 'series.query', label: '查价', status: 'success', detail: '已读取本地数据', durationMs: 4 }],
  cards: [{
    kind: 'table',
    id: 'card-1',
    title: '价格事实',
    columns: ['产品', '价格'],
    rows: [['Pura 90s Pro · 12+256 GB · sku-256', '¥4,999']],
  }],
  citations: [{ id: 'cite-1', kind: 'fact', label: '本地价格事实', detail: '本地确定性引擎' }],
  suggestions: [],
  contextFingerprint: 'ctx-1',
  coverage: { covered: 1, total: 1 },
};

const streamOf = (chunks: string[]): ReadableStream<Uint8Array> => new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder();
    chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
    controller.close();
  },
});

describe('agentux P0-1 streaming client', () => {
  it('agentux P0-1 emits incremental text events frame by frame before the final response', async () => {
    const events: AgentEvent[] = [];
    const remote: AgentResponse = { ...baseline, summary: '远端总结', provider: { name: 'remote', model: 'glm' } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(streamOf([
      `event: text.delta\ndata: ${JSON.stringify({ event: { id: 'e-1', runId: 'run-1', sequence: 1, type: 'text.delta', timestamp: '2026-11-06T00:00:00Z', delta: '正在查价' } })}\n\n`,
      `data: ${JSON.stringify({ response: remote })}\n\n`,
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const client = createSseAgentClient({ baseUrl: '/api/agent', fetcher });
    const result = await client.run({ text: '查询价格', context: {} as never, clientRequestId: 'req-1', baseline }, undefined, (event) => events.push(event));
    expect(events.map((event) => event.delta)).toEqual(['正在查价']);
    expect(result.summary).toBe('远端总结');
    expect(result.cards).toEqual(baseline.cards);
  });

  it('agentux P0-1 stops consuming old SSE events after the caller aborts', async () => {
    const controller = new AbortController();
    const events: AgentEvent[] = [];
    const remote: AgentResponse = { ...baseline, provider: { name: 'remote', model: 'glm' } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(streamOf([
      `event: text.delta\ndata: ${JSON.stringify({ event: { id: 'e-1', runId: 'run-1', sequence: 1, type: 'text.delta', timestamp: '2026-11-06T00:00:00Z', delta: '首字' } })}\n\n`,
      `event: text.delta\ndata: ${JSON.stringify({ event: { id: 'e-2', runId: 'run-1', sequence: 2, type: 'text.delta', timestamp: '2026-11-06T00:00:01Z', delta: '旧事件' } })}\n\n`,
      `data: ${JSON.stringify({ response: remote })}\n\n`,
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    await expect(createSseAgentClient({ baseUrl: '/api/agent', fetcher }).run(
      { text: '查询价格', context: {} as never, clientRequestId: 'req-stop', baseline },
      controller.signal,
      (event) => {
        events.push(event);
        if (event.sequence === 1) controller.abort();
      },
    )).rejects.toThrow('已取消');
    expect(events.map((event) => event.delta)).toEqual(['首字']);
  });
});

describe('agentux P0-2 deterministic fact guard', () => {
  it('agentux P0-2 keeps deterministic price/SKU cards and adds a calibration marker when remote facts differ', () => {
    const remote: AgentResponse = {
      ...baseline,
      summary: '远端声称价格 ¥999，SKU fake-sku',
      cards: [{ kind: 'table', id: 'card-1', title: '价格事实', columns: ['产品', '价格'], rows: [['Pura 90s Pro · fake-sku', '¥999']] }],
      contextFingerprint: 'ctx-1',
    };
    const merged = mergeRemoteResponse(baseline, remote);
    expect(merged.cards).toEqual(baseline.cards);
    expect(merged.summary).toContain('¥999');
    expect(merged.factGuard).toMatchObject({ calibrated: true });
    expect(merged.factGuard?.message).toContain('本地数据校准');
  });

  it('agentux P0-2 preserves the remote fingerprint for stale-context handling', () => {
    const merged = mergeRemoteResponse(baseline, { ...baseline, contextFingerprint: 'ctx-other' });
    expect(merged.contextFingerprint).toBe('ctx-other');
    expect(merged.cards).toEqual(baseline.cards);
  });

  it('agentux P0-2 marks a remote-only price claim even when structured cards are unchanged', () => {
    const merged = mergeRemoteResponse(baseline, { ...baseline, summary: '远端声称当前价格为 ¥999，SKU fake-sku' });
    expect(merged.cards).toEqual(baseline.cards);
    expect(merged.factGuard?.calibrated).toBe(true);
    expect(merged.factGuard?.rejectedFields).toContain('summary.price/sku');
  });
});
