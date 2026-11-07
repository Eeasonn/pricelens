// ============================================================
// 区间量尺图层（2026-11-06 Eason 拍板；规则见
// .impeccable/surfaces/range-ruler-volume-skeleton.md）：选区带 + 选区外白幕 +
// 每层一列量尺（极值虚线、箭头、两行幅度框）+ 极值小实心圆 + 选区上方的时间
// 胶囊与读数方式切换（只选一个桶时换成提示）。几何全部来自 rangeRuler.rulerLayerOf，
// 本组件只负责画。
// ============================================================
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { color, font, radius, rangeRuler, selectSoft, selectSoftInk, shadow } from '../../theme/tokens';
import { RANGE_MODE_HINT, RANGE_MODE_LABEL, RULER_CHIP_H, type RangeMode, type RulerLayerModel, type RulerLayerPart } from './rangeRuler';

/** 时间胶囊 + 切换整条的顶端相对绘图区顶边的偏移（胶囊挂在绘图区上方） */
const RANGE_BAR_OFFSET = 31;
/** 胶囊 + 切换的整体高度（用于极值数字避让） */
const RANGE_BAR_H = 50;
const MARKER_R = 3.5;

const stop = (e: ReactMouseEvent): void => e.stopPropagation();

export default function RangeRulerLayer(props: {
  model: RulerLayerModel;
  mode: RangeMode;
  onMode?: (m: RangeMode) => void;
  onClear: () => void;
  /** 拖动中：胶囊不给清除、不出切换 */
  dragging: boolean;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  /** 选区带纵向下沿（有量层 = 量带底，否则价格层底） */
  bandBottom: number;
  rangeText: string;
  unitNoun: string;
  summary: string;
  /** 极值点旁的数字（价格 = 图上价标同款，销量 = 千分位） */
  formatMarker: (kind: 'price' | 'volume', v: number) => string;
  measure: (text: string, size: number, weight: number) => number;
}) {
  const m = props.model;
  const bandH = props.bandBottom - props.plotTop;
  const crisp = (v: number): number => Math.round(v) + 0.5;
  const center = Math.min(Math.max((m.bandLeft + m.bandRight) / 2, props.plotLeft + 96), props.plotRight - 96);
  const barTop = props.plotTop - RANGE_BAR_OFFSET;
  const barW = m.single
    ? 110
    : Math.ceil(props.measure(RANGE_MODE_LABEL.extreme, 11, 600) + props.measure(RANGE_MODE_LABEL.trend, 11, 600)) + 40;
  const barBox = props.dragging ? null : { l: center - barW / 2 - 4, r: center + barW / 2 + 4, t: barTop, b: barTop + RANGE_BAR_H };

  const guide = (x: number, y: number): JSX.Element | null => {
    const dir = m.columnX >= x ? 1 : -1;
    const start = x + dir * 6;
    const end = m.columnX + dir * 4;
    if ((end - start) * dir <= 2) return null;
    return (
      <line
        key={`g-${x}-${y}`}
        x1={start}
        x2={end}
        y1={crisp(y)}
        y2={crisp(y)}
        stroke={rangeRuler.guide}
        strokeOpacity={0.85}
        strokeDasharray="3 3"
      />
    );
  };

  // 幅度框（2026-11-07 Eason「极差卡片用跟产品卡片一样的风格」）：容器与悬停产品卡同一套 CSS——
  // 白底 + 1px hairline 描边 + 卡片圆角 + L2 投影（rangeRuler.chip*），所以从 SVG rect 换成 HTML
  // 叠层；内容不变：第一行率、第二行数量，两行居中。不接指针（拖选 / 悬停照常穿透）
  const chip = (part: RulerLayerPart): JSX.Element | null => {
    if (part.chipY == null) return null;
    return (
      <div
        key={`chip-${part.kind}`}
        data-testid={`range-ruler-chip-${part.kind}`}
        style={{
          position: 'absolute',
          left: m.columnX - m.chipW / 2,
          top: part.chipY - RULER_CHIP_H / 2,
          width: m.chipW,
          height: RULER_CHIP_H,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: rangeRuler.chipFill,
          border: `1px solid ${rangeRuler.chipBorder}`,
          borderRadius: rangeRuler.chipRadius,
          boxShadow: rangeRuler.chipShadow,
          fontFamily: font.family,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 16,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: '16px', fontWeight: 600, color: rangeRuler.chipText }}>{part.texts.primary}</span>
        <span style={{ fontSize: 11, lineHeight: '14px', color: rangeRuler.chipSubText }}>{part.texts.secondary}</span>
      </div>
    );
  };

  const arrow = (part: RulerLayerPart): JSX.Element | null => {
    if (!part.drawArrow || !part.a || !part.b || part.ruler.state !== 'ok') return null;
    const ax = crisp(m.columnX);
    const yA = crisp(part.a.y);
    const yB = crisp(part.b.y);
    const head = (y: number, up: boolean): string =>
      `M${ax - 3.5} ${y + (up ? 6 : -6)} L${ax} ${y} L${ax + 3.5} ${y + (up ? 6 : -6)} `;
    // 区间极差 = 双向箭头；区间涨跌 = 单向，从期初指向期末
    const d = part.ruler.dir === 0
      ? head(Math.min(yA, yB), true) + head(Math.max(yA, yB), false)
      : head(yB, yB < yA);
    return (
      <g key={`arrow-${part.kind}`}>
        <line x1={ax} x2={ax} y1={yA} y2={yB} stroke={rangeRuler.arrow} strokeWidth={1.2} />
        <path d={d} fill="none" stroke={rangeRuler.arrow} strokeWidth={1.2} />
      </g>
    );
  };

  const markers = (part: RulerLayerPart): JSX.Element[] => {
    const out: JSX.Element[] = [];
    const pts = [part.a, part.b].filter((p, i, arr): p is NonNullable<typeof p> => p != null && arr.indexOf(p) === i);
    if (pts.length === 0) return out;
    const higher = pts.reduce((h, p) => (p.value > h.value ? p : h), pts[0]);
    pts.forEach((p, k) => {
      const isPrice = part.kind === 'price';
      const up = !isPrice || pts.length === 1 || p === higher;
      const size = isPrice ? 13 : 11;
      const text = props.formatMarker(part.kind, p.value);
      const tw = props.measure(text, size, 500);
      let tx = Math.min(Math.max(p.x, props.plotLeft + tw / 2 + 2), props.plotRight - tw / 2 - 2);
      let ty = up ? p.y - (isPrice ? 9 : 8) : p.y + 18;
      if (isPrice) ty = Math.max(ty, props.plotTop + 5);
      // 撞上时间胶囊 / 切换：挪到点的侧面（避开虚线拉出的那一边）
      if (barBox && tx + tw / 2 > barBox.l && tx - tw / 2 < barBox.r && ty > barBox.t && ty - size < barBox.b) {
        const toLeft = m.columnX >= p.x;
        tx = toLeft ? p.x - 8 - tw / 2 : p.x + 8 + tw / 2;
        ty = p.y + 4;
      }
      out.push(
        <g key={`mk-${part.kind}-${k}`}>
          <circle cx={p.x} cy={p.y} r={MARKER_R} fill={part.color} stroke={color.canvas} strokeWidth={1.2} />
          <text
            x={tx}
            y={ty}
            textAnchor="middle"
            fontSize={size}
            fontWeight={500}
            fill={part.color}
            style={{ paintOrder: 'stroke', stroke: color.canvas, strokeWidth: 3, strokeLinejoin: 'round' }}
          >
            {text}
          </text>
        </g>,
      );
    });
    return out;
  };

  const emptyNote = (part: RulerLayerPart): JSX.Element | null => {
    if (part.ruler.state !== 'empty') return null;
    const text = part.kind === 'price' ? '区间内无采集价格' : '区间内无销量数据';
    const cx = (m.bandLeft + m.bandRight) / 2;
    const cy = (part.top + part.bottom) / 2;
    const w = props.measure(text, 12, 400) + 12;
    return (
      <g key={`empty-${part.kind}`}>
        <rect x={cx - w / 2} y={cy - 10} width={w} height={20} rx={6} fill={color.canvas} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fill={color.mute}>
          {text}
        </text>
      </g>
    );
  };

  const svgStyle: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' };
  const fontStyle: CSSProperties = { fontFamily: font.family, fontVariantNumeric: 'tabular-nums' };
  return (
    <>
      {/* 选区带 + 左右竖线（压在折线之上、白幕之下） */}
      <svg aria-hidden style={{ ...svgStyle, zIndex: 6 }}>
        <rect x={m.bandLeft} y={props.plotTop} width={m.bandRight - m.bandLeft} height={bandH} fill={rangeRuler.band} />
        <line x1={crisp(m.bandLeft)} x2={crisp(m.bandLeft)} y1={props.plotTop} y2={props.bandBottom} stroke={rangeRuler.bandEdge} />
        <line x1={crisp(m.bandRight)} x2={crisp(m.bandRight)} y1={props.plotTop} y2={props.bandBottom} stroke={rangeRuler.bandEdge} />
      </svg>
      {/* 选区外白幕：盖住折线、柱和数值标签 */}
      <svg aria-hidden style={{ ...svgStyle, zIndex: 15 }}>
        {m.bandLeft - props.plotLeft > 0.5 && (
          <rect x={props.plotLeft} y={props.plotTop} width={m.bandLeft - props.plotLeft} height={bandH} fill={rangeRuler.outside} />
        )}
        {props.plotRight - m.bandRight > 0.5 && (
          <rect x={m.bandRight} y={props.plotTop} width={props.plotRight - m.bandRight} height={bandH} fill={rangeRuler.outside} />
        )}
      </svg>
      {/* 量尺 + 极值点 */}
      <svg aria-hidden data-testid="range-ruler" style={{ ...svgStyle, ...fontStyle, zIndex: 16 }}>
        {!m.single && m.parts.map((part) => (
          <g key={`ruler-${part.kind}`} data-testid={`range-ruler-${part.kind}`}>
            {part.chipY != null && part.a && guide(part.a.x, part.a.y)}
            {part.chipY != null && part.b && part.b !== part.a && guide(part.b.x, part.b.y)}
            {arrow(part)}
          </g>
        ))}
        {m.parts.map((part) => markers(part))}
        {m.parts.map((part) => emptyNote(part))}
      </svg>
      {/* 幅度框：HTML 叠层，DOM 顺序在量尺之后 = 盖住箭头中段（同 z 序后者在上），悬停卡（z20）仍在其上 */}
      {!m.single && m.parts.map((part) => chip(part))}
      {/* 时间胶囊（× 清除）+ 读数方式切换；只选一个桶时换成提示 */}
      <div
        style={{
          position: 'absolute',
          left: center,
          top: barTop,
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          zIndex: 17,
          pointerEvents: 'none',
        }}
      >
        <span
          className="tnum"
          onMouseDown={stop}
          onClick={stop}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '1px 6px 1px 9px',
            fontSize: 11,
            lineHeight: '17px',
            color: selectSoftInk,
            background: color.canvas,
            border: `1px solid ${rangeRuler.bandEdge}`,
            borderRadius: radius.pill,
            boxShadow: shadow.l2,
            whiteSpace: 'nowrap',
            userSelect: 'none',
            pointerEvents: 'auto',
          }}
        >
          <span>{props.rangeText}</span>
          {!props.dragging && (
            <button
              type="button"
              aria-label="清除时间段选择"
              title="清除时间段选择"
              onClick={(ev) => {
                ev.stopPropagation();
                props.onClear();
              }}
              className="lpl-hit"
              style={{
                position: 'relative',
                display: 'inline-grid',
                placeItems: 'center',
                width: 14,
                height: 14,
                padding: 0,
                border: 'none',
                borderRadius: '50%',
                background: 'transparent',
                cursor: 'pointer',
                color: color.mute,
              }}
            >
              <CloseOutlined style={{ fontSize: 8 }} />
            </button>
          )}
        </span>
        {!props.dragging && (m.single ? (
          <span
            role="status"
            style={{
              padding: '2px 10px',
              fontSize: 11,
              lineHeight: '16px',
              fontWeight: 600,
              color: color.warningInk,
              background: color.warningSoft,
              borderRadius: radius.pill,
              whiteSpace: 'nowrap',
            }}
          >
            {`请选择${props.unitNoun}范围`}
          </span>
        ) : props.onMode && (
          <span
            role="group"
            aria-label="区间读数方式"
            onMouseDown={stop}
            onClick={stop}
            style={{
              display: 'inline-flex',
              padding: 2,
              background: color.canvas,
              border: `1px solid ${color.hairline}`,
              borderRadius: radius.control,
              boxShadow: shadow.l2,
              pointerEvents: 'auto',
            }}
          >
            {(['extreme', 'trend'] as const).map((k) => {
              const on = props.mode === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  title={RANGE_MODE_HINT[k]}
                  onClick={() => props.onMode?.(k)}
                  style={{
                    height: 20,
                    padding: '0 8px',
                    border: 'none',
                    borderRadius: 4,
                    fontFamily: font.family,
                    fontSize: 11,
                    lineHeight: '20px',
                    fontWeight: on ? 600 : 400,
                    color: on ? selectSoftInk : color.body,
                    background: on ? selectSoft : 'transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {RANGE_MODE_LABEL[k]}
                </button>
              );
            })}
          </span>
        ))}
      </div>
      <span
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}
      >
        {props.dragging ? '' : props.summary}
      </span>
    </>
  );
}
