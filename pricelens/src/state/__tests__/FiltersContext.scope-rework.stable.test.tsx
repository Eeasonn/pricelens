// ============================================================
// t428u Round 3（三轮返修）M1a/M1b · 口径切换的产品合法性回归。
// Round 4（四轮返修）扩展：m1/S1-S4 的换国优先级与显式 mains 语义。
// 复现（评审真实报告）：
//  - M1a：selectionValidFor 只校验型号×产业×国家，RU 的 own-huawei-mate-x6
//    12+512GB（仅 ES/FR/IT/RU/TR）被原样带进只有 16+512GB 的 ID；
//    ?c=ID&main=own-huawei-mate-x6__12%2B512GB 链接初始化同样落非法配置。
//  - M1b：actions.set 先合并旧状态再进 switchScope，继承的 next.mains 被当成
//    显式口径——RU Mate X6 → DE（默认 nova 14 Pro）→ RU 不还原快照，停在 DE
//    默认主品。
//  - R4-m1：普通换国无快照时一律默认重算，RU Mate X6 12+512 → ID 落 Mate 80
//    Pro（同型号 16+512 在售却被丢掉）。
//  - R4-S1/S2/S3/S4：多 SKU 勾选组任一合法即整组保留非法成员；快照对比区
//    不校验；显式 mains 只认非空数组（显式 [] 被当普通换国查快照）；补丁
//    mains: undefined 会把状态覆盖成 undefined。
// 契约：
//  - 显式 mains（Agent filterPatch / undo 快照，mains 键即显式，含空数组）：
//    精确合法配置保留，同型号映射目标国首个合法配置（ID 16+512GB），型号整体
//    缺席回落默认；对比区按目标国重建且 ≤3；目标国快照同步更新；显式 [] =
//    清空态（不查快照不回填默认）。
//  - 普通 UI 换国（补丁不带 mains）：存离建国快照 → 目标国快照优先（含 SKU
//    校验、对比区剥离封顶）→ 无快照按同型号映射旧选择（R4-m1）→ 同型号也无
//    按目标国默认重算，绝不落非法 SKU / 空看板。
// ============================================================
// @vitest-environment jsdom
import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
// 2026-11-07 整合：稳定栈只在稳定构建启用，其测试按出货通道（STABLE）运行
vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
  resolveAppChannel: (): 'stable' => 'stable',
}));
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FiltersProvider, useFilters, defaultFilters } from '../FiltersContext';
import type { FiltersActions, FiltersState, MainProduct, ProductSelection } from '../filtersTypes';
import { buildCards, remapMainsForScope, remapSelectionForCountry, selectionValidFor } from '../mainSelection';
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
 *  = 该国首个我司手机型号（DE = nova 14 Pro 走兜底，ID = Mate X7 默认矩阵显式声明）。 */
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

  it('?c=ID 仅换国家 + 持久化里 RU 的 Mate X6 12+512：同型号合法化 → ID 16+512GB', () => {
    localStorage.setItem(LPL.filters, JSON.stringify({
      ...defaultFilters,
      countryCode: 'RU',
      mains: [mateX6RuCard()],
      v: 12,
    }));
    window.history.replaceState(null, '', '/?c=ID');
    const { state } = renderFilters();
    expect(state().countryCode).toBe('ID');
    // R4-m1：型号在 ID 存在（16+512GB）→ 同型号首个合法配置，不再整组回落默认卡；
    // 非法 12+512GB/SKU 也不得原样保留
    expect(state().mains[0].main).toEqual(MATE_X6_ID);
    expect(state().mains[0].main?.modelId).not.toBe('own-huawei-mate-x7');
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
  });
});

describe('南非分期期数与主分析产品联动', () => {
  it('切到当前没有价格的期数时移除无效主品，避免留下空图（2026-11-10 新册全量换：ZA 默认主品 = Mate 80 Pro，仅 36 期有价）', () => {
    const handle = renderFilters();
    act(() => handle.actions().set({ countryCode: 'ZA' }));
    expect(handle.state().countryCode).toBe('ZA');
    expect(handle.state().mains[0]?.main?.modelId).toBe('own-huawei-mate-80-pro');

    act(() => handle.actions().set({ financingTerm: 36 }));
    expect(handle.state().mains[0]?.main?.modelId).toBe('own-huawei-mate-80-pro');

    act(() => handle.actions().set({ financingTerm: 24 }));
    expect(handle.state().mains).toEqual([]); // Mate 80 Pro 新册仅 36 期有价
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

  it('RU Mate X6 → ID 普通换国：无 ID 快照 → 同型号映射 16+512GB（R4-m1 优先级 2）', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    act(() => actions().set({ countryCode: 'ID' }));
    expect(state().countryCode).toBe('ID');
    // 非法 12+512GB 不保留；同型号在该国仍 in-sale → 16+512GB，而不是 ID 默认 Mate X7
    expect(state().mains[0].main).not.toEqual(MATE_X6_RU);
    expect(state().mains[0].main).toEqual(MATE_X6_ID);
    expect(state().mains[0].main?.modelId).not.toBe('own-huawei-mate-x7');
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
  });

  it('快照含目标国非法 SKU 时不还原（严格校验），同型号映射旧选择 nova 14 Pro 到 RU', () => {
    const { state, actions } = renderFilters();
    // 先普通切到 DE，再手工污染 RU 快照：型号在 RU 有、SKU 行不存在
    act(() => actions().set({ countryCode: 'DE' }));
    sessionStorage.setItem(snapKey('RU'), JSON.stringify({
      mains: [{ id: 'card-bad-sku', main: { modelId: 'own-huawei-mate-x6', romram: '12+512 GB', skuIds: ['own-huawei-mate-x6__12-512gb__nonexistent'] }, compares: [], auto: false }],
    }));
    act(() => actions().set({ countryCode: 'RU' }));
    expect(state().countryCode).toBe('RU');
    // 坏快照不还原；R4-m1 优先级 2 把离开前的 DE 主品同型号映射到 RU（不落非法 SKU）
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
    expect(state().mains[0].main?.modelId).toBe('own-huawei-mate-x7');
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
  });
});

// ============================================================
// t428u Round 4（四轮返修）：m1 换国优先级、S1 逐 SKU 合法化/去重、
// S2 快照对比区校验封顶、S3/S4 显式 mains 键语义与 undefined 防御。
// ============================================================
const IPHONE_17_RU: ProductSelection = { modelId: 'cmp-apple-iphone-17', romram: '8+256 GB', skuIds: ['cmp-apple-iphone-17__8-256gb__black'] };
const IPHONE_17_512_RU: ProductSelection = { modelId: 'cmp-apple-iphone-17', romram: '8+512 GB', skuIds: ['cmp-apple-iphone-17__8-512gb__black'] };
const IPHONE_14_ZA_ONLY: ProductSelection = { modelId: 'cmp-apple-iphone-14', romram: '4+256 GB', skuIds: ['cmp-apple-iphone-14__4-256gb__midnight'] };
const IPHONE_16_MX: ProductSelection = { modelId: 'cmp-apple-iphone-16', romram: '128 GB', skuIds: ['cmp-apple-iphone-16__128gb__black'] };

describe('t428u R4 m1 · 普通换国优先级（快照 → 同型号映射 → 默认）', () => {
  it('RU Mate X6 → DE（同型号缺席）落 DE 默认 nova 14 Pro → RU 还原原 Mate X6 12+512 快照，快照不被 DE 继承主品覆写', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    act(() => actions().set({ countryCode: 'DE' }));
    expect(state().mains[0].main?.modelId).toBe('own-huawei-nova-14-pro');
    // 离开 RU 时保存的快照必须是原 Mate X6 12+512，不能被 DE 的默认主品覆盖
    expect(readSnapshot('RU')?.mains[0].main).toEqual(MATE_X6_RU);
    act(() => actions().set({ countryCode: 'RU' }));
    expect(state().mains[0].main).toEqual(MATE_X6_RU);
    // 回 RU 后快照仍是原选择（DE→RU 的离建快照写的是 DE 键，不碰 RU）
    expect(readSnapshot('RU')?.mains[0].main).toEqual(MATE_X6_RU);
    expect(readSnapshot('DE')?.mains[0].main?.modelId).toBe('own-huawei-nova-14-pro');
  });

  it('目标国已有合法快照时快照优先于同型号映射（优先级 1 > 2）', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    // 先在 ID 建立一份快照（nova 14 Pro，与离开 RU 时的 Mate X6 不同）
    act(() => actions().set({ countryCode: 'ID', mains: [novaCard()] }));
    expect(readSnapshot('ID')?.mains[0].main).toEqual(NOVA_14_PRO);
    act(() => actions().set({ countryCode: 'RU' }));
    act(() => actions().set({ countryCode: 'ID' }));
    expect(state().mains[0].main).toEqual(NOVA_14_PRO);
  });
});

describe('t428u R4 S1 · 多 SKU 勾选组逐个校验与 selKey 去重', () => {
  it('多 SKU 含非法成员：合法子集保留（任一合法不得让非法 SKU 混入）；AE 无白色 → 只剩黑色', () => {
    const sel: ProductSelection = { modelId: 'own-huawei-nova-14-pro', romram: '12+512 GB', skuIds: ['own-huawei-nova-14-pro__12-512gb__black', 'own-huawei-nova-14-pro__12-512gb__white', 'bogus-sku-id'] };
    const legal = remapSelectionForCountry(sel, 'RU', 'phone');
    expect(legal?.skuIds).toEqual(['own-huawei-nova-14-pro__12-512gb__black', 'own-huawei-nova-14-pro__12-512gb__white']);
    const aeLegal = remapSelectionForCountry(sel, 'AE', 'phone');
    expect(aeLegal?.skuIds).toEqual(['own-huawei-nova-14-pro__12-512gb__black']);
  });

  it('非空 SKU 全部非法但配置在该国存在：配置不漂移，配置内换合法 SKU；维表外型号 = null', () => {
    const absent: ProductSelection = { modelId: 'own-huawei-pura-999', romram: '12+256 GB', skuIds: ['nope-1', 'nope-2'] };
    expect(remapSelectionForCountry(absent, 'RU', 'phone')).toBeNull();
    const bogus = { modelId: 'own-huawei-mate-x6', romram: '12+512 GB', skuIds: ['nope-1', 'nope-2'] } as ProductSelection;
    const fixed = remapSelectionForCountry(bogus, 'RU', 'phone');
    expect(fixed?.romram).toBe('12+512 GB');
    expect(fixed?.skuIds).toEqual(['own-huawei-mate-x6__12-512gb__black']);
  });

  it('空 SKU 数组 = 整配置口径原样保留（合法语义不破坏）；型号缺席 = null', () => {
    const whole: ProductSelection = { modelId: 'own-huawei-mate-x6', romram: '16+512 GB', skuIds: [] };
    expect(remapSelectionForCountry(whole, 'ID', 'phone')).toEqual(whole);
    expect(remapSelectionForCountry(whole, 'DE', 'phone')).toBeNull();
  });

  it('多个源配置映射到同一目标配置：按 selKey 去重；对比区与主品同组时剔除', () => {
    // RU 的 12+512 与 ID 行的 16+512 两张卡同时映射到 ID → 都成 16+512，只留一张
    const remapped = remapMainsForScope([
      { id: 'card-a', main: MATE_X6_RU, compares: [] },
      { id: 'card-b', main: MATE_X6_ID, compares: [{ ...MATE_X6_RU, modelId: 'own-huawei-mate-x6' }] },
    ], 'ID', 'phone');
    expect(remapped).toHaveLength(1);
    expect(remapped![0].main).toEqual(MATE_X6_ID);
    expect(remapped![0].compares).toHaveLength(0);
  });
});

describe('t428u R4 S2 · 快照还原对比区校验/剥离与封顶', () => {
  it('快照对比区含目标国非法型号（ZA-only iPhone 14）→ 剥离；合法手动对比保留、auto 模式保留', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([{ id: 'card-ru-nova', main: NOVA_14_PRO!, compares: [IPHONE_17_RU, IPHONE_14_ZA_ONLY], auto: false }]));
    act(() => actions().set({ countryCode: 'DE' }));
    // RU 快照写盘（含非法对比）；污染检查后切回 RU 走快照还原
    expect(readSnapshot('RU')?.mains[0].compares).toHaveLength(2);
    act(() => actions().set({ countryCode: 'RU' }));
    const restored = state().mains[0];
    expect(restored.main).toEqual(NOVA_14_PRO);
    const compareKeys = restored.compares.map((sel) => sel.modelId);
    expect(compareKeys).toContain('cmp-apple-iphone-17');
    expect(compareKeys).not.toContain('cmp-apple-iphone-14');
    for (const compare of restored.compares) expect(selectionValidFor(compare, 'RU', 'phone')).toBe(true);
  });

  it('快照对比区超过 BENCHMARK_CAP_PER_CONFIG=3 → 还原封顶到 3', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([{ id: 'card-ru-nova', main: NOVA_14_PRO!, compares: [IPHONE_17_RU, IPHONE_17_512_RU, IPHONE_16_MX, IPHONE_14_ZA_ONLY], auto: false }]));
    act(() => actions().set({ countryCode: 'DE' }));
    act(() => actions().set({ countryCode: 'RU' }));
    const restored = state().mains[0];
    expect(restored.compares.length).toBeLessThanOrEqual(3);
    for (const compare of restored.compares) expect(selectionValidFor(compare, 'RU', 'phone')).toBe(true);
  });
});

describe('t428u R4 S3/S4 · 显式 mains 键语义与 undefined 防御', () => {
  it('显式 [] 跨国 = 清空态：不查快照、不回填默认，目标国快照同步为空', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    // 先在 ID 建立合法快照（nova 14 Pro），再回 RU
    act(() => actions().set({ countryCode: 'ID', mains: [{ id: 'card-id-nova', main: NOVA_14_PRO, compares: [] }] }));
    act(() => actions().set({ countryCode: 'RU' }));
    expect(readSnapshot('ID')?.mains.length).toBeGreaterThan(0);
    // RU → ID 显式空数组：不得让 ID 旧快照复活，也不得回填 ID 默认卡
    act(() => actions().set({ countryCode: 'ID', mains: [] }));
    expect(state().countryCode).toBe('ID');
    expect(state().mains).toHaveLength(0);
    expect(readSnapshot('ID')?.mains).toHaveLength(0);
  });

  it('补丁 mains: undefined（键存在）不覆盖原状态：按普通换国走同型号映射', () => {
    const { state, actions } = renderFilters();
    act(() => actions().setMains([mateX6RuCard()]));
    act(() => actions().set({ countryCode: 'ID', mains: undefined }));
    expect(state().countryCode).toBe('ID');
    expect(state().mains).toBeTruthy();
    expect(state().mains[0].main).toEqual(MATE_X6_ID);
  });

  it('同口径显式 mains 也规范到当前口径：ID 状态下显式塞非法 12+512 → 同型号 16+512；非法 SKU 剔除', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({ countryCode: 'ID', mains: [novaCard()] }));
    expect(state().mains[0].main?.modelId).toBe('own-huawei-nova-14-pro');
    act(() => actions().set({
      mains: [{ id: 'card-illegal', main: { modelId: 'own-huawei-mate-x6', romram: '12+512 GB', skuIds: ['own-huawei-mate-x6__12-512gb__black', 'bogus'] }, compares: [], auto: false }],
    }));
    expect(state().mains[0].main?.romram).toBe('16+512 GB');
    expect(state().mains[0].main?.skuIds).toEqual(['own-huawei-mate-x6__16-512gb__black']);
    expect(selectionValidFor(state().mains[0].main!, 'ID', 'phone')).toBe(true);
  });

  it('同口径显式非法 SKU 竞品对比：合法子集保留，全非法型号剔除', () => {
    const { state, actions } = renderFilters();
    act(() => actions().set({ countryCode: 'RU', mains: [{ id: 'card-manual', main: NOVA_14_PRO!, compares: [IPHONE_17_RU, IPHONE_14_ZA_ONLY], auto: false }] }));
    expect(state().mains[0].compares.map((sel) => sel.modelId)).toEqual(['cmp-apple-iphone-17']);
  });
});
