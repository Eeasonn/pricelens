// ============================================================
// URL query 同步（第五十四轮追补⑩，总览↔看板闭环建议③）：
// 页签 / 粒度 / 币种 / 平台店铺 / 主分析产品 写入 location.search（replaceState，
// 不产生历史记录），启动时反向读取——任何页面状态都能复制链接分享/收藏。
// 设计约束：
// - 单一写入口 writeUrlPatch(patch)：读当前 query 合并后写，两个 Provider 各写
//   各的键互不覆盖；
// - main = 逗号分隔配置 key（modelId__romram去空格），恢复时反查 dimProduct 还原
//   ProductSelection（romram 原文 + 最低价颜色 SKU）并逐项成卡（第一百二十轮：
//   同型号不同配置 = 两张卡，不再按型号合并；未选主品的空对不写入 URL）；对比区按
//   autoMatch 现行规则带出；第一百一十七轮起参数名 own → main（旧链接仍可读），
//   且任意品牌都可做主分析（角色由用户指定，不再限华为）；
// - 参数不合法（型号不存在等）静默忽略，回退默认/持久化值。
// ============================================================
import { dimProduct } from '../data';
import type { FiltersState, PlatformSelection, ProductSelection } from './filtersTypes';
import type { Page } from './PageContext';
import { lowestPriceColorSku } from '../dataModel/aggregate';
import { cardsFromSelections, clampMains } from './mainSelection';
import { getCurrentCountry } from './currentScope';

const norm = (s: string): string => s.replace(/\s+/g, '');

const PAGES: Page[] = ['overview', 'dashboard', 'volume', 'config', 'alerts'];

/** 逗号列表参数 → 去空白、去空项 */
const listParam = (q: URLSearchParams, name: string): string[] =>
  (q.get(name) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** 系列反查：seriesKey → ProductSelection（romram 原文 + 最低价颜色 SKU）；不存在 = null。
 *  第一百一十七轮：主分析可任意品牌（旧 ownOnly 白名单随之退役）。
 *  countryCode = 取代表色 SKU 的国家口径（链接自带 c= 时须显式传入：解析发生在
 *  数据层缺省国家切换之前，按持久化国家取色会在该国无价时把主品整个丢掉）。 */
export function productSelectionOfSeriesKey(key: string, countryCode: string = getCurrentCountry()): ProductSelection | null {
  const sep = key.indexOf('__');
  if (sep < 0) return null;
  const modelId = key.slice(0, sep);
  const rom = key.slice(sep + 2);
  const row = dimProduct.find((p) => p.sku_id.startsWith(modelId + '__') && norm(p.romram) === rom);
  if (!row) return null;
  const skuId = lowestPriceColorSku(modelId, row.romram, countryCode);
  if (!skuId) return null;
  return { modelId, romram: row.romram, skuIds: [skuId] };
}

// 兼容旧名（预警跳转等按系列 key 解析任意产品）
export const productSelectionOfAnySeriesKey = productSelectionOfSeriesKey;

/** 启动时读取 URL 覆写（在持久化/默认视图之后应用） */
export function readUrlOverrides(): { page?: Page; filters: Partial<FiltersState> } {
  const out: { page?: Page; filters: Partial<FiltersState> } = { filters: {} };
  try {
    const q = new URLSearchParams(window.location.search);
    const p = q.get('p');
    if (p && (PAGES as string[]).includes(p)) out.page = p as Page;
    const g = q.get('g');
    if (g === 'week' || g === 'month' || g === 'quarter') out.filters.granularity = g;
    const cur = q.get('cur');
    if (cur === 'usd' || cur === 'local') out.filters.currency = cur;
    const c = q.get('c');
    if (c) out.filters.countryCode = c;
    const i = q.get('i');
    if (i) out.filters.industry = i as FiltersState['industry'];
    // 第一百二十三轮：按档位主体模式退役，旧链接的 m=tier / t= 参数静默忽略
    // 平台：plat = 整平台列表、shop = 渠道列表（旧链接单个 shop 同样可读）；
    // 是否属于链接国家由 applyScopeDefaults 校验
    const platforms = listParam(q, 'plat');
    const shopIds = listParam(q, 'shop');
    if (platforms.length || shopIds.length) out.filters.platform = { platforms, shopIds } as PlatformSelection;
    // 第一百一十七轮：main = 主分析配置 key 列表；旧链接的 own 参数同语义读入
    const mainParam = q.get('main') ?? q.get('own');
    if (mainParam) {
      const country = c || getCurrentCountry();
      const list = mainParam
        .split(',')
        .map((k) => productSelectionOfSeriesKey(k.trim(), country))
        .filter((x): x is ProductSelection => x != null);
      if (list.length > 0) out.filters.mains = clampMains(cardsFromSelections(list));
    }
  } catch {
    /* 无 window / 解析失败 = 无覆写 */
  }
  return out;
}

/** 合并写单个参数（null = 删除该键） */
export function writeUrlPatch(patch: Record<string, string | null>): void {
  try {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    window.history.replaceState(null, '', url);
  } catch {
    /* 无 window（SSG/测试）忽略 */
  }
}
