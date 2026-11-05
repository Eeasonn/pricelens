// ============================================================
// 推演工作台 v2 · 量价参考卡 · 全生命周期量价图（视觉精简二轮）：
// 与量价走势页同语言——量柱复用 volume/VolumeBars（axisSide='left'，真实
// 改几何落实左量右价）+ 价格线同系列色实线（刻度画在右侧 $）。
// 2026-11-05 六条反馈：
// - 顶部小标统一：事件与大促档期同形态（区间 = 左右箭头 + 中间线，单周 =
//   小方标），档期用琥珀色；删除图内常驻琥珀档期带。
// - 「图内高亮」开关（图例行，默认关）：关 = 图内无任何事件高亮（只有顶部
//   小标）；开 = 所有小标对应区间渲染各自颜色 0.12 透明度底色；悬停任意
//   小标（或名录行 hover）→ 对应区间临时高亮（0.16，不受开关影响）。
// - 证据浮框精简为五项：事件名称 + 起止周、幅度、衰减方式、说明（有才
//   显示）、[编辑]；删除读数行与来源标注（纯函数 computeEventRangeReading
//   保留导出，仅删浮框调用）。
// 缺数纪律：缺采周不造 0——柱不画、实线断开、跨缺灰虚桥接。图例收敛为
// 「销量 / 价格 / 档期 / 事件 + 图内高亮」；图无障碍名按实际「左量右价」。
// 布局照 volume/CostBarChart 范式：ResizeObserver 量宽 → 全部按像素定位，
// 指针承接层复用 volume/PointerShield（悬停列 / 拖选区间）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import PointerShield from '../volume/PointerShield';
import VolumeBars from '../volume/VolumeBars';
import { vMaxOf } from '../volume/volumeAxis';
import { brandColorOf, color, font, motion, space } from '../../theme/tokens';
import type { LifecycleProductSeed } from './workbenchFixture';
import { WorkbenchLegend, type LegendItem } from './WorkbenchBits';
import {
  eventRangeLabel,
  REFERENCE_DECAY_LABEL,
  type EffectiveReferenceEvent,
} from './referenceEventModel';

// 左量右价：左侧留销量轴区（刻度 + 上限编辑），右侧留价格刻度区（$）
const GRID_L = 84;
const GRID_R = 52;
const TRACK_TOP = 4;
const LANE_H = 9;
const LANE_GAP = 3;
export const EVENT_TRACK_LANES = 2;
const PLOT_TOP = TRACK_TOP + EVENT_TRACK_LANES * LANE_H + LANE_GAP + 2; // ≈ 30
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
// 顶部小标轨：事件 + 大促档期统一形态（区间 = 箭头-线，单周 = 小方标）。
// ------------------------------------------------------------
export interface ReferenceTrackTick {
  id: string;
  kind: 'event' | 'band';
  label: string;
  startWeek: number;
  endWeek: number;
  color: string;
}

export interface TrackLaneAssignment {
  lane: 0 | 1;
  overflow: boolean;
}

/** 顶部小标 lane 分配：按起周贪心放 lane 0/1（重叠不共 lane）；第三条起 overflow。 */
export function assignTrackLanes(
  spans: ReadonlyArray<{ id: string; startWeek: number; endWeek: number }>,
): Map<string, TrackLaneAssignment> {
  const map = new Map<string, TrackLaneAssignment>();
  const sorted = [...spans].sort((a, b) => a.startWeek - b.startWeek || a.endWeek - b.endWeek || a.id.localeCompare(b.id));
  const laneEnd: [number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const span of sorted) {
    if (laneEnd[0] < span.startWeek) {
      laneEnd[0] = span.endWeek;
      map.set(span.id, { lane: 0, overflow: false });
    } else if (laneEnd[1] < span.startWeek) {
      laneEnd[1] = span.endWeek;
      map.set(span.id, { lane: 1, overflow: false });
    } else {
      map.set(span.id, { lane: 1, overflow: true });
    }
  }
  return map;
}

interface LaneAssignment {
  lane: 0 | 1;
  overflow: EffectiveReferenceEvent[];
}

/** 事件 lane 分配（assignTrackLanes 的事件形状包装，保持既有导出契约）。 */
export function assignEventLanes(events: EffectiveReferenceEvent[]): Map<string, LaneAssignment> {
  const assignments = assignTrackLanes(events);
  const overflowIds = new Set(
    [...assignments.entries()].filter(([, a]) => a.overflow).map(([id]) => id),
  );
  const overflow = events.filter((ev) => overflowIds.has(ev.id));
  const map = new Map<string, LaneAssignment>();
  for (const ev of events) {
    const assignment = assignments.get(ev.id);
    if (assignment) map.set(ev.id, { lane: assignment.lane, overflow });
  }
  return map;
}

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
  /** 名录行 hover → 小标加粗 + 区间临时高亮；小标 hover 反向上报。 */
  hoverEventId?: string | null;
  onHoverEvent?: (id: string | null) => void;
  /** 事件轨 +N 聚合点击：只看这些事件（父层回填名录筛选）。 */
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
  /** 图内高亮开关（图例行，默认关）：关 = 图内无任何事件高亮。 */
  const [highlightAll, setHighlightAll] = useState(false);
  /** 小标直接悬停（本地即时态；名录 hover 走 hoverEventId）。 */
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
  const laneY = (lane: 0 | 1): number => TRACK_TOP + lane * (LANE_H + LANE_GAP);

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

  // ---- 顶部小标（事件 + 大促档期统一形态，档期 = 琥珀；无来源标注） ----
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
  const tickLaneMap = useMemo(() => assignTrackLanes(ticksIn), [ticksIn]);
  // 第三条起聚合 +N（只聚合事件；档期小标不聚合，保证档期可见）
  const overflowEvents = useMemo(() => eventsIn.filter((ev) => tickLaneMap.get(ev.id)?.overflow), [eventsIn, tickLaneMap]);

  const selectedEvent = useMemo(
    () => (props.selectedEventId ? events.find((ev) => ev.id === props.selectedEventId) ?? null : null),
    [events, props.selectedEventId],
  );

  // 选区带：拖选实时 / 已提交（手动区间读数；事件高亮不再占用该层）
  const activeBrush = brushLive ?? brush;
  const brushLo = activeBrush ? Math.min(activeBrush[0], activeBrush[1]) : 0;
  const brushHi = activeBrush ? Math.max(activeBrush[0], activeBrush[1]) : 0;

  // ---- 图内高亮层：开关（0.12）+ 悬停临时（0.16，不受开关影响） ----
  const highlightRects = useMemo(() => ticksIn
    .map((tick) => {
      const lo = Math.max(tick.startWeek, s);
      const hi = Math.min(tick.endWeek, e);
      return lo > hi ? null : { tick, startIndex: lo - s, endIndex: hi - s };
    })
    .filter((rect): rect is { tick: ReferenceTrackTick; startIndex: number; endIndex: number } => rect != null),
  [ticksIn, s, e]);
  const hoverTickId = tickHoverId ?? (props.hoverEventId != null && ticksIn.some((t) => t.id === props.hoverEventId) ? props.hoverEventId : null);
  const hoverRect = hoverTickId != null ? highlightRects.find((rect) => rect.tick.id === hoverTickId) ?? null : null;

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
      return `${fmt(a.value)}（W${a.week + 1}）→ ${fmt(b.value)}（W${b.week + 1}） ${signedPctText(pct)}`;
    };
    return {
      weeks: brushHi - brushLo + 1,
      absStart: s + brushLo,
      absEnd: s + brushHi,
      priceText: pairText(firstValid(prices), lastValid(prices), priceShortText),
      volumeText: pairText(firstValid(values), lastValid(values), volumeShortText),
    };
  }, [activeBrush, brushLo, brushHi, prices, values, s, props.rangePickMode]);

  // 拖选事件时段模式：拖动中只显示 W起–W止 · N 周（不显示量价读数）
  const rangePickText = props.rangePickMode && activeBrush
    ? `W${s + brushLo + 1}–W${s + brushHi + 1} · ${brushHi - brushLo + 1} 周`
    : null;

  const seriesColor = brandColorOf(product.brand);
  const missingWeeks = useMemo(() => values
    .map((v, i) => (v == null || prices[i] == null ? `W${s + i + 1}` : ''))
    .filter(Boolean), [values, prices, s]);
  const legendItems: LegendItem[] = [
    { label: '销量', shape: 'rect', color: seriesColor },
    { label: '价格', shape: 'line', color: seriesColor },
    { label: '档期', shape: 'rectAmber', color: color.warning },
    { label: '事件', shape: 'marker', color: color.link },
  ];
  const labelStep = Math.max(1, Math.ceil(n / 6));

  // 小标轨交互（rangePickMode 下交给拖选，小标不抢指针）
  const tickInteractive = !props.rangePickMode;
  const eventTickProps = (tick: ReferenceTrackTick): {
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
  const bandTickHoverProps = (tick: ReferenceTrackTick): {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  } => ({
    onPointerEnter: () => setTickHoverId(tick.id),
    onPointerLeave: () => setTickHoverId(null),
  });

  if (total === 0) {
    return <div role="status" style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>;
  }

  const ariaLabel = `${product.label} 全生命周期量价图（上市 ${product.launchWeekLabel} 起 ${total} 周）：左轴为销量柱（台/周）、右轴为价格线（$）；图顶小标轨为事件与大促档期（档期 = 琥珀色小标，区间为箭头-线、单周为方标），文字替代见下方事件名录。图上拖选区间读价量变化${props.rangePickMode ? '；当前为拖选事件时段模式，按下—拖动—松手回填起止周，Esc 取消' : ''}。`;

  return (
    <div style={{ minWidth: 0 }}>
      <div ref={wrapRef} style={{ position: 'relative', height: plotBottom + LABEL_H + 4 }}>
        {/* 底层：图内高亮（开关 0.12 / 悬停 0.16）+ 价格轴刻度（右）+ 悬停参考线 + X 周标签 */}
        <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
          {highlightAll && highlightRects.map((rect) => (
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
          {hoverRect && (
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
          <g fontSize={10} fill={color.mute} textAnchor="middle">
            {Array.from({ length: n }, (_, i) => i)
              .filter((i) => i % labelStep === 0 || i === n - 1)
              .map((i) => (
                <text key={`x-${i}`} x={xAt(i)} y={plotBottom + 12}>W{s + i + 1}</text>
              ))}
          </g>
        </svg>
        {/* 量柱层（volume/VolumeBars：axisSide='left' 左量右价；手动选区带 / 上限编辑） */}
        {geom && (
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
        {/* 价格线（实线 + 灰虚桥接） + 顶部小标轨（事件与档期统一形态） */}
        <svg
          role="img"
          aria-label={ariaLabel}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1, overflow: 'visible' }}
        >
          {solidSegs.map((segment, segmentIndex) => (
            <path key={`solid-${segmentIndex}`} d={pathOf(segment)} fill="none" stroke={seriesColor} strokeWidth={2} />
          ))}
          {bridges.map(([from, to], bridgeIndex) => (
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
          {ticksIn.map((tick) => {
            const assignment = tickLaneMap.get(tick.id);
            if (!assignment) return null;
            // 事件第三条起聚合 +N（由聚合 chip 承接）；档期小标不聚合（强制 lane 1 画）
            if (tick.kind === 'event' && assignment.overflow) return null;
            const lane = assignment.overflow ? 1 : assignment.lane;
            const yC = laneY(lane) + LANE_H / 2;
            const lo = Math.max(tick.startWeek, s);
            const hi = Math.min(tick.endWeek, e);
            const single = tick.startWeek === tick.endWeek;
            const isEvent = tick.kind === 'event';
            const hovered = tickHoverId === tick.id || (isEvent && props.hoverEventId === tick.id);
            const selected = isEvent && props.selectedEventId === tick.id;
            const strokeWidth = selected || hovered ? 2 : 1.5;
            const rangeLabel = eventRangeLabel(tick);
            const anchorAria = isEvent ? `事件 ${rangeLabel} ${tick.label}` : `档期 ${tick.label} ${rangeLabel}`;
            if (single) {
              const cx0 = xAt(lo - s);
              const square = (
                <rect
                  x={cx0 - 3}
                  y={yC - 3.5}
                  width={6}
                  height={7}
                  rx={1.5}
                  fill={color.canvas}
                  stroke={tick.color}
                  strokeWidth={selected || hovered ? 2 : 1.5}
                />
              );
              if (!isEvent || !tickInteractive) {
                return (
                  <g key={tick.id} style={{ pointerEvents: tickInteractive ? 'auto' : 'none' }} {...(tickInteractive ? bandTickHoverProps(tick) : {})}>
                    {isEvent ? square : (
                      <g role="img" aria-label={anchorAria}>
                        <title>{`${anchorAria}（大促档期）`}</title>
                        {square}
                      </g>
                    )}
                  </g>
                );
              }
              return (
                <g key={tick.id} style={{ pointerEvents: 'auto', cursor: 'pointer' }} {...eventTickProps(tick)}>
                  <rect
                    x={cx0 - 5}
                    y={yC - 5}
                    width={10}
                    height={10}
                    fill="transparent"
                    style={{ pointerEvents: 'all', cursor: 'pointer' }}
                    tabIndex={0}
                    role="button"
                    aria-label={anchorAria}
                  />
                  {square}
                </g>
              );
            }
            // 区间小标：左右小箭头 + 中间连线（无背景色；高亮归图内高亮层）
            const x1 = xLeft(lo - s) + 1;
            const x2 = xRight(hi - s) - 1;
            const mark = (
              <g>
                <path d={`M${(x1 + 4).toFixed(1)} ${(yC - 4).toFixed(1)} L${x1.toFixed(1)} ${yC.toFixed(1)} L${(x1 + 4).toFixed(1)} ${(yC + 4).toFixed(1)}`} fill="none" stroke={tick.color} strokeWidth={strokeWidth} />
                <line x1={x1 + 4} y1={yC} x2={x2 - 4} y2={yC} stroke={tick.color} strokeWidth={strokeWidth} opacity={0.8} />
                <path d={`M${(x2 - 4).toFixed(1)} ${(yC - 4).toFixed(1)} L${x2.toFixed(1)} ${yC.toFixed(1)} L${(x2 - 4).toFixed(1)} ${(yC + 4).toFixed(1)}`} fill="none" stroke={tick.color} strokeWidth={strokeWidth} />
              </g>
            );
            if (!isEvent || !tickInteractive) {
              return (
                <g key={tick.id} style={{ pointerEvents: tickInteractive ? 'auto' : 'none' }} {...(tickInteractive ? bandTickHoverProps(tick) : {})}>
                  {isEvent ? mark : (
                    <g role="img" aria-label={anchorAria}>
                      <title>{`${anchorAria}（大促档期）`}</title>
                      {mark}
                    </g>
                  )}
                </g>
              );
            }
            return (
              <g key={tick.id}>
                {/* 选中时段：端点周标签（非选中不显示长标题） */}
                {selected && (
                  <text x={(x1 + x2) / 2} y={yC - 6} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={tick.color} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {rangeLabel}
                  </text>
                )}
                <g style={{ pointerEvents: 'auto', cursor: 'pointer' }} {...eventTickProps(tick)}>
                  <rect
                    x={x1}
                    y={laneY(lane) - 1}
                    width={Math.max(6, x2 - x1)}
                    height={LANE_H + 2}
                    fill="transparent"
                    style={{ pointerEvents: 'all', cursor: 'pointer' }}
                    tabIndex={0}
                    role="button"
                    aria-label={anchorAria}
                  />
                  {mark}
                </g>
              </g>
            );
          })}
          {/* +N 聚合（第三条起的重叠事件）：点击打开只含这些事件的名录筛选 */}
          {overflowEvents.length > 0 && (() => {
            const first = overflowEvents[0];
            const x = Math.min(Math.max(0, first.startWeek - s), n - 1);
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
                <rect x={xAt(x) - 11} y={laneY(1) - 1} width={22} height={11} rx={5.5} fill={color.canvas} stroke={color.hairlineStrong} />
                <text x={xAt(x)} y={laneY(1) + 8} textAnchor="middle" fontSize={9} fontWeight={600} fill={color.body}>{`+${overflowEvents.length}`}</text>
              </g>
            );
          })()}
          {hover != null && prices[hover] != null && (
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
            aria-label={`区间读数 W${reading.absStart + 1}–W${reading.absEnd + 1}：价 ${reading.priceText}，量 ${reading.volumeText}`}
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
              区间 W{reading.absStart + 1}–W{reading.absEnd + 1} · {reading.weeks} 周
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
            aria-label={`事件详情 ${eventRangeLabel(selectedEvent)} ${selectedEvent.label}`}
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
                {`${eventRangeLabel(selectedEvent)} · ${selectedEvent.label}`}
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
                  aria-label={`编辑事件 ${eventRangeLabel(selectedEvent)} ${selectedEvent.label}`}
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
      {/* 图例行：销量 / 价格 / 档期 / 事件 + 图内高亮开关（默认关） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
        <WorkbenchLegend items={legendItems} hidden={new Set()} style={{ marginTop: 4, flex: '1 1 auto' }} />
        <button
          type="button"
          role="switch"
          aria-checked={highlightAll}
          title={highlightAll
            ? '图内高亮已开：所有事件与大促档期区间渲染各自颜色的 0.12 透明度底色；悬停小标仍临时加深'
            : '图内高亮已关：图内只保留顶部小标；悬停任意小标仍临时高亮对应区间'}
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
