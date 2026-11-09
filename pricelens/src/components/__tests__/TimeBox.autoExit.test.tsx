// 2026-11-09 用户反馈「自动时间不按逻辑来」根因①修复：Agent 价差/预警定位与
// 带 rs=re 的分享链接会静默退出自动时间——程序路径退出经 autoTimeBus 打标，
// TimeBox 消费后显示「已固定时间范围（原因）· 回自动」提示条；用户自己手选
// 范围不走信封、无提示。本文件锁行为。
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TimeBox from '../FilterBar/TimeBox';
import { FiltersProvider } from '../../state/FiltersContext';
import { markAutoTimeExit, clearAutoTimeExit } from '../../state/autoTimeBus';

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

/** 清三库 + URL（urlSync 会把状态 replaceState 进地址栏，provider 启动时 URL
 *  优先级最高，不清则上一用例的 cc/range 直接串场——见 range-scope.test 注）。 */
function freshEnv(): void {
  act(() => {});
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, '', window.location.pathname);
  clearAutoTimeExit();
}

const toggleAuto = (view: ReturnType<typeof render>): void => {
  const btn = view.container.querySelector('button[aria-label="自动时间"], button[aria-label="回到自动时间"]');
  if (!btn) throw new Error('自动时间按钮不存在');
  fireEvent.click(btn);
};

describe('TimeBox · 程序路径退出自动时间的显性提示', () => {
  it('带信封退出：显示原因 + 一键回自动', () => {
    freshEnv();
    const view = render(<FiltersProvider><TimeBox /></FiltersProvider>);
    expect(screen.queryByText(/已固定时间范围/)).toBeNull();
    markAutoTimeExit('Agent 跳转');
    act(() => { toggleAuto(view); });
    const hint = screen.getByText(/已固定时间范围（Agent 跳转）/);
    expect(hint).toBeTruthy();
    // 一键回自动
    fireEvent.click(screen.getByRole('button', { name: '回自动' }));
    expect(screen.queryByText(/已固定时间范围/)).toBeNull();
    const btn = view.container.querySelector('button[aria-label="自动时间"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('用户手选范围退出（无信封）：不打扰', () => {
    freshEnv();
    const view = render(<FiltersProvider><TimeBox /></FiltersProvider>);
    act(() => { toggleAuto(view); });
    expect(view.container.querySelector('button[aria-label="回到自动时间"]')).toBeTruthy();
    expect(screen.queryByText(/已固定时间范围/)).toBeNull();
  });

  it('回自动后信封清空：再次手选退出不再显示旧原因', () => {
    freshEnv();
    const view = render(<FiltersProvider><TimeBox /></FiltersProvider>);
    markAutoTimeExit('预警定位');
    act(() => { toggleAuto(view); });
    expect(screen.getByText(/已固定时间范围（预警定位）/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '回自动' }));
    act(() => { toggleAuto(view); }); // 这次没有新信封
    expect(screen.queryByText(/已固定时间范围/)).toBeNull();
  });
});
