// ============================================================
// 品牌全景纯逻辑金测（2026-11-27）：
// ① 三列网格（三品牌默认三列、更多品牌换行不限制）；
// ② 同品牌线型循环（首条实线、其后虚线节律两两可辨、按表长循环）；
// ③ 线型接线：buildOption 主线 lineStyle.type = 系列线型（缺省实线不带 type）、
//    缺采跨接桥恒为 [4, 4] 不受线型影响；名称带名称项仅在线型存在时携带 lineDash；
// ④ 图例搜索命中规则（品牌 / 产品名 / 配置，忽略大小写与空白）与「折线较多」阈值。
// 最小手造 fixture，逐条断言语义，不做大快照。
// ============================================================
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Series, SeriesPoint } from '../../../dataModel/types';
import { GRID, computeYAxis } from '../helpers';
import { buildEndpointMarks, buildGeom, buildLabelPlan, buildOption } from '../chartModel';

vi.mock('echarts/core', async () => await import('./echartsStub'));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, ScatterChart: {} }));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  MarkAreaComponent: {},
  MarkLineComponent: {},
  MarkPointComponent: {},
  DataZoomComponent: {},
  BrushComponent: {},
  VisualMapComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

import { PANORAMA_COLUMNS, PANORAMA_DASH_PATTERNS, dashPatternAt, panoramaColumnsOf } from '../BrandPanorama';
import { MANY_LINES_HINT_AT, legendSearchMatch } from '../LegendTools';

describe('panoramaColumnsOf（三列网格）', () => {
  it('≤3 个品牌 = 每品牌一列；三品牌默认三列', () => {
    expect(PANORAMA_COLUMNS).toBe(3);
    expect([0, 1, 2, 3].map(panoramaColumnsOf)).toEqual([1, 1, 2, 3]);
  });

  it('更多品牌不限制：每行最多三列、换行', () => {
    expect([4, 5, 6, 7, 12].map(panoramaColumnsOf)).toEqual([3, 3, 3, 3, 3]);
  });
});

describe('dashPatternAt（同品牌线型循环）', () => {
  it('品牌内首条实线（undefined），其后取虚线节律；节律两两可辨', () => {
    expect(dashPatternAt(0)).toBeUndefined();
    const rest = PANORAMA_DASH_PATTERNS.slice(1);
    expect(new Set(rest.map((p) => p.join(','))).size).toBe(rest.length);
    rest.forEach((p, i) => expect(dashPatternAt(i + 1)).toEqual([...p]));
  });

  it('按表长循环；返回副本（改返回值不污染表）；负下标不越界', () => {
    const n = PANORAMA_DASH_PATTERNS.length;
    expect(dashPatternAt(n)).toBeUndefined();
    expect(dashPatternAt(n + 1)).toEqual(dashPatternAt(1));
    expect(dashPatternAt(2 * n + 3)).toEqual(dashPatternAt(3));
    expect(dashPatternAt(-1)).toEqual([...PANORAMA_DASH_PATTERNS[n - 1]]);
    const got = dashPatternAt(1)!;
    got.push(999);
    expect(PANORAMA_DASH_PATTERNS[1]).not.toContain(999);
  });
});

// ---------------- 线型接线（option / 名称带） ----------------

const PT = (over: Partial<SeriesPoint> & { price: number | null }): SeriesPoint => ({
  bucketId: '202601',
  xLabel: '01-01',
  anchorDate: '2026-01-01',
  rrp: null,
  missing: false,
  offer: null,
  url: 'https://example.test',
  shopName: null,
  ...over,
});

const mkSeries = (over: Partial<Series> & { points: SeriesPoint[] }): Series => ({
  key: 's1',
  isOwn: false,
  brand: 'Acme',
  label: 'Acme Ultra 256GB',
  skuIds: [],
  color: '#3b82f6',
  ...over,
});

const DISC_ONLY = { discounted: true, rrp: false };

const mkGeom = (series: Series[], gridTop = 96): NonNullable<ReturnType<typeof buildGeom>> => {
  const scale = computeYAxis({ series, priceTypes: DISC_ONLY, sliderScale: 1 });
  return buildGeom({ width: 1200, totalH: scale.plotHeight + gridTop + GRID.bottom, gridTop, series, scale, currency: 'usd' })!;
};

describe('线型接线：buildOption / buildLabelPlan', () => {
  // 缺采周夹在两段有价之间 → 产出一座 [4, 4] 虚线桥
  const pts = [PT({ price: 100 }), PT({ price: null, missing: true, bucketId: '202602', xLabel: '01-08' }), PT({ price: 120, bucketId: '202603', xLabel: '01-15' })];

  it('带 lineDash 的系列：主线 lineStyle.type = 该线型；跨接桥仍为 [4, 4]', () => {
    const s = mkSeries({ points: pts, lineDash: [10, 5] });
    const geom = mkGeom([s]);
    const marks = buildEndpointMarks([s]);
    const option = buildOption({ geom, series: [s], priceTypes: DISC_ONLY, granularity: 'week', labelPlan: { dy: {}, names: [] }, gridTop: 96, endpointMarks: marks })!;
    const arr = option.series as { lineStyle: { type?: unknown; width: number } }[];
    expect(arr).toHaveLength(2); // 主线 + 一座桥
    expect(arr[0].lineStyle.type).toEqual([10, 5]);
    expect(arr[1].lineStyle.type).toEqual([4, 4]); // 缺采桥不随线型字段改变、仍是虚线（不造点）
  });

  it('不带 lineDash 的系列：主线不带 type（实线），既有调用方 option 形状不变', () => {
    const s = mkSeries({ points: pts });
    const geom = mkGeom([s]);
    const option = buildOption({ geom, series: [s], priceTypes: DISC_ONLY, granularity: 'week', labelPlan: { dy: {}, names: [] }, gridTop: 96, endpointMarks: buildEndpointMarks([s]) })!;
    const arr = option.series as { lineStyle: Record<string, unknown> }[];
    expect('type' in arr[0].lineStyle).toBe(false);
    expect(arr[1].lineStyle.type).toEqual([4, 4]);
  });

  it('名称带名称项：系列有线型才携带 lineDash，缺省系列不带该键', () => {
    const dashed = mkSeries({ points: pts, lineDash: [2, 4] });
    const plain = mkSeries({ key: 's2', label: 'Acme Lite', points: pts });
    const geom = mkGeom([dashed, plain]);
    const plan = buildLabelPlan({ geom, series: [dashed, plain], granularity: 'week', priceTypes: DISC_ONLY, endpointMarks: new Map() });
    const byKey = new Map(plan.names.map((n) => [n.seriesKey, n]));
    expect(byKey.get('s1')?.lineDash).toEqual([2, 4]);
    expect('lineDash' in byKey.get('s2')!).toBe(false);
  });
});

describe('legendSearchMatch（图例搜索）', () => {
  const s = mkSeries({
    key: 'cmp-samsung-s26__12+256GB',
    brand: 'SAMSUNG',
    label: 'Samsung Galaxy S26 12+256 GB',
    points: [PT({ price: 1 })],
  });

  it('按品牌 / 产品名 / 配置命中，大小写与空白不敏感；不相关词不命中；空查询全命中', () => {
    expect(legendSearchMatch(s, '')).toBe(true);
    expect(legendSearchMatch(s, 'samsung')).toBe(true);
    expect(legendSearchMatch(s, 'GALAXY')).toBe(true);
    expect(legendSearchMatch(s, '256GB')).toBe(true); // 「256GB」对得上「12+256 GB」
    expect(legendSearchMatch(s, '  s26   12+512 ')).toBe(false);
    expect(legendSearchMatch(s, 'apple')).toBe(false);
  });

  it('「折线较多」非阻断提示阈值 = 12 条', () => {
    expect(MANY_LINES_HINT_AT).toBe(12);
  });
});
