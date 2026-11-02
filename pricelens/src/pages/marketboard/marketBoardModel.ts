// ============================================================
// 大盘图表 · 纯模型层：锚点插值、份额/容量换算、同比、摘要文案。
// 全部为确定性计算（无随机数），锚点月数值恒等于手写数据，单测锁定。
// ============================================================
import { OTHERS, type MarketIndustryData, type MonthShares } from './marketBoardData';
import { brandColorOf, color } from '../../theme/tokens';

/** 品牌别名：GFK 面板上 MI 即小米，沿用 XIAOMI 的登记品牌色 */
const BRAND_ALIAS: Record<string, string> = { MI: 'XIAOMI', REDMI: 'XIAOMI' };

/** 本面图表身份色补遗：扩展色板对个别品牌落色过艳（品红/紫大面违「清爽」基调），
 *  按 GFK 看板的品牌身份色收敛（WHOOP 深绿），OPPO 收敛为扩展板绿色。 */
const BRAND_COLOR_OVERRIDE: Record<string, string> = { WHOOP: '#166534', OPPO: '#15803d', LENOVO: '#0f766e' };

/** OTHERS 固定中性灰；其余走全站品牌数据色（未登记品牌落稳定扩展色板） */
export function brandColorFor(brand: string): string {
  if (brand === OTHERS) return color.hairlineStrong;
  return BRAND_COLOR_OVERRIDE[brand] ?? brandColorOf(BRAND_ALIAS[brand] ?? brand);
}

/** 深底白字 / 浅底墨字：按 WCAG 相对亮度判别（白字仅当对白底对比 ≥3:1） */
export function labelInkFor(bgHex: string): string {
  const h = bgHex.replace('#', '');
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const r = lin(parseInt(h.slice(0, 2), 16) / 255);
  const g = lin(parseInt(h.slice(2, 4), 16) / 255);
  const b = lin(parseInt(h.slice(4, 6), 16) / 255);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (L + 0.05) >= 3 ? '#ffffff' : color.ink;
}

// ---------------- 时间与数值小工具 ----------------

/** YYYYMM -> 2026-08 */
export function monthLabel(month: string): string {
  return /^\d{6}$/.test(month) ? `${month.slice(0, 4)}-${month.slice(4, 6)}` : month;
}

export function fmtWan(v: number): string {
  return `${round1(v).toFixed(1)} 万台`;
}

export function fmtYoy(pct: number | null): string {
  if (pct == null) return '新增';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/** 同比涨蓝 / 跌琥珀 / 新增灰（与全站涨跌语义一致） */
export function yoyInk(pct: number | null): string {
  if (pct == null) return color.mute;
  return pct >= 0 ? '#0053c2' : '#b45309';
}

export function yoyPct(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function monthNum(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(4, 6));
}

/** 余弦缓动插值因子（端点平滑，锚点处取值精确） */
function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return (1 - Math.cos(c * Math.PI)) / 2;
}

/** 锚点折线取值：锚点月精确取锚点值，之间余弦缓动，域外钳到最近锚点 */
function piecewiseAt(anchors: { month: string; value: number }[], month: string): number {
  if (anchors.length === 0) return 0;
  const m = monthNum(month);
  const first = monthNum(anchors[0].month);
  if (m <= first) return anchors[0].value;
  const last = anchors[anchors.length - 1];
  if (m >= monthNum(last.month)) return last.value;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    const ma = monthNum(a.month);
    const mb = monthNum(b.month);
    if (m <= mb) {
      const t = mb === ma ? 1 : (m - ma) / (mb - ma);
      return a.value + (b.value - a.value) * ease(t);
    }
  }
  return last.value;
}

// ---------------- 容量 / ASP / 份额锚点 ----------------

/** 细化锚点月的大盘总量（万台）= 各档位容量之和 */
export function anchorTotalVolume(ind: MarketIndustryData, month: string): number {
  return ind.tiers.reduce((sum, t) => sum + (ind.tierVolume[t.id]?.[month] ?? 0), 0);
}

function volumeAnchorList(ind: MarketIndustryData): { month: string; value: number }[] {
  return [
    ...ind.volumeHistory.map((h) => ({ month: h.month, value: h.value })),
    ...ind.anchorMonths.map((m) => ({ month: m, value: anchorTotalVolume(ind, m) })),
  ].sort((a, b) => monthNum(a.month) - monthNum(b.month));
}

/** 大盘月度容量（万台）：锚点精确、之间缓动插值 */
export function volumeAt(ind: MarketIndustryData, month: string): number {
  return piecewiseAt(volumeAnchorList(ind), month);
}

/** 大盘月度均价（USD）：锚点精确、之间缓动插值 */
export function aspAt(ind: MarketIndustryData, month: string): number {
  return piecewiseAt(ind.aspAnchors.map((a) => ({ month: a.month, value: a.value })).sort((a, b) => monthNum(a.month) - monthNum(b.month)), month);
}

/** 档位×锚点月的品牌份额（含 OTHERS 差值，保证合计 100%） */
export function tierShareAt(ind: MarketIndustryData, tierId: string, month: string): Record<string, number> {
  const raw = ind.tierShare[tierId]?.[month] ?? {};
  const out: Record<string, number> = {};
  let sum = 0;
  for (const b of ind.brands) {
    const v = raw[b] ?? 0;
    out[b] = v;
    sum += v;
  }
  out[OTHERS] = Math.round((100 - sum) * 100) / 100;
  return out;
}

/** 细化锚点月的大盘品牌份额（按档位容量加权，含 OTHERS 差值） */
export function anchorOverallShares(ind: MarketIndustryData, month: string): Record<string, number> {
  const totals: Record<string, number> = {};
  let total = 0;
  for (const t of ind.tiers) {
    const vol = ind.tierVolume[t.id]?.[month] ?? 0;
    total += vol;
    const shares = tierShareAt(ind, t.id, month);
    for (const b of ind.brands) totals[b] = (totals[b] ?? 0) + (vol * shares[b]) / 100;
  }
  const out: Record<string, number> = {};
  let sum = 0;
  for (const b of ind.brands) {
    const pct = total > 0 ? ((totals[b] ?? 0) / total) * 100 : 0;
    out[b] = Math.round(pct * 100) / 100;
    sum += out[b];
  }
  out[OTHERS] = Math.round((100 - sum) * 100) / 100;
  return out;
}

function overallShareAnchorList(ind: MarketIndustryData): { month: string; shares: Record<string, number> }[] {
  const history: MonthShares[] = ind.overallHistory.map((h) => ({
    month: h.month,
    shares: { ...h.shares, [OTHERS]: Math.round((100 - Object.values(h.shares).reduce((s, v) => s + v, 0)) * 100) / 100 },
  }));
  const detail = ind.anchorMonths.map((m) => ({ month: m, shares: anchorOverallShares(ind, m) }));
  return [...history, ...detail].sort((a, b) => monthNum(a.month) - monthNum(b.month));
}

/** 份额锚点折线：锚点月精确取锚点值、之间余弦缓动、域外钳到最近锚点（按 keys 逐键插值） */
function piecewiseShares(
  anchors: { month: string; shares: Record<string, number> }[],
  month: string,
  keys: string[],
): Record<string, number> {
  const m = monthNum(month);
  let lo = anchors[0];
  let hi = anchors[anchors.length - 1];
  let k = 0;
  if (m <= monthNum(lo.month)) {
    hi = lo;
  } else if (m >= monthNum(hi.month)) {
    lo = hi;
  } else {
    for (let i = 1; i < anchors.length; i++) {
      if (m <= monthNum(anchors[i].month)) {
        lo = anchors[i - 1];
        hi = anchors[i];
        break;
      }
    }
    const ma = monthNum(lo.month);
    const mb = monthNum(hi.month);
    k = ease(mb === ma ? 1 : (m - ma) / (mb - ma));
  }
  const out: Record<string, number> = {};
  for (const key of keys) {
    const a = lo.shares[key] ?? 0;
    const v = hi.shares[key] ?? 0;
    out[key] = Math.max(0, a + (v - a) * k);
  }
  return out;
}

/** 任意月的大盘品牌份额（%）：锚点精确、之间缓动插值，OTHERS 补齐 100% */
export function overallShareAt(ind: MarketIndustryData, month: string): Record<string, number> {
  const out = piecewiseShares(overallShareAnchorList(ind), month, ind.brands);
  out[OTHERS] = 100 - ind.brands.reduce((s, b) => s + out[b], 0);
  return out;
}

/** 图 2 序列：月度品牌份额（含 OTHERS）+ 大盘容量 + ASP */
export function trendSeries(ind: MarketIndustryData): {
  months: string[];
  volumes: number[];
  asps: number[];
  shares: Record<string, number[]>;
} {
  const months = ind.trendMonths;
  const shares: Record<string, number[]> = {};
  for (const b of [...ind.brands, OTHERS]) shares[b] = [];
  const volumes: number[] = [];
  const asps: number[] = [];
  for (const m of months) {
    const s = overallShareAt(ind, m);
    for (const b of [...ind.brands, OTHERS]) shares[b].push(Math.max(0, s[b] ?? 0));
    volumes.push(round1(volumeAt(ind, m)));
    asps.push(Math.round(aspAt(ind, m)));
  }
  return { months, volumes, asps, shares };
}

// ---------------- 图 2 · 单档位模式：档位内的月度份额与容量 ----------------

/** 单档位的大盘容量锚点：锚点月取档位容量；早期月按该档位在首锚点月的容量占比折算总量 */
function tierVolumeAnchorList(ind: MarketIndustryData, tierId: string): { month: string; value: number }[] {
  const m0 = ind.anchorMonths[0];
  const total0 = anchorTotalVolume(ind, m0);
  const ratio = total0 > 0 ? (ind.tierVolume[tierId]?.[m0] ?? 0) / total0 : 0;
  return [
    ...ind.volumeHistory.map((h) => ({ month: h.month, value: h.value * ratio })),
    ...ind.anchorMonths.map((m) => ({ month: m, value: ind.tierVolume[tierId]?.[m] ?? 0 })),
  ].sort((a, b) => monthNum(a.month) - monthNum(b.month));
}

/** 单档位月度容量（万台）：锚点精确、之间缓动插值 */
export function tierVolumeAt(ind: MarketIndustryData, tierId: string, month: string): number {
  return piecewiseAt(tierVolumeAnchorList(ind, tierId), month);
}

/**
 * 单档位的品牌份额锚点：锚点月取档位份额；早期月以「品牌整体份额相对首锚点月的漂移因子」
 * 推导（因子钳在 0.25–4 倍内），再按合计归一到 100%（含 OTHERS）。
 */
function tierShareAnchorList(ind: MarketIndustryData, tierId: string): { month: string; shares: Record<string, number> }[] {
  const keys = [...ind.brands, OTHERS];
  const m0 = ind.anchorMonths[0];
  const base = tierShareAt(ind, tierId, m0);
  const overallBase = anchorOverallShares(ind, m0);
  const history = ind.overallHistory.map((h) => {
    const overallH: Record<string, number> = {
      ...h.shares,
      [OTHERS]: 100 - Object.values(h.shares).reduce((s, v) => s + v, 0),
    };
    const raw: Record<string, number> = {};
    let sum = 0;
    for (const k of keys) {
      const denom = overallBase[k] ?? 0;
      const factor = denom > 0.05 ? Math.min(4, Math.max(0.25, (overallH[k] ?? 0) / denom)) : 1;
      raw[k] = Math.max(0, (base[k] ?? 0) * factor);
      sum += raw[k];
    }
    const scale = sum > 0 ? 100 / sum : 0;
    for (const k of keys) raw[k] = raw[k] * scale;
    return { month: h.month, shares: raw };
  });
  const detail = ind.anchorMonths.map((m) => ({ month: m, shares: tierShareAt(ind, tierId, m) }));
  return [...history, ...detail].sort((a, b) => monthNum(a.month) - monthNum(b.month));
}

/** 单档位任意月的品牌份额（%）：锚点精确、之间缓动插值，OTHERS 补齐 100% */
export function tierShareTrendAt(ind: MarketIndustryData, tierId: string, month: string): Record<string, number> {
  const out = piecewiseShares(tierShareAnchorList(ind, tierId), month, ind.brands);
  out[OTHERS] = Math.max(0, 100 - ind.brands.reduce((s, b) => s + out[b], 0));
  return out;
}

/** 图 2 单档位序列：月度品牌份额（含 OTHERS）+ 档位容量（万台）；档位内不提供均价 */
export function tierTrendSeries(ind: MarketIndustryData, tierId: string): {
  months: string[];
  volumes: number[];
  shares: Record<string, number[]>;
} {
  const months = ind.trendMonths;
  const shares: Record<string, number[]> = {};
  for (const b of [...ind.brands, OTHERS]) shares[b] = [];
  const volumes: number[] = [];
  for (const m of months) {
    const s = tierShareTrendAt(ind, tierId, m);
    for (const b of [...ind.brands, OTHERS]) shares[b].push(Math.max(0, s[b] ?? 0));
    volumes.push(round1(tierVolumeAt(ind, tierId, m)));
  }
  return { months, volumes, shares };
}

/** 图 2 单档位要点：档位容量同比 + 领先品牌份额及其同比变化（pct） */
export function tierTrendSummary(ind: MarketIndustryData, tierId: string): string {
  const tier = ind.tiers.find((t) => t.id === tierId);
  if (!tier) return '';
  const [curMonth, prevMonth] = ind.yoyMonths;
  const vol = tierVolumeAt(ind, tierId, curMonth);
  const volPrev = tierVolumeAt(ind, tierId, prevMonth);
  const sCur = tierShareAt(ind, tierId, curMonth);
  const sPrev = tierShareAt(ind, tierId, prevMonth);
  const lead = ind.brands.slice().sort((a, b) => sCur[b] - sCur[a])[0];
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v)} pct`;
  const parts = [
    `${monthLabel(curMonth)} ${tier.label} 美元档容量 ${fmtWan(vol)}，同比 ${fmtYoy(yoyPct(vol, volPrev))}`,
  ];
  if (lead && sCur[lead] > 0) parts.push(`${lead} 份额 ${sCur[lead]}%，较去年同期 ${pct(sCur[lead] - sPrev[lead])}`);
  if (lead !== 'HUAWEI' && ind.brands.includes('HUAWEI')) {
    parts.push(`HUAWEI 份额 ${sCur.HUAWEI}%，较去年同期 ${pct(sCur.HUAWEI - sPrev.HUAWEI)}`);
  }
  return `${parts.join('；')}。`;
}

// ---------------- 图 3：品牌 × 档位同比矩阵 ----------------

export interface TierYoyRow {
  tierId: string;
  label: string;
  cur: number;
  prev: number;
  yoy: number | null;
}

export interface BrandYoyColumn {
  key: string;
  label: string;
  /** 品牌色键（OTHERS / 大盘整体列有专属色） */
  colorKey: string;
  isTotal: boolean;
  cur: number;
  prev: number;
  yoy: number | null;
  rows: TierYoyRow[];
}

/** 每档位贡献量（万台）＝ 档位容量 × 份额 / 100 */
function tierContribution(ind: MarketIndustryData, tierId: string, month: string, brand: string): number {
  const vol = ind.tierVolume[tierId]?.[month] ?? 0;
  return (vol * (tierShareAt(ind, tierId, month)[brand] ?? 0)) / 100;
}

/** 图 3 列集：大盘整体列 + 各品牌列 + OTHERS 列（自上而下档位、本期 vs 去年同期） */
export function tierYoyColumns(ind: MarketIndustryData): BrandYoyColumn[] {
  const [curMonth, prevMonth] = ind.yoyMonths;
  const rowsFor = (pick: (tierId: string) => { cur: number; prev: number }): TierYoyRow[] =>
    ind.tiers.map((t) => {
      const { cur, prev } = pick(t.id);
      return { tierId: t.id, label: t.label, cur: round1(cur), prev: round1(prev), yoy: yoyPct(cur, prev) };
    });
  const columns: BrandYoyColumn[] = [
    {
      key: '__total__',
      label: '大盘整体',
      colorKey: '__total__',
      isTotal: true,
      cur: round1(anchorTotalVolume(ind, curMonth)),
      prev: round1(anchorTotalVolume(ind, prevMonth)),
      yoy: yoyPct(anchorTotalVolume(ind, curMonth), anchorTotalVolume(ind, prevMonth)),
      rows: rowsFor((tierId) => ({
        cur: ind.tierVolume[tierId]?.[curMonth] ?? 0,
        prev: ind.tierVolume[tierId]?.[prevMonth] ?? 0,
      })),
    },
    ...[...ind.brands, OTHERS].map((b) => {
      const cur = ind.tiers.reduce((s, t) => s + tierContribution(ind, t.id, curMonth, b), 0);
      const prev = ind.tiers.reduce((s, t) => s + tierContribution(ind, t.id, prevMonth, b), 0);
      return {
        key: b,
        label: b === OTHERS ? '<OTHERS>' : b,
        colorKey: b,
        isTotal: false,
        cur: round1(cur),
        prev: round1(prev),
        yoy: yoyPct(cur, prev),
        rows: rowsFor((tierId) => ({ cur: tierContribution(ind, tierId, curMonth, b), prev: tierContribution(ind, tierId, prevMonth, b) })),
      };
    }),
  ];
  return columns;
}

// ---------------- 摘要文案（由数据计算，非手写） ----------------

/** 图 1 要点：锚点首尾对比中份额变化最大的两处（最新份额 ≥5%、同品牌只取最大一处） */
export function tierShareSummary(ind: MarketIndustryData, tierId: string | null): string {
  const [m0, , , m1] = ind.anchorMonths;
  const tiers = tierId ? ind.tiers.filter((t) => t.id === tierId) : ind.tiers;
  const moves: { tier: string; brand: string; from: number; to: number; delta: number }[] = [];
  for (const t of tiers) {
    const s0 = tierShareAt(ind, t.id, m0);
    const s1 = tierShareAt(ind, t.id, m1);
    for (const b of ind.brands) {
      if (s1[b] < 5) continue;
      moves.push({ tier: t.label, brand: b, from: s0[b], to: s1[b], delta: s1[b] - s0[b] });
    }
  }
  moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const picked: typeof moves = [];
  for (const mv of moves) {
    if (picked.some((p) => p.brand === mv.brand)) continue;
    picked.push(mv);
    if (picked.length >= 2) break;
  }
  if (picked.length === 0) return `${monthLabel(m0)} 至 ${monthLabel(m1)}，各档位品牌份额基本持平。`;
  return (
    `${monthLabel(m0)} 至 ${monthLabel(m1)}，` +
    picked
      .map((mv) => `${mv.brand} 在 ${mv.tier} 档份额由 ${mv.from}% ${mv.delta >= 0 ? '升' : '降'}至 ${mv.to}%`)
      .join('，') +
    '。'
  );
}

/** 图 2 要点：最新锚点月大盘容量与 ASP 的同比 */
export function trendSummary(ind: MarketIndustryData): string {
  const [curMonth, prevMonth] = ind.yoyMonths;
  const vol = volumeAt(ind, curMonth);
  const volPrev = volumeAt(ind, prevMonth);
  const asp = aspAt(ind, curMonth);
  const aspPrev = aspAt(ind, prevMonth);
  return (
    `${monthLabel(curMonth)} 大盘容量 ${fmtWan(vol)}，同比 ${fmtYoy(yoyPct(vol, volPrev))}；` +
    `大盘均价 $${Math.round(asp)}，同比 ${fmtYoy(yoyPct(asp, aspPrev))}。`
  );
}

/** 图 3 摘要：档位增长 TOP3 + HUAWEI 最大涨/落档位（GFK 看板同构文案） */
export function tierYoySummary(ind: MarketIndustryData): string {
  const [curMonth, prevMonth] = ind.yoyMonths;
  const deltas: { brand: string; tier: string; delta: number; yoy: number | null }[] = [];
  for (const b of ind.brands) {
    for (const t of ind.tiers) {
      const cur = tierContribution(ind, t.id, curMonth, b);
      const prev = tierContribution(ind, t.id, prevMonth, b);
      deltas.push({ brand: b, tier: t.label, delta: cur - prev, yoy: yoyPct(cur, prev) });
    }
  }
  const ups = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const hw = deltas.filter((d) => d.brand === 'HUAWEI');
  const hwUp = hw.slice().sort((a, b) => (b.yoy ?? -Infinity) - (a.yoy ?? -Infinity))[0];
  const hwDown = hw.slice().sort((a, b) => (a.yoy ?? Infinity) - (b.yoy ?? Infinity))[0];
  const parts: string[] = [];
  if (ups.length > 0) {
    parts.push(
      `${monthLabel(curMonth)} 整体看，档位增长前三：` +
        ups.map((d) => `${d.brand} 在 ${d.tier} 档 +${round1(d.delta)} 万台`).join('、'),
    );
  }
  if (hwUp && hwDown && hwUp.tier !== hwDown.tier) {
    parts.push(`HUAWEI 在 ${hwUp.tier} 档增长最大 ${fmtYoy(hwUp.yoy)}，${hwDown.tier} 档下滑最大 ${fmtYoy(hwDown.yoy)}`);
  }
  return parts.length > 0 ? `${parts.join('；')}。` : '各档位同比变化有限。';
}

/** 右轴上限取整（1/2/5×10^n 向上取整），供图 2 销量轴用 */
export function niceAxisMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  for (const k of [1, 2, 5, 10]) {
    if (k * base >= v) return k * base;
  }
  return 10 * base;
}
