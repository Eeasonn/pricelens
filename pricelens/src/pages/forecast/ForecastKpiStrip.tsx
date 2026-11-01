// ============================================================
// 经营摘要 KPI 条：当前周 SO / 无约束需求 / 期末库存 + DOS / 累计销毛 / 当前判断。
// 数值全部来自确定性计算；风险用文字判断 + 注释，不只用颜色。
// ============================================================
import { color, fontSize, radius, space } from '../../theme/tokens';
import type { ForecastComputation } from './forecastModel';
import { fmtMoney, fmtUnits } from './ForecastBits';

export default function ForecastKpiStrip({ computation }: { computation: ForecastComputation }) {
  const { kpi, current } = computation;
  const riskTone = kpi.risk.label === '无显著风险' ? color.body : kpi.risk.label === '供给截断' ? color.error : color.warningInk;
  const cells: { label: string; value: string; foot: string }[] = [
    { label: `当前周 SO（${current.week}）`, value: `${fmtUnits(kpi.so)} 台`, foot: `${current.status === 'actual' ? '实际周' : '预测周'} · 成交口径` },
    { label: '无约束需求', value: `${fmtUnits(kpi.unconstrainedDemand)} 台`, foot: '模型点估计（P50）· 简单版' },
    { label: '期末库存', value: `${fmtUnits(kpi.inventory)} 台`, foot: `DOS ${kpi.dos} 天 · 按当周需求折算` },
    { label: '累计销毛（W1–W24）', value: fmtMoney(kpi.cumulativeGrossMargin), foot: '实际 + 预测 · USD 模拟' },
  ];
  return (
    <div role="group" aria-label="经营摘要" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: space.md }}>
      {cells.map((cell) => (
        <div key={cell.label} style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: `${space.md - 2}px ${space.md}px` }}>
          <div style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>{cell.label}</div>
          <strong className="tnum" style={{ display: 'block', marginTop: 4, fontSize: 17, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{cell.value}</strong>
          <div style={{ marginTop: 3, fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>{cell.foot}</div>
        </div>
      ))}
      <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: `${space.md - 2}px ${space.md}px` }}>
        <div style={{ fontSize: fontSize.caption, color: color.mute }}>当前主要风险</div>
        <strong style={{ display: 'block', marginTop: 4, fontSize: 15, fontWeight: 600, color: riskTone }}>{kpi.risk.label}</strong>
        <div style={{ marginTop: 3, fontSize: 11, color: color.mute }}>{kpi.risk.note}</div>
      </div>
    </div>
  );
}
