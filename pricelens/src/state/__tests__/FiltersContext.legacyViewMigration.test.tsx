// ============================================================
// 旧「分析结构」载荷 → 视图字段迁移（2026-11-27 二轮「视图：对标 / 分列」）：
// 持久化里 analysisMode = 'panorama' + 品牌全景草稿按两条路迁移——
// ① mains 无任何选择：全景选择折成一张卡（主品 = 首个我司品牌选择、其余 = 对比、
//   来源 manual、auto:false、selKey 去重），viewMode = 'columns'、groupBy = brand，
//   沿用 sharedY / baselineKey（基准不在迁移后选择中时由 mains 收口清空）；
// ② mains 已有选择：mains 原样为准（同一批产品的另一种摆法，不重复并入），
//   只 viewMode = 'columns'；
// ③ analysisMode = 'compare' / 无旧字段：视图按新字段/默认，不迁移；
// ④ 迁移后旧字段不落进状态（state 上不再有 analysisMode / panorama 键）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FiltersProvider, useFilters, defaultFilters } from '../FiltersContext';
import type { FiltersState, ProductSelection } from '../filtersTypes';
import { selKey } from '../mainSelection';
import { LPL } from '../lplKeys';
import { ownBrand } from '../../components/ProductCascader/tree';

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

// 数据事实（dim_product RU phone）：nova 14 我司在售；iPhone 17 / S26 竞品在售
const NOVA14: ProductSelection = { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: ['own-huawei-nova-14__12-256gb__black'] };
const IPHONE17: ProductSelection = { modelId: 'cmp-apple-iphone-17', romram: '8+256 GB', skuIds: ['cmp-apple-iphone-17__8-256gb__black'] };
const S26: ProductSelection = { modelId: 'cmp-samsung-s26', romram: '12+256 GB', skuIds: ['cmp-samsung-s26__12-256gb__black'] };

let currentState: FiltersState | null = null;
function Probe(): ReactNode {
  const { state } = useFilters();
  currentState = state;
  return null;
}
function renderFilters(): FiltersState {
  currentState = null;
  render(<FiltersProvider><Probe /></FiltersProvider>);
  expect(currentState).toBeTruthy();
  return currentState!;
}

/** 合法 v12 载荷（以 defaultFilters 为底，readPersistedState 形状校验稳过）+ 旧分析结构字段 */
function writeLegacyPayload(extra: Record<string, unknown>): void {
  localStorage.setItem(LPL.filters, JSON.stringify({
    ...defaultFilters,
    v: 12,
    mains: [],
    countryCode: 'RU',
    industry: 'phone',
    ...extra,
  }));
}

describe('旧品牌全景载荷迁移（mains 空 → 折一张卡）', () => {
  it('主品 = 首个我司品牌选择；其余按 selKey 去重进对比区、来源 manual、auto:false；视图 = 分列 · 品牌', () => {
    expect(ownBrand()).toBe('HUAWEI');
    writeLegacyPayload({
      analysisMode: 'panorama',
      panorama: {
        brands: [
          { brand: 'HUAWEI', sels: [NOVA14] },
          { brand: 'APPLE', sels: [IPHONE17] },
          { brand: 'SAMSUNG', sels: [S26, IPHONE17] }, // IPHONE17 重复——只出现一次
        ],
        sharedY: false,
        baselineKey: selKey(IPHONE17),
      },
    });
    const state = renderFilters();
    expect(state.viewMode).toBe('columns');
    expect(state.columns.groupBy).toBe('brand');
    expect(state.columns.sharedY).toBe(false); // 沿用旧全景的 Y 轴设置
    // 折出恰好一张卡：主品 = 我司选择（nova 14），对比 = 其余去重
    expect(state.mains).toHaveLength(1);
    const card = state.mains[0];
    expect(selKey(card.main!)).toBe(selKey(NOVA14));
    expect(card.auto).toBe(false);
    expect(card.compares.map(selKey)).toEqual([selKey(IPHONE17), selKey(S26)]);
    expect(card.compareSources?.[selKey(IPHONE17)]).toBe('manual');
    expect(card.compareSources?.[selKey(S26)]).toBe('manual');
    // 基准键沿用（IPHONE17 在迁移后对比区里 → 不收口清空）
    expect(state.columns.baselineKey).toBe(selKey(IPHONE17));
    // 旧字段不落进状态
    expect('analysisMode' in state).toBe(false);
    expect('panorama' in state).toBe(false);
  });

  it('全景里没有我司选择 → 主品 null 的空对，全部进对比区；基准不在册即清空', () => {
    writeLegacyPayload({
      analysisMode: 'panorama',
      panorama: {
        brands: [{ brand: 'APPLE', sels: [IPHONE17] }],
        sharedY: true,
        baselineKey: 'cmp-nonexistent-model|12+256GB',
      },
    });
    const state = renderFilters();
    expect(state.viewMode).toBe('columns');
    const card = state.mains[0];
    expect(card.main).toBeNull();
    expect(card.compares.map(selKey)).toEqual([selKey(IPHONE17)]);
    expect(state.columns.baselineKey).toBeNull(); // 基准不在迁移后选择中 → 清空
  });
});

describe('旧品牌全景载荷迁移（mains 已有选择 → mains 为准）', () => {
  it('mains 原样保留、不并入全景选择；只切分列视图；旧字段丢弃', () => {
    writeLegacyPayload({
      analysisMode: 'panorama',
      panorama: { brands: [{ brand: 'SAMSUNG', sels: [S26] }], sharedY: false, baselineKey: selKey(S26) },
      mains: [{ id: 'card-keep', main: NOVA14, compares: [IPHONE17], auto: false, compareSources: { [selKey(IPHONE17)]: 'manual' } }],
    });
    const state = renderFilters();
    expect(state.viewMode).toBe('columns');
    expect(state.mains).toHaveLength(1);
    expect(state.mains[0].id).toBe('card-keep');
    expect(state.mains[0].compares.map(selKey)).toEqual([selKey(IPHONE17)]); // S26 没有并入
    expect('analysisMode' in state).toBe(false);
    expect('panorama' in state).toBe(false);
  });
});

describe('无迁移语义的路径', () => {
  it('analysisMode = compare（无全景草稿）→ 视图落对标、分列设置默认；旧字段丢弃', () => {
    writeLegacyPayload({ analysisMode: 'compare' });
    const state = renderFilters();
    expect(state.viewMode).toBe('compare');
    expect(state.columns).toEqual({ groupBy: 'brand', sharedY: true, baselineKey: null });
    expect('analysisMode' in state).toBe(false);
    expect('panorama' in state).toBe(false);
  });

  it('新载荷已带 viewMode / columns 且无旧字段 → 原样恢复', () => {
    writeLegacyPayload({
      viewMode: 'columns',
      columns: { groupBy: 'tier', sharedY: false, baselineKey: null },
    });
    const state = renderFilters();
    expect(state.viewMode).toBe('columns');
    expect(state.columns.groupBy).toBe('tier');
    expect(state.columns.sharedY).toBe(false);
  });

  it('无持久化载荷 → 默认对标视图', () => {
    const state = renderFilters();
    expect(state.viewMode).toBe('compare');
  });
});
