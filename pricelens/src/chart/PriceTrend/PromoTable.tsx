// ============================================================
// 促销力度热力带（第三轮新增为矩阵表；第十五轮重构为与时间轴逐像素对齐的热力带）：
// 行 = 当前图上产品（与图例同序），列 = 窗口内每个时间节点——列几何直接复用图表
// Geom 的横向原语（plotLeft/plotWidth/n，经 Chart.onGeom 上报）：第 i 格 =
// [i·bw, (i+1)·bw)，中心 = xPxOf(i)，与上方曲线的时间桶逐像素对齐，
// 不再有独立列宽导致的错位，也无需横向滚动。
// 单元格 = 折后价相对上市价的降幅%（浅蓝着色，越深促销越深；高于上市价 = 琥珀）；
// 桶宽 ≥ 44px（月/季视图）时格内直接显示数字，周视图只看色阶 + 悬停 tooltip
// （折后价/上市价/降幅/offer 名）；窗口内最深降幅格用描边标出。
// 边界：无值且节点锚日早于 launch_date → 未上市（透明）；无值且在其后 → 缺采/退市后（浅灰）；
// 月/季桶锚日早于上市日但桶内已有价 → 照常显示（与图上的点一致）；退市清库期有价照常显示。
// 数据完全复用图表的 visSeries（同一 buildSeries / 窗口切片 / 汇总口径），零新增取数；
// 上市基线来自 dim_product.launch_price（同型号+ROMRAM 各颜色造数一致，launchInfoOf 直取）。
// ============================================================
import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import type { CurrencyMode, Series } from '../../dataModel/types';
import { launchInfoOf } from '../../dataModel/aggregate';
import { color, font, fontSize, formatPrice, radius, space } from '../../theme/tokens';
import type { StripGeom } from './helpers';
import {
  offerSummary,
  curveNameOf } from './chartModel';

/** 降幅分档底色（浅蓝 → 深蓝；上限档兜底）+ 溢价琥珀 */
const DEPTH_TINTS: [number, string][] = [
  [5, '#f3f8ff'],
  [10, '#e8f1ff'],
  [15, '#d6e6ff'],
  [20, '#c0d9ff'],
  [Number.POSITIVE_INFINITY, '#a9cdff'],
];
const PREMIUM_TINT = '#ffefcf';
const MISS_TINT = 'rgba(0, 0, 0, 0.045)';
function depthTint(depth: number): string {
  for (const [t, c] of DEPTH_TINTS) if (depth <= t / 100) return c;
  return '#a9cdff';
}

type Cell =
  | { kind: 'pre' } // 未上市
  | { kind: 'miss'; eol: boolean } // 缺采 / 已退市后无数据
  | { kind: 'val'; depth: number; pct: number; price: number; offerNote: string | null };

interface Row {
  label: string;
  dotColor: string;
  isOwn: boolean;
  launch: number | null;
  cells: Cell[];
  /** 窗口内最深降幅（>0 才有意义；全溢价/无数据为 null） */
  deepest: { pct: number; label: string; idx: number } | null;
}

/** 行高与数字直显的桶宽阈值（周视图 ~27px 只看色阶；月/季 ≥44px 格内出数字） */
const ROW_H = 22;
const NUM_MIN_BW = 44;

export default function PromoTable({
  series,
  currency,
  geom,
}: {
  series: Series[];
  currency: CurrencyMode;
  geom: StripGeom | null;
}) {
  const rows = useMemo<Row[]>(
    () =>
      series.map((s) => {
        const info = launchInfoOf(s.skuIds);
        const launch = info ? (currency === 'usd' ? info.launchPriceUsd : info.launchPriceRub) : null;
        const eolDate = info?.eolDate ?? null;
        const cells: Cell[] = s.points.map((p) => {
          // 有值必显示：月/季桶锚日可能早于上市日、但桶内后段已上市有价——与图上的点保持一致
          if (p.price == null) {
            if (!info || p.anchorDate < info.launchDate) return { kind: 'pre' };
            return { kind: 'miss', eol: eolDate != null && p.anchorDate > eolDate };
          }
          if (launch == null || !(launch > 0)) {
            return { kind: 'miss', eol: eolDate != null && p.anchorDate > eolDate };
          }
          const depth = (launch - p.price) / launch;
          return { kind: 'val', depth, pct: Math.round(depth * 100), price: p.price, offerNote: offerSummary(p.offer) || null };
        });
        let deepest: Row['deepest'] = null;
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          if (c.kind === 'val' && c.pct > 0 && (deepest == null || c.pct > deepest.pct)) {
            deepest = { pct: c.pct, label: s.points[i].xLabel, idx: i };
          }
        }
        return { label: s.label, dotColor: s.color, isOwn: s.isOwn, launch, cells, deepest };
      }),
    [series, currency],
  );

  const n = series[0]?.points.length ?? 0;
  // geom 与系列必须同一窗口（n 一致）才可信；窗口切换的过渡帧沿用上一次几何继续渲染旧格，
  // 绝不整表卸载——卸载会让页面内容高度塌缩，浏览器把滚动位置钳回顶部（拖动手柄时筛选栏闪现 bug）
  const lastValidRef = useRef<StripGeom | null>(null);
  if (geom && geom.n === n) lastValidRef.current = geom;
  const g = geom && geom.n === n ? geom : lastValidRef.current;
  if (!g || n === 0 || rows.length === 0) return null;

  const bw = g.plotWidth / n;
  const showNum = bw >= NUM_MIN_BW;

  const fmtPct = (pct: number): string =>
    pct > 0 ? `\u2212${pct}%` : pct < 0 ? `+${Math.abs(pct)}%` : '0%';

  // 第十九轮反馈：名称去品牌前缀 + 去 GB/TB 后缀（与图上曲线 curveNameOf 同款）——
  // 左列宽度有限，全名必然省略号且把上市价挤到换行；悬停 title 仍保留全名
  const nameCell: CSSProperties = {
    width: g.plotLeft,
    flexShrink: 0,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  };

  const cellText: CSSProperties = {
    fontSize: 10,
    lineHeight: '12px',
    fontFamily: font.family,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ marginTop: space.md, paddingTop: space.base, borderTop: `1px solid ${color.hairline}` }}>
      {/* 标题行：左标题 + 右色阶图例与提示 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: space.md,
          marginBottom: space.xs,
        }}
      >
        <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>促销力度</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: space.md,
            fontSize: fontSize.caption,
            color: color.mute,
            whiteSpace: 'nowrap',
          }}
        >
          {[
            ...DEPTH_TINTS.map(([t, c], i) => ({
              c,
              t: i === DEPTH_TINTS.length - 1 ? '>20%' : i === 0 ? '≤5%' : `${t}%`,
            })),
            { c: PREMIUM_TINT, t: '溢价' },
          ].map(({ c, t }) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <i
                style={{
                  width: 9,
                  height: 9,
                  background: c,
                  borderRadius: 2,
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                }}
              />
              {t}
            </span>
          ))}
          <span>描边格 = 窗口内最深 · 悬停看折后价</span>
        </span>
      </div>

      {/* 热力带：左名称/上市价区（=图表 plotLeft） + 桶对齐色格区（=图表 plotWidth） */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, ri) => (
          <div
            key={r.label}
            style={{ display: 'flex', height: ROW_H, alignItems: 'stretch', marginTop: ri > 0 ? 2 : 0 }}
          >
            <div style={nameCell}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: radius.pill,
                  background: r.dotColor,
                  flexShrink: 0,
                }}
              />
              <span
                title={r.label}
                style={{
                  fontSize: 12,
                  fontFamily: font.family,
                  color: r.isOwn ? color.ink : color.body,
                  fontWeight: r.isOwn ? 600 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {curveNameOf(series[ri])}
              </span>
              <span
                className="tnum"
                title="上市价（促销力度基线）"
                style={{ marginLeft: 'auto', fontSize: 10, color: color.mute, whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {r.launch != null ? formatPrice(r.launch, currency) : '—'}
              </span>
            </div>
            <div style={{ width: g.plotWidth, flexShrink: 0, position: 'relative' }}>
              {r.cells.map((c, i) => {
                const base: ReactNode = [];
                const left = i * bw;
                const width = Math.max(1, bw - (i < n - 1 ? 1 : 0));
                if (c.kind === 'pre') {
                  return (
                    <div
                      key={i}
                      title="未上市"
                      style={{
                        position: 'absolute',
                        top: 1,
                        bottom: 1,
                        left,
                        width,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: color.hairlineStrong,
                        ...cellText,
                      }}
                    >
                      {showNum ? '—' : ''}
                    </div>
                  );
                }
                if (c.kind === 'miss') {
                  return (
                    <div
                      key={i}
                      title={c.eol ? '已退市' : '该周缺采'}
                      style={{
                        position: 'absolute',
                        top: 1,
                        bottom: 1,
                        left,
                        width,
                        background: MISS_TINT,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: color.hairlineStrong,
                        ...cellText,
                      }}
                    >
                      {showNum ? 'n/a' : ''}
                    </div>
                  );
                }
                const isDeepest = r.deepest?.idx === i;
                return (
                  <div
                    key={i}
                    title={`折后价 ${formatPrice(c.price, currency)} · 上市价 ${r.launch != null ? formatPrice(r.launch, currency) : '—'}（促销力度 ${(c.depth * 100).toFixed(1)}%）${c.offerNote ? ` · offer：${c.offerNote}` : ''}`}
                    style={{
                      position: 'absolute',
                      top: 1,
                      bottom: 1,
                      left,
                      width,
                      background: c.pct > 0 ? depthTint(c.depth) : c.pct < 0 ? PREMIUM_TINT : undefined,
                      borderRadius: 2,
                      boxShadow: isDeepest ? `inset 0 0 0 1.5px ${color.ink}` : undefined,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: color.ink,
                      ...cellText,
                    }}
                  >
                    {showNum ? fmtPct(c.pct) : ''}
                    {c.offerNote && (
                      <span
                        title={c.offerNote}
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 2,
                          width: 4,
                          height: 4,
                          borderRadius: radius.pill,
                          background: color.warning,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
