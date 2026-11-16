// ============================================================
// 目标国合法平台口径归一（t428u Round5 R5-M1 唯一共享政策）：
// AE 页带 NOON 平台问「RU价格优势/趋势」时，计算侧曾把 NOON 原样喂给
// 渠道解析（RU 无 NOON → 空渠道集 → 0 行假空卡），而 FiltersContext 回看
// 落地却把非法平台清成 null（全平台口径）——同一个问题的两处口径不同，
// 「空卡跳转后变非空」就是这么来的。本模块是平台/店铺合法性的唯一判定源：
//  - Agent 优势/趋势/预警查询在取数前先经 lawfulPlatformScope 归一；
//  - 结果卡 open 动作的 filterPatch.platform 携带同一归一结果；
//  - FiltersContext.applyScopeDefaults 落地补丁时用同一函数校验——
//    补丁与落地状态不可能再分叉。
// 规则（与导航一致，绝不静默清掉合法选择）：
//  - 平台按目标国渠道表过滤，非法剔除、合法子集保留（含跨国企法平台如
//    DE/FR 共有的 Amazon）；
//  - shopIds 按渠道归属国过滤，同样保留合法子集；
//  - 全部非法才回落 null（= 未选平台的自动/全平台口径）；
//  - seller 仅在保留单渠道且确有该卖家时有效（与 applyScopeDefaults 旧口径
//    一致，静默剥离不产生说明）；
//  - 剔除过平台/店铺必须给出透明说明（note），供结果卡判断边界引用。
// R6-M1：normalizePlatformScope = lawfulPlatformScope 之上再叠加稳定版能力
// 归一（店铺级 → 平台级，与看板 platformLevelForChannel 同政策），供 Agent
// 计算/回看补丁/FiltersContext 落地在取数前统一走同一条路径——稳定版不再
// 出现「计算按平台级、补丁/落地却保留 shopIds」的口径分叉；迭代版（iterate）
// 原样返回 lawfulPlatformScope 结果，店铺级行为不变。
// 2026-11-14 Eason「平台还是能选到店铺」：R6-M1 的稳定版店铺展开退役——
// normalizePlatformScope 退役为 lawfulPlatformScope 透传，两通道店铺级同政策。
// ============================================================
import { dimChannel, dimRegion } from '../data';
import { sellersOfChannel } from './aggregate';
import type { PlatformQuery } from './types';
import type { PlatformScopeNotice } from '../state/filtersTypes';

export interface LawfulPlatformScope {
  /** 归一后的合法选择；null = 未选平台（自动/全平台口径） */
  platform: PlatformQuery | null;
  /** 目标国没有渠道、被剔除的平台名 */
  droppedPlatforms: string[];
  /** 不属于目标国、被剔除的渠道 id */
  droppedShopIds: string[];
  /** 归一结果与输入不同（含 seller 剥离）；合法输入恒 false */
  changed: boolean;
  /** 剔除过平台/店铺时的透明说明（seller 剥离不产生说明）；无剔除 = null */
  note: string | null;
}

const displayNameOfShop = (channelId: string): string =>
  dimChannel.find((channel) => channel.channel_id === channelId)?.display_name ?? channelId;

/** t428u R7-M1 · 平台口径的集合相等判定（与顺序无关）：platforms/shopIds 按
 *  集合比较（归一的并集去重不保证稳定排序），seller 一并参与。用于判断
 *  「归一说明描述的口径」是否仍是当前口径——成立才展示/引用说明。 */
export function platformQueryEquals(
  a: PlatformQuery | null | undefined,
  b: PlatformQuery | null | undefined,
): boolean {
  const norm = (p: PlatformQuery | null | undefined): { platforms: string[]; shopIds: string[]; seller: string | null; types: string[] } | null => {
    if (!p) return null;
    return {
      platforms: [...new Set(p.platforms)].sort(),
      shopIds: [...new Set(p.shopIds)].sort(),
      seller: p.seller ?? null,
      types: [...new Set(p.types ?? [])].sort(),
    };
  };
  const x = norm(a);
  const y = norm(b);
  if (x === null || y === null) return x === y;
  return x.platforms.length === y.platforms.length && x.platforms.every((v, i) => v === y.platforms[i])
    && x.shopIds.length === y.shopIds.length && x.shopIds.every((v, i) => v === y.shopIds[i])
    && x.seller === y.seller && x.types.length === y.types.length
    && x.types.every((v, i) => v === y.types[i]);
}

/** t428u R7-M1 · Provider 落地归一时的口径说明（provenance）取用：仅当
 *  「最终口径 = 说明描述的口径」且国家一致时返回说明原文，否则 null。
 *  稳定版 load/actions.set 已把店铺级原始输入归一为平台级——原始输入只在
 *  provenance 里保留，趋势/摘要/优势/平台比较/预警卡据此把展开事实写进判断
 *  边界；换国/换口径后说明自动失效，不携带旧口径噪音。 */
export function platformScopeProvenanceNote(
  notice: PlatformScopeNotice | null | undefined,
  countryCode: string,
  platform: PlatformQuery | null,
): string | null {
  if (!notice) return null;
  if (notice.countryCode !== countryCode) return null;
  return platformQueryEquals(notice.platform, platform) ? notice.note : null;
}

/**
 * 把平台/店铺选择归一到目标国合法口径。纯函数、幂等：合法选择原样返回
 * （对象引用不变，调用方可据此避免多余的状态拷贝）；非法部分剔除并说明，
 * 全部非法回落 null。国家无任何渠道（维表缺失）时非空选择一律回落 null。
 */
export function lawfulPlatformScope(countryCode: string, platform: PlatformQuery | null): LawfulPlatformScope {
  const channels = dimChannel.filter((channel) => channel.country_code === countryCode);
  const ccPlatforms = new Set(channels.map((channel) => channel.platform));
  const ccShopIds = new Set(channels.map((channel) => channel.channel_id));
  if (!platform || (platform.platforms.length === 0 && platform.shopIds.length === 0)) {
    // 空选择上残留的孤儿 seller（无渠道可挂）沿用旧口径静默剥掉
    const normalized = platform?.seller ? { platforms: [], shopIds: [], seller: null, types: platform.types } : platform;
    return { platform: normalized, droppedPlatforms: [], droppedShopIds: [], changed: normalized !== platform, note: null };
  }
  const droppedPlatforms = platform.platforms.filter((name) => !ccPlatforms.has(name));
  const droppedShopIds = platform.shopIds.filter((channelId) => !ccShopIds.has(channelId));
  const countryName = dimRegion.find((region) => region.country_code === countryCode)?.country_name ?? countryCode;
  if (droppedPlatforms.length === 0 && droppedShopIds.length === 0) {
    // 平台/店铺全部合法：只可能需要剥非法 seller（单渠道 + 该渠道确有此卖家）
    const seller = platform.seller != null
      && platform.shopIds.length === 1
      && sellersOfChannel(countryCode, platform.shopIds[0]).some((entry) => entry.seller === platform.seller)
      ? platform.seller
      : null;
    const changed = seller !== (platform.seller ?? null);
    return {
      platform: changed ? { platforms: platform.platforms, shopIds: platform.shopIds, seller, types: platform.types } : platform,
      droppedPlatforms: [],
      droppedShopIds: [],
      changed,
      note: null,
    };
  }
  const keptPlatforms = platform.platforms.filter((name) => ccPlatforms.has(name));
  const keptShopIds = platform.shopIds.filter((channelId) => ccShopIds.has(channelId));
  const droppedLabel = [...droppedPlatforms, ...droppedShopIds.map(displayNameOfShop)].join('、');
  if (keptPlatforms.length === 0 && keptShopIds.length === 0) {
    return {
      platform: null,
      droppedPlatforms,
      droppedShopIds,
      changed: true,
      note: `已选 ${droppedLabel} 在${countryName}没有渠道，已改按${countryName}未选平台的自动（全平台）口径计算。`,
    };
  }
  const seller = platform.seller != null
    && keptShopIds.length === 1
    && sellersOfChannel(countryCode, keptShopIds[0]).some((entry) => entry.seller === platform.seller)
    ? platform.seller
    : null;
  const keptLabel = [...keptPlatforms, ...keptShopIds.map(displayNameOfShop)].join('、');
  return {
    platform: { platforms: keptPlatforms, shopIds: keptShopIds, seller, types: platform.types },
    droppedPlatforms,
    droppedShopIds,
    changed: true,
    note: `已选 ${droppedLabel} 在${countryName}没有渠道，已剔除；本次按保留的 ${keptLabel} 口径计算。`,
  };
}

/**
 * R6-M1 · 目标国合法 + 稳定版能力的一体化平台归一（计算/补丁/落地共用）。
 * 2026-11-14 Eason 拍板「平台还是能选到店铺」：稳定版的店铺级透明展开退役，
 * 本函数 = lawfulPlatformScope 透传（两通道同语义）——合法店铺级选择原样保留
 * （钉该店铺取价），非法剔除/全非法回 null 的 R5 语义不变。旧「稳定版仅支持
 * 平台级」展开说明随政策一并退役；函数保留壳以稳住全部调用点签名。
 */
export function normalizePlatformScope(countryCode: string, platform: PlatformQuery | null): LawfulPlatformScope {
  return lawfulPlatformScope(countryCode, platform);
}
