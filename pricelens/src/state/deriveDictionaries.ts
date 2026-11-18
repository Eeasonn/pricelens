// ============================================================
// C3 解析字典读取（2026-11-18 Eason 拍板显性化）：国家别名 / 平台别名 /
// 店铺类型别名 / 品类映射——配置 xlsx 四页签维护（导入 = 写入 localStorage
// LPL3.config.*，configImportExport 通道），读取方在此。
//
// 语义与业务规则页签（deriveConfig.ts）不同：字典是**解析器出厂词汇**——
// 空表 = 出厂默认兜底（DEFAULT_DICTIONARIES）；有行 = 全量替换。
// 消费时机 = 派生时（数据包 v3 导入 / 重新派生：OfferIngestCtx.dictionaries
// 注入 offerIngest；normalizeCountryCode 注入 salesIngest）——改表后点
// 数据包区「用当前配置表重新派生」生效。
// ============================================================
import { DEFAULT_DICTIONARIES, type IngestDictionaries } from '../dataModel/ingestText';
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

/** Record<别名, 值> 形态读取：非对象/无有效行 = null（出厂默认） */
function readMap(key: string): Record<string, string> | null {
  const parsed = readRaw(key);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (isStr(k) && isStr(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function readCountryAliases(): Record<string, string> | null {
  return readMap(LPL.cfgCountryAliases);
}

export function readPlatformAliases(): Record<string, string> | null {
  return readMap(LPL.cfgPlatformAliases);
}

export function readStoreAliases(): Record<string, string> | null {
  return readMap(LPL.cfgStoreAliases);
}

export function readIndustryOfCat(): Record<string, IngestDictionaries['industryOfCat'][string]> | null {
  const raw = readMap(LPL.cfgIndustryOfCat);
  if (!raw) return null;
  const valid = new Set(['phone', 'tablet', 'wearable', 'audio', 'iot', 'pc']);
  const out: Record<string, IngestDictionaries['industryOfCat'][string]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (valid.has(v)) out[k] = v as IngestDictionaries['industryOfCat'][string];
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 整套字典（apply 时组装 OfferIngestCtx 用）：四页签任一有行即返回合并集
 *  （未配置的维度回出厂默认），全部为空 = null（整套装出厂默认）。 */
export function readDictionaries(): IngestDictionaries | null {
  const countryCodes = readCountryAliases();
  const platformAliases = readPlatformAliases();
  const storeAliases = readStoreAliases();
  const industryOfCat = readIndustryOfCat();
  if (!countryCodes && !platformAliases && !storeAliases && !industryOfCat) return null;
  return {
    countryCodes: countryCodes ?? DEFAULT_DICTIONARIES.countryCodes,
    platformAliases: platformAliases ?? DEFAULT_DICTIONARIES.platformAliases,
    storeAliases: storeAliases ?? DEFAULT_DICTIONARIES.storeAliases,
    industryOfCat: industryOfCat ?? DEFAULT_DICTIONARIES.industryOfCat,
  };
}
