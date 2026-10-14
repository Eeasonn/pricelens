// ============================================================
// 筛选状态类型（§5 五框 + 图表侧写入字段）
// 核心字段冻结；筛选负责人（Agent B）只许追加字段，不许改动/删除已有字段
// ============================================================
import type { AggMode, CurrencyMode, Granularity } from '../dataModel/types';

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
  own: ProductSelection[]; // 我司产品（可多选同图）
  competitors: ProductSelection[]; // 默认视图带出我司默认产品的配置竞品（第二十五轮）；之后切换我司不自动带出，点「匹配竞品」重新匹配
  platform: PlatformSelection | null; // null=未选=可抓取平台最低价口径（§3.1 决策②）
  granularity: Granularity; // 默认 'month'（第二十五轮）
  /** 第十九轮：时间自适应（默认开）——开 = 范围自动 = 所选产品数据跨度 ±2 个间隔
   *  （钳在数据全集内，右缘不超当前时间），RangePicker 冻结不可选；
   *  关 = 回手动：RangePicker 可选，拖刷轨道钳在所选范围内，仅 ‹› 箭头可把范围极值外扩 */
  adaptive: boolean;
  rangeStart: string; // 桶 id：周 YYYYWW / 月 YYYYMM / 季 YYYYQn
  rangeEnd: string;
  currency: CurrencyMode; // 默认 'usd'（第二十五轮；参考汇率 80 折算），'local'=RUB
  priceTypes: { discounted: boolean; rrp: boolean }; // 默认仅折后价（§3.2）
  agg: AggMode; // 数据汇总，仅月/季粒度生效，默认 'avg'
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
}
