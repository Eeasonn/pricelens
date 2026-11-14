// ============================================================
// t428u Round 8 R8-M1 · 同口径交接（Agent 结果卡 open/apply 落地）不得丢失
// 平台口径归一说明（platformScopeNotice provenance）。
// 第八轮评审 Medium 复现：R7 setter 的 platform 键分支只把「补丁随带的说明」
// 交给 resolveScopeNotice——Agent 结果卡 open 补丁（core.scopePatchOf /
// priceAdvantage.scopePatch / alertFilterPatch）携带的是归一后的规范口径且
// 不带说明键（validateFilterPatch 也不放行该键），幂等归一无新说明时
// resolveScopeNotice 返回 null，把「仍能描述当前口径」的既有说明清掉：
// 页内条幅消失、新查询卡不再披露、刷新后持久化里也没有。
// 修复：setter 落地时补丁缺说明键 = 继承落地前 state 上「国家 + 口径集合相等」
// 仍成立的说明；补丁显式 platformScopeNotice:null = deliberate 清除；真正换国/
// 换平台/重置的旧说明经同一集合校验自然失效；本次归一新说明仍最优先。
// 2026-11-14 Eason「平台还是能选到店铺」：店铺展开说明退役——合法店铺级选择
// 不再产生任何说明（钉店铺严格取价）。说明的唯一来源 = 非法剔除（R5），本文件
// 的交接语义改用「全部非法店铺回落 null 自动口径 + 剔除说明」作证场景。
// 全链路用真实生产 runAgent + FiltersProvider（含页内条幅组件路由与持久化），
// 断言落在落地后的 LATEST state / LATEST 查询卡 / 重载，不吃历史卡残留。
// 真实数据证人（生产事实包）：RU nova 14（非 Pro）12+256GB Black W202619 USD
// —— 自动全平台口径 = 333（OZON 1P 332.62 周内最低）；DNS 独立站 335.98 → 336。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FiltersProvider, useFilters } from '../FiltersContext';
import type { FiltersActions, FiltersState, PlatformScopeNotice, PlatformSelection } from '../filtersTypes';
import PlatformScopeNoticeBanner from '../../components/FilterBar/PlatformScopeNotice';
import { platformQueryEquals } from '../../dataModel/platformScope';
import { buildAgentContext, runAgent } from '../../agent-stable/core';
import type { AgentAlertRecord, AgentCardAction, ChartResultCard, PriceAdvantageResultCard, TableResultCard } from '../../agent-stable/contracts';

vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
}));

// 本仓库 vitest jsdom 不带 localStorage：装内存桩（同 R7 测试手法）
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
const DNS_PLATFORM: PlatformSelection = { platforms: ['DNS'], shopIds: [], seller: null };
const DNS_OZON_PLATFORM: PlatformSelection = { platforms: ['DNS', 'OZON'], shopIds: [], seller: null };
/** 全非法店铺（NOON 平台 + AE 店铺带进 RU）：lawful 回落 null + 剔除说明——
 *  2026-11-14 店铺展开退役后，这是唯一还产出口径说明的场景 */
const ILLEGAL_NOON: PlatformSelection = { platforms: ['NOON'], shopIds: ['AE:noon:3P'], seller: null };

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
      <PlatformScopeNoticeBanner />
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

/** matrix-only（2026-11-10）平板证人版载荷：优势卡 open 交接需要真实行——
 *  nova 14 的矩阵对手已退役，改用 MatePad Pro 2025 12.2" 12+512 PaperMatte
 *  （矩阵对手 Tab S11；own W202619 OZON 平台级 1025 ≠ 严格 3P 1047）。 */
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

/** 持久化里的说明（等待 Provider 的写盘 effect 跑完） */
async function persistedNotice(): Promise<PlatformScopeNotice | null | undefined> {
  return await waitFor(() => {
    const persisted = JSON.parse(localStorage.getItem('LPL3.filters') ?? '{}');
    return persisted.platformScopeNotice as PlatformScopeNotice | null | undefined;
  });
}

/** 模拟刷新：卸载再挂载（读 localStorage + URL，与浏览器 F5 同链路） */
function reloadFilters(): { state: () => FiltersState; actions: () => FiltersActions } {
  cleanup();
  return renderFilters();
}

// ------------------------------------------------------------
// 四类结果卡（真实 runAgent）→ open 补丁真实 actions.set → LATEST 断言
// （说明场景 = 全非法店铺回落 null 自动口径 + R5 剔除说明；2026-11-14 起
// 合法店铺级不产说明，展开说明场景随政策退役）
// ------------------------------------------------------------
describe('t428u R8-M1 · 全非法店铺载荷（null 口径 + 剔除说明）：四类结果卡 open 落地后说明/条幅/新查询/重载全链路保留', () => {
  it('趋势图卡「回看板定位」：open 补丁（null 口径）落地继承说明，新查询图注/摘要边界仍披露，重载后条幅仍在（无重复叠加）', async () => {
    seedV12Storage(ILLEGAL_NOON);
    const handle = renderFilters();
    const original = handle.state().platformScopeNotice;
    expect(original).toBeTruthy();
    expect(original!.note).toContain('没有渠道');
    expect(original!.note).toContain('NOON 3P');

    const first = await runAgent('价格趋势', buildAgentContext('dashboard', handle.state(), []));
    const chart1 = first.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    const patch = openActionOf(chart1, '回看板定位').target!.filterPatch!;
    expect(patch.platform ?? null).toBeNull();
    act(() => { handle.actions().set(patch); });

    // 落地后 LATEST state：同口径（null = 自动全平台）说明原样继承（对象级相等），条幅仍可见且单条
    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice).toEqual(original);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');

    // 新查询（落地后的 state 重新跑真实 runAgent）：LATEST 图注 + 摘要边界 + 自动口径 333
    const second = await runAgent('价格趋势', buildAgentContext('dashboard', handle.state(), []));
    const chart2 = second.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    const table2 = second.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(chart2.note).toContain('没有渠道');
    expect(table2.boundaries?.some((line) => line.includes('没有渠道'))).toBe(true);
    const row = novaSummaryRow(table2);
    expect(row![1]).toBe('333');

    // 持久化 + 重载：说明与原始一致（URL 解析产出的 seller 键缺省不影响集合语义）
    expect(await persistedNotice()).toEqual(original);
    const reloaded = reloadFilters();
    expect(reloaded.state().platform ?? null).toBeNull();
    expect(reloaded.state().platformScopeNotice).toEqual(original);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');
  });

  it('最新价格摘要「回看板下钻」：open 补丁落地继承说明，新查询摘要/图注仍披露，重载保留', async () => {
    seedV12Storage(ILLEGAL_NOON);
    const handle = renderFilters();
    const original = handle.state().platformScopeNotice!;
    expect(original.note).toContain('NOON 3P');

    const first = await runAgent('价格趋势', buildAgentContext('dashboard', handle.state(), []));
    const table1 = first.cards.find((item) => item.kind === 'table') as TableResultCard;
    const patch = openActionOf(table1, '回看板下钻').target!.filterPatch!;
    act(() => { handle.actions().set(patch); });

    expect(handle.state().platformScopeNotice).toEqual(original);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');

    const second = await runAgent('价格趋势', buildAgentContext('dashboard', handle.state(), []));
    const table2 = second.cards.find((item) => item.kind === 'table') as TableResultCard;
    const chart2 = second.cards.find((item) => item.kind === 'chart') as ChartResultCard;
    expect(table2.boundaries?.some((line) => line.includes('没有渠道'))).toBe(true);
    expect(chart2.note).toContain('没有渠道');
    expect(novaSummaryRow(table2)![1]).toBe('333');

    expect(await persistedNotice()).toEqual(original);
    const reloaded = reloadFilters();
    expect(reloaded.state().platformScopeNotice).toEqual(original);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');
  });

  it('价格优势卡「回看价格走势」：open 补丁落地继承说明，新查询判断边界仍披露，重载保留', async () => {
    // matrix-only（2026-11-10）：优势卡证人改用平板载荷（nova 14 无矩阵对比位，
    // 优势恒 0 行）；「open 落地继承说明 + 新查询披露 + 重载保留」语义不变。
    seedV12StorageTablet(ILLEGAL_NOON);
    const handle = renderFilters();
    const original = handle.state().platformScopeNotice!;

    const first = await runAgent('价格优势', buildAgentContext('dashboard', handle.state(), []));
    const card1 = first.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    const patch = openActionOf(card1, '回看价格走势').target!.filterPatch!;
    expect(patch.platform ?? null).toBeNull();
    act(() => { handle.actions().set(patch); });

    expect(handle.state().platformScopeNotice).toEqual(original);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');

    const second = await runAgent('价格优势', buildAgentContext('dashboard', handle.state(), []));
    const card2 = second.cards.find((item) => item.kind === 'price_advantage') as PriceAdvantageResultCard;
    expect(card2.boundaries?.[0]).toContain('没有渠道');
    // 自动口径按平台出候选行：OZON 行 = 平台内每周最低 1025（1P 1024.64）
    const w19Ozon = card2.rows.filter((row) => row.weekId === '202619' && row.ownModelId === 'own-huawei-matepad-pro-2025' && row.channel === 'OZON');
    expect(w19Ozon.length).toBeGreaterThan(0);
    for (const row of w19Ozon) expect(row.ownPrice).toBe(1025);

    expect(await persistedNotice()).toEqual(original);
    const reloaded = reloadFilters();
    expect(reloaded.state().platformScopeNotice).toEqual(original);
  });

  it('平台比较卡「定位到看板」：open 补丁落地继承说明，新查询边界仍披露，重载保留', async () => {
    seedV12Storage(ILLEGAL_NOON);
    const handle = renderFilters();
    const original = handle.state().platformScopeNotice!;

    const first = await runAgent('nova 14 哪个平台最便宜', buildAgentContext('dashboard', handle.state(), []));
    const table1 = first.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(table1.title).toBe('最新有价周平台比较');
    const patch = openActionOf(table1, '定位到看板').target!.filterPatch!;
    act(() => { handle.actions().set(patch); });

    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice).toEqual(original);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');

    const second = await runAgent('nova 14 哪个平台最便宜', buildAgentContext('dashboard', handle.state(), []));
    const table2 = second.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(table2.title).toBe('最新有价周平台比较');
    expect(table2.boundaries?.some((line) => line.includes('没有渠道'))).toBe(true);

    expect(await persistedNotice()).toEqual(original);
    const reloaded = reloadFilters();
    expect(reloaded.state().platformScopeNotice).toEqual(original);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');
  });

  it('预警卡「应用预警筛选」（apply 补丁带 platform 键）同样继承说明', async () => {
    seedV12Storage(ILLEGAL_NOON);
    const handle = renderFilters();
    const original = handle.state().platformScopeNotice!;
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
    const response = await runAgent('查看价格预警', buildAgentContext('dashboard', handle.state(), [alert]));
    const card = response.cards.find((item) => item.kind === 'alert');
    expect(card).toBeDefined();
    if (card?.kind !== 'alert') return;
    const apply = card.alert.actions?.find((action) => action.label === '应用预警筛选');
    expect(apply?.target?.filterPatch).toBeTruthy();
    act(() => { handle.actions().set(apply!.target!.filterPatch!); });
    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice).toEqual(original);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');
  });
});

// ------------------------------------------------------------
// 受控 fixture 两口径（R7 迁移证人）：open 交接不回退数据口径也不丢说明
// ------------------------------------------------------------
describe('t428u R8-M1 · 受控 v12 fixture：DNS+外国店铺 / DNS+RU 3P 并集的 open 交接', () => {
  it('DNS+AE:noon:3P：丢弃说明随 open 落地保留，新查询仍 DNS 336 + 披露，重载保留', async () => {
    seedV12Storage({ platforms: ['DNS'], shopIds: ['AE:noon:3P'], seller: null });
    const handle = renderFilters();
    const original = handle.state().platformScopeNotice!;
    expect(original.note).toContain('没有渠道');
    expect(original.note).toContain('NOON 3P');

    const first = await runAgent('价格趋势', buildAgentContext('dashboard', handle.state(), []));
    const table1 = first.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(novaSummaryRow(table1)![1]).toBe('336');
    const patch = openActionOf(table1, '回看板下钻').target!.filterPatch!;
    expect(patch.platform).toEqual(DNS_PLATFORM);
    act(() => { handle.actions().set(patch); });

    expect(handle.state().platform).toEqual(DNS_PLATFORM);
    expect(handle.state().platformScopeNotice).toEqual(original);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');

    const second = await runAgent('价格趋势', buildAgentContext('dashboard', handle.state(), []));
    const table2 = second.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(novaSummaryRow(table2)![1]).toBe('336');
    expect(novaSummaryRow(table2)![3]).toBe('DNS');
    expect(table2.boundaries?.some((line) => line.includes('没有渠道'))).toBe(true);

    expect(await persistedNotice()).toEqual(original);
    const reloaded = reloadFilters();
    expect(platformQueryEquals(reloaded.state().platform, DNS_PLATFORM)).toBe(true);
    expect(reloaded.state().platformScopeNotice).toEqual(original);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');
  });

  it('DNS+RU:ozon:3P 混合并集（DNS 平台 + OZON 3P 店铺）：open 落地原样保留口径，新查询 336，重载保留', async () => {
    // 2026-11-14 店铺级恢复：混合并集不再展开为 DNS、OZON 双平台——state 原样保留
    // {DNS 平台 + OZON 3P 店铺}，取价 = DNS 渠道 ∪ OZON 3P 每周最低（DNS 335.98 <
    // 3P 394.59 → 336），无归一说明
    seedV12Storage({ platforms: ['DNS'], shopIds: ['RU:ozon:3P'], seller: null });
    const handle = renderFilters();
    const mixed = handle.state().platform!;
    expect(mixed).toEqual({ platforms: ['DNS'], shopIds: ['RU:ozon:3P'], seller: null });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();

    const first = await runAgent('价格趋势', buildAgentContext('dashboard', handle.state(), []));
    const table1 = first.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(novaSummaryRow(table1)![1]).toBe('336');
    const patch = openActionOf(table1, '回看板下钻').target!.filterPatch!;
    expect(patch.platform).toEqual(mixed);
    act(() => { handle.actions().set(patch); });

    expect(handle.state().platform).toEqual(mixed);
    expect(handle.state().platformScopeNotice ?? null).toBeNull();

    const second = await runAgent('价格趋势', buildAgentContext('dashboard', handle.state(), []));
    const table2 = second.cards.find((item) => item.kind === 'table') as TableResultCard;
    expect(novaSummaryRow(table2)![1]).toBe('336');

    const reloaded = reloadFilters();
    expect(platformQueryEquals(reloaded.state().platform, mixed)).toBe(true);
    expect(reloaded.state().platformScopeNotice ?? null).toBeNull();
    void DNS_OZON_PLATFORM;
  });
});

// ------------------------------------------------------------
// 清除边界：真正的口径变化/重置/显式清除/坏说明注入不得残留
// ------------------------------------------------------------
describe('t428u R8-M1 · 清除边界：真正换口径清旧说明，坏说明不能存活，缺键 ≠ 显式 null', () => {
  function noticedHandle(): { state: () => FiltersState; actions: () => FiltersActions } {
    // 说明场景 = 全非法店铺回落 null + 剔除说明（2026-11-14 展开说明退役）
    seedV12Storage(ILLEGAL_NOON);
    const handle = renderFilters();
    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice).toBeTruthy();
    return handle;
  }

  it('换国（跨口径补丁带 platform）：RU 剔除说明不再成立——落地说明只能描述 DE', () => {
    const handle = noticedHandle();
    const ruNote = handle.state().platformScopeNotice!.note;
    act(() => { handle.actions().set({ countryCode: 'DE', platform: OZON_PLATFORM }); });
    expect(handle.state().countryCode).toBe('DE');
    const notice = handle.state().platformScopeNotice ?? null;
    if (notice) {
      expect(notice.countryCode).toBe('DE');
      expect(notice.note).not.toBe(ruNote);
    }
    expect(screen.queryByRole('status')?.textContent ?? '').not.toContain('NOON 3P');
  });

  it('换平台（DNS）：旧 null 口径剔除说明集合校验不成立 → 清空', () => {
    const handle = noticedHandle();
    act(() => { handle.actions().set({ platform: DNS_PLATFORM }); });
    expect(handle.state().platform).toEqual(DNS_PLATFORM);
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reset()：说明随默认视图重建清空', () => {
    const handle = noticedHandle();
    act(() => { handle.actions().reset(); });
    expect(handle.state().platform ?? null).toBeNull();
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('补丁显式 platformScopeNotice:null = deliberate 清除（缺键 = 继承）', () => {
    const handle = noticedHandle();
    const original = handle.state().platformScopeNotice!;
    act(() => { handle.actions().set({ platform: null }); });
    expect(handle.state().platformScopeNotice).toEqual(original);
    act(() => { handle.actions().set({ platform: null, platformScopeNotice: null }); });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('注入的错口径说明不能存活：AE 国说明落在 RU 补丁上被拒（无继承可用时为 null）', () => {
    seedV12Storage(OZON_PLATFORM);
    const handle = renderFilters();
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    const injected: PlatformScopeNotice = { note: 'AE 口径说明', countryCode: 'AE', platform: OZON_PLATFORM };
    act(() => { handle.actions().set({ platform: OZON_PLATFORM, platformScopeNotice: injected }); });
    const notice = handle.state().platformScopeNotice ?? null;
    expect(notice === null || notice.countryCode === 'RU').toBe(true);
    expect(notice?.note ?? '').not.toBe('AE 口径说明');
  });

  it('币种/时间补丁（无 platform 键）不动既有说明', () => {
    const handle = noticedHandle();
    const before = handle.state().platformScopeNotice!;
    act(() => { handle.actions().set({ currency: 'local' }); });
    expect(handle.state().platformScopeNotice).toEqual(before);
    act(() => { handle.actions().set({ adaptive: false, rangeStart: '202619', rangeEnd: '202619' }); });
    expect(handle.state().platformScopeNotice).toEqual(before);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');
  });

  it('undo 整态快照在 open 交接后仍按快照恢复（undo 行为保留）', () => {
    const handle = noticedHandle();
    const preHandoff: FiltersState = { ...handle.state() };
    const patch = { countryCode: 'RU' as const, industry: 'phone' as const, platform: OZON_PLATFORM, granularity: 'week' as const, adaptive: false, rangeStart: '202619', rangeEnd: '202619' };
    act(() => { handle.actions().set(patch); });
    expect(handle.state().platformScopeNotice ?? null).toBeNull();
    act(() => { handle.actions().set(preHandoff); });
    expect(handle.state().platformScopeNotice).toEqual(preHandoff.platformScopeNotice);
    expect(screen.getByRole('status').textContent).toContain('没有渠道');
  });
});
