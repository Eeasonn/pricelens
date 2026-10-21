// ============================================================
// 第120轮（2026-10-21 走查会重做）量价看板 · 大盘分析卡：
// ① 大盘销量时间柱——横轴 = 查看范围内各期，柱高 = 该期大盘总销量（绝对台数），
//   柱内堆叠 = 品牌构成（品牌色分段，自有品牌置底），绝对量与品牌占比同时可读；
//   点击柱子选中该期（与右上「时间」选择双向同步，选中柱描边高亮 + 列底衬带），
//   悬停分段出 品牌/台数/占该期比例；该期缺采留空档。
//   Y 轴 = niceCeil 台数刻度（5 道网格线）；X 轴刻度走 axisTickPlan：
//   首末恒完整格式（周=YYYYMMDD/月=YYYYMM/季=YYYYQn），中间短格式，
//   跨年区间的换年中间刻度下方补一行年份小字（第二个 tspan）。
// ② 档位筛选（卡头 Select，默认全部档位）——选项 = 该国×产业实际出现的档位
//   （产业阶梯序），同时作用于时间柱与环比贡献拆解。
// ③ 大盘环比贡献拆解（图底）——选中期 vs 上一期的台数变化，按价格档位分组，
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
import { axisTickPlan, fmtInt, tierLabelShort, type Bucket } from '../../chart/PriceTrend/helpers';
import type { Granularity, Industry } from '../../dataModel/types';
import { TIER_LABELS, tierOrderOf } from '../../dataModel/aggregate';
import { niceCeil, volumeByBuckets } from '../../dataModel/volume';
import {
  contributionRows,
  fmtSignedInt,
  marketBrandOrder,
  marketConfigs,
  marketKeyOf,
  marketTierOptions,
  marketTimeStack,
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
const PAD_L = 48; // 左侧台数刻度（千分位最宽 ~7 字符）
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 30; // 容纳刻度主行 + 跨年年份小字行

/** 档位筛选的「全部」哨兵值（Select 值域须非空字符串） */
const ALL_TIERS = '__all__';

interface TipState {
  x: number;
  y: number;
  brand: string;
  vol: number;
  share: number; // 占该期大盘比例
  period: string; // 该期时间文案
}

export default function MarketBoard(props: {
  cc: string;
  industry: Industry;
  granularity: Granularity;
  /** 全量桶（数据范围）与当前查看窗口下标：时间柱画窗口内每一期 */
  buckets: Bucket[];
  winS: number;
  winE: number;
}) {
  const { cc, industry, granularity, buckets, winS, winE } = props;
  const [selIdxState, setSelIdx] = useState<number>(winE);
  const [granule, setGranule] = useState<MarketGranule>('brand');
  const [tierFilter, setTierFilter] = useState<string | null>(null); // null = 全部档位
  const [boxRef, width] = useContainerWidth();
  const [tip, setTip] = useState<TipState | null>(null); // 悬停分段明细（容器坐标）

  // 窗口/粒度变化 → 选中期回默认（窗口最新一期）；国家/产业变化 → 档位筛选回全部
  useEffect(() => {
    setSelIdx(winE);
  }, [winS, winE, granularity]);
  useEffect(() => {
    setTierFilter(null);
  }, [cc, industry]);

  const selIdx = Math.min(Math.max(selIdxState, winS), Math.max(winS, winE));
  const prevIdx = selIdx - 1; // 全量桶上一期（窗口首期也有环比）
  const selId = buckets[selIdx]?.id ?? null;
  const prevId = prevIdx >= 0 ? buckets[prevIdx]?.id ?? null : null;

  const configs = useMemo(() => marketConfigs(dimProduct, cc, industry), [cc, industry]);
  const tierOptions = useMemo(() => marketTierOptions(configs, tierOrderOf(industry)), [configs, industry]);
  const filteredConfigs = useMemo(
    () => (tierFilter == null ? configs : configs.filter((c) => c.tierCode === tierFilter)),
    [configs, tierFilter],
  );

  const { prevVol, selVol } = useMemo(() => {
    const prevM = new Map<string, number | null>();
    const selM = new Map<string, number | null>();
    if (!selId) return { prevVol: prevM, selVol: selM };
    const ids = prevId ? [prevId, selId] : [selId];
    for (const c of filteredConfigs) {
      const vs = volumeByBuckets(c.modelId, c.romram, cc, granularity, ids);
      prevM.set(marketKeyOf(c), prevId ? vs[0] : null);
      selM.set(marketKeyOf(c), vs[vs.length - 1]);
    }
    return { prevVol: prevM, selVol: selM };
  }, [filteredConfigs, cc, granularity, selId, prevId]);

  const brandOrder = useMemo(() => marketBrandOrder(filteredConfigs, selVol, ownBrand()), [filteredConfigs, selVol]);

  // 时间柱取数：窗口整段 ids 一次批量取，展平为 (配置 × 期) 台数表（键 = configKey|期下标）
  const winIds = useMemo(() => buckets.slice(winS, winE + 1).map((b) => b.id), [buckets, winS, winE]);
  const winVol = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const c of filteredConfigs) {
      volumeByBuckets(c.modelId, c.romram, cc, granularity, winIds).forEach((v, bi) => {
        m.set(`${marketKeyOf(c)}|${bi}`, v);
      });
    }
    return m;
  }, [filteredConfigs, cc, granularity, winIds]);
  const cols = useMemo(
    () => marketTimeStack(filteredConfigs, winVol, null, brandOrder),
    [filteredConfigs, winVol, brandOrder],
  );

  const breakdown = useMemo(
    () => contributionRows(filteredConfigs, prevVol, selVol, granule),
    [filteredConfigs, prevVol, selVol, granule],
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

  // ---- 时间柱几何 ----
  const n = winBuckets.length;
  const plotW = Math.max(80, width - PAD_L - PAD_R);
  const plotH = CHART_H - PAD_T - PAD_B;
  const colW = n > 0 ? plotW / n : plotW;
  const barW = Math.min(48, colW * 0.6);
  // Y 轴 = 台数：niceCeil 上限，4 等分 5 道网格线（上限不被 4 整除时改 5 等分，保持整数步长）
  const cap = niceCeil(Math.max(1, ...cols.map((c) => c.total)));
  const yStep = cap % 4 === 0 ? cap / 4 : cap % 5 === 0 ? cap / 5 : Math.ceil(cap / 4);
  const yMax = yStep * 4;
  const yOf = (v: number): number => PAD_T + plotH - (v / yMax) * plotH;
  // X 轴刻度计划：域 = 窗口内各期，首末恒完整格式，中间按步抽稀（≈每 10 期一根）
  const tickPlan = axisTickPlan(granularity, winIds, Math.max(1, Math.ceil(n / 10)), [0, n - 1]);
  const selectedBi = selIdx - winS; // 选中柱在窗口内的下标（已钳在界内）
  const maxAbs = Math.max(1, ...breakdown.rows.map((r) => Math.abs(r.delta)));
  const bestPull = breakdown.rows.reduce<(typeof breakdown.rows)[number] | null>(
    (acc, r) => (acc == null || r.delta > acc.delta ? r : acc),
    null,
  );
  const bestDrag = breakdown.rows.reduce<(typeof breakdown.rows)[number] | null>(
    (acc, r) => (acc == null || r.delta < acc.delta ? r : acc),
    null,
  );
  const hasAnyData = cols.some((c) => c.total > 0);

  return (
    <div>
      {/* 工具行：标题 + 档位筛选 + 大盘时间选择（点柱与下拉双向同步） */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: color.ink }}>大盘分析</span>
        <span style={{ fontSize: 11, color: color.mute }}>各期大盘销量（台），堆叠 = 品牌构成</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}>档位</span>
          <ConfigProvider theme={filterBarTheme}>
            <Select
              size="small"
              aria-label="大盘档位"
              value={tierFilter ?? ALL_TIERS}
              onChange={(v: string) => setTierFilter(v === ALL_TIERS ? null : v)}
              options={[
                { value: ALL_TIERS, label: '全部档位' },
                ...tierOptions.map((t) => ({ value: t, label: TIER_LABELS[t] ?? tierColLabel(t) })),
              ]}
              style={{ width: 112 }}
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

      {/* 时间柱：横轴各期，柱高 = 该期大盘台数（绝对量），分段 = 品牌构成（自有品牌置底） */}
      <div ref={boxRef} style={{ position: 'relative' }}>
        {!hasAnyData ? (
          <div style={{ height: CHART_H, display: 'grid', placeItems: 'center', fontSize: fontSize.bodySm, color: color.mute }}>
            暂无大盘销量数据
          </div>
        ) : (
          <>
            <svg width={width} height={CHART_H} role="img" aria-label="各期大盘销量与品牌构成" style={{ display: 'block' }}>
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
              {/* 期柱：点击选中该期；柱体自下而上按品牌序堆叠（序首 = 自有 = 视觉置底） */}
              {cols.map((col, bi) => {
                const cx = PAD_L + colW * (bi + 0.5);
                const selected = bi === selectedBi;
                const bucket = winBuckets[bi];
                let acc = 0;
                return (
                  <g key={bi} style={{ cursor: 'pointer' }} onClick={() => setSelIdx(winS + bi)}>
                    {selected && (
                      <rect x={cx - colW / 2} y={PAD_T} width={colW} height={plotH} fill={color.hairlineStrong} opacity={0.16} />
                    )}
                    {/* 整列点击热区（柱体上方空白处也可选中该期） */}
                    <rect x={cx - colW / 2} y={PAD_T} width={colW} height={plotH} fill="transparent" />
                    {col.byBrand.map((seg) => {
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
                              share: col.total > 0 ? seg.vol / col.total : 0,
                              period: bucket ? bucketLabel(granularity, bucket) : '',
                            });
                          }}
                          onMouseLeave={() => setTip(null)}
                        />
                      );
                    })}
                    {/* 选中柱描边高亮 */}
                    {selected && col.total > 0 && (
                      <rect
                        x={cx - barW / 2 - 1.5}
                        y={yOf(col.total) - 1.5}
                        width={barW + 3}
                        height={PAD_T + plotH - yOf(col.total) + 1.5}
                        fill="none"
                        stroke={color.ink}
                        strokeWidth={1.2}
                        pointerEvents="none"
                      />
                    )}
                  </g>
                );
              })}
              {/* X 轴刻度：首末完整格式恒显（加粗），中间短格式抽稀；跨年换年刻度补年份小字行 */}
              {tickPlan.indexes.map((i) => {
                const cx = PAD_L + colW * (i + 0.5);
                const edge = tickPlan.isEdge(i);
                const yr = tickPlan.yearText(i);
                return (
                  <text
                    key={i}
                    x={cx}
                    y={PAD_T + plotH + 13}
                    textAnchor="middle"
                    fontSize={edge ? 10.5 : 9.5}
                    fontWeight={edge ? 600 : 400}
                    fill={edge ? color.body : color.mute}
                    className="tnum"
                  >
                    {tickPlan.dateText(i)}
                    {yr != null && (
                      <tspan x={cx} dy={10} fontSize={8.5} fontWeight={400} fill={color.mute}>
                        {yr}
                      </tspan>
                    )}
                  </text>
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
                  {tip.vol.toLocaleString('en-US')} 台 · 占该期 {(tip.share * 100).toFixed(1)}%
                </div>
                <div className="tnum" style={{ fontSize: 11, color: color.mute }}>
                  期 {tip.period}
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
          {tierFilter != null && (
            <span style={{ fontSize: 12, color: color.body, whiteSpace: 'nowrap' }}>
              档位 {TIER_LABELS[tierFilter] ?? tierColLabel(tierFilter)}
            </span>
          )}
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
