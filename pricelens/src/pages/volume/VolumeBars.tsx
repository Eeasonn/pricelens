// ============================================================
// 第112轮 量价看板 · 面板底部销量柱层：SVG 画在价格折线（ECharts 画布）之下。
// 柱区 = 绘图区底部 34%；柱高 linear = v/vMax、对数 = log1p 比；柱宽 0.62 × 列宽。
// 柱区顶 1px 虚线横跨绘图区；右缘两枚刻度小字（上限 / 半上限，白底描边）。
// 横向几何由 Chart.onGeom 上报（StripGeom），纵向 = 面板 gridTop + 共享 yScale.plotHeight。
// ============================================================
import type { StripGeom } from '../../chart/PriceTrend/helpers';
import { color } from '../../theme/tokens';
import { fmtVolume } from './volumeAxis';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function VolumeBars(props: {
  geom: StripGeom | null;
  /** 绘图区顶（面板 gridTop） */
  plotTop: number;
  plotHeight: number;
  values: (number | null)[];
  vMax: number;
  mode: 'linear' | 'log';
  color: string;
  hoverIdx: number | null;
}) {
  const { geom, values, vMax, mode } = props;
  if (!geom || geom.n <= 0 || !(props.plotHeight > 0) || !(vMax > 0)) return null;
  const zoneH = props.plotHeight * 0.34;
  const zoneTop = props.plotTop + props.plotHeight - zoneH;
  const colW = geom.plotWidth / geom.n;
  const barW = Math.max(1, 0.62 * colW);
  const denom = mode === 'log' ? Math.log1p(vMax) : vMax;
  const bars = values.map((v, i) => {
    if (v == null || v <= 0 || denom <= 0) return null;
    const frac = mode === 'log' ? Math.log1p(v) / denom : v / vMax;
    const h = Math.min(zoneH, Math.max(1, frac * zoneH));
    const cx = geom.plotLeft + colW * (i + 0.5);
    return { i, x: cx - barW / 2, y: zoneTop + (zoneH - h), w: barW, h, lit: props.hoverIdx === i };
  });
  const tickStyle = {
    fontSize: 9,
    fill: color.mute,
    stroke: '#fff',
    strokeWidth: 3,
    paintOrder: 'stroke' as const,
    strokeLinejoin: 'round' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  };
  return (
    <svg
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    >
      <line
        x1={geom.plotLeft}
        x2={geom.plotLeft + geom.plotWidth}
        y1={zoneTop}
        y2={zoneTop}
        stroke={color.hairlineStrong}
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.8}
      />
      {bars.map((b) =>
        b == null ? null : (
          <rect key={b.i} x={b.x} y={b.y} width={b.w} height={b.h} rx={1} fill={hexToRgba(props.color, b.lit ? 0.38 : 0.18)} />
        ),
      )}
      <text x={geom.plotLeft + geom.plotWidth - 2} y={zoneTop - 2} textAnchor="end" style={tickStyle}>
        {fmtVolume(vMax)}
      </text>
      <text x={geom.plotLeft + geom.plotWidth - 2} y={zoneTop + zoneH / 2 + 3} textAnchor="end" style={tickStyle}>
        {fmtVolume(vMax / 2)}
      </text>
    </svg>
  );
}
