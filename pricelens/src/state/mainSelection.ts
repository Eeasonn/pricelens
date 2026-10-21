// ============================================================
// 主分析卡纯函数（第一百二十轮，第三次迭代）：
// 卡 = 唯一主品（产品+型号+颜色）+ 对比区。配额在选择时收口（每卡 1 主品
// + ≤7 对比 = 8 条线；空对 ≤8），卡数上限 8。含自动匹配填充、v10/v11
// 持久化迁移、勾选组工具。UI 与 FiltersContext 共用；不持有状态。
// ============================================================
import { dimProduct } from '../data';
import type { DimProduct } from '../dataModel/types';
import type { MainProduct, ProductSelection } from './filtersTypes';
import { groupsFromBenchmark } from './configStore';
import { defaultColorSkuIds, modelIdOf, type RomramNode } from '../components/ProductCascader/tree';

/** 一张图（合并图 = 唯一主品卡；分离模式 = 某张面板卡）同时展示的折线数上限。
 *  上限前移到选择时（modal 配额），呈现层不再截断。 */
export const MAX_LINES_PER_CHART = 8;

/** 主分析卡数上限（= 分离面板数上限；批量动作按剩余名额截断） */
export const MAINS_CAP = 8;

/** 多组合并成一张图的折线总量上限（第一百二十三轮宽容合并）：全部组的系列去重
 *  总数（主品 + 对比并集）超过即不可合并、回落分图。取值与图表名称避让预算的
 *  系列数上限同口径（chart/PriceTrend/helpers.SERIES_PX_CAP = 16）。 */
export const MERGE_LINES_CAP = 16;

let cardSeq = 0;

/** 卡稳定键：跨持久化保留；同毫秒批量建卡靠自增尾号去重 */
export function newCardId(): string {
  cardSeq += 1;
  return `card-${Date.now().toString(36)}-${cardSeq.toString(36)}`;
}

const norm = (s: string): string => s.replace(/\s+/g, '');

/** 勾选组键（型号|配置去空格）——卡片、对比区、图例系列 key 的公共成分 */
export function selKey(sel: ProductSelection): string {
  return `${sel.modelId}|${norm(sel.romram)}`;
}

/** 卡内对比区配额 = 8 - 主品占线（空对 8；下限 0） */
export function cardQuota(card: Pick<MainProduct, 'main'>): number {
  return Math.max(0, MAX_LINES_PER_CHART - (card.main ? 1 : 0));
}

/** 型号是否华为产品（数据事实；自动匹配矩阵只覆盖华为侧） */
export function isHuaweiModel(modelId: string): boolean {
  return dimProduct.some((p) => modelIdOf(p) === modelId && p.is_own);
}

/** 勾选组在该国该产业仍有效（切口径后判定重算默认） */
export function selectionValidFor(sel: ProductSelection, countryCode: string, industry: DimProduct['industry']): boolean {
  return dimProduct.some(
    (p) => p.model_id === sel.modelId && p.industry === industry && p.countries.includes(countryCode),
  );
}

/** 主分析卡列表整体是否仍属于该国该产业（任一主品失效即 false，与旧 own 判定同语义） */
export function mainsValidFor(mains: MainProduct[], countryCode: string, industry: DimProduct['industry']): boolean {
  const sels = mains.map((m) => m.main).filter((s): s is ProductSelection => s != null);
  if (!sels.length) return false;
  return sels.every((sel) => selectionValidFor(sel, countryCode, industry));
}

/** 主品卡的自动匹配对比区：对标矩阵（主竞品在前）→
 *  剔除与主品同型号同配置 → 按卡配额截断。 */
export function autoComparesFor(card: MainProduct): ProductSelection[] {
  if (!card.main) return [];
  const ownKey = selKey(card.main);
  return groupsFromBenchmark([card.main])
    .filter((c) => selKey(c) !== ownKey)
    .slice(0, cardQuota(card));
}

/** 自动跟随重算：华为主品卡（矩阵覆盖侧）对比区 = 矩阵产出（矩阵为空即清空）；
 *  非华为主品卡与空对无矩阵可依，手动挑选的对比区不被动清空。 */
export function reapplyAuto(mains: MainProduct[]): MainProduct[] {
  return mains.map((card) =>
    card.main && isHuaweiModel(card.main.modelId) ? { ...card, compares: autoComparesFor(card) } : card,
  );
}

/** 勾选组逐组成卡（保序；同型号同配置去重）——URL 解析 / 纯竞品视角迁移用 */
export function cardsFromSelections(list: ProductSelection[]): MainProduct[] {
  const out: MainProduct[] = [];
  const seen = new Set<string>();
  for (const sel of list) {
    const key = selKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: newCardId(), main: sel, compares: [] });
  }
  return out;
}

/** v11 → v12 持久化迁移：旧卡 configs[] 展开为逐配置卡——
 *  首配置卡继承原对比区；其余配置卡自动模式按矩阵补、手动模式落空。 */
export function expandV11Cards(
  cards: { modelId: string; configs: ProductSelection[]; compares: ProductSelection[] }[],
  autoMatch: boolean,
): MainProduct[] {
  const out: MainProduct[] = [];
  const seen = new Set<string>();
  for (const old of cards) {
    old.configs.forEach((sel, i) => {
      const key = selKey(sel);
      if (seen.has(key) || out.length >= MAINS_CAP) return;
      seen.add(key);
      const empty: MainProduct = { id: newCardId(), main: sel, compares: [] };
      out.push({
        ...empty,
        compares: i === 0 ? old.compares.slice(0, cardQuota(empty)) : autoMatch ? autoComparesFor(empty) : [],
      });
    });
  }
  return out;
}

/** v10 → v12 持久化迁移：旧 own + competitors（全局一份）→ 每配置一张卡。
 *  - autoMatch 开：逐卡按矩阵重算（自愈口径延续）；
 *  - autoMatch 关：把旧全局竞品按旧看板面板口径分配——矩阵映射命中优先、
 *    同容量 fallback 补位、截到卡配额；
 *  - 旧「纯竞品视角」（own 空）：竞品逐组成卡（无对比区），保底 MAINS_CAP 卡。 */
export function migrateV10(own: ProductSelection[], competitors: ProductSelection[], autoMatch: boolean): MainProduct[] {
  if (!own.length) return clampMains(cardsFromSelections(competitors));
  const cards = clampMains(cardsFromSelections(own));
  if (autoMatch) return cards.map((card) => ({ ...card, compares: autoComparesFor(card) }));
  const globalKeys = new Set(competitors.map(selKey));
  return cards.map((card) => {
    const ownKey = card.main ? selKey(card.main) : '';
    const mapped = groupsFromBenchmark(card.main ? [card.main] : []).filter(
      (c) => globalKeys.has(selKey(c)) && selKey(c) !== ownKey,
    );
    const mappedKeys = new Set(mapped.map(selKey));
    const fallback = competitors.filter(
      (c) => !mappedKeys.has(selKey(c)) && selKey(c) !== ownKey
        && card.main != null && norm(c.romram) === norm(card.main.romram),
    );
    return { ...card, compares: [...mapped, ...fallback].slice(0, cardQuota(card)) };
  });
}

/** 合并图取数组：全部主品（按卡序）+ 全部对比区并集（按卡序去重；主品已有者不重复） */
export function flatSelections(mains: MainProduct[]): { mainSels: ProductSelection[]; compareSels: ProductSelection[] } {
  const mainSels: ProductSelection[] = [];
  const compareSels: ProductSelection[] = [];
  const seen = new Set<string>();
  for (const card of mains) {
    if (card.main && !seen.has(selKey(card.main))) {
      seen.add(selKey(card.main));
      mainSels.push(card.main);
    }
  }
  for (const card of mains) {
    for (const sel of card.compares) {
      if (!seen.has(selKey(sel))) {
        seen.add(selKey(sel));
        compareSels.push(sel);
      }
    }
  }
  return { mainSels, compareSels };
}

/** 收敛到上限内（迁移/读档兜底）：卡数 ≤ MAINS_CAP，对比区按卡配额截断 */
export function clampMains(mains: MainProduct[]): MainProduct[] {
  return mains.slice(0, MAINS_CAP).map((card) => ({ ...card, compares: card.compares.slice(0, cardQuota(card)) }));
}

/** 换配置/换产品落地：颜色尽量映射同色 SKU，缺失回默认最低价色。
 *  oldNode = 旧勾选组所在配置节点（查同色名用）；newNode = 目标配置节点。 */
export function remapSelection(oldSel: ProductSelection, oldNode: RomramNode | undefined, newNode: RomramNode): ProductSelection {
  const oldColors = new Set(
    (oldNode?.colors ?? []).filter((c) => oldSel.skuIds.includes(c.skuId)).map((c) => c.color.toLowerCase()),
  );
  const sameColor = newNode.colors.find((c) => oldColors.has(c.color.toLowerCase()));
  return {
    modelId: newNode.modelId,
    romram: newNode.romram,
    skuIds: sameColor ? [sameColor.skuId] : defaultColorSkuIds(newNode),
  };
}
