import type { FiltersState } from '../state/filtersTypes';

export type AgentIntent = 'filter' | 'query' | 'alert' | 'clarify';
export type AgentToolName =
  | 'catalog.resolve'
  | 'series.query'
  | 'series.compare'
  | 'alerts.query'
  | 'alerts.explain'
  | 'view.preview';

export interface AgentAlertRecord {
  key: string;
  type: string;
  brand: string;
  modelName: string;
  romram: string;
  weekLabel: string;
  weekId: string;
  price: number;
  wowPct: number | null;
  promoDeltaPp: number | null;
  gapPct: number | null;
  gapLowPlatform: string | null;
  gapHighPlatform: string | null;
  gapLowPrice: number | null;
  gapHighPrice: number | null;
  isOwn: boolean;
}

export interface AgentContextSnapshot {
  page: string;
  pageLabel?: string;
  state: FiltersState;
  alerts: readonly AgentAlertRecord[];
  createdAt: string;
  fingerprint: string;
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

export interface FilterResultCard {
  kind: 'filter';
  id: string;
  title: string;
  prompt?: string;
  patch: FilterPatch;
  changes: Array<{ label: string; before: string; after: string }>;
  warning?: string;
}

export interface TableResultCard {
  kind: 'table';
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
  note?: string;
}

export interface ChartResultCard {
  kind: 'chart';
  id: string;
  title: string;
  series: Array<{ label: string; color: string; values: Array<{ bucket: string; value: number | null }> }>;
  note: string;
}

export interface AlertResultCard {
  kind: 'alert';
  id: string;
  title: string;
  alert: AgentAlertRecord;
  facts: string[];
  checks: string[];
  evidence?: Array<{ label: string; detail: string }>;
}

export type AgentResultCard = FilterResultCard | TableResultCard | ChartResultCard | AlertResultCard;

export interface AgentResponse {
  intent: AgentIntent;
  summary: string;
  steps: AgentStep[];
  cards: AgentResultCard[];
  citations: AgentCitation[];
  suggestions: string[];
  contextFingerprint: string;
  provider?: { name: string; model: string };
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
  if (value.adaptive !== undefined && typeof value.adaptive !== 'boolean') errors.push('自适应开关格式无效');
  if (value.platform !== undefined && value.platform !== null) {
    const platform = value.platform;
    if (typeof platform !== 'object' || Array.isArray(platform) || !Array.isArray((platform as Record<string, unknown>).platforms) || !Array.isArray((platform as Record<string, unknown>).shopIds)) errors.push('平台筛选格式无效');
  }
  if (value.mains !== undefined) {
    const isSelection = (selection: unknown): boolean => {
      if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return false;
      const item = selection as Record<string, unknown>;
      return typeof item.modelId === 'string' && typeof item.romram === 'string' && Array.isArray(item.skuIds) && item.skuIds.every((sku) => typeof sku === 'string');
    };
    const validMains = Array.isArray(value.mains) && value.mains.every((card) => {
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
  const compact = JSON.stringify({ page, countryCode: state.countryCode, industry: state.industry, mains: state.mains, granularity: state.granularity, rangeStart: state.rangeStart, rangeEnd: state.rangeEnd, currency: state.currency, priceTypes: state.priceTypes });
  let hash = 2166136261;
  for (let i = 0; i < compact.length; i += 1) hash = Math.imul(hash ^ compact.charCodeAt(i), 16777619);
  return `ctx-${(hash >>> 0).toString(16)}`;
}
