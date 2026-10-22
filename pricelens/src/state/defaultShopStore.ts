// ============================================================
// 各国默认平台店铺覆盖（第一百三十五轮）：配置页「默认平台店铺」维护，
// cc → channel_id（平台+店铺口径的默认取数点）。
// 未配置的国家回落维表口径：dim_region.default_platform 的全部渠道内最低价
// （effectiveChannelIds 的默认分支）。独立小模块：aggregate 取数层与配置页
// 都要读它，避免 configStore ↔ aggregate 循环引用。
// ============================================================
import { LPL } from './lplKeys';

export type DefaultShopOverrides = Record<string, string>; // countryCode → channel_id

function readMap(): DefaultShopOverrides {
  try {
    const raw = localStorage.getItem(LPL.cfgDefaultShop);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DefaultShopOverrides;
    return parsed != null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getDefaultShopOverrides(): DefaultShopOverrides {
  return readMap();
}

/** 某国配置的默认平台店铺（channel_id）；未配置返回 null */
export function defaultShopOverrideOf(countryCode: string): string | null {
  return readMap()[countryCode] ?? null;
}

export function saveDefaultShopOverrides(map: DefaultShopOverrides): void {
  try {
    localStorage.setItem(LPL.cfgDefaultShop, JSON.stringify(map));
  } catch {
    // 隐私模式等写入失败：静默（配置仅在当次会话内由调用方状态兜底）
  }
}
