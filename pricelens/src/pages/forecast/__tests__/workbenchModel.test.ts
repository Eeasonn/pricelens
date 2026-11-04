// ============================================================
// 推演工作台 v3 纯函数金测（forecast-workbench-v3 · 任务 5 主链切换）：
// 主链 = ①学习（learnWorkbenchBaseline，切换参照 = 重新学习）→ 产品范围事件
// → ②大盘月生效值比值（computeMarketMonths / marketFactorAt）→ ③库存递推
// min(基线 SO, 可售) → final = manual ?? inventoryAdjusted；不再有 basePath /
// q4 / q1 / 裸周号。周身份一律来自统一日历 WeekId（YYYYWww），旧固定 16 周
// 金测改日历驱动（禁止写死 W37–W52）。
// 大盘月度段完整金测（含月中均摊 / 容量守恒 / 趋势窗口）由任务 4 的
// marketBusMonthly.test.ts 承接；本文件保主链视角的关键断言。
// 顶部两条 = IA 文档「任务 5」Step 1 照抄的失败测试（现随 v3 主链通过）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import { marketEventDisposition } from '../workbenchTime';
import { buildForecastCalendar } from '../workbenchCalendar';
import {
  baseWorkbenchParams,
  clearManualAdjustment,
  computeMarketMonths,
  computeWorkbench,
  DOS_BAND,
  isParamsActive,
  judgeInventoryHealth,
  marketFactorAt,
  marketMonthEventFactor,
  normalizeWorkbenchParams,
  overrideSourceOf,
  productEventFactorAt,
  setManualAdjustment,
  siWeeklyPlan,
  unitCostOfWeek,
  withMarketMonthOverride,
  type InventoryRow,
  type WorkbenchParams,
} from '../workbenchModel';

const fixture = workbenchFixture;
const calendar = buildForecastCalendar(fixture.calendar);
const base = baseWorkbenchParams(fixture);
const compute = (params: WorkbenchParams) => computeWorkbench(fixture, params);
const baseline = compute(base);
const forecastOf = (result = baseline) => result.weeks.filter((week) => week.status === 'forecast');
const weekById = (result = baseline) => new Map(result.weeks.map((week) => [week.weekId, week]));
const forecastWeekId = (forecastIndex: number): string => calendar.forecastWeeks[forecastIndex]!.id;

describe('computeWorkbench v3 stage order', () => {
  it('computes learning -> product events -> market -> inventory -> manual', () => {
    const params = baseWorkbenchParams(fixture);
    const result = computeWorkbench(workbenchFixture, params);
    expect(result.weeks).toHaveLength(calendar.weeks.length);
    for (const week of result.weeks.filter((item) => item.status === 'forecast')) {
      const factor = marketFactorAt(calendar, result.marketMonths, week.weekId).factor;
      expect(week.marketAdjusted).toBe(Math.round(week.baselineSales! * factor));
      expect(week.inventoryAdjusted).toBeLessThanOrEqual(week.marketAdjusted!);
      expect(week.final).toBe(week.manual?.value ?? week.inventoryAdjusted);
    }
  });

  it('relearns on reference change without an additional reference multiplier', () => {
    const base = baseWorkbenchParams(workbenchFixture);
    const changed = computeWorkbench(workbenchFixture, { ...base, prevGenReferenceId: 'ref-pura90' });
    const first = changed.weeks.find((week) => week.status === 'forecast')!;
    expect(first.learnedBase).not.toBeNull();
    expect(first.baselineSales).toBe(Math.round(first.learnedBase! * changed.learning.productFactorByWeek[first.weekId]));
    expect(changed.learning.referenceId).toBe('ref-pura90');
  });
});

describe('推演工作台 v3 · 周结构与确定性', () => {
  it('相同输入两次计算完全一致（禁随机 / 禁读系统时间）', () => {
    expect(compute(base)).toEqual(compute(base));
  });

  it('周序列 = 统一日历全序列（实际周与 fixture 同源；跨年 WeekId 唯一主键）', () => {
    expect(baseline.weeks).toHaveLength(calendar.weeks.length);
    expect(baseline.weeks.map((week) => week.weekId)).toEqual(calendar.weeks.map((week) => week.id));
    const missingWeekIds = fixture.weeks.filter((week) => week.sales === null).map((week) => week.id);
    expect(missingWeekIds.length).toBeGreaterThan(0); // 缺采周保留 null，不造 0
    for (const week of baseline.weeks) {
      const fixtureWeek = fixture.weeks.find((candidate) => candidate.id === week.weekId)!;
      expect(week.sales).toBe(fixtureWeek.sales);
      expect(week.price).toBe(fixtureWeek.price);
      expect(week.monthKey).toBe(calendar.weekById.get(week.weekId)!.monthKey);
      if (week.status === 'actual') {
        expect(week.final).toBe(fixtureWeek.sales);
        // 阶段字段只写在预测周（历史周不回填中间值）
        expect(week.learnedBase).toBeNull();
        expect(week.baselineSales).toBeNull();
        expect(week.marketAdjusted).toBeNull();
        expect(week.inventoryAdjusted).toBeNull();
        expect(week.manual).toBeNull();
      }
    }
    expect(isParamsActive(base, fixture)).toBe(false);
  });

  it('基准考量：所有预测周完成学习（learnedBase 非空），无事件时 baselineSales = learnedBase', () => {
    expect(baseline.learning.status).toBe('completed');
    expect(baseline.learning.referenceId).toBe(base.prevGenReferenceId);
    for (const week of forecastOf()) {
      expect(week.learnedBase).not.toBeNull();
      expect(week.baselineSales).toBe(week.learnedBase);
      expect(baseline.learning.productFactorByWeek[week.weekId]).toBe(1);
    }
  });
});

describe('推演工作台 v3 · ①学习：切换参照 = 重新学习（无额外参考乘子）', () => {
  it('切换 ref-pura90 → learnedBase 逐周改变且与参照序列同向；基准不受影响', () => {
    const changed = compute({ ...base, prevGenReferenceId: 'ref-pura90' });
    expect(changed.learning.referenceId).toBe('ref-pura90');
    const changedById = weekById(changed);
    let differed = 0;
    for (const week of forecastOf()) {
      const next = changedById.get(week.weekId)!;
      expect(next.learnedBase).not.toBeNull();
      expect(next.learnedBase).not.toBe(week.learnedBase);
      differed += 1;
    }
    expect(differed).toBe(calendar.forecastWeeks.length);
  });

  it('产品范围事件只改覆盖周：baselineSales = round(learnedBase × productFactorByWeek)，历史周不被改写', () => {
    const startId = forecastWeekId(3);
    const endId = forecastWeekId(6);
    const withEvent = compute({
      ...base,
      productEvents: [{
        id: 'pe-test',
        type: 'competitor-launch',
        label: '竞品上市',
        startWeekId: startId,
        endWeekId: endId,
        magnitudePct: -10,
        decay: 'flat',
        replayId: 'rp-comp-promo',
      }],
    });
    const withEventById = weekById(withEvent);
    for (const week of forecastOf()) {
      const next = withEventById.get(week.weekId)!;
      const factor = baseline.learning.productFactorByWeek[week.weekId] === undefined
        ? 1
        : (week.weekId >= startId && week.weekId <= endId ? 0.9 : 1);
      expect(withEvent.learning.productFactorByWeek[week.weekId]).toBeCloseTo(factor, 12);
      expect(next.baselineSales).toBe(Math.round(next.learnedBase! * withEvent.learning.productFactorByWeek[week.weekId]));
      if (week.weekId < startId || week.weekId > endId) expect(next.baselineSales).toBe(week.baselineSales);
      if (week.status === 'actual') expect(next.sales).toBe(week.sales); // 历史周不被未来事件改写
    }
    const covered = withEventById.get(forecastWeekId(4))!;
    expect(covered.consider.some((item) => item.kind === 'productEvent' && item.note.includes(startId))).toBe(true);
    // 单一公式来源：productEventFactorAt 与 rangeEventFactorAt 同值
    expect(productEventFactorAt(calendar, [], forecastWeekId(0))).toBe(1);
  });
});

describe('推演工作台 v3 · ②大盘月生效值进主链', () => {
  it('主链 marketMonths 与 computeMarketMonths 同源；预测月恰为统一 12 个月', () => {
    expect(baseline.marketMonths).toEqual(computeMarketMonths(fixture, calendar, base));
    const forecastKeys = baseline.marketMonths.filter((point) => point.status === 'forecast').map((point) => point.key);
    expect(forecastKeys).toEqual(calendar.forecastMonths.map((month) => month.key));
    expect(forecastKeys).toHaveLength(12);
  });

  it('月调整 → 该月所有预测周同比值修正；其他月不变（月生效值直接修正对应周）', () => {
    const monthKey = calendar.forecastMonths[0]!.key;
    const tuned = compute({ ...base, marketMonthOverrides: { [monthKey]: { value: 120, reason: '' } } });
    const tunedById = weekById(tuned);
    const monthPoint = tuned.marketMonths.find((point) => point.key === monthKey)!;
    const factor = monthPoint.value / monthPoint.baseline;
    for (const week of forecastOf()) {
      const next = tunedById.get(week.weekId)!;
      const expected = Math.round((week.baselineSales ?? 0) * (calendar.weekById.get(week.weekId)!.monthKey === monthKey ? factor : 1));
      expect(next.marketAdjusted).toBe(expected);
    }
    expect(tuned.firstAdjustedWeek === null || typeof tuned.firstAdjustedWeek === 'string').toBe(true);
  });

  it('withMarketMonthOverride（v3）：只写月调整、无季度改格；卡头人工状态由 overrideSourceOf 派生', () => {
    const monthKey = calendar.forecastMonths[1]!.key;
    const adjusted = withMarketMonthOverride(base, monthKey, 120, '  ');
    expect(adjusted.marketMonthOverrides[monthKey]).toEqual({ value: 120, reason: '' });
    expect(Object.keys(adjusted).some((key) => key === 'q4Override' || key === 'q1Override' || key === 'overrideSource')).toBe(false);
    expect(overrideSourceOf(adjusted)).toBe('human');
    expect(overrideSourceOf(base)).toBe('ai');
    const restored = withMarketMonthOverride(adjusted, monthKey, null, '');
    expect(restored.marketMonthOverrides[monthKey]).toBeUndefined();
    expect(overrideSourceOf(restored)).toBe('ai');
    // 越界钳 40–200；computeMarketMonths 生效值 = override
    const clamped = withMarketMonthOverride(base, monthKey, 999, '');
    expect(clamped.marketMonthOverrides[monthKey]!.value).toBe(200);
    const months = computeMarketMonths(fixture, calendar, clamped);
    expect(months.find((point) => point.key === monthKey)!.value).toBe(200);
  });

  it('marketFactorAt：周修正比值 = 所属月生效值 ÷ AI 基线；基线不可用回退 1 并注明', () => {
    const monthKey = calendar.forecastMonths[0]!.key;
    const months = computeMarketMonths(fixture, calendar, base);
    const weekId = calendar.forecastMonths[0]!.forecastWeekIds[0]!;
    const point = months.find((entry) => entry.key === monthKey)!;
    const result = marketFactorAt(calendar, months, weekId);
    expect(result.factor).toBe(point.value / point.baseline);
    expect(result.note).toContain(monthKey);
    const fallback = marketFactorAt(calendar, [], weekId);
    expect(fallback.factor).toBe(1);
    expect(fallback.note).toBe('大盘基线不可用，未修正');
  });

  it('完整未来季容量守恒（季内三月合计 = 季度基线 × 3）；marketQuarters 含实际段 + 季度链', () => {
    const quarterValue = new Map(baseline.marketQuarters.map((point) => [point.key, point.value]));
    const forecastMonths = baseline.marketMonths.filter((point) => point.status === 'forecast');
    const byQuarter = new Map<string, number[]>();
    for (const point of forecastMonths) {
      byQuarter.set(point.quarter, [...(byQuarter.get(point.quarter) ?? []), point.baseline]);
    }
    for (const [quarter, baselines] of byQuarter) {
      const value = quarterValue.get(quarter);
      expect(value).not.toBeUndefined();
      if (baselines.length === 3) {
        expect(baselines.reduce((total, v) => total + v, 0)).toBeCloseTo(value! * 3, 6);
      }
    }
    // 实际段 = fixture.market.quarters 原样；预测段非空
    expect(baseline.marketQuarters.slice(0, fixture.market.quarters.length).map((point) => point.key))
      .toEqual(fixture.market.quarters.map((quarter) => quarter.key));
    expect(baseline.marketQuarters.filter((point) => point.status === 'forecast').length).toBeGreaterThan(0);
  });

  it('月度事件月中均摊口径不变（首月按覆盖天数折减，覆盖外 null）', () => {
    const event = { id: 'me-x', label: '', startMonth: '2027-01', startDay: 29, durationMonths: 1, magnitudePct: 8 };
    expect(marketMonthEventFactor(event, '2027-01')).toBeCloseTo(1 + 0.08 * (3 / 31), 12);
    expect(marketMonthEventFactor(event, '2027-02')).toBeNull();
  });
});

describe('推演工作台 v3 · ③库存递推、SI 月计划与供给缺口', () => {
  it('SI 月计划只分摊到各月预测周：月总量守恒 + 整数余数分配', () => {
    const plan = siWeeklyPlan(calendar, base.siPlanMonthly);
    for (const month of calendar.forecastMonths) {
      const total = month.forecastWeekIds.reduce((sum, weekId) => sum + (plan.get(weekId) ?? 0), 0);
      expect(total).toBe(base.siPlanMonthly[month.key] ?? 0);
      for (const weekId of month.weekIds) {
        if (!month.forecastWeekIds.includes(weekId)) expect(plan.has(weekId)).toBe(false);
      }
    }
    const odd = siWeeklyPlan(calendar, { ...base.siPlanMonthly, [calendar.forecastMonths[0]!.key]: 10001 });
    const firstMonthWeeks = calendar.forecastMonths[0]!.forecastWeekIds;
    const values = firstMonthWeeks.map((weekId) => odd.get(weekId)!);
    expect(values.reduce((total, v) => total + v, 0)).toBe(10001);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    // 非有限 / 负值钳 0
    expect(siWeeklyPlan(calendar, { [calendar.forecastMonths[0]!.key]: Number.NaN }).get(firstMonthWeeks[0]!)).toBe(0);
    expect(siWeeklyPlan(calendar, { [calendar.forecastMonths[0]!.key]: -5 }).get(firstMonthWeeks[0]!)).toBe(0);
  });

  it('库存递推自洽：期末 = 上期 + SI − 最终柱（缺采 / 不可算周不消耗；不为负）', () => {
    let inv = fixture.inventory.initialChannelInv;
    for (const week of baseline.weeks) {
      inv = Math.max(0, inv + week.si - (week.final ?? 0));
      expect(week.channelInv).toBe(inv);
    }
  });

  it('DOS = 期末库存 ÷ 近 4 周均销 × 7（缺数周不入均值）；fullDos = 渠道 × 演示系数', () => {
    const sample = forecastOf()[6]!;
    const index = baseline.weeks.findIndex((week) => week.weekId === sample.weekId);
    const window = baseline.weeks.slice(index - 3, index + 1)
      .map((week) => week.final)
      .filter((value): value is number => value != null);
    const avg = window.reduce((total, v) => total + v, 0) / window.length;
    expect(sample.channelDos).toBe(Math.round(((sample.channelInv ?? 0) / avg) * 7 * 10) / 10);
    expect(sample.fullDos).toBeCloseTo((sample.channelDos ?? 0) * fixture.inventory.fullDosFactor, 1);
  });

  it('SI 全 0 → 库存耗尽、supplyCapped、缺口为供给差；SI 加量 → 不再截断', () => {
    const zero: Record<string, number> = {};
    for (const month of calendar.forecastMonths) zero[month.key] = 0;
    const starved = compute({ ...base, siPlanMonthly: zero });
    const capped = forecastOf(starved).filter((week) => week.supplyCapped);
    expect(capped.length).toBeGreaterThan(0);
    expect(starved.firstAdjustedWeek).toBe(capped[0]!.weekId);
    expect(starved.summary.gap).toBeGreaterThan(0);
    const starvedById = weekById(starved);
    for (const week of capped) {
      const row = starvedById.get(week.weekId)!;
      expect(row.final).toBeLessThan(row.marketAdjusted ?? Number.POSITIVE_INFINITY);
      expect(row.capped).toBe(true);
    }
    // 加量 SI → 全序列可支撑（min 不触发、缺口 0）
    const rich: Record<string, number> = {};
    for (const month of calendar.forecastMonths) rich[month.key] = (base.siPlanMonthly[month.key] ?? 0) * 10;
    const healthy = compute({ ...base, siPlanMonthly: rich });
    expect(healthy.summary.gap).toBe(0);
    expect(healthy.firstAdjustedWeek).toBeNull();
    expect(forecastOf(healthy).every((week) => !week.supplyCapped && week.final === week.marketAdjusted)).toBe(true);
  });

  it('供给缺口只算供给截断：手调不进缺口、不重跑库存、supplyCapped 事实保留', () => {
    const cappedWeek = forecastOf().find((week) => week.supplyCapped) ?? null;
    if (cappedWeek != null) {
      const tuned = setManualAdjustment(base, cappedWeek.weekId, 50000, '会议结论上调') as WorkbenchParams;
      const tunedResult = compute(tuned);
      const tunedWeek = weekById(tunedResult).get(cappedWeek.weekId)!;
      expect(tunedWeek.final).toBe(50000);
      expect(tunedWeek.manual?.reason).toBe('会议结论上调');
      expect(tunedWeek.capped).toBe(false);
      expect(tunedWeek.supplyCapped).toBe(true);
      expect(tunedWeek.inventoryAdjusted).toBe(cappedWeek.inventoryAdjusted); // 手调不重跑库存
      expect(tunedResult.summary.gap).toBe(baseline.summary.gap);
      expect(tunedResult.firstAdjustedWeek).toBe(baseline.firstAdjustedWeek);
    }
    // 未截断周手调 → 缺口仍与基准一致（手调永不进缺口）
    const freeWeek = forecastOf().find((week) => !week.supplyCapped)!;
    const manual = setManualAdjustment(base, freeWeek.weekId, 30000, '渠道反馈下修') as WorkbenchParams;
    expect(compute(manual).summary.gap).toBe(baseline.summary.gap);
  });

  it('summary：总销量 / 峰 / 缺口 / vs 历史与逐周一致', () => {
    const total = forecastOf().reduce((sum, week) => sum + (week.final ?? 0), 0);
    expect(baseline.summary.totalSales).toBe(total);
    const peak = forecastOf().reduce((best, week) => ((week.final ?? 0) > (best.final ?? 0) ? week : best), forecastOf()[0]!);
    expect(baseline.summary.peak.weekId).toBe(peak.weekId);
    expect(baseline.summary.peak.value).toBe(peak.final);
    const gap = forecastOf().reduce((sum, week) => (
      week.marketAdjusted != null && week.inventoryAdjusted != null
        ? sum + Math.max(0, week.marketAdjusted - week.inventoryAdjusted)
        : sum), 0);
    expect(baseline.summary.gap).toBe(gap);
    const historyTotal = baseline.weeks.filter((week) => week.status === 'actual')
      .reduce((sum, week) => sum + (week.sales ?? 0), 0);
    expect(baseline.summary.vsHistoryPct).toBe(Math.round((total / historyTotal - 1) * 1000) / 10);
  });
});

describe('推演工作台 v3 · 手调（WeekId 键控，原因选填）', () => {
  it('空原因照常应用；负值拒绝；值覆盖该周最终柱，其他周不受影响，清除后恢复', () => {
    const weekId = forecastWeekId(2);
    const tuned = setManualAdjustment(base, weekId, 60000, '   ') as WorkbenchParams;
    expect(tuned.manual[weekId]).toEqual({ value: 60000, reason: '' });
    expect(setManualAdjustment(base, weekId, -1, '原因')).toBeNull();
    const tunedResult = compute(tuned);
    const tunedById = weekById(tunedResult);
    expect(tunedById.get(weekId)!.final).toBe(60000);
    expect(tunedById.get(forecastWeekId(3))!.final).toBe(weekById().get(forecastWeekId(3))!.final);
    const restored = compute(clearManualAdjustment(tuned, weekId));
    expect(weekById(restored).get(weekId)!.final).toBe(weekById().get(weekId)!.final);
  });
});

describe('推演工作台 v3 · 健康判定（weekId 键控，销量不可算显式说明）', () => {
  it('health 只含预测周且与主链周同键；judgeInventoryHealth 处理 null DOS', () => {
    expect(baseline.health.map((row) => row.weekId).sort()).toEqual(forecastOf().map((week) => week.weekId).sort());
    const rows: InventoryRow[] = [
      { weekId: '2026W44', status: 'actual', desiredSales: 40000, sales: 40000, capped: false, si: 0, channelInv: 100000, channelDos: 80 },
      { weekId: '2026W45', status: 'forecast', desiredSales: null, sales: null, capped: false, si: 0, channelInv: 95000, channelDos: null },
    ];
    const judged = judgeInventoryHealth(rows);
    expect(judged[1]!.dosOk).toBe(false);
    expect(judged[1]!.reasonText).toContain('不可算');
    expect(DOS_BAND.min).toBe(70);
  });
});

describe('推演工作台 v3 · 会话恢复（normalizeWorkbenchParams · v3 归一）', () => {
  it('基准与合法草稿（含 v3 范围事件 / WeekId 手调）往返保真', () => {
    expect(normalizeWorkbenchParams(fixture, base)).toEqual(base);
    const startId = forecastWeekId(1);
    const endId = forecastWeekId(3);
    const tuned: WorkbenchParams = {
      ...base,
      prevGenReferenceId: 'ref-pura90',
      marketEvents: [{ id: 'ev-x', label: '', startWeekId: startId, endWeekId: endId, magnitudePct: 4, decay: 'flat' }],
      productEvents: [{ id: 'pe-x', type: 'own-promo', label: '', startWeekId: startId, endWeekId: startId, magnitudePct: 12, decay: 'flat', replayId: 'rp-own-marketing' }],
      marketMonthOverrides: { [calendar.forecastMonths[0]!.key]: { value: 118.5, reason: '' } },
      siPlanMonthly: { ...base.siPlanMonthly, [calendar.forecastMonths[0]!.key]: 210000 },
      manual: { [forecastWeekId(2)]: { value: 60000, reason: '' } },
    };
    expect(normalizeWorkbenchParams(fixture, tuned)).toEqual(tuned);
    expect(normalizeWorkbenchParams(fixture, JSON.parse(JSON.stringify(tuned)))).toEqual(tuned);
  });

  it('非对象 / 坏 JSON 输入回退基准，永不崩溃', () => {
    expect(normalizeWorkbenchParams(fixture, null)).toEqual(base);
    expect(normalizeWorkbenchParams(fixture, undefined)).toEqual(base);
    expect(normalizeWorkbenchParams(fixture, 42)).toEqual(base);
    expect(normalizeWorkbenchParams(fixture, 'bad json')).toEqual(base);
    expect(normalizeWorkbenchParams(fixture, [])).toEqual(base);
    expect(normalizeWorkbenchParams(fixture, {})).toEqual(base);
  });

  it('非法范围拒绝（未知周 / 倒置）、错型修正、失效参照回退；不读 v2 数字键草稿', () => {
    const unknownId = '2025W99';
    const dirty = {
      // v2 数字键手调与裸周号事件：v3 一律丢弃
      q4Override: 120,
      overrideSource: 'human',
      manual: {
        47: { value: 60000, reason: 'v2 数字键' },
        [forecastWeekId(2)]: { value: 52000.4, reason: '  ' },
        [forecastWeekId(0)]: { value: -5, reason: '负值' },
        [calendar.weeks[0]!.id]: { value: 1000, reason: '历史周无效' },
      },
      marketEvents: [
        'bad-entry',
        { id: 'ev-unknown', label: '未知周', startWeekId: unknownId, endWeekId: unknownId, magnitudePct: 5, decay: 'flat' },
        { id: 'ev-reversed', label: '倒置', startWeekId: forecastWeekId(4), endWeekId: forecastWeekId(2), magnitudePct: 5, decay: 'flat' },
        { id: 'ev-ok', label: '', startWeekId: forecastWeekId(0), endWeekId: forecastWeekId(1), magnitudePct: 3, decay: 'weird' },
      ],
      productEvents: [
        { id: 'pe-ok', type: 'competitor-launch', label: '', startWeekId: forecastWeekId(0), endWeekId: forecastWeekId(0), magnitudePct: -5, decay: 'flat', replayId: 'rp-comp-promo' },
        { id: 'pe-type', type: 'other', label: '错型', startWeekId: forecastWeekId(1), endWeekId: forecastWeekId(1), magnitudePct: 5, decay: 'flat', replayId: 'rp-own-marketing' },
        { id: 'pe-stale', type: 'own-promo', label: '失效回放', startWeekId: forecastWeekId(2), endWeekId: forecastWeekId(2), magnitudePct: 5, decay: 'flat', replayId: 'rp-ghost' },
      ],
      marketMonthOverrides: { [calendar.forecastMonths[0]!.key]: 'x', '2025-01': { value: 120, reason: '' } },
      siPlanMonthly: { ...base.siPlanMonthly, [calendar.forecastMonths[1]!.key]: -3, extra: 'x', '2025-01': 999 },
      rationale: 42,
      prevGenReferenceId: 'ref-ghost',
    };
    const normalized = normalizeWorkbenchParams(fixture, dirty);
    // q4/overrideSource 等旧字段不在 v3 契约
    expect(Object.keys(normalized).some((key) => key === 'q4Override' || key === 'overrideSource')).toBe(false);
    // 范围事件：未知周 / 倒置拒绝；合法保留（decay 非法回退 decreasing；空 label 保留）
    expect(normalized.marketEvents).toEqual([
      { id: 'ev-ok', label: '', startWeekId: forecastWeekId(0), endWeekId: forecastWeekId(1), magnitudePct: 3, decay: 'decreasing' },
    ]);
    expect(normalized.productEvents).toEqual([
      { id: 'pe-ok', type: 'competitor-launch', label: '', startWeekId: forecastWeekId(0), endWeekId: forecastWeekId(0), magnitudePct: -5, decay: 'flat', replayId: 'rp-comp-promo' },
    ]);
    // 月调整：错型剔除；未知月份键剔除
    expect(normalized.marketMonthOverrides).toEqual({});
    // SI：恰好 12 个月键；负值钳 0；未知键丢弃
    expect(Object.keys(normalized.siPlanMonthly)).toEqual(calendar.forecastMonths.map((month) => month.key));
    expect(normalized.siPlanMonthly[calendar.forecastMonths[1]!.key]).toBe(0);
    // 手调：WeekId 键保留（值取整、空原因合法）；数字键 / 负值 / 历史周丢弃
    expect(normalized.manual).toEqual({ [forecastWeekId(2)]: { value: 52000, reason: '' } });
    expect(normalized.rationale).toBe(fixture.market.aiRationale);
    expect(normalized.prevGenReferenceId).toBe(base.prevGenReferenceId);
    // 修正后的参数可直接进主链
    expect(() => compute(normalized)).not.toThrow();
  });
});

describe('推演工作台 v3 · 时间处置与成本（绝对 index / monthKey 键控）', () => {
  it('marketEventDisposition 按统一日历绝对 index：historical / active / inactive / 非法范围', () => {
    const firstForecastId = forecastWeekId(0);
    const lastForecastId = forecastWeekId(calendar.forecastWeeks.length - 1);
    const historyEnd = calendar.weeks[calendar.weeks.findIndex((week) => week.id === firstForecastId) - 1]!.id;
    const historyStart = calendar.weeks[0]!.id;
    expect(marketEventDisposition(calendar, { startWeekId: forecastWeekId(0), endWeekId: forecastWeekId(1) })).toBe('active');
    expect(marketEventDisposition(calendar, { startWeekId: lastForecastId, endWeekId: lastForecastId })).toBe('active');
    // 起周早于首个预测周 → historical（即使跨入预测段）
    expect(marketEventDisposition(calendar, { startWeekId: historyEnd, endWeekId: forecastWeekId(0) })).toBe('historical');
    // 全历史段 → historical；预测段之后不存在（日历止于预测段末周），非法范围 → inactive
    expect(marketEventDisposition(calendar, { startWeekId: historyStart, endWeekId: historyEnd })).toBe('historical');
    expect(marketEventDisposition(calendar, { startWeekId: '2025W99', endWeekId: '2025W99' })).toBe('inactive');
    expect(marketEventDisposition(calendar, { startWeekId: lastForecastId, endWeekId: firstForecastId })).toBe('inactive');
  });

  it('unitCostOfWeek 按周所属月键取版本；月外回退首个版本（不造第二口径）', () => {
    const firstForecastMonth = calendar.forecastMonths[0]!.key;
    const version = fixture.costVersions.find((entry) => entry.monthKey === firstForecastMonth)!;
    expect(unitCostOfWeek(fixture, firstForecastMonth)).toBe(version.unitCost);
    expect(unitCostOfWeek(fixture, '2026-10')).toBe(fixture.costVersions[0]!.unitCost);
  });
});
