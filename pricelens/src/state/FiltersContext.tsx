// ============================================================
// 筛选状态：五框状态 + §5.6 联动 + localStorage 持久化（LPL3.filters）
// + §13 CONFIG_CHANGED_EVENT 监听（配置保存后，自动匹配开 = 华为主品卡
//   对比区立即按新矩阵重算）
// 默认视图（2026-10-20 真实数据接入起）：周 · USD · 平台 = 该国默认电渠（「国家主要电渠」首个）
// · 主分析 = 产品竞品矩阵该国该产业首个有数型号的首个配置（最低价颜色）成卡
//   + 其分国对标对比区 · 仅折后价 · 时间自适应开 · 对比自动匹配开；
//   切国家/产业时按同规则重算默认产品
// 第一百一十七轮（统一产品选择器）：own/competitors → mains（每主品卡自带对比区）；
// 持久化 v11（v10 载荷自动迁移，见 mainSelection.migrateV10）。
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
  PlatformSelection,
  ProductSelection,
} from './filtersTypes';
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';
import { dimProduct, dimRegion, dimTime } from '../data';
import { lowestPriceColorSku } from '../dataModel/aggregate';
import { setCurrentCountry } from './currentScope';
import { setLocalCurrencyByCountry } from './fx';
import type { Industry } from '../dataModel/types';
import { convertRangeBuckets } from '../components/FilterBar/timeUtils';
import { modelIdOf } from '../components/ProductCascader/tree';
import { groupsFromBenchmark } from './configStore';
import { autoComparesFor, migrateV10, mainsValidFor, reapplyAuto } from './mainSelection';
import { readUrlOverrides, writeUrlPatch } from './urlSync';
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
  subjectMode: 'product', // 主体模式默认按产品（现状行为）；档位模式为附加视角
  tier: null,
  mains: [],
  platform: DEFAULT_PLATFORM_SELECTION, // null = 该国默认电渠
  granularity: 'week', // 第四十二轮：默认周（迪总「时间默认取周」）
  adaptive: true, // 第十九轮：时间自适应默认开
  rangeStart: firstWeek, // 与周粒度自洽的默认范围（自适应开时会被数据跨度覆盖）
  rangeEnd: lastWeek,
  currency: 'usd', // 默认 USD（真实数据按行内汇率折算）
  priceTypes: { discounted: true, rrp: false }, // 第五十轮：RRP 默认不勾选（图面聚焦折后价；要看账面价手动勾回）
  agg: 'avg',
  autoMatch: true, // 第三十四轮：对比自动匹配默认开（对比区随华为主品跟随，迪总「减少筛选器」）
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
 *   v10 载荷读入后自动迁移（migrateV10：自动=逐卡重算、手动=按旧面板口径分配）。
 */
const DEFAULTS_V = 11;

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
  return typeof value.modelId === 'string'
    && isProductSelectionArray(value.configs)
    && isProductSelectionArray(value.compares);
}

function isMainProductArray(value: unknown): value is MainProduct[] {
  return Array.isArray(value) && value.every(isMainProduct);
}

function isPlatformSelection(value: unknown): value is PlatformSelection | null {
  if (value === null) return true;
  return isRecord(value) && isStringArray(value.platforms) && isStringArray(value.shopIds);
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

/** 读出的持久化载荷：v11 载 mains；v10 载旧 own/competitors（随后迁移） */
interface PersistedPayload extends Partial<FiltersState> {
  v?: number;
  alertThreshold?: number;
  legacyOwn?: ProductSelection[];
  legacyCompetitors?: ProductSelection[];
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
    if (v !== 10 && v !== 11) return null;

    const checks: Array<[keyof FiltersState | 'legacyOwn' | 'legacyCompetitors', boolean]> = [
      [v === 11 ? 'mains' : 'legacyOwn', v === 11 ? isMainProductArray(parsed.mains) : isProductSelectionArray(parsed.own)],
      [v === 11 ? ('mains' as const) : 'legacyCompetitors', v === 11 ? isMainProductArray(parsed.mains) : isProductSelectionArray(parsed.competitors)],
      ['platform', isPlatformSelection(parsed.platform)],
      ['granularity', parsed.granularity === 'week' || parsed.granularity === 'month' || parsed.granularity === 'quarter'],
      ['adaptive', typeof parsed.adaptive === 'boolean'],
      ['rangeStart', typeof parsed.rangeStart === 'string'],
      ['rangeEnd', typeof parsed.rangeEnd === 'string'],
      ['currency', parsed.currency === 'usd' || parsed.currency === 'local'],
      ['priceTypes', isPriceTypes(parsed.priceTypes)],
      ['agg', parsed.agg === 'avg' || parsed.agg === 'min'],
      ['autoMatch', typeof parsed.autoMatch === 'boolean'],
      ['alertSubs', isStringArray(parsed.alertSubs)],
      ['alertTypes', isAlertTypes(parsed.alertTypes)],
      ['alertThresholds', isAlertThresholds(parsed.alertThresholds)],
      ['alertProducts', isAlertProducts(parsed.alertProducts)],
    ];
    const required = checks.filter(([key]) => key !== 'alertTypes' && key !== 'alertThresholds' && key !== 'alertProducts');
    if (required.some(([, valid]) => !valid)) return null;

    const rest: PersistedPayload = { v };
    for (const [key, valid] of checks) {
      if (!valid) continue;
      if (key === 'legacyOwn') rest.legacyOwn = parsed.own as ProductSelection[];
      else if (key === 'legacyCompetitors') rest.legacyCompetitors = parsed.competitors as ProductSelection[];
      else if (key !== 'mains' || v === 11) (rest as UnknownRecord)[key] = (parsed as UnknownRecord)[key];
    }
    if (isFiniteNumber(parsed.alertThreshold)) rest.alertThreshold = parsed.alertThreshold;
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
function computeDataDefaults(countryCode: string, industry: Industry): Partial<FiltersState> {
  if (!dimProduct.length) return {};
  syncScopeRegistries(countryCode);
  const region = dimRegion.find((r) => r.country_code === countryCode);
  const preferred = region?.default_own_models[industry];
  const inCountry = (p: (typeof dimProduct)[number]) => p.is_own && p.industry === industry && p.countries.includes(countryCode);
  let candidates = preferred ? dimProduct.filter((p) => p.model_id === preferred && inCountry(p)) : [];
  if (!candidates.length) candidates = dimProduct.filter(inCountry);
  if (!candidates.length) return { mains: [] };
  const modelId = modelIdOf(candidates[0]);
  const romrams = [...new Set(candidates.filter((p) => p.model_id === modelId).map((p) => p.romram))].sort();
  for (const romram of romrams) {
    const skuId = lowestPriceColorSku(modelId, romram, countryCode);
    if (!skuId) continue;
    const config: ProductSelection = { modelId, romram, skuIds: [skuId] };
    const mains: MainProduct[] = [{ modelId, configs: [config], compares: groupsFromBenchmark([config]) }];
    return { mains };
  }
  return { mains: [] };
}

/** 口径（国家/产业）变化后的状态整理：规范作用域、平台回默认电渠、主分析按新口径重算；
 *  自动匹配开时对比区随新口径矩阵重算（reapplyAuto），手动模式保留用户挑选 */
function applyScopeDefaults(s: FiltersState, force: boolean): FiltersState {
  const scope = normalizeDataScope({ countryCode: s.countryCode, industry: s.industry });
  syncScopeRegistries(scope.countryCode);
  const platformOk =
    s.platform == null ||
    s.platform.shopIds.every((id) => id.startsWith(`${scope.countryCode}:`));
  const needMain = force || !mainsValidFor(s.mains, scope.countryCode, scope.industry);
  const defaults = needMain ? computeDataDefaults(scope.countryCode, scope.industry) : {};
  const next: FiltersState = {
    ...s,
    ...scope,
    platform: platformOk ? s.platform : null,
    ...defaults,
    ...(needMain ? {} : s.autoMatch ? { mains: reapplyAuto(s.mains) } : {}),
  };
  return next;
}

/**
 * 启动恢复：
 * 1) 无持久化 / 持久化版本旧于 v10 → 新默认视图（周 · USD · 默认主分析卡 + 其配置对比）；
 * 2) v11 → mains 照原样恢复；v10 → own/competitions 迁移成卡（migrateV10）；
 * 3) 对比自动匹配开时，启动即按当前生效矩阵重算华为主品卡对比区——
 *    持久化的对比清单可能产自旧维表/旧矩阵（第一百一十六轮自愈语义延续）；
 *    手动模式（autoMatch 关）不动用户挑选。
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
    const { alertThreshold, v: _v, legacyOwn, legacyCompetitors, ...rest } = parsed;
    restored = { ...defaultFilters, ...rest } as FiltersState;
    // v8 → v9 迁移（追补⑨）：旧单阈值 → 三类同值；订阅保留；own-gap 落缺省 15%
    if (parsed.v === 8 && typeof alertThreshold === 'number') {
      restored.alertThresholds = {
        ...DEFAULT_ALERT_THRESHOLDS,
        'price-change': alertThreshold,
        promo: alertThreshold,
        'platform-gap': alertThreshold,
      };
    }
    // v10 → v11（第一百一十七轮）：own/competitors → mains
    if (parsed.v === 10) {
      restored.mains = migrateV10(legacyOwn ?? [], legacyCompetitors ?? [], restored.autoMatch);
    }
  }
  if (!restored) restored = { ...defaultFilters };
  if (restored.autoMatch && restored.mains.length) {
    restored.mains = reapplyAuto(restored.mains);
  }
  return applyScopeDefaults(restored, false);
}

/** 启动时才应用 URL；运行中的 reset 使用 loadBaseState，避免 URL 覆写锁死重置结果。 */
function applyUrlOverrides(base: FiltersState): FiltersState {
  // 追补⑩（建议③）：URL 覆写最后应用——分享链接 > 持久化 > 默认视图；
  // 主分析覆写存在时对比区按现行 autoMatch 规则带出（与手选同语义）
  const url = readUrlOverrides();
  let restored = base;
  // 先把数据层缺省国家切到链接指定国家，再按该国对标矩阵带出对比（否则会沿用持久化国家的对标）
  syncScopeRegistries(url.filters.countryCode ?? base.countryCode);
  if (url.filters.mains?.length) {
    // URL 只声明主品结构；对比区尽量沿用持久化里同型号卡的手动搭配
    //（否则刷新/分享链接会清掉用户手动配好的对比），自动模式再按矩阵重算
    const persisted = base.mains;
    const merged = url.filters.mains.map((card) => {
      const prev = persisted.find((p) => p.modelId === card.modelId);
      return prev ? { ...card, compares: prev.compares } : card;
    });
    restored = {
      ...restored,
      ...url.filters,
      mains: restored.autoMatch ? reapplyAuto(merged) : merged,
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
  actions: { set: () => {}, reset: () => {}, setMains: () => {}, setCardCompares: () => {}, autoMatchCard: () => {}, setGranularity: () => {}, setAutoMatch: () => {}, toggleAlertSub: () => {}, setAlertSubs: () => {}, setAlertTypes: () => {}, setAlertThresholds: () => {}, setAlertProductRule: () => {} },
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
      m.configs.map((s) => `${s.modelId}__${s.romram.replace(/\s+/g, '')}`),
    );
    const shop = state.platform?.shopIds[0] ?? null;
    writeUrlPatch({
      c: state.countryCode,
      i: state.industry,
      g: state.granularity,
      cur: state.currency,
      main: mainKeys.join(',') || null,
      shop,
      // 档位模式才写主体模式参数，按产品视图的链接保持历史形态
      m: state.subjectMode === 'tier' ? 'tier' : null,
      t: state.subjectMode === 'tier' ? state.tier : null,
    });
  }, [state.countryCode, state.industry, state.granularity, state.currency, state.mains, state.platform, state.autoMatch, state.subjectMode, state.tier]);

  // §13：对标配置保存（CONFIG_CHANGED_EVENT）→ 自动匹配开启时立即按新矩阵重算
  // 华为主品卡对比区（矩阵维护入口 = 总览「＋添加竞品」浮窗 / 配置页）；
  // 手动模式不动用户挑选。fx 为读取时取值，图表侧自行监听。
  useEffect(() => {
    const handler = () => {
      // Always create a new state object so chart consumers re-read configuration
      // getters (notably the reference FX rate) even when auto matching is off.
      setState((s) => ({ ...s, ...(s.autoMatch ? { mains: reapplyAuto(s.mains) } : {}) }));
    };
    window.addEventListener(CONFIG_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, handler);
  }, []);

  // actions 只依赖 setState（函数式更新），全量稳定，避免图表侧监听 actions 变化
  const actions = useMemo<FiltersActions>(
    () => ({
      /** 通用补丁（平台/币种/时间范围/价格类型/agg 等直接字段）；
       *  国家/产业变化 = 口径切换：同步数据层缺省国家，平台回默认电渠，主分析按矩阵重算 */
      set: (patch) =>
        setState((s) => {
          const next = { ...s, ...patch };
          const scopeChanged =
            (patch.countryCode != null && patch.countryCode !== s.countryCode) ||
            (patch.industry != null && patch.industry !== s.industry);
          return scopeChanged ? applyScopeDefaults(next, true) : next;
        }),

      /** 回到默认视图（含数据默认主分析卡 + 其配置对比区） */
      reset: () => setState(loadBaseState()),

      /**
       * 主分析卡结构变化（第一百一十七轮）：卡/配置增删、换序。autoMatch 开 =
       * 华为主品卡对比区随新配置重算（配额收口）；关 = 全部保留（手动语义）。
       */
      setMains: (list) =>
        setState((s) => ({ ...s, mains: s.autoMatch ? reapplyAuto(list) : list })),

      /** 手动改某卡对比区：写入即退出自动匹配（原第三十四轮语义，全局开关） */
      setCardCompares: (modelId, compares) =>
        setState((s) => ({
          ...s,
          autoMatch: false,
          mains: s.mains.map((c) => (c.modelId === modelId ? { ...c, compares } : c)),
        })),

      /** 单卡「自动匹配」：按矩阵重算该卡（不动 autoMatch 开关——手动模式下也可单卡取回） */
      autoMatchCard: (modelId) =>
        setState((s) => ({
          ...s,
          mains: s.mains.map((c) => (c.modelId === modelId ? { ...c, compares: autoComparesFor(c) } : c)),
        })),

      /**
       * §5.4/§5.6 切换粒度：保持可见时间跨度只换桶。
       * dimTime 就绪 = 精确映射；空数据降级为不换算（timeUtils.convertRangeBuckets）。
       */
      setGranularity: (g) =>
        setState((s) => {
          if (s.granularity === g) return s;
          const { start, end } = convertRangeBuckets(s.rangeStart, s.rangeEnd, s.granularity, g);
          return { ...s, granularity: g, rangeStart: start, rangeEnd: end };
        }),

      /**
       * 自动匹配开关。开 = 立即按配置矩阵重算全部华为主品卡；
       * 关 = 保留当前对比转为手动（可自由增删）。
       */
      setAutoMatch: (on) =>
        setState((s) => ({ ...s, autoMatch: on, ...(on ? { mains: reapplyAuto(s.mains) } : {}) })),

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
          if (rule == null) delete products[key];
          else products[key] = rule;
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
