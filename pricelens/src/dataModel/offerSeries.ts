// ============================================================
// 系列归组与分档：规则执行引擎（2026-11-18 二轮：Eason「不要在系统前端做任何
// 内置，都要显性化的配置」——**规则数据零内置**，全部来自配置表
// （LPL3.config.seriesRules / tierLadders / modelAliases，配置 xlsx 五页签）。
// 本文件只保留：类型、模板渲染（{n}/{w}）、档位码计算、兜底语义
// （我司未命中=型号名首词、竞品未命中=型号名本身、无阶梯=无档位 '—'）。
// 全量规则清单在交接包配置表（原 ingest_real.py OWN_SERIES_RULES +
// series_rules.py _RULES + TIER_LADDERS + overrides.json 的 1:1 展开）。
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

/** 模板渲染：{n}=第 1 捕获组原样、{w}=trim；配置表系列名同样支持 */
export const fillTemplate = (template: string, capture: string | undefined): string =>
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
 * 型号 → 系列名（纯配置驱动）。顺序：配置规则逐条试（命中即返回，series 支持
 * {n}/{w} 模板引用第 1 捕获组）→ 兜底（我司 = 型号名首词、竞品 = 型号名本身）。
 * 无配置规则 = 全部兜底（显性语义：没配置就没归组）。
 * `ownNormKey` = normkey(brand, model_name).replace(/ /g,'')（前缀匹配归一键形态）。
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
  if (isOwn) return modelName.split(/\s+/)[0] || '其他';
  return modelName;
}

// ---------------- 分档阶梯 ----------------

/** 参考价 → 档位码（<200 / 200-400 / … / 1000+）；无价按 0 落最低档。
 *  阶梯完全来自配置表（tierLadders）：**该产业无配置 = 无档位 '—'**（显性语义）。 */
export function tierCodeOf(priceUsd: number | null, industry: string, ladders?: Record<string, number[]>): string {
  const lad = ladders?.[industry];
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

