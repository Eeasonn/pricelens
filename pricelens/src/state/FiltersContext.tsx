// ============================================================
// 筛选状态：五框状态 + §5.6 联动 + localStorage 持久化（LPL3.filters）
// + §13 CONFIG_CHANGED_EVENT 监听（配置保存后，自动匹配开 = 华为主品卡
//   对比区立即按新矩阵重算）
// 默认视图（2026-10-20 真实数据接入起）：周 · USD · 平台 = 该国默认电渠（「国家主要电渠」首个）
// · 主分析 = 产品竞品矩阵该国该产业首个有数型号的首个配置（最低价颜色）成卡
//   + 其分国对标对比区 · 仅折后价 · 时间自适应开 · 对比自动匹配开；
//   切国家/产业时按同规则重算默认产品
// 第一百一十七轮（统一产品选择器）：own/competitors → mains（每主品卡自带对比区）。
// 第一百二十轮（第三次迭代）：卡收敛为唯一主品（main: ProductSelection | null）；
// 持久化 v12（v10/v11 载荷自动迁移，见 mainSelection.migrateV10/expandV11Cards）。
// 导出名 FiltersProvider / useFilters 与返回结构 { state, actions } 不变。
// ============================================================
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AlertProductRule,
  AlertThresholds,
  AlertTypeSwitches,
  FiltersActions,
  FiltersState,
  MainProduct,
  PlatformScopeNotice,
  PlatformSelection,
  ProductSelection,
} from './filtersTypes';
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';
import { dimProduct, dimRegion, dimTime, factPriceMonthly } from '../data';
import { lowestPriceColorSku, platformSelectionForCountry, sellersOfChannel } from '../dataModel/aggregate';
import { normalizePlatformScope, platformQueryEquals } from '../dataModel/platformScope';
import type { LawfulPlatformScope } from '../dataModel/platformScope';
import { STABLE } from '../appChannel';
import { setCurrentCountry } from './currentScope';
import { setLocalCurrencyByCountry } from './fx';
import type { Industry } from '../dataModel/types';
import { marketDataProfileOf, type FinancingTerm } from '../dataModel/marketProfile';
import { publishedMonthlyRangeOf } from '../dataModel/monthlyFacts';
import { convertRangeBuckets } from '../components/FilterBar/timeUtils';
import { modelIdOf, invalidateLatestPriceCache, productHasDataInCountry } from '../components/ProductCascader/tree';
import { clampMains, autoComparesFor, expandV11Cards, filterMainsByFinancingTerm, migrateV10, mainsValidFor, newCardId, remapMainsForScope, selKey, toggleAllAuto, toggleCardAuto, withAutoOn } from './mainSelection';
import { readUrlOverrides, writeUrlPatch, normalizePlatformSelection, platformUrlParamsOf, platformLevelForChannel } from './urlSync';
import { normalizeDataScope } from '../dataModel/scope';

/** 追补⑨：四类预警全局缺省（阈值小数；own-gap = 低于 15% 视为档位太近） */
export const DEFAULT_ALERT_TYPES: AlertTypeSwitches = {
  'price-change': true,
  promo: true,
  'platform-gap': true,
  'own-gap': true,
};
export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  'price-change': 0.015,
  promo: 0.015,
  'platform-gap': 0.015, // demo 平台因子价差上限 ~1.8%，缺省 1.5% 可触发
  'own-gap': 0.15,
};

/** 平台默认选择：null = 该国默认电渠（数据层 effectiveChannelIds 解析） */
export const DEFAULT_PLATFORM_SELECTION: PlatformSelection | null = null;

/** 国家切换时同步数据层缺省国家与本币注册（纯函数层无 state 访问，靠此读取当前口径） */
function syncScopeRegistries(countryCode: string): void {
  setCurrentCountry(countryCode);
  setLocalCurrencyByCountry(countryCode);
}
syncScopeRegistries('RU');

const firstWeek = dimTime[0]?.week_id ?? '202619';
const lastWeek = dimTime[dimTime.length - 1]?.week_id ?? '202642';

/** §15.4-A13 默认视图（数据相关默认勾选在 loadInitialState 里按数据就绪情况叠加） */
export const defaultFilters: FiltersState = {
  countryCode: 'RU',
  industry: 'phone',
  mains: [],
  platform: DEFAULT_PLATFORM_SELECTION, // null = 该国默认电渠
  granularity: 'week', // 第四十二轮：默认周（迪总「时间默认取周」）
  adaptive: true, // 第十九轮：时间自适应默认开
  rangeStart: firstWeek, // 与周粒度自洽的默认范围（自适应开时会被数据跨度覆盖）
  rangeEnd: lastWeek,
  currency: 'usd', // 默认 USD（真实数据按行内汇率折算）
  priceTypes: { discounted: true, rrp: false }, // 第五十轮：RRP 默认不勾选（图面聚焦折后价；要看账面价手动勾回）
  agg: 'avg',
  platformScopeNotice: null, // R7-M1：稳定版平台口径归一说明（无归一 = null）
  financingTerm: null,
  alertSubs: [], // 第五十二轮：预警中心订阅（默认空，入口 = 看板页签铃铛 / 总览型号块）
  alertTypes: DEFAULT_ALERT_TYPES, // 追补⑨：四类预警全局开关
  alertThresholds: DEFAULT_ALERT_THRESHOLDS, // 追补⑨：四类全局阈值（旧版共用 1.5% 一条线）
  alertProducts: {}, // 追补⑨：按产品覆写（预警中心页维护）
};

/**
 * 默认视图版本：默认态字段（粒度/币种/竞品带出等）变更时 +1。
 * 持久化载荷带上 v；旧版本视为过期 → 本次启动直接落新默认视图（其后照常留存用户改动）。
 * v3（2026-10-14）：+autoMatch 开关、RRP 默认开。
 * v4（2026-10-14）：平台默认选中 OZON（第三十六轮起数据=单平台口径，筛选器显性化）。
 * v5（2026-10-15）：时间默认取周。
 * v6（2026-10-15）：RRP 默认不勾选（第五十轮）。
 * v7（2026-10-14）：+预警中心订阅/阈值字段（第五十二轮）。
 * v8（2026-10-14）：平台默认 = 我司官方店铺「Ozon Россия」单店铺（第五十三轮）；
 *   本轮平台口径改为独立可选，不再随竞品匹配方式锁定。
 * v9（2026-10-16，追补⑨）：预警细化——alertThreshold 单阈值 → alertTypes/alertThresholds
 *   四类开关+阈值 + alertProducts 按产品覆写；v8 持久化迁移保留订阅与旧阈值（三类同值）。
 * v10（2026-10-20）：真实数据接入——SKU/渠道 id 空间全部更换，旧持久化整体失效落新默认。
 * v11（2026-10-21，第一百一十七轮）：own/competitors → mains（每主品卡自带对比区）；
 *   v10 载荷读入后自动迁移（migrateV10：矩阵补对比区）。
 * v12（2026-10-21，第一百二十轮）：卡收敛为唯一主品（main: ProductSelection | null）；
 *   v11 卡 configs[] 展开为逐配置卡（expandV11Cards：首卡继承对比区，其余落空）。
 */
const DEFAULTS_V = 12;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isProductSelection(value: unknown): value is ProductSelection {
  if (!isRecord(value)) return false;
  return typeof value.modelId === 'string'
    && typeof value.romram === 'string'
    && isStringArray(value.skuIds);
}

function isProductSelectionArray(value: unknown): value is ProductSelection[] {
  return Array.isArray(value) && value.every(isProductSelection);
}

function isMainProduct(value: unknown): value is MainProduct {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && (value.main === null || isProductSelection(value.main))
    && isProductSelectionArray(value.compares)
    && (value.auto === undefined || typeof value.auto === 'boolean');
}

/** v11 旧卡形（modelId + configs[]）——读入后 expandV11Cards 展开 */
function isV11MainProduct(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.modelId === 'string'
    && isProductSelectionArray(value.configs)
    && isProductSelectionArray(value.compares);
}

function isMainProductArray(value: unknown): value is MainProduct[] {
  return Array.isArray(value) && value.every(isMainProduct);
}

function isPlatformSelection(value: unknown): value is PlatformSelection | null {
  if (value === null) return true;
  return (
    isRecord(value) &&
    isStringArray(value.platforms) &&
    isStringArray(value.shopIds) &&
    (value.seller === undefined || value.seller === null || typeof value.seller === 'string')
  );
}

/** R7-M1：持久化里的归一说明（provenance）形状校验——note 文本 + 目标国 +
 *  描述的归一后口径；坏形状跳过该字段（不入 required，不作废整包）。 */
function isPlatformScopeNotice(value: unknown): value is PlatformScopeNotice {
  if (!isRecord(value)) return false;
  return typeof value.note === 'string'
    && typeof value.countryCode === 'string'
    && isPlatformSelection(value.platform);
}

function isPriceTypes(value: unknown): value is FiltersState['priceTypes'] {
  return isRecord(value) && typeof value.discounted === 'boolean' && typeof value.rrp === 'boolean';
}

function isAlertTypes(value: unknown): value is AlertTypeSwitches {
  return isRecord(value)
    && typeof value['price-change'] === 'boolean'
    && typeof value.promo === 'boolean'
    && typeof value['platform-gap'] === 'boolean'
    && typeof value['own-gap'] === 'boolean';
}

function isPartialAlertTypes(value: unknown): value is Partial<AlertTypeSwitches> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, item]) =>
    (key === 'price-change' || key === 'promo' || key === 'platform-gap' || key === 'own-gap')
    && typeof item === 'boolean',
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isAlertThresholds(value: unknown): value is AlertThresholds {
  return isRecord(value)
    && isFiniteNumber(value['price-change'])
    && isFiniteNumber(value.promo)
    && isFiniteNumber(value['platform-gap'])
    && isFiniteNumber(value['own-gap']);
}

function isPartialAlertThresholds(value: unknown): value is Partial<AlertThresholds> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, item]) =>
    (key === 'price-change' || key === 'promo' || key === 'platform-gap' || key === 'own-gap')
    && isFiniteNumber(item),
  );
}

function isAlertProducts(value: unknown): value is FiltersState['alertProducts'] {
  if (!isRecord(value)) return false;
  return Object.values(value).every((rule) => {
    if (!isRecord(rule)) return false;
    if (rule.types !== undefined && !isPartialAlertTypes(rule.types)) return false;
    if (rule.thresholds !== undefined && !isPartialAlertThresholds(rule.thresholds)) return false;
    return true;
  });
}

/** 读出的持久化载荷：v12 载 mains；v11 载旧卡形（随后展开）；v10 载旧 own/competitors */
interface PersistedPayload extends Partial<FiltersState> {
  v?: number;
  legacyOwn?: ProductSelection[];
  legacyCompetitors?: ProductSelection[];
  legacyV11Mains?: { modelId: string; configs: ProductSelection[]; compares: ProductSelection[] }[];
}

/**
 * 仅接收可安全消费的持久化字段。
 * localStorage 可能来自旧版本、手工编辑或损坏 JSON，不能直接 spread 到状态里，
 * 否则 `mains: null`、`platform: "..."` 等值会在渲染期间触发运行时异常。
 */
function readPersistedState(raw: string | null): PersistedPayload | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const v = typeof parsed.v === 'number' ? parsed.v : 0;
    if (v !== 10 && v !== 11 && v !== 12) return null;

    const mainsOk = v === 12 ? isMainProductArray(parsed.mains) : v === 11
      ? Array.isArray(parsed.mains) && parsed.mains.every(isV11MainProduct)
      : false;
    const checks: Array<[keyof FiltersState | 'legacyOwn' | 'legacyCompetitors' | 'legacyV11Mains', boolean]> = [
      [v === 12 ? 'mains' : v === 11 ? ('legacyV11Mains' as const) : 'legacyOwn', v === 10 ? isProductSelectionArray(parsed.own) : mainsOk],
      [v === 10 ? 'legacyCompetitors' : 'platform', v === 10 ? isProductSelectionArray(parsed.competitors) : isPlatformSelection(parsed.platform)],
      ['platform', isPlatformSelection(parsed.platform)],
      // R7-M1：归一说明随包留存（坏形状跳过，不作废整包——口径本身仍合法可恢复）
      ['platformScopeNotice', parsed.platformScopeNotice == null || isPlatformScopeNotice(parsed.platformScopeNotice)],
      ['financingTerm', parsed.financingTerm == null || parsed.financingTerm === 24 || parsed.financingTerm === 36],
      // 口径（国家/产业）随载荷恢复：写侧一直整包写入，读侧漏掉会让裸根链接的
      // 新会话静默回落 RU/phone 并把旧国家选择当无效覆盖掉。值非法/缺失 =
      // 跳过该项落默认口径（不入 required，不因此作废整包）。
      ['countryCode', typeof parsed.countryCode === 'string' && dimRegion.some((r) => r.country_code === parsed.countryCode)],
      ['industry', parsed.industry === 'phone' || parsed.industry === 'tablet' || parsed.industry === 'wearable'
        || parsed.industry === 'audio' || parsed.industry === 'iot' || parsed.industry === 'pc'],
      ['granularity', parsed.granularity === 'week' || parsed.granularity === 'month' || parsed.granularity === 'quarter'],
      ['adaptive', typeof parsed.adaptive === 'boolean'],
      ['rangeStart', typeof parsed.rangeStart === 'string'],
      ['rangeEnd', typeof parsed.rangeEnd === 'string'],
      ['currency', parsed.currency === 'usd' || parsed.currency === 'local'],
      ['priceTypes', isPriceTypes(parsed.priceTypes)],
      ['agg', parsed.agg === 'avg' || parsed.agg === 'min'],
      // 第一百二十六轮：autoMatch 键退役——旧载荷里的残留值不读不写
      ['alertSubs', isStringArray(parsed.alertSubs)],
      ['alertTypes', isAlertTypes(parsed.alertTypes)],
      ['alertThresholds', isAlertThresholds(parsed.alertThresholds)],
      ['alertProducts', isAlertProducts(parsed.alertProducts)],
    ];
    const required = checks.filter(([key]) =>
      key !== 'alertTypes' && key !== 'alertThresholds' && key !== 'alertProducts'
      && key !== 'countryCode' && key !== 'industry'
      // R7-M1：归一说明是可再生物质（口径本身可重新归一），坏形状/缺失只跳过字段
      && key !== 'platformScopeNotice'
      && key !== 'financingTerm'
      // v10/v11 复用的 platform 键形随数据换代漂移（渠道 id 空间两度更换）：
      // 不再因它作废整包——无效时跳过该字段回落默认电渠（与 countryCode 同等
      // 宽限，可迁移的用户选择不陪葬）；v12 载荷 platform 仍在 required
      && !(v !== 12 && key === 'platform'));
    if (required.some(([, valid]) => !valid)) return null;

    const rest: PersistedPayload = { v };
    for (const [key, valid] of checks) {
      if (!valid) continue;
      if (key === 'legacyOwn') rest.legacyOwn = parsed.own as ProductSelection[];
      else if (key === 'legacyCompetitors') rest.legacyCompetitors = parsed.competitors as ProductSelection[];
      else if (key === 'legacyV11Mains')
        rest.legacyV11Mains = parsed.mains as { modelId: string; configs: ProductSelection[]; compares: ProductSelection[] }[];
      else if (key !== 'mains' || v === 12) {
        // 缺失的可选字段（R7-M1 platformScopeNotice 未写入时）不落显式 undefined，
        // 避免 spread 覆盖默认值
        const value = (parsed as UnknownRecord)[key];
        if (value !== undefined) (rest as UnknownRecord)[key] = value;
      }
    }
    return rest;
  } catch {
    return null;
  }
}

/**
 * 某国某产业的默认勾选：
 * - 主分析 = 产品竞品矩阵该国该产业首个有数型号（dim_region.default_own_models），
 *   取其首个配置（配置名升序，须在该国有数据）的最低价颜色成卡；
 *   矩阵未覆盖的国家回退该国该产业首个华为型号
 * - 对比区 = 该主品配置的分国对标（groupsFromBenchmark，主竞品在前）
 */
function computeDataDefaults(countryCode: string, industry: Industry, financingTerm: FinancingTerm | null = null): Partial<FiltersState> {
  if (!dimProduct.length) return {};
  syncScopeRegistries(countryCode);
  const region = dimRegion.find((r) => r.country_code === countryCode);
  const preferred = region?.default_own_models[industry];
  const inCountry = (p: (typeof dimProduct)[number]) => p.is_own && p.industry === industry && productHasDataInCountry(p, countryCode, financingTerm);
  let candidates = preferred ? dimProduct.filter((p) => p.model_id === preferred && inCountry(p)) : [];
  if (!candidates.length) candidates = dimProduct.filter(inCountry);
  if (!candidates.length) return { mains: [] };
  const modelId = modelIdOf(candidates[0]);
  const romrams = [...new Set(candidates.filter((p) => p.model_id === modelId).map((p) => p.romram))].sort();
  for (const romram of romrams) {
    const skuId = countryCode === 'ZA'
      ? candidates.find((p) => p.model_id === modelId && p.romram === romram && factPriceMonthly.some((row) => row.sku_id === p.sku_id
        && row.review_status === 'PASS'
        && row.price_type === 'installment'
        && (row.term_months === 24 || row.term_months === 36)
        && (financingTerm == null || row.term_months === financingTerm)
        && row.price_local != null))?.sku_id ?? null
      : lowestPriceColorSku(modelId, romram, countryCode);
    if (!skuId) continue;
    const config: ProductSelection = { modelId, romram, skuIds: [skuId] };
    // 默认卡 = 匹配竞品开（与默认视图「对比自动匹配开」的既有语义一致；
    // 华为主品矩阵未覆盖时对比区为空、开关保持开着随矩阵更新跟随）。
    // 对比区与自动匹配路径同源（autoComparesFor：剔主品自身组、卡配额收口），
    // 不再直接取矩阵行——矩阵含主品自身组时会主品/对比重复占线
    const mains: MainProduct[] = [{ id: newCardId(), main: config, compares: autoComparesFor({ id: '', main: config, compares: [] }), auto: true }];
    return { mains };
  }
  return { mains: [] };
}

/* ---------- 迭代线实现（e98d9b1） ---------- */
/** 口径（国家/产业）变化后的状态整理：规范作用域、平台归一化到目标国可落地
 *  范围（R5-M1 共享规则：不可落地部分剔除、全部不可落地回默认电渠，同国有效
 *  平台与 shopIds 保留）、主分析失效时按新口径重算默认卡；开启「自动匹配竞品」
 *  的组对比区随新口径矩阵重算（矩阵分国，维表换代同样在启动读档时借此自愈） */
function applyScopeDefaultsIterate(s: FiltersState, force: boolean): FiltersState {
  // R4-m1：坏载荷/外部调用可能给出 mains:undefined——入口归一，后续 .length/.map 不崩
  const state: FiltersState = Array.isArray(s.mains) ? s : { ...s, mains: [] };
  const scope = normalizeDataScope({ countryCode: state.countryCode, industry: state.industry });
  syncScopeRegistries(scope.countryCode);
  // 空 mains = 用户显式清空（空态），读档/读链接时不回填默认卡；口径切换
  // 走 switchScope 的 force=true 照常重算默认卡
  const scopedMains = filterMainsByFinancingTerm(state.mains, scope.countryCode, scope.industry, state.financingTerm);
  const needMain = force || (state.mains.length > 0 && !mainsValidFor(scopedMains, scope.countryCode, scope.industry, state.financingTerm));
  const defaults = needMain ? computeDataDefaults(scope.countryCode, scope.industry, state.financingTerm) : {};
  const next: FiltersState = {
    ...state,
    ...scope,
    // R5-M1：平台归一化走与 Agent 跨国计算/回看同一共享规则——部分可落地保留
    // 有效子集（旧逻辑整体清空会误伤多平台勾选的合法部分），全部不可落地回
    // 默认电渠（null）
    platform: platformSelectionForCountry(state.platform, scope.countryCode),
    ...defaults,
    mains: needMain ? (defaults.mains ?? []) : scopedMains,
  };
  // 卖家细化合法性：单渠道且该渠道确有此卖家（URL/旧持久化漂移防御）——
  // 不合法只剥 seller，渠道选择保留（回渠道内最低价口径）
  if (next.platform?.seller) {
    const ch = next.platform.shopIds[0];
    const ok =
      next.platform.shopIds.length === 1 &&
      ch != null &&
      sellersOfChannel(scope.countryCode, ch).some((x) => x.seller === next.platform!.seller);
    if (!ok) next.platform = { ...next.platform, seller: null };
  }
  next.mains = next.mains.map((c) => (c.auto && c.main ? withAutoOn(c) : c));
  return next;
}

/** 口径切换（国家/产业变化）+ 按国快照：切走前把当前整套产品卡存该国会话快照；
 *  目的国存在本会话快照且仍有效（产品在新口径有数据）时恢复快照而非重算默认卡——
 *  高频的国家来回切换不再静默清空用户搭好的选择。快照会话级（关页即清），
 *  不跨会话复活旧选择。
 *  R5（主品口径跨国保持，2026-11-07 二审）：patch 显式携带 mains（Agent 跨国
 *  结果卡「回看价格走势」等跳转动作）且整组在目标口径有效时以 patch.mains 为准
 *  ——不恢复按国快照、不被 applyScopeDefaultsIterate(force=true) 重算成默认主品；
 *  无显式 mains 的普通国家切换行为保持原样（快照恢复 / 默认重算）。
 *  R2（本轮返修 M1b，同步稳定线 7edadc6）：explicitMains = 调用方补丁自身显式
 *  携带非空 mains（Agent 结果卡跨国回看/定位的 filterPatch、undo/redo 整态快照）；
 *  普通 UI 换国补丁不带 mains，next.mains 只是旧状态继承，不得按显式口径对待
 *  ——否则 RU→DE→RU 会把 DE 的默认主品当成 RU 的显式选择，丢掉 RU 快照。显式
 *  口径先经 remapMainsForScope 整组合法化（同型号换目标国首个合法配置）并更新
 *  目标国快照，型号整体缺席才回落快照恢复 / 默认重算。 */
function switchScopeIterate(prev: FiltersState, next: FiltersState, explicitMains = false): FiltersState {
  // 快照键含产业维度：纯产业切换同样要保住「回切后还原」，键只按国会把
  // 当前产业的卡覆盖进该国快照，回切时校验不过即永久丢卡
  const snapKeyOf = (cc: string, industry: string) => `${LPL.filters}.mainsOf.${cc}.${industry}`;
  const writeSnapshot = (cc: string, industry: string, mains: MainProduct[]) => {
    try {
      sessionStorage.setItem(snapKeyOf(cc, industry), JSON.stringify({ mains }));
    } catch {
      /* 存储不可用时跳过快照，走默认重算 */
    }
  };
  // 无条件落盘（含清空后的空数组）：空数组 = 用户显式清空的合法快照，不写
  // 会让清空前的旧快照残留，来回切口径时复活、显式清空被静默撤销
  writeSnapshot(prev.countryCode, prev.industry, prev.mains);
  // 有效性按规范后的目标口径判定（applyScopeDefaultsIterate 内部同样先 normalize，
  // 此处先取一次保证判定与落地口径一致）
  const scope = normalizeDataScope({ countryCode: next.countryCode, industry: next.industry });
  if (explicitMains) {
    // R4-S3（同步稳定线 5f5898d）：显式空数组 = 清空态——落到空看板，不查目标国
    // 快照（否则旧快照复活、显式清空被静默撤销）、不回填默认，并把目标国快照
    // 同步为空（此后普通切走/切回都保持空态）
    if (next.mains.length === 0) {
      writeSnapshot(scope.countryCode, scope.industry, []);
      return applyScopeDefaultsIterate({ ...next, ...scope, mains: [] }, false);
    }
    // R2 M1a：显式口径先整组合法化——精确合法配置原样保留，同型号配置/SKU 在
    // 目标国不存在时映射到该国首个合法配置（RU Mate X6 12+512 → ID 16+512），
    // 型号整体缺席的卡剔除；全部缺席回落默认/快照。合法化后的口径同时更新目标
    // 国快照（其后普通切走/切回按这套口径还原）。
    const remapped = remapMainsForScope(next.mains, scope.countryCode, scope.industry);
    if (remapped) {
      writeSnapshot(scope.countryCode, scope.industry, remapped);
      return applyScopeDefaultsIterate({ ...next, ...scope, mains: remapped }, false);
    }
    // 型号整体缺席 → 下方快照恢复 / 默认重算路径安全回落
  }
  const applied = applyScopeDefaultsIterate(next, true);
  try {
    const raw = sessionStorage.getItem(snapKeyOf(applied.countryCode, applied.industry));
    if (raw) {
      const snap = JSON.parse(raw) as { mains: unknown };
      const mains = isMainProductArray(snap.mains) ? snap.mains : null;
      // 空数组也是合法快照：还原空态而非回落重算默认卡；非空快照仍须整组在新
      // 口径有效。mainsValidFor 对空数组返回 false 的既有语义不动（读档重算
      // 判定还依赖它），此处单独放行空快照
      if (mains && (!mains.length || mainsValidFor(mains, applied.countryCode, applied.industry, applied.financingTerm))) {
        // R4-S2（同步稳定线 5f5898d）：快照还原同样过整组合法化——主品逐 SKU
        // 过滤/同型号映射，手动对比区按目标口径校验/映射、selKey 去重、排除与
        // 主品同组的条目、封 COMPARES_PER_CARD_CAP（cap3）；auto 标记保留，auto
        // 卡对比区由 withAutoOn 按目标国矩阵重算。空快照 = 显式清空态原样还原。
        if (!mains.length) return { ...applied, mains: [] };
        const restored = remapMainsForScope(mains, applied.countryCode, applied.industry);
        if (restored) {
          return { ...applied, mains: restored.map((c) => (c.auto && c.main ? withAutoOn(c, applied.countryCode) : c)) };
        }
      }
    }
  } catch {
    /* 坏 JSON / 类型不符：走默认重算 */
  }
  // R4-m1：无有效快照时，先尝试旧 mains 同型号重映射（remapMainsForScope 保
  // 原型号换目标国合法配置：RU Mate X6 12+512 → ID Mate X6 16+512），映射结果
  // 同步写入目标国快照；型号整体缺席才回落 applyScopeDefaultsIterate(force=true) 的
  // 默认重算（RU Mate X6 → DE 无该型号 → nova 14 Pro）。显式 mains 口径已在
  // 上方分支处理，不会走到这里重复映射。
  const inheritedMains = Array.isArray(next.mains) ? next.mains : [];
  if (inheritedMains.some((card) => card.main)) {
    const remapped = remapMainsForScope(inheritedMains, applied.countryCode, applied.industry);
    if (remapped) {
      writeSnapshot(applied.countryCode, applied.industry, remapped);
      return applyScopeDefaultsIterate({ ...applied, mains: remapped }, false);
    }
  }
  return applied;
}

/* ---------- 稳定线实现（4966d02） ---------- */
/** t428u R7-M1 · 归一说明（provenance）的统一收口：任何入口（load / actions.set /
 *  换国 applyScopeDefaults）过 normalizePlatformScope 后由此决定 state 上的说明——
 *  - 本次归一产生了说明（剔除/透明展开）→ 以本次结果为准（幂等：同输入同说明，
 *    单字段存续，不可能重复叠加）；
 *  - 归一幂等无说明（输入已是合法平台级）→ 沿用「仍能描述当前口径」的既有说明
 *    （补丁/快照随带的说明优先于继承值——undo 整态恢复），否则清空：换国、
 *    deliberate 换平台/重置后旧说明不再成立，绝不泄漏陈旧口径；
 *  - 迭代版恒 null（无稳定版能力归一，Agent 卡内说明照旧由计算侧现场产出）。
 *  t428u R8-M1 · 候选分两层：incoming（补丁/快照随带）之后还有 inherited（落地前
 *  state 上的既有说明）——Agent 结果卡 open/apply 补丁携带的是归一后的规范平台
 *  且不带说明键（validateFilterPatch 也不放行该键），幂等归一无新说明时按 R7 会
 *  把仍成立的说明清掉（同口径交接丢失 provenance）。继承同样过「国家 + 口径集合
 *  相等」校验：真正换国/换平台/重置的旧说明描述不了新口径，自然不成立；补丁
 *  显式 platformScopeNotice:null = deliberate 清除（跳过继承），缺键 ≠ 显式 null。 */
function resolveScopeNotice(
  countryCode: string,
  scope: LawfulPlatformScope,
  incoming: PlatformScopeNotice | null | undefined,
  inherited?: PlatformScopeNotice | null,
): PlatformScopeNotice | null {
  if (!STABLE) return null;
  if (scope.note) return { note: scope.note, countryCode, platform: scope.platform };
  if (incoming && incoming.countryCode === countryCode && platformQueryEquals(incoming.platform, scope.platform)) return incoming;
  if (inherited && inherited.countryCode === countryCode && platformQueryEquals(inherited.platform, scope.platform)) return inherited;
  return null;
}

/** 口径（国家/产业）变化后的状态整理：规范作用域、平台/店铺归一到目标国合法
 *  口径（R5-M1：共享 lawfulPlatformScope——保留合法子集，全部非法才回 null，
 *  seller 合法性同函数处理；R6-M1：稳定版再经 normalizePlatformScope 把店铺级
 *  透明展开为平台级——Agent 结果卡 open/apply 补丁落地后的 state 不再保留
 *  shopIds，与计算/导航口径一致；R7-M1：归一说明随 state 落地，页内条幅与
 *  Agent 卡边界据此展示展开/剔除事实）、主分析先整组同型号合法化
 *  （R4-m1/S1：逐 SKU 过滤 / 同配置换 SKU / 同型号首个合法配置），全部型号
 *  缺席才重算默认卡；开启「自动匹配竞品」的组对比区随新口径矩阵重算（矩阵
 *  分国，维表换代同样在启动读档时借此自愈） */
function applyScopeDefaultsStable(s: FiltersState, force: boolean): FiltersState {
  const scope = normalizeDataScope({ countryCode: s.countryCode, industry: s.industry });
  syncScopeRegistries(scope.countryCode);
  const platformScope = normalizePlatformScope(scope.countryCode, s.platform);
  const platformScopeNotice = resolveScopeNotice(scope.countryCode, platformScope, s.platformScopeNotice);
  // 空 mains = 用户显式清空（空态），读档/读链接时不回填默认卡；口径切换
  // 走 switchScope 的 force=true 照常重算默认卡。R4-m1：旧选择先尝试同型号
  // 合法化，落得下就保留（RU Mate X6 12+512 → ID 16+512），不再一律默认重算
  const sanitized = s.mains.length ? remapMainsForScope(s.mains, scope.countryCode, scope.industry) : s.mains;
  const mains = filterMainsByFinancingTerm(sanitized ?? [], scope.countryCode, scope.industry, s.financingTerm);
  const needMain = force || (s.mains.length > 0 && mains.length === 0);
  const defaults = needMain ? computeDataDefaults(scope.countryCode, scope.industry, s.financingTerm) : {};
  const next: FiltersState = {
    ...s,
    ...scope,
    platform: platformScope.platform,
    platformScopeNotice,
    mains: needMain ? (defaults.mains ?? []) : mains,
  };
  next.mains = next.mains.map((c) => (c.auto && c.main ? withAutoOn(c) : c));
  return next;
}

/** 口径切换（国家/产业变化）+ 按国快照。R4-m1 普通换国优先级：
 *  0) 切走前无条件存离建国快照（含显式清空的空数组）；
 *  1) 目标国存在仍合法的会话快照 → 优先还原（R4-S2：对比区同口径校验/剥离、
 *     封 COMPARES_PER_CARD_CAP，保留合法手动搭配与 auto 模式）；
 *  2) 无快照 → 旧选择同型号映射目标国首个合法配置（RU Mate X6 12+512 →
 *     ID 16+512），绝不把继承口径误当显式选择写回来源国快照；
 *  3) 同型号也无 → 目标国默认重算。
 *  显式 mains（R3 M1b + R4-S3/S4）：补丁自带 mains 键（含显式空数组）才是
 *  显式口径——非空经 remapMainsForScope 合法化并同步目标国快照；显式空 = 清空
 *  态，不查快照、不回填默认；显式但型号全缺席回落 (1)→(3)（不重映射旧状态，
 *  与「显式缺型号落默认」的既有契约一致）。快照会话级（关页即清），不跨会话
 *  复活旧选择。 */
function switchScopeStable(prev: FiltersState, next: FiltersState, explicitMains: boolean): FiltersState {
  // 快照键含产业维度：纯产业切换同样要保住「回切后还原」，键只按国会把
  // 当前产业的卡覆盖进该国快照，回切时校验不过即永久丢卡
  const snapKeyOf = (cc: string, industry: string) => `${LPL.filters}.mainsOf.${cc}.${industry}`;
  const writeSnapshot = (cc: string, industry: string, mains: MainProduct[]) => {
    try {
      sessionStorage.setItem(snapKeyOf(cc, industry), JSON.stringify({ mains }));
    } catch {
      /* 存储不可用时跳过快照，走默认重算 */
    }
  };
  // 无条件落盘（含清空后的空数组）：空数组 = 用户显式清空的合法快照，不写
  // 会让清空前的旧快照残留，来回切口径时复活、显式清空被静默撤销
  writeSnapshot(prev.countryCode, prev.industry, prev.mains);
  if (explicitMains) {
    // R4-S3：显式空数组 = 清空态——落到空看板，不查快照、不回填默认，
    // 并把目标国快照同步为空（此后普通切走/切回都保持空态）
    if (next.mains.length === 0) {
      writeSnapshot(next.countryCode, next.industry, []);
      return applyScopeDefaultsStable({ ...next, mains: [] }, false);
    }
    // R3 M1a/R5 + R4-S1：显式口径先整组合法化（逐 SKU 过滤/同型号映射）；
    // 合法化后的口径同步目标国快照。auto 卡对比区仍由 applyScopeDefaultsStable
    // 末尾 withAutoOn 按目标国矩阵重算，手动对比区只留合法条目
    const remapped = remapMainsForScope(next.mains, next.countryCode, next.industry);
    if (remapped) {
      writeSnapshot(next.countryCode, next.industry, remapped);
      return applyScopeDefaultsStable({ ...next, mains: remapped }, false);
    }
    // 型号整体缺席 → 下方安全回落（快照 → 默认重算）；explicitAbsent 标记
    // 让回落不再对补丁里的缺席口径做同型号重映射（缺型号 = 落默认，不是猜旧选择）
    return scopeFallbackStable(next, snapKeyOf, true);
  }
  return scopeFallbackStable(next, snapKeyOf, false);
}

/** 快照 → 同型号映射 → 默认重算的公共回落（R4-m1 优先级 1-3）。 */
function scopeFallbackStable(
  next: FiltersState,
  snapKeyOf: (cc: string, industry: string) => string,
  explicitAbsent: boolean,
): FiltersState {
  const applied = applyScopeDefaultsStable(next, true);
  try {
    const raw = sessionStorage.getItem(snapKeyOf(applied.countryCode, applied.industry));
    if (raw) {
      const snap = JSON.parse(raw) as { mains: unknown };
      const mains = isMainProductArray(snap.mains) ? snap.mains : null;
      // 空数组也是合法快照：还原空态而非回落重算默认卡；非空快照仍须整组在新
      // 口径有效（R3 M1a 起含配置/SKU 校验）。mainsValidFor 对空数组返回 false
      // 的既有语义不动（读档重算判定还依赖它），此处单独放行空快照
      if (mains && !mains.length) return { ...applied, mains: [] };
      if (mains && mainsValidFor(mains, applied.countryCode, applied.industry, applied.financingTerm)) {
        // R4-S2：快照还原同样过整组合法化——主品逐 SKU 过滤，手动对比区按目标
        // 口径校验/剥离（型号缺席剔除、配置漂移同型号映射）、selKey 去重、对比区
        // 封 COMPARES_PER_CARD_CAP；auto 标记与合法手动搭配保留
        const restored = remapMainsForScope(mains, applied.countryCode, applied.industry);
        if (restored) {
          return { ...applied, mains: restored.map((c) => (c.auto && c.main ? withAutoOn(c, applied.countryCode) : c)) };
        }
      }
    }
  } catch {
    /* 坏 JSON / 类型不符：走同型号映射 / 默认重算 */
  }
  // R4-m1 (2)：无合法快照时，旧选择同型号映射目标国首个合法配置
  // （RU Mate X6 12+512 → ID 16+512）。显式缺型号的回落不走这条路
  if (!explicitAbsent && next.mains.length) {
    const remapped = remapMainsForScope(next.mains, next.countryCode, next.industry);
    if (remapped) return applyScopeDefaultsStable({ ...next, mains: remapped }, false);
  }
  // (3) 同型号也无 → 目标国默认重算
  return applied;
}

// ------------------------------------------------------------
// 2026-11-07 整合（稳定线 4966d02 × 迭代线 e98d9b1）：口径整理两条线各自按产品
// 验收（稳定 R3–R8 / 迭代 R2–R7），同名函数在两线实现不同——稳定版用稳定线原样
// 实现（含 R6–R8 平台级透明归一 + 归一说明），迭代版用迭代线原样实现（R5-M1 共享
// 落地规则 + 每线口径归一），按构建通道 STABLE 分发；两线各自的测试锁住各自行为。
// ------------------------------------------------------------
function applyScopeDefaults(s: FiltersState, force: boolean): FiltersState {
  const scoped = STABLE ? applyScopeDefaultsStable(s, force) : applyScopeDefaultsIterate(s, force);
  return applyMarketDataProfile(scoped);
}

function switchScope(prev: FiltersState, next: FiltersState, explicitMains = false): FiltersState {
  return STABLE ? switchScopeStable(prev, next, explicitMains) : switchScopeIterate(prev, next, explicitMains);
}

function applyMarketDataProfile(state: FiltersState): FiltersState {
  const profile = marketDataProfileOf(state.countryCode);
  if (!profile.granularityLocked) {
    return state.financingTerm == null ? state : { ...state, financingTerm: null };
  }
  const publishedRange = publishedMonthlyRangeOf(factPriceMonthly, state.countryCode);
  const range = state.granularity === profile.granularity
    ? { start: state.rangeStart, end: state.rangeEnd }
    : publishedRange ?? convertRangeBuckets(state.rangeStart, state.rangeEnd, state.granularity, profile.granularity);
  const financingTerm = state.financingTerm === 24 || state.financingTerm === 36 ? state.financingTerm : null;
  return {
    ...state,
    granularity: profile.granularity,
    rangeStart: range.start,
    rangeEnd: range.end,
    financingTerm,
  };
}

/**
 * 启动恢复：
 * 1) 无持久化 / 持久化版本旧于 v10 → 新默认视图（周 · USD · 默认主分析卡 + 其配置对比）；
 * 2) v11/v12 → mains 照原样恢复；v10 → own/competitors 迁移成卡（migrateV10，矩阵补对比区）。
 * 第一百二十六轮起无启动自愈重算——对比区以持久化为准，可用「全部自动匹配」一键取回。
 */
function loadBaseState(): FiltersState {
  let restored: FiltersState | null = null;
  let raw: string | null = null;
  try {
    raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LPL.filters);
  } catch {
    // 隐私模式/受限 iframe 中 localStorage 可能可见但不可读；直接走默认状态。
  }
  const parsed = readPersistedState(raw);
  if (parsed) {
    // ≤v9 一律落默认（readPersistedState 只放行 v10/11/12）
    const { v: _v, legacyOwn, legacyCompetitors, legacyV11Mains, ...rest } = parsed;
    restored = { ...defaultFilters, ...rest } as FiltersState;
    // 平台单选归一：旧持久化的多选形态（platforms 多值 / shopIds 渠道下钻）取第一个平台；
    // 稳定版再降店铺级 → 平台级（2026-11-05 复检整改3，Eason：默认视图不再钉具体店铺，
    // 平台级自动 = 平台内每周最低价店铺；迭代版原样）。
    // R7-M1（第七轮评审）：稳定版撤掉这两道「有损前置归一」——多平台取一/店铺优先
    // 会先把原始完整输入裁掉（DNS+AE:noon:3P 丢 DNS、DNS+RU:ozon:3P 丢 DNS），
    // 后置的 normalizePlatformScope 只能对着残缺输入归一。原始输入原样进
    // applyScopeDefaults，由共享的「国家合法 + 稳定版能力」一体化归一处理：
    // 非法店铺剔除、合法店铺透明展开所属平台、与显式平台并集去重，全部过程
    // 进归一说明（platformScopeNotice，页内可见）。迭代版路径逐字节不变。
    if (!STABLE) {
      restored.platform = normalizePlatformSelection(restored.platform);
      restored.platform = platformLevelForChannel(restored.platform);
    }
    // 迁移里的矩阵查询（groupsFromBenchmark）按数据层缺省国家取分国对标，须先切到载荷国家，
    // 否则迁移产出的对比区会被别的国家矩阵固化写回
    syncScopeRegistries(restored.countryCode);
    // v10 → v12（第一百一十七轮起）：own/competitors → 逐配置卡
    if (parsed.v === 10) {
      restored.mains = migrateV10(legacyOwn ?? [], legacyCompetitors ?? []);
    }
    // v11 → v12（第一百二十轮）：卡 configs[] 展开为逐配置卡
    if (parsed.v === 11 && legacyV11Mains) {
      restored.mains = expandV11Cards(legacyV11Mains);
    }
    // v12 主路径同样收口卡数/对比配额（与 v10/v11/URL 三条入口对称，
    // 手工编辑过的存储不至于把超限卡直接喂给图表）
    if (parsed.v === 12) {
      restored.mains = clampMains(restored.mains);
    }
  }
  // 无持久化 = 首次打开：强制重算默认卡（默认视图 = 默认卡 + 匹配竞品）。
  // 只在「确有持久化载荷」时才尊重空 mains（用户显式清空态，刷新不回填）——
  // 139 轮把 needMain 收紧为「mains 非空且失效才重算」时漏了这条首次路径，
  // 新用户/清过存储的浏览器首屏永远空态（第 144 轮补）
  if (!restored) return applyScopeDefaults({ ...defaultFilters }, true);
  return applyScopeDefaults(restored, false);
}

/** 启动时才应用 URL；reset 直接从默认态重建，不经此处（避免 URL 覆写锁死重置结果）。 */
function applyUrlOverrides(base: FiltersState): FiltersState {
  // 追补⑩（建议③）：URL 覆写最后应用——分享链接 > 持久化 > 默认视图
  const url = readUrlOverrides();
  let restored = base;
  // 先把数据层缺省国家切到链接指定国家（后续矩阵查询按它取分国对标）
  syncScopeRegistries(url.filters.countryCode ?? base.countryCode);
  if (url.filters.mains?.length) {
    // URL 只声明主品结构；对比区尽量沿用持久化里同「型号×配置」卡的手动搭配
    //（否则刷新/分享链接会清掉用户手动配好的对比）
    const persistedByKey = new Map(
      base.mains.flatMap((c) => (c.main ? [[selKey(c.main), c] as const] : [])),
    );
    const merged = url.filters.mains.map((card) => {
      const prev = card.main ? persistedByKey.get(selKey(card.main)) : undefined;
      return prev ? { ...card, compares: prev.compares, auto: prev.auto } : card;
    });
    restored = {
      ...restored,
      ...url.filters,
      mains: merged,
    };
  } else if (Object.keys(url.filters).length > 0) {
    restored = { ...restored, ...url.filters };
  }
  return applyScopeDefaults(restored, false);
}

function loadInitialState(): FiltersState {
  return applyUrlOverrides(loadBaseState());
}

interface FiltersCtx {
  state: FiltersState;
  actions: FiltersActions;
}

const Ctx = createContext<FiltersCtx>({
  state: defaultFilters,
  actions: { set: () => {}, reset: () => {}, setMains: () => {}, setCardCompares: () => {}, autoMatchCard: () => {}, autoMatchAll: () => {}, setSelectionPlatform: () => {}, setGranularity: () => {}, toggleAlertSub: () => {}, setAlertSubs: () => {}, setAlertTypes: () => {}, setAlertThresholds: () => {}, setAlertProductRule: () => {} },
});

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FiltersState>(loadInitialState);

  // 持久化：任意变更写 LPL3.filters（§15.4 默认态可按用户习惯留存）；载荷带默认视图版本号
  useEffect(() => {
    try {
      localStorage.setItem(LPL.filters, JSON.stringify({ ...state, v: DEFAULTS_V }));
    } catch {
      /* 存储不可用时仅内存生效 */
    }
  }, [state]);

  // 追补⑩（建议③）：筛选口径同步到 URL query（replaceState 不产生历史记录；
  // 只写本 Provider 管的键，页签 p 由 PageProvider 写，互不覆盖）
  useEffect(() => {
    const mainKeys = state.mains.flatMap((m) =>
      m.main ? [`${m.main.modelId}__${m.main.romram.replace(/\s+/g, '')}`] : [],
    );
    // 平台/店铺单选写入：店铺级选择 = plat={平台}&shop={渠道id}（平台由渠道反查）；
    // 仅平台级（旧兼容）只写 plat=；未选 = 双 null 删键（连同旧链接残留的 shop=）。
    // 与 readUrlOverrides 的归一化读取对称（读侧同存时 shop= 优先，数据层不动）。
    // 稳定版（2026-11-05 复检整改3，Eason）：不再钉具体店铺——state.platform 先经
    // platformLevelForChannel 降级（平台级），shop=/seller= 恒写 null 删键，把旧
    // 链接/旧会话残留从地址栏剥离；plat= 继续承载全局平台（价格/量价两页同键，
    // 与读侧「stable 忽略 shop=」成对，互不打架）。迭代版 = platformLevelForChannel
    // 原样透传，写入行为逐字节不变
    const { plat, shop, seller } = platformUrlParamsOf(platformLevelForChannel(state.platform));
    // 第一百三十八轮：时间范围/价格显示/汇总口径入链（rs/re/pt/agg）——分享链接
    // 带全取数上下文；自适应态不写范围（接收方随数据自动算），读入 rs/re 即退出自适应
    const ptCode = state.priceTypes.discounted && state.priceTypes.rrp
      ? 'dr'
      : state.priceTypes.discounted
        ? 'd'
        : state.priceTypes.rrp
          ? 'r'
          : null;
    writeUrlPatch({
      c: state.countryCode,
      i: state.industry,
      g: state.granularity,
      cur: state.currency,
      main: mainKeys.join(',') || null,
      plat,
      shop,
      seller,
      rs: state.adaptive ? null : state.rangeStart || null,
      re: state.adaptive ? null : state.rangeEnd || null,
      pt: ptCode,
      agg: state.agg,
    });
  }, [
    state.countryCode,
    state.industry,
    state.granularity,
    state.currency,
    state.mains,
    state.platform,
    state.adaptive,
    state.rangeStart,
    state.rangeEnd,
    state.priceTypes,
    state.agg,
  ]);

  // §13：对标配置保存（CONFIG_CHANGED_EVENT，入口 = 总览「＋添加竞品」浮窗 / 配置页）。
  // 开启「自动匹配竞品」的组随新矩阵重算（开关的「开」= 矩阵驱动）；其余组不动，
  // 经「自动匹配竞品 / 全部自动匹配」按需取回。同时重建 state 让图表侧重读配置，
  // 并失效产品树现价索引（默认店铺口径变化后行尾现价须重建，与图上折线同步）。
  useEffect(() => {
    const handler = () => {
      invalidateLatestPriceCache();
      setState((s) => ({ ...s, mains: s.mains.map((c) => (c.auto ? withAutoOn(c) : c)) }));
    };
    window.addEventListener(CONFIG_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, handler);
  }, []);

  // actions 只依赖 setState（函数式更新），全量稳定，避免图表侧监听 actions 变化
  const actions = useMemo<FiltersActions>(
    () => ({
      /** 通用补丁（平台/币种/时间范围/价格类型/agg 等直接字段）；
       *  国家/产业变化 = 口径切换：同步数据层缺省国家，平台归一化到目标国可
       *  落地范围（R5-M1 共享规则），主分析按矩阵重算。
       *  patch 显式带 mains 时按 switchScope 的 R5 通道保留（新口径有效即不重算默认）。
       *  R4-m1：显式与否判定为 `"mains" in patch && patch.mains !== undefined`——
       *  `{ mains: undefined }` 不算显式，也不能把 undefined 展布进状态（后续
       *  .length/.map 会崩）；显式 `[]` 是合法显式口径（清空态，switchScope 里
       *  不查快照、不回填默认，不当「未传」处理）。
       *  R4-S3/S4（同步稳定线 5f5898d）：任何键存在但值为 undefined 都不得覆盖
       *  既有状态（spread 会把 undefined 写进去破坏 platform/granularity 等
       *  字段），先剥离 undefined 值；非数组的 mains 坏值整体忽略。同口径显式
       *  mains 也必须规范到当前口径（同scope非法 ID 12+512 → 16+512），显式
       *  空数组 = 清空态原样落地。 */
      set: (patch) =>
        setState((s) => {
          // R4-S4：补丁里键存在但值为 undefined 不得覆盖既有状态（spread 会把
          // undefined 写进去把 s.mains 变成 undefined），先剥离 undefined 值
          const clean = { ...patch };
          for (const key of Object.keys(clean) as Array<keyof FiltersState>) {
            if (clean[key] === undefined) delete clean[key];
          }
          // 非 mains 数组的坏值整体忽略（防御 Agent/undo 之外的 JS 调用方）
          if (clean.mains !== undefined && !Array.isArray(clean.mains)) delete clean.mains;
          let next: FiltersState = { ...s, ...clean };
          if (clean.countryCode != null && clean.countryCode !== s.countryCode) {
            const profile = marketDataProfileOf(next.countryCode);
            const publishedRange = profile.granularityLocked
              ? publishedMonthlyRangeOf(factPriceMonthly, next.countryCode)
              : null;
            const range = profile.granularityLocked && publishedRange
              ? publishedRange
              : profile.granularityLocked && next.granularity !== profile.granularity
                ? convertRangeBuckets(next.rangeStart, next.rangeEnd, next.granularity, profile.granularity)
                : { start: next.rangeStart, end: next.rangeEnd };
            next = {
              ...next,
              financingTerm: null,
              granularity: profile.granularityLocked ? profile.granularity : next.granularity,
              rangeStart: range.start,
              rangeEnd: range.end,
            };
          }
          // R7-M1（第七轮评审 Major）：稳定版带 platform 键的补丁在 setter 处
          // 立即走共享「国家合法 + 能力」归一——总览级联「全部店铺·最低价」提交
          // {shopIds:[RU:ozon:3P]} 即刻落为平台级 {platforms:[OZON]}（展开说明
          // 同步可见），不再等 Agent 打开才收敛。带 platform 键 = 一次明确的新
          // 输入：说明以本次归一结果为准，仅整态快照（undo/redo）随带的
          // platformScopeNotice 在口径吻合时优先沿用；
          // 不带 platform 键（切币种/粒度/时间等）不动平台与既有说明。跨口径
          // 补丁按目标国归一后交 switchScope/applyScopeDefaults（幂等，同政策）。
          // R8-M1（第八轮评审 Medium）：Agent 结果卡 open/apply 补丁同样带
          // platform 键（归一后的规范平台级、无说明键）——幂等归一无新说明时
          // R7 会把「仍能描述当前口径」的既有说明清掉，同口径交接后页内条幅/
          // 新查询/刷新全丢披露。缺说明键 = 继承落地前 state 上口径吻合的说明
          //（换国/换平台的旧说明经集合校验自然不成立）；补丁显式
          // platformScopeNotice:null = deliberate 清除，不继承。
          if (STABLE && clean.platform !== undefined) {
            const scope = normalizePlatformScope(next.countryCode, next.platform);
            const incomingNotice = isPlatformScopeNotice(clean.platformScopeNotice)
              ? clean.platformScopeNotice
              : undefined;
            const inheritedNotice = clean.platformScopeNotice === null
              ? null
              : (isPlatformScopeNotice(s.platformScopeNotice) ? s.platformScopeNotice : null);
            next = {
              ...next,
              platform: scope.platform,
              platformScopeNotice: resolveScopeNotice(next.countryCode, scope, incomingNotice, inheritedNotice),
            };
          }
          const scopeChanged =
            (clean.countryCode != null && clean.countryCode !== s.countryCode) ||
            (clean.industry != null && clean.industry !== s.industry);
          const explicitMains = clean.mains !== undefined && Array.isArray(clean.mains);
          if (!scopeChanged) {
            const termChanged = clean.financingTerm !== undefined && clean.financingTerm !== s.financingTerm;
            if (termChanged) next = { ...next, mains: filterMainsByFinancingTerm(next.mains, next.countryCode, next.industry, next.financingTerm) };
            if (!explicitMains) return applyMarketDataProfile(next);
            // R4-S4：同口径显式 mains 规范到当前口径——逐 SKU 过滤 / 同型号首个
            // 合法配置映射 / selKey 去重 / 对比区排重主品；显式空 = 清空态原样落地；
            // 型号在当前国全缺席 → 默认安全回落（与跨国显式缺型号一致）
            if (next.mains.length === 0) return next;
            const normalized = remapMainsForScope(next.mains, s.countryCode, s.industry);
            if (normalized) return applyScopeDefaults({ ...next, mains: normalized }, false);
            return applyScopeDefaults(next, true);
          }
          return switchScope(s, next, explicitMains);
        }),

      /** 回到默认视图（含数据默认主分析卡 + 其配置对比区）。直接从默认态重建，
       *  不读持久化——持久化里存的是「此刻的状态」，回头读等于没重置 */
      reset: () => setState(() => applyScopeDefaults({ ...defaultFilters }, true)),

      /** 主分析卡结构变化（增删卡/换主品/换序）：照原样写入 */
      setMains: (list) =>
        setState((s) => ({ ...s, mains: list })),

      /** 手动改某卡对比区：直接写入，并关闭该卡「自动匹配竞品」（退出矩阵驱动） */
      setCardCompares: (cardId, compares) =>
        setState((s) => ({
          ...s,
          mains: s.mains.map((c) => (c.id === cardId ? { ...c, compares, auto: false } : c)),
        })),

      /** 单卡「自动匹配竞品」开关：开 = 按矩阵重算并保持驱动；关 = 保留转手动 */
      autoMatchCard: (cardId) =>
        setState((s) => ({
          ...s,
          mains: s.mains.map((c) => (c.id === cardId ? toggleCardAuto(c) : c)),
        })),

      /** 全局「全部自动匹配」开关：全部华为主品卡都在开 → 全部关；否则全部开 */
      autoMatchAll: () =>
        setState((s) => ({ ...s, mains: toggleAllAuto(s.mains) })),

      /** 单个产品的取价口径（第一百六十轮）：selKey 命中的主品/对比条目全部改写
       *  （同组多处出现保持一致）；platform = null 恢复自动（日常价最低渠道） */
      setSelectionPlatform: (selKeyStr, platform) =>
        setState((s) => ({
          ...s,
          mains: s.mains.map((c) => ({
            ...c,
            main: c.main && selKey(c.main) === selKeyStr ? { ...c.main, platform } : c.main,
            compares: c.compares.map((sel) => (selKey(sel) === selKeyStr ? { ...sel, platform } : sel)),
          })),
        })),

      /**
       * §5.4/§5.6 切换粒度：保持可见时间跨度只换桶。
       * dimTime 就绪 = 精确映射；空数据降级为不换算（timeUtils.convertRangeBuckets）。
       */
      setGranularity: (g) =>
        setState((s) => {
          const profile = marketDataProfileOf(s.countryCode);
          if (profile.granularityLocked) {
            if (s.granularity === profile.granularity) return s;
            const { start, end } = convertRangeBuckets(s.rangeStart, s.rangeEnd, s.granularity, profile.granularity);
            return { ...s, granularity: profile.granularity, rangeStart: start, rangeEnd: end };
          }
          if (s.granularity === g) return s;
          const { start, end } = convertRangeBuckets(s.rangeStart, s.rangeEnd, s.granularity, g);
          return { ...s, granularity: g, rangeStart: start, rangeEnd: end };
        }),

      /**
       * 自动匹配的开关已下沉到每张卡（MainProduct.auto，第一百二十八轮）：
       * autoMatchCard / autoMatchAll 切换，setCardCompares 手动编辑即退出。
       */

      /** 第五十二轮：单系列订阅切换（看板图例页签铃铛） */
      toggleAlertSub: (key) =>
        setState((s) => ({
          ...s,
          alertSubs: s.alertSubs.includes(key) ? s.alertSubs.filter((k) => k !== key) : [...s.alertSubs, key],
        })),

      /** 第五十二轮：批量订阅/退订（总览型号块一键订阅整组） */
      setAlertSubs: (keys, on) =>
        setState((s) => {
          const set = new Set(s.alertSubs);
          for (const k of keys) (on ? set.add(k) : set.delete(k));
          return { ...s, alertSubs: [...set] };
        }),

      // ---- 追补⑨ 预警细化 ----
      /** 四类全局开关（部分补丁） */
      setAlertTypes: (patch) =>
        setState((s) => ({ ...s, alertTypes: { ...s.alertTypes, ...patch } })),

      /** 四类全局阈值（部分补丁，小数） */
      setAlertThresholds: (patch) =>
        setState((s) => ({ ...s, alertThresholds: { ...s.alertThresholds, ...patch } })),

      /** 按产品覆写（rule = null 清除覆写回落全局；own-gap 不参与产品级） */
      setAlertProductRule: (key, rule) =>
        setState((s) => {
          const products = { ...s.alertProducts };
          // 单元格弹层在恢复全局后可能传入 `{ types: {}, thresholds: {} }`。
          // 这类空覆写既没有行为价值，又会污染持久化状态和「单独设置」计数，统一压缩掉。
          const types = rule?.types ? { ...rule.types } : undefined;
          const thresholds = rule?.thresholds ? { ...rule.thresholds } : undefined;
          const normalized: AlertProductRule = {};
          if (types && Object.keys(types).length > 0) normalized.types = types;
          if (thresholds && Object.keys(thresholds).length > 0) normalized.thresholds = thresholds;
          if (Object.keys(normalized).length === 0) delete products[key];
          else products[key] = normalized;
          return { ...s, alertProducts: products };
        }),
    }),
    [],
  );

  const value = useMemo<FiltersCtx>(() => ({ state, actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilters() {
  return useContext(Ctx);
}
