// ============================================================
// 配置快照导入/导出（2026-11-06 稳定版：配置页文件备份/迁移）。
// 设计正典：docs/design/2026-11-06-access-roles.md（能力矩阵）。
// - 范围仅配置域 LPL3.config.*（键名见 lplKeys.ts）：benchmark / prevGen /
//   defaultShop / anomalyRule / anomalyMarks 必含；fx（汇率，只读展示的历史
//   键）随快照备份、导入时若含则原样写回，UI 不提供编辑入口。
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
import { APP_CHANNEL, type AppChannel } from '../appChannel';
import { canEditConfig } from '../access/role';
import { ANOMALY_CUSTOM_MAX, ANOMALY_CUSTOM_MIN, type AnomalyMark } from '../dataModel/anomaly';
import type { DimBenchmark } from '../dataModel/types';
import { CONFIG_CHANGED_EVENT, LPL } from './lplKeys';

export const CONFIG_SNAPSHOT_SCHEMA_VERSION = 1;

/** 快照 keys 的五个必含配置键 + 可选 fx；null = 无人工配置（导入时恢复默认） */
export interface ConfigSnapshotKeys {
  benchmark: DimBenchmark[] | null;
  prevGen: Record<string, string | null> | null;
  defaultShop: Record<string, string> | null;
  anomalyRule: { enabled: boolean; thresholdPct: number } | null;
  anomalyMarks: AnomalyMark[] | null;
  /** 汇率只读展示的历史键（LPL3.config.fx）：单值（旧口径）或 币种 → 汇率 表 */
  fx: Record<string, number> | number | null;
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
  prevGenCount: number;
  defaultShopCount: number;
  anomalyRule: { enabled: boolean; thresholdPct: number } | null;
  anomalyMarkCount: number;
  fxIncluded: boolean;
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
    appChannel: APP_CHANNEL,
    keys: {
      benchmark: (readRaw(LPL.cfgBenchmark) as DimBenchmark[] | null) ?? null,
      prevGen: (readRaw(LPL.cfgPrevGen) as Record<string, string | null> | null) ?? null,
      defaultShop: (readRaw(LPL.cfgDefaultShop) as Record<string, string> | null) ?? null,
      anomalyRule: (readRaw(LPL.cfgAnomalyRule) as ConfigSnapshotKeys['anomalyRule']) ?? null,
      anomalyMarks: (readRaw(LPL.cfgAnomalyMarks) as AnomalyMark[] | null) ?? null,
      fx: (readRaw(LPL.cfgFx) as ConfigSnapshotKeys['fx']) ?? null,
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

function validatePrevGen(raw: unknown, out: ConfigSnapshotKeys): string | null {
  if (raw == null) {
    out.prevGen = null;
    return null;
  }
  if (!isPlainObject(raw)) return 'prevGen（上一代关系）必须是对象';
  for (const [k, v] of Object.entries(raw)) {
    if (!k) return 'prevGen（上一代关系）存在空型号 id';
    if (v !== null && !isNonEmptyString(v)) return `prevGen（上一代关系）${k} 的值必须是型号 id 或 null`;
  }
  out.prevGen = raw as Record<string, string | null>;
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
  const known = ['benchmark', 'prevGen', 'defaultShop', 'anomalyRule', 'anomalyMarks', 'fx'];
  for (const k of Object.keys(keys)) {
    if (!known.includes(k)) return invalid(`keys 含未知配置项 ${k}（本版本不支持，已拒绝整份导入）`);
  }

  const out: ConfigSnapshotKeys = {
    benchmark: null, prevGen: null, defaultShop: null, anomalyRule: null, anomalyMarks: null, fx: null,
  };
  for (const required of ['benchmark', 'prevGen', 'defaultShop', 'anomalyRule', 'anomalyMarks'] as const) {
    if (!Object.prototype.hasOwnProperty.call(keys, required)) {
      return invalid(`keys 缺少配置项 ${required}（本版本导出必含，缺项文件已拒绝）`);
    }
  }
  const step = (err: string | null): ImportValidationResult | null => (err ? invalid(err) : null);
  const checks: Array<() => string | null> = [
    () => validateBenchmark(keys.benchmark, out),
    () => validatePrevGen(keys.prevGen, out),
    () => validateDefaultShop(keys.defaultShop, out),
    () => validateAnomalyRule(keys.anomalyRule, out),
    () => validateAnomalyMarks(keys.anomalyMarks, out),
    () => validateFx(keys.fx, out),
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
  return {
    exportedAt: payload.exportedAt,
    appChannel: payload.appChannel,
    benchmarkTotal: payload.keys.benchmark?.length ?? 0,
    benchmarkByCountry: [...byCountry.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([countryCode, count]) => ({ countryCode, count })),
    prevGenCount: payload.keys.prevGen ? Object.keys(payload.keys.prevGen).length : 0,
    defaultShopCount: payload.keys.defaultShop ? Object.keys(payload.keys.defaultShop).length : 0,
    anomalyRule: payload.keys.anomalyRule ? { ...payload.keys.anomalyRule } : null,
    anomalyMarkCount: payload.keys.anomalyMarks?.length ?? 0,
    fxIncluded: payload.keys.fx != null,
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
  writeRaw(LPL.cfgPrevGen, keys.prevGen);
  writeRaw(LPL.cfgDefaultShop, keys.defaultShop);
  writeRaw(LPL.cfgAnomalyRule, keys.anomalyRule);
  writeRaw(LPL.cfgAnomalyMarks, keys.anomalyMarks);
  writeRaw(LPL.cfgFx, keys.fx);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT));
  }
  return { applied: true, summary: summarizeImportPayload(checked.payload) };
}
