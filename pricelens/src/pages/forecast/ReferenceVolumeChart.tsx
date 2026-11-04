// ============================================================
// 推演工作台 v2 · 量价参考卡 · 全生命周期量价图（A5 参考卡二轮重构）：
// 与量价走势页（&p=volume）面板完全同语言——量柱直接复用 volume/VolumeBars
// （values/geom/vMax/hoverIdx/axisLimits + 选区带），价格线同系列色实线
// + 大促档期琥珀带（主图同款 warningSoft）+ 事件锚（预标 + 补录：上市蓝 /
// 促销琥珀 / 挤兑墨，与主图小事件同源色系）+ 图上拖选区间读数（价 / 量变化，
// 语言对齐 SpreadRangeCard）。Y 轴双轴刻度常显（左量右价），0 为量轴基线。
// 缺数纪律：缺采周不造 0——柱不画、实线断开、跨缺灰虚桥接、读数「—」。
// 布局照 volume/CostBarChart 范式：ResizeObserver 量宽 → 全部按像素定位，
// 指针承接层直接复用 volume/PointerShield（悬停列 / 拖选区间 / 补录点选）。
// A5 变化：①查看窗口受控（面板区底部共享时间轨统一驱动，本图不再自带滑条）；
// ②补录锚（ReferenceEventComposer 提交的会话草稿）与预标锚同语言上图；
// ③补录点选模式：pickMode 下点击图上某周回调 onPickWeek（选区带被抑制）。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import PointerShield from '../volume/PointerShield';
import VolumeBars from '../volume/VolumeBars';
import { vMaxOf } from '../volume/volumeAxis';
import { brandColorOf, color, font } from '../../theme/tokens';
import type { LifecycleProductSeed } from './workbenchFixture';
import { WorkbenchLegend, type LegendItem } from './WorkbenchBits';
import { REFERENCE_EVENT_TONES, referenceEventTypeLabel, type ReferenceComposedEvent } from './ReferenceEventComposer';

const GRID_L = 44;
const GRID_R = 74;
const PLOT_TOP = 16;
const PLOT_H = 150;
const LABEL_H = 18;
const FOCUS_SPAN = 16;

const signedPctText = (pct: number): string =>
  `${pct > 0.05 ? '+' : pct < -0.05 ? '−' : '±'}${Math.abs(pct).toFixed(1)}%`;

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

export default function ReferenceVolumeChart(props: {
  product: LifecycleProductSeed;
  /** 查看窗口（生命周期周序，受控）：由面板区共享时间轨统一驱动，全部面板联动。 */
  win: [number, number];
  /** 聚焦定位（生命周期周序 0 基）；配合 focusKey 触发悬停该周（智能弹框联动）。 */
  focusWeek?: number | null;
  focusKey?: number;
  /** 历史补录锚（会话草稿）：与预标锚同语言上图。 */
  composedEvents?: ReferenceComposedEvent[];
  /** 补录点选模式：点击图上某周完成补录（选区带被抑制）。 */
  pickMode?: boolean;
  /** 点选回调（生命周期周序 0 基；松手列 = 所选周）。 */
  onPickWeek?: (week: number) => void;
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
  // 切换参照产品：选区 / 悬停 / 轴限位随失义清除（窗口归共享时间轨管，不动）
  const productId = product.id;
  useEffect(() => {
    setBrush(null);
    setBrushLive(null);
    setHover(null);
    setAxisLimits({ max: null });
  }, [productId]);
  // 聚焦定位（智能弹框「定位到对应事件周」）：窗口已由父层移到事件附近，这里悬停该周
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
  // 共享窗口平移 / 缩放 → 窗口内选区下标失义，自动清除（与量价页同口径）
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

  // 事件锚 = 预标（fixture）+ 补录（会话草稿），同语言上图
  const composed = props.composedEvents ?? [];
  const eventsIn = useMemo(() => {
    const preset = product.events
      .filter((ev) => ev.week >= s && ev.week <= e)
      .map((ev) => ({
        key: `preset-${ev.type}-${ev.week}`,
        week: ev.week,
        index: ev.week - s,
        tone: REFERENCE_EVENT_TONES[ev.type],
        title: `${ev.label}（W${ev.week + 1}${ev.impactPct != null && ev.impactWeeks != null ? ` · 参考 ${signedPctText(ev.impactPct)}×${ev.impactWeeks} 周` : ''}）`,
      }));
    const custom = composed
      .filter((ev) => ev.week >= s && ev.week <= e)
      .map((ev) => ({
        key: `composed-${ev.id}`,
        week: ev.week,
        index: ev.week - s,
        tone: REFERENCE_EVENT_TONES[ev.type],
        title: `补录 · ${referenceEventTypeLabel(ev.type)}（W${ev.week + 1}）：${ev.note}`,
      }));
    return [...preset, ...custom];
  }, [product, s, e, composed]);

  const activeBrush = props.pickMode ? null : (brushLive ?? brush);
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
    { label: '价格（线 · 右轴 $）', shape: 'line', color: seriesColor },
    { label: '档期带（琥珀）', shape: 'rectAmber', color: color.warning },
    { label: '事件锚（预标 / 补录）', shape: 'marker', color: color.link },
  ];
  const labelStep = Math.max(1, Math.ceil(n / 6));

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
        {/* 价格线 + 事件锚层（预标 + 补录同语言：虚线 + 方形锚，type 色） */}
        <svg
          role="img"
          aria-label={`${product.label} 全生命周期量价图（上市 ${product.launchWeekLabel} 起 ${total} 周）：量柱为周销（左轴）、实线为价格（右轴 $）；琥珀带为大促档期；锚点为事件（预标与补录同语言）。图上拖选区间读价量变化${props.pickMode ? '；当前为补录点选模式，点击某周完成补录' : ''}。`}
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
          {eventsIn.map((ev) => (
            <g key={ev.key}>
              <line x1={xAt(ev.index)} y1={PLOT_TOP} x2={xAt(ev.index)} y2={plotBottom} stroke={ev.tone} strokeDasharray="3 4" opacity={0.5} />
              <rect x={xAt(ev.index) - 5} y={PLOT_TOP + 2} width={10} height={10} rx={2} fill={color.canvas} stroke={ev.tone} strokeWidth={1.3}>
                <title>{ev.title}</title>
              </rect>
            </g>
          ))}
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
        {/* 指针承接层（volume/PointerShield 直接复用）：悬停列 / 拖选区间 / 补录点选 */}
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
              // 补录点选模式：松手列 = 所选周，选区带抑制（不进入读数态）
              if (props.pickMode) {
                if (committing && range) props.onPickWeek?.(s + range[1]);
                return;
              }
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
      {missingWeeks.length > 0 && (
        <div style={{ marginTop: 2, fontSize: 10.5, color: color.mute }}>缺数周 {missingWeeks.join('、')} 显示「—」，不计 0</div>
      )}
      <WorkbenchLegend items={legendItems} hidden={new Set()} style={{ marginTop: 4 }} />
    </div>
  );
}
