import { buildSeries } from '../dataModel/aggregate';
import { dimProduct, dimRegion, dimTime } from '../data';
import { autoComparesFor, buildCards, clampMains, remapSelectionForCountry, withAutoOn } from '../state/mainSelection';
import type { FiltersState, MainProduct, ProductSelection } from '../state/filtersTypes';
import type { AgentCitation, AgentResponse, AgentStep, FilterPatch, PriceAdvantageResultCard, PriceAdvantageRow } from './contracts';

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
  return buildCards(selections, { auto: true, countryCode: state.countryCode });
}

function effectiveOwnCards(state: FiltersState): MainProduct[] {
  const own = state.mains.filter((card) => card.main && isOwn(card.main));
  if (!own.length) return defaultOwnCards(state);
  return own.map((card) => {
    if (!card.main) return card;
    if (card.compares.length || card.auto) return card;
    return withAutoOn(card, state.countryCode);
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

/**
 * R5：跨国自然语言查询（如在 AE 页问「RU 价格优势」）时按请求国计算。
 * R4（M2，同步稳定线四审）：我司主品跨国先按统一 remapSelectionForCountry 保
 * 原型号重映射到目标国合法配置（RU Mate X6 12+512 → ID Mate X6 16+512），不能
 * 精确 romram 过滤后丢型号、让引擎落到目标国默认主品（Mate 80 Pro）；目标国
 * 整体缺型号（型号全部缺席）才清空 mains 安全回落该国默认主品，且结果必须
 * 明确说明（priceAdvantageCountryFallbackNote）。
 */
export function stateForPriceAdvantageCountry(state: FiltersState, countryCode: string): FiltersState {
  if (countryCode === state.countryCode) return state;
  const ownMains = (state.mains ?? []).flatMap((card) => (card.main && isOwn(card.main) ? [card.main] : []));
  if (!ownMains.length) return { ...state, countryCode, mains: [] };
  const remapped = ownMains
    .map((selection) => remapSelectionForCountry(selection, countryCode, state.industry))
    .filter((selection): selection is ProductSelection => selection != null);
  return { ...state, countryCode, mains: remapped.length ? buildCards(remapped, { auto: true, countryCode }) : [] };
}

/** R4（M2）：跨国请求的我司主品全部不在目标国在架（型号整体缺席）时的显式
 *  说明——回落目标国默认主品属于安全默认，必须在结果里说清楚，不冒充用户
 *  原产品。仅在确有我司主品且重映射全空时给出；同国 / 正常重映射返回 null。 */
export function priceAdvantageCountryFallbackNote(state: FiltersState, countryCode: string): string | null {
  if (countryCode === state.countryCode) return null;
  const ownMains = (state.mains ?? []).flatMap((card) => (card.main && isOwn(card.main) ? [card.main] : []));
  if (!ownMains.length) return null;
  const anyRemapped = ownMains.some((selection) => remapSelectionForCountry(selection, countryCode, state.industry) != null);
  if (anyRemapped) return null;
  const labels = [...new Set(ownMains.map((selection) => modelLabel(selection).modelName))];
  const targetName = dimRegion.find((region) => region.country_code === countryCode)?.country_name ?? countryCode;
  return `请求的我司主品（${labels.join('、')}）在${targetName}均无在架型号，已回落到${targetName}默认主品口径。`;
}

export interface PriceAdvantageResult {
  card: PriceAdvantageResultCard;
  summary: string;
  steps: AgentStep[];
  citations: AgentCitation[];
}

/** 按行目标国重建主品卡：自动竞品矩阵跟随国家，并确保该行竞品在对比区内
 *  （AgentPanel AdvantageCard.focusCards 的模型侧同款，供回看/跳 GTM 共用）。 */
function focusCardsOfRow(row: PriceAdvantageRow): MainProduct[] {
  const autoCards = buildCards([row.ownSelection], { auto: true, countryCode: row.countryCode });
  const first = autoCards[0];
  const keepsTarget = first?.compares.some((item) => item.modelId === row.compareSelection.modelId && item.romram.replace(/\s+/g, '') === row.compareSelection.romram.replace(/\s+/g, ''));
  return keepsTarget ? autoCards : clampMains(autoCards.map((item) => ({ ...item, compares: [...item.compares, row.compareSelection].slice(0, 3) })));
}

/** R2（本轮返修 m2 + M2，同步稳定线 7edadc6）：结果卡「回看价格走势 / 跳 GTM
 *  情报」共用的 scopePatch——目标 countryCode、完整主品/SKU 口径（显式 mains）、
 *  平台口径与实际参与对比的周范围。粒度与范围桶必须同形：有对比行时按实际
 *  参与对比的周（rows 已按周倒序）给真实周桶 + 周粒度；空结果回退原状态口径时
 *  保持原粒度与原桶（季粒度 2025Q1–2025Q2 的空卡回看不得变成 week + 2025Q1
 *  的错配）。空结果不带 mains——跨国回看由目标国快照 / 默认卡安全落地。 */
export function advantageScopePatch(state: FiltersState, rows: PriceAdvantageRow[]): FilterPatch {
  const earliest = rows[rows.length - 1];
  const latest = rows[0];
  if (!rows.length || !earliest || !latest) {
    return {
      countryCode: state.countryCode,
      platform: state.platform,
      adaptive: false,
      granularity: state.granularity,
      rangeStart: state.rangeStart,
      rangeEnd: state.rangeEnd,
    };
  }
  return {
    countryCode: latest.countryCode,
    platform: state.platform,
    adaptive: false,
    granularity: 'week',
    rangeStart: earliest.weekId,
    rangeEnd: latest.weekId,
    mains: focusCardsOfRow(latest),
  };
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
    const competitors = card.compares.length ? card.compares : autoComparesFor(card, state.countryCode);
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
