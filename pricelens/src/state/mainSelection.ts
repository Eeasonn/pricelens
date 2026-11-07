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
import { lowestPriceColorSku, lowestPriceColorSkuAnyChannel, platformSelectionForCountry } from '../dataModel/aggregate';
import { STABLE } from '../appChannel';

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

/* ---------- 迭代线实现（e98d9b1） ---------- */
/** 型号在目标国的首个合法配置：配置名升序遍历，取该国「最新有价周最低折后价
 *  颜色」的 SKU（与 computeDataDefaults 默认卡同口径）。型号在该国无任何
 *  有价配置 = null。R2（M1a）：URL 链接携带的配置在目标国不存在（RU 12+512
 *  链接进 ID）时按此落到同型号该国首个合法配置（ID 16+512GB）。
 *  R3（M2，型号在架 ≠ 默认电渠有价）：有价判定先按默认电渠（lowestPriceColorSku），
 *  默认电渠全程无价时回退全部在架渠道（lowestPriceColorSkuAnyChannel）——
 *  FR Mate X6 12+512 仅 Amazon 3P 有真实事实，不能因默认 Amazon 1P 无价就
 *  误判「型号在该国无在架配置」返回 null（会让 URL/跨国重映射丢主品）。 */
function firstLegalSelectionOfModelIterate(modelId: string, countryCode: string): ProductSelection | null {
  const rows = dimProduct.filter((p) => modelIdOf(p) === modelId && p.countries.includes(countryCode));
  if (!rows.length) return null;
  const romrams = [...new Set(rows.map((p) => p.romram))].sort();
  for (const romram of romrams) {
    const skuId = lowestPriceColorSku(modelId, romram, countryCode) ?? lowestPriceColorSkuAnyChannel(modelId, romram, countryCode);
    if (skuId) return { modelId, romram, skuIds: [skuId] };
  }
  return null;
}

/** R3（M3 · 逐线取价口径归一化）：勾选组自己的 platform（每线取价口径）按目标国
 *  共享规则归一——同国完全可落地返回原引用（不克隆不动状态）；部分可落地保留
 *  有效子集；全部不可落地 = null（该线回自动口径：目标国全部渠道最低价，不是
 *  源国渠道）。未带每线口径的选择原样返回。全局 state.platform 的同款归一在
 *  platformSelectionForCountry 本体（R5-M1）；此处补齐「每线」漏网路径。 */
export function normalizeSelectionForCountry(sel: ProductSelection, countryCode: string): ProductSelection {
  if (!sel.platform) return sel;
  const platform = platformSelectionForCountry(sel.platform, countryCode);
  return platform === sel.platform ? sel : { ...sel, platform };
}

/** 勾选组跨口径映射（R2 M1a，显式口径切换专用；R4-m1 细化 SKU 过滤）：精确合法
 *  配置原样保留（多 SKU 时只过滤出目标国仍有效的 SKU 子集，不能任一命中就整组
 *  保留、把目标国不存在的 SKU 一并带过去）；配置/SKU 在目标国不存在但型号仍在
 *  → 同型号该国首个合法配置（颜色尽量沿用同色名，缺失回落最低价色）；型号整体
 *  缺席 = null（调用方回落默认）。
 *  R3（M2）：配置「有价」判定补全部在架渠道回退——型号在目标国仅 3P 有真实
 *  事实（FR Mate X6）时精确配置/首配映射照常成立，不再误判型号缺席。
 *  R3（M3）：取价口径 platform 字段除「随选择保留」外，跨国时逐线归一化到目标
 *  国可落地范围（源国渠道在目标国不存在 → 该线回自动口径），与全局平台归一
 *  同一共享规则——否则跨国防型号重映射 spread 残留源国每线 shop，计算落地
 *  两个口径。 */
function remapSelectionForCountryIterate(sel: ProductSelection, countryCode: string, industry: DimProduct['industry']): ProductSelection | null {
  const modelInCountry = dimProduct.some(
    (p) => p.model_id === sel.modelId && p.industry === industry && p.countries.includes(countryCode),
  );
  if (!modelInCountry) return null;
  // 精确配置优先：原配置在目标国有价（默认电渠无价时按全部在架渠道回退）则只换/滤 SKU，配置名不漂移
  const exactPriced = lowestPriceColorSku(sel.modelId, sel.romram, countryCode)
    ?? lowestPriceColorSkuAnyChannel(sel.modelId, sel.romram, countryCode);
  if (exactPriced != null) {
    // 整配置口径（skuIds 空 = 该配置全部颜色行）在该国有效，原样保留（仅归一每线口径）
    if (!sel.skuIds.length) return normalizeSelectionForCountry(sel, countryCode);
    // 多 SKU：只保留目标国真实存在的 SKU；全无效才落到下方同色/最低价色重选
    const validSkuIds = sel.skuIds.filter((sku) =>
      dimProduct.some((p) => modelIdOf(p) === sel.modelId && norm(p.romram) === norm(sel.romram) && p.countries.includes(countryCode) && p.sku_id === sku),
    );
    if (validSkuIds.length) return normalizeSelectionForCountry({ ...sel, skuIds: validSkuIds }, countryCode);
  }
  const romram = exactPriced != null ? sel.romram : firstLegalSelectionOfModelIterate(sel.modelId, countryCode)?.romram;
  if (romram == null) return null;
  const oldColors = new Set(
    dimProduct.filter((p) => sel.skuIds.includes(p.sku_id) && p.color && p.color !== '—')
      .map((p) => p.color.toLowerCase()),
  );
  const sameColor = dimProduct.find(
    (p) => modelIdOf(p) === sel.modelId && norm(p.romram) === norm(romram)
      && p.countries.includes(countryCode) && p.color && p.color !== '—' && oldColors.has(p.color.toLowerCase()),
  );
  const skuId = sameColor?.sku_id ?? lowestPriceColorSku(sel.modelId, romram, countryCode) ?? lowestPriceColorSkuAnyChannel(sel.modelId, romram, countryCode);
  return skuId ? normalizeSelectionForCountry({ ...sel, romram, skuIds: [skuId] }, countryCode) : null;
}

/** 显式携带的主分析卡整组合法化（R2 M1a）：主品逐卡按 remapSelectionForCountry
 *  映射（同型号保留/换合法配置），型号整体缺席的卡剔除；映射后按 selKey 去重
 *  （R4-m1：两张卡重映射到同型号同配置时合并为一卡，不留重复占线）；空对卡
 *  原样保留。返回 null = 没有任何卡能落在目标国（型号全缺席），调用方回落默认/快照。
 *  R4-S1（同步稳定线 5f5898d）：手动对比区同样逐条合法化（逐 SKU 过滤 / 配置
 *  漂移同型号映射 / 型号缺席剔除），按 selKey 去重并排除与所在卡主品同组的条目
 *  （重映射后 compare 与 main 落到同型号同配置时不再重复占线），对比区封
 *  COMPARES_PER_CARD_CAP（clampMains 收口）；自动匹配卡对比区由调用方按目标国
 *  矩阵重算。 */
function remapMainsForScopeIterate(mains: MainProduct[], countryCode: string, industry: DimProduct['industry']): MainProduct[] | null {
  const out: MainProduct[] = [];
  const seen = new Set<string>();
  const sanitizeCompares = (compares: ProductSelection[], mainKey?: string): ProductSelection[] => {
    const legal: ProductSelection[] = [];
    const seenCompare = new Set<string>();
    for (const sel of compares) {
      const mapped = remapSelectionForCountryIterate(sel, countryCode, industry);
      if (!mapped) continue;
      const key = selKey(mapped);
      if (seenCompare.has(key) || key === mainKey) continue;
      seenCompare.add(key);
      legal.push(mapped);
    }
    return legal;
  };
  for (const card of mains) {
    if (!card.main) {
      out.push({ ...card, compares: sanitizeCompares(card.compares) });
      continue;
    }
    const main = remapSelectionForCountryIterate(card.main, countryCode, industry);
    if (!main) continue;
    const key = selKey(main);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...card, main, compares: sanitizeCompares(card.compares, key) });
  }
  return out.length ? clampMains(out) : null;
}

/* ---------- 稳定线实现（4966d02） ---------- */
/** 型号在目标国的首个合法配置：配置名升序遍历，取该国「最新有价周最低折后价
 *  颜色」的 SKU（与 computeDataDefaults 默认卡同口径）。型号在该国无任何
 *  有价配置 = null。R3（M1a）：URL 链接携带的配置在目标国不存在（RU 12+512
 *  链接进 ID）时按此落到同型号该国首个合法配置（ID 16+512GB）。 */
function firstLegalSelectionOfModelStable(modelId: string, countryCode: string): ProductSelection | null {
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
function remapSelectionForCountryStable(sel: ProductSelection, countryCode: string, industry: DimProduct['industry']): ProductSelection | null {
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
  const romram = firstLegalSelectionOfModelStable(sel.modelId, countryCode)?.romram;
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

/** 显式携带的主分析卡整组合法化（R3 M1a + R4 S1）：主品逐卡按 remapSelectionForCountry
 *  映射（同型号保留/换合法配置/逐 SKU 过滤），型号整体缺席的卡剔除；手动对比区同样
 *  逐条合法化（合法 SKU 子集保留，配置漂移同型号映射，型号缺席剔除）；多张源卡
 *  映射后落到同一 selKey（RU 12+512 与 16+512 → ID 均 16+512）按 selKey 去重，
 *  对比区封 COMPARES_PER_CARD_CAP；空对卡原样保留（对比区只留合法条目）。
 *  返回 null = 没有任何卡能落在目标国（型号全缺席），调用方回落默认/快照。 */
function remapMainsForScopeStable(mains: MainProduct[], countryCode: string, industry: DimProduct['industry']): MainProduct[] | null {
  const out: MainProduct[] = [];
  const seen = new Set<string>();
  const sanitizeCompares = (compares: ProductSelection[], mainKey?: string): ProductSelection[] => {
    const legal: ProductSelection[] = [];
    const seenCompare = new Set<string>();
    for (const sel of compares) {
      const mapped = remapSelectionForCountryStable(sel, countryCode, industry);
      if (!mapped) continue;
      const key = selKey(mapped);
      if (seenCompare.has(key) || key === mainKey) continue;
      seenCompare.add(key);
      legal.push(mapped);
    }
    return legal;
  };
  for (const card of mains) {
    if (!card.main) {
      out.push({ ...card, compares: sanitizeCompares(card.compares) });
      continue;
    }
    const main = remapSelectionForCountryStable(card.main, countryCode, industry);
    if (!main) continue;
    const key = selKey(main);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...card, main, compares: sanitizeCompares(card.compares, key) });
  }
  return out.length ? clampMains(out) : null;
}

// 2026-11-07 整合（稳定线 4966d02 × 迭代线 e98d9b1）：跨口径映射两线各自验收——
// 稳定线 R3/R4 以「目标国目录行」判配置存在（同配置内换合法 SKU）；迭代线同步了
// 稳定线 R3 M1a/R4-S1 后再加 R3 M2（默认电渠无价回退全部在架渠道）与 R3 M3（每线
// 口径逐线归一）。导出名按构建通道分发，各自测试锁各自行为。
/** 型号在目标国的首个合法配置（稳定 / 迭代按通道分发，见上） */
export function firstLegalSelectionOfModel(modelId: string, countryCode: string): ProductSelection | null {
  return STABLE ? firstLegalSelectionOfModelStable(modelId, countryCode) : firstLegalSelectionOfModelIterate(modelId, countryCode);
}

/** 勾选组跨口径映射（稳定 / 迭代按通道分发，见上） */
export function remapSelectionForCountry(sel: ProductSelection, countryCode: string, industry: DimProduct['industry']): ProductSelection | null {
  return STABLE ? remapSelectionForCountryStable(sel, countryCode, industry) : remapSelectionForCountryIterate(sel, countryCode, industry);
}

/** 显式携带的主分析卡整组合法化（稳定 / 迭代按通道分发，见上） */
export function remapMainsForScope(mains: MainProduct[], countryCode: string, industry: DimProduct['industry']): MainProduct[] | null {
  return STABLE ? remapMainsForScopeStable(mains, countryCode, industry) : remapMainsForScopeIterate(mains, countryCode, industry);
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
