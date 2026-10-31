import { useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import type { StripGeom } from '../../chart/PriceTrend/helpers';
import { color, font, formatPrice } from '../../theme/tokens';
import type { MarginCostPoint } from './marginCost';
import {
  contiguousSegmentRuns,
  costStepPolyline,
  lastValidMarginIndex,
  marginAxisTicks,
  marginBarWidth,
  marginColumnMarks,
  marginCostDomainOf,
  marginCrossX,
  marginFocusIndex,
  marginReadoutIndex,
  monthStepSegmentsOf,
  signedBarBox,
  type MonthStepSegment,
} from './marginCostGeometry';

const PLOT_SVG_H = 168;
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

function monthLabel(monthId: string): string {
  const match = /^(\d{4})(\d{2})$/.exec(monthId);
  if (!match) return monthId;
  return `${match[1]}年${Number(match[2])}月`;
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
}) {
  const showEmpty = props.empty || props.geom == null || lastValidMarginIndex(props.points) == null;
  const domain = useMemo(
    () => marginCostDomainOf(props.points.filter((point): point is MarginCostPoint => point != null)),
    [props.points],
  );
  const segments = useMemo(() => segmentsOf(props.points), [props.points]);
  const columns = useMemo(() => marginColumnMarks(props.points), [props.points]);
  const ticks = useMemo(() => marginAxisTicks(domain), [domain]);
  const readoutIndex = marginReadoutIndex(props.points, props.hoverIdx);
  const readout = readoutIndex == null ? null : props.points[readoutIndex] ?? null;
  const focusIndex = marginFocusIndex(props.points.length, props.hoverIdx, lastValidMarginIndex(props.points));

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
      {!showEmpty && focusIndex != null && props.geom && (
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
        <span>成本与销毛（模拟） · 金额/台</span>
        {!showEmpty && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: color.mute, fontSize: 10, flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span aria-hidden style={{ width: 14, height: 2, background: props.seriesColor }} />
              成本
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 1, background: hexToRgba(props.seriesColor, 0.28) }} />
              销毛
            </span>
          </span>
        )}
      </div>
      {showEmpty ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: color.mute, fontSize: 12 }}>
          可显示，当前无数据
        </div>
      ) : (
        <>
          <div className="tnum" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, padding: '2px 8px 0', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontSize: 11, lineHeight: '16px', color: color.body }}>
            {readout ? (
              <>
                <span>{monthLabel(readout.monthId)}</span>
                <span>成本 {formatPrice(Math.round(readout.unitCost), props.currency)}</span>
                <span>单台销毛 {formatPrice(Math.round(readout.unitMargin), props.currency)}</span>
                <span>销毛率 {(readout.marginRate * 100).toFixed(1)}%</span>
              </>
            ) : (
              <span style={{ color: color.mute }}>—</span>
            )}
          </div>
          <svg
            role="img"
            aria-label="成本阶梯线与销毛独立柱"
            width="100%"
            height={PLOT_SVG_H}
            style={{ display: 'block' }}
          >
            {props.geom && (() => {
              const plotTop = PLOT_PAD_TOP;
              const plotHeight = PLOT_SVG_H - PLOT_PAD_TOP - PLOT_PAD_BOTTOM;
              const plotRight = props.geom.plotLeft + props.geom.plotWidth;
              const yAt = (value: number): number => {
                const span = Math.max(1e-9, domain.max - domain.min);
                return plotTop + (1 - (value - domain.min) / span) * plotHeight;
              };
              const zeroY = yAt(0);
              const slot = props.geom.plotWidth / Math.max(1, props.geom.n);
              const barWidth = marginBarWidth(slot);
              const runs = contiguousSegmentRuns(segments).map((run) => costStepPolyline(run, slot, props.geom!.plotLeft));
              const crossX = focusIndex == null ? null : marginCrossX(props.geom, focusIndex);
              const focusPoint = focusIndex == null ? null : props.points[focusIndex] ?? null;
              const negative = domain.min < 0;
              return (
                <>
                  <line x1={plotRight} x2={plotRight} y1={plotTop} y2={plotTop + plotHeight} stroke={color.hairline} strokeWidth={1} />
                  {ticks.map((tick) => {
                    const y = yAt(tick);
                    const zeroTick = Math.abs(tick) < 1e-6;
                    return (
                      <g key={tick}>
                        <line
                          x1={props.geom!.plotLeft}
                          x2={plotRight}
                          y1={y}
                          y2={y}
                          stroke={zeroTick && negative ? color.ink : color.hairline}
                          strokeWidth={zeroTick && negative ? 1.25 : 1}
                        />
                        <line x1={plotRight} x2={plotRight + 4} y1={y} y2={y} stroke={color.hairlineStrong} strokeWidth={1} />
                        <text
                          x={plotRight + 8}
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
                  {columns.map((column) => {
                    const box = signedBarBox(column.unitMargin, yAt, zeroY);
                    if (box.height < 0.5) return null;
                    const cx = props.geom!.plotLeft + slot * (column.index + 0.5);
                    return (
                      <rect
                        key={`margin-${column.index}`}
                        x={cx - barWidth / 2}
                        y={box.y}
                        width={barWidth}
                        height={box.height}
                        rx={1}
                        fill={hexToRgba(props.seriesColor, column.index === focusIndex ? 0.55 : 0.28)}
                      />
                    );
                  })}
                  {runs.map((run, runIndex) => (
                    <polyline
                      key={`cost-${runIndex}`}
                      points={run.map((vertex) => `${vertex.x},${yAt(vertex.cost)}`).join(' ')}
                      fill="none"
                      stroke={props.seriesColor}
                      strokeWidth={2}
                    />
                  ))}
                  {focusPoint && crossX != null && (
                    <circle cx={crossX} cy={yAt(focusPoint.unitCost)} r={3.5} fill={color.canvas} stroke={props.seriesColor} strokeWidth={1.5} />
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
