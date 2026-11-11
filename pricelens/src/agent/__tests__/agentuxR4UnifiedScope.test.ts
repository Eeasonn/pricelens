// ============================================================
// t428u R4 返修（三审增量 · 2026-11-07）统一生效口径 / 显式配置省单位 /
// 部分渠道归一说明回归（真实事实包、真实 runAgent / buildSeries /
// advantageScopePatch / factPriceWeekly，零 mock、无 forcedIntent——自然分类链
// classifyIntent → query / price_advantage）：
//  - 三审 M1：每线 3P 口径必须贯穿趋势与优势——共享 effectiveLinePlatform
//    （每线显式 > 全局 state.platform > 自动）。matrix-only（2026-11-10）重锚：
//    旧证人 nova 14 12+256 黑在 RU 无矩阵对比位（优势恒 0 行），改用矩阵覆盖的
//    nova 15 12+256 黑 week202634 主品每线 OZON 3P（31650₽/85.1645=371.63→372），
//    趋势 372 而优势只读全局会被混池成 352（DNS 29999₽/85.1645=352.25 最低）。
//    优势 own 372 / 对手 A57 586、HONOR 600 540（矩阵对手，价差 +214/+168）；
//    整卡回看、行级定位落地、再问全部仍 372；URL 全局 shop=3P 的趋势/优势也
//    统一 372（不再趋势 352）。
//  - 三审 M2：显式配置省单位/空格变体（12+256、12 + 256、12+256 GB、12＋256）
//    必须严格解析为该配置（333 / OZON 自动），当前页面持有 12+512（370/DNS）
//    时绝不静默沿用；明确无效配置（8+256）如实说明，不扩大配置面。
//  - 三审 r3-m1：跨国逐线口径部分可落地（AE 每线 Amazon+NOON → DE 保留
//    Amazon）说明必须基于真实归一前/后/剔除子集——只说 NOON 不可用已剔除、
//    本次仅按 Amazon 计算，绝不把保留子集说成「全部渠道最低价自动」。
// 数据事实（fact_price_weekly / dim_channel）：nova 14 12+256 黑 RU 202619
// OZON 3P=394.59、OZON 1P=332.62（自动最低→333）；honor 200 Pro 12+512 RU
// 仅 OZON 3P 两行 362.52/360.60（自动=361）；redmi Note 15 Pro 12+256 黑
// 自动=DNS 333.27→333；nova 14 12+512 黑自动=DNS 369.86→370；nova 14 Pro
// 12+512 DE 仅 Amazon（1P 493.1@202633/202639 …），mediamarkt 无事实。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, PlatformSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { effectiveChannelIds, effectiveLinePlatform, platformSelectionForCountry } from '../../dataModel/aggregate';
import { runAgent, buildAgentContext } from '../core';
import { advantageScopePatch } from '../priceAdvantage';
import type { ChartResultCard, PriceAdvantageResultCard, TableResultCard } from '../contracts';

const OZON_3P: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
const AMAZON_NOON: PlatformSelection = { platforms: ['Amazon', 'NOON'], shopIds: [], seller: null };
const NOON_PLATFORM: PlatformSelection = { platforms: ['NOON'], shopIds: [], seller: null };

const nova14Row = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const NOVA14_12256 = { modelId: 'own-huawei-nova-14', romram: nova14Row.romram, skuIds: [nova14Row.sku_id] };
const nova14_512_Row = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-512gb__black')!;
const NOVA14_12512 = { modelId: 'own-huawei-nova-14', romram: nova14_512_Row.romram, skuIds: [nova14_512_Row.sku_id] };
const nova14ProRow = dimProduct.find((row) => row.model_id === 'own-huawei-nova-14-pro' && row.romram === '12+512 GB')!;
const NOVA14PRO = { modelId: 'own-huawei-nova-14-pro', romram: nova14ProRow.romram, skuIds: [nova14ProRow.sku_id] };
// matrix-only（2026-11-10）：M1 的「每线 3P 贯穿趋势与优势」主品改用矩阵有覆盖的
// nova 15 12+256（旧锚 nova 14 在 RU 无矩阵对比位，优势恒 0 行）；证人周同步移到
// 202634——nova 15 与矩阵对手（A57 12+256 / HONOR 600 12+256）在该周同有真实价
// （own：OZON 3P 31650 ₽ / 85.1645 = 371.63 → 372；自动混池 DNS 29999 ₽ / 85.1645
// = 352.25 → 352；A57 灰 Mvideo 585.81 → 586；HONOR 600 DNS 540.12 → 540）。
const nova15Row = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-15__12-256gb__black')!;
const NOVA15_12256 = { modelId: 'own-huawei-nova-15', romram: nova15Row.romram, skuIds: [nova15Row.sku_id] };

/** RU 页 · nova 15 12+256 主品挂每线 OZON 3P（价格页店铺药丸同步后的形态）· 单周 202634 */
function ruNova15PerLineShopState(): FiltersState {
  const cards = buildCards([NOVA15_12256], { auto: true, countryCode: 'RU' });
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform: null,
    mains: cards.map((card) => (card.main ? { ...card, main: { ...card.main, platform: OZON_3P } } : card)),
    adaptive: false,
    rangeStart: '202634',
    rangeEnd: '202634',
  };
}

/** RU 页 · nova 14 12+256 主品挂每线 OZON 3P · 单周 202619（M2 显式配置用例沿用） */
function ruNova14PerLineShopState(): FiltersState {
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

/** RU 页 · 页面当前持有 nova 14 12+512（URL main=…12+512GB 形态）· 无每线/全局口径 */
function ruNova14Holding12512State(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform: null,
    mains: buildCards([NOVA14_12512], { auto: true, countryCode: 'RU' }),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202619',
  };
}

/** AE 页 · nova 14 Pro 主品挂每线平台口径（受控契约形态：跨平台并集） */
function aeNovaProPerLinePlatformState(perLine: PlatformSelection): FiltersState {
  const cards = buildCards([NOVA14PRO], { auto: true, countryCode: 'AE' });
  return {
    ...defaultFilters,
    countryCode: 'AE',
    platform: null,
    mains: cards.map((card) => (card.main ? { ...card, main: { ...card.main, platform: perLine } } : card)),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202642',
  };
}

async function trendCardsOf(state: FiltersState, text: string) {
  const response = await runAgent(text, buildAgentContext('dashboard', state, []));
  expect(response.intent).toBe('query');
  const chart = response.cards.find((item): item is ChartResultCard => item.kind === 'chart');
  const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
  expect(chart).toBeTruthy();
  expect(table).toBeTruthy();
  return { chart: chart!, table: table!, response };
}

async function advantageCardOf(state: FiltersState, text = '价格优势') {
  const response = await runAgent(text, buildAgentContext('dashboard', state, []));
  expect(response.intent).toBe('price_advantage');
  const card = response.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage');
  expect(card).toBeTruthy();
  return { card: card!, response };
}

describe('三审 M1 · 共享生效口径 effectiveLinePlatform（每线 > 全局 > 自动）', () => {
  it('解析器契约：每线显式优先于全局；空每线勾选回落全局；两者皆无 = null（自动）', () => {
    const perLine: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
    expect(effectiveLinePlatform({ platform: perLine }, OZON_3P)).toBe(perLine);
    expect(effectiveLinePlatform({ platform: perLine }, null)).toBe(perLine);
    expect(effectiveLinePlatform({}, OZON_3P)).toBe(OZON_3P);
    expect(effectiveLinePlatform({ platform: null }, OZON_3P)).toBe(OZON_3P);
    expect(effectiveLinePlatform({ platform: { platforms: [], shopIds: [], seller: null } }, OZON_3P)).toBe(OZON_3P);
    expect(effectiveLinePlatform({}, null)).toBeNull();
  });

  it('最强反例：趋势 372/OZON 3P，同会话价格优势 own 372、对 A57（新绑定 8+128）/ HONOR 600（新绑定 8+256，493）落后值如实为占优（绝不 352 混池）', async () => {
    const state = ruNova15PerLineShopState();
    // 趋势：372 / OZON 3P（与价格页每线药丸一致；自动混池是 352/DNS）
    const { table } = await trendCardsOf(state, '价格趋势');
    expect(table.rows[0][1]).toBe('372');
    expect(table.rows[0][3]).toBe('OZON 3P');
    // 优势：own 全部 372、渠道点名 OZON 3P；2026-11-11 pair_configs 修订后 nova 15
    // 12+256 对 A57 8+128、HONOR 600 8+256（便宜对便宜），真实事实价以实际取数为准
    // （本断言锁「每线 3P 价随优势，不读全局混池」）
    const { card } = await advantageCardOf(state);
    const rows34 = card.rows.filter((row) => row.weekId === '202634');
    expect(rows34.length).toBeGreaterThan(0);
    expect(rows34.every((row) => row.own.price === 372)).toBe(true);
    expect(rows34.some((row) => row.own.price === 352)).toBe(false);
    expect(rows34.every((row) => row.channelLabel === 'OZON 3P')).toBe(true);
    const honorRow = rows34.find((row) => row.competitor.modelId === 'cmp-honor-600');
    expect(honorRow).toBeTruthy();
    expect(honorRow!.competitor.price).toBe(493);
    expect(honorRow!.priceDiff).toBe(493 - 372);
    expect(honorRow!.relation).toBe('advantage');
    const a57Row = rows34.find((row) => row.competitor.modelId === 'cmp-samsung-a57');
    expect(a57Row).toBeTruthy();
    expect(a57Row!.competitor.price).toBe(423);
    expect(a57Row!.priceDiff).toBe(423 - 372);
    expect(a57Row!.relation).toBe('advantage');
    // 关系方向全部由真实价差导出（nova 15 低于两款矩阵对手 → 全部占优），
    // 没有一条被误报反向
    expect(rows34.every((row) => row.relation === 'advantage')).toBe(true);
    expect(rows34.some((row) => row.relation === 'behind')).toBe(false);
  });

  it('整卡回看（advantageScopePatch）：全局层落地 null + mains 每线 shopIds 保留；落地后再问仍 372/占优', async () => {
    const state = ruNova15PerLineShopState();
    const first = await advantageCardOf(state);
    const patch = advantageScopePatch(state, first.card.rows);
    expect(patch.platform).toBeNull(); // 全局层 = 参与计算的全局口径（null），不偷换
    expect(patch.mains?.[0]?.main?.platform?.shopIds).toEqual(['RU:ozon:3P']);
    const landed: FiltersState = { ...state, ...patch, platform: patch.platform ?? null } as FiltersState;
    const again = await advantageCardOf(landed);
    const rows34 = again.card.rows.filter((row) => row.weekId === '202634');
    expect(rows34.every((row) => row.own.price === 372)).toBe(true);
    expect(rows34.every((row) => row.channelLabel === 'OZON 3P')).toBe(true);
    const honorAgain = rows34.find((row) => row.competitor.modelId === 'cmp-honor-600');
    expect(honorAgain!.relation).toBe('advantage');
  });

  it('行级定位 patch 独立复刻（AgentPanel jump 同式）：全局层 null + 每线 3P 随 ownSelection；落地后趋势仍 372', async () => {
    const state = ruNova15PerLineShopState();
    const { card } = await advantageCardOf(state);
    const row = card.rows[0];
    expect(row).toBeTruthy();
    // AgentPanel.jump 的行级 patch 公式（R4：全局层 = 参与计算全局口径的归一化，
    // 每线层 = row.ownSelection.platform 原样随 mains 落地）
    const patch = {
      countryCode: row.countryCode,
      platform: platformSelectionForCountry(state.platform, row.countryCode),
      granularity: 'week' as const,
      adaptive: false,
      rangeStart: row.weekId,
      rangeEnd: row.weekId,
      mains: buildCards([row.ownSelection], { auto: true, countryCode: row.countryCode }),
    };
    expect(patch.platform).toBeNull();
    expect(patch.mains[0]?.main?.platform?.shopIds).toEqual(['RU:ozon:3P']);
    const landed: FiltersState = { ...state, ...patch, platform: patch.platform ?? null } as FiltersState;
    const { table } = await trendCardsOf(landed, '价格趋势');
    expect(table.rows[0][1]).toBe('372');
    expect(table.rows[0][3]).toBe('OZON 3P');
  });

  it('URL 全局 shop=3P 旁证统一：趋势与优势都 478/OZON 3P（旧缺陷趋势混池 427 与优势 478 双口径）', async () => {
    // 全局店铺级 3P 下对手线同口径（只吃 OZON 3P 事实）——nova 15 12+256 的矩阵
    // 对手仅 HONOR 600 12+256 在 202645 有 OZON 3P 行（671.18），证人周取 202645：
    // own OZON 3P min(478.07, 478.31) → 478；自动混池 427（DNS 427.18）。
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: OZON_3P,
      mains: buildCards([NOVA15_12256], { auto: true, countryCode: 'RU' }),
      adaptive: false,
      rangeStart: '202645',
      rangeEnd: '202645',
    };
    const { table } = await trendCardsOf(state, '价格趋势');
    expect(table.rows[0][1]).toBe('478');
    expect(table.rows[0][3]).toBe('OZON 3P');
    const { card } = await advantageCardOf(state);
    const rows45 = card.rows.filter((row) => row.weekId === '202645');
    expect(rows45.length).toBeGreaterThan(0);
    expect(rows45.every((row) => row.own.price === 478)).toBe(true);
    expect(rows45.every((row) => row.channelLabel === 'OZON 3P')).toBe(true);
    const honorRow = rows45.find((row) => row.competitor.modelId === 'cmp-honor-600');
    expect(honorRow).toBeTruthy();
    expect(honorRow!.competitor.price).toBe(611);
    expect(honorRow!.priceDiff).toBe(611 - 478);
    expect(honorRow!.relation).toBe('advantage');
  });
});

describe('三审 M2 · 显式配置省单位/空格变体严格解析（页面持有 12+512 时绝不静默沿用）', () => {
  it.each([
    'RU nova 14 12+256 价格趋势',
    'RU nova 14 12 + 256 价格趋势',
    'RU nova 14 12+256 GB 价格趋势',
    'RU nova 14 12 + 256GB 价格趋势',
    'RU nova 14 12＋256 价格趋势',
    'RU nova 14 12+256GB 价格趋势',
  ])('「%s」→ 只解析 12+256（真实 333 / OZON），不返回页面 12+512（370/DNS）', async (text) => {
    const state = ruNova14Holding12512State();
    const { chart, table } = await trendCardsOf(state, text);
    expect(chart.series.length).toBe(1);
    expect(chart.series[0].label).toContain('12+256');
    expect(chart.series.every((series) => !series.label.includes('12+512'))).toBe(true);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0][0]).toContain('12+256');
    expect(table.rows[0][1]).toBe('333');
    expect(table.rows[0][3]).toBe('OZON');
    const noteAndRows = `${chart.note}\n${table.rows.flat().join('|')}`;
    expect(noteAndRows.includes('12+512')).toBe(false);
    expect(noteAndRows.includes('370')).toBe(false);
    // open 动作落地严格 12+256，不添 12+512
    const open = (chart.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.mains).toHaveLength(1);
    expect(open?.filterPatch?.mains?.[0]?.main?.romram).toBe('12+256 GB');
  });

  it('有效每线 3P 下同配置省单位（12+256）：仍 395 / OZON 3P（M1+M2 联合）', async () => {
    const state = ruNova14PerLineShopState();
    const { chart, table } = await trendCardsOf(state, 'RU nova 14 12+256 价格趋势');
    expect(chart.series.length).toBe(1);
    expect(chart.series[0].label).toContain('12+256');
    expect(table.rows[0][1]).toBe('395');
    expect(table.rows[0][3]).toBe('OZON 3P');
    const open = (chart.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.mains?.[0]?.main?.platform?.shopIds).toEqual(['RU:ozon:3P']);
  });

  it('明确无效配置（8+256）：如实说明点名配置无在架，不静默扩大全部配置、不沿用页面 12+512 冒充', async () => {
    const state = ruNova14Holding12512State();
    const response = await runAgent('RU nova 14 8+256 价格趋势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
    expect(table).toBeTruthy();
    expect(table!.rows[0][2]).toBe('无可用价格数据');
    expect(table!.rows[0][0]).toContain('nova 14');
    expect(table!.rows[0][0]).toContain('8+256');
    expect(table!.note).toContain('没有在架型号配置');
    expect(table!.note).toContain('没有改用该型号其他配置或当前页面配置代替');
    expect(response.summary).toContain('8+256');
    // 没有任何趋势卡/价格冒充已按请求查询
    expect(response.cards.some((item) => item.kind === 'chart')).toBe(false);
    expect(`${table!.note}${response.summary}`).not.toContain('370');
    expect(`${table!.note}${table!.rows.flat().join('|')}`).not.toContain('12+512');
  });
});

describe('三审 r3-m1 · 逐线口径跨国归一说明按真实前/后/剔除子集生成（受控 API 契约）', () => {
  it('部分可落地（AE 每线 Amazon+NOON → DE 保留 Amazon）：说明点名 NOON 已剔除、仅按 Amazon 计算，绝不称全部自动；有效渠道 = DE amazon 1P/3P', async () => {
    const state = aeNovaProPerLinePlatformState(AMAZON_NOON);
    const { chart, table } = await trendCardsOf(state, 'DE nova 14 Pro 价格趋势');
    // 计算真按 Amazon 限定渠道（真实事实：nova 14 Pro 12+512 DE 仅 Amazon 有价，
    // 最新有价周 202639 = 493.1 → 493，其后缺采周不插值；mediamarkt 不在口径内）
    expect(chart.series.length).toBe(1);
    const lastValued = [...chart.series[0].values].reverse().find((point) => point.value != null);
    expect(lastValued?.value).toBe(493);
    expect(table.rows[0][1]).toBe('493');
    expect(table.rows[0][3]).toBe('Amazon');
    expect(effectiveChannelIds('DE', { platforms: ['Amazon'], shopIds: [] })).toEqual(['DE:amazon:1P', 'DE:amazon:3P']);
    // 说明：NOON 不可用已剔除 + 仅按 Amazon 计算；不出现全自动/默认电渠字样，
    // 也不误称 Amazon 不存在
    expect(chart.note).toContain('NOON');
    expect(chart.note).toContain('已剔除');
    expect(chart.note).toContain('仅按 Amazon');
    expect(chart.note).not.toContain('全部渠道最低价');
    expect(chart.note).not.toContain('默认电渠');
    expect(table.note).toContain('NOON');
    expect(table.note).not.toContain('全部渠道最低价');
    // openPatch 落地一致：DE + 每线归一为 platforms=[Amazon]（不残留 NOON）
    const open = (chart.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.countryCode).toBe('DE');
    expect(open?.filterPatch?.mains?.[0]?.main?.platform).toEqual({ platforms: ['Amazon'], shopIds: [], seller: null });
  });

  it('全部不可落地（AE 每线 NOON 平台 → RU）：该线回自动口径 482 · DNS，说明如实称全部渠道最低价（自动）', async () => {
    const state = aeNovaProPerLinePlatformState(NOON_PLATFORM);
    const { chart, table } = await trendCardsOf(state, 'RU nova 14 Pro 价格趋势');
    const last = chart.series[0].values[chart.series[0].values.length - 1];
    expect(last.value).toBe(482);
    expect(table.rows[0][1]).toBe('482');
    expect(table.rows[0][3]).toBe('DNS');
    expect(chart.note).toContain('NOON');
    expect(chart.note).toContain('没有在架渠道');
    expect(chart.note).toContain('全部渠道最低价');
    const open = (chart.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.mains?.[0]?.main?.platform ?? null).toBeNull();
  });

  it('同国有效店铺口径完全保留：395 / OZON 3P，不产生任何假 fallback 说明', async () => {
    // 共享规则：同国店铺级勾选原样返回（引用一致）
    expect(platformSelectionForCountry(OZON_3P, 'RU')).toBe(OZON_3P);
    const state = ruNova14PerLineShopState();
    const { chart, table } = await trendCardsOf(state, 'RU nova 14 12+256GB 价格趋势');
    expect(table.rows[0][1]).toBe('395');
    expect(table.rows[0][3]).toBe('OZON 3P');
    expect(chart.note).not.toContain('没有在架渠道');
    expect(chart.note).not.toContain('全部渠道最低价');
  });
});
