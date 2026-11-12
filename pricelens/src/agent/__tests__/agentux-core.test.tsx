// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters, FiltersProvider, useFilters } from '../../state/FiltersContext';
import { PageProvider } from '../../state/PageContext';
import { AgentProvider, useAgent } from '../../state/AgentContext';
import AgentPanel from '../../components/Copilot/AgentPanel';
import { applyAgentStreamEvent, localAgentClient, mergeRemoteResponse, withLocalFallback, type AgentClient, type AgentStreamState } from '../client';
import { buildAgentContext, buildPriceAdvantageResult, runAgent } from '../core';
import type { AgentAlertRecord, AgentResponse } from '../contracts';
import { buildCards } from '../../state/mainSelection';

Object.defineProperty(window, 'matchMedia', { writable: true, value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) });
afterEach(() => cleanup());

const own = dimProduct.find((row) => row.is_own && row.industry === 'phone' && row.countries.includes('RU'))!;
const main = { modelId: own.model_id, romram: own.romram, skuIds: [own.sku_id] };
const state = { ...defaultFilters, mains: buildCards([main], { auto: true }), adaptive: false, rangeStart: '202619', rangeEnd: '202642' };
const context = buildAgentContext('dashboard', state, []);

function AppHarness() {
  const { openAgent } = useAgent();
  const { state: filterState, actions } = useFilters();
  const prepareAlerts = () => actions.setAlertSubs([`${own.model_id}__${own.romram.replace(/\s+/g, '')}`], true);
  // UI 审计测试用：把主分析卡设为已知我司产品（上下文口径 chip 的显示名/slug 断言依据）
  const setMainProduct = () => actions.setMains(buildCards([main], { auto: true }));
  return <><button type="button" onClick={() => openAgent('dock')}>打开 Agent</button><button type="button" onClick={prepareAlerts}>准备预警</button><button type="button" onClick={setMainProduct}>设定主品</button><AgentPanel /><output data-filter-state>{JSON.stringify(filterState)}</output></>;
}

function mountedApp() {
  return render(<PageProvider><FiltersProvider><AgentProvider><AppHarness /></AgentProvider></FiltersProvider></PageProvider>);
}

describe('agentux-core price advantage and price alert loops', () => {
  it('价格优势只由本地确定性事实计算，并提供四阶段增量事件', async () => {
    const result = buildPriceAdvantageResult(state, context.fingerprint);
    expect(result.card.kind).toBe('price_advantage');
    expect(result.card.rows.length).toBeGreaterThan(0);
    const row = result.card.rows[0];
    expect(row.priceDiff).toBeCloseTo(row.competitor.price - row.own.price, 8);
    expect(row.priceDiffPct).toBeCloseTo(row.priceDiff / row.competitor.price, 8);
    const response = await runAgent('价格优势', context, undefined, 'price_advantage');
    const events: string[] = [];
    await localAgentClient.run({ text: '价格优势', context, clientRequestId: 'agentux-core-advantage', runId: 'agentux-core-advantage', baseline: response }, undefined, (event) => { if (event.message) events.push(event.message); if (event.delta) events.push(event.delta); });
    expect(events.join('|')).toContain('解析意图');
    expect(events.join('|')).toContain('读取价格');
    expect(events.join('|')).toContain('计算优势');
    expect(events.join('|')).toContain('生成结论');
    expect(events.join('|')).toContain('价差');
  });

  it('远端篡改价格被本地卡片拦截并标记校准', async () => {
    const baseline = await runAgent('价格优势', context, undefined, 'price_advantage');
    const remote: AgentResponse = { ...baseline, summary: '远端说价格 99999', provider: { name: '远端 AI 流式', model: 'remote' }, cards: baseline.cards };
    const merged = mergeRemoteResponse(baseline, remote, context.fingerprint);
    expect(merged.cards).toEqual(baseline.cards);
    expect(merged.factGuard?.status).toBe('calibrated');
    expect(merged.factGuard?.message).toContain('本地数据校准');
  });

  it('价格预警返回可展开证据的真实事件列表', async () => {
    const alert: AgentAlertRecord = {
      key: 'own-huawei-test__12+256GB|202642|price-change', alertId: 'alert-agentux-core', seriesKey: 'own-huawei-test__12+256GB', type: 'price-change', brand: 'HUAWEI', modelName: 'Test Phone', romram: '12+256 GB', weekLabel: '10-14', weekId: '202642', price: 499, wowPct: -0.05, promoDeltaPp: null, gapPct: null, gapLowPlatform: null, gapHighPlatform: null, gapLowPrice: null, gapHighPrice: null, isOwn: true, lifecycle: 'new', priority: 'P1', evidence: [{ id: 'e1', label: '触发事实', detail: '周度价格事实', source: '本地规则' }], evidenceStatus: 'verified', countryCode: 'RU', ruleVersion: 'price-rules-v1', dataVersion: 'local-data-v1', contextFingerprint: context.fingerprint,
    };
    const response = await runAgent('价格预警', buildAgentContext('alerts', state, [alert]), undefined, 'price_alert');
    expect(response.intent).toBe('price_alert');
    const card = response.cards[0];
    expect(card?.kind).toBe('alert_list');
    if (card?.kind === 'alert_list') {
      expect(card.alerts[0]?.evidence?.[0]?.detail).toContain('周度价格事实');
      expect(card.note).toContain('四类规则');
    }
  });

  it('价格预警卡可展开证据、定位看板、撤销筛选并回退状态动作', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '准备预警' }));
    const before = JSON.parse(view.container.querySelector('[data-filter-state]')?.textContent ?? '{}');
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    fireEvent.click(await screen.findByRole('button', { name: '价格预警' }));
    await waitFor(() => expect(screen.getAllByText(/事实来源：本地确定性引擎/).length).toBeGreaterThan(0));
    const resultCards = view.baseElement.querySelectorAll('[data-agent-result-card]');
    const resultCard = resultCards[resultCards.length - 1] as HTMLElement | undefined;
    expect(resultCard).toBeTruthy();
    const card = within(resultCard as HTMLElement);
    const alertToggle = card.getAllByRole('button').find((button) => /HUAWEI/.test(button.textContent ?? ''));
    expect(alertToggle).toBeTruthy();
    fireEvent.click(alertToggle as HTMLElement);
    await waitFor(() => expect(card.getAllByText((content) => content.includes('触发事实')).length).toBeGreaterThan(1));
    // R2 M5：折叠行头不再有前置「看板」按钮；行级定位动作 = 展开区判断边界之后的「应用预警筛选」
    fireEvent.click(card.getAllByRole('button', { name: '应用预警筛选' })[0]);
    await waitFor(() => {
      const next = JSON.parse(view.container.querySelector('[data-filter-state]')?.textContent ?? '{}');
      expect(next.granularity).toBe('week');
      expect(next.rangeStart).toBe(next.rangeEnd);
      expect(next.mains.length).toBeGreaterThan(0);
    });
    // R2 M1/B m3：定位改写全局口径 → 本消息自锁，撤销筛选禁用且程序化点击无效
    const lockedUndo = card.getByRole('button', { name: /撤销筛选/ }) as HTMLButtonElement;
    expect(lockedUndo.disabled).toBe(true);
    fireEvent.click(lockedUndo);
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    expect(view.container.querySelector('[data-filter-state]')?.textContent).not.toBe(JSON.stringify(before));
    // 纯 prompt 追问（未锁）发起当前口径新查询：新消息上撤销可用并真实回滚到 before
    // 锁定消息上状态流转同样禁用：程序化点击后不产生「撤销状态变更」
    fireEvent.click(card.getAllByRole('button', { name: /标记已确认|开始核查|标记需行动/ })[0] as HTMLButtonElement);
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    expect(card.queryByRole('button', { name: /撤销状态变更/ })).toBeNull();
    const input = screen.getByRole('textbox', { name: '向 PriceLens Agent 提问' });
    fireEvent.change(input, { target: { value: '价格预警' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    // A placeholder now exists while streaming; wait for the second validated answer.
    await waitFor(() => expect(screen.getAllByText(/事实来源：本地确定性引擎/).length).toBeGreaterThanOrEqual(2), { timeout: 5000 });
    const freshCards = view.baseElement.querySelectorAll('[data-agent-result-card]');
    const freshCardEl = freshCards[freshCards.length - 1] as HTMLElement;
    const freshCard = within(freshCardEl);
    // 新预警卡（未锁）上状态流转可用并可撤销（状态流转不改筛选指纹，消息保持未锁）
    const freshToggle = freshCard.getAllByRole('button').find((button) => /HUAWEI/.test(button.textContent ?? ''));
    expect(freshToggle).toBeTruthy();
    fireEvent.click(freshToggle as HTMLElement);
    await waitFor(() => expect(freshCard.getAllByRole('button', { name: /标记已确认|开始核查|标记需行动/ }).length).toBeGreaterThan(0));
    fireEvent.click(freshCard.getAllByRole('button', { name: /标记已确认|开始核查|标记需行动/ })[0]!);
    expect(await freshCard.findByRole('button', { name: /撤销状态变更/ })).toBeTruthy();
    fireEvent.click(freshCard.getByRole('button', { name: /撤销状态变更/ }));
    // 最后撤销筛选（同一未锁消息上仍可用）：真实回滚到 before 口径
    const freshUndo = await waitFor(() => {
      const button = freshCard.getAllByRole('button', { name: /撤销筛选/ }).find((b) => !(b as HTMLButtonElement).disabled) as HTMLButtonElement;
      expect(button).toBeTruthy();
      return button;
    });
    fireEvent.click(freshUndo);
    await waitFor(() => expect(view.container.querySelector('[data-filter-state]')?.textContent).toBe(JSON.stringify(before)));
    view.unmount();
  }, 30000);

  it('远端失败先回退本地，块内重试后恢复远端叙述', async () => {
    const baseline = await runAgent('价格预警', context, undefined, 'price_alert');
    let attempts = 0;
    const remote: AgentClient = {
      run: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('Agent 服务异常（504）');
        return { ...baseline, provider: { name: '远端 AI 流式', model: 'remote' } };
      },
    };
    const local: AgentClient = { run: async () => baseline };
    const client = withLocalFallback(remote, local);
    const events: string[] = [];
    const fallback = await client.run({ text: '价格预警', context, clientRequestId: 'agentux-core-alert-retry', runId: 'agentux-core-alert-retry', baseline }, undefined, (event) => { if (event.message) events.push(event.message); });
    expect(fallback.provider?.name).toBe('本地确定性回退');
    expect(events).toContain('远端 Agent 服务不可达，已使用本地确定性引擎');
    const retry = await remote.run({ text: '价格预警', context, clientRequestId: 'agentux-core-alert-retry-2', runId: 'agentux-core-alert-retry-2', baseline });
    expect(retry.provider?.name).toBe('远端 AI 流式');
  });

  it('可见 preset chip 只有三条显式核心 intent，点击价格优势进入真实卡片', async () => {
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    fireEvent.click(await screen.findByRole('button', { name: '价格优势' }));
    await screen.findByText('价格优势 · 我司 vs 核心竞品');
    const resultCards = view.baseElement.querySelectorAll('[data-agent-result-card]');
    const resultCard = resultCards[resultCards.length - 1] as HTMLElement;
    const card = within(resultCard);
    expect(screen.getAllByRole('button', { name: '价格优势' }).length).toBeGreaterThan(0);
    fireEvent.click(card.getByRole('button', { name: '只看占优' }));
    expect(card.getByRole('button', { name: '只看占优' }).getAttribute('aria-pressed')).toBe('true');
    const skuChip = card.getAllByRole('button').find((button) => /\d+\+\d+\s*GB/.test(button.textContent ?? ''));
    expect(skuChip).toBeTruthy();
    fireEvent.click(skuChip as HTMLElement);
    const focus = (await card.findAllByRole('button', { name: /定位 .* 20/ }))[0];
    fireEvent.click(focus);
    await waitFor(() => expect(view.container.querySelector('[data-filter-state]')?.textContent).toContain('mains'));
    view.unmount();
  });

  it('Stop 后旧 run 的事件不会写入当前流', () => {
    let stream: AgentStreamState = { text: '', cards: [], events: [], lastSequence: 0 };
    stream = applyAgentStreamEvent(stream, { id: 'new-1', runId: 'new-run', sequence: 1, type: 'text.delta', delta: '新', timestamp: new Date().toISOString() }, 'new-run');
    stream = applyAgentStreamEvent(stream, { id: 'old-2', runId: 'old-run', sequence: 2, type: 'text.delta', delta: '旧', timestamp: new Date().toISOString() }, 'new-run');
    expect(stream.text).toBe('新');
    expect(stream.events.map((event) => event.runId)).toEqual(['new-run']);
  });
});

// ============================================================
// 2026-11-10 UI 审计（面板输入区 + 上下文条信息密度）：
// ① 输入框下方的「引擎来源」小字（本地确定性/平台预设网关/GLM 叙述/本地兜底）
//    是实现名词，不再对业务用户展示——渲染端撤下（契约仍在 agent/remoteConfig.ts）；
//    键盘提示行（Enter 发送 · Shift+Enter 换行）保留。
// ② 顶部上下文条口径 chip：显示名 + 配置 + SKU slug（机器串只留 slug 一处），
//    不再裸显 modelId 把同一机器串暴露两遍。
// ============================================================
describe('Agent 面板输入区与上下文条（UI 审计 2026-11-10）', () => {
  it('输入区不再渲染引擎来源实现名词行，键盘提示行保留', async () => {
    mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await screen.findByRole('textbox', { name: '向 PriceLens Agent 提问' });
    // 两种引擎来源的 label 值都不得出现（env 有无远端地址均覆盖）
    expect(screen.queryByText('本地确定性引擎 · 离线可用')).toBeNull();
    expect(screen.queryByText('平台预设网关 · GLM 叙述 · 本地兜底')).toBeNull();
    expect(screen.queryByText('远端 Agent 叙述 · 本地引擎兜底')).toBeNull();
    expect(screen.getByText(/Enter 发送 · Shift\+Enter 换行/)).toBeTruthy();
  });

  it('上下文口径 chip 只显示产品与配置，技术 SKU 仅留在详情提示', async () => {
    mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '设定主品' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await screen.findByRole('textbox', { name: '向 PriceLens Agent 提问' });
    const chip = screen.getAllByText((content) => content.startsWith('口径 · '))[0];
    expect(chip).toBeTruthy();
    // 默认口径只读到显示名与配置；技术标识通过 tooltip 保留可追溯性。
    expect(chip.textContent).toBe(`口径 · ${own.model_name} · ${own.romram}`);
    expect(chip.getAttribute('title')).toBe(own.sku_id);
  });
});
