// ============================================================
// 第一百一十九轮（走查会）时间轴刻度计划金测：左右边界完整格式（周=YYYYMMDD /
// 月=YYYYMM / 季=YYYYQn）恒显示；中间省年份；跨年在换年刻度补年份行；
// 与边界贴得太近的抽稀刻度让位。图轴 / 刷选轨道 / 大盘卡三处消费方同源。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimTime } from '../../../data';
import { axisTickPlan, fullBucketLabel, shortBucketLabel } from '../helpers';

const MONTHS = ['202509', '202510', '202511', '202512', '202601', '202602', '202603', '202604', '202605', '202606', '202607', '202608'];
const QUARTERS = ['2025Q3', '2025Q4', '2026Q1', '2026Q2'];

describe('桶文案：完整 / 短格式', () => {
  it('月：完整 = YYYYMM，短 = MM', () => {
    expect(fullBucketLabel('month', '202610')).toBe('202610');
    expect(shortBucketLabel('month', '202610')).toBe('10');
  });

  it('季：完整 = YYYYQn，短 = Qn', () => {
    expect(fullBucketLabel('quarter', '2026Q1')).toBe('2026Q1');
    expect(shortBucketLabel('quarter', '2026Q1')).toBe('Q1');
  });

  it('周：完整 = 锚日 YYYYMMDD（无分隔符），短 = MM-DD；维表没有的周号回退桶号', () => {
    const r = dimTime[Math.floor(dimTime.length / 2)];
    expect(fullBucketLabel('week', r.week_id)).toBe(r.week_wed_date.replace(/-/g, ''));
    expect(fullBucketLabel('week', r.week_id)).toMatch(/^\d{8}$/);
    expect(shortBucketLabel('week', r.week_id)).toBe(r.week_wed_date.slice(5));
    expect(fullBucketLabel('week', '000001')).toBe('000001');
  });
});

describe('axisTickPlan', () => {
  it('边界刻度恒在且完整格式；中间刻度短格式', () => {
    const plan = axisTickPlan('month', MONTHS, 4, [0, MONTHS.length - 1]);
    expect(plan.indexes[0]).toBe(0);
    expect(plan.indexes[plan.indexes.length - 1]).toBe(MONTHS.length - 1);
    expect(plan.isEdge(0)).toBe(true);
    expect(plan.isEdge(MONTHS.length - 1)).toBe(true);
    expect(plan.dateText(0)).toBe('202509');
    expect(plan.dateText(MONTHS.length - 1)).toBe('202608');
    expect(plan.isEdge(4)).toBe(false);
    expect(plan.dateText(4)).toBe('01');
  });

  it('跨年：换年后的首个中间刻度补年份行；边界刻度年份已内联不再补', () => {
    const plan = axisTickPlan('month', MONTHS, 4, [0, MONTHS.length - 1]);
    // 抽稀 0/4/8 + 边界 11：4 = 202601（2025→2026 换年落在 (0,4]）
    expect(plan.indexes).toEqual([0, 4, 8, 11]);
    expect(plan.yearText(0)).toBeNull();
    expect(plan.yearText(4)).toBe('2026');
    expect(plan.yearText(8)).toBeNull();
    expect(plan.yearText(11)).toBeNull();
  });

  it('同年区间：中间刻度不带年份行', () => {
    const ids = MONTHS.slice(4); // 202601..202608
    const plan = axisTickPlan('month', ids, 2, [0, ids.length - 1]);
    for (const i of plan.indexes) expect(plan.yearText(i)).toBeNull();
  });

  it('与边界距离 ≤1 的抽稀刻度让位（防完整文案与短文案叠字）', () => {
    const plan = axisTickPlan('month', MONTHS, 4, [0, 5]);
    expect(plan.indexes).toEqual([0, 5, 8]); // 4 与边界 5 相邻 → 让位
    expect(plan.dateText(5)).toBe('202602');
  });

  it('查看窗口两端作为 marks（刷选轨道口径）：窗口端点完整格式，域端点仍是普通刻度', () => {
    const plan = axisTickPlan('quarter', QUARTERS, 1, [1, 2]);
    expect(plan.isEdge(1)).toBe(true);
    expect(plan.isEdge(2)).toBe(true);
    expect(plan.dateText(1)).toBe('2025Q4');
    expect(plan.dateText(2)).toBe('2026Q1');
    // 0 与 1 相邻、3 与 2 相邻 → 均让位，只剩两端窗口刻度
    expect(plan.indexes).toEqual([1, 2]);
  });

  it('首刻度非边界时带年份行（域起点年份可见）', () => {
    const plan = axisTickPlan('quarter', QUARTERS, 1, [3]);
    expect(plan.indexes).toEqual([0, 1, 3]);
    expect(plan.yearText(0)).toBe('2025');
    expect(plan.dateText(0)).toBe('Q3');
    expect(plan.yearText(1)).toBeNull();
  });

  it('单桶退化：只有一个边界刻度', () => {
    const plan = axisTickPlan('month', ['202610'], 1, [0]);
    expect(plan.indexes).toEqual([0]);
    expect(plan.dateText(0)).toBe('202610');
  });
});
