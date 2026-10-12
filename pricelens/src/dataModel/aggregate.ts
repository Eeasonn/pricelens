// ============================================================
// §7.3 显示层聚合契约 —— 数据负责人（Agent A）实现
// 签名与类型冻结；图表层（Agent C）只消费 Series[]
// 确定性：全部伪随机来自内置带 seed 的 PRNG（字符串标签 → FNV-1a → mulberry32），
// 禁止裸 Math.random；同输入两次调用输出逐字节一致。
// ============================================================
import type {
  DimChannel,
  DimProduct,
  DimPromo,
  DimTime,
  FactPriceWeekly,
  OfferInfo,
  Series,
  SeriesPoint,
  SeriesQuery,
  SkuGroupQuery,
} from './types';
import { dimBenchmark, dimChannel, dimProduct, dimPromo, dimTime, factPriceWeekly } from '../data';
import { brandColor } from '../theme/tokens';

// ---------------- 确定性 PRNG ----------------
function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rngFrom(seed: string): () => number {
  let a = fnv1a('pricelens-20261009|' + seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 每个标签独立、确定性地取一个 [0,1) 随机数 */
function rnd(label: string): number {
  return rngFrom(label)();
}

// ---------------- 基础工具 ----------------
const normRom = (s: string): string => s.replace(/\s+/g, '');
function parseDate(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / 86400000);
}

/** §11.5/§7.3 平台因子（演示口径；生产替换为真实抓取明细聚合） */
const PLATFORM_FACTOR: Record<string, number> = { OZON: 0, DNS: 0.008, 'M.Video': 0.015 };
const PLATFORM_JITTER = 0.003; // 固定 seed ±0.3% 抖动

// ---------------- 装载索引（模块内懒构建一次） ----------------
const timeRows: DimTime[] = [...dimTime].sort((a, b) => (a.week_id < b.week_id ? -1 : a.week_id > b.week_id ? 1 : 0));
const productById = new Map<string, DimProduct>(dimProduct.map((p) => [p.sku_id, p]));
const channelByShop = new Map<string, DimChannel>(dimChannel.map((c) => [c.shop_id, c]));

let factIdx: Map<string, Map<string, FactPriceWeekly>> | null = null;
function factIndex(): Map<string, Map<string, FactPriceWeekly>> {
  if (!factIdx) {
    factIdx = new Map();
    for (const row of factPriceWeekly) {
      let byWeek = factIdx.get(row.sku_id);
      if (!byWeek) {
        byWeek = new Map();
        factIdx.set(row.sku_id, byWeek);
      }
      byWeek.set(row.week_id, row);
    }
  }
  return factIdx;
}
function factRow(skuId: string, weekId: string): FactPriceWeekly | undefined {
  return factIndex().get(skuId)?.get(weekId);
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
    // 防御：未带 SKU 时回落到该型号+ROMRAM 的全部颜色
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
function effectivePlatforms(platform: SeriesQuery['platform']): string[] {
  if (!platform) return [];
  // 整平台勾选与跨平台单店勾选可并存（如 OZON 整平台 + DNS 单店），取并集做均值口径
  const set = new Set(platform.platforms);
  for (const id of platform.shopIds) {
    const p = channelByShop.get(id)?.platform;
    if (p) set.add(p);
  }
  return [...set];
}
/** 折后价(平台) = base × (1 + factor_p ± 0.3% seed 抖动)；多选取均值 */
function applyPlatform(base: number, skuId: string, weekId: string, platforms: string[]): number {
  if (platforms.length === 0) return base;
  let sum = 0;
  for (const p of platforms) {
    const f = PLATFORM_FACTOR[p] ?? 0;
    const jitter = (rnd(`pf|${p}|${skuId}|${weekId}`) * 2 - 1) * PLATFORM_JITTER;
    sum += base * (1 + f + jitter);
  }
  return sum / platforms.length;
}

// ---------------- 店铺指派（演示性虚构：最低价来自哪家店铺） ----------------
function pickShop(seed: string, platform: SeriesQuery['platform']): string | null {
  let pool = dimChannel;
  if (platform) {
    if (platform.shopIds.length > 0) {
      pool = dimChannel.filter((c) => platform.shopIds.includes(c.shop_id));
    } else if (platform.platforms.length > 0) {
      pool = dimChannel.filter((c) => platform.platforms.includes(c.platform));
    }
  }
  if (pool.length === 0) pool = dimChannel;
  return pool[Math.floor(rnd('shop|' + seed) * pool.length) % pool.length]?.shop_name ?? null;
}

// ---------------- offer 解析 ----------------
/** offer_title = "档期名 · 类型"，用档期名前缀回查 dim_promo 得 endDate */
function findPromoForOffer(title: string, anchorDate: string): DimPromo | undefined {
  const candidates = dimPromo.filter((p) => title.startsWith(p.promo_name));
  if (candidates.length === 0) return undefined;
  return (
    candidates.find((p) => p.start_date <= anchorDate && anchorDate <= p.end_date) ??
    [...candidates].sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0]
  );
}
function parseRubInText(text: string, keyword: string): number | undefined {
  const m = new RegExp(`${keyword}\\s*([\\d\\s\\u00A0]+)卢布`).exec(text);
  if (!m) return undefined;
  const n = Number(m[1].replace(/[\s\u00A0]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}
function toOfferInfo(row: FactPriceWeekly, anchorDate: string, platforms: string[]): OfferInfo | null {
  if (row.offer_title == null) return null;
  const promo = findPromoForOffer(row.offer_title, anchorDate);
  const endDate = promo?.end_date ?? anchorDate;
  const info: OfferInfo = {
    title: row.offer_title,
    text: row.offer_text ?? '',
    endDate,
    remainingDays: daysBetween(anchorDate, endDate),
    platforms,
  };
  const text = row.offer_text ?? '';
  const bank = parseRubInText(text, '银行价');
  if (bank != null) info.bankPriceRub = bank;
  const tariff = parseRubInText(text, '关税约');
  if (tariff != null) info.tariffEstRub = tariff;
  return info;
}

// ---------------- §7.3 取数契约唯一入口 ----------------
export function buildSeries(q: SeriesQuery): Series[] {
  const buckets = buildBuckets(q);
  const platforms = effectivePlatforms(q.platform);
  const out: Series[] = [];
  for (const g of q.groups) {
    const rg = resolveGroup(g);
    if (!rg) continue;
    const key = `${g.modelId}__${normRom(rg.romram)}`;
    const color = brandColor[rg.brand] ?? '#171717';
    const points: SeriesPoint[] = [];
    for (const bucket of buckets) {
      // 折后价：组内多 SKU 算术均值（缺采周按有值样本均值；全缺 = missing）
      const weeklyVals: (number | null)[] = bucket.weekIds.map((wid) => {
        let sum = 0;
        let n = 0;
        for (const sid of rg.skuIds) {
          const row = factRow(sid, wid);
          const base = row ? (q.currency === 'usd' ? row.discounted_price_usd : row.discounted_price_rub) : null;
          if (base == null) continue;
          sum += q.platform ? applyPlatform(base, sid, wid, platforms) : base;
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

      // RRP：不加平台因子与噪声，组内全局一条官方阶梯（锚周取值）
      let rrp: number | null = null;
      let url = '';
      let offer: OfferInfo | null = null;
      for (const sid of rg.skuIds) {
        const row = factRow(sid, bucket.anchorWeekId);
        if (!row) continue;
        if (rrp == null) {
          const v = q.currency === 'usd' ? row.rrp_usd : row.rrp_rub;
          if (v != null) rrp = v;
        }
        if (!url && row.url) url = row.url;
      }
      // offer：周=该周 offer；月/季=桶内首个（按周、SKU 顺序）
      for (const wid of bucket.weekIds) {
        let found: OfferInfo | null = null;
        for (const sid of rg.skuIds) {
          const row = factRow(sid, wid);
          if (row?.offer_title != null) {
            found = toOfferInfo(row, bucket.anchorDate, platforms.length > 0 ? platforms : ['OZON']);
            break;
          }
        }
        if (found) {
          offer = found;
          break;
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
        shopName: pickShop(`${key}|${bucket.id}`, q.platform),
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
 * 筛选层（Agent B）需要的辅助：某型号+ROMRAM 下"最新折后价最低的颜色" sku_id。
 * 从全局最新周向前回溯，第一个"至少一个 SKU 有折后价"的周内取最低者（同价取 sku_id 字典序最小）；
 * 无数据/全缺返回 null。
 */
export function lowestPriceColorSku(modelId: string, romram: string): string | null {
  const rows = dimProduct.filter((p) => p.sku_id.startsWith(modelId + '__') && normRom(p.romram) === normRom(romram));
  if (rows.length === 0) return null;
  for (let i = timeRows.length - 1; i >= 0; i--) {
    const wid = timeRows[i].week_id;
    let bestId: string | null = null;
    let bestPrice = Number.POSITIVE_INFINITY;
    for (const r of rows) {
      const v = factRow(r.sku_id, wid)?.discounted_price_rub;
      if (v != null && (v < bestPrice || (v === bestPrice && bestId != null && r.sku_id < bestId))) {
        bestPrice = v;
        bestId = r.sku_id;
      }
    }
    if (bestId != null) return bestId;
  }
  return null;
}

// ---------------- 追加导出（第三轮）：促销力度表用的上市基线 ----------------

/** 上市基线信息（促销力度 = 折后价相对上市价的降幅） */
export interface LaunchInfo {
  launchPriceRub: number;
  launchPriceUsd: number;
  launchDate: string; // YYYY-MM-DD
  eolDate: string | null; // null=在售
}

/**
 * 一组 SKU（同一型号+ROMRAM 的颜色组）的上市基线。
 * 造数保证同型号+ROMRAM 各颜色 launch_price 一致（101 组零例外），取首个可查 SKU 即可。
 */
export function launchInfoOf(skuIds: string[]): LaunchInfo | null {
  for (const id of skuIds) {
    const p = productById.get(id);
    if (p) {
      return { launchPriceRub: p.launch_price_rub, launchPriceUsd: p.launch_price_usd, launchDate: p.launch_date, eolDate: p.eol_date };
    }
  }
  return null;
}

// ---------------- 追加导出：benchmark 快捷查询（配置页/级联默认勾选可用） ----------------
/** 某我司型号+ROMRAM 的默认竞品 sku_id 列表（按 sort 升序） */
export function defaultCompetitorSkus(ownModelId: string, ownRomram: string): string[] {
  const norm = normRom(ownRomram);
  return dimBenchmark
    .filter((b) => b.own_model_id === ownModelId && normRom(b.own_romram) === norm)
    .sort((a, b) => a.sort - b.sort)
    .map((b) => b.competitor_sku_id);
}
