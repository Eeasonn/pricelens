// ============================================================
// t428u Round 6 R6-M1 · 稳定版平台级透明归一（真实数据证人 + 全链路一致）。
// 第六轮独立评审 Major：合法店铺级选择（RU:ozon:3P）在趋势/优势卡的计算被
// platformLevelForChannel/platformCandidates 放大到平台级（OZON 1P+3P），但
// 归一 helper 与补丁/落地仍原样保留 shopIds——DTO 保留 ≠ 计算正确。
// 真实数据证人（生产事实包，非自然 UI）：RU nova 14（非 Pro）12+256GB Black，
// week 202619，USD —— 1P 332.62 / 3P 394.59；平台级 OZON 聚合 = 周内最低
// 332.62 → 333；严格 3P 独立聚合 394.59 → 395。
// 选定策略：稳定版全链路显式透明平台级归一（normalizePlatformScope = 国家
// 合法 + 店铺级透明展开平台级）——计算、行/图/最新值、buildSeries 实际渠道、
// open/apply 补丁与落地 state 全部一致；结果卡必须说明「稳定版仅支持平台级 +
// 店铺展开为平台」；迭代版店铺级行为不变（另见 agentux-r5-platform-scope）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { defaultFilters, FiltersProvider, useFilters } from '../../state/FiltersContext';
import type { FiltersActions, FiltersState, PlatformSelection, ProductSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { buildSeries, effectiveChannelIds, factRows } from '../../dataModel/aggregate';
import { lawfulPlatformScope, normalizePlatformScope } from '../../dataModel/platformScope';
import type { PlatformQuery } from '../../dataModel/types';
import { buildAgentContext, runAgent } from '../core';
import type { AgentAlertRecord, AgentCardAction, ChartResultCard, PriceAdvantageResultCard, TableResultCard } from '../contracts';

vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
}));

// 本仓库 vitest jsdom 不带 localStorage：装内存桩（同 FiltersContext.platform-scope 手法）
beforeEach(() => {
  const w = window as unknown as { localStorage?: Storage };
  if (!w.localStorage) {
    const mem = new Map<string, string>();
    const shim: Storage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, String(v)),
      removeItem: (k) => void mem.delete(k),
      clear: () => void mem.clear(),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
    Object.defineProperty(w, 'localStorage', { configurable: true, value: shim });
  }
  window.history.replaceState(null, '', '/?p=dashboard');
  sessionStorage.clear();
  try { localStorage.clear(); } catch { /* 内存桩缺失时忽略 */ }
});

afterEach(cleanup);

// 证人产品：nova 14（非 Pro）12+256GB Black —— 与 nova 14 Pro 严格区分
const NOVA14: ProductSelection = { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: ['own-huawei-nova-14__12-256gb__black'] };
const OZON_PLATFORM: PlatformSelection = { platforms: ['OZON'], shopIds: [], seller: null };
const OZON_3P_SHOP: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };

/** 店铺级全局选择 + 证人范围（week 202619 单周，USD）的稳定版状态 */
function witnessState(platform: PlatformSelection = OZON_3P_SHOP): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform,
    mains: buildCards([NOVA14], { auto: true, countryCode: 'RU' }),
    granularity: 'week',
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202619',
    currency: 'usd',
  };
}

function openActionOf(card: { actions?: AgentCardAction[] }, idOrLabel: string): AgentCardAction {
  const open = card.actions?.find((action) => (action.id === idOrLabel || action.label === idOrLabel) && action.kind === 'open');
  expect(open).toBeTruthy();
  expect(open!.target?.filterPatch).toBeTruthy();
  return open!;
}

const novaQuery = (platform: PlatformQuery | null) => ({
  scope: { countryCode: 'RU', industry: 'phone' as const },
  groups: [{ modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: ['own-huawei-nova-14__12-256gb__black'], isOwn: true, platform }],
  granularity: 'week' as const,
  startBucket: '202619',
  endBucket: '202619',
  currency: 'usd' as const,
  agg: 'avg' as const,
});

describe('t428u R6-M1 · 真实数据证人（nova 14 12+256 黑 W202619 USD：1P 332.62 / 3P 394.59）', () => {
  it('事实包原始行：OZON 1P = 332.62、OZON 3P = 394.59（USD，非套装行）', () => {
    const rows = factRows('RU', 'own-huawei-nova-14__12-256gb__black', '202619').filter((row) => !row.bundle);
    const p1 = rows.find((row) => row.channel_id === 'RU:ozon:1P')?.price_usd;
    const p3 = rows.find((row) => row.channel_id === 'RU:ozon:3P')?.price_usd;
    expect(p1).toBe(332.62);
    expect(p3).toBe(394.59);
  });

  it('聚合引擎独立复算：严格 3P = 395、严格 1P = 333、平台级 OZON = 333（周内最低 332.62）', () => {
    const strict3P = buildSeries(novaQuery({ platforms: [], shopIds: ['RU:ozon:3P'], seller: null }))[0];
    const strict1P = buildSeries(novaQuery({ platforms: [], shopIds: ['RU:ozon:1P'], seller: null }))[0];
    const platformLevel = buildSeries(novaQuery(OZON_PLATFORM))[0];
    expect(strict3P.points[0].price).toBe(395);
    expect(strict1P.points[0].price).toBe(333);
    expect(platformLevel.points[0].price).toBe(333);
    // 平台级实际渠道池 = OZON 全部渠道（1P + 3P），绝不含 DNS/Mvideo
    const channels = effectiveChannelIds('RU', OZON_PLATFORM);
    expect(channels).toContain('RU:ozon:1P');
    expect(channels).toContain('RU:ozon:3P');
    expect(channels.every((id) => id.startsWith('RU:ozon:'))).toBe(true);
  });

  it('数值证人锚定：平台级 333 ≠ 严格 3P 395（本次 Major 的口径差即此 62 美元）', () => {
    const platformLevel = buildSeries(novaQuery(OZON_PLATFORM))[0];
    const strict3P = buildSeries(novaQuery({ platforms: [], shopIds: ['RU:ozon:3P'], seller: null }))[0];
    expect(platformLevel.points[0].price).not.toBe(strict3P.points[0].price);
  });
});

describe('t428u R6-M1 · normalizePlatformScope 纯函数（stable：合法 + 能力一体化归一）', () => {
  it('合法店铺级（RU:ozon:3P）透明展开为平台级：shopIds 移除、说明三要素齐全', () => {
    const scope = normalizePlatformScope('RU', OZON_3P_SHOP);
    expect(scope.platform).toEqual(OZON_PLATFORM);
    expect(scope.changed).toBe(true);
    expect(scope.note).toContain('稳定版仅支持平台级');
    expect(scope.note).toContain('OZON 3P');
    expect(scope.note).toContain('OZON 平台');
    expect(scope.droppedShopIds).toEqual([]);
  });

  it('幂等：平台级/null 输入原样返回（引用不变、无说明、不误报 changed）', () => {
    const platformOnly = normalizePlatformScope('RU', OZON_PLATFORM);
    expect(platformOnly.platform).toBe(OZON_PLATFORM);
    expect(platformOnly).toEqual(lawfulPlatformScope('RU', OZON_PLATFORM));
    const once = normalizePlatformScope('RU', OZON_3P_SHOP);
    const twice = normalizePlatformScope('RU', once.platform);
    expect(twice.platform).toBe(once.platform);
    expect(twice.changed).toBe(false);
    expect(twice.note).toBeNull();
    const empty: PlatformSelection = { platforms: [], shopIds: [], seller: null };
    expect(normalizePlatformScope('RU', null).platform).toBeNull();
    expect(normalizePlatformScope('RU', empty).platform).toEqual(empty);
  });

  it('混合合法店铺（1P+3P 同平台）去重展开为单平台；说明同时提及两家店铺', () => {
    const scope = normalizePlatformScope('RU', { platforms: [], shopIds: ['RU:ozon:1P', 'RU:ozon:3P'], seller: null });
    expect(scope.platform).toEqual(OZON_PLATFORM);
    expect(scope.note).toContain('OZON 1P');
    expect(scope.note).toContain('OZON 3P');
  });

  it('多平台合法店铺（OZON 3P + DNS 独立站）映射到各自平台；平台+店铺并集输入合并去重', () => {
    const scope = normalizePlatformScope('RU', { platforms: [], shopIds: ['RU:ozon:3P', 'RU:dns:独立站'], seller: null });
    expect(scope.platform).toEqual({ platforms: ['OZON', 'DNS'], shopIds: [], seller: null });
    const union = normalizePlatformScope('RU', { platforms: ['DNS'], shopIds: ['RU:ozon:3P'], seller: null });
    expect(union.platform).toEqual({ platforms: ['DNS', 'OZON'], shopIds: [], seller: null });
  });

  it('混合合法+非法店铺：非法剔除说明 + 合法展开说明并存（不整选清空）', () => {
    const scope = normalizePlatformScope('RU', { platforms: [], shopIds: ['AE:noon:3P', 'RU:ozon:3P'], seller: null });
    expect(scope.droppedShopIds).toEqual(['AE:noon:3P']);
    expect(scope.platform).toEqual(OZON_PLATFORM);
    expect(scope.note).toContain('NOON 3P');
    expect(scope.note).toContain('没有渠道');
    expect(scope.note).toContain('稳定版仅支持平台级');
  });

  it('全部非法店铺（AE:noon:3P 进 RU）：回落 null = 自动全平台，保留 R5 剔除说明', () => {
    const scope = normalizePlatformScope('RU', { platforms: [], shopIds: ['AE:noon:3P'], seller: null });
    expect(scope.platform).toBeNull();
    expect(scope.note).toContain('NOON 3P');
    expect(scope.note).toContain('自动');
  });

  it('合法平台级选择（OZON）：无能力归一说明（不产生噪音）；卖家随店铺级退出', () => {
    const platformOnly = normalizePlatformScope('RU', OZON_PLATFORM);
    expect(platformOnly.note).toBeNull();
    expect(platformOnly.changed).toBe(false);
    const withSeller = normalizePlatformScope('RU', { platforms: [], shopIds: ['RU:ozon:3P'], seller: '某卖家' });
    expect(withSeller.platform).toEqual(OZON_PLATFORM);
    expect(withSeller.platform!.seller).toBeNull();
  });
});

describe('t428u R6-M1 · 趋势卡全链路（店铺级输入 → 平台级计算/补丁/落地一致）', () => {
  it('店铺级全局选择：卡上最新价 = 平台级 333（不是严格 3P 的 395），图注透明说明展开', async () => {
    const response = await runAgent('RU价格趋势', buildAgentContext('dashboard', witnessState(), []));
    const chart = response.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(chart).toBeDefined();
    expect(table).toBeDefined();
    const novaRow = table.rows.find((row) => row[0].includes('nova 14'));
    expect(novaRow).toBeDefined();
    expect(novaRow![0]).not.toContain('Pro');
    expect(novaRow![1]).toBe('333');
    expect(novaRow![1]).not.toBe('395');
    expect(novaRow![3]).toBe('OZON');
    const ownSeries = chart.series.find((series) => series.label.includes('nova 14'));
    const lastPoint = ownSeries?.values[ownSeries.values.length - 1];
    expect(lastPoint?.value).toBe(333);
    // 原始输入（店铺级）的展开说明保留在图注判断边界，即使 queryState 已归一
    expect(chart.note).toContain('稳定版仅支持平台级');
    expect(chart.note).toContain('OZON 3P');
    expect(table.boundaries?.some((line) => line.includes('稳定版仅支持平台级'))).toBe(true);
  });

  it('open 补丁不再保留 shopIds：platform = OZON 平台级，图/表同一份口径', async () => {
    const response = await runAgent('RU价格趋势', buildAgentContext('dashboard', witnessState(), []));
    const chart = response.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    const chartPatch = openActionOf(chart, '回看板定位').target!.filterPatch!;
    const tablePatch = openActionOf(table, '回看板下钻').target!.filterPatch!;
    expect(chartPatch.platform).toEqual(OZON_PLATFORM);
    expect(tablePatch.platform).toEqual(OZON_PLATFORM);
    expect(chartPatch.countryCode).toBe('RU');
    expect(tablePatch.rangeStart).toBe('202619');
    // 补丁渠道池与卡上数值的口径一致（平台级 333 的来源渠道集）
    const channels = effectiveChannelIds('RU', chartPatch.platform ?? null);
    expect(channels).toContain('RU:ozon:1P');
    expect(channels).toContain('RU:ozon:3P');
  });
});

describe('t428u R6-M1 · FiltersProvider 落地一致（补丁 → state → 重问仍 333）', () => {
  let currentState: FiltersState | null = null;
  let currentActions: FiltersActions | null = null;
  function Probe(): ReactNode {
    const { state, actions } = useFilters();
    currentState = state;
    currentActions = actions;
    return null;
  }

  it('open 补丁经 actions.set 落地：state 平台级无 shopIds，URL 写 plat=OZON，重问同值同口径', async () => {
    const first = await runAgent('RU价格趋势', buildAgentContext('dashboard', witnessState(), []));
    const table = first.cards.find((item) => item.kind === 'table') as TableResultCard;
    const patch = openActionOf(table, '回看板下钻').target!.filterPatch!;
    expect(patch.platform).toEqual(OZON_PLATFORM);

    currentState = null;
    currentActions = null;
    render(<FiltersProvider><Probe /></FiltersProvider>);
    expect(currentActions).toBeTruthy();
    act(() => { currentActions!.set(patch); });
    // 落地 state 与补丁同口径：不再保留 shopIds（post-navigation state 与计算一致）
    expect(currentState!.countryCode).toBe('RU');
    expect(currentState!.platform).toEqual(OZON_PLATFORM);
    expect(currentState!.mains.some((card) => card.main?.modelId === 'own-huawei-nova-14')).toBe(true);
    await waitFor(() => {
      expect(window.location.search).toContain('plat=OZON');
      expect(window.location.search).not.toContain('shop=');
    });

    // 回看落地后重问同一问题：最新价仍是平台级 333，取价口径 OZON，补丁一致
    const second = await runAgent('RU价格趋势', buildAgentContext('dashboard', currentState!, []));
    const table2 = second.cards.find((item) => item.kind === 'table') as TableResultCard;
    const novaRow2 = table2.rows.find((row) => row[0].includes('nova 14'));
    expect(novaRow2![1]).toBe('333');
    expect(novaRow2![3]).toBe('OZON');
    const patch2 = openActionOf(table2, '回看板下钻').target!.filterPatch!;
    expect(patch2.platform).toEqual(OZON_PLATFORM);
    // 已归一口径重问不再重复展开说明（幂等，无噪音）
    expect(second.cards.find((item) => item.kind === 'chart')).toBeDefined();
    const chart2 = second.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    expect(chart2.note).not.toContain('稳定版仅支持平台级');
  });
});

describe('t428u R6-M1 · 优势卡全链路（行渠道 = 实际计算渠道 OZON）', () => {
  // matrix-only（2026-11-10）：手机侧已无「OZON 1P < 3P 同周」的矩阵覆盖证人
  // （旧锚 nova 14 的矩阵对手 honor 200 Pro / redmi note15 pro 已退役），优势卡
  // 证人改用平板 MatePad Pro 2025 12.2" 12+512 PaperMatte（RU 矩阵对手 =
  // Galaxy Tab S11 11" 12+256；own 202619 OZON 1P 1024.64 < 3P 1046.97 → 平台级
  // 1025 ≠ 严格 3P 1047，判别力同构；Tab S11 的 OZON 1P 20.32 脏行低于参考价
  // 5% 被行级守卫剔除，OZON 最低 = 3P 916.67 → 917）。
  const TABLET: ProductSelection = { modelId: 'own-huawei-matepad-pro-2025', romram: '12.2" 12+512 GB PaperMatte', skuIds: ['own-huawei-matepad-pro-2025__12-2inwifi12-512gbpapermatte__x'] };
  function tabletWitnessState(platform: PlatformSelection = OZON_3P_SHOP): FiltersState {
    return {
      ...defaultFilters,
      countryCode: 'RU',
      industry: 'tablet',
      platform,
      mains: buildCards([TABLET], { auto: true, countryCode: 'RU' }),
      granularity: 'week',
      adaptive: false,
      rangeStart: '202619',
      rangeEnd: '202619',
      currency: 'usd',
    };
  }

  it('店铺级输入：W202619 我司平板价 1025（不是严格 3P 的 1047），行渠道全为 OZON，边界透明展开', async () => {
    const response = await runAgent('RU价格优势', buildAgentContext('dashboard', tabletWitnessState(), []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    expect(card).toBeDefined();
    expect(card.countryCode).toBe('RU');
    expect(card.rows.length).toBeGreaterThan(0);
    for (const row of card.rows) {
      expect(row.channel).toBe('OZON');
      expect(row.target.platform).toBe('OZON');
    }
    // 证人周：我司平板 1025 vs 唯一矩阵对手 Tab S11（OZON 最低 917；其 OZON 1P
    // 20.32 脏行低于参考价 5% 被行级守卫剔除，平台最低落在 3P 916.67）
    const w19 = card.rows.filter((row) => row.weekId === '202619' && row.ownModelId === 'own-huawei-matepad-pro-2025');
    expect(w19.length).toBeGreaterThan(0);
    for (const row of w19) {
      expect(row.ownPrice).toBe(1025);
      expect(row.ownPrice).not.toBe(1047);
    }
    const tabRow = w19.find((row) => row.competitorModelId === 'cmp-samsung-galaxy-tab-s11');
    expect(tabRow).toBeTruthy();
    expect(tabRow!.competitorPrice).toBe(917);
    expect(tabRow!.direction).toBe('lagging');
    expect(card.boundaries?.[0]).toContain('稳定版仅支持平台级');
    expect(card.boundaries?.[0]).toContain('OZON 3P');
    const patch = openActionOf(card, 'price-advantage-open').target!.filterPatch!;
    expect(patch.platform).toEqual(OZON_PLATFORM);
    expect(patch.granularity).toBe('week');
    expect(patch.rangeStart).toBe('202619');
    expect(patch.rangeEnd).toBe('202619');
  });

  it('口径差证人：同一周严格 3P 下我司 395 反而落后（361），平台级 333 占优——平台级归一是真实口径选择', () => {
    const strict3P = buildSeries(novaQuery({ platforms: [], shopIds: ['RU:ozon:3P'], seller: null }))[0];
    const honor3P = buildSeries({
      ...novaQuery({ platforms: [], shopIds: ['RU:ozon:3P'], seller: null }),
      groups: [{ modelId: 'cmp-honor-200-pro', romram: '12+512 GB', skuIds: ['cmp-honor-200-pro__12-512gb__black'], isOwn: false, platform: { platforms: [], shopIds: ['RU:ozon:3P'], seller: null } }],
    })[0];
    expect(strict3P.points[0].price).toBe(395);
    expect(honor3P.points[0].price).toBe(361);
    expect(strict3P.points[0].price! > honor3P.points[0].price!).toBe(true);
  });
});

describe('t428u R6-M1 · 预警卡（跳转补丁同归一 + 边界透明）', () => {
  const ALERT: AgentAlertRecord = {
    key: 'price-change|own-huawei-nova-14__12+256GB|202619',
    seriesKey: 'own-huawei-nova-14__12+256GB',
    type: 'price-change',
    brand: 'HUAWEI',
    modelName: 'nova 14',
    romram: '12+256 GB',
    weekLabel: '2026-W19',
    weekId: '202619',
    price: 333,
    wowPct: 0.011,
    promoDeltaPp: null,
    gapPct: null,
    gapLowPlatform: null,
    gapHighPlatform: null,
    gapLowPrice: null,
    gapHighPrice: null,
    isOwn: true,
  };

  it('店铺级 state 的预警卡：跳转/应用补丁平台已展开，判断边界携带说明', async () => {
    const response = await runAgent('查看价格预警', buildAgentContext('dashboard', witnessState(), [ALERT]));
    expect(response.intent).toBe('alert');
    const card = response.cards.find((item) => item.kind === 'alert');
    expect(card).toBeDefined();
    if (card?.kind !== 'alert') return;
    expect(card.boundaries?.[0]).toContain('稳定版仅支持平台级');
    const open = card.actions?.find((action) => action.label === '打开价格预警' && action.kind === 'open');
    expect(open?.target?.filterPatch?.platform).toEqual(OZON_PLATFORM);
    const apply = card.alerts?.[0]?.actions?.find((action) => action.kind === 'apply');
    expect(apply?.target?.filterPatch?.platform).toEqual(OZON_PLATFORM);
  });
});
