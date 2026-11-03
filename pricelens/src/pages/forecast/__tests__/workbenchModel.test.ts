// ============================================================
// 推演工作台 v2 纯函数金测（forecast-workbench-v2 · 2026-11-03 晚纲领版）：
// 大盘纯时间序列基线（季节 × 趋势，AI 第一版）+ 人工改格、
// 行业级事件四件套周乘子（递减默认，可落历史段）、主图小事件局部修正、
// 库存验证定序（基线 SO → 反算 DOS/库存 → 刚性砍 min(SO, 可售)）、
// SI 月计划均分、手调原因必填。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import {
  baseWorkbenchParams,
  clearManualAdjustment,
  computeMarketFactor,
  computeWorkbench,
  DOS_BAND,
  effectiveQuarterIndexes,
  eventWeeklyFactor,
  isParamsActive,
  judgeInventoryHealth,
  marketSeriesBaseline,
  productEventFactorAt,
  setManualAdjustment,
  siWeeklyPlan,
  unitCostOfWeek,
  type InventoryRow,
  type WorkbenchParams,
} from '../workbenchModel';

const fixture = workbenchFixture;
const base = baseWorkbenchParams(fixture);
const compute = (params: WorkbenchParams) => computeWorkbench(fixture, params);
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
    expect(isParamsActive(base, fixture)).toBe(false);
  });

  it('大盘倍数口径：无事件+AI 格 = 1；预填默认事件直接叠加（W45 无覆盖 = 1，W46 峰值 = 1.08）', () => {
    for (let weekNumber = 45; weekNumber <= 52; weekNumber += 1) {
      const noEvent = computeMarketFactor(fixture, { ...base, marketEvents: [] }, weekNumber);
      expect(noEvent).toBe(1);
    }
    expect(computeMarketFactor(fixture, base, 45)).toBe(1);
    expect(computeMarketFactor(fixture, base, 46)).toBeCloseTo(1.08, 5);
    expect(forecastOf().find((week) => week.weekNumber === 45)?.unconstrained).toBe(fixture.basePath[0]);
  });
});

describe('推演工作台 · 大盘纯时间序列基线（AI 第一版）', () => {
  it('基线 = 周期性季节因素 × 全局性趋势因素（可手工复算）', () => {
    const { aiQ4, aiQ1 } = marketSeriesBaseline(fixture);
    const values = fixture.market.quarters.map((quarter) => quarter.value);
    const ly = values.slice(0, 4);
    const ty = values.slice(4);
    const avg = (list: number[]): number => list.reduce((sum, v) => sum + v, 0) / list.length;
    const trend = avg(ty) / avg(ly);
    const expectQ4 = Math.round(ty[2] * (ly[3] / ly[2]) * trend * 10) / 10;
    const expectQ1 = Math.round(expectQ4 * (ly[0] / ly[3]) * trend * 10) / 10;
    expect(aiQ4).toBe(expectQ4);
    expect(aiQ1).toBe(expectQ1);
  });

  it('人工改格：override 优先于 AI 基线；还原后回 AI；marketQuarters 附 aiBaseline', () => {
    const tuned = { ...base, q4Override: 120, overrideSource: 'human' as const };
    expect(effectiveQuarterIndexes(fixture, tuned).q4Index).toBe(120);
    expect(effectiveQuarterIndexes(fixture, base).q4Index).toBe(marketSeriesBaseline(fixture).aiQ4);
    const result = compute(tuned);
    expect(result.marketQuarters[7]).toMatchObject({ key: '2026Q4', value: 120, aiBaseline: marketSeriesBaseline(fixture).aiQ4 });
    // 改格比率作用于主图预测周（W45–52 全在 2026Q4）：上修改 → 全线上修
    const ratio = 120 / marketSeriesBaseline(fixture).aiQ4;
    expect(ratio).toBeGreaterThan(1);
    expect(forecastOf(result).every((week, index) => (week.unconstrained as number) > fixture.basePath[index])).toBe(true);
    expect(result.marketQuarters[8].value).toBe(marketSeriesBaseline(fixture).aiQ1); // Q1 未改 = AI
  });

  it('主图预测挂 AI 第一版语义：基准考量 overrideSource = ai', () => {
    expect(base.overrideSource).toBe('ai');
    expect(base.q4Override).toBeNull();
  });
});

describe('推演工作台 · 行业级事件四件套（周粒度 + 衰减）', () => {
  it('周乘子：覆盖周内递减（线性从峰值衰减），覆盖外 null', () => {
    const event = { id: 'e', label: 'x', startWeek: 46, durationWeeks: 4, magnitudePct: 8, decay: 'decreasing' as const };
    expect(eventWeeklyFactor(event, 45)).toBeNull();
    expect(eventWeeklyFactor(event, 46)).toBeCloseTo(1.08, 5);
    expect(eventWeeklyFactor(event, 47)).toBeCloseTo(1.06, 5);
    expect(eventWeeklyFactor(event, 49)).toBeCloseTo(1.02, 5);
    expect(eventWeeklyFactor(event, 50)).toBeNull();
    const flat = { ...event, decay: 'flat' as const };
    expect(eventWeeklyFactor(flat, 48)).toBeCloseTo(1.08, 5);
  });

  it('递减事件作用于覆盖周：峰值周上修最多，衰减周递减；非覆盖周不变', () => {
    const result = compute(base);
    const byWeek = new Map(forecastOf(result).map((week) => [week.weekNumber, week.unconstrained as number]));
    const evFold = base.marketEvents.find((event) => event.id === 'ev-fold');
    expect(evFold?.startWeek).toBe(46);
    // W45 未覆盖 = basePath 原值；W46 峰值 ×1.08；W47 递减 ×1.064
    expect(byWeek.get(45)).toBe(fixture.basePath[0]);
    expect(byWeek.get(46)).toBe(Math.round(fixture.basePath[1] * 1.08));
    expect(byWeek.get(47)).toBe(Math.round(fixture.basePath[2] * 1.064));
  });

  it('历史段事件（startWeek < 45）只作解释标记，不影响预测推演', () => {
    const historical = { ...base, marketEvents: [{ id: 'ev-h', label: '国庆旺季', startWeek: 40, durationWeeks: 4, magnitudePct: 10, decay: 'decreasing' as const }] };
    const result = compute(historical);
    expect(forecastOf(result).map((week) => week.unconstrained)).toEqual(fixture.basePath);
  });

  it('删除预填事件 → 覆盖周回落到无事件口径；新增事件 → 覆盖周下压', () => {
    const removed = compute({ ...base, marketEvents: base.marketEvents.filter((event) => event.id !== 'ev-mem') });
    const removedByWeek = new Map(forecastOf(removed).map((week) => [week.weekNumber, week.unconstrained as number]));
    // ev-mem（W50–52，−6% 递减）删除后 W50 只剩 ev-fold 尾乘子：47000 × 1.016 = 47752
    expect(removedByWeek.get(50)).toBe(Math.round(fixture.basePath[5] * 1.016));
    const added = compute({ ...base, marketEvents: [...base.marketEvents, { id: 'ev-new', label: '新增', startWeek: 45, durationWeeks: 2, magnitudePct: -10, decay: 'decreasing' }] });
    expect(forecastOf(added).find((week) => week.weekNumber === 45)?.unconstrained)
      .toBeLessThan(forecastOf().find((week) => week.weekNumber === 45)?.unconstrained as number);
  });
});

describe('推演工作台 · 主图小事件（产品级三类，参考回放幅度局部修正）', () => {
  it('锚定单周乘子：只改锚定周的基线 SO', () => {
    const events = [{ id: 'pe-1', type: 'competitor-launch' as const, label: '竞品上市', week: 46, magnitudePct: -5, replayId: 'rp-comp-promo' }];
    expect(productEventFactorAt(events, 45)).toBe(1);
    expect(productEventFactorAt(events, 46)).toBeCloseTo(0.95, 5);
    expect(productEventFactorAt(events, 47)).toBe(1);
    const result = compute({ ...base, productEvents: events });
    const byWeek = new Map(forecastOf(result).map((week) => [week.weekNumber, week.unconstrained as number]));
    expect(byWeek.get(45)).toBe(fixture.basePath[0]);
    // W46 叠加 ev-fold 峰值（×1.08）与事件（×0.95）
    expect(byWeek.get(46)).toBe(Math.round(fixture.basePath[1] * 1.08 * 0.95));
    // consider 注入主图小事件条目
    const consider46 = forecastOf(result).find((week) => week.weekNumber === 46)?.consider ?? [];
    expect(consider46.some((item) => item.kind === 'productEvent' && item.label === '竞品上市')).toBe(true);
  });
});

describe('推演工作台 · 库存验证（定序 + 刚性砍 + SI 月计划）', () => {
  it('SI 月计划均分到周：11 月（W45–48）/ 12 月（W49–52）', () => {
    const plan = siWeeklyPlan(fixture, base.siPlanMonthly);
    const nov = base.siPlanMonthly['2026-11'];
    const dec = base.siPlanMonthly['2026-12'];
    expect(plan.get(45)).toBe(Math.round(nov / 4));
    expect(plan.get(48)).toBe(Math.round(nov / 4));
    expect(plan.get(49)).toBe(Math.round(dec / 4));
    // 月加量 → 该月各周 SI 同步上调
    const more = siWeeklyPlan(fixture, { ...base.siPlanMonthly, '2026-11': nov + 40000 });
    expect(more.get(45)! - plan.get(45)!).toBe(10000);
  });

  it('基准演示：W50 起可售不足 → 刚性砍 min(基线 SO, 可售) 回写主图', () => {
    expect(baseline.firstAdjustedWeek).toBe(50);
    expect(baseline.summary.gap).toBeGreaterThan(0);
    const cappedWeeks = forecastOf().filter((week) => week.capped);
    expect(cappedWeeks.map((week) => week.week)).toEqual(['W50', 'W51', 'W52']);
    for (const week of cappedWeeks) {
      // 刚性砍语义：final < 基线 SO（可售不足），期末库存见底
      expect(week.final).toBeLessThan(week.unconstrained as number);
      expect(week.channelInv).toBe(0);
    }
  });

  it('SI 加量使库存可支撑 → 不再砍，主图回到基线 SO 口径', () => {
    const healthy = compute({ ...base, siPlanMonthly: { ...base.siPlanMonthly, '2026-12': 400000 } });
    expect(healthy.summary.gap).toBe(0);
    expect(healthy.firstAdjustedWeek).toBeNull();
    expect(forecastOf(healthy).every((week) => week.capped === false && week.final === week.unconstrained)).toBe(true);
  });

  it('库存推演自洽：期末 = 上期 + SI − 实际销量（历史实际 / 预测周含刚性砍）', () => {
    let inv = fixture.inventory.initialChannelInv;
    for (const week of baseline.weeks) {
      inv = inv + week.si - (week.final as number);
      expect(week.channelInv).toBe(inv);
    }
  });

  it('DOS = 期末库存 ÷ 近 4 周平均销量 × 7；全流程 = 渠道 × 演示系数', () => {
    const week50 = baseline.weeks.find((week) => week.weekNumber === 50);
    const window = baseline.weeks.filter((week) => week.weekNumber >= 47 && week.weekNumber <= 50)
      .map((week) => (week.status === 'actual' ? (week.sales as number) : (week.final as number)));
    const avg = window.reduce((total, v) => total + v, 0) / window.length;
    expect(week50?.channelDos).toBe(Math.round((week50!.channelInv / avg) * 7 * 10) / 10);
    expect(week50?.fullDos).toBeCloseTo(week50!.channelDos * fixture.inventory.fullDosFactor, 1);
  });

  it('健康判定（预警解释）：DOS 带内 + 降幅小 = 健康；越界/降幅超阈给出解释，砍周给刚性修正读数', () => {
    const row = (weekNumber: number, dos: number, inv: number, capped: boolean): InventoryRow => ({
      weekNumber, status: 'forecast', desiredSales: 40000, sales: capped ? 36000 : 40000, capped, si: 0, channelInv: inv, channelDos: dos,
    });
    const prep: InventoryRow[] = [41, 42, 43, 44].map((weekNumber) => row(weekNumber, 80, 100000, false));
    const judgeWith = (dos: number, inv: number, capped: boolean) => judgeInventoryHealth([...prep, row(45, dos, inv, capped)])[4];
    expect(judgeWith(80, 95000, false).reasonText).toContain('库存可支撑');
    expect(judgeWith(65, 95000, false).dosOk).toBe(false);
    expect(judgeWith(80, 79000, false).crash).toBe('light');
    expect(judgeWith(80, 69000, false).crash).toBe('heavy');
    const capped = judgeWith(65, 30000, true);
    expect(capped.reasonText).toContain('刚性修正至');
    expect(DOS_BAND.min).toBe(70);
  });
});

describe('推演工作台 · 摘要与销毛（链路末端独立推测）', () => {
  it('预测期销毛 = Σ 最终柱 ×（价格 − 当月版本成本），月版本按周生效', () => {
    expect(unitCostOfWeek(fixture, 44)).toBe(598);
    expect(unitCostOfWeek(fixture, 45)).toBe(591);
    expect(unitCostOfWeek(fixture, 49)).toBe(585);
    const margin = forecastOf().reduce((total, week) => total + (week.final as number) * (week.price - unitCostOfWeek(fixture, week.weekNumber)), 0);
    expect(Math.round(baseline.summary.forecastMargin)).toBe(Math.round(margin));
  });

  it('摘要：总销量/峰/缺口与逐周一致', () => {
    const total = forecastOf().reduce((sum, week) => sum + (week.final ?? 0), 0);
    expect(baseline.summary.totalSales).toBe(total);
    const gap = forecastOf().reduce((sum, week) => sum + Math.max(0, (week.unconstrained ?? 0) - (week.final ?? 0)), 0);
    expect(baseline.summary.gap).toBe(gap);
    expect(baseline.summary.peak.weekNumber).toBe(47);
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
    expect(forecastOf(tunedResult).find((week) => week.weekNumber === 46)?.final)
      .toBe(forecastOf().find((week) => week.weekNumber === 46)?.final);
    const restored = compute(clearManualAdjustment(tuned as WorkbenchParams, 47));
    expect(forecastOf(restored).find((week) => week.weekNumber === 47)?.final)
      .toBe(forecastOf().find((week) => week.weekNumber === 47)?.final);
  });
});
