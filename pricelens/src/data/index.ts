// ============================================================
// 数据装载层（唯一定点）：scripts/ingest_real.py 产物 → 维表 JSON + 事实列式包
// 事实包 = 列式 JSON（周/SKU/渠道走索引、长文本走字典）→ gzip → base64 内嵌；
// 模块加载时同步解压并展开为 FactPriceWeekly 行对象（8.5 万行，约 100ms）。
// 补录：把同 29 列的增量 xlsx 放到 data/real/incoming/ 后 `npm run ingest` 即可全量重建。
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
  FactPriceWeekly,
} from '../dataModel/types';
import regionJson from './dim_region.json';
import productJson from './dim_product.json';
import channelJson from './dim_channel.json';
import timeJson from './dim_time.json';
import fxJson from './dim_fx.json';
import promoJson from './dim_promo.json';
import benchmarkJson from './dim_benchmark.json';
import tierJson from './dim_tier.json';
import packB64 from './fact_pack_gzip.b64.txt?raw';

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

export const factPriceWeekly: FactPriceWeekly[] = decodePack(
  JSON.parse(strFromU8(gunzipSync(b64ToBytes(packB64.trim())))) as FactPack,
);

/** 币种 → 最新月份汇率（本币 / USD）；未知币种回 1（即视为 USD） */
const latestFxByCurrency = new Map<string, number>();
for (const f of [...dimFx].sort((a, b) => (a.month_id < b.month_id ? -1 : 1))) latestFxByCurrency.set(f.currency, f.per_usd);
export function latestPerUsd(currency: string): number {
  return latestFxByCurrency.get(currency) ?? 1;
}

/** 国家 → 本币代码（无数据国家回 'USD'） */
export function currencyOfCountry(countryCode: string): string {
  return dimRegion.find((r) => r.country_code === countryCode)?.currency ?? 'USD';
}
