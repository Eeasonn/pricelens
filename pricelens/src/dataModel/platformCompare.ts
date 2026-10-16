// ============================================================
// 单产品多平台对比纯计算层（第五十三轮）：同一 SKU 组的价格按平台展开。
// 口径：基准价 = fact OZON 基准组内多色均值（与 buildSeries/alerts 同源）；
// 各平台独立价 = 基准 × 平台因子+抖动（platformPriceSpread，与 applyPlatform 同源——
// 多平台并选均值口径互不影响）。周度全horizon（不裁窗口，弹窗侧自行缩放）。
// 确定性纯函数：同入参两次调用输出逐字节一致；金测锚定。
// ============================================================
import { dimChannel, dimProduct, dimTime, factPriceWeekly } from '../data';
import type { CurrencyMode } from './types';
import { platformPriceSpread } from './aggregate';

/** 平台稳定序（dimChannel 插入序：OZON → DNS → M.Video） */
export const PLATFORM_ORDER: string[] = [...new Set(dimChannel.map((c) => c.platform))];

export interface PlatformComparePoint {
  weekId: string; // YYYYWW
  label: string; // 采集锚周三 MM-DD
}

export interface PlatformCompareSeries {
  platform: string;
  points: (number | null)[]; // 与 weeks 一一对应（该平台折后价，展示币种取整）
}

export interface PlatformCompareResult {
  weeks: PlatformComparePoint[];
  series: PlatformCompareSeries[]; // PLATFORM_ORDER 序
  latest: {
    weekId: string;
    label: string;
    gapPct: number; // 最高/最低 − 1
    high: { platform: string; price: number };
    low: { platform: string; price: number };
  } | null;
}

/**
 * 构建某型号某 ROM 的多平台周度价目（我司/竞品 SKU 组都支持；竞品用于跨品牌比价场景）。
 * @param skuIds 组内 SKU（OverviewRow.skuId 所在颜色组；传单个代表 SKU 亦可）
 */
export function buildPlatformCompare(
  modelId: string,
  romram: string,
  skuIds: string[],
  currency: CurrencyMode,
): PlatformCompareResult {
  const useUsd = currency === 'usd';
  const norm = (s: string) => s.replace(/\s+/g, '');
  const group = dimProduct
    .filter((p) => p.sku_id.startsWith(`${modelId}__`) && norm(p.romram) === norm(romram))
    .sort((a, b) => a.sku_id.localeCompare(b.sku_id));
  const members = group.length > 0 ? group.map((p) => p.sku_id) : skuIds;
  const repSku = members[0] ?? '';

  // fact 索引（小数据集直接线性建；与 alerts.factCellIndex 同构但独立，保持本层无内部状态）
  const cell = new Map<string, Map<string, { usd: number | null; rub: number | null }>>();
  for (const row of factPriceWeekly) {
    if (!members.includes(row.sku_id)) continue;
    let byWeek = cell.get(row.sku_id);
    if (!byWeek) {
      byWeek = new Map();
      cell.set(row.sku_id, byWeek);
    }
    byWeek.set(row.week_id, { usd: row.discounted_price_usd, rub: row.discounted_price_rub });
  }

  const timeAsc = [...dimTime].sort((a, b) => (a.week_id < b.week_id ? -1 : 1));
  const weeks: PlatformComparePoint[] = [];
  const byPlatform: number[][] = PLATFORM_ORDER.map(() => []);
  let latest: PlatformCompareResult['latest'] = null;

  for (const w of timeAsc) {
    let sum = 0;
    let n = 0;
    for (const sku of members) {
      const c = cell.get(sku)?.get(w.week_id);
      const v = c == null ? null : useUsd ? c.usd : c.rub;
      if (v != null) {
        sum += v;
        n++;
      }
    }
    if (n === 0) {
      // 缺采周：整周跳过（弹窗 x 轴不生成空档；与总览迷你图直连口径不同，此处聚焦可比周）
      continue;
    }
    const base = sum / n;
    const spread = platformPriceSpread(base, repSku, w.week_id);
    const byPrice = new Map(spread.map((s) => [s.platform, s.price]));
    weeks.push({ weekId: w.week_id, label: w.week_wed_date.slice(5) });
    PLATFORM_ORDER.forEach((p, i) => byPlatform[i].push(Math.round(byPrice.get(p) ?? base)));
    const low = spread[0];
    const high = spread[spread.length - 1];
    latest = {
      weekId: w.week_id,
      label: w.week_wed_date.slice(5),
      gapPct: low.price > 0 ? high.price / low.price - 1 : 0,
      high: { platform: high.platform, price: Math.round(high.price) },
      low: { platform: low.platform, price: Math.round(low.price) },
    };
  }

  return {
    weeks,
    series: PLATFORM_ORDER.map((p, i) => ({ platform: p, points: byPlatform[i] })),
    latest,
  };
}
