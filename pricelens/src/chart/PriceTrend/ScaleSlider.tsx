// ============================================================
// 每格高度横向滑杆（第十轮）：收进图内币种符号旁的齿轮弹层（Popover）里，
// 不占任何纵向/横向版面。只缩放每格像素高（0.5×–3×，不改刻度值），双击复位 ×1。
// 交互：拖动中握把 1:1 跟手（仅视觉），松手才提交 —— 与时间刷选一致，
// 避免拖动过程中图表高度实时变化带来的晃动感（用户反馈：调节完再统一自适应）。
// 样式沿用 X 刷选条语言：浅灰轨道 + 白底握把 + hairline 描边，悬停/拖动变蓝。
// ============================================================
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { color, fontSize, radius, shadow } from '../../theme/tokens';

const SLIDER_MIN = 0.5;
const SLIDER_MAX = 3;
const TRACK_W = 180;
const GRIP_W = 14;
const GRIP_H = 22;

export default function ScaleSlider({ scale, onCommit }: { scale: number; onCommit: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ grabOffset: number } | null>(null);
  // 拖动中的握把视觉位置（相对轨道左缘 px）；null = 未拖动（按 scale 映射）
  const [dragLeft, setDragLeft] = useState<number | null>(null);
  const [lit, setLit] = useState(false);

  const fracOf = (clientX: number): number => {
    const tr = trackRef.current?.getBoundingClientRect();
    if (!tr) return 0;
    return Math.min(1, Math.max(0, (clientX - tr.left - GRIP_W / 2) / Math.max(1, tr.width - GRIP_W)));
  };
  const scaleOf = (frac: number): number =>
    Math.round((SLIDER_MIN + frac * (SLIDER_MAX - SLIDER_MIN)) / 0.05) * 0.05;

  const onDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation(); // 握把按下不再冒泡进轨道 handler（单一路径，避免二次 setPointerCapture）
    dragRef.current = { grabOffset: 0 };
    setDragLeft(fracOf(ev.clientX) * (TRACK_W - GRIP_W));
    setLit(true);
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setDragLeft(fracOf(ev.clientX) * (TRACK_W - GRIP_W));
  };
  const onUp = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setLit(false);
    onCommit(scaleOf(fracOf(ev.clientX))); // 松手统一提交（拖动中不触发图表重算）
    setDragLeft(null);
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const frac = (scale - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);
  const gripLeft = dragLeft ?? frac * (TRACK_W - GRIP_W);

  const pill = (active: boolean): CSSProperties => ({
    background: active ? color.link : color.canvas,
    border: `1px solid ${active ? color.link : color.hairline}`,
    boxShadow: shadow.l2,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 22 }}>
      {/* 轨道（含可点热区） */}
      <div
        ref={trackRef}
        onDoubleClick={() => onCommit(1)}
        style={{
          position: 'relative',
          width: TRACK_W,
          height: GRIP_H,
          display: 'flex',
          alignItems: 'center',
          cursor: 'ew-resize',
          touchAction: 'none',
        }}
        onPointerDown={(ev) => {
          // 点轨道 = 握把跳到该处并进入拖动
          ev.preventDefault();
          const tr = trackRef.current?.getBoundingClientRect();
          if (!tr) return;
          const left = Math.min(TRACK_W - GRIP_W, Math.max(0, ev.clientX - tr.left - GRIP_W / 2));
          dragRef.current = { grabOffset: 0 };
          setDragLeft(left);
          setLit(true);
          (ev.currentTarget.querySelector('[role="slider"]') as HTMLElement | null)?.setPointerCapture(ev.pointerId);
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 4,
            transform: 'translateY(-50%)',
            borderRadius: radius.pill,
            background: color.canvasSoft2,
            boxShadow: `inset 0 0 0 1px ${color.hairline}`,
          }}
        />
        {/* 握把（三道横纹） */}
        <div
          role="slider"
          aria-label="每格高度倍率"
          aria-valuemin={SLIDER_MIN}
          aria-valuemax={SLIDER_MAX}
          aria-valuenow={scale}
          title={`×${scale.toFixed(2)}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onDoubleClick={() => onCommit(1)}
          onPointerEnter={() => setLit(true)}
          onPointerLeave={() => setLit((v) => (dragRef.current ? v : false))}
          style={{
            position: 'absolute',
            left: gripLeft,
            top: 0,
            width: GRIP_W,
            height: GRIP_H,
            borderRadius: 7,
            cursor: 'ew-resize',
            touchAction: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            ...pill(lit),
          }}
        >
          {[-3, 0, 3].map((dy) => (
            <span
              key={dy}
              style={{ width: 2, height: 8, borderRadius: 1, background: lit ? color.onPrimary : color.hairlineStrong }}
            />
          ))}
        </div>
      </div>
      <span className="tnum" style={{ fontSize: fontSize.caption, color: color.body, whiteSpace: 'nowrap' }}>
        ×{scale.toFixed(2)}
      </span>
    </div>
  );
}
