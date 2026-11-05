import { buildSeries, lowestPriceColorSku, platformPriceSpread } from '../dataModel/aggregate';
import { dimProduct, dimRegion, dimTime } from '../data';
import { buildCards, clampMains, flatSelections, withAutoOn } from '../state/mainSelection';
import type { FiltersState, MainProduct, ProductSelection } from '../state/filtersTypes';
import type { SeriesQuery } from '../dataModel/types';
import type { AgentActionTarget, AgentAlertRecord, AgentContextSnapshot, AgentIntent, AgentResponse, AgentResultCard, AgentStep, FilterPatch, FilterResultCard, ForecastContextInput, AgentSuggestion } from './contracts';
import { contextFingerprint } from './contracts';
import { BASELINE_DRAFT, type ForecastDataset, type ScenarioDraft } from '../pages/forecast/forecastModel';
import type { ForecastDraftInput } from './contracts';
import { simpleDemoDataset as forecastFixture } from '../pages/forecast/forecastDatasetRegistry';
import { createForecastSnapshot, type ForecastSnapshot } from '../pages/forecast/forecastSnapshot';
import { provenanceSummary } from '../dataModel/provenance';
import { buildPriceAdvantageResult } from './priceAdvantage';

const id = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase();
const compact = (s: string): string => s.toLocaleLowerCase().replace(/[\s_\-]+/g, '').replace(/[’']/g, '');
const suggestion = (label: string, prompt: string, intent: AgentIntent, target?: AgentSuggestion['target']): AgentSuggestion => ({ label, prompt, intent, target });
const CORE_SUGGESTIONS: AgentSuggestion[] = [
  suggestion('价格优势', '比较我司与核心竞品的价格优势', 'query', 'comparison'),
  suggestion('价格预警', '查看价格预警', 'alert', 'evidence'),
  suggestion('基础我司快搜', '查看当前我司产品价格概览', 'query', 'query'),
];

const COUNTRY_ALIASES: Record<string, string> = {
  巴西: 'BR', 中国: 'CN', 俄罗斯: 'RU', 俄国: 'RU', 美国: 'US', 英国: 'GB',
  'R国': 'RU', 'R 国': 'RU',
  法国: 'FR', 德国: 'DE', 西班牙: 'ES', 意大利: 'IT', 土耳其: 'TR', 墨西哥: 'MX',
  沙特: 'SA', 沙特阿拉伯: 'SA', 阿联酋: 'AE', 阿拉伯联合酋长国: 'AE',
  印度尼西亚: 'ID', 印尼: 'ID', 马来西亚: 'MY', 新加坡: 'SG', 泰国: 'TH',
  越南: 'VN', 南非: 'ZA', 菲律宾: 'PH', 波兰: 'PL', 罗马尼亚: 'RO',
};

interface ProductEntity {
  modelId: string;
  modelName: string;
  brand: string;
  industry: string;
  rows: typeof dimProduct;
  score: number;
  exact: boolean;
}

export interface AgentEntityResolution {
  countryCode: string;
  countryName: string;
  explicitCountry: boolean;
  explicitProduct: boolean;
  productLabels: string[];
  selections: ProductSelection[];
  unavailableProducts: string[];
}

function modelPrefixes(modelName: string): string[] {
  const words = modelName.split(/\s+/).filter(Boolean);
  const out = new Set<string>([compact(modelName)]);
  // 允许用户说“Pura 90s”来指代“Pura 90s Pro/Pro Max”，但保留完整型号优先级。
  for (let i = words.length - 1; i >= 2; i -= 1) out.add(compact(words.slice(0, i).join(' ')));
  return [...out].filter((value) => value.length >= 4).sort((a, b) => b.length - a.length);
}

function knownEntityInText(text: string): boolean {
  const haystack = compact(text);
  if (Object.keys(COUNTRY_ALIASES).some((alias) => text.includes(alias))) return true;
  if (/(?:^|[^a-z])(BR|CN|RU|US|GB|FR|DE|ES|IT|TR|MX|SA|AE|ID|MY|SG|TH|VN|ZA|PH|PL|RO)(?:$|[^a-z])/i.test(text)) return true;
  const byModel = new Map<string, string>();
  for (const row of dimProduct) byModel.set(row.model_id, row.model_name);
  return [...byModel.values()].some((name) => modelPrefixes(name).some((prefix) => haystack.includes(prefix)));
}

function countryOfText(text: string, fallback: string): { code: string; explicit: boolean } {
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) if (text.includes(alias)) return { code, explicit: true };
  const byName = dimRegion.find((region) => text.includes(region.country_name));
  if (byName) return { code: byName.country_code, explicit: true };
  const code = text.match(/(?:^|[^a-z])(BR|CN|RU|US|GB|FR|DE|ES|IT|TR|MX|SA|AE|ID|MY|SG|TH|VN|ZA|PH|PL|RO)(?:$|[^a-z])/i)?.[1];
  return code ? { code: code.toUpperCase(), explicit: true } : { code: fallback, explicit: false };
}

function productEntitiesOfText(text: string, industry: FiltersState['industry']): ProductEntity[] {
  const haystack = compact(text);
  const groups = new Map<string, ProductEntity>();
  for (const row of dimProduct) {
    const existing = groups.get(row.model_id);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    const prefixes = modelPrefixes(row.model_name);
    const exact = prefixes.some((prefix) => prefix === compact(row.model_name) && haystack.includes(prefix));
    const score = Math.max(...prefixes.filter((prefix) => haystack.includes(prefix)).map((prefix) => prefix.length), 0);
    groups.set(row.model_id, { modelId: row.model_id, modelName: row.model_name, brand: row.brand, industry: row.industry, rows: [row], score, exact });
  }
  const matched = [...groups.values()]
    .filter((entity) => entity.industry === industry && entity.score > 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || a.modelName.localeCompare(b.modelName));
  const exact = matched.filter((entity) => entity.exact);
  return exact.length ? exact : matched;
}

function selectionsForEntity(entity: ProductEntity, countryCode: string): { selections: ProductSelection[]; available: boolean } {
  const countryRows = entity.rows.filter((row) => row.countries.includes(countryCode));
  const rows = countryRows.length ? countryRows : entity.rows;
  const romrams = [...new Set(countryRows.map((row) => row.romram))];
  if (!countryRows.length) return { selections: [], available: false };
  return {
    selections: romrams.map((romram) => {
      const configRows = rows.filter((row) => norm(row.romram) === norm(romram));
      const skuId = lowestPriceColorSku(entity.modelId, romram, countryCode) ?? configRows[0]?.sku_id;
      return { modelId: entity.modelId, romram, skuIds: skuId ? [skuId] : [] };
    }).filter((selection) => selection.skuIds.length > 0),
    available: true,
  };
}

/** 从自然语言中解析国家和产品实体，供查询与筛选共用。 */
export function resolveAgentEntities(text: string, state: FiltersState): AgentEntityResolution {
  const country = countryOfText(text, state.countryCode);
  const entities = productEntitiesOfText(text, state.industry);
  const topScore = entities[0]?.score ?? 0;
  const selectedEntities = entities.filter((entity) => entity.score === topScore);
  const selections: ProductSelection[] = [];
  const unavailableProducts: string[] = [];
  for (const entity of selectedEntities) {
    const resolved = selectionsForEntity(entity, country.code);
    if (!resolved.available) unavailableProducts.push(`${entity.brand} ${entity.modelName}`);
    selections.push(...resolved.selections);
  }
  return {
    countryCode: country.code,
    countryName: dimRegion.find((region) => region.country_code === country.code)?.country_name ?? country.code,
    explicitCountry: country.explicit,
    explicitProduct: selectedEntities.length > 0,
    productLabels: selectedEntities.map((entity) => `${entity.brand} ${entity.modelName}`),
    selections,
    unavailableProducts,
  };
}

function step(tool: AgentStep['tool'], label: string, detail: string, status: AgentStep['status'] = 'success'): AgentStep {
  return { id: id('step'), tool, label, detail, status, durationMs: 18 };
}

export function classifyIntent(text: string): AgentIntent {
  if (/预警|异常|阈值|触发原因|为什么.*变/.test(text)) return 'alert';
  if (/(?:量价预测|简单版预测|预测)/.test(text) && /解释|假设|证据|风险|不确定|为什么/.test(text)) return 'forecast_explain';
  if (/只看|切换|显示|带上|去掉|最近\s*\d+\s*(周|月)|usd|美元|本币|rrp|划线价/i.test(text)) return 'filter';
  if (/价格优势|优势|领先|落后|最低|最便宜|价差|趋势|价格|平台|多少|均值|变化|情报|预测|销量|需求|供给|库存|汇率|大盘/.test(text)) return 'query';
  if (knownEntityInText(text) && /看|查|查询|了解|情况|表现|分析|走势/.test(text)) return 'query';
  return 'clarify';
}

/**
 * 查询命中关键词并不代表口径已经明确。没有产品上下文时，
 * “最便宜/最低/平台/趋势”等问题不能猜测当前产品；模糊时间也应先让用户确认。
 * 这个检查只作用于查询意图，不改变筛选预览、预警解释和演示预测的确定性流程。
 */
export function clarificationReasonForQuery(text: string, state: FiltersState, entities = resolveAgentEntities(text, state)): string | null {
  const hasSelectedProduct = state.mains.some((card) => Boolean(card.main));
  const targeted = /价格优势|优势|领先|落后|比较|对比|打开依据|依据|解释当前|主竞品|最新预警|市场情报|事件|汇率|量价|销量|预测|不确定性|价格下调|价格上调|趋势/.test(text);
  const isForecast = /量价预测|价格下调|价格上调|调整\s*\d+(?:\.\d+)?\s*%|预测情景/.test(text);
  if (isForecast) return null;
  if (!entities.explicitProduct && !hasSelectedProduct && !targeted) return '产品';

  const hasExplicitRange = /最近\s*\d+\s*(周|星期|月)|\d{4}\s*(年|年初|年末)?\s*(?:第?\d+\s*(周|月)|Q[1-4])|\d{4}(?:\d{2}|Q[1-4])/.test(text);
  const usesBusinessLatestBucket = /(?:最近|最新)有价周/.test(text);
  if (/最近|近期|近段时间|这段时间/.test(text) && !hasExplicitRange && !usesBusinessLatestBucket) return '时间范围';
  if (targeted) return null;

  return null;
}

function recentRange(state: FiltersState, count: number): Pick<FilterPatch, 'adaptive' | 'rangeStart' | 'rangeEnd'> {
  const buckets = dimTime.map((t) => t.week_id);
  const end = buckets[buckets.length - 1] ?? state.rangeEnd;
  const start = buckets[Math.max(0, buckets.length - count)] ?? state.rangeStart;
  return { adaptive: false, rangeStart: start, rangeEnd: end };
}

export function buildFilterPatch(text: string, state: FiltersState): FilterPatch {
  const patch: FilterPatch = {};
  if (/\b(usd|美元)\b/i.test(text)) patch.currency = 'usd';
  if (/本币|当地币|local/i.test(text)) patch.currency = 'local';
  if (/带上\s*(rrp|划线价)|显示\s*(rrp|划线价)/i.test(text)) patch.priceTypes = { ...state.priceTypes, rrp: true };
  if (/去掉\s*(rrp|划线价)|只看折后/i.test(text)) patch.priceTypes = { discounted: true, rrp: false };
  const recent = text.match(/最近\s*(\d+)\s*(周|星期|月)/);
  if (recent) {
    const count = Math.max(2, Math.min(52, Number(recent[1]) || 8));
    Object.assign(patch, recentRange(state, count));
  }
  const entities = resolveAgentEntities(text, state);
  if (entities.explicitCountry) patch.countryCode = entities.countryCode;
  if (entities.explicitProduct && entities.selections.length) {
    // Keep natural-language filtering on the same card builder as header
    // search. This preserves the default own-product competitor matrix and
    // enforces the shared 8-card / 3-compare caps.
    patch.mains = clampMains(buildCards(entities.selections, { auto: true }));
  }
  return patch;
}

function formatPatchValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'boolean') return value ? '开' : '关';
  if (typeof value === 'object' && value !== null && 'rrp' in value) return (value as { rrp: boolean }).rrp ? '折后价 + RRP' : '仅折后价';
  // 产品选择数组：结构化格式（型号 · 规格，逗号连接），不落 [object Object]。
  if (Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null && 'main' in item)) {
    const labels = (value as Array<{ main: { modelId: string; romram: string; skuIds?: string[] } }>).map((item) => {
      const name = dimProduct.find((row) => row.model_id === item.main.modelId)?.model_name ?? item.main.modelId;
      const sku = item.main.skuIds?.[0];
      return `${name} · ${item.main.romram}${sku ? ` · ${sku}` : ''}`;
    });
    return labels.length ? labels.join('、') : '未选择';
  }
  return String(value);
}

function filterLabelOf(key: keyof FilterPatch): string {
  return key === 'priceTypes' ? '价格类型' : key === 'rangeStart' ? '时间起点' : key === 'rangeEnd' ? '时间终点' : key === 'adaptive' ? '自动时间范围' : key === 'currency' ? '币种' : key === 'countryCode' ? '国家' : key === 'mains' ? '产品' : key;
}

export function buildFilterCard(text: string, state: FiltersState): FilterResultCard | null {
  const patch = buildFilterPatch(text, state);
  if (!Object.keys(patch).length) return null;
  const changes: Array<{ label: string; before: string; after: string }> = [];
  for (const key of Object.keys(patch) as Array<keyof FilterPatch>) {
    const before = formatPatchValue(state[key]);
    const after = formatPatchValue(patch[key]);
    if (before !== after) changes.push({ label: filterLabelOf(key), before, after });
  }
  return {
    kind: 'filter',
    id: id('filter'),
    title: '筛选预览（尚未应用）',
    prompt: text,
    patch,
    changes,
    warning: changes.length ? undefined : '当前筛选已经是目标状态，无需应用。',
  };
}

function selections(state: FiltersState): ProductSelection[] {
  const { mainSels, compareSels } = flatSelections(state.mains);
  return [...mainSels, ...compareSels];
}

function seriesQueryOf(state: FiltersState): SeriesQuery | null {
  const groups = selections(state).map((selection) => ({
    modelId: selection.modelId,
    romram: selection.romram,
    skuIds: selection.skuIds,
    isOwn: selection.skuIds.some((sku) => dimProduct.find((p) => p.sku_id === sku)?.is_own),
    platform: selection.platform ? { platforms: selection.platform.platforms, shopIds: selection.platform.shopIds, seller: selection.platform.seller } : null,
  }));
  if (!groups.length) return null;
  return { scope: { countryCode: state.countryCode, industry: state.industry }, groups, granularity: state.granularity, startBucket: state.rangeStart, endBucket: state.rangeEnd, currency: state.currency, agg: state.agg };
}

/** Resolve the last fact week inside the active bucket range for platform cards. */
function latestWeekForRange(state: FiltersState): string {
  const bucketOf = (time: (typeof dimTime)[number]): string => {
    if (state.granularity === 'month') return time.month_id;
    if (state.granularity === 'quarter') return time.quarter_id;
    return time.week_id;
  };
  const inRange = dimTime.filter((time) => {
    const bucket = bucketOf(time);
    return bucket >= state.rangeStart && bucket <= state.rangeEnd;
  }).sort((a, b) => a.week_id.localeCompare(b.week_id));
  return inRange[inRange.length - 1]?.week_id ?? state.rangeEnd;
}

function stateForEntityQuery(state: FiltersState, entities: AgentEntityResolution): FiltersState {
  let targetSelections = entities.selections;
  if (!entities.explicitProduct && entities.explicitCountry) {
    targetSelections = selections(state).filter((selection) => dimProduct.some((row) => row.model_id === selection.modelId && norm(row.romram) === norm(selection.romram) && row.countries.includes(entities.countryCode)));
  }
  if (!entities.explicitCountry && !entities.explicitProduct) return state;
  const mains: MainProduct[] = targetSelections.map((selection, index) => ({ id: `agent-query-${index}`, main: selection, compares: [] }));
  return { ...state, countryCode: entities.countryCode, mains };
}

function stateForPriceAdvantage(state: FiltersState, entities: AgentEntityResolution): FiltersState {
  let next = stateForEntityQuery(state, entities);
  // A competitor-only page selection must not make the core price-advantage
  // entry point silently compare Apple/Samsung against each other. Materialize
  // an own product when the current scope has no Huawei main card.
  const ownCard = next.mains.find((card) => card.main && ownSelectionForAgent(card.main));
  if (ownCard) return { ...next, mains: clampMains(next.mains.map((card) => card.id === ownCard.id ? withAutoOn(card) : card)) };
  const own = dimProduct.find((row) => row.is_own && row.industry === state.industry && row.countries.includes(entities.countryCode || state.countryCode));
  if (!own) return next;
  const skuId = lowestPriceColorSku(own.model_id, own.romram, entities.countryCode || state.countryCode) ?? own.sku_id;
  return { ...next, countryCode: entities.countryCode || state.countryCode, mains: clampMains(buildCards([{ modelId: own.model_id, romram: own.romram, skuIds: [skuId] }], { auto: true })) };
}

function ownSelectionForAgent(selection: ProductSelection): boolean {
  return selection.skuIds.some((skuId) => dimProduct.find((row) => row.sku_id === skuId)?.is_own === true);
}

function noDataResult(entities: AgentEntityResolution, state: FiltersState): { cards: AgentResultCard[]; citations: AgentResponse['citations']; steps: AgentStep[]; summary: string } {
  const labels = entities.unavailableProducts.length ? entities.unavailableProducts : entities.productLabels;
  const productText = labels.length ? labels.join('、') : '当前页面选择的产品';
  const rows = labels.length ? labels.map((label) => [label, entities.countryName, '无可用价格数据']) : [[productText, entities.countryName, '无可用价格数据']];
  const table: AgentResultCard = {
    kind: 'table', id: id('table'), title: '目标查询结果', columns: ['产品', '国家', '结果'], rows,
    note: '已按请求的国家和产品查询；当前数据集没有可用的价格事实，因此没有沿用原看板产品代替。',
  };
  return {
    cards: [table],
    citations: [{ id: id('citation'), kind: 'fact', label: '产品与国家维表', detail: `${productText} · ${entities.countryName}` }],
    steps: [step('catalog.resolve', '解析产品与国家', `${productText} · ${entities.countryName}`, 'success'), step('series.query', '查询价格序列', '没有可用价格事实', 'warning')],
    summary: `${productText}在${entities.countryName}没有可用的价格数据；我没有用当前页面的其他产品冒充结果。`,
  };
}

function queryCards(state: FiltersState, text: string, entities: AgentEntityResolution = resolveAgentEntities(text, state)): { cards: AgentResultCard[]; citations: AgentResponse['citations']; steps: AgentStep[]; summary: string } {
  let queryState = stateForEntityQuery(state, entities);
  // Preset comparison/evidence chips are actionable even when the shell has
  // not materialized a product selection yet: use the first country-valid
  // own product as a deterministic target instead of falling into clarify.
  if (!queryState.mains.some((card) => card.main) && /比较|对比|依据|解释当前|主竞品|最新预警|市场情报|事件|汇率|量价|销量|预测|不确定性|价格下调|价格上调|趋势/.test(text)) {
    const own = dimProduct.find((row) => row.is_own && row.industry === state.industry && row.countries.includes(state.countryCode));
    if (own) queryState = { ...queryState, mains: buildCards([{ modelId: own.model_id, romram: own.romram, skuIds: [own.sku_id] }], { auto: true }) };
  }
  const query = seriesQueryOf(queryState);
  if (!query) {
    if (entities.explicitCountry || entities.explicitProduct) return noDataResult(entities, queryState);
    return { cards: [], citations: [], steps: [step('catalog.resolve', '解析当前产品', '当前页面还没有可查询的产品', 'warning')], summary: '当前看板还没有选中的产品，请先选择一个主品或竞品。' };
  }
  try {
    const series = buildSeries(query);
    const hasValue = series.some((item) => item.points.some((point) => point.price != null));
    if (!hasValue && (entities.explicitCountry || entities.explicitProduct)) return noDataResult(entities, queryState);
    const scopeLabel = entities.explicitCountry || entities.explicitProduct
      ? `${entities.countryName}${entities.productLabels.length ? ` · ${entities.productLabels.join('、')}` : ''}`
      : '当前页面';
    const chart = {
      kind: 'chart' as const,
      id: id('chart'),
      title: /最低|最便宜|平台/.test(text) ? `${scopeLabel}价格走势` : `${scopeLabel}价格走势摘要`,
      series: series.slice(0, 6).map((s) => ({ label: s.label, color: s.color, values: s.points.slice(-8).map((p) => ({ bucket: p.xLabel, value: p.price })) })),
      note: `${queryState.currency === 'usd' ? 'USD' : '本币'} · ${queryState.granularity} · ${queryState.rangeStart}–${queryState.rangeEnd}；数值来自统一价格聚合引擎。`,
      actions: [{ id: id('action'), label: '解释趋势变化', kind: 'followup' as const, prompt: '解释这组价格趋势的关键变化和需要核查的异常点' }, { id: id('action'), label: '回看板定位', kind: 'open' as const, prompt: '把这组价格趋势定位回当前看板' }],
      evidence: [{ id: id('evidence'), label: '价格序列', detail: `${series.length} 条系列 · ${queryState.rangeStart}–${queryState.rangeEnd}`, source: '统一价格聚合引擎' }],
    };
    const rows = series.slice(0, 8).map((s) => {
      const valued = s.points.filter((p) => p.price != null);
      const latest = valued[valued.length - 1]?.price ?? null;
      const previous = valued[valued.length - 2]?.price ?? null;
      const change = latest != null && previous != null && previous !== 0 ? `${(((latest - previous) / previous) * 100).toFixed(1)}%` : '—';
      return [s.label, latest == null ? '—' : latest.toLocaleString(), change, s.channelBadge?.label ?? '自动'];
    });
    const platformQuestion = /最低|最便宜|平台/.test(text);
    let table: AgentResultCard;
    if (platformQuestion) {
      const first = selections(queryState)[0];
      const latestWeek = latestWeekForRange(queryState);
      const spread = first ? platformPriceSpread(first.skuIds[0], latestWeek, queryState.countryCode, queryState.currency) : [];
      const lowest = spread[0]?.price ?? null;
      table = { kind: 'table', id: id('table'), title: '最新有价周平台比较', columns: ['平台', '最低价', '相对最低价'], rows: spread.slice(0, 8).map((item) => [item.platform, item.price.toLocaleString(), lowest == null || lowest === 0 ? '—' : item.price === lowest ? '最低' : `+${(((item.price - lowest) / lowest) * 100).toFixed(1)}%`]), note: spread.length ? `按 ${latestWeek} 的平台最低在架价排序；当前最便宜平台为 ${spread[0].platform}。` : '当前产品在最新有价周没有可比较的平台数据。', actions: [{ id: id('action'), label: '查看价差解释', kind: 'followup', prompt: '解释最新有价周的平台价差及可能的核查方向' }, { id: id('action'), label: '定位到看板', kind: 'open', prompt: `把 ${latestWeek} 的平台比较定位回看板` }], evidence: [{ id: id('evidence'), label: '平台比较', detail: `${latestWeek} · ${spread.length} 个平台`, source: '统一价格聚合引擎' }] };
    } else {
      table = { kind: 'table', id: id('table'), title: '最新价格摘要', columns: ['产品', '最新价', '环比', '取价口径'], rows, note: '少于两个有效点时不计算环比；结果可回到看板继续下钻。', actions: [{ id: id('action'), label: '比较主竞品', kind: 'followup', prompt: '把当前产品和主竞品放在同一张价格表里比较' }, { id: id('action'), label: '回看板下钻', kind: 'open', prompt: '把这张价格摘要定位回当前看板继续下钻' }], evidence: [{ id: id('evidence'), label: '价格摘要', detail: `${rows.length} 个产品 · ${queryState.rangeStart}–${queryState.rangeEnd}`, source: '统一价格聚合引擎' }] };
    }
    return { cards: [chart, table], citations: [{ id: id('citation'), kind: 'calculation', label: '统一价格聚合引擎', detail: `${series.length} 条系列 · ${queryState.countryCode} · ${queryState.rangeStart}–${queryState.rangeEnd}` }], steps: [step('catalog.resolve', '解析产品与口径', `${query.groups.length} 个产品组`), step('series.query', '查询价格序列', `${series.length} 条系列`), step('series.compare', '计算变化', '已完成确定性计算')], summary: rows.length ? `已按${scopeLabel}整理 ${rows.length} 个产品的价格结果。` : '当前范围没有足够的价格数据。' };
  } catch {
    return { cards: [], citations: [], steps: [step('series.query', '查询价格序列', '价格引擎返回异常', 'failed')], summary: '价格数据暂时无法读取，请刷新后重试。' };
  }
}

function forecastCards(
  text: string,
  target: { page: string; contextFingerprint: string },
  forecastDraft: ForecastDraftInput = BASELINE_DRAFT,
  forecastDataset: ForecastDataset = forecastFixture,
  forecastSnapshot?: ForecastSnapshot,
): { cards: AgentResultCard[]; citations: AgentResponse['citations']; steps: AgentStep[]; summary: string } {
  const baselineSnapshot = forecastSnapshot ?? createForecastSnapshot(forecastDataset, forecastDraft, target.contextFingerprint);
  const currentIndex = forecastDataset.params.currentWeekIndex;
  const firstForecastWeek = baselineSnapshot.forecastWeeks[0] ?? baselineSnapshot.current;
  const basePrice = firstForecastWeek?.price ?? forecastDataset.params.referencePrice;
  const elasticity = forecastSnapshot?.fit.application?.priceElasticity ?? forecastDataset.params.priceElasticity;
  const requested = text.match(/(?:下调|上调|调整)\s*(\d+(?:\.\d+)?)\s*%/);
  const offsets = requested ? [-(Number(requested[1]) || 5), 0, Number(requested[1]) || 5] : [-10, -5, 0, 5, 10];
  const rows = offsets.map((offset) => {
    const netOffset = forecastDraft.priceDeltaPct + offset;
    const scenarioSnapshot = createForecastSnapshot(forecastDataset, { ...forecastDraft, priceDeltaPct: netOffset }, target.contextFingerprint);
    const future = scenarioSnapshot.forecastWeeks;
    const demand = future.reduce((sum, week) => sum + week.unconstrainedDemand, 0);
    const supply = future.reduce((sum, week) => sum + week.so, 0);
    const price = Math.round(basePrice * (1 + netOffset / 100));
    return [`${netOffset > 0 ? '+' : ''}${netOffset}%`, price.toLocaleString(), demand.toLocaleString(), supply.toLocaleString()];
  });
  const actionTarget = { page: target.page, contextFingerprint: target.contextFingerprint, forecastDraft, forecastSnapshot: baselineSnapshot, forecastDataset };
  const table: AgentResultCard = { kind: 'table', id: id('forecast'), title: '量价预测情景', columns: ['价格变化', '预测价格', '预测窗口理论需求', '预测窗口 SO'], rows, note: `模型 ${forecastDataset.meta.modelVersion}：参考价 ${forecastDataset.params.referencePrice}，价格弹性 ${elasticity.toFixed(2)}；结果来自 ${forecastDataset.context.weekRange} 的确定性计算，供方向性判断。`, actions: [{ id: id('action'), label: '查看预测假设', kind: 'followup', prompt: '解释量价预测的关键假设、不确定性和需要补充的数据', target: actionTarget }], evidence: [{ id: id('evidence'), label: '预测模型', detail: `${forecastDataset.context.product} · ${forecastDataset.context.country} · ${forecastDataset.meta.modelVersion}`, source: forecastDataset.meta.source }] };
  return { cards: [table], citations: [{ id: id('citation'), kind: 'calculation', label: '量价预测确定性模型', detail: `${forecastDataset.meta.modelVersion} · 参考价 ${forecastDataset.params.referencePrice} · 弹性 ${elasticity.toFixed(2)}` }], steps: [step('catalog.resolve', '读取预测口径', `${forecastDataset.context.product} · ${forecastDataset.context.country}`), step('series.query', '计算价格情景', `${rows.length} 个情景`), step('series.compare', '约束可售销量', '已应用每周可供量上限')], summary: requested ? `已基于${forecastDataset.meta.modelVersion}计算价格${requested[1]}%变动下的预测窗口需求与 SO；结果受每周可供量约束。` : `已基于${forecastDataset.meta.modelVersion}整理价格、理论需求和 SO 的预测窗口情景；结果用于方向性判断。` };
}

function signedUnits(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString()} 台`;
}

function forecastExplanationCards(
  target: { page: string; contextFingerprint: string },
  forecastDraft: ForecastDraftInput = BASELINE_DRAFT,
  forecastDataset: ForecastDataset = forecastFixture,
  forecastSnapshot?: ForecastSnapshot,
): { cards: AgentResultCard[]; citations: AgentResponse['citations']; steps: AgentStep[]; summary: string } {
  const snapshot = forecastSnapshot ?? createForecastSnapshot(forecastDataset, forecastDraft, target.contextFingerprint);
  const computation = snapshot.computation;
  const current = snapshot.current;
  const effectiveElasticity = snapshot.fit.application?.priceElasticity ?? forecastDataset.params.priceElasticity;
  const driverByKey = new Map(computation.drivers.map((driver) => [driver.key, driver]));
  const factors = snapshot.factors.map((profile) => {
    const driver = driverByKey.get(profile.key);
    return {
      key: profile.key,
      label: profile.label,
      role: profile.scope,
      window: profile.window,
      shape: profile.shape,
      status: profile.status,
      confidence: profile.confidence,
      evidence: profile.evidence,
      effect: driver ? signedUnits(driver.value) : '—',
    };
  });
  const actionTarget = { page: target.page, contextFingerprint: target.contextFingerprint, weekId: current.week, forecastDraft, forecastSnapshot: snapshot, forecastDataset };
  const card: AgentResultCard = {
    kind: 'forecast_explanation',
    id: id('forecast-explain'),
    title: '简单版预测：假设、证据与风险',
    contextFingerprint: target.contextFingerprint,
    fitWindow: `${snapshot.fit.fitWindow.start}–${snapshot.fit.fitWindow.end}（模拟历史段）`,
    sampleCount: snapshot.fit.sampleCount,
    scope: {
      country: forecastDataset.context.country,
      channel: forecastDataset.context.channel,
      product: forecastDataset.context.product,
      currency: forecastDataset.meta.currency,
      modelVersion: forecastDataset.meta.modelVersion,
    },
    dataStatus: snapshot.dataStatus,
    provenanceSummary: provenanceSummary(snapshot.provenance),
    fitStatus: snapshot.fit.status,
    fitAppliedToForecast: snapshot.fitAppliedToForecast,
    intervalCalibrated: Boolean(snapshot.computation.modelEvidence?.intervalCalibrated),
    current: {
      week: current.week,
      price: current.price,
      baseDemand: current.baseDemand,
      unconstrainedDemand: current.unconstrainedDemand,
      available: current.available,
      so: current.so,
      inventory: current.inventory,
      risk: computation.kpi.risk.label,
    },
    scenario: snapshot.scenario,
    factors,
    assumptions: [
      '无约束需求 = 基线 × 感知价格 × 促销 × 竞品压力；供给只作为 SO 上限。',
      `价格因子使用参考价 ${forecastDataset.params.referencePrice} 与当前弹性 ${effectiveElasticity.toFixed(2)}；fit 是否注入预测由快照安全门决定。`,
      `当前 fit 状态为${snapshot.fit.status === 'completed' ? '已完成' : '证据不足，回退先验'}；总体有效样本 ${snapshot.fit.sampleCount} 周，排除删失 ${snapshot.fit.excluded.censored}、混杂 ${snapshot.fit.excluded.confounded}、缺失 ${snapshot.fit.excluded.missing}。`,
      snapshot.competitorEvents.some((event) => event.marketEffect === 'unknown') ? '竞品上市的市场扩盘 / 分流状态仍待验证，当前只作为份额压力情景。' : '竞品事件已带有显式市场效应状态，仍需结合证据核对。',
      // 推演工作台界面能力口径（A4 同步，2026-11-04 评审修订：把握区间带下线，大盘月粒度调整上线）。
      '参照品联动：在推演工作台切换上一代参照后，基线按同周龄比值校正（选中参照 / 默认参照）；友商参照仅作对照，不进入主链。',
      '库存上限修正：SO = min(基线 SO, 可售)，修正结果回写主图；修正周以琥珀描边标注，截断事实独立保留，手调不覆盖。',
      '大盘月粒度：大盘工作台覆盖未来 4 个季度逐月预测，点击预测月就地调整（原因选填），调整季度经季内三月均值同步主链；人工事件三字段（起始时间/时长/幅度），月中起始按日均摊。',
      '复制关键假设：推演工作台可一键复制结构化关键假设文本（范围与模拟状态 → 模型版本 → 季度基线 → 行业事件 → 大盘月度事件与按月调整 → 上一代参照 → 产品事件 → SI → 手调原因 → 库存规则 → 结果摘要），供会议与评审直接引用。',
    ],
    boundaries: [
      `${forecastDataset.meta.status === 'simulated' ? '当前数据为模拟演示，不能当作真实销量、库存或利润事实。' : '当前数据状态已标记。'}`,
      `历史段为${forecastDataset.meta.status === 'simulated' ? '模拟输入' : '观测输入'}（${forecastDataset.weeks.filter((week) => week.status === 'actual').length} 周），不构成因果证明；${snapshot.computation.modelEvidence?.intervalCalibrated ? '预测区间已用留出残差校准，并受可供量上限截断。' : '结果为模型点估计，暂未校准预测区间。'}`,
      current.stockout ? `${current.week} 可供量低于无约束需求，SO 被供给截断；需核对真实配额与缺货状态。` : '当前周未出现供给截断，但仍需核对实际 SO 与可供量。',
    ],
    actions: [
      { id: id('action'), label: '查看计算路径', kind: 'open', prompt: '回到量价预测页查看计算路径', target: actionTarget },
      { id: id('action'), label: '继续做价格情景', kind: 'followup', prompt: '如果价格下调 5% 会怎样？', target: actionTarget },
    ],
    evidence: [
      { id: id('evidence'), label: '预测输入', detail: `${forecastDataset.context.country} · ${forecastDataset.context.channel} · ${forecastDataset.context.product} · ${forecastDataset.context.weekRange}`, source: forecastDataset.meta.source },
      { id: id('evidence'), label: '当前周计算', detail: `${current.week} · 基线 ${current.baseDemand.toLocaleString()} · 无约束需求 ${current.unconstrainedDemand.toLocaleString()} · SO ${current.so.toLocaleString()}`, source: forecastDataset.meta.modelVersion },
    ],
  };
  return {
    cards: [card],
    citations: [{ id: id('citation'), kind: 'calculation', label: '量价预测确定性模型', detail: `${forecastDataset.meta.modelVersion} · ${forecastDataset.meta.source} · ${forecastDataset.context.weekRange}` }],
    steps: [step('catalog.resolve', '读取预测口径', `${forecastDataset.context.product} · ${forecastDataset.context.country}`), step('series.query', '读取模型输入', `${forecastDataset.weeks.length} 周 · ${forecastDataset.meta.status}`), step('series.compare', '展开假设与风险', `${factors.length} 项考量 · 当前周 ${current.week}`)],
    summary: `当前简单版预测基于${forecastDataset.context.product}的${forecastDataset.meta.modelVersion}${forecastDataset.meta.status === 'simulated' ? '模拟' : '观测'}输入：${current.week} 无约束需求 ${current.unconstrainedDemand.toLocaleString()} 台，SO ${current.so.toLocaleString()} 台，主要风险为${computation.kpi.risk.label}。`,
  };
}

/** 给所有确定性结果卡补上生成时的作用域，避免卡片按钮在筛选变化后误操作。 */
function scopeCardActions(cards: AgentResultCard[], target: { page: string; contextFingerprint: string }): AgentResultCard[] {
  return cards.map((card) => {
    if (!card.actions?.length) return card;
    return {
      ...card,
      actions: card.actions.map((action) => action.target ? action : { ...action, target }),
    } as AgentResultCard;
  });
}

function alertSelectionOf(alert: AgentAlertRecord, state: FiltersState): ProductSelection | null {
  const seriesKey = alert.seriesKey ?? '';
  const separator = seriesKey.indexOf('__');
  if (separator < 0) return null;
  const modelId = seriesKey.slice(0, separator);
  const romram = seriesKey.slice(separator + 2);
  const product = dimProduct.find((row) => row.model_id === modelId && norm(row.romram) === norm(romram) && row.industry === state.industry && row.countries.includes(state.countryCode));
  if (!product) return null;
  const skuId = lowestPriceColorSku(modelId, product.romram, state.countryCode, state.currency) ?? product.sku_id;
  return { modelId, romram: product.romram, skuIds: skuId ? [skuId] : [] };
}

function alertFilterPatch(alert: AgentAlertRecord, state: FiltersState): FilterPatch {
  const selection = alertSelectionOf(alert, state);
  const patch: FilterPatch = {
    countryCode: state.countryCode,
    platform: state.platform,
    granularity: 'week',
    adaptive: false,
    rangeStart: alert.weekId,
    rangeEnd: alert.weekId,
  };
  if (selection) patch.mains = clampMains(buildCards([selection], { auto: true }));
  return patch;
}

function alertTarget(alert: AgentAlertRecord, state: FiltersState, page: 'alerts' | 'dashboard'): AgentActionTarget {
  const seriesKey = alert.seriesKey ?? '';
  const modelId = seriesKey.split('__')[0];
  return {
    page,
    contextFingerprint: alert.contextFingerprint ?? contextFingerprint(state, page),
    weekId: alert.weekId,
    modelId,
    seriesKey,
    alertId: alert.alertId,
    alertType: alert.type,
    alertSeriesKey: seriesKey,
    filterPatch: alertFilterPatch(alert, state),
  };
}

function alertCard(text: string, alerts: readonly AgentAlertRecord[], state: FiltersState, targetFingerprint?: string): { card: AgentResultCard | null; summary: string; steps: AgentStep[]; citations: AgentResponse['citations'] } {
  const records = alerts.slice(0, 8);
  const alert = records[0];
  if (!alert) {
    const card: AgentResultCard = {
      kind: 'table',
      id: id('alert-empty'),
      title: '价格预警 · 当前口径没有触发事件',
      columns: ['状态', '口径', '下一步'],
      rows: [['暂无预警', `${state.countryCode} · ${state.industry} · 当前预警订阅`, '可在预警中心添加监控产品']],
      note: '结果来自现有预警规则与当前订阅范围；没有触发事实时不编造事件。',
      evidence: [{ id: id('evidence'), label: '预警规则快照', detail: '当前订阅范围没有返回触发事件', source: '本地预警确定性引擎' }],
      actions: [{ id: id('action'), label: '打开预警中心', kind: 'open', prompt: '打开预警中心添加监控产品', target: { page: 'alerts', contextFingerprint: targetFingerprint ?? contextFingerprint(state, 'alerts') } }],
    };
    return { card, summary: '当前订阅范围没有可解释的预警事件；结果已按本地规则核对。', steps: [step('alerts.query', '查询预警', '当前口径没有预警', 'warning')], citations: [] };
  }
  const direction = alert.wowPct != null ? `${alert.wowPct < 0 ? '下降' : '上涨'} ${Math.abs(alert.wowPct * 100).toFixed(1)}%` : '已触发规则';
  const actionsFor = (item: AgentAlertRecord) => [
    { id: id('action'), label: '应用预警筛选', kind: 'apply' as const, target: alertTarget(item, state, 'dashboard') },
    { id: id('action'), label: '回看板定位', kind: 'open' as const, prompt: '把这条预警定位回对应产品、渠道和国家的看板', target: alertTarget(item, state, 'dashboard') },
    { id: id('action'), label: '预警中心详情', kind: 'open' as const, prompt: '打开这条预警的证据与处理状态', target: alertTarget(item, state, 'alerts') },
  ];
  const card: AgentResultCard = {
    kind: 'alert',
    id: id('alert'),
    title: `价格预警 · ${records.length} 条最新事件`,
    alert: { ...alert, evidence: alert.evidence ?? [], actions: actionsFor(alert) },
    alerts: records,
    facts: [`${alert.weekLabel}（${alert.weekId}）触发${alert.type}规则`, `折后价${direction}`, alert.gapPct != null ? `平台价差为 ${(alert.gapPct * 100).toFixed(1)}%` : '当前事件没有平台价差字段'],
    checks: ['核对促销记录与商品页面快照', '对比其他平台是否同步变化', '确认是否为单平台的短期变化'],
    evidence: alert.evidence?.length ? alert.evidence : [{ id: id('evidence'), label: '预警事件', detail: `${alert.brand} ${alert.modelName} · ${alert.weekId}`, source: '预警中心事件流' }],
  };
  // Keep each row independently actionable; the first record remains on the
  // legacy `alert` field for consumers that only understand one alert.
  (card as Extract<AgentResultCard, { kind: 'alert' }>).alerts = records.map((item) => ({ ...item, evidence: item.evidence ?? [], actions: actionsFor(item) }));
  return { card, summary: `已读取当前口径下 ${records.length} 条真实预警；每条都可展开证据、应用筛选或回看板定位。当前结果不推断唯一因果。`, steps: [step('catalog.resolve', '解析意图', '价格预警 · 当前国家、渠道与时间口径'), step('alerts.query', '读取预警', `${records.length} 条最新事件`), step('alerts.explain', '核对规则与证据', '已读取当前规则、触发值和来源'), step('alerts.explain', '生成结论', '保留事实、证据和下一步动作')], citations: [{ id: id('citation'), kind: 'alert', label: '预警事件', detail: records.map((item) => item.key).join('；') }] };
}

export async function runAgent(
  text: string,
  context: AgentContextSnapshot,
  signal?: AbortSignal,
  forcedIntent?: AgentIntent,
  forecastDraft?: ForecastDraftInput,
  forecastSnapshot?: ForecastContextInput['forecastSnapshot'],
  forecastDataset?: ForecastContextInput['forecastDataset'],
): Promise<AgentResponse> {
  const classifiedIntent = forcedIntent ?? classifyIntent(text);
  const entities = resolveAgentEntities(text, context.state);
  const clarificationReason = classifiedIntent === 'query' ? clarificationReasonForQuery(text, context.state, entities) : null;
  const intent: AgentIntent = clarificationReason ? 'clarify' : classifiedIntent;
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => { cleanup(); resolve(); }, 120);
    const onAbort = () => { cleanup(); reject(new DOMException('已取消', 'AbortError')); };
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
  const cards: AgentResultCard[] = [];
  let summary = '';
  let steps: AgentStep[] = [];
  let citations: AgentResponse['citations'] = [];
  if (intent === 'filter') {
    const card = buildFilterCard(text, context.state);
    if (card) cards.push(card);
    summary = card ? '我先生成筛选预览，当前看板尚未改变。确认后才会应用。' : '我没有识别到明确的筛选变化，可以补充国家、时间、币种或 RRP 条件。';
    steps = [step('catalog.resolve', '解析筛选条件', card ? `${card.changes.length} 项待变更` : '需要补充口径', card ? 'success' : 'warning'), ...(card ? [step('view.preview', '生成筛选预览', '等待用户确认')] : [])];
  } else if (intent === 'alert') {
    const result = alertCard(text, context.alerts, context.state, context.fingerprint);
    if (result.card) cards.push(result.card);
    summary = result.summary; steps = result.steps; citations = result.citations;
  } else if (intent === 'forecast_explain') {
    const result = forecastExplanationCards({ page: 'forecast', contextFingerprint: context.fingerprint }, forecastDraft, forecastDataset, forecastSnapshot);
    cards.push(...result.cards); summary = result.summary; steps = result.steps; citations = result.citations;
  } else if (intent === 'query') {
    if (/价格优势|优势|领先|落后/.test(text)) {
      const result = buildPriceAdvantageResult(stateForPriceAdvantage(context.state, entities), context.fingerprint);
      if (result) {
        cards.push(result.card);
        summary = result.summary;
        steps = result.steps;
        citations = result.citations;
      } else {
        summary = '当前范围没有可用于价格优势比较的产品事实。';
        steps = [step('catalog.resolve', '解析意图', '价格优势', 'success'), step('series.query', '读取价格', '没有可用产品事实', 'warning'), step('series.compare', '计算优势', '缺少我司与竞品的共同价格点', 'warning'), step('view.preview', '生成结论', '无法计算', 'warning')];
      }
    } else {
      const result = /量价预测|价格下调|价格上调|调整\s*\d+(?:\.\d+)?\s*%|预测情景/.test(text) ? forecastCards(text, { page: 'forecast', contextFingerprint: context.fingerprint }, forecastDraft, forecastDataset, forecastSnapshot) : queryCards(context.state, text, entities);
      cards.push(...result.cards); summary = result.summary; steps = result.steps; citations = result.citations;
    }
  } else {
    summary = clarificationReason === '产品'
      ? '我可以继续查，但需要先确认产品。请选择一个主品或竞品，或直接告诉我型号；这样“最便宜/趋势/平台价差”才有明确对象。'
      : clarificationReason === '时间范围'
        ? '我可以继续查，但需要先确认时间范围。请指定最近几周/几个月，或直接说最新有价周。'
        : '你可以让我查询价格走势、比较平台价差、解释预警，或先生成筛选预览。';
    steps = [step('catalog.resolve', '识别问题', clarificationReason ? `需要补充${clarificationReason}` : '需要选择一个分析方向', 'warning')];
  }
  return {
    intent,
    summary,
    steps,
    cards: scopeCardActions(cards, { page: context.page, contextFingerprint: context.fingerprint }),
    citations,
    suggestions: CORE_SUGGESTIONS,
    contextFingerprint: context.fingerprint,
    provenance: context.provenance ?? {
      source: 'local-deterministic',
      dataVersion: context.dataVersion,
      ruleVersion: context.ruleVersion,
      contextFingerprint: context.fingerprint,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function buildAgentContext(page: string, state: FiltersState, alerts: readonly AgentAlertRecord[]): AgentContextSnapshot {
  const pageLabel: Record<string, string> = {
    overview: '国家总览',
    dashboard: '价格走势',
    volume: '量价走势',
    marketboard: '大盘走势',
    pricing: '定价推演',
    intelligence: '情报中心',
    forecast: '量价预测',
    alerts: '预警中心',
    config: '配置',
  };
  const fingerprint = contextFingerprint(state, page);
  return {
    page,
    pageLabel: pageLabel[page] ?? page,
    state,
    alerts,
    createdAt: new Date().toISOString(),
    fingerprint,
    // 数据版本由真实数据接入时替换为 manifest.version；在本地演示中保持可审计常量。
    dataVersion: 'local-data-v1',
    ruleVersion: 'price-rules-v1',
    provenance: {
      source: 'pricelens-context',
      dataVersion: 'local-data-v1',
      ruleVersion: 'price-rules-v1',
      contextFingerprint: fingerprint,
    },
  };
}
