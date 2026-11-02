// ============================================================
// 周度经营主账：24 行表，周次 / 历史或预测 / 无约束需求 / 可供量（截断标）/
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

const SOURCE_TEXT: Record<ComputedWeek['source'], string> = {
  observed: '观测 SO',
  model: '模型回填',
  forecast: '未来预测',
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

export default function WeeklyLedger({ weeks, currentWeekIndex, currency = 'USD' }: { weeks: ComputedWeek[]; currentWeekIndex: number; currency?: string }) {
  // 净收入率从账面周数据推导（公司净收入 / 价格），不写死 86%——fixture 调渠道费率后脚注随之更新。
  const netRatePct = weeks.length && weeks[0].price > 0 ? Math.round((weeks[0].companyNetRevenue / weeks[0].price) * 100) : 86;
  return (
    <div style={{ display: 'grid', gap: space.sm }}>
      <div style={{ overflowX: 'auto', borderRadius: radius.control, border: `1px solid ${color.hairline}` }}>
        <table className="tnum" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980 }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            周度经营主账：每行一周，含历史或预测状态、无约束需求、可供量、Sell-in、SO、期初与期末库存、单台销毛与事件。
          </caption>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left' }}>周次</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>状态</th>
              <th style={thStyle}>无约束需求（台）</th>
              <th style={thStyle}>可供量（台）</th>
              <th style={thStyle}>Sell-in（台）</th>
              <th style={thStyle}>来源</th>
              <th style={thStyle}>激励/台</th>
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
                    {week.status === 'actual' ? '历史段（模拟）' : '预测'}
                    <span style={{ marginLeft: 5, fontSize: 10, color: color.mute }}>{PHASE_TEXT[week.phase]}</span>
                  </td>
                  <td style={{ ...tdStyle, color: color.ink }}>{fmtUnits(week.unconstrainedDemand)}</td>
                  <td style={tdStyle}>
                    {fmtUnits(week.available)}
                    {week.stockout && <span style={{ marginLeft: 5, fontSize: 10, color: color.error }}>截断</span>}
                  </td>
                  <td style={tdStyle}>{fmtUnits(week.si)}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', color: week.source === 'observed' ? color.body : week.source === 'forecast' ? selectSoftInk : color.mute }}>{SOURCE_TEXT[week.source]}</td>
                  <td style={tdStyle}>{week.incentive > 0 ? fmtMoney(week.incentive, currency) : '—'}</td>
                  <td style={{ ...tdStyle, color: color.ink, fontWeight: 600 }}>{fmtUnits(week.so)}</td>
                  <td style={{ ...tdStyle, color: week.inventory < 0 ? color.error : undefined }}>
                    <span className="tnum" title={week.inventory < 0 ? '负期末库存：该情景下 Sell-in 计划低于成交（供给欠配），非数据错误' : undefined}>{fmtUnits(week.inventory)}</span>
                  </td>
                  <td style={tdStyle}>{fmtMoney(week.unitGrossMargin, currency)}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', color: week.competitorEvent || week.promoEvent ? color.body : color.mute }}>
                    {week.competitorEvent
                      ?? (week.promoEvent
                        ? (week.promoIntensity > 0 ? `促销 · ${week.promoEvent}` : `促销后回落 · ${week.promoEvent}`)
                        : '—')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.6, color: color.mute }}>
        期末库存 = 期初库存 + Sell-in − SO（逐周递推）；主账新增 Sell-in 以便逐周复核库存恒等式。DOS = 期末库存 ÷ 当周无约束需求 × 7 天。「截断」= 可供量低于无约束需求，SO 按可供量成交，不代表需求下降。
        期末库存为负 = 该情景（含 What-if 草稿）下 Sell-in 计划跟不上成交，是供给欠配信号而非数据错误。
        单台销毛 = 公司净收入（价格 × {netRatePct}%）− 单台成本 − 激励/台；激励仅在配置的促销周扣减销毛。来源列区分观测 SO、历史模型回填和未来预测。
      </div>
    </div>
  );
}
