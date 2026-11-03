import { isAgentEvent, isAgentResponse, type AgentContextSnapshot, type AgentEvent, type AgentIntent, type AgentResponse, type ForecastContextInput, type ForecastDraftInput } from './contracts';
import { runAgent } from './core';
import { resolveAgentEngine } from './remoteConfig';

export interface AgentRunRequest {
  text: string;
  context: AgentContextSnapshot;
  clientRequestId: string;
  baseline?: AgentResponse;
  runId?: string;
  intent?: AgentIntent;
  forecastDraft?: ForecastDraftInput;
  forecastSnapshot?: ForecastContextInput['forecastSnapshot'];
  forecastDataset?: ForecastContextInput['forecastDataset'];
}

export interface AgentClient {
  run(request: AgentRunRequest, signal?: AbortSignal, onEvent?: (event: AgentEvent) => void): Promise<AgentResponse>;
}

/** 离线开发 adapter：无后端时保持页面可演示、可测试。 */
export const localAgentClient: AgentClient = {
  run: (request, signal) => request.baseline ? Promise.resolve(request.baseline) : runAgent(request.text, request.context, signal, request.intent, request.forecastDraft, request.forecastSnapshot, request.forecastDataset),
};

/** POST + SSE 客户端：远端 Agent 只负责叙述与编排，数值卡片仍由本地确定性引擎生成。 */
const DEFAULT_TIMEOUT_MS = 30_000;

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/** Parse complete SSE frames while tolerating CRLF and multiple data lines. */
export function parseSseFrames(input: string, flush = false): { remainder: string; responses: AgentResponse[]; events: AgentEvent[] } {
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const frames = normalized.split('\n\n');
  const remainder = flush ? '' : (frames.pop() ?? '');
  const complete = flush ? frames : frames;
  const responses: AgentResponse[] = [];
  const events: AgentEvent[] = [];
  for (const frame of complete) {
    const data = frame.split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
      .trim();
    if (!data) continue;
    try {
      const event = JSON.parse(data) as { event?: unknown; response?: unknown };
      if (isAgentResponse(event.response)) responses.push(event.response);
      const candidate = event.event ?? event;
      if (isAgentEvent(candidate)) events.push(candidate);
    } catch {
      // Ignore malformed or provider-specific SSE events and wait for a valid response.
    }
  }
  return { remainder, responses, events };
}

export function createSseAgentClient(options: { baseUrl: string; fetcher?: typeof fetch; timeoutMs?: number }): AgentClient {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    async run(request, signal, onEvent) {
      const baseline = request.baseline ?? (request.context?.state ? await runAgent(request.text, request.context, signal, request.intent, request.forecastDraft, request.forecastSnapshot, request.forecastDataset) : undefined);
      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort();
      if (signal?.aborted) throw abortError('Agent 查询已取消');
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer = timeoutMs > 0 ? globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : undefined;
      try {
        const response = await fetcher(`${options.baseUrl.replace(/\/$/, '')}/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify({ ...request, baseline }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => null) as { fallback?: unknown } | null;
          if (errorBody?.fallback && isAgentResponse(errorBody.fallback)) return { ...errorBody.fallback, provider: { name: '本地确定性回退', model: 'local' } };
          throw new Error(`Agent 服务异常（${response.status}）`);
        }
        if (!response.body) throw new Error(`Agent 服务异常（${response.status}）`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let responseValue: AgentResponse | null = null;
        while (true) {
          const part = await reader.read();
          buffer += decoder.decode(part.value ?? new Uint8Array(), { stream: !part.done });
          const parsed = parseSseFrames(buffer, part.done);
          buffer = parsed.remainder;
          responseValue = parsed.responses[parsed.responses.length - 1] ?? responseValue;
          parsed.events.forEach((event) => onEvent?.(event));
          if (part.done) break;
        }
        if (!responseValue) throw new Error('Agent 服务未返回完整结果');
        return responseValue;
      } catch (error) {
        if (timedOut) throw new Error(`Agent 服务响应超时（${timeoutMs}ms）`);
        if ((error as Error)?.name === 'AbortError' && signal?.aborted) throw abortError('Agent 查询已取消');
        throw error;
      } finally {
        if (timer !== undefined) globalThis.clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}

/** 回退结果的 provider 标记：与 SSE 服务端 fallback 信封保持同一口径，调用方可据此区分引擎来源。 */
export const LOCAL_FALLBACK_PROVIDER = { name: '本地确定性回退', model: 'local' } as const;

/**
 * 远端 Agent 只负责叙述与编排，数值卡片仍由本地确定性引擎生成；远端不可达
 * （网络失败 / 非 2xx / 超时 / 契约不符）时回退本地 client，保证纯静态托管
 * （GitHub Pages）下 Agent 功能等价可用。回退结果覆盖 provider 为可区分标记，
 * 并经 events 通道补一条符合 isAgentEvent 校验的本地说明事件。用户主动取消
 * （AbortError 且外部 signal 已中止）不是服务故障，直接上抛，不拿本地结果冒充。
 */
export function withLocalFallback(remote: AgentClient, local: AgentClient): AgentClient {
  return {
    async run(request, signal, onEvent) {
      try {
        return await remote.run(request, signal, onEvent);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError' && signal?.aborted) throw error;
        const runId = request.runId ?? request.clientRequestId;
        onEvent?.({
          id: `${runId}-local-fallback-${Date.now().toString(36)}`,
          runId,
          sequence: 1,
          type: 'step.started',
          timestamp: new Date().toISOString(),
          message: '远端 Agent 服务不可达，已使用本地确定性引擎',
          provenance: { source: 'local-deterministic', provider: LOCAL_FALLBACK_PROVIDER.name, model: LOCAL_FALLBACK_PROVIDER.model },
        });
        const response = await local.run(request, signal, onEvent);
        return { ...response, provider: { ...LOCAL_FALLBACK_PROVIDER } };
      }
    },
  };
}

/** 按配置选择远端（带回退）或离线确定性适配器；localStorage 自配地址优先于构建时 env。 */
export function defaultAgentClient(env: Record<string, string | undefined> = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env): AgentClient {
  const engine = resolveAgentEngine(env);
  if (!engine.baseUrl) return localAgentClient;
  const protocol = (globalThis as typeof globalThis & { location?: { protocol?: string } }).location?.protocol;
  // 构建期 env 在生产里是同源相对路径（/api/agent），file: 打开的离线单文件包没有同源代理；
  // localStorage 是显式自配的绝对地址，file: 下也放行，失败由回退兜底。
  if (engine.source === 'env' && protocol === 'file:') return localAgentClient;
  return withLocalFallback(createSseAgentClient({ baseUrl: engine.baseUrl }), localAgentClient);
}
