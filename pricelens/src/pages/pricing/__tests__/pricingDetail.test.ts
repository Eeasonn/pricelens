import { describe, expect, it } from 'vitest';
import { productOf, type PlanContext } from '../pricingModel';
import { pricingDetailRows } from '../pricingDetail';

const base: PlanContext = {
  scenario: 'post',
  marketYoYPct: -6,
  costYoyPct: 6,
  elasticity: 1.6,
  comp: 'hold',
};

describe('定价推演 · 周明细台账', () => {
  it('与预测序列同源，实际段和预估段边界清晰', () => {
    const rows = pricingDetailRows(base, productOf('std'), 1049);
    expect(rows).toHaveLength(52);
    expect(rows[0].phase).toBe('actual');
    expect(rows[13].phase).toBe('actual');
    expect(rows[14].phase).toBe('forecast');
    expect(rows[13].p10Wan).toBeNull();
    expect(rows[14].p10Wan).not.toBeNull();
    expect(rows[51].cumulativeSoWan).toBeGreaterThan(rows[14].cumulativeSoWan);
  });

  it('逐周价格覆盖只影响预测段，并同步反映到价格因子和销毛', () => {
    const weeklyPrices = Array.from({ length: 52 }, () => 1049);
    weeklyPrices[14] = 999;
    const rows = pricingDetailRows({ ...base, weeklyPrices }, productOf('std'), 1049);
    expect(rows[0].price).toBe(productOf('std').cur.weeks[0].asp);
    expect(rows[14].price).toBe(999);
    expect(rows[14].priceFactor).toBeGreaterThan(1);
    expect(rows[14].unitMargin).toBeLessThan(rows[15].unitMargin);
  });

  it('上一代同期关系保留在同一行，事件锚点可直接用于表格', () => {
    const rows = pricingDetailRows({ ...base, scenario: 'pre' }, productOf('std'), 1099);
    expect(rows[12].event).toContain('① W12');
    expect(rows[12].previousPrice).toBeGreaterThan(rows[13].previousPrice);
    expect(rows[12].vsPreviousPct).toBeLessThan(0);
  });
});

