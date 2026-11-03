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
import { niceCeil } from '../../dataModel/volume';
import { fmtVolume } from './volumeAxis';
import { color, fontSize, radius, space } from '../../theme/tokens';

const H = 208;
const PAD_L = 40;
const PAD_R = 52;
const PAD_T = 14;
const PAD_B = 24;

/** DOS 参考线（天）——手机档讨论口径 70–90 天合理带；超出当前 DOS 上限的不画 */
export const DOS_REF_DAYS: readonly number[] = [70, 90];

export default function InventoryDosCard(props: {
  name: string;
  bucketLabels: readonly string[];
  points: readonly InventoryDemoPoint[];
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
      <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: H }}>
        {!ready ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: color.mute, fontSize: 13 }}>
            {n === 0 ? '暂无数据' : '当前产品在所选范围内无库存数据'}
          </div>
        ) : (
          <svg width="100%" height={H} role="img" aria-label={`${props.name}库存与 DOS：渠道库存柱、渠道 DOS 与全流程 DOS 线`}>
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
            {/* DOS 70–90 天参考线 */}
            {DOS_REF_DAYS.filter((d) => d <= dosMax).map((d) => (
              <g key={d}>
                <line x1={PAD_L} y1={yDos(d)} x2={PAD_L + plotW} y2={yDos(d)} stroke={color.mute} strokeWidth={1} strokeDasharray="3 4" opacity={0.7} />
                <text x={PAD_L + plotW - 2} y={yDos(d) - 3} textAnchor="end" fontSize={9.5} fill={color.mute}>
                  {d} 天
                </text>
              </g>
            ))}
            {/* X 标签 */}
            {props.bucketLabels.map((label, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={`${label}-${i}`} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={color.mute}>
                  {label}
                </text>
              ) : null,
            )}
            {/* 渠道库存柱（中性墨） */}
            {props.points.map((p, i) => {
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
            {/* SI 补货 ▼ */}
            {props.points.map((p, i) => {
              if (p.siUnits == null || p.channelInv == null) return null;
              const x = xOf(i);
              const y = yInv(p.channelInv) - 8;
              return (
                <path key={`si-${i}`} d={`M${x - 4.5} ${y - 6} L${x + 4.5} ${y - 6} L${x} ${y} Z`} fill={color.ink}>
                  <title>{`SI 补货 ${Math.round(p.siUnits).toLocaleString('en-US')} 台`}</title>
                </path>
              );
            })}
            {/* DOS 双线 */}
            <path d={lineOf('fullDos')} fill="none" stroke={color.hairlineStrong} strokeWidth={1.5} strokeDasharray="5 4" />
            <path d={lineOf('channelDos')} fill="none" stroke={color.link} strokeWidth={2.2} />
            {/* 图例 */}
            <g>
              <rect x={PAD_L + 2} y={6} width={10} height={7} rx={1.5} fill="rgba(23,23,23,0.14)" stroke={color.hairline} />
              <text x={PAD_L + 16} y={13} fontSize={10.5} fill={color.body}>渠道库存（台）</text>
              <line x1={PAD_L + 106} y1={10} x2={PAD_L + 120} y2={10} stroke={color.link} strokeWidth={2.2} />
              <text x={PAD_L + 124} y={13} fontSize={10.5} fill={color.body}>渠道 DOS</text>
              <line x1={PAD_L + 178} y1={10} x2={PAD_L + 192} y2={10} stroke={color.hairlineStrong} strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={PAD_L + 196} y={13} fontSize={10.5} fill={color.body}>全流程 DOS</text>
              <path d={`M${PAD_L + 266} 3 L${PAD_L + 271} 3 L${PAD_L + 268.5} 8 Z`} fill={color.ink} />
              <text x={PAD_L + 275} y={13} fontSize={10.5} fill={color.body}>SI</text>
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
