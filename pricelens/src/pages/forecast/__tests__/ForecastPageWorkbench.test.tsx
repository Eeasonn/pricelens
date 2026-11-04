// ============================================================
// 量价预测 · 推演工作台 v2 页面集成冒烟（WP6 8.1–8.4，jsdom）：
// 入共享分析壳（单页头、无 FilterBar、全页唯一「量价预测」current）、
// 五卡齐全有序、范围行压缩 + 模拟标识分级（页首 DataStatusBadge + 各卡
// 轻量 SimChip）、上一代参照受控进主链（草稿按模型版本落 sessionStorage）、
// 微调→复制关键假设→切页往返草稿保留、禁词/旧话术总扫。
// 2026-11-04 清洁第二轮：④⑤ 库存验证 + 成本销毛改左右两列
//（data-lpl-forecast-grid：minmax(0,1fr) / minmax(0,0.8fr)，窄屏退化走
// index.css 既有 ≤760px 单列断点），新增布局结构断言。
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
      '量价参考产品',
      '大盘 · 总量总线',
      '库存验证',
      '成本销毛',
    ]) {
      expect(text).toContain(label);
    }
    const titles = Array.from(document.querySelectorAll('h2')).map((node) => (node.textContent ?? '').trim());
    const cardOrder = ['量价预测主图', '量价参考产品', '大盘 · 总量总线', '库存验证', '成本销毛']
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

  it('④⑤ 库存验证 + 成本销毛左右两列：data-lpl-forecast-grid 双列模板（左 1fr / 右 0.8fr），卡序仍库存在前', () => {
    render(<App />);
    const grid = document.querySelector('[data-lpl-forecast-grid]') as HTMLElement | null;
    expect(grid).not.toBeNull();
    // 两列 grid：左列（库存卡，内容多）1fr，右列（成本销毛窄卡）0.8fr；间距 = space.md；
    // 窄屏退化（≤760px 单列）由 index.css 既有 [data-lpl-forecast-grid] 断点承担（jsdom 不测媒体查询）。
    expect(grid!.style.gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 0.8fr)');
    expect(grid!.style.gap).toBe('12px');
    expect(grid!.style.alignItems).toBe('start');
    // 两卡为网格直接子级，DOM 顺序仍 ④ 库存 → ⑤ 成本（左右排布不改变卡序）。
    const cards = Array.from(grid!.children).filter((node) => node.tagName === 'SECTION');
    expect(cards).toHaveLength(2);
    const cardTitles = cards.map((card) => card.querySelector('h2')?.textContent ?? '');
    expect(cardTitles[0]).toContain('库存验证');
    expect(cardTitles[1]).toContain('成本销毛');
    // 右列窄卡自适应：销毛图 SVG 地板宽 560（1440 最小工作宽下列内不出现横向滚动）。
    const marginSvg = cards[1].querySelector('svg[role="img"]') as SVGSVGElement | null;
    expect(marginSvg).not.toBeNull();
    expect(marginSvg!.style.minWidth).toBe('560px');
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

  it('上一代参照受控接线（A5 多面板）：追加上一代 Pura 90 面板 → 写主链、基线校正读数更新，草稿按模型版本落 sessionStorage', async () => {
    render(<App />);
    // 参考卡读数新格式（§3.5）：首预测周 · 同周龄比值（不再有「主图基线校正 ·」前缀）
    expect(document.body.textContent).toContain('首预测周 W45 · 同周龄比值');
    // 「＋ 添加参考」下拉（A5：面板增删替代原槽位下拉）追加 Pura 90（链内产品 → 写 prevGenReferenceId）
    fireEvent.click(screen.getByRole('button', { name: '添加参考面板' }));
    const item = await waitFor(() => {
      const el = [...document.querySelectorAll('.ant-dropdown:not(.ant-dropdown-hidden) [role="menuitem"]')]
        .find((node) => node.textContent === 'Pura 90 Pro（上上代）');
      if (!el) throw new Error('menu item 未找到：Pura 90 Pro（上上代）');
      return el;
    });
    fireEvent.click(item);
    // 主链重算：W45 = 47000 × (40000 / 45000) → 同周龄比值 ×0.89
    expect(document.body.textContent).toContain('×0.89');
    // 草稿按模型版本落 sessionStorage（键 = forecast.workbench.<modelVersion>）
    const draft = sessionStorage.getItem(DRAFT_KEY);
    expect(draft).not.toBeNull();
    expect(draft ?? '').toContain('ref-pura90');
  });

  it('微调（原因选填，不填即可应用）→ 复制关键假设（含原因与模拟状态）→ 切价格走势再返回草稿保留', async () => {
    render(<App />);
    const tuneButtons = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent === '微调');
    expect(tuneButtons.length).toBe(8);
    fireEvent.click(tuneButtons[2]);
    // 2026-11-04 评审：调整原因改选填——去掉必填拦截，不填即可应用；
    // placeholder 引导（如「选填：帮助追溯调整依据」），空值照常提交。
    expect(document.body.textContent).not.toContain('（必填）');
    const reasonInput = (document.querySelector('.ant-modal textarea')
      ?? document.querySelector('textarea[aria-label*="调整原因"]')) as HTMLTextAreaElement | null;
    expect(reasonInput).not.toBeNull();
    expect(reasonInput!.placeholder).toContain('选填');
    const applyButton = () => Array.from(document.querySelectorAll('button'))
      .find((button) => (button.textContent ?? '').replace(/\s/g, '') === '应用');
    expect(applyButton()?.disabled).toBe(false);
    if (reasonInput) fireEvent.change(reasonInput, { target: { value: '黑五主峰周，电商资源加投' } });
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
