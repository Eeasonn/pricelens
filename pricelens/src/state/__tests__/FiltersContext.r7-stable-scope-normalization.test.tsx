// ============================================================
// t428u Round 7 R7-M1 · 稳定版平台口径归一的入口统一（setter 即时归一 +
// 旧持久化原始完整输入不再被有损前置归一裁掉）。
// 2026-11-14 Eason 拍板「平台还是能选到店铺」：R6-M1/R7-M1 的「稳定版仅支持
// 平台级」店铺展开政策退役——合法店铺级选择在 setter/持久化/URL/Agent 全链路
// 原样保留（钉该店铺集严格取价），无展开说明；非法剔除说明（R5）保留。
// 保留的归一纪律：setter/落地仍走 normalizePlatformScope（lawful）——非法店铺
// 剔除并透明说明、全部非法回落 null（自动全平台）；多值输入不再去重/展开，
// 并集语义由数据层 effectiveChannelIds 承担。
// 真实数据证人（生产事实包）：RU nova 14（非 Pro）12+256GB Black W202619 USD
// —— OZON 1P 332.62 / 3P 394.59：平台级 OZON = 333；严格 3P = 395；DNS 独立站
// 335.98 → 336。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { defaultFilters, FiltersProvider, useFilters } from '../FiltersContext';
import type { FiltersActions, FiltersState, PlatformSelection } from '../filtersTypes';
import PlatformScopeNotice from '../../components/FilterBar/PlatformScopeNotice';
import { buildAgentContext, runAgent } from '../../agent-stable/core';
import type { AgentAlertRecord, AgentCardAction, ChartResultCard, PriceAdvantageResultCard, TableResultCard } from '../../agent-stable/contracts';
import { platformUrlParamsOf, readUrlOverrides } from '../urlSync';

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

const OZON_PLATFORM: PlatformSelection = { platforms: ['OZON'], shopIds: [], seller: null };
const OZON_3P_SHOP: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
const AE_NOON_SHOP: PlatformSelection = { platforms: [], shopIds: ['AE:noon:3P'], seller: null };

let currentState: FiltersState | null = null;
let currentActions: FiltersActions | null = null;

function Probe(): ReactNode {
  const { state, actions } = useFilters();
  currentState = state;
  currentActions = actions;
  return null;
}

/** Provider + 页内说明条幅（真实组件路由：条幅在筛选卡内读 useFilters 渲染） */
function renderFilters(): { state: () => FiltersState; actions: () => FiltersActions } {
  currentState = null;
  currentActions = null;
  render(
    <FiltersProvider>
      <PlatformScopeNotice />
      <Probe />
    </FiltersProvider>,
  );
  expect(currentState).toBeTruthy();
  expect(currentActions).toBeTruthy();
  return { state: () => currentState!, actions: () => currentActions! };
}

/** v12 持久化载荷（与浏览器受控 fixture 同形；readPersistedState 把 alertSubs 列为
 *  required——缺键整包作废回落默认）。nova 14（非 Pro）12+256 黑 + 指定平台口径。 */
function seedV12Storage(platform: unknown): void {
  localStorage.setItem('LPL3.filters', JSON.stringify({
    countryCode: 'RU', industry: 'phone',
    mains: [{ id: 'seed-1', main: { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: ['own-huawei-nova-14__12-256gb__black'] }, compares: [], auto: true }],
    platform,
    granularity: 'week', adaptive: false, rangeStart: '202619', rangeEnd: '202619',
    currency: 'usd', priceTypes: { discounted: true, rrp: false }, agg: 'avg',
    alertSubs: [], v: 12,
  }));
}

/** matrix-only（2026-11-10）平板证人版载荷：优势卡需要矩阵覆盖 + OZON 1P<3P 的
 *  同周真实事实——nova 14 的矩阵对手已退役，改用 MatePad Pro 2025 12.2" 12+512
 *  PaperMatte（矩阵对手 Tab S11；own OZON 1P 1024.64 → 1025、3P 1046.97 → 1047）。 */
function seedV12StorageTablet(platform: unknown): void {
  localStorage.setItem('LPL3.filters', JSON.stringify({
    countryCode: 'RU', industry: 'tablet',
    mains: [{ id: 'seed-tab-1', main: { modelId: 'own-huawei-matepad-pro-2025', romram: '12.2" 12+512 GB PaperMatte', skuIds: ['own-huawei-matepad-pro-2025__12-2inwifi12-512gbpapermatte__x'] }, compares: [], auto: true }],
    platform,
    granularity: 'week', adaptive: false, rangeStart: '202619', rangeEnd: '202619',
    currency: 'usd', priceTypes: { discounted: true, rrp: false }, agg: 'avg',
    alertSubs: [], v: 12,
  }));
}

const novaSummaryRow = (table: TableResultCard): string[] | undefined =>
  table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro'));

function openActionOf(card: { actions?: AgentCardAction[] }, label: string): AgentCardAction {
  const open = card.actions?.find((action) => action.label === label && action.kind === 'open');
  expect(open).toBeTruthy();
  expect(open!.target?.filterPatch).toBeTruthy();
  return open!;
}

describe('t428u R7-M1 · 同口径 actions.set 店铺级提交原样落地（2026-11-14 店铺级恢复）', () => {
  it('总览级联形提交 {shopIds:[RU:ozon:3P]}：state 即时店铺级保留、无展开说明、URL/存储带 shop', async () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    expect(handle.state().platform).toEqual(OZON_3P_SHOP);
    expect(handle.state().platform!.shopIds).toEqual(['RU:ozon:3P']);
    // 合法店铺级不产生归一说明（展开政策退役），页内无条幅
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    // URL / 持久化同步店铺级
    await waitFor(() => {
      expect(window.location.search).toContain('plat=OZON');
      expect(window.location.search).toContain('shop=');
    });
    const persisted = JSON.parse(localStorage.getItem('LPL3.filters') ?? '{}');
    expect(persisted.platform).toEqual(OZON_3P_SHOP);
  });

  it('混合/多店铺输入原样保留（不去重不展开，并集语义由渠道层承担）', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: { platforms: [], shopIds: ['RU:ozon:1P', 'RU:ozon:3P'], seller: null } }); });
    expect(handle.state().platform).toEqual({ platforms: [], shopIds: ['RU:ozon:1P', 'RU:ozon:3P'], seller: null });
    act(() => { handle.actions().set({ platform: { platforms: ['DNS'], shopIds: ['RU:ozon:3P', 'RU:dns:独立站'], seller: null } }); });
    expect(handle.state().platform).toEqual({ platforms: ['DNS'], shopIds: ['RU:ozon:3P', 'RU:dns:独立站'], seller: null });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
  });

  it('同输入重复提交幂等：state 稳定、无说明无条幅噪音', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    const first = handle.state().platform;
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    expect(handle.state().platform).toEqual(first);
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('t428u R7-M1 · v12 旧持久化：原始完整输入直达共享归一（不再有损前置）', () => {
  it('DNS + 外国店铺（AE:noon:3P）在 RU：丢弃非法店铺保留 DNS → 实际 DNS 336（不是回落 auto 的 OZON 333）', async () => {
    seedV12Storage({ platforms: ['DNS'], shopIds: ['AE:noon:3P'], seller: null });
    const handle = renderFilters();
    expect(handle.state().platform).toEqual({ platforms: ['DNS'], shopIds: [], seller: null });
    const notice = handle.state().platformScopeNotice;
    expect(notice).toBeTruthy();
    expect(notice!.note).toContain('NOON 3P');
    expect(notice!.note).toContain('没有渠道');
    expect(notice!.note).toContain('DNS');
    expect(screen.getByRole('status').textContent).toContain('没有渠道');
    // 实际取数按 DNS：W202619 = 336（DNS 独立站 335.98），不再是旧链路的 auto OZON 333
    const response = await runAgent('价格趋势', buildAgentContext('dashboard', handle.state(), []));
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    const row = novaSummaryRow(table);
    expect(row).toBeDefined();
    expect(row![1]).toBe('336');
    expect(row![3]).toBe('DNS');
  });

  it('DNS + 合法店铺（RU:ozon:3P）：并集原样保留（DNS 平台 + OZON 店铺），state/URL/重载稳定', async () => {
    seedV12Storage({ platforms: ['DNS'], shopIds: ['RU:ozon:3P'], seller: null });
    const handle = renderFilters();
    expect(handle.state().platform).toEqual({ platforms: ['DNS'], shopIds: ['RU:ozon:3P'], seller: null });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    await waitFor(() => {
      expect(window.location.search).toContain('plat=DNS');
      expect(window.location.search).toContain('shop=');
    });
    const persisted = JSON.parse(localStorage.getItem('LPL3.filters') ?? '{}');
    expect(persisted.platform).toEqual({ platforms: ['DNS'], shopIds: ['RU:ozon:3P'], seller: null });
    // 重载（同浏览器再次挂载 Provider，读已归一的持久化 + plat/shop 链接同值）——口径稳定
    cleanup();
    const reloaded = renderFilters();
    expect(reloaded.state().platform!.platforms).toEqual(['DNS']);
    expect(reloaded.state().platform!.shopIds).toEqual(['RU:ozon:3P']);
    expect(reloaded.state().platformScopeNotice ?? null).toBeNull();
    await waitFor(() => {
      expect(window.location.search).toContain('shop=');
    });
  });

  it('纯合法 3P 店铺（RU:ozon:3P）：启动即店铺级保留 + 无展开说明', () => {
    seedV12Storage(OZON_3P_SHOP);
    const handle = renderFilters();
    expect(handle.state().platform).toEqual(OZON_3P_SHOP);
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('纯合法平台级（OZON）：无说明无噪音；全部非法（NOON 平台 + AE 店铺）回落 null 并保留透明说明', () => {
    seedV12Storage(OZON_PLATFORM);
    const handle = renderFilters();
    expect(handle.state().platform).toEqual(OZON_PLATFORM);
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    cleanup();
    currentState = null; currentActions = null;
    // 隔离：上一渲染的 URL 写入（plat=OZON）会以「链接 > 持久化」覆写本场景的存储载荷
    window.history.replaceState(null, '', '/?p=dashboard');
    seedV12Storage({ platforms: ['NOON'], shopIds: ['AE:noon:3P'], seller: null });
    const handle2 = renderFilters();
    expect(handle2.state().platform).toBeNull();
    const notice2 = handle2.state().platformScopeNotice;
    expect(notice2).toBeTruthy();
    expect(notice2!.note).toContain('没有渠道');
    expect(notice2!.note).toContain('自动');
    expect(screen.getByRole('status').textContent).toContain('自动');
  });

  it('店铺级跨刷新保留（provenance 无说明噪音，platform 原样）', () => {
    seedV12Storage(OZON_3P_SHOP);
    const handle = renderFilters();
    expect(handle.state().platform).toEqual(OZON_3P_SHOP);
    cleanup();
    currentState = null; currentActions = null;
    const reloaded = renderFilters();
    expect(reloaded.state().platform).toEqual(OZON_3P_SHOP);
    expect(reloaded.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('t428u R7-M1 · 纯 3P legacy 载荷的四类结果卡：店铺级严格取价，补丁带店铺', () => {
  // 纯 3P 启动后的真实 Provider state（load 后的形态）
  function pure3PLoadedState(): FiltersState {
    seedV12Storage(OZON_3P_SHOP);
    const handle = renderFilters();
    const state = handle.state();
    expect(state.platform).toEqual(OZON_3P_SHOP);
    expect(state.platformScopeNotice ?? null).toBeNull();
    return state;
  }

  it('趋势图卡 + 最新价格摘要：最新价 395（严格 3P）/ 口径 OZON 3P，open 补丁带店铺', async () => {
    const state = pure3PLoadedState();
    const response = await runAgent('价格趋势', buildAgentContext('dashboard', state, []));
    const chart = response.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(chart).toBeDefined();
    expect(table).toBeDefined();
    expect(chart.note).not.toContain('稳定版仅支持平台级');
    expect(table.boundaries?.some((line) => line.includes('稳定版仅支持平台级')) ?? false).toBe(false);
    const row = novaSummaryRow(table);
    expect(row![1]).toBe('395');
    expect(row![3]).toBe('OZON 3P');
    const chartPatch = openActionOf(chart, '回看板定位').target!.filterPatch!;
    const tablePatch = openActionOf(table, '回看板下钻').target!.filterPatch!;
    expect(chartPatch.platform).toEqual(OZON_3P_SHOP);
    expect(tablePatch.platform).toEqual(OZON_3P_SHOP);
  });

  it('价格优势卡：W202619 我司平板 1047（严格 3P，非平台级 1025），补丁带店铺级 shopIds', async () => {
    // matrix-only（2026-11-10）：优势卡证人改用平板载荷（nova 14 无矩阵对比位，
    // 优势恒 0 行）；「店铺级严格取价 + 店铺级补丁」的语义不变。
    seedV12StorageTablet(OZON_3P_SHOP);
    renderFilters();
    const state = currentState!;
    expect(state.platform).toEqual(OZON_3P_SHOP);
    expect(state.platformScopeNotice ?? null).toBeNull();
    const response = await runAgent('价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    expect(card).toBeDefined();
    expect(card.boundaries?.some((line) => line.includes('稳定版仅支持平台级')) ?? false).toBe(false);
    const w19 = card.rows.filter((row) => row.weekId === '202619' && row.ownModelId === 'own-huawei-matepad-pro-2025');
    expect(w19.length).toBeGreaterThan(0);
    for (const row of w19) expect(row.ownPrice).toBe(1047);
    const patch = openActionOf(card, '回看价格走势').target!.filterPatch!;
    expect(patch.platform).toEqual(OZON_3P_SHOP);
  });

  it('平台比较卡（最新有价周平台比较）：无展开说明噪音', async () => {
    const state = pure3PLoadedState();
    const response = await runAgent('nova 14 哪个平台最便宜', buildAgentContext('dashboard', state, []));
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(table).toBeDefined();
    expect(table.title).toBe('最新有价周平台比较');
    expect(table.boundaries?.some((line) => line.includes('稳定版仅支持平台级')) ?? false).toBe(false);
  });

  it('预警卡：判断边界无展开说明', async () => {
    const state = pure3PLoadedState();
    const alert: AgentAlertRecord = {
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
    const response = await runAgent('查看价格预警', buildAgentContext('dashboard', state, [alert]));
    const card = response.cards.find((item) => item.kind === 'alert');
    expect(card).toBeDefined();
    if (card?.kind !== 'alert') return;
    expect(card.boundaries?.some((line) => line.includes('稳定版仅支持平台级')) ?? false).toBe(false);
  });
});

describe('t428u R7-M1 · 说明生命周期（剔除说明）：deliberate 变更即失效，无关补丁不清说明', () => {
  it('非法店铺回落 null（带剔除说明）→ 显式选合法平台清空条幅；reset 同样不残留', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: AE_NOON_SHOP }); });
    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice).toBeTruthy();
    expect(screen.queryByRole('status')).toBeTruthy();
    act(() => { handle.actions().set({ platform: { platforms: ['DNS'], shopIds: [], seller: null } }); });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    act(() => { handle.actions().set({ platform: AE_NOON_SHOP }); });
    expect(handle.state().platformScopeNotice).toBeTruthy();
    act(() => { handle.actions().reset(); });
    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('带 platform 键的 Agent 补丁落地（null 口径）：R8-M1 起同口径继承既有剔除说明；显式 null = deliberate 清除', async () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: AE_NOON_SHOP }); });
    const notice = handle.state().platformScopeNotice;
    expect(notice).toBeTruthy();
    // R8-M1（第八轮评审 Medium）：Agent open/apply 补丁携带归一后的规范口径
    // 且不带说明键——同口径交接必须继承仍成立的说明。null 口径补丁 = 同口径
    // （自动全平台），剔除说明继承；显式 platformScopeNotice:null 承接 deliberate 清除。
    act(() => { handle.actions().set({ platform: null }); });
    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice ?? null).not.toBeFalsy();
    expect(handle.state().platformScopeNotice!.note).toContain('没有渠道');
    expect(screen.queryByRole('status')).toBeTruthy();
    act(() => { handle.actions().set({ platform: null, platformScopeNotice: null }); });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    void notice;
  });

  it('换国后旧国说明不泄漏：RU 合法店铺 → DE 非法剔除说明（或清空），绝不展示 RU 口径旧文', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    act(() => { handle.actions().set({ countryCode: 'DE' }); });
    expect(handle.state().countryCode).toBe('DE');
    // OZON 在 DE 无渠道 → null + DE 剔除说明；RU 的店铺口径不再出现
    expect(handle.state().platform ?? null).toBeNull();
    const notice = handle.state().platformScopeNotice;
    if (notice) {
      expect(notice.countryCode).toBe('DE');
      expect(notice.note).toContain('没有渠道');
    }
  });

  it('无关补丁（币种/粒度/时间）不清既有剔除说明', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: AE_NOON_SHOP }); });
    const before = handle.state().platformScopeNotice!;
    act(() => { handle.actions().set({ currency: 'local' }); });
    expect(handle.state().platformScopeNotice).toEqual(before);
    act(() => { handle.actions().set({ granularity: 'month' }); });
    expect(handle.state().platformScopeNotice).toEqual(before);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');
  });

  it('整态快照补丁（undo 形）随带说明口径吻合时恢复', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: AE_NOON_SHOP }); });
    const snapshot: FiltersState = { ...handle.state() };
    act(() => { handle.actions().set({ platform: { platforms: ['DNS'], shopIds: [], seller: null } }); });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    act(() => { handle.actions().set(snapshot); });
    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice?.note).toContain('没有渠道');
  });
});

describe('t428u R7-M1 · 稳定版 URL：多平台不取一、店铺级恢复后 shop= 优先、往返不丢', () => {
  function withWindowSearch<T>(search: string, fn: () => T): T {
    const g = globalThis as { window?: unknown };
    const prev = g.window;
    g.window = { location: { search } };
    try {
      return fn();
    } finally {
      if (prev === undefined) delete g.window;
      else g.window = prev;
    }
  }

  it('readUrlOverrides：plat=DNS,OZON 全量读入（不取第一个）；plat 与 shop 同存——异平台混合并集保留', () => {
    const multi = withWindowSearch('?c=RU&plat=DNS,OZON', () => readUrlOverrides());
    expect(multi.filters.platform).toEqual({ platforms: ['DNS', 'OZON'], shopIds: [] });
    // plat=DNS ≠ 店铺归属平台（OZON）→ 混合并集 {DNS 平台 + OZON 店铺} 原样保留；
    // plat= 恰为店铺归属平台时按纯店铺级归一（不放大成整平台口径）
    const withShop = withWindowSearch('?c=RU&plat=DNS&shop=RU:ozon:3P', () => readUrlOverrides());
    expect(withShop.filters.platform).toEqual({ platforms: ['DNS'], shopIds: ['RU:ozon:3P'], seller: null });
    const pureShop = withWindowSearch('?c=RU&plat=OZON&shop=RU:ozon:3P', () => readUrlOverrides());
    expect(pureShop.filters.platform).toEqual({ platforms: [], shopIds: ['RU:ozon:3P'], seller: null });
  });

  it('platformUrlParamsOf：多平台全量序列化；店铺级写 plat+shop（迭代版路径不变）', () => {
    expect(platformUrlParamsOf({ platforms: ['DNS', 'OZON'], shopIds: [], seller: null }).plat).toBe('DNS,OZON');
    expect(platformUrlParamsOf(OZON_PLATFORM)).toEqual({ plat: 'OZON', shop: null, seller: null });
    expect(platformUrlParamsOf(OZON_3P_SHOP)).toEqual({ plat: 'OZON', shop: 'RU:ozon:3P', seller: null });
    expect(platformUrlParamsOf(null)).toEqual({ plat: null, shop: null, seller: null });
  });

  it('支持 URL 多平台 → Provider 落地 → 再序列化往返稳定', async () => {
    window.history.replaceState(null, '', '/?p=dashboard&c=RU&plat=DNS,OZON&rs=202619&re=202619');
    const handle = renderFilters();
    expect(handle.state().platform!.platforms).toEqual(['DNS', 'OZON']);
    expect(handle.state().platform!.shopIds).toEqual([]);
    expect(handle.state().platformScopeNotice ?? null).toBeNull(); // 合法输入无说明（无噪音）
    await waitFor(() => {
      expect(window.location.search).toContain('plat=DNS%2COZON');
    });
  });

  it('URL 店铺级（shop=）→ Provider 落地 → 再序列化往返带 shop', async () => {
    window.history.replaceState(null, '', '/?p=dashboard&c=RU&shop=RU:ozon:3P&rs=202619&re=202619');
    const handle = renderFilters();
    expect(handle.state().platform).toEqual(OZON_3P_SHOP);
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    await waitFor(() => {
      expect(window.location.search).toContain('shop=');
      expect(window.location.search).toContain('plat=OZON');
    });
  });
});

describe('t428u R7-M1 · 回归钉：迭代版行为不变（同仓默认通道文件另行覆盖，此处钉稳定版默认视图）', () => {
  it('默认视图（无存储无 URL）platform=null、无说明；合法 OZON 链接照旧', () => {
    window.history.replaceState(null, '', '/?p=dashboard');
    const handle = renderFilters();
    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    act(() => { handle.actions().set({ platform: OZON_PLATFORM }); });
    expect(handle.state().platform).toEqual(OZON_PLATFORM);
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
  });
});
