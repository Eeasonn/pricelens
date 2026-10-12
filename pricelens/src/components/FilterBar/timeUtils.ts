// ============================================================
// §5.4 时间桶 id ↔ 日期换算 + 粒度切换"保持可见时间跨度只换桶"
// week = ISO 周（周三为锚），week_id = YYYYWW；month_id = YYYYMM；quarter_id = YYYYQn。
// 优先以 dim_time（造数产物）为准；数据为空（集成前）时降级为纯日期算法 + spec 窗口常量。
// ============================================================
import { dimTime } from '../../data';
import type { DimTime, Granularity } from '../../dataModel/types';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** ISO-8601 周号（周一为一周起点，含首个周四的年为周所属年）→ `YYYYWW` */
export function isoWeekIdOf(date: Date): string {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (t.getUTCDay() + 6) % 7; // 周一=0
  t.setUTCDate(t.getUTCDate() - day + 3); // 所在周的周四
  const isoYear = t.getUTCFullYear();
  const thuMs = t.getTime();
  t.setUTCMonth(0, 1);
  if (t.getUTCDay() !== 4) {
    t.setUTCMonth(0, 1 + ((4 - t.getUTCDay()) + 7) % 7); // 第 1 周的周四
  }
  const week = 1 + Math.round((thuMs - t.getTime()) / (7 * 86400000));
  return `${isoYear}${pad2(week)}`;
}

/** ISO 周 (year, week) 的周三日期 */
export function wednesdayOfISOWeek(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7;
  const week1MonMs = jan4.getTime() - day * 86400000; // 第 1 周周一
  return new Date(week1MonMs + ((week - 1) * 7 + 2) * 86400000); // +2 天 = 周三
}

/** 日期 → 桶 id（按粒度） */
export function bucketIdOfDate(date: Date, g: Granularity): string {
  const y = date.getFullYear();
  const m = date.getMonth();
  if (g === 'week') return isoWeekIdOf(date);
  if (g === 'month') return `${y}${pad2(m + 1)}`;
  return `${y}Q${Math.floor(m / 3) + 1}`;
}

/** 桶 id → 代表日期（周=周三；月/季=首日）。无法解析返回 null */
export function dateOfBucket(bucketId: string, g: Granularity): Date | null {
  if (g === 'week') {
    if (!/^\d{6}$/.test(bucketId)) return null;
    return wednesdayOfISOWeek(Number(bucketId.slice(0, 4)), Number(bucketId.slice(4)));
  }
  if (g === 'month') {
    if (!/^\d{6}$/.test(bucketId)) return null;
    return new Date(Number(bucketId.slice(0, 4)), Number(bucketId.slice(4, 6)) - 1, 1);
  }
  if (!/^\d{4}Q[1-4]$/.test(bucketId)) return null;
  const q = Number(bucketId.slice(5));
  return new Date(Number(bucketId.slice(0, 4)), (q - 1) * 3, 1);
}

function bucketOfRow(row: DimTime, g: Granularity): string {
  return g === 'week' ? row.week_id : g === 'month' ? row.month_id : row.quarter_id;
}

/**
 * §5.6：粒度切换时把 [startId, endId] 换算为 to 粒度的桶区间，保持可见时间跨度。
 * dimTime 就绪 = 精确映射（from 区间覆盖的 dim_time 行 → 目标桶 min/max）；
 * dimTime 为空 = 降级：纯日期换算（月/季→周为近似，取首末日所在 ISO 周），完全无法换算则原样返回。
 */
export function convertRangeBuckets(
  startId: string,
  endId: string,
  from: Granularity,
  to: Granularity,
): { start: string; end: string } {
  if (from === to) return { start: startId, end: endId };
  if (dimTime.length) {
    const rows = dimTime.filter((r) => {
      const b = bucketOfRow(r, from);
      return b >= startId && b <= endId;
    });
    if (rows.length) {
      const targets = rows.map((r) => bucketOfRow(r, to)).sort();
      return { start: targets[0], end: targets[targets.length - 1] };
    }
  }
  const dStart = dateOfBucket(startId, from);
  const dEnd = dateOfBucket(endId, from);
  if (!dStart || !dEnd) return { start: startId, end: endId };
  let start = bucketIdOfDate(dStart, to);
  let end = bucketIdOfDate(dEnd, to);
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

// ---------------- 数据窗口边界（RangePicker disabledDate 用） ----------------

export interface TimeBounds {
  dateMin: Date;
  dateMax: Date;
  weekMin: string;
  weekMax: string;
  monthMin: string;
  monthMax: string;
  quarterMin: string;
  quarterMax: string;
}

/** §11.4：数据窗口 2025-W01（周一 2024-12-30）→ 2026-W41（周三 2026-10-07）作为兜底 */
const FALLBACK_BOUNDS: TimeBounds = {
  dateMin: new Date(2024, 11, 30),
  dateMax: new Date(2026, 9, 7),
  weekMin: '202501',
  weekMax: '202641',
  monthMin: '202501',
  monthMax: '202610',
  quarterMin: '2025Q1',
  quarterMax: '2026Q4',
};

function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** 数据就绪时取 dim_time 的真实窗口；空数据降级为 spec 常量 */
export function computeTimeBounds(): TimeBounds {
  if (!dimTime.length) return FALLBACK_BOUNDS;
  let min = dimTime[0];
  let max = dimTime[0];
  for (const r of dimTime) {
    if (r.week_id < min.week_id) min = r;
    if (r.week_id > max.week_id) max = r;
  }
  let monthMin = dimTime[0].month_id;
  let monthMax = dimTime[0].month_id;
  let quarterMin = dimTime[0].quarter_id;
  let quarterMax = dimTime[0].quarter_id;
  for (const r of dimTime) {
    if (r.month_id < monthMin) monthMin = r.month_id;
    if (r.month_id > monthMax) monthMax = r.month_id;
    if (r.quarter_id < quarterMin) quarterMin = r.quarter_id;
    if (r.quarter_id > quarterMax) quarterMax = r.quarter_id;
  }
  const dateMin = parseDate(min.week_start_date) ?? FALLBACK_BOUNDS.dateMin;
  const dateMax = parseDate(max.week_wed_date) ?? FALLBACK_BOUNDS.dateMax;
  return { dateMin, dateMax, weekMin: min.week_id, weekMax: max.week_id, monthMin, monthMax, quarterMin, quarterMax };
}
