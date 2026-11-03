// ============================================================
// 大促档期共享语义（量价走势页对齐价格走势页，2026-11-03）：
// 价格页（PriceTrend/index + Chart）与量价页（VolumePrice + CostBarChart）
// 共用的档期深度色与「国家 × 平台并集」档期圈定逻辑。此前深度色硬编码在
// Chart.tsx 两处（背景带 / 事件卡深度点），页面各自圈定档期会漂移——
// 抽到一处，颜色值与过滤行为零变化。
// ============================================================
import { defaultPlatformAnchorOf } from '../../dataModel/aggregate';
import type { DimPromo } from '../../dataModel/types';

/** 档期背景带底色（第三十四轮定值，红晕三档深度；不改值只收口） */
export function bandColorOf(depth: DimPromo['depth_hint']): string {
  return depth === '深'
    ? 'rgba(235, 87, 87, 0.055)'
    : depth === '中'
      ? 'rgba(235, 87, 87, 0.035)'
      : 'rgba(235, 87, 87, 0.018)';
}

/** 档期事件卡深度点色（第三十六轮定值；比背景带深一档，卡内可读） */
export function promoDepthDotColorOf(depth: DimPromo['depth_hint']): string {
  return depth === '深'
    ? 'rgba(235, 87, 87, 0.75)'
    : depth === '中'
      ? 'rgba(235, 87, 87, 0.5)'
      : 'rgba(235, 87, 87, 0.3)';
}

/** 平台名归一化（第一百六十轮口径不变）：小写 + 去非字母数字（俄/英平台名大小写、空格差异容忍） */
export function normalizedPlatformKey(p: string): string {
  return p.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 档期圈定（价格页 index.tsx:973 同式抽出）：国家命中 + 平台圈定——
 * 标注了适用平台的档期（如亚马逊 Prime Day）只在所选平台、或未选时的默认
 * 店铺归属平台（未配置回国家默认平台 defaultPlatformAnchorOf）显示；
 * platforms = null（全渠道档期）恒显示。平台集为空时回默认平台锚点。
 */
export function scopedPromosOf(p: {
  promos: DimPromo[];
  countryCode: string;
  platforms: Iterable<string>;
}): DimPromo[] {
  const list = [...p.platforms].map(normalizedPlatformKey);
  if (list.length === 0) {
    const dp = defaultPlatformAnchorOf(p.countryCode);
    if (dp) list.push(normalizedPlatformKey(dp));
  }
  const selectedLower = new Set(list);
  return p.promos.filter(
    (promo) => promo.country_code === p.countryCode
      && (promo.platforms == null || promo.platforms.some((pl) => selectedLower.has(normalizedPlatformKey(pl)))),
  );
}
