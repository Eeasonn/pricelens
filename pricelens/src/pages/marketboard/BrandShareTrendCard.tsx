// ============================================================
// 大盘图表② · 品牌份额趋势（GFK IMG_9368 复刻）
// 双带布局（与图①的容量条带同手法）：上方条带为大盘销量线（蓝，万台）
// 与大盘均价线（琥珀墨，美元），均逐点标值；下方为月度 100% 堆叠柱
// （≥12% 标注）。两带共享月份轴，hover 十字联动。
// ============================================================
import { color } from '../../theme/tokens';
import { OTHERS, type MarketIndustryData } from './marketBoardData';
import {
  brandColorFor,
  fmtWan,
  labelInkFor,
  monthLabel,
  round1,
  trendSeries,
  trendSummary,
} from './marketBoardModel';
import { MB_CARD, MBCardHead, MBScroll, MBSummaryLine, MB_AXIS, MB_TOOLTIP, useEChart } from './marketBoardUI';

const ASP_INK = '#b45309'; // 琥珀墨：白底对比达标，线与标注同色（与全站跌琥珀同源）

/** 把数据序列映射到条带的指定纵向区间（比例带），返回隐藏轴的 min/max */
function bandAxis(values: number[], from: number, to: number): { min: number; max: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1e-6, hi - lo);
  const S = span / (to - from);
  const min = lo - from * S;
  return { min, max: min + S };
}

export default function BrandShareTrendCard({ data }: { data: MarketIndustryData }) {
  const t = trendSeries(data);
  const legendItems = [...data.brands, OTHERS];
  const legendRows = legendItems.length > 8 ? 2 : 1;

  const chart = useEChart(
    () => {
      const volAxis = bandAxis(t.volumes, 0.1, 0.46); // 线带下半：销量
      const aspAxis = bandAxis(t.asps, 0.54, 0.92); // 线带上半：均价

      const series: Record<string, unknown>[] = [];

      legendItems.forEach((brand) => {
        const fill = brandColorFor(brand);
        series.push({
          name: brand === OTHERS ? '<OTHERS>' : brand,
          type: 'bar',
          stack: 'share',
          xAxisIndex: 1,
          yAxisIndex: 2,
          barWidth: '58%',
          data: t.shares[brand],
          itemStyle: { color: fill },
          label: {
            show: true,
            position: 'inside',
            fontSize: 10,
            color: labelInkFor(fill),
            formatter: (p: { value: number }) => (p.value >= 12 ? `${Math.round(p.value)}%` : ''),
          },
        });
      });

      series.push(
        {
          name: '大盘销量（万台）',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: t.volumes,
          symbol: 'circle',
          symbolSize: 4.5,
          lineStyle: { width: 2, color: color.link },
          itemStyle: { color: color.link, borderColor: '#ffffff', borderWidth: 1 },
          label: {
            show: true,
            position: 'bottom',
            distance: 5,
            fontSize: 10,
            color: color.link,
            formatter: (p: { value: number }) => round1(p.value).toFixed(1),
          },
          z: 5,
        },
        {
          name: '大盘均价（美元）',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: t.asps,
          symbol: 'diamond',
          symbolSize: 5,
          lineStyle: { width: 2, color: ASP_INK },
          itemStyle: { color: ASP_INK, borderColor: '#ffffff', borderWidth: 1 },
          label: {
            show: true,
            position: 'top',
            distance: 5,
            fontSize: 10,
            color: ASP_INK,
            formatter: (p: { value: number }) => `${Math.round(p.value)}`,
          },
          z: 5,
        },
      );

      return {
        grid: [
          { left: 56, right: 24, top: 14, height: 96 },
          { left: 56, right: 24, top: 138, bottom: legendRows * 18 + 26 },
        ],
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        legend: {
          bottom: 0,
          left: 'center',
          itemWidth: 14,
          itemHeight: 8,
          icon: 'roundRect',
          itemGap: 12,
          textStyle: { fontSize: 11, color: color.body },
          data: [...legendItems.map((b) => (b === OTHERS ? '<OTHERS>' : b)), '大盘销量（万台）', '大盘均价（美元）'],
        },
        tooltip: {
          ...MB_TOOLTIP,
          trigger: 'axis',
          formatter: (ps: { dataIndex: number }[]) => {
            const idx = ps[0]?.dataIndex ?? 0;
            const m = t.months[idx] ?? '';
            const shareRows = legendItems
              .map((b) => ({ b, v: t.shares[b]?.[idx] ?? 0 }))
              .sort((a, z) => z.v - a.v)
              .filter(({ v }) => v >= 1)
              .map(({ b, v }) => {
                const c = brandColorFor(b);
                return `<div style="display:flex;align-items:center;gap:6px;line-height:1.8">` +
                  `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c}"></span>` +
                  `<span style="min-width:64px">${b === OTHERS ? '&lt;OTHERS&gt;' : b}</span>` +
                  `<span style="font-weight:600;color:${color.ink}">${Math.round(v)}%</span></div>`;
              })
              .join('');
            return (
              `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${monthLabel(m)}</div>` +
              shareRows +
              `<div style="margin-top:4px;padding-top:4px;border-top:1px solid ${color.hairline};color:${color.body}">` +
              `大盘容量 ${fmtWan(t.volumes[idx] ?? 0)} · 大盘均价 $${t.asps[idx] ?? 0}</div>`
            );
          },
        },
        xAxis: [
          {
            type: 'category',
            gridIndex: 0,
            data: t.months,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
          },
          {
            type: 'category',
            gridIndex: 1,
            data: t.months,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: color.hairline } },
            axisLabel: { ...MB_AXIS, interval: 0, fontSize: 10, formatter: (v: string) => monthLabel(v) },
          },
        ],
        yAxis: [
          { type: 'value', gridIndex: 0, min: volAxis.min, max: volAxis.max, show: false },
          { type: 'value', gridIndex: 0, min: aspAxis.min, max: aspAxis.max, show: false },
          {
            type: 'value',
            gridIndex: 1,
            min: 0,
            max: 100,
            interval: 25,
            axisLabel: { ...MB_AXIS, formatter: (v: number) => `${v}%` },
            splitLine: { lineStyle: { color: color.hairline } },
          },
        ],
        series,
      };
    },
    [data],
    { width: '100%', height: 470 },
  );

  return (
    <section style={MB_CARD}>
      <MBCardHead title="品牌份额趋势" source="模拟数据" hint={data.intro} />
      <MBSummaryLine>
        {'上方条带：蓝线为大盘容量（万台）、琥珀线为大盘均价（美元），均逐点标值；下方为月度品牌份额。'}
      </MBSummaryLine>
      <MBScroll minWidth={1160}>{chart}</MBScroll>
      <MBSummaryLine>{trendSummary(data)}</MBSummaryLine>
    </section>
  );
}
