// ============================================================
// §6.3 月/季视图悬停下钻（第二十轮）：悬停竖线上有值的数据点变「下钻」图标
// （放大镜+，白底黑图标，与周视图跳转图标同款式）。点击触发与圈点点击相同的
// 下钻弹窗（季→月→周 / 月→周）。missing/无值点不渲染（由调用方过滤）。
// ============================================================
import type { CSSProperties, MouseEvent } from 'react';
import { color, radius, shadow } from '../../theme/tokens';

export default function DrillIcon({
  x,
  y,
  title,
  onClick,
}: {
  x: number;
  y: number;
  title: string;
  onClick: () => void;
}) {
  const style: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    transform: 'translate(-50%, -50%)',
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    background: color.canvas,
    border: `1px solid ${color.hairline}`,
    boxShadow: shadow.l2,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    padding: 0,
    zIndex: 8,
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      style={style}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
        <circle cx="4.4" cy="4.4" r="3" stroke={color.ink} strokeWidth="1.3" fill="none" />
        <path d="M6.8 6.8 L9.6 9.6" stroke={color.ink} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M4.4 2.9 V5.9 M2.9 4.4 H5.9" stroke={color.ink} strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </button>
  );
}
