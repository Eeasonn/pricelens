// ============================================================
// §7.3 显示层聚合契约 —— 真实数据版（2026-10-20 多国多产业 cutover）
// 签名与类型冻结；图表层（Agent C）只消费 Series[]
// 确定性：真实事实数据无随机数；同输入两次调用输出逐字节一致。
// 口径：
//   - 单平台多产品（迪总定口径）：未选平台 = 该国「国家主要电渠」首个平台（分国默认电渠）；
//     渠道（平台×店铺类型）内多店铺取最低在架价，取价店铺随点带出（shopName）。
//   - 币种：真实行自带汇率，USD 已在装载层按行折算；本币 = 源表本币。
//   - RRP = 官网建议零售价（官方阶梯，不随平台/店铺变化；缺官网价回退平台划线价）。
// ============================================================
import type {
  CurrencyMode,
  DataScope,
  DimBenchmark,
  DimChannel,
  DimProduct,
  DimPromo,
  DimTime,
  FactPriceWeekly,
  Industry,
  OfferDetail,
  OfferInfo,
  OfferKind,
  PlatformQuery,
  Series,
  SeriesPoint,
  SeriesQuery,
  SkuGroupQuery,
} from './types';
import { dimBenchmark, dimChannel, dimProduct, dimPromo, dimRegion, dimTier, dimTime, factPriceWeekly } from '../data';
import prefillJson from '../data/dim_default_channel.json';
import { defaultShopOverrideOf } from '../state/defaultShopStore';
import { brandColorOf } from '../theme/tokens';
import { DEFAULT_DATA_SCOPE, isDataScopeSupported } from './scope';
import { displayPriceOf, displayRrpOf } from './currency';
import { getCurrentCountry } from '../state/currentScope';

// ---------------- 基础工具 ----------------
const normRom = (s: string): string => s.replace(/\s+/g, '');
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

// ---------------- 装载索引（模块内懒构建一次） ----------------
const timeRows: DimTime[] = [...dimTime].sort((a, b) => (a.week_id < b.week_id ? -1 : a.week_id > b.week_id ? 1 : 0));
const productById = new Map<string, DimProduct>(dimProduct.map((p) => [p.sku_id, p]));
const channelById = new Map<string, DimChannel>(dimChannel.map((c) => [c.channel_id, c]));

type FactIndex = Map<string, Map<string, Map<string, FactPriceWeekly[]>>>;
let factIdx: FactIndex | null = null;
function factIndex(): FactIndex {
  if (!factIdx) {
    factIdx = new Map();
    for (const row of factPriceWeekly) {
      let bySku = factIdx.get(row.country_code);
      if (!bySku) {
        bySku = new Map();
        factIdx.set(row.country_code, bySku);
      }
      let byWeek = bySku.get(row.sku_id);
      if (!byWeek) {
        byWeek = new Map();
        bySku.set(row.sku_id, byWeek);
      }
      const rows = byWeek.get(row.week_id);
      if (rows) rows.push(row);
      else byWeek.set(row.week_id, [row]);
    }
  }
  return factIdx;
}
/** 某国某 SKU 某周的全部渠道行（店铺级） */
export function factRows(countryCode: string, skuId: string, weekId: string): FactPriceWeekly[] {
  return factIndex().get(countryCode)?.get(skuId)?.get(weekId) ?? [];
}

// ---------------- 桶（bucket）计算 ----------------
interface Bucket {
  id: string; // 周 YYYYWW / 月 YYYYMM / 季 YYYYQn
  xLabel: string; // 周=周三 MM-DD / 月=YYYYMM / 季=YYYYQn
  anchorDate: string; // 代表周周三
  anchorWeekId: string; // 代表周 week_id（fact 查询键）
  weekIds: string[]; // 桶内周（升序）
}
function buildBuckets(q: SeriesQuery): Bucket[] {
  const inRange = (id: string) => q.startBucket <= id && id <= q.endBucket;
  if (q.granularity === 'week') {
    return timeRows
      .filter((w) => inRange(w.week_id))
      .map((w) => ({ id: w.week_id, xLabel: w.week_wed_date.slice(5), anchorDate: w.week_wed_date, anchorWeekId: w.week_id, weekIds: [w.week_id] }));
  }
  const field = q.granularity === 'month' ? 'month_id' : 'quarter_id';
  const grouped = new Map<string, DimTime[]>();
  for (const w of timeRows) {
    const id = w[field];
    if (!inRange(id)) continue;
    const arr = grouped.get(id);
    if (arr) arr.push(w);
    else grouped.set(id, [w]);
  }
  return [...grouped.entries()].map(([id, weeks]) => {
    const mid = weeks[Math.floor(weeks.length / 2)];
    return {
      id,
      xLabel: id,
      anchorDate: mid.week_wed_date, // 桶中代表周周三
      anchorWeekId: mid.week_id,
      weekIds: weeks.map((w) => w.week_id),
    };
  });
}

// ---------------- 组解析 ----------------
interface ResolvedGroup {
  skuIds: string[];
  brand: string;
  modelName: string;
  romram: string;
  isOwn: boolean;
}
function resolveGroup(g: SkuGroupQuery): ResolvedGroup | null {
  const prefix = g.modelId + '__';
  const modelRows = dimProduct.filter((p) => p.sku_id.startsWith(prefix));
  if (modelRows.length === 0) return null;
  let skuIds = g.skuIds.filter((id) => productById.has(id));
  if (skuIds.length === 0) {
    // 防御：未带 SKU 时回落到该型号+配置的全部颜色
    skuIds = modelRows.filter((p) => normRom(p.romram) === normRom(g.romram)).map((p) => p.sku_id);
  }
  if (skuIds.length === 0) return null;
  const repr = productById.get(skuIds[0]) ?? modelRows[0];
  return {
    skuIds,
    brand: repr.brand,
    modelName: repr.model_name,
    romram: repr.romram,
    isOwn: g.isOwn || modelRows[0].is_own === true,
  };
}

// ---------------- 平台口径 ----------------
/** 国家默认平台 = dim_region.default_platform（「国家主要电渠」首个；ingest 已按数据兜底）；维表缺失时回该国首个渠道平台 */
export function defaultPlatformOf(countryCode: string): string | null {
  return dimRegion.find((r) => r.country_code === countryCode)?.default_platform
    ?? dimChannel.find((c) => c.country_code === countryCode)?.platform
    ?? null;
}

/** 默认平台店铺预填表（冷启动，第一百三十七轮）：scripts/prefill_default_shops.py 按事实包统计生成——
 *  每国默认平台（dim_region.default_platform）下有事实价行数最多的渠道（数据最全 = 主店；
 *  并列取 channel_id 字典序最小）。键 = 国家码；"_comment" 为生成规则说明字段（非国家码，
 *  过滤后不参与查询）。事实包重接后需重跑脚本刷新（verify.mjs 有一致性断言）。 */
const prefillDefaultChannel = new Map<string, string>(
  Object.entries(prefillJson as unknown as Record<string, string>).filter(([k]) => !k.startsWith('_')),
);

/** 预填默认平台店铺（channel_id 级）；未登记或预填渠道不在该国维表 = null（重接数据后漂移防御） */
export function prefillDefaultChannelOf(countryCode: string): string | null {
  const pre = prefillDefaultChannel.get(countryCode) ?? null;
  if (!pre) return null;
  return dimChannel.some((c) => c.country_code === countryCode && c.channel_id === pre) ? pre : null;
}

/** 国家默认平台店铺（第一百三十七轮回退链）：
 *  ① 配置页「默认平台店铺」人工覆盖（LPL3.config.defaultShop，channel 级）
 *  → ② 维表预填（数据主店，dim_default_channel.json；校验渠道属国）
 *  → ③ null（回默认平台全部渠道口径的兜底；预填全量覆盖后理论上不触发，保留防御） */
export function defaultChannelOf(countryCode: string): string | null {
  const o = defaultShopOverrideOf(countryCode);
  if (o) {
    const hit = dimChannel.find((c) => c.country_code === countryCode && c.channel_id === o);
    if (hit) return o;
  }
  return prefillDefaultChannelOf(countryCode);
}

/** 未选平台/店铺时的「平台锚点」：默认店铺归属平台 → 未配置回国家默认平台。
 *  促销档期（平台限定档期是否显示/生效）等按平台对齐的口径统一走这里，
 *  与价格取数点（effectiveChannelIds）锚定同一家店所在平台。 */
export function defaultPlatformAnchorOf(countryCode: string): string | null {
  const dc = defaultChannelOf(countryCode);
  if (dc) return dimChannel.find((c) => c.channel_id === dc)?.platform ?? null;
  return defaultPlatformOf(countryCode);
}

/** 生效渠道集合：未选 = 配置的默认平台店铺（channel 级）→ 未配置再回默认平台全部渠道；
 *  显式勾选 = 平台/渠道并集（渠道级单选 = shopIds:[一个]，平台级兼容 = platforms:[一个]） */
export function effectiveChannelIds(countryCode: string, platform: PlatformQuery | null): string[] {
  const all = dimChannel.filter((c) => c.country_code === countryCode);
  if (!platform || (platform.platforms.length === 0 && platform.shopIds.length === 0)) {
    const dc = defaultChannelOf(countryCode);
    if (dc) return [dc];
    const dp = defaultPlatformOf(countryCode);
    return all.filter((c) => c.platform === dp).map((c) => c.channel_id);
  }
  const out: string[] = [];
  for (const c of all) {
    if (platform.platforms.includes(c.platform) || platform.shopIds.includes(c.channel_id)) out.push(c.channel_id);
  }
  return out;
}

/** 平台勾选是否整体属于该国（渠道与整平台都按该国渠道表核对；null = 默认电渠恒合法）。
 *  口径切换/读链接时不合法即回默认电渠——否则旧国家的整平台勾选解析成空渠道集，
 *  所有取价落空、整页空白。 */
export function platformSelectionValidFor(countryCode: string, platform: PlatformQuery | null): boolean {
  if (!platform) return true;
  const ccPlatforms = new Set<string>();
  for (const c of dimChannel) if (c.country_code === countryCode) ccPlatforms.add(c.platform);
  return (
    platform.shopIds.every((id) => channelById.get(id)?.country_code === countryCode)
    && platform.platforms.every((p) => ccPlatforms.has(p))
  );
}

/** 取价店铺文案：渠道显示名（如 "DNS 独立站"）+ 具体店铺（有意义时） */
function shopLabelOf(row: FactPriceWeekly): string {
  const ch = channelById.get(row.channel_id);
  const sellerRaw = (row.seller ?? '').trim();
  const placeholder = /^(—|unknown|unreadable|not_displayed|n\/a|nan|-)$/i.test(sellerRaw);
  const seller = placeholder ? '' : sellerRaw;
  const base = ch?.display_name ?? row.channel_id;
  const redundant = !seller || base.toLowerCase().includes(seller.toLowerCase()) || seller.toLowerCase() === (ch?.platform ?? '').toLowerCase();
  return redundant ? base : `${base} · ${seller}`;
}

/** 裸机口径取最低价行：组合销售（套装）行不参与比较，仅当全部为套装时回退套装最低价；
 *  priceOf 返回 null 的行跳过（渠道过滤也可收进 priceOf 以免分配中间数组）。
 *  第一百二十五轮：看板取价、总览现价/火花线、代表色、平台价差、浮窗现价、量价折扣因子
 *  全部走此函数——此前仅看板排除套装，同一 SKU 同一周跨页面出现两个价格。 */
export function minPriceOfRows<R extends { bundle: boolean }>(
  rows: Iterable<R>,
  priceOf: (row: R) => number | null,
  prefer: (cand: { row: R; price: number }, best: { row: R; price: number }) => boolean = (c, b) => c.price < b.price,
): { row: R; price: number } | null {
  let best: { row: R; price: number } | null = null;
  let bestBundle: { row: R; price: number } | null = null;
  for (const row of rows) {
    const v = priceOf(row);
    if (v == null) continue;
    const cand = { row, price: v };
    if (row.bundle) {
      if (!bestBundle || prefer(cand, bestBundle)) bestBundle = cand;
    } else if (!best || prefer(cand, best)) {
      best = cand;
    }
  }
  return best ?? bestBundle;
}

/** 渠道集合内取最低在架价行（折后价口径 = 可抓取渠道最低在架价） */
function minPriceRow(
  countryCode: string,
  skuId: string,
  weekId: string,
  channels: Set<string>,
  currency: CurrencyMode,
  seller: string | null = null,
): { row: FactPriceWeekly; price: number } | null {
  return minPriceOfRows(factRows(countryCode, skuId, weekId), (row) =>
    channels.has(row.channel_id) && (seller == null || row.seller === seller)
      ? displayPriceOf(row, currency)
      : null,
  );
}

// ---------------- 卖家店铺（第一百四十一轮：渠道内可下钻到具体卖家） ----------------

export interface ChannelSeller {
  seller: string; // 事实行 seller（源表「店铺名称」）
  weeks: number; // 该卖家在此渠道的有价周数（覆盖越全越靠前）
}

let sellersCache: { cc: string; values: Map<string, ChannelSeller[]> } | null = null;

/** 渠道内卖家清单（有价行口径）：按覆盖周数降序、同数按名称；懒构建缓存（事实静态）。
 *  独立站类渠道通常 1 家；平台 3P 渠道可达数百——供筛选第三列与 seller 合法性校验。 */
export function sellersOfChannel(countryCode: string, channelId: string): ChannelSeller[] {
  if (sellersCache?.cc !== countryCode) {
    // 单遍扫描：渠道 → 卖家 → 有价周集合（同卖家多 SKU/多行同周去重）
    const weeksByChannel = new Map<string, Map<string, Set<string>>>();
    for (const r of factPriceWeekly) {
      if (r.country_code !== countryCode || r.price_local == null) continue;
      let bySeller = weeksByChannel.get(r.channel_id);
      if (!bySeller) {
        bySeller = new Map();
        weeksByChannel.set(r.channel_id, bySeller);
      }
      let w = bySeller.get(r.seller);
      if (!w) {
        w = new Set();
        bySeller.set(r.seller, w);
      }
      w.add(r.week_id);
    }
    const out = new Map<string, ChannelSeller[]>();
    for (const [ch, bySeller] of weeksByChannel) {
      out.set(
        ch,
        [...bySeller.entries()]
          .map(([seller, w]) => ({ seller, weeks: w.size }))
          .sort((a, b) => b.weeks - a.weeks || a.seller.localeCompare(b.seller)),
      );
    }
    sellersCache = { cc: countryCode, values: out };
  }
  return sellersCache.values.get(channelId) ?? [];
}

/** 平台选择中的卖家细化：仅单渠道选择时有意义（normalizePlatformSelection 保证），其余 = null */
export function sellerOfQuery(platform: PlatformQuery | null): string | null {
  return platform && platform.shopIds.length === 1 ? platform.seller ?? null : null;
}

let platformSellersCache: { cc: string; values: Map<string, ChannelSeller[]> } | null = null;

/** 平台内卖家清单（跨该平台全部渠道合并；第一百四十二轮追补三：多平台比价下钻用）。
 *  同名卖家跨渠道（1P/3P）取覆盖周并集；按覆盖周数降序、同数按名称。 */
export function sellersOfPlatform(countryCode: string, platform: string): ChannelSeller[] {
  if (platformSellersCache?.cc !== countryCode) {
    const weeksByPlatform = new Map<string, Map<string, Set<string>>>();
    const platformOfChannel = new Map(dimChannel.filter((c) => c.country_code === countryCode).map((c) => [c.channel_id, c.platform]));
    for (const r of factPriceWeekly) {
      if (r.country_code !== countryCode || r.price_local == null) continue;
      const pf = platformOfChannel.get(r.channel_id);
      if (!pf) continue;
      let bySeller = weeksByPlatform.get(pf);
      if (!bySeller) {
        bySeller = new Map();
        weeksByPlatform.set(pf, bySeller);
      }
      let w = bySeller.get(r.seller);
      if (!w) {
        w = new Set();
        bySeller.set(r.seller, w);
      }
      w.add(r.week_id);
    }
    const out = new Map<string, ChannelSeller[]>();
    for (const [pf, bySeller] of weeksByPlatform) {
      out.set(
        pf,
        [...bySeller.entries()]
          .map(([seller, w]) => ({ seller, weeks: w.size }))
          .sort((a, b) => b.weeks - a.weeks || a.seller.localeCompare(b.seller)),
      );
    }
    platformSellersCache = { cc: countryCode, values: out };
  }
  return platformSellersCache.values.get(platform) ?? [];
}

/** 平台（可指定卖家）周内最低折后价：多平台比价的卖家下钻取数——
 *  seller null = 平台全部卖家取最低（与 platformPriceSpread 单平台价同口径） */
export function priceForPlatformSeller(
  countryCode: string,
  skuId: string,
  weekId: string,
  platform: string,
  seller: string | null,
  currency: CurrencyMode,
): { price: number } | null {
  return minPriceOfRows(factRows(countryCode, skuId, weekId), (row) => {
    if (seller != null && row.seller !== seller) return null;
    const ch = dimChannel.find((c) => c.channel_id === row.channel_id);
    return ch?.platform === platform ? displayPriceOf(row, currency) : null;
  });
}

/** 单点取价（预警引擎与看板共享）：该国渠道选择内的最低折后价 */
export function priceForSelection(
  skuId: string,
  weekId: string,
  countryCode: string,
  platform: PlatformQuery | null,
  currency: CurrencyMode,
): { price: number; row: FactPriceWeekly } | null {
  const set = new Set(effectiveChannelIds(countryCode, platform));
  return minPriceRow(countryCode, skuId, weekId, set, currency, sellerOfQuery(platform));
}

/** 周内各平台真实最低价（升序）：预警「平台价差」与总览「多平台对比」共用 */
export function platformPriceSpread(
  skuId: string,
  weekId: string,
  countryCode: string,
  currency: CurrencyMode,
): { platform: string; price: number }[] {
  const byPlatform = new Map<string, FactPriceWeekly[]>();
  for (const row of factRows(countryCode, skuId, weekId)) {
    const ch = channelById.get(row.channel_id);
    if (!ch) continue;
    const arr = byPlatform.get(ch.platform);
    if (arr) arr.push(row);
    else byPlatform.set(ch.platform, [row]);
  }
  const out: { platform: string; price: number }[] = [];
  for (const [platform, rows] of byPlatform) {
    const hit = minPriceOfRows(rows, (row) => displayPriceOf(row, currency));
    if (hit) out.push({ platform, price: hit.price });
  }
  return out.sort((a, b) => a.price - b.price);
}

// ---------------- offer 解析（真实分期/促销/组合三列 → 三类权益） ----------------
function findPromoForDate(countryCode: string, anchorDate: string, platform?: string): DimPromo | undefined {
  const hit = dimPromo.filter(
    (p) => p.country_code === countryCode && p.start_date <= anchorDate && anchorDate <= p.end_date
      && (p.platforms == null || (platform != null && p.platforms.includes(platform))),
  );
  return hit[0];
}

function toOfferInfo(row: FactPriceWeekly, countryCode: string, anchorDate: string): OfferInfo | null {
  const ch = channelById.get(row.channel_id);
  const promo = findPromoForDate(countryCode, anchorDate, ch?.platform);
  const promoName = promo?.promo_name ?? '平台促销';
  const mk = (kind: OfferKind, headline: string, detail: string, endDate: string): OfferDetail => ({
    kind,
    promoName,
    headline,
    detail,
    endDate,
    remainingDays: Math.max(0, daysBetween(anchorDate, endDate)),
  });
  const out: OfferInfo = {};
  if (row.promo_text) {
    const first = row.promo_text.split('/')[0]?.trim() ?? '';
    out.discount = mk('discount', first.length > 20 ? `${first.slice(0, 20)}…` : first || '平台促销', row.promo_text, promo?.end_date ?? anchorDate);
  }
  if (row.installment) {
    const head = row.installment.split('/')[0]?.trim() ?? '';
    out.installment = mk('installment', head.length > 16 ? `${head.slice(0, 16)}…` : head || '分期付款', row.installment, anchorDate);
  }
  if (row.bundle) {
    out.gift = mk('gift', '组合销售', '该上架为组合/套装销售，页面价为套装价', anchorDate);
  }
  return out.discount || out.installment || out.gift ? out : null;
}

// ---------------- §7.3 取数契约唯一入口 ----------------
export function buildSeries(q: SeriesQuery): Series[] {
  if (!isDataScopeSupported(q.scope)) return [];
  const cc = q.scope.countryCode;
  const buckets = buildBuckets(q);
  const channels = new Set(effectiveChannelIds(cc, q.platform));
  const seller = sellerOfQuery(q.platform);
  const out: Series[] = [];
  for (const g of q.groups) {
    const rg = resolveGroup(g);
    if (!rg) continue;
    const key = `${g.modelId}__${normRom(rg.romram)}`;
    const color = brandColorOf(rg.brand);
    const points: SeriesPoint[] = [];
    for (const bucket of buckets) {
      // 折后价：组内多 SKU（颜色）算术均值，各 SKU 取渠道内最低在架价；全缺 = missing
      const weeklyVals: (number | null)[] = bucket.weekIds.map((wid) => {
        let sum = 0;
        let n = 0;
        for (const sid of rg.skuIds) {
          const hit = minPriceRow(cc, sid, wid, channels, q.currency, seller);
          if (!hit) continue;
          sum += hit.price;
          n++;
        }
        return n > 0 ? sum / n : null;
      });
      const present = weeklyVals.filter((v): v is number => v != null);
      const price =
        present.length > 0
          ? q.granularity !== 'week' && q.agg === 'min'
            ? Math.min(...present)
            : present.reduce((a, b) => a + b, 0) / present.length
          : null;

      // 每周最低价行（跨 SKU；minPriceRow 已按「裸机优先」排除套装行）——
      // RRP 与 url/取价店铺/offer/平台 都随它带出：同 SKU 同周多卖家/套装行会带出
      // 多个 RRP，各自按行序扫描会与折扣率/预警口径分叉
      const weeklyBest: ({ row: FactPriceWeekly; price: number } | null)[] = bucket.weekIds.map((wid) => {
        let weekBest: { row: FactPriceWeekly; price: number } | null = null;
        for (const sid of rg.skuIds) {
          const hit = minPriceRow(cc, sid, wid, channels, q.currency, seller);
          if (hit && (!weekBest || hit.price < weekBest.price)) weekBest = hit;
        }
        return weekBest;
      });

      // RRP：官方阶梯，不随渠道；桶内最后一个有值周的最低价行 RRP（该行无 RRP
      // 再回退扫非套装行，仍取最后有值）
      let rrp: number | null = null;
      for (const best of weeklyBest) {
        if (best) rrp = displayRrpOf(best.row, q.currency);
      }
      if (rrp == null) {
        for (let i = weeklyBest.length - 1; i >= 0 && rrp == null; i--) {
          const wid = bucket.weekIds[i];
          if (!weeklyBest[i]) continue;
          for (const sid of rg.skuIds) {
            for (const row of factRows(cc, sid, wid)) {
              if (!channels.has(row.channel_id) || row.bundle) continue;
              const v = displayRrpOf(row, q.currency);
              if (v != null) {
                rrp = v;
                break;
              }
            }
            if (rrp != null) break;
          }
        }
      }

      // url / 取价店铺 / offer / 平台：周 = 该周最低价所在行；月/季 = 桶内首个有值周
      let url = '';
      let shopName: string | null = null;
      let platform: string | null = null;
      let offer: OfferInfo | null = null;
      const firstBest = weeklyBest.find((best): best is { row: FactPriceWeekly; price: number } => best != null);
      if (firstBest) {
        url = firstBest.row.url || '';
        shopName = shopLabelOf(firstBest.row);
        platform = channelById.get(firstBest.row.channel_id)?.platform ?? null;
        offer = toOfferInfo(firstBest.row, cc, bucket.anchorDate);
      }

      points.push({
        bucketId: bucket.id,
        xLabel: bucket.xLabel,
        anchorDate: bucket.anchorDate,
        rrp: rrp != null ? Math.round(rrp) : null,
        price: price != null ? Math.round(price) : null,
        missing: price == null,
        offer,
        url,
        shopName,
        platform,
      });
    }
    out.push({
      key,
      isOwn: rg.isOwn,
      brand: rg.brand,
      label: `${rg.brand} ${rg.modelName} ${rg.romram}`,
      skuIds: [...rg.skuIds],
      color,
      points,
    });
  }
  return out;
}

/**
 * 某型号+配置下"最新折后价最低的颜色" sku_id（默认平台口径，缺省国家 = 当前分析国）。
 * 从最新周向前回溯，第一个"至少一个渠道行有价"的周内取最低者（同价取 sku_id 字典序最小）。
 * 币种默认 usd = 看板/预警/总览的默认显示币种——代表色应在用户看到的币种下最便宜
 * （行内汇率同一周可不同，本币排序在 USD 视图下可能标错最便宜色）。
 */
export function lowestPriceColorSku(
  modelId: string,
  romram: string,
  countryCode: string = getCurrentCountry(),
  currency: CurrencyMode = 'usd',
): string | null {
  const rows = dimProduct.filter((p) => p.sku_id.startsWith(modelId + '__') && normRom(p.romram) === normRom(romram));
  if (rows.length === 0) return null;
  const channels = new Set(effectiveChannelIds(countryCode, null));
  const preferCheaperThenSku = (c: { row: FactPriceWeekly; price: number }, b: { row: FactPriceWeekly; price: number }): boolean =>
    c.price < b.price || (c.price === b.price && c.row.sku_id < b.row.sku_id);
  for (let i = timeRows.length - 1; i >= 0; i--) {
    const wid = timeRows[i].week_id;
    const weekRows: FactPriceWeekly[] = [];
    for (const r of rows) {
      for (const row of factRows(countryCode, r.sku_id, wid)) if (channels.has(row.channel_id)) weekRows.push(row);
    }
    const hit = minPriceOfRows(weekRows, (row) => displayPriceOf(row, currency), preferCheaperThenSku);
    if (hit) return hit.row.sku_id;
  }
  return null;
}

// ---------------- 上市基线（促销力度表用） ----------------

/** 上市基线信息（促销力度 = 折后价相对上市价的降幅；缺省国家 = 当前分析国） */
export interface LaunchInfo {
  launchPriceLocal: number | null;
  launchPriceUsd: number | null;
  launchDate: string; // YYYY-MM-DD（首次采集周三）
  eolDate: string | null; // null=在售
}

export function launchInfoOf(skuIds: string[], countryCode: string = getCurrentCountry()): LaunchInfo | null {
  const prows = skuIds.map((id) => productById.get(id)).filter((p): p is DimProduct => !!p);
  if (prows.length === 0) return null;
  const channels = new Set(effectiveChannelIds(countryCode, null));
  let launchPriceLocal: number | null = null;
  let launchPriceUsd: number | null = null;
  for (const w of timeRows) {
    for (const id of skuIds) {
      for (const row of factRows(countryCode, id, w.week_id)) {
        if (!channels.has(row.channel_id)) continue;
        if (row.rrp_local != null && launchPriceLocal == null) {
          launchPriceLocal = row.rrp_local;
          launchPriceUsd = row.rrp_usd;
        }
      }
    }
    if (launchPriceLocal != null) break;
  }
  const launchDate = prows.map((p) => p.launch_date).sort()[0];
  const eolDate = prows.map((p) => p.eol_date).filter((d): d is string => !!d).sort()[0] ?? null;
  return { launchPriceLocal, launchPriceUsd, launchDate, eolDate };
}

// ---------------- 生命周期调价幅度（季粒度系列名第二行） ----------------
export interface LifecycleDelta {
  /** 末季季均折后(本币) / 首销季季均折后(本币) − 1；恒本币口径，与显示币种/刷选窗口无关 */
  pct: number;
  /** 生命周期进行中（eol_date 为空）；展示层统显「生命周期 −X%」，仅数据语义 */
  ongoing: boolean;
}

const quarterIdOfDate = (date: string): string => {
  const [y, m] = date.split('-').map(Number);
  return `${y}Q${Math.floor((m - 1) / 3) + 1}`;
};
const quarterByWeek = new Map<string, string>(dimTime.map((w) => [w.week_id, w.quarter_id]));

/**
 * 生命周期调价幅度：「首销季 → 末季」季均折后价(本币) 变化（缺省国家 = 当前分析国）。
 * - 首销季 = launch_date 所在季；该季无采数时回退首个有值季
 * - 末季：完结产品 = eol 前最后有值季；在售产品 = 数据最后有值季（暂计）
 * - 仅季粒度消费；周/月粒度不渲染
 */
export function lifecycleDeltaOf(skuIds: string[], countryCode: string = getCurrentCountry()): LifecycleDelta | null {
  const prows = skuIds.map((id) => productById.get(id)).filter((p): p is DimProduct => !!p);
  if (prows.length === 0) return null;
  const launchDate = prows.map((p) => p.launch_date).sort()[0];
  const eolDate = prows.map((p) => p.eol_date).filter((d): d is string => !!d).sort()[0] ?? null;
  const channels = new Set(effectiveChannelIds(countryCode, null));
  const acc = new Map<string, { s: number; n: number }>();
  for (const id of skuIds) {
    const byWeek = factIndex().get(countryCode)?.get(id);
    if (!byWeek) continue;
    for (const [weekId, rows] of byWeek) {
      if (rows[0]?.crawl_status !== 'ok') continue;
      const wed = timeRows.find((w) => w.week_id === weekId)?.week_wed_date;
      if (!wed || wed < launchDate || (eolDate != null && wed > eolDate)) continue;
      const q = quarterByWeek.get(weekId);
      let best: number | null = null;
      for (const row of rows) {
        if (!channels.has(row.channel_id)) continue;
        if (row.price_local != null && (best == null || row.price_local < best)) best = row.price_local;
      }
      if (best == null || !q) continue;
      const o = acc.get(q);
      if (o) {
        o.s += best;
        o.n += 1;
      } else {
        acc.set(q, { s: best, n: 1 });
      }
    }
  }
  if (acc.size === 0) return null;
  const launchQ = quarterIdOfDate(launchDate);
  const firstQ = acc.has(launchQ) ? launchQ : [...acc.keys()].sort()[0];
  const lastQ = [...acc.keys()].sort().reverse()[0];
  if (lastQ === firstQ) return null;
  const first = acc.get(firstQ)!;
  const last = acc.get(lastQ)!;
  if (first.s <= 0) return null;
  return { pct: last.s / last.n / (first.s / first.n) - 1, ongoing: eolDate == null };
}

// ---------------- benchmark 快捷查询（配置页/级联默认勾选可用） ----------------
/** 某国某我司型号+配置的默认竞品 sku_id 列表（按 sort 升序；缺省国家 = 当前分析国） */
export function defaultCompetitorSkus(ownModelId: string, ownRomram: string, countryCode: string = getCurrentCountry()): string[] {
  const norm = normRom(ownRomram);
  return dimBenchmark
    .filter((b) => b.country_code === countryCode && b.own_model_id === ownModelId && normRom(b.own_romram) === norm)
    .sort((a, b) => a.sort - b.sort)
    .map((b) => b.competitor_sku_id);
}

// ============================================================
// 国家总览矩阵：档位带（产业 USD 阶梯，高→低）× 型号组 × ROM 行。
// 与图表层零耦合：Overview 页直用。
// ============================================================

export interface OverviewSparkPoint {
  weekId: string;
  monthId: string;
  price: number | null; // 显示币种折后价（默认渠道口径）；缺采 = null
}

export interface OverviewColorOpt {
  color: string;
  skuId: string;
  price: number | null;
}

export interface OverviewRow {
  skuId: string; // 代表色 SKU（默认渠道最低价色）
  brand: string;
  modelName: string;
  romram: string;
  isOwn: boolean;
  lineColor: string;
  price: number | null;
  rrp: number | null;
  discountPct: number | null;
  asOfWeek: string;
  colors: OverviewColorOpt[];
  points: OverviewSparkPoint[];
  maxV: number | null;
  maxIdx: number;
  minV: number | null;
  minIdx: number;
}

export interface OverviewCompRow {
  skuId: string;
  brand: string;
  modelName: string;
  romram: string;
  color: string;
  lineColor: string;
  price: number | null;
  rrp: number | null;
  ownRomrams: string[];
  primary: boolean;
  colors: OverviewColorOpt[];
  points: OverviewSparkPoint[];
  maxV: number | null;
  maxIdx: number;
  minV: number | null;
  minIdx: number;
}

export interface OverviewModel {
  modelId: string;
  modelName: string;
  brand: string;
  isOwn: boolean;
  tierCode: string;
  launchPriceUsd: number;
  lifecyclePct: number | null;
  rows: OverviewRow[];
  comps: OverviewCompRow[];
}

export interface OverviewTierBand {
  tierCode: string;
  models: OverviewModel[];
}

/** 档位显示名（跨产业平铺：代码本身含金额，不会互撞） */
export const TIER_LABELS: Record<string, string> = Object.fromEntries(
  (Object.entries(dimTier.labels) as [Industry, Record<string, string>][]).flatMap(([, labels]) =>
    Object.entries(labels).map(([code, label]) => [code, label] as const),
  ),
);

/** 产业档位序（低 → 高）；总览展示时反转为高 → 低 */
export function tierOrderOf(industry: Industry): string[] {
  return dimTier.ladders[industry] ?? [];
}

/** 产业档位值域带（低 → 高）：`<200` → {0, 200}、`200-400` → {200, 400}、`1000+` → {1000, null}；
 *  label 与 Y 轴档位带同格式（'-' → '~'，tierLabelShort 继续适用） */
export function tierBandsOf(industry: Industry): { code: string; label: string; min: number; max: number | null }[] {
  return tierOrderOf(industry).map((code) => {
    const open = /^<(\d+)$/.exec(code);
    const range = /^(\d+)-(\d+)$/.exec(code);
    const topOpen = /^(\d+)\+$/.exec(code);
    return {
      code,
      label: code.replace('-', '~'),
      min: open ? 0 : range ? Number(range[1]) : topOpen ? Number(topOpen[1]) : 0,
      max: open ? Number(open[1]) : range ? Number(range[2]) : null,
    };
  });
}

/** 某国口径下的产品档位（分国档位优先，无该国记录回全局兜底） */
export function tierOf(p: DimProduct, countryCode: string = getCurrentCountry()): string {
  return p.tier_by_country?.[countryCode] ?? p.tier_code;
}

/** 某 SKU 在默认渠道口径下的最新有值周 */
function latestOf(
  skuId: string,
  cc: string,
  currency: CurrencyMode,
  channels: Set<string>,
): { price: number | null; rrp: number | null; weekId: string } {
  for (let i = timeRows.length - 1; i >= 0; i--) {
    const w = timeRows[i].week_id;
    const weekRows = factRows(cc, skuId, w);
    const hit = minPriceOfRows(weekRows, (row) => (channels.has(row.channel_id) ? displayPriceOf(row, currency) : null));
    if (!hit) continue;
    // RRP 随最低价行带出（与看板/预警同口径，且天然避开套装组合价）；该行无 RRP
    // 再回退扫非套装行——多卖家渠道下同 SKU 同周 RRP 有多个值，原「首个非空」
    // 取到哪行取决于行序，折扣率会与其他页面分叉
    let rrp = displayRrpOf(hit.row, currency);
    if (rrp == null) {
      for (const row of weekRows) {
        if (!channels.has(row.channel_id) || row.bundle) continue;
        const v = displayRrpOf(row, currency);
        if (v != null) {
          rrp = v;
          break;
        }
      }
    }
    return { price: hit.price, rrp, weekId: w };
  }
  return { price: null, rrp: null, weekId: timeRows[timeRows.length - 1]?.week_id ?? '' };
}

function sparkPoints(skuId: string, cc: string, currency: CurrencyMode, channels: Set<string>): OverviewSparkPoint[] {
  return timeRows.map((w) => {
    const hit = minPriceOfRows(factRows(cc, skuId, w.week_id), (row) =>
      channels.has(row.channel_id) ? displayPriceOf(row, currency) : null,
    );
    return { weekId: w.week_id, monthId: w.month_id, price: hit?.price ?? null };
  });
}

function extremes(points: OverviewSparkPoint[]): { maxV: number | null; maxIdx: number; minV: number | null; minIdx: number } {
  let maxV: number | null = null;
  let maxIdx = -1;
  let minV: number | null = null;
  let minIdx = -1;
  for (let i = 0; i < points.length; i++) {
    const v = points[i].price;
    if (v == null) continue;
    if (maxV == null || v > maxV) {
      maxV = v;
      maxIdx = i;
    }
    if (minV == null || v < minV) {
      minV = v;
      minIdx = i;
    }
  }
  return { maxV, maxIdx, minV, minIdx };
}

/**
 * 国家总览矩阵。确定性纯函数。
 * - 我司 ROM 行代表色 = lowestPriceColorSku（默认渠道最低价色，与看板默认视图同源）
 * - 竞品行 = benchmark（分国）对该型号全部配置的映射并集；主竞品在前
 */
export function buildOverviewMatrix(
  currency: CurrencyMode,
  bench: DimBenchmark[] = dimBenchmark,
  platform: PlatformQuery | null = null,
  scope: DataScope = DEFAULT_DATA_SCOPE,
): OverviewTierBand[] {
  if (!isDataScopeSupported(scope)) return [];
  const cc = scope.countryCode;
  const channels = new Set(effectiveChannelIds(cc, platform));
  const byModel = new Map<string, DimProduct[]>();
  for (const p of dimProduct) {
    if (p.industry !== scope.industry || !p.countries.includes(cc)) continue;
    const arr = byModel.get(p.model_id);
    if (arr) arr.push(p);
    else byModel.set(p.model_id, [p]);
  }

  const models: OverviewModel[] = [];
  for (const [modelId, prows] of byModel) {
    const head = prows[0];
    const romrams = [...new Set(prows.map((p) => p.romram))];
    const rows: OverviewRow[] = [];
    for (const rom of romrams) {
      const repSku = lowestPriceColorSku(modelId, rom, cc);
      const romRows = prows.filter((p) => normRom(p.romram) === normRom(rom));
      const skuId = repSku ?? [...romRows].sort((a, b) => a.sku_id.localeCompare(b.sku_id))[0].sku_id;
      const lat = latestOf(skuId, cc, currency, channels);
      const points = sparkPoints(skuId, cc, currency, channels);
      const ex = extremes(points);
      const discountPct = lat.price != null && lat.rrp != null && lat.rrp > 0 ? lat.price / lat.rrp - 1 : null;
      rows.push({
        skuId,
        brand: head.brand,
        modelName: head.model_name,
        romram: rom,
        isOwn: head.is_own,
        lineColor: brandColorOf(head.brand),
        price: lat.price,
        rrp: lat.rrp,
        discountPct,
        asOfWeek: lat.weekId,
        colors: [...romRows]
          .sort((a, b) => a.sku_id.localeCompare(b.sku_id))
          .map((p) => ({ color: p.color, skuId: p.sku_id, price: latestOf(p.sku_id, cc, currency, channels).price })),
        points,
        ...ex,
      });
    }
    rows.sort((a, b) => (b.price ?? -1) - (a.price ?? -1) || a.romram.localeCompare(b.romram));

    const compMap = new Map<string, { romrams: Set<string>; primary: boolean }>();
    if (head.is_own) {
      for (const b of bench) {
        if (b.country_code !== cc || b.own_model_id !== modelId) continue;
        const e = compMap.get(b.competitor_sku_id);
        if (e) {
          e.romrams.add(b.own_romram);
          e.primary = e.primary || b.sort === 1;
        } else {
          compMap.set(b.competitor_sku_id, { romrams: new Set([b.own_romram]), primary: b.sort === 1 });
        }
      }
    }
    const comps: OverviewCompRow[] = [];
    for (const [skuId, agg] of compMap) {
      const p = productById.get(skuId);
      if (!p || !p.countries.includes(cc)) continue;
      const lat = latestOf(skuId, cc, currency, channels);
      const points = sparkPoints(skuId, cc, currency, channels);
      const compModelRows = byModel.get(p.model_id) ?? [];
      const compRomRows = compModelRows.filter((pp) => normRom(pp.romram) === normRom(p.romram));
      comps.push({
        skuId,
        brand: p.brand,
        modelName: p.model_name,
        romram: p.romram,
        color: p.color,
        lineColor: brandColorOf(p.brand),
        price: lat.price,
        rrp: lat.rrp,
        ownRomrams: [...agg.romrams].sort(),
        primary: agg.primary,
        colors: [...compRomRows]
          .sort((a, b) => a.sku_id.localeCompare(b.sku_id))
          .map((pp) => ({ color: pp.color, skuId: pp.sku_id, price: latestOf(pp.sku_id, cc, currency, channels).price })),
        points,
        ...extremes(points),
      });
    }
    comps.sort((a, b) => Number(b.primary) - Number(a.primary) || (b.price ?? -1) - (a.price ?? -1));

    models.push({
      modelId,
      modelName: head.model_name,
      brand: head.brand,
      isOwn: head.is_own,
      tierCode: tierOf(head, cc),
      launchPriceUsd: head.ref_price_usd ?? 0,
      lifecyclePct: head.is_own ? lifecycleDeltaOf(prows.map((p) => p.sku_id), cc)?.pct ?? null : null,
      rows,
      comps,
    });
  }

  const order = [...tierOrderOf(scope.industry)].reverse();
  return order.map((tierCode) => ({
    tierCode,
    models: models
      .filter((m) => m.tierCode === tierCode)
      .sort((a, b) => b.launchPriceUsd - a.launchPriceUsd || a.modelName.localeCompare(b.modelName)),
  })).filter((b) => b.models.length > 0);
}
