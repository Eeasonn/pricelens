// ============================================================
// 页头搜索 = Agent 快速筛选入口（2026-11-27）：把一句「要比什么」解析成可编辑的
// 筛选补丁。纯函数、确定性、不调用模型；只产出预览，写入由调用方在用户确认后执行。
// 在 buildFilterPatch（币种 / RRP / 最近 N 周 / 国家 / 产品）之上追加：
// · 品牌词：限定竞品加入的品牌（未提及竞品品牌 = 不限定）；
// · 「同档」：主品现价落档 → 同档其他品牌每品牌取 USD 最接近的一款（来源 tier）；
// · 「上一代 / 换代」：数据包 prevGen 映射带出上一代配置（来源 manual）；
// · 无产品的档位词（$600-800 / 旗舰 / 入门）：该档我司组逐组成卡，同档竞品按
//   |USD 价差| 最近分配到我司卡（tierBoard.cardsFromBoard 同口径）；
// · 视图词：分列（品牌 / 系列 / 档位）与代际。
// 档位一律按 dataModel/tierPrice 的现价落档（USD 口径）。
// ============================================================
import { dimProduct } from '../data';
import { tierBandsOf } from '../dataModel/aggregate';
import { currentPricesByGroup, groupKeyOf as tierGroupKeyOf, type GroupPriceEntry } from '../dataModel/tierPrice';
import { groupsFromPrevGeneration } from '../state/configStore';
import { newCardId, selKey, tidyMains, withComparesAdded } from '../state/mainSelection';
import type { ColumnsGroupBy, FiltersState, MainProduct, ProductSelection, ViewMode } from '../state/filtersTypes';
import { brandLabelOf } from '../components/BrandMark';
import { cardsFromBoard, type BoardItem } from '../components/ProductPicker/tierBoard';
import type { FilterPatch } from './contracts';
import { buildFilterPatch, resolveAgentEntities } from './core';

export interface IntentResult {
  patch: FilterPatch;
  /** 人可读的口径假设与缺口，如「档位按现价落档」「数据包未登记 X 的上一代配置」 */
  notes: string[];
  /** 「为什么 / 怎么办」类问题：界面应提供转到对话深度分析 */
  isQuestion: boolean;
  /** 补丁超出「单个型号命中」：含同档 / 上一代对比、档位成卡、视图切换或 ≥2 个产品。
   *  搜索下拉据此决定是否显示筛选预览。 */
  structured: boolean;
}

/** 品牌中文 / 常用别名 → 维表品牌键 */
const BRAND_ALIASES: Record<string, string> = {
  苹果: 'APPLE', iphone: 'APPLE',
  三星: 'SAMSUNG', galaxy: 'SAMSUNG',
  荣耀: 'HONOR',
  小米: 'XIAOMI', 红米: 'XIAOMI', redmi: 'XIAOMI',
  华为: 'HUAWEI',
  维沃: 'VIVO', 欧珀: 'OPPO', 真我: 'REALME', 摩托罗拉: 'MOTOROLA', 传音: 'TRANSSION',
};

const escapeRe = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ASCII 词按词边界匹配（防 HP / ZTE 之类短键误中子串），中文按子串匹配 */
function mentions(text: string, word: string): boolean {
  if (!word) return false;
  if (/^[\x20-\x7e]+$/.test(word)) return new RegExp(`(?:^|[^a-z0-9])${escapeRe(word.toLowerCase())}(?:$|[^a-z0-9])`).test(text.toLowerCase());
  return text.includes(word);
}

/** 文本中提及的品牌键（仅限该产业维表里出现的品牌） */
export function brandsMentioned(text: string, industry: FiltersState['industry']): Set<string> {
  const known = new Set(dimProduct.filter((row) => row.industry === industry).map((row) => row.brand));
  const out = new Set<string>();
  for (const brand of known) {
    if (mentions(text, brand) || mentions(text, brandLabelOf(brand))) out.add(brand);
  }
  for (const [alias, brand] of Object.entries(BRAND_ALIASES)) {
    if (known.has(brand) && mentions(text, alias)) out.add(brand);
  }
  return out;
}

const QUESTION_RE = /为什么|原因|怎么办|建议|是否应该|(?:^|[^a-z])(?:how|why)(?:$|[^a-z])|[?？]/i;
const SAME_TIER_RE = /同档/;
const PREV_GEN_RE = /上一代|换代/;

interface ModelMeta { brand: string; isOwn: boolean; name: string }

function modelMetaIndex(): Map<string, ModelMeta> {
  const out = new Map<string, ModelMeta>();
  for (const row of dimProduct) if (!out.has(row.model_id)) out.set(row.model_id, { brand: row.brand, isOwn: row.is_own, name: row.model_name });
  return out;
}

const groupKeyOf = (sel: ProductSelection): string => tierGroupKeyOf(sel.modelId, sel.romram);

/** 档位词 → 档位码；null = 无档位词；'' = 有档位词但未匹配阶梯 */
function tierBandOfText(text: string, industry: FiltersState['industry']): string | null {
  const bands = tierBandsOf(industry);
  if (!bands.length) return null;
  // 数字前后不得紧贴其他数字 / 「+」，避免把周 id（202601-202612）或配置（12+512）当价位
  const range = text.match(/(?<![\d+])\$?\s*(\d{2,5})\s*(?:-|~|～|—|–|到|至)\s*\$?\s*(\d{2,5})(?![\d+])/);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return bands.find((band) => band.min === lo && band.max === hi)?.code ?? '';
  }
  const above = text.match(/(?<![\d+])\$?\s*(\d{2,5})\s*(?:\+(?![\d\s]*\d)|以上)/);
  if (above) return bands.find((band) => band.max == null && band.min === Number(above[1]))?.code ?? '';
  const below = text.match(/(?:<\s*\$?\s*(\d{2,5}))|(?:(?<![\d+])\$?\s*(\d{2,5})\s*以下)/);
  if (below) return bands.find((band) => band.min === 0 && band.max === Number(below[1] ?? below[2]))?.code ?? '';
  if (/旗舰/.test(text)) return bands[bands.length - 1].code;
  if (/入门/.test(text)) return bands[0].code;
  return null;
}

function viewOfText(text: string, state: FiltersState): Pick<FilterPatch, 'viewMode' | 'columns'> {
  let groupBy: ColumnsGroupBy | null = null;
  if (/按档位分列|按档分列/.test(text)) groupBy = 'tier';
  else if (/按系列/.test(text)) groupBy = 'series';
  else if (/分列|按品牌/.test(text)) groupBy = 'brand';
  if (groupBy) return { viewMode: 'columns', columns: { ...state.columns, groupBy } };
  if (/代际|生命周期|换代对比/.test(text)) return { viewMode: 'lineage' satisfies ViewMode };
  return {};
}

function boardItemOf(key: string, entry: GroupPriceEntry, brand: string): BoardItem {
  return {
    key, sel: entry.sel, brand,
    usd: entry.price.usd, local: entry.price.local, period: entry.price.period,
    points: entry.price.points, dropped: entry.price.dropped.map((point) => point.usd), band: entry.tier,
  };
}

/** 一句话 → 可预览的筛选补丁（确定性，无模型调用，不写状态） */
export function parseFilterIntent(text: string, state: FiltersState): IntentResult {
  const trimmed = text.trim();
  const notes: string[] = [];
  const isQuestion = QUESTION_RE.test(trimmed);
  if (!trimmed) return { patch: {}, notes, isQuestion: false, structured: false };

  const patch: FilterPatch = { ...buildFilterPatch(trimmed, state) };
  const entities = resolveAgentEntities(trimmed, state);
  const countryCode = patch.countryCode ?? state.countryCode;
  const industry = state.industry;
  const meta = modelMetaIndex();
  const ownBrands = new Set([...meta.values()].filter((item) => item.isOwn).map((item) => item.brand));
  const mentioned = brandsMentioned(trimmed, industry);
  // 点名产品自身的品牌（如「iPhone 17 同档」里的 Apple）不算竞品限定
  const resolvedBrands = new Set(entities.selections.map((sel) => meta.get(sel.modelId)?.brand).filter((brand): brand is string => Boolean(brand)));
  const competitorBrands = new Set([...mentioned].filter((brand) => !ownBrands.has(brand) && !resolvedBrands.has(brand)));
  const brandOk = (brand: string): boolean => !competitorBrands.size || competitorBrands.has(brand);

  const wantsSameTier = SAME_TIER_RE.test(trimmed);
  const wantsPrevGen = PREV_GEN_RE.test(trimmed);
  const productResolved = entities.explicitProduct && entities.selections.length > 0;
  const band = productResolved ? null : tierBandOfText(trimmed, industry);
  let structured = entities.productLabels.length >= 2;

  let byGroup: Map<string, GroupPriceEntry> | null = null;
  const prices = (): Map<string, GroupPriceEntry> => (byGroup ??= currentPricesByGroup(industry, countryCode));

  let mains: MainProduct[] | undefined = patch.mains;

  // ── 无产品的档位词：该档我司组逐组成卡 + 同档竞品按最近价分配 ──
  if (band === '') notes.push('未识别的价格档位');
  if (band) {
    const bandLabel = tierBandsOf(industry).find((item) => item.code === band)?.label ?? band;
    notes.push(`档位按现价落档 · ${bandLabel}`);
    const anchors: BoardItem[] = [];
    const others: BoardItem[] = [];
    for (const [key, entry] of prices()) {
      if (entry.tier !== band) continue;
      const info = meta.get(entry.sel.modelId);
      if (!info) continue;
      if (info.isOwn) anchors.push(boardItemOf(key, entry, info.brand));
      // 只点名我司品牌（如「华为旗舰」）= 只看我司；点名竞品品牌 = 只带这些品牌；都没点名 = 同档全部竞品
      else if (competitorBrands.size ? competitorBrands.has(info.brand) : !mentioned.size) others.push(boardItemOf(key, entry, info.brand));
    }
    const byPrice = (a: BoardItem, b: BoardItem): number => (b.usd ?? 0) - (a.usd ?? 0) || a.key.localeCompare(b.key);
    anchors.sort(byPrice);
    others.sort(byPrice);
    if (!anchors.length) {
      notes.push('该档位暂无我司产品');
    } else {
      mains = cardsFromBoard(anchors, others).map(({ main, compares }) => {
        const card: MainProduct = { id: newCardId(), main, compares: [], auto: false };
        return compares.length ? withComparesAdded(card, compares, 'tier') : card;
      });
      structured = true;
    }
  }

  // 同档 / 上一代没有点名产品也没有档位词时，沿用当前看板主品
  if (!mains && !band && (wantsSameTier || wantsPrevGen) && state.mains.some((card) => card.main)) {
    mains = state.mains;
    notes.push('沿用当前主分析产品');
  }

  // ── 同档：每张卡按主品现价落档，同档其他品牌每品牌取 USD 最接近的一款 ──
  if (wantsSameTier && mains && !band) {
    let anyNoPrice = false;
    mains = mains.map((card) => {
      if (!card.main) return card;
      const own = prices().get(groupKeyOf(card.main));
      const ownBrand = meta.get(card.main.modelId)?.brand;
      if (!own?.tier || own.price.usd == null) {
        anyNoPrice = true;
        return card;
      }
      const best = new Map<string, { sel: ProductSelection; diff: number }>();
      for (const entry of prices().values()) {
        if (entry.tier !== own.tier || entry.price.usd == null) continue;
        const brand = meta.get(entry.sel.modelId)?.brand;
        if (!brand || brand === ownBrand || !brandOk(brand)) continue;
        const diff = Math.abs(entry.price.usd - own.price.usd);
        const prev = best.get(brand);
        if (!prev || diff < prev.diff - 1e-9 || (Math.abs(diff - prev.diff) <= 1e-9 && selKey(entry.sel) < selKey(prev.sel))) best.set(brand, { sel: entry.sel, diff });
      }
      const picks = [...best.values()].sort((a, b) => a.diff - b.diff).map((item) => item.sel);
      const base: MainProduct = { id: newCardId(), main: card.main, compares: [], auto: false };
      return picks.length ? withComparesAdded(base, picks, 'tier') : base;
    });
    notes.push('档位按现价落档 · 每个品牌取价格最接近的一款');
    if (anyNoPrice) notes.push('部分主品暂无现价，未匹配同档');
    if (competitorBrands.size) notes.push(`只看 ${[...competitorBrands].map(brandLabelOf).join('、')}`);
    structured = true;
  }

  // ── 上一代：数据包 prevGen 映射带出（来源 manual） ──
  if (wantsPrevGen && mains) {
    const missing = new Set<string>();
    let added = false;
    mains = mains.map((card) => {
      if (!card.main) return card;
      const result = groupsFromPrevGeneration([card.main]);
      result.missing.forEach((name) => missing.add(name));
      if (!result.added.length) return card;
      added = true;
      return withComparesAdded(card, result.added, 'manual');
    });
    const names = [...missing];
    if (names.length) notes.push(`数据包未登记 ${names.slice(0, 3).join('、')}${names.length > 3 ? ` 等 ${names.length} 款` : ''} 的上一代配置`);
    // 显式要求上一代即属结构化意图：即便没带出，也要让预览露出缺口说明
    if (added || names.length) structured = true;
  }

  // 沿用当前主品且无任何改动 = 不写 mains
  if (mains && mains !== state.mains) patch.mains = tidyMains(mains);

  const view = viewOfText(trimmed, state);
  if (view.viewMode) {
    Object.assign(patch, view);
    structured = true;
  }

  return { patch, notes: [...new Set(notes)], isQuestion, structured };
}
