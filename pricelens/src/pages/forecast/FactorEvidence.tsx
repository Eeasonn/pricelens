// ============================================================
// 因子与证据：每个因子的范围、窗口、形状、状态与证据来源。
// 模型学习 / 业务假设 / 方向性判断 / 确定性计算分开呈现；
// 竞品压力因子显式给出简单版边界（不自动判断扩盘 / 分流）。
// 窄视口（第一百九十轮窄屏审计 P1-1）：行网格最小列宽合计约 540px，
// 套用页内事件时间轴 / 周度主账同款局部横滚（容器 overflowX auto +
// 行 minWidth），保证卡内「形状 / 证据」文字完整可读、整页不横溢。
// ============================================================
import { color, fontSize, radius, selectSoftInk, space } from '../../theme/tokens';
import type { FactorProfile } from './forecastModel';
import { FactorStatusBadge } from './ForecastBits';

const confidenceTone: Record<FactorProfile['confidence'], string> = {
  高: selectSoftInk,
  中: color.body,
  低: color.warningInk,
};

/** 四列最小列宽合计 490 + 3×12 间隙 = 526；行 minWidth 给到 560 保证长形状文案不硬裁。 */
const FACTOR_ROW_MIN_WIDTH = 560;

export default function FactorEvidence({ factorProfiles }: { factorProfiles: FactorProfile[] }) {
  return (
    <div role="group" aria-label="因子与证据" tabIndex={0} style={{ display: 'grid', gap: space.sm, overflowX: 'auto', paddingBottom: 4 }}>
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
            </div>
          </div>
          {factor.boundary && (
            <div style={{ gridColumn: '1 / -1', padding: '7px 9px', borderRadius: radius.control, background: color.canvasSoft, fontSize: 11, lineHeight: 1.55, color: color.body }}>
              边界：{factor.boundary}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
