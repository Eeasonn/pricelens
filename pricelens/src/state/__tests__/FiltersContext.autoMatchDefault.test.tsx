// ============================================================
// 自动匹配竞品 = 默认逻辑（2026-11-26 Eason）：
//  - 刷新/重开：持久化 / URL 恢复的华为主品卡一律默认 auto=true，
//    对比区按当前口径矩阵重算（「开 = 矩阵驱动」语义不变）——
//    上次会话手动关闭的状态不跨刷新存活。
//  - 单次界面交互内关闭有效：autoMatchCard 关 → 本会话保持手动对比区。
//  - 非华为主品卡（竞品视角）不适用矩阵，不受强制。
// 恢复链路：loadBaseState（持久化）→ applyUrlOverrides（URL 合并，
//   兜住「链接直开、持久化里没有的卡」）→ applyScopeDefaults 末尾
//   withAutoOn 统一按当前口径重算对比区。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FiltersProvider, useFilters, defaultFilters } from '../FiltersContext';
import type { FiltersActions, FiltersState, MainProduct, ProductSelection } from '../filtersTypes';
import { buildCards } from '../mainSelection';
import { LPL } from '../lplKeys';

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

// 数据事实（dim_product RU）：nova 14 12+256GB 在售；手动对比区用 RU 合法竞品
// （iPhone 17 8+256 / S26 12+256——与矩阵产出不同款，便于断言「被矩阵重算替换」）
const NOVA14_RU: ProductSelection = { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: ['own-huawei-nova-14__12-256gb__black'] };
const IPHONE17_RU: ProductSelection = { modelId: 'cmp-apple-iphone-17', romram: '8+256 GB', skuIds: ['cmp-apple-iphone-17__8-256gb__black'] };

/** 上次会话「手动关掉自动匹配、自己搭了对比区」的持久化卡（旧语义下刷新后原样复活） */
function manualOffCard(): MainProduct {
  return { id: 'card-manual-off', main: NOVA14_RU, compares: [IPHONE17_RU], auto: false };
}

interface ProbeHandle {
  state: () => FiltersState;
  actions: () => FiltersActions;
}

let currentState: FiltersState | null = null;
let currentActions: FiltersActions | null = null;

function Probe(): ReactNode {
  const { state, actions } = useFilters();
  currentState = state;
  currentActions = actions;
  return null;
}

function renderFilters(): ProbeHandle {
  currentState = null;
  currentActions = null;
  render(<FiltersProvider><Probe /></FiltersProvider>);
  expect(currentState).toBeTruthy();
  expect(currentActions).toBeTruthy();
  return {
    state: () => currentState!,
    actions: () => currentActions!,
  };
}

describe('自动匹配竞品默认逻辑（2026-11-26 Eason）', () => {
  it('刷新恢复：持久化里 auto=false + 手动对比区的华为主品卡 → 默认开 + 对比区按矩阵重算', () => {
    localStorage.setItem(LPL.filters, JSON.stringify({
      ...defaultFilters,
      countryCode: 'RU',
      mains: [manualOffCard()],
      v: 12,
    }));
    const { state } = renderFilters();
    expect(state().countryCode).toBe('RU');
    expect(state().mains).toHaveLength(1);
    expect(state().mains[0].auto).toBe(true);
    // 对比区 = 矩阵产出（「开 = 矩阵驱动」），不再是上次会话的手动搭配
    expect(state().mains[0].compares).toEqual(
      buildCards([NOVA14_RU], { auto: true, countryCode: 'RU' })[0].compares,
    );
    expect(state().mains[0].compares.some((c) => c.modelId === IPHONE17_RU.modelId && c.romram === IPHONE17_RU.romram && JSON.stringify(c.skuIds) === JSON.stringify(IPHONE17_RU.skuIds))).toBe(false);
  });

  it('单次界面交互内关闭有效：会话内关掉后保持手动态（不被动弹回）', () => {
    const { state, actions } = renderFilters();
    // 首次打开 = 默认卡 + 匹配竞品开
    expect(state().mains.length).toBeGreaterThan(0);
    expect(state().mains[0].auto).toBe(true);
    const cardId = state().mains[0].id;
    act(() => actions().autoMatchCard(cardId));
    expect(state().mains[0].auto).toBe(false);
    // 关 = 对比区保留转手动（会话内不回弹）
    expect(state().mains[0].compares.length).toBeGreaterThan(0);
  });

  it('URL 直开（持久化里没有的华为主品卡）→ 同样默认开 + 矩阵对比区', () => {
    window.history.replaceState(null, '', '/?c=RU&main=own-huawei-nova-14__12%2B256GB');
    const { state } = renderFilters();
    expect(state().countryCode).toBe('RU');
    expect(state().mains[0].main?.modelId).toBe('own-huawei-nova-14');
    expect(state().mains[0].auto).toBe(true);
    expect(state().mains[0].compares).toEqual(
      buildCards([NOVA14_RU], { auto: true, countryCode: 'RU' })[0].compares,
    );
  });

  it('非华为主品卡（竞品视角）不受强制：auto 原样、对比区原样', () => {
    localStorage.setItem(LPL.filters, JSON.stringify({
      ...defaultFilters,
      countryCode: 'RU',
      mains: [{ id: 'card-comp-main', main: IPHONE17_RU, compares: [], auto: false }],
      v: 12,
    }));
    const { state } = renderFilters();
    expect(state().mains).toHaveLength(1);
    expect(state().mains[0].main?.modelId).toBe('cmp-apple-iphone-17');
    expect(state().mains[0].auto).toBe(false);
    expect(state().mains[0].compares).toEqual([]);
  });
});
