// ============================================================
// 大盘卡（MarketBusPanel）组件测试（jsdom · 2026-11-04 月粒度重构版）：
// 任务一 = 历史 21 个月实线 + 未来 4 季度逐月预测虚线（2026-10–2027-09），
//   四季度 AI 基线读数（101.3 / 93.6 / 85.7 / 78.4）与月线生效值（含事件乘子）；
// 任务二 = 点击预测月就地浮层（调整后指数 / 增减幅两式），原因选填不拦截
//   （空原因照常应用），已调整月轻量标记（实心蓝点 data-adjusted），
//   还原 AI = onMonthOverride(key, null, '')（复用会话草稿机制）；
// 任务三 = 月中事件均摊口径可见（首月覆盖 3/31 天显式声明）+ 三字段录入
//   （名称选填）+ 删除回调；
// 任务四 = 事件区右 1/3 两块（AI 候选事件 Top5 占位：空态注明「候选生成能力
//   待接入，抓取逻辑另议」+ 先列后删禁用态骨架；人工事件列表）；事件在图上
//   = 轴下次要标记（不占主视觉）；卡体定高 420 延续 A2 策略。
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

describe('大盘卡 · 任务一：4 季度月线（月粒度主序列）', () => {
  it('历史 21 个月实线 + 未来 4 季度逐月预测 12 个月（2026-10 起，2027-09 止），点击列只挂预测月', () => {
    setup();
    const svg = document.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('[data-series="actual"]')).not.toBeNull();
    expect(svg?.querySelector('[data-series="forecast"]')).not.toBeNull();
    const hitMonths = Array.from(document.querySelectorAll('rect[data-month]')).map((rect) => rect.getAttribute('data-month'));
    expect(hitMonths).toHaveLength(12);
    expect(hitMonths[0]).toBe('2026-10');
    expect(hitMonths[hitMonths.length - 1]).toBe('2027-09');
    // 历史月不可调整（无点击列）
    expect(hitMonths).not.toContain('2026-08');
    expect(hitMonths).not.toContain('2025-01');
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
    const hit = document.querySelector('rect[data-month="2027-01"]');
    expect(hit?.getAttribute('aria-label')).toContain('当前 94.0');
    expect(hit?.getAttribute('aria-label')).toContain('AI 基线 93.3');
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

describe('大盘卡 · 任务二：点击月调整浮层（原因选填）', () => {
  const openPopover = (monthKey = '2027-03'): void => {
    const hit = document.querySelector(`rect[data-month="${monthKey}"]`);
    expect(hit, `预测月 ${monthKey} 点击列存在`).not.toBeNull();
    fireEvent.click(hit as Element);
  };

  it('点击预测月 → 就地浮层出现（含 AI 基线与生效值读数）；应用默认值回调 onMonthOverride(key, value, \'\')', () => {
    const { onMonthOverride } = setup();
    openPopover('2027-03');
    const popover = document.querySelector('[data-lpl-month-popover]');
    expect(popover).not.toBeNull();
    expect((popover as HTMLElement).getAttribute('role')).toBe('dialog');
    expect((popover as HTMLElement).textContent ?? '').toContain('AI 基线 93.6');
    // 原因选填：不填即可应用（默认值 = 当前生效值 93.6）
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    expect(apply?.disabled).toBe(false);
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 93.6, '');
    // 应用后浮层关闭
    expect(document.querySelector('[data-lpl-month-popover]')).toBeNull();
  });

  it('调整后指数式：改值 + 填原因 → 回调带调整值与原因；取消按钮存在可退出浮层', () => {
    const { onMonthOverride } = setup();
    openPopover('2027-03');
    const cancel = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '取消');
    expect(cancel).toBeTruthy();
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
    openPopover('2027-03');
    const pctMode = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '增减幅%');
    fireEvent.click(pctMode as HTMLButtonElement);
    const pctInput = screen.getByLabelText('增减幅（%）') as HTMLInputElement;
    fireEvent.change(pctInput, { target: { value: '10' } });
    const apply = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    fireEvent.click(apply as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', 103, '');
  });

  it('已调整月 = 轻量标记（实心蓝点 data-adjusted）；浮层出现「还原 AI」→ onMonthOverride(key, null, \'\')', () => {
    const { onMonthOverride } = setup({
      marketMonthOverrides: { '2027-03': { value: 88, reason: '竞品延期' } },
    });
    const dot = document.querySelector('circle[data-adjusted="2027-03"]');
    expect(dot).not.toBeNull();
    openPopover('2027-03');
    const restore = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '还原AI');
    expect(restore).toBeTruthy();
    fireEvent.click(restore as HTMLButtonElement);
    expect(onMonthOverride).toHaveBeenCalledWith('2027-03', null, '');
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
