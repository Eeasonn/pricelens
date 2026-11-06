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
//  - 普通 UI 换国（补丁不带 mains）：存离建国快照 → 目标国快照 100% 优先（含
//    SKU 校验；恢复时清理无效手动 compares）→ 无快照先旧 mains 同型号重映射
//    （R4-m1：RU Mate X6 12+512 → ID 16+512，结果写回目标国快照）→ 型号整体
//    缺席才按目标国默认重算，绝不落非法 SKU / 空看板。
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

  it('RU Mate X6 → ID 普通换国（R4-m1 新契约）：无快照先同型号重映射 16+512GB，不再默认 Mate 80 Pro', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    act(() => actions().set({ countryCode: 'ID' }));
    expect(state().countryCode).toBe('ID');
    // R4-m1：无 ID 快照时先 remapMainsForScope 保原型号——Mate X6 12+512 → ID 16+512
    expect(state().mains[0].main).toEqual(MATE_X6_ID);
    expect(state().mains[0].main?.modelId).not.toBe('own-huawei-mate-80-pro');
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
    // 重映射结果写入 ID 快照：切走再回 ID 仍按这套口径还原
    expect(readSnapshot('ID')?.mains[0].main).toEqual(MATE_X6_ID);
    act(() => actions().set({ countryCode: 'RU' }));
    act(() => actions().set({ countryCode: 'ID' }));
    expect(state().mains[0].main).toEqual(MATE_X6_ID);
  });

  it('RU Mate X6 → DE 普通换国：型号整体缺席才默认重算（nova 14 Pro），RU 快照仍保留 12+512', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    act(() => actions().set({ countryCode: 'DE' }));
    expect(state().countryCode).toBe('DE');
    expect(state().mains[0].main?.modelId).toBe('own-huawei-nova-14-pro');
    expect(readSnapshot('RU')?.mains[0].main).toEqual(MATE_X6_RU);
  });

  it('显式 mains:[] 换国不当「未传」（R4-S3 清空态）：不残留源国产品，也不复活目标国旧快照', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    // 先普通切 ID 再回 RU：制造一个非空的 ID 快照（旧逻辑下显式清空会被它复活）
    act(() => actions().set({ countryCode: 'ID' }));
    act(() => actions().set({ countryCode: 'RU' }));
    expect(readSnapshot('ID')?.mains.length).toBeGreaterThan(0);
    // 显式空 mains 切 ID：清空态胜出——落空看板，不触发显式重映射通道（无卡可
    // 映射）、不回填默认，也不查/不复活 ID 旧快照
    act(() => actions().set({ countryCode: 'ID', mains: [] }));
    expect(state().countryCode).toBe('ID');
    expect(state().mains).toHaveLength(0);
    // 目标国快照同步为空：此后普通切走再回 ID 仍保持空态
    expect(readSnapshot('ID')?.mains).toHaveLength(0);
    act(() => actions().set({ countryCode: 'RU' }));
    act(() => actions().set({ countryCode: 'ID' }));
    expect(state().mains).toHaveLength(0);
  });

  it('patch 显式 { countryCode, mains: undefined } 不崩且不视为显式口径（undefined 不覆盖已有选择）', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    // 模拟外部 API / 旧调用方把 undefined 显式塞进 patch：spread 不能把 undefined
    // 写进 state.mains（后续 .length/.map 会崩），也不得冒充显式口径
    act(() => actions().set({ countryCode: 'ID', mains: undefined }));
    expect(state().countryCode).toBe('ID');
    expect(Array.isArray(state().mains)).toBe(true);
    // undefined 被忽略 → 普通换国路径（R4-m1 remap）：Mate X6 12+512 → ID 16+512
    expect(state().mains[0].main).toEqual(MATE_X6_ID);
  });

  it('快照恢复 100% 优先于同型号重映射：污染的无效手动 compares 在恢复时被清理', () => {
    const { state, actions } = renderFilters();
    // 先制造一个合法 RU 快照，再手工污染 compares：型号/配置在 RU 有、SKU 行不存在
    act(() => actions().setMains([{ ...mateX6RuCard(), compares: [{ modelId: 'own-huawei-mate-x6', romram: '12+512 GB', skuIds: ['own-huawei-mate-x6__12-512gb__nonexistent'] }] }]));
    act(() => actions().set({ countryCode: 'DE' }));
    sessionStorage.setItem(snapKey('RU'), JSON.stringify({
      mains: [{ id: 'card-snap', main: MATE_X6_RU, compares: [{ modelId: 'own-huawei-mate-x6', romram: '12+512 GB', skuIds: ['own-huawei-mate-x6__12-512gb__nonexistent'] }], auto: false }],
    }));
    act(() => actions().set({ countryCode: 'RU' }));
    expect(state().countryCode).toBe('RU');
    // 快照优先恢复主品（而非 remap/默认），且无效手动对比区被清空
    expect(state().mains[0].main).toEqual(MATE_X6_RU);
    expect(state().mains[0].compares).toHaveLength(0);
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

describe('t428u R5-M1 · 目标国可落地平台归一化（计算与落地共享规则）', () => {
  const NOON_AE: NonNullable<FiltersState['platform']> = { platforms: ['NOON'], shopIds: [], seller: null };
  const OZON_RU_SHOP: NonNullable<FiltersState['platform']> = { platforms: [], shopIds: ['RU:ozon:1P'], seller: null };

  it('普通 UI 换国：RU+OZON 店铺级勾选切 DE（无 OZON）→ 平台回落默认电渠 null', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({ platform: OZON_RU_SHOP }));
    expect(state().platform).toEqual(OZON_RU_SHOP);
    act(() => actions().set({ countryCode: 'DE' }));
    expect(state().countryCode).toBe('DE');
    expect(state().platform).toBeNull();
  });

  it('同国普通补丁：RU+OZON（含 shopIds）原样保留，不一律清空', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({ platform: OZON_RU_SHOP }));
    act(() => actions().set({ granularity: 'month' }));
    expect(state().countryCode).toBe('RU');
    expect(state().platform).toEqual(OZON_RU_SHOP);
  });

  it('部分可落地（旧多选载荷 OZON+NOON 切 AE）：保留 NOON 有效子集，不整体清空', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({ platform: { platforms: ['OZON', 'NOON'], shopIds: [], seller: null } }));
    act(() => actions().set({ countryCode: 'AE' }));
    expect(state().countryCode).toBe('AE');
    expect(state().platform).toEqual({ platforms: ['NOON'], shopIds: [], seller: null });
  });

  it('回看落地（显式 mains + 平台）：AE·NOON + nova 跨国落 RU → 平台归一为默认电渠，主品合法保留', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({ countryCode: 'AE', platform: NOON_AE, mains: [novaCard()] }));
    expect(state().countryCode).toBe('AE');
    // 与 advantageScopePatch/queryCards openPatch 同形：跨国 patch 的平台是计算前
    // 归一化结果（NOON 不在 RU → null）
    act(() => actions().set({
      countryCode: 'RU',
      platform: null,
      granularity: 'week',
      adaptive: false,
      mains: [novaCard()],
    }));
    expect(state().countryCode).toBe('RU');
    expect(state().platform).toBeNull();
    expect(state().mains[0].main).toEqual(NOVA_14_PRO);
    expect(selectionValidFor(state().mains[0].main!, 'RU', 'phone')).toBe(true);
  });
});

describe('t428u R4-S3/S4 · undefined 字段防护与同口径显式 mains 合法化', () => {
  it('patch 显式 { platform: undefined } 不覆盖：平台保持原值（undefined 不入 state）', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({ platform: { platforms: ['OZON'], shopIds: [], seller: null } }));
    act(() => actions().set({ platform: undefined, granularity: undefined }));
    expect(state().platform).toEqual({ platforms: ['OZON'], shopIds: [], seller: null });
    expect(state().granularity).toBe('week');
  });

  it('同口径显式 mains 合法化（R4-S4）：ID 下显式写 RU 非法 12+512 → 映射 16+512', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({ countryCode: 'ID' }));
    act(() => actions().set({ mains: [mateX6RuCard()] }));
    expect(state().countryCode).toBe('ID');
    expect(state().mains[0].main).toEqual(MATE_X6_ID);
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
  });

  it('同口径显式 mains 型号全缺席 → 默认安全回落（ID 默认 Mate 80 Pro）', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({ countryCode: 'ID' }));
    act(() => actions().set({
      mains: [{ id: 'card-absent-same-scope', main: { modelId: 'own-huawei-pura-999', romram: '12+256 GB', skuIds: ['own-huawei-pura-999__12-256gb__black'] }, compares: [], auto: false }],
    }));
    expect(state().mains[0].main?.modelId).toBe('own-huawei-mate-80-pro');
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
  });

  it('非数组 mains 坏值整体忽略（外部 JS 调用方防御），状态不破坏', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    act(() => actions().set({ mains: 'broken-not-array' as unknown as MainProduct[] }));
    expect(Array.isArray(state().mains)).toBe(true);
    expect(state().mains[0].main).toEqual(MATE_X6_RU);
  });
});

describe('t428u R4-S2 · 快照恢复对比区封顶 COMPARES_PER_CARD_CAP', () => {
  it('污染快照（单卡 4 条合法 RU compares）恢复后封顶 3，且全部仍合法', () => {
    const fourCompares: ProductSelection[] = [
      { modelId: 'cmp-apple-iphone-16', romram: '128 GB', skuIds: ['cmp-apple-iphone-16__128gb__black'] },
      { modelId: 'cmp-apple-iphone-16-plus', romram: '128 GB', skuIds: ['cmp-apple-iphone-16-plus__128gb__black'] },
      { modelId: 'cmp-apple-iphone-16-pro', romram: '128 GB', skuIds: ['cmp-apple-iphone-16-pro__128gb__black'] },
      { modelId: 'cmp-apple-iphone-16-pro-max', romram: '12+256 GB', skuIds: ['cmp-apple-iphone-16-pro-max__12-256gb__white'] },
    ];
    const { state, actions } = renderFilters();
    act(() => actions().set({ countryCode: 'DE' }));
    sessionStorage.setItem(snapKey('RU'), JSON.stringify({
      mains: [{ id: 'card-cap3', main: MATE_X6_RU, compares: fourCompares, auto: false }],
    }));
    act(() => actions().set({ countryCode: 'RU' }));
    expect(state().countryCode).toBe('RU');
    // 快照优先恢复主品；对比区 >3 被封到 3（clampMains 卡配额），条目全部合法
    expect(state().mains[0].main).toEqual(MATE_X6_RU);
    expect(state().mains[0].compares.length).toBe(3);
    for (const compare of state().mains[0].compares) {
      expect(selectionValidFor(compare, 'RU', 'phone')).toBe(true);
    }
  });
});
