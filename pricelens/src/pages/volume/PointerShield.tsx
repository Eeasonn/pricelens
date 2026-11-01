// 量价面板绘图区的指针承接层：盖在主图绘图区（含底部日期标签带）之上，
// 统一接管悬停列、水平参考位与拖选区间（视觉 demo：chart-stack 的 pointer 交互）。
// - 悬停 → onHover(列)；移出 → onHover(null)（拖动中不移出）
// - 拖动 → onBrush(区间, false) 实时预览；松手 → onBrush(区间, true) 提交
// - 按下即从单周起选，拖动扩展（点击 = 选单周；清除走区间胶囊的 ×）
// - onCrossY 上报鼠标纵向位置（容器坐标、钳入绘图区），驱动跨面板横向虚线
// 竖向定位线、标注尺等视觉全部由面板层自绘，本层不画任何东西。
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface DragState {
  anchor: number;
  current: number;
  moved: boolean;
}

export default function PointerShield(props: {
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  /** 绘图区之下仍要接管的高度（底部日期标签带），避免悬停标签带漏出浮层 */
  extraBottom: number;
  n: number;
  onHover: (index: number | null) => void;
  onBrush: (range: [number, number] | null, committing: boolean) => void;
  onCrossY: (y: number | null) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);

  const idxAt = (clientX: number): number | null => {
    const el = ref.current;
    if (!el || props.n <= 0 || props.plotWidth <= 0) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    if (x < 0 || x > props.plotWidth) return null;
    return Math.min(props.n - 1, Math.max(0, Math.floor(x / (props.plotWidth / props.n))));
  };

  const yAt = (clientY: number): number | null => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top + props.plotTop;
    return Math.min(props.plotTop + props.plotHeight, Math.max(props.plotTop, y));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const index = idxAt(event.clientX);
    if (index == null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { anchor: index, current: index, moved: false };
    props.onHover(index);
    props.onBrush([index, index], false);
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    let index = idxAt(event.clientX);
    if (index == null) {
      // 拖选中指针越出绘图区：钳到边缘桶继续预览，不冻结在缘内最后一列
      // （2026-11-01 审查；悬停（非拖动）仍要求指针在绘图区内）。
      if (!drag.current || props.n <= 0) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      if (x < 0 && drag.current.anchor <= 0) return; // 起点已在最左列，左侧无可选
      if (x > props.plotWidth && drag.current.anchor >= props.n - 1) return; // 同理最右
      index = Math.min(props.n - 1, Math.max(0, Math.floor(Math.min(Math.max(0, x), props.plotWidth) / (props.plotWidth / props.n))));
    }
    props.onHover(index);
    const y = yAt(event.clientY);
    if (y != null) props.onCrossY(y);
    const state = drag.current;
    if (state) {
      if (index !== state.anchor) state.moved = true;
      state.current = index;
      props.onBrush([Math.min(state.anchor, index), Math.max(state.anchor, index)], false);
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean): void => {
    const state = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!state) return;
    if (commit) {
      props.onBrush([Math.min(state.anchor, state.current), Math.max(state.anchor, state.current)], true);
    } else {
      props.onBrush(null, false);
    }
  };

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        left: props.plotLeft,
        top: props.plotTop,
        width: props.plotWidth,
        height: props.plotHeight + props.extraBottom,
        zIndex: 3,
        cursor: 'crosshair',
        touchAction: 'pan-y',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endDrag(event, true)}
      onPointerCancel={(event) => endDrag(event, false)}
      onPointerLeave={() => {
        if (drag.current) return;
        props.onHover(null);
        props.onCrossY(null);
      }}
    />
  );
}
