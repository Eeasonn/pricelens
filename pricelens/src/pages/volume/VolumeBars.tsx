// ============================================================
// 第一百一十三轮（2026-10-21）量价看板 · 面板底部销量柱层：SVG 画在价格折线
// （ECharts 画布）之下。柱高线性 = v/vMax（上限恒自动 niceCeil，对数分支已删）；
// 柱区高默认占绘图区 34%，由图右侧「销量轴」拉伸柄上下拖动在 12%..100% 间调节，
// 双击恢复 34%（bandFrac 由 VolumePrice 持有，随 yAxisResetKey 复位）。
// 拉伸轴 = DOM 覆盖层：竖向轨道（柱区顶→绘图区底）+ 顶端 ns-resize 圆形拖柄 +
// 三枚刻度（顶 = 上限 / 中 = 半上限 / 底 = 0），替换原画在绘图区内的右缘小字。
// 第一百一十四轮（评审）：①拖柄改圆形（11px，比旧 18px 胶囊窄）并右移到轨道
// 右侧（避开右对齐的刻度数字）②柱区顶横跨绘图区的虚线删除（不再往左拉虚线）。
// 横向几何由 Chart.onGeom 上报（StripGeom），纵向 = 面板 gridTop + 共享 yScale.plotHeight。
// ============================================================
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { StripGeom } from '../../chart/PriceTrend/helpers';
import { color, selectAccent, selectSoft } from '../../theme/tokens';
import { fmtVolume } from './volumeAxis';

/** 柱区高占绘图区比例：默认 / 下限 / 上限（拉伸柄拖动与双击复位共用） */
export const BAND_FRAC_DEFAULT = 0.34;
export const BAND_FRAC_MIN = 0.12;
export const BAND_FRAC_MAX = 1;

function clampFrac(v: number): number {
  return Math.min(BAND_FRAC_MAX, Math.max(BAND_FRAC_MIN, v));
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function VolumeBars(props: {
  geom: StripGeom | null;
  /** 绘图区顶（面板 gridTop） */
  plotTop: number;
  plotHeight: number;
  values: (number | null)[];
  vMax: number;
  color: string;
  hoverIdx: number | null;
  /** 柱区高占绘图区比例（0.12..1） */
  bandFrac: number;
  onBandFrac: (v: number) => void;
}) {
  // 拖柄状态（钩子须在早退 return 之前）
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const dragStart = useRef<{ clientY: number; frac: number } | null>(null);

  const { geom, values, vMax } = props;
  if (!geom || geom.n <= 0 || !(props.plotHeight > 0) || !(vMax > 0)) return null;

  const frac = clampFrac(props.bandFrac);
  const zoneH = props.plotHeight * frac;
  const zoneTop = props.plotTop + props.plotHeight - zoneH;
  const plotBottom = props.plotTop + props.plotHeight;
  const colW = geom.plotWidth / geom.n;
  const barW = Math.max(1, 0.62 * colW);
  const bars = values.map((v, i) => {
    if (v == null || v <= 0) return null;
    const h = Math.min(zoneH, Math.max(1, (v / vMax) * zoneH));
    const cx = geom.plotLeft + colW * (i + 0.5);
    return { i, x: cx - barW / 2, y: zoneTop + (zoneH - h), w: barW, h, lit: props.hoverIdx === i };
  });

  // ---- 右侧拉伸轴：几何（绘图区右留白 GRID.right=24 内；轨道居中，圆形拖柄再右移避刻度） ----
  const axisX = geom.plotLeft + geom.plotWidth + 11;
  const handleX = axisX + 4; // 第一百一十四轮：拖柄右移——与右对齐刻度数字（止于 axisX−5）拉开间距
  const active = dragging || hovered;

  // 拖动数学：指针上移 dy<0 → 柱区顶上移、柱区变高；frac = 起始frac − dy/绘图区高
  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { clientY: e.clientY, frac };
    setDragging(true);
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const start = dragStart.current;
    if (!start) return;
    const dy = e.clientY - start.clientY;
    props.onBandFrac(clampFrac(start.frac - dy / props.plotHeight));
  };
  const onHandleUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragStart.current = null;
    setDragging(false);
  };

  const tickStyle = (top: number): CSSProperties => ({
    position: 'absolute',
    left: axisX - 5,
    top,
    transform: 'translateX(-100%)',
    fontSize: 9,
    lineHeight: '10px',
    color: color.mute,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 1px 2px #fff', // 白底描边，压住柱与线
  });

  return (
    <>
      {/* 柱层：价格线之下（第一百一十四轮：柱区顶虚线删除——评审「手柄往左对过来的
          虚线删除」；柱区高度由右侧轨道+刻度表达） */}
      <svg
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
      >
        {bars.map((b) =>
          b == null ? null : (
            <rect key={b.i} x={b.x} y={b.y} width={b.w} height={b.h} rx={1} fill={hexToRgba(props.color, b.lit ? 0.38 : 0.18)} />
          ),
        )}
      </svg>
      {/* 右侧销量轴（DOM 覆盖层，仅拖柄可交互） */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
        <div
          style={{
            position: 'absolute',
            left: axisX,
            top: zoneTop,
            width: 2,
            height: Math.max(0, plotBottom - zoneTop),
            transform: 'translateX(-50%)',
            background: color.hairlineStrong,
            borderRadius: 1,
            opacity: 0.8,
          }}
        />
        {/* 第一百一十四轮（评审）：圆形拖柄（11px），右移避开刻度数字，双纹改中心单点 */}
        <div
          title="拖动拉伸销量轴，双击恢复"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onDoubleClick={() => props.onBandFrac(BAND_FRAC_DEFAULT)}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          style={{
            position: 'absolute',
            left: handleX,
            top: zoneTop,
            transform: 'translate(-50%, -50%)',
            width: 11,
            height: 11,
            borderRadius: '50%',
            boxSizing: 'border-box',
            display: 'grid',
            placeItems: 'center',
            background: active ? selectSoft : color.canvas,
            border: `1.5px solid ${active ? selectAccent : color.hairlineStrong}`,
            boxShadow: active ? '0 1px 4px rgba(0, 112, 243, 0.25)' : '0 1px 2px rgba(15, 26, 34, 0.08)',
            cursor: 'ns-resize',
            pointerEvents: 'auto',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          <span
            style={{
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: active ? selectAccent : color.mute,
            }}
          />
        </div>
        <span className="tnum" style={tickStyle(zoneTop - 5)}>
          {fmtVolume(vMax)}
        </span>
        <span className="tnum" style={tickStyle(zoneTop + zoneH / 2 - 5)}>
          {fmtVolume(vMax / 2)}
        </span>
        <span className="tnum" style={tickStyle(plotBottom - 5)}>
          0
        </span>
      </div>
    </>
  );
}
