// ============================================================
// 量价页 · 量价同骨架组装测试（2026-11-06 Eason 拍板，替换旧「三针整改」断言）：
// 同骨架 = 每个面板渲染价格走势同款 <Chart>：本面板产品价格线 + 底部销量柱量带
//   （恒开恒柱）+ 名称带图层标注（价格 USD / 销量 台·模拟）+ 区间量尺拖选入参；
// 「销毛成本」开 = 我司面板价格层叠成本细线（cost-line svg + 成本·模拟药丸），
//   关 = 纯价格线 + 销量柱；旧面板内可点击图例行 / 成本柱呈现 / 极差卡随之退役；
// 「时间轴同步」开关移驻首个面板底部时间轨左侧；隐藏收纳区
//   （HiddenVault）与胶囊带对位契约保持原断言，库存 · DOS 补充图已从页面移除。
// 组装模式照 volumeTimeSync.test.tsx（mock echarts + ResizeObserver 定宽）。
// ============================================================
// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const bandRoot = (): HTMLElement => screen.getByRole('group', { name: '产品显示与隐藏' }) as HTMLElement;
const bandHost = (): HTMLElement => bandRoot().parentElement as HTMLElement;
const panelEls = (): HTMLElement[] => Array.from(document.querySelectorAll('.lpl-volume-panel')) as HTMLElement[];
const panelGrid = (): HTMLElement => panelEls()[0]?.parentElement as HTMLElement;
const bandPills = (): HTMLButtonElement[] =>
  Array.from(bandRoot().querySelectorAll('button.lpl-lg-pill')) as HTMLButtonElement[];
const vaultChips = (): HTMLButtonElement[] =>
  Array.from(document.querySelectorAll('button[aria-label^="恢复显示"]')) as HTMLButtonElement[];
/** 两侧 gap 的 jsdom 归一（面板网格用 gap 简写、胶囊带用 columnGap 长属性） */
const gapOf = (el: HTMLElement): string => el.style.columnGap || el.style.gap || '0px';

/** 对位契约：胶囊带行与面板网格同容器宽（同父 trackWidth 内）、同模板、同 gap
 *  （共享轴列退役后面板区无左侧偏移，胶囊带 marginLeft 为空） */
const expectBandAlignedWithPanels = (): void => {
  expect(bandHost().style.marginLeft).toBe('');
  expect(bandRoot().style.gridTemplateColumns).toBe(panelGrid().style.gridTemplateColumns);
  expect(gapOf(bandRoot())).toBe(gapOf(panelGrid()));
  expect(panelEls().length).toBeGreaterThan(0);
  // 逐格数量一致：胶囊组数 = 可见面板数（隐藏产品不占带内格）
  expect(bandPills().length).toBe(panelEls().length);
};

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

const waitPanelsReady = async (): Promise<HTMLElement[]> => {
  await waitFor(() => {
    expect(panelEls().length).toBeGreaterThan(0);
    expect(document.querySelector('[data-testid="pane-label-price"]')).toBeTruthy();
  });
  return panelEls();
};

describe('量价页 · 量价同骨架（2026-11-06）', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?p=volume');
    sessionStorage.clear();
    filtersSeed = null; // 每例回到默认选品；需要双面板的用例自行 seedTwoMains()
  });

  // ---- 胶囊带与面板网格逐格对位（整改1 契约保留） ----

  it('胶囊带行 = 面板网格同模板/同 gap（inline style 逐项相等）', async () => {
    render(<App />);
    await waitPanelsReady();
    expectBandAlignedWithPanels();
  });

  it('隐藏面板后两侧列模板同步收缩、对位契约仍成立；恢复后胶囊回原列位（双面板场景）', async () => {
    seedTwoMains();
    render(<App />);
    await waitPanelsReady();
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

  it('主品视图不渲染「已隐藏（N）」暂存条；收纳区在「销毛成本」按钮之后', async () => {
    render(<App />);
    await waitPanelsReady();
    fireEvent.click(bandPills()[0]);
    expect(screen.queryByText(/已隐藏（1）：/)).toBeNull(); // 暂存条只在组视图
    // 收纳区紧跟销毛成本按钮（同一 priceTypesAfter 簇，DOM 序在其后）
    const marginBtn = screen.getByRole('button', { name: '显示销毛成本' });
    const cluster = marginBtn.parentElement as HTMLElement;
    expect(cluster.contains(vaultChips()[0])).toBe(true);
    const clusterChildren = Array.from(cluster.children);
    expect(clusterChildren.indexOf(marginBtn)).toBeLessThan(clusterChildren.indexOf(vaultChips()[0].closest('[role="group"]') as HTMLElement));
  });

  // ---- 同骨架：面板 = 价格走势同款 Chart（量带恒开恒柱 + 图层标注） ----

  it('每面板渲染价格走势同款 Chart：量带恒开（柱）+ 图层标注（价格 / 销量·模拟）', async () => {
    render(<App />);
    const panels = await waitPanelsReady();
    const layerLegend = screen.getByTestId('volume-layer-legend');
    expect(layerLegend.textContent).toContain('价格');
    expect(layerLegend.textContent).toContain('成本 · 模拟');
    expect(layerLegend.textContent).toContain('销量 · 模拟');
    for (const panel of panels) {
      // 名称带列顶部图层标注：价格层（币种代码）+ 销量层（台 + 模拟徽标）
      const priceLabel = panel.querySelector('[data-testid="pane-label-price"]');
      expect(priceLabel?.textContent).toContain('价格');
      expect(priceLabel?.textContent).toContain('USD');
      const volLabel = panel.querySelector('[data-testid="pane-label-volume"]');
      expect(volLabel?.textContent).toContain('销量');
      expect(volLabel?.textContent).toContain('模拟');
    }
    // 量带恒为柱：面板内 svg rect（柱模式）恒有——本页不提供「量」开关
    const bars = panels.reduce((acc, p) => acc + p.querySelectorAll('svg rect').length, 0);
    expect(bars).toBeGreaterThan(0);
    // 旧面板内可点击图例行（legendOff）已退役
    expect(screen.queryByRole('group', { name: '图例（点击切换元素显隐）' })).toBeNull();
  });

  it('销毛成本开 → 我司面板出成本细线与成本·模拟药丸；关 → 不出', async () => {
    render(<App />);
    await waitPanelsReady();
    // 默认关：无成本细线、无成本药丸
    expect(document.querySelector('[data-testid="cost-line"]')).toBeNull();
    expect(document.querySelector('[data-testid="cost-pill"]')).toBeNull();
    // 开：价格层叠成本细线（品牌色降透明 1.25px path）+ 名称带「成本 · 模拟」药丸
    fireEvent.click(screen.getByRole('button', { name: '显示销毛成本' }));
    await waitFor(() => {
      expect(document.querySelector('[data-testid="cost-line"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="cost-pill"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-testid="cost-pill"]')?.textContent).toContain('模拟');
    // 价格图层标注随成本出现改写为「价格 / 成本」
    expect(document.querySelector('[data-testid="pane-label-price"]')?.textContent).toContain('成本');
    // 关：成本细线整组消失
    fireEvent.click(screen.getByRole('button', { name: '隐藏销毛成本' }));
    await waitFor(() => expect(document.querySelector('[data-testid="cost-line"]')).toBeNull());
    expect(document.querySelector('[data-testid="cost-pill"]')).toBeNull();
  });

  // ---- 时间轴同步开关与首个时间轨同一水平线 ----

  it('时间轴同步开关在首个时间轨左侧，默认开；合并单图态隐藏', async () => {
    render(<App />);
    await waitPanelsReady();
    const btn = screen.getByRole('button', { name: '时间轴同步' }) as HTMLElement;
    const gutter = screen.getByTestId('volume-time-sync-gutter');
    expect(gutter.contains(btn)).toBe(true);
    expect(gutter.style.height).toBe('52px');
    expect(gutter.firstElementChild?.getAttribute('style')).toContain('height: 20px');
    expect(screen.getByRole('button', { name: '显示销毛成本' }).parentElement?.contains(btn)).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    // 合并单图态：开关随共享轴列一并隐藏（合并图自带完整 X 轴）
    fireEvent.click(screen.getByRole('button', { name: /^查看 .+ 所在组的 \d+ 款对比产品$/ }));
    fireEvent.click(screen.getByRole('button', { name: '更多显示选项' }));
    fireEvent.click(screen.getByText('合并单图'));
    expect(screen.queryByRole('button', { name: '时间轴同步' })).toBeNull();
  });

});
