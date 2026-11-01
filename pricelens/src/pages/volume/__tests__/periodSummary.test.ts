import { describe, expect, it } from 'vitest';
import {
  formatVolumeAmount,
  pricePointValid,
  rangeBandFrame,
  rangeBandInView,
  rangeSpreadOf,
  resolveSelectedWindow,
  volumePointValid,
} from '../periodSummary';

describe('区间极差', () => {
  it('价格极差 = 最高 − 最低，极差率 = 极差 ÷ 最低价', () => {
    const spread = rangeSpreadOf([1103, null, 900, 863], pricePointValid);
    expect(spread).toMatchObject({
      validCount: 3,
      min: { index: 3, value: 863 },
      max: { index: 0, value: 1103 },
      spread: 240,
    });
    expect(spread.rate).toBeCloseTo(27.8, 1);
  });

  it('中间更低的有效点参与极差，不只看首尾', () => {
    const price = rangeSpreadOf([100, 40, 90], pricePointValid);
    expect(price.spread).toBe(60);
    expect(price.rate).toBeCloseTo(150, 5);
    const volume = rangeSpreadOf([10, 2, 8], volumePointValid);
    expect(volume.spread).toBe(8);
    expect(volume.rate).toBeCloseTo(400, 5);
  });

  it('null 不参与，销量为 0 仍然有效', () => {
    const spread = rangeSpreadOf([null, 0, null, 5], volumePointValid);
    expect(spread.validCount).toBe(2);
    expect(spread.min).toEqual({ index: 1, value: 0 });
    expect(spread.max).toEqual({ index: 3, value: 5 });
  });

  it('最低销量为 0 时极差率保留绝对值、百分比为 null', () => {
    const spread = rangeSpreadOf([0, 40], volumePointValid);
    expect(spread.spread).toBe(40);
    expect(spread.rate).toBeNull();
  });

  it('只有一个有效点时极差为 0，区间带收成一点', () => {
    const spread = rangeSpreadOf([null, 863], pricePointValid);
    expect(spread.spread).toBe(0);
    expect(spread.samePoint).toBe(true);
    expect(spread.rate).toBe(0);
  });

  it('并列的极值取最早的点', () => {
    const spread = rangeSpreadOf([5, 9, 9, 1], pricePointValid);
    expect(spread.max).toEqual({ index: 1, value: 9 });
    expect(spread.min).toEqual({ index: 3, value: 1 });
  });

  it('区间带只覆盖选择区间，不向选区外延伸', () => {
    const band = rangeBandInView([10, 1, 8, 3, 9], 1, 3, 0, pricePointValid);
    expect(band).toMatchObject({ startIndex: 1, endIndex: 3, high: 8, low: 1, flat: false });
    const frame = rangeBandFrame(8, 50, 5, band!.startIndex, band!.endIndex);
    expect(frame).toEqual({ x: 18, width: 30 });
    expect(frame.x).toBeGreaterThan(8);
    expect(frame.x + frame.width).toBeLessThan(8 + 50);
  });

  it('最高等于最低时区间带没有高度', () => {
    const band = rangeBandInView([4, 4, 4], 0, 2, 0, pricePointValid);
    expect(band?.flat).toBe(true);
    expect(band?.high).toBe(band?.low);
    expect(band?.dots).toEqual([{ index: 0, value: 4 }]);
  });

  it('区间带下标已换成当前视图桶下标', () => {
    // 完整时间轴 13 桶，选择区间 10..12，视图从桶 8 开始 → 视图下标 2..4
    const domain = [9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 3, 5, 4];
    const band = rangeBandInView(domain, 10, 12, 8, pricePointValid);
    expect(band?.startIndex).toBe(2);
    expect(band?.endIndex).toBe(4);
    expect(band?.dots).toContainEqual({ index: 3, value: 5 });
    expect(band?.dots).toContainEqual({ index: 2, value: 3 });
  });

  it('将图内拖选区间映射回完整时间轴', () => {
    expect(resolveSelectedWindow(8, 19, [2, 8])).toEqual([10, 16]);
    expect(resolveSelectedWindow(8, 19, [10, 2])).toEqual([10, 18]);
    expect(resolveSelectedWindow(8, 19, [-2, 20])).toEqual([8, 19]);
    expect(resolveSelectedWindow(8, 19, null)).toEqual([8, 19]);
  });

  it('销量格式：万档用万，其余千分位，负数带负号', () => {
    expect(formatVolumeAmount(1234, false)).toBe('1,234');
    expect(formatVolumeAmount(12000, true)).toBe('1.2万');
    expect(formatVolumeAmount(10000, true)).toBe('1万');
    expect(formatVolumeAmount(-2500, false)).toBe('−2,500');
  });
});
