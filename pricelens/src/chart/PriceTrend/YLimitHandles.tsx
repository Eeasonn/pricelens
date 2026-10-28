// ============================================================
// Y 轴上下限拖柄（第一百六十六轮，Eason）：轴区上/下缘的细拖柄，拖动自定义
// 价格上限/下限——所选产品不变期间有效（换产品/换币种由看板层整体回自动）。
// 视觉与时间轴拖柄同语言（4px 圆角短棒、拖动中变蓝加宽），方向转 90°：
// 水平短棒、上下拖动；某侧处于自定义态时短棒常驻蓝色提示。双击 = 该侧恢复
// 自动；键盘 ↑/↓ = 步进一个刻度格。合并模式挂在 Chart 轴区、分离模式挂在
// 共享轴列（SplitAxisColumn），两处共用本组件。
// 纯交互壳：值/像素换算用最外侧段的线性映射，拖动中父层重算 Y 模型，拖柄
// 位置恒贴最新绘图区上下缘（跟随吸附后的整格边缘，与时间轴按桶吸附同手感）。
// ============================================================
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { radius, selectAccent, trackColors } from '../../theme/tokens';
import type { YScale } from './helpers';

export interface YLimitState {
  min: number | null;
  max: number | null;
}

type LimitKind = 'min' | 'max';

/** 上下限拖柄轨道高（命中区；短棒居中，与时间轴 28px 拖柄命中区同量级） */
const ZONE_H = 14;
/** 短棒宽（时间轴拖柄 28px 高的横向镜像） */
const GRIP_W = 26;

export default function YLimitHandles(props: {
  scale: YScale;
  /** 绘图区顶（容器坐标） */
  plotTop: number;
  plotHeight: number;
  /** 拖柄轨道宽 = 轴区宽（短棒在轨内居中） */
  trackWidth: number;
  /** 当前受控限位（null = 该侧自动） */
  limit: YLimitState;
  /** 限位提交（拖动中实时 / 双击传 null 恢复自动） */
  onLimit: (kind: LimitKind, v: number | null) => void;
}) {
  const { scale, plotTop, plotHeight, trackWidth, limit, onLimit } = props;
  const [active, setActive] = useState<LimitKind | null>(null);
  const dragRef = useRef<{ kind: LimitKind; startY: number; startV: number } | null>(null);
  if (scale.segs.length === 0) return null;

  // 拖拽值换算：上限贴最上段、下限贴最下段，段内线性映射（向下拖 dy>0：
  // 上限减 = 视口下移收顶；下限减 = 视口下移扩底——两侧同号，与手感一致）
  const segOf = (kind: LimitKind): { span: number; pH: number } =>
    kind === 'max'
      ? { span: scale.segs[0].max - scale.segs[0].min, pH: scale.segs[0].pH }
      : {
          span: scale.segs[scale.segs.length - 1].max - scale.segs[scale.segs.length - 1].min,
          pH: scale.segs[scale.segs.length - 1].pH,
        };
  const edgeValue = (kind: LimitKind): number => (kind === 'max' ? scale.max : scale.min);
  const fmt = (v: number): string => Math.round(v).toLocaleString('en-US');

  const onDown = (kind: LimitKind) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { kind, startY: e.clientY, startV: limit[kind] ?? edgeValue(kind) };
    setActive(kind);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const { span, pH } = segOf(d.kind);
    const v = d.startV - ((e.clientY - d.startY) * span) / Math.max(1, pH);
    onLimit(d.kind, v);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setActive(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKey = (kind: LimitKind) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    const step = scale.interval * (e.key === 'ArrowUp' ? 1 : -1);
    onLimit(kind, (limit[kind] ?? edgeValue(kind)) + step);
  };

  const zoneStyle = (kind: LimitKind): CSSProperties => ({
    position: 'absolute',
    left: 0,
    width: Math.max(trackWidth, GRIP_W + 8),
    height: ZONE_H,
    top: kind === 'max' ? plotTop - ZONE_H / 2 : plotTop + plotHeight - ZONE_H / 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'ns-resize',
    touchAction: 'none',
    zIndex: 6,
  });
  const gripStyle = (kind: LimitKind): CSSProperties => ({
    width: active === kind ? GRIP_W + 2 : GRIP_W,
    height: active === kind ? 6 : 4,
    borderRadius: radius.pill,
    background: active === kind || limit[kind] != null ? selectAccent : trackColors.handle,
    boxShadow: active === kind ? '0 1px 3px rgba(0, 112, 243, 0.28)' : undefined,
    pointerEvents: 'none',
  });

  return (
    <>
      {(['max', 'min'] as const).map((kind) => (
        <div
          key={kind}
          role="slider"
          tabIndex={0}
          aria-label={kind === 'max' ? 'Y 轴上限' : 'Y 轴下限'}
          aria-valuemin={kind === 'max' ? Math.round(scale.min + scale.interval) : 0}
          aria-valuemax={Math.round(kind === 'max' ? scale.max : scale.min + scale.interval)}
          aria-valuenow={Math.round(limit[kind] ?? edgeValue(kind))}
          aria-valuetext={`${fmt(limit[kind] ?? edgeValue(kind))}${limit[kind] != null ? '（自定义）' : '（自动）'}`}
          title={
            kind === 'max'
              ? '拖动调整价格上限，双击恢复自动'
              : '拖动调整价格下限，双击恢复自动'
          }
          style={zoneStyle(kind)}
          onPointerDown={onDown(kind)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onLimit(kind, null);
          }}
          onKeyDown={onKey(kind)}
        >
          <span style={gripStyle(kind)} />
        </div>
      ))}
    </>
  );
}
