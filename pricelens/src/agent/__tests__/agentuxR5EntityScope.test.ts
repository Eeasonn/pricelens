// ============================================================
// t428u R5 返修（四审增量 · 2026-11-07）实体配置归属 / 长短实体消歧 /
// 部分缺失披露 / 整配置平台比较回归（真实事实包、真实 runAgent 链路，
// 零 mock、无 forcedIntent——自然分类链 classifyIntent → query）：
//  - 四审 M1 Major：多实体问句里配置对必须按实体出现位置就近归属——
//    「RU nova 14 12+256 和 Mate X6 12+512 价格趋势」恰好两组
//    （nova 14/12+256=333/OZON、Mate X6/12+512=1184/Mvideo），不再把
//    Mate 的 12+512 广播给 nova 14 混出第三组 370/DNS；逆序 + 带 GB 同理；
//    点回看落地 mains 恰好两主品、再问仍两组。长短实体：nova 14 与
//    nova 14 Pro 分别明确出现时两者都保留（有效+有效、无效+有效均不丢
//    短实体），「nova 14 Pro」单独出现不从子串虚构 nova 14，也不误中
//    nova 14i。无效配置（99+999 / 8+256）如实披露缺失，不用页面持有的
//    12+512（370/DNS）替答；合法每线 OZON 3P 口径复用不被多实体洗掉。
//  - 四审 m1 Minor：有价分支必须输出部分缺失说明——「12+256 和 8+256」
//    有效 333 保留 + 8+256 缺失披露同卡共存（中英文连接词都覆盖）。
//  - 四审 m2 Minor（受控 API 契约，skuIds=[] 整配置非自然选择器可达）：
//    平台比较按整条产品线选择展开全部颜色（各平台 = 选择内各 SKU 平台内
//    最低价均值，与趋势聚合同构），不再 first.skuIds[0]（整配置时
//    undefined → 空平台表）；整配置 334 / 黑 SKU 333 / 分平台
//    DNS 336 / Mvideo 347 / OZON 358 严格区分。
// 数据事实（fact_price_weekly · RU · 202619）：nova 14 12+256 黑
// OZON=332.62（自动 333）/ 白 DNS=335.98；整配置全渠道均值 334；
// nova 14 12+512 黑自动 = DNS 369.86（370）；Mate X6 12+512 黑自动 =
// Mvideo 1184.11（1184）；nova 14 Pro 12+512 黑自动 = DNS 464.69（465）；
// nova 14 12+256 黑每线 OZON 3P = 394.59（395）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, PlatformSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { platformPriceSpreadOfSelection } from '../../dataModel/aggregate';
import { runAgent, buildAgentContext } from '../core';
import { validateFilterPatch } from '../contracts';
import type { ChartResultCard, TableResultCard } from '../contracts';

const OZON_3P: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };

const novaBlack256 = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const novaBlack512 = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-512gb__black')!;
const NOVA_12256 = { modelId: 'own-huawei-nova-14', romram: novaBlack256.romram, skuIds: [novaBlack256.sku_id] };
const NOVA_12512 = { modelId: 'own-huawei-nova-14', romram: novaBlack512.romram, skuIds: [novaBlack512.sku_id] };

/** 评审复现初始态：真实自然 UI URL ?c=RU&main=…12+512GB&rs=202619&re=202619 ——
 *  页面持有 nova 14 12+512、单周 202619、USD、无全局/每线店铺口径 */
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

/** 页面持有 12+256 的对照初始态（不同页面初始配置不改变解析结果） */
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

/** nova 14 12+256 主品挂每线 OZON 3P（价格页店铺药丸形态）· 单周 202619 */
function ruNova14PerLineShopState(): FiltersState {
  const cards = buildCards([NOVA_12256], { auto: true, countryCode: 'RU' });
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

async function trendOf(state: FiltersState, text: string) {
  const response = await runAgent(text, buildAgentContext('dashboard', state, []));
  expect(response.intent).toBe('query');
  const chart = response.cards.find((item): item is ChartResultCard => item.kind === 'chart');
  const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
  expect(chart).toBeTruthy();
  expect(table).toBeTruthy();
  return { chart: chart!, table: table!, response };
}

/** 两组断言共用：恰好 nova 14/12+256（333/OZON）+ Mate X6/12+512（1184/Mvideo），
 *  绝无第三组 nova 14/12+512（370/DNS）混入 */
function expectExactlyTwoGroups(chart: ChartResultCard, table: TableResultCard) {
  expect(chart.series).toHaveLength(2);
  expect(table.rows).toHaveLength(2);
  const novaSeries = chart.series.find((s) => s.label.includes('nova 14') && !s.label.includes('Pro') && !s.label.includes('14i'));
  const mateSeries = chart.series.find((s) => s.label.includes('Mate X6'));
  expect(novaSeries).toBeTruthy();
  expect(mateSeries).toBeTruthy();
  expect(novaSeries!.label).toContain('12+256');
  expect(mateSeries!.label).toContain('12+512');
  const body = `${chart.note}\n${table.note}\n${table.rows.flat().join('|')}\n${chart.series.map((s) => s.label).join('|')}`;
  // nova 14 只解析 12+256：绝不出现 370/DNS 的第三组（页面持有的 12+512 不替答）
  expect(table.rows.filter((row) => row[0].includes('nova 14') && !row[0].includes('Pro') && !row[0].includes('14i'))).toHaveLength(1);
  const novaRow = table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro') && !row[0].includes('14i'))!;
  const mateRow = table.rows.find((row) => row[0].includes('Mate X6'))!;
  expect(novaRow[0]).toContain('12+256');
  expect(novaRow[1]).toBe('333');
  expect(novaRow[3]).toBe('OZON');
  expect(mateRow[0]).toContain('12+512');
  expect(mateRow[1]).toBe('1,184');
  expect(mateRow[3]).toBe('Mvideo');
  expect(body.includes('370')).toBe(false);
  expect(body.includes('DNS')).toBe(false);
  expect(body.includes('14i')).toBe(false);
  // 图卡与表卡都真实有价（非无数据表冒充）
  expect(chart.series.some((s) => s.values.some((v) => v.value != null))).toBe(true);
}

describe('四审 M1 · 多实体配置就近归属（不再整句广播配置对）', () => {
  it('forward：页面持有 12+512 时「RU nova 14 12+256 和 Mate X6 12+512 价格趋势」恰好两组 333/1184，绝无 370/DNS 第三组', async () => {
    const { chart, table } = await trendOf(ruHolding12512State(), 'RU nova 14 12+256 和 Mate X6 12+512 价格趋势');
    expectExactlyTwoGroups(chart, table);
  });

  it('reverse + 完整 GB：逆序「RU Mate X6 12+512GB 和 nova 14 12+256GB 价格趋势」同样恰好两组', async () => {
    const { chart, table } = await trendOf(ruHolding12512State(), 'RU Mate X6 12+512GB 和 nova 14 12+256GB 价格趋势');
    expectExactlyTwoGroups(chart, table);
  });

  it('英文 and 连接 + 页面初始持有 12+256：结果不受页面初始配置与连接词影响', async () => {
    const { chart, table } = await trendOf(ruHolding12256State(), 'RU nova 14 12+256 and Mate X6 12+512 价格趋势');
    expectExactlyTwoGroups(chart, table);
  });

  it('open 落地 mains 恰好两主品（nova 12+256 + Mate X6 12+512），落地后再问仍恰好两组', async () => {
    const state = ruHolding12512State();
    const { chart, table } = await trendOf(state, 'RU nova 14 12+256 和 Mate X6 12+512 价格趋势');
    for (const card of [chart, table]) {
      const open = (card.actions ?? []).find((action) => action.kind === 'open');
      expect(open?.filterPatch?.mains).toHaveLength(2);
      const novaMain = open?.filterPatch?.mains?.find((m) => m.main?.modelId === 'own-huawei-nova-14');
      const mateMain = open?.filterPatch?.mains?.find((m) => m.main?.modelId === 'own-huawei-mate-x6');
      expect(novaMain?.main?.romram).toBe('12+256 GB');
      expect(mateMain?.main?.romram).toBe('12+512 GB');
    }
    // URL 持久化再问（落地态 = openPatch 合并）：仍两组，nova 仍 333（不再 3 主品）
    const landed: FiltersState = {
      ...state,
      ...((chart.actions ?? []).find((action) => action.kind === 'open')?.filterPatch ?? {}),
    } as FiltersState;
    const again = await trendOf(landed, 'RU nova 14 12+256 和 Mate X6 12+512 价格趋势');
    expectExactlyTwoGroups(again.chart, again.table);
  });

  it('每线 OZON 3P 口径不被多实体解析洗掉：nova 仍 395/OZON 3P，Mate X6 独立解析 1184/Mvideo', async () => {
    const { chart, table } = await trendOf(ruNova14PerLineShopState(), 'RU nova 14 12+256 和 Mate X6 12+512 价格趋势');
    expect(chart.series).toHaveLength(2);
    const novaRow = table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro'))!;
    const mateRow = table.rows.find((row) => row[0].includes('Mate X6'))!;
    expect(novaRow[1]).toBe('395');
    expect(novaRow[3]).toBe('OZON 3P');
    expect(mateRow[1]).toBe('1,184');
    expect(mateRow[3]).toBe('Mvideo');
    const open = (chart.actions ?? []).find((action) => action.kind === 'open');
    const novaMain = open?.filterPatch?.mains?.find((m) => m.main?.modelId === 'own-huawei-nova-14');
    expect(novaMain?.main?.platform?.shopIds).toEqual(['RU:ozon:3P']);
  });

  it('一个实体多个配置只归该实体：「nova 14 12+256、12+512 和 Mate X6 12+512」= 3 组，Mate 只拿自己的 12+512', async () => {
    const { chart, table } = await trendOf(ruHolding12512State(), 'RU nova 14 12+256、12+512 和 Mate X6 12+512 价格趋势');
    expect(chart.series).toHaveLength(3);
    expect(table.rows).toHaveLength(3);
    const nova12256 = table.rows.find((row) => row[0].includes('nova 14') && row[0].includes('12+256') && !row[0].includes('Pro'))!;
    const nova12512 = table.rows.find((row) => row[0].includes('nova 14') && row[0].includes('12+512') && !row[0].includes('Pro'))!;
    const mate = table.rows.find((row) => row[0].includes('Mate X6'))!;
    expect(nova12256[1]).toBe('333');
    expect(nova12512[1]).toBe('370');
    expect(nova12512[3]).toBe('DNS');
    expect(mate[1]).toBe('1,184');
    expect(mate[3]).toBe('Mvideo');
    // Mate X6 只有一组（12+512 不重复解析）
    expect(table.rows.filter((row) => row[0].includes('Mate X6'))).toHaveLength(1);
  });
});

describe('四审 M1 · 长短实体消歧（不丢短实体、不从子串虚构、不误中 nova 14i）', () => {
  it('有效+有效：「nova 14 12+256 和 nova 14 Pro 12+512」两组（333 + 465），Pro 的 12+512 不广播给 nova 14', async () => {
    const { chart, table } = await trendOf(ruHolding12512State(), 'RU nova 14 12+256 和 nova 14 Pro 12+512 价格趋势');
    expect(chart.series).toHaveLength(2);
    const novaRow = table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro') && !row[0].includes('14i'))!;
    const proRow = table.rows.find((row) => row[0].includes('Pro'))!;
    expect(novaRow[0]).toContain('12+256');
    expect(novaRow[1]).toBe('333');
    expect(proRow[1]).toBe('465');
    expect(proRow[3]).toBe('DNS');
    expect(table.rows.every((row) => !row[0].includes('14i'))).toBe(true);
    expect(table.rows).toHaveLength(2);
  });

  it('同配置值分别归属：「nova 14 12+512 和 nova 14 Pro 12+512」恰好两组（370 + 465）', async () => {
    const { chart, table } = await trendOf(ruHolding12512State(), 'RU nova 14 12+512 和 nova 14 Pro 12+512 价格趋势');
    expect(chart.series).toHaveLength(2);
    const prices = table.rows.map((row) => row[1]).sort();
    expect(prices).toEqual(['465', '370'].sort());
    expect(table.rows.every((row) => !row[0].includes('14i'))).toBe(true);
  });

  it('无效+有效：「nova 14 8+256 和 nova 14 Pro 12+512」不丢短实体——Pro 465/DNS 如常返回，nova 14 8+256 如实缺失披露', async () => {
    const { chart, table, response } = await trendOf(ruHolding12512State(), 'RU nova 14 8+256 和 nova 14 Pro 12+512 价格趋势');
    // 短实体不被吞：请求里两个实体都识别（scope 标签两者都在），但只有 Pro 有价
    expect(chart.title).toContain('nova 14');
    expect(chart.title).toContain('Pro');
    expect(chart.series).toHaveLength(1);
    expect(chart.series[0].label.includes('Pro')).toBe(true);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0][1]).toBe('465');
    expect(table.rows[0][3]).toBe('DNS');
    // 缺失披露（本次响应正文，非用户原文复述）
    expect(response.summary).toContain('8+256');
    expect(response.summary).toContain('部分完成');
    expect(chart.note).toContain('8+256');
    expect(table.note).toContain('8+256');
    expect(table.note).toContain('没有改用该型号其他配置或当前页面配置代替');
    // 不用页面持有的 12+512（370/DNS）替答无效配置
    const body = `${chart.note}\n${table.note}\n${table.rows.flat().join('|')}\n${response.summary}`;
    expect(body.includes('370')).toBe(false);
    expect(table.rows.some((row) => row[0].includes('nova 14') && !row[0].includes('Pro'))).toBe(false);
  });

  it('「nova 14 Pro 12+512」单独出现：只解析 Pro（一组 465/DNS），不从 Pro 子串虚构 nova 14，也不误中 nova 14i', async () => {
    const { chart, table } = await trendOf(ruHolding12512State(), 'RU nova 14 Pro 12+512 价格趋势');
    expect(chart.series).toHaveLength(1);
    expect(chart.series[0].label.includes('nova 14 Pro')).toBe(true);
    expect(table.rows[0][1]).toBe('465');
    expect(table.rows[0][3]).toBe('DNS');
    expect(table.rows[0][0].includes('14i')).toBe(false);
    // 页面持有的 nova 14 12+512 不因同型号出现被带上
    expect(table.rows).toHaveLength(1);
    const body = `${table.rows.flat().join('|')}`;
    expect(body.includes('370')).toBe(false);
  });

  it('无效配置不替答（多实体）：「nova 14 99+999 和 Mate X6 12+512」→ Mate 1184/Mvideo + nova 14 99+999 如实缺失，绝无 nova 512/370 替答', async () => {
    const { chart, table, response } = await trendOf(ruHolding12512State(), 'RU nova 14 99+999 和 Mate X6 12+512 价格趋势');
    expect(chart.series).toHaveLength(1);
    expect(chart.series[0].label.includes('Mate X6')).toBe(true);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0][1]).toBe('1,184');
    expect(table.rows[0][3]).toBe('Mvideo');
    expect(response.summary).toContain('99+999');
    expect(response.summary).toContain('部分完成');
    expect(chart.note).toContain('99+999');
    expect(table.note).toContain('99+999');
    const body = `${chart.note}\n${table.note}\n${table.rows.flat().join('|')}\n${response.summary}`;
    expect(body.includes('370')).toBe(false);
    expect(table.rows.some((row) => row[0].includes('nova 14'))).toBe(false);
  });
});

describe('四审 m1 · 有价分支输出部分缺失说明（成功/部分成功都披露缺了什么）', () => {
  it.each([
    'RU nova 14 12+256 and 8+256 价格趋势',
    'RU nova 14 12+256 和 8+256 价格趋势',
  ])('「%s」→ 有效 333/OZON 保留 + 8+256 缺失说明同卡共存', async (text) => {
    const { chart, table, response } = await trendOf(ruHolding12512State(), text);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0][0]).toContain('12+256');
    expect(table.rows[0][1]).toBe('333');
    expect(table.rows[0][3]).toBe('OZON');
    // 本次 assistant 响应正文（摘要+卡注）必须同时存在有效价与 8+256 缺失说明
    // 同一 assistant 响应内有效价与缺失说明并存（摘要不含价格行，价在表卡行内）
    expect(JSON.stringify(response.summary + table.rows.flat().join('|') + chart.note + table.note)).toContain('333');
    expect(response.summary).toContain('8+256');
    expect(response.summary).toContain('部分完成');
    expect(chart.note).toContain('8+256');
    expect(table.note).toContain('8+256');
    expect(table.note).toContain('没有改用该型号其他配置或当前页面配置代替');
    // 有效结果不因错误配置连带清空（不落无数据表）
    expect(chart.series.some((s) => s.values.some((v) => v.value === 333))).toBe(true);
  });

  it('干净查询不产生假缺失说明：「RU nova 14 12+256GB 价格趋势」无「部分完成」字样', async () => {
    const { chart, table, response } = await trendOf(ruHolding12512State(), 'RU nova 14 12+256GB 价格趋势');
    expect(table.rows[0][1]).toBe('333');
    expect(response.summary).not.toContain('部分完成');
    expect(chart.note).not.toContain('部分完成');
    expect(table.note).not.toContain('部分完成');
  });
});

describe('四审 m2 · 整配置（skuIds=[]）平台比较展开全部颜色（受控 API 契约）', () => {
  it('platformPriceSpreadOfSelection：整配置展开 2 色，各平台 = 选择内各 SKU 平台内最低价均值（DNS 335.98 / Mvideo 346.82 / OZON 357.59）', () => {
    const whole = platformPriceSpreadOfSelection(
      { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: [] },
      '202619', 'RU', 'usd',
    );
    expect(whole.wholeConfig).toBe(true);
    expect(whole.members).toBe(2);
    expect(whole.rows.map((row) => row.platform)).toEqual(['DNS', 'Mvideo', 'OZON']);
    expect(whole.rows[0].price).toBeCloseTo(335.98, 2);
    expect(whole.rows[1].price).toBeCloseTo(346.82, 2);
    expect(whole.rows[2].price).toBeCloseTo((332.62 + 382.55) / 2, 2);
    // 黑色单 SKU 对照：最便宜是 OZON 332.62——整配置口径绝不能套单色价
    const black = platformPriceSpreadOfSelection(
      { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: ['own-huawei-nova-14__12-256gb__black'] },
      '202619', 'RU', 'usd',
    );
    expect(black.members).toBe(1);
    expect(black.rows[0].platform).toBe('OZON');
    expect(black.rows[0].price).toBeCloseTo(332.62, 2);
    expect(whole.rows[0].platform).not.toBe(black.rows[0].platform);
  });

  it('合法整配置在 filterPatch 白名单内（skuIds=[] 是合法产品选择，open 落地不被拒）', () => {
    const result = validateFilterPatch({
      countryCode: 'RU',
      mains: [{ id: 'whole', main: { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: [] }, compares: [] }],
    });
    expect(result.valid).toBe(true);
  });

  it('runAgent 受控：skuIds=[] 问「哪个平台最便宜？」→ DNS 336 最低 / Mvideo 347 / OZON 358，说明整配置全部颜色口径，不再空平台表', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: null,
      mains: [{ id: 'whole', main: { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: [], platform: null }, compares: [] }],
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202619',
    };
    const response = await runAgent('哪个平台最便宜？', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
    expect(table?.title).toBe('最新有价周平台比较');
    expect(table!.rows).toEqual([
      ['DNS', '336', '最低'],
      ['Mvideo', '347', '+3.2%'],
      ['OZON', '358', '+6.4%'],
    ]);
    expect(table!.note).toContain('整配置');
    expect(table!.note).toContain('全部 2 个颜色 SKU');
    expect(table!.note).toContain('与趋势聚合一致');
    expect(table!.note).toContain('最便宜平台为 DNS');
    // 不把黑色单 SKU 的 333/最低 OZON 套给整配置
    const body = `${table!.note}\n${table!.rows.flat().join('|')}`;
    expect(body.includes('333')).toBe(false);
    // open 落地保留合法整配置（skuIds=[]）与生效范围；Provider 未变
    const open = (table!.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.mains?.[0]?.main?.skuIds).toEqual([]);
    expect(open?.filterPatch?.countryCode).toBe('RU');
    expect(response.provider?.name).toBe('本地确定性');
  });

  it('runAgent 受控对照：整配置趋势 334（全部颜色均值）≠ 黑色单 SKU 333——平台表与趋势同 scope', async () => {
    const wholeState: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: null,
      mains: [{ id: 'whole', main: { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: [], platform: null }, compares: [] }],
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202619',
    };
    const wholeTrend = await trendOf(wholeState, '价格趋势');
    const wholePoint = wholeTrend.chart.series[0].values.find((v) => v.value != null);
    expect(wholePoint?.value).toBe(334);
    expect(wholeTrend.table.rows[0][1]).toBe('334');
    const blackState: FiltersState = {
      ...wholeState,
      mains: [{ id: 'black', main: { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: ['own-huawei-nova-14__12-256gb__black'], platform: null }, compares: [] }],
    };
    const blackTrend = await trendOf(blackState, '价格趋势');
    expect(blackTrend.table.rows[0][1]).toBe('333');
  });
});
