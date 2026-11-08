import { buildSeries, defaultChannelOf, effectiveLinePlatform, platformScopeLabel, platformSelectionForCountry, pricedChannelIdsOfSelection } from '../dataModel/aggregate';
import { dimChannel, dimProduct, dimRegion, dimTime } from '../data';
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
      // R4（三审 M1）：每线口径经共享规则解析（每线显式 > 全局 state.platform >
      // 自动）——主品每线钉 OZON 3P 时优势 own 价同趋势 395，不再只读全局
      // 被混池 333 洗掉；竞品线同规则解析（有每线口径用每线，否则全局，再否则
      // 自动），同一次对比内不静默混两套来源。
      platform: effectiveLinePlatform(selection, state.platform),
    }));
  });
  const unique = [...new Map(groups.map((group) => [`${group.modelId}__${compact(group.romram)}`, group])).values()];
  if (!unique.length) return [];
  const range = state.granularity === 'week'
    ? weekRangeOf(state)
    : { start: state.rangeStart, end: state.rangeEnd };
  return buildSeries({
    scope: { countryCode: state.countryCode, industry: state.industry },
    groups: unique,
    granularity: state.granularity,
    startBucket: range.start,
    endBucket: range.end,
    currency: state.currency,
    agg: state.agg,
    financingTerm: state.financingTerm,
  });
}

function step(tool: AgentStep['tool'], label: string, detail: string, status: AgentStep['status'] = 'success'): AgentStep {
  return { id: id('step', Math.round(Math.random() * 1_000_000)), tool, label, detail, status, durationMs: 18 };
}

/** R3（M2 · 空优势透明说明）：结果行为空时区分「型号在目标国无在架」（那是
 *  priceAdvantageCountryFallbackNote 的安全回落场景）与「型号在架但当前渠道
 *  口径没有我司价格事实」——后者点名该型号在目标国确有真实价格的渠道（真实
 *  事实：FR Mate X6 12+512 仅 Amazon 3P 有 202638–202642 五条事实，默认
 *  Amazon 1P 无价）。只陈述事实：不把缺可对齐周误写成型号缺席，不造行，
 *  不用其他产品冒充比较对象。 */
function ownNoAlignedWeeksNote(
  state: FiltersState,
  cards: MainProduct[],
  seriesByKey: Map<string, { points: Array<{ price: number | null }> }>,
): string | null {
  const parts: string[] = [];
  for (const card of cards) {
    if (!card.main) continue;
    const series = seriesByKey.get(`${card.main.modelId}__${compact(card.main.romram)}`);
    if (!series || series.points.some((point) => point.price != null)) continue;
    const channels = pricedChannelIdsOfSelection(card.main, state.countryCode)
      .map((channelId) => dimChannel.find((c) => c.channel_id === channelId)?.display_name ?? channelId);
    if (!channels.length) continue;
    const countryName = dimRegion.find((region) => region.country_code === state.countryCode)?.country_name ?? state.countryCode;
    // R4（三审 M1）：说明里的口径 = 该线真实生效口径（每线显式 > 全局 > 自动），
    // 与计算同源——不把每线钉的店铺口径说成全局默认电渠。
    const scopeValues = (() => {
      const effective = effectiveLinePlatform(card.main, state.platform);
      return effective ? [...effective.platforms, ...effective.shopIds] : [];
    })();
    const scopeLabels = scopeValues.map((value) => dimChannel.find((c) => c.channel_id === value)?.display_name ?? value);
    const scopeLabel = scopeLabels.length ? scopeLabels.join('、') : `默认电渠（${dimChannel.find((c) => c.channel_id === defaultChannelOf(state.countryCode))?.display_name ?? '默认电渠'}）`;
    const meta = modelLabel(card.main);
    const line = `${meta.modelName} · ${card.main.romram} 在${countryName}当前渠道口径（${scopeLabel}）没有我司价格事实，仅在 ${channels.join('、')} 有真实在架价格`;
    if (!parts.includes(line)) parts.push(line);
  }
  if (!parts.length) return null;
  return `${parts.join('；')}；已保留请求型号按当前渠道口径计算，没有可对齐的我司与竞品价格周，未用其他产品冒充。`;
}

/**
 * R5：跨国自然语言查询（如在 AE 页问「RU 价格优势」）时按请求国计算。
 * R4（M2，同步稳定线四审）：我司主品跨国先按统一 remapSelectionForCountry 保
 * 原型号重映射到目标国合法配置（RU Mate X6 12+512 → ID Mate X6 16+512），不能
 * 精确 romram 过滤后丢型号、让引擎落到目标国默认主品（Mate 80 Pro）；目标国
 * 整体缺型号（型号全部缺席）才清空 mains 安全回落该国默认主品，且结果必须
 * 明确说明（priceAdvantageCountryFallbackNote）。
 * R5（M1，同步稳定线五审）：跨国时平台勾选同样经共享规则
 * platformSelectionForCountry 归一化到目标国可落地范围——源国平台（AE · NOON）
 * 在目标国（RU）不存在时，计算前就回落目标国默认电渠，而不是带着 NOON 过滤
 * 出 0 行、点回看才被 FiltersContext 清空；同国有效平台与 shopIds 原样保留。
 */
export function stateForPriceAdvantageCountry(state: FiltersState, countryCode: string): FiltersState {
  if (countryCode === state.countryCode) return state;
  const platform = platformSelectionForCountry(state.platform, countryCode);
  const ownMains = (state.mains ?? []).flatMap((card) => (card.main && isOwn(card.main) ? [card.main] : []));
  if (!ownMains.length) return { ...state, countryCode, platform, mains: [] };
  const remapped = ownMains
    .map((selection) => remapSelectionForCountry(selection, countryCode, state.industry))
    .filter((selection): selection is ProductSelection => selection != null);
  return { ...state, countryCode, platform, mains: remapped.length ? buildCards(remapped, { auto: true, countryCode }) : [] };
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

/** R5（M1，同步稳定线五审）：跨国平台归一化发生实际回退（不可落地部分被剔除或
 *  整体回落默认电渠）时的透明说明——只陈述事实：哪些勾选在目标国没有在架渠道、
 *  本次按什么口径计算，不冒称原平台在目标国有价格。完全可落地 / 未勾平台 =
 *  null（无回退事实，不产生说明）。
 *  R4（三审 r3-m1）：说明基于真实归一前/后/剔除子集生成——部分可落地时点名
 *  「剔除了什么、仅按保留的什么计算」，绝不把保留子集说成全部自动；渠道项用
 *  可读标签（渠道 id + 显示名），平台项保留源平台名。 */
export function platformCountryFallbackNote(platform: FiltersState['platform'], countryCode: string): string | null {
  if (!platform) return null;
  const normalized = platformSelectionForCountry(platform, countryCode);
  if (normalized === platform) return null;
  const raw = [...platform.platforms, ...platform.shopIds];
  if (!raw.length) return null;
  const targetName = dimRegion.find((region) => region.country_code === countryCode)?.country_name ?? countryCode;
  const rawLabel = raw.map(platformScopeLabel).join('、');
  if (!normalized) {
    return `平台口径 ${rawLabel} 在${targetName}没有在架渠道，本次已按${targetName}默认电渠口径计算；不代表其在${targetName}有价格。`;
  }
  const kept = [...normalized.platforms, ...normalized.shopIds];
  const dropped = raw.filter((value) => !kept.includes(value));
  const droppedLabel = dropped.map(platformScopeLabel).join('、');
  const keptLabel = kept.map(platformScopeLabel).join('、');
  return `平台口径已按${targetName}可落地范围归一：${droppedLabel} 在${targetName}没有在架渠道已剔除，本次仅按 ${keptLabel} 计算；不代表被剔除部分在${targetName}有价格。`;
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
 *  的错配）。空结果不带 mains——跨国回看由目标国快照 / 默认卡安全落地。
 *  R5（M1）：平台与计算同口径——按行所在国（空结果 = 原状态国）过共享规则
 *  platformSelectionForCountry 归一化，源国不可落地平台（AE · NOON → RU）落地
 *  即回落目标国默认电渠，不让 FiltersContext 事后清出与计算不一致的口径。 */
export function advantageScopePatch(state: FiltersState, rows: PriceAdvantageRow[]): FilterPatch {
  const earliest = rows[rows.length - 1];
  const latest = rows[0];
  if (!rows.length || !earliest || !latest) {
    return {
      countryCode: state.countryCode,
      platform: platformSelectionForCountry(state.platform, state.countryCode),
      adaptive: false,
      granularity: state.granularity,
      rangeStart: state.rangeStart,
      rangeEnd: state.rangeEnd,
    };
  }
  return {
    countryCode: latest.countryCode,
    platform: platformSelectionForCountry(state.platform, latest.countryCode),
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
  const noAlignedNote = limitedRows.length ? null : ownNoAlignedWeeksNote(state, cards, seriesByKey);
  const card: PriceAdvantageResultCard = {
    kind: 'price_advantage',
    id: `price-advantage-${contextFingerprint}`,
    title: '价格优势 · 我司 vs 核心竞品',
    rows: limitedRows,
    skuOptions: [...skuOptions.entries()].map(([skuId, label]) => ({ skuId, label })),
    note: limitedRows.length
      ? `按国家 × 渠道 × 周对齐；价差 = 竞品价 − 我司价，百分比 = 价差 ÷ 竞品价。${advantageCount} 条我司占优，${behindCount} 条我司落后。`
      : `${noAlignedNote ?? ''}当前国家、渠道和时间范围没有可同时对齐的我司与竞品价格事实；缺采周未插值。`,
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
