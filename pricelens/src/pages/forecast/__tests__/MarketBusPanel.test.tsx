// ============================================================
// 大盘卡（MarketBusPanel）组件测试（jsdom · v3 · 2026-11-05 精简三轮迁移）：
// 2026-11-05 拍板（高保真 market-card-hifi 为实施规格）：
// - 卡头 = 「② 大盘修正」+ 模拟 chip + AI 推测·可改徽章（hover 三步链 v2-3）
//   + 图内高亮开关（默认关）+ 「事件与情报」右侧滑出菜单按钮；
// - 信息删减：头部说明长句、「输入与读数」整块（IoBar + AI 季基线读数行）、
//   底部说明长句全部删除（不留残根）；
// - 事件与情报 = 右侧滑出菜单（默认收起、图表恒占满全宽；translateX 过渡 +
//   遮罩，Esc / ✕ / 遮罩关闭；情报候选空态 + 人工事件列表 + ＋添加事件）；
// - 添加事件浮窗 = 绝对定位悬浮图上（不改变图表区高度）：名称选填 / 说明选填 /
//   起止周 = 双月周历选择器（起点行→终点行，自动收起回填）/ 幅度 / 衰减 chips；
//   保存经 workbenchModel.monthSeedOfWeekRange 映射进 MarketMonthEventSeed；
// - 图上标注统一 = 箭头-线小标（月事件琥珀 / 周口径事件灰），hover → 区间
//   临时高亮，图内高亮开关 = 常驻底衬，「事件」图例项控制整层；
// - 衰减形状：MarketMonthEventSeed 可选 decay（缺省递减；flat = 恒定）。
// 月度证据浮框（v2-1）、图上双锚点（v2-2）、月调整反馈（B.5.6）契约不变。
// 只验证 React 组装与交互开关，不验证图表像素（SVG 由 typecheck 保证结构）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import { workbenchFixture, type MarketMonthEventSeed } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, marketMonthEventFactor, monthSeedOfWeekRange, weekRangeOfMonthEvent, type WorkbenchParams, type WorkbenchResult } from '../workbenchModel';
import { buildForecastCalendar } from '../workbenchCalendar';
import MarketBusPanel from '../MarketBusPanel';

afterEach(cleanup);

const fixture = workbenchFixture;
const calendar = buildForecastCalendar(fixture.calendar);

/** 默认月度事件（2027-01-29 起 +8% × 1 个月）：月中均摊口径用例。 */
const FOLD_MONTH_EVENT: MarketMonthEventSeed = { id: 'me-fold', label: '新春促销脉冲', startMonth: '2027-01', startDay: 29, durationMonths: 1, magnitudePct: 8 };
/** 周口径行业事件（v3 WeekRange 口径）：图上箭头-线小标用例。 */
const FOLD_WEEK_EVENT = { id: 'ev-fold', label: '折叠屏阵营扩容', startWeekId: '2026W46', endWeekId: '2026W50', magnitudePct: 6, decay: 'decreasing' as const };

interface SetupOptions {
  overrides?: Partial<WorkbenchParams>;
  onViewMainChart?: () => void;
  onCheckInventory?: () => void;
  onMonthEventUpdate?: (id: string, event: Omit<MarketMonthEventSeed, 'id'>) => void;
}

function setup(options: SetupOptions = {}): {
  onMonthOverride: ReturnType<typeof vi.fn>;
  onMonthEventAdd: ReturnType<typeof vi.fn>;
  onMonthEventRemove: ReturnType<typeof vi.fn>;
} {
  const params: WorkbenchParams = { ...baseWorkbenchParams(fixture), ...options.overrides };
  const result: WorkbenchResult = computeWorkbench(fixture, params);
  const onMonthOverride = vi.fn();
  const onMonthEventAdd = vi.fn();
  const onMonthEventRemove = vi.fn();
  render(
    <MarketBusPanel
      fixture={fixture}
      params={params}
      result={result}
      onMonthOverride={onMonthOverride}
      onMonthEventAdd={onMonthEventAdd}
      onMonthEventRemove={onMonthEventRemove}
      onMonthEventUpdate={options.onMonthEventUpdate}
      onViewMainChart={options.onViewMainChart}
      onCheckInventory={options.onCheckInventory}
      onRationaleChange={vi.fn()}
    />,
  );
  return { onMonthOverride, onMonthEventAdd, onMonthEventRemove };
}

const monthHit = (monthKey: string): Element => {
  const hit = document.querySelector(`rect[data-month="${monthKey}"]`);
  expect(hit, `预测月 ${monthKey} 交互列存在`).not.toBeNull();
  return hit as Element;
};

/** 滑出菜单开合 helper：点卡头「事件与情报」按钮。 */
const toggleDrawer = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '事件与情报' }));
};

/** 滑出菜单内「＋ 添加事件」按钮。 */
const clickAddEvent = (): void => {
  fireEvent.click(document.querySelector('[data-lpl-add-event-button]') as HTMLButtonElement);
};

/** v2-1 一层化两态入口：hover 预测月 → 证据浮框；点击「调整此月」→ 调整表单。 */
const openAdjustForm = (monthKey = '2027-03'): void => {
  fireEvent.mouseOver(monthHit(monthKey));
  const adjust = document.querySelector('[data-lpl-evidence-adjust]');
  expect(adjust, `证据浮框「调整此月」入口存在（${monthKey}）`).not.toBeNull();
  fireEvent.click(adjust as Element);
};

describe('大盘卡 · 模型纯函数：恒定形状与周历↔月度事件映射（2026-11-05）', () => {
  it('marketMonthEventFactor 恒定形状（decay: flat）：覆盖完整月恒定乘子、首月仍按日均摊、覆盖外 null', () => {
    const flat: MarketMonthEventSeed = { id: 'me-flat', label: '', startMonth: '2027-01', startDay: 29, durationMonths: 2, magnitudePct: 8, decay: 'flat' };
    // 首月（offset 0）：恒定乘子仍按日均摊占比 3/31。
    expect(marketMonthEventFactor(flat, '2027-01')).toBeCloseTo(1 + 0.08 * (3 / 31), 12);
    // 完整覆盖月：恒定 = 幅度全量（不随 offset 衰减）。
    expect(marketMonthEventFactor(flat, '2027-02')).toBeCloseTo(1.08, 12);
    // 覆盖外 null。
    expect(marketMonthEventFactor(flat, '2027-03')).toBeNull();
    expect(marketMonthEventFactor(flat, '2026-12')).toBeNull();
  });

  it('marketMonthEventFactor 缺省/递减 = 现行为（线性递减；缺省与显式 decreasing 同值）', () => {
    const implicit: MarketMonthEventSeed = { id: 'me-a', label: '', startMonth: '2027-01', startDay: 29, durationMonths: 2, magnitudePct: 8 };
    const explicit: MarketMonthEventSeed = { id: 'me-b', label: '', startMonth: '2027-01', startDay: 29, durationMonths: 2, magnitudePct: 8, decay: 'decreasing' };
    expect(marketMonthEventFactor(implicit, '2027-02')).toBeCloseTo(1 + 0.08 * (1 - 1 / 2), 12);
    expect(marketMonthEventFactor(implicit, '2027-02')).toBe(marketMonthEventFactor(explicit, '2027-02'));
    expect(marketMonthEventFactor(explicit, '2027-03')).toBeNull();
  });

  it('monthSeedOfWeekRange：起周周一所属月/日期 + 跨月数向上取整（2026W50 → 2027W01 = 2026-12-07 起 × 2 个月）', () => {
    expect(monthSeedOfWeekRange(calendar, { startWeekId: '2026W50', endWeekId: '2027W01' })).toEqual({
      startMonth: '2026-12',
      startDay: 7,
      durationMonths: 2,
    });
    // 单月内整周范围：跨月数 = 1。
    expect(monthSeedOfWeekRange(calendar, { startWeekId: '2026W45', endWeekId: '2026W47' })).toEqual({
      startMonth: '2026-11',
      startDay: 2,
      durationMonths: 1,
    });
  });

  it('monthSeedOfWeekRange：倒置范围 / 未知周 → null（无效范围不静默造数）', () => {
    expect(monthSeedOfWeekRange(calendar, { startWeekId: '2027W01', endWeekId: '2026W50' })).toBeNull();
    expect(monthSeedOfWeekRange(calendar, { startWeekId: '1999W01', endWeekId: '2026W50' })).toBeNull();
  });

  it('weekRangeOfMonthEvent：月事件经日历反推周范围（首月末日所在周为止周；窗外返回 null）', () => {
    // 2027-01-29 起 × 1 个月：起 = 含 01-29 的整周，止 = 当月末日（01-31）所在周（同一周 2027W04）。
    expect(weekRangeOfMonthEvent(calendar, FOLD_MONTH_EVENT)).toEqual({ startWeekId: '2027W04', endWeekId: '2027W04' });
    // 2026-11-02 起 × 1 个月：起 = 2026W45，止 = 2026-11-30 所在周 2026W49。
    expect(weekRangeOfMonthEvent(calendar, { startMonth: '2026-11', startDay: 2, durationMonths: 1 })).toEqual({
      startWeekId: '2026W45',
      endWeekId: '2026W49',
    });
    // 映射往返：起始日为周一时无损往返（2026-12-14 = 2026W51 周一 → 反推 → 同一映射）。
    const round = weekRangeOfMonthEvent(calendar, { startMonth: '2026-12', startDay: 14, durationMonths: 2 });
    expect(round).toEqual({ startWeekId: '2026W51', endWeekId: '2027W04' });
    expect(monthSeedOfWeekRange(calendar, round as { startWeekId: string; endWeekId: string })).toEqual({
      startMonth: '2026-12',
      startDay: 14,
      durationMonths: 2,
    });
    // 非周一起始日（周日 12-20）：反推按其所在整周落回周一日期（周口径选择粒度）。
    const sunday = weekRangeOfMonthEvent(calendar, { startMonth: '2026-12', startDay: 20, durationMonths: 2 });
    expect(monthSeedOfWeekRange(calendar, sunday as { startWeekId: string; endWeekId: string })).toEqual({
      startMonth: '2026-12',
      startDay: 14,
      durationMonths: 2,
    });
    // 事件整体在窗外：不造数。
    expect(weekRangeOfMonthEvent(calendar, { startMonth: '2024-01', startDay: 5, durationMonths: 1 })).toBeNull();
    expect(weekRangeOfMonthEvent(calendar, { startMonth: '2030-01', startDay: 5, durationMonths: 1 })).toBeNull();
  });
});

describe('大盘卡 · 卡头（2026-11-05 精简）：② 大盘修正 + 图内高亮开关 + 事件与情报按钮', () => {
  it('卡头 = 「② 大盘修正」+ 模拟 chip + AI 推测·可改徽章 + 图内高亮开关（默认关）+ 事件与情报按钮', () => {
    setup();
    const marketSection = Array.from(document.querySelectorAll('section'))
      .find((section) => section.querySelector('h2')?.textContent === '② 大盘修正');
    expect(marketSection).toBeTruthy();
    expect(screen.getAllByText('模拟').length).toBeGreaterThan(0);
    expect(document.body.textContent ?? '').toContain('AI 推测 · 可改');
    const hlSwitch = screen.getByRole('switch', { name: '图内高亮：关' });
    expect(hlSwitch.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('button', { name: '事件与情报' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('信息删减（不留残根）：头部说明长句 / IoBar / AI 预测季基线读数行 / 底部说明长句全部不存在', () => {
    setup();
    const text = document.body.textContent ?? '';
    // 头部说明长句（旧 SectionHead hint）
    expect(text).not.toContain('连贯至当前实际');
    expect(text).not.toContain('hover 预测月看证据浮框（趋势 / 月形 / 算例）');
    // 「输入与读数」整块（IoBar + AI 季基线读数行）
    expect(text).not.toContain('输入与读数');
    expect(text).not.toContain('月度指数 · 行业事件');
    expect(text).not.toContain('主图周销基准');
    expect(text).not.toContain('AI 预测季基线');
    // 底部说明长句
    expect(text).not.toContain('大盘只看总量');
    // 事件与情报相关说明行（旧右栏口径说明）
    expect(text).not.toContain('月中起始按日均摊：首月影响');
  });

  it('月度证据浮框契约不变：hover 预测月 → 四层浮框（AI 基线/生效 + 趋势 + 月形 + 调整此月）', () => {
    setup();
    fireEvent.mouseOver(monthHit('2027-02'));
    const popover = document.querySelector('[data-lpl-month-popover][data-popover-mode="evidence"]');
    expect(popover).not.toBeNull();
    expect((popover as HTMLElement).getAttribute('role')).toBe('dialog');
    expect((popover as HTMLElement).textContent ?? '').toContain('2027-02 · 预测月');
    expect((popover as HTMLElement).textContent ?? '').toContain('AI 基线 104.4 · 生效 104.4');
    expect(document.querySelector('[data-lpl-evidence-trend-readout]')?.textContent).toBe('趋势 · 近 6 个月环比 −0.7%/月');
    expect(document.querySelector('[data-lpl-evidence-adjust]')).not.toBeNull();
  });
});

describe('大盘卡 · 任务一：月度主序列（v3 统一 12 个预测月）', () => {
  it('历史 24 个月实线 + 统一 12 个预测月虚线（2026-11 起，2027-10 止），交互列只挂预测月', () => {
    setup();
    const svg = document.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('[data-series="actual"]')).not.toBeNull();
    expect(svg?.querySelector('[data-series="forecast"]')).not.toBeNull();
    const hitMonths = Array.from(document.querySelectorAll('rect[data-month]')).map((rect) => rect.getAttribute('data-month'));
    expect(hitMonths).toHaveLength(12);
    expect(hitMonths[0]).toBe('2026-11');
    expect(hitMonths[hitMonths.length - 1]).toBe('2027-10');
    // 历史月不可调整（无交互列）
    expect(hitMonths).not.toContain('2026-08');
    expect(hitMonths).not.toContain('2024-11');
  });

  it('X 轴月标签 = 全站月视图日历格式 YYYY-MM（季度首月刻度，含 2027-10；非季度首月不出刻度）', () => {
    setup();
    const svg = document.querySelector('svg[role="img"]');
    const labels = Array.from(svg?.querySelectorAll('text') ?? []).map((text) => text.textContent ?? '');
    for (const key of ['2025-01', '2025-04', '2025-07', '2025-10', '2026-01', '2026-04', '2026-07', '2026-10', '2027-01', '2027-04', '2027-07', '2027-10']) {
      expect(labels).toContain(key);
    }
    // 非季度首月不出刻度标签
    expect(labels).not.toContain('2026-05');
    expect(labels).not.toContain('2027-02');
  });

  it('「今天」文字标签已删（说明性内容）；历史/预测分界虚线保留（定位参考）', () => {
    setup();
    const svg = document.querySelector('svg[role="img"]');
    expect(svg?.textContent ?? '').not.toContain('今天');
    expect(svg?.textContent ?? '').not.toContain('11-03');
    const divider = svg?.querySelector('line[stroke-dasharray="4 4"]');
    expect(divider, '历史/预测分界虚线保留').not.toBeNull();
  });

  it('月线生效值即时反映事件乘子：2027-01 含月事件（29 日起 +8% × 3/31）→ 当前 105.8 ≠ 基线 105.0', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT] } });
    const hit = monthHit('2027-01');
    expect(hit.getAttribute('aria-label')).toContain('当前 105.8');
    expect(hit.getAttribute('aria-label')).toContain('AI 基线 105.0');
  });
});

describe('大盘卡 · v2-1：hover 证据浮框（四层）与一层化调整两态', () => {
  it('调整表单（证据态切换进入）：应用默认值回调 onMonthOverride(key, value, \'\')，原因选填不拦截', () => {
    const { onMonthOverride } = setup();
    openAdjustForm('2027-03');
    const popover = document.querySelector('[data-lpl-month-popover]');
    expect((popover as HTMLElement).textContent ?? '').toContain('AI 基线 105.6');
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    expect(apply?.disabled).toBe(false);
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 105.6, '');
    expect(document.querySelector('[data-lpl-month-popover]')).toBeNull();
  });

  it('调整后指数式：改值 + 填原因 → 回调带调整值与原因', () => {
    const { onMonthOverride } = setup();
    openAdjustForm('2027-03');
    const valueInput = screen.getByLabelText('调整后指数') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: '95' } });
    const reasonInput = screen.getByLabelText('调整原因（选填）') as HTMLInputElement;
    fireEvent.change(reasonInput, { target: { value: '投屏会领导当场上调' } });
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 95, '投屏会领导当场上调');
    expect(document.querySelector('[data-lpl-month-popover]')).toBeNull();
  });

  it('增减幅式：+10% → 回调值 = round1(生效 × 1.1) = 116.2', () => {
    const { onMonthOverride } = setup();
    openAdjustForm('2027-03');
    const pctMode = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '增减幅%');
    fireEvent.click(pctMode as HTMLButtonElement);
    const pctInput = screen.getByLabelText('增减幅（%）') as HTMLInputElement;
    fireEvent.change(pctInput, { target: { value: '10' } });
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 116.2, '');
  });

  it('含事件月复算提示 + 算例含乘子；已调整月轻量标记 + 还原 AI → onMonthOverride(key, null, \'\')', () => {
    const { onMonthOverride } = setup({
      overrides: {
        marketMonthEvents: [FOLD_MONTH_EVENT],
        marketMonthOverrides: { '2027-03': { value: 88, reason: '竞品延期' } },
      },
    });
    fireEvent.mouseOver(monthHit('2027-02'));
    expect(document.querySelector('[data-lpl-evidence-recalc]')).toBeNull();
    fireEvent.mouseOver(monthHit('2027-01'));
    const notice = document.querySelector('[data-lpl-evidence-recalc]');
    expect(notice?.textContent).toContain('含事件 +0.8%（均摊 3/31 天）');
    expect(document.querySelector('circle[data-adjusted="2027-03"]')).not.toBeNull();
    // 含手调月证据态复算提示 + 就地调整态还原 AI
    fireEvent.mouseOver(monthHit('2027-03'));
    expect(document.querySelector('[data-lpl-evidence-recalc]')?.textContent).toContain('含手调（竞品延期）');
    fireEvent.click(document.querySelector('[data-lpl-evidence-adjust]') as Element);
    const restore = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '还原AI');
    expect(restore).toBeTruthy();
    fireEvent.click(restore as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', null, '');
    expect(document.querySelector('[data-lpl-month-popover]')).toBeNull();
  });
});

describe('大盘卡 · 任务七（B.5.6）：月调整应用后反馈行', () => {
  it('应用后显示「本月比值 ×0.85 · 已联动 5 个预测周」+「查看主图」「检查库存」（回调接线）', () => {
    const onViewMainChart = vi.fn();
    const onCheckInventory = vi.fn();
    const { onMonthOverride } = setup({ onViewMainChart, onCheckInventory });
    openAdjustForm('2027-03');
    const valueInput = screen.getByLabelText('调整后指数') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: '90' } });
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 90, '');
    const feedback = document.querySelector('[data-lpl-month-feedback="2027-03"]');
    expect(feedback).not.toBeNull();
    expect(feedback?.textContent ?? '').toContain('本月比值 ×0.85 · 已联动 5 个预测周');
    // 跨卡动作（页级接线：回主图 / 检查库存）
    fireEvent.click(screen.getByRole('button', { name: '查看主图' }));
    expect(onViewMainChart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '检查库存' }));
    expect(onCheckInventory).toHaveBeenCalledTimes(1);
    // 反馈可关闭
    fireEvent.click(screen.getByRole('button', { name: '关闭 2027-03 调整反馈' }));
    expect(document.querySelector('[data-lpl-month-feedback="2027-03"]')).toBeNull();
  });

  it('还原该月后反馈行随之消失（不显示还原后残留比值）', () => {
    setup({ overrides: { marketMonthOverrides: { '2027-03': { value: 88, reason: '' } } } });
    fireEvent.mouseOver(monthHit('2027-03'));
    fireEvent.click(document.querySelector('[data-lpl-evidence-adjust]') as Element);
    // 调整态应用（写入同值）→ 反馈出现
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    fireEvent.click(apply as HTMLButtonElement);
    expect(document.querySelector('[data-lpl-month-feedback="2027-03"]')).not.toBeNull();
    // 再进调整态 → 还原 AI → 反馈消失
    fireEvent.mouseOver(monthHit('2027-03'));
    fireEvent.click(document.querySelector('[data-lpl-evidence-adjust]') as Element);
    const restore = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '还原AI');
    fireEvent.click(restore as HTMLButtonElement);
    expect(document.querySelector('[data-lpl-month-feedback="2027-03"]')).toBeNull();
  });
});

describe('大盘卡 · v2-2：图上双锚点（hover 临时，移开即恢复）', () => {
  it('默认态零锚点零降透明（不新增常驻元素）', () => {
    setup();
    const svg = document.querySelector('svg[role="img"]');
    expect(svg?.querySelector('[data-anchor]')).toBeNull();
    expect(svg?.querySelector('[data-dim="true"]')).toBeNull();
    const actual = svg?.querySelector('[data-series="actual"]') as SVGPathElement | null;
    expect(actual?.getAttribute('opacity')).toBe('1');
  });

  it('hover 预测月 → 趋势源段衬带（2026-05..2026-10，窗口与模型同源）+ 去年同位圆环 + hover 月加重点 + 来源连线', () => {
    setup();
    fireEvent.mouseOver(monthHit('2027-02'));
    const svg = document.querySelector('svg[role="img"]');
    const band = svg?.querySelector('[data-anchor="trend-band"]');
    expect(band).not.toBeNull();
    expect(band?.getAttribute('data-anchor-window')).toBe('2026-05..2026-10');
    expect(svg?.querySelector('[data-anchor="trend-source"]')).not.toBeNull();
    expect(svg?.querySelector('[data-anchor="trend-seg"]')).not.toBeNull();
    const ring = svg?.querySelector('[data-anchor="last-year-ring"]');
    expect(ring).not.toBeNull();
    expect(ring?.getAttribute('data-anchor-month')).toBe('2026-02');
    expect(svg?.querySelector('[data-anchor="hover-point"]')).not.toBeNull();
    expect(svg?.querySelector('[data-anchor="source-link"]')).not.toBeNull();
    expect(svg?.textContent ?? '').toContain('趋势源 · 近 6 个月');
    expect(svg?.textContent ?? '').toContain('月形来源 · 去年 2 月');
    // 其余线段降不透明
    expect(svg?.querySelector('[data-series="actual"]')?.getAttribute('data-dim')).toBe('true');
    expect(svg?.querySelector('[data-series="actual"]')?.getAttribute('opacity')).toBe('0.25');
    expect(svg?.querySelector('[data-series="forecast"]')?.getAttribute('data-dim')).toBe('true');
  });

  it('移开即恢复：mouseOut 后锚点、衬带与降透明全部消失', () => {
    setup();
    const hit = monthHit('2027-02');
    fireEvent.mouseOver(hit);
    expect(document.querySelector('[data-anchor="trend-band"]')).not.toBeNull();
    fireEvent.mouseOut(hit);
    const svg = document.querySelector('svg[role="img"]');
    expect(svg?.querySelector('[data-anchor]')).toBeNull();
    expect(svg?.querySelector('[data-dim="true"]')).toBeNull();
    expect(svg?.querySelector('[data-series="actual"]')?.getAttribute('opacity')).toBe('1');
  });
});

describe('大盘卡 · v2-3：徽章三步链浮层（零新增常驻元素）', () => {
  it('默认态无三步链浮层；hover 徽章 → 三步链出现（样本 → 两个规律 → 外推，数字与模型同源）', () => {
    setup();
    const trigger = document.querySelector('[data-lpl-ai-chain-root]');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-lpl-ai-chain-popover]')).toBeNull();
    fireEvent.mouseOver(trigger as Element);
    const popover = document.querySelector('[data-lpl-ai-chain-popover]');
    expect(popover).not.toBeNull();
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect((popover as HTMLElement).getAttribute('role')).toBe('dialog');
    const steps = popover?.querySelectorAll('[data-lpl-chain-step]');
    expect(steps).toHaveLength(3);
    const text = popover?.textContent ?? '';
    // 步 1 样本：24 个月历史段（2024-11–2026-10）
    expect(steps?.[0].textContent ?? '').toContain('样本');
    expect(steps?.[0].textContent ?? '').toContain('2024-11 – 2026-10 · 24 个月大盘指数');
    // 步 2 两个规律：季节（2027Q1 去年同季月形）+ 趋势（近 6 个月环比均值 −0.7%/月，模型同源）
    expect(steps?.[1].textContent ?? '').toContain('两个规律');
    expect(steps?.[1].textContent ?? '').toContain('100.00% / 99.44% / 100.56%');
    expect(steps?.[1].textContent ?? '').toContain('近 6 个月（2026-05–2026-10）环比均值 −0.7%/月');
    // 步 3 外推：算例（2027Q1 基线 105.0 → 105.0 · 104.4 · 105.6，与 computeMarketMonths 同源）
    expect(steps?.[2].textContent ?? '').toContain('外推');
    expect(steps?.[2].textContent ?? '').toContain('例：2027Q1 基线 105.0 × 去年同季月形 → 105.0 · 104.4 · 105.6');
    // 口径注释显式声明（模型与 UI 同一窗口）
    expect(text).toContain('趋势读数 = 近 6 个月实际段环比，模型与浮框同一函数');
    // 移开即收起（零常驻元素）
    fireEvent.mouseOut(trigger as Element);
    expect(document.querySelector('[data-lpl-ai-chain-popover]')).toBeNull();
  });

  it('键盘可达：Enter 切换三步链浮层（aria-expanded 同步）', () => {
    setup();
    const trigger = document.querySelector('[data-lpl-ai-chain-root]') as Element;
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(document.querySelector('[data-lpl-ai-chain-popover]')).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(document.querySelector('[data-lpl-ai-chain-popover]')).toBeNull();
  });
});

describe('大盘卡 · 右侧滑出菜单（2026-11-05：事件与情报，默认收起，图表恒占满全宽）', () => {
  it('卡体恒单列定高 330：默认收起 = 图表占满全宽；滑出菜单为浮层叠加（不改变卡体 grid）', () => {
    setup();
    const bodyGrid = document.querySelector('[data-testid="market-body-grid"]') as HTMLElement | null;
    expect(bodyGrid).toBeTruthy();
    expect(bodyGrid?.style.height).toBe('330px');
    expect(bodyGrid?.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
    // 打开滑出菜单：grid 仍单列（菜单是 absolute 浮层，不挤压图表）
    toggleDrawer();
    expect(bodyGrid?.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
    // 左图 SVG 宽度 100%（viewBox 760 与实际宽 ≈1:1，无 letterbox）
    const svg = document.querySelector('svg[role="img"]') as SVGSVGElement | null;
    expect(svg?.getAttribute('width')).toBe('100%');
    expect(svg?.getAttribute('height')).toBeNull();
  });

  it('滑出菜单开合：默认收起（translateX(105%)）；按钮 / ✕ / 遮罩 / Esc 均可关闭；aria-expanded 同步', () => {
    setup();
    const drawer = document.querySelector('[data-lpl-drawer]') as HTMLElement;
    expect(drawer.getAttribute('data-open')).toBe('false');
    expect(drawer.getAttribute('aria-hidden')).toBe('true');
    expect(drawer.style.transform).toBe('translateX(105%)');
    // 动效参数：transform 过渡（motion.base = 240ms）
    expect(drawer.style.transition).toContain('240ms');
    expect(drawer.style.transition).toContain('transform');
    const button = screen.getByRole('button', { name: '事件与情报' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    // 打开
    fireEvent.click(button);
    expect(drawer.getAttribute('data-open')).toBe('true');
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
    expect(drawer.style.transform).toBe('translateX(0)');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-lpl-drawer-scrim]')).not.toBeNull();
    // ✕ 关闭
    fireEvent.click(screen.getByRole('button', { name: '关闭事件与情报' }));
    expect(drawer.getAttribute('data-open')).toBe('false');
    // 再开 → Esc 关闭
    fireEvent.click(button);
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(drawer.getAttribute('data-open')).toBe('false');
    // 再开 → 遮罩点击关闭（同时收起浮窗）
    fireEvent.click(button);
    clickAddEvent();
    expect(document.querySelector('[data-lpl-event-popover]')).not.toBeNull();
    fireEvent.click(document.querySelector('[data-lpl-drawer-scrim]') as Element);
    expect(drawer.getAttribute('data-open')).toBe('false');
    expect(document.querySelector('[data-lpl-event-popover]')).toBeNull();
  });

  it('滑出菜单内容两块：情报候选空态（先列后审，禁用按钮）+ 人工事件区（列表 + ＋添加事件）', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT] } });
    const text = document.body.textContent ?? '';
    // 上块：情报候选空态（availability="pending"，真实候选另议）
    expect(text).toContain('情报候选 · 待审核 0');
    expect(text).toContain('候选生成能力待接入');
    expect(document.body.textContent ?? '').not.toContain('候选事件位');
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    const trigger = Array.from(document.querySelectorAll('button')).find((button) =>
      (button.getAttribute('title') ?? '').includes('候选生成能力待接入'));
    expect(trigger?.disabled).toBe(true);
    // 下块：人工事件列表行（名称 / 起止周段 / 幅度 / 衰减）＋ 添加事件
    const row = document.querySelector('[data-lpl-month-event-row="me-fold"]');
    expect(row).not.toBeNull();
    expect(row?.textContent ?? '').toContain('新春促销脉冲');
    expect(row?.textContent ?? '').toContain('2027W04–2027W04');
    expect(row?.textContent ?? '').toContain('+8% · 递减');
    expect(document.querySelector('[data-lpl-add-event-button]')).not.toBeNull();
  });

  it('空名称事件显示「未命名事件」；行内「删除」回调带 id', () => {
    const { onMonthEventRemove } = setup({
      overrides: { marketMonthEvents: [{ id: 'me-x', label: '', startMonth: '2026-12', startDay: 15, durationMonths: 2, magnitudePct: -6 }] },
    });
    const row = document.querySelector('[data-lpl-month-event-row="me-x"]');
    expect(row?.textContent ?? '').toContain('未命名事件');
    expect(row?.textContent ?? '').toContain('−6%');
    // 行内操作在滑出菜单内（默认收起时 aria-hidden，先打开再交互）
    toggleDrawer();
    fireEvent.click(screen.getByRole('button', { name: '删除事件 未命名事件' }));
    expect(onMonthEventRemove).toHaveBeenCalledWith('me-x');
  });
});

describe('大盘卡 · 添加事件浮窗（2026-11-05：双月周历选择器，悬浮图上不改变图表区高度）', () => {
  it('浮窗悬浮在图上（absolute 定位）：打开后卡体高度仍 330px、grid 布局不变', () => {
    setup();
    toggleDrawer();
    const bodyGrid = document.querySelector('[data-testid="market-body-grid"]') as HTMLElement;
    expect(bodyGrid.style.height).toBe('330px');
    clickAddEvent();
    const pop = document.querySelector('[data-lpl-event-popover]') as HTMLElement | null;
    expect(pop).not.toBeNull();
    expect((pop as HTMLElement).getAttribute('role')).toBe('dialog');
    expect(pop?.style.position).toBe('absolute');
    // 浮层打开不改变图表区高度（定高策略不受浮层影响）
    expect(bodyGrid.style.height).toBe('330px');
    expect(bodyGrid.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
  });

  it('字段齐全（名称选填 / 说明选填 / 起止周 / 幅度 / 衰减 chips）+ 默认值保存 → 映射进 MarketMonthEventSeed', () => {
    const { onMonthEventAdd } = setup();
    toggleDrawer();
    clickAddEvent();
    expect(screen.getByLabelText('事件名称（选填）')).toBeTruthy();
    expect(screen.getByLabelText('事件说明（选填）')).toBeTruthy();
    expect(screen.getByLabelText('事件影响幅度（%）')).toBeTruthy();
    expect(screen.getByLabelText('事件名称（选填）')).toBeTruthy();
    // 起止周按钮默认 = 统一日历首个预测周（单周）
    const rangeButton = document.querySelector('[data-lpl-week-range-button]');
    expect(rangeButton?.textContent ?? '').toContain('2026W45 → 2026W45 · 1 周');
    // 衰减 chips：递减默认选中
    expect(document.querySelector('[data-lpl-decay-chip="decreasing"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-lpl-decay-chip="flat"]')?.getAttribute('aria-pressed')).toBe('false');
    // 名称 + 说明 + 默认周保存 → 映射（2026W45 周一 = 2026-11-02；单周 = 1 个月）
    fireEvent.change(screen.getByLabelText('事件名称（选填）'), { target: { value: '新品首销' } });
    fireEvent.change(screen.getByLabelText('事件说明（选填）'), { target: { value: '门店堆头放量' } });
    const save = screen.getByRole('button', { name: '保存事件' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onMonthEventAdd).toHaveBeenCalledTimes(1);
    expect(onMonthEventAdd).toHaveBeenCalledWith({
      label: '新品首销；门店堆头放量',
      startMonth: '2026-11',
      startDay: 2,
      durationMonths: 1,
      magnitudePct: 5,
      decay: 'decreasing',
    });
    // 保存后浮窗收起
    expect(document.querySelector('[data-lpl-event-popover]')).toBeNull();
  });

  it('双月周历选择器：两月并排、行 = 整周（行首 ISO 周号）、起点行→终点行选择 + 自动收起回填；跨月范围映射跨月数', () => {
    vi.useFakeTimers();
    try {
      const { onMonthEventAdd } = setup();
      toggleDrawer();
      clickAddEvent();
      // 打开周历：默认页 = 2026年 11月 / 2026年 12月（两月并排）
      fireEvent.click(document.querySelector('[data-lpl-week-range-button]') as HTMLButtonElement);
      const picker = document.querySelector('[data-lpl-week-picker]');
      expect(picker).not.toBeNull();
      expect(document.querySelector('[data-lpl-week-month="2026-11"]')).not.toBeNull();
      expect(document.querySelector('[data-lpl-week-month="2026-12"]')).not.toBeNull();
      // 行首 = ISO 周号；2026W50 行在第 50 周（月页 2026-12 内）
      const row50 = document.querySelector('[data-lpl-week-row="2026W50"]') as HTMLElement;
      expect(row50?.getAttribute('data-week-number')).toBe('50');
      // 第一次点 = 起点
      fireEvent.click(row50);
      expect(row50.getAttribute('aria-pressed')).toBe('true');
      // 翻页到 2026-12 / 2027-01（跨月连续选择）
      fireEvent.click(document.querySelector('[data-lpl-week-nav="next"]') as HTMLButtonElement);
      expect(document.querySelector('[data-lpl-week-month="2027-01"]')).not.toBeNull();
      // 第二次点 = 终点（区间完成；起点在上一页仍选中——跨月连续）
      fireEvent.click(document.querySelector('[data-lpl-week-row="2027W01"]') as HTMLElement);
      expect(document.querySelector('[data-lpl-week-row="2026W50"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(document.querySelector('[data-lpl-week-row="2027W01"]')?.getAttribute('aria-pressed')).toBe('true');
      // 回填：起止周按钮显示 5 周（W50..W53..W01 = 5 个绝对周）
      expect(document.querySelector('[data-lpl-week-range-button]')?.textContent ?? '').toContain('2026W50 → 2027W01 · 5 周');
      // 自动收起回填（高保真 350ms 展示区间后收）
      act(() => { vi.advanceTimersByTime(360); });
      expect(document.querySelector('[data-lpl-week-picker]')).toBeNull();
      // 保存 → 跨月数向上取整 = 2 个月，起始 = 起周周一 2026-12-07
      fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
      expect(onMonthEventAdd).toHaveBeenCalledWith({
        label: '',
        startMonth: '2026-12',
        startDay: 7,
        durationMonths: 2,
        magnitudePct: 5,
        decay: 'decreasing',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('衰减 chips 切换（递减/恒定）：恒定保存 → decay: flat；取消 / ✕ / Esc 均可关闭浮窗', () => {
    const { onMonthEventAdd } = setup();
    toggleDrawer();
    clickAddEvent();
    fireEvent.click(document.querySelector('[data-lpl-decay-chip="flat"]') as HTMLButtonElement);
    expect(document.querySelector('[data-lpl-decay-chip="flat"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-lpl-decay-chip="decreasing"]')?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    expect(onMonthEventAdd).toHaveBeenCalledWith(expect.objectContaining({ decay: 'flat' }));
    // 取消关闭（antd 双字按钮文案带空格，按去空白匹配）
    clickAddEvent();
    const cancel = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '取消');
    fireEvent.click(cancel as HTMLButtonElement);
    expect(document.querySelector('[data-lpl-event-popover]')).toBeNull();
    // ✕ 关闭
    clickAddEvent();
    fireEvent.click(screen.getByRole('button', { name: '关闭添加事件浮窗' }));
    expect(document.querySelector('[data-lpl-event-popover]')).toBeNull();
    // Esc 关闭
    clickAddEvent();
    fireEvent.keyDown(document.querySelector('[data-lpl-event-popover]') as Element, { key: 'Escape' });
    expect(document.querySelector('[data-lpl-event-popover]')).toBeNull();
  });

  it('行内「编辑」= 同一浮窗编辑器：预填名称 / 幅度 / 周范围，改幅度后「保存修改」→ onMonthEventUpdate(id, next)', () => {
    const onMonthEventUpdate = vi.fn();
    setup({
      overrides: { marketMonthEvents: [{ id: 'me-x', label: '内存涨价', startMonth: '2026-12', startDay: 15, durationMonths: 2, magnitudePct: -6 }] },
      onMonthEventUpdate,
    });
    toggleDrawer();
    fireEvent.click(screen.getByRole('button', { name: '编辑事件 内存涨价' }));
    const pop = document.querySelector('[data-lpl-event-popover]');
    expect(pop?.getAttribute('data-lpl-event-popover-mode')).toBe('edit');
    // 预填：名称与幅度同当前值；周范围 = 月事件经日历反推（2026-12-15 → 2026W51 .. 2027-01-31 → 2027W04）
    expect((screen.getByLabelText('事件名称（选填）') as HTMLInputElement).value).toBe('内存涨价');
    expect((screen.getByLabelText('事件影响幅度（%）') as HTMLInputElement).value).toContain('-6');
    expect(document.querySelector('[data-lpl-week-range-button]')?.textContent ?? '').toContain('2026W51 → 2027W04');
    // 改幅度 → 保存修改 → 回调带 id 与映射字段（整周口径：起始 = 起周周一 2026-12-14）
    fireEvent.change(screen.getByLabelText('事件影响幅度（%）'), { target: { value: '-9' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    expect(onMonthEventUpdate).toHaveBeenCalledWith('me-x', {
      label: '内存涨价',
      startMonth: '2026-12',
      startDay: 14,
      durationMonths: 2,
      magnitudePct: -9,
      decay: 'decreasing',
    });
  });
});

describe('大盘卡 · 图上标注统一（2026-11-05：箭头-线小标 + hover 区间高亮 + 图内高亮开关）', () => {
  it('人工月事件 = 图顶部琥珀箭头-线小标（经日历反推周范围），hover 详情含均摊口径与衰减形状', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT] } });
    const tick = document.querySelector('[data-lpl-event-tick="me-fold"]') as SVGGElement | null;
    expect(tick).not.toBeNull();
    expect(tick?.getAttribute('data-month-event-id')).toBe('me-fold');
    // 箭头-线形态：两条箭头 path + 中间线
    expect(tick?.querySelectorAll('path')).toHaveLength(2);
    expect(tick?.querySelector('line')).not.toBeNull();
    expect(tick?.querySelector('text')?.textContent).toBe('新春促销脉冲');
    expect(tick?.querySelector('title')?.textContent ?? '').toContain('2027-01-29 起 · 1 个月 · +8% · 递减');
    expect(tick?.querySelector('title')?.textContent ?? '').toContain('首月覆盖 3/31 天');
  });

  it('周口径行业事件 = 灰箭头-线小标（不占主视觉），带 hover 详情', () => {
    setup({ overrides: { marketEvents: [FOLD_WEEK_EVENT] } });
    const tick = document.querySelector('[data-lpl-event-tick="ev-fold"]') as SVGGElement | null;
    expect(tick).not.toBeNull();
    expect(tick?.getAttribute('data-week-event-id')).toBe('ev-fold');
    expect(tick?.querySelector('title')?.textContent ?? '').toContain('折叠屏阵营扩容');
    expect(tick?.querySelector('title')?.textContent ?? '').toContain('2026W46–2026W50');
  });

  it('hover 小标 → 对应周区间临时高亮（移开即恢复）', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT] } });
    const tick = document.querySelector('[data-lpl-event-tick="me-fold"]') as Element;
    expect(document.querySelector('[data-lpl-event-band-hover="me-fold"]')).toBeNull();
    fireEvent.mouseEnter(tick);
    expect(document.querySelector('[data-lpl-event-band-hover="me-fold"]')).not.toBeNull();
    fireEvent.mouseLeave(tick);
    expect(document.querySelector('[data-lpl-event-band-hover="me-fold"]')).toBeNull();
  });

  it('图内高亮开关（默认关）：开 = 所有事件区间常驻底衬；关 = 移除', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT], marketEvents: [FOLD_WEEK_EVENT] } });
    expect(document.querySelector('[data-lpl-event-band="me-fold"]')).toBeNull();
    const hlSwitch = screen.getByRole('switch', { name: '图内高亮：关' });
    fireEvent.click(hlSwitch);
    expect(screen.getByRole('switch', { name: '图内高亮：开' }).getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[data-lpl-event-band="me-fold"]')).not.toBeNull();
    expect(document.querySelector('[data-lpl-event-band="ev-fold"]')).not.toBeNull();
    // 键盘可达：Enter 再切回关
    fireEvent.keyDown(screen.getByRole('switch', { name: '图内高亮：开' }), { key: 'Enter' });
    expect(screen.getByRole('switch', { name: '图内高亮：关' }).getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('[data-lpl-event-band="me-fold"]')).toBeNull();
  });

  it('图例四项（实际 / 预测 · 未来 4 季逐月 / AI 基线 / 事件）皆可显隐；「事件」项控制小标层与底衬', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT] } });
    const svg = document.querySelector('svg[role="img"]');
    expect(svg?.querySelector('[data-series="ai-ghost"]')).not.toBeNull();
    expect(document.querySelector('[data-lpl-event-track]')).not.toBeNull();
    const legendButton = (label: string): HTMLButtonElement | undefined =>
      Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').trim() === label);
    for (const label of ['实际（月度）', '预测 · 未来 4 季逐月', 'AI 基线', '事件']) {
      expect(legendButton(label)?.getAttribute('aria-pressed')).toBe('true');
    }
    // 「事件」隐藏：小标层整层移除（无 tick 可 hover，也无 hover 底衬）
    fireEvent.click(legendButton('事件') as HTMLButtonElement);
    expect(legendButton('事件')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-lpl-event-track]')).toBeNull();
    expect(document.querySelector('[data-month-event-id]')).toBeNull();
    expect(document.querySelector('[data-lpl-event-band-hover]')).toBeNull();
    expect(document.querySelector('[data-lpl-event-band]')).toBeNull();
    // 「AI 基线」隐藏只影响 ghost，不影响生效线
    fireEvent.click(legendButton('AI 基线') as HTMLButtonElement);
    expect(svg?.querySelector('[data-series="ai-ghost"]')).toBeNull();
    expect(svg?.querySelector('[data-series="forecast"]')).not.toBeNull();
  });

  it('无事件且无按月调整时不渲染 AI ghost（回 AI 口径对照不出现）', () => {
    setup();
    expect(document.querySelector('svg[role="img"]')?.querySelector('[data-series="ai-ghost"]')).toBeNull();
  });

  it('无月度数据时不渲染 NaN SVG，显示「当前范围无大盘数据」', () => {
    const params = baseWorkbenchParams(fixture);
    const result: WorkbenchResult = { ...computeWorkbench(fixture, params), marketMonths: [] };
    render(
      <MarketBusPanel
        fixture={fixture}
        params={params}
        result={result}
        onMonthOverride={vi.fn()}
        onMonthEventAdd={vi.fn()}
        onMonthEventRemove={vi.fn()}
        onRationaleChange={vi.fn()}
      />,
    );
    expect(document.querySelector('svg')).toBeNull();
    expect(document.body.textContent).toContain('当前范围无大盘数据');
  });
});
