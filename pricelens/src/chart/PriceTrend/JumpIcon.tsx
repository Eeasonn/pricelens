// ============================================================
// §6.4 周视图悬停跳转取证：悬停竖线上非空心数据点变"跳转商城"外链图标（↗）。
// 命中判定=悬停点左右相邻时间节点各占一半区间（由 Chart 的鼠标定位保证）；
// 空心（missing）点不渲染本图标（由调用方过滤）。点击 window.open(url)。
// ============================================================
import type { CSSProperties, MouseEvent } from 'react';
import { color, radius, shadow } from '../../theme/tokens';

export default function JumpIcon({ x, y, url }: { x: number; y: number; url: string }) {
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
      title="跳转商城"
      style={style}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        window.open(url, '_blank', 'noopener,noreferrer');
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path
          d="M2 8 L8 2 M3.5 2 H8 V6.5"
          stroke={color.ink}
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
