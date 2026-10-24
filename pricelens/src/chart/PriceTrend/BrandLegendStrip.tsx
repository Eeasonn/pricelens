// ============================================================
// 组/角色图例带（第一百一十五轮立为品牌分块，第一百二十三轮④结合产品对改版）：
// 价格看板图顶的药丸带按主分析组分块（组 = 选择产品浮窗里的一张卡）——
// 块内 = 主品药丸（浅蓝底 + 蓝描边 + 加粗，角色强调）→ 灰色小字 vs →
// 对比药丸（卡内序，白底灰描边）。药丸固定两行（第一百四十五轮，Eason：必须
// 带品牌名）——第一行 = 品牌色点 + 品牌名，第二行 = 产品名 + 型号 + 最新页外链；
// 多组时块首「第 N 组」小字，单组不显示；空对无主品药丸也不画 vs。药丸点击 =
// 屏蔽/恢复折线（虚线置灰态可恢复），悬停 = 该系列高亮、其余降透明。块间灰色
// 短竖线分隔；对比药丸超过 3 个走块内 ‹› 滚动（主品药丸恒可见、不参与滚动）；
// 整排放不下时两侧 ‹› 滚动。
// 第一百四十二轮追补三：块头「⇄ 比价」小按钮删除（Eason：多平台比价统一从
// 工具行进入，图例不再承担入口）。
// ============================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ExportOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { curveNameOf, latestLinkOf } from './chartModel';
import { groupOrdinal, type LegendGroup } from './tableModel';
import { color, radius, selectSoft } from '../../theme/tokens';

/** 块内对比药丸可见预算（超出走块内 ‹› 滚动；主品药丸不占此预算、恒可见） */
const COMPARES_VISIBLE = 3;
/** 单个药丸的展示宽度预算（块内滚动容器 maxWidth = 3×预算 + 间距） */
const PILL_W_BUDGET = 178;
/** 主品药丸描边：与选择浮窗颜色 chip 同一「浅蓝描边 = 强调」语言（第一百二十二轮） */
const MAIN_BORDER = 'rgba(0, 112, 243, 0.35)';

interface PillSpec {
  key: string;
  brand: string;
  brandLabel: string; // 品牌展示名（Huawei/Apple/…，第一行；第一百四十五轮）
  text: string;
  hidden: boolean;
  main: boolean; // 主品药丸 = 本组主分析产品（浅蓝底/描边/加粗）
  link?: ReturnType<typeof latestLinkOf>; // 最新商品页外链（无 = 不渲染图标）
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
  // 被屏蔽 = 虚线置灰态（角色强调让位，点击恢复）；主品可见态 = 浅蓝底 + 蓝描边 + 加粗
  const look = pill.hidden
    ? { background: color.canvas, border: `1px dashed ${color.hairlineStrong}` }
    : pill.main
      ? { background: selectSoft, border: `1px solid ${MAIN_BORDER}` }
      : { background: color.canvas, border: `1px solid ${color.hairline}` };
  return (
    <span
      role="button"
      aria-pressed={pill.hidden}
      title={pill.hidden ? '点击恢复显示该产品' : '点击隐藏该产品'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(pill.key);
      }}
      onMouseEnter={() => onHover(pill.key)}
      onMouseLeave={() => onHover(null)}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        maxWidth: PILL_W_BUDGET,
        padding: '4px 10px 4px 8px',
        borderRadius: radius.pill,
        cursor: 'pointer',
        opacity: pill.hidden ? 0.45 : dimmed ? 0.25 : undefined,
        flexShrink: 0,
        ...look,
      }}
    >
      {/* 第一行：品牌色点 + 品牌名（第一百四十五轮，Eason：药丸必须带品牌） */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
        <BrandDot brand={pill.brand} />
        <span
          style={{
            fontSize: 10,
            lineHeight: '12px',
            color: color.mute,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {pill.brandLabel}
        </span>
      </span>
      {/* 第二行：产品名 + 型号 + 最新商品页外链 */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
        <span
          title={pill.text}
          style={{
            fontSize: 11,
            lineHeight: '14px',
            color: pill.main && !pill.hidden ? color.ink : color.body,
            fontWeight: pill.main ? 700 : 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {pill.text}
        </span>
        {/* 最新商品页外链（第一百四十轮）：恒指该系列最新价所在商品页；
            stopPropagation 防触发药丸的显隐切换 */}
        {pill.link && (
          <a
            href={pill.link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`打开最新商品页：${pill.text}`}
            title={pill.link.shop ? `打开最新商品页（${pill.link.shop}）` : '打开最新商品页'}
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', color: color.link, flexShrink: 0 }}
          >
            <ExportOutlined style={{ fontSize: 11 }} />
          </a>
        )}
      </span>
    </span>
  );
}

/** 组块：第 N 组小字（多组时）+ 主品药丸 + vs + 对比药丸（块内 ‹› 滚动，
 *  仅当对比数 > COMPARES_VISIBLE 时出现；主品药丸在滚动区外恒可见） */
function GroupBlock({
  group,
  showOrdinal,
  hiddenKeys,
  hoverSet,
  onToggle,
  onHover,
}: {
  group: LegendGroup;
  showOrdinal: boolean; // 多组时块首「第 N 组」，单组不显示
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
  }, [sync, group.series.length]);
  const scrollByPill = (dir: 1 | -1): void => {
    trackRef.current?.scrollBy({ left: dir * (PILL_W_BUDGET + 6), behavior: 'smooth' });
  };

  const pills: PillSpec[] = group.series.map((s) => ({
    key: s.key,
    brand: s.brand,
    brandLabel: brandLabelOf(s.brand),
    text: curveNameOf(s),
    hidden: hiddenKeys.has(s.key),
    main: group.mainKey === s.key,
    link: latestLinkOf(s),
  }));
  const mainPill = pills.find((p) => p.main) ?? null; // 主品无数据/空对 = null（不画药丸也不画 vs）
  const compares = pills.filter((p) => !p.main);
  const scrollable = compares.length > COMPARES_VISIBLE;
  const dimOf = (p: PillSpec): boolean => hoverSet != null && !hoverSet.has(p.key);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, minWidth: 0 }}>
      {showOrdinal && (
        <span style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {groupOrdinal(group.ordinal)}
        </span>
      )}
      {/* 主品药丸（空对无主品不出） */}
      {mainPill && <Pill pill={mainPill} dimmed={dimOf(mainPill)} onToggle={onToggle} onHover={onHover} />}
      {mainPill && compares.length > 0 && (
        <span style={{ fontSize: 10, lineHeight: '12px', color: color.mute, flexShrink: 0 }}>vs</span>
      )}
      {compares.length > 0 && (
        <>
          {scrollable && (
            <span
              role="button"
              aria-label="更多对比产品（左）"
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
              maxWidth: COMPARES_VISIBLE * (PILL_W_BUDGET + 6),
              overflowX: 'auto',
              scrollbarWidth: 'none',
              paddingTop: 1,
              paddingBottom: 1,
            }}
          >
            {compares.map((p) => (
              <Pill key={p.key} pill={p} dimmed={dimOf(p)} onToggle={onToggle} onHover={onHover} />
            ))}
          </div>
          {scrollable && (
            <span
              role="button"
              aria-label="更多对比产品（右）"
              onClick={() => scrollByPill(1)}
              style={{ ...ARROW_STYLE, opacity: atEnd ? 0.25 : 1, cursor: atEnd ? 'default' : 'pointer' }}
            >
              <RightOutlined style={{ fontSize: 8 }} />
            </span>
          )}
        </>
      )}
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
  groups,
  hiddenKeys,
  onToggleHidden,
  onHover,
}: {
  /** 按选择浮窗卡序归好的组（groupsOfCards 产出：主品在前 + 本卡对比；
   *  含被屏蔽者——药丸仍渲染为虚线置灰态，可点击恢复。合并多组时同一对比
   *  产品会在各组各出现一次，hidden 状态按 key 自然同步） */
  groups: LegendGroup[];
  hiddenKeys: Set<string>;
  onToggleHidden: (seriesKey: string) => void;
  onHover: (seriesKey: string | null) => void;
}) {
  const multi = groups.length >= 2;
  const blocks = groups.filter((g) => g.series.length > 0); // 全组缺数据的卡无药丸可显
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  // 第一百一十六轮：悬停只高亮该系列自身（不再联动其对标竞品/我司）
  const hoverSet = hoverKey != null ? new Set([hoverKey]) : null;
  // 悬停残留自愈（本轮体检）：药丸的 mouseleave 是悬停态唯一清理路径——悬停期间
  // 该系列因筛选/增删产品从集合消失时药丸直接卸载、mouseleave 不触发，整图会
  // 永久停留在错误降透明。键集变化后校验悬停键是否仍在，不在即清本地态并上报
  useEffect(() => {
    if (hoverKey == null) return;
    const stillThere = groups.some((g) => g.series.some((s) => s.key === hoverKey));
    if (!stillThere) {
      setHoverKey(null);
      onHover(null);
    }
  }, [hoverKey, groups, onHover]);
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
  }, [syncOuter, groups]);
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
          aria-label="更多组（左）"
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
          blocks.forEach((g, i) => {
            if (i > 0) {
              items.push(
                <span key={`div-${i}`} aria-hidden style={{ width: 1, height: 28, background: color.hairline, flexShrink: 0, alignSelf: 'center' }} />,
              );
            }
            items.push(
              <GroupBlock
                key={g.id}
                group={g}
                showOrdinal={multi}
                hiddenKeys={hiddenKeys}
                hoverSet={hoverSet}
                onToggle={onToggleHidden}
                onHover={hover}
              />,
            );
          });
          return items;
        })()}
      </div>
      {outer.overflow && (
        <span
          role="button"
          aria-label="更多组（右）"
          onClick={() => scrollOuter(1)}
          style={{ ...ARROW_STYLE, width: 16, height: 16, opacity: outer.end ? 0.25 : 1, cursor: outer.end ? 'default' : 'pointer', flexShrink: 0 }}
        >
          <RightOutlined style={{ fontSize: 9 }} />
        </span>
      )}
    </div>
  );
}
