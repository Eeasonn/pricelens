// ============================================================
// 预警中心纯计算层（第五十二轮建 / 第五十三轮扩三类）：订阅系列 × 周度扫描 → 规则预警。
// 规则口径（demo，与看板/总览同源数据）：
// - 调价预警 price-change = 相邻有值周 |折后价变化| ≥ 阈值（我司/竞品系列都出——
//   第五十三轮起我司自身调价也通知，原「竞品调价」扩围）；
// - 降促预警 promo = 促销力度 = 1 − 折后价/RRP（双价齐全才有值）；相邻有值周
//   |力度差| ≥ 阈值 → 通知附 对比 RRP 幅度（price/rrp−1）与 对比前周幅度（WoW%）；
// - 平台价差预警 platform-gap = 仅我司品牌系列：同一周各平台独立折后价（平台因子
//   抖动与 applyPlatform 同源）最高/最低差 ≥ 阈值 → 通知附 最高/最低平台与价格；
// - 缺采周不打断比较链（prev 跨缺采延续，与 buildChangeMarks 同口径）；
// - 价格恒 OZON 基准（单平台口径，与总览矩阵一致），币种随入参折算。
// 确定性纯函数：同入参两次调用输出逐字节一致；金测锚定。
// ============================================================
import { dimProduct, dimTime, factPriceWeekly } from '../data';
import type { CurrencyMode } from './types';
import { platformPriceSpread } from './aggregate';

export type AlertType = 'promo' | 'price-change' | 'platform-gap';

export interface AlertItem {
  key: string; // `${seriesKey}|${weekId}|${type}`
  type: AlertType;
  seriesKey: string; // modelId__romram去空格（订阅/图例同空间）
  brand: string;
  modelName: string;
  romram: string;
  isOwn: boolean;
  weekId: string; // YYYYWW
  weekLabel: string; // 采集锚周三 MM-DD
  price: number | null; // 现折后价（入参币种，已取整）
  rrp: number | null;
  vsRrpPct: number | null; // price/rrp − 1（对比 RRP 幅度）
  wowPct: number | null; // 相邻有值周 price 变化（对比前周幅度）
  promoDeltaPp: number | null; // 促销力度变化（百分点，正 = 加深）
  // ---- 平台价差（第五十三轮，仅 platform-gap 出）----
  gapPct: number | null; // 周内平台价差 = 最高/最低 − 1
  gapHighPlatform: string | null; // 最高价平台
  gapLowPlatform: string | null; // 最低价平台
  gapHighPrice: number | null; // 展示币种
  gapLowPrice: number | null;
}

export interface AlertSeriesMeta {
  seriesKey: string;
  label: string; // 品牌 + 型号 + ROMRAM（订阅 chips 展示）
  brand: string;
  modelName: string;
  romram: string;
  isOwn: boolean;
  skuId: string; // 代表 SKU（组内字典序首个）
}

const norm = (s: string): string => s.replace(/\s+/g, '');
const EPS = 1e-9;

// 模块内懒构建一次（aggregate.factIndex 为私有实现，此处独立建同构索引；
// 双币种字段都留——通知币种随入参，触发判定用比值与币种无关）
interface FactCell {
  priceUsd: number | null;
  priceRub: number | null;
  rrpUsd: number | null;
  rrpRub: number | null;
}
let cellIdx: Map<string, Map<string, FactCell>> | null = null;
function factCellIndex(): Map<string, Map<string, FactCell>> {
  if (!cellIdx) {
    cellIdx = new Map();
    for (const row of factPriceWeekly) {
      let byWeek = cellIdx.get(row.sku_id);
      if (!byWeek) {
        byWeek = new Map();
        cellIdx.set(row.sku_id, byWeek);
      }
      byWeek.set(row.week_id, {
        priceUsd: row.discounted_price_usd,
        priceRub: row.discounted_price_rub,
        rrpUsd: row.rrp_usd,
        rrpRub: row.rrp_rub,
      });
    }
  }
  return cellIdx;
}

const timeAsc = [...dimTime].sort((a, b) => (a.week_id < b.week_id ? -1 : 1));

/** seriesKey（modelId__romram去空格）→ 系列元数据；无产品行 = null */
export function alertSeriesMeta(seriesKey: string): AlertSeriesMeta | null {
  const sep = seriesKey.indexOf('__');
  if (sep < 0) return null;
  const modelId = seriesKey.slice(0, sep);
  const rom = seriesKey.slice(sep + 2);
  const rows = dimProduct
    .filter((p) => p.sku_id.startsWith(modelId + '__') && norm(p.romram) === rom)
    .sort((a, b) => a.sku_id.localeCompare(b.sku_id));
  if (rows.length === 0) return null;
  const head = rows[0];
  return {
    seriesKey,
    label: `${head.brand} ${head.model_name} ${head.romram}`,
    brand: head.brand,
    modelName: head.model_name,
    romram: head.romram,
    isOwn: head.is_own === true,
    skuId: head.sku_id,
  };
}

/** 任意 SKU → 其所属系列 key（总览行/型号块组装订阅集用） */
export function seriesKeyOfSku(skuId: string): string {
  const p = dimProduct.find((r) => r.sku_id === skuId);
  if (!p) return skuId;
  return `${p.sku_id.split('__')[0]}__${norm(p.romram)}`;
}

/**
 * 订阅系列的预警扫描（唯一入口）。
 * @param subs 订阅系列 key 列表（modelId__romram去空格）
 * @param threshold 变化阈值（小数，0.05=5%）；调价/降促/平台价差三类共用
 * @param currency 通知内价格币种（触发判定用比值，与币种无关）
 */
export function buildAlerts(subs: string[], threshold: number, currency: CurrencyMode = 'usd'): AlertItem[] {
  if (!(threshold > 0) || subs.length === 0) return [];
  const px = factCellIndex();
  const useUsd = currency === 'usd';
  const out: AlertItem[] = [];
  for (const key of subs) {
    const meta = alertSeriesMeta(key);
    if (!meta) continue;
    const group = dimProduct
      .filter((p) => p.sku_id.startsWith(`${key.split('__')[0]}__`) && norm(p.romram) === norm(meta.romram))
      .sort((a, b) => a.sku_id.localeCompare(b.sku_id));
    let prevPrice: number | null = null;
    let prevIntensity: number | null = null;
    for (const w of timeAsc) {
      // 组内多色均值（与 buildSeries 组聚合同语言）；RRP = 官方阶梯组内一条，取首个有值
      let sum = 0;
      let n = 0;
      let rrp: number | null = null;
      for (const p of group) {
        const cell = px.get(p.sku_id)?.get(w.week_id);
        if (!cell) continue;
        const base = useUsd ? cell.priceUsd : cell.priceRub;
        if (base != null) {
          sum += base;
          n++;
        }
        if (rrp == null) rrp = useUsd ? cell.rrpUsd : cell.rrpRub;
      }
      if (n === 0) continue; // 缺采：prev 跨周延续（比较链不断）
      const price = Math.round(sum / n);
      const intensity = rrp != null && rrp > 0 ? 1 - price / rrp : null;
      const base = {
        seriesKey: key,
        brand: meta.brand,
        modelName: meta.modelName,
        romram: meta.romram,
        isOwn: meta.isOwn,
        weekId: w.week_id,
        weekLabel: w.week_wed_date.slice(5),
        price,
        rrp,
        vsRrpPct: rrp != null && rrp > 0 ? price / rrp - 1 : null,
        wowPct: prevPrice != null && prevPrice > 0 ? price / prevPrice - 1 : null,
        promoDeltaPp: null as number | null,
        gapPct: null as number | null,
        gapHighPlatform: null as string | null,
        gapLowPlatform: null as string | null,
        gapHighPrice: null as number | null,
        gapLowPrice: null as number | null,
      };
      // 降促预警（促销力度变化，双价齐全且前周也有力度）：|Δ力度| ≥ 阈值
      if (intensity != null && prevIntensity != null && Math.abs(intensity - prevIntensity) >= threshold - EPS) {
        out.push({
          ...base,
          key: `${key}|${w.week_id}|promo`,
          type: 'promo',
          promoDeltaPp: (intensity - prevIntensity) * 100,
        });
      }
      // 调价预警（第五十三轮起不限竞品，我司自身调价同样通知）：|WoW| ≥ 阈值
      if (prevPrice != null && prevPrice > 0) {
        const wow = price / prevPrice - 1;
        if (Math.abs(wow) >= threshold - EPS) {
          out.push({
            ...base,
            key: `${key}|${w.week_id}|price-change`,
            type: 'price-change',
            wowPct: wow,
          });
        }
      }
      // 平台价差预警（第五十三轮，仅我司品牌系列）：周内各平台独立价 最高/最低 − 1 ≥ 阈值
      if (meta.isOwn) {
        const spread = platformPriceSpread(price, meta.skuId, w.week_id);
        const low = spread[0];
        const high = spread[spread.length - 1];
        const gap = low.price > 0 ? high.price / low.price - 1 : 0;
        if (gap >= threshold - EPS) {
          out.push({
            ...base,
            key: `${key}|${w.week_id}|platform-gap`,
            type: 'platform-gap',
            gapPct: gap,
            gapHighPlatform: high.platform,
            gapLowPlatform: low.platform,
            gapHighPrice: Math.round(high.price),
            gapLowPrice: Math.round(low.price),
          });
        }
      }
      prevPrice = price;
      prevIntensity = intensity;
    }
  }
  // 最新周在前；同周按类型名字序、再按系列 key（确定性序）
  return out.sort(
    (a, b) =>
      b.weekId.localeCompare(a.weekId) ||
      a.type.localeCompare(b.type) ||
      a.seriesKey.localeCompare(b.seriesKey),
  );
}
