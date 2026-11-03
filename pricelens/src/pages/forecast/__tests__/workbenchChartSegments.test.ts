// ============================================================
// 推演工作台 v2 图表通用几何纯函数测试（WP5 · 缺数段 / 轴刻度 / 边界派生）：
// 连续有值段（实线）与缺失跨接段（虚线），缺数不造点；首尾缺数、
// 中间单周缺数、全空、不同历史／预测长度均有断言。
// ============================================================
import { describe, expect, it } from 'vitest';
import {
  buildAxisTicks,
  buildLineSegments,
  firstForecastIndex,
  segmentPathD,
  type WorkbenchLineSegment,
} from '../workbenchChartSegments';

const solid = (from: number, to: number): WorkbenchLineSegment => ({ from, to, bridging: false });
const bridge = (from: number, to: number): WorkbenchLineSegment => ({ from, to, bridging: true });

describe('buildLineSegments · 缺数几何', () => {
  it('全有值 → 单条连续实线段，覆盖 [0, n-1]', () => {
    expect(buildLineSegments([3, 5, 8, 2, 9])).toEqual([solid(0, 4)]);
    expect(buildLineSegments([3])).toEqual([solid(0, 0)]);
  });

  it('中间单周缺数 → 两实段 + 一条跨缺段；跨缺段只取两端真实点（缺数不造点）', () => {
    expect(buildLineSegments([1, 2, null, 4, 5])).toEqual([solid(0, 1), bridge(1, 3), solid(3, 4)]);
  });

  it('多周连续缺数 → 仍是一条跨缺段直连两端，不造中间点', () => {
    expect(buildLineSegments([1, 2, null, null, null, 6])).toEqual([solid(0, 1), bridge(1, 5), solid(5, 5)]);
  });

  it('首周缺数 → 实段从首个有值下标开始，无跨缺段', () => {
    expect(buildLineSegments([null, 2, 3, 4])).toEqual([solid(1, 3)]);
  });

  it('尾周缺数 → 实段止于末个有值下标，无跨缺段', () => {
    expect(buildLineSegments([1, 2, 3, null])).toEqual([solid(0, 2)]);
  });

  it('首尾同时缺数 + 中间缺口 → 实段与跨缺段边界正确', () => {
    expect(buildLineSegments([null, 2, 3, null, null, 6, 7, null])).toEqual([
      solid(1, 2),
      bridge(2, 5),
      solid(5, 6),
    ]);
  });

  it('单点段与跨缺段共存：单点实段可渲染为点标记，跨缺段连接到下一实段', () => {
    expect(buildLineSegments([1, null, null, 4, null, 6])).toEqual([solid(0, 0), bridge(0, 3), solid(3, 3), bridge(3, 5), solid(5, 5)]);
  });

  it('全空（全 null）→ 无段', () => {
    expect(buildLineSegments([null, null, null])).toEqual([]);
  });

  it('空数组 → 无段', () => {
    expect(buildLineSegments([])).toEqual([]);
  });

  it('NaN / undefined 视同缺数，不产出 NaN 点', () => {
    expect(buildLineSegments([1, Number.NaN, 3])).toEqual([solid(0, 0), bridge(0, 2), solid(2, 2)]);
    expect(buildLineSegments([undefined, 2, undefined])).toEqual([solid(1, 1)]);
  });

  it('不同历史／预测长度（10 历史 + 6 预测，历史尾缺 1 周）→ 边界随数据走', () => {
    const values = Array.from({ length: 16 }, (_, index) => (index === 9 ? null : index + 1));
    expect(buildLineSegments(values)).toEqual([solid(0, 8), bridge(8, 10), solid(10, 15)]);
  });
});

describe('segmentPathD · 段 → SVG path', () => {
  const pointAt = (index: number): { x: number; y: number } => ({ x: index * 10, y: 100 - index * 5 });

  it('连续段输出 M + 逐点 L', () => {
    expect(segmentPathD(solid(0, 2), pointAt)).toBe('M0.0 100.0 L10.0 95.0 L20.0 90.0');
  });

  it('跨缺段只有两端点，中间缺失下标不产生 L', () => {
    const d = segmentPathD(bridge(1, 4), pointAt);
    expect(d).toBe('M10.0 95.0 L40.0 80.0');
    expect(d).not.toContain('L20.0');
    expect(d).not.toContain('L30.0');
  });

  it('单点段只有 M（无 L），渲染层可跳过或画点', () => {
    expect(segmentPathD(solid(3, 3), pointAt)).toBe('M30.0 85.0');
  });
});

describe('firstForecastIndex · 预测起点派生（禁写死下标）', () => {
  it('8 历史 + 8 预测 → 8', () => {
    const weeks = Array.from({ length: 16 }, (_, index) => ({ status: index < 8 ? ('actual' as const) : ('forecast' as const) }));
    expect(firstForecastIndex(weeks)).toBe(8);
  });

  it('全历史 → -1；全预测 → 0；空数组 → -1', () => {
    expect(firstForecastIndex([{ status: 'actual' }, { status: 'actual' }])).toBe(-1);
    expect(firstForecastIndex([{ status: 'forecast' }])).toBe(0);
    expect(firstForecastIndex([])).toBe(-1);
  });

  it('不同窗口长度（3 历史 + 5 预测）→ 3', () => {
    const weeks = Array.from({ length: 8 }, (_, index) => ({ status: index < 3 ? ('actual' as const) : ('forecast' as const) }));
    expect(firstForecastIndex(weeks)).toBe(3);
  });
});

describe('buildAxisTicks · 数据派生刻度（价格轴不再固定 650–950）', () => {
  it('常规范围 787–911 → 50 步长刻度 800/850/900，全部落在范围内', () => {
    expect(buildAxisTicks(787, 911, 3)).toEqual([800, 850, 900]);
  });

  it('刻度覆盖数据域：首刻度 − 步长 < min 且 末刻度 + 步长 > max', () => {
    const ticks = buildAxisTicks(120, 480, 3);
    expect(ticks.length).toBeGreaterThan(0);
    const step = ticks[1] - ticks[0];
    expect(ticks[0] - step).toBeLessThan(120);
    expect(ticks[ticks.length - 1] + step).toBeGreaterThan(480);
    expect(ticks.every((tick) => tick >= 120 && tick <= 480)).toBe(true);
  });

  it('大范围自动放大步长（60–940）→ 刻度为整百', () => {
    const ticks = buildAxisTicks(60, 940, 3);
    expect(ticks).toEqual([200, 400, 600, 800]);
  });

  it('小范围取整步长，不产出小数刻度', () => {
    expect(buildAxisTicks(798.5, 801.5, 3)).toEqual([799, 800, 801]);
  });

  it('平坦 / 倒置 / 非有限范围 → 空数组（调用方自行回退）', () => {
    expect(buildAxisTicks(800, 800, 3)).toEqual([]);
    expect(buildAxisTicks(900, 100, 3)).toEqual([]);
    expect(buildAxisTicks(Number.NaN, 900, 3)).toEqual([]);
  });
});
