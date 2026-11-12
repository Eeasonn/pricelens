// ============================================================
// t428u Batch1（稳定线）：Agent 面板结果卡 / 证据 / 状态交互测试。
// 覆盖：固定结构分节顺序、真实药丸动作（跳页导航 + 证据原地展开聚焦）、
// 证据快照未知时间显示「待确认」、无证据空态、running 可取消 + cancelled
// 可重试。echarts/ResizeObserver mock 同 AgentPanel.agentux-core.test.tsx。
// 返修追加（R1–R7）：evidence 不受 stale gate 禁用、空预警卡固定结构、
// 终态收敛 running 工具卡、跨国回看带请求国家、预警行级动作在边界之后。
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

import App from '../../App';
import { buildAlerts } from '../../dataModel/alerts';
import { dimProduct } from '../../data';
import { DEFAULT_ALERT_TYPES, DEFAULT_ALERT_THRESHOLDS, defaultFilters } from '../../state/FiltersContext';
import { LPL } from '../../state/lplKeys';

// 本仓库 vitest jsdom 不带 localStorage：装内存桩（同 configImportExport.test 手法），
// R5/R7 需要预置国家与预警订阅的持久化状态。
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
});

afterEach(cleanup);

function resetTo(path: string): void {
  window.history.replaceState(null, '', path);
  sessionStorage.clear();
  try { localStorage.clear(); } catch { /* FiltersProvider has an in-memory fallback. */ }
}

async function openPanelAndRunPriceAdvantage(): Promise<HTMLElement> {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
  const panel = screen.getByRole('dialog');
  fireEvent.click(within(panel).getByRole('button', { name: '价格优势' }));
  await waitFor(() => expect(within(panel).getByText('价格优势对比')).toBeTruthy(), { timeout: 4000 });
  return panel;
}

async function openPanelAndRunAlerts(): Promise<HTMLElement> {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
  const panel = screen.getByRole('dialog');
  fireEvent.click(within(panel).getByRole('button', { name: '价格预警' }));
  await waitFor(() => expect(within(panel).getByText(/价格预警 · /)).toBeTruthy(), { timeout: 4000 });
  return panel;
}

describe('t428u AgentPanel · 结果卡固定结构与证据', () => {
  beforeEach(() => resetTo('/?p=dashboard'));

  it('价格优势卡按 事实 → 计算与规则 → 判断边界 分节呈现', async () => {
    const panel = await openPanelAndRunPriceAdvantage();
    const sections = Array.from(panel.querySelectorAll('[data-agent-card-section]')).map((node) => node.getAttribute('data-agent-card-section'));
    expect(sections).toEqual(['事实', '计算与规则', '判断边界']);
    expect(within(panel).getByText(/按 .* × 渠道 × 周对齐折后价/)).toBeTruthy();
  });

  it('查看证据原地展开证据区并把焦点移到可聚焦标题；快照时间未知显示待确认', async () => {
    const panel = await openPanelAndRunPriceAdvantage();
    expect(within(panel).queryByText(/暂无快照/)).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: '查看证据' }));
    const summary = await waitFor(() => {
      const node = Array.from(panel.querySelectorAll('summary')).find((item) => (item.textContent ?? '').includes('证据与来源 · 1'));
      expect(node).toBeDefined();
      return node!;
    });
    const details = summary.closest('details');
    expect(details?.open).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(within(panel).getByText(/来源：统一价格聚合引擎 · 快照：待确认/)).toBeTruthy();
  });

  it('无证据的结果卡（筛选预览）诚实显示暂无快照，不渲染链接或数字', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
    const panel = screen.getByRole('dialog');
    const input = within(panel).getByLabelText('向 PriceLens Agent 提问');
    fireEvent.change(input, { target: { value: '只看本币' } });
    fireEvent.click(within(panel).getByRole('button', { name: '发送' }));
    await waitFor(() => expect(within(panel).getByText('筛选预览（尚未应用）')).toBeTruthy(), { timeout: 4000 });
    expect(within(panel).getByText(/暂无快照 · 待接入/)).toBeTruthy();
    expect(within(panel).queryByRole('link')).toBeNull();
  });
});

describe('t428u AgentPanel · 药丸动作真实跳转（保留当前上下文口径）', () => {
  beforeEach(() => resetTo('/?p=volume'));

  it('回看价格走势：从量价走势跳回价格走势页', async () => {
    const panel = await openPanelAndRunPriceAdvantage();
    expect(document.title).toContain('量价走势');
    fireEvent.click(within(panel).getByRole('button', { name: '回看价格走势' }));
    await waitFor(() => expect(document.title).toContain('价格走势'));
    expect(document.title).not.toContain('量价走势');
  });

  it('打开价格预警：跳到预警页', async () => {
    const panel = await openPanelAndRunPriceAdvantage();
    fireEvent.click(within(panel).getByRole('button', { name: '打开价格预警' }));
    await waitFor(() => expect(document.title).toContain('预警'));
  });
});

describe('t428u AgentPanel · running 可取消，cancelled 可重试', () => {
  beforeEach(() => resetTo('/?p=dashboard'));

  it('运行中点「停止运行」→ 已取消提示 + 按当前范围重试入口', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
    const panel = screen.getByRole('dialog');
    fireEvent.click(within(panel).getByRole('button', { name: '价格优势' }));
    fireEvent.click(within(panel).getByRole('button', { name: '停止运行' }));
    await waitFor(() => expect(within(panel).getByText('已取消这次查询。')).toBeTruthy(), { timeout: 4000 });
    expect(within(panel).getByRole('button', { name: '按当前范围重试' })).toBeTruthy();
  });
});

describe('t428u 返修 R1 · 旧结果卡「查看证据」不被 stale gate 禁用', () => {
  beforeEach(() => resetTo('/?p=dashboard'));

  it('页面跳转（上下文过期）后查看证据仍可点击展开且键盘可达；导航动作仍受保护', async () => {
    const panel = await openPanelAndRunPriceAdvantage();
    fireEvent.click(within(panel).getByRole('button', { name: '打开价格预警' }));
    await waitFor(() => expect(document.title).toContain('预警'));
    const evidence = within(panel).getByRole('button', { name: '查看证据' });
    expect(evidence.textContent).toBe('查看证据');
    expect((evidence as HTMLButtonElement).disabled).toBe(false);
    evidence.focus();
    expect(document.activeElement).toBe(evidence);
    fireEvent.click(evidence);
    const summary = await waitFor(() => {
      const node = Array.from(panel.querySelectorAll('summary')).find((item) => (item.textContent ?? '').includes('证据与来源'));
      expect(node).toBeDefined();
      return node!;
    });
    expect((summary.closest('details') as HTMLDetailsElement).open).toBe(true);
    // 对照：导航类动作仍被 stale gate 禁用并提示需刷新
    const back = within(panel).getByRole('button', { name: /回看价格走势/ });
    expect((back as HTMLButtonElement).disabled).toBe(true);
    expect(back.textContent).toContain('需刷新');
  });
});

describe('t428u 返修 R2 · 空预警卡固定结构（DOM 顺序）', () => {
  beforeEach(() => resetTo('/?p=dashboard'));

  it('无订阅无触发：事实 → 计算与规则 → 判断边界 → 动作（动作在边界之后）', async () => {
    const panel = await openPanelAndRunAlerts();
    expect(within(panel).getByText('价格预警 · 当前口径没有触发事件')).toBeTruthy();
    expect(within(panel).getByText(/已按本地预警规则快照核对启用中的规则/)).toBeTruthy();
    const sections = Array.from(panel.querySelectorAll('[data-agent-card-section]')).map((node) => node.getAttribute('data-agent-card-section'));
    expect(sections).toEqual(['事实', '计算与规则', '判断边界']);
    const boundaries = panel.querySelector('[data-agent-card-section="判断边界"]');
    expect(boundaries).toBeTruthy();
    const open = within(panel).getByRole('button', { name: '打开预警中心' });
    expect(boundaries!.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('t428u 返修 R3 · 终态后不残留「运行中」工具卡', () => {
  beforeEach(() => resetTo('/?p=dashboard'));

  it('价格优势完成后：无 running/queued 工具卡，流事件卡与完成态步骤卡按工具合并', async () => {
    const panel = await openPanelAndRunPriceAdvantage();
    expect(panel.querySelectorAll('[data-tool-status="running"], [data-tool-status="queued"]')).toHaveLength(0);
    const toolCards = Array.from(panel.querySelectorAll('[data-tool-status]'));
    expect(toolCards.length).toBeGreaterThan(0);
    const execution = panel.querySelector<HTMLDetailsElement>('[data-agent-execution]');
    expect(execution).toBeTruthy();
    expect(execution?.open).toBe(false);
    expect(within(panel).queryByText(/工具与运行活动/)).toBeNull();
    expect(within(panel).queryByText(/执行步骤 ·/)).toBeNull();
    for (const card of toolCards) {
      expect(['success', 'failed', 'cancelled']).toContain(card.getAttribute('data-tool-status'));
    }
    // 同一工具不出现双卡：合并后恰好是响应步骤里的 4 个工具
    const toolNames = toolCards.map((card) => (card.closest('.lpl-agent-result-card')?.querySelector('.lpl-agent-card-title span') ?? null)?.textContent ?? null);
    expect(toolNames.filter(Boolean)).toHaveLength(4);
    expect([...new Set(toolNames)].sort()).toEqual(['catalog.resolve', 'series.compare', 'series.query', 'view.preview']);
  });

  it('空预警终态同样收敛：无 running 工具卡', async () => {
    const panel = await openPanelAndRunAlerts();
    expect(panel.querySelectorAll('[data-tool-status="running"], [data-tool-status="queued"]')).toHaveLength(0);
    expect(panel.querySelectorAll('[data-tool-status]').length).toBeGreaterThan(0);
  });

  it('取消后工具卡收敛为「已取消」，不显示运行中', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
    const panel = screen.getByRole('dialog');
    fireEvent.click(within(panel).getByRole('button', { name: '价格优势' }));
    // 等流事件先产生至少一张工具活动卡，再取消——终态必须把它收敛掉
    await waitFor(() => expect(panel.querySelectorAll('[data-tool-status]').length).toBeGreaterThan(0), { timeout: 4000 });
    fireEvent.click(within(panel).getByRole('button', { name: '停止运行' }));
    await waitFor(() => {
      expect(panel.querySelectorAll('[data-tool-status="running"], [data-tool-status="queued"]')).toHaveLength(0);
      expect(panel.querySelectorAll('[data-tool-status="cancelled"]').length).toBeGreaterThan(0);
    }, { timeout: 4000 });
  });
});

describe('t428u 返修 R5 · 跨国回看导航带请求国家', () => {
  beforeEach(() => resetTo('/?p=dashboard&c=AE'));

  it('AE 页问「RU 价格优势」→ 点回看切到 RU 价格走势', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
    const panel = screen.getByRole('dialog');
    await waitFor(() => expect(within(panel).getAllByText(/^AE · /).length).toBeGreaterThan(0), { timeout: 4000 });
    const input = within(panel).getByLabelText('向 PriceLens Agent 提问');
    fireEvent.change(input, { target: { value: 'RU 价格优势' } });
    fireEvent.click(within(panel).getByRole('button', { name: '发送' }));
    await waitFor(() => expect(within(panel).getByText('价格优势对比')).toBeTruthy(), { timeout: 4000 });
    fireEvent.click(within(panel).getByRole('button', { name: '回看价格走势' }));
    await waitFor(() => expect(within(panel).getAllByText(/^RU · /).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(document.title).toContain('价格走势');
    expect(document.title).not.toContain('预警');
  });
});

describe('t428u 返修 R5（二轮）· 跨国回看保留结果卡的主品口径', () => {
  beforeEach(() => resetTo('/?p=dashboard&c=AE&main=own-huawei-nova-14-pro__12%2B512GB'));

  it('AE + nova 14 Pro 问「RU 价格优势」→ 回看后 RU 上下文主品仍是 nova 14 Pro，而非 RU 默认主品', async () => {
    // 2026-11-10 审计修复：口径 chip 只展示可读产品名与配置，内部 SKU id 不进入主界面
    // 与迭代版同契约；跨国回看仍保留同一产品与配置。
    const novaChip = '口径 · nova 14 Pro · 12+512 GB';
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
    const panel = screen.getByRole('dialog');
    // 起始口径：AE 页、主品 nova 14 Pro（URL 指定，真实 FiltersProvider 载入）
    await waitFor(() => {
      expect(within(panel).getAllByText('AE · 手机').length).toBeGreaterThan(0);
      expect(within(panel).getAllByText(novaChip).length).toBeGreaterThan(0);
    }, { timeout: 4000 });
    const input = within(panel).getByLabelText('向 PriceLens Agent 提问');
    fireEvent.change(input, { target: { value: 'RU 价格优势' } });
    fireEvent.click(within(panel).getByRole('button', { name: '发送' }));
    await waitFor(() => expect(within(panel).getByText('价格优势对比')).toBeTruthy(), { timeout: 4000 });
    fireEvent.click(within(panel).getByRole('button', { name: '回看价格走势' }));
    // 最终 Filters 状态（chips 直读 context.state）：国家 RU 且主品仍是该卡计算的
    // nova 14 Pro SKU；不能被 switchScope 重置成 RU 第一默认主品 Pura 90s Pro Max。
    await waitFor(() => {
      expect(within(panel).getAllByText('RU · 手机').length).toBeGreaterThan(0);
      expect(within(panel).getAllByText(novaChip).length).toBeGreaterThan(0);
    }, { timeout: 4000 });
    expect(within(panel).queryByText(/own-huawei-pura-90s-pro-max · /)).toBeNull();
    // URL 与状态同口径（分享链接同样是 nova 14 Pro）
    const decodedSearch = decodeURIComponent(window.location.search);
    expect(decodedSearch).toContain('c=RU');
    expect(decodedSearch).toContain('main=own-huawei-nova-14-pro__12+512GB');
    expect(decodedSearch).not.toContain('pura-90s');
    // Initial scope, query and cross-country navigation each have their own wait.
  }, 15000);
});

describe('t428u 返修 R7 · 预警展开行动作在判断边界之后', () => {
  beforeEach(() => resetTo('/?p=dashboard'));

  it('展开真实预警行：行级动作渲染在判断边界之后，且不在行 details 内部', async () => {
    // 与 agentux-core-alerts.test.ts 同口径：第一个 RU 我司手机产品的订阅必有预警
    const own = dimProduct.find((row) => row.is_own && row.industry === 'phone' && row.countries.includes('RU'));
    expect(own).toBeDefined();
    if (!own) return;
    const seriesKey = `${own.model_id}__${own.romram.replace(/\s+/g, '')}`;
    const seeded = buildAlerts({
      subs: [seriesKey],
      enabled: DEFAULT_ALERT_TYPES,
      thresholds: DEFAULT_ALERT_THRESHOLDS,
      products: {},
      currency: defaultFilters.currency,
      scope: { countryCode: 'RU', industry: 'phone' },
      platform: null,
    });
    expect(seeded.length).toBeGreaterThan(0);
    localStorage.setItem(LPL.filters, JSON.stringify({ ...defaultFilters, alertSubs: [seriesKey], v: 12 }));
    // 有订阅时挂载即产生主动预警消息，建议词条区不渲染——直接输入提问
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /打开 PriceLens Agent/ }));
    const panel = screen.getByRole('dialog');
    const input = within(panel).getByLabelText('向 PriceLens Agent 提问');
    fireEvent.change(input, { target: { value: '查看价格预警' } });
    fireEvent.click(within(panel).getByRole('button', { name: '发送' }));
    await waitFor(() => expect(within(panel).getByText(/价格预警 · \d+ 条最新事件/)).toBeTruthy(), { timeout: 4000 });
    const row = panel.querySelector('details[data-agent-alert-id]');
    expect(row).toBeTruthy();
    fireEvent.click(row!.querySelector('summary')!);
    await waitFor(() => expect((row as HTMLDetailsElement).open).toBe(true));
    const sections = Array.from(panel.querySelectorAll('[data-agent-card-section]')).map((node) => node.getAttribute('data-agent-card-section'));
    expect(sections).toEqual(['事实', '计算与规则', '判断边界']);
    const boundaries = panel.querySelector('[data-agent-card-section="判断边界"]');
    const apply = within(panel).getByRole('button', { name: /应用预警筛选/ });
    expect(boundaries).toBeTruthy();
    expect(boundaries!.compareDocumentPosition(apply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row!.contains(apply)).toBe(false);
  });
});
