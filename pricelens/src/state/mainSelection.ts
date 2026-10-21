// ============================================================
// 主分析卡纯函数（第一百一十七轮，统一产品选择器）：
// 配额（一张图 ≤8 条产品线，选择时收口）、自动匹配填充、v10 持久化迁移、
// 勾选组工具。UI 与 FiltersContext 共用；不持有状态。
// ============================================================
import { dimProduct } from '../data';
import type { DimProduct } from '../dataModel/types';
import type { MainProduct, ProductSelection } from './filtersTypes';
import { groupsFromBenchmark } from './configStore';
import { modelIdOf } from '../components/ProductCascader/tree';

/** 一张图（合并图 = 唯一主品卡；分离模式 = 某张面板卡）同时展示的折线数上限。
 *  第一百一十七轮：上限前移到选择时（modal 配额），呈现层不再截断。 */
export const MAX_LINES_PER_CHART = 8;

const norm = (s: string): string => s.replace(/\s+/g, '');

/** 勾选组键（型号|配置去空格）——卡片配置、对比区、图例系列 key 的公共成分 */
export function selKey(sel: ProductSelection): string {
  return `${sel.modelId}|${norm(sel.romram)}`;
}

/** 卡内对比区配额 = 8 - 配置数（主品配置优先占线；至少 0） */
export function cardQuota(card: Pick<MainProduct, 'configs'>): number {
  return Math.max(0, MAX_LINES_PER_CHART - card.configs.length);
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

/** 主分析卡列表整体是否仍属于该国该产业（任一配置失效即 false，与旧 own 判定同语义） */
export function mainsValidFor(mains: MainProduct[], countryCode: string, industry: DimProduct['industry']): boolean {
  const configs = mains.flatMap((m) => m.configs);
  if (!configs.length) return false;
  return configs.every((sel) => selectionValidFor(sel, countryCode, industry));
}

/** 主品卡的自动匹配对比区：对标矩阵并集（主竞品在前）→
 *  剔除与主品同型号同配置的组（防御）→ 按卡配额截断。 */
export function autoComparesFor(card: MainProduct): ProductSelection[] {
  if (!card.configs.length) return [];
  const ownKeys = new Set(card.configs.map(selKey));
  return groupsFromBenchmark(card.configs).filter((c) => !ownKeys.has(selKey(c))).slice(0, cardQuota(card));
}

/** 自动跟随重算：华为主品卡（矩阵覆盖侧）对比区 = 矩阵产出（矩阵为空即清空）；
 *  非华为主品卡无矩阵可依，手动挑选的对比区不被动清空。 */
export function reapplyAuto(mains: MainProduct[]): MainProduct[] {
  return mains.map((card) =>
    card.configs.length && isHuaweiModel(card.modelId)
      ? { ...card, compares: autoComparesFor(card) }
      : card,
  );
}

/** ProductSelection[] 按型号分组成卡（保序；compare 侧去重同型号同配置） */
export function groupToCards(list: ProductSelection[]): MainProduct[] {
  const out: MainProduct[] = [];
  const byModel = new Map<string, MainProduct>();
  for (const sel of list) {
    let card = byModel.get(sel.modelId);
    if (!card) {
      card = { modelId: sel.modelId, configs: [], compares: [] };
      byModel.set(sel.modelId, card);
      out.push(card);
    }
    if (!card.configs.some((c) => selKey(c) === selKey(sel))) card.configs.push(sel);
  }
  return out;
}

/** v10 → v11 持久化迁移：旧 own + competitors（全局一份）→ 每主品卡自带对比区。
 *  - autoMatch 开：逐卡按矩阵重算（复用第一百一十六轮自愈口径）；
 *  - autoMatch 关：把旧全局竞品按旧看板面板口径分配——矩阵映射命中优先、
 *    同容量 fallback 补位、截到卡配额；
 *  - 旧「纯竞品视角」（own 空有竞品）：竞品型号各成一卡（无对比区），保底 8 卡。 */
export function migrateV10(own: ProductSelection[], competitors: ProductSelection[], autoMatch: boolean): MainProduct[] {
  if (!own.length) {
    return groupToCards(competitors).slice(0, MAX_LINES_PER_CHART).map((c) => ({ ...c, compares: [] }));
  }
  const cards = groupToCards(own);
  if (autoMatch) return cards.map((card) => ({ ...card, compares: autoComparesFor(card) }));
  const globalKeys = new Set(competitors.map(selKey));
  return cards.map((card) => {
    const ownKeys = new Set(card.configs.map(selKey));
    const mapped = groupsFromBenchmark(card.configs).filter((c) => globalKeys.has(selKey(c)) && !ownKeys.has(selKey(c)));
    const mappedKeys = new Set(mapped.map(selKey));
    const fallback = competitors.filter(
      (c) => !mappedKeys.has(selKey(c)) && !ownKeys.has(selKey(c))
        && card.configs.some((s) => norm(s.romram) === norm(c.romram)),
    );
    return { ...card, compares: [...mapped, ...fallback].slice(0, cardQuota(card)) };
  });
}

/** 合并图取数组：全部主品配置（按卡序）+ 全部对比区并集（按卡序去重；主品已有者不重复） */
export function flatSelections(mains: MainProduct[]): { mainSels: ProductSelection[]; compareSels: ProductSelection[] } {
  const mainSels: ProductSelection[] = [];
  const compareSels: ProductSelection[] = [];
  const seen = new Set<string>();
  for (const card of mains) {
    for (const sel of card.configs) {
      if (!seen.has(selKey(sel))) {
        seen.add(selKey(sel));
        mainSels.push(sel);
      }
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

/** 把超配额的卡收敛到配额内（迁移兜底）：配置全保留，对比区按序截断 */
export function clampMains(mains: MainProduct[]): MainProduct[] {
  return mains.map((card) => ({ ...card, compares: card.compares.slice(0, cardQuota(card)) }));
}
