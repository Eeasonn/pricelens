// ============================================================
// 推演工作台 v2 周历与时间边界金测（forecast-workbench-v2）：
// quarterKeyOfWeek 从周数据的完整日期推季度（禁止按数组比例猜季度）；
// marketEventDisposition 三态处置（historical / active / inactive）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import { marketEventDisposition, quarterKeyOfWeek } from '../workbenchTime';

const fixture = workbenchFixture;

describe('推演工作台 · 周历季度（quarterKeyOfWeek）', () => {
  it('周数据带完整周一日期：date = YYYY-MM-DD，dateLabel = MM-DD（W44 = 2026-11-02）', () => {
    const w44 = fixture.weeks.find((week) => week.weekNumber === 44);
    expect(w44?.date).toBe('2026-11-02');
    expect(w44?.dateLabel).toBe('11-02');
    expect(fixture.weeks.every((week) => /^\d{4}-\d{2}-\d{2}$/.test(week.date))).toBe(true);
  });

  it('季度从实际日期推：W37–W39 → 2026Q3，W40–W52 → 2026Q4', () => {
    expect(quarterKeyOfWeek(fixture, 37)).toBe('2026Q3');
    expect(quarterKeyOfWeek(fixture, 38)).toBe('2026Q3');
    expect(quarterKeyOfWeek(fixture, 39)).toBe('2026Q3');
    expect(quarterKeyOfWeek(fixture, 40)).toBe('2026Q4');
    expect(quarterKeyOfWeek(fixture, 44)).toBe('2026Q4');
    expect(quarterKeyOfWeek(fixture, 45)).toBe('2026Q4');
    expect(quarterKeyOfWeek(fixture, 46)).toBe('2026Q4');
    expect(quarterKeyOfWeek(fixture, 50)).toBe('2026Q4');
    expect(quarterKeyOfWeek(fixture, 52)).toBe('2026Q4');
  });

  it('不在 fixture 周窗内的周序号返回 null', () => {
    expect(quarterKeyOfWeek(fixture, 36)).toBeNull();
    expect(quarterKeyOfWeek(fixture, 53)).toBeNull();
    expect(quarterKeyOfWeek(fixture, 1)).toBeNull();
  });
});

describe('推演工作台 · 大盘事件处置（marketEventDisposition）', () => {
  it('预填默认事件（W46 起 / W50 起）都覆盖预测周 = active', () => {
    for (const event of fixture.defaultMarketEvents) {
      expect(marketEventDisposition(fixture, event)).toBe('active');
    }
  });

  it('起周早于首个预测周（W45）= historical；即使时长跨入预测段也只解释', () => {
    // W44 起 2 周 = W44–W45，跨入预测段 → historical
    expect(marketEventDisposition(fixture, { id: 'e-cross', label: '跨段事件', startWeek: 44, durationWeeks: 2, magnitudePct: 10, decay: 'decreasing' })).toBe('historical');
    // 完全落在历史段
    expect(marketEventDisposition(fixture, { id: 'e-hist', label: '历史事件', startWeek: 40, durationWeeks: 4, magnitudePct: 5, decay: 'decreasing' })).toBe('historical');
    // 长时程历史事件大幅跨入预测段，仍 historical
    expect(marketEventDisposition(fixture, { id: 'e-long', label: '长事件', startWeek: 40, durationWeeks: 12, magnitudePct: 8, decay: 'flat' })).toBe('historical');
  });

  it('起周在首个预测周（W45）= active；起周晚于预测窗末（W52）= inactive', () => {
    expect(marketEventDisposition(fixture, { id: 'e-first', label: '首周事件', startWeek: 45, durationWeeks: 1, magnitudePct: 5, decay: 'flat' })).toBe('active');
    expect(marketEventDisposition(fixture, { id: 'e-late', label: '窗外事件', startWeek: 53, durationWeeks: 2, magnitudePct: 5, decay: 'decreasing' })).toBe('inactive');
  });
});
