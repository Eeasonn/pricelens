// ============================================================
// 「竞品价差」纯计算层测试（第112轮）：3 系列 × 4 桶手造 fixture
// （含一处缺价），钉住：对角 null、行贵为正（rich）/行便宜为负（cheap）、
// 缺价 null、时点取最后有值桶、走势 latest/min/max、全缺退化。
// ============================================================
import { describe, expect, it } from 'vitest';
import type { Series, SeriesPoint } from '../../../dataModel/types';
import { buildDiffMatrix, buildPairTrend, latestIdxWithPrice } from '../diffModel';

const PT = (price: number | null): SeriesPoint => ({
  bucketId: '202601',
  xLabel: '01-01',
  anchorDate: '2026-01-01',
  rrp: null,
  price,
  missing: price == null,
  offer: null,
  url: 'https://example.test',
  shopName: null,
});

const mkSeries = (key: string, prices: (number | null)[], isOwn = false): Series => ({
  key,
  isOwn,
  brand: 'Acme',
  label: `${key} 256GB`,
  skuIds: [key],
  color: '#3b82f6',
  points: prices.map(PT),
});

/** 3 系列 × 4 桶：我司 P0=100/100/100/null，竞品 A=120/90/100/110，竞品 B=80/90/100/null */
const own = mkSeries('own', [100, 100, 100, null], true);
const compA = mkSeries('compA', [120, 90, 100, 110]);
const compB = mkSeries('compB', [80, 90, 100, null]);
const series = [own, compA, compB];

describe('latestIdxWithPrice', () => {
  it('取最后一个「至少一个系列有折后价」的桶下标', () => {
    // 桶 3：own/compB 缺价但 compA=110 有值 → 3
    expect(latestIdxWithPrice(series, 4)).toBe(3);
  });

  it('末桶全缺 → 回退到之前最后有值桶', () => {
    const s = [own, compB]; // 桶 3 两系列都缺 → 桶 2 都有值
    expect(latestIdxWithPrice(s, 4)).toBe(2);
  });

  it('全缺 → null', () => {
    const allMissing = [mkSeries('a', [null, null]), mkSeries('b', [null, null])];
    expect(latestIdxWithPrice(allMissing, 2)).toBeNull();
    expect(latestIdxWithPrice([], 0)).toBeNull();
  });
});

describe('buildDiffMatrix', () => {
  const m = buildDiffMatrix(series, 0); // 时点桶 0：own=100, compA=120, compB=80

  it('对角线 = null（不与自比）', () => {
    for (let i = 0; i < 3; i++) {
      expect(m[i][i].amount).toBeNull();
      expect(m[i][i].pct).toBeNull();
    }
  });

  it('行更贵 → 正金额 + rich；行更便宜 → 负金额 + cheap', () => {
    // compA 行 vs own 列：120−100 = +20，+20.0% rich
    expect(m[1][0].amount).toBe(20);
    expect(m[1][0].pct).toEqual({ text: '+20.0%', tone: 'rich' });
    // compB 行 vs own 列：80−100 = −20，−20.0% cheap
    expect(m[2][0].amount).toBe(-20);
    expect(m[2][0].pct).toEqual({ text: '−20.0%', tone: 'cheap' });
    // 反向：own 行 vs compA 列金额对称为 −20，百分比随分母（列价 120）= −16.7% cheap
    expect(m[0][1].amount).toBe(-20);
    expect(m[0][1].pct).toEqual({ text: '−16.7%', tone: 'cheap' });
  });

  it('行与列同价 → 0 金额 + flat（±0.0%）', () => {
    // 时点桶 1：own=100, compA=90, compB=90 → compA 对 compB 平价
    const m1 = buildDiffMatrix(series, 1);
    expect(m1[1][2].amount).toBe(0);
    expect(m1[1][2].pct).toEqual({ text: '±0.0%', tone: 'flat' });
  });

  it('任一缺价 → null；矩阵为 3×3', () => {
    const m3 = buildDiffMatrix(series, 3); // 桶 3：own 缺、compB 缺、compA=110
    expect(m3.length).toBe(3);
    expect(m3[0].length).toBe(3);
    for (const row of m3) {
      for (const cell of row) {
        expect(cell.amount).toBeNull();
        expect(cell.pct).toBeNull();
      }
    }
  });
});

describe('buildPairTrend', () => {
  it('逐桶百分比与金额、缺价断开、latest/min/max 正确', () => {
    const t = buildPairTrend(compA, own);
    // 桶 0..2：(120−100)/100=+20、(90−100)/100=−10、0；桶 3 own 缺 → null
    expect(t.pct).toEqual([20, -10, 0, null]);
    expect(t.amount).toEqual([20, -10, 0, null]);
    expect(t.latest).toBe(0); // 最后一个有值桶（桶 2）
    expect(t.min).toBe(-10);
    expect(t.max).toBe(20);
  });

  it('latest 取最后一个非 null（尾部缺价不顶替）', () => {
    const a = mkSeries('a', [10, 20, null, null]);
    const b = mkSeries('b', [10, 10, 10, 10]);
    const t = buildPairTrend(a, b);
    expect(t.pct).toEqual([0, 100, null, null]);
    expect(t.latest).toBe(100);
  });

  it('两系列全程互缺 → latest/min/max 均 null', () => {
    const t = buildPairTrend(mkSeries('a', [null, null]), mkSeries('b', [null, null]));
    expect(t.pct).toEqual([null, null]);
    expect(t.amount).toEqual([null, null]);
    expect(t.latest).toBeNull();
    expect(t.min).toBeNull();
    expect(t.max).toBeNull();
  });

  it('百分比保留 1 位小数', () => {
    const t = buildPairTrend(mkSeries('a', [101]), mkSeries('b', [100]));
    expect(t.pct).toEqual([1]); // 1.0 → 1
    const t2 = buildPairTrend(mkSeries('a', [100.4]), mkSeries('b', [100]));
    expect(t2.pct).toEqual([0.4]);
  });
});
