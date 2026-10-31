// ============================================================
// 量价看板 · 面板销量柱层：SVG 画在价格折线之下。
// 销量轴默认使用当前查看窗口的 niceCeil 最高值；用户只在轴顶输入最高值。
// 0 是固定基线，图层高度恒定，最高值只改变柱高映射，超出的柱子会贴住顶边。
// ============================================================
import { useEffect, useRef, useState } from 'react';
import type { StripGeom } from '../../chart/PriceTrend/helpers';
import { color, font } from '../../theme/tokens';
import { commitVolumeAxisLimit, volumeAxisClipOf, volumeRangeOf, type VolumeAxisLimits } from './volumeAxis';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function VolumeAxisLimit(props: {
  limit: number | null;
  autoValue: number;
  onCommit: (value: number | null) => void;
}) {
  const displayed = props.limit ?? props.autoValue;
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState('');
  const [draft, setDraft] = useState('');
  const cancelRef = useRef(false);
  useEffect(() => {
    if (!editing) setDraft(String(Math.round(displayed)));
  }, [displayed, editing]);

  const commit = (): void => {
    const text = draft.trim();
    if (!text) {
      props.onCommit(null);
      setEditing(false);
      return;
    }
    const value = Number(text);
    if (Number.isFinite(value)) props.onCommit(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="tnum"
        aria-label={`销量 Y 轴上限 ${Math.round(displayed).toLocaleString('en-US')}，点击编辑`}
        title="点击编辑销量上限；清空恢复自动"
        onClick={() => {
          const text = String(Math.round(displayed));
          setSnapshot(text);
          setDraft(text);
          cancelRef.current = false;
          setEditing(true);
        }}
        style={{
          border: 'none',
          background: 'none',
          padding: 0,
          color: color.body,
          font: 'inherit',
          fontSize: 11,
          lineHeight: '14px',
          fontVariantNumeric: 'tabular-nums',
          cursor: 'pointer',
          textAlign: 'right',
        }}
      >
        {Math.round(displayed).toLocaleString('en-US')}
      </button>
    );
  }

  return (
    <input
      autoFocus
      className="tnum"
      type="number"
      inputMode="numeric"
      step={100}
      min={0}
      aria-label="销量 Y 轴上限"
      title="Enter 或离开输入框提交，Escape 取消，清空恢复自动"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelRef.current) {
          cancelRef.current = false;
          setDraft(snapshot);
          setEditing(false);
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelRef.current = true;
          setDraft(snapshot);
          event.currentTarget.blur();
        }
      }}
      style={{
        width: 64,
        height: 20,
        boxSizing: 'border-box',
        padding: '0 4px',
        border: `1px solid ${color.hairlineStrong}`,
        borderRadius: 4,
        background: color.canvas,
        color: color.body,
        fontFamily: font.family,
        fontSize: 11,
        lineHeight: '18px',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        outline: 'none',
      }}
    />
  );
}

export default function VolumeBars(props: {
  geom: StripGeom | null;
  /** 绘图区顶（面板 gridTop） */
  plotTop: number;
  plotHeight: number;
  values: (number | null)[];
  /** 当前窗口自动上限，用户上限为空时使用。 */
  vMax: number;
  color: string;
  hoverIdx: number | null;
  axisLimits: VolumeAxisLimits;
  onAxisLimit: (kind: 'max', value: number | null) => void;
  /** 当前选择区间的销量极值。按销量轴定位，引导线画到极差卡近缘（toX）；缺省画到绘图区右缘。 */
  rangeMarks?: readonly { index: number; value: number; label: string; toX?: number }[] | null;
}) {
  const { geom, values, vMax } = props;
  if (!geom || geom.n <= 0 || !(props.plotHeight > 0) || !(vMax > 0)) return null;

  const [axisMin, axisMax] = volumeRangeOf(props.axisLimits, vMax);
  const axisSpan = Math.max(1, axisMax - axisMin);
  const plotBottom = props.plotTop + props.plotHeight;
  const colW = geom.plotWidth / geom.n;
  const barW = Math.max(1, 0.62 * colW);
  const clip = volumeAxisClipOf(values, props.axisLimits, vMax);
  const bars = values.map((value, index) => {
    if (value == null || !Number.isFinite(value) || value <= axisMin) return null;
    const clipped = value > axisMax;
    const ratio = Math.min(1, Math.max(0, (value - axisMin) / axisSpan));
    const h = Math.max(1, ratio * props.plotHeight);
    const cx = geom.plotLeft + colW * (index + 0.5);
    return {
      index,
      x: cx - barW / 2,
      y: plotBottom - h,
      w: barW,
      h,
      lit: props.hoverIdx === index,
      clipped,
      value,
    };
  });

  const yOfVolume = (value: number): number => {
    const ratio = Math.min(1, Math.max(0, (value - axisMin) / axisSpan));
    return plotBottom - ratio * props.plotHeight;
  };
  const volumeMarks = (props.rangeMarks ?? []).filter((mark) => mark.index >= 0 && mark.index < geom.n);
  const axisX = geom.plotLeft + geom.plotWidth + 10;
  const commit = (value: number | null): void => {
    props.onAxisLimit('max', commitVolumeAxisLimit(props.axisLimits, 'max', value, vMax).max);
  };
  const ticks = [
    { label: Math.round(axisMax / 2).toLocaleString('en-US'), y: props.plotTop + props.plotHeight / 2 },
    { label: '0', y: plotBottom },
  ];

  return (
    <>
      <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
        {bars.map((bar) => bar == null ? null : (
          <rect
            key={bar.index}
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={bar.h}
            rx={bar.clipped ? 0 : 1}
            fill={hexToRgba(props.color, bar.lit ? 0.38 : 0.18)}
          >
            {bar.clipped && <title>{`超出当前上限，实际 ${Math.round(bar.value).toLocaleString('en-US')}`}</title>}
          </rect>
        ))}
      </svg>
      {volumeMarks.length > 0 && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 16 }}>
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            {volumeMarks.map((mark) => {
              const x = geom.plotLeft + colW * (mark.index + 0.5);
              const y = yOfVolume(mark.value);
              const edge = geom.plotLeft + geom.plotWidth;
              const toX = mark.toX ?? edge;
              const x1 = Math.min(x, toX);
              const x2 = Math.max(x, toX);
              return (
                <g key={`${mark.index}-${mark.label}`}>
                  {x2 - x1 > 2 && (
                    <line x1={x1} x2={x2} y1={y} y2={y} stroke={color.ink} strokeOpacity={0.3} strokeDasharray="2 4" strokeWidth={1} />
                  )}
                  <circle cx={x} cy={y} r={3} fill={color.canvas} stroke={color.ink} strokeOpacity={0.45} strokeWidth={1.25} />
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
        <div style={{ position: 'absolute', left: axisX, top: props.plotTop, width: 1, height: props.plotHeight, background: color.hairline }} />
        <div style={{ position: 'absolute', left: axisX + 8, top: props.plotTop, color: color.mute, fontSize: 10, lineHeight: '12px', whiteSpace: 'nowrap' }}>销量（台）</div>
        {ticks.map((tick) => (
          <div key={tick.label + tick.y} style={{ position: 'absolute', left: axisX - 4, top: tick.y - 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 4, height: 1, background: color.hairlineStrong }} />
            <span className="tnum" style={{ fontSize: 10, lineHeight: '12px', color: color.mute, fontVariantNumeric: 'tabular-nums' }}>{tick.label}</span>
          </div>
        ))}
        <div style={{ position: 'absolute', left: axisX - 4, top: props.plotTop + 12, display: 'flex', alignItems: 'flex-start', gap: 4, pointerEvents: 'auto' }}>
          <span style={{ width: 4, height: 1, marginTop: 8, background: color.hairlineStrong }} />
          <div>
            <VolumeAxisLimit limit={props.axisLimits.max} autoValue={axisMax} onCommit={commit} />
            <div style={{ color: color.mute, fontSize: 9, lineHeight: '12px' }}>{props.axisLimits.max == null ? '自动' : '手动'}</div>
            {clip.clipped && <div style={{ color: color.error, fontSize: 9, lineHeight: '12px', whiteSpace: 'nowrap' }}>超出当前上限</div>}
          </div>
        </div>
      </div>
    </>
  );
}
