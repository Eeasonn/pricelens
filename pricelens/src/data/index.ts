// ============================================================
// 数据装载层（唯一定点）：scripts/ingest_real.py 产物 → 维表 JSON + 事实列式包
// 事实包 = 列式 JSON（周/SKU/渠道走索引、长文本走字典）→ gzip → base64 内嵌；
// 模块加载时同步解压并展开为 FactPriceWeekly 行对象（8.5 万行，约 100ms）。
// 补录：把同 29 列的增量 xlsx 放到 data/real/incoming/ 后 `npm run ingest` 即可全量重建。
// 2026-11-14（Eason「价格数据完全以导入方式承载」）：新增数据包机制——
// buildDataPack() 把当前内存态序列化成单文件数据包（维表 + gzip 事实包 + 月度
// + 元信息），applyDataPack() 原位替换全部导出数组（引用不变、内容整体置换，
// 并重建汇率索引）；持久化在 dataPackStore（IndexedDB），main.tsx 两段式启动
// = 先读持久化数据包置换、再动态 import App——所有消费方（含各模块级缓存
// Map）都在置换完成后才初始化。dim_default_channel 预填维表暂不随包（消费方
// aggregate 静态导入自有绑定，v1 挂账）。
// ============================================================
import { gunzipSync, strFromU8 } from 'fflate';
import type {
  DimBenchmark,
  DimChannel,
  DimFx,
  DimProduct,
  DimPromo,
  DimRegion,
  DimTier,
  DimTime,
  FactPriceMonthly,
  FactPriceWeekly,
  FactSalesWeekly,
  SalesSourceRow,
} from '../dataModel/types';
import { normalizeSalesRows } from '../dataModel/salesIngest';
import { CONFIG_CHANGED_EVENT } from '../state/lplKeys';
import regionJson from './dim_region.json';
import productJson from './dim_product.json';
import channelJson from './dim_channel.json';
import timeJson from './dim_time.json';
import fxJson from './dim_fx.json';
import promoJson from './dim_promo.json';
import benchmarkJson from './dim_benchmark.json';
import tierJson from './dim_tier.json';
import packB64 from './fact_pack_gzip.b64.txt?raw';
import { marketDataProfileOf } from '../dataModel/marketProfile';
import monthlyJson from './fact_price_monthly.json';

export const dimRegion = regionJson as unknown as DimRegion[];
export const dimProduct = productJson as unknown as DimProduct[];
export const dimChannel = channelJson as unknown as DimChannel[];
export const dimTime = timeJson as unknown as DimTime[];
export const dimFx = fxJson as unknown as DimFx[];
export const dimPromo = promoJson as unknown as DimPromo[];
export const dimBenchmark = benchmarkJson as unknown as DimBenchmark[];
export const dimTier = tierJson as unknown as DimTier;

interface FactPack {
  v: number;
  weeks: string[];
  skus: string[];
  channels: string[];
  dict: { url: string[]; shot: string[]; inst: (string | null)[]; promo: (string | null)[]; seller: string[] };
  cols: {
    w: number[]; s: number[]; h: number[];
    rrp: (number | null)[]; p: (number | null)[];
    fx: number[]; dd: (number | null)[]; da: (number | null)[];
    b: number[]; inst: number[]; promo: number[]; url: number[]; shot: number[]; seller: number[]; t: string[];
  };
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** 解码前的结构校验（2026-11-16 审视修复）：数据包是外部输入（配置页导入），
 *  「能解压」≠「结构完好」——列长错位会静默产出 undefined 行、fx≤0 会产出
 *  Infinity 价格直接进图。任何一条不满足即抛错，走 applyDataPack 的整体放弃。 */
function validateFactPack(pack: FactPack): void {
  const fail = (msg: string): never => { throw new Error(`事实包结构无效：${msg}`); };
  const { weeks, skus, channels, dict, cols } = pack;
  if (!Array.isArray(weeks) || !weeks.every((w) => typeof w === 'string')) fail('weeks 表缺失或非字符串数组');
  if (!Array.isArray(skus) || !skus.every((s) => typeof s === 'string')) fail('skus 表缺失或非字符串数组');
  if (!Array.isArray(channels) || !channels.every((c) => typeof c === 'string')) fail('channels 表缺失或非字符串数组');
  for (const key of ['url', 'shot', 'inst', 'promo', 'seller'] as const) {
    if (!Array.isArray(dict?.[key])) fail(`字典 ${key} 缺失`);
  }
  const n = cols?.w?.length;
  if (typeof n !== 'number' || n === 0) fail('列式数据为空');
  for (const key of ['w', 's', 'h', 'rrp', 'p', 'fx', 'dd', 'da', 'b', 'inst', 'promo', 'url', 'shot', 'seller', 't'] as const) {
    const col = cols[key];
    if (!Array.isArray(col) || col.length !== n) fail(`列 ${key} 长度 (${col?.length}) 与行数 (${n}) 不一致`);
  }
  for (let i = 0; i < n; i++) {
    if (cols.w[i] < 0 || cols.w[i] >= weeks.length) fail(`行 ${i} 的周索引越界`);
    if (cols.s[i] < 0 || cols.s[i] >= skus.length) fail(`行 ${i} 的 SKU 索引越界`);
    if (cols.h[i] < 0 || cols.h[i] >= channels.length) fail(`行 ${i} 的渠道索引越界`);
    const fx = cols.fx[i];
    if (typeof fx !== 'number' || !Number.isFinite(fx) || fx <= 0) fail(`行 ${i} 的汇率非正数（会产生 Infinity 价格）`);
    if (cols.inst[i] >= dict.inst.length || cols.promo[i] >= dict.promo.length
      || cols.url[i] >= dict.url.length || cols.shot[i] >= dict.shot.length || cols.seller[i] >= dict.seller.length) {
      fail(`行 ${i} 的字典索引越界`);
    }
  }
}

function decodePack(pack: FactPack): FactPriceWeekly[] {
  const { weeks, skus, channels, dict, cols } = pack;
  const n = cols.w.length;
  const out: FactPriceWeekly[] = new Array(n);
  const ccOfChannel = channels.map((c) => c.split(':')[0]);
  for (let i = 0; i < n; i++) {
    const fx = cols.fx[i];
    const rrp = cols.rrp[i];
    const price = cols.p[i];
    out[i] = {
      week_id: weeks[cols.w[i]],
      sku_id: skus[cols.s[i]],
      country_code: ccOfChannel[cols.h[i]],
      channel_id: channels[cols.h[i]],
      seller: dict.seller[cols.seller[i]],
      rrp_local: rrp,
      price_local: price,
      fx,
      rrp_usd: rrp == null ? null : round2(rrp / fx),
      price_usd: price == null ? null : round2(price / fx),
      discount_display: cols.dd[i],
      discount_actual: cols.da[i],
      bundle: cols.b[i] === 1,
      installment: dict.inst[cols.inst[i]] ?? null,
      promo_text: dict.promo[cols.promo[i]] ?? null,
      url: dict.url[cols.url[i]],
      screenshot: dict.shot[cols.shot[i]],
      crawled_at: cols.t[i],
      crawl_status: 'ok',
    };
  }
  return out;
}

const decodedFactPriceWeekly = decodePack(
  JSON.parse(strFromU8(gunzipSync(b64ToBytes(packB64.trim())))) as FactPack,
);

/**
 * The weekly package is the visible source only for markets whose profile is
 * explicitly ready for weekly e-commerce facts. ZA legacy Takealot rows stay
 * in the compressed input for auditability and remain out of every runtime
 * consumer because ZA uses the monthly operator-booklet fact model.
 */
const filterWeeklyRows = (rows: FactPriceWeekly[]): FactPriceWeekly[] =>
  rows.filter((row) => {
    const profile = marketDataProfileOf(row.country_code);
    return profile.sourceKind === 'ecommerce-weekly' && profile.evidenceStatus === 'ready';
  });

export const factPriceWeekly: FactPriceWeekly[] = filterWeeklyRows(decodedFactPriceWeekly);

/** Published monthly facts. Only PASS rows emitted by the ZA publish workflow enter the runtime bundle. */
export const factPriceMonthly = (monthlyJson as unknown as FactPriceMonthly[]).filter(
  (row) => row.country_code === 'ZA'
    && marketDataProfileOf(row.country_code).sourceKind === 'operator-booklet-monthly'
    && row.review_status === 'PASS',
);

// ---------------- 真实销量（PSI 周表，2026-11-17 接口预留） ----------------

/** 已解析真实销量事实。默认空 = 量价销量走估算口径（dataModel/volume）；
 *  数据包 v2（sales 数组 = PSI 源行）导入后在此原位置换（引用不变）。 */
export const factSalesWeekly: FactSalesWeekly[] = [];

// ---------------- 数据包（2026-11-14 Eason：价格数据完全以导入方式承载） ----------------

/** 单文件数据包：维表 + gzip 事实包（与构建期内嵌同格式）+ 月度事实 + 元信息。
 *  迁移 = 拷贝这一个文件到目标电脑，配置页「数据包 → 导入」即可完全替换内置数据。
 *  v2（2026-11-17）：新增 sales（PSI 周销量源行，原样承载、apply 时归一解析）
 *  与 salesProductAliases（PSI Product 原文 → 内部 model_name 别名）。v1 包仍可导入
 *  （sales 视为空 → 销量回落估算口径）。 */
export interface PricelensDataPack {
  kind: 'pricelens-data-pack';
  v: 2;
  generatedAt: string;
  dims: {
    region: DimRegion[];
    product: DimProduct[];
    channel: DimChannel[];
    time: DimTime[];
    fx: DimFx[];
    promo: DimPromo[];
    benchmark: DimBenchmark[];
    tier: DimTier;
  };
  factPackB64: string;
  monthly: FactPriceMonthly[];
  /** PSI 周销量源行（SalesSourceRow 原样承载；空/缺省 = 销量走估算） */
  sales?: SalesSourceRow[];
  /** PSI Product 原文 → 内部型号显示名（model_name）别名；解析失败行计入 unmatched */
  salesProductAliases?: Record<string, string>;
}

/** v1 旧包（无销量段）；applyDataPack 兼容导入 */
export type LegacyPricelensDataPack = Omit<PricelensDataPack, 'v' | 'sales' | 'salesProductAliases'> & { v: 1 };
export type AnyPricelensDataPack = PricelensDataPack | LegacyPricelensDataPack;

export interface DataPackMeta {
  source: 'builtin' | 'imported';
  /** 数据包自身的生成时间（打包时写入）；内置 = null */
  generatedAt: string | null;
  /** 导入应用时间；内置 = null */
  appliedAt: string | null;
  counts: {
    factWeekly: number;
    factMonthly: number;
    factSales: number;
    products: number;
    channels: number;
    regions: number;
    timeBuckets: number;
  };
  /** PSI 源行里国家/型号解析失败的行数（>0 = 别名表有缺口，契约文档 §诊断） */
  salesUnmatched: number;
  /** 周期间/QTY 非法被跳过的行数 */
  salesSkipped: number;
}

/** 当前数据来源信息（内置 / 导入包）；UI 的数据信息卡读取 */
let dataMetaState: DataPackMeta = {
  source: 'builtin',
  generatedAt: null,
  appliedAt: null,
  counts: {
    factWeekly: factPriceWeekly.length,
    factMonthly: factPriceMonthly.length,
    factSales: factSalesWeekly.length,
    products: dimProduct.length,
    channels: dimChannel.length,
    regions: dimRegion.length,
    timeBuckets: dimTime.length,
  },
  salesUnmatched: 0,
  salesSkipped: 0,
};
export function dataMeta(): DataPackMeta {
  return { ...dataMetaState, counts: { ...dataMetaState.counts } };
}

/** 当前生效的 gzip 事实包与原始月度数组（重导出数据包用——内存里只有解码后的
 *  行，压缩包原文必须随应用/初始化保留，否则导出会把导入的数据丢回内置版） */
let currentFactPackB64 = packB64.trim();
let currentMonthlyRaw = monthlyJson as unknown as FactPriceMonthly[];
/** 当前生效的 PSI 销量源行与别名（重导出数据包用；与 factSalesWeekly 同步置换） */
let currentSalesRaw: SalesSourceRow[] = [];
let currentSalesAliases: Record<string, string> = {};

const replaceInPlace = <T,>(target: T[], next: T[]): void => {
  if (target === next) return; // 同引用自换（buildDataPack 活引用 → apply 回自己）= 无操作
  target.length = 0;
  for (const item of next) target.push(item);
};

const rebuildFxIndex = (): void => {
  latestFxByCurrency.clear();
  for (const f of [...dimFx].sort((a, b) => (a.month_id < b.month_id ? -1 : 1))) latestFxByCurrency.set(f.currency, f.per_usd);
};

/** 校验并应用数据包：全部置换原位完成（导出引用不变），任一步失败即整体放弃
 *  （先解码校验、后提交），内置数据不受污染。月度仍按 ZA PASS 口径过滤。
 *  v2 追加：sales（PSI 源行）在维表置换后归一解析进 factSalesWeekly（型号解析
 *  依赖新 dimProduct），未匹配/跳过行数进 meta 供诊断；成功后广播
 *  CONFIG_CHANGED_EVENT 让下游缓存（销量/现价索引等）整包失效。 */
export function applyDataPack(pack: unknown): { ok: true; counts: DataPackMeta['counts'] } | { ok: false; error: string } {
  try {
    const p = pack as AnyPricelensDataPack | null;
    if (!p || typeof p !== 'object') return { ok: false, error: '不是有效的数据包文件' };
    if (p.kind !== 'pricelens-data-pack' || (p.v !== 1 && p.v !== 2)) return { ok: false, error: '数据包类型或版本不匹配（需要 pricelens-data-pack v1/v2）' };
    const dims = p.dims;
    if (!dims || typeof dims !== 'object') return { ok: false, error: '数据包缺少维表' };
    const required = { region: dims.region, product: dims.product, channel: dims.channel, time: dims.time, fx: dims.fx, promo: dims.promo, benchmark: dims.benchmark } as Record<string, unknown>;
    for (const [key, value] of Object.entries(required)) {
      if (!Array.isArray(value)) return { ok: false, error: `数据包缺少维表 ${key}` };
    }
    if (!dims.tier || typeof dims.tier !== 'object' || !dims.tier.ladders) return { ok: false, error: '数据包缺少维表 tier' };
    if (typeof p.factPackB64 !== 'string' || !p.factPackB64.trim()) return { ok: false, error: '数据包缺少事实包' };
    if (!Array.isArray(p.monthly)) return { ok: false, error: '数据包缺少月度事实' };
    const sales = p.v === 2 && Array.isArray(p.sales) ? p.sales : [];
    const salesAliases = p.v === 2 && p.salesProductAliases && typeof p.salesProductAliases === 'object' ? p.salesProductAliases : {};
    // 先解码校验（失败抛错走 catch，内置数据不受污染），再整体提交
    const raw = JSON.parse(strFromU8(gunzipSync(b64ToBytes(p.factPackB64.trim())))) as FactPack;
    validateFactPack(raw);
    const decoded = decodePack(raw);
    const weekly = filterWeeklyRows(decoded);
    const monthly = (p.monthly as FactPriceMonthly[]).filter(
      (row) => row.country_code === 'ZA'
        && marketDataProfileOf(row.country_code).sourceKind === 'operator-booklet-monthly'
        && row.review_status === 'PASS',
    );
    replaceInPlace(dimRegion, p.dims.region);
    replaceInPlace(dimProduct, p.dims.product);
    replaceInPlace(dimChannel, p.dims.channel);
    replaceInPlace(dimTime, p.dims.time);
    replaceInPlace(dimFx, p.dims.fx);
    replaceInPlace(dimPromo, p.dims.promo);
    replaceInPlace(dimBenchmark, p.dims.benchmark);
    // tier = 对象（ladders/labels），按键在位替换。两道守卫（2026-11-16 审视修复）：
    // ① 同引用自换（buildDataPack 活引用 apply 回自己）与数组路径对称——先删空再
    //   从自身 assign = 整个清空，aggregate 的 Object.entries(dimTier.labels) 直接崩；
    // ② 键复制不走 Object.assign——它会命中 __proto__ setter（原型被改）且
    //   constructor 键因继承属性 non-writable 被静默丢；逐自有键显式写入并拦危险键。
    if (p.dims.tier !== dimTier) {
      const nextTier = p.dims.tier as unknown as Record<string, unknown>;
      for (const key of Object.keys(dimTier) as (keyof DimTier)[]) delete dimTier[key];
      for (const key of Object.keys(nextTier)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        (dimTier as unknown as Record<string, unknown>)[key] = nextTier[key];
      }
    }
    replaceInPlace(factPriceWeekly, weekly);
    replaceInPlace(factPriceMonthly, monthly);
    // 销量：维表就位后归一解析（型号解析要用新 dimProduct），整体置换
    const resolvedSales = normalizeSalesRows(sales, { regions: dimRegion, products: dimProduct, aliases: salesAliases });
    replaceInPlace(factSalesWeekly, resolvedSales.facts);
    currentFactPackB64 = p.factPackB64.trim();
    currentMonthlyRaw = p.monthly;
    currentSalesRaw = sales;
    currentSalesAliases = salesAliases;
    rebuildFxIndex();
    const counts: DataPackMeta['counts'] = {
      factWeekly: factPriceWeekly.length,
      factMonthly: factPriceMonthly.length,
      factSales: factSalesWeekly.length,
      products: dimProduct.length,
      channels: dimChannel.length,
      regions: dimRegion.length,
      timeBuckets: dimTime.length,
    };
    dataMetaState = {
      source: 'imported',
      generatedAt: typeof p.generatedAt === 'string' ? p.generatedAt : null,
      appliedAt: new Date().toISOString(),
      counts,
      salesUnmatched: resolvedSales.unmatched,
      salesSkipped: resolvedSales.skipped,
    };
    // 下游模块级缓存（量价 volCache、树现价索引等）整包失效——与配置页保存同通道
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT));
    return { ok: true, counts };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 把当前内存态序列化为数据包（维表取活跃引用、事实包/月度/销量源行取当前生效原文）。 */
export function buildDataPack(): PricelensDataPack {
  return {
    kind: 'pricelens-data-pack',
    v: 2,
    generatedAt: new Date().toISOString(),
    dims: {
      region: dimRegion,
      product: dimProduct,
      channel: dimChannel,
      time: dimTime,
      fx: dimFx,
      promo: dimPromo,
      benchmark: dimBenchmark,
      tier: dimTier,
    },
    factPackB64: currentFactPackB64,
    monthly: currentMonthlyRaw,
    sales: currentSalesRaw,
    salesProductAliases: currentSalesAliases,
  };
}

/** 币种 → 最新月份汇率（本币 / USD）；未知币种回 1（即视为 USD） */
const latestFxByCurrency = new Map<string, number>();
rebuildFxIndex();
export function latestPerUsd(currency: string): number {
  return latestFxByCurrency.get(currency) ?? 1;
}

/** 国家 → 本币代码（无数据国家回 'USD'） */
export function currencyOfCountry(countryCode: string): string {
  return dimRegion.find((r) => r.country_code === countryCode)?.currency ?? 'USD';
}
