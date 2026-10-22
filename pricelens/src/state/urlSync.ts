// ============================================================
// URL query 同步（第五十四轮追补⑩，总览↔看板闭环建议③）：
// 页签 / 粒度 / 币种 / 平台店铺 / 主分析产品 写入 location.search（replaceState，
// 不产生历史记录），启动时反向读取——任何页面状态都能复制链接分享/收藏。
// 设计约束：
// - 单一写入口 writeUrlPatch(patch)：读当前 query 合并后写，两个 Provider 各写
//   各的键互不覆盖；
// - main = 逗号分隔配置 key（modelId__romram去空格），恢复时反查 dimProduct 还原
//   ProductSelection（romram 原文 + 最低价颜色 SKU）并逐项成卡（第一百二十轮：
//   同型号不同配置 = 两张卡，不再按型号合并；未选主品的空对不写入 URL）；对比区
//   沿用持久化里同配置卡的手动搭配；第一百一十七轮起参数名 own → main（旧链接仍可读），
//   且任意品牌都可做主分析（角色由用户指定，不再限华为）；
// - 参数不合法（型号不存在等）静默忽略，回退默认/持久化值。
// ============================================================
import { dimChannel, dimProduct } from '../data';
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

/** 桶 id 形状（周 YYYYWW / 月 YYYYMM / 季 YYYYQn）；字典序 = 时间序 */
const isBucketId = (s: string | null): s is string => !!s && /^\d{4}(\d{2}|Q[1-4])$/.test(s);

/** 渠道 id → 所属平台（维表反查为主，id 三段式「国家:平台:店铺类型」兜底） */
function platformOfShopId(shopId: string): string {
  return dimChannel.find((c) => c.channel_id === shopId)?.platform ?? shopId.split(':')[1] ?? '';
}

/** 平台/店铺单选归一：筛选器选到「某平台下的某个店铺」，state.platform 承载
 *  单渠道（店铺级）或单平台（旧兼容）两种形态。归一守卫沿用（多值取一；
 *  渠道是否属于当前国家由 applyScopeDefaults 的 platformSelectionValidFor 校验，
 *  越界渠道回落默认口径）：
 *  - shopIds 有值 = 店铺（渠道）级单选，取第一个且**绝不同时带 platforms**——
 *    数据层 effectiveChannelIds 为并集规则（platforms 命中即整平台渠道入池），
 *    店铺级选择残留 platforms 会放大成整平台口径；
 *  - 否则 platforms 取第一个 = 仅平台级（旧 plat= 链接 / 旧持久化兼容）；
 *  - 空选 / null = null（默认口径：配置的默认平台店铺 → 默认平台全部渠道）。 */
export function normalizePlatformSelection(platform: PlatformSelection | null): PlatformSelection | null {
  if (!platform) return null;
  if (platform.shopIds.length > 0) return { platforms: [], shopIds: [platform.shopIds[0]] };
  if (platform.platforms.length > 0) return { platforms: [platform.platforms[0]], shopIds: [] };
  return null;
}

/** 状态 → URL 参数（写侧）：店铺级选择写 `plat={平台}&shop={渠道id}`（平台由
 *  维表反查，反查不出按渠道 id 三段式兜底）；仅平台级（旧兼容）只写 plat=；
 *  未选两者皆空（调用方写 null 即删键，连带清掉旧链接残留）。 */
export function platformUrlParamsOf(platform: PlatformSelection | null): { plat: string | null; shop: string | null } {
  const shopId = platform?.shopIds[0];
  if (shopId) {
    const p = platformOfShopId(shopId);
    return { plat: p || null, shop: shopId };
  }
  return { plat: platform?.platforms[0] ?? null, shop: null };
}

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
    // 平台/店铺单选：plat = 平台、shop = 渠道 id（店铺级）；同存时 shop= 优先
    // （normalizePlatformSelection 先吃 shopIds）；旧多值链接取第一个归一。
    // 是否属于链接国家由 applyScopeDefaults 校验（越界回落默认口径）
    const platforms = listParam(q, 'plat');
    const shopIds = listParam(q, 'shop');
    if (platforms.length || shopIds.length) out.filters.platform = normalizePlatformSelection({ platforms, shopIds });
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
    // 第一百三十八轮：时间范围 / 价格显示 / 汇总口径进链接——价格操盘最核心的上下文
    // 就是「看哪段时间、折后价还是含 RRP、平均还是最小」。rs/re = 手动范围（形状合法
    // 且 rs ≤ re），读入即退出自适应（链接指定范围 = 固定范围语义）；自适应态不写这些键。
    const rs = q.get('rs');
    const re = q.get('re');
    if (isBucketId(rs) && isBucketId(re) && rs <= re) {
      out.filters.rangeStart = rs;
      out.filters.rangeEnd = re;
      out.filters.adaptive = false;
    }
    const pt = q.get('pt');
    if (pt === 'd' || pt === 'r' || pt === 'dr') {
      out.filters.priceTypes = { discounted: pt.includes('d'), rrp: pt.includes('r') };
    }
    const agg = q.get('agg');
    if (agg === 'avg' || agg === 'min') out.filters.agg = agg;
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
