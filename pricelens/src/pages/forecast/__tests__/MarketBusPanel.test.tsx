// ============================================================
// 大盘卡（MarketBusPanel）组件测试（jsdom）：
// 事件锚点季度落位（quarterKeyOfWeek，禁止按数组比例猜季度）、事件三态文案
// （历史解释 / 本季生效 / 不在预测窗口）、2027Q1 同比 = −13.3%（vs 2026Q1，
// 卡头与图内单口径）、卡头输入/输出条、图例真实显隐（AI 基线只影响对照点）、
// tokens 与无数据空态。
// 只验证 React 组装与交互开关，不验证图表像素（SVG 由 typecheck 保证结构）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

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

function setup(overrides: Partial<WorkbenchParams> = {}): { onOverride: ReturnType<typeof vi.fn> } {
  const params: WorkbenchParams = { ...baseWorkbenchParams(workbenchFixture), ...overrides };
  const result: WorkbenchResult = computeWorkbench(workbenchFixture, params);
  const onOverride = vi.fn();
  render(
    <MarketBusPanel
      fixture={workbenchFixture}
      params={params}
      result={result}
      onOverride={onOverride}
      onEventStep={vi.fn()}
      onEventDecay={vi.fn()}
      onEventRemove={vi.fn()}
      onEventAdd={vi.fn()}
      onRationaleChange={vi.fn()}
    />,
  );
  return { onOverride };
}

describe('大盘卡 · 事件锚点与三态', () => {
  it('W46/W50 事件锚点落在 2026Q4（从周日期推导，不按数组比例猜）', () => {
    setup();
    for (const id of ['ev-fold', 'ev-mem']) {
      const anchor = document.querySelector(`[data-event-id="${id}"]`);
      expect(anchor, `事件 ${id} 锚点存在`).not.toBeNull();
      expect(anchor?.getAttribute('data-quarter')).toBe('2026Q4');
    }
  });

  it('两条默认事件（W46 起 / W50 起）均显示「本季生效」', () => {
    setup();
    const text = document.body.textContent ?? '';
    const activeCount = text.split('本季生效').length - 1;
    expect(activeCount).toBeGreaterThanOrEqual(2);
    // 旧的双口径 / 比例映射文案移除。
    expect(text).not.toContain('作用于本季预测');
    expect(text).not.toContain('历史段解释标记');
    expect(text).not.toContain('不在本季窗口');
  });

  it('事件三态：历史段 →「历史解释」，覆盖预测窗 →「本季生效」，晚于预测窗 →「不在预测窗口」', () => {
    setup({
      marketEvents: [
        { id: 'ev-hist', label: '历史事件甲', startWeek: 42, durationWeeks: 2, magnitudePct: 6, decay: 'decreasing' },
        { id: 'ev-act', label: '生效事件乙', startWeek: 46, durationWeeks: 4, magnitudePct: 5, decay: 'flat' },
        { id: 'ev-late', label: '超窗事件丙', startWeek: 53, durationWeeks: 2, magnitudePct: -4, decay: 'decreasing' },
      ],
    });
    const text = document.body.textContent ?? '';
    expect(text).toContain('历史解释');
    expect(text).toContain('本季生效');
    expect(text).toContain('不在预测窗口');
    // 历史事件锚点挂「历史解释」标注（data-disposition）。
    expect(document.querySelector('[data-event-id="ev-hist"]')?.getAttribute('data-disposition')).toBe('historical');
  });
});

describe('大盘卡 · 同比与卡头', () => {
  it('2027Q1 同比与 2026Q1 比较：卡头与图内共用口径，显示 −13.3%', () => {
    setup();
    const text = document.body.textContent ?? '';
    // 93.6（AI 基线 2027Q1）/ 108（2026Q1）− 1 ≈ −13.3%。
    expect(text).toContain('−13.3%');
    // 不再出现 vs 2025Q1 的旧口径。
    expect(text).not.toContain('同比 2025Q1');
  });

  it('卡头存在输入/输出条：输入「季度指数 · 行业事件」→ 输出「主图周销基准」', () => {
    setup();
    const text = document.body.textContent ?? '';
    expect(text).toContain('输入');
    expect(text).toContain('季度指数 · 行业事件');
    expect(text).toContain('输出');
    expect(text).toContain('主图周销基准');
  });
});

describe('大盘卡 · 图例显隐', () => {
  it('三个图例带 key 与 aria-pressed；隐藏 AI 基线只影响 ghost 对照点，不影响生效值', () => {
    setup({ q4Override: 110 }); // 人工改格后 AI 基线对照点出现
    const svg = document.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    const legendButton = (labelPart: string): HTMLButtonElement | undefined =>
      Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes(labelPart));

    // 初始：实际 / 推演 / AI 基线三线齐全，图例 aria-pressed = true。
    expect(svg?.querySelector('[data-series="actual"]')).not.toBeNull();
    expect(svg?.querySelector('[data-series="forecast"]')).not.toBeNull();
    expect(svg?.querySelector('[data-series="forecast-value"]')).not.toBeNull();
    expect(svg?.querySelector('[data-series="ai-ghost"]')).not.toBeNull();
    for (const label of ['实际', '当前推演', 'AI 基线']) {
      expect(legendButton(label)?.getAttribute('aria-pressed')).toBe('true');
    }

    // 隐藏 AI 基线：ghost 消失、生效值仍在，隐藏态 opacity .45。
    const aiLegend = legendButton('AI 基线');
    expect(aiLegend).toBeTruthy();
    fireEvent.click(aiLegend as HTMLButtonElement);
    expect(aiLegend?.getAttribute('aria-pressed')).toBe('false');
    expect((aiLegend as HTMLButtonElement).style.opacity).toBe('0.45');
    expect(svg?.querySelector('[data-series="ai-ghost"]')).toBeNull();
    expect(svg?.querySelector('[data-series="forecast-value"]')).not.toBeNull();

    // 隐藏实际线后再恢复 AI 基线。
    const actualLegend = legendButton('实际');
    fireEvent.click(actualLegend as HTMLButtonElement);
    expect(svg?.querySelector('[data-series="actual"]')).toBeNull();
    fireEvent.click(aiLegend as HTMLButtonElement);
    expect(svg?.querySelector('[data-series="ai-ghost"]')).not.toBeNull();
  });
});

describe('大盘卡 · 事件步进可用性', () => {
  it('步进按钮按边界启用：界内可用，到下界 − 禁用、到上界 ＋ 禁用', () => {
    const buttonByAria = (aria: string): HTMLButtonElement | null =>
      Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === aria) ?? null;
    // 默认事件 W46 / 5 周 / +8%：全部界内，步进均可用（回归：此前恒被禁用）。
    setup();
    for (const aria of ['提前 折叠屏阵营扩容 起始周', '推后 折叠屏阵营扩容 起始周', '缩短 折叠屏阵营扩容 影响时长', '延长 折叠屏阵营扩容 影响时长', '减弱 折叠屏阵营扩容 峰值幅度', '增强 折叠屏阵营扩容 峰值幅度']) {
      const button = buttonByAria(aria);
      expect(button, `按钮 ${aria} 存在`).not.toBeNull();
      expect(button?.disabled, `按钮 ${aria} 界内应可用`).toBe(false);
    }
    // 边界：W38 到下界 → 提前禁用；W52 到上界 → 推后禁用；时长 1 / 幅度 −30 同理。
    cleanup();
    setup({
      marketEvents: [
        { id: 'ev-lo', label: '下界事件', startWeek: 38, durationWeeks: 1, magnitudePct: -30, decay: 'decreasing' },
        { id: 'ev-hi', label: '上界事件', startWeek: 52, durationWeeks: 8, magnitudePct: 30, decay: 'flat' },
      ],
    });
    expect(buttonByAria('提前 下界事件 起始周')?.disabled).toBe(true);
    expect(buttonByAria('推后 下界事件 起始周')?.disabled).toBe(false);
    expect(buttonByAria('缩短 下界事件 影响时长')?.disabled).toBe(true);
    expect(buttonByAria('减弱 下界事件 峰值幅度')?.disabled).toBe(true);
    expect(buttonByAria('增强 下界事件 峰值幅度')?.disabled).toBe(false);
    expect(buttonByAria('推后 上界事件 起始周')?.disabled).toBe(true);
    expect(buttonByAria('延长 上界事件 影响时长')?.disabled).toBe(true);
    expect(buttonByAria('增强 上界事件 峰值幅度')?.disabled).toBe(true);
    expect(buttonByAria('减弱 上界事件 峰值幅度')?.disabled).toBe(false);
  });
});

describe('大盘卡 · 生产话术与空态', () => {
  it('移除教学词（四件套 / 开天辟地 / ghost / 第一版 / 圆桌会议截图腔）', () => {
    setup();
    // 理由栏预填值来自 fixture.market.aiRationale（数据层文案归 WP6 集成阶段清理，
    // 组件不可改 fixture、也不得截断受控值），教学词扫描只针对组件 UI 层话术。
    // rc-textarea 含隐藏 sizer textarea（DOM 顺序不稳定），克隆 body 移除全部 textarea
    // 后再扫描，保证只验证组件 UI 层话术。
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('textarea').forEach((ta) => ta.remove());
    const text = clone.textContent ?? '';
    for (const banned of ['四件套', '开天辟地', 'ghost', '第一版', '圆桌会议', '截图贴 PPT']) {
      expect(text).not.toContain(banned);
    }
  });

  it('人工改格后「还原 AI」回调 onOverride(field, null)', () => {
    const { onOverride } = setup({ q4Override: 110 });
    const restore = Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').replace(/\s/g, '') === '还原AI');
    expect(restore).toBeTruthy();
    fireEvent.click(restore as HTMLButtonElement);
    expect(onOverride).toHaveBeenCalledWith('q4', null);
  });

  it('无季度数据时不渲染 NaN SVG，显示「当前范围无大盘数据」', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    const result: WorkbenchResult = { ...computeWorkbench(workbenchFixture, params), marketQuarters: [] };
    render(
      <MarketBusPanel
        fixture={workbenchFixture}
        params={params}
        result={result}
        onOverride={vi.fn()}
        onEventStep={vi.fn()}
        onEventDecay={vi.fn()}
        onEventRemove={vi.fn()}
        onEventAdd={vi.fn()}
        onRationaleChange={vi.fn()}
      />,
    );
    expect(document.querySelector('svg')).toBeNull();
    expect(document.body.textContent).toContain('当前范围无大盘数据');
  });
});
