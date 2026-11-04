// ============================================================
// 推演工作台 v2 · 全生命周期量价图组件测试（A5 参考卡二轮重构，jsdom）：
// 量柱 / 价格线 / 档期琥珀带 / 事件锚（预标 + 补录）渲染、图上拖选区间
// 读数（价 / 量变化胶囊 + 清除）、受控窗口（共享时间轨驱动；窗口变化清
// 选区失义）、补录点选模式（点击周回调 onPickWeek、选区带抑制）、聚焦
// 定位悬停、缺数纪律（柱不画 / 实线断开 + 灰虚桥接 / 读数「—」）、空态。
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
const FULL: [number, number] = [0, MATE80.points.length - 1];
const HUAWEI_FILL = 'rgba(199, 0, 11';
const PLOT_WIDTH = 600 - 44 - 74;
const COL_W = PLOT_WIDTH / 52;
const clientXAt = (index: number): number => Math.round(COL_W * (index + 0.5));
/** 窗口内列 → clientX（窗口长度 n 决定列宽）。 */
const clientXInWindow = (index: number, windowLength: number): number =>
  Math.round((PLOT_WIDTH / windowLength) * (index + 0.5));

/** jsdom 内 PointerShield 的位置为 0 起算：clientX = 列宽 ×（列 + 0.5）。 */
function shieldOf(container: HTMLElement): HTMLElement {
  const el = Array.from(container.querySelectorAll('div'))
    .find((node) => (node as HTMLElement).style.cursor === 'crosshair');
  if (!el) throw new Error('PointerShield 未找到');
  return el as HTMLElement;
}

describe('ReferenceVolumeChart · 渲染（量柱 / 价格线 / 档期带 / 事件锚）', () => {
  it('52 周全窗口出量柱（品牌色半透明）与价格线；档期琥珀带两段；事件锚带 title', () => {
    const { container } = render(<ReferenceVolumeChart product={MATE80} win={FULL} />);
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
    // 图无障碍名：全生命周期口径 + 上市标签 + 双轴语言
    const label = overlay?.getAttribute('aria-label') ?? '';
    expect(label).toContain('全生命周期量价图');
    expect(label).toContain(MATE80.launchWeekLabel);
    expect(label).toContain('右轴');
  });

  it('受控窗口 [16, 31]：X 周标签只在窗口内（W17 / W32），价格双轴刻度常显', () => {
    render(<ReferenceVolumeChart product={MATE80} win={[16, 31]} />);
    expect(screen.queryByText('W1')).toBeNull();
    expect(screen.getAllByText('W17').length).toBeGreaterThan(0);
    expect(screen.getAllByText('W32').length).toBeGreaterThan(0);
    // 窗口 [16,31]：618 档期带（W23–W26）在窗内，黑五带不在
    expect(screen.queryByText(/黑五档期/)).toBeNull();
    const bands = document.querySelectorAll('rect[fill="#ffefcf"]');
    expect(bands.length).toBe(1);
  });
});

describe('ReferenceVolumeChart · 拖选区间读数（选区带各面板独立）', () => {
  it('拖选 W11–W18：胶囊报价（$899 → $849 = −5.6%）与量变化，可 × 清除', () => {
    const { container } = render(<ReferenceVolumeChart product={MATE80} win={FULL} />);
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

  it('共享窗口变化（受控 win 改变）→ 选区下标失义自动清除', () => {
    const { container, rerender } = render(<ReferenceVolumeChart product={MATE80} win={FULL} />);
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(10), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(12), clientY: 60 });
    expect(screen.getByText(/^区间 W11/)).toBeTruthy();
    rerender(<ReferenceVolumeChart product={MATE80} win={[24, 39]} />);
    expect(screen.queryByText(/^区间 W11/)).toBeNull();
    expect(screen.queryByText(/^区间 W/)).toBeNull();
  });

  it('缺采端点回退区间内有值点；全缺显示「—」（缺数不造 0）', () => {
    const sparse: LifecycleProductSeed = {
      ...MATE80,
      id: 'lc-sparse',
      points: MATE80.points.map((v, i) => (i >= 10 && i <= 17 ? null : v)),
      pricePoints: MATE80.pricePoints.map((v, i) => (i >= 10 && i <= 17 ? null : v)) as number[],
    };
    const { container } = render(<ReferenceVolumeChart product={sparse} win={FULL} />);
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(11), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(14), clientY: 60 });
    expect(screen.getByText('价 —')).toBeTruthy();
    expect(screen.getByText('量 —')).toBeTruthy();
  });
});

describe('ReferenceVolumeChart · 补录锚（预标 / 补录同语言）', () => {
  it('composedEvents 上图：虚线 + 方形锚，title 带「补录 ·」前缀与说明；图例标注预标 / 补录', () => {
    const { container } = render(
      <ReferenceVolumeChart
        product={MATE80}
        win={FULL}
        composedEvents={[{ id: 'ce-1', type: 'competitor-launch', week: 10, note: '对手官旗补贴' }]}
      />,
    );
    const anchorTitles = Array.from(container.querySelectorAll('svg title'))
      .map((title) => title.textContent ?? '');
    expect(anchorTitles.some((text) => text === '补录 · 竞品上市（W11）：对手官旗补贴')).toBe(true);
    // 补录锚与预标锚同语言：同为方形锚（10×10 rect stroke 描边）
    const anchors = Array.from(container.querySelectorAll('svg rect'))
      .filter((rect) => rect.getAttribute('width') === '10' && rect.getAttribute('height') === '10');
    expect(anchors.length).toBe(MATE80.events.length + 1);
    expect(document.body.textContent ?? '').toContain('事件锚（预标 / 补录）');
  });

  it('补录锚只在其周位于共享窗口内时出现', () => {
    render(
      <ReferenceVolumeChart
        product={MATE80}
        win={[0, 9]}
        composedEvents={[{ id: 'ce-2', type: 'promo', week: 22, note: '店庆补贴' }]}
      />,
    );
    expect(screen.queryByText(/补录 · 促销投放/)).toBeNull();
  });
});

describe('ReferenceVolumeChart · 补录点选模式（pickMode）', () => {
  it('pickMode 下点击某周：onPickWeek 回调带生命周期周序（松手列），选区带 / 读数被抑制', () => {
    const onPickWeek = vi.fn();
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={[8, 23]} pickMode onPickWeek={onPickWeek} />,
    );
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXInWindow(2, 16), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXInWindow(2, 16), clientY: 60 });
    // 窗口 [8,23]：列 2 = 生命周期周序 8+2 = 10（W11）
    expect(onPickWeek).toHaveBeenCalledWith(10);
    expect(screen.queryByText(/^区间 W/)).toBeNull();
    // 图 aria 名提示点选模式
    const overlay = container.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(overlay.getAttribute('aria-label') ?? '').toContain('补录点选模式');
  });

  it('pickMode 下拖动跨越多列：松手列（终点）为所选周', () => {
    const onPickWeek = vi.fn();
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={[8, 23]} pickMode onPickWeek={onPickWeek} />,
    );
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXInWindow(1, 16), clientY: 60 });
    fireEvent.pointerMove(shield, { pointerId: 7, clientX: clientXInWindow(5, 16), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXInWindow(5, 16), clientY: 60 });
    expect(onPickWeek).toHaveBeenCalledWith(13);
  });

  it('非 pickMode：点击不触发 onPickWeek（正常选区语义）', () => {
    const onPickWeek = vi.fn();
    const { container } = render(<ReferenceVolumeChart product={MATE80} win={FULL} onPickWeek={onPickWeek} />);
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(3), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(3), clientY: 60 });
    expect(onPickWeek).not.toHaveBeenCalled();
    expect(screen.getByText('区间 W4–W4 · 1 周')).toBeTruthy();
  });
});

describe('ReferenceVolumeChart · 聚焦定位与缺数纪律', () => {
  it('focusWeek + focusKey：共享窗口已由父层定位，图内悬停该周（选区清除）', () => {
    const { container, rerender } = render(<ReferenceVolumeChart product={MATE80} win={FULL} />);
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(2), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(4), clientY: 60 });
    expect(screen.getByText(/^区间 W3/)).toBeTruthy();
    // 父层共享窗口移到事件附近（[16,31] 含 W23）并触发 focusKey
    rerender(<ReferenceVolumeChart product={MATE80} win={[16, 31]} focusWeek={22} focusKey={1} />);
    expect(screen.queryByText(/^区间 W3/)).toBeNull();
    // 悬停参考线落在 W23（窗口 [16,31] 内列 6）：参考线画在底层 svg（aria-hidden）
    const hoverLine = Array.from(container.querySelectorAll('svg line'))
      .find((line) => line.getAttribute('stroke') === '#a1a1a1');
    expect(hoverLine).toBeTruthy();
    expect(Number(hoverLine?.getAttribute('x1'))).toBeCloseTo(44 + (PLOT_WIDTH / 16) * 6.5, 0);
  });

  it('缺采周：柱不画（50 根）、价格实线断开为两段 + 灰虚桥接、显示「—」注记', () => {
    const sparse: LifecycleProductSeed = {
      ...MATE80,
      id: 'lc-sparse2',
      points: MATE80.points.map((v, i) => (i === 5 || i === 6 ? null : v)),
      pricePoints: MATE80.pricePoints.map((v, i) => (i === 5 || i === 6 ? null : v)) as number[],
    };
    const { container } = render(<ReferenceVolumeChart product={sparse} win={FULL} />);
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
    render(<ReferenceVolumeChart product={empty} win={[0, 7]} />);
    expect(screen.getByText('暂无可参照历史')).toBeTruthy();
  });
});
