// ============================================================
// MergedCompareChart · 组内对比合并单图（2026-11-04 Eason）测试：
// 单测：面积 path 半透明 fill、价格平滑线含贝塞尔段、null 周不造 0（面积断开、
// 价格跳点连续）、X 轴日历周格式（2026W33）、图例产品清单、hover 列底衬 + 读值
// 浮层、受控观察列（键盘 → onHover）。
// 集成（App 组装，mock echarts + RO 定宽）：⋯ 菜单「呈现」行按模式出内容
// （主品销毛开 = 销毛呈现二式；组内对比 = 面板呈现方式 Segmented；主品销毛关
// 不出槽）、合并态渲染 MergedCompareChart（面板网格/时间轨/同步开关退场、明细
// 卡保留、会话态落盘）、默认分离态与现状一致、合并仅组内对比适用 + 会话恢复。
// ============================================================
// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MergedCompareChart, { type MergedCompareProduct } from '../MergedCompareChart';
import type { SeriesPoint } from '../../../dataModel/types';

// ---------------- 组件单测 ----------------

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
});
afterAll(() => {
  delete (HTMLElement.prototype as { clientWidth?: unknown }).clientWidth;
});

const WEEKS = ['202631', '202632', '202633', '202634', '202635', '202636'];

function pointsOf(prices: Array<number | null>): SeriesPoint[] {
  return prices.map((price, i) => ({
    bucketId: WEEKS[i],
    xLabel: `07-${20 + i}`,
    anchorDate: `2026-07-${20 + i}`,
    rrp: null,
    price,
    missing: price == null,
    offer: null,
    url: '',
    shopName: null,
  })) as unknown as SeriesPoint[];
}

function product(key: string, name: string, brand: string, color: string, points: SeriesPoint[], volumes: Array<number | null>): MergedCompareProduct {
  return { key, name, brand, color, points, volumes };
}

const fmtVol = (v: number): string => v.toLocaleString('en-US');

/** p1 销量在 i2 缺采（面积断开）；p2 销量在 i1 缺采。价格全周有值（跳点连续）。 */
function baseProducts(): MergedCompareProduct[] {
  return [
    product('p1', 'Mate 80', 'HUAWEI', '#c7000b', pointsOf([700, 720, 690, 710, 730, 700]), [120, 130, null, 150, 160, 140]),
    product('p2', 'Galaxy S26', 'SAMSUNG', '#0000cc', pointsOf([800, 810, 790, 800, 820, 810]), [90, null, 100, 110, 120, 105]),
  ];
}

function renderChart(products: MergedCompareProduct[] = baseProducts(), extra: Partial<Parameters<typeof MergedCompareChart>[0]> = {}) {
  return render(
    <MergedCompareChart
      products={products}
      bucketIds={WEEKS}
      granularity="week"
      currency="usd"
      volumeAxisMax={200}
      formatVolume={fmtVol}
      {...extra}
    />,
  );
}

describe('MergedCompareChart · 合并单图', () => {
  afterEach(cleanup);

  it('面积 path 存在且带半透明品牌色 fill（0.18），上缘 1.5px 同色加深细线', () => {
    const { container } = renderChart();
    const area = container.querySelector('path[fill="rgba(199, 0, 11, 0.18)"]');
    expect(area).toBeTruthy();
    const area2 = container.querySelector('path[fill="rgba(0, 0, 204, 0.18)"]');
    expect(area2).toBeTruthy();
    // 面积上缘细线：同色加深（向黑混 25%），1.5px
    const edge = container.querySelector('path[stroke="rgb(149, 0, 8)"]');
    expect(edge).toBeTruthy();
    expect(edge?.getAttribute('stroke-width')).toBe('1.5');
  });

  it('价格平滑折线：品牌色 2.2px，含贝塞尔段（Catmull-Rom → bezier）', () => {
    const { container } = renderChart();
    const line = container.querySelector('path[stroke="#c7000b"][fill="none"]');
    expect(line?.getAttribute('stroke-width')).toBe('2.2');
    expect((line?.getAttribute('d') ?? '').includes('C')).toBe(true);
    const line2 = container.querySelector('path[stroke="#0000cc"][fill="none"]');
    expect((line2?.getAttribute('d') ?? '').includes('C')).toBe(true);
  });

  it('null 周不造 0：销量面积在缺采周断开（连续段各一段），价格线跳点连续', () => {
    const { container } = renderChart();
    // p1 销量 [120,130,null,150,160,140] → 两段；p2 [90,null,100,110,120,105] →
    // 单点段（只画上缘短线）+ 一段面积 → 面积 path 各 2/1 个，缺采处不落 0
    expect(container.querySelectorAll('path[fill="rgba(199, 0, 11, 0.18)"]').length).toBe(2);
    expect(container.querySelectorAll('path[fill="rgba(0, 0, 204, 0.18)"]').length).toBe(1);
    // p2 的单点段 = 加深短线（line），不造面积
    expect(container.querySelector('line[stroke="rgb(0, 0, 153)"]')).toBeTruthy();
    // 价格全周有值 → 每产品一条连续平滑线（跳点连续不断开）
    expect(container.querySelectorAll('path[stroke="#c7000b"][fill="none"]').length).toBe(1);
    // 已隔离周价格不进线：整条线跳过该点仍连续（一条 path、无断口标记）
    const { container: c2 } = renderChart([
      product('q1', 'Mate 80', 'HUAWEI', '#c7000b', (() => {
        const pts = pointsOf([700, 720, 690, 710, 730, 700]);
        (pts[2] as { suspect?: string }).suspect = 'quarantined';
        return pts;
      })(), [120, 130, 140, 150, 160, 140]),
    ]);
    expect(c2.querySelectorAll('path[stroke="#c7000b"][fill="none"]').length).toBe(1);
  });

  it('X 轴日历周格式（2026W33），窗口两端边界刻度加粗、年份独立第二行', () => {
    renderChart();
    // 短格式 = YYYYWxx（shortBucketLabel 口径，与主图一致）；与边界刻度距离 ≤1 的
    // 抽稀刻度让位（axisTickPlan 同口径）——W32/W35 不显示，W33/W34 显示
    expect(screen.getByText('2026W33')).toBeTruthy();
    expect(screen.getByText('2026W34')).toBeTruthy();
    expect(screen.queryByText('2026W35')).toBeNull();
    // 边界刻度（窗口两端，marks）恒显示并加粗
    expect(screen.getByText('2026W31').getAttribute('font-weight')).toBe('600');
    expect(screen.getByText('2026W36').getAttribute('font-weight')).toBe('600');
    // 最左显示刻度恒带年份（axisTickPlan yearText）
    expect(screen.getByText('2026')).toBeTruthy();
  });

  it('图例：组内产品名列表（品牌色点），常驻图例行', () => {
    renderChart();
    const legend = screen.getByRole('group', { name: '图例' });
    expect(legend.textContent).toContain('Mate 80');
    expect(legend.textContent).toContain('Galaxy S26');
  });

  it('hover：canvasSoft2 列底衬 + 列读值浮层（每产品 价格 · 销量，缺采显 —）', () => {
    const { container } = renderChart();
    // plotWidth = 800-56-78 = 666，slot = 111 → clientX 300 落第 2 列（2026W33）
    fireEvent.pointerMove(screen.getByTestId('merged-compare-pointer'), { clientX: 300 });
    // 列底衬（canvasSoft2 = #f5f5f5）
    expect(container.querySelector('rect[fill="#f5f5f5"]')).toBeTruthy();
    // 读值浮层：日期头 + 两产品行（价格 / 销量；p1 销量缺采显 —）
    expect(screen.getByText('$690')).toBeTruthy();
    expect(screen.getByText('$790')).toBeTruthy();
    const tip = screen.getByText('2026W33', { selector: 'div.tnum' });
    expect(tip).toBeTruthy();
    // 移出 → 浮层与底衬退场
    fireEvent.pointerLeave(screen.getByTestId('merged-compare-pointer'));
    expect(container.querySelector('rect[fill="#f5f5f5"]')).toBeNull();
    expect(screen.queryByText('$690')).toBeNull();
  });

  it('受控观察列：focusIdx 直出读值浮层；键盘 ←/→/Home/End 上报 onHover（页面回写后联动）', () => {
    const onHover = vi.fn();
    const base = { products: baseProducts(), bucketIds: WEEKS, granularity: 'week' as const, currency: 'usd' as const, volumeAxisMax: 200, formatVolume: fmtVol, onHover };
    const { rerender } = render(<MergedCompareChart {...base} focusIdx={2} />);
    expect(screen.getByText('$690')).toBeTruthy();
    const group = screen.getByRole('group', { name: /合并量价对比图/ });
    // aria-label 含产品清单
    expect(group.getAttribute('aria-label')).toContain('Mate 80');
    expect(group.getAttribute('aria-label')).toContain('Galaxy S26');
    // 受控链路：上报 onHover → 页面回写 focusIdx（rerender 模拟）→ 读值跟随
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onHover).toHaveBeenLastCalledWith(1);
    rerender(<MergedCompareChart {...base} focusIdx={1} />);
    expect(screen.getByText('$720')).toBeTruthy();
    fireEvent.keyDown(group, { key: 'Home' });
    expect(onHover).toHaveBeenLastCalledWith(0);
    rerender(<MergedCompareChart {...base} focusIdx={0} />);
    expect(screen.getByText('$700')).toBeTruthy();
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onHover).toHaveBeenLastCalledWith(1);
    rerender(<MergedCompareChart {...base} focusIdx={5} />);
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onHover).toHaveBeenLastCalledWith(5); // 末列不再右移
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onHover).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(group, { key: 'End' });
    expect(onHover).toHaveBeenLastCalledWith(5);
  });
});

// ---------------- 量价页集成（App 组装） ----------------

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

const goGroupView = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /^查看 .+ 所在组的 \d+ 款对比产品$/ }));
};
const openMore = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '更多显示选项' }));
};

describe('量价页 · 合并单图接线（⋯ 呈现槽 / 合并渲染 / 分离默认）', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?p=volume');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用（FiltersProvider 自带 try/catch 兜底） */
    }
  });
  afterEach(cleanup);

  it('主品视图（销毛关）：⋯ 菜单不出「呈现」行（合并仅组内对比适用）', () => {
    render(<App />);
    openMore();
    expect(screen.queryByText('呈现')).toBeNull();
    expect(screen.queryByLabelText('面板呈现方式')).toBeNull();
  });

  it('主品视图 + 销毛开：呈现行 = 既有销毛呈现二式（面板呈现方式不出现）', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '显示销毛成本' }));
    openMore();
    expect(screen.getByLabelText('销毛呈现方式')).toBeTruthy();
    expect(screen.queryByLabelText('面板呈现方式')).toBeNull();
  });

  it('组内对比默认分离态与现状一致：面板网格 + 时间轨在，⋯ 槽选中「分离面板」', () => {
    render(<App />);
    goGroupView();
    // 面板网格照旧（每产品一面板），合并图不出现
    expect(document.querySelectorAll('.lpl-volume-panel').length).toBeGreaterThan(1);
    expect(screen.queryByRole('img', { name: /合并量价对比图/ })).toBeNull();
    // 面板级时间轨（PanelTimeTrack）照旧
    expect(screen.getAllByRole('slider', { name: '本图时间起点' }).length).toBeGreaterThan(0);
    // ⋯ 呈现行 = 面板呈现方式 Segmented，默认选中「分离面板」
    openMore();
    expect(screen.getByLabelText('面板呈现方式')).toBeTruthy();
    expect(screen.getByText('分离面板').closest('.ant-segmented-item')?.className).toContain('ant-segmented-item-selected');
    expect(screen.getByText('合并单图').closest('.ant-segmented-item')?.className).not.toContain('ant-segmented-item-selected');
    expect(sessionStorage.getItem('LPL3.view.volume.mergedCompare')).toBeNull();
  });

  it('切到合并单图：渲染合并图（面板/时间轨/同步开关退场，明细卡保留，会话态落盘）', () => {
    render(<App />);
    goGroupView();
    openMore();
    fireEvent.click(screen.getByText('合并单图'));
    // 合并图出现：aria-label 含产品清单
    const svg = screen.getByRole('img', { name: /合并量价对比图/ });
    expect(svg.getAttribute('aria-label')).toBeTruthy();
    // 面板网格退场，明细卡行保留（每产品身份胶囊照旧）
    expect(document.querySelectorAll('.lpl-volume-panel').length).toBe(0);
    expect(document.querySelectorAll('button.lpl-lg-pill').length).toBeGreaterThan(1);
    // 面板级时间轨与「同步」开关退场（合并图自带完整 X 轴）
    expect(screen.queryAllByRole('slider', { name: '本图时间起点' }).length).toBe(0);
    expect(screen.queryByRole('button', { name: '时间轴同步' })).toBeNull();
    // X 轴日历周格式（YYYYWxx）
    expect(screen.getAllByText(/^2026W\d{2}$/).length).toBeGreaterThan(0);
    // 会话态落盘
    expect(sessionStorage.getItem('LPL3.view.volume.mergedCompare')).toBe('true');
  });

  it('合并仅组内对比适用：会话态为 true 时主品视图仍渲染分离面板', () => {
    sessionStorage.setItem('LPL3.view.volume.mergedCompare', 'true');
    render(<App />);
    expect(screen.queryByRole('img', { name: /合并量价对比图/ })).toBeNull();
    expect(document.querySelectorAll('.lpl-volume-panel').length).toBeGreaterThan(0);
    // 组内对比视图恢复合并态（会话恢复，无需再点）
    goGroupView();
    expect(screen.getByRole('img', { name: /合并量价对比图/ })).toBeTruthy();
  });

  it('主品视图：胶囊带行按面板网格对齐，「本组对比」入口随胶囊组（不在工具行右端）', () => {
    render(<App />);
    // 入口渲染在胶囊带（产品显示与隐藏 group）对应格内，不再挂工具行
    const entries = screen.getAllByRole('button', { name: /^查看 .+ 所在组的 \d+ 款对比产品$/ });
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.closest('[aria-label="产品显示与隐藏"]')).toBeTruthy();
      expect(entry.closest('.lpl-toolbar')).toBeNull();
    }
    // 胶囊带行 = 网格模式（与面板网格同列模板/列距），随面板横滚区滚动
    const band = document.querySelector('[aria-label="产品显示与隐藏"]');
    expect(band).toBeTruthy();
    expect((band as HTMLElement).style.display).toBe('grid');
    // 筛选条粒度常驻（币种右侧，2026-11-04 反馈①），默认周
    expect(screen.getByLabelText('时间粒度')).toBeTruthy();
  });

  it('组内对比：组别切换改页签形式（产品组 tablist + aria-selected，不再「第 N 组」按钮）', () => {
    render(<App />);
    goGroupView();
    const tablist = screen.getByRole('tablist', { name: '产品组' });
    expect(tablist).toBeTruthy();
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs.some((t) => t.getAttribute('aria-selected') === 'true')).toBe(true);
    // 页签名 = 该组主品展示名（不再是「第 N 组」编号按钮）
    expect(screen.queryByText('第 1 组')).toBeNull();
  });
});
