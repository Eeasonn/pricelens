// 2026-11-09 用户反馈「自动时间不按逻辑来」根因②修复：时间范围/自动态此前是
// 全局单份，切国家把上一个口径的手动范围原样带进新口径。现按 国家.产业 快照
// 隔离（swapRangeSnapshot，sessionStorage 标签页隔离）：切走落盘、切入恢复、
// 无快照回自动。本文件锁行为。
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultFilters, FiltersProvider, useFilters } from '../FiltersContext';
import { LPL } from '../lplKeys';

/** 本 vitest jsdom 环境不带 localStorage（探针实测 sessionStorage 有、localStorage 无）：
 *  装内存桩让 FiltersProvider 的持久化读写可测（同 filtersScope.test.tsx 桩法）。 */
if (typeof window.localStorage !== 'object') {
  const map = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, String(value)); },
      removeItem: (key: string) => { map.delete(key); },
      clear: () => { map.clear(); },
      key: (index: number) => [...map.keys()][index] ?? null,
      get length() { return map.size; },
    },
  });
}

afterEach(() => cleanup());
// 注意：清存储必须在用例体开头做（不能只靠 beforeEach）——上一条用例 provider 的
// passive persist effect 会在本条 act(render) 开始时才冲刷落盘（React 18 时序），
// beforeEach 里清完还会被补写回上一条终态。先清 → render → 才是真隔离。
function freshStorage(): void {
  // 先空 act 冲刷上一用例 provider 挂起的 passive persist effect（它会在下一次
  // act 边界把上一终态补写回 blob，清在前面等于白清），再清两库 + URL。
  // URL 是第四条全局通道：urlSync 会把上一用例终态 replaceState 进地址栏，
  // 下一用例的 provider 启动时 applyUrlOverrides 会从 URL 读回 cc 等（比持久化
  // 优先级还高）——不清则「切国家」在断言里根本不触发 scope 切换。
  act(() => {});
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, '', window.location.pathname);
}

interface RangeSnapshot {
  cc: string;
  adaptive: boolean;
  rs: string | null;
  re: string | null;
}

function RangeProbe() {
  const { state, actions } = useFilters();
  return (
    <>
      <button type="button" onClick={() => actions.set({ adaptive: false, rangeStart: '2026W25', rangeEnd: '2026W32' })}>RU 手动 25-32</button>
      <button type="button" onClick={() => actions.set({ adaptive: false, rangeStart: '2026W20', rangeEnd: '2026W30' })}>当前口径手动 20-30</button>
      <button type="button" onClick={() => actions.set({ countryCode: 'AE' })}>切 AE</button>
      <button type="button" onClick={() => actions.set({ countryCode: 'RU' })}>切 RU</button>
      <output data-range>{JSON.stringify({ cc: state.countryCode, adaptive: state.adaptive, rs: state.rangeStart, re: state.rangeEnd })}</output>
    </>
  );
}

const rangeOf = (view: ReturnType<typeof render>): RangeSnapshot =>
  JSON.parse(view.container.querySelector('[data-range]')?.textContent ?? '{}') as RangeSnapshot;

describe('时间范围/自动态按 国家.产业 隔离（swapRangeSnapshot）', () => {
  it('切到没访问过的国家：回自动（无快照 = 不带旧国手动范围）', () => {
    freshStorage();
    const view = render(<FiltersProvider><RangeProbe /></FiltersProvider>);
    expect(rangeOf(view).cc).toBe(defaultFilters.countryCode);
    fireEvent.click(screen.getByRole('button', { name: 'RU 手动 25-32' }));
    expect(rangeOf(view)).toMatchObject({ adaptive: false, rs: '2026W25', re: '2026W32' });
    fireEvent.click(screen.getByRole('button', { name: '切 AE' }));
    const after = rangeOf(view);
    expect(after.cc).toBe('AE');
    expect(after.adaptive).toBe(true); // AE 无快照 → 回自动
  });

  it('回切原国：手动范围原样恢复', () => {
    freshStorage();
    const view = render(<FiltersProvider><RangeProbe /></FiltersProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'RU 手动 25-32' }));
    fireEvent.click(screen.getByRole('button', { name: '切 AE' }));
    expect(rangeOf(view).adaptive).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '切 RU' }));
    expect(rangeOf(view)).toMatchObject({ cc: 'RU', adaptive: false, rs: '2026W25', re: '2026W32' });
  });

  it('两国各自的手动范围互不串扰（先访问 AE 手动 20-30，再经 RU 回 AE）', () => {
    freshStorage();
    const view = render(<FiltersProvider><RangeProbe /></FiltersProvider>);
    fireEvent.click(screen.getByRole('button', { name: '切 AE' })); // 先到 AE（自动）
    fireEvent.click(screen.getByRole('button', { name: '当前口径手动 20-30' }));
    expect(rangeOf(view)).toMatchObject({ cc: 'AE', adaptive: false, rs: '2026W20', re: '2026W30' });
    fireEvent.click(screen.getByRole('button', { name: '切 RU' }));
    expect(rangeOf(view).adaptive).toBe(true); // RU 无快照 → 自动
    fireEvent.click(screen.getByRole('button', { name: '切 AE' }));
    expect(rangeOf(view)).toMatchObject({ cc: 'AE', adaptive: false, rs: '2026W20', re: '2026W30' });
  });

  it('启动恢复：优先取本口径快照（全局 blob 是别国手动范围时不串）', () => {
    freshStorage();
    // 预置：全局 blob = 别的口径留下的手动范围；RU.快照 = RU 自己的手动范围
    window.localStorage.setItem(LPL.filters, JSON.stringify({ ...defaultFilters, countryCode: 'RU', adaptive: false, rangeStart: '2026W41', rangeEnd: '2026W45', v: 12 }));
    window.sessionStorage.setItem(`${LPL.filters}.rangeOf.RU.phone`, JSON.stringify({ adaptive: false, rangeStart: '2026W25', rangeEnd: '2026W32' }));
    const view = render(<FiltersProvider><RangeProbe /></FiltersProvider>);
    expect(rangeOf(view)).toMatchObject({ cc: 'RU', adaptive: false, rs: '2026W25', re: '2026W32' });
  });
});
