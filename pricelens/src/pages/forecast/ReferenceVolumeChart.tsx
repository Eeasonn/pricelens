// ============================================================
// 推演工作台 v2 · 量价参考卡 · 全生命周期量价图（2026-11-05 四条整改）：
// 与量价走势页同语言——量柱复用 volume/VolumeBars（axisSide='left'，真实
// 改几何落实左量右价）+ 价格线同系列色实线 2px（刻度画在右侧 $）。
// 2026-11-05 看图反馈 #1–#4 + 风格对齐（第 8 条在本卡的落实）：
// - X 轴改日历周（#1，杜绝 W108）：与价格走势页同一套 axisTickPlan /
//   shortBucketLabel 口径——周 = 2026W33（无连字符），首尾恒显示 + step 抽稀
//   + 边界让位；周序锚点 = fixture launchWeekLabel 的真实 ISO 周历（复用
//   ReferenceEventComposer 的周历换算 lifecycleWeekIdsOf，不造第二套日历），
//   跨年进位按 ISO 规则（2025W52 → 2026W01 不串值）。
// - 事件合一为小方块点（#2，核心）：图上只有一个「事件」概念，大促档期也是
//   事件——顶部小标轨全部为小方块点（8px，事件类目色填充），默认显示在对齐
//   事件开始时间的位置；同起点两点纵向微错开，第三点起聚合 +N（点击回填名录
//   筛选；档期点不聚合）。旧区间呈现（左右箭头 + 中间连线、档期 dashed 方标、
//   2-lane 分轨）全部删除。hover 方块点 = 图内临时 0.16 高亮该事件整个起止
//   区间（不受开关影响）；点击选中 = 既有精简证据浮框（名称/起止/幅度/衰减/
//   说明/编辑）。
// - 图例全部可点（#3）：销量 / 价格 / 事件 三项点击切换显隐（WorkbenchLegend
//   同规格：aria-pressed + 隐藏态 opacity .45）；事件隐藏时顶部小标轨整层 +
//   图内事件高亮一起隐藏。
// - 图内高亮开关挪位（#4）：删除右下角独立开关位，开关作为图例行内紧跟
//   「事件」项之后的小控件（视觉与语义不变：开 = 所有事件区间常驻 0.12 底衬，
//   默认关）。
// - 风格对齐价格走势页（#5）：本卡全部 SVG <text> 带 fontFamily（tokens
//   font）、字号 10、fill mute（首尾刻度 = body + 600，同 CostBarChart）、
//   数字 tabular-nums；主线 2px。
// - 周段标签统一日历周（二轮收尾）：区间读数胶囊 / 拖选实时提示 / 缺数注记 /
//   事件周段（eventRangeLabel 传产品锚）全部 = 2025W24 形态，与 X 轴同口径。
// 缺数纪律：缺采周不造 0——柱不画、实线断开、跨缺灰虚桥接。
// 布局照 volume/CostBarChart 范式：ResizeObserver 量宽 → 全部按像素定位，
// 指针承接层复用 volume/PointerShield（悬停列 / 拖选区间）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import PointerShield from '../volume/PointerShield';
import VolumeBars from '../volume/VolumeBars';
import { vMaxOf } from '../volume/volumeAxis';
import { axisTickPlan } from '../../chart/PriceTrend/helpers';
import { brandColorOf, color, font, motion, space } from '../../theme/tokens';
import type { LifecycleProductSeed } from './workbenchFixture';
import { WorkbenchLegend, type LegendItem } from './WorkbenchBits';
import {
  eventRangeLabel,
  lifecycleWeekIdsOf,
  REFERENCE_DECAY_LABEL,
  type EffectiveReferenceEvent,
} from './referenceEventModel';

// 左量右价：左侧留销量轴区（刻度 + 上限编辑），右侧留价格刻度区（$）
const GRID_L = 84;
const GRID_R = 52;
// 顶部事件点轨：单行小方块点（8px）+ 同起点微错开余量；2-lane 分轨已删
const TRACK_TOP = 5;
const DOT = 8;
const DOT_STACK_DY = 5;
const TRACK_H = DOT + DOT_STACK_DY;
const PLOT_TOP = TRACK_TOP + TRACK_H + 3; // 21
// 2026-11-04 视觉一致性：图高过低（评审），绘图区 150→200。
const PLOT_H = 200;
const LABEL_H = 18;

const signedPctText = (pct: number): string =>
  `${pct > 0.05 ? '+' : pct < -0.05 ? '−' : '±'}${Math.abs(pct).toFixed(1)}%`;

/** 幅度（预标 impactPct）展示：整数带符号；无标注显「—」（不造 0）。 */
const impactPctText = (impact: { magnitudePct: number | null } | null): string => {
  const pct = impact?.magnitudePct;
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)}%`;
};

const volumeShortText = (v: number): string => `${(v / 1000).toFixed(1)}K 台`;
const priceShortText = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;

/** 连续有值段（实线只连接相邻有值点，缺数不造点）。 */
function solidSegmentsOf(values: Array<number | null>): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  values.forEach((value, index) => {
    if (value == null) {
      if (current.length > 1) segments.push(current);
      current = [];
    } else {
      current.push(index);
    }
  });
  if (current.length > 1) segments.push(current);
  return segments;
}

/** 跨缺失桥接段（连接缺失两侧最近有值点，灰虚线表达）。 */
function bridgeSegmentsOf(values: Array<number | null>): Array<[number, number]> {
  const bridges: Array<[number, number]> = [];
  let lastValid: number | null = null;
  values.forEach((value, index) => {
    if (value != null) {
      if (lastValid != null && index - lastValid > 1) bridges.push([lastValid, index]);
      lastValid = index;
    }
  });
  return bridges;
}

// ------------------------------------------------------------
// 顶部事件点轨：事件 + 大促档期合一（档期也是事件，琥珀类目色区分来源）。
// 每个事件 = 一个小方块点（对齐起始周）；无 lane 算法——同起点两点纵向微
// 错开，第三点起（仅事件）聚合 +N。
// ------------------------------------------------------------
export interface ReferenceTrackTick {
  id: string;
  kind: 'event' | 'band';
  label: string;
  startWeek: number;
  endWeek: number;
  color: string;
}

/** 事件点摆放：stack = 0 主行 / 1 微错开行（同起点第二点）。 */
interface EventDotPlacement {
  tick: ReferenceTrackTick;
  startIndex: number;
  stack: 0 | 1;
}

/** 事件点行中心的 y（stack 0 / 1）。 */
const dotCyOf = (stack: 0 | 1): number => TRACK_TOP + DOT / 2 + stack * DOT_STACK_DY;

export default function ReferenceVolumeChart(props: {
  product: LifecycleProductSeed;
  /** 查看窗口（生命周期周序，受控）：由本面板时间轨驱动。 */
  win: [number, number];
  /** 统一有效事件（已合并排序；无来源标注，预标与补录同形）。 */
  events?: EffectiveReferenceEvent[];
  labelOf: (typeId: string) => string;
  colorOf: (typeId: string) => string;
  /** 聚焦定位（生命周期周序 0 基）；配合 focusKey 触发悬停该周（参考回放联动）。 */
  focusWeek?: number | null;
  focusKey?: number;
  /** 统一选中态（名录 / 图小标 / 时段轨共享；null = 关闭详情浮框）。 */
  selectedEventId?: string | null;
  onSelectEvent?: (id: string | null) => void;
  onEditEvent?: (id: string) => void;
  /** 名录行 hover → 事件点加粗 + 区间临时高亮；事件点 hover 反向上报。 */
  hoverEventId?: string | null;
  onHoverEvent?: (id: string | null) => void;
  /** 同起点第三事件起聚合 +N 点击：只看这些事件（父层回填名录筛选）。 */
  onOverflowEvents?: (ids: string[]) => void;
  /** 拖选事件时段模式：松手回填事件起止周（不进入区间读数态）。 */
  rangePickMode?: boolean;
  onSelectRange?: (startWeek: number, endWeek: number) => void;
}) {
  const { product, win } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const [brushLive, setBrushLive] = useState<[number, number] | null>(null);
  const [axisLimits, setAxisLimits] = useState<{ max: number | null }>({ max: null });
  /** 图内高亮开关（图例行「事件」项旁，默认关）：关 = 图内无任何事件高亮。 */
  const [highlightAll, setHighlightAll] = useState(false);
  /** 图例显隐（#3）：销量 / 价格 / 事件 三层可点切换（默认全显）。 */
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set());
  /** 事件点直接悬停（本地即时态；名录 hover 走 hoverEventId）。 */
  const [tickHoverId, setTickHoverId] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) setWidth(en.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const total = product.points.length;
  // 切换参照产品：选区 / 悬停 / 轴限位随失义清除（窗口归本面板时间轨管，不动）
  const productId = product.id;
  useEffect(() => {
    setBrush(null);
    setBrushLive(null);
    setHover(null);
    setAxisLimits({ max: null });
    setTickHoverId(null);
  }, [productId]);
  // 聚焦定位（参考回放「定位到对应事件」）：窗口已由父层移到事件附近，这里悬停该周
  const focusKey = props.focusKey ?? 0;
  const winS = win[0];
  useEffect(() => {
    if (focusKey === 0 || props.focusWeek == null) return;
    setBrush(null);
    setBrushLive(null);
    setHover(Math.min(total - 1, Math.max(0, props.focusWeek - winS)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  const s = Math.min(Math.max(0, winS), Math.max(0, total - 1));
  const e = Math.min(total - 1, Math.max(s, win[1]));
  // 窗口平移 / 缩放 → 窗口内选区下标失义，自动清除（与量价页同口径）
  const winSig = `${win[0]}:${win[1]}`;
  useEffect(() => {
    setBrush(null);
    setBrushLive(null);
  }, [winSig]);
  const values = useMemo(() => product.points.slice(s, e + 1), [product, s, e]);
  const prices = useMemo(() => product.pricePoints.slice(s, e + 1), [product, s, e]);
  const n = values.length;
  const vMax = useMemo(() => vMaxOf(values), [values]);

  const plotWidth = width > 0 ? width - GRID_L - GRID_R : 0;
  const geom = width >= 160 && n > 0 && plotWidth > 0 ? { plotLeft: GRID_L, plotWidth, n } : null;
  const plotBottom = PLOT_TOP + PLOT_H;
  const colW = n > 0 ? plotWidth / n : 0;
  const xAt = (i: number): number => GRID_L + colW * (i + 0.5);
  const xLeft = (i: number): number => GRID_L + colW * i;
  const xRight = (i: number): number => GRID_L + colW * (i + 1);

  // ---- X 轴日历周（#1）：锚点 = launchWeekLabel 的 ISO 周历，跨年进位不串值；
  // 刻度计划与价格走势页同源（axisTickPlan：首尾恒显示 + step 抽稀 + 边界让位） ----
  const weekIds = useMemo(() => lifecycleWeekIdsOf(product), [product]);
  const windowWeekIds = useMemo(() => weekIds.slice(s, s + n), [weekIds, s, n]);
  const xPlan = useMemo(
    () => axisTickPlan('week', windowWeekIds, Math.max(1, Math.ceil(n / 9)), n > 1 ? [0, n - 1] : [0]),
    [windowWeekIds, n],
  );
  /** 生命周期绝对周序 → 日历周 ID（2025W24 形态；锚缺失回退相对 W 序，防御）。 */
  const weekLabelAt = (abs: number): string => weekIds[abs] ?? `W${abs + 1}`;

  // 价格刻度（右轴 $）：窗口内价格 min/max 加 18% 余量，上 / 中 / 下三刻度常显
  const priceBounds = useMemo(() => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const p of prices) {
      if (p == null || !Number.isFinite(p)) continue;
      lo = Math.min(lo, p);
      hi = Math.max(hi, p);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
    const span = Math.max(hi - lo, 1);
    return { lo: lo - span * 0.18, hi: hi + span * 0.18 };
  }, [prices]);
  const y$ = (v: number): number => PLOT_TOP + PLOT_H * (1 - (v - priceBounds.lo) / Math.max(1e-6, priceBounds.hi - priceBounds.lo));

  const solidSegs = useMemo(() => solidSegmentsOf(prices), [prices]);
  const bridges = useMemo(() => bridgeSegmentsOf(prices), [prices]);
  const pathOf = (indexes: number[]): string =>
    indexes.map((index, position) => `${position === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)} ${y$(prices[index] as number).toFixed(1)}`).join(' ');

  // ---- 顶部事件点（事件 + 大促档期合一；无来源标注） ----
  const events = props.events ?? [];
  const eventsIn = useMemo(() => events
    .filter((ev) => ev.endWeek >= s && ev.startWeek <= e)
    .sort((a, b) => a.startWeek - b.startWeek || a.endWeek - b.endWeek || a.id.localeCompare(b.id)),
  [events, s, e]);
  const ticksIn = useMemo<ReferenceTrackTick[]>(() => [
    ...product.promoBands
      .filter((band) => band.endWeek >= s && band.startWeek <= e)
      .map((band) => ({
        id: `band-${band.startWeek}-${band.endWeek}`,
        kind: 'band' as const,
        label: band.label,
        startWeek: band.startWeek,
        endWeek: band.endWeek,
        color: color.warning,
      })),
    ...eventsIn.map((ev) => ({
      id: ev.id,
      kind: 'event' as const,
      label: ev.label,
      startWeek: ev.startWeek,
      endWeek: ev.endWeek,
      color: props.colorOf(ev.typeId),
    })),
  ], [product, eventsIn, props.colorOf]);

  // 同起点分组：第 1、2 个事件点微错开常显；第 3 个起（仅事件）聚合 +N（档期点不聚合）
  const { dotPlacements, overflowEvents } = useMemo(() => {
    const groups = new Map<number, ReferenceTrackTick[]>();
    for (const tick of ticksIn) {
      const key = Math.max(tick.startWeek, s);
      const list = groups.get(key);
      if (list) list.push(tick);
      else groups.set(key, [tick]);
    }
    const placements: EventDotPlacement[] = [];
    const overflow: EffectiveReferenceEvent[] = [];
    for (const [start, list] of groups) {
      let count = 0;
      for (const tick of list) {
        if (tick.kind === 'event' && count >= 2) {
          const ev = eventsIn.find((candidate) => candidate.id === tick.id);
          if (ev) overflow.push(ev);
          continue;
        }
        placements.push({ tick, startIndex: start - s, stack: count >= 1 ? 1 : 0 });
        count += 1;
      }
    }
    overflow.sort((a, b) => a.startWeek - b.startWeek || a.endWeek - b.endWeek || a.id.localeCompare(b.id));
    return { dotPlacements: placements, overflowEvents: overflow };
  }, [ticksIn, eventsIn, s]);

  const selectedEvent = useMemo(
    () => (props.selectedEventId ? events.find((ev) => ev.id === props.selectedEventId) ?? null : null),
    [events, props.selectedEventId],
  );

  // ---- 图例显隐（#3） ----
  const volumeVisible = !hiddenSeries.has('volume');
  const priceVisible = !hiddenSeries.has('price');
  const eventsVisible = !hiddenSeries.has('events');
  const toggleSeries = (key: string): void => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 选区带：拖选实时 / 已提交（手动区间读数；事件高亮不再占用该层）
  const activeBrush = brushLive ?? brush;
  const brushLo = activeBrush ? Math.min(activeBrush[0], activeBrush[1]) : 0;
  const brushHi = activeBrush ? Math.max(activeBrush[0], activeBrush[1]) : 0;

  // ---- 图内高亮层：开关（0.12）+ 悬停临时（0.16，不受开关影响）；事件图例
  // 隐藏时整层（常驻 + 临时 + 小标轨）一起隐藏 ----
  const highlightRects = useMemo(() => (eventsVisible ? ticksIn
    .map((tick) => {
      const lo = Math.max(tick.startWeek, s);
      const hi = Math.min(tick.endWeek, e);
      return lo > hi ? null : { tick, startIndex: lo - s, endIndex: hi - s };
    })
    .filter((rect): rect is { tick: ReferenceTrackTick; startIndex: number; endIndex: number } => rect != null) : []),
  [ticksIn, s, e, eventsVisible]);
  const hoverTickId = tickHoverId ?? (props.hoverEventId != null && ticksIn.some((t) => t.id === props.hoverEventId) ? props.hoverEventId : null);
  const hoverRect = eventsVisible && hoverTickId != null ? highlightRects.find((rect) => rect.tick.id === hoverTickId) ?? null : null;

  // ---- 区间读数（手动拖选）：价 / 量端点取首个 / 末个有效点，标实际参与周 ----
  const reading = useMemo(() => {
    if (activeBrush == null || props.rangePickMode) return null;
    const firstValid = (list: Array<number | null>): { week: number; value: number } | null => {
      for (let i = brushLo; i <= brushHi; i++) {
        const v = list[i];
        if (v != null && Number.isFinite(v)) return { week: i, value: v };
      }
      return null;
    };
    const lastValid = (list: Array<number | null>): { week: number; value: number } | null => {
      for (let i = brushHi; i >= brushLo; i--) {
        const v = list[i];
        if (v != null && Number.isFinite(v)) return { week: i, value: v };
      }
      return null;
    };
    const pairText = (a: { week: number; value: number } | null, b: { week: number; value: number } | null, fmt: (v: number) => string): string => {
      if (a == null || b == null) return '—';
      const pct = ((b.value / Math.max(1e-6, a.value)) - 1) * 100;
      // 端点周统一日历周口径（2025W24，与 X 轴 / 事件周段标签同形）
      return `${fmt(a.value)}（${weekLabelAt(s + a.week)}）→ ${fmt(b.value)}（${weekLabelAt(s + b.week)}） ${signedPctText(pct)}`;
    };
    return {
      weeks: brushHi - brushLo + 1,
      absStart: s + brushLo,
      absEnd: s + brushHi,
      priceText: pairText(firstValid(prices), lastValid(prices), priceShortText),
      volumeText: pairText(firstValid(values), lastValid(values), volumeShortText),
    };
  }, [activeBrush, brushLo, brushHi, prices, values, s, weekIds, props.rangePickMode]);

  // 拖选事件时段模式：拖动中只显示 起周日历周–止周日历周 · N 周（不显示量价读数）
  const rangePickText = props.rangePickMode && activeBrush
    ? `${weekLabelAt(s + brushLo)}–${weekLabelAt(s + brushHi)} · ${brushHi - brushLo + 1} 周`
    : null;

  const seriesColor = brandColorOf(product.brand);
  const missingWeeks = useMemo(() => values
    .map((v, i) => (v == null || prices[i] == null ? weekLabelAt(s + i) : ''))
    .filter(Boolean), [values, prices, s, weekIds]);
  const legendItems: LegendItem[] = [
    { key: 'volume', label: '销量', shape: 'rect', color: seriesColor },
    { key: 'price', label: '价格', shape: 'line', color: seriesColor },
    { key: 'events', label: '事件', shape: 'marker', color: color.link },
  ];

  // 事件点交互（rangePickMode 下交给拖选，事件点不抢指针）
  const tickInteractive = !props.rangePickMode;
  const eventDotProps = (tick: ReferenceTrackTick): {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onClick: () => void;
    onKeyDown: (event: ReactKeyboardEvent<SVGElement>) => void;
  } => ({
    onPointerEnter: () => {
      setTickHoverId(tick.id);
      props.onHoverEvent?.(tick.id);
    },
    onPointerLeave: () => {
      setTickHoverId(null);
      props.onHoverEvent?.(null);
    },
    onClick: () => props.onSelectEvent?.(props.selectedEventId === tick.id ? null : tick.id),
    onKeyDown: (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      props.onSelectEvent?.(props.selectedEventId === tick.id ? null : tick.id);
    },
  });
  const bandDotHoverProps = (tick: ReferenceTrackTick): {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  } => ({
    onPointerEnter: () => setTickHoverId(tick.id),
    onPointerLeave: () => setTickHoverId(null),
  });

  if (total === 0) {
    return <div role="status" style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>;
  }

  const firstWeekId = weekIds[0] ?? product.launchWeekLabel;
  const windowFirstId = windowWeekIds[0] ?? firstWeekId;
  const windowLastId = windowWeekIds[windowWeekIds.length - 1] ?? '';
  const ariaLabel = `${product.label} 全生命周期量价图（上市 ${firstWeekId} 起 ${total} 周；横轴为日历周标签，如 ${windowFirstId}–${windowLastId}，首尾恒显示）：左轴为销量柱（台/周）、右轴为价格线（$）；图顶小标轨为事件点（含大促档期，小方块点标在事件起始周，档期 = 琥珀色），文字替代见下方事件名录。图上拖选区间读价量变化${props.rangePickMode ? '；当前为拖选事件时段模式，按下—拖动—松手回填起止周，Esc 取消' : ''}。`;

  return (
    <div style={{ minWidth: 0 }}>
      <div ref={wrapRef} style={{ position: 'relative', height: plotBottom + LABEL_H + 4 }}>
        {/* 底层：图内高亮（开关 0.12 / 悬停 0.16）+ 价格轴刻度（右）+ 悬停参考线 + X 日历周标签 */}
        <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
          {eventsVisible && highlightAll && highlightRects.map((rect) => (
            <rect
              key={`hl-${rect.tick.id}`}
              x={xLeft(rect.startIndex)}
              y={PLOT_TOP}
              width={Math.max(1, colW * (rect.endIndex - rect.startIndex + 1))}
              height={PLOT_H}
              fill={rect.tick.color}
              opacity={0.12}
              rx={3}
            />
          ))}
          {eventsVisible && hoverRect && (
            <rect
              key="hl-hover"
              x={xLeft(hoverRect.startIndex)}
              y={PLOT_TOP}
              width={Math.max(1, colW * (hoverRect.endIndex - hoverRect.startIndex + 1))}
              height={PLOT_H}
              fill={hoverRect.tick.color}
              opacity={0.16}
              rx={3}
            />
          )}
          {[priceBounds.hi, (priceBounds.hi + priceBounds.lo) / 2, priceBounds.lo].map((v, i) => (
            <text
              key={`pt-${i}`}
              x={GRID_L + plotWidth + 6}
              y={y$(v) + 3}
              fontSize={10}
              fill={color.mute}
              textAnchor="start"
              fontFamily={font.family}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              ${Math.round(v).toLocaleString('en-US')}
            </text>
          ))}
          {hover != null && (
            <line x1={xAt(hover)} x2={xAt(hover)} y1={PLOT_TOP} y2={plotBottom} stroke={color.hairlineStrong} strokeOpacity={0.6} />
          )}
          {/* X 轴日历周标签（#1）：axisTickPlan 同价格走势页——首尾恒显示（加粗）、
              step 抽稀 + 边界让位；文案 = YYYYWww（shortBucketLabel 周口径） */}
          {xPlan.indexes.map((i) => {
            const edge = xPlan.isEdge(i);
            return (
              <text
                key={`x-${i}`}
                x={xAt(i)}
                y={plotBottom + 12}
                textAnchor="middle"
                fontSize={10}
                fill={edge ? color.body : color.mute}
                fontWeight={edge ? 600 : 400}
                fontFamily={font.family}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {xPlan.dateText(i)}
              </text>
            );
          })}
        </svg>
        {/* 量柱层（volume/VolumeBars：axisSide='left' 左量右价；手动选区带 / 上限编辑）。
            图例「销量」隐藏时整层不渲染（价格轴与几何不重算，量价页同门控口径） */}
        {geom && volumeVisible && (
          <VolumeBars
            geom={geom}
            plotTop={PLOT_TOP}
            plotHeight={PLOT_H}
            values={values}
            vMax={vMax}
            color={seriesColor}
            hoverIdx={hover}
            axisSide="left"
            axisLimits={axisLimits}
            onAxisLimit={(_kind, value) => setAxisLimits({ max: value })}
            selectionBand={activeBrush ? { startIndex: brushLo, endIndex: brushHi } : undefined}
          />
        )}
        {/* 价格线（实线 2px + 灰虚桥接） + 顶部事件点轨（#2 合一：档期也是事件点） */}
        <svg
          role="img"
          aria-label={ariaLabel}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1, overflow: 'visible' }}
        >
          {priceVisible && solidSegs.map((segment, segmentIndex) => (
            <path key={`solid-${segmentIndex}`} d={pathOf(segment)} fill="none" stroke={seriesColor} strokeWidth={2} />
          ))}
          {priceVisible && bridges.map(([from, to], bridgeIndex) => (
            <path
              key={`bridge-${bridgeIndex}`}
              d={`M${xAt(from).toFixed(1)} ${y$(prices[from] as number).toFixed(1)} L${xAt(to).toFixed(1)} ${y$(prices[to] as number).toFixed(1)}`}
              fill="none"
              stroke={color.hairlineStrong}
              strokeWidth={1.2}
              strokeDasharray="2 3"
              opacity={0.85}
            />
          ))}
          {eventsVisible && dotPlacements.map(({ tick, startIndex, stack }) => {
            const cx = xAt(startIndex);
            const cy = dotCyOf(stack);
            const isEvent = tick.kind === 'event';
            const hovered = tickHoverId === tick.id || (isEvent && props.hoverEventId === tick.id);
            const selected = isEvent && props.selectedEventId === tick.id;
            const rangeLabel = eventRangeLabel(tick, product);
            const anchorAria = isEvent ? `事件 ${rangeLabel} ${tick.label}` : `档期 ${tick.label} ${rangeLabel}`;
            // 小方块点：事件类目色填充；悬停 / 选中加墨色描边（文字始终承载语义）
            const dot = (
              <rect
                x={cx - DOT / 2}
                y={cy - DOT / 2}
                width={DOT}
                height={DOT}
                rx={1.5}
                fill={tick.color}
                stroke={selected || hovered ? color.ink : 'none'}
                strokeWidth={selected || hovered ? 1.5 : 0}
              />
            );
            if (!isEvent || !tickInteractive) {
              return (
                <g
                  key={tick.id}
                  role={isEvent ? undefined : 'img'}
                  aria-label={isEvent ? undefined : anchorAria}
                  style={{ pointerEvents: tickInteractive ? 'auto' : 'none' }}
                  {...(tickInteractive ? bandDotHoverProps(tick) : {})}
                >
                  {isEvent ? dot : (
                    <g>
                      <title>{`${anchorAria}（大促档期）`}</title>
                      {dot}
                    </g>
                  )}
                </g>
              );
            }
            return (
              <g key={tick.id} style={{ pointerEvents: 'auto', cursor: 'pointer' }} {...eventDotProps(tick)}>
                <rect
                  x={cx - 6}
                  y={cy - 6}
                  width={12}
                  height={12}
                  fill="transparent"
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                  tabIndex={0}
                  role="button"
                  aria-label={anchorAria}
                />
                {dot}
              </g>
            );
          })}
          {/* +N 聚合（同起点第三事件起）：点击打开只含这些事件的名录筛选 */}
          {eventsVisible && overflowEvents.length > 0 && (() => {
            const first = overflowEvents[0];
            const x = Math.min(Math.max(0, first.startWeek - s), n - 1);
            const cy = dotCyOf(1);
            return (
              <g
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onClick={() => props.onOverflowEvents?.(overflowEvents.map((ev) => ev.id))}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  props.onOverflowEvents?.(overflowEvents.map((ev) => ev.id));
                }}
                tabIndex={0}
                role="button"
                aria-label={`查看其余 ${overflowEvents.length} 个重叠事件`}
              >
                <rect x={xAt(x) - 11} y={cy - 5.5} width={22} height={11} rx={5.5} fill={color.canvas} stroke={color.hairlineStrong} />
                <text
                  x={xAt(x)}
                  y={cy + 3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill={color.mute}
                  fontFamily={font.family}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {`+${overflowEvents.length}`}
                </text>
              </g>
            );
          })()}
          {priceVisible && hover != null && prices[hover] != null && (
            <circle cx={xAt(hover)} cy={y$(prices[hover] as number)} r={3.5} fill={color.canvas} stroke={seriesColor} strokeWidth={1.5} />
          )}
        </svg>
        {/* 拖选事件时段的实时提示（只显示 W起–W止 · N 周，无量价读数） */}
        {rangePickText && (
          <div
            role="status"
            className="tnum"
            style={{
              position: 'absolute',
              left: GRID_L + 4,
              top: PLOT_TOP + 18,
              zIndex: 30,
              padding: '4px 8px',
              background: color.canvas,
              border: '1px solid rgba(0, 112, 243, 0.35)',
              borderRadius: 6,
              fontFamily: font.family,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 11,
              lineHeight: '15px',
              color: color.body,
              pointerEvents: 'none',
            }}
          >
            {`已选 ${rangePickText}`}
          </div>
        )}
        {/* 手动区间读数胶囊（端点取首个 / 末个有效点，标注实际参与计算的周；缺数「—」不造 0） */}
        {reading && geom && !props.rangePickMode && (
          <div
            role="group"
            aria-label={`区间读数 ${weekLabelAt(reading.absStart)}–${weekLabelAt(reading.absEnd)}：价 ${reading.priceText}，量 ${reading.volumeText}`}
            className="tnum"
            style={{
              position: 'absolute',
              left: GRID_L + 4,
              top: selectedEvent ? PLOT_TOP + 128 : PLOT_TOP + 18,
              zIndex: 30,
              maxWidth: Math.max(180, plotWidth - 12),
              padding: '6px 8px',
              background: color.canvas,
              border: '1px solid rgba(0, 112, 243, 0.35)',
              borderRadius: 6,
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
              fontFamily: font.family,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 11,
              lineHeight: '15px',
              color: color.body,
              pointerEvents: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: color.mute }}>
              区间 {weekLabelAt(reading.absStart)}–{weekLabelAt(reading.absEnd)} · {reading.weeks} 周
              <button
                type="button"
                aria-label="清除所选区间"
                title="清除所选区间"
                onClick={() => { setBrush(null); setBrushLive(null); }}
                style={{ display: 'inline-grid', placeItems: 'center', width: 18, height: 18, padding: 0, border: 0, borderRadius: 999, background: 'transparent', color: color.mute, fontSize: 12, lineHeight: 1, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            <div style={{ marginTop: 2, whiteSpace: 'nowrap' }}>价 {reading.priceText}</div>
            <div style={{ marginTop: 1, whiteSpace: 'nowrap' }}>量 {reading.volumeText}</div>
          </div>
        )}
        {/* 证据浮框（五项精简）：名称 + 起止周 / 幅度 / 衰减方式 / 说明（有才显示）/ 编辑 */}
        {selectedEvent && geom && !props.rangePickMode && (
          <div
            role="group"
            aria-label={`事件详情 ${eventRangeLabel(selectedEvent, product)} ${selectedEvent.label}`}
            className="tnum"
            style={{
              position: 'absolute',
              left: GRID_L + 4,
              top: PLOT_TOP + 18,
              zIndex: 30,
              width: Math.max(200, Math.min(260, plotWidth - 40)),
              maxHeight: PLOT_H + 26,
              overflowY: 'auto',
              padding: '6px 8px',
              background: color.canvas,
              border: '1px solid rgba(0, 112, 243, 0.35)',
              borderRadius: 6,
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
              fontFamily: font.family,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 11,
              lineHeight: '15px',
              color: color.body,
              pointerEvents: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 }}>
              <span style={{ fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
                {`${eventRangeLabel(selectedEvent, product)} · ${selectedEvent.label}`}
              </span>
              <button
                type="button"
                aria-label="关闭事件详情"
                title="关闭事件详情"
                onClick={() => props.onSelectEvent?.(null)}
                style={{ display: 'inline-grid', placeItems: 'center', width: 18, height: 18, marginLeft: 'auto', padding: 0, border: 0, borderRadius: 999, background: 'transparent', color: color.mute, fontSize: 12, lineHeight: 1, cursor: 'pointer', flex: 'none' }}
              >
                ×
              </button>
            </div>
            <div style={{ marginTop: 3, display: 'flex', gap: 8 }}>
              <span style={{ color: color.mute, flex: '0 0 30px' }}>幅度</span>
              <span>{impactPctText(selectedEvent.impact)}</span>
            </div>
            <div style={{ marginTop: 2, display: 'flex', gap: 8 }}>
              <span style={{ color: color.mute, flex: '0 0 30px' }}>衰减</span>
              <span>{selectedEvent.impact ? REFERENCE_DECAY_LABEL[selectedEvent.impact.decay] : REFERENCE_DECAY_LABEL.unspecified}</span>
            </div>
            {selectedEvent.note && (
              <div style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedEvent.note}</div>
            )}
            {props.onEditEvent && (
              <div style={{ marginTop: 5 }}>
                <button
                  type="button"
                  aria-label={`编辑事件 ${eventRangeLabel(selectedEvent, product)} ${selectedEvent.label}`}
                  onClick={() => props.onEditEvent?.(selectedEvent.id)}
                  style={{ height: 20, padding: '0 8px', borderRadius: 6, border: `1px solid ${color.hairline}`, background: color.canvas, color: color.body, font: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: `background ${motion.fast}ms` }}
                >
                  编辑
                </button>
              </div>
            )}
          </div>
        )}
        {/* 指针承接层（volume/PointerShield 复用）：悬停列 / 拖选（区间读数或事件起止周） */}
        {geom && (
          <PointerShield
            plotLeft={GRID_L}
            plotTop={PLOT_TOP}
            plotWidth={plotWidth}
            plotHeight={PLOT_H}
            extraBottom={LABEL_H + 4}
            n={n}
            onHover={setHover}
            onBrush={(range, committing) => {
              if (committing) {
                if (range) {
                  if (props.rangePickMode) {
                    props.onSelectRange?.(s + range[0], s + range[1]);
                    setBrush(null);
                    setBrushLive(null);
                    return;
                  }
                  props.onSelectEvent?.(null);
                  setBrush(range);
                } else if (!props.rangePickMode) {
                  setBrush(null);
                }
                setBrushLive(null);
              } else {
                setBrushLive(range);
              }
            }}
            onCrossY={() => {}}
          />
        )}
      </div>
      {missingWeeks.length > 0 && (
        <div style={{ marginTop: 2, fontSize: 10.5, color: color.mute }}>缺数 {missingWeeks.join('、')} · 不计 0</div>
      )}
      {/* 图例行（#3/#4）：销量 / 价格 / 事件 全部可点切换显隐（aria-pressed + 隐藏态
          opacity .45）；「图内高亮」开关内联紧跟「事件」项之后（默认关） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.xs, minWidth: 0 }}>
        <WorkbenchLegend
          items={legendItems}
          hidden={hiddenSeries}
          onToggle={toggleSeries}
          style={{ marginTop: 4, flex: '0 0 auto', justifyContent: 'flex-start' }}
        />
        <button
          type="button"
          role="switch"
          aria-checked={highlightAll}
          title={highlightAll
            ? '图内高亮已开：所有事件（含大促档期）区间渲染各自颜色的 0.12 透明度底色；悬停事件点仍临时加深'
            : '图内高亮已关：图内只保留顶部事件点；悬停任意事件点仍临时高亮对应区间'}
          onClick={() => setHighlightAll((prev) => !prev)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            flex: 'none',
            padding: '2px 4px',
            border: 'none',
            background: 'transparent',
            font: 'inherit',
            fontSize: 11,
            color: color.body,
            cursor: 'pointer',
            borderRadius: 6,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'relative',
              display: 'inline-block',
              width: 26,
              height: 15,
              borderRadius: 999,
              background: highlightAll ? color.link : color.hairlineStrong,
              transition: `background ${motion.fast}ms`,
              flex: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: highlightAll ? 13 : 2,
                width: 11,
                height: 11,
                borderRadius: 999,
                background: color.canvas,
                transition: `left ${motion.fast}ms`,
              }}
            />
          </span>
          {`图内高亮${highlightAll ? '：开' : '：关'}`}
        </button>
      </div>
    </div>
  );
}
