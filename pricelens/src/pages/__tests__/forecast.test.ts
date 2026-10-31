import { describe, expect, it } from 'vitest';
import { forecastAtPrice } from '../ForecastPage';

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
});
