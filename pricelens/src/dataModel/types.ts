// ============================================================
// §7 数据模型（星型模型）+ 图表取数契约类型
// 冻结文件：子 Agent 只许引用，不许修改（改动需走集成负责人）
// ============================================================

export type TierCode = '<200' | '200-400' | '400-600' | '600-800' | '800-1000' | '1000+';

/** §7.1 地区部×国家；仅 R国 enabled=true */
export interface DimRegion {
  region_code: string;
  region_name: string;
  country_code: string;
  country_name: string;
  enabled: boolean;
  sort: number;
}

/** §7.1 SKU（颜色级）产品主数据；romram 与 color 分列 */
export interface DimProduct {
  sku_id: string;
  industry: 'phone';
  brand: string;
  is_own: boolean;
  series: string;
  model_name: string;
  romram: string; // 如 "12+256 GB" / "256 GB" / "1TB"
  color: string; // 首字母大写；无颜色行 "—"
  launch_date: string; // YYYY-MM-DD
  eol_date: string | null; // null=在售
  launch_price_rub: number;
  launch_price_usd: number;
  tier_code: TierCode; // 按 launch_price_usd 归档，档位归属稳定
  prev_model_id: string | null; // 型号级前后代（同型号各 SKU 共享）
  next_model_id: string | null;
}

export type StoreType = '1P' | '3P' | '独立站';

/** §7.1 国家×平台×店铺；价格事实不挂店铺明细 */
export interface DimChannel {
  platform: string;
  store_type: StoreType;
  shop_id: string;
  shop_name: string;
  country_code: string;
}

/** §7.1 周维度；周三为采集与展示锚；ISO 周 */
export interface DimTime {
  week_id: string; // YYYYWW，如 "202641"
  week_wed_date: string; // YYYY-MM-DD
  month_id: string; // YYYYMM
  quarter_id: string; // YYYYQn
  week_start_date: string; // 周一
}

/** §7.1 USD/RUB 月均汇率 */
export interface DimFx {
  month_id: string; // YYYYMM
  usd_rub_avg: number;
}

/** §7.1 R国促销日历 */
export interface DimPromo {
  promo_id: string;
  promo_name: string;
  start_date: string;
  end_date: string;
  depth_hint: '浅' | '中' | '深';
}

/** §7.1 我司 ROMRAM × 竞品 SKU 默认竞品矩阵 */
export interface DimBenchmark {
  own_model_id: string;
  own_romram: string;
  competitor_sku_id: string;
  sort: number; // 1=主竞品
  source: 'auto' | 'manual';
}

/** §7.2 事实表：一行 = 周 × SKU 价格快照（只有两个价格字段 + offer 文本） */
export interface FactPriceWeekly {
  week_id: string;
  sku_id: string;
  rrp_rub: number | null; // 官方 RRP 阶梯；无值=未上市/已退市
  rrp_usd: number | null;
  discounted_price_rub: number | null; // 折后价=可抓取平台最低在架价；缺采 null
  discounted_price_usd: number | null;
  offer_title: string | null; // offer 是文本不是价格
  offer_text: string | null;
  crawl_status: 'ok' | 'missing'; // missing=该周无可抓取平台 → 图上空心点
  url: string; // 取证跳转（demo=Ozon 搜索深链）
  batch_id: string;
  quality_flag: string;
}

// ---------------- 图表取数契约（§7.3 显示层聚合口径的输出） ----------------

export type Granularity = 'week' | 'month' | 'quarter';
export type CurrencyMode = 'local' | 'usd';
export type AggMode = 'avg' | 'min'; // 周→月/季 卷积方式

/** offer 浮窗所需信息（文本权益，不计价） */
export interface OfferInfo {
  title: string;
  text: string;
  endDate: string; // YYYY-MM-DD
  remainingDays: number; // 相对该数据点锚日
  platforms: string[];
  bankPriceRub?: number;
  tariffEstRub?: number;
}

/** 图上一个数据点（币种折算与取整已完成，图表层直用） */
export interface SeriesPoint {
  bucketId: string; // 周 YYYYWW / 月 YYYYMM / 季 YYYYQn
  xLabel: string; // 周=周三 MM-DD（如 07-15）/ 月=202607 / 季=2026Q1
  anchorDate: string; // ISO 日期（周=周三；月=桶内代表日；季=桶中代表周周三）
  rrp: number | null; // 显示币种、已取整；全局官方阶梯
  price: number | null; // 折后价（显示币种、已取整）；missing 为 null
  missing: boolean;
  offer: OfferInfo | null; // 周=该周 offer；月/季=桶内首个（仅附注用）
  url: string;
  shopName: string | null; // 最低价来源店铺（demo 演示用）
}

/** 一条系列 = 一个"产品名+ROMRAM"聚合（多 SKU 已按均值聚合） */
export interface Series {
  key: string;
  isOwn: boolean;
  brand: string;
  label: string; // 品牌 + 产品名 + ROMRAM
  skuIds: string[];
  color: string; // 品牌色（brandColor）
  points: SeriesPoint[];
}

export interface SkuGroupQuery {
  modelId: string;
  romram: string;
  skuIds: string[];
  isOwn: boolean;
}

/** §7.3 取数契约唯一入口的查询参数 */
export interface SeriesQuery {
  groups: SkuGroupQuery[]; // 我司 + 竞品的勾选组
  granularity: Granularity;
  startBucket: string; // 与 granularity 同粒度的桶 id
  endBucket: string;
  currency: CurrencyMode;
  agg: AggMode; // 仅月/季生效
  platform: { platforms: string[]; shopIds: string[] } | null; // null=未选=最低价口径
}
