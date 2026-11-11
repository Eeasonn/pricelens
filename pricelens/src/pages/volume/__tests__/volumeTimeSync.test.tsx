// ============================================================
// 量价页「轴同步」开关（2026-11-03 主产品视图补同款，两视图通用）：
// ① 主产品视图（默认视图）首个面板底部时间轨左侧出现「轴同步」开关，默认开
//    （volume.synced 默认 true → timeSynced 派生：各面板共用一段查看时间）；
// ② 点击关 → 按压态翻转、状态写入会话态 volume.synced，各面板拿到独立窗口
//    种子（panelWins 由共享窗口填充 = 可独立调整，不再恒等联动）；
// ③ 重挂载（刷新语义）后开关态从会话态恢复；④ 再点开 → panelWins 清回
//    null，全部面板回共用窗口。
// 组装模式照 volumePromo.test.tsx（mock echarts + ResizeObserver 定宽驱动测量）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), clear: vi.fn(), dispose: vi.fn() })),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, ScatterChart: {} }));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  MarkAreaComponent: {},
  MarkLineComponent: {},
  MarkPointComponent: {},
  DataZoomComponent: {},
  BrushComponent: {},
  VisualMapComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const RO_WIDTH = 1200;
class ResizeObserverStub {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: Element): void {
    Object.defineProperty(el, 'clientWidth', { value: RO_WIDTH, configurable: true });
    this.cb([{ contentRect: { width: RO_WIDTH } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import App from '../../../App';

afterEach(cleanup);

const viewStateRaw = (key: string): string | null => {
  try {
    return sessionStorage.getItem(`LPL3.view.${key}`);
  } catch {
    return null;
  }
};
const syncToggle = (): HTMLButtonElement => screen.getByRole('button', { name: '轴同步' }) as HTMLButtonElement;
const panelWinsStored = (): unknown[] => {
  const raw = viewStateRaw('volume.panelWins');
  return raw ? (JSON.parse(raw) as unknown[]) : [];
};

describe('量价页 · 轴同步开关（主产品视图）', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?p=volume');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用（FiltersProvider 自带 try/catch 兜底） */
    }
  });

  it('主产品视图出现开关：默认同步（按压态开、独立窗口全空 = 共用窗口）', () => {
    render(<App />);
    const btn = syncToggle();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('title')).toBe('同步：各图共用一段查看时间');
    // timeSynced 派生（默认同步）：各面板无独立窗口，全部回落共享窗口
    const wins = panelWinsStored();
    expect(wins.length).toBeGreaterThan(0);
    expect(wins.every((w) => w === null)).toBe(true);
  });

  it('关闭 → 状态写入 volume.synced=false，各面板种子独立窗口（可独立调整）', () => {
    render(<App />);
    fireEvent.click(syncToggle());
    const btn = syncToggle();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('title')).toBe('独立：各图分别调整');
    expect(viewStateRaw('volume.synced')).toBe('false');
    // 关同步 = 各面板独立窗口：panelWins 由共享窗口种子填充（非空 [s, e] 对）
    const wins = panelWinsStored();
    expect(wins.length).toBeGreaterThan(0);
    expect(wins.every((w) => Array.isArray(w) && (w as unknown[]).length === 2)).toBe(true);
  });

  it('重挂载后开关态从会话态恢复（刷新语义）', () => {
    render(<App />);
    fireEvent.click(syncToggle());
    expect(viewStateRaw('volume.synced')).toBe('false');
    cleanup();
    render(<App />);
    expect(syncToggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('再点开 → 回共用窗口（panelWins 清回 null）', () => {
    render(<App />);
    fireEvent.click(syncToggle());
    expect(panelWinsStored().some((w) => Array.isArray(w))).toBe(true);
    fireEvent.click(syncToggle());
    expect(syncToggle().getAttribute('aria-pressed')).toBe('true');
    expect(panelWinsStored().every((w) => w === null)).toBe(true);
    expect(viewStateRaw('volume.synced')).toBe('true');
  });
});
