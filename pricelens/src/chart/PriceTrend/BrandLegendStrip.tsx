// ============================================================
// 品牌分组图例带（第一百一十五轮，评审）：价格看板（合并/分离两模式）的
// 产品名称从图表左侧名称带整体上移到图顶部——横向两行结构：
// 第一行 = 品牌名（每品牌块左上角，字号略大于产品药丸）；第二行 = 产品药丸
// （与原名称药丸同语言：品牌色点 + 名称，点击 = 屏蔽/恢复折线，悬停 = 该系列
// 高亮 + 图内起点指引虚线）。我司品牌块恒在最左；块间灰色短竖线
// 分隔；每品牌块最多预留两个产品的显示宽度，超出出现块内 ‹› 小箭头滚动；
// 整排放不下时区域两侧出现 ‹› 箭头滚动。
// ============================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { COMPETITOR_BRANDS } from '../../components/ProductCascader/tree';
import { curveNameOf } from './chartModel';
import type { Series } from '../../dataModel/types';
import { color, radius } from '../../theme/tokens';

/** 药丸行最多并排展示的产品数（超出走块内 ‹› 滚动） */
const PILLS_VISIBLE = 2;
/** 单个药丸的展示宽度预算（块内滚动容器 maxWidth = 2×预算 + 间距） */
const PILL_W_BUDGET = 178;

interface PillSpec {
  key: string;
  brand: string;
  text: string;
  hidden: boolean;
}

interface BlockSpec {
  brand: string;
  label: string;
  pills: PillSpec[];
}

/** 系列全集 → 品牌块（我司在前，其余按矩阵品牌序，未知品牌字母序殿后） */
function blocksOf(series: Series[], hiddenKeys: Set<string>): BlockSpec[] {
  const byBrand = new Map<string, PillSpec[]>();
  const ownBrandOf = series.find((s) => s.isOwn)?.brand;
  for (const s of series) {
    const arr = byBrand.get(s.brand) ?? [];
    arr.push({ key: s.key, brand: s.brand, text: curveNameOf(s), hidden: hiddenKeys.has(s.key) });
    byBrand.set(s.brand, arr);
  }
  const rank = (b: string): number => {
    if (b === ownBrandOf) return -1;
    const i = COMPETITOR_BRANDS.indexOf(b);
    return i >= 0 ? i : COMPETITOR_BRANDS.length;
  };
  return [...byBrand.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([brand, pills]) => ({ brand, label: brandLabelOf(brand), pills }));
}

function Pill({
  pill,
  dimmed,
  onToggle,
  onHover,
}: {
  pill: PillSpec;
  dimmed: boolean;
  onToggle: (key: string) => void;
  onHover: (key: string | null) => void;
}) {
  return (
    <span
      role="button"
      aria-pressed={pill.hidden}
      title={pill.hidden ? '点击恢复显示该产品' : '点击屏蔽该产品'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(pill.key);
      }}
      onMouseEnter={() => onHover(pill.key)}
      onMouseLeave={() => onHover(null)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        maxWidth: PILL_W_BUDGET,
        padding: '3px 8px',
        background: color.canvas,
        border: `1px ${pill.hidden ? 'dashed' : 'solid'} ${pill.hidden ? color.hairlineStrong : color.hairline}`,
        borderRadius: radius.pill,
        cursor: 'pointer',
        opacity: pill.hidden ? 0.45 : dimmed ? 0.25 : undefined,
        flexShrink: 0,
      }}
    >
      <BrandDot brand={pill.brand} />
      <span
        title={pill.text}
        style={{
          fontSize: 11,
          lineHeight: '16px',
          color: color.body,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {pill.text}
      </span>
    </span>
  );
}

/** 品牌块：块内 ‹› 滚动（仅当产品数 > PILLS_VISIBLE 时出现） */
function Block({
  block,
  hiddenKeys,
  hoverSet,
  onToggle,
  onHover,
}: {
  block: BlockSpec;
  hiddenKeys: Set<string>;
  hoverSet: Set<string> | null;
  onToggle: (key: string) => void;
  onHover: (key: string | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);
  useEffect(() => {
    sync();
  }, [sync, block.pills.length]);
  const scrollByPill = (dir: 1 | -1): void => {
    trackRef.current?.scrollBy({ left: dir * (PILL_W_BUDGET + 6), behavior: 'smooth' });
  };
  const scrollable = block.pills.length > PILLS_VISIBLE;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0, minWidth: 0 }}>
      <span
        style={{
          fontSize: 12.5,
          lineHeight: '15px',
          fontWeight: 700,
          color: color.ink,
          whiteSpace: 'nowrap',
          letterSpacing: 0.2,
        }}
      >
        {block.label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {scrollable && (
          <span
            role="button"
            aria-label={`${block.label} 更多产品（左）`}
            onClick={() => scrollByPill(-1)}
            style={{ ...ARROW_STYLE, opacity: atStart ? 0.25 : 1, cursor: atStart ? 'default' : 'pointer' }}
          >
            <LeftOutlined style={{ fontSize: 8 }} />
          </span>
        )}
        <div
          ref={trackRef}
          onScroll={sync}
          className="lpl-legend-scroll"
          style={{
            display: 'flex',
            gap: 6,
            maxWidth: PILLS_VISIBLE * (PILL_W_BUDGET + 6),
            overflowX: 'auto',
            scrollbarWidth: 'none',
            paddingTop: 1,
            paddingBottom: 1,
          }}
        >
          {block.pills.map((p) => (
            <Pill
              key={p.key}
              pill={p}
              dimmed={hoverSet != null && !hoverSet.has(p.key)}
              onToggle={onToggle}
              onHover={onHover}
            />
          ))}
        </div>
        {scrollable && (
          <span
            role="button"
            aria-label={`${block.label} 更多产品（右）`}
            onClick={() => scrollByPill(1)}
            style={{ ...ARROW_STYLE, opacity: atEnd ? 0.25 : 1, cursor: atEnd ? 'default' : 'pointer' }}
          >
            <RightOutlined style={{ fontSize: 8 }} />
          </span>
        )}
      </div>
    </div>
  );
}

const ARROW_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  borderRadius: 9999,
  border: `1px solid ${color.hairline}`,
  background: color.canvas,
  color: color.body,
  flexShrink: 0,
} as const;

export default function BrandLegendStrip({
  series,
  hiddenKeys,
  onToggleHidden,
  onHover,
}: {
  /** 系列全集（含被屏蔽者——药丸仍渲染为虚线置灰态，可点击恢复） */
  series: Series[];
  hiddenKeys: Set<string>;
  onToggleHidden: (seriesKey: string) => void;
  onHover: (seriesKey: string | null) => void;
}) {
  const blocks = blocksOf(series, hiddenKeys);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  // 第一百一十六轮：悬停只高亮该系列自身（不再联动其对标竞品/我司）
  const hoverSet = hoverKey != null ? new Set([hoverKey]) : null;
  const trackRef = useRef<HTMLDivElement>(null);
  const [outer, setOuter] = useState({ start: true, end: true, overflow: false });
  const syncOuter = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setOuter({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
      overflow: el.scrollWidth > el.clientWidth + 1,
    });
  }, []);
  useLayoutEffect(() => {
    syncOuter();
  }, [syncOuter, series]);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => syncOuter());
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncOuter]);
  const hover = (key: string | null): void => {
    setHoverKey(key);
    onHover(key);
  };
  const scrollOuter = (dir: 1 | -1): void => {
    trackRef.current?.scrollBy({ left: dir * 260, behavior: 'smooth' });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      {outer.overflow && (
        <span
          role="button"
          aria-label="更多品牌（左）"
          onClick={() => scrollOuter(-1)}
          style={{ ...ARROW_STYLE, width: 16, height: 16, opacity: outer.start ? 0.25 : 1, cursor: outer.start ? 'default' : 'pointer', flexShrink: 0 }}
        >
          <LeftOutlined style={{ fontSize: 9 }} />
        </span>
      )}
      <div
        ref={trackRef}
        onScroll={syncOuter}
        className="lpl-legend-scroll"
        style={{ display: 'flex', alignItems: 'stretch', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', minWidth: 0, padding: '2px 0' }}
      >
        {(() => {
          // 块间灰色短竖线分隔（最后一块之后不加）
          const items: ReactNode[] = [];
          blocks.forEach((b, i) => {
            if (i > 0) {
              items.push(
                <span key={`div-${i}`} aria-hidden style={{ width: 1, height: 26, background: color.hairline, flexShrink: 0, alignSelf: 'center' }} />,
              );
            }
            items.push(
              <Block key={b.brand} block={b} hiddenKeys={hiddenKeys} hoverSet={hoverSet} onToggle={onToggleHidden} onHover={hover} />,
            );
          });
          return items;
        })()}
      </div>
      {outer.overflow && (
        <span
          role="button"
          aria-label="更多品牌（右）"
          onClick={() => scrollOuter(1)}
          style={{ ...ARROW_STYLE, width: 16, height: 16, opacity: outer.end ? 0.25 : 1, cursor: outer.end ? 'default' : 'pointer', flexShrink: 0 }}
        >
          <RightOutlined style={{ fontSize: 9 }} />
        </span>
      )}
    </div>
  );
}
