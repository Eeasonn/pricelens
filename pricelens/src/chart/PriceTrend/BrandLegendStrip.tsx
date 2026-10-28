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
// 第一百五十轮：药丸第二行加「多平台比价」悬停小入口（店铺图标，悬停药丸浮现
// ）——每个产品直接发起自己的多平台比价；工具行「多平台比价」胶囊按钮随之退役。
// 第一百六十四轮（Eason）：入口改「进入多平台对比页签」并带上该产品（页签主动
// 进入则不带产品筛选）；店铺图标从药丸内移到平台小药丸同行居右、常驻显示。
// 第一百六十轮：药丸第二行加「取价渠道 chip」——显示该产品当前取价渠道
// （自动态带「·自动」角标），点击弹渠道选择浮层（自动/各平台-渠道，带中位价
// 与覆盖周数）。平台口径自本轮起按产品线独立，主品渠道不再牵连对比品。
// 第一百六十六轮（Eason）：药丸内的「最新商品页」外链跳转退役——外链图标
// （ExportOutlined）与跳转一并删除，悬停明细/价格摘要条的取证入口不受影响；
// latestLinkOf 随唯一调用方退役删除。
// 第一百六十七轮（Eason）：块首新增「仅查看主产品」按钮（时间范围「自动」按钮
// 同款配色语言的小型版）——一键隐藏本组全部对比品（折线批量屏蔽），激活态浅蓝
// 再点整组恢复；仅在该组有对比品时渲染。
// 第一百七十轮（Eason 四点）：①按钮与产品药丸间距拉大（4 → 12）②按钮上方新增
// 「同步平台筛选」（onSyncPlatform）：一键把全部产品的取价平台改成与主产品一致
// （全局操作，index 层实现）③产品药丸宽度预算 178 → 220，避免过于紧凑。
// 两按钮垂直成组（同步平台筛选在上）。
// 第一百七十三轮（Eason）：「同步平台筛选」改开关语义——随时可点，触发后按压态
// 浅蓝（与仅查看主产品同语言）、全部产品跟随主产品，再点取消并还原同步前快照
// （快照/收敛/还原纯函数在 platformSync.ts，index 层持开关态）；
// 172 轮的「全一致即置灰」口径退役。
// 第一百七十四轮（Eason 三点）：①块首按钮列退役——「仅查看主产品」全局化上移
// 价格走势标题行（跨组同时生效，index 层实现，见 tableModel.onlyMainState）；
// ②「同步平台筛选」移到首组主品平台筛选小药丸左侧（syncCtl 只传首个含主品的块；
// 分离模式仅首面板传）③药丸宽度自适应——去 minWidth 190，宽随内容收放，
// PILL_W_BUDGET 240 仅作上限。
// 第一百四十二轮追补三：块头「⇄ 比价」小按钮删除（当时的比价入口在工具行；
// 第一百五十轮起入口移到药丸本位，块头不再承担）。
// 第一百七十六轮追补（Eason）：药丸上的多平台比价入口（店铺图标）整体退役——
// 比价页签只从标题行「产品对比 | 多平台对比」页签进（主动进入默认主品）；
// 平台小药丸改为行内居右显示。
// ============================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Popover } from 'antd';
import ChannelSelectPopover from '../../components/ChannelSelectPopover';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { dimProduct } from '../../data';
import { curveNameOf } from './chartModel';
import { groupOrdinal, type LegendGroup } from './tableModel';
import { color, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';

/** 块内对比药丸可见预算（超出走块内 ‹› 滚动；主品药丸不占此预算、恒可见） */
const COMPARES_VISIBLE = 3;
/** 单个药丸的展示宽度预算（块内滚动容器 maxWidth = 3×预算 + 间距）
 *  第一百七十轮：178 → 220；第一百七十二轮：220 → 240（Eason：再宽一点） */
const PILL_W_BUDGET = 240;
/** 主品药丸描边：与选择浮窗颜色 chip 同一「浅蓝描边 = 强调」语言（第一百二十二轮） */
const MAIN_BORDER = 'rgba(0, 112, 243, 0.35)';

interface PillSpec {
  key: string;
  brand: string;
  brandLabel: string; // 品牌展示名（Huawei/Apple/…，第一行；第一百四十五轮）
  text: string;
  hidden: boolean;
  main: boolean; // 主品药丸 = 本组主分析产品（浅蓝底/描边/加粗）
  /** 取价平台（第一百六十二轮）：平台名 / 「自动」（药丸上方小药丸显示） */
  channel?: { label: string; auto: boolean } | null;
  /** 平台筛选入口：小药丸点击弹三级渠道浮层 */
  channelCtl?: {
    cc: string;
    skuIds: string[];
    current: { platforms: string[]; shopIds: string[]; seller?: string | null } | null;
    onPick: (sel: { platforms: string[]; shopIds: string[]; seller?: string | null } | null) => void;
  };
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
      className="lpl-lg-pill"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        maxWidth: PILL_W_BUDGET, // 自适应宽（第一百七十四轮，Eason）：宽随内容收放，240 只作上限防长名失控
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
      {/* 第二行：产品名 + 型号（外链跳转已于第一百六十六轮退役） */}
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
      </span>
    </span>
  );
}

/** 药丸单元（第一百六十二轮，Eason）：上行 = 平台小药丸（独立元素，居右）；下行 =
 *  产品药丸。两行互相独立、不嵌套，点击互不干扰。第一百七十四轮：syncCtl（同步
 *  平台筛选按钮）渲染在主品平台小药丸左侧；第一百七十六轮追补：比价入口退役 */
function PillUnit({
  pill,
  dimmed,
  onToggle,
  onHover,
  syncCtl,
}: {
  pill: PillSpec;
  dimmed: boolean;
  onToggle: (key: string) => void;
  onHover: (key: string | null) => void;
  syncCtl?: { active: boolean; onToggle: () => void };
}) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, flexShrink: 0, minWidth: 0 }}>
      <PlatformRow pill={pill} dimmed={dimmed} syncCtl={syncCtl} />
      <Pill pill={pill} dimmed={dimmed} onToggle={onToggle} onHover={onHover} />
    </span>
  );
}

/** 平台行（第一百六十二轮，Eason）：平台小药丸独立一行（不嵌在产品药丸内；
 *  自动态显示最新有价周的实际平台名）+ 多平台比价入口（同行居右、常驻显示）。
 *  第一百七十四轮（Eason）：「同步平台筛选」按钮（syncCtl，全局操作）移到
 *  主品平台筛选框左侧——按钮列退役后药丸行不再为其留位。
 *  第一百七十六轮追补（Eason）：多平台比价入口（店铺图标）随药丸退役——比价页签
 *  只从标题行页签进（默认主品）；平台小药丸改为行内居右 */
function PlatformRow({
  pill,
  dimmed,
  syncCtl,
}: {
  pill: PillSpec;
  dimmed: boolean;
  syncCtl?: { active: boolean; onToggle: () => void };
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: syncCtl ? 'space-between' : 'flex-end', // 平台小药丸居右（第一百七十六轮追补）；主品行同步按钮居左
        gap: 4,
        width: '100%',
        maxWidth: PILL_W_BUDGET,
        opacity: pill.hidden ? 0.45 : dimmed ? 0.25 : undefined,
      }}
    >
      {/* 同步平台筛选（第一百七十四轮移位）：主品平台筛选框左侧，按压态浅蓝同语言；
          hover 反馈（lpl-lg-act）由块尾 <style> 承担（内联无 :hover） */}
      {syncCtl && (
        <button
          type="button"
          className="lpl-lg-act"
          aria-pressed={!!syncCtl.active}
          title={syncCtl.active
            ? '已同步：全部产品取价平台与主产品一致，点击取消并恢复同步前状态'
            : '全部产品的取价平台改成与主产品一致'}
          onClick={(e) => {
            e.stopPropagation();
            syncCtl.onToggle();
          }}
          style={{
            height: 16,
            padding: '0 6px',
            borderRadius: radius.pill,
            border: `1px solid ${syncCtl.active ? selectAccent : color.hairlineStrong}`,
            background: syncCtl.active ? selectSoft : color.canvas,
            color: syncCtl.active ? selectSoftInk : color.mute,
            font: 'inherit',
            fontSize: 10,
            fontWeight: 600,
            lineHeight: '14px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          同步平台筛选
        </button>
      )}
      {pill.channel && pill.channelCtl ? (
        <Popover
          trigger="click"
          placement="bottomLeft"
          arrow={false}
          styles={{ body: { padding: 0 } }}
          content={
            <ChannelSelectPopover
              cc={pill.channelCtl.cc}
              skuIds={pill.channelCtl.skuIds}
              current={pill.channelCtl.current}
              onPick={pill.channelCtl.onPick}
            />
          }
        >
          <span
            role="button"
            aria-pressed={!pill.channel.auto}
            aria-label={`取价平台：${pill.channel.label}，点击筛选平台-店铺`}
            title={
              pill.channel.auto
                ? `取价平台：${pill.channel.label}（自动 = 显示每周最低价平台-店铺），点击筛选`
                : `取价平台：${pill.channel.label}，点击筛选`
            }
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 16,
              padding: '0 7px',
              borderRadius: radius.pill,
              fontSize: 10,
              lineHeight: '14px',
              fontWeight: 600,
              color: pill.channel.auto ? color.mute : selectSoftInk,
              background: pill.channel.auto ? color.canvas : selectSoft,
              border: `1px solid ${pill.channel.auto ? color.hairline : 'rgba(0, 112, 243, 0.35)'}`,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{pill.channel.label}</span>
          </span>
        </Popover>
      ) : (
        <span style={{ flexShrink: 0 }} />
      )}
    </span>
  );
}

/** 组块：第 N 组小字（多组时）+ 主品药丸 + vs + 对比药丸（块内 ‹› 滚动，仅当对比数 > COMPARES_VISIBLE
 *  时出现；主品药丸在滚动区外恒可见）。第一百七十四轮：块首按钮列退役——
 *  「仅查看主产品」全局化上移标题行（index 层）、「同步平台筛选」进首组主品
 *  平台小药丸左侧（syncCtl 只传首个含主品的块） */
function GroupBlock({
  group,
  showOrdinal,
  hiddenKeys,
  hoverSet,
  onToggle,
  onHover,
  channelCtl,
  syncCtl,
}: {
  group: LegendGroup;
  showOrdinal: boolean; // 多组时块首「第 N 组」，单组不显示
  hiddenKeys: Set<string>;
  hoverSet: Set<string> | null;
  onToggle: (key: string) => void;
  onHover: (key: string | null) => void;
  /** 平台筛选（第一百六十二轮）：cc + 回写动作（按系列 key 定位选择项） */
  channelCtl?: {
    cc: string;
    onPick: (seriesKey: string, sel: { platforms: string[]; shopIds: string[]; seller?: string | null } | null) => void;
  };
  /** 同步平台筛选（第一百七十四轮移位）：渲染在首组主品平台小药丸左侧；
   *  全局操作（index 层实现），上层只传给第一个块 */
  syncCtl?: { active: boolean; onToggle: () => void };
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
    channel: s.channelBadge ?? null,
    channelCtl: channelCtl
      ? { cc: channelCtl.cc, skuIds: s.skuIds, current: s.platform ?? null, onPick: (sel) => channelCtl.onPick(s.key, sel) }
      : undefined,
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
      {/* 主品药丸（空对无主品不出）；同步平台筛选（第一百七十四轮移位）渲染在
          其平台小药丸左侧，仅上层传入 syncCtl 的首组出现 */}
      {mainPill && <PillUnit pill={mainPill} dimmed={dimOf(mainPill)} onToggle={onToggle} onHover={onHover} syncCtl={syncCtl} />}
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
              <PillUnit key={p.key} pill={p} dimmed={dimOf(p)} onToggle={onToggle} onHover={onHover} />
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
  channelCtl,
  onSyncPlatform,
  syncActive,
}: {
  /** 按选择浮窗卡序归好的组（groupsOfCards 产出：主品在前 + 本卡对比；
   *  含被屏蔽者——药丸仍渲染为虚线置灰态，可点击恢复。合并多组时同一对比
   *  产品会在各组各出现一次，hidden 状态按 key 自然同步） */
  groups: LegendGroup[];
  hiddenKeys: Set<string>;
  onToggleHidden: (seriesKey: string) => void;
  onHover: (seriesKey: string | null) => void;
  /** 平台筛选（第一百六十二轮）：传入 = 每颗药丸上方出平台小药丸（第一百七十六轮
   *  追补起居右），点击弹三级渠道浮层；onPick 按系列 key 回写该产品的取价口径 */
  channelCtl?: {
    cc: string;
    onPick: (seriesKey: string, sel: { platforms: string[]; shopIds: string[]; seller?: string | null } | null) => void;
  };
  /** 同步平台筛选（第一百七十轮，Eason）：传入 = 每组按钮组上方出「同步平台筛选」
   *  按钮，点击把全部产品的取价平台改成与主产品一致（全局操作，index 层实现） */
  onSyncPlatform?: () => void;
  /** 同步进行中（第一百七十三轮改开关语义）：按钮按压态；再点取消并还原 */
  syncActive?: boolean;
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
          // 块间灰色短竖线分隔（最后一块之后不加）；同步平台筛选（第一百七十四轮）
          // 只随首个含主品的块渲染（全局操作，按钮在主品平台小药丸左侧）
          let syncPlaced = !onSyncPlatform;
          const items: ReactNode[] = [];
          blocks.forEach((g, i) => {
            if (i > 0) {
              items.push(
                <span key={`div-${i}`} aria-hidden style={{ width: 1, height: 28, background: color.hairline, flexShrink: 0, alignSelf: 'center' }} />,
              );
            }
            const hasMain = g.series.some((s) => s.key === g.mainKey);
            const passSync = !syncPlaced && hasMain;
            if (passSync) syncPlaced = true;
            items.push(
              <GroupBlock
                key={g.id}
                group={g}
                showOrdinal={multi}
                hiddenKeys={hiddenKeys}
                hoverSet={hoverSet}
                onToggle={onToggleHidden}
                onHover={hover}
                channelCtl={channelCtl}
                syncCtl={passSync ? { active: !!syncActive, onToggle: () => onSyncPlatform?.() } : undefined}
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
      {/* 按钮悬停态（内联样式无 :hover，工具类集中在此）：
          lpl-lg-act = 同步平台筛选按钮悬停描边加深，给可点感知（比价小入口的
          lpl-pill-cmp 工具类随入口退役，第一百七十六轮追补） */}
      <style>{`
        .lpl-lg-act:not(:disabled):not([aria-pressed="true"]):hover { border-color: ${color.hairlineStrong} !important; background: ${color.canvasSoft} !important; }
      `}</style>
    </div>
  );
}
