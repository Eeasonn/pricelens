/**
 * 请求处理编排：Origin 锁 → 每 IP 限流 → 日配额 → body 校验 → 打开 GLM 流 →
 * SSE 信封回发（event 叙述帧 + 最终 response 帧）。纯薄分层，决策都在纯函数里。
 */
import { ORIGIN_REJECT_REASON_LABEL, checkOrigin, resolveRequestOrigin } from './origins';
import { GATEWAY_PROVIDER_NAME, fallbackResponse, mergeModelNarrative, parseModelJson } from './merge';
import { openGlmStream, type OpenedGlmStream } from './glm';
import { buildGlmMessages } from './prompt';
import { parseRunRequest } from './validate';
import { buildRunEvent, namedSseFrame, responseSsePayload } from './sse';
import type { GatewayState } from './runtime';

const HEALTH_PATH = '/api/agent/health';
const RUNS_PATH = '/runs';
/** 叙述事件帧上限：防止上游高频增量把响应流撑爆。 */
const NARRATIVE_FRAME_LIMIT = 40;
const NARRATIVE_PREVIEW_CHARS = 120;

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'access-control-allow-origin': origin ?? '*',
    'access-control-allow-headers': 'content-type, accept',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin',
  };
}

function jsonResponse(
  payload: unknown,
  status: number,
  origin: string | null,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8', ...(extraHeaders ?? {}) },
  });
}

/** 拒绝响应（Origin 锁等）：不带 CORS 头，浏览器侧跨域读不到正文。 */
function rejectResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function previewNarrative(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, NARRATIVE_PREVIEW_CHARS);
}

/** GET /api/agent/health：轻量、无鉴权、不调上游模型。 */
export function handleHealth(state: GatewayState): Response {
  return jsonResponse(
    {
      ok: Boolean(state.config.apiKey),
      model: state.config.model,
      provider: GATEWAY_PROVIDER_NAME,
      rateLimitPrecision: state.quota.precision,
      originsConfigured: state.config.allowedOrigins !== null,
    },
    200,
    null,
  );
}

export async function handleGatewayRequest(request: Request, state: GatewayState): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === HEALTH_PATH && request.method === 'GET') return handleHealth(state);

  // health 之外一律过 Origin 锁；未配置白名单 = 全部拒绝（fail-closed）。
  const origin = resolveRequestOrigin(request.headers);
  const decision = checkOrigin(origin, state.config.allowedOrigins);
  if (!decision.allowed) {
    return rejectResponse(
      { error: `跨域来源未授权：${ORIGIN_REJECT_REASON_LABEL[decision.reason]}` },
      403,
    );
  }
  const allowOrigin = decision.origin;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) });
  if (request.method === 'POST' && url.pathname === RUNS_PATH) return handleRuns(request, state, allowOrigin);
  return jsonResponse({ error: 'Not found' }, 404, allowOrigin);
}

async function handleRuns(request: Request, state: GatewayState, allowOrigin: string): Promise<Response> {
  const { config, limiter, quota } = state;

  // 防滥用 2：每 IP 速率限制（isolate 内存滑动窗）。
  const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const limited = limiter.check(clientIp);
  if (!limited.allowed) {
    return jsonResponse(
      { error: `请求过于频繁，请 ${limited.retryAfterSeconds} 秒后重试`, retryAfterSeconds: limited.retryAfterSeconds },
      429,
      allowOrigin,
      { 'retry-after': String(limited.retryAfterSeconds) },
    );
  }

  // 防滥用 3：日配额（KV 绑定时持久计数，未绑定降级 isolate 内存计数）。
  const quotaResult = await quota.consume();
  if (!quotaResult.allowed) {
    return jsonResponse(
      { error: `今日 GLM 配额已用完（${quotaResult.used}/${quotaResult.max}），请明天再试或调整 QUOTA_DAILY_MAX` },
      429,
      allowOrigin,
    );
  }

  const parsed = parseRunRequest(await request.text());
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, parsed.status, allowOrigin);
  const { text, baseline, runId } = parsed.request;

  if (!config.apiKey) {
    return jsonResponse({ error: '网关未配置 GLM_API_KEY', fallback: baseline }, 502, allowOrigin);
  }

  // 先打开上游流再下发 200：上游拒绝/超时仍能返回非 2xx + fallback 信封，
  // 让前端自然落本地兜底（client.ts 解析 body.fallback）。
  let opened: OpenedGlmStream;
  try {
    opened = await openGlmStream({
      apiKey: config.apiKey,
      model: config.model,
      messages: buildGlmMessages({ text, baseline, context: parsed.request.context, runId }),
      thinking: config.thinking,
    });
  } catch (error) {
    // 不把上游响应体或授权信息写入响应；客户端可重试或落本地兜底。
    console.error('[gateway] GLM request failed:', error instanceof Error ? error.message : 'unknown error');
    return jsonResponse({ error: 'GLM 网关暂时不可用', fallback: baseline }, 502, allowOrigin);
  }

  const provenance = { source: 'glm-gateway', provider: GATEWAY_PROVIDER_NAME, model: config.model };
  const encoder = new TextEncoder();
  let sequence = 0;
  let narrativeFrames = 0;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (chunk: string): void => controller.enqueue(encoder.encode(chunk));
      const event = (type: string, message: string, status?: string) =>
        buildRunEvent(runId, (sequence += 1), type, message, provenance, status);
      try {
        push(namedSseFrame('run.status', { event: event('run.started', 'GLM 网关已接收请求', 'running') }));
        const fullText = await opened.consume((accumulated) => {
          if (narrativeFrames >= NARRATIVE_FRAME_LIMIT) return;
          narrativeFrames += 1;
          push(namedSseFrame('step.updated', {
            event: buildRunEvent(runId, (sequence += 1), 'step.updated', `GLM 叙述生成中：${previewNarrative(accumulated)}`, provenance, 'running'),
          }));
        });
        const response = mergeModelNarrative(baseline, parseModelJson(fullText), config.model);
        push(namedSseFrame('response', responseSsePayload(response)));
        push(namedSseFrame('run.completed', { event: event('run.completed', 'GLM 网关已完成运行', 'completed') }));
      } catch (error) {
        // 流中失败：头部已是 200，只能以 run.failed 事件 + 基线 response 帧收尾。
        console.error('[gateway] GLM stream interrupted:', error instanceof Error ? error.message : 'unknown error');
        push(namedSseFrame('run.failed', { event: event('run.failed', 'GLM 叙述中断，已回退本地基线结果', 'failed') }));
        push(namedSseFrame('response', responseSsePayload(fallbackResponse(baseline, config.model))));
      } finally {
        opened.close();
        controller.close();
      }
    },
    cancel() {
      opened.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { ...corsHeaders(allowOrigin), 'content-type': 'text/event-stream; charset=utf-8' },
  });
}
