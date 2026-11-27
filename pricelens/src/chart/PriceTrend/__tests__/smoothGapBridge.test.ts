// ============================================================
// 缺采虚线桥几何平滑：仅改变屏幕曲线，不制造业务价格点。
// ============================================================
import { describe, expect, it } from 'vitest';
import { smoothGapBridgeValues } from '../chartModel';

describe('smoothGapBridgeValues（缺采桥单调几何平滑）', () => {
  it('邻近有效点提供切线：桥内有视觉采样点，且曲线不越过端点值域', () => {
    const values = [80, 100, null, null, 140, 160];
    const out = smoothGapBridgeValues(values, 2, 3);
    expect(out[0]).toBe(80);
    expect(out[1]).toBe(100);
    expect(out[4]).toBe(140);
    expect(out[5]).toBe(160);
    const middle = out.slice(2, 4);
    expect(middle.some((v) => v != null)).toBe(true);
    for (const v of middle) {
      expect(v).not.toBeNull();
      expect(v!).toBeGreaterThanOrEqual(100);
      expect(v!).toBeLessThanOrEqual(140);
    }
    expect(middle).not.toEqual([140, 140]);
  });

  it('只有两个有效端点时退化为直线，不虚构切线或越界', () => {
    const values = [100, null, null, 120];
    const out = smoothGapBridgeValues(values, 1, 2);
    expect(out[0]).toBe(100);
    expect(out[3]).toBe(120);
    expect(out[1]).toBeGreaterThanOrEqual(100);
    expect(out[1]).toBeLessThanOrEqual(out[2]!);
    expect(out[2]).toBeLessThanOrEqual(120);
  });

  it('端点价格相同则保持水平，不产生人为涨跌', () => {
    const out = smoothGapBridgeValues([90, 100, 100, null, 100, 100, 95], 3, 3);
    for (let i = 1; i <= 4; i++) expect(out[i]).toBe(100);
  });
});
