// ============================================================
// 量价预测 · 推演工作台共享展示件：卡头、chip、链路条（FlowBar）、
// 图例（SuppLegend 规格）、数字格式。颜色全部来自 src/theme/tokens.ts；
// 状态一律「文字 + 底色」双通道。
// 图例规格（与主线 volume/SuppLegend 对齐）：图外底部居中行、roundRect 色块
// 14×8 或线/虚线/▼ 形态、12px color.body、点击切换系列显隐、隐藏态
// opacity .45 + aria-pressed。
// 2026-11-05 任务 6（IA 评审 2.3 B/C）：链路条 FlowBar 上收共享并去节点编号——
// 页级管线已用①–④编号（PipelineNav），卡内链路不再编第二套 1–5 号
// （库存卡 3a–3e / 成本卡 4a–4d 的编号方案一并作废，直接无编号）。
// ============================================================
import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { color, motion, radius, space } from '../../theme/tokens';

/** 页面白卡通用样式（与 ForecastBits.forecastCardStyle 同语言）。 */
export const workbenchCardStyle: CSSProperties = {
  background: color.canvas,
  borderRadius: radius.card,
  boxShadow: `inset 0 0 0 1px ${color.hairline}`,
  padding: space.lg,
  minWidth: 0,
};

/** 卡片头：标题 + 副标（口径说明收这里）+ 右侧插槽。图上只留数据与控件。 */
export function SectionHead({ title, hint, extra }: { title: string; hint?: string; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: space.md, marginBottom: space.md, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>{title}</h2>
        {hint && <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.6, color: color.mute }}>{hint}</div>}
      </div>
      {extra && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>{extra}</div>}
    </div>
  );
}

/** AI 推测标注 / 轻量模拟标识已退役（2026-11-05 Eason 第 7 条）：卡头说明性
 *  chip（「模拟」「AI 推测 · 可改」「模拟历史」）统一收进 ？号 HintInfo 承载，
 *  说明文案不占卡头空间；页首 DataStatusBadge 一处保留页级分级。 */

/** ？号说明图标（2026-11-05 Eason 第 7 条）：卡头说明性 chip（「模拟」「AI 推测 ·
 *  可改」等）退役为单个 ？图标，说明文案收 title（hover / focus 可读），不占
 *  卡头空间。视觉 = 14px 圆形 hairline 描边 + mute 色「?」，不新增视觉语言。 */
export function HintInfo({ text, label = '说明' }: { text: string; label?: string }) {
  return (
    <span
      title={text}
      aria-label={label}
      tabIndex={0}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: radius.pill, flex: 'none',
        border: `1px solid ${color.hairline}`, color: color.mute,
        fontSize: 10, fontWeight: 600, lineHeight: 1, cursor: 'help', userSelect: 'none',
      }}
    >?</span>
  );
}

/** 输入/输出标注条（纲领：每张卡「输入 → 输出影响主图什么」一眼可读）。 */
export function IoBar({ input, output }: { input: string; output: string }) {
  const row = (label: string, text: string, strong: boolean) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
      <span
        style={{
          flex: 'none', fontSize: 12, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
          background: strong ? color.canvasSoft2 : color.canvas, border: `1px solid ${color.hairline}`, color: color.body,
        }}
      >{label}</span>
      <span style={{ fontSize: 12, color: strong ? color.ink : color.body, minWidth: 0 }}>{text}</span>
    </span>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', alignItems: 'center', marginTop: -2, marginBottom: space.sm }}>
      {row('输入', input, false)}
      <span aria-hidden style={{ color: color.hairlineStrong }}>→</span>
      {row('输出', output, true)}
    </div>
  );
}

/** 「演示」琥珀 chip 已退役（WP6 8.3 Step 2）：页首 = DataStatusBadge 一处；
 *  2026-11-05 起卡级说明也统一收 HintInfo ？号（SimChip 一并退役）。 */

// ------------------------------------------------------------
// 共享收起区（2026-11-05 视觉精简二轮）：卡内次级信息默认收起为一条
// 「▸ 标签」细条（canvasSoft2 底 + hairline 描边 + 12px 标签 + chevron），
// 展开显示内容；不用 antd Collapse，不新增视觉语言（颜色 / 圆角 / 字号 /
// 动效全部取既有 token）。默认非受控 useState（默认收起，组件内存态——
// 不持久化，每次进页回到最净状态）；可选受控（open + onToggle）供布局随
// 开合切换的场景（如大盘卡 grid 切单列）。收起时不渲染内容（children 卸载）。
// ------------------------------------------------------------
export function CollapsibleSection({
  label,
  open,
  onToggle,
  defaultOpen = false,
  children,
}: {
  /** 收起头标签（12px；同时是头按钮的可访问名称）。 */
  label: string;
  /** 受控开合（可选；缺省走内部 useState）。 */
  open?: boolean;
  /** 开合回调（受控必配；非受控也会回调，便于父级感知）。 */
  onToggle?: (next: boolean) => void;
  /** 非受控初始态（默认收起）。 */
  defaultOpen?: boolean;
  /** 展开内容；收起时不渲染。缺省 = 仅渲染头（纯开关用法）。 */
  children?: ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const expanded = open ?? uncontrolled;
  const toggle = () => {
    if (open == null) setUncontrolled((prev) => !prev);
    onToggle?.(!expanded);
  };
  return (
    <div data-collapsible-section={label} data-open={expanded ? 'true' : undefined} style={{ minWidth: 0 }}>
      <button
        type="button"
        data-collapsible-toggle=""
        aria-expanded={expanded}
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '3px 10px', border: `1px solid ${color.hairline}`, borderRadius: radius.control,
          background: color.canvasSoft2, cursor: 'pointer', font: 'inherit', textAlign: 'left',
        }}
      >
        <span
          aria-hidden
          style={{
            flex: 'none', fontSize: 10, lineHeight: 1, color: color.mute,
            transform: expanded ? 'rotate(90deg)' : 'none', transition: `transform ${motion.fast}ms`,
          }}
        >
          ▸
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: color.body, whiteSpace: 'nowrap' }}>{label}</span>
      </button>
      {expanded && children != null && (
        <div data-collapsible-body="" style={{ marginTop: space.sm, minWidth: 0 }}>{children}</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 链路指示条（FlowBar · 卡内共享）：贴 IoBar 的「输入 → 输出」小 chip + →
// 分隔语言，节点状态「文字 + 底色」双通道；琥珀只用于库存修正语义
//（PRODUCT.md：amber = 档期 / 库存修正 / 预警）。节点无编号：页级管线
// ①–④（PipelineNav）是唯一编号体系，卡内链路不重号（IA 评审 2.3 B/C）。
// ------------------------------------------------------------
export type FlowStepState = 'base' | 'active' | 'amber' | 'muted';

export interface FlowStep {
  label: string;
  /** 节点前分隔符（默认 →；「+」表并列输入）。 */
  join?: string;
  /** 节点补充注记（如 2026W46 起 / 未触发 / 不回写主图）。 */
  note?: string;
  /** 口径 / 公式收 title，不进正文。 */
  title?: string;
  state?: FlowStepState;
}

export const FLOW_STEP_STYLE: Record<FlowStepState, CSSProperties> = {
  base: { background: color.canvas, border: `1px solid ${color.hairline}`, color: color.body },
  active: { background: color.ink, border: `1px solid ${color.ink}`, color: color.onPrimary },
  amber: { background: color.warningSoft, border: `1px solid ${color.warning}`, color: color.warningInk },
  muted: { background: color.canvasSoft2, border: `1px solid ${color.hairline}`, color: color.mute },
};

export function FlowBar({ ariaLabel, steps }: { ariaLabel: string; steps: FlowStep[] }) {
  return (
    <div
      data-flow-bar=""
      aria-label={ariaLabel}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', marginBottom: space.sm }}
    >
      {steps.map((step, index) => {
        const state = step.state ?? 'base';
        return (
          <Fragment key={step.label}>
            {index > 0 && (
              <span aria-hidden style={{ color: color.hairlineStrong, fontSize: 11 }}>{step.join ?? '→'}</span>
            )}
            <span
              data-flow-step={step.label}
              data-state={state}
              title={step.title}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px',
                borderRadius: radius.control, fontSize: 12, whiteSpace: 'nowrap',
                fontWeight: state === 'base' ? 400 : 600,
                ...FLOW_STEP_STYLE[state],
              }}
            >
              {step.label}
              {step.note && <span style={{ fontWeight: 600 }}>{step.note}</span>}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// 图例（SuppLegend 规格）
// ------------------------------------------------------------

export type LegendShape = 'rect' | 'rectDash' | 'rectAmber' | 'line' | 'dash' | 'marker';

export interface LegendItem {
  /** 系列 key；无 key = 纯说明项（不可点击、不参与显隐）。 */
  key?: string;
  label: string;
  shape: LegendShape;
  color: string;
}

function LegendGlyph({ item }: { item: LegendItem }) {
  if (item.shape === 'line' || item.shape === 'dash') {
    return <span aria-hidden style={{ display: 'inline-block', width: 14, borderTop: `${item.shape === 'dash' ? '2px dashed' : '2px solid'} ${item.color}`, marginRight: 6, verticalAlign: 'middle' }} />;
  }
  if (item.shape === 'marker') {
    return <span aria-hidden style={{ display: 'inline-block', width: 14, textAlign: 'center', marginRight: 6, color: item.color, fontSize: 10, lineHeight: 1, verticalAlign: 'middle' }}>▼</span>;
  }
  const amber = item.shape === 'rectAmber';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block', width: 14, height: 8, borderRadius: 2, marginRight: 6, verticalAlign: 'middle',
        background: item.shape === 'rect' ? item.color : color.canvas,
        border: amber ? `1px dashed ${item.color}` : `1px solid ${item.color}`,
        boxSizing: 'border-box',
      }}
    />
  );
}

/** 图外底部居中行图例：带 key 的项点击切换系列显隐（aria-pressed + 隐藏态
 *  opacity .45）。无可点击项（全部为纯说明项 / 未接 onToggle）时，可访问
 *  名称不写「点击切换」（WP6 8.3 Step 9：语义与行为一致）。 */
export function WorkbenchLegend({
  items,
  hidden,
  onToggle,
  style,
}: {
  items: LegendItem[];
  hidden: ReadonlySet<string>;
  onToggle?: (key: string) => void;
  style?: CSSProperties;
}) {
  const toggleable = onToggle != null && items.some((item) => item.key != null);
  return (
    <div role="group" aria-label={toggleable ? '图例（点击切换系列显隐）' : '图例'} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 14px', fontSize: 12, color: color.body, marginTop: space.sm, ...style }}>
      {items.map((item) => {
        const key = item.key;
        if (!key) {
          return (
            <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <LegendGlyph item={item} />
              {item.label}
            </span>
          );
        }
        const isHidden = hidden.has(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={!isHidden}
            onClick={() => onToggle?.(key)}
            style={{
              display: 'inline-flex', alignItems: 'center', padding: '2px 4px', border: 'none', background: 'transparent',
              font: 'inherit', fontSize: 12, color: color.body, cursor: 'pointer', borderRadius: radius.control,
              opacity: isHidden ? 0.45 : 1,
            }}
          >
            <LegendGlyph item={item} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// 数字格式（台 ↔ 万台 / 万美元 / 百万美元）
// ------------------------------------------------------------

/** 台 → 万台展示（1 位小数）。 */
export const fmtWan = (units: number | null | undefined): string =>
  units == null ? '—' : `${(units / 10000).toFixed(1)} 万台`;

/** 台 → 万台数值（不带单位，轴刻度用）。 */
export const wanOf = (units: number): number => Math.round((units / 10000) * 10) / 10;

/** USD → 百万美元展示（$12.3M）。 */
export const fmtMillionUsd = (usd: number): string => `$${(usd / 1e6).toFixed(1)}M`;

/** USD → 万美元（轴刻度用）。 */
export const wanUsdOf = (usd: number): number => Math.round(usd / 1e4);

/** 带符号百分比（+8% / −6%）。 */
export const fmtSignedPct = (value: number): string => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`;

// ------------------------------------------------------------
// 图表实测宽度（2026-11-06 Eason「图表过大」整改）：库存修正 / 成本销毛两卡的
// SVG 此前用固定 viewBox 720 拉伸到 100% 宽——左列全宽（1344）时整图放大 1.87 倍，
// 文字与柱随之虚胖、周刻度互相叠字。对齐大盘卡范式（MarketBusPanel）：viewBox 宽 =
// ResizeObserver 实测渲染宽（缩放比 1，文字回归真实 px），jsdom / 无 RO 回退 720。
// ------------------------------------------------------------

/** 卡内图表区实测渲染宽 hook（px，钳 ≥320）；无 ResizeObserver 环境回退 fallback。 */
export function useMeasuredWidth(fallback = 720): { ref: { current: HTMLDivElement | null }; width: number } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        setWidth((prev) => (w >= 320 && w !== prev ? w : prev));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

