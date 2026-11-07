// ============================================================
// 配置页 RBAC 组件测试（2026-11-06 稳定版：GTM/查阅者权限分组 + 导入导出）：
// - 默认 gtm：工具行有「导入配置」「导出配置」，无查阅者横幅，可编辑控件可用
// - 切换查阅者：横幅出现「查阅者不可修改配置，请联系 GTM」；导入入口不渲染；
//   导出仍可用；竞品「编辑」/ 异常守卫开关 / 上一代下拉 / 默认店铺下拉全部禁用
// - 角色切换标注「正式环境将由账号权限下发」（开发/演示用）
// echarts mock 同 appShell.test（App 壳整体渲染，只验证 React 组装）。
// ============================================================
// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import App from '../../App';
import { ACCESS_ROLE_KEY } from '../../access/role';

// 本仓库 vitest jsdom 不带 localStorage：装内存桩（同 DataQualityBlock.test 手法）
beforeAll(() => {
  const w = window as unknown as { localStorage?: Storage };
  if (w.localStorage) return;
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
});

afterAll(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* 受限环境 */
  }
});

afterEach(cleanup);

function resetTo(path: string): void {
  window.history.replaceState(null, '', path);
  sessionStorage.clear();
  try {
    localStorage.clear();
  } catch {
    /* 受限环境 localStorage 不可用 */
  }
}

const buttonByText = (text: string): HTMLButtonElement | null => {
  const el = screen.queryAllByText(text).find((n) => n.closest('button'));
  return el ? (el.closest('button') as HTMLButtonElement) : null;
};

/** antd Segmented 选项点击（同 DataQualityBlock.test 手法：点 .ant-segmented-item） */
const segItem = (name: string): HTMLElement =>
  screen.getAllByText(name).find((el) => el.closest('.ant-segmented-item')) as HTMLElement;

describe('配置页 · 默认 GTM', () => {
  beforeEach(() => resetTo('/?p=config'));

  it('工具行有「导入配置」「导出配置」，均可用；无查阅者横幅', () => {
    render(<App />);
    const imp = buttonByText('导入配置');
    const exp = buttonByText('导出配置');
    expect(imp).not.toBeNull();
    expect(exp).not.toBeNull();
    expect(imp!.disabled).toBe(false);
    expect(exp!.disabled).toBe(false);
    expect(screen.queryByText(/查阅者不可修改配置/)).toBeNull();
  });

  it('角色切换标注「正式环境将由账号权限下发」', () => {
    render(<App />);
    expect(screen.getByText('正式环境将由账号权限下发')).toBeDefined();
  });
});

describe('配置页 · 切换查阅者（viewer）', () => {
  beforeEach(() => resetTo('/?p=config'));

  it('横幅出现、导入入口不渲染、导出仍可用、角色落盘', () => {
    render(<App />);
    fireEvent.click(segItem('查阅者'));
    expect(screen.getByText(/查阅者不可修改配置，请联系 GTM/)).toBeDefined();
    expect(buttonByText('导入配置')).toBeNull(); // 隐藏而非仅禁用
    expect(buttonByText('导出配置')!.disabled).toBe(false); // 查阅者仍可导出备份
    expect(window.localStorage.getItem(ACCESS_ROLE_KEY)).toBe('viewer');
  });

  it('竞品「编辑」、异常守卫开关、上一代下拉、默认店铺下拉全部禁用', () => {
    render(<App />);
    fireEvent.click(segItem('查阅者'));
    // 竞品对标「编辑」按钮（任意一枚）
    const edit = buttonByText('编辑');
    expect(edit).not.toBeNull();
    expect(edit!.disabled).toBe(true);
    // 异常守卫开关（页面唯一 switch）
    const guardSwitch = screen.getByRole('switch').closest('.ant-switch');
    expect(guardSwitch?.classList.contains('ant-switch-disabled')).toBe(true);
    // 上一代关系 / 默认店铺下拉出现禁用态
    expect(document.querySelectorAll('.ant-select-disabled').length).toBeGreaterThan(0);
  });

  it('切回 GTM：横幅消失、编辑控件恢复可用', () => {
    render(<App />);
    fireEvent.click(segItem('查阅者'));
    expect(screen.getByText(/查阅者不可修改配置/)).toBeDefined();
    fireEvent.click(segItem('GTM'));
    expect(screen.queryByText(/查阅者不可修改配置/)).toBeNull();
    expect(buttonByText('编辑')!.disabled).toBe(false);
    expect(buttonByText('导入配置')).not.toBeNull();
  });
});
