import { describe, expect, it } from 'vitest';
import { forecastAtPrice, rollingForecast } from '../ForecastPage';

describe('量价预测演示模型', () => {
  it('负弹性下涨价会降低理论需求', () => {
    const low = forecastAtPrice(449);
    const high = forecastAtPrice(549);
    expect(high.demand).toBeLessThan(low.demand);
  });

  it('预测结果始终受供给上限约束且区间有序', () => {
    const result = forecastAtPrice(399, 499, 4600, -1.85, 3000);
    expect(result.base).toBeLessThanOrEqual(result.supplyCap);
    expect(result.low).toBeLessThanOrEqual(result.base);
    expect(result.base).toBeLessThanOrEqual(result.high);
  });

  it('相同输入产生确定结果', () => {
    expect(forecastAtPrice(499)).toEqual(forecastAtPrice(499));
  });

  it('滚动预测生成 8 周，并将实际 SO 限制在供应上限内', () => {
    const result = rollingForecast({
      price: 499,
      marketTrendPct: 2,
      competitionAdjustmentPct: 0,
      supplyCap: 3800,
      costTrendPct: 0.6,
    });
    expect(result.weeks).toHaveLength(8);
    expect(result.weeks.every((week) => week.actualSales <= week.supplyCap)).toBe(true);
    expect(result.totalFourWeekSales).toBe(result.weeks.slice(0, 4).reduce((sum, week) => sum + week.actualSales, 0));
    expect(result.weeks[result.weeks.length - 1]?.cumulativeCostPct).toBe(4.8);
  });

  it('价格、大盘和竞品情景分别影响无约束需求', () => {
    const base = rollingForecast({ price: 499, marketTrendPct: 0, competitionAdjustmentPct: 0, supplyCap: 7200, costTrendPct: 0 });
    const higherPrice = rollingForecast({ price: 529, marketTrendPct: 0, competitionAdjustmentPct: 0, supplyCap: 7200, costTrendPct: 0 });
    const strongerMarket = rollingForecast({ price: 499, marketTrendPct: 5, competitionAdjustmentPct: 0, supplyCap: 7200, costTrendPct: 0 });
    const weakerCompetition = rollingForecast({ price: 499, marketTrendPct: 0, competitionAdjustmentPct: -5, supplyCap: 7200, costTrendPct: 0 });
    expect(higherPrice.weeks[0].unconstrainedDemand).toBeLessThan(base.weeks[0].unconstrainedDemand);
    expect(strongerMarket.weeks[0].unconstrainedDemand).toBeGreaterThan(base.weeks[0].unconstrainedDemand);
    expect(weakerCompetition.weeks[0].unconstrainedDemand).toBeLessThan(base.weeks[0].unconstrainedDemand);
  });
});
