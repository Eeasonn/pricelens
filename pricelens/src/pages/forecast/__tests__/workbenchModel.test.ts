// ============================================================
// 推演工作台 v2 纯函数金测（forecast-workbench-v2 · 2026-11-03 晚纲领版）：
// 大盘纯时间序列基线（季节 × 趋势，AI 第一版）+ 人工改格、
// 行业级事件四件套周乘子（递减默认，可落历史段）、主图小事件局部修正、
// 库存验证定序（基线 SO → 反算 DOS/库存 → 刚性砍 min(SO, 可售)）、
// SI 月计划均分、手调原因选填（2026-11-04 评审拍板）。
// 2026-11-04 补：大盘月度段断言（4 季外推确定性 + 月形分布容量守恒 +
// 月中事件均摊 + 按月调整季度同步）——完整金测见 __tests__/marketBusMonthly.test.ts。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import { marketEventDisposition } from '../workbenchTime';
import {
  baseWorkbenchParams,
  clearManualAdjustment,
  computeMarketFactor,
  computeMarketMonths,
  computeWorkbench,
  DOS_BAND,
  effectiveQuarterIndexes,
  eventWeeklyFactor,
  isParamsActive,
  judgeInventoryHealth,
  marketMonthEventFactor,
  marketQuarterForecast,
  marketSeriesBaseline,
  normalizeWorkbenchParams,
  productEventFactorAt,
  setManualAdjustment,
  siWeeklyPlan,
  unitCostOfWeek,
  withMarketMonthOverride,
  withQuarterOverride,
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

  it('手调：原因选填（2026-11-04 评审拍板，空原因照常应用；负值仍拒绝），值覆盖该周最终柱，其他周不受影响，清除后恢复', () => {
    // 空原因不再拦截：照常应用，reason 存空串（后台字段结构保留）
    const untuned = setManualAdjustment(base, 47, 60000, '   ');
    expect(untuned).not.toBeNull();
    expect(untuned?.manual[47]).toEqual({ value: 60000, reason: '' });
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

describe('推演工作台 · 事件处置联动与 flat 衰减全链', () => {
  it('历史事件跨界只解释：W44 起 2 周不影响 W45（computeMarketFactor 跳过 historical）', () => {
    const crossing = { id: 'ev-cross', label: '跨段事件', startWeek: 44, durationWeeks: 2, magnitudePct: 10, decay: 'decreasing' as const };
    expect(marketEventDisposition(fixture, crossing)).toBe('historical');
    expect(computeMarketFactor(fixture, { ...base, marketEvents: [crossing] }, 44 + 1)).toBe(1);
    const result = compute({ ...base, marketEvents: [crossing] });
    expect(forecastOf(result).map((week) => week.unconstrained)).toEqual(fixture.basePath);
    // 考量构成标注历史解释语义，不给预测周挂幅度
    const w45 = forecastOf(result).find((week) => week.weekNumber === 45);
    const evItem = w45?.consider.find((item) => item.kind === 'event');
    expect(evItem?.pct).toBeNull();
    expect(evItem?.note).toContain('历史');
  });

  it('decay=flat 全链：覆盖周全程峰值（末周不归零），覆盖外回落基线', () => {
    const flatParams = { ...base, marketEvents: [{ id: 'ev-flat', label: '恒定事件', startWeek: 46, durationWeeks: 4, magnitudePct: 8, decay: 'flat' as const }] };
    const byWeek = new Map(forecastOf(compute(flatParams)).map((week) => [week.weekNumber, week.unconstrained as number]));
    expect(byWeek.get(45)).toBe(fixture.basePath[0]);
    expect(byWeek.get(46)).toBe(Math.round(fixture.basePath[1] * 1.08));
    expect(byWeek.get(47)).toBe(Math.round(fixture.basePath[2] * 1.08));
    expect(byWeek.get(48)).toBe(Math.round(fixture.basePath[3] * 1.08));
    expect(byWeek.get(49)).toBe(Math.round(fixture.basePath[4] * 1.08));
    expect(byWeek.get(50)).toBe(fixture.basePath[5]);
  });
});

describe('推演工作台 · 上一代参照进主链（同周龄比值校正）', () => {
  it('默认参照 = prevGenPool[0]（Mate 80）：比值恒 1，考量给出参照名与 ×1.00', () => {
    expect(base.prevGenReferenceId).toBe(fixture.references.prevGenPool[0].id);
    expect(base.prevGenReferenceId).toBe('ref-mate80');
    const w45 = forecastOf().find((week) => week.weekNumber === 45);
    const refItem = w45?.consider.find((item) => item.kind === 'reference');
    expect(refItem?.label).toBe('Mate 80（上一代）');
    expect(refItem?.pct).toBeNull();
    expect(refItem?.note).toContain('×1.00');
  });

  it('选择 ref-pura90：W45 无事件口径 = 47000 × (40000 / 45000) = 41778，考量给出比值', () => {
    const pura = compute({ ...base, prevGenReferenceId: 'ref-pura90', marketEvents: [] });
    const w45 = pura.weeks.find((week) => week.weekNumber === 45);
    expect(w45?.unconstrained).toBe(41778);
    const refItem = w45?.consider.find((item) => item.kind === 'reference');
    expect(refItem?.label).toBe('Pura 90 Pro（上上代）');
    expect(refItem?.pct).toBe(-11.1);
    // 默认事件口径下 W45 同值（W45 无默认事件覆盖）
    expect(compute({ ...base, prevGenReferenceId: 'ref-pura90' }).weeks.find((week) => week.weekNumber === 45)?.unconstrained).toBe(41778);
  });

  it('友商参照不进入主链：ref-ip17 不在 prevGenPool → 比值回退 1', () => {
    const competitor = compute({ ...base, prevGenReferenceId: 'ref-ip17', marketEvents: [] });
    const w45 = competitor.weeks.find((week) => week.weekNumber === 45);
    expect(w45?.unconstrained).toBe(fixture.basePath[0]);
    expect(w45?.consider.find((item) => item.kind === 'reference')?.note).toBe('参照缺数，未修正');
  });

  it('参照不存在 / 分母为 0 / 序列缺点 → 比值回退 1 且考量写「参照缺数，未修正」', () => {
    const ghost = compute({ ...base, prevGenReferenceId: 'ref-ghost', marketEvents: [] });
    const w45 = ghost.weeks.find((week) => week.weekNumber === 45);
    expect(w45?.unconstrained).toBe(fixture.basePath[0]);
    expect(w45?.consider.find((item) => item.kind === 'reference')?.note).toBe('参照缺数，未修正');
    // 分母为 0：默认参照在 W45 同周龄点位为 0
    const zeroFixture = {
      ...fixture,
      references: {
        ...fixture.references,
        prevGenPool: [
          { id: 'ref-zero', label: '零值参照', points: fixture.references.prevGenPool[0].points.map((point, pointIndex) => (pointIndex === 8 ? 0 : point)) },
          fixture.references.prevGenPool[1],
        ],
      },
    };
    const zeroResult = computeWorkbench(zeroFixture, { ...baseWorkbenchParams(zeroFixture), marketEvents: [] });
    const zw45 = zeroResult.weeks.find((week) => week.weekNumber === 45);
    expect(zw45?.unconstrained).toBe(fixture.basePath[0]);
    expect(zw45?.consider.find((item) => item.kind === 'reference')?.note).toBe('参照缺数，未修正');
  });
});

describe('推演工作台 · 库存健康窗口与供给缺口（全序列口径）', () => {
  it('健康判定先跑完整库存序列再筛预测周：W45 invChangePct = -15.2（W41–44 均值 103750 → W45 88000）', () => {
    const w45 = forecastOf().find((week) => week.weekNumber === 45);
    expect(w45?.channelInv).toBe(88000);
    expect(w45?.health?.invChangePct).toBe(-15.2);
    expect(w45?.health?.crash).toBe('none');
    // result.health 仍只含预测周
    expect(baseline.health.map((row) => row.weekNumber)).toEqual([45, 46, 47, 48, 49, 50, 51, 52]);
  });

  it('supplyCapped 保留截断事实；capped 只表示当前显示状态；firstAdjustedWeek 读 supplyCapped', () => {
    const w50 = forecastOf().find((week) => week.weekNumber === 50);
    expect(w50?.capped).toBe(true);
    expect(w50?.supplyCapped).toBe(true);
    const tuned = setManualAdjustment(base, 50, 50000, '会议结论上调') as WorkbenchParams;
    const tunedResult = compute(tuned);
    const tw50 = forecastOf(tunedResult).find((week) => week.weekNumber === 50);
    expect(tw50?.final).toBe(50000);
    expect(tw50?.manual?.reason).toBe('会议结论上调');
    expect(tw50?.capped).toBe(false);
    expect(tw50?.supplyCapped).toBe(true);
    expect(tunedResult.firstAdjustedWeek).toBe(50);
    // 未截断周不受影响
    expect(forecastOf(tunedResult).find((week) => week.weekNumber === 47)?.supplyCapped).toBe(false);
    expect(forecastOf(tunedResult).find((week) => week.weekNumber === 47)?.capped).toBe(false);
  });

  it('summary.gap 只算供给截断：SI 充足无截断时手调 W47 → gap = 0（手调不污染缺口）', () => {
    const healthySi = { ...base.siPlanMonthly, '2026-12': 400000 };
    const tuned = setManualAdjustment({ ...base, siPlanMonthly: healthySi }, 47, 60000, '黑五主峰周，电商资源加投') as WorkbenchParams;
    const result = compute(tuned);
    expect(result.firstAdjustedWeek).toBeNull();
    expect(result.summary.gap).toBe(0);
    // 下压手调同样不进缺口
    const downTuned = setManualAdjustment({ ...base, siPlanMonthly: healthySi }, 47, 30000, '渠道反馈下修') as WorkbenchParams;
    expect(compute(downTuned).summary.gap).toBe(0);
  });

  it('手调落在截断周：缺口仍按供给截断计（与无手调基准一致），不随手调漂移', () => {
    const tuned = setManualAdjustment(base, 50, 50000, '会议结论上调') as WorkbenchParams;
    expect(compute(tuned).summary.gap).toBe(baseline.summary.gap);
    expect(baseline.summary.gap).toBeGreaterThan(0);
  });
});

describe('推演工作台 · SI 确定性分配与极端输入', () => {
  it('整数余数分配：10001 台 / 4 周 = [2501,2500,2500,2500]，总量守恒；可整除 fixture 不变', () => {
    const plan = siWeeklyPlan(fixture, { ...base.siPlanMonthly, '2026-11': 10001 });
    expect([45, 46, 47, 48].map((week) => plan.get(week))).toEqual([2501, 2500, 2500, 2500]);
    expect([45, 46, 47, 48].reduce((total, week) => total + (plan.get(week) ?? 0), 0)).toBe(10001);
    const basePlan = siWeeklyPlan(fixture, base.siPlanMonthly);
    expect([45, 46, 47, 48].map((week) => basePlan.get(week))).toEqual([55000, 55000, 55000, 55000]);
    expect([49, 50, 51, 52].map((week) => basePlan.get(week))).toEqual([8000, 8000, 8000, 8000]);
  });

  it('SI 负值 / NaN 钳 0；全 0 → 库存耗尽、supplyCapped、sales 归零、缺口为供给差', () => {
    expect(siWeeklyPlan(fixture, { '2026-11': -5000, '2026-12': 0 }).get(45)).toBe(0);
    expect(siWeeklyPlan(fixture, { '2026-11': Number.NaN }).get(45)).toBe(0);
    const zero = compute({ ...base, siPlanMonthly: { '2026-11': 0, '2026-12': 0 } });
    const w46 = forecastOf(zero).find((week) => week.weekNumber === 46);
    expect(w46?.supplyCapped).toBe(true);
    expect(w46?.channelInv).toBe(0);
    const w52 = forecastOf(zero).find((week) => week.weekNumber === 52);
    expect(w52?.final).toBe(0);
    expect(w52?.supplyCapped).toBe(true);
    expect(zero.firstAdjustedWeek).toBe(46);
    expect(zero.summary.gap).toBeGreaterThan(0);
  });
});

describe('推演工作台 · 季度覆盖与会话恢复（withQuarterOverride / normalizeWorkbenchParams）', () => {
  it('withQuarterOverride：改任一格 → human；两者都还原 → 回 ai', () => {
    const q4 = withQuarterOverride(base, 'q4', 120);
    expect(q4.q4Override).toBe(120);
    expect(q4.q1Override).toBeNull();
    expect(q4.overrideSource).toBe('human');
    const both = withQuarterOverride(q4, 'q1', 95);
    expect(both.q1Override).toBe(95);
    expect(both.overrideSource).toBe('human');
    const q4Restored = withQuarterOverride(both, 'q4', null);
    expect(q4Restored.q4Override).toBeNull();
    expect(q4Restored.q1Override).toBe(95);
    expect(q4Restored.overrideSource).toBe('human');
    const allRestored = withQuarterOverride(q4Restored, 'q1', null);
    expect(allRestored.q4Override).toBeNull();
    expect(allRestored.q1Override).toBeNull();
    expect(allRestored.overrideSource).toBe('ai');
    expect(allRestored).toEqual(base);
    // 非有限值按 null 处理
    expect(withQuarterOverride(base, 'q4', Number.NaN).overrideSource).toBe('ai');
  });

  it('normalizeWorkbenchParams：基准与合法草稿（含新字段）往返保真', () => {
    expect(normalizeWorkbenchParams(fixture, base)).toEqual(base);
    const tuned: WorkbenchParams = {
      ...base,
      q4Override: 118.5,
      overrideSource: 'human',
      prevGenReferenceId: 'ref-pura90',
      marketEvents: [{ id: 'ev-x', label: '恒定', startWeek: 47, durationWeeks: 2, magnitudePct: 4, decay: 'flat' }],
      productEvents: [{ id: 'pe-x', type: 'own-promo', label: '营销', week: 47, magnitudePct: 12, replayId: 'rp-own-marketing' }],
      siPlanMonthly: { '2026-11': 210000, '2026-12': 40000 },
      manual: { 47: { value: 60000, reason: '原因' } },
    };
    expect(normalizeWorkbenchParams(fixture, tuned)).toEqual(tuned);
    expect(normalizeWorkbenchParams(fixture, JSON.parse(JSON.stringify(tuned)))).toEqual(tuned);
  });

  it('normalizeWorkbenchParams：非对象 / 坏 JSON 输入回退基准，永不崩溃', () => {
    expect(normalizeWorkbenchParams(fixture, null)).toEqual(base);
    expect(normalizeWorkbenchParams(fixture, undefined)).toEqual(base);
    expect(normalizeWorkbenchParams(fixture, 42)).toEqual(base);
    expect(normalizeWorkbenchParams(fixture, 'bad json')).toEqual(base);
    expect(normalizeWorkbenchParams(fixture, [])).toEqual(base);
    expect(normalizeWorkbenchParams(fixture, {})).toEqual(base);
  });

  it('normalizeWorkbenchParams：错型字段逐项修正、失效参照回退、overrideSource 重算', () => {
    const dirty = {
      q4Override: '120',
      q1Override: Number.NaN,
      overrideSource: 'human',
      marketEvents: [
        'bad-entry',
        { id: 'ev-half', label: '半改事件', startWeek: 46.8, durationWeeks: -1, magnitudePct: 8, decay: 'decreasing' },
        { id: 'ev-ok', label: '恒定事件', startWeek: 47, durationWeeks: 2, magnitudePct: 3, decay: 'weird' },
      ],
      productEvents: [
        { id: 'pe-ok', type: 'competitor-launch', label: '竞品', week: 46, magnitudePct: -5, replayId: 'rp-comp-promo' },
        { id: 'pe-type', type: 'other', label: '错型', week: 47, magnitudePct: 5, replayId: 'rp-own-marketing' },
        { id: 'pe-stale', type: 'own-promo', label: '失效回放', week: 48, magnitudePct: 5, replayId: 'rp-ghost' },
      ],
      siPlanMonthly: { '2026-11': -3, '2026-12': 'x', '2027-01': 999 },
      manual: {
        46: { value: 60000, reason: '   ' },
        47: { value: 'x', reason: 'r' },
        48: { value: -5, reason: 'r' },
        44: { value: 1000, reason: '历史周无效' },
        50: { value: 52000.4, reason: ' ok ' },
      },
      rationale: 42,
      prevGenReferenceId: 'ref-ghost',
    };
    const normalized = normalizeWorkbenchParams(fixture, dirty);
    expect(normalized.q4Override).toBeNull();
    expect(normalized.q1Override).toBeNull();
    expect(normalized.overrideSource).toBe('ai');
    expect(normalized.marketEvents).toEqual([
      { id: 'ev-half', label: '半改事件', startWeek: 47, durationWeeks: 1, magnitudePct: 8, decay: 'decreasing' },
      { id: 'ev-ok', label: '恒定事件', startWeek: 47, durationWeeks: 2, magnitudePct: 3, decay: 'decreasing' },
    ]);
    expect(normalized.productEvents).toEqual([
      { id: 'pe-ok', type: 'competitor-launch', label: '竞品', week: 46, magnitudePct: -5, replayId: 'rp-comp-promo' },
    ]);
    // 负值钳 0（合法类型越界）；错型（'x'）回退基准月值；未知月份键剔除
    expect(normalized.siPlanMonthly).toEqual({ '2026-11': 0, '2026-12': 32000 });
    // 原因选填（2026-11-04 评审拍板）：空白原因去空白后保留为 ''，不再剔除手调
    expect(normalized.manual).toEqual({
      46: { value: 60000, reason: '' },
      50: { value: 52000, reason: 'ok' },
    });
    expect(normalized.rationale).toBe(fixture.market.aiRationale);
    expect(normalized.prevGenReferenceId).toBe('ref-mate80');
    // 修正后的参数可直接进主链
    expect(() => compute(normalized)).not.toThrow();
  });
});

// ------------------------------------------------------------
// 2026-11-04 补：大盘月度段（4 季外推 + 月形分布 + 月中均摊 + 按月调整）
// 完整纯函数金测（含边界与钳制）见 __tests__/marketBusMonthly.test.ts；
// 此处补主链视角的关键断言：确定性、容量守恒、主链 marketMonths 同源。
// ------------------------------------------------------------
describe('推演工作台 · 大盘月度段（2026-11-04 拍板）', () => {
  it('4 季外推确定性：前两季与 aiQ4/aiQ1 同值，两次外推逐字段一致（禁随机）', () => {
    const first = marketQuarterForecast(fixture);
    expect(first.map((quarter) => quarter.key)).toEqual(['2026Q4', '2027Q1', '2027Q2', '2027Q3']);
    expect(first[0].value).toBe(marketSeriesBaseline(fixture).aiQ4);
    expect(first[1].value).toBe(marketSeriesBaseline(fixture).aiQ1);
    expect(marketQuarterForecast(fixture)).toEqual(first);
  });

  it('月度主序列容量守恒：每个预测季的三月合计恒等季度基线 × 3；computeWorkbench 同源输出', () => {
    const months = computeMarketMonths(fixture, base);
    for (const quarter of marketQuarterForecast(fixture)) {
      const quarterBaselines = months
        .filter((point) => point.quarter === quarter.key && point.status === 'forecast')
        .map((point) => point.baseline);
      expect(quarterBaselines).toHaveLength(3);
      expect(quarterBaselines.reduce((total, value) => total + value, 0)).toBeCloseTo(quarter.value * 3, 6);
    }
    const result = compute(base);
    expect(result.marketMonths).toEqual(months);
    expect(result.marketMonths).toHaveLength(fixture.market.months.length + 12);
  });

  it('月中事件均摊：首月按覆盖天数折减（29 日起 → 3/31），主链修正段按周所属月附加叠加', () => {
    // 默认演示事件（2027-01-29 起 1 个月 +8%）：首月乘子 = 1 + 8% × 3/31
    const event = base.marketMonthEvents[0];
    expect(event.startMonth).toBe('2027-01');
    expect(event.startDay).toBe(29);
    const factor = marketMonthEventFactor(event, '2027-01') as number;
    expect(factor).toBeCloseTo(1 + 0.08 * (3 / 31), 12);
    expect(marketMonthEventFactor(event, '2027-02')).toBeNull();
    // 主链：事件不在预测窗（W45–W52 = 2026-11/12）→ 周乘子口径不变
    expect(computeMarketFactor(fixture, { ...base, marketEvents: [] }, 49)).toBe(1);
    // 覆盖 2026-11 的事件 → 11 月周（W45–W48）生效、12 月周（W49+）不受影响
    const nov = { ...base, marketEvents: [], marketMonthEvents: [{ id: 'me-n', label: '', startMonth: '2026-11', startDay: 1, durationMonths: 1, magnitudePct: 5 }] };
    expect(computeMarketFactor(fixture, nov, 45)).toBeCloseTo(1.05, 10);
    expect(computeMarketFactor(fixture, nov, 49)).toBe(1);
  });

  it('按月调整季度同步：调整 2026-11 → q4Override = round1(季内三月均值)、转 human；还原后回 AI', () => {
    const adjusted = withMarketMonthOverride(base, fixture, '2026-11', 120, '');
    expect(adjusted.q4Override).toBe(107.5);
    expect(adjusted.overrideSource).toBe('human');
    // 季度均值口径与月度基线一致（101.8 + 120 + 100.8) / 3 → 不出现第二套数字
    const months = computeMarketMonths(fixture, adjusted);
    const november = months.find((point) => point.key === '2026-11');
    expect(november?.value).toBe(120);
    const restored = withMarketMonthOverride(adjusted, fixture, '2026-11', null, '');
    expect(restored.q4Override).toBeNull();
    expect(restored.overrideSource).toBe('ai');
  });
});
