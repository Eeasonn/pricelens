import type { AgentRunStatus } from '../../agent';

export const PRICE_TREND_AI_SUGGESTIONS = [
  '最近有价周哪个平台最便宜？',
  '比较当前产品与主竞品',
  '解释当前价格变化',
] as const;

export const AGENT_FOLLOWUP_SUGGESTIONS = ['只看最近 8 周', '与主竞品比较', '打开依据'] as const;

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

const PAGE_SUGGESTIONS: Record<string, readonly string[]> = {
  dashboard: PRICE_TREND_AI_SUGGESTIONS,
  alerts: ['解释最新预警并列出核查证据', '只看最近 8 周的预警', '把最新预警定位到看板'],
  intelligence: ['总结当前市场情报', '哪些事件最可能影响价格？', '解释汇率对当前价格的影响'],
  forecast: ['解释量价预测的关键假设', '如果价格下调 5% 会怎样？', '查看预测的不确定性'],
  volume: ['比较当前产品的销量趋势', '只看最近 8 周', '解释量价变化'],
};

export function agentSuggestionsForPage(page: string): readonly string[] {
  return PAGE_SUGGESTIONS[page] ?? ['最近有价周哪个平台最便宜？', '解释当前产品的最新预警', '只看最近 8 周并显示 RRP'];
}
