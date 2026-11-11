// ============================================================
// 量价页 · 全局平台筛选器（2026-11-05，Eason 指令「两版都生效」）：
// 「删除店铺同步的功能，删除每个产品卡片选店铺的功能。改为在顶部产品后面加一个
// 平台筛选器，它筛选的结果会作用于底下所有的产品。我们不允许每个产品单独选择
// 平台店铺。」
// 覆盖三件事：
// ① FilterBar 平台位置断言：平台 Select 紧随「选择产品」入口之后、币种之前，
//    默认显示「默认 · DNS」（现默认平台）；
// ② 写路径断言：选平台 → state.platform = 平台级单选（URL plat= 链接同键），
//    选「默认」→ platform = null（plat 键删除）；每卡取价平台 chip / 店铺同步钮
//    不再出现（volumeStoreSync 旧契约随功能删除）；
// ③ 数据口径断言：UI 切平台后组视图明细卡（观察列 = 窗口末桶）价格口径变化，
//    且与 plat= 直达链接的整页口径完全一致——「筛选结果作用于底下所有产品」。
// 组装模式照已删除的 volumeStoreSync.test.tsx（App 全量渲染 + echarts mock）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

/** 顶部筛选条的平台 Select（antd id 落在选择器内 input 上） */
const platformInput = (): HTMLInputElement =>
  document.querySelector('input#scope-platform') as HTMLInputElement;
/** 平台 Select 当前显示值（.ant-select-selection-item） */
const platformShown = (): string =>
  platformInput()?.closest('.ant-select')?.querySelector('.ant-select-selection-item')?.textContent ?? '';

/** 打开平台下拉并点选指定文案的选项（antd Select jsdom 交互，照 ReferencePanel 范式） */
async function pickPlatform(label: string): Promise<void> {
  const input = platformInput();
  fireEvent.mouseDown(input?.closest('.ant-select-selector') ?? input);
  const dropdown = await waitFor(() => {
    const el = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].pop();
    if (!el) throw new Error('平台下拉未展开');
    return el;
  });
  const option = [...dropdown.querySelectorAll('.ant-select-item-option')]
    .find((item) => (item.textContent ?? '').trim() === label);
  if (!option) throw new Error(`平台选项未找到：${label}`);
  fireEvent.click(option);
}

/** 下拉顶部的「默认」按钮（2026-11-11：默认不再是平齐选项，提出为顶部按钮） */
async function pickDefault(): Promise<void> {
  const input = platformInput();
  fireEvent.mouseDown(input?.closest('.ant-select-selector') ?? input);
  const dropdown = await waitFor(() => {
    const el = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].pop();
    if (!el) throw new Error('平台下拉未展开');
    return el;
  });
  const btn = dropdown.querySelector('[role="button"]');
  if (!btn) throw new Error('默认按钮未找到');
  fireEvent.click(btn);
}

/** 组视图明细卡观察列折后价（span[title="折后价"]，顺序 = 产品序） */
const detailPrices = (): string[] =>
  Array.from(document.querySelectorAll('article.lpl-volume-detail span[title="折后价"]'))
    .map((el) => (el.textContent ?? '').trim());

const goGroupView = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /^查看 .+ 所在组的 \d+ 款对比产品$/ }));
};

/** 组视图 + 合并单图（2026-11-06 量价同骨架后，分离面板的页面级明细卡退役——
 *  逐产品折后价读数改从合并单图的明细卡行读取，口径断言意图不变） */
const goGroupMerged = (): void => {
  goGroupView();
  fireEvent.click(screen.getByRole('button', { name: '更多显示选项' }));
  fireEvent.click(screen.getByText('合并单图'));
};

describe('量价页 · 全局平台筛选器（2026-11-05 Eason 指令）', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?p=volume');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用（FiltersProvider 自带 try/catch 兜底） */
    }
  });

  it('筛选条平台 Select 位于产品入口之后、币种之前；默认显示现默认平台（DNS）', () => {
    window.history.replaceState(null, '', '/?p=volume');
    render(<App />);
    const bar = document.querySelector('.lpl-fb');
    expect(bar).not.toBeNull();
    const entry = document.querySelector('button[aria-label="选择产品"]');
    const plat = platformInput();
    expect(entry).not.toBeNull();
    expect(plat).not.toBeNull();
    expect(bar!.contains(entry!)).toBe(true);
    expect(bar!.contains(plat!)).toBe(true);
    // 平台在产品入口之后
    expect((entry!.compareDocumentPosition(plat!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    // 平台在币种（标签 span）之前
    const currency = [...bar!.querySelectorAll('span')].find((el) => el.textContent === '币种');
    expect(currency).not.toBeNull();
    expect((plat!.compareDocumentPosition(currency!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    // 未选时触发器占位呈现解析后的默认平台（RU 默认 = DNS；2026-11-11 占位形态）
    const ph = document.querySelector('.ant-select-selection-placeholder');
    expect(ph?.textContent).toBe('默认 · DNS');
  });

  it('选平台写 state.platform（URL plat= 链接同键）；选回默认删除 plat；每卡选店/店铺同步入口不再存在', async () => {
    window.history.replaceState(null, '', '/?p=volume');
    render(<App />);
    await pickPlatform('OZON');
    await waitFor(() => expect(window.location.search).toContain('plat=OZON'));
    expect(platformShown()).toBe('OZON');
    await pickDefault();
    await waitFor(() => {
      const q = new URLSearchParams(window.location.search);
      expect(q.get('plat')).toBeNull();
    });
    // 每产品不再单独选平台店铺（2026-11-05 指令）：取价平台 chip 与店铺同步钮全无
    expect(document.querySelectorAll('button[aria-label^="取价平台："]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^(同步 .+ 的店铺|取消 .+ 的店铺同步)$/ })).toBeNull();
    expect(document.querySelectorAll('button[aria-pressed]')).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ textContent: expect.stringContaining('同步店铺') })]),
    );
  });

  it('改全局平台 → 底下所有面板重取数：UI 切换口径与 plat= 直达口径逐卡一致，且不同于默认口径', async () => {
    window.history.replaceState(null, '', '/?p=volume');
    render(<App />);
    goGroupMerged();
    const pricesDefault = detailPrices();
    expect(pricesDefault.length).toBeGreaterThan(0);
    await pickPlatform('OZON');
    const pricesUi = await waitFor(() => {
      const next = detailPrices();
      expect(next).not.toEqual(pricesDefault); // 至少逐卡口径变化（平台内每周最低价店铺）
      return next;
    });
    expect(platformShown()).toBe('OZON');
    // 直达链接（plat=OZON）整页口径 = UI 切换后的口径（两页共用同一 state.platform）
    cleanup();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/?p=volume&plat=OZON');
    render(<App />);
    goGroupMerged();
    const pricesUrl = detailPrices();
    expect(pricesUrl).toHaveLength(pricesUi.length);
    expect(pricesUrl).toEqual(pricesUi);
  });

  it('价格走势页不渲染全局平台筛选器（主线收口门控：该页各线自带平台口径，全局 Select 不消费 = 死控件）', () => {
    window.history.replaceState(null, '', '/?p=dashboard');
    render(<App />);
    const bar = document.querySelector('.lpl-fb');
    expect(bar).not.toBeNull();
    expect(bar!.textContent ?? '').not.toContain('平台');
    // 量价走势页仍渲染（对照，防门控误杀）
    cleanup();
    window.history.replaceState(null, '', '/?p=volume');
    render(<App />);
    expect(document.querySelector('.lpl-fb')?.textContent ?? '').toContain('平台');
  });
});
