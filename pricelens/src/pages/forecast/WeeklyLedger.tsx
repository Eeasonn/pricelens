// ============================================================
// 周度经营主账：24 行表，周次 / 实际或预测 / 无约束需求 / 可供量（截断标）/
// SO / 期末库存 / 单台销毛 / 事件。当前行高亮；What-if 草稿重算行加琥珀点。
// 库存恒等式（期末 = 期初 + SI − SO）由模型保证，表下给出口径说明。
// ============================================================
import { color, fontSize, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import type { ComputedWeek, LifecyclePhase } from './forecastModel';
import { fmtMoney, fmtUnits } from './ForecastBits';

const PHASE_TEXT: Record<LifecyclePhase, string> = {
  launch: '首销',
  growth: '成长',
  mature: '成熟',
  decline: '衰退',
};

const thStyle = {
  position: 'sticky' as const,
  top: 0,
  background: color.canvas,
  fontSize: 11,
  fontWeight: 600,
  color: color.mute,
  textAlign: 'right' as const,
  padding: `6px 8px`,
  borderBottom: `1px solid ${color.hairline}`,
  whiteSpace: 'nowrap' as const,
};

const tdStyle = {
  fontSize: fontSize.bodySm,
  color: color.body,
  textAlign: 'right' as const,
  padding: `5px 8px`,
  borderBottom: `1px solid ${color.hairline}`,
  whiteSpace: 'nowrap' as const,
};

export default function WeeklyLedger({ weeks, currentWeekIndex }: { weeks: ComputedWeek[]; currentWeekIndex: number }) {
  return (
    <div style={{ display: 'grid', gap: space.sm }}>
      <div style={{ overflowX: 'auto', borderRadius: radius.control, border: `1px solid ${color.hairline}` }}>
        <table className="tnum" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780 }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            周度经营主账：每行一周，含实际与预测状态、无约束需求、可供量、SO、期末库存、单台销毛与事件。
          </caption>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left' }}>周次</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>状态</th>
              <th style={thStyle}>无约束需求（台）</th>
              <th style={thStyle}>可供量（台）</th>
              <th style={thStyle}>SO（台）</th>
              <th style={thStyle}>期末库存（台）</th>
              <th style={thStyle}>单台销毛</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>事件</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, index) => {
              const isCurrent = index === currentWeekIndex;
              return (
                <tr key={week.week} style={{ background: isCurrent ? selectSoft : undefined }}>
                  <td style={{ ...tdStyle, color: color.ink, fontWeight: isCurrent ? 600 : 400 }}>
                    <span className="mono">{week.week}</span>
                    {isCurrent && <span style={{ marginLeft: 6, fontSize: 10, color: selectSoftInk }}>当前</span>}
                    {week.draft && <span style={{ marginLeft: 6, fontSize: 10, color: color.warningInk }}>草稿</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    {week.status === 'actual' ? '实际' : '预测'}
                    <span style={{ marginLeft: 5, fontSize: 10, color: color.mute }}>{PHASE_TEXT[week.phase]}</span>
                  </td>
                  <td style={{ ...tdStyle, color: color.ink }}>{fmtUnits(week.unconstrainedDemand)}</td>
                  <td style={tdStyle}>
                    {fmtUnits(week.available)}
                    {week.stockout && <span style={{ marginLeft: 5, fontSize: 10, color: color.error }}>截断</span>}
                  </td>
                  <td style={{ ...tdStyle, color: color.ink, fontWeight: 600 }}>{fmtUnits(week.so)}</td>
                  <td style={tdStyle}>{fmtUnits(week.inventory)}</td>
                  <td style={tdStyle}>{fmtMoney(week.unitGrossMargin)}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', color: week.competitorEvent || week.promoIntensity > 0 ? color.body : color.mute }}>
                    {week.competitorEvent ?? (week.promoIntensity > 0 ? '促销窗口' : '—')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.6, color: color.mute }}>
        期末库存 = 期初库存 + Sell-in − SO（逐周递推）；DOS = 期末库存 ÷ 当周无约束需求 × 7 天。「截断」= 可供量低于无约束需求，SO 按可供量成交，不代表需求下降。
        单台销毛 = 公司净收入（价格 × 86%）− 单台成本；W15 起成本上调只影响销毛链。
      </div>
    </div>
  );
}
