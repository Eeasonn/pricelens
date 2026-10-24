// ============================================================
// 各国默认平台店铺覆盖（第一百三十五轮）：配置页「默认平台店铺」维护，
// cc → channel_id（平台+店铺口径的默认取数点）。
// 未配置的国家回落维表口径：dim_region.default_platform 的全部渠道内最低价
// （effectiveChannelIds 的默认分支）。独立小模块：aggregate 取数层与配置页
// 都要读它，避免 configStore ↔ aggregate 循环引用。
// 读缓存：defaultChannelOf 在 aggregate 每次取价都会走到（预警全订阅扫描 =
// 订阅数 × 周数线性放大），每次读盘 + JSON.parse 不划算——解析结果按模块缓存，
// 保存写入与 CONFIG_CHANGED_EVENT 广播时失效（跨页签改配置的场景靠广播兜底）。
// ============================================================
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';

export type DefaultShopOverrides = Record<string, string>; // countryCode → channel_id

let cachedMap: DefaultShopOverrides | null = null;

function readMap(): DefaultShopOverrides {
  if (cachedMap) return cachedMap;
  try {
    const raw = localStorage.getItem(LPL.cfgDefaultShop);
    if (!raw) {
      cachedMap = {};
      return cachedMap;
    }
    const parsed = JSON.parse(raw) as DefaultShopOverrides;
    cachedMap = parsed != null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    return cachedMap;
  } catch {
    cachedMap = {};
    return cachedMap;
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
  cachedMap = null; // 以实际落盘内容为准，下次读取重建缓存
}

// 配置保存广播 → 缓存失效（含别的页签/入口直接改盘后广播的场景）。
// 模块加载即挂、重复加载天然幂等；无 window 的环境（SSR/测试）跳过
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(CONFIG_CHANGED_EVENT, () => {
    cachedMap = null;
  });
}
