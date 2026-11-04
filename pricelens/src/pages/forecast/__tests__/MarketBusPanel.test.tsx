// ============================================================
// 大盘卡（MarketBusPanel）组件测试（jsdom · 2026-11-04 证据信任 v2 版）：
// 任务一 = 历史 21 个月实线 + 未来 4 季度逐月预测虚线（2026-10–2027-09），
//   四季度 AI 基线读数（101.3 / 93.6 / 85.7 / 78.4）与月线生效值（含事件乘子）；
//   X 轴月标签 = 全站月视图日历格式 YYYY-MM（无 25-01 缩写式）；「今天」文字
//   标签已删（分界虚线保留）；
// 任务二（v2-1）= hover/Tab+Enter 预测月 → 证据浮框四层（头部 基线/生效、
//   趋势行 近 6 个月环比 −0.5%/月 + sparkline、月形行 去年同季三柱 + 算例、
//   底部「调整此月」）；「调整此月」就地切换既有调整表单（一层化两态，
//   原因选填不拦截），已调整月轻量标记（实心蓝点 data-adjusted），
//   还原 AI = onMonthOverride(key, null, '')；
// 任务二（v2-2）= 双锚点：hover 月同时趋势源段衬带（data-anchor="trend-band"，
//   窗口 = 模型 marketTrendWindow 同源）+ 去年同位圆环（data-anchor=
//   "last-year-ring"）+ 其余线段降不透明（data-dim）+ hover 月加重点；
//   移开即恢复（mouseOut 后全部消失，零常驻元素）；
// 任务二（v2-3）= 卡头「AI 推测 · 可改」徽章 hover/点击 → 三步链浮层
//   （样本 → 两个规律 → 外推，含算例，数字与模型同源），零新增常驻元素；
// 任务三 = 月中事件均摊口径可见（含事件月浮框复算提示「含事件 +0.8%
//   （均摊 3/31 天）」）+ 三字段录入（名称选填）+ 删除回调；
// 任务四 = 事件区右 1/3 两块（AI 候选事件 Top5 占位 + 人工事件列表）；
//   事件在图上 = 轴下次要标记（不占主视觉）；卡体定高 420 延续 A2 策略。
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

import { workbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, type WorkbenchParams, type WorkbenchResult } from '../workbenchModel';
import MarketBusPanel from '../MarketBusPanel';

afterEach(cleanup);

function setup(overrides: Partial<WorkbenchParams> = {}): {
  onMonthOverride: ReturnType<typeof vi.fn>;
  onMonthEventAdd: ReturnType<typeof vi.fn>;
  onMonthEventRemove: ReturnType<typeof vi.fn>;
} {
  const params: WorkbenchParams = { ...baseWorkbenchParams(workbenchFixture), ...overrides };
  const result: WorkbenchResult = computeWorkbench(workbenchFixture, params);
  const onMonthOverride = vi.fn();
  const onMonthEventAdd = vi.fn();
  const onMonthEventRemove = vi.fn();
  render(
    <MarketBusPanel
      fixture={workbenchFixture}
      params={params}
      result={result}
      onMonthOverride={onMonthOverride}
      onMonthEventAdd={onMonthEventAdd}
      onMonthEventRemove={onMonthEventRemove}
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

describe('大盘卡 · 任务一：4 季度月线（月粒度主序列 + 轴清洁）', () => {
  it('历史 21 个月实线 + 未来 4 季度逐月预测 12 个月（2026-10 起，2027-09 止），交互列只挂预测月', () => {
    setup();
    const svg = document.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('[data-series="actual"]')).not.toBeNull();
    expect(svg?.querySelector('[data-series="forecast"]')).not.toBeNull();
    const hitMonths = Array.from(document.querySelectorAll('rect[data-month]')).map((rect) => rect.getAttribute('data-month'));
    expect(hitMonths).toHaveLength(12);
    expect(hitMonths[0]).toBe('2026-10');
    expect(hitMonths[hitMonths.length - 1]).toBe('2027-09');
    // 历史月不可调整（无交互列）
    expect(hitMonths).not.toContain('2026-08');
    expect(hitMonths).not.toContain('2025-01');
  });

  it('X 轴月标签 = 全站月视图日历格式 YYYY-MM（如 2025-01 / 2027-01，弃用 25-01 缩写式）', () => {
    setup();
    const svg = document.querySelector('svg[role="img"]');
    const labels = Array.from(svg?.querySelectorAll('text') ?? []).map((text) => text.textContent ?? '');
    // 季度首月刻度出全格式日历标签（与价格走势/量价月视图悬停、明细同一口径）
    for (const key of ['2025-01', '2025-04', '2025-07', '2025-10', '2026-01', '2026-04', '2026-07', '2026-10', '2027-01', '2027-04', '2027-07']) {
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

  it('四季度 AI 基线读数：2026Q4 101.3 · 2027Q1 93.6 · 2027Q2 85.7 · 2027Q3 78.4（与主链 aiQ4/aiQ1 同源同值）', () => {
    setup();
    const text = document.body.textContent ?? '';
    expect(text).toContain('AI 四季度基线');
    expect(text).toContain('2026Q4 101.3');
    expect(text).toContain('2027Q1 93.6');
    expect(text).toContain('2027Q2 85.7');
    expect(text).toContain('2027Q3 78.4');
  });

  it('月线生效值即时反映事件乘子：2027-01 含默认月度事件（29 日起 +8% × 3/31）→ 当前 94.0 ≠ 基线 93.3', () => {
    setup();
    const hit = monthHit('2027-01');
    expect(hit.getAttribute('aria-label')).toContain('当前 94.0');
    expect(hit.getAttribute('aria-label')).toContain('AI 基线 93.3');
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
    expect((popover as HTMLElement).textContent ?? '').toContain('AI 基线 93.9 · 生效 93.9');
  });

  it('趋势层：读数「近 6 个月环比 −0.5%/月」（模型 marketTrendWindow 同源）+ sparkline（实线 6 点 + 基线虚线延伸）', () => {
    setup();
    fireEvent.mouseOver(monthHit('2027-02'));
    const readout = document.querySelector('[data-lpl-evidence-trend-readout]');
    expect(readout?.textContent).toBe('趋势 · 近 6 个月环比 −0.5%/月');
    const spark = document.querySelector('svg[data-lpl-evidence-sparkline]');
    expect(spark).not.toBeNull();
    // 近 6 个月实线（1 条）+ 基线虚线延伸（1 条）
    expect(spark?.querySelectorAll('polyline')).toHaveLength(2);
    expect((spark as SVGSVGElement).textContent ?? '').toContain('2026-04');
    expect((spark as SVGSVGElement).textContent ?? '').toContain('2026-09');
    expect((spark as SVGSVGElement).textContent ?? '').toContain('2027-02');
  });

  it('月形层：去年同季三根小柱（2027-02 高亮去年 2 月）+ 构成算例「93.6 × 100.37% ≈ 93.9」（算例与模型同源）', () => {
    setup();
    fireEvent.mouseOver(monthHit('2027-02'));
    const shape = document.querySelector('[data-lpl-evidence-shape]');
    expect(shape).not.toBeNull();
    const bars = shape?.querySelectorAll('[data-lpl-shape-bar]');
    expect(bars).toHaveLength(3);
    const highlighted = shape?.querySelector('[data-lpl-shape-bar="2026-02"][data-lpl-shape-highlighted]');
    expect(highlighted, '本月（2 月位）去年同柱高亮').not.toBeNull();
    expect(shape?.textContent ?? '').toContain('1 月 99.63%');
    expect(shape?.textContent ?? '').toContain('2 月 100.37%');
    expect(shape?.textContent ?? '').toContain('3 月 100.00%');
    expect((shape?.textContent ?? '')).toContain('93.6 × 100.37% ≈ 93.9');
  });

  it('无事件/无手调月无复算提示行；含事件月（2027-01）顶部复算提示「含事件 +0.8%（均摊 3/31 天）」且算例含乘子', () => {
    setup();
    fireEvent.mouseOver(monthHit('2027-02'));
    expect(document.querySelector('[data-lpl-evidence-recalc]')).toBeNull();
    fireEvent.mouseOver(monthHit('2027-01'));
    const notice = document.querySelector('[data-lpl-evidence-recalc]');
    expect(notice?.textContent).toContain('含事件 +0.8%（均摊 3/31 天）');
    const shape = document.querySelector('[data-lpl-evidence-shape]');
    expect(shape?.textContent ?? '').toContain('93.6 × 99.63% × 100.8% ≈ 94.0');
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
    expect((popover as HTMLElement).textContent ?? '').toContain('AI 基线 93.6');
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    expect(apply?.disabled).toBe(false);
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 93.6, '');
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

  it('增减幅式：+10% → 回调值 = round1(生效 × 1.1) = 103', () => {
    const { onMonthOverride } = setup();
    openAdjustForm('2027-03');
    const pctMode = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '增减幅%');
    fireEvent.click(pctMode as HTMLButtonElement);
    const pctInput = screen.getByLabelText('增减幅（%）') as HTMLInputElement;
    fireEvent.change(pctInput, { target: { value: '10' } });
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 103, '');
  });

  it('已调整月 = 轻量标记（实心蓝点 data-adjusted）；含手调证据复算提示；调整态「还原 AI」→ onMonthOverride(key, null, \'\')', () => {
    const { onMonthOverride } = setup({
      marketMonthOverrides: { '2027-03': { value: 88, reason: '竞品延期' } },
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

describe('大盘卡 · v2-2：图上双锚点（hover 临时，移开即恢复）', () => {
  it('默认态零锚点零降透明（不新增常驻元素）', () => {
    setup();
    const svg = document.querySelector('svg[role="img"]');
    expect(svg?.querySelector('[data-anchor]')).toBeNull();
    expect(svg?.querySelector('[data-dim="true"]')).toBeNull();
    const actual = svg?.querySelector('[data-series="actual"]') as SVGPathElement | null;
    expect(actual?.getAttribute('opacity')).toBe('1');
  });

  it('hover 预测月 → 趋势源段衬带（近 6 个月实际段，窗口与模型同源）+ 去年同位圆环 + hover 月加重点 + 来源连线', () => {
    setup();
    fireEvent.mouseOver(monthHit('2027-02'));
    const svg = document.querySelector('svg[role="img"]');
    const band = svg?.querySelector('[data-anchor="trend-band"]');
    expect(band).not.toBeNull();
    expect(band?.getAttribute('data-anchor-window')).toBe('2026-04..2026-09');
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
    // 步 1 样本：21 个月历史段
    expect(steps?.[0].textContent ?? '').toContain('样本');
    expect(steps?.[0].textContent ?? '').toContain('2025-01 – 2026-09 · 21 个月大盘指数');
    // 步 2 两个规律：季节（2027Q1 去年同季月形）+ 趋势（近 6 个月环比均值 −0.5%/月，模型同源）
    expect(steps?.[1].textContent ?? '').toContain('两个规律');
    expect(steps?.[1].textContent ?? '').toContain('99.63% / 100.37% / 100.00%');
    expect(steps?.[1].textContent ?? '').toContain('近 6 个月（2026-04–2026-09）环比均值 −0.5%/月');
    // 步 3 外推：算例（2027Q1 基线 93.6 → 93.3 · 93.9 · 93.6，与 computeMarketMonths 同源）
    expect(steps?.[2].textContent ?? '').toContain('外推');
    expect(steps?.[2].textContent ?? '').toContain('例：2027Q1 基线 93.6 × 去年同季月形 → 93.3 · 93.9 · 93.6');
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

describe('大盘卡 · 任务三：月中事件均摊与三字段录入', () => {
  it('默认月度事件（2027-01-29 起）显式声明均摊口径：列表与图上标记均含「首月覆盖 3/31 天」', () => {
    setup();
    const text = document.body.textContent ?? '';
    expect(text).toContain('2027-01-29 起 · 1 个月 · +8% · 首月覆盖 3/31 天');
    const mark = document.querySelector('[data-month-event-id="ev-fold-m"]');
    expect(mark?.getAttribute('data-start-month')).toBe('2027-01');
    expect((mark as Element).querySelector('title')?.textContent ?? '').toContain('首月覆盖 3/31 天');
  });

  it('添加表单三字段 + 名称选填：空名称即可添加（默认 2026-10 / 1 日 / 1 个月 / +5%）', () => {
    const { onMonthEventAdd } = setup({ marketMonthEvents: [] });
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
      startMonth: '2026-10',
      startDay: 1,
      durationMonths: 1,
      magnitudePct: 5,
    });
  });

  it('事件名称选填不被拦截：卡片列表空名称显示「未命名事件」；删除回调带 id', () => {
    const { onMonthEventRemove } = setup({
      marketMonthEvents: [{ id: 'me-x', label: '', startMonth: '2026-12', startDay: 15, durationMonths: 2, magnitudePct: -6 }],
    });
    const text = document.body.textContent ?? '';
    expect(text).toContain('未命名事件');
    expect(text).toContain('2026-12-15 起 · 2 个月 · −6%');
    fireEvent.click(screen.getByRole('button', { name: '删除事件 未命名事件' }));
    expect(onMonthEventRemove).toHaveBeenCalledWith('me-x');
  });
});

describe('大盘卡 · 任务四：事件区右 1/3 两块', () => {
  it('卡内布局 = 图表左 2/3 + 事件区右 1/3；卡体定高 420 延续 A2；右栏卡内纵向滚动兜底', () => {
    setup();
    const marketSection = Array.from(document.querySelectorAll('section'))
      .find((section) => section.querySelector('h2')?.textContent?.includes('大盘'));
    expect(marketSection).toBeTruthy();
    const bodyGrid = marketSection?.querySelector(':scope > div.lpl-card-scroll') as HTMLElement | null;
    expect(bodyGrid).toBeTruthy();
    expect(bodyGrid?.style.height).toBe('420px');
    expect(bodyGrid?.style.gridTemplateColumns).toBe('minmax(0, 2fr) minmax(0, 1fr)');
    const rightCol = bodyGrid?.children[1] as HTMLElement | undefined;
    expect(rightCol?.className).toContain('lpl-card-scroll');
    expect(rightCol?.style.overflowY).toBe('auto');
    // 左图 SVG 填满剩余高度（viewBox 等比缩放）
    const svg = document.querySelector('svg[role="img"]') as SVGSVGElement | null;
    expect(svg?.getAttribute('height')).toBe('100%');
  });

  it('上块 AI 候选事件 Top5 占位：空态注明「候选生成能力待接入，抓取逻辑另议」；先列后删骨架全禁用（不接数据）', () => {
    setup();
    const text = document.body.textContent ?? '';
    expect(text).toContain('AI 候选事件 Top5');
    expect(text).toContain('候选生成能力待接入，抓取逻辑另议');
    // 5 行禁用态示意：勾选框与删除按钮全部 disabled
    const popoverArea = Array.from(document.querySelectorAll('div')).find((node) => (node.getAttribute('aria-label') ?? '').includes('AI 候选事件占位列表'));
    expect(popoverArea).toBeTruthy();
    const checkboxes = Array.from(popoverArea?.querySelectorAll('input[type="checkbox"]') ?? []);
    expect(checkboxes).toHaveLength(5);
    expect(checkboxes.every((checkbox) => (checkbox as HTMLInputElement).disabled)).toBe(true);
    const deleteButtons = Array.from(popoverArea?.querySelectorAll('button') ?? []);
    expect(deleteButtons).toHaveLength(5);
    expect(deleteButtons.every((button) => button.disabled)).toBe(true);
    // 弹出入口同样禁用（能力待接入）
    const trigger = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').trim() === '弹出候选');
    expect(trigger?.disabled).toBe(true);
  });

  it('周口径默认事件（主链生效中）以轴下次要标记呈现（不占主视觉），带 hover 详情', () => {
    setup();
    const mark = document.querySelector('[data-week-event-id="ev-fold"]');
    expect(mark).not.toBeNull();
    expect((mark as Element).querySelector('title')?.textContent ?? '').toContain('折叠屏阵营扩容');
    expect((mark as Element).querySelector('title')?.textContent ?? '').toContain('W46–W50');
  });
});

describe('大盘卡 · 图例显隐与空态', () => {
  it('图例三项可切换；默认月度事件存在时 AI 基线 ghost 显示，隐藏图例只影响 ghost 不影响生效线', () => {
    setup();
    const svg = document.querySelector('svg[role="img"]');
    expect(svg?.querySelector('[data-series="ai-ghost"]')).not.toBeNull();
    const legendButton = (labelPart: string): HTMLButtonElement | undefined =>
      Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes(labelPart));
    for (const label of ['实际（月度）', '预测 · 未来 4 季逐月', 'AI 基线']) {
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
    setup({ marketMonthEvents: [] });
    expect(document.querySelector('svg[role="img"]')?.querySelector('[data-series="ai-ghost"]')).toBeNull();
  });

  it('无月度数据时不渲染 NaN SVG，显示「当前范围无大盘数据」', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    const result: WorkbenchResult = { ...computeWorkbench(workbenchFixture, params), marketMonths: [] };
    render(
      <MarketBusPanel
        fixture={workbenchFixture}
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
