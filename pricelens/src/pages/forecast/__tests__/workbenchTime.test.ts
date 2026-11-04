// ============================================================
// 推演工作台 v3 时间处置金测（forecast-global-ia-review B.4.2 · 任务 5/7 迁移）：
// marketEventDisposition 只按统一日历（ForecastCalendar）绝对 index 判定——
// historical（起周早于首个预测周，跨入预测段也只作历史解释）/
// active（覆盖任一预测周）/ inactive（不覆盖任何预测周，含起止不在日历、
// 起晚于止的非法范围——不造数）。跨年不比较裸周号。
// v2 槽位（quarterKeyOfWeek 裸周号季度 / defaultMarketEvents）已随 v2 主链移除。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import { buildForecastCalendar } from '../workbenchCalendar';
import { marketEventDisposition } from '../workbenchTime';

const calendar = buildForecastCalendar(workbenchFixture.calendar);

describe('marketEventDisposition · 统一日历绝对 index 处置（v3）', () => {
  it('日历锚点：historyThrough 2026W44、预测段 2026W45–2027W43（跨年 WeekId 唯一）', () => {
    expect(calendar.historyThrough).toBe('2026W44');
    expect(calendar.forecastWeeks[0]?.id).toBe('2026W45');
    expect(calendar.forecastWeeks[calendar.forecastWeeks.length - 1]?.id).toBe('2027W43');
  });

  it('起周早于首个预测周 = historical；跨入预测段也只解释（2026W44–2026W45）', () => {
    expect(marketEventDisposition(calendar, { startWeekId: '2026W44', endWeekId: '2026W45' })).toBe('historical');
    // 完全落在历史段
    expect(marketEventDisposition(calendar, { startWeekId: '2026W40', endWeekId: '2026W43' })).toBe('historical');
    // 长时程历史事件大幅跨入预测段，仍 historical
    expect(marketEventDisposition(calendar, { startWeekId: '2026W40', endWeekId: '2027W02' })).toBe('historical');
  });

  it('起周在预测段 = active（含跨年 2026W53–2027W02）；起止均在段内照常 active', () => {
    expect(marketEventDisposition(calendar, { startWeekId: '2026W45', endWeekId: '2026W45' })).toBe('active');
    expect(marketEventDisposition(calendar, { startWeekId: '2027W01', endWeekId: '2027W02' })).toBe('active');
    // 跨年范围不串值：2026W53 → 2027W01 按绝对 index 判定
    expect(marketEventDisposition(calendar, { startWeekId: '2026W53', endWeekId: '2027W01' })).toBe('active');
  });

  it('起止不在该日历 / 起晚于止 = inactive（非法范围不造数）', () => {
    expect(marketEventDisposition(calendar, { startWeekId: '2028W01', endWeekId: '2028W02' })).toBe('inactive');
    expect(marketEventDisposition(calendar, { startWeekId: '2027W10', endWeekId: '2026W50' })).toBe('inactive');
    expect(marketEventDisposition(calendar, { startWeekId: 'bad', endWeekId: '2026W50' })).toBe('inactive');
  });
});
