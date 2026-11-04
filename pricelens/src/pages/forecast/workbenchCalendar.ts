// ============================================================
// 量价预测 · v3 推演工作台统一日历（forecast-global-ia-review 附录 B.4.1 / 任务 1）
// 唯一预测范围：2026-11—2027-10 · 12 个月（附录 A.2 拍板）；周历为真实 ISO 规则：
// 周一开始 / 周日结束，weekId = 完整周一日期所属 ISO 周年 + 周号（YYYYWww），
// 跨年（如 2026W53 → 2027W01）身份、排序与事件落点不串值——禁止用「2026」
// 常量拼接所有周号充当跨年主键。
// 全部为 UTC 日期算术的纯函数：不读系统当前时间、不用随机数。
// 后续所有 v3 任务（fixture / 学习 / 大盘 / 事件 / 结果）只能使用这里产出的
// WeekId 与 ForecastCalendar，不得各自另造时间键。
// ============================================================

/** ISO 日期（YYYY-MM-DD）。 */
export type ISODate = string;
/** 月键（YYYY-MM）。 */
export type MonthKey = string;
/** 跨年周 ID（YYYYWww，ISO 周年 + 周号；跨年后仍唯一）。 */
export type WeekId = string;

/** 闭区间周范围（起 ≤ 止；weekId 必须来自同一 ForecastCalendar）。 */
export interface WeekRange {
  startWeekId: WeekId;
  endWeekId: WeekId;
}

/** 日历周：全部历史 + 预测周的统一时间对象。 */
export interface CalendarWeek {
  id: WeekId;
  /** 周一（YYYY-MM-DD）。 */
  date: ISODate;
  /** 周日（YYYY-MM-DD）。 */
  endDate: ISODate;
  /** ISO 周号读数（跨年不唯一，只作展示，不作键）。 */
  weekNumber: number;
  /** 所属月（按周一日期归属）。 */
  monthKey: MonthKey;
  /** 全部历史 + 预测周的绝对序位（0 起；范围校验只按它，跨年不比较裸周号）。 */
  index: number;
  /** 预测周内的序位；实际周为 null。 */
  forecastIndex: number | null;
  status: 'actual' | 'forecast';
}

/** 预测月：同时保留全部周与预测周（SI 只分摊到 forecastWeekIds）。 */
export interface ForecastMonth {
  key: MonthKey;
  weekIds: WeekId[];
  /** 只含 status='forecast' 的周（SI 不分摊到已发生周）。 */
  forecastWeekIds: WeekId[];
}

/** 统一预测日历（页面只保存一份；所有卡片 / 事件 / 导航从它取时间）。 */
export interface ForecastCalendar {
  /** 最后一个实际周（如 2026W44）。 */
  historyThrough: WeekId;
  /** 预测起始月（如 2026-11）。 */
  horizonStart: MonthKey;
  /** 预测终止月（如 2027-10）。 */
  horizonEnd: MonthKey;
  weeks: CalendarWeek[];
  forecastWeeks: CalendarWeek[];
  /** 恰为 horizonStart … horizonEnd 的连续月。 */
  forecastMonths: ForecastMonth[];
  /** 与 weeks 同源的周索引。 */
  weekById: Map<WeekId, CalendarWeek>;
  /** 与 forecastMonths 同源的月索引。 */
  monthByKey: Map<MonthKey, ForecastMonth>;
}

/** buildForecastCalendar 入参（v3 fixture 以该形态携带 calendar 字段）。 */
export interface ForecastCalendarInput {
  /** 首个历史周的周一（YYYY-MM-DD）。 */
  historyStart: ISODate;
  /** 最后一个实际周（YYYYWww）。 */
  historyThrough: WeekId;
  /** 预测起始月（YYYY-MM）。 */
  horizonStart: MonthKey;
  /** 预测终止月（YYYY-MM）。 */
  horizonEnd: MonthKey;
}

const DAY_MS = 86_400_000;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_ID_PATTERN = /^(\d{4})W(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** ISO 日期 → UTC 毫秒（只做日期算术，不读当前时间）。 */
function utcMsOfDate(iso: ISODate): number {
  const match = ISO_DATE_PATTERN.exec(iso);
  if (!match) throw new Error(`workbenchCalendar: 非法 ISO 日期「${iso}」`);
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/** UTC 毫秒 → ISO 日期（YYYY-MM-DD）。 */
function isoDateOfUtc(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO 星期（周一 = 1 … 周日 = 7）。 */
function isoDayOfWeek(ms: number): number {
  const jsDay = new Date(ms).getUTCDay(); // 0 = 周日
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * ISO 周四周年规则：某日所属 ISO 周年 = 其所在周的周四日期的年份；
 * 该周周号 = 距当年 W1 周一（含当年首个周四的那周）的整周数 + 1。
 */
function isoWeekYearAndNumber(ms: number): { year: number; week: number } {
  const thursday = ms + (4 - isoDayOfWeek(ms)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week1Monday = utcMondayOfIsoWeek(year, 1);
  const week = Math.round((thursday - week1Monday) / (7 * DAY_MS)) + 1;
  return { year, week };
}

/** 指定 ISO 周年 + 周号的周一（UTC 毫秒）：W1 = 含当年首个周四的周。 */
function utcMondayOfIsoWeek(year: number, week: number): number {
  const jan4 = Date.UTC(year, 0, 4); // 1 月 4 日恒在 ISO W1
  const mondayWeek1 = jan4 - (isoDayOfWeek(jan4) - 1) * DAY_MS;
  return mondayWeek1 + (week - 1) * 7 * DAY_MS;
}

/** 月键（YYYY-MM）→ 起始月 1 日的 UTC 毫秒。 */
function utcMsOfMonthKey(key: MonthKey): number {
  const match = MONTH_KEY_PATTERN.exec(key);
  if (!match) throw new Error(`workbenchCalendar: 非法月键「${key}」`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
}

/** UTC 毫秒 → 所属月键（按周一日期归属）。 */
function monthKeyOfUtc(ms: number): MonthKey {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

/** 跨年周 ID：由完整日期的 ISO 周年 + 两位周号生成（禁止用年份常量拼接）。 */
function weekIdOfUtc(ms: number): WeekId {
  const { year, week } = isoWeekYearAndNumber(ms);
  return `${year}W${pad2(week)}`;
}

/**
 * 生成统一预测日历（B.4.1）：
 * - 周一锚定 historyStart（自动归一到周一），逐周 +7 天直到所属月越出 horizonEnd；
 * - status：周一日期 ≤ historyThrough 周一为 'actual'，其后为 'forecast'
 *  （2026-11 等预测月内已发生周仍标实际；不读系统当前时间）；
 * - forecastMonths 恰为 horizonStart … horizonEnd 连续 12 个月，
 *   每月同时保留全部周（weekIds）与预测周（forecastWeekIds）。
 */
export function buildForecastCalendar(input: ForecastCalendarInput): ForecastCalendar {
  const throughMatch = WEEK_ID_PATTERN.exec(input.historyThrough);
  if (!throughMatch) throw new Error(`workbenchCalendar: 非法周 ID「${input.historyThrough}」`);
  const historyThroughMonday = utcMondayOfIsoWeek(Number(throughMatch[1]), Number(throughMatch[2]));
  const firstMondayRaw = utcMsOfDate(input.historyStart);
  const firstMonday = firstMondayRaw - (isoDayOfWeek(firstMondayRaw) - 1) * DAY_MS;
  if (historyThroughMonday < firstMonday) {
    throw new Error('workbenchCalendar: historyThrough 早于 historyStart');
  }
  if (input.horizonEnd < input.horizonStart) {
    throw new Error('workbenchCalendar: horizonEnd 早于 horizonStart');
  }

  const weeks: CalendarWeek[] = [];
  let forecastIndex = 0;
  for (
    let monday = firstMonday, index = 0;
    monthKeyOfUtc(monday) <= input.horizonEnd;
    monday += 7 * DAY_MS, index += 1
  ) {
    const isActual = monday <= historyThroughMonday;
    weeks.push({
      id: weekIdOfUtc(monday),
      date: isoDateOfUtc(monday),
      endDate: isoDateOfUtc(monday + 6 * DAY_MS),
      weekNumber: isoWeekYearAndNumber(monday).week,
      monthKey: monthKeyOfUtc(monday),
      index,
      forecastIndex: isActual ? null : forecastIndex++,
      status: isActual ? 'actual' : 'forecast',
    });
  }

  const forecastWeeks = weeks.filter((week) => week.status === 'forecast');
  const forecastMonths: ForecastMonth[] = [];
  for (
    let month = utcMsOfMonthKey(input.horizonStart);
    month <= utcMsOfMonthKey(input.horizonEnd);
    month = Date.UTC(new Date(month).getUTCFullYear(), new Date(month).getUTCMonth() + 1, 1)
  ) {
    const key = monthKeyOfUtc(month);
    const monthWeeks = weeks.filter((week) => week.monthKey === key);
    forecastMonths.push({
      key,
      weekIds: monthWeeks.map((week) => week.id),
      forecastWeekIds: monthWeeks.filter((week) => week.status === 'forecast').map((week) => week.id),
    });
  }

  // 与返回数组同源建索引（同一份 CalendarWeek / ForecastMonth 对象）。
  const weekById = new Map(weeks.map((week) => [week.id, week]));
  const monthByKey = new Map(forecastMonths.map((month) => [month.key, month]));

  return {
    historyThrough: input.historyThrough,
    horizonStart: input.horizonStart,
    horizonEnd: input.horizonEnd,
    weeks,
    forecastWeeks,
    forecastMonths,
    weekById,
    monthByKey,
  };
}

/**
 * 周范围时长（B.4.1 #4）：同一日历内按绝对 index 计算 = endIndex − startIndex + 1；
 * 起止任一不存在于该日历，或起晚于止（含倒置），返回 null（UI 显示错误）。
 * 跨年不比较裸 weekNumber，杜绝 2026W53 与 2027W01 串值。
 */
export function durationOfWeekRange(calendar: ForecastCalendar, range: WeekRange): number | null {
  const start = calendar.weekById.get(range.startWeekId);
  const end = calendar.weekById.get(range.endWeekId);
  if (!start || !end || start.index > end.index) return null;
  return end.index - start.index + 1;
}
