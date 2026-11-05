import { buildSeries } from '../dataModel/aggregate';
import { dimProduct, dimRegion, dimTime } from '../data';
import { autoComparesFor, buildCards, withAutoOn } from '../state/mainSelection';
import type { FiltersState, MainProduct, ProductSelection } from '../state/filtersTypes';
import type { AgentCitation, AgentResponse, AgentStep, PriceAdvantageResultCard, PriceAdvantageRow } from './contracts';

const compact = (value: string): string => value.replace(/\s+/g, '');
const id = (prefix: string, index: number): string => `${prefix}-${index.toString(36)}`;

function isOwn(selection: ProductSelection): boolean {
  return dimProduct.some((row) => row.model_id === selection.modelId && row.is_own);
}

function modelLabel(selection: ProductSelection): { modelName: string; skuId: string } {
  const row = dimProduct.find((item) => item.model_id === selection.modelId && compact(item.romram) === compact(selection.romram));
  return { modelName: row?.model_name ?? selection.modelId, skuId: selection.skuIds[0] ?? row?.sku_id ?? selection.modelId };
}

function weekRangeOf(state: FiltersState): { start: string; end: string } {
  const inRange = dimTime.filter((time) => {
    const bucket = state.granularity === 'month' ? time.month_id : state.granularity === 'quarter' ? time.quarter_id : time.week_id;
    return bucket >= state.rangeStart && bucket <= state.rangeEnd;
  });
  return { start: inRange[0]?.week_id ?? dimTime[0]?.week_id ?? state.rangeStart, end: inRange[inRange.length - 1]?.week_id ?? state.rangeEnd };
}

function defaultOwnCards(state: FiltersState): MainProduct[] {
  const defaultModel = dimRegion.find((region) => region.country_code === state.countryCode)?.default_own_models[state.industry];
  const rows = dimProduct.filter((row) => row.industry === state.industry && row.is_own && row.countries.includes(state.countryCode) && (!defaultModel || row.model_id === defaultModel));
  const fallback = rows.length ? rows : dimProduct.filter((row) => row.industry === state.industry && row.is_own && row.countries.includes(state.countryCode));
  const selections = [...new Map(fallback.map((row) => [compact(row.romram), { modelId: row.model_id, romram: row.romram, skuIds: [row.sku_id] }])).values()].slice(0, 2);
  return buildCards(selections, { auto: true });
}

function effectiveOwnCards(state: FiltersState): MainProduct[] {
  const own = state.mains.filter((card) => card.main && isOwn(card.main));
  if (!own.length) return defaultOwnCards(state);
  return own.map((card) => {
    if (!card.main) return card;
    if (card.compares.length || card.auto) return card;
    return withAutoOn(card);
  });
}

function productSeries(state: FiltersState, cards: MainProduct[]) {
  const groups = cards.flatMap((card) => {
    const selections = card.main ? [card.main, ...card.compares] : card.compares;
    return selections.map((selection) => ({
      modelId: selection.modelId,
      romram: selection.romram,
      skuIds: selection.skuIds,
      isOwn: isOwn(selection),
      platform: state.platform ? { platforms: state.platform.platforms, shopIds: state.platform.shopIds, seller: state.platform.seller } : null,
    }));
  });
  const unique = [...new Map(groups.map((group) => [`${group.modelId}__${compact(group.romram)}`, group])).values()];
  if (!unique.length) return [];
  const range = weekRangeOf(state);
  return buildSeries({
    scope: { countryCode: state.countryCode, industry: state.industry },
    groups: unique,
    granularity: 'week',
    startBucket: range.start,
    endBucket: range.end,
    currency: state.currency,
    agg: state.agg,
  });
}

function step(tool: AgentStep['tool'], label: string, detail: string, status: AgentStep['status'] = 'success'): AgentStep {
  return { id: id('step', Math.round(Math.random() * 1_000_000)), tool, label, detail, status, durationMs: 18 };
}

export interface PriceAdvantageResult {
  card: PriceAdvantageResultCard;
  summary: string;
  steps: AgentStep[];
  citations: AgentCitation[];
}

/**
 * Deterministic Huawei-versus-competitor comparison. The remote Agent never
 * participates in this calculation; all values come from the same weekly
 * series used by the dashboard.
 */
export function buildPriceAdvantageResult(state: FiltersState, contextFingerprint: string): PriceAdvantageResult {
  const cards = effectiveOwnCards(state);
  const series = productSeries(state, cards);
  const seriesByKey = new Map(series.map((item) => [item.key, item]));
  const rows: PriceAdvantageRow[] = [];
  const skuOptions = new Map<string, string>();
  let rowIndex = 0;
  for (const card of cards) {
    if (!card.main || !isOwn(card.main)) continue;
    const competitors = card.compares.length ? card.compares : autoComparesFor(card);
    const ownKey = `${card.main.modelId}__${compact(card.main.romram)}`;
    const ownSeries = seriesByKey.get(ownKey);
    if (!ownSeries) continue;
    const ownMeta = modelLabel(card.main);
    skuOptions.set(ownMeta.skuId, `${ownMeta.modelName} · ${card.main.romram}`);
    for (const competitor of competitors) {
      const competitorKey = `${competitor.modelId}__${compact(competitor.romram)}`;
      const competitorSeries = seriesByKey.get(competitorKey);
      if (!competitorSeries) continue;
      const ownByWeek = new Map(ownSeries.points.filter((point) => point.price != null && point.suspect !== 'quarantined').map((point) => [point.bucketId, point]));
      const competitorMeta = modelLabel(competitor);
      for (const competitorPoint of competitorSeries.points) {
        const ownPoint = ownByWeek.get(competitorPoint.bucketId);
        if (!ownPoint || ownPoint.price == null || competitorPoint.price == null || competitorPoint.suspect === 'quarantined') continue;
        const ownPrice = ownPoint.price;
        const competitorPrice = competitorPoint.price;
        const priceDiff = competitorPrice - ownPrice;
        const priceDiffPct = competitorPrice > 0 ? priceDiff / competitorPrice : 0;
        const relation = Math.abs(priceDiff) < 0.005 ? 'tie' : priceDiff > 0 ? 'advantage' : 'behind';
        rows.push({
          id: id('advantage', rowIndex++),
          countryCode: state.countryCode,
          weekId: competitorPoint.bucketId,
          weekLabel: competitorPoint.xLabel,
          channelLabel: ownPoint.channelName ?? ownPoint.platform ?? '自动渠道',
          platform: ownPoint.platform ?? null,
          currency: state.currency,
          own: { modelId: card.main.modelId, modelName: ownMeta.modelName, romram: card.main.romram, skuId: ownMeta.skuId, price: ownPrice },
          competitor: { modelId: competitor.modelId, modelName: competitorMeta.modelName, romram: competitor.romram, skuId: competitorMeta.skuId, price: competitorPrice },
          ownSelection: card.main,
          compareSelection: competitor,
          priceDiff,
          priceDiffPct,
          relation,
          contextFingerprint,
        });
      }
    }
  }
  rows.sort((a, b) => b.weekId.localeCompare(a.weekId) || a.own.modelName.localeCompare(b.own.modelName) || a.competitor.modelName.localeCompare(b.competitor.modelName));
  const limitedRows = rows.slice(0, 48);
  const advantageCount = rows.filter((row) => row.relation === 'advantage').length;
  const behindCount = rows.filter((row) => row.relation === 'behind').length;
  const card: PriceAdvantageResultCard = {
    kind: 'price_advantage',
    id: `price-advantage-${contextFingerprint}`,
    title: '价格优势 · 我司 vs 核心竞品',
    rows: limitedRows,
    skuOptions: [...skuOptions.entries()].map(([skuId, label]) => ({ skuId, label })),
    note: limitedRows.length
      ? `按国家 × 渠道 × 周对齐；价差 = 竞品价 − 我司价，百分比 = 价差 ÷ 竞品价。${advantageCount} 条我司占优，${behindCount} 条我司落后。`
      : '当前国家、渠道和时间范围没有可同时对齐的我司与竞品价格事实；缺采周未插值。',
    currency: state.currency,
    contextFingerprint,
    evidence: [{ id: 'advantage-source', label: '价格事实', detail: `${state.countryCode} · ${state.rangeStart}–${state.rangeEnd} · ${state.currency === 'usd' ? 'USD' : '本币'}`, source: '统一价格聚合引擎' }],
  };
  return {
    card,
    summary: limitedRows.length ? `已按本地确定性价格事实对齐 ${limitedRows.length} 条周度比较：我司占优 ${advantageCount} 条，落后 ${behindCount} 条。` : card.note,
    steps: [
      step('catalog.resolve', '解析意图', `${cards.length} 个我司主品 · ${state.countryCode}`),
      step('series.query', '读取价格事实', `${series.length} 条系列 · ${state.currency === 'usd' ? 'USD' : '本币'}`),
      step('series.compare', '计算价格优势', `${limitedRows.length} 条国家 × 渠道 × 周对比`),
      step('view.preview', '生成结论', '本地事实已锁定，远端叙述不可覆写'),
    ],
    citations: [{ id: 'advantage-calculation', kind: 'calculation', label: '价格优势计算', detail: '价差 = 竞品价 − 我司价；百分比 = 价差 ÷ 竞品价；缺采不插值' }],
  };
}
