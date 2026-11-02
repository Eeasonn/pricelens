// ============================================================
// 大盘图表模型层单测：份额合计、锚点精确性、插值有界、同比与摘要生成。
// ============================================================
import { describe, expect, it } from 'vitest';
import { MARKET_INDUSTRIES, OTHERS, type MarketIndustryData } from '../marketBoardData';
import {
  anchorOverallShares,
  anchorTotalVolume,
  aspAt,
  brandColorFor,
  fmtYoy,
  labelInkFor,
  monthLabel,
  niceAxisMax,
  overallShareAt,
  round1,
  tierShareAt,
  tierShareSummary,
  tierYoyColumns,
  tierYoySummary,
  trendSeries,
  trendSummary,
  volumeAt,
  yoyInk,
  yoyPct,
} from '../marketBoardModel';

const allBrands = (ind: MarketIndustryData) => [...ind.brands, OTHERS];

describe('大盘产业数据集', () => {
  it('三个产业的档位、品牌与月度域互不相同', () => {
    expect(MARKET_INDUSTRIES.length).toBe(3);
    const tierKeys = MARKET_INDUSTRIES.map((i) => i.tiers.map((t) => t.label).join('/'));
    expect(new Set(tierKeys).size).toBe(3);
    const brandKeys = MARKET_INDUSTRIES.map((i) => i.brands.join('/'));
    expect(new Set(brandKeys).size).toBe(3);
  });

  it('每个产业每档位每锚点月的品牌份额合计 100%', () => {
    for (const ind of MARKET_INDUSTRIES) {
      for (const t of ind.tiers) {
        for (const m of ind.anchorMonths) {
          const shares = tierShareAt(ind, t.id, m);
          const sum = allBrands(ind).reduce((s, b) => s + (shares[b] ?? 0), 0);
          expect(sum, `${ind.id} ${t.id} ${m}`).toBe(100);
          for (const b of allBrands(ind)) expect(shares[b]).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('锚点月的大盘容量与各档位容量均为正', () => {
    for (const ind of MARKET_INDUSTRIES) {
      for (const m of ind.anchorMonths) {
        expect(anchorTotalVolume(ind, m)).toBeGreaterThan(0);
        for (const t of ind.tiers) {
          expect(ind.tierVolume[t.id]?.[m] ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('插值与加权', () => {
  it('锚点月的容量与 ASP 精确等于锚点值', () => {
    const ind = MARKET_INDUSTRIES[0];
    for (const m of ind.anchorMonths) {
      expect(volumeAt(ind, m)).toBeCloseTo(anchorTotalVolume(ind, m), 6);
      const hand = ind.aspAnchors.find((a) => a.month === m);
      if (hand) expect(aspAt(ind, m)).toBeCloseTo(hand.value, 6);
    }
  });

  it('趋势域内插值保持为正且 ASP 有界', () => {
    for (const ind of MARKET_INDUSTRIES) {
      const lo = Math.min(...ind.aspAnchors.map((a) => a.value));
      const hi = Math.max(...ind.aspAnchors.map((a) => a.value));
      for (const m of ind.trendMonths) {
        expect(volumeAt(ind, m)).toBeGreaterThan(0);
        expect(aspAt(ind, m)).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(aspAt(ind, m)).toBeLessThanOrEqual(hi + 1e-6);
      }
    }
  });

  it('任意月品牌份额（含 OTHERS）合计 100%，锚点月与档位加权一致', () => {
    for (const ind of MARKET_INDUSTRIES) {
      for (const m of ind.trendMonths) {
        const s = overallShareAt(ind, m);
        const sum = allBrands(ind).reduce((acc, b) => acc + (s[b] ?? 0), 0);
        expect(sum, `${ind.id} ${m}`).toBeCloseTo(100, 4);
        for (const b of allBrands(ind)) expect(s[b]).toBeGreaterThanOrEqual(-1e-6);
      }
      for (const m of ind.anchorMonths) {
        const weighted = anchorOverallShares(ind, m);
        const direct = overallShareAt(ind, m);
        for (const b of allBrands(ind)) {
          expect(direct[b], `${ind.id} ${m} ${b}`).toBeCloseTo(weighted[b], 6);
        }
      }
    }
  });

  it('图 2 序列长度与月度域一致、数值有限', () => {
    const ind = MARKET_INDUSTRIES[0];
    const t = trendSeries(ind);
    expect(t.months).toEqual(ind.trendMonths);
    expect(t.volumes.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    expect(t.asps.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    for (const b of allBrands(ind)) {
      expect(t.shares[b].length).toBe(ind.trendMonths.length);
    }
  });
});

describe('同比与摘要', () => {
  it('图 3 列集：大盘整体列 + 品牌列 + OTHERS 列，行数等于档位数', () => {
    const ind = MARKET_INDUSTRIES[0];
    const cols = tierYoyColumns(ind);
    expect(cols.length).toBe(ind.brands.length + 2);
    expect(cols[0].isTotal).toBe(true);
    for (const c of cols) {
      expect(c.rows.length).toBe(ind.tiers.length);
      expect(c.cur).toBeGreaterThan(0);
    }
  });

  it('同比计算：跌为负、同期为 0 时返回 null', () => {
    expect(yoyPct(120, 100)).toBeCloseTo(20, 6);
    expect(yoyPct(50, 100)).toBeCloseTo(-50, 6);
    expect(yoyPct(5, 0)).toBeNull();
    expect(fmtYoy(null)).toBe('新增');
    expect(fmtYoy(-25.04)).toBe('-25.0%');
    expect(yoyInk(null)).toBe('#737373');
    expect(yoyInk(10)).toBe('#0053c2');
    expect(yoyInk(-10)).toBe('#b45309');
  });

  it('摘要文案非空且不含「我司」', () => {
    for (const ind of MARKET_INDUSTRIES) {
      const texts = [tierShareSummary(ind, null), trendSummary(ind), tierYoySummary(ind), tierShareSummary(ind, ind.tiers[0].id)];
      for (const t of texts) {
        expect(t.length).toBeGreaterThan(8);
        expect(t).not.toContain('我司');
      }
    }
  });
});

describe('展示小工具', () => {
  it('月份与数值格式化', () => {
    expect(monthLabel('202608')).toBe('2026-08');
    expect(round1(1.26)).toBe(1.3);
    expect(niceAxisMax(14.5)).toBe(20);
    expect(niceAxisMax(9.4)).toBe(10);
  });

  it('品牌色：OTHERS 中性灰、HUAWEI 品牌红；标注反色随底色亮度', () => {
    expect(brandColorFor(OTHERS)).toBe('#a1a1a1');
    expect(brandColorFor('HUAWEI')).toBe('#c7000b');
    expect(brandColorFor('MI')).toBe('#ff6900'); // MI 沿用小米登记色
    expect(labelInkFor('#1d1d1f')).toBe('#ffffff');
    expect(labelInkFor('#ff6900')).toBe('#171717');
  });
});
