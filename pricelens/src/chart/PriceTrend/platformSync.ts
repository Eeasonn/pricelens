// ============================================================
// 同步平台筛选（第一百七十三轮改开关语义，Eason）：触发 = 快照全部产品平台
// 并收敛到主产品；取消 = 按快照还原。纯函数，index 层持有开关态与快照。
// ============================================================
import type { MainProduct, PlatformSelection, ProductSelection } from '../../state/filtersTypes';
import { selKey } from '../../state/mainSelection';

/** 单卡快照：卡 id + 当时每个选择项（主品+对比）的平台（selKey 定位） */
export interface PlatformSyncCardSnap {
  cardId: string;
  entries: { key: string; platform: PlatformSelection | null }[];
}

/** 触发同步前收快照：按卡收录主品与对比区的平台现状 */
export function snapshotPlatformSync(mains: MainProduct[]): PlatformSyncCardSnap[] {
  return mains.map((card) => ({
    cardId: card.id,
    entries: [
      ...(card.main ? [{ key: selKey(card.main), platform: card.main.platform ?? null }] : []),
      ...card.compares.map((s) => ({ key: selKey(s), platform: s.platform ?? null })),
    ],
  }));
}

/** 触发同步：全部产品（各卡主品 + 对比区）的取价平台 = 源平台
 *  （首张含主品卡的主品平台，未自选 = null 自动口径） */
export function applySyncedPlatforms(mains: MainProduct[], src: PlatformSelection | null): MainProduct[] {
  return mains.map((card) => ({
    ...card,
    main: card.main ? { ...card.main, platform: src } : card.main,
    compares: card.compares.map((s) => ({ ...s, platform: src })),
  }));
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
