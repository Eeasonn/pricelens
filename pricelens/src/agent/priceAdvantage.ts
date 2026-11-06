import { buildSeries } from '../dataModel/aggregate';
import { dimChannel, dimProduct, dimTime } from '../data';
import { clampMains, flatSelections } from '../state/mainSelection';
import type { FiltersState, MainProduct, ProductSelection } from '../state/filtersTypes';
import type { Series, SeriesQuery } from '../dataModel/types';
import type { AgentActionTarget, AgentCardAction, AgentStep, FilterPatch, PriceAdvantageDirection, PriceAdvantageResultCard, PriceAdvantageRow, PriceAdvantageSkuOption } from './contracts';

export interface PriceAdvantageResult {
  card: PriceAdvantageResultCard;
  summary: string;
  steps: AgentStep[];
  citations: Array<{ id: string; kind: 'fact' | 'calculation'; label: string; detail: string }>;
}

// buildSeries keeps model ids case-sensitive and only removes whitespace from
// the configuration key. Preserve that exact key so local cards can be joined
// without silently dropping every competitor row.
const modelKey = (selection: ProductSelection): string => `${selection.modelId}__${selection.romram.replace(/\s+/g, '')}`;
const seriesKey = (series: Series, selection: ProductSelection): boolean => series.key === modelKey(selection);
const ownSelection = (selection: ProductSelection): boolean => selection.skuIds.some((skuId) => dimProduct.find((row) => row.sku_id === skuId)?.is_own === true);
const rowId = (own: ProductSelection, competitor: ProductSelection, weekId: string): string => `${own.modelId}:${own.romram}:${own.skuIds[0] ?? ''}::${competitor.modelId}:${competitor.romram}:${competitor.skuIds[0] ?? ''}::${weekId}`;

function stateGroups(state: FiltersState, platformOverride?: string | null): SeriesQuery | null {
  const { mainSels, compareSels } = flatSelections(state.mains);
  const selections = [...mainSels, ...compareSels];
  if (!selections.length) return null;
  return {
    scope: { countryCode: state.countryCode, industry: state.industry },
    groups: selections.map((selection) => ({
      modelId: selection.modelId,
      romram: selection.romram,
      skuIds: selection.skuIds,
      isOwn: ownSelection(selection),
      platform: platformOverride ? { platforms: [platformOverride], shopIds: [], seller: null } : selection.platform ? { platforms: selection.platform.platforms, shopIds: selection.platform.shopIds, seller: selection.platform.seller } : null,
    })),
    granularity: 'week',
    startBucket: state.rangeStart,
    endBucket: state.rangeEnd,
    currency: state.currency,
    agg: state.agg,
  };
}

function platformCandidates(state: FiltersState): Array<string | null> {
  const selected = state.platform;
  if (selected?.platforms?.length) return [...new Set(selected.platforms)];
  if (selected?.shopIds?.length) {
    const platforms = dimChannel.filter((channel) => selected.shopIds.includes(channel.channel_id)).map((channel) => channel.platform);
    if (platforms.length) return [...new Set(platforms)];
  }
  const platforms = dimChannel.filter((channel) => channel.country_code === state.countryCode).map((channel) => channel.platform);
  return platforms.length ? [...new Set(platforms)] : [null];
}

function bySelection(series: readonly Series[], selection: ProductSelection): Series | undefined {
  return series.find((item) => seriesKey(item, selection));
}

function weekLabelOf(weekId: string): string {
  return dimTime.find((time) => time.week_id === weekId)?.week_wed_date?.slice(5) ?? weekId;
}

function directionOf(gap: number): PriceAdvantageDirection {
  return gap > 0 ? 'advantage' : gap < 0 ? 'lagging' : 'parity';
}

/**
 * Build the price-advantage facts from the same local series engine used by
 * the dashboard. The remote adapter may narrate this card, but it cannot
 * author or replace these rows.
 */
export function calculatePriceAdvantage(state: FiltersState, contextFingerprint = ''): PriceAdvantageResultCard | null {
  const options: PriceAdvantageSkuOption[] = [];
  const seenOptions = new Set<string>();
  const rows: PriceAdvantageRow[] = [];
  for (const platform of platformCandidates(state)) {
    const query = stateGroups(state, platform);
    if (!query) continue;
    const series = buildSeries(query);
    for (const main of state.mains) {
      if (!main.main || !ownSelection(main.main)) continue;
      const own = bySelection(series, main.main);
      if (!own) continue;
      const ownSkuId = main.main.skuIds[0] ?? '';
      const optionKey = `${main.main.modelId}:${main.main.romram}:${ownSkuId}`;
      if (!seenOptions.has(optionKey)) {
        seenOptions.add(optionKey);
        const product = dimProduct.find((item) => item.sku_id === ownSkuId) ?? dimProduct.find((item) => item.model_id === main.main!.modelId);
        options.push({ skuId: ownSkuId, modelId: main.main.modelId, modelName: product?.model_name ?? main.main.modelId, romram: main.main.romram, label: `${product?.model_name ?? main.main.modelId} · ${main.main.romram}` });
      }
      for (const compare of main.compares) {
        const competitor = bySelection(series, compare);
        if (!competitor) continue;
        const competitorProduct = dimProduct.find((item) => item.sku_id === (compare.skuIds[0] ?? '')) ?? dimProduct.find((item) => item.model_id === compare.modelId);
        const ownProduct = dimProduct.find((item) => item.sku_id === ownSkuId) ?? dimProduct.find((item) => item.model_id === main.main!.modelId);
        const pointsByWeek = new Map(competitor.points.map((point) => [point.bucketId, point]));
        for (const ownPoint of own.points) {
          const competitorPoint = pointsByWeek.get(ownPoint.bucketId);
          if (!competitorPoint || ownPoint.price == null || competitorPoint.price == null) continue;
          if (ownPoint.suspect === 'quarantined' || competitorPoint.suspect === 'quarantined') continue;
          const gap = competitorPoint.price - ownPoint.price;
          rows.push({
            id: rowId(main.main, compare, `${platform ?? 'auto'}:${ownPoint.bucketId}`),
            countryCode: state.countryCode,
            channel: platform ?? ownPoint.platform ?? competitorPoint.platform ?? '自动渠道',
            weekId: ownPoint.bucketId,
            weekLabel: weekLabelOf(ownPoint.bucketId),
            ownModelId: main.main.modelId,
            ownModelName: ownProduct?.model_name ?? main.main.modelId,
            ownRomram: main.main.romram,
            ownSkuId,
            competitorModelId: compare.modelId,
            competitorModelName: competitorProduct?.model_name ?? compare.modelId,
            competitorBrand: competitorProduct?.brand ?? '竞品',
            competitorRomram: compare.romram,
            competitorSkuId: compare.skuIds[0] ?? '',
            ownPrice: ownPoint.price,
            competitorPrice: competitorPoint.price,
            gap,
            gapPct: competitorPoint.price === 0 ? null : gap / competitorPoint.price,
            direction: directionOf(gap),
            currency: state.currency,
            target: { modelId: main.main.modelId, romram: main.main.romram, skuIds: [...main.main.skuIds], weekId: ownPoint.bucketId, platform: platform ?? ownPoint.platform ?? competitorPoint.platform ?? null },
          });
        }
      }
    }
  }
  rows.sort((left, right) => right.weekId.localeCompare(left.weekId) || left.ownModelName.localeCompare(right.ownModelName) || left.competitorModelName.localeCompare(right.competitorModelName));
  const advantageCount = rows.filter((row) => row.direction === 'advantage').length;
  const laggingCount = rows.filter((row) => row.direction === 'lagging').length;
  const target: AgentActionTarget = { page: 'dashboard', contextFingerprint };
  // R5：跨国自然语言查询（如在 AE 页问 RU 价格优势）的跳页动作必须携带该卡
  // 计算时的请求国家/范围，回看时切到请求国家再打开对应页，而不是跳回旧国家。
  // 范围优先取实际参与对比的周（rows 已按周倒序），空结果回退计算口径。
  // 二轮返修：只带国家/范围不够——回看 patch 还必须携带计算该卡的完整主品/SKU
  // 口径（我司主卡的 SKU、对比区与 auto 标记；auto 卡对比区由 Filters 侧按目标
  // 国矩阵重算）与参与计算的平台口径，否则跨国 switchScope 会把主品重置成
  // 目标国第一默认主品，回看结果与卡脱节。
  const scopeMains: MainProduct[] = clampMains(state.mains
    .filter((card): card is MainProduct & { main: ProductSelection } => card.main != null && ownSelection(card.main))
    .map((card) => ({ ...card, main: { ...card.main }, compares: card.compares.map((compare) => ({ ...compare })) })));
  const scopePatch: FilterPatch = {
    countryCode: state.countryCode,
    granularity: 'week',
    adaptive: false,
    platform: state.platform,
    ...(scopeMains.length ? { mains: scopeMains } : {}),
    ...(rows.length
      ? { rangeStart: rows[rows.length - 1].weekId, rangeEnd: rows[0].weekId }
      : { rangeStart: state.rangeStart, rangeEnd: state.rangeEnd }),
  };
  const actions: AgentCardAction[] = [
    // 三个药丸动作都绑定真实能力：open=保留上下文跳页，evidence=卡内展开证据。
    { id: 'price-advantage-open', label: '回看价格走势', kind: 'open', prompt: '把价格优势对比定位回价格走势看板', target: { ...target, filterPatch: scopePatch } },
    { id: 'price-advantage-alerts', label: '打开价格预警', kind: 'open', prompt: '打开价格预警中心', target: { page: 'alerts', contextFingerprint, filterPatch: scopePatch } },
    { id: 'price-advantage-evidence', label: '查看证据', kind: 'evidence' },
  ];
  if (!rows.length) {
    // 空结果不给死按钮：给出可执行的调整范围追问（重跑仍是只读查询）。
    actions.push({ id: 'price-advantage-adjust-range', label: '调整范围 · 最近 12 周', kind: 'followup', prompt: '用最近 12 周重新计算价格优势' });
  }
  return {
    kind: 'price_advantage',
    id: `price-advantage-${contextFingerprint || state.countryCode}`,
    title: '价格优势对比',
    countryCode: state.countryCode,
    currency: state.currency,
    rows,
    skuOptions: options,
    selectedSkuId: options[0]?.skuId,
    filter: 'all',
    note: rows.length ? `按 ${state.countryCode} × 渠道 × 周对齐折后价；我司更低记为占优，数字来自本地确定性价格引擎。占优 ${advantageCount} 条，落后 ${laggingCount} 条。` : '当前国家、渠道和时间范围没有同时具备我司与竞品价格事实的周。',
    boundaries: [
      '仅统计同一周内我司与竞品都有有效折后价的对比；缺价周不插值、不外推。',
      '占优/落后只描述相对价位，不构成因果结论；促销与渠道快照需按证据逐条核对。',
    ],
    actions,
    evidence: [{ id: 'price-advantage-facts', label: '价格事实', detail: `${rows.length} 条国家 × 渠道 × 周对比 · ${state.rangeStart}–${state.rangeEnd}`, source: '统一价格聚合引擎' }],
    target,
  };
}

export function priceAdvantageSummary(card: PriceAdvantageResultCard): string {
  const latest = card.rows[0];
  if (!latest) return '当前范围没有可同时比较我司与核心竞品的价格事实。';
  const direction = latest.direction === 'advantage' ? '占优' : latest.direction === 'lagging' ? '落后' : '持平';
  const pct = latest.gapPct == null ? '' : `（${Math.abs(latest.gapPct * 100).toFixed(1)}%）`;
  return `已按本地确定性价格数据完成价格优势计算：${latest.ownModelName} 相对 ${latest.competitorBrand} ${latest.competitorModelName} 在 ${latest.weekId} ${direction} ${Math.abs(latest.gap).toLocaleString()}${card.currency === 'usd' ? ' USD' : ''}${pct}。`;
}

export function priceAdvantageSteps(card: PriceAdvantageResultCard): AgentStep[] {
  return [
    { id: 'advantage-intent', tool: 'catalog.resolve', label: '解析意图', status: 'success', detail: `${card.countryCode} · 价格优势`, durationMs: 18 },
    { id: 'advantage-read', tool: 'series.query', label: '读取价格', status: card.rows.length ? 'success' : 'warning', detail: `${card.rows.length} 条本地价格事实`, durationMs: 18 },
    { id: 'advantage-calc', tool: 'series.compare', label: '计算优势', status: card.rows.length ? 'success' : 'warning', detail: '按国家 × 渠道 × 周对齐我司与竞品', durationMs: 18 },
    { id: 'advantage-conclusion', tool: 'view.preview', label: '生成结论', status: 'success', detail: '结果可筛选并定位回看板', durationMs: 18 },
  ];
}

export function buildPriceAdvantageResult(state: FiltersState, contextFingerprint = ''): PriceAdvantageResult | null {
  const card = calculatePriceAdvantage(state, contextFingerprint);
  if (!card) return null;
  return {
    card,
    summary: priceAdvantageSummary(card),
    steps: priceAdvantageSteps(card),
    citations: [{ id: 'price-advantage-calc', kind: 'calculation', label: '价格优势确定性计算', detail: `${card.countryCode} · ${card.rows.length} 条对比 · 本地价格聚合引擎` }],
  };
}
