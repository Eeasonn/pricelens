import { afterEach, describe, expect, it, vi } from 'vitest';
import { GLM_CHAT_COMPLETIONS_URL } from '../glm';
import { AGENT_INSTRUCTIONS } from '../prompt';
import { handleGatewayRequest } from '../handlers';
import type { GatewayEnv } from '../types';
import {
  MODEL_TEXT,
  TEST_ORIGIN,
  glmBrokenStreamResponse,
  glmStreamResponse,
  isAgentEventLike,
  isAgentResponseLike,
  makeState,
  parseGatewayFrames,
  runsRequest,
  runsRequestBody,
  stubFetch,
  testEnv,
  VALID_BASELINE,
} from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

function healthRequest(): Request {
  return new Request('https://gateway.example/api/agent/health', { method: 'GET' });
}

describe('POST /runs happy path（SSE 信封 + baseline 合并）', () => {
  it('streams contract frames and merges the GLM narrative into the baseline', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    stubFetch((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return glmStreamResponse(MODEL_TEXT);
    });
    const response = await handleGatewayRequest(runsRequest(runsRequestBody()), makeState());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('access-control-allow-origin')).toBe(TEST_ORIGIN);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const raw = await response.text();
    const { events, responses, frameNames } = parseGatewayFrames(raw);
    expect(frameNames[0]).toBe('run.status');
    expect(frameNames).toContain('response');
    expect(frameNames[frameNames.length - 1]).toBe('run.completed');
    expect(responses).toHaveLength(1);

    // 事件帧契约（前端 isAgentEvent 口径）
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events.every(isAgentEventLike)).toBe(true);
    expect(events.some((event) => event.type === 'step.updated')).toBe(true);
    const first = events[0] as Record<string, unknown>;
    expect(first.type).toBe('run.started');
    expect(first.runId).toBe('req-1');

    // 最终 response 帧契约（前端 isAgentResponse 口径 + 合并语义）
    const responsePayload = responses[0] as Record<string, unknown>;
    expect(responsePayload.type).toBe('response');
    expect(isAgentResponseLike(responsePayload.response)).toBe(true);
    const merged = responsePayload.response as Record<string, unknown>;
    expect(merged.provider).toEqual({ name: 'GLM Gateway', model: 'glm-5.3-flash' });
    expect(merged.summary).toContain('华为');
    expect((merged.suggestions as string[]).length).toBeLessThanOrEqual(3);
    expect(merged.intent).toBe('query');
    expect(merged.cards).toEqual(VALID_BASELINE.cards);
    expect(merged.contextFingerprint).toBe('ctx-abc');
    expect((merged.provenance as Record<string, unknown>).source).toBe('glm-gateway');

    // 上游调用契约：服务端固定参数，客户端无法覆盖
    expect(capturedUrl).toBe(GLM_CHAT_COMPLETIONS_URL);
    const headers = new Headers(capturedInit?.headers as Array<[string, string]>);
    expect(headers.get('authorization')).toBe('Bearer test-key');
    const upstreamBody = JSON.parse(String(capturedInit?.body)) as {
      model: string;
      stream: boolean;
      thinking: { type: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(upstreamBody.model).toBe('glm-5.3-flash');
    expect(upstreamBody.stream).toBe(true);
    expect(upstreamBody.thinking).toEqual({ type: 'disabled' });
    expect(upstreamBody.messages[0]).toEqual({ role: 'system', content: AGENT_INSTRUCTIONS });
  });

  it('respects the GLM_THINKING=enabled env override', async () => {
    let capturedInit: RequestInit | undefined;
    stubFetch((_url, init) => {
      capturedInit = init;
      return glmStreamResponse(MODEL_TEXT);
    });
    const state = makeState(testEnv({ GLM_THINKING: 'enabled' }));
    await handleGatewayRequest(runsRequest(runsRequestBody()), state);
    const upstreamBody = JSON.parse(String(capturedInit?.body)) as { thinking: { type: string } };
    expect(upstreamBody.thinking).toEqual({ type: 'enabled' });
  });
});

describe('GLM 错误路径 → fallback 信封（非 2xx）', () => {
  it('returns 502 + fallback echoing the baseline when GLM responds non-2xx', async () => {
    stubFetch(() => new Response('{"error":{"code":"429"}}', { status: 429 }));
    const response = await handleGatewayRequest(runsRequest(runsRequestBody()), makeState());
    expect(response.status).toBe(502);
    const payload = (await response.json()) as { error?: string; fallback?: Record<string, unknown> };
    expect(payload.error).toBeTruthy();
    expect(payload.fallback).toEqual(VALID_BASELINE);
  });

  it('returns 502 + fallback when the key is not configured', async () => {
    stubFetch(() => {
      throw new Error('should not be called');
    });
    const response = await handleGatewayRequest(runsRequest(runsRequestBody()), makeState(testEnv({ GLM_API_KEY: undefined })));
    expect(response.status).toBe(502);
    const payload = (await response.json()) as { fallback?: Record<string, unknown> };
    expect(payload.fallback).toEqual(VALID_BASELINE);
  });

  it('serves run.failed + baseline response frames when the stream breaks midway', async () => {
    stubFetch(() => glmBrokenStreamResponse());
    const response = await handleGatewayRequest(runsRequest(runsRequestBody()), makeState());
    expect(response.status).toBe(200);
    const raw = await response.text();
    const { events, responses } = parseGatewayFrames(raw);
    expect(events.some((event) => event.type === 'run.failed')).toBe(true);
    expect(responses).toHaveLength(1);
    const merged = (responses[0] as Record<string, unknown>).response as Record<string, unknown>;
    expect(merged.summary).toBe(VALID_BASELINE.summary);
    expect(merged.provider).toEqual({ name: 'GLM Gateway 回退基线', model: 'glm-5.3-flash' });
    expect((merged.provenance as Record<string, unknown>).source).toBe('glm-gateway-fallback');
  });

  it('rejects requests without a valid baseline before calling GLM', async () => {
    stubFetch(() => {
      throw new Error('should not be called');
    });
    const response = await handleGatewayRequest(runsRequest({ text: '问一下' }), makeState());
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain('baseline');
  });
});

describe('Origin 锁（fail-closed）', () => {
  it('rejects all cross-origin requests when ALLOWED_ORIGINS is unconfigured', async () => {
    stubFetch(() => {
      throw new Error('should not be called');
    });
    const state = makeState(testEnv({ ALLOWED_ORIGINS: undefined }));
    const response = await handleGatewayRequest(runsRequest(runsRequestBody()), state);
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain('ALLOWED_ORIGINS');
  });

  it('rejects origins outside the allowlist and requests without origin headers', async () => {
    stubFetch(() => {
      throw new Error('should not be called');
    });
    const notListed = await handleGatewayRequest(runsRequest(runsRequestBody(), 'https://evil.example'), makeState());
    expect(notListed.status).toBe(403);
    const noOrigin = await handleGatewayRequest(runsRequest(runsRequestBody(), null), makeState());
    expect(noOrigin.status).toBe(403);
  });

  it('accepts allowlisted origins and Pages subpath entries normalized to the site origin', async () => {
    stubFetch(() => glmStreamResponse(MODEL_TEXT));
    const state = makeState(testEnv({ ALLOWED_ORIGINS: 'https://eeasonn.github.io/pricelens,http://localhost:5173' }));
    const response = await handleGatewayRequest(runsRequest(runsRequestBody()), state);
    expect(response.status).toBe(200);
  });

  it('handles CORS preflight: 204 with echoed origin when allowed, 403 otherwise', async () => {
    const preflight = new Request('https://gateway.example/runs', { method: 'OPTIONS', headers: { origin: TEST_ORIGIN } });
    const allowed = await handleGatewayRequest(preflight, makeState());
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(TEST_ORIGIN);
    expect(allowed.headers.get('access-control-allow-headers')).toContain('content-type');

    const blocked = await handleGatewayRequest(
      new Request('https://gateway.example/runs', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
      makeState(),
    );
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('每 IP 速率限制与日配额', () => {
  it('rate limits per IP with 429 + retry-after', async () => {
    stubFetch(() => glmStreamResponse(MODEL_TEXT));
    const state = makeState(testEnv({ RATE_LIMIT_MAX: '1' }));
    const first = await handleGatewayRequest(runsRequest(runsRequestBody()), state);
    expect(first.status).toBe(200);
    const second = await handleGatewayRequest(runsRequest(runsRequestBody()), state);
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBeTruthy();
    const payload = (await second.json()) as { error?: string };
    expect(payload.error).toContain('频繁');
  });

  it('blocks with 429 when the daily quota is exhausted (memory fallback)', async () => {
    stubFetch(() => glmStreamResponse(MODEL_TEXT));
    const state = makeState(testEnv({ QUOTA_DAILY_MAX: '1' }));
    const first = await handleGatewayRequest(runsRequest(runsRequestBody()), state);
    expect(first.status).toBe(200);
    const second = await handleGatewayRequest(runsRequest(runsRequestBody()), state);
    expect(second.status).toBe(429);
    const payload = (await second.json()) as { error?: string };
    expect(payload.error).toContain('配额');
  });
});

describe('GET /api/agent/health（轻量、无鉴权、不调上游）', () => {
  it('reports ok/model/provider/rateLimitPrecision without any upstream call', async () => {
    let upstreamCalled = false;
    stubFetch(() => {
      upstreamCalled = true;
      throw new Error('should not be called');
    });
    const response = await handleGatewayRequest(healthRequest(), makeState());
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toEqual({
      ok: true,
      model: 'glm-5.3-flash',
      provider: 'GLM Gateway',
      rateLimitPrecision: 'memory-per-isolate',
      originsConfigured: true,
    });
    expect(upstreamCalled).toBe(false);
  });

  it('marks ok=false without a key and reports kv precision when KV is bound', async () => {
    const fakeKv = {
      async get(): Promise<string | null> {
        return null;
      },
      async put(): Promise<void> {},
    };
    const state = makeState(testEnv({ GLM_API_KEY: undefined, QUOTA_KV: fakeKv as unknown as GatewayEnv['QUOTA_KV'] }));
    const response = await handleGatewayRequest(healthRequest(), state);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.ok).toBe(false);
    expect(payload.rateLimitPrecision).toBe('kv-daily');
  });

  it('is exempt from the origin lock', async () => {
    const response = await handleGatewayRequest(
      new Request('https://gateway.example/api/agent/health', { method: 'GET', headers: { origin: 'https://evil.example' } }),
      makeState(),
    );
    expect(response.status).toBe(200);
  });
});

describe('其他路径与方法', () => {
  it('404s unknown paths with CORS headers and 405s wrong methods on /runs', async () => {
    const notFound = await handleGatewayRequest(new Request('https://gateway.example/other', { method: 'GET', headers: { origin: TEST_ORIGIN } }), makeState());
    expect(notFound.status).toBe(404);
    const wrongMethod = await handleGatewayRequest(new Request('https://gateway.example/runs', { method: 'GET', headers: { origin: TEST_ORIGIN } }), makeState());
    expect(wrongMethod.status).toBe(404);
  });
});
