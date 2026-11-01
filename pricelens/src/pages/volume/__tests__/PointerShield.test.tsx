// ============================================================
// PointerShield 组件级测试（2026-11-01 审计 P3 补测）：量价面板绘图区的指针
// 承接层——悬停列 / 点击单周 / 拖选区间 / 越缘钳制 / 离开清除。
// jsdom 环境跑（// @vitest-environment jsdom）；jsdom 无布局（getBoundingClientRect
// 恒 0），坐标换算退化为 clientX 直读，桶宽 = plotWidth / n 由 props 给定。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import PointerShield from '../PointerShield';

// jsdom 未实现 Pointer Capture API，补齐 PointerShield 依赖的最小面
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
});
afterEach(cleanup);

interface Harness {
  onHover: ReturnType<typeof vi.fn>;
  onBrush: ReturnType<typeof vi.fn>;
  onCrossY: ReturnType<typeof vi.fn>;
  el: HTMLElement;
}

/** 4 桶 × 400px 宽（桶宽 100px），绘图区高 200、顶 20。 */
const mount = (): Harness => {
  const onHover = vi.fn();
  const onBrush = vi.fn();
  const onCrossY = vi.fn();
  const { container } = render(
    <PointerShield
      plotLeft={0}
      plotTop={20}
      plotWidth={400}
      plotHeight={200}
      extraBottom={24}
      n={4}
      onHover={onHover}
      onBrush={onBrush}
      onCrossY={onCrossY}
    />,
  );
  return { onHover, onBrush, onCrossY, el: container.firstChild as HTMLElement };
};

const down = (el: HTMLElement, x: number): void => { fireEvent.pointerDown(el, { pointerId: 7, clientX: x, clientY: 100 }); };
const move = (el: HTMLElement, x: number, y = 100): void => { fireEvent.pointerMove(el, { pointerId: 7, clientX: x, clientY: y }); };
const up = (el: HTMLElement): void => { fireEvent.pointerUp(el, { pointerId: 7, clientX: 0, clientY: 0 }); };

describe('PointerShield · 悬停与参考位', () => {
  it('悬停落在指针所在桶：按桶宽换算列号并上报 onHover / onCrossY', () => {
    const { el, onHover, onCrossY } = mount();
    move(el, 90);
    expect(onHover).toHaveBeenLastCalledWith(0);
    move(el, 310, 0);
    expect(onHover).toHaveBeenLastCalledWith(3);
    // 纵向位置钳入绘图区 [plotTop, plotTop+plotHeight]（clientY=0 → 钳到 20）
    expect(onCrossY).toHaveBeenLastCalledWith(20);
    move(el, 250, 999);
    expect(onCrossY).toHaveBeenLastCalledWith(220);
  });

  it('指针在绘图区外悬停不上报；离开（无拖动）清除悬停与参考位', () => {
    const { el, onHover, onCrossY } = mount();
    move(el, -10);
    expect(onHover).not.toHaveBeenCalled();
    move(el, 450);
    expect(onHover).not.toHaveBeenCalled();
    move(el, 100); // 先进入绘图区
    expect(onHover).toHaveBeenCalled();
    // React 的 onPointerLeave 由 pointerout（relatedTarget 移出）模拟
    fireEvent.pointerOut(el, { relatedTarget: document.body });
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(onCrossY).toHaveBeenLastCalledWith(null);
  });
});

describe('PointerShield · 拖选区间（按下即从单周起选）', () => {
  it('单击 = 选单周：按下即预览 [i, i]，松手提交', () => {
    const { el, onBrush } = mount();
    down(el, 90);
    expect(onBrush).toHaveBeenLastCalledWith([0, 0], false);
    up(el);
    expect(onBrush).toHaveBeenLastCalledWith([0, 0], true);
  });

  it('拖选扩展为区间，松手提交 anchor 与当前列的有序闭区间', () => {
    const { el, onBrush } = mount();
    down(el, 50); // 桶 0
    move(el, 350); // 桶 3
    expect(onBrush).toHaveBeenLastCalledWith([0, 3], false);
    up(el);
    expect(onBrush).toHaveBeenLastCalledWith([0, 3], true);
  });

  it('反向拖选（右起左收）提交的区间仍为有序闭区间', () => {
    const { el, onBrush } = mount();
    down(el, 350);
    move(el, 50);
    up(el);
    expect(onBrush).toHaveBeenLastCalledWith([0, 3], true);
  });

  it('pointerCancel 取消拖选：回滚为 null 预览、不提交', () => {
    const { el, onBrush } = mount();
    down(el, 50);
    move(el, 150);
    fireEvent.pointerCancel(el, { pointerId: 7 });
    expect(onBrush).toHaveBeenLastCalledWith(null, false);
  });

  it('拖选中指针越出绘图区：钳到边缘桶继续预览，不冻结在缘内最后一列', () => {
    const { el, onBrush } = mount();
    down(el, 50); // 桶 0
    move(el, 1000); // 越出右缘 → 钳到桶 3
    expect(onBrush).toHaveBeenLastCalledWith([0, 3], false);
    // 起点已在最左桶时继续向左越出：无可选列，不再上报
    const calls = onBrush.mock.calls.length;
    move(el, -100);
    expect(onBrush.mock.calls.length).toBe(calls);
  });
});
