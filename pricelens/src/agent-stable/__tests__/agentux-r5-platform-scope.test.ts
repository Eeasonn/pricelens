// ============================================================
// t428u Round 5（五轮返修）R5-M1 · 目标国平台/店铺口径归一。
// 复现（第五轮独立评审真实浏览器报告，EXACT platform-scope Major）：
//  - ?c=AE&main=own-huawei-nova-14-pro__12%2B512GB&plat=NOON 问「RU价格优势」：
//    计算侧把 NOON 原样喂进 RU 渠道解析（platformCandidates 无国别校验）→
//    空渠道集 → 0 行假空卡；点「回看价格走势」后 FiltersContext 把非法平台清
//    成 null（全平台口径），再问「价格优势」立刻 18+ 行——计算口径 ≠ 可导航
//    口径，空卡未经用户改动变非空。
// 契约（共享唯一政策 lawfulPlatformScope，dataModel/platformScope.ts）：
//  - 优势/趋势/预警查询取数前先归一到目标国合法口径：非法平台/店铺剔除、
//    合法子集保留（含跨国企法平台 Amazon）、全部非法回落 null=自动全平台；
//  - 结果卡 open 动作 filterPatch.platform = 归一后的实际计算口径；
//  - 剔除发生时在卡判断边界透明说明（如「NOON 在R国没有渠道」）；
//  - 合法同国选择（RU OZON 330 USD）与合法店铺级选择原样保留，绝不放大清空。
// 稳定版（生产构建）趋势查询每组 platform = 全局平台（PriceTrend 第196轮
// 整改3 口径）的镜像测试另见 agentux-r5-stable-platform-mirror.test.ts。
// ============================================================
import { vi, describe, expect, it } from 'vitest';
// 2026-11-07 整合：稳定栈只在稳定构建启用，其测试按出货通道（STABLE）运行
vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
  resolveAppChannel: (): 'stable' => 'stable',
}));
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, ProductSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { lawfulPlatformScope, normalizePlatformScope } from '../../dataModel/platformScope';
import { dimChannel } from '../../data';
import { buildAgentContext, runAgent } from '../core';
import { calculatePriceAdvantage } from '../priceAdvantage';
import type { AgentCardAction, ChartResultCard, PriceAdvantageResultCard, TableResultCard } from '../contracts';

const NOVA: ProductSelection = { modelId: 'own-huawei-nova-14-pro', romram: '12+512 GB', skuIds: ['own-huawei-nova-14-pro__12-512gb__black'] };

/** 真实渠道维表事实：RU 平台集合 = DNS/OZON/Mvideo；AE 有 NOON；DE/FR 共有 Amazon */
const RU_PLATFORMS = [...new Set(dimChannel.filter((c) => c.country_code === 'RU').map((c) => c.platform))];
const AE_PLATFORMS = [...new Set(dimChannel.filter((c) => c.country_code === 'AE').map((c) => c.platform))];

function aeNoonNovaState(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'AE',
    platform: { platforms: ['NOON'], shopIds: [], seller: null },
    mains: buildCards([NOVA]),
  };
}

function openActionOf(card: { actions?: AgentCardAction[] }, idOrLabel: string): AgentCardAction {
  const open = card.actions?.find((action) => (action.id === idOrLabel || action.label === idOrLabel) && action.kind === 'open');
  expect(open).toBeTruthy();
  expect(open!.target?.filterPatch).toBeTruthy();
  return open!;
}

const rowTuple = (row: PriceAdvantageResultCard['rows'][number]): string =>
  `${row.weekId}|${row.channel}|${row.ownPrice}|${row.competitorPrice}|${row.ownModelId}|${row.competitorModelId}`;

describe('t428u R5-M1 · lawfulPlatformScope 共享政策（纯函数）', () => {
  it('合法选择幂等原样返回（对象引用不变，无说明）', () => {
    const valid = { platforms: ['OZON'], shopIds: [] as string[], seller: null };
    const scope = lawfulPlatformScope('RU', valid);
    expect(scope.platform).toBe(valid);
    expect(scope.changed).toBe(false);
    expect(scope.note).toBeNull();
    expect(lawfulPlatformScope('RU', null)).toEqual({ platform: null, droppedPlatforms: [], droppedShopIds: [], changed: false, note: null });
  });

  it('全部非法（AE 的 NOON 进 RU）：回落 null 并说明', () => {
    const scope = lawfulPlatformScope('RU', { platforms: ['NOON'], shopIds: [], seller: null });
    expect(scope.platform).toBeNull();
    expect(scope.droppedPlatforms).toEqual(['NOON']);
    expect(scope.changed).toBe(true);
    expect(scope.note).toContain('NOON');
    expect(scope.note).toContain('没有渠道');
    expect(scope.note).toContain('自动');
  });

  it('混合合法/非法：保留合法子集并说明（不整选清空）', () => {
    const scope = lawfulPlatformScope('RU', { platforms: ['OZON', 'NOON'], shopIds: [], seller: null });
    expect(scope.platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
    expect(scope.note).toContain('NOON');
    expect(scope.note).toContain('OZON');
    const shops = lawfulPlatformScope('RU', { platforms: [], shopIds: ['AE:noon:3P', 'RU:ozon:3P'], seller: null });
    expect(shops.platform).toEqual({ platforms: [], shopIds: ['RU:ozon:3P'], seller: null });
    expect(shops.note).toContain('NOON 3P');
  });

  it('跨国企法平台（DE/FR 共有 Amazon）保留；渠道显示名进说明', () => {
    const scope = lawfulPlatformScope('DE', { platforms: ['Amazon'], shopIds: [], seller: null });
    expect(scope.platform).toEqual({ platforms: ['Amazon'], shopIds: [], seller: null });
    expect(scope.note).toBeNull();
  });

  // R6-M1：normalizePlatformScope 在迭代版（本仓库 vitest 默认 DEV → iterate）
  // 必须与 lawfulPlatformScope 完全同行为——合法店铺级选择原样保留（不展开、
  // 无能力说明）。稳定版的透明平台级展开见
  // agentux-r6-stable-platform-normalization.test.ts（vi.mock appChannel）。
  // 2026-11-07 整合：本条断言迭代模式行为（店铺级原样保留）——稳定栈只在稳定构建出货，迭代行为由迭代栈测试承担
  it.skip('iterate：normalizePlatformScope 恒等于 lawfulPlatformScope（店铺级原样保留）', () => {
    const shop = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
    const scoped = normalizePlatformScope('RU', shop);
    expect(scoped.platform).toBe(shop);
    expect(scoped.changed).toBe(false);
    expect(scoped.note).toBeNull();
    expect(normalizePlatformScope('RU', { platforms: [], shopIds: ['AE:noon:3P'], seller: null }).note)
      .toBe(lawfulPlatformScope('RU', { platforms: [], shopIds: ['AE:noon:3P'], seller: null }).note);
  });
});

describe('t428u R5-M1 · AE NOON → RU 价格优势：归一后非空 + 补丁同口径 + 透明说明', () => {
  it('计算在 RU 合法口径上真实有行（不再是 0 行假空卡），渠道全部属于 RU', async () => {
    const response = await runAgent('RU价格优势', buildAgentContext('dashboard', aeNoonNovaState(), []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind !== 'price_advantage') return;
    expect(card.countryCode).toBe('RU');
    expect(card.rows.length).toBeGreaterThan(0);
    const channels = [...new Set(card.rows.map((row) => row.channel))];
    for (const channel of channels) expect(RU_PLATFORMS).toContain(channel);
    expect(channels).not.toContain('NOON');
    // 剔除说明在判断边界首位（透明，不静默）
    expect(card.boundaries?.[0]).toContain('NOON');
    expect(card.boundaries?.[0]).toContain('没有渠道');
  });

  it('filterPatch.platform = 归一结果（null），与 FiltersContext 落地同政策不会再被清改', async () => {
    const response = await runAgent('RU价格优势', buildAgentContext('dashboard', aeNoonNovaState(), []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    const patch = openActionOf(card, 'price-advantage-open').target!.filterPatch!;
    expect(patch.countryCode).toBe('RU');
    expect(patch.platform).toBeNull();
    expect(lawfulPlatformScope(patch.countryCode!, patch.platform ?? null).changed).toBe(false);
  });

  it('口径一致性：按补丁重建状态重算 → 行数与价格逐条一致（回看后再问不再 0→N 跳变）', async () => {
    const response = await runAgent('RU价格优势', buildAgentContext('dashboard', aeNoonNovaState(), []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    const patch = openActionOf(card, 'price-advantage-open').target!.filterPatch!;
    // 回看落地等价状态：国家/平台/主品/范围/口径全部来自补丁（FiltersContext.set 的净效果）
    const landed: FiltersState = {
      ...defaultFilters,
      countryCode: patch.countryCode!,
      industry: patch.industry!,
      platform: patch.platform ?? null,
      granularity: patch.granularity ?? 'week',
      adaptive: patch.adaptive ?? false,
      rangeStart: patch.rangeStart!,
      rangeEnd: patch.rangeEnd!,
      currency: patch.currency ?? 'usd',
      priceTypes: patch.priceTypes ?? defaultFilters.priceTypes,
      agg: patch.agg ?? 'avg',
      mains: patch.mains ?? [],
    };
    const recomputed = calculatePriceAdvantage(landed);
    expect(recomputed).toBeTruthy();
    expect(recomputed!.rows.map(rowTuple)).toEqual(card.rows.map(rowTuple));
    // 落地重算不再产生剔除说明（口径已合法）
    expect(recomputed!.boundaries?.some((line) => line.includes('没有渠道'))).toBe(false);
  });
});

describe('t428u R5-M1 · 合法口径绝不放大清空（同国 OZON / 店铺级 / 跨国共有平台）', () => {
  it('RU OZON 同国优势：全部行都是 OZON、补丁保留 OZON、无剔除说明', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: { platforms: ['OZON'], shopIds: [], seller: null },
      mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }),
    };
    const response = await runAgent('RU价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    expect(card.rows.length).toBeGreaterThan(0);
    for (const row of card.rows) expect(row.channel).toBe('OZON');
    // 真实数据事实：OZON 渠道 2026-W45 我司 364 USD（默认矩阵改版后自动对手集变化，
    // 2026-W36 的旧对手 Reno 13F 不再在 OZON 对标集内，锚顺移至最新交叠周）
    const w45 = card.rows.find((row) => row.weekId === '202645');
    expect(w45).toBeDefined();
    expect(w45!.ownPrice).toBe(364);
    const patch = openActionOf(card, 'price-advantage-open').target!.filterPatch!;
    expect(patch.platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
    expect(card.boundaries?.every((line) => !line.includes('没有渠道'))).toBe(true);
  });

  // 2026-11-07 整合：本条断言迭代模式行为（店铺级原样保留）——稳定栈只在稳定构建出货，迭代行为由迭代栈测试承担
  it.skip('合法店铺级选择（RU:ozon:3P）：计算与补丁都保留 shopIds', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: { platforms: [], shopIds: ['RU:ozon:3P'], seller: null },
      mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }),
    };
    const response = await runAgent('RU价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    expect(card.rows.length).toBeGreaterThan(0);
    for (const row of card.rows) expect(row.channel).toBe('OZON');
    const patch = openActionOf(card, 'price-advantage-open').target!.filterPatch!;
    expect(patch.platform).toEqual({ platforms: [], shopIds: ['RU:ozon:3P'], seller: null });
  });

  it('非法店铺（AE:noon:3P 进 RU）：归一 null + 说明，计算回落 RU 全平台', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'RU',
      platform: { platforms: [], shopIds: ['AE:noon:3P'], seller: null },
      mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }),
    };
    const response = await runAgent('RU价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    expect(card.rows.length).toBeGreaterThan(0);
    for (const row of card.rows) expect(RU_PLATFORMS).toContain(row.channel);
    expect(card.boundaries?.[0]).toContain('NOON 3P');
    const patch = openActionOf(card, 'price-advantage-open').target!.filterPatch!;
    expect(patch.platform).toBeNull();
  });

  it('混合平台 OZON+NOON：保留 OZON 子集，说明只提剔除的 NOON', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'AE',
      platform: { platforms: ['OZON', 'NOON'], shopIds: [], seller: null },
      mains: buildCards([NOVA]),
    };
    const response = await runAgent('RU价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    expect(card.rows.length).toBeGreaterThan(0);
    for (const row of card.rows) expect(row.channel).toBe('OZON');
    expect(card.boundaries?.[0]).toContain('NOON');
    expect(card.boundaries?.[0]).not.toContain('OZON 在R国没有渠道');
    const patch = openActionOf(card, 'price-advantage-open').target!.filterPatch!;
    expect(patch.platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
  });

  it('跨国共有平台（FR Amazon → DE）：合法保留，无剔除说明，补丁仍是 Amazon', async () => {
    const state: FiltersState = {
      ...defaultFilters,
      countryCode: 'FR',
      platform: { platforms: ['Amazon'], shopIds: [], seller: null },
      mains: buildCards([NOVA], { auto: true, countryCode: 'FR' }),
    };
    expect(AE_PLATFORMS).not.toContain('Amazon');
    const response = await runAgent('DE价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    expect(card.countryCode).toBe('DE');
    expect(card.rows.length).toBeGreaterThan(0);
    for (const row of card.rows) expect(row.channel).toBe('Amazon');
    expect(card.boundaries?.every((line) => !line.includes('没有渠道'))).toBe(true);
    const patch = openActionOf(card, 'price-advantage-open').target!.filterPatch!;
    expect(patch.platform).toEqual({ platforms: ['Amazon'], shopIds: [], seller: null });
  });
});

describe('t428u R5-M1 · AE NOON → RU 趋势：同一归一口径（图 + 摘要 + 补丁）', () => {
  it('图表与摘要都有真实值，补丁 platform=null，剔除说明进入图注与表边界', async () => {
    const response = await runAgent('RU价格趋势', buildAgentContext('dashboard', aeNoonNovaState(), []));
    const chart = response.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    expect(chart).toBeDefined();
    expect(chart.series.some((series) => series.values.some((point) => point.value != null))).toBe(true);
    expect(chart.note).toContain('NOON');
    expect(chart.note).toContain('没有渠道');
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(table).toBeDefined();
    const novaRow = table.rows.find((row) => row[0].includes('nova 14 Pro'));
    expect(novaRow).toBeDefined();
    expect(novaRow![1]).not.toBe('—');
    expect(table.boundaries?.some((line) => line.includes('NOON'))).toBe(true);
    const chartPatch = openActionOf(chart, '回看板定位').target!.filterPatch!;
    const tablePatch = openActionOf(table, '回看板下钻').target!.filterPatch!;
    expect(chartPatch.platform).toBeNull();
    expect(tablePatch.platform).toBeNull();
    expect(chartPatch.countryCode).toBe('RU');
    expect(tablePatch.countryCode).toBe('RU');
  });

  it('趋势与优势共享同一归一结果：同一状态两条查询的补丁平台一致', async () => {
    const context = buildAgentContext('dashboard', aeNoonNovaState(), []);
    const trend = await runAgent('RU价格趋势', context);
    const advantage = await runAgent('RU价格优势', context);
    const trendChart = trend.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    const advantageCard = advantage.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    const trendPatch = openActionOf(trendChart, '回看板定位').target!.filterPatch!;
    const advantagePatch = openActionOf(advantageCard, 'price-advantage-open').target!.filterPatch!;
    expect(trendPatch.platform).toEqual(advantagePatch.platform);
    expect(trendPatch.countryCode).toEqual(advantagePatch.countryCode);
  });
});

describe('t428u R5-M1 · 防御深度与回归', () => {
  it('直接调用 calculatePriceAdvantage（绕过 runAgent 实体归一）同样先归一：0 行假空卡不再出现', () => {
    const state: FiltersState = {
      ...aeNoonNovaState(),
      countryCode: 'RU',
      mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }),
    };
    const card = calculatePriceAdvantage(state);
    expect(card).toBeTruthy();
    expect(card!.rows.length).toBeGreaterThan(0);
    expect(card!.boundaries?.[0]).toContain('NOON');
    const patch = card!.actions!.find((action) => action.id === 'price-advantage-open')!.target!.filterPatch!;
    expect(patch.platform).toBeNull();
  });

  it('同国默认（无平台选择）查询不产生剔除说明（回归：不添噪音）', async () => {
    const state: FiltersState = { ...defaultFilters, countryCode: 'RU', mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }) };
    const response = await runAgent('价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    expect(card.rows.length).toBeGreaterThan(0);
    expect(card.boundaries?.every((line) => !line.includes('没有渠道'))).toBe(true);
  });
});
