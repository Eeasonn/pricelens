// ============================================================
// 量价预测 · 推演工作台 v3 页面集成冒烟（任务 10 收敛 · jsdom）：
// 入共享分析壳（单页头、无 FilterBar、全页唯一「量价预测」current）、
// PipelineNav 挂载（四节点 + 点击只定位：跨卡滚动/聚焦 + 「来自…」返回条，
// 返回恢复）、五卡齐全有序（主图→参考→大盘→③库存修正→成本销毛垫底）、
// 范围行压缩 + 模拟标识分级（页首 DataStatusBadge 一处 + 卡级 ？号 HintInfo）、
// SI 未全部确认页首提示（B.5.7）、上一代参照受控进①学习器（切换 = 重新
// 学习，草稿按 workbench-demo-v3 落 sessionStorage）、微调（WeekId 键控）→
// 复制关键假设（v3 管线顺序 + SI 状态）→ 切页往返草稿保留、禁词/旧话术总扫。
// 周身份一律用跨年周 ID（YYYYWww）。只验证 React 组装与交互开关，不验证
// 图表像素（SVG 由 typecheck 保证结构）。
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
// jsdom 无 scrollIntoView：跨卡导航（PipelineNav / 证据定位）在页级真实调用。
(Element.prototype as { scrollIntoView?: unknown }).scrollIntoView ??= () => undefined;

import App from '../../../App';

afterEach(cleanup);

const DRAFT_KEY = 'LPL3.view.forecast.workbench.workbench-demo-v3';

describe('量价预测推演工作台 v3 · WP6 集成', () => {
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

  it('PipelineNav 挂载：全局管线四节点齐全（①自动学习基线→②大盘修正→③库存修正→④成本及销毛），点击只定位不写参数', () => {
    render(<App />);
    const nav = document.querySelector('[data-pipeline-nav]');
    expect(nav).not.toBeNull();
    expect(nav!.getAttribute('aria-label')).toContain('①自动学习基线');
    expect(nav!.getAttribute('aria-label')).toContain('④成本及销毛');
    for (const stage of ['1', '2', '3', '4']) {
      expect(document.querySelector(`[data-pipeline-stage="${stage}"]`)).not.toBeNull();
    }
    // 节点状态读数（B.5.1）：③SI 待确认 N / 12（基准 = 全部待确认）· ④暂不联动销量
    const stage3 = document.querySelector('[data-pipeline-stage="3"]')!;
    expect(stage3.textContent).toContain('SI 待确认 12 / 12');
    const stage4 = document.querySelector('[data-pipeline-stage="4"]')!;
    expect(stage4.textContent).toContain('暂不联动销量');
    // 点击 = 页级跨卡定位 + 返回条；不弹编辑器、不写草稿（params 键保持无值）
    fireEvent.click(stage3);
    const bar = document.querySelector('[data-cross-card-bar]');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('来自 结果总览');
    // ③目标卡获得 DOM 焦点（tabIndex=-1 聚焦；不弹编辑器、不写草稿）
    const inventoryWrapper = Array.from(document.querySelectorAll('[data-lpl-forecast-grid] > div'))
      .find((node) => (node.textContent ?? '').includes('③ 库存修正'));
    expect(inventoryWrapper).not.toBeUndefined();
    expect(document.activeElement === inventoryWrapper).toBe(true);
    // 返回 = 恢复滚动与焦点，返回条消失
    fireEvent.click(screen.getByRole('button', { name: '返回结果总览' }));
    expect(document.querySelector('[data-cross-card-bar]')).toBeNull();
  });

  it('五卡齐全有序（主图→参考→大盘→③库存修正→成本销毛垫底）；SI 未全部确认页首提示；纪要层不回归', () => {
    render(<App />);
    const text = document.body.textContent ?? '';
    for (const label of [
      '量价预测 · 推演工作台',
      '量价预测主图',
      '量价参考产品',
      '② 大盘修正',
      '③ 库存修正',
      '成本销毛',
    ]) {
      expect(text).toContain(label);
    }
    const titles = Array.from(document.querySelectorAll('h2')).map((node) => (node.textContent ?? '').trim());
    const cardOrder = ['量价预测主图', '量价参考产品', '② 大盘修正', '③ 库存修正', '成本销毛']
      .map((label) => titles.findIndex((title) => title.includes(label)));
    expect(cardOrder.every((index) => index >= 0)).toBe(true);
    expect([...cardOrder].sort((a, b) => a - b)).toEqual(cardOrder);
    // 范围行（8.3 Step 1 压缩）：固定样本口径 + 不随全局筛选联动保留
    expect(text).toContain('固定样本 · 不随全局筛选联动');
    expect(text).toContain('HUAWEI Mate 90 · 12+512GB');
    expect(text).toContain('币种 USD（固定）');
    expect(text).toContain('复制关键假设');
    // SI 未全部确认页首提示（B.5.7）：基准 = 12 个月全部待确认
    expect(text).toContain('SI 未全部确认（待确认 12 / 12）');
    // 教学腔与结构说明段已删除
    expect(text).not.toContain('顶部 = 关注产品量价主图');
    expect(text).not.toContain('把握区间是演示假设，不是统计结论');
    expect(text).not.toContain('推演纪要');
    // 可见「演示实际」话术退役（数据表 caption 保留模拟语境，不在可见 hint 中）
    expect(text).not.toContain('（演示实际）');
  });

  it('④⑤ 库存修正 + 成本销毛单列全宽堆叠（2026-11-05 高保真拍板：库存卡占满全宽，不再左右分栏），卡序仍库存在前', () => {
    render(<App />);
    const grid = document.querySelector('[data-lpl-forecast-grid]') as HTMLElement | null;
    expect(grid).not.toBeNull();
    // 单列全宽：③库存修正 → 成本销毛 上下堆叠（间距 = space.md）；
    // 窄屏退化断点由 index.css 既有 [data-lpl-forecast-grid] 断点承担（jsdom 不测媒体查询）。
    expect(grid!.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
    expect(grid!.style.gap).toBe('12px');
    expect(grid!.style.alignItems).toBe('stretch');
    // 两卡为网格直接子级（跨卡聚焦包装层 div 内各一张卡），DOM 顺序仍 ④ 库存 → ⑤ 成本。
    const cards = Array.from(grid!.children).map((wrapper) => wrapper.querySelector('section'))
      .filter((node): node is HTMLElement => node != null);
    expect(cards).toHaveLength(2);
    const cardTitles = cards.map((card) => card.querySelector('h2')?.textContent ?? '');
    expect(cardTitles[0]).toContain('③ 库存修正');
    expect(cardTitles[1]).toContain('成本销毛');
    // 两卡同宽几何（2026-11-07 整改）：两卡 SVG 均按实测宽绘图（width/height 属性像素值，
    // 缩放比 1；jsdom 无 RO 回退 720×252，与库存卡同源同高）。
    for (const card of cards) {
      const svg = card.querySelector('svg[role="img"]') as SVGSVGElement | null;
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('width')).toBe('720');
      expect(svg!.getAttribute('height')).toBe('252');
    }
  });

  it('模拟标识分级（2026-11-05 第 7 条）：页首 DataStatusBadge 一处，卡级「模拟/模拟历史」chip 退役为 ？号 HintInfo', () => {
    render(<App />);
    expect(document.body.textContent).toContain('模拟数据');
    // 卡级 chip 全部退役：不再有「模拟」/「模拟历史」独立 chip（说明收 ？号 title）
    expect(screen.queryAllByText('模拟').filter((el) => (el.textContent ?? '') === '模拟')).toHaveLength(0);
    expect(screen.queryByText('模拟历史')).toBeNull();
    // ？号说明图标在五张卡卡头承载说明（aria-label 以「说明」结尾：主图默认 + 四卡「××卡说明」；页内另有既有 ？号说明不计数上限）
    expect(document.querySelectorAll('[aria-label$="说明"]').length).toBeGreaterThanOrEqual(5);
    // 页级 DemoChip（独立「演示」chip）已移除
    expect(screen.queryByText('演示')).toBeNull();
  });

  it('上一代参照受控接线（A5 多面板）：追加上一代 Pura 90 面板 → 写主链、基线校正读数更新，草稿按模型版本落 sessionStorage', async () => {
    render(<App />);
    // 参考卡读数（§3.5 · B.5.5 v3）：首预测周（跨年周 ID 2026W45）· 同周龄证据。
    // 2026-11-05 视觉精简二轮：读数行收进「首预测周读数」收起区——展开后可见；
    // 主链切换后读数随新链面板重挂（收起区回到默认收起），需再展开。
    const expandFootnote = () => {
      const toggle = screen.queryByRole('button', { name: '首预测周读数' });
      if (toggle != null) fireEvent.click(toggle);
    };
    expandFootnote();
    expect(document.body.textContent).toContain('首预测周 2026W45 · 同周龄证据');
    const readoutBefore = (document.body.textContent ?? '').match(/首预测周 2026W45 · 同周龄证据 · [\s\S]{0,40}/)?.[0] ?? '';
    // 「＋ 添加参考」下拉（A5：面板增删替代原槽位下拉）追加 Pura 90（链内产品 → 写 prevGenReferenceId）
    fireEvent.click(screen.getByRole('button', { name: '添加参考面板' }));
    const item = await waitFor(() => {
      const el = [...document.querySelectorAll('.ant-dropdown:not(.ant-dropdown-hidden) [role="menuitem"]')]
        .find((node) => node.textContent === 'Pura 90 Pro（上上代）');
      if (!el) throw new Error('menu item 未找到：Pura 90 Pro（上上代）');
      return el;
    });
    fireEvent.click(item);
    // v3 主链：切换参照 = ①重新学习（无额外参考乘子）→ 同周龄证据读数更新
    expandFootnote();
    const readoutAfter = (document.body.textContent ?? '').match(/首预测周 2026W45 · 同周龄证据 · [\s\S]{0,40}/)?.[0] ?? '';
    expect(readoutAfter).not.toBe('');
    expect(readoutAfter).not.toBe(readoutBefore);
    // 草稿按模型版本落 sessionStorage（键 = forecast.workbench.workbench-demo-v3）
    const draft = sessionStorage.getItem(DRAFT_KEY);
    expect(draft).not.toBeNull();
    expect(draft ?? '').toContain('ref-pura90');
  });

  it('微调（原因选填，不填即可应用）→ 复制关键假设（含原因、模拟状态与 SI 待确认）→ 切价格走势再返回草稿保留', async () => {
    render(<App />);
    // 2026-11-05 视觉精简二轮：微调入口在主图「数据与操作」收起区（数据表）——展开后可见。
    const expandDataOps = () => fireEvent.click(screen.getByRole('button', { name: '数据与操作' }));
    expandDataOps();
    const tuneButtons = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent === '微调');
    // v3 主图数据表 = 全部预测周（52 个 WeekId）各一个微调入口
    expect(tuneButtons.length).toBe(52);
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
    expect(document.body.textContent).toContain('手调 · 2026W47：黑五主峰周，电商资源加投');
    expect(document.body.textContent).not.toContain('推演纪要');

    // 复制关键假设：剪贴板文本与当前 params/result/context 同源（v3 管线顺序）
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const copyButton = () => Array.from(document.querySelectorAll('button'))
      .find((button) => (button.textContent ?? '').trim() === '复制关键假设');
    expect(copyButton()).toBeTruthy();
    fireEvent.click(copyButton()!);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const exported = writeText.mock.calls[0][0];
    expect(exported).toContain('黑五主峰周，电商资源加投');
    expect(exported).toContain('workbench-demo-v3');
    expect(exported.split('\n\n')[0]).toContain('模拟');
    // v3 导出（任务 10）：SI 未全部确认时复制假设显式警示 + 管线段落顺序
    expect(exported).toContain('SI 未全部确认');
    expect(exported).toContain('SI 待确认 12 / 12');
    expect(exported).toContain('【① 基线预测】');
    expect(exported).toContain('【④ 成本及销毛】');
    expect(exported).toContain('价格→销量关系未纳入');
    // 成功反馈「已复制」（icon aria-label 参与可访问名，用正则匹配）
    expect(Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '已复制')).toBe(true);

    // 切到价格走势再返回：草稿保留（手调原因仍在）；dashboard 为默认页，URL 不带 p
    fireEvent.click(screen.getByRole('button', { name: '价格走势' }));
    expect(window.location.search).not.toContain('p=forecast');
    expect(document.querySelectorAll('.lpl-fb')).toHaveLength(1); // 分析页 FilterBar 不回归
    fireEvent.click(screen.getByRole('button', { name: '量价预测' }));
    expect(window.location.search).toContain('p=forecast');
    // 返回后收起区回到默认收起（组件内存态不持久化）：再展开断言名录草稿仍在。
    expandDataOps();
    expect(document.body.textContent).toContain('手调 · 2026W47：黑五主峰周，电商资源加投');
  });

  it('禁词与旧话术总扫：因子/约束/置信区间/无约束需求/我司/刚性砍 可见文本为零', () => {
    render(<App />);
    const text = document.body.textContent ?? '';
    for (const banned of ['因子', '约束', '置信区间', '无约束需求', '我司', '刚性砍', '砍周', '库存刚性修正']) {
      expect(text).not.toContain(banned);
    }
  });
});
