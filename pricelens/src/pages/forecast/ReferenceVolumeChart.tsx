// ============================================================
// 推演工作台 v2 · 量价参考卡 · 全生命周期量价图（作业化重设计）：
// 与量价走势页同语言——量柱复用 volume/VolumeBars（axisSide='left'，真实
// 改几何落实左量右价）+ 价格线同系列色实线（刻度画在右侧 $）+ 大促档期
// 琥珀带（主图同款 warningSoft）+ 图顶事件轨（≤2 lane 的 □────□ 时段轨 +
// 单周虚线方形锚；第三条起聚合 +N 点击筛选）+ 事件选中（双向联动：
// selectedEventId 单一选中态，详情浮层 = 事件时段读数）+ 图上拖选（区间
// 读数；拖选事件时段模式下只回填起止周，两种选区语义不并存）。
// 读数只从本参考产品量价事实计算（referenceEventModel 纯函数）；预标
// impactPct 只作「预标参考」标注，不参与计算、不写因果词。缺数纪律：
// 缺采周不造 0——柱不画、实线断开、跨缺灰虚桥接、读数「—」。
// 图例收敛为「销量 / 价格 / 档期 / 事件」；图无障碍名按实际「左量右价」。
// 布局照 volume/CostBarChart 范式：ResizeObserver 量宽 → 全部按像素定位，
// 指针承接层复用 volume/PointerShield（悬停列 / 拖选区间）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import PointerShield from '../volume/PointerShield';
import VolumeBars from '../volume/VolumeBars';
import { vMaxOf } from '../volume/volumeAxis';
import { brandColorOf, color, font } from '../../theme/tokens';
import type { LifecycleProductSeed } from './workbenchFixture';
import { WorkbenchLegend, type LegendItem } from './WorkbenchBits';
import {
  computeEventRangeReading,
  durationOfEvent,
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

interface LaneAssignment {
  lane: 0 | 1;
  overflow: EffectiveReferenceEvent[];
}

/** 事件轨 lane 分配：按起周贪心放 lane 0/1（重叠不共 lane）；第三条起聚合 +N。 */
export function assignEventLanes(events: EffectiveReferenceEvent[]): Map<string, LaneAssignment> {
  const map = new Map<string, LaneAssignment>();
  const sorted = [...events].sort((a, b) => a.startWeek - b.startWeek || a.endWeek - b.endWeek || a.id.localeCompare(b.id));
  const laneEnd: [number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const overflow: EffectiveReferenceEvent[] = [];
  for (const ev of sorted) {
    if (laneEnd[0] < ev.startWeek) {
      laneEnd[0] = ev.endWeek;
      map.set(ev.id, { lane: 0, overflow });
    } else if (laneEnd[1] < ev.startWeek) {
      laneEnd[1] = ev.endWeek;
      map.set(ev.id, { lane: 1, overflow });
    } else {
      overflow.push(ev);
      map.set(ev.id, { lane: 1, overflow });
    }
  }
  return map;
}

export default function ReferenceVolumeChart(props: {
  product: LifecycleProductSeed;
  /** 查看窗口（生命周期周序，受控）：由本面板时间轨驱动。 */
  win: [number, number];
  /** 统一有效事件（预标 + 覆写 + 补录，已合并排序）。 */
  events?: EffectiveReferenceEvent[];
  labelOf: (typeId: string) => string;
  colorOf: (typeId: string) => string;
  /** 聚焦定位（生命周期周序 0 基）；配合 focusKey 触发悬停该周（参考回放联动）。 */
  focusWeek?: number | null;
  focusKey?: number;
  /** 统一选中态（名录 / 图锚 / 时段轨共享；null = 关闭详情）。 */
  selectedEventId?: string | null;
  onSelectEvent?: (id: string | null) => void;
  onEditEvent?: (id: string) => void;
  onRestorePreset?: (sourceEventId: string) => void;
  /** 名录行 hover → 图锚 / 时段加粗 + 弱竖线；图锚 hover 反向上报。 */
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

  const bandsIn = useMemo(() => product.promoBands
    .map((band) => {
      const start = Math.max(band.startWeek, s);
      const end = Math.min(band.endWeek, e);
      if (start > end) return null;
      return { key: `${band.startWeek}-${band.endWeek}`, label: band.label, start: start - s, end: end - s, width: end - start + 1 };
    })
    .filter((band): band is NonNullable<typeof band> => band != null), [product, s, e]);

  // ---- 事件（统一有效事件）：窗内事件 + lane 分配 + +N 聚合 ----
  const events = props.events ?? [];
  const eventsIn = useMemo(() => events
    .filter((ev) => ev.endWeek >= s && ev.startWeek <= e)
    .sort((a, b) => a.startWeek - b.startWeek || a.endWeek - b.endWeek || a.id.localeCompare(b.id)),
  [events, s, e]);
  const laneMap = useMemo(() => assignEventLanes(eventsIn), [eventsIn]);
  const overflowEvents = useMemo(() => {
    for (const assignment of laneMap.values()) return assignment.overflow;
    return [] as EffectiveReferenceEvent[];
  }, [laneMap]);

  const selectedEvent = useMemo(
    () => (props.selectedEventId ? events.find((ev) => ev.id === props.selectedEventId) ?? null : null),
    [events, props.selectedEventId],
  );
  const selectedReading = useMemo(
    () => (selectedEvent ? computeEventRangeReading(product, selectedEvent) : null),
    [product, selectedEvent],
  );

  // 选区带：拖选实时/已提交优先；无拖选时显示选中事件区间（与窗相交部分）
  const activeBrush = brushLive ?? brush;
  const brushLo = activeBrush ? Math.min(activeBrush[0], activeBrush[1]) : 0;
  const brushHi = activeBrush ? Math.max(activeBrush[0], activeBrush[1]) : 0;
  const selectedBand = useMemo(() => {
    if (!selectedEvent) return null;
    const lo = Math.max(selectedEvent.startWeek, s);
    const hi = Math.min(selectedEvent.endWeek, e);
    return lo > hi ? null : { startIndex: lo - s, endIndex: hi - s };
  }, [selectedEvent, s, e]);

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

  // 事件轨交互（rangePickMode 下交给拖选，锚点不抢指针）
  const eventAnchorProps = (ev: EffectiveReferenceEvent): {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onClick: () => void;
    onKeyDown: (event: ReactKeyboardEvent<SVGElement>) => void;
  } => ({
    onPointerEnter: () => props.onHoverEvent?.(ev.id),
    onPointerLeave: () => props.onHoverEvent?.(null),
    onClick: () => props.onSelectEvent?.(props.selectedEventId === ev.id ? null : ev.id),
    onKeyDown: (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      props.onSelectEvent?.(props.selectedEventId === ev.id ? null : ev.id);
    },
  });

  if (total === 0) {
    return <div role="status" style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>;
  }

  const ariaLabel = `${product.label} 全生命周期量价图（上市 ${product.launchWeekLabel} 起 ${total} 周）：左轴为销量柱（台/周）、右轴为价格线（$）；琥珀带为大促档期；图顶事件轨与锚点为事件，文字替代见下方事件名录。图上拖选区间读价量变化${props.rangePickMode ? '；当前为拖选事件时段模式，按下—拖动—松手回填起止周，Esc 取消' : ''}。`;

  return (
    <div style={{ minWidth: 0 }}>
      <div ref={wrapRef} style={{ position: 'relative', height: plotBottom + LABEL_H + 4 }}>
        {/* 底层：档期琥珀带 + 价格轴刻度（右）+ 悬停参考线 + X 周标签 */}
        <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
          {bandsIn.map((band) => (
            <g key={band.key}>
              <rect
                x={GRID_L + colW * band.start}
                y={PLOT_TOP}
                width={Math.max(1, colW * band.width)}
                height={PLOT_H}
                fill={color.warningSoft}
                opacity={0.55}
              />
              {colW * band.width > 64 && (
                <text
                  x={GRID_L + colW * (band.start + band.width / 2)}
                  y={PLOT_TOP + 11}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill={color.warningInk}
                >
                  {band.label}
                </text>
              )}
            </g>
          ))}
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
          {/* 名录 / 选中事件的弱竖线（hover 增强；click 等价路径在事件轨锚点） */}
          {eventsIn.filter((ev) => (props.hoverEventId != null && ev.id === props.hoverEventId) || (selectedEvent != null && ev.id === selectedEvent.id && selectedBand == null)).map((ev) => (
            <line key={`hover-line-${ev.id}`} x1={xAt(ev.startWeek - s)} x2={xAt(ev.startWeek - s)} y1={PLOT_TOP} y2={plotBottom} stroke={color.hairlineStrong} strokeOpacity={0.4} strokeDasharray="2 3" />
          ))}
          <g fontSize={10} fill={color.mute} textAnchor="middle">
            {Array.from({ length: n }, (_, i) => i)
              .filter((i) => i % labelStep === 0 || i === n - 1)
              .map((i) => (
                <text key={`x-${i}`} x={xAt(i)} y={plotBottom + 12}>W{s + i + 1}</text>
              ))}
          </g>
        </svg>
        {/* 量柱层（volume/VolumeBars：axisSide='left' 左量右价；选区带 / 上限编辑） */}
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
            selectionBand={activeBrush ? { startIndex: brushLo, endIndex: brushHi } : selectedBand}
          />
        )}
        {/* 价格线（实线 + 灰虚桥接） + 事件轨 + 事件锚层 */}
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
          {/* 事件轨（图顶，≤2 lane）：时段 □────□；单周 = 虚线 + 方形锚 */}
          {eventsIn.map((ev) => {
            const assignment = laneMap.get(ev.id);
            if (!assignment || assignment.overflow.some((o) => o.id === ev.id)) return null;
            const tone = props.colorOf(ev.typeId);
            const y = laneY(assignment.lane);
            const hovered = props.hoverEventId === ev.id;
            const selected = props.selectedEventId === ev.id;
            const single = ev.startWeek === ev.endWeek;
            const lo = Math.max(ev.startWeek, s);
            const hi = Math.min(ev.endWeek, e);
            const x1 = single ? xAt(lo - s) - 2 : xLeft(lo - s) + 1;
            const x2 = single ? xAt(lo - s) + 2 : xRight(hi - s) - 1;
            const label = `事件 ${eventRangeLabel(ev)} ${ev.label}`;
            const strokeWidth = selected || hovered ? 2 : 1.3;
            return (
              <g key={ev.id}>
                {single && (
                  <line
                    x1={xAt(lo - s)} y1={PLOT_TOP} x2={xAt(lo - s)} y2={plotBottom}
                    stroke={tone} strokeDasharray="3 4" opacity={selected || hovered ? 0.8 : 0.5}
                  />
                )}
                {/* 时段连接线 + 两端方形锚（□────□） */}
                {!single && (
                  <line x1={x1 + 4} y1={y + LANE_H / 2} x2={x2 - 4} y2={y + LANE_H / 2} stroke={tone} strokeWidth={strokeWidth} opacity={0.75} />
                )}
                {/* 单周锚（方形）+ 时段两端锚（方形） */}
                <rect
                  x={single ? x1 - 3 : x1}
                  y={single ? y + LANE_H / 2 - 3.5 : y + LANE_H / 2 - 3.5}
                  width={6}
                  height={7}
                  rx={1.5}
                  fill={color.canvas}
                  stroke={tone}
                  strokeWidth={selected || hovered ? 2 : 1.3}
                  style={props.rangePickMode ? undefined : { pointerEvents: 'auto', cursor: 'pointer' }}
                  tabIndex={props.rangePickMode ? undefined : 0}
                  role={props.rangePickMode ? undefined : 'button'}
                  aria-label={props.rangePickMode ? undefined : label}
                  onFocus={() => props.onHoverEvent?.(ev.id)}
                  onBlur={() => props.onHoverEvent?.(null)}
                  {...(props.rangePickMode ? {} : eventAnchorProps(ev))}
                />
                {!single && (
                  <rect
                    x={x2 - 6}
                    y={y + LANE_H / 2 - 3.5}
                    width={6}
                    height={7}
                    rx={1.5}
                    fill={color.canvas}
                    stroke={tone}
                    strokeWidth={selected || hovered ? 2 : 1.3}
                    style={props.rangePickMode ? undefined : { pointerEvents: 'auto', cursor: 'pointer' }}
                    tabIndex={props.rangePickMode ? undefined : -1}
                    aria-hidden={props.rangePickMode ? undefined : true}
                    {...(props.rangePickMode ? {} : eventAnchorProps(ev))}
                  />
                )}
                {/* 选中时段：加粗 + 端点周标签；非选中不显示长标题 */}
                {selected && !single && (
                  <text x={(x1 + x2) / 2} y={y - 1} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={tone} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {`W${ev.startWeek + 1}–W${ev.endWeek + 1}`}
                  </text>
                )}
                {/* 时段透明命中区（整段可点，键盘入口在左侧锚） */}
                {!single && !props.rangePickMode && (
                  <rect
                    x={x1}
                    y={y - 1}
                    width={Math.max(6, x2 - x1)}
                    height={LANE_H + 2}
                    fill="transparent"
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    {...eventAnchorProps(ev)}
                  />
                )}
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
        {/* 事件详情 + 事件时段读数（选中事件；读数只由事实点计算，预标参考分栏） */}
        {selectedEvent && selectedReading && geom && !props.rangePickMode && (() => {
          const readingData = selectedReading;
          const impact = selectedEvent.impact;
          const marker = selectedEvent.source === 'composed' ? '草稿' : selectedEvent.overridden ? '预标 · 已改' : '预标';
          const salesChangeText = readingData.salesChangePct != null
            ? signedPctText(readingData.salesChangePct)
            : '无法计算';
          const priceChangeText = readingData.priceChangePct != null
            ? ` ${signedPctText(readingData.priceChangePct)}`
            : readingData.priceAbsDiff != null
              ? ` 绝对差 $${Math.abs(Math.round(readingData.priceAbsDiff)).toLocaleString('en-US')}`
              : '';
          return (
            <div
              role="group"
              aria-label={`事件时段读数 ${eventRangeLabel(selectedEvent)} ${selectedEvent.label}`}
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
                <span style={{ color: color.mute, flex: 'none' }}>{marker}</span>
                {selectedEvent.sourceChanged && <span style={{ color: color.warningInk, flex: 'none' }}>源已更新</span>}
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
              <div style={{ marginTop: 2 }}>
                {`事件时段 ${durationOfEvent(selectedEvent)} 周 · 销量有效 ${readingData.salesCoverage} · 价格有效 ${readingData.priceCoverage}`}
              </div>
              <div style={{ marginTop: 2, whiteSpace: 'nowrap' }}>
                {`销量 期内均周销 ${readingData.salesAvg != null ? volumeShortText(readingData.salesAvg) : '—'} · 较前 ${readingData.prevRange ? readingData.prevRange[1] - readingData.prevRange[0] + 1 : '—'} 周 ${salesChangeText}${readingData.salesChangePct == null && readingData.salesChangeReason ? `（${readingData.salesChangeReason}）` : ''}`}
              </div>
              <div style={{ marginTop: 1, whiteSpace: 'nowrap' }}>
                {`价格 ${readingData.priceFirst && readingData.priceLast ? `${priceShortText(readingData.priceFirst.value)}（W${readingData.priceFirst.week + 1}）→ ${priceShortText(readingData.priceLast.value)}（W${readingData.priceLast.week + 1}）${priceChangeText}` : '—'}`}
              </div>
              <div style={{ marginTop: 1, color: color.mute, whiteSpace: 'nowrap' }}>计算 {readingData.formulaNote}</div>
              {impact && (
                <div style={{ marginTop: 1, color: color.warningInk, whiteSpace: 'nowrap' }}>
                  {`预标参考 ${impact.magnitudePct != null ? `${impact.magnitudePct > 0 ? '+' : ''}${impact.magnitudePct}%` : '—'} · ${impact.durationWeeks != null ? `${impact.durationWeeks} 周` : '—'} · ${REFERENCE_DECAY_LABEL[impact.decay]}衰减（仅预标，不参与上述计算）`}
                </div>
              )}
              {selectedEvent.note && (
                <div style={{ marginTop: 1 }}>说明 {selectedEvent.note}</div>
              )}
              <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                {props.onEditEvent && (
                  <button
                    type="button"
                    aria-label={`编辑事件 ${eventRangeLabel(selectedEvent)} ${selectedEvent.label}`}
                    onClick={() => props.onEditEvent?.(selectedEvent.id)}
                    style={{ height: 20, padding: '0 8px', borderRadius: 6, border: `1px solid ${color.hairline}`, background: color.canvas, color: color.body, font: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    编辑
                  </button>
                )}
                {props.onRestorePreset && selectedEvent.overridden && selectedEvent.sourceEventId && (
                  <button
                    type="button"
                    aria-label={`恢复预标 ${eventRangeLabel(selectedEvent)} ${selectedEvent.label}`}
                    onClick={() => props.onRestorePreset?.(selectedEvent.sourceEventId as string)}
                    style={{ height: 20, padding: '0 8px', borderRadius: 6, border: `1px solid ${color.hairline}`, background: color.canvas, color: color.body, font: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    恢复预标
                  </button>
                )}
              </div>
            </div>
          );
        })()}
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
      <WorkbenchLegend items={legendItems} hidden={new Set()} style={{ marginTop: 4 }} />
    </div>
  );
}
