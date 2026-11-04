// ============================================================
// 店铺同步（本轮语义重定，Eason 定口径）：同步只让本组对比品的取价店铺与本组
// 主品保持一致，主品自身永不改写。触发 = 快照全组（含主品）平台现状 → 主品口径
// 写给全部对比品；取消 = 按快照整组还原（含主品）。纯函数，页面层持有开关态与
// 快照。（旧 applySyncedPlatforms 连主品一起写、主品自动时整组清空成自动——
// 已删除，由 syncComparesWithMain 取代。）
// ============================================================
import type { MainProduct, PlatformSelection, ProductSelection } from '../../state/filtersTypes';
import { selKey } from '../../state/mainSelection';

/** 单卡快照：卡 id + 当时每个选择项（主品+对比）的平台（selKey 定位） */
export interface PlatformSyncCardSnap {
  cardId: string;
  entries: { key: string; platform: PlatformSelection | null }[];
}

/** 触发同步前收快照：按卡收录主品与对比区的平台现状（取消时整组还原用） */
export function snapshotPlatformSync(mains: MainProduct[]): PlatformSyncCardSnap[] {
  return mains.map((card) => ({
    cardId: card.id,
    entries: [
      ...(card.main ? [{ key: selKey(card.main), platform: card.main.platform ?? null }] : []),
      ...card.compares.map((s) => ({ key: selKey(s), platform: s.platform ?? null })),
    ],
  }));
}

/** 主品自动口径的钉定解析（第一百七十四轮，Eason：「同步了之后三星还是 Mvideo」）：
 *  自动 = 每周动态解平台，直接把 null 同步给对比品时各产品仍会各自解到不同平台
 *  （三星最低价在 Mvideo 就显示 Mvideo），显示上「没同步」。故主品未自选时取其
 *  最新有价周的实际取价平台（= 平台小药丸显示的名字，badge 回填）钉成平台级
 *  显式选择，全组的显示与取价才真正一致；主品已显式选择 = 原样透传；
 *  解析不出（主品无数据，label 仍为占位「自动」）= null（不可同步） */
export function pinnedSelectionFromBadge(
  badge: { label: string; auto: boolean } | null | undefined,
  explicit: PlatformSelection | null,
): PlatformSelection | null {
  if (explicit != null) return explicit;
  if (badge?.auto && badge.label && badge.label !== '自动') return { platforms: [badge.label], shopIds: [] };
  return null;
}

/** 触发同步：本组对比品的取价店铺 = 主品当前口径，主品自身永不改写。
 *  主品显式选择 = 原样写给全部对比品；主品自动 = 按其最新有价周的实际取价平台
 *  （badge 回填，pinnedSelectionFromBadge）钉成平台级显式选择后写给全部对比品；
 *  解析不出（主品未选 / 无价格数据，badge 仍是占位「自动」）= 返回 null：
 *  不写任何人，调用方不得开启同步态。返回卡为浅拷贝，main 引用原样保留。 */
export function syncComparesWithMain(
  card: MainProduct,
  badge?: { label: string; auto: boolean } | null,
): MainProduct | null {
  const src = pinnedSelectionFromBadge(badge ?? null, card.main?.platform ?? null);
  if (!card.main || src == null) return null;
  return { ...card, compares: card.compares.map((s) => ({ ...s, platform: src })) };
}

/** 取消同步：按卡 id + selKey 匹配还原触发前平台；匹配不上的选择项
 *  （同步期间换品/自动匹配新增的对比）保持现状不动 */
export function restorePlatformSync(mains: MainProduct[], snap: PlatformSyncCardSnap[]): MainProduct[] {
  const byCard = new Map(snap.map((s) => [s.cardId, new Map(s.entries.map((e) => [e.key, e.platform]))]));
  return mains.map((card) => {
    const entries = byCard.get(card.id);
    if (!entries) return card;
    const back = (sel: ProductSelection): ProductSelection =>
      entries.has(selKey(sel)) ? { ...sel, platform: entries.get(selKey(sel)) ?? null } : sel;
    return { ...card, main: card.main ? back(card.main) : card.main, compares: card.compares.map(back) };
  });
}
