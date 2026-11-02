import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAgentServer } from '../agent-server.mjs';

describe('Agent server request boundary', () => {
  const server = createAgentServer();
  let baseUrl = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not bind');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('reports health without exposing credentials', async () => {
    const response = await fetch(`${baseUrl}/api/agent/health`);
    const body = await response.json() as { ok: boolean; provider: string; model: string };
    expect(response.status).toBe(200);
    expect(typeof body.ok).toBe('boolean');
    expect(body.provider).toBe('Ark Agent Plan');
    expect(body.model).toBeTruthy();
  });

  it('rejects malformed context and oversized user text before upstream calls', async () => {
    const invalidContext = await fetch(`${baseUrl}/api/agent/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '查询价格', context: [] }),
    });
    expect(invalidContext.status).toBe(400);

    const oversizedText = await fetch(`${baseUrl}/api/agent/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(4_001) }),
    });
    expect(oversizedText.status).toBe(413);
  });
});
