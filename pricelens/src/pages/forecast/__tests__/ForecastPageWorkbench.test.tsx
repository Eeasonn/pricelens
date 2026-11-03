// ============================================================
// 量价预测 · 推演工作台 v2 页面集成冒烟（WP6 8.1–8.4，jsdom）：
// 入共享分析壳（单页头、无 FilterBar、全页唯一「量价预测」current）、
// 五卡齐全有序、范围行压缩 + 模拟标识分级（页首 DataStatusBadge + 各卡
// 轻量 SimChip）、上一代参照受控进主链（草稿按模型版本落 sessionStorage）、
// 微调→复制关键假设→切页往返草稿保留、禁词/旧话术总扫。
// 只验证 React 组装与交互开关，不验证图表像素（SVG 由 typecheck 保证结构）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), clear: vi.fn(), dispose: vi.fn() })),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, ScatterChart: {} }));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  MarkAreaComponent: {},
  MarkLineComponent: {},
  MarkPointComponent: {},
  DataZoomComponent: {},
  BrushComponent: {},
  VisualMapComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import App from '../../../App';

afterEach(cleanup);

const DRAFT_KEY = 'LPL3.view.forecast.workbench.workbench-demo-v2';

describe('量价预测推演工作台 v2 · WP6 集成', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?p=forecast');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用 */
    }
  });

  it('入共享分析壳：单页头、无 FilterBar、全页唯一「量价预测」current、页头页签组不再含预测', () => {
    render(<App />);
    // 壳：页头只挂一次；fixture 固定样本不渲染 FilterBar（showFilters=false）
    expect(document.querySelectorAll('header.lpl-page-header')).toHaveLength(1);
    expect(document.querySelectorAll('.lpl-fb')).toHaveLength(0);
    // 同一页面只能有一个「量价预测」aria-current="page"（ChartContentBar 恢复常态标记）
    const forecastCurrents = Array.from(document.querySelectorAll('[aria-current="page"]'))
      .filter((el) => (el.textContent ?? '').includes('量价预测'));
    expect(forecastCurrents).toHaveLength(1);
    // 页头管理页签组的「量价预测」特例已退役
    const headerButtons = Array.from(document.querySelectorAll('header.lpl-page-header button'));
    expect(headerButtons.some((button) => (button.textContent ?? '').trim() === '量价预测')).toBe(false);
  });

  it('五卡齐全有序（主图→参考→大盘→库存→成本垫底）；范围行压缩要素齐全；纪要层不回归', () => {
    render(<App />);
    const text = document.body.textContent ?? '';
    for (const label of [
      '量价预测 · 推演工作台',
      '量价预测主图',
      '上一代上市同期 / 友商同期量价',
      '大盘 · 总量总线',
      '库存验证',
      '成本销毛',
    ]) {
      expect(text).toContain(label);
    }
    const titles = Array.from(document.querySelectorAll('h2')).map((node) => (node.textContent ?? '').trim());
    const cardOrder = ['量价预测主图', '上一代上市同期 / 友商同期量价', '大盘 · 总量总线', '库存验证', '成本销毛']
      .map((label) => titles.findIndex((title) => title.includes(label)));
    expect(cardOrder.every((index) => index >= 0)).toBe(true);
    expect([...cardOrder].sort((a, b) => a - b)).toEqual(cardOrder);
    // 范围行（8.3 Step 1 压缩）：固定样本口径 + 不随全局筛选联动保留
    expect(text).toContain('固定样本 · 不随全局筛选联动');
    expect(text).toContain('HUAWEI Mate 90 · 12+512GB');
    expect(text).toContain('币种 USD（固定）');
    expect(text).toContain('复制关键假设');
    // 教学腔与结构说明段已删除
    expect(text).not.toContain('顶部 = 关注产品量价主图');
    expect(text).not.toContain('把握区间是演示假设，不是统计结论');
    expect(text).not.toContain('推演纪要');
    // 可见「演示实际」话术退役（数据表 caption 保留模拟语境，不在可见 hint 中）
    expect(text).not.toContain('（演示实际）');
  });

  it('模拟标识分级：页首 DataStatusBadge 一处 + 四卡「模拟」+ 参考卡「模拟历史」；页级「演示」chip 退役', () => {
    render(<App />);
    expect(document.body.textContent).toContain('模拟数据');
    // 卡级轻量标识：主图 / 大盘 / 库存 / 成本 = 模拟；量价参考 = 模拟历史
    expect(screen.getAllByText('模拟').filter((el) => (el.textContent ?? '') === '模拟')).toHaveLength(4);
    expect(screen.getAllByText('模拟历史')).toHaveLength(1);
    // 页级 DemoChip（独立「演示」chip）已移除
    expect(screen.queryByText('演示')).toBeNull();
  });

  it('上一代参照受控接线（TS2741 修复）：切 Pura 90 → 基线校正读数更新，草稿按模型版本落 sessionStorage', async () => {
    render(<App />);
    expect(document.body.textContent).toContain('主图基线校正 · 首预测周 W45');
    const pickOption = async (optionText: string): Promise<void> => {
      const trigger = screen.getAllByLabelText('选择上一代参照对象')[0];
      fireEvent.mouseDown(trigger.querySelector('.ant-select-selector') ?? trigger);
      const dropdown = await waitFor(() => {
        const el = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
        if (!el) throw new Error('dropdown 未展开');
        return el;
      });
      const option = [...dropdown.querySelectorAll('.ant-select-item-option')]
        .find((item) => item.textContent === optionText);
      if (!option) throw new Error(`option 未找到：${optionText}`);
      fireEvent.click(option);
    };
    await pickOption('Pura 90 Pro（上上代）');
    // 主链重算：W45 = 47000 × (40000 / 45000) → 同周龄比值 ×0.89
    expect(document.body.textContent).toContain('×0.89');
    // 草稿按模型版本落 sessionStorage（键 = forecast.workbench.<modelVersion>）
    const draft = sessionStorage.getItem(DRAFT_KEY);
    expect(draft).not.toBeNull();
    expect(draft ?? '').toContain('ref-pura90');
  });

  it('微调（原因必填）→ 复制关键假设（含原因与模拟状态）→ 切价格走势再返回草稿保留', async () => {
    render(<App />);
    const tuneButtons = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent === '微调');
    expect(tuneButtons.length).toBe(8);
    fireEvent.click(tuneButtons[2]);
    expect(document.body.textContent).toContain('调整原因（必填）');
    const applyButton = () => Array.from(document.querySelectorAll('button'))
      .find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    expect(applyButton()?.disabled).toBe(true);
    const reasonInput = document.querySelector('textarea[aria-label="调整原因（必填）"]') as HTMLTextAreaElement | null;
    expect(reasonInput).not.toBeNull();
    if (reasonInput) fireEvent.change(reasonInput, { target: { value: '黑五主峰周，电商资源加投' } });
    expect(applyButton()?.disabled).toBe(false);
    fireEvent.click(applyButton()!);
    // 手调原因内联标注主图手调处（图下名录），无纪要层
    expect(document.body.textContent).toContain('手调 · W47：黑五主峰周，电商资源加投');
    expect(document.body.textContent).not.toContain('推演纪要');

    // 复制关键假设：剪贴板文本与当前 params/result 同源
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const copyButton = () => Array.from(document.querySelectorAll('button'))
      .find((button) => (button.textContent ?? '').trim() === '复制关键假设');
    expect(copyButton()).toBeTruthy();
    fireEvent.click(copyButton()!);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const exported = writeText.mock.calls[0][0];
    expect(exported).toContain('黑五主峰周，电商资源加投');
    expect(exported).toContain('workbench-demo-v2');
    expect(exported.split('\n\n')[0]).toContain('模拟');
    // 成功反馈「已复制」（icon aria-label 参与可访问名，用正则匹配）
    expect(Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '已复制')).toBe(true);

    // 切到价格走势再返回：草稿保留（手调原因仍在）；dashboard 为默认页，URL 不带 p
    fireEvent.click(screen.getByRole('button', { name: '价格走势' }));
    expect(window.location.search).not.toContain('p=forecast');
    expect(document.querySelectorAll('.lpl-fb')).toHaveLength(1); // 分析页 FilterBar 不回归
    fireEvent.click(screen.getByRole('button', { name: '量价预测' }));
    expect(window.location.search).toContain('p=forecast');
    expect(document.body.textContent).toContain('手调 · W47：黑五主峰周，电商资源加投');
  });

  it('禁词与旧话术总扫：因子/约束/置信区间/无约束需求/我司/刚性砍 可见文本为零', () => {
    render(<App />);
    const text = document.body.textContent ?? '';
    for (const banned of ['因子', '约束', '置信区间', '无约束需求', '我司', '刚性砍', '砍周', '库存刚性修正']) {
      expect(text).not.toContain(banned);
    }
  });
});
