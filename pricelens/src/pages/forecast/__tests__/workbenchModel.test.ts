// ============================================================
// 推演工作台 v2 纯函数金测（forecast-workbench-v2）：
// 预测链联动（大盘环比 / 事件 / SI 计划 / 手调 → 主图最终柱与缺口）、
// 库存推演自洽与健康判定打折（演示规则）、纪要追加、纪要 HTML 导出。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import {
  appendMemo,
  baseWorkbenchParams,
  buildMemoHtml,
  clearManualAdjustment,
  computeWorkbench,
  DISCOUNT_HEAVY,
  DISCOUNT_LIGHT,
  DOS_BAND,
  forecastQuarterIndex,
  isParamsActive,
  judgeInventoryHealth,
  marketFactorAt,
  memoTimeAt,
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
  it('Q4 环比降幅加深 → 预测周全线下调，历史段不动，摘要同步', () => {
    const deeper = compute({ ...base, qoqDeclinePct: base.qoqDeclinePct - 4, qoqSource: 'human' });
    const before = forecastOf().map((week) => week.unconstrained as number);
    const after = forecastOf(deeper).map((week) => week.unconstrained as number);
    expect(after.every((value, index) => value < before[index])).toBe(true);
    expect(deeper.weeks.slice(0, 8)).toEqual(baseline.weeks.slice(0, 8));
    expect(deeper.summary.totalSales).toBeLessThan(baseline.summary.totalSales);
    expect(forecastQuarterIndex(workbenchFixture, -8)).toBeLessThan(forecastQuarterIndex(workbenchFixture, -4));
  });

  it('事件幅度上调只影响生效周及之后，生效周之前逐周不变', () => {
    const folded = base.marketEvents.map((event) => (event.id === 'ev-fold' ? { ...event, magnitudePct: 12 } : event));
    const adjusted = compute({ ...base, marketEvents: folded });
    const beforeByWeek = new Map(forecastOf().map((week) => [week.weekNumber, week.unconstrained as number]));
    const afterByWeek = new Map(forecastOf(adjusted).map((week) => [week.weekNumber, week.unconstrained as number]));
    expect(afterByWeek.get(46)).toBe(beforeByWeek.get(46));
    expect(afterByWeek.get(47)!).toBeGreaterThan(beforeByWeek.get(47)!);
    expect(afterByWeek.get(52)!).toBeGreaterThan(beforeByWeek.get(52)!);
  });

  it('删除事件 → 生效周起预测回升；新增事件 → 生效周起预测下压', () => {
    const removed = compute({ ...base, marketEvents: base.marketEvents.filter((event) => event.id !== 'ev-mem') });
    const removedByWeek = new Map(forecastOf(removed).map((week) => [week.weekNumber, week.unconstrained as number]));
    expect(removedByWeek.get(49)).toBe(forecastOf().find((week) => week.weekNumber === 49)?.unconstrained);
    expect(removedByWeek.get(50)!).toBeGreaterThan(forecastOf().find((week) => week.weekNumber === 50)?.unconstrained as number);

    const added = compute({ ...base, marketEvents: [...base.marketEvents, { id: 'ev-new', label: '新增事件', magnitudePct: -10, startWeek: 45 }] });
    expect(forecastOf(added).find((week) => week.weekNumber === 45)?.unconstrained)
      .toBeLessThan(forecastOf().find((week) => week.weekNumber === 45)?.unconstrained as number);
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

describe('推演工作台 · 纪要', () => {
  it('追加纪要：纯函数不改原数组，id / 演示时钟 / 操作人自动分配，原因保留', () => {
    const first = appendMemo([], { type: '生成', content: '按默认考量生成基准预测', operator: '系统' });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ id: 'memo-1', time: memoTimeAt(0), type: '生成', operator: '系统' });
    const second = appendMemo(first, { type: '考量', content: 'Q4 环比 −4% → −8%', reason: '预售前置分流，保守取值' });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(second[1]).toMatchObject({ id: 'memo-2', time: memoTimeAt(1), operator: '王峰', reason: '预售前置分流，保守取值' });
    expect(memoTimeAt(0)).toBe('14:02');
    expect(memoTimeAt(1)).toBe('14:04');
    // 空白原因不落纪要字段。
    expect(appendMemo(second, { type: '纪要', content: '生成纪要', reason: '  ' })[2].reason).toBeUndefined();
  });

  it('纪要 HTML 文档：含演示边界声明、当前考量与全部调整记录', () => {
    const memo = appendMemo(
      appendMemo([], { type: '生成', content: '按默认考量生成基准预测', operator: '系统' }),
      { type: '手调', content: 'W47 预测销量微调为 6.0 万台', reason: '黑五主峰周，电商资源加投' },
    );
    const html = buildMemoHtml({ fixture: workbenchFixture, params: base, result: baseline, memo });
    expect(html).toContain('不作为业务事实');
    expect(html).toContain('大盘 Q4 环比 -4%（AI 判断）');
    expect(html).toContain('黑五主峰周，电商资源加投');
    expect(html).toContain('库存修正周：W50、W51、W52');
    expect(html).toContain('调整记录（2 条）');
  });
});
