// ============================================================
// t428u Round 3（三轮返修）m3 · 错指纹消息上所有改筛选类控件的完整锁定。
// 复现：CardActions 药丸动作已按 R8 锁定，但三个旁路控件漏网——
//  1) FilterCard applied 态的 撤销/重做（canUndo/canRedo 来自全局 undo 栈，
//     appliedFilterIds 跨消息共享：同 id 卡可在早前未锁消息应用、随后出现在
//     锁定消息里）；
//  2) ToolCallCard.filterCard 的 撤销恢复（裸挂 onClick，始终可点）；
//  3) PriceAdvantageCard 已定位后的 撤销定位。
// 契约：disabled + 回调守卫双保险（fireEvent.click 对 disabled 元素仍会派发，
// 只靠 disabled 属性挡不住程序化点击）；evidence 保持只读豁免可展开。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// 2026-11-07 整合：稳定栈只在稳定构建启用，其测试按出货通道（STABLE）运行
vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
  resolveAppChannel: (): 'stable' => 'stable',
}));
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AgentRunRequest } from '../../agent-stable';

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), clear: vi.fn(), dispose: vi.fn() })),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, ScatterChart: {} }));
vi.mock('echarts/components', () => ({
  GridComponent: {}, TooltipComponent: {}, LegendComponent: {}, MarkAreaComponent: {},
  MarkLineComponent: {}, MarkPointComponent: {}, DataZoomComponent: {}, BrushComponent: {}, VisualMapComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

// 挂起式 client（同 AgentContext.stale-guard 手法）：release(override) 才送达响应，
// override 可覆写 contextFingerprint（伪造错指纹）与 cards（注入同 id 卡/工具卡）。
const bridge = vi.hoisted(() => ({ pending: [] as Array<{ request: unknown; release: (override?: Record<string, unknown>) => void }> }));

vi.mock('../../agent-stable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent-stable')>();
  return {
    ...actual,
    defaultAgentClient: () => ({
      run: (request: AgentRunRequest) =>
        new Promise((resolve) => {
          bridge.pending.push({
            request,
            release: (override: Record<string, unknown> = {}) => {
              void actual.runAgent(request.text, request.context, undefined, request.intent, request.forecastDraft, request.forecastSnapshot, request.forecastDataset)
                .then((response) => resolve({ ...response, ...override }));
            },
          });
        }),
    }),
  };
});

import App from '../../App';
import { FiltersProvider, defaultFilters, useFilters } from '../../state/FiltersContext';
import { AgentProvider, useAgent } from '../../state/AgentContextStable';
import { PageProvider } from '../../state/PageContext';
import type { FiltersState } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { calculatePriceAdvantage } from '../../agent-stable/priceAdvantage';
import type { FilterResultCard, PriceAdvantageResultCard, ToolCallCard } from '../../agent-stable/contracts';
import AgentPanel, { CardActionsLockedContext, FilterCard, PriceAdvantageCard, ToolCallCardView } from '../CopilotStable/AgentPanel';

beforeEach(() => {
  const w = window as unknown as { localStorage?: Storage };
  if (!w.localStorage) {
    const mem = new Map<string, string>();
    const shim: Storage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, String(v)),
      removeItem: (k) => void mem.delete(k),
      clear: () => void mem.clear(),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
    Object.defineProperty(w, 'localStorage', { configurable: true, value: shim });
  }
  window.history.replaceState(null, '', '/?p=dashboard');
  sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  bridge.pending.length = 0;
});

/** 同 id 筛选卡：两次运行复用（第一次未锁应用、第二次错指纹） */
function craftedFilterCard(id: string): FilterResultCard {
  return {
    kind: 'filter',
    id,
    title: '筛选预览（尚未应用）',
    prompt: '只看本币',
    patch: { currency: 'local' },
    changes: [{ label: '币种', before: 'USD', after: '本币' }],
  };
}

function craftedToolCard(filterCard: FilterResultCard): ToolCallCard {
  return {
    kind: 'tool_call',
    id: 'tool-r3-lock',
    tool: 'series.query',
    status: 'success',
    inputSummary: '读取价格',
    outputSummary: '已返回结构化结果',
    filterCard,
  };
}

function openPanel(): HTMLElement {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /打开 PriceAgent/ }));
  return screen.getByRole('dialog');
}

async function sendFromPanel(panel: HTMLElement, text: string): Promise<void> {
  const input = within(panel).getByLabelText('向 PriceAgent 提问');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(within(panel).getByRole('button', { name: '发送' }));
}

function lastMessage(panel: HTMLElement): HTMLElement {
  const messages = panel.querySelectorAll('[data-agent-message]');
  expect(messages.length).toBeGreaterThan(0);
  return messages[messages.length - 1] as HTMLElement;
}

describe('t428u R3 m3 · 锁定消息上的改筛选控件双保险（disabled + 回调守卫）', () => {
  it('applied FilterCard 的 撤销/重做 在锁定消息上禁用且程序化点击不改筛选；evidence 仍可展开', async () => {
    function lockedFilterHarness(locked: boolean): ReactNode {
      const card = craftedFilterCard('r3-fixed-filter');
      return <FiltersProvider><PageProvider><AgentProvider><CardActionsLockedContext.Provider value={locked}><FilterCard card={card} /></CardActionsLockedContext.Provider></AgentProvider></PageProvider></FiltersProvider>;
    }
    const view = render(lockedFilterHarness(false));
    fireEvent.click(screen.getByRole('button', { name: '应用到看板' }));
    await waitFor(() => expect(screen.getByText('已应用')).toBeTruthy());

    view.rerender(lockedFilterHarness(true));
    const undo = screen.getByRole('button', { name: /撤销/ }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(undo);
    await new Promise((resolve) => { setTimeout(resolve, 120); });
    expect(screen.getByText('已应用')).toBeTruthy();

    const detailSummary = screen.getByText(/证据与来源/);
    expect((detailSummary.closest('details') as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(detailSummary);
    expect((detailSummary.closest('details') as HTMLDetailsElement).open).toBe(true);
  });

  it('ToolCallCard.filterCard 的 应用筛选/撤销恢复 在锁定消息上双双禁用，点击无副作用', async () => {
    const panel = openPanel();
    await sendFromPanel(panel, '只看本币');
    await waitFor(() => expect(bridge.pending.length).toBe(1));
    bridge.pending[0].release({ contextFingerprint: 'ctx-forged-r3-tool', cards: [craftedToolCard(craftedFilterCard('r3-tool-filter'))] });
    await waitFor(() => expect(within(panel).getAllByText(/响应口径与当前上下文不一致 · 结果可查看，动作已锁定/).length).toBeGreaterThan(0), { timeout: 4000 });
    const locked = within(lastMessage(panel));
    const apply = locked.getByRole('button', { name: '应用筛选' }) as HTMLButtonElement;
    const undo = locked.getByRole('button', { name: '撤销恢复' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(undo.disabled).toBe(true);
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    // 程序化点击不产生任何筛选副作用（币种保持 USD 默认口径）
    fireEvent.click(apply);
    fireEvent.click(undo);
    await new Promise((resolve) => { setTimeout(resolve, 120); });
    expect(within(panel).queryByText('已应用')).toBeNull();
    expect(within(panel).getAllByText('USD').length).toBeGreaterThan(0);
  });
});

describe('stable Agent · 面板重开后的交易状态与空撤销', () => {
  it('FilterCard 重挂载后保留已应用、撤销和重做状态', () => {
    const card = craftedFilterCard('persist-filter-card');
    function Harness({ show }: { show: boolean }) {
      return <FiltersProvider><PageProvider><AgentProvider><CardActionsLockedContext.Provider value={false}>{show && <FilterCard card={card} />}</CardActionsLockedContext.Provider></AgentProvider></PageProvider></FiltersProvider>;
    }
    const view = render(<Harness show />);
    fireEvent.click(screen.getByRole('button', { name: '应用到看板' }));
    expect(screen.getByText('已应用')).toBeTruthy();
    view.rerender(<Harness show={false} />);
    view.rerender(<Harness show />);
    expect(screen.getByText('已应用')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /撤销/ }));
    expect(screen.getByText('已撤销')).toBeTruthy();
    view.rerender(<Harness show={false} />);
    view.rerender(<Harness show />);
    expect(screen.getByText('已撤销')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重做/ }));
    expect(screen.getByText('已应用')).toBeTruthy();
  });

  it('ToolCallCard 只在拥有已应用交易时允许撤销，重挂载后仍保留', () => {
    const card = craftedToolCard(craftedFilterCard('persist-tool-filter'));
    function Harness({ show }: { show: boolean }) {
      return <FiltersProvider><PageProvider><AgentProvider><CardActionsLockedContext.Provider value={false}>{show && <ToolCallCardView card={card} />}</CardActionsLockedContext.Provider></AgentProvider></PageProvider></FiltersProvider>;
    }
    const view = render(<Harness show />);
    expect((screen.getByRole('button', { name: '撤销恢复' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }));
    expect((screen.getByRole('button', { name: '撤销恢复' }) as HTMLButtonElement).disabled).toBe(false);
    view.rerender(<Harness show={false} />);
    view.rerender(<Harness show />);
    expect((screen.getByRole('button', { name: '撤销恢复' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '撤销恢复' }));
    expect((screen.getByRole('button', { name: '撤销恢复' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('t428u R3 m3 · 已定位价格优势卡的 撤销定位 随锁禁用', () => {
  // matrix-only（2026-11-10）：优势卡需真实行，主品改用矩阵有覆盖的 nova 15 12+256
  // （旧锚 nova 14 Pro 无矩阵对比位，优势恒 0 行、行级定位按钮不存在）。
  const NOVA = { modelId: 'own-huawei-nova-15', romram: '12+256 GB', skuIds: ['own-huawei-nova-15__12-256gb__black'] };

  function lockedHarness(locked: boolean, card: PriceAdvantageResultCard): ReactNode {
    return (
      <FiltersProvider>
        <PageProvider>
          <AgentProvider>
            <CardActionsLockedContext.Provider value={locked}>
              <PriceAdvantageCard card={card} />
            </CardActionsLockedContext.Provider>
          </AgentProvider>
        </PageProvider>
      </FiltersProvider>
    );
  }

  it('未锁时定位可用 → 已定位后锁生效：撤销定位 disabled + aria-disabled，evidence 可展开', async () => {
    const state: FiltersState = { ...defaultFilters, countryCode: 'RU', mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }) };
    // 空指纹 = 卡不按 stale 处理（锁定态由 Harness 直接控制，隔离验证 m3 锁本身）
    const card = calculatePriceAdvantage(state, '');
    expect(card).toBeTruthy();
    expect(card!.rows.length).toBeGreaterThan(0);

    const view = render(lockedHarness(false, card!));
    const row = document.querySelector('[data-price-advantage-row]') as HTMLElement;
    fireEvent.click(row);
    expect(screen.queryByText(/已定位到看板/)).toBeNull();
    expect(screen.queryByRole('group', { name: '确认调整看板筛选' })).toBeNull();
    const locateButtons = screen.getAllByRole('button', { name: /定位 .*2026/ });
    expect(locateButtons.length).toBeGreaterThan(0);
    fireEvent.click(locateButtons[0]);
    expect(screen.getByRole('group', { name: '确认调整看板筛选' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认并继续' }));
    await waitFor(() => expect(screen.getByText(/已定位到看板/)).toBeTruthy());
    const undoBefore = screen.getByRole('button', { name: '撤销定位' }) as HTMLButtonElement;
    expect(undoBefore.disabled).toBe(false);

    // 同一组件实例上翻转锁定（消息级锁在渲染期间生效）：撤销定位随之禁用
    view.rerender(lockedHarness(true, card!));
    const undoAfter = screen.getByRole('button', { name: '撤销定位' }) as HTMLButtonElement;
    expect(undoAfter.disabled).toBe(true);
    expect(undoAfter.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(undoAfter);
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    // 撤销被守卫拦下：定位提示仍在
    expect(screen.getByText(/已定位到看板/)).toBeTruthy();

    // evidence 豁免：锁定态下 查看证据 仍可点击并原地展开证据区
    const evidence = screen.getByRole('button', { name: '查看证据' }) as HTMLButtonElement;
    expect(evidence.disabled).toBe(false);
    fireEvent.click(evidence);
    await waitFor(() => {
      const node = Array.from(document.querySelectorAll('summary')).find((item) => (item.textContent ?? '').includes('证据与来源'));
      expect(node).toBeDefined();
      expect((node!.closest('details') as HTMLDetailsElement).open).toBe(true);
    });
  });
});


describe('assistant-ui · 过期预览与撤销边界', () => {
  function ScopeControls() {
    const { state, actions } = useFilters();
    const { openAgent } = useAgent();
    return <>
      <button type="button" onClick={() => openAgent()}>打开测试 Agent</button>
      <button type="button" onClick={() => actions.set({ currency: 'local' })}>外部切换本币</button>
      <output data-testid="current-currency">{state.currency}</output>
    </>;
  }

  function openScopedPanel() {
    render(<FiltersProvider><PageProvider><AgentProvider><ScopeControls /><AgentPanel /></AgentProvider></PageProvider></FiltersProvider>);
    fireEvent.click(screen.getByRole('button', { name: '打开测试 Agent' }));
    return screen.getByRole('dialog');
  }

  it.each(['filter', 'tool'] as const)('当前范围改变后，旧 %s 预览不能覆盖新筛选', async (kind) => {
    const panel = openScopedPanel();
    await sendFromPanel(panel, '只看美元');
    await waitFor(() => expect(bridge.pending.length).toBe(1));
    const filter: FilterResultCard = { ...craftedFilterCard('stale-preview'), patch: { currency: 'usd' } };
    bridge.pending[0].release({ cards: [kind === 'tool' ? craftedToolCard(filter) : filter] });
    await waitFor(() => expect(within(panel).getByText('价格数据分析')).toBeTruthy());
    if (kind === 'tool') {
      const details = panel.querySelector<HTMLDetailsElement>('[data-agent-execution]');
      expect(details).toBeTruthy();
      fireEvent.click(details!.querySelector('summary')!);
    }
    const apply = within(panel).getByRole('button', { name: kind === 'tool' ? '应用筛选' : '应用到看板' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '外部切换本币' }));
    await waitFor(() => expect(apply.disabled).toBe(true));
    fireEvent.click(apply);
    expect(screen.getByTestId('current-currency').textContent).toBe('local');
  });

  it('应用导致范围改变后仍能撤销，恢复应用前筛选', async () => {
    const panel = openScopedPanel();
    await sendFromPanel(panel, '只看本币');
    await waitFor(() => expect(bridge.pending.length).toBe(1));
    bridge.pending[0].release({ cards: [craftedFilterCard('undo-preview')] });
    const apply = await within(panel).findByRole('button', { name: '应用到看板' });
    fireEvent.click(apply);
    await waitFor(() => expect(screen.getByTestId('current-currency').textContent).toBe('local'));
    const undo = within(panel).getByRole('button', { name: /撤销/ }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    fireEvent.click(undo);
    await waitFor(() => expect(screen.getByTestId('current-currency').textContent).toBe('usd'));
  });
});
