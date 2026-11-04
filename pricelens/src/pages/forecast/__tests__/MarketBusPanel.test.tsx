// ============================================================
// 大盘卡（MarketBusPanel）组件测试（jsdom · v3 · 任务 7 迁移 + B.5.6 增补）：
// 任务一 = 历史 24 个月实线 + 统一 12 个预测月虚线（2026-11–2027-10，严格 12 个月），
//   预测季基线读数（109.9 / 105.0 / 102.1 / 99.2 / 105.8，与主链
//   result.marketQuarters 同源同值）与月线生效值（含月事件乘子）；
//   X 轴月标签 = 全站月视图日历格式 YYYY-MM（无缩写式）；「今天」文字标签已删；
// 任务二（v2-1）= hover/Tab+Enter 预测月 → 证据浮框四层（头部 基线/生效、
//   趋势行 近 6 个月环比 −0.7%/月 + sparkline、月形行 去年同季三柱 + 算例、
//   底部「调整此月」）；「调整此月」就地切换既有调整表单（一层化两态，
//   原因选填不拦截），已调整月轻量标记（实心蓝点 data-adjusted），
//   还原 AI = onMonthOverride(key, null, '')；
// 任务二（v2-2）= 双锚点：趋势源段衬带（2026-05..2026-10，窗口 = 模型
//   marketTrendWindow 同源）+ 去年同位圆环 + 其余线段降不透明 + 移开即恢复；
// 任务二（v2-3）= 卡头「AI 推测 · 可改」徽章 hover/点击 → 三步链浮层
//   （样本 24 个月 → 两个规律 → 外推，数字与模型同源），零新增常驻元素；
// 任务三（B.5.6）= 月中事件均摊口径可见 + 三字段录入（名称选填）+
//   行内「编辑」（同一三字段编辑器 → onMonthEventUpdate）+ 删除回调；
// 任务七（B.5.6）= 月调整应用后反馈「本月比值 ×… · 已联动 N 个预测周」+
//   「查看主图」「检查库存」；
// 任务四 = 事件区右 1/3 两块（情报候选空态「候选生成能力待接入」+ 禁用按钮，
//   不画假候选；人工事件列表）；事件在图上 = 轴下次要标记；
//   卡体定高 330（2026-11-04 视觉一致性）。
// 环比数字由所画 6 个月真实计算（marketBusMonthly.test 同源断言），UI 不另编。
// 只验证 React 组装与交互开关，不验证图表像素（SVG 由 typecheck 保证结构）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import { workbenchFixture, type MarketMonthEventSeed } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, type WorkbenchParams, type WorkbenchResult } from '../workbenchModel';
import MarketBusPanel from '../MarketBusPanel';

afterEach(cleanup);

const fixture = workbenchFixture;

/** 默认月度事件（2027-01-29 起 +8% × 1 个月）：月中均摊口径用例。 */
const FOLD_MONTH_EVENT: MarketMonthEventSeed = { id: 'me-fold', label: '新春促销脉冲', startMonth: '2027-01', startDay: 29, durationMonths: 1, magnitudePct: 8 };
/** 周口径行业事件（v3 WeekRange 口径）：图上轴下次要标记用例。 */
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

/** v2-1 一层化两态入口：hover 预测月 → 证据浮框；点击「调整此月」→ 调整表单。 */
const openAdjustForm = (monthKey = '2027-03'): void => {
  fireEvent.mouseOver(monthHit(monthKey));
  const adjust = document.querySelector('[data-lpl-evidence-adjust]');
  expect(adjust, `证据浮框「调整此月」入口存在（${monthKey}）`).not.toBeNull();
  fireEvent.click(adjust as Element);
};

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

  it('预测季基线读数：2026Q4 109.9 · 2027Q1 105.0 · 2027Q2 102.1 · 2027Q3 99.2 · 2027Q4 105.8（与主链 marketQuarters 同源同值）', () => {
    setup();
    const text = document.body.textContent ?? '';
    expect(text).toContain('AI 预测季基线');
    expect(text).toContain('2026Q4 109.9');
    expect(text).toContain('2027Q1 105.0');
    expect(text).toContain('2027Q2 102.1');
    expect(text).toContain('2027Q3 99.2');
    expect(text).toContain('2027Q4 105.8');
  });

  it('月线生效值即时反映事件乘子：2027-01 含月事件（29 日起 +8% × 3/31）→ 当前 105.8 ≠ 基线 105.0', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT] } });
    const hit = monthHit('2027-01');
    expect(hit.getAttribute('aria-label')).toContain('当前 105.8');
    expect(hit.getAttribute('aria-label')).toContain('AI 基线 105.0');
  });

  it('卡头输入/输出条：输入「月度指数 · 行业事件（月中按日均摊）」→ 输出「主图周销基准」；模拟标识保留', () => {
    setup();
    const text = document.body.textContent ?? '';
    expect(text).toContain('输入');
    expect(text).toContain('月度指数 · 行业事件（月中按日均摊）');
    expect(text).toContain('输出');
    expect(text).toContain('主图周销基准');
    expect(screen.getAllByText('模拟').length).toBeGreaterThan(0);
  });
});

describe('大盘卡 · v2-1：hover 证据浮框（四层）与一层化调整两态', () => {
  it('hover 预测月 → 证据浮框出现（evidence 态）：头部层 = 月名 + AI 基线/生效', () => {
    setup();
    fireEvent.mouseOver(monthHit('2027-02'));
    const popover = document.querySelector('[data-lpl-month-popover][data-popover-mode="evidence"]');
    expect(popover).not.toBeNull();
    expect((popover as HTMLElement).getAttribute('role')).toBe('dialog');
    expect((popover as HTMLElement).textContent ?? '').toContain('2027-02 · 预测月');
    expect((popover as HTMLElement).textContent ?? '').toContain('AI 基线 104.4 · 生效 104.4');
  });

  it('趋势层：读数「近 6 个月环比 −0.7%/月」（模型 marketTrendWindow 同源）+ sparkline（实线 6 点 + 基线虚线延伸）', () => {
    setup();
    fireEvent.mouseOver(monthHit('2027-02'));
    const readout = document.querySelector('[data-lpl-evidence-trend-readout]');
    expect(readout?.textContent).toBe('趋势 · 近 6 个月环比 −0.7%/月');
    const spark = document.querySelector('svg[data-lpl-evidence-sparkline]');
    expect(spark).not.toBeNull();
    // 近 6 个月实线（1 条）+ 基线虚线延伸（1 条）
    expect(spark?.querySelectorAll('polyline')).toHaveLength(2);
    expect((spark as SVGSVGElement).textContent ?? '').toContain('2026-05');
    expect((spark as SVGSVGElement).textContent ?? '').toContain('2026-10');
    expect((spark as SVGSVGElement).textContent ?? '').toContain('2027-02');
  });

  it('月形层：去年同季三根小柱（2027-02 高亮去年 2 月）+ 构成算例「105.0 × 99.44% ≈ 104.4」（算例与模型同源）', () => {
    setup();
    fireEvent.mouseOver(monthHit('2027-02'));
    const shape = document.querySelector('[data-lpl-evidence-shape]');
    expect(shape).not.toBeNull();
    const bars = shape?.querySelectorAll('[data-lpl-shape-bar]');
    expect(bars).toHaveLength(3);
    const highlighted = shape?.querySelector('[data-lpl-shape-bar="2026-02"][data-lpl-shape-highlighted]');
    expect(highlighted, '本月（2 月位）去年同柱高亮').not.toBeNull();
    expect(shape?.textContent ?? '').toContain('1 月 100.00%');
    expect(shape?.textContent ?? '').toContain('2 月 99.44%');
    expect(shape?.textContent ?? '').toContain('3 月 100.56%');
    expect((shape?.textContent ?? '')).toContain('105.0 × 99.44% ≈ 104.4');
  });

  it('无事件/无手调月无复算提示行；含事件月（2027-01）顶部复算提示「含事件 +0.8%（均摊 3/31 天）」且算例含乘子', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT] } });
    fireEvent.mouseOver(monthHit('2027-02'));
    expect(document.querySelector('[data-lpl-evidence-recalc]')).toBeNull();
    fireEvent.mouseOver(monthHit('2027-01'));
    const notice = document.querySelector('[data-lpl-evidence-recalc]');
    expect(notice?.textContent).toContain('含事件 +0.8%（均摊 3/31 天）');
    const shape = document.querySelector('[data-lpl-evidence-shape]');
    expect(shape?.textContent ?? '').toContain('105.0 × 100.00% × 100.8% ≈ 105.8');
  });

  it('键盘可达：Tab 聚焦 + Enter 触发同一证据浮框（月列 role=button）', () => {
    setup();
    const hit = monthHit('2027-03');
    expect(hit.getAttribute('role')).toBe('button');
    fireEvent.keyDown(hit, { key: 'Enter' });
    expect(document.querySelector('[data-lpl-month-popover][data-popover-mode="evidence"]')).not.toBeNull();
  });

  it('「调整此月」就地切换调整表单（同一浮层两态）；取消回证据态；关闭按钮可退出', () => {
    setup();
    fireEvent.mouseOver(monthHit('2027-03'));
    fireEvent.click(document.querySelector('[data-lpl-evidence-adjust]') as Element);
    const adjustPopover = document.querySelector('[data-lpl-month-popover][data-popover-mode="adjust"]');
    expect(adjustPopover).not.toBeNull();
    expect(screen.getByLabelText('调整后指数')).toBeTruthy();
    // 取消 = 回证据态（一层化，不再分开两层浮层）
    const cancel = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '取消');
    fireEvent.click(cancel as HTMLButtonElement);
    expect(document.querySelector('[data-lpl-month-popover][data-popover-mode="evidence"]')).not.toBeNull();
    // 关闭按钮退出
    fireEvent.click(screen.getByLabelText('关闭 2027-03 证据浮框'));
    expect(document.querySelector('[data-lpl-month-popover]')).toBeNull();
  });

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

  it('已调整月 = 轻量标记（实心蓝点 data-adjusted）；含手调证据复算提示；调整态「还原 AI」→ onMonthOverride(key, null, \'\')', () => {
    const { onMonthOverride } = setup({
      overrides: { marketMonthOverrides: { '2027-03': { value: 88, reason: '竞品延期' } } },
    });
    const dot = document.querySelector('circle[data-adjusted="2027-03"]');
    expect(dot).not.toBeNull();
    // 含手调月证据态有复算提示（含手调（原因））
    fireEvent.mouseOver(monthHit('2027-03'));
    expect(document.querySelector('[data-lpl-evidence-recalc]')?.textContent).toContain('含手调（竞品延期）');
    // 就地切换调整态 → 还原 AI
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
    // 跨卡动作（任务 6 接线：回主图 / 检查库存）
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

describe('大盘卡 · 任务三：月中事件均摊与三字段录入 / 行内编辑（B.5.6）', () => {
  it('月度事件（2027-01-29 起）显式声明均摊口径：列表与图上标记均含「首月覆盖 3/31 天」', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT] } });
    const text = document.body.textContent ?? '';
    expect(text).toContain('2027-01-29 起 · 1 个月 · +8% · 首月覆盖 3/31 天');
    const mark = document.querySelector('[data-month-event-id="me-fold"]');
    expect(mark?.getAttribute('data-start-month')).toBe('2027-01');
    expect((mark as Element).querySelector('title')?.textContent ?? '').toContain('首月覆盖 3/31 天');
  });

  it('添加表单三字段 + 名称选填：空名称即可添加（默认 2026-11 / 1 日 / 1 个月 / +5%）', () => {
    const { onMonthEventAdd } = setup();
    const opener = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes('添加事件'));
    fireEvent.click(opener as HTMLButtonElement);
    // 三字段入口齐全：起始月 / 起始日 / 时长（月）/ 幅度；名称标注选填
    // （antd Select 会在镜像节点复制 aria-label，用 getAllByLabelText 取首个）
    expect(screen.getAllByLabelText('事件起始月').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('事件起始日（1–31）')).toBeTruthy();
    expect(screen.getByLabelText('事件时长（月）')).toBeTruthy();
    expect(screen.getByLabelText('事件影响幅度（%）')).toBeTruthy();
    expect(screen.getByLabelText('事件名称（选填）')).toBeTruthy();
    const submit = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '添加事件');
    expect(submit?.disabled).toBe(false);
    fireEvent.click(submit as HTMLButtonElement);
    expect(onMonthEventAdd).toHaveBeenCalledWith({
      label: '',
      startMonth: '2026-11',
      startDay: 1,
      durationMonths: 1,
      magnitudePct: 5,
    });
  });

  it('事件名称选填不被拦截：卡片列表空名称显示「未命名事件」；删除回调带 id', () => {
    const { onMonthEventRemove } = setup({
      overrides: { marketMonthEvents: [{ id: 'me-x', label: '', startMonth: '2026-12', startDay: 15, durationMonths: 2, magnitudePct: -6 }] },
    });
    const text = document.body.textContent ?? '';
    expect(text).toContain('未命名事件');
    expect(text).toContain('2026-12-15 起 · 2 个月 · −6%');
    fireEvent.click(screen.getByRole('button', { name: '删除事件 未命名事件' }));
    expect(onMonthEventRemove).toHaveBeenCalledWith('me-x');
  });

  it('行内「编辑」（B.5.6）：同一三字段编辑器预填当前值，改幅度后「保存修改」→ onMonthEventUpdate(id, next)', () => {
    const onMonthEventUpdate = vi.fn();
    setup({
      overrides: { marketMonthEvents: [{ id: 'me-x', label: '内存涨价', startMonth: '2026-12', startDay: 15, durationMonths: 2, magnitudePct: -6 }] },
      onMonthEventUpdate,
    });
    fireEvent.click(screen.getByRole('button', { name: '编辑事件 内存涨价' }));
    // 预填：名称与幅度同当前值
    expect((screen.getByLabelText('事件名称（选填）') as HTMLInputElement).value).toBe('内存涨价');
    expect((screen.getByLabelText('事件影响幅度（%）') as HTMLInputElement).value).toContain('-6');
    // 改幅度 → 保存修改 → 回调带 id 与三字段
    fireEvent.change(screen.getByLabelText('事件影响幅度（%）'), { target: { value: '-9' } });
    const submit = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '保存修改');
    expect(submit).toBeTruthy();
    fireEvent.click(submit as HTMLButtonElement);
    expect(onMonthEventUpdate).toHaveBeenCalledWith('me-x', {
      label: '内存涨价',
      startMonth: '2026-12',
      startDay: 15,
      durationMonths: 2,
      magnitudePct: -9,
    });
  });
});

describe('大盘卡 · 任务四：事件区右 1/3 两块', () => {
  it('卡内布局 = 图表左 2/3 + 事件区右 1/3；卡体定高 330（2026-11-04 视觉一致性）；右栏卡内纵向滚动兜底', () => {
    setup();
    const marketSection = Array.from(document.querySelectorAll('section'))
      .find((section) => section.querySelector('h2')?.textContent?.includes('大盘'));
    expect(marketSection).toBeTruthy();
    const bodyGrid = marketSection?.querySelector(':scope > div.lpl-card-scroll') as HTMLElement | null;
    expect(bodyGrid).toBeTruthy();
    expect(bodyGrid?.style.height).toBe('330px');
    expect(bodyGrid?.style.gridTemplateColumns).toBe('minmax(0, 2fr) minmax(0, 1fr)');
    const rightCol = bodyGrid?.children[1] as HTMLElement | undefined;
    expect(rightCol?.className).toContain('lpl-card-scroll');
    expect(rightCol?.style.overflowY).toBe('auto');
    // 左图 SVG 宽度 100%（viewBox 760 与左栏实际宽 ≈1:1，无 letterbox）；高度随宽度等比（不再定高 100%）
    const svg = document.querySelector('svg[role="img"]') as SVGSVGElement | null;
    expect(svg?.getAttribute('width')).toBe('100%');
    expect(svg?.getAttribute('height')).toBeNull();
    expect(svg?.getAttribute('preserveAspectRatio')).toBeNull();
  });

  it('上块情报候选空态（B.5.6 / 3.3-A）：「候选生成能力待接入」+ 禁用按钮；不画占位候选行', () => {
    setup();
    const text = document.body.textContent ?? '';
    expect(text).toContain('情报候选 · 待审核');
    expect(text).toContain('候选生成能力待接入');
    // 不再画五条假候选：空态区无勾选框、无「候选事件位」占位行
    expect(document.body.textContent ?? '').not.toContain('候选事件位');
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    // 候选入口按钮禁用（能力待接入）
    const trigger = Array.from(document.querySelectorAll('button')).find((button) =>
      (button.getAttribute('title') ?? '').includes('候选生成能力待接入'));
    expect(trigger?.disabled).toBe(true);
  });

  it('周口径行业事件（人工录入假设）以轴下次要标记呈现（不占主视觉），带 hover 详情', () => {
    setup({ overrides: { marketEvents: [FOLD_WEEK_EVENT] } });
    const mark = document.querySelector('[data-week-event-id="ev-fold"]');
    expect(mark).not.toBeNull();
    expect((mark as Element).querySelector('title')?.textContent ?? '').toContain('折叠屏阵营扩容');
    expect((mark as Element).querySelector('title')?.textContent ?? '').toContain('2026W46–2026W50');
  });
});

describe('大盘卡 · 图例显隐与空态', () => {
  it('图例三项可切换；有月事件时 AI 基线 ghost 显示，隐藏图例只影响 ghost 不影响生效线', () => {
    setup({ overrides: { marketMonthEvents: [FOLD_MONTH_EVENT] } });
    const svg = document.querySelector('svg[role="img"]');
    expect(svg?.querySelector('[data-series="ai-ghost"]')).not.toBeNull();
    const legendButton = (labelPart: string): HTMLButtonElement | undefined =>
      Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes(labelPart));
    for (const label of ['实际（月度）', '预测 · 统一 12 个月逐月', 'AI 基线']) {
      expect(legendButton(label)?.getAttribute('aria-pressed')).toBe('true');
    }
    const aiLegend = legendButton('AI 基线');
    fireEvent.click(aiLegend as HTMLButtonElement);
    expect(aiLegend?.getAttribute('aria-pressed')).toBe('false');
    expect((aiLegend as HTMLButtonElement).style.opacity).toBe('0.45');
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
