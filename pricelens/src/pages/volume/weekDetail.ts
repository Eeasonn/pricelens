// 图下单周明细卡（视觉 demo：detail-card）的取数模型。
// 只做「一个观察周的四组读数」：RRP / 折后价 / 环比 / 销量 + 当月成本销毛（模拟）。
// 数值与缺口语义在这里定型，展示组件不重复计算：
// - 缺采（价格/销量为 null）显示 —，不借用相邻周的值；
// - 环比只跟上一桶比，上一桶缺采同样显示 —；
// - 成本销毛必须带「模拟」口径；竞品整段无数据时三格都是 —。
import type { Granularity } from '../../dataModel/types';
import type { MarginCostPoint } from './marginCost';
import { marginTipModel } from './marginCostGeometry';

export interface WeekWow {
  text: string;
  /** 涨蓝跌琥珀（第一百八十七轮定案）：up 蓝 / down 琥珀 / flat 中性 */
  dir: 'up' | 'down' | 'flat';
}

export interface WeekDetailModel {
  visible: boolean;
  /** 桶锚日文案：周 = MM-DD / 月 = YYYY-MM / 季 = YYYYQn */
  date: string;
  /** 桶号：周 = 2026W24 / 月 = 2026-07 / 季 = 2026Q3 */
  period: string;
  /** 环比指标名随粒度：周环比 / 月环比 / 季环比 */
  wowLabel: string;
  /** 销量指标名随粒度：周销量 / 月销量 / 季销量 */
  volumeLabel: string;
  rrp: string | null;
  price: string | null;
  wow: WeekWow | null;
  /** 环比跨过的隔离周数（>0 时环比对上一可信点；小注「跨 N 个隔离周」） */
  wowSkip: number;
  /** 被跨过的桶号清单（title 说明跳过了哪周） */
  wowSkipBuckets: string[];
  /** 异常价格守卫打标（2026-11-01）：隔离/待核对/已确认；缺省 = 可信 */
  priceSuspect?: 'quarantined' | 'pending' | 'exempted';
  /** 被隔离周不造销毛：三格改显「价格不可信」 */
  marginMasked: boolean;
  volume: string | null;
  margin: { kind: 'empty' | 'gap' | 'ready'; cost: string; margin: string; rate: string };
}

/** 桶锚日文案：与图表悬停标题同一格式（周 = MM-DD / 月 = YYYY-MM / 季 = 原样） */
export function detailDateOf(granularity: Granularity, xLabel: string): string {
  if (!xLabel) return '';
  if (granularity === 'week') return xLabel;
  if (granularity === 'month') return /^\d{6}$/.test(xLabel) ? `${xLabel.slice(0, 4)}-${xLabel.slice(4)}` : xLabel;
  return xLabel;
}

/** 桶号文案：周 = 2026W24 / 月 = 2026-07 / 季 = 2026Q3（桶号缺省时回退锚日） */
export function detailPeriodOf(granularity: Granularity, bucketId: string, xLabel: string): string {
  if (granularity === 'week') {
    if (/^\d{6}$/.test(bucketId)) return `${bucketId.slice(0, 4)}W${bucketId.slice(4)}`;
    return bucketId || xLabel;
  }
  if (granularity === 'month') {
    const id = /^\d{6}$/.test(bucketId) ? bucketId : /^\d{6}$/.test(xLabel) ? xLabel : '';
    return id ? `${id.slice(0, 4)}-${id.slice(4)}` : bucketId || xLabel;
  }
  return bucketId || xLabel;
}

/** 环比指标名：随粒度换字，不把周环比硬套在月/季视图上 */
export function detailWowLabelOf(granularity: Granularity): string {
  if (granularity === 'week') return '周环比';
  if (granularity === 'month') return '月环比';
  return '季环比';
}

/** 销量指标名：随粒度换字 */
export function detailVolumeLabelOf(granularity: Granularity): string {
  if (granularity === 'week') return '周销量';
  if (granularity === 'month') return '月销量';
  return '季销量';
}

function wowOf(price: number | null, prevPrice: number | null): WeekWow | null {
  if (price == null || !(price > 0) || prevPrice == null || !(prevPrice > 0)) return null;
  const pct = (price / prevPrice - 1) * 100;
  const rounded = Math.round(Math.abs(pct) * 10) / 10;
  if (rounded === 0) return { text: '±0.0%', dir: 'flat' };
  const sign = pct > 0 ? '+' : '−';
  return { text: `${sign}${rounded.toFixed(1)}%`, dir: pct > 0 ? 'up' : 'down' };
}

export function weekDetailModel(input: {
  granularity: Granularity;
  bucketId: string;
  xLabel: string;
  price: number | null;
  rrp: number | null;
  prevPrice: number | null;
  volume: number | null;
  marginPoint: MarginCostPoint | null;
  /** 竞品等整段无模拟数据时为 true，三格都显示 — */
  marginUnavailable: boolean;
  formatMoney: (value: number) => string;
  formatVolume: (value: number) => string;
  /** 环比跨过的隔离周数与被跨桶号（对上一可信点；2026-11-01 异常守卫） */
  wowSkip?: number;
  wowSkipBuckets?: string[];
  /** 该点打标状态（隔离/待核对/已确认） */
  priceSuspect?: 'quarantined' | 'pending' | 'exempted';
}): WeekDetailModel {
  const hasAny = input.price != null || input.rrp != null || input.volume != null;
  if (!input.bucketId && !input.xLabel && !hasAny) {
    return {
      visible: false, date: '', period: '', wowLabel: detailWowLabelOf(input.granularity),
      volumeLabel: detailVolumeLabelOf(input.granularity),
      rrp: null, price: null, wow: null, volume: null,
      wowSkip: 0, wowSkipBuckets: [], marginMasked: false,
      margin: { kind: 'empty', cost: '', margin: '', rate: '' },
    };
  }
  // 成本销毛格式化复用 marginTipModel：竞品整段无数据 = empty，悬停空桶 = gap（不借月）
  const tip = marginTipModel({
    unavailable: input.marginUnavailable,
    point: input.marginPoint,
    formatMoney: input.formatMoney,
  });
  const margin = tip.kind === 'ready'
    ? { kind: 'ready' as const, cost: tip.cost ?? '', margin: tip.margin ?? '', rate: tip.rate ?? '' }
    : { kind: tip.kind, cost: '', margin: '', rate: '' };
  return {
    visible: true,
    date: detailDateOf(input.granularity, input.xLabel),
    period: detailPeriodOf(input.granularity, input.bucketId, input.xLabel),
    wowLabel: detailWowLabelOf(input.granularity),
    volumeLabel: detailVolumeLabelOf(input.granularity),
    rrp: input.rrp != null && input.rrp > 0 ? input.formatMoney(input.rrp) : null,
    price: input.price != null && input.price > 0 ? input.formatMoney(input.price) : null,
    // 观察周本身被隔离：不计环比（原值可见）——环比行显示「已隔离，不计环比」
    wow: input.priceSuspect === 'quarantined' ? null : wowOf(input.price, input.prevPrice),
    wowSkip: input.wowSkip ?? 0,
    wowSkipBuckets: input.wowSkipBuckets ?? [],
    priceSuspect: input.priceSuspect,
    marginMasked: input.priceSuspect === 'quarantined',
    volume: input.volume != null ? input.formatVolume(input.volume) : null,
    margin,
  };
}
