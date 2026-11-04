// ============================================================
// 大盘图表④ · 品牌份额走势多线卡（2026-11-04 第二波新增，Eason 拍板：
// 品牌份额走势单拉一张新卡，不影响图 2）。
// 全档位大盘口径（本卡不加档位筛选）：每品牌一条月度份额线（品牌数据色，
// HUAWEI 最强线宽；OTHERS 中性灰虚线），横轴 = 月、纵轴 = 份额 %。
// 只留数据与控件：图例为 echarts legend（图外底部居中、可点显隐，与图 1/2
// 同款风格）；线端仅标最新月（品牌名 + 份额，labelLayout hideOverlap 避让，
// 参考图 2 销量线逐点标值做法收敛为「挤就只标最新月」）。
// 数据 = marketBoardModel.trendSeries 既有的全档位品牌份额序列，无新数据口径。
// ============================================================
import { color, fontSize } from '../../theme/tokens';
import { OTHERS, type MarketIndustryData } from './marketBoardData';
import { brandColorFor, brandLinesSummary, monthLabel, trendSeries } from './marketBoardModel';
import { MB_CARD, MBCardHead, MBScroll, MBSummaryLine, MB_AXIS, MB_TOOLTIP, useEChart } from './marketBoardUI';

export default function BrandShareLinesCard({ data }: { data: MarketIndustryData }) {
  const series = trendSeries(data);
  const items = [...data.brands, OTHERS];
  const names = items.map((b) => (b === OTHERS ? '<OTHERS>' : b));
  const lastIdx = series.months.length - 1;
  const legendRows = items.length > 8 ? 2 : 1;

  const chart = useEChart(
    () => ({
      grid: { left: 44, right: 108, top: 16, bottom: legendRows * 18 + 26 },
      legend: {
        bottom: 0,
        left: 'center',
        itemWidth: 14,
        itemHeight: 8,
        icon: 'roundRect',
        itemGap: 12,
        textStyle: { fontSize: 11, color: color.body },
        data: names,
      },
      tooltip: {
        ...MB_TOOLTIP,
        trigger: 'axis',
        formatter: (ps: { dataIndex: number }[]) => {
          const idx = ps[0]?.dataIndex ?? 0;
          const m = series.months[idx] ?? '';
          const rows = items
            .map((b) => ({ b, v: series.shares[b]?.[idx] ?? 0 }))
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
          return `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${monthLabel(m)} · 全档位大盘份额</div>${rows}`;
        },
      },
      xAxis: {
        type: 'category',
        data: series.months,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: color.hairline } },
        // 25 个月逐月标注会与右缘线端标值抢宽：每季一刻度，精确月份看 tooltip
        axisLabel: { ...MB_AXIS, interval: 2, fontSize: 10, formatter: (v: string) => monthLabel(v) },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 25,
        axisLabel: { ...MB_AXIS, formatter: (v: number) => `${v}%` },
        splitLine: { lineStyle: { color: color.hairline } },
      },
      series: items.map((brand) => {
        const c = brandColorFor(brand);
        const name = brand === OTHERS ? '<OTHERS>' : brand;
        const isHW = brand === 'HUAWEI';
        const isOthers = brand === OTHERS;
        return {
          name,
          type: 'line',
          data: series.shares[brand].map((v, i) =>
            i === lastIdx
              ? {
                  value: v,
                  label: {
                    show: true,
                    position: 'right',
                    distance: 4,
                    fontSize: 10,
                    fontWeight: isHW ? 600 : 400,
                    color: c,
                    formatter: () => `${name} ${Math.round(v)}%`,
                  },
                }
              : v,
          ),
          symbol: 'circle',
          symbolSize: isHW ? 4.5 : 3,
          lineStyle: { width: isHW ? 2.5 : 1.5, color: c, ...(isOthers ? { type: 'dashed' as const } : {}) },
          itemStyle: { color: c, borderColor: '#ffffff', borderWidth: 1 },
          emphasis: { focus: 'series' },
          labelLayout: { hideOverlap: true },
          z: isHW ? 6 : 4,
        };
      }),
    }),
    [data],
    { width: '100%', height: 420 },
  );

  return (
    <section style={MB_CARD}>
      <MBCardHead
        title="品牌份额走势"
        source="模拟数据"
        hint={data.intro}
        extra={
          <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>{'全档位口径 · 单位：份额 %'}</span>
        }
      />
      <MBSummaryLine>
        {'全档位大盘口径：每品牌一条月度份额线（%），线端标注最新月品牌与份额；图例可点选显隐。'}
      </MBSummaryLine>
      <MBScroll minWidth={1160}>{chart}</MBScroll>
      <MBSummaryLine>{brandLinesSummary(data)}</MBSummaryLine>
    </section>
  );
}
