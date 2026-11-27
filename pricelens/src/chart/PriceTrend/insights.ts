// ============================================================
// 明细表「分析提示」规则层（2026-11-28，Eason 拍板）：由宽表同源数据（组 /
// 可见时间桶 / 近 4 周环比）按固定阈值本地计算，不调用模型、不自动发起 LLM
// 请求。规则：
//   · crossover（4）：对比品相对基准在首个与末个「双方有价」桶上符号翻转
//   · gapShift（3）：|末价差 − 首价差| ≥ 5 个百分点且未翻转
//   · priceMove（2）：近 4 周环比 |值| ≥ 5%
//   · coverage（1）：可见区间有价期数 < 50%
// 无基准（未选主品 / 分列视图未设临时基准）的组只跑 priceMove 与 coverage。
// 「有价」= 折后价非空且未被异常守卫隔离（与派生计算的可信链同口径）；缺价桶
// 保持缺失，不插值。文案只陈述数值变化，不下因果判断。
// 不含 React/antd，可被单测直接引用。
// ============================================================
import type { Series } from '../../dataModel/types';
import { dedupeSpecText } from './chartModel';
import { baseKeyOf, fmtPct, seriesKeyMatches, type DetailBucket, type TableGroup } from './tableModel';

export type InsightKind = 'crossover' | 'gapShift' | 'priceMove' | 'coverage';

export type InsightStep = '输入' | '筛选' | '公式' | '舍入' | '输出';

export interface Insight {
  /** 稳定 id（kind + seriesKey + otherKey + bucketId），会话内「忽略」以此记账 */
  id: string;
  kind: InsightKind;
  groupKey: string;
  seriesKey: string;
  otherKey?: string;
  /** 一句话结论 */
  title: string;
  figures: Array<{ label: string; value: string }>;
  /** 「定位」要高亮的时间桶 */
  bucketId: string;
  evidence: Array<{ step: InsightStep; text: string }>;
  severity: number;
  /** 组内排序用幅度（同 severity 时 |magnitude| 大者在前） */
  magnitude: number;
  /** 涉及系列的展示名（追问上下文用） */
  seriesLabel: string;
  otherLabel?: string;
}

export interface InsightContext {
  /** 币种代码（USD / RUB …） */
  currencyLabel: string;
  /** 粒度单位（周 / 月 / 季） */
  granularityLabel: string;
  /** 金额格式（缺省 en-US 千分位；宽表传 moneyPlain 同口径） */
  formatMoney?: (v: number) => string;
  /** 时间桶文案（缺省 xLabel；宽表周粒度传「2026W31（05-06）」） */
  bucketLabel?: (b: DetailBucket) => string;
}

/** 阈值（单测钉住：恰好 5pp / 5% 触发，4.9 不触发） */
export const GAP_SHIFT_PP = 0.05;
export const PRICE_MOVE_PCT = 0.05;
export const COVERAGE_MIN_RATIO = 0.5;

const SEVERITY: Record<InsightKind, number> = { crossover: 4, gapShift: 3, priceMove: 2, coverage: 1 };

/** 浮点比较容差：(108−100)/100 − (103−100)/100 在二进制下可能略小于 0.05 */
const EPS = 1e-9;

/** 派生计算可信点：有折后价、有限、非隔离（与 recentFourWeekChange 同口径） */
function pricedAt(s: Series, i: number): number | null {
  const pt = s.points[i];
  if (!pt || pt.price == null || !Number.isFinite(pt.price) || pt.suspect === 'quarantined') return null;
  return pt.price;
}

function nameOf(s: Series): string {
  const base = dedupeSpecText(s.label);
  return s.financeLabel ? `${base}（${s.financeLabel}）` : base;
}

/** 数据状态：周度折后价为平台实抓真实事实；ZA 月度为运营商小册子真实口径
 *  （与 tierRecommend「来源状态」同一表述）。全组同源才写单一状态 */
function dataStatusOf(series: Series[]): string {
  const za = series.filter((s) => s.financeLabel != null).length;
  if (za === 0) return '真实（周度平台实抓）';
  if (za === series.length) return '真实（运营商小册子）';
  return '真实（周度平台实抓 + 运营商小册子）';
}

export function insightId(kind: InsightKind, seriesKey: string, otherKey: string | undefined, bucketId: string): string {
  return `${kind}|${seriesKey}|${otherKey ?? ''}|${bucketId}`;
}

const ROUNDING = (cur: string) => `价格为显示币种（${cur}）整数，原值直接参与计算；百分比四舍五入到 0.1%，负号用 −。`;

export function buildInsights(
  groups: TableGroup[],
  buckets: DetailBucket[],
  fourWeekChanges: ReadonlyMap<string, number | null>,
  ctx: InsightContext,
): Map<string, Insight[]> {
  const out = new Map<string, Insight[]>();
  const n = buckets.length;
  const money = ctx.formatMoney ?? ((v: number) => v.toLocaleString('en-US'));
  const bl = ctx.bucketLabel ?? ((b: DetailBucket) => b.xLabel);
  const cur = ctx.currencyLabel;
  const unit = ctx.granularityLabel;
  if (n === 0) return out;
  const rangeText = `${bl(buckets[0])} 至 ${bl(buckets[n - 1])}，共 ${n} ${unit}`;

  for (const g of groups) {
    const list: Insight[] = [];
    const status = dataStatusOf(g.series);
    const baseKey = baseKeyOf(g);
    const base = baseKey != null ? g.series.find((s) => seriesKeyMatches(s.key, baseKey)) ?? null : null;

    // ---- 成对规则：对比品 vs 基准 ----
    if (base) {
      const baseName = nameOf(base);
      for (const s of g.series) {
        if (s.key === base.key) continue;
        const both: number[] = [];
        for (let i = 0; i < n; i++) {
          const pb = pricedAt(base, i);
          if (pricedAt(s, i) != null && pb != null && pb > 0) both.push(i);
        }
        if (both.length < 2) continue;
        const i0 = both[0];
        const i1 = both[both.length - 1];
        const b0 = pricedAt(base, i0)!;
        const b1 = pricedAt(base, i1)!;
        const c0 = pricedAt(s, i0)!;
        const c1 = pricedAt(s, i1)!;
        const g0 = (c0 - b0) / b0;
        const g1 = (c1 - b1) / b1;
        const name = nameOf(s);
        const input = `${bl(buckets[i0])}：${name} ${money(c0)} ${cur}，${baseName} ${money(b0)} ${cur}；${bl(buckets[i1])}：${name} ${money(c1)} ${cur}，${baseName} ${money(b1)} ${cur}`;
        const filter = `可见区间 ${rangeText}；只取双方均有折后价的 ${both.length} 期（剔除缺价与已隔离异常点，不插值），取其首末两期`;
        const formula = '价差 = (对比折后价 − 基准折后价) ÷ 基准折后价';
        const crossed = (g0 > EPS && g1 < -EPS) || (g0 < -EPS && g1 > EPS);
        const common = {
          groupKey: g.id,
          seriesKey: s.key,
          otherKey: base.key,
          bucketId: buckets[i1].id,
          seriesLabel: name,
          otherLabel: baseName,
        };
        const figs = [
          { label: `起点价差（${bl(buckets[i0])}）`, value: fmtPct(g0) },
          { label: `现价差（${bl(buckets[i1])}）`, value: fmtPct(g1) },
          { label: '数据状态', value: status },
        ];
        if (crossed) {
          const title = `${name} 已${g1 < 0 ? '低于' : '高于'} ${baseName}（${fmtPct(g1)}）`;
          list.push({
            ...common,
            id: insightId('crossover', s.key, base.key, buckets[i1].id),
            kind: 'crossover',
            title,
            figures: figs,
            evidence: [
              { step: '输入', text: input },
              { step: '筛选', text: filter },
              { step: '公式', text: `${formula}；首期与末期价差符号相反即判为「位置翻转」` },
              { step: '舍入', text: ROUNDING(cur) },
              { step: '输出', text: `起点 ${fmtPct(g0)} → 现在 ${fmtPct(g1)}` },
            ],
            severity: SEVERITY.crossover,
            magnitude: Math.abs(g1 - g0),
          });
          continue;
        }
        const delta = Math.abs(g1) - Math.abs(g0);
        if (Math.abs(g1 - g0) + EPS >= GAP_SHIFT_PP) {
          const verb = delta > 0 ? '扩大' : '收窄';
          list.push({
            ...common,
            id: insightId('gapShift', s.key, base.key, buckets[i1].id),
            kind: 'gapShift',
            title: `${name} 相对 ${baseName} 的价差由 ${fmtPct(g0)} ${verb}到 ${fmtPct(g1)}`,
            figures: figs,
            evidence: [
              { step: '输入', text: input },
              { step: '筛选', text: filter },
              { step: '公式', text: `${formula}；变化 = 末期价差 − 首期价差，绝对值 ≥ 5 个百分点触发（未发生位置翻转）` },
              { step: '舍入', text: ROUNDING(cur) },
              { step: '输出', text: `${fmtPct(g0)} → ${fmtPct(g1)}，变化 ${fmtPct(g1 - g0).replace('%', ' 个百分点')}` },
            ],
            severity: SEVERITY.gapShift,
            magnitude: Math.abs(g1 - g0),
          });
        }
      }
    }

    // ---- 单系列规则 ----
    for (const s of g.series) {
      const name = nameOf(s);
      const priced: number[] = [];
      for (let i = 0; i < n; i++) if (pricedAt(s, i) != null) priced.push(i);
      const lastIdx = priced.length > 0 ? priced[priced.length - 1] : n - 1;

      const change = fourWeekChanges.get(s.key) ?? null;
      if (change != null && Number.isFinite(change) && Math.abs(change) + EPS >= PRICE_MOVE_PCT) {
        const verb = change < 0 ? '降价' : '涨价';
        const pctAbs = `${(Math.round(Math.abs(change) * 1000) / 10).toFixed(1)}%`;
        list.push({
          id: insightId('priceMove', s.key, undefined, buckets[lastIdx].id),
          kind: 'priceMove',
          groupKey: g.id,
          seriesKey: s.key,
          title: `${name} 近 4 周${verb} ${pctAbs}`,
          figures: [
            { label: '近4周环比', value: fmtPct(change) },
            { label: '截至', value: bl(buckets[n - 1]) },
            { label: '数据状态', value: status },
          ],
          bucketId: buckets[lastIdx].id,
          evidence: [
            { step: '输入', text: `${name} 的周度折后价序列（与表内「近4周环比」同一上游计算，锚定当前窗口末周 ${bl(buckets[n - 1])}）` },
            { step: '筛选', text: '按周取值（月 / 季视图同样按周）；缺价周与已隔离异常点不进均值' },
            { step: '公式', text: '近 4 周折后价均值 ÷ 上一段 4 周折后价均值 − 1；|值| ≥ 5% 触发' },
            { step: '舍入', text: ROUNDING(cur) },
            { step: '输出', text: `近 4 周环比 ${fmtPct(change)}` },
          ],
          severity: SEVERITY.priceMove,
          magnitude: Math.abs(change),
          seriesLabel: name,
        });
      }

      if (priced.length < n * COVERAGE_MIN_RATIO) {
        const missing = buckets.filter((_, i) => !priced.includes(i));
        const firstMissing = missing[0] ?? buckets[0];
        const sample = missing.slice(0, 4).map(bl).join('、') + (missing.length > 4 ? ` 等 ${missing.length} 期` : '');
        list.push({
          id: insightId('coverage', s.key, undefined, firstMissing.id),
          kind: 'coverage',
          groupKey: g.id,
          seriesKey: s.key,
          title: `${name} 可见区间仅 ${priced.length}/${n} 期有价，结论需谨慎`,
          figures: [
            { label: '有价期数', value: `${priced.length}/${n} ${unit}` },
            { label: '数据状态', value: status },
          ],
          bucketId: firstMissing.id,
          evidence: [
            { step: '输入', text: `${name} 在可见区间的折后价；缺价期：${sample || '无'}` },
            { step: '筛选', text: `可见区间 ${rangeText}；缺价与已隔离异常点记为无价，不插值` },
            { step: '公式', text: '覆盖率 = 有价期数 ÷ 可见期数；低于 50% 触发' },
            { step: '舍入', text: '覆盖率按期数整数计数，不做舍入' },
            { step: '输出', text: `${priced.length}/${n}（${Math.round((priced.length / n) * 100)}%）` },
          ],
          severity: SEVERITY.coverage,
          magnitude: 1 - priced.length / n,
          seriesLabel: name,
        });
      }
    }

    list.sort((a, b) => b.severity - a.severity || Math.abs(b.magnitude) - Math.abs(a.magnitude));
    if (list.length > 0) out.set(g.id, list);
  }
  return out;
}
