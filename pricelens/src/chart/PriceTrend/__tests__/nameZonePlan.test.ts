// ============================================================
// 第196轮整改3（Eason）：名称预留带（zone 模式恢复，蓝本 987da34^）测试。
// 结构断言：传入 nameZone 后——
// ① 全部名称药丸进带内（x ∈ [plotLeft − axisW − width + 4, plotLeft − axisW − 4]），
//    带在轴列与绘图区之间不留空；
// ② 名称按折线起点纵向排序、等距分布：相邻 top 间距 ≥ 药丸高 + 4（避让挤在一起
//    的名称），整组在绘图区纵向居中（首尾到绘图区两缘距离对称）；
// ③ 名称项带 zone 标记（渲染单行 nowrap）；锚定模式（不传）不受影响（金测钉住）。
// 宽度断言：nameZoneWidthOf 自适应钳 [112, 320]、空集回落基准 188。
// ============================================================
import { describe, expect, it } from 'vitest';
import {
  NAME_BAND_MAX_W,
  NAME_BAND_MIN_W,
  NAME_BAND_W,
  computeYAxis,
  xPxOf,
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
const series: Series[] = [
  mk('OWN__1', 'HUAWEI Mate 70 12GB', [1000, 1100, 1200]), // 折线起点在高位
  mk('OWN__2', 'HUAWEI Mate 70 Pro 12GB', [900, 950, 1000]), // 起点 ~中部
  mk('OWN__3', 'HUAWEI nova 14 8GB', [800, 850, 900]), // 起点在低位
];

const scale = computeYAxis({ series, priceTypes, sliderScale: 1, allowBreak: false, perUsd: 1 });
const geom = {
  gridLeft: 258,
  plotLeft: 258, // = 名称带 188 + 轴列 70（estGridLeft 同构）
  plotTop: 36,
  plotWidth: 600,
  plotHeight: scale.plotHeight,
  scale,
  n: 3,
};
const marks = new Map();

const planOf = (nameZone?: { width: number; axisW: number }) =>
  buildLabelPlan({
    geom,
    series,
    granularity: 'week',
    priceTypes,
    endpointMarks: marks,
    nameZone,
  });

describe('第196轮整改3：名称预留带（zone 模式）结构与间距', () => {
  const ZONE_W = 188;
  const AXIS_W = 70;
  const PILL_H = ZONE_LINE_H + 6; // 名称药丸盒高（单行 + 内边距）
  const plan = planOf({ width: ZONE_W, axisW: AXIS_W });

  it('全部名称药丸进带内（带 = 轴列右缘到绘图区左缘，不留空）', () => {
    expect(plan.names.length).toBe(3);
    const bandLeft = geom.plotLeft - AXIS_W - ZONE_W;
    for (const nm of plan.names) {
      expect(nm.x).toBeGreaterThanOrEqual(bandLeft);
      expect(nm.x + nm.w).toBeLessThanOrEqual(geom.plotLeft - AXIS_W);
      expect(nm.zone).toBe(true);
    }
  });

  it('名称按折线起点高度排序，等距分布：相邻间距 ≥ 药丸高 + 4（不互相挤）', () => {
    const ys = plan.names.map((nm) => nm.y);
    const sorted = [...ys].sort((a, b) => a - b);
    expect(new Set(ys).size).toBe(3); // 等距 = 各占独立槽位
    // 槽位 = max(药丸高 + 4, plotHeight/条数)——本例绘图区充裕，槽位均分 ≥ 下限
    const slot = Math.max(PILL_H + 4, geom.plotHeight / 3);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBe(slot);
      expect(slot).toBeGreaterThanOrEqual(PILL_H + 4); // 不互相挤的下限保证
    }
    // 名称顺序与折线起点顺序一致（引线不交叉）：锚点升序 = 药丸升序
    const withAnchor = [...plan.names].sort((a, b) => a.y - b.y).map((nm) => nm.anchorY);
    expect([...withAnchor].sort((a, b) => a - b)).toEqual(withAnchor);
  });

  it('整组在绘图区纵向居中（首尾呼吸对称）', () => {
    const ys = plan.names.map((nm) => nm.y);
    const slot = Math.max(PILL_H + 4, geom.plotHeight / 3);
    const total = slot * 3;
    const y0 = geom.plotTop + Math.max(0, (geom.plotHeight - total) / 2);
    expect(Math.min(...ys)).toBeCloseTo(y0 + (slot - PILL_H) / 2, 5);
    // 顶部呼吸 = 底部呼吸（整组居中）
    const topGap = Math.min(...ys) - geom.plotTop;
    const bottomGap = geom.plotTop + geom.plotHeight - (Math.max(...ys) + PILL_H);
    expect(topGap).toBeCloseTo(bottomGap, 1);
    void xPxOf;
    void yPxOf;
  });

  it('锚定模式不受影响（不传 nameZone = 名称锚折线起点旁，无 zone 标记）', () => {
    const plain = planOf();
    expect(plain.names.length).toBe(3);
    for (const nm of plain.names) {
      expect(nm.zone).toBeUndefined();
      // 锚定：名称盒横跨折线起点（起点旁）
      expect(nm.anchorX).toBeGreaterThanOrEqual(nm.x);
    }
  });

  it('生命周期第二行计入药丸高（季粒度槽位下限随之抬高，不互压）', () => {
    const qPlan = buildLabelPlan({
      geom,
      series,
      granularity: 'quarter',
      priceTypes,
      endpointMarks: marks,
      lifecycleRow: () => true,
      nameZone: { width: ZONE_W, axisW: AXIS_W },
    });
    for (const nm of qPlan.names) {
      expect(nm.h).toBe(ZONE_LINE_H + 6 + 14); // 药丸行 + 生命周期行
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
