// ============================================================
// §6.5 X 轴时间刷选器（第三轮反馈改造）：
// - 轨道 = 数据全集时间轴（不再 = 筛选范围）：窗口可平移/拉伸到全轴任意位置，
//   越出筛选范围时上层自动把筛选范围左/右极值扩展到窗口端点
//   （例：筛选 2026Q2–Q4 时按 ‹ → 窗口 2026Q1–Q3，筛选器左极值随之变 2026Q1）。
// - 中间蓝色窗口区可整体拖动平移（按桶步进吸附、clamp 在数据全集内），cursor: grab/grabbing；
// - ‹ › 箭头固定在轨道最左/最右两端（不随窗口移动）：点击 = 窗口整体平移一个步长
//   （周=4 周、月=1 月、季=1 季）；‹ 向过去、› 向未来；窗口顶到数据边界时对应箭头置灰禁用。
//   （原"两端外拓窗口"语义作废。）
// - 双端拖柄独立拖拽调窗宽语义保留（第三轮起在季度等少桶粒度下同样可拉伸——轨道不再随筛选范围缩没）。
// - 主体样式加高（参考 Quick BI 值轴滑杆）：16px 高轨道 + 居中加高拖柄。
// 约束：窗口 ⊆ 数据全集 ∧ 最小 4 桶（窄筛选时 = 整个筛选范围）；
// 无横向滚动条——窗口变化一律重采样重绘（上层按 [s,e] 切桶压满绘图宽度）。
// 轨道宽度 = 数据全集桶数，窗口用百分比定位，无需测量像素。
// ============================================================
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { color, font, radius, shadow, space } from '../../theme/tokens';
import { MIN_WINDOW, panStep, panWindow, shiftWindow, type Bucket } from './helpers';

export interface XBrushProps {
  buckets: Bucket[]; // 数据全集时间轴（当前粒度全部桶）
  s: number; // 窗口起止下标
  e: number;
  granularity: 'week' | 'month' | 'quarter';
  onChange: (s: number, e: number) => void;
  /** 拖动开始/结束（第九轮）：上层据此冻结 Y 轴自适应，松手统一重算一次 */
  onAdjusting?: (v: boolean) => void;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

type DragKind = 'start' | 'end' | 'pan';

export default function XBrush(props: XBrushProps) {
  const { buckets, s, e, granularity, onChange, onAdjusting } = props;
  const n = buckets.length;
  const trackRef = useRef<HTMLDivElement | null>(null);
  // 拖动基准 = 按下瞬间的窗口（startS/startE），避免用中间态反馈造成漂移
  const dragRef = useRef<{ kind: DragKind; startX: number; startS: number; startE: number } | null>(null);
  const [panning, setPanning] = useState(false);
  if (n === 0) return null;

  const pct = (i: number): number => (i / n) * 100;
  const step = panStep(granularity);
  const canLeft = s > 0;
  const canRight = e < n - 1;

  const onDragDown = (kind: DragKind) => (ev: ReactPointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    dragRef.current = { kind, startX: ev.clientX, startS: s, startE: e };
    if (kind === 'pan') setPanning(true);
    onAdjusting?.(true); // 拖动开始：上层冻结 Y 轴自适应
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onDragMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width <= 0) return;
    if (d.kind === 'pan') {
      const delta = Math.round(((ev.clientX - d.startX) / rect.width) * n);
      const w = panWindow(d.startS, d.startE, n, delta);
      if (w.s !== s || w.e !== e) onChange(w.s, w.e);
      return;
    }
    const i = clamp(Math.floor(((ev.clientX - rect.left) / rect.width) * n), 0, n - 1);
    if (d.kind === 'start') onChange(clamp(i, 0, d.startE - (MIN_WINDOW - 1)), d.startE);
    else onChange(d.startS, clamp(i, d.startS + MIN_WINDOW - 1, n - 1));
  };
  const onDragUp = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPanning(false);
    onAdjusting?.(false); // 松手：上层统一重算一次 Y 轴自适应
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const btnStyle = (active: boolean): CSSProperties => ({
    position: 'absolute',
    top: 11, // 与轨道（top 14 + height 16）垂直居中
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    background: color.canvas,
    border: `1px solid ${color.hairline}`,
    boxShadow: shadow.l1,
    color: active ? color.body : color.hairlineStrong,
    fontSize: 14,
    lineHeight: '20px',
    display: 'grid',
    placeItems: 'center',
    cursor: active ? 'pointer' : 'default',
    padding: 0,
    zIndex: 2,
  });

  const handleStyle: CSSProperties = {
    position: 'absolute',
    top: 8, // 28 高，相对轨道（14..30）居中
    width: 14,
    height: 28,
    borderRadius: 7,
    background: color.canvas,
    border: `1px solid ${color.hairline}`,
    boxShadow: shadow.l2,
    transform: 'translateX(-50%)',
    cursor: 'ew-resize',
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    zIndex: 3,
  };

  const labelStyle = (i: number): CSSProperties => ({
    position: 'absolute',
    left: `${pct(i)}%`,
    top: 44,
    transform: 'translateX(-50%)',
    fontSize: 11,
    // 第十二轮：弃 mono，与周视图 X 轴/全页数字字体统一
    fontFamily: font.family,
    fontVariantNumeric: 'tabular-nums',
    color: color.mute,
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ position: 'relative', height: 60, margin: `${space.sm}px ${space.xxxl - 12}px 0` }}>
      {/* 轨道 = 数据全集时间轴（16px 高，值轴滑杆风格） */}
      <div
        ref={trackRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 14,
          height: 16,
          borderRadius: radius.control,
          background: color.canvasSoft2,
          boxShadow: `inset 0 0 0 1px ${color.hairline}`,
        }}
      />
      {/* 窗口区间高亮（中间蓝色区可整体拖动平移） */}
      <div
        title="左右拖动：整体平移时间窗口（可越过当前筛选范围，筛选范围极值会跟着扩展）"
        aria-label="拖动平移时间窗口"
        style={{
          position: 'absolute',
          left: `${pct(s)}%`,
          width: `${pct(e + 1) - pct(s)}%`,
          top: 14,
          height: 16,
          borderRadius: radius.control,
          background: `${color.link}${panning ? '40' : '26'}`,
          boxShadow: `inset 0 0 0 1px ${color.link}59`,
          cursor: panning ? 'grabbing' : 'grab',
          touchAction: 'none',
          zIndex: 1,
        }}
        onPointerDown={onDragDown('pan')}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      />
      {/* 双端拖柄（缩放窗口宽度，语义保留；加高 + 握把纹理） */}
      <div
        style={{ ...handleStyle, left: `${pct(s)}%` }}
        onPointerDown={onDragDown('start')}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <span style={{ width: 2, height: 12, borderRadius: 1, background: color.hairlineStrong }} />
        <span style={{ width: 2, height: 12, borderRadius: 1, background: color.hairlineStrong }} />
      </div>
      <div
        style={{ ...handleStyle, left: `${pct(e + 1)}%` }}
        onPointerDown={onDragDown('end')}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <span style={{ width: 2, height: 12, borderRadius: 1, background: color.hairlineStrong }} />
        <span style={{ width: 2, height: 12, borderRadius: 1, background: color.hairlineStrong }} />
      </div>
      {/* 固定箭头：轨道最左/最右两端，点击 = 窗口整体平移一个步长（到数据边界置灰） */}
      <button
        type="button"
        title="窗口整体前移一个步长（更早）"
        aria-label="窗口前移一个步长"
        disabled={!canLeft}
        style={{ ...btnStyle(canLeft), left: -30 }}
        onClick={() => {
          const w = shiftWindow(s, e, n, step, -1);
          onChange(w.s, w.e);
        }}
      >
        ‹
      </button>
      <button
        type="button"
        title="窗口整体后移一个步长（更晚）"
        aria-label="窗口后移一个步长"
        disabled={!canRight}
        style={{ ...btnStyle(canRight), right: -30 }}
        onClick={() => {
          const w = shiftWindow(s, e, n, step, 1);
          onChange(w.s, w.e);
        }}
      >
        ›
      </button>
      {/* 窗口端点桶标记（mono 技术标记） */}
      <div style={labelStyle(s)}>{buckets[s].xLabel}</div>
      <div style={labelStyle(e)}>{buckets[e].xLabel}</div>
    </div>
  );
}
