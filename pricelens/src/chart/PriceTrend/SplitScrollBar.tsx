// ============================================================
// 分离轨道的常驻横向滑动块（第七十九轮）：macOS 原生滚动条悬浮且自动隐藏，
// 用户感知不到右侧还有面板——这里在轨道底部放一条高显性滑动块：溢出时才
// 渲染，支持拖拽滑块与点击轨道跳转；容器原生滚动条已隐藏（index.css）。
// ============================================================
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { color, radius } from '../../theme/tokens';

export default function SplitScrollBar({ trackRef }: { trackRef: RefObject<HTMLDivElement | null> }) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startLeft: number } | null>(null);
  const [st, setSt] = useState({ frac: 0, ratio: 1 });

  const sync = (): void => {
    const el = trackRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    setSt((prev) => {
      const next = {
        frac: max > 0 ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0,
        ratio: el.scrollWidth > 0 ? Math.min(1, el.clientWidth / el.scrollWidth) : 1,
      };
      return prev.frac === next.frac && prev.ratio === next.ratio ? prev : next;
    });
  };

  // 监听三件套与 PillRowScroller 同款：scroll/resize 事件 + 字体就绪/短延迟补测
  // + 每渲染自校（IAB 里 ResizeObserver 可能不派发，见 antd-ui-playwright-gotchas）
  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    document.fonts?.ready?.then(sync).catch(() => {});
    const t = window.setTimeout(sync, 350);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.clearTimeout(t);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    sync();
  });

  if (st.ratio >= 0.999) return null; // 放得下就不出现
  const thumbW = Math.max(10, st.ratio * 100);
  const scrollToFraction = (frac: number): void => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollLeft = Math.max(0, Math.min(max, frac * max));
  };
  const thumbStyle: CSSProperties = {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: `${st.frac * (100 - thumbW)}%`,
    width: `${thumbW}%`,
    borderRadius: radius.pill,
    background: '#a7abb4',
    cursor: 'grab',
  };
  return (
    <div
      ref={barRef}
      className="lpl-split-bar"
      role="scrollbar"
      aria-label="面板轨道横向滑动块"
      title="拖动滑块或点击此处左右查看更多面板"
      onPointerDown={(e) => {
        // 点击轨道空白：滑块中心跳到点击处
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        scrollToFraction((e.clientX - rect.left) / rect.width - st.ratio / 2);
      }}
      style={{ position: 'relative', height: 16, marginTop: 6, borderRadius: radius.pill, background: color.canvasSoft2, border: `1px solid ${color.hairline}`, cursor: 'pointer' }}
    >
      <div
        role="presentation"
        onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
          e.stopPropagation();
          const el = trackRef.current;
          if (!el) return;
          dragRef.current = { startX: e.clientX, startLeft: el.scrollLeft };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
          const el = trackRef.current;
          const d = dragRef.current;
          if (!el || !d) return;
          const barW = barRef.current?.clientWidth ?? 1;
          el.scrollLeft = d.startLeft + ((e.clientX - d.startX) / Math.max(1, barW)) * el.scrollWidth;
        }}
        onPointerUp={(e: ReactPointerEvent<HTMLDivElement>) => {
          dragRef.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        style={thumbStyle}
      />
    </div>
  );
}
