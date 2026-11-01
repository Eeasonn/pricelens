// ============================================================
// 量价预测（简单版）共享展示件：数据状态徽标、因子状态徽标、数字格式。
// 颜色全部来自 src/theme/tokens.ts，状态一律「文字 + 色」双通道表达。
// ============================================================
import type { CSSProperties } from 'react';
import { color, fontSize, formatPrice, radius, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import type { DataStatus, FactorStatus } from './forecastModel';

/** 页面白卡通用样式（L1 阴影 + 8px 圆角）。 */
export const forecastCardStyle: CSSProperties = {
  background: color.canvas,
  borderRadius: radius.card,
  boxShadow: shadow.l1,
  padding: space.lg,
  minWidth: 0,
};

export const dataStatusText: Record<DataStatus, string> = {
  real: '真实数据',
  simulated: '模拟数据',
  mixed: '混合数据',
};

/** 数据状态徽标：simulated/real/mixed 用琥珀 / 灰 / 琥珀文字表达，不新增色值。 */
export function DataStatusBadge({ status }: { status: DataStatus }) {
  const simulated = status === 'simulated';
  const mixed = status === 'mixed';
  const style: CSSProperties = simulated || mixed
    ? { background: color.warningSoft, color: color.warningInk }
    : { background: color.canvasSoft2, color: color.body };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill, fontSize: fontSize.caption, fontWeight: 600, whiteSpace: 'nowrap', ...style }}>
      {dataStatusText[status]}
      <span aria-hidden style={{ marginLeft: 4, fontSize: 10, fontFamily: 'inherit' }}>{`· ${status}`}</span>
    </span>
  );
}

const factorStatusStyle: Record<FactorStatus, CSSProperties> = {
  模型学习: { background: selectSoft, color: selectSoftInk },
  业务假设: { background: color.warningSoft, color: color.warningInk },
  方向性判断: { background: color.canvasSoft2, color: color.body },
  确定性计算: { background: color.canvas, color: color.ink, border: `1px solid ${color.hairlineStrong}` },
};

/** 因子状态徽标：模型学习 / 业务假设 / 方向性判断 / 确定性计算。 */
export function FactorStatusBadge({ status }: { status: FactorStatus }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px', borderRadius: radius.pill, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', ...factorStatusStyle[status] }}>
      {status}
    </span>
  );
}

/** 台数：千分位，不带单位（列头带单位）。 */
export const fmtUnits = (value: number): string => value.toLocaleString('en-US');

/** 金额（演示 fixture 为 USD）。 */
export const fmtMoney = (value: number): string => formatPrice(Math.round(value), 'usd');

/** 带符号百分比：+5.0% / −12.0%。 */
export const fmtSignedPct = (value: number, digits = 1): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}%`;

/** 竞品压力（负 = 对华为不利）。 */
export const fmtPressure = (value: number): string => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(1)}%`;
