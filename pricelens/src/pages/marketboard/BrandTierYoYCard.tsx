// ============================================================
// 大盘图表③ · 各品牌核心档位结构同比变化（GFK IMG_9371 复刻）
// 品牌列横滚网格（大盘整体列打头、hairline 分隔），档位标签仅在首列出现一次
// （与 GFK 同构，其余列把宽度留给柱与数值）。每档位一对横柱：本期实色 /
// 同期浅灰，各自标值；右缘为同比（涨蓝 / 跌琥珀 / 新增灰）。
// 柱长为列内独立缩放（GFK 同构），跨列比较看列头绝对值与同比。
// ============================================================
import { color, fontSize } from '../../theme/tokens';
import type { MarketIndustryData } from './marketBoardData';
import {
  brandColorFor,
  fmtYoy,
  monthLabel,
  round1,
  tierYoyColumns,
  tierYoySummary,
  yoyInk,
  type TierYoyRow,
} from './marketBoardModel';
import { MB_CARD, MBCardHead, MBScroll, MBSummaryLine, MB_AXIS, MB_TOOLTIP, useEChart } from './marketBoardUI';

const COL_W = 200; // 品牌列宽（不含首列档位标签带）
const TIER_AXIS_W = 60; // 首列档位标签带宽
const COL_GAP = 24; // 列间分隔（12 内边距 + 12 外边距）
const CHART_H = 400; // 6 档位 × 约 63px 行距（对照 GFK 原版的行距）

const PREV_FILL = '#d4d4d4'; // 同期柱：浅灰
const TOTAL_FILL = '#737373'; // 大盘整体列：中性墨

function columnFill(colorKey: string): string {
  if (colorKey === '__total__') return TOTAL_FILL;
  return brandColorFor(colorKey);
}

/** 单品牌列：本期/同期成对横柱 + 右缘同比标注；showTierAxis 仅首列为 true */
function BrandColumn({ colorKey, label, cur, prev, yoy, rows, axisMax, showTierAxis, sep }: {
  colorKey: string;
  label: string;
  cur: number;
  prev: number;
  yoy: number | null;
  rows: TierYoyRow[];
  axisMax: number;
  showTierAxis: boolean;
  sep: boolean;
}) {
  const gutter = axisMax * 0.9; // 同比标注落点（轴上限内，不被裁剪）
  const chart = useEChart(
    () => ({
      grid: { left: showTierAxis ? TIER_AXIS_W + 4 : 8, right: 62, top: 10, bottom: 10 },
      tooltip: {
        ...MB_TOOLTIP,
        trigger: 'item',
        formatter: (p: { seriesName: string; dataIndex: number }) => {
          const row = rows[p.dataIndex];
          if (!row) return '';
          return `<div style="font-weight:600;color:${color.ink};margin-bottom:2px">${label} · ${row.label} 美元档</div>` +
            `本期 ${round1(row.cur).toFixed(1)} 万台 · 同期 ${round1(row.prev).toFixed(1)} 万台（同比 ${fmtYoy(row.yoy)}）`;
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: axisMax,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: color.hairline } },
      },
      yAxis: {
        type: 'category',
        data: rows.map((r) => r.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: color.hairline } },
        axisLabel: { ...MB_AXIS, show: showTierAxis, fontSize: 11, color: color.body },
      },
      series: [
        {
          name: '同期',
          type: 'bar',
          data: rows.map((r) => round1(r.prev)),
          barWidth: 9,
          itemStyle: { color: PREV_FILL, borderRadius: [0, 2, 2, 0] },
          label: {
            show: true,
            position: 'right',
            fontSize: 10,
            color: color.mute,
            formatter: (p: { value: number }) => (p.value >= 0.05 ? p.value.toFixed(1) : ''),
          },
        },
        {
          name: '本期',
          type: 'bar',
          data: rows.map((r) => round1(r.cur)),
          barWidth: 9,
          barGap: '40%',
          itemStyle: { color: columnFill(colorKey), borderRadius: [0, 2, 2, 0] },
          label: {
            show: true,
            position: 'right',
            fontSize: 11,
            fontWeight: 600,
            color: color.ink,
            formatter: (p: { value: number }) => (p.value >= 0.05 ? p.value.toFixed(1) : ''),
          },
        },
        {
          name: '同比',
          type: 'scatter',
          symbolSize: 0,
          silent: true,
          tooltip: { show: false },
          data: rows.map((r, i) => ({
            value: [gutter, i],
            label: {
              show: true,
              position: 'right',
              fontSize: 11,
              fontWeight: 600,
              color: yoyInk(r.yoy),
              formatter: fmtYoy(r.yoy),
            },
          })),
          itemStyle: { color: 'transparent' },
          z: 4,
        },
      ],
    }),
    [rows, axisMax, gutter, showTierAxis, label],
    { width: '100%', height: CHART_H },
  );

  const width = COL_W + (showTierAxis ? TIER_AXIS_W : 0);
  return (
    <div
      style={{
        flex: '0 0 auto',
        width,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        ...(sep ? { borderLeft: `1px solid ${color.hairline}`, paddingLeft: 12, marginLeft: 12 } : {}),
      }}
    >
      <div style={{ paddingLeft: showTierAxis ? TIER_AXIS_W + 4 : 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: columnFill(colorKey), flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: fontSize.caption, color: color.ink, fontWeight: 600 }}>{round1(cur).toFixed(1)}</span>
          <span style={{ fontSize: 11, color: color.mute }}>{`同期 ${round1(prev).toFixed(1)}`}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: yoyInk(yoy) }}>{fmtYoy(yoy)}</span>
        </div>
      </div>
      {chart}
    </div>
  );
}

export default function BrandTierYoYCard({ data }: { data: MarketIndustryData }) {
  const columns = tierYoyColumns(data);
  // 列内独立缩放（GFK 同构）：每列按自身最大值 × 1.5 定轴上限，右缘留出数值 + 同比标注带；
  // 跨列比较看列头绝对值与同比，不靠柱长
  const axisMaxOf = (rows: TierYoyRow[]) => Math.max(...rows.map((r) => Math.max(r.cur, r.prev)), 0.1) * 1.5;
  const periodText = `${monthLabel(data.yoyMonths[0])} vs ${monthLabel(data.yoyMonths[1])}`;
  const minWidth = TIER_AXIS_W + columns.length * (COL_W + COL_GAP);

  return (
    <section style={MB_CARD}>
      <MBCardHead
        title="各品牌核心档位结构同比变化"
        source="模拟数据"
        hint={data.intro}
        extra={
          <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>
            {`${periodText} · 单位：万台`}
          </span>
        }
      />
      <MBSummaryLine>{tierYoySummary(data)}</MBSummaryLine>
      <MBScroll minWidth={minWidth}>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {columns.map((c, i) => (
            <BrandColumn
              key={c.key}
              colorKey={c.colorKey}
              label={c.label}
              cur={c.cur}
              prev={c.prev}
              yoy={c.yoy}
              rows={c.rows}
              axisMax={axisMaxOf(c.rows)}
              showTierAxis={i === 0}
              sep={i > 0}
            />
          ))}
        </div>
      </MBScroll>
      <MBSummaryLine>{'每档位一对横柱：实色为本期、浅灰为去年同期，柱端为万台数值（柱长按列内缩放，跨品牌比较看数值与同比）；右缘百分比为同比，蓝色增长、琥珀下滑、灰色为同期无量的新增。'}</MBSummaryLine>
    </section>
  );
}
