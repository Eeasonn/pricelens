// ============================================================
// 按档位选择看板纯模型（2026-11-27 二轮改版 · 2026-11-28 二版「一行一款」）：
// 把「同国同产业全部组的现价落档」组织成每品牌一列的勾选板。口径与规则：
// · 现价与落档 = dataModel/tierPrice（最新有价期全渠道价格点，剔除低于均值 30%
//   的异常低价后取最低，USD 口径落 tierBandsOf 阶梯）；
// · 行单位 = 型号（一款一行），型号下挂全部配置（compareRomram 序）；
//   起售配置 = 有现价配置里 USD 最低者（并列取配置序靠前）——行的位置 / 排序 /
//   分段一律按起售配置，用户勾选或换配置都不挪行；全部配置无现价的型号进底部
//   「暂无现价」段（不穿插）；
// · 列 = 当前国家+产业有组的品牌，品牌顺序 = 选择产品树 fullTree 顺序；
//   锚定品牌恒在最左列；段内行序 = 起售 USD 降序、同价按型号名；
// · 蓝框提示（只是提示，不自动勾选）：hintOf 判单个配置（同档 / 相邻档 / 无），
//   bestConfigHint 在型号全部配置里取最优（同档 > 相邻档；同级取 |USD − 最近锚价|
//   最小，再并列取起售配置、配置序）；
// · 显示配置 = ①用户显式选择（配置 chip 换配置 / 勾选时锁定）②非锚行且锚已勾：
//   最优提示所在配置 ③起售配置；
// · chip 提示（chipHintOf）：显示配置 ≠ 起售且非显式选择时 chip 挂同档 / 相邻档样式；
// · 应用（方案 A）：勾选的锚定型号逐行成一组（板上行序），非锚型号按所选配置
//   |USD 价差| 就近分配（cardsFromBoard）。
// 不依赖 currentPricesByGroup 的 Map 键格式：一律取 entry.sel / price / tier，
// 型号与配置的比较走 selKey（mainSelection 同一归一）。
// 无副作用、无 React；事实表索引在 dataModel/tierPrice 内按调用现算（不缓存）。
// ============================================================
import type { Industry } from '../../dataModel/types';
import { tierBandsOf } from '../../dataModel/aggregate';
import { neighborBands, type GroupPriceEntry } from '../../dataModel/tierPrice';
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';
import { selKey } from '../../state/mainSelection';
import { brandOfModel, compareRomram, modelNameOf } from '../ProductCascader/tree';

export type BoardHint = 'same' | 'adjacent' | null;

/** 型号下的一个配置：现价与落档取自批量裁定 */
export interface BoardConfig {
  sel: ProductSelection;
  /** selKey(sel)（空白归一的组键，比较 / 状态存储用） */
  selKey: string;
  /** 现价 USD（tierPrice 口径）；null = 暂无现价 */
  usd: number | null;
  /** 现价本币（同一行）；null 同上 */
  local: number | null;
  /** 取价期（周 id / ZA 月 id）；无价 = null */
  period: string | null;
  /** 最新期价格点数（tooltip「N 个价格点」用） */
  points: number;
  /** 被剔除的异常低价（USD 列表，tooltip 展示用） */
  dropped: number[];
  /** 现价落档；null = 暂无现价（不参与分段与蓝框提示） */
  band: string | null;
}

/** 看板行：一款型号一行，挂全部配置 */
export interface BoardModel {
  modelId: string;
  brand: string;
  name: string;
  /** compareRomram 序（存储升 → 内存升 → 文本） */
  configs: BoardConfig[];
  /** 起售配置的 selKey（有价配置 USD 最低；全无价 = 首个配置） */
  entryKey: string;
  /** 起售配置落档；null = 全部配置暂无现价 */
  startBand: string | null;
  startUsd: number | null;
}

/** 档位分段（列内）：band null = 无现价段（恒在最后） */
export interface BoardSection {
  band: string | null;
  models: BoardModel[];
}

export interface BoardColumn {
  brand: string;
  anchor: boolean;
  /** 分段按起售落档从高到低；无现价段在最后 */
  sections: BoardSection[];
  /** 型号数（列头「N 款」） */
  count: number;
}

/** 旧版逐配置行（agent-stable/intentFilter 仍以此形状调 cardsFromBoard，保留兼容） */
export interface BoardItem {
  key: string;
  sel: ProductSelection;
  brand: string;
  usd: number | null;
  local: number | null;
  period: string | null;
  points: number;
  dropped: number[];
  band: string | null;
}

/** 档位阶梯序（tierBandsOf 定义序 = 从低到高）；未知档殿后 */
function bandRank(industry: Industry, band: string): number {
  const idx = tierBandsOf(industry).findIndex((b) => b.code === band);
  return idx >= 0 ? idx : 999;
}

/** 起售配置：有价配置里 USD 最低（并列 → 配置序靠前）；全无价 → 首个配置 */
export function startConfigOf(configs: readonly BoardConfig[]): BoardConfig {
  let best: BoardConfig | null = null;
  for (const c of configs) {
    if (c.usd == null) continue;
    if (!best || c.usd < (best.usd as number) - 1e-9) best = c;
  }
  return best ?? configs[0];
}

export function configByKey(model: BoardModel, key: string | undefined): BoardConfig | undefined {
  return key ? model.configs.find((c) => c.selKey === key) : undefined;
}

export function startConfig(model: BoardModel): BoardConfig {
  return configByKey(model, model.entryKey) ?? model.configs[0];
}

/** 组建看板列（纯函数）：
 *  byGroup = currentPricesByGroup 结果；dataKeys = 该国有数据（financing-aware）组的
 *  selKey 集；brandOrder = fullTree 品牌序；anchorBrand 提到最左列。
 *  一款一行；分段 = 起售落档从高到低 + 无现价段；段内起售 USD 降序。 */
export function buildBoardColumns(
  byGroup: ReadonlyMap<string, GroupPriceEntry>,
  dataKeys: ReadonlySet<string>,
  brandOrder: readonly string[],
  anchorBrand: string,
  industry: Industry,
): BoardColumn[] {
  // ① 配置归入型号（同 selKey 去重：防键格式差异导致的重复）
  const byModel = new Map<string, Map<string, BoardConfig>>();
  for (const entry of byGroup.values()) {
    const key = selKey(entry.sel);
    if (!dataKeys.has(key)) continue;
    const cfg: BoardConfig = {
      sel: entry.sel,
      selKey: key,
      usd: entry.price.usd,
      local: entry.price.local,
      period: entry.price.period,
      points: entry.price.points,
      dropped: entry.price.dropped.map((p) => p.usd),
      band: entry.tier,
    };
    const configs = byModel.get(entry.sel.modelId) ?? new Map<string, BoardConfig>();
    if (!configs.has(key)) configs.set(key, cfg);
    byModel.set(entry.sel.modelId, configs);
  }
  // ② 型号行
  const byBrand = new Map<string, BoardModel[]>();
  for (const [modelId, cfgMap] of byModel) {
    const configs = [...cfgMap.values()].sort((a, b) => compareRomram(a.sel.romram, b.sel.romram));
    const start = startConfigOf(configs);
    const model: BoardModel = {
      modelId,
      brand: brandOfModel(modelId),
      name: modelNameOf(modelId),
      configs,
      entryKey: start.selKey,
      startBand: start.usd != null ? start.band : null,
      startUsd: start.usd,
    };
    const list = byBrand.get(model.brand);
    if (list) list.push(model);
    else byBrand.set(model.brand, [model]);
  }
  // ③ 品牌序 = brandOrder 出现序；未登记品牌按字母序殿后。锚定品牌恒最左。
  const rank = new Map(brandOrder.map((b, i) => [b, i] as const));
  const brands = [...byBrand.keys()].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999) || a.localeCompare(b));
  const ordered = anchorBrand && brands.includes(anchorBrand)
    ? [anchorBrand, ...brands.filter((b) => b !== anchorBrand)]
    : brands;
  const byName = (a: BoardModel, b: BoardModel): number =>
    a.name.localeCompare(b.name, undefined, { numeric: true }) || a.modelId.localeCompare(b.modelId);
  return ordered.map((brand) => {
    const models = byBrand.get(brand) ?? [];
    const sections = new Map<string | null, BoardModel[]>();
    for (const m of models) {
      const list = sections.get(m.startBand);
      if (list) list.push(m);
      else sections.set(m.startBand, [m]);
    }
    const priced = [...sections.entries()]
      .filter(([band]) => band != null)
      .sort((a, b) => bandRank(industry, b[0] as string) - bandRank(industry, a[0] as string))
      .map(([band, list]) => ({
        band,
        models: list.sort((a, b) => (b.startUsd as number) - (a.startUsd as number) || byName(a, b)),
      }));
    const noPrice = sections.get(null);
    return {
      brand,
      anchor: brand === anchorBrand,
      sections: noPrice ? [...priced, { band: null, models: noPrice.sort(byName) }] : priced,
      count: models.length,
    };
  });
}

/** 蓝框提示（单个配置，纯函数）：
 *  'same' = 档位 ∈ 锚档位集；'adjacent' = 不在锚档位集、但是某锚档位 ±1 档；
 *  null = 无现价或与锚档位无关。重叠 → 'same'（同档优先）。 */
export function hintOf(
  itemBand: string | null,
  anchorBands: ReadonlySet<string>,
  industry: Industry,
): BoardHint {
  if (itemBand == null || anchorBands.size === 0) return null;
  if (anchorBands.has(itemBand)) return 'same';
  for (const anchor of anchorBands) {
    const { lower, upper } = neighborBands(industry, anchor);
    if (itemBand === lower || itemBand === upper) return 'adjacent';
  }
  return null;
}

/** 锚上下文：已勾锚定型号所选配置的档位集与 USD 价集 */
export interface AnchorContext {
  bands: ReadonlySet<string>;
  prices: readonly number[];
  industry: Industry;
}

const nearestGap = (usd: number | null, prices: readonly number[]): number => {
  if (usd == null || prices.length === 0) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (const p of prices) best = Math.min(best, Math.abs(usd - p));
  return best;
};

/** 型号的最优提示（纯函数）：在全部配置里取 同档 > 相邻档；同级取 |USD − 最近锚价|
 *  最小；再并列 → 起售配置优先、否则配置序靠前。无任何提示 → { null, 起售配置 }。 */
export function bestConfigHint(
  model: BoardModel,
  anchorBands: ReadonlySet<string>,
  anchorPrices: readonly number[],
  industry: Industry,
): { hint: BoardHint; config: BoardConfig } {
  const start = startConfig(model);
  let best: { hint: BoardHint; config: BoardConfig; score: number; gap: number } | null = null;
  // 起售配置先评，并列时保持领先
  const order = [start, ...model.configs.filter((c) => c !== start)];
  for (const config of order) {
    const hint = hintOf(config.band, anchorBands, industry);
    if (!hint) continue;
    const score = hint === 'same' ? 2 : 1;
    const gap = nearestGap(config.usd, anchorPrices);
    if (!best || score > best.score || (score === best.score && gap < best.gap - 1e-9)) {
      best = { hint, config, score, gap };
    }
  }
  return best ? { hint: best.hint, config: best.config } : { hint: null, config: start };
}

/** 显示配置（纯函数）：①显式选择 ②锚上下文下最优提示所在配置 ③起售配置 */
export function displayedConfig(model: BoardModel, explicit: string | undefined, anchors: AnchorContext | null): BoardConfig {
  const chosen = configByKey(model, explicit);
  if (chosen) return chosen;
  if (anchors && anchors.bands.size > 0) {
    const best = bestConfigHint(model, anchors.bands, anchors.prices, anchors.industry);
    if (best.hint) return best.config;
  }
  return startConfig(model);
}

/** 行视图（纯函数）：显示配置 + 该行提示。锚列行 / 无锚上下文 → 无提示；
 *  有显式选择时提示按所选配置判（所见即应用）；否则按全部配置最优。 */
export function rowViewOf(
  model: BoardModel,
  explicit: string | undefined,
  anchors: AnchorContext | null,
  isAnchorColumn: boolean,
): { config: BoardConfig; hint: BoardHint } {
  if (isAnchorColumn || !anchors || anchors.bands.size === 0) {
    return { config: displayedConfig(model, explicit, null), hint: null };
  }
  const chosen = configByKey(model, explicit);
  if (chosen) return { config: chosen, hint: hintOf(chosen.band, anchors.bands, anchors.industry) };
  const best = bestConfigHint(model, anchors.bands, anchors.prices, anchors.industry);
  return { config: best.hint ? best.config : startConfig(model), hint: best.hint };
}

/** chip 提示样式（纯函数，2026-11-28 三版）：行停在起售档、却显示了更贵 / 更便宜的
 *  提示配置时，chip 自己挂同档 / 相邻档样式，说明「是这个配置匹配上了」。
 *  null = 无锚上下文 / 用户显式选择（含勾选锁定）/ 显示配置就是起售配置 / 显示配置无提示。
 *  锚列调用方传 anchors = null。 */
export function chipHintOf(
  model: BoardModel,
  displayed: BoardConfig,
  explicit: string | undefined,
  anchors: AnchorContext | null,
): BoardHint {
  if (!anchors || anchors.bands.size === 0) return null;
  if (configByKey(model, explicit)) return null;
  if (displayed.selKey === model.entryKey) return null;
  return hintOf(displayed.band, anchors.bands, anchors.industry);
}

/** 看板列宽（2026-11-28 四轮：264 → 288 / min 272——「iPhone 18 Pro Max」「Pura 90s
 *  Pro Max」级别的型号名完整不截断） */
export const BOARD_COL_W = 288;
export const BOARD_COL_MIN_W = 272;

/** 看板勾选草稿：checked = 已勾型号 id；chosen = 型号 id → 显式选择的配置 selKey */
export interface BoardDraft {
  checked: ReadonlySet<string>;
  chosen: ReadonlyMap<string, string>;
}

const allModels = (columns: readonly BoardColumn[]): Array<{ col: BoardColumn; model: BoardModel }> =>
  columns.flatMap((col) => col.sections.flatMap((s) => s.models.map((model) => ({ col, model }))));

/** 初始草稿（纯函数）：mains 中出现过的任一配置（主品或对比）→ 该型号勾选、
 *  显式选择 = 该配置（同型号多配置在册取先出现者）。 */
export function initialDraft(columns: readonly BoardColumn[], mains: readonly MainProduct[]): BoardDraft {
  const owner = new Map<string, { modelId: string; key: string }>();
  for (const { model } of allModels(columns)) {
    for (const c of model.configs) owner.set(c.selKey, { modelId: model.modelId, key: c.selKey });
  }
  const checked = new Set<string>();
  const chosen = new Map<string, string>();
  for (const card of mains) {
    for (const sel of [...(card.main ? [card.main] : []), ...card.compares]) {
      const hit = owner.get(selKey(sel));
      if (!hit || checked.has(hit.modelId)) continue;
      checked.add(hit.modelId);
      chosen.set(hit.modelId, hit.key);
    }
  }
  return { checked, chosen };
}

/** 锚上下文（纯函数）：锚列已勾型号的所选（显示）配置 */
export function anchorContextOf(columns: readonly BoardColumn[], draft: BoardDraft, industry: Industry): AnchorContext {
  const bands = new Set<string>();
  const prices: number[] = [];
  for (const { col, model } of allModels(columns)) {
    if (!col.anchor || !draft.checked.has(model.modelId)) continue;
    const cfg = displayedConfig(model, draft.chosen.get(model.modelId), null);
    if (cfg.band) bands.add(cfg.band);
    if (cfg.usd != null) prices.push(cfg.usd);
  }
  return { bands, prices, industry };
}

/** 勾选 / 取消（纯函数）：勾上 = 锁定当下显示配置为显式选择（此后锚变化不漂移） */
export function toggleModel(
  draft: BoardDraft,
  model: BoardModel,
  on: boolean,
  shown: BoardConfig,
): BoardDraft {
  const checked = new Set(draft.checked);
  const chosen = new Map(draft.chosen);
  if (on) {
    checked.add(model.modelId);
    chosen.set(model.modelId, shown.selKey);
  } else {
    checked.delete(model.modelId);
  }
  return { checked, chosen };
}

/** 「按提示全选同档」（纯函数）：非锚列未勾型号中行提示 = 同档者全部勾上，
 *  并锁定到匹配的配置；已勾型号与锚列不动。 */
export function checkAllSameDraft(columns: readonly BoardColumn[], draft: BoardDraft, anchors: AnchorContext): BoardDraft {
  const checked = new Set(draft.checked);
  const chosen = new Map(draft.chosen);
  for (const { col, model } of allModels(columns)) {
    if (col.anchor || checked.has(model.modelId)) continue;
    const view = rowViewOf(model, chosen.get(model.modelId), anchors, false);
    if (view.hint !== 'same') continue;
    checked.add(model.modelId);
    chosen.set(model.modelId, view.config.selKey);
  }
  return { checked, chosen };
}

/** 应用前收集（纯函数）：锚列已勾型号（板上行序）与非锚已勾型号的所选配置 */
export function boardPicks(
  columns: readonly BoardColumn[],
  draft: BoardDraft,
  anchors: AnchorContext,
): { anchors: BoardConfig[]; others: BoardConfig[] } {
  const a: BoardConfig[] = [];
  const o: BoardConfig[] = [];
  for (const { col, model } of allModels(columns)) {
    if (!draft.checked.has(model.modelId)) continue;
    const view = rowViewOf(model, draft.chosen.get(model.modelId), anchors, col.anchor);
    (col.anchor ? a : o).push(view.config);
  }
  return { anchors: a, others: o };
}

/** 应用组装（方案 A，纯函数）：勾选的锚逐个成组（调用方按板上行序传入），
 *  非锚项分配给 |USD 价差| 最小的锚；并列 → 靠前的锚；项无现价或全部锚无现价
 *  → 第一个锚。返回顺序 = anchors 顺序；compare 顺序 = 分配顺序。 */
export function cardsFromBoard<T extends { sel: ProductSelection; usd: number | null }>(
  anchors: readonly T[],
  others: readonly T[],
): Array<{ main: ProductSelection; compares: ProductSelection[] }> {
  return anchors.map((anchor, ai) => {
    const compares: ProductSelection[] = [];
    for (const item of others) {
      let target = 0;
      if (item.usd != null && anchors.some((a) => a.usd != null)) {
        let best = Number.POSITIVE_INFINITY;
        anchors.forEach((a, i) => {
          if (a.usd == null) return;
          const d = Math.abs((item.usd as number) - a.usd);
          if (d < best - 1e-9) {
            best = d;
            target = i;
          }
        });
      }
      if (target === ai) compares.push(item.sel);
    }
    return { main: anchor.sel, compares };
  });
}
