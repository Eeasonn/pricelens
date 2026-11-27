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
  ColumnsView,
  CompareSource,
  FiltersActions,
  FiltersState,
  MainProduct,
  PlatformScopeNotice,
  PlatformSelection,
  ProductSelection,
} from './filtersTypes';
import type { Granularity } from '../dataModel/types';
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';
import { dimProduct, dimRegion, dimTime, factPriceMonthly } from '../data';
import { lowestPriceColorSku } from '../dataModel/aggregate';
import { normalizePlatformScope, platformQueryEquals } from '../dataModel/platformScope';
import type { LawfulPlatformScope } from '../dataModel/platformScope';
import { setCurrentCountry } from './currentScope';
import { setLocalCurrencyByCountry } from './fx';
import type { Industry } from '../dataModel/types';
import { marketDataProfileOf, type FinancingPlan, type FinancingTerm, type FinancingType } from '../dataModel/marketProfile';
import { publishedMonthlyRangeOf } from '../dataModel/monthlyFacts';
import { convertRangeBuckets } from '../components/FilterBar/timeUtils';
import { modelIdOf, invalidateLatestPriceCache, productHasDataInCountry, brandOfModel, ownBrand } from '../components/ProductCascader/tree';
import { autoComparesFor, expandV11Cards, filterMainsByFinancingTerm, migrateV10, mainsValidFor, newCardId, remapMainsForScope, restoreAutoOn, selKey, tidyMains, toggleAllAuto, toggleCardAuto, withAutoOn, withCompares, withComparesAdded } from './mainSelection';
import { readUrlOverrides, writeUrlPatch, platformUrlParamsOf, platformLevelForChannel } from './urlSync';
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
  viewMode: 'compare', // 视图默认 = 对标；选择草稿恒为 mains，视图只决定怎么摆
  columns: { groupBy: 'brand', sharedY: true, baselineKey: null }, // 分列：默认按品牌、Y 轴共享、无默认基准
  platform: DEFAULT_PLATFORM_SELECTION, // null = 该国默认电渠
  granularity: 'week', // 第四十二轮：默认周（迪总「时间默认取周」）
  adaptive: true, // 2026-11-13 时间筛选单值化：true = 默认近段窗口（周12/月6/季4）跟产品；手动改时间置 false 固定。「自动时间」按钮已退役，字段仅作状态壳（旧持久化/Agent 补丁兼容）
  rangeStart: firstWeek, // 与周粒度自洽的默认范围（跟随态会被默认近段窗口覆盖）
  rangeEnd: lastWeek,
  currency: 'usd', // 默认 USD（真实数据按行内汇率折算）
  priceTypes: { discounted: true, rrp: false }, // 第五十轮：RRP 默认不勾选（图面聚焦折后价；要看账面价手动勾回）
  agg: 'avg',
  platformScopeNotice: null, // R7-M1：稳定版平台口径归一说明（无归一 = null）
  financingType: null,
  financingTerms: [],
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

/** platform 字段形状（2026-11-16 审视修复）：undefined/null = 自动口径合法；
 *  显式对象必须 platforms/shopIds 双字符串数组 + seller 字符串|null。本文件
 *  自述威胁模型含「手工编辑过的存储」——坏 platform（如 shopIds 非数组）此前
 *  直通状态树，在 aggregate.effectiveChannelIds 的 .includes 处崩渲染。 */
function isPlatformSelectionShape(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!isRecord(value)) return false;
  return isStringArray(value.platforms)
    && isStringArray(value.shopIds)
    && (value.seller === undefined || value.seller === null || typeof value.seller === 'string');
}

function isProductSelection(value: unknown): value is ProductSelection {
  if (!isRecord(value)) return false;
  return typeof value.modelId === 'string'
    && typeof value.romram === 'string'
    && isStringArray(value.skuIds)
    && isPlatformSelectionShape(value.platform);
}

function isProductSelectionArray(value: unknown): value is ProductSelection[] {
  return Array.isArray(value) && value.every(isProductSelection);
}

function isMainProduct(value: unknown): value is MainProduct {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && (value.main === null || isProductSelection(value.main))
    && isProductSelectionArray(value.compares)
    && (value.auto === undefined || typeof value.auto === 'boolean')
    // 2026-11-27 来源并集：登记（selKey → manual|tier）与排除清单（selKey）形状校验——
    // 坏形状由调用方当作旧卡（无登记）处理，不作废整包
    && (value.compareSources === undefined || isCompareSources(value.compareSources))
    && (value.excluded === undefined || isStringArray(value.excluded));
}

function isCompareSources(value: unknown): value is Record<string, CompareSource> {
  return isRecord(value) && Object.values(value).every((v) => v === 'manual' || v === 'tier');
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

/** 读出的持久化载荷：v12 载 mains；v11 载旧卡形（随后展开）；v10 载旧 own/competitors；
 *  旧载荷的 analysisMode / panorama（2026-11-27 一轮的分析结构）在 loadBaseState 迁移
 *  到视图字段（viewMode / columns）后丢弃 */
interface PersistedPayload extends Partial<FiltersState> {
  v?: number;
  legacyOwn?: ProductSelection[];
  legacyCompetitors?: ProductSelection[];
  legacyV11Mains?: { modelId: string; configs: ProductSelection[]; compares: ProductSelection[] }[];
  legacyAnalysisMode?: 'compare' | 'panorama';
  legacyPanorama?: LegacyPanorama;
}

/** 旧品牌全景草稿形状（迁移专用）：brands[].sels 逐条按选择形状校验 */
interface LegacyPanorama {
  brands: { brand: string; sels: ProductSelection[] }[];
  sharedY?: boolean;
  baselineKey?: string | null;
}

function isProductSelectionLike(value: unknown): value is ProductSelection {
  if (!isRecord(value)) return false;
  return typeof value.modelId === 'string' && typeof value.romram === 'string'
    && Array.isArray(value.skuIds) && value.skuIds.every((id) => typeof id === 'string');
}

function isLegacyPanorama(value: unknown): value is LegacyPanorama {
  if (!isRecord(value) || !Array.isArray(value.brands)) return false;
  if (value.sharedY !== undefined && typeof value.sharedY !== 'boolean') return false;
  if (value.baselineKey !== undefined && value.baselineKey !== null && typeof value.baselineKey !== 'string') return false;
  return value.brands.every((b) => isRecord(b) && typeof b.brand === 'string' && Array.isArray(b.sels) && b.sels.every(isProductSelectionLike));
}

/** 分列视图设置的形状校验（坏形状跳过字段，不作废整包） */
export function isColumnsView(value: unknown): value is ColumnsView {
  if (!isRecord(value)) return false;
  if (value.groupBy !== undefined && value.groupBy !== 'brand' && value.groupBy !== 'series' && value.groupBy !== 'tier') return false;
  if (value.sharedY !== undefined && typeof value.sharedY !== 'boolean') return false;
  if (value.baselineKey !== undefined && value.baselineKey !== null && typeof value.baselineKey !== 'string') return false;
  return true;
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
    // 2026-11-11 先付/后付两级迁移：旧载荷 financingTerm（单值）→ financingType + financingTerms
    if (parsed.financingTerm != null && parsed.financingType == null && parsed.financingTerms == null) {
      if (parsed.financingTerm === 'prepaid') {
        parsed.financingType = 'prepaid';
      } else if (parsed.financingTerm === 24 || parsed.financingTerm === 36 || parsed.financingTerm === 48) {
        parsed.financingType = 'installment';
        parsed.financingTerms = [parsed.financingTerm];
      }
    }
    const checks: Array<[keyof FiltersState | 'legacyOwn' | 'legacyCompetitors' | 'legacyV11Mains', boolean]> = [
      [v === 12 ? 'mains' : v === 11 ? ('legacyV11Mains' as const) : 'legacyOwn', v === 10 ? isProductSelectionArray(parsed.own) : mainsOk],
      [v === 10 ? 'legacyCompetitors' : 'platform', v === 10 ? isProductSelectionArray(parsed.competitors) : isPlatformSelection(parsed.platform)],
      ['platform', isPlatformSelection(parsed.platform)],
      // R7-M1：归一说明随包留存（坏形状跳过，不作废整包——口径本身仍合法可恢复）
      ['platformScopeNotice', parsed.platformScopeNotice == null || isPlatformScopeNotice(parsed.platformScopeNotice)],
      // 2026-11-11 先付/后付两级：financingType + financingTerms（多选）；旧载荷
      // financingTerm（单值）在下方迁移块折算
      ['financingType', parsed.financingType == null || parsed.financingType === 'prepaid' || parsed.financingType === 'installment'],
      ['financingTerms', parsed.financingTerms == null || (Array.isArray(parsed.financingTerms)
        && parsed.financingTerms.every((t) => t === 24 || t === 36 || t === 48))],
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
      // 2026-11-27 二轮「视图：对标 / 分列」：viewMode / columns 可缺省（旧载荷无此键
      // = 对标 + 默认分列设置）；坏形状跳过该字段（不入 required，不作废整包）。
      // 旧载荷的 analysisMode / panorama 不进 rest——在 loadBaseState 迁移后丢弃
      ['viewMode', parsed.viewMode == null || parsed.viewMode === 'compare' || parsed.viewMode === 'columns' || parsed.viewMode === 'lineage'],
      ['columns', parsed.columns == null || isColumnsView(parsed.columns)],
    ];
    const required = checks.filter(([key]) =>
      key !== 'alertTypes' && key !== 'alertThresholds' && key !== 'alertProducts'
      && key !== 'countryCode' && key !== 'industry'
      // R7-M1：归一说明是可再生物质（口径本身可重新归一），坏形状/缺失只跳过字段
      && key !== 'platformScopeNotice'
      && key !== 'financingType' && key !== 'financingTerms'
      && key !== 'viewMode' && key !== 'columns'
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
    // 旧分析结构载荷（2026-11-27 一轮）：analysisMode / panorama 只作迁移输入带出，
    // 不进 rest（rest 直接 spread 进 FiltersState，旧字段必须留在状态之外）
    if (parsed.analysisMode === 'compare' || parsed.analysisMode === 'panorama') rest.legacyAnalysisMode = parsed.analysisMode;
    if (isLegacyPanorama(parsed.panorama)) rest.legacyPanorama = parsed.panorama;
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
function computeDataDefaults(countryCode: string, industry: Industry, financingType: FinancingType | null = null, financingTerms: FinancingTerm[] = []): Partial<FiltersState> {
  if (!dimProduct.length) return {};
  syncScopeRegistries(countryCode);
  const region = dimRegion.find((r) => r.country_code === countryCode);
  const preferred = region?.default_own_models[industry];
  const inCountry = (p: (typeof dimProduct)[number]) => p.is_own && p.industry === industry && productHasDataInCountry(p, countryCode, financingType, financingTerms);
  let candidates = preferred ? dimProduct.filter((p) => p.model_id === preferred && inCountry(p)) : [];
  if (!candidates.length) candidates = dimProduct.filter(inCountry);
  if (!candidates.length) return { mains: [] };
  const modelId = modelIdOf(candidates[0]);
  const romrams = [...new Set(candidates.filter((p) => p.model_id === modelId).map((p) => p.romram))].sort();
  for (const romram of romrams) {
    const skuId = countryCode === 'ZA'
      ? candidates.find((p) => p.model_id === modelId && p.romram === romram && factPriceMonthly.some((row) => row.sku_id === p.sku_id
        && row.review_status === 'PASS'
        && row.price_local != null
        && (financingType == null || (financingType === 'prepaid'
          ? row.price_type === 'prepaid'
          : row.price_type === 'installment' && (financingTerms.length === 0 || (row.term_months != null && financingTerms.includes(row.term_months)))))))?.sku_id ?? null
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

/* ---------- 口径整理实现（原稳定线 4966d02；2026-11-27 演进版退场后是唯一实现） ---------- */
/** t428u R7-M1 · 归一说明（provenance）的统一收口：任何入口（load / actions.set /
 *  换国 applyScopeDefaults）过 normalizePlatformScope 后由此决定 state 上的说明——
 *  - 本次归一产生了说明（剔除/透明展开）→ 以本次结果为准（幂等：同输入同说明，
 *    单字段存续，不可能重复叠加）；
 *  - 归一幂等无说明（输入已是合法平台级）→ 沿用「仍能描述当前口径」的既有说明
 *    （补丁/快照随带的说明优先于继承值——undo 整态恢复），否则清空：换国、
 *    deliberate 换平台/重置后旧说明不再成立，绝不泄漏陈旧口径。
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
  const mains = filterMainsByFinancingTerm(sanitized ?? []);
  const needMain = force || (s.mains.length > 0 && mains.length === 0);
  const defaults = needMain ? computeDataDefaults(scope.countryCode, scope.industry, s.financingType, s.financingTerms) : {};
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
 *     不按条数截断，保留合法手动搭配与 auto 模式）；
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
      if (mains && mainsValidFor(mains, applied.countryCode, applied.industry, applied.financingType, applied.financingTerms)) {
        // R4-S2：快照还原同样过整组合法化——主品逐 SKU 过滤，手动对比区按目标
        // 口径校验/剥离（型号缺席剔除、配置漂移同型号映射）、selKey 去重、对比区
        // 不按条数截断；auto 标记与合法手动搭配保留
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
// 2026-11-27 演进版退场：口径整理收敛为单一实现（原稳定线 4966d02：含 R6–R8
// 平台级透明归一 + 归一说明）。迭代线实现（R5-M1 共享落地规则 + 每线口径归一）
// 与按构建通道 STABLE 分发的分支一并删除。
// ------------------------------------------------------------
function applyScopeDefaults(s: FiltersState, force: boolean): FiltersState {
  // 2026-11-27 二轮：品牌全景草稿退场——选择恒为 mains（其自有按口径快照与收口
  // 在 stable 实现内），分列视图设置（分组/共享/基准）不随口径切换重置；
  // 基准失效的清空在 mains 写入路径统一收口（sanitizeBaseline）
  return sanitizeBaseline(applyMarketDataProfile(applyScopeDefaultsStable(s, force)));
}

function switchScope(prev: FiltersState, next: FiltersState, explicitMains = false, explicitTime = false): FiltersState {
  const scoped = switchScopeStable(prev, next, explicitMains);
  return swapRangeSnapshot(prev, scoped, explicitTime);
}

// 2026-11-09 用户反馈「自动时间不按逻辑来」根因②：手动范围/自动态此前是全局
// 单份，切国家/产业把上一个口径的范围原样带进新口径（自动开着会自校正，手动
// 模式永远错位）。现随 mainsOf 快照同思路按 国家.产业 隔离：切走落盘、切入恢复；
// 目标口径无快照（首次到访）= 回自动重算，杜绝串扰。sessionStorage = 标签页各自
// 持有，双开标签互不污染。
const rangeSnapKeyOf = (cc: string, industry: string) => `${LPL.filters}.rangeOf.${cc}.${industry}`;
function swapRangeSnapshot(prev: FiltersState, scoped: FiltersState, explicitTime: boolean): FiltersState {
  try {
    sessionStorage.setItem(rangeSnapKeyOf(prev.countryCode, prev.industry), JSON.stringify({
      adaptive: prev.adaptive, rangeStart: prev.rangeStart, rangeEnd: prev.rangeEnd,
      // 2026-11-18 P1-5：快照必须带粒度。否则 RU(周)→ZA(锁月)→RU 会恢复成
      // 「month 粒度 + RU 周桶 id」——filterBounds indexOf 落空图表显全集，且错配
      // 被 URL/持久化写盘跨会话钉死
      granularity: prev.granularity,
    }));
  } catch {
    /* 存储不可用时跳过快照 */
  }
  // 补丁显式带了时间（Agent 定位固定单周、链接 rs/re）= 以补丁为准，不做快照回填
  if (explicitTime) return scoped;
  try {
    const raw = sessionStorage.getItem(rangeSnapKeyOf(scoped.countryCode, scoped.industry));
    if (raw) {
      const snap = JSON.parse(raw) as { adaptive?: unknown; rangeStart?: unknown; rangeEnd?: unknown; granularity?: unknown };
      if (typeof snap.adaptive === 'boolean') {
        let granularity = scoped.granularity;
        let rangeStart = typeof snap.rangeStart === 'string' ? snap.rangeStart : scoped.rangeStart;
        let rangeEnd = typeof snap.rangeEnd === 'string' ? snap.rangeEnd : scoped.rangeEnd;
        const snapGran = snap.granularity;
        const isGranularity = (v: unknown): v is Granularity => v === 'week' || v === 'month' || v === 'quarter';
        if (isGranularity(snapGran) && snapGran !== granularity) {
          // 快照粒度与目标态不一致：非锁粒度国恢复快照粒度（桶 id 与粒度同对还原）；
          // 锁粒度国（ZA 月度）不许恢复——保持锁定粒度，把快照范围换算到锁定粒度
          const profile = marketDataProfileOf(scoped.countryCode);
          if (!profile.granularityLocked) {
            granularity = snapGran;
          } else {
            const conv = convertRangeBuckets(rangeStart, rangeEnd, snapGran, granularity);
            rangeStart = conv.start;
            rangeEnd = conv.end;
          }
        }
        return {
          ...scoped,
          adaptive: snap.adaptive,
          rangeStart,
          rangeEnd,
          granularity,
        };
      }
      return scoped;
    }
  } catch {
    /* 坏 JSON：保持现值 */
  }
  return scoped.adaptive || explicitTime ? scoped : { ...scoped, adaptive: true };
}

function applyMarketDataProfile(state: FiltersState): FiltersState {
  const profile = marketDataProfileOf(state.countryCode);
  if (!profile.granularityLocked) {
    return state.financingType == null && state.financingTerms.length === 0
      ? state
      : { ...state, financingType: null, financingTerms: [] };
  }
  const publishedRange = publishedMonthlyRangeOf(factPriceMonthly, state.countryCode);
  const range = state.granularity === profile.granularity
    ? { start: state.rangeStart, end: state.rangeEnd }
    : publishedRange ?? convertRangeBuckets(state.rangeStart, state.rangeEnd, state.granularity, profile.granularity);
  // 2026-11-11 Eason：先付/后付两级口径——非法/未选回落「后付 · 36 期」（进页即有数据）
  const financingType = state.financingType === 'prepaid' || state.financingType === 'installment'
    ? state.financingType
    : 'installment';
  const financingTerms = financingType === 'installment'
    ? (Array.isArray(state.financingTerms) && state.financingTerms.length > 0 ? state.financingTerms : [36 as FinancingTerm])
    : [];
  return {
    ...state,
    granularity: profile.granularity,
    rangeStart: range.start,
    rangeEnd: range.end,
    financingType,
    financingTerms,
  };
}

/**
 * 启动恢复：
 * 1) 无持久化 / 持久化版本旧于 v10 → 新默认视图（周 · USD · 默认主分析卡 + 其配置对比）；
 * 2) v11/v12 → mains 照原样恢复；v10 → own/competitors 迁移成卡（migrateV10，矩阵补对比区）。
 * 第一百二十六轮起无启动自愈重算——对比区以持久化为准，可用「全部自动匹配」一键取回。
 * 2026-11-26 Eason（默认逻辑）：恢复时华为主品卡强制 auto=true（restoreAutoOn），
 * 对比区由 applyScopeDefaults 末尾 withAutoOn 按当前口径矩阵重算——刷新/重开一律
 * 默认开自动匹配；「关」只在单次界面交互内有效，不跨刷新存活。
 */

/** 分列基准随 mains 收口：基准（selKey）不再指向 mains 里任何主品/对比条目即清空。
 *  所有写 mains 的路径（setMains / setCardCompares / addCardCompares / autoMatch 开关 /
 *  set / 迁移 / scope 收口）统一过这里——基准只认「在册的选择」，不猜用户意图。 */
function sanitizeBaseline(s: FiltersState): FiltersState {
  const key = s.columns?.baselineKey;
  if (key == null) return s;
  const present = s.mains.some((c) => (c.main != null && selKey(c.main) === key) || c.compares.some((sel) => selKey(sel) === key));
  return present ? s : { ...s, columns: { ...s.columns, baselineKey: null } };
}

/**
 * 旧分析结构迁移（2026-11-27 二轮「视图：对标 / 分列」；品牌全景草稿与
 * analysisMode 退场）：持久化 / URL 读入后统一调用。
 * - analysisMode === 'panorama' 且旧全景有选择：
 *   mains 空 → 全景选择折成一张卡（主品 = 首个我司品牌选择、其余 = 对比、来源
 *   manual、auto:false；无我司选择 = 无主的空对）；
 *   mains 非空 → mains 为准（全景选择是同一批产品的另一种摆法，不重复并入）。
 *   两路都 viewMode = 'columns'、groupBy = brand，沿用 sharedY / baselineKey
 *   （基准不在迁移后选择中由随后的 mains 收口清空）。
 * - analysisMode === 'compare' / 缺省 → 视图字段原样（新载荷已带则尊重）。
 * 迁移后 legacyAnalysisMode / legacyPanorama 不再存在。
 */
function migrateLegacyView(base: FiltersState, legacy: { mode?: 'compare' | 'panorama'; panorama?: LegacyPanorama }): FiltersState {
  if (legacy.mode !== 'panorama') return base;
  const pano = legacy.panorama;
  const sels = pano ? pano.brands.flatMap((b) => b.sels) : [];
  const columns: ColumnsView = {
    groupBy: 'brand',
    sharedY: pano?.sharedY !== false,
    baselineKey: pano?.baselineKey ?? null,
  };
  let mains = base.mains;
  const noSel = !mains.some((c) => c.main != null) && !mains.some((c) => c.compares.length > 0);
  if (sels.length > 0 && noSel) {
    const own = sels.find((s) => brandOfModel(s.modelId) === ownBrand()) ?? null;
    const seen = new Set<string>(own ? [selKey(own)] : []);
    const compares: ProductSelection[] = [];
    const compareSources: Record<string, CompareSource> = {};
    for (const s of sels) {
      const k = selKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      compares.push(s);
      compareSources[k] = 'manual';
    }
    mains = [{ id: newCardId(), main: own, compares, auto: false, compareSources }];
  }
  return { ...base, mains, viewMode: 'columns', columns };
}

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
    const { v: _v, legacyOwn, legacyCompetitors, legacyV11Mains, legacyAnalysisMode, legacyPanorama, ...rest } = parsed;
    restored = { ...defaultFilters, ...rest } as FiltersState;
    // 2026-11-27 二轮：旧「分析结构」载荷迁移到视图字段（品牌全景 → 分列视图；
    // 先于 v10/v11 卡迁移——迁移产卡只发生在 mains 无任何选择时，次序不影响）
    // R7-M1（第七轮评审）：读档不做「多平台取一 / 店铺优先」的有损前置归一——
    // 那会先把原始完整输入裁掉（DNS+AE:noon:3P 丢 DNS、DNS+RU:ozon:3P 丢 DNS），
    // 后置的 normalizePlatformScope 只能对着残缺输入归一。原始输入原样进
    // applyScopeDefaults，由共享的「国家合法 + 能力」一体化归一处理：
    // 非法店铺剔除、合法店铺透明展开所属平台、与显式平台并集去重，全部过程
    // 进归一说明（platformScopeNotice，页内可见）。2026-11-27 演进版退场：原
    // 迭代通道专属的「读档前置归一」分支随之删除。
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
      // 2026-11-27 起无卡数 / 对比条数上限：只做结构整理（去重、剔与主品同组项），不截断
      restored.mains = tidyMains(restored.mains);
    }
    // 2026-11-26 Eason：自动匹配竞品 = 默认逻辑——刷新/重开把持久化的华为主品卡
    // 强制回 auto=true（对比区由随后 applyScopeDefaults 末尾的 withAutoOn 按当前
    // 口径矩阵统一重算）；「关」只在单次界面交互内有效，不跨刷新存活。
    restored.mains = restoreAutoOn(Array.isArray(restored.mains) ? restored.mains : []);
    // 2026-11-27 二轮：旧「分析结构」载荷迁移到视图字段（品牌全景 → 分列视图）。
    // 放在卡迁移之后：「mains 是否有选择」按迁移后的最终 mains 判定
    restored = migrateLegacyView(restored, { mode: legacyAnalysisMode, panorama: legacyPanorama });
  }
  // 无持久化 = 首次打开：强制重算默认卡（默认视图 = 默认卡 + 匹配竞品）。
  // 只在「确有持久化载荷」时才尊重空 mains（用户显式清空态，刷新不回填）——
  // 139 轮把 needMain 收紧为「mains 非空且失效才重算」时漏了这条首次路径，
  // 新用户/清过存储的浏览器首屏永远空态（第 144 轮补）
  if (!restored) return applyScopeDefaults({ ...defaultFilters }, true);
  // 时间范围/自动态优先取本口径（国家.产业）的快照（2026-11-09：范围随 scope
  // 隔离，见 swapRangeSnapshot 注）；本标签没访问过该口径时沿用全局 blob 值。
  try {
    const raw = sessionStorage.getItem(rangeSnapKeyOf(restored.countryCode, restored.industry));
    if (raw) {
      const snap = JSON.parse(raw) as { adaptive?: unknown; rangeStart?: unknown; rangeEnd?: unknown };
      if (typeof snap.adaptive === 'boolean') {
        restored = {
          ...restored,
          adaptive: snap.adaptive,
          rangeStart: typeof snap.rangeStart === 'string' ? snap.rangeStart : restored.rangeStart,
          rangeEnd: typeof snap.rangeEnd === 'string' ? snap.rangeEnd : restored.rangeEnd,
        };
      }
    }
  } catch {
    /* 坏 JSON：沿用全局值 */
  }
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
    //（否则刷新/分享链接会清掉用户手动配好的对比）。restoreAutoOn 兜住「链接
    // 直开、持久化里没有的华为主品卡」——自动匹配默认开（2026-11-26 Eason）。
    const persistedByKey = new Map(
      base.mains.flatMap((c) => (c.main ? [[selKey(c.main), c] as const] : [])),
    );
    const merged = restoreAutoOn(url.filters.mains.map((card) => {
      const prev = card.main ? persistedByKey.get(selKey(card.main)) : undefined;
      return prev ? { ...card, compares: prev.compares, auto: prev.auto } : card;
    }));
    restored = {
      ...restored,
      ...url.filters,
      mains: merged,
    };
  } else if (Object.keys(url.filters).length > 0) {
    restored = { ...restored, ...url.filters };
  }
  // 2026-11-27 二轮：品牌全景从未进过 URL（视图无 legacy URL 参数可映射；
  // view / by 键由 readUrlOverrides 读入 url.filters）
  const withDefaults = applyScopeDefaults(restored, false);
  // 2026-11-16 审视修复：URL 直链跨口径（?c=/ind= 目标口径 ≠ 持久化口径）此前
  // 只走 applyScopeDefaults，绕过 switchScope 的范围快照交换——持久化口径的手动
  // 时间范围/自动态原样串进新口径（buildBuckets 按桶 id 过滤，目标国被截成错误
  // 窗口甚至整页空图）。现按 swapRangeSnapshot 同语义补齐：显式带时间（rs/re
  // 读入即 adaptive=false）= URL 为准；否则读目标口径快照、无快照回自动重算。
  const crossScope = withDefaults.countryCode !== base.countryCode || withDefaults.industry !== base.industry;
  if (!crossScope) return withDefaults;
  return swapRangeSnapshot(base, withDefaults, url.filters.adaptive === false);
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
  actions: { set: () => {}, reset: () => {}, setMains: () => {}, setCardCompares: () => {}, addCardCompares: () => {}, autoMatchCard: () => {}, autoMatchAll: () => {}, setViewMode: () => {}, setColumns: () => {}, setSelectionPlatform: () => {}, setGranularity: () => {}, toggleAlertSub: () => {}, setAlertSubs: () => {}, setAlertTypes: () => {}, setAlertThresholds: () => {}, setAlertProductRule: () => {} },
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
    // 2026-11-14（Eason「平台还是能选到店铺」）：稳定版店铺级恢复——
    // platformLevelForChannel 退役为透传，店铺级写 plat+shop 双键、seller 随行；
    // 平台级/自动口径仍只写 plat=（价格/量价两页同键，与读侧成对）
    const { plat, shop, seller, ctype } = platformUrlParamsOf(platformLevelForChannel(state.platform));
    // 第一百三十八轮：时间范围/价格显示/汇总口径入链（rs/re/pt/agg）——分享链接
    // 带全取数上下文。2026-11-13 时间筛选单值化：范围恒为「当前生效窗口」（默认
    // 近段或手动固定），恒写 rs/re（旧自适应态不写键的口径随自动时间退役）
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
      ctype,
      rs: state.rangeStart || null,
      re: state.rangeEnd || null,
      pt: ptCode,
      agg: state.agg,
      // 2026-11-27 二轮「视图：对标 / 分列」：视图与分列依据入链——view 缺省不写
      //（= 对标），by 缺省不写（= 品牌），链接保持干净
      view: state.viewMode === 'compare' ? null : state.viewMode,
      by: state.viewMode !== 'compare' && state.columns.groupBy !== 'brand' ? state.columns.groupBy : null,
    });
  }, [
    state.countryCode,
    state.industry,
    state.granularity,
    state.currency,
    state.mains,
    state.platform,
    state.rangeStart,
    state.rangeEnd,
    state.priceTypes,
    state.agg,
    state.viewMode,
    state.columns,
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
          // 2026-11-27 二轮：「补丁带 mains 回落产品对标」规则随品牌全景退场——
          // 视图共享同一草稿（mains），写选择不再隐含换视图；视图由用户/补丁显式切换
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
              financingType: null,
  financingTerms: [],
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
          if (clean.platform !== undefined) {
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
            const termChanged = (clean.financingType !== undefined && clean.financingType !== s.financingType)
            || (clean.financingTerms !== undefined && clean.financingTerms.join(',') !== s.financingTerms.join(','));
            // 2026-11-11 Eason：口径/期数切换保留已选产品（空态提示代替清选）
            if (!explicitMains) return applyMarketDataProfile(next);
            // R4-S4：同口径显式 mains 规范到当前口径——逐 SKU 过滤 / 同型号首个
            // 合法配置映射 / selKey 去重 / 对比区排重主品；显式空 = 清空态原样落地；
            // 型号在当前国全缺席 → 默认安全回落（与跨国显式缺型号一致）
            if (next.mains.length === 0) return sanitizeBaseline(next);
            const normalized = remapMainsForScope(next.mains, s.countryCode, s.industry);
            if (normalized) return applyScopeDefaults({ ...next, mains: normalized }, false);
            return applyScopeDefaults(next, true);
          }
          // 显式时间键（adaptive/rangeStart/rangeEnd 任一出现在补丁）= Agent 跳转 /
          // 链接 / 用户手选在改时间——目标口径的时间以此为准，不做快照回填/回自动
          const explicitTime = clean.adaptive !== undefined || clean.rangeStart !== undefined || clean.rangeEnd !== undefined;
          return switchScope(s, next, explicitMains, explicitTime);
        }),

      /** 回到默认视图（含数据默认主分析卡 + 其配置对比区）。直接从默认态重建，
       *  不读持久化——持久化里存的是「此刻的状态」，回头读等于没重置 */
      reset: () => setState(() => applyScopeDefaults({ ...defaultFilters }, true)),

      /** 主分析卡结构变化（增删卡/换主品/换序）：照原样写入 */
      setMains: (list) =>
        setState((s) => sanitizeBaseline({ ...s, mains: list })),

      /** 手动改某卡对比区（增删 / 调色 / 换条目 / 换序）。2026-11-27 起不再关闭
       *  「自动匹配竞品」：与矩阵产出按新旧键集对账（withCompares）——新增项登记为
       *  手动补充、移除的矩阵项记入 excluded、保留项来源不变。 */
      setCardCompares: (cardId, compares) =>
        setState((s) => sanitizeBaseline({
          ...s,
          mains: s.mains.map((c) => (c.id === cardId ? withCompares(c, compares) : c)),
        })),

      /** 加入对比（用户补充：手动 / 同档推荐）：与矩阵产出并存为并集、去重、不改开关 */
      addCardCompares: (cardId, sels, source) =>
        setState((s) => sanitizeBaseline({
          ...s,
          mains: s.mains.map((c) => (c.id === cardId ? withComparesAdded(c, sels, source) : c)),
        })),

      /** 切换视图（对标 / 分列）：只换怎么摆，选择草稿（mains）不动 */
      setViewMode: (mode) =>
        setState((s) => (s.viewMode === mode ? s : { ...s, viewMode: mode })),

      /** 分列视图设置（分组依据 / Y 轴共享 / 临时基准，部分补丁）。显式写
       *  baselineKey 时同样收口——基准须指向在册选择，否则不落 */
      setColumns: (patch) =>
        setState((s) => {
          const next = { ...s, columns: { ...s.columns, ...patch } };
          return patch.baselineKey !== undefined ? sanitizeBaseline(next) : next;
        }),

      /** 单卡「自动匹配竞品」开关：开 = 按矩阵重算并保持驱动；关 = 保留转手动 */
      autoMatchCard: (cardId) =>
        setState((s) => sanitizeBaseline({
          ...s,
          mains: s.mains.map((c) => (c.id === cardId ? toggleCardAuto(c) : c)),
        })),

      /** 全局「全部自动匹配」开关：全部华为主品卡都在开 → 全部关；否则全部开 */
      autoMatchAll: () =>
        setState((s) => sanitizeBaseline({ ...s, mains: toggleAllAuto(s.mains) })),

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
