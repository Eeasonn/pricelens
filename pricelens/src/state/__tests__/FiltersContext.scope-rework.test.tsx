// ============================================================
// t428u Round 3（三轮返修）M1a/M1b · 口径切换的产品合法性回归。
// 复现（评审真实报告）：
//  - M1a：selectionValidFor 只校验型号×产业×国家，RU 的 own-huawei-mate-x6
//    12+512GB（仅 ES/FR/IT/RU/TR）被原样带进只有 16+512GB 的 ID；
//    ?c=ID&main=own-huawei-mate-x6__12%2B512GB 链接初始化同样落非法配置。
//  - M1b：actions.set 先合并旧状态再进 switchScope，继承的 next.mains 被当成
//    显式口径——RU Mate X6 → DE（默认 nova 14 Pro）→ RU 不还原快照，停在 DE
//    默认主品。
// 契约：
//  - 显式 mains（Agent filterPatch / undo 快照）：精确合法配置保留，同型号映射
//    目标国首个合法配置（ID 16+512GB），型号整体缺席回落默认；对比区按目标国
//    重建且 ≤3；目标国快照同步更新。
//  - 普通 UI 换国（补丁不带 mains）：存离建国快照 → 目标国快照优先（含 SKU
//    校验）→ 无快照按目标国默认重算，绝不落非法 SKU / 空看板。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FiltersProvider, useFilters, defaultFilters } from '../FiltersContext';
import type { FiltersActions, FiltersState, MainProduct, ProductSelection } from '../filtersTypes';
import { buildCards, selectionValidFor } from '../mainSelection';
import { productSelectionOfSeriesKey } from '../urlSync';
import { LPL } from '../lplKeys';

// 本仓库 vitest jsdom 不带 localStorage：装内存桩（同 configImportExport.test 手法）
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

/** 数据事实（dim_product）：Mate X6 12+512GB 仅 ES/FR/IT/RU/TR，ID 只有 16+512GB；
 *  nova 14 Pro 12+512GB 在 DE 与 RU 均在售；DE/ID 无 default_own_models，默认主品
 *  = 该国首个我司手机型号（DE = nova 14 Pro，ID = Mate 80 Pro）。 */
const MATE_X6_RU: ProductSelection = { modelId: 'own-huawei-mate-x6', romram: '12+512 GB', skuIds: ['own-huawei-mate-x6__12-512gb__black'] };
const MATE_X6_ID: ProductSelection = { modelId: 'own-huawei-mate-x6', romram: '16+512 GB', skuIds: ['own-huawei-mate-x6__16-512gb__black'] };
const NOVA_14_PRO: ProductSelection = { modelId: 'own-huawei-nova-14-pro', romram: '12+512 GB', skuIds: ['own-huawei-nova-14-pro__12-512gb__black'] };

function mateX6RuCard(auto = false): MainProduct {
  return { id: 'card-ru-mate-x6', main: MATE_X6_RU, compares: [], auto };
}

function novaCard(): MainProduct {
  return { id: 'card-nova-14-pro', main: NOVA_14_PRO, compares: [], auto: true };
}

interface ProbeHandle {
  state: () => FiltersState;
  actions: () => FiltersActions;
}

/** 最近一次渲染的 Filters 快照（模块级盒子：闭包每次渲染都被刷新，
 *  测试端 handle 始终读到最新 state，不会钉死在首帧） */
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

const snapKey = (cc: string, industry = 'phone'): string => `${LPL.filters}.mainsOf.${cc}.${industry}`;

function readSnapshot(cc: string, industry = 'phone'): { mains: MainProduct[] } | null {
  const raw = sessionStorage.getItem(snapKey(cc, industry));
  if (!raw) return null;
  try { return JSON.parse(raw) as { mains: MainProduct[] }; } catch { return null; }
}

describe('t428u R3 M1a · 系列键解析与 URL 非法配置映射', () => {
  it('精确配置在目标国不存在时映射同型号首个合法配置；型号整体缺席 = null', () => {
    // RU 合法：原样保留（12+512GB 黑色最低价色）
    expect(productSelectionOfSeriesKey('own-huawei-mate-x6__12+512GB', 'RU')).toEqual(MATE_X6_RU);
    // ID 没有 12+512GB → 同型号首个合法配置 16+512GB，而不是整条丢弃/保留非法配置
    expect(productSelectionOfSeriesKey('own-huawei-mate-x6__12+512GB', 'ID')).toEqual(MATE_X6_ID);
    // 型号不在维表（pura 999 不存在）→ null（调用方安全回落默认）
    expect(productSelectionOfSeriesKey('own-huawei-pura-999__12+256GB', 'RU')).toBeNull();
  });

  it('?c=ID&main=own-huawei-mate-x6__12%2B512GB 初始化：落到 Mate X6 16+512GB 合法卡', () => {
    window.history.replaceState(null, '', '/?c=ID&main=own-huawei-mate-x6__12%2B512GB');
    const { state } = renderFilters();
    expect(state().countryCode).toBe('ID');
    expect(state().mains).toHaveLength(1);
    expect(state().mains[0].main).toEqual(MATE_X6_ID);
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
  });

  it('?c=ID 仅换国家 + 持久化里 RU 的 Mate X6 12+512：needMain 校验含 SKU，落 ID 默认卡', () => {
    localStorage.setItem(LPL.filters, JSON.stringify({
      ...defaultFilters,
      countryCode: 'RU',
      mains: [mateX6RuCard()],
      v: 12,
    }));
    window.history.replaceState(null, '', '/?c=ID');
    const { state } = renderFilters();
    expect(state().countryCode).toBe('ID');
    // 型号在 ID 存在但 12+512GB/SKU 不在 → 不能原样保留（此前弱校验会留下空看板）
    expect(state().mains[0].main?.modelId).not.toBe('own-huawei-mate-x6');
    expect(state().mains[0].main?.modelId).toBe('own-huawei-mate-80-pro');
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
  });
});

describe('t428u R3 M1b · 普通 UI 换国（补丁不带 mains）', () => {
  it('RU Mate X6 → DE 落默认 nova 14 Pro → RU 还原 Mate X6 12+512 会话快照', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    expect(state().countryCode).toBe('RU');

    act(() => actions().set({ countryCode: 'DE' }));
    expect(state().countryCode).toBe('DE');
    // 继承的 RU 主品不得冒充显式口径：DE 落目标国默认主品（原设计）
    expect(state().mains[0].main?.modelId).toBe('own-huawei-nova-14-pro');
    expect(selectionValidFor(state().mains[0].main!, 'DE', 'phone')).toBe(true);
    expect(readSnapshot('RU')?.mains[0].main).toEqual(MATE_X6_RU);

    act(() => actions().set({ countryCode: 'RU' }));
    expect(state().countryCode).toBe('RU');
    // 快照优先还原，而不是停在 DE 的默认 nova 14 Pro（评审复现的丢失路径）
    expect(state().mains[0].main).toEqual(MATE_X6_RU);
    expect(state().mains[0].main?.modelId).not.toBe('own-huawei-nova-14-pro');
  });

  it('RU Mate X6 → ID 普通换国：绝不保留非法 12+512GB，落 ID 合法默认卡', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    act(() => actions().set({ countryCode: 'ID' }));
    expect(state().countryCode).toBe('ID');
    expect(state().mains[0].main).not.toEqual(MATE_X6_RU);
    expect(state().mains[0].main?.modelId).toBe('own-huawei-mate-80-pro');
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
  });

  it('快照含目标国非法 SKU 时不还原（严格校验），回落目标国默认卡', () => {
    const { state, actions } = renderFilters();
    // 先普通切到 DE，再手工污染 RU 快照：型号在 RU 有、SKU 行不存在
    act(() => actions().set({ countryCode: 'DE' }));
    sessionStorage.setItem(snapKey('RU'), JSON.stringify({
      mains: [{ id: 'card-bad-sku', main: { modelId: 'own-huawei-mate-x6', romram: '12+512 GB', skuIds: ['own-huawei-mate-x6__12-512gb__nonexistent'] }, compares: [], auto: false }],
    }));
    act(() => actions().set({ countryCode: 'RU' }));
    expect(state().countryCode).toBe('RU');
    expect(state().mains[0].main?.skuIds).not.toContain('own-huawei-mate-x6__12-512gb__nonexistent');
    expect(selectionValidFor(state().mains[0].main!, 'RU', 'phone')).toBe(true);
  });
});

describe('t428u R3 M1a · 显式 mains 跨国（Agent filterPatch 口径）', () => {
  it('RU Mate X6 12+512 显式切 ID：同型号映射 16+512GB，对比区按 ID 重建 ≤3，快照更新', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard(true)]));
    // 与 priceAdvantage scopePatch 同形：国家 + 完整 mains + 时间/平台口径
    act(() => actions().set({
      countryCode: 'ID',
      granularity: 'week',
      adaptive: false,
      mains: [{ ...mateX6RuCard(true), compares: buildCards([MATE_X6_RU], { auto: true, countryCode: 'RU' })[0].compares }],
    }));
    expect(state().countryCode).toBe('ID');
    expect(state().mains[0].main).toEqual(MATE_X6_ID);
    // 对比区按目标国矩阵重建（auto 卡），全部在 ID 合法且 ≤3
    expect(state().mains[0].compares.length).toBeLessThanOrEqual(3);
    for (const compare of state().mains[0].compares) {
      expect(selectionValidFor(compare, 'ID', 'phone')).toBe(true);
    }
    // 显式口径更新目标国快照：其后普通切走/切回按这套口径还原
    expect(readSnapshot('ID')?.mains[0].main).toEqual(MATE_X6_ID);
    // 再普通切走再回：快照还原的就是合法化后的 16+512GB
    act(() => actions().set({ countryCode: 'RU' }));
    act(() => actions().set({ countryCode: 'ID' }));
    expect(state().mains[0].main).toEqual(MATE_X6_ID);
  });

  it('显式 nova 14 Pro 切 RU：合法配置原样保留（不被 RU 默认主品顶替）', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({ countryCode: 'DE' }));
    act(() => actions().set({ countryCode: 'RU', mains: [novaCard()] }));
    expect(state().countryCode).toBe('RU');
    expect(state().mains[0].main).toEqual(NOVA_14_PRO);
    expect(state().mains[0].main?.modelId).not.toBe('own-huawei-pura-90s-pro-max');
    expect(readSnapshot('RU')?.mains[0].main).toEqual(NOVA_14_PRO);
  });

  it('显式 mains 型号整体不在目标国：回落目标国默认卡（defaults safely）', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({
      countryCode: 'ID',
      mains: [{ id: 'card-absent', main: { modelId: 'own-huawei-pura-999', romram: '12+256 GB', skuIds: ['own-huawei-pura-999__12-256gb__black'] }, compares: [], auto: false }],
    }));
    expect(state().countryCode).toBe('ID');
    expect(state().mains[0].main?.modelId).toBe('own-huawei-mate-80-pro');
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
  });
});
