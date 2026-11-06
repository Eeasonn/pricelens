import type { FiltersState } from '../state/filtersTypes';
import type { AlertEvidenceStatus, AlertLifecycle, AlertPriority } from '../dataModel/alertLifecycle';
import type { ForecastDataset } from '../pages/forecast/forecastModel';
import type { ForecastSnapshot } from '../pages/forecast/forecastSnapshot';

export type AgentIntent = 'filter' | 'query' | 'forecast_explain' | 'alert' | 'clarify';
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
  | 'failed'
  | 'cancelled'
  | 'stale_context';

export type AgentEventType =
  | 'run.started'
  | 'run.status'
  | 'step.started'
  | 'step.updated'
  /** Incremental assistant text; never treated as a deterministic fact. */
  | 'text.delta'
  /** Incremental structured card upsert; the baseline remains authoritative. */
  | 'card.patch'
  | 'approval.required'
  | 'clarification.required'
  | 'warning'
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
  /**
   * 'evidence' 只在卡内原地展开证据区（只读、不跳转、不受上下文过期禁用）；
   * 其余 kind 保持原有语义：apply=open+filterPatch、open=真实导航、
   * followup=带回当前上下文的追问、copy=复制提示词。
   */
  kind: 'apply' | 'open' | 'followup' | 'copy' | 'evidence';
  prompt?: string;
  disabled?: boolean;
  /**
   * Optional navigation / follow-up envelope.  Actions are only valid for
   * the context that produced the card; the UI must disable stale actions
   * instead of silently applying them to a different scope.
   */
  target?: AgentActionTarget;
}

export interface AgentActionTarget {
  page?: string;
  contextFingerprint: string;
  weekId?: string;
  modelId?: string;
  seriesKey?: string;
  /** Alert deep-link fields; the target remains scoped to the producing run. */
  alertId?: string;
  alertType?: string;
  alertSeriesKey?: string;
  /** A reversible filter patch used by an alert/card action. */
  filterPatch?: FilterPatch;
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
  ownGapPct?: number | null;
  isOwn: boolean;
  lifecycle?: AlertLifecycle;
  priority?: AlertPriority;
  priorityScore?: number;
  threshold?: number | null;
  ruleVersion?: string;
  dataVersion?: string;
  contextFingerprint?: string;
  evidenceIds?: string[];
  evidenceStatus?: AlertEvidenceStatus;
  /** Expanded deterministic evidence carried into the Agent result card. */
  evidence?: AgentEvidence[];
  actions?: AgentCardAction[];
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
  status: 'success' | 'warning' | 'failed';
  detail: string;
  durationMs: number;
}

/**
 * 'cancelled' 只由编排层在运行终态写入（R3）：远端/本地流事件创建的
 * queued/running 工具卡随运行终止收敛，不再显示「运行中」。
 */
export type ToolCallStatus = 'queued' | 'running' | 'success' | 'failed' | 'waiting_for_approval' | 'cancelled';

export interface ToolCallCard {
  kind: 'tool_call';
  id: string;
  tool: AgentToolName | string;
  status: ToolCallStatus;
  inputSummary: string;
  outputSummary?: string;
  durationMs?: number;
  error?: string;
  actions?: AgentCardAction[];
  filterCard?: FilterResultCard;
  expanded?: boolean;
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
}

export interface TableResultCard {
  kind: 'table';
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
  note?: string;
  /** B1 固定结构（R2）：显式「计算/规则」说明（空态卡须补齐查了哪些规则/口径）；缺省不渲染该节。 */
  rules?: string;
  /** B1 固定结构（R2）：判断边界（订阅范围与缺数边界）；缺省不渲染该节。 */
  boundaries?: string[];
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

export type PriceAdvantageDirection = 'advantage' | 'lagging' | 'parity';

export interface PriceAdvantageRow {
  id: string;
  countryCode: string;
  channel: string;
  weekId: string;
  weekLabel: string;
  ownModelId: string;
  ownModelName: string;
  ownRomram: string;
  ownSkuId: string;
  competitorModelId: string;
  competitorModelName: string;
  competitorBrand: string;
  competitorRomram: string;
  competitorSkuId: string;
  ownPrice: number;
  competitorPrice: number;
  gap: number;
  gapPct: number | null;
  direction: PriceAdvantageDirection;
  currency: 'usd' | 'local';
  target: {
    modelId: string;
    romram: string;
    skuIds: string[];
    weekId: string;
    platform: string | null;
  };
}

export interface PriceAdvantageSkuOption {
  skuId: string;
  modelId: string;
  modelName: string;
  romram: string;
  label: string;
}

export interface PriceAdvantageResultCard {
  kind: 'price_advantage';
  id: string;
  title: string;
  countryCode: string;
  currency: 'usd' | 'local';
  rows: PriceAdvantageRow[];
  skuOptions: PriceAdvantageSkuOption[];
  selectedSkuId?: string;
  filter: 'all' | 'advantage' | 'lagging';
  note: string;
  /** 判断边界（B1 固定结构）：对比覆盖口径与不推断因果的声明；缺省时 UI 不渲染该节。 */
  boundaries?: string[];
  actions?: AgentCardAction[];
  evidence?: AgentEvidence[];
  target?: AgentActionTarget;
}

export interface AlertResultCard {
  kind: 'alert';
  id: string;
  title: string;
  alert: AgentAlertRecord;
  /** Multiple latest alerts are rendered as independently actionable rows. */
  alerts?: AgentAlertRecord[];
  facts: string[];
  checks: string[];
  /** 判断边界（B1 固定结构）：规则触发不等于因果、订阅覆盖范围等口径声明。 */
  boundaries?: string[];
  evidence?: AgentEvidence[];
  actions?: AgentCardAction[];
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

export type AgentResultCard = FilterResultCard | TableResultCard | ChartResultCard | AlertResultCard | ForecastExplanationResultCard | ToolCallCard | PriceAdvantageResultCard;

export interface AgentResponse {
  intent: AgentIntent;
  summary: string;
  steps: AgentStep[];
  cards: AgentResultCard[];
  citations: AgentCitation[];
  suggestions: Array<string | AgentSuggestion>;
  contextFingerprint: string;
  provider?: { name: string; model: string };
  fallbackReason?: string;
  provenance?: AgentProvenance;
  coverage?: CoverageSummary;
  /** Set by the client when untrusted remote facts were ignored. */
  factGuard?: {
    calibrated: boolean;
    message: string;
    rejectedFields?: string[];
  };
}

export interface AgentSuggestion {
  label: string;
  intent: AgentIntent;
  target?: 'comparison' | 'evidence' | 'filter_preview' | 'query';
  prompt: string;
}

export interface AgentEvent {
  id: string;
  runId: string;
  sequence: number;
  type: AgentEventType;
  status?: AgentRunStatus;
  timestamp: string;
  message?: string;
  tool?: AgentToolName;
  stepId?: string;
  cardId?: string;
  /** Payload for text.delta events. */
  delta?: string;
  /** Structured card payload for card.ready/card.patch events. */
  card?: AgentResultCard;
  /** Partial card fields for card.patch events. */
  cardPatch?: Partial<AgentResultCard>;
  evidence?: AgentEvidence[];
  approval?: ApprovalRequest;
  provenance?: AgentProvenance;
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
  error?: { code?: string; message: string };
}

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (event.delta !== undefined && typeof event.delta !== 'string') return false;
  if (event.card !== undefined && !isAgentResultCard(event.card)) return false;
  if (event.cardPatch !== undefined && !isRecord(event.cardPatch)) return false;
  return typeof event.id === 'string'
    && typeof event.runId === 'string'
    && typeof event.sequence === 'number'
    && Number.isInteger(event.sequence)
    && typeof event.type === 'string'
    && typeof event.timestamp === 'string';
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
  if (!['filter', 'query', 'forecast_explain', 'alert', 'clarify'].includes(String(response.intent))) return false;
  if (typeof response.summary !== 'string' || typeof response.contextFingerprint !== 'string') return false;
  if (!Array.isArray(response.steps) || !Array.isArray(response.cards) || !Array.isArray(response.citations) || !Array.isArray(response.suggestions)) return false;
  if (response.provider !== undefined && (!response.provider || typeof response.provider !== 'object' || typeof (response.provider as Record<string, unknown>).name !== 'string' || typeof (response.provider as Record<string, unknown>).model !== 'string')) return false;
  if (response.suggestions.some((suggestion) => typeof suggestion !== 'string' && !isAgentSuggestion(suggestion))) return false;
  if (response.steps.some((item) => !isAgentStep(item))) return false;
  if (response.cards.some((item) => !isAgentResultCard(item))) return false;
  if (response.citations.some((item) => !isAgentCitation(item))) return false;
  if (response.coverage !== undefined && !isCoverageSummary(response.coverage)) return false;
  if (response.factGuard !== undefined && !isFactGuard(response.factGuard)) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAgentStep(value: unknown): value is AgentStep {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.tool === 'string'
    && typeof value.label === 'string'
    && ['success', 'warning', 'failed'].includes(String(value.status))
    && typeof value.detail === 'string'
    && typeof value.durationMs === 'number';
}

function isAgentCitation(value: unknown): value is AgentCitation {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && ['fact', 'calculation', 'alert', 'rule', 'page'].includes(String(value.kind))
    && typeof value.label === 'string'
    && typeof value.detail === 'string';
}

function isAgentSuggestion(value: unknown): value is AgentSuggestion {
  if (!isRecord(value)) return false;
  return typeof value.label === 'string'
    && typeof value.prompt === 'string'
    && ['filter', 'query', 'forecast_explain', 'alert', 'clarify'].includes(String(value.intent))
    && (value.target === undefined || ['comparison', 'evidence', 'filter_preview', 'query'].includes(String(value.target)));
}

function isAgentResultCard(value: unknown): value is AgentResultCard {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  const kind = String(value.kind);
  if (kind === 'tool_call') return typeof value.tool === 'string' && ['queued', 'running', 'success', 'failed', 'waiting_for_approval', 'cancelled'].includes(String(value.status)) && typeof value.inputSummary === 'string';
  if (kind === 'price_advantage') {
    return typeof value.title === 'string'
      && typeof value.countryCode === 'string'
      && (value.currency === 'usd' || value.currency === 'local')
      && Array.isArray(value.rows)
      && Array.isArray(value.skuOptions)
      && ['all', 'advantage', 'lagging'].includes(String(value.filter))
      && typeof value.note === 'string';
  }
  if (!['filter', 'table', 'chart', 'alert', 'forecast_explanation'].includes(kind)) return false;
  // Keep the remote boundary strict enough to reject malformed or fact-shaped
  // payloads while leaving the domain-specific card validators in their own
  // modules. The baseline still owns every card value in the merge below.
  if (kind === 'filter') return isRecord(value.patch) && Array.isArray(value.changes);
  if (kind === 'table') return Array.isArray(value.columns) && Array.isArray(value.rows);
  if (kind === 'chart') return Array.isArray(value.series) && typeof value.note === 'string';
  if (kind === 'alert') return isRecord(value.alert) && Array.isArray(value.facts) && Array.isArray(value.checks);
  return typeof value.contextFingerprint === 'string' && isRecord(value.scope) && isRecord(value.current) && Array.isArray(value.factors) && Array.isArray(value.assumptions) && Array.isArray(value.boundaries);
}

function isCoverageSummary(value: unknown): value is CoverageSummary {
  if (!isRecord(value)) return false;
  return Number.isInteger(value.covered) && Number.isInteger(value.total)
    && (value.missing === undefined || Number.isInteger(value.missing))
    && (value.stale === undefined || Number.isInteger(value.stale))
    && (value.note === undefined || typeof value.note === 'string');
}

function isFactGuard(value: unknown): value is NonNullable<AgentResponse['factGuard']> {
  if (!isRecord(value)) return false;
  return typeof value.calibrated === 'boolean'
    && typeof value.message === 'string'
    && (value.rejectedFields === undefined || (Array.isArray(value.rejectedFields) && value.rejectedFields.every((item) => typeof item === 'string')));
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
