// ============================================================
// §7.3 显示层聚合契约 —— 真实数据版（2026-10-20 多国多产业 cutover）
// 签名与类型冻结；图表层（Agent C）只消费 Series[]
// 确定性：真实事实数据无随机数；同输入两次调用输出逐字节一致。
// 口径：
//   - 单平台多产品（迪总定口径）：未选平台 = 该国「国家主要电渠」首个平台（分国默认电渠）；
//     渠道（平台×店铺类型）内多店铺取最低在架价，取价店铺随点带出（shopName）。
//   - 币种：真实行自带汇率，USD 已在装载层按行折算；本币 = 源表本币。
//   - RRP = 官网建议零售价（官方阶梯，不随平台/店铺变化；缺官网价回退平台划线价）。
//   - 低侧异常价：零/负价、低于参照价（RRP/产品参考价）5% 的脏点不参与取最低
//     （minPriceOfRows 行级剔除；详见该函数上方守卫注释）。
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
import { anomalyManualOf, detectSuspects, promoBandHitOf, readAnomalyRule, type AnomalyMarkAction, type SuspectSourcePoint } from './anomaly';

// ---------------- 基础工具 ----------------
const normRom = (s: string): string => s.replace(/\s+/g, '');
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
/** 周锚日（周三）速查：异常判定促销带豁免按锚日比对 */
const wedByWeek = new Map<string, string>(dimTime.map((w) => [w.week_id, w.week_wed_date]));

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

/** R5-M1（目标国可落地平台归一化 · 计算与落地共用的共享规则）：平台勾选按目标国
 *  渠道表逐项过滤——整平台勾选须在该国在架，店铺（渠道）勾选须属于该国；有任一
 *  可落地部分则保留该子集（同国 RU+OZON 等有效平台与 shopIds 原样保留，不整体
 *  清空），全部不可落地 = null（回落目标国默认电渠，绝不解析成空渠道集导致取价
 *  全空）。完全可落地时返回原引用（调用方可用 === 判定「未发生归一化」）。
 *  seller 仅在其所属渠道保留时随行。 */
export function platformSelectionForCountry(platform: PlatformQuery | null | undefined, countryCode: string): PlatformQuery | null {
  if (!platform) return null;
  const platforms = platform.platforms.filter((p) => dimChannel.some((c) => c.country_code === countryCode && c.platform === p));
  const shopIds = platform.shopIds.filter((id) => channelById.get(id)?.country_code === countryCode);
  if (!platforms.length && !shopIds.length) return null;
  if (platforms.length === platform.platforms.length && shopIds.length === platform.shopIds.length) return platform;
  const seller = platform.seller != null && shopIds.length === 1 && shopIds[0] === platform.shopIds[0] ? platform.seller : null;
  return { platforms, shopIds, seller };
}

/** 平台口径项的用户可读标签：平台名原样（dim_channel.platform 即展示名，如
 *  "OZON"/"NOON"）；渠道 id 补渠道显示名（"RU:ozon:3P（OZON 3P）"）——归一化
 *  说明里同时保留源标识（渠道 id 可核查）与可读名，不裸吐机器 id。 */
export function platformScopeLabel(value: string): string {
  const hit = channelById.get(value);
  if (!hit || hit.display_name === value) return value;
  return `${value}（${hit.display_name}）`;
}

/** R4（三审 M1 · 共享作用域解析）：一条产品线的生效取价口径——每线显式
 *  selection.platform 优先；未带每线口径（或空勾选）回落全局筛选
 *  state.platform（URL shop=/plat=、Agent patch 落地、量价页全局口径来源）；
 *  两者皆无 = null（自动：该国全部渠道每周最低价）。趋势图、Agent 趋势
 *  queryCards、价格优势 buildPriceAdvantageResult、行级/整卡回看 patch 的
 *  每条线一律经此解析——不允许任何消费方只读其中一层造成「趋势 395、优势
 *  333」的双口径。店铺级（shopIds）原样参与 effectiveChannelIds 严格交集，
 *  不降平台、不混池（迭代线店铺级策略）；空勾选视为未选，不挡全局回落。 */
export function effectiveLinePlatform(
  selection: { platform?: PlatformQuery | null },
  statePlatform: PlatformQuery | null,
): PlatformQuery | null {
  const own = selection.platform;
  if (own && (own.platforms.length > 0 || own.shopIds.length > 0)) return own;
  if (statePlatform && (statePlatform.platforms.length > 0 || statePlatform.shopIds.length > 0)) return statePlatform;
  return null;
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

/** 低侧异常价判定阈值：价格低于参照价 5% 视为采集脏点、不参与最低价比较 */
const MIN_PLAUSIBLE_PRICE_FRACTION = 0.05;

/**
 * 低侧异常价守卫（数据正确性）：零/负价与「低于参照价 5%」的超低价不参与取最低——
 * 脏点直插最低价线会拉穿看板 / 总览 / 预警等全部取价路径（已知脏点：RU W19 批量
 * iPhone 折后 $6.76、Amazfit $1.83；PH/TH Shopee 十几美元的名表）。参照分两层：
 * ① 行内 rrp_usd——抓 RRP 正常、仅价格列脏的行；
 * ② 该 SKU 的 ref_price_usd（跨国官网 RRP 中位数）——W19 脏批整行自洽（rrp 与
 *    price 同被污染、rrp_usd == price_usd），行内参照失效，只能靠跨行参照识别。
 * price_usd 缺失（无法判定，部分本币行）不拦，维持原口径。
 */
function implausiblyLowRow(row: Partial<FactPriceWeekly>): boolean {
  const p = row.price_usd;
  if (p == null) return false;
  if (p <= 0) return true;
  if (row.rrp_usd != null && p < row.rrp_usd * MIN_PLAUSIBLE_PRICE_FRACTION) return true;
  const ref = productById.get(row.sku_id ?? '')?.ref_price_usd;
  return ref != null && p < ref * MIN_PLAUSIBLE_PRICE_FRACTION;
}

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
    // 异常价行整行剔除（含套装兜底路径），取最低的多条路径同受益
    if (implausiblyLowRow(row as Partial<FactPriceWeekly>)) continue;
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

/** R5（四审 m2 · 整配置平台比较）：按整条产品线选择展开平台价目——skuIds=[]
 *  （整配置）解析为该型号该配置在维表内的全部颜色 SKU（resolveGroup 同规则），
 *  多 SKU 部分选择同样按实际选择聚合，不再只取首 SKU。各平台价 = 选择内各
 *  SKU 在该平台渠道集内最低在架价（minPriceRow，裸机优先、异常价剔除）的
 *  算术平均——与 buildSeries 周聚合（先每 SKU 渠道内最低、再跨 SKU 均值）
 *  同构，绝不把单颜色价（黑 333）套给整配置（334）。单 SKU 时与
 *  platformPriceSpread 数值一致。 */
export function platformPriceSpreadOfSelection(
  sel: { modelId: string; romram: string; skuIds: readonly string[] },
  weekId: string,
  countryCode: string,
  currency: CurrencyMode,
): { members: number; wholeConfig: boolean; rows: Array<{ platform: string; price: number; skuCount: number }> } {
  let skuIds = sel.skuIds.filter((id) => productById.has(id));
  const wholeConfig = skuIds.length === 0;
  if (wholeConfig) {
    const prefix = sel.modelId + '__';
    skuIds = dimProduct.filter((p) => p.sku_id.startsWith(prefix) && normRom(p.romram) === normRom(sel.romram)).map((p) => p.sku_id);
  }
  if (!skuIds.length) return { members: 0, wholeConfig, rows: [] };
  const rows: Array<{ platform: string; price: number; skuCount: number }> = [];
  const byPlatform = new Map<string, string[]>();
  for (const channel of dimChannel) {
    if (channel.country_code !== countryCode) continue;
    const arr = byPlatform.get(channel.platform);
    if (arr) arr.push(channel.channel_id);
    else byPlatform.set(channel.platform, [channel.channel_id]);
  }
  for (const [platform, channelIds] of byPlatform) {
    const channels = new Set(channelIds);
    let sum = 0;
    let cnt = 0;
    for (const sid of skuIds) {
      const hit = minPriceRow(countryCode, sid, weekId, channels, currency);
      if (!hit) continue;
      sum += hit.price;
      cnt += 1;
    }
    if (cnt > 0) rows.push({ platform, price: sum / cnt, skuCount: cnt });
  }
  rows.sort((a, b) => a.price - b.price);
  return { members: skuIds.length, wholeConfig, rows };
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
  const out: Series[] = [];
  for (const g of q.groups) {
    const rg = resolveGroup(g);
    if (!rg) continue;
    // 每组独立取价口径（第一百六十轮起；第一百六十二轮自动语义改每周动态）——
    // 显式勾选按平台/渠道并集解析；缺省 = 自动：每周取该国全部平台-店铺的最低价
    // （哪家最低显示哪家，取证随行），主品渠道不再牵连对比品
    const explicit = g.platform ?? null;
    const explicitOn = explicit != null && (explicit.platforms.length > 0 || explicit.shopIds.length > 0);
    let channels: Set<string>;
    let badge: Series['channelBadge'];
    if (explicitOn && explicit) {
      channels = new Set(effectiveChannelIds(cc, explicit));
      const chs = dimChannel.filter((c) => channels.has(c.channel_id));
      const platforms = [...new Set(chs.map((c) => c.platform))];
      // R6（六审透明说明）：店铺级口径用渠道显示名（如 "OZON 3P"）点名实际
      // 参与计算的渠道——只挂平台名会把严格店铺级价误读成平台内最低价口径。
      const label = explicit.shopIds.length ? chs.map((c) => c.display_name).join('/') : platforms.join('/');
      badge = { label: label || '已选渠道', auto: false, platforms };
    } else {
      channels = new Set(dimChannel.filter((c) => c.country_code === cc).map((c) => c.channel_id));
      badge = {
        label: '自动', // 自动态在 weeklyBest 求出后回填为最新有价周的实际平台名
        auto: true,
        platforms: [...new Set([...channels].map((id) => channelById.get(id)?.platform ?? ''))],
      };
    }
    const seller = sellerOfQuery(explicitOn ? explicit : null);
    const key = `${g.modelId}__${normRom(rg.romram)}`;
    const color = brandColorOf(rg.brand);

    // ---- 异常价格守卫（2026-11-01 数据质量口径）：本系列判定上下文。规则每次
    //      调用现读配置（无新增缓存面）；人工裁定按点生效（周 id 裁定命中其构成
    //      月/季桶）；促销带按锚日任意档期。周粒度在最终序列点判定；月/季先在
    //      构成周序列判一道（隔离周不进桶聚合）、桶级点再判一道（双保险）。 ----
    const anomalyRule = readAnomalyRule();
    const manualRaw = anomalyManualOf(cc, key);
    const promoHit = promoBandHitOf(cc);

    // 周级取数预计算（整段范围一次）：桶循环复用，周级判定同源
    const weekVal = new Map<string, number | null>();
    const weekBest = new Map<string, { row: FactPriceWeekly; price: number } | null>();
    for (const bucket of buckets) {
      for (const wid of bucket.weekIds) {
        let sum = 0;
        let cnt = 0;
        let best: { row: FactPriceWeekly; price: number } | null = null;
        for (const sid of rg.skuIds) {
          const hit = minPriceRow(cc, sid, wid, channels, q.currency, seller);
          if (!hit) continue;
          sum += hit.price;
          cnt++;
          if (!best || hit.price < best.price) best = hit;
        }
        weekVal.set(wid, cnt > 0 ? sum / cnt : null);
        weekBest.set(wid, best);
      }
    }

    // 月/季：构成周序列上的隔离集（隔离周不进桶聚合）
    let quarantinedWeeks: Set<string> | null = null;
    if (q.granularity !== 'week' && anomalyRule.enabled) {
      const src: SuspectSourcePoint[] = [];
      for (const bucket of buckets) {
        for (const wid of bucket.weekIds) {
          src.push({ bucketId: wid, price: weekVal.get(wid) ?? null, anchorDate: wedByWeek.get(wid) });
        }
      }
      const weeklyVerdicts = detectSuspects(src, { rule: anomalyRule, manual: manualRaw, promoHit });
      quarantinedWeeks = new Set<string>();
      for (const [i, v] of weeklyVerdicts) {
        if (v.state === 'quarantined' && src[i]) quarantinedWeeks.add(src[i].bucketId);
      }
    }

    const points: SeriesPoint[] = [];
    for (const bucket of buckets) {
      // 折后价：组内多 SKU（颜色）算术均值，各 SKU 取渠道内最低在架价；全缺 = missing；
      // 月/季桶聚合剔除被隔离周（行级 5% 守卫拦绝对离谱、周级守卫拦相对形态，两层互补）
      const weeklyVals: (number | null)[] = bucket.weekIds.map((wid) => weekVal.get(wid) ?? null);
      const present: number[] = [];
      bucket.weekIds.forEach((wid, wi) => {
        const v = weeklyVals[wi];
        if (v != null && !(quarantinedWeeks?.has(wid))) present.push(v);
      });
      const price =
        present.length > 0
          ? q.granularity !== 'week' && q.agg === 'min'
            ? Math.min(...present)
            : present.reduce((a, b) => a + b, 0) / present.length
          : null;

      // 每周最低价行（跨 SKU；minPriceRow 已按「裸机优先」排除套装行）——
      // RRP 与 url/取价店铺/offer/平台 都随它带出：同 SKU 同周多卖家/套装行会带出
      // 多个 RRP，各自按行序扫描会与折扣率/预警口径分叉
      const weeklyBest: ({ row: FactPriceWeekly; price: number } | null)[] = bucket.weekIds.map((wid) => weekBest.get(wid) ?? null);

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

      // url / 取价店铺 / offer / 平台：周 = 该周最低价所在行；月/季 = 桶内首个有值周。
      // 渠道名（平台-店铺）逐列独立：自动口径每周来源可变，明细表按列说明取数来源
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
      const channelName = firstBest ? (channelById.get(firstBest.row.channel_id)?.display_name ?? null) : null;
      // 自动态平台小药丸显示具体平台名（第一百六十二轮，Eason）：取最新有价周的实际
      // 取数平台（口径本身仍是每周动态跟随最低价）
      if (badge != null && badge.auto) {
        for (let i = weeklyBest.length - 1; i >= 0; i--) {
          const b = weeklyBest[i];
          if (!b) continue;
          const pf = channelById.get(b.row.channel_id)?.platform;
          if (pf) {
            badge.label = pf;
            break;
          }
        }
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
        channelName,
        platform,
      });
    }
    // ---- 最终序列点级判定（周粒度主战场；月/季桶级双保险）：隔离 ≠ 删除——
    //      原值留在点结构里（不吞点），suspect 只作为下游可信链的退出信号 ----
    if (anomalyRule.enabled || manualRaw.size > 0) {
      // 人工裁定按点桶解析（周 id 裁定命中其构成月/季桶）
      const manual = new Map<string, AnomalyMarkAction>();
      if (manualRaw.size > 0) {
        for (const bucket of buckets) {
          const direct = manualRaw.get(bucket.id);
          const viaWeek = bucket.weekIds.length > 1
            ? bucket.weekIds.map((wid) => manualRaw.get(wid)).find((v) => v != null)
            : undefined;
          const action = direct ?? viaWeek;
          if (action) manual.set(bucket.id, action);
        }
      }
      const verdicts = detectSuspects(
        points.map((pt) => ({ bucketId: pt.bucketId, price: pt.price, rrp: pt.rrp, anchorDate: pt.anchorDate })),
        { rule: anomalyRule, manual, promoHit },
      );
      for (const [i, v] of verdicts) {
        points[i].suspect = v.state;
        points[i].suspectReason = v.reason;
        points[i].suspectWow = v.wow;
      }
    }
    out.push({
      key,
      isOwn: rg.isOwn,
      brand: rg.brand,
      // 无配置层级的产品（romram '—'，第一百五十三轮）系列名不带「—」尾缀
      label: [rg.brand, rg.modelName, rg.romram === '—' ? '' : rg.romram].filter(Boolean).join(' '),

      skuIds: [...rg.skuIds],
      color,
      points,
      platform: explicitOn ? explicit : null,
      channelBadge: badge,
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

/**
 * R3（M2 · 型号在架判定的渠道回退，与 lowestPriceColorSku 同源规则）：某型号+
 * 配置在目标国「全部在架渠道」范围内，从最新周向前回溯第一个有价周内取最低折后价
 * 颜色的 SKU。默认电渠（lowestPriceColorSku 的渠道口径）没有任何价格事实时使用——
 * 型号在该国 3P / 其他电渠有真实在架价 ≠ 型号无在架（真实事实：FR Mate X6 12+512
 * 仅 Amazon 3P 有 202638–202642 五条事实，默认 Amazon 1P 全程无价）。周回溯方向、
 * 同价 SKU 字典序与异常价守卫（minPriceOfRows 内建）完全一致，仅渠道范围放宽。
 */
export function lowestPriceColorSkuAnyChannel(
  modelId: string,
  romram: string,
  countryCode: string = getCurrentCountry(),
  currency: CurrencyMode = 'usd',
): string | null {
  const rows = dimProduct.filter((p) => p.sku_id.startsWith(modelId + '__') && normRom(p.romram) === normRom(romram));
  if (rows.length === 0) return null;
  const channels = new Set(dimChannel.filter((c) => c.country_code === countryCode).map((c) => c.channel_id));
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

/**
 * R3（M2 · 型号在架判定 / 渠道回退共用）：产品选择在目标国「有真实价格事实」的
 * 渠道 channel_id 列表（渠道表序去重，异常价守卫同源）。存在性探测专用——用于
 * 说明「型号在该国哪些渠道在架」与默认电渠无价时的透明渠道回退，不参与常规
 * 取价计算；skuIds 空 = 该配置全部颜色。
 */
export function pricedChannelIdsOfSelection(
  sel: { modelId: string; romram: string; skuIds: string[] },
  countryCode: string,
): string[] {
  const configRows = dimProduct.filter((p) => p.sku_id.startsWith(sel.modelId + '__') && normRom(p.romram) === normRom(sel.romram));
  const skuIds = sel.skuIds.length ? sel.skuIds.filter((id) => productById.has(id)) : configRows.map((p) => p.sku_id);
  if (skuIds.length === 0) return [];
  const countryChannels = dimChannel.filter((c) => c.country_code === countryCode);
  const byChannel = new Map<string, FactPriceWeekly[]>(countryChannels.map((c) => [c.channel_id, []]));
  for (const wid of timeRows) {
    for (const sid of skuIds) {
      for (const row of factRows(countryCode, sid, wid.week_id)) {
        byChannel.get(row.channel_id)?.push(row);
      }
    }
  }
  const out: string[] = [];
  for (const channel of countryChannels) {
    const rows = byChannel.get(channel.channel_id) ?? [];
    if (minPriceOfRows(rows, (row) => row.price_local) != null) out.push(channel.channel_id);
  }
  return out;
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
  /** 现价采集周（该竞品最后有价周）：points 含缺价周、末点不恒有价，取日期须以此为准 */
  asOfWeek: string;
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
        asOfWeek: lat.weekId,
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
