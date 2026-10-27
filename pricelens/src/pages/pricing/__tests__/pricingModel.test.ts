// ============================================================
// 定价推演 · 计算链金测：确定性（同入参同出参）、默认假设三方案金测值、
// 单调性（价升量降/单台销毛升）、四项假设各自的方向性、区间对称性、
// 模拟数据形状（52 周阶梯/量纲合理）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { PREV_GEN, PREV_GEN_WEEKS, PRICING_EVENTS } from '../mockData';
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_SCHEMES,
  computeAll,
  computeScheme,
  compChangePctOf,
  compFactorOf,
  priceFactorOf,
  unitMarginOf,
  type Assumptions,
} from '../pricingModel';

describe('定价推演 · 模拟数据形状', () => {
  it('上一代 52 周：RRP 阶梯单调不升、周销为正、成交价低于当周 RRP', () => {
    expect(PREV_GEN_WEEKS).toHaveLength(52);
    for (let i = 0; i < PREV_GEN_WEEKS.length; i++) {
      const w = PREV_GEN_WEEKS[i];
      expect(w.so).toBeGreaterThan(0);
      expect(w.asp).toBeLessThanOrEqual(w.rrp);
      if (i > 0) expect(w.rrp).toBeLessThanOrEqual(PREV_GEN_WEEKS[i - 1].rrp);
    }
  });

  it('3 次调价事件：归因弹性全部落在参照区间内', () => {
    const ratios = PRICING_EVENTS.map((e) => Math.abs(e.attributedPct / e.changePct));
    for (const r of ratios) {
      expect(r).toBeGreaterThanOrEqual(1.4);
      expect(r).toBeLessThanOrEqual(2.2);
    }
  });

  it('首年 SO 合计 = 逐周加总（41.6 万台量级）', () => {
    const sum = PREV_GEN_WEEKS.reduce((s, w) => s + w.so, 0) / 10;
    expect(PREV_GEN.totalSoWan).toBeCloseTo(sum, 1);
    expect(PREV_GEN.totalSoWan).toBeGreaterThan(35);
    expect(PREV_GEN.totalSoWan).toBeLessThan(50);
  });
});

describe('定价推演 · 默认假设三方案金测', () => {
  const results = computeAll(DEFAULT_SCHEMES, DEFAULT_ASSUMPTIONS);

  it('方案 A 稳健 $1149：SO 35.5 万台 / 单台销毛 $445 / 贡献 $1.63 亿', () => {
    const a = results[0];
    expect(a.firstYearSoWan).toBe(35.5);
    expect(a.launchUnitMargin).toBe(445);
    expect(a.marginTotalYi).toBe(1.63);
    expect(a.vsPrevSoPct).toBe(-14.7);
  });

  it('方案 B 基准 $1099：价格响应系数 = 1（沿用上一代开盘位）', () => {
    const b = results[1];
    expect(b.chain.priceFactor).toBe(1);
    expect(b.chain.priceDeltaPct).toBe(0);
    expect(b.firstYearSoWan).toBe(38.3);
  });

  it('方案 C 进取 $1029：SO 42.2 万台 · 较上一代同期 +1.4%', () => {
    const c = results[2];
    expect(c.firstYearSoWan).toBe(42.2);
    expect(c.vsPrevSoPct).toBe(1.4);
  });

  it('区间对称 ±12%：P10/P90 围绕基准值', () => {
    for (const r of results) {
      expect(r.p10Wan).toBeCloseTo(Math.round(r.firstYearSoWan * 0.88 * 10) / 10, 5);
      expect(r.p90Wan).toBeCloseTo(Math.round(r.firstYearSoWan * 1.12 * 10) / 10, 5);
    }
  });

  it('确定性：重复计算逐字段一致', () => {
    const again = computeAll(DEFAULT_SCHEMES, DEFAULT_ASSUMPTIONS);
    expect(again).toEqual(results);
  });
});

describe('定价推演 · 单调性与假设方向', () => {
  const base = DEFAULT_ASSUMPTIONS;
  const of = (price: number, a: Assumptions) => computeScheme({ key: 'A', name: 'A', tagline: '', price }, a);

  it('价升 → 量降、单台销毛升、首年销毛贡献存在权衡（非单调）', () => {
    const lo = of(999, base);
    const hi = of(1199, base);
    expect(hi.firstYearSoWan).toBeLessThan(lo.firstYearSoWan);
    expect(hi.launchUnitMargin).toBeGreaterThan(lo.launchUnitMargin);
  });

  it('大盘系数：同比 −20% 时 SO 低于默认 −8%', () => {
    expect(of(1099, { ...base, marketYoYPct: -20 }).firstYearSoWan).toBeLessThan(of(1099, base).firstYearSoWan);
  });

  it('价格响应系数归零 → 拟定价不影响量（价格响应因子恒 1）', () => {
    expect(priceFactorOf(1199, 0, PREV_GEN.launchPrice)).toBe(1);
    expect(of(1199, { ...base, elasticity: 0 }).firstYearSoWan).toBeCloseTo(of(999, { ...base, elasticity: 0 }).firstYearSoWan, 5);
  });

  it('竞品情景：涨价利好我方销量、降价不利（交叉系数方向）', () => {
    expect(compChangePctOf('up')).toBe(5);
    expect(compFactorOf('up')).toBeGreaterThan(1);
    expect(compFactorOf('down')).toBeLessThan(1);
    expect(of(1099, { ...base, comp: 'up' }).firstYearSoWan).toBeGreaterThan(of(1099, { ...base, comp: 'hold' }).firstYearSoWan);
    expect(of(1099, { ...base, comp: 'down' }).firstYearSoWan).toBeLessThan(of(1099, { ...base, comp: 'hold' }).firstYearSoWan);
  });

  it('成本涨幅只影响销毛不影响销量；单台销毛随成本曲线（年内）逐周改善', () => {
    const vol = of(1099, { ...base, costUpPct: 0 });
    const vol6 = of(1099, base);
    expect(vol.firstYearSoWan).toBe(vol6.firstYearSoWan);
    expect(vol.launchUnitMargin).toBeGreaterThan(vol6.launchUnitMargin);
    expect(unitMarginOf(1099, 51, 6)).toBeGreaterThan(unitMarginOf(1099, 0, 6));
  });
});
