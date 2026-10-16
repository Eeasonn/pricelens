// ============================================================
// 促销力度明细抽屉（第五十六轮）：原「促销热力带」（图下横向色格带，与时间轴
// 逐像素对齐）整体收进二级抽屉 —— 领导对页面清洁要求高，热力带不是主要信息，
// 不再出现在主视觉；同时摆脱「必须横向对齐时间轴」的形态约束，改为纵向排布：
// 行 = 时间桶（最新在上，向下滚动看历史），列 = 产品（品牌点 + 短名 + 上市价），
// 格 = 折后价相对上市价的降幅%（浅蓝着色，越深促销越深；溢价 = 琥珀）。
// 入口 = 图顶工具行「⋯ 更多」二级菜单（ChartToolbar）；数据与原 PromoTable
// 同源（visSeries / 分离模式 = 面板并集），随图表窗口联动，零新增取数。
// 边界口径不变：无值且锚日早于上市日 = 未上市（—）；其后 = 缺采/退市（n/a 浅灰）；
// 每列窗口内最深降幅格描边标出；offer 权益角标点 + 悬停 tooltip 保留。
// ============================================================
import { useMemo } from 'react';
import { Drawer } from 'antd';
import type { CurrencyMode, Granularity, Series } from '../../dataModel/types';
import { launchInfoOf } from '../../dataModel/aggregate';
import BrandDot from '../../components/BrandMark';
import { color, font, fontSize, formatPrice, radius } from '../../theme/tokens';
import { offerSummary, curveNameOf } from './chartModel';

/** 降幅分档底色（浅蓝 → 深蓝；上限档兜底）+ 溢价琥珀（自原 PromoTable 迁入） */
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

interface Col {
  key: string;
  label: string;
  brand: string;
  isOwn: boolean;
  launch: number | null;
  cells: Cell[];
  /** 窗口内最深降幅（>0 才有意义；全溢价/无数据为 null） */
  deepest: { pct: number; idx: number } | null;
}

/** 行标签：周=YYYY-MM-DD（跨年周序列 MM-DD 有歧义）/ 月=YYYY-MM / 季=YYYYQn */
function rowLabelOf(gran: Granularity, s: Series, i: number): string {
  const p = s.points[i];
  if (!p) return '';
  if (gran === 'week') return p.anchorDate;
  if (gran === 'month') return p.xLabel.replace(/^(\d{4})(\d{2})$/, '$1-$2');
  return p.xLabel;
}

const ROW_H = 26;

export default function PromoDrawer(props: {
  open: boolean;
  onClose: () => void;
  series: Series[];
  currency: CurrencyMode;
  granularity: Granularity;
}) {
  const { series, currency, granularity } = props;

  // 列 = 产品（与图例同序）；行数以首列桶数为准（各系列同窗口同桶数）
  const cols = useMemo<Col[]>(
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
        let deepest: Col['deepest'] = null;
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          if (c.kind === 'val' && c.pct > 0 && (deepest == null || c.pct > deepest.pct)) {
            deepest = { pct: c.pct, idx: i };
          }
        }
        return { key: s.key, label: s.label, brand: s.brand, isOwn: s.isOwn, launch, cells, deepest };
      }),
    [series, currency],
  );

  const n = series[0]?.points.length ?? 0;
  // 行序倒排：最新在最上（明细/事件流口径），向下滚动 = 回溯历史
  const rowIdx = n > 0 ? Array.from({ length: n }, (_, i) => n - 1 - i) : [];

  const fmtPct = (pct: number): string =>
    pct > 0 ? `\u2212${pct}%` : pct < 0 ? `+${Math.abs(pct)}%` : '0%';

  const cellText = {
    fontSize: 10.5,
    fontFamily: font.family,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  } as const;

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      width={Math.min(760, window.innerWidth - 48)}
      title={<span style={{ fontSize: 15, fontWeight: 600 }}>促销力度明细</span>}
      styles={{ body: { padding: '12px 20px 20px' } }}
    >
      {/* 口径 + 色阶图例（与原热力带同文案口径） */}
      <div style={{ fontSize: fontSize.caption, color: color.mute, lineHeight: '18px' }}>
        折后价相对上市价的降幅 · 行 = 时间（最新在上）· 列 = 产品 · 随图表窗口联动
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          margin: '8px 0 12px',
          fontSize: fontSize.caption,
          color: color.mute,
        }}
      >
        {[
          ...DEPTH_TINTS.map(([t, c], i) => ({
            c,
            t: i === DEPTH_TINTS.length - 1 ? '>20%' : i === 0 ? '≤5%' : `${t}%`,
          })),
          { c: PREMIUM_TINT, t: '溢价' },
          { c: MISS_TINT, t: '缺采/退市' },
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
        <span>描边格 = 窗口内最深 · — = 未上市</span>
      </div>

      {cols.length === 0 || n === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', fontSize: fontSize.bodySm, color: color.mute }}>
          当前窗口无数据
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              borderCollapse: 'separate',
              borderSpacing: 0,
              tableLayout: 'fixed',
              width: '100%',
              minWidth: 92 + cols.length * 68,
              fontFamily: font.family,
            }}
          >
            <colgroup>
              <col style={{ width: 92 }} />
              {cols.map((c) => (
                <col key={c.key} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: color.canvas,
                    textAlign: 'left',
                    fontWeight: 400,
                    fontSize: fontSize.caption,
                    color: color.mute,
                    padding: '0 8px 6px 0',
                    borderBottom: `1px solid ${color.hairline}`,
                  }}
                >
                  时间
                </th>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    title={c.label}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 2,
                      background: color.canvas,
                      padding: '0 4px 6px',
                      borderBottom: `1px solid ${color.hairline}`,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <BrandDot brand={c.brand} />
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: c.isOwn ? 600 : 400,
                          color: c.isOwn ? color.ink : color.body,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {curveNameOf(series.find((s) => s.key === c.key)!)}
                      </span>
                    </div>
                    <div
                      className="tnum"
                      title="上市价（促销力度基线）"
                      style={{ fontSize: 10, color: color.mute, textAlign: 'left', marginTop: 1 }}
                    >
                      上市 {c.launch != null ? formatPrice(c.launch, currency) : '—'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowIdx.map((i) => (
                <tr key={i}>
                  <td
                    className="tnum"
                    style={{
                      fontSize: 11,
                      color: color.mute,
                      padding: '0 8px 0 0',
                      height: ROW_H,
                      borderBottom: `1px solid ${color.hairline}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {rowLabelOf(granularity, series[0], i)}
                  </td>
                  {cols.map((c) => {
                    const cell = c.cells[i];
                    if (cell.kind === 'pre') {
                      return (
                        <td key={c.key} style={{ borderBottom: `1px solid ${color.hairline}`, padding: '3px 2px' }}>
                          <div
                            title="未上市"
                            style={{
                              height: ROW_H - 7,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: color.hairlineStrong,
                              ...cellText,
                            }}
                          >
                            —
                          </div>
                        </td>
                      );
                    }
                    if (cell.kind === 'miss') {
                      return (
                        <td key={c.key} style={{ borderBottom: `1px solid ${color.hairline}`, padding: '3px 2px' }}>
                          <div
                            title={cell.eol ? '已退市' : '该周缺采'}
                            style={{
                              height: ROW_H - 7,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: MISS_TINT,
                              borderRadius: 2,
                              color: color.hairlineStrong,
                              ...cellText,
                            }}
                          >
                            n/a
                          </div>
                        </td>
                      );
                    }
                    const isDeepest = c.deepest?.idx === i;
                    return (
                      <td key={c.key} style={{ borderBottom: `1px solid ${color.hairline}`, padding: '3px 2px' }}>
                        <div
                          title={`折后价 ${formatPrice(cell.price, currency)} · 上市价 ${c.launch != null ? formatPrice(c.launch, currency) : '—'}（促销力度 ${(cell.depth * 100).toFixed(1)}%）${cell.offerNote ? ` · offer：${cell.offerNote}` : ''}`}
                          style={{
                            height: ROW_H - 7,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: cell.pct > 0 ? depthTint(cell.depth) : cell.pct < 0 ? PREMIUM_TINT : undefined,
                            borderRadius: 2,
                            boxShadow: isDeepest ? `inset 0 0 0 1.5px ${color.ink}` : undefined,
                            color: color.ink,
                            position: 'relative',
                            ...cellText,
                          }}
                        >
                          {fmtPct(cell.pct)}
                          {cell.offerNote && (
                            <span
                              title={cell.offerNote}
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
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}
