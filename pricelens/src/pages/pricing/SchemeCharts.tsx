// ============================================================
// 定价推演页 · 两张独立 ECharts（新组件，不复用价格看板 Chart——那套
// DOM 覆盖层体系绑定价格折线语义）：①上一代同期参照（价格双线 + 周销
// 柱右轴 + 竞品现价虚线 + 调价事件锚点）②三方案对比（SO 柱 + 销毛贡献
// 柱）。配色守铁律：单蓝强调 + 墨 + 灰，无多色相。
// ============================================================
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CSSProperties } from 'react';
import { COMPETITORS, PREV_GEN_WEEKS, PRICING_EVENTS } from './mockData';
import type { SchemeResult } from './pricingModel';
import { color, font, fontSize } from '../../theme/tokens';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

const AXIS_LABEL = { fontSize: fontSize.caption, color: color.mute, fontFamily: font.family };

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

export function PrevRefChart() {
  return useEChart(
    () => ({
      grid: { left: 54, right: 50, top: 34, bottom: 24 },
      legend: {
        top: 2, right: 0, itemWidth: 14, itemHeight: 8, icon: 'roundRect',
        textStyle: { fontSize: fontSize.caption, color: color.body, fontFamily: font.family },
        data: ['上一代成交价', '上一代 RRP', '周销（右轴）'],
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: color.canvas, borderColor: color.hairline, textStyle: { color: color.body, fontSize: 12, fontFamily: font.family },
        formatter: (ps: { axisValue: string; seriesName: string; value: number; marker: string }[]) => {
          const w = ps[0]?.axisValue ?? '';
          const row = (name: string, text: string, marker: string): string =>
            `<div style="display:flex;justify-content:space-between;gap:16px"><span>${marker}${name}</span><span style="font-variant-numeric:tabular-nums">${text}</span></div>`;
          const asp = ps.find((p) => p.seriesName === '上一代成交价');
          const rrp = ps.find((p) => p.seriesName === '上一代 RRP');
          const so = ps.find((p) => p.seriesName === '周销（右轴）');
          return (
            `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${w}（上市后周龄）</div>` +
            (asp ? row('成交价', '$' + asp.value.toLocaleString('en-US'), asp.marker) : '') +
            (rrp ? row('RRP', '$' + rrp.value.toLocaleString('en-US'), rrp.marker) : '') +
            (so ? row('周销', so.value.toFixed(1) + ' 千台', so.marker) : '')
          );
        },
      },
      xAxis: {
        type: 'category',
        data: PREV_GEN_WEEKS.map((w) => 'W' + w.week),
        axisLabel: { ...AXIS_LABEL, interval: 6 }, axisTick: { show: false }, axisLine: { lineStyle: { color: color.hairline } },
      },
      yAxis: [
        {
          type: 'value', min: 700, max: 1300, interval: 150,
          axisLabel: { ...AXIS_LABEL, formatter: (v: number) => '$' + v }, splitLine: { lineStyle: { color: color.hairline } },
        },
        { type: 'value', axisLabel: AXIS_LABEL, splitLine: { show: false } },
      ],
      series: [
        {
          name: '上一代成交价', type: 'line', data: PREV_GEN_WEEKS.map((w) => w.asp), smooth: true, symbol: 'none',
          lineStyle: { width: 2, color: color.link }, itemStyle: { color: color.link }, z: 3,
          markLine: {
            symbol: 'none', silent: true, animation: false,
            data: [
              ...COMPETITORS.map((c) => ({
                yAxis: c.currentPrice,
                lineStyle: { type: 'dashed' as const, color: color.hairlineStrong, width: 1 },
                label: { formatter: c.name + ' 现价 $' + c.currentPrice, position: 'insideEndTop' as const, fontSize: 11, color: color.mute, fontFamily: font.family },
              })),
              ...PRICING_EVENTS.map((e) => ({
                xAxis: 'W' + e.week,
                lineStyle: { type: 'dashed' as const, color: color.hairline, width: 1 },
                label: { formatter: e.anchor, position: 'insideEndTop' as const, fontSize: 11, color: color.mute },
              })),
            ],
          },
        },
        {
          name: '上一代 RRP', type: 'line', step: 'end', symbol: 'none',
          data: PREV_GEN_WEEKS.map((w) => w.rrp), lineStyle: { width: 1.5, color: color.ink }, itemStyle: { color: color.ink },
        },
        {
          name: '周销（右轴）', type: 'bar', yAxisIndex: 1, barWidth: '58%',
          data: PREV_GEN_WEEKS.map((w) => w.so),
          itemStyle: { color: 'rgba(0,112,243,.14)', borderRadius: [2, 2, 0, 0] },
        },
      ],
    }),
    [],
    { width: '100%', height: '100%' },
  );
}

export function SchemeCompareChart({ results }: { results: SchemeResult[] }) {
  return useEChart(
    () => ({
      grid: { left: 54, right: 54, top: 40, bottom: 8 },
      legend: {
        top: 2, right: 0, itemWidth: 14, itemHeight: 8, icon: 'roundRect',
        textStyle: { fontSize: fontSize.caption, color: color.body, fontFamily: font.family },
        data: ['首年 SO（万台）', '销毛贡献（亿 $）'],
      },
      tooltip: {
        trigger: 'item', backgroundColor: color.canvas, borderColor: color.hairline,
        textStyle: { color: color.body, fontSize: 12, fontFamily: font.family },
        formatter: (p: { name: string; seriesName: string; value: number }) =>
          `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${p.name}</div>${p.seriesName}：${
            p.seriesName === '首年 SO（万台）' ? p.value.toFixed(1) + ' 万台' : '$' + p.value.toFixed(2) + ' 亿'
          }`,
      },
      xAxis: {
        type: 'category', data: results.map((r) => r.scheme.name.replace('方案 ', '').replace(' · ', ' · ')),
        axisLabel: { ...AXIS_LABEL, fontSize: fontSize.bodySm, color: color.body }, axisTick: { show: false }, axisLine: { lineStyle: { color: color.hairline } },
      },
      yAxis: [
        {
          type: 'value', name: '首年 SO（万台）', nameTextStyle: { ...AXIS_LABEL, padding: [0, 0, 0, 30] },
          axisLabel: AXIS_LABEL, splitLine: { lineStyle: { color: color.hairline } }, min: 0,
        },
        {
          type: 'value', name: '销毛贡献（亿 $）', nameTextStyle: AXIS_LABEL,
          axisLabel: AXIS_LABEL, splitLine: { show: false }, min: 0,
        },
      ],
      series: [
        {
          name: '首年 SO（万台）', type: 'bar', barWidth: 24,
          data: results.map((r) => r.firstYearSoWan),
          itemStyle: { color: color.link, borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: 'top', fontSize: 11, color: color.body, fontFamily: font.family, formatter: (p: { value: number }) => p.value.toFixed(1) },
        },
        {
          name: '销毛贡献（亿 $）', type: 'bar', yAxisIndex: 1, barWidth: 24,
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
