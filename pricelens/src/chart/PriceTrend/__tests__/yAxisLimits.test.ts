// ============================================================
// 第一百六十六轮：Y 轴刻度缺失回归 + 上下限拖柄覆盖契约。
// ① BUG 回归（Eason 截图「价格刻度显示缺失」）：buildTickRows 按段内值升序产出、
//    像素纵轴向下 = y 降序，thinTickRows 的保距贪心按「自上而下（y 升序）」判距——
//    修复前单段轴中间刻度全部判成负间距丢弃，只剩段底一个刻度（如 600）。
//    修复 = buildTickRows 输出恒按 y 升序。本文件用真实 computeYAxis → Geom 链路
//    锁定「全部刻度保留 + y 升序」，防止再退化。
// ② computeYAxis yMin/yMax 覆盖：拖柄值替换端点（吸附/断轴/格数链路不变）、
//    null 侧跟随数据、交叉非法整体回自动、负下限钳 0。
// ============================================================
import { describe, expect, it } from 'vitest';
import { computeYAxis, segTicks, type Geom, type YScale } from '../helpers';
import { buildTickRows, thinTickRows } from '../chartModel';
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

const BASE = { priceTypes: { discounted: true, rrp: false }, sliderScale: 1, perUsd: 1 } as const;

const geomOf = (scale: YScale): Geom => ({
  gridLeft: 80,
  plotLeft: 80,
  plotTop: 36,
  plotWidth: 600,
  plotHeight: scale.plotHeight,
  scale,
  n: 2,
});

describe('buildTickRows 行序（第一百六十六轮刻度缺失回归）', () => {
  it('单段轴：抽稀后全部刻度保留且 y 升序（修复前只剩段底一个刻度）', () => {
    // 数据 650~980 → 步长 50 → 刻度 600..1000 共 9 档，64px/格间距充足
    const scale = computeYAxis({ series: [mkSeries('a', [650, 980])], ...BASE, allowBreak: false });
    const all = buildTickRows(geomOf(scale));
    expect(all).toHaveLength(segTicks(scale.segs[0], scale.interval).length);
    // y 升序（自上而下）：首行 = 顶格刻度（值最大），末行 = 底格刻度（值最小）
    for (let i = 1; i < all.length; i++) expect(all[i].y).toBeGreaterThanOrEqual(all[i - 1].y);
    const rows = thinTickRows(buildTickRows(geomOf(scale)));
    expect(rows).toHaveLength(all.length); // 间距 64px ≥ 16px，一个都不少
    expect(rows[0].v).toBe(Math.max(...all.map((r) => r.v))); // 顶格（1000）
    expect(rows[rows.length - 1].v).toBe(Math.min(...all.map((r) => r.v))); // 底格（600）
  });

  it('多段轴（断轴压缩）：y 升序跨段成立，首尾锚与各段刻度都在', () => {
    const scale = computeYAxis({
      series: [mkSeries('low', [200, 260]), mkSeries('high', [900, 1000])],
      ...BASE,
      allowBreak: true,
    });
    expect(scale.segs.length).toBe(2);
    const rows = thinTickRows(buildTickRows(geomOf(scale)));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < rows.length; i++) expect(rows[i].y).toBeGreaterThanOrEqual(rows[i - 1].y);
    // 首尾锚：顶 = 最高段的顶格刻度，底 = 最低段的底格刻度
    expect(rows[0].v).toBeGreaterThanOrEqual(scale.segs[0].min);
    expect(rows[rows.length - 1].v).toBeLessThanOrEqual(scale.segs[scale.segs.length - 1].max);
    // 每段至少保留一个刻度
    for (const seg of scale.segs) {
      expect(rows.some((r) => r.v >= seg.min && r.v <= seg.max)).toBe(true);
    }
  });
});

describe('computeYAxis 用户上下限覆盖（YLimitHandles 契约）', () => {
  it('yMax 抬顶：上限 = 拖柄值精确落边（不加外缘垫、不吸附顶回），下侧不受牵连', () => {
    const auto = computeYAxis({ series: [mkSeries('a', [650, 980])], ...BASE, allowBreak: false });
    const s = computeYAxis({ series: [mkSeries('a', [650, 980])], ...BASE, allowBreak: false, yMax: 1200 });
    expect(s.max).toBe(1200);
    expect(s.min).toBe(auto.min); // null 侧跟随数据
  });

  it('yMax 压顶（低于数据最大值）：域收进拖柄值以内（越界数据由渲染层钳边）', () => {
    const s = computeYAxis({ series: [mkSeries('a', [650, 980])], ...BASE, allowBreak: false, yMax: 700 });
    expect(s.max).toBe(700);
    expect(s.min).toBeLessThanOrEqual(650); // 自动侧照常加垫吸附
  });

  it('yMin 压底：下限 = 拖柄值精确落边，不为负', () => {
    const s = computeYAxis({ series: [mkSeries('a', [650, 980])], ...BASE, allowBreak: false, yMin: 300 });
    expect(s.min).toBe(300);
  });

  it('负下限钳在 0（价格无负值）', () => {
    const s = computeYAxis({ series: [mkSeries('a', [650, 980])], ...BASE, allowBreak: false, yMin: -100 });
    expect(s.min).toBe(0);
  });

  it('两侧同时覆盖：域 = [下限, 上限] 精确落边', () => {
    const s = computeYAxis({
      series: [mkSeries('a', [650, 980])],
      ...BASE,
      allowBreak: false,
      yMin: 610,
      yMax: 820,
    });
    expect(s.min).toBe(610);
    expect(s.max).toBe(820);
  });

  it('非法覆盖（max ≤ min）整体回自动，与无覆盖结果一致', () => {
    const series = [mkSeries('a', [650, 980])];
    const auto = computeYAxis({ series, ...BASE, allowBreak: false });
    const bad = computeYAxis({ series, ...BASE, allowBreak: false, yMin: 800, yMax: 500 });
    expect(bad).toEqual(auto);
  });
});
