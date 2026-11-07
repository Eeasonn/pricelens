// ============================================================
// t428u R7 返修 · 七审 M2 scope 闭环（2026-11-07）真实链路回归
// （真实事实包、真实 runAgent 自然分类，零 mock、无 forcedIntent）。
//  六审 M2 只把平台表 spread 换成全平台口径（333/336/347）与表动作
//  openPatch 清空口径，但同一响应里 chart 序列 / 摘要 / chart 卡 openPatch
//  仍按页面每线口径（OZON 3P）计算——人工复看真实截图实锤：最新一条响应
//  「当前页面价格走势」chart 395（红柱）与紧随的「最新有价周平台比较」表
//  333/336/347 并存，同一响应内部 scope 自相矛盾。修复口径（core.ts
//  queryCards）：明确问「全平台/所有平台/全部平台/跨平台」时，查询态本身
//  切全平台（allPlatformQueryStateOf：全局平台与每线 main/compares 店铺口径
//  一并清空 = 自动：该国全部渠道每周最低价），chart 序列、摘要、平台表与
//  两卡 openPatch / followup prompt 全部同源同口径；页面原口径保留在
//  baseQueryState 仅供「与当前所选店铺口径（X）不同」透明披露。普通
// （非全平台）请求严格保持每线 > 全局 > 自动生效口径（395 不漂移）。
// 数据事实（fact_price_weekly · USD）：RU nova 14 12+256 黑 202619：
// OZON 1P 333 / DNS 336 / Mvideo 347 / OZON 3P 395；Mate X6 12+512 黑
// 202619：Mvideo 1184 / DNS 1210 / OZON 3P 1422。FR Mate X6 12+512 黑：
// 仅 Amazon 3P 有 202638–202642 五条，202642 = 1596（范围内更早周无价）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { buildSeries } from '../../dataModel/aggregate';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, PlatformSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { runAgent, buildAgentContext } from '../core';
import type { AgentResponse } from '../contracts';
import type { ChartResultCard, TableResultCard } from '../contracts';

const OZON_3P: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
const DNS_PLATFORM: PlatformSelection = { platforms: ['DNS'], shopIds: [], seller: null };
const FR_BOULANGER: PlatformSelection = { platforms: ['Boulanger'], shopIds: [], seller: null };

const novaBlack256 = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const mateBlack512 = dimProduct.find((row) => row.sku_id === 'own-huawei-mate-x6__12-512gb__black')!;
const NOVA_12256 = { modelId: 'own-huawei-nova-14', romram: novaBlack256.romram, skuIds: [novaBlack256.sku_id] };
const MATE_12512 = { modelId: 'own-huawei-mate-x6', romram: mateBlack512.romram, skuIds: [mateBlack512.sku_id] };

async function ask(state: FiltersState, text: string) {
  return runAgent(text, buildAgentContext('dashboard', state, []));
}

/** M2 场景态：nova 14 12+256 黑主品 · 全局勾 DNS 平台 · 每线钉 OZON 3P 店铺（评审原态） */
function ruNovaGlobalDnsPerLine3PState(): FiltersState {
  const cards = buildCards([NOVA_12256], { auto: true, countryCode: 'RU' });
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform: DNS_PLATFORM,
    mains: cards.map((card) => (card.main ? { ...card, main: { ...card.main, platform: OZON_3P } } : card)),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202619',
  };
}

/** 仅全局 DNS（无每线口径） */
function ruNovaGlobalDnsOnlyState(): FiltersState {
  return { ...ruNovaGlobalDnsPerLine3PState(), mains: buildCards([NOVA_12256], { auto: true, countryCode: 'RU' }) };
}

/** 全自动（无全局、无每线） */
function ruNovaAutoState(): FiltersState {
  return { ...ruNovaGlobalDnsPerLine3PState(), platform: null, mains: buildCards([NOVA_12256], { auto: true, countryCode: 'RU' }) };
}

/** 多产品：nova 与 Mate 各带每线 OZON 3P，全局 DNS */
function ruMultiProductPerLine3PState(): FiltersState {
  return {
    ...ruNovaGlobalDnsPerLine3PState(),
    mains: [
      { id: 'nova', main: { ...NOVA_12256, platform: OZON_3P }, compares: [] },
      { id: 'mate', main: { ...MATE_12512, platform: OZON_3P }, compares: [] },
    ] as FiltersState['mains'],
  };
}

/** M3 场景态：FR 页持有 Mate X6 12+512 黑 · 全局钉 Boulanger · 范围 202619–202642（多周） */
function frMateBoulangerState(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'FR',
    platform: FR_BOULANGER,
    mains: buildCards([MATE_12512], { auto: true, countryCode: 'FR' }),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202642',
  };
}

function chartOf(response: AgentResponse): ChartResultCard {
  const chart = response.cards.find((item): item is ChartResultCard => item.kind === 'chart');
  expect(chart).toBeTruthy();
  return chart!;
}

function tableOf(response: AgentResponse): TableResultCard {
  const table = response.cards.filter((item): item is TableResultCard => item.kind === 'table').pop();
  expect(table).toBeTruthy();
  return table!;
}

/** 整条响应序列化：摘要 + 每张卡的 note/series/rows/evidence——「任何地方都
 *  不出现 395」的断言对象（不偷偷改数，也不让旧口径残留在任何数据卡）。 */
function wholeResponseBody(response: AgentResponse): string {
  return [
    response.summary,
    ...response.cards.map((card) => 'note' in card ? `${card.note ?? ''}|${'series' in card ? JSON.stringify((card as ChartResultCard).series) : ''}|${'rows' in card ? JSON.stringify((card as TableResultCard).rows) : ''}|${card.evidence?.map((e) => e.detail).join(';') ?? ''}` : ''),
  ].join('\n');
}

/** 断言「全平台哪/最便宜」类响应的整条 scope 闭环：chart 数值、摘要披露、
 *  平台表 333/336/347、以及响应内 EVERY 卡的 EVERY open 动作 openPatch 都落
 *  全平台口径（platform=null + 每线口径清空）——不只检查平台表。
 *  expectedCaliber = 页面原口径的披露标签（每线 + 竞品回落全局口径并列）。 */
async function expectAllPlatformClosed(state: FiltersState, text: string, expectedCaliber: string) {
  const response = await ask(state, text);
  expect(response.intent).toBe('query');
  const chart = chartOf(response);
  const table = tableOf(response);
  // chart：全平台真实序列（W19 自动口径 = 各平台渠道内最低 333），绝无 395
  expect(chart.title).toBe('全平台价格走势');
  const novaSeries = chart.series.find((s) => s.label.includes('nova 14') && !s.label.includes('Pro'))!;
  expect(novaSeries.values).toHaveLength(1);
  expect(novaSeries.values[0].value).toBe(333);
  expect(chart.series.every((s) => s.values.every((p) => p.value !== 395))).toBe(true);
  // 透明披露：chart note 与摘要都点名与页面店铺口径不同
  expect(chart.note).toContain('本次已按全部平台口径计算');
  expect(chart.note).toContain(`与当前所选店铺口径（${expectedCaliber}）不同`);
  expect(response.summary).toContain('本次已按全部平台口径计算');
  // 平台表：全平台实际价目
  expect(table.rows.map((row) => row[0])).toEqual(['OZON', 'DNS', 'Mvideo']);
  expect(table.rows.map((row) => row[1])).toEqual(['333', '336', '347']);
  expect(table.note).toContain('本次按全部平台比较');
  // 整条响应（摘要 + 每卡 note/series/rows/evidence）不残留旧口径 395
  expect(wholeResponseBody(response).includes('395')).toBe(false);
  // 响应内每张卡的每个 open 动作都携带同一全平台 openPatch
  const openPatches = response.cards.flatMap((card) => (card.actions ?? []).filter((a) => a.kind === 'open').map((a) => a.filterPatch));
  expect(openPatches.length).toBeGreaterThanOrEqual(2);
  for (const patch of openPatches) {
    expect(patch?.platform).toBeNull();
    const novaMain = patch?.mains?.find((m) => m.main?.modelId === 'own-huawei-nova-14');
    expect(novaMain?.main?.platform ?? null).toBeNull();
    expect(novaMain?.main?.romram).toBe('12+256 GB');
    expect((novaMain?.compares ?? []).every((sel) => (sel.platform ?? null) === null)).toBe(true);
  }
  return { response, chart, table };
}

describe('七审 M2 · 同一响应 scope 闭环：全平台请求整条响应（chart/摘要/表/各卡 openPatch）统一全平台口径', () => {
  it('初问「全平台哪个平台最便宜？」：chart 333（非 395）、表 333/336/347、摘要披露、每卡 open 动作全平台 openPatch', async () => {
    await expectAllPlatformClosed(ruNovaGlobalDnsPerLine3PState(), '全平台哪个平台最便宜？', 'OZON 3P、DNS 独立站');
  });

  it('chart 数值 = 聚合引擎全平台口径真实输出（与逐线 3P 口径输出不同——不是手挑数字）', async () => {
    const state = ruNovaGlobalDnsPerLine3PState();
    const { chart } = await expectAllPlatformClosed(state, '全平台哪个平台最便宜？', 'OZON 3P、DNS 独立站');
    // 同一状态、同一范围下用引擎分别算「全平台口径」与「页面每线 3P 口径」：
    // 卡片 chart 必须逐一等于前者（scope 闭环）、且不等于后者（旧缺陷 395）
    const common = { scope: { countryCode: state.countryCode, industry: state.industry }, granularity: state.granularity, startBucket: state.rangeStart, endBucket: state.rangeEnd, currency: state.currency, agg: state.agg } as const;
    const group = { modelId: NOVA_12256.modelId, romram: NOVA_12256.romram, skuIds: NOVA_12256.skuIds, isOwn: true };
    const allPlatformEngine = buildSeries({ ...common, groups: [{ ...group, platform: null }] });
    const perLine3PEngine = buildSeries({ ...common, groups: [{ ...group, platform: OZON_3P }] });
    const cardValues = chart.series[0].values.map((p) => p.value);
    expect(cardValues).toEqual(allPlatformEngine[0].points.slice(-8).map((p) => p.price));
    expect(cardValues).not.toEqual(perLine3PEngine[0].points.slice(-8).map((p) => p.price));
    expect(perLine3PEngine[0].points[0].price).toBe(395);
  });

  it('『查看价差解释』followup 在原页面状态重放：整条响应同样全平台（chart 333 / 表 333/336/347 / 每卡 openPatch），无 395', async () => {
    const state = ruNovaGlobalDnsPerLine3PState();
    const first = await ask(state, '全平台哪个平台最便宜？');
    const followup = (tableOf(first).actions ?? []).find((a) => a.kind === 'followup');
    expect(followup?.prompt).toContain('全平台');
    await expectAllPlatformClosed(state, followup!.prompt!, 'OZON 3P、DNS 独立站');
  });

  it('chart 卡自身『解释趋势变化』followup prompt 自带「全平台」：重放同口径 333', async () => {
    const state = ruNovaGlobalDnsPerLine3PState();
    const first = await ask(state, '全平台哪个平台最便宜？');
    const followup = (chartOf(first).actions ?? []).find((a) => a.kind === 'followup');
    expect(followup?.prompt).toContain('全平台');
    const replay = await ask(state, followup!.prompt!);
    expect(replay.intent).toBe('query');
    const series = chartOf(replay).series.find((s) => s.label.includes('nova 14') && !s.label.includes('Pro'))!;
    expect(series.values[0].value).toBe(333);
    expect(wholeResponseBody(replay).includes('395')).toBe(false);
  });

  it('每卡 open 动作落地后再问：全平台仍 333/336/347；普通问法按落地后口径（自动）也 333/336/347，不回 3P 395', async () => {
    const state = ruNovaGlobalDnsPerLine3PState();
    const first = await ask(state, '全平台哪个平台最便宜？');
    for (const patch of first.cards.flatMap((card) => (card.actions ?? []).filter((a) => a.kind === 'open').map((a) => a.filterPatch))) {
      const landed: FiltersState = { ...state, ...(patch ?? {}) } as FiltersState;
      expect(landed.platform).toBeNull();
      const againAll = await ask(landed, '全平台哪个平台最便宜？');
      expect(tableOf(againAll).rows.map((row) => row[1])).toEqual(['333', '336', '347']);
      const againPlain = await ask(landed, '按当前所选店铺口径，哪个平台最便宜？');
      expect(tableOf(againPlain).rows.map((row) => row[1])).toEqual(['333', '336', '347']);
      expect(tableOf(againPlain).note).toContain('全部平台自动');
    }
  });

  it('六矩阵保真 · 每线 3P + 全局 DNS + 普通严格问法：chart 395 / 表 OZON 395 最低（当前店铺口径不被全平台逻辑反噬）', async () => {
    const state = ruNovaGlobalDnsPerLine3PState();
    const response = await ask(state, '按当前所选店铺口径，哪个平台最便宜？');
    expect(response.intent).toBe('query');
    const chart = chartOf(response);
    const novaSeries = chart.series.find((s) => s.label.includes('nova 14') && !s.label.includes('Pro'))!;
    expect(novaSeries.values[0].value).toBe(395);
    expect(chart.title).toBe('当前页面价格走势');
    expect(tableOf(response).rows).toEqual([['OZON', '395', '最低']]);
    expect(chart.note).not.toContain('全部平台口径计算');
  });

  it('六矩阵保真 · 仅全局 DNS（无每线）：全平台问法 chart/表 333/336/347；普通问法按 DNS 口径 chart/表 336', async () => {
    const state = ruNovaGlobalDnsOnlyState();
    await expectAllPlatformClosed(state, '全平台哪个平台最便宜？', 'DNS 独立站');
    const plain = await ask(state, '按当前所选店铺口径，哪个平台最便宜？');
    const novaSeries = chartOf(plain).series.find((s) => s.label.includes('nova 14') && !s.label.includes('Pro'))!;
    expect(novaSeries.values[0].value).toBe(336);
    expect(tableOf(plain).rows).toEqual([['DNS', '336', '最低']]);
  });

  it('六矩阵保真 · 全自动（无全局无每线）：全平台问法 chart 333 且不虚构「与所选口径不同」（本就自动口径）', async () => {
    const state = ruNovaAutoState();
    const response = await ask(state, '全平台哪个平台最便宜？');
    expect(response.intent).toBe('query');
    const chart = chartOf(response);
    const novaSeries = chart.series.find((s) => s.label.includes('nova 14') && !s.label.includes('Pro'))!;
    expect(novaSeries.values[0].value).toBe(333);
    expect(chart.note).not.toContain('与当前所选店铺口径');
    expect(tableOf(response).rows.map((row) => row[1])).toEqual(['333', '336', '347']);
    expect(tableOf(response).note).toContain('全部平台自动');
  });

  it('多产品全平台：chart 两系列 nova 333 / Mate 1184、逐产品表、每卡 openPatch 清空全部产品线口径', async () => {
    const state = ruMultiProductPerLine3PState();
    const response = await ask(state, '全平台哪个平台最便宜？');
    expect(response.intent).toBe('query');
    const chart = chartOf(response);
    const table = tableOf(response);
    expect(table.title).toBe('最新有价周平台比较（逐产品）');
    const novaSeries = chart.series.find((s) => s.label.includes('nova 14') && !s.label.includes('Pro'))!;
    const mateSeries = chart.series.find((s) => s.label.includes('Mate X6'))!;
    expect(novaSeries.values[0].value).toBe(333);
    expect(mateSeries.values[0].value).toBe(1184);
    expect(chart.series.every((s) => s.values.every((p) => p.value !== 395 && p.value !== 1422))).toBe(true);
    const novaRows = table.rows.filter((row) => row[0].includes('nova 14') && !row[0].includes('Pro'));
    const mateRows = table.rows.filter((row) => row[0].includes('Mate X6'));
    expect(novaRows[0][2]).toBe('333');
    expect(mateRows[0][2]).toBe('1,184');
    expect(wholeResponseBody(response).includes('395')).toBe(false);
    const openPatches = response.cards.flatMap((card) => (card.actions ?? []).filter((a) => a.kind === 'open').map((a) => a.filterPatch));
    expect(openPatches.length).toBeGreaterThanOrEqual(2);
    for (const patch of openPatches) {
      expect(patch?.platform).toBeNull();
      for (const modelId of ['own-huawei-nova-14', 'own-huawei-mate-x6']) {
        const main = patch?.mains?.find((m) => m.main?.modelId === modelId);
        expect(main?.main?.platform ?? null).toBeNull();
      }
    }
  });

  it('多周全平台真实聚合（FR Mate X6 · 202619–202642 仅 202638–202642 有价）：chart 末值 1596、空周如实 null、= 引擎全平台输出', async () => {
    const state = frMateBoulangerState();
    const response = await ask(state, '全平台哪个平台最便宜？');
    expect(response.intent).toBe('query');
    const chart = chartOf(response);
    const table = tableOf(response);
    const series = chart.series.find((s) => s.label.includes('Mate X6'))!;
    const values = series.values.map((p) => p.value);
    // 尾 8 桶（202635–202642）：前三周无价 null，202638–202642 五周有价、末值 1596
    expect(values).toHaveLength(8);
    expect(values.slice(0, 3).every((v) => v === null)).toBe(true);
    expect(values.slice(3).every((v) => v != null)).toBe(true);
    expect(values[values.length - 1]).toBe(1596);
    // 与引擎全平台口径逐一相等（真实聚合，不是手挑数字）
    const engine = buildSeries({
      scope: { countryCode: 'FR', industry: state.industry },
      groups: [{ modelId: MATE_12512.modelId, romram: MATE_12512.romram, skuIds: MATE_12512.skuIds, isOwn: true, platform: null }],
      granularity: state.granularity, startBucket: state.rangeStart, endBucket: state.rangeEnd, currency: state.currency, agg: state.agg,
    });
    expect(values).toEqual(engine[0].points.slice(-8).map((p) => p.price));
    // 表按最新有价周 202642 Amazon 1596，披露与全局 Boulanger 口径不同
    expect(table.rows[0]).toEqual(['Amazon', '1,596', '最低']);
    expect(table.note).toContain('202642');
    expect(table.note).toContain('本次按全部平台比较');
    expect(chart.note).toContain('本次已按全部平台口径计算');
    // 每卡 open 动作：全局 Boulanger 一并清空
    const openPatches = response.cards.flatMap((card) => (card.actions ?? []).filter((a) => a.kind === 'open').map((a) => a.filterPatch));
    for (const patch of openPatches) expect(patch?.platform).toBeNull();
  });

  it('普通趋势（非全平台）口径保持：『价格趋势』在每线 3P + 全局 DNS 下 chart 仍 395', async () => {
    const state = ruNovaGlobalDnsPerLine3PState();
    const response = await ask(state, '价格趋势');
    expect(response.intent).toBe('query');
    const novaSeries = chartOf(response).series.find((s) => s.label.includes('nova 14') && !s.label.includes('Pro'))!;
    expect(novaSeries.values[0].value).toBe(395);
  });
});
