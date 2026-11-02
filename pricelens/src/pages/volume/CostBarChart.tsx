// ============================================================
// 量价面板 · 成本柱呈现（2026-11-02 新方案，参考竞品柱图改造）：
// - 每周一根从 $0 到折后价的柱（不悬空），柱顶价格帽线；成本位置一条灰线横贯柱面
// - 销量 = 右轴细线 + 点（参考图蓝线语言，单蓝强调）
// - 销毛率 = 从 $0 基线向下长的半透明琥珀柱（独立比例缩放到固定深度，共 X 轴）
// - 价格/成本/销毛率标签在列宽足够时显示；缺采周空柱；隔离周价格帽变灰虚线
// - Y 轴从 0 起（由页面级 yCfgCost 传入，与共享档位轴列同刻度）
// ============================================================
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { StripGeom } from '../../chart/PriceTrend/helpers';
import { yPxOf } from '../../chart/PriceTrend/helpers';
import type { YScale } from '../../chart/PriceTrend/helpers';
import type { SeriesPoint } from '../../dataModel/types';
import type { MarginCostPoint } from './marginCost';
import { color, font, formatPrice, radius, selectAccent } from '../../theme/tokens';

const MARGIN_ZONE_H = 52; // 销毛率下垂区高度

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(23, 23, 23, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function CostBarChart(props: {
  /** 页面级传入（初次测量前为 null，测量后经 onGeom 回流） */
  geom: StripGeom | null;
  plotTop: number;
  plotHeight: number;
  yScale: YScale;
  /** 观察窗口切片后的价格序列（含 suspect 打标） */
  points: SeriesPoint[];
  costPoints: readonly (MarginCostPoint | null)[];
  volumes: readonly (number | null)[];
  currency: 'local' | 'usd';
  seriesColor: string;
  focusIdx: number | null;
  selectionBand?: { startIndex: number; endIndex: number } | null;
  onGeom?: (geom: StripGeom | null) => void;
  name: string;
  emptyHint?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

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

  const GRID_L = 8;
  const GRID_R = 78;
  const geom: StripGeom | null =
    width >= 160 && props.points.length > 0
      ? { plotLeft: GRID_L, plotWidth: width - GRID_L - GRID_R, n: props.points.length }
      : null;

  const stripKey = geom ? `${geom.plotLeft}|${geom.plotWidth}|${geom.n}` : '';
  const onGeomRef = useRef(props.onGeom);
  onGeomRef.current = props.onGeom;
  useEffect(() => {
    onGeomRef.current?.(geom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripKey]);

  const empty = props.points.length === 0 || geom == null;
  const baseline = props.plotTop + props.plotHeight;

  // 销量右轴域
  const maxVol = Math.max(0, ...props.volumes.filter((v): v is number => v != null));
  // 销毛率域（视图内最大）
  const maxRate = Math.max(0, ...props.costPoints.filter((p): p is MarginCostPoint => p != null).map((p) => p.marginRate));

  const hasAny = props.points.some((pt) => pt.price != null) || props.volumes.some((v) => v != null);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: props.plotTop + props.plotHeight + MARGIN_ZONE_H + 8 }}>
      {empty && (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: color.mute, fontSize: 14 }}>
          {props.emptyHint ?? '暂无数据'}
        </div>
      )}
      {!empty && geom && !hasAny && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: color.mute, fontSize: 14 }}>
          该产品在所选时间范围内无数据
        </div>
      )}
      {!empty && geom && hasAny && (() => {
        const n = geom.n;
        const slot = geom.plotWidth / Math.max(1, n);
        const barW = Math.min(slot * 0.55, 46);
        const y$ = (v: number): number => yPxOf({ gridLeft: GRID_L, plotLeft: GRID_L, plotTop: props.plotTop, plotWidth: geom.plotWidth, plotHeight: props.plotHeight, scale: props.yScale, n }, v);
        const showLabels = slot >= 56;
        const rateLabels = slot >= 44;
        const focus = props.focusIdx;
        const volMax = Math.max(1, maxVol);
        const rateMax = Math.max(0.01, maxRate);
        const cols: ReactNode[] = [];
        const volPts: string[] = [];
        for (let i = 0; i < n; i++) {
          const pt = props.points[i];
          const price = pt?.price ?? null;
          const cost = props.costPoints[i]?.unitCost ?? null;
          const rate = props.costPoints[i]?.marginRate ?? null;
          const vol = props.volumes[i] ?? null;
          const cx = GRID_L + slot * (i + 0.5);
          const quarantined = pt?.suspect === 'quarantined';
          const pending = pt?.suspect === 'pending';
          if (props.selectionBand && i >= Math.min(props.selectionBand.startIndex, props.selectionBand.endIndex) && i <= Math.max(props.selectionBand.startIndex, props.selectionBand.endIndex)) {
            cols.push(<rect key={`sel-${i}`} x={GRID_L + slot * i} y={props.plotTop} width={slot} height={props.plotHeight} fill={selectAccent} fillOpacity={0.06} />);
          }
          if (focus === i) {
            cols.push(<rect key={`focus-${i}`} x={GRID_L + slot * i} y={props.plotTop} width={slot} height={props.plotHeight} fill={color.canvasSoft2} opacity={0.5} />);
          }
          if (price != null) {
            const yCap = y$(price);
            const capColor = quarantined ? color.hairlineStrong : pending ? '#b45309' : props.seriesColor;
            cols.push(
              <g key={`bar-${i}`}>
                <rect x={cx - barW / 2} y={yCap} width={barW} height={Math.max(1, baseline - yCap)} fill={hexToRgba(props.seriesColor, quarantined ? 0.07 : 0.15)} />
                <line x1={cx - barW / 2 - 1} x2={cx + barW / 2 + 1} y1={yCap} y2={yCap} stroke={capColor} strokeWidth={2.5} strokeDasharray={quarantined ? '3 2' : undefined} />
                {(showLabels || focus === i) && (
                  <text x={cx} y={yCap - 5} textAnchor="middle" fill={color.ink} fontSize={10} fontWeight={600} fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatPrice(price, props.currency)}
                  </text>
                )}
              </g>,
            );
            if (cost != null) {
              const yCost = y$(cost);
              cols.push(
                <g key={`cost-${i}`}>
                  <line x1={cx - barW / 2 - 3} x2={cx + barW / 2 + 3} y1={yCost} y2={yCost} stroke={color.mute} strokeWidth={2} />
                  {(showLabels || focus === i) && (
                    <text x={cx} y={yCost + 11} textAnchor="middle" fill={color.mute} fontSize={9.5} fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatPrice(Math.round(cost), props.currency)}
                    </text>
                  )}
                </g>,
              );
            }
            if (focus === i) {
              cols.push(<circle key={`dot-${i}`} cx={cx} cy={yCap} r={4} fill={color.canvas} stroke={props.seriesColor} strokeWidth={1.5} />);
            }
          }
          if (vol != null) {
            volPts.push(`${cx},${props.plotTop + props.plotHeight * (1 - vol / volMax)}`);
          }
          if (rate != null && rate > 0) {
            const h = Math.max(2, (rate / rateMax) * (MARGIN_ZONE_H - 14));
            cols.push(
              <g key={`rate-${i}`}>
                <rect x={cx - barW * 0.3} y={baseline + 4} width={barW * 0.6} height={h} fill={hexToRgba('#f5a623', 0.32)} />
                <line x1={cx - barW * 0.3} x2={cx + barW * 0.3} y1={baseline + 4} y2={baseline + 4} stroke={hexToRgba('#f5a623', 0.8)} strokeWidth={1} />
                {rateLabels && (
                  <text x={cx} y={baseline + 4 + h + 9} textAnchor="middle" fill={color.mute} fontSize={8.5} fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(rate * 100)}%
                  </text>
                )}
              </g>,
            );
          }
        }
        const volMaxLabel = `${Math.round(volMax).toLocaleString('en-US')} 台`;
        return (
          <svg role="img" aria-label={`${props.name} 成本柱量价图：柱高为折后价，灰线为成本，蓝线为销量，下垂柱为销毛率`} width="100%" height={props.plotTop + props.plotHeight + MARGIN_ZONE_H + 8} style={{ display: 'block' }}>
            <line x1={GRID_L} x2={GRID_L + geom.plotWidth} y1={baseline} y2={baseline} stroke={color.hairlineStrong} strokeWidth={1} />
            {cols}
            {volPts.length > 0 && (
              <>
                <polyline points={volPts.join(' ')} fill="none" stroke={selectAccent} strokeWidth={1.5} />
                {volPts.map((ptStr, i) => {
                  const [x, y] = ptStr.split(',');
                  return <circle key={`vol-${i}`} cx={x} cy={y} r={2.5} fill={color.canvas} stroke={selectAccent} strokeWidth={1.2} />;
                })}
                <text x={GRID_L + geom.plotWidth + 8} y={props.plotTop + 8} fill={color.mute} fontSize={9} fontFamily={font.family}>{volMaxLabel}</text>
                <text x={GRID_L + geom.plotWidth + 8} y={baseline - 2} fill={color.mute} fontSize={9} fontFamily={font.family}>0</text>
              </>
            )}
            <text x={GRID_L + 2} y={baseline + 14} fill={color.mute} fontSize={9} fontFamily={font.family}>销毛率（下垂）</text>
          </svg>
        );
      })()}
    </div>
  );
}
