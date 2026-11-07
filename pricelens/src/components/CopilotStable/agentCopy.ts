import type { AgentIntent, AgentRunStatus, AgentSuggestion } from '../../agent-stable';

export const suggestion = (label: string, prompt: string, intent: AgentIntent, target?: AgentSuggestion['target']): AgentSuggestion => ({ label, prompt, intent, target });

export const PRICE_TREND_AI_SUGGESTIONS: readonly AgentSuggestion[] = [
  suggestion('价格优势', '比较我司与核心竞品的价格优势', 'query', 'comparison'),
  suggestion('价格预警', '查看价格预警', 'alert', 'evidence'),
  suggestion('基础我司快搜', '查看当前我司产品价格概览', 'query', 'query'),
];

export const AGENT_FOLLOWUP_SUGGESTIONS: readonly AgentSuggestion[] = [
  ...PRICE_TREND_AI_SUGGESTIONS,
];

export const AGENT_STATUS_LABELS: Record<AgentRunStatus, string> = {
  idle: '只读分析 · 结果可追溯',
  queued: '已排队 · 即将开始',
  running: '正在运行…',
  waiting_input: '等待补充信息…',
  parsing: '正在理解请求…',
  planning: '正在规划执行步骤…',
  tool_running: '正在读取价格数据…',
  waiting_for_approval: '等待确认后继续…',
  partial_result: '已生成部分结果…',
  completed: '结果已在 Agent 面板生成',
  stale_context: '筛选已变化 · 结果需重新确认',
  failed: '运行失败 · 可重试',
  cancelled: '已取消本次运行',
  clarification_required: '需要补充一个口径',
};

export function agentProviderLabel(provider?: { name: string; model: string }, fallbackReason?: string, simulated = false): string {
  const base = provider?.name?.includes('回退') ? '本地回退' : provider ? '远端 AI 流式' : '本地确定性';
  return `${base}${simulated ? ' · 演示数据' : ''}${fallbackReason ? ` · ${fallbackReason}` : ''}`;
}

export function platformShortcutLabel(): '⌘K' | 'Ctrl K' {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad|iPod/i.test(`${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`) ? '⌘K' : 'Ctrl K';
}

const PAGE_SUGGESTIONS: Record<string, readonly AgentSuggestion[]> = {
  dashboard: PRICE_TREND_AI_SUGGESTIONS,
  alerts: PRICE_TREND_AI_SUGGESTIONS,
  intelligence: PRICE_TREND_AI_SUGGESTIONS,
  forecast: PRICE_TREND_AI_SUGGESTIONS,
  volume: PRICE_TREND_AI_SUGGESTIONS,
};

export function agentSuggestionsForPage(page: string): readonly AgentSuggestion[] {
  return PAGE_SUGGESTIONS[page] ?? PRICE_TREND_AI_SUGGESTIONS;
}
