// ============================================================
// 大盘图表③ · 各品牌核心档位结构同比变化（GFK IMG_9371 复刻）
// 品牌列横滚网格（大盘整体列打头）：列头为本期/同期总量与同比；列内每档位
// 一对细柱（本期实色 / 同期浅灰）+ 右缘同比标注（涨蓝 / 跌琥珀 / 新增灰）。
// 所有列共用同一 X 量纲，可直接横向比较。
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

const COL_W = 172;
const CHART_H = 190;

const PREV_FILL = '#d4d4d4'; // 同期柱：浅灰
const TOTAL_FILL = '#737373'; // 大盘整体列：中性墨

function columnFill(colorKey: string): string {
  if (colorKey === '__total__') return TOTAL_FILL;
  return brandColorFor(colorKey);
}

/** 单品牌列小图：本期/同期成对细柱 + 右缘同比标注 */
function BrandColumn({ colorKey, label, cur, prev, yoy, rows, axisMax, sep }: {
  colorKey: string;
  label: string;
  cur: number;
  prev: number;
  yoy: number | null;
  rows: TierYoyRow[];
  axisMax: number;
  sep: boolean;
}) {
  const gutter = axisMax * 0.93; // 同比标注落点（绘图区右缘内侧，轴上限内不被裁剪）
  const chart = useEChart(
    () => ({
      grid: { left: 58, right: 52, top: 6, bottom: 8 },
      tooltip: {
        ...MB_TOOLTIP,
        trigger: 'item',
        formatter: (p: { seriesName: string; dataIndex: number }) => {
          const row = rows[p.dataIndex];
          if (!row) return '';
          return `<div style="font-weight:600;color:${color.ink};margin-bottom:2px">${row.label} 美元档</div>` +
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
        axisLabel: { ...MB_AXIS, fontSize: 10 },
      },
      series: [
        {
          name: '同期',
          type: 'bar',
          data: rows.map((r) => round1(r.prev)),
          barWidth: 6,
          itemStyle: { color: PREV_FILL, borderRadius: [0, 2, 2, 0] },
        },
        {
          name: '本期',
          type: 'bar',
          data: rows.map((r) => round1(r.cur)),
          barWidth: 6,
          barGap: '30%',
          itemStyle: { color: columnFill(colorKey), borderRadius: [0, 2, 2, 0] },
          label: {
            show: true,
            position: 'right',
            fontSize: 10,
            color: color.body,
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
              fontSize: 10,
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
    [rows, axisMax, gutter],
    { width: '100%', height: CHART_H },
  );

  return (
    <div
      style={{
        flex: '0 0 auto',
        width: COL_W,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        ...(sep ? { borderLeft: `1px solid ${color.hairline}`, paddingLeft: 12, marginLeft: 12 } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: columnFill(colorKey), flexShrink: 0 }} />
        <span style={{ fontSize: fontSize.caption, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, color: color.ink, fontWeight: 600 }}>{round1(cur).toFixed(1)}</span>
        <span style={{ fontSize: 10, color: color.mute }}>{`同期 ${round1(prev).toFixed(1)}`}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: yoyInk(yoy) }}>{fmtYoy(yoy)}</span>
      </div>
      {chart}
    </div>
  );
}

export default function BrandTierYoYCard({ data }: { data: MarketIndustryData }) {
  const columns = tierYoyColumns(data);
  const maxVal = Math.max(...columns.flatMap((c) => c.rows.map((r) => Math.max(r.cur, r.prev))), 0.1);
  // 轴上限放大 1.45 倍：右缘留出同比标注带（轴无刻度，无需取整）
  const axisMax = maxVal * 1.45;
  const periodText = `${monthLabel(data.yoyMonths[0])} vs ${monthLabel(data.yoyMonths[1])}`;

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
      <MBScroll minWidth={columns.length * (COL_W + 24)}>
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
              axisMax={axisMax}
              sep={i > 0}
            />
          ))}
        </div>
      </MBScroll>
      <MBSummaryLine>{'每档位一对细柱：实色为本期，浅灰为去年同期；右缘百分比为同比，蓝色增长、琥珀下滑。'}</MBSummaryLine>
    </section>
  );
}
