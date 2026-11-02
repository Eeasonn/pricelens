import { useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import type { StripGeom } from '../../chart/PriceTrend/helpers';
import { color, font, formatPrice, radius, selectAccent } from '../../theme/tokens';
import type { MarginCostPoint } from './marginCost';
import { rangeBandFrame } from './periodSummary';
import {
  contiguousSegmentRuns,
  axisTicksOf,
  costAxisDomainOf,
  costStepPolyline,
  lastValidMarginIndex,
  marginBarWidth,
  marginCrossX,
  marginFocusIndex,
  monthStepSegmentsOf,
  signedBarBox,
  type MonthStepSegment,
} from './marginCostGeometry';

const PLOT_SVG_H = 224; // 2026-11-02 反馈：旧 168 与主图体量失衡（过于紧凑）
const PLOT_PAD_TOP = 12;
const PLOT_PAD_BOTTOM = 12;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(23, 23, 23, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function segmentsOf(points: readonly (MarginCostPoint | null)[]): MonthStepSegment[] {
  const runs: { offset: number; points: MarginCostPoint[] }[] = [];
  let current: MarginCostPoint[] = [];
  let offset = 0;
  points.forEach((point, index) => {
    if (!point) {
      if (current.length > 0) runs.push({ offset, points: current });
      current = [];
      return;
    }
    if (current.length === 0) offset = index;
    current.push(point);
  });
  if (current.length > 0) runs.push({ offset, points: current });
  return runs.flatMap((run) => monthStepSegmentsOf(run.points).map((segment) => ({
    ...segment,
    startIndex: segment.startIndex + run.offset,
  })));
}

export default function MarginCostBand(props: {
  geom: StripGeom | null;
  points: readonly (MarginCostPoint | null)[];
  currency: 'local' | 'usd';
  /** 与上方量价图同一条系列色：折线用实色，销毛柱用浅色。 */
  seriesColor: string;
  hoverIdx: number | null;
  onHover: (index: number | null) => void;
  empty?: boolean;
  /** 垂直定位线由面板统一绘制。 */
  externalCrosshair?: boolean;
  /** 面板统一的观察列（悬停列 ?? 区间末周）：传入时覆盖内部「最后有效点」回落，
   *  让成本点、销毛柱高亮与主图十字线/明细卡始终同列。 */
  focusIndex?: number | null;
  /** 与主图同一选择区间的浅蓝背景带（只铺底色，不带边线）。 */
  selectionBand?: { startIndex: number; endIndex: number } | null;
  /** 水位线模式（2026-11-02 反馈③：周粒度下月度成本/销毛整月不变，逐周柱是
   *  同值重复——改为半透明面积+销毛率线，不放柱子；月/季粒度保持柱+阶梯线）。 */
  waterline?: boolean;
  /** 粒度（首末桶标签按它格式化：周 2026W31 / 月 2026-07） */
  granularity: 'week' | 'month' | 'quarter';
  /** 与 points 对齐的展示桶 id（首末标签用；点的 bucketId 是月 id，直接显示会与
   *  主图/时间轴的桶文案不一致——2026-11-02 反馈 X 轴排版时一并修正） */
  bucketLabels: readonly string[];
}) {
  const showEmpty = props.empty || props.geom == null || lastValidMarginIndex(props.points) == null;
  const validPoints = useMemo(() => props.points.filter((point): point is MarginCostPoint => point != null), [props.points]);
  const costDomain = useMemo(
    () => costAxisDomainOf(validPoints),
    [validPoints],
  );
  // 销毛率域（2026-11-02 反馈②：固定 0–100%，30% 线落在带高的 30% 处，不再随数据自适应；
  // 柱模式与水位线共用同一比例尺。axisTicksOf 对 {0,1} 产出 100% / 50% / 0% 三档，适配 224px 带高）
  const marginDomain = useMemo(() => ({ min: 0, max: 1 }), []);
  const segments = useMemo(() => segmentsOf(props.points), [props.points]);
  const costTicks = useMemo(() => axisTicksOf(costDomain), [costDomain]);
  const marginTicks = useMemo(() => axisTicksOf(marginDomain), [marginDomain]);
  // 月 → 销毛率查表（水位形态的销毛率线用；月内恒定取首点）
  const rateByMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const p2 of validPoints) if (p2.marginRate != null && !m.has(p2.monthId)) m.set(p2.monthId, p2.marginRate);
    return m;
  }, [validPoints]);
  // 首末有效点在 points 中的位置（桶标签取展示桶 id，而非点的月 id）
  let firstValidIdx = -1;
  let lastValidIdx = -1;
  props.points.forEach((p2, i) => {
    if (p2) {
      if (firstValidIdx < 0) firstValidIdx = i;
      lastValidIdx = i;
    }
  });
  const fmtBucket = (id: string): string => {
    if (props.granularity === 'week' && /^\d{6}$/.test(id)) return `${id.slice(0, 4)}W${id.slice(4)}`;
    if (props.granularity === 'month' && /^\d{6}$/.test(id)) return `${id.slice(0, 4)}-${id.slice(4)}`;
    return id;
  };
  const firstLabel = fmtBucket(props.bucketLabels[firstValidIdx] ?? props.points[firstValidIdx]?.bucketId ?? '—');
  const lastLabel = fmtBucket(props.bucketLabels[lastValidIdx] ?? props.points[lastValidIdx]?.bucketId ?? '—');
  const focusIndex = props.focusIndex !== undefined
    ? props.focusIndex
    : marginFocusIndex(props.points.length, props.hoverIdx, lastValidMarginIndex(props.points));

  const onMove = (event: ReactMouseEvent<HTMLElement>): void => {
    const geom = props.geom;
    if (!geom || geom.n <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < geom.plotLeft || x > geom.plotLeft + geom.plotWidth) return;
    const index = Math.min(geom.n - 1, Math.max(0, Math.floor((x - geom.plotLeft) / (geom.plotWidth / geom.n))));
    props.onHover(index);
  };

  return (
    <section
      aria-label="成本与销毛（模拟）"
      onMouseMove={showEmpty ? undefined : onMove}
      onMouseLeave={showEmpty ? undefined : () => props.onHover(null)}
      style={{
        minHeight: showEmpty ? 120 : undefined,
        boxSizing: 'border-box',
        borderTop: `1px solid ${color.hairline}`,
        background: color.canvas,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        position: 'relative',
      }}
    >
      {!props.externalCrosshair && !showEmpty && focusIndex != null && props.geom && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: Math.round(marginCrossX(props.geom, focusIndex)) - 0.5,
            top: 0,
            bottom: 0,
            width: 1,
            background: color.hairlineStrong,
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px 0', fontSize: 12, lineHeight: '16px', color: color.body }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 16 }}>
          成本与销毛 · 金额/台
          <span style={{ padding: '1px 6px', borderRadius: radius.pill, background: color.canvasSoft2, color: color.body, fontSize: 11, lineHeight: '14px', whiteSpace: 'nowrap' }}>模拟</span>
        </span>
        {!showEmpty && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: color.mute, fontSize: 10, flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {props.waterline
                ? <span aria-hidden style={{ width: 12, height: 8, borderRadius: 2, background: hexToRgba(props.seriesColor, 0.16), boxShadow: `inset 0 0 0 1px ${hexToRgba(props.seriesColor, 0.8)}` }} />
                : <span aria-hidden style={{ width: 14, height: 2, background: props.seriesColor }} />}
              成本
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span aria-hidden style={{ width: 14, height: 1.5, background: props.seriesColor }} />
              销毛率
            </span>
          </span>
        )}
      </div>
      {showEmpty ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: color.mute, fontSize: 12 }}>
          暂无成本 / 销毛数据
        </div>
      ) : (
        <>
          <svg
            role="img"
            aria-label={props.waterline ? "成本面积与销毛线" : "成本阶梯线与销毛独立柱"}
            width="100%"
            height={PLOT_SVG_H}
            style={{ display: 'block' }}
          >
            {props.geom && (() => {
              const plotTop = PLOT_PAD_TOP;
              const plotHeight = PLOT_SVG_H - PLOT_PAD_TOP - PLOT_PAD_BOTTOM;
              const plotRight = props.geom.plotLeft + props.geom.plotWidth;
              const yAt = (value: number, axis: 'cost' | 'margin'): number => {
                const domain = axis === 'cost' ? costDomain : marginDomain;
                const span = Math.max(1e-9, domain.max - domain.min);
                return plotTop + (1 - (value - domain.min) / span) * plotHeight;
              };
              const zeroMarginY = yAt(0, 'margin');
              const slot = props.geom.plotWidth / Math.max(1, props.geom.n);
              const barWidth = marginBarWidth(slot);
              const runs = contiguousSegmentRuns(segments).map((run) => costStepPolyline(run, slot, props.geom!.plotLeft));
              const crossX = focusIndex == null ? null : marginCrossX(props.geom, focusIndex);
              const focusPoint = focusIndex == null ? null : props.points[focusIndex] ?? null;
              const selBand = props.selectionBand
                ? rangeBandFrame(props.geom.plotLeft, props.geom.plotWidth, props.geom.n, props.selectionBand.startIndex, props.selectionBand.endIndex)
                : null;
              return (
                <>
                  {selBand && (
                    <rect x={selBand.x} y={plotTop} width={selBand.width} height={plotHeight} fill={selectAccent} fillOpacity={0.05} />
                  )}
                  <line x1={props.geom!.plotLeft} x2={props.geom!.plotLeft} y1={plotTop} y2={plotTop + plotHeight} stroke={color.hairline} strokeWidth={1} />
                  <line x1={plotRight} x2={plotRight} y1={plotTop} y2={plotTop + plotHeight} stroke={color.hairline} strokeWidth={1} />
                  {costTicks.map((tick) => {
                    const y = yAt(tick, 'cost');
                    const zeroTick = Math.abs(tick) < 1e-6;
                    return (
                      <g key={`cost-tick-${tick}`}>
                        <line
                          x1={props.geom!.plotLeft}
                          x2={plotRight}
                          y1={y}
                          y2={y}
                          stroke={color.hairline}
                          strokeWidth={1}
                        />
                        <line x1={props.geom!.plotLeft - 4} x2={props.geom!.plotLeft} y1={y} y2={y} stroke={color.hairlineStrong} strokeWidth={1} />
                        <text
                          x={props.geom!.plotLeft - 8}
                          y={y}
                          fill={color.mute}
                          fontSize={10}
                          fontFamily={font.family}
                          dominantBaseline="middle"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatPrice(Math.round(tick), props.currency)}
                        </text>
                      </g>
                    );
                  })}
                  {marginTicks.map((tick) => {
                    const y = yAt(tick, 'margin');
                    return (
                      <g key={`margin-tick-${tick}`}>
                        <line x1={plotRight} x2={plotRight + 4} y1={y} y2={y} stroke={color.hairlineStrong} strokeWidth={1} />
                        <text x={plotRight + 8} y={y} fill={color.mute} fontSize={10} fontFamily={font.family} dominantBaseline="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {Math.round(tick * 100)}%
                        </text>
                      </g>
                    );
                  })}
                  {/* 两侧轴名已删（2026-11-02 Eason：图上不要解释性用语；带头图例已标成本/销毛率） */}
                  {/* 独立时间轴：与主图共享桶顺序和观察列，但不借用主图的轴线。 */}
                  <line x1={props.geom!.plotLeft} x2={plotRight} y1={plotTop + plotHeight} y2={plotTop + plotHeight} stroke={color.hairlineStrong} strokeWidth={1} />
                  {(() => {
                    const first = validPoints[0];
                    const last = validPoints[validPoints.length - 1];
                    const firstX = props.geom!.plotLeft + slot * 0.5;
                    const lastX = props.geom!.plotLeft + slot * (props.geom!.n - 0.5);
                    return (
                      <>
                        <line x1={firstX} x2={firstX} y1={plotTop + plotHeight} y2={plotTop + plotHeight + 4} stroke={color.hairlineStrong} />
                        <line x1={lastX} x2={lastX} y1={plotTop + plotHeight} y2={plotTop + plotHeight + 4} stroke={color.hairlineStrong} />
                        <text x={firstX} y={PLOT_SVG_H - 3} textAnchor="start" fill={color.body} fontSize={13} fontFamily={font.family}>{firstLabel}</text>
                        <text x={lastX} y={PLOT_SVG_H - 3} textAnchor="end" fill={color.body} fontSize={13} fontFamily={font.family}>{lastLabel}</text>
                      </>
                    );
                  })()}
                  {props.waterline ? (
                    // 水位模式（周粒度）：成本 = 纯半透明面积（无上缘描线）；
                    // 销毛率 = 细阶梯虚线（2026-11-02 反馈①：段内水平、段间垂直跳变，
                    // 1.25px，比价格线 2px 细一档，右轴 % 刻度）。无柱。
                    (() => {
                      const baseline = plotTop + plotHeight;
                      const stepPath = segments.map((seg, i) => {
                        const x1 = props.geom!.plotLeft + seg.startIndex * slot;
                        const x2 = props.geom!.plotLeft + (seg.startIndex + seg.count) * slot;
                        const yCost = yAt(seg.unitCost, 'cost');
                        const rate = rateByMonth.get(seg.monthId) ?? 0;
                        const yRate = yAt(rate, 'margin');
                        const head = i === 0 ? `M${x1} ${yCost}` : `L${x1} ${yCost}`;
                        // 阶梯线：每段从自身率高 yRate 起笔（首段 M / 后续 L——x1 与上一段
                        // x2 重合，故 L x1 yRate 即为垂直跳变），再水平走到 x2。
                        const rateHead = i === 0 ? `M${x1} ${yRate}` : `L${x1} ${yRate}`;
                        return { head: `${head} L${x2} ${yCost}`, rate: `${rateHead} L${x2} ${yRate}` };
                      });
                      const marginLine = stepPath.map((p) => p.rate).join(' ');
                      const first = segments[0];
                      const last = segments[segments.length - 1];
                      const areaTop = stepPath.map((p) => p.head).join(' ');
                      const areaPath = `${areaTop} L${props.geom!.plotLeft + (last.startIndex + last.count) * slot} ${baseline} L${props.geom!.plotLeft + first.startIndex * slot} ${baseline} Z`;
                      return (
                        <g>
                          <path d={areaPath} fill={hexToRgba(props.seriesColor, 0.16)} />
                          <path d={marginLine} fill="none" stroke={props.seriesColor} strokeWidth={1.25} strokeDasharray="4 3" />
                        </g>
                      );
                    })()
                  ) : (
                    <>
                      {props.points.map((point, index) => {
                        if (point == null || point.marginRate == null) return null;
                        const box = signedBarBox(point.marginRate, (value) => yAt(value, 'margin'), zeroMarginY);
                        if (box.height < 0.5) return null;
                        const cx = props.geom!.plotLeft + slot * (index + 0.5);
                        return (
                          <rect
                            key={`margin-${index}`}
                            x={cx - barWidth / 2}
                            y={box.y}
                            width={barWidth}
                            height={box.height}
                            rx={1}
                            fill={hexToRgba(props.seriesColor, index === focusIndex ? 0.55 : 0.28)}
                          />
                        );
                      })}
                      {runs.map((run, runIndex) => (
                        <polyline
                          key={`cost-${runIndex}`}
                          points={run.map((vertex) => `${vertex.x},${yAt(vertex.cost, 'cost')}`).join(' ')}
                          fill="none"
                          stroke={props.seriesColor}
                          strokeWidth={2}
                        />
                      ))}
                    </>
                  )}
                  {focusPoint && crossX != null && (
                    <circle cx={crossX} cy={yAt(focusPoint.unitCost, 'cost')} r={3.5} fill={color.canvas} stroke={props.seriesColor} strokeWidth={1.5} />
                  )}
                </>
              );
            })()}
          </svg>
        </>
      )}
    </section>
  );
}
