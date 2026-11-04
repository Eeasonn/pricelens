// ============================================================
// v3 工作台 · 统一日历与跨年周 ID 金测（附录 B 任务 1）：
// buildForecastCalendar 按 B.4.1 契约产出 12 个月预测日历：
// forecastMonths 恰为 2026-11…2027-10；首预测周 = 2026W45；
// 2027W01.date = 2027-01-04（ISO 周四周年规则，跨年不串号）；
// 周 id 全唯一；durationOfWeekRange 按绝对 index 跨年计算，倒置返回 null。
// ============================================================
import { describe, expect, it } from 'vitest';
import { buildForecastCalendar, durationOfWeekRange } from '../workbenchCalendar';

const calendar = buildForecastCalendar({
  historyStart: '2025-11-03',
  historyThrough: '2026W44',
  horizonStart: '2026-11',
  horizonEnd: '2027-10',
});

describe('forecastCalendar', () => {
  it('uses one twelve-month horizon and unique ISO week ids', () => {
    expect(calendar.forecastMonths.map((month) => month.key)).toEqual([
      '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04',
      '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10',
    ]);
    expect(calendar.forecastWeeks[0]?.id).toBe('2026W45');
    expect(calendar.weekById.get('2027W01')?.date).toBe('2027-01-04');
    expect(new Set(calendar.weeks.map((week) => week.id)).size).toBe(calendar.weeks.length);
  });

  it('computes a cross-year range by absolute indexes', () => {
    const weeks2026 = calendar.forecastWeeks.filter((week) => week.date.startsWith('2026'));
    const last2026 = weeks2026[weeks2026.length - 1]!;
    const first2027 = calendar.forecastWeeks.find((week) => week.date.startsWith('2027'))!;
    expect(durationOfWeekRange(calendar, {
      startWeekId: last2026.id,
      endWeekId: first2027.id,
    })).toBe(2);
    expect(durationOfWeekRange(calendar, {
      startWeekId: first2027.id,
      endWeekId: last2026.id,
    })).toBeNull();
  });
});
