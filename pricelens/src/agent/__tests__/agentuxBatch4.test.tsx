// t428u Batch4（2026-11-07）：Agent 全链路 UX——empty 状态机、结果卡结构
// （规则边界 / 暂无快照）、真实绑定 handler 的药丸（回看走势 / 打开预警 /
// 迭代渠道工作台深链）、forecast 页快问与语音降级文案。
// 收口（同日）：Codex 稳定线审查共性缺陷 R1–R8 的免疫修复回归——
// R1 查看证据不被 stale gate / R2 空卡五段结构 / R3 终态收敛工具卡 /
// R4 空优势卡调整范围重跑 / R5 跨国跳转带请求国 / R6 范围合并计算 /
// R7 行级动作在判断边界后 / R8 tokens 化（rg 自检）。
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters, FiltersProvider, useFilters } from '../../state/FiltersContext';
import { PageProvider } from '../../state/PageContext';
import { AgentProvider, useAgent } from '../../state/AgentContext';
import AgentPanel from '../../components/Copilot/AgentPanel';
import { navBus } from '../../state/navBus';
import { AGENT_STATUS_LABELS, agentSuggestionsForPage } from '../../components/Copilot/agentCopy';
import { buildAgentContext, buildFilterPatch, classifyIntent, runAgent } from '../core';
import { validateAgentRun } from '../schema';
import { finalizeStepsForTerminalRun } from '../contracts';
import type { ChartResultCard } from '../contracts';
import { groupsFromBenchmark } from '../../state/configStore';
import { buildCards } from '../../state/mainSelection';
import { lowestPriceColorSku } from '../../dataModel/aggregate';

Object.defineProperty(window, 'matchMedia', { writable: true, value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) });
afterEach(() => cleanup());

const own = dimProduct.find((row) => row.is_own && row.industry === 'phone' && row.countries.includes('RU'))!;
const main = { modelId: own.model_id, romram: own.romram, skuIds: [own.sku_id] };
const state = { ...defaultFilters, mains: buildCards([main], { auto: true }), adaptive: false, rangeStart: '202619', rangeEnd: '202642' };
/** 二审 R5：AE/RU 双在架、且非两国默认主品的 own 型号（nova 14 pro）——
 *  用于验证「回看价格走势」跨国切换不会被重算成默认 Pura */
const novaRow = dimProduct.find((row) => row.model_id === 'own-huawei-nova-14-pro')!;
const novaMain = { modelId: novaRow.model_id, romram: novaRow.romram, skuIds: [lowestPriceColorSku(novaRow.model_id, novaRow.romram, 'RU') ?? novaRow.sku_id] };

function AppHarness() {
  const { openAgent } = useAgent();
  const { state: filterState, actions } = useFilters();
  // 每个用例自带口径准备：FiltersProvider 会把状态写入 localStorage，
  // 同文件内 mount 会回放上一用例的载荷，不能依赖默认态隐式成立。
  const prepareReset = () => actions.reset();
  const prepareScope = () => actions.set({ mains: buildCards([main], { auto: true }), adaptive: false, rangeStart: '202619', rangeEnd: '202642' });
  const prepareAlerts = () => actions.setAlertSubs([`${own.model_id}__${own.romram.replace(/\s+/g, '')}`], true);
  const prepareStale = () => actions.set({ currency: 'local' });
  const prepareAe = () => actions.set({ countryCode: 'AE', mains: buildCards([main], { auto: true }), adaptive: false, rangeStart: '202619', rangeEnd: '202642' });
  const prepareAeNova = () => actions.set({ countryCode: 'AE', mains: buildCards([novaMain], { auto: true, countryCode: 'AE' }), adaptive: false, rangeStart: '202619', rangeEnd: '202642' });
  const prepareEmptyAdvantage = () => actions.set({ mains: buildCards([main], { auto: true }), adaptive: false, rangeStart: '202619', rangeEnd: '202618' });
  return <><button type="button" onClick={() => openAgent('dock')}>打开 Agent</button><button type="button" onClick={prepareReset}>重置口径</button><button type="button" onClick={prepareScope}>准备口径</button><button type="button" onClick={prepareAlerts}>准备预警</button><button type="button" onClick={prepareStale}>换口径</button><button type="button" onClick={prepareAe}>切到 AE</button><button type="button" onClick={prepareAeNova}>准备 AE Nova</button><button type="button" onClick={prepareEmptyAdvantage}>准备空优势</button><AgentPanel /><output data-filter-state>{JSON.stringify(filterState)}</output></>;
}

function mountedApp() {
  return render(<PageProvider><FiltersProvider><AgentProvider><AppHarness /></AgentProvider></FiltersProvider></PageProvider>);
}

async function submit(text: string): Promise<void> {
  fireEvent.change(screen.getByRole('textbox', { name: '向 PriceLens Agent 提问' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
}

describe('agentux Batch4 状态机与结果卡契约（纯函数层）', () => {
  it('AgentRunStatus 增补 empty，schema 校验通过且状态文案齐全', () => {
    expect(AGENT_STATUS_LABELS.empty).toContain('无结果');
    const run = { id: 'run-1', requestId: 'req-1', status: 'empty', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), context: buildAgentContext('dashboard', state, []), events: [] };
    expect(validateAgentRun(run).valid).toBe(true);
  });

  it('无预警时「解释最新预警」产生零卡片响应（empty 的确定性来源）', async () => {
    expect(classifyIntent('解释最新预警')).toBe('alert');
    const response = await runAgent('解释最新预警', buildAgentContext('alerts', { ...defaultFilters, mains: [] }, []), undefined, 'alert');
    expect(response.intent).toBe('alert');
    expect(response.cards.length).toBe(0);
  });

  it('forecast 页快问首项为「解释量价预测」，prompt 命中真实 forecast_explain 分类', () => {
    const actions = agentSuggestionsForPage('forecast');
    expect(actions[0]?.label).toBe('解释量价预测');
    expect(actions[0]?.prompt).toBeTruthy();
    expect(classifyIntent(actions[0]!.prompt!)).toBe('forecast_explain');
    for (const page of ['dashboard', 'alerts', 'intelligence', 'volume']) {
      expect(agentSuggestionsForPage(page).every((action) => action.label && action.intent !== 'clarify' && action.prompt), page).toBe(true);
    }
  });
});

describe('agentux Batch4 面板交互（empty 卡 / 药丸 / 降级文案）', () => {
  it('零结果响应渲染 empty 状态卡，且「缩小到最近 8 周」触发真实筛选预览', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('解释最新预警');
    const emptyCard = await screen.findByText('无结果 · 当前口径没有可展示的结果');
    expect(view.container.querySelector('[data-agent-empty-card]')).toBeTruthy();
    expect(screen.getByText(/暂无快照/)).toBeTruthy();
    void emptyCard;
    fireEvent.click(screen.getByRole('button', { name: '缩小到最近 8 周' }));
    await waitFor(() => expect(screen.getByText('筛选预览（尚未应用）')).toBeTruthy());
    view.unmount();
  });

  it('价格优势卡的药丸绑定真实动作：回看走势定位周 / 打开价格预警 / 跳 GTM 情报', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('价格优势');
    await screen.findByText('价格优势 · 我司 vs 核心竞品');
    const cards = view.container.querySelectorAll('[data-agent-result-card]');
    const card = within(cards[cards.length - 1] as HTMLElement);
    // 结论 → 事实 → 规则/计算边界：规则文案带标签展示
    expect(card.getByText(/规则 · 计算边界/)).toBeTruthy();
    // R2 M1 语义下按序验证：回看走势（同国不换口径，消息保持未锁）→ 跳 GTM
    // （页面变化使消息进入 stale 锁）→ 打开价格预警（纯 prompt 快问，永不锁）。
    fireEvent.click(card.getByRole('button', { name: '回看价格走势' }));
    await waitFor(() => expect(window.location.search).not.toContain('p=intelligence'));
    expect(navBus.dashboardFocusWeekId).toMatch(/^2026\d{2}$/);
    // 迭代渠道工作台捷径（jsdom 为 iterate 通道）
    fireEvent.click(card.getByRole('button', { name: '跳 GTM 情报' }));
    await waitFor(() => expect(window.location.search).toContain('p=intelligence'));
    // 打开价格预警：纯 prompt 快问触发真实 price_alert 运行并产出预警事件卡
    fireEvent.click(card.getByRole('button', { name: '打开价格预警' }));
    await waitFor(() => expect(screen.getByText(/价格预警 · \d+ 条当前事件/)).toBeTruthy());
    view.unmount();
  });

  it('语音不可用时给出可见降级文案，而不是只剩禁用图标', () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    expect(screen.getByText(/当前浏览器不支持语音输入，请直接文字提问/)).toBeTruthy();
    view.unmount();
  });
});

describe('agentux Batch4 收口：共性缺陷 R1–R8 免疫修复', () => {
  const lastResultCard = (view: ReturnType<typeof mountedApp>) => {
    const cards = view.container.querySelectorAll('[data-agent-result-card]');
    return cards[cards.length - 1] as HTMLElement;
  };
  /** 运行中的 partialCards 也带 data-agent-result-card；先等消息级「事实来源」
   *  note 出现（只在终态 assistant 消息渲染），再取卡，避免拿到会被卸载的流式卡。 */
  const findCompletedCard = async (view: ReturnType<typeof mountedApp>, matcher: (card: Element) => boolean) => {
    await waitFor(() => expect(screen.getAllByText(/事实来源：本地确定性引擎/).length).toBeGreaterThan(0));
    return waitFor(() => {
      const found = [...view.container.querySelectorAll('[data-agent-result-card]')].filter(matcher).pop();
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
  };

  it('R3 终态收敛：running/queued 步骤按终态收敛，已终态步骤保持原样', () => {
    const steps = [
      { id: 's1', tool: 'catalog.resolve' as const, label: '解析产品与口径', detail: '', durationMs: 1, status: 'running' as const },
      { id: 's2', tool: 'series.query' as const, label: '查询价格序列', detail: '', durationMs: 1, status: 'queued' as const },
      { id: 's3', tool: 'series.compare' as const, label: '计算变化', detail: '', durationMs: 1, status: 'warning' as const },
      { id: 's4', tool: 'view.preview' as const, label: '生成结论', detail: '', durationMs: 1, status: 'failed' as const },
    ];
    expect(finalizeStepsForTerminalRun(steps, 'completed').map((step) => step.status)).toEqual(['success', 'success', 'warning', 'failed']);
    expect(finalizeStepsForTerminalRun(steps, 'empty').map((step) => step.status)).toEqual(['success', 'success', 'warning', 'failed']);
    expect(finalizeStepsForTerminalRun(steps, 'failed').map((step) => step.status)).toEqual(['failed', 'failed', 'warning', 'failed']);
    expect(finalizeStepsForTerminalRun(steps, 'cancelled').map((step) => step.status)).toEqual(['failed', 'failed', 'warning', 'failed']);
  });

  it('R3 面板：运行进入终态后工具卡全部呈现终态，无「运行中」残留（含 warning 步骤）', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '重置口径' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('解释最新预警');
    await screen.findByText('无结果 · 当前口径没有可展示的结果');
    expect(view.container.querySelectorAll('[data-tool-call-card]').length).toBeGreaterThan(0);
    expect(screen.queryByText('运行中')).toBeNull();
    expect(screen.getByText('已完成 · 注意')).toBeTruthy();
    view.unmount();
  });

  it('R2 空结果卡按「结论 → 事实 → 计算/规则 → 判断边界 → 动作」顺序显式分段', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '重置口径' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('解释最新预警');
    const emptyTitle = await screen.findByText('无结果 · 当前口径没有可展示的结果');
    const card = emptyTitle.closest('[data-agent-empty-card]') as HTMLElement;
    const text = card.textContent ?? '';
    const order = ['无结果 · 当前口径没有可展示的结果', '事实：', '计算 / 规则：', '判断边界：', '缩小到最近 8 周'].map((key) => text.indexOf(key));
    for (const index of order) expect(index).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    view.unmount();
  });

  it('R2 空/未监控预警卡也显式给出 计算/规则 与 判断边界，且动作在边界之后', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '重置口径' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('价格预警');
    await screen.findByText(/价格预警 · 0 条当前事件/);
    const card = lastResultCard(view);
    const text = card.textContent ?? '';
    expect(text).toContain('计算 / 规则：');
    expect(text).toContain('判断边界：');
    expect(text).toContain('未监控');
    expect(text.indexOf('判断边界：')).toBeGreaterThan(0);
    expect(text.indexOf('判断边界：')).toBeLessThan(text.indexOf('打开预警中心'));
    view.unmount();
  });

  it('R1 上下文变化后「查看证据」仍可原地展开；仅导航/筛选动作被 stale 保护', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '准备口径' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('查我司产品价格');
    const chartOf = () => [...view.container.querySelectorAll('[data-agent-result-card]')].find((card) => card.textContent?.includes('价格走势')) as HTMLElement;
    await findCompletedCard(view, (card) => Boolean(card.textContent?.includes('价格走势')));
    // 换币种 → contextFingerprint 变化：open 导航动作进入 stale 保护
    fireEvent.click(screen.getByRole('button', { name: '换口径' }));
    await waitFor(() => expect([...chartOf().querySelectorAll('button')].some((button) => (button.textContent ?? '').includes('需刷新'))).toBe(true));
    const staleAction = [...chartOf().querySelectorAll('button')].find((button) => (button.textContent ?? '').includes('需刷新')) as HTMLButtonElement;
    expect(staleAction.disabled).toBe(true);
    // R1：查看证据是原地只读展开历史卡自身证据，绝不参与 stale gate
    const evidenceToggle = within(chartOf()).getAllByRole('button', { name: /查看证据/ })[0] as HTMLButtonElement;
    expect(evidenceToggle.disabled).toBeFalsy();
    fireEvent.click(evidenceToggle);
    expect(within(chartOf()).getAllByText(/统一价格聚合引擎/).length).toBeGreaterThan(0);
    view.unmount();
  });

  it('R4 空优势卡「调整范围 · 最近 12 周」显式应用范围并重跑 price_advantage（不落纯 filter 预览）', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '准备空优势' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('价格优势');
    await screen.findByText('当前筛选下没有可同时对齐的周度事实。');
    fireEvent.click(screen.getByRole('button', { name: '调整范围 · 最近 12 周' }));
    await waitFor(() => {
      const next = JSON.parse(view.container.querySelector('[data-filter-state]')?.textContent ?? '{}');
      expect(next.rangeStart).toBe('202635');
      expect(next.rangeEnd).toBe('202646');
      expect(next.adaptive).toBe(false);
    });
    const rerunCard = await waitFor(() => {
      const advantageCards = [...view.container.querySelectorAll('[data-agent-result-card]')].filter((card) => card.textContent?.includes('价格优势 · 我司 vs 核心竞品'));
      expect(advantageCards.length).toBe(2);
      const latest = advantageCards[advantageCards.length - 1] as HTMLElement;
      expect(within(latest).getAllByRole('button', { name: /定位 / }).length).toBeGreaterThan(0);
      return latest;
    });
    expect(rerunCard.textContent).not.toContain('筛选预览');
    view.unmount();
  });

  it('R5 纯函数：AE 页问「RU 价格优势」按请求国 RU 计算并取 RU 竞品矩阵', async () => {
    const aeState = { ...defaultFilters, countryCode: 'AE', mains: buildCards([main], { auto: true, countryCode: 'AE' }) };
    const response = await runAgent('RU 价格优势', buildAgentContext('dashboard', aeState, []), undefined, 'price_advantage');
    const card = response.cards[0];
    expect(card?.kind).toBe('price_advantage');
    if (card?.kind === 'price_advantage') {
      expect(card.rows.length).toBeGreaterThan(0);
      expect(card.rows.every((row) => row.countryCode === 'RU')).toBe(true);
      const ruMatrix = new Set(groupsFromBenchmark([main], 'RU').map((sel) => sel.modelId));
      expect(ruMatrix.size).toBeGreaterThan(0);
      for (const row of card.rows) expect(ruMatrix.has(row.compareSelection.modelId)).toBe(true);
    }
  });

  it('R5 面板：跨国结果卡「回看价格走势」带请求国 filterPatch 跳往 RU', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '切到 AE' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('RU 价格优势');
    const card = await findCompletedCard(view, (element) => Boolean(element.textContent?.includes('价格优势 · 我司 vs 核心竞品')));
    expect(within(card).getAllByRole('button', { name: /定位 / }).length).toBeGreaterThan(0);
    fireEvent.click(within(card).getByRole('button', { name: '回看价格走势' }));
    await waitFor(() => {
      const next = JSON.parse(view.container.querySelector('[data-filter-state]')?.textContent ?? '{}');
      expect(next.countryCode).toBe('RU');
      expect(next.mains.length).toBeGreaterThan(0);
    });
    view.unmount();
  });

  it('R6 「最近 8 周」等带范围查询用合并新 recentRange 后的 state 计算', async () => {
    const response = await runAgent('最近 8 周哪个平台最便宜？', buildAgentContext('dashboard', state, []), undefined, 'query');
    const chart = response.cards.find((card) => card.kind === 'chart');
    expect(chart).toBeTruthy();
    if (chart?.kind === 'chart') expect(chart.note).toContain('202639–202646');
  });

  it('R7 真实预警展开态：行级动作位于「判断边界」之后', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '重置口径' }));
    fireEvent.click(screen.getByRole('button', { name: '准备预警' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('价格预警');
    const cardEl = await findCompletedCard(view, (element) => /[1-9]\d* 条当前事件/.test(element.textContent ?? ''));
    const toggle = within(cardEl).getAllByRole('button').find((button) => /HUAWEI/.test(button.textContent ?? ''));
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle as HTMLElement);
    const expanded = await waitFor(() => {
      const text = cardEl.textContent ?? '';
      expect(text).toContain('判断边界：');
      return text;
    });
    // 卡级判断边界段（R2）与行级判断边界（展开行内）同时存在
    expect(expanded.split('判断边界：').length).toBeGreaterThan(2);
    expect(expanded.indexOf('触发事实：')).toBeGreaterThan(0);
    expect(expanded.indexOf('触发事实：')).toBeLessThan(expanded.indexOf('应用预警筛选'));
    // R7：行级动作（应用预警筛选/查看完整证据）位于行级判断边界之后
    expect(expanded.lastIndexOf('判断边界：')).toBeLessThan(expanded.indexOf('应用预警筛选'));
    view.unmount();
  });
});

describe('agentux Batch4 二审深水区：R5 主品口径跨国保持 / R6 周粒度强同步', () => {
  it('R5 面板：AE 主品 Nova 14 Pro 问「RU 价格优势」→「回看价格走势」后主品仍是 Nova（不回落默认 Pura）', async () => {
    window.sessionStorage.clear();
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '准备 AE Nova' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('RU 价格优势');
    // 先等终态消息（「事实来源」note 只在完成后渲染），避免抓到流式 partial 卡的
    // 脱挂节点（点击不冒泡 = 静默无效）
    await waitFor(() => expect(screen.getAllByText(/事实来源：本地确定性引擎/).length).toBeGreaterThan(0), { timeout: 5000 });
    const card = await waitFor(() => {
      const found = [...view.container.querySelectorAll('[data-agent-result-card]')].filter((element) => element.textContent?.includes('价格优势 · 我司 vs 核心竞品')).pop();
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    // 结果行按请求国 RU 计算且主品是 Nova（跨国计算口径正确）
    const novaRows = within(card).getAllByRole('button', { name: /定位 .*nova 14 pro.* \d{6}/i });
    expect(novaRows.length).toBeGreaterThan(0);
    fireEvent.click(within(card).getByRole('button', { name: '回看价格走势' }));
    await waitFor(() => {
      const next = JSON.parse(view.container.querySelector('[data-filter-state]')?.textContent ?? '{}');
      expect(next.countryCode).toBe('RU');
      // 关键断言：filterPatch 携带的主品口径在跨国切换后保留，不被默认 Pura 重算
      expect(next.mains.map((item: { main: { modelId: string } | null }) => item.main?.modelId)).toEqual(['own-huawei-nova-14-pro']);
    }, { timeout: 3000 });
    view.unmount();
  }, 15000);

  it('R6 月粒度看板「最近 8 周」：buildFilterPatch 显式切 week + 关自适应（202636–202643）', () => {
    const monthState = { ...defaultFilters, granularity: 'month' as const, mains: buildCards([main], { auto: true }), adaptive: false, rangeStart: '202606', rangeEnd: '202611' };
    const patch = buildFilterPatch('只看最近 8 周', monthState);
    expect(patch.granularity).toBe('week');
    expect(patch.adaptive).toBe(false);
    expect(patch.rangeStart).toBe('202639');
    expect(patch.rangeEnd).toBe('202646');
    const quarterPatch = buildFilterPatch('最近 12 周', { ...monthState, granularity: 'quarter' as const });
    expect(quarterPatch.granularity).toBe('week');
    expect(quarterPatch.rangeStart).toBe('202635');
  });

  it('R6 forced query / price_advantage 合并「最近 N 周」后的读数是 week 口径，无 month · 2026xxxx 错配', async () => {
    const monthState = { ...defaultFilters, granularity: 'month' as const, mains: buildCards([main], { auto: true }), adaptive: false, rangeStart: '202606', rangeEnd: '202611' };
    const queryResponse = await runAgent('最近 8 周哪个平台最便宜？', buildAgentContext('dashboard', monthState, []), undefined, 'query');
    const chart = queryResponse.cards.find((item): item is ChartResultCard => item.kind === 'chart');
    expect(chart).toBeTruthy();
    expect(chart!.note).toContain('week · 202639–202646');
    expect(JSON.stringify(queryResponse.cards)).not.toMatch(/month · 2026\d{4}/);
    // 价格优势意图同样合并周口径：行周次与证据范围都收敛到最近 8 周
    const advResponse = await runAgent('最近 8 周价格优势', buildAgentContext('dashboard', monthState, []), undefined, 'price_advantage');
    const advCard = advResponse.cards[0];
    expect(advCard?.kind).toBe('price_advantage');
    if (advCard?.kind === 'price_advantage') {
      expect(advCard.evidence?.[0]?.detail).toContain('202639–202646');
      for (const row of advCard.rows) expect(row.weekId >= '202639').toBe(true);
    }
  });
});
