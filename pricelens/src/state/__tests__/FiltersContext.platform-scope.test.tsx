// ============================================================
// t428u Round 5 R5-M1 · FiltersContext 落地与 Agent 计算口径一致性。
// 复现（第五轮评审）：AE NOON 优势卡 scopePatch 带 NOON 进 RU，FiltersContext
// applyScopeDefaults 用 platformSelectionValidFor 整选判定 → 清 null；同一问题
// 两处政策不同 → 「计算 0 行 / 落地后 18+ 行」。
// 契约：applyScopeDefaults 与 Agent 查询共用 lawfulPlatformScope——
//  - 混合合法/非法平台/店铺：保留合法子集（不再整选清 null）；
//  - 全部非法：null（自动全平台口径）；
//  - 结果卡 open filterPatch 经 actions.set 落地后，state 的国家/平台/主品与
//    补丁一致，且在该 state 上重算优势卡行数/价格与原卡逐条相同——
//    计算口径不可能与导航落地口径分叉。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FiltersProvider, useFilters, defaultFilters } from '../FiltersContext';
import type { FiltersActions, FiltersState, PlatformSelection, ProductSelection } from '../filtersTypes';
import { buildCards } from '../mainSelection';
import { buildAgentContext, runAgent } from '../../agent/core';
import { calculatePriceAdvantage } from '../../agent/priceAdvantage';
import type { PriceAdvantageResultCard } from '../../agent/contracts';

// 本仓库 vitest jsdom 不带 localStorage：装内存桩（同 scope-rework.test 手法）
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

const NOVA: ProductSelection = { modelId: 'own-huawei-nova-14-pro', romram: '12+512 GB', skuIds: ['own-huawei-nova-14-pro__12-512gb__black'] };

let currentState: FiltersState | null = null;
let currentActions: FiltersActions | null = null;

function Probe(): ReactNode {
  const { state, actions } = useFilters();
  currentState = state;
  currentActions = actions;
  return null;
}

function renderFilters(): { state: () => FiltersState; actions: () => FiltersActions } {
  currentState = null;
  currentActions = null;
  render(<FiltersProvider><Probe /></FiltersProvider>);
  expect(currentState).toBeTruthy();
  expect(currentActions).toBeTruthy();
  return { state: () => currentState!, actions: () => currentActions! };
}

/** 复制评审浏览器场景：?c=AE&main=own-huawei-nova-14-pro__12%2B512GB&plat=NOON 的净初始态 */
function seedAeNoonNova(handle: { state: () => FiltersState; actions: () => FiltersActions }): void {
  act(() => {
    handle.actions().set({ countryCode: 'AE', mains: buildCards([NOVA]), platform: { platforms: ['NOON'], shopIds: [], seller: null } });
  });
  expect(handle.state().countryCode).toBe('AE');
  expect(handle.state().platform).toEqual({ platforms: ['NOON'], shopIds: [], seller: null } satisfies PlatformSelection);
}

function advantageOpenPatch(card: PriceAdvantageResultCard): NonNullable<Parameters<FiltersActions['set']>[0]> {
  const open = card.actions?.find((action) => action.id === 'price-advantage-open');
  expect(open).toBeTruthy();
  expect(open!.target?.filterPatch).toBeTruthy();
  return open!.target!.filterPatch!;
}

const rowTuple = (row: PriceAdvantageResultCard['rows'][number]): string =>
  `${row.weekId}|${row.channel}|${row.ownPrice}|${row.competitorPrice}|${row.ownModelId}|${row.competitorModelId}`;

describe('t428u R5-M1 · applyScopeDefaults 平台归一（共享 lawfulPlatformScope）', () => {
  it('全部非法（AE NOON → RU）：回落 null = 自动全平台口径', () => {
    const handle = renderFilters();
    seedAeNoonNova(handle);
    act(() => { handle.actions().set({ countryCode: 'RU' }); });
    expect(handle.state().countryCode).toBe('RU');
    expect(handle.state().platform).toBeNull();
  });

  it('混合合法/非法（FR 的 Amazon+NOON → DE）：保留 Amazon 子集，不再整选清空', () => {
    const handle = renderFilters();
    act(() => {
      // FR 渠道表有 Amazon（无 NOON）：seed 时 Amazon 合法保留、NOON 剔除；
      // 切 DE 后 Amazon 仍合法（DE/FR 共有平台）→ 子集保留
      handle.actions().set({ countryCode: 'FR', mains: buildCards([NOVA]), platform: { platforms: ['Amazon', 'NOON'], shopIds: [], seller: null } });
    });
    expect(handle.state().platform).toEqual({ platforms: ['Amazon'], shopIds: [], seller: null });
    act(() => { handle.actions().set({ countryCode: 'DE' }); });
    expect(handle.state().platform).toEqual({ platforms: ['Amazon'], shopIds: [], seller: null });
  });

  it('跨国共有平台（FR Amazon → DE）：合法保留', () => {
    const handle = renderFilters();
    act(() => {
      handle.actions().set({ countryCode: 'FR', mains: buildCards([NOVA]), platform: { platforms: ['Amazon'], shopIds: [], seller: null } });
    });
    act(() => { handle.actions().set({ countryCode: 'DE' }); });
    expect(handle.state().countryCode).toBe('DE');
    expect(handle.state().platform).toEqual({ platforms: ['Amazon'], shopIds: [], seller: null });
  });

  it('同国合法 OZON 切产业/重置不受影响（回归）', () => {
    const handle = renderFilters();
    act(() => { handle.actions().set({ platform: { platforms: ['OZON'], shopIds: [], seller: null } }); });
    expect(handle.state().platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
    act(() => { handle.actions().reset(); });
    expect(handle.state().platform).toBeNull();
  });
});

describe('t428u R5-M1 · 优势卡 filterPatch 落地一致性（计算口径 = 导航口径）', () => {
  it('AE NOON 卡补丁落地：state 与补丁同口径，落地重算行数/价格与原卡逐条相同', async () => {
    const handle = renderFilters();
    seedAeNoonNova(handle);
    const response = await runAgent('RU价格优势', buildAgentContext('dashboard', handle.state(), []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind !== 'price_advantage') return;
    expect(card.rows.length).toBeGreaterThan(0);
    const patch = advantageOpenPatch(card);
    expect(patch.countryCode).toBe('RU');
    expect(patch.platform).toBeNull();
    act(() => { handle.actions().set(patch); });
    // 落地 state 与补丁完全同口径（平台不再被二次清改出不同结果）
    expect(handle.state().countryCode).toBe(patch.countryCode);
    expect(handle.state().platform).toEqual(patch.platform ?? null);
    expect(handle.state().mains.some((mainCard) => mainCard.main?.modelId === 'own-huawei-nova-14-pro')).toBe(true);
    // 落地重算 = 原卡（评审复现的 0→N 跳变不可能再发生）
    const recomputed = calculatePriceAdvantage(handle.state());
    expect(recomputed).toBeTruthy();
    expect(recomputed!.rows.map(rowTuple)).toEqual(card.rows.map(rowTuple));
  });

  it('合法 OZON 卡补丁落地：platform 保留 OZON（不丢选择），重算同结果', async () => {
    const handle = renderFilters();
    act(() => {
      handle.actions().set({ mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }), platform: { platforms: ['OZON'], shopIds: [], seller: null } });
    });
    const response = await runAgent('价格优势', buildAgentContext('dashboard', handle.state(), []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    if (card?.kind !== 'price_advantage') throw new Error('missing price_advantage card');
    expect(card.rows.length).toBeGreaterThan(0);
    const patch = advantageOpenPatch(card);
    expect(patch.platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
    act(() => { handle.actions().set(patch); });
    expect(handle.state().platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
    const recomputed = calculatePriceAdvantage(handle.state());
    expect(recomputed!.rows.map(rowTuple)).toEqual(card.rows.map(rowTuple));
  });

  it('合法店铺级（RU:ozon:3P）补丁落地：shopIds 保留在 applied state，重算同结果', async () => {
    const handle = renderFilters();
    act(() => {
      handle.actions().set({ mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }), platform: { platforms: [], shopIds: ['RU:ozon:3P'], seller: null } });
    });
    const response = await runAgent('价格优势', buildAgentContext('dashboard', handle.state(), []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    if (card?.kind !== 'price_advantage') throw new Error('missing price_advantage card');
    const patch = advantageOpenPatch(card);
    expect(patch.platform).toEqual({ platforms: [], shopIds: ['RU:ozon:3P'], seller: null });
    act(() => { handle.actions().set(patch); });
    expect(handle.state().platform).toEqual({ platforms: [], shopIds: ['RU:ozon:3P'], seller: null });
    const recomputed = calculatePriceAdvantage(handle.state());
    expect(recomputed!.rows.map(rowTuple)).toEqual(card.rows.map(rowTuple));
  });

  it('混合子集补丁（OZON，自 OZON+NOON 归一而来）落地：保留 OZON 且 URL 写 plat=OZON', async () => {
    const handle = renderFilters();
    act(() => {
      // 同国直接字段补丁按原样合并（UI 不产出该形态；模拟旧链接/漂移残留的
      // 混合选择）——查询侧归一为合法子集，补丁落地保留子集
      handle.actions().set({ mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }), platform: { platforms: ['OZON', 'NOON'], shopIds: [], seller: null } });
    });
    const response = await runAgent('价格优势', buildAgentContext('dashboard', handle.state(), []));
    const card = response.cards.find((item) => item.kind === 'price_advantage');
    if (card?.kind !== 'price_advantage') throw new Error('missing price_advantage card');
    const patch = advantageOpenPatch(card);
    expect(patch.platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
    act(() => { handle.actions().set(patch); });
    expect(handle.state().platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
    expect(handle.state().countryCode).toBe('RU');
    await waitFor(() => {
      expect(window.location.search).toContain('c=RU');
      expect(window.location.search).toContain('plat=OZON');
      expect(window.location.search).not.toContain('NOON');
    });
  });
});
