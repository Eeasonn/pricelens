import type { AgentRunStatus, AgentSuggestionAction } from '../../agent';

export const PRICE_TREND_AI_SUGGESTIONS = ['价格优势', '价格预警', '查我司产品价格'] as const;

export const AGENT_FOLLOWUP_SUGGESTIONS = PRICE_TREND_AI_SUGGESTIONS;

export const AGENT_FOLLOWUP_ACTIONS: readonly AgentSuggestionAction[] = [
  { label: '价格优势', intent: 'price_advantage', target: 'comparison', prompt: '价格优势' },
  { label: '价格预警', intent: 'price_alert', target: 'evidence', prompt: '价格预警' },
  { label: '查我司产品价格', intent: 'query', target: 'dashboard', prompt: '查我司产品价格' },
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

export function platformShortcutLabel(): '⌘K' | 'Ctrl K' {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad|iPod/i.test(`${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`) ? '⌘K' : 'Ctrl K';
}

const PAGE_ACTIONS: Record<string, readonly AgentSuggestionAction[]> = {
  dashboard: AGENT_FOLLOWUP_ACTIONS,
  alerts: AGENT_FOLLOWUP_ACTIONS,
  intelligence: AGENT_FOLLOWUP_ACTIONS,
  forecast: AGENT_FOLLOWUP_ACTIONS,
  volume: AGENT_FOLLOWUP_ACTIONS,
};

export function agentSuggestionsForPage(page: string): readonly AgentSuggestionAction[] {
  return PAGE_ACTIONS[page] ?? AGENT_FOLLOWUP_ACTIONS;
}
