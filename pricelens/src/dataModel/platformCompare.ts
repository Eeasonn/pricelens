// ============================================================
// 单产品多平台对比纯计算层：同一 SKU 组的真实价格按平台展开（分国）。
// 口径：各平台 = 该平台全部渠道/店铺内最低在架价（platformPriceSpread 同源）；
// 周度全 horizon（不裁窗口，弹窗侧自行缩放）。确定性纯函数。
// ============================================================
import { dimChannel, dimProduct, dimTime } from '../data';
import type { CurrencyMode } from './types';
import { platformPriceSpread } from './aggregate';
import { getCurrentCountry } from '../state/currentScope';

/** 某国平台稳定序（dimChannel 插入序 = 行数降序） */
export function platformOrderOf(countryCode: string): string[] {
  return [...new Set(dimChannel.filter((c) => c.country_code === countryCode).map((c) => c.platform))];
}

/** 兼容旧引用：当前分析国的平台序 */
export const PLATFORM_ORDER: string[] = platformOrderOf(getCurrentCountry());

export interface PlatformComparePoint {
  weekId: string; // YYYYWW
  label: string; // 采集锚周三 MM-DD
}

export interface PlatformCompareSeries {
  platform: string;
  points: (number | null)[]; // 与 weeks 一一对应（该平台折后价，展示币种取整；该周无该平台 = null）
}

export interface PlatformCompareResult {
  weeks: PlatformComparePoint[];
  series: PlatformCompareSeries[];
  latest: {
    weekId: string;
    label: string;
    gapPct: number; // 最高/最低 − 1
    high: { platform: string; price: number };
    low: { platform: string; price: number };
  } | null;
}

/**
 * 构建某型号某配置的多平台周度价目（组内多色取各平台最低）。
 * @param skuIds 组内 SKU（传单个代表 SKU 亦可）
 */
export function buildPlatformCompare(
  modelId: string,
  romram: string,
  skuIds: string[],
  currency: CurrencyMode,
  countryCode: string = getCurrentCountry(),
): PlatformCompareResult {
  const norm = (s: string) => s.replace(/\s+/g, '');
  const group = dimProduct
    .filter((p) => p.sku_id.startsWith(`${modelId}__`) && norm(p.romram) === norm(romram))
    .sort((a, b) => a.sku_id.localeCompare(b.sku_id));
  const members = group.length > 0 ? group.map((p) => p.sku_id) : skuIds;
  const platforms = platformOrderOf(countryCode);

  const timeAsc = [...dimTime].sort((a, b) => (a.week_id < b.week_id ? -1 : 1));
  const weeks: PlatformComparePoint[] = [];
  const byPlatform: (number | null)[][] = platforms.map(() => []);
  let latest: PlatformCompareResult['latest'] = null;

  for (const w of timeAsc) {
    const minByPlatform = new Map<string, number>();
    for (const sku of members) {
      for (const s of platformPriceSpread(sku, w.week_id, countryCode, currency)) {
        const cur = minByPlatform.get(s.platform);
        if (cur == null || s.price < cur) minByPlatform.set(s.platform, s.price);
      }
    }
    if (minByPlatform.size === 0) continue; // 缺采周：整周跳过
    weeks.push({ weekId: w.week_id, label: w.week_wed_date.slice(5) });
    platforms.forEach((p, i) => {
      const v = minByPlatform.get(p);
      byPlatform[i].push(v == null ? null : Math.round(v));
    });
    const sorted = [...minByPlatform.entries()].sort((a, b) => a[1] - b[1]);
    const [lowP, lowV] = sorted[0];
    const [highP, highV] = sorted[sorted.length - 1];
    latest = {
      weekId: w.week_id,
      label: w.week_wed_date.slice(5),
      gapPct: lowV > 0 ? highV / lowV - 1 : 0,
      high: { platform: highP, price: Math.round(highV) },
      low: { platform: lowP, price: Math.round(lowV) },
    };
  }

  return {
    weeks,
    series: platforms.map((p, i) => ({ platform: p, points: byPlatform[i] })),
    latest,
  };
}
