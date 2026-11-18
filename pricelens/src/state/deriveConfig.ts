// ============================================================
// 派生配置表读取（2026-11-18 配置表化轮）：「原表没有、后加」的内容——系列规则 /
// 型号别名 / 对标矩阵 / 分档阶梯 / 大促档期——以配置 xlsx 页签维护（导入 = 写入
// localStorage LPL3.config.*，configImportExport 通道），读取方在此。
//
// 两类消费时机：
// · 数据包 v3 apply 时读入参与派生（别名/阶梯/矩阵/档期）——改表后需重导数据包
//   或点「用当前配置表重新派生」（DataPackBlock）；
// · 系列读时生效（effectiveSeriesOf）：改系列规则立即反映在产品树，无需重导。
// ============================================================
import type { DimBenchmark, DimProduct, DimPromo } from '../dataModel/types';
import { normkey } from '../dataModel/ingestText';
import { compileSeriesRule, fillTemplate, type SeriesRule } from '../dataModel/offerSeries';
import type { OfferAliasRow } from '../dataModel/offerIngest';
import { LPL } from './lplKeys';

function readRaw(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

// ---------------- 系列规则（读时生效，带编译缓存） ----------------

interface CompiledSeriesRule { brand: string; rx: RegExp | null; prefix: string | null; series: string }

let seriesRulesCacheRaw: string | null = null;
let seriesRulesCache: CompiledSeriesRule[] | null | undefined;

/** 系列规则配置表（LPL3.config.seriesRules）：null = 未配置（用内置默认）。
 *  编译失败/字段不全的行防御性跳过；整表无有效行 = null。 */
function seriesRulesCompiled(): CompiledSeriesRule[] | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LPL.cfgSeriesRules);
  } catch {
    return null;
  }
  if (seriesRulesCacheRaw !== raw) {
    seriesRulesCacheRaw = raw;
    let next: CompiledSeriesRule[] | null = null;
    const parsed = readRaw(LPL.cfgSeriesRules);
    if (Array.isArray(parsed)) {
      const rows: CompiledSeriesRule[] = [];
      for (const item of parsed) {
        if (item == null || typeof item !== 'object') continue;
        const r = item as Partial<SeriesRule>;
        if (!isStr(r.brand) || !isStr(r.pattern) || !isStr(r.series)) continue;
        const compiled = compileSeriesRule({ brand: r.brand, pattern: r.pattern, series: r.series });
        if (compiled) rows.push(compiled);
      }
      if (rows.length > 0) next = rows;
    }
    seriesRulesCache = next;
  }
  return seriesRulesCache ?? null;
}

/** 型号 → 系列名（读时派生，纯配置驱动）：配置规则逐条命中（系列名支持 {n}/{w}
 *  模板引用第 1 捕获组），无配置规则 = 保持导入时派生的存值（当时=配置或兜底）。
 *  产品树等呈现层统一走此函数，改系列规则立即生效、无需重导数据包。 */
export function effectiveSeriesOf(p: Pick<DimProduct, 'brand' | 'model_name' | 'is_own' | 'series'>): string {
  const rules = seriesRulesCompiled();
  if (!rules) return p.series;
  const k = normkey(p.brand, p.model_name).replace(/ /g, '');
  for (const rule of rules) {
    if (rule.brand.toLowerCase() !== p.brand.toLowerCase()) continue;
    if (rule.rx != null) {
      const m = p.model_name.match(rule.rx);
      if (m) return fillTemplate(rule.series, m[1]);
    } else if (rule.prefix != null) {
      const prefix = rule.prefix;
      if (p.model_name.toLowerCase().startsWith(prefix.toLowerCase()) || k.startsWith(prefix.toLowerCase().replace(/\s+/g, ''))) {
        return rule.series;
      }
    }
  }
  return p.series;
}

// ---------------- apply 时段配置表（数据包 v3 派生输入） ----------------

/** 系列规则配置表原始行（LPL3.config.seriesRules）：null = 未配置（v3 派生用，
 *  seriesOfModel 内部走自定义 → 内置 → 兜底链）。展示计数用 seriesRuleCount。 */
export function readSeriesRules(): SeriesRule[] | null {
  const parsed = readRaw(LPL.cfgSeriesRules);
  if (!Array.isArray(parsed)) return null;
  const rows: SeriesRule[] = [];
  for (const item of parsed) {
    if (item == null || typeof item !== 'object') continue;
    const r = item as Partial<SeriesRule>;
    if (isStr(r.brand) && isStr(r.pattern) && isStr(r.series)) rows.push({ brand: r.brand, pattern: r.pattern, series: r.series });
  }
  return rows.length > 0 ? rows : null;
}

/** 型号别名配置表（LPL3.config.modelAliases）：行 = 品牌|原始型号 → 目标型号 */
export function readModelAliasRows(): OfferAliasRow[] | null {
  const parsed = readRaw(LPL.cfgModelAliases);
  if (!Array.isArray(parsed)) return null;
  const rows: OfferAliasRow[] = [];
  for (const item of parsed) {
    if (item == null || typeof item !== 'object') continue;
    const r = item as Partial<OfferAliasRow>;
    if (isStr(r.brand) && isStr(r.from) && isStr(r.to)) rows.push({ brand: r.brand, from: r.from, to: r.to });
  }
  return rows.length > 0 ? rows : null;
}

/** 分档阶梯配置表（LPL3.config.tierLadders）：产业 → 价格点数组（按产业覆盖内置） */
export function readTierLadders(): Record<string, number[]> | null {
  const parsed = readRaw(LPL.cfgTierLadders);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out: Record<string, number[]> = {};
  for (const [ind, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isStr(ind) || !Array.isArray(value)) continue;
    const points = value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (points.length > 0) out[ind] = points.sort((a, b) => a - b);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 对标矩阵配置表（LPL3.config.benchmarkMatrix）：有行 = 矩阵层全量替换 */
export function readBenchmarkMatrix(): DimBenchmark[] | null {
  const parsed = readRaw(LPL.cfgBenchmarkMatrix);
  if (!Array.isArray(parsed)) return null;
  const rows: DimBenchmark[] = [];
  for (const item of parsed) {
    if (item == null || typeof item !== 'object') continue;
    const r = item as Partial<DimBenchmark>;
    if (!isStr(r.own_model_id) || !isStr(r.competitor_sku_id)) continue;
    rows.push({
      country_code: typeof r.country_code === 'string' ? r.country_code : '',
      own_model_id: r.own_model_id,
      own_romram: typeof r.own_romram === 'string' ? r.own_romram : '',
      competitor_sku_id: r.competitor_sku_id,
      sort: typeof r.sort === 'number' && Number.isFinite(r.sort) ? r.sort : 0,
      source: 'matrix',
      note: typeof r.note === 'string' ? r.note : undefined,
    });
  }
  return rows.length > 0 ? rows : null;
}

/** 大促档期配置表（LPL3.config.promoRows）：null/空 = 无大促带 */
export function readPromoRows(): DimPromo[] | null {
  const parsed = readRaw(LPL.cfgPromoRows);
  if (!Array.isArray(parsed)) return null;
  const rows: DimPromo[] = [];
  for (const item of parsed) {
    if (item == null || typeof item !== 'object') continue;
    const r = item as Partial<DimPromo>;
    if (!isStr(r.country_code) || !isStr(r.promo_name) || !isStr(r.start_date) || !isStr(r.end_date)) continue;
    const depth = r.depth_hint === '浅' || r.depth_hint === '中' ? r.depth_hint : '深';
    rows.push({
      promo_id: r.promo_id && isStr(r.promo_id) ? r.promo_id : `${r.country_code}-${r.promo_name}-${r.start_date}`,
      country_code: r.country_code,
      promo_name: r.promo_name,
      start_date: r.start_date,
      end_date: r.end_date,
      depth_hint: depth,
      platforms: Array.isArray(r.platforms) ? r.platforms.filter(isStr) : null,
      channel_raw: typeof r.channel_raw === 'string' ? r.channel_raw : '',
    });
  }
  return rows.length > 0 ? rows : null;
}

/** 系列规则配置行数（配置页预览用；null = 未配置走内置） */
export function seriesRuleCount(): number | null {
  const rules = seriesRulesCompiled();
  return rules ? rules.length : null;
}
