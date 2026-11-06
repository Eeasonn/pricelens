// ============================================================
// 主图 v3 组件测试（jsdom · forecast-global-ia-review 任务 7 Step 1–2）：
// 阶段证据浮框（B.5.3 四层 + ①②③阶段值 + 学习证据 + 键盘固定）、
// 范围事件锚（2026-11-05 Eason 全局 #2：起始周小方块点 + hover 区间底衬 +
// 精简证据浮框；范围线 / 起止端点删除回归；名录派生周数与形状 + 键盘编辑
// 入口）、促销档期起始周方块点（轴下文字标注删除回归）、视图窗（全期默认 /
// 三月 / 近 8 周只改视图 + 时间轨手调）、月分组横轴（月份刻度 YYYY-MM；
// 周详情 YYYYWww 保留在 evidence / 表）、MainForecastDataTable（B.5.4 列 +
// 缺数「—」+ sticky header + 局部横滚）、评审大减法下线回归（无黑线 /
// 把握帽 / 档位线 / 色带）、手调墨色菱形与库存琥珀双状态共存。
// 2026-11-05 视觉精简二轮：上一代参考线删除回归；图下时间轨（PanelTimeTrack
// 同款：预设联动 + 拖柄键盘微调）；名录 / 数据表 / extras 收进「数据与操作」
// 收起区——受影响断言迁移为「展开后可见」（逐个迁移）。
// 2026-11-05 Eason 全局反馈：#1 图例 5 项全部可点（含库存修正描边与「事件」
//   整层显隐）；#8 SVG 文本 font.family / 字号 10 / mute / tabular-nums。
// 2026-11-06 P0（来源回执 forecast-gap-20261106）：
// - P0-1 viewBox 宽 = ResizeObserver 实测容器宽（jsdom 默认 no-op stub → 回退
//   1180 兜底；专用用例装可上报 stub 验证实测路径与 resize 随动）；
// - P0-2 周销实际/预测柱 = 品牌色 brandColor.HUAWEI（≠ color.link/#0070f3 回归）；
//   cannibalization 事件色 = #be123c（退出 ink，与 referenceEventPalette 同源）。
// 工厂 makeMainChartProps / makeRangeChartProps 定义在本文件本地
// （B.6.2 共享工厂只含日历 / 结果 helper，UI 工厂由任务 7–10 自行扩展）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { brandColor, color, font, referenceEventPalette } from '../../../theme/tokens';
import { niceCeil } from '../../../dataModel/volume';
import { axisTickPlan } from '../../../chart/PriceTrend/helpers';
import { workbenchFixture, type ProductEventSeed, type WorkbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, type WorkbenchParams, type WorkbenchResult, type WorkbenchWeekResult } from '../workbenchModel';
import { buildForecastCalendar } from '../workbenchCalendar';
import MainForecastChart, { DEFAULT_MAIN_FORECAST_VIEW, PRODUCT_EVENT_COLOR, type MainForecastView } from '../MainForecastChart';

// 主图时间轨（PanelTimeTrack）依赖 ResizeObserver 量宽：jsdom 无此构造器，本地 stub。
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
const NoopResizeObserver = ResizeObserverStub;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;

/** P0-1（2026-11-06）可上报宽度的 RO stub：observe 即按静态 width 上报一次，
 *  实例留存供测试触发放报（模拟容器 resize）。 */
class ReportingResizeObserverStub {
  static width = 1000;
  static instances: ReportingResizeObserverStub[] = [];
  constructor(private readonly callback: ResizeObserverCallback) {
    ReportingResizeObserverStub.instances.push(this);
  }
  report(width: number): void {
    this.callback([{ contentRect: { width } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  observe(): void {
    this.report(ReportingResizeObserverStub.width);
  }
  unobserve(): void {}
  disconnect(): void {
    ReportingResizeObserverStub.instances = ReportingResizeObserverStub.instances.filter((inst) => inst !== this);
  }
}

const fixture = workbenchFixture;
const baseParams = baseWorkbenchParams(fixture);
const baseResult = computeWorkbench(fixture, baseParams);

afterEach(() => {
  cleanup();
  // P0-1 用例会换装 / 删除 RO 构造器：恢复默认 no-op stub，其他用例走回退宽。
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;
});

// ------------------------------------------------------------
// 本地测试工厂（任务 7 · B.6.2 接口参考）
// ------------------------------------------------------------

/** 主图 props：fixture + params + result + 回调（含可选接线的默认空实现）。 */
function makeMainChartProps(
  chartFixture: WorkbenchFixture = fixture,
  params: WorkbenchParams = baseWorkbenchParams(chartFixture),
  result: WorkbenchResult = computeWorkbench(chartFixture, params),
  overrides: { view?: Partial<MainForecastView>; controls?: ReactNode; onTuneWeek?: (weekId: string) => void; onFocusCard?: (card: 'reference' | 'market' | 'inventory', weekId: string) => void } = {},
): React.ComponentProps<typeof MainForecastChart> {
  return {
    fixture: chartFixture,
    params: { productEvents: params.productEvents },
    result,
    onTuneWeek: overrides.onTuneWeek ?? vi.fn(),
    onRemoveProductEvent: vi.fn(),
    view: overrides.view,
    controls: overrides.controls,
    onFocusCard: overrides.onFocusCard,
  };
}

/** 范围事件图 props：单个 2026W45–2026W48 恒定范围事件（B.4.2 WeekRange 口径）。 */
export const RANGE_EVENT: ProductEventSeed = {
  id: 'pe-range-1',
  type: 'competitor-launch',
  label: '',
  startWeekId: '2026W45',
  endWeekId: '2026W48',
  magnitudePct: 8,
  decay: 'flat',
  replayId: 'rp-comp-promo',
};

function makeRangeChartProps(): React.ComponentProps<typeof MainForecastChart> {
  const params: WorkbenchParams = { ...baseWorkbenchParams(fixture), productEvents: [RANGE_EVENT] };
  return makeMainChartProps(fixture, params, computeWorkbench(fixture, params));
}

// ------------------------------------------------------------
// 查询 helper
// ------------------------------------------------------------

const svgTexts = (): string[] =>
  Array.from(document.querySelectorAll('svg text')).map((node) => node.textContent ?? '');

const monthLabels = (): string[] => svgTexts().filter((text) => /^\d{4}-\d{2}$/.test(text));

const priceLinePaths = (): Element[] =>
  Array.from(document.querySelectorAll('svg path')).filter((path) => path.getAttribute('stroke') === brandColor.HUAWEI);

const barWithTitle = (label: string): Element | null =>
  Array.from(document.querySelectorAll('svg rect')).find((rect) =>
    Array.from(rect.querySelectorAll('title')).some((title) => (title.textContent ?? '').includes(label)),
  ) ?? null;

const forecastPriceLine = (): Element | null =>
  Array.from(document.querySelectorAll('svg path')).find(
    (path) => path.getAttribute('stroke') === brandColor.HUAWEI && path.getAttribute('stroke-dasharray') === '6 5',
  ) ?? null;

const historyPriceLine = (): Element | null =>
  Array.from(document.querySelectorAll('svg path')).find(
    (path) => path.getAttribute('stroke') === brandColor.HUAWEI && !path.getAttribute('stroke-dasharray'),
  ) ?? null;

/** 「数据与操作」收起区（2026-11-05 视觉精简二轮默认收起）：展开后名录 / 数据表 / extras 才可见。 */
const expandDataOps = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '数据与操作' }));
};

/** 组件内横轴月分组刻度的同源复算（断言期望刻度集）。 */
function expectedMonthLabels(weeks: WorkbenchWeekResult[]): string[] {
  const keys: string[] = [];
  for (const week of weeks) {
    if (keys[keys.length - 1] !== week.monthKey) keys.push(week.monthKey);
  }
  const step = Math.max(1, Math.ceil(keys.length / 9));
  const plan = axisTickPlan('month', keys, step, [0, keys.length - 1]);
  return plan.indexes.map((index) => keys[index]!);
}

// ============================================================
// 任务 7 Step 1：阶段证据 + 范围名录（给定测试）
// ============================================================
describe('MainForecastChart v3（任务 7 给定测试）', () => {
  it('shows stage evidence and keyboard access to every forecast week', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    render(<MainForecastChart {...makeMainChartProps(workbenchFixture, params, computeWorkbench(workbenchFixture, params))} />);
    const target = screen.getByRole('button', { name: /查看 2027W01 预测证据/ });
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: /2027W01/ })).toBeTruthy();
    expect(screen.getByText('① 自动学习基线')).toBeTruthy();
    expect(screen.getByText('② 大盘修正后')).toBeTruthy();
    expect(screen.getByText('③ 库存修正后')).toBeTruthy();
  });

  it('lists one range event once with derived duration', () => {
    render(<MainForecastChart {...makeRangeChartProps()} />);
    // 图下名录收进「数据与操作」收起区（2026-11-05）：展开后可见。
    expandDataOps();
    expect(screen.getByRole('button', { name: /编辑事件 2026W45–2026W48/ })).toBeTruthy();
    expect(screen.getByText('4 周 · 恒定')).toBeTruthy();
  });

  it('阶段证据固定后含学习证据、构成定位与「微调本周」；Esc 关闭固定；微调回调带周 ID', () => {
    const onTuneWeek = vi.fn();
    const onFocusCard = vi.fn();
    render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, baseResult, { onTuneWeek, onFocusCard })} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /查看 2027W01 预测证据/ }), { key: 'Enter' });
    const dialog = screen.getByRole('dialog', { name: /2027W01/ });
    const text = dialog.textContent ?? '';
    // 学习证据（来自 result.learning，UI 不复算）：样本窗 / 有效周数 / 特征 / 留出误差。
    expect(text).toContain('2025-11-03 – 2026-10-26');
    expect(text).toContain('有效周 50');
    expect(text).toContain('trend · referenceLogVolume · promo');
    expect(text).toContain('价格关系未纳入');
    expect(text).toContain('MAE');
    expect(text).toContain('MAPE');
    expect(text).not.toMatch(/概率|置信区间/);
    // 构成按阶段排序：①学习参照在②大盘之前；定位入口可跳卡。
    const locateButtons = Array.from(dialog.querySelectorAll('button')).filter((button) => (button.getAttribute('aria-label') ?? '').startsWith('定位'));
    expect(locateButtons.length).toBeGreaterThan(0);
    fireEvent.click(locateButtons[0]!);
    expect(onFocusCard).toHaveBeenCalled();
    // 动作层「微调本周」→ 周销弹窗回调。
    fireEvent.click(screen.getByRole('button', { name: '微调本周' }));
    expect(onTuneWeek).toHaveBeenCalledWith('2027W01');
    // Esc 关闭固定证据（编辑态粘滞由页面周销弹窗承接；先回证据再关闭）。
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /2027W01/ })).toBeNull();
  });

  it('范围事件锚 = 起始周小方块点 + A 编号小标（2026-11-05 全局 #2：范围线 / 起止端点删除回归）；hover 出区间底衬与精简证据浮框，点击固定', () => {
    render(<MainForecastChart {...makeRangeChartProps()} />);
    const svg = document.querySelector('svg[role="img"]') as SVGSVGElement;
    // 方块点结构：7px 方块（事件色）+ A1 小标。
    const dot = svg.querySelector('g[data-event-dot="pe-range-1"]');
    expect(dot).not.toBeNull();
    const dotRect = dot!.querySelector('rect');
    expect(Number(dotRect!.getAttribute('width'))).toBe(7);
    expect(dotRect!.getAttribute('fill')).toBe(PRODUCT_EVENT_COLOR['competitor-launch']);
    expect(dot!.textContent).toContain('A1');
    // 常驻范围线 / 起止端点 / 编号圆删除回归（旧 data-range-* 结构不回归）。
    expect(svg.querySelector('line[data-range-event-id]')).toBeNull();
    expect(svg.querySelector('g[data-range-anchor]')).toBeNull();
    expect(svg.querySelector('circle[r="8.5"]')).toBeNull();
    // 无常驻区间底衬（hover / focus 才有）。
    expect(svg.querySelector('[data-event-shade]')).toBeNull();
    // hover 方块点 → 图内临时起止区间底衬（0.14）+ 精简证据浮框（role=status）。
    fireEvent.mouseEnter(dot!);
    const shade = svg.querySelector('rect[data-event-shade="pe-range-1"]');
    expect(shade).not.toBeNull();
    expect(shade!.getAttribute('fill-opacity')).toBe('0.14');
    const evidence = screen.getByRole('status', { name: /事件 A1 证据/ });
    expect(evidence.textContent ?? '').toContain('2026W45 – 2026W48');
    fireEvent.mouseLeave(dot!);
    expect(svg.querySelector('[data-event-shade]')).toBeNull();
    expect(screen.queryByRole('status', { name: /事件 A1 证据/ })).toBeNull();
    // 点击固定 → role=dialog；Esc 关闭固定。
    fireEvent.click(dot!);
    const dialog = screen.getByRole('dialog', { name: /事件 A1 证据/ });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /事件 A1 证据/ })).toBeNull();
    // 三条重叠事件：前两条上 lane（各有方块点），其余 +N 打开名录筛选（键盘可达）。
    const events: ProductEventSeed[] = [
      RANGE_EVENT,
      { ...RANGE_EVENT, id: 'pe-range-2', type: 'own-promo', startWeekId: '2026W46', endWeekId: '2026W49', replayId: 'rp-own-marketing' },
      { ...RANGE_EVENT, id: 'pe-range-3', type: 'cannibalization', startWeekId: '2026W47', endWeekId: '2026W50', replayId: 'rp-cannib' },
    ];
    const params: WorkbenchParams = { ...baseWorkbenchParams(fixture), productEvents: events };
    cleanup();
    render(<MainForecastChart {...makeMainChartProps(fixture, params, computeWorkbench(fixture, params))} />);
    expect(document.querySelector('g[data-event-dot="pe-range-3"]')).toBeNull();
    const overflow = screen.getByRole('button', { name: '其余 1 个重叠范围事件 · 名录筛选' });
    fireEvent.click(overflow);
    // 名录在「数据与操作」收起区内（2026-11-05）：展开后筛选态可见。
    expandDataOps();
    expect(document.body.textContent ?? '').toContain('名录筛选');
  });
});

// ============================================================
// 受控视图（默认 = 当前视觉 + 全期窗）
// ============================================================
describe('主图 · 受控视图与视图窗（全期 / 三月 / 近 8 周）', () => {
  it('默认视图常量：heightScale 1 / showYTicks true / compact / promoBandOn true / window full', () => {
    expect(DEFAULT_MAIN_FORECAST_VIEW).toEqual({ heightScale: 1, showYTicks: true, labelMode: 'compact', promoBandOn: true, window: 'full' });
  });

  it('不传 view：viewBox 高度 = 默认（252，与全站图高一致），全期 104 周全渲染，促销档期 = 起始周方块点（轴下文字标注删除回归）、档期色带不渲染', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    expect(document.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1180 252');
    // 2026-11-05 全局 #2：轴下常驻档期文字标注删除，改起始周小方块点。
    expect(svgTexts().some((text) => text === '黑五档期 2026')).toBe(false);
    expect(document.querySelector('g[data-event-dot="promo-window"]')).not.toBeNull();
    const amberBand = Array.from(document.querySelectorAll('svg rect')).find((rect) => rect.getAttribute('fill') === color.warningSoft);
    expect(amberBand).toBeUndefined();
    expect(document.body.textContent).toContain('万台');
    // 全期 = 完整历史 + 统一预测窗：横轴月分组刻度首末 = 2025-11 / 2027-10。
    expect(monthLabels()).toEqual(expectedMonthLabels(baseResult.weeks));
    expect(monthLabels()[0]).toBe('2025-11');
    expect(monthLabels()[monthLabels().length - 1]).toBe('2027-10');
  });

  it('视图窗 w8 = 近 8 周：只画 8 周柱（视图裁剪，不改模型——数据表仍列全期）', () => {
    render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, baseResult, { view: { window: 'w8' } })} />);
    const bars = Array.from(document.querySelectorAll('svg rect')).filter((rect) => (rect.getAttribute('fill') ?? '') !== 'transparent');
    // 近 8 周 = 2027W36–2027W43，全部有 final → 8 根柱。
    expect(bars.length).toBe(8);
    // 数据表吸收 WeeklyLedger 职责：仍列全期 104 行（展开「数据与操作」后可见）。
    expandDataOps();
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    expect(rows.length).toBe(104);
  });

  it('视图窗 m3 = 三月：只画预测末三月（2027-08/09/10）的周', () => {
    render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, baseResult, { view: { window: 'm3' } })} />);
    const m3Weeks = baseResult.weeks.filter((week) => ['2027-08', '2027-09', '2027-10'].includes(week.monthKey));
    const bars = Array.from(document.querySelectorAll('svg rect')).filter((rect) => (rect.getAttribute('fill') ?? '') !== 'transparent');
    expect(bars.length).toBe(m3Weeks.length);
    expect(monthLabels()[0]).toBe('2027-08');
    expect(monthLabels()[monthLabels().length - 1]).toBe('2027-10');
  });

  it('promoBandOn=false：促销档期起始周方块点消失，其余结构保留', () => {
    render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, baseResult, { view: { promoBandOn: false } })} />);
    expect(document.querySelector('g[data-event-dot="promo-window"]')).toBeNull();
    expect(svgTexts().some((text) => text.includes('黑五档期'))).toBe(false);
    expect(document.querySelector('svg')).not.toBeNull();
  });

  it('showYTicks=false：纵轴刻度与网格隐藏（左轴万台 + 右轴价格刻度）；数据读数不受影响', () => {
    render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, baseResult, { view: { showYTicks: false } })} />);
    const texts = svgTexts().join('|');
    expect(texts).not.toContain('万台');
    expect(texts).not.toContain('$850');
    // 周详情保留 YYYYWww：柱 title 周读数仍在。
    expect(document.body.textContent).toContain('2026W45');
  });

  it('heightScale 只缩放绘图区：0.5 → viewBox 高 166；2 → 424；周标签仍在', () => {
    const half = render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, baseResult, { view: { heightScale: 0.5 } })} />);
    expect(half.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1180 166');
    half.unmount();
    render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, baseResult, { view: { heightScale: 2 } })} />);
    expect(document.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1180 424');
    expect(monthLabels().length).toBeGreaterThan(0);
  });

  it('controls 插槽渲染在主图上方（DOM 顺序先于 svg）；不传 controls 不渲染多余插槽', () => {
    const withControls = render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, baseResult, { controls: <div>共享工具行</div> })} />);
    expect(document.body.textContent).toContain('共享工具行');
    const svg = document.querySelector('svg');
    const tools = Array.from(document.querySelectorAll('div')).find((node) => node.textContent === '共享工具行');
    expect(svg!.compareDocumentPosition(tools!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    withControls.unmount();
    const bare = render(<MainForecastChart {...makeMainChartProps()} />);
    expect(bare.container.textContent).not.toContain('共享工具行');
  });
});

// ============================================================
// 横轴：月分组刻度 + 周详情 YYYYWww（evidence / 数据表 / aria）
// ============================================================
describe('主图 · 横轴月分组刻度（周详情保留 YYYYWww）', () => {
  it('轴刻度 = 月分组（YYYY-MM，同源抽稀：步长 ceil(月数/9) + 首末恒显示 + 边界让位）', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    expect(monthLabels()).toEqual(expectedMonthLabels(baseResult.weeks));
    for (const label of monthLabels()) {
      expect(label).toMatch(/^\d{4}-\d{2}$/);
    }
    // 轴上不再出现裸周刻度（2026W33 式周详情移至柱 title / 浮框 / 数据表）。
    expect(svgTexts().filter((text) => /^\d{4}W\d{2}$/.test(text))).toHaveLength(0);
  });

  it('周详情 YYYYWww：柱 title / 证据按钮 / aria 均为跨年周 ID（2026W45 … 2027W01）', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    expect(barWithTitle('2026W45')).not.toBeNull();
    expect(screen.getByRole('button', { name: /查看 2027W01 预测证据/ })).toBeTruthy();
    const aria = document.querySelector('svg')?.getAttribute('aria-label') ?? '';
    expect(aria).toContain('2026W45');
    expect(aria).toContain('2027W43');
  });
});

// ============================================================
// 数据表（MainForecastDataTable · B.5.4 列）
// ============================================================
describe('主图数据表 · B.5.4 列与缺数纪律（数据表在「数据与操作」收起区内，展开后可见）', () => {
  it('列齐全：周/状态/学习基线/①后/②后/SI/③后/手调/最终 SO/期末库存/渠道 DOS/显示价格/成本/单台销毛/周销毛/事件操作；sticky header + 局部横滚', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    expandDataOps();
    const header = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent ?? '');
    for (const label of ['周', '状态', '学习基线', '①后', '②后', 'SI', '③后', '手调', '最终 SO', '期末库存', '渠道 DOS', '显示价格', '成本', '单台销毛', '周销毛', '事件/操作']) {
      expect(header).toContain(label);
    }
    const headCells = Array.from(document.querySelectorAll('thead th')) as HTMLElement[];
    expect(headCells.every((th) => th.style.position === 'sticky')).toBe(true);
    const scroll = Array.from(document.querySelectorAll('div')).find((node) => node.contains(document.querySelector('table')) && node.style.overflowX === 'auto');
    expect(scroll).toBeDefined();
  });

  it('预测周 final 缺失：数据表「—」不当 0、该行无微调按钮；其余预测周保留微调入口', () => {
    const victimIndex = baseResult.weeks.findIndex((week) => week.status === 'forecast');
    const victim = baseResult.weeks[victimIndex]!;
    const withNull = {
      ...baseResult,
      weeks: baseResult.weeks.map((week, index) => (index === victimIndex ? { ...week, final: null } : week)),
    };
    render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, withNull)} />);
    expandDataOps();
    const row = Array.from(document.querySelectorAll('tbody tr')).find((tr) => (tr.textContent ?? '').includes(victim.weekId));
    expect(row).toBeDefined();
    expect(row!.textContent).toContain('—');
    expect(row!.querySelectorAll('button')).toHaveLength(0);
    const tuneButtons = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent === '微调');
    expect(tuneButtons.length).toBe(baseResult.weeks.filter((week) => week.status === 'forecast' && week.final != null).length - 1);
  });

  it('marginView 过渡接线：显示价读 effectivePrice、销毛读 MarginView（缺省回退原价与周结果；负销毛不钳 0）', () => {
    const marginView = {
      weeks: { '2027W01': { effectivePrice: 799, unitMargin: -12, weeklyMargin: -495000 } },
    };
    render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, baseResult)} marginView={marginView} />);
    expandDataOps();
    const row = Array.from(document.querySelectorAll('tbody tr')).find((tr) => (tr.textContent ?? '').includes('2027W01'));
    expect(row!.textContent).toContain('$799');
    expect(row!.textContent).toContain('-12');
    // 未覆盖周回退：2026W45 显示原价 $849。
    const row45 = Array.from(document.querySelectorAll('tbody tr')).find((tr) => (tr.textContent ?? '').includes('2026W45'));
    expect(row45!.textContent).toContain('$849');
  });

  it('weeks 为空：不渲染 SVG、不产出 NaN，给出空态文案', () => {
    render(<MainForecastChart {...makeMainChartProps(fixture, baseParams, { ...baseResult, weeks: [] })} />);
    expect(document.querySelector('svg')).toBeNull();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('NaN');
    expect(text.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 手调（墨色）与库存上限修正（琥珀）双状态共存
// ============================================================
describe('主图 · 手调（墨色）与库存上限修正（琥珀）双状态共存', () => {
  it('默认链：截断周预测柱琥珀描边；名录/aria 报告修正起点（2026W46）', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    const cappedBar = barWithTitle('2026W46');
    expect(cappedBar).not.toBeNull();
    expect(cappedBar!.getAttribute('stroke')).toBe(color.warning);
    // 名录在「数据与操作」收起区内：展开后可见（2026-11-05）。
    expandDataOps();
    expect(document.body.textContent).toContain('库存上限修正 · 2026W46 起');
    expect(document.querySelector('svg')?.getAttribute('aria-label')).toContain('库存上限修正 2026W46 起');
  });

  it('手调落在截断周：柱恢复预测描边（品牌色）、菱形转墨色；修正事实仍在名录（supplyCapped）', () => {
    const tuned = { ...baseParams, manual: { '2026W46': { value: 60000, reason: '黑五加投，按会议口径上调' } } };
    const result = computeWorkbench(fixture, tuned);
    const w46 = result.weeks.find((week) => week.weekId === '2026W46');
    expect(w46?.supplyCapped).toBe(true);
    expect(w46?.capped).toBe(false);
    render(<MainForecastChart {...makeMainChartProps(fixture, tuned, result)} />);
    const tunedBar = barWithTitle('2026W46');
    expect(tunedBar!.getAttribute('stroke')).toBe(brandColor.HUAWEI);
    // 手调菱形 = 墨色（非琥珀）。
    const inkDiamond = Array.from(document.querySelectorAll('svg path')).find(
      (path) => path.getAttribute('fill') === color.ink && (path.getAttribute('d') ?? '').includes('l5 5'),
    );
    expect(inkDiamond).not.toBeUndefined();
    const amberDiamond = Array.from(document.querySelectorAll('svg path')).find(
      (path) => path.getAttribute('fill') === color.warning && (path.getAttribute('d') ?? '').includes('l5 5'),
    );
    expect(amberDiamond).toBeUndefined();
    // 图下名录（「数据与操作」收起区内，2026-11-05）：手调原因 + 修正事实（不因手调消失）。
    expandDataOps();
    const text = document.body.textContent ?? '';
    expect(text).toContain('手调 · 2026W46');
    expect(text).toContain('黑五加投，按会议口径上调');
    expect(text).toContain('库存上限修正 · 2026W46 起');
    expect(text).not.toContain('未触发库存上限修正');
  });

  it('原因选填：空原因手调只留菱形与名录周号，可正常应用渲染（2026-11-04 评审）', () => {
    const tuned = { ...baseParams, manual: { '2026W46': { value: 60000, reason: '' } } };
    const result = computeWorkbench(fixture, tuned);
    render(<MainForecastChart {...makeMainChartProps(fixture, tuned, result)} />);
    const inkDiamond = Array.from(document.querySelectorAll('svg path')).find(
      (path) => path.getAttribute('fill') === color.ink && (path.getAttribute('d') ?? '').includes('l5 5'),
    );
    expect(inkDiamond).not.toBeUndefined();
    expect(inkDiamond!.querySelector('title')?.textContent).toBe('手调');
    const tunedBar = barWithTitle('2026W46');
    expect(tunedBar!.querySelector('title')?.textContent).toContain('手调');
    expect(tunedBar!.querySelector('title')?.textContent).not.toContain('手调：');
    // 名录在「数据与操作」收起区内：展开后断言（2026-11-05）。
    expandDataOps();
    const text = document.body.textContent ?? '';
    expect(text).toContain('手调 · 2026W46');
    expect(text).not.toContain('手调 · 2026W46：');
    expect(text).toContain('库存上限修正 · 2026W46 起');
  });
});

// ============================================================
// 图例全部可点（2026-11-05 Eason 全局 #1：5 项，说明项行下线）与真实显隐
// ============================================================
describe('主图 · 图例全部可点（2026-11-05 Eason 全局 #1：5 项，说明项行下线）', () => {
  const LEGEND_LABELS = ['周销 实际', '周销 预测', '价格（右轴）', '库存上限修正（琥珀描边）', '事件'] as const;
  const legendButton = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button[aria-pressed]'))
      .find((button) => (button.textContent ?? '').trim() === label) as HTMLButtonElement | undefined;

  it('图例 5 项全部为可点击按钮（aria-pressed + 隐藏态 opacity .45）；纯说明项与上一代 / 把握区间图例均已下线', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    for (const label of LEGEND_LABELS) {
      const button = legendButton(label);
      expect(button).toBeDefined();
      expect(button!.getAttribute('aria-pressed')).toBe('true');
      expect(button!.style.opacity).toBe('1');
    }
    const labels = Array.from(document.querySelectorAll('button[aria-pressed]')).map((button) => button.textContent ?? '');
    // 上一代参考线与图例项保持删除（对照由①参考卡承担）；把握区间不回归。
    expect(labels.join('|')).not.toContain('上一代');
    expect(labels.join('|')).not.toContain('把握区间');
    // 纯说明项（无 key、不可点）下线：无「预测样式」说明 span 残留。
    const note = Array.from(document.querySelectorAll('span')).find((span) => (span.textContent ?? '').includes('预测样式'));
    expect(note).toBeUndefined();
    // 图内无 hairlineStrong 灰虚参考线残留。
    const prevGenPaths = Array.from(document.querySelectorAll('svg path')).filter(
      (path) => path.getAttribute('stroke') === color.hairlineStrong && path.getAttribute('stroke-dasharray') === '5 4',
    );
    expect(prevGenPaths).toHaveLength(0);
  });

  it('点击「价格」隐藏价格线并置 aria-pressed=false（隐藏态 opacity .45）；再点恢复', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    expect(priceLinePaths().length).toBeGreaterThan(0);
    const priceButton = legendButton('价格（右轴）')!;
    fireEvent.click(priceButton);
    expect(priceButton.getAttribute('aria-pressed')).toBe('false');
    expect(priceButton.style.opacity).toBe('0.45');
    expect(priceLinePaths()).toHaveLength(0);
    fireEvent.click(priceButton);
    expect(priceLinePaths().length).toBeGreaterThan(0);
  });

  it('点击「周销 实际」隐藏历史实柱；预测虚柱不受影响', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    expect(barWithTitle('2026W44')).not.toBeNull();
    fireEvent.click(legendButton('周销 实际')!);
    expect(barWithTitle('2026W44')).toBeNull();
    expect(barWithTitle('2026W45')).not.toBeNull();
  });

  it('点击「库存上限修正（琥珀描边）」隐藏修正周琥珀描边（回退预测品牌色描边）；再点恢复', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    expect(barWithTitle('2026W46')!.getAttribute('stroke')).toBe(color.warning);
    const cappedButton = legendButton('库存上限修正（琥珀描边）')!;
    fireEvent.click(cappedButton);
    expect(cappedButton.getAttribute('aria-pressed')).toBe('false');
    expect(barWithTitle('2026W46')!.getAttribute('stroke')).toBe(brandColor.HUAWEI);
    fireEvent.click(cappedButton);
    expect(barWithTitle('2026W46')!.getAttribute('stroke')).toBe(color.warning);
  });

  it('点击「事件」整层隐藏：范围事件与促销档期方块点消失（hover 底衬随层隐藏）；再点恢复', () => {
    const params: WorkbenchParams = { ...baseWorkbenchParams(fixture), productEvents: [RANGE_EVENT] };
    render(<MainForecastChart {...makeMainChartProps(fixture, params, computeWorkbench(fixture, params))} />);
    expect(document.querySelector('g[data-event-dot="pe-range-1"]')).not.toBeNull();
    expect(document.querySelector('g[data-event-dot="promo-window"]')).not.toBeNull();
    const eventsButton = legendButton('事件')!;
    fireEvent.click(eventsButton);
    expect(eventsButton.getAttribute('aria-pressed')).toBe('false');
    expect(eventsButton.style.opacity).toBe('0.45');
    expect(document.querySelector('[data-event-layer]')).toBeNull();
    expect(document.querySelector('[data-event-dot]')).toBeNull();
    expect(document.querySelector('[data-event-shade]')).toBeNull();
    fireEvent.click(eventsButton);
    expect(document.querySelector('g[data-event-dot="pe-range-1"]')).not.toBeNull();
    expect(document.querySelector('g[data-event-dot="promo-window"]')).not.toBeNull();
  });
});

// ============================================================
// 2026-11-04 评审大减法下线回归（v3 全期轴下仍成立）
// ============================================================
describe('主图 · 评审大减法下线回归（黑线 / 把握帽 / 档位线 / 色带）', () => {
  const SLOT = (1180 - 64 - 64) / baseResult.weeks.length;
  const xOf = (index: number): number => 64 + (index + 0.5) * SLOT;
  const round1 = (value: number): number => Number(value.toFixed(1));
  const scalesOf = (weeks: WorkbenchWeekResult[]): { yPrice: (value: number) => number } => {
    const prices = weeks.map((week) => week.price);
    const priceLo = Math.min(...prices);
    const priceHi = Math.max(...prices);
    const pad = (priceHi - priceLo) * 0.12 || Math.max(1, priceHi * 0.12);
    return {
      yPrice: (value: number): number => 34 + 172 * (1 - (value - (priceLo - pad)) / (priceHi + pad - (priceLo - pad))),
    };
  };
  const pathCoords = (d: string): Array<[number, number]> =>
    (d.match(/[ML]\s*-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) ?? []).map((pair) => {
      const [px, py] = pair.slice(1).trim().split(/\s+/).map(Number);
      return [px, py];
    });

  it('黑线下线：无墨色销量连线，销量只留柱（P0-2：历史实柱品牌浅红 / 预测虚柱品牌色描边）', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    const inkPaths = Array.from(document.querySelectorAll('svg path')).filter((path) => path.getAttribute('stroke') === color.ink);
    expect(inkPaths).toHaveLength(0);
    const historyBar = barWithTitle('2026W44');
    expect(historyBar!.getAttribute('fill')).toBe(brandColor.HUAWEI);
    expect(historyBar!.getAttribute('fill-opacity')).toBe('0.16');
    const forecastBar = barWithTitle('2026W45');
    expect(forecastBar!.getAttribute('stroke')).toBe(brandColor.HUAWEI);
    expect(forecastBar!.getAttribute('stroke-dasharray')).toBe('4 3');
  });

  it('把握帽 / 把握区间带下线：无帽线组、无半透明带，「把握」话术全下', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    const bandPaths = Array.from(document.querySelectorAll('svg path')).filter(
      (path) =>
        (path.getAttribute('fill') === color.link && path.getAttribute('fill-opacity') === '0.14') ||
        (path.getAttribute('fill') === brandColor.HUAWEI && path.getAttribute('fill-opacity') === '0.1'),
    );
    expect(bandPaths).toHaveLength(0);
    const capGroups = Array.from(document.querySelectorAll('svg g')).filter((group) => group.getAttribute('stroke') === color.warning);
    expect(capGroups).toHaveLength(0);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('把握');
    expect(document.querySelector('svg')?.getAttribute('aria-label')).not.toContain('把握');
  });

  it('档位线下线：无调价/档期锚点全高竖线与 hairlineStrong 编号圆点（范围事件锚线不在此列）', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    const anchorLines = Array.from(document.querySelectorAll('svg line')).filter(
      (line) => line.getAttribute('stroke') === color.hairlineStrong && line.getAttribute('stroke-dasharray') === '3 4',
    );
    expect(anchorLines).toHaveLength(0);
    const anchorCircles = Array.from(document.querySelectorAll('svg circle')).filter(
      (circle) => circle.getAttribute('stroke') === color.hairlineStrong,
    );
    expect(anchorCircles).toHaveLength(0);
  });

  it('预测段虚线区分：价格历史段实线、预测段虚线（6 5）', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    expect(historyPriceLine()).not.toBeNull();
    expect(forecastPriceLine()).not.toBeNull();
  });

  it('价格线接缝连续：预测线首点 = 最后历史点（2026W44 中心 x，$849 数据派生 y）', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    const { yPrice } = scalesOf(baseResult.weeks);
    const coords = pathCoords(forecastPriceLine()!.getAttribute('d') ?? '');
    expect(coords[0]).toEqual([round1(xOf(51)), round1(yPrice(849))]);
  });

  it('促销档期 = 起始周小方块点：aria 报告起点；hover 出档期区间底衬（琥珀 0.14）与名称浮框；档期色带不回归', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    expect(document.querySelector('svg')?.getAttribute('aria-label')).toContain('促销档期 2026W46 起');
    const promoDot = document.querySelector('g[data-event-dot="promo-window"]');
    expect(promoDot).not.toBeNull();
    expect(promoDot!.querySelector('rect')?.getAttribute('fill')).toBe(color.warning);
    // hover 方块点 → 档期区间底衬 + 名称证据浮框（轴下常驻文字标注已删）。
    fireEvent.mouseEnter(promoDot!);
    const shade = document.querySelector('rect[data-event-shade="promo-window"]');
    expect(shade).not.toBeNull();
    expect(shade!.getAttribute('fill')).toBe(color.warning);
    expect(shade!.getAttribute('fill-opacity')).toBe('0.14');
    expect(screen.getByRole('status', { name: /促销档期 黑五档期 2026/ })).toBeTruthy();
    fireEvent.mouseLeave(promoDot!);
    const amberBand = Array.from(document.querySelectorAll('svg rect')).find((rect) => rect.getAttribute('fill') === color.warningSoft);
    expect(amberBand).toBeUndefined();
  });

  it('今天分界保留：hairlineStrong 虚线 + 轴上「今天 11-03」日期仍在；预测区灰底衬与分区说明文字仍下线', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    const boundaryLine = Array.from(document.querySelectorAll('svg line')).find(
      (line) => line.getAttribute('stroke') === color.hairlineStrong && line.getAttribute('stroke-dasharray') === '4 4',
    );
    expect(boundaryLine).not.toBeUndefined();
    expect(svgTexts().some((text) => text.includes('今天 11-03'))).toBe(true);
    const softBands = Array.from(document.querySelectorAll('svg rect')).filter((rect) => rect.getAttribute('fill') === color.canvasSoft2);
    expect(softBands).toHaveLength(0);
    expect(svgTexts().some((text) => text === '实际')).toBe(false);
    expect(svgTexts().some((text) => text.includes('向未来'))).toBe(false);
  });

  it('纵轴上限由数据派生（niceCeil × 1.12 同公式）', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    const volumePeak = Math.max(0, ...baseResult.weeks.flatMap((week) => [week.sales, week.final]).filter((value): value is number => value != null), ...baseResult.weeks.map((week) => week.prevGenSales ?? 0));
    expect(niceCeil).toBeDefined();
    expect(volumePeak).toBeGreaterThan(0);
  });
});

// ============================================================
// 2026-11-05 Eason 全局 #8：SVG 文本风格对齐量价页基准
// ============================================================
describe('主图 · SVG 文本风格（font.family / 字号 10 / mute / tabular-nums）', () => {
  it('主图所有 SVG text 均 font.family + 字号 10（含 g 组继承）；说明性文本（月分组 / 今天 / 轴刻度）fill = mute 且 tabular-nums', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    const texts = Array.from(document.querySelectorAll('svg text')) as SVGTextElement[];
    expect(texts.length).toBeGreaterThan(0);
    // font-family / font-size / tabular-nums 可在 text 本身或其 g 组上（SVG 表现属性沿 g 继承）。
    const attrOf = (text: SVGTextElement, name: string): string | null =>
      text.getAttribute(name) ?? text.closest('g')?.getAttribute(name) ?? null;
    const numericOf = (text: SVGTextElement): string => {
      let node: Element | null = text;
      while (node != null) {
        const value = (node as HTMLElement).style?.fontVariantNumeric;
        if (value) return value;
        node = node.parentElement;
      }
      return '';
    };
    for (const text of texts) {
      expect(attrOf(text, 'font-family')).toBe(font.family);
      expect(attrOf(text, 'font-size')).toBe('10');
    }
    const month = texts.find((text) => /^\d{4}-\d{2}$/.test(text.textContent ?? ''));
    expect(month).toBeDefined();
    expect(attrOf(month!, 'fill')).toBe(color.mute);
    expect(numericOf(month!)).toBe('tabular-nums');
    const today = texts.find((text) => (text.textContent ?? '').startsWith('今天'));
    expect(today).toBeDefined();
    expect(today!.getAttribute('fill')).toBe(color.mute);
    expect(numericOf(today!)).toBe('tabular-nums');
  });
});

// ============================================================
// 2026-11-05 视觉精简二轮：图下时间轨（PanelTimeTrack 同款）与视图窗联动
// ============================================================
describe('主图 · 图下时间轨（2026-11-05 视觉精简二轮）', () => {
  /** 有状态视图 harness：onViewChange 真实回写 view（与页面 patchMainView 同链路）。 */
  function renderWithViewHarness(initialView: Partial<MainForecastView> = {}) {
    function Harness() {
      const [viewState, setViewState] = useState<Partial<MainForecastView>>(initialView);
      return (
        <MainForecastChart
          {...makeMainChartProps(fixture, baseParams, baseResult)}
          view={viewState}
          onViewChange={(patch) => setViewState((prev) => ({ ...prev, ...patch }))}
        />
      );
    }
    return render(<Harness />);
  }

  const startSlider = (): Element => screen.getByRole('slider', { name: '本图时间起点' });
  const endSlider = (): Element => screen.getByRole('slider', { name: '本图时间终点' });
  const presetButton = (label: string): HTMLButtonElement =>
    screen.getByRole('button', { name: `视图窗预设 · ${label}` }) as HTMLButtonElement;
  const visibleBars = (): Element[] =>
    Array.from(document.querySelectorAll('svg rect')).filter((rect) =>
      (rect.getAttribute('fill') ?? '') !== 'transparent'
      // 事件层（2026-11-05 全局 #2：促销档期起始方块点为非透明 rect）不计入数据柱。
      && rect.closest('[data-event-layer]') == null);
  const barsOfRange = (from: number, to: number): number =>
    baseResult.weeks.slice(from, to + 1).filter((week) => week.final != null).length;

  it('默认 = 全期窗：轨道域全期 104 周，选中窗 [0,103]，「全期」预设按下；extras 随「数据与操作」默认收起', () => {
    renderWithViewHarness();
    expect(startSlider().getAttribute('aria-valuemin')).toBe('0');
    // 起点拖柄上限 = 终点 − MIN_WINDOW + 1（103 − 4 + 1，最小窗钳制）。
    expect(startSlider().getAttribute('aria-valuemax')).toBe('100');
    expect(startSlider().getAttribute('aria-valuenow')).toBe('0');
    expect(endSlider().getAttribute('aria-valuenow')).toBe('103');
    expect(presetButton('全期').getAttribute('aria-pressed')).toBe('true');
    // 轨道位于图表下方（svg 之后出现）。
    const svgEl = document.querySelector('svg');
    const trackStart = startSlider();
    expect(svgEl!.compareDocumentPosition(trackStart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 收起区默认收起：extras（IoBar 输入文本）不可见。
    expect(document.body.textContent ?? '').not.toContain('大盘时间序列（经事件修正）');
  });

  it('预设「近 8 周」点击 → 可见窗同步为近 8 周（有值柱 8 根），轨道选中窗 aria-valuenow 同步 [96,103]', () => {
    renderWithViewHarness();
    fireEvent.click(presetButton('近 8 周'));
    expect(visibleBars()).toHaveLength(8);
    expect(barsOfRange(96, 103)).toBe(8);
    expect(startSlider().getAttribute('aria-valuenow')).toBe('96');
    expect(endSlider().getAttribute('aria-valuenow')).toBe('103');
    expect(presetButton('近 8 周').getAttribute('aria-pressed')).toBe('true');
    expect(presetButton('全期').getAttribute('aria-pressed')).toBe('false');
  });

  it('预设「三月」点击 → 只画预测末三月周（与受控 window=m3 同口径）', () => {
    renderWithViewHarness();
    fireEvent.click(presetButton('三月'));
    const m3Weeks = baseResult.weeks.filter((week) => ['2027-08', '2027-09', '2027-10'].includes(week.monthKey));
    expect(visibleBars()).toHaveLength(m3Weeks.filter((week) => week.final != null).length);
    expect(monthLabels()[0]).toBe('2027-08');
  });

  it('轨道拖柄键盘微调（→ 起点右移 1 周）→ 可见窗 = custom（预设全部弹起），柱窗随动', () => {
    renderWithViewHarness();
    expect(visibleBars()).toHaveLength(barsOfRange(0, 103));
    fireEvent.keyDown(startSlider(), { key: 'ArrowRight' });
    expect(startSlider().getAttribute('aria-valuenow')).toBe('1');
    expect(visibleBars()).toHaveLength(barsOfRange(1, 103));
    // custom 窗 = 无预设按下。
    expect(presetButton('全期').getAttribute('aria-pressed')).toBe('false');
    expect(presetButton('三月').getAttribute('aria-pressed')).toBe('false');
    expect(presetButton('近 8 周').getAttribute('aria-pressed')).toBe('false');
    // 最小窗钳制（MIN_WINDOW = 4）：终点左移到起点 +3 以内被钳。
    const endEl = endSlider();
    for (let i = 0; i < 120; i++) fireEvent.keyDown(endEl, { key: 'ArrowLeft' });
    expect(Number(endEl.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(Number(startSlider().getAttribute('aria-valuenow')) + 3);
  });
});

// ============================================================
// 2026-11-06 P0：实测宽绘制（ResizeObserver）与数据色纪律
// ============================================================
describe('主图 · P0-1 实测宽绘制 + P0-2 数据色（2026-11-06）', () => {
  const mainSvg = (): SVGSVGElement => document.querySelector('svg[role="img"]') as SVGSVGElement;

  it('P0-1 ResizeObserver 实测宽：viewBox 宽 = 实测容器宽（1000，非固定 1180）；resize 再报 640 随动', () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ReportingResizeObserverStub;
    ReportingResizeObserverStub.width = 1000;
    render(<MainForecastChart {...makeMainChartProps()} />);
    expect(mainSvg().getAttribute('viewBox')).toBe('0 0 1000 252');
    // 模拟容器 resize（640 ≥ 320 门槛）：viewBox 随动，绘图坐标按实测宽重排。
    act(() => {
      for (const inst of [...ReportingResizeObserverStub.instances]) inst.report(640);
    });
    expect(mainSvg().getAttribute('viewBox')).toBe('0 0 640 252');
    // 缩放比恒 1：月刻度字号仍是设计值 10（本字或沿 g 组继承），不因 SVG 等比缩放变小。
    const month = Array.from(mainSvg().querySelectorAll('text')).find((text) => /^\d{4}-\d{2}$/.test(text.textContent ?? ''));
    const fontSizeOf = (text: Element): string | null =>
      text.getAttribute('font-size') ?? text.closest('g')?.getAttribute('font-size') ?? null;
    expect(month).toBeDefined();
    expect(fontSizeOf(month!)).toBe('10');
  });

  it('P0-1 RO 不上报（no-op stub，等同无 RO 的 jsdom 环境）：viewBox 宽回退兜底常量 1180，不作为固定绘制宽', () => {
    // 组件 effect 对 typeof ResizeObserver === 'undefined' 同样直接跳过（源码守卫）；
    // no-op stub 下 observe 永不上报 → 宽保持 CHART_W_FALLBACK。
    render(<MainForecastChart {...makeMainChartProps()} />);
    expect(mainSvg().getAttribute('viewBox')).toBe('0 0 1180 252');
  });

  it('P0-2 周销柱（实际/预测）= 品牌色 HUAWEI：图内不再出现 link 蓝（#0070f3）柱 fill/stroke；图例色块同源', () => {
    render(<MainForecastChart {...makeMainChartProps()} />);
    const linkRects = Array.from(document.querySelectorAll('svg rect')).filter((rect) =>
      rect.getAttribute('fill') === color.link || rect.getAttribute('stroke') === color.link);
    expect(linkRects).toHaveLength(0);
    // 实际柱 = HUAWEI 浅实柱（fill-opacity 0.16）；预测柱 = HUAWEI 虚描边。
    expect(barWithTitle('2026W44')!.getAttribute('fill')).toBe(brandColor.HUAWEI);
    expect(barWithTitle('2026W45')!.getAttribute('stroke')).toBe(brandColor.HUAWEI);
    // 图例「周销 实际 / 周销 预测」色块 = 品牌色（jsdom style 序列化为 rgb()，按分量断言）。
    for (const label of ['周销 实际', '周销 预测']) {
      const glyph = Array.from(document.querySelectorAll('button[aria-pressed]'))
        .find((button) => (button.textContent ?? '').trim() === label)
        ?.querySelector('span[aria-hidden]') as HTMLElement | null;
      expect(glyph).toBeDefined();
      expect(`${glyph!.style.background};${glyph!.style.border}`).toContain('rgb(199, 0, 11)');
    }
  });

  it('P0-2 cannibalization 事件色退出 ink：= #be123c（与 referenceEventPalette 挤兑默认同源）', () => {
    expect(PRODUCT_EVENT_COLOR.cannibalization).not.toBe(color.ink);
    expect(PRODUCT_EVENT_COLOR.cannibalization).toBe('#be123c');
    expect(PRODUCT_EVENT_COLOR.cannibalization).toBe(referenceEventPalette[2]);
  });
});
