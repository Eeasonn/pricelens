// ============================================================
// 定价推演页四图 tooltip 防裁切（2026-11-03 反馈，与大盘三卡同口径）：
// echarts tooltip 共享常量 TOOLTIP 开 confine —— 浮层钳在图表容器内，
// 贴边 hover 不被裁掉。echarts mock 记录 setOption 的 option 断言透传；
// 不验证图表渲染（渲染逻辑轻、模型层由 pricingModel.test.ts 覆盖）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('echarts/core', () => {
  const optionLog: unknown[] = [];
  return {
    use: vi.fn(),
    init: vi.fn(() => ({
      setOption: vi.fn((option: unknown) => {
        optionLog.push(option);
      }),
      resize: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    })),
    __testOptionLog: optionLog,
  };
});
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, LegendComponent: {}, MarkLineComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

// jsdom 无 ResizeObserver（useEChart 装载时用到）
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import * as echartsCore from 'echarts/core';
import { CostChart, EvidenceChart, ForecastChart, MarketChart } from '../SchemeCharts';
import { PRODUCTS } from '../mockData';
import type { ForecastPoint, ForecastSeries } from '../pricingModel';

const testOptionLog = (): unknown[] =>
  (echartsCore as unknown as { __testOptionLog: unknown[] }).__testOptionLog;

const tooltipOptions = (): { tooltip: { confine?: boolean } }[] =>
  testOptionLog().filter(
    (o): o is { tooltip: { confine?: boolean } } =>
      o != null && typeof o === 'object' && typeof (o as { tooltip?: unknown }).tooltip === 'object',
  );

const forecast: ForecastPoint[] = [{ label: '26Q4', mid: 500, low: 460, high: 540 }];
const series: ForecastSeries = {
  weeks: ['W1', 'W2', 'W3', 'W4'],
  actual: [1.2, 1.4, null, null],
  center: [1.2, 1.4, 1.5, 1.6],
  low: [1.2, 1.4, 1.3, 1.4],
  high: [1.2, 1.4, 1.7, 1.8],
  prevRef: [1.1, 1.2, 1.3, 1.4],
};

afterEach(cleanup);

describe('定价推演四图 tooltip confine', () => {
  it('大盘 / 成本 / 量价证据 / 销量预测四图 tooltip 全部开 confine（每图恰好一份）', () => {
    testOptionLog().length = 0;
    render(
      <>
        <MarketChart forecast={forecast} />
        <CostChart forecast={forecast} />
        <EvidenceChart product={PRODUCTS[0]} scenario="pre" />
        <ForecastChart series={series} />
      </>,
    );
    const opts = tooltipOptions();
    expect(opts).toHaveLength(4);
    for (const o of opts) expect(o.tooltip.confine).toBe(true);
  });
});
