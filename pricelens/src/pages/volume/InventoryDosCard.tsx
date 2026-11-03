// ============================================================
// 量价走势 · 补充图②「库存 · DOS」（2026-11-03，第三轮产品讨论的呈现定稿）：
// X = 拉齐时间桶；左轴折线 = 渠道 DOS（蓝）+ 全流程 DOS（灰虚）；
// 右轴柱 = 渠道库存绝对值（中性墨柱）；SI 补货周画 ▼。
// 数据来自 inventoryDemo（演示）：卡头带「演示数据」琥珀 chip + title
// 说明口径（库存 = 上期 + SI − 销量；DOS = 库存 ÷ 近 4 桶均销）。
// 手机档 DOS 合理带 70–90 天画两条 mute 虚线（仅参考，阈值待拍板）。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import type { InventoryDemoPoint } from './inventoryDemo';
import SuppLegend, { type SuppLegendItem } from './SuppLegend';
import { niceCeil } from '../../dataModel/volume';
import { fmtVolume } from './volumeAxis';
import { color, fontSize, radius, space } from '../../theme/tokens';

const H = 236;
const PAD_L = 40;
const PAD_R = 52;
const PAD_T = 14;
const PAD_B = 24;

/** DOS 参考线（天）——手机档讨论口径 70–90 天合理带；超出当前 DOS 上限的不画 */
export const DOS_REF_DAYS: readonly number[] = [70, 90];

/** 图例项（键与系列一一对应；点击显隐，与价格走势/大盘走势图例同交互） */
export const INVENTORY_LEGEND_ITEMS: readonly SuppLegendItem[] = [
  { key: 'inv', label: '渠道库存（台）', shape: 'bar', color: color.hairline, fill: 'rgba(23,23,23,0.14)' },
  { key: 'channelDos', label: '渠道 DOS', shape: 'line', color: color.link },
  { key: 'fullDos', label: '全流程 DOS', shape: 'dash', color: color.hairlineStrong },
  { key: 'si', label: 'SI', shape: 'tri', color: color.ink },
];

export default function InventoryDosCard(props: {
  name: string;
  bucketLabels: readonly string[];
  points: readonly InventoryDemoPoint[];
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
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

  const n = props.bucketLabels.length;
  const hasData = props.points.some((p) => p.channelInv != null);

  const dosMax = useMemo(() => {
    let m = 0;
    for (const p of props.points) {
      if (p.channelDos != null && p.channelDos > m) m = p.channelDos;
      if (p.fullDos != null && p.fullDos > m) m = p.fullDos;
    }
    return m > 0 ? Math.max(niceCeil(m), 91) : 1; // 至少容下 90 天参考线
  }, [props.points]);

  const invMax = useMemo(() => {
    let m = 0;
    for (const p of props.points) if (p.channelInv != null && p.channelInv > m) m = p.channelInv;
    return m > 0 ? niceCeil(m) : 1;
  }, [props.points]);

  const ready = width >= 200 && n > 0 && hasData;
  const plotW = Math.max(10, width - PAD_L - PAD_R);
  const plotH = H - PAD_T - PAD_B;
  const slot = n > 0 ? plotW / n : plotW;
  const barW = Math.min(26, slot * 0.46);
  const xOf = (i: number) => PAD_L + slot * (i + 0.5);
  const yDos = (v: number) => PAD_T + plotH * (1 - v / dosMax);
  const yInv = (v: number) => PAD_T + plotH * (1 - v / invMax);

  const lineOf = (key: 'channelDos' | 'fullDos') => {
    let d = '';
    for (let i = 0; i < props.points.length; i++) {
      const v = props.points[i][key];
      if (v == null) continue;
      d += `${d ? 'L' : 'M'}${xOf(i)} ${yDos(v)}`;
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
        <h4 style={{ margin: 0, fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>库存 · DOS</h4>
        <span style={{ fontSize: 12, color: color.mute }}>{props.name}</span>
        <span
          title="演示数据：SI 补货节奏与全流程系数为演示假设；渠道库存按「上期 + SI − 周销」推演，DOS = 渠道库存 ÷ 近 4 周平均周销 × 7 天"
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
          演示数据
        </span>
      </div>
      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        {!ready ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: color.mute, fontSize: 13 }}>
            {n === 0 ? '暂无数据' : '当前产品在所选范围内无库存数据'}
          </div>
        ) : (
          <svg
            width="100%"
            height={H}
            role="img"
            aria-label={`${props.name}库存与 DOS：渠道库存柱、渠道 DOS 与全流程 DOS 线`}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              if (r.width <= 0 || width <= 0) return;
              const sx = ((e.clientX - r.left) / r.width) * width;
              const i = Math.round((sx - PAD_L) / slot - 0.5);
              setHoverIdx(i >= 0 && i < n ? i : null);
            }}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {/* 网格 + 左轴（天） */}
            {[0, 0.5, 1].map((t) => {
              const v = dosMax * t;
              const y = yDos(v);
              return (
                <g key={t}>
                  <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke={t === 0 ? color.hairlineStrong : color.hairline} strokeWidth={1} />
                  <text x={PAD_L - 6} y={y + 3.5} textAnchor="end" fontSize={10.5} fill={color.mute}>
                    {Math.round(v)}
                  </text>
                </g>
              );
            })}
            {/* 右轴（库存台） */}
            {[0, 0.5, 1].map((t) => {
              const y = yInv(invMax * t);
              return (
                <text key={t} x={PAD_L + plotW + 6} y={y + 3.5} fontSize={10.5} fill={color.mute}>
                  {fmtVolume(invMax * t)}
                </text>
              );
            })}
            {/* DOS 70–90 天健康带（讨论口径：浅灰带 + 边界线，比双虚线更直观） */}
            {DOS_REF_DAYS[1] <= dosMax && (
              <g>
                <rect
                  x={PAD_L}
                  y={yDos(DOS_REF_DAYS[1])}
                  width={plotW}
                  height={Math.max(0, yDos(DOS_REF_DAYS[0]) - yDos(DOS_REF_DAYS[1]))}
                  fill={color.canvasSoft2}
                  opacity={0.8}
                />
                {DOS_REF_DAYS.map((d) => (
                  <g key={d}>
                    <line x1={PAD_L} y1={yDos(d)} x2={PAD_L + plotW} y2={yDos(d)} stroke={color.mute} strokeWidth={1} strokeDasharray="3 4" opacity={0.7} />
                    <text x={PAD_L + plotW - 2} y={yDos(d) - 3} textAnchor="end" fontSize={9.5} fill={color.mute}>
                      {d} 天
                    </text>
                  </g>
                ))}
              </g>
            )}
            {/* X 标签 */}
            {props.bucketLabels.map((label, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={`${label}-${i}`} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={color.mute}>
                  {label}
                </text>
              ) : null,
            )}
            {/* 渠道库存柱（中性墨，图例可隐） */}
            {hidden.has('inv') ? null : props.points.map((p, i) => {
              if (p.channelInv == null) return null;
              const y = yInv(p.channelInv);
              return (
                <rect
                  key={`inv-${i}`}
                  x={xOf(i) - barW / 2}
                  y={y}
                  width={barW}
                  height={Math.max(1, PAD_T + plotH - y)}
                  rx={2}
                  fill="rgba(23,23,23,0.14)"
                  stroke={color.hairline}
                >
                  <title>
                    {`${props.bucketLabels[i] ?? ''} 渠道库存 ${Math.round(p.channelInv).toLocaleString('en-US')} 台 · 渠道 DOS ${p.channelDos != null ? Math.round(p.channelDos) : '—'} 天 · 全流程 DOS ${p.fullDos != null ? Math.round(p.fullDos) : '—'} 天${p.siUnits != null ? ` · SI ${Math.round(p.siUnits).toLocaleString('en-US')} 台` : ''}`}
                  </title>
                </rect>
              );
            })}
            {/* SI 补货 ▼（图例可隐） */}
            {hidden.has('si') ? null : props.points.map((p, i) => {
              if (p.siUnits == null || p.channelInv == null) return null;
              const x = xOf(i);
              const y = yInv(p.channelInv) - 8;
              return (
                <path key={`si-${i}`} d={`M${x - 4.5} ${y - 6} L${x + 4.5} ${y - 6} L${x} ${y} Z`} fill={color.ink}>
                  <title>{`SI 补货 ${Math.round(p.siUnits).toLocaleString('en-US')} 台`}</title>
                </path>
              );
            })}
            {/* DOS 双线（各自图例可隐） */}
            {hidden.has('fullDos') ? null : <path d={lineOf('fullDos')} fill="none" stroke={color.hairlineStrong} strokeWidth={1.5} strokeDasharray="5 4" />}
            {hidden.has('channelDos') ? null : <path d={lineOf('channelDos')} fill="none" stroke={color.link} strokeWidth={2.2} />}
            {/* 悬停十字线 */}
            {hoverIdx != null && props.points[hoverIdx]?.channelInv != null && (
              <line
                x1={xOf(hoverIdx)}
                y1={PAD_T}
                x2={xOf(hoverIdx)}
                y2={PAD_T + plotH}
                stroke={color.hairlineStrong}
                strokeWidth={1}
                strokeDasharray="2 3"
                aria-hidden
              />
            )}
          </svg>
        )}
        {/* 悬停浮窗：当周读数（周 / 库存 / 双 DOS / SI） */}
        {ready && hoverIdx != null && (() => {
          const p = props.points[hoverIdx];
          if (!p || p.channelInv == null) return null;
          const pct = (xOf(hoverIdx) / width) * 100;
          const flip = pct > 62; // 靠右缘时浮窗翻到左侧，防溢出
          const rows: Array<[string, string]> = [
            ['渠道库存', `${Math.round(p.channelInv).toLocaleString('en-US')} 台`],
            ['渠道 DOS', p.channelDos != null ? `${Math.round(p.channelDos)} 天` : '—'],
            ['全流程 DOS', p.fullDos != null ? `${Math.round(p.fullDos)} 天` : '—'],
            ['SI', p.siUnits != null ? `${Math.round(p.siUnits).toLocaleString('en-US')} 台` : '—'],
          ];
          return (
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: `${flip ? pct - 1 : pct + 1}%`,
                transform: flip ? 'translateX(-100%)' : undefined,
                background: color.canvas,
                borderRadius: radius.control,
                boxShadow: '0 8px 24px -4px rgba(0,0,0,.18), inset 0 0 0 1px rgba(0,0,0,.08)',
                padding: '8px 10px',
                fontSize: 11,
                lineHeight: '18px',
                color: color.body,
                pointerEvents: 'none',
                zIndex: 2,
                minWidth: 132,
              }}
            >
              <div style={{ fontWeight: 600, color: color.ink, marginBottom: 2 }}>{props.bucketLabels[hoverIdx] ?? ''}</div>
              {rows.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span>{k}</span>
                  <span style={{ fontWeight: 600, color: color.ink }}>{v}</span>
                </div>
              ))}
            </div>
          );
        })()}
        {/* 可点击图例（图外底部居中，与大盘走势同款交互——图例不与数据线重叠） */}
        <SuppLegend items={INVENTORY_LEGEND_ITEMS} hidden={hidden} onToggle={toggle} />
      </div>
    </div>
  );
}
