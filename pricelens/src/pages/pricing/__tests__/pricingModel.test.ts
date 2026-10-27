// ============================================================
// 定价推演 · 计算链金测：证据推导（响应系数/预估带）、两产品 × 两场景
// 默认金测值、单调性与假设方向、区间对称、确定性、模拟数据形状。
// ============================================================
import { describe, expect, it } from 'vitest';
import { COST_HISTORY, MARKET_HISTORY, PRODUCTS } from '../mockData';
import {
  COST_BASE,
  compFactorOf,
  computeAll,
  computeScheme,
  costAtWeek,
  costForecast,
  deriveElasticity,
  elasticityRange,
  forecastSeries,
  buildWeekly,
  marketForecast,
  priceFactorOf,
  productOf,
  suggestedElasticity,
  unitMarginOf,
  type PlanContext,
} from '../pricingModel';

const std = productOf('std');
const max = productOf('max');
const ctxOf = (over: Partial<PlanContext>): PlanContext => ({
  scenario: 'pre', marketYoYPct: -6, costYoyPct: 6, elasticity: 1.8, comp: 'hold', ...over,
});

describe('定价推演 · 模拟数据形状', () => {
  it('大盘 11 季实际（24Q1→26Q3）；成本 24 个月（24-11→26-10）；成本基准 $645', () => {
    expect(MARKET_HISTORY).toHaveLength(11);
    expect(MARKET_HISTORY[0].label).toBe('24Q1');
    expect(MARKET_HISTORY[10].label).toBe('26Q3');
    expect(COST_HISTORY).toHaveLength(24);
    expect(COST_HISTORY[0].label).toBe('24-11');
    expect(COST_HISTORY[23].label).toBe('26-10');
    expect(COST_BASE).toBe(645);
  });

  it('两款产品：上一代 52 周（阶梯不升、成交 ≤ RRP）、本品 14 周、各 3+2 次调价、两场景各三方案', () => {
    for (const p of [std, max]) {
      expect(p.prev.weeks).toHaveLength(52);
      expect(p.cur.weeks).toHaveLength(14);
      expect(p.prev.events).toHaveLength(3);
      expect(p.cur.events).toHaveLength(2);
      expect(p.schemes.pre).toHaveLength(3);
      expect(p.schemes.post).toHaveLength(3);
      for (let i = 1; i < p.prev.weeks.length; i++) {
        expect(p.prev.weeks[i].rrp).toBeLessThanOrEqual(p.prev.weeks[i - 1].rrp);
      }
      for (const w of p.prev.weeks) expect(w.asp).toBeLessThanOrEqual(w.rrp);
      for (const e of [...p.prev.events, ...p.cur.events]) {
        expect(e.window).toBeGreaterThanOrEqual(3);
        expect(Math.abs(e.attributedPct)).toBeLessThanOrEqual(Math.abs(e.soPct));
      }
    }
  });
});

describe('定价推演 · 预估带（大盘/成本）', () => {
  it('大盘：同季 × 同比，区间对称 ±8%', () => {
    const fc = marketForecast(-6, 8);
    expect(fc.map((f) => f.label)).toEqual(['26Q4', '27Q1', '27Q2', '27Q3']);
    expect(fc[0].mid).toBe(478.5); // 25Q4 509 × 0.94
    expect(fc[3].mid).toBe(442.7); // 26Q3 471 × 0.94
    for (const f of fc) {
      expect(f.low).toBeCloseTo(Math.round(f.mid * 0.92 * 10) / 10, 5);
      expect(f.high).toBeCloseTo(Math.round(f.mid * 1.08 * 10) / 10, 5);
    }
    // 预估四季合计较近四季恰等于同比口径
    const trailing = [8, 9, 10, 7].reduce((s, i) => s + MARKET_HISTORY[i].value, 0);
    const total = fc.reduce((s, f) => s + f.mid, 0);
    expect(total / trailing).toBeCloseTo(0.94, 2);
  });

  it('成本：最新报价按年化外推 12 个月（+6% → $648 → $684）；周龄口径一致', () => {
    const fc = costForecast(6, 5);
    expect(fc).toHaveLength(12);
    expect(fc[0].mid).toBe(648);
    expect(fc[11].mid).toBe(684);
    expect(costAtWeek(0, 6)).toBeCloseTo(645, 5);
    expect(Math.round(costAtWeek(51, 6))).toBe(683);
    expect(costAtWeek(30, 6)).toBeGreaterThan(costAtWeek(0, 6));
  });
});

describe('定价推演 · 响应系数推导', () => {
  it('系数 = |归因变化% ÷ 调价幅度%|：std 上一代 [2.13,1.79,1.42] → 建议 1.8', () => {
    const view = deriveElasticity(std.prev.events);
    expect(view.ratios.map((r) => r.ratio)).toEqual([2.13, 1.79, 1.42]);
    expect(view.min).toBe(1.4);
    expect(view.max).toBe(2.1);
    expect(view.suggested).toBe(1.8);
  });

  it('建议值：上市前取上一代均值、上市后取本品均值；区间覆盖两代全部事件', () => {
    expect(suggestedElasticity(std, 'pre')).toBe(1.8);
    expect(suggestedElasticity(std, 'post')).toBe(1.6);
    expect(suggestedElasticity(max, 'pre')).toBe(2);
    expect(suggestedElasticity(max, 'post')).toBe(1.5);
    expect(elasticityRange(std, 'post')).toEqual({ min: 1.4, max: 2.1 });
    expect(elasticityRange(max, 'post')).toEqual({ min: 1.3, max: 2.4 });
  });
});

describe('定价推演 · 上市前推演金测（默认假设：大盘 −6% / 成本 +6% / 系数取建议值）', () => {
  const results = computeAll(std.schemes.pre, ctxOf({ scenario: 'pre', elasticity: 1.8 }), std);

  it('方案 A 稳健 $1149：SO 35.9 万台 / 单台销毛 $470 / 贡献 $1.63 亿', () => {
    const a = results[0];
    expect(a.firstYearSoWan).toBe(35.9);
    expect(a.launchUnitMargin).toBe(470);
    expect(a.marginTotalYi).toBe(1.63);
    expect(a.vsPrevSoPct).toBe(-13.7);
    expect(a.chain.anchorPrice).toBe(1099);
    expect(a.chain.priceDeltaPct).toBe(4.5);
  });

  it('方案 B 基准 $1099：价格响应因子 = 1（沿用上一代开盘位）', () => {
    const b = results[1];
    expect(b.chain.priceFactor).toBe(1);
    expect(b.firstYearSoWan).toBe(39.1);
    expect(b.vsPrevSoPct).toBe(-6);
  });

  it('方案 C 进取 $1029：SO 43.6 万台 · 较上一代同期 +4.9%', () => {
    expect(results[2].firstYearSoWan).toBe(43.6);
    expect(results[2].vsPrevSoPct).toBe(4.9);
  });

  it('Max 产品上市前：锚 $1299、SO 28.1–33.7 万台量级', () => {
    const rs = computeAll(max.schemes.pre, ctxOf({ scenario: 'pre', elasticity: 2 }), max);
    expect(rs[0].chain.anchorPrice).toBe(1299);
    expect(rs[0].firstYearSoWan).toBe(28.1);
    expect(rs[2].firstYearSoWan).toBe(33.7);
  });
});

describe('定价推演 · 上市后滚动金测（默认假设，系数取本品建议 1.6）', () => {
  const results = computeAll(std.schemes.post, ctxOf({ scenario: 'post', elasticity: 1.6 }), std);

  it('链条：本品已销 13.2 万 + 上一代同期剩余 26.3 万 × 相对幅度 0.86 → 剩余基线 22.6 万', () => {
    const b = results[1];
    expect(b.chain.curTotalWan).toBe(13.2);
    expect(b.chain.relFactor).toBe(0.86);
    expect(b.chain.prevRemainWan).toBe(26.3);
    expect(b.chain.remainBaseWan).toBe(22.6);
    expect(b.chain.anchorPrice).toBe(1049);
  });

  it('方案 B 维持 $1049：首年 SO 34.5 万台（已销 13.2 + 剩余测算）', () => {
    const b = results[1];
    expect(b.firstYearSoWan).toBe(34.5);
    expect(b.chain.priceFactor).toBe(1);
  });

  it('方案 A 回调 $1099 / C 降价 $999：SO 32.8 / 36.1 万台（价升量降）', () => {
    expect(results[0].firstYearSoWan).toBe(32.8);
    expect(results[2].firstYearSoWan).toBe(36.1);
  });
});

describe('定价推演 · 销量趋势预测序列', () => {
  it('上市后：前 14 周为实际、之后为预估，衔接点连通，区间带只在预估段', () => {
    const ctx = ctxOf({ scenario: 'post', elasticity: 1.6 });
    const fs = forecastSeries(ctx, std, 1049);
    expect(fs.weeks).toHaveLength(52);
    const actualCount = fs.actual.filter((v) => v != null).length;
    expect(actualCount).toBe(14);
    for (let i = 0; i < 14; i++) expect(fs.actual[i]).not.toBeNull();
    for (let i = 14; i < 52; i++) expect(fs.actual[i]).toBeNull();
    expect(fs.center[12]).toBeNull(); // 实际段中枢为空
    expect(fs.center[13]).not.toBeNull(); // 衔接点填实际值
    expect(fs.center[14]).not.toBeNull();
    expect(fs.low[13]).toBeNull(); // 区间带从预估段起
    expect(fs.low[14]).not.toBeNull();
    for (let i = 14; i < 52; i++) {
      expect(fs.low[i]!).toBeLessThan(fs.center[i]!);
      expect(fs.high[i]!).toBeGreaterThan(fs.center[i]!);
    }
    expect(fs.prevRef).toHaveLength(52);
  });

  it('上市前：无实际段，中枢即为测算周序列（P10–P90 对称 ±12%）', () => {
    const fs = forecastSeries(ctxOf({ scenario: 'pre', elasticity: 1.8 }), std, 1099);
    expect(fs.actual.every((v) => v === null)).toBe(true);
    expect(fs.center[0]).not.toBeNull();
    expect(fs.low[1]).toBeCloseTo(Math.round(fs.center[1]! * 0.88 * 10) / 10, 5);
    expect(fs.high[1]).toBeCloseTo(Math.round(fs.center[1]! * 1.12 * 10) / 10, 5);
  });

  it('buildWeekly 与 computeScheme 同源：首年合计一致；拟定价升高周序列整体下移', () => {
    const ctx = ctxOf({ scenario: 'post', elasticity: 1.6 });
    const r = computeScheme({ key: 'W', name: 'w', tagline: '', price: 1049 }, ctx, std);
    const w = buildWeekly(ctx, std, 1049);
    expect(w.weekly.reduce((s, v) => s + v, 0) / 10).toBeCloseTo(r.firstYearSoWan, 1);
    const higher = buildWeekly(ctx, std, 1149);
    expect(higher.weekly[30]).toBeLessThan(w.weekly[30]); // 预估段下移
    expect(higher.weekly[5]).toBe(w.weekly[5]); // 实际段不动
  });
});

describe('定价推演 · 单调性与假设方向', () => {
  const of = (price: number, ctx: PlanContext) =>
    computeScheme({ key: 'A', name: 'A', tagline: '', price }, ctx, std);

  it('价升 → 量降、单台销毛升（两场景同向）', () => {
    for (const scenario of ['pre', 'post'] as const) {
      const ctx = ctxOf({ scenario, elasticity: 1.6 });
      const lo = of(999, ctx);
      const hi = of(1199, ctx);
      expect(hi.firstYearSoWan).toBeLessThan(lo.firstYearSoWan);
      expect(hi.launchUnitMargin).toBeGreaterThan(lo.launchUnitMargin);
    }
  });

  it('大盘同比走低 → SO 降；系数归零 → 拟定价不影响量', () => {
    expect(of(1099, ctxOf({ marketYoYPct: -20 })).firstYearSoWan).toBeLessThan(of(1099, ctxOf({})).firstYearSoWan);
    expect(priceFactorOf(1199, 0, 1099)).toBe(1);
    expect(of(1199, ctxOf({ elasticity: 0 })).firstYearSoWan).toBeCloseTo(of(999, ctxOf({ elasticity: 0 })).firstYearSoWan, 5);
  });

  it('竞品涨价利好我方销量（交叉系数方向）；成本涨幅只影响销毛不影响销量', () => {
    expect(compFactorOf('up')).toBeGreaterThan(1);
    expect(compFactorOf('down')).toBeLessThan(1);
    expect(of(1099, ctxOf({ comp: 'up' })).firstYearSoWan).toBeGreaterThan(of(1099, ctxOf({})).firstYearSoWan);
    const cheap = of(1099, ctxOf({ costYoyPct: -10 }));
    const base = of(1099, ctxOf({}));
    expect(cheap.firstYearSoWan).toBe(base.firstYearSoWan);
    expect(cheap.launchUnitMargin).toBe(base.launchUnitMargin); // 上市月成本恒为最新报价
    expect(cheap.marginTotalYi).toBeGreaterThan(base.marginTotalYi); // 同比作用于后续周
    expect(unitMarginOf(1099, 51, 6)).toBeLessThan(unitMarginOf(1099, 0, 6)); // 成本逐月上行
  });

  it('区间对称 ±12%；同入参同出参（确定性）', () => {
    const r = of(1099, ctxOf({}));
    expect(r.p10Wan).toBeCloseTo(Math.round(r.firstYearSoWan * 0.88 * 10) / 10, 5);
    expect(r.p90Wan).toBeCloseTo(Math.round(r.firstYearSoWan * 1.12 * 10) / 10, 5);
    expect(computeAll(std.schemes.pre, ctxOf({}), std)).toEqual(computeAll(std.schemes.pre, ctxOf({}), std));
  });
});
