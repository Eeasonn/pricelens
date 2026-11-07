import { isAgentEvent, isAgentResponse, type AgentContextSnapshot, type AgentEvent, type AgentIntent, type AgentResponse, type AgentResultCard, type ForecastContextInput, type ForecastDraftInput } from './contracts';
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

export interface AgentStreamState {
  text: string;
  cards: AgentResultCard[];
  events: AgentEvent[];
  lastSequence: number;
}

/** Sequence-aware reducer used by the UI and fake-SSE tests. */
export function applyAgentStreamEvent(state: AgentStreamState, event: AgentEvent, runId: string): AgentStreamState {
  if (event.runId !== runId || event.sequence <= state.lastSequence) return state;
  let cards = state.cards;
  if (event.type === 'card.ready' && event.card) cards = [...cards.filter((card) => card.id !== event.card?.id), event.card];
  if (event.type === 'card.patch' && event.cardId && event.patch) {
    cards = cards.map((card) => card.id === event.cardId ? ({ ...card, ...event.patch } as AgentResultCard) : card);
  }
  return {
    text: event.type === 'text.delta' ? `${state.text}${event.delta ?? event.text ?? ''}` : state.text,
    cards,
    events: [...state.events, event],
    lastSequence: event.sequence,
  };
}

function hasFactConflict(text: string, baseline: AgentResponse): boolean {
  const facts = JSON.stringify(baseline.cards);
  const numbers = [...text.matchAll(/\b\d{2,6}(?:\.\d+)?\b/g)].map((match) => match[0]);
  return numbers.some((number) => !facts.includes(number)) && baseline.cards.length > 0;
}

/** Merge untrusted remote narrative with the deterministic baseline. */
export function mergeRemoteResponse(baseline: AgentResponse | undefined, remote: AgentResponse, requestFingerprint?: string): AgentResponse {
  if (!baseline) return { ...remote, factGuard: remote.factGuard ?? { status: 'verified' } };
  const changedFacts = JSON.stringify(remote.cards) !== JSON.stringify(baseline.cards)
    || JSON.stringify(remote.steps) !== JSON.stringify(baseline.steps)
    || JSON.stringify(remote.citations) !== JSON.stringify(baseline.citations)
    || JSON.stringify(remote.coverage) !== JSON.stringify(baseline.coverage);
  const calibrated = changedFacts || hasFactConflict(remote.summary, baseline);
  return {
    ...baseline,
    summary: remote.summary || baseline.summary,
    suggestions: remote.suggestions?.length ? remote.suggestions : baseline.suggestions,
    suggestionActions: remote.suggestionActions ?? baseline.suggestionActions,
    provider: remote.provider ?? { name: '远端 AI 流式', model: 'remote' },
    provenance: { ...(baseline.provenance ?? {}), ...(remote.provenance ?? {}), source: remote.provenance?.source ?? baseline.provenance?.source ?? 'pricelens-context', contextFingerprint: baseline.contextFingerprint },
    // The remote fingerprint is intentionally retained so AgentContext can mark a stale response.
    contextFingerprint: remote.contextFingerprint,
    factGuard: {
      status: requestFingerprint && remote.contextFingerprint !== requestFingerprint ? 'stale_context' : calibrated ? 'calibrated' : 'verified',
      message: calibrated ? '已按本地数据校准：价格、SKU、范围和证据以本地确定性引擎为准。' : undefined,
    },
  };
}

/** 离线开发 adapter：无后端时保持页面可演示、可测试。 */
export const localAgentClient: AgentClient = {
  run: async (request, signal, onEvent) => {
    const response = request.baseline ?? await runAgent(request.text, request.context, signal, request.intent, request.forecastDraft, request.forecastSnapshot, request.forecastDataset);
    const runId = request.runId ?? request.clientRequestId;
    const now = (): string => new Date().toISOString();
    // run.started occupies sequence 1 in AgentContext; fallback adapters may
    // use sequence 2, so local stage events start at 3 and remain monotonic.
    let sequence = 2;
    const emit = (event: AgentEvent): void => onEvent?.(event);
    const stage = (message: string, tool: AgentEvent['tool'], status: AgentEvent['status'] = 'running'): void => {
      sequence += 1;
      emit({ id: `${runId}-stage-${sequence}`, runId, sequence, type: 'step.started', status, timestamp: now(), message, tool, provenance: response.provenance });
    };
    const complete = (message: string, tool: AgentEvent['tool']): void => {
      sequence += 1;
      emit({ id: `${runId}-done-${sequence}`, runId, sequence, type: 'step.completed', status: 'completed', timestamp: now(), message, tool, provenance: response.provenance });
    };
    const delta = (text: string): void => {
      sequence += 1;
      emit({ id: `${runId}-delta-${sequence}`, runId, sequence, type: 'text.delta', delta: `${text}\n`, timestamp: now(), provenance: response.provenance });
    };
    stage('解析意图', 'catalog.resolve'); delta('解析意图'); complete('意图已确认', 'catalog.resolve');
    const alertRun = request.intent === 'price_alert' || response.intent === 'price_alert' || request.intent === 'alert';
    stage(alertRun ? '读取预警' : '读取价格', alertRun ? 'alerts.query' : 'series.query'); delta(alertRun ? '读取现有预警规则与证据…' : '读取国家×渠道×周价格事实…'); complete(alertRun ? '预警事实已读取' : '价格事实已读取', alertRun ? 'alerts.query' : 'series.query');
    stage(alertRun ? '校验证据' : '计算优势', alertRun ? 'alerts.explain' : 'series.compare'); delta(alertRun ? '校验触发规则、数据版本和证据来源…' : '按本地事实计算我司与核心竞品价差…'); complete(alertRun ? '证据已校验' : '优势已计算', alertRun ? 'alerts.explain' : 'series.compare');
    stage('生成结论', 'view.preview'); delta(response.summary); complete('结论已生成', 'view.preview');
    response.cards.forEach((card) => { sequence += 1; emit({ id: `${runId}-card-${card.id}`, runId, sequence, type: 'card.ready', card, cardId: card.id, timestamp: now(), provenance: response.provenance }); });
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
          if (errorBody?.fallback && isAgentResponse(errorBody.fallback)) return { ...errorBody.fallback, provider: { name: '本地确定性回退', model: 'local', reason: `远端服务返回 ${response.status}` } };
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
        return mergeRemoteResponse(baseline, responseValue, request.context.fingerprint);
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
          sequence: 2,
          type: 'step.started',
          timestamp: new Date().toISOString(),
          message: '远端 Agent 服务不可达，已使用本地确定性引擎',
          provenance: { source: 'local-deterministic', provider: LOCAL_FALLBACK_PROVIDER.name, model: LOCAL_FALLBACK_PROVIDER.model },
        });
        const response = await local.run(request, signal, onEvent);
        return { ...response, provider: { ...LOCAL_FALLBACK_PROVIDER, reason: (error as Error)?.message || '远端不可达' } };
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
