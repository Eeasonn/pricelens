// ============================================================
// 第112轮（2026-10-21）量价看板 · 销量估算纯计算层。
// 事实表无销量字段：按「产业基准 × 档位 × 品牌 × 国家 × 配置份额 × 生命周期 ×
// 折扣深度 × 促销档期 × 确定性微扰」推算周销量（台）。全链路无随机数
// （微扰 = FNV-1a 哈希），同输入两次调用逐字节一致，可金测。
// 销量为估算口径，接入真实销量后替换（页面已带对应脚注）。
// 口径约束：
//   - 只对「该周该配置在该国至少有一条事实行」的周给值（任意渠道行即算在架）；
//   - 月/季 = 桶内周求和；无任何周有值 → null；
//   - 结果 Math.round 为非负整数；不随平台/币种变化（恒本币口径的事实行）。
// ============================================================
import { dimProduct, dimPromo, dimTier, dimTime } from '../data';
import type { DimProduct, FactPriceWeekly, Granularity, Industry } from './types';
import { defaultPlatformOf, factRows } from './aggregate';

const normRom = (s: string): string => s.replace(/\s+/g, '');

const timeRows: typeof dimTime = [...dimTime].sort((a, b) => (a.week_id < b.week_id ? -1 : a.week_id > b.week_id ? 1 : 0));

/** 产业周销基准（台/周）：量级锚，仅供估算 */
const INDUSTRY_BASE: Record<Industry, number> = {
  phone: 6000,
  tablet: 1800,
  wearable: 2600,
  audio: 3800,
  iot: 900,
  pc: 700,
};

/** 档位梯序（低 → 高）→ 销量因子：档位越低销量越大（1.6 × 0.62^idx） */
export function tierFactor(ladderIdx: number): number {
  const i = Number.isFinite(ladderIdx) ? Math.max(0, Math.floor(ladderIdx)) : 0;
  return 1.6 * Math.pow(0.62, i);
}

const BRAND_FACTORS: Record<string, number> = {
  APPLE: 1.7,
  SAMSUNG: 1.6,
  XIAOMI: 1.25,
  HUAWEI: 1.0,
  HONOR: 0.8,
};

/** 品牌因子：未登记品牌 0.6 */
export function brandFactor(brand: string): number {
  return BRAND_FACTORS[brand.trim().toUpperCase()] ?? 0.6;
}

const COUNTRY_FACTORS: Record<string, number> = {
  RU: 1.0, BR: 1.2, MX: 0.9, ID: 1.1, JP: 1.0, DE: 0.8, GB: 0.75, FR: 0.7,
  IT: 0.6, ES: 0.55, TR: 0.7, PL: 0.4, RO: 0.2, CO: 0.35, AR: 0.3, PE: 0.2,
  ZA: 0.3, SA: 0.4, AE: 0.25, MY: 0.3, SG: 0.12, TH: 0.45, PH: 0.5, VN: 0.5,
};

/** 国家市场体量因子：未登记国家 0.3 */
export function countryFactor(cc: string): number {
  return COUNTRY_FACTORS[cc] ?? 0.3;
}

/** 上市周期：自首个有事实行的周起 w=0/1/2 爬坡 0.55/0.8/1.0，其后每周边际 ×0.985；eol 后为 0 */
export function lifecycleFactor(weeksSinceFirst: number, isAfterEol: boolean): number {
  if (isAfterEol) return 0;
  const w = Number.isFinite(weeksSinceFirst) ? Math.max(0, Math.floor(weeksSinceFirst)) : 0;
  if (w === 0) return 0.55;
  if (w === 1) return 0.8;
  if (w === 2) return 1;
  return Math.pow(0.985, w - 2);
}

/** 折扣拉动：d = max(0, 1 − price/rrp)，×(1 + 1.8d)；缺价/缺 RRP = 无拉动 */
export function discountFactor(price: number | null, rrp: number | null): number {
  if (price == null || rrp == null || !(rrp > 0) || !(price > 0)) return 1;
  return 1 + 1.8 * Math.max(0, 1 - price / rrp);
}

/** 促销档期深度 → 拉动因子（浅/中/深） */
export function promoFactor(depth: '浅' | '中' | '深'): number {
  return depth === '深' ? 1.6 : depth === '中' ? 1.35 : 1.15;
}

/** FNV-1a 32 位 → [0,1)：确定性微扰源（同 key 恒同值） */
export function hash01(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

/** 轴上限取整：先留 10% 余量，再向上取 1/2/2.5/5 ×10^k 档；非正值保底 1 */
export function niceCeil(v: number): number {
  const t = v * 1.1;
  if (!(t > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(t)));
  const r = t / p;
  const m = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
  return m * p;
}

// ---------------- 配置份额（同型号内按参考价分配） ----------------

const shareCache = new Map<string, Map<string, number>>();

/** 参考价：ref_price_usd（配置内各行同值，取首个非空）；缺 → 该国事实行 rrp_local 中位；再缺 → 排最后 */
function refPriceOf(rows: DimProduct[], cc: string): number {
  const ref = rows.find((r) => r.ref_price_usd != null)?.ref_price_usd;
  if (ref != null) return ref;
  const vals: number[] = [];
  for (const r of rows) {
    for (const w of timeRows) {
      for (const row of factRows(cc, r.sku_id, w.week_id)) {
        if (row.rrp_local != null) vals.push(row.rrp_local);
      }
    }
  }
  if (!vals.length) return Number.POSITIVE_INFINITY;
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 1 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

/**
 * 配置份额：同型号各配置按参考价升序排名 rank0 1.0 / rank1 0.65 / rank2 0.4 /
 * rank3+ 0.25，归一化使同型号份额和为 1。同价按配置名字典序（确定性）。
 */
function configShares(modelId: string, cc: string): Map<string, number> {
  const key = `${cc}|${modelId}`;
  const hit = shareCache.get(key);
  if (hit) return hit;
  const groups = new Map<string, DimProduct[]>();
  for (const p of dimProduct) {
    if (p.model_id !== modelId) continue;
    const arr = groups.get(p.romram);
    if (arr) arr.push(p);
    else groups.set(p.romram, [p]);
  }
  const ranked = [...groups.entries()]
    .map(([romram, rows]) => ({ romram, ref: refPriceOf(rows, cc) }))
    .sort((a, b) => (a.ref !== b.ref ? a.ref - b.ref : a.romram < b.romram ? -1 : 1));
  const RAW = [1, 0.65, 0.4];
  const raws = ranked.map((e, i) => ({ romram: e.romram, raw: i < RAW.length ? RAW[i] : 0.25 }));
  const total = raws.reduce((acc, r) => acc + r.raw, 0);
  const out = new Map<string, number>();
  for (const r of raws) out.set(r.romram, r.raw / total);
  shareCache.set(key, out);
  return out;
}

// ---------------- 周销量估算 ----------------

const volCache = new Map<string, Map<string, number>>();

/**
 * 某型号 × 配置（汇总全部颜色 SKU）在某国的周销量估算。
 * 只含「该周该配置在该国至少有一条事实行」的周；值为非负整数（台）。
 */
export function volumeOfConfig(modelId: string, romram: string, countryCode: string): Map<string, number> {
  const cacheKey = `${countryCode}|${modelId}|${romram}`;
  const hit = volCache.get(cacheKey);
  if (hit) return hit;
  const out = new Map<string, number>();
  const rows = dimProduct.filter((p) => p.model_id === modelId && normRom(p.romram) === normRom(romram));
  if (rows.length === 0) {
    volCache.set(cacheKey, out);
    return out;
  }
  const head = rows[0];
  const ladder = dimTier.ladders[head.industry] ?? [];
  const tierCode = head.tier_by_country?.[countryCode] ?? head.tier_code;
  const share = configShares(modelId, countryCode).get(head.romram) ?? 1;
  const eol = rows.map((r) => r.eol_date).filter((d): d is string => !!d).sort()[0] ?? null;
  const dp = defaultPlatformOf(countryCode);
  const scale =
    INDUSTRY_BASE[head.industry]
    * tierFactor(ladder.indexOf(tierCode))
    * brandFactor(head.brand)
    * countryFactor(countryCode)
    * share;

  // 首个有事实行的周 = 生命周期 w=0 起点（按全时间周序的下标差计，缺采周也计入 w）
  let firstIdx = -1;
  const weekly: { idx: number; weekId: string; wed: string; rows: FactPriceWeekly[] }[] = [];
  timeRows.forEach((t, idx) => {
    const weekRows: FactPriceWeekly[] = [];
    for (const r of rows) weekRows.push(...factRows(countryCode, r.sku_id, t.week_id));
    if (weekRows.length === 0) return;
    if (firstIdx < 0) firstIdx = idx;
    weekly.push({ idx, weekId: t.week_id, wed: t.week_wed_date, rows: weekRows });
  });
  for (const w of weekly) {
    // 折扣深度：该周事实行里最低 price_local 那行的价格与其 rrp_local
    let bestPrice: number | null = null;
    let bestRrp: number | null = null;
    for (const row of w.rows) {
      if (row.price_local == null) continue;
      if (bestPrice == null || row.price_local < bestPrice) {
        bestPrice = row.price_local;
        bestRrp = row.rrp_local;
      }
    }
    // 促销档期：周三落在区间内（country 匹配、platforms 含该国默认电渠或全渠道）；多档取最深
    let promo = 1;
    for (const p of dimPromo) {
      if (p.country_code !== countryCode || p.start_date > w.wed || w.wed > p.end_date) continue;
      if (p.platforms != null && (dp == null || !p.platforms.includes(dp))) continue;
      promo = Math.max(promo, promoFactor(p.depth_hint));
    }
    const noise = 0.92 + 0.16 * hash01(`${countryCode}|${modelId}|${romram}|${w.weekId}`);
    const v =
      scale
      * lifecycleFactor(w.idx - firstIdx, eol != null && w.wed > eol)
      * discountFactor(bestPrice, bestRrp)
      * promo
      * noise;
    out.set(w.weekId, Math.max(0, Math.round(v)));
  }
  volCache.set(cacheKey, out);
  return out;
}

/** 粒度桶销量：周 = 直接取；月/季 = 按周求和；桶内无任何有值周 → null */
export function volumeByBuckets(
  modelId: string,
  romram: string,
  countryCode: string,
  granularity: Granularity,
  bucketIds: string[],
): (number | null)[] {
  const weekly = volumeOfConfig(modelId, romram, countryCode);
  if (granularity === 'week') return bucketIds.map((id) => weekly.get(id) ?? null);
  const field = granularity === 'month' ? ('month_id' as const) : ('quarter_id' as const);
  const sumBy = new Map<string, number>();
  for (const t of timeRows) {
    const v = weekly.get(t.week_id);
    if (v == null) continue;
    sumBy.set(t[field], (sumBy.get(t[field]) ?? 0) + v);
  }
  return bucketIds.map((id) => sumBy.get(id) ?? null);
}
