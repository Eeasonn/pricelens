// ============================================================
// 配置快照导入/导出（2026-11-06 稳定版：配置页文件备份/迁移）。
// 设计正典：docs/design/2026-11-06-access-roles.md（能力矩阵）。
// - 范围仅配置域 LPL3.config.*（键名见 lplKeys.ts）：benchmark / defaultShop /
//   anomalyRule / anomalyMarks 必含；fx（汇率，只读展示的历史键）随快照备份、
//   导入时若含则原样写回，UI 不提供编辑入口。
// - prevGen（上一代关系）已退出快照（2026-11-27）：权威来源迁到服务器端配置表
//   config_tables.xlsx「上一代配置」页签、随数据包下发；老快照里的 prevGen 键
//   导入时忽略（见 validateImportPayload 的 known 清单）。
// - 明确不进快照：filters（LPL3.filters）、uiMainCombos（LPL3.ui.mainCombos）
//   与 forecast 工作区键（referenceEventTypes / referenceWorkspace /
//   intelligenceReview）——稳定导出不含迭代 forecast 配置。
// - 语义：导出 = 当前浏览器各键**原始持久化值**（无人工配置的键导 null）；
//   导入 = 全量校验通过后一次性写回（null = 移除该键、恢复系统默认），
//   校验失败绝不半写入。写入后派发 CONFIG_CHANGED_EVENT（defaultShopStore
//   等读缓存随之失效，全部页面即时生效）。
// - 权限：导出 GTM/查阅者皆可（只读备份）；导入仅 GTM——applyImportPayload
//   校验 canEditConfig()，与 UI 门控构成纵深防御。
// ============================================================
import { canEditConfig } from '../access/role';
import { ANOMALY_CUSTOM_MAX, ANOMALY_CUSTOM_MIN, type AnomalyMark } from '../dataModel/anomaly';
import type { DimBenchmark, DimPromo } from '../dataModel/types';
import type { FinancingTerm } from '../dataModel/marketProfile';
import type { SeriesRule } from '../dataModel/offerSeries';
import type { OfferAliasRow } from '../dataModel/offerIngest';
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';

export const CONFIG_SNAPSHOT_SCHEMA_VERSION = 1;

/** 配置快照里的「来源通道」字段（schemaVersion 1 的格式字段，不能删——否则老配置文件
 *  导入会被拒）。2026-11-27 演进版退场后只对稳定版持续迭代：导出恒为 'stable'；
 *  导入校验仍接受 'iterate'，保证退场前导出的老配置文件可继续导入。 */
type AppChannel = 'stable' | 'iterate';

export interface MarketDataRuleConfig {
  countryCode: string;
  sourceKind: 'ecommerce-weekly' | 'operator-booklet-monthly';
  granularity: 'week' | 'month' | 'quarter';
  fixedPlatform: string | null;
  financingTerms: FinancingTerm[];
  includePrepaid: boolean;
  includeNoPrice: boolean;
  enabled: boolean;
  note: string | null;
}

/** 快照 keys 的四个必含配置键 + 可选 fx；null = 无人工配置（导入时恢复默认） */
export interface ConfigSnapshotKeys {
  benchmark: DimBenchmark[] | null;
  defaultShop: Record<string, string> | null;
  anomalyRule: { enabled: boolean; thresholdPct: number } | null;
  anomalyMarks: AnomalyMark[] | null;
  marketRules?: MarketDataRuleConfig[] | null;
  /** 汇率只读展示的历史键（LPL3.config.fx）：单值（旧口径）或 币种 → 汇率 表 */
  fx: Record<string, number> | number | null;
  // —— 2026-11-18 配置表化五键：原表没有、后加的派生规则（null = 页签缺省 = 恢复系统默认） ——
  /** 系列归组规则（品牌 × 型号规则 → 系列名；规则=前缀，re: 开头=正则；空 = 内置默认） */
  seriesRules?: SeriesRule[] | null;
  /** 型号别名（品牌 × 原始型号 → 目标型号；价格侧与 PSI 销量侧共用；空 = 仅内置） */
  modelAliases?: OfferAliasRow[] | null;
  /** 对标矩阵层（有行 = 整体替换默认矩阵层；人工层不受影响） */
  benchmarkMatrix?: DimBenchmark[] | null;
  /** 产业价格分档阶梯（产业 → USD 价格点数组；空 = 内置 TIER_LADDERS） */
  tierLadders?: Record<string, number[]> | null;
  /** 大促档期（空 = 无大促带） */
  promoRows?: DimPromo[] | null;
  // —— C3 解析字典四键（2026-11-18 显性化）：解析器出厂词汇（空 = 出厂默认，
  //  与业务规则「空 = 无规则」语义不同）；有行 = 全量替换 ——
  countryAliases?: Record<string, string> | null;
  platformAliases?: Record<string, string> | null;
  storeAliases?: Record<string, string> | null;
  industryOfCat?: Record<string, string> | null;
}

/** 单一 JSON 快照（推荐扩展名 .pricelens-config.json） */
export interface ConfigSnapshotV1 {
  schemaVersion: typeof CONFIG_SNAPSHOT_SCHEMA_VERSION;
  exportedAt: string; // ISO8601
  appChannel: AppChannel;
  keys: ConfigSnapshotKeys;
}

export interface ImportValidationResult {
  ok: boolean;
  payload?: ConfigSnapshotV1;
  /** 友好中文错误（坏 JSON / schema 不符 / 类型结构错），供 message.error 直接展示 */
  error?: string;
}

/** 导入预览摘要（确认对话框展示：各国竞品条数、覆盖数、规则口径等） */
export interface ImportPreviewSummary {
  exportedAt: string;
  appChannel: AppChannel;
  benchmarkTotal: number;
  benchmarkByCountry: { countryCode: string; count: number }[];
  defaultShopCount: number;
  defaultShopProductCount: number;
  anomalyRule: { enabled: boolean; thresholdPct: number } | null;
  anomalyMarkCount: number;
  fxIncluded: boolean;
  marketRuleCount: number;
  seriesRuleCount: number;
  modelAliasCount: number;
  benchmarkMatrixCount: number;
  tierLadderCount: number;
  promoRowCount: number;
  countryAliasCount: number;
  platformAliasCount: number;
  storeAliasCount: number;
  industryOfCatCount: number;
}

export interface ImportApplyResult {
  applied: boolean;
  /** 未生效原因（角色或校验失败），供 UI 提示 */
  reason?: string;
  summary?: ImportPreviewSummary;
}

// ---------------- localStorage 基础读写（不经过各 store 的写 API：
// 那些带 viewer no-op 门控，而导入自身已按角色整体放行） ----------------

function readRaw(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用（隐私模式/满）：静默降级，调用方状态兜底 */
  }
}

// ---------------- 导出 ----------------

/** 当前浏览器配置快照：各键取原始持久化值（无人工配置 = null） */
export function exportConfigSnapshot(): ConfigSnapshotV1 {
  return {
    schemaVersion: CONFIG_SNAPSHOT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appChannel: 'stable',
    keys: {
      benchmark: (readRaw(LPL.cfgBenchmark) as DimBenchmark[] | null) ?? null,
      defaultShop: (readRaw(LPL.cfgDefaultShop) as Record<string, string> | null) ?? null,
      anomalyRule: (readRaw(LPL.cfgAnomalyRule) as ConfigSnapshotKeys['anomalyRule']) ?? null,
      anomalyMarks: (readRaw(LPL.cfgAnomalyMarks) as AnomalyMark[] | null) ?? null,
      marketRules: (readRaw(LPL.cfgMarketRules) as MarketDataRuleConfig[] | null) ?? null,
      fx: (readRaw(LPL.cfgFx) as ConfigSnapshotKeys['fx']) ?? null,
      seriesRules: (readRaw(LPL.cfgSeriesRules) as SeriesRule[] | null) ?? null,
      modelAliases: (readRaw(LPL.cfgModelAliases) as OfferAliasRow[] | null) ?? null,
      benchmarkMatrix: (readRaw(LPL.cfgBenchmarkMatrix) as DimBenchmark[] | null) ?? null,
      tierLadders: (readRaw(LPL.cfgTierLadders) as Record<string, number[]> | null) ?? null,
      promoRows: (readRaw(LPL.cfgPromoRows) as DimPromo[] | null) ?? null,
      countryAliases: (readRaw(LPL.cfgCountryAliases) as Record<string, string> | null) ?? null,
      platformAliases: (readRaw(LPL.cfgPlatformAliases) as Record<string, string> | null) ?? null,
      storeAliases: (readRaw(LPL.cfgStoreAliases) as Record<string, string> | null) ?? null,
      industryOfCat: (readRaw(LPL.cfgIndustryOfCat) as Record<string, string> | null) ?? null,
    },
  };
}

// ---------------- 校验（严格类型守卫；apply 前全量校验，绝不半写入） ----------------

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v);

function invalid(error: string): ImportValidationResult {
  return { ok: false, error };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function validateBenchmark(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.benchmark = null;
    return null;
  }
  if (!Array.isArray(raw)) return 'benchmark（竞品对标）必须是数组';
  for (const [i, r] of raw.entries()) {
    if (!isPlainObject(r)) return `benchmark（竞品对标）第 ${i + 1} 行不是对象`;
    if (!isNonEmptyString(r.competitor_sku_id) || !isNonEmptyString(r.own_model_id)) {
      return `benchmark（竞品对标）第 ${i + 1} 行缺少竞品/我司型号 id`;
    }
    if (typeof r.country_code !== 'string') return `benchmark（竞品对标）第 ${i + 1} 行国家码类型不对`;
    if (r.own_romram != null && typeof r.own_romram !== 'string') {
      return `benchmark（竞品对标）第 ${i + 1} 行配置（ROMRAM）类型不对`;
    }
    if (typeof r.sort !== 'number' || !Number.isFinite(r.sort)) {
      return `benchmark（竞品对标）第 ${i + 1} 行次序（sort）不是数字`;
    }
    if (r.source !== 'matrix' && r.source !== 'auto' && r.source !== 'substitute' && r.source !== 'manual') {
      return `benchmark（竞品对标）第 ${i + 1} 行来源（source）不合法`;
    }
    if (r.note != null && typeof r.note !== 'string') return `benchmark（竞品对标）第 ${i + 1} 行备注类型不对`;
  }
  out.benchmark = raw as DimBenchmark[];
  return null;
}

function validateDefaultShop(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.defaultShop = null;
    return null;
  }
  if (!isPlainObject(raw)) return 'defaultShop（默认店铺）必须是对象';
  for (const [k, v] of Object.entries(raw)) {
    if (!k) return 'defaultShop（默认店铺）存在空国家码';
    if (!isNonEmptyString(v)) return `defaultShop（默认店铺）${k} 的值必须是渠道 id`;
  }
  out.defaultShop = raw as Record<string, string>;
  return null;
}

function validateAnomalyRule(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.anomalyRule = null;
    return null;
  }
  if (!isPlainObject(raw)) return 'anomalyRule（异常规则）必须是对象';
  if (typeof raw.enabled !== 'boolean') return 'anomalyRule（异常规则）enabled 必须是布尔值';
  const pct = raw.thresholdPct;
  if (typeof pct !== 'number' || !Number.isInteger(pct) || pct < ANOMALY_CUSTOM_MIN || pct > ANOMALY_CUSTOM_MAX) {
    return `anomalyRule（异常规则）阈值必须是 ${ANOMALY_CUSTOM_MIN}–${ANOMALY_CUSTOM_MAX} 的整数`;
  }
  out.anomalyRule = { enabled: raw.enabled, thresholdPct: pct };
  return null;
}

function validateAnomalyMarks(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.anomalyMarks = null;
    return null;
  }
  if (!Array.isArray(raw)) return 'anomalyMarks（人工裁定清单）必须是数组';
  for (const [i, m] of raw.entries()) {
    if (!isPlainObject(m)) return `anomalyMarks（人工裁定）第 ${i + 1} 条不是对象`;
    if (!isNonEmptyString(m.countryCode) || !isNonEmptyString(m.seriesKey) || !isNonEmptyString(m.bucketId)) {
      return `anomalyMarks（人工裁定）第 ${i + 1} 条缺少国家/系列/时间桶`;
    }
    if (m.action !== 'exempt' && m.action !== 'isolate') {
      return `anomalyMarks（人工裁定）第 ${i + 1} 条动作（action）不合法`;
    }
    if (typeof m.ts !== 'number' || !Number.isFinite(m.ts)) {
      return `anomalyMarks（人工裁定）第 ${i + 1} 条时间戳类型不对`;
    }
    if (m.label != null && typeof m.label !== 'string') {
      return `anomalyMarks（人工裁定）第 ${i + 1} 条产品名类型不对`;
    }
    if (m.granularity != null && m.granularity !== 'week' && m.granularity !== 'month' && m.granularity !== 'quarter') {
      return `anomalyMarks（人工裁定）第 ${i + 1} 条粒度不合法`;
    }
    if (m.price != null && typeof m.price !== 'number') {
      return `anomalyMarks（人工裁定）第 ${i + 1} 条原值类型不对`;
    }
    if (m.wow != null && typeof m.wow !== 'number') {
      return `anomalyMarks（人工裁定）第 ${i + 1} 条环比类型不对`;
    }
  }
  out.anomalyMarks = raw as AnomalyMark[];
  return null;
}

function validateFx(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.fx = null;
    return null;
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return 'fx（汇率）数值必须为正数';
    out.fx = raw;
    return null;
  }
  if (!isPlainObject(raw)) return 'fx（汇率）必须是 币种 → 汇率 对象或数值';
  for (const [k, v] of Object.entries(raw)) {
    if (!k) return 'fx（汇率）存在空币种';
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return `fx（汇率）${k} 的值必须为正数`;
  }
  out.fx = raw as Record<string, number>;
  return null;
}

function validateMarketRules(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.marketRules = null;
    return null;
  }
  if (!Array.isArray(raw)) return 'marketRules（市场采集规则）必须是数组';
  const seen = new Set<string>();
  const rules: MarketDataRuleConfig[] = [];
  for (const [index, value] of raw.entries()) {
    if (!isPlainObject(value)) return `marketRules 第 ${index + 1} 行不是对象`;
    const countryCode = value.countryCode;
    const sourceKind = value.sourceKind;
    const granularity = value.granularity;
    if (!isNonEmptyString(countryCode)) return `marketRules 第 ${index + 1} 行缺少 countryCode`;
    if (sourceKind !== 'ecommerce-weekly' && sourceKind !== 'operator-booklet-monthly') return `marketRules 第 ${index + 1} 行 sourceKind 不合法`;
    if (granularity !== 'week' && granularity !== 'month' && granularity !== 'quarter') return `marketRules 第 ${index + 1} 行 granularity 不合法`;
    if (seen.has(countryCode)) return `marketRules 存在重复国家 ${countryCode}`;
    seen.add(countryCode);
    const terms = value.financingTerms;
    if (!Array.isArray(terms) || terms.some((term) => term !== 24 && term !== 36) || new Set(terms).size !== terms.length) {
      return `marketRules 第 ${index + 1} 行 financingTerms 必须是 24/36 的不重复数组`;
    }
    if (typeof value.includePrepaid !== 'boolean' || typeof value.includeNoPrice !== 'boolean' || typeof value.enabled !== 'boolean') {
      return `marketRules 第 ${index + 1} 行 includePrepaid/includeNoPrice/enabled 必须是布尔值`;
    }
    if (value.fixedPlatform != null && typeof value.fixedPlatform !== 'string') return `marketRules 第 ${index + 1} 行 fixedPlatform 类型不对`;
    if (value.note != null && typeof value.note !== 'string') return `marketRules 第 ${index + 1} 行 note 类型不对`;
    rules.push({
      countryCode,
      sourceKind,
      granularity,
      fixedPlatform: value.fixedPlatform == null || value.fixedPlatform === '' ? null : value.fixedPlatform,
      financingTerms: [...terms] as FinancingTerm[],
      includePrepaid: value.includePrepaid,
      includeNoPrice: value.includeNoPrice,
      enabled: value.enabled,
      note: value.note == null || value.note === '' ? null : value.note,
    });
  }
  out.marketRules = rules;
  return null;
}

function validateSeriesRules(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.seriesRules = null;
    return null;
  }
  if (!Array.isArray(raw)) return 'seriesRules（系列规则）必须是数组';
  for (const [i, r] of raw.entries()) {
    if (!isPlainObject(r)) return `seriesRules（系列规则）第 ${i + 1} 行不是对象`;
    if (!isNonEmptyString(r.brand) || !isNonEmptyString(r.pattern) || !isNonEmptyString(r.series)) {
      return `seriesRules（系列规则）第 ${i + 1} 行缺少品牌/规则/系列名`;
    }
    if (r.pattern.toLowerCase().startsWith('re:')) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(r.pattern.slice(3));
      } catch {
        return `seriesRules（系列规则）第 ${i + 1} 行正则无效：${r.pattern}`;
      }
      // 系列名用了 {n}/{w} 模板但正则没有第 1 捕获组 → 渲染出空串/尾随空格的脏系列名
      if (/\{[nw]\}/.test(r.series)) {
        const groups = new RegExp(`${r.pattern.slice(3)}|`).exec('')?.length ?? 1;
        if (groups - 1 < 1) {
          return `seriesRules（系列规则）第 ${i + 1} 行系列名用了 {n}/{w} 模板，但正则没有捕获组：${r.pattern}（用 (…) 捕获要填进 {n} 的部分）`;
        }
      }
    } else if (/\{[nw]\}/.test(r.series)) {
      return `seriesRules（系列规则）第 ${i + 1} 行系列名用了 {n}/{w} 模板，但前缀规则没有捕获组（模板只支持 re: 正则规则）`;
    }
  }
  out.seriesRules = raw as SeriesRule[];
  return null;
}

function validateModelAliases(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.modelAliases = null;
    return null;
  }
  if (!Array.isArray(raw)) return 'modelAliases（型号别名）必须是数组';
  for (const [i, r] of raw.entries()) {
    if (!isPlainObject(r)) return `modelAliases（型号别名）第 ${i + 1} 行不是对象`;
    if (!isNonEmptyString(r.brand) || !isNonEmptyString(r.from) || !isNonEmptyString(r.to)) {
      return `modelAliases（型号别名）第 ${i + 1} 行缺少品牌/原始型号/目标型号`;
    }
  }
  out.modelAliases = raw as OfferAliasRow[];
  return null;
}

function validateBenchmarkMatrix(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.benchmarkMatrix = null;
    return null;
  }
  if (!Array.isArray(raw)) return 'benchmarkMatrix（对标矩阵）必须是数组';
  for (const [i, r] of raw.entries()) {
    if (!isPlainObject(r)) return `benchmarkMatrix（对标矩阵）第 ${i + 1} 行不是对象`;
    if (!isNonEmptyString(r.own_model_id) || !isNonEmptyString(r.competitor_sku_id)) {
      return `benchmarkMatrix（对标矩阵）第 ${i + 1} 行缺少我司/竞品型号 id`;
    }
    if (r.country_code != null && typeof r.country_code !== 'string') return `benchmarkMatrix（对标矩阵）第 ${i + 1} 行国家码类型不对`;
    // 空串国家码永不等于任何真国家码 = 死行；通配请显式置 null（xlsx 解析端已把留空归 null）
    if (r.country_code === '') return `benchmarkMatrix（对标矩阵）第 ${i + 1} 行国家码留空（通配所有国家请将该字段置 null，不要填空白）`;
    if (r.own_romram != null && typeof r.own_romram !== 'string') return `benchmarkMatrix（对标矩阵）第 ${i + 1} 行配置类型不对`;
    if (typeof r.sort !== 'number' || !Number.isFinite(r.sort)) return `benchmarkMatrix（对标矩阵）第 ${i + 1} 行次序（sort）不是数字`;
  }
  out.benchmarkMatrix = raw as DimBenchmark[];
  return null;
}

function validateTierLadders(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.tierLadders = null;
    return null;
  }
  if (!isPlainObject(raw)) return 'tierLadders（分档阶梯）必须是 产业 → 价格点数组 对象';
  for (const [ind, value] of Object.entries(raw)) {
    if (!ind) return 'tierLadders（分档阶梯）存在空产业';
    if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
      return `tierLadders（分档阶梯）${ind} 必须是正数价格点数组`;
    }
    // 档位码解析（tierRank/tierBandsOf）全部按整数正则 ^(\d+) 展开，小数价格点会让
    // 档位比较失分辨力、总览档位带塌成同带——限正整数
    if ((value as number[]).some((v) => !Number.isInteger(v))) {
      return `tierLadders（分档阶梯）${ind} 价格点必须是正整数（小数档位码不支持）`;
    }
    const sorted = [...(value as number[])].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1]) return `tierLadders（分档阶梯）${ind} 存在重复价格点`;
    }
  }
  out.tierLadders = raw as Record<string, number[]>;
  return null;
}

function validatePromoRows(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.promoRows = null;
    return null;
  }
  if (!Array.isArray(raw)) return 'promoRows（大促档期）必须是数组';
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const [i, r] of raw.entries()) {
    if (!isPlainObject(r)) return `promoRows（大促档期）第 ${i + 1} 行不是对象`;
    if (!isNonEmptyString(r.country_code) || !isNonEmptyString(r.promo_name)) {
      return `promoRows（大促档期）第 ${i + 1} 行缺少国家码/促销名`;
    }
    if (!isNonEmptyString(r.start_date) || !dateRe.test(r.start_date) || !isNonEmptyString(r.end_date) || !dateRe.test(r.end_date)) {
      return `promoRows（大促档期）第 ${i + 1} 行开始/结束日期必须是 YYYY-MM-DD`;
    }
    if (r.end_date < r.start_date) return `promoRows（大促档期）第 ${i + 1} 行结束日期早于开始日期`;
    if (r.depth_hint != null && r.depth_hint !== '浅' && r.depth_hint !== '中' && r.depth_hint !== '深') {
      return `promoRows（大促档期）第 ${i + 1} 行深浅只允许 浅/中/深`;
    }
    if (r.platforms != null && !Array.isArray(r.platforms)) return `promoRows（大促档期）第 ${i + 1} 行平台必须是字符串数组`;
  }
  out.promoRows = raw as DimPromo[];
  return null;
}

// —— C3 解析字典四键（2026-11-18 显性化）：Record<别名, 值> 形态；值域校验 ——

function validateAliasMap(
  raw: unknown,
  out: ConfigSnapshotKeys,
  key: 'countryAliases' | 'platformAliases' | 'storeAliases' | 'industryOfCat',
  label: string,
  valueCheck?: (value: string) => boolean,
  valueError?: string,
): string | null {
  if (raw == null) {
    out[key] = null;
    return null;
  }
  if (!isPlainObject(raw)) return `${key}（${label}）必须是「别名 → 值」对象`;
  for (const [alias, value] of Object.entries(raw)) {
    if (!alias || typeof value !== 'string' || !value) {
      return `${key}（${label}）别名「${alias}」的值缺失或不是字符串`;
    }
    if (valueCheck && !valueCheck(value)) {
      return `${key}（${label}）别名「${alias}」的值「${value}」不合法${valueError ? `（${valueError}）` : ''}`;
    }
  }
  out[key] = raw as Record<string, string>;
  return null;
}

const CC_RE = /^[A-Z]{2}$/;
const INDUSTRY_RE = /^(phone|tablet|wearable|audio|iot|pc)$/;

function validateCountryAliases(raw: unknown, out: ConfigSnapshotKeys): string | null {
  return validateAliasMap(raw, out, 'countryAliases', '国家别名', (v) => CC_RE.test(v), '需要两位大写国家码，如 SA / RU');
}

function validatePlatformAliases(raw: unknown, out: ConfigSnapshotKeys): string | null {
  return validateAliasMap(raw, out, 'platformAliases', '平台别名');
}

function validateStoreAliases(raw: unknown, out: ConfigSnapshotKeys): string | null {
  return validateAliasMap(raw, out, 'storeAliases', '店铺类型别名', (v) => v === '1P' || v === '3P' || v === '独立站', '只允许 1P / 3P / 独立站');
}

function validateIndustryOfCat(raw: unknown, out: ConfigSnapshotKeys): string | null {
  return validateAliasMap(raw, out, 'industryOfCat', '品类映射', (v) => INDUSTRY_RE.test(v), '只允许 phone/tablet/wearable/audio/iot/pc');
}

/** 全量校验导入内容：通过返回规整后的快照；失败返回友好错误（不写任何键） */
export function validateImportPayload(raw: unknown): ImportValidationResult {
  if (!isPlainObject(raw)) return invalid('文件内容不是 JSON 对象');
  if (raw.schemaVersion !== CONFIG_SNAPSHOT_SCHEMA_VERSION) {
    return invalid(`schemaVersion 不支持（期望 ${CONFIG_SNAPSHOT_SCHEMA_VERSION}，实际 ${String(raw.schemaVersion)}）`);
  }
  if (typeof raw.exportedAt !== 'string' || !raw.exportedAt) return invalid('exportedAt（导出时间）缺失或类型不对');
  if (raw.appChannel !== 'stable' && raw.appChannel !== 'iterate') return invalid('appChannel（版本通道）不合法');
  if (!isPlainObject(raw.keys)) return invalid('keys（配置内容）缺失或不是对象');

  const keys = raw.keys;
  // prevGen（上一代关系，2026-11-27 退役）：权威来源已迁到服务器端配置表 config_tables.xlsx
  // 「上一代配置」页签并随数据包下发。它仍留在 known 清单里，只是为了不让退场前导出的
  // 老配置文件被「未知配置项」整份拒绝——导入时直接忽略（不校验、不落盘）。
  const known = ['benchmark', 'prevGen', 'defaultShop', 'anomalyRule', 'anomalyMarks', 'marketRules', 'fx',
    'seriesRules', 'modelAliases', 'benchmarkMatrix', 'tierLadders', 'promoRows',
    'countryAliases', 'platformAliases', 'storeAliases', 'industryOfCat'];
  for (const k of Object.keys(keys)) {
    if (!known.includes(k)) return invalid(`keys 含未知配置项 ${k}（本版本不支持，已拒绝整份导入）`);
  }

  const out: ConfigSnapshotKeys = {
    benchmark: null, defaultShop: null, anomalyRule: null, anomalyMarks: null, marketRules: null, fx: null,
    seriesRules: null, modelAliases: null, benchmarkMatrix: null, tierLadders: null, promoRows: null,
    countryAliases: null, platformAliases: null, storeAliases: null, industryOfCat: null,
  };
  for (const required of ['benchmark', 'defaultShop', 'anomalyRule', 'anomalyMarks'] as const) {
    if (!Object.prototype.hasOwnProperty.call(keys, required)) {
      return invalid(`keys 缺少配置项 ${required}（本版本导出必含，缺项文件已拒绝）`);
    }
  }
  const step = (err: string | null): ImportValidationResult | null => (err ? invalid(err) : null);
  const checks: Array<() => string | null> = [
    () => validateBenchmark(keys.benchmark, out),
    () => validateDefaultShop(keys.defaultShop, out),
    () => validateAnomalyRule(keys.anomalyRule, out),
    () => validateAnomalyMarks(keys.anomalyMarks, out),
    () => validateMarketRules(keys.marketRules, out),
    () => validateFx(keys.fx, out),
    () => validateSeriesRules(keys.seriesRules, out),
    () => validateModelAliases(keys.modelAliases, out),
    () => validateBenchmarkMatrix(keys.benchmarkMatrix, out),
    () => validateTierLadders(keys.tierLadders, out),
    () => validatePromoRows(keys.promoRows, out),
    () => validateCountryAliases(keys.countryAliases, out),
    () => validatePlatformAliases(keys.platformAliases, out),
    () => validateStoreAliases(keys.storeAliases, out),
    () => validateIndustryOfCat(keys.industryOfCat, out),
  ];
  for (const check of checks) {
    const failure = step(check());
    if (failure) return failure;
  }
  return {
    ok: true,
    payload: {
      schemaVersion: CONFIG_SNAPSHOT_SCHEMA_VERSION,
      exportedAt: raw.exportedAt,
      appChannel: raw.appChannel,
      keys: out,
    },
  };
}

/** 读文件文本 → JSON.parse → 全量校验（UI 选文件后的第一步） */
export function parseConfigSnapshotText(text: string): ImportValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid('不是合法的 JSON 文件');
  }
  return validateImportPayload(parsed);
}

// ---------------- 预览摘要 ----------------

/** 导入确认对话框的变更摘要（只读计算，不写盘） */
export function summarizeImportPayload(payload: ConfigSnapshotV1): ImportPreviewSummary {
  const byCountry = new Map<string, number>();
  for (const r of payload.keys.benchmark ?? []) {
    const cc = r.country_code ?? '—';
    byCountry.set(cc, (byCountry.get(cc) ?? 0) + 1);
  }
  const defaultShopKeys = payload.keys.defaultShop ? Object.keys(payload.keys.defaultShop) : [];
  return {
    exportedAt: payload.exportedAt,
    appChannel: payload.appChannel,
    benchmarkTotal: payload.keys.benchmark?.length ?? 0,
    benchmarkByCountry: [...byCountry.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([countryCode, count]) => ({ countryCode, count })),
    defaultShopCount: defaultShopKeys.filter((key) => !key.includes('::')).length,
    defaultShopProductCount: defaultShopKeys.filter((key) => key.includes('::')).length,
    anomalyRule: payload.keys.anomalyRule ? { ...payload.keys.anomalyRule } : null,
    anomalyMarkCount: payload.keys.anomalyMarks?.length ?? 0,
    fxIncluded: payload.keys.fx != null,
    marketRuleCount: payload.keys.marketRules?.length ?? 0,
    seriesRuleCount: payload.keys.seriesRules?.length ?? 0,
    modelAliasCount: payload.keys.modelAliases?.length ?? 0,
    benchmarkMatrixCount: payload.keys.benchmarkMatrix?.length ?? 0,
    tierLadderCount: payload.keys.tierLadders ? Object.keys(payload.keys.tierLadders).length : 0,
    promoRowCount: payload.keys.promoRows?.length ?? 0,
    countryAliasCount: payload.keys.countryAliases ? Object.keys(payload.keys.countryAliases).length : 0,
    platformAliasCount: payload.keys.platformAliases ? Object.keys(payload.keys.platformAliases).length : 0,
    storeAliasCount: payload.keys.storeAliases ? Object.keys(payload.keys.storeAliases).length : 0,
    industryOfCatCount: payload.keys.industryOfCat ? Object.keys(payload.keys.industryOfCat).length : 0,
  };
}

// ---------------- 应用（仅 GTM；先全量校验后一次性写回） ----------------

export function applyImportPayload(raw: ConfigSnapshotV1): ImportApplyResult {
  if (!canEditConfig()) {
    return { applied: false, reason: '当前为查阅者角色，无导入权限；请联系 GTM' };
  }
  const checked = validateImportPayload(raw);
  if (!checked.ok || !checked.payload) {
    return { applied: false, reason: checked.error ?? '文件校验未通过' };
  }
  const { keys } = checked.payload;
  // 全部校验已通过——此处只做写回（null = 移除键恢复系统默认）
  writeRaw(LPL.cfgBenchmark, keys.benchmark);
  writeRaw(LPL.cfgDefaultShop, keys.defaultShop);
  writeRaw(LPL.cfgAnomalyRule, keys.anomalyRule);
  writeRaw(LPL.cfgAnomalyMarks, keys.anomalyMarks);
  writeRaw(LPL.cfgMarketRules, keys.marketRules);
  writeRaw(LPL.cfgFx, keys.fx);
  writeRaw(LPL.cfgSeriesRules, keys.seriesRules);
  writeRaw(LPL.cfgModelAliases, keys.modelAliases);
  writeRaw(LPL.cfgBenchmarkMatrix, keys.benchmarkMatrix);
  writeRaw(LPL.cfgTierLadders, keys.tierLadders);
  writeRaw(LPL.cfgPromoRows, keys.promoRows);
  writeRaw(LPL.cfgCountryAliases, keys.countryAliases);
  writeRaw(LPL.cfgPlatformAliases, keys.platformAliases);
  writeRaw(LPL.cfgStoreAliases, keys.storeAliases);
  writeRaw(LPL.cfgIndustryOfCat, keys.industryOfCat);
  // 服务模式（2026-11-18 前后端分离）：配置同时 POST 服务器（服务器存 config.json
  // 并自动重派生；失败不阻断本地生效——本地是读时消费点，服务器是派生权威）
  void syncConfigToServer(raw).catch(() => undefined);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT));
  }
  return { applied: true, summary: summarizeImportPayload(checked.payload) };
}

/** 配置同步到服务器（服务模式才发；WP-D）：把「已校验快照的 keys 派生配置段」
 *  转成服务器 config.json 形态。服务器收到后存盘并对已导入原包自动重派生。
 *  2026-11-18 审计加固：失败不再静默——快照落 LPL3.config.syncPending 待发
 *  队列，下次服务模式启动时 mirrorServerConfig 重发（离线/瞬断期间导入的
 *  配置不再被服务器旧配置在下次启动镜像时静默覆盖丢失）。 */
const SYNC_PENDING_KEY = 'LPL3.config.syncPending';

async function syncConfigToServer(raw: ConfigSnapshotV1): Promise<void> {
  const { isServiceMode } = await import('../data/serviceMode');
  if (!isServiceMode()) return;
  // null 显式化（JSON.stringify 保留 null）：服务器据此区分「清空该段」与
  //「未发」——merge 语义（2026-11-18 审计挂账：整体替换会抹掉运维手工追加的
  // config.json 自定义段）
  const serverConfig = {
    seriesRules: raw.keys.seriesRules ?? null,
    modelAliases: raw.keys.modelAliases ?? null,
    tierLadders: raw.keys.tierLadders ?? null,
    promoRows: raw.keys.promoRows ?? null,
    benchmarkMatrix: raw.keys.benchmarkMatrix ?? null,
    dictionaries: {
      countryCodes: raw.keys.countryAliases ?? null,
      platformAliases: raw.keys.platformAliases ?? null,
      storeAliases: raw.keys.storeAliases ?? null,
      industryOfCat: raw.keys.industryOfCat ?? null,
    },
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverConfig),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    try {
      localStorage.setItem(SYNC_PENDING_KEY, JSON.stringify(serverConfig));
    } catch {
      /* 存储不可用：只能放弃（下次导入会再同步） */
    }
  }
}
