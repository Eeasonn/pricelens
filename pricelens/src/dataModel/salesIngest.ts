// ============================================================
// 真实销量（PSI 周表）归一化纯函数层（2026-11-17 Eason 契约，接口预留）。
// 外部输入 = 数据包 v2 的 sales: SalesSourceRow[]（公司 Agent 产出的
// 「Category1/Category2/info 拆列 + PeriodID(YYYY0WW) + QTY 按粒度汇总」周表，
// 字段名映射见 docs/底表结构与真实数据接入契约）。
// 本模块只做文本归一与解析，不持有任何数据集引用（regions/products 由调用方
// 注入，避免与 data/index 循环依赖）；同输入两次调用逐字节一致。
//
// 维度口径（与 offer 看板拆列规则一一对应）：
//   手机   cat1=存储（12+512 GB）      cat2=空
//   平板   cat1=存储                   cat2=屏幕（11.5"）
//   穿戴   cat1=表盘（42mm；不涉及/唯一尺寸=空）cat2=空
//   音频   cat1=空（产品级）           cat2=空
// ============================================================
import type { DimProduct, DimRegion, SalesSourceRow } from './types';
import { DEFAULT_COUNTRY_ALIASES } from './ingestText';

// ---------------- 周期间：YYYY0WW（2026043）/ YYYYWW（202643）→ YYYYWW ----------------

/** PSI PeriodID → 内部 week_id（YYYYWW，dim_time 同键）。YYYY0WW = 年 + 0 + 两位周
 *  （2026043 → 202643）；兼容已是 YYYYWW 的输入；周号 1–53 之外 = null（skipped）。 */
export function normalizePeriodId(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^\d{6,7}$/.test(s)) return null;
  let year: string;
  let week: string;
  if (s.length === 7) {
    if (s[4] !== '0') return null; // YYYY0WW 固定分隔位
    year = s.slice(0, 4);
    week = s.slice(5);
  } else {
    year = s.slice(0, 4);
    week = s.slice(4);
  }
  const w = Number(week);
  if (!Number.isInteger(w) || w < 1 || w > 53) return null;
  return `${year}${String(w).padStart(2, '0')}`;
}

// ---------------- 国家：国家码 / 中文国名 / 英文国名 → country_code ----------------

/** Management Country/Region → country_code（dim_region 内已登记才返回）。
 *  接受 国家码（ru/RU）/ 中文国名（R国、德国）/ 英文国名（Russia）；解不出 = null。
 *  2026-11-18 C3 显性化：别名表第 3 参注入（默认 = ingestText DEFAULT_COUNTRY_ALIASES
 *  并集——原 PSI 侧独有 COUNTRY_NAME_ALIASES 已收编进出厂默认，两侧同源）。 */
export function normalizeCountryCode(
  raw: string | null | undefined,
  regions: DimRegion[],
  countryAliases?: Record<string, string>,
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (regions.some((r) => r.country_code === upper)) return upper;
  const alias = (countryAliases ?? DEFAULT_COUNTRY_ALIASES)[s.toLowerCase()];
  if (alias && regions.some((r) => r.country_code === alias)) return alias;
  const byName = regions.find((r) => r.country_name === s || r.region_name === s);
  return byName ? byName.country_code : null;
}

// ---------------- 存储（手机/平板 cat1） ----------------

interface StorageParts { ram: number; rom: number; romUnit: 'GB' | 'TB' }

/** 解析存储文本为 (ram, romGB)：'12+512 GB' / '12+512gb' / '12+512' / '12+1T' /
 *  '8/128 GB' / '256 GB' / '1 tb'。分隔符 + / / 空格均可；无单位裸数字按 GB。
 *  解不出 = null（'—' / '规格未标明' / 空文本）。 */
export function storageParse(raw: string | null | undefined): StorageParts | null {
  if (raw == null) return null;
  const s = String(raw).toLowerCase().trim();
  if (!s || s === '—' || s === '-' || s === '规格未标明') return null;
  const hasSep = /[+/]/.test(s);
  const tokens: { n: number; tb: boolean }[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(tb|t|gb|g)?(?=[\s+/]|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) != null) {
    const unit = m[2];
    tokens.push({ n: Number(m[1]), tb: unit === 'tb' || unit === 't' });
  }
  if (!tokens.length) return null;
  const pick = hasSep
    ? { ram: tokens[0], rom: tokens[1] ?? null } // 分隔形态：首段=RAM，次段=ROM（自带单位）
    : tokens.length >= 2
      ? { ram: tokens[tokens.length - 2], rom: tokens[tokens.length - 1] }
      : { ram: null, rom: tokens[0] };
  if (!pick.rom) return null;
  const romGB = pick.rom.tb ? pick.rom.n * 1024 : pick.rom.n;
  return {
    ram: pick.ram ? (pick.ram.tb ? pick.ram.n * 1024 : pick.ram.n) : 0,
    rom: romGB,
    romUnit: pick.rom.tb ? 'TB' : 'GB',
  };
}

const fmtNum = (n: number): string => String(Number(n.toFixed(2)));

/** 存储规范形（cat1 匹配键的显示形态）：'12+512 GB' / '12+1 TB' / '256 GB'；解不出 = ''。
 *  大小写/空格/单位简写差异（'12+512gb' ≡ '12+512 GB'，'12+1T' ≡ '12+1 TB'）归一。 */
export function normalizeStorage(raw: string | null | undefined): string {
  const p = storageParse(raw);
  if (!p) return '';
  const rom = fmtNum(p.romUnit === 'TB' ? p.rom / 1024 : p.rom);
  return p.ram > 0 ? `${fmtNum(p.ram)}+${rom} ${p.romUnit}` : `${rom} ${p.romUnit}`;
}

/** 存储匹配键（GB 数值对，单位无关）：'12+1T' 与 '12+1 TB' 同键 '12|1024'。 */
export function storageKeyOf(raw: string | null | undefined): string {
  const p = storageParse(raw);
  return p ? `${p.ram}|${p.rom}` : '';
}

// ---------------- 表盘 / 屏幕（穿戴 cat1、平板 cat2） ----------------

/** 表盘大小规范形：'42mm' / '42 mm' / '42MM' → '42mm'；解不出 = null。 */
export function normalizeCaseSize(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const m = String(raw).match(/(\d{2}(?:\.\d+)?)\s*mm\b/i);
  return m ? `${fmtNum(Number(m[1]))}mm` : null;
}

/** 屏幕大小规范形：`11.5'` / '11.5"' / '11.5寸' / '11-inch' / '13 in' → '11.5"'；解不出 = null。 */
export function normalizeScreen(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw);
  const m = s.match(/(\d{1,2}(?:\.\d+)?)\s*(?:['"“”″寸]|\-?inch\b|\bin\b)/i);
  return m ? `${fmtNum(Number(m[1]))}"` : null;
}

/** 从 romram 原文剥掉屏幕前缀后的余量（平板存储解析用）：'11.5" 12+256 GB PaperMatte' → '12+256 GB PaperMatte' */
export function stripScreenPrefix(romram: string): string {
  return romram.replace(/^\s*\d{1,2}(?:\.\d+)?\s*(?:['"“”″寸]|\-?inch\b|\bin\b)\s*/i, '').trim();
}

/** PSI category2 维度列专用：该列语义已知是屏幕，裸数字（'13.2'）也按英寸收——
 *  与 normalizeScreen（混排文本里必须有单位锚点）区分，防 romram 解析误吞。 */
export function normalizeScreenColumn(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return normalizeScreen(s) ?? (/^\d{1,2}(?:\.\d+)?$/.test(s) ? `${fmtNum(Number(s))}"` : null);
}

// ---------------- 型号解析（PSI Product → 内部 model_id） ----------------

/** 型号名匹配键：小写 + 去空白/标点/符号（'Watch 6' ≡ 'watch6'，保留中日韩文字）。 */
export function normalizeModelKey(name: string): string {
  return String(name).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** PSI Product → model_id：别名表原文直查 → 别名归一键 → model_name 归一键。
 *  解不出 = null（unmatched）。同归一键多型号命中时我司优先（PSI 是华为内部
 *  销量；'Watch 6' 与 Honor 竞品 Watch 6 同键），再取首个。 */
export function resolveModelId(
  product: string | null | undefined,
  products: DimProduct[],
  aliases: Record<string, string> = {},
): string | null {
  const raw = String(product ?? '').trim();
  if (!raw) return null;
  const byName = (name: string): string | null => {
    const target = normalizeModelKey(name);
    if (!target) return null;
    const hits = products.filter((p) => normalizeModelKey(p.model_name) === target);
    if (!hits.length) return null;
    return (hits.find((p) => p.is_own) ?? hits[0]).model_id;
  };
  const alias = aliases[raw];
  if (alias) {
    const exact = products.find((p) => p.model_name === alias);
    if (exact) return exact.model_id;
    const viaKey = byName(alias);
    if (viaKey) return viaKey;
  }
  return byName(raw);
}

// ---------------- 维度归一（按型号所属产业，PSI 行不带产业） ----------------

/** 型号维度口径（匹配两侧同用）：优先 DimProduct.cat1/cat2 显式回填；
 *  未回填时按产业从 romram/color 回落解析（手机=存储、平板=屏幕+存储、
 *  穿戴=表盘（romram 优先、回落 color 兼容未回填的历史行）、音频/iot/pc=产品级）。 */
export function effectiveCatsOf(p: DimProduct): { cat1: string; cat2: string } {
  if (p.cat1 != null || p.cat2 != null) return { cat1: p.cat1 ?? '', cat2: p.cat2 ?? '' };
  switch (p.industry) {
    case 'phone':
      return { cat1: normalizeStorage(p.romram), cat2: '' };
    case 'tablet':
      return { cat1: normalizeStorage(stripScreenPrefix(p.romram)), cat2: normalizeScreen(p.romram) ?? '' };
    case 'wearable':
      // 2026-11-18 结构化后表盘已升配置维（romram=41mm），回落 color 兼容未回填历史行
      return { cat1: normalizeCaseSize(p.romram) ?? normalizeCaseSize(p.color) ?? '', cat2: '' };
    default:
      return { cat1: '', cat2: '' };
  }
}

/** 维度3（平板柔光 Normal / PaperMatte）：优先 DimProduct.cat3（服务器随人工匹配行回填）；
 *  未回填的历史包按 romram 文本推断（PaperMatte / 柔光 → PaperMatte，其余平板 → Normal）；
 *  非平板 = ''。销量取数键的第三段（2026-11-27：事实到 category 粒度，同存储同尺寸的
 *  Normal 与 PaperMatte 是两个配置）。 */
export function effectiveCat3Of(p: DimProduct): string {
  if (p.cat3 != null) return p.cat3;
  return p.industry === 'tablet' ? (/paper\s?matte|柔光/i.test(p.romram) ? 'PaperMatte' : 'Normal') : '';
}

// ---------------- PSI 源行 → 已解析事实 ----------------

export interface NormalizedSales {
  facts: {
    week_id: string;
    country_code: string;
    model_id: string;
    cat1: string;
    cat2: string;
    qty: number;
    /** 仅服务器已解析的行（带 category3）携带 */
    cat3?: string;
  }[];
  /** 国家 / 型号解析失败的行数（诊断：别名缺口的信号） */
  unmatched: number;
  /** 周期间非法 / QTY 非正数的行数 */
  skipped: number;
}

/** PSI 行归一 + 同键（国家×型号×cat1×cat2×cat3×周）求和。纯函数：不改输入。
 *  两种入参形态（2026-11-27 四表结构）：
 *  ① 已解析行（服务器发来的 fact_sales matched 行）：带 modelId，category1~3 已是匹配表目标行的值，
 *     直接采用，不再按型号名解析；
 *  ② 原始行（旧静态包 / 历史形态）：按型号名 + 别名解析型号，按产业归一 category1/2（兼容路径）。 */
export function normalizeSalesRows(
  rows: SalesSourceRow[],
  ctx: { regions: DimRegion[]; products: DimProduct[]; aliases?: Record<string, string>; countryAliases?: Record<string, string> },
): NormalizedSales {
  const unmatched = ctx.products.length === 0 ? rows.length : 0;
  if (ctx.products.length === 0) return { facts: [], unmatched, skipped: 0 };
  const summed = new Map<string, { week_id: string; country_code: string; model_id: string; cat1: string; cat2: string; cat3?: string; qty: number; psiType?: string }>();
  let skipped = 0;
  let bad = 0;
  for (const row of rows) {
    const qty = Number(row?.qty);
    const week = normalizePeriodId(row?.periodId);
    if (!Number.isFinite(qty) || qty <= 0 || week == null) {
      skipped += 1;
      continue;
    }
    const cc = normalizeCountryCode(row?.country, ctx.regions, ctx.countryAliases);
    const resolvedId = typeof row?.modelId === 'string' ? row.modelId.trim() : '';
    let modelId: string | null;
    let cat1: string;
    let cat2: string;
    let cat3 = '';
    if (resolvedId) {
      if (!ctx.products.some((p) => p.model_id === resolvedId)) {
        bad += 1; // 型号不在当前维表（数据包与维表不同批）
        continue;
      }
      modelId = resolvedId;
      cat1 = row?.category1 ?? '';
      cat2 = row?.category2 ?? '';
      cat3 = row?.category3 ?? '';
    } else {
      modelId = resolveModelId(row?.product, ctx.products, ctx.aliases);
      if (modelId == null) {
        bad += 1;
        continue;
      }
      const head = ctx.products.find((p) => p.model_id === modelId);
      const industry = head?.industry;
      cat1 = industry === 'phone' || industry === 'tablet' ? normalizeStorage(row?.category1) : industry === 'wearable' ? normalizeCaseSize(row?.category1) ?? '' : '';
      cat2 = industry === 'tablet' ? normalizeScreenColumn(row?.category2) ?? '' : '';
    }
    if (cc == null) {
      bad += 1;
      continue;
    }
    const key = `${cc}|${modelId}|${cat1}|${cat2}|${cat3}|${week}`;
    // 来源类型随行保留：同键并入来源不同的行（如真实 PSI + 模拟）记成 mixed，页面按「混合」标注
    const psiType = typeof row?.psiType === 'string' && row.psiType.trim() ? row.psiType.trim() : undefined;
    const cur = summed.get(key);
    if (cur) {
      cur.qty += qty;
      if (psiType && cur.psiType === undefined) cur.psiType = psiType;
      else if (psiType && cur.psiType !== psiType) cur.psiType = 'mixed';
    } else {
      summed.set(key, { week_id: week, country_code: cc, model_id: modelId, cat1, cat2, qty, ...(psiType ? { psiType } : {}), ...(cat3 ? { cat3 } : {}) });
    }
  }
  const facts = [...summed.values()].sort((a, b) =>
    a.week_id.localeCompare(b.week_id) || a.country_code.localeCompare(b.country_code)
      || a.model_id.localeCompare(b.model_id) || a.cat1.localeCompare(b.cat1) || a.cat2.localeCompare(b.cat2)
      || (a.cat3 ?? '').localeCompare(b.cat3 ?? ''));
  return { facts, unmatched: bad, skipped };
}
