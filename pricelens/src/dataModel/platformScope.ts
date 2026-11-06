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
// ============================================================
import { dimChannel, dimRegion } from '../data';
import { sellersOfChannel } from './aggregate';
import type { PlatformQuery } from './types';

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
    const normalized = platform?.seller ? { platforms: [], shopIds: [], seller: null } : platform;
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
      platform: changed ? { platforms: platform.platforms, shopIds: platform.shopIds, seller } : platform,
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
    platform: { platforms: keptPlatforms, shopIds: keptShopIds, seller },
    droppedPlatforms,
    droppedShopIds,
    changed: true,
    note: `已选 ${droppedLabel} 在${countryName}没有渠道，已剔除；本次按保留的 ${keptLabel} 口径计算。`,
  };
}
