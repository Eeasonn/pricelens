// ============================================================
// 面板独立时间轴（第一百一十九轮，走查会）：每张量价图底部的独立查看时间调整条
// （第一百二十三轮起同步/非同步恒渲染——同步 = 三图同段查看时间，拖任一条同步调整）。
// 交互与共享刷选条同源（起点/终点拖柄 + 整段平移 + 键盘微调），刻度同 axisTickPlan：
// 主行恒短格式（周=MM-DD/月=MM/季=Qn），两端拖柄标签加粗恒显示，年份独立第二行
// （最左显示刻度恒带、换年刻度带）。窄轨道叠字改按像素区间让位（原按桶数让位
// 在窄面板里拖柄标签仍压住灰色刻度）。
// ============================================================
import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import type { Granularity } from '../../dataModel/types';
import { axisTickPlan, hideOverlappingTicks, MIN_WINDOW, panWindow } from '../../chart/PriceTrend/helpers';
import { color, font, radius, selectAccent } from '../../theme/tokens';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
type DragKind = 'start' | 'end' | 'pan';

/** 元素实宽（ResizeObserver；第一百二十三轮像素让位——轨道宽度决定刻度标签像素区间） */
function useObservedWidth(): [MutableRefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) setW(en.contentRect.width);
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

let labelMeasureCtx: CanvasRenderingContext2D | null = null;
/** 刻度标签单行像素宽（让位判定用；无 DOM 环境按 0.6×字号/字符粗估） */
const measureTickText = (s: string, px: number): number => {
  if (!s) return 0;
  if (typeof document === 'undefined') return s.length * px * 0.6;
  if (!labelMeasureCtx) labelMeasureCtx = document.createElement('canvas').getContext('2d');
  if (!labelMeasureCtx) return s.length * px * 0.6;
  labelMeasureCtx.font = `${px}px ${font.family}`;
  return labelMeasureCtx.measureText(s).width;
};

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
  const [widthRef, trackW] = useObservedWidth();
  const n = hi - lo + 1;
  if (n <= 0 || ids.length === 0) return null;

  const pct = (i: number): number => ((i - lo) / Math.max(1, n)) * 100;
  const domainIds = ids.slice(lo, hi + 1);
  const markS = s - lo;
  const markE = e - lo;
  const plan = axisTickPlan(granularity, domainIds, Math.max(1, Math.ceil(n / 5)), [markS, markE]);
  // 像素让位（第一百二十三轮，替代原按桶数 guard）：两端拖柄标签的像素区间 =
  // 轨道实宽定位 + 文本实宽（含白底 padding；边界标签向轨道内侧偏移 0.38×标签宽，
  // 与下方 translateX 对应），与之相交（含 4px 间距）的中间刻度标签与刻度线整组隐藏。
  // 轨道实宽未知（首帧）时先全显示，ResizeObserver 回调宽度后重算。
  const EDGE_PAD = 3;
  const textWOf = (idx: number): number => {
    const year = plan.yearText(idx);
    return Math.max(measureTickText(plan.dateText(idx), 10), year ? measureTickText(year, 10) : 0);
  };
  const midIdxAll = plan.indexes.filter((i) => !plan.isEdge(i));
  const edgeBoxes =
    trackW > 0
      ? [
          { x: (markS / n) * trackW + 0.38 * (textWOf(markS) + EDGE_PAD * 2), w: textWOf(markS) + EDGE_PAD * 2 },
          { x: ((markE + 1) / n) * trackW - 0.38 * (textWOf(markE) + EDGE_PAD * 2), w: textWOf(markE) + EDGE_PAD * 2 },
        ]
      : [];
  const midHidden =
    trackW > 0
      ? hideOverlappingTicks(
          midIdxAll.map((i) => ({ x: ((i + 0.5) / n) * trackW, w: textWOf(i) })),
          edgeBoxes,
          4,
        )
      : midIdxAll.map(() => false);
  const mids = midIdxAll.filter((_, k) => !midHidden[k]);

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

  const edgeLabelStyle = (translate: string): CSSProperties => ({
    position: 'absolute', top: 26, transform: `translateX(${translate})`,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    fontSize: 10, lineHeight: '12px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums',
    color: color.body, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none',
    // 第一百二十三轮：白底 + 左右 padding——与相邻灰色刻度叠上时兜底遮盖
    background: color.canvas, padding: '0 3px',
  });

  return (
    <div
      ref={(el) => {
        trackRef.current = el;
        widthRef.current = el;
      }}
      style={{ position: 'relative', height: 52, minWidth: 0 }}
    >
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
      {/* 两端拖柄标签（第一百二十三轮）：短格式 + 年份第二行（最左显示刻度恒带年份、
          换年刻度带）；向轨道内侧偏移避免顶到轨道边缘裁切 */}
      <span aria-hidden="true" style={{ ...edgeLabelStyle('-12%'), left: `${pct(markS + lo)}%` }}>
        <span>{plan.dateText(markS)}</span>
        {plan.yearText(markS) && <em style={{ fontStyle: 'italic', color: color.mute }}>{plan.yearText(markS)}</em>}
      </span>
      <span aria-hidden="true" style={{ ...edgeLabelStyle('-88%'), left: `${pct(markE + lo + 1)}%` }}>
        <span>{plan.dateText(markE)}</span>
        {plan.yearText(markE) && <em style={{ fontStyle: 'italic', color: color.mute }}>{plan.yearText(markE)}</em>}
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
