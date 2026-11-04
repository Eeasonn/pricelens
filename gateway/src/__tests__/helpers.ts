/** 测试共享工具：请求构造、GLM 流 mock、SSE 帧解析（复刻 client.ts 口径，gateway 自包含）。 */
import { vi } from 'vitest';
import { createGatewayState, type GatewayState } from '../runtime';
import type { BaselineResponse } from '../validate';
import type { GatewayEnv } from '../types';

export const TEST_ORIGIN = 'https://eeasonn.github.io';

export function testEnv(overrides: Partial<GatewayEnv> = {}): GatewayEnv {
  return {
    GLM_API_KEY: 'test-key',
    ALLOWED_ORIGINS: TEST_ORIGIN,
    ...overrides,
  };
}

export function makeState(env: GatewayEnv = testEnv()): GatewayState {
  return createGatewayState(env);
}

export const VALID_BASELINE: BaselineResponse = {
  intent: 'query',
  summary: '华为 W40 均价高于竞品 3.2%。',
  steps: [],
  cards: [],
  citations: [],
  suggestions: ['查看折扣变化', '对比 Apple 水位'],
  contextFingerprint: 'ctx-abc',
  provider: { name: '本地确定性引擎', model: 'local' },
};

export const MODEL_TEXT =
  '{"summary":"华为 W40 折后均价高于主要竞品约 3%，建议关注折扣回落与平台价差。","suggestions":["查看 W39-W41 折扣变化","对比 Apple 同档水位","检查平台价差预警"],"intent":"query"}';

export function runsRequestBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    text: '华为 W40 均价怎么样？',
    clientRequestId: 'req-1',
    baseline: VALID_BASELINE,
    context: { page: 'overview', state: { countryCode: 'DE' }, alerts: [] },
    ...overrides,
  };
}

export function runsRequest(body: unknown, origin: string | null = TEST_ORIGIN): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cf-connecting-ip': '203.0.113.9',
  };
  if (origin) headers.origin = origin;
  return new Request('https://gateway.example/runs', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** mock 全局 fetch：gateway 测试零真实网络。 */
export function stubFetch(responder: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => responder(String(url), init));
}

/** 构造 GLM 式流式 SSE 响应：把文本切成若干 delta 帧，最后发 [DONE]。 */
export function glmStreamResponse(text: string, chunks = 3): Response {
  const size = Math.max(1, Math.ceil(text.length / Math.max(1, chunks)));
  const encoder = new TextEncoder();
  const frames: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    frames.push(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + size) } }] })}\n\n`);
  }
  frames.push('data: [DONE]\n\n');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** 中途出错的 GLM 流：先吐一帧增量再炸掉。 */
export function glmBrokenStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"{\\"summary\\":\\"部"}}]}\n\n'));
      controller.error(new Error('stream broken'));
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** 复刻前端 isAgentEvent 浅校验口径。 */
export function isAgentEventLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === 'string'
    && typeof event.runId === 'string'
    && typeof event.sequence === 'number'
    && Number.isInteger(event.sequence)
    && typeof event.type === 'string'
    && typeof event.timestamp === 'string';
}

/** 复刻前端 isAgentResponse 浅校验口径。 */
export function isAgentResponseLike(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  if (!['filter', 'query', 'forecast_explain', 'alert', 'clarify'].includes(String(response.intent))) return false;
  if (typeof response.summary !== 'string' || typeof response.contextFingerprint !== 'string') return false;
  if (!Array.isArray(response.steps) || !Array.isArray(response.cards) || !Array.isArray(response.citations) || !Array.isArray(response.suggestions)) return false;
  const provider = response.provider as { name?: unknown; model?: unknown } | undefined;
  if (provider !== undefined && (!provider || typeof provider !== 'object' || typeof provider.name !== 'string' || typeof provider.model !== 'string')) return false;
  if ((response.suggestions as unknown[]).some((entry) => typeof entry !== 'string')) return false;
  return (response.cards as unknown[]).every((card) => {
    if (!card || typeof card !== 'object') return false;
    return ['filter', 'table', 'chart', 'alert', 'forecast_explanation'].includes(String((card as Record<string, unknown>).kind));
  });
}

/** 解析网关 SSE 原文：按空行拆帧，取 data 行 JSON，分拣 event/response。 */
export function parseGatewayFrames(raw: string): {
  events: Array<Record<string, unknown>>;
  responses: Array<Record<string, unknown>>;
  frameNames: string[];
} {
  const events: Array<Record<string, unknown>> = [];
  const responses: Array<Record<string, unknown>> = [];
  const frameNames: string[] = [];
  for (const frame of raw.replace(/\r\n/g, '\n').split('\n\n')) {
    if (!frame.trim()) continue;
    const lines = frame.split('\n');
    const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? '';
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
      .trim();
    frameNames.push(eventName);
    if (!data) continue;
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (parsed.event !== undefined) events.push(parsed.event as Record<string, unknown>);
    // response 帧保留整个信封 {type:'response', response}，便于断言帧结构本身。
    if (parsed.response !== undefined) responses.push(parsed);
  }
  return { events, responses, frameNames };
}
