// ============================================================
// 「价差与明细」宽表纯计算层（第一百二十三轮）：组/时间列类型、按卡归组
// （groupsOfCards，图顶图例带与宽表共用）、价差基准、单元格文案。宽表按主分析
// 组分块（组 = 选择产品浮窗里的一张卡，保持卡序），每组价差 = 本组各对比产品
// 相对本组主分析产品；无主品的组不出价差。
// 不含 React/antd，可被金测直接引用。
// ============================================================
import type { Granularity, Series, SeriesPoint } from '../../dataModel/types';
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';
import { offerList } from './chartModel';

/** 图上可见时间段的一桶 = 宽表一列 */
export interface DetailBucket {
  id: string;
  xLabel: string; // 周=周三 MM-DD / 月=YYYYMM / 季=YYYYQn
  anchorDate: string; // ISO 日期
}

/** 宽表一个分块 = 一张主分析卡（图上一张面板） */
export interface TableGroup {
  id: string; // 卡 id（与分离面板同 key）
  mainKey: string | null; // 主分析产品的系列 key；未选主品（空对）为 null
  series: Series[]; // 主分析产品在前 + 对比产品（卡内顺序；含被图例屏蔽者）
}

/** 图例带组块（第一百二十三轮④）：与 TableGroup 同构 + 组序号——
 *  图顶图例带按主分析组分块，块标题 = 多组时的「第 N 组」 */
export interface LegendGroup extends TableGroup {
  ordinal: number; // 1 起 = 选择浮窗卡序（与宽表 groupOrdinal 同源）
}

/** 按选择浮窗卡序把系列归组（第一百二十三轮④⑤，图例带与宽表共用的取数口）：
 *  每卡一组（id = 卡 id），组内 = 主品在前 + 对比按卡内序；所选系列在 series
 *  列表里无数据时跳过该条目；同一对比被多卡引用时各组各出一条（组内语义完整）。 */
export function groupsOfCards(cards: MainProduct[], series: Series[]): LegendGroup[] {
  const byKey = new Map(series.map((s) => [s.key, s]));
  return cards.map((card, i) => {
    const out: Series[] = [];
    const seen = new Set<string>();
    const pick = (sel: ProductSelection): void => {
      const hit = byKey.get(seriesKeyOf(sel));
      if (hit && !seen.has(hit.key)) {
        seen.add(hit.key);
        out.push(hit);
      }
    };
    if (card.main) pick(card.main);
    card.compares.forEach(pick);
    return { id: card.id, ordinal: i + 1, mainKey: card.main ? seriesKeyOf(card.main) : null, series: out };
  });
}

/** 勾选组 → 系列 key（与 buildSeries 的 `${modelId}__${配置去空格}` 同构） */
export function seriesKeyOf(sel: { modelId: string; romram: string }): string {
  return `${sel.modelId}__${sel.romram.replace(/\s+/g, '')}`;
}

/** 价差基准 = 本组主分析产品；主品未选或在所选范围内无数据时为 null（不出价差） */
export function baseKeyOf(group: Pick<TableGroup, 'mainKey' | 'series'>): string | null {
  if (group.mainKey == null) return null;
  return group.series.some((s) => s.key === group.mainKey) ? group.mainKey : null;
}

/** 日期列文案：周 = MM-DD（桶 xLabel 原样，不带周号）；月 = YYYY-MM；季 = 原样 */
export function bucketDateText(g: Granularity, xLabel: string): string {
  if (g === 'month' && /^\d{6}$/.test(xLabel)) return `${xLabel.slice(0, 4)}-${xLabel.slice(4)}`;
  return xLabel;
}

/** 折扣率：−12.3% / +0.5% / 0.0%（U+2212 负号，与图上折扣徽章同语言） */
export function fmtPct(v: number): string {
  const pct = v * 100;
  if (Math.abs(pct) < 0.05) return '0.0%';
  return (pct < 0 ? '−' : '+') + Math.abs(pct).toFixed(1) + '%';
}

/** 折扣率 = 折后价 / RRP − 1；任一缺失或 RRP 非正为 null */
export function discountOf(pt: Pick<SeriesPoint, 'price' | 'rrp'> | undefined): number | null {
  if (!pt || pt.price == null || pt.rrp == null || !(pt.rrp > 0)) return null;
  return pt.price / pt.rrp - 1;
}

/** 最近 4 周均价相对此前 4 周均价；窗口内忽略缺价周，任一窗口无有效价为 null */
export function recentFourWeekChange(points: ReadonlyArray<Pick<SeriesPoint, 'price'>>): number | null {
  const mean = (part: ReadonlyArray<Pick<SeriesPoint, 'price'>>): number | null => {
    const values = part.map((pt) => pt.price).filter((v): v is number => v != null && Number.isFinite(v) && v >= 0);
    return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  };
  const recentStart = Math.max(0, points.length - 4);
  const previous = mean(points.slice(Math.max(0, recentStart - 4), recentStart));
  const recent = mean(points.slice(recentStart));
  return previous == null || recent == null || previous <= 0 ? null : (recent - previous) / previous;
}

/** Offering 单元格全文：折扣/分期/赠品明细以「；」连接；无权益为空串 */
export function offerText(pt: Pick<SeriesPoint, 'offer'> | undefined): string {
  if (!pt) return '';
  return offerList(pt.offer)
    .map((d) => d.detail)
    .filter((t) => !!t)
    .join('；');
}

/** 系列「最新有值时点」下标（商城现页链接只挂该列）；全缺为 -1 */
export function latestIdxOf(s: Pick<Series, 'points'>, n: number): number {
  for (let i = Math.min(n, s.points.length) - 1; i >= 0; i--) {
    const pt = s.points[i];
    if (pt && (pt.price != null || pt.rrp != null)) return i;
  }
  return -1;
}

/** 组序号文案：「第 N 组」（N = 选择浮窗卡序，筛掉其他组不改编号） */
export function groupOrdinal(index: number): string {
  return `第 ${index} 组`;
}

/** 组号文案（宽表组头用，第一百三十一轮表头精简）：只留数字；
 *  图顶图例带仍用 groupOrdinal 的「第 N 组」 */
export function groupNumText(index: number): string {
  return String(index);
}

/** 全局「仅查看主产品」的对比系列 key（第一百七十四轮，Eason：按钮上移标题行、
 *  跨组同时生效）——全部组（各卡）的对比系列并集，不含各卡主品 */
export function compareKeysOfGroups(groups: LegendGroup[]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    for (const s of g.series) {
      if (s.key !== g.mainKey) out.push(s.key);
    }
  }
  return out;
}

/** 全局「仅查看主产品」按钮态：有无对比可管 + 是否已全局只看主品
 *  （= 全部对比系列都在屏蔽集；空对/无对比 = 无可管） */
export function onlyMainState(
  groups: LegendGroup[],
  hiddenKeys: Set<string>,
): { hasCompares: boolean; active: boolean } {
  const keys = compareKeysOfGroups(groups);
  return { hasCompares: keys.length > 0, active: keys.length > 0 && keys.every((k) => hiddenKeys.has(k)) };
}
