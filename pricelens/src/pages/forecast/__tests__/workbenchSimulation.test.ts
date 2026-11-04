// ============================================================
// v3 工作台 · 统一模拟数据金测（附录 B 任务 2）：
// createWorkbenchSimulation(calendar) 以固定种子生成 v3 fixture：
// 同日历两次生成逐字段一致（确定性，无运行时随机、不读系统时间）；
// 实际周 ≥52；周 id 序列与 calendar.weeks 完全一致；forecastMonths
// 12 个月键一致；每月 SI 计划有限、成本版本逐月覆盖。
// ============================================================
import { describe, expect, it } from 'vitest';
import { buildForecastCalendar } from '../workbenchCalendar';
import { createWorkbenchSimulation } from '../workbenchSimulation';

const calendar = buildForecastCalendar({
  historyStart: '2025-11-03', historyThrough: '2026W44',
  horizonStart: '2026-11', horizonEnd: '2027-10',
});

describe('workbench simulation v3', () => {
  it('covers every calendar week and repeats exactly', () => {
    const first = createWorkbenchSimulation(calendar);
    const second = createWorkbenchSimulation(calendar);
    expect(first).toEqual(second);
    expect(first.meta.modelVersion).toBe('workbench-demo-v3');
    expect(first.weeks.filter((week) => week.status === 'actual').length).toBeGreaterThanOrEqual(52);
    expect(first.weeks.map((week) => week.id)).toEqual(calendar.weeks.map((week) => week.id));
    expect(first.forecastMonths.map((month) => month.key)).toEqual(calendar.forecastMonths.map((month) => month.key));
    for (const month of calendar.forecastMonths) {
      expect(Number.isFinite(first.inventory.siPlanMonthly[month.key])).toBe(true);
      expect(first.costVersions.some((version) => version.monthKey === month.key)).toBe(true);
    }
  });
});
