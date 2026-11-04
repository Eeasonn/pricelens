// ============================================================
// 悬停摘要浮层横向定位 tipOverlayLeft（2026-11-03 反馈，防边缘遮挡）：
// ①常规：跟随十字线右移；②右缘放不下：左翻；③窄绘图区 + 宽浮层左翻后
// 越左缘（原实现 left 可为负、被容器左缘吞掉）：钳回 plotLeft+8；
// ④最左列 hover：left 恒 ≥ 绘图区左缘 + 8（组件测试难以触达浮层内部几何，
// 定位逻辑为纯函数，几何直接断言）。
// ============================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { tipOverlayLeft } from '../Chart';

describe('tipOverlayLeft · 摘要浮层横向定位', () => {
  const plotLeft = 60;

  it('右缘放得下：跟随十字线右移 16px（不翻转）', () => {
    expect(tipOverlayLeft(plotLeft, 800, 200, 250)).toBe(200 + 16);
  });

  it('右缘放不下：翻到十字线左侧', () => {
    // 200+16+250=466 ≤ 860 不翻；700+16+250=966 > 860 翻 → 700-16-250=434
    expect(tipOverlayLeft(plotLeft, 800, 700, 250)).toBe(434);
  });

  it('窄绘图区 + 宽浮层：左翻后越左缘（left 为负）钳回 plotLeft+8', () => {
    // 翻转门槛 x0 > 60+300-16-250=94；left=x0-16-250 在 x0<334 时 < 68
    expect(tipOverlayLeft(plotLeft, 300, 100, 250)).toBe(plotLeft + 8);
  });

  it('最左列 hover（x0=plotLeft）：left ≥ 绘图区左缘 + 8，不再被容器左缘吞掉', () => {
    expect(tipOverlayLeft(plotLeft, 300, plotLeft, 250)).toBe(plotLeft + 16);
    expect(tipOverlayLeft(plotLeft, 300, plotLeft, 400)).toBeGreaterThanOrEqual(plotLeft + 8);
  });

  it('性质扫描：任意列位 × 任意浮层宽，left 恒 ≥ plotLeft+8（不出绘图区左缘）', () => {
    const plotWidth = 300;
    for (let x0 = plotLeft; x0 <= plotLeft + plotWidth; x0 += 30) {
      for (const w of [50, 150, 250, 400]) {
        expect(tipOverlayLeft(plotLeft, plotWidth, x0, w)).toBeGreaterThanOrEqual(plotLeft + 8);
      }
    }
  });
});
