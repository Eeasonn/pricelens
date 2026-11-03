// ============================================================
// 量价走势 · 补充图①「销毛成本」（2026-11-03，Eason：不颠覆现有量价面板，
// 面板之外补一张独立图）：周销毛柱（琥珀）+ 单台成本月版本阶梯线（灰）
// + 折后均价线（墨，细）。销毛 = 周销 × 单台毛利（marginCost 月版本口径，
// 模拟成本）；友商/无主品不出图（与明细卡成本格同口径）。
// 图上只留数据与控件：口径说明全部收进卡头副标与 title。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MarginCostPoint } from './marginCost';
import SuppLegend, { type SuppLegendItem } from './SuppLegend';
import { niceCeil } from '../../dataModel/volume';
import { color, fontSize, radius, space } from '../../theme/tokens';

const H = 208;
const PAD_L = 46;
const PAD_R = 48;
const PAD_T = 14;
const PAD_B = 24;

/** 周销毛（万 USD）柱序列；无销量或无成本版本的桶为 null */
export function weeklyMarginOf(
  volumes: readonly (number | null)[],
  marginPoints: readonly (MarginCostPoint | null)[],
): (number | null)[] {
  return volumes.map((vol, i) => {
    const mp = marginPoints[i];
    if (vol == null || !mp) return null;
    return (vol * mp.unitMargin) / 1e4;
  });
}

/** 图例项（键与系列一一对应；点击显隐，与价格走势/大盘走势图例同交互） */
export const MARGIN_LEGEND_ITEMS: readonly SuppLegendItem[] = [
  { key: 'margin', label: '周销毛（万$）', shape: 'bar', color: 'rgba(180,83,9,0.55)', fill: 'rgba(245,166,35,0.42)' },
  { key: 'cost', label: '成本 · 月版本', shape: 'line', color: color.hairlineStrong },
  { key: 'avg', label: '均价', shape: 'line', color: color.ink },
];

export default function MarginCostCard(props: {
  name: string;
  bucketLabels: readonly string[];
  volumes: readonly (number | null)[];
  marginPoints: readonly (MarginCostPoint | null)[];
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

  const weekly = useMemo(() => weeklyMarginOf(props.volumes, props.marginPoints), [props.volumes, props.marginPoints]);
  const hasData = weekly.some((v) => v != null);
  const n = props.bucketLabels.length;

  const ready = width >= 200 && n > 0 && hasData;
  const plotW = Math.max(10, width - PAD_L - PAD_R);
  const plotH = H - PAD_T - PAD_B;

  const yMax = useMemo(() => {
    let m = 0;
    for (const v of weekly) if (v != null && v > m) m = v;
    return m > 0 ? niceCeil(m) : 1;
  }, [weekly]);

  // 右轴（单台 $）：覆盖月版本成本与均价，头尾留 8% 呼吸
  const [uMin, uMax] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const mp of props.marginPoints) {
      if (!mp) continue;
      lo = Math.min(lo, mp.unitCost, mp.unitRevenue);
      hi = Math.max(hi, mp.unitCost, mp.unitRevenue);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
    const pad = (hi - lo) * 0.08 || hi * 0.08 || 1;
    return [lo - pad, hi + pad];
  }, [props.marginPoints]);

  const slot = n > 0 ? plotW / n : plotW;
  const barW = Math.min(30, slot * 0.52);
  const xOf = (i: number) => PAD_L + slot * (i + 0.5);
  const yBar = (v: number) => PAD_T + plotH * (1 - v / yMax);
  const yUnit = (v: number) => PAD_T + plotH * (1 - (v - uMin) / (uMax - uMin || 1));

  const unitLine = (key: 'unitCost' | 'unitRevenue') => {
    let d = '';
    let prev: number | null = null;
    for (let i = 0; i < n; i++) {
      const mp = props.marginPoints[i];
      if (!mp) {
        prev = null;
        continue;
      }
      const v = mp[key];
      const y = yUnit(v);
      if (prev == null) d += `M${xOf(i) - slot / 2} ${y}`;
      else d += `L${xOf(i) - slot / 2} ${y}`;
      d += `L${xOf(i) + slot / 2} ${y}`;
      prev = v;
    }
    return d;
  };

  const labelEvery = Math.max(1, Math.ceil(n / 9));

  return (
    <div
      style={{
        background: color.canvas,
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.card,
        padding: `${space.md}px ${space.base}px ${space.sm}px`,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space.sm, marginBottom: space.sm, flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>销毛成本</h4>
        <span style={{ fontSize: 12, color: color.mute }}>{props.name}</span>
        <span
          title="成本为月版本模拟数据（与明细卡成本格同口径）；周销毛 = 周销 × 当月单台毛利"
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: color.warningInk,
            background: color.warningSoft,
            borderRadius: radius.pill,
            padding: '1px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          模拟成本 · 月版本
        </span>
      </div>
      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        {!ready ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: color.mute, fontSize: 13 }}>
            {n === 0 ? '暂无数据' : '当前产品在所选范围内无销毛成本数据'}
          </div>
        ) : (
          <svg width="100%" height={H} role="img" aria-label={`${props.name}销毛成本：周销毛柱与单台成本、均价线`}>
            {/* 网格 + 左轴（万 $） */}
            {[0, 0.5, 1].map((t) => {
              const y = PAD_T + plotH * (1 - t);
              return (
                <g key={t}>
                  <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke={t === 0 ? color.hairlineStrong : color.hairline} strokeWidth={1} />
                  <text x={PAD_L - 6} y={y + 3.5} textAnchor="end" fontSize={10.5} fill={color.mute}>
                    {(yMax * t).toFixed(yMax >= 10 ? 0 : 1)}
                  </text>
                </g>
              );
            })}
            {/* 右轴（单台 $）：3 刻度 */}
            {[0, 0.5, 1].map((t) => {
              const v = uMin + (uMax - uMin) * t;
              const y = yUnit(v);
              return (
                <text key={t} x={PAD_L + plotW + 6} y={y + 3.5} fontSize={10.5} fill={color.mute}>
                  ${Math.round(v / 10) * 10}
                </text>
              );
            })}
            {/* X 标签 */}
            {props.bucketLabels.map((label, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={props.bucketLabels.length > 0 ? `${label}-${i}` : i} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={color.mute}>
                  {label}
                </text>
              ) : null,
            )}
            {/* 周销毛柱（图例可隐） */}
            {hidden.has('margin') ? null : weekly.map((v, i) => {
              if (v == null) return null;
              const mp = props.marginPoints[i];
              return (
                <rect
                  key={`m-${i}`}
                  x={xOf(i) - barW / 2}
                  y={yBar(v)}
                  width={barW}
                  height={Math.max(1, PAD_T + plotH - yBar(v))}
                  rx={2}
                  fill="rgba(245,166,35,0.42)"
                  stroke="rgba(180,83,9,0.55)"
                  strokeWidth={1}
                >
                  <title>
                    {`${props.bucketLabels[i] ?? ''} 周销毛 ${v.toFixed(1)} 万$ · 周销 ${Math.round(props.volumes[i] ?? 0).toLocaleString('en-US')} 台 · 单台毛利 $${Math.round(mp?.unitMargin ?? 0)}（成本 $${Math.round(mp?.unitCost ?? 0)} / 均价 $${Math.round(mp?.unitRevenue ?? 0)}）`}
                  </title>
                </rect>
              );
            })}
            {/* 单台成本（月版本阶梯）与均价线（各自图例可隐） */}
            {hidden.has('cost') ? null : <path d={unitLine('unitCost')} fill="none" stroke={color.hairlineStrong} strokeWidth={2} />}
            {hidden.has('avg') ? null : <path d={unitLine('unitRevenue')} fill="none" stroke={color.ink} strokeWidth={1.4} strokeOpacity={0.75} />}
          </svg>
        )}
        {/* 可点击图例（图外底部居中，与大盘走势同款交互——图例不与数据线重叠） */}
        <SuppLegend items={MARGIN_LEGEND_ITEMS} hidden={hidden} onToggle={toggle} />
      </div>
    </div>
  );
}
