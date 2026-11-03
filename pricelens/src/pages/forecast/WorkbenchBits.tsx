// ============================================================
// 量价预测 · 推演工作台 v2 共享展示件：卡头、chip、图例（SuppLegend 规格）、
// 数字格式。颜色全部来自 src/theme/tokens.ts；状态一律「文字 + 色」双通道。
// 图例规格（与主线 volume/SuppLegend 对齐）：图外底部居中行、roundRect 色块
// 14×8 或线/虚线/▼ 形态、11px color.body、点击切换系列显隐、隐藏态
// opacity .45 + aria-pressed。
// ============================================================
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

/** 把握度徽标：把握大 = 墨底白字；把握中 = 白底描边（文字承载语义，不靠颜色单独表达）。 */
export function CertaintyBadge({ level }: { level: 'high' | 'mid' }) {
  const high = level === 'high';
  return (
    <span
      title={high ? '库存修正段：把握大 ±2%（区间帽最窄）' : '参考型考量：把握中 ±8%（区间帽中等）'}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill,
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
        background: high ? color.ink : color.canvas,
        color: high ? color.onPrimary : color.body,
        border: high ? 'none' : `1px solid ${color.hairlineStrong}`,
      }}
    >
      {high ? '把握大 ±2%' : '把握中 ±8%'}
    </span>
  );
}

/** AI 推测标注（纲领：AI 推的第一版，可改）：初始 = AI 推测 · 可改（琥珀）；人工改动后 = 人工确认（灰）。 */
export function AiJudgeBadge({ source }: { source: 'ai' | 'human' }) {
  const ai = source === 'ai';
  return (
    <span
      title={ai ? 'AI 推的第一版（纯时间序列：季节 × 趋势），可直接修改' : '该值已被人工修改，AI 第一版不再生效'}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill,
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
        background: ai ? color.warningSoft : color.canvasSoft2,
        color: ai ? color.warningInk : color.body,
      }}
    >
      {ai ? 'AI 推测 · 可改' : '人工确认'}
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

/** 「演示」琥珀 chip（PRODUCT.md：演示/模拟数据必须显式标识）。 */
export function DemoChip({ title }: { title?: string }) {
  return (
    <span
      title={title ?? '演示数据：数值为演示假设，不代表真实市场'}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill,
        fontSize: 11, fontWeight: 600, background: color.warningSoft, color: color.warningInk, whiteSpace: 'nowrap',
      }}
    >
      演示
    </span>
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

/** 图外底部居中行图例：带 key 的项点击切换系列显隐（aria-pressed + 隐藏态 opacity .45）。 */
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
  return (
    <div role="group" aria-label="图例（点击切换系列显隐）" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 14px', fontSize: 11, color: color.body, marginTop: space.sm, ...style }}>
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
