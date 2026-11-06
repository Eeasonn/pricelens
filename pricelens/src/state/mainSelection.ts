// ============================================================
// 主分析卡纯函数（第一百二十轮，第三次迭代）：
// 卡 = 唯一主品（产品+型号+颜色）+ 对比区。配额在选择时收口（每卡 1 主品
// + ≤3 对比；空对同样 ≤3 对比，见 COMPARES_PER_CARD_CAP），卡数上限 8。含自动
// 匹配填充、v10/v11 持久化迁移、勾选组工具。UI 与 FiltersContext 共用；不持有状态。
// ============================================================
import { dimProduct } from '../data';
import type { DimProduct } from '../dataModel/types';
import type { MainProduct, ProductSelection } from './filtersTypes';
// 类型再导出（2026-11-05）：PriceTrendSearch 等调用方从本模块取 MainProduct，
// filtersTypes 仍是唯一定义源，此处仅透传
export type { MainProduct, ProductSelection };
import { groupsFromBenchmark } from './configStore';
import { getCurrentCountry } from './currentScope';
import { defaultColorSkuIds, modelIdOf, type RomramNode } from '../components/ProductCascader/tree';
import { lowestPriceColorSku } from '../dataModel/aggregate';

/** 一张图（合并图 = 唯一主品卡；分离模式 = 某张面板卡）同时展示的折线数上限。
 *  上限前移到选择时（modal 配额），呈现层不再截断。 */
export const MAX_LINES_PER_CHART = 8;

/** 每组（卡）对比产品硬上限（2026-11-02，Eason：每组最多选 3 款对比产品）。
 *  cardQuota 取它与折线上限的较小值，选择浮窗 / 模板合并 / 自动匹配 / 读档
 *  收口（clampMains）全部经 cardQuota 同口径截断；价格走势药丸带的块内可见
 *  预算（COMPARES_VISIBLE）与之同值。 */
export const COMPARES_PER_CARD_CAP = 3;

/** 对比产品达上限的统一提示（选择浮窗 / 模板编辑的禁用气泡与拦截提示同句） */
export const COMPARE_CAP_HINT = `每组最多 ${COMPARES_PER_CARD_CAP} 款对比产品`;

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

/** 卡内对比区配额 = min(每组对比硬上限 3, 8 - 主品占线)（有主品 / 空对均为 3；下限 0） */
export function cardQuota(card: Pick<MainProduct, 'main'>): number {
  return Math.max(0, Math.min(COMPARES_PER_CARD_CAP, MAX_LINES_PER_CHART - (card.main ? 1 : 0)));
}

/** 型号是否华为产品（数据事实；自动匹配矩阵只覆盖华为侧） */
export function isHuaweiModel(modelId: string): boolean {
  return dimProduct.some((p) => modelIdOf(p) === modelId && p.is_own);
}

/** 勾选组在该国该产业仍有效（切口径后判定重算默认）。
 *  R2（本轮返修 M1a，同步稳定线 7edadc6）：型号在该国之外，配置（romram）与
 *  SKU 也必须在目标国真实存在——只校验型号会把 RU 的 Mate X6 12+512GB 原样
 *  带进只有 16+512GB 的 ID，留下合法型号下的非法 SKU / 空看板。skuIds 为空 =
 *  整配置口径（buildSeries 会展开该配置全部颜色行），配置在该国有行即有效；
 *  非空则任一颜色 SKU 在目标国存在才算有效。 */
export function selectionValidFor(sel: ProductSelection, countryCode: string, industry: DimProduct['industry']): boolean {
  return dimProduct.some(
    (p) => p.model_id === sel.modelId
      && p.industry === industry
      && p.countries.includes(countryCode)
      && norm(p.romram) === norm(sel.romram)
      && (sel.skuIds.length === 0 || sel.skuIds.includes(p.sku_id)),
  );
}

/** 主分析卡列表整体是否仍属于该国该产业（任一主品失效即 false，与旧 own 判定同语义） */
export function mainsValidFor(mains: MainProduct[], countryCode: string, industry: DimProduct['industry']): boolean {
  const sels = mains.map((m) => m.main).filter((s): s is ProductSelection => s != null);
  if (!sels.length) return false;
  return sels.every((sel) => selectionValidFor(sel, countryCode, industry));
}

/** 型号在目标国的首个合法配置：配置名升序遍历，取该国「最新有价周最低折后价
 *  颜色」的 SKU（与 computeDataDefaults 默认卡同口径）。型号在该国无任何
 *  有价配置 = null。R2（M1a）：URL 链接携带的配置在目标国不存在（RU 12+512
 *  链接进 ID）时按此落到同型号该国首个合法配置（ID 16+512GB）。 */
export function firstLegalSelectionOfModel(modelId: string, countryCode: string): ProductSelection | null {
  const rows = dimProduct.filter((p) => modelIdOf(p) === modelId && p.countries.includes(countryCode));
  if (!rows.length) return null;
  const romrams = [...new Set(rows.map((p) => p.romram))].sort();
  for (const romram of romrams) {
    const skuId = lowestPriceColorSku(modelId, romram, countryCode);
    if (skuId) return { modelId, romram, skuIds: [skuId] };
  }
  return null;
}

/** 勾选组跨口径映射（R2 M1a，显式口径切换专用）：精确合法配置原样保留；
 *  配置/SKU 在目标国不存在但型号仍在 → 同型号该国首个合法配置（颜色尽量
 *  沿用同色名，缺失回落最低价色）；型号整体缺席 = null（调用方回落默认）。 */
export function remapSelectionForCountry(sel: ProductSelection, countryCode: string, industry: DimProduct['industry']): ProductSelection | null {
  if (selectionValidFor(sel, countryCode, industry)) return sel;
  const modelInCountry = dimProduct.some(
    (p) => p.model_id === sel.modelId && p.industry === industry && p.countries.includes(countryCode),
  );
  if (!modelInCountry) return null;
  // 精确配置优先：原配置在目标国有价则只换 SKU，配置名不漂移
  const keepRomram = lowestPriceColorSku(sel.modelId, sel.romram, countryCode) != null ? sel.romram : null;
  const romram = keepRomram ?? firstLegalSelectionOfModel(sel.modelId, countryCode)?.romram;
  if (romram == null) return null;
  const oldColors = new Set(
    dimProduct.filter((p) => sel.skuIds.includes(p.sku_id) && p.color && p.color !== '—')
      .map((p) => p.color.toLowerCase()),
  );
  const sameColor = dimProduct.find(
    (p) => modelIdOf(p) === sel.modelId && norm(p.romram) === norm(romram)
      && p.countries.includes(countryCode) && p.color && p.color !== '—' && oldColors.has(p.color.toLowerCase()),
  );
  const skuId = sameColor?.sku_id ?? lowestPriceColorSku(sel.modelId, romram, countryCode);
  return skuId ? { modelId: sel.modelId, romram, skuIds: [skuId] } : null;
}

/** 显式携带的主分析卡整组合法化（R2 M1a）：主品逐卡按 remapSelectionForCountry
 *  映射（同型号保留/换合法配置），型号整体缺席的卡剔除；手动对比区只保留目标国
 *  仍合法的条目（自动匹配卡对比区由调用方按目标国矩阵重算）；空对卡原样保留。
 *  返回 null = 没有任何卡能落在目标国（型号全缺席），调用方回落默认/快照。 */
export function remapMainsForScope(mains: MainProduct[], countryCode: string, industry: DimProduct['industry']): MainProduct[] | null {
  const out: MainProduct[] = [];
  for (const card of mains) {
    if (!card.main) {
      out.push({ ...card, compares: card.compares.filter((sel) => selectionValidFor(sel, countryCode, industry)) });
      continue;
    }
    const main = remapSelectionForCountry(card.main, countryCode, industry);
    if (!main) continue;
    out.push({ ...card, main, compares: card.compares.filter((sel) => selectionValidFor(sel, countryCode, industry)) });
  }
  return out.length ? clampMains(out) : null;
}

/** 主品卡的自动匹配对比区：对标矩阵（主竞品在前）→
 *  剔除与主品同型号同配置 → 按卡配额截断。 */
export function autoComparesFor(card: MainProduct, countryCode: string = getCurrentCountry()): ProductSelection[] {
  if (!card.main) return [];
  const ownKey = selKey(card.main);
  return groupsFromBenchmark([card.main], countryCode)
    .filter((c) => selKey(c) !== ownKey)
    .slice(0, cardQuota(card));
}

/** 「自动匹配竞品」开（第一百二十八轮：开关语义）：对比区立即按矩阵重算，
 *  此后换主品 / 矩阵更新自动跟随。仅华为主品卡可开（矩阵只覆盖华为侧）。 */
export function withAutoOn(card: MainProduct, countryCode: string = getCurrentCountry()): MainProduct {
  return card.main && isHuaweiModel(card.main.modelId) ? { ...card, compares: autoComparesFor(card, countryCode), auto: true } : card;
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
  opts: { firstCompares?: ProductSelection[]; auto?: boolean; countryCode?: string } = {},
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
      card.compares = autoComparesFor(card, opts.countryCode);
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
