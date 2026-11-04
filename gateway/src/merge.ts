/**
 * 响应合并：移植 agent-server.mjs 的合并逻辑。
 * baseline 的数字、卡片、引用全部原样保留；GLM 只允许改写 summary、
 * suggestions（≤3）与 intent（白名单内），并盖上网关 provider 标记。
 */
import { AGENT_INTENTS, type AgentIntentValue, type BaselineResponse } from './validate';

export const GATEWAY_PROVIDER_NAME = 'GLM Gateway';

/** 模型叙述 JSON 的宽松形状：未知字段一律忽略。 */
export interface ModelNarrative {
  summary?: unknown;
  suggestions?: unknown;
  intent?: unknown;
}

/**
 * 从模型自由文本里抠 JSON：容忍 Markdown 围栏与前后杂讯。
 * 与 agent-server.mjs 的 parseModelJson 同口径。
 */
export function parseModelJson(text: string): ModelNarrative | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const first = fenced.indexOf('{');
  const last = fenced.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    const value = JSON.parse(fenced.slice(first, last + 1)) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as ModelNarrative;
  } catch {
    return null;
  }
}

/** 建议 ≤3 条：只收非空字符串；模型没有可用建议时回落 baseline。 */
export function clampSuggestions(raw: unknown, fallback: readonly string[]): string[] {
  const list = Array.isArray(raw)
    ? (raw as unknown[])
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
  const source = list.length ? list : [...fallback];
  return source.slice(0, 3);
}

export function clampIntent(raw: unknown, fallback: AgentIntentValue): AgentIntentValue {
  return typeof raw === 'string' && (AGENT_INTENTS as readonly string[]).includes(raw)
    ? (raw as AgentIntentValue)
    : fallback;
}

/** 正常路径：GLM 叙述合并进 baseline，provider 盖 GLM Gateway 标记。 */
export function mergeModelNarrative(
  baseline: BaselineResponse,
  narrative: ModelNarrative | null,
  model: string,
): BaselineResponse {
  return {
    ...baseline,
    intent: clampIntent(narrative?.intent, baseline.intent),
    summary:
      typeof narrative?.summary === 'string' && narrative.summary.trim()
        ? narrative.summary.trim()
        : baseline.summary,
    suggestions: clampSuggestions(narrative?.suggestions, baseline.suggestions),
    provider: { name: GATEWAY_PROVIDER_NAME, model },
    provenance: {
      ...(baseline.provenance ?? {}),
      source: 'glm-gateway',
      provider: GATEWAY_PROVIDER_NAME,
      model,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * 流中失败路径：SSE 头已发出、无法再改状态码，只能以事件 + response 帧交付
 * baseline 本体；provider 如实标注「回退基线」，前端可区分引擎来源。
 */
export function fallbackResponse(baseline: BaselineResponse, model: string): BaselineResponse {
  return {
    ...baseline,
    provider: { name: `${GATEWAY_PROVIDER_NAME} 回退基线`, model },
    provenance: {
      ...(baseline.provenance ?? {}),
      source: 'glm-gateway-fallback',
      provider: GATEWAY_PROVIDER_NAME,
      model,
      generatedAt: new Date().toISOString(),
    },
  };
}
