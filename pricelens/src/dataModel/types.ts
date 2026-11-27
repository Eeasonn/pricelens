import type { FinancingPlan, FinancingTerm, FinancingType } from './marketProfile';

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
  /** 药丸品牌内联（2026-11-13 Eason）：型号名看不出品牌（小米数字系列/A37/X9D 这类
   *  裸型号名）= true，药丸第一行固定带品牌词；一眼能认出的（iPhone/Galaxy/Redmi…）
   *  = false，品牌只在悬停 title 显示。ingest 侧 is_brand_inline 判定 + 人工覆写。 */
  brand_inline?: boolean;
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
  // prev_model_id（型号级前后代）已退役（2026-11-27）：上一代关系到配置层级，权威来源是
  // 服务器端配置表 config_tables.xlsx「上一代配置」页签，随数据包 prevGen 段下发（见 PrevGenGroup）
  next_model_id?: string | null;
  /**
   * 维度1（2026-11-17 真实销量对齐，Eason offer/PSI 契约 Category1）：
   * 手机/平板 = 存储（`12+512 GB`）；穿戴 = 表盘（`42mm`，不涉及/唯一尺寸 = null）；
   * 音频/iot = null（产品级）。null = 未回填（销量匹配回落到 romram/color 解析）；
   * 显示文案仍走 romram，本字段只做结构与匹配。
   */
  cat1?: string | null;
  /** 维度2（Category2）：平板 = 屏幕（`11.5"`）；其余产业 null。 */
  cat2?: string | null;
  /** 维度3（Category3）：平板 = 柔光（`Normal` / `PaperMatte`），取自人工匹配行（2026-11-27 PSI 关联：
   *  销量事实到 category 粒度，取数键必须与匹配表行同源）；未回填的历史包缺省（按 romram 推断）；
   *  其余产业 null。 */
  cat3?: string | null;
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
  /** null = 通配所有国家（配置表矩阵行国家码留空的语义）；空串是非法值（读取端永不匹配） */
  country_code: string | null;
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
  /** 建议零售价（本币）= 平台划线价/账面价（2026-10-27 源表清洗后官网模拟价退役，rrp 即平台真实划线价） */
  rrp_local: number | null;
  /** 平台成交价（本币）= 折后价 */
  price_local: number | null;
  /** 行内汇率（本币 / USD） */
  fx: number;
  rrp_usd: number | null;
  price_usd: number | null;
  /** 折扣率统一为负小数（-0.29 = 降 29%） */
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

/** 南非运营商小册子月度事实。仅 review_status = PASS 的行进入 published facts。 */
export type MonthlyPriceType = 'installment' | 'prepaid' | 'no-price';
export type MonthlyReviewStatus = 'PASS' | 'PENDING' | 'FAIL';
export type MonthlyMatchStatus = 'matched-spec-complete' | 'matched-model' | 'unmatched' | 'pending-spec';

export interface FactPriceMonthly {
  offer_id: string;
  period_id: string; // YYYYMM
  country_code: string;
  /** 发布阶段映射到 dim_product 的颜色级 SKU；staging 复核前可为空。 */
  sku_id?: string | null;
  platform: string;
  store_type: StoreType;
  brand: string | null;
  model: string | null;
  sku_spec: string | null;
  price_type: MonthlyPriceType;
  price_local: number | null;
  currency: string;
  fx_rate: number;
  price_usd: number | null;
  rrp_local: number | null;
  /** 后付合约月供对应合约期总价（册子「N期总价」列）；先付/无价行 = null */
  total_local?: number | null;
  total_usd?: number | null;
  term_months: 24 | 36 | 48 | null;
  promotion_text?: string | null;
  source_document: string;
  source_page: string | number | null;
  source_sha256: string | null;
  review_status: MonthlyReviewStatus;
  gate_reasons: string[];
  match_status: MonthlyMatchStatus;
}

// ---------------- 真实销量（PSI 周表，2026-11-17 Eason 契约） ----------------

/**
 * PSI 销量源行（外部输入原样承载，不要求先归一）——对应公司 Agent 产出的
 * 「Product SKU 拆列 + QTY 按粒度汇总」后的周表：
 *   Management Country/Region → country；Product → product；
 *   Category1/Category2 → category1/category2；PeriodID → periodId；QTY → qty。
 * 数据包 v2 的 sales 数组即为本结构；applyDataPack 时经 salesIngest 归一解析。
 */
export interface SalesSourceRow {
  /** 国家（国家码 / 中文国名 / 英文国名均可，归一层映射；解不出 = 计入 unmatched） */
  country: string;
  /** 型号名（与 offer 看板 model 同一口径；可用 salesProductAliases 挂别名） */
  product: string;
  /** 维度1：手机/平板=存储；穿戴=表盘；音频=空 */
  category1?: string | null;
  /** 维度2：平板=屏幕；其余为空 */
  category2?: string | null;
  /** 周期间：YYYY0WW（如 2026043）；兼容 YYYYWW；非法 = 计入 skipped */
  periodId: string;
  /** 销量（台）；非正数 = 计入 skipped */
  qty: number;
  /** 销量来源类型（PSI Type 原文）：真实 PSI 的口径名（如 Sell-out），或 simulated / 模拟。
   *  归一层据此判定「真实 / 模拟 / 混合」并在页面显性标注——模拟数据不得标成真实。 */
  psiType?: string | null;
  /** 已解析标记（2026-11-27 四表结构）：服务器把 PSI 原始行经 map_psi_sku × 匹配表算成
   *  fact_sales 后直接发已解析的行——带 modelId 即直接采用（category1~3 已是匹配表目标行的值），
   *  不再按型号名重新解析。旧静态包 / 历史形态的原始行没有这个字段，走按型号名解析的兼容路径。 */
  modelId?: string | null;
  /** 维度3：平板 = 柔光（`Normal` / `PaperMatte`）；仅已解析的行携带。 */
  category3?: string | null;
}

/** 已解析销量事实（应用内消费形态）：周 × 国家 × 型号 × 维度1 × 维度2（× 维度3），
 *  同键多行已求和；cat1/cat2 空串 = 该维度不存在（音频产品级）。 */
export interface FactSalesWeekly {
  week_id: string; // YYYYWW（periodId 归一后）
  country_code: string;
  model_id: string; // 内部型号 id（own-/cmp- 前缀），由 product 解析
  cat1: string;
  cat2: string;
  qty: number;
  psiType?: string; // 来源类型；同键并入来源不同的行时为 'mixed'
  /** 维度3（平板柔光 Normal / PaperMatte）：服务器已解析的行携带；缺省 = 未知，
   *  取数时按通配处理（兼容历史包与不带柔光的模拟数据） */
  cat3?: string;
}

// ---------------- 上一代配置（2026-11-27 Eason 拍板：上一代要到 cat（配置）层级） ----------------

/** 上一代配置目标：[上一代型号 id, 上一代配置组]。配置组 = 该型号 dims.product[].romram
 *  的取值（空配置归一成 '—'）；上一代可以是竞品型号（"竞品也登记"）。 */
export type PrevGenTarget = [modelId: string, romram: string];

/** 数据包 v2 顶层段 prevGen 的一行：当前「型号 × 配置组」→ 上一代配置组列表。
 *  权威来源 = 服务器端配置表 config_tables.xlsx「上一代配置」页签，由 server/prev_gen.py
 *  解析后进包；一个当前组可对多个上一代，同一上一代可被多个当前组指向。
 *  老数据包 / 内置静态数据包 / 页签缺省时整段缺失，消费方按「无上一代关系」处理。 */
export interface PrevGenGroup {
  /** 当前型号 id，如 own-huawei-mate-x7 */
  m: string;
  /** 当前配置组，如 12+512 GB；无配置维度的型号为 '—' */
  r: string;
  /** 上一代配置组列表（已去重） */
  p: PrevGenTarget[];
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
  xLabel: string; // 周=周三 MM-DD / 月=YYYYMM / 季=YYYYQ1
  anchorDate: string; // ISO 日期
  rrp: number | null; // 显示币种、已取整；官网建议零售价
  price: number | null; // 折后价（显示币种、已取整）；missing 为 null
  missing: boolean;
  offer: OfferInfo | null;
  url: string;
  shopName: string | null; // 取价店铺（渠道显示名 · 店铺名）
  /** ZA 运营商小册子月度明细字段（2026-11-11 Eason 明细改造）：逐月各口径最低价
   *  与促销原文——明细表 ZA 分支的行数据源 */
  finance?: {
    selling: number | null;
    i24: number | null; t24: number | null;
    i36: number | null; t36: number | null;
    i48: number | null; t48: number | null;
    promo: string | null;
  } | null;
  /** 取数渠道（平台-店铺显示名，如 OZON 3P；自动口径每周随最低价来源变化） */
  channelName?: string | null;
  platform?: string | null; // 取价平台（dim_channel.platform，随最低价行带出；明细表平台列）
  /**
   * 异常价格守卫（2026-11-01 数据质量口径，buildSeries 取数层打标）：
   * quarantined = 已隔离（瞬态超阈 / 人工标记异常）——原值保留但不参与派生计算；
   * pending = 待核对（持续位移）/ 待确认（序列末端），计算照常；
   * exempted = 人工确认真实价格。缺省 = 可信。
   */
  suspect?: 'quarantined' | 'pending' | 'exempted';
  /** pending 细分：transient 瞬态 / shift 持续位移 / tail 末端候选 / manual 人工 */
  suspectReason?: 'transient' | 'shift' | 'tail' | 'manual';
  /** 打标时相对上一原始有值点的环比（胶囊「疑 −61%」用；无 prev 为空） */
  suspectWow?: number | null;
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
  /** 本系列的取价口径（第一百六十轮，随组解析后回显——图例渠道 chip/钻取同口径用） */
  platform?: PlatformQuery | null;
  /** 本系列实际取价渠道（auto = 该产品日常价最低渠道）；null = 该产品无任何渠道数据。
   *  platforms = 渠道归属平台集（大促档期带按各线渠道平台并集过滤） */
  channelBadge?: { label: string; auto: boolean; platforms: string[] } | null;
  /** ZA 运营商小册子口径的付费方式标注（先付 / 月供 · 36期）；明细表产品格第二行 + 复制列 */
  financeLabel?: string | null;
  /** 药丸短标注（2026-11-11 Eason：线侧名称药丸标分期）：'先付' / '36期'，随 financeLabel 同源生成 */
  financeTag?: string | null;
  /** 线型（2026-11-27 品牌全景）：同品牌多条线共享品牌色，以虚线节律区分；缺省 = 实线。
   *  纯呈现字段，由呈现层按品牌内序赋值，取数层（buildSeries）不产出。缺采跨接段
   *  仍固定为 [4, 4] 短虚线桥，与本字段无关。 */
  lineDash?: number[];
}

export interface DataScope {
  countryCode: string;
  industry: Industry;
}

/** 组级取价口径（第一百六十轮）：null/缺省 = 自动（该产品日常价最低的渠道）；
 *  显式 = 用户勾选的平台/渠道。每条产品线独立，主品渠道不再牵连对比品 */
export interface SkuGroupQuery {
  modelId: string;
  romram: string;
  skuIds: string[];
  isOwn: boolean;
  platform?: PlatformQuery | null;
}

/** 平台选择：platforms = 勾整平台（其下全部渠道）；shopIds = 勾到渠道（channel_id）；
 *  seller = 渠道内具体卖家店铺（第一百四十一轮）：仅在 shopIds 单渠道时有意义，
 *  缺省/null = 该渠道全部卖家取最低在架价（默认口径）；types = 平台勾选的店铺
 *  类型子集（2026-11-17 Eason「平台、类型、店铺」筛选器）：仅过滤平台级命中
 *  （shopIds 命中直通），缺省/空 = 全部类型 */
export interface PlatformQuery {
  platforms: string[];
  shopIds: string[];
  seller?: string | null;
  types?: StoreType[];
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
  /** ZA monthly booklet facts require an explicit 24/36 term. */
  financingType?: FinancingType | null;
  financingTerms?: FinancingTerm[];
  // 平台口径自第一百六十轮起下沉到每组（SkuGroupQuery.platform）——看板全局
  // 平台筛选退役（总览/预警仍用全局口径）
}
