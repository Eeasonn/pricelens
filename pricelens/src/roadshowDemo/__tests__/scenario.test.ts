import { describe, expect, it } from 'vitest';
import {
  availableSupply,
  buildContinuousSeries,
  DEFAULT_SCENARIO,
  forecastScenario,
} from '../scenario';

describe('roadshow ForecastScenario', () => {
  it('从当前周之后生成 8 个预测周，且结果确定', () => {
    const first = forecastScenario(DEFAULT_SCENARIO);
    const second = forecastScenario(DEFAULT_SCENARIO);
    expect(first).toHaveLength(8);
    expect(first[0].week).toBe('202643');
    expect(first[7].week).toBe('202650');
    expect(first).toEqual(second);
    expect(first[0].unconstrainedDemand).toBe(4600);
    expect(first[0].soForecastBase).toBe(3600);
  });

  it('负弹性下提高价格假设会降低无约束需求', () => {
    const baseline = forecastScenario(DEFAULT_SCENARIO);
    const higherPrice = forecastScenario({ ...DEFAULT_SCENARIO, priceAssumption: 529 });
    expect(higherPrice[0].unconstrainedDemand).toBeLessThan(baseline[0].unconstrainedDemand);
  });

  it('终端大盘、竞品和档位构成因子分别只计算一次', () => {
    const [week] = forecastScenario({
      ...DEFAULT_SCENARIO,
      marketFactor: 0.9,
      competitionFactor: 0.8,
      tierCompositionFactor: 0.95,
      inventoryAvailable: Array(8).fill(10000),
      fulfillmentRate: 1,
    });
    expect(week.unconstrainedDemand).toBe(3146);
    expect(week.soForecastBase).toBe(3146);
  });

  it('实际 SO 不超过可售库存乘履约率，且低基高预测有序', () => {
    const [week] = forecastScenario({
      ...DEFAULT_SCENARIO,
      inventoryAvailable: Array(8).fill(4000),
      fulfillmentRate: 0.75,
    });
    expect(week.soForecastBase).toBe(3000);
    expect(week.soForecastLow).toBeLessThanOrEqual(week.soForecastBase);
    expect(week.soForecastHigh).toBeGreaterThanOrEqual(week.soForecastBase);
    expect(week.soForecastHigh).toBe(3000);
  });

  it('可售供应等于期初库存加入库减锁量，且不为负数', () => {
    expect(availableSupply({ beginningInventory: 5000, inbound: 1200, locked: 1500 })).toBe(4700);
    expect(availableSupply({ beginningInventory: 100, inbound: 0, locked: 500 })).toBe(0);
  });

  it('连续序列保留实际数据，并只把计算结果标为预测', () => {
    const actual = Object.freeze([
      Object.freeze({ week: '202641', price: 499, so: 4000 }),
      Object.freeze({ week: '202642', price: 489, so: 4200 }),
    ]);
    const series = buildContinuousSeries(actual, forecastScenario(DEFAULT_SCENARIO).slice(0, 1));
    expect(series).toHaveLength(3);
    expect(series.slice(0, 2)).toEqual([
      { week: '202641', price: 499, so: 4000, kind: 'actual' },
      { week: '202642', price: 489, so: 4200, kind: 'actual' },
    ]);
    expect(series[2].kind).toBe('forecast');
    expect(actual[1]).toEqual({ week: '202642', price: 489, so: 4200 });
  });
});
