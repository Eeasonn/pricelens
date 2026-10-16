// ============================================================
// §6.5 X 轴时间刷选器（第十九轮修订）：
// - 轨道 = 上方筛选范围 [lo, hi]（不再 = 数据全集）：「下面的时间范围必须按上面
//   所选限制」。窗口 ⊆ 轨道：整体平移/双端拖柄一律钳在轨道内，不会改变筛选范围。
// - 例外 = ‹ › 固定箭头（轨道最左/最右两端）：点击 = 窗口整体平移一个步长
//   （周=4 周、月=1 月、季=1 季；‹ 向过去、› 向未来）；越出轨道的那一侧把上层
//   筛选范围极值扩展到窗口端点（RangePicker 最小/最大值随之变化，grow-only）。
//   手动模式箭头顶到数据全集边界才置灰；自适应（frozen）模式轨道即冻结范围，
//   箭头钳在轨道内、顶到轨道边界置灰。
// - 中间蓝色窗口区可整体拖动平移（按桶步进吸附、clamp 在轨道内），grab/grabbing；
// - 双端拖柄独立拖拽调窗宽（最小 4 桶；窄轨道 <4 桶时窗口 = 整个轨道）。
// - 主体样式加高（参考 Quick BI 值轴滑杆）：16px 高轨道 + 居中加高拖柄。
// 约束：窗口 ⊆ 轨道 ⊆ 数据全集 ∧ 窗口最小 4 桶；
// 无横向滚动条——窗口变化一律重采样重绘（上层按 [s,e] 切桶压满绘图宽度）。
// ============================================================
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { color, font, radius, shadow, space } from '../../theme/tokens';
import { MIN_WINDOW, panStep, panWindow, shiftWindow, type Bucket } from './helpers';

export interface XBrushProps {
  buckets: Bucket[]; // 数据全集时间轴（当前粒度全部桶；窗口/箭头下标基于全集）
  s: number; // 窗口起止下标（全集空间，恒 ⊆ [lo, hi]）
  e: number;
  lo: number; // 轨道 = 筛选范围 [lo, hi]（全集下标）
  hi: number;
  /** 第十九轮：时间自适应开 = 范围冻结（RangePicker 不可选、箭头不外扩轨道） */
  frozen: boolean;
  granularity: 'week' | 'month' | 'quarter';
  onChange: (s: number, e: number) => void;
  /** 拖动开始/结束（第九轮）：上层据此冻结 Y 轴自适应，松手统一重算一次 */
  onAdjusting?: (v: boolean) => void;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

type DragKind = 'start' | 'end' | 'pan';

export default function XBrush(props: XBrushProps) {
  const { buckets, s, e, lo, hi, frozen, granularity, onChange, onAdjusting } = props;
  const n = buckets.length;
  const trackRef = useRef<HTMLDivElement | null>(null);
  // 拖动基准 = 按下瞬间的窗口（startS/startE），避免用中间态反馈造成漂移
  const dragRef = useRef<{ kind: DragKind; startX: number; startS: number; startE: number } | null>(null);
  const [panning, setPanning] = useState(false);
  if (n === 0) return null;

  // 百分比相对轨道 [lo, hi]（轨道 = 筛选范围，不再 = 全集）
  const pct = (i: number): number => ((i - lo) / Math.max(1, hi - lo + 1)) * 100;
  const step = panStep(granularity);
  // 手动模式：箭头顶到数据全集边界才置灰（越出轨道的一侧由上层扩展范围极值）；
  // 自适应模式：范围冻结，箭头顶到轨道边界即置灰。
  const canLeft = frozen ? s > lo : s > 0;
  const canRight = frozen ? e < hi : e < n - 1;

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
      const delta = Math.round(((ev.clientX - d.startX) / rect.width) * (hi - lo + 1));
      // 平移钳在轨道 [lo, hi] 内（只有箭头能越出轨道扩展范围，第十九轮）
      const w = panWindow(d.startS, d.startE, lo, hi, delta);
      if (w.s !== s || w.e !== e) onChange(w.s, w.e);
      return;
    }
    const i = clamp(Math.floor(((ev.clientX - rect.left) / rect.width) * (hi - lo + 1)) + lo, lo, hi);
    if (d.kind === 'start') onChange(clamp(i, Math.min(lo, d.startE - (MIN_WINDOW - 1)), d.startE), d.startE);
    else onChange(d.startS, clamp(i, d.startS + MIN_WINDOW - 1, Math.max(hi, d.startS + MIN_WINDOW - 1)));
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
      {/* 窗口区间高亮（中间蓝色区可整体拖动平移，恒在轨道=筛选范围内） */}
      <div
        title="左右拖动：平移查看的时间段（不超出上方所选时间范围）"
        aria-label="平移时间段"
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
      {/* 固定箭头：轨道最左/最右两端，点击 = 窗口整体平移一个步长。
          手动模式越出轨道的一侧把筛选范围极值扩展到窗口端点（唯一改范围最小/最大值的入口）；
          自适应模式范围冻结，顶到轨道即置灰 */}
      <button
        type="button"
        title={frozen ? '窗口整体前移一个步长（更早）' : '窗口整体前移一个步长（更早；越过范围左缘时时间筛选器左极值同步扩展）'}
        aria-label="时间段前移一步"
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
        title={frozen ? '窗口整体后移一个步长（更晚）' : '窗口整体后移一个步长（更晚；越过范围右缘时时间筛选器右极值同步扩展）'}
        aria-label="时间段后移一步"
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
