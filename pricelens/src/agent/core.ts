import { buildSeries, lowestPriceColorSku, platformPriceSpread } from '../dataModel/aggregate';
import { dimProduct, dimRegion, dimTime } from '../data';
import { flatSelections } from '../state/mainSelection';
import type { FiltersState, MainProduct, ProductSelection } from '../state/filtersTypes';
import type { SeriesQuery } from '../dataModel/types';
import type { AgentAlertRecord, AgentContextSnapshot, AgentIntent, AgentResponse, AgentResultCard, AgentStep, FilterPatch, FilterResultCard } from './contracts';
import { contextFingerprint } from './contracts';

const id = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase();
const compact = (s: string): string => s.toLocaleLowerCase().replace(/[\s_\-]+/g, '').replace(/[’']/g, '');

const COUNTRY_ALIASES: Record<string, string> = {
  巴西: 'BR', 中国: 'CN', 俄罗斯: 'RU', 俄国: 'RU', 美国: 'US', 英国: 'GB',
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
  if (/只看|切换|显示|带上|去掉|最近\s*\d+\s*(周|月)|usd|美元|本币|rrp|划线价/i.test(text)) return 'filter';
  if (/最低|最便宜|价差|趋势|价格|平台|多少|均值|变化|情报|预测|销量|需求|供给|库存|汇率|大盘/.test(text)) return 'query';
  if (knownEntityInText(text) && /看|查|查询|了解|情况|表现|分析|走势/.test(text)) return 'query';
  return 'clarify';
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
    patch.mains = entities.selections.map((selection, index): MainProduct => ({ id: `agent-filter-${index}`, main: selection, compares: [] }));
  }
  return patch;
}

function formatPatchValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'boolean') return value ? '开' : '关';
  if (typeof value === 'object' && value !== null && 'rrp' in value) return (value as { rrp: boolean }).rrp ? '折后价 + RRP' : '仅折后价';
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
  return { kind: 'filter', id: id('filter'), title: '筛选预览（尚未应用）', prompt: text, patch, changes };
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

function stateForEntityQuery(state: FiltersState, entities: AgentEntityResolution): FiltersState {
  let targetSelections = entities.selections;
  if (!entities.explicitProduct && entities.explicitCountry) {
    targetSelections = selections(state).filter((selection) => dimProduct.some((row) => row.model_id === selection.modelId && norm(row.romram) === norm(selection.romram) && row.countries.includes(entities.countryCode)));
  }
  if (!entities.explicitCountry && !entities.explicitProduct) return state;
  const mains: MainProduct[] = targetSelections.map((selection, index) => ({ id: `agent-query-${index}`, main: selection, compares: [] }));
  return { ...state, countryCode: entities.countryCode, mains };
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
  const queryState = stateForEntityQuery(state, entities);
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
      const latestWeek = dimTime[dimTime.length - 1]?.week_id ?? queryState.rangeEnd;
      const spread = first ? platformPriceSpread(first.skuIds[0], latestWeek, queryState.countryCode, queryState.currency) : [];
      const lowest = spread[0]?.price ?? null;
      table = { kind: 'table', id: id('table'), title: '最新有价周平台比较', columns: ['平台', '最低价', '相对最低价'], rows: spread.slice(0, 8).map((item) => [item.platform, item.price.toLocaleString(), lowest == null || lowest === 0 ? '—' : item.price === lowest ? '最低' : `+${(((item.price - lowest) / lowest) * 100).toFixed(1)}%`]), note: spread.length ? `按 ${latestWeek} 的平台最低在架价排序；当前最便宜平台为 ${spread[0].platform}。` : '当前产品在最新有价周没有可比较的平台数据。' };
    } else {
      table = { kind: 'table', id: id('table'), title: '最新价格摘要', columns: ['产品', '最新价', '环比', '取价口径'], rows, note: '少于两个有效点时不计算环比；结果可回到看板继续下钻。' };
    }
    return { cards: [chart, table], citations: [{ id: id('citation'), kind: 'calculation', label: '统一价格聚合引擎', detail: `${series.length} 条系列 · ${queryState.countryCode} · ${queryState.rangeStart}–${queryState.rangeEnd}` }], steps: [step('catalog.resolve', '解析产品与口径', `${query.groups.length} 个产品组`), step('series.query', '查询价格序列', `${series.length} 条系列`), step('series.compare', '计算变化', '已完成确定性计算')], summary: rows.length ? `已按${scopeLabel}整理 ${rows.length} 个产品的价格结果。` : '当前范围没有足够的价格数据。' };
  } catch {
    return { cards: [], citations: [], steps: [step('series.query', '查询价格序列', '价格引擎返回异常', 'failed')], summary: '价格数据暂时无法读取，请刷新后重试。' };
  }
}

function forecastCards(text: string): { cards: AgentResultCard[]; citations: AgentResponse['citations']; steps: AgentStep[]; summary: string } {
  const basePrice = 499;
  const baseDemand = 4600;
  const elasticity = -1.85;
  const supplyCap = 7200;
  const requested = text.match(/(?:下调|上调|调整)\s*(\d+(?:\.\d+)?)\s*%/);
  const offsets = requested ? [-(Number(requested[1]) || 5), 0, Number(requested[1]) || 5] : [-10, -5, 0, 5, 10];
  const rows = offsets.map((offset) => {
    const price = Math.round(basePrice * (1 + offset / 100));
    const demand = Math.max(0, Math.round(baseDemand * Math.pow(Math.max(0.2, price / basePrice), elasticity)));
    const supply = Math.min(demand, supplyCap);
    return [`${offset > 0 ? '+' : ''}${offset}%`, price.toLocaleString(), demand.toLocaleString(), supply.toLocaleString()];
  });
  const table: AgentResultCard = { kind: 'table', id: id('forecast'), title: '量价预测情景', columns: ['价格变化', '价格', '理论需求', '可售基准'], rows, note: '演示模型：基准需求 4,600 台，价格弹性 −1.85，供给上限 7,200 台。结果用于方向性判断。' };
  return { cards: [table], citations: [{ id: id('citation'), kind: 'calculation', label: '量价预测演示模型', detail: '基准价格 499 · 弹性 −1.85 · 供给上限 7,200' }], steps: [step('catalog.resolve', '读取预测口径', 'Pura 90s Pro 演示参数'), step('series.query', '计算价格情景', `${rows.length} 个情景`), step('series.compare', '约束可售销量', '已应用供给上限')], summary: requested ? `已计算价格${requested[1]}%变动下的需求情景，结果受供给上限约束。` : '已整理价格、理论需求和可售销量的量价情景，结果用于方向性判断。' };
}

function alertCard(text: string, alerts: readonly AgentAlertRecord[]): { card: AgentResultCard | null; summary: string; steps: AgentStep[]; citations: AgentResponse['citations'] } {
  const alert = alerts[0];
  if (!alert) return { card: null, summary: '当前页面没有可解释的预警事件。', steps: [step('alerts.query', '查询预警', '当前口径没有预警', 'warning')], citations: [] };
  const direction = alert.wowPct != null ? `${alert.wowPct < 0 ? '下降' : '上涨'} ${Math.abs(alert.wowPct * 100).toFixed(1)}%` : '已触发规则';
  const card: AgentResultCard = { kind: 'alert', id: id('alert'), title: `${alert.modelName} 的最新预警`, alert, facts: [`${alert.weekLabel}（${alert.weekId}）触发${alert.type}规则`, `折后价${direction}`, alert.gapPct != null ? `平台价差为 ${(alert.gapPct * 100).toFixed(1)}%` : '当前事件没有平台价差字段'], checks: ['核对促销记录与商品页面快照', '对比其他平台是否同步变化', '确认是否为单平台的短期变化'], evidence: [{ label: '预警事件', detail: `${alert.brand} ${alert.modelName} · ${alert.weekId}` }, { label: '规则输入', detail: alert.gapPct != null ? `平台价差 ${(alert.gapPct * 100).toFixed(1)}%` : `周度变化 ${alert.wowPct == null ? '—' : `${(alert.wowPct * 100).toFixed(1)}%`}` }] };
  return { card, summary: '我把触发事实、前后变化和建议核查项分开列出；当前结果不推断唯一因果。', steps: [step('alerts.query', '读取预警事件', alert.weekLabel), step('alerts.explain', '解释触发原因', '已读取当前规则与输入值')], citations: [{ id: id('citation'), kind: 'alert', label: '预警事件', detail: alert.key }] };
}

export async function runAgent(text: string, context: AgentContextSnapshot, signal?: AbortSignal): Promise<AgentResponse> {
  const intent = classifyIntent(text);
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, 120);
    signal?.addEventListener('abort', () => { globalThis.clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); }, { once: true });
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
    const result = alertCard(text, context.alerts);
    if (result.card) cards.push(result.card);
    summary = result.summary; steps = result.steps; citations = result.citations;
  } else if (intent === 'query') {
    const result = /量价预测|价格下调|价格上调|调整\s*\d+(?:\.\d+)?\s*%|预测情景/.test(text) ? forecastCards(text) : queryCards(context.state, text);
    cards.push(...result.cards); summary = result.summary; steps = result.steps; citations = result.citations;
  } else {
    summary = '你可以让我查询价格走势、比较平台价差、解释预警，或先生成筛选预览。';
    steps = [step('catalog.resolve', '识别问题', '需要选择一个分析方向', 'warning')];
  }
  return { intent, summary, steps, cards, citations, suggestions: intent === 'filter' ? ['只看最近 8 周', '解释当前产品预警'] : ['最近有价周哪个平台最便宜？', '解释当前产品的最新预警', '只看最近 8 周并显示 RRP'], contextFingerprint: context.fingerprint };
}

export function buildAgentContext(page: string, state: FiltersState, alerts: readonly AgentAlertRecord[]): AgentContextSnapshot {
  const pageLabel: Record<string, string> = {
    dashboard: '价格走势',
    volume: '量价走势',
    pricing: '定价推演',
    intelligence: '情报中心',
    forecast: '量价预测',
    alerts: '预警中心',
    config: '配置',
  };
  return { page, pageLabel: pageLabel[page] ?? page, state, alerts, createdAt: new Date().toISOString(), fingerprint: contextFingerprint(state, page) };
}
