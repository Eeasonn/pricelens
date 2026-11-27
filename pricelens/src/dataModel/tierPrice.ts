// ============================================================
// 「现价与落档」纯模型（2026-11-27 Eason 拍板口径，讨论稿）：
// 一个「型号 × 配置」在当前国家的现价与该现价落入的档位。
// 口径（全部确定性、可解释——不做 AI 打分、不虚构数据）：
// ①档位阶梯 = tierBandsOf(industry)（aggregate.ts，如 phone：<200 / 200-400 /
//   400-600 / 600-800 / 800-1000 / 1000+）；归属 = min 含、max 不含
//   （恰好 400 → 400-600）；顶档 max 为 null（开放上界）；
// ②现价取数：该配置全部颜色 SKU 在最新有价期的全部价格点（各平台/店铺行全取）。
//   周度市场（非 ZA）= factPriceWeekly 中 country/sku 命中且 price_usd != null
//   的行，最新 = max week_id；ZA（运营商小册子月度）= factPriceMonthly 中
//   price_type === 'prepaid' 且 price_usd != null 的行，最新 = max period_id——
//   installment 行是月供分期金额，与一次性 prepaid 价格不可比，剔除；
// ③异常剔除：均值一次性算全量点（不迭代）；点数 ≥ 2 时剔除
//   usd < 均值 × 0.7 的点（低于均值 30% 以上，恰 70% 保留）；单点永不剔除；
// ④现价 = 剩余点的 min usd，并带出同一行的本币价；
// ⑤落档恒按 USD（币种开关只影响展示）；无价格 = tier null（「暂无现价」）。
// 无副作用、无 React；事实表在数据包置换时原位替换，索引一律按调用现算（不缓存），
// 与 components/ProductPicker/tierRecommend.ts 同一约定。
// ============================================================
import { dimProduct, factPriceMonthly, factPriceWeekly } from '../data';
import { lowestPriceColorSku, tierBandsOf } from './aggregate';
import { isOperatorBookletMarket } from './marketProfile';
import type { Industry } from './types';
import type { ProductSelection } from '../state/filtersTypes';

const norm = (s: string): string => s.replace(/\s+/g, '');

/** 一个价格点：一条渠道/店铺行在某期对某颜色 SKU 的成交价 */
export interface PricePoint {
  usd: number;
  local: number | null;
  sku: string;
  channel: string;
  seller?: string;
}

/** 现价裁定结果：现价（USD/本币）+ 取价期 + 参与点数 + 被剔除的异常点 */
export interface CurrentPrice {
  usd: number | null;
  local: number | null;
  period: string | null;
  /** 该期参与裁定的价格点总数（剔除前） */
  points: number;
  /** 低于均值 30% 以上被剔除的点 */
  dropped: PricePoint[];
}

/** 规则 3-4（纯）：对一期价格点做异常剔除并取最低现价。points 应为同一期的点；
 *  period 只作透传记录。空点集 → 全 null。 */
export function pickCurrentPrice(points: readonly PricePoint[], period: string | null): CurrentPrice {
  if (points.length === 0) return { usd: null, local: null, period, points: 0, dropped: [] };
  const mean = points.reduce((sum, p) => sum + p.usd, 0) / points.length;
  // 单点永不剔除；均值只算一次（不迭代）；恰为均值 70% 的点保留
  const dropped = points.length >= 2 ? points.filter((p) => p.usd < mean * 0.7) : [];
  const kept = points.length >= 2 ? points.filter((p) => p.usd >= mean * 0.7) : [...points];
  let best = kept[0];
  for (const p of kept) {
    if (p.usd < best.usd) best = p;
  }
  return { usd: best.usd, local: best.local, period, points: points.length, dropped };
}

/** 规则 2：某组 SKU 在某国最新有价期的全部价格点。周度市场走 factPriceWeekly
 *  （max week_id）；运营商小册子市场（ZA，isOperatorBookletMarket）走
 *  factPriceMonthly 的 prepaid 行（max period_id，installment 月供分期与
 *  一次性价不可比，剔除）。无价格点 → period null、空集。 */
export function latestPricePoints(skuIds: readonly string[], countryCode: string): { period: string | null; points: PricePoint[] } {
  const skus = new Set(skuIds);
  if (isOperatorBookletMarket(countryCode)) {
    const rows = factPriceMonthly.filter(
      (row) => row.country_code === 'ZA' && row.sku_id != null && skus.has(row.sku_id) && row.price_type === 'prepaid' && row.price_usd != null,
    );
    if (rows.length === 0) return { period: null, points: [] };
    const period = rows.reduce((max, row) => (row.period_id > max ? row.period_id : max), rows[0].period_id);
    return {
      period,
      points: rows
        .filter((row) => row.period_id === period)
        .map((row) => ({
          usd: row.price_usd as number,
          local: row.price_local,
          sku: row.sku_id as string,
          channel: row.platform,
        })),
    };
  }
  const rows = factPriceWeekly.filter(
    (row) => row.country_code === countryCode && skus.has(row.sku_id) && row.price_usd != null,
  );
  if (rows.length === 0) return { period: null, points: [] };
  const period = rows.reduce((max, row) => (row.week_id > max ? row.week_id : max), rows[0].week_id);
  return {
    period,
    points: rows
      .filter((row) => row.week_id === period)
      .map((row) => ({
        usd: row.price_usd as number,
        local: row.price_local,
        sku: row.sku_id,
        channel: row.channel_id,
        seller: row.seller,
      })),
  };
}

/** 规则 2+3+4 串联：某组 SKU 在某国的现价裁定 */
export function currentPriceOf(skuIds: readonly string[], countryCode: string): CurrentPrice {
  const { period, points } = latestPricePoints(skuIds, countryCode);
  return pickCurrentPrice(points, period);
}

/** 规则 1+5：USD 价落产业档位（min 含、max 不含；顶档开放上界）。无价/低于 0 → null */
export function priceBandOf(industry: Industry, usd: number | null): string | null {
  if (usd == null) return null;
  for (const band of tierBandsOf(industry)) {
    if (usd >= band.min && (band.max == null || usd < band.max)) return band.code;
  }
  return null;
}

/** 档位阶梯 ±1 档（低 → 高序）：底端 lower=null、顶端 upper=null */
export function neighborBands(industry: Industry, code: string): { lower: string | null; upper: string | null } {
  const order = tierBandsOf(industry).map((b) => b.code);
  const idx = order.indexOf(code);
  if (idx < 0) return { lower: null, upper: null };
  return {
    lower: idx > 0 ? order[idx - 1] : null,
    upper: idx < order.length - 1 ? order[idx + 1] : null,
  };
}

/** 「型号 × 配置」维表组在当前国家的现价与落档：SKU 集 = dimProduct 中
 *  modelId + 同 romram（空白归一，与 tierRecommend.ts 同口径）的全部颜色 SKU
 *  里覆盖该国者；该国无覆盖 SKU → tier null、空裁定 */
export function currentTierOfSelection(sel: ProductSelection, countryCode: string): { tier: string | null; price: CurrentPrice } {
  const rows = dimProduct.filter(
    (p) => p.model_id === sel.modelId && norm(p.romram) === norm(sel.romram) && p.countries.includes(countryCode),
  );
  if (rows.length === 0) {
    return { tier: null, price: { usd: null, local: null, period: null, points: 0, dropped: [] } };
  }
  const price = currentPriceOf(rows.map((p) => p.sku_id), countryCode);
  return { tier: priceBandOf(rows[0].industry, price.usd), price };
}

/** 批量结果行：组键 = groupKeyOf（romram 空白剥离，与 selKey 同归一） */
export interface GroupPriceEntry {
  tier: string | null;
  price: CurrentPrice;
  sel: ProductSelection;
}

/** 组键（2026-11-28 键归一修复）：currentPricesByGroup 的 Map 键与全部查询侧共用
 *  这一个口径——romram 空白剥离（`8+256 GB` / `8+256GB` 同键）。此前 Map 键用 dimProduct
 *  原值（带空格）而 columnsModel/intentFilter 查询侧用剥离空白键 → 全部 miss、档位分组
 *  整体落「暂无现价」。selKey（mainSelection）同一归一——本函数与之显式对齐。 */
export function groupKeyOf(modelId: string, romram: string): string {
  return `${modelId}|${romram.replace(/\s+/g, '')}`;
}

/** 批量现价裁定（2026-11-27 按档位选择方式的性能前提）：事实表只扫一遍——
 *  先建 sku → 组键索引，再一次遍历收集各组最新有价期的全部价格点，
 *  逐组走 pickCurrentPrice（规则 3-4 同一口径，与 currentTierOfSelection 逐组结果一致）。
 *  组 = dimProduct 中该产业、覆盖该国的 (modelId, romram) 去重集；
 *  SKU 集取 dimProduct 原值（不过滤定价口径——financing 过滤由调用方在展示层收窄）。
 *  不缓存：事实表在数据包置换时原位替换，每次调用现算。 */
export function currentPricesByGroup(industry: Industry, countryCode: string): Map<string, GroupPriceEntry> {
  // ① 组键 → SKU 集（同 modelId + romram 归一的全部颜色 SKU 里覆盖该国者）
  const skuToGroup = new Map<string, string>();
  const groupSkus = new Map<string, string[]>();
  const groupFirst = new Map<string, (typeof dimProduct)[number]>();
  for (const p of dimProduct) {
    if (p.industry !== industry || !p.countries.includes(countryCode)) continue;
    const key = groupKeyOf(p.model_id, p.romram);
    skuToGroup.set(p.sku_id, key);
    if (!groupFirst.has(key)) groupFirst.set(key, p);
    const list = groupSkus.get(key);
    if (list) list.push(p.sku_id);
    else groupSkus.set(key, [p.sku_id]);
  }
  // sel.skuIds = 默认最低价色（与手动勾选 / configsInTier 同口径；无价回退组内首个 SKU）
  const groupSel = new Map<string, ProductSelection>();
  for (const [key, first] of groupFirst) {
    const low = lowestPriceColorSku(first.model_id, first.romram, countryCode);
    groupSel.set(key, { modelId: first.model_id, romram: first.romram, skuIds: [low ?? first.sku_id] });
  }
  // ② 一遍扫描：sku → 全部有价点（不按周/期分桶，组内再取最大期）
  const booklet = isOperatorBookletMarket(countryCode);
  /** 组键 → (period → points) */
  const byGroupPeriod = new Map<string, Map<string, PricePoint[]>>();
  const push = (skuId: string, period: string, point: PricePoint): void => {
    const gk = skuToGroup.get(skuId);
    if (!gk) return;
    let periods = byGroupPeriod.get(gk);
    if (!periods) {
      periods = new Map();
      byGroupPeriod.set(gk, periods);
    }
    const list = periods.get(period);
    if (list) list.push(point);
    else periods.set(period, [point]);
  };
  if (booklet) {
    for (const row of factPriceMonthly) {
      if (row.country_code !== countryCode || row.sku_id == null || row.price_type !== 'prepaid' || row.price_usd == null) continue;
      push(row.sku_id, row.period_id, {
        usd: row.price_usd,
        local: row.price_local,
        sku: row.sku_id,
        channel: row.platform,
      });
    }
  } else {
    for (const row of factPriceWeekly) {
      if (row.country_code !== countryCode || row.price_usd == null || !skuToGroup.has(row.sku_id)) continue;
      push(row.sku_id, row.week_id, {
        usd: row.price_usd,
        local: row.price_local,
        sku: row.sku_id,
        channel: row.channel_id,
        seller: row.seller,
      });
    }
  }
  // ③ 逐组取最新期 → pickCurrentPrice → 落档
  const out = new Map<string, GroupPriceEntry>();
  for (const [key, sel] of groupSel) {
    const periods = byGroupPeriod.get(key);
    let price: CurrentPrice = { usd: null, local: null, period: null, points: 0, dropped: [] };
    if (periods) {
      const latest = [...periods.keys()].reduce((a, b) => (b > a ? b : a));
      price = pickCurrentPrice(periods.get(latest) ?? [], latest);
    }
    out.set(key, { tier: priceBandOf(industry, price.usd), price, sel });
  }
  return out;
}
