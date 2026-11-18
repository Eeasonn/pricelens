// ============================================================
// 内置派生规则表（2026-11-18 配置表化）：系列归组 + 分档阶梯 + 型号别名。
// 与 scripts/ 侧管线逐字对齐（系列规则 = ingest_real.py OWN_SERIES_RULES +
// series_rules.py _RULES；阶梯 = ingest_real.py TIER_LADDERS / tier_code_of /
// tier_rank / tier_label；别名 = data/real/overrides.json model_aliases）。
// 原表里没有这些内容——它们是管线派生字段；数据包 v3（原表模式）在应用内
// 派生时用这里的内置默认，配置表（LPL3.config.seriesRules / tierLadders /
// modelAliases）可按行覆盖，见 state/deriveConfig.ts。
// ============================================================

/** 产业（与 ingest 侧 INDUSTRY_OF_CAT 输出同域） */
export type IngestIndustry = 'phone' | 'tablet' | 'wearable' | 'audio' | 'iot' | 'pc';

// ---------------- 系列归组 ----------------

/** 配置表行（系列规则页签）：pattern 前缀匹配；`re:` 开头 = 正则（锚定型号名开头） */
export interface SeriesRule {
  brand: string;
  pattern: string;
  series: string;
}

/** 我司系列：型号归一键（去空格）前缀 → 系列名（ingest_real.py OWN_SERIES_RULES） */
const OWN_SERIES_RULES: Array<[prefix: string, series: string]> = [
  ['watchultimate', 'WATCH Ultimate'], ['watchgt', 'WATCH GT'], ['watchfit', 'WATCH FIT'],
  ['watchkids', 'WATCH KIDS'], ['watchd', 'WATCH'], ['watch', 'WATCH'], ['band', 'Band'],
  ['freeclip', 'FreeClip'], ['freebuds', 'FreeBuds'], ['freearc', 'FreeArc'],
  ['matepadpromax', 'MatePad Pro'], ['matepadpro', 'MatePad Pro'], ['matepadair', 'MatePad Air'],
  ['matepadmini', 'MatePad mini'], ['matepadse', 'MatePad SE'], ['matepad', 'MatePad 数字系列'], ['matebook', 'MateBook'],
  ['matex', 'Mate'], ['mate', 'Mate'], ['pura', 'Pura'], ['nova', 'nova'],
];

/**
 * 竞品系列：品牌 × 型号名正则 → 系列名（series_rules.py _RULES 逐条 port）。
 * 系列档口径（132 轮定稿）：多系列品牌按产品线成组（系列名不带代际号）、
 * 少系列品牌（苹果）按代际成组；仅数字命名线标「数字系列」；未命中回退型号名本身。
 * 模板 {n}/{w} 引第 1 捕获组（n=原样、w=trim）。
 */
const COMP_SERIES_RULES: Array<[brand: string, source: string, template: string]> = [
  // ---- SAMSUNG：产品线成组，代际留型号层 ----
  ['SAMSUNG', '^(?:Galaxy )?Z ?Fold', 'Galaxy Z'],
  ['SAMSUNG', '^(?:Galaxy )?Z ?Flip', 'Galaxy Z'],
  ['SAMSUNG', '^(?:Galaxy )?S(\\d+)', 'Galaxy S'],
  ['SAMSUNG', '^(?:Galaxy )?A(\\d+)', 'Galaxy A'],
  ['SAMSUNG', '^Galaxy Tab S(\\d+)', 'Galaxy Tab S'],
  ['SAMSUNG', '^Galaxy Tab A(\\d+)', 'Galaxy Tab A'],
  ['SAMSUNG', '^Galaxy Watch Ultra', 'Galaxy Watch Ultra'],
  ['SAMSUNG', '^Galaxy Watch (\\d+)', 'Galaxy Watch'],
  ['SAMSUNG', '^Galaxy FIT (\\d+)', 'Galaxy Fit'],
  ['SAMSUNG', '^Galaxy Buds', 'Galaxy Buds'],
  // ---- APPLE：系列少，按代际 ----
  ['APPLE', '^iPhone (\\d+)', 'iPhone {n}'],
  ['APPLE', '^iPhone (\\w+)', 'iPhone {w}'],
  ['APPLE', '^iPad Air', 'iPad Air'],
  ['APPLE', '^iPad Mini', 'iPad Mini'],
  ['APPLE', '^iPad Pro', 'iPad Pro'],
  ['APPLE', '^iPad', 'iPad'],
  ['APPLE', '^Watch SERIES (\\d+)', 'Apple Watch Series {n}'],
  ['APPLE', '^Watch SE', 'Apple Watch SE'],
  ['APPLE', '^Watch Ultra', 'Apple Watch Ultra'],
  ['APPLE', '^AirPods Pro', 'AirPods Pro'],
  ['APPLE', '^AirPods (\\d+)', 'AirPods {n}'],
  ['APPLE', '^MacBook Air', 'MacBook Air'],
  ['APPLE', '^MacBook Neo', 'MacBook Neo'],
  ['APPLE', '^MacBook Pro', 'MacBook Pro'],
  // ---- XIAOMI：数字线/Note 线/字母线分开 ----
  ['XIAOMI', '^(\\d+)T', 'Xiaomi 数字系列'],
  ['XIAOMI', '^(\\d+)', 'Xiaomi 数字系列'],
  ['XIAOMI', '^POCO Pad', 'POCO Pad'],
  ['XIAOMI', '^Poco ([FXMC])', 'POCO {w}'],
  ['XIAOMI', '^Poco (\\w+)', 'POCO {w}'],
  ['XIAOMI', '^Redmi Note(\\d+)', 'Redmi Note'],
  ['XIAOMI', '^Redmi ([AC])(\\d*)', 'Redmi {w}'],
  ['XIAOMI', '^Redmi (\\d+)', 'Redmi 数字系列'],
  ['XIAOMI', '^Redmi Buds', 'Redmi Buds'],
  ['XIAOMI', '^Redmi Watch', 'Redmi Watch'],
  ['XIAOMI', '^Redmi Pad', 'Redmi Pad'],
  ['XIAOMI', '^Pad (\\d+)', 'Xiaomi Pad 数字系列'],
  ['XIAOMI', '^Pad Mini', 'Xiaomi Pad Mini'],
  ['XIAOMI', '^Band (\\d+)', 'Xiaomi Band'],
  ['XIAOMI', '^Watch S(\\d+)', 'Xiaomi Watch S'],
  ['XIAOMI', '^Watch (\\d+)', 'Xiaomi Watch'],
  // ---- HONOR：Magic（含折叠）/数字系列/X ----
  ['HONOR', '^Magic V', 'HONOR Magic'],
  ['HONOR', '^Magic(\\d+)', 'HONOR Magic'],
  ['HONOR', '^MagicBook', 'HONOR MagicBook'],
  ['HONOR', '^Magic Pad', 'HONOR Magic Pad'],
  ['HONOR', '^X(\\d+)', 'HONOR X'],
  ['HONOR', '^Pad V', 'HONOR Pad V'],
  ['HONOR', '^Pad X(\\d+)', 'HONOR Pad X'],
  ['HONOR', '^Pad (\\d+)', 'HONOR Pad 数字系列'],
  ['HONOR', '^(\\d+)', 'HONOR 数字系列'],
  ['HONOR', '^Watch (\\d+)', 'HONOR Watch'],
  // ---- OPPO / VIVO：产品线成组 ----
  ['OPPO', '^A(\\d+)', 'OPPO A'],
  ['OPPO', '^Find N', 'OPPO Find N'],
  ['OPPO', '^Reno', 'OPPO Reno'],
  ['OPPO', '^Pad', 'OPPO Pad'],
  ['VIVO', '^V(\\d+)', 'vivo V'],
  ['VIVO', '^X Fold', 'vivo X'],
  ['VIVO', '^X(\\d+)', 'vivo X'],
  ['VIVO', '^Y(\\d+)', 'vivo Y'],
  // ---- LENOVO（含 moto）----
  ['LENOVO', '^Edge', 'Motorola Edge'],
  ['LENOVO', '^Moto G', 'Motorola Moto G'],
  ['LENOVO', '^Razr', 'Motorola Razr'],
  ['LENOVO', '^Idea ?Tab', 'Lenovo Idea Tab'],
  ['LENOVO', '^Yoga Tab', 'Lenovo Yoga Tab'],
  ['LENOVO', '^Tab', 'Lenovo Tab'],
  ['LENOVO', '^Idea ?Pad', 'Lenovo IdeaPad'],
  ['LENOVO', '^Yoga', 'Lenovo Yoga'],
  // ---- ASUS / HP ----
  ['ASUS', '^Vivo ?Book', 'ASUS VivoBook'],
  ['ASUS', '^Zen ?Book', 'ASUS ZenBook'],
  ['ASUS', '^ExpertBook', 'ASUS ExpertBook'],
  ['HP', '^Pavilion', 'HP Pavilion'],
  ['HP', '^EliteBook', 'HP EliteBook'],
  ['HP', '^Notebook', 'HP Notebook'],
  ['HP', '^14', 'HP 14'],
  // ---- 穿戴：GARMIN / AMAZFIT / COROS / WHOOP ----
  ['GARMIN', '^Fenix (\\d+)', 'Garmin Fenix'],
  ['GARMIN', '^Forerunner (\\d+)', 'Garmin Forerunner'],
  ['GARMIN', '^Instinct', 'Garmin Instinct'],
  ['GARMIN', '^Venu', 'Garmin Venu'],
  ['GARMIN', '^Vivoactive', 'Garmin Vivoactive'],
  ['AMAZFIT', '^Active', 'Amazfit Active'],
  ['AMAZFIT', '^Bip', 'Amazfit Bip'],
  ['AMAZFIT', '^T-Rex', 'Amazfit T-Rex'],
  ['AMAZFIT', '^Balance', 'Amazfit Balance'],
  ['COROS', '^(\\w+)', 'Coros {w}'],
  ['WHOOP', '^(\\w+)', 'Whoop {w}'],
  // ---- TRANSSION（TECNO/Infinix 系）----
  ['TRANSSION', '^KL8 SPARK', 'TECNO Spark'],
  ['TRANSSION', '^[Ss]park', 'TECNO Spark'],
  ['TRANSSION', '^Camon', 'TECNO Camon'],
  ['TRANSSION', '^POVA', 'TECNO POVA'],
  ['INFINIX', '^XPAD', 'Infinix XPAD'],
  // ---- 音频 ----
  ['SONY', '^LinkBuds', 'Sony LinkBuds'],
  ['SONY', '^WF-', 'Sony WF'],
  ['JBL', '^Live Beam', 'JBL Live Beam'],
  ['JBL', '^Soundgear', 'JBL Soundgear'],
  ['JBL', '^Tune Beam', 'JBL Tune Beam'],
  ['JBL', '^WAVE BEAM', 'JBL Wave Beam'],
  ['SOUNDCORE', '^AeroClip', 'Soundcore AeroClip'],
  ['SOUNDCORE', '^AeroFit', 'Soundcore AeroFit'],
  ['SOUNDCORE', '^Liberty', 'Soundcore Liberty'],
  ['SOUNDCORE', '^([PR])', 'Soundcore {w}'],
  ['SHOKZ', '^Open Dots', 'Shokz Open Dots'],
  ['SHOKZ', '^OpenFit', 'Shokz OpenFit'],
  ['BOSE', '^QC', 'Bose QC'],
  // ---- 路由器（IoT）----
  ['TP-LINK', '^Archer', 'TP-Link Archer'],
  ['TP-LINK', '^Deco', 'TP-Link Deco'],
  ['TP-LINK', '^X50', 'TP-Link Deco'],
  ['TP-LINK', '^M4', 'TP-Link Deco'],
  ['TP-LINK', '^RE\\d', 'TP-Link RE'],
  ['TP-LINK', '^EX\\d', 'TP-Link EX'],
  ['TENDA', '^Nova', 'Tenda Nova'],
  ['TENDA', '^T[XY]', 'Tenda TX'],
  ['TENDA', '^AC', 'Tenda AC'],
  ['CUDY', '^(WR|BE|AX)', 'Cudy {w}'],
];

const compRulesCompiled = COMP_SERIES_RULES.map(([brand, source, template]) => ({
  brand,
  rx: new RegExp(source, 'i'),
  template,
}));

const fillTemplate = (template: string, capture: string | undefined): string =>
  template.replace(/\{([nw])\}/g, (_, kind: string) => {
    if (kind === 'n') return capture ?? '';
    return (capture ?? '').trim();
  });

/** 自定义规则（配置表）解析：`re:` 开头 = 正则；否则前缀。编译失败返回 null（防御坏行） */
export function compileSeriesRule(rule: SeriesRule): { brand: string; rx: RegExp | null; prefix: string | null; series: string } | null {
  const brand = rule.brand.trim();
  const series = rule.series.trim();
  if (!brand || !series || !rule.pattern.trim()) return null;
  const pattern = rule.pattern.trim();
  if (pattern.toLowerCase().startsWith('re:')) {
    try {
      return { brand, rx: new RegExp(pattern.slice(3), 'i'), prefix: null, series };
    } catch {
      return null;
    }
  }
  return { brand, rx: null, prefix: pattern, series };
}

/**
 * 型号 → 系列名。顺序：自定义规则（配置表，readSeriesRules 传入；命中即返回）→
 * 我司前缀表（is_own，归一键去空格前缀）→ 竞品正则表 → 兜底（我司=型号名首词、
 * 竞品=型号名本身）。`ownNormKey` = normalizeModelKey(model_name).replace(/ /g,'')。
 */
export function seriesOfModel(
  brand: string,
  modelName: string,
  isOwn: boolean,
  ownNormKey: string,
  customRules: SeriesRule[] | null,
): string {
  if (customRules) {
    for (const rule of customRules) {
      const compiled = compileSeriesRule(rule);
      if (!compiled || compiled.brand.toLowerCase() !== brand.toLowerCase()) continue;
      if (compiled.rx != null) {
        const m = modelName.match(compiled.rx);
        if (m) return fillTemplate(compiled.series, m[1]);
      } else if (compiled.prefix != null) {
        const p = compiled.prefix;
        if (modelName.toLowerCase().startsWith(p.toLowerCase()) || ownNormKey.startsWith(p.toLowerCase().replace(/\s+/g, ''))) {
          return compiled.series;
        }
      }
    }
  }
  if (isOwn) {
    const k = ownNormKey;
    for (const [prefix, name] of OWN_SERIES_RULES) {
      if (k.startsWith(prefix)) return name;
    }
    return (modelName.split(/\s+/)[0] || '其他');
  }
  for (const { brand: b, rx, template } of compRulesCompiled) {
    if (b !== brand) continue;
    const m = modelName.match(rx);
    if (m) return fillTemplate(template, m[1]);
  }
  return modelName;
}

// ---------------- 分档阶梯 ----------------

/** 产业价格阶梯（USD 分位点；ingest_real.py TIER_LADDERS） */
export const BUILTIN_TIER_LADDERS: Record<IngestIndustry, number[]> = {
  phone: [200, 400, 600, 800, 1000],
  tablet: [150, 250, 350, 500, 800],
  wearable: [25, 75, 150, 300, 400],
  audio: [50, 100, 200],
  iot: [50, 100, 200, 400],
  pc: [500, 800, 1200],
};

/** 参考价 → 档位码（<200 / 200-400 / … / 1000+）；无价按 0 落最低档 */
export function tierCodeOf(priceUsd: number | null, industry: string, ladders?: Record<string, number[]>): string {
  const lad = ladders?.[industry] ?? BUILTIN_TIER_LADDERS[industry as IngestIndustry];
  if (!lad || lad.length === 0) return '—';
  const price = priceUsd != null && Number.isFinite(priceUsd) ? priceUsd : 0;
  let lo = 0;
  for (const hi of lad) {
    if (price < hi) return lo === 0 ? `<${hi}` : `${lo}-${hi}`;
    lo = hi;
  }
  return `${lad[lad.length - 1]}+`;
}

/** 档位排序键（tier_rank；分国取最低档时的比较用） */
export function tierRank(code: string): [number, number, number] {
  const lt = code.match(/^<(\d+)/);
  if (lt) return [0, Number(lt[1]), 0];
  const span = code.match(/^(\d+)-(\d+)/);
  if (span) return [0, Number(span[1]), 1];
  const plus = code.match(/^(\d+)\+/);
  return [1, plus ? Number(plus[1]) : 0, 0];
}

/** 档位显示名（tier_label：入门 · <$200 / $200–400 / 旗舰 · $1000+） */
export function tierLabel(code: string): string {
  const lt = code.match(/^<(\d+)/);
  if (lt) return `入门 · <$${Number(lt[1])}`;
  const span = code.match(/^(\d+)-(\d+)/);
  if (span) return `$${Number(span[1]).toLocaleString('en-US')}–$${Number(span[2]).toLocaleString('en-US')}`;
  const plus = code.match(/^(\d+)\+/);
  return plus ? `旗舰 · $${Number(plus[1])}+` : code;
}

// ---------------- 型号别名（内置） ----------------

/** 品牌|归一键 → 目标归一键（overrides.json model_aliases port；配置表可增补） */
export const BUILTIN_MODEL_ALIASES: Record<string, string> = {
  'HUAWEI|matepad se 11': 'matepad se',
};
