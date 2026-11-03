// ============================================================
// 推演工作台 v2 · 量价参考卡 · 全生命周期量价图（A1 参考卡重构）：
// 样式与量价走势页（&p=volume）同语言——量柱直接复用 volume/VolumeBars
// （values/geom/vMax/hoverIdx/axisLimits + 选区带），价格线同系列色实线
// （左轴 $ 刻度）+ 大促档期琥珀带（主图同款 warningSoft）+ 事件锚
// （上市蓝 / 促销琥珀 / 挤兑墨，与主图小事件同源色系）+ 图上拖选区间
// 读数（价 / 量变化，语言对齐 SpreadRangeCard）+ 底部简版时间窗滑条
// （两端拖柄 + 整段平移 + 键盘微调，全周期 ↔ 窗口缩放平移）。
// 缺数纪律：缺采周不造 0——柱不画、实线断开、跨缺灰虚桥接、读数「—」。
// 布局照 volume/CostBarChart 范式：ResizeObserver 量宽 → 全部按像素定位，
// 指针承接层直接复用 volume/PointerShield（悬停列 / 拖选区间）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import PointerShield from '../volume/PointerShield';
import VolumeBars from '../volume/VolumeBars';
import { vMaxOf } from '../volume/volumeAxis';
import { brandColorOf, color, font, trackColors } from '../../theme/tokens';
import type { LifecycleEventSeed, LifecycleProductSeed } from './workbenchFixture';
import { WorkbenchLegend, type LegendItem } from './WorkbenchBits';

const GRID_L = 44;
const GRID_R = 74;
const PLOT_TOP = 16;
const PLOT_H = 150;
const LABEL_H = 18;
const TRACK_H = 44;
const MIN_WINDOW = 8;
const FOCUS_SPAN = 16;

/** 事件锚色（与主图小事件 / 参考卡事实锚同源：上市蓝 / 促销琥珀 / 挤兑墨）。 */
const EVENT_TONE: Record<LifecycleEventSeed['type'], string> = {
  'competitor-launch': color.link,
  'own-launch': color.link,
  promo: color.warning,
  cannibalization: color.ink,
};

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

const signedPctText = (pct: number): string =>
  `${pct > 0.05 ? '+' : pct < -0.05 ? '−' : '±'}${Math.abs(pct).toFixed(1)}%`;

export default function ReferenceVolumeChart(props: {
  product: LifecycleProductSeed;
  /** 聚焦定位（生命周期周序 0 基）；配合 focusKey 触发窗口平移 + 悬停该周（智能弹框联动）。 */
  focusWeek?: number | null;
  focusKey?: number;
}) {
  const { product } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: 'start' | 'end' | 'pan'; grabS: number; grabE: number; grabIdx: number } | null>(null);
  const [width, setWidth] = useState(0);
  const [win, setWin] = useState<[number, number]>([0, Math.max(0, product.points.length - 1)]);
  const [hover, setHover] = useState<number | null>(null);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const [brushLive, setBrushLive] = useState<[number, number] | null>(null);
  const [axisLimits, setAxisLimits] = useState<{ max: number | null }>({ max: null });
  const [trackDragging, setTrackDragging] = useState(false);

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
  // 切换参照产品：窗口复位全周期，选区 / 悬停 / 轴限位随失义清除
  const productId = product.id;
  useEffect(() => {
    setWin([0, Math.max(0, total - 1)]);
    setBrush(null);
    setBrushLive(null);
    setHover(null);
    setAxisLimits({ max: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);
  // 聚焦定位（智能弹框「定位到对应事件周」）：窗口移到事件附近并悬停该周
  const focusKey = props.focusKey ?? 0;
  useEffect(() => {
    if (focusKey === 0 || props.focusWeek == null) return;
    const w = Math.min(total - 1, Math.max(0, props.focusWeek));
    const span = Math.min(FOCUS_SPAN, total);
    let s = Math.max(0, w - 6);
    let e = Math.min(total - 1, s + span - 1);
    s = Math.max(0, e - span + 1);
    setWin([s, e]);
    setBrush(null);
    setBrushLive(null);
    setHover(w - s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  const s = win[0];
  const e = Math.min(total - 1, Math.max(win[0], win[1]));
  const values = useMemo(() => product.points.slice(s, e + 1), [product, s, e]);
  const prices = useMemo(() => product.pricePoints.slice(s, e + 1), [product, s, e]);
  const n = values.length;
  const vMax = useMemo(() => vMaxOf(values), [values]);

  const plotWidth = width > 0 ? width - GRID_L - GRID_R : 0;
  const geom = width >= 160 && n > 0 && plotWidth > 0 ? { plotLeft: GRID_L, plotWidth, n } : null;
  const plotBottom = PLOT_TOP + PLOT_H;
  const colW = n > 0 ? plotWidth / n : 0;
  const xAt = (i: number): number => GRID_L + colW * (i + 0.5);

  // 价格刻度（左轴）：窗口内价格 min/max 加 18% 余量，上 / 中 / 下三刻度
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

  const eventsIn = useMemo(() => product.events
    .filter((ev) => ev.week >= s && ev.week <= e)
    .map((ev) => ({ ...ev, index: ev.week - s })), [product, s, e]);

  const activeBrush = brushLive ?? brush;
  const brushLo = activeBrush ? Math.min(activeBrush[0], activeBrush[1]) : 0;
  const brushHi = activeBrush ? Math.max(activeBrush[0], activeBrush[1]) : 0;

  // 区间读数：价 = 端点价变化（$a → $b + %）；量 = 端点周销变化（台 + %）；
  // 端点缺采回退区间内最近有值点，无有值点显示「—」（缺数不造 0）。
  const reading = useMemo(() => {
    if (activeBrush == null) return null;
    const firstValid = (list: Array<number | null>): number | null => {
      for (let i = brushLo; i <= brushHi; i++) if (list[i] != null && Number.isFinite(list[i] as number)) return list[i] as number;
      return null;
    };
    const lastValid = (list: Array<number | null>): number | null => {
      for (let i = brushHi; i >= brushLo; i--) if (list[i] != null && Number.isFinite(list[i] as number)) return list[i] as number;
      return null;
    };
    const pairText = (a: number | null, b: number | null, fmt: (v: number) => string): string => {
      if (a == null || b == null) return '—';
      const pct = ((b / Math.max(1e-6, a)) - 1) * 100;
      return `${signedPctText(pct)}（${fmt(a)} → ${fmt(b)}）`;
    };
    return {
      weeks: brushHi - brushLo + 1,
      absStart: s + brushLo,
      absEnd: s + brushHi,
      priceText: pairText(firstValid(prices), lastValid(prices), (v) => `$${Math.round(v).toLocaleString('en-US')}`),
      volumeText: pairText(firstValid(values), lastValid(values), (v) => `${(v / 1000).toFixed(1)}K 台`),
    };
  }, [activeBrush, brushLo, brushHi, prices, values, s]);

  const seriesColor = brandColorOf(product.brand);
  const missingWeeks = values
    .map((v, i) => (v == null ? `W${s + i + 1}` : ''))
    .filter(Boolean);
  const legendItems: LegendItem[] = [
    { label: '周销（量柱）', shape: 'rect', color: seriesColor },
    { label: '价格（线 · 左轴 $）', shape: 'line', color: seriesColor },
    { label: '档期带（琥珀）', shape: 'rectAmber', color: color.warning },
    { label: '事件锚（上市蓝 / 促销琥珀 / 挤兑墨）', shape: 'marker', color: color.link },
  ];
  const labelStep = Math.max(1, Math.ceil(n / 6));

  // ---- 时间窗滑条（简版 PanelTimeTrack）：两端拖柄 + 整段平移 + 键盘微调 ----
  const clampWindow = (next: [number, number]): [number, number] => {
    let cs = Math.min(total - 1, Math.max(0, Math.round(next[0])));
    let ce = Math.min(total - 1, Math.max(0, Math.round(next[1])));
    if (cs > ce) [cs, ce] = [ce, cs];
    if (ce - cs < MIN_WINDOW - 1) {
      ce = Math.min(total - 1, cs + MIN_WINDOW - 1);
      cs = Math.max(0, ce - (MIN_WINDOW - 1));
    }
    return [cs, ce];
  };
  const applyWindow = (next: [number, number]): void => {
    setWin(clampWindow(next));
    // 窗口平移 / 缩放后选区下标失义，自动清除（与量价页同口径）
    setBrush(null);
    setBrushLive(null);
  };
  const idxFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || plotWidth <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - GRID_L) / plotWidth));
    return Math.round(ratio * (total - 1));
  };
  const onHandleDown = (kind: 'start' | 'end' | 'pan') => (event: ReactPointerEvent<HTMLElement>): void => {
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    dragRef.current = { kind, grabS: win[0], grabE: win[1], grabIdx: idxFromClientX(event.clientX) };
    setTrackDragging(true);
  };
  const onTrackMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const idx = idxFromClientX(event.clientX);
    if (drag.kind === 'start') applyWindow([idx, drag.grabE]);
    else if (drag.kind === 'end') applyWindow([drag.grabS, idx]);
    else {
      const len = drag.grabE - drag.grabS;
      const cs = Math.min(Math.max(0, idx - (drag.grabIdx - drag.grabS)), total - 1 - len);
      applyWindow([cs, cs + len]);
    }
  };
  const endTrackDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setTrackDragging(false);
    const el = event.currentTarget;
    if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }
  };
  const nudgeWindow = (kind: 'start' | 'end', delta: number): void => {
    setWin((prev) => {
      if (kind === 'start') return clampWindow([prev[0] + delta, prev[1]]);
      return clampWindow([prev[0], prev[1] + delta]);
    });
    setBrush(null);
    setBrushLive(null);
  };
  const pctAt = (index: number): number => (index / Math.max(1, total - 1)) * 100;

  if (total === 0) {
    return <div role="status" style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>;
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div ref={wrapRef} style={{ position: 'relative', height: plotBottom + LABEL_H + 4 }}>
        {/* 底层：档期琥珀带 + 价格轴刻度 + 悬停参考线 + X 周标签 */}
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
              x={GRID_L - 6}
              y={y$(v) + 3}
              fontSize={10}
              fill={color.mute}
              textAnchor="end"
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
        {/* 量柱层（volume/VolumeBars 直接复用：柱色 / 选区带 / 右轴 / 上限编辑） */}
        {geom && (
          <VolumeBars
            geom={geom}
            plotTop={PLOT_TOP}
            plotHeight={PLOT_H}
            values={values}
            vMax={vMax}
            color={seriesColor}
            hoverIdx={hover}
            axisLimits={axisLimits}
            onAxisLimit={(_kind, value) => setAxisLimits({ max: value })}
            selectionBand={activeBrush ? { startIndex: brushLo, endIndex: brushHi } : null}
          />
        )}
        {/* 价格线 + 事件锚层 */}
        <svg
          role="img"
          aria-label={`${product.label} 全生命周期量价图（上市 ${product.launchWeekLabel} 起 ${total} 周）：量柱为周销、实线为价格；琥珀带为大促档期；锚点为事件（上市蓝 / 促销琥珀 / 挤兑墨）。图上拖选区间读价量变化。`}
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
          {eventsIn.map((ev) => {
            const cx = xAt(ev.index);
            const tone = EVENT_TONE[ev.type];
            return (
              <g key={`${ev.type}-${ev.week}`}>
                <line x1={cx} y1={PLOT_TOP} x2={cx} y2={plotBottom} stroke={tone} strokeDasharray="3 4" opacity={0.5} />
                <rect x={cx - 5} y={PLOT_TOP + 2} width={10} height={10} rx={2} fill={color.canvas} stroke={tone} strokeWidth={1.3}>
                  <title>{`${ev.label}（W${ev.week + 1}${ev.impactPct != null && ev.impactWeeks != null ? ` · 参考 ${signedPctText(ev.impactPct)}×${ev.impactWeeks} 周` : ''}）`}</title>
                </rect>
              </g>
            );
          })}
          {hover != null && prices[hover] != null && (
            <circle cx={xAt(hover)} cy={y$(prices[hover] as number)} r={3.5} fill={color.canvas} stroke={seriesColor} strokeWidth={1.5} />
          )}
        </svg>
        {/* 区间读数胶囊卡（SpreadRangeCard 语言：标题行 + 价 / 量行） */}
        {reading && geom && (
          <div
            role="group"
            aria-label={`区间读数 W${reading.absStart + 1}–W${reading.absEnd + 1}：价 ${reading.priceText}，量 ${reading.volumeText}`}
            className="tnum"
            style={{
              position: 'absolute',
              left: GRID_L + 4,
              top: PLOT_TOP + 18,
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
        {/* 指针承接层（volume/PointerShield 直接复用）：悬停列 / 拖选区间 */}
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
                setBrush(range);
                setBrushLive(null);
              } else {
                setBrushLive(range);
              }
            }}
            onCrossY={() => {}}
          />
        )}
      </div>
      {/* 时间窗滑条：全周期 ↔ 窗口缩放平移（两端拖柄 + 整段平移 + ←/→ 键盘微调） */}
      <div ref={trackRef} style={{ position: 'relative', height: TRACK_H, marginTop: 4, minWidth: 0 }}
        onPointerMove={onTrackMove}
        onPointerUp={endTrackDrag}
        onPointerCancel={endTrackDrag}
      >
        <div aria-hidden style={{ position: 'absolute', left: GRID_L, width: Math.max(0, plotWidth), top: 13, height: 6, borderRadius: 3, background: trackColors.rail }} />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: GRID_L + (pctAt(win[0]) / 100) * Math.max(0, plotWidth),
            width: Math.max(0, ((pctAt(win[1]) - pctAt(win[0])) / 100) * Math.max(0, plotWidth)),
            top: 13,
            height: 6,
            borderRadius: 3,
            background: trackDragging ? trackColors.fillStrong : trackColors.fill,
          }}
        />
        {(['start', 'end'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-label={`时间窗${kind === 'start' ? '起点' : '终点'}拖柄（当前 W${(kind === 'start' ? win[0] : win[1]) + 1}，←/→ 微调）`}
            title="拖动调整查看窗口；←/→ 键微调（Shift ×4）"
            onPointerDown={onHandleDown(kind)}
            onPointerMove={onTrackMove}
            onPointerUp={endTrackDrag}
            onPointerCancel={endTrackDrag}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 4 : 1);
                nudgeWindow(kind, delta);
              }
            }}
            style={{
              position: 'absolute',
              left: GRID_L + ((pctAt(kind === 'start' ? win[0] : win[1]) / 100) * Math.max(0, plotWidth)) - 5,
              top: 7,
              width: 10,
              height: 18,
              padding: 0,
              border: 'none',
              borderRadius: 3,
              background: trackColors.handle,
              cursor: 'ew-resize',
              touchAction: 'none',
            }}
          />
        ))}
        <span className="tnum" style={{ position: 'absolute', left: GRID_L, top: 26, fontSize: 10, color: color.mute, fontVariantNumeric: 'tabular-nums' }}>W{win[0] + 1}</span>
        <span className="tnum" style={{ position: 'absolute', left: GRID_L + Math.max(0, plotWidth), top: 26, transform: 'translateX(-100%)', fontSize: 10, color: color.mute, fontVariantNumeric: 'tabular-nums' }}>W{win[1] + 1}</span>
        <span className="tnum" style={{ position: 'absolute', left: GRID_L + Math.max(0, plotWidth) / 2, top: 26, transform: 'translateX(-50%)', fontSize: 10, color: color.mute, fontVariantNumeric: 'tabular-nums', maxWidth: Math.max(0, plotWidth - 56), overflow: 'hidden', whiteSpace: 'nowrap' }}>
          查看 {win[1] - win[0] + 1}/{total} 周
        </span>
      </div>
      {missingWeeks.length > 0 && (
        <div style={{ marginTop: 2, fontSize: 10.5, color: color.mute }}>缺数周 {missingWeeks.join('、')} 显示「—」，不计 0</div>
      )}
      <WorkbenchLegend items={legendItems} hidden={new Set()} style={{ marginTop: 4 }} />
    </div>
  );
}
