// ============================================================
// Agent 面板 · 模型选择器测试（mock fetch 的假服务器 + AgentThread 测试壳）：
// ⑥ 未配置任何模型 → 警示态「本地引擎 · 未配置模型服务」，发送按钮仍可用
// ⑦ 非服务器模式不渲染选择器（工具栏原样）
// 另：已配置时显示徽标 + 模型名 + 状态点 / 下拉按服务商分组切换（只调
// POST /api/agent/active，不新建会话、不清输入、不打断运行）/ 切换失败原因留在
// 下拉里 / 「管理模型服务…」跳配置页并滚到分块 / 读取失败的降级。
// ============================================================
// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentThread, type ThreadMessage } from '../AgentThread';
import ModelPicker, { UNCONFIGURED_HINT } from '../ModelPicker';
import { resetAgentServiceStoreForTests } from '../../../agentService/store';
import {
  createFakeAgentService, installAgentServer, installMemoryStorage, type FakeAgentService,
} from '../../../agentService/__tests__/fakeAgentServer';

const env = vi.hoisted(() => ({ service: true, go: vi.fn() }));
vi.mock('../../../data/serviceMode', () => ({ isServiceMode: () => env.service }));
vi.mock('../../../state/PageContext', () => ({ usePage: () => ({ page: 'dashboard', go: env.go }) }));

const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4';
const TESTED_AT = '2026-11-27T02:00:00.000Z';
const SECRET = 'sk-picker-0123456789abcdef';

const ask = vi.fn();
const stop = vi.fn();
const newConversation = vi.fn();
const closeAgent = vi.fn();

function Harness({ initialDraft = '', initialRunning = false, initialMessages = [] }: {
  initialDraft?: string; initialRunning?: boolean; initialMessages?: ThreadMessage[];
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(initialDraft);
  const [running, setRunning] = useState(initialRunning);
  const [messages, setMessages] = useState(initialMessages);
  return <AgentThread
    controller={{ open, mode: 'dock', draft, running, setDraft, setMode: vi.fn(),
      closeAgent: () => { closeAgent(); setOpen(false); }, markRead: vi.fn(),
      send: async (text) => {
        ask(text); setDraft(''); setRunning(true);
        setMessages((current) => [...current, { id: 'user-new', role: 'user', text: text ?? '', createdAt: new Date().toISOString() }]);
      },
      stop: () => { stop(); setRunning(false); },
      newConversation: () => { newConversation(); setMessages([]); setDraft(''); },
    }}
    messages={messages} statusLabel={running ? '正在读取价格' : '可以提问'} context={<div>俄罗斯 · 手机</div>}
    suggestions={[]} renderMessage={() => null}
  />;
}

let fake: FakeAgentService;
let server: ReturnType<typeof installAgentServer>;

beforeEach(() => {
  vi.clearAllMocks();
  env.service = true;
  resetAgentServiceStoreForTests();
  installMemoryStorage();
  fake = createFakeAgentService();
  server = installAgentServer(fake.routes);
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function seedModels(): void {
  fake.state.providers.zhipu = {
    enabled: true, baseUrl: ZHIPU_URL, models: ['glm-5.3-flash', 'glm-5.3'], model: 'glm-5.3-flash', hasKey: true,
    status: 'connected', testedAt: TESTED_AT, latencyMs: 320, lastError: '',
  };
  fake.state.providers.deepseek = {
    enabled: true, baseUrl: 'https://api.deepseek.com', models: ['deepseek-flash'], model: 'deepseek-flash', hasKey: true,
    status: 'failed', testedAt: TESTED_AT, latencyMs: null, lastError: 'API Key 无效或已失效',
  };
  fake.state.active = { provider: 'zhipu', model: 'glm-5.3-flash' };
}

const picker = (): HTMLButtonElement => document.querySelector('.aui-model-picker') as HTMLButtonElement;
/** 去掉 aria-hidden 后代（徽标、图标）后的文字 = 读屏与可访问名称里的文字 */
const readableText = (node: Element): string => {
  const clone = node.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((child) => child.remove());
  return clone.textContent ?? '';
};
const composer = (): HTMLTextAreaElement => screen.getByRole('textbox', { name: '向 PriceLens Agent 提问' }) as HTMLTextAreaElement;
const menuItem = (name: string | RegExp): HTMLElement => screen.getByRole('menuitem', { name });

describe('⑦ 渲染门控', () => {
  it('非服务器模式不渲染选择器：工具栏只有键盘提示，也不请求服务器', () => {
    env.service = false;
    render(<Harness />);
    expect(document.querySelector('.aui-model-picker')).toBeNull();
    expect(screen.getByText('Enter 发送 · Shift+Enter 换行')).toBeTruthy();
    expect(server.calls).toHaveLength(0);
    render(<ModelPicker />);
    expect(document.querySelectorAll('.aui-model-picker')).toHaveLength(0);
  });

  it('服务器模式：挂在输入框下方的工具栏里、键盘提示之前', async () => {
    render(<Harness />);
    const button = await screen.findByRole('button', { name: '本地引擎 · 未配置模型服务，点击前往配置' });
    const toolbar = document.querySelector('.aui-composer-toolbar')!;
    expect(toolbar.contains(button)).toBe(true);
    expect(toolbar.textContent!.indexOf('本地引擎')).toBeLessThan(toolbar.textContent!.indexOf('Enter 发送'));
    expect(screen.getByText('Enter 发送 · Shift+Enter 换行')).toBeTruthy();
    // 窄屏提示文案不受影响
    expect(screen.getByRole('button', { name: '发送' })).toBeTruthy();
  });
});

describe('⑥ 未配置任何模型', () => {
  it('显示警示态「本地引擎 · 未配置模型服务」，说明放在悬停提示里', async () => {
    render(<Harness />);
    const button = await screen.findByRole('button', { name: '本地引擎 · 未配置模型服务，点击前往配置' });
    expect(button.getAttribute('data-model-state')).toBe('warning');
    expect(button.textContent).toContain('本地引擎 · 未配置模型服务');
    expect(button.title).toBe(UNCONFIGURED_HINT);
    expect(button.title).toContain('配置模型服务后可获得结合看板的叙述增强');
    // 界面上没有把「未配置」写成禁止提问
    expect(document.body.textContent).not.toContain('请先配置模型');
  });

  it('发送按钮不禁用、照常发出问题；点击警示态直达配置页并收起面板（对话草稿不丢）', async () => {
    render(<Harness initialDraft="俄罗斯现在的价格" />);
    const send = screen.getByRole('button', { name: '发送' });
    expect(send.hasAttribute('disabled')).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(ask).toHaveBeenCalledWith('俄罗斯现在的价格'));
    expect(ask).toHaveBeenCalledOnce();

    fireEvent.change(composer(), { target: { value: '下一问草稿' } });
    fireEvent.click(await screen.findByRole('button', { name: '本地引擎 · 未配置模型服务，点击前往配置' }));
    expect(env.go).toHaveBeenCalledWith('config');
    expect(closeAgent).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(stop).not.toHaveBeenCalled();
    expect(newConversation).not.toHaveBeenCalled();
    expect(ask).toHaveBeenCalledOnce();
  });

  it('已保存但全部停用 = 同样是未配置；active 指向不可用的服务商时也不冒充已配置', async () => {
    fake.state.providers.zhipu = { enabled: false, baseUrl: ZHIPU_URL, models: ['glm-5.3-flash'], model: 'glm-5.3-flash', hasKey: true };
    fake.state.active = { provider: 'zhipu', model: 'glm-5.3-flash' };
    render(<Harness />);
    expect(await screen.findByRole('button', { name: '本地引擎 · 未配置模型服务，点击前往配置' })).toBeTruthy();
  });
});

describe('已配置模型', () => {
  it('显示「供应商徽标 + 模型名 + 状态点」；有已启用模型但未选时提示去选择', async () => {
    seedModels();
    render(<Harness />);
    const button = await screen.findByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' });
    expect(button.getAttribute('data-model-state')).toBe('active');
    expect(button.querySelector('[data-provider-badge="zhipu"]')).not.toBeNull();
    expect(button.querySelector('[data-provider-status="connected"]')).not.toBeNull();
    expect(button.querySelector('.aui-model-picker-name')!.textContent).toBe('glm-5.3-flash');
    expect(button.title).toContain('智谱 BigModel · glm-5.3-flash · 已连接 · 320 ms');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('下拉按服务商分组，列出全部已启用的模型，末项是「管理模型服务…」；当前模型带对勾', async () => {
    seedModels();
    render(<Harness />);
    await screen.findByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' });
    fireEvent.click(picker());
    const menu = await screen.findByRole('menu');
    // 下拉里的菜单前缀是 ant-dropdown-menu
    const groupTitles = [...menu.querySelectorAll('[class*="-menu-item-group-title"]')];
    // 组标题 = 供应商徽标（aria-hidden）+ 名称：读屏读到的只有名称
    expect(groupTitles.map(readableText)).toEqual(['智谱 BigModel', 'DeepSeek']);
    expect(groupTitles.map((node) => node.querySelector('[data-provider-badge]')!.getAttribute('data-provider-badge'))).toEqual(['zhipu', 'deepseek']);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['glm-5.3-flash', 'glm-5.3', 'deepseek-flash', '管理模型服务…']);
    expect(menuItem('glm-5.3-flash').querySelector('.anticon-check')).not.toBeNull();
    expect(menuItem('glm-5.3').querySelector('.anticon-check')).toBeNull();
    // 状态点跟文字：DeepSeek 那家连接失败
    expect(menuItem('deepseek-flash').querySelector('[data-provider-status="failed"]')).not.toBeNull();
    expect(menuItem('deepseek-flash').textContent).toContain('deepseek-flash');
    expect(screen.getByText('切换对下一次运行生效，不影响当前对话')).toBeTruthy();
    await waitFor(() => expect(picker().getAttribute('aria-expanded')).toBe('true'));
    // 打开下拉时刷新一次服务器状态
    expect(server.callsTo('GET', '/api/agent/providers').length).toBeGreaterThanOrEqual(2);
  });

  it('切换只调 POST /api/agent/active：不新建会话、不清输入、不中断进行中的运行', async () => {
    seedModels();
    render(<Harness initialDraft="切换前写好的草稿" initialRunning initialMessages={[
      { id: 'q', role: 'user', text: '比较当前价格', createdAt: new Date().toISOString() },
      { id: 'a', role: 'assistant', text: '结论与完整结果', createdAt: new Date().toISOString(), streaming: true },
    ]} />);
    await screen.findByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' });
    fireEvent.click(picker());
    fireEvent.click(await screen.findByRole('menuitem', { name: 'glm-5.3' }));
    await waitFor(() => expect(server.callsTo('POST', '/api/agent/active')).toHaveLength(1));
    expect(server.callsTo('POST', '/api/agent/active')[0]!.body).toEqual({ provider: 'zhipu', model: 'glm-5.3' });
    await waitFor(() => expect(screen.getByRole('button', { name: '当前模型：智谱 BigModel glm-5.3，点击切换' })).toBeTruthy());
    // 跨服务商切换
    fireEvent.click(picker());
    fireEvent.click(await screen.findByRole('menuitem', { name: 'deepseek-flash' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '当前模型：DeepSeek deepseek-flash，点击切换' })).toBeTruthy());
    expect(server.callsTo('POST', '/api/agent/active')[1]!.body).toEqual({ provider: 'deepseek', model: 'deepseek-flash' });
    expect(fake.state.active).toEqual({ provider: 'deepseek', model: 'deepseek-flash' });

    // 选完模型焦点回到输入框，接着写下一个问题
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    expect(ask).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(newConversation).not.toHaveBeenCalled();
    expect(composer().value).toBe('切换前写好的草稿');
    expect(document.querySelectorAll('[data-agent-message]')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '停止运行' })).toBeTruthy();
    expect(closeAgent).not.toHaveBeenCalled();
    // 没有任何密钥进入请求或页面（切换只带 provider + model）
    expect(JSON.stringify(server.calls.map((call) => call.body))).not.toContain(SECRET);
  });

  it('切换失败：原因留在下拉里（人话），当前模型不变', async () => {
    seedModels();
    installAgentServer({
      ...fake.routes,
      'POST /api/agent/active': () => ({ status: 400, body: { error: '模型不在该服务商的模型列表里' } }),
    });
    render(<Harness />);
    await screen.findByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' });
    fireEvent.click(picker());
    fireEvent.click(await screen.findByRole('menuitem', { name: 'glm-5.3' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('切换失败：模型不在该服务商的模型列表里');
    expect(screen.queryByRole('menu')).not.toBeNull();
    expect(screen.getByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Failed to fetch');
  });

  it('「管理模型服务…」：收起面板 → 切到配置页 → 把分块滚进视野', async () => {
    seedModels();
    const anchor = document.createElement('div');
    anchor.id = 'agent-service';
    const scrollIntoView = vi.fn();
    anchor.scrollIntoView = scrollIntoView;
    document.body.append(anchor);
    render(<Harness />);
    await screen.findByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' });
    fireEvent.click(picker());
    fireEvent.click(await screen.findByRole('menuitem', { name: '管理模型服务…' }));
    expect(env.go).toHaveBeenCalledWith('config');
    expect(closeAgent).toHaveBeenCalledOnce();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(server.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    anchor.remove();
  });

  it('当前模型指向不可用的服务商（已停用）时按「未选择模型」处理，不再冒充已配置', async () => {
    seedModels();
    fake.state.providers.zhipu.enabled = false;
    render(<Harness />);
    const button = await screen.findByRole('button', { name: '尚未选择模型，点击选择' });
    expect(button.getAttribute('data-model-state')).toBe('none');
    fireEvent.click(picker());
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['deepseek-flash', '管理模型服务…']);
  });
});

describe('键盘可达与焦点归还', () => {
  it('打开下拉后焦点落在当前模型上；浮层挂在面板内（模态时面板外节点会被置为 inert）', async () => {
    seedModels();
    render(<Harness initialDraft="草稿" />);
    await screen.findByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' });
    fireEvent.click(picker());
    const menu = await screen.findByRole('menu');
    expect(menu.closest('#pricelens-agent-panel')).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(menuItem('glm-5.3-flash')));
    expect(picker().getAttribute('aria-expanded')).toBe('true');
  });

  it('上下方向键直接展开；Esc 收起并把焦点还给触发器（不回输入框，也不改模型）', async () => {
    seedModels();
    render(<Harness initialDraft="草稿" />);
    const button = await screen.findByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' });
    button.focus();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    await screen.findByRole('menu');
    await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('menuitem'));
    const focusedItem = document.activeElement as HTMLElement | null;
    fireEvent.keyDown(focusedItem!, { key: 'Escape' });
    await waitFor(() => expect(picker().getAttribute('aria-expanded')).toBe('false'));
    await waitFor(() => expect(document.activeElement).toBe(picker()));
    expect(server.callsTo('POST', '/api/agent/active')).toHaveLength(0);
  });

  it('菜单里按 Tab：收起下拉、焦点回到触发器（随后由 Tab 自然往后走），不改模型', async () => {
    seedModels();
    render(<Harness initialDraft="草稿" />);
    await screen.findByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' });
    fireEvent.click(picker());
    const item = await screen.findByRole('menuitem', { name: 'glm-5.3-flash' });
    await waitFor(() => expect(document.activeElement).toBe(item));
    fireEvent.keyDown(item, { key: 'Tab' });
    await waitFor(() => expect(picker().getAttribute('aria-expanded')).toBe('false'));
    expect(document.activeElement).toBe(picker());
    expect(document.querySelector('#pricelens-agent-panel')).not.toBeNull();
    expect(server.callsTo('POST', '/api/agent/active')).toHaveLength(0);
  });

  it('点到浮层外面收起时不抢焦点', async () => {
    seedModels();
    render(<Harness initialDraft="草稿" />);
    await screen.findByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' });
    fireEvent.click(picker());
    await screen.findByRole('menu');
    // 焦点已经在输入框上（相当于用户点了输入框）时下拉收起：焦点留在输入框
    composer().focus();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(picker().getAttribute('aria-expanded')).toBe('false'));
    expect(document.activeElement).toBe(composer());
  });

  it('点的就是当前模型：只收起，不发请求，焦点回输入框', async () => {
    seedModels();
    render(<Harness initialDraft="草稿" />);
    await screen.findByRole('button', { name: '当前模型：智谱 BigModel glm-5.3-flash，点击切换' });
    fireEvent.click(picker());
    fireEvent.click(await screen.findByRole('menuitem', { name: 'glm-5.3-flash' }));
    await waitFor(() => expect(picker().getAttribute('aria-expanded')).toBe('false'));
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    expect(server.callsTo('POST', '/api/agent/active')).toHaveLength(0);
  });
});

describe('读取失败与加载中', () => {
  it('读取失败：警示态「本地引擎 · 模型服务不可用」，title 带人话原因，点击前往配置页', async () => {
    installAgentServer({ 'GET /api/agent/providers': () => ({ status: 500, body: { error: '模型服务内部错误，详情见服务器窗口日志' } }) });
    render(<Harness initialDraft="有草稿时发送按钮应可用" />);
    const button = await screen.findByRole('button', { name: '本地引擎 · 模型服务不可用，点击前往配置页检查' });
    expect(button.getAttribute('data-model-state')).toBe('warning');
    expect(button.title).toContain('读取模型服务失败：模型服务内部错误，详情见服务器窗口日志');
    expect(screen.getByRole('button', { name: '发送' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(env.go).toHaveBeenCalledWith('config');
  });

  it('首次读取中：先显示「读取模型服务…」，读完即换成真实状态', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    installAgentServer({
      'GET /api/agent/providers': async () => { await gate; return { body: fake.state }; },
    });
    render(<Harness />);
    expect((await screen.findByRole('button', { name: '正在读取模型服务' }) as HTMLButtonElement).disabled).toBe(true);
    release();
    expect(await screen.findByRole('button', { name: '本地引擎 · 未配置模型服务，点击前往配置' })).toBeTruthy();
  });
});
