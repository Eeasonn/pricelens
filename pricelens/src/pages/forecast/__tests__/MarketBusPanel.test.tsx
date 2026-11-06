// ============================================================
// 大盘卡（MarketBusPanel）组件测试（jsdom · v3 · 2026-11-05 看图反馈整改）：
// 2026-11-05 Eason 反馈 #5-#7 + 全局 #1/#2/#8：
// - 卡头 = 「② 大盘修正」+ 单个 HintInfo（模拟 chip 与 AI 推测·可改徽章
//   退役合并，title = 模拟语境 + AI 基线信任语言）+ 卡头「＋事件」按钮
//   （形态对齐量价参考卡卡头）；抽屉 / 三步链浮层断言删除；
// - 卡体两栏 = 左图表区 + 右 1/3 情报常驻列（340px；≤760px 由 index.css
//   既有 [data-lpl-intelligence-grid] 断点堆叠，jsdom 不测媒体查询）：情报候选
//   availability="ready"（模拟候选 5 条，先列后删 / 批量规则）+ 人工事件
//   名录（CollapsibleSection 收起头 + 11px 行）；列内滚动兜底；
// - y 轴横向 gridline 全删只留刻度文字（无网格净图）；
// - 图上事件小标 = 小方块点（8px 事件色，对齐起始位置；箭头-线已删），
//   hover → 区间临时高亮 + <title> 精简 tooltip；
// - 图内高亮开关在图例行「事件」项旁（默认关）；图例四项全部可点显隐；
// - 添加事件浮窗 = 绝对定位悬浮图上（不改变图表区高度）：名称选填 /
//   说明选填 / 起止周 = 双月周历选择器 / 幅度 / 衰减 chips；保存经
//   workbenchModel.monthSeedOfWeekRange 映射进 MarketMonthEventSeed。
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

/** 情报列人工事件名录展开 helper：点 CollapsibleSection 收起头。 */
const expandManualEvents = (count = 1): void => {
  fireEvent.click(screen.getByRole('button', { name: `人工事件 · ${count}` }));
};

/** 卡头「＋事件」按钮（情报列整改后入口在卡头控件簇）。 */
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

describe('大盘卡 · 卡头（2026-11-05 整改）：② 大盘修正 + HintInfo + ＋事件按钮', () => {
  it('卡头 = 「② 大盘修正」+ 单个 HintInfo（模拟 + AI 基线合并 title）+ 「＋事件」按钮（量价参考卡头同款形态）', () => {
    setup();
    const marketSection = Array.from(document.querySelectorAll('section'))
      .find((section) => section.querySelector('h2')?.textContent === '② 大盘修正');
    expect(marketSection).toBeTruthy();
    // chip 退役（反馈 #7）：卡头不再有「模拟」chip（情报列候选行只在合并元信息行携带数据状态文字）
    expect(screen.queryByText('模拟')).toBeNull();
    expect(document.body.textContent ?? '').not.toContain('AI 推测 · 可改');
    // 合并为单个 HintInfo：? 号说明图标 + 合并 title（模拟语境 + AI 基线信任语言）
    const hints = document.querySelectorAll('section [aria-label="大盘修正卡说明"]');
    expect(hints).toHaveLength(1);
    const hintTitle = hints[0].getAttribute('title') ?? '';
    expect(hintTitle).toContain('模拟数据');
    expect(hintTitle).toContain('确定性外推');
    expect(hintTitle).toContain('AI 基线 · 可直接修改，改动即人工确认');
    // 卡头「＋事件」按钮（data-lpl-add-event-button；headButtonStyle 形态）
    const add = document.querySelector('[data-lpl-add-event-button]') as HTMLButtonElement | null;
    expect(add).not.toBeNull();
    expect(add?.getAttribute('aria-label')).toBe('添加事件');
    expect(add?.textContent).toContain('＋事件');
    expect(add?.style.height).toBe('24px');
    expect(add?.style.fontSize).toBe('11.5px');
    // 抽屉机制整体退役：无抽屉按钮 / 抽屉容器 / 遮罩 / 三步链浮层触发器
    expect(screen.queryByRole('button', { name: '事件与情报' })).toBeNull();
    expect(document.querySelector('[data-lpl-drawer]')).toBeNull();
    expect(document.querySelector('[data-lpl-drawer-scrim]')).toBeNull();
    expect(document.querySelector('[data-lpl-ai-chain-root]')).toBeNull();
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
  it('调整表单（证据态切换进入）：缺原因先阻断；填原因后应用回调（保存才回写，Batch 2 必填）', () => {
    const { onMonthOverride } = setup();
    openAdjustForm('2027-03');
    const popover = document.querySelector('[data-lpl-month-popover]');
    expect((popover as HTMLElement).textContent ?? '').toContain('AI 基线 105.6');
    const apply = () => Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    // 原因未填：应用禁用，不回调（取消不写入）
    expect(apply()?.disabled).toBe(true);
    expect(onMonthOverride).not.toHaveBeenCalled();
    const reasonInput = screen.getByLabelText('调整原因（必填）') as HTMLInputElement;
    fireEvent.change(reasonInput, { target: { value: '大促流量前置' } });
    expect(apply()?.disabled).toBe(false);
    fireEvent.click(apply() as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 105.6, '大促流量前置');
    expect(document.querySelector('[data-lpl-month-popover]')).toBeNull();
  });

  it('调整后指数式：改值 + 填原因 → 回调带调整值与原因', () => {
    const { onMonthOverride } = setup();
    openAdjustForm('2027-03');
    const valueInput = screen.getByLabelText('调整后指数') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: '95' } });
    const reasonInput = screen.getByLabelText('调整原因（必填）') as HTMLInputElement;
    fireEvent.change(reasonInput, { target: { value: '投屏会领导当场上调' } });
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 95, '投屏会领导当场上调');
    expect(document.querySelector('[data-lpl-month-popover]')).toBeNull();
  });

  it('增减幅式：+10% → 回调值 = round1(生效 × 1.1) = 116.2（原因必填）', () => {
    const { onMonthOverride } = setup();
    openAdjustForm('2027-03');
    const pctMode = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '增减幅%');
    fireEvent.click(pctMode as HTMLButtonElement);
    const pctInput = screen.getByLabelText('增减幅（%）') as HTMLInputElement;
    fireEvent.change(pctInput, { target: { value: '10' } });
    const reasonInput = screen.getByLabelText('调整原因（必填）') as HTMLInputElement;
    fireEvent.change(reasonInput, { target: { value: '竞品提价跟随' } });
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 116.2, '竞品提价跟随');
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
    const reasonInput = screen.getByLabelText('调整原因（必填）') as HTMLInputElement;
    fireEvent.change(reasonInput, { target: { value: '季度末冲量' } });
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 90, '季度末冲量');
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
    setup({ overrides: { marketMonthOverrides: { '2027-03': { value: 88, reason: '竞品延期' } } } });
    fireEvent.mouseOver(monthHit('2027-03'));
    fireEvent.click(document.querySelector('[data-lpl-evidence-adjust]') as Element);
    // 调整态应用（原因沿用已填值）→ 反馈出现
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    expect(apply?.disabled).toBe(false);
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

describe('大盘卡 · 卡体两栏（2026-11-05 整改 #5+#6）：左图表区 + 右 1/3 情报常驻列', () => {
  it('卡体定高 330 两栏：左图表 1fr + 右情报列 340px；无抽屉/遮罩残根；SVG 宽 100% 无 letterbox', () => {
    setup();
    const bodyGrid = document.querySelector('[data-testid="market-body-grid"]') as HTMLElement | null;
    expect(bodyGrid).toBeTruthy();
    expect(bodyGrid?.style.height).toBe('330px');
    expect(bodyGrid?.style.gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 340px)');
    // 窄屏退化挂点：复用 index.css 既有 [data-lpl-intelligence-grid] ≤760px 单列断点
    expect(bodyGrid?.hasAttribute('data-lpl-intelligence-grid')).toBe(true);
    // 左图 SVG 宽度 100%（viewBox 宽 = 实测渲染宽口径，无 letterbox）
    const svg = document.querySelector('svg[role="img"]') as SVGSVGElement | null;
    expect(svg?.getAttribute('width')).toBe('100%');
    expect(svg?.getAttribute('height')).toBeNull();
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 \d+ 252$/);
  });

  it('右情报列常驻：IntelligenceReviewPanel availability="ready" + 模拟候选 5 条（先列后审/批量规则），dataStatus 显式模拟', () => {
    setup();
    const intel = document.querySelector('[data-lpl-market-intel]') as HTMLElement | null;
    expect(intel).not.toBeNull();
    expect(document.querySelector('[data-lpl-intelligence-panel]')?.getAttribute('data-lpl-intelligence-availability')).toBe('ready');
    const text = document.body.textContent ?? '';
    // 标题 = Top5 语义待审核数（5 条模拟候选）
    expect(text).toContain('情报候选 · 待审核 5');
    // 模拟候选内容（任务示例 4 条 + 需人工补参 1 条）
    for (const title of [
      '友商旗舰 X5 预计 2027-01 发布',
      '黑五网一大促 2026W47-W49',
      '运营商 Q1 补贴政策落地',
      '关税调整推高渠道成本',
      '线上渠道补贴战延续',
    ]) {
      expect(text).toContain(title);
    }
    // 依据状态与目标 chip 双通道（先列后审；跨目标批量规则可见）
    expect(text).toContain('依据齐全');
    expect(text).toContain('需人工补参');
    expect(text).toContain('②大盘 · 月事件');
    expect(text).toContain('主图 · 范围事件');
    expect(text).toContain('④成本 · 成本参考');
    // 模拟状态显式（PRODUCT.md：模拟数据必须文字标识，不靠颜色）
    expect(text).toContain('模拟样本');
    // 批量规则交互在位：全选 + 批量移除 / 批量拒绝 / 批量预览
    expect(screen.getByLabelText('选择当前 Top5')).toBeTruthy();
    expect(screen.getByRole('button', { name: '批量移除' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '批量拒绝' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '批量预览' })).toBeTruthy();
    // 5 行候选复选框 + 全选 1 = 6
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
  });

  it('情报列人工事件名录 = CollapsibleSection 收起头（默认收起）+ 11px 列表行；展开后行内编辑/删除在位', () => {
    const { onMonthEventRemove } = setup({
      overrides: { marketMonthEvents: [{ id: 'me-x', label: '', startMonth: '2026-12', startDay: 15, durationMonths: 2, magnitudePct: -6 }] },
    });
    // 默认收起：行不渲染（CollapsibleSection 收起即卸载内容）
    expect(document.querySelector('[data-lpl-month-event-row="me-x"]')).toBeNull();
    // 展开名录
    expandManualEvents(1);
    const row = document.querySelector('[data-lpl-month-event-row="me-x"]');
    expect(row).not.toBeNull();
    expect(row?.textContent ?? '').toContain('未命名事件');
    expect(row?.textContent ?? '').toContain('−6%');
    expect(row?.textContent ?? '').toContain('递减');
    // 行内「删除」回调带 id
    fireEvent.click(screen.getByRole('button', { name: '删除事件 未命名事件' }));
    expect(onMonthEventRemove).toHaveBeenCalledWith('me-x');
    // 行内「编辑」打开同一浮窗编辑器
    fireEvent.click(screen.getByRole('button', { name: '编辑事件 未命名事件' }));
    expect(document.querySelector('[data-lpl-event-popover][data-lpl-event-popover-mode="edit"]')).not.toBeNull();
  });

  it('无人工事件时名录展开显示空态引导（入口指向卡头「＋事件」）', () => {
    setup();
    expandManualEvents(0);
    const section = document.querySelector('[data-collapsible-section="人工事件 · 0"]');
    expect(section).not.toBeNull();
    expect(section?.textContent ?? '').toContain('暂无人工事件');
    expect(section?.textContent ?? '').toContain('＋事件');
  });
});

describe('大盘卡 · 添加事件浮窗（2026-11-05：双月周历选择器，悬浮图上不改变图表区高度）', () => {
  it('浮窗悬浮在图上（absolute 定位）：打开后卡体高度仍 330px、两栏 grid 布局不变', () => {
    setup();
    const bodyGrid = document.querySelector('[data-testid="market-body-grid"]') as HTMLElement;
    expect(bodyGrid.style.height).toBe('330px');
    clickAddEvent();
    const pop = document.querySelector('[data-lpl-event-popover]') as HTMLElement | null;
    expect(pop).not.toBeNull();
    expect((pop as HTMLElement).getAttribute('role')).toBe('dialog');
    expect(pop?.style.position).toBe('absolute');
    // 浮层打开不改变图表区高度（定高策略不受浮层影响）
    expect(bodyGrid.style.height).toBe('330px');
    expect(bodyGrid.style.gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 340px)');
  });

  it('字段齐全（名称选填 / 说明必填 / 起止周 / 幅度 / 衰减 chips）+ 缺说明阻断 → 填说明保存 → 映射进 MarketMonthEventSeed', () => {
    const { onMonthEventAdd } = setup();
    clickAddEvent();
    expect(screen.getByLabelText('事件名称（选填）')).toBeTruthy();
    expect(screen.getByLabelText('事件说明（必填）')).toBeTruthy();
    expect(screen.getByLabelText('事件影响幅度（%）')).toBeTruthy();
    expect(screen.getByLabelText('事件名称（选填）')).toBeTruthy();
    // 起止周按钮默认 = 统一日历首个预测周（单周）
    const rangeButton = document.querySelector('[data-lpl-week-range-button]');
    expect(rangeButton?.textContent ?? '').toContain('2026W45 → 2026W45 · 1 周');
    // 衰减 chips：递减默认选中
    expect(document.querySelector('[data-lpl-decay-chip="decreasing"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-lpl-decay-chip="flat"]')?.getAttribute('aria-pressed')).toBe('false');
    // Batch 2：说明必填——不填先阻断（取消不写入）
    const save = screen.getByRole('button', { name: '保存事件' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(onMonthEventAdd).not.toHaveBeenCalled();
    // 名称 + 说明 + 默认周保存 → 映射（2026W45 周一 = 2026-11-02；单周 = 1 个月）
    fireEvent.change(screen.getByLabelText('事件名称（选填）'), { target: { value: '新品首销' } });
    fireEvent.change(screen.getByLabelText('事件说明（必填）'), { target: { value: '门店堆头放量' } });
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
      // 说明必填（Batch 2）：填说明后保存 → 跨月数向上取整 = 2 个月，起始 = 起周周一 2026-12-07
      fireEvent.change(screen.getByLabelText('事件说明（必填）'), { target: { value: '年末促销档期' } });
      fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
      expect(onMonthEventAdd).toHaveBeenCalledWith({
        label: '年末促销档期',
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
    clickAddEvent();
    fireEvent.click(document.querySelector('[data-lpl-decay-chip="flat"]') as HTMLButtonElement);
    expect(document.querySelector('[data-lpl-decay-chip="flat"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-lpl-decay-chip="decreasing"]')?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.change(screen.getByLabelText('事件说明（必填）'), { target: { value: '补贴持续到季末' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    expect(onMonthEventAdd).toHaveBeenCalledWith(expect.objectContaining({ decay: 'flat', label: '补贴持续到季末' }));
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
    expandManualEvents(1);
    fireEvent.click(screen.getByRole('button', { name: '编辑事件 内存涨价' }));
    const pop = document.querySelector('[data-lpl-event-popover]');
    expect(pop?.getAttribute('data-lpl-event-popover-mode')).toBe('edit');
    // 预填：名称与幅度同当前值；周范围 = 月事件经日历反推（2026-12-15 → 2026W51 .. 2027-01-31 → 2027W04）
    expect((screen.getByLabelText('事件名称（选填）') as HTMLInputElement).value).toBe('内存涨价');
    expect((screen.getByLabelText('事件影响幅度（%）') as HTMLInputElement).value).toContain('-6');
    expect(document.querySelector('[data-lpl-week-range-button]')?.textContent ?? '').toContain('2026W51 → 2027W04');
    // 改幅度 → 填修改说明（Batch 2 必填）→ 保存修改 → 回调带 id 与映射字段（整周口径：起始 = 起周周一 2026-12-14）
    fireEvent.change(screen.getByLabelText('事件影响幅度（%）'), { target: { value: '-9' } });
    fireEvent.change(screen.getByLabelText('事件说明（必填）'), { target: { value: '供应链成本再涨' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    expect(onMonthEventUpdate).toHaveBeenCalledWith('me-x', {
      label: '内存涨价；供应链成本再涨',
      startMonth: '2026-12',
      startDay: 14,
      durationMonths: 2,
      magnitudePct: -9,
      decay: 'decreasing',
    });
  });
});

describe('大盘卡 · 图上标注统一（2026-11-05 全局 #2：小方块点 + hover 区间高亮 + 图内高亮开关在图例行）', () => {
  it('人工月事件 = 图顶部琥珀小方块点（8px，对齐事件起始位置；箭头-线与图上名称已删），hover 详情含均摊口径与衰减形状', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT] } });
    const tick = document.querySelector('[data-lpl-event-tick="me-fold"]') as SVGGElement | null;
    expect(tick).not.toBeNull();
    expect(tick?.getAttribute('data-month-event-id')).toBe('me-fold');
    // 方块点形态：8×8 rect（rx 2，事件色）；无箭头 path / 区间连线 / 图上名称文字
    const dot = tick?.querySelector('rect[data-lpl-event-dot]') as SVGRectElement | null;
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute('width')).toBe('8');
    expect(dot?.getAttribute('height')).toBe('8');
    expect(dot?.getAttribute('rx')).toBe('2');
    expect(dot?.getAttribute('fill')).toBe('#f5a623');
    expect(tick?.querySelectorAll('path')).toHaveLength(0);
    expect(tick?.querySelector('line')).toBeNull();
    expect(tick?.querySelector('text')).toBeNull();
    // 既有精简 tooltip（<title>）不变
    expect(tick?.querySelector('title')?.textContent ?? '').toContain('2027-01-29 起 · 1 个月 · +8% · 递减');
    expect(tick?.querySelector('title')?.textContent ?? '').toContain('首月覆盖 3/31 天');
  });

  it('周口径行业事件 = 灰小方块点（不占主视觉），带 hover 详情', () => {
    setup({ overrides: { marketEvents: [FOLD_WEEK_EVENT] } });
    const tick = document.querySelector('[data-lpl-event-tick="ev-fold"]') as SVGGElement | null;
    expect(tick).not.toBeNull();
    expect(tick?.getAttribute('data-week-event-id')).toBe('ev-fold');
    expect(tick?.querySelector('rect[data-lpl-event-dot]')?.getAttribute('fill')).toBe('#737373');
    expect(tick?.querySelector('title')?.textContent ?? '').toContain('折叠屏阵营扩容');
    expect(tick?.querySelector('title')?.textContent ?? '').toContain('2026W46–2026W50');
  });

  it('y 轴横向 gridline 全删（反馈 #5）：无 hairline 横线组，只留刻度文字（含 font.family + tabular-nums）', () => {
    setup();
    const svg = document.querySelector('svg[role="img"]') as SVGSVGElement | null;
    expect(svg).not.toBeNull();
    // 无横向网格线（hairline stroke 的 line 一条都不留）
    expect(svg?.querySelectorAll('line')).toHaveLength(1); // 仅历史/预测分界虚线
    expect(svg?.querySelector('line')?.getAttribute('stroke-dasharray')).toBe('4 4');
    // 刻度文字保留 + 风格对齐 volume 页（#8）：fontSize 10 / fill=mute / font.family / tabular-nums
    const tickGroup = svg?.querySelector('g[font-family]') as SVGGElement | null;
    expect(tickGroup?.getAttribute('font-size')).toBe('10');
    expect(tickGroup?.getAttribute('fill')).toBe('#737373');
    expect(tickGroup?.getAttribute('font-family')).toContain('Inter');
    expect(tickGroup?.getAttribute('style')).toContain('tabular-nums');
    expect(tickGroup?.querySelectorAll('text').length).toBeGreaterThan(0);
    const axisGroup = svg?.querySelector('g[text-anchor="middle"]') as SVGGElement | null;
    expect(axisGroup?.getAttribute('font-size')).toBe('10');
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

  it('图内高亮开关挪到图例行「事件」项旁（默认关）：开 = 所有事件区间常驻底衬；关 = 移除；卡头无开关', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT], marketEvents: [FOLD_WEEK_EVENT] } });
    expect(document.querySelector('[data-lpl-event-band="me-fold"]')).toBeNull();
    // 开关在图例行内（与 WorkbenchLegend 同一行容器；量价参考卡同处理）
    const hlSwitch = screen.getByRole('switch', { name: '图内高亮：关' });
    const legendRow = hlSwitch.parentElement as HTMLElement;
    expect(legendRow.textContent ?? '').toContain('事件');
    expect(legendRow.querySelectorAll('[role="button"], button').length).toBeGreaterThanOrEqual(4);
    fireEvent.click(hlSwitch);
    expect(screen.getByRole('switch', { name: '图内高亮：开' }).getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[data-lpl-event-band="me-fold"]')).not.toBeNull();
    expect(document.querySelector('[data-lpl-event-band="ev-fold"]')).not.toBeNull();
    // 再点切回关（原生 button 键盘可达，Enter/Space 触发 click）
    fireEvent.click(screen.getByRole('switch', { name: '图内高亮：开' }));
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
