// ============================================================
// 量价预测 · 推演工作台 v2 周历与时间边界（forecast-workbench-v2）
// 周历：2026 真实周历（周一锚定 2026-01-05 = W1）。季度与历史／预测边界
// 一律从周数据的完整日期（WorkbenchWeek.date，YYYY-MM-DD）推导，
// 禁止按数组比例猜季度。全部为纯函数：不读时间、不用随机数。
// ============================================================
import type { MarketEventSeed, WorkbenchFixture } from './workbenchFixture';

/** 大盘事件在推演链中的处置：historical = 历史段解释（不修正预测周）；active = 覆盖任一预测周；inactive = 不在预测窗口。 */
export type MarketEventDisposition = 'historical' | 'active' | 'inactive';

/** 预测周序号区间（首／末个 status='forecast' 的周）；无预测周返回 null。 */
function forecastWeekRange(fixture: WorkbenchFixture): { first: number; last: number } | null {
  const forecastWeekNumbers = fixture.weeks
    .filter((week) => week.status === 'forecast')
    .map((week) => week.weekNumber);
  if (!forecastWeekNumbers.length) return null;
  return { first: Math.min(...forecastWeekNumbers), last: Math.max(...forecastWeekNumbers) };
}

/**
 * 周序号 → 季度键（如 '2026Q4'）。季度从周数据的完整周一日期计算；
 * 周不在 fixture 周窗内（或日期不可解析）返回 null。
 */
export function quarterKeyOfWeek(fixture: WorkbenchFixture, weekNumber: number): string | null {
  const week = fixture.weeks.find((candidate) => candidate.weekNumber === weekNumber);
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week.date)) return null;
  const year = Number(week.date.slice(0, 4));
  const month = Number(week.date.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${year}Q${quarter}`;
}

/**
 * 大盘事件处置：
 * - historical：起周早于首个预测周。即使时长跨入预测段，也只作历史解释，不修正任何预测周。
 * - active：起周在预测窗内且覆盖任一预测周。
 * - inactive：起周晚于预测窗末（或事件覆盖不到预测周）。
 */
export function marketEventDisposition(fixture: WorkbenchFixture, event: MarketEventSeed): MarketEventDisposition {
  const range = forecastWeekRange(fixture);
  if (!range) return 'inactive';
  if (event.startWeek < range.first) return 'historical';
  const endWeek = event.startWeek + Math.max(0, event.durationWeeks) - 1;
  return event.startWeek <= range.last && endWeek >= range.first ? 'active' : 'inactive';
}
