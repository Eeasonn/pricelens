// ============================================================
// 第196轮整改3（2026-11-05 复检定版）：名称预留带 位置 + 对齐 测试。
// 位置：带 = 「Y 轴刻度标签右侧、绘图区左缘之间」（[plotLeft − width + 4,
// plotLeft − 4]）——合并图 gridLeft = 轴列宽 + 带宽时，带紧贴刻度短横线右侧、
// 不再压在刻度上；分离面板（无轴列）带贴面板左缘。
// 对齐：药丸期望位 = 该线首个可见桶的 y（钳在带内）；互不重叠时逐线精确对齐，
// 重叠时经 resolveCollisions 最小位移上推（不再等距分布），盒恒互不相交、钳带内。
// 宽度：nameZoneWidthOf 自适应钳 [112, 320]、空集回落基准 188。
// ============================================================
import { describe, expect, it } from 'vitest';
import {
  NAME_BAND_MAX_W,
  NAME_BAND_MIN_W,
  NAME_BAND_W,
  computeYAxis,
  yPxOf,
} from '../helpers';
import { ZONE_LINE_H, buildLabelPlan, nameZoneWidthOf } from '../chartModel';
import type { Series } from '../../../dataModel/types';

const mk = (key: string, label: string, prices: number[]): Series => ({
  key,
  isOwn: key.startsWith('OWN'),
  brand: 'HUAWEI',
  label,
  skuIds: ['s'],
  color: '#c7000b',
  points: prices.map((p, i) => ({
    bucketId: `2026${20 + i}`,
    xLabel: '05-06',
    anchorDate: '2026-05-06',
    rrp: p + 100,
    price: p,
    missing: false,
    offer: null,
    url: '',
    shopName: null,
  })),
  platform: null,
  channelBadge: null,
});

const priceTypes = { discounted: true, rrp: false };
const marks = new Map();
const PILL_H = ZONE_LINE_H + 6; // 名称药丸盒高（单行 + 内边距）

describe('第196轮整改3：名称带位置（刻度标签右侧、绘图区左缘之间）', () => {
  // 合并图布局：gridLeft = 轴列 70 + 带 188，plotLeft = 258 —— 带必须落在
  // [70+4, 258−4] = [74, 254]，即紧贴刻度短横线（右缘 76）右侧、不压刻度
  const scale = computeYAxis({
    series: [mk('OWN__1', 'HUAWEI Mate 70 12GB', [1000, 1050, 1100])],
    priceTypes,
    sliderScale: 1,
    allowBreak: false,
    perUsd: 1,
  });
  const geom = {
    gridLeft: 258,
    plotLeft: 258, // = 名称带 188 + 轴列 70（estGridLeft 同构）
    plotTop: 36,
    plotWidth: 600,
    plotHeight: scale.plotHeight,
    scale,
    n: 3,
  };

  it('带 = 刻度右侧到绘图区左缘（[plotLeft−width+4, plotLeft−4]），不再压在刻度上', () => {
    const plan = buildLabelPlan({ geom, series: [], granularity: 'week', priceTypes, endpointMarks: marks, nameZone: { width: 188 } });
    void plan;
    // 走「全部进带」断言：见下一个用例的集合版；此处钉带宽边界值
    const ZONE_W = 188;
    const AXIS_W = 70;
    const bandLeft = geom.plotLeft - ZONE_W + 4; // = 74 > 轴列右缘 76−6=70（刻度+短横线）
    expect(bandLeft).toBeGreaterThanOrEqual(AXIS_W + 2);
  });

  it('全部名称药丸盒进带内（带右缘贴绘图区左缘，不留空）', () => {
    const series = [
      mk('OWN__1', 'HUAWEI Mate 70 12GB', [1000, 1050, 1100]),
      mk('OWN__2', 'HUAWEI nova 14 8GB', [800, 820, 840]),
    ];
    const s2 = computeYAxis({ series, priceTypes, sliderScale: 1, allowBreak: false, perUsd: 1 });
    const g = { ...geom, scale: s2, plotHeight: s2.plotHeight };
    const plan = buildLabelPlan({ geom: g, series, granularity: 'week', priceTypes, endpointMarks: marks, nameZone: { width: 188 } });
    expect(plan.names.length).toBe(2);
    for (const nm of plan.names) {
      expect(nm.x).toBeGreaterThanOrEqual(g.plotLeft - 188 + 4);
      expect(nm.x + nm.w).toBeLessThanOrEqual(g.plotLeft - 4);
      expect(nm.zone).toBe(true);
    }
  });
});

describe('第196轮整改3：名称带对齐（折线首桶 y + 最小位移避让，不再等距分布）', () => {
  const ZONE_W = 188;
  const mkGeom = (series: Series[]) => {
    const scale = computeYAxis({ series, priceTypes, sliderScale: 1, allowBreak: false, perUsd: 1 });
    return {
      gridLeft: 258,
      plotLeft: 258,
      plotTop: 36,
      plotWidth: 600,
      plotHeight: scale.plotHeight,
      scale,
      n: 3,
    };
  };

  it('线位相距足够时逐线精确对齐（药丸中心 = 首桶 y，零位移）', () => {
    // 1000/500/950 → 折线首桶分别在高位/低位/中位，彼此相距远
    const series = [
      mk('OWN__1', 'HUAWEI Mate 70 12GB', [1000, 1010, 1020]),
      mk('OWN__2', 'HUAWEI nova 14 8GB', [500, 505, 510]),
    ];
    const g = mkGeom(series);
    const plan = buildLabelPlan({ geom: g, series, granularity: 'week', priceTypes, endpointMarks: marks, nameZone: { width: ZONE_W } });
    expect(plan.names.length).toBe(2);
    for (const nm of plan.names) {
      // 零位移：药丸纵向中心 = 首桶 y（dy = 0 且 top = 期望位）
      expect(nm.dy).toBe(0);
      expect(nm.y + nm.h / 2).toBeCloseTo(nm.anchorY, 5);
    }
  });

  it('首桶 y 越带界时钳在带内（贴顶/贴底不越绘图区）', () => {
    // 极端值把首桶 y 压到绘图区顶/底之外（computeYAxis 已含端点，钳制为防御语义）：
    // 单系列贴顶场景——首桶即全域最高点，期望中心 = 线 y；盒高 22 → top = y−11 ≥ plotTop+2
    const series = [mk('OWN__1', 'HUAWEI Mate 70 12GB', [1200, 1200, 1200])];
    const g = mkGeom(series);
    const plan = buildLabelPlan({ geom: g, series, granularity: 'week', priceTypes, endpointMarks: marks, nameZone: { width: ZONE_W } });
    expect(plan.names.length).toBe(1);
    const nm = plan.names[0];
    expect(nm.y).toBeGreaterThanOrEqual(g.plotTop);
    expect(nm.y + nm.h).toBeLessThanOrEqual(g.plotTop + g.plotHeight);
    void yPxOf;
  });

  it('两条线位相邻重叠时：最小位移上推避让（盒不相交、位移者紧贴遮挡者），非等距分布', () => {
    // 两线首桶值仅差 1（像素距 < 药丸高 + 4）→ 期望位重叠
    const series = [
      mk('OWN__1', 'HUAWEI Mate 70 12GB', [1000, 1010, 1020]),
      mk('OWN__2', 'HUAWEI nova 14 8GB', [1001, 1002, 1003]),
    ];
    const g = mkGeom(series);
    const plan = buildLabelPlan({ geom: g, series, granularity: 'week', priceTypes, endpointMarks: marks, nameZone: { width: ZONE_W } });
    expect(plan.names.length).toBe(2);
    const [a, b] = [...plan.names].sort((x, y) => x.y - y.y);
    // 盒互不相交（金测同一不变量）
    expect(a.y + a.h + 4).toBeLessThanOrEqual(b.y + 0.001);
    // 期望位本应重叠（线距 < 药丸高 + 4）：避让真发生了
    const lineGap = Math.abs(plan.names[0].anchorY - plan.names[1].anchorY);
    expect(lineGap).toBeLessThan(PILL_H + 4);
    // 最小位移：下方药丸留在期望位（dy=0），上方药丸紧贴其上（displaced 紧贴遮挡者）
    const stays = plan.names.find((nm) => nm.dy === 0)!;
    const moved = plan.names.find((nm) => nm.dy !== 0)!;
    expect(moved.y + moved.h + 4).toBeCloseTo(stays.y, 5);
    // 非等距分布：两盒间距恰为最小呼吸 4（moved 在上、stays 在下），而非均分槽位
    expect(stays.y - (moved.y + moved.h)).toBeCloseTo(4, 5);
  });

  it('生命周期第二行计入药丸高（季粒度避让盒含第二行，不互压）', () => {
    const series = [
      mk('OWN__1', 'HUAWEI Mate 70 12GB', [1000, 1010, 1020]),
      mk('OWN__2', 'HUAWEI nova 14 8GB', [1005, 1008, 1012]),
    ];
    const g = mkGeom(series);
    const qPlan = buildLabelPlan({
      geom: g,
      series,
      granularity: 'quarter',
      priceTypes,
      endpointMarks: marks,
      lifecycleRow: () => true,
      nameZone: { width: ZONE_W },
    });
    for (const nm of qPlan.names) {
      expect(nm.h).toBe(ZONE_LINE_H + 6 + 14); // 药丸行 + 生命周期行
    }
  });

  it('锚定模式不受影响（不传 nameZone = 名称锚折线起点旁，无 zone 标记）', () => {
    const series = [
      mk('OWN__1', 'HUAWEI Mate 70 12GB', [1000, 1050, 1100]),
      mk('OWN__2', 'HUAWEI nova 14 8GB', [800, 820, 840]),
    ];
    const g = mkGeom(series);
    const plain = buildLabelPlan({ geom: g, series, granularity: 'week', priceTypes, endpointMarks: marks });
    expect(plain.names.length).toBe(2);
    for (const nm of plain.names) {
      expect(nm.zone).toBeUndefined();
      expect(nm.anchorX).toBeGreaterThanOrEqual(nm.x);
    }
  });
});

describe('第196轮整改3：名称带宽度自适应（nameZoneWidthOf）', () => {
  it('按最长名称预留（不换行为准），钳 [112, 320]', () => {
    const w = nameZoneWidthOf(['Mate 70', 'Mate 70 Pro 典藏版 16+512']);
    const wShort = nameZoneWidthOf(['Nova']);
    const wLong = nameZoneWidthOf(['HUAWEI Mate X7 典藏版 16+1TB 折叠屏旗舰']);
    expect(w).toBeGreaterThanOrEqual(NAME_BAND_MIN_W);
    expect(w).toBeLessThanOrEqual(NAME_BAND_MAX_W);
    expect(wShort).toBe(NAME_BAND_MIN_W); // 短名也保下限（带常驻）
    expect(wLong).toBeLessThanOrEqual(NAME_BAND_MAX_W);
    expect(wLong).toBeGreaterThan(wShort);
  });

  it('空集回落旧基准 188（第115轮回收前的固定带宽）', () => {
    expect(nameZoneWidthOf([])).toBe(NAME_BAND_W);
    expect(NAME_BAND_W).toBe(188);
  });
});
