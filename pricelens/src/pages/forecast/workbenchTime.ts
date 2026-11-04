// ============================================================
// 量价预测 · v3 推演工作台时间处置（forecast-workbench-v3 · 任务 5）：
// 大盘事件处置只按统一日历（workbenchCalendar.ForecastCalendar）的绝对
// index 判定——跨年（2026W53 → 2027W01）不比较裸周号，杜绝串值。
// 全部为纯函数：不读时间、不用随机数。
// v2 槽位（quarterKeyOfWeek 裸周号季度 / fixture 数字周区间）已随 v2 主链移除。
// ============================================================
import type { ForecastCalendar, WeekRange } from './workbenchCalendar';

/** 大盘事件在推演链中的处置：historical = 历史段解释（不修正预测周）；active = 覆盖任一预测周；inactive = 不在预测窗口。 */
export type MarketEventDisposition = 'historical' | 'active' | 'inactive';

/**
 * 大盘事件处置（v3 · 绝对 index 口径）：
 * - historical：起周早于首个预测周。即使范围跨入预测段，也只作历史解释，不修正任何预测周。
 * - active：起周在预测段内且范围覆盖任一预测周。
 * - inactive：整个范围不覆盖任何预测周（含起止不在该日历、起晚于止的非法范围——不造数）。
 */
export function marketEventDisposition(
  calendar: ForecastCalendar,
  event: WeekRange,
): MarketEventDisposition {
  const start = calendar.weekById.get(event.startWeekId);
  const end = calendar.weekById.get(event.endWeekId);
  if (!start || !end || start.index > end.index) return 'inactive';
  const firstForecast = calendar.forecastWeeks[0];
  const lastForecast = calendar.forecastWeeks[calendar.forecastWeeks.length - 1];
  if (!firstForecast || !lastForecast) return 'inactive';
  if (start.index < firstForecast.index) return 'historical';
  return start.index <= lastForecast.index && end.index >= firstForecast.index ? 'active' : 'inactive';
}
