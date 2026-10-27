// ============================================================
// 定价推演页 · 图表组（独立 ECharts，不复用价格看板 Chart）：
// ①大盘卡：季度容量柱 + 环比幅度柱（右轴）+ 未来 4 季预估中枢虚线与区间带
// ②成本卡：单台成本线 + 环比幅度柱（右轴）+ 未来 12 个月预估中枢与区间带
// ③量价证据图：上市前 = 上一代 52 周（成交价/RRP 阶梯/周销/竞品现价/调价锚点）；
//   上市后 = 本品上市以来 14 周 + 上一代同期对照线
// ④三方案对比：首年 SO 蓝 + 销毛贡献墨双轴柱。配色守铁律：单蓝+墨+灰。
// ============================================================
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CSSProperties } from 'react';
import { COMPETITORS, COST_HISTORY, MARKET_HISTORY, type ProductCase } from './mockData';
import type { ForecastPoint, SchemeResult } from './pricingModel';
import { marketQoQ, costMoM } from './pricingModel';
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
        formatter: (ps: { axisValue: string; seriesName: string; value: number | null; marker: string }[]) => {
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

// ---------------- ③ 量价证据图（随场景切换） ----------------

/** 价格轴范围：数据最小/最大各留 40，取整到 50 */
function niceRange(values: number[]): { min: number; max: number } {
  return {
    min: Math.floor((Math.min(...values) - 40) / 50) * 50,
    max: Math.ceil((Math.max(...values) + 40) / 50) * 50,
  };
}

export function EvidenceChart({ product, scenario }: { product: ProductCase; scenario: 'pre' | 'post' }) {
  if (scenario === 'pre') {
    const weeks = product.prev.weeks;
    const { min, max } = niceRange([...weeks.map((w) => w.rrp), ...weeks.map((w) => w.asp), ...COMPETITORS.map((c) => c.currentPrice)]);
    return useEChart(
      () => ({
        grid: { left: 46, right: 44, top: 30, bottom: 22 },
        legend: {
          top: 0, right: 0, itemWidth: 14, itemHeight: 8, icon: 'roundRect',
          textStyle: { fontSize: fontSize.caption, color: color.body, fontFamily: font.family },
          data: ['上一代成交价', '上一代 RRP', '周销（右轴）'],
        },
        tooltip: {
          ...TOOLTIP, trigger: 'axis',
          formatter: (ps: { axisValue: string; seriesName: string; value: number; marker: string }[]) => {
            const asp = ps.find((p) => p.seriesName === '上一代成交价');
            const rrp = ps.find((p) => p.seriesName === '上一代 RRP');
            const so = ps.find((p) => p.seriesName === '周销（右轴）');
            return `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${ps[0]?.axisValue ?? ''}（上市后周龄）</div>` +
              (asp ? `<div>成交价 $${asp.value.toLocaleString('en-US')}</div>` : '') +
              (rrp ? `<div>RRP $${rrp.value.toLocaleString('en-US')}</div>` : '') +
              (so ? `<div>周销 ${so.value.toFixed(1)} 千台</div>` : '');
          },
        },
        xAxis: { type: 'category', data: weeks.map((w) => 'W' + w.week), axisLabel: { ...AXIS, interval: 6 }, axisTick: { show: false }, axisLine: { lineStyle: { color: color.hairline } } },
        yAxis: [
          { type: 'value', min, max, axisLabel: { ...AXIS, formatter: (v: number) => '$' + v }, splitLine: { lineStyle: { color: color.hairline } } },
          { type: 'value', axisLabel: AXIS, splitLine: { show: false } },
        ],
        series: [
          {
            name: '上一代成交价', type: 'line', data: weeks.map((w) => w.asp), smooth: true, symbol: 'none',
            lineStyle: { width: 2, color: color.link }, itemStyle: { color: color.link }, z: 3,
            markLine: {
              symbol: 'none', silent: true, animation: false,
              data: [
                ...COMPETITORS.map((c) => ({
                  yAxis: c.currentPrice,
                  lineStyle: { type: 'dashed' as const, color: color.hairlineStrong, width: 1 },
                  label: { formatter: c.name + ' 现价 $' + c.currentPrice, position: 'insideEndTop' as const, fontSize: 11, color: color.mute, fontFamily: font.family },
                })),
                ...product.prev.events.map((e) => ({
                  xAxis: 'W' + e.week,
                  lineStyle: { type: 'dashed' as const, color: color.hairline, width: 1 },
                  label: { formatter: e.anchor, position: 'insideEndTop' as const, fontSize: 11, color: color.mute },
                })),
              ],
            },
          },
          {
            name: '上一代 RRP', type: 'line', step: 'end', symbol: 'none',
            data: weeks.map((w) => w.rrp), lineStyle: { width: 1.5, color: color.ink }, itemStyle: { color: color.ink },
          },
          {
            name: '周销（右轴）', type: 'bar', yAxisIndex: 1, barWidth: '58%',
            data: weeks.map((w) => w.so), itemStyle: { color: 'rgba(0,112,243,.14)', borderRadius: [2, 2, 0, 0] },
          },
        ],
      }),
      [product.key],
      { width: '100%', height: '100%' },
    );
  }

  // 上市后：本品上市以来 14 周 + 上一代同期对照
  const cur = product.cur.weeks;
  const { min, max } = niceRange([...cur.map((w) => w.asp), ...product.prev.weeks.slice(0, cur.length).map((w) => w.asp)]);
  return useEChart(
    () => ({
      grid: { left: 46, right: 44, top: 30, bottom: 22 },
      legend: {
        top: 0, right: 0, itemWidth: 14, itemHeight: 8, icon: 'roundRect',
        textStyle: { fontSize: fontSize.caption, color: color.body, fontFamily: font.family },
        data: ['本品成交价', '上一代同期', '周销（右轴）'],
      },
      tooltip: {
        ...TOOLTIP, trigger: 'axis',
        formatter: (ps: { axisValue: string; seriesName: string; value: number }[]) => {
          const curP = ps.find((p) => p.seriesName === '本品成交价');
          const prevP = ps.find((p) => p.seriesName === '上一代同期');
          const so = ps.find((p) => p.seriesName === '周销（右轴）');
          return `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${ps[0]?.axisValue ?? ''}（上市后周龄）</div>` +
            (curP ? `<div>本品 $${curP.value.toLocaleString('en-US')}</div>` : '') +
            (prevP ? `<div>上一代同期 $${prevP.value.toLocaleString('en-US')}</div>` : '') +
            (so ? `<div>周销 ${so.value.toFixed(1)} 千台</div>` : '');
        },
      },
      xAxis: { type: 'category', data: cur.map((w) => 'W' + w.week), axisLabel: { ...AXIS, interval: 1 }, axisTick: { show: false }, axisLine: { lineStyle: { color: color.hairline } } },
      yAxis: [
        { type: 'value', min, max, axisLabel: { ...AXIS, formatter: (v: number) => '$' + v }, splitLine: { lineStyle: { color: color.hairline } } },
        { type: 'value', axisLabel: AXIS, splitLine: { show: false } },
      ],
      series: [
        {
          name: '本品成交价', type: 'line', data: cur.map((w) => w.asp), smooth: true, symbol: 'circle', symbolSize: 4,
          lineStyle: { width: 2, color: color.link }, itemStyle: { color: color.link }, z: 3,
          markLine: {
            symbol: 'none', silent: true, animation: false,
            data: product.cur.events.map((e) => ({
              xAxis: 'W' + e.week,
              lineStyle: { type: 'dashed' as const, color: color.hairline, width: 1 },
              label: { formatter: e.anchor, position: 'insideEndTop' as const, fontSize: 11, color: color.mute },
            })),
          },
        },
        {
          name: '上一代同期', type: 'line', symbol: 'none',
          data: product.prev.weeks.slice(0, cur.length).map((w) => w.asp), smooth: true,
          lineStyle: { width: 1.5, type: 'dashed', color: color.hairlineStrong }, itemStyle: { color: color.hairlineStrong },
        },
        {
          name: '周销（右轴）', type: 'bar', yAxisIndex: 1, barWidth: '50%',
          data: cur.map((w) => w.so), itemStyle: { color: 'rgba(0,112,243,.14)', borderRadius: [2, 2, 0, 0] },
        },
      ],
    }),
    [product.key],
    { width: '100%', height: '100%' },
  );
}

// ---------------- ④ 三方案对比 ----------------

export function SchemeCompareChart({ results }: { results: SchemeResult[] }) {
  return useEChart(
    () => ({
      grid: { left: 50, right: 50, top: 40, bottom: 8 },
      legend: {
        top: 2, right: 0, itemWidth: 14, itemHeight: 8, icon: 'roundRect',
        textStyle: { fontSize: fontSize.caption, color: color.body, fontFamily: font.family },
        data: ['首年 SO（万台）', '销毛贡献（亿 $）'],
      },
      tooltip: {
        ...TOOLTIP, trigger: 'item',
        formatter: (p: { name: string; seriesName: string; value: number }) =>
          `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${p.name}</div>${p.seriesName}：${
            p.seriesName === '首年 SO（万台）' ? p.value.toFixed(1) + ' 万台' : '$' + p.value.toFixed(2) + ' 亿'
          }`,
      },
      xAxis: {
        type: 'category', data: results.map((r) => r.scheme.name.replace('方案 ', '')),
        axisLabel: { ...AXIS, fontSize: fontSize.bodySm, color: color.body }, axisTick: { show: false }, axisLine: { lineStyle: { color: color.hairline } },
      },
      yAxis: [
        {
          type: 'value', name: '首年 SO（万台）', nameTextStyle: { ...AXIS, padding: [0, 0, 0, 26] },
          axisLabel: AXIS, splitLine: { lineStyle: { color: color.hairline } }, min: 0,
        },
        { type: 'value', name: '销毛贡献（亿 $）', nameTextStyle: AXIS, axisLabel: AXIS, splitLine: { show: false }, min: 0 },
      ],
      series: [
        {
          name: '首年 SO（万台）', type: 'bar', barWidth: 22,
          data: results.map((r) => r.firstYearSoWan),
          itemStyle: { color: color.link, borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: 'top', fontSize: 11, color: color.body, fontFamily: font.family, formatter: (p: { value: number }) => p.value.toFixed(1) },
        },
        {
          name: '销毛贡献（亿 $）', type: 'bar', yAxisIndex: 1, barWidth: 22,
          data: results.map((r) => r.marginTotalYi),
          itemStyle: { color: color.ink, borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: 'top', fontSize: 11, color: color.body, fontFamily: font.family, formatter: (p: { value: number }) => '$' + p.value.toFixed(2) },
        },
      ],
    }),
    [results],
    { width: '100%', height: '100%' },
  );
}
