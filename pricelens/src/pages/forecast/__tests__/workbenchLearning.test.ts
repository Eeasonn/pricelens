import { describe, expect, it } from 'vitest';
import { workbenchFixtureV3 } from '../workbenchFixture';
import { buildForecastCalendar } from '../workbenchCalendar';
import { learnWorkbenchBaseline } from '../workbenchLearning';

const calendar = buildForecastCalendar(workbenchFixtureV3.calendar);

describe('learnWorkbenchBaseline', () => {
  it('learns a deterministic baseline with eight holdout weeks', () => {
    const first = learnWorkbenchBaseline(workbenchFixtureV3, calendar, 'ref-mate80');
    const second = learnWorkbenchBaseline(workbenchFixtureV3, calendar, 'ref-mate80');
    expect(first).toEqual(second);
    expect(first.evidence.status).toBe('completed');
    expect(first.evidence.holdoutCount).toBe(8);
    expect(first.evidence.featureNames).toEqual(['trend', 'referenceLogVolume', 'promo']);
    expect(first.evidence.holdoutMape).not.toBeNull();
    for (const week of calendar.forecastWeeks) {
      expect(Number.isFinite(first.baseByWeek.get(week.id))).toBe(true);
      expect(first.baseByWeek.get(week.id)!).toBeGreaterThanOrEqual(0);
    }
  });

  it('falls back visibly when no valid actual samples exist', () => {
    const emptyFixture = {
      ...workbenchFixtureV3,
      weeks: workbenchFixtureV3.weeks.map((week) => week.status === 'actual' ? { ...week, sales: null } : week),
    };
    const learned = learnWorkbenchBaseline(emptyFixture, calendar, 'ref-mate80');
    expect(learned.evidence.status).toBe('fallback');
    expect(learned.evidence.fallbackReasons.join('；')).toContain('有效样本');
    expect(learned.evidence.coefficients).toBeNull();
  });
});
