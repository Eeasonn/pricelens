// ============================================================
// 造数产物（scripts/gen-data.mjs → src/data/*）唯一定点装载层
// 数据负责人（Agent A）：仅用真实产物覆盖 JSON 文件内容 / 可增加导出；
// 不得改动下列导出名与类型断言。
// fact 以 gzip+base64 内嵌（gen-data.mjs 同步产出 .b64.txt），模块加载时同步解压——
// 单文件交付体积 5.7MB→268KB；.json 原件仅供 verify.mjs 与人工核对，不进 bundle。
// ============================================================
import { gunzipSync, strFromU8 } from 'fflate';
import type {
  DimBenchmark,
  DimChannel,
  DimFx,
  DimProduct,
  DimPromo,
  DimRegion,
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
import factGzipB64 from './fact_price_weekly_gzip.b64.txt?raw';

export const dimRegion = regionJson as unknown as DimRegion[];
export const dimProduct = productJson as unknown as DimProduct[];
export const dimChannel = channelJson as unknown as DimChannel[];
export const dimTime = timeJson as unknown as DimTime[];
export const dimFx = fxJson as unknown as DimFx[];
export const dimPromo = promoJson as unknown as DimPromo[];
export const dimBenchmark = benchmarkJson as unknown as DimBenchmark[];

/** 参考汇率（₽/$）= dim_fx 终值（gen-data REF_FX 同源，第二十轮起 fact 折算口径）。
 *  图表档位锚定 USD 用（helpers.perUsdOf，第二十三轮）；未来加币种时同型扩展：
 *  每币种一个对 USD 的参考比价（如 dim_fx 增列或换结构），本导出改为查表。 */
export const localPerUsd = dimFx[dimFx.length - 1]?.usd_rub_avg ?? 80;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const factPriceWeekly = JSON.parse(
  strFromU8(gunzipSync(b64ToBytes(factGzipB64.trim()))),
) as unknown as FactPriceWeekly[];
