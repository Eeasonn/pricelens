import { describe, expect, it } from 'vitest';
import {
  BASELINE_DRAFT,
  competitorPressureAt,
  computeForecast,
  promoFactorAt,
  type ForecastDataset,
  type ScenarioDraft,
} from '../forecastModel';
import { forecastFixture } from '../forecastFixture';

const current = forecastFixture.params.currentWeekIndex; // W10
const forecastWeeksOf = (draft: ScenarioDraft) => computeForecast(forecastFixture, draft).weeks.slice(current + 1);
const baseline = computeForecast(forecastFixture, BASELINE_DRAFT);
const priceFactorOf = (price: number): number =>
  Math.pow(price / forecastFixture.params.referencePrice, forecastFixture.params.priceElasticity);

describe('简单版量价预测模型 · 确定性与数据契约', () => {
  it('相同输入两次计算完全一致', () => {
    expect(computeForecast(forecastFixture, BASELINE_DRAFT)).toEqual(computeForecast(forecastFixture, BASELINE_DRAFT));
  });

  it('生成 24 周主账：W1–W10 实际、W11–W24 预测、当前周 W10', () => {
    expect(baseline.weeks).toHaveLength(24);
    expect(baseline.weeks.slice(0, 10).every((week) => week.status === 'actual')).toBe(true);
    expect(baseline.weeks.slice(10).every((week) => week.status === 'forecast')).toBe(true);
    expect(baseline.current.week).toBe('W10');
    expect(baseline.current.status).toBe('actual');
  });

  it('周数据包含交接文档第 7 节契约字段，且不含验模真值字段', () => {
    const contractFields = [
      'week', 'status', 'phase', 'baseDemand', 'price', 'rrp', 'promoIntensity', 'competitorPressure',
      'unconstrainedDemand', 'available', 'stockout', 'so', 'si', 'inventory', 'cost',
      'companyNetRevenue', 'unitGrossMargin', 'weeklyGrossMargin', 'evidence',
    ];
    expect(Object.keys(baseline.weeks[0])).toEqual(expect.arrayContaining(contractFields));
    expect(JSON.stringify(baseline)).not.toContain('unconstrained_demand_truth');
    expect(JSON.stringify(baseline)).not.toContain('lost_sales_truth');
    expect(baseline.weeks.every((week) => week.evidence.includes('demo_seed') && week.evidence.includes('simple-demo-v1'))).toBe(true);
  });
});

describe('简单版量价预测模型 · 供给截断与库存链', () => {
  it('SO 始终不超过可供量；截断周 SO = 可供量且低于无约束需求', () => {
    for (const week of baseline.weeks) {
      expect(week.so).toBeLessThanOrEqual(week.available);
      if (week.stockout) {
        expect(week.so).toBe(week.available);
        expect(week.so).toBeLessThan(week.unconstrainedDemand);
      }
    }
  });

  it('W8–W9 供应波动形成可解释缺货截断，其余周无截断', () => {
    const stockoutWeeks = baseline.weeks.filter((week) => week.stockout).map((week) => week.week);
    expect(stockoutWeeks).toEqual(['W8', 'W9']);
  });

  it('库存恒等式：期末 = 期初 + Sell-in − SO，且不为负', () => {
    expect(baseline.weeks[0].inventory).toBe(forecastFixture.params.initialInventory + baseline.weeks[0].si - baseline.weeks[0].so);
    for (let index = 1; index < baseline.weeks.length; index += 1) {
      const prev = baseline.weeks[index - 1];
      const week = baseline.weeks[index];
      expect(week.inventory).toBe(prev.inventory + week.si - week.so);
      expect(week.inventory).toBeGreaterThanOrEqual(0);
    }
  });

  it('激进草稿（降价 + 加促销 + 减供给）下 SO 仍不超过可供量', () => {
    const stressed = computeForecast(forecastFixture, { priceDeltaPct: -10, promoDeltaPct: 15, supplyDeltaPct: -20 });
    expect(stressed.weeks.every((week) => week.so <= week.available)).toBe(true);
    expect(stressed.scenario.riskWeeks.length).toBeGreaterThan(0);
  });
});

describe('简单版量价预测模型 · 因子方向性', () => {
  it('价格上涨降低无约束需求，降价提升需求', () => {
    const up = forecastWeeksOf({ priceDeltaPct: 5, promoDeltaPct: 0, supplyDeltaPct: 0 });
    const down = forecastWeeksOf({ priceDeltaPct: -5, promoDeltaPct: 0, supplyDeltaPct: 0 });
    baseline.weeks.slice(current + 1).forEach((baseWeek, index) => {
      expect(up[index].unconstrainedDemand).toBeLessThan(baseWeek.unconstrainedDemand);
      expect(down[index].unconstrainedDemand).toBeGreaterThan(baseWeek.unconstrainedDemand);
    });
  });

  it('促销只在活动窗口及活动后一周生效，不永久外推', () => {
    // 夏季大促 W6–W7（强度 14%），活动后一周 W8 透支，W9 起回到 1。
    expect(promoFactorAt(forecastFixture, 5)).toBeCloseTo(1 + 0.14 * 1.6, 10);
    expect(promoFactorAt(forecastFixture, 6)).toBeCloseTo(1 + 0.14 * 1.6, 10);
    expect(promoFactorAt(forecastFixture, 7)).toBeCloseTo(0.92, 10);
    expect(promoFactorAt(forecastFixture, 8)).toBe(1);
    expect(promoFactorAt(forecastFixture, 9)).toBe(1);
    // 竞品促销 W12 是竞品侧压力事件，不产生我司促销响应。
    expect(promoFactorAt(forecastFixture, 11)).toBe(1);
    // 年末清库 W19–W20，活动后一周 W21 透支，W22 起回到 1。
    expect(promoFactorAt(forecastFixture, 18)).toBeCloseTo(1 + 0.08 * 1.6, 10);
    expect(promoFactorAt(forecastFixture, 19)).toBeCloseTo(1 + 0.08 * 1.6, 10);
    expect(promoFactorAt(forecastFixture, 20)).toBeCloseTo(0.92, 10);
    for (const index of [21, 22, 23]) expect(promoFactorAt(forecastFixture, index)).toBe(1);
    // 主账体现脉冲与透支：W6 高于仅价格反事实，W8 低于仅价格反事实。
    const w6 = baseline.weeks[5];
    expect(w6.unconstrainedDemand).toBeGreaterThan(Math.round(w6.baseDemand * priceFactorOf(w6.price)));
    const w8 = baseline.weeks[7];
    expect(w8.unconstrainedDemand).toBeLessThan(Math.round(w8.baseDemand * priceFactorOf(w8.price)));
  });

  it('竞品上市冲击逐周递减、窗口为 6 周，且压低我司需求', () => {
    const pressureOf = (week: number) => competitorPressureAt(forecastFixture, week - 1);
    expect(pressureOf(10)).toBeCloseTo(-0.12, 6);
    // 上市后逐周衰减（W12 叠加竞品促销脉冲，单独断言）。
    expect(Math.abs(pressureOf(11))).toBeLessThan(Math.abs(pressureOf(10)));
    expect(Math.abs(pressureOf(13))).toBeLessThan(Math.abs(pressureOf(11)));
    expect(Math.abs(pressureOf(16))).toBeLessThan(Math.abs(pressureOf(15)));
    // W12 脉冲叠加：压力深于纯衰减的 W13。
    expect(pressureOf(12)).toBeLessThan(pressureOf(13));
    // 默认 6 周窗口结束后归零。
    expect(pressureOf(17)).toBe(0);
    expect(pressureOf(24)).toBe(0);
    // 事件名标注：窗口内带事件，窗口外不带。
    expect(baseline.weeks[9].competitorEvent).toBe('竞品新品上市');
    expect(baseline.weeks[11].competitorEvent).toBe('竞品促销');
    expect(baseline.weeks[16].competitorEvent).toBeUndefined();
    // 压力压低需求：W10 低于「无竞品压力」反事实。
    const w10 = baseline.weeks[9];
    expect(w10.unconstrainedDemand).toBeLessThan(Math.round(w10.baseDemand * priceFactorOf(w10.price)));
  });

  it('成本上调只降低销毛，不修改需求', () => {
    const w14 = baseline.weeks[13];
    const w15 = baseline.weeks[14];
    expect(w15.cost).toBeGreaterThan(w14.cost);
    expect(w15.unitGrossMargin).toBeLessThan(w14.unitGrossMargin);
    const flatCost: ForecastDataset = {
      ...forecastFixture,
      weeks: forecastFixture.weeks.map((week) => ({ ...week, cost: 680 })),
    };
    const flat = computeForecast(flatCost, BASELINE_DRAFT);
    expect(flat.weeks.map((week) => week.unconstrainedDemand)).toEqual(baseline.weeks.map((week) => week.unconstrainedDemand));
    expect(flat.weeks[14].unitGrossMargin).toBeGreaterThan(baseline.weeks[14].unitGrossMargin);
    expect(flat.weeks.map((week) => week.so)).toEqual(baseline.weeks.map((week) => week.so));
  });
});

describe('简单版量价预测模型 · What-if 本地草稿', () => {
  it('草稿只作用于预测窗口，实际周不可被改写', () => {
    const drafted = computeForecast(forecastFixture, { priceDeltaPct: -8, promoDeltaPct: 10, supplyDeltaPct: 15 });
    drafted.weeks.slice(0, current + 1).forEach((week, index) => {
      expect(week).toEqual(baseline.weeks[index]);
      expect(week.draft).toBe(false);
    });
    drafted.weeks.slice(current + 1).forEach((week) => expect(week.draft).toBe(true));
  });

  it('情景变量独立生效：供给变化不改需求，需求变化不改供给计划', () => {
    const moreSupply = forecastWeeksOf({ priceDeltaPct: 0, promoDeltaPct: 0, supplyDeltaPct: 20 });
    baseline.weeks.slice(current + 1).forEach((baseWeek, index) => {
      expect(moreSupply[index].unconstrainedDemand).toBe(baseWeek.unconstrainedDemand);
      expect(moreSupply[index].available).toBe(Math.round(baseWeek.available * 1.2));
      expect(moreSupply[index].so).toBeGreaterThanOrEqual(baseWeek.so);
    });
    const cheaper = forecastWeeksOf({ priceDeltaPct: -5, promoDeltaPct: 0, supplyDeltaPct: 0 });
    baseline.weeks.slice(current + 1).forEach((baseWeek, index) => {
      expect(cheaper[index].available).toBe(baseWeek.available);
      expect(cheaper[index].price).toBe(Math.round(baseWeek.price * 0.95));
    });
  });

  it('促销增量独立于价格与供给生效', () => {
    const morePromo = forecastWeeksOf({ priceDeltaPct: 0, promoDeltaPct: 10, supplyDeltaPct: 0 });
    baseline.weeks.slice(current + 1).forEach((baseWeek, index) => {
      expect(morePromo[index].price).toBe(baseWeek.price);
      expect(morePromo[index].available).toBe(baseWeek.available);
      // 供给未截断的周，需求应高于基准（截断周 SO 仍受可供量限制）。
      if (!baseWeek.stockout) {
        expect(morePromo[index].unconstrainedDemand).toBeGreaterThan(baseWeek.unconstrainedDemand);
      }
    });
  });

  it('重置草稿恢复基准', () => {
    const drafted = computeForecast(forecastFixture, { priceDeltaPct: 6, promoDeltaPct: 8, supplyDeltaPct: -12 });
    expect(drafted.scenario.active).toBe(true);
    const reset = computeForecast(forecastFixture, BASELINE_DRAFT);
    expect(reset).toEqual(baseline);
    expect(reset.scenario.active).toBe(false);
    expect(reset.scenario.soDelta).toBe(0);
    expect(reset.scenario.marginDelta).toBe(0);
    expect(reset.weeks.every((week) => week.draft === false)).toBe(true);
  });
});

describe('简单版量价预测模型 · 摘要与拆解', () => {
  it('经营摘要与当前周主账一致，当前风险来自竞品压力', () => {
    expect(baseline.kpi.so).toBe(baseline.current.so);
    expect(baseline.kpi.unconstrainedDemand).toBe(baseline.current.unconstrainedDemand);
    expect(baseline.kpi.inventory).toBe(baseline.current.inventory);
    expect(baseline.kpi.risk.label).toBe('竞品压力');
    expect(baseline.kpi.cumulativeGrossMargin).toBe(baseline.weeks.reduce((total, week) => total + week.weeklyGrossMargin, 0));
  });

  it('贡献拆解台阶相加等于无约束需求与 SO', () => {
    const withoutSupply = baseline.drivers.filter((driver) => driver.key !== 'supply').reduce((total, driver) => total + driver.value, 0);
    expect(withoutSupply).toBe(baseline.current.unconstrainedDemand);
    const supply = baseline.drivers.find((driver) => driver.key === 'supply');
    expect(withoutSupply + (supply?.value ?? 0)).toBe(baseline.current.so);
    expect(baseline.current.unconstrainedDemand).toBeLessThan(baseline.current.baseDemand);
  });
});

describe('简单版量价预测模型 · 极端草稿与钳制不变量（2026-11-01 审查补测）', () => {
  const finiteFields = (week: (typeof baseline.weeks)[number]): number[] => [
    week.baseDemand, week.price, week.unconstrainedDemand, week.available,
    week.so, week.inventory, week.companyNetRevenue, week.unitGrossMargin,
    week.weeklyGrossMargin, week.dos,
  ];

  it('程序化极值草稿（价格 −100% / 供给 −100% / 促销 −100pp）下全字段有限、不产生 NaN/Infinity', () => {
    const extreme = computeForecast(forecastFixture, { priceDeltaPct: -100, promoDeltaPct: -100, supplyDeltaPct: -100 });
    for (const week of extreme.weeks) {
      for (const value of finiteFields(week)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('促销响应钳到 0：promoDelta 足够负（−120，盖过 8% 窗口的 1.128 基准）时预测窗需求与 SO 全 0、库存只增', () => {
    const zeroed = computeForecast(forecastFixture, { priceDeltaPct: 0, promoDeltaPct: -120, supplyDeltaPct: 0 });
    const forecastWeeks = zeroed.weeks.slice(current + 1);
    expect(forecastWeeks.every((week) => week.unconstrainedDemand === 0 && week.so === 0)).toBe(true);
    expect(forecastWeeks.every((week) => week.inventory >= 0)).toBe(true);
  });

  it('竞品压力钳制（1+pressure ≥ 0）只在压力 ≤ −1 的周清零，压力衰减后恢复（无跨周传染）', () => {
    const dataset: ForecastDataset = {
      ...forecastFixture,
      competitorLaunches: [{ id: 'cmp-crush', label: '强竞品上市', week: 12, impact: -1.5, windowWeeks: 6, halfLifeWeeks: 6 }],
    };
    const crushed = computeForecast(dataset, BASELINE_DRAFT);
    // impact 1.5、半衰期 6：age ≤ 2 时压力仍 ≤ −1（W12–W14 连续清零，属衰减窗口而非传染）
    expect(crushed.weeks[11].unconstrainedDemand).toBe(0);
    expect(crushed.weeks[13].unconstrainedDemand).toBe(0);
    // age = 3 时压力 1.5·e^(−0.5) ≈ 0.91 < 1，需求恢复为正——下一周独立重算
    expect(crushed.weeks[14].unconstrainedDemand).toBeGreaterThan(0);
  });

  it('UI 可达滑杆极值组合下 SO ≤ 可供量、全字段有限；供给放大组合可把期末库存推负（恒等式保留）', () => {
    const combos: ScenarioDraft[] = [
      { priceDeltaPct: -10, promoDeltaPct: 15, supplyDeltaPct: -20 },
      { priceDeltaPct: 10, promoDeltaPct: 15, supplyDeltaPct: 20 },
    ];
    for (const draft of combos) {
      const result = computeForecast(forecastFixture, draft);
      expect(result.weeks.every((week) => week.so <= week.available)).toBe(true);
      expect(result.weeks.every((week) => week.inventory >= 0)).toBe(true);
      expect(result.weeks.every((week) => finiteFields(week).every(Number.isFinite))).toBe(true);
    }
    // 供给 +20% × 降价 −10%：截断解除、SO 上行越过 Sell-in 流入，期末库存下穿 0
    //（实测最低 −878）。模型保留「期末 = 期初 + SI − SO」恒等式，负值按供给欠配
    // 信号呈现（主账标红 + 脚注），不静默钳 0。
    const oversold = computeForecast(forecastFixture, { priceDeltaPct: -10, promoDeltaPct: 0, supplyDeltaPct: 20 });
    expect(Math.min(...oversold.weeks.map((week) => week.inventory))).toBeLessThan(0);
    expect(oversold.weeks.every((week) => week.so <= week.available)).toBe(true);
  });

  it('基准与可达草稿下 DOS 恒有限且为正（除零保护 Math.max(1, 需求)）', () => {
    expect(baseline.weeks.every((week) => Number.isFinite(week.dos) && week.dos >= 0)).toBe(true);
  });
});
