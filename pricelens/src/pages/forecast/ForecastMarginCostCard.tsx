// ============================================================
// 推演工作台 v2 · 层④成本销毛：月版本成本阶梯 + 预测销毛柱
// （形态参考走势页 MarginCostCard：周销毛琥珀柱 + 单台成本月版本阶梯线 +
// 均价线；预测段按本页实/虚语言自建虚柱虚线）。销毛 = 周销 ×（价格 − 当月
// 版本成本），演示口径不含渠道费率；成本只进销毛链，不修改需求。
// ============================================================
import { useState } from 'react';
import { brandColor, color, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';
import { CertaintyBadge, IoBar, SectionHead, WorkbenchLegend, fmtMillionUsd, wanUsdOf, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

const W = 640;
const H = 230;
const LEFT = 52;
const RIGHT = 50;
const TOP = 16;
const BOTTOM = 26;
const PLOT_W = W - LEFT - RIGHT;
const PLOT_H = H - TOP - BOTTOM;
const FORECAST_START = 8;

export default function ForecastMarginCostCard({ fixture, result }: { fixture: WorkbenchFixture; result: WorkbenchResult }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const show = (key: string): boolean => !hidden.has(key);
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const weeks = result.weeks;
  const slot = PLOT_W / weeks.length;
  const barW = Math.min(26, slot * 0.52);
  const x = (index: number): number => LEFT + (index + 0.5) * slot;
  const margins = weeks.map((week) => week.weeklyMargin);
  const yMax = Math.max(1, niceCeil(Math.max(...margins) * 1.1));
  const y = (value: number): number => TOP + PLOT_H * (1 - value / yMax);

  // 右轴（USD/台）：覆盖月版本成本与均价，头尾留 8% 呼吸（与 MarginCostCard 同口径）。
  const unitValues = weeks.flatMap((week) => [week.unitCost, week.price]);
  const uLo = Math.min(...unitValues);
  const uHi = Math.max(...unitValues);
  const uPad = (uHi - uLo) * 0.08 || uHi * 0.08 || 1;
  const uMin = uLo - uPad;
  const uMax = uHi + uPad;
  const yUnit = (value: number): number => TOP + PLOT_H * (1 - (value - uMin) / (uMax - uMin));

  const stepPath = (key: 'unitCost' | 'price', from: number, to: number): string => {
    let d = '';
    weeks.slice(from, to + 1).forEach((week, offset) => {
      const value = key === 'unitCost' ? week.unitCost : week.price;
      const px = x(from + offset);
      d += `${d ? 'L' : 'M'}${(px - slot / 2).toFixed(1)} ${yUnit(value).toFixed(1)}`;
      d += `L${(px + slot / 2).toFixed(1)} ${yUnit(value).toFixed(1)}`;
    });
    return d;
  };
  const costChangeWeeks = fixture.costVersions.slice(1).map((version) => version.fromWeek);

  const legendItems: LegendItem[] = [
    { label: '周销毛（万$）', shape: 'rect', color: color.warning },
    { key: 'cost', label: '成本 · 月版本（实→虚）', shape: 'line', color: color.hairlineStrong },
    { key: 'price', label: '价格', shape: 'line', color: brandColor.HUAWEI },
  ];

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="成本销毛"
        hint="链路末端独立推测（月版本成本阶梯 + 预测销毛柱，历史实 / 预测虚）：周销毛 = 主图最终 SO ×（价格 − 当月版本成本），演示口径不含渠道费率；不回写主图。"
        extra={<CertaintyBadge level="mid" />}
      />
      <IoBar
        input="主图最终 SO（量价链推完）· 主图价格 · 成本月版本趋势"
        output="预测期销毛（独立推测，不修正主图）"
      />
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`成本销毛：周销毛柱与月版本成本阶梯（${fixture.costVersions.map((version) => `${version.monthLabel} $${version.unitCost}`).join(' → ')}）；预测期（${fixture.context.forecastRange}）销毛 ${fmtMillionUsd(result.summary.forecastMargin)}，历史 ${fixture.context.historyRange} 销毛 ${fmtMillionUsd(result.summary.historyMargin)}。`}
          style={{ display: 'block', height: 'auto', minWidth: 420 }}
        >
          {[0, 0.5, 1].map((fraction) => {
            const gy = TOP + PLOT_H * (1 - fraction);
            return (
              <g key={fraction}>
                <line x1={LEFT} y1={gy} x2={W - RIGHT} y2={gy} stroke={fraction === 0 ? color.hairlineStrong : color.hairline} />
                <text x={LEFT - 6} y={gy + 3.5} fontSize={10} fill={color.mute} textAnchor="end">{Math.round(yMax * fraction)}</text>
              </g>
            );
          })}
          <text x={LEFT - 6} y={TOP - 4} fontSize={10} fill={color.mute} textAnchor="end">万$</text>
          {[0, 0.5, 1].map((fraction) => {
            const value = uMin + (uMax - uMin) * fraction;
            return <text key={fraction} x={W - RIGHT + 6} y={yUnit(value) + 3.5} fontSize={10} fill={color.mute}>{`$${Math.round(value / 10) * 10}`}</text>;
          })}
          {weeks.map((week, index) => {
            if (index % 4 === 0 || index === weeks.length - 1) {
              return <text key={week.week} x={x(index)} y={H - 8} textAnchor="middle" fontSize={10} fill={color.mute}>{week.week}</text>;
            }
            return null;
          })}
          {/* 周销毛柱：历史实（琥珀）/ 预测虚柱 */}
          {weeks.map((week, index) => {
            const value = margins[index];
            if (value <= 0) return null;
            const forecast = index >= FORECAST_START;
            return (
              <rect
                key={`mg-${week.week}`}
                x={x(index) - barW / 2}
                y={y(value)}
                width={barW}
                height={Math.max(1, TOP + PLOT_H - y(value))}
                rx={2}
                fill={forecast ? color.canvas : color.warning}
                fillOpacity={forecast ? 1 : 0.35}
                stroke={forecast ? color.warning : color.warningInk}
                strokeOpacity={forecast ? 1 : 0.55}
                strokeWidth={1}
                strokeDasharray={forecast ? '4 3' : undefined}
              >
                <title>{`${week.week} 周销毛 ${wanUsdOf(value).toLocaleString('en-US')} 万$ · 周销 ${(week.final ?? 0).toLocaleString('en-US')} 台 · 价格 $${week.price} − 成本 $${week.unitCost} = 单台 $${week.unitMargin}`}</title>
              </rect>
            );
          })}
          {/* 成本月版本阶梯（实→虚）+ 版本切换点 */}
          {show('cost') && (
            <>
              <path d={stepPath('unitCost', 0, 7)} fill="none" stroke={color.hairlineStrong} strokeWidth={2} />
              <path d={stepPath('unitCost', FORECAST_START, weeks.length - 1)} fill="none" stroke={color.hairlineStrong} strokeWidth={2} strokeDasharray="5 4" />
              {costChangeWeeks.map((weekNumber) => {
                const index = weeks.findIndex((week) => week.weekNumber === weekNumber);
                if (index < 0) return null;
                return <circle key={weekNumber} cx={x(index)} cy={yUnit(weeks[index].unitCost)} r={3} fill={color.canvas} stroke={color.hairlineStrong} strokeWidth={1.6} />;
              })}
            </>
          )}
          {/* 价格线（实→虚） */}
          {show('price') && (
            <>
              <path d={stepPath('price', 0, 7)} fill="none" stroke={brandColor.HUAWEI} strokeWidth={1.8} />
              <path d={stepPath('price', FORECAST_START, weeks.length - 1)} fill="none" stroke={brandColor.HUAWEI} strokeWidth={1.8} strokeDasharray="5 4" />
            </>
          )}
        </svg>
      </div>
      <WorkbenchLegend items={legendItems} hidden={hidden} onToggle={toggle} style={{ marginTop: 0 }} />
      <div className="tnum" style={{ marginTop: space.xs, fontSize: 12, lineHeight: 1.6, color: color.body, padding: `${space.sm}px ${space.md}px`, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: color.mute }}>成本版本</span>
          <span>{fixture.costVersions.map((version) => `${version.monthLabel} $${version.unitCost}`).join(' → ')}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
          <span style={{ color: color.mute }}>预测期销毛</span>
          <b style={{ color: color.ink, fontWeight: 600 }}>{`${fmtMillionUsd(result.summary.forecastMargin)}（历史 ${fixture.context.historyRange} ${fmtMillionUsd(result.summary.historyMargin)}）`}</b>
          <span style={{ color: color.mute }}>与主图摘要同源；黑五价期（W46–W49 $799）单台毛利收窄</span>
        </div>
      </div>
    </section>
  );
}
