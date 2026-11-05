// ============================================================
// CostBarChart · 销毛呈现二式单测（2026-11-04 Eason；2026-11-05 三针整改扩充）：
// 默认 = 下垂柱（下半区琥珀柱 + 下延画布）；顶部销毛线 = 平滑虚线 + 最高/最低/
// 最新三点标值、画布回收下垂区（+ X 轴标签带）。jsdom：桩 ResizeObserver +
// 固定 clientWidth（组件宽度来自 clientWidth 测量）。
// 2026-11-05 整改2/3 契约：图例显隐门控（hidePrice/hideCost/hideVolume/hideMargin
// 对应元素整组不渲染，轴不重算）；X 轴日历标签行（axisTickPlan 口径：周 2026W33、
// 月 MM+年份第二行、季 Qn+年份第二行；下垂柱模式画销毛区下方、线模式画基线下）。
// ============================================================
// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import CostBarChart, { COST_AXIS_ZONE_H, COST_MARGIN_ZONE_H, COST_RATE_H } from '../CostBarChart';
import type { MarginCostPoint } from '../marginCost';
import type { Granularity, SeriesPoint } from '../../../dataModel/types';
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

function fixtures(n: number, rates: Array<number | null>, granularity: Granularity): { points: SeriesPoint[]; costPoints: Array<MarginCostPoint | null>; volumes: Array<number | null> } {
  // 桶 id 用真实口径的 6/7 位格式：周 = YYYYWW（202630…）、月 = YYYYMM、季 = YYYYQn
  const ids: string[] = granularity === 'week'
    ? Array.from({ length: n }, (_, i) => `2026${30 + i}`)
    : granularity === 'month'
      ? ['202608', '202609', '202610', '202611', '202612', '202701']
      : ['2026Q3', '2026Q4', '2027Q1', '2027Q2', '2027Q3', '2027Q4'];
  const points = Array.from({ length: n }, (_, i) => ({
    bucketId: ids[i],
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

function renderChart(
  marginLineOn: boolean,
  rates: Array<number | null> = [0.1, 0.2, 0.15, 0.3, 0.25, 0.28],
  opts: { granularity?: Granularity; hidePrice?: boolean; hideCost?: boolean; hideVolume?: boolean; hideMargin?: boolean } = {},
) {
  const granularity = opts.granularity ?? 'week';
  const { points, costPoints, volumes } = fixtures(6, rates, granularity);
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
      marginLineOn={marginLineOn}
      granularity={granularity}
      hidePrice={opts.hidePrice}
      hideCost={opts.hideCost}
      hideVolume={opts.hideVolume}
      hideMargin={opts.hideMargin}
      currency="usd"
      seriesColor="#c7000b"
      focusIdx={null}
      name="测试面板"
    />,
  );
}

const textsOf = (svg: SVGSVGElement): string[] =>
  Array.from(svg.querySelectorAll('text')).map((t) => (t.textContent || '').trim());

describe('CostBarChart · 销毛呈现二式', () => {
  it('默认（下垂柱）：琥珀下垂柱存在，画布高度含下半销毛区 + X 轴标签带', () => {
    const { container } = renderChart(false);
    const svg = container.querySelector('svg');
    expect(Number(svg?.getAttribute('height'))).toBe(PLOT_TOP + PLOT_HEIGHT + COST_MARGIN_ZONE_H + COST_AXIS_ZONE_H);
    const amberBar = Array.from(container.querySelectorAll('rect')).find((r) => (r.getAttribute('fill') || '').includes('245, 166, 35'));
    expect(amberBar).toBeTruthy();
  });

  it('顶部销毛线：平滑虚线 path + 三点标注（最高/最低/最新），画布回收下垂区（保留 X 轴标签带），下垂柱不再渲染', () => {
    const { container } = renderChart(true);
    const svg = container.querySelector('svg');
    expect(Number(svg?.getAttribute('height'))).toBe(PLOT_TOP + PLOT_HEIGHT + COST_AXIS_ZONE_H);
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

  // ---- 2026-11-05 整改3：X 轴日历标签（axisTickPlan / shortBucketLabel 口径） ----

  it('周粒度 X 标签 = 2026W33 日历周格式（两端恒显示、抽稀口径与主图一致）', () => {
    const { container } = renderChart(false);
    const svg = container.querySelector('svg')!;
    const texts = textsOf(svg);
    expect(texts).toContain('2026W30');
    expect(texts).toContain('2026W33');
    expect(texts).toContain('2026W35');
    // 周标签不出现年第二行（YYYYWxx 自带年份）；抽稀 = axisTickPlan（step 1 +
    // 两端 marks ±1 避让 → 0/2/3/5 共 4 个显示刻度，与主图同一份计划）
    const weekLabels = texts.filter((t) => /^2026W\d{2}$/.test(t));
    expect(weekLabels.length).toBe(4);
    expect(weekLabels).toEqual(['2026W30', '2026W32', '2026W33', '2026W35']);
    // 下垂柱模式：标签画在销毛区下方（baseline + COST_MARGIN_ZONE_H + 14），不与柱下 % 标签同带
    const firstLabel = Array.from(svg.querySelectorAll('text')).find((t) => (t.textContent || '').trim() === '2026W30');
    expect(Number(firstLabel?.getAttribute('y'))).toBe(PLOT_TOP + PLOT_HEIGHT + COST_MARGIN_ZONE_H + 14);
  });

  it('顶部销毛线模式：X 标签画在基线下（与合并单图同几何），格式不变', () => {
    const { container } = renderChart(true);
    const svg = container.querySelector('svg')!;
    const firstLabel = Array.from(svg.querySelectorAll('text')).find((t) => (t.textContent || '').trim() === '2026W30');
    expect(Number(firstLabel?.getAttribute('y'))).toBe(PLOT_TOP + PLOT_HEIGHT + 15);
  });

  it('月粒度 X 标签 = MM + 年份第二行（最左恒带年、换年刻度带年）', () => {
    const { container } = renderChart(false, undefined, { granularity: 'month' });
    const svg = container.querySelector('svg')!;
    const texts = textsOf(svg);
    expect(texts).toContain('08');
    expect(texts).toContain('2026'); // 最左显示刻度恒带年份
    expect(texts).toContain('01');
    expect(texts).toContain('2027'); // 202612 → 202701 换年刻度带年份
  });

  it('季粒度 X 标签 = Qn + 年份第二行', () => {
    const { container } = renderChart(false, undefined, { granularity: 'quarter' });
    const svg = container.querySelector('svg')!;
    const texts = textsOf(svg);
    expect(texts).toContain('Q3');
    expect(texts).toContain('2027');
  });

  // ---- 2026-11-05 整改2：图例显隐门控（对应元素整组不渲染） ----

  it('hidePrice：价格柱/价格帽/价格标值整组消失，销量与销毛率不受影响', () => {
    const { container } = renderChart(false, undefined, { hidePrice: true });
    const svg = container.querySelector('svg')!;
    const priceBars = Array.from(svg.querySelectorAll('rect')).filter((r) => (r.getAttribute('fill') || '').includes('199, 0, 11'));
    expect(priceBars.length).toBe(0);
    expect(textsOf(svg)).not.toContain('$700');
    const amberBar = Array.from(svg.querySelectorAll('rect')).find((r) => (r.getAttribute('fill') || '').includes('245, 166, 35'));
    expect(amberBar).toBeTruthy(); // 销毛率下垂柱仍在
    expect(svg.querySelector('polyline')).toBeTruthy(); // 销量线仍在
  });

  it('hideCost：成本灰线整组消失，价格柱仍在', () => {
    const { container } = renderChart(false, undefined, { hideCost: true });
    const svg = container.querySelector('svg')!;
    const costLines = Array.from(svg.querySelectorAll('line')).filter((l) => l.getAttribute('stroke') === '#737373' && l.getAttribute('stroke-width') === '2');
    expect(costLines.length).toBe(0);
    const priceBars = Array.from(svg.querySelectorAll('rect')).filter((r) => (r.getAttribute('fill') || '').includes('199, 0, 11'));
    expect(priceBars.length).toBe(6);
  });

  it('hideVolume：销量细线与点整组消失（右轴保留）', () => {
    const { container } = renderChart(false, undefined, { hideVolume: true });
    const svg = container.querySelector('svg')!;
    expect(svg.querySelector('polyline')).toBeNull();
    const volDots = Array.from(svg.querySelectorAll('circle')).filter((c) => c.getAttribute('stroke') === '#0070f3');
    expect(volDots.length).toBe(0);
    expect(svg.querySelector('line[stroke="#ebebeb"]')).toBeTruthy(); // 右销量轴仍在
  });

  it('hideMargin（下垂柱模式）：琥珀下垂柱与 % 标签整组消失', () => {
    const { container } = renderChart(false, undefined, { hideMargin: true });
    const svg = container.querySelector('svg')!;
    const amberBar = Array.from(svg.querySelectorAll('rect')).find((r) => (r.getAttribute('fill') || '').includes('245, 166, 35'));
    expect(amberBar).toBeUndefined();
    expect(textsOf(svg).some((t) => /%$/.test(t))).toBe(false);
  });

  it('hideMargin（顶部销毛线模式）：平滑虚线与三点标注整组消失', () => {
    const { container } = renderChart(true, undefined, { hideMargin: true });
    const svg = container.querySelector('svg')!;
    expect(svg.querySelector('path[stroke="#f5a623"]')).toBeNull();
    expect(textsOf(svg).some((t) => /%$/.test(t))).toBe(false);
  });

  it('下垂区几何常量契约：COST_MARGIN_ZONE_H = COST_RATE_H + 18（页面轴列 belowTicks 同源）', () => {
    expect(COST_MARGIN_ZONE_H).toBe(COST_RATE_H + 18);
  });
});
