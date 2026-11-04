// ============================================================
// CostBarChart · 销毛呈现二式单测（2026-11-04 Eason）：
// 默认 = 下垂柱（下半区琥珀柱 + 下延画布）；顶部销毛线 = 平滑虚线 + 最高/最低/
// 最新三点标值、画布回收下垂区。jsdom：桩 ResizeObserver + 固定 clientWidth
// （组件宽度来自 clientWidth 测量）。
// ============================================================
// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import CostBarChart, { COST_MARGIN_ZONE_H } from '../CostBarChart';
import type { MarginCostPoint } from '../marginCost';
import type { SeriesPoint } from '../../../dataModel/types';
import type { YScale } from '../../../chart/PriceTrend/helpers';

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

const PLOT_TOP = 20;
const PLOT_HEIGHT = 300;
// 单段线性标尺（价格 $0–1000 → 绘图区全域）：与 yPxOf 的分段映射契约一致
const yScale: YScale = {
  min: 0,
  max: 1000,
  interval: 200,
  intervalUsd: 200,
  cells: 6,
  plotHeight: PLOT_HEIGHT,
  segs: [{ min: 0, max: 1000, pTop: 0, pH: PLOT_HEIGHT }],
  breaks: [],
  sliderScale: 1,
};

function fixtures(n: number, rates: Array<number | null>): { points: SeriesPoint[]; costPoints: Array<MarginCostPoint | null>; volumes: Array<number | null> } {
  const points = Array.from({ length: n }, (_, i) => ({
    bucketId: `w${i}`,
    xLabel: `2026W${30 + i}`,
    date: `2026-07-${20 + i}`,
    price: 700 + (i % 3) * 30,
  })) as unknown as SeriesPoint[];
  const costPoints = rates.map((rate) => ({
    bucketId: `w${rate}`,
    monthId: '202608',
    unitRevenue: 800,
    unitCost: 600,
    unitMargin: 200,
    marginRate: rate ?? 0.2,
    simulated: true,
  })) as MarginCostPoint[];
  const volumes = Array.from({ length: n }, (_, i) => 100 + i * 10);
  return { points, costPoints, volumes };
}

function renderChart(marginLineOn: boolean, rates: Array<number | null> = [0.1, 0.2, 0.15, 0.3, 0.25, 0.28]) {
  const { points, costPoints, volumes } = fixtures(6, rates);
  return render(
    <CostBarChart
      geom={null}
      plotTop={PLOT_TOP}
      plotHeight={PLOT_HEIGHT}
      yScale={yScale}
      points={points}
      costPoints={costPoints}
      volumes={volumes}
      volumeAxisMax={200}
      rateAxisMax={0.4}
      currency="usd"
      seriesColor="#c7000b"
      focusIdx={null}
      marginLineOn={marginLineOn}
      name="测试面板"
    />,
  );
}

describe('CostBarChart · 销毛呈现二式', () => {
  it('默认（下垂柱）：琥珀下垂柱存在，画布高度含下半销毛区', () => {
    const { container } = renderChart(false);
    const svg = container.querySelector('svg');
    expect(Number(svg?.getAttribute('height'))).toBe(PLOT_TOP + PLOT_HEIGHT + COST_MARGIN_ZONE_H);
    const amberBar = Array.from(container.querySelectorAll('rect')).find((r) => (r.getAttribute('fill') || '').includes('245, 166, 35'));
    expect(amberBar).toBeTruthy();
  });

  it('顶部销毛线：平滑虚线 path + 三点标注（最高/最低/最新），画布回收下垂区，下垂柱不再渲染', () => {
    const { container } = renderChart(true);
    const svg = container.querySelector('svg');
    expect(Number(svg?.getAttribute('height'))).toBe(PLOT_TOP + PLOT_HEIGHT);
    const amberBar = Array.from(container.querySelectorAll('rect')).find((r) => (r.getAttribute('fill') || '').includes('245, 166, 35'));
    expect(amberBar).toBeUndefined();
    const line = svg?.querySelector('path[stroke="#f5a623"]');
    expect(line?.getAttribute('stroke-dasharray')).toBe('6 4');
    expect((line?.getAttribute('d') ?? '').includes('C')).toBe(true); // 平滑 = 贝塞尔曲线段
    const markTexts = Array.from(svg!.querySelectorAll('g text'))
      .map((t) => (t.textContent || '').trim())
      .filter((t) => /%$/.test(t));
    expect(markTexts).toEqual(['30%', '10%', '28%']); // 最高 / 最低 / 最新（去重后三点）
  });

  it('线模式含负销毛率：lane 域扩展到数据下界，不越出绘图区', () => {
    const { container } = renderChart(true, [0.2, -0.05, 0.15, 0.3, 0.25, 0.1]);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    const markTexts = Array.from(svg!.querySelectorAll('g text'))
      .map((t) => (t.textContent || '').trim())
      .filter((t) => t.includes('%'));
    expect(markTexts).toContain('-5%');
    const laneOverflow = Array.from(svg!.querySelectorAll('g circle')).some((c) => {
      const y = Number(c.getAttribute('cy'));
      return y < PLOT_TOP || y > PLOT_TOP + PLOT_HEIGHT;
    });
    expect(laneOverflow).toBe(false);
  });

  it('线模式含缺率周（valid 索引 ≠ 点索引）：三点归约不越界，标注正确', () => {
    // 回归（2026-11-04 真机崩溃）：valid 累加器曾误用点索引 i 当数组索引，
    // 缺率周导致 valid[best] 越界 → reading 'rate' of undefined。
    const { container } = renderChart(true, [0.1, null, 0.3, 0.25, 0.1, 0.28]);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    const markTexts = Array.from(svg!.querySelectorAll('g text'))
      .map((t) => (t.textContent || '').trim())
      .filter((t) => /%$/.test(t));
    expect(markTexts).toEqual(['30%', '10%', '28%']); // 最高 i2 / 最低 i0 / 最新 i5
  });
});
