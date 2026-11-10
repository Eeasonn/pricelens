// ============================================================
// t428u R6（六审增量 · 2026-11-07）真实 3P 计算口径回归（真实事实数据、
// 真实 runAgent / buildPriceAdvantageResult / advantageScopePatch，零 mock）。
// matrix-only（2026-11-10）重锚：旧证人 nova 14（非 Pro）12+256 在 RU 无矩阵
// 对比位（优势恒 0 行），主品改用矩阵覆盖的 nova 15 12+256 黑。数值锚点全部
// 从真实事实包重导出：
//  - 趋势证人（W202619，每线 OZON 3P）：nova 15 12+256 黑 OZON 3P 事实
//    33915₽/74.8161 = 453.31 → 453；自动混池 = DNS/Mvideo 25299₽/73.81 =
//    342.76 → 343（OZON 1P 693.67 不参与最低）——「留 3P 口径却按平台池计算」
//    的错值得 343，本文件仍用真实链路证明迭代线真按选中店铺取数。
//  - 优势证人（W202645，全局 OZON 3P 店铺勾选）：own OZON 3P min(478.07,
//    478.31) → 478；矩阵对手 HONOR 600 12+256 同周 OZON 3P 54990₽/81.93 =
//    671.18 → 671 → 价差 +193 占优（混池 427 会把价差洗成 +244）。
//  - 口径来源（R4 三审返修统一，不另造引擎）：趋势 queryCards 与价格优势都经
//    共享 effectiveLinePlatform 解析（每线 selection.platform > 全局
//    state.platform > 自动），价格页图表同源；两者经 effectiveChannelIds 严格
//    交集解析。
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
const nova15Row = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-15__12-256gb__black')!;
const NOVA15 = { modelId: 'own-huawei-nova-15', romram: nova15Row.romram, skuIds: [nova15Row.sku_id] };

/** RU 页 · nova 15 主品（每线挂 OZON 3P 店铺口径 = 价格页店铺同步后的形态）· W202619 */
function ruTrendShopState(): FiltersState {
  const cards = buildCards([NOVA15], { auto: true, countryCode: 'RU' });
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

/** RU 页 · nova 15 主品 · 全局 OZON 3P 店铺勾选（总览 PlatformBox / URL shop= 形态）· W202645 */
function ruAdvantageShopState(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform: OZON_3P,
    mains: buildCards([NOVA15], { auto: true, countryCode: 'RU' }),
    adaptive: false,
    rangeStart: '202645',
    rangeEnd: '202645',
  };
}

describe('R6 · 趋势查询真实 3P 价格（runAgent → queryCards → buildSeries，零 mock）', () => {
  it('chart 与最新表 = 453（453.31 取整），取数口径点名 OZON 3P，绝非混池 343', async () => {
    const response = await runAgent('价格趋势', buildAgentContext('dashboard', ruTrendShopState(), []));
    expect(response.intent).toBe('query');
    const chart = response.cards.find((item): item is ChartResultCard => item.kind === 'chart');
    const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
    expect(chart).toBeTruthy();
    expect(table).toBeTruthy();
    // 主品系列（main 在前）：单周范围 → 一个点，值 = 453
    const novaEntry = chart!.series.find((s) => s.label.includes('nova 15'));
    expect(novaEntry).toBeTruthy();
    expect(novaEntry!.values).toEqual([{ bucket: '05-06', value: 453 }]);
    // 最新价格摘要表首行 = 主品：最新价 453、取数口径 OZON 3P（透明点名渠道）
    expect(table!.rows[0][0]).toContain('nova 15');
    expect(table!.rows[0][1]).toBe('453');
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
  it('week202645 行 own 价 = 478、渠道点名 OZON 3P；对 HONOR 600（3P 671）为「占优」——混池 427 会把价差洗成 +244', async () => {
    const state = ruAdvantageShopState();
    const response = await runAgent('RU 价格优势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('price_advantage');
    const card = response.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage');
    expect(card).toBeTruthy();
    const rows45 = card!.rows.filter((row) => row.weekId === '202645');
    expect(rows45.length).toBeGreaterThan(0);
    // 全部 202645 行 own 价 = 478：只要任何一行是 427 就是「留 3P 算混池」
    expect(rows45.every((row) => row.own.price === 478)).toBe(true);
    expect(rows45.every((row) => row.own.price === 427)).toBe(false);
    expect(rows45.every((row) => row.channelLabel === 'OZON 3P')).toBe(true);
    // HONOR 600 12+256 在 OZON 3P 同周 54990₽/81.93 = 671.18（点价 671）：严格
    // 3P 下我司 478 占优 +193；若口径被扩大成平台池（own=427）价差虚增成 +244
    const honorRow = rows45.find((row) => row.competitor.modelId === 'cmp-honor-600');
    expect(honorRow).toBeTruthy();
    expect(honorRow!.competitor.price).toBe(671);
    expect(honorRow!.priceDiff).toBe(671 - 478);
    expect(honorRow!.relation).toBe('advantage');
  });

  it('PriceAdvantageRow 实际结构如实断言（不编造字段）', async () => {
    const response = await runAgent('RU 价格优势', buildAgentContext('dashboard', ruAdvantageShopState(), []));
    const card = response.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage')!;
    const row = card.rows[0];
    expect(row).toBeTruthy();
    expect(row.own).toMatchObject({ modelId: 'own-huawei-nova-15', skuId: 'own-huawei-nova-15__12-256gb__black', price: 478 });
    expect(row.competitor).toMatchObject({ modelId: expect.any(String), price: expect.any(Number) });
    expect(row.weekId).toBe('202645');
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
    expect(patch.rangeStart).toBe('202645');
    expect(patch.rangeEnd).toBe('202645');
    expect(patch.mains?.some((cardItem) => cardItem.main?.modelId === 'own-huawei-nova-15')).toBe(true);
    // 同国店铺级无回退事实 = 无需降级说明（计算口径被完整尊重，非被降平台）
    expect(platformCountryFallbackNote(OZON_3P, 'RU')).toBeNull();
  });

  it('回看落地后再查同口径：own 价仍 478、渠道仍 OZON 3P，不漂移到平台池 427', async () => {
    const state = ruAdvantageShopState();
    const first = await runAgent('RU 价格优势', buildAgentContext('dashboard', state, []));
    const card = first.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage')!;
    const patch = advantageScopePatch(state, card.rows);
    // FiltersContext.set 同国语义：patch 字段落地（剥离 undefined 后 spread）
    const landed: FiltersState = { ...state, ...patch, platform: patch.platform ?? null } as FiltersState;
    const again = await runAgent('RU 价格优势', buildAgentContext('dashboard', landed, []));
    const cardAgain = again.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage')!;
    const rows45 = cardAgain.rows.filter((row) => row.weekId === '202645');
    expect(rows45.length).toBe(card.rows.filter((row) => row.weekId === '202645').length);
    expect(rows45.every((row) => row.own.price === 478)).toBe(true);
    expect(rows45.every((row) => row.channelLabel === 'OZON 3P')).toBe(true);
  });
});
