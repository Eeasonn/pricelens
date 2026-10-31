// 平台 / 渠道 / 卖家跨平台搜索。修改店铺与添加店铺共用，结果带平台、渠道和覆盖周数。
import { dimChannel } from '../data';
import { sellersOfChannel } from '../dataModel/aggregate';

export interface ShopSearchHit {
  key: string;
  channelId: string;
  platform: string;
  channelName: string;
  /** null = 渠道口径（渠道内每周最低价），否则为具体卖家 */
  seller: string | null;
  label: string;
  note: string;
}

export const SHOP_SEARCH_CAP = 50;

/** 跨当前国家全部平台匹配渠道显示名、平台名和卖家名。hits 最多 cap 条，total 为全部命中数。 */
export function searchShopCatalog(cc: string, query: string, cap = SHOP_SEARCH_CAP): { hits: ShopSearchHit[]; total: number } {
  const q = query.trim().toLowerCase();
  if (!q) return { hits: [], total: 0 };
  const hits: ShopSearchHit[] = [];
  let total = 0;
  for (const c of dimChannel) {
    if (c.country_code !== cc) continue;
    if (c.display_name.toLowerCase().includes(q) || c.platform.toLowerCase().includes(q)) {
      total += 1;
      if (hits.length < cap) {
        hits.push({
          key: `ch:${c.channel_id}`,
          channelId: c.channel_id,
          platform: c.platform,
          channelName: c.display_name,
          seller: null,
          label: c.display_name,
          note: `· ${c.platform} · ${c.shops} 店铺`,
        });
      }
    }
    for (const s of sellersOfChannel(cc, c.channel_id)) {
      if (!s.seller.toLowerCase().includes(q)) continue;
      total += 1;
      if (hits.length < cap) {
        hits.push({
          key: `sl:${c.channel_id}:${s.seller}`,
          channelId: c.channel_id,
          platform: c.platform,
          channelName: c.display_name,
          seller: s.seller,
          label: s.seller,
          note: `· ${c.display_name} · ${c.platform} · ${s.weeks} 周`,
        });
      }
    }
  }
  return { hits, total };
}
