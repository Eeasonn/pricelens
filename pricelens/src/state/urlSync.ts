// ============================================================
// URL query 同步（第五十四轮追补⑩，总览↔看板闭环建议③）：
// 页签 / 粒度 / 币种 / 平台店铺 / 我司产品 写入 location.search（replaceState，
// 不产生历史记录），启动时反向读取——任何页面状态都能复制链接分享/收藏。
// 设计约束：
// - 单一写入口 writeUrlPatch(patch)：读当前 query 合并后写，两个 Provider 各写
//   各的键互不覆盖；
// - own = 逗号分隔系列 key（modelId__romram去空格），恢复时反查 dimProduct 还原
//   ProductSelection（romram 原文 + 最低价颜色 SKU），竞品按 autoMatch 现行规则带出；
// - 参数不合法（型号不存在等）静默忽略，回退默认/持久化值。
// ============================================================
import { dimProduct } from '../data';
import type { FiltersState, PlatformSelection, ProductSelection } from './filtersTypes';
import type { Page } from './PageContext';
import { lowestPriceColorSku } from '../dataModel/aggregate';

const norm = (s: string): string => s.replace(/\s+/g, '');

const PAGES: Page[] = ['overview', 'dashboard', 'config', 'alerts'];

/** 系列反查：seriesKey → ProductSelection（romram 原文 + 最低价颜色 SKU）；不存在 = null */
export function productSelectionOfSeriesKey(key: string): ProductSelection | null {
  const sep = key.indexOf('__');
  if (sep < 0) return null;
  const modelId = key.slice(0, sep);
  const rom = key.slice(sep + 2);
  const row = dimProduct.find((p) => p.sku_id.startsWith(modelId + '__') && norm(p.romram) === rom);
  if (!row) return null;
  const skuId = lowestPriceColorSku(modelId, row.romram);
  if (!skuId) return null;
  return { modelId, romram: row.romram, skuIds: [skuId] };
}

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
    const shop = q.get('shop');
    if (shop) out.filters.platform = { platforms: [], shopIds: [shop] } as PlatformSelection;
    const own = q.get('own');
    if (own) {
      const list = own
        .split(',')
        .map((k) => productSelectionOfSeriesKey(k.trim()))
        .filter((x): x is ProductSelection => x != null);
      if (list.length > 0) out.filters.own = list;
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
