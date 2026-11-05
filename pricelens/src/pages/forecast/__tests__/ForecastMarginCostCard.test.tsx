// ============================================================
// WP5 / 任务 9 · 成本销毛卡组件测试（jsdom）：
// 继承 WP5 Step 9/10：$M 轴与 tooltip 同源（禁「万$」标原始 USD）、周销毛
// 图例真实显隐、负单台销毛零基线向下表达不丢柱、空态文案。
// 任务 9 迁移（v3 统一销毛视图）：预测起点从周状态派生、负销毛与缺数周
// 断言改走 MarginView 语义（weeklyMargin=null 不画 0 柱 + 覆盖率如实显示、
// 负值经 marginView 注入——主链 weeklyMargin 过渡字段不再是卡的数字来源）。
// 任务 9 新增（IA 文档 4.2 / B.5.8）：hairline 分「成本参考区 / 经营结果区」、
// 成本编辑写 costOverrides（原因选填、可还原）、主数字读 MarginView、
// 结果回读「含主图价格手调 Wn / 含成本假设 N 项」、唯一人工动作
// 「带到主图调价」打开 PriceAdjustDialog、方向性提示「成本上升 · 请核对价格」。
// 2026-11-05 拍板实施（Eason：库存+销毛按推荐改；margin-card-hifi 推荐稿）：
// - 默认视图 = 周销毛柱（琥珀）+ 成本月版本线（实→虚）+ 价格线；「成本参考
//   与调价回路」「输出与规则」两区 CollapsibleSection 默认收起（不加时间轨）；
// - 卡头说明 chip（模拟 / 推演参考 · 波动 ±8% / 价格→销量关系未纳入）退役为
//   单个 HintInfo（title 合并并保留模拟语境）；图例全部可点显隐（aria-pressed +
//   隐藏态 opacity .45）；图宽与库存卡同宽（viewBox 720×252 · minWidth 700）；
//   链路条改用共享 FlowBar（去编号）；svg 轴文本对齐价格走势页取值。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { workbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, type WorkbenchResult } from '../workbenchModel';
import { computeMarginView, emptyMarginScenario, type MarginView } from '../marginScenarioModel';
import { resetMarginScenarioStoresForTests } from '../useMarginScenario';
import ForecastMarginCostCard from '../ForecastMarginCostCard';

const fixture = workbenchFixture;
const baseResult = computeWorkbench(fixture, baseWorkbenchParams(fixture));
const baseView = (): MarginView => computeMarginView(fixture, baseResult, emptyMarginScenario());

afterEach(() => {
  cleanup();
  // 成本/价格工作区是 sessionStorage 持久化的模块级 store：逐用例隔离。
  resetMarginScenarioStoresForTests();
});

const renderCard = (
  result: WorkbenchResult,
  marginView?: MarginView,
  extra: Partial<ComponentProps<typeof ForecastMarginCostCard>> = {},
) => render(
  <ForecastMarginCostCard
    fixture={fixture}
    result={result}
    {...(marginView != null ? { marginView } : {})}
    {...extra}
  />,
);

const marginBars = (): Element[] =>
  Array.from(document.querySelectorAll('svg rect')).filter((rect) =>
    Array.from(rect.querySelectorAll('title')).some((title) => (title.textContent ?? '').includes('周销毛')),
  );

const barTitleOf = (rect: Element): string => rect.querySelector('title')?.textContent ?? '';

/**
 * 2026-11-05 拍板实施：IoBar / 链路条 / 成本参考区（含「带到主图调价」）
 * 收进「成本参考与调价回路」收起区，回读行 + 输出框收进「输出与规则」收起区
 * （默认收起，展开后可见）——受影响断言先展开再查询（逐个迁移不删除）。
 */
const expandSection = (label: string): void => {
  const toggle = document.querySelector(`[data-collapsible-section="${label}"] > button`);
  if (toggle != null && toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
};
const expandCostOps = (): void => expandSection('成本参考与调价回路');
const expandReadout = (): void => expandSection('输出与规则');

describe('成本销毛 · $M 轴（禁万$）', () => {
  it('轴刻度与 tooltip 均为 $M 格式，全文不出现「万$」', () => {
    renderCard(baseResult);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('万$');
    expect(/\$\d+(\.\d+)?M/.test(text)).toBe(true);
    // 基线 0 刻度存在（$0.0M）。
    expect(text).toContain('$0.0M');
    // tooltip（title）也用 $M：如「周销毛 $」+ M 格式。
    const titles = Array.from(document.querySelectorAll('svg rect title')).map((title) => title.textContent ?? '');
    expect(titles.some((title) => title.includes('周销毛 $') && title.includes('M'))).toBe(true);
  });

  it('周销毛图例可点击真实显隐', () => {
    renderCard(baseResult);
    expect(marginBars().length).toBeGreaterThan(0);
    const marginButton = Array.from(document.querySelectorAll('button[aria-pressed]')).find((button) =>
      (button.textContent ?? '').includes('周销毛'),
    );
    expect(marginButton).toBeDefined();
    fireEvent.click(marginButton!);
    expect(marginButton!.getAttribute('aria-pressed')).toBe('false');
    expect(marginBars()).toHaveLength(0);
    fireEvent.click(marginButton!);
    expect(marginBars().length).toBeGreaterThan(0);
  });

  it('图例全部可点显隐（全局 #1）：成本 / 价格项带 key + aria-pressed，隐藏态 opacity .45，点击后对应线移除', () => {
    renderCard(baseResult);
    const legendButtons = Array.from(document.querySelectorAll('button[aria-pressed]')) as HTMLButtonElement[];
    expect(legendButtons.map((button) => (button.textContent ?? '').trim())).toEqual([
      '周销毛（$M）', '成本 · 月版本（实→虚）', '价格',
    ]);
    const mainChart = () => document.querySelector('svg[role="img"]') as SVGSVGElement;
    const pathsOf = (stroke: string): Element[] =>
      Array.from(mainChart().querySelectorAll('path')).filter((path) => path.getAttribute('stroke') === stroke);
    expect(pathsOf('#a1a1a1').length).toBeGreaterThan(0);
    expect(pathsOf('#c7000b').length).toBeGreaterThan(0);
    // 隐藏成本阶梯
    const costButton = legendButtons[1]!;
    fireEvent.click(costButton);
    expect(costButton.getAttribute('aria-pressed')).toBe('false');
    expect(costButton.style.opacity).toBe('0.45');
    expect(pathsOf('#a1a1a1')).toHaveLength(0);
    // 隐藏价格线
    const priceButton = legendButtons[2]!;
    fireEvent.click(priceButton);
    expect(priceButton.getAttribute('aria-pressed')).toBe('false');
    expect(priceButton.style.opacity).toBe('0.45');
    expect(pathsOf('#c7000b')).toHaveLength(0);
    // 恢复显示
    fireEvent.click(costButton);
    expect(pathsOf('#a1a1a1').length).toBeGreaterThan(0);
    fireEvent.click(priceButton);
    expect(pathsOf('#c7000b').length).toBeGreaterThan(0);
  });
});

describe('成本销毛 · MarginView 迁移（任务 9：预测起点 / 负柱 / 缺数周）', () => {
  it('预测起点从周状态派生：预测段销毛柱为虚柱（v3 合成窗口 8 实际 + 4 预测，不写死下标）', () => {
    // v3 合成窗口：8 个实际周 + 首个预测周起的 4 个预测周。
    const weeks = [...baseResult.weeks.slice(0, 8), ...baseResult.weeks.slice(52, 56)].map((week, index) => ({
      ...week,
      status: (index < 8 ? 'actual' : 'forecast') as 'actual' | 'forecast',
    }));
    renderCard({ ...baseResult, weeks });
    const forecastBars = marginBars().filter((rect) => rect.getAttribute('stroke-dasharray'));
    expect(forecastBars).toHaveLength(4); // 合成窗口只有 4 个预测周。
    expect(forecastBars.every((rect) => (rect.getAttribute('stroke') ?? '').length > 0)).toBe(true);
  });

  it('负周销毛不丢柱：柱从零基线向下（MarginWeek 负值），零基线网格线存在', () => {
    const view = baseView();
    const negWeekId = view.weeks[9]!.weekId;
    const posWeekId = view.weeks[8]!.weekId;
    renderCard(baseResult, {
      ...view,
      weeks: view.weeks.map((week) => (week.weekId === negWeekId ? { ...week, weeklyMargin: -800000 } : week)),
    });
    const negBar = marginBars().find((rect) => barTitleOf(rect).includes(negWeekId));
    const posBar = marginBars().find((rect) => barTitleOf(rect).includes(posWeekId));
    expect(negBar).not.toBeUndefined();
    expect(posBar).not.toBeUndefined();
    // 负柱顶端（零基线）在正柱顶端之下（向下表达）。
    expect(Number(negBar!.getAttribute('y'))).toBeGreaterThan(Number(posBar!.getAttribute('y')));
    // 零基线网格线（强分隔）穿过负柱顶端。
    const negTop = Number(negBar!.getAttribute('y'));
    const baseline = Array.from(document.querySelectorAll('svg line')).find(
      (line) => Math.abs(Number(line.getAttribute('y1')) - negTop) < 0.6,
    );
    expect(baseline).not.toBeUndefined();
    expect(baseline!.getAttribute('stroke')).toBe('#a1a1a1');
  });

  it('负周销毛 tooltip 为 $M 带符号（$-0.8M），不是万$', () => {
    const view = baseView();
    renderCard(baseResult, {
      ...view,
      weeks: view.weeks.map((week, index) => (index === 9 ? { ...week, weeklyMargin: -800000 } : week)),
    });
    const titles = Array.from(document.querySelectorAll('svg rect title')).map((title) => title.textContent ?? '');
    expect(titles.some((title) => title.includes('$-0.8M'))).toBe(true);
    expect(document.body.textContent).not.toContain('万$');
  });

  it('销量缺失周：不画 0 柱（weeklyMargin=null），覆盖率如实显示「有效周/总数」不掩盖', () => {
    const targetWeek = baseResult.weeks.find((week) => week.status === 'forecast')!;
    const withNull = {
      ...baseResult,
      weeks: baseResult.weeks.map((week) => (week.weekId === targetWeek.weekId ? { ...week, final: null } : week)),
    };
    renderCard(withNull);
    expandReadout();
    // 缺数周无柱（不造 0），tooltip 不出现该周。
    expect(marginBars().some((rect) => barTitleOf(rect).includes(targetWeek.weekId))).toBe(false);
    // 覆盖率如实显示：与 MarginView 口径一致（缺失周计入总数、不计有效周）。
    const view = computeMarginView(fixture, withNull, emptyMarginScenario());
    const text = document.body.textContent ?? '';
    expect(text).toContain(`预测覆盖 ${view.forecastCoverage.validWeeks}/${view.forecastCoverage.totalWeeks} 周`);
    expect(text).toContain(`历史覆盖 ${view.historyCoverage.validWeeks}/${view.historyCoverage.totalWeeks} 周`);
    expect(text).toContain('缺数周不计 0');
  });
});

describe('成本销毛 · 依赖链路条（A3；在「成本参考与链路」收起区内，展开后可见）', () => {
  it('链路完整：主图价格预测 + 成本月版本 → 单台销毛 → × 主图 SO → 预测期销毛（末节点激活注「不回写主图」）', () => {
    renderCard(baseResult);
    expandCostOps();
    const steps = Array.from(document.querySelectorAll('[data-flow-step]'));
    expect(steps.map((el) => el.getAttribute('data-flow-step'))).toEqual([
      '主图价格预测', '成本月版本', '单台销毛', '× 主图 SO', '预测期销毛',
    ]);
    const bar = document.querySelector('[data-flow-bar]') as HTMLElement;
    expect(bar.getAttribute('aria-label')).toContain('主图价格预测 + 成本月版本 → 单台销毛 → × 主图 SO → 预测期销毛');
    const last = steps[steps.length - 1] as HTMLElement;
    expect(last.getAttribute('data-state')).toBe('active');
    expect(last.textContent).toContain('不回写主图');
    // 公式收 title：单台销毛节点 = 主图价格 − 成本月版本
    const unitStep = steps[2] as HTMLElement;
    expect(unitStep.getAttribute('title')).toContain('主图价格 − 成本月版本');
  });

  it('空态也渲染依赖链路条（关系先于数据可见；在收起区内，展开后可见）', () => {
    renderCard({ ...baseResult, weeks: [] });
    expandCostOps();
    expect(document.querySelectorAll('[data-flow-step]').length).toBe(5);
    expect(document.querySelector('[data-flow-step="预测期销毛"]')?.getAttribute('data-state')).toBe('active');
  });
});

describe('成本销毛 · 经营结果定位（2026-11-04 评审：输入（量价）→ 结果（销毛））', () => {
  it('卡标题标注「经营结果」，口径行注明由上述量价与成本推导', () => {
    renderCard(baseResult);
    const h2 = document.querySelector('h2');
    expect(h2?.textContent).toContain('成本销毛 · 经营结果');
    const text = document.body.textContent ?? '';
    expect(text).toContain('经营结果 · 由上述量价与成本推导');
    expect(text).toContain('对销毛不满意');
  });

  it('IoBar 重排为 输入（量价）→ 经营结果：预测期销毛（不修正主图；IoBar 在「成本参考与链路」收起区，展开后可见）', () => {
    renderCard(baseResult);
    expandCostOps();
    const text = document.body.textContent ?? '';
    expect(text).toContain('输入（量价）');
    expect(text).toContain('经营结果：预测期销毛');
    expect(text).toContain('仅调价参考');
  });

  it('成本定位口径：成本只是是否调价的参考、不进模型输入；输出框首行 = 经营结果推导口径（展开收起区后可见）', () => {
    renderCard(baseResult);
    expandCostOps();
    expandReadout();
    const text = document.body.textContent ?? '';
    expect(text).toContain('成本只是是否调价的参考');
    expect(text).toContain('不进模型输入');
    expect(text).toContain('由上述量价与成本推导');
    // aria 同步声明经营结果定位
    const svg = document.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.getAttribute('aria-label')).toContain('经营结果 · 由上述量价与成本推导');
  });

  it('空态同样保留经营结果定位文案（IoBar 在收起区内，展开后可见）', () => {
    renderCard({ ...baseResult, weeks: [] });
    expandCostOps();
    const text = document.body.textContent ?? '';
    expect(text).toContain('暂无成本销毛数据');
    expect(text).toContain('经营结果 · 由上述量价与成本推导');
    expect(text).toContain('输入（量价）');
  });

  it('说明 chip 退役为 ？号（全局 #7）：无「模拟 / 推演参考 · 波动 ±8%」chip，HintInfo 合并说明并保留模拟语境、±8% 口径与价格→销量边界', () => {
    renderCard(baseResult);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('推演参考 · 波动 ±8%');
    expect(text).not.toContain('把握');
    // 模拟语境合并保留：模拟口径 + 波动参考 + 非统计置信区间 + 价格→销量关系未纳入
    const hint = Array.from(document.querySelectorAll('span[title]'))
      .find((el) => (el.getAttribute('title') ?? '').includes('模拟数据 · 推演参考'));
    expect(hint).not.toBeUndefined();
    const title = hint!.getAttribute('title') ?? '';
    expect(title).toContain('模拟');
    expect(title).toContain('±8%');
    expect(title).toContain('非统计置信区间');
    expect(title).toContain('不含渠道费率');
    expect(title).toContain('价格→销量关系未纳入');
  });
});

describe('成本销毛 · 负单台销毛（零基线向下）与空态', () => {
  it('无周数据：显「暂无成本销毛数据」，不渲染 SVG、无 NaN', () => {
    renderCard({ ...baseResult, weeks: [] });
    expect(document.querySelector('svg')).toBeNull();
    const text = document.body.textContent ?? '';
    expect(text).toContain('暂无成本销毛数据');
    expect(text).not.toContain('NaN');
  });
});

describe('任务 9 · 成本参考区 / 经营结果区（hairline 双区 · B.5.8；成本参考区与回读/输出框在收起区内，展开后可见）', () => {
  it('卡内分「成本参考区 / 经营结果区」两区：成本参考区在「成本参考与调价回路」收起区内（hairline 分区），经营结果区为默认可见的图 + 图例（data-zone 包装，区头说明收 HintInfo）', () => {
    renderCard(baseResult);
    expandCostOps();
    expect(document.querySelector('[data-zone="cost-reference"]')).toBeTruthy();
    expect((document.body.textContent ?? '')).toContain('成本参考区');
    const resultZone = document.querySelector('[data-zone="business-result"]') as HTMLElement | null;
    expect(resultZone).toBeTruthy();
    expect(resultZone!.getAttribute('aria-label')).toBe('经营结果区');
    expect(resultZone!.querySelector('svg[role="img"]')).not.toBeNull();
    expect(resultZone!.querySelectorAll('button[aria-pressed]').length).toBe(3);
    // 默认视图不再有可见区头行（说明收 HintInfo）
    expect((document.body.textContent ?? '')).toContain('经营结果 · 由上述量价与成本推导');
  });

  it('成本参考区逐月版本行：月份 / 生效成本 / 较上版变化 / 模拟来源状态', () => {
    renderCard(baseResult);
    expandCostOps();
    const text = document.body.textContent ?? '';
    for (const version of fixture.costVersions) {
      expect(text).toContain(version.monthKey);
    }
    expect(text).toContain('较上版');
    expect(text).toContain('模拟样本');
  });

  it('成本编辑写 costOverrides：主数字读 MarginView 即时变化、行标「已改」、可还原、回读计数', () => {
    renderCard(baseResult);
    expandCostOps();
    expandReadout();
    const firstMonth = fixture.costVersions[0]!.monthKey;
    // 基线主数字 = 无假设时的 MarginView.forecastMargin。
    const baselineMargin = baseView().forecastMargin;
    fireEvent.click(screen.getByRole('button', { name: `编辑成本版本 ${firstMonth}` }));
    fireEvent.change(screen.getByLabelText(`成本假设 ${firstMonth}（USD/台）`), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: `保存成本假设 ${firstMonth}` }));
    // 主数字随假设变化（成本上升 → 预测期销毛下降），与 computeMarginView 同源。
    const afterView = computeMarginView(fixture, baseResult, {
      costOverrides: { [firstMonth]: { unitCost: 900, reason: '' } },
      priceOverrides: {},
    });
    const text = document.body.textContent ?? '';
    expect(text).toContain(`$${(afterView.forecastMargin / 1e6).toFixed(1)}M`);
    expect(text).not.toContain(`$${(baselineMargin / 1e6).toFixed(1)}M`);
    // 行标已改 + 可还原 + 回读计数。
    expect(screen.getByText('已改')).toBeTruthy();
    expect(screen.getByRole('button', { name: `还原成本基准 ${firstMonth}` })).toBeTruthy();
    expect(screen.getByText('含成本假设 1 项')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `还原成本基准 ${firstMonth}` }));
    expect((document.body.textContent ?? '').includes(`$${(baselineMargin / 1e6).toFixed(1)}M`)).toBe(true);
    expect(screen.getByText('含成本假设 0 项')).toBeTruthy();
  });

  it('成本证据浮框位：证据面板显示版本阶梯、单台销毛与周销毛算例（UI 不另编数字）', () => {
    renderCard(baseResult);
    expandCostOps();
    fireEvent.click(screen.getByRole('button', { name: `成本证据 ${fixture.costVersions[0]!.monthKey}` }));
    const text = document.body.textContent ?? '';
    expect(text).toContain('版本阶梯');
    expect(text).toContain('单台销毛 = 价格');
    expect(text).toContain('周销毛');
    expect(text).toContain('模拟样本');
  });

  it('方向性提示：成本假设高于上版时「成本上升 · 请核对价格」（无定价依据不预填数值建议）', () => {
    renderCard(baseResult);
    expandCostOps();
    const month = fixture.costVersions[1]!.monthKey;
    const prevCost = fixture.costVersions[0]!.unitCost;
    fireEvent.click(screen.getByRole('button', { name: `编辑成本版本 ${month}` }));
    fireEvent.change(screen.getByLabelText(`成本假设 ${month}（USD/台）`), { target: { value: String(prevCost + 50) } });
    fireEvent.click(screen.getByRole('button', { name: `保存成本假设 ${month}` }));
    expect(screen.getByText('成本上升 · 请核对价格')).toBeTruthy();
  });

  it('唯一人工动作「带到主图调价」（在「成本参考与链路」展开区内）：打开价格弹窗 → 应用价格调整 → 回读「含主图价格手调 W1」', () => {
    renderCard(baseResult);
    expandCostOps();
    expandReadout();
    expect(screen.queryByText('价格→销量关系未纳入 · 暂不联动销量')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '带到主图调价' }));
    expect(screen.getByText('价格→销量关系未纳入 · 暂不联动销量')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '应用价格调整' }));
    // 弹窗关闭，回读区出现价格手调计数（W1）。
    expect(screen.queryByText('价格→销量关系未纳入 · 暂不联动销量')).toBeNull();
    expect(screen.getByText('含主图价格手调 W1')).toBeTruthy();
  });

  it('主数字来自 MarginView 而非主链过渡字段：手调价不改销量时预测期销毛随之更新', () => {
    const week = baseResult.weeks.find((item) => item.status === 'forecast')!;
    const marginView = computeMarginView(fixture, baseResult, {
      costOverrides: {},
      priceOverrides: { [week.weekId]: { price: week.price + 100, reason: '', batchId: 'price-t' } },
    });
    renderCard(baseResult, marginView);
    expandReadout();
    const text = document.body.textContent ?? '';
    expect(text).toContain(`$${(marginView.forecastMargin / 1e6).toFixed(1)}M`);
    // tooltip 价格列读 MarginView.effectivePrice（显示价 = 手调价）。
    const titles = Array.from(document.querySelectorAll('svg rect title')).map((title) => title.textContent ?? '');
    expect(titles.some((title) => title.includes(week.weekId) && title.includes(`价格 $${week.price + 100}`))).toBe(true);
  });
});

// ============================================================
// 2026-11-05 拍板实施：默认视图 / 收起区 / 图宽对齐 / 风格对齐价格走势页
// ============================================================
describe('成本销毛 · 默认视图与收起区（margin-card-hifi 推荐稿）', () => {
  it('默认视图 = 卡头 + 周销毛柱图 + 图例：「成本参考与调价回路」「输出与规则」默认 aria-expanded=false 且内容不渲染', () => {
    renderCard(baseResult);
    for (const label of ['成本参考与调价回路', '输出与规则']) {
      const section = document.querySelector(`[data-collapsible-section="${label}"]`);
      expect(section).not.toBeNull();
      const toggle = section!.querySelector('[data-collapsible-toggle]');
      expect(toggle!.getAttribute('aria-expanded')).toBe('false');
    }
    // 收起内容不渲染：成本参考区 / 链路条 / 回读行 / 输出框都不可见
    expect(document.querySelector('[data-zone="cost-reference"]')).toBeNull();
    expect(document.querySelector('[data-flow-bar]')).toBeNull();
    expect(document.querySelector('[data-evidence-panel]')).toBeNull();
    expect((document.body.textContent ?? '')).not.toContain('成本参考区');
    expect((document.body.textContent ?? '')).not.toContain('含成本假设');
    // 默认视图仍可见：卡头 + 销毛柱图 + 图例
    expect(document.querySelector('svg[role="img"]')).not.toBeNull();
    expect(marginBars().length).toBeGreaterThan(0);
    expect(document.querySelectorAll('button[aria-pressed]').length).toBe(3);
  });

  it('不加时间轨（全局退役）：无时间轨预设与拖柄文案', () => {
    renderCard(baseResult);
    const text = document.body.textContent ?? '';
    for (const banned of ['全期', '近 8 周', '时间轨']) {
      expect(text).not.toContain(banned);
    }
    expect(document.querySelector('[data-timetrack]')).toBeNull();
  });

  it('图宽与库存卡同宽对齐：viewBox 720×252（与库存卡同尺寸）· minWidth 700 · 全期周域（首末周都在图上）', () => {
    renderCard(baseResult);
    const svg = document.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 720 252');
    expect(svg.style.minWidth).toBe('700px');
    // 全期域：周刻度覆盖整段（首周与末周标签都在）
    const tickTexts = Array.from(svg.querySelectorAll('text')).map((node) => node.textContent ?? '');
    expect(tickTexts).toContain(baseResult.weeks[0]!.weekId);
    expect(tickTexts).toContain(baseResult.weeks[baseResult.weeks.length - 1]!.weekId);
  });

  it('链路条改用共享 FlowBar（去编号）：节点文本不以数字开头，与库存卡同款', () => {
    renderCard(baseResult);
    expandCostOps();
    const steps = Array.from(document.querySelectorAll('[data-flow-step]')) as HTMLElement[];
    for (const step of steps) {
      expect((step.textContent ?? '').trim()).not.toMatch(/^\d/);
    }
  });

  it('svg 轴文本取值对齐价格走势页（全局 #8）：fontFamily=Inter 栈 · 字号 10–11 · color.mute · tabular-nums', () => {
    renderCard(baseResult);
    const texts = Array.from(document.querySelectorAll<SVGTextElement>('svg[role="img"] text[fill="#737373"]'));
    expect(texts.length).toBeGreaterThan(0);
    for (const node of texts) {
      expect(node.getAttribute('font-family')).toContain('Inter');
      const size = Number(node.getAttribute('font-size'));
      expect(size).toBeGreaterThanOrEqual(10);
      expect(size).toBeLessThanOrEqual(11);
      expect(node.style.fontVariantNumeric).toBe('tabular-nums');
    }
  });
});
