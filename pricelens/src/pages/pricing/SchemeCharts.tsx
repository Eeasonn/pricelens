// ============================================================
// 定价推演页 · 图表组（独立 ECharts，不复用价格看板 Chart）：
// ①大盘卡：季度容量柱 + 环比幅度柱（右轴）+ 未来 4 季预估中枢虚线与区间带
// ②成本卡：单台成本线 + 环比幅度柱（右轴）+ 未来 12 个月预估中枢与区间带
// ③量价证据图（全宽，量价看板同款语言：价格折线在上 + 周销柱贴绘图区底带 +
//   参照虚线 + 调价锚点；上市后叠上一代同期对照线）
// ④销量趋势预测图：实际线（已销段）+ 预估中枢虚线 + P10–P90 区间带 +
//   上一代同期参照线，随拟定价拖柄即时重画。配色守铁律：单蓝+墨+灰。
// ============================================================
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CSSProperties } from 'react';
import { COMPETITORS, COST_HISTORY, MARKET_HISTORY, type ProductCase } from './mockData';
import type { ForecastPoint, ForecastSeries } from './pricingModel';
import { costMoM, marketQoQ } from './pricingModel';
import { color, font, fontSize } from '../../theme/tokens';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

const AXIS = { fontSize: fontSize.caption, color: color.mute, fontFamily: font.family };
const TOOLTIP = {
  backgroundColor: color.canvas, borderColor: color.hairline,
  textStyle: { color: color.body, fontSize: 12, fontFamily: font.family },
};

/** init 一次 + option 受控 + 容器尺寸自适应 */
function useEChart(build: () => echarts.EChartsCoreOption, deps: unknown[], style: CSSProperties) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);
  useEffect(() => {
    chartRef.current?.setOption(build(), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <div ref={ref} style={style} />;
}

/** 区间带两条 stack 线（low 透明打底 + span 半透明带），从衔接点起画 */
function bandSeries(start: number, points: ForecastPoint[], pad: (number | null)[]) {
  const lowData = [...pad, start, ...points.map((p) => p.low)];
  const spanData = [...pad, 0, ...points.map((p) => Math.round((p.high - p.low) * 10) / 10)];
  return [
    { name: '区间下沿', type: 'line', stack: 'band', data: lowData, lineStyle: { opacity: 0 }, symbol: 'none', silent: true, tooltip: { show: false } },
    { name: '预估区间', type: 'line', stack: 'band', data: spanData, lineStyle: { opacity: 0 }, symbol: 'none', silent: true, areaStyle: { color: 'rgba(0,112,243,.10)' }, tooltip: { show: false } },
  ];
}

/** 预估中枢虚线（从最后一个实际点衔接） */
function midLine(hist: number[], points: ForecastPoint[], pad: (number | null)[]) {
  return [...pad, hist[hist.length - 1], ...points.map((p) => p.mid)];
}

// ---------------- ① 大盘卡 ----------------

export function MarketChart({ forecast }: { forecast: ForecastPoint[] }) {
  const hist = MARKET_HISTORY;
  const categories = [...hist.map((q) => q.label), ...forecast.map((f) => f.label)];
  const histPad: (number | null)[] = hist.map(() => null);
  const qoq = marketQoQ(forecast);
  return useEChart(
    () => ({
      grid: { left: 44, right: 40, top: 30, bottom: 22 },
      legend: {
        top: 0, right: 0, itemWidth: 14, itemHeight: 8, icon: 'roundRect',
        textStyle: { fontSize: fontSize.caption, color: color.body, fontFamily: font.family },
        data: ['季度容量', '预估中枢', '环比幅度'],
      },
      tooltip: {
        ...TOOLTIP, trigger: 'axis',
        formatter: (ps: { axisValue: string; seriesName: string; value: number | null }[]) => {
          const cap = ps.find((p) => p.seriesName === '季度容量');
          const mid = ps.find((p) => p.seriesName === '预估中枢');
          const qoqV = ps.find((p) => p.seriesName === '环比幅度');
          const level = cap?.value ?? mid?.value;
          return `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${ps[0]?.axisValue ?? ''}</div>` +
            (level != null ? `<div>容量 ${level} 万部</div>` : '') +
            (qoqV?.value != null ? `<div>环比 ${qoqV.value > 0 ? '+' : ''}${qoqV.value}%</div>` : '');
        },
      },
      xAxis: { type: 'category', data: categories, axisLabel: { ...AXIS, interval: 2 }, axisTick: { show: false }, axisLine: { lineStyle: { color: color.hairline } } },
      yAxis: [
        { type: 'value', min: 300, axisLabel: AXIS, splitLine: { lineStyle: { color: color.hairline } } },
        { type: 'value', axisLabel: { ...AXIS, formatter: (v: number) => v + '%' }, splitLine: { show: false }, min: -30, max: 30 },
      ],
      series: [
        {
          name: '季度容量', type: 'bar', barWidth: '52%',
          data: hist.map((q) => q.value),
          itemStyle: { color: 'rgba(0,112,243,.45)', borderRadius: [2, 2, 0, 0] },
        },
        {
          name: '预估中枢', type: 'line', data: midLine(hist.map((q) => q.value), forecast, histPad),
          lineStyle: { type: 'dashed', width: 2, color: color.link }, itemStyle: { color: color.link }, symbol: 'circle', symbolSize: 5,
        },
        ...bandSeries(hist[hist.length - 1].value, forecast, histPad),
        {
          name: '环比幅度', type: 'bar', yAxisIndex: 1, barWidth: 2,
          data: qoq, itemStyle: { color: 'rgba(136,136,136,.45)' },
        },
      ],
    }),
    [forecast],
    { width: '100%', height: '100%' },
  );
}

// ---------------- ② 成本卡 ----------------

export function CostChart({ forecast }: { forecast: ForecastPoint[] }) {
  const hist = COST_HISTORY;
  const categories = [...hist.map((m) => m.label), ...forecast.map((f) => f.label)];
  const histPad: (number | null)[] = hist.map(() => null);
  const mom = costMoM(forecast);
  return useEChart(
    () => ({
      grid: { left: 44, right: 40, top: 30, bottom: 22 },
      legend: {
        top: 0, right: 0, itemWidth: 14, itemHeight: 8, icon: 'roundRect',
        textStyle: { fontSize: fontSize.caption, color: color.body, fontFamily: font.family },
        data: ['单台成本', '预估中枢', '环比幅度'],
      },
      tooltip: {
        ...TOOLTIP, trigger: 'axis',
        formatter: (ps: { axisValue: string; seriesName: string; value: number | null }[]) => {
          const cost = ps.find((p) => p.seriesName === '单台成本');
          const mid = ps.find((p) => p.seriesName === '预估中枢');
          const momV = ps.find((p) => p.seriesName === '环比幅度');
          const level = cost?.value ?? mid?.value;
          return `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${ps[0]?.axisValue ?? ''}</div>` +
            (level != null ? `<div>成本 $${level}</div>` : '') +
            (momV?.value != null ? `<div>环比 ${momV.value > 0 ? '+' : ''}${momV.value}%</div>` : '');
        },
      },
      xAxis: { type: 'category', data: categories, axisLabel: { ...AXIS, interval: 5 }, axisTick: { show: false }, axisLine: { lineStyle: { color: color.hairline } } },
      yAxis: [
        { type: 'value', min: 560, max: 760, axisLabel: { ...AXIS, formatter: (v: number) => '$' + v }, splitLine: { lineStyle: { color: color.hairline } } },
        { type: 'value', axisLabel: { ...AXIS, formatter: (v: number) => v + '%' }, splitLine: { show: false }, min: -2, max: 2 },
      ],
      series: [
        {
          name: '单台成本', type: 'line', data: hist.map((m) => m.value), symbol: 'none',
          lineStyle: { width: 2, color: color.ink }, itemStyle: { color: color.ink },
        },
        {
          name: '预估中枢', type: 'line', data: midLine(hist.map((m) => m.value), forecast, histPad),
          lineStyle: { type: 'dashed', width: 2, color: color.link }, itemStyle: { color: color.link }, symbol: 'circle', symbolSize: 5,
        },
        ...bandSeries(hist[hist.length - 1].value, forecast, histPad),
        {
          name: '环比幅度', type: 'bar', yAxisIndex: 1, barWidth: 2,
          data: mom, itemStyle: { color: 'rgba(136,136,136,.45)' },
        },
      ],
    }),
    [forecast],
    { width: '100%', height: '100%' },
  );
}

// ---------------- ③ 量价证据图（全宽 · 量价看板语言） ----------------

/** 价格轴范围：数据最小/最大各留 40，取整到 50 */
function niceRange(values: number[]): { min: number; max: number } {
  return {
    min: Math.floor((Math.min(...values) - 40) / 50) * 50,
    max: Math.ceil((Math.max(...values) + 40) / 50) * 50,
  };
}

/** 销量柱贴底带（量价看板口径：柱区高恒为绘图区 34%）——右轴 max 抬高实现 */
const SO_BAND_FRAC = 0.34;
const niceCeil = (v: number): number => {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * exp) return m * exp;
  return 10 * exp;
};

/** 证据图网格横向留白（事件卡对齐条同款边距，两侧对称） */
export const EVIDENCE_GRID = { left: 56, right: 56 };

export function EvidenceChart({ product, scenario }: { product: ProductCase; scenario: 'pre' | 'post' }) {
  const pre = scenario === 'pre';
  const shown = pre ? product.prev.weeks : product.cur.weeks;
  const soMax = niceCeil(Math.max(...shown.map((w) => w.so)) * 1.02);
  const prices = pre
    ? [...shown.map((w) => w.rrp), ...shown.map((w) => w.asp), ...COMPETITORS.map((c) => c.currentPrice)]
    : [...shown.map((w) => w.asp), ...product.prev.weeks.slice(0, shown.length).map((w) => w.asp)];
  const { min, max } = niceRange(prices);
  const events = pre ? product.prev.events : product.cur.events;
  const compLine = pre
    ? COMPETITORS.map((c) => ({
        yAxis: c.currentPrice,
        lineStyle: { type: 'dashed' as const, color: color.hairlineStrong, width: 1 },
        label: { formatter: c.name + ' 现价 $' + c.currentPrice, position: 'insideEndTop' as const, fontSize: 11, color: color.mute, fontFamily: font.family },
      }))
    : [];
  const anchors = events.map((e) => ({
    xAxis: 'W' + e.week,
    lineStyle: { type: 'dashed' as const, color: color.hairline, width: 1 },
    label: { formatter: e.anchor, position: 'insideEndTop' as const, fontSize: 11, color: color.mute },
  }));

  return useEChart(
    () => ({
      grid: { left: EVIDENCE_GRID.left, right: EVIDENCE_GRID.right, top: 28, bottom: 24 },
      legend: {
        top: 0, right: EVIDENCE_GRID.right, itemWidth: 14, itemHeight: 8, icon: 'roundRect',
        textStyle: { fontSize: fontSize.caption, color: color.body, fontFamily: font.family },
        data: pre ? ['成交价', 'RRP', '周销'] : ['本品成交价', '上一代同期', '周销'],
      },
      tooltip: {
        ...TOOLTIP, trigger: 'axis',
        formatter: (ps: { axisValue: string; seriesName: string; value: number }[]) => {
          const price = ps.find((p) => p.seriesName === '成交价' || p.seriesName === '本品成交价');
          const rrp = ps.find((p) => p.seriesName === 'RRP');
          const prevP = ps.find((p) => p.seriesName === '上一代同期');
          const so = ps.find((p) => p.seriesName === '周销');
          return `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${ps[0]?.axisValue ?? ''}（上市后周龄）</div>` +
            (price ? `<div>${pre ? '上一代' : '本品'}成交价 $${price.value.toLocaleString('en-US')}</div>` : '') +
            (rrp ? `<div>RRP $${rrp.value.toLocaleString('en-US')}</div>` : '') +
            (prevP ? `<div>上一代同期 $${prevP.value.toLocaleString('en-US')}</div>` : '') +
            (so ? `<div>周销 ${so.value.toFixed(1)} 千台</div>` : '');
        },
      },
      xAxis: {
        type: 'category', data: shown.map((w) => 'W' + w.week),
        axisLabel: { ...AXIS, interval: pre ? 6 : 1 }, axisTick: { show: false }, axisLine: { lineStyle: { color: color.hairline } },
      },
      yAxis: [
        { type: 'value', min, max, axisLabel: { ...AXIS, formatter: (v: number) => '$' + v }, splitLine: { lineStyle: { color: color.hairline } } },
        { type: 'value', max: soMax / SO_BAND_FRAC, axisLabel: { show: false }, splitLine: { show: false } },
      ],
      series: [
        {
          name: pre ? '成交价' : '本品成交价', type: 'line', data: shown.map((w) => w.asp),
          smooth: true, symbol: 'circle', symbolSize: 4,
          lineStyle: { width: 2, color: color.link }, itemStyle: { color: color.link }, z: 3,
          markLine: { symbol: 'none', silent: true, animation: false, data: [...compLine, ...anchors] },
        },
        ...(pre
          ? [{
              name: 'RRP', type: 'line', step: 'end', symbol: 'none',
              data: shown.map((w) => w.rrp), lineStyle: { width: 1.5, color: color.ink }, itemStyle: { color: color.ink },
            }]
          : [{
              name: '上一代同期', type: 'line', symbol: 'none', smooth: true,
              data: product.prev.weeks.slice(0, shown.length).map((w) => w.asp),
              lineStyle: { width: 1.5, type: 'dashed', color: color.hairlineStrong }, itemStyle: { color: color.hairlineStrong },
            }]),
        {
          name: '周销', type: 'bar', yAxisIndex: 1, barWidth: '60%',
          data: shown.map((w) => w.so), itemStyle: { color: 'rgba(0,112,243,.14)', borderRadius: [2, 2, 0, 0] }, z: 1,
        },
      ],
    }),
    [product.key, scenario],
    { width: '100%', height: '100%' },
  );
}

// ---------------- ④ 销量趋势预测图 ----------------

export function ForecastChart({ series }: { series: ForecastSeries }) {
  return useEChart(
    () => ({
      grid: { left: 48, right: 48, top: 30, bottom: 24 },
      legend: {
        top: 0, right: 0, itemWidth: 14, itemHeight: 8, icon: 'roundRect',
        textStyle: { fontSize: fontSize.caption, color: color.body, fontFamily: font.family },
        data: ['实际周销', '预估中枢', '上一代同期'],
      },
      tooltip: {
        ...TOOLTIP, trigger: 'axis',
        formatter: (ps: { axisValue: string; seriesName: string; value: number | null; marker: string }[]) => {
          const actual = ps.find((p) => p.seriesName === '实际周销');
          const mid = ps.find((p) => p.seriesName === '预估中枢');
          const prevRef = ps.find((p) => p.seriesName === '上一代同期');
          return `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${ps[0]?.axisValue ?? ''}</div>` +
            (actual?.value != null ? `<div>实际周销 ${actual.value.toFixed(1)} 千台</div>` : '') +
            (mid?.value != null ? `<div>预估中枢 ${mid.value.toFixed(1)} 千台（区间 ±${Math.round((mid.value * 0.12) * 10) / 10}）</div>` : '') +
            (prevRef?.value != null ? `<div>上一代同期 ${prevRef.value.toFixed(1)} 千台</div>` : '');
        },
      },
      xAxis: {
        type: 'category', data: series.weeks,
        axisLabel: { ...AXIS, interval: 6 }, axisTick: { show: false }, axisLine: { lineStyle: { color: color.hairline } },
      },
      yAxis: [{ type: 'value', axisLabel: AXIS, splitLine: { lineStyle: { color: color.hairline } } }],
      series: [
        {
          name: '区间下沿', type: 'line', stack: 'band', data: series.low, lineStyle: { opacity: 0 }, symbol: 'none', silent: true, tooltip: { show: false }, z: 1,
        },
        {
          name: '预估区间', type: 'line', stack: 'band',
          data: series.low.map((v, i) => (v == null || series.high[i] == null ? null : Math.round((series.high[i]! - v) * 10) / 10)),
          lineStyle: { opacity: 0 }, symbol: 'none', silent: true, areaStyle: { color: 'rgba(0,112,243,.10)' }, tooltip: { show: false }, z: 1,
        },
        {
          name: '实际周销', type: 'line', data: series.actual, symbol: 'circle', symbolSize: 4,
          lineStyle: { width: 2, color: color.link }, itemStyle: { color: color.link }, z: 4,
        },
        {
          name: '预估中枢', type: 'line', data: series.center, symbol: 'none',
          lineStyle: { width: 2, type: 'dashed', color: color.link }, itemStyle: { color: color.link }, z: 3,
        },
        {
          name: '上一代同期', type: 'line', data: series.prevRef, symbol: 'none', smooth: true,
          lineStyle: { width: 1.2, color: color.hairlineStrong }, itemStyle: { color: color.hairlineStrong }, z: 2,
        },
      ],
    }),
    [series],
    { width: '100%', height: '100%' },
  );
}
