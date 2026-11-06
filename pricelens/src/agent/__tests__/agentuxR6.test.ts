// ============================================================
// t428u R6（六审增量 · 2026-11-07）真实 3P 计算口径回归（真实事实数据、
// 真实 runAgent / buildPriceAdvantageResult / advantageScopePatch，零 mock）：
//  - 评审反例：RU nova 14（非 Pro）12+256GB 黑色 week202619 USD，OZON 店铺级
//    3P 事实 = 394.59（序列点价取整 395）；1P = 332.62（点价 333）。「留 3P
//    口径却按 1P+3P 平台池计算」的错值得 333——本文件用真实链路证明迭代线
//    真按选中店铺取数：趋势 chart/最新表 = 395、优势 own 价 = 395（对 honor
//    200 Pro 3P 360.60→361 为「落后」；混池 333 会翻转成「占优」，关系翻转
//    即最强判别）、导航 patch 保留 shopIds、回看落地后再查同口径不漂移。
//  - 口径来源（与页面一致，不另造引擎）：趋势 queryCards = 每线
//    selection.platform（与价格页图表同源）；价格优势 = 全局 state.platform
//    （与总览/量价全局口径同源）。两者经 effectiveChannelIds 严格交集解析。
//  - PriceAdvantageRow 实际结构如实断言（own/competitor 各带 modelId/
//    modelName/romram/skuId/price，行带 weekId/channelLabel/platform/
//    priceDiff/priceDiffPct/relation）——不编造不存在的单行价字段。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, PlatformSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { runAgent, buildAgentContext } from '../core';
import { advantageScopePatch, platformCountryFallbackNote } from '../priceAdvantage';
import type { ChartResultCard, PriceAdvantageResultCard, TableResultCard } from '../contracts';

const OZON_3P: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
const nova14Row = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const NOVA14 = { modelId: 'own-huawei-nova-14', romram: nova14Row.romram, skuIds: [nova14Row.sku_id] };

/** RU 页 · nova 14 主品（每线挂 OZON 3P 店铺口径 = 价格页店铺同步后的形态） */
function ruTrendShopState(): FiltersState {
  const cards = buildCards([NOVA14], { auto: true, countryCode: 'RU' });
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

/** RU 页 · nova 14 主品 · 全局 OZON 3P 店铺勾选（总览 PlatformBox / URL shop= 形态） */
function ruAdvantageShopState(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform: OZON_3P,
    mains: buildCards([NOVA14], { auto: true, countryCode: 'RU' }),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202619',
  };
}

describe('R6 · 趋势查询真实 3P 价格（runAgent → queryCards → buildSeries，零 mock）', () => {
  it('chart 与最新表 = 395（394.59 取整），取数口径点名 OZON 3P，绝非混池 333', async () => {
    const response = await runAgent('价格趋势', buildAgentContext('dashboard', ruTrendShopState(), []));
    expect(response.intent).toBe('query');
    const chart = response.cards.find((item): item is ChartResultCard => item.kind === 'chart');
    const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
    expect(chart).toBeTruthy();
    expect(table).toBeTruthy();
    // 主品系列（main 在前）：单周范围 → 一个点，值 = 395
    const novaEntry = chart!.series.find((s) => s.label.includes('nova 14'));
    expect(novaEntry).toBeTruthy();
    expect(novaEntry!.values).toEqual([{ bucket: '05-06', value: 395 }]);
    // 最新价格摘要表首行 = 主品：最新价 395、取数口径 OZON 3P（透明点名渠道）
    expect(table!.rows[0][0]).toContain('nova 14');
    expect(table!.rows[0][1]).toBe('395');
    expect(table!.rows[0][3]).toBe('OZON 3P');
  });

  it('导航 patch 保留店铺口径：open 动作 mains 每线 shopIds=[RU:ozon:3P]', async () => {
    const response = await runAgent('价格趋势', buildAgentContext('dashboard', ruTrendShopState(), []));
    const open = response.cards.flatMap((card) => card.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch).toBeTruthy();
    const mains = open!.filterPatch!.mains!;
    expect(mains.length).toBeGreaterThan(0);
    const mainSel = mains.find((card) => card.main)?.main;
    expect(mainSel?.platform?.shopIds).toEqual(['RU:ozon:3P']);
    expect(mainSel?.platform?.platforms).toEqual([]);
  });
});

describe('R6 · 价格优势真实 3P 价格（runAgent → buildPriceAdvantageResult，零 mock）', () => {
  it('week202619 行 own 价 = 395、渠道点名 OZON 3P；对 honor 200 Pro（3P 361）为「落后」——混池 333 会误翻成占优', async () => {
    const state = ruAdvantageShopState();
    const response = await runAgent('RU 价格优势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('price_advantage');
    const card = response.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage');
    expect(card).toBeTruthy();
    const rows19 = card!.rows.filter((row) => row.weekId === '202619');
    expect(rows19.length).toBeGreaterThan(0);
    // 全部 202619 行 own 价 = 395：只要任何一行是 333 就是「留 3P 算混池」
    expect(rows19.every((row) => row.own.price === 395)).toBe(true);
    expect(rows19.every((row) => row.own.price === 333)).toBe(false);
    expect(rows19.every((row) => row.channelLabel === 'OZON 3P')).toBe(true);
    // honor 200 Pro 12+512 在 OZON 3P 同周 360.60（点价 361）：严格 3P 下我司
    // 395 落后 34；若口径被扩大成平台池（own=333）该行会翻成占优 +28
    const honorRow = rows19.find((row) => row.competitor.modelId === 'cmp-honor-200-pro');
    expect(honorRow).toBeTruthy();
    expect(honorRow!.competitor.price).toBe(361);
    expect(honorRow!.priceDiff).toBe(361 - 395);
    expect(honorRow!.relation).toBe('behind');
  });

  it('PriceAdvantageRow 实际结构如实断言（不编造字段）', async () => {
    const response = await runAgent('RU 价格优势', buildAgentContext('dashboard', ruAdvantageShopState(), []));
    const card = response.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage')!;
    const row = card.rows[0];
    expect(row).toBeTruthy();
    expect(row.own).toMatchObject({ modelId: 'own-huawei-nova-14', skuId: 'own-huawei-nova-14__12-256gb__black', price: 395 });
    expect(row.competitor).toMatchObject({ modelId: expect.any(String), price: expect.any(Number) });
    expect(row.weekId).toBe('202619');
    expect(row.platform).toBe('OZON');
    expect(row.countryCode).toBe('RU');
    expect(row.currency).toBe('usd');
    expect(typeof row.priceDiff).toBe('number');
    expect(typeof row.priceDiffPct).toBe('number');
    expect(['advantage', 'behind', 'tie']).toContain(row.relation);
  });

  it('回看口径（advantageScopePatch）：RU 同国店铺勾选原样保留，范围 = 实际参与对比周', async () => {
    const state = ruAdvantageShopState();
    const response = await runAgent('RU 价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage')!;
    const patch = advantageScopePatch(state, card.rows);
    expect(patch.countryCode).toBe('RU');
    expect(patch.platform).toEqual(OZON_3P);
    expect(patch.granularity).toBe('week');
    expect(patch.rangeStart).toBe('202619');
    expect(patch.rangeEnd).toBe('202619');
    expect(patch.mains?.some((cardItem) => cardItem.main?.modelId === 'own-huawei-nova-14')).toBe(true);
    // 同国店铺级无回退事实 = 无需降级说明（计算口径被完整尊重，非被降平台）
    expect(platformCountryFallbackNote(OZON_3P, 'RU')).toBeNull();
  });

  it('回看落地后再查同口径：own 价仍 395、渠道仍 OZON 3P，不漂移到平台池 333', async () => {
    const state = ruAdvantageShopState();
    const first = await runAgent('RU 价格优势', buildAgentContext('dashboard', state, []));
    const card = first.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage')!;
    const patch = advantageScopePatch(state, card.rows);
    // FiltersContext.set 同国语义：patch 字段落地（剥离 undefined 后 spread）
    const landed: FiltersState = { ...state, ...patch, platform: patch.platform ?? null } as FiltersState;
    const again = await runAgent('RU 价格优势', buildAgentContext('dashboard', landed, []));
    const cardAgain = again.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage')!;
    const rows19 = cardAgain.rows.filter((row) => row.weekId === '202619');
    expect(rows19.length).toBe(card.rows.filter((row) => row.weekId === '202619').length);
    expect(rows19.every((row) => row.own.price === 395)).toBe(true);
    expect(rows19.every((row) => row.channelLabel === 'OZON 3P')).toBe(true);
  });
});
