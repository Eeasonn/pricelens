// ============================================================
// §6.6 Y 轴伸缩滑杆（第七轮瘦身后仅存件）：
// 上下拖柄（手动调 min/max）已随「Y 轴纯自适应」删除；滑杆保留——
// 只缩放每格像素高度、不改刻度值（computeYAxis：plotHeight = 格数×TICK_PX×scale），
// 双击复位 ×1。自绘（第三轮反馈：弃用 antd 深色默认样式）：
// 4px 浅灰轨道 + 22×14 白底握把，沿 gutter 中心线，视觉语言与 X 刷选条一致
// （canvas 白底 + hairline 描边 + 浅投影，hover/拖动变蓝，无深黑色）。
// ============================================================
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { color, radius, shadow } from '../../theme/tokens';

export interface YAxisResizerProps {
  /** 图表容器高（由 Y 模型派生：格数×TICK_PX×滑杆倍率 + 断裂条 + 图顶卡片区 + 底边距） */
  height: number;
  /** 绘图区顶（容器内）：滑杆轨道定位基准 */
  plotTop: number;
  /** 绘图区高：滑杆轨道不超出绘图区 */
  plotHeight: number;
  sliderScale: number;
  onSliderScale: (v: number) => void;
  children: ReactNode;
}

const GUTTER_CENTER = 13; // 26px gutter 的中心线：握把/轨道共线
const SLIDER_MIN = 0.5;
const SLIDER_MAX = 3;

export default function YAxisResizer(props: YAxisResizerProps) {
  const { height, plotTop, plotHeight, sliderScale, onSliderScale, children } = props;
  const [scaleLit, setScaleLit] = useState(false);

  // ---- 纵向步长滑杆（自绘）：轨道沿 gutter 中心线，握把位置 = scale 在 [0.5, 3] 的映射 ----
  // 轨道定长（不随倍率伸缩）：倍率映射在任何时刻都基于同一几何，拖动中直接操纵握把
  // 跟手 1:1，松手按 frac 反推的位置与拖动位置零落差（若轨道随倍率变长会产生回落跳变）
  const TRACK_H = 200;
  const trackTop = plotTop + 2;
  const trackH = Math.max(60, Math.min(TRACK_H, plotHeight - 4));
  const frac = (sliderScale - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);

  // 拖动中握把 = 指针位置 + 抓取偏移（直接操纵，1:1 跟手）。轨道高度本身随倍率变化，
  // 若按"倍率 → 活动轨道几何"反推握把会正反馈跑赢手指（倍率越高越快），故拖动期间
  // 握把像素位置由指针驱动，倍率改从握把位置反推；松手后两者天然一致，无回落跳变。
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scaleDragRef = useRef<{ rootTop: number; grabOffset: number } | null>(null);
  const [scaleDragCenter, setScaleDragCenter] = useState<number | null>(null);

  const onScaleDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    const tr = trackRef.current?.getBoundingClientRect();
    if (!tr) return;
    const handleRect = ev.currentTarget.getBoundingClientRect();
    scaleDragRef.current = {
      rootTop: tr.top - (trackTop + 2), // 容器顶 = 轨道顶 - 轨道 top 偏移
      grabOffset: handleRect.top + handleRect.height / 2 - ev.clientY,
    };
    setScaleDragCenter(handleRect.top + handleRect.height / 2);
    setScaleLit(true);
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onScaleMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = scaleDragRef.current;
    const tr = trackRef.current?.getBoundingClientRect();
    if (!d || !tr) return;
    const center = Math.min(tr.bottom - 7, Math.max(tr.top + 7, ev.clientY + d.grabOffset));
    setScaleDragCenter(center);
    const f = Math.min(1, Math.max(0, (tr.bottom - center) / tr.height));
    const v = Math.round((SLIDER_MIN + f * (SLIDER_MAX - SLIDER_MIN)) / 0.05) * 0.05;
    if (v !== sliderScale) onSliderScale(v); // 吸附 0.05 步进
  };
  const onScaleUp = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!scaleDragRef.current) return;
    scaleDragRef.current = null;
    setScaleDragCenter(null);
    setScaleLit(false);
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };
  const handleCY =
    scaleDragCenter != null && scaleDragRef.current ? scaleDragCenter - scaleDragRef.current.rootTop : trackTop + trackH - frac * trackH;

  // 与 X 刷选条一致的件样式（白底 + hairline + 浅投影，激活变蓝）
  const pillBase = (active: boolean): CSSProperties => ({
    background: active ? color.link : color.canvas,
    border: `1px solid ${active ? color.link : color.hairline}`,
    boxShadow: shadow.l2,
  });

  return (
    <div style={{ position: 'relative' }}>
      {/* 图表容器（高度 = 格数×TICK_PX×滑杆倍率 + 断裂条 + 上下边距） */}
      <div style={{ height, position: 'relative' }}>{children}</div>
      {/* 纵向步长滑杆（自绘，常驻 Y 轴左侧）：只缩放每格像素高、不改刻度值；双击轨道/握把复位 ×1 */}
      <div
        style={{ position: 'absolute', left: 0, top: 0, width: GUTTER_CENTER * 2, height, zIndex: 5, pointerEvents: 'none' }}
      >
        {/* 轨道 */}
        <div
          ref={trackRef}
          title="每格高度：不改变 Y 轴刻度值，只调整纵向间距（双击复位 ×1.00）"
          onDoubleClick={() => onSliderScale(1)}
          style={{
            position: 'absolute',
            left: GUTTER_CENTER - 2,
            top: trackTop,
            width: 4,
            height: trackH,
            borderRadius: radius.pill,
            background: color.canvasSoft2,
            boxShadow: `inset 0 0 0 1px ${color.hairline}`,
            pointerEvents: 'auto',
          }}
        />
        {/* 滑杆握把 */}
        <div
          role="slider"
          aria-label="每格高度倍率"
          aria-valuemin={SLIDER_MIN}
          aria-valuemax={SLIDER_MAX}
          aria-valuenow={sliderScale}
          title="拖动调整每格高度（不改变刻度值）；双击复位 ×1.00"
          style={{
            position: 'absolute',
            left: GUTTER_CENTER - 11,
            top: handleCY - 7,
            width: 22,
            height: 14,
            borderRadius: radius.control,
            cursor: 'ns-resize',
            touchAction: 'none',
            pointerEvents: 'auto',
            ...pillBase(scaleLit),
          }}
          onPointerDown={onScaleDown}
          onPointerMove={onScaleMove}
          onPointerUp={onScaleUp}
          onDoubleClick={() => onSliderScale(1)}
          onPointerEnter={() => setScaleLit(true)}
          onPointerLeave={() => setScaleLit((v) => (scaleDragRef.current ? v : false))}
        >
          <svg width="12" height="8" viewBox="0 0 12 8" style={{ display: 'block', margin: '0 auto', marginTop: 2 }} aria-hidden>
            <path d="M1.5 2.5 H10.5" stroke={scaleLit ? color.onPrimary : color.hairlineStrong} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
