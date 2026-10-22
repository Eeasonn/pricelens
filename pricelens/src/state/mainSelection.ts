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

/** 空对（main=null）在入口 chip / 浮窗卡标 / 宽表组头的统一叫法；面板头作为图标题另用「对比产品」 */
export const EMPTY_MAIN_LABEL = '未选主分析产品';

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

/** 「自动匹配竞品」开（第一百二十八轮：开关语义）：对比区立即按矩阵重算，
 *  此后换主品 / 矩阵更新自动跟随。仅华为主品卡可开（矩阵只覆盖华为侧）。 */
export function withAutoOn(card: MainProduct): MainProduct {
  return card.main && isHuaweiModel(card.main.modelId) ? { ...card, compares: autoComparesFor(card), auto: true } : card;
}

/** 「自动匹配竞品」关：退出矩阵驱动，当前对比区保留转手动。 */
export function withAutoOff(card: MainProduct): MainProduct {
  return card.auto ? { ...card, auto: false } : card;
}

/** 单卡开关切换：开 = 重算 + 置开；关 = 保留对比区转手动。 */
export function toggleCardAuto(card: MainProduct): MainProduct {
  return card.auto ? withAutoOff(card) : withAutoOn(card);
}

/** 全局「全部自动匹配」开关：全部华为主品卡都在开 → 全部关；否则全部开。
 *  非华为主品卡与空对无矩阵可依，不参与也不被动清空。 */
export function toggleAllAuto(mains: MainProduct[]): MainProduct[] {
  const huawei = mains.filter((c) => c.main != null && isHuaweiModel(c.main.modelId));
  if (!huawei.length) return mains;
  const allOn = huawei.every((c) => !!c.auto);
  return mains.map((c) => (c.main != null && isHuaweiModel(c.main.modelId) ? (allOn ? withAutoOff(c) : withAutoOn(c)) : c));
}

/** 卡片落主品（空对补选 / 换主品共用）：主品占线后对比区按新配额截断，
 *  并剔除与新主品同型号同配置的对比项（主品与对比不重复占线）；
 *  自动匹配开 = 对比区按新主品重算（新主品非华为时矩阵不可依，退回手动）。
 *  第一百三十一轮（匹配竞品默认开）：落主品后对比区仍为空（新卡/空对/
 *  换主品后无手动搭配）且新主品为华为 = 自动开启（对比区 = 矩阵产出），
 *  用户无需手动点开关；已有手动对比内容的卡不翻案，保持手动。 */
export function withMain(card: MainProduct, sel: ProductSelection): MainProduct {
  const key = selKey(sel);
  const next: MainProduct = {
    ...card,
    main: sel,
    compares: card.compares.filter((c) => selKey(c) !== key).slice(0, cardQuota({ main: sel })),
  };
  if (card.auto) {
    return isHuaweiModel(sel.modelId) ? { ...next, compares: autoComparesFor(next) } : { ...next, auto: false };
  }
  return !next.compares.length && isHuaweiModel(sel.modelId) ? withAutoOn(next) : next;
}

/** 跨页建卡正源（总览走势跳转 / 对比浮层进看板 / 预警看板下钻共用）：
 *  按 selKey 去重、封顶 MAINS_CAP；首卡继承 firstCompares（剔除与主品同组、
 *  截卡配额），其余卡对比区落空。auto = true 建卡即开「自动匹配竞品」
 *  （对比区 = 矩阵产出，仅华为主品生效）。 */
export function buildCards(
  sels: ProductSelection[],
  opts: { firstCompares?: ProductSelection[]; auto?: boolean } = {},
): MainProduct[] {
  const out: MainProduct[] = [];
  const seen = new Set<string>();
  for (const sel of sels) {
    if (out.length >= MAINS_CAP) break;
    const key = selKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);
    const card: MainProduct = { id: newCardId(), main: sel, compares: [] };
    if (opts.auto && isHuaweiModel(sel.modelId)) {
      card.auto = true;
      card.compares = autoComparesFor(card);
    } else if (out.length === 0 && opts.firstCompares?.length) {
      card.compares = opts.firstCompares.filter((c) => selKey(c) !== key).slice(0, cardQuota(card));
    }
    out.push(card);
  }
  return out;
}

/** 勾选组逐组成卡（保序；同型号同配置去重）——URL 解析 / 纯竞品视角迁移用；
 *  buildCards 的薄封装（封顶已并入，调用方随后的 clampMains 幂等）。 */
export function cardsFromSelections(list: ProductSelection[]): MainProduct[] {
  return buildCards(list);
}

/** v11 → v12 持久化迁移：旧卡 configs[] 展开为逐配置卡——
 *  首配置卡继承原对比区（剔除与主品同组项、截配额，与 withMain/buildCards 同口径）；
 *  其余配置卡落空（对比区由用户点「自动匹配竞品/全部自动匹配」按需取回）。 */
export function expandV11Cards(
  cards: { modelId: string; configs: ProductSelection[]; compares: ProductSelection[] }[],
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
        compares: i === 0 ? old.compares.filter((c) => selKey(c) !== key).slice(0, cardQuota(empty)) : [],
      });
    });
  }
  return out;
}

/** v10 → v12 持久化迁移：旧 own + competitors（全局一份）→ 每配置一张卡，
 *  对比区按矩阵重算（旧全局竞品只是当时的矩阵产出，维表换代后以现行矩阵为准）；
 *  旧「纯竞品视角」（own 空）：竞品逐组成卡（无对比区），保底 MAINS_CAP 卡。 */
export function migrateV10(own: ProductSelection[], competitors: ProductSelection[]): MainProduct[] {
  if (!own.length) return clampMains(cardsFromSelections(competitors));
  const cards = clampMains(cardsFromSelections(own));
  return cards.map((card) => ({ ...card, compares: autoComparesFor(card) }));
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
