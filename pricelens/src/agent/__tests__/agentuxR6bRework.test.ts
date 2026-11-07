// ============================================================
// t428u R6b 返修（五审增量 3Major/1Minor · 2026-11-07）真实链路回归
// （真实事实包、真实 runAgent 自然分类，零 mock、无 forcedIntent）：
//  - 五审 M1 Major · 配置绑定语法与置信门：支持配置前置实体
//    （「12+256GB nova 14 和 12+512GB Mate X6」恰好两组 333+1184，绝不把
//    Mate 的 512 归给 nova 混出 370/DNS 第三组）；明确「分别」按实体顺序与
//    配置顺序一一对应（页面初始 512 / 256 均恰好 nova 333 + Mate 1184、
//    不再虚假声称请求 Mate 256 缺失）；无效 99+999 前置 nova 时只 Mate 1184
//    + nova 缺失如实披露，绝不被另一实体的 512「救活」；「分别」数量不匹配
//    返回诚实澄清（不生成可污染看板的卡），不再冒答。
//  - 五审 M2 Major · 平台表生效口径：每条产品线在 effectiveLinePlatform
//    （每线 > 全局 > 自动）内聚合——全局 DNS + 每线 OZON 3P 下问「按当前
//    所选店铺口径哪个平台最便宜」严格 OZON 395（3P），不以整平台 1P 333
//    冒充；明确问全平台允许透明切换但必须说明与所选店铺口径不同；无 scope
//    默认全平台（333/336/347）仍合法；scope 内全程无价不静默扩大口径。
//  - 五审 M3 Major · 多产品平台比较逐产品投影：2 产品各带产品列/各自 SKU
//    配置/口径/最新有价周，明确 nova 最低 OZON 333、Mate 最低 Mvideo 1184，
//    不再 selections[0] 只答 first；同型号不同配置/整配置也独立成组。
//  - 五审 m1 Minor · 真实最近有价周：Y63 范围 202619–202642 尾周 202642 无价
//    → 实际按 202638（Mvideo 136.31→136）回答并标注，不拿日历尾周伪装；
//    多产品各自最新有价周不同（nova 202642 vs Y63 202638）逐产品标注。
// 数据事实（fact_price_weekly · RU · USD）：nova 14 12+256 黑 202619：
// OZON 1P 332.62（333）/ DNS 335.98（336）/ Mvideo 346.82（347）/ OZON 3P
// 394.59（395）；202642 仅 DNS 345.06（345）；RU:mvideo:3P 全程零事实行。
// Mate X6 12+512 黑 202619：Mvideo 1184.11（1184）/ DNS 1209.85（1210）/
// OZON 3P 1422.29（1422）。nova Y63 6+128 黑：最后有价周 202638 Mvideo
// 136.31（136）。nova 14 12+512 黑 202619 自动 = DNS 369.86（370）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, dimTime } from '../../data';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, PlatformSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { latestPricedWeekOfSelection, platformPriceSpreadOfSelection } from '../../dataModel/aggregate';
import { runAgent, buildAgentContext } from '../core';
import type { ChartResultCard, TableResultCard } from '../contracts';

const OZON_3P: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
const DNS_PLATFORM: PlatformSelection = { platforms: ['DNS'], shopIds: [], seller: null };
const MVIDEO_3P: PlatformSelection = { platforms: [], shopIds: ['RU:mvideo:3P'], seller: null };

const novaBlack256 = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const novaBlack512 = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-512gb__black')!;
const y63Black = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-y63__6-128gb__black')!;
const mateBlack512 = dimProduct.find((row) => row.sku_id === 'own-huawei-mate-x6__12-512gb__black')!;
const NOVA_12256 = { modelId: 'own-huawei-nova-14', romram: novaBlack256.romram, skuIds: [novaBlack256.sku_id] };
const NOVA_12512 = { modelId: 'own-huawei-nova-14', romram: novaBlack512.romram, skuIds: [novaBlack512.sku_id] };
const Y63 = { modelId: 'own-huawei-nova-y63', romram: y63Black.romram, skuIds: [y63Black.sku_id] };

/** 评审复现初始态 A：页面持有 nova 14 12+512（URL ?c=RU&main=…12+512GB&rs=202619） */
function ruHolding12512State(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform: null,
    mains: buildCards([NOVA_12512], { auto: true, countryCode: 'RU' }),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202619',
  };
}

/** 评审复现初始态 B：页面持有 nova 14 12+256（不同初始配置不改变解析结果） */
function ruHolding12256State(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform: null,
    mains: buildCards([NOVA_12256], { auto: true, countryCode: 'RU' }),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202619',
  };
}

/** M2 场景态：nova 14 12+256 黑主品 · 全局勾 DNS 平台 · 每线钉 OZON 3P 店铺 */
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

async function ask(state: FiltersState, text: string) {
  return runAgent(text, buildAgentContext('dashboard', state, []));
}

async function trendOf(state: FiltersState, text: string) {
  const response = await ask(state, text);
  expect(response.intent).toBe('query');
  const chart = response.cards.find((item): item is ChartResultCard => item.kind === 'chart');
  const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
  expect(chart).toBeTruthy();
  expect(table).toBeTruthy();
  return { chart: chart!, table: table!, response };
}

async function platformTableOf(state: FiltersState, text: string) {
  const response = await ask(state, text);
  expect(response.intent).toBe('query');
  const table = response.cards.filter((item): item is TableResultCard => item.kind === 'table').pop();
  expect(table).toBeTruthy();
  return { table: table!, response };
}

/** 两组共用断言：恰好 nova 14/12+256（333/OZON）+ Mate X6/12+512（1184/Mvideo） */
function expectExactlyNova256Mate512(chart: ChartResultCard, table: TableResultCard) {
  expect(chart.series).toHaveLength(2);
  expect(table.rows).toHaveLength(2);
  const novaRow = table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro') && !row[0].includes('14i'))!;
  const mateRow = table.rows.find((row) => row[0].includes('Mate X6'))!;
  expect(novaRow[0]).toContain('12+256');
  expect(novaRow[1]).toBe('333');
  expect(novaRow[3]).toBe('OZON');
  expect(mateRow[0]).toContain('12+512');
  expect(mateRow[1]).toBe('1,184');
  expect(mateRow[3]).toBe('Mvideo');
  const body = `${chart.note}\n${table.note}\n${table.rows.flat().join('|')}`;
  expect(body.includes('370')).toBe(false);
  expect(body.includes('DNS')).toBe(false);
  expect(body.includes('14i')).toBe(false);
}

describe('五审 M1 · 配置前置实体绑定（不再一律归最近前置）', () => {
  it('forward 前置完整 GB：「RU 12+256GB nova 14 和 12+512GB Mate X6 价格趋势」恰好两组 333+1184', async () => {
    const { chart, table } = await trendOf(ruHolding12512State(), 'RU 12+256GB nova 14 和 12+512GB Mate X6 价格趋势');
    expectExactlyNova256Mate512(chart, table);
  });

  it('forward 前置省 GB：「RU 12+256 nova 14 和 12+512 Mate X6 价格趋势」同样恰好两组', async () => {
    const { chart, table } = await trendOf(ruHolding12256State(), 'RU 12+256 nova 14 和 12+512 Mate X6 价格趋势');
    expectExactlyNova256Mate512(chart, table);
  });

  it('open 落地 mains 恰好两主品；落地后再问仍恰好两组（不污染看板）', async () => {
    const state = ruHolding12512State();
    const { chart, table } = await trendOf(state, 'RU 12+256GB nova 14 和 12+512GB Mate X6 价格趋势');
    for (const card of [chart, table]) {
      const open = (card.actions ?? []).find((action) => action.kind === 'open');
      expect(open?.filterPatch?.mains).toHaveLength(2);
      const novaMain = open?.filterPatch?.mains?.find((m) => m.main?.modelId === 'own-huawei-nova-14');
      const mateMain = open?.filterPatch?.mains?.find((m) => m.main?.modelId === 'own-huawei-mate-x6');
      expect(novaMain?.main?.romram).toBe('12+256 GB');
      expect(mateMain?.main?.romram).toBe('12+512 GB');
    }
    const landed: FiltersState = {
      ...state,
      ...((chart.actions ?? []).find((action) => action.kind === 'open')?.filterPatch ?? {}),
    } as FiltersState;
    const again = await trendOf(landed, 'RU 12+256GB nova 14 和 12+512GB Mate X6 价格趋势');
    expectExactlyNova256Mate512(again.chart, again.table);
  });

  it('无效 99+999 前置 nova：只 Mate 1184/Mvideo + nova 99+999 如实缺失，绝不被 Mate 的 512 救活出 370', async () => {
    const { chart, table, response } = await trendOf(ruHolding12256State(), 'RU 99+999 nova 14 和 12+512GB Mate X6 价格趋势');
    expect(chart.series).toHaveLength(1);
    expect(chart.series[0].label.includes('Mate X6')).toBe(true);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0][1]).toBe('1,184');
    expect(table.rows[0][3]).toBe('Mvideo');
    expect(response.summary).toContain('99+999');
    expect(response.summary).toContain('部分完成');
    const body = `${chart.note}\n${table.note}\n${table.rows.flat().join('|')}\n${response.summary}`;
    expect(body.includes('370')).toBe(false);
    expect(table.rows.some((row) => row[0].includes('nova 14'))).toBe(false);
  });
});

describe('五审 M1 · 明确「分别」按顺序一一对应（页面初始配置无关）', () => {
  it.each([
    ['页面初始 12+512', () => ruHolding12512State()],
    ['页面初始 12+256', () => ruHolding12256State()],
  ])('「%s」下分别问 → nova 333/OZON + Mate 1184/Mvideo，无虚假 Mate 256 缺失', async (_tag, makeState) => {
    const { chart, table, response } = await trendOf(makeState(), 'RU nova 14 和 Mate X6 分别是12+256和12+512的价格趋势');
    expectExactlyNova256Mate512(chart, table);
    // 旧缺陷：把两个配置都归 Mate → nova 复用页面 512/370 + 虚假声称请求 Mate 256 缺失
    expect(response.summary).not.toContain('部分完成');
    expect(table.note).not.toContain('Mate X6 12+256');
    const body = `${response.summary}\n${chart.note}\n${table.note}`;
    expect(body.includes('没有在架型号配置')).toBe(false);
  });

  it('英文对应「respectively」不触发一一对应（非「分别」关键字），后置语法仍逐实体归属', async () => {
    const { chart, table } = await trendOf(ruHolding12512State(), 'RU nova 14 12+256 and Mate X6 12+512 respectively 价格趋势');
    expectExactlyNova256Mate512(chart, table);
  });
});

describe('五审 M1 · 「分别」数量不匹配 → 诚实澄清（不冒答、不生成卡）', () => {
  it('2 型号对 1 配置：「RU nova 14 和 Mate X6 分别是12+256的价格趋势」→ clarify', async () => {
    const response = await ask(ruHolding12512State(), 'RU nova 14 和 Mate X6 分别是12+256的价格趋势');
    expect(response.intent).toBe('clarify');
    expect(response.cards).toHaveLength(0);
    expect(response.summary).toContain('一一对应');
    expect(response.summary).toContain('2 个型号');
    expect(response.summary).toContain('1 个配置');
    // 不生成可污染看板的 patch/建议是可点的规范化问法
    expect(response.cards.every((card) => !('filterPatch' in card) || card.filterPatch == null)).toBe(true);
    expect((response.suggestionActions ?? []).length).toBeGreaterThan(0);
  });

  it('3 型号对 2 配置：「nova 14、Mate X6 和 nova 14 Pro 分别是 12+256 和 12+512」→ clarify', async () => {
    const response = await ask(ruHolding12512State(), 'RU nova 14、Mate X6 和 nova 14 Pro 分别是 12+256 和 12+512 的价格趋势');
    expect(response.intent).toBe('clarify');
    expect(response.cards).toHaveLength(0);
    expect(response.summary).toContain('数量不一致');
  });

  it('澄清后正常问法仍可答（置信门不破坏常规链路）', async () => {
    const response = await ask(ruHolding12512State(), 'RU nova 14 12+256 和 Mate X6 12+512 价格趋势');
    expect(response.intent).toBe('query');
    const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
    expect(table?.rows).toHaveLength(2);
  });

  it('未点产品/只型号默认行为不被破坏：只问「RU nova 14 价格趋势」仍复用页面该型号选择', async () => {
    const { chart, table } = await trendOf(ruHolding12512State(), 'RU nova 14 价格趋势');
    expect(chart.series.some((s) => s.label.includes('nova 14') && s.label.includes('12+512'))).toBe(true);
    expect(table.rows[0][1]).toBe('370');
    expect(table.rows[0][3]).toBe('DNS');
  });
});

describe('五审 M2 · 平台表遵循生效店铺口径（每线 > 全局 > 自动）', () => {
  it('全局 DNS + 每线 OZON 3P：问「按当前所选店铺口径，哪个平台最便宜？」→ 严格 OZON 395，绝不 333', async () => {
    const { table, response } = await platformTableOf(ruNovaGlobalDnsPerLine3PState(), '按当前所选店铺口径，哪个平台最便宜？');
    expect(table.title).toBe('最新有价周平台比较');
    expect(table.rows).toEqual([['OZON', '395', '最低']]);
    expect(table.note).toContain('OZON 3P');
    expect(table.note).toContain('未混入口径外平台/渠道价');
    expect(table.note).toContain('与全平台比较不同');
    expect((table.note ?? '').includes('333')).toBe(false);
    expect((table.note ?? '').includes('DNS')).toBe(false);
    expect(table.evidence?.[0]?.detail).toContain('OZON 3P');
    // 趋势同口径（R4 统一不被破坏）：每线 3P 优先于全局 DNS
    const trend = await trendOf(ruNovaGlobalDnsPerLine3PState(), '价格趋势');
    const novaRow = trend.table.rows.find((row) => row[0].includes('nova 14'))!;
    expect(novaRow[1]).toBe('395');
    expect(novaRow[3]).toBe('OZON 3P');
    void response;
  });

  it('同一状态明确问「全平台哪个平台最便宜？」→ 透明切全平台（OZON 333 最低）并说明与所选店铺口径不同', async () => {
    const { table } = await platformTableOf(ruNovaGlobalDnsPerLine3PState(), '全平台哪个平台最便宜？');
    expect(table.rows[0]).toEqual(['OZON', '333', '最低']);
    expect(table.rows.map((row) => row[0])).toEqual(['OZON', 'DNS', 'Mvideo']);
    expect(table.rows[1][1]).toBe('336');
    expect(table.rows[2][1]).toBe('347');
    expect(table.note).toContain('本次按全部平台比较');
    expect(table.note).toContain('与当前所选店铺口径（OZON 3P）不同');
  });

  it('open 落地（全局 DNS + 每线 3P 保留）后再问仍严格 OZON 395，不漂移', async () => {
    const state = ruNovaGlobalDnsPerLine3PState();
    const first = await platformTableOf(state, '按当前所选店铺口径，哪个平台最便宜？');
    const open = (first.table.actions ?? []).find((action) => action.kind === 'open');
    const landed: FiltersState = { ...state, ...(open?.filterPatch ?? {}) } as FiltersState;
    const again = await platformTableOf(landed, '按当前所选店铺口径，哪个平台最便宜？');
    expect(again.table.rows).toEqual([['OZON', '395', '最低']]);
  });

  it('无 scope 默认全平台仍合法：黑 SKU 问「哪个平台最便宜？」→ OZON 333/DNS 336/Mvideo 347', async () => {
    const { table } = await platformTableOf(ruHolding12256State(), '哪个平台最便宜？');
    expect(table.rows.map((row) => row[0])).toEqual(['OZON', 'DNS', 'Mvideo']);
    expect(table.rows[0]).toEqual(['OZON', '333', '最低']);
    expect(table.rows[1][1]).toBe('336');
    expect(table.rows[2][1]).toBe('347');
    expect(table.note).toContain('全部平台自动');
  });

  it('口径内全程无价不静默扩大：nova 12+256 每线钉 Mvideo 3P（零事实行）→ 空表 + 如实说明', async () => {
    const cards = buildCards([NOVA_12256], { auto: true, countryCode: 'RU' });
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: null,
      mains: cards.map((card) => (card.main ? { ...card, main: { ...card.main, platform: MVIDEO_3P } } : card)),
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202619',
    };
    const { table } = await platformTableOf(state, '按当前所选店铺口径，哪个平台最便宜？');
    expect(table.rows).toEqual([]);
    expect(table.note).toContain('没有可比较的平台价格数据');
    expect(table.note).toContain('没有扩大口径');
    // 绝不偷偷扩大 scope 拿其他渠道价（DNS 336 / OZON 333 都不出现）
    expect((table.note ?? '').includes('333')).toBe(false);
    expect((table.note ?? '').includes('336')).toBe(false);
  });
});

describe('五审 M3 · 明确多产品分别比平台：逐产品投影（不再只答 first）', () => {
  it('「RU nova 14 12+256 和 Mate X6 12+512 分别哪个平台最便宜？」→ 6 行两组：nova 最低 OZON 333、Mate 最低 Mvideo 1184', async () => {
    const { table, response } = await platformTableOf(ruHolding12512State(), 'RU nova 14 12+256 和 Mate X6 12+512 分别哪个平台最便宜？');
    expect(table.title).toBe('最新有价周平台比较（逐产品）');
    expect(table.columns).toEqual(['产品', '平台', '最低价', '相对最低价']);
    expect(table.rows).toHaveLength(6);
    // nova 组（前三行）：OZON 333 最低 / DNS 336 / Mvideo 347，产品列可辨
    const novaRows = table.rows.filter((row) => row[0].includes('nova 14') && !row[0].includes('Pro'));
    expect(novaRows).toHaveLength(3);
    expect(novaRows[0]).toEqual([novaRows[0][0], 'OZON', '333', '最低']);
    expect(novaRows[1][1]).toBe('DNS');
    expect(novaRows[1][2]).toBe('336');
    expect(novaRows[2][1]).toBe('Mvideo');
    // Mate 组（后三行）：Mvideo 1184 最低 / DNS 1210 / OZON 1422
    const mateRows = table.rows.filter((row) => row[0].includes('Mate X6'));
    expect(mateRows).toHaveLength(3);
    expect(mateRows[0]).toEqual([mateRows[0][0], 'Mvideo', '1,184', '最低']);
    expect(mateRows[1][1]).toBe('DNS');
    expect(mateRows[1][2]).toBe('1,210');
    expect(mateRows[2][1]).toBe('OZON');
    expect(mateRows[2][2]).toBe('1,422');
    // 说明逐产品点名最低平台与口径，并声明跨产品不可直接比较
    expect(table.note).toContain('最便宜平台 OZON 333');
    expect(table.note).toContain('最便宜平台 Mvideo 1,184');
    expect(table.note).toContain('跨产品价格不可直接比较');
    // open 携带两主品各自配置
    const open = (table.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.mains).toHaveLength(2);
    expect(open?.filterPatch?.mains?.some((m) => m.main?.modelId === 'own-huawei-nova-14' && m.main?.romram === '12+256 GB')).toBe(true);
    expect(open?.filterPatch?.mains?.some((m) => m.main?.modelId === 'own-huawei-mate-x6' && m.main?.romram === '12+512 GB')).toBe(true);
    // 摘要如实说整理 2 个产品（不再说 2 却只答 1）
    expect(response.summary).toContain('2 个产品');
  });

  it('受控整配置 + 单 SKU 混合也各自成组：整配置 nova（DNS 336 均值口径）不被 Mate 黑 SKU 组吞', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: null,
      mains: [
        { id: 'whole', main: { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: [], platform: null }, compares: [] },
        { id: 'mate', main: { modelId: 'own-huawei-mate-x6', romram: mateBlack512.romram, skuIds: [mateBlack512.sku_id], platform: null }, compares: [] },
      ],
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202619',
    };
    const { table } = await platformTableOf(state, '哪个平台最便宜？');
    const novaRows = table.rows.filter((row) => row[0].includes('nova 14'));
    const mateRows = table.rows.filter((row) => row[0].includes('Mate X6'));
    expect(novaRows).toHaveLength(3);
    expect(mateRows).toHaveLength(3);
    expect(novaRows[0][1]).toBe('DNS');
    expect(novaRows[0][2]).toBe('336');
    expect(table.note).toContain('整配置');
    expect(mateRows[0][1]).toBe('Mvideo');
    expect(mateRows[0][2]).toBe('1,184');
  });

  it('同型号不同配置也独立成组：nova 12+256（333 组）与 nova 12+512（370 组）都在', async () => {
    const { table } = await platformTableOf(ruHolding12512State(), 'RU nova 14 12+256 和 12+512 分别哪个平台最便宜？');
    const rows256 = table.rows.filter((row) => row[0].includes('12+256'));
    const rows512 = table.rows.filter((row) => row[0].includes('12+512'));
    expect(rows256.length).toBeGreaterThan(0);
    expect(rows512.length).toBeGreaterThan(0);
    expect(rows256[0][2]).toBe('333');
    expect(rows512[0][2]).toBe('370');
  });
});

describe('五审 m1 · 真实最近有价周（不拿日历尾周伪装）', () => {
  const allWeeks = dimTime.map((t) => t.week_id);

  it('latestPricedWeekOfSelection：Y63 全范围 → 202638（尾周 202642 无 RU 价）；nova 12+256 黑 → 202642', () => {
    expect(latestPricedWeekOfSelection(Y63, allWeeks, 'RU', 'usd')).toBe('202638');
    expect(latestPricedWeekOfSelection(NOVA_12256, allWeeks, 'RU', 'usd')).toBe('202642');
  });

  it('scope 内全程无价 → null（不静默扩大 scope、不跑出范围）', () => {
    expect(latestPricedWeekOfSelection(NOVA_12256, allWeeks, 'RU', 'usd', MVIDEO_3P)).toBeNull();
    expect(latestPricedWeekOfSelection(NOVA_12256, ['202642'], 'RU', 'usd', OZON_3P)).toBeNull();
  });

  it('Y63 自然问「哪个平台最便宜？」→ Mvideo 136 且明确 week 202638，不谎称 202642', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: null,
      mains: buildCards([Y63], { auto: true, countryCode: 'RU' }),
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202642',
    };
    const { table } = await platformTableOf(state, '哪个平台最便宜？');
    expect(table.rows).toEqual([['Mvideo', '136', '最低']]);
    expect(table.note).toContain('202638');
    expect((table.note ?? '').includes('202642')).toBe(false);
    expect(table.evidence?.[0]?.detail).toContain('202638');
  });

  it('多产品各自最新有价周不同（nova 202642 vs Y63 202638）：逐产品标注，不用一个 first 日期', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: null,
      mains: [
        { id: 'nova', main: { ...NOVA_12256, platform: null }, compares: [] },
        { id: 'y63', main: { ...Y63, platform: null }, compares: [] },
      ],
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202642',
    };
    const { table } = await platformTableOf(state, '哪个平台最便宜？');
    expect(table.rows).toHaveLength(2);
    const novaRow = table.rows.find((row) => row[0].includes('nova 14'))!;
    const y63Row = table.rows.find((row) => row[0].includes('Y63'))!;
    expect(novaRow[1]).toBe('DNS');
    expect(novaRow[2]).toBe('345');
    expect(y63Row[1]).toBe('Mvideo');
    expect(y63Row[2]).toBe('136');
    expect(table.note).toContain('nova 14');
    expect(table.note).toContain('202642');
    expect(table.note).toContain('Y63');
    expect(table.note).toContain('202638');
  });
});

describe('五审 M2 · aggregate 层平台 helper 生效口径（真正计算值）', () => {
  it('platformPriceSpreadOfSelection：OZON 3P 店铺口径 → 仅 OZON 394.59（3P），绝不 1P 332.62 冒充', () => {
    const scoped = platformPriceSpreadOfSelection(NOVA_12256, '202619', 'RU', 'usd', OZON_3P);
    expect(scoped.members).toBe(1);
    expect(scoped.rows).toHaveLength(1);
    expect(scoped.rows[0].platform).toBe('OZON');
    expect(scoped.rows[0].price).toBeCloseTo(394.59, 2);
    const auto = platformPriceSpreadOfSelection(NOVA_12256, '202619', 'RU', 'usd');
    expect(auto.rows.map((row) => row.platform)).toEqual(['OZON', 'DNS', 'Mvideo']);
    expect(auto.rows[0].price).toBeCloseTo(332.62, 2);
  });

  it('平台级口径（DNS）只取该平台渠道：黑 SKU → DNS 335.98 单行', () => {
    const scoped = platformPriceSpreadOfSelection(NOVA_12256, '202619', 'RU', 'usd', DNS_PLATFORM);
    expect(scoped.rows).toHaveLength(1);
    expect(scoped.rows[0].platform).toBe('DNS');
    expect(scoped.rows[0].price).toBeCloseTo(335.98, 2);
  });

  it('整配置 + scope 组合：全部 2 色 OZON 3P 均值（382.55+394.59 的 OZON 3P 行均值）', () => {
    const whole = platformPriceSpreadOfSelection(
      { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: [] },
      '202619', 'RU', 'usd', OZON_3P,
    );
    expect(whole.wholeConfig).toBe(true);
    expect(whole.members).toBe(2);
    expect(whole.rows).toHaveLength(1);
    expect(whole.rows[0].platform).toBe('OZON');
    expect(whole.rows[0].skuCount).toBe(2);
  });

  it('scope 内该周无价 → 空行（Mate X6 202619 OZON 1P 无事实行）', () => {
    const scoped = platformPriceSpreadOfSelection(
      { modelId: 'own-huawei-mate-x6', romram: '12+512 GB', skuIds: [mateBlack512.sku_id] },
      '202619', 'RU', 'usd', { platforms: [], shopIds: ['RU:ozon:1P'], seller: null },
    );
    expect(scoped.rows).toEqual([]);
  });
});
