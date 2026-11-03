// ============================================================
// 推演工作台 v2 纯函数金测（forecast-workbench-v2）：
// 预测链联动（大盘季度趋势 / 行业级事件三参数 / SI 计划 / 手调 → 主图最终柱
// 与缺口）、大盘季度单序列推演（2026Q4 当前季 + 2027Q1 下一季）、
// 库存推演自洽与健康判定打折（演示规则）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import {
  baseWorkbenchParams,
  clearManualAdjustment,
  computeWorkbench,
  DISCOUNT_HEAVY,
  DISCOUNT_LIGHT,
  DOS_BAND,
  forecastQuarterIndexes,
  isEventActiveIn,
  isParamsActive,
  judgeInventoryHealth,
  marketFactorAt,
  setManualAdjustment,
  unitCostOfWeek,
  type InventoryRow,
  type WorkbenchParams,
} from '../workbenchModel';

const base = baseWorkbenchParams(workbenchFixture);
const compute = (params: WorkbenchParams) => computeWorkbench(workbenchFixture, params);
const baseline = compute(base);
const forecastOf = (result = baseline) => result.weeks.filter((week) => week.status === 'forecast');

describe('推演工作台 · 周结构与确定性', () => {
  it('相同输入两次计算完全一致', () => {
    expect(compute(base)).toEqual(compute(base));
  });

  it('16 周结构：W37–W44 演示实际 + W45–W52 预测；基准考量不偏离基准', () => {
    expect(baseline.weeks).toHaveLength(16);
    expect(baseline.weeks.slice(0, 8).every((week) => week.status === 'actual' && week.sales != null && week.final === week.sales)).toBe(true);
    expect(baseline.weeks.slice(8).every((week) => week.status === 'forecast' && week.sales == null)).toBe(true);
    expect(isParamsActive(base, workbenchFixture)).toBe(false);
  });

  it('基准考量下大盘倍数为 1：不含库存限制的预测 = 基准走势', () => {
    for (let weekNumber = 45; weekNumber <= 52; weekNumber += 1) {
      expect(marketFactorAt(base, base, weekNumber)).toBe(1);
    }
    expect(forecastOf().map((week) => week.unconstrained)).toEqual(workbenchFixture.basePath);
  });
});

describe('推演工作台 · 预测链联动', () => {
  it('季度环比加深 → 预测周全线下调，历史段不动，摘要同步', () => {
    const deeper = compute({ ...base, qoqDeclinePct: base.qoqDeclinePct - 4, qoqSource: 'human' });
    const before = forecastOf().map((week) => week.unconstrained as number);
    const after = forecastOf(deeper).map((week) => week.unconstrained as number);
    expect(after.every((value, index) => value < before[index])).toBe(true);
    expect(deeper.weeks.slice(0, 8)).toEqual(baseline.weeks.slice(0, 8));
    expect(deeper.summary.totalSales).toBeLessThan(baseline.summary.totalSales);
    expect(forecastQuarterIndexes(workbenchFixture, -8, base.marketEvents).q4Index)
      .toBeLessThan(forecastQuarterIndexes(workbenchFixture, -4, base.marketEvents).q4Index);
  });

  it('大盘季度单序列：8 个实际季 + 2026Q4/2027Q1 两格推演（逐季连乘含事件）', () => {
    const quarters = baseline.marketQuarters;
    expect(quarters).toHaveLength(9); // fixture 实际 7 季（2025Q1–2026Q3）+ 2 推演
    expect(quarters.slice(0, 7).every((point) => point.status === 'actual')).toBe(true);
    expect(quarters.slice(7).every((point) => point.status === 'forecast')).toBe(true);
    expect(quarters[7]).toMatchObject({ key: '2026Q4' });
    expect(quarters[8]).toMatchObject({ key: '2027Q1' });
    // 逐季连乘可复算：Q4 = Q3 × (1+环比) × 事件(Q4)；Q1' = Q4 × (1+环比) × 事件(Q1)
    const q3 = quarters[6].value;
    const q4Manual = Math.round(q3 * (1 + base.qoqDeclinePct / 100) * (1 + 0.08) * 10) / 10; // ev-fold 2026Q4 起 +8%
    expect(quarters[7].value).toBe(q4Manual);
    // 事件按季生效：ev-mem（2027Q1 起）不影响 2026Q4，但影响下一季
    const mem = base.marketEvents.find((event) => event.id === 'ev-mem');
    expect(mem && isEventActiveIn(mem, '2026Q4')).toBe(false);
    expect(mem && isEventActiveIn(mem, '2027Q1')).toBe(true);
  });

  it('事件三参数：幅度作用于生效季的预测周；改持续季数只改下一季读数', () => {
    // ev-fold（2026Q4 起生效）幅度上调 → 主图预测周（全部在 2026Q4）上调
    const folded = base.marketEvents.map((event) => (event.id === 'ev-fold' ? { ...event, magnitudePct: 12 } : event));
    const adjusted = compute({ ...base, marketEvents: folded });
    const beforeByWeek = new Map(forecastOf().map((week) => [week.weekNumber, week.unconstrained as number]));
    const afterByWeek = new Map(forecastOf(adjusted).map((week) => [week.weekNumber, week.unconstrained as number]));
    expect([...afterByWeek.values()].every((value, index) => value > [...beforeByWeek.values()][index])).toBe(true);
    // ev-fold 持续缩到 1 季 → 2027Q1 不再受其抬升，下一季指数下降；主图（2026Q4）不变
    const shorter = compute({ ...base, marketEvents: base.marketEvents.map((event) => (event.id === 'ev-fold' ? { ...event, durationQuarters: 1 } : event)) });
    expect(shorter.marketQuarters[8].value).toBeLessThan(baseline.marketQuarters[8].value);
    expect(shorter.marketQuarters[7].value).toBe(baseline.marketQuarters[7].value);
  });

  it('删除 / 新增事件：只影响其生效季（主图窗口 = 2026Q4）', () => {
    // 删除 ev-mem（仅生效于 2027Q1）→ 主图逐周不变、下一季指数上修
    const removed = compute({ ...base, marketEvents: base.marketEvents.filter((event) => event.id !== 'ev-mem') });
    expect(forecastOf(removed).map((week) => week.unconstrained)).toEqual(forecastOf().map((week) => week.unconstrained));
    expect(removed.marketQuarters[8].value).toBeGreaterThan(baseline.marketQuarters[8].value);
    // 新增行业级事件（2026Q4 生效）→ 主图预测下压
    const added = compute({ ...base, marketEvents: [...base.marketEvents, { id: 'ev-new', label: '新增事件', magnitudePct: -10, startQuarter: '2026Q4', durationQuarters: 1 }] });
    expect(forecastOf(added).every((week) => (week.unconstrained as number) < (forecastOf().find((item) => item.weekNumber === week.weekNumber)?.unconstrained as number))).toBe(true);
  });

  it('SI 计划加量 → 预测 DOS 回到合理带 → 不再打折，主图最终柱回到不含库存限制口径', () => {
    // 基准演示：W50 起渠道 DOS 跌出合理带下限 → 打 9 折，形成库存修正缺口。
    expect(baseline.firstAdjustedWeek).toBe(50);
    expect(baseline.summary.gap).toBeGreaterThan(0);
    const healthySi = { ...base.siPlan, 50: 31000, 51: 40000, 52: 0 };
    const healthy = compute({ ...base, siPlan: healthySi });
    const lateWeeks = healthy.health.filter((row) => row.weekNumber >= 50);
    expect(lateWeeks.every((row) => row.dosOk && row.discount === 1)).toBe(true);
    expect(healthy.summary.gap).toBe(0);
    expect(healthy.firstAdjustedWeek).toBeNull();
    expect(forecastOf(healthy).every((week) => week.final === week.unconstrained)).toBe(true);
  });

  it('手调：原因必填（空原因拒绝），值覆盖该周最终柱，其他周不受影响，清除后恢复', () => {
    expect(setManualAdjustment(base, 47, 60000, '   ')).toBeNull();
    expect(setManualAdjustment(base, 47, -1, '原因')).toBeNull();
    const tuned = setManualAdjustment(base, 47, 60000, '黑五主峰周，电商资源加投');
    expect(tuned).not.toBeNull();
    const tunedResult = compute(tuned as WorkbenchParams);
    const tunedWeek = forecastOf(tunedResult).find((week) => week.weekNumber === 47);
    expect(tunedWeek?.final).toBe(60000);
    expect(tunedWeek?.manual?.reason).toBe('黑五主峰周，电商资源加投');
    expect(tunedWeek?.inventoryAdjusted).toBe(false);
    expect(forecastOf(tunedResult).find((week) => week.weekNumber === 46)?.final)
      .toBe(forecastOf().find((week) => week.weekNumber === 46)?.final);
    const restored = compute(clearManualAdjustment(tuned as WorkbenchParams, 47));
    expect(forecastOf(restored).find((week) => week.weekNumber === 47)?.final)
      .toBe(forecastOf().find((week) => week.weekNumber === 47)?.final);
  });

  it('预测期销毛 = Σ 最终柱 ×（价格 − 当月版本成本），月版本按周生效', () => {
    expect(unitCostOfWeek(workbenchFixture, 44)).toBe(598);
    expect(unitCostOfWeek(workbenchFixture, 45)).toBe(591);
    expect(unitCostOfWeek(workbenchFixture, 49)).toBe(585);
    const margin = forecastOf().reduce((total, week) => total + (week.final as number) * (week.price - unitCostOfWeek(workbenchFixture, week.weekNumber)), 0);
    expect(Math.round(baseline.summary.forecastMargin)).toBe(Math.round(margin));
  });
});

describe('推演工作台 · 库存推演与健康判定（演示规则）', () => {
  it('库存推演自洽：期末 = 上期 + SI − 销量（历史实际 / 预测周不含库存限制口径）', () => {
    let inv = workbenchFixture.inventory.initialChannelInv;
    for (const week of baseline.weeks) {
      const sales = week.status === 'actual' ? (week.sales as number) : (week.unconstrained as number);
      inv = inv + week.si - sales;
      expect(week.channelInv).toBe(inv);
    }
  });

  it('DOS = 期末库存 ÷ 近 4 周平均周销 × 7；全流程 = 渠道 × 演示系数', () => {
    const week50 = baseline.weeks.find((week) => week.weekNumber === 50);
    const window = baseline.weeks.filter((week) => week.weekNumber >= 47 && week.weekNumber <= 50)
      .map((week) => (week.status === 'actual' ? (week.sales as number) : (week.unconstrained as number)));
    const avg = window.reduce((total, v) => total + v, 0) / window.length;
    expect(week50?.channelDos).toBe(Math.round((week50!.channelInv / avg) * 7 * 10) / 10);
    expect(week50?.fullDos).toBeCloseTo(week50!.channelDos * workbenchFixture.inventory.fullDosFactor, 1);
  });

  it('判定与打折两档：健康不打折；单项不达标 9 折；降幅 ≥30% 或双不达标 8 折', () => {
    const row = (weekNumber: number, dos: number, inv: number, prevInv: number): InventoryRow => ({
      weekNumber, status: 'forecast', sales: 40000, si: 0, channelInv: inv, channelDos: dos,
    });
    // 通过前 4 行构造 prev 均值 = 100000，再给第 5 行不同库存水平。
    const prep: InventoryRow[] = [41, 42, 43, 44].map((weekNumber) => row(weekNumber, 80, 100000, 100000));
    const judgeWith = (dos: number, inv: number) => judgeInventoryHealth([...prep, row(45, dos, inv, 100000)])[4];
    // 健康：DOS 在带内，库存降幅 5%。
    expect(judgeWith(80, 95000).discount).toBe(1);
    // DOS 跌出下限（单项不达标）→ 9 折。
    const dosBreach = judgeWith(65, 95000);
    expect(dosBreach.discount).toBe(DISCOUNT_LIGHT);
    expect(dosBreach.dosOk).toBe(false);
    // DOS 超出上限同样视为不达标 → 9 折。
    expect(judgeWith(DOS_BAND.max + 5, 95000).discount).toBe(DISCOUNT_LIGHT);
    // 库存降幅 ≥20%（DOS 达标）→ 9 折。
    const crashLight = judgeWith(80, 79000);
    expect(crashLight.discount).toBe(DISCOUNT_LIGHT);
    expect(crashLight.crash).toBe('light');
    // 库存降幅 ≥30% → 8 折。
    const crashHeavy = judgeWith(80, 69000);
    expect(crashHeavy.discount).toBe(DISCOUNT_HEAVY);
    expect(crashHeavy.crash).toBe('heavy');
    // 降幅 ≥20% 且 DOS 同时越界 → 8 折。
    expect(judgeWith(65, 79000).discount).toBe(DISCOUNT_HEAVY);
  });

  it('基准演示：W50 起打 9 折修正并回写主图（最终柱 < 不含库存限制，缺口进摘要）', () => {
    const adjustedWeeks = forecastOf().filter((week) => week.inventoryAdjusted);
    expect(adjustedWeeks.map((week) => week.week)).toEqual(['W50', 'W51', 'W52']);
    for (const week of adjustedWeeks) {
      expect(week.discount).toBe(DISCOUNT_LIGHT);
      expect(week.final).toBe(Math.round((week.unconstrained as number) * DISCOUNT_LIGHT));
    }
    const expectedGap = adjustedWeeks.reduce((total, week) => total + ((week.unconstrained as number) - (week.final as number)), 0);
    expect(baseline.summary.gap).toBe(expectedGap);
    expect(baseline.firstAdjustedWeek).toBe(50);
  });
});
