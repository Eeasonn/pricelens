// ============================================================
// t428u Round 7 R7-M1 · 稳定版平台口径归一的入口统一（setter 即时归一 +
// 旧持久化原始完整输入不再被有损前置归一裁掉）。
// 第七轮评审 Major 的两条复现：
//  1) 自然 UI（总览级联「全部店铺·最低价」提交 {shopIds:[RU:ozon:3P]}）在
//     Provider 同口径 actions.set 的直接返回分支原样落地——raw shopIds 留在
//     state 里直到 Agent 打开才收敛；要求 setter 处立即归一 + 页内可见说明；
//  2) v12 旧持久化先经 normalizePlatformSelection（店铺优先/多平台取一）+
//     platformLevelForChannel 两道有损前置归一：DNS+AE:noon:3P 丢 DNS 回落
//     null（auto 333），DNS+RU:ozon:3P 丢 DNS 只剩 OZON，纯 3P 的展开说明
//     在启动时丢失。要求原始完整输入直达共享「国家合法 + 稳定版能力」归一：
//     非法剔除、合法店铺透明展开所属平台、与显式平台并集去重、说明全程保留。
// 真实数据证人（生产事实包）：RU nova 14（非 Pro）12+256GB Black W202619 USD
// —— OZON 1P 332.62 / 3P 394.59：平台级 OZON = 333；DNS 独立站 335.98 → 336。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { defaultFilters, FiltersProvider, useFilters } from '../FiltersContext';
import type { FiltersActions, FiltersState, PlatformSelection } from '../filtersTypes';
import PlatformScopeNotice from '../../components/FilterBar/PlatformScopeNotice';
import { buildAgentContext, runAgent } from '../../agent/core';
import type { AgentAlertRecord, AgentCardAction, ChartResultCard, PriceAdvantageResultCard, TableResultCard } from '../../agent/contracts';
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

const novaSummaryRow = (table: TableResultCard): string[] | undefined =>
  table.rows.find((row) => row[0].includes('nova 14') && !row[0].includes('Pro'));

function openActionOf(card: { actions?: AgentCardAction[] }, label: string): AgentCardAction {
  const open = card.actions?.find((action) => action.label === label && action.kind === 'open');
  expect(open).toBeTruthy();
  expect(open!.target?.filterPatch).toBeTruthy();
  return open!;
}

describe('t428u R7-M1 · 同口径 actions.set 店铺级提交在 setter 处立即归一（自然 UI 写入口径）', () => {
  it('总览级联「全部店铺·最低价」形提交 {shopIds:[RU:ozon:3P]}：state 即时平台级 + 页内可见展开说明 + URL/存储无 shop', async () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    // 不带 mains、不换国——此前该分支原样返回 raw shopIds，直到 Agent 打开才收敛
    expect(handle.state().platform).toEqual(OZON_PLATFORM);
    expect(handle.state().platform!.shopIds).toEqual([]);
    const notice = handle.state().platformScopeNotice;
    expect(notice).toBeTruthy();
    expect(notice!.note).toContain('稳定版仅支持平台级');
    expect(notice!.note).toContain('OZON 3P');
    expect(notice!.countryCode).toBe('RU');
    expect(notice!.platform).toEqual(OZON_PLATFORM);
    // 页内条幅（组件路由）立即可见，不等 Agent
    const banner = screen.getByRole('status');
    expect(banner.getAttribute('data-platform-scope-note')).not.toBeNull();
    expect(banner.textContent).toContain('稳定版仅支持平台级');
    // URL / 持久化同步落平台级
    await waitFor(() => {
      expect(window.location.search).toContain('plat=OZON');
      expect(window.location.search).not.toContain('shop=');
    });
    const persisted = JSON.parse(localStorage.getItem('LPL3.filters') ?? '{}');
    expect(persisted.platform).toEqual(OZON_PLATFORM);
  });

  it('混合/多店铺输入在 setter 处并集去重：1P+3P → OZON 单平台；DNS+店铺 → DNS、OZON', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: { platforms: [], shopIds: ['RU:ozon:1P', 'RU:ozon:3P'], seller: null } }); });
    expect(handle.state().platform).toEqual(OZON_PLATFORM);
    act(() => { handle.actions().set({ platform: { platforms: ['DNS'], shopIds: ['RU:ozon:3P', 'RU:dns:独立站'], seller: null } }); });
    expect(handle.state().platform).toEqual({ platforms: ['DNS', 'OZON'], shopIds: [], seller: null });
    expect(handle.state().platformScopeNotice!.note).toContain('DNS、OZON');
  });

  it('同输入重复提交幂等：说明单条不叠加，条幅文本不重复出现', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    const first = handle.state().platformScopeNotice!.note;
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    expect(handle.state().platformScopeNotice!.note).toBe(first);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent!.split('稳定版仅支持平台级').length - 1).toBe(1);
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

  it('DNS + 合法店铺（RU:ozon:3P）：并集保留 DNS+OZON（不是只剩 OZON），state/URL/重载稳定', async () => {
    seedV12Storage({ platforms: ['DNS'], shopIds: ['RU:ozon:3P'], seller: null });
    const handle = renderFilters();
    expect(handle.state().platform).toEqual({ platforms: ['DNS', 'OZON'], shopIds: [], seller: null });
    expect(handle.state().platformScopeNotice!.note).toContain('展开为 DNS、OZON');
    await waitFor(() => {
      expect(window.location.search).toContain('plat=DNS%2COZON');
    });
    expect(window.location.search).not.toContain('shop=');
    const persisted = JSON.parse(localStorage.getItem('LPL3.filters') ?? '{}');
    expect(persisted.platform).toEqual({ platforms: ['DNS', 'OZON'], shopIds: [], seller: null });
    // 重载（同浏览器再次挂载 Provider，读已归一的持久化 + plat= 链接同值）——
    // 口径与说明都稳定（URL 解析产出的 seller 键缺省不影响集合语义）
    cleanup();
    const reloaded = renderFilters();
    expect(reloaded.state().platform!.platforms).toEqual(['DNS', 'OZON']);
    expect(reloaded.state().platform!.shopIds).toEqual([]);
    expect(reloaded.state().platformScopeNotice?.note).toContain('展开为 DNS、OZON');
    await waitFor(() => {
      expect(window.location.search).toContain('plat=DNS%2COZON');
    });
  });

  it('纯合法 3P 店铺（RU:ozon:3P）：启动即 OZON 平台级 + 页内可见展开说明', () => {
    seedV12Storage(OZON_3P_SHOP);
    const handle = renderFilters();
    expect(handle.state().platform).toEqual(OZON_PLATFORM);
    const notice = handle.state().platformScopeNotice;
    expect(notice).toBeTruthy();
    expect(notice!.note).toContain('稳定版仅支持平台级');
    expect(notice!.note).toContain('OZON 3P');
    expect(screen.getByRole('status').textContent).toContain('稳定版仅支持平台级');
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

  it('说明随持久化跨刷新保留（provenance 不因幂等重载丢失）', () => {
    seedV12Storage(OZON_3P_SHOP);
    const handle = renderFilters();
    expect(handle.state().platformScopeNotice).toBeTruthy();
    cleanup();
    currentState = null; currentActions = null;
    const reloaded = renderFilters();
    expect(reloaded.state().platform!.platforms).toEqual(['OZON']);
    expect(reloaded.state().platform!.shopIds).toEqual([]);
    expect(reloaded.state().platformScopeNotice?.note).toContain('稳定版仅支持平台级');
    expect(screen.getByRole('status')).toBeTruthy();
  });
});

describe('t428u R7-M1 · 纯 3P legacy 载荷的四类结果卡：展开说明进每个输出，补丁无店铺', () => {
  // 纯 3P 启动归一后的真实 Provider state（load 后的形态）
  function pure3PLoadedState(): FiltersState {
    seedV12Storage(OZON_3P_SHOP);
    const handle = renderFilters();
    const state = handle.state();
    expect(state.platform).toEqual(OZON_PLATFORM);
    expect(state.platformScopeNotice).toBeTruthy();
    return state;
  }

  it('趋势图卡 + 最新价格摘要：图注与表边界都携带展开说明，最新价 333 / 口径 OZON，open 补丁平台级', async () => {
    const state = pure3PLoadedState();
    const response = await runAgent('价格趋势', buildAgentContext('dashboard', state, []));
    const chart = response.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(chart).toBeDefined();
    expect(table).toBeDefined();
    expect(chart.note).toContain('稳定版仅支持平台级');
    expect(chart.note).toContain('OZON 3P');
    expect(table.boundaries?.some((line) => line.includes('稳定版仅支持平台级'))).toBe(true);
    const row = novaSummaryRow(table);
    expect(row![1]).toBe('333');
    expect(row![3]).toBe('OZON');
    const chartPatch = openActionOf(chart, '回看板定位').target!.filterPatch!;
    const tablePatch = openActionOf(table, '回看板下钻').target!.filterPatch!;
    expect(chartPatch.platform).toEqual(OZON_PLATFORM);
    expect(tablePatch.platform).toEqual(OZON_PLATFORM);
  });

  it('价格优势卡：判断边界首位为展开说明，W202619 我司 333，补丁平台级无 shopIds', async () => {
    const state = pure3PLoadedState();
    const response = await runAgent('价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    expect(card).toBeDefined();
    expect(card.boundaries?.[0]).toContain('稳定版仅支持平台级');
    expect(card.boundaries?.[0]).toContain('OZON 3P');
    const w19 = card.rows.filter((row) => row.weekId === '202619' && row.ownModelId === 'own-huawei-nova-14');
    expect(w19.length).toBeGreaterThan(0);
    for (const row of w19) expect(row.ownPrice).toBe(333);
    const patch = openActionOf(card, '回看价格走势').target!.filterPatch!;
    expect(patch.platform).toEqual(OZON_PLATFORM);
  });

  it('平台比较卡（最新有价周平台比较）：边界携带展开说明', async () => {
    const state = pure3PLoadedState();
    const response = await runAgent('nova 14 哪个平台最便宜', buildAgentContext('dashboard', state, []));
    const table = response.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(table).toBeDefined();
    expect(table.title).toBe('最新有价周平台比较');
    expect(table.boundaries?.some((line) => line.includes('稳定版仅支持平台级'))).toBe(true);
    expect(table.boundaries?.some((line) => line.includes('OZON 3P'))).toBe(true);
  });

  it('预警卡：判断边界引用落地 provenance（启动归一的展开事实同样可见）', async () => {
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
    expect(card.boundaries?.[0]).toContain('稳定版仅支持平台级');
  });
});

describe('t428u R7-M1 · 说明生命周期：deliberate 变更即失效，无关补丁不清说明', () => {
  it('显式选合法平台（DNS）→ 说明清空条幅消失；reset 同样不残留', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    expect(handle.state().platformScopeNotice).toBeTruthy();
    expect(screen.queryByRole('status')).toBeTruthy();
    act(() => { handle.actions().set({ platform: { platforms: ['DNS'], shopIds: [], seller: null } }); });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    expect(handle.state().platformScopeNotice).toBeTruthy();
    act(() => { handle.actions().reset(); });
    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('带 platform 键的 Agent 补丁落地（平台级）= 明确新输入：说明不残留（重问无展开噪音）', async () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    expect(handle.state().platformScopeNotice).toBeTruthy();
    act(() => { handle.actions().set({ platform: OZON_PLATFORM }); });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('换国后旧国说明不泄漏：RU 展开说明 → DE 剔除说明（或清空），绝不展示 RU 口径旧文', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    const ruNote = handle.state().platformScopeNotice!.note;
    expect(ruNote).toContain('OZON 3P');
    act(() => { handle.actions().set({ countryCode: 'DE' }); });
    expect(handle.state().countryCode).toBe('DE');
    // OZON 在 DE 无渠道 → null + DE 剔除说明；RU 的展开说明不再出现
    expect(handle.state().platform ?? null).toBeNull();
    const notice = handle.state().platformScopeNotice;
    if (notice) {
      expect(notice.countryCode).toBe('DE');
      expect(notice.note).not.toBe(ruNote);
    }
  });

  it('无关补丁（币种/粒度/时间）不清既有说明', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    const before = handle.state().platformScopeNotice!;
    act(() => { handle.actions().set({ currency: 'local' }); });
    expect(handle.state().platformScopeNotice).toEqual(before);
    act(() => { handle.actions().set({ granularity: 'month' }); });
    expect(handle.state().platformScopeNotice).toEqual(before);
    expect(screen.getByRole('status').textContent).toContain('稳定版仅支持平台级');
  });

  it('整态快照补丁（undo 形）随带说明口径吻合时恢复', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: OZON_3P_SHOP }); });
    const snapshot: FiltersState = { ...handle.state() };
    act(() => { handle.actions().set({ platform: { platforms: ['DNS'], shopIds: [], seller: null } }); });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    act(() => { handle.actions().set(snapshot); });
    expect(handle.state().platform).toEqual(OZON_PLATFORM);
    expect(handle.state().platformScopeNotice?.note).toContain('稳定版仅支持平台级');
  });
});

describe('t428u R7-M1 · 稳定版 URL：多平台不取一、往返不丢', () => {
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

  it('readUrlOverrides：plat=DNS,OZON 全量读入（不取第一个）；plat 与 shop 同存时 shop= 静默忽略、显式平台保留', () => {
    const multi = withWindowSearch('?c=RU&plat=DNS,OZON', () => readUrlOverrides());
    expect(multi.filters.platform).toEqual({ platforms: ['DNS', 'OZON'], shopIds: [] });
    const withShop = withWindowSearch('?c=RU&plat=DNS&shop=RU:ozon:3P', () => readUrlOverrides());
    expect(withShop.filters.platform).toEqual({ platforms: ['DNS'], shopIds: [] });
  });

  it('platformUrlParamsOf：多平台全量序列化；单平台输出与旧写侧一致（迭代版路径不变）', () => {
    expect(platformUrlParamsOf({ platforms: ['DNS', 'OZON'], shopIds: [], seller: null }).plat).toBe('DNS,OZON');
    expect(platformUrlParamsOf(OZON_PLATFORM)).toEqual({ plat: 'OZON', shop: null, seller: null });
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
