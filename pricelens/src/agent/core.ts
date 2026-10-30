import { buildSeries, platformPriceSpread } from '../dataModel/aggregate';
import { dimProduct, dimTime } from '../data';
import { flatSelections } from '../state/mainSelection';
import type { FiltersState, ProductSelection } from '../state/filtersTypes';
import type { SeriesQuery } from '../dataModel/types';
import type { AgentAlertRecord, AgentContextSnapshot, AgentIntent, AgentResponse, AgentResultCard, AgentStep, FilterPatch, FilterResultCard } from './contracts';
import { contextFingerprint } from './contracts';

const id = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

function step(tool: AgentStep['tool'], label: string, detail: string, status: AgentStep['status'] = 'success'): AgentStep {
  return { id: id('step'), tool, label, detail, status, durationMs: 18 };
}

export function classifyIntent(text: string): AgentIntent {
  if (/预警|异常|阈值|触发原因|为什么.*变/.test(text)) return 'alert';
  if (/只看|切换|显示|带上|去掉|最近\s*\d+\s*(周|月)|usd|美元|本币|rrp|划线价/i.test(text)) return 'filter';
  if (/最低|最便宜|价差|趋势|价格|平台|多少|均值|变化/.test(text)) return 'query';
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
  return patch;
}

function formatPatchValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'boolean') return value ? '开' : '关';
  if (typeof value === 'object' && value !== null && 'rrp' in value) return (value as { rrp: boolean }).rrp ? '折后价 + RRP' : '仅折后价';
  return String(value);
}

export function buildFilterCard(text: string, state: FiltersState): FilterResultCard | null {
  const patch = buildFilterPatch(text, state);
  if (!Object.keys(patch).length) return null;
  const changes: Array<{ label: string; before: string; after: string }> = [];
  for (const key of Object.keys(patch) as Array<keyof FilterPatch>) {
    const before = formatPatchValue(state[key]);
    const after = formatPatchValue(patch[key]);
    if (before !== after) changes.push({ label: key === 'priceTypes' ? '价格类型' : key === 'rangeStart' ? '时间起点' : key === 'rangeEnd' ? '时间终点' : key === 'adaptive' ? '自动时间范围' : key === 'currency' ? '币种' : key, before, after });
  }
  return { kind: 'filter', id: id('filter'), title: '筛选预览（尚未应用）', patch, changes };
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

function queryCards(state: FiltersState, text: string): { cards: AgentResultCard[]; citations: AgentResponse['citations']; steps: AgentStep[]; summary: string } {
  const query = seriesQueryOf(state);
  if (!query) return { cards: [], citations: [], steps: [step('catalog.resolve', '解析当前产品', '当前页面还没有可查询的产品', 'warning')], summary: '当前看板还没有选中的产品，请先选择一个主品或竞品。' };
  try {
    const series = buildSeries(query);
    const chart = {
      kind: 'chart' as const,
      id: id('chart'),
      title: /最低|最便宜|平台/.test(text) ? '当前口径价格走势' : '价格走势摘要',
      series: series.slice(0, 6).map((s) => ({ label: s.label, color: s.color, values: s.points.slice(-8).map((p) => ({ bucket: p.xLabel, value: p.price })) })),
      note: `${state.currency === 'usd' ? 'USD' : '本币'} · ${state.granularity} · ${state.rangeStart}–${state.rangeEnd}；数值来自统一价格聚合引擎。`,
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
      const first = selections(state)[0];
      const latestWeek = dimTime[dimTime.length - 1]?.week_id ?? state.rangeEnd;
      const spread = first ? platformPriceSpread(first.skuIds[0], latestWeek, state.countryCode, state.currency) : [];
      const lowest = spread[0]?.price ?? null;
      table = { kind: 'table', id: id('table'), title: '最新有价周平台比较', columns: ['平台', '最低价', '相对最低价'], rows: spread.slice(0, 8).map((item) => [item.platform, item.price.toLocaleString(), lowest == null || lowest === 0 ? '—' : item.price === lowest ? '最低' : `+${(((item.price - lowest) / lowest) * 100).toFixed(1)}%`]), note: spread.length ? `按 ${latestWeek} 的平台最低在架价排序；当前最便宜平台为 ${spread[0].platform}。` : '当前产品在最新有价周没有可比较的平台数据。' };
    } else {
      table = { kind: 'table', id: id('table'), title: '最新价格摘要', columns: ['产品', '最新价', '环比', '取价口径'], rows, note: '少于两个有效点时不计算环比；结果可回到看板继续下钻。' };
    }
    return { cards: [chart, table], citations: [{ id: id('citation'), kind: 'calculation', label: '统一价格聚合引擎', detail: `${series.length} 条系列 · ${state.rangeStart}–${state.rangeEnd}` }], steps: [step('catalog.resolve', '解析产品与口径', `${query.groups.length} 个产品组`), step('series.query', '查询价格序列', `${series.length} 条系列`), step('series.compare', '计算变化', '已完成确定性计算')], summary: rows.length ? `已按当前页面口径整理 ${rows.length} 个产品的价格结果。` : '当前范围没有足够的价格数据。' };
  } catch {
    return { cards: [], citations: [], steps: [step('series.query', '查询价格序列', '价格引擎返回异常', 'failed')], summary: '价格数据暂时无法读取，请刷新后重试。' };
  }
}

function alertCard(text: string, alerts: readonly AgentAlertRecord[]): { card: AgentResultCard | null; summary: string; steps: AgentStep[]; citations: AgentResponse['citations'] } {
  const alert = alerts[0];
  if (!alert) return { card: null, summary: '当前页面没有可解释的预警事件。', steps: [step('alerts.query', '查询预警', '当前口径没有预警', 'warning')], citations: [] };
  const direction = alert.wowPct != null ? `${alert.wowPct < 0 ? '下降' : '上涨'} ${Math.abs(alert.wowPct * 100).toFixed(1)}%` : '已触发规则';
  const card: AgentResultCard = { kind: 'alert', id: id('alert'), title: `${alert.modelName} 的最新预警`, alert, facts: [`${alert.weekLabel}（${alert.weekId}）触发${alert.type}规则`, `折后价${direction}`, alert.gapPct != null ? `平台价差为 ${(alert.gapPct * 100).toFixed(1)}%` : '当前事件没有平台价差字段'], checks: ['核对促销记录与商品页面快照', '对比其他平台是否同步变化', '确认是否为单平台的短期变化'] };
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
    const result = queryCards(context.state, text);
    cards.push(...result.cards); summary = result.summary; steps = result.steps; citations = result.citations;
  } else {
    summary = '你可以让我查询价格走势、比较平台价差、解释预警，或先生成筛选预览。';
    steps = [step('catalog.resolve', '识别问题', '需要选择一个分析方向', 'warning')];
  }
  return { intent, summary, steps, cards, citations, suggestions: intent === 'filter' ? ['只看最近 8 周', '解释当前产品预警'] : ['最近有价周哪个平台最便宜？', '解释当前产品的最新预警', '只看最近 8 周并显示 RRP'], contextFingerprint: context.fingerprint };
}

export function buildAgentContext(page: string, state: FiltersState, alerts: readonly AgentAlertRecord[]): AgentContextSnapshot {
  return { page, state, alerts, createdAt: new Date().toISOString(), fingerprint: contextFingerprint(state, page) };
}
