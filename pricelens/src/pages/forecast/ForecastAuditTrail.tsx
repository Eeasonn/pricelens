// ============================================================
// 量价预测 · 步间对比与因果记录（Batch 2 · 2026-11-07 · mockup C 第二面板）：
// 把「基线 → 大盘 → 库存 → 最终销毛」的连续变化放进同一条审计轨迹——
// 每步默认只露结论一行，展开可见 输入 / 假设 / 修正（含内联原因）/ 证据
// （数据状态 + 数据版本 + 采集时间，缺失写「待确认」）/ 公式 / 待补契约。
// 数字全部来自 forecastSteps 派生元数据（与主图、四卡同源），本卡不算
// 第二套数；「定位」按钮只滚动聚焦对应卡（与 PipelineNav 同一纪律）。
// 另承载：重算失败保留旧值 + 重试（页级守卫传入）、上下文指纹与全局筛选
// 漂移提醒（不把旧结果静默套到新国家/产品）、重算口径说明（本地确定性
// 引擎同步重算，无异步等待——不伪造 loading）。
// ============================================================
import { useState } from 'react';
import { color, radius, space } from '../../theme/tokens';
import type { ForecastStepResult, ForecastEvidenceStatus } from './forecastSteps';
import { HintInfo, SectionHead, workbenchCardStyle } from './WorkbenchBits';

/** 步骤计算状态 chip 文案与配色（文字承载语义，色不单独表意）。 */
const STEP_STATUS_VIEW: Record<ForecastStepResult['status'], { label: string; bg: string; fg: string }> = {
  ready: { label: '可计算', bg: color.canvasSoft2, fg: color.body },
  partial: { label: '部分可算', bg: color.warningSoft, fg: color.warningInk },
  pending: { label: '待接入', bg: color.canvasSoft2, fg: color.mute },
  cannot_compute: { label: '无法计算', bg: color.alert.ownGap.bg, fg: color.alert.ownGap.fg },
};

const EVIDENCE_STATUS_LABEL: Record<ForecastEvidenceStatus, string> = {
  real: '真实',
  simulated: '模拟',
  mixed: '混合',
  pending: '待接入',
  missing: '缺失',
};

function StatusChip({ label, bg, fg, title }: { label: string; bg: string; fg: string; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill,
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: bg, color: fg,
        border: `1px solid ${bg === color.canvasSoft2 ? color.hairline : 'transparent'}`,
      }}
    >
      {label}
    </span>
  );
}

/** 证据行：label · 来源 · 状态 chip · 数据版本（mono）· 采集时间（缺失 = 待确认）。 */
function EvidenceRow({ evidence }: { evidence: ForecastStepResult['evidence'][number] }) {
  return (
    <div data-audit-evidence={evidence.id} style={{ display: 'grid', gap: 2, padding: '4px 0', borderBottom: `1px solid ${color.hairline}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: color.ink, fontWeight: 600, minWidth: 0 }}>{evidence.label}</span>
        <StatusChip label={EVIDENCE_STATUS_LABEL[evidence.status]} bg={color.canvasSoft2} fg={color.mute} />
      </div>
      <div className="tnum" style={{ fontSize: 11, color: color.mute, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>来源：{evidence.source}</span>
        <span>数据版本：{evidence.dataVersion ?? '待确认'}</span>
        <span>采集时间：{evidence.capturedAt ?? '待确认'}</span>
      </div>
    </div>
  );
}

/** 单步行：结论默认露出；展开 = 五要素 + 公式 + 待补契约；Esc 收起。 */
function StepRow({
  step,
  onLocate,
}: {
  step: ForecastStepResult;
  onLocate: (step: ForecastStepResult['step']) => void;
}) {
  const [open, setOpen] = useState(false);
  const statusView = STEP_STATUS_VIEW[step.status];
  const detailLabelStyle = { fontSize: 11, fontWeight: 600, color: color.mute, letterSpacing: '0.05em' } as const;
  return (
    <div
      data-audit-step={step.step}
      style={{
        display: 'grid', gap: 6, padding: '9px 0',
        borderBottom: `1px solid ${color.hairline}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' }}>
        <span className="mono tnum" style={{ fontSize: 11, color: color.mute, flex: 'none' }}>{`STEP 0${step.step}`}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: color.ink, flex: 'none' }}>{step.title}</span>
        <StatusChip label={statusView.label} bg={statusView.bg} fg={statusView.fg} title={step.statusText} />
        <span
          className="tnum"
          style={{ fontSize: 12, color: step.tone === 'amber' ? color.warningInk : color.body, minWidth: 0 }}
        >
          {step.conclusion}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, flex: 'none' }}>
          <button
            type="button"
            data-audit-toggle={step.step}
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
            style={{
              border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvas,
              color: color.body, fontSize: 11, padding: '2px 10px', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            {open ? '收起' : '展开'}
          </button>
          <button
            type="button"
            data-audit-locate={step.step}
            title={`滚动定位到本步对应卡（只定位与聚焦，不重算、不改参数）`}
            onClick={() => onLocate(step.step)}
            style={{
              border: 'none', background: 'transparent', color: color.link, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', padding: '2px 4px', font: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            定位
          </button>
        </span>
      </div>
      {open && (
        <div
          data-audit-detail={step.step}
          onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
          style={{ display: 'grid', gap: 10, padding: `${space.sm}px ${space.md}px`, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft, minWidth: 0 }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={detailLabelStyle}>输入（前一步输出 = 本步输入）</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.7, color: color.body }}>
              {step.inputs.map((input) => <li key={input}>{input}</li>)}
            </ul>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={detailLabelStyle}>假设</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.7, color: color.body }}>
              {step.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
            </ul>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={detailLabelStyle}>修正（含内联原因 · 取消不写入）</div>
            {step.adjustments.length === 0 ? (
              <div style={{ fontSize: 11.5, color: color.mute }}>本步暂无人工修正</div>
            ) : (
              <div style={{ display: 'grid', gap: 3 }}>
                {step.adjustments.map((adjustment) => (
                  <div
                    key={adjustment.key}
                    data-audit-adjustment={adjustment.key}
                    className="tnum"
                    style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11.5, color: color.body }}
                  >
                    <span style={{ color: color.ink, fontWeight: 600, minWidth: 0 }}>{adjustment.label}</span>
                    <span style={{ color: color.mute }}>{`原因：${adjustment.reason}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={detailLabelStyle}>证据（数据状态 · 数据版本 · 采集时间）</div>
            <div style={{ minWidth: 0 }}>
              {step.evidence.map((evidence) => <EvidenceRow key={evidence.id} evidence={evidence} />)}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={detailLabelStyle}>计算关系（可复核）</div>
            <div className="tnum" style={{ fontSize: 11.5, lineHeight: 1.7, color: color.body }}>{step.formula}</div>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={detailLabelStyle}>数据状态与待补契约</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.7, color: color.body }}>{step.statusText}</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.7, color: color.mute }}>
              {step.missingFields.map((field) => <li key={field}>{field}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ForecastAuditTrail({
  steps,
  contextFingerprint,
  contextStaleNote,
  computeError,
  onRetryCompute,
  onLocate,
}: {
  steps: ForecastStepResult[];
  /** 推演上下文指纹（国家/产业/渠道/产品/模型版本哈希；换国/换产品后比对防旧结果套用）。 */
  contextFingerprint: string;
  /** 全局筛选与固定样本漂移提醒（页级派生；null = 一致不显示）。 */
  contextStaleNote?: string | null;
  /** 重算失败信息（页级守卫；null = 正常；失败时保留上次结果）。 */
  computeError: string | null;
  onRetryCompute: () => void;
  /** 定位回调（只滚动聚焦对应卡，与 PipelineNav 同一纪律）。 */
  onLocate: (step: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <section
      data-lpl-audit-trail=""
      style={workbenchCardStyle}
    >
      <SectionHead
        title="步间对比与因果记录"
        hint="基线 → 大盘 → 库存 → 销毛的连续变化与人工修正审计；数字与主图、四卡同源。本地确定性引擎同步重算（无异步等待）；重算失败保留上次结果并可重试。"
        extra={<>
          <HintInfo
            label="审计卡说明"
            text="每步展开可见输入（前一步输出 = 本步输入）、假设、修正（均含内联原因，取消不写入）、证据（数据状态/数据版本/采集时间，缺失写「待确认」）、公式与待补契约。不展示任何未经契约的置信度百分比；预测区间仅写「范围示意/待接入」。"
          />
          <span
            className="mono"
            title={`当前推演上下文指纹（国家/产业/渠道/产品/模型版本）：${contextFingerprint}。换国家或产品后请以此指纹比对，不把旧结果静默套用到新范围。`}
            style={{
              fontSize: 11, color: color.body, padding: '2px 8px',
              border: `1px solid ${color.hairline}`, borderRadius: radius.control, whiteSpace: 'nowrap',
            }}
          >
            {`上下文 ${contextFingerprint}`}
          </span>
        </>}
      />
      {computeError != null && (
        <div
          role="alert"
          data-audit-compute-error=""
          style={{
            display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap',
            padding: `6px ${space.md}px`, marginBottom: space.sm,
            border: `1px solid ${color.warning}`, borderRadius: radius.control,
            background: color.warningSoft, fontSize: 12, color: color.warningInk,
          }}
        >
          <span>{`重算失败：${computeError} · 已保留上次成功结果（主图与摘要未变，失败不当 0）`}</span>
          <button
            type="button"
            onClick={onRetryCompute}
            style={{
              marginLeft: 'auto', border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control,
              background: color.canvas, color: color.ink, fontSize: 11.5, fontWeight: 600,
              padding: '3px 12px', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            重试
          </button>
        </div>
      )}
      {contextStaleNote != null && (
        <div
          role="status"
          data-audit-context-stale=""
          style={{
            padding: `4px ${space.md}px`, marginBottom: space.sm,
            border: `1px solid ${color.hairline}`, borderRadius: radius.control,
            background: color.canvasSoft2, fontSize: 11.5, color: color.body,
          }}
        >
          {`${contextStaleNote}；本页为固定样本，换国后请回到全局筛选切换并以指纹比对上下文`}
        </div>
      )}
      <div style={{ display: 'grid', minWidth: 0 }}>
        {steps.map((step) => <StepRow key={step.step} step={step} onLocate={onLocate} />)}
      </div>
    </section>
  );
}
