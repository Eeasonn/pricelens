// ============================================================
// 推演工作台 v2 · 层④成本销毛：月版本成本阶梯 + 预测销毛柱
// （形态参考走势页 MarginCostCard：周销毛琥珀柱 + 单台成本月版本阶梯线 +
// 均价线；预测段按本页实/虚语言自建虚柱虚线）。销毛 = 周销 ×（价格 − 当月
// 版本成本），演示口径不含渠道费率；成本只进销毛链，不修改需求。
// WP5 Step 9：周销毛轴与 tooltip 统一 $M（fmtMillionUsd），禁「万$」标原始
// USD；周销毛图例真实显隐（可点击）。Step 10：无数据显示「暂无成本销毛
// 数据」；负单台销毛不静默丢柱，零基线向下表达。预测起点从周状态派生，
// 禁写死下标（与主图共用 firstForecastIndex）。
// ============================================================
import { useState } from 'react';
import { brandColor, color, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';
import { CertaintyBadge, IoBar, SectionHead, SimChip, WorkbenchLegend, fmtMillionUsd, workbenchCardStyle, type LegendItem } from './WorkbenchBits';
import { buildAxisTicks, firstForecastIndex } from './workbenchChartSegments';

const W = 640;
const H = 230;
const LEFT = 52;
const RIGHT = 50;
const TOP = 16;
const BOTTOM = 26;
const PLOT_W = W - LEFT - RIGHT;
const PLOT_H = H - TOP - BOTTOM;

const fmtUnits = (value: number | null): string => (value != null ? value.toLocaleString('en-US') : '—');

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
  const legendItems: LegendItem[] = [
    { key: 'margin', label: '周销毛（$M）', shape: 'rect', color: color.warning },
    { key: 'cost', label: '成本 · 月版本（实→虚）', shape: 'line', color: color.hairlineStrong },
    { key: 'price', label: '价格', shape: 'line', color: brandColor.HUAWEI },
  ];

  const head = (
    <>
      <SectionHead
        title="成本销毛"
        hint="链路末端独立推测（月版本成本阶梯 + 预测销毛柱，历史实 / 预测虚）：周销毛 = 主图最终 SO ×（价格 − 当月版本成本），演示口径不含渠道费率；不回写主图。"
        extra={<>
          <SimChip title="成本与销毛为演示样本推演：月版本成本 × 主图价格，不含渠道费率" />
          <CertaintyBadge level="mid" />
        </>}
      />
      <IoBar
        input="主图最终 SO（量价链推完）· 主图价格 · 成本月版本趋势"
        output="预测期销毛（独立推测，不修正主图）"
      />
    </>
  );

  // 空态（WP5 Step 10）：无周数据不渲染计算结果为 NaN 的 SVG。
  if (!weeks.length) {
    return (
      <section style={workbenchCardStyle}>
        {head}
        <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: space.lg, fontSize: 12, color: color.mute, textAlign: 'center' }}>
          暂无成本销毛数据
        </div>
      </section>
    );
  }

  // 时间边界派生（WP5 Step 3）：与主图共用 firstForecastIndex，禁写死下标。
  const forecastStart = firstForecastIndex(weeks);
  const hasForecast = forecastStart >= 0;
  const hasHistory = forecastStart > 0;
  const historyEnd = hasForecast ? forecastStart - 1 : weeks.length - 1;
  const slot = PLOT_W / weeks.length;
  const barW = Math.min(26, slot * 0.52);
  const x = (index: number): number => LEFT + (index + 0.5) * slot;

  // 周销毛轴：正负同轴，零基线（WP5 Step 10 负销毛向下表达）。
  const margins = weeks.map((week) => week.weeklyMargin);
  const marginMax = Math.max(0, ...margins);
  const marginMin = Math.min(0, ...margins);
  const yMax = Math.max(1, niceCeil(marginMax * 1.1));
  const yMin = marginMin < 0 ? -Math.max(1, niceCeil(-marginMin * 1.1)) : 0;
  const y = (value: number): number => TOP + PLOT_H * (1 - (value - yMin) / (yMax - yMin));
  const zeroY = y(0);
  // 刻度：0 基线必画；有负值段时补负端点；其余由数据域生成。
  const tickValues = Array.from(new Set([yMin < 0 ? yMin : 0, ...buildAxisTicks(yMin, yMax, 2)])).sort((a, b) => a - b);

  // 右轴（USD/台）：覆盖月版本成本与均价，头尾留 8% 呼吸（与 MarginCostCard 同口径）。
  const unitValues = weeks.flatMap((week) => [week.unitCost, week.price]);
  const uLo = Math.min(...unitValues);
  const uHi = Math.max(...unitValues);
  const uPad = (uHi - uLo) * 0.08 || uHi * 0.08 || 1;
  const uMin = uLo - uPad;
  const uMax = uHi + uPad;
  const yUnit = (value: number): number => TOP + PLOT_H * (1 - (value - uMin) / (uMax - uMin));

  const stepPath = (key: 'unitCost' | 'price', from: number, to: number): string => {
    if (from > to || from < 0 || to >= weeks.length) return '';
    let d = '';
    weeks.slice(from, to + 1).forEach((week, offset) => {
      const value = key === 'unitCost' ? week.unitCost : week.price;
      const px = x(from + offset);
      d += `${d ? 'L' : 'M'}${(px - slot / 2).toFixed(1)} ${yUnit(value).toFixed(1)}`;
      d += `L${(px + slot / 2).toFixed(1)} ${yUnit(value).toFixed(1)}`;
    });
    return d;
  };
  // 档期价格读数从 fixture 派生（WP6 收尾：删除「黑五价期（W46–W49 $799）」形硬编码）
  const promoPrices = [...new Set(
    weeks
      .filter((week) => week.weekNumber >= fixture.promoBand.startWeek && week.weekNumber <= fixture.promoBand.endWeek)
      .map((week) => week.price),
  )];
  const costHistoryD = hasHistory ? stepPath('unitCost', 0, historyEnd) : '';
  const costForecastD = hasForecast ? stepPath('unitCost', forecastStart, weeks.length - 1) : '';
  const priceHistoryD = hasHistory ? stepPath('price', 0, historyEnd) : '';
  const priceForecastD = hasForecast ? stepPath('price', forecastStart, weeks.length - 1) : '';
  const costChangeWeeks = fixture.costVersions.slice(1).map((version) => version.fromWeek);

  return (
    <section style={workbenchCardStyle}>
      {head}
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`成本销毛：周销毛柱与月版本成本阶梯（${fixture.costVersions.map((version) => `${version.monthLabel} $${version.unitCost}`).join(' → ')}）；预测期（${fixture.context.forecastRange}）销毛 ${fmtMillionUsd(result.summary.forecastMargin)}，历史 ${fixture.context.historyRange} 销毛 ${fmtMillionUsd(result.summary.historyMargin)}。`}
          style={{ display: 'block', height: 'auto', minWidth: 420 }}
        >
          {/* 周销毛轴（$M）：0 基线强分隔，其余刻度弱网格；负值向下 */}
          {tickValues.map((value) => {
            const gy = y(value);
            return (
              <g key={value}>
                <line x1={LEFT} y1={gy} x2={W - RIGHT} y2={gy} stroke={value === 0 ? color.hairlineStrong : color.hairline} />
                <text x={LEFT - 6} y={gy + 3.5} fontSize={10} fill={color.mute} textAnchor="end">{fmtMillionUsd(value)}</text>
              </g>
            );
          })}
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
          {/* 周销毛柱：历史实（琥珀）/ 预测虚柱；正 = 零基线向上，负 = 向下（不静默丢柱）；零销毛无高度不画 */}
          {show('margin') && weeks.map((week, index) => {
            const value = week.weeklyMargin;
            if (value === 0) return null;
            const forecast = week.status === 'forecast';
            const top = value > 0 ? y(value) : zeroY;
            const height = Math.abs(y(value) - zeroY);
            return (
              <rect
                key={`mg-${week.week}`}
                x={x(index) - barW / 2}
                y={top}
                width={barW}
                height={height}
                rx={2}
                fill={forecast ? color.canvas : color.warning}
                fillOpacity={forecast ? 1 : 0.35}
                stroke={forecast ? color.warning : color.warningInk}
                strokeOpacity={forecast ? 1 : 0.55}
                strokeWidth={1}
                strokeDasharray={forecast ? '4 3' : undefined}
              >
                <title>{`${week.week} 周销毛 ${fmtMillionUsd(value)} · 周销 ${fmtUnits(week.final)} 台 · 价格 $${week.price} − 成本 $${week.unitCost} = 单台 $${week.unitMargin}`}</title>
              </rect>
            );
          })}
          {/* 成本月版本阶梯（实→虚）+ 版本切换点 */}
          {show('cost') && (
            <>
              {costHistoryD && <path d={costHistoryD} fill="none" stroke={color.hairlineStrong} strokeWidth={2} />}
              {costForecastD && <path d={costForecastD} fill="none" stroke={color.hairlineStrong} strokeWidth={2} strokeDasharray="5 4" />}
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
              {priceHistoryD && <path d={priceHistoryD} fill="none" stroke={brandColor.HUAWEI} strokeWidth={1.8} />}
              {priceForecastD && <path d={priceForecastD} fill="none" stroke={brandColor.HUAWEI} strokeWidth={1.8} strokeDasharray="5 4" />}
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
          <span style={{ color: color.mute }}>与主图摘要同源；{promoPrices.length ? `档期内价格 ${promoPrices.map((price) => `$${price}`).join(' / ')}（${fixture.promoBand.label}）单台毛利收窄` : `${fixture.promoBand.label}不在本预测窗`}</span>
        </div>
      </div>
    </section>
  );
}
