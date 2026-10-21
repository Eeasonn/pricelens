// ============================================================
// 第一百一十九轮（走查会）量价看板 · 面板独立查看时间（非同步模式）纯函数金测。
// ============================================================
import { describe, expect, it } from 'vitest';
import { MIN_WINDOW } from '../../../chart/PriceTrend/helpers';
import { fmtVolume, normalizePanelWindow, vMaxOf } from '../volumeAxis';

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
});
