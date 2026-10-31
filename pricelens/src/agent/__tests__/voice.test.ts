import { describe, expect, it, vi } from 'vitest';
import { createArkVoiceAdapter, createBrowserVoiceAdapter } from '../voice';

describe('voice adapters', () => {
  it('uses a same-origin Ark proxy and never needs a client API key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ transcript: '查看最近八周价格' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const adapter = createArkVoiceAdapter({ endpoint: '/api/agent/voice', fetcher });
    const result = await adapter.listen();
    expect(adapter.name).toBe('方舟 Agent Plan');
    expect(result.transcript).toContain('最近八周');
    expect(fetcher).toHaveBeenCalledWith('/api/agent/voice', expect.objectContaining({ method: 'POST' }));
  });

  it('reports browser support accurately', () => {
    const adapter = createBrowserVoiceAdapter();
    expect(typeof adapter.available).toBe('boolean');
    expect(adapter.name).toBe('浏览器语音输入');
  });
});
