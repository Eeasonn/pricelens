import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlmError, extractDeltaContent, openGlmStream, splitSseDataLines } from '../glm';
import { AGENT_INSTRUCTIONS } from '../prompt';
import { glmStreamResponse, stubFetch } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('splitSseDataLines', () => {
  it('extracts data lines and keeps the trailing partial line as remainder', () => {
    const parsed = splitSseDataLines('data: {"a":1}\ndata:{"b":2}\ndata: {"par', false);
    expect(parsed.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(parsed.remainder).toBe('data: {"par');
  });

  it('flushes the remainder when done and tolerates CRLF', () => {
    const parsed = splitSseDataLines('data: {"a":1}\r\ndata: [DONE]\r\n', true);
    expect(parsed.lines).toEqual(['{"a":1}', '[DONE]']);
    expect(parsed.remainder).toBe('');
  });
});

describe('extractDeltaContent', () => {
  it('reads choices[0].delta.content and tolerates junk', () => {
    expect(extractDeltaContent({ choices: [{ delta: { content: '你' } }] })).toBe('你');
    expect(extractDeltaContent({ choices: [{ delta: {} }] })).toBe('');
    expect(extractDeltaContent({})).toBe('');
    expect(extractDeltaContent(null)).toBe('');
  });

  it('never leaks reasoning_content from the thinking model into the narrative', () => {
    expect(extractDeltaContent({ choices: [{ delta: { reasoning_content: '内部推理过程…' } }] })).toBe('');
    expect(
      extractDeltaContent({ choices: [{ delta: { reasoning_content: '内部推理过程…', content: '正文' } }] }),
    ).toBe('正文');
  });
});

describe('openGlmStream + consume（GLM 传输层，fetch 全 mock）', () => {
  it('posts to BigModel with the server-owned body and reassembles the text', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    stubFetch((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return glmStreamResponse('{"summary":"结论"}');
    });
    const opened = await openGlmStream({
      apiKey: 'key-from-secret',
      model: 'glm-5.3-flash',
      messages: [{ role: 'system', content: AGENT_INSTRUCTIONS }, { role: 'user', content: '{}' }],
      timeoutMs: 1_000,
    });
    const deltas: string[] = [];
    const full = await opened.consume((text) => deltas.push(text));
    opened.close();
    expect(full).toBe('{"summary":"结论"}');
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas[deltas.length - 1]).toBe(full);
    expect(capturedUrl).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    expect(capturedInit?.method).toBe('POST');
    const headers = new Headers(capturedInit?.headers as Array<[string, string]>);
    expect(headers.get('authorization')).toBe('Bearer key-from-secret');
    const body = JSON.parse(String(capturedInit?.body)) as {
      model: string;
      stream: boolean;
      thinking: { type: string };
      temperature: number;
      max_tokens: number;
    };
    expect(body).toMatchObject({
      model: 'glm-5.3-flash',
      stream: true,
      thinking: { type: 'disabled' },
      temperature: 0.2,
      max_tokens: 1024,
    });
  });

  it('can enable thinking via the server-owned option', async () => {
    let capturedInit: RequestInit | undefined;
    stubFetch((_url, init) => {
      capturedInit = init;
      return glmStreamResponse('{}');
    });
    const opened = await openGlmStream({
      apiKey: 'k',
      model: 'glm-5.3-flash',
      messages: [],
      thinking: 'enabled',
      timeoutMs: 1_000,
    });
    await opened.consume();
    opened.close();
    const body = JSON.parse(String(capturedInit?.body)) as { thinking: { type: string } };
    expect(body.thinking).toEqual({ type: 'enabled' });
  });

  it('reassembles text even when reasoning deltas interleave with content deltas', async () => {
    const encoder = new TextEncoder();
    const frames = [
      'data: {"choices":[{"delta":{"reasoning_content":"思考中"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"{\\"summary\\":"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"再想想"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"\\"好\\"}"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    });
    stubFetch(() => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const opened = await openGlmStream({ apiKey: 'k', model: 'glm-5.3-flash', messages: [], timeoutMs: 1_000 });
    const full = await opened.consume();
    opened.close();
    expect(full).toBe('{"summary":"好"}');
  });

  it('throws GlmError on non-2xx upstream status', async () => {
    stubFetch(() => new Response('{"error":"rate limited"}', { status: 429 }));
    await expect(
      openGlmStream({ apiKey: 'k', model: 'glm-5.3-flash', messages: [], timeoutMs: 100 }),
    ).rejects.toThrow('GLM 请求失败（429）');
  });

  it('throws GlmError on network failure', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('dns failure');
    });
    await expect(
      openGlmStream({ apiKey: 'k', model: 'glm-5.3-flash', messages: [], timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(GlmError);
  });

  it('aborts with a timeout GlmError covering the whole stream', async () => {
    vi.stubGlobal('fetch', (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        signal.addEventListener('abort', () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    );
    await expect(
      openGlmStream({ apiKey: 'k', model: 'glm-5.3-flash', messages: [], timeoutMs: 20 }),
    ).rejects.toThrow('GLM 请求超时');
  });

  it('throws GlmError when the upstream response has no body', async () => {
    stubFetch(() => new Response(null, { status: 200 }));
    await expect(
      openGlmStream({ apiKey: 'k', model: 'glm-5.3-flash', messages: [], timeoutMs: 100 }),
    ).rejects.toThrow('GLM 响应缺少正文');
  });
});
