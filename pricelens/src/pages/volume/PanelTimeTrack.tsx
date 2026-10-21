// ============================================================
// 面板独立时间轴（第一百一十九轮，走查会）：非同步模式下每张量价图底部的
// 独立查看时间调整条。交互与共享刷选条同源（起点/终点拖柄 + 整段平移 +
// 键盘微调），刻度同 axisTickPlan：窗口两端完整格式（周=YYYYMMDD/月=YYYYMM/
// 季=YYYYQn）加粗恒显示，中间省年份、跨年补年份行。
// ============================================================
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { Granularity } from '../../dataModel/types';
import { axisTickPlan, MIN_WINDOW, panWindow } from '../../chart/PriceTrend/helpers';
import { color, font, radius, selectAccent } from '../../theme/tokens';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
type DragKind = 'start' | 'end' | 'pan';

export default function PanelTimeTrack(props: {
  /** 可调全域的桶 id（与上方筛选范围一致）。 */
  ids: string[];
  lo: number;
  hi: number;
  s: number;
  e: number;
  granularity: Granularity;
  onChange: (s: number, e: number) => void;
  onAdjusting?: (v: boolean) => void;
}) {
  const { ids, lo, hi, s, e, granularity, onChange, onAdjusting } = props;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: DragKind; startX: number; startS: number; startE: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [activeDrag, setActiveDrag] = useState<DragKind | null>(null);
  const n = hi - lo + 1;
  if (n <= 0 || ids.length === 0) return null;

  const pct = (i: number): number => ((i - lo) / Math.max(1, n)) * 100;
  const domainIds = ids.slice(lo, hi + 1);
  const markS = s - lo;
  const markE = e - lo;
  const plan = axisTickPlan(granularity, domainIds, Math.max(1, Math.ceil(n / 5)), [markS, markE]);
  // 窄轨道：完整格式的边界文案很宽，把贴得太近的中间刻度让位（防止叠字）
  const guard = Math.max(2, Math.ceil(n / 14));
  const mids = plan.indexes.filter(
    (i) => !plan.isEdge(i) && Math.abs(i - markS) > guard && Math.abs(i - markE) > guard,
  );

  const onDragDown = (kind: DragKind) => (ev: ReactPointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    dragRef.current = { kind, startX: ev.clientX, startS: s, startE: e };
    setActiveDrag(kind);
    if (kind === 'pan') setPanning(true);
    onAdjusting?.(true);
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onDragMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width <= 0) return;
    if (d.kind === 'pan') {
      const delta = Math.round(((ev.clientX - d.startX) / rect.width) * n);
      const w = panWindow(d.startS, d.startE, lo, hi, delta);
      if (w.s !== s || w.e !== e) onChange(w.s, w.e);
      return;
    }
    const i = clamp(Math.floor(((ev.clientX - rect.left) / rect.width) * n) + lo, lo, hi);
    if (d.kind === 'start') {
      onChange(clamp(i, Math.min(lo, d.startE - (MIN_WINDOW - 1)), d.startE), d.startE);
    } else {
      onChange(d.startS, clamp(i, d.startS + MIN_WINDOW - 1, Math.max(hi, d.startS + MIN_WINDOW - 1)));
    }
  };
  const onDragUp = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPanning(false);
    setActiveDrag(null);
    onAdjusting?.(false);
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const handleStyle = (kind: DragKind): CSSProperties => ({
    position: 'absolute', top: 0, width: 18, height: 20, border: 0, background: 'transparent',
    transform: 'translateX(-50%)', cursor: kind === 'pan' ? (panning ? 'grabbing' : 'grab') : 'ew-resize',
    touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3,
  });
  const gripStyle = (kind: DragKind): CSSProperties => ({
    width: activeDrag === kind ? 5 : 3,
    height: 20,
    borderRadius: radius.pill,
    background: activeDrag === kind ? selectAccent : '#4f8fe8',
  });
  const midLabelStyle = (i: number): CSSProperties => ({
    position: 'absolute', left: `${pct(i + lo) + 0.5 / n}%`, top: 26, transform: 'translateX(-50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    fontSize: 10, lineHeight: '12px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums',
    color: color.mute, whiteSpace: 'nowrap', pointerEvents: 'none',
  });

  return (
    <div ref={trackRef} style={{ position: 'relative', height: 52, minWidth: 0 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 20, borderRadius: 5, background: '#edf0f4', boxShadow: `inset 0 0 0 1px ${color.hairline}` }} />
      <div
        title="拖动本图的查看时间"
        aria-label="平移本图时间段"
        style={{
          position: 'absolute', left: `${pct(s)}%`, width: `${pct(e + 1) - pct(s)}%`, top: 0, height: 20,
          borderRadius: 5, background: panning ? '#c7ddff' : '#dceaff',
          boxShadow: 'inset 0 0 0 1px #8db4f0', cursor: panning ? 'grabbing' : 'grab', touchAction: 'none', zIndex: 1,
        }}
        onPointerDown={onDragDown('pan')} onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}
      />
      {[markS, markE].map((m) => (
        <span key={`edge-tick-${m}`} aria-hidden="true" style={{ position: 'absolute', left: `${pct(m + lo) + 0.5 / n}%`, top: 4, width: 1, height: 12, transform: 'translateX(-50%)', background: color.hairlineStrong, pointerEvents: 'none' }} />
      ))}
      {mids.map((i) => (
        <span key={`mid-tick-${i}`} aria-hidden="true" style={{ position: 'absolute', left: `${pct(i + lo) + 0.5 / n}%`, top: 7, width: 1, height: 6, transform: 'translateX(-50%)', background: '#aeb8c6', pointerEvents: 'none' }} />
      ))}
      {/* 边界完整文案：向外对齐，避免窄窗口时首尾叠字 */}
      <span aria-hidden="true" style={{ position: 'absolute', left: `${pct(markS + lo)}%`, top: 26, transform: 'translateX(-12%)', fontSize: 10, lineHeight: '12px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.body, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {plan.dateText(markS)}
      </span>
      <span aria-hidden="true" style={{ position: 'absolute', left: `${pct(markE + lo + 1)}%`, top: 26, transform: 'translateX(-88%)', fontSize: 10, lineHeight: '12px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.body, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {plan.dateText(markE)}
      </span>
      {mids.map((i) => {
        const year = plan.yearText(i);
        return (
          <span key={`mid-label-${i}`} aria-hidden="true" style={midLabelStyle(i)}>
            <span>{plan.dateText(i)}</span>
            {year && <em style={{ fontStyle: 'italic', color: color.mute }}>{year}</em>}
          </span>
        );
      })}
      <div
        style={{ ...handleStyle('start'), left: `${pct(s)}%` }} role="slider" tabIndex={0}
        aria-label="本图时间起点" aria-valuemin={lo} aria-valuemax={Math.max(lo, e - MIN_WINDOW + 1)} aria-valuenow={s}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const next = clamp(s + (event.key === 'ArrowRight' ? 1 : -1), lo, Math.max(lo, e - MIN_WINDOW + 1));
          if (next !== s) onChange(next, e);
        }}
        onPointerDown={onDragDown('start')} onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}
      >
        <span style={gripStyle('start')} />
      </div>
      <div
        style={{ ...handleStyle('end'), left: `${pct(e + 1)}%` }} role="slider" tabIndex={0}
        aria-label="本图时间终点" aria-valuemin={Math.min(hi, s + MIN_WINDOW - 1)} aria-valuemax={hi} aria-valuenow={e}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const next = clamp(e + (event.key === 'ArrowRight' ? 1 : -1), Math.min(hi, s + MIN_WINDOW - 1), hi);
          if (next !== e) onChange(s, next);
        }}
        onPointerDown={onDragDown('end')} onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}
      >
        <span style={gripStyle('end')} />
      </div>
    </div>
  );
}
