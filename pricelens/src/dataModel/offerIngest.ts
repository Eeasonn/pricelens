// ============================================================
// offer 原表 → 维表 + 事实行 归一引擎（2026-11-18 数据包 v3「原表模式」）。
// 与 scripts/ingest_real.py 逐字对齐（行清洗 L780-915、维表 L915-1012、
// 分国档位 L1287-1318、穿戴表盘升级 = patch_dim_categories.py 三分支）；
// PSI 销量侧归一在 salesIngest.ts（两侧勿漂移）。
//
// 纯函数层：不引用数据集与 localStorage——配置表（系列规则/别名/阶梯/大促/
// 对标矩阵）与地区基座由调用方（data/index.ts applyDataPack）经
// state/deriveConfig.ts 读入后经 ctx 注入。
//
// 与 Python 管线的已知简化（首版取舍，契约文档已注明）：
// · 分国档位不走矩阵声明区间（原表模式无矩阵 txt 输入），全按分国参考价落阶梯；
// · core_platforms 无「国家主要电渠」txt，取内置基座 ∩ 实际平台，不足取行数前 2；
// · MatePad Air 12.2" 笔误归并等单案特判不入引擎（走配置表别名解决）。
// ============================================================
import type { DimBenchmark, DimChannel, DimFx, DimProduct, DimPromo, DimRegion, DimTier, DimTime, FactPriceWeekly } from './types';
import { normalizeCaseSize, normalizeScreen, normalizeScreenColumn, normalizeStorage, stripScreenPrefix } from './salesIngest';
import {
  ccOf, DEFAULT_DICTIONARIES, fold, industryOfCat, isBrandInline, mapSourceColumns, normkey, parseDatetimeCell,
  parsePct, platformAliasOf, slug, storeAliasOf, titleColor, unitFreeColor, weekOf,
  type IngestDictionaries,
} from './ingestText';
import { seriesOfModel, tierCodeOf, tierLabel, tierRank, type IngestIndustry, type SeriesRule } from './offerSeries';

/** offer 原样行：字段名原样（双语表头在引擎内归一），值保持原文 */
export type OfferSourceRow = Record<string, unknown>;

export interface OfferAliasRow { brand: string; from: string; to: string }

export interface OfferIngestCtx {
  /** 系列规则配置表（null/空 = 无归组规则，全部兜底：我司=型号名首词、竞品=型号名本身） */
  seriesRules: SeriesRule[] | null;
  /** 型号别名配置表（null/空 = 无别名） */
  modelAliasRows: OfferAliasRow[] | null;
  /** 分档阶梯配置表（产业 → USD 价格点；该产业无配置 = 无档位 '—'） */
  tierLadders: Record<string, number[]> | null;
  /** 大促档期配置表（null/空 = 无大促带） */
  promoRows: DimPromo[] | null;
  /** 对标矩阵配置表（null/空 = 无矩阵；人工层不受影响） */
  benchmarkRows: DimBenchmark[] | null;
  /** 地区基座（内置 dim_region：静态区域/国名/sort） */
  regionBase: DimRegion[];
  /** C3 解析字典（2026-11-18 显性化；null = 出厂默认——字典是解析器词汇，
   *  空表语义与业务规则不同：业务规则空 = 无规则，字典空 = 出厂词兜底） */
  dictionaries?: IngestDictionaries | null;
}

export interface OfferIngestDiag {
  rowsIn: number;
  /** 事实行数（清洗+去重后） */
  rowsOut: number;
  droppedBy: Record<string, number>;
  /** 汇率倒挂取倒数、单位错位修正、穿戴升维等自动修复行数 */
  fixed: Record<string, number>;
  models: number;
  skus: number;
  channels: number;
  weeks: number;
}

export interface OfferIngestResult {
  dims: {
    region: DimRegion[];
    product: DimProduct[];
    channel: DimChannel[];
    time: DimTime[];
    fx: DimFx[];
    promo: DimPromo[];
    benchmark: DimBenchmark[];
    tier: DimTier;
  };
  factRows: FactPriceWeekly[];
  diag: OfferIngestDiag;
}

// ---------------- 小工具 ----------------

const str = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  const s = String(v).trim();
  return s === 'nan' || s === 'NaT' || s === 'None' || s === 'null' ? '' : s;
};
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const medianOf = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const bump = (rec: Record<string, number>, key: string, by = 1): void => {
  rec[key] = (rec[key] ?? 0) + by;
};
const pad2 = (n: number): string => String(n).padStart(2, '0');
const dateStr = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const timeStr = (d: Date): string => `${dateStr(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** ISO 周 → 该周周三日期（dim_time 锚；与 Python to_week_wed 同口径） */
function weekWedOf(weekId: string): Date {
  const year = Number(weekId.slice(0, 4));
  const week = Number(weekId.slice(4));
  const jan4 = new Date(year, 0, 4);
  const dayNr = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(jan4.getFullYear(), jan4.getMonth(), jan4.getDate() - dayNr);
  return new Date(week1Monday.getFullYear(), week1Monday.getMonth(), week1Monday.getDate() + (week - 1) * 7 + 2);
}

// ---------------- 中间行形态 ----------------

interface IngestRow {
  cc: string;
  industry: IngestIndustry;
  brand: string;
  nkey: string;
  modelRaw: string;
  platform: string;
  storeType: string;
  shop: string;
  shopDisp: string;
  weekId: string;
  currency: string;
  fx: number | null;
  rrpLocal: number | null;
  priceLocal: number | null;
  dd: number | null;
  da: number | null;
  bundle: boolean;
  installment: string;
  promo: string;
  url: string;
  shot: string;
  crawledAt: string;
  spec: string;
  /** 规格拆列形态（Category1/Category2/info）原文 */
  cat1Src: string;
  cat2Src: string;
  infoSrc: string;
  // 派生
  modelName: string;
  modelId: string;
  skuId: string;
  romram: string;
  romKey: string;
  color: string;
  colorKey: string;
  rrpUsd: number | null;
  priceUsd: number | null;
  isOwn: boolean;
}

// ---------------- 规格拆列（parse_romram 三分支） ----------------

interface RomramParts { romram: string; romKey: string; color: string; colorKey: string }

/** 型号规格 → (romram 显示文案, rom_key, color 变体文案, color_key)。
 *  sku_id 稳定性契约：rom_key/color_key 恒等于塌缩前旧键，塌缩只改展示字段。 */
export function parseRomram(industry: string, spec: string): RomramParts {
  const s = spec.trim();
  if (!s || s === '-' || s === '\\' || s === '/') return { romram: '—', romKey: 'std', color: '—', colorKey: '—' };
  if (industry === 'phone') {
    let m = s.match(/^(\d+)\s*\+\s*(\d+)\s*(TB|T|GB|G)?\s*(?:GB)?\s+(.+)$/i);
    if (m) {
      const unit = (m[3] ?? '').toUpperCase().startsWith('T') ? 'TB' : 'GB';
      const disp = `${m[1]}+${m[2]} ${unit}`;
      const color = unitFreeColor(m[4]);
      return { romram: disp, romKey: `${m[1]}+${m[2]}${unit}`.toLowerCase(), color, colorKey: color };
    }
    m = s.match(/^(\d+)\s*(GB|TB|T)\s+(.+)$/i);
    if (m) {
      const unit = m[2].toUpperCase().startsWith('T') ? 'TB' : 'GB';
      const disp = `${m[1]} ${unit}`;
      const color = unitFreeColor(m[3]);
      return { romram: disp, romKey: `${m[1]}${unit}`.toLowerCase(), color, colorKey: color };
    }
    return { romram: s, romKey: slug(s), color: titleColor(s), colorKey: titleColor(s) };
  }
  if (industry === 'tablet') {
    const parts = s.split('/').map((p) => p.trim());
    const size = parts.find((p) => /^\d+(\.\d+)?(″|"|in)/i.test(p)) ?? '';
    const connRaw = parts.find((p) => ['WIFI', 'LTE', '5G', '5G LTE', '5G LTE+WIFI', 'CELLULAR', 'NG LTE'].includes(p.toUpperCase())) ?? '';
    const conn = ({ WIFI: 'WiFi', CELLULAR: 'Cellular', '5G': '5G', '5G LTE': '5G', '5G LTE+WIFI': '5G', 'NG LTE': 'LTE' } as Record<string, string>)[connRaw.toUpperCase()] ?? connRaw;
    const mem = parts.find((p) => /\d+\s*\+\s*\d+/.test(p)) ?? '';
    let memd = '';
    const mm = mem.match(/(\d+)\s*\+\s*(\d+)\s*(TB|GB|G)?/i);
    if (mm) {
      const romd = mm[2] + ((mm[3] ?? '').toUpperCase().startsWith('T') ? ' TB' : ' GB');
      memd = `${mm[1]}+${romd}`;
    }
    const variant = parts.find((p) => ['papermatte', 'nano-texture glass'].includes(p.toLowerCase())) ?? '';
    const key = [size, conn, memd, variant].filter(Boolean).join(' ').replace(/"/g, 'in').replace(/″/g, 'in').replace(/ /g, '').toLowerCase();
    const dispNowifi = [size, memd, variant].filter(Boolean).join(' ') || '—';
    return { romram: dispNowifi, romKey: key, color: conn || '—', colorKey: '—' };
  }
  if (industry === 'wearable') {
    const connPat = /\b(GPS\s*\+\s*Cellular|Cellular|LTE|GPS|Bluetooth|WiFi)\b/gi;
    const techPat = /\b(AMOLED|Solar)\b/gi;
    const conns = [...s.matchAll(connPat)].map((m) => m[1].toUpperCase().replace(/ /g, ''));
    const techs = [...s.matchAll(techPat)].map((m) => m[1]);
    const rest = s.replace(techPat, '').replace(connPat, '').trim().replace(/^[\s/-]+|[\s/-]+$/g, '');
    const ms = rest.match(/^(\d+(?:\.\d+)?)\s*mm\s*(.*)$/i);
    let size: string | null = null;
    let color = rest;
    if (ms) {
      size = `${ms[1]}mm`;
      color = ms[2].trim() || '—';
    }
    const titleCase = (v: string): string => v.toLowerCase().replace(/(^|[\s+/\-])(\p{L})/gu, (_m, sep: string, letter: string) => sep + letter.toUpperCase());
    const variant = [...new Set(conns.map((c) => titleCase(c).replace('Gps', 'GPS').replace('Lte', 'LTE'))), ...techs].sort().join(' ');
    const disp = [size, variant].filter(Boolean).join(' ') || '—';
    const colorDisp = color !== '—' ? titleColor(color) : '—';
    const key = disp === '—' ? 'std' : disp.replace(/ /g, '').toLowerCase();
    const label = [disp !== '—' ? disp : '', colorDisp !== '—' ? colorDisp : ''].filter(Boolean).join(' ');
    return { romram: '—', romKey: key, color: label || '—', colorKey: colorDisp };
  }
  if (industry === 'pc') {
    const cpu = s.match(/^(.*?)\s*\|/);
    const ram = s.match(/RAM:\s*(\d+)/i);
    const sto = s.match(/STO:\s*(\d+(?:\.\d+)?)\s*(TB|GB)?/i);
    const ramd = ram ? `${ram[1]}+` : '';
    const stod = sto ? sto[1] + ((sto[2] ?? '').toUpperCase().startsWith('T') ? ' TB' : ' GB') : '';
    const disp = ((cpu ? `${cpu[1].trim()} ` : '') + ramd + stod).trim() || s;
    return { romram: disp, romKey: disp.replace(/ /g, '').toLowerCase(), color: '—', colorKey: '—' };
  }
  return { romram: '—', romKey: 'std', color: titleColor(s), colorKey: titleColor(s) };
}

/** 规格拆列形态（内部表已按契约 §2.1 拆好 Category1/Category2/info）→ 同构部件。
 *  显示文案口径与 §2.1 一致：手机 romram=存储；平板 romram=屏幕+存储；穿戴表盘
 *  留给升级段（原样进 romKey）；音频不拆。 */
function romramFromSpecCats(industry: string, cat1: string, cat2: string, info: string): RomramParts {
  const c1 = cat1.trim();
  const c2 = cat2.trim();
  const inf = info.trim();
  const color = inf ? titleColor(inf) : '—';
  const colorKey = inf ? slug(inf) : '—';
  if (industry === 'phone') {
    return { romram: c1 ? normalizeStorage(c1) : '—', romKey: c1 ? slug(c1) : 'std', color, colorKey };
  }
  if (industry === 'tablet') {
    const screen = c2 ? (normalizeScreenColumn(c2) ?? c2) : '';
    const romram = [screen, c1 ? normalizeStorage(c1) : ''].filter(Boolean).join(' ') || '—';
    return { romram, romKey: [c1, c2].filter(Boolean).map((x) => slug(x)).join('') || 'std', color, colorKey };
  }
  if (industry === 'wearable') {
    // 内部表的 Category1 语义 = 维度1：拆了列就是维度（GT 6 Pro 源表本身只留颜色
    // → cat1 为空 = 型号级）；唯一/多尺寸的判定已由拆列方完成，不再启发式升级
    const size = normalizeCaseSize(c1);
    return { romram: size ?? '—', romKey: c1 ? slug(c1) : 'std', color, colorKey };
  }
  return { romram: '—', romKey: 'std', color, colorKey };
}

// ---------------- 穿戴表盘升级（patch_dim_categories 三分支） ----------------

const SIZE_IN_COLOR_RE = /(\d{2}(?:\.\d+)?)\s*mm/i;
const JUNK_COLORS = new Set(['大', '小']);

const stripSizeFromColor = (text: string): string => {
  const stripped = text.replace(/\d{2}(?:\.\d+)?\s*mm/gi, ' ').replace(/\s+/g, ' ').trim();
  return (stripped.replace(/^[\s/-]+|[\s/-]+$/g, '')) || '—';
};

/** 按 model_id 全局聚合尺寸（跨国家）：≥2 尺寸升配置维（romram=表盘、色剥尺寸）；
 *  唯一尺寸剥词不作维度（GT 6 Pro 口径）；「大/小」脏行按国家覆盖删或清洗。
 *  键（romKey）不动——sku_id 稳定契约。 */
function upgradeWearableSizes(rows: IngestRow[], diag: OfferIngestDiag): void {
  const byModel = new Map<string, IngestRow[]>();
  for (const r of rows) {
    if (r.industry !== 'wearable') continue;
    const arr = byModel.get(r.modelId) ?? [];
    arr.push(r);
    byModel.set(r.modelId, arr);
  }
  for (const modelRows of byModel.values()) {
    const sizeRows = modelRows.filter((r) => SIZE_IN_COLOR_RE.test(r.color));
    const sizes = new Set(sizeRows.map((r) => `${(r.color.match(SIZE_IN_COLOR_RE) as RegExpMatchArray)[1]}mm`));
    const cleanRows = modelRows.filter((r) => !JUNK_COLORS.has(r.color));
    if (sizes.size >= 2) {
      for (const r of sizeRows) {
        const size = `${(r.color.match(SIZE_IN_COLOR_RE) as RegExpMatchArray)[1]}mm`;
        r.romram = size;
        r.color = stripSizeFromColor(r.color);
        bump(diag.fixed, '穿戴表盘升配置维');
      }
    } else if (sizes.size === 1) {
      for (const r of sizeRows) {
        r.color = stripSizeFromColor(r.color);
        bump(diag.fixed, '穿戴唯一尺寸剥词');
      }
    }
    // 「大/小」脏行：正身行已覆盖该国 → 删行；否则保留清洗（该国唯一价格载体）
    for (const r of modelRows) {
      if (!JUNK_COLORS.has(r.color)) continue;
      const covered = cleanRows.some((c) => c.cc === r.cc);
      if (covered) {
        (r as IngestRow & IngestRowDrop).__drop = true;
        bump(diag.droppedBy, '穿戴脏色行(正身已覆盖)');
      } else {
        r.color = '—';
        r.colorKey = '—';
        bump(diag.fixed, '穿戴脏色行清洗保留');
      }
    }
  }
}

interface IngestRowDrop { __drop?: boolean }

// ---------------- 主入口 ----------------

export function buildFromOffers(offers: OfferSourceRow[], ctx: OfferIngestCtx): OfferIngestResult {
  const diag: OfferIngestDiag = {
    rowsIn: offers.length, rowsOut: 0, droppedBy: {}, fixed: {},
    models: 0, skus: 0, channels: 0, weeks: 0,
  };
  if (!Array.isArray(offers) || offers.length === 0) {
    throw new Error('offers 为空（原表模式至少需要 1 行采集明细）');
  }

  // 1. 列名归一（双语表头 + 同义列 + 规格拆列形态）
  const headerKeys = [...new Set(offers.flatMap((r) => Object.keys(r)))];
  const { map, missing } = mapSourceColumns(headerKeys);
  if (missing.length > 0) throw new Error(`原表缺少必要字段：${missing.join('、')}`);
  const specMode = Object.values(map).includes('Category1');
  const fieldOf = (src: OfferSourceRow, field: string): unknown => {
    for (const [key, canonical] of Object.entries(map)) {
      if (canonical === field) return src[key];
    }
    return undefined;
  };

  // 2. 别名表（完全来自配置表——显性语义：没配置就没别名）：品牌|归一键 → 目标归一键
  //（C3 字典默认在此解一次：null = 出厂默认整套）
  const dicts: IngestDictionaries = ctx.dictionaries ?? DEFAULT_DICTIONARIES;
  const aliasMap = new Map<string, string>();
  for (const row of ctx.modelAliasRows ?? []) {
    // 配置表别名行品牌同样归一大写（与行级归一同一口径，键两侧才对得上）
    const brand = str(row.brand).trim().toUpperCase();
    const from = str(row.from).trim();
    const to = str(row.to).trim();
    if (brand && from && to) aliasMap.set(`${brand}|${normkey(brand, from)}`, normkey(brand, to));
  }

  // 3. 行级归一（行业/国家/周期/平台/店铺类型/nkey+别名）
  const rows: IngestRow[] = [];
  for (const src of offers) {
    // 品牌统一大写后再派生（对齐 ingest_real.py:761 .str.upper()——否则 Huawei/huawei
    // 写法会被 prefixOf 大小写敏感比较判成竞品、BRAND_TOKENS 查不到、别名键错位）
    const brand = str(fieldOf(src, '品牌')).trim().toUpperCase();
    const modelRaw = str(fieldOf(src, '型号')).trim();
    // 空「型号」行剔除（对齐 ingest_real.py:758——否则 slug('')='x' 生成 *-x 幻影型号）
    if (!modelRaw) { bump(diag.droppedBy, '无型号'); continue; }
    const industry = industryOfCat(fieldOf(src, '品类'), dicts.industryOfCat);
    if (!industry) { bump(diag.droppedBy, '行业未识别'); continue; }
    const cc = ccOf(fieldOf(src, '国家/地区'), dicts.countryCodes);
    if (!cc) { bump(diag.droppedBy, '未知国家'); continue; }
    const wk = weekOf(fieldOf(src, '时间周期'));
    if (!wk) { bump(diag.droppedBy, '无周期'); continue; }
    let nkey = normkey(brand || '—', modelRaw);
    const alias = aliasMap.get(`${brand}|${nkey}`);
    if (alias) nkey = alias;
    const platformRaw = str(fieldOf(src, '平台')).trim();
    const platform = platformAliasOf(platformRaw, dicts.platformAliases);
    const storeRaw = str(fieldOf(src, '店铺类型')).trim();
    // 店铺类型钳制到合法三值，未知一律归 3P（对齐 ingest_real.py:798 where(isin(...),'3P')）
    const mappedStore = storeAliasOf(storeRaw, dicts.storeAliases);
    const storeType = (['1P', '3P', '独立站'] as readonly string[]).includes(mappedStore)
      ? (mappedStore as DimChannel['store_type'])
      : ('3P' as DimChannel['store_type']);
    const crawled = parseDatetimeCell(fieldOf(src, '采集时间'));
    rows.push({
      cc, industry, brand, nkey, modelRaw,
      platform, storeType,
      shop: str(fieldOf(src, '店铺名称')) || '—',
      shopDisp: str(fieldOf(src, '显示店铺名称')) || '—',
      weekId: wk[0],
      currency: str(fieldOf(src, '货币')).trim().toUpperCase(),
      fx: num(fieldOf(src, '汇率')),
      rrpLocal: num(fieldOf(src, '平台建议零售价-本币')),
      priceLocal: num(fieldOf(src, '平台成交价-本币')),
      dd: parsePct(fieldOf(src, '平台显示折扣率')),
      da: parsePct(fieldOf(src, '平台实际折扣率')),
      bundle: ['Y', 'YES', 'TRUE', '是'].includes(str(fieldOf(src, '是否组合销售')).toUpperCase()),
      installment: str(fieldOf(src, '分期付款')),
      promo: str(fieldOf(src, '促销政策')),
      url: str(fieldOf(src, '网址链接')),
      shot: str(fieldOf(src, '截图命名')),
      crawledAt: crawled ? timeStr(crawled) : '1970-01-01 00:00',
      spec: str(fieldOf(src, '型号规格')),
      cat1Src: specMode ? str(fieldOf(src, 'Category1')) : '',
      cat2Src: specMode ? str(fieldOf(src, 'Category2')) : '',
      infoSrc: specMode ? str(fieldOf(src, 'info')) : '',
      modelName: '', modelId: '', skuId: '', romram: '', romKey: '', color: '', colorKey: '',
      rrpUsd: null, priceUsd: null, isOwn: false,
    });
  }
  const dropMarked = (): void => {
    for (let i = rows.length - 1; i >= 0; i--) {
      if ((rows[i] as IngestRow & IngestRowDrop).__drop) rows.splice(i, 1);
    }
  };
  if (rows.length === 0) throw new Error('原表无有效行（国家/周期/行业全部未识别）');

  // 4. 汇率自愈：币种中位数自校验倒挂取倒数 → (国,周) 中位补 → 币种中位补
  {
    const byCur = new Map<string, number[]>();
    const push = (m: Map<string, number[]>, k: string, v: number): void => {
      const arr = m.get(k);
      if (arr) arr.push(v);
      else m.set(k, [v]);
    };
    for (const r of rows) if (r.currency && r.fx != null && r.fx > 0) push(byCur, r.currency, r.fx);
    const curMed = new Map<string, number>();
    for (const [k, arr] of byCur.entries()) {
      const m = medianOf(arr);
      if (m != null) curMed.set(k, m);
    }
    let inverted = 0;
    for (const r of rows) {
      if (r.fx == null || !r.currency) continue;
      const med = curMed.get(r.currency);
      if (med == null) continue;
      if ((r.fx < 1 && med >= 1) || (r.fx > 1 && med > 0 && med <= 1)) {
        r.fx = 1 / r.fx;
        inverted += 1;
      }
    }
    if (inverted) bump(diag.fixed, '汇率倒挂(取倒数)', inverted);
    const fillMedian = (keyOf: (r: IngestRow) => string): void => {
      const groups = new Map<string, number[]>();
      for (const r of rows) if (r.fx != null && r.fx > 0) push(groups, keyOf(r), r.fx);
      const meds = new Map<string, number>();
      for (const [k, arr] of groups.entries()) {
        const m = medianOf(arr);
        if (m != null) meds.set(k, m);
      }
      for (const r of rows) {
        if ((r.fx == null || r.fx <= 0) && meds.has(keyOf(r))) r.fx = meds.get(keyOf(r))!;
      }
    };
    fillMedian((r) => `${r.cc}|${r.weekId}`);
    fillMedian((r) => r.currency);
    let noFx = 0;
    for (const r of rows) {
      if (r.fx == null || r.fx <= 0) {
        (r as IngestRow & IngestRowDrop).__drop = true;
        noFx += 1;
      }
    }
    if (noFx) bump(diag.droppedBy, '无汇率', noFx);
    dropMarked();
  }

  // 5. USD 价 + 单位错位修正（>8×且÷100 落 0.5–2× → ÷100；<1/8×且×100 落 0.5–2× → ×100；>20000 剔）
  for (const r of rows) {
    if (r.fx == null || r.fx <= 0) continue;
    if (r.rrpLocal != null) r.rrpUsd = round2(r.rrpLocal / r.fx);
    if (r.priceLocal != null) r.priceUsd = round2(r.priceLocal / r.fx);
  }
  {
    const groups = new Map<string, number[]>();
    for (const r of rows) {
      if (r.priceUsd == null) continue;
      const k = `${r.brand}|${r.nkey}|${r.spec}|${r.cc}`;
      const arr = groups.get(k);
      if (arr) arr.push(r.priceUsd);
      else groups.set(k, [r.priceUsd]);
    }
    const meds = new Map<string, number>();
    for (const [k, arr] of groups.entries()) {
      const m = medianOf(arr);
      if (m != null) meds.set(k, m);
    }
    let fixHi = 0;
    let fixLo = 0;
    for (const r of rows) {
      const med = meds.get(`${r.brand}|${r.nkey}|${r.spec}|${r.cc}`);
      if (r.priceUsd == null || med == null || med === 0) continue;
      const ratio = r.priceUsd / med;
      const rescale = (factor: number): void => {
        if (r.rrpLocal != null) r.rrpLocal *= factor;
        if (r.priceLocal != null) r.priceLocal *= factor;
        if (r.fx != null && r.fx > 0) {
          if (r.rrpLocal != null) r.rrpUsd = round2(r.rrpLocal / r.fx);
          if (r.priceLocal != null) r.priceUsd = round2(r.priceLocal / r.fx);
        }
      };
      if (ratio > 8 && ratio / 100 > 0.5 && ratio / 100 < 2) {
        rescale(1 / 100);
        fixHi += 1;
      } else if (ratio < 1 / 8 && ratio * 100 > 0.5 && ratio * 100 < 2) {
        rescale(100);
        fixLo += 1;
      }
    }
    if (fixHi) bump(diag.fixed, '价格单位错位(÷100)', fixHi);
    if (fixLo) bump(diag.fixed, '价格单位错位(×100)', fixLo);
    let absurd = 0;
    for (const r of rows) {
      if (r.priceUsd != null && r.priceUsd > 20000) {
        (r as IngestRow & IngestRowDrop).__drop = true;
        absurd += 1;
      }
    }
    if (absurd) bump(diag.droppedBy, 'USD价格>20000(不可信)', absurd);
    dropMarked();
  }

  // 6. 型号正名（同 (品牌,nkey) 最高频原文 + 剥前缀品牌词）
  {
    const groups = new Map<string, IngestRow[]>();
    for (const r of rows) {
      const k = `${r.brand}|${r.nkey}`;
      const arr = groups.get(k);
      if (arr) arr.push(r);
      else groups.set(k, [r]);
    }
    for (const [key, g] of groups.entries()) {
      const brand = key.split('|')[0];
      const counts = new Map<string, number>();
      for (const r of g) counts.set(r.modelRaw, (counts.get(r.modelRaw) ?? 0) + 1);
      let name = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const toks = name.split(/\s+/);
      const brandLower = brand.toLowerCase();
      const headTok = toks.length > 0 ? fold(toks[0]).toLowerCase().replace(/[.,]$/, '') : '';
      if (headTok && (headTok === brandLower || headTok === brandLower.replace(/-/g, ''))) {
        name = toks.slice(1).join(' ') || name;
      }
      for (const r of g) r.modelName = name;
    }
  }

  // 7. 拆列 + id 拼装（sku_id 用塌缩前旧键——稳定性契约）
  const prefixOf = (r: IngestRow): 'own' | 'cmp' => (r.brand === 'HUAWEI' ? 'own' : 'cmp');
  for (const r of rows) {
    const parts = specMode
      ? romramFromSpecCats(r.industry, r.cat1Src, r.cat2Src, r.infoSrc)
      : parseRomram(r.industry, r.spec);
    r.romram = parts.romram;
    r.romKey = parts.romKey;
    r.color = parts.color;
    r.colorKey = parts.colorKey;
    r.isOwn = prefixOf(r) === 'own';
    const modelSlug = slug(r.brand);
    const nameSlug = slug(r.modelName);
    r.modelId = `${prefixOf(r)}-${modelSlug}-${nameSlug}`;
    r.skuId = `${r.modelId}__${slug(r.romKey)}__${slug(r.colorKey)}`;
  }
  upgradeWearableSizes(rows, diag);
  dropMarked();

  // 8. 去重：同(周×SKU×国×渠道×店铺)保留排序末尾一行——按「采集时间升序、有价行
  //  优先、同刻最低价」排序后取每键最后一行（与 Python drop_duplicates(keep='last') 同语义）
  {
    const keyOf = (r: IngestRow): string => `${r.weekId}|${r.skuId}|${r.cc}|${r.platform}|${r.storeType}|${r.shop}`;
    const sorted = [...rows].sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka !== kb) return ka < kb ? -1 : 1;
      if (a.crawledAt !== b.crawledAt) return a.crawledAt < b.crawledAt ? -1 : 1;
      const ha = a.priceLocal != null ? 1 : 0;
      const hb = b.priceLocal != null ? 1 : 0;
      if (ha !== hb) return ha - hb;
      const pa = a.priceLocal ?? Number.NEGATIVE_INFINITY;
      const pb = b.priceLocal ?? Number.NEGATIVE_INFINITY;
      return pb - pa;
    });
    const lastByKey = new Map<string, IngestRow>();
    for (const r of sorted) lastByKey.set(keyOf(r), r);
    const droppedDup = rows.length - lastByKey.size;
    if (droppedDup > 0) bump(diag.droppedBy, '重复行(周×SKU×国×渠道×店铺)', droppedDup);
    rows.length = 0;
    rows.push(...lastByKey.values());
  }

  // 9. 维表：时间 / 汇率 / 渠道 / 地区
  if (rows.length === 0) throw new Error('原表无有效周期');
  const dimTime: DimTime[] = [];
  {
    const weekIds = rows.map((r) => r.weekId).sort();
    const firstId = weekIds[0];
    const lastId = weekIds[weekIds.length - 1];
    let cur = weekWedOf(firstId);
    const end = weekWedOf(lastId);
    const seen = new Set<string>();
    while (cur.getTime() <= end.getTime()) {
      const id = `${cur.getFullYear()}${pad2(isoWeekOfDate(cur).week)}`;
      if (!seen.has(id)) {
        seen.add(id);
        const monthId = `${cur.getFullYear()}${pad2(cur.getMonth() + 1)}`;
        dimTime.push({
          week_id: id,
          week_wed_date: dateStr(cur),
          month_id: monthId,
          quarter_id: `${cur.getFullYear()}Q${Math.floor(cur.getMonth() / 3) + 1}`,
          week_start_date: dateStr(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - 2)),
        });
      }
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
    }
    diag.weeks = dimTime.length;
  }
  const dimFx: DimFx[] = [];
  {
    const groups = new Map<string, number[]>();
    for (const r of rows) {
      if (r.fx == null || !r.currency) continue;
      const month = weekWedOf(r.weekId);
      const monthId = `${month.getFullYear()}${pad2(month.getMonth() + 1)}`;
      const k = `${r.currency}|${monthId}`;
      const arr = groups.get(k);
      if (arr) arr.push(r.fx);
      else groups.set(k, [r.fx]);
    }
    for (const [k, arr] of groups.entries()) {
      const m = medianOf(arr);
      if (m == null) continue;
      const [currency, monthId] = k.split('|');
      dimFx.push({ currency, month_id: monthId, per_usd: round4(m) });
    }
    dimFx.sort((a, b) => a.currency.localeCompare(b.currency) || a.month_id.localeCompare(b.month_id));
  }
  const dimChannel: DimChannel[] = [];
  const channelIdOf = new Map<string, string>();
  {
    const groups = new Map<string, IngestRow[]>();
    for (const r of rows) {
      const k = `${r.cc}|${r.platform}|${r.storeType}`;
      const arr = groups.get(k);
      if (arr) arr.push(r);
      else groups.set(k, [r]);
    }
    const entries = [...groups.entries()].map(([k, g]) => ({ k, g, rows: g.length }));
    entries.sort((a, b) => {
      const [acc] = a.k.split('|');
      const [bcc] = b.k.split('|');
      return acc.localeCompare(bcc) || b.rows - a.rows;
    });
    for (const { k, g } of entries) {
      const [cc, pf, st] = k.split('|');
      const cid = `${cc}:${slug(pf)}:${st}`;
      channelIdOf.set(k, cid);
      const dispCounts = new Map<string, number>();
      const shopSet = new Set<string>();
      for (const r of g) {
        dispCounts.set(r.shopDisp, (dispCounts.get(r.shopDisp) ?? 0) + 1);
        shopSet.add(r.shop);
      }
      let disp = [...dispCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const pfHead = fold(pf).toLowerCase().slice(0, 3);
      if (['unknown', '—', 'nan', ''].includes(disp.toLowerCase()) || !disp.toLowerCase().startsWith(pfHead)) {
        disp = `${pf} ${st}`;
      }
      dimChannel.push({
        channel_id: cid, country_code: cc, platform: pf, store_type: st as DimChannel['store_type'],
        display_name: disp, shops: shopSet.size,
      });
    }
    diag.channels = dimChannel.length;
  }
  const regionByCc = new Map<string, DimRegion>();
  const dimRegion: DimRegion[] = ctx.regionBase.map((base) => {
    const copy: DimRegion = { ...base, core_platforms: [...base.core_platforms], default_own_models: { ...base.default_own_models } };
    regionByCc.set(copy.country_code, copy);
    return copy;
  });
  {
    const byCc = new Map<string, IngestRow[]>();
    for (const r of rows) {
      const arr = byCc.get(r.cc);
      if (arr) arr.push(r);
      else byCc.set(r.cc, [r]);
    }
    for (const [cc, g] of byCc.entries()) {
      const region = regionByCc.get(cc);
      if (!region) continue;
      region.enabled = true;
      const curCounts = new Map<string, number>();
      const pfCounts = new Map<string, number>();
      for (const r of g) {
        if (r.currency) curCounts.set(r.currency, (curCounts.get(r.currency) ?? 0) + 1);
        pfCounts.set(r.platform, (pfCounts.get(r.platform) ?? 0) + 1);
      }
      const curMode = [...curCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      region.currency = curMode ? curMode[0] : region.currency;
      const factPlatforms = new Set(pfCounts.keys());
      const core = region.core_platforms.filter((p) => factPlatforms.has(p));
      region.core_platforms = core.length > 0
        ? core
        : [...pfCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p]) => p);
      region.default_platform = region.core_platforms[0] ?? null;
    }
    // 无数据国 enabled 复位（对齐 ingest_real.py:970 "enabled": bool(has)——v3 以内置
    // 全启用为基座，不复位的话无包数据国仍可选，default_own_models 全靠下游存在性校验兜底）
    const hadRows = new Set(byCc.keys());
    for (const region of dimRegion) {
      if (!hadRows.has(region.country_code)) region.enabled = false;
    }
  }

  // 10. 参考价 / 分国档位 / 系列 / 产品维
  const ladders = { ...(ctx.tierLadders ?? {}) } as Record<string, number[]>;
  const refByModel = new Map<string, number>();
  {
    const rrpMed = new Map<string, number[]>();
    const prcMed = new Map<string, number[]>();
    for (const r of rows) {
      if (r.rrpUsd != null) (rrpMed.get(r.modelId) ?? rrpMed.set(r.modelId, []).get(r.modelId)!).push(r.rrpUsd);
      if (r.priceUsd != null) (prcMed.get(r.modelId) ?? prcMed.set(r.modelId, []).get(r.modelId)!).push(r.priceUsd);
    }
    const med = (m: Map<string, number[]>): Map<string, number> => {
      const out = new Map<string, number>();
      for (const [k, arr] of m.entries()) {
        const v = medianOf(arr);
        if (v != null) out.set(k, v);
      }
      return out;
    };
    const rrp = med(rrpMed);
    const prc = med(prcMed);
    const modelIds = new Set([...rrp.keys(), ...prc.keys()]);
    for (const mid of modelIds) {
      const v = rrp.get(mid) ?? prc.get(mid);
      if (v != null) refByModel.set(mid, v);
    }
  }
  const tierByCountryByModel = new Map<string, Record<string, string>>();
  const tierCodeByModel = new Map<string, string>();
  {
    const refCc = new Map<string, number>();
    {
      const rrpMed = new Map<string, number[]>();
      const prcMed = new Map<string, number[]>();
      for (const r of rows) {
        if (r.rrpUsd != null) (rrpMed.get(`${r.modelId}|${r.cc}`) ?? rrpMed.set(`${r.modelId}|${r.cc}`, []).get(`${r.modelId}|${r.cc}`)!).push(r.rrpUsd);
        if (r.priceUsd != null) (prcMed.get(`${r.modelId}|${r.cc}`) ?? prcMed.set(`${r.modelId}|${r.cc}`, []).get(`${r.modelId}|${r.cc}`)!).push(r.priceUsd);
      }
      const med = (m: Map<string, number[]>): Map<string, number> => {
        const out = new Map<string, number>();
        for (const [k, arr] of m.entries()) {
          const v = medianOf(arr);
          if (v != null) out.set(k, v);
        }
        return out;
      };
      const rrp = med(rrpMed);
      const prc = med(prcMed);
      for (const mid of new Set([...rrp.keys(), ...prc.keys()])) {
        const v = rrp.get(mid) ?? prc.get(mid);
        if (v != null) refCc.set(mid, v);
      }
    }
    const modelCcs = new Map<string, Set<string>>();
    const industryOfModel = new Map<string, string>();
    for (const r of rows) {
      (modelCcs.get(r.modelId) ?? modelCcs.set(r.modelId, new Set()).get(r.modelId)!).add(r.cc);
      industryOfModel.set(r.modelId, r.industry);
    }
    for (const [mid, ccs] of modelCcs.entries()) {
      const ind = industryOfModel.get(mid) ?? 'phone';
      const per: Record<string, string> = {};
      const counts = new Map<string, number>();
      for (const cc of [...ccs].sort()) {
        const v = refCc.get(`${mid}|${cc}`);
        const code = tierCodeOf(v ?? null, ind, ladders);
        per[cc] = code;
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
      let glob = '';
      let bestCount = -1;
      for (const [code, n] of counts.entries()) {
        const better = n > bestCount || (n === bestCount && glob !== '' && tierRankRank(code) > tierRankRank(glob));
        if (better) {
          glob = code;
          bestCount = n;
        }
      }
      tierByCountryByModel.set(mid, per);
      tierCodeByModel.set(mid, glob);
    }
  }
  const seriesByModel = new Map<string, string>();
  {
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.modelId)) continue;
      seen.add(r.modelId);
      const k = normkey(r.brand, r.modelName).replace(/ /g, '');
      seriesByModel.set(r.modelId, seriesOfModel(r.brand, r.modelName, r.isOwn, k, ctx.seriesRules));
    }
  }
  const dimProduct: DimProduct[] = [];
  {
    const bySku = new Map<string, IngestRow[]>();
    for (const r of rows) {
      const arr = bySku.get(r.skuId);
      if (arr) arr.push(r);
      else bySku.set(r.skuId, [r]);
    }
    for (const [skuId, g] of bySku.entries()) {
      const head = g[0];
      const mid = head.modelId;
      const ind = head.industry;
      const first = g.map((r) => r.weekId).sort()[0];
      const last = g.map((r) => r.weekId).sort()[g.length - 1];
      const launch = g.map((r) => dateStr(weekWedOf(r.weekId))).sort()[0];
      // cat1/cat2 回填（与 patch_dim_categories ② 同口径；null = 产品级/维度不存在）
      let cat1: string | null = null;
      let cat2: string | null = null;
      if (ind === 'phone') cat1 = normalizeStorage(head.romram !== '—' ? head.romram : '') || null;
      else if (ind === 'tablet') {
        cat2 = normalizeScreen(head.romram);
        cat1 = normalizeStorage(stripScreenPrefix(head.romram)) || null;
      } else if (ind === 'wearable') cat1 = normalizeCaseSize(head.romram);
      dimProduct.push({
        sku_id: skuId,
        model_id: mid,
        industry: ind,
        brand: head.brand,
        is_own: head.isOwn,
        series: seriesByModel.get(mid) ?? head.modelName,
        model_name: head.modelName,
        romram: head.romram,
        color: head.color,
        brand_inline: isBrandInline(head.modelName),
        tier_code: tierCodeByModel.get(mid) ?? '—',
        tier_by_country: tierByCountryByModel.get(mid) ?? {},
        ref_price_usd: refByModel.has(mid) ? Math.round((refByModel.get(mid) as number) * 10) / 10 : null,
        launch_date: launch,
        eol_date: null,
        first_week: first,
        last_week: last,
        countries: [...new Set(g.map((r) => r.cc))].sort(),
        cat1,
        cat2,
      });
    }
    dimProduct.sort((a, b) => a.sku_id.localeCompare(b.sku_id));
    diag.models = new Set(dimProduct.map((p) => p.model_id)).size;
    diag.skus = dimProduct.length;
  }

  // 11. 事实行（与 decodePack 对称：列存本币价、USD 由解码侧除以汇率派生；
  //  这里直接产出展开行，由 data/index.ts 的 encodeFactPackB64 负责列式压缩）
  const sortedRows = [...rows].sort((a, b) => {
    const ka = `${a.cc}|${a.skuId}|${a.weekId}|${a.platform}|${a.storeType}`;
    const kb = `${b.cc}|${b.skuId}|${b.weekId}|${b.platform}|${b.storeType}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const factRows: FactPriceWeekly[] = sortedRows.map((r) => ({
    week_id: r.weekId,
    sku_id: r.skuId,
    country_code: r.cc,
    channel_id: channelIdOf.get(`${r.cc}|${r.platform}|${r.storeType}`) ?? `${r.cc}:${slug(r.platform)}:${r.storeType}`,
    seller: r.shop,
    rrp_local: r.rrpLocal,
    price_local: r.priceLocal,
    fx: round4(r.fx ?? 1),
    rrp_usd: r.rrpUsd,
    price_usd: r.priceUsd,
    discount_display: r.dd,
    discount_actual: r.da,
    bundle: r.bundle,
    installment: r.installment || null,
    promo_text: r.promo || null,
    url: r.url,
    screenshot: r.shot,
    crawled_at: r.crawledAt,
    crawl_status: 'ok',
  }));
  diag.rowsOut = factRows.length;

  return {
    dims: {
      region: dimRegion,
      product: dimProduct,
      channel: dimChannel,
      time: dimTime,
      fx: dimFx,
      promo: ctx.promoRows ?? [],
      benchmark: ctx.benchmarkRows ?? [],
      tier: buildDimTier(ladders),
    },
    factRows,
    diag,
  };
}

// ---------------- 辅助（档位排序 / 时间维 / tier 维） ----------------

const tierRankRank = (code: string): number => {
  const [major, mid] = tierRank(code);
  return major * 100000 + mid;
};

function isoWeekOfDate(d: Date): { year: number; week: number } {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3); // 本周周四
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const fDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - fDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { year: target.getFullYear(), week };
}

function buildDimTier(ladders: Record<string, number[]>): DimTier {
  // DimTier.ladders 语义 = 每产业 tier_code 序（低 → 高，字符串码），labels = 码 → 显示名
  const codeSeq: Record<string, string[]> = {};
  const labels: Record<string, Record<string, string>> = {};
  for (const [ind, lad] of Object.entries(ladders)) {
    const codes: string[] = [];
    let lo = 0;
    for (const hi of lad) {
      codes.push(lo === 0 ? `<${hi}` : `${lo}-${hi}`);
      lo = hi;
    }
    codes.push(`${lad[lad.length - 1]}+`);
    codeSeq[ind] = codes;
    labels[ind] = Object.fromEntries(codes.map((code) => [code, tierLabel(code)]));
  }
  return { ladders: codeSeq, labels } as unknown as DimTier;
}
