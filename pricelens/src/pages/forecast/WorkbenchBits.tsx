// ============================================================
// 量价预测 · 推演工作台共享展示件：卡头、chip、链路条（FlowBar）、
// 图例（SuppLegend 规格）、数字格式。颜色全部来自 src/theme/tokens.ts；
// 状态一律「文字 + 底色」双通道。
// 图例规格（与主线 volume/SuppLegend 对齐）：图外底部居中行、roundRect 色块
// 14×8 或线/虚线/▼ 形态、11px color.body、点击切换系列显隐、隐藏态
// opacity .45 + aria-pressed。
// 2026-11-05 任务 6（IA 评审 2.3 B/C）：链路条 FlowBar 上收共享并去节点编号——
// 页级管线已用①–④编号（PipelineNav），卡内链路不再编第二套 1–5 号
// （库存卡 3a–3e / 成本卡 4a–4d 的编号方案一并作废，直接无编号）。
// ============================================================
import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { color, radius, space } from '../../theme/tokens';

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

/** AI 推测标注（信任语言保留：AI 推测 · 可改 → 人工确认）。琥珀语义统一
 *  （WP6 8.3 Step 8）：AI 与人工状态走中性灰 / 墨色，琥珀只留给档期、库存
 *  修正与预警；文字标签继续承载语义，不靠颜色单独表达。 */
export function AiJudgeBadge({ source }: { source: 'ai' | 'human' }) {
  const ai = source === 'ai';
  return (
    <span
      title={ai
        ? 'AI 推测 · 本地确定性规则基线（季节 × 趋势），未调用模型服务，可直接修改'
        : '该值已被人工修改，AI 基线不再生效'}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill,
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
        background: ai ? color.canvasSoft2 : color.ink,
        color: ai ? color.body : color.onPrimary,
        border: ai ? `1px solid ${color.hairline}` : 'none',
      }}
    >
      {ai ? 'AI 推测 · 可改' : '人工确认'}
    </span>
  );
}

/** 轻量模拟标识（卡级，页首另有 DataStatusBadge 一处）：模拟 / 模拟历史。
 *  中性灰表达——琥珀只留给档期 / 库存修正 / 预警（PRODUCT.md：模拟数据必须
 *  显式标识，页首 badge + 各卡轻量标识两级分级）。 */
export function SimChip({ variant = 'sim', title }: { variant?: 'sim' | 'simHistory'; title?: string }) {
  const history = variant === 'simHistory';
  return (
    <span
      title={title ?? (history
        ? '本卡历史序列为模拟样本回放，不代表真实市场'
        : '本卡数值为演示假设，不代表真实市场')}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill,
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
        background: color.canvasSoft2, color: color.body, border: `1px solid ${color.hairline}`,
      }}
    >
      {history ? '模拟历史' : '模拟'}
    </span>
  );
}

/** 输入/输出标注条（纲领：每张卡「输入 → 输出影响主图什么」一眼可读）。 */
export function IoBar({ input, output }: { input: string; output: string }) {
  const row = (label: string, text: string, strong: boolean) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
      <span
        style={{
          flex: 'none', fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
          background: strong ? color.canvasSoft2 : color.canvas, border: `1px solid ${color.hairline}`, color: color.body,
        }}
      >{label}</span>
      <span style={{ fontSize: 11, color: strong ? color.ink : color.body, minWidth: 0 }}>{text}</span>
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

/** 「演示」琥珀 chip 已退役（WP6 8.3 Step 2）：页首 = DataStatusBadge 一处，
 *  卡级 = 轻量 SimChip（模拟 / 模拟历史，中性灰），不再重复页级琥珀「演示」标。 */

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
                borderRadius: radius.control, fontSize: 11, whiteSpace: 'nowrap',
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
    <div role="group" aria-label={toggleable ? '图例（点击切换系列显隐）' : '图例'} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 14px', fontSize: 11, color: color.body, marginTop: space.sm, ...style }}>
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
              font: 'inherit', fontSize: 11, color: color.body, cursor: 'pointer', borderRadius: radius.control,
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
