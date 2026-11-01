// ============================================================
// 本周预测变化：基线 → 价格 → 促销 → 竞品 → 供给截断的贡献拆解。
// 各台阶逐步取整后严格可加（见 forecastModel）；每一行带状态徽标
// （模型学习 / 业务假设 / 方向性判断 / 确定性计算），不把相关写成因果。
// ============================================================
import { color, fontSize, radius, space } from '../../theme/tokens';
import type { DriverContribution, ForecastComputation } from './forecastModel';
import { FactorStatusBadge, fmtSignedPct, fmtUnits } from './ForecastBits';

const barColorOf = (driver: DriverContribution): string => {
  if (driver.key === 'baseline') return color.hairlineStrong;
  if (driver.key === 'competitor') return color.warning;
  if (driver.key === 'supply') return color.error;
  return color.link;
};

export default function DriverWaterfall({ computation }: { computation: ForecastComputation }) {
  const { drivers, current } = computation;
  const maxAbs = Math.max(1, ...drivers.map((driver) => Math.abs(driver.value)));
  const withoutSupply = drivers.filter((driver) => driver.key !== 'supply');
  const toUnconstrained = withoutSupply.reduce((total, driver) => total + driver.value, 0);
  return (
    <div style={{ display: 'grid', gap: space.md }}>
      <div role="group" aria-label={`${current.week} 预测变化因子拆解`} style={{ display: 'grid', gap: space.md }}>
        {drivers.map((driver) => {
          const width = Math.max(driver.key === 'baseline' ? 6 : 2, (Math.abs(driver.value) / maxAbs) * 100);
          return (
            <div key={driver.key} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>{driver.label}</span>
                <FactorStatusBadge status={driver.status} />
                <span className="tnum" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: driver.value < 0 ? color.error : color.ink, whiteSpace: 'nowrap' }}>
                  {driver.key === 'baseline' ? fmtUnits(driver.value) : `${driver.value > 0 ? '+' : driver.value < 0 ? '−' : ''}${fmtUnits(Math.abs(driver.value))}`} 台
                </span>
              </div>
              <div aria-hidden style={{ height: 10, borderRadius: radius.pill, background: color.canvasSoft2, overflow: 'hidden' }}>
                <div style={{ width: `${width}%`, height: '100%', background: barColorOf(driver), borderRadius: radius.pill }} />
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: color.mute }}>{driver.note}</div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '9px 11px', border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft, fontSize: 12, lineHeight: 1.65, color: color.body }}>
        <span className="tnum">
          基线 {fmtUnits(drivers[0].value)} 台 → 无约束需求 {fmtUnits(toUnconstrained)} 台（价格 / 促销 / 竞品逐级相加，实际 {fmtUnits(current.unconstrainedDemand)} 台，尾差为逐步取整）→ SO {fmtUnits(current.so)} 台。
        </span>
        本拆解供业务核对，方向性条目不代表因果证明。
      </div>
      <div style={{ padding: '9px 11px', borderLeft: `2px solid ${color.warning}`, background: color.warningSoft, borderRadius: `0 ${radius.control} ${radius.control} 0`, fontSize: 12, lineHeight: 1.65, color: color.warningInk }}>
        <strong>竞品上市 · 方向性判断：</strong>简单版只将其作为华为份额压力，扩盘比例待验证。默认上市后 6 周冲击逐周递减（当前周压力 {fmtSignedPct(current.competitorPressure * 100)}）。
      </div>
    </div>
  );
}
