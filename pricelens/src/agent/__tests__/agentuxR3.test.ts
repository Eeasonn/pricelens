// ============================================================
// t428u R3（七审增量 · 2026-11-07）显式口径遵循与型号在架判定回归
// （真实事实包 / 真实 runAgent · buildPriceAdvantageResult · advantageScopePatch，
// 零 mock、无 forcedIntent——自然分类链 classifyIntent → query / price_advantage）：
//  - R3-M1：显式型号+配置查询严格遵循请求配置（RU nova 14 12+256GB 不再额外
//    枚举 12+512），页面已有的合法选择连同每线取价口径（shopIds/seller）原样
//    复用——趋势 395 / OZON 3P 与价格页一致，openPatch 落地后再查不漂移；
//    未点名配置沿用页面该型号选择，不扩大 mains。
//  - R3-M2：型号在架判定区分「型号整体缺席」与「默认电渠无价」——FR 真实目录
//    Mate X6 12+512 仅 Amazon 3P 有 202638–202642 五条事实（最新 202642 =
//    1595.51 → 1596）：URL 解析 / 跨国重映射 / 优势主品 / 回看落地全部保
//    Mate X6，不换 Pura、不误报「均无在架型号」；趋势真值 1596 · Amazon 3P
//    （透明渠道回退）；DE（型号真实缺席）仍 null 安全回落。
//  - R3-M3：跨国逐线取价口径统一归一——AE 页 nova 14 Pro 每线 NOON 3P
//    （seller=null）问 RU 趋势：有效目标每线店铺保留、无效外国渠道按目标国
//    回自动口径（482 · DNS）并透明说明；同国有效每线 3P 口径原样保留。
//  - r2-m2：「解释量价预测」的界面能力口径与实际校验一致——按月调整原因必填
//    （Batch 2 起 MarketBusPanel 实际校验），不再出现「原因选填」。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, factPriceWeekly } from '../../data';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, PlatformSelection } from '../../state/filtersTypes';
import { buildCards, firstLegalSelectionOfModel, remapMainsForScope, remapSelectionForCountry, selKey } from '../../state/mainSelection';
import { runAgent, buildAgentContext } from '../core';
import { advantageScopePatch } from '../priceAdvantage';
import type { ChartResultCard, ForecastExplanationResultCard, PriceAdvantageResultCard, TableResultCard } from '../contracts';

const OZON_3P: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
const NOON_3P_AE: PlatformSelection = { platforms: [], shopIds: ['AE:noon:3P'], seller: null };

const nova14Row = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const NOVA14_12256 = { modelId: 'own-huawei-nova-14', romram: nova14Row.romram, skuIds: [nova14Row.sku_id] };
const nova14ProRow = dimProduct.find((row) => row.model_id === 'own-huawei-nova-14-pro' && row.romram === '12+512 GB')!;
const NOVA14PRO = { modelId: 'own-huawei-nova-14-pro', romram: nova14ProRow.romram, skuIds: [nova14ProRow.sku_id] };
const mateX6Row = dimProduct.find((row) => row.model_id === 'own-huawei-mate-x6' && row.romram === '12+512 GB')!;
const MATE_X6 = { modelId: 'own-huawei-mate-x6', romram: mateX6Row.romram, skuIds: [mateX6Row.sku_id] };
// matrix-only（2026-11-10）：FR 手机无矩阵覆盖，跨国 FR 优势用例主品改用 FR 矩阵
// 有覆盖的穿戴 WATCH FIT 5（RU/FR 双在架；FR 事实 202631–202635 仅 Amazon 3P）。
const watchFit5Row = dimProduct.find((row) => row.sku_id === 'own-huawei-watch-fit-5__std__black')!;
const WATCH_FIT_5 = { modelId: 'own-huawei-watch-fit-5', romram: watchFit5Row.romram, skuIds: [watchFit5Row.sku_id] };

/** RU 页 · nova 14 主品挂每线 OZON 3P（价格页店铺药丸同步后的形态）· 单周 202619 */
function ruNova14ShopState(): FiltersState {
  const cards = buildCards([NOVA14_12256], { auto: true, countryCode: 'RU' });
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform: null,
    mains: cards.map((card) => (card.main ? { ...card, main: { ...card.main, platform: OZON_3P } } : card)),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202619',
  };
}

/** AE 页 · nova 14 Pro 主品挂每线 NOON 3P（seller=null 完整渠道口径） */
function aeNovaProNoonShopState(): FiltersState {
  const cards = buildCards([NOVA14PRO], { auto: true, countryCode: 'AE' });
  return {
    ...defaultFilters,
    countryCode: 'AE',
    platform: null,
    mains: cards.map((card) => (card.main ? { ...card, main: { ...card.main, platform: NOON_3P_AE } } : card)),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202642',
  };
}

async function queryCardsOf(state: FiltersState, text: string): Promise<{ chart: ChartResultCard; table: TableResultCard; response: Awaited<ReturnType<typeof runAgent>> }> {
  const response = await runAgent(text, buildAgentContext('dashboard', state, []));
  expect(response.intent).toBe('query');
  const chart = response.cards.find((item): item is ChartResultCard => item.kind === 'chart');
  const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
  expect(chart).toBeTruthy();
  expect(table).toBeTruthy();
  return { chart: chart!, table: table!, response };
}

describe('R3-M1 · 显式配置严格遵循 + 页面每线店铺口径保留（无 forcedIntent）', () => {
  it('「RU nova 14 12+256GB 价格趋势」：单系列 12+256 · 395 · OZON 3P，绝不添 12+512（370/DNS）', async () => {
    const { chart, table } = await queryCardsOf(ruNova14ShopState(), 'RU nova 14 12+256GB 价格趋势');
    // 请求什么配置就只有什么配置：单条系列，标签带 12+256，没有 12+512
    expect(chart.series.length).toBe(1);
    expect(chart.series[0].label).toContain('12+256');
    expect(chart.series.every((series) => !series.label.includes('12+512'))).toBe(true);
    // 真实 3P 事实 394.59 → 395（店铺级每线口径随页面选择保留）
    expect(chart.series[0].values).toEqual([{ bucket: '05-06', value: 395 }]);
    expect(table.rows[0][0]).toContain('nova 14');
    expect(table.rows[0][1]).toBe('395');
    expect(table.rows[0][3]).toBe('OZON 3P');
  });

  it('同会话两次问（图卡摘要 / openPatch / 落地后再查）全部一致：每线 shopIds 不丢、mains 不扩大', async () => {
    const state = ruNova14ShopState();
    const first = await queryCardsOf(state, 'RU nova 14 12+256GB 价格趋势');
    const openPatches = [first.chart, first.table].flatMap((card) => (card.actions ?? []).filter((action) => action.kind === 'open').map((action) => action.filterPatch));
    expect(openPatches.length).toBeGreaterThan(0);
    for (const patch of openPatches) {
      expect(patch!.countryCode).toBe('RU');
      expect(patch!.mains).toHaveLength(1);
      expect(patch!.mains![0].main?.romram).toBe('12+256 GB');
      expect(patch!.mains![0].main?.platform?.shopIds).toEqual(['RU:ozon:3P']);
      expect(patch!.mains![0].main?.platform?.platforms).toEqual([]);
    }
    // FiltersContext.set 同国语义：patch 字段落地后再问，同口径不漂移
    const landed: FiltersState = { ...state, ...openPatches[0]! } as FiltersState;
    const again = await queryCardsOf(landed, 'RU nova 14 12+256GB 价格趋势');
    expect(again.chart.series.length).toBe(1);
    expect(again.chart.series[0].values).toEqual([{ bucket: '05-06', value: 395 }]);
    expect(again.table.rows[0][3]).toBe('OZON 3P');
  });

  it('整平台混池对照：每线口径清掉后同问 = 333（1P 332.62 最低）——395 只可能来自严格 3P', async () => {
    const state = ruNova14ShopState();
    const cleared: FiltersState = {
      ...state,
      mains: state.mains.map((card) => (card.main ? { ...card, main: { ...card.main, platform: null } } : card)),
    };
    const { chart, table } = await queryCardsOf(cleared, 'RU nova 14 12+256GB 价格趋势');
    expect(chart.series[0].values).toEqual([{ bucket: '05-06', value: 333 }]);
    expect(table.rows[0][1]).toBe('333');
  });

  it('未点名配置（「RU nova 14 价格趋势」）：沿用页面已选 12+256 单卡（含每线口径），不扩大配置面', async () => {
    const { chart, table } = await queryCardsOf(ruNova14ShopState(), 'RU nova 14 价格趋势');
    expect(chart.series.length).toBe(1);
    expect(chart.series[0].label).toContain('12+256');
    expect(chart.series.every((series) => !series.label.includes('12+512'))).toBe(true);
    expect(table.rows[0][1]).toBe('395');
    expect(table.rows[0][3]).toBe('OZON 3P');
  });
});

describe('R3-M2 · FR 真实目录与事实：型号在架 ≠ 默认电渠有价', () => {
  it('目录事实：Mate X6 12+512 在 FR 在架；新事实包的 FR:amazon:3P 记录覆盖到 202645', () => {
    const frRows = dimProduct.filter((row) => row.model_id === 'own-huawei-mate-x6' && row.countries.includes('FR'));
    expect(frRows.map((row) => row.romram)).toEqual(['12+512 GB']);
    const facts = factPriceWeekly
      .filter((row) => row.country_code === 'FR' && row.sku_id.startsWith('own-huawei-mate-x6__'))
      .sort((a, b) => a.week_id.localeCompare(b.week_id));
    expect(facts).toHaveLength(7);
    expect(facts.every((row) => row.channel_id === 'FR:amazon:3P')).toBe(true);
    expect(facts.map((row) => row.week_id)).toEqual(['202638', '202639', '202640', '202641', '202642', '202644', '202645']);
    expect(facts[facts.length - 1]?.price_usd).toBeGreaterThan(0);
  });

  it('同型号 selection 合法解析：firstLegal/remap 在默认 1P 无价时按全部在架渠道回退，保 Mate X6 12+512', () => {
    const first = firstLegalSelectionOfModel('own-huawei-mate-x6', 'FR');
    expect(first).not.toBeNull();
    expect(first!.romram).toBe('12+512 GB');
    expect(first!.skuIds).toEqual(['own-huawei-mate-x6__12-512gb__black']);
    const remapped = remapSelectionForCountry(MATE_X6, 'FR', 'phone');
    expect(remapped).not.toBeNull();
    expect(selKey(remapped!)).toBe(selKey(MATE_X6));
    // 型号真实缺席（DE 无 Mate X6 目录行）仍 = null，安全回落默认主品
    expect(remapSelectionForCountry(MATE_X6, 'DE', 'phone')).toBeNull();
    // 回看整组落地的同口径：remapMainsForScope 保 Mate X6（非空 mains）
    const ruCards = buildCards([MATE_X6], { auto: true, countryCode: 'RU' });
    const frMains = remapMainsForScope(ruCards, 'FR', 'phone');
    expect(frMains).not.toBeNull();
    expect(frMains!.some((card) => card.main?.modelId === 'own-huawei-mate-x6' && card.main.romram === '12+512 GB')).toBe(true);
  });

  it('RU WATCH FIT 5 问「FR 价格优势」（无 forcedIntent）：保 WATCH FIT 5 不误报不换 Pura，真实行 · Amazon 3P', async () => {
    // matrix-only（2026-11-10）：FR 无手机矩阵，本用例改用 FR 矩阵覆盖的穿戴
    // WATCH FIT 5（RU 页穿戴产业问 FR 优势）；「型号在架 ≠ 默认电渠有价」的
    // 结构语义不变——主品保留请求型号、行全部 FR、渠道随真实事实（202631–
    // 202635 仅 Amazon 3P 有价）。穿戴层级塌缩后 romram = '—'。
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      industry: 'wearable',
      mains: buildCards([WATCH_FIT_5], { auto: true, countryCode: 'RU' }),
      adaptive: false,
      rangeStart: '202631',
      rangeEnd: '202635',
    };
    const response = await runAgent('FR 价格优势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('price_advantage');
    const card = response.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage');
    expect(card).toBeTruthy();
    // 主品就是请求的 WATCH FIT 5（skuOptions 带型号口径），绝不是回落默认 Pura
    expect(card!.skuOptions.some((option) => option.label.includes('WATCH FIT 5'))).toBe(true);
    expect(card!.skuOptions.every((option) => !option.label.includes('Pura'))).toBe(true);
    // 型号在架：不出现「均无在架型号」误报；真实行全部 FR · WATCH FIT 5
    expect(card!.note).not.toContain('均无在架型号');
    expect(card!.rows.length).toBeGreaterThan(0);
    for (const row of card!.rows) {
      expect(row.countryCode).toBe('FR');
      expect(row.own.modelId).toBe('own-huawei-watch-fit-5');
      expect(row.own.romram).toBe('—');
      expect(row.channelLabel).toBe('Amazon 3P');
    }
    // 最新周真实值可核查：202635 = 228（事实 196 EUR / 0.86 = 227.91 取整）
    const latest = card!.rows.find((row) => row.weekId === '202635');
    expect(latest).toBeTruthy();
    expect(latest!.own.price).toBe(228);
    // 回看 scopePatch：目标国 FR + 真实周范围 + mains 保 WATCH FIT 5（非空、合法）
    const patch = advantageScopePatch(state, card!.rows);
    expect(patch.countryCode).toBe('FR');
    expect(patch.granularity).toBe('week');
    expect(patch.mains?.some((mainCard) => mainCard.main?.modelId === 'own-huawei-watch-fit-5')).toBe(true);
    expect(patch.mains?.every((mainCard) => mainCard.main?.modelId !== 'own-huawei-pura-90s-pro-max')).toBe(true);
  });

  it('FR 页显式钉 Amazon 1P 问「价格优势」：行空时如实解释（默认电渠无我司价、3P 有真实在架价），不造行不换型号', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'FR',
      platform: { platforms: [], shopIds: ['FR:amazon:1P'], seller: null },
      mains: buildCards([MATE_X6], { auto: true, countryCode: 'FR' }),
      adaptive: false,
      rangeStart: '202638',
      rangeEnd: '202642',
    };
    const response = await runAgent('价格优势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('price_advantage');
    const card = response.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage');
    expect(card).toBeTruthy();
    expect(card!.rows).toHaveLength(0);
    expect(card!.note).toContain('Amazon 3P');
    expect(card!.note).toContain('没有我司价格事实');
    expect(card!.note).toContain('真实在架价格');
    expect(card!.note).toContain('未用其他产品冒充');
    expect(response.summary).toContain('Amazon 3P');
  });

  it('趋势真值（无 forcedIntent）：「FR Mate X6 价格趋势」= 1596 · Amazon 3P（透明渠道回退说明）', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      mains: buildCards([MATE_X6], { auto: true, countryCode: 'RU' }),
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202642',
    };
    const { chart, table } = await queryCardsOf(state, 'FR Mate X6 价格趋势');
    expect(chart.series.length).toBe(1);
    expect(chart.series[0].label).toContain('Mate X6');
    const last = chart.series[0].values[chart.series[0].values.length - 1];
    expect(last.value).toBe(1596);
    expect(table.rows[0][1]).toBe('1,596');
    expect(table.rows[0][3]).toBe('Amazon 3P');
    // 渠道回退透明说明：默认电渠无价、按有价渠道取数，不冒称默认电渠口径
    expect(chart.note).toContain('Amazon 3P');
    expect(chart.note).toContain('默认电渠');
    expect(chart.note).toContain('没有价格事实');
    // openPatch 同口径落地：FR + Mate X6 + 逐线钉有价渠道
    const open = (chart.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.countryCode).toBe('FR');
    expect(open?.filterPatch?.mains?.[0]?.main?.modelId).toBe('own-huawei-mate-x6');
    expect(open?.filterPatch?.mains?.[0]?.main?.platform?.shopIds).toEqual(['FR:amazon:3P']);
  });
});

describe('R3-M3 · 跨国逐线取价口径归一（AE 每线 NOON 3P · seller=null → RU）', () => {
  it('「RU nova 14 Pro 价格趋势」：NOON 3P 在 RU 不存在 → 该线回自动口径 482 · DNS，透明说明', async () => {
    const { chart, table } = await queryCardsOf(aeNovaProNoonShopState(), 'RU nova 14 Pro 价格趋势');
    expect(chart.series.length).toBe(1);
    expect(chart.series[0].label).toContain('nova 14 Pro');
    const last = chart.series[0].values[chart.series[0].values.length - 1];
    expect(last.value).toBe(482);
    expect(table.rows[0][1]).toBe('482');
    expect(table.rows[0][3]).toBe('DNS');
    // 逐线（非全局）回退透明说明：点名 AE:noon:3P 在 R国没有在架渠道 + 实际口径
    expect(chart.note).toContain('AE:noon:3P');
    expect(chart.note).toContain('没有在架渠道');
    expect(chart.note).toContain('全部渠道最低价');
    expect(table.note).toContain('AE:noon:3P');
  });

  it('openPatch 落地一致：RU + nova 14 Pro + 每线口径归一（不再 spread 残留 AE 渠道）', async () => {
    const { chart, table } = await queryCardsOf(aeNovaProNoonShopState(), 'RU nova 14 Pro 价格趋势');
    for (const patch of [chart, table].flatMap((card) => (card.actions ?? []).filter((action) => action.kind === 'open').map((action) => action.filterPatch))) {
      expect(patch!.countryCode).toBe('RU');
      expect(patch!.mains).toHaveLength(1);
      expect(patch!.mains![0].main?.modelId).toBe('own-huawei-nova-14-pro');
      expect(patch!.mains![0].main?.platform ?? null).toBeNull();
    }
  });

  it('同国有效每线 3P 口径原样保留（R3-M3 不回归 R3-M1/R6 语义）', async () => {
    // nova 14（非 Pro）12+256 黑色：OZON 3P 在 202619 有真实事实（394.59）
    const cards = buildCards([NOVA14_12256], { auto: true, countryCode: 'RU' });
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: null,
      mains: cards.map((card) => (card.main ? { ...card, main: { ...card.main, platform: OZON_3P } } : card)),
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202619',
    };
    const { chart, table } = await queryCardsOf(state, 'RU nova 14 价格趋势');
    expect(chart.series.length).toBe(1);
    expect(table.rows[0][1]).toBe('395');
    expect(table.rows[0][3]).toBe('OZON 3P');
    // 同国每线口径完全可落地：不产生任何回退说明
    expect(chart.note).not.toContain('没有在架渠道');
    expect(table.note).not.toContain('没有在架渠道');
    const open = (chart.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.mains?.[0]?.main?.platform?.shopIds).toEqual(['RU:ozon:3P']);
  });
});

describe('r2-m2 · 「解释量价预测」界面能力口径与实际校验一致（原因必填）', () => {
  it('假设与边界全文不出现「原因选填」；大盘月粒度口径为「原因必填」', async () => {
    const response = await runAgent('解释量价预测', buildAgentContext('forecast', { ...defaultFilters, rangeStart: '202619', rangeEnd: '202642' }, []));
    expect(response.intent).toBe('forecast_explain');
    const card = response.cards.find((item): item is ForecastExplanationResultCard => item.kind === 'forecast_explanation');
    expect(card).toBeTruthy();
    const full = [...card!.assumptions, ...card!.boundaries].join('\n');
    expect(full).not.toContain('原因选填');
    const marketLine = card!.assumptions.find((line) => line.includes('大盘月粒度'))!;
    expect(marketLine).toContain('原因必填');
    expect(marketLine).toContain('点击预测月');
  });
});
