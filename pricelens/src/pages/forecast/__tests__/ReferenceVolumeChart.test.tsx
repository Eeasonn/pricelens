// ============================================================
// 推演工作台 v2 · 全生命周期量价图组件测试（A1 参考卡重构，jsdom）：
// 量柱 / 价格线 / 档期琥珀带 / 事件锚渲染、图上拖选区间读数（价 / 量变化
// 胶囊 + 清除）、时间窗滑条（键盘微调 + 聚焦定位）、缺数纪律（柱不画 /
// 实线断开 + 灰虚桥接 / 读数「—」）、空数据空态。
// jsdom 无 ResizeObserver：stub 之；clientWidth 覆写为 600 让图进入就绪态。
// jsdom 无 Pointer Capture API：补齐 PointerShield 依赖的最小面。
// jsdom 无布局（getBoundingClientRect 恒 0）：拖选 clientX 直读，
// 列宽 = (600 − 44 − 74) / 52。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ReferenceVolumeChart from '../ReferenceVolumeChart';
import { workbenchFixture, type LifecycleProductSeed } from '../workbenchFixture';

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
});
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, value: 600 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const POOL = workbenchFixture.references.lifecyclePool;
const MATE80 = POOL[0];
const HUAWEI_FILL = 'rgba(199, 0, 11';
const PLOT_WIDTH = 600 - 44 - 74;
const COL_W = PLOT_WIDTH / 52;
const clientXAt = (index: number): number => Math.round(COL_W * (index + 0.5));

/** jsdom 内 PointerShield 的位置为 0 起算：clientX = 列宽 ×（列 + 0.5）。 */
function shieldOf(container: HTMLElement): HTMLElement {
  const el = Array.from(container.querySelectorAll('div'))
    .find((node) => (node as HTMLElement).style.cursor === 'crosshair');
  if (!el) throw new Error('PointerShield 未找到');
  return el as HTMLElement;
}

describe('ReferenceVolumeChart · 渲染（量柱 / 价格线 / 档期带 / 事件锚）', () => {
  it('52 周全周期出量柱（品牌色半透明）与价格线；档期琥珀带两段；事件锚带 title', () => {
    const { container } = render(<ReferenceVolumeChart product={MATE80} />);
    const bars = Array.from(container.querySelectorAll('rect')).filter((rect) =>
      (rect.getAttribute('fill') ?? '').startsWith(HUAWEI_FILL));
    expect(bars.length).toBe(52);
    const overlay = container.querySelector('svg[role="img"]') as SVGSVGElement | null;
    expect(overlay).toBeTruthy();
    const pricePaths = Array.from(overlay?.querySelectorAll('path') ?? [])
      .filter((path) => path.getAttribute('stroke') === '#c7000b' && !path.getAttribute('stroke-dasharray'));
    expect(pricePaths.length).toBe(1);
    const bands = container.querySelectorAll('rect[fill="#ffefcf"]');
    expect(bands.length).toBe(2);
    const anchorTitles = Array.from(container.querySelectorAll('svg title'))
      .map((title) => title.textContent ?? '');
    expect(anchorTitles.some((text) => text.includes('上市首销'))).toBe(true);
    expect(anchorTitles.some((text) => text.includes('618 档期脉冲'))).toBe(true);
    expect(anchorTitles.some((text) => text.includes('Pura 90 上市挤兑'))).toBe(true);
    // 图无障碍名：全生命周期口径 + 上市标签
    expect(overlay?.getAttribute('aria-label') ?? '').toContain('全生命周期量价图');
    expect((overlay?.getAttribute('aria-label') ?? '')).toContain(MATE80.launchWeekLabel);
  });

  it('X 周标签覆盖首末周（W1 / W52）；时间窗滑条显示全周期读数', () => {
    render(<ReferenceVolumeChart product={MATE80} />);
    // W1 同时出现在 X 轴标签与时间窗起点标签
    expect(screen.getAllByText('W1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('W52').length).toBeGreaterThan(0);
    expect(screen.getByText('查看 52/52 周')).toBeTruthy();
  });
});

describe('ReferenceVolumeChart · 拖选区间读数', () => {
  it('拖选 W11–W18：胶囊报价（$899 → $849 = −6.0%）与量变化，可 × 清除', () => {
    const { container } = render(<ReferenceVolumeChart product={MATE80} />);
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(10), clientY: 60 });
    fireEvent.pointerMove(shield, { pointerId: 7, clientX: clientXAt(17), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(17), clientY: 60 });
    expect(screen.getByText('区间 W11–W18 · 8 周')).toBeTruthy();
    // 价：W11 = 899（调价前），W18 = 849（W17 起阶梯调价后，非档期周）
    expect(screen.getByText('价 −5.6%（$899 → $849）')).toBeTruthy();
    expect(screen.getByText(/^量 .+K 台/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('清除所选区间'));
    expect(screen.queryByText(/^区间 W11/)).toBeNull();
  });

  it('缺采端点回退区间内有值点；全缺显示「—」（缺数不造 0）', () => {
    const sparse: LifecycleProductSeed = {
      ...MATE80,
      id: 'lc-sparse',
      points: MATE80.points.map((v, i) => (i >= 10 && i <= 17 ? null : v)),
      pricePoints: MATE80.pricePoints.map((v, i) => (i >= 10 && i <= 17 ? null : v)) as number[],
    };
    const { container } = render(<ReferenceVolumeChart product={sparse} />);
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(11), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(14), clientY: 60 });
    expect(screen.getByText('价 —')).toBeTruthy();
    expect(screen.getByText('量 —')).toBeTruthy();
  });
});

describe('ReferenceVolumeChart · 时间窗滑条', () => {
  it('起点拖柄 → 键盘右移 8 周：窗口缩至 44 周并清除选区失义', () => {
    render(<ReferenceVolumeChart product={MATE80} />);
    const handle = screen.getByLabelText(/时间窗起点拖柄/);
    for (let i = 0; i < 8; i++) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(screen.getByText('查看 44/52 周')).toBeTruthy();
    expect(screen.queryByText('W1')).toBeNull();
    expect(screen.getAllByText('W9').length).toBeGreaterThan(0);
  });

  it('终点拖柄键盘左移钳制最小窗口（8 周）', () => {
    render(<ReferenceVolumeChart product={MATE80} />);
    const handle = screen.getByLabelText(/时间窗终点拖柄/);
    for (let i = 0; i < 60; i++) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(screen.getByText('查看 8/52 周')).toBeTruthy();
  });

  it('focusWeek + focusKey：窗口定位到事件附近 16 周并悬停该周', () => {
    const { rerender } = render(<ReferenceVolumeChart product={MATE80} />);
    rerender(<ReferenceVolumeChart product={MATE80} focusWeek={22} focusKey={1} />);
    expect(screen.getByText('查看 16/52 周')).toBeTruthy();
    expect(screen.getAllByText('W17').length).toBeGreaterThan(0);
    // 窗口 [16,31]：618 档期带（W23–W26）在窗内，黑五带不在
    expect(screen.queryByText(/黑五档期/)).toBeNull();
  });
});

describe('ReferenceVolumeChart · 缺数纪律与空态', () => {
  it('缺采周：柱不画（50 根）、价格实线断开为两段 + 灰虚桥接、显示「—」注记', () => {
    const sparse: LifecycleProductSeed = {
      ...MATE80,
      id: 'lc-sparse2',
      points: MATE80.points.map((v, i) => (i === 5 || i === 6 ? null : v)),
      pricePoints: MATE80.pricePoints.map((v, i) => (i === 5 || i === 6 ? null : v)) as number[],
    };
    const { container } = render(<ReferenceVolumeChart product={sparse} />);
    const bars = Array.from(container.querySelectorAll('rect')).filter((rect) =>
      (rect.getAttribute('fill') ?? '').startsWith(HUAWEI_FILL));
    expect(bars.length).toBe(50);
    const overlay = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const solid = Array.from(overlay.querySelectorAll('path'))
      .filter((path) => path.getAttribute('stroke') === '#c7000b');
    expect(solid.length).toBe(2);
    const bridge = Array.from(overlay.querySelectorAll('path'))
      .find((path) => path.getAttribute('stroke-dasharray') === '2 3');
    expect(bridge).toBeTruthy();
    expect(screen.getByText('缺数周 W6、W7 显示「—」，不计 0')).toBeTruthy();
  });

  it('空数据：空态「暂无可参照历史」，不崩溃', () => {
    const empty: LifecycleProductSeed = { ...MATE80, id: 'lc-empty', points: [], pricePoints: [] };
    render(<ReferenceVolumeChart product={empty} />);
    expect(screen.getByText('暂无可参照历史')).toBeTruthy();
  });
});
