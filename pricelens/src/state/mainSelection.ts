// ============================================================
// 主分析卡纯函数（第一百二十轮，第三次迭代）：
// 卡 = 唯一主品（产品+型号+颜色）+ 对比区。含自动匹配填充、v10/v11 持久化
// 迁移、勾选组工具。UI 与 FiltersContext 共用；不持有状态。
// 2026-11-27（取消上限 + 来源并集）：
// · 单图 8 线 / 8 张主品卡 / 合并 16 线及全部截断一并退役——卡数与对比区条数
//   不再设上限，各处「配额收口」改为纯结构整理（去重、剔除与主品同组项）。
// · 对比区 = 用户补充 ∪（自动匹配开：对标矩阵产出 − excluded）。用户补充
//   （手动添加 / 同档推荐）登记在 compareSources，矩阵重算、开关切换、刷新恢复
//   都不删；手动增删不再整体退出自动匹配。被用户移除的矩阵项记入 excluded。
// ============================================================
import { dimProduct, factPriceMonthly } from '../data';
import type { DimProduct } from '../dataModel/types';
import type { FinancingPlan, FinancingTerm } from '../dataModel/marketProfile';
import type { CompareSource, FinancingType } from './filtersTypes';
import type { MainProduct, ProductSelection } from './filtersTypes';
// 类型再导出（2026-11-05）：PriceTrendSearch 等调用方从本模块取 MainProduct，
// filtersTypes 仍是唯一定义源，此处仅透传
export type { MainProduct, ProductSelection };
import { groupsFromBenchmark } from './configStore';
import { getCurrentCountry } from './currentScope';
import { defaultColorSkuIds, modelIdOf, type RomramNode } from '../components/ProductCascader/tree';
import { lowestPriceColorSku } from '../dataModel/aggregate';

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

/** 卡上生效的用户补充登记（旧卡兼容）：无登记的旧卡，自动匹配关 = 全部对比视作
 *  手动补充（用户持有的搭配不丢），开 = 矩阵产出。 */
export function userCompareSourcesOf(card: Pick<MainProduct, 'compares' | 'auto' | 'compareSources'>): Record<string, CompareSource> {
  if (card.compareSources) return card.compareSources;
  if (card.auto) return {};
  return Object.fromEntries(card.compares.map((c) => [selKey(c), 'manual' as CompareSource]));
}

/** 卡片元数据收口：登记与排除清单为空时省略键（持久化 payload 不膨胀） */
function withMeta(card: MainProduct, sources: Record<string, CompareSource>, excluded: string[]): MainProduct {
  const next: MainProduct = { ...card };
  delete next.compareSources;
  delete next.excluded;
  const keys = new Set(next.compares.map(selKey));
  const keptSources = Object.fromEntries(Object.entries(sources).filter(([k]) => keys.has(k)));
  const keptExcluded = excluded.filter((k) => !keys.has(k));
  if (Object.keys(keptSources).length) next.compareSources = keptSources;
  if (keptExcluded.length) next.excluded = keptExcluded;
  return next;
}

/** 自动匹配开时当前对标矩阵对本卡的产出键集（矩阵分国；非华为主品 / 空对 = 空集） */
function matrixKeysOf(card: MainProduct, countryCode: string = getCurrentCountry()): Set<string> {
  if (!card.auto || !card.main || !isHuaweiModel(card.main.modelId)) return new Set();
  return new Set(autoComparesFor(card, countryCode).map(selKey));
}

/** 对比项生效来源（展示用，按「矩阵 → 同档推荐 → 手动」顺序）：
 *  矩阵项 = 自动匹配开且在当前矩阵产出中；其余按登记；未登记且自动匹配关 = 手动。 */
export function compareSourcesOf(card: MainProduct, key: string): ('matrix' | CompareSource)[] {
  const out: ('matrix' | CompareSource)[] = [];
  if (matrixKeysOf(card).has(key)) out.push('matrix');
  const registered = card.compareSources?.[key] ?? (card.auto ? undefined : 'manual');
  if (registered && !out.includes(registered)) out.push(registered);
  return out;
}

/** 对比区并集（核心）：用户补充恒保留；自动匹配开时并入矩阵产出（减 excluded）、
 *  自动匹配关时只剩用户补充。既有条目的相对顺序不变（用户的换序 / 调色保留），
 *  新出现的矩阵项按矩阵序（主竞品在前）追加；与主品同组者不进对比区。 */
function unionCompares(card: MainProduct, matrix: ProductSelection[]): MainProduct {
  const sources: Record<string, CompareSource> = { ...userCompareSourcesOf(card) };
  const excluded = new Set(card.excluded ?? []);
  const mKeys = new Set(matrix.map(selKey));
  const own = card.main ? selKey(card.main) : null;
  const kept = card.compares.filter((c) => {
    const k = selKey(c);
    if (k === own) return false;
    return !!sources[k] || (card.auto === true && mKeys.has(k) && !excluded.has(k));
  });
  const keptKeys = new Set(kept.map(selKey));
  const add = card.auto === true
    ? matrix.filter((c) => selKey(c) !== own && !keptKeys.has(selKey(c)) && !excluded.has(selKey(c)))
    : [];
  return withMeta({ ...card, compares: [...kept, ...add] }, sources, [...excluded]);
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
export function selectionValidFor(
  sel: ProductSelection,
  countryCode: string,
  industry: DimProduct['industry'],
  financingType: FinancingType | null = null,
  financingTerms: FinancingTerm[] = [],
): boolean {
  const productRows = dimProduct.filter(
    (p) => p.model_id === sel.modelId
      && p.industry === industry
      && p.countries.includes(countryCode)
      && norm(p.romram) === norm(sel.romram)
      && (sel.skuIds.length === 0 || sel.skuIds.includes(p.sku_id)),
  );
  if (!productRows.length) return false;
  if (countryCode !== 'ZA') return true;
  const selectedSkuIds = new Set(productRows.map((p) => p.sku_id));
  const modelName = productRows[0].model_name.trim().toLowerCase();
  // 付费口径匹配（2026-11-11 先付/后付两级）：先付 = prepaid 行；后付 = installment
  // 行且期数 ∈ 多选集（空集 = 不限期数）
  const termOk = (row: typeof factPriceMonthly[number]): boolean => {
    if (financingType === 'prepaid') return row.price_type === 'prepaid';
    if (financingType === 'installment') {
      return row.price_type === 'installment'
        && (financingTerms.length === 0 || (row.term_months != null && financingTerms.includes(row.term_months)));
    }
    return row.price_local != null;
  };
  return factPriceMonthly.some((row) => row.review_status === 'PASS'
    && termOk(row)
    && row.price_local != null
    && ((row.sku_id != null && selectedSkuIds.has(row.sku_id))
      || (row.sku_id == null
        && row.model?.trim().toLowerCase() === modelName
        && norm(row.sku_spec ?? '') === norm(sel.romram))));
}

function selectionHasMonthlyPrice(sel: ProductSelection, countryCode: string): boolean {
  return countryCode !== 'ZA' || selectionValidFor(sel, countryCode, dimProduct.find((p) => p.model_id === sel.modelId)?.industry ?? 'phone');
}

/** 主分析卡列表整体是否仍属于该国该产业（任一主品失效即 false，与旧 own 判定同语义） */
export function mainsValidFor(
  mains: MainProduct[],
  countryCode: string,
  industry: DimProduct['industry'],
  financingType: FinancingType | null = null,
  financingTerms: FinancingTerm[] = [],
): boolean {
  const sels = mains.map((m) => m.main).filter((s): s is ProductSelection => s != null);
  if (!sels.length) return false;
  return sels.every((sel) => selectionValidFor(sel, countryCode, industry, financingType, financingTerms));
}

/** 2026-11-11 Eason（BUG 修复）：切换付费口径/期数不再清空已选产品——
 *  口径切换只是查看方式，产品无该口径数据时保留选卡并显示空态提示。 */
export function filterMainsByFinancingTerm(
  mains: MainProduct[],
): MainProduct[] {
  return mains;
}

/* ---------- 跨口径映射 ----------
 * 2026-11-27 演进版退场：原「稳定线 / 迭代线各自实现 + 按构建通道分发」收敛为
 * 单一实现（保留稳定线口径）。迭代线独有的 R3 M2（默认电渠无价时回退全部在架
 * 渠道判有价）与 R3 M3（勾选组每线口径逐线归一）随迭代通道一并删除。 */
/** 型号在目标国的首个合法配置：配置名升序遍历，取该国「最新有价周最低折后价
 *  颜色」的 SKU（与 computeDataDefaults 默认卡同口径）。型号在该国无任何
 *  有价配置 = null。R3（M1a）：URL 链接携带的配置在目标国不存在（RU 12+512
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

/** 勾选组跨口径映射（R3 M1a + R4 S1，显式口径切换/查询共用）：
 *  - 空 skuIds = 整配置口径（buildSeries 展开该配置全部颜色行），配置在该国
 *    有行即原样保留；
 *  - 非空 skuIds 逐个校验（型号 × 产业 × 国家 × 配置 × SKU 行）：合法子集
 *    非空 → 只保留合法成员（任一合法不能让非法 SKU 混进来）；全部非法但配置
 *    在该国真实存在 → 配置内换合法 SKU（同色优先，缺失回落最低价色/首行）；
 *  - 配置整体不在目标国但型号仍在 → 同型号该国首个合法配置（颜色尽量沿用
 *    同色名，缺失回落最低价色）；型号整体缺席 = null（调用方回落默认）。 */
export function remapSelectionForCountry(sel: ProductSelection, countryCode: string, industry: DimProduct['industry']): ProductSelection | null {
  if (!selectionHasMonthlyPrice(sel, countryCode)) return null;
  const configRows = dimProduct.filter(
    (p) => p.model_id === sel.modelId
      && p.industry === industry
      && p.countries.includes(countryCode)
      && norm(p.romram) === norm(sel.romram),
  );
  if (configRows.length) {
    if (sel.skuIds.length === 0) return sel;
    const legal = sel.skuIds.filter((skuId) => configRows.some((p) => p.sku_id === skuId));
    if (legal.length) return legal.length === sel.skuIds.length ? sel : { ...sel, skuIds: legal };
    // 配置在该国真实存在、只是所选 SKU 全部不存在（旧 id 漂移/坏数据）：
    // 配置名不漂移，配置内换合法 SKU（同色优先 → 最低价色 → 首行兜底）
    const sameColor = configRows.find(
      (p) => p.color && p.color !== '—' && sel.skuIds.some((old) => {
        const oldRow = dimProduct.find((row) => row.sku_id === old);
        return oldRow?.color && oldRow.color !== '—' && oldRow.color.toLowerCase() === p.color!.toLowerCase();
      }),
    );
    const skuId = sameColor?.sku_id ?? lowestPriceColorSku(sel.modelId, sel.romram, countryCode) ?? configRows[0].sku_id;
    return { ...sel, skuIds: [skuId] };
  }
  const modelInCountry = dimProduct.some(
    (p) => p.model_id === sel.modelId && p.industry === industry && p.countries.includes(countryCode),
  );
  if (!modelInCountry) return null;
  const romram = firstLegalSelectionOfModel(sel.modelId, countryCode)?.romram;
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

/** 主分析卡整组合法化（R2/R3 M1a + R4-m1/S1）：
 *  主品逐卡按 remapSel 映射（同型号保留 / 换目标国合法配置），型号整体缺席的卡剔除；
 *  映射后按 selKey 去重（两张卡重映射到同型号同配置时合并为一卡）；空对卡原样保留。
 *  R4-S1：对比区同样逐条合法化，按 selKey 去重并排除与所在卡主品同组的条目
 *  （重映射后 compare 与 main 落到同型号同配置时不再重复占线）。
 *  2026-11-27：①条数一律不截断（原 clampMains 配额收口退役）；②用户补充登记
 *  （compareSources）与排除清单（excluded）随映射同步到新键——配置漂移时键会变，
 *  来源不丢；自动匹配卡对比区由调用方按目标国矩阵重算（withAutoOn 并集）。
 *  返回 null = 没有任何卡能落在目标国（型号全缺席），调用方回落默认/快照。 */
function remapMainsWith(
  mains: MainProduct[],
  remapSel: (sel: ProductSelection, countryCode: string, industry: DimProduct['industry']) => ProductSelection | null,
  countryCode: string,
  industry: DimProduct['industry'],
): MainProduct[] | null {
  const out: MainProduct[] = [];
  const seen = new Set<string>();
  /** 排除清单键随配置漂移重映射：型号已不在维表 → 原样保留（不会命中任何矩阵项）；
   *  型号在目标国缺席 → 丢弃 */
  const remapExcludedKey = (key: string): string | null => {
    const i = key.indexOf('|');
    if (i <= 0) return null;
    const modelId = key.slice(0, i);
    const rom = key.slice(i + 1);
    const row = dimProduct.find((p) => p.model_id === modelId && norm(p.romram) === rom);
    if (!row) return key;
    const mapped = remapSel({ modelId, romram: row.romram, skuIds: [] }, countryCode, industry);
    return mapped ? selKey(mapped) : null;
  };
  const sidesOf = (card: MainProduct, mainKey: string | null): MainProduct => {
    const sources: Record<string, CompareSource> = { ...userCompareSourcesOf(card) };
    const seenCompare = new Set<string>();
    const compares: ProductSelection[] = [];
    const nextSources: Record<string, CompareSource> = {};
    for (const sel of card.compares) {
      const mapped = remapSel(sel, countryCode, industry);
      if (!mapped) continue;
      const key = selKey(mapped);
      if (seenCompare.has(key) || key === mainKey) continue;
      seenCompare.add(key);
      compares.push(mapped);
      // 登记随映射前的选择搬到映射后的键（矩阵产出无登记，保持无登记）
      const registered = sources[selKey(sel)];
      if (registered) nextSources[key] = registered;
    }
    const excluded = (card.excluded ?? [])
      .map(remapExcludedKey)
      .filter((k): k is string => k != null && !seenCompare.has(k) && k !== mainKey);
    return withMeta({ ...card, compares }, nextSources, [...new Set(excluded)]);
  };
  for (const card of mains) {
    if (!card.main) {
      out.push(sidesOf(card, null));
      continue;
    }
    const main = remapSel(card.main, countryCode, industry);
    if (!main) continue;
    const key = selKey(main);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sidesOf({ ...card, main }, key));
  }
  return out.length ? out : null;
}

/** 显式携带的主分析卡整组合法化（R3 M1a 逐 SKU 过滤 / 同配置内换合法 SKU /
 *  R4 S1 对比区校验剥离，见 remapSelectionForCountry） */
export function remapMainsForScope(mains: MainProduct[], countryCode: string, industry: DimProduct['industry']): MainProduct[] | null {
  return remapMainsWith(mains, remapSelectionForCountry, countryCode, industry);
}

/** 主品卡的自动匹配对比区：对标矩阵（主竞品在前）→ 剔除与主品同型号同配置。
 *  2026-11-27 起不截断（原按卡配额 slice 退役）。 */
export function autoComparesFor(card: MainProduct, countryCode: string = getCurrentCountry()): ProductSelection[] {
  if (!card.main) return [];
  const ownKey = selKey(card.main);
  return groupsFromBenchmark([card.main], countryCode).filter((c) => selKey(c) !== ownKey);
}

/** 「自动匹配竞品」开：对比区 = 矩阵产出 ∪ 用户补充（见 unionCompares），
 *  此后换主品 / 矩阵更新自动跟随，用户补充不丢。仅华为主品卡可开（矩阵只覆盖华为侧）。
 *  2026-11-27：旧卡（无来源登记、自动匹配关）开启时，原对比区整体转为手动补充保留——
 *  不再被矩阵产出整体替换。 */
export function withAutoOn(card: MainProduct, countryCode: string = getCurrentCountry()): MainProduct {
  if (!card.main || !isHuaweiModel(card.main.modelId)) return card;
  const base = card.compareSources ? card : withMeta(card, userCompareSourcesOf(card), card.excluded ?? []);
  return unionCompares({ ...base, auto: true }, autoComparesFor(card, countryCode));
}

/** 「自动匹配竞品」关：退出矩阵驱动，当前对比区整体保留并转为用户手动持有
 *  （同档推荐项保留来源标签；排除清单保留，重新开启时不复活被移除的矩阵项）。 */
export function withAutoOff(card: MainProduct): MainProduct {
  if (!card.auto) return card;
  const sources: Record<string, CompareSource> = { ...userCompareSourcesOf(card) };
  const held = Object.fromEntries(card.compares.map((c) => [selKey(c), sources[selKey(c)] ?? 'manual' as CompareSource]));
  return withMeta({ ...card, auto: false }, held, card.excluded ?? []);
}

/** 单卡开关切换：开 = 矩阵产出并入（补充保留）+ 置开；关 = 对比区保留转手动。 */
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

/** 2026-11-26 Eason：自动匹配竞品 = 默认逻辑——刷新/重开一律默认开。
 *  启动恢复路径（持久化 / URL）把华为主品卡强制回 auto=true；对比区不在此处
 *  重算，由随后的 applyScopeDefaults 末尾 withAutoOn 按当前口径矩阵统一重算
 *  （开关语义「开 = 矩阵驱动」不变；2026-11-27 起重算为并集，持久化里的手动 /
 *  同档推荐补充随刷新保留）。「关」只在单次界面交互内有效：会话内切国快照 /
 *  撤销照常保留用户操作，不跨刷新存活。非华为主品卡不适用矩阵，原样保留。 */
export function restoreAutoOn(mains: MainProduct[]): MainProduct[] {
  return mains.map((card) => (card.main != null && isHuaweiModel(card.main.modelId) ? { ...card, auto: true } : card));
}

/** 卡片落主品（空对补选 / 换主品共用）：剔除与新主品同型号同配置的对比项
 *  （主品与对比不重复占线），条数不截断；旧主品的矩阵排除清单失效。
 *  自动匹配开 = 对比区按新主品矩阵重算（用户补充保留；新主品非华为时矩阵不可依，
 *  退回手动）。
 *  第一百三十一轮（匹配竞品默认开）：落主品后对比区仍为空（新卡/空对/换主品后
 *  无手动搭配）且新主品为华为 = 自动开启（对比区 = 矩阵产出），用户无需手动点开关；
 *  已有手动对比内容的卡不翻案，保持手动。 */
export function withMain(card: MainProduct, sel: ProductSelection): MainProduct {
  const key = selKey(sel);
  const sources: Record<string, CompareSource> = { ...userCompareSourcesOf(card) };
  delete sources[key];
  const next = withMeta(
    { ...card, main: sel, compares: card.compares.filter((c) => selKey(c) !== key) },
    sources,
    [],
  );
  if (card.auto) {
    return isHuaweiModel(sel.modelId) ? withAutoOn(next) : withAutoOff(next);
  }
  return !next.compares.length && isHuaweiModel(sel.modelId) ? withAutoOn(next) : next;
}

/** 手动改写某卡对比区（FiltersContext.setCardCompares 的唯一落点）：按新旧键集对账——
 *  · 新增项登记为手动补充（自动匹配不关，与矩阵产出并存）；
 *  · 移除项注销登记；自动匹配开且该项在矩阵产出中 → 记入 excluded，矩阵重算不再带回；
 *  · 保留项（调色 / 换序 / 换取价口径）来源不变、顺序以传入为准；
 *  · 与主品同组、同型号同配置的重复项剔除；被用户加回的排除项解除排除。 */
export function withCompares(card: MainProduct, next: ProductSelection[], countryCode: string = getCurrentCountry()): MainProduct {
  const own = card.main ? selKey(card.main) : null;
  const sources: Record<string, CompareSource> = { ...userCompareSourcesOf(card) };
  const excluded = new Set(card.excluded ?? []);
  const oldKeys = new Set(card.compares.map(selKey));
  const out: ProductSelection[] = [];
  const seen = new Set<string>();
  for (const sel of next) {
    const k = selKey(sel);
    if (k === own || seen.has(k)) continue;
    seen.add(k);
    out.push(sel);
  }
  const matrixKeys = matrixKeysOf(card, countryCode);
  for (const k of oldKeys) {
    if (seen.has(k)) continue;
    delete sources[k];
    if (matrixKeys.has(k)) excluded.add(k);
  }
  for (const sel of out) {
    const k = selKey(sel);
    if (!oldKeys.has(k)) sources[k] ??= 'manual';
    excluded.delete(k);
  }
  return withMeta({ ...card, compares: out }, sources, [...excluded]);
}

/** 加入对比（用户补充）：与既有对比区并存为并集——同型号同配置去重、剔除与主品同组者、
 *  不改自动匹配开关、不截断；新项按来源登记（manual 手动 / tier 同档推荐）。
 *  重复项去重但保留来源：要加的项已在对比区（例如当前恰是矩阵产出）时不重复占线，
 *  但补登用户来源——此后矩阵更新把它移出矩阵，它作为用户补充仍留在对比区。 */
export function withComparesAdded(card: MainProduct, sels: ProductSelection[], source: CompareSource): MainProduct {
  const own = card.main ? selKey(card.main) : null;
  const have = new Map(card.compares.map((c) => [selKey(c), c] as const));
  const sources: Record<string, CompareSource> = { ...userCompareSourcesOf(card) };
  const add: ProductSelection[] = [];
  let registered = false;
  for (const sel of sels) {
    const k = selKey(sel);
    if (k === own) continue;
    if (have.has(k)) {
      if (!sources[k]) {
        sources[k] = source;
        registered = true;
      }
      continue;
    }
    have.set(k, sel);
    sources[k] = source;
    add.push(sel);
  }
  if (!add.length && !registered) return card;
  return withMeta({ ...card, compares: [...card.compares, ...add] }, sources, card.excluded ?? []);
}

/** 跨页建卡正源（总览走势跳转 / 对比浮层进看板 / 预警看板下钻共用）：
 *  按 selKey 去重、不封顶（2026-11-27 起无卡数上限）；首卡继承 firstCompares
 *  （登记为手动补充；剔除与主品同组者），其余卡对比区落空。auto = true 建卡即开
 *  「自动匹配竞品」（对比区 = 矩阵产出，仅华为主品生效；此时 firstCompares 不并入）。 */
export function buildCards(
  sels: ProductSelection[],
  opts: { firstCompares?: ProductSelection[]; auto?: boolean; countryCode?: string } = {},
): MainProduct[] {
  const out: MainProduct[] = [];
  const seen = new Set<string>();
  for (const sel of sels) {
    const key = selKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);
    let card: MainProduct = { id: newCardId(), main: sel, compares: [] };
    if (opts.auto && isHuaweiModel(sel.modelId)) {
      card = withAutoOn(card, opts.countryCode);
    } else if (out.length === 0 && opts.firstCompares?.length) {
      card = withComparesAdded(card, opts.firstCompares, 'manual');
    }
    out.push(card);
  }
  return out;
}

/** 勾选组逐组成卡（保序；同型号同配置去重）——URL 解析 / 纯竞品视角迁移用；
 *  buildCards 的薄封装。 */
export function cardsFromSelections(list: ProductSelection[]): MainProduct[] {
  return buildCards(list);
}

/** v11 → v12 持久化迁移：旧卡 configs[] 展开为逐配置卡——
 *  首配置卡继承原对比区（剔除与主品同组项，与 withMain/buildCards 同口径，不截断）；
 *  其余配置卡落空（对比区由用户点「自动匹配竞品/全部自动匹配」按需取回）。 */
export function expandV11Cards(
  cards: { modelId: string; configs: ProductSelection[]; compares: ProductSelection[] }[],
): MainProduct[] {
  const out: MainProduct[] = [];
  const seen = new Set<string>();
  for (const old of cards) {
    old.configs.forEach((sel, i) => {
      const key = selKey(sel);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        id: newCardId(),
        main: sel,
        compares: i === 0 ? old.compares.filter((c) => selKey(c) !== key) : [],
      });
    });
  }
  return out;
}

/** v10 → v12 持久化迁移：旧 own + competitors（全局一份）→ 每配置一张卡，
 *  对比区按矩阵重算（旧全局竞品只是当时的矩阵产出，维表换代后以现行矩阵为准）；
 *  旧「纯竞品视角」（own 空）：竞品逐组成卡（无对比区），不封顶。 */
export function migrateV10(own: ProductSelection[], competitors: ProductSelection[]): MainProduct[] {
  if (!own.length) return tidyMains(cardsFromSelections(competitors));
  const cards = tidyMains(cardsFromSelections(own));
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

/** 读档 / 迁移 / URL 入口的兜底整理（2026-11-27 起无数量上限，原 clampMains 的截断退役）：
 *  只做结构收口——同型号同配置的卡去重（保序）；对比区内去重、剔除与所在卡主品
 *  同组的项；登记与排除清单同对比区对齐。卡数与对比区条数一律不截断。 */
export function tidyMains(mains: MainProduct[]): MainProduct[] {
  const seenCard = new Set<string>();
  const out: MainProduct[] = [];
  for (const card of mains) {
    const own = card.main ? selKey(card.main) : null;
    if (own) {
      if (seenCard.has(own)) continue;
      seenCard.add(own);
    }
    const seen = new Set<string>();
    const compares = card.compares.filter((c) => {
      const k = selKey(c);
      if (k === own || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (compares.length === card.compares.length && !card.compareSources && !card.excluded) {
      out.push(card);
      continue;
    }
    out.push(withMeta({ ...card, compares }, userCompareSourcesOf(card), card.excluded ?? []));
  }
  return out;
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
