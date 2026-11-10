// ============================================================
// 配置页 RBAC 组件测试（2026-11-06 稳定版：GTM/查阅者权限分组 + 导入导出）：
// - 默认 gtm：工具行有「导入配置」「导出配置」，无查阅者横幅
// - 切换查阅者：横幅出现「查阅者不可修改配置，请联系 GTM」；导入入口不渲染；
//   导出仍可用；竞品「编辑」/ 异常守卫开关 / 上一代下拉 / 默认店铺下拉全部禁用
// - matrix-only 临时口径（2026-11-10）：竞品「编辑」恒禁用，title 按角色区分
//   （GTM = MATRIX_READONLY_HINT 统一说明句、查阅者 = 不可修改配置）；
//   禁用标签色 = color.mute、光标 not-allowed
// - 子导航当前分区有选中态（aria-current + 墨色 + 2px 墨色下划线，点击跟随；
//   2026-11-10 UI 审计：此前六个分区同为蓝链接，分不清所在分区）
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
import { MATRIX_READONLY_HINT } from '../config/BenchmarkConfigBlock';

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

  // 2026-11-10 UI 审计：子导航当前分区选中态（与页头当前页标记同语法）
  it('子导航当前分区有选中态：aria-current + 墨色文字 + 2px 墨色下划线，点击跟随分区', () => {
    render(<App />);
    const nav = document.querySelector('nav[aria-label="配置分区"]') as HTMLElement | null;
    expect(nav).not.toBeNull();
    // 默认落在第一个分区「竞品对标」，且全导航恰好一处 aria-current
    const currents = () => Array.from(nav!.querySelectorAll('a[aria-current="page"]')) as HTMLElement[];
    expect(currents()).toHaveLength(1);
    expect(currents()[0]!.textContent).toBe('竞品对标');
    // 选中态可从样式断言：墨色文字 + 2px 墨色下划线（jsdom 序列化为 rgb）
    expect(currents()[0]!.style.color).toBe('rgb(23, 23, 23)');
    expect(currents()[0]!.style.fontWeight).toBe('600');
    expect(currents()[0]!.style.borderBottomWidth).toBe('2px');
    expect(currents()[0]!.style.borderBottomColor).toBe('rgb(23, 23, 23)');
    // 非当前项保持蓝链接（无 aria-current、无墨色）
    const prevGen = nav!.querySelector('a[href="#prev-gen"]') as HTMLAnchorElement;
    expect(prevGen.getAttribute('aria-current')).toBeNull();
    expect(prevGen.style.color).toBe('rgb(0, 112, 243)');
    // 点击「上一代关系」→ aria-current 跟随移动
    fireEvent.click(prevGen);
    expect(currents()).toHaveLength(1);
    expect(currents()[0]!.textContent).toBe('上一代关系');
    expect(prevGen.getAttribute('aria-current')).toBe('page');
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
    // 竞品对标「编辑」按钮（任意一枚）：禁用 + title 标注查阅者不可改
    const edit = buttonByText('编辑');
    expect(edit).not.toBeNull();
    expect(edit!.disabled).toBe(true);
    expect(edit!.title).toContain('查阅者');
    // 异常守卫开关（页面唯一 switch）
    const guardSwitch = screen.getByRole('switch').closest('.ant-switch');
    expect(guardSwitch?.classList.contains('ant-switch-disabled')).toBe(true);
    // 上一代关系 / 默认店铺下拉出现禁用态
    expect(document.querySelectorAll('.ant-select-disabled').length).toBeGreaterThan(0);
  });

  it('切回 GTM：横幅消失；竞品「编辑」恒禁用（matrix-only：title = 矩阵只读统一说明句），导入入口恢复', () => {
    render(<App />);
    fireEvent.click(segItem('查阅者'));
    expect(screen.getByText(/查阅者不可修改配置/)).toBeDefined();
    fireEvent.click(segItem('GTM'));
    expect(screen.queryByText(/查阅者不可修改配置/)).toBeNull();
    // matrix-only 临时口径（2026-11-10）：编辑入口保留但不生效，GTM 态同样禁用；
    // title 与行尾「矩阵」徽章 tooltip 同源（MATRIX_READONLY_HINT，两处口径一致）；
    // 2026-11-10 UI 审计：禁用标签色取 color.mute（默认禁用灰过虚）+ not-allowed 光标
    const edit = buttonByText('编辑')!;
    expect(edit.disabled).toBe(true);
    expect(edit.title).toBe(MATRIX_READONLY_HINT);
    // jsdom 将 hex 序列化为 rgb（color.mute = #737373 = rgb(115,115,115)）
    expect(edit.style.color).toBe('rgb(115, 115, 115)');
    expect(edit.style.cursor).toBe('not-allowed');
    expect(buttonByText('导入配置')).not.toBeNull();
  });
});
