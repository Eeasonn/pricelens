// ============================================================
// 推演工作台 v3 · 全生命周期量价图组件测试（2026-11-05 四条整改迁移，jsdom）：
// 左量右价真实几何（销量轴在左 VolumeBars axisSide='left'，价格刻度画右）、
// X 轴日历周（axisTickPlan / shortBucketLabel 同价格走势页口径：周 = 2026W33
// 无连字符，锚点 = launchWeekLabel 真实 ISO 周历，跨年进位 2025W52 → 2026W01，
// 首尾恒显示 + step 抽稀；旧相对周序号 W1…W108 删除）、顶部统一事件点轨
// （档期 + 事件合一为类目色小方块点：标在事件起始周、同起点两点纵向微错开、
// 第三点起聚合 +N；区间箭头-连线 / 2-lane 分轨删除）、图内高亮开关三态
// （默认关 = 无高亮 / 开 = 各自颜色 0.12 底色 / hover = 0.16 临时高亮且不受
// 开关影响）、图例三项（销量 / 价格 / 事件）全部可点切换显隐（aria-pressed +
// 隐藏态 opacity .45；事件隐 = 小标轨 + 图内高亮整层隐藏）、+N 聚合点击回调、
// 统一选中（事件点点击 → onSelectEvent；证据浮框五项精简）、图上拖选事件时段
// 模式、手动区间读数、受控窗口、缺数纪律、空态。
// v3 迁移说明：fixture 生命周期池为 108 周量价；本文件「全窗口」= 前 52 周
// 查看窗 [0, 51]（拖选几何按 52 列计算——52 实柱、缺采 50 柱）。
// jsdom：stub ResizeObserver / Pointer Capture；clientWidth = 600；
// 布局常量 GRID_L=84、GRID_R=52 → 列宽 = (600−84−52)/52。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ReferenceVolumeChart from '../ReferenceVolumeChart';
import { lifecycleWeekIdsOf, mergeEffectiveEvents, type EffectiveReferenceEvent } from '../referenceEventModel';
import { workbenchFixture, type LifecycleProductSeed } from '../workbenchFixture';
import { color, font } from '../../../theme/tokens';

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
// 生命周期周序 → 日历周 ID（与图 X 轴同一换算：锚点 = launchWeekLabel，ISO 跨年进位）
const MATE_WEEKS = lifecycleWeekIdsOf(MATE80);
// v3：生命周期池 = 108 周；本文件查看窗固定为前 52 周（与列宽常量一致）。
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
const promoAmberOf = (typeId: string): string => (typeId === 'promo' ? '#f5a623' : '#0070f3');

const presetEvents = (product: LifecycleProductSeed, overrides?: Record<string, unknown>): EffectiveReferenceEvent[] =>
  mergeEffectiveEvents(product, {}, (overrides ?? {}) as Parameters<typeof mergeEffectiveEvents>[2]);

function shieldOf(container: HTMLElement): HTMLElement {
  const el = Array.from(container.querySelectorAll('div'))
    .find((node) => (node as HTMLElement).style.cursor === 'crosshair');
  if (!el) throw new Error('PointerShield 未找到');
  return el;
}

function overlayOf(container: HTMLElement): SVGSVGElement {
  const el = container.querySelector('svg[role="img"]') as SVGSVGElement | null;
  if (!el) throw new Error('事件 / 价格线层未找到');
  return el;
}

/** 底层高亮 rect（opacity 0.12 = 开关常驻 / 0.16 = 悬停临时）。 */
function highlightRects(container: HTMLElement, opacity: string): SVGRectElement[] {
  return Array.from(container.querySelectorAll('rect'))
    .filter((rect) => rect.getAttribute('opacity') === opacity && rect.getAttribute('height') === '200');
}

/** 事件点轨小方块（overlay svg 内 8×8 填充方块）。 */
function eventDots(container: HTMLElement, fill: string): SVGRectElement[] {
  return Array.from(overlayOf(container).querySelectorAll('rect'))
    .filter((rect) => rect.getAttribute('fill') === fill && rect.getAttribute('width') === '8');
}

function legendOf(): HTMLElement {
  return screen.getByRole('group', { name: '图例（点击切换系列显隐）' });
}

describe('ReferenceVolumeChart · 左量右价几何与基础渲染', () => {
  it('52 周全窗口出量柱与价格线；图内无常驻琥珀档期带；图例 = 销量 / 价格 / 事件 三项全可点（档期项删除），图内高亮开关内联其后默认关', () => {
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
    // 删除图内常驻琥珀档期带（warningSoft #ffefcf 不再出现）
    expect(container.querySelectorAll('rect[fill="#ffefcf"]').length).toBe(0);
    // 图例三项（#3：档期项删除，全部可点 = 带 key + aria-pressed）
    const legend = legendOf();
    const names = within(legend).getAllByRole('button')
      .map((button) => (button.textContent ?? '').replace('▼', '').trim());
    expect(names).toEqual(['销量', '价格', '事件']);
    for (const button of within(legend).getAllByRole('button')) {
      expect(button.getAttribute('aria-pressed')).toBe('true');
    }
    expect(within(legend).queryByText('档期')).toBeNull();
    // 图内高亮开关（#4）：紧跟「事件」图例项之后（同一行内、图例的下一兄弟）
    const switchButton = screen.getByRole('switch', { name: '图内高亮：关' });
    expect(switchButton.getAttribute('aria-checked')).toBe('false');
    expect(legend.nextElementSibling).toBe(switchButton);
    expect((document.body.textContent ?? '')).not.toContain('周销（量柱）');
    expect((document.body.textContent ?? '')).not.toContain('事件锚（预标 / 补录）');
  });

  it('X 轴 = 日历周 ID（#1）：2025W02 锚点起、2026W01 跨年进位；首尾恒显示；旧相对周序号 W 删除；文本规格对齐价格走势页', () => {
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />,
    );
    // 首刻度 = launchWeekLabel（2025-W02 → 2025W02）；末刻度 = 第 52 周（ISO 跨年 → 2026W01）
    expect(screen.getAllByText('2025W02').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026W01').length).toBeGreaterThan(0);
    // 旧相对周序号（W1…Wnn 裸标签）删除：图内不再出现任何 W\d+ 文本
    const relativeLabels = Array.from(container.querySelectorAll('text'))
      .map((node) => node.textContent ?? '')
      .filter((text) => /^W\d+$/.test(text));
    expect(relativeLabels).toEqual([]);
    // 刻度规格（#5 对齐价格走势页 / CostBarChart）：fontFamily + 10px + tabular-nums；
    // 首尾恒显示（edge = body + 600），中间 = mute + 400
    const first = screen.getAllByText('2025W02')[0];
    expect(first.getAttribute('font-family')).toBe(font.family);
    expect(first.getAttribute('font-size')).toBe('10');
    expect(first.getAttribute('style')).toContain('tabular-nums');
    expect(first.getAttribute('fill')).toBe(color.body);
    expect(first.getAttribute('font-weight')).toBe('600');
    const mid = screen.getAllByText('2025W20')[0];
    expect(mid.getAttribute('fill')).toBe(color.mute);
    expect(mid.getAttribute('font-weight')).toBe('400');
    expect(mid.getAttribute('font-family')).toBe(font.family);
  });

  it('受控窗口 [16, 31]：X 标签 2025W18 / 2025W33（首尾必标）；618 档期 = 起始周琥珀方块点；旧区间箭头-连线删除；窗外黑五不渲染', () => {
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={[16, 31]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />,
    );
    expect(screen.getAllByText('2025W18').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2025W33').length).toBeGreaterThan(0);
    expect(screen.queryByText('W17')).toBeNull();
    expect(screen.queryByText('W32')).toBeNull();
    // 窗内档期点（618 档期 W23–W26 → 点在起始周 W23 / 下标 22）；窗外（黑五档期 W47–W50）不渲染
    expect(screen.getByRole('img', { name: `档期 618 档期 ${MATE_WEEKS[22]}–${MATE_WEEKS[25]}` })).toBeTruthy();
    expect(screen.queryByRole('img', { name: /黑五档期/ })).toBeNull();
    const bandDot = eventDots(container, '#f5a623')[0];
    expect(bandDot).toBeTruthy();
    // 窗长 16 → 列宽 = PLOT_WIDTH / 16；点位 = 起始周下标 22 的列中线
    expect(Number(bandDot.getAttribute('x'))).toBeCloseTo(84 + (PLOT_WIDTH / 16) * (22 - 16 + 0.5) - 4, 0);
    // 区间呈现（#2）：旧左右箭头折线 / 中间连线全删，档期只余方块点
    const overlay = overlayOf(container);
    expect(Array.from(overlay.querySelectorAll('path')).filter((path) => path.getAttribute('stroke') === '#f5a623').length).toBe(0);
    expect(Array.from(overlay.querySelectorAll('line')).filter((line) => line.getAttribute('stroke') === '#f5a623').length).toBe(0);
  });

  it('左量右价：销量轴线在绘图区左侧（plotLeft − 10），价格刻度文本在绘图区右侧；图 aria 名 = 日历周口径 + 事件点合一描述', () => {
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
    // 图无障碍名：日历周锚点（2025W02）+ 左量右价 + 事件点合一（无旧「箭头-线 / 方标」描述）
    const label = overlayOf(container).getAttribute('aria-label') ?? '';
    expect(label).toContain('左轴为销量柱');
    expect(label).toContain('右轴为价格线');
    expect(label).toContain('事件名录');
    expect(label).toContain('2025W02');
    expect(label).toContain('日历周标签');
    expect(label).toContain('事件点');
    expect(label).not.toContain('箭头');
  });
});

describe('ReferenceVolumeChart · 顶部事件点轨（合一方块点 / 同起点微错开 / +N 聚合）', () => {
  it('单周事件 = 类目色小方块点（可 Tab、role button、可访问名称含周段与标题）；点击回传统一选中', () => {
    const onSelectEvent = vi.fn();
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={promoAmberOf} onSelectEvent={onSelectEvent} />,
    );
    const anchor = screen.getByRole('button', { name: `事件 ${MATE_WEEKS[22]} 618 档期脉冲` });
    expect(anchor.getAttribute('tabindex')).toBe('0');
    // 618 档期带与 618 事件同起点（W23 / 下标 22）→ 两点纵向微错开（stack 0 = y5，stack 1 = y10）
    const stacked = eventDots(container, '#f5a623')
      .filter((rect) => Math.abs(Number(rect.getAttribute('x')) - (84 + COL_W * 22.5 - 4)) < 1)
      .map((rect) => Number(rect.getAttribute('y')))
      .sort((a, b) => a - b);
    expect(stacked).toEqual([5, 10]);
    fireEvent.click(anchor);
    expect(onSelectEvent).toHaveBeenCalledWith('ev-m80-618');
    fireEvent.keyDown(anchor, { key: 'Enter' });
    expect(onSelectEvent).toHaveBeenLastCalledWith('ev-m80-618');
  });

  it('同起点第三事件起聚合 +N：前两点常显（微错开）、第三点不渲染，点击 onOverflowEvents 回传只含这些事件的集合', () => {
    const onOverflowEvents = vi.fn();
    const triple: EffectiveReferenceEvent[] = [
      { id: 'a', productId: 'x', source: 'composed', typeId: 'promo', startWeek: 10, endWeek: 12, label: 'A', note: '', impact: null, overridden: false, revision: 1, createdAt: 't1', updatedAt: 't1' },
      { id: 'b', productId: 'x', source: 'composed', typeId: 'competitor-launch', startWeek: 10, endWeek: 14, label: 'B', note: '', impact: null, overridden: false, revision: 1, createdAt: 't2', updatedAt: 't2' },
      { id: 'c', productId: 'x', source: 'composed', typeId: 'promo', startWeek: 10, endWeek: 16, label: 'C', note: '', impact: null, overridden: false, revision: 1, createdAt: 't3', updatedAt: 't3' },
      { id: 'd', productId: 'x', source: 'composed', typeId: 'other', startWeek: 20, endWeek: 22, label: 'D', note: '', impact: null, overridden: false, revision: 1, createdAt: 't4', updatedAt: 't4' },
    ];
    render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={triple} labelOf={labelOf} colorOf={promoAmberOf} onOverflowEvents={onOverflowEvents} />,
    );
    // 前两点常显（A = 主行，B = 微错开行 y = 10）；第三点聚合进 +N
    expect(screen.getByRole('button', { name: `事件 ${MATE_WEEKS[10]}–${MATE_WEEKS[12]} A` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `事件 ${MATE_WEEKS[10]}–${MATE_WEEKS[14]} B` })).toBeTruthy();
    expect(screen.queryByRole('button', { name: `事件 ${MATE_WEEKS[10]}–${MATE_WEEKS[16]} C` })).toBeNull();
    expect(screen.getByRole('button', { name: `事件 ${MATE_WEEKS[20]}–${MATE_WEEKS[22]} D` })).toBeTruthy();
    const dotB = eventDots(document.body as HTMLElement, '#0070f3')[0];
    expect(Number(dotB.getAttribute('y'))).toBe(10);
    fireEvent.click(screen.getByRole('button', { name: '查看其余 1 个重叠事件' }));
    expect(onOverflowEvents).toHaveBeenCalledWith(['c']);
  });

  it('时段事件（覆写为 W23–W26）= 起始周方块点；旧左右箭头-连线与轨上端点标签删除；点击 toggle 关闭', () => {
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
      <ReferenceVolumeChart
        product={MATE80} win={FULL} events={events} labelOf={labelOf} colorOf={promoAmberOf}
        selectedEventId="ev-m80-618" onSelectEvent={onSelectEvent}
      />,
    );
    const anchor = screen.getByRole('button', { name: `事件 ${MATE_WEEKS[22]}–${MATE_WEEKS[25]} 618 档期脉冲` });
    // 旧「选中时段端点标签」删除：起止周只出现在证据浮框（此处未展开浮框文本）
    expect(screen.queryByText(`${MATE_WEEKS[22]}–${MATE_WEEKS[25]}`)).toBeNull();
    // 点位 = 覆写后起始周 W23（下标 22）
    const dot = eventDots(container, '#f5a623')
      .find((rect) => Math.abs(Number(rect.getAttribute('x')) - (84 + COL_W * 22.5 - 4)) < 1 && Number(rect.getAttribute('y')) === 10);
    expect(dot).toBeTruthy();
    fireEvent.click(anchor);
    // 已选中态下点击 = 关闭详情（toggle 语义不变）
    expect(onSelectEvent).toHaveBeenCalledWith(null);
  });

  it('名录 hover（hoverEventId）→ 对应区间临时高亮（0.16）；移开恢复由父层控制', () => {
    const { rerender } = render(
      <ReferenceVolumeChart product={MATE80} win={[16, 31]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={promoAmberOf} hoverEventId="ev-m80-618" />,
    );
    const hoverRects = () => highlightRects(document.body as HTMLElement, '0.16');
    expect(hoverRects().length).toBe(1);
    expect(hoverRects()[0].getAttribute('fill')).toBe('#f5a623');
    rerender(
      <ReferenceVolumeChart product={MATE80} win={[16, 31]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={promoAmberOf} hoverEventId={null} />,
    );
    expect(hoverRects().length).toBe(0);
  });
});

describe('ReferenceVolumeChart · 图例可点切换显隐（#3）', () => {
  const colorOf = promoAmberOf;

  it('事件隐：顶部小标轨整层（事件点 / 档期点 / +N）与图内事件高亮一起消失；隐藏态 aria-pressed=false + opacity .45；再点恢复', () => {
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={colorOf} />,
    );
    // 先开常驻高亮（0.12 × 7 = 5 事件 + 2 档期），再隐藏事件图层
    fireEvent.click(screen.getByRole('switch', { name: '图内高亮：关' }));
    expect(highlightRects(container, '0.12').length).toBe(7);
    const eventLegend = within(legendOf()).getByRole('button', { name: '事件' });
    fireEvent.click(eventLegend);
    expect(eventLegend.getAttribute('aria-pressed')).toBe('false');
    expect(eventLegend.style.opacity).toBe('0.45');
    expect(highlightRects(container, '0.12').length).toBe(0);
    expect(highlightRects(container, '0.16').length).toBe(0);
    expect(screen.queryByRole('button', { name: `事件 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeNull();
    expect(screen.queryByRole('img', { name: /档期 618 档期/ })).toBeNull();
    // 再点恢复：轨道与高亮整层回归
    fireEvent.click(eventLegend);
    expect(eventLegend.getAttribute('aria-pressed')).toBe('true');
    expect(highlightRects(container, '0.12').length).toBe(7);
    expect(screen.getByRole('button', { name: `事件 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeTruthy();
  });

  it('价格隐：价格线与悬停价格点消失、右轴 $ 刻度保留（轴不随图层隐藏）；销量隐：量柱整层消失，价格线不受影响', () => {
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={colorOf} />,
    );
    const bars = () => Array.from(container.querySelectorAll('rect')).filter((rect) =>
      (rect.getAttribute('fill') ?? '').startsWith(HUAWEI_FILL)).length;
    const pricePaths = () => Array.from(overlayOf(container).querySelectorAll('path'))
      .filter((path) => path.getAttribute('stroke') === '#c7000b' && !path.getAttribute('stroke-dasharray')).length;
    const priceTicks = () => Array.from(container.querySelectorAll('text'))
      .filter((node) => (node.textContent ?? '').startsWith('$')).length;
    // 价格隐
    const priceLegend = within(legendOf()).getByRole('button', { name: '价格' });
    fireEvent.click(priceLegend);
    expect(priceLegend.getAttribute('aria-pressed')).toBe('false');
    expect(priceLegend.style.opacity).toBe('0.45');
    expect(pricePaths()).toBe(0);
    expect(bars()).toBe(52);
    expect(priceTicks()).toBe(3);
    // 价格恢复
    fireEvent.click(priceLegend);
    expect(pricePaths()).toBe(1);
    // 销量隐
    const volumeLegend = within(legendOf()).getByRole('button', { name: '销量' });
    fireEvent.click(volumeLegend);
    expect(volumeLegend.getAttribute('aria-pressed')).toBe('false');
    expect(volumeLegend.style.opacity).toBe('0.45');
    expect(bars()).toBe(0);
    expect(pricePaths()).toBe(1);
    // 销量恢复
    fireEvent.click(volumeLegend);
    expect(bars()).toBe(52);
  });
});

describe('ReferenceVolumeChart · 图内高亮开关三态', () => {
  const colorOf = promoAmberOf;

  it('默认关：图内无任何事件高亮（只有顶部事件点）', () => {
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={colorOf} />,
    );
    expect(screen.getByRole('switch', { name: '图内高亮：关' }).getAttribute('aria-checked')).toBe('false');
    expect(highlightRects(container, '0.12').length).toBe(0);
    expect(highlightRects(container, '0.16').length).toBe(0);
  });

  it('开：所有事件点（含档期）对应区间渲染各自颜色 0.12 底色；再点关恢复', () => {
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={colorOf} />,
    );
    // 窗内 5 个预标单周事件 + 2 个档期带 = 7 条高亮
    fireEvent.click(screen.getByRole('switch', { name: '图内高亮：关' }));
    expect(screen.getByRole('switch', { name: '图内高亮：开' }).getAttribute('aria-checked')).toBe('true');
    const rects = highlightRects(container, '0.12');
    expect(rects.length).toBe(7);
    expect(rects.filter((rect) => rect.getAttribute('fill') === '#f5a623').length).toBe(4); // 618 / 黑五事件 + 两条档期带
    expect((document.body.textContent ?? '')).toContain('图内高亮：开');
    fireEvent.click(screen.getByRole('switch', { name: '图内高亮：开' }));
    expect(screen.getByRole('switch', { name: '图内高亮：关' }).getAttribute('aria-checked')).toBe('false');
    expect(highlightRects(container, '0.12').length).toBe(0);
    expect((document.body.textContent ?? '')).toContain('图内高亮：关');
  });

  it('hover 任意事件点 → 对应区间临时高亮（0.16），不受开关影响；移开恢复', () => {
    const { container } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={colorOf} />,
    );
    // 开关关闭状态下 hover 618 事件点 → 临时高亮（pointerOver/Out 驱动
    // React 的 enter/leave 合成）
    const anchor = screen.getByRole('button', { name: `事件 ${MATE_WEEKS[22]} 618 档期脉冲` });
    fireEvent.pointerOver(anchor);
    expect(highlightRects(container, '0.16').length).toBe(1);
    expect(highlightRects(container, '0.16')[0].getAttribute('fill')).toBe('#f5a623');
    fireEvent.pointerOut(anchor);
    expect(highlightRects(container, '0.16').length).toBe(0);
    // 开关开启后 hover 仍在常驻层之上（临时高亮独立存在）
    fireEvent.click(screen.getByRole('switch', { name: '图内高亮：关' }));
    fireEvent.pointerOver(anchor);
    expect(highlightRects(container, '0.12').length).toBe(7);
    expect(highlightRects(container, '0.16').length).toBe(1);
    fireEvent.pointerOut(anchor);
    expect(highlightRects(container, '0.16').length).toBe(0);
    expect(highlightRects(container, '0.12').length).toBe(7);
  });
});

describe('ReferenceVolumeChart · 证据浮框（五项精简）', () => {
  it('选中事件 → 五项浮框：名称 + 起止周 / 幅度 / 衰减 / 说明（有才显示）/ 编辑；无读数行、无来源标注', () => {
    const events = presetEvents(MATE80, {
      [`${MATE80.id}::ev-m80-618`]: {
        id: `${MATE80.id}::ev-m80-618`, scopeKey: 's', productId: MATE80.id, sourceEventId: 'ev-m80-618',
        baseFingerprint: 'x', patch: { startWeek: 22, endWeek: 25, note: '平台补贴与档期降价叠加', impact: { magnitudePct: 42, durationWeeks: 4, decay: 'decreasing' } }, revision: 1,
        createdAt: 't', updatedAt: 't',
      },
    });
    render(
      <ReferenceVolumeChart
        product={MATE80} win={[16, 31]} events={events} labelOf={labelOf} colorOf={identity}
        selectedEventId="ev-m80-618" onSelectEvent={vi.fn()} onEditEvent={vi.fn()}
      />,
    );
    const detail = screen.getByRole('group', { name: `事件详情 ${MATE_WEEKS[22]}–${MATE_WEEKS[25]} 618 档期脉冲` });
    const text = detail.textContent ?? '';
    // 五项：名称 + 起止周（浮框头，日历周口径）/ 幅度 / 衰减 / 说明 / 编辑
    expect(text).toContain(`${MATE_WEEKS[22]}–${MATE_WEEKS[25]} · 618 档期脉冲`);
    expect(text).toContain('幅度');
    expect(text).toContain('+42%');
    expect(text).toContain('衰减');
    expect(text).toContain('递减');
    expect(text).toContain('平台补贴与档期降价叠加');
    expect(screen.getByRole('button', { name: `编辑事件 ${MATE_WEEKS[22]}–${MATE_WEEKS[25]} 618 档期脉冲` })).toBeTruthy();
    // 删除的读数行与来源标注不再出现
    expect(text).not.toContain('事件时段');
    expect(text).not.toContain('销量有效');
    expect(text).not.toContain('期内均周销');
    expect(text).not.toContain('较前');
    expect(text).not.toContain('前段');
    expect(text).not.toContain('价格 $');
    expect(text).not.toContain('计算');
    expect(text).not.toContain('预标参考');
    expect(text).not.toContain('预标 · 已改');
    expect(text).not.toContain('预标');
    expect(text).not.toContain('草稿');
    expect(text).not.toContain('源已更新');
    // 关闭按钮
    fireEvent.click(screen.getByRole('button', { name: '关闭事件详情' }));
  });

  it('fixture 预标事件：幅度 +42%、衰减 未标（decay 缺省）；说明缺省不显示', () => {
    render(
      <ReferenceVolumeChart
        product={MATE80} win={[16, 31]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity}
        selectedEventId="ev-m80-618" onSelectEvent={vi.fn()} onEditEvent={vi.fn()}
      />,
    );
    const detail = screen.getByRole('group', { name: `事件详情 ${MATE_WEEKS[22]} 618 档期脉冲` });
    const text = detail.textContent ?? '';
    expect(text).toContain(`${MATE_WEEKS[22]} · 618 档期脉冲`);
    expect(text).toContain('+42%');
    expect(text).toContain('未标');
    expect(text).not.toContain('平台补贴');
    expect(screen.getByRole('button', { name: `编辑事件 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeTruthy();
  });

  it('无参考读数的补录事件：幅度 —、衰减 未标', () => {
    const composed: EffectiveReferenceEvent[] = [
      { id: 'ce-noimpact', productId: MATE80.id, source: 'composed', typeId: 'other', startWeek: 22, endWeek: 22, label: '本地记录', note: '', impact: null, overridden: false, revision: 1, createdAt: 't', updatedAt: 't' },
    ];
    render(
      <ReferenceVolumeChart
        product={MATE80} win={[16, 31]} events={composed} labelOf={labelOf} colorOf={identity}
        selectedEventId="ce-noimpact" onSelectEvent={vi.fn()} onEditEvent={vi.fn()}
      />,
    );
    const detail = screen.getByRole('group', { name: `事件详情 ${MATE_WEEKS[22]} 本地记录` });
    const text = detail.textContent ?? '';
    expect(text).toContain('—');
    expect(text).toContain('未标');
  });

  it('全缺时段：五项浮框照常渲染（幅度 — / 衰减 未标），不再有「无法计算」读数行', () => {
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
    const detail = screen.getByRole('group', { name: `事件详情 ${MATE_WEEKS[22]} 618 档期脉冲` });
    expect((detail.textContent ?? '')).toContain('幅度');
    expect((detail.textContent ?? '')).not.toContain('无法计算');
    expect((detail.textContent ?? '')).not.toContain('销量有效');
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
    expect(screen.getByText(`区间 ${MATE_WEEKS[10]}–${MATE_WEEKS[17]} · 8 周`)).toBeTruthy();
    // 价：首端（下标 10）= 899（调价前），末端（下标 17）= 849（下标 16 起阶梯调价后）——端点周显式标注（日历周口径）
    expect(screen.getByText(`价 $899（${MATE_WEEKS[10]}）→ $849（${MATE_WEEKS[17]}） −5.6%`)).toBeTruthy();
    expect(screen.getByText(new RegExp(`^量 .+（${MATE_WEEKS[10]}）→ .+（${MATE_WEEKS[17]}）`))).toBeTruthy();
    fireEvent.click(screen.getByLabelText('清除所选区间'));
    expect(screen.queryByText(new RegExp(`^区间 ${MATE_WEEKS[10]}`))).toBeNull();
  });

  it('窗口变化 → 选区失义自动清除', () => {
    const { container, rerender } = render(
      <ReferenceVolumeChart product={MATE80} win={FULL} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />,
    );
    const shield = shieldOf(container);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(10), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(12), clientY: 60 });
    expect(screen.getByText(new RegExp(`^区间 ${MATE_WEEKS[10]}`))).toBeTruthy();
    rerender(<ReferenceVolumeChart product={MATE80} win={[24, 39]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} />);
    expect(screen.queryByText(/^区间 /)).toBeNull();
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
    expect(screen.getByText(`已选 ${MATE_WEEKS[10]}–${MATE_WEEKS[13]} · 4 周`)).toBeTruthy();
    expect(screen.queryByText(/^区间 /)).toBeNull();
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXInWindow(2, 16), clientY: 60 });
    expect(onSelectRange).toHaveBeenCalledWith(10, 13);
    expect(screen.queryByText(/^已选 /)).toBeNull();
    // 单击等价起止同周
    fireEvent.pointerDown(shield, { pointerId: 8, clientX: clientXInWindow(3, 16), clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 8, clientX: clientXInWindow(3, 16), clientY: 60 });
    expect(onSelectRange).toHaveBeenLastCalledWith(11, 11);
    // 图 aria 名提示拖选模式
    expect((overlayOf(container).getAttribute('aria-label') ?? '')).toContain('拖选事件时段模式');
    // 拖选模式下事件点不抢指针（role button 移除）
    expect(screen.queryByRole('button', { name: `事件 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeNull();
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
    expect(screen.getByText(new RegExp(`^区间 ${MATE_WEEKS[2]}`))).toBeTruthy();
    rerender(
      <ReferenceVolumeChart product={MATE80} win={[16, 31]} events={presetEvents(MATE80)} labelOf={labelOf} colorOf={identity} focusWeek={22} focusKey={1} />,
    );
    expect(screen.queryByText(new RegExp(`^区间 ${MATE_WEEKS[2]}`))).toBeNull();
    const hoverLine = Array.from(container.querySelectorAll('svg line'))
      .find((line) => line.getAttribute('stroke') === '#a1a1a1' && line.getAttribute('stroke-opacity') === '0.6');
    expect(hoverLine).toBeTruthy();
    expect(Number(hoverLine?.getAttribute('x1'))).toBeCloseTo(84 + (PLOT_WIDTH / 16) * 6.5, 0);
  });

  it('缺采周：柱不画（50 根）、价格实线断开 + 灰虚桥接、注记「缺数 2025W07、2025W08 · 不计 0」（日历周口径）', () => {
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
    expect(screen.getByText(`缺数 ${MATE_WEEKS[5]}、${MATE_WEEKS[6]} · 不计 0`)).toBeTruthy();
  });

  it('空数据：空态「暂无可参照历史」，不崩溃', () => {
    const empty: LifecycleProductSeed = { ...MATE80, id: 'lc-empty', points: [], pricePoints: [], events: [] };
    render(
      <ReferenceVolumeChart product={empty} win={[0, 7]} events={[]} labelOf={labelOf} colorOf={identity} />,
    );
    expect(screen.getByText('暂无可参照历史')).toBeTruthy();
  });
});
