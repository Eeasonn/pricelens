// ============================================================
// t428u R2（本轮返修 · 2026-11-07）Agent 面板全链路回归：
//  - A M1 普通上下文 stale 的消息级副作用锁：消息 contextFingerprint ≠ 当前
//    指纹时与 actionsLocked 合并——回看/跳 GTM/行定位/撤销重做禁用 + 守卫，
//    evidence 与纯 prompt 追问不锁；跨国查询（AE 问 RU）页面未变不锁。
//    锁定只看指纹本身，绝不把结果目标国（RU 行）与请求创建指纹（AE 页）比较。
//  - A M2 跳 GTM 药丸与回看共用结果卡 scopePatch：目标国 + 显式 mains（nova
//    合法保留）+ 平台 + 实际参与对比的周范围，落地后 p=intelligence&c=RU。
//  - A M4 含「最近 N 周」的真实查询不被 filter 抢占；时间澄清卡「补齐时间」
//    点击发起真实查询（周 202635–202642 + 最新价），不落筛选预览。
//  - A M5 预警行折叠头只留展开触发器；行级动作全部在「触发事实 → 规则/证据 →
//    判断边界」之后（DOM 次序断言，非只看最后两个按钮）。
//  - B m3 撤销筛选随消息锁定 + 回调守卫（程序化点击不改全局筛选）。
// ============================================================
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters, FiltersProvider, useFilters } from '../../state/FiltersContext';
import { PageProvider } from '../../state/PageContext';
import { AgentProvider, useAgent } from '../../state/AgentContext';
import AgentPanel from '../../components/Copilot/AgentPanel';
import { classifyIntent, runAgent, buildAgentContext } from '../core';
import { buildCards } from '../../state/mainSelection';
import { lowestPriceColorSku } from '../../dataModel/aggregate';
import { weekIdRange, intelItemsForScope } from '../../pages/intelligence/gtmIntel';

Object.defineProperty(window, 'matchMedia', { writable: true, value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) });
afterEach(() => cleanup());

const own = dimProduct.find((row) => row.is_own && row.industry === 'phone' && row.countries.includes('RU'))!;
const main = { modelId: own.model_id, romram: own.romram, skuIds: [own.sku_id] };
const novaRow = dimProduct.find((row) => row.model_id === 'own-huawei-nova-14-pro')!;
const novaMain = { modelId: novaRow.model_id, romram: novaRow.romram, skuIds: [lowestPriceColorSku(novaRow.model_id, novaRow.romram, 'RU') ?? novaRow.sku_id] };

function AppHarness() {
  const { openAgent } = useAgent();
  const { state, actions } = useFilters();
  // FiltersProvider 会把状态写入 localStorage，同文件内 mount 会回放上一用例的
  // 载荷（batch4 同款坑）——每个用例先「重置口径」再准备，保证口径自洽。
  const prepareReset = () => actions.reset();
  const prepareScope = () => actions.set({ mains: buildCards([main], { auto: true }), adaptive: false, rangeStart: '202619', rangeEnd: '202642' });
  const prepareAeNova = () => actions.set({ countryCode: 'AE', mains: buildCards([novaMain], { auto: true, countryCode: 'AE' }), adaptive: false, rangeStart: '202619', rangeEnd: '202642' });
  // 模拟「真实 UI 换国」：普通国家切换补丁不带 mains（next.mains 只是旧状态继承）
  const switchToDe = () => actions.set({ countryCode: 'DE' });
  const prepareAlerts = () => actions.setAlertSubs([`${own.model_id}__${own.romram.replace(/\s+/g, '')}`], true);
  const prepareMonth = () => actions.set({ mains: buildCards([main], { auto: true }), granularity: 'month', adaptive: false, rangeStart: '202605', rangeEnd: '202610' });
  return <><button type="button" onClick={() => openAgent('dock')}>打开 Agent</button><button type="button" onClick={prepareReset}>重置口径</button><button type="button" onClick={prepareScope}>准备口径</button><button type="button" onClick={prepareAeNova}>准备 AE Nova</button><button type="button" onClick={switchToDe}>换到 DE</button><button type="button" onClick={prepareAlerts}>准备预警</button><button type="button" onClick={prepareMonth}>准备月粒度</button><AgentPanel /><output data-filter-state>{JSON.stringify(state)}</output></>;
}

function mountedApp() {
  return render(<PageProvider><FiltersProvider><AgentProvider><AppHarness /></AgentProvider></FiltersProvider></PageProvider>);
}

async function submit(text: string): Promise<void> {
  fireEvent.change(screen.getByRole('textbox', { name: '向 PriceLens Agent 提问' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
}

const filterStateOf = (view: ReturnType<typeof render>): Record<string, unknown> =>
  JSON.parse(view.container.querySelector('[data-filter-state]')?.textContent ?? '{}');

/** 等待第 minFactNotes 条终态消息（「事实来源」note 只在完成后渲染）后取最后一张
 *  价格优势卡——多消息场景必须等计数到位，否则会抓到上一条（已锁定）的旧卡。 */
async function awaitCompletedAdvantageCard(view: ReturnType<typeof render>, minFactNotes = 1): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getAllByText(/事实来源：本地确定性引擎/).length).toBeGreaterThanOrEqual(minFactNotes), { timeout: 5000 });
  return waitFor(() => {
    const found = [...view.container.querySelectorAll('[data-agent-result-card]')].filter((element) => element.textContent?.includes('价格优势 · 我司 vs 核心竞品')).pop();
    expect(found).toBeTruthy();
    return found as HTMLElement;
  });
}

describe('A M4 · classifyIntent 不抢占含「最近 N 周」的真实查询（无 forcedIntent）', () => {
  it('真实查询口吻 → query；纯切换/筛选口吻 → filter', () => {
    expect(classifyIntent('最近8周哪个平台最便宜？')).toBe('query');
    expect(classifyIntent('最近 8 周价格趋势')).toBe('query');
    expect(classifyIntent('只看最近 8 周')).toBe('filter');
    expect(classifyIntent('切到最近 8 周')).toBe('filter');
    expect(classifyIntent('筛选最近 8 周')).toBe('filter');
  });

  it('runAgent（不传 forcedIntent）对「最近 8 周价格趋势」产出真实周范围查询结果', async () => {
    const state = { ...defaultFilters, mains: buildCards([main], { auto: true }), granularity: 'month' as const, adaptive: false, rangeStart: '202606', rangeEnd: '202611' };
    const response = await runAgent('最近 8 周价格趋势', buildAgentContext('dashboard', state, []));
    expect(response.intent).not.toBe('filter');
    expect(response.intent).not.toBe('clarify');
    const note = response.cards.map((card) => ('note' in card ? card.note : '')).join(' ');
    expect(note).toContain('202639–202646');
    expect(note).toContain('week');
  });
});

describe('A M1 · 普通上下文 stale 的消息级副作用锁（组件方向）', () => {
  it('RU 问价格优势后真实 UI 换 DE：旧卡回看/跳 GTM/行定位全部禁用；evidence 与纯 prompt 追问不锁', async () => {
    window.sessionStorage.clear();
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '准备口径' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('价格优势');
    const card = await awaitCompletedAdvantageCard(view);
    // 未 stale：副作用药丸可用
    const back = within(card).getByRole('button', { name: '回看价格走势' }) as HTMLButtonElement;
    const gtm = within(card).getByRole('button', { name: '跳 GTM 情报' }) as HTMLButtonElement;
    const alertPill = within(card).getByRole('button', { name: '打开价格预警' }) as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    expect(gtm.disabled).toBe(false);
    expect(alertPill.disabled).toBe(false);

    // 真实 UI 换 DE（普通国家切换，不带 mains）→ 指纹变化 → 消息级锁
    fireEvent.click(screen.getByRole('button', { name: '换到 DE' }));
    await waitFor(() => {
      const lockedMessage = [...view.container.querySelectorAll('[data-agent-message]')].find((node) => node.getAttribute('data-message-locked') === 'true');
      expect(lockedMessage).toBeTruthy();
    });
    expect((within(card).getByRole('button', { name: '回看价格走势' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(card).getByRole('button', { name: '跳 GTM 情报' }) as HTMLButtonElement).disabled).toBe(true);
    // 行定位（写看板口径 + 导航）随锁禁用
    const locateButtons = within(card).getAllByRole('button', { name: /定位 / });
    expect(locateButtons.length).toBeGreaterThan(0);
    for (const button of locateButtons) expect((button as HTMLButtonElement).disabled).toBe(true);
    // evidence 豁免：只读展开不受锁影响
    const evidenceToggle = within(card).getAllByRole('button', { name: /查看证据/ })[0] as HTMLButtonElement;
    expect(evidenceToggle.disabled).toBeFalsy();
    fireEvent.click(evidenceToggle);
    await waitFor(() => expect(within(card).getAllByText(/统一价格聚合引擎/).length).toBeGreaterThan(0));
    // 纯 prompt 快问不锁（发起当前上下文新查询）
    expect((within(card).getByRole('button', { name: '打开价格预警' }) as HTMLButtonElement).disabled).toBe(false);
    const suggestion = screen.getByRole('button', { name: '价格优势' });
    expect((suggestion as HTMLButtonElement).disabled).toBeFalsy();
    // 输入框不锁
    const input = screen.getByRole('textbox', { name: '向 PriceLens Agent 提问' }) as HTMLTextAreaElement;
    expect(input.disabled).toBeFalsy();
    view.unmount();
  });

  it('边界：AE 页问 RU 跨国优势，页面未变 → 不 stale，可回看/跳 GTM 到 RU（不把结果目标国与创建指纹比较）', async () => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/?p=dashboard');
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '准备 AE Nova' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('RU 价格优势');
    const card = await awaitCompletedAdvantageCard(view);
    // 结果行目标是 RU，但消息指纹 = 创建时 AE 页指纹；页面没变 → 不 stale
    const messages = [...view.container.querySelectorAll('[data-agent-message]')];
    const staleMessages = messages.filter((node) => node.getAttribute('data-message-locked') === 'true');
    expect(staleMessages).toHaveLength(0);
    const back = within(card).getByRole('button', { name: '回看价格走势' }) as HTMLButtonElement;
    const gtm = within(card).getByRole('button', { name: '跳 GTM 情报' }) as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    expect(gtm.disabled).toBe(false);
    // 跨国结果行按 RU 计算且主品是 Nova（不拿 AE 矩阵冒充）
    expect(within(card).getAllByRole('button', { name: /定位 .*nova 14 pro.* \d{6}/i }).length).toBeGreaterThan(0);
    view.unmount();
  });
});

describe('A M2 · 跳 GTM 与回看共用 scopePatch（目标国 + 显式 mains + 周范围）', () => {
  it('AE Nova 问 RU 优势 → 跳 GTM：p=intelligence&c=RU 且主品 nova 合法保留', async () => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/?p=dashboard');
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '准备 AE Nova' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('RU 价格优势');
    const card = await awaitCompletedAdvantageCard(view);
    fireEvent.click(within(card).getByRole('button', { name: '跳 GTM 情报' }));
    await waitFor(() => {
      expect(window.location.search).toContain('p=intelligence');
      expect(window.location.search).toContain('c=RU');
      const next = filterStateOf(view);
      expect(next.countryCode).toBe('RU');
      expect((next.mains as Array<{ main: { modelId: string } | null }>).map((item) => item.main?.modelId)).toEqual(['own-huawei-nova-14-pro']);
    });
    view.unmount();
  });

  it('回看价格走势走同一 scopePatch：p=dashboard&c=RU，主品 nova 不回落默认 Pura', async () => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/?p=dashboard');
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '准备 AE Nova' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('RU 价格优势');
    const card = await awaitCompletedAdvantageCard(view);
    fireEvent.click(within(card).getByRole('button', { name: '回看价格走势' }));
    await waitFor(() => {
      // dashboard 为默认页签，p 键省略——断言已离开 intelligence 且国家落在 RU
      expect(window.location.search).not.toContain('p=intelligence');
      expect(window.location.search).toContain('c=RU');
      const next = filterStateOf(view);
      expect((next.mains as Array<{ main: { modelId: string } | null }>).map((item) => item.main?.modelId)).toEqual(['own-huawei-nova-14-pro']);
    });
    view.unmount();
  });
});

describe('A M4 · 月粒度「近期价格趋势」澄清 → 点击「补齐时间 · 最近 8 周」发起真实查询', () => {
  it('端到端：澄清卡出现补齐时间动作，点击产出新批次周范围 202639–202646 的查询结果而非筛选预览', async () => {
    window.sessionStorage.clear();
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '准备月粒度' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('近期价格趋势');
    // 无 forcedIntent 的真实分类 → 时间范围澄清卡，附可点击的补齐时间动作
    const clarifyChip = await waitFor(() => {
      const chip = screen.getByRole('button', { name: '补齐时间 · 最近 8 周' }) as HTMLButtonElement;
      expect(chip).toBeTruthy();
      expect(chip.disabled).toBeFalsy();
      return chip;
    }, { timeout: 5000 });
    fireEvent.click(clarifyChip);
    // 点击后是真实查询（价格走势摘要 + 周范围），不是筛选预览
    const queryCard = await waitFor(() => {
      const found = [...view.container.querySelectorAll('[data-agent-result-card]')].filter((element) => element.textContent?.includes('202639–202646')).pop();
      expect(found).toBeTruthy();
      return found as HTMLElement;
    }, { timeout: 5000 });
    expect(queryCard.textContent).toContain('价格走势摘要');
    const messages = view.container.querySelectorAll('[data-agent-result-card]');
    for (const node of messages) expect(node.textContent).not.toContain('筛选预览（尚未应用）');
    view.unmount();
  });
});

describe('A M5 · 预警行折叠头只留触发器；全部行级按钮在判断边界之后', () => {
  it('折叠头无 看板/预警中心/标记已确认；展开后每个 button（除触发器）都在行级边界之后', async () => {
    window.sessionStorage.clear();
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '重置口径' }));
    fireEvent.click(screen.getByRole('button', { name: '准备口径' }));
    fireEvent.click(screen.getByRole('button', { name: '准备预警' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('价格预警');
    // 先等终态消息（「事实来源」note 只在完成后渲染），避免抓到流式 partial 卡
    await waitFor(() => expect(screen.getAllByText(/事实来源：本地确定性引擎/).length).toBeGreaterThan(0), { timeout: 5000 });
    const cardEl = await waitFor(() => {
      const found = [...view.container.querySelectorAll('[data-agent-result-card]')].find((element) => /[1-9]\d* 条当前事件/.test(element.textContent ?? ''));
      expect(found).toBeTruthy();
      return found as HTMLElement;
    }, { timeout: 5000 });
    const row = await waitFor(() => {
      const node = cardEl.querySelector('[data-alert-row]');
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });
    // 折叠态：行头只有展开触发器一个 button（看板/预警中心/标记已确认 前置按钮退役）
    const collapsedButtons = [...row.querySelectorAll('button')];
    expect(collapsedButtons).toHaveLength(1);
    expect(row.querySelector('[data-alert-row-toggle]')).toBeTruthy();
    expect(collapsedButtons[0]!.textContent).not.toContain('看板');
    expect(collapsedButtons[0]!.textContent).not.toContain('预警中心');
    expect(collapsedButtons[0]!.textContent).not.toContain('标记已确认');

    fireEvent.click(collapsedButtons[0]!);
    await waitFor(() => expect(row.querySelector('[data-alert-row-boundary]')).toBeTruthy());
    // 展开态：除折叠触发器外，每个 button 都在「判断边界」节点之后（DOM 次序断言）
    const boundary = row.querySelector('[data-alert-row-boundary]') as HTMLElement;
    const rowButtons = [...row.querySelectorAll('button')];
    expect(rowButtons.length).toBeGreaterThan(2);
    for (const button of rowButtons) {
      if (button.hasAttribute('data-alert-row-toggle')) continue;
      expect(boundary.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // 行级动作语义在场：应用预警筛选 / 查看完整证据 / 状态流转
    const labels = rowButtons.map((button) => button.textContent ?? '');
    expect(labels.some((label) => label.includes('应用预警筛选'))).toBe(true);
    expect(labels.some((label) => label.includes('查看完整证据'))).toBe(true);
    expect(labels.some((label) => label.includes('标记已确认') || label.includes('开始核查') || label.includes('标记需行动'))).toBe(true);
    view.unmount();
  });
});

describe('B m3 · 已定位撤销随消息锁定 + 回调守卫；未锁消息上撤销可用', () => {
  it('行定位改写全局口径 → 消息自锁：撤销筛选 disabled + aria-disabled，程序化点击不回滚；新消息（当前口径）上撤销可用', async () => {
    window.sessionStorage.clear();
    const view = mountedApp();
    fireEvent.click(screen.getByRole('button', { name: '重置口径' }));
    fireEvent.click(screen.getByRole('button', { name: '准备口径' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    await submit('价格优势');
    const card = await awaitCompletedAdvantageCard(view);
    fireEvent.click(within(card).getAllByRole('button', { name: /定位 / })[0]!);
    // 定位 = 写全局筛选的副作用：口径变化使本消息立刻进入 stale 锁，
    // 「撤销筛选」（undoFilter 全局副作用）必须 disabled + 回调守卫
    const lockedUndo = await waitFor(() => {
      const button = within(card).getByRole('button', { name: /撤销筛选/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-disabled')).toBe('true');
      return button;
    });
    const located = filterStateOf(view) as { rangeStart: string; rangeEnd: string };
    // 程序化点击（fireEvent 对 disabled 元素仍派发）：守卫兜底，定位口径不被撤销
    fireEvent.click(lockedUndo);
    await new Promise((resolve) => { setTimeout(resolve, 120); });
    expect((filterStateOf(view) as { rangeStart: string }).rangeStart).toBe(located.rangeStart);
    // 再换 DE：旧消息保持锁定；随后在「当前口径」发起的新消息上撤销可用且真实回滚
    fireEvent.click(screen.getByRole('button', { name: '换到 DE' }));
    await waitFor(() => expect((filterStateOf(view) as { countryCode: string }).countryCode).toBe('DE'));
    await submit('价格优势');
    const freshCard = await awaitCompletedAdvantageCard(view, 2);
    const freshUndo = await waitFor(() => {
      const button = within(freshCard).getByRole('button', { name: /撤销筛选/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      return button;
    });
    fireEvent.click(freshUndo);
    // 撤销真实生效：回滚到「定位前」的 RU 全范围口径（准备口径 202619–202642）
    await waitFor(() => {
      const next = filterStateOf(view) as { countryCode: string; rangeStart: string; rangeEnd: string };
      expect(next.countryCode).toBe('RU');
      expect(next.rangeStart).toBe('202619');
      expect(next.rangeEnd).toBe('202642');
    });
    view.unmount();
  });
});

describe('A M3 · GTM 情报周窗：月/季结束桶取最后匹配周', () => {
  it('weekIdRange：月 202610 与季 2026Q4 的结束边界分别落在 202644 与 202646', () => {
    expect(weekIdRange('week', '202640', '202642')).toEqual(['202640', '202642']);
    expect(weekIdRange('month', '202610', '202610')).toEqual(['202641', '202644']);
    expect(weekIdRange('quarter', '2026Q4', '2026Q4')).toEqual(['202641', '202646']);
  });

  it('RU 周/月/季口径都能看到 W42 的 Galaxy S25 Ultra 竞品条目', () => {
    const scopes = [
      { granularity: 'week' as const, rangeStart: '202640', rangeEnd: '202642' },
      { granularity: 'month' as const, rangeStart: '202610', rangeEnd: '202610' },
      { granularity: 'quarter' as const, rangeStart: '2026Q4', rangeEnd: '2026Q4' },
    ];
    for (const scope of scopes) {
      const items = intelItemsForScope({ countryCode: 'RU', industry: 'phone', ...scope });
      const s25u = items.filter((item) => item.id === 'cp-s25u-ru');
      expect(s25u, `${JSON.stringify(scope)} 应保留 W42 Galaxy S25 Ultra 条目`).toHaveLength(1);
    }
  });
});
