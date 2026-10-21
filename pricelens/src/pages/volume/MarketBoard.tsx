// ============================================================
// 第一百二十三轮（2026-10-22 走查会重做）量价看板 · 大盘分析卡：
// ① 档位分布柱——横轴 = 各价格档位（产业阶梯序低→高，只画当前期有销量的
//   档位，全量直出），柱高 = 该档大盘总销量（绝对台数，niceCeil 刻度 +
//   5 道网格线），柱内堆叠 = 品牌构成（品牌色分段，自有品牌置底，悬停分段
//   出 品牌/台数/占该档比例）。
//   点击柱子 = 选中该档位（选中柱描边高亮 + 列底衬带），与卡头「档位」选择
//   双向同步（档位必选，无「全部档位」）；默认选中 = 当前期销量最大的档位，
//   国家/产业/当前期变化后原档位不再有数据时自动回落到销量最大者。
// ② 卡头「时间」选择——当前期默认 = 查看范围最新一期（范围/粒度变化回最新），
//   大盘图与贡献拆解都随它取数。
// ③ 大盘环比贡献拆解（图底）——只看选中档位：当前期 vs 上一期的台数变化，
//   行 = 品牌，按 Δ 降序（拉动最上、拖累最下）；点击品牌行行内展开该品牌在
//   该档位下的各产品（型号+配置）Δ 子行（缩进小字、Δ 降序），再点收起，可多
//   品牌同时展开，切换档位/当前期收起全部；顶部给 档位环比合计 + 拉动最大 /
//   拖累最大（均按所选档位计算）。
// 销量口径 = dataModel/volume（估算，台），不随平台/币种变化（见卡底脚注）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { ConfigProvider, Select } from 'antd';
import BrandDot from '../../components/BrandMark';
import { filterBarTheme } from '../../components/FilterBar';
import { ownBrand } from '../../components/ProductCascader/tree';
import { dimProduct } from '../../data';
import { bucketAnchorDate, fmtInt, tierLabelShort, type Bucket } from '../../chart/PriceTrend/helpers';
import type { Granularity, Industry } from '../../dataModel/types';
import { TIER_LABELS, tierOrderOf } from '../../dataModel/aggregate';
import { niceCeil, volumeByBuckets } from '../../dataModel/volume';
import {
  brandContribution,
  fmtSignedInt,
  marketBrandOrder,
  marketConfigs,
  marketKeyOf,
  tierStructure,
  type BrandContributionRow,
} from '../../dataModel/market';
import { brandColorOf, color, fontSize, radius, selectSoft } from '../../theme/tokens';

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

/** 卡头副标题里的当前期：周 = 锚日 YYYY-MM-DD（句中日期要带年份，可读优先）/ 月季同 bucketLabel */
function periodTitle(g: Granularity, b: Bucket): string {
  if (g === 'week') return bucketAnchorDate(g, b.id) ?? b.xLabel;
  return bucketLabel(g, b);
}

/** 档位列标签：'200-400' → '200~400'，1000+ → 1K+（与价格看板 Y 轴档位带同语言） */
function tierColLabel(code: string): string {
  return tierLabelShort(code.replace('-', '~'));
}

const CHART_H = 236;
const PAD_L = 48; // 左侧台数刻度（千分位最宽 ~7 字符）
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 22; // 容纳档位标签单行

interface TipState {
  x: number;
  y: number;
  brand: string;
  vol: number;
  share: number; // 占该档大盘比例
  tier: string; // 档位文案
}

/** 拆解双向条：中轴 = 0，右 = 拉动（蓝）/ 左 = 拖累（红）；宽 = |Δ| / maxAbs
 *  （maxAbs 覆盖品牌行与产品子行，展开收起不换比例尺）；thin = 产品子行的细条 */
function BiBar({ delta, maxAbs, thin = false }: { delta: number; maxAbs: number; thin?: boolean }) {
  const w = (Math.abs(delta) / maxAbs) * 50;
  const pos = delta > 0;
  return (
    <div style={{ position: 'relative', height: 14 }}>
      <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: color.hairline }} />
      <div
        style={{
          position: 'absolute',
          top: thin ? 2 : 1,
          height: thin ? 10 : 12,
          borderRadius: 2,
          ...(pos
            ? { left: '50%', width: `${w}%`, background: hexToRgba(color.link, 0.85) }
            : { right: '50%', width: `${w}%`, background: hexToRgba(color.error, 0.8) }),
        }}
      />
    </div>
  );
}

/** 拆解行外壳：与品牌行/产品子行同栅格（标签 | 双向条 | 读数 | 箭头位），
 *  悬停行底浅蓝（selectSoft）；onClick 供品牌行展开/收起 */
function RowShell({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(170px, 250px) 1fr 62px 16px',
        alignItems: 'center',
        gap: 10,
        padding: '3px 6px',
        borderRadius: radius.control,
        background: hover ? selectSoft : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  );
}

export default function MarketBoard(props: {
  cc: string;
  industry: Industry;
  granularity: Granularity;
  /** 全量桶（数据范围）与当前查看范围下标：当前期默认 = 范围最新一期 */
  buckets: Bucket[];
  winS: number;
  winE: number;
}) {
  const { cc, industry, granularity, buckets, winS, winE } = props;
  const [selIdxState, setSelIdx] = useState<number>(winE);
  const [selTier, setSelTier] = useState<string | null>(null); // 档位必选；null = 尚未选择（渲染期回落到销量最大档）
  const [expandedBrands, setExpandedBrands] = useState<string[]>([]); // 行内展开产品明细的品牌
  const [boxRef, width] = useContainerWidth();
  const [tip, setTip] = useState<TipState | null>(null); // 悬停分段明细（容器坐标）

  // 范围/粒度变化 → 当前期回默认（范围最新一期）
  useEffect(() => {
    setSelIdx(winE);
  }, [winS, winE, granularity]);

  const selIdx = Math.min(Math.max(selIdxState, winS), Math.max(winS, winE));
  const prevIdx = selIdx - 1; // 全量桶上一期（范围首期也有环比）
  const selId = buckets[selIdx]?.id ?? null;
  const prevId = prevIdx >= 0 ? buckets[prevIdx]?.id ?? null : null;

  const configs = useMemo(() => marketConfigs(dimProduct, cc, industry), [cc, industry]);

  // 当前期/上一期两期取数（全量配置；档位过滤在纯函数层做，切档位不重新取数）
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

  /** 当前期各档位结构（产业阶梯序，只含有销量的档位）= 大盘图横轴与档位选项 */
  const structures = useMemo(
    () => tierStructure(configs, selVol, tierOrderOf(industry), brandOrder),
    [configs, selVol, industry, brandOrder],
  );

  /** 有效选中档位：原档位该期无数据（或尚未选择）→ 回落到销量最大者（阶梯序先到先得） */
  const selTierEff = useMemo(() => {
    if (selTier != null && structures.some((s) => s.tierCode === selTier)) return selTier;
    let best: string | null = null;
    let bestV = -1;
    for (const s of structures) {
      if (s.total > bestV) {
        bestV = s.total;
        best = s.tierCode;
      }
    }
    return best;
  }, [selTier, structures]);

  // 档位/当前期（或国家/产业）变化 → 收起全部展开的品牌行
  useEffect(() => {
    setExpandedBrands([]);
  }, [selTierEff, selIdx, cc, industry]);

  /** 选中档位的品牌贡献行（Δ 降序，各品牌带产品子行） */
  const breakdown = useMemo(
    () => (selTierEff == null ? { rows: [] as BrandContributionRow[], total: 0 } : brandContribution(configs, prevVol, selVol, selTierEff)),
    [configs, prevVol, selVol, selTierEff],
  );

  if (buckets.length === 0 || winE < winS || !selId) return null;

  const selBucket = buckets[selIdx];
  const prevBucket = prevIdx >= 0 ? buckets[prevIdx] : null;
  const winBuckets = buckets.slice(winS, winE + 1);
  const tierText = (t: string): string => TIER_LABELS[t] ?? tierColLabel(t);

  // ---- 档位柱几何 ----
  const n = structures.length;
  const plotW = Math.max(80, width - PAD_L - PAD_R);
  const plotH = CHART_H - PAD_T - PAD_B;
  const colW = n > 0 ? plotW / n : plotW;
  const barW = Math.min(64, colW * 0.55);
  // Y 轴 = 台数：niceCeil 上限，4 等分 5 道网格线（上限不被 4 整除时改 5 等分，保持整数步长）
  const cap = niceCeil(Math.max(1, ...structures.map((s) => s.total)));
  const yStep = cap % 4 === 0 ? cap / 4 : cap % 5 === 0 ? cap / 5 : Math.ceil(cap / 4);
  const yMax = yStep * 4;
  const yOf = (v: number): number => PAD_T + plotH - (v / yMax) * plotH;
  const rows = breakdown.rows;
  const maxAbs = Math.max(
    1,
    ...rows.map((r) => Math.abs(r.delta)),
    ...rows.flatMap((r) => r.products.map((p) => Math.abs(p.delta))),
  );
  // 行已按 Δ 降序：首行 = 拉动最大，末行 = 拖累最大
  const bestPull = rows.length > 0 && rows[0].delta > 0 ? rows[0] : null;
  const bestDrag = rows.length > 0 && rows[rows.length - 1].delta < 0 ? rows[rows.length - 1] : null;

  return (
    <div>
      {/* 工具行：标题 + 档位选择（必选，与点柱双向同步）+ 当前时间选择 */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: color.ink }}>大盘分析</span>
        <span style={{ fontSize: 11, color: color.mute }}>
          {periodTitle(granularity, selBucket)} 各价格档位的大盘销量（台），堆叠 = 品牌构成
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}>档位</span>
          <ConfigProvider theme={filterBarTheme}>
            <Select
              size="small"
              aria-label="大盘档位"
              value={selTierEff ?? undefined}
              placeholder="暂无档位"
              onChange={(v: string) => setSelTier(v)}
              options={structures.map((s) => ({ value: s.tierCode, label: tierText(s.tierCode) }))}
              style={{ width: 132 }}
            />
          </ConfigProvider>
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

      {/* 档位分布柱：横轴 = 各价格档位（阶梯序），柱高 = 该档大盘台数（绝对量），分段 = 品牌构成（自有品牌置底） */}
      <div ref={boxRef} style={{ position: 'relative' }}>
        {n === 0 ? (
          <div style={{ height: CHART_H, display: 'grid', placeItems: 'center', fontSize: fontSize.bodySm, color: color.mute }}>
            暂无大盘销量数据
          </div>
        ) : (
          <>
            <svg width={width} height={CHART_H} role="img" aria-label="各价格档位大盘销量与品牌构成" style={{ display: 'block' }}>
              {/* 台数网格线（0 基线 + 4 档刻度）与左侧刻度数字 */}
              {[0, 1, 2, 3, 4].map((k) => {
                const y = PAD_T + plotH - (k / 4) * plotH;
                return (
                  <g key={k}>
                    <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke={k === 0 ? color.hairlineStrong : color.hairline} strokeWidth={1} />
                    <text x={PAD_L - 6} y={y + 3.5} textAnchor="end" fontSize={9} fill={color.mute} className="tnum">
                      {fmtInt(k * yStep)}
                    </text>
                  </g>
                );
              })}
              {/* 档位柱：点击选中该档位；柱体自下而上按品牌序堆叠（序首 = 自有 = 视觉置底） */}
              {structures.map((st, ti) => {
                const cx = PAD_L + colW * (ti + 0.5);
                const selected = st.tierCode === selTierEff;
                let acc = 0;
                return (
                  <g key={st.tierCode} style={{ cursor: 'pointer' }} onClick={() => setSelTier(st.tierCode)}>
                    {selected && (
                      <rect x={cx - colW / 2} y={PAD_T} width={colW} height={plotH + 16} fill={color.hairlineStrong} opacity={0.16} />
                    )}
                    {/* 整列点击热区（柱体上方空白与档位标签处也可选中该档） */}
                    <rect x={cx - colW / 2} y={PAD_T} width={colW} height={plotH + 16} fill="transparent" />
                    {st.byBrand.map((seg) => {
                      const h = (seg.vol / yMax) * plotH;
                      const y = PAD_T + plotH - acc - h;
                      acc += h;
                      const lit = tip == null || tip.brand === seg.brand;
                      return (
                        <rect
                          key={seg.brand}
                          x={cx - barW / 2}
                          y={y}
                          width={barW}
                          height={Math.max(1, h - 0.5)}
                          fill={brandColorOf(seg.brand)}
                          opacity={lit ? 0.86 : 0.3}
                          style={{ pointerEvents: 'auto', transition: 'opacity 160ms ease' }}
                          onMouseMove={(e) => {
                            const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                            const rect = svg.getBoundingClientRect();
                            setTip({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                              brand: seg.brand,
                              vol: seg.vol,
                              share: st.total > 0 ? seg.vol / st.total : 0,
                              tier: tierText(st.tierCode),
                            });
                          }}
                          onMouseLeave={() => setTip(null)}
                        />
                      );
                    })}
                    {/* 选中柱描边高亮 */}
                    {selected && st.total > 0 && (
                      <rect
                        x={cx - barW / 2 - 1.5}
                        y={yOf(st.total) - 1.5}
                        width={barW + 3}
                        height={PAD_T + plotH - yOf(st.total) + 1.5}
                        fill="none"
                        stroke={color.ink}
                        strokeWidth={1.2}
                        pointerEvents="none"
                      />
                    )}
                    {/* X 轴档位标签：全量直出，选中档位加重 */}
                    <text
                      x={cx}
                      y={PAD_T + plotH + 14}
                      textAnchor="middle"
                      fontSize={10.5}
                      fontWeight={selected ? 600 : 400}
                      fill={selected ? color.ink : color.body}
                      className="tnum"
                      pointerEvents="none"
                    >
                      {tierText(st.tierCode)}
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
                  档位 {tip.tier}
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

      {/* 大盘环比贡献拆解：所选档位的品牌台数变化（点击品牌行展开其产品明细） */}
      <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${color.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: color.ink }}>大盘环比贡献拆解</span>
          {selTierEff != null && (
            <span style={{ fontSize: 12, color: color.body, whiteSpace: 'nowrap' }}>档位 {tierText(selTierEff)}</span>
          )}
          {prevBucket && selBucket && (
            <span className="tnum" style={{ fontSize: 12, color: color.body, whiteSpace: 'nowrap' }}>
              {bucketLabel(granularity, prevBucket)} → {bucketLabel(granularity, selBucket)}
            </span>
          )}
        </div>
        {/* 档位环比合计 + 最大拉动/拖累（行内彩色读数，均按所选档位计算） */}
        {prevId != null && rows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 8, fontSize: 12, color: color.body }}>
            <span>
              档位环比
              <span
                className="tnum"
                style={{ fontWeight: 700, marginLeft: 6, color: breakdown.total > 0 ? color.link : breakdown.total < 0 ? color.error : color.body }}
              >
                {fmtSignedInt(breakdown.total)}
              </span>
              <span style={{ color: color.mute }}> 台</span>
            </span>
            {bestPull && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: color.mute }}>拉动最大</span>
                <BrandDot brand={bestPull.brand} />
                <span style={{ color: color.ink }}>{bestPull.brand}</span>
                <span className="tnum" style={{ fontWeight: 600, color: color.link }}>{fmtSignedInt(bestPull.delta)}</span>
              </span>
            )}
            {bestDrag && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: color.mute }}>拖累最大</span>
                <BrandDot brand={bestDrag.brand} />
                <span style={{ color: color.ink }}>{bestDrag.brand}</span>
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
        ) : selTierEff == null ? (
          <div style={{ padding: '8px 2px', fontSize: 12, color: color.mute }}>该期各档位暂无销量数据</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '8px 2px', fontSize: 12, color: color.mute }}>该档位环比无变化</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {rows.map((r) => {
              const open = expandedBrands.includes(r.brand);
              const toggle = () =>
                setExpandedBrands((cur) => (cur.includes(r.brand) ? cur.filter((b) => b !== r.brand) : [...cur, r.brand]));
              return (
                <div key={r.brand}>
                  {/* 品牌行：整行可点（悬停浅蓝），行尾箭头示意可展开产品明细 */}
                  <RowShell onClick={toggle}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <BrandDot brand={r.brand} />
                      <span title={r.brand} style={{ fontSize: 12, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.brand}
                      </span>
                    </span>
                    <BiBar delta={r.delta} maxAbs={maxAbs} />
                    <span
                      className="tnum"
                      style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: r.delta > 0 ? color.link : color.error, whiteSpace: 'nowrap' }}
                    >
                      {fmtSignedInt(r.delta)}
                    </span>
                    <span style={{ fontSize: 10, color: color.mute, textAlign: 'center', userSelect: 'none' }}>{open ? '▾' : '▸'}</span>
                  </RowShell>
                  {/* 产品子行：该品牌在所选档位下的各型号+配置变化（Δ 降序、缩进小字） */}
                  {open &&
                    r.products.map((p) => (
                      <RowShell key={p.key}>
                        <span
                          title={p.label}
                          style={{ fontSize: 11.5, color: color.body, paddingLeft: 22, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {p.label}
                        </span>
                        <BiBar delta={p.delta} maxAbs={maxAbs} thin />
                        <span
                          className="tnum"
                          style={{ fontSize: 11.5, fontWeight: 600, textAlign: 'right', color: p.delta > 0 ? color.link : color.error, whiteSpace: 'nowrap' }}
                        >
                          {fmtSignedInt(p.delta)}
                        </span>
                        <span />
                      </RowShell>
                    ))}
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
