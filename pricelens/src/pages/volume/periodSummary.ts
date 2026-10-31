// 区间量价摘要：只描述当前查看窗口内的折后价与销量事实。
// 不跨产品汇总，不把首尾变化解释为弹性或因果关系。
import type { Granularity } from '../../dataModel/types';
import { formatPrice } from '../../theme/tokens';

export type MoveDirection = 'up' | 'down' | 'flat' | 'none';
export type MoveTone = 'up' | 'down' | 'flat' | 'none';

export interface ChangeStats {
  validCount: number;
  start: number | null;
  end: number | null;
  delta: number | null;
  /** 期初为 0 或有效点不足 2 个时为 null，不用无穷大代替 */
  pct: number | null;
  direction: MoveDirection;
}

const isFiniteNumber = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

export function pricePointValid(v: number | null | undefined): v is number {
  return isFiniteNumber(v) && v > 0;
}

/** 0 是有效销量；null 与非有限值不是 */
export function volumePointValid(v: number | null | undefined): v is number {
  return isFiniteNumber(v);
}

function directionFrom(pct: number | null, delta: number | null, validCount: number): MoveDirection {
  if (validCount < 2 || delta == null) return 'none';
  if (pct != null) {
    if (Math.abs(pct) < 1) return 'flat';
    return pct > 0 ? 'up' : 'down';
  }
  if (delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

export function changeOf(values: readonly (number | null)[], valid: (v: number | null | undefined) => v is number): ChangeStats {
  const points = values.filter(valid);
  const validCount = points.length;
  if (validCount === 0) {
    return { validCount: 0, start: null, end: null, delta: null, pct: null, direction: 'none' };
  }
  const start = points[0];
  const end = points[points.length - 1];
  if (validCount < 2) {
    return { validCount, start, end, delta: null, pct: null, direction: 'none' };
  }
  const delta = end - start;
  const pct = start > 0 ? (delta / start) * 100 : null;
  return { validCount, start, end, delta, pct, direction: directionFrom(pct, delta, validCount) };
}

export function volumeTotalOf(values: readonly (number | null)[]): number | null {
  let total = 0;
  let any = false;
  for (const v of values) {
    if (!volumePointValid(v)) continue;
    total += v;
    any = true;
  }
  return any ? total : null;
}

const SIDE: Record<Exclude<MoveDirection, 'none'>, { price: string; volume: string }> = {
  up: { price: '价升', volume: '量升' },
  down: { price: '价降', volume: '量降' },
  flat: { price: '价稳', volume: '量稳' },
};

export function directionLabelOf(price: MoveDirection, volume: MoveDirection): string | null {
  const parts = [
    price === 'none' ? '' : SIDE[price].price,
    volume === 'none' ? '' : SIDE[volume].volume,
  ].filter(Boolean);
  return parts.length ? parts.join('') : null;
}

export function formatWindowLabel(granularity: Granularity, startId: string | undefined, endId: string | undefined): string {
  const one = (id: string | undefined): string => {
    if (!id) return '—';
    if (granularity === 'week' && /^\d{6}$/.test(id)) return `${id.slice(0, 4)}W${id.slice(4)}`;
    return id;
  };
  const start = one(startId);
  const end = one(endId);
  return start === end ? start : `${start}–${end}`;
}

export function periodUnit(granularity: Granularity, count: number): string {
  if (granularity === 'month') return `${count}个月`;
  if (granularity === 'quarter') return `${count}个季度`;
  return `${count}周`;
}

/** 与起止值同一量级：任一侧达到 1 万则全部用「万」，否则千分位 */
export function formatVolumeAmount(n: number, wan: boolean): string {
  const negative = n < 0;
  const abs = Math.abs(n);
  const body = wan
    ? `${(abs / 10000).toFixed(1).replace(/\.0$/, '')}万`
    : Math.round(abs).toLocaleString('en-US');
  return negative ? `−${body}` : body;
}

function signedAmount(n: number, format: (v: number) => string): string {
  if (n > 0) return `+${format(n)}`;
  if (n < 0) return `−${format(Math.abs(n))}`;
  return format(0);
}

export function formatPct(pct: number): string {
  const abs = Math.abs(pct).toFixed(1);
  if (pct < 0) return `−${abs}%`;
  if (pct > 0) return `+${abs}%`;
  return '0.0%';
}

export interface PeriodSummaryModel {
  empty: boolean;
  windowLabel: string;
  directionLabel: string | null;
  pricePct: string | null;
  priceDetail: string | null;
  priceTone: MoveTone;
  volumePct: string | null;
  volumeDetail: string | null;
  volumeTotalText: string | null;
  volumeTone: MoveTone;
}

export function buildPeriodSummary(input: {
  prices: readonly (number | null)[];
  volumes: readonly (number | null)[];
  granularity: Granularity;
  startId?: string;
  endId?: string;
  currency: 'local' | 'usd';
  /** 查看窗口包含的桶数；缺省 = 价格与销量序列中较长的一条 */
  periodCount?: number;
  /** 完整序列对应的当前查看窗口下标；省略时使用传入序列全部点。 */
  windowStart?: number;
  windowEnd?: number;
}): PeriodSummaryModel {
  const hasWindow = input.windowStart != null || input.windowEnd != null;
  const windowStart = Math.max(0, input.windowStart ?? 0);
  const windowEnd = Math.max(windowStart, input.windowEnd ?? Math.max(input.prices.length, input.volumes.length) - 1);
  const prices = hasWindow ? input.prices.slice(windowStart, windowEnd + 1) : input.prices;
  const volumes = hasWindow ? input.volumes.slice(windowStart, windowEnd + 1) : input.volumes;
  const price = changeOf(prices, pricePointValid);
  const volume = changeOf(volumes, volumePointValid);
  const total = volumeTotalOf(volumes);
  const periodCount = input.periodCount ?? Math.max(prices.length, volumes.length);
  const windowLabel = formatWindowLabel(input.granularity, input.startId, input.endId);
  const empty = price.validCount === 0 && volume.validCount === 0 && total == null;
  const money = (v: number): string => formatPrice(Math.round(v), input.currency);
  const wan = [volume.start, volume.end, volume.delta, total].some((v) => v != null && Math.abs(v) >= 10000);
  const vol = (v: number): string => formatVolumeAmount(v, wan);

  const priceDetail = price.validCount === 0 || price.start == null
    ? null
    : price.validCount < 2 || price.end == null || price.delta == null
      ? money(price.start)
      : `${money(price.start)} → ${money(price.end)}（${signedAmount(price.delta, money)}）`;
  const volumeDetail = volume.validCount === 0 || volume.start == null
    ? null
    : volume.validCount < 2 || volume.end == null || volume.delta == null
      ? vol(volume.start)
      : `${vol(volume.start)} → ${vol(volume.end)}（${signedAmount(volume.delta, vol)}）`;

  return {
    empty,
    windowLabel,
    directionLabel: empty ? null : directionLabelOf(price.direction, volume.direction),
    pricePct: price.pct == null ? null : formatPct(price.pct),
    priceDetail,
    priceTone: price.direction,
    volumePct: volume.pct == null ? null : formatPct(volume.pct),
    volumeDetail,
    volumeTotalText: total == null ? null : `${vol(total)} · ${periodUnit(input.granularity, periodCount)}`,
    volumeTone: volume.direction,
  };
}
