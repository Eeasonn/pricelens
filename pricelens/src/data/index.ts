// ============================================================
// 造数产物（scripts/gen-data.mjs → src/data/*.json）唯一定点装载层
// 数据负责人（Agent A）：仅用真实产物覆盖 JSON 文件内容 / 可增加导出；
// 不得改动下列导出名与类型断言。
// ============================================================
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
import factJson from './fact_price_weekly.json';

export const dimRegion = regionJson as unknown as DimRegion[];
export const dimProduct = productJson as unknown as DimProduct[];
export const dimChannel = channelJson as unknown as DimChannel[];
export const dimTime = timeJson as unknown as DimTime[];
export const dimFx = fxJson as unknown as DimFx[];
export const dimPromo = promoJson as unknown as DimPromo[];
export const dimBenchmark = benchmarkJson as unknown as DimBenchmark[];
export const factPriceWeekly = factJson as unknown as FactPriceWeekly[];
