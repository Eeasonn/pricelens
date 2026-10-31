import { useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import type { StripGeom } from '../../chart/PriceTrend/helpers';
import { color, font, formatPrice } from '../../theme/tokens';
import type { MarginCostPoint } from './marginCost';
import { marginCostDomainOf, monthStepSegmentsOf, type MonthStepSegment } from './marginCostGeometry';

export const MARGIN_COST_BAND_HEIGHT = 144;

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
  hoverIdx: number | null;
  onHover: (index: number | null) => void;
  empty?: boolean;
}) {
  const showEmpty = props.empty || props.geom == null;
  const domain = useMemo(
    () => marginCostDomainOf(props.points.filter((point): point is MarginCostPoint => point != null)),
    [props.points],
  );
  const segments = useMemo(() => segmentsOf(props.points), [props.points]);
  const hover = props.hoverIdx != null ? props.points[props.hoverIdx] ?? null : null;

  const onMove = (event: ReactMouseEvent<SVGSVGElement>): void => {
    const geom = props.geom;
    if (!geom || geom.n <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const slot = geom.plotWidth / geom.n;
    const index = Math.min(geom.n - 1, Math.max(0, Math.floor((x - geom.plotLeft) / slot)));
    props.onHover(index);
  };

  return (
    <section
      aria-label="成本与销毛（模拟）"
      style={{
        height: MARGIN_COST_BAND_HEIGHT,
        boxSizing: 'border-box',
        borderTop: `1px solid ${color.hairline}`,
        background: color.canvas,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', fontSize: 12, color: color.body }}>
        <span>成本与销毛（模拟）</span>
        {!showEmpty && <span style={{ fontSize: 10, color: color.mute }}>金额/台</span>}
      </div>
      {showEmpty ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: color.mute, fontSize: 12 }}>
          可显示，当前无数据
        </div>
      ) : (
        <>
          <svg
            role="img"
            aria-label="单台成本阶梯柱与单台销毛阶梯线"
            width="100%"
            height={88}
            style={{ display: 'block' }}
            onMouseMove={onMove}
            onMouseLeave={() => props.onHover(null)}
          >
            {props.geom && (() => {
              const plotTop = 6;
              const plotHeight = 76;
              const yAt = (value: number): number => {
                const span = Math.max(1e-9, domain.max - domain.min);
                return plotTop + (1 - (value - domain.min) / span) * plotHeight;
              };
              const zeroY = yAt(0);
              const slot = props.geom.plotWidth / Math.max(1, props.geom.n);
              const commands: string[] = [];
              segments.forEach((segment, index) => {
                const x0 = props.geom!.plotLeft + segment.startIndex * slot;
                const x1 = props.geom!.plotLeft + (segment.startIndex + segment.count) * slot;
                const y = yAt(segment.unitMargin);
                if (index === 0) commands.push(`${x0},${y}`);
                else commands.push(`${x0},${y}`);
                commands.push(`${x1},${y}`);
              });
              return (
                <>
                  <line x1={props.geom.plotLeft} x2={props.geom.plotLeft + props.geom.plotWidth} y1={zeroY} y2={zeroY} stroke={color.hairlineStrong} strokeWidth={1} />
                  {segments.map((segment) => {
                    const x = props.geom!.plotLeft + segment.startIndex * slot;
                    const width = Math.max(1, segment.count * slot - 1);
                    const y = yAt(segment.unitCost);
                    const top = Math.min(y, zeroY);
                    const height = Math.max(1, Math.abs(zeroY - y));
                    return <rect key={`${segment.monthId}-${segment.startIndex}`} x={x} y={top} width={width} height={height} fill={color.canvasSoft2} stroke={color.hairline} />;
                  })}
                  {commands.length >= 2 && <polyline points={commands.join(' ')} fill="none" stroke={color.ink} strokeWidth={1.5} />}
                </>
              );
            })()}
          </svg>
          <div className="tnum" style={{ minHeight: 28, padding: '0 8px 6px', fontSize: 11, lineHeight: '16px', color: color.body, fontFamily: font.family, fontVariantNumeric: 'tabular-nums' }}>
            {hover
              ? `当月成本 ${formatPrice(Math.round(hover.unitCost), props.currency)} / 当月单台销毛 ${formatPrice(Math.round(hover.unitMargin), props.currency)} / 销毛率 ${(hover.marginRate * 100).toFixed(1)}%`
              : '移入查看当月成本与销毛'}
          </div>
        </>
      )}
    </section>
  );
}
