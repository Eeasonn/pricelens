// ============================================================
// §7.3 显示层聚合契约 —— 数据负责人（Agent A）实现
// 签名与类型冻结；图表层（Agent C）只消费 Series[]
// 确定性：全部伪随机来自内置带 seed 的 PRNG（字符串标签 → FNV-1a → mulberry32），
// 禁止裸 Math.random；同输入两次调用输出逐字节一致。
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
  OfferDetail,
  OfferInfo,
  OfferKind,
  Series,
  SeriesPoint,
  SeriesQuery,
  SkuGroupQuery,
  TierCode,
} from './types';
import { dimBenchmark, dimChannel, dimProduct, dimPromo, dimTime, factPriceWeekly } from '../data';
import { brandColor } from '../theme/tokens';
import { DEFAULT_DATA_SCOPE, isDataScopeSupported } from './scope';

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
// 第三十六轮（迪总定口径）：demo = **单平台多产品** 场景——所有数据取自同一平台（OZON），
// 不再模拟「未选平台时每节点取最低价平台」（跨平台择低是不合理口径，已废弃）。
// 未来「单产品多平台」场景需要专门的展示设计（平台维度展开），届时再扩展。
const DEFAULT_PLATFORM = 'OZON';
// 平台因子沿用文件顶部 PLATFORM_FACTOR/PLATFORM_JITTER 声明（仅显式勾选非默认平台时生效）

/** demo 单平台唯一来源店铺（OZON 首个店铺，确定性） */
const DEFAULT_SHOP_NAME: string | null =
  dimChannel.find((c) => c.platform === DEFAULT_PLATFORM)?.shop_name ?? null;

/** 生效平台（第三十六轮单平台口径）：未选 = 默认 OZON 单平台；显式勾选 = 所选并集（未来多平台对比场景） */
function effectivePlatforms(platform: SeriesQuery['platform']): string[] {
  if (!platform || (platform.platforms.length === 0 && platform.shopIds.length === 0)) return [DEFAULT_PLATFORM];
  const set = new Set(platform.platforms);
  for (const id of platform.shopIds) {
    const p = channelByShop.get(id)?.platform;
    if (p) set.add(p);
  }
  return [...set];
}
/** 折后价(平台) = base × (1 + factor_p ± 0.3% seed 抖动)；多选取均值；基准平台（OZON）无因子无抖动 */
function applyPlatform(base: number, skuId: string, weekId: string, platforms: string[]): number {
  if (platforms.length === 0) return base;
  if (platforms.length === 1 && platforms[0] === DEFAULT_PLATFORM) return base;
  let sum = 0;
  for (const p of platforms) {
    const f = PLATFORM_FACTOR[p] ?? 0;
    const jitter = (rnd(`pf|${p}|${skuId}|${weekId}`) * 2 - 1) * PLATFORM_JITTER;
    sum += base * (1 + f + jitter);
  }
  return sum / platforms.length;
}

/** 来源店铺（第三十六轮）：单平台口径 = 恒默认平台唯一店铺，不再按节点随机指派「最低价店铺」 */
function pickShop(): string | null {
  return DEFAULT_SHOP_NAME;
}

/** 单平台价目（第五十三轮）：同一基准价逐平台独立套用因子+抖动（与 applyPlatform 同源、
 *  互不影响）。预警「单品牌多平台价差」与总览「多平台对比」弹窗共用；按价格升序返回。 */
export function platformPriceSpread(base: number, skuId: string, weekId: string): { platform: string; price: number }[] {
  const platforms = [...new Set(dimChannel.map((c) => c.platform))];
  return platforms
    .map((p) => ({ platform: p, price: applyPlatform(base, skuId, weekId, [p]) }))
    .sort((a, b) => a.price - b.price);
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
/**
 * offer 结构化解析（第四十八轮）：offer_title = "档期名 · 类型"（平台券/先享后付/赠品），
 * offer_text 承载细节。按类型抽一眼短文案（headline）：
 *   平台券 → 「券 −N%」（取 text 中 −N%）｜ 先享后付 → 「N 期免息」｜ 赠品 → 「赠XX」
 * detail 剥离结构化字段（至日期/剩余天数/银行价/关税），三类权益落 OfferInfo 对应键。
 */
function toOfferInfo(row: FactPriceWeekly, anchorDate: string): OfferInfo | null {
  if (row.offer_title == null) return null;
  const promo = findPromoForOffer(row.offer_title, anchorDate);
  const endDate = promo?.end_date ?? anchorDate;
  const text = row.offer_text ?? '';
  const promoName = row.offer_title.split(' · ')[0] ?? row.offer_title;
  // 「三重礼」组合（第四十九轮）：一条 text 以 " / " 分段同时承载 折扣/分期/赠品
  if (row.offer_title.endsWith('组合')) {
    const endDateC = endDate;
    const mk = (kind: OfferKind, headline: string, detail: string): OfferDetail => ({
      kind,
      promoName,
      headline,
      detail: detail.replace(/，至\s*\d{2}-\d{2}/, '').trim(),
      endDate: endDateC,
      remainingDays: daysBetween(anchorDate, endDateC),
    });
    const out: OfferInfo = {};
    for (const segRaw of text.split(' / ')) {
      const seg = segRaw.trim();
      let m = /平台券\s*−\s*(\d+)\s*%/.exec(seg);
      if (m) {
        out.discount = mk('discount', `券 −${m[1]}%`, seg);
        continue;
      }
      m = /免息\s*(\d+)\s*期/.exec(seg);
      if (m) {
        out.installment = mk('installment', `${m[1]} 期免息`, seg);
        continue;
      }
      m = /下单赠\s*([^，]+)/.exec(seg);
      if (m) out.gift = mk('gift', `赠${m[1]}`, seg);
    }
    return out;
  }
  let kind: OfferKind;
  let headline: string;
  if (row.offer_title.endsWith('平台券')) {
    kind = 'discount';
    const m = /−\s*(\d+)\s*%/.exec(text);
    headline = m ? `券 −${m[1]}%` : '平台券';
  } else if (row.offer_title.endsWith('先享后付')) {
    kind = 'installment';
    const m = /免息\s*(\d+)\s*期/.exec(text);
    headline = m ? `${m[1]} 期免息` : '先享后付';
  } else {
    kind = 'gift';
    const m = /下单赠\s*(.+?)，/.exec(text);
    headline = m ? `赠${m[1]}` : '赠品';
  }
  const det: OfferDetail = {
    kind,
    promoName,
    headline,
    detail: text
      .replace(/，至\s*\d{2}-\d{2}/, '')
      .replace(/\s*[·/]\s*活动剩\s*\d+天/, '')
      .replace(/\s*银行价[\d\s\u00A0]+卢布/, '')
      .replace(/\s*\/?\s*关税约[\d\s\u00A0]+卢布\s*\/?/, '')
      .trim(),
    endDate,
    remainingDays: daysBetween(anchorDate, endDate),
  };
  if (kind === 'installment') {
    const bank = parseRubInText(text, '银行价');
    if (bank != null) det.bankPriceRub = bank;
    const tariff = parseRubInText(text, '关税约');
    if (tariff != null) det.tariffEstRub = tariff;
  }
  return kind === 'discount' ? { discount: det } : kind === 'installment' ? { installment: det } : { gift: det };
}

// ---------------- §7.3 取数契约唯一入口 ----------------
export function buildSeries(q: SeriesQuery): Series[] {
  if (!isDataScopeSupported(q.scope)) return [];
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

      // RRP：不加平台因子与噪声，组内全局一条官方阶梯。
      // 第二十一轮：改桶内扫描取「最后一个有值周」——原锚周取值在上市/退市落在桶中段时
      // 锚周无行，RRP 会留下空洞（折后价有值而 RRP 为 null），违反「RRP 覆盖 S..E」；
      // 折后价聚合的是全桶有值周，RRP 同样扫全桶即保证 有价必有 RRP。
      let rrp: number | null = null;
      let url = '';
      let offer: OfferInfo | null = null;
      for (const wid of bucket.weekIds) {
        for (const sid of rg.skuIds) {
          const row = factRow(sid, wid);
          if (!row) continue;
          const v = q.currency === 'usd' ? row.rrp_usd : row.rrp_rub;
          if (v != null) rrp = v;
          if (!url && row.url) url = row.url;
        }
      }
      // offer：周=该周 offer；月/季=桶内首个（按周、SKU 顺序）
      for (const wid of bucket.weekIds) {
        let found: OfferInfo | null = null;
        for (const sid of rg.skuIds) {
          const row = factRow(sid, wid);
          if (row?.offer_title != null) {
            found = toOfferInfo(row, bucket.anchorDate);
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
        shopName: pickShop(),
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

// ---------------- 生命周期调价幅度（第二十七轮：季粒度系列名第二行） ----------------
export interface LifecycleDelta {
  /** 末季季均折后(₽) / 首销季季均折后(₽) − 1；恒本币口径，与显示币种/刷选窗口无关 */
  pct: number;
  /** 生命周期进行中（eol_date 为空）；第二十九轮起展示层统显「生命周期 −X%」不再区分，仅数据语义 */
  ongoing: boolean;
}

const quarterIdOfDate = (date: string): string => {
  const [y, m] = date.split('-').map(Number);
  return `${y}Q${Math.floor((m - 1) / 3) + 1}`;
};
const wedByWeek = new Map<string, string>(dimTime.map((w) => [w.week_id, w.week_wed_date]));
const quarterByWeek = new Map<string, string>(dimTime.map((w) => [w.week_id, w.quarter_id]));

/**
 * 生命周期调价幅度（设计示意 07 节口径）：「首销季 → 末季」季均折后价(₽) 变化。
 * - 首销季 = launch_date 所在季；该季无采数时（数据起点晚于上市）回退首个有值季，基准偏保守
 * - 末季：完结产品 = eol 前最后有值季；在售产品 = 数据最后有值季（暂计）
 * - 恒基于 ₽ 事实价（币种纪律：降幅恒本币）；与刷选窗口无关（锚在数据非窗口）
 * - 仅季粒度消费（Chart 系列名第二行「生命周期 −X%」，第二十九轮起在售/完结统显）；周/月粒度不渲染
 */
export function lifecycleDeltaOf(skuIds: string[]): LifecycleDelta | null {
  const prows = skuIds.map((id) => productById.get(id)).filter((p): p is DimProduct => !!p);
  if (prows.length === 0) return null;
  const launchDate = prows.map((p) => p.launch_date).sort()[0];
  const eolDate = prows.map((p) => p.eol_date).filter((d): d is string => !!d).sort()[0] ?? null;
  const idx = factIndex();
  const acc = new Map<string, { s: number; n: number }>();
  for (const id of skuIds) {
    const byWeek = idx.get(id);
    if (!byWeek) continue;
    for (const [weekId, row] of byWeek) {
      if (row.discounted_price_rub == null || row.crawl_status !== 'ok') continue;
      const wed = wedByWeek.get(weekId);
      if (!wed || wed < launchDate || (eolDate != null && wed > eolDate)) continue;
      const q = quarterByWeek.get(weekId);
      if (!q) continue;
      const o = acc.get(q);
      if (o) {
        o.s += row.discounted_price_rub;
        o.n += 1;
      } else {
        acc.set(q, { s: row.discounted_price_rub, n: 1 });
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

// ---------------- 追加导出：benchmark 快捷查询（配置页/级联默认勾选可用） ----------------
/** 某我司型号+ROMRAM 的默认竞品 sku_id 列表（按 sort 升序） */
export function defaultCompetitorSkus(ownModelId: string, ownRomram: string): string[] {
  const norm = normRom(ownRomram);
  return dimBenchmark
    .filter((b) => b.own_model_id === ownModelId && normRom(b.own_romram) === norm)
    .sort((a, b) => a.sort - b.sort)
    .map((b) => b.competitor_sku_id);
}

// ============================================================
// 国家总览矩阵（第三十七轮）：国家层面主界面的纯计算层。
// 结构 = 档位带（tier_code 从高到低）× 型号组（左我司 / 右 ROM 级映射竞品）×
// ROM 行（代表色 SKU + 全周期周度序列 + 极值）。与图表层零耦合：Overview 页直用。
// ============================================================

export interface OverviewSparkPoint {
  weekId: string;
  monthId: string; // 所属月 YYYYMM（迷你图 X 轴刻度用）
  price: number | null; // 显示币种折后价；缺采 = null
}

export interface OverviewColorOpt {
  color: string; // 色名（dim_product.color）
  skuId: string;
  price: number | null; // 该颜色最新有值周折后价（显示币种）
}

/** 一个 ROM 行 = 同型号+ROMRAM 的代表色 SKU 视角（与看板默认同一口径） */
export interface OverviewRow {
  skuId: string; // 代表色 SKU（RUB 最低价色，lowestPriceColorSku 同源）
  brand: string;
  modelName: string;
  romram: string;
  isOwn: boolean;
  lineColor: string; // brandColor[brand]
  price: number | null; // 最新有值周折后价（显示币种）
  rrp: number | null;
  discountPct: number | null; // price/rrp − 1（双价齐才算）
  asOfWeek: string; // 最新有值周 YYYYWW；全缺 = 数据末周
  colors: OverviewColorOpt[]; // 颜色次级菜单
  points: OverviewSparkPoint[]; // 全周期周度序列（迷你图直用）
  maxV: number | null;
  maxIdx: number; // 无任何有值点 = -1
  minV: number | null;
  minIdx: number;
}

/** 竞品小表一行 = benchmark ROM 级映射的具体 SKU（含色） */
export interface OverviewCompRow {
  skuId: string;
  brand: string;
  modelName: string;
  romram: string;
  color: string;
  lineColor: string;
  price: number | null;
  rrp: number | null;
  ownRomrams: string[]; // 对标的我司 ROM（映射并集，升序）
  primary: boolean; // 任一映射 sort=1（主竞品）
  colors: OverviewColorOpt[]; // 同型号+ROMRAM 的全部颜色现价（第四十四轮：颜色下钻）
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
  tierCode: TierCode;
  launchPriceUsd: number;
  lifecyclePct: number | null; // 仅我司（lifecycleDeltaOf 全模型 SKU）
  rows: OverviewRow[]; // ROM 行，现价降序（无值沉底、同价 romram 字典序）
  comps: OverviewCompRow[]; // benchmark 映射并集；主竞品在前，其余现价降序
}

export interface OverviewTierBand {
  tierCode: TierCode;
  models: OverviewModel[]; // 上市价（USD）降序
}

/** 档位显示名（tier_code 按上市价归档、归属稳定） */
export const TIER_LABELS: Record<TierCode, string> = {
  '1000+': '旗舰 · $1000+',
  '800-1000': '高端 · $800–1,000',
  '600-800': '高端 · $600–800',
  '400-600': '中端 · $400–600',
  '200-400': '中低 · $200–400',
  '<200': '入门 · <$200',
};

const TIER_ORDER: TierCode[] = ['1000+', '800-1000', '600-800', '400-600', '200-400', '<200'];

const priceOf = (row: FactPriceWeekly, currency: CurrencyMode): number | null =>
  currency === 'usd' ? row.discounted_price_usd : row.discounted_price_rub;
const rrpOf = (row: FactPriceWeekly, currency: CurrencyMode): number | null =>
  currency === 'usd' ? row.rrp_usd : row.rrp_rub;

/** 某 SKU 最新有值周（price 驱动）；全缺时回数据末周、值 null。
 *  第五十一轮起平台感知：折后价过 applyPlatform（与看板 buildSeries 同口径）；
 *  RRP = 官方阶梯，不随平台。缺省 = OZON 基准（行为与旧版逐字节一致）。 */
function latestOf(
  skuId: string,
  currency: CurrencyMode,
  platforms: string[] = [DEFAULT_PLATFORM],
): { price: number | null; rrp: number | null; weekId: string } {
  for (let i = timeRows.length - 1; i >= 0; i--) {
    const w = timeRows[i].week_id;
    const row = factRow(skuId, w);
    if (row == null) continue;
    const p = priceOf(row, currency);
    if (p != null)
      return {
        price: p == null ? null : applyPlatform(p, skuId, w, platforms),
        rrp: rrpOf(row, currency),
        weekId: w,
      };
  }
  return { price: null, rrp: null, weekId: timeRows[timeRows.length - 1].week_id };
}

function sparkPoints(skuId: string, currency: CurrencyMode, platforms: string[] = [DEFAULT_PLATFORM]): OverviewSparkPoint[] {
  return timeRows.map((w) => {
    const row = factRow(skuId, w.week_id);
    const base = row ? priceOf(row, currency) : null;
    return {
      weekId: w.week_id,
      monthId: w.month_id,
      price: base == null ? null : applyPlatform(base, skuId, w.week_id, platforms),
    };
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
      maxIdx = i; // 同值取首个（上市初最高价的语义）
    }
    if (minV == null || v < minV) {
      minV = v;
      minIdx = i;
    }
  }
  return { maxV, maxIdx, minV, minIdx };
}

/**
 * 国家总览矩阵。确定性纯函数：同输入两次调用输出逐字节一致。
 * - 我司 ROM 行代表色 = lowestPriceColorSku（RUB 口径最低价色，与看板默认视图同源）
 * - 竞品行 = benchmark 对该型号全部 ROM 的映射并集（去重；ownRomrams 聚合）；
 *   第四十四轮起 benchmark 可注入（总览页传 getEffectiveBenchmark() 的手动+auto 合并结果，
 *   缺省 = dimBenchmark auto），配置对标弹窗保存后经事件刷新即时生效
 * - 空档位（当前 600-800 无产品）不输出带
 */
export function buildOverviewMatrix(
  currency: CurrencyMode,
  bench: DimBenchmark[] = dimBenchmark,
  /** 第五十一轮：平台筛选（与看板共享 state.platform；null = OZON 基准口径） */
  platform: SeriesQuery['platform'] = null,
  scope: DataScope = DEFAULT_DATA_SCOPE,
): OverviewTierBand[] {
  if (!isDataScopeSupported(scope)) return [];
  const platforms = effectivePlatforms(platform);
  // 型号索引：modelId → 产品行集
  const byModel = new Map<string, DimProduct[]>();
  for (const p of dimProduct) {
    if (p.industry !== scope.industry) continue;
    const mid = p.sku_id.split('__')[0];
    const arr = byModel.get(mid);
    if (arr) arr.push(p);
    else byModel.set(mid, [p]);
  }

  const models: OverviewModel[] = [];
  for (const [modelId, prows] of byModel) {
    const head = prows[0];
    const romrams = [...new Set(prows.map((p) => p.romram))];
    const rows: OverviewRow[] = [];
    for (const rom of romrams) {
      const repSku = lowestPriceColorSku(modelId, rom);
      const romRows = prows.filter((p) => normRom(p.romram) === normRom(rom));
      const skuId = repSku ?? [...romRows].sort((a, b) => a.sku_id.localeCompare(b.sku_id))[0].sku_id;
      const lat = latestOf(skuId, currency, platforms);
      const points = sparkPoints(skuId, currency, platforms);
      const ex = extremes(points);
      const discountPct = lat.price != null && lat.rrp != null && lat.rrp > 0 ? lat.price / lat.rrp - 1 : null;
      rows.push({
        skuId,
        brand: head.brand,
        modelName: head.model_name,
        romram: rom,
        isOwn: head.is_own,
        lineColor: brandColor[head.brand] ?? '#171717',
        price: lat.price,
        rrp: lat.rrp,
        discountPct,
        asOfWeek: lat.weekId,
        colors: [...romRows]
          .sort((a, b) => a.sku_id.localeCompare(b.sku_id))
          .map((p) => ({ color: p.color, skuId: p.sku_id, price: latestOf(p.sku_id, currency, platforms).price })),
        points,
        ...ex,
      });
    }
    rows.sort((a, b) => (b.price ?? -1) - (a.price ?? -1) || a.romram.localeCompare(b.romram));

    // 竞品映射并集（仅我司型号消费；去重 + ownRomrams 聚合 + 主竞品在前）
    const compMap = new Map<string, { romrams: Set<string>; primary: boolean }>();
    if (head.is_own) {
      for (const b of bench) {
        if (b.own_model_id !== modelId) continue;
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
      if (!p) continue;
      const lat = latestOf(skuId, currency, platforms);
      const points = sparkPoints(skuId, currency, platforms);
      const compModelRows = byModel.get(skuId.split('__')[0]) ?? [];
      const compRomRows = compModelRows.filter((pp) => normRom(pp.romram) === normRom(p.romram));
      comps.push({
        skuId,
        brand: p.brand,
        modelName: p.model_name,
        romram: p.romram,
        color: p.color,
        lineColor: brandColor[p.brand] ?? '#171717',
        price: lat.price,
        rrp: lat.rrp,
        ownRomrams: [...agg.romrams].sort(),
        primary: agg.primary,
        colors: [...compRomRows]
          .sort((a, b) => a.sku_id.localeCompare(b.sku_id))
          .map((pp) => ({ color: pp.color, skuId: pp.sku_id, price: latestOf(pp.sku_id, currency, platforms).price })),
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
      tierCode: head.tier_code,
      launchPriceUsd: head.launch_price_usd,
      lifecyclePct: head.is_own ? lifecycleDeltaOf(prows.map((p) => p.sku_id))?.pct ?? null : null,
      rows,
      comps,
    });
  }

  return TIER_ORDER.map((tierCode) => ({
    tierCode,
    models: models
      .filter((m) => m.tierCode === tierCode)
      .sort((a, b) => b.launchPriceUsd - a.launchPriceUsd || a.modelName.localeCompare(b.modelName)),
  })).filter((b) => b.models.length > 0);
}
