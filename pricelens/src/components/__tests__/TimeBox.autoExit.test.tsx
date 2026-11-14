// 2026-11-13 时间筛选单值化（Eason）：「自动时间/回到自动」按钮与「已固定时间
// 范围」提示条退役——时间筛选簇 = 最晚时间单值选择器（最早时间由看板底部时间
// 拖块控制）。本文件锁新行为：
// ① 自动时间按钮不存在；② 选择器值 = 当前最晚桶（周短格式）；
// ③ endChangePatch 状态机：更早终点保持起点 / 终点早于起点时起点钉到终点 /
//    越界值拒绝。
// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TimeBox, { endChangePatch } from '../FilterBar/TimeBox';
import { dataBucketRange, enumerateBuckets } from '../../chart/PriceTrend/helpers';
import { FiltersProvider } from '../../state/FiltersContext';

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
}

describe('TimeBox · 最晚时间单值选择器（2026-11-13）', () => {
  it('「自动时间」按钮退役：时间簇内无任何自动开关、无固定范围提示条', () => {
    freshEnv();
    const view = render(<FiltersProvider><TimeBox /></FiltersProvider>);
    expect(view.container.querySelector('button[aria-label="自动时间"]')).toBeNull();
    expect(view.container.querySelector('button[aria-label="回到自动时间"]')).toBeNull();
    expect(view.container.textContent).not.toContain('已固定时间范围');
  });

  it('单值选择器存在，可访问名 = 最晚时间（周），值 = 当前最晚桶短格式', () => {
    freshEnv();
    const view = render(<FiltersProvider><TimeBox /></FiltersProvider>);
    const input = view.container.querySelector<HTMLInputElement>('.xbrush-range-picker input');
    expect(input).toBeTruthy();
    // aria 由 TimeRangeCluster 的 effect 回填（jsdom 下 effect 同步跑）
    expect(input?.getAttribute('aria-label')).toBe('最晚时间（周）');
    const value = input?.value ?? '';
    expect(value).toMatch(/^\d{4}W\d{2}$/);
  });

  it('endChangePatch：更早终点保持起点，恒置 adaptive=false', () => {
    const buckets = enumerateBuckets('week', ...dataBucketRange('week'));
    const start = buckets[10].id;
    const end = buckets[20].id;
    const target = buckets[18].id;
    expect(endChangePatch(start, buckets, target)).toEqual({ adaptive: false, rangeEnd: target });
  });

  it('endChangePatch：终点早于起点 → 起点一并钉到终点（起点 ≤ 终点不变式）', () => {
    const buckets = enumerateBuckets('week', ...dataBucketRange('week'));
    const start = buckets[20].id;
    const target = buckets[12].id;
    expect(endChangePatch(start, buckets, target)).toEqual({
      adaptive: false, rangeStart: target, rangeEnd: target,
    });
  });

  it('endChangePatch：不在数据全集的桶 id = null（拒绝，不落状态）', () => {
    const buckets = enumerateBuckets('week', ...dataBucketRange('week'));
    expect(endChangePatch(buckets[10].id, buckets, '299901')).toBeNull();
  });
});
