// ============================================================
// CostBarChart 大促档期带测试（2026-11-03 量价页接线）：
// ① 传入 promoBands 渲染档期 rect（y/高覆盖绘图区，x/宽按 (idx+frac)×slot）；
// ② 深度色三档 alpha 与价格页同源（promoShared.bandColorOf 定值）；
// ③ DOM 顺序：档期 rect 在 SVG 内最先 = 选区带与柱之下；
// ④ 缺省/空数组不画带；带不拦截指针（pointerEvents none）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import CostBarChart from '../CostBarChart';
import type { StripGeom, YScale } from '../../../chart/PriceTrend/helpers';
import type { PromoBand } from '../../../chart/PriceTrend/chartModel';
import type { SeriesPoint } from '../../../dataModel/types';

afterEach(cleanup);

// jsdom 无 ResizeObserver：observe 时报一次固定宽度，驱动 CostBarChart 完成测量
class ResizeObserverStub {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: Element): void {
    Object.defineProperty(el, 'clientWidth', { value: 480, configurable: true });
    this.cb([{ contentRect: { width: 480 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

const SCALE: YScale = {
  min: 0,
  max: 100,
  interval: 20,
  intervalUsd: 20,
  cells: 5,
  plotHeight: 200,
  segs: [{ min: 0, max: 100, pTop: 0, pH: 200 }],
  breaks: [],
  sliderScale: 1,
};

const PT = (price: number | null): SeriesPoint => ({
  bucketId: '2026W20',
  xLabel: '05-06',
  anchorDate: '2026-05-06',
  rrp: null,
  price,
  missing: price == null,
  offer: null,
  url: '',
  shopName: null,
});

const BAND = (over: Partial<PromoBand>): PromoBand => ({
  key: 'p1',
  name: 'BTS返校季',
  shortName: 'BTS返校季',
  depth: '深',
  startIdx: 0,
  endIdx: 1,
  startFrac: 0,
  endFrac: 1,
  weeks: 2,
  dateText: '08.01–09.30',
  ...over,
});

const MOUNT = (promoBands?: PromoBand[]): ReturnType<typeof render> => {
  const el = render(
    <CostBarChart
      geom={null as StripGeom | null}
      plotTop={14}
      plotHeight={200}
      yScale={SCALE}
      points={[PT(40), PT(60), PT(null), PT(55)]}
      costPoints={[]}
      volumes={[10, 20, null, 30]}
      volumeAxisMax={100}
      rateAxisMax={0}
      currency="usd"
      seriesColor="#c7000b"
      focusIdx={null}
      selectionBand={{ startIndex: 2, endIndex: 3 }}
      promoBands={promoBands}
      onGeom={vi.fn()}
      name="测试产品"
    /> as ReactElement,
  );
  return el;
};

describe('CostBarChart · 大促档期带', () => {
  it('传入 promoBands 渲染档期 rect：几何按 (idx+frac)×slot，覆盖绘图区', () => {
    const { container } = MOUNT([BAND({})]);
    const band = container.querySelector('svg rect[fill^="rgba(235, 87, 87"]');
    expect(band).toBeTruthy();
    // slot = (480-8-78)/4 = 98.5；宽 = (1-0+1-0)×98.5 = 197
    expect(Number(band!.getAttribute('x'))).toBeCloseTo(8, 5);
    expect(Number(band!.getAttribute('width'))).toBeCloseTo(197, 5);
    expect(Number(band!.getAttribute('y'))).toBe(14);
    expect(Number(band!.getAttribute('height'))).toBe(200);
  });

  it('深度色三档 alpha 与价格页 Chart 同源（0.055/0.035/0.018）', () => {
    for (const [depth, alpha] of [['深', '0.055'], ['中', '0.035'], ['浅', '0.018']] as const) {
      const { container, unmount } = render(
        <CostBarChart
          geom={null}
          plotTop={14}
          plotHeight={200}
          yScale={SCALE}
          points={[PT(40)]}
          costPoints={[]}
          volumes={[10]}
          volumeAxisMax={100}
          rateAxisMax={0}
          currency="usd"
          seriesColor="#c7000b"
          focusIdx={null}
          promoBands={[BAND({ key: 'd', depth })]}
          name="测试产品"
        />,
      );
      const band = container.querySelector('svg rect[fill^="rgba(235, 87, 87"]');
      expect(band?.getAttribute('fill')).toBe(`rgba(235, 87, 87, ${alpha})`);
      unmount();
    }
  });

  it('DOM 顺序：档期 rect 是 SVG 第一个元素（选区带与柱之下）', () => {
    const { container } = MOUNT([BAND({})]);
    const svg = container.querySelector('svg')!;
    expect(svg.children[0]!.getAttribute('fill')!.startsWith('rgba(235, 87, 87')).toBe(true);
    // 柱 rect（价格柱半透明墨/品牌色）在其后
    const bars = Array.from(svg.querySelectorAll('rect')).filter((r) => !r.getAttribute('fill')!.startsWith('rgba(235, 87, 87'));
    expect(bars.length).toBeGreaterThan(0);
    expect(svg.children[0]!.compareDocumentPosition(bars[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('不拦截指针（pointerEvents none，面板交互走 PointerShield）', () => {
    const { container } = MOUNT([BAND({})]);
    const band = container.querySelector('svg rect[fill^="rgba(235, 87, 87"]') as SVGRectElement;
    expect(band.style.pointerEvents).toBe('none');
  });

  it('缺省 promoBands / 空数组 → 不画档期 rect', () => {
    for (const bands of [undefined, []]) {
      const { container } = MOUNT(bands);
      expect(container.querySelector('svg rect[fill^="rgba(235, 87, 87"]')).toBeNull();
    }
  });
});
