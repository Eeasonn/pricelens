// ============================================================
// 因子与证据：每个因子的范围、窗口、形状、状态与证据来源。
// 固定先验 / 待学习 / 业务假设 / 方向性判断 / 确定性计算分开呈现；
// 竞品压力因子显式给出简单版边界（不自动判断扩盘 / 分流）。
// 窄视口（第一百九十轮窄屏审计 P1-1）：行网格最小列宽合计约 540px，
// 套用页内事件时间轴 / 周度主账同款局部横滚（容器 overflowX auto +
// 行 minWidth），保证卡内「形状 / 证据」文字完整可读、整页不横溢。
// ============================================================
import { color, fontSize, radius, selectSoftInk, space } from '../../theme/tokens';
import type { FactorProfile } from './forecastModel';
import type { ForecastFitRun } from './forecastLearning';
import { FactorStatusBadge } from './ForecastBits';

const confidenceTone: Record<FactorProfile['confidence'], string> = {
  高: selectSoftInk,
  中: color.body,
  低: color.warningInk,
};

/** 四列最小列宽合计 490 + 3×12 间隙 = 526；行 minWidth 给到 560 保证长形状文案不硬裁。 */
const FACTOR_ROW_MIN_WIDTH = 560;

export default function FactorEvidence({ factorProfiles, fit }: { factorProfiles: FactorProfile[]; fit?: ForecastFitRun }) {
  const parameterByFactor = new Map(fit?.parameters.map((parameter) => [parameter.factor, parameter]));
  return (
    <div role="group" aria-label="因子与证据" tabIndex={0} style={{ display: 'grid', gap: space.sm, overflowX: 'auto', paddingBottom: 4 }}>
      {fit && (
        <div style={{ padding: '8px 10px', borderRadius: radius.control, background: color.canvasSoft, color: color.body, fontSize: 11, lineHeight: 1.55 }}>
          <strong style={{ color: color.ink }}>学习状态：{fit.status === 'completed' ? '已完成' : fit.status === 'fallback' ? '证据不足，回退先验' : '无法拟合'}</strong>
          {' · '}拟合窗口 {fit.fitWindow.start}–{fit.fitWindow.end} · 总体有效样本 {fit.sampleCount} 周
          {fit.excluded.censored + fit.excluded.confounded + fit.excluded.missing > 0 && ` · 排除：删失 ${fit.excluded.censored}、混杂 ${fit.excluded.confounded}、缺失 ${fit.excluded.missing}`}
          {' · '}质量门槛：{fit.qualityGate.passed ? '通过' : '未通过'}
          {fit.metrics.rmse != null && ` · 留出 RMSE ${fit.metrics.rmse}`}
          {fit.metrics.coverage != null && ` · 区间覆盖 ${Math.round(fit.metrics.coverage * 100)}%`}
          {' · '}预测计算：{fit.appliedToForecast ? '已注入学习参数' : '仍使用固定先验（fit 仅审计）'}
          {fit.appliedToForecast && fit.residualLogScale != null && ' · 已输出 P10/P50/P90'}
          {fit.status !== 'completed' && <span style={{ color: color.warningInk }}> · 当前不输出可解释因果权重</span>}
        </div>
      )}
      {factorProfiles.map((factor) => (
        <div
          key={factor.key}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, 0.9fr) minmax(110px, 0.8fr) minmax(150px, 1.2fr) minmax(110px, 0.8fr)',
            gap: space.sm,
            padding: `${space.md - 2}px ${space.md}px`,
            border: `1px solid ${color.hairline}`,
            borderRadius: radius.control,
            minWidth: FACTOR_ROW_MIN_WIDTH,
          }}
        >
          <div>
            <div style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>{factor.label}</div>
            <div style={{ marginTop: 2, fontSize: 11, color: color.mute }}>{factor.scope}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: color.mute }}>窗口</div>
            <div style={{ marginTop: 2, fontSize: 12, color: color.body }}>{factor.window}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: color.mute }}>形状</div>
            <div style={{ marginTop: 2, fontSize: 12, color: color.body }}>{factor.shape}</div>
          </div>
          <div style={{ display: 'grid', gap: 6, alignContent: 'start', justifyItems: 'start' }}>
            <FactorStatusBadge status={factor.status} />
            <div style={{ fontSize: 11, color: color.mute }}>
              证据：{factor.evidence} · 置信度 <span style={{ color: confidenceTone[factor.confidence], fontWeight: 600 }}>{factor.confidence}</span>
              {factor.sampleCount != null && <> · 因子可用样本 {factor.sampleCount} 周</>}
              {factor.fitWindow && <> · 窗口 {factor.fitWindow}</>}
            </div>
            {(factor.key !== 'supply' ? parameterByFactor.get(factor.key) : undefined) && (() => {
              const parameter = factor.key !== 'supply' ? parameterByFactor.get(factor.key) : undefined;
              if (!parameter) return null;
              const interval = parameter.interval ? ` · 区间 ${parameter.interval[0]}–${parameter.interval[1]}` : '';
              return <div style={{ fontSize: 11, color: color.body }}>参数：{parameter.coefficient}（先验 {parameter.prior}）{interval}</div>;
            })()}
            {factor.fallback && <div style={{ fontSize: 11, color: color.warningInk }}>待学习：当前使用固定先验</div>}
          </div>
          {factor.boundary && (
            <div style={{ gridColumn: '1 / -1', padding: '7px 9px', borderRadius: radius.control, background: color.canvasSoft, fontSize: 11, lineHeight: 1.55, color: color.body }}>
              边界：{factor.boundary}{factor.exclusions ? ` · 排除：删失 ${factor.exclusions.censored}、混杂 ${factor.exclusions.confounded}、缺失 ${factor.exclusions.missing}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
