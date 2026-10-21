// ============================================================
// 筛选状态类型（§5 五框 + 图表侧写入字段）
// 第一百一十七轮（统一产品选择器）：own/competitors 两个并列字段退役，
// 改为 mains——每个主分析产品一张卡。
// 第一百二十轮（第三次迭代）：主分析卡收敛为「唯一产品 + 唯一型号 + 唯一颜色」；
// 一个产品的多个型号 = 多张独立卡；`main: null` = 尚未选主品的空对
// （允许先挂对比条目，补选主品后沿用）。
// 「主分析 / 对比」是角色（用户指定），与数据层 is_own（华为产品的事实）正交：
// 主品可任意品牌，对比区也可含华为产品。
// ============================================================
import type { AggMode, CurrencyMode, Granularity, Industry } from '../dataModel/types';
import type { AlertProductRule, AlertThresholds, AlertTypeSwitches } from '../dataModel/alerts';
export type { AlertProductRule, AlertThresholds, AlertTypeSwitches };

/** 一个"产品名+ROMRAM"勾选组（默认勾选落 ROMRAM 层、自动带最低价颜色） */
export interface ProductSelection {
  modelId: string; // 型号 id（同型号 SKU 共享）
  romram: string;
  skuIds: string[]; // 所选颜色 SKU；1 个=该颜色；多个=均值
}

/** 主分析产品卡：唯一主品（含颜色）+ 它自己的对比区（任意品牌，含华为）。
 *  id = 稳定键（拖拽换序/弹窗定位），与 modelId 解耦（同型号不同配置 = 多卡）。 */
export interface MainProduct {
  id: string;
  main: ProductSelection | null;
  compares: ProductSelection[];
}

export interface PlatformSelection {
  platforms: string[]; // 勾选的平台（勾平台=勾其下全部店铺）
  shopIds: string[]; // 可下钻只勾具体渠道（channel_id = 国家:平台:店铺类型）
}

export interface FiltersState {
  countryCode: string; // 有数据的国家（dim_region.enabled）
  industry: Industry; // 手机/平板/穿戴/音频（IoT/PC 有数据无矩阵）
  // 第一百二十三轮：「按档位」主体模式退役（subjectMode/tier 字段删除）——
  // 档位有机融入「选择产品」浮窗的树筛选与批量动作，见 tierSelection.appendTierCards。
  /** 主分析产品卡列表：卡序 = 分离面板序；≥2 张卡看板自动分离 */
  mains: MainProduct[];
  platform: PlatformSelection | null; // null=未选=该国默认电渠单平台口径；渠道内多店铺取最低在架价
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
   * 对比自动匹配（第三十四轮语义延续，按卡生效）：开 = 华为主品卡的
   * 对比区随配置自动重算（对标矩阵，按卡配额截断）；任一卡手动改对比即退出，
   * 非华为主品卡（矩阵无行）始终手动。
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
  /** 回到默认视图（含数据默认主分析卡 + 其配置对比区） */
  reset(): void;
  // ---- 主分析卡操作 ----
  /** 卡片结构变化（增删卡/换主品/换序）。autoMatch 开 = 华为主品卡对比区按矩阵重算
   *  （配额收口）；非华为主品卡与手动退出自动后的一切对比区不动。 */
  setMains(list: MainProduct[]): void;
  /** 手动改某卡对比区（增删/调色/换条目）：直接写入并退出自动匹配（原第三十四轮语义） */
  setCardCompares(cardId: string, compares: ProductSelection[]): void;
  /** 单卡「自动匹配竞品」：按矩阵重算该卡对比区（不改 autoMatch 开关） */
  autoMatchCard(cardId: string): void;
  // ---- 粒度 ----
  /** §5.4/§5.6：切换粒度——保持可见时间跨度只换桶（dimTime 映射；空数据降级为不换算） */
  setGranularity(g: Granularity): void;
  /** 自动匹配开关。开 = 立即按配置矩阵重算全部华为主品卡；关 = 保留当前对比转为手动 */
  setAutoMatch(on: boolean): void;
  // ---- 第五十二轮 预警中心 ----
  /** 单系列订阅切换（看板图例页签铃铛） */
  toggleAlertSub(key: string): void;
  /** 批量订阅/退订（总览型号块：全部 ROM + 其映射对比一次订阅） */
  setAlertSubs(keys: string[], on: boolean): void;
  // ---- 追补⑨ 预警细化 ----
  /** 四类全局开关（部分补丁） */
  setAlertTypes(patch: Partial<AlertTypeSwitches>): void;
  /** 四类全局阈值（部分补丁，小数） */
  setAlertThresholds(patch: Partial<AlertThresholds>): void;
  /** 按产品覆写（rule = null 清除覆写回落全局；own-gap 不参与产品级） */
  setAlertProductRule(key: string, rule: AlertProductRule | null): void;
}
