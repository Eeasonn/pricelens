// ============================================================
// 原表归一文本工具（2026-11-18 配置表化轮新建）：常量表与归一函数，
// 与 scripts/ingest_real.py 逐字对齐（常量区 L46-144、fold/slug/normkey
// L138-226、parse_romram L312-385、to_week_wed L388、parse_pct L287、
// cc_of L443）。数据包 v3（原表模式）在应用内归一时使用；PSI 销量侧
// 归一在 salesIngest.ts（两侧勿漂移）。
// ============================================================

/** NFKD 折叠并去掉组合音标（vívoactive → vivoactive） */
export function fold(s: unknown): string {
  const str = s == null ? '' : String(s);
  return str.normalize('NFKD').replace(/\p{M}/gu, '');
}

/** id slug：非 [0-9a-z] 归 -、收边、叠 - 压平；空回 'x' */
export function slug(s: unknown): string {
  const out = fold(s)
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return out || 'x';
}

export const BRAND_TOKENS: Record<string, string[]> = {
  APPLE: ['apple'], SAMSUNG: ['samsung', 'galaxy', '三星'], XIAOMI: ['xiaomi', 'poco', '小米'],
  HONOR: ['honor', '荣耀'], HUAWEI: ['huawei', '华为'], GARMIN: ['garmin'], AMAZFIT: ['amazfit'],
  SOUNDCORE: ['soundcore', 'anker'], SHOKZ: ['shokz'], SONY: ['sony'], JBL: ['jbl'],
  AIMOTO: ['aimoto'],
  BOSE: ['bose'], COROS: ['coros', '高驰'], LENOVO: ['lenovo', 'motorola', 'smartfon'],
  OPPO: ['oppo'], REALME: ['realme'], NOTHING: ['nothing'], FITBIT: ['fitbit'],
  WHOOP: ['whoop'], ASUS: ['asus'], HP: ['hp'], INFINIX: ['infinix'],
  TRANSSION: ['transsion'], VIVO: ['vivo'], ZTE: ['zte'], 'TP-LINK': ['tp-link', 'tplink'],
  TENDA: ['tenda'], CUDY: ['cudy'], MERCURY: ['mercury'],
};

const STRIP_TOKENS = new Set([
  '5g', '4g', 'wifi', 'lte', 'dual', 'sim', 'esim', '版', '代', '系列',
  'series', 'collection', 'smartfon', 'tablet', 'new', 'earbuds', 'buds',
  'smart', 'mi', 'gb', 'tb', 'gen', 'th', 'rd', 'st', 'nd',
  'szary', 'rysik', 'klawiatura', 'matowy', 'ekran', 'matt', '英寸', '寸',
]);

/** 型号归一键（token 串）：折音、去品牌词/连接词/年份、字母数字边界切分 */
export function normkey(brand: string, name: unknown): string {
  let s = fold(name).toLowerCase();
  s = s.replace(/\b(5g|4g|lte|wi-?fi\d?|esim|e-sim|dual\s*sim)\b/g, ' ');
  s = s.replace(/(\d)\.(\d)/g, '$1§$2'); // 保护小数点（11.5 / 12.2）
  s = s.replace(/([\u4e00-\u9fff]+)/g, ' $1 ');
  s = s.replace(/[（）()[\]{}“”"'‘’·，,。.:：;；！!？?\\|/／+\-–—]+/g, ' ');
  s = s.replace(/([a-z]+)(\d)/g, '$1 $2');
  s = s.replace(/(\d)([a-z]+)/g, '$1 $2');
  s = s.replace(/§/g, '.');
  const bts = new Set(BRAND_TOKENS[brand] ?? []);
  const out: string[] = [];
  for (const raw of s.split(/\s+/)) {
    const t = raw.replace(/^[.-]+|[.-]+$/g, '');
    if (!t || bts.has(t) || STRIP_TOKENS.has(t)) continue;
    if (/^(19|20)\d\d$/.test(t)) continue;
    out.push(t);
  }
  return out.join(' ');
}

/** 品类列 → 产业（中英文同收） */
type IngestIndustryStrict = 'phone' | 'tablet' | 'wearable' | 'audio' | 'iot' | 'pc';

// ---------------- C3 解析字典（2026-11-18 Eason 拍板显性化）----------------
// 语义与业务规则页签不同：字典是**解析器出厂词汇**——空表 = 出厂默认兜底
//（业务规则空表 = 无规则诚实降级）；有行 = 全量替换。配置来源 = 配置表
// 四页签（国家别名/平台别名/店铺类型别名/品类映射），state/deriveDictionaries.ts
// 读时合并注入引擎（OfferIngestCtx.dictionaries / normalizeCountryCode 第 4 参）。

/** C3 四字典形态（全部 alias/value 映射） */
export interface IngestDictionaries {
  /** 国家别名：原文（含中英文/简称）→ 两位国家码（offer 侧 ccOf 与 PSI 侧共用） */
  countryCodes: Record<string, string>;
  /** 平台别名：归并键 → 平台名（mvm → Mvideo） */
  platformAliases: Record<string, string>;
  /** 店铺类型别名：原文 → 1P/3P/独立站 */
  storeAliases: Record<string, string>;
  /** 品类映射：品类原文 → 产业 */
  industryOfCat: Record<string, IngestIndustryStrict>;
}

/** 出厂默认：offer 侧 COUNTRY_CODES ∪ PSI 侧 COUNTRY_NAME_ALIASES（salesIngest
 *  独有的 turkiye/saudi/britain/uk 等一并收编——两侧默认同源，配置替换同时生效） */
export const DEFAULT_COUNTRY_ALIASES: Record<string, string> = {
  'saudi arabia': 'SA', russia: 'RU', mexico: 'MX', malaysia: 'MY',
  philippines: 'PH', thailand: 'TH', singapore: 'SG', indonesia: 'ID',
  'united arab emirates': 'AE', ae: 'AE', germany: 'DE', vietnam: 'VN',
  turkey: 'TR', poland: 'PL', spain: 'ES', italy: 'IT', france: 'FR',
  'united kingdom': 'GB', romania: 'RO', 'south africa': 'ZA', japan: 'JP',
  brazil: 'BR', peru: 'PE', argentina: 'AR', colombia: 'CO',
  bulgaria: 'BG', chile: 'CL', kuwait: 'KW', egypt: 'EG', 'hong kong': 'HK',
  沙特: 'SA', 'r国': 'RU', 阿联酋: 'AE', 波兰: 'PL', 德国: 'DE',
  菲律宾: 'PH', 泰国: 'TH', 马来西亚: 'MY', 马来: 'MY', 印尼: 'ID',
  墨西哥: 'MX', 巴西: 'BR', 保加利亚: 'BG', 智利: 'CL', 秘鲁: 'PE',
  哥伦比亚: 'CO', 阿根廷: 'AR', 南非: 'ZA', 土耳其: 'TR', 越南: 'VN',
  新加坡: 'SG', 日本: 'JP',
  // PSI 侧独有别名（收编进并集）
  turkiye: 'TR', uk: 'GB', britain: 'GB', saudi: 'SA',
};

export const DEFAULT_PLATFORM_ALIASES: Record<string, string> = {
  mercadolibre: 'Mercado Libre', 'amazon méxico': 'Amazon', 'amazon mexico': 'Amazon',
  mercadolivre: 'Mercado Libre', 'amazon.sa': 'Amazon', 'amazon tr': 'Amazon',
  'amazon.de': 'Amazon', 'amazon.com.tr': 'Amazon', 'mediamarkt tr': 'MediaMarkt',
  'vatan bilgisayar': 'Vatan',
  'm.video': 'Mvideo', 'm video': 'Mvideo', mvm: 'Mvideo',
};

export const DEFAULT_STORE_ALIASES: Record<string, string> = {
  平台型零售商: '1P', 平台第三方卖家: '3P', marketplace: '3P', 跨境3p: '3P', '3p_international': '3P', 官网: '独立站',
};

export const DEFAULT_INDUSTRY_OF_CAT: Record<string, IngestIndustryStrict> = {
  smartphone: 'phone', tablets: 'tablet', tablet: 'tablet', wearables: 'wearable', wearable: 'wearable',
  smartphones: 'phone', phone: 'phone', earbud: 'audio', earbuds: 'audio', iot: 'iot',
  pc: 'pc', 'personal computer': 'pc', 手机: 'phone', 平板: 'tablet', 穿戴: 'wearable', 音频: 'audio',
};

/** 出厂默认整套（deriveDictionaries 空表兜底 / Python 侧对齐参照） */
export const DEFAULT_DICTIONARIES: IngestDictionaries = {
  countryCodes: DEFAULT_COUNTRY_ALIASES,
  platformAliases: DEFAULT_PLATFORM_ALIASES,
  storeAliases: DEFAULT_STORE_ALIASES,
  industryOfCat: DEFAULT_INDUSTRY_OF_CAT,
};

export function industryOfCat(raw: unknown, dict?: Record<string, IngestIndustryStrict>): IngestIndustryStrict | null {
  const key = fold(raw).trim().toLowerCase();
  return (dict ?? DEFAULT_INDUSTRY_OF_CAT)[key] ?? null;
}

/** 平台名义归并（源表两名义互串，如 MVM/M.Video → Mvideo） */
export function platformAliasOf(name: string, dict?: Record<string, string>): string {
  return (dict ?? DEFAULT_PLATFORM_ALIASES)[fold(name).toLowerCase()] ?? name;
}

/** 店铺类型归一（未知值原样返回，由调用方钳制到 1P/3P/独立站） */
export function storeAliasOf(name: string, dict?: Record<string, string>): string {
  return (dict ?? DEFAULT_STORE_ALIASES)[name] ?? name;
}

/** 国家/地区原文 → 国家码（含中文简称与英文别名；offer 侧入口） */
export function ccOf(name: unknown, dict?: Record<string, string>): string | null {
  return (dict ?? DEFAULT_COUNTRY_ALIASES)[fold(name).trim().toLowerCase()] ?? null;
}

/** 折扣率单元格 → 负小数（-0.15）；「-15%」「15%」「-0.15」全收 */
export function parsePct(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') {
    return v >= -1 && v <= 0 ? v : v > 0 && v <= 1 ? -v : null;
  }
  const s = String(v).replace(/−/g, '-').trim();
  const m = s.match(/^-?\s*(\d+(?:\.\d+)?)\s*%$/);
  return m ? -Math.abs(Number(m[1])) / 100 : null;
}

/** 规格串尾部重复单位（"12+256 GB GB"）不是颜色 → — */
export function unitFreeColor(c: unknown): string {
  const str = String(c ?? '').trim();
  return /^(gb|tb|g|t)$/i.test(str) ? '—' : titleColor(str);
}

/** 颜色文案规整：压空白、空/纯符号 → —、首字母大写 */
export function titleColor(c: unknown): string {
  const str = String(c ?? '').replace(/\s+/g, ' ').trim();
  if (!str || str === '-' || str === '\\' || str === '/') return '—';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** 单元格 → Date（Excel 序列数 / ISO 串 / 常见格式；失败 null） */
export function parseDatetimeCell(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    // Excel 序列日（1899-12-30 起算），带小数 = 时间
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const noTz = s.replace(/\s*\+\d{2}:?\d{2}$/, '');
  const fmts = [
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/,
    /^(\d{4})-(\d{2})-(\d{2})$/,
  ];
  for (const rx of fmts) {
    const m = noTz.match(rx);
    if (m) {
      const [, y, mo, dd, hh = '0', mi = '0', ss = '0'] = m;
      return new Date(Number(y), Number(mo) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
    }
  }
  const native = new Date(s);
  return isNaN(native.getTime()) ? null : native;
}

/** 日期 → 所在 ISO 周的周三日期 */
export function toWeekWed(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // 周一=0 … 周日=6
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2);
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 周期单元格 → [week_id(YYYYWW), 周三日期YYYY-MM-DD]；已是 YYYYWW/YYYY0WW 原样收 */
export function weekOf(v: unknown): [string, string] | null {
  const s = String(v ?? '').trim();
  if (/^\d{7}$/.test(s) && s.charAt(4) === '0') {
    const y = s.slice(0, 4);
    const w = Number(s.slice(5));
    if (w >= 1 && w <= 53) return [`${y}${pad2(w)}`, ''];
  }
  if (/^\d{6}$/.test(s)) {
    const w = Number(s.slice(4));
    if (w >= 1 && w <= 53) return [s, ''];
  }
  const d = parseDatetimeCell(v);
  if (!d) return null;
  const w = toWeekWed(d);
  const iso = isoWeekOf(w);
  return [`${iso.year}${pad2(iso.week)}`, `${w.getFullYear()}-${pad2(w.getMonth() + 1)}-${pad2(w.getDate())}`];
}

/** ISO 周号（周一属于哪一周以周四所在年为准） */
export function isoWeekOf(d: Date): { year: number; week: number } {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3); // 移到本周周四
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const fDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - fDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { year: target.getFullYear(), week };
}

// ---------------- 双语表头归一（normalize_source_columns） ----------------

/** 双语表头取中文段 + 剥括注（时间周期\nperiod → 时间周期；汇率(1USD=本币) → 汇率） */
export function baseHeader(col: string): string {
  let base = col.replace(/\\n/g, '\n').split('\n', 1)[0].trim();
  base = base.replace(/（[^）]*）|\([^)]*\)/g, '').trim();
  return base;
}

const COLUMN_ALIASES: Array<[canonical: string, candidates: string[]]> = [
  ['品类', ['类别', '品类名称']],
  ['型号', ['商品型号', '型号名称']],
  ['型号规格', ['规格', '商品规格']],
  ['国家/地区', ['国家地区', '国家', '地区']],
  ['平台', ['电商平台', '渠道平台']],
  ['店铺类型', ['渠道类型']],
  ['店铺名称', ['卖家名称']],
  ['显示店铺名称', ['展示店铺名称']],
  ['时间周期', ['周期', '日期']],
  ['采集时间', ['抓取时间', '采集日期']],
  ['是否组合销售', ['是否组合']],
  ['网址链接', ['网址']],
  ['截图命名', ['截图']],
];

/**
 * 行数组（原样 JSON 行）列名归一：返回「原键 → 规范中文名」映射 + 缺失的必备列清单。
 * 规格拆列形态（Category1/Category2/info/tech_date）同层收：映射进对应中文语义列。
 */
export function mapSourceColumns(headerKeys: string[]): { map: Record<string, string>; missing: string[] } {
  const baseOf = new Map<string, string>();
  for (const key of headerKeys) baseOf.set(key, baseHeader(key));
  const present = new Set([...baseOf.values()].filter(Boolean));
  // 规格拆列形态等价替换：Category1/2/info/tech_date 视为已拆列输入
  const specPresent = ['Category1', 'Category2', 'info', 'tech_date'].some((c) => present.has(c));
  const map: Record<string, string> = {};
  for (const [key, base] of baseOf.entries()) {
    if (!base) continue;
    map[key] = base;
  }
  for (const [canonical, candidates] of COLUMN_ALIASES) {
    if (present.has(canonical)) continue;
    const source = candidates.find((c) => present.has(c));
    if (!source) continue;
    for (const [key, base] of baseOf.entries()) {
      if (base === source) map[key] = canonical;
    }
  }
  if (specPresent) {
    for (const [key, base] of baseOf.entries()) {
      if (base === 'tech_date') map[key] = '时间周期';
      if (base === 'Category1') map[key] = 'Category1';
      if (base === 'Category2') map[key] = 'Category2';
      if (base === 'info') map[key] = 'info';
    }
  }
  // 必备列（软硬两级：核心 9 列硬必备；显示店铺/截图/采集时间等缺省补默认）
  const have = (name: string): boolean => [...baseOf.values()].includes(name);
  const missing: string[] = [];
  for (const name of ['时间周期', '品类', '品牌', '型号', '平台', '国家/地区', '店铺类型', '货币', '汇率']) {
    if (!have(name) && !(name === '时间周期' && specPresent)) missing.push(name);
  }
  return { map, missing };
}

// ---------------- 型号正名（品牌内联判定） ----------------

const SERIES_NAME_MARKERS = [
  // Apple 产品线（品牌词 apple 之外的名字级特征）
  'iphone', 'ipad', 'macbook', 'mac ', 'airpods',
  // Samsung / Xiaomi / Honor 产品线
  'galaxy', 'redmi', 'poco', 'magic',
  // 华为系（自有产品名自带身份）
  'mate', 'pura', 'nova', 'enjoy', 'freebuds', 'freearc', 'freeclip',
  'watch gt', 'watch fit', 'watch ultimate', 'watch kids', 'watch d',
  // PC 特征线
  'thinkpad', 'ideapad', 'yoga',
];

const ALL_NAME_MARKERS = [
  ...Object.values(BRAND_TOKENS).flat(),
  ...SERIES_NAME_MARKERS,
].sort((a, b) => b.length - a.length);

/** 型号名不含品牌词/系列特征词 = 名字本身认不出品牌 → 药丸内联品牌词 */
export function isBrandInline(modelName: string): boolean {
  const t = fold(modelName).toLowerCase();
  if (!t) return true;
  return !ALL_NAME_MARKERS.some((tok) => t.includes(tok));
}
