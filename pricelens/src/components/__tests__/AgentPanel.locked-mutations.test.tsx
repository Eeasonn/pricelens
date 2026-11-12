// ============================================================
// t428u R2（本轮返修）B m3 · 响应指纹不一致消息上改筛选类控件的完整锁定
// （同步稳定线 7edadc6 AgentPanel.locked-mutations 语义，按迭代线组件结构适配）。
// 复现：CardActions/药丸已按 R8 锁定，但旁路控件漏网——
//  1) FilterCard applied 态的 撤销/重做（appliedFilterIds 跨消息共享：同 id 卡
//     可在早前未锁消息应用、随后出现在锁定消息里）；
//  2) 工具卡（view.preview 步骤）的应用筛选入口——锁定消息上不得再接线。
// 契约：disabled + aria-disabled + 回调守卫三保险（fireEvent.click 对 disabled
// 元素仍会派发）；evidence 类只读展开豁免。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AgentEvent, AgentRunRequest } from '../../agent';

Object.defineProperty(window, 'matchMedia', { writable: true, value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) });

// 挂起式 client（同稳定线手法）：release(override) 才送达响应；override 可覆写
// contextFingerprint（伪造响应指纹 ≠ 请求指纹 → actionsLocked）与 cards（注入同 id 卡）。
const bridge = vi.hoisted(() => ({ pending: [] as Array<{ request: AgentRunRequest; emit: (event: AgentEvent) => void; release: (override?: Record<string, unknown>) => void }> }));

vi.mock('../../agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent')>();
  return {
    ...actual,
    defaultAgentClient: () => ({
      run: (request: AgentRunRequest, _signal?: AbortSignal, onEvent?: (event: AgentEvent) => void) =>
        new Promise((resolve) => {
          bridge.pending.push({
            request,
            emit: (event: AgentEvent) => onEvent?.(event),
            release: (override: Record<string, unknown> = {}) => {
              void actual.runAgent(request.text, request.context, undefined, request.intent, request.forecastDraft, request.forecastSnapshot, request.forecastDataset)
                .then((response) => resolve({ ...response, ...override }));
            },
          });
        }),
    }),
  };
});

import { FiltersProvider } from '../../state/FiltersContext';
import { AgentProvider, useAgent } from '../../state/AgentContext';
import { PageProvider } from '../../state/PageContext';
import AgentPanel from '../Copilot/AgentPanel';
import type { FilterResultCard } from '../../agent/contracts';

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

/** 同 id 筛选卡：两次运行复用（第一次未锁应用、第二次伪造响应指纹） */
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

function Harness(): ReactNode {
  const { openAgent } = useAgent();
  return <><button type="button" onClick={() => openAgent('dock')}>打开 Agent</button><AgentPanel /></>;
}

function mounted(): ReturnType<typeof render> {
  return render(<PageProvider><FiltersProvider><AgentProvider><Harness /></AgentProvider></FiltersProvider></PageProvider>);
}

function openPanel(): HTMLElement {
  mounted();
  fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
  return screen.getByRole('dialog');
}

async function sendFromPanel(panel: HTMLElement, text: string): Promise<void> {
  const input = within(panel).getByLabelText('向 PriceLens Agent 提问');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(within(panel).getByRole('button', { name: '发送' }));
}

function lastMessage(panel: HTMLElement): HTMLElement {
  const messages = panel.querySelectorAll('[data-agent-message]');
  expect(messages.length).toBeGreaterThan(0);
  return messages[messages.length - 1] as HTMLElement;
}

describe('t428u R2 B m3 · 响应指纹不一致消息上的改筛选控件三保险', () => {
  it('流式筛选卡只读，校验完成后可应用并撤销/重做', async () => {
    const panel = openPanel();
    await sendFromPanel(panel, '只看本币');
    await waitFor(() => expect(bridge.pending.length).toBe(1));
    const pending = bridge.pending[0]!;
    const card = pending.request.baseline?.cards.find((item) => item.kind === 'filter');
    expect(card).toBeTruthy();
    act(() => pending.emit({
      id: 'partial-filter', runId: pending.request.runId!, sequence: 1,
      type: 'card.ready', status: 'partial_result', timestamp: new Date().toISOString(), card,
    }));
    await waitFor(() => expect(within(panel).getByRole('button', { name: '应用到看板' })).toBeTruthy());
    const apply = within(panel).getByRole('button', { name: '应用到看板' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(lastMessage(panel).getAttribute('data-message-locked')).toBe('true');
    fireEvent.click(apply);
    expect(within(panel).queryByText('已应用')).toBeNull();
    act(() => pending.release());
    await waitFor(() => expect((within(panel).getByRole('button', { name: '应用到看板' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(panel).getByRole('button', { name: '应用到看板' }));
    await waitFor(() => expect(within(panel).getByText('已应用')).toBeTruthy());
    const scope = panel.querySelector('.aui-context')!;
    expect(scope.textContent).toContain('本币');
    expect(lastMessage(panel).getAttribute('data-message-locked')).toBe('true');
    const appliedCard = within(lastMessage(panel));
    const undo = appliedCard.getByRole('button', { name: /撤销/ }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    fireEvent.click(undo);
    await waitFor(() => expect(scope.textContent).toContain('USD'));
    const redo = appliedCard.getByRole('button', { name: /重做/ }) as HTMLButtonElement;
    expect(redo.disabled).toBe(false);
    fireEvent.click(redo);
    await waitFor(() => expect(scope.textContent).toContain('本币'));
  });

  it('applied FilterCard 的 撤销/重做 在错指纹消息上禁用且程序化点击不改筛选', async () => {
    const panel = openPanel();
    // 第一轮：正常响应（指纹一致）注入固定 id 筛选卡，未锁消息上先应用
    await sendFromPanel(panel, '只看本币');
    await waitFor(() => expect(bridge.pending.length).toBe(1));
    bridge.pending[0]!.release({ cards: [craftedFilterCard('r2-fixed-filter')] });
    await waitFor(() => expect(within(panel).getAllByText('筛选预览（尚未应用）').length).toBeGreaterThan(0));
    fireEvent.click(within(panel).getAllByRole('button', { name: '应用到看板' })[0]!);
    await waitFor(() => expect(within(panel).getAllByText('已应用').length).toBeGreaterThan(0));
    // 应用成功：币种已切本币（撤销栈就绪）
    await waitFor(() => expect(within(panel).getAllByText('本币').length).toBeGreaterThan(0));

    // 第二轮：同 id 卡 + 伪造响应指纹 → actionsLocked 消息上 rendered 为 applied
    await sendFromPanel(panel, '只看本币');
    await waitFor(() => expect(bridge.pending.length).toBe(2));
    bridge.pending[1]!.release({ contextFingerprint: 'ctx-forged-r2', cards: [craftedFilterCard('r2-fixed-filter')] });
    await waitFor(() => expect(within(panel).getAllByText(/响应的筛选上下文与请求不一致/).length).toBeGreaterThan(0), { timeout: 4000 });
    const locked = within(lastMessage(panel));
    expect(lastMessage(panel).getAttribute('data-message-locked')).toBe('true');
    const undo = locked.getAllByRole('button', { name: /撤销/ }).find((node) => (node.textContent ?? '').includes('撤销')) as HTMLButtonElement;
    expect(undo).toBeTruthy();
    expect(undo.disabled).toBe(true);
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    // 程序化点击（fireEvent 对 disabled 元素仍派发）：回调守卫兜底，本币口径不被撤销
    fireEvent.click(undo);
    await new Promise((resolve) => { setTimeout(resolve, 120); });
    expect(within(panel).getAllByText('本币').length).toBeGreaterThan(0);
  });

  it('view.preview 工具卡的应用筛选入口在锁定消息上不再接线；FilterCard 应用禁用；明细展开豁免', async () => {
    const panel = openPanel();
    await sendFromPanel(panel, '只看本币');
    await waitFor(() => expect(bridge.pending.length).toBe(1));
    bridge.pending[0]!.release({ contextFingerprint: 'ctx-forged-r2-tool', cards: [{ ...craftedFilterCard('r2-tool-filter'), actions: [{ id: 'locked-followup', kind: 'followup', label: '进一步查询', prompt: '价格预警' }] }] });
    await waitFor(() => expect(within(panel).getAllByText(/响应的筛选上下文与请求不一致/).length).toBeGreaterThan(0), { timeout: 4000 });
    const locked = within(lastMessage(panel));
    // 工具卡（view.preview 步骤）在锁定消息上不接线应用筛选——按钮不渲染
    expect(locked.queryByRole('button', { name: '应用筛选' })).toBeNull();
    // FilterCard 应用到看板禁用；程序化点击无副作用（保持 USD 默认口径）
    const apply = locked.getAllByRole('button', { name: '应用到看板' })[0] as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    await new Promise((resolve) => { setTimeout(resolve, 120); });
    expect(within(panel).queryByText('已应用')).toBeNull();
    expect(within(panel).getAllByText('USD').length).toBeGreaterThan(0);
    const followup = locked.getByRole('button', { name: /进一步查询/ }) as HTMLButtonElement;
    expect(followup.disabled).toBe(true);
    fireEvent.click(followup);
    expect(bridge.pending).toHaveLength(1);
    // evidence 豁免：工具卡「展开明细」是只读原地展开（button + 条件渲染区），
    // 不受锁影响——点击后出现「request 可追溯」明细区
    const detailToggle = locked.getAllByText('展开明细')[0]! as HTMLElement;
    expect(locked.queryByText(/request 可追溯/)).toBeNull();
    fireEvent.click(detailToggle);
    await waitFor(() => expect(locked.getAllByText(/request 可追溯/).length).toBeGreaterThan(0));
  });
});
