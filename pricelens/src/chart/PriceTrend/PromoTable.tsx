// ============================================================
// 促销力度矩阵表（第三轮新增，位于 X 刷选条之下）：
// 行 = 当前图上产品（与图例同序），列 = 所选窗口内每个时间节点，
// 单元格 = 折后价相对上市价的降幅%（浅蓝着色，颜色越深促销越深；
// 高于上市价 = 溢价，琥珀底 + 正号）。
// 数据完全复用图表的 visSeries（同一 buildSeries / 窗口切片 / 汇总口径），零新增取数；
// 上市基线来自 dim_product.launch_price（同型号+ROMRAM 各颜色造数一致，launchInfoOf 直取）。
// 边界：无值且节点锚日早于 launch_date → 未上市 "—"；无值且在其后 → 缺采 "n/a"（悬停注明）；
// 月/季桶锚日早于上市日但桶内已有价 → 照常显示（与图上的点一致）；
// 退市清库期有价照常显示（正是促销最深处）；当周有 offer 时格子右上角琥珀点。
// 列多时横向滚动，产品/上市价两列 sticky 冻结。
// ============================================================
import { useMemo, type CSSProperties } from 'react';
import type { CurrencyMode, Series } from '../../dataModel/types';
import { launchInfoOf } from '../../dataModel/aggregate';
import { color, font, fontSize, formatPrice, radius, space } from '../../theme/tokens';

/** 降幅分档底色（浅蓝 → 深蓝；上限档兜底） */
const DEPTH_TINTS: [number, string][] = [
  [5, '#f3f8ff'],
  [10, '#e8f1ff'],
  [15, '#d6e6ff'],
  [20, '#c0d9ff'],
  [Number.POSITIVE_INFINITY, '#a9cdff'],
];
function depthTint(depth: number): string {
  for (const [t, c] of DEPTH_TINTS) if (depth <= t / 100) return c;
  return '#a9cdff';
}

type Cell =
  | { kind: 'pre' } // 未上市
  | { kind: 'miss'; eol: boolean } // 缺采 / 已退市后无数据
  | { kind: 'val'; depth: number; pct: number; price: number; offerTitle: string | null };

interface Row {
  label: string;
  dotColor: string;
  isOwn: boolean;
  launch: number | null;
  cells: Cell[];
  /** 窗口内最深降幅（>0 才有意义；全溢价/无数据为 null） */
  deepest: { pct: number; label: string } | null;
}

export default function PromoTable({ series, currency }: { series: Series[]; currency: CurrencyMode }) {
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
          return { kind: 'val', depth, pct: Math.round(depth * 100), price: p.price, offerTitle: p.offer?.title ?? null };
        });
        let deepest: Row['deepest'] = null;
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          if (c.kind === 'val' && c.pct > 0 && (deepest == null || c.pct > deepest.pct)) {
            deepest = { pct: c.pct, label: s.points[i].xLabel };
          }
        }
        return { label: s.label, dotColor: s.color, isOwn: s.isOwn, launch, cells, deepest };
      }),
    [series, currency],
  );

  const cols = series[0]?.points ?? [];
  if (rows.length === 0 || cols.length === 0) return null;

  const fmtPct = (pct: number): string =>
    pct > 0 ? `\u2212${pct}%` : pct < 0 ? `+${Math.abs(pct)}%` : '0%';

  const stickyBase: CSSProperties = {
    position: 'sticky',
    background: color.canvas,
    zIndex: 1,
    boxShadow: `inset -1px 0 0 ${color.hairline}`,
  };

  const headCell: CSSProperties = {
    boxSizing: 'border-box', // 覆盖全局 content-box：width 才含 padding，fixed 布局列宽与 sticky 偏移精确一致
    padding: '6px 8px',
    fontSize: 10,
    fontFamily: font.mono,
    fontWeight: 400,
    color: color.mute,
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${color.hairlineStrong}`,
  };

  const cellBase: CSSProperties = {
    boxSizing: 'border-box',
    padding: '5px 8px',
    height: 30,
    textAlign: 'right',
    fontFamily: font.mono,
    fontSize: fontSize.caption,
    fontVariantNumeric: 'tabular-nums',
    color: color.ink,
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${color.hairline}`,
  };

  return (
    <div style={{ marginTop: space.md, paddingTop: space.base, borderTop: `1px solid ${color.hairline}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md, marginBottom: space.sm }}>
        <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>促销力度</span>
        <span style={{ fontSize: fontSize.caption, color: color.mute }}>
          折后价相对上市价的降幅 · 窗口 {cols.length} 个时间节点 · 悬停看折后价
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        {/* tableLayout fixed：列宽严格按表头声明，sticky 偏移（left: 236）才精确成立 */}
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: 236 + 100 + cols.length * 64 + 116 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, ...stickyBase, left: 0, width: 236, textAlign: 'left', fontFamily: font.family, fontSize: fontSize.caption }}>产品</th>
              <th style={{ ...headCell, ...stickyBase, left: 236, width: 100 }}>上市价</th>
              {cols.map((p) => (
                <th key={p.bucketId} style={{ ...headCell, width: 64 }} title={p.anchorDate}>
                  {p.xLabel}
                </th>
              ))}
              <th style={{ ...headCell, width: 116, borderLeft: `1px solid ${color.hairline}` }}>窗口内最深</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td
                  title={r.label}
                  style={{
                    ...cellBase,
                    ...stickyBase,
                    left: 0,
                    maxWidth: 236,
                    textAlign: 'left',
                    fontFamily: font.family,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: r.isOwn ? 600 : 400,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: radius.pill, background: r.dotColor, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                  </span>
                </td>
                <td style={{ ...cellBase, ...stickyBase, left: 236, width: 100, color: color.body }} title="上市时点官方价（促销力度基线）">
                  {r.launch != null ? formatPrice(r.launch, currency) : '—'}
                </td>
                {r.cells.map((c, i) => {
                  if (c.kind === 'pre') {
                    return (
                      <td key={cols[i].bucketId} style={{ ...cellBase, color: color.hairlineStrong }} title="未上市">
                        —
                      </td>
                    );
                  }
                  if (c.kind === 'miss') {
                    return (
                      <td key={cols[i].bucketId} style={{ ...cellBase, color: color.hairlineStrong }} title={c.eol ? '已退市' : '该周缺采'}>
                        n/a
                      </td>
                    );
                  }
                  return (
                    <td
                      key={cols[i].bucketId}
                      style={{
                        ...cellBase,
                        position: 'relative',
                        background: c.pct > 0 ? depthTint(c.depth) : c.pct < 0 ? '#ffefcf' : undefined,
                      }}
                      title={`折后价 ${formatPrice(c.price, currency)} · 上市价 ${r.launch != null ? formatPrice(r.launch, currency) : '—'}（促销力度 ${(c.depth * 100).toFixed(1)}%）${c.offerTitle ? ` · offer：${c.offerTitle}` : ''}`}
                    >
                      {fmtPct(c.pct)}
                      {c.offerTitle && (
                        <span
                          title={c.offerTitle}
                          style={{ position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: radius.pill, background: color.warning }}
                        />
                      )}
                    </td>
                  );
                })}
                <td
                  style={{ ...cellBase, borderLeft: `1px solid ${color.hairline}`, color: r.deepest ? color.ink : color.hairlineStrong }}
                  title={r.deepest ? `窗口内最深降幅 ${r.deepest.pct}%（${r.deepest.label}）` : '窗口内无促销'}
                >
                  {r.deepest ? `${fmtPct(r.deepest.pct)} · ${r.deepest.label}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
