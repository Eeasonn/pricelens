// ============================================================
// 大盘图表模型层单测：份额合计、锚点精确性、插值有界、同比与摘要生成；
// 2026-11-04 第二波追加：自定义价带（50 美元格子聚合）与品牌份额多线卡。
// ============================================================
import { describe, expect, it } from 'vitest';
import { MARKET_INDUSTRIES, OTHERS, tierCellsOf, type MarketIndustryData } from '../marketBoardData';
import {
  anchorOverallShares,
  anchorTotalVolume,
  aspAt,
  bandAnchorVolume,
  bandBoundariesOf,
  bandDomainOf,
  brandColorFor,
  brandLinesSummary,
  clampBand,
  customBandSeries,
  customBandSummary,
  defaultBand,
  fmtYoy,
  labelInkFor,
  monthLabel,
  niceAxisMax,
  overallShareAt,
  round1,
  tierShareAt,
  tierShareSummary,
  tierShareTrendAt,
  tierTrendSeries,
  tierTrendSummary,
  tierVolumeAt,
  tierYoyColumns,
  tierYoySummary,
  trendSeries,
  trendSummary,
  volumeAt,
  yoyCurveX,
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

  it('同比曲线落点：钳制映射、新增画在最右、双零断开', () => {
    expect(yoyCurveX(0, 100, true)).toBeCloseTo(61, 6);
    expect(yoyCurveX(-100, 100, true)).toBeCloseTo(52, 6);
    expect(yoyCurveX(300, 100, true)).toBeCloseTo(88, 6);
    expect(yoyCurveX(99999, 100, true)).toBeCloseTo(88, 6); // 超幅钳制
    expect(yoyCurveX(null, 100, true)).toBeCloseTo(88, 6); // 新增（同期无量）
    expect(yoyCurveX(null, 100, false)).toBeNull(); // 本期同期皆无 → 断开
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

describe('图 2 单档位模式', () => {
  it('单档位任意月品牌份额合计 100%，锚点月与档位份额精确一致', () => {
    for (const ind of MARKET_INDUSTRIES) {
      for (const t of ind.tiers) {
        for (const m of ind.trendMonths) {
          const s = tierShareTrendAt(ind, t.id, m);
          const sum = allBrands(ind).reduce((acc, b) => acc + (s[b] ?? 0), 0);
          expect(sum, `${ind.id} ${t.id} ${m}`).toBeCloseTo(100, 4);
        }
        for (const m of ind.anchorMonths) {
          const exact = tierShareAt(ind, t.id, m);
          const trend = tierShareTrendAt(ind, t.id, m);
          for (const b of allBrands(ind)) expect(trend[b], `${ind.id} ${t.id} ${m} ${b}`).toBeCloseTo(exact[b], 6);
        }
      }
    }
  });

  it('单档位容量：锚点月精确等于档位容量，全域为正', () => {
    for (const ind of MARKET_INDUSTRIES) {
      for (const t of ind.tiers) {
        for (const m of ind.anchorMonths) {
          expect(tierVolumeAt(ind, t.id, m)).toBeCloseTo(ind.tierVolume[t.id][m], 6);
        }
        for (const m of ind.trendMonths) expect(tierVolumeAt(ind, t.id, m)).toBeGreaterThan(0);
      }
    }
  });

  it('单档位序列与摘要', () => {
    const ind = MARKET_INDUSTRIES[0];
    const tier = ind.tiers[3]; // 75–150
    const s = tierTrendSeries(ind, tier.id);
    expect(s.months).toEqual(ind.trendMonths);
    expect(s.volumes.length).toBe(ind.trendMonths.length);
    for (const b of allBrands(ind)) expect(s.shares[b].length).toBe(ind.trendMonths.length);
    // GOOGLE 在 75–150 档于 2026-06 进场：之前为 0、锚点月取到 44%
    expect(s.shares.GOOGLE[ind.trendMonths.indexOf('202508')]).toBe(0);
    expect(s.shares.GOOGLE[ind.trendMonths.indexOf('202606')]).toBe(44);
    const text = tierTrendSummary(ind, tier.id);
    expect(text).toContain('75–150');
    expect(text).not.toContain('我司');
    expect(tierTrendSummary(ind, 'nope')).toBe('');
  });
});

describe('图 2 自定义价带（50 美元格子聚合）', () => {
  it('tierCellsOf：50 美元格子参数化于产业价域，宽 ≤50、连续覆盖；既有档位锚点不受影响', () => {
    for (const ind of MARKET_INDUSTRIES) {
      const cells = tierCellsOf(ind);
      expect(cells.length).toBeGreaterThan(1);
      const finite = ind.tiers.flatMap((t) => [t.min, t.max]).filter((v): v is number => v != null);
      expect(cells[0].min).toBe(Math.min(...finite)); // 起步 = 最小有限档位边界（产业现状）
      expect(cells[cells.length - 1].max).toBe(Math.max(...finite));
      for (const c of cells) expect(c.max! - c.min!).toBeLessThanOrEqual(50);
      for (let i = 1; i < cells.length; i++) expect(cells[i].min).toBe(cells[i - 1].max); // 连续无缝
      // 既有 6 档位定义与锚点数据不被格子参数化破坏
      expect(ind.tiers.length).toBe(6);
      for (const t of ind.tiers) {
        for (const m of ind.anchorMonths) expect(ind.tierVolume[t.id]?.[m] ?? 0).toBeGreaterThan(0);
      }
    }
    // 穿戴 25–300：既有档位边界全保留（首格 [25,50] 即「自选 25–50」），75–150 细分为 3×25
    const w = tierCellsOf(MARKET_INDUSTRIES[0]);
    expect(w[0]).toMatchObject({ min: 25, max: 50 });
    expect(w[w.length - 1]).toMatchObject({ min: 250, max: 300 });
    expect(w.some((c) => c.min === 75 && c.max === 100)).toBe(true);
    // 手机 100–1000：每格恰 50 宽
    const p = tierCellsOf(MARKET_INDUSTRIES[1]);
    expect(p[0]).toMatchObject({ min: 100, max: 150 });
    for (const c of p) expect(c.max! - c.min!).toBe(50);
  });

  it('默认带与边界清单：起步按产业现状（穿戴 25 / 手机 100 / 平板 200），默认给最小 50 带', () => {
    expect(defaultBand(MARKET_INDUSTRIES[0])).toEqual({ lo: 25, hi: 50 });
    expect(defaultBand(MARKET_INDUSTRIES[1])).toEqual({ lo: 100, hi: 150 });
    expect(defaultBand(MARKET_INDUSTRIES[2])).toEqual({ lo: 200, hi: 250 });
    expect(bandDomainOf(MARKET_INDUSTRIES[0])).toEqual({ lo: 25, hi: 300 });
    // 穿戴边界：既有档位边界 + 粗档位 50 细分点，全为整数
    expect(bandBoundariesOf(MARKET_INDUSTRIES[0])).toEqual([25, 50, 75, 100, 125, 150, 200, 250, 300]);
    expect(bandBoundariesOf(MARKET_INDUSTRIES[1])).toEqual([100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000]);
  });

  it('非法输入钳制：越界吸附价域、逆序自动换序、退化（min===max）返回 null、空输入钳到全域', () => {
    const ind = MARKET_INDUSTRIES[0];
    expect(clampBand(ind, 400, 25)).toEqual({ lo: 25, hi: 300 }); // 400 吸附到上限 300，逆序换序
    expect(clampBand(ind, 30, 60)).toEqual({ lo: 25, hi: 50 }); // 吸附到 50 格边界
    expect(clampBand(ind, -9999, 9999)).toEqual({ lo: 25, hi: 300 }); // 越界钳到价域
    expect(clampBand(ind, 125, 125)).toBeNull(); // min===max 退化
    expect(clampBand(ind, NaN, NaN)).toEqual({ lo: 25, hi: 300 }); // 空输入钳到全域
  });

  it('自定义带序列：锚点月与覆盖档位精确一致（25–50 = u25_50 档），25–300 = 有限档位容量之和', () => {
    const ind = MARKET_INDUSTRIES[0];
    const s = customBandSeries(ind, 25, 50);
    expect(s.months).toEqual(ind.trendMonths);
    expect(s.band).toEqual({ lo: 25, hi: 50 });
    for (const m of ind.anchorMonths) {
      const idx = ind.trendMonths.indexOf(m);
      expect(s.volumes[idx]).toBeCloseTo(ind.tierVolume.u25_50[m], 6);
      const exact = tierShareAt(ind, 'u25_50', m);
      for (const b of allBrands(ind)) expect(s.shares[b][idx], `${m} ${b}`).toBeCloseTo(exact[b], 6);
    }
    const full = customBandSeries(ind, 25, 300);
    const finiteTiers = ind.tiers.filter((t) => t.min != null && t.max != null); // 完全有界档位（开口档不计入）
    for (const m of ind.anchorMonths) {
      const sum = finiteTiers.reduce((a, t) => a + ind.tierVolume[t.id][m], 0);
      expect(full.volumes[ind.trendMonths.indexOf(m)]).toBeCloseTo(sum, 6); // 开口档 <25、>300 不计入
    }
  });

  it('自定义带序列：任意月份额合计 100%、容量为正且不超过大盘总量', () => {
    for (const ind of MARKET_INDUSTRIES) {
      const { lo, hi } = defaultBand(ind);
      const s = customBandSeries(ind, lo, hi);
      for (let i = 0; i < s.months.length; i++) {
        const sum = allBrands(ind).reduce((a, b) => a + s.shares[b][i], 0);
        expect(sum, `${ind.id} ${s.months[i]}`).toBeCloseTo(100, 4);
        expect(s.volumes[i]).toBeGreaterThan(0);
        expect(s.volumes[i]).toBeLessThanOrEqual(round1(volumeAt(ind, s.months[i])) + 1e-9);
      }
    }
  });

  it('自定义带摘要与退化输入：摘要含带文本且不含「我司」，退化输入不产摘要', () => {
    const ind = MARKET_INDUSTRIES[0];
    const text = customBandSummary(ind, 25, 50);
    expect(text).toContain('25–50');
    expect(text).toContain('价带容量');
    expect(text).not.toContain('我司');
    // 非法输入先钳制再出摘要（与序列同一钳制口径）
    expect(customBandSummary(ind, 400, 25)).toContain('$25–300');
    expect(customBandSummary(ind, 125, 125)).toBe('');
    // 自定义带容量恒不超过大盘总量
    const band = clampBand(ind, 25, 300)!;
    for (const m of ind.anchorMonths) {
      expect(bandAnchorVolume(ind, band.lo, band.hi, m)).toBeLessThanOrEqual(anchorTotalVolume(ind, m) + 1e-9);
    }
  });
});

describe('品牌份额走势多线卡', () => {
  it('要点：最新锚点月份额前三 + 较去年同期变化最大两品牌，非空且不含「我司」', () => {
    for (const ind of MARKET_INDUSTRIES) {
      const text = brandLinesSummary(ind);
      expect(text.length).toBeGreaterThan(8);
      expect(text).toContain(monthLabel(ind.yoyMonths[0]));
      expect(text).toContain(monthLabel(ind.yoyMonths[1]));
      expect(text).toContain('大盘份额前三');
      expect(text).not.toContain('我司');
    }
    // 穿戴最新锚点月：GOOGLE 份额第一（75–150 档 63% 加权），前三含 GOOGLE
    expect(brandLinesSummary(MARKET_INDUSTRIES[0])).toContain('GOOGLE');
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
