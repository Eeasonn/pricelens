// ============================================================
// 第一百一十九轮（走查会）量价看板 · 面板独立查看时间（非同步模式）纯函数金测。
// ============================================================
import { describe, expect, it } from 'vitest';
import { MIN_WINDOW } from '../../../chart/PriceTrend/helpers';
import { commitVolumeAxisLimit, fmtVolume, normalizePanelWindow, volumeAxisClipOf, volumeRangeOf, vMaxOf } from '../volumeAxis';

describe('normalizePanelWindow', () => {
  it('未单独调整过（null）→ 回落共享窗口（钳入可调全域）', () => {
    expect(normalizePanelWindow(null, 3, 9, 0, 20)).toEqual([3, 9]);
    expect(normalizePanelWindow(null, -5, 40, 0, 20)).toEqual([0, 20]);
  });

  it('越界钳回全域；端点倒置自动纠序', () => {
    expect(normalizePanelWindow([2, 30], 0, 10, 0, 10)).toEqual([2, 10]);
    expect(normalizePanelWindow([30, 2], 0, 10, 0, 10)).toEqual([2, 10]);
  });

  it('窄于最小跨度 → 先向右补足，贴右缘时回拉起点', () => {
    expect(normalizePanelWindow([5, 5], 0, 10, 0, 10)).toEqual([5, 5 + MIN_WINDOW - 1]);
    expect(normalizePanelWindow([9, 10], 0, 10, 0, 10)).toEqual([10 - (MIN_WINDOW - 1), 10]);
  });

  it('全域本身窄于最小跨度 → 退化为全域', () => {
    expect(normalizePanelWindow([1, 1], 0, 2, 0, 2)).toEqual([0, 2]);
  });
});

describe('volumeAxisClipOf', () => {
  it('手动上限低于数据最大值时必须提示截断', () => {
    expect(volumeAxisClipOf([500, 1200, null], { max: 1000 }, 2000)).toEqual({
      clipped: true,
      dataMax: 1200,
      effectiveMax: 1000,
    });
  });

  it('自动上限或手动上限覆盖数据时不提示截断', () => {
    expect(volumeAxisClipOf([500, 1200], { max: null }, 2000).clipped).toBe(false);
    expect(volumeAxisClipOf([500, 1200], { max: 1500 }, 2000).clipped).toBe(false);
  });

  it('空数据不提示截断', () => {
    expect(volumeAxisClipOf([null], { max: 1000 }, 2000).clipped).toBe(false);
  });
});

describe('既有小工具回归', () => {
  it('fmtVolume：≥10000 缩写 K，否则千分位', () => {
    expect(fmtVolume(12400)).toBe('12.4K');
    expect(fmtVolume(10000)).toBe('10K');
    expect(fmtVolume(9876)).toBe('9,876');
  });

  it('vMaxOf：null 忽略、无数据保底非零', () => {
    expect(vMaxOf([null, 120, 80])).toBeGreaterThanOrEqual(120);
    expect(vMaxOf([])).toBeGreaterThan(0);
  });

  it('销量轴下限固定为 0，仅最高值参与范围计算', () => {
    expect(volumeRangeOf({ max: null }, 3800)).toEqual([0, 3800]);
    expect(volumeRangeOf({ max: 100 }, 3800)).toEqual([0, 100]);
    expect(volumeRangeOf({ max: 0 }, 3800)).toEqual([0, 1]);
  });

  it('销量最高值输入允许低于数据最大值，并可清空恢复自动', () => {
    expect(commitVolumeAxisLimit({ max: null }, 'max', 3200, 3800)).toEqual({ max: 3200 });
    expect(commitVolumeAxisLimit({ max: 3200 }, 'max', 200, 3800)).toEqual({ max: 200 });
    expect(commitVolumeAxisLimit({ max: 3200 }, 'max', 0, 3800)).toEqual({ max: 1 });
    expect(commitVolumeAxisLimit({ max: 3200 }, 'max', null, 3800)).toEqual({ max: null });
  });
});
