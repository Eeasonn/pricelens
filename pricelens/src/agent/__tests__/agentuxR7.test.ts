// ============================================================
// t428u R7 返修（独立六审 3Major/1Minor · 2026-11-07）真实链路回归
// （真实事实包、真实 runAgent 自然分类，零 mock、无 forcedIntent）：
//  - 六审 M1 Major · 配置绑定置信门根治：旧「两侧最近实体按字符距离兜底」不
//    安全——「nova 14 和 Mate X6 都是 12+512GB」中 512 按距离只归 Mate，nova
//    未被绑定而拿页面默认 256/333 替答；「nova 14 12+256 和 12+512 和 Mate X6
//    12+512」中中间 512 跨「和」按距离归 Mate，nova 漏 512。修复口径：共享
//    配置语法（都是/均为/皆为/全是 → 全部实体各得配置）、和列表延续（后一
//    实体已自带配置时归前一配置所属实体）、夹两实体且恰好一侧已配 → 归无配置
//    一侧、单实体问句全部配置归它；其余多实体无法唯一归属 / 句中无实体却点名
//    配置 → 诚实澄清（零卡零 patch），绝不拿页面当前配置冒答、绝不用另一实体
//    的有效配置救活无效 99+999。页面初始持有 256/512 双对照、正逆序、普通和
//    与顿号语义等价、query/filter/价格优势共用同一条绑定路径。
//  - 六审 M2 Major · 全平台表动作携带本次真实计算 scope：全局 DNS + 每线
//    OZON 3P 下问「全平台哪个平台最便宜？」答 OZON 333/DNS 336/Mvideo 347，
//    「定位到看板」的 openPatch 落全平台口径（全局平台与逐线口径一并清空，
//    不再回原 3P/395 冒充本次结果）；「查看价差解释」followup prompt 自带
//    「全平台」，重放按同一口径答 333/336/347；非全平台卡动作保持原口径。
//  - 六审 M3 Major · FR 显式全局口径不被自动回退越权：FR Mate X6 12+512 黑
//    （真实事实：仅 Amazon 3P 有 202638–202642 五条，最新 202642=1596），
//    全局 plat=Boulanger 时问「按当前所选平台…价格趋势」必须如实无价
//    （点名口径、不偷查 Amazon 3P 1596、不注入 shopIds）；自动口径仍透明
//    回退 1596；显式 Amazon 1P 同样如实无价；每线>全局>自动矩阵保真。
//  - 六审 m1 Minor · 澄清 CTA 安全补全：配置归属澄清的建议问法从用户原请求
//    派生（原国家+原型号+原点名配置，不足以「（补配置）」占位不虚构），且
//    一律 draftOnly（点击只填输入框、不执行），不再硬编码发送「RU nova …」
//    静默换国换型号。
// 数据事实（fact_price_weekly · USD）：RU nova 14 12+256 黑 202619：OZON 1P
// 333 / DNS 336 / Mvideo 347 / OZON 3P 395；nova 14 12+512 黑 202619 自动 =
// DNS 370；nova 14 Pro 12+512 = DNS 465；Mate X6 12+512 黑 202619：Mvideo
// 1184 最低 / DNS 1210 / OZON 3P 1422。FR Mate X6 12+512：仅 Amazon 3P
// 202638–202642 五条，202642 = 1596。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, PlatformSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { runAgent, buildAgentContext } from '../core';
import type { ChartResultCard, FilterResultCard, TableResultCard } from '../contracts';

const OZON_3P: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
const DNS_PLATFORM: PlatformSelection = { platforms: ['DNS'], shopIds: [], seller: null };
const FR_BOULANGER: PlatformSelection = { platforms: ['Boulanger'], shopIds: [], seller: null };
const FR_AMAZON_1P: PlatformSelection = { platforms: [], shopIds: ['FR:amazon:1P'], seller: null };
const FR_AMAZON_3P: PlatformSelection = { platforms: [], shopIds: ['FR:amazon:3P'], seller: null };

const novaBlack256 = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const novaBlack512 = dimProduct.find((row) => row.sku_id === 'own-huawei-nova-14__12-512gb__black')!;
const mateBlack512 = dimProduct.find((row) => row.sku_id === 'own-huawei-mate-x6__12-512gb__black')!;
const NOVA_12256 = { modelId: 'own-huawei-nova-14', romram: novaBlack256.romram, skuIds: [novaBlack256.sku_id] };
const NOVA_12512 = { modelId: 'own-huawei-nova-14', romram: novaBlack512.romram, skuIds: [novaBlack512.sku_id] };
const MATE_12512 = { modelId: 'own-huawei-mate-x6', romram: mateBlack512.romram, skuIds: [mateBlack512.sku_id] };

/** 评审复现初始态 A：页面持有 nova 14 12+512（问「都是 12+512」时 nova 绝不拿页面 512 之外的配置替答） */
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

/** 评审复现初始态 B：页面持有 nova 14 12+256（旧缺陷：nova 未被绑定 → 拿页面 256/333 替答 512/370） */
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

/** M3 场景态：FR 页持有 Mate X6 12+512 黑 · 全局钉 Boulanger（URL plat=Boulanger 形态） */
function frMateBoulangerState(platform: PlatformSelection | null = FR_BOULANGER): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'FR',
    platform,
    mains: buildCards([MATE_12512], { auto: true, countryCode: 'FR' }),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202642',
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

describe('六审 M1 · 共享配置语法（都是/均为 → 全部实体各得配置，不拿页面配置替答）', () => {
  it.each([
    ['页面初始持有 12+512', () => ruHolding12512State()],
    ['页面初始持有 12+256（旧缺陷复现态）', () => ruHolding12256State()],
  ])('「%s」：问「RU nova 14 和 Mate X6 都是12+512GB价格趋势」→ nova 370/DNS + Mate 1184/Mvideo，绝不 333', async (_tag, makeState) => {
    const { chart, table, response } = await trendOf(makeState(), 'RU nova 14 和 Mate X6 都是12+512GB价格趋势');
    expect(chart.series).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
    const novaRow = table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro'))!;
    const mateRow = table.rows.find((row) => row[0].includes('Mate X6'))!;
    expect(novaRow[0]).toContain('12+512');
    expect(novaRow[1]).toBe('370');
    expect(novaRow[3]).toBe('DNS');
    expect(mateRow[1]).toBe('1,184');
    expect(mateRow[3]).toBe('Mvideo');
    // 页面持有的 12+256（333/OZON）绝不冒充共享 12+512 的答案
    const body = `${response.summary}\n${chart.note}\n${table.note}\n${table.rows.flat().join('|')}`;
    expect(body.includes('333')).toBe(false);
    expect(body.includes('部分完成')).toBe(false);
  });

  it('逆序共享等价：「RU Mate X6 和 nova 14 都是 12+512 价格趋势」同样两组 370+1184', async () => {
    const { table } = await trendOf(ruHolding12256State(), 'RU Mate X6 和 nova 14 都是 12+512 价格趋势');
    expect(table.rows).toHaveLength(2);
    const novaRow = table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro'))!;
    const mateRow = table.rows.find((row) => row[0].includes('Mate X6'))!;
    expect(novaRow[1]).toBe('370');
    expect(mateRow[1]).toBe('1,184');
  });

  it('「均为」同为共享标记：「RU nova 14 与 Mate X6 均为 12+512 价格趋势」两组', async () => {
    const { table } = await trendOf(ruHolding12256State(), 'RU nova 14 与 Mate X6 均为 12+512 价格趋势');
    expect(table.rows).toHaveLength(2);
    const novaRow = table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro'))!;
    expect(novaRow[1]).toBe('370');
    expect(novaRow[3]).toBe('DNS');
  });

  it('长短实体保真：「nova 14 和 nova 14 Pro 都是 12+512」→ nova 370 + Pro 465 两组，不虚构不丢失', async () => {
    const { chart, table } = await trendOf(ruHolding12256State(), 'RU nova 14 和 nova 14 Pro 都是 12+512 价格趋势');
    expect(chart.series).toHaveLength(2);
    const novaRow = table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro') && !row[0].includes('14i'))!;
    const proRow = table.rows.find((row) => row[0].includes('Pro'))!;
    expect(novaRow[1]).toBe('370');
    expect(proRow[1]).toBe('465');
    expect(proRow[3]).toBe('DNS');
    expect(table.rows).toHaveLength(2);
  });

  it('共享配置无效（99+999）：两实体如实缺失、零价格行，绝不被有效配置救活', async () => {
    const response = await ask(ruHolding12256State(), 'RU nova 14 和 Mate X6 都是 99+999 价格趋势');
    expect(response.intent).toBe('query');
    const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
    expect(table).toBeTruthy();
    expect(table!.rows.map((row) => row[2])).toEqual(['无可用价格数据', '无可用价格数据']);
    expect(response.summary).toContain('99+999');
    const body = `${response.summary}\n${table!.note}\n${table!.rows.flat().join('|')}`;
    expect(body.includes('370')).toBe(false);
    expect(body.includes('1,184')).toBe(false);
    expect(body.includes('333')).toBe(false);
  });

  it('共享有效 + 逐实体无效共存：「nova 14 99+999 和 Mate X6 都是 12+512」→ 370+1184 如实答 + 99+999 缺失披露', async () => {
    const { chart, table, response } = await trendOf(ruHolding12256State(), 'RU nova 14 99+999 和 Mate X6 都是 12+512 价格趋势');
    expect(chart.series).toHaveLength(2);
    const novaRow = table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro'))!;
    const mateRow = table.rows.find((row) => row[0].includes('Mate X6'))!;
    expect(novaRow[1]).toBe('370');
    expect(mateRow[1]).toBe('1,184');
    expect(response.summary).toContain('99+999');
    expect(response.summary).toContain('部分完成');
  });
});

describe('六审 M1 · 和列表延续与置信门（距离兜底已移除）', () => {
  it('「RU nova 14 12+256 和 12+512 和 Mate X6 12+512 价格趋势」→ 三组 333/370/1184，不漏 nova 512', async () => {
    const { chart, table } = await trendOf(ruHolding12256State(), 'RU nova 14 12+256 和 12+512 和 Mate X6 12+512 价格趋势');
    expect(chart.series).toHaveLength(3);
    expect(table.rows).toHaveLength(3);
    const nova256 = table.rows.find((row) => row[0].includes('12+256') && row[0].includes('nova 14'))!;
    const nova512 = table.rows.find((row) => row[0].includes('12+512') && row[0].includes('nova 14') && !row[0].includes('Pro'))!;
    const mate = table.rows.find((row) => row[0].includes('Mate X6'))!;
    expect(nova256[1]).toBe('333');
    expect(nova512[1]).toBe('370');
    expect(mate[1]).toBe('1,184');
  });

  it('顿号语义等价（对照）：「nova 14 12+256、12+512 和 Mate X6 12+512」同样三组 333/370/1184', async () => {
    const { table } = await trendOf(ruHolding12256State(), 'RU nova 14 12+256、12+512 和 Mate X6 12+512 价格趋势');
    expect(table.rows).toHaveLength(3);
    const prices = table.rows.map((row) => row[1]).sort();
    expect(prices).toEqual(['1,184', '333', '370'].sort());
  });

  it('单实体跨「和」列举安全：「RU nova 14 12+256 和 12+512 价格趋势」→ 两组 333+370（无跨实体污染可能）', async () => {
    const { chart, table } = await trendOf(ruHolding12256State(), 'RU nova 14 12+256 和 12+512 价格趋势');
    expect(chart.series).toHaveLength(2);
    const prices = table.rows.map((row) => row[1]).sort();
    expect(prices).toEqual(['333', '370'].sort());
  });

  it('夹在两实体之间且恰好一侧已配：「nova 14 和 12+512 和 Mate X6 12+256」→ 12+512 归 nova（370）；Mate 12+256 如实缺失不被救活', async () => {
    const { table, response } = await trendOf(ruHolding12256State(), 'RU nova 14 和 12+512 和 Mate X6 12+256 价格趋势');
    // 12+256 是 Mate X6 的紧邻后置（用户点名），RU 无此配置 → 如实缺失；12+512 归无配置的 nova
    expect(table.rows).toHaveLength(1);
    const nova512 = table.rows.find((row) => row[0].includes('12+512') && row[0].includes('nova 14'))!;
    expect(nova512[1]).toBe('370');
    expect(response.summary).toContain('Mate X6 12+256');
    expect(response.summary).toContain('部分完成');
    const body = `${response.summary}\n${table.note}\n${table.rows.flat().join('|')}`;
    expect(body.includes('1,184')).toBe(false);
    expect(body.includes('333')).toBe(false);
  });

  it('无判据多实体 → 诚实澄清（零卡、不生成 patch）：「nova 14 12+256 和 12+512 和 Mate X6 价格趋势」', async () => {
    const response = await ask(ruHolding12256State(), 'RU nova 14 12+256 和 12+512 和 Mate X6 价格趋势');
    expect(response.intent).toBe('clarify');
    expect(response.cards).toHaveLength(0);
    expect(response.summary).toContain('无法唯一归属');
    expect(response.summary).toContain('12+512');
    expect(response.cards.every((card) => !('filterPatch' in card) || card.filterPatch == null)).toBe(true);
    expect((response.suggestionActions ?? []).length).toBeGreaterThan(0);
  });

  it('句中无实体却点名配置 → 诚实澄清，不拿页面默认配置冒答：「12+512 价格趋势」', async () => {
    const response = await ask(ruHolding12256State(), '12+512 价格趋势');
    expect(response.intent).toBe('clarify');
    expect(response.cards).toHaveLength(0);
    expect(response.summary).toContain('没有出现可归属的型号');
    expect(response.summary).toContain('12+512');
  });

  it('filter 路径共用绑定：「只看 RU nova 14 和 Mate X6 都是 12+512」→ patch 两主品各 12+512（不澄清不扩大）', async () => {
    const response = await ask(ruHolding12256State(), '只看 RU nova 14 和 Mate X6 都是 12+512');
    expect(response.intent).toBe('filter');
    const filter = response.cards.find((item): item is FilterResultCard => item.kind === 'filter');
    expect(filter).toBeTruthy();
    const mains = filter!.patch.mains ?? [];
    expect(mains).toHaveLength(2);
    expect(mains.some((m) => m.main?.modelId === 'own-huawei-nova-14' && m.main.romram === '12+512 GB')).toBe(true);
    expect(mains.some((m) => m.main?.modelId === 'own-huawei-mate-x6' && m.main.romram === '12+512 GB')).toBe(true);
  });

  it('价格优势路径共用置信门：无判据多实体「…和 12+512 价格优势」→ 澄清阻断；可靠共享 → 正常执行', async () => {
    const blocked = await ask(ruHolding12256State(), 'RU nova 14 12+256 和 12+512 和 Mate X6 价格优势');
    expect(blocked.intent).toBe('clarify');
    expect(blocked.cards).toHaveLength(0);
    expect(blocked.summary).toContain('无法唯一归属');
    const allowed = await ask(ruHolding12256State(), 'RU nova 14 和 Mate X6 都是 12+512 价格优势');
    expect(allowed.intent).toBe('price_advantage');
    expect(allowed.cards.length).toBeGreaterThan(0);
  });
});

describe('六审 M2 · 全平台表动作携带本次真实计算 scope', () => {
  it('「全平台哪个平台最便宜？」：表 333/336/347，「定位到看板」openPatch 落全平台口径（platform=null + 每线口径清空）', async () => {
    const { table } = await platformTableOf(ruNovaGlobalDnsPerLine3PState(), '全平台哪个平台最便宜？');
    expect(table.rows.map((row) => row[0])).toEqual(['OZON', 'DNS', 'Mvideo']);
    expect(table.rows[0][1]).toBe('333');
    expect(table.note).toContain('本次按全部平台比较');
    const open = (table.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.platform).toBeNull();
    const novaMain = open?.filterPatch?.mains?.find((m) => m.main?.modelId === 'own-huawei-nova-14');
    expect(novaMain?.main?.platform ?? null).toBeNull();
    expect(novaMain?.main?.romram).toBe('12+256 GB');
  });

  it('全平台 openPatch 落地后再问：趋势回到自动口径 333/OZON（不再每线 3P 395 漂移）', async () => {
    const state = ruNovaGlobalDnsPerLine3PState();
    const first = await platformTableOf(state, '全平台哪个平台最便宜？');
    const open = (first.table.actions ?? []).find((action) => action.kind === 'open');
    const landed: FiltersState = { ...state, ...(open?.filterPatch ?? {}) } as FiltersState;
    const trend = await trendOf(landed, '价格趋势');
    const novaRow = trend.table.rows.find((row) => row[0].includes('nova 14'))!;
    expect(novaRow[1]).toBe('333');
    expect(novaRow[3]).toBe('OZON');
    const again = await platformTableOf(landed, '按当前所选店铺口径，哪个平台最便宜？');
    expect(again.table.rows.map((row) => row[0])).toEqual(['OZON', 'DNS', 'Mvideo']);
    expect(again.table.rows[0][1]).toBe('333');
    expect(again.table.note).toContain('全部平台自动');
  });

  it('「查看价差解释」followup prompt 自带「全平台」：重放按同一口径答 333/336/347，不再答成原 3P/395', async () => {
    const state = ruNovaGlobalDnsPerLine3PState();
    const first = await platformTableOf(state, '全平台哪个平台最便宜？');
    const followup = (first.table.actions ?? []).find((action) => action.kind === 'followup');
    expect(followup?.prompt).toContain('全平台');
    // 用原页面状态（全局 DNS + 每线 OZON 3P）重放该 followup prompt
    const replay = await platformTableOf(state, followup!.prompt!);
    expect(replay.table.rows.map((row) => row[0])).toEqual(['OZON', 'DNS', 'Mvideo']);
    expect(replay.table.rows[0][1]).toBe('333');
    const body = `${replay.table.note}\n${replay.table.rows.flat().join('|')}`;
    expect(body.includes('395')).toBe(false);
  });

  it('非全平台卡动作保持原口径（回归保护）：严格 3P 卡 openPatch 保留全局 DNS + 每线 OZON 3P，followup 不带「全平台」', async () => {
    const state = ruNovaGlobalDnsPerLine3PState();
    const strict = await platformTableOf(state, '按当前所选店铺口径，哪个平台最便宜？');
    expect(strict.table.rows).toEqual([['OZON', '395', '最低']]);
    const open = (strict.table.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.platform).toEqual(DNS_PLATFORM);
    const novaMain = open?.filterPatch?.mains?.find((m) => m.main?.modelId === 'own-huawei-nova-14');
    expect(novaMain?.main?.platform?.shopIds).toEqual(['RU:ozon:3P']);
    const followup = (strict.table.actions ?? []).find((action) => action.kind === 'followup');
    expect(followup?.prompt).toBe('解释最新有价周的平台价差及可能的核查方向');
    expect((followup?.prompt ?? '').includes('全平台')).toBe(false);
  });

  it('多产品全平台一致：两主品各带每线 OZON 3P，openPatch 一并清空；逐产品 nova OZON 333 / Mate Mvideo 1184', async () => {
    const cards = [
      { id: 'nova', main: { ...NOVA_12256, platform: OZON_3P }, compares: [] },
      { id: 'mate', main: { ...MATE_12512, platform: OZON_3P }, compares: [] },
    ] as FiltersState['mains'];
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: DNS_PLATFORM,
      mains: cards,
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202619',
    };
    const { table } = await platformTableOf(state, '全平台哪个平台最便宜？');
    expect(table.title).toBe('最新有价周平台比较（逐产品）');
    const novaRows = table.rows.filter((row) => row[0].includes('nova 14'));
    const mateRows = table.rows.filter((row) => row[0].includes('Mate X6'));
    expect(novaRows[0][1]).toBe('OZON');
    expect(novaRows[0][2]).toBe('333');
    expect(mateRows[0][1]).toBe('Mvideo');
    expect(mateRows[0][2]).toBe('1,184');
    const open = (table.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.platform).toBeNull();
    for (const main of open?.filterPatch?.mains ?? []) {
      expect(main.main?.platform ?? null).toBeNull();
    }
  });
});

describe('六审 M3 · FR 显式全局口径不被自动回退越权', () => {
  it('全局 plat=Boulanger：「按当前所选平台，FR Mate X6 12+512GB价格趋势」→ 如实无价，点名口径，绝不偷查 Amazon 3P 1596', async () => {
    const response = await ask(frMateBoulangerState(), '按当前所选平台，FR Mate X6 12+512GB价格趋势');
    expect(response.intent).toBe('query');
    const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
    expect(table).toBeTruthy();
    expect(table!.rows[0][0]).toContain('Mate X6');
    expect(table!.rows[0][2]).toBe('无可用价格数据');
    expect(response.summary).toContain('BOULANGER');
    expect(response.summary).toContain('没有扩大口径');
    const body = `${response.summary}\n${table!.note}\n${table!.rows.flat().join('|')}`;
    expect(body.includes('1596')).toBe(false);
    expect(body.includes('1,596')).toBe(false);
    expect(body.includes('Amazon')).toBe(false);
    // 无数据结果不携带任何可污染看板的 openPatch
    expect(table!.actions ?? []).toHaveLength(0);
  });

  it('回看/再问仍无价、不换型号：同问两次结果一致，都是 Mate X6 无价（不换 Pura、不注入渠道）', async () => {
    const state = frMateBoulangerState();
    const first = await ask(state, '按当前所选平台，FR Mate X6 12+512GB价格趋势');
    const again = await ask(state, '按当前所选平台，FR Mate X6 12+512GB价格趋势');
    for (const response of [first, again]) {
      expect(response.intent).toBe('query');
      const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
      expect(table!.rows[0][0]).toContain('Mate X6');
      expect(table!.rows[0][2]).toBe('无可用价格数据');
      expect(`${response.summary}\n${table!.note}`.includes('1596')).toBe(false);
    }
  });

  it('自动口径对照（R3 语义保真）：同页 platform=null 问「FR Mate X6 12+512GB 价格趋势」→ 透明回退 1596 · Amazon 3P', async () => {
    const { chart, table } = await trendOf(frMateBoulangerState(null), 'FR Mate X6 12+512GB 价格趋势');
    expect(chart.series).toHaveLength(1);
    const last = chart.series[0].values[chart.series[0].values.length - 1];
    expect(last.value).toBe(1596);
    expect(table.rows[0][3]).toBe('Amazon 3P');
    expect(chart.note).toContain('默认电渠');
    expect(chart.note).toContain('没有价格事实');
  });

  it('显式 Amazon 1P 同为约束：如实无价并点名口径（不回退 3P）', async () => {
    const response = await ask(frMateBoulangerState(FR_AMAZON_1P), '按当前所选平台，FR Mate X6 12+512GB价格趋势');
    expect(response.intent).toBe('query');
    const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
    expect(table!.rows[0][2]).toBe('无可用价格数据');
    expect(response.summary).toContain('Amazon 1P');
    expect(`${response.summary}\n${table!.note}`.includes('1596')).toBe(false);
  });

  it('每线 > 全局 > 自动 矩阵：每线钉 Amazon 3P 时优先于全局 Boulanger → 1596；仅全局 Boulanger → 如实无价；全无 → 自动回退 1596', async () => {
    const perLineState: FiltersState = {
      ...frMateBoulangerState(),
      mains: buildCards([MATE_12512], { auto: true, countryCode: 'FR' })
        .map((card) => (card.main ? { ...card, main: { ...card.main, platform: FR_AMAZON_3P } } : card)),
    };
    const perLine = await trendOf(perLineState, '按当前所选平台，FR Mate X6 12+512GB价格趋势');
    // 问句带「平台」→ 首表为平台比较表：每线 3P 口径下唯一 Amazon 行 1596（口径说明点名 Amazon 3P）
    expect(perLine.table.rows[0][0]).toBe('Amazon');
    expect(perLine.table.rows[0][1]).toBe('1,596');
    expect(perLine.table.note).toContain('Amazon 3P');
    const last = perLine.chart.series[0].values[perLine.chart.series[0].values.length - 1];
    expect(last.value).toBe(1596);

    const globalOnly = await ask(frMateBoulangerState(), '按当前所选平台，FR Mate X6 12+512GB价格趋势');
    const globalTable = globalOnly.cards.find((item): item is TableResultCard => item.kind === 'table');
    expect(globalTable!.rows[0][2]).toBe('无可用价格数据');

    const auto = await trendOf(frMateBoulangerState(null), 'FR Mate X6 12+512GB 价格趋势');
    const autoLast = auto.chart.series[0].values[auto.chart.series[0].values.length - 1];
    expect(autoLast.value).toBe(1596);
  });
});

describe('六审 m1 · 澄清 CTA 安全补全（原请求派生 + draftOnly 不执行）', () => {
  it('FR 澄清：问「FR Pura 80 和 Mate X6 分别12+512价格趋势」→ CTA 示例带法国/原型号/12+512，绝无 RU/nova 固定样本', async () => {
    const response = await ask(frMateBoulangerState(), 'FR Pura 80 和 Mate X6 分别12+512价格趋势');
    expect(response.intent).toBe('clarify');
    expect(response.cards).toHaveLength(0);
    const actions = response.suggestionActions ?? [];
    expect(actions.length).toBeGreaterThanOrEqual(2);
    for (const action of actions) {
      expect(action.draftOnly).toBe(true);
      expect(action.prompt).toContain('法国');
      expect(action.prompt).toContain('Pura 80');
      expect(action.prompt).toContain('Mate X6');
      expect(action.prompt).toContain('12+512');
      expect(action.prompt?.includes('RU')).toBe(false);
      expect(action.prompt?.toLowerCase().includes('nova')).toBe(false);
    }
  });

  it('RU 对照（分别数量不匹配）：CTA 示例按原问句的 1 个配置派生（两型号各 12+256），不再硬编码 nova256+Mate512 双样本', async () => {
    const response = await ask(ruHolding12512State(), 'RU nova 14 和 Mate X6 分别是12+256的价格趋势');
    expect(response.intent).toBe('clarify');
    const actions = response.suggestionActions ?? [];
    expect(actions.length).toBeGreaterThanOrEqual(2);
    const perModel = actions.find((action) => action.label.includes('逐型号点名配置'))!;
    expect(perModel.prompt).toContain('nova 14 12+256');
    expect(perModel.prompt).toContain('Mate X6 12+256');
    expect(perModel.prompt?.includes('12+512')).toBe(false);
    const respectively = actions.find((action) => action.label.includes('分别'))!;
    expect(respectively.prompt).toContain('分别是');
    expect(respectively.draftOnly).toBe(true);
  });

  it('配置数不足不虚构：3 型号 2 配置的「分别」澄清 CTA 用「（补配置）」占位', async () => {
    const response = await ask(ruHolding12512State(), 'RU nova 14、Mate X6 和 nova 14 Pro 分别是 12+256 和 12+512 的价格趋势');
    expect(response.intent).toBe('clarify');
    const perModel = (response.suggestionActions ?? []).find((action) => action.label.includes('逐型号点名配置'))!;
    expect(perModel.prompt).toContain('（补配置）');
    expect(perModel.prompt).toContain('12+256');
    expect(perModel.prompt).toContain('12+512');
    expect(perModel.draftOnly).toBe(true);
  });

  it('时间范围澄清 CTA 不受影响（仍可直接执行、非 draftOnly）', async () => {
    const response = await ask(ruHolding12256State(), '近期价格趋势怎么样？');
    expect(response.intent).toBe('clarify');
    expect(response.summary).toContain('时间范围');
    const actions = response.suggestionActions ?? [];
    expect(actions.some((action) => action.prompt === '最近 8 周价格趋势' && !action.draftOnly)).toBe(true);
    // 时间澄清的动作不涉及型号/国家，不含 draftOnly 示例
    expect(actions.every((action) => action.label.includes('示例填入') === false || action.draftOnly === true)).toBe(true);
  });
});
