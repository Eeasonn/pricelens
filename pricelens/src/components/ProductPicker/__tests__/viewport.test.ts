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

// ============================================================
// 级联浮层落位翻转金测（cascadePlacementOf，第一百九十轮）：
// 树浮层动态宽（最宽 ≈ 视口-48），锚点靠右时固定 bottomLeft 会整体顶出
// 视口右缘——锚点左侧放不下即改 bottomRight（右缘对齐锚点、向左展开）。
// 「外层浮窗＋内层级联」的视口回归场景：主浮窗宽 min(860, vw-48)、
// 级联宽 min(1100, vw-48)，1152 桌面与 390 窄屏都有用例。
// ============================================================
import { cascadePlacementOf } from '../pickerBits';

describe('cascadePlacementOf（级联浮层落位翻转）', () => {
  it('1152 桌面、锚点靠左（浮窗左缘 24）→ bottomLeft 原位向右展开', () => {
    // 24 + 1104 + 24 ≤ 1152 → 放得下
    expect(cascadePlacementOf(24, 1104, 1152)).toBe('bottomLeft');
  });

  it('1152 桌面、锚点靠右（对比区添加钮）→ bottomRight 翻转向左展开', () => {
    // 800 + 1104 + 24 > 1152 → 左侧放不下即翻
    expect(cascadePlacementOf(800, 1104, 1152)).toBe('bottomRight');
  });

  it('1152 桌面、小浮层（搜索收窄列后）在右侧锚点也放得下 → 不翻', () => {
    expect(cascadePlacementOf(700, 420, 1152)).toBe('bottomLeft');
  });

  it('390 窄屏（浮层宽 = vw-48 = 342）→ 任何锚点都翻转收边', () => {
    // 锚点左缘 24：24 + 342 + 24 = 390 ≤ 390 恰好放下 → bottomLeft
    expect(cascadePlacementOf(24, 342, 390)).toBe('bottomLeft');
    // 锚点再靠右一点就放不下 → bottomRight
    expect(cascadePlacementOf(60, 342, 390)).toBe('bottomRight');
  });

  it('两侧都放不下（浮层宽 ≈ 视口）→ bottomRight 配合 antd 平移收益更大', () => {
    // vw=1152、bodyW=1104、锚点右缘 1104：左侧 1104-1104-24 < 0 也放不下
    expect(cascadePlacementOf(636, 1104, 1152)).toBe('bottomRight');
  });
});
