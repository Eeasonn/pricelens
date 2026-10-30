import { describe, expect, it, vi } from 'vitest';
import { createSseAgentClient } from '../client';
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
});
