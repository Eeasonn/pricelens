// ============================================================
// 统一证据浮框外壳（forecast-global-ia-review B.5.3 · 任务 7）：
// 四层结构 = [对象 / 时间 + 状态标] → [条件 notices] → [证据三件套（业务
// 内容，由调用方传入）] → [动作]。外壳固定白底（color.canvas）+ hairline +
// radius.card + shadow.l5；正文 12px、元数据 11px、数字走 tnum。
// 交互基线：hover/focus 出证据（预览态由调用方传 role='status'）、
// click/Enter 固定（role='dialog'）、编辑态保持打开（粘滞由调用方状态机
// 承接）；Esc 由外壳先回证据 / 关闭（onClose），关闭按钮有可访问名称。
// EvidenceFrame 只管外壳与层序，不算数、不取数——大盘浮框
// （MonthEvidencePopover）是本外壳的交互标杆与实现参照，业务内容全部来自
// 调用方传入（B.5.3：不得为了组件复用而强塞同一小图）。
// ============================================================
import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { color, radius, shadow, space } from '../../theme/tokens';

/** B.5.3 契约（title / status / notices / children / actions / onClose / width / flip）
 *  + 外壳角色 / 可访问名称 / 透传属性（预览态 role='status'，固定态 role='dialog'）。 */
export interface EvidenceFrameProps {
  /** 头部对象 / 时间（同时 = 浮框可访问名称的来源）。 */
  title: string;
  /** 头部右侧状态标（AI 基线 / 人工确认 / 仅历史等，ReactNode 原样渲染）。 */
  status?: ReactNode;
  /** 条件状态一行一条（含事件、含手调、缺数、样本不足、成本版本等）。 */
  notices?: string[];
  /** 证据三件套（来源小图 / 事实 / 算例 / 学习规则）——业务内容由调用方组装。 */
  children?: ReactNode;
  /** 动作层（调整此周 / 定位来源 / 还原基线等）。 */
  actions?: ReactNode;
  onClose: () => void;
  width?: number;
  /** 锚点在图右半区时左翻（与主图 / 大盘浮框同款翻转语言）。 */
  flip?: boolean;
  /** 外壳角色：固定证据 = 'dialog'（默认）；hover 预览 = 'status'。 */
  role?: 'dialog' | 'status';
  /** 可访问名称；缺省 = title。 */
  ariaLabel?: string;
  /** 其余外壳属性（data-* 等）。 */
  shellProps?: Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'aria-label'>;
}

/**
 * 统一证据浮框外壳：白底 + hairline + radius.card + shadow.l5，正文 12px、
 * 元数据 11px、数字 tnum；层序固定 头部 → notices → 内容 → 动作。
 * Esc：外壳内按 Esc 调 onClose（调用方状态机决定「回证据」还是「关闭」——
 * B.5.3：编辑态先回证据，再按一次关闭）。
 */
export default function EvidenceFrame({
  title,
  status,
  notices,
  children,
  actions,
  onClose,
  width = 300,
  flip = false,
  role = 'dialog',
  ariaLabel,
  shellProps,
}: EvidenceFrameProps) {
  const [closeHover, setCloseHover] = useState(false);
  const { style: shellStyle, ...restShell } = shellProps ?? {};
  return (
    <div
      {...restShell}
      role={role}
      aria-label={ariaLabel ?? title}
      aria-live={role === 'status' ? 'polite' : undefined}
      onKeyDown={(event) => {
        shellProps?.onKeyDown?.(event);
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      style={{
        position: 'absolute', top: 0, zIndex: 6,
        width, maxWidth: 'calc(100vw - 24px)',
        transform: flip ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
        background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card,
        boxShadow: shadow.l5, padding: `${space.md - 2}px ${space.md}px`,
        fontSize: 12, lineHeight: 1.6, color: color.body, minWidth: 0,
        ...shellStyle,
      }}
    >
      {/* 层① 头部：对象 / 时间 + 状态标 + 关闭（可访问名称） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, paddingRight: 16 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: color.ink }}>{title}</span>
        {status != null && (
          <span style={{ fontSize: 12, color: color.mute, textAlign: 'right', minWidth: 0 }}>{status}</span>
        )}
      </div>
      <button
        type="button"
        aria-label={`关闭 ${ariaLabel ?? title}`}
        onClick={onClose}
        onMouseEnter={() => setCloseHover(true)}
        onMouseLeave={() => setCloseHover(false)}
        style={{
          position: 'absolute', top: 2, right: 4, border: 'none', background: 'transparent',
          color: closeHover ? color.ink : color.mute, fontSize: 12, lineHeight: 1.2, cursor: 'pointer', padding: 2,
        }}
      >
        ×
      </button>
      {/* 层② 条件 notices（一行一条，11px，琥珀墨色） */}
      {notices != null && notices.length > 0 && (
        <div data-lpl-evidence-notices style={{ marginTop: 3, fontSize: 12, color: color.warningInk }}>
          {notices.map((notice) => (
            <div key={notice} className="tnum">{notice}</div>
          ))}
        </div>
      )}
      {/* 层③ 证据三件套（业务内容，调用方组装；数字 tnum） */}
      {children != null && (
        <div className="tnum" style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 8, paddingTop: 8, display: 'grid', gap: 6 }}>
          {children}
        </div>
      )}
      {/* 层④ 动作 */}
      {actions != null && (
        <div style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
