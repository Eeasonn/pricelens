/**
 * 请求 shape 校验：复用 pricelens/server/agent-server.mjs 的校验口径
 * （文本长度、context 对象、baseline 结构），差异点：网关要求请求体必须
 * 携带合法 baseline（前端确定性引擎输出），无 baseline 直接拒绝。
 */
export const MAX_REQUEST_BYTES = 512_000;
export const MAX_TEXT_LENGTH = 4_000;

export const AGENT_INTENTS = ['filter', 'query', 'forecast_explain', 'alert', 'clarify'] as const;
export type AgentIntentValue = (typeof AGENT_INTENTS)[number];

export const CARD_KINDS = ['filter', 'table', 'chart', 'alert', 'forecast_explanation'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export interface BaselineResponse {
  intent: AgentIntentValue;
  summary: string;
  steps: unknown[];
  cards: unknown[];
  citations: unknown[];
  suggestions: string[];
  contextFingerprint: string;
  provider?: { name: string; model: string };
  provenance?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * baseline 结构守卫：与 agent-server.mjs 的 isResponseShape 同口径。
 * 有意保持浅校验：卡片语义归本地确定性引擎所有，远端只允许改写叙述与建议。
 */
export function isResponseShape(value: unknown): value is BaselineResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!(AGENT_INTENTS as readonly string[]).includes(String(item.intent))) return false;
  if (typeof item.summary !== 'string' || typeof item.contextFingerprint !== 'string') return false;
  if (!Array.isArray(item.steps) || !Array.isArray(item.cards) || !Array.isArray(item.citations) || !Array.isArray(item.suggestions)) return false;
  const provider = item.provider as { name?: unknown; model?: unknown } | undefined;
  if (provider !== undefined && (!provider || typeof provider !== 'object' || typeof provider.name !== 'string' || typeof provider.model !== 'string')) return false;
  return (item.suggestions as unknown[]).every((entry) => typeof entry === 'string')
    && (item.cards as unknown[]).every((card) => {
      if (!card || typeof card !== 'object') return false;
      return (CARD_KINDS as readonly string[]).includes(String((card as Record<string, unknown>).kind));
    });
}

export interface RunRequest {
  text: string;
  baseline: BaselineResponse;
  context?: Record<string, unknown>;
  runId: string;
}

export type ParseRunResult =
  | { ok: true; request: RunRequest }
  | { ok: false; status: number; error: string };

export function parseRunRequest(raw: string): ParseRunResult {
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return { ok: false, status: 413, error: '请求体过大' };
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: '请求体必须是合法 JSON' };
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const text = record.text;
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, status: 400, error: '缺少用户问题' };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, status: 413, error: `用户问题不能超过 ${MAX_TEXT_LENGTH} 个字符` };
  }
  if (record.context !== undefined && (typeof record.context !== 'object' || record.context === null || Array.isArray(record.context))) {
    return { ok: false, status: 400, error: 'context 必须是对象' };
  }
  if (!isResponseShape(record.baseline)) {
    return { ok: false, status: 400, error: '缺少可用的 baseline（本地确定性引擎结果）；网关拒绝无基线请求' };
  }
  const runId = String(record.runId || record.clientRequestId || `run-${Date.now()}`);
  return {
    ok: true,
    request: {
      text,
      baseline: record.baseline,
      context: record.context as Record<string, unknown> | undefined,
      runId,
    },
  };
}
