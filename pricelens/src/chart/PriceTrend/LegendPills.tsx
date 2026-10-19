// ============================================================
// 图例页签整排：合并模式由看板层注入图顶工具行中央，底部时间区域只承担
// 时间轴和窗口调整；分离模式（第七十五轮）按面板拆开，放进各卡片顶部
// 居中位置——只列该卡片对应的产品，两侧提示性小箭头可滚动查看（PillRowScroller）。
// 点击页签 = 屏蔽/恢复该系列折线。隐藏态 = 虚线边 + 降透明（原视觉不变）。
// ============================================================
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import type { Series } from '../../dataModel/types';
import { curveNameOf } from './chartModel';
import { color, radius } from '../../theme/tokens';

export default function LegendPills(props: {
  series: Series[];
  hiddenKeys: Set<string>;
  onToggle: (key: string) => void;
  /** 第七十五轮：true = 纯行（无居中/自带滚动/内边距），交给外层 PillRowScroller 承担 */
  bare?: boolean;
}) {
  if (props.series.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'center',
        gap: 4,
        ...(props.bare ? {} : { justifyContent: 'center', overflowX: 'auto', padding: '6px 0 2px' }),
      }}
    >
      {props.series.map((s) => {
        const hidden = props.hiddenKeys.has(s.key);
        return (
          <span
            key={s.key}
            role="button"
            title={hidden ? '点击恢复显示该产品' : '点击屏蔽该产品'}
            onClick={() => props.onToggle(s.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              padding: '0 10px',
              fontSize: 11,
              lineHeight: '18px',
              borderRadius: radius.pill,
              flexShrink: 0,
              maxWidth: 200,
              background: color.canvas,
              border: `1px ${hidden ? 'dashed' : 'solid'} ${hidden ? color.hairlineStrong : color.hairline}`,
              opacity: hidden ? 0.45 : 1,
              cursor: 'pointer',
            }}
          >
            <BrandDot brand={s.brand} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.body }}>
              {curveNameOf(s)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** 页签行两侧提示性小箭头（第七十五轮建；第七十六轮改显隐）：页签行显示不下时
 * 才出现左右箭头供用户挪动查看，放得下或该侧已到边缘时隐藏（占位保留防跳动）。
 * 滚动容器隐藏系统滚动条（.lpl-pill-scroll）；外层需给收窄空间（minWidth: 0）。 */
export function PillRowScroller(props: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const sync = (): void => {
      const el = scrollRef.current;
      if (!el) return;
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      setEdge((prev) => {
        const next = { left: el.scrollLeft > 2, right: max - el.scrollLeft > 2 };
        return prev.left === next.left && prev.right === next.right ? prev : next;
      });
    };
    sync();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    // 首帧字体/布局未稳会测到瞬态溢出：字体就绪与短延迟各补测一次
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
  }, []);
  // 渲染后兜底自校：容器宽度还会随「每行 2/3 个」切换、时点面板展开等
  // 非窗口事件变化；IAB 环境里 ResizeObserver 也存在不派发的情况（实测）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    setEdge((prev) => {
      const next = { left: el.scrollLeft > 2, right: max - el.scrollLeft > 2 };
      return prev.left === next.left && prev.right === next.right ? prev : next;
    });
  });
  const nudge = (dir: -1 | 1): void =>
    scrollRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  const arrowStyle = (on: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 3px',
    cursor: on ? 'pointer' : 'default',
    flexShrink: 0,
    visibility: on ? 'visible' : 'hidden', // 该侧无可挪动内容 = 不出现（占位防跳动）
  });
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, minWidth: 0, maxWidth: '100%' }}>
      <span
        role="button"
        aria-label="查看左侧产品"
        title="查看左侧产品"
        aria-hidden={!edge.left}
        onClick={() => nudge(-1)}
        style={arrowStyle(edge.left)}
      >
        <LeftOutlined style={{ fontSize: 10, color: color.mute }} />
      </span>
      <div ref={scrollRef} className="lpl-pill-scroll" style={{ overflowX: 'auto', minWidth: 0 }}>
        {props.children}
      </div>
      <span
        role="button"
        aria-label="查看右侧产品"
        title="查看右侧产品"
        aria-hidden={!edge.right}
        onClick={() => nudge(1)}
        style={arrowStyle(edge.right)}
      >
        <RightOutlined style={{ fontSize: 10, color: color.mute }} />
      </span>
    </span>
  );
}
