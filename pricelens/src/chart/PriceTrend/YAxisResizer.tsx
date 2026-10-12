// ============================================================
// §6.6 Y 轴控制（第三轮反馈改造）：
// 优先级 = 拖柄(min/max) > 档位 chips > 自动；纵向滑杆常驻 Y 轴左侧 gutter
// （estGridLeft 已加宽 26px 让位），**只缩放每格像素高度、不改刻度值**
// （computeYAxis：plotHeight = 格数×TICK_PX×scale，min/max/interval 不变），双击复位 ×1。
// 滑杆自绘（第三轮反馈：弃用 antd 深色默认样式）：4px 浅灰轨道 + 22×14 白底握把，
// 与上/下箭头拖柄、轨道全部沿 gutter 中心线对齐，视觉语言与 X 刷选条一致
// （canvas 白底 + hairline 描边 + 浅投影，hover/拖动变蓝，无深黑色）。
// 上柄 = 调整 Y 轴 max：上拉 max 增大；下柄 = 调整 Y 轴 min：下拉减小。
// 吸附 = 迟滞整格（snapHandleDrag + refCells）：指针跨满一整格才跳一格，1:1 跟手不窜格。
// 柄体缩窄（44px）完全居于 Y 轴左侧，贴绘图区上/下缘等距 3px。
// 首次拖动 = 以当前自动/档位几何冻结起点进入手动态（onManualEnter，之后 chips 被柄覆盖）。
// ============================================================
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { color, radius, shadow } from '../../theme/tokens';
import { snapHandleDrag, type HandleDragBase, type YManualRange } from './helpers';

export type { YManualRange } from './helpers';

export interface YAxisResizerProps {
  /** 图表容器高（由 Y 模型派生：格数×TICK_PX×滑杆倍率 + 图顶卡片区 + 底边距） */
  height: number;
  /** Y 轴列宽（gridLeft）：滑杆 gutter 定位基准 */
  axisWidth: number;
  /** 当前几何（指针按下瞬间捕获为换算基准；同时用于拖柄贴边定位）；null 时柄不响应 */
  axis: HandleDragBase | null;
  /** 首次拖动：以当前几何冻结进入手动态（上层写入 manual 状态） */
  onManualEnter: (freeze: YManualRange) => void;
  /** 拖动换算结果（已吸附/夹取）写回上层 */
  onHandle: (next: YManualRange) => void;
  sliderScale: number;
  onSliderScale: (v: number) => void;
  children: ReactNode;
}

type Pos = 'top' | 'bottom';

const GRIP_H = 22;
const GRIP_W = 44; // 缩窄：完全落在 Y 轴左侧 gutter，不与刻度区重叠
const GRIP_GAP = 3;
const GUTTER_CENTER = 13; // 26px gutter 的中心线：箭头/握把/轨道共线
const SLIDER_MIN = 0.5;
const SLIDER_MAX = 3;

export default function YAxisResizer(props: YAxisResizerProps) {
  const { height, axis, onManualEnter, onHandle, sliderScale, onSliderScale, children } = props;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ mode: Pos; topAbs: number; base: HandleDragBase; entered: boolean; refCells?: number } | null>(null);
  const [hover, setHover] = useState<Pos | null>(null);
  const [dragMode, setDragMode] = useState<Pos | null>(null);
  const [scaleLit, setScaleLit] = useState(false);

  const onDown = (mode: Pos) => (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!axis || !boxRef.current) return;
    ev.preventDefault();
    // 换算基准 = 按下瞬间的几何：step 与 TICK_PX 恒定 → 整个手势期间 px/价格 比例不变。
    // 迟滞锚点 = 按压点的整数格数（refCells 缺省分支）；首跳即有迟滞，不因柄心偏移窜格
    const yPress = ev.clientY - boxRef.current.getBoundingClientRect().top;
    const anchor = snapHandleDrag(yPress, mode, axis, undefined);
    dragRef.current = {
      mode,
      topAbs: boxRef.current.getBoundingClientRect().top,
      base: axis,
      entered: false,
      refCells: Math.round((anchor.max - anchor.min) / anchor.step),
    };
    setDragMode(mode);
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.entered) {
      d.entered = true;
      // 自动/档位下首次拖动 = 以当前 min/max/step 为起点进入手动态
      onManualEnter({ min: d.base.min, max: d.base.max, step: d.base.interval });
    }
    const next = snapHandleDrag(ev.clientY - d.topAbs, d.mode, d.base, d.refCells);
    // 迟滞基准推进到本次落定格数：指针相对它跨满一整格才跳下一格（1:1 跟手）
    d.refCells = Math.round((next.max - next.min) / next.step);
    onHandle(next);
  };
  const onUp = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragMode(null);
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const lit = (mode: Pos): boolean => dragMode === mode || hover === mode;
  const plotTop = axis?.plotTop ?? 0;
  const plotBottom = axis ? axis.plotTop + axis.plotHeight : height;

  // 拖柄/滑杆共用的件样式（对齐 X 刷选条：白底 + hairline + 浅投影，激活变蓝）
  const pillBase = (active: boolean): CSSProperties => ({
    background: active ? color.link : color.canvas,
    border: `1px solid ${active ? color.link : color.hairline}`,
    boxShadow: shadow.l2,
  });

  const gripStyle = (mode: Pos): CSSProperties => ({
    position: 'absolute',
    left: GUTTER_CENTER - GRIP_W / 2,
    // 贴绘图区上/下缘，等距 GRIP_GAP
    top: mode === 'top' ? plotTop - GRIP_H - GRIP_GAP : plotBottom + GRIP_GAP,
    width: GRIP_W,
    height: GRIP_H,
    borderRadius: radius.control,
    cursor: 'ns-resize',
    touchAction: 'none',
    display: 'grid',
    placeItems: 'center',
    transition: 'background .12s ease, border-color .12s ease',
    zIndex: 5,
    ...pillBase(lit(mode)),
  });

  // 单侧方向大箭头：上柄 ▲ / 下柄 ▼
  const grip = (mode: Pos) => (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={mode === 'top' ? '拖动调整 Y 轴最大值' : '拖动调整 Y 轴最小值'}
      title={mode === 'top' ? '上下拖动：调整 Y 轴最大值（Max）' : '上下拖动：调整 Y 轴最小值（Min）'}
      style={gripStyle(mode)}
      onPointerDown={onDown(mode)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerEnter={() => setHover(mode)}
      onPointerLeave={() => setHover((h) => (h === mode ? null : h))}
    >
      <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden>
        <path
          d={mode === 'top' ? 'M2.5 9.5 L8 2.5 L13.5 9.5' : 'M2.5 2.5 L8 9.5 L13.5 2.5'}
          fill="none"
          stroke={lit(mode) ? color.onPrimary : color.hairlineStrong}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );

  // ---- 纵向步长滑杆（自绘）：轨道沿 gutter 中心线，握把位置 = scale 在 [0.5, 3] 的映射 ----
  // 轨道定长（不随倍率伸缩）：倍率映射在任何时刻都基于同一几何，拖动中直接操纵握把
  // 跟手 1:1，松手按 frac 反推的位置与拖动位置零落差（若轨道随倍率变长会产生回落跳变）
  const TRACK_H = 200;
  const trackTop = plotTop + 2;
  const trackH = TRACK_H;
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
    if (!tr || !boxRef.current) return;
    const handleRect = ev.currentTarget.getBoundingClientRect();
    scaleDragRef.current = {
      rootTop: boxRef.current.getBoundingClientRect().top,
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
  const handleCY = scaleDragCenter != null && scaleDragRef.current ? scaleDragCenter - scaleDragRef.current.rootTop : trackTop + trackH - frac * trackH;

  return (
    <div style={{ position: 'relative' }}>
      {grip('top')}
      {/* 图表容器（高度 = 格数×TICK_PX×滑杆倍率 + 上下边距） */}
      <div ref={boxRef} style={{ height, position: 'relative' }}>
        {children}
      </div>
      {grip('bottom')}
      {/* 纵向步长滑杆（自绘，常驻 Y 轴左侧）：只缩放每格像素高、不改刻度值；双击轨道/握把复位 ×1。
          容器仅定位不接事件（pointerEvents none），否则会盖住两个箭头拖柄的左半边触发区 */}
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
        {/* 滑杆握把（与轨道、箭头共线居中） */}
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
