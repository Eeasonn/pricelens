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
import type { StoreType } from '../dataModel/types';
import type { Page } from './PageContext';
import { lowestPriceColorSku } from '../dataModel/aggregate';
import { cardsFromSelections, firstLegalSelectionOfModel, tidyMains } from './mainSelection';
import { getCurrentCountry } from './currentScope';

const norm = (s: string): string => s.replace(/\s+/g, '');

// ?p= 页参数白名单（与 PageContext 的页清单一致）。2026-11-27 演进版退场：
// 大盘走势 / 量价预测 / 情报中心三页下线——老分享链接直达三页时静默忽略
// （不解析 page，回退默认页）；运行期页 id 的统一落回在 PageContext（resolvePage），
// 此处保证 readUrlOverrides 的 page 解析与之一致。
const PAGES: readonly Page[] = ['overview', 'dashboard', 'volume', 'pricing', 'config', 'alerts'];

/** 逗号列表参数 → 去空白、去空项 */
const listParam = (q: URLSearchParams, name: string): string[] =>
  (q.get(name) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** 桶 id 形状（周 YYYYWW / 月 YYYYMM / 季 YYYYQn）；字典序 = 时间序 */
const isBucketId = (s: string | null): s is string => !!s && /^\d{4}(\d{2}|Q[1-4])$/.test(s);

/** 渠道 id → 所属平台（维表反查为主，id 三段式「国家:平台:店铺类型」兜底） */
function platformOfShopId(shopId: string): string {
  return dimChannel.find((c) => c.channel_id === shopId)?.platform ?? shopId.split(':')[1] ?? '';
}

/** 平台/店铺选择归一：筛选器选到「某平台下的某个店铺」，state.platform 承载
 *  单渠道（店铺级）、单平台（旧兼容）或混合并集（显式平台 + 店铺，2026-11-14
 *  店铺级恢复后合法——数据层 effectiveChannelIds = 平台渠道 ∪ 店铺）。
 *  归一守卫：渠道是否属于当前国家由 applyScopeDefaults 的
 *  platformSelectionValidFor 校验，越界渠道回落默认口径。
 *  - shopIds 有值 = 店铺（渠道）级。platforms 集合恰为店铺所属平台（旧链接
 *    「plat= 店铺归属平台 + shop=」）→ 按纯店铺级归一（platforms 清空，不放大
 *    成整平台口径）；platforms 里有店铺所属平台之外的显式平台 → 混合并集原样
 *    保留（多店铺照留，并集语义由 effectiveChannelIds 承担）；seller 仅单渠道
 *    时有意义（空串按未选处理，第一百四十一轮）；
 *  - 无 shopIds = 仅平台级多值取一（旧 plat= 链接 / 旧持久化兼容；R7-M1 的
 *    「多平台全量读入」在 readUrlOverrides 读侧先行保真，不经本函数塌缩）；
 *  - 空选 / null = null（默认口径：配置的默认平台店铺 → 默认平台全部渠道，
 *    取价 = 平台内每周折扣率最大的店铺）。 */
export function normalizePlatformSelection(platform: PlatformSelection | null): PlatformSelection | null {
  if (!platform) return null;
  if (platform.shopIds.length > 0) {
    // 卖家细化仅在单渠道时有意义；空串按未选处理（第一百四十一轮）。
    // types 只过滤平台级命中，店铺级归一时清掉（2026-11-17）
    const seller = platform.shopIds.length === 1 && platform.seller ? platform.seller : null;
    if (platform.platforms.length > 0) {
      const shopPlatform = platformOfShopId(platform.shopIds[0]);
      const extra = platform.platforms.filter((p) => p !== shopPlatform);
      if (extra.length > 0)
        return {
          platforms: extra,
          shopIds: [...platform.shopIds],
          seller,
          ...(platform.types?.length ? { types: platform.types } : {}),
        };
    }
    return { platforms: [], shopIds: [platform.shopIds[0]], seller };
  }
  if (platform.platforms.length > 0)
    return {
      platforms: [platform.platforms[0]],
      shopIds: [],
      ...(platform.types?.length ? { types: platform.types } : {}),
    };
  return null;
}

/** 状态 → URL 参数（写侧）：店铺级选择写 `shop={渠道id}` + `plat=`（混合口径 =
 *  显式平台集与店铺所属平台全量逗号序列化；纯店铺级 = 店铺归属平台，由维表
 *  反查，反查不出按渠道 id 三段式兜底）；平台级写 plat=（R7-M1：多平台
 *  并集按逗号全量序列化——读侧 listParam 对称拆分，parse/serialize/reload
 *  往返不丢；单平台输出与旧写侧逐字节相同）；未选两者皆空（调用方写 null 即
 *  删键，连带清掉旧链接残留）。 */
export function platformUrlParamsOf(
  platform: PlatformSelection | null,
): { plat: string | null; shop: string | null; seller: string | null; ctype: string | null } {
  const shopId = platform?.shopIds[0];
  // ctype = 平台勾选的类型子集（2026-11-17「平台、类型、店铺」筛选器）；店铺级直通不写
  const ctype = shopId ? null : platform?.types?.length ? platform.types.join(',') : null;
  if (shopId) {
    const shopPlatform = platformOfShopId(shopId);
    const mixed = [...new Set([...(platform?.platforms ?? []), shopPlatform])].filter(Boolean);
    return { plat: mixed.join(',') || null, shop: shopId, seller: shopId && platform?.seller ? platform.seller : null, ctype };
  }
  const platforms = platform?.platforms ?? [];
  return { plat: platforms.length ? platforms.join(',') : null, shop: null, seller: null, ctype };
}

/**
 * 退役透传（2026-11-14 Eason「平台还是能选到店铺」）：稳定版店铺级降级闸退役
 * ——店铺级（shopIds 单渠道）选择原样保留（数据层
 * effectiveChannelIds 店铺级 = 严格单渠道取价；平台级/自动 = 平台内每周最低价
 * 店铺 = 每周折扣率最大店铺口径，不变）。函数保留壳以稳住看板/持久化/URL 写侧/
 * Agent 四处调用点签名，不再改写任何输入。
 */
export function platformLevelForChannel(platform: PlatformSelection | null): PlatformSelection | null {
  return platform;
}

/** 系列反查：seriesKey → ProductSelection（romram 原文 + 最低价颜色 SKU）；不存在 = null。
 *  第一百一十七轮：主分析可任意品牌（旧 ownOnly 白名单随之退役）。
 *  countryCode = 取代表色 SKU 的国家口径（链接自带 c= 时须显式传入：解析发生在
 *  数据层缺省国家切换之前，按持久化国家取色会在该国无价时把主品整个丢掉）。
 *  R2（本轮返修 M1a，同步稳定线 7edadc6）：精确配置在目标国不存在（RU 的
 *  12+512GB 链接进只有 16+512GB 的 ID）时不再整条丢弃，映射到同型号该国首个
 *  合法配置/SKU；型号整体不在目标国 = null（调用方回落默认）。 */
export function productSelectionOfSeriesKey(key: string, countryCode: string = getCurrentCountry()): ProductSelection | null {
  const sep = key.indexOf('__');
  if (sep < 0) return null;
  const modelId = key.slice(0, sep);
  const rom = key.slice(sep + 2);
  const row = dimProduct.find((p) => p.sku_id.startsWith(modelId + '__') && norm(p.romram) === rom);
  const skuId = row ? lowestPriceColorSku(modelId, row.romram, countryCode) : null;
  if (row && skuId) return { modelId, romram: row.romram, skuIds: [skuId] };
  return firstLegalSelectionOfModel(modelId, countryCode);
}

// 兼容旧名（预警跳转等按系列 key 解析任意产品）
export const productSelectionOfAnySeriesKey = productSelectionOfSeriesKey;

/** 启动时读取 URL 覆写（在持久化/默认视图之后应用） */
export function readUrlOverrides(): { page?: Page; filters: Partial<FiltersState> } {
  const out: { page?: Page; filters: Partial<FiltersState> } = { filters: {} };
  try {
    const q = new URLSearchParams(window.location.search);
    const p = q.get('p');
    if (p && (PAGES as readonly string[]).includes(p)) out.page = p as Page;
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
    // 是否属于链接国家由 applyScopeDefaults 校验（越界回落默认口径）。
    // 2026-11-14（Eason「平台还是能选到店铺」）：稳定版恢复读 shop=/seller=
    //（2026-11-05 复检整改3 的「stable 静默忽略店铺级」随店铺级恢复一并退役），
    // 统一经 normalizePlatformSelection 归一路径；是否钉到具体店铺由
    // ChannelScopeBox 的店铺行表达（2026-11-17 三级级联替换 PlatformSelectBox），
    // 自动口径 = 默认平台池内每周最低价店铺。
    const platforms = listParam(q, 'plat');
    const shopIds = listParam(q, 'shop');
    // ctype = 平台勾选的类型子集（2026-11-17「平台、类型、店铺」筛选器）；
    // 旧链接无此键 = 全部类型（缺省），与既有链接逐字节兼容
    const ctypes = listParam(q, 'ctype').filter((t): t is StoreType => t === '1P' || t === '3P' || t === '独立站');
    if (platforms.length || shopIds.length) {
      // 卖家细化仅店铺级链接可带（shop= 单渠道）；无 shop 时静默忽略
      const seller = shopIds.length === 1 ? q.get('seller') || null : null;
      if (shopIds.length) {
        // 店铺级（含混合并集）：normalizePlatformSelection 归一——旧链接
        // 「plat= 店铺归属平台」不放大成整平台，显式异平台混合原样保留
        out.filters.platform = normalizePlatformSelection({ platforms, shopIds, seller, types: ctypes });
      } else {
        // R7-M1：平台级列表原样读入（合法剔除交给 applyScopeDefaults），不取第一个；
        // 无 seller（平台级不吃 seller 键，与旧归一产出的形一致，锁测逐键可比）
        out.filters.platform = { platforms, shopIds: [], types: ctypes.length ? ctypes : undefined };
      }
    }
    // 第一百一十七轮：main = 主分析配置 key 列表；旧链接的 own 参数同语义读入
    const mainParam = q.get('main') ?? q.get('own');
    if (mainParam) {
      const country = c || getCurrentCountry();
      const list = mainParam
        .split(',')
        .map((k) => productSelectionOfSeriesKey(k.trim(), country))
        .filter((x): x is ProductSelection => x != null);
      // 2026-11-27 起链接里的主分析结构不设卡数上限：只做结构整理（去重、剔与主品同组项）
      if (list.length > 0) out.filters.mains = tidyMains(cardsFromSelections(list));
    }
    // 第一百三十八轮：时间范围 / 价格显示 / 汇总口径进链接——价格操盘最核心的上下文
    // 就是「看哪段时间、折后价还是含 RRP、平均还是最小」。rs/re = 手动范围（形状合法
    // 且 rs ≤ re），读入即固定范围（2026-11-13 时间筛选单值化后「退出自适应提示条」
    // 随自动时间按钮一并退役，语义 = 链接指定范围直接生效）。
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
    // 2026-11-27 二轮「视图：对标 / 分列」：view=columns = 分列视图（缺省/其他值 =
    // 对标，不写键）；by = 分列依据（缺省 = 品牌，不写键）
    const view = q.get('view');
    if (view === 'columns' || view === 'lineage') {
      out.filters.viewMode = view;
      const by = q.get('by');
      out.filters.columns = {
        groupBy: by === 'series' || by === 'tier' ? by : 'brand',
        sharedY: true,
        baselineKey: null,
      };
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
