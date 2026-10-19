// ============================================================
// 筛选状态类型（§5 五框 + 图表侧写入字段）
// 核心字段冻结；筛选负责人（Agent B）只许追加字段，不许改动/删除已有字段
// ============================================================
import type { AggMode, CurrencyMode, Granularity } from '../dataModel/types';
import type { AlertProductRule, AlertThresholds, AlertTypeSwitches } from '../dataModel/alerts';
export type { AlertProductRule, AlertThresholds, AlertTypeSwitches };

/** 一个"产品名+ROMRAM"勾选组（默认勾选落 ROMRAM 层、自动带最低价颜色） */
export interface ProductSelection {
  modelId: string; // 型号 id（同型号 SKU 共享）
  romram: string;
  skuIds: string[]; // 所选颜色 SKU；1 个=该颜色；多个=均值
}

export interface PlatformSelection {
  platforms: string[]; // 勾选的平台（勾平台=勾其下全部店铺）
  shopIds: string[]; // 可下钻只勾具体店铺
}

export interface FiltersState {
  countryCode: string; // 仅 'RU' 可选
  industry: 'phone'; // 平板/穿戴/音频置灰
  /** 主体模式（互斥）：'product' = 按产品勾选（现状）；'tier' = 按价格档位，
   *  图表自动集结该档全部我司配置 + 各自对标竞品（tierSubjectSelections） */
  subjectMode: 'product' | 'tier';
  /** 按档位模式选中的价格档位（tier_code，dim_product.tier_code）；product 模式不生效 */
  tier: string | null;
  own: ProductSelection[]; // 我司产品（可多选同图）
  competitors: ProductSelection[]; // 默认视图带出我司默认产品的配置竞品（第二十五轮）；之后切换我司不自动带出，点「匹配竞品」重新匹配
  platform: PlatformSelection | null; // null=未选=可抓取平台最低价口径（§3.1 决策②）
  granularity: Granularity; // 默认 'month'（第二十五轮）
  /** 时间自适应（默认开）= 所选产品最早/最晚有效价格桶；上方筛选器手动修改即转为自定义。
   *  底部刷选条只负责在该极值范围内缩放查看，恢复自动时重新计算范围。 */
  adaptive: boolean;
  rangeStart: string; // 桶 id：周 YYYYWW / 月 YYYYMM / 季 YYYYQn
  rangeEnd: string;
  currency: CurrencyMode; // 默认 'usd'（第二十五轮；参考汇率 80 折算），'local'=RUB
  priceTypes: { discounted: boolean; rrp: boolean }; // 默认仅折后价（第五十轮：RRP 默认不勾选，手动勾回看账面价）
  agg: AggMode; // 数据汇总，仅月/季粒度生效，默认 'avg'
  /**
   * 第三十四轮（迪总「尽量减少筛选器」）：自动匹配竞品常驻开关（默认开）——
   * 开 = 竞品完全跟随我司产品（配置矩阵并集：换产品自动跟随、清空产品自动清空，
   * 竞品级联禁用）；关 = 手动勾选竞品（原有语义）。
   */
  autoMatch: boolean;
  /**
   * 第五十二轮 预警中心：已订阅系列（seriesKey = `modelId__romram去空格`，与图表
   * 系列 key 同空间——看板图例页签、总览型号块两处入口共用一份订阅）。
   * 追补⑨起语义 = 「启用了预警的产品」：预警中心页按产品管理四类开关与阈值。
   */
  alertSubs: string[];
  /** 追补⑨：四类预警全局开关（调价 / 折扣 / 平台价差 / 档位间距） */
  alertTypes: AlertTypeSwitches;
  /** 追补⑨：四类预警全局阈值（小数，0.05=5%；own-gap 为「低于」触发） */
  alertThresholds: AlertThresholds;
  /** 追补⑨：按产品覆写（types/thresholds 部分字段，缺省回落全局；own-gap 不参与） */
  alertProducts: Record<string, AlertProductRule>;
}

export interface FiltersActions {
  set(patch: Partial<FiltersState>): void;
  /** §5.6：切换我司产品（反馈第 8 条修订：不再自动带出竞品组；图表侧监听 own 变化把档位/Y轴回自动） */
  switchOwnProduct(sel: ProductSelection): void;
  reset(): void;
  // ---- 以下为筛选负责人（Agent B）追加的动作（不改/不删上方已有三项） ----
  /** §5.4/§5.6：切换粒度——保持可见时间跨度只换桶（dimTime 映射；空数据降级为不换算） */
  setGranularity(g: Granularity): void;
  /** §5.2：级联勾选我司产品（可多选同图）；反馈第 8 条修订：不动竞品 */
  setOwnSelection(list: ProductSelection[]): void;
  /** 「匹配竞品」（反馈第 8 条）：把竞品组置为当前已选我司产品配置组的并集（主竞品在前），再次点击重新匹配 */
  resetCompetitorsToConfig(): void;
  /** 第三十四轮：切换自动匹配；开 = 立即按配置矩阵重算当前竞品组（关 = 保留当前竞品转为手动） */
  setAutoMatch(on: boolean): void;
  // ---- 第五十二轮 预警中心 ----
  /** 单系列订阅切换（看板图例页签铃铛） */
  toggleAlertSub(key: string): void;
  /** 批量订阅/退订（总览型号块：我司全部 ROM + 其映射竞品一次订阅） */
  setAlertSubs(keys: string[], on: boolean): void;
  // ---- 追补⑨ 预警细化 ----
  /** 四类全局开关（部分补丁） */
  setAlertTypes(patch: Partial<AlertTypeSwitches>): void;
  /** 四类全局阈值（部分补丁，小数） */
  setAlertThresholds(patch: Partial<AlertThresholds>): void;
  /** 按产品覆写（rule = null 清除覆写回落全局） */
  setAlertProductRule(key: string, rule: AlertProductRule | null): void;
}
