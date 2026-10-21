// ============================================================
// 第118轮（2026-10-21 评审）量价看板 · 大盘分析卡：
// ① 档位 × 品牌 100% 堆叠柱——横轴 = 价格档位（分国 tier_by_country，产业阶梯序），
//   纵轴各档拉齐到 100%，堆叠构成 = 各品牌占比（品牌色，自有品牌置底）；
//   时间 = 窗口内任选一期（默认最新一期），悬停分段出 品牌/台数/占比 明细。
// ② 大盘环比贡献拆解（图底）——选中期 vs 上一期的台数变化，按价格档位分组，
//   行 = 品牌（默认）/ 产品（可切换下钻）；正向拉动向右（蓝）、拖累向左（红），
//   行按变化量降序；顶部给 大盘环比合计 + 拉动最大 / 拖累最大。
// 销量口径 = dataModel/volume（估算，台），不随平台/币种变化（见卡底脚注）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { ConfigProvider, Segmented, Select } from 'antd';
import BrandDot from '../../components/BrandMark';
import { filterBarTheme } from '../../components/FilterBar';
import { ownBrand } from '../../components/ProductCascader/tree';
import { dimProduct } from '../../data';
import type { Bucket } from '../../chart/PriceTrend/helpers';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';
import type { Granularity, Industry } from '../../dataModel/types';
import { TIER_LABELS, tierOrderOf } from '../../dataModel/aggregate';
import { volumeByBuckets } from '../../dataModel/volume';
import {
  contributionRows,
  fmtSignedInt,
  marketBrandOrder,
  marketConfigs,
  marketKeyOf,
  tierStructure,
  type MarketGranule,
} from '../../dataModel/market';
import { brandColorOf, color, fontSize, radius } from '../../theme/tokens';

/** 容器实宽（堆叠柱随卡片宽度自适应） */
function useContainerWidth(): [MutableRefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 桶时间文案：周 = MM-DD（不带周号）/ 月 = YYYY-MM / 季 = YYYYQn */
function bucketLabel(g: Granularity, b: Bucket): string {
  if (g === 'week') return b.xLabel;
  if (g === 'month' && /^\d{6}$/.test(b.id)) return `${b.id.slice(0, 4)}-${b.id.slice(4)}`;
  return b.id;
}

/** 档位列标签：'200-400' → '200~400'，1000+ → 1K+（与价格看板 Y 轴档位带同语言） */
function tierColLabel(code: string): string {
  return tierLabelShort(code.replace('-', '~'));
}

const CHART_H = 236;
const PAD_L = 42;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 28;

interface TipState {
  x: number;
  y: number;
  brand: string;
  vol: number;
  share: number;
  tier: string;
}

export default function MarketBoard(props: {
  cc: string;
  industry: Industry;
  granularity: Granularity;
  /** 全量桶（数据范围）与当前查看窗口下标：大盘时间 = 窗口内任选一期 */
  buckets: Bucket[];
  winS: number;
  winE: number;
}) {
  const { cc, industry, granularity, buckets, winS, winE } = props;
  const [selIdxState, setSelIdx] = useState<number>(winE);
  const [granule, setGranule] = useState<MarketGranule>('brand');
  const [boxRef, width] = useContainerWidth();
  const [tip, setTip] = useState<TipState | null>(null); // 悬停分段明细（容器坐标）

  // 窗口/粒度变化 → 选中期回默认（窗口最新一期）
  useEffect(() => {
    setSelIdx(winE);
  }, [winS, winE, granularity]);

  const selIdx = Math.min(Math.max(selIdxState, winS), Math.max(winS, winE));
  const prevIdx = selIdx - 1; // 全量桶上一期（窗口首期也有环比）
  const selId = buckets[selIdx]?.id ?? null;
  const prevId = prevIdx >= 0 ? buckets[prevIdx]?.id ?? null : null;

  const configs = useMemo(() => marketConfigs(dimProduct, cc, industry), [cc, industry]);

  const { prevVol, selVol } = useMemo(() => {
    const prevM = new Map<string, number | null>();
    const selM = new Map<string, number | null>();
    if (!selId) return { prevVol: prevM, selVol: selM };
    const ids = prevId ? [prevId, selId] : [selId];
    for (const c of configs) {
      const vs = volumeByBuckets(c.modelId, c.romram, cc, granularity, ids);
      prevM.set(marketKeyOf(c), prevId ? vs[0] : null);
      selM.set(marketKeyOf(c), vs[vs.length - 1]);
    }
    return { prevVol: prevM, selVol: selM };
  }, [configs, cc, granularity, selId, prevId]);

  const brandOrder = useMemo(() => marketBrandOrder(configs, selVol, ownBrand()), [configs, selVol]);
  const stack = useMemo(
    () => tierStructure(configs, selVol, tierOrderOf(industry), brandOrder),
    [configs, selVol, industry, brandOrder],
  );
  const breakdown = useMemo(
    () => contributionRows(configs, prevVol, selVol, granule),
    [configs, prevVol, selVol, granule],
  );
  /** 档位分组的贡献行（按产业阶梯序） */
  const rowsByTier = useMemo(() => {
    const order = tierOrderOf(industry);
    const m = new Map<string, typeof breakdown.rows>();
    for (const r of breakdown.rows) {
      const arr = m.get(r.tierCode) ?? [];
      arr.push(r);
      m.set(r.tierCode, arr);
    }
    return order.filter((t) => m.has(t)).map((t) => ({ tierCode: t, rows: m.get(t)! }));
  }, [breakdown.rows, industry]);

  if (buckets.length === 0 || winE < winS || !selId) return null;

  const winBuckets = buckets.slice(winS, winE + 1);
  const selBucket = buckets[selIdx];
  const prevBucket = prevIdx >= 0 ? buckets[prevIdx] : null;

  // ---- 堆叠柱几何 ----
  const plotW = Math.max(80, width - PAD_L - PAD_R);
  const plotH = CHART_H - PAD_T - PAD_B;
  const colW = stack.length > 0 ? plotW / stack.length : plotW;
  const barW = Math.min(56, colW * 0.56);
  const maxAbs = Math.max(1, ...breakdown.rows.map((r) => Math.abs(r.delta)));
  const bestPull = breakdown.rows.reduce<(typeof breakdown.rows)[number] | null>(
    (acc, r) => (acc == null || r.delta > acc.delta ? r : acc),
    null,
  );
  const bestDrag = breakdown.rows.reduce<(typeof breakdown.rows)[number] | null>(
    (acc, r) => (acc == null || r.delta < acc.delta ? r : acc),
    null,
  );

  return (
    <div>
      {/* 工具行：标题 + 大盘时间选择（窗口内任选一期） */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: color.ink }}>大盘分析</span>
        <span style={{ fontSize: 11, color: color.mute }}>各价格档位的品牌构成（占比拉齐到 100%）</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}>时间</span>
          <ConfigProvider theme={filterBarTheme}>
            <Select
              size="small"
              aria-label="大盘时间"
              value={selId}
              onChange={(id: string) => {
                const i = buckets.findIndex((b) => b.id === id);
                if (i >= winS && i <= winE) setSelIdx(i);
              }}
              options={winBuckets.map((b) => ({ value: b.id, label: bucketLabel(granularity, b) }))}
              style={{ width: 108 }}
            />
          </ConfigProvider>
        </span>
      </div>

      {/* 堆叠柱：横轴价格档位，各档 100% 拉齐，分段 = 品牌占比（自有品牌置底） */}
      <div ref={boxRef} style={{ position: 'relative' }}>
        {stack.length === 0 ? (
          <div style={{ height: CHART_H, display: 'grid', placeItems: 'center', fontSize: fontSize.bodySm, color: color.mute }}>
            该时间无大盘销量数据
          </div>
        ) : (
          <>
            <svg width={width} height={CHART_H} role="img" aria-label="各价格档位品牌构成" style={{ display: 'block' }}>
              {/* 0/25/50/75/100% 网格线与左侧刻度 */}
              {[0, 25, 50, 75, 100].map((p) => {
                const y = PAD_T + plotH - (p / 100) * plotH;
                return (
                  <g key={p}>
                    <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke={p === 0 ? color.hairlineStrong : color.hairline} strokeWidth={1} />
                    <text x={PAD_L - 6} y={y + 3.5} textAnchor="end" fontSize={9} fill={color.mute} className="tnum">
                      {p}%
                    </text>
                  </g>
                );
              })}
              {/* 档位柱：分段自下而上按品牌序堆叠 */}
              {stack.map((t, ti) => {
                const cx = PAD_L + colW * (ti + 0.5);
                let acc = 0;
                return (
                  <g key={t.tierCode}>
                    {t.byBrand.map((b) => {
                      const h = (b.vol / t.total) * plotH;
                      const y = PAD_T + plotH - acc - h;
                      acc += h;
                      const lit = tip == null || tip.brand === b.brand;
                      return (
                        <rect
                          key={b.brand}
                          x={cx - barW / 2}
                          y={y}
                          width={barW}
                          height={Math.max(1, h - 0.5)}
                          fill={brandColorOf(b.brand)}
                          opacity={lit ? 0.86 : 0.3}
                          style={{ pointerEvents: 'auto', cursor: 'default', transition: 'opacity 160ms ease' }}
                          onMouseMove={(e) => {
                            const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                            const rect = svg.getBoundingClientRect();
                            setTip({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                              brand: b.brand,
                              vol: b.vol,
                              share: b.vol / t.total,
                              tier: t.tierCode,
                            });
                          }}
                          onMouseLeave={() => setTip(null)}
                        />
                      );
                    })}
                    <text x={cx} y={CHART_H - 8} textAnchor="middle" fontSize={10.5} fill={color.body} className="tnum">
                      {tierColLabel(t.tierCode)}
                    </text>
                  </g>
                );
              })}
            </svg>
            {/* 悬停分段明细 */}
            {tip && (
              <div
                style={{
                  position: 'absolute',
                  left: Math.min(Math.max(tip.x + 12, 4), Math.max(4, width - 196)),
                  top: Math.max(4, tip.y - 58),
                  zIndex: 5,
                  pointerEvents: 'none',
                  background: color.canvas,
                  border: `1px solid ${color.hairline}`,
                  borderRadius: radius.card,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  padding: '6px 10px',
                  minWidth: 150,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: color.ink }}>
                  <BrandDot brand={tip.brand} />
                  {tip.brand}
                </div>
                <div className="tnum" style={{ marginTop: 2, fontSize: 11.5, color: color.body }}>
                  {tip.vol.toLocaleString('en-US')} 台 · 占该档 {(tip.share * 100).toFixed(1)}%
                </div>
                <div className="tnum" style={{ fontSize: 11, color: color.mute }}>
                  档位 {tierColLabel(tip.tier)}
                </div>
              </div>
            )}
            {/* 品牌图例（与堆叠序一致） */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 14px', padding: '2px 2px 0' }}>
              {brandOrder.map((b) => (
                <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: color.body }}>
                  <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: brandColorOf(b) }} />
                  {b}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 大盘环比贡献拆解：by 价格档位的品牌/产品台数变化（默认品牌粒度，可下钻产品） */}
      <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${color.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: color.ink }}>大盘环比贡献拆解</span>
          {prevBucket && selBucket && (
            <span className="tnum" style={{ fontSize: 12, color: color.body, whiteSpace: 'nowrap' }}>
              {bucketLabel(granularity, prevBucket)} → {bucketLabel(granularity, selBucket)}
            </span>
          )}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}>粒度</span>
            <Segmented
              size="small"
              value={granule}
              onChange={(v) => setGranule(v as MarketGranule)}
              options={[
                { label: '品牌', value: 'brand' },
                { label: '产品', value: 'product' },
              ]}
            />
          </span>
        </div>
        {/* 合计 + 最大拉动/拖累（行内彩色读数） */}
        {prevId != null && breakdown.rows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 8, fontSize: 12, color: color.body }}>
            <span>
              大盘环比
              <span
                className="tnum"
                style={{ fontWeight: 700, marginLeft: 6, color: breakdown.total > 0 ? color.link : breakdown.total < 0 ? color.error : color.body }}
              >
                {fmtSignedInt(breakdown.total)}
              </span>
              <span style={{ color: color.mute }}> 台</span>
            </span>
            {bestPull && bestPull.delta > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: color.mute }}>拉动最大</span>
                <BrandDot brand={bestPull.brand} />
                <span style={{ color: color.ink }}>{bestPull.label}</span>
                <span className="tnum" style={{ fontWeight: 600, color: color.link }}>{fmtSignedInt(bestPull.delta)}</span>
              </span>
            )}
            {bestDrag && bestDrag.delta < 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: color.mute }}>拖累最大</span>
                <BrandDot brand={bestDrag.brand} />
                <span style={{ color: color.ink }}>{bestDrag.label}</span>
                <span className="tnum" style={{ fontWeight: 600, color: color.error }}>{fmtSignedInt(bestDrag.delta)}</span>
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color.link }} />
              <span style={{ color: color.mute }}>拉动</span>
              <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color.error }} />
              <span style={{ color: color.mute }}>拖累</span>
            </span>
          </div>
        )}
        {prevId == null ? (
          <div style={{ padding: '8px 2px', fontSize: 12, color: color.mute }}>已是数据起点，无上一期可比较</div>
        ) : breakdown.rows.length === 0 ? (
          <div style={{ padding: '8px 2px', fontSize: 12, color: color.mute }}>该期环比无变化</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rowsByTier.map(({ tierCode, rows }) => {
              const tierDelta = rows.reduce((acc, r) => acc + r.delta, 0);
              return (
                <div key={tierCode}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: color.body }}>
                      {TIER_LABELS[tierCode] ?? tierColLabel(tierCode)}
                    </span>
                    <span className="tnum" style={{ fontSize: 11, color: color.mute }}>
                      合计 <span style={{ color: tierDelta > 0 ? color.link : tierDelta < 0 ? color.error : color.body, fontWeight: 600 }}>{fmtSignedInt(tierDelta)}</span> 台
                    </span>
                  </div>
                  {rows.map((r) => {
                    const w = (Math.abs(r.delta) / maxAbs) * 50;
                    const pos = r.delta > 0;
                    return (
                      <div
                        key={r.key}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(170px, 250px) 1fr 62px',
                          alignItems: 'center',
                          gap: 10,
                          padding: '2px 0',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <BrandDot brand={r.brand} />
                          <span title={r.label} style={{ fontSize: 12, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.label}
                          </span>
                        </span>
                        {/* 双向条：中轴 = 0，右 = 拉动（蓝）/ 左 = 拖累（红） */}
                        <div style={{ position: 'relative', height: 14 }}>
                          <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: color.hairline }} />
                          <div
                            style={{
                              position: 'absolute',
                              top: 1,
                              height: 12,
                              borderRadius: 2,
                              ...(pos
                                ? { left: '50%', width: `${w}%`, background: hexToRgba(color.link, 0.85) }
                                : { right: '50%', width: `${w}%`, background: hexToRgba(color.error, 0.8) }),
                            }}
                          />
                        </div>
                        <span
                          className="tnum"
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: 'right',
                            color: pos ? color.link : color.error,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {fmtSignedInt(r.delta)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: color.mute }}>
        销量为估算口径：按折扣深度、促销档期与上市周期推算，接入销量数据后自动替换；档位按产品在各国的声明档位归属。
      </div>
    </div>
  );
}
