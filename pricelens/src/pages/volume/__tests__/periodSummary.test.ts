import { describe, expect, it } from 'vitest';
import { buildPeriodSummary, changeOf, directionLabelOf, pricePointValid, volumePointValid } from '../periodSummary';

const usd = { granularity: 'week' as const, currency: 'usd' as const, startId: '202619', endId: '202642', periodCount: 24 };

describe('区间量价摘要', () => {
  it('文档示例：1103→863、52000→57000、总量 136.8 万、价降量升', () => {
    const prices = [1103, null, 900, 863];
    const volumes = [52000, null, 10000, 57000];
    const model = buildPeriodSummary({ ...usd, prices, volumes, periodCount: 24 });
    // 总量按全部非 null 求和；示例总量是独立给定的 1,368,000，这里另测求和函数口径
    expect(model.pricePct).toBe('−21.8%');
    expect(model.priceDetail).toBe('$1,103 → $863（−$240）');
    expect(model.volumePct).toBe('+9.6%');
    expect(model.volumeDetail).toBe('5.2万 → 5.7万（+0.5万）');
    expect(model.directionLabel).toBe('价降量升');
    expect(model.windowLabel).toBe('2026W19–2026W42');
    expect(model.empty).toBe(false);
  });

  it('区间总量按非 null 销量相加，期数按窗口桶数而不是有值桶数', () => {
    const model = buildPeriodSummary({
      ...usd,
      prices: [100, 100],
      volumes: [1000, null, 1368000 - 1000],
      periodCount: 24,
    });
    expect(model.volumeTotalText).toBe('136.8万 · 24周');
    expect(model.pricePct).toBe('0.0%');
    expect(model.directionLabel).toBe('价稳量升');
  });

  it('上涨、下降与持平', () => {
    expect(changeOf([100, 110], pricePointValid).direction).toBe('up');
    expect(changeOf([100, 90], pricePointValid).direction).toBe('down');
    expect(changeOf([100, 100.4], pricePointValid).direction).toBe('flat');
    expect(directionLabelOf('flat', 'flat')).toBe('价稳量稳');
  });

  it('中间缺失不参与起止，首个与最后有效点仍可用', () => {
    const stats = changeOf([null, 200, null, 150], pricePointValid);
    expect(stats.start).toBe(200);
    expect(stats.end).toBe(150);
    expect(stats.pct).toBeCloseTo(-25, 5);
  });

  it('期初销量为 0：绝对变化保留，变化率为 —，方向按绝对增减', () => {
    const model = buildPeriodSummary({
      ...usd,
      prices: [100, 100],
      volumes: [0, 40],
      periodCount: 2,
    });
    expect(model.volumePct).toBeNull();
    expect(model.volumeDetail).toBe('0 → 40（+40）');
    expect(model.volumeTone).toBe('up');
    expect(model.directionLabel).toBe('价稳量升');
  });

  it('期初为 0 且绝对变化为 0 时按持平', () => {
    const stats = changeOf([0, null, 0], volumePointValid);
    expect(stats.pct).toBeNull();
    expect(stats.direction).toBe('flat');
  });

  it('只有一个有效点时不计算变化率', () => {
    const model = buildPeriodSummary({
      ...usd,
      prices: [null, 863],
      volumes: [52000],
      periodCount: 2,
    });
    expect(model.pricePct).toBeNull();
    expect(model.priceDetail).toBe('$863');
    expect(model.volumePct).toBeNull();
    expect(model.directionLabel).toBeNull();
    expect(model.volumeTotalText).toBe('5.2万 · 2周');
  });

  it('全部 null 与空数组显示空窗口', () => {
    expect(buildPeriodSummary({ ...usd, prices: [], volumes: [] }).empty).toBe(true);
    expect(buildPeriodSummary({ ...usd, prices: [null, null], volumes: [null] }).empty).toBe(true);
  });

  it('月与季只标注桶数，不把桶值再按周拆开', () => {
    const month = buildPeriodSummary({
      prices: [10, 10],
      volumes: [3, 4],
      granularity: 'month',
      startId: '202607',
      endId: '202612',
      currency: 'usd',
      periodCount: 6,
    });
    expect(month.volumeTotalText).toBe('7 · 6个月');
    expect(month.windowLabel).toBe('202607–202612');
    const quarter = buildPeriodSummary({
      prices: [10],
      volumes: [1, 2, 3, 4],
      granularity: 'quarter',
      startId: '2026Q1',
      endId: '2026Q4',
      currency: 'usd',
      periodCount: 4,
    });
    expect(quarter.volumeTotalText).toBe('10 · 4个季度');
  });

  it('不同窗口各自计算，不把两条序列加总', () => {
    const a = buildPeriodSummary({ ...usd, prices: [10, 20], volumes: [1, 2], periodCount: 2 });
    const b = buildPeriodSummary({ ...usd, prices: [20, 10], volumes: [5, 1], periodCount: 2 });
    expect(a.priceTone).toBe('up');
    expect(b.priceTone).toBe('down');
    expect(a.volumeTotalText).not.toBe(b.volumeTotalText);
  });

  it('只计算当前查看窗口，不把完整序列带入区间变化', () => {
    const model = buildPeriodSummary({
      ...usd,
      prices: [100, 110, 120, 130],
      volumes: [10, 20, 30, 40],
      windowStart: 1,
      windowEnd: 2,
      startId: '202620',
      endId: '202621',
      periodCount: 2,
    });
    expect(model.pricePct).toBe('+9.1%');
    expect(model.volumePct).toBe('+50.0%');
    expect(model.windowLabel).toBe('2026W20–2026W21');
  });
});
