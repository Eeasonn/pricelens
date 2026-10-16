// ============================================================
// 第五十四轮追补② 回归：周 → 季切换图高突变（分离模式尤甚）。
// 真实数据复现（Pura 双 ROM × 4 竞品并集，aggregation avg）：
//   周 rawSpan 811~1517=706 → niceStep(706×1.12/5=158)=200 → 5 格 320px；
//   季均值平滑掉促销低谷 → rawSpan 838~1500=662 → niceStep(148)=100（跨过 150 档界）
//   → 9 格 576px，图高 +80%（用户：切到季度 Y 轴高度显著拉高，不对）。
// 修复 = 分离共享 Y 轴（splitYCfg）补上步长滞回 prev（此前只有主图传）——
//   季沿用周档 200：snapWith(200) 吸附后伪跨度 1000 → 5 格 ∈ 滞回区间 [5,9] → 不换档。
// 本文件用与真实分布同构的合成序列锁定契约；同轮顺手修 grown 分支可缩水的旧账。
// ============================================================
import { describe, expect, it } from 'vitest';
import { computeYAxis } from '../helpers';
import type { Series } from '../../../dataModel/types';

const mkSeries = (key: string, prices: (number | null)[]): Series => ({
  key,
  isOwn: false,
  brand: 'T',
  label: key,
  skuIds: [key],
  color: '#333333',
  points: prices.map((price, i) => ({
    bucketId: `${key}#${i}`,
    xLabel: `x${i}`,
    anchorDate: '2026-01-07',
    rrp: null,
    price,
    missing: price == null,
    offer: null,
    url: '',
    shopName: null,
  })),
});

/** 周度（带促销低谷，span=706）与季度（均值平滑，span=662）同构六系列 */
const WEEK_FIXTURES = [
  mkSeries('pura-512', [937, 900]),
  mkSeries('pura-256', [811, 875]),
  mkSeries('iphone-256', [1181, 1250]),
  mkSeries('iphone-512', [1517, 1416]),
  mkSeries('galaxy-256', [1063, 1125]),
  mkSeries('galaxy-512', [1161, 1201]),
];
const QUARTER_FIXTURES = [
  mkSeries('pura-512', [900, 937]),
  mkSeries('pura-256', [838, 875]),
  mkSeries('iphone-256', [1195, 1250]),
  mkSeries('iphone-512', [1500, 1472]),
  mkSeries('galaxy-256', [1078, 1125]),
  mkSeries('galaxy-512', [1176, 1201]),
];

const BASE = { priceTypes: { discounted: true, rrp: false }, sliderScale: 1, perUsd: 1, allowBreak: false } as const;

describe('computeYAxis 步长滞回：周→季图高稳定', () => {
  it('周（无 prev）= 步长 200、5 格', () => {
    const s = computeYAxis({ series: WEEK_FIXTURES, ...BASE });
    expect(s.intervalUsd).toBe(200);
    expect(s.cells).toBe(5);
    expect(s.plotHeight).toBe(5 * 64);
  });

  it('季不带 prev 会翻细档（记录旧行为——为什么必须滞回）', () => {
    const s = computeYAxis({ series: QUARTER_FIXTURES, ...BASE });
    expect(s.intervalUsd).toBe(100);
  });

  it('季带 prev(周档) = 沿用 200、5 格、图高与周一致（修复本体）', () => {
    const w = computeYAxis({ series: WEEK_FIXTURES, ...BASE });
    const q = computeYAxis({ series: QUARTER_FIXTURES, ...BASE, prev: w });
    expect(q.intervalUsd).toBe(200);
    expect(q.cells).toBe(5);
    expect(q.plotHeight).toBe(w.plotHeight);
  });

  it('需求下限只长不缩：grown 分支不低于 cells×TICK_PX', () => {
    // 段占比被外缘吸附摊薄（伪跨度 1000 vs 段域 741）时，need 240 < 占比份额 237 附近的
    // 老实现会把总高收到 240（< availPx 320）；钳底后恒 ≥ availPx
    const s = computeYAxis({ series: QUARTER_FIXTURES, ...BASE, prev: computeYAxis({ series: WEEK_FIXTURES, ...BASE }) });
    expect(s.plotHeight).toBeGreaterThanOrEqual(s.cells * 64);
    expect(s.plotHeight).toBe(320);
  });
});
