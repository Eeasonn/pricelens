// ============================================================
// 刻度抽稀纯函数（第一百四十七轮）：压缩轴最矮段处刻度互相叠压、越出绘图区
// 下缘的守卫——首尾锚恒保留、中间保距贪心、尾刻度放不下顶掉贴得最近的中间刻度
// ============================================================
import { describe, expect, it } from 'vitest';
import { TICK_MIN_GAP, thinTickRows } from '../chartModel';

const mk = (ys: number[]) => ys.map((y, i) => ({ v: i, y, text: `t${i}` }));

describe('thinTickRows', () => {
  it('间距充足时原样通过', () => {
    const rows = mk([0, 30, 60, 90]);
    expect(thinTickRows(rows)).toEqual(rows);
  });

  it('两行及以下不抽稀（首尾即全部）', () => {
    expect(thinTickRows(mk([0, 5]))).toEqual(mk([0, 5]));
    expect(thinTickRows(mk([10]))).toEqual(mk([10]));
  });

  it('挤在一起的中间刻度被抽稀，首尾锚保留', () => {
    const out = thinTickRows(mk([0, 4, 8, 12, 100]), 16);
    expect(out.map((r) => r.y)).toEqual([0, 100]);
  });

  it('尾刻度贴得太近时顶掉最后一个中间刻度', () => {
    // 中间贪心保留到 32，尾 44 与 32 差 12 < 16 → 32 被 44 顶替（与 16 差 28 合规）
    const out = thinTickRows(mk([0, 16, 32, 44]), 16);
    expect(out.map((r) => r.y)).toEqual([0, 16, 44]);
  });

  it('全部挤死且只剩首行可保时不高估（尾锚让位首锚）', () => {
    const out = thinTickRows(mk([0, 3, 6, 9]), 16);
    expect(out.map((r) => r.y)).toEqual([0]);
  });

  it('默认阈值 = TICK_MIN_GAP', () => {
    expect(TICK_MIN_GAP).toBe(16);
    const rows = mk([0, 10, 20, 36]);
    expect(thinTickRows(rows).map((r) => r.y)).toEqual(thinTickRows(rows, 16).map((r) => r.y));
  });
});
