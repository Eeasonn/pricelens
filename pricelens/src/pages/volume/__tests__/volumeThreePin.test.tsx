// ============================================================
// 量价页 · 2026-11-05 三针整改组装测试（Eason 看图反馈）：
// 整改1 胶囊带逐格居中对齐 + HiddenVault 收纳区——胶囊带列模板/gap/轴列偏移
//   与面板网格逐项相等（inline style 契约，single-source panelGridCols）；隐藏
//   产品从胶囊带移入「销毛成本」右侧收纳区，点击恢复回原列位；主品视图无暂存条；
// 整改2 主图图例可点击显隐——经典/销毛成本两模式图例项 aria-pressed 翻转、
//   对应元素整组消失（经典销量柱 / 成本柱销毛率下垂柱）、会话态跨挂载保留；
// 整改3 时间轴同步按钮与轨道带结构化对中——开关承载盒 = 轨道带同几何常量
//   （TRACK_BLOCK_H/TRACK_RAIL_H），按钮中心 = 轨道带中心；库存 · DOS 卡 X 标签
//   = shortBucketLabel 日历周格式（2026Wxx，不再是周三 MM-DD）。
// 组装模式照 volumeTimeSync.test.tsx（mock echarts + ResizeObserver 定宽）。
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
import { TRACK_BLOCK_H, TRACK_RAIL_H } from '../PanelTimeTrack';
import { splitAxisWidth } from '../../../chart/PriceTrend/helpers';
import { space } from '../../../theme/tokens';

afterEach(cleanup);

// 本环境无 localStorage（FiltersProvider 自带守卫走默认态）：挂一个可注种的
// 最小桩——filtersSeed 非空时 LPL3.filters 读到该载荷，其余键回 null。
let filtersSeed: string | null = null;
beforeAll(() => {
  (globalThis as unknown as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k === 'LPL3.filters' ? filtersSeed : null),
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
});
afterAll(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

const viewStateRaw = (key: string): string | null => {
  try {
    return sessionStorage.getItem(`LPL3.view.${key}`);
  } catch {
    return null;
  }
};

// 主品视图默认币种 = usd、Y 刻度线开、档位带开 → 轴列宽 = splitAxisWidth('usd', true, true)
const expectedLead = `${splitAxisWidth('usd', true, true) + space.md}px`;

/** 注入两张主品卡（RU/phone 各有数据的双面板场景），撑起多列对位断言 */
const seedTwoMains = (): void => {
  filtersSeed = JSON.stringify({
    v: 12,
    mains: [
      { id: 'card-a', main: { modelId: 'own-huawei-mate-80-pro', romram: '16+512 GB', skuIds: [] }, compares: [], auto: false },
      { id: 'card-b', main: { modelId: 'own-huawei-nova-14', romram: '12+256 GB', skuIds: [] }, compares: [], auto: false },
    ],
    platform: null,
    priceTypes: { discounted: true, rrp: false },
    agg: 'avg',
    alertSubs: [],
    adaptive: true,
    rangeStart: '202619',
    rangeEnd: '202642',
    granularity: 'week',
    currency: 'usd',
  });
};

const bandRoot = (): HTMLElement => screen.getByRole('group', { name: '产品显示与隐藏' }) as HTMLElement;
const bandHost = (): HTMLElement => bandRoot().parentElement as HTMLElement;
const panelEls = (): HTMLElement[] => Array.from(document.querySelectorAll('.lpl-volume-panel')) as HTMLElement[];
const panelGrid = (): HTMLElement => panelEls()[0]?.parentElement as HTMLElement;
const bandPills = (): HTMLButtonElement[] =>
  Array.from(bandRoot().querySelectorAll('button.lpl-lg-pill')) as HTMLButtonElement[];
const vaultChips = (): HTMLButtonElement[] =>
  Array.from(document.querySelectorAll('button[aria-label^="恢复显示"]')) as HTMLButtonElement[];
const legendGroupFirst = (): HTMLElement =>
  (screen.getAllByRole('group', { name: '图例（点击切换元素显隐）' })[0] as HTMLElement);
/** 两侧 gap 的 jsdom 归一（面板网格用 gap 简写、胶囊带用 columnGap 长属性） */
const gapOf = (el: HTMLElement): string => el.style.columnGap || el.style.gap || '0px';

/** 对位契约：胶囊带行与面板网格同容器宽（同父 trackWidth 内）、同模板、同 gap、同轴列偏移 */
const expectBandAlignedWithPanels = (): void => {
  expect(bandHost().style.marginLeft).toBe(expectedLead);
  expect(bandRoot().style.gridTemplateColumns).toBe(panelGrid().style.gridTemplateColumns);
  expect(gapOf(bandRoot())).toBe(gapOf(panelGrid()));
  expect(panelEls().length).toBeGreaterThan(0);
  // 逐格数量一致：胶囊组数 = 可见面板数（隐藏产品不占带内格）
  expect(bandPills().length).toBe(panelEls().length);
};

describe('量价页 · 三针整改（2026-11-05）', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?p=volume');
    sessionStorage.clear();
    filtersSeed = null; // 每例回到默认选品；需要双面板的用例自行 seedTwoMains()
  });

  // ---- 整改1①：胶囊带与面板网格逐格严格居中对齐（结构化对位契约） ----

  it('整改1：胶囊带行 = 面板网格同模板/同 gap/同轴列偏移（inline style 逐项相等）', () => {
    render(<App />);
    expectBandAlignedWithPanels();
  });

  it('整改1：隐藏面板后两侧列模板同步收缩、对位契约仍成立；恢复后胶囊回原列位（双面板场景）', () => {
    seedTwoMains();
    render(<App />);
    expect(panelEls().length).toBe(2);
    expectBandAlignedWithPanels();
    const before = panelGrid().style.gridTemplateColumns;
    fireEvent.click(bandPills()[0]);
    // 隐藏后面板少一张、两侧列数同步变少（不再是 band=2 列 vs 面板=1 列的漂移）
    expect(panelEls().length).toBe(1);
    expect(panelGrid().style.gridTemplateColumns).not.toBe(before);
    expectBandAlignedWithPanels();
    // 收纳区出现对应芯片（工具行「销毛成本」右侧），点击恢复
    const chip = vaultChips()[0];
    expect(chip).toBeTruthy();
    expect(screen.queryByText(/已隐藏（1）：/)).toBeNull(); // 主品视图无暂存条
    fireEvent.click(chip);
    expect(panelGrid().style.gridTemplateColumns).toBe(before); // 原列位（同模板）
    expectBandAlignedWithPanels();
    expect(vaultChips().length).toBe(0);
  });

  it('整改1：主品视图不再渲染「已隐藏（N）」暂存条；收纳区在「销毛成本」按钮之后', () => {
    render(<App />);
    fireEvent.click(bandPills()[0]);
    expect(screen.queryByText(/已隐藏（1）：/)).toBeNull(); // 暂存条只在组视图
    // 收纳区紧跟销毛成本按钮（同一 priceTypesAfter 簇，DOM 序在其后）
    const marginBtn = screen.getByRole('button', { name: '显示销毛成本' });
    const cluster = marginBtn.parentElement as HTMLElement;
    expect(cluster.contains(vaultChips()[0])).toBe(true);
    const clusterChildren = Array.from(cluster.children);
    expect(clusterChildren.indexOf(marginBtn)).toBeLessThan(clusterChildren.indexOf(vaultChips()[0].closest('[role="group"]') as HTMLElement));
  });

  // ---- 整改2：主图图例可点击显隐（经典 + 销毛成本，会话态保留） ----

  it('整改2（经典）：销量图例点击 → 对应销量柱整组消失、aria-pressed 翻转、会话态落盘', () => {
    render(<App />);
    const barsCount = (): number =>
      panelEls().reduce((acc, panel) => acc + panel.querySelectorAll('svg rect').length, 0);
    expect(barsCount()).toBeGreaterThan(0);
    const volBtn = Array.from(legendGroupFirst().querySelectorAll('button')).find((b) => b.textContent === '销量');
    expect(volBtn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(volBtn!);
    expect(volBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(barsCount()).toBe(0); // VolumeBars values=[] → 销量柱整组消失
    expect(viewStateRaw('volume.legendOff')).toContain('"volume":true');
  });

  it('整改2（经典）：图例显隐跨挂载保留（会话态恢复）', () => {
    render(<App />);
    const volBtn = Array.from(legendGroupFirst().querySelectorAll('button')).find((b) => b.textContent === '销量');
    fireEvent.click(volBtn!);
    cleanup();
    render(<App />);
    const volBtn2 = Array.from(legendGroupFirst().querySelectorAll('button')).find((b) => b.textContent === '销量');
    expect(volBtn2?.getAttribute('aria-pressed')).toBe('false');
  });

  it('整改2（销毛成本）：四项图例逐一切换；销毛率关 → 琥珀下垂柱整组消失', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '显示销毛成本' }));
    const legend = legendGroupFirst();
    const labels = Array.from(legend.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual(['折后价', '成本', '销量', '销毛率（下垂）']);
    const marginBtn = Array.from(legend.querySelectorAll('button')).find((b) => b.textContent?.startsWith('销毛率'));
    const amberRects = (): number =>
      panelEls().reduce((acc, panel) => acc + Array.from(panel.querySelectorAll('svg rect')).filter((r) => (r.getAttribute('fill') || '').includes('245, 166, 35')).length, 0);
    expect(amberRects()).toBeGreaterThan(0);
    fireEvent.click(marginBtn!);
    expect(marginBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(amberRects()).toBe(0);
    expect(viewStateRaw('volume.legendOff')).toContain('"cbMargin":true');
  });

  it('整改2（销毛成本）：成本图例关 → 成本灰线整组消失，价格柱不受影响', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '显示销毛成本' }));
    const costBtn = Array.from(legendGroupFirst().querySelectorAll('button')).find((b) => b.textContent === '成本');
    fireEvent.click(costBtn!);
    const costLines = panelEls().flatMap((panel) => Array.from(panel.querySelectorAll('svg line')) as SVGLineElement[])
      .filter((l) => l.getAttribute('stroke') === '#737373' && l.getAttribute('stroke-width') === '2');
    expect(costLines.length).toBe(0);
    // 主品阅读视图系列色 = 中性墨（171717）：柱面 fill = rgba(23, 23, 23, 0.15)
    const priceBars = panelEls().flatMap((panel) => Array.from(panel.querySelectorAll('svg rect')) as SVGRectElement[])
      .filter((r) => (r.getAttribute('fill') || '').includes('23, 23, 23, 0.15'));
    expect(priceBars.length).toBeGreaterThan(0);
  });

  // ---- 整改3：时间轴同步按钮与轨道带结构化对中 + X 轴格式审计 ----

  it('整改3：同步按钮承载盒 = 轨道带同几何（同块高/同 marginBottom/承载盒 = rail 高），按钮中心 = 轨道带中心', () => {
    render(<App />);
    const btn = screen.getByRole('button', { name: '时间轴同步' }) as HTMLElement;
    const overlay = btn.parentElement as HTMLElement; // 承载盒：top 0 / 高 TRACK_RAIL_H，flex 居中
    const box = overlay.parentElement as HTMLElement; // 轨道块：高 TRACK_BLOCK_H + marginBottom 6
    expect(overlay.style.top).toBe('0px');
    expect(overlay.style.height).toBe(`${TRACK_RAIL_H}px`);
    expect(overlay.style.display).toBe('flex');
    expect(box.style.height).toBe(`${TRACK_BLOCK_H}px`);
    expect(box.style.marginBottom).toBe('6px');
    // 面板侧时间轨同几何：块高 TRACK_BLOCK_H、marginBottom 6、rail = top 0 / TRACK_RAIL_H
    const panel = panelEls()[0];
    const trackWrap = Array.from(panel.children).find(
      (el) => (el as HTMLElement).style.margin === '12px 78px 6px 8px',
    ) as HTMLElement;
    expect(trackWrap).toBeTruthy();
    expect(trackWrap.style.marginBottom).toBe(box.style.marginBottom); // 两侧块底对齐
    const trackBlock = trackWrap.firstElementChild?.firstElementChild as HTMLElement;
    expect(trackBlock.style.height).toBe(`${TRACK_BLOCK_H}px`);
    const rail = trackBlock.firstElementChild as HTMLElement;
    expect(rail.style.top).toBe('0px');
    expect(rail.style.height).toBe(`${TRACK_RAIL_H}px`);
    // 中心对中（结构化）：承载盒中心 = rail 中心 = 10px（块内），不依赖按钮高度
    expect(overlay.style.height).toBe(rail.style.height);
    expect(overlay.style.top).toBe(rail.style.top);
  });

  it('整改3：库存 · DOS 卡 X 标签 = shortBucketLabel 日历周格式（2026Wxx，不再周三 MM-DD）', () => {
    render(<App />);
    expect(screen.getByText('库存 · DOS')).toBeTruthy();
    const svg = document.querySelector('svg[aria-label*="库存与 DOS"]') as SVGSVGElement;
    expect(svg).toBeTruthy();
    const svgTexts = Array.from(svg.querySelectorAll('text')).map((t) => (t.textContent || '').trim());
    const weekLabels = svgTexts.filter((t) => /^2026W\d{2}$/.test(t));
    expect(weekLabels.length).toBeGreaterThan(0);
    // 周粒度不再出现周三日期（MM-DD）格式的轴标签
    expect(svgTexts.some((t) => /^\d{2}-\d{2}$/.test(t))).toBe(false);
  });

  it('整改3：成本柱呈现补 X 轴日历标签（2026Wxx 出现在成本柱 svg）', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '显示销毛成本' }));
    const weekLabels = panelEls().flatMap((panel) => Array.from(panel.querySelectorAll('svg[role="img"] text')) as SVGTextElement[])
      .map((t) => (t.textContent || '').trim())
      .filter((t) => /^2026W\d{2}$/.test(t));
    expect(weekLabels.length).toBeGreaterThan(0);
  });
});
