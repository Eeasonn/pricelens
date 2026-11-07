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

function localProgressEvent(request: AgentRunRequest, sequence: number, type: AgentEvent['type'], status: AgentEvent['status'], message: string, tool?: AgentEvent['tool'], delta?: string): AgentEvent {
  return {
    id: `${request.runId ?? request.clientRequestId}-local-${sequence}`,
    runId: request.runId ?? request.clientRequestId,
    sequence,
    type,
    status,
    timestamp: new Date().toISOString(),
    message,
    tool,
    delta,
    provenance: { source: 'local-deterministic', provider: '本地确定性引擎', model: 'local' },
  };
}

async function emitLocalProgress(request: AgentRunRequest, response: AgentResponse, signal?: AbortSignal, onEvent?: (event: AgentEvent) => void): Promise<void> {
  const advantage = /价格优势|优势|相对竞品|价差百分比/.test(request.text);
  const alert = request.intent === 'alert' || /价格预警|预警|异常|阈值/.test(request.text);
  const stages: Array<{ status: AgentEvent['status']; message: string; tool: AgentEvent['tool']; delta?: string }> = [
    { status: 'parsing', message: '解析意图', tool: 'catalog.resolve', delta: '已解析请求范围。' },
    { status: 'tool_running', message: alert ? '读取预警规则与价格事实' : '读取价格事实', tool: alert ? 'alerts.query' : 'series.query', delta: alert ? '正在读取真实预警证据。' : '正在读取真实价格事实。' },
    { status: 'partial_result', message: advantage ? '计算价格优势' : alert ? '核对预警触发条件' : '整理确定性结果', tool: advantage ? 'series.compare' : alert ? 'alerts.explain' : 'series.compare', delta: advantage ? '正在计算我司与核心竞品的价差。' : alert ? '正在核对规则、阈值与来源。' : '正在整理确定性结果。' },
    { status: 'partial_result', message: '生成结论', tool: 'series.compare', delta: response.summary.slice(0, 80) },
  ];
  for (const [index, stage] of stages.entries()) {
    if (signal?.aborted) throw abortError('Agent 查询已取消');
    onEvent?.(localProgressEvent(request, index * 2 + 1, 'step.updated', stage.status, stage.message, stage.tool));
    onEvent?.(localProgressEvent(request, index * 2 + 2, 'text.delta', stage.status, stage.message, stage.tool, stage.delta));
    await new Promise<void>((resolve, reject) => {
      const timer = globalThis.setTimeout(() => { cleanup(); resolve(); }, 0);
      const onAbort = () => { cleanup(); reject(abortError('Agent 查询已取消')); };
      const cleanup = () => { globalThis.clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }
}

/** 离线开发 adapter：无后端时保持页面可演示、可测试，同时展示确定性阶段与增量文本。 */
export const localAgentClient: AgentClient = {
  run: async (request, signal, onEvent) => {
    const response = request.baseline ?? await runAgent(request.text, request.context, signal, request.intent, request.forecastDraft, request.forecastSnapshot, request.forecastDataset);
    await emitLocalProgress(request, response, signal, onEvent);
    if (signal?.aborted) throw abortError('Agent 查询已取消');
    return response;
  },
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

/**
 * Remote responses are deliberately reduced to a narrative envelope.  The
 * deterministic run that was sent as `baseline` owns all cards, steps,
 * citations and coverage.  Keeping the remote fingerprint lets AgentContext
 * reject a response that was produced for a different scope.
 */
export function mergeRemoteResponse(baseline: AgentResponse, remote: AgentResponse): AgentResponse {
  const rejectedFields: string[] = [];
  const same = (left: unknown, right: unknown): boolean => {
    try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
  };
  if (!same(remote.cards, baseline.cards)) rejectedFields.push('cards.price/sku/scope');
  if (!same(remote.steps, baseline.steps)) rejectedFields.push('steps');
  if (!same(remote.citations, baseline.citations)) rejectedFields.push('citations');
  if (!same(remote.coverage, baseline.coverage)) rejectedFields.push('coverage');
  if (!same(remote.intent, baseline.intent)) rejectedFields.push('intent');
  // A narrative can still smuggle a different price or SKU even when the
  // structured cards were left untouched.  Keep the prose, but surface the
  // same calibration marker so the UI never presents that claim as local fact.
  const baselineFacts = JSON.stringify({ cards: baseline.cards, citations: baseline.citations });
  const narrative = `${remote.summary} ${remote.suggestions.map((item) => typeof item === 'string' ? item : item.label).join(' ')}`;
  const factTokens = narrative.match(/(?:¥|￥|\$|USD|RUB|CNY|EUR)\s?[\d,.]+|\bsku[-_:/a-z0-9]+\b/gi) ?? [];
  if (factTokens.some((token) => !baselineFacts.includes(token))) rejectedFields.push('summary.price/sku');
  const calibrated = rejectedFields.length > 0;
  return {
    ...baseline,
    // Summary/suggestions/provider are the only response-level values the
    // remote adapter can narrate or identify.
    summary: remote.summary,
    // Stable line keeps the three explicit core intents. A remote model may
    // narrate the result, but it cannot add a new visible entry point.
    suggestions: baseline.suggestions,
    provider: remote.provider ?? baseline.provider,
    fallbackReason: remote.fallbackReason ?? baseline.fallbackReason,
    // Preserve the remote fingerprint for the three-way stale-context guard.
    contextFingerprint: remote.contextFingerprint,
    factGuard: calibrated ? {
      calibrated: true,
      message: '已按本地数据校准：远端返回的价格、SKU、步骤或口径未被采用。',
      rejectedFields,
    } : remote.factGuard,
  };
}

function upsertEvent(events: Map<string, AgentEvent>, event: AgentEvent): void {
  const key = `${event.runId}:${event.sequence}`;
  events.set(key, event);
}

function guardedEvent(event: AgentEvent, baseline?: AgentResponse): AgentEvent {
  if (!baseline || (event.type !== 'card.ready' && event.type !== 'card.patch')) return event;
  const candidate = event.card ?? (event.cardPatch as { id?: string } | undefined);
  const cardId = candidate?.id ?? event.cardId;
  const local = cardId ? baseline.cards.find((card) => card.id === cardId) : undefined;
  if (!local) return { ...event, card: undefined, cardPatch: undefined, message: `${event.message ?? '部分结果'} · 已按本地确定性数据校准` };
  const remoteCard = event.card;
  const differs = remoteCard ? JSON.stringify(remoteCard) !== JSON.stringify(local) : Boolean(event.cardPatch && Object.keys(event.cardPatch).some((key) => key !== 'id' && key !== 'kind'));
  return differs
    ? { ...event, card: local, cardPatch: undefined, message: `${event.message ?? '部分结果'} · 已按本地确定性数据校准` }
    : event;
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
          if (errorBody?.fallback && isAgentResponse(errorBody.fallback)) {
            const runId = request.runId ?? request.clientRequestId;
            onEvent?.({
              id: `${runId}-remote-failed-${Date.now().toString(36)}`,
              runId,
              sequence: 1,
              type: 'step.updated',
              status: 'failed',
              timestamp: new Date().toISOString(),
              message: `远端 Agent 服务不可达（HTTP ${response.status}），已使用本地确定性引擎`,
              tool: 'catalog.resolve',
              provenance: { source: 'local-deterministic', provider: LOCAL_FALLBACK_PROVIDER.name, model: LOCAL_FALLBACK_PROVIDER.model },
            });
            const fallback = { ...errorBody.fallback, provider: { name: '本地确定性回退', model: 'local' }, fallbackReason: `远端服务返回 ${response.status}` };
            return baseline ? mergeRemoteResponse(baseline, fallback) : fallback;
          }
          throw new Error(`Agent 服务异常（${response.status}）`);
        }
        if (!response.body) throw new Error(`Agent 服务异常（${response.status}）`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let responseValue: AgentResponse | null = null;
        const eventBuffer = new Map<string, AgentEvent>();
        const emittedEvents = new Map<string, AgentEvent>();
        while (true) {
          const part = await reader.read();
          if (signal?.aborted) throw abortError('Agent 查询已取消');
          buffer += decoder.decode(part.value ?? new Uint8Array(), { stream: !part.done });
          const parsed = parseSseFrames(buffer, part.done);
          buffer = parsed.remainder;
          responseValue = parsed.responses[parsed.responses.length - 1] ?? responseValue;
          parsed.events.forEach((event) => {
            const guarded = guardedEvent(event, baseline);
            upsertEvent(eventBuffer, guarded);
          });
          [...eventBuffer.entries()]
            .sort(([, left], [, right]) => left.sequence - right.sequence)
            .forEach(([key, event]) => {
              if (signal?.aborted) throw abortError('Agent 查询已取消');
              const previous = emittedEvents.get(key);
              if (previous && JSON.stringify(previous) === JSON.stringify(event)) return;
              emittedEvents.set(key, event);
              onEvent?.(event);
            });
          if (part.done) break;
        }
        if (!responseValue) throw new Error('Agent 服务未返回完整结果');
        if (signal?.aborted) throw abortError('Agent 查询已取消');
        return baseline ? mergeRemoteResponse(baseline, responseValue) : responseValue;
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
        return { ...response, provider: { ...LOCAL_FALLBACK_PROVIDER }, fallbackReason: (error as Error)?.message || '远端服务不可达' };
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
