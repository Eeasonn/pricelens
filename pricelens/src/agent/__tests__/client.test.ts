import { describe, expect, it, vi } from 'vitest';
import { createSseAgentClient, parseSseFrames } from '../client';
import type { AgentResponse } from '../contracts';

describe('SSE Agent client', () => {
  it('reconstructs a completed structured response from event frames', async () => {
    const response: AgentResponse = { intent: 'query', summary: 'ok', steps: [], cards: [], citations: [], suggestions: [], contextFingerprint: 'ctx-test' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(`event: result.upsert\ndata: ${JSON.stringify({ response })}\n\nevent: run.completed\ndata: ${JSON.stringify({ response })}\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const client = createSseAgentClient({ baseUrl: '/api/agent', fetcher });
    const result = await client.run({ text: '查询价格', context: {} as never, clientRequestId: 'req-1' });
    expect(result.summary).toBe('ok');
    expect(fetcher).toHaveBeenCalledWith('/api/agent/runs', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ accept: 'text/event-stream' }) }));
  });

  it('forwards an explicit forecast intent and active What-if draft to the remote adapter', async () => {
    const response: AgentResponse = { intent: 'forecast_explain', summary: 'ok', steps: [], cards: [], citations: [], suggestions: [], contextFingerprint: 'ctx-test' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(`data: ${JSON.stringify({ response })}\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const client = createSseAgentClient({ baseUrl: '/api/agent', fetcher });
    await client.run({ text: '随便一句话', context: {} as never, clientRequestId: 'req-intent', intent: 'forecast_explain', forecastDraft: { priceDeltaPct: -5, promoDeltaPct: 0, supplyDeltaPct: 0 } });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.intent).toBe('forecast_explain');
    expect(body.forecastDraft).toEqual({ priceDeltaPct: -5, promoDeltaPct: 0, supplyDeltaPct: 0 });
  });

  it('uses the deterministic baseline when the remote service returns a fallback', async () => {
    const baseline: AgentResponse = { intent: 'query', summary: '本地结果', steps: [], cards: [], citations: [], suggestions: [], contextFingerprint: 'ctx-fallback' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ fallback: baseline }), { status: 502, headers: { 'content-type': 'application/json' } }));
    const client = createSseAgentClient({ baseUrl: '/api/agent', fetcher });
    const result = await client.run({ text: '查询价格', context: {} as never, clientRequestId: 'req-fallback', baseline });
    expect(result.summary).toBe('本地结果');
    expect(result.provider?.name).toBe('本地确定性回退');
  });

  it('parses CRLF, multi-line data and a final frame without a blank terminator', () => {
    const response: AgentResponse = { intent: 'clarify', summary: '分行', steps: [], cards: [], citations: [], suggestions: [], contextFingerprint: 'ctx-crlf' };
    const frame = `event: response\r\ndata: {"response":\r\ndata: ${JSON.stringify(response)}}\r\n`;
    const parsed = parseSseFrames(frame, true);
    expect(parsed.remainder).toBe('');
    expect(parsed.responses[0]?.summary).toBe('分行');
  });

  it('exposes structured AgentEvent frames for run timelines', () => {
    const event = { id: 'run-1-event-1', runId: 'run-1', sequence: 1, type: 'run.started', status: 'running', timestamp: new Date().toISOString() };
    const parsed = parseSseFrames(`event: run.status\ndata: ${JSON.stringify({ event })}\n\n`, true);
    expect(parsed.events[0]?.runId).toBe('run-1');
    expect(parsed.events[0]?.type).toBe('run.started');
  });

  it('fails with a clear timeout when the upstream does not settle', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }));
    const client = createSseAgentClient({ baseUrl: '/api/agent', fetcher, timeoutMs: 5 });
    await expect(client.run({ text: '查询价格', context: {} as never, clientRequestId: 'req-timeout' })).rejects.toThrow('超时');
  });

  it('rejects a successful SSE response that does not match the response contract', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('data: {"response":{"summary":"bad"}}\n\n', { status: 200 }));
    const client = createSseAgentClient({ baseUrl: '/api/agent', fetcher });
    await expect(client.run({ text: '查询价格', context: {} as never, clientRequestId: 'req-invalid' })).rejects.toThrow('未返回完整结果');
  });
});
