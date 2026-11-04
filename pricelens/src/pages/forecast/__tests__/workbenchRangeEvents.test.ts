// ============================================================
// v3 自由范围事件纯函数金测（B.4.6 · IA 文档任务 4 Step 2，2026-11-05 新建）：
// rangeEventFactorAt(calendar, events, weekId)：
// —— 任意起止周范围（不限定时长档位），offset / duration 全按日历绝对 index
//    （跨年 2026W53 → 2027W01 按绝对序位连续，不比较裸周号）；
// —— flat = 1 + magnitudePct / 100（全程峰值）；decreasing 逐点线性递减 =
//    1 + magnitudePct × (1 − offset / duration) / 100；范围外不乘（= 1）；
// —— 多事件按数组顺序连乘（数组顺序在归一化时稳定）。
// productEventFactorAt(calendar, events, weekId)：只调 rangeEventFactorAt，
// 不维护第二份公式（结构上接受 v3 产品范围事件 seed 的额外字段）。
// 全部断言不依赖运行时间与随机数。
// ============================================================
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildForecastCalendar } from '../workbenchCalendar';
import { productEventFactorAt, rangeEventFactorAt } from '../workbenchModel';
import { workbenchFixtureV3 } from '../workbenchFixture';

const calendar = buildForecastCalendar(workbenchFixtureV3.calendar);
const weeks = calendar.forecastWeeks;
const range = { startWeekId: weeks[10].id, endWeekId: weeks[13].id };

describe('rangeEventFactorAt', () => {
  it('supports arbitrary ranges and both shapes', () => {
    expect(rangeEventFactorAt(calendar, [{ ...range, magnitudePct: 8, decay: 'flat' }], weeks[12].id)).toBeCloseTo(1.08);
    expect(rangeEventFactorAt(calendar, [{ ...range, magnitudePct: 8, decay: 'decreasing' }], weeks[10].id)).toBeCloseTo(1.08);
    expect(rangeEventFactorAt(calendar, [{ ...range, magnitudePct: 8, decay: 'decreasing' }], weeks[13].id)).toBeCloseTo(1.02);
    expect(rangeEventFactorAt(calendar, [{ ...range, magnitudePct: 8, decay: 'flat' }], weeks[14].id)).toBe(1);
  });

  it('stays neutral outside the range and without events', () => {
    expect(rangeEventFactorAt(calendar, [], weeks[12].id)).toBe(1);
    // 起点之前（weeks[9] = 2027W01 < weeks[10] = 2027W02）与全部历史段（weeks[0]）均不修正
    expect(rangeEventFactorAt(calendar, [{ ...range, magnitudePct: 8, decay: 'flat' }], weeks[9].id)).toBe(1);
    expect(rangeEventFactorAt(calendar, [{ ...range, magnitudePct: 8, decay: 'flat' }], weeks[0].id)).toBe(1);
  });

  it('crosses the year boundary by absolute calendar index (2026W53 → 2027W01)', () => {
    const crossYear = { startWeekId: weeks[8].id, endWeekId: weeks[9].id };
    // 跨年周 ID 连续（ISO 周年 + 周号唯一主键），时长与 offset 只按绝对 index
    expect(crossYear.startWeekId).toBe('2026W53');
    expect(crossYear.endWeekId).toBe('2027W01');
    expect(rangeEventFactorAt(calendar, [{ ...crossYear, magnitudePct: 10, decay: 'flat' }], weeks[8].id)).toBeCloseTo(1.1);
    // duration = 2：weeks[9] offset 1 → 1 + 10% × (1 − 1/2) = 1.05
    expect(rangeEventFactorAt(calendar, [{ ...crossYear, magnitudePct: 10, decay: 'decreasing' }], weeks[9].id)).toBeCloseTo(1.05);
    // 上一周（2026W52）在范围外 = 1
    expect(rangeEventFactorAt(calendar, [{ ...crossYear, magnitudePct: 10, decay: 'decreasing' }], weeks[7].id)).toBe(1);
  });

  it('multiplies overlapping events deterministically in array order', () => {
    const first = { ...range, magnitudePct: 8, decay: 'flat' as const };
    const second = { startWeekId: weeks[12].id, endWeekId: weeks[14].id, magnitudePct: -5, decay: 'decreasing' as const };
    // weeks[12]：first 全程峰值 +8%；second 首周 −5%（offset 0 / duration 3）
    const combined = rangeEventFactorAt(calendar, [first, second], weeks[12].id);
    expect(combined).toBeCloseTo(1.08 * 0.95, 12);
    // 连乘交换律：数组顺序只影响次序，数值逐位一致（顺序在归一化时稳定）
    expect(rangeEventFactorAt(calendar, [second, first], weeks[12].id)).toBe(combined);
  });

  it('productEventFactorAt delegates to the shared range formula (no second copy)', () => {
    const productEvent = {
      ...range,
      id: 'pe-1',
      type: 'own-promo' as const,
      label: '演示促销',
      magnitudePct: 8,
      decay: 'flat' as const,
      replayId: 'rp-1',
    };
    expect(productEventFactorAt(calendar, [productEvent], weeks[12].id))
      .toBe(rangeEventFactorAt(calendar, [productEvent], weeks[12].id));
    expect(productEventFactorAt(calendar, [productEvent], weeks[14].id)).toBe(1);
    // 多事件连乘与 rangeEventFactorAt 逐位一致（单一公式来源）
    const second = { ...productEvent, id: 'pe-2', magnitudePct: -5 };
    expect(productEventFactorAt(calendar, [productEvent, second], weeks[12].id))
      .toBe(rangeEventFactorAt(calendar, [productEvent, second], weeks[12].id));
  });
});
