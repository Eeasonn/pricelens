// ============================================================
// 默认平台店铺覆盖：支持国家级与我司产品级两层配置。
// 国家级覆盖沿用 LPL3.config.defaultShop 的 cc → channel_id 结构。
// 产品级覆盖使用 `${countryCode}::${modelId}` → channel_id，优先于国家级。
// 未配置的国家/产品回落维表预填主店，再回默认平台。
// ============================================================
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';
import { canEditConfig } from '../access/role';

export const PRODUCT_DEFAULT_SHOP_SEPARATOR = '::';
export type DefaultShopOverrides = Record<string, string>;

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

export function productDefaultShopKey(countryCode: string, modelId: string): string {
  return `${countryCode}${PRODUCT_DEFAULT_SHOP_SEPARATOR}${modelId}`;
}

/** 某产品在某国配置的默认店铺；未配置产品级时返回 null。 */
export function productDefaultShopOverrideOf(countryCode: string, modelId: string): string | null {
  return readMap()[productDefaultShopKey(countryCode, modelId)] ?? null;
}

/** 某国配置的默认平台店铺（channel_id）；未配置返回 null。 */
export function defaultShopOverrideOf(countryCode: string, modelId?: string): string | null {
  const map = readMap();
  if (modelId) {
    const product = map[productDefaultShopKey(countryCode, modelId)];
    if (product) return product;
  }
  return map[countryCode] ?? null;
}

/** 保存默认店铺覆盖表。查阅者角色写为 no-op。 */
export function saveDefaultShopOverrides(map: DefaultShopOverrides): void {
  if (!canEditConfig()) return;
  try {
    localStorage.setItem(LPL.cfgDefaultShop, JSON.stringify(map));
  } catch {
    // 隐私模式等写入失败时，调用方仍保持当次会话状态。
  }
  cachedMap = null;
}

/** 写入或清除某个国家×产品的默认店铺。 */
export function saveProductDefaultShop(countryCode: string, modelId: string, channelId: string | null): void {
  const map = { ...getDefaultShopOverrides() };
  const key = productDefaultShopKey(countryCode, modelId);
  if (channelId) map[key] = channelId;
  else delete map[key];
  saveDefaultShopOverrides(map);
}

/** 当前配置中的产品级覆盖数量。 */
export function countProductDefaultShopOverrides(map: DefaultShopOverrides = getDefaultShopOverrides()): number {
  return Object.keys(map).filter((key) => key.includes(PRODUCT_DEFAULT_SHOP_SEPARATOR)).length;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(CONFIG_CHANGED_EVENT, () => {
    cachedMap = null;
  });
}
