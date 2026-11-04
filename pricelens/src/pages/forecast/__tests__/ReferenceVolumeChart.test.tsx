// ============================================================
// 推演工作台 v3 · 全生命周期量价图组件测试（作业化重设计，jsdom · 任务 10 迁移）：
// 左量右价真实几何（销量轴在左 VolumeBars axisSide='left'，价格刻度画右）、
// 量柱 / 价格线 / 档期琥珀带 / 图顶事件轨（单周虚线方形锚 + 时段 □────□）、
// +N 聚合（第三条重叠起聚合，点击回调只含这些事件的筛选）、统一选中
// （锚点点击 → onSelectEvent；事件详情 = 事件时段读数：实际输入周 / 覆盖 /
// 公式 / 预标参考分栏，预标 impact 不参与计算）、图上拖选事件时段模式
// （回填起止周、无量价读数）、手动区间读数（端点取实际有效周并标注）、
// 名录 hover 加粗弱竖线、受控窗口（窗口变化清选区）、缺数纪律、空态。
// v3 迁移说明：fixture 生命周期池为 108 周量价（B.4.4 全周龄覆盖，缺采仅
// 演示在 lc-x200）；本文件「全窗口」= 前 52 周查看窗 [0, 51]（时间轨可任选，
// 拖选几何按 52 列计算保持原断言语义——52 实柱、缺采 50 柱）。
// jsdom：stub ResizeObserver / Pointer Capture；clientWidth = 600；
// 布局常量 GRID_L=84、GRID_R=52 → 列宽 = (600−84−52)/52。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ReferenceVolumeChart, { assignEventLanes } from '../ReferenceVolumeChart';
import { mergeEffectiveEvents, type EffectiveReferenceEvent } from '../referenceEventModel';
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
// v3：生命周期池 = 108 周；本文件查看窗固定为前 52 周（与列宽常量一致），
// 52 周内 lc-mate80 无缺采 → 52 根量柱；缺采纪律用例在其上补 null（50 根）。
const FULL: [number, number] = [0, 51];
const HUAWEI_FILL = 'rgba(199, 0, 11';
const PLOT_WIDTH = 600 - 84 - 52;
const COL_W = PLOT_WIDTH / 52;
const clientXAt = (index: number): number => Math.round(COL_W * (index + 0.5));
const clientXInWindow = (index: number, windowLength: number): number =>
  Math.round((PLOT_WIDTH / windowLength) * (index + 0.5));

const identity = (typeId: string): string => typeId;
const labelOf = (typeId: string): string =>
  ({ 'competitor-launch': '竞品上市', 'own-launch': '我司上市', promo: '促销投放', cannibalization: '挤兑', other: '其他' } as Record<string, string>)[typeId] ?? typeId;

const presetEvents = (product: LifecycleProductSeed, overrides?: Record<string, unknown>): EffectiveReferenceEvent[] =>
  mergeEffectiveEvents(product, {}, (overrides ?? {}) as Parameters<typeof mergeEffectiveEvents>[2]);

function shieldOf(container: HTMLElement): HTMLElement {
  const el = Array.from(container.querySelectorAll('div'))
    .find((node) => (node as HTMLElement).style.cursor === 'crosshair');
  if (!el) throw new Error('PointerShield 未找到');
  return el as HTMLElement;
}

function overlayOf(container: HTMLElement): SVGSVGElement {
  const el = container.querySelector('svg[role="img"]') as SVGSVGElement | null;
  if (!el) throw new Error('事件 / 价格线层未找到');
  return el;
}

describe('ReferenceVolumeChart · 左量右价几何与基础渲染', () => {
  it('52 周全窗口出量柱与价格线；档期琥珀带两段；图例收敛「销量 / 价格 / 档期 / 事件」', () => {
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />,
    );
    const bars = Array.from(container.querySelectorAll('rect')).filter((rect) =>
      (rect.getAttribute('fill') ?? '').startsWith(HUAWEI_FILL));
    expect(bars.length).toBe(52);
    const overlay = overlayOf(container);
    const pricePaths = Array.from(overlay.querySelectorAll('path'))
      .filter((path) => path.getAttribute('stroke') === '#c7000b' && !path.getAttribute('stroke-dasharray'));
    expect(pricePaths.length).toBe(1);
    const bands = container.querySelectorAll('rect[fill="#ffefcf"]');
    expect(bands.length).toBe(2);
    // 图例四项裸标签（不带解释括号）
    const text = document.body.textContent ?? '';
    expect(text).toContain('销量');
    expect(text).toContain('价格');
    expect(text).toContain('档期');
    expect(text).toContain('事件');
    expect(text).not.toContain('周销（量柱）');
    expect(text).not.toContain('事件锚（预标 / 补录）');
  });

  it('左量右价：销量轴线在绘图区左侧（plotLeft − 10），价格刻度文本在绘图区右侧', () => {
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />,
    );
    // 销量轴竖线 left = 84 − 10 = 74（真实几何，不是文案）
    const axisLine = Array.from(container.querySelectorAll('div'))
      .find((node) => (node as HTMLElement).style.left === '74px' && (node as HTMLElement).style.width === '1px');
    expect(axisLine).toBeTruthy();
    // 价格刻度（$）x 坐标 > 绘图区右缘 84 + 464（刻度在底层 aria-hidden svg）
    const priceTicks = Array.from(container.querySelectorAll('text'))
      .filter((node) => (node.textContent ?? '').startsWith('$'));
    expect(priceTicks.length).toBe(3);
    for (const tick of priceTicks) {
      expect(Number(tick.getAttribute('x'))).toBeGreaterThan(84 + PLOT_WIDTH);
    }
    // 图无障碍名按实际「左量右价」并提供名录文字替代
    const overlay2 = overlayOf(container);
    const label = overlay2.getAttribute('aria-label') ?? '';
    expect(label).toContain('左轴为销量柱');
    expect(label).toContain('右轴为价格线');
    expect(label).toContain('事件名录');
    expect(label).toContain(MATE80.launchWeekLabel);
  });

  it('受控窗口 [16, 31]：X 周标签只在窗口内（W17 / W32），618 档期带在窗内', () => {
    render(
      <ReferenceVolumeChart product={MATE80} win={[16, 31]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />,
    );
    expect(screen.queryByText('W1')).toBeNull();
    expect(screen.getAllByText('W17').length).toBeGreaterThan(0);
    expect(screen.getAllByText('W32').length).toBeGreaterThan(0);
    expect(screen.queryByText(/黑五档期/)).toBeNull();
    const bands = document.querySelectorAll('rect[fill="#ffefcf"]');
    expect(bands.length).toBe(1);
  });
});

describe('ReferenceVolumeChart · 图顶事件轨（单周锚 / 时段轨 / +N 聚合）', () => {
  it('单周事件 = 虚线 + 方形锚（可 Tab、role button、可访问名称含周段与标题）；点击回传统一选中', () => {
    const onSelectEvent = vi.fn();
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} onSelectEvent={onSelectEvent} />,
    );
    const anchor = screen.getByRole('button', { name: '事件 W23 618 档期脉冲' });
    expect(anchor.getAttribute('tabindex')).toBe('0');
    // 单周锚 = 虚线（全高）+ 6×7 方形锚
    const dashed = Array.from(container.querySelectorAll('svg line'))
      .filter((line) => line.getAttribute('stroke-dasharray') === '3 4');
    expect(dashed.length).toBeGreaterThanOrEqual(5); // 5 个预标单周事件
    fireEvent.click(anchor);
    expect(onSelectEvent).toHaveBeenCalledWith('ev-m80-618');
    fireEvent.keyDown(anchor, { key: 'Enter' });
    expect(onSelectEvent).toHaveBeenLastCalledWith('ev-m80-618');
  });

  it('时段事件（覆写为 W23–W26）在事件轨画 □────□（连接线 + 两端方形锚），点击回传选中', () => {
    const onSelectEvent = vi.fn();
    const events = presetEvents(MATE80, {
      'lc-test-618': undefined,
      [`${MATE80.id}::ev-m80-618`]: {
        id: `${MATE80.id}::ev-m80-618`, scopeKey: 's', productId: MATE80.id, sourceEventId: 'ev-m80-618',
        baseFingerprint: 'x', patch: { startWeek: 22, endWeek: 25, label: '618 档期脉冲' }, revision: 1,
        createdAt: 't', updatedAt: 't',
      },
    });
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={events} labelOf={labelOf} colorOf={identity} onSelectEvent={onSelectEvent} />,
    );
    const anchor = screen.getByRole('button', { name: '事件 W23–W26 618 档期脉冲' });
    fireEvent.click(anchor);
    expect(onSelectEvent).toHaveBeenCalledWith('ev-m80-618');
    // 时段轨连接线（lane 0/1 顶部的横向线）+ 两端锚
    const overlay = overlayOf(container);
    const trackLines = Array.from(overlay.querySelectorAll('line'))
      .filter((line) => !line.getAttribute('stroke-dasharray') && line.getAttribute('y1') === line.getAttribute('y2'));
    expect(trackLines.length).toBeGreaterThanOrEqual(1);
    void container;
  });

  it('第三条重叠事件聚合 +N：点击 onOverflowEvents 回传只含这些事件的集合', () => {
    const onOverflowEvents = vi.fn();
    const triple: EffectiveReferenceEvent[] = [
      { id: 'a', productId: 'x', source: 'composed', typeId: 'promo', startWeek: 10, endWeek: 14, label: 'A', note: '', impact: null, overridden: false, revision: 1, createdAt: 't1', updatedAt: 't1' },
      { id: 'b', productId: 'x', source: 'composed', typeId: 'promo', startWeek: 11, endWeek: 15, label: 'B', note: '', impact: null, overridden: false, revision: 1, createdAt: 't2', updatedAt: 't2' },
      { id: 'c', productId: 'x', source: 'composed', typeId: 'promo', startWeek: 12, endWeek: 16, label: 'C', note: '', impact: null, overridden: false, revision: 1, createdAt: 't3', updatedAt: 't3' },
    ];
    render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={triple} labelOf={labelOf} colorOf={identity} onOverflowEvents={onOverflowEvents} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '查看其余 1 个重叠事件' }));
    expect(onOverflowEvents).toHaveBeenCalledWith(['c']);
  });

  it('assignEventLanes：不重叠同 lane、两两重叠换 lane、三重重叠溢出', () => {
    const ev = (id: string, s: number, e: number): EffectiveReferenceEvent =>
      ({ id, productId: 'x', source: 'composed', typeId: 'promo', startWeek: s, endWeek: e, label: id, note: '', impact: null, overridden: false, revision: 1, createdAt: 't', updatedAt: 't' });
    const map = assignEventLanes([ev('a', 0, 5), ev('b', 6, 10), ev('c', 8, 12), ev('d', 13, 20)]);
    expect(map.get('a')?.lane).toBe(0);
    expect(map.get('b')?.lane).toBe(0);
    expect(map.get('c')?.lane).toBe(1);
    expect(map.get('d')?.lane).toBe(0);
    expect(map.get('c')?.overflow.map((o) => o.id)).toEqual([]);
    // 三重重叠（A-B-C 两两相交）：第三条起聚合 +N
    const triple = assignEventLanes([ev('a', 10, 14), ev('b', 11, 15), ev('c', 12, 16)]);
    expect(triple.get('a')?.lane).toBe(0);
    expect(triple.get('b')?.lane).toBe(1);
    expect(triple.get('c')?.overflow.map((o) => o.id)).toEqual(['c']);
  });

  it('名录 hover（hoverEventId）→ 弱竖线出现；离开恢复由父层控制', () => {
    const { rerender } = render(
      <ReferenceVolumeChart product={MATE80} win={[16, 31]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} hoverEventId="ev-m80-618" />,
    );
    const weakLine = () => Array.from(document.body.querySelectorAll('line'))
      .filter((line) => line.getAttribute('stroke-dasharray') === '2 3' && line.getAttribute('stroke-opacity') === '0.4');
    expect(weakLine().length).toBeGreaterThanOrEqual(1);
    rerender(
      <ReferenceVolumeChart product={MATE80} win={[16, 31]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} hoverEventId={null} />,
    );
    expect(weakLine().length).toBe(0);
  });
});

describe('ReferenceVolumeChart · 事件详情与事件时段读数', () => {
  it('选中事件 → 详情卡：实际输入周 / 覆盖 / 计算口径 / 预标参考分栏（impact 不参与计算）', () => {
    const events = presetEvents(MATE80, {
      [`${MATE80.id}::ev-m80-618`]: {
        id: `${MATE80.id}::ev-m80-618`, scopeKey: 's', productId: MATE80.id, sourceEventId: 'ev-m80-618',
        baseFingerprint: 'x', patch: { startWeek: 22, endWeek: 25, note: '平台补贴与档期降价叠加' }, revision: 1,
        createdAt: 't', updatedAt: 't',
      },
    });
    render(
      <ReferenceVolumeChart
        product={MATE80} win={[16, 31]} events={events} labelOf={labelOf} colorOf={identity}
        selectedEventId="ev-m80-618" onSelectEvent={vi.fn()} onEditEvent={vi.fn()} onRestorePreset={vi.fn()}
      />,
    );
    const detail = screen.getByRole('group', { name: '事件时段读数 W23–W26 618 档期脉冲' });
    const text = detail.textContent ?? '';
    expect(text).toContain('事件时段 4 周');
    expect(text).toContain('销量有效 4/4');
    expect(text).toContain('期内均周销');
    expect(text).toContain('较前 4 周');
    expect(text).toContain('前段 W19–W22 · 均值比均值；端点取实际有效周');
    expect(text).toContain('价格 $799（W23）→ $799（W26）');
    // 预标参考分栏：impact 只作标注，并明示不参与计算
    expect(text).toContain('预标参考 +42% · 4 周 · 未标衰减（仅预标，不参与上述计算）');
    expect(text).toContain('说明 平台补贴与档期降价叠加');
    expect(text).toContain('预标 · 已改');
    // 动作：编辑 / 恢复预标 / 关闭（可访问名称含周段与标题）
    expect(screen.getByRole('button', { name: '编辑事件 W23–W26 618 档期脉冲' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '恢复预标 W23–W26 618 档期脉冲' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭事件详情' }));
  });

  it('全缺时段 → 「无法计算」，不补 0；无有效价格只显示 —', () => {
    const sparse: LifecycleProductSeed = {
      ...MATE80,
      id: 'lc-sparse-r',
      points: MATE80.points.map((v, i) => (i >= 22 && i <= 25 ? null : v)),
      pricePoints: MATE80.pricePoints.map((v, i) => (i >= 22 && i <= 25 ? null : v)),
      events: MATE80.events,
    };
    render(
      <ReferenceVolumeChart
        product={sparse} win={[16, 31]}
        events={mergeEffectiveEvents(sparse, {}, {})} labelOf={labelOf} colorOf={identity}
        selectedEventId="ev-m80-618"
      />,
    );
    const text = (screen.getByRole('group', { name: '事件时段读数 W23 618 档期脉冲' }).textContent ?? '');
    expect(text).toContain('无法计算');
    expect(text).toContain('销量有效 0/1');
  });
});

describe('ReferenceVolumeChart · 拖选（区间读数 / 事件时段回填）', () => {
  it('手动拖选区间读数：价 / 量端点取实际有效周并标注；可 × 清除', () => {
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />,
    );
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(10), clientY: 60 });
    fireEvent.pointerMove(shield, { pointerId: 7, clientX: clientXAt(17), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(17), clientY: 60 });
    expect(screen.getByText('区间 W11–W18 · 8 周')).toBeTruthy();
    // 价：W11 = 899（调价前），W18 = 849（W17 起阶梯调价后）——端点周显式标注
    expect(screen.getByText('价 $899（W11）→ $849（W18） −5.6%')).toBeTruthy();
    expect(screen.getByText(/^量 .+（W11）→ .+（W18）/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('清除所选区间'));
    expect(screen.queryByText(/^区间 W11/)).toBeNull();
  });

  it('窗口变化 → 选区失义自动清除', () => {
    const { container, rerender } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />,
    );
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(10), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(12), clientY: 60 });
    expect(screen.getByText(/^区间 W11/)).toBeTruthy();
    rerender(<ReferenceVolumeChart product={MATE80} win={[24, 39]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />);
    expect(screen.queryByText(/^区间 W/)).toBeNull();
  });

  it('拖选事件时段模式：松手回填起止周（反向拖动排序）；拖动中只显示 W起–W止 · N 周且无量价读数', () => {
    const onSelectRange = vi.fn();
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={[8, 23]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} rangePickMode onSelectRange={onSelectRange} />,
    );
    const shield = shieldOf(container);
    // 反向拖动：先右后左 → 排序后同一闭区间
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXInWindow(5, 16), clientY: 60 });
    fireEvent.pointerMove(shield, { pointerId: 7, clientX: clientXInWindow(2, 16), clientY: 60 });
    expect(screen.getByText('已选 W11–W14 · 4 周')).toBeTruthy();
    expect(screen.queryByText(/^区间 W/)).toBeNull();
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXInWindow(2, 16), clientY: 60 });
    expect(onSelectRange).toHaveBeenCalledWith(10, 13);
    expect(screen.queryByText(/^已选 W/)).toBeNull();
    // 单击等价起止同周
    fireEvent.pointerDown(shield, { pointerId: 8, clientX: clientXInWindow(3, 16), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 8, clientX: clientXInWindow(3, 16), clientY: 60 });
    expect(onSelectRange).toHaveBeenLastCalledWith(11, 11);
    // 图 aria 名提示拖选模式
    expect((overlayOf(container).getAttribute('aria-label') ?? '')).toContain('拖选事件时段模式');
  });
});

describe('ReferenceVolumeChart · 聚焦定位 / 缺数纪律 / 空态', () => {
  it('focusWeek + focusKey：父层窗口已定位，图内悬停该周（选区清除）', () => {
    const { container, rerender } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />,
    );
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(2), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(4), clientY: 60 });
    expect(screen.getByText(/^区间 W3/)).toBeTruthy();
    rerender(
      <ReferenceVolumeChart product={MATE80} win={[16, 31]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} focusWeek={22} focusKey={1} />,
    );
    expect(screen.queryByText(/^区间 W3/)).toBeNull();
    const hoverLine = Array.from(container.querySelectorAll('svg line'))
      .find((line) => line.getAttribute('stroke') === '#a1a1a1' && line.getAttribute('stroke-opacity') === '0.6');
    expect(hoverLine).toBeTruthy();
    expect(Number(hoverLine?.getAttribute('x1'))).toBeCloseTo(84 + (PLOT_WIDTH / 16) * 6.5, 0);
  });

  it('缺采周：柱不画（50 根）、价格实线断开 + 灰虚桥接、注记「缺数 W6、W7 · 不计 0」', () => {
    const sparse: LifecycleProductSeed = {
      ...MATE80,
      id: 'lc-sparse2',
      points: MATE80.points.map((v, i) => (i === 5 || i === 6 ? null : v)),
      pricePoints: MATE80.pricePoints.map((v, i) => (i === 5 || i === 6 ? null : v)),
      events: MATE80.events,
    };
    const { container } = render(
      <ReferenceVolumeChart product={sparse} win={FULL} events={mergeEffectiveEvents(sparse, {}, {})} labelOf={labelOf} colorOf={identity} />,
    );
    const bars = Array.from(container.querySelectorAll('rect')).filter((rect) =>
      (rect.getAttribute('fill') ?? '').startsWith(HUAWEI_FILL));
    expect(bars.length).toBe(50);
    const overlay = overlayOf(container);
    const solid = Array.from(overlay.querySelectorAll('path'))
      .filter((path) => path.getAttribute('stroke') === '#c7000b');
    expect(solid.length).toBe(2);
    const bridge = Array.from(overlay.querySelectorAll('path'))
      .find((path) => path.getAttribute('stroke-dasharray') === '2 3');
    expect(bridge).toBeTruthy();
    expect(screen.getByText('缺数 W6、W7 · 不计 0')).toBeTruthy();
  });

  it('空数据：空态「暂无可参照历史」，不崩溃', () => {
    const empty: LifecycleProductSeed = { ...MATE80, id: 'lc-empty', points: [], pricePoints: [], events: [] };
    render(
      <ReferenceVolumeChart product={empty} win={[0, 7]} events={[]} labelOf={labelOf} colorOf={identity} />,
    );
    expect(screen.getByText('暂无可参照历史')).toBeTruthy();
  });
});
