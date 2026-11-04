/**
 * 服务端固定提示词与上下文组装。
 * 移植自 pricelens/server/agent-server.mjs：系统提示词与采样参数由服务端固定，
 * 客户端请求体没有任何字段能覆盖它们。
 */
import { AGENT_INTENTS, MAX_TEXT_LENGTH, type RunRequest } from './validate';

export const AGENT_INSTRUCTIONS = `你是 PriceLens 的 GLM 叙述助手，负责帮助价格分析师理解当前看板。
你必须只输出一个 JSON 对象，不要 Markdown，不要代码围栏。字段必须是：
{"summary":"中文简洁结论","suggestions":["最多3条后续问题"],"intent":"${AGENT_INTENTS.join('|')}"}
本地确定性引擎已经给出 baseline：其中的数字、平台、产品和预警事实已经过数据引擎计算，不得编造、修改或补算数字。
你的任务是结合用户问题和 baseline，改写一段清楚的中文结论，并给出最多三条有用的后续问题。
如果用户要求改变筛选，必须保留“先预览、确认后应用”的语义；如果是预警解释，必须区分触发事实和待核查原因，不把相关性写成确定因果。`;

/**
 * 服务端钳制的采样参数：不接受客户端覆盖。
 * glm-5.3-flash 是思考模型：thinking enabled 时思考 token 也计入
 * completion_tokens，max_tokens 必须留足余量（≥1024）。
 */
export const GLM_TEMPERATURE = 0.2;
export const GLM_MAX_TOKENS = 1024;

export interface GlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 精简上下文：只送模型需要的字段，mains ≤50、alerts ≤20，文本截断 ≤ MAX_TEXT_LENGTH。 */
export function compactContext(request: RunRequest): Record<string, unknown> {
  const state = (request.context?.state ?? {}) as Record<string, unknown>;
  const alerts = request.context?.alerts;
  return {
    userText: request.text.slice(0, MAX_TEXT_LENGTH),
    page: request.context?.page,
    state: {
      countryCode: state.countryCode,
      industry: state.industry,
      rangeStart: state.rangeStart,
      rangeEnd: state.rangeEnd,
      currency: state.currency,
      granularity: state.granularity,
      agg: state.agg,
      priceTypes: state.priceTypes,
      mains: Array.isArray(state.mains) ? state.mains.slice(0, 50) : [],
    },
    alerts: Array.isArray(alerts) ? alerts.slice(0, 20) : [],
    baseline: request.baseline,
  };
}

/** 组装发给 BigModel 的 messages：固定 system + 紧凑 JSON user。 */
export function buildGlmMessages(request: RunRequest): GlmMessage[] {
  return [
    { role: 'system', content: AGENT_INSTRUCTIONS },
    { role: 'user', content: JSON.stringify(compactContext(request)) },
  ];
}
