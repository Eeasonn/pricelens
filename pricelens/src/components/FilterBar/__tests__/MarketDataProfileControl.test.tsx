// ============================================================
// MarketDataProfileControl · 先付/后付切换回归（2026-11-11 实机 BUG）：
// - 进 ZA 默认「后付 · 36 期」（默认 effect 只在 financingType==null 时兜底）；
// - 点击「先付」后 financingType 保持 prepaid 不被弹回。
//   复现：旧默认 effect 把 financingTerms.length===0 当「未选」信号——切先付后
//   applyMarketDataProfile 会清空 terms（先付无期数，正确行为），effect 立刻
//   弹回后付·36，先付永远切不过去（持久化写入时间线实锤：prepaid 写入 19ms
//   后被 installment+[36] 覆盖）。
// 点击方式：antd Segmented 的 radio 用原生 input.click()（jsdom 激活行为会置
// checked 并经 value tracking 合成 onChange；fireEvent.click 不走默认行为）。
// ============================================================
// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { FiltersProvider, useFilters } from '../../../state/FiltersContext';
import type { FiltersActions, FiltersState } from '../../../state/filtersTypes';
import MarketDataProfileControl from '../MarketDataProfileControl';

// 本仓库 vitest jsdom 不带 localStorage：装内存桩（同 scope-rework stable 手法）
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

let currentState: FiltersState | null = null;
let currentActions: FiltersActions | null = null;

function Probe(): ReactNode {
  const { state, actions } = useFilters();
  currentState = state;
  currentActions = actions;
  return null;
}

describe('MarketDataProfileControl · 先付切换不被默认 effect 弹回（2026-11-11）', () => {
  it('进 ZA 默认落「后付 · 36 期」（financingType==null 兜底仍生效）', async () => {
    render(<FiltersProvider><MarketDataProfileControl /><Probe /></FiltersProvider>);
    // 国家切换路径会把 financingType 重置为 null，随后控件 effect 兜底默认后付·36
    await act(async () => { currentActions!.set({ countryCode: 'ZA' }); });
    expect(currentState!.financingType).toBe('installment');
    expect(currentState!.financingTerms).toEqual([36]);
  });

  it('点击「先付」后 financingType 保持 prepaid（不被回弹成后付·36）', async () => {
    render(<FiltersProvider><MarketDataProfileControl /><Probe /></FiltersProvider>);
    await act(async () => { currentActions!.set({ countryCode: 'ZA' }); });
    expect(currentState!.financingType).toBe('installment'); // 进页默认
    const prepaid = screen.getByRole('radio', { name: '先付' }) as HTMLInputElement;
    await act(async () => { prepaid.click(); });
    expect(currentState!.financingType).toBe('prepaid');
    // 再冲刷一轮 effect：旧实现会在 effect 回弹 installment+[36]，回归即在此暴露
    await act(async () => { await Promise.resolve(); });
    expect(currentState!.financingType).toBe('prepaid');
    expect(currentState!.financingTerms).toEqual([]);
    // 且界面上先付保持选中
    expect((screen.getByRole('radio', { name: '先付' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: '后付' }) as HTMLInputElement).checked).toBe(false);
  });
});
