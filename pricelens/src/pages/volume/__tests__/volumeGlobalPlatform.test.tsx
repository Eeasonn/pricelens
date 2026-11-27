// ============================================================
// 量价页 · 全局平台筛选器（2026-11-05，Eason 指令「两版都生效」）：
// 「删除店铺同步的功能，删除每个产品卡片选店铺的功能。改为在顶部产品后面加一个
// 平台筛选器，它筛选的结果会作用于底下所有的产品。我们不允许每个产品单独选择
// 平台店铺。」
// 覆盖三件事：
// ① FilterBar 平台位置断言：平台级联（2026-11-17 Eason 二轮定版：平台→渠道→卖家
//    三级 ChannelScopeBox，三轮定版：平台名单击只切换（永不展开）、行尾 › 下钻、
//    钉店铺态开面板自动带出第二三层）紧随「选择产品」
//    入口之后、币种之前，默认占位「默认 · DNS」（取价 = 该平台池每周最低价店铺）；
// ② 写路径断言：平台行单击 → state.platform = 平台级单选（URL plat= 链接同键），
//    底部「自动取价 / 未选中」按钮 → platform = null（plat 键删除）；每卡取价平台
//    chip / 店铺同步钮不再出现（volumeStoreSync 旧契约随功能删除）；
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

/** 顶部筛选条的平台级联触发器（ChannelScopeBox 包装 div，data-testid 定位；
 *  2026-11-17「平台、类型、店铺」三级级联替换单 Select） */
const scopeTrigger = (): HTMLElement =>
  document.querySelector('[data-testid="channel-scope-trigger"]') as HTMLElement;
/** 触发器当前显示文本（已选 labels 或占位「默认 · 平台」） */
const scopeShown = (): string => scopeTrigger()?.textContent ?? '';

/** 打开级联浮层（等 .lpl-cascade-popover 可见——antd Popover portal 到 body） */
async function openScope(): Promise<HTMLElement> {
  fireEvent.click(scopeTrigger());
  return await waitFor(() => {
    const all = [...document.querySelectorAll('.lpl-cascade-popover')].filter(
      (n) => !(n as HTMLElement).classList.contains('ant-popover-hidden'),
    );
    if (!all.length) throw new Error('平台级联浮层未展开');
    return all[all.length - 1] as HTMLElement;
  });
}

/** 平台行单击 = 只选平台（不展开下一层；2026-11-17 二轮：选中与展开分离） */
async function pickPlatform(label: string): Promise<void> {
  const panel = await openScope();
  const row = [...panel.querySelectorAll('[role="treeitem"]')]
    .find((n) => n.getAttribute('aria-label') === label);
  if (!row) throw new Error(`平台行未找到：${label}`);
  fireEvent.click(row);
}

/** 底部「自动取价 / 未选中」按钮 = platform null（aria-label 恒定「自动取价」，文本随状态）。
 *  pickPlatform 后浮层仍开着——此处只在浮层已关时重新打开，防二次触发点击把它关掉 */
async function pickDefault(): Promise<void> {
  const panel = await openScopeIfClosed();
  const btn = await waitFor(() => {
    const el = panel.querySelector('button[aria-label="自动取价"]') as HTMLButtonElement | null;
    if (!el) throw new Error('自动取价按钮未找到');
    return el;
  });
  fireEvent.click(btn);
}

/** 浮层已开则复用；已关才点触发器（antd Popover trigger=click 的第二次点击 = 关闭）。
 *  多实例时取最后一个非 hidden（destroyOnHidden 卸载有动画延迟，旧树可能仍在 DOM） */
async function openScopeIfClosed(): Promise<HTMLElement> {
  const visible = [...document.querySelectorAll('.lpl-cascade-popover')].filter(
    (n) => !(n as HTMLElement).classList.contains('ant-popover-hidden'),
  );
  if (visible.length) return visible[visible.length - 1] as HTMLElement;
  return openScope();
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

  it('筛选条平台级联位于产品入口之后、币种之前；默认占位 = 现默认平台（DNS）', () => {
    window.history.replaceState(null, '', '/?p=volume');
    render(<App />);
    const bar = document.querySelector('.lpl-fb');
    expect(bar).not.toBeNull();
    // 2026-11-27：入口更名「产业与产品」（产业并入面板 + 两种分析结构）；位置断言不变
    const entry = document.querySelector('button[aria-label="产业与产品"]');
    const plat = scopeTrigger();
    expect(entry).not.toBeNull();
    expect(plat).not.toBeNull();
    expect(bar!.contains(entry!)).toBe(true);
    expect(bar!.contains(plat!)).toBe(true);
    // 平台在产品入口之后
    expect((entry!.compareDocumentPosition(plat!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    // 平台在币种控件之前（外部文字标题已删，改锚控件自身的可访问名）
    const currency = bar!.querySelector('[aria-label="币种"]');
    expect(currency).not.toBeNull();
    expect((plat!.compareDocumentPosition(currency!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    // 未选时触发器占位呈现解析后的默认平台（RU 默认 = DNS；取价 = 该平台池每周最低价店铺）
    expect(scopeShown()).toBe('默认 · DNS');
  });

  it('平台行单击写 state.platform（URL plat= 链接同键，且不展开下一层）；自动取价删除 plat；每卡选店/店铺同步入口不再存在', async () => {
    window.history.replaceState(null, '', '/?p=volume');
    render(<App />);
    const panel0 = await openScope();
    await pickPlatform('OZON');
    await waitFor(() => expect(window.location.search).toContain('plat=OZON'));
    // 单击只选平台：渠道层不出现（三轮定版——名字点击永不展开，下钻走行尾 ›）
    expect([...panel0.querySelectorAll('[role="group"]')]).toHaveLength(1);
    expect(scopeShown()).toBe('OZON');
    await pickDefault();
    await waitFor(() => {
      const q = new URLSearchParams(window.location.search);
      expect(q.get('plat')).toBeNull();
    });
    // 回自动后按钮文案回「自动取价」；钉店铺时显示「未选中」（按钮文本随状态切换）
    await waitFor(() => {
      const b = [...document.querySelectorAll('button[aria-label="自动取价"]')]
        .filter((n) => !(n.closest('.lpl-cascade-popover') as HTMLElement | null)?.classList.contains('ant-popover-hidden'))
        .pop();
      expect(b?.textContent).toBe('自动取价');
    });
    // 每产品不再单独选平台店铺（2026-11-05 指令）：取价平台 chip 与店铺同步钮全无
    expect(document.querySelectorAll('button[aria-label^="取价平台："]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^(同步 .+ 的店铺|取消 .+ 的店铺同步)$/ })).toBeNull();
    expect(document.querySelectorAll('button[aria-pressed]')).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ textContent: expect.stringContaining('同步店铺') })]),
    );
  });

  it('钉卖家：平台行行尾 › 展开渠道层（第三层随层带出）→ 渠道行切卖家列 → 卖家行提交 = shop+seller 入链、触发器「渠道 · 卖家」', async () => {
    window.history.replaceState(null, '', '/?p=volume');
    render(<App />);
    const panel = await openScope();
    // 平台行单击 = 只选平台（名字点击永不展开）
    fireEvent.click([...panel.querySelectorAll('[role="treeitem"]')].find((n) => n.getAttribute('aria-label') === 'OZON')!);
    await waitFor(() => expect(window.location.search).toContain('plat=OZON'));
    // 行尾 › 按钮 = 打开渠道层（三轮指令：第二层展开必带第三层卖家列）
    const expandBtn = await waitFor(() => {
      const row = [...panel.querySelectorAll('[role="treeitem"]')].find((n) => n.getAttribute('aria-label') === 'OZON');
      const b = row?.querySelector('button[aria-label="展开 OZON 渠道层"]') as HTMLButtonElement | null;
      if (!b) throw new Error('下钻按钮未出现');
      return b;
    });
    fireEvent.click(expandBtn);
    const channelRow = await waitFor(() => {
      const el = [...panel.querySelectorAll('[role="treeitem"]')].find((n) => (n.getAttribute('aria-label') ?? '').startsWith('OZON 3P'));
      if (!el) throw new Error('渠道层未展开');
      return el;
    });
    fireEvent.click(channelRow);
    // 卖家列首行提交
    const sellerRow = await waitFor(() => {
      const col = [...panel.querySelectorAll('[role="group"]')].pop()!;
      const el = col.querySelector('[role="treeitem"]') as HTMLElement | null;
      if (!el) throw new Error('卖家列未展开');
      return el;
    });
    fireEvent.click(sellerRow);
    await waitFor(() => {
      const q = new URLSearchParams(window.location.search);
      expect(q.get('shop')).toBeTruthy();
      expect(q.get('seller')).toBeTruthy();
    });
    // 触发器显示「渠道 · 卖家」（自动取价未生效；底部按钮文案随 pinnedShop 切「未选中」——
    // 浮层提交后即关闭，按钮文本走浏览器人验，这里锚触发器与 URL 双键）
    await waitFor(() => {
      const t = document.querySelector('[data-testid="channel-scope-trigger"]')?.textContent ?? '';
      expect(t).toContain('OZON 3P');
    });
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
    expect(scopeShown()).toBe('OZON');
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
    expect(document.querySelector('[data-testid="channel-scope-trigger"]')).toBeNull();
    // 量价走势页仍渲染（对照，防门控误杀）
    cleanup();
    window.history.replaceState(null, '', '/?p=volume');
    render(<App />);
    expect(document.querySelector('[data-testid="channel-scope-trigger"]')).not.toBeNull();
  });
});
