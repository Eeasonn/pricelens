// ============================================================
// 筛选状态：五框状态 + §5.6 联动 + localStorage 持久化（LPL3.filters）
// + §13 CONFIG_CHANGED_EVENT 监听（反馈第 8 条修订：配置保存不再自动改竞品，
//   竞品由筛选条「匹配竞品」按钮按配置矩阵带出）
// 默认视图（§15.4-A13，第二十五轮起多轮演进）：周 · USD · 平台 = 我司官方店铺 Ozon Россия
// （第五十三轮）· 我司 Pura 90s Pro 12+256（最低价颜色）+ 其配置竞品（主竞品在前）
// · 仅折后价（第五十轮）· 时间自适应开 · 竞品自动匹配开
// 导出名 FiltersProvider / useFilters 与返回结构 { state, actions } 不变。
// ============================================================
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AlertProductRule,
  AlertThresholds,
  AlertTypeSwitches,
  FiltersActions,
  FiltersState,
  PlatformSelection,
  ProductSelection,
} from './filtersTypes';
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';
import { dimChannel, dimProduct } from '../data';
import { lowestPriceColorSku } from '../dataModel/aggregate';
import { convertRangeBuckets } from '../components/FilterBar/timeUtils';
import { modelIdOf } from '../components/ProductCascader/tree';
import { groupsFromBenchmark } from './configStore';
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

/** 我司官方店铺（OZON 1P 首店「Ozon Россия」）——平台默认值，用户可独立调整。 */
export const OWN_OFFICIAL_SHOP_ID =
  dimChannel.find((c) => c.platform === 'OZON' && c.store_type === '1P')?.shop_id ?? 'shop-001';

/** 平台默认选择（第五十三轮，用户定版）：只选一个——我司在 OZON 的官方店铺「Ozon Россия」；
 *  勾店铺而非勾整平台 = 触发器显名店铺（此前默认勾整平台 OZON，数据口径不变：OZON = 基准） */
export const DEFAULT_PLATFORM_SELECTION: PlatformSelection = { platforms: [], shopIds: [OWN_OFFICIAL_SHOP_ID] };

/** §15.4-A13 默认视图（数据相关默认勾选在 loadInitialState 里按数据就绪情况叠加） */
export const defaultFilters: FiltersState = {
  countryCode: 'RU',
  industry: 'phone',
  own: [],
  competitors: [],
  platform: DEFAULT_PLATFORM_SELECTION, // 第五十三轮：默认只选「Ozon Russia」官方店铺（v8；OZON 基准数据口径不变）
  granularity: 'week', // 第四十二轮：默认周（迪总「时间默认取周」）
  adaptive: true, // 第十九轮：时间自适应默认开
  rangeStart: '202601', // 与周粒度自洽的默认范围（自适应开时会被数据跨度覆盖）
  rangeEnd: '202641',
  currency: 'usd', // 第二十五轮：默认 USD（参考汇率 80 折算）
  priceTypes: { discounted: true, rrp: false }, // 第五十轮：RRP 默认不勾选（图面聚焦折后价；要看账面价手动勾回）
  agg: 'avg',
  autoMatch: true, // 第三十四轮：自动匹配竞品默认开（竞品跟随我司产品，迪总「减少筛选器」）
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
 */
const DEFAULTS_V = 9;

/** 我司默认产品（§5.2②：Pura 90s Pro · 12+256，其最低价颜色） */
const DEFAULT_OWN_MODEL = 'Pura 90s Pro';
const DEFAULT_OWN_ROMRAM_PREFIX = '12+256';

/**
 * 数据就绪时的默认勾选（第二十五轮改）：
 * - 我司 = Pura 90s Pro · 12+256（其最低价颜色，lowestPriceColorSku）；无数据 → own=[]
 * - 竞品 = 该我司组的配置矩阵并集（groupsFromBenchmark，主竞品在前）；
 *   之后切换我司仍不自动带出（反馈第 8 条），点「匹配竞品」重新匹配
 */
function computeDataDefaults(): Partial<FiltersState> {
  if (!dimProduct.length) return {};
  const row =
    dimProduct.find(
      (p) => p.is_own && p.model_name === DEFAULT_OWN_MODEL && p.romram.startsWith(DEFAULT_OWN_ROMRAM_PREFIX),
    ) ?? dimProduct.find((p) => p.is_own && p.model_name === DEFAULT_OWN_MODEL);
  if (!row) return {};
  const modelId = modelIdOf(row); // 型号 id = sku_id 前缀（与 benchmark/aggregate 同 id 空间）
  const skuId = lowestPriceColorSku(modelId, row.romram);
  if (!skuId) return {}; // 无数据（含 fact 未生成）→ 保持 own=[]，不崩溃
  const own: ProductSelection[] = [{ modelId, romram: row.romram, skuIds: [skuId] }];
  return { own, competitors: groupsFromBenchmark(own) };
}

/**
 * 启动恢复：
 * 1) 无持久化 / 持久化版本旧于 DEFAULTS_V → 新默认视图（月 · USD · 我司+配置竞品）；
 * 2) 版本相符 → competitors 照原样恢复（可能为空，不自动补竞品）；
 *    但若我司勾选为空而数据此刻已就绪（典型：数据先生成前打开过、造数后重建），
 *    仅补默认我司产品+其配置竞品。
 */
function loadInitialState(): FiltersState {
  let restored: FiltersState | null = null;
  try {
    const raw = localStorage.getItem(LPL.filters);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FiltersState> & { v?: number; alertThreshold?: number };
      if (parsed.v === DEFAULTS_V || parsed.v === 8) {
        const { alertThreshold, v: _v, ...rest } = parsed;
        restored = { ...defaultFilters, ...rest };
        // v8 → v9 迁移（追补⑨）：旧单阈值 → 三类同值；订阅保留；own-gap 落缺省 15%
        if (parsed.v === 8 && typeof alertThreshold === 'number') {
          restored.alertThresholds = {
            ...DEFAULT_ALERT_THRESHOLDS,
            'price-change': alertThreshold,
            promo: alertThreshold,
            'platform-gap': alertThreshold,
          };
        }
      }
      // 版本不符（含旧版无 v 字段）→ 视为无持久化，直接落新默认视图
    }
  } catch {
    /* 忽略损坏的持久化数据 */
  }
  if (!restored) restored = { ...defaultFilters, ...computeDataDefaults() };
  if (!restored.own.length && dimProduct.length) {
    restored = { ...restored, ...computeDataDefaults() };
  }
  // 追补⑩（建议③）：URL 覆写最后应用——分享链接 > 持久化 > 默认视图；
  // own 覆写存在时竞品按现行 autoMatch 规则带出（与手选同语义）
  const url = readUrlOverrides();
  if (url.filters.own?.length) {
    restored = {
      ...restored,
      ...url.filters,
      ...(restored.autoMatch ? { competitors: groupsFromBenchmark(url.filters.own) } : {}),
    };
  } else if (Object.keys(url.filters).length > 0) {
    restored = { ...restored, ...url.filters };
  }
  restored = { ...restored, ...normalizeDataScope(restored) };
  return restored;
}

interface FiltersCtx {
  state: FiltersState;
  actions: FiltersActions;
}

const Ctx = createContext<FiltersCtx>({
  state: defaultFilters,
  actions: { set: () => {}, switchOwnProduct: () => {}, reset: () => {}, setGranularity: () => {}, setOwnSelection: () => {}, resetCompetitorsToConfig: () => {}, setAutoMatch: () => {}, toggleAlertSub: () => {}, setAlertSubs: () => {}, setAlertTypes: () => {}, setAlertThresholds: () => {}, setAlertProductRule: () => {} },
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
    const own = state.own.map((s) => `${s.modelId}__${s.romram.replace(/\s+/g, '')}`).join(',');
    const shop = state.platform?.shopIds[0] ?? null;
    writeUrlPatch({
      c: state.countryCode,
      i: state.industry,
      g: state.granularity,
      cur: state.currency,
      own: own || null,
      shop,
    });
  }, [state.countryCode, state.industry, state.granularity, state.currency, state.own, state.platform, state.autoMatch]);

  // §13：对标配置保存（CONFIG_CHANGED_EVENT）→ 自动匹配开启时立即按新矩阵重算竞品组
  // （第三十四轮引入；矩阵维护入口现为总览行尾「＋添加竞品」浮窗，关闭自动匹配则不动当前竞品）；
  // fx 为读取时取值，图表侧自行监听。
  useEffect(() => {
    const handler = () => {
      setState((s) => (s.autoMatch ? { ...s, competitors: groupsFromBenchmark(s.own) } : s));
    };
    window.addEventListener(CONFIG_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, handler);
  }, []);

  // actions 只依赖 setState（函数式更新），全量稳定，避免图表侧监听 actions 变化
  const actions = useMemo<FiltersActions>(
    () => ({
      /** 通用补丁（平台/币种/时间范围/竞品临时增删/价格类型/agg 等直接字段） */
      set: (patch) => setState((s) => ({ ...s, ...patch })),

      /**
       * §5.6 切换我司产品：own 置为该产品。第三十四轮：autoMatch 开 = 竞品自动跟随
       * 新产品（配置矩阵并集）；关 = 不动竞品。图表侧监听 state.own 变化把档位 chips /
       * Y 轴回自动（本 action 只保证 state 正确）。
       */
      switchOwnProduct: (sel) =>
        setState((s) => ({
          ...s,
          own: [sel],
          ...(s.autoMatch ? { competitors: groupsFromBenchmark([sel]) } : {}),
        })),

      /** 回到默认视图（含数据默认我司勾选 + 其配置竞品） */
      reset: () => setState(loadInitialState()),

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
       * §5.2②：级联勾选我司产品（可多选同图）。第三十四轮：autoMatch 开 = 竞品自动
       * 跟随（配置矩阵并集）；关 = 不动竞品（保持当前值，手动勾选语义）；
       * 竞品临时增删不回写配置（§5.2③/§13）。
       */
      setOwnSelection: (list) =>
        setState((s) => ({
          ...s,
          own: list,
          ...(s.autoMatch ? { competitors: groupsFromBenchmark(list) } : {}),
        })),

      /**
       * 「匹配竞品」（反馈第 8 条）：把竞品组置为当前所有已选我司产品的配置组并集
       * （配置页 manual 优先、回退 dimBenchmark auto；主竞品在前）。再次点击重新匹配
       * （覆盖临时改动）；带出后临时增删走 set()，不回写配置。
       */
      resetCompetitorsToConfig: () =>
        setState((s) => ({ ...s, competitors: groupsFromBenchmark(s.own) })),

      /**
       * 第三十四轮：自动匹配开关。开 = 立即按配置矩阵重算当前竞品组；
       * 关 = 保留当前竞品转为手动（可自由增删）。
       * 平台现在是独立的图表口径，切换竞品匹配方式不改平台。
       */
      setAutoMatch: (on) =>
        setState((s) => ({
          ...s,
          autoMatch: on,
          ...(on ? { competitors: groupsFromBenchmark(s.own) } : {}),
        })),

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
