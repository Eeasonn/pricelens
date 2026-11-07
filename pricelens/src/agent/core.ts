import { buildSeries, defaultChannelOf, effectiveLinePlatform, lowestPriceColorSku, lowestPriceColorSkuAnyChannel, platformPriceSpreadOfSelection, platformScopeLabel, platformSelectionForCountry, pricedChannelIdsOfSelection } from '../dataModel/aggregate';
import { dimChannel, dimProduct, dimRegion, dimTime } from '../data';
import { buildCards, clampMains, flatSelections, normalizeSelectionForCountry, remapSelectionForCountry, selKey } from '../state/mainSelection';
import type { FiltersState, MainProduct, ProductSelection } from '../state/filtersTypes';
import type { SeriesQuery } from '../dataModel/types';
import type { AgentAlertRecord, AgentContextSnapshot, AgentIntent, AgentResponse, AgentResultCard, AgentStep, AgentSuggestionAction, AlertListResultCard, FilterResultCard, FilterPatch, ForecastContextInput } from './contracts';
import { contextFingerprint } from './contracts';
import { BASELINE_DRAFT, type ForecastDataset, type ScenarioDraft } from '../pages/forecast/forecastModel';
import type { ForecastDraftInput } from './contracts';
import { simpleDemoDataset as forecastFixture } from '../pages/forecast/forecastDatasetRegistry';
import { createForecastSnapshot, type ForecastSnapshot } from '../pages/forecast/forecastSnapshot';
import { provenanceSummary } from '../dataModel/provenance';
import { buildPriceAdvantageResult, platformCountryFallbackNote, priceAdvantageCountryFallbackNote, stateForPriceAdvantageCountry } from './priceAdvantage';
export { buildPriceAdvantageResult, platformCountryFallbackNote, priceAdvantageCountryFallbackNote, stateForPriceAdvantageCountry } from './priceAdvantage';

const id = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase();
const compact = (s: string): string => s.toLocaleLowerCase().replace(/[\s_\-]+/g, '').replace(/[’']/g, '');

// ---------------- R3-M2：显式配置（ROM+RAM）省单位/空格变体解析 ----------------
// 「12+256」「12 + 256」「12+256 GB」「12 + 256GB」「12＋256」统一归一为数字对，
// 与配置名（如「12+256 GB」「M2 8-core CPU 16-core 8+256 GB」内嵌的 8+256）
// 组件级精确等价：RAM、ROM 都相等才算点名（12+256 ≠ 12+2560 ≠ 8+256）。
// 只认「数字+数字」形态，不把纯数字/型号数字当配置；文本里的全部数字对都算
// 显式提及（含多个配置，如「12+256 和 12+512」）。
const CONFIG_PAIR_RE = /(\d{1,4})\s*[+＋]\s*(\d{1,5})/g;

function configPairsOf(source: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const match of source.matchAll(CONFIG_PAIR_RE)) {
    const pair: [number, number] = [Number(match[1]), Number(match[2])];
    if (!out.some(([ram, rom]) => ram === pair[0] && rom === pair[1])) out.push(pair);
  }
  return out;
}

/** 文本里点名的显式配置数字对（RAM, ROM），去重保序 */
export function configPairsOfText(text: string): Array<[number, number]> {
  return configPairsOf(text);
}

/** 配置名内嵌的全部「RAM+ROM」数字对（平板长配置名取内嵌对，如
 *  「M2 8-core CPU 16-core 8+256 GB」→ [(8,256)]；非配置形（「—」/纯数字）→ []） */
function romramPairsOf(romram: string): Array<[number, number]> {
  return configPairsOf(romram);
}

const COUNTRY_ALIASES: Record<string, string> = {
  巴西: 'BR', 中国: 'CN', 俄罗斯: 'RU', 俄国: 'RU', 美国: 'US', 英国: 'GB',
  R国: 'RU',
  法国: 'FR', 德国: 'DE', 西班牙: 'ES', 意大利: 'IT', 土耳其: 'TR', 墨西哥: 'MX',
  沙特: 'SA', 沙特阿拉伯: 'SA', 阿联酋: 'AE', 阿拉伯联合酋长国: 'AE',
  印度尼西亚: 'ID', 印尼: 'ID', 马来西亚: 'MY', 新加坡: 'SG', 泰国: 'TH',
  越南: 'VN', 南非: 'ZA', 菲律宾: 'PH', 波兰: 'PL', 罗马尼亚: 'RO',
};

interface ProductEntity {
  modelId: string;
  modelName: string;
  brand: string;
  industry: string;
  rows: typeof dimProduct;
  /** 本实体在文本中被命中的最长前缀（紧凑形式） */
  matchedPrefix: string;
  /** 命中前缀即完整型号紧凑名（说「nova 14」指 nova 14，不是 nova 14 Pro） */
  exact: boolean;
  /** 未被更长前缀遮蔽的出现段（紧凑坐标 [start, end)）——配置就近归属的锚点 */
  spans: Array<[number, number]>;
}

/** R5（四审 M1 · 实体配置归属与长短实体消歧）：
 *  旧缺陷有两处——① selectionsForEntity 对每个实体读整句 configPairsOfText，
 *  多实体问句里配置对广播到所有实体（“nova 14 12+256 和 Mate X6 12+512”给
 *  nova 14 混进 12+512 的 370/DNS）；② 实体按全句最高分筛选，“nova 14 … 和
 *  nova 14 Pro …”丢短实体、“nova 14 Pro”内部又虚构 nova 14。
 *  修复口径：实体按其在文本中的真实出现位置消歧——同一起点只保留最长前缀
 *  （nova 14 Pro 文本里 nova 14 的出现被遮蔽，不从子串虚构短实体；等长时完整
 *  型号优先）；nova 14 与 nova 14 Pro 分别明确出现（各有未遮蔽段）时两者都
 *  保留。配置对与完整配置名都只在本实体的出现段内就近归属（优先最近的前置
 *  实体段），每实体独立解析点名配置；归属到本实体但目标国无此配置 →
 *  missingConfigs 如实披露，不静默扩大、不用页面配置替答。 */

/** compact(text) 的逐字符索引版：chars[i] 是紧凑字符、orig[i] 是其原文下标——
 *  把实体出现段（紧凑坐标）与配置对（原文坐标）放进可比的坐标系。 */
function compactIndex(text: string): { chars: string[]; orig: number[] } {
  const chars: string[] = [];
  const orig: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const lowered = text[i].toLocaleLowerCase();
    for (const ch of lowered) {
      if (/[\s_\-’']/.test(ch)) continue;
      chars.push(ch);
      orig.push(i);
    }
  }
  return { chars, orig };
}

/** 原文里的显式配置对出现（带位置，供就近归属） */
function configPairOccurrences(text: string): Array<{ pair: [number, number]; start: number; end: number }> {
  const out: Array<{ pair: [number, number]; start: number; end: number }> = [];
  for (const match of text.matchAll(CONFIG_PAIR_RE)) {
    const start = match.index ?? 0;
    out.push({ pair: [Number(match[1]), Number(match[2])], start, end: start + match[0].length });
  }
  return out;
}

function productEntitiesOfText(text: string, industry: FiltersState['industry']): {
  entities: ProductEntity[];
  haystack: string;
  index: { chars: string[]; orig: number[] };
} {
  const { chars, orig } = compactIndex(text);
  const haystack = chars.join('');
  const groups = new Map<string, { modelId: string; modelName: string; brand: string; industry: string; rows: typeof dimProduct; prefixes: string[] }>();
  for (const row of dimProduct) {
    const existing = groups.get(row.model_id);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(row.model_id, { modelId: row.model_id, modelName: row.model_name, brand: row.brand, industry: row.industry, rows: [row], prefixes: modelPrefixes(row.model_name) });
  }
  const candidates: ProductEntity[] = [];
  for (const group of groups.values()) {
    if (group.industry !== industry) continue;
    const matched = group.prefixes.find((prefix) => haystack.includes(prefix));
    if (!matched) continue;
    const entity: ProductEntity = { modelId: group.modelId, modelName: group.modelName, brand: group.brand, industry: group.industry, rows: group.rows, matchedPrefix: matched, exact: matched === compact(group.modelName), spans: [] };
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(matched, from);
      if (at < 0) break;
      entity.spans.push([at, at + matched.length]);
      from = at + 1;
    }
    candidates.push(entity);
  }
  // 同一起点只保留最长命中（等长时完整全名优先）：长实体遮蔽内部子串出现，
  // 各自有独立出现段的实体全部保留（不再按全句最高分丢实体）
  const rankAt = new Map<number, number>();
  for (const entity of candidates) {
    for (const [start, end] of entity.spans) {
      const rank = (end - start) * 2 + (entity.exact ? 1 : 0);
      if (rank > (rankAt.get(start) ?? -1)) rankAt.set(start, rank);
    }
  }
  const entities = candidates
    .map((entity) => ({ ...entity, spans: entity.spans.filter(([start, end]) => rankAt.get(start) === (end - start) * 2 + (entity.exact ? 1 : 0)) }))
    .filter((entity) => entity.spans.length > 0);
  return { entities, haystack, index: { chars, orig } };
}

/** 实体某出现段的配置点名窗口：本实体出现起点 → 下一个实体出现段开头——
 *  完整配置名只有紧跟在本实体名之后（到下一实体为止）才算本实体点名（不再
 *  整句广播；实体名之前的配置由数字对就近归属路径处理） */
function nameWindowOf(span: [number, number], allSpans: Array<[number, number]>, haystackLength: number): [number, number] {
  let end = haystackLength;
  for (const [s] of allSpans) {
    if (s >= span[1] && s < end) end = s;
  }
  return [span[0], end];
}
export interface AgentEntityResolution {
  countryCode: string;
  countryName: string;
  explicitCountry: boolean;
  explicitProduct: boolean;
  productLabels: string[];
  selections: ProductSelection[];
  unavailableProducts: string[];
  /** R3-M2（三审）：文本显式点名、但该型号在目标国没有任何在架配置命中的
   *  配置（如「nova 14 8+256」——RU 只有 12+256/12+512）。如实披露，不用
   *  页面当前配置或其他配置冒充已按请求查询。 */
  missingConfigs: string[];
}

function modelPrefixes(modelName: string): string[] {
  const words = modelName.split(/\s+/).filter(Boolean);
  const out = new Set<string>([compact(modelName)]);
  // 允许用户说“Pura 90s”来指代“Pura 90s Pro/Pro Max”，但保留完整型号优先级。
  for (let i = words.length - 1; i >= 2; i -= 1) out.add(compact(words.slice(0, i).join(' ')));
  return [...out].filter((value) => value.length >= 4).sort((a, b) => b.length - a.length);
}

function knownEntityInText(text: string): boolean {
  const haystack = compact(text);
  if (Object.keys(COUNTRY_ALIASES).some((alias) => haystack.includes(compact(alias)))) return true;
  if (/(?:^|[^a-z])(BR|CN|RU|US|GB|FR|DE|ES|IT|TR|MX|SA|AE|ID|MY|SG|TH|VN|ZA|PH|PL|RO)(?:$|[^a-z])/i.test(text)) return true;
  const byModel = new Map<string, string>();
  for (const row of dimProduct) byModel.set(row.model_id, row.model_name);
  return [...byModel.values()].some((name) => modelPrefixes(name).some((prefix) => haystack.includes(prefix)));
}

function countryOfText(text: string, fallback: string): { code: string; explicit: boolean } {
  const haystack = compact(text);
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) if (haystack.includes(compact(alias))) return { code, explicit: true };
  const byName = dimRegion.find((region) => haystack.includes(compact(region.country_name)));
  if (byName) return { code: byName.country_code, explicit: true };
  const code = text.match(/(?:^|[^a-z])(BR|CN|RU|US|GB|FR|DE|ES|IT|TR|MX|SA|AE|ID|MY|SG|TH|VN|ZA|PH|PL|RO)(?:$|[^a-z])/i)?.[1];
  return code ? { code: code.toUpperCase(), explicit: true } : { code: fallback, explicit: false };
}

/** R3（M2 · 透明渠道回退）：目标国默认电渠对该型号配置全程无价格事实、但其他
 *  在架渠道有真实价格时（真实事实：FR Mate X6 12+512 仅 Amazon 3P 有
 *  202638–202642 五条事实，默认 Amazon 1P 无价），解析出的选择逐线钉到有价
 *  渠道（店铺级并集，取数口径点名实际渠道如 "Amazon 3P"，数值与自动口径一致
 *  ——无价渠道本就不参与每周最低）。默认电渠有价 / 选择已带每线口径 = 原样，
 *  不动用户显式口径。 */
function defaultChannelFallbackSelection(sel: ProductSelection, countryCode: string): ProductSelection {
  if (sel.platform) return sel;
  if (lowestPriceColorSku(sel.modelId, sel.romram, countryCode) != null) return sel;
  const channelIds = pricedChannelIdsOfSelection(sel, countryCode);
  if (!channelIds.length) return sel;
  return { ...sel, platform: { platforms: [], shopIds: channelIds, seller: null } };
}

/** 实体在目标国的解析选择（R3 · M1/M3；R3-M2 三审返修扩省单位/空格变体；
 *  R5 四审 M1 改为实体域配置解析）：
 *  - 配置严格遵循请求：文本点名了配置（完整名「12+256GB」或省单位/空格变体
 *    「12+256」「12 + 256」「12+256 GB」）→ 只解析点名配置，不再枚举该型号
 *    全部配置把未请求的 12+512 一并带上；数字对组件级精确（12+256 ≠
 *    12+2560），省单位提及绝不静默回落页面当前配置（12+512/370/DNS 冒充
 *    12+256 的旧缺陷）。R5 起「点名」= 归属到本实体的配置对 / 落在本实体
 *    出现段内的完整配置名（scope.boundPairs + scope.segments），多实体问句
 *    里其他实体的配置绝不广播到本实体。
 *  - 点名配置在目标国不存在（型号在架但该配置缺席）：不静默扩大到全部配置、
 *    不改用页面配置冒充——返回 missingConfigs 让上层如实说明「点名配置无在架
 *    数据」；该实体点名配置全部无效时整实体 unavailable（其他实体不受牵连）。
 *  - 页面已有合法选择优先复用（含每线取价口径 platform/shopIds/seller）：
 *    未点名配置时以页面当前该型号的合法选择为准（不扩大 mains）；点名配置
 *    与页面选择同组时同样复用原选择对象——显式型号查询不能把用户在价格页
 *    精选的每线 OZON 3P 口径洗成自动口径（395 混成 333）。
 *  - 跨国：复用选择的每线口径按目标国共享规则归一（normalizeSelectionForCountry，
 *    源国渠道在目标国不存在 → 该线回自动口径）；默认电渠无价时按
 *    defaultChannelFallbackSelection 透明钉到有价渠道。 */
function selectionsForEntity(
  entity: ProductEntity,
  countryCode: string,
  scope: { boundPairs: Array<[number, number]>; segments: Array<[number, number]>; haystack: string },
  existing: ProductSelection[],
): { selections: ProductSelection[]; available: boolean; missingConfigs: string[] } {
  const countryRows = entity.rows.filter((row) => row.countries.includes(countryCode));
  if (!countryRows.length) return { selections: [], available: false, missingConfigs: [] };
  const rows = countryRows.length ? countryRows : entity.rows;
  const romrams = [...new Set(countryRows.map((row) => row.romram))];
  // 点名配置对（就近归属到本实体）与完整配置名（本实体出现段内命中）；
  // 数字对按 (RAM, ROM) 组件级精确比较
  const romramPairs = new Map(romrams.map((romram) => [romram, romramPairsOf(romram)]));
  const pairMatches = (romram: string): boolean =>
    (romramPairs.get(romram) ?? []).some(([ram, rom]) => scope.boundPairs.some(([a, b]) => a === ram && b === rom));
  const nameMatches = (romram: string): boolean =>
    scope.segments.some(([start, end]) => scope.haystack.slice(start, end).includes(compact(romram)));
  const requested = romrams.filter((romram) => pairMatches(romram) || nameMatches(romram));
  // 归属到本实体、但该型号任何配置都不命中的显式配置对 → 如实缺失断言
  // （多实体下按位置归属可靠，不再因多实体而放弃披露）
  const unmatchedPairs = scope.boundPairs.filter((pair) => ![...romramPairs.values()].some((pairs) => pairs.some(([ram, rom]) => ram === pair[0] && rom === pair[1])));
  const missingConfigs = unmatchedPairs.map(([ram, rom]) => `${ram}+${rom}`);
  // 实体确实带了归属配置对 + 该型号任何配置都不匹配 → 点名配置在目标国不
  // 存在：如实缺失，不静默扩大到全部配置、不改用页面当前配置冒充
  if (scope.boundPairs.length && !requested.length) {
    return { selections: [], available: false, missingConfigs };
  }
  const existingOf = (romram: string): ProductSelection | undefined =>
    existing.find((sel) => sel.modelId === entity.modelId && norm(sel.romram) === norm(romram)
      && dimProduct.some((p) => p.model_id === sel.modelId && norm(p.romram) === norm(romram) && p.countries.includes(countryCode)
        && (sel.skuIds.length === 0 || sel.skuIds.includes(p.sku_id))));
  const freshOf = (romram: string): ProductSelection | null => {
    const configRows = rows.filter((row) => norm(row.romram) === norm(romram));
    const skuId = lowestPriceColorSku(entity.modelId, romram, countryCode)
      ?? lowestPriceColorSkuAnyChannel(entity.modelId, romram, countryCode)
      ?? configRows[0]?.sku_id;
    return skuId ? { modelId: entity.modelId, romram, skuIds: [skuId] } : null;
  };
  const build = (romram: string): ProductSelection | null => {
    const reused = existingOf(romram);
    return reused ? normalizeSelectionForCountry(reused, countryCode) : freshOf(romram);
  };
  if (requested.length) {
    return {
      selections: requested.map(build).filter((selection): selection is ProductSelection => selection != null)
        .map((selection) => defaultChannelFallbackSelection(selection, countryCode)),
      available: true,
      missingConfigs,
    };
  }
  // 未点名配置：页面已持有该型号合法选择 → 精确沿用（不扩大配置面）；否则按
  // 型号全部在架配置解析（原行为）
  const held = existing
    .filter((sel) => sel.modelId === entity.modelId && dimProduct.some((p) => p.model_id === sel.modelId
      && norm(p.romram) === norm(sel.romram) && p.countries.includes(countryCode)
      && (sel.skuIds.length === 0 || sel.skuIds.includes(p.sku_id))));
  if (held.length) {
    const seen = new Set<string>();
    const selections: ProductSelection[] = [];
    for (const sel of held) {
      const key = selKey(sel);
      if (seen.has(key)) continue;
      seen.add(key);
      selections.push(defaultChannelFallbackSelection(normalizeSelectionForCountry(sel, countryCode), countryCode));
    }
    return { selections, available: true, missingConfigs: [] };
  }
  return {
    selections: romrams.map(build).filter((selection): selection is ProductSelection => selection != null)
      .map((selection) => defaultChannelFallbackSelection(selection, countryCode)),
    available: true,
    missingConfigs: [],
  };
}

/** 从自然语言中解析国家和产品实体，供查询与筛选共用。
 *  R5（四审 M1）：实体出现位置消歧 + 配置对就近归属（见 productEntitiesOfText
 *  注释）——不再整句广播配置对、不再按全句最高分丢实体。 */
export function resolveAgentEntities(text: string, state: FiltersState): AgentEntityResolution {
  const country = countryOfText(text, state.countryCode);
  const { entities, haystack, index } = productEntitiesOfText(text, state.industry);
  // R3（M1）：实体解析带上页面现有选择（主品 + 对比区）——同型号合法选择连同
  // 每线取价口径一起复用，显式型号查询不把用户已钉的店铺口径洗掉
  const existing = selections(state);
  // 实体出现段映射回原文坐标（配置对在原文坐标系里做就近归属）
  const origSpans: Array<{ entity: ProductEntity; start: number; end: number }> = [];
  for (const entity of entities) {
    for (const span of entity.spans) {
      const spanStart = index.orig[span[0]] ?? 0;
      const spanEnd = (index.orig[span[1] - 1] ?? spanStart) + 1;
      origSpans.push({ entity, start: spanStart, end: spanEnd });
    }
  }
  // 配置对就近归属：优先归给最近的前置实体段（“nova 14 12+256 和 Mate X6
  // 12+512”两组配置各归各的实体，逆序同理）；无前置段时归最近的后续段；
  // 被实体段包含的极端形态归该实体。同一配置对多次出现可归不同实体。
  const boundPairs = new Map<ProductEntity, Array<[number, number]>>();
  for (const occurrence of configPairOccurrences(text)) {
    let target: ProductEntity | null = null;
    const preceders = origSpans.filter((span) => span.end <= occurrence.start);
    if (preceders.length) {
      target = preceders.reduce((best, cur) => (cur.end > best.end || (cur.end === best.end && cur.start > best.start) ? cur : best)).entity;
    } else {
      const followers = origSpans.filter((span) => span.start >= occurrence.end);
      if (followers.length) {
        target = followers.reduce((best, cur) => (cur.start < best.start ? cur : best)).entity;
      } else {
        target = origSpans.find((span) => span.start <= occurrence.start && occurrence.end <= span.end)?.entity ?? null;
      }
    }
    if (!target) continue;
    const list = boundPairs.get(target) ?? [];
    if (!list.some(([ram, rom]) => ram === occurrence.pair[0] && rom === occurrence.pair[1])) list.push(occurrence.pair);
    boundPairs.set(target, list);
  }
  const allCompactSpans = entities.flatMap((entity) => entity.spans);
  const resolvedSelections: ProductSelection[] = [];
  const unavailableProducts: string[] = [];
  const missingConfigs: string[] = [];
  for (const entity of entities) {
    const segments = entity.spans.map((span) => nameWindowOf(span, allCompactSpans, haystack.length));
    const resolved = selectionsForEntity(entity, country.code, { boundPairs: boundPairs.get(entity) ?? [], segments, haystack }, existing);
    if (!resolved.available) unavailableProducts.push(`${entity.brand} ${entity.modelName}${resolved.missingConfigs.length ? `（点名配置 ${resolved.missingConfigs.join('、')}）` : ''}`);
    for (const config of resolved.missingConfigs) {
      const label = `${entity.brand} ${entity.modelName} ${config}`;
      if (!missingConfigs.includes(label)) missingConfigs.push(label);
    }
    resolvedSelections.push(...resolved.selections);
  }
  return {
    countryCode: country.code,
    countryName: dimRegion.find((region) => region.country_code === country.code)?.country_name ?? country.code,
    explicitCountry: country.explicit,
    explicitProduct: entities.length > 0,
    productLabels: entities.map((entity) => `${entity.brand} ${entity.modelName}`),
    selections: resolvedSelections,
    unavailableProducts,
    missingConfigs,
  };
}

function step(tool: AgentStep['tool'], label: string, detail: string, status: AgentStep['status'] = 'success'): AgentStep {
  return { id: id('step'), tool, label, detail, status, durationMs: 18 };
}

export function classifyIntent(text: string): AgentIntent {
  if (/价格优势|价格对比|我司.*竞品.*价|竞品.*我司.*价/.test(text)) return 'price_advantage';
  if (/价格预警|预警列表|预警.*证据|预警.*看板/.test(text)) return 'price_alert';
  if (/预警|异常|阈值|触发原因|为什么.*变/.test(text)) return 'alert';
  if (/(?:量价预测|简单版预测|预测)/.test(text) && /解释|假设|证据|风险|不确定|为什么/.test(text)) return 'forecast_explain';
  // R2（本轮返修 M4）：含「最近 N 周/月」的真实查询（“最近 8 周哪个平台最便宜？”
  // “最近 8 周价格趋势”）不能被筛选意图抢占——只有纯切换/筛选口令（只看 / 切到 /
  // 筛选 / 显示…开头且不带疑问）才走 filter；币种/RRP 口令维持原 filter 归类。
  // 疑问与比较类措辞落到下方 query 关键词判定，保证拿到真实周范围结果而非预览。
  const recentRangeInText = /最近\s*\d+\s*(?:周|星期|月)/.test(text);
  const pureRangeSwitch = /^(?:只看|切到|切换|筛选|显示|带上|去掉|改为|换成)/.test(text.trim()) && !/[?？]/.test(text);
  if (!recentRangeInText && /只看|切换|显示|带上|去掉|usd|美元|本币|rrp|划线价/i.test(text)) return 'filter';
  if (recentRangeInText && (pureRangeSwitch || /只看|切换|带上|去掉|usd|美元|本币|rrp|划线价/i.test(text))) return 'filter';
  if (/比较|对比|依据|最低|最便宜|价差|趋势|价格|平台|多少|均值|变化|情报|预测|销量|需求|供给|库存|汇率|大盘/.test(text)) return 'query';
  if (knownEntityInText(text) && /看|查|查询|了解|情况|表现|分析|走势/.test(text)) return 'query';
  return 'clarify';
}

/**
 * 查询命中关键词并不代表口径已经明确。没有产品上下文时，
 * “最便宜/最低/平台/趋势”等问题不能猜测当前产品；模糊时间也应先让用户确认。
 * 这个检查只作用于查询意图，不改变筛选预览、预警解释和演示预测的确定性流程。
 */
export function clarificationReasonForQuery(text: string, state: FiltersState, entities = resolveAgentEntities(text, state)): string | null {
  // 坏载荷/调用方可能给出 mains:undefined——安全防御，不在此处崩
  const hasSelectedProduct = (state.mains ?? []).some((card) => Boolean(card.main));
  const isForecast = /量价预测|价格下调|价格上调|调整\s*\d+(?:\.\d+)?\s*%|预测情景/.test(text);
  if (isForecast) return null;
  if (!entities.explicitProduct && !hasSelectedProduct) return '产品';

  const hasExplicitRange = /最近\s*\d+\s*(周|星期|月)|\d{4}\s*(年|年初|年末)?\s*(?:第?\d+\s*(周|月)|Q[1-4])|\d{4}(?:\d{2}|Q[1-4])/.test(text);
  const usesBusinessLatestBucket = /(?:最近|最新)有价周/.test(text);
  if (/最近|近期|近段时间|这段时间/.test(text) && !hasExplicitRange && !usesBusinessLatestBucket) return '时间范围';

  return null;
}

/** 「最近 N 周/月」范围补丁：以 dimTime 最后 N 桶为准（与看板当前范围无关），
 *  显式带回周粒度与关闭自适应，供筛选预览、空卡调整范围动作和带范围查询共用。 */
export function recentRangePatch(state: FiltersState, count: number): Pick<FilterPatch, 'adaptive' | 'granularity' | 'rangeStart' | 'rangeEnd'> {
  const buckets = dimTime.map((t) => t.week_id);
  const end = buckets[buckets.length - 1] ?? state.rangeEnd;
  const start = buckets[Math.max(0, buckets.length - count)] ?? state.rangeStart;
  return { adaptive: false, granularity: 'week', rangeStart: start, rangeEnd: end };
}

function recentRangeCountOf(text: string): number | null {
  const recent = text.match(/最近\s*(\d+)\s*(周|星期|月)/);
  if (!recent) return null;
  return Math.max(2, Math.min(52, Number(recent[1]) || 8));
}

/** R6：带「最近 N 周」的查询/价格优势动作执行时，必须用合并新 recentRange 后的
 *  state 计算（recentRangePatch 显式带 granularity:'week' + adaptive:false），
 *  不能沿用看板旧范围/旧粒度读数——月/季粒度下合并周 id 会产生口径错配。 */
function stateWithRecentRange(state: FiltersState, text: string): FiltersState {
  const count = recentRangeCountOf(text);
  return count ? { ...state, ...recentRangePatch(state, count) } : state;
}

export function buildFilterPatch(text: string, state: FiltersState): FilterPatch {
  const patch: FilterPatch = {};
  if (/\b(usd|美元)\b/i.test(text)) patch.currency = 'usd';
  if (/本币|当地币|local/i.test(text)) patch.currency = 'local';
  if (/带上\s*(rrp|划线价)|显示\s*(rrp|划线价)/i.test(text)) patch.priceTypes = { ...state.priceTypes, rrp: true };
  if (/去掉\s*(rrp|划线价)|只看折后/i.test(text)) patch.priceTypes = { discounted: true, rrp: false };
  const recent = recentRangeCountOf(text);
  if (recent) {
    Object.assign(patch, recentRangePatch(state, recent));
  }
  const entities = resolveAgentEntities(text, state);
  if (entities.explicitCountry) patch.countryCode = entities.countryCode;
  if (entities.explicitProduct && entities.selections.length) {
    patch.mains = clampMains(buildCards(entities.selections, { auto: true, countryCode: entities.countryCode }));
  }
  return patch;
}

function formatPatchValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'boolean') return value ? '开' : '关';
  if (typeof value === 'object' && value !== null && 'rrp' in value) return (value as { rrp: boolean }).rrp ? '折后价 + RRP' : '仅折后价';
  // 产品选择数组：结构化格式（型号 · 规格，逗号连接），不落 [object Object]。
  if (Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null && 'main' in item)) {
    const labels = (value as Array<{ main: { modelId: string; romram: string } }>).map((item) => {
      const name = dimProduct.find((row) => row.model_id === item.main.modelId)?.model_name ?? item.main.modelId;
      return `${name} · ${item.main.romram}`;
    });
    return labels.length ? labels.join('、') : '未选择';
  }
  return String(value);
}

function filterLabelOf(key: keyof FilterPatch): string {
  return key === 'priceTypes' ? '价格类型' : key === 'rangeStart' ? '时间起点' : key === 'rangeEnd' ? '时间终点' : key === 'adaptive' ? '自动时间范围' : key === 'currency' ? '币种' : key === 'countryCode' ? '国家' : key === 'mains' ? '产品' : key;
}

export function buildFilterCard(text: string, state: FiltersState): FilterResultCard | null {
  const patch = buildFilterPatch(text, state);
  if (!Object.keys(patch).length) return null;
  const changes: Array<{ label: string; before: string; after: string }> = [];
  for (const key of Object.keys(patch) as Array<keyof FilterPatch>) {
    const before = formatPatchValue(state[key]);
    const after = formatPatchValue(patch[key]);
    if (before !== after) changes.push({ label: filterLabelOf(key), before, after });
  }
  return {
    kind: 'filter',
    id: id('filter'),
    title: '筛选预览（尚未应用）',
    prompt: text,
    patch,
    changes,
    warning: changes.length ? undefined : '当前筛选已经是目标状态，无需应用。',
  };
}

function selections(state: FiltersState): ProductSelection[] {
  const { mainSels, compareSels } = flatSelections(Array.isArray(state.mains) ? state.mains : []);
  return [...mainSels, ...compareSels];
}

function seriesQueryOf(state: FiltersState): SeriesQuery | null {
  const groups = selections(state).map((selection) => ({
    modelId: selection.modelId,
    romram: selection.romram,
    skuIds: selection.skuIds,
    isOwn: selection.skuIds.some((sku) => dimProduct.find((p) => p.sku_id === sku)?.is_own),
    // R4（三审 M1）：趋势查询每线口径与价格优势/价格页同源——每线显式
    // selection.platform 优先，未带每线口径回落全局 state.platform（URL shop=/
    // plat= 等），再无 = 自动。此前只读每线：URL 全局 shop=RU:ozon:3P 时趋势
    // 混池 333、优势 395 的双口径分裂即来源于此。
    platform: effectiveLinePlatform(selection, state.platform),
  }));
  if (!groups.length) return null;
  return { scope: { countryCode: state.countryCode, industry: state.industry }, groups, granularity: state.granularity, startBucket: state.rangeStart, endBucket: state.rangeEnd, currency: state.currency, agg: state.agg };
}

/** Resolve the last fact week inside the active bucket range for platform cards. */
function latestWeekForRange(state: FiltersState): string {
  const bucketOf = (time: (typeof dimTime)[number]): string => {
    if (state.granularity === 'month') return time.month_id;
    if (state.granularity === 'quarter') return time.quarter_id;
    return time.week_id;
  };
  const inRange = dimTime.filter((time) => {
    const bucket = bucketOf(time);
    return bucket >= state.rangeStart && bucket <= state.rangeEnd;
  }).sort((a, b) => a.week_id.localeCompare(b.week_id));
  return inRange[inRange.length - 1]?.week_id ?? state.rangeEnd;
}

function stateForEntityQuery(state: FiltersState, entities: AgentEntityResolution, allowDefaultOwn = false): FiltersState {
  let targetSelections = entities.selections;
  if (!entities.explicitProduct && entities.explicitCountry) {
    // R4（M2，同步稳定线四审）：跨国未点名产品必须保原型号重映射
    // （remapSelectionForCountry：RU Mate X6 12+512 → ID 16+512），不能精确
    // romram 过滤后丢型号、让看板落到默认主品（Mate 80 Pro）；映射合并按
    // selKey 去重，型号整体缺席目标国时自然消失（后续走无数据结果，不冒充）。
    // R3（M3）：重映射内部逐线归一每线取价口径（源国渠道 → 目标国可落地范围/
    // 自动口径），不再 spread 残留源国每线 shop。
    const seen = new Set<string>();
    targetSelections = [];
    for (const selection of selections(state)) {
      const remapped = remapSelectionForCountry(selection, entities.countryCode, state.industry);
      if (!remapped) continue;
      const key = selKey(remapped);
      if (seen.has(key)) continue;
      seen.add(key);
      targetSelections.push(remapped);
    }
  }
  if (!entities.explicitCountry && !entities.explicitProduct && !allowDefaultOwn) return state;
  if (!entities.explicitCountry && !entities.explicitProduct && allowDefaultOwn) {
    if ((state.mains ?? []).some((card) => card.main)) return state;
    const defaultModelId = dimRegion.find((region) => region.country_code === state.countryCode)?.default_own_models[state.industry];
    const defaultRows = dimProduct.filter((row) => row.industry === state.industry && row.is_own && row.countries.includes(state.countryCode) && (!defaultModelId || row.model_id === defaultModelId));
    const fallback = defaultRows[0] ?? dimProduct.find((row) => row.industry === state.industry && row.is_own && row.countries.includes(state.countryCode));
    if (!fallback) return state;
    targetSelections = [{ modelId: fallback.model_id, romram: fallback.romram, skuIds: [lowestPriceColorSku(fallback.model_id, fallback.romram, state.countryCode, state.currency) ?? fallback.sku_id] }];
  }
  const mains: MainProduct[] = targetSelections.map((selection, index) => ({ id: `agent-query-${index}`, main: selection, compares: [] }));
  // R5（M1，同步稳定线五审）：跨国查询的平台勾选同样经共享规则归一化到目标国
  // 可落地范围——源国平台（AE · NOON）在目标国（RU）不存在时计算前就回落目标
  // 国默认电渠，不再带着不可落地平台过滤出空结果；同国有效平台与 shopIds
  // 原样保留（platformSelectionForCountry 完全可落地时返回原引用）。
  // R3（M3）：每线（selection.platform）口径已在实体解析/重映射内逐线归一，
  // 与全局归一同规则——两处口径一致，openPatch 落地与计算不再分裂。
  return { ...state, countryCode: entities.countryCode, platform: platformSelectionForCountry(state.platform, entities.countryCode), mains };
}

/** R3（M2 · 渠道回退透明说明）：查询口径里被逐线钉到有价渠道的选择（默认电渠
 *  对该组全程无价，如 FR Mate X6 → Amazon 3P）逐组说明回退事实——原状态没带
 *  每线口径、默认电渠无价、本次按哪些有价渠道取数，不冒称默认电渠口径。 */
function defaultChannelFallbackNote(state: FiltersState, queryState: FiltersState): string | null {
  const before = selections(state);
  const parts: string[] = [];
  for (const sel of selections(queryState)) {
    if (!sel.platform?.shopIds.length) continue;
    if (before.some((prev) => selKey(prev) === selKey(sel) && prev.platform)) continue;
    if (lowestPriceColorSku(sel.modelId, sel.romram, queryState.countryCode) != null) continue;
    const labels = sel.platform.shopIds.map((id) => dimChannel.find((c) => c.channel_id === id)?.display_name ?? id);
    const name = dimProduct.find((row) => row.model_id === sel.modelId)?.model_name ?? sel.modelId;
    const defaultId = defaultChannelOf(queryState.countryCode);
    const defaultLabel = dimChannel.find((c) => c.channel_id === defaultId)?.display_name ?? '默认电渠';
    const line = `${name} ${sel.romram} 在${dimRegion.find((region) => region.country_code === queryState.countryCode)?.country_name ?? queryState.countryCode}默认电渠（${defaultLabel}）没有价格事实，本次已按有价渠道 ${labels.join('、')} 取数`;
    if (!parts.includes(line)) parts.push(line);
  }
  if (!parts.length) return null;
  return `${parts.join('；')}；不代表其默认电渠有价格。`;
}

/** R3（M3 · 逐线口径回退透明说明）：跨国查询时逐线取价口径发生归一化的产品线
 *  说明——与全局 platformCountryFallbackNote 并列且只陈述事实。R4（三审 r3-m1）：
 *  说明按真实归一前/后/剔除子集生成分支——部分可落地（如 AE 每线 Amazon+NOON →
 *  DE 保留 Amazon）只说明「NOON 不可用已剔除、该线本次仅按 Amazon 计算」，
 *  绝不把保留子集说成「全部渠道最低价自动」或误称有效 Amazon 不存在；全部不可
 *  落地才说明回自动口径。渠道项用可读标签（渠道 id + 显示名），平台项保留源
 *  平台名；同国完全可落地 = null（无回退事实）。 */
function selectionPlatformFallbackNote(state: FiltersState, targetCountryCode: string): string | null {
  const lines: string[] = [];
  const targetName = dimRegion.find((region) => region.country_code === targetCountryCode)?.country_name ?? targetCountryCode;
  for (const sel of selections(state)) {
    if (!sel.platform) continue;
    const normalized = platformSelectionForCountry(sel.platform, targetCountryCode);
    if (normalized === sel.platform) continue;
    const raw = [...sel.platform.platforms, ...sel.platform.shopIds];
    if (!raw.length) continue;
    const name = dimProduct.find((row) => row.model_id === sel.modelId)?.model_name ?? sel.modelId;
    const rawLabel = raw.map(platformScopeLabel).join('、');
    if (!normalized) {
      const line = `${name} ${sel.romram} 的渠道口径 ${rawLabel} 在${targetName}没有在架渠道，该线本次已按${targetName}全部渠道最低价（自动）口径计算；不代表其在${targetName}有价格`;
      if (!lines.includes(line)) lines.push(line);
      continue;
    }
    const kept = [...normalized.platforms, ...normalized.shopIds];
    const dropped = raw.filter((value) => !kept.includes(value));
    const line = `${name} ${sel.romram} 的渠道口径已按${targetName}可落地范围归一：${dropped.map(platformScopeLabel).join('、')} 在${targetName}没有在架渠道已剔除，该线本次仅按 ${kept.map(platformScopeLabel).join('、')} 计算；不代表被剔除部分在${targetName}有价格`;
    if (!lines.includes(line)) lines.push(line);
  }
  if (!lines.length) return null;
  return `${lines.join('；')}。`;
}

/** R5（四审 m1 · 部分完成透明说明）：有价结果里点名但缺数据/缺配置的实体与
 *  配置逐项披露——成功/部分成功的卡与摘要都必须说明缺了什么、没有拿什么替，
 *  不假称全部请求完成；有效结果不因错误配置连带清空（12+256 真实 333 保留
 *  同时说明 8+256 无在架）。 */
function partialCompletionNote(entities: AgentEntityResolution): string | null {
  const parts: string[] = [];
  if (entities.unavailableProducts.length) {
    parts.push(`${entities.unavailableProducts.join('、')}在${entities.countryName}没有可用价格数据`);
  }
  if (entities.missingConfigs.length) {
    parts.push(`请求点名的配置（${entities.missingConfigs.join('、')}）在${entities.countryName}没有在架型号配置；已保留请求口径，没有改用该型号其他配置或当前页面配置代替`);
  }
  if (!parts.length) return null;
  return `本次为部分完成：${parts.join('；')}；其余结果按请求完成。`;
}

function noDataResult(entities: AgentEntityResolution, state: FiltersState): { cards: AgentResultCard[]; citations: AgentResponse['citations']; steps: AgentStep[]; summary: string } {
  const labels = entities.unavailableProducts.length ? entities.unavailableProducts : entities.productLabels;
  const productText = labels.length ? labels.join('、') : '当前页面选择的产品';
  const rows = labels.length ? labels.map((label) => [label, entities.countryName, '无可用价格数据']) : [[productText, entities.countryName, '无可用价格数据']];
  // R3-M2（三审）：点名配置不存在时如实说明「点名了什么、该国有哪些配置、没有
  // 改用其他配置」，不伪称已按请求查询、不静默扩大到全部配置
  const configNote = entities.missingConfigs.length
    ? `请求点名的配置（${entities.missingConfigs.join('、')}）在${entities.countryName}没有在架型号配置；已保留请求配置口径，没有改用该型号其他配置或当前页面配置代替。`
    : '';
  const table: AgentResultCard = {
    kind: 'table', id: id('table'), title: '目标查询结果', columns: ['产品', '国家', '结果'], rows,
    note: `已按请求的国家和产品查询；当前数据集没有可用的价格事实，因此没有沿用原看板产品代替。${configNote}`,
  };
  return {
    cards: [table],
    citations: [{ id: id('citation'), kind: 'fact', label: '产品与国家维表', detail: `${productText} · ${entities.countryName}` }],
    steps: [step('catalog.resolve', '解析产品与国家', `${productText} · ${entities.countryName}`, 'success'), step('series.query', '查询价格序列', '没有可用价格事实', 'warning')],
    summary: `${productText}在${entities.countryName}没有可用的价格数据；我没有用当前页面的其他产品冒充结果。${configNote}`,
  };
}

function queryCards(state: FiltersState, text: string, entities: AgentEntityResolution = resolveAgentEntities(text, state)): { cards: AgentResultCard[]; citations: AgentResponse['citations']; steps: AgentStep[]; summary: string } {
  const queryState = stateForEntityQuery(state, entities, /我司|自家|华为.*价格|快搜/.test(text));
  const query = seriesQueryOf(queryState);
  if (!query) {
    if (entities.explicitCountry || entities.explicitProduct) return noDataResult(entities, queryState);
    return { cards: [], citations: [], steps: [step('catalog.resolve', '解析当前产品', '当前页面还没有可查询的产品', 'warning')], summary: '当前看板还没有选中的产品，请先选择一个主品或竞品。' };
  }
  try {
    const series = buildSeries(query);
    const hasValue = series.some((item) => item.points.some((point) => point.price != null));
    if (!hasValue && (entities.explicitCountry || entities.explicitProduct)) return noDataResult(entities, queryState);
    const scopeLabel = entities.explicitCountry || entities.explicitProduct
      ? `${entities.countryName}${entities.productLabels.length ? ` · ${entities.productLabels.join('、')}` : ''}`
      : '当前页面';
    // R4（M1，同步稳定线四审）：回看类 open 动作携带生成该卡时的完整查询口径
    // （国家、主品、平台、粒度、时间范围）——AE 页问「RU nova 14 Pro 价格趋势」，
    // 回看必须落在 RU + nova，而不是让目标页回落 AE 旧口径。
    const openPatch: FilterPatch = {
      countryCode: queryState.countryCode,
      mains: queryState.mains,
      platform: queryState.platform,
      granularity: queryState.granularity,
      adaptive: queryState.adaptive,
      rangeStart: queryState.rangeStart,
      rangeEnd: queryState.rangeEnd,
    };
    // R5（M1，同步稳定线五审）：跨国平台归一化发生回退（stateForEntityQuery 已按
    // 目标国归一）时，在卡片与摘要透明说明回退事实，不冒称源国平台在目标国有价。
    // R3（M3）：每线取价口径（selection.platform）的跨国归一回退同样透明说明
    // （全局口径与逐线口径并列陈述，各自点名实际计算口径）。
    // R3（M2）：默认电渠无价、逐线钉到有价渠道的渠道回退（FR Mate X6 →
    // Amazon 3P）同样透明说明。
    const platformNote = [
      platformCountryFallbackNote(state.platform, queryState.countryCode),
      selectionPlatformFallbackNote(state, queryState.countryCode),
      defaultChannelFallbackNote(state, queryState),
    ].filter((note): note is string => note != null).join('');
    // R5（四审 m1）：部分完成说明进卡与摘要（有价分支不再吞缺失披露）
    const partialNote = partialCompletionNote(entities);
    const chart = {
      kind: 'chart' as const,
      id: id('chart'),
      title: /最低|最便宜|平台/.test(text) ? `${scopeLabel}价格走势` : `${scopeLabel}价格走势摘要`,
      series: series.slice(0, 6).map((s) => ({ label: s.label, color: s.color, values: s.points.slice(-8).map((p) => ({ bucket: p.xLabel, value: p.price })) })),
      note: `${queryState.currency === 'usd' ? 'USD' : '本币'} · ${queryState.granularity} · ${queryState.rangeStart}–${queryState.rangeEnd}；数值来自统一价格聚合引擎。${platformNote ?? ''}${partialNote ?? ''}`,
      actions: [{ id: id('action'), label: '解释趋势变化', kind: 'followup' as const, prompt: '解释这组价格趋势的关键变化和需要核查的异常点' }, { id: id('action'), label: '回看板定位', kind: 'open' as const, prompt: '把这组价格趋势定位回当前看板', filterPatch: openPatch }],
      evidence: [{ id: id('evidence'), label: '价格序列', detail: `${series.length} 条系列 · ${queryState.rangeStart}–${queryState.rangeEnd}`, source: '统一价格聚合引擎' }],
    };
    const rows = series.slice(0, 8).map((s) => {
      const valued = s.points.filter((p) => p.price != null);
      const latest = valued[valued.length - 1]?.price ?? null;
      const previous = valued[valued.length - 2]?.price ?? null;
      const change = latest != null && previous != null && previous !== 0 ? `${(((latest - previous) / previous) * 100).toFixed(1)}%` : '—';
      return [s.label, latest == null ? '—' : latest.toLocaleString(), change, s.channelBadge?.label ?? '自动'];
    });
    const platformQuestion = /最低|最便宜|平台/.test(text);
    let table: AgentResultCard;
    if (platformQuestion) {
      // R5（四审 m2）：平台比较按整条产品线选择展开——skuIds=[]（整配置）解析
      // 为该型号该配置全部颜色、多 SKU 部分选择按实际选择聚合（各平台价 =
      // 选择内各 SKU 平台内最低价的均值，与趋势聚合同构），不再只取
      // first.skuIds[0]（整配置时为 undefined → 空平台表的旧缺陷），也不把
      // 黑色单 SKU 333 套给整配置 334。
      const first = selections(queryState)[0];
      const latestWeek = latestWeekForRange(queryState);
      const spreadInfo = first ? platformPriceSpreadOfSelection(first, latestWeek, queryState.countryCode, queryState.currency) : { members: 0, wholeConfig: false, rows: [] as Array<{ platform: string; price: number; skuCount: number }> };
      const spread = spreadInfo.rows;
      const lowest = spread[0]?.price ?? null;
      const scopeNote = spreadInfo.wholeConfig && spread.length
        ? `按 ${latestWeek} 各平台价排序（整配置口径：全部 ${spreadInfo.members} 个颜色 SKU，各平台价 = 选择内各 SKU 平台内最低价的均值，与趋势聚合一致）；当前最便宜平台为 ${spread[0].platform}。`
        : spreadInfo.members > 1 && spread.length
          ? `按 ${latestWeek} 各平台价排序（所选 ${spreadInfo.members} 个颜色 SKU 的平台内最低价均值）；当前最便宜平台为 ${spread[0].platform}。`
          : `按 ${latestWeek} 的平台最低在架价排序；当前最便宜平台为 ${spread[0]?.platform ?? '—'}。`;
      table = { kind: 'table', id: id('table'), title: '最新有价周平台比较', columns: ['平台', '最低价', '相对最低价'], rows: spread.slice(0, 8).map((item) => [item.platform, Math.round(item.price).toLocaleString(), lowest == null || lowest === 0 ? '—' : item.price === lowest ? '最低' : `+${(((item.price - lowest) / lowest) * 100).toFixed(1)}%`]), note: spread.length ? `${scopeNote}${platformNote ?? ''}${partialNote ?? ''}` : `当前产品在最新有价周没有可比较的平台数据。${platformNote ?? ''}${partialNote ?? ''}`, actions: [{ id: id('action'), label: '查看价差解释', kind: 'followup', prompt: '解释最新有价周的平台价差及可能的核查方向' }, { id: id('action'), label: '定位到看板', kind: 'open', prompt: `把 ${latestWeek} 的平台比较定位回看板`, filterPatch: openPatch }], evidence: [{ id: id('evidence'), label: '平台比较', detail: `${latestWeek} · ${spread.length} 个平台${spreadInfo.wholeConfig ? ` · 整配置 ${spreadInfo.members} 色` : spreadInfo.members > 1 ? ` · 所选 ${spreadInfo.members} SKU` : ''}`, source: '统一价格聚合引擎' }] };
    } else {
      table = { kind: 'table', id: id('table'), title: '最新价格摘要', columns: ['产品', '最新价', '环比', '取价口径'], rows, note: `少于两个有效点时不计算环比；结果可回到看板继续下钻。${platformNote ?? ''}${partialNote ?? ''}`, actions: [{ id: id('action'), label: '比较主竞品', kind: 'followup', prompt: '把当前产品和主竞品放在同一张价格表里比较' }, { id: id('action'), label: '回看板下钻', kind: 'open', prompt: '把这张价格摘要定位回当前看板继续下钻', filterPatch: openPatch }], evidence: [{ id: id('evidence'), label: '价格摘要', detail: `${rows.length} 个产品 · ${queryState.rangeStart}–${queryState.rangeEnd}`, source: '统一价格聚合引擎' }] };
    }
    return { cards: [chart, table], citations: [{ id: id('citation'), kind: 'calculation', label: '统一价格聚合引擎', detail: `${series.length} 条系列 · ${queryState.countryCode} · ${queryState.rangeStart}–${queryState.rangeEnd}` }], steps: [step('catalog.resolve', '解析产品与口径', `${query.groups.length} 个产品组`), step('series.query', '查询价格序列', `${series.length} 条系列`), step('series.compare', '计算变化', '已完成确定性计算')], summary: rows.length ? `已按${scopeLabel}整理 ${rows.length} 个产品的价格结果。${platformNote ?? ''}${partialNote ?? ''}` : `当前范围没有足够的价格数据。${platformNote ?? ''}${partialNote ?? ''}` };
  } catch {
    return { cards: [], citations: [], steps: [step('series.query', '查询价格序列', '价格引擎返回异常', 'failed')], summary: '价格数据暂时无法读取，请刷新后重试。' };
  }
}

function forecastCards(
  text: string,
  target: { page: string; contextFingerprint: string },
  forecastDraft: ForecastDraftInput = BASELINE_DRAFT,
  forecastDataset: ForecastDataset = forecastFixture,
  forecastSnapshot?: ForecastSnapshot,
): { cards: AgentResultCard[]; citations: AgentResponse['citations']; steps: AgentStep[]; summary: string } {
  const baselineSnapshot = forecastSnapshot ?? createForecastSnapshot(forecastDataset, forecastDraft, target.contextFingerprint);
  const currentIndex = forecastDataset.params.currentWeekIndex;
  const firstForecastWeek = baselineSnapshot.forecastWeeks[0] ?? baselineSnapshot.current;
  const basePrice = firstForecastWeek?.price ?? forecastDataset.params.referencePrice;
  const elasticity = forecastSnapshot?.fit.application?.priceElasticity ?? forecastDataset.params.priceElasticity;
  const requested = text.match(/(?:下调|上调|调整)\s*(\d+(?:\.\d+)?)\s*%/);
  const offsets = requested ? [-(Number(requested[1]) || 5), 0, Number(requested[1]) || 5] : [-10, -5, 0, 5, 10];
  const rows = offsets.map((offset) => {
    const netOffset = forecastDraft.priceDeltaPct + offset;
    const scenarioSnapshot = createForecastSnapshot(forecastDataset, { ...forecastDraft, priceDeltaPct: netOffset }, target.contextFingerprint);
    const future = scenarioSnapshot.forecastWeeks;
    const demand = future.reduce((sum, week) => sum + week.unconstrainedDemand, 0);
    const supply = future.reduce((sum, week) => sum + week.so, 0);
    const price = Math.round(basePrice * (1 + netOffset / 100));
    return [`${netOffset > 0 ? '+' : ''}${netOffset}%`, price.toLocaleString(), demand.toLocaleString(), supply.toLocaleString()];
  });
  const actionTarget = { page: target.page, contextFingerprint: target.contextFingerprint, forecastDraft, forecastSnapshot: baselineSnapshot, forecastDataset };
  const table: AgentResultCard = { kind: 'table', id: id('forecast'), title: '量价预测情景', columns: ['价格变化', '预测价格', '预测窗口理论需求', '预测窗口 SO'], rows, note: `模型 ${forecastDataset.meta.modelVersion}：参考价 ${forecastDataset.params.referencePrice}，价格弹性 ${elasticity.toFixed(2)}；结果来自 ${forecastDataset.context.weekRange} 的确定性计算，供方向性判断。`, actions: [{ id: id('action'), label: '查看预测假设', kind: 'followup', prompt: '解释量价预测的关键假设、不确定性和需要补充的数据', target: actionTarget }], evidence: [{ id: id('evidence'), label: '预测模型', detail: `${forecastDataset.context.product} · ${forecastDataset.context.country} · ${forecastDataset.meta.modelVersion}`, source: forecastDataset.meta.source }] };
  return { cards: [table], citations: [{ id: id('citation'), kind: 'calculation', label: '量价预测确定性模型', detail: `${forecastDataset.meta.modelVersion} · 参考价 ${forecastDataset.params.referencePrice} · 弹性 ${elasticity.toFixed(2)}` }], steps: [step('catalog.resolve', '读取预测口径', `${forecastDataset.context.product} · ${forecastDataset.context.country}`), step('series.query', '计算价格情景', `${rows.length} 个情景`), step('series.compare', '约束可售销量', '已应用每周可供量上限')], summary: requested ? `已基于${forecastDataset.meta.modelVersion}计算价格${requested[1]}%变动下的预测窗口需求与 SO；结果受每周可供量约束。` : `已基于${forecastDataset.meta.modelVersion}整理价格、理论需求和 SO 的预测窗口情景；结果用于方向性判断。` };
}

function signedUnits(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString()} 台`;
}

function forecastExplanationCards(
  target: { page: string; contextFingerprint: string },
  forecastDraft: ForecastDraftInput = BASELINE_DRAFT,
  forecastDataset: ForecastDataset = forecastFixture,
  forecastSnapshot?: ForecastSnapshot,
): { cards: AgentResultCard[]; citations: AgentResponse['citations']; steps: AgentStep[]; summary: string } {
  const snapshot = forecastSnapshot ?? createForecastSnapshot(forecastDataset, forecastDraft, target.contextFingerprint);
  const computation = snapshot.computation;
  const current = snapshot.current;
  const effectiveElasticity = snapshot.fit.application?.priceElasticity ?? forecastDataset.params.priceElasticity;
  const driverByKey = new Map(computation.drivers.map((driver) => [driver.key, driver]));
  const factors = snapshot.factors.map((profile) => {
    const driver = driverByKey.get(profile.key);
    return {
      key: profile.key,
      label: profile.label,
      role: profile.scope,
      window: profile.window,
      shape: profile.shape,
      status: profile.status,
      confidence: profile.confidence,
      evidence: profile.evidence,
      effect: driver ? signedUnits(driver.value) : '—',
    };
  });
  const actionTarget = { page: target.page, contextFingerprint: target.contextFingerprint, weekId: current.week, forecastDraft, forecastSnapshot: snapshot, forecastDataset };
  const card: AgentResultCard = {
    kind: 'forecast_explanation',
    id: id('forecast-explain'),
    title: '简单版预测：假设、证据与风险',
    contextFingerprint: target.contextFingerprint,
    fitWindow: `${snapshot.fit.fitWindow.start}–${snapshot.fit.fitWindow.end}（模拟历史段）`,
    sampleCount: snapshot.fit.sampleCount,
    scope: {
      country: forecastDataset.context.country,
      channel: forecastDataset.context.channel,
      product: forecastDataset.context.product,
      currency: forecastDataset.meta.currency,
      modelVersion: forecastDataset.meta.modelVersion,
    },
    dataStatus: snapshot.dataStatus,
    provenanceSummary: provenanceSummary(snapshot.provenance),
    fitStatus: snapshot.fit.status,
    fitAppliedToForecast: snapshot.fitAppliedToForecast,
    intervalCalibrated: Boolean(snapshot.computation.modelEvidence?.intervalCalibrated),
    current: {
      week: current.week,
      price: current.price,
      baseDemand: current.baseDemand,
      unconstrainedDemand: current.unconstrainedDemand,
      available: current.available,
      so: current.so,
      inventory: current.inventory,
      risk: computation.kpi.risk.label,
    },
    scenario: snapshot.scenario,
    factors,
    assumptions: [
      '无约束需求 = 基线 × 感知价格 × 促销 × 竞品压力；供给只作为 SO 上限。',
      `价格因子使用参考价 ${forecastDataset.params.referencePrice} 与当前弹性 ${effectiveElasticity.toFixed(2)}；fit 是否注入预测由快照安全门决定。`,
      `当前 fit 状态为${snapshot.fit.status === 'completed' ? '已完成' : '证据不足，回退先验'}；总体有效样本 ${snapshot.fit.sampleCount} 周，排除删失 ${snapshot.fit.excluded.censored}、混杂 ${snapshot.fit.excluded.confounded}、缺失 ${snapshot.fit.excluded.missing}。`,
      snapshot.competitorEvents.some((event) => event.marketEffect === 'unknown') ? '竞品上市的市场扩盘 / 分流状态仍待验证，当前只作为份额压力情景。' : '竞品事件已带有显式市场效应状态，仍需结合证据核对。',
      // 推演工作台界面能力口径（A4 同步，2026-11-04 评审修订：把握区间带下线，大盘月粒度调整上线）。
      '参照品联动：在推演工作台切换上一代参照后，基线按同周龄比值校正（选中参照 / 默认参照）；友商参照仅作对照，不进入主链。',
      '库存上限修正：SO = min(基线 SO, 可售)，修正结果回写主图；修正周以琥珀描边标注，截断事实独立保留，手调不覆盖。',
      '大盘月粒度：大盘工作台覆盖未来 4 个季度逐月预测，点击预测月就地调整（原因必填，保存才回写），调整季度经季内三月均值同步主链；人工事件三字段（起始时间/时长/幅度），月中起始按日均摊。',
      '复制关键假设：推演工作台可一键复制结构化关键假设文本（范围与模拟状态 → 模型版本 → 季度基线 → 行业事件 → 大盘月度事件与按月调整 → 上一代参照 → 产品事件 → SI → 手调原因 → 库存规则 → 结果摘要），供会议与评审直接引用。',
    ],
    boundaries: [
      `${forecastDataset.meta.status === 'simulated' ? '当前数据为模拟演示，不能当作真实销量、库存或利润事实。' : '当前数据状态已标记。'}`,
      `历史段为${forecastDataset.meta.status === 'simulated' ? '模拟输入' : '观测输入'}（${forecastDataset.weeks.filter((week) => week.status === 'actual').length} 周），不构成因果证明；${snapshot.computation.modelEvidence?.intervalCalibrated ? '预测区间已用留出残差校准，并受可供量上限截断。' : '结果为模型点估计，暂未校准预测区间。'}`,
      current.stockout ? `${current.week} 可供量低于无约束需求，SO 被供给截断；需核对真实配额与缺货状态。` : '当前周未出现供给截断，但仍需核对实际 SO 与可供量。',
    ],
    actions: [
      { id: id('action'), label: '查看计算路径', kind: 'open', prompt: '回到量价预测页查看计算路径', target: actionTarget },
      { id: id('action'), label: '继续做价格情景', kind: 'followup', prompt: '如果价格下调 5% 会怎样？', target: actionTarget },
    ],
    evidence: [
      { id: id('evidence'), label: '预测输入', detail: `${forecastDataset.context.country} · ${forecastDataset.context.channel} · ${forecastDataset.context.product} · ${forecastDataset.context.weekRange}`, source: forecastDataset.meta.source },
      { id: id('evidence'), label: '当前周计算', detail: `${current.week} · 基线 ${current.baseDemand.toLocaleString()} · 无约束需求 ${current.unconstrainedDemand.toLocaleString()} · SO ${current.so.toLocaleString()}`, source: forecastDataset.meta.modelVersion },
    ],
  };
  return {
    cards: [card],
    citations: [{ id: id('citation'), kind: 'calculation', label: '量价预测确定性模型', detail: `${forecastDataset.meta.modelVersion} · ${forecastDataset.meta.source} · ${forecastDataset.context.weekRange}` }],
    steps: [step('catalog.resolve', '读取预测口径', `${forecastDataset.context.product} · ${forecastDataset.context.country}`), step('series.query', '读取模型输入', `${forecastDataset.weeks.length} 周 · ${forecastDataset.meta.status}`), step('series.compare', '展开假设与风险', `${factors.length} 项考量 · 当前周 ${current.week}`)],
    summary: `当前简单版预测基于${forecastDataset.context.product}的${forecastDataset.meta.modelVersion}${forecastDataset.meta.status === 'simulated' ? '模拟' : '观测'}输入：${current.week} 无约束需求 ${current.unconstrainedDemand.toLocaleString()} 台，SO ${current.so.toLocaleString()} 台，主要风险为${computation.kpi.risk.label}。`,
  };
}

/** 给所有确定性结果卡补上生成时的作用域，避免卡片按钮在筛选变化后误操作。 */
function scopeCardActions(cards: AgentResultCard[], target: { page: string; contextFingerprint: string }): AgentResultCard[] {
  return cards.map((card) => {
    if (!card.actions?.length) return card.kind === 'filter' ? { ...card, contextFingerprint: target.contextFingerprint } : card;
    return {
      ...card,
      actions: card.actions.map((action) => action.target ? action : { ...action, target }),
      ...(card.kind === 'filter' ? { contextFingerprint: target.contextFingerprint } : {}),
    } as AgentResultCard;
  });
}

function alertCard(text: string, alerts: readonly AgentAlertRecord[]): { card: AgentResultCard | null; summary: string; steps: AgentStep[]; citations: AgentResponse['citations'] } {
  const alert = alerts[0];
  if (!alert) return { card: null, summary: '当前页面没有可解释的预警事件。', steps: [step('alerts.query', '查询预警', '当前口径没有预警', 'warning')], citations: [] };
  const direction = alert.wowPct != null ? `${alert.wowPct < 0 ? '下降' : '上涨'} ${Math.abs(alert.wowPct * 100).toFixed(1)}%` : '已触发规则';
  const card: AgentResultCard = { kind: 'alert', id: id('alert'), title: `${alert.modelName} 的最新预警`, alert, facts: [`${alert.weekLabel}（${alert.weekId}）触发${alert.type}规则`, `折后价${direction}`, alert.gapPct != null ? `平台价差为 ${(alert.gapPct * 100).toFixed(1)}%` : '当前事件没有平台价差字段'], checks: ['核对促销记录与商品页面快照', '对比其他平台是否同步变化', '确认是否为单平台的短期变化'], evidence: [{ id: id('evidence'), label: '预警事件', detail: `${alert.brand} ${alert.modelName} · ${alert.weekId}`, source: '预警中心事件流' }, { id: id('evidence'), label: '规则输入', detail: alert.gapPct != null ? `平台价差 ${(alert.gapPct * 100).toFixed(1)}%` : `周度变化 ${alert.wowPct == null ? '—' : `${(alert.wowPct * 100).toFixed(1)}%`}`, source: '规则快照' }], actions: [{ id: id('action'), label: '继续核查预警', kind: 'followup', prompt: '基于最新预警证据，列出下一步核查顺序和需要补充的数据' }, { id: id('action'), label: '回预警中心', kind: 'open', prompt: '把这条预警定位回预警中心详情' }] };
  return { card, summary: '我把触发事实、前后变化和建议核查项分开列出；当前结果不推断唯一因果。', steps: [step('alerts.query', '读取预警事件', alert.weekLabel), step('alerts.explain', '解释触发原因', '已读取当前规则与输入值')], citations: [{ id: id('citation'), kind: 'alert', label: '预警事件', detail: alert.key }] };
}

function priceAlertList(text: string, context: AgentContextSnapshot): { card: AlertListResultCard; summary: string; steps: AgentStep[]; citations: AgentResponse['citations'] } {
  const alerts = context.alerts.slice(0, 40);
  const card: AlertListResultCard = {
    kind: 'alert_list',
    id: `price-alert-${context.fingerprint}`,
    title: `价格预警 · ${alerts.length} 条当前事件`,
    alerts: [...alerts],
    contextFingerprint: context.fingerprint,
    note: alerts.length
      ? '预警来自现有四类规则：调价、折扣、平台价差、档位间距。展开每条可查看触发事实、规则版本与来源。'
      : '当前国家、产业、订阅和平台口径下没有触发事件；没有用其他范围的数据填充。',
    evidence: [{ id: 'alert-engine', label: '预警规则', detail: `${context.ruleVersion ?? 'price-rules-v1'} · ${context.dataVersion ?? 'local-data-v1'}`, source: '预警确定性引擎' }],
  };
  return {
    card,
    summary: alerts.length ? `已读取 ${alerts.length} 条真实预警，并保留每条的规则、周次和证据入口。` : card.note,
    steps: [step('alerts.query', '读取价格预警', `${alerts.length} 条当前事件`), step('alerts.explain', '校验触发证据', alerts.length ? '规则与数据版本已带出' : '当前口径无触发事件'), step('view.preview', '生成结论', '预警卡可展开、定位和处理')],
    citations: [{ id: 'alert-rule', kind: 'rule', label: '预警规则', detail: '复用调价、折扣、平台价差、档位间距四类现有规则' }],
  };
}

function suggestionActionsFor(intent: AgentIntent, clarificationReason: string | null): AgentSuggestionAction[] {
  // R2（本轮返修 M4）：时间范围澄清卡必须给可点击的「补齐时间」动作——点击即以
  // 明确的「最近 N 周价格趋势」发起真实查询（周范围来自 dimTime 最后 N 桶，
  // 如 202635–202642，并带最新价摘要），不能只生成筛选预览。
  if (clarificationReason === '时间范围') {
    return [
      { label: '补齐时间 · 最近 8 周', intent: 'query', prompt: '最近 8 周价格趋势' },
      { label: '补齐时间 · 最近 4 周', intent: 'query', prompt: '最近 4 周价格趋势' },
      { label: '补齐时间 · 最近 12 周', intent: 'query', prompt: '最近 12 周价格趋势' },
    ];
  }
  void intent;
  const core: AgentSuggestionAction[] = [
    { label: '价格优势', intent: 'price_advantage', target: 'comparison', prompt: '价格优势' },
    { label: '价格预警', intent: 'price_alert', target: 'evidence', prompt: '价格预警' },
    { label: '查我司产品价格', intent: 'query', target: 'dashboard', prompt: '查我司产品价格' },
  ];
  return core;
}

export async function runAgent(
  text: string,
  context: AgentContextSnapshot,
  signal?: AbortSignal,
  forcedIntent?: AgentIntent,
  forecastDraft?: ForecastDraftInput,
  forecastSnapshot?: ForecastContextInput['forecastSnapshot'],
  forecastDataset?: ForecastContextInput['forecastDataset'],
): Promise<AgentResponse> {
  const classifiedIntent = forcedIntent ?? classifyIntent(text);
  const entities = resolveAgentEntities(text, context.state);
  const clarificationReason = classifiedIntent === 'query' ? clarificationReasonForQuery(text, context.state, entities) : null;
  const intent: AgentIntent = clarificationReason ? 'clarify' : classifiedIntent;
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => { cleanup(); resolve(); }, 120);
    const onAbort = () => { cleanup(); reject(new DOMException('已取消', 'AbortError')); };
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
  const cards: AgentResultCard[] = [];
  let summary = '';
  let steps: AgentStep[] = [];
  let citations: AgentResponse['citations'] = [];
  if (intent === 'filter') {
    const card = buildFilterCard(text, context.state);
    if (card) cards.push(card);
    summary = card ? '我先生成筛选预览，当前看板尚未改变。确认后才会应用。' : '我没有识别到明确的筛选变化，可以补充国家、时间、币种或 RRP 条件。';
    steps = [step('catalog.resolve', '解析筛选条件', card ? `${card.changes.length} 项待变更` : '需要补充口径', card ? 'success' : 'warning'), ...(card ? [step('view.preview', '生成筛选预览', '等待用户确认')] : [])];
  } else if (intent === 'price_advantage') {
    // R5：跨国自然语言查询（AE 页问「RU 价格优势」）按请求国计算，
    // 结果行携带请求国，跳转动作据此带回该国 filterPatch。
    // R6：「最近 N 周」属于周口径范围，先经 stateWithRecentRange 合并（显式
    // granularity:'week' + adaptive:false）——月/季粒度看板上不能只并周 id
    // 留旧粒度，否则产出 month · 202635–202642 这类口径错配、价格全空。
    const rangedState = stateWithRecentRange(context.state, text);
    const advState = entities.explicitCountry ? stateForPriceAdvantageCountry(rangedState, entities.countryCode) : rangedState;
    const result = buildPriceAdvantageResult(advState, context.fingerprint);
    // R4（M2）：跨国请求的我司主品整体缺席目标国 → 安全回落默认主品，但必须在
    // 结果卡与摘要里明确说明，不冒充用户原产品的比较。
    // R5（M1）：跨国平台勾选不可落地（stateForPriceAdvantageCountry 已归一）同样
    // 在结果卡与摘要透明说明回退事实，不冒称源国平台在目标国有价。
    const fallbackNotes = [
      entities.explicitCountry ? priceAdvantageCountryFallbackNote(rangedState, entities.countryCode) : null,
      entities.explicitCountry ? platformCountryFallbackNote(rangedState.platform, entities.countryCode) : null,
    ].filter((note): note is string => note != null).join('');
    if (fallbackNotes) {
      cards.push({ ...result.card, note: `${result.card.note}${fallbackNotes}` });
      summary = `${result.summary}${fallbackNotes}`;
      steps = result.steps;
      citations = result.citations;
    } else {
      cards.push(result.card); summary = result.summary; steps = result.steps; citations = result.citations;
    }
  } else if (intent === 'price_alert') {
    const result = priceAlertList(text, context);
    cards.push(result.card); summary = result.summary; steps = result.steps; citations = result.citations;
  } else if (intent === 'alert') {
    const result = alertCard(text, context.alerts);
    if (result.card) cards.push(result.card);
    summary = result.summary; steps = result.steps; citations = result.citations;
  } else if (intent === 'forecast_explain') {
    const result = forecastExplanationCards({ page: 'forecast', contextFingerprint: context.fingerprint }, forecastDraft, forecastDataset, forecastSnapshot);
    cards.push(...result.cards); summary = result.summary; steps = result.steps; citations = result.citations;
  } else if (intent === 'query') {
    const result = /量价预测|价格下调|价格上调|调整\s*\d+(?:\.\d+)?\s*%|预测情景/.test(text) ? forecastCards(text, { page: 'forecast', contextFingerprint: context.fingerprint }, forecastDraft, forecastDataset, forecastSnapshot) : queryCards(stateWithRecentRange(context.state, text), text, entities);
    cards.push(...result.cards); summary = result.summary; steps = result.steps; citations = result.citations;
  } else {
    summary = clarificationReason === '产品'
      ? '我可以继续查，但需要先确认产品。请选择一个主品或竞品，或直接告诉我型号；这样“最便宜/趋势/平台价差”才有明确对象。'
      : clarificationReason === '时间范围'
        ? '我可以继续查，但需要先确认时间范围。请指定最近几周/几个月，或直接说最新有价周。'
        : '你可以让我查询价格走势、比较平台价差、解释预警，或先生成筛选预览。';
    steps = [step('catalog.resolve', '识别问题', clarificationReason ? `需要补充${clarificationReason}` : '需要选择一个分析方向', 'warning')];
  }
  return {
    intent,
    summary,
    steps,
    cards: scopeCardActions(cards, { page: context.page, contextFingerprint: context.fingerprint }),
    citations,
    // Keep the legacy string field useful for API clients and older tests; the
    // visible UI renders the explicit suggestionActions below, which are
    // intentionally limited to the three supported entry points.
    suggestions: clarificationReason === '产品'
      ? ['选择一个主品或竞品', '告诉我具体型号', '指定国家和时间范围']
      : clarificationReason === '时间范围'
        ? ['最近 8 周哪个平台最便宜？', '最新有价周哪个平台最便宜？', '指定最近 3 个月']
        : ['价格优势', '价格预警', '查我司产品价格'],
    suggestionActions: suggestionActionsFor(intent, clarificationReason),
    contextFingerprint: context.fingerprint,
    provenance: context.provenance ?? {
      source: 'local-deterministic',
      dataVersion: context.dataVersion,
      ruleVersion: context.ruleVersion,
      contextFingerprint: context.fingerprint,
      generatedAt: new Date().toISOString(),
    },
    provider: { name: '本地确定性', model: 'local' },
  };
}

export function buildAgentContext(page: string, state: FiltersState, alerts: readonly AgentAlertRecord[]): AgentContextSnapshot {
  const pageLabel: Record<string, string> = {
    overview: '国家总览',
    dashboard: '价格走势',
    volume: '量价走势',
    marketboard: '大盘走势',
    pricing: '定价推演',
    intelligence: '情报中心',
    forecast: '量价预测',
    alerts: '预警中心',
    config: '配置',
  };
  const fingerprint = contextFingerprint(state, page);
  return {
    page,
    pageLabel: pageLabel[page] ?? page,
    state,
    alerts,
    createdAt: new Date().toISOString(),
    fingerprint,
    // 数据版本由真实数据接入时替换为 manifest.version；在本地演示中保持可审计常量。
    dataVersion: 'local-data-v1',
    ruleVersion: 'price-rules-v1',
    provenance: {
      source: 'pricelens-context',
      dataVersion: 'local-data-v1',
      ruleVersion: 'price-rules-v1',
      contextFingerprint: fingerprint,
    },
  };
}
