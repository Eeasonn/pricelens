// ============================================================
// 筛选状态：五框状态 + §5.6 联动 + localStorage 持久化（LPL3.filters）
// + §13 CONFIG_CHANGED_EVENT 监听（反馈第 8 条修订：配置保存不再自动改竞品，
//   竞品由筛选条「匹配竞品」按钮按配置矩阵带出）
// 默认视图（§15.4-A13，第二十五轮改）：月 · USD · 我司 Pura 90s Pro 12+256（最低价颜色）
// + 其配置竞品（主竞品在前）· 仅折后价 · 时间自适应开
// 导出名 FiltersProvider / useFilters 与返回结构 { state, actions } 不变。
// ============================================================
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FiltersActions, FiltersState, ProductSelection } from './filtersTypes';
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';
import { dimProduct } from '../data';
import { lowestPriceColorSku } from '../dataModel/aggregate';
import { convertRangeBuckets } from '../components/FilterBar/timeUtils';
import { modelIdOf } from '../components/ProductCascader/tree';
import { groupsFromBenchmark } from './configStore';

/** §15.4-A13 默认视图（数据相关默认勾选在 loadInitialState 里按数据就绪情况叠加） */
export const defaultFilters: FiltersState = {
  countryCode: 'RU',
  industry: 'phone',
  own: [],
  competitors: [],
  platform: null,
  granularity: 'month',
  adaptive: true, // 第十九轮：时间自适应默认开
  rangeStart: '202607', // 与月粒度自洽的默认范围（自适应开时会被数据跨度覆盖）
  rangeEnd: '202610',
  currency: 'usd', // 第二十五轮：默认 USD（参考汇率 80 折算）
  priceTypes: { discounted: true, rrp: false },
  agg: 'avg',
};

/**
 * 默认视图版本：默认态字段（粒度/币种/竞品带出等）变更时 +1。
 * 持久化载荷带上 v；旧版本视为过期 → 本次启动直接落新默认视图（其后照常留存用户改动）。
 */
const DEFAULTS_V = 2;

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
      const parsed = JSON.parse(raw) as Partial<FiltersState> & { v?: number };
      if (parsed.v === DEFAULTS_V) {
        delete parsed.v; // 版本号只随持久化载荷走，不进内存状态
        restored = { ...defaultFilters, ...parsed };
      }
      // 版本不符（含旧版无 v 字段）→ 视为无持久化，直接落新默认视图
    }
  } catch {
    /* 忽略损坏的持久化数据 */
  }
  if (!restored) return { ...defaultFilters, ...computeDataDefaults() };
  if (!restored.own.length && dimProduct.length) {
    return { ...restored, ...computeDataDefaults() };
  }
  return restored;
}

interface FiltersCtx {
  state: FiltersState;
  actions: FiltersActions;
}

const Ctx = createContext<FiltersCtx>({
  state: defaultFilters,
  actions: { set: () => {}, switchOwnProduct: () => {}, reset: () => {}, setGranularity: () => {}, setOwnSelection: () => {}, resetCompetitorsToConfig: () => {} },
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

  // §13：配置页保存（CONFIG_CHANGED_EVENT）→ 保留联动监听（fx 为读取时取值，图表侧自行监听）；
  // 反馈第 8 条修订：**不再自动改当前竞品选择**，用户点「匹配竞品」才应用新矩阵。
  useEffect(() => {
    const handler = () => {
      /* 反馈第 8 条：配置保存不自动覆盖竞品；匹配由筛选条「匹配竞品」按钮触发 */
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
       * §5.6 切换我司产品：own 置为该产品；反馈第 8 条修订——不再自动带出竞品组。
       * 图表侧监听 state.own 变化把档位 chips / Y 轴回自动（本 action 只保证 state 正确）。
       */
      switchOwnProduct: (sel) => setState((s) => ({ ...s, own: [sel] })),

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
       * §5.2②：级联勾选我司产品（可多选同图）→ 反馈第 8 条修订：不动竞品（保持当前值），
       * 用户点「匹配竞品」才按配置矩阵带出；竞品临时增删不回写配置（§5.2③/§13）。
       */
      setOwnSelection: (list) => setState((s) => ({ ...s, own: list })),

      /**
       * 「匹配竞品」（反馈第 8 条）：把竞品组置为当前所有已选我司产品的配置组并集
       * （配置页 manual 优先、回退 dimBenchmark auto；主竞品在前）。再次点击重新匹配
       * （覆盖临时改动）；带出后临时增删走 set()，不回写配置。
       */
      resetCompetitorsToConfig: () =>
        setState((s) => ({ ...s, competitors: groupsFromBenchmark(s.own) })),
    }),
    [],
  );

  const value = useMemo<FiltersCtx>(() => ({ state, actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilters() {
  return useContext(Ctx);
}
