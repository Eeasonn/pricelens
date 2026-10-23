// ============================================================
// §7 数据模型（星型模型）+ 图表取数契约类型
// 2026-10-20 真实数据接入（多国 × 多产业 × 多币种）：
//   - 事实表升为 周 × SKU × 国家 × 渠道（平台×店铺类型）× 店铺，价格字段带行内汇率
//   - 维表全部由 scripts/ingest_real.py 从「全量数据表.xlsx + 产品竞品矩阵 + 国家主要电渠 + 国家大促日历」产出
//   - 图表取数契约（Series/SeriesPoint/SeriesQuery）保持不变，图表层零改动
// ============================================================

/** 产业（源表品类 Smartphone/Tablet/Wearable/Earbuds/IoT/PC 的归一） */
export type Industry = 'phone' | 'tablet' | 'wearable' | 'audio' | 'iot' | 'pc';

/** 价格档位代码（按产业各自的 USD 阶梯，见 dim_tier.json：'<200' | '200-400' | … | '1000+'） */
export type TierCode = string;

/** §7.1 地区部×国家；enabled = 事实表有该国数据 */
export interface DimRegion {
  region_code: string;
  region_name: string;
  country_code: string;
  country_name: string;
  enabled: boolean;
  sort: number;
  /** 该国本币（ISO 4217，如 RUB / SAR / MXN）；无数据国家为 null */
  currency: string | null;
  /** 「国家主要电渠」给出的核心电渠（已过滤为数据中存在的平台，顺序即优先级） */
  core_platforms: string[];
  /** 默认平台 = 核心电渠首个；未选平台时的单平台口径 */
  default_platform: string | null;
  /** 每产业默认我司型号（产品竞品矩阵该国首个有数型号） */
  default_own_models: Partial<Record<Industry, string>>;
}

/** §7.1 SKU（颜色级）产品主数据；romram = 配置（手机/平板 RAM+ROM；平板带尺寸/联网；穿戴带表盘尺寸/蜂窝；音频 '—'） */
export interface DimProduct {
  sku_id: string; // `${own|cmp}-${brand}-${model}__${config}__${color}`
  model_id: string; // sku_id 的 `__` 前缀段（型号 id）
  industry: Industry;
  brand: string;
  is_own: boolean;
  series: string;
  model_name: string;
  romram: string; // 配置显示文案，如 "12+256 GB" / '11.5" WiFi 8+128 GB' / "46mm GPS" / "—"
  color: string; // 首字母大写；无颜色 "—"
  tier_code: TierCode; // 型号级全局兜底档位（各国档位众数）；有国家上下文时用 tier_by_country
  /** 分国档位：该国矩阵有声明用业务声明，否则按该国参考价（RRP USD 中位数）落产业阶梯 */
  tier_by_country: Record<string, TierCode>;
  ref_price_usd: number | null; // 参考价 = 跨国官网 RRP 美元中位数（缺 RRP 时用成交价）
  launch_date: string; // 首次采集到的周三（≈上市/进入采集范围）
  eol_date: string | null; // null = 在售
  first_week: string; // YYYYWW
  last_week: string;
  countries: string[]; // 有事实行的国家码
  prev_model_id?: string | null;
  next_model_id?: string | null;
}

export type StoreType = '1P' | '3P' | '独立站';

/** §7.1 渠道 = 国家 × 平台 × 店铺类型；具体店铺名挂在事实行（seller） */
export interface DimChannel {
  channel_id: string; // `${cc}:${platform-slug}:${store_type}`
  country_code: string;
  platform: string;
  store_type: StoreType;
  display_name: string; // 源表「显示店铺名称」多数票，如 "OZON 1P" / "DNS 独立站"
  shops: number; // 该渠道下不同店铺数
}

/** §7.1 周维度；周三为采集与展示锚；ISO 周 */
export interface DimTime {
  week_id: string; // YYYYWW
  week_wed_date: string; // YYYY-MM-DD
  month_id: string; // YYYYMM
  quarter_id: string; // YYYYQn
  week_start_date: string; // 周一
}

/** §7.1 币种月度汇率（本币 / USD），取自源表行内汇率中位数 */
export interface DimFx {
  currency: string;
  month_id: string; // YYYYMM
  per_usd: number;
}

/** §7.1 分国大促日历（「国家大促日历」模糊月份解析到 2026 具体区间） */
export interface DimPromo {
  promo_id: string;
  country_code: string;
  promo_name: string;
  start_date: string;
  end_date: string;
  depth_hint: '浅' | '中' | '深';
  /** 适用平台；null = 全渠道 */
  platforms: string[] | null;
  channel_raw: string;
}

/** §7.1 分国默认竞品矩阵（我司型号×配置 → 竞品代表色 SKU） */
export interface DimBenchmark {
  country_code: string;
  own_model_id: string;
  own_romram: string;
  competitor_sku_id: string;
  sort: number; // 同我司配置内 1=主竞品
  /** matrix = 矩阵直配；substitute = 矩阵竞品无数据、用近似替代品；manual = 人工；auto = 旧造数默认 */
  source: 'matrix' | 'substitute' | 'manual' | 'auto';
  note?: string; // 矩阵原文
}

/** 产业 USD 档位阶梯（dim_tier.json） */
export interface DimTier {
  ladders: Record<Industry, string[]>; // 低 → 高的 tier_code 序
  labels: Record<Industry, Record<string, string>>;
}

/** §7.2 事实表：一行 = 周 × SKU × 国家 × 渠道 × 店铺 的价格快照（真实采集） */
export interface FactPriceWeekly {
  week_id: string;
  sku_id: string;
  country_code: string;
  channel_id: string; // → DimChannel
  seller: string; // 源表「店铺名称」；无 "—"
  /** 官网建议零售价（本币）= 官方阶梯/账面价 */
  rrp_local: number | null;
  /** 官网成交价（本币） */
  official_price_local: number | null;
  /** 平台建议零售价（本币，平台划线价） */
  list_price_local: number | null;
  /** 平台成交价（本币）= 折后价 */
  price_local: number | null;
  /** 行内汇率（本币 / USD） */
  fx: number;
  rrp_usd: number | null;
  price_usd: number | null;
  /** 折扣率统一为负小数（-0.29 = 降 29%） */
  discount_official: number | null;
  discount_display: number | null;
  discount_actual: number | null;
  bundle: boolean; // 是否组合销售
  installment: string | null; // 分期付款原文
  promo_text: string | null; // 促销政策原文
  url: string;
  screenshot: string; // 截图命名（取证）
  crawled_at: string; // YYYY-MM-DD HH:MM
  crawl_status: 'ok';
}

// ---------------- 图表取数契约（§7.3 显示层聚合口径的输出） ----------------

export type Granularity = 'week' | 'month' | 'quarter';
export type CurrencyMode = 'local' | 'usd';
export type AggMode = 'avg' | 'min'; // 周→月/季 卷积方式

// ---------------- offer 结构化权益 ----------------
// 真实数据：分期付款 / 促销政策 / 组合销售 三列直接映射为 installment / discount / gift 三类。

export type OfferKind = 'discount' | 'installment' | 'gift';

/** 单条权益（文本权益，不计价） */
export interface OfferDetail {
  kind: OfferKind;
  promoName: string; // 所属档期（命中分国大促日历则为档期名，否则为「平台促销」/「分期」/「组合销售」）
  headline: string; // 一眼短文案
  detail: string; // 完整原文
  endDate: string; // YYYY-MM-DD（档期截止；无档期 = 锚日）
  remainingDays: number; // 相对该数据点锚日
  bankPriceRub?: number;
  tariffEstRub?: number;
}

export interface OfferInfo {
  discount?: OfferDetail;
  installment?: OfferDetail;
  gift?: OfferDetail;
}

/** 图上一个数据点（币种折算与取整已完成，图表层直用） */
export interface SeriesPoint {
  bucketId: string; // 周 YYYYWW / 月 YYYYMM / 季 YYYYQn
  xLabel: string; // 周=周三 MM-DD / 月=202607 / 季=2026Q1
  anchorDate: string; // ISO 日期
  rrp: number | null; // 显示币种、已取整；官网建议零售价
  price: number | null; // 折后价（显示币种、已取整）；missing 为 null
  missing: boolean;
  offer: OfferInfo | null;
  url: string;
  shopName: string | null; // 取价店铺（渠道显示名 · 店铺名）
  platform?: string | null; // 取价平台（dim_channel.platform，随最低价行带出；明细表平台列）
}

/** 一条系列 = 一个"产品名+配置"聚合（多颜色 SKU 已按均值聚合） */
export interface Series {
  key: string;
  isOwn: boolean;
  brand: string;
  label: string; // 品牌 + 产品名 + 配置
  skuIds: string[];
  color: string; // 品牌色（brandColor）
  points: SeriesPoint[];
  edgeStart?: boolean;
  edgeEnd?: boolean;
}

export interface DataScope {
  countryCode: string;
  industry: Industry;
}

export interface SkuGroupQuery {
  modelId: string;
  romram: string;
  skuIds: string[];
  isOwn: boolean;
}

/** 平台选择：platforms = 勾整平台（其下全部渠道）；shopIds = 勾到渠道（channel_id）；
 *  seller = 渠道内具体卖家店铺（第一百四十一轮）：仅在 shopIds 单渠道时有意义，
 *  缺省/null = 该渠道全部卖家取最低在架价（默认口径） */
export interface PlatformQuery {
  platforms: string[];
  shopIds: string[];
  seller?: string | null;
}

/** §7.3 取数契约唯一入口的查询参数 */
export interface SeriesQuery {
  scope: DataScope;
  groups: SkuGroupQuery[]; // 我司 + 竞品的勾选组
  granularity: Granularity;
  startBucket: string;
  endBucket: string;
  currency: CurrencyMode;
  agg: AggMode; // 仅月/季生效
  /** null / 空 = 该国默认平台（国家主要电渠首个）；渠道内多店铺取最低在架价 */
  platform: PlatformQuery | null;
}
