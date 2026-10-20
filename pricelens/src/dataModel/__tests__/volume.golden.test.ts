// ============================================================
// 第112轮 销量估算金测：因子边界 + 真实数据不变量（RU × Pura 90s Pro Max 首配置）。
// 销量为估算口径：数字本身允许随口径调整变化（删快照重生成），但确定性 /
// 非负整数 / 周必有事实行 / 月=周求和 这些不变量长期钉死。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, dimTime, factPriceWeekly } from '../../data';
import {
  brandFactor,
  countryFactor,
  discountFactor,
  hash01,
  lifecycleFactor,
  niceCeil,
  promoFactor,
  tierFactor,
  volumeByBuckets,
  volumeOfConfig,
} from '../volume';

const CC = 'RU';
const MODEL = 'own-huawei-pura-90s-pro-max';
const ROMRAM = [...new Set(dimProduct.filter((p) => p.model_id === MODEL).map((p) => p.romram))].sort()[0];
const SKUS = dimProduct
  .filter((p) => p.model_id === MODEL && p.romram.replace(/\s+/g, '') === ROMRAM.replace(/\s+/g, ''))
  .map((p) => p.sku_id);

describe('销量估算 · 因子函数边界', () => {
  it('tierFactor 递减且锚定 1.6 × 0.62^idx', () => {
    expect(tierFactor(0)).toBe(1.6);
    expect(tierFactor(1)).toBeCloseTo(1.6 * 0.62, 12);
    expect(tierFactor(2)).toBeCloseTo(1.6 * 0.62 ** 2, 12);
    for (let i = 1; i <= 5; i++) expect(tierFactor(i)).toBeLessThan(tierFactor(i - 1));
    expect(tierFactor(-1)).toBe(1.6); // 越界钳 0
  });

  it('lifecycleFactor：爬坡 0.55/0.8/1.0，其后 0.985^(w−2)，eol 后 0', () => {
    expect(lifecycleFactor(0, false)).toBe(0.55);
    expect(lifecycleFactor(1, false)).toBe(0.8);
    expect(lifecycleFactor(2, false)).toBe(1);
    expect(lifecycleFactor(3, false)).toBeCloseTo(0.985, 12);
    expect(lifecycleFactor(10, false)).toBeCloseTo(0.985 ** 8, 12);
    expect(lifecycleFactor(0, true)).toBe(0);
    expect(lifecycleFactor(20, true)).toBe(0);
  });

  it('promoFactor 三档；brandFactor / countryFactor 边界', () => {
    expect(promoFactor('浅')).toBe(1.15);
    expect(promoFactor('中')).toBe(1.35);
    expect(promoFactor('深')).toBe(1.6);
    expect(brandFactor('HUAWEI')).toBe(1.0);
    expect(brandFactor('apple')).toBe(1.7); // 大小写归一
    expect(brandFactor('OTHER')).toBe(0.6);
    expect(countryFactor('RU')).toBe(1.0);
    expect(countryFactor('XX')).toBe(0.3);
  });

  it('discountFactor：d = max(0, 1 − price/rrp)，×(1 + 1.8d)；缺价/缺 RRP = 1', () => {
    expect(discountFactor(100, 200)).toBeCloseTo(1 + 1.8 * 0.5, 12);
    expect(discountFactor(200, 200)).toBe(1);
    expect(discountFactor(300, 200)).toBe(1); // 溢价不产生负拉动
    expect(discountFactor(null, 200)).toBe(1);
    expect(discountFactor(100, null)).toBe(1);
  });

  it('hash01 ∈ [0,1) 且确定（同 key 恒同值）', () => {
    const a = hash01(`${CC}|${MODEL}|${ROMRAM}|202631`);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(hash01(`${CC}|${MODEL}|${ROMRAM}|202631`)).toBe(a);
    expect(hash01('')).toBeGreaterThanOrEqual(0);
  });

  it('niceCeil：留 10% 余量后向上取 1/2/2.5/5×10^k 档', () => {
    expect(niceCeil(50)).toBe(100); // 55 → 10×10
    expect(niceCeil(180)).toBe(200); // 198 → 2×100
    expect(niceCeil(220)).toBe(250); // 242 → 2.5×100
    expect(niceCeil(230)).toBe(500); // 253 → 5×100
    expect(niceCeil(950)).toBe(2000); // 1045 → 2×1000
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
  });
});

describe('销量估算 · 真实数据不变量（RU × Pura 90s Pro Max 首配置）', () => {
  const a = volumeOfConfig(MODEL, ROMRAM, CC);
  const b = volumeOfConfig(MODEL, ROMRAM, CC);
  const factWeeks = new Set(
    factPriceWeekly.filter((r) => r.country_code === CC && SKUS.includes(r.sku_id)).map((r) => r.week_id),
  );

  it('确定性：两次调用逐项相等', () => {
    expect([...b.entries()]).toEqual([...a.entries()]);
  });

  it('全部为非负整数；周均在 202619..202642 内且每周都有事实行', () => {
    expect(a.size).toBeGreaterThan(0);
    for (const [weekId, v] of a) {
      expect(weekId >= '202619' && weekId <= '202642').toBe(true);
      expect(factWeeks.has(weekId)).toBe(true);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('volumeByBuckets 月粒度 = 对应周之和（无有值周的月为 null）', () => {
    const monthIds = [...new Set(dimTime.map((t) => t.month_id))].sort();
    const byMonth = volumeByBuckets(MODEL, ROMRAM, CC, 'month', monthIds);
    monthIds.forEach((mid, i) => {
      const weeksOf = dimTime.filter((t) => t.month_id === mid);
      const vals = weeksOf.map((t) => a.get(t.week_id)).filter((v): v is number => v != null);
      expect(byMonth[i]).toBe(vals.length ? vals.reduce((x, y) => x + y, 0) : null);
    });
  });

  it('周粒度 24 周数组快照（含无事实行的 null 位）', () => {
    const allWeeks = dimTime.map((t) => t.week_id);
    expect(allWeeks).toHaveLength(24);
    expect(volumeByBuckets(MODEL, ROMRAM, CC, 'week', allWeeks)).toMatchSnapshot();
  });
});
