// ============================================================
// 逐周需求与成交图：无约束需求（蓝）/ SO（华为红，最粗）/ 可供量（弱灰）。
// 历史段（模拟）W1–当前周实线，预测周虚线；历史 / 预测分界线 + 预测区浅底；
// 缺货只表现为 SO 被可供量截断（红环 + 图下文字），不改写无约束需求。
// 图表只承担形态，长文本下沉到图下摘要与事件行。
// ============================================================
import { brandColor, color, font, radius } from '../../theme/tokens';
import type { ComputedWeek } from './forecastModel';
import { fmtUnits } from './ForecastBits';

interface SeriesSpec {
  key: 'unconstrainedDemand' | 'so' | 'available';
  label: string;
  stroke: string;
  width: number;
}

const SERIES: SeriesSpec[] = [
  { key: 'unconstrainedDemand', label: '无约束需求', stroke: color.link, width: 2 },
  { key: 'so', label: 'SO', stroke: brandColor.HUAWEI, width: 3 },
  { key: 'available', label: '可供量', stroke: color.hairlineStrong, width: 1.6 },
];

function LegendLine({ stroke, dashed, width }: { stroke: string; dashed?: boolean; width: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 22,
        borderTop: `${width}px ${dashed ? 'dashed' : 'solid'} ${stroke}`,
        marginRight: 6,
        verticalAlign: 'middle',
      }}
    />
  );
}

export default function ForecastChart({ weeks, currentWeekIndex }: { weeks: ComputedWeek[]; currentWeekIndex: number }) {
  const width = 920;
  const height = 300;
  const left = 54;
  const right = 18;
  const top = 26;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, ...weeks.flatMap((week) => [week.unconstrainedDemand, week.so, week.available])) * 1.06;
  const x = (index: number): number => left + (index / Math.max(1, weeks.length - 1)) * plotWidth;
  const y = (value: number): number => top + plotHeight - (value / maxValue) * plotHeight;
  const path = (series: SeriesSpec['key'], from: number, to: number): string => {
    const points = weeks.slice(from, to + 1).map((week, offset) => ({ value: week[series], index: from + offset }));
    if (!points.length) return '';
    return points
      .map((point, offset) => `${offset === 0 ? 'M' : 'L'}${x(point.index).toFixed(1)} ${y(point.value).toFixed(1)}`)
      .join(' ');
  };
  const intervalWeeks = weeks
    .map((week, index) => ({ week, index }))
    .filter(({ week, index }) => index > currentWeekIndex && week.forecastP10 != null && week.forecastP90 != null);
  const intervalPath = intervalWeeks.length
    ? [
      ...intervalWeeks.map(({ week, index }, offset) => `${offset === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(week.forecastP90 as number).toFixed(1)}`),
      ...intervalWeeks.slice().reverse().map(({ week, index }) => `L${x(index).toFixed(1)} ${y(week.forecastP10 as number).toFixed(1)}`),
      'Z',
    ].join(' ')
    : '';
  const boundaryX = (x(currentWeekIndex) + x(Math.min(currentWeekIndex + 1, weeks.length - 1))) / 2;
  const gridFractions = [0.25, 0.5, 0.75, 1];
  const labelWeeks = weeks.filter((_, index) => index % 4 === 0 || index === weeks.length - 1);
  const current = weeks[currentWeekIndex];
  const stockoutWeeks = weeks.filter((week) => week.stockout);
  const aria = `逐周需求与成交图，共 ${weeks.length} 周。${current.week}（当前周）无约束需求 ${fmtUnits(current.unconstrainedDemand)} 台，SO ${fmtUnits(current.so)} 台，可供量 ${fmtUnits(current.available)} 台。历史段（模拟）用实线、预测周用虚线；${stockoutWeeks.length ? `缺货截断周：${stockoutWeeks.map((week) => week.week).join('、')}。` : '当前无缺货截断周。'}`;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', fontSize: 12, color: color.body }}>
        {SERIES.map((series) => (
          <span key={series.key} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <LegendLine stroke={series.stroke} width={series.width} />
            {series.label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center' }}><LegendLine stroke={color.body} width={1.5} />实线 = 历史段（模拟）</span>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}><LegendLine stroke={color.body} dashed width={1.5} />虚线 = 预测周</span>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <span aria-hidden style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', border: `2px solid ${color.error}`, marginRight: 6 }} />
          缺货截断（SO = 可供量）
        </span>
        {intervalWeeks.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center' }}><span aria-hidden style={{ width: 22, height: 8, marginRight: 6, background: `${color.link}22`, border: `1px solid ${color.link}66` }} />校准 P10–P90</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={aria}
          aria-describedby="forecast-chart-summary"
          style={{ display: 'block', width: '100%', minWidth: 720, height: 'auto' }}
        >
          {/* 预测区浅底 + 实际 / 预测分界 */}
          <rect x={boundaryX} y={top} width={Math.max(0, width - right - boundaryX)} height={plotHeight} fill={color.canvasSoft2} opacity={0.5} />
          <line x1={boundaryX} x2={boundaryX} y1={top - 6} y2={top + plotHeight} stroke={color.hairlineStrong} strokeDasharray="4 3" />
          <text x={boundaryX - 6} y={top - 9} textAnchor="end" fontSize={11} fill={color.body}>历史段（模拟）</text>
          <text x={boundaryX + 6} y={top - 9} fontSize={11} fill={color.body}>预测</text>

          {/* 网格与刻度 */}
          <g stroke={color.hairline}>
            {gridFractions.map((fraction) => (
              <line key={fraction} x1={left} y1={y(maxValue * fraction)} x2={width - right} y2={y(maxValue * fraction)} />
            ))}
          </g>
          <g fontSize={10} fill={color.mute} textAnchor="end">
            {gridFractions.map((fraction) => (
              <text key={fraction} x={left - 8} y={y(maxValue * fraction) + 3}>{Math.round(maxValue * fraction)}</text>
            ))}
          </g>

          {intervalPath && <path d={intervalPath} fill={`${color.link}18`} stroke="none" aria-label="预测 P10 到 P90 区间" />}

          {/* 三条主线：实际段实线、预测段虚线 */}
          {SERIES.map((series) => (
            <g key={series.key}>
              <path d={path(series.key, 0, currentWeekIndex)} fill="none" stroke={series.stroke} strokeWidth={series.width} strokeLinejoin="round" />
              <path d={path(series.key, currentWeekIndex, weeks.length - 1)} fill="none" stroke={series.stroke} strokeWidth={series.width} strokeDasharray="6 4" strokeLinejoin="round" opacity={series.key === 'available' ? 0.9 : 1} />
            </g>
          ))}

          {/* 缺货截断标记：SO 点红环（颜色 + 图例文字双通道） */}
          {stockoutWeeks.map((week) => {
            const index = weeks.indexOf(week);
            return <circle key={week.week} cx={x(index)} cy={y(week.so)} r={4.5} fill="none" stroke={color.error} strokeWidth={2} />;
          })}

          {/* 当前周标记 */}
          <circle cx={x(currentWeekIndex)} cy={y(current.so)} r={4.5} fill={brandColor.HUAWEI} stroke={color.canvas} strokeWidth={1.5} />
          <text x={x(currentWeekIndex)} y={y(current.so) - 10} textAnchor="middle" fontSize={10} fontWeight={600} fill={color.ink}>{`当前 ${current.week}`}</text>

          {/* 横轴周标签（技术标识用等宽字体） */}
          <g fontSize={10} fill={color.mute} textAnchor="middle" fontFamily={font.mono}>
            {labelWeeks.map((week) => {
              const index = weeks.indexOf(week);
              return <text key={week.week} x={x(index)} y={height - 14}>{week.week}</text>;
            })}
          </g>
          <text x={left - 8} y={height - 14} fontSize={10} fill={color.mute} textAnchor="end">台</text>
        </svg>
      </div>
      <div id="forecast-chart-summary" style={{ padding: '8px 11px', borderRadius: radius.control, background: color.canvasSoft, fontSize: 12, lineHeight: 1.6, color: color.body }}>
        {current.week} 无约束需求 {fmtUnits(current.unconstrainedDemand)} 台、SO {fmtUnits(current.so)} 台、可供量 {fmtUnits(current.available)} 台；
        {stockoutWeeks.length
          ? `${stockoutWeeks.map((week) => week.week).join('、')} 因供应波动使 SO 按可供量截断（无约束需求保留原值，缺货不等于需求下降）。`
          : '当前窗口内无缺货截断周。'}
        {intervalWeeks.length > 0 ? '预测周同时展示通过留出验证校准的 P10–P90 区间；区间仍受可供量上限截断。' : '预测周为模型点估计；当前没有通过质量门槛的校准分位数区间，本图不绘制预测带。'}
      </div>
    </div>
  );
}
