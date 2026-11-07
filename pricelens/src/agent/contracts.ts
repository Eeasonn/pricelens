import type { FiltersState, ProductSelection } from '../state/filtersTypes';
import type { AlertEvidenceStatus, AlertLifecycle, AlertPriority } from '../dataModel/alertLifecycle';
import type { ForecastDataset } from '../pages/forecast/forecastModel';
import type { ForecastSnapshot } from '../pages/forecast/forecastSnapshot';

export type AgentIntent = 'filter' | 'query' | 'forecast_explain' | 'alert' | 'price_advantage' | 'price_alert' | 'clarify';
/** Local What-if inputs that must travel with a forecast explanation request. */
export interface ForecastDraftInput {
  priceDeltaPct: number;
  promoDeltaPct: number;
  supplyDeltaPct: number;
}

/**
 * Immutable forecast inputs captured by the page at the moment an Agent run
 * starts.  Keeping the dataset beside the snapshot lets follow-up scenarios
 * recompute from the same adapter rather than silently falling back to the
 * demo fixture.
 */
export interface ForecastContextInput {
  forecastSnapshot?: ForecastSnapshot;
  forecastDataset?: ForecastDataset;
}
/** Agent 运行状态由编排层发出，UI 不需要窥探模型思维即可呈现可操作进度。 */
export type AgentRunStatus =
  | 'idle'
  /** Adapter-facing aliases used by remote runtimes; UI may map them to richer local states. */
  | 'queued'
  | 'running'
  | 'waiting_input'
  | 'parsing'
  | 'clarification_required'
  | 'planning'
  | 'tool_running'
  | 'waiting_for_approval'
  | 'partial_result'
  | 'completed'
  /** Run finished without error but produced zero result cards; UI offers scope adjustments. */
  | 'empty'
  | 'failed'
  | 'cancelled'
  | 'stale_context';

export type AgentEventType =
  | 'run.started'
  | 'run.status'
  | 'step.started'
  | 'step.updated'
  | 'step.completed'
  | 'approval.required'
  | 'clarification.required'
  | 'warning'
  | 'text.delta'
  | 'card.patch'
  | 'card.ready'
  | 'evidence.ready'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled';

export interface AgentProvenance {
  /** 能力/数据来源，例如 local-deterministic、mcp:pricing。 */
  source: string;
  provider?: string;
  model?: string;
  dataVersion?: string;
  ruleVersion?: string;
  contextFingerprint?: string;
  generatedAt?: string;
}

/** Stable domain name used by the product contract and adapter implementations. */
export type ResultProvenance = AgentProvenance;

export interface CoverageSummary {
  covered: number;
  total: number;
  missing?: number;
  stale?: number;
  note?: string;
}

export interface AgentEvidence {
  id?: string;
  label: string;
  detail: string;
  source?: string;
  href?: string;
  timestamp?: string;
}

/** EvidenceLink is the UI-facing name; AgentEvidence remains for backwards compatibility. */
export type EvidenceLink = AgentEvidence;

export interface ApprovalRequest {
  id: string;
  action: string;
  scope: string;
  impactCount?: number;
  idempotencyKey: string;
  contextFingerprint: string;
  expiresAt?: string;
  reason?: string;
}

export interface AgentCardAction {
  id: string;
  label: string;
  kind: 'apply' | 'open' | 'followup' | 'copy';
  prompt?: string;
  disabled?: boolean;
  /**
   * Optional navigation / follow-up envelope.  Actions are only valid for
   * the context that produced the card; the UI must disable stale actions
   * instead of silently applying them to a different scope.
   */
  target?: AgentActionTarget;
  /**
   * R4（M1，同步稳定线四审）：open 类「回看板定位 / 定位到看板 / 回看板下钻」
   * 必须携带生成该卡时的完整查询口径（countryCode、mains、platform、
   * granularity、rangeStart/End）——跨页跨国查询（AE 页问 RU nova 趋势）回看
   * 时先落地这套 patch 再导航，不能只发 prompt 文本让目标页回落旧口径。
   */
  filterPatch?: FilterPatch;
}

export type AgentSuggestionIntent = 'filter' | 'query' | 'compare' | 'evidence' | 'price_advantage' | 'price_alert' | 'clarify';

/** Fixed chips carry the action contract; free text still uses classifier fallback. */
export interface AgentSuggestionAction {
  label: string;
  intent: AgentSuggestionIntent;
  target?: 'comparison' | 'evidence' | 'filter_preview' | 'dashboard' | 'forecast';
  prompt?: string;
  /**
   * R7（六审 m1）：draftOnly = 示例补全动作——点击只把 prompt 模板填入输入框
   * 供用户确认/修改，绝不直接发送执行（配置归属澄清的示例问法由用户原请求
   * 派生，仍不代替用户确认对应关系，更不允许静默换成示例里的国家/型号）。
   */
  draftOnly?: boolean;
}

export interface AgentActionTarget {
  page?: string;
  contextFingerprint: string;
  weekId?: string;
  modelId?: string;
  alertId?: string;
  alertType?: AgentAlertRecord['type'];
  seriesKey?: string;
  countryCode?: string;
  platform?: FiltersState['platform'];
  selection?: ProductSelection;
  compareSelection?: ProductSelection;
  forecastDraft?: ForecastDraftInput;
  forecastSnapshot?: ForecastSnapshot;
  forecastDataset?: ForecastDataset;
}
export type AgentToolName =
  | 'catalog.resolve'
  | 'series.query'
  | 'series.compare'
  | 'alerts.query'
  | 'alerts.explain'
  | 'view.preview';

export interface AgentAlertRecord {
  alertId?: string;
  key: string;
  seriesKey?: string;
  type: string;
  brand: string;
  modelName: string;
  romram: string;
  weekLabel: string;
  weekId: string;
  price: number | null;
  wowPct: number | null;
  promoDeltaPp: number | null;
  gapPct: number | null;
  gapLowPlatform: string | null;
  gapHighPlatform: string | null;
  gapLowPrice: number | null;
  gapHighPrice: number | null;
  isOwn: boolean;
  lifecycle?: AlertLifecycle;
  priority?: AlertPriority;
  priorityScore?: number;
  threshold?: number | null;
  ruleVersion?: string;
  dataVersion?: string;
  contextFingerprint?: string;
  evidenceIds?: string[];
  evidence?: AgentEvidence[];
  evidenceStatus?: AlertEvidenceStatus;
  countryCode?: string;
}

export interface AgentContextSnapshot {
  page: string;
  pageLabel?: string;
  state: FiltersState;
  alerts: readonly AgentAlertRecord[];
  createdAt: string;
  fingerprint: string;
  /** 允许回放/审计时知道结果对应哪一版数据和规则。 */
  provenance?: AgentProvenance;
  dataVersion?: string;
  ruleVersion?: string;
}

export type FilterPatch = Partial<Pick<FiltersState, 'countryCode' | 'industry' | 'mains' | 'platform' | 'granularity' | 'adaptive' | 'rangeStart' | 'rangeEnd' | 'currency' | 'priceTypes' | 'agg'>>;

export interface AgentCitation {
  id: string;
  kind: 'fact' | 'calculation' | 'alert' | 'rule' | 'page';
  label: string;
  detail: string;
}

export interface AgentStep {
  id: string;
  tool: AgentToolName;
  label: string;
  status: 'queued' | 'running' | 'success' | 'warning' | 'failed' | 'waiting_for_approval';
  detail: string;
  durationMs: number;
}

const TERMINAL_STEP_STATUSES: ReadonlySet<AgentStep['status']> = new Set(['success', 'warning', 'failed']);

/**
 * R3（终态收敛）：run 进入 success/empty/error/cancelled 等终态后，远端流式
 * 响应里可能残留 running/queued/waiting_for_approval 的工具步骤。历史消息里的
 * 工具卡必须全部呈现终态：成功类终态把未完成步骤收敛为 success，失败/取消
 * 类终态收敛为 failed，已终态的步骤原样保留。
 */
export function finalizeStepsForTerminalRun(steps: AgentStep[], runStatus: AgentRunStatus): AgentStep[] {
  const outcome: AgentStep['status'] = runStatus === 'failed' || runStatus === 'cancelled' ? 'failed' : 'success';
  return steps.map((step) => (TERMINAL_STEP_STATUSES.has(step.status) ? step : { ...step, status: outcome }));
}

export type AgentToolCallStatus = 'queued' | 'running' | 'success' | 'failed' | 'waiting_for_approval';

export interface AgentToolCall {
  id: string;
  tool: AgentToolName;
  label: string;
  status: AgentToolCallStatus;
  inputSummary?: string;
  outputSummary?: string;
  durationMs?: number;
  error?: string;
  requestId?: string;
  cardId?: string;
  expandable?: boolean;
}

export interface FilterResultCard {
  kind: 'filter';
  id: string;
  title: string;
  prompt?: string;
  patch: FilterPatch;
  changes: Array<{ label: string; before: string; after: string }>;
  warning?: string;
  actions?: AgentCardAction[];
  evidence?: AgentEvidence[];
  contextFingerprint?: string;
}

export interface TableResultCard {
  kind: 'table';
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
  note?: string;
  actions?: AgentCardAction[];
  evidence?: AgentEvidence[];
}

export interface ChartResultCard {
  kind: 'chart';
  id: string;
  title: string;
  series: Array<{ label: string; color: string; values: Array<{ bucket: string; value: number | null }> }>;
  note: string;
  actions?: AgentCardAction[];
  evidence?: AgentEvidence[];
}

export interface AlertResultCard {
  kind: 'alert';
  id: string;
  title: string;
  alert: AgentAlertRecord;
  facts: string[];
  checks: string[];
  evidence?: AgentEvidence[];
  actions?: AgentCardAction[];
}

export interface PriceAdvantageRow {
  id: string;
  countryCode: string;
  weekId: string;
  weekLabel: string;
  channelLabel: string;
  platform: string | null;
  currency: 'usd' | 'local';
  own: { modelId: string; modelName: string; romram: string; skuId: string; price: number };
  competitor: { modelId: string; modelName: string; romram: string; skuId: string; price: number };
  ownSelection: ProductSelection;
  compareSelection: ProductSelection;
  priceDiff: number;
  priceDiffPct: number;
  relation: 'advantage' | 'behind' | 'tie';
  contextFingerprint: string;
}

export interface PriceAdvantageResultCard {
  kind: 'price_advantage';
  id: string;
  title: string;
  rows: PriceAdvantageRow[];
  skuOptions: Array<{ skuId: string; label: string }>;
  note: string;
  currency: 'usd' | 'local';
  contextFingerprint: string;
  evidence?: AgentEvidence[];
  actions?: AgentCardAction[];
}

export interface AlertListResultCard {
  kind: 'alert_list';
  id: string;
  title: string;
  alerts: AgentAlertRecord[];
  contextFingerprint: string;
  note: string;
  actions?: AgentCardAction[];
  evidence?: AgentEvidence[];
}

export interface ForecastExplanationFactor {
  key: string;
  label: string;
  role: string;
  window: string;
  shape: string;
  status: string;
  confidence: string;
  evidence: string;
  effect: string;
}

export interface ForecastExplanationResultCard {
  kind: 'forecast_explanation';
  id: string;
  title: string;
  contextFingerprint: string;
  fitWindow: string;
  sampleCount: number;
  scope: {
    country: string;
    channel: string;
    product: string;
    currency: string;
    modelVersion: string;
  };
  dataStatus?: 'real' | 'simulated' | 'mixed';
  provenanceSummary?: string;
  fitStatus?: 'completed' | 'fallback' | 'insufficient';
  fitAppliedToForecast?: boolean;
  intervalCalibrated?: boolean;
  current: {
    week: string;
    price: number;
    baseDemand: number;
    unconstrainedDemand: number;
    available: number;
    so: number;
    inventory: number;
    risk: string;
  };
  scenario?: {
    active: boolean;
    forecastSo: number;
    baselineSo: number;
    soDelta: number;
    forecastMargin: number;
    baselineMargin: number;
    marginDelta: number;
  };
  factors: ForecastExplanationFactor[];
  assumptions: string[];
  boundaries: string[];
  actions?: AgentCardAction[];
  evidence?: AgentEvidence[];
}

export type AgentResultCard = FilterResultCard | TableResultCard | ChartResultCard | AlertResultCard | AlertListResultCard | PriceAdvantageResultCard | ForecastExplanationResultCard;

export interface AgentResponse {
  intent: AgentIntent;
  summary: string;
  steps: AgentStep[];
  cards: AgentResultCard[];
  citations: AgentCitation[];
  suggestions: string[];
  suggestionActions?: AgentSuggestionAction[];
  contextFingerprint: string;
  provider?: { name: string; model: string; reason?: string };
  provenance?: AgentProvenance;
  coverage?: CoverageSummary;
  factGuard?: {
    status: 'verified' | 'calibrated' | 'stale_context';
    message?: string;
  };
}

export interface AgentEvent {
  id: string;
  runId: string;
  sequence: number;
  type: AgentEventType;
  status?: AgentRunStatus;
  timestamp: string;
  message?: string;
  delta?: string;
  text?: string;
  tool?: AgentToolName;
  stepId?: string;
  cardId?: string;
  evidence?: AgentEvidence[];
  approval?: ApprovalRequest;
  provenance?: AgentProvenance;
  card?: AgentResultCard;
  patch?: Partial<AgentResultCard>;
  toolCall?: AgentToolCall;
}

export interface AgentRun {
  id: string;
  requestId: string;
  status: AgentRunStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  context: AgentContextSnapshot;
  events: AgentEvent[];
  approval?: ApprovalRequest;
  response?: AgentResponse;
  toolCalls?: AgentToolCall[];
  error?: { code?: string; message: string };
}

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === 'string'
    && typeof event.runId === 'string'
    && typeof event.sequence === 'number'
    && Number.isInteger(event.sequence)
    && typeof event.type === 'string'
    && typeof event.timestamp === 'string';
}

function isAgentCardDeep(value: unknown): value is AgentResultCard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const card = value as Record<string, unknown>;
  if (typeof card.id !== 'string' || !['filter', 'table', 'chart', 'alert', 'alert_list', 'price_advantage', 'forecast_explanation'].includes(String(card.kind))) return false;
  if (typeof card.title !== 'string') return false;
  if (card.kind === 'filter') return Boolean(card.patch && typeof card.patch === 'object' && Array.isArray(card.changes));
  if (card.kind === 'table') return Array.isArray(card.columns) && Array.isArray(card.rows);
  if (card.kind === 'chart') return Array.isArray(card.series) && typeof card.note === 'string';
  if (card.kind === 'alert') return Boolean(card.alert && Array.isArray(card.facts) && Array.isArray(card.checks));
  if (card.kind === 'alert_list') return Array.isArray(card.alerts) && typeof card.note === 'string';
  if (card.kind === 'price_advantage') return Array.isArray(card.rows) && Array.isArray(card.skuOptions) && typeof card.note === 'string' && typeof card.contextFingerprint === 'string';
  return Boolean(typeof card.contextFingerprint === 'string' && card.scope && card.current && Array.isArray(card.factors));
}

export function isContextStale(snapshot: AgentContextSnapshot, currentFingerprint: string): boolean {
  return snapshot.fingerprint !== currentFingerprint;
}

/**
 * Remote Agent responses are untrusted input.  Keep this guard deliberately
 * shallow: the deterministic engine owns card semantics, while the remote
 * provider is only allowed to rewrite the short narrative and suggestions.
 */
export function isAgentResponse(value: unknown): value is AgentResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  if (!['filter', 'query', 'forecast_explain', 'alert', 'price_advantage', 'price_alert', 'clarify'].includes(String(response.intent))) return false;
  if (typeof response.summary !== 'string' || typeof response.contextFingerprint !== 'string') return false;
  if (!Array.isArray(response.steps) || !Array.isArray(response.cards) || !Array.isArray(response.citations) || !Array.isArray(response.suggestions)) return false;
  if (response.provider !== undefined && (!response.provider || typeof response.provider !== 'object' || typeof (response.provider as Record<string, unknown>).name !== 'string' || typeof (response.provider as Record<string, unknown>).model !== 'string')) return false;
  if (response.suggestions.some((suggestion) => typeof suggestion !== 'string')) return false;
  if (response.suggestionActions !== undefined && (!Array.isArray(response.suggestionActions) || response.suggestionActions.some((item) => !item || typeof item !== 'object' || typeof (item as Record<string, unknown>).label !== 'string' || typeof (item as Record<string, unknown>).intent !== 'string'))) return false;
  if (response.steps.some((item) => !item || typeof item !== 'object' || typeof (item as Record<string, unknown>).tool !== 'string' || typeof (item as Record<string, unknown>).label !== 'string')) return false;
  if (response.cards.some((item) => !isAgentCardDeep(item))) return false;
  return true;
}

export interface FilterValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateFilterPatch(patch: unknown): FilterValidationResult {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { valid: false, errors: ['筛选预览格式无效'] };
  const allowed = new Set(['countryCode', 'industry', 'mains', 'platform', 'granularity', 'adaptive', 'rangeStart', 'rangeEnd', 'currency', 'priceTypes', 'agg']);
  const errors: string[] = [];
  for (const key of Object.keys(patch)) if (!allowed.has(key)) errors.push(`不允许修改字段：${key}`);
  const value = patch as Record<string, unknown>;
  if (value.currency !== undefined && value.currency !== 'usd' && value.currency !== 'local') errors.push('币种不受支持');
  if (value.granularity !== undefined && !['week', 'month', 'quarter'].includes(String(value.granularity))) errors.push('时间粒度不受支持');
  if (value.agg !== undefined && value.agg !== 'avg' && value.agg !== 'min') errors.push('汇总方式不受支持');
  if (value.industry !== undefined && !['phone', 'tablet', 'wearable', 'audio', 'iot', 'pc'].includes(String(value.industry))) errors.push('产业不受支持');
  if (value.countryCode !== undefined && !/^[A-Z]{2}$/.test(String(value.countryCode))) errors.push('国家代码格式无效');
  for (const key of ['rangeStart', 'rangeEnd', 'countryCode', 'industry']) if (value[key] !== undefined && typeof value[key] !== 'string') errors.push(`${key} 必须是文本`);
  for (const key of ['rangeStart', 'rangeEnd']) {
    if (value[key] !== undefined && typeof value[key] === 'string' && !/^\d{4}(?:\d{2}|Q[1-4])$/.test(value[key])) errors.push(`${key} 格式无效`);
  }
  if (typeof value.rangeStart === 'string' && typeof value.rangeEnd === 'string' && value.rangeStart > value.rangeEnd) errors.push('时间起点不能晚于终点');
  if (value.adaptive !== undefined && typeof value.adaptive !== 'boolean') errors.push('自适应开关格式无效');
  if (value.platform !== undefined && value.platform !== null) {
    const platform = value.platform;
    if (typeof platform !== 'object' || Array.isArray(platform) || !Array.isArray((platform as Record<string, unknown>).platforms) || !Array.isArray((platform as Record<string, unknown>).shopIds)) errors.push('平台筛选格式无效');
    else {
      const item = platform as Record<string, unknown>;
      if ((item.platforms as unknown[]).some((entry) => typeof entry !== 'string')) errors.push('平台名称格式无效');
      if ((item.shopIds as unknown[]).some((entry) => typeof entry !== 'string')) errors.push('店铺渠道格式无效');
      if (item.seller !== undefined && item.seller !== null && typeof item.seller !== 'string') errors.push('卖家格式无效');
    }
  }
  if (value.mains !== undefined) {
    const isSelection = (selection: unknown): boolean => {
      if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return false;
      const item = selection as Record<string, unknown>;
      return typeof item.modelId === 'string' && typeof item.romram === 'string' && Array.isArray(item.skuIds) && item.skuIds.every((sku) => typeof sku === 'string');
    };
    const validMains = Array.isArray(value.mains) && value.mains.length <= 50 && value.mains.every((card) => {
      if (!card || typeof card !== 'object' || Array.isArray(card)) return false;
      const item = card as Record<string, unknown>;
      return typeof item.id === 'string' && (item.main === null || isSelection(item.main)) && Array.isArray(item.compares) && item.compares.every(isSelection) && (item.auto === undefined || typeof item.auto === 'boolean');
    });
    if (!validMains) errors.push('产品分析组格式无效');
  }
  if (value.priceTypes !== undefined) {
    const p = value.priceTypes;
    if (!p || typeof p !== 'object' || typeof (p as Record<string, unknown>).discounted !== 'boolean' || typeof (p as Record<string, unknown>).rrp !== 'boolean') errors.push('价格类型格式无效');
  }
  return { valid: errors.length === 0, errors };
}

export function contextFingerprint(state: FiltersState, page: string): string {
  const compact = JSON.stringify({ page, countryCode: state.countryCode, industry: state.industry, mains: state.mains, platform: state.platform, granularity: state.granularity, adaptive: state.adaptive, rangeStart: state.rangeStart, rangeEnd: state.rangeEnd, currency: state.currency, priceTypes: state.priceTypes, agg: state.agg, alertSubs: state.alertSubs, alertTypes: state.alertTypes, alertThresholds: state.alertThresholds, alertProducts: state.alertProducts });
  let hash = 2166136261;
  for (let i = 0; i < compact.length; i += 1) hash = Math.imul(hash ^ compact.charCodeAt(i), 16777619);
  return `ctx-${(hash >>> 0).toString(16)}`;
}
