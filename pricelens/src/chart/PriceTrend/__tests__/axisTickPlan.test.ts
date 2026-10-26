// ============================================================
// 时间轴刻度计划金测（第一百一十九轮引入；第一百二十三轮改口径；第一百五十二轮
// 再改：周主行 = YYYYWxx 自带年份如 2026W24、跨年判定取桶号年）；年份独立第二行
// （月/季：最左侧显示的刻度恒带年份，其余刻度与上一显示刻度之间换年才带）；与
// 边界贴得太近的抽稀刻度让位；像素让位纯函数 hideOverlappingTicks。
// 图轴（chartModel）/ 刷选轨道（XBrush）/ 面板独立轨道（PanelTimeTrack）同源。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimTime } from '../../../data';
import { axisTickPlan, fullBucketLabel, hideOverlappingTicks, shortBucketLabel } from '../helpers';

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

  it('周：完整 = 锚日 YYYYMMDD（无分隔符，仅留给无障碍文案），短 = YYYYWxx（自带年份）；维表没有的周号回退桶号', () => {
    const r = dimTime[Math.floor(dimTime.length / 2)];
    expect(fullBucketLabel('week', r.week_id)).toBe(r.week_wed_date.replace(/-/g, ''));
    expect(fullBucketLabel('week', r.week_id)).toMatch(/^\d{8}$/);
    expect(shortBucketLabel('week', r.week_id)).toBe(`${r.week_id.slice(0, 4)}W${r.week_id.slice(4)}`);
    expect(shortBucketLabel('week', r.week_id)).toMatch(/^\d{4}W\d{2}$/);
    expect(fullBucketLabel('week', '000001')).toBe('000001');
  });
});

describe('axisTickPlan（第一百二十三轮口径）', () => {
  it('主行恒短格式：边界刻度（marks）也不再完整格式', () => {
    const plan = axisTickPlan('month', MONTHS, 4, [0, MONTHS.length - 1]);
    expect(plan.indexes[0]).toBe(0);
    expect(plan.indexes[plan.indexes.length - 1]).toBe(MONTHS.length - 1);
    expect(plan.isEdge(0)).toBe(true);
    expect(plan.isEdge(MONTHS.length - 1)).toBe(true);
    expect(plan.dateText(0)).toBe('09'); // 旧口径为完整格式 202509
    expect(plan.dateText(MONTHS.length - 1)).toBe('08');
    expect(plan.isEdge(4)).toBe(false);
    expect(plan.dateText(4)).toBe('01');
  });

  it('年份行：最左侧显示的刻度恒带；其余与上一显示刻度之间换年才带（边界不再例外）', () => {
    const plan = axisTickPlan('month', MONTHS, 4, [0, MONTHS.length - 1]);
    // 抽稀 0/4/8 + 边界 11：4 = 202601（2025→2026 换年落在 (0,4]）
    expect(plan.indexes).toEqual([0, 4, 8, 11]);
    expect(plan.yearText(0)).toBe('2025'); // 最左显示刻度恒带（边界身份不影响）
    expect(plan.yearText(4)).toBe('2026');
    expect(plan.yearText(8)).toBeNull();
    expect(plan.yearText(11)).toBeNull();
  });

  it('同年区间：最左刻度仍带年份，其余不带', () => {
    const ids = MONTHS.slice(4); // 202601..202608
    const plan = axisTickPlan('month', ids, 2, [0, ids.length - 1]);
    expect(plan.yearText(plan.indexes[0])).toBe('2026'); // 第一百二十三轮：最左恒带
    for (const i of plan.indexes.slice(1)) expect(plan.yearText(i)).toBeNull();
  });

  it('与边界距离 ≤1 的抽稀刻度让位（防叠字，旧规则保留）', () => {
    const plan = axisTickPlan('month', MONTHS, 4, [0, 5]);
    expect(plan.indexes).toEqual([0, 5, 8]); // 4 与边界 5 相邻 → 让位
    expect(plan.dateText(5)).toBe('02');
  });

  it('查看窗口两端作为 marks（刷选轨道口径）：恒显示且标记边界，主行仍是短格式、年份行规则同源', () => {
    const plan = axisTickPlan('quarter', QUARTERS, 1, [1, 2]);
    expect(plan.isEdge(1)).toBe(true);
    expect(plan.isEdge(2)).toBe(true);
    expect(plan.dateText(1)).toBe('Q4'); // 旧口径为完整格式 2025Q4
    expect(plan.dateText(2)).toBe('Q1');
    // 0 与 1 相邻、3 与 2 相邻 → 均让位，只剩两端窗口刻度
    expect(plan.indexes).toEqual([1, 2]);
    expect(plan.yearText(1)).toBe('2025'); // 最左显示刻度恒带
    expect(plan.yearText(2)).toBe('2026'); // 换年刻度带
  });

  it('最左显示刻度非边界时同样带年份行（域起点年份可见）', () => {
    const plan = axisTickPlan('quarter', QUARTERS, 1, [3]);
    expect(plan.indexes).toEqual([0, 1, 3]);
    expect(plan.yearText(0)).toBe('2025');
    expect(plan.dateText(0)).toBe('Q3');
    expect(plan.yearText(1)).toBeNull();
    expect(plan.yearText(3)).toBe('2026'); // 2025Q4 → 2026Q1 换年
  });

  it('单桶退化：唯一刻度短格式 + 年份行', () => {
    const plan = axisTickPlan('month', ['202610'], 1, [0]);
    expect(plan.indexes).toEqual([0]);
    expect(plan.dateText(0)).toBe('10'); // 旧口径为完整格式 202610
    expect(plan.yearText(0)).toBe('2026');
  });

  it('周粒度：边界主行 = YYYYWxx 自带年份（完整格式只留给无障碍文案）', () => {
    const r = dimTime[Math.floor(dimTime.length / 2)];
    const plan = axisTickPlan('week', [r.week_id], 1, [0]);
    expect(plan.dateText(0)).toBe(`${r.week_id.slice(0, 4)}W${r.week_id.slice(4)}`);
    expect(plan.yearText(0)).toBe(r.week_id.slice(0, 4)); // 跨年判定取桶号年（152 轮）
  });

  it('周粒度跨年：换年刻度年行 = 桶号年（标签 2027W01 自证年份，消费方省略年行）', () => {
    const plan = axisTickPlan('week', ['202651', '202652', '202653', '202701'], 1, [0, 3]);
    expect(plan.indexes).toEqual([0, 3]); // 1、2 与两端 mark 相邻 → 让位
    expect(plan.dateText(3)).toBe('2027W01');
    expect(plan.yearText(3)).toBe('2027'); // 202653 → 202701 换年（按桶号年判定）
  });
});

describe('hideOverlappingTicks（像素让位纯函数，第一百二十三轮）', () => {
  it('与两端标签像素区间相交（含安全间距）的中间刻度隐藏，其余保留', () => {
    // 轨道 100px：左端标签占 [0,20]、右端标签占 [85,100]；中间刻度盒 [14,22] / [36,44] / [88,96]
    const mids = [
      { x: 18, w: 8 },
      { x: 40, w: 8 },
      { x: 92, w: 8 },
    ];
    const edges = [
      { x: 10, w: 20 },
      { x: 92.5, w: 15 },
    ];
    expect(hideOverlappingTicks(mids, edges, 4)).toEqual([true, false, true]);
  });

  it('间距恰好等于 gap 不算相交；gap 放大后同位置判为相交', () => {
    // 刻度盒 [25,35]、端标签盒 [15,25]：恰好贴边
    expect(hideOverlappingTicks([{ x: 30, w: 10 }], [{ x: 20, w: 10 }], 0)).toEqual([false]);
    expect(hideOverlappingTicks([{ x: 30, w: 10 }], [{ x: 20, w: 10 }], 4)).toEqual([true]);
  });

  it('无端标签（空 edges）→ 全保留', () => {
    expect(hideOverlappingTicks([{ x: 5, w: 4 }, { x: 80, w: 6 }], [], 4)).toEqual([false, false]);
  });
});
