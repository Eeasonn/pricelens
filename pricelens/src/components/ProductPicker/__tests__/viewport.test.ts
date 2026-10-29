// ============================================================
// 选择产品浮窗落点视口钳制金测（clampPanelPos，第一百八十五轮）：
// 浮窗宽 = min(860, 视口-48)（调用方按同式折算传入），落点钳进视口——
// 左缘 ∈ [24, vw-24-panelW]（左右至少 24px 边距）、顶边 ∈ [24, vh-76]；
// 底边不越界由渲染处 maxHeight = 100vh - top - 24 动态收口。
// ============================================================
import { describe, expect, it } from 'vitest';
import { PICKER_EDGE, PICKER_MIN_VISIBLE, clampPanelPos } from '../pickerBits';

describe('clampPanelPos（浮窗落点视口钳制）', () => {
  it('正常落点（锚点在视口中上部）→ 原样保留不动', () => {
    expect(clampPanelPos(290, 106, 860, 1440, 900)).toEqual({ left: 290, top: 106 });
  });

  it('锚点偏左 → 左缘钳到 24px 边距', () => {
    expect(clampPanelPos(4, 106, 860, 1440, 900)).toEqual({ left: PICKER_EDGE, top: 106 });
  });

  it('锚点偏右 → 右缘收进 24px 边距（left = vw - 24 - panelW）', () => {
    expect(clampPanelPos(1200, 106, 860, 1440, 900)).toEqual({ left: 1440 - 24 - 860, top: 106 });
  });

  it('窄视口（panelW = vw - 48）→ left 恒为 24，右缘 = vw - 24', () => {
    const vw = 500;
    const w = Math.min(860, vw - 48); // 452
    expect(clampPanelPos(10, 96, w, vw, 900)).toEqual({ left: PICKER_EDGE, top: 96 });
  });

  it('顶边越界（锚点滚出视口上/下方）→ 钳回 [24, vh - 24 - 52]', () => {
    expect(clampPanelPos(290, -40, 860, 1440, 900)).toEqual({ left: 290, top: PICKER_EDGE });
    expect(clampPanelPos(290, 1200, 860, 1440, 900)).toEqual({
      left: 290,
      top: 900 - PICKER_EDGE - PICKER_MIN_VISIBLE,
    });
  });

  it('极端矮视口 → 顶边上下限重合于 24；窄屏左缘仍按右缘收口钳进视口', () => {
    // vw=500、panelW=400：leftMax = 500-24-400 = 76
    expect(clampPanelPos(1000, 500, 400, 500, 60)).toEqual({ left: 76, top: PICKER_EDGE });
  });
});
