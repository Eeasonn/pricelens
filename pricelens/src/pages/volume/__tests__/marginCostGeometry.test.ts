import { describe, expect, it } from 'vitest';
import { marginCostDomainOf, monthStepSegmentsOf } from '../marginCostGeometry';

describe('margin cost geometry', () => {
  it('负销毛包含零基线且不把负值截掉', () => {
    const domain = marginCostDomainOf([
      { unitCost: 100, unitMargin: -20 },
      { unitCost: 120, unitMargin: 40 },
    ]);
    expect(domain.min).toBeLessThanOrEqual(-20);
    expect(domain.max).toBeGreaterThanOrEqual(120);
    expect(domain.zeroRatio).toBeGreaterThan(0);
    expect(domain.zeroRatio).toBeLessThan(1);
  });

  it('同月只画平台，跨月才产生垂直跳变', () => {
    const segments = monthStepSegmentsOf([
      { monthId: '202609', unitCost: 100, unitMargin: 20 },
      { monthId: '202609', unitCost: 100, unitMargin: 20 },
      { monthId: '202610', unitCost: 90, unitMargin: 30 },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0].count).toBe(2);
    expect(segments[1].count).toBe(1);
  });
});
