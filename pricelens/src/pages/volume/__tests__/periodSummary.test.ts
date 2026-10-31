import { describe, expect, it } from 'vitest';
import {
  pricePointValid,
  rangeMarkLabels,
  rangeMarksInView,
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

  it('只有一个有效点时极差为 0，只出一条参考标记', () => {
    const spread = rangeSpreadOf([null, 863], pricePointValid);
    expect(spread.spread).toBe(0);
    expect(spread.samePoint).toBe(true);
    expect(spread.rate).toBe(0);
    expect(rangeMarkLabels(spread, (value) => `$${value}`)).toEqual([
      { index: 1, value: 863, label: '最高＝最低 $863', kind: 'same' },
    ]);
  });

  it('并列的极值取最早的点', () => {
    const spread = rangeSpreadOf([5, 9, 9, 1], pricePointValid);
    expect(spread.max).toEqual({ index: 1, value: 9 });
    expect(spread.min).toEqual({ index: 3, value: 1 });
  });

  it('标记带最高/最低类别，下标落在当前视图内', () => {
    const marks = rangeMarksInView([1, 9, 3, 9], 1, 3, 0, pricePointValid, (value) => String(value));
    expect(marks.find((mark) => mark.kind === 'max')).toMatchObject({ index: 1, value: 9 });
    expect(marks.find((mark) => mark.kind === 'min')).toMatchObject({ index: 2, value: 3, label: '最低 3' });
  });

  it('将图内拖选区间映射回完整时间轴', () => {
    expect(resolveSelectedWindow(8, 19, [2, 8])).toEqual([10, 16]);
    expect(resolveSelectedWindow(8, 19, [10, 2])).toEqual([10, 18]);
    expect(resolveSelectedWindow(8, 19, [-2, 20])).toEqual([8, 19]);
    expect(resolveSelectedWindow(8, 19, null)).toEqual([8, 19]);
  });
});
