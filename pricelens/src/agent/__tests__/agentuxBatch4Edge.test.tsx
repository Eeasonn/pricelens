// t428u Batch4 二审（2026-11-07）深水区：
// R8 responseFingerprintMismatch 隔离——响应 contextFingerprint 与请求不一致时
//   绝不写 run.completed（远端流里先到的也剔除），消息进入动作锁定
//   （CardActions apply/open/query、QuickPill、行级导航全部 disabled），
//   仅只读证据展开豁免；
// R3 普通异常终态——仅 AbortError（用户主动 stop）落 cancelled，普通异常一律
//   failed/error，不因上一轮 stop 残留被误标成已取消。
// 通过 vi.mock('../client') 把 defaultAgentClient 换成可控 stub（default 导出经
// src/agent/index 再导出，AgentProvider 拿到的即 stub）；未设置 override 时透传真实实现。
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentClient } from '../client';
import type { AgentResponse, PriceAdvantageResultCard, PriceAdvantageRow } from '../contracts';
import { FiltersProvider } from '../../state/FiltersContext';
import { PageProvider } from '../../state/PageContext';
import { AgentProvider, useAgent } from '../../state/AgentContext';
import AgentPanel from '../../components/Copilot/AgentPanel';

vi.mock('../client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client')>();
  return {
    ...actual,
    defaultAgentClient: (...args: Parameters<typeof actual.defaultAgentClient>) =>
      (globalThis as { __agentClientOverride?: AgentClient }).__agentClientOverride ?? actual.defaultAgentClient(...args),
  };
});

Object.defineProperty(window, 'matchMedia', { writable: true, value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) });
/** 本 vitest jsdom 环境不带 localStorage（探针实测）：内存桩，供用例间清档隔离。 */
if (typeof window.localStorage !== 'object') {
  const map = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, String(value)); },
      removeItem: (key: string) => { map.delete(key); },
      clear: () => { map.clear(); },
      key: (index: number) => [...map.keys()][index] ?? null,
      get length() { return map.size; },
    },
  });
}
afterEach(() => {
  cleanup();
  (globalThis as { __agentClientOverride?: AgentClient }).__agentClientOverride = undefined;
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const mismatchFingerprint = 'ctx-remote-mismatch';
const mismatchRow: PriceAdvantageRow = {
  id: 'edge-adv-row', countryCode: 'RU', weekId: '202642', weekLabel: '2026W42', channelLabel: 'OZON', platform: null, currency: 'usd',
  own: { modelId: 'own-huawei-nova-14-pro', modelName: 'HUAWEI nova 14 Pro', romram: '12+512 GB', skuId: 'edge-sku', price: 100 },
  competitor: { modelId: 'cmp-xiaomi-redmi-note17-pro', modelName: 'Redmi Note17 Pro', romram: '8+512 GB', skuId: 'edge-cmp', price: 110 },
  ownSelection: { modelId: 'own-huawei-nova-14-pro', romram: '12+512 GB', skuIds: ['edge-sku'] },
  compareSelection: { modelId: 'cmp-xiaomi-redmi-note17-pro', romram: '8+512 GB', skuIds: ['edge-cmp'] },
  priceDiff: 10, priceDiffPct: 0.09, relation: 'behind', contextFingerprint: mismatchFingerprint,
};
const mismatchAdvantageCard: PriceAdvantageResultCard = {
  kind: 'price_advantage', id: 'edge-advantage', title: '价格优势 · 口径存疑', rows: [mismatchRow],
  skuOptions: [{ skuId: 'edge-sku', label: 'HUAWEI nova 14 Pro · 12+512 GB' }],
  note: '远端响应口径与请求不一致，仅可查看。', currency: 'usd', contextFingerprint: mismatchFingerprint,
  evidence: [{ label: '价格事实', detail: 'RU · 202635–202642 · USD', source: '统一价格聚合引擎' }],
};
/** 模拟远端：SSE 流里先发 run.completed（正常协议收尾），终响应指纹却与请求不一致 */
const mismatchedResponse: AgentResponse = {
  intent: 'query',
  summary: '远端叙述（口径与请求不一致）',
  steps: [{ id: 'edge-step-1', tool: 'series.query', label: '查询价格序列', status: 'running', detail: '远端残留运行中步骤', durationMs: 5 }],
  cards: [
    {
      kind: 'table', id: 'edge-table', title: '平台比较（口径存疑）', columns: ['平台', '最低价'], rows: [['OZON', '100']],
      note: '远端响应口径与请求不一致，仅可查看。',
      actions: [
        { id: 'edge-apply', label: '应用范围', kind: 'apply', prompt: '应用' },
        { id: 'edge-open', label: '打开看板', kind: 'open', prompt: '打开' },
        { id: 'edge-followup', label: '追问详情', kind: 'followup', prompt: '追问' },
        { id: 'edge-copy', label: '复制提示词', kind: 'copy', prompt: '复制' },
      ],
      evidence: [{ label: '价格序列', detail: '8 条系列 · 202635–202642', source: '统一价格聚合引擎' }],
    },
    mismatchAdvantageCard,
  ],
  citations: [],
  suggestions: ['价格优势'],
  contextFingerprint: mismatchFingerprint,
  provider: { name: '远端 AI 流式', model: 'mock' },
};

function AppHarness() {
  const { openAgent } = useAgent();
  return <><button type="button" onClick={() => openAgent('dock')}>打开 Agent</button><AgentPanel /></>;
}

function mountedApp() {
  return render(<PageProvider><FiltersProvider><AgentProvider><AppHarness /></AgentProvider></FiltersProvider></PageProvider>);
}

async function submit(text: string): Promise<void> {
  fireEvent.change(screen.getByRole('textbox', { name: '向 PriceLens Agent 提问' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
}

const overrideClient = (client: AgentClient): void => {
  (globalThis as { __agentClientOverride?: AgentClient }).__agentClientOverride = client;
};

describe('R8 responseFingerprintMismatch：run.completed 隔离 + 消息动作锁定', () => {
  it('指纹不一致：无 run.completed 事件；CardActions apply/open/query 禁用、copy 与证据展开豁免', async () => {
    overrideClient({
      run: async (request, _signal, onEvent) => {
        onEvent?.({ id: 'edge-evt-completed', runId: request.runId ?? 'run', sequence: 5, type: 'run.completed', status: 'completed', timestamp: new Date().toISOString(), message: '运行完成' });
        return mismatchedResponse;
      },
    });
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('查我司产品价格');
    // 终态是 stale_context，不是 completed
    await waitFor(() => expect(screen.getAllByText('筛选已变化 · 结果需重新确认').length).toBeGreaterThan(0), { timeout: 5000 });
    // 时间线绝不出现 run.completed（流里先到的「运行完成」也被剔除），只保留 stale 收尾
    await waitFor(() => expect(screen.queryByText('运行完成')).toBeNull());
    expect(screen.getAllByText(/筛选上下文已变化，结果可查看但需要重新确认口径/).length).toBeGreaterThan(0);
    // R8：消息动作锁定——apply/open/query(followup) disabled，copy 豁免
    const tableCard = await waitFor(() => {
      const found = [...view.container.querySelectorAll('[data-agent-result-card]')].find((element) => element.textContent?.includes('平台比较（口径存疑）'));
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    // 锁定动作的 aria-label 带锁定后缀，用子串匹配
    expect((within(tableCard).getByRole('button', { name: /应用范围/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(tableCard).getByRole('button', { name: /打开看板/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(tableCard).getByRole('button', { name: /追问详情/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(tableCard).getByRole('button', { name: /复制提示词/ }) as HTMLButtonElement).disabled).toBe(false);
    // 只读证据展开豁免（延续 R1）：查看证据仍可点开
    const evidenceToggle = within(tableCard).getAllByRole('button', { name: /查看证据 · 共 1 条/ })[0] as HTMLButtonElement;
    expect(evidenceToggle.disabled).toBeFalsy();
    fireEvent.click(evidenceToggle);
    expect(within(tableCard).getAllByText(/统一价格聚合引擎/).length).toBeGreaterThan(0);
    view.unmount();
  }, 15000);

  it('指纹不一致：副作用 QuickPill 与行级定位锁定；纯 prompt 快问（打开预警/追问 chips）不锁（R2 M1）', async () => {
    overrideClient({
      run: async () => ({ ...mismatchedResponse, cards: [mismatchAdvantageCard] }),
    });
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('查我司产品价格');
    const advCard = await waitFor(() => {
      const found = [...view.container.querySelectorAll('[data-agent-result-card]')].find((element) => element.textContent?.includes('价格优势 · 口径存疑'));
      expect(found).toBeTruthy();
      return found as HTMLElement;
    }, { timeout: 5000 });
    // 行级「定位」按钮（写看板口径 + 导航）disabled
    const locateButton = within(advCard).getAllByRole('button', { name: /定位 .*202642/ })[0] as HTMLButtonElement;
    expect(locateButton.disabled).toBe(true);
    // R2 M1：副作用 QuickPill（回看走势 / 跳 GTM 情报 = 导航+改口径）disabled；
    // 纯 prompt 快问（打开价格预警 = 发起当前上下文新查询）不锁
    for (const label of ['回看价格走势', '跳 GTM 情报']) {
      const pill = within(advCard).queryByRole('button', { name: label }) as HTMLButtonElement | null;
      if (pill) expect(pill.disabled, label).toBe(true);
    }
    const alertPill = within(advCard).queryByRole('button', { name: '打开价格预警' }) as HTMLButtonElement | null;
    if (alertPill) expect(alertPill.disabled, '打开价格预警（纯 prompt）').toBe(false);
    // 消息级追问 chips（发起当前上下文新查询）同样不锁
    const suggestionChip = screen.getByRole('button', { name: '价格优势' }) as HTMLButtonElement;
    expect(suggestionChip.disabled).toBe(false);
    view.unmount();
  }, 15000);
});

describe('R3 普通异常终态：failed 与 cancelled 严格分流', () => {
  it('抛普通 Error → runStatus=failed、消息 kind=error（不是 cancelled）', async () => {
    overrideClient({
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('网关 502');
      },
    });
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('查我司产品价格');
    await waitFor(() => expect(screen.getAllByText(/运行失败/).length).toBeGreaterThan(0), { timeout: 5000 });
    expect(screen.getByText(/这次运行没有完成：网关 502/)).toBeTruthy();
    // 消息徽标 = 运行异常（kind: error），绝不是「已取消」（徽标文本与标签混排，用子串匹配）
    expect(screen.getAllByText(/运行异常/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/已取消/)).toBeNull();
    view.unmount();
  }, 15000);

  it('抛 AbortError → runStatus=cancelled、系统态文案', async () => {
    overrideClient({
      run: async () => { throw new DOMException('已取消', 'AbortError'); },
    });
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('查我司产品价格');
    await waitFor(() => expect(screen.getAllByText('已取消本次运行').length).toBeGreaterThan(0), { timeout: 5000 });
    expect(screen.getByText('已取消这次查询。')).toBeTruthy();
    expect(screen.queryByText(/运行失败/)).toBeNull();
    view.unmount();
  }, 15000);
});
