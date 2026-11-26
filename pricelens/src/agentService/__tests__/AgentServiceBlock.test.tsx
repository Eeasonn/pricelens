// ============================================================
// 配置页「Agent 模型服务」区块组件测试（mock fetch 的假服务器）：
// ① 服务商列表可搜索、自定义在最后、Anthropic 标「即将支持」不可配置
// ② 选智谱：未填 Key 时按钮禁用并写出原因
// ③ 保存时密钥框不回显明文（页面与浏览器存储都没有明文）
// ④ 测试连接失败显示人话原因
// ⑤ 获取模型列表失败回退预置清单并提示
// 另：本机服务无 Key 字段 / 自定义服务商完整可用 / 查阅者只读 / 设为当前模型 /
// 状态区四态 / 读取失败与重试。
// antd 两个汉字的按钮会自动插空格（「保 存」），按名字找按钮统一用 btn()。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import AgentServiceBlock from '../../pages/config/AgentServiceBlock';
import { formatTestedAt } from '../providers';
import { resetAgentServiceStoreForTests } from '../store';
import { createFakeAgentService, installAgentServer, installMemoryStorage, type FakeAgentService } from './fakeAgentServer';

const SECRET = 'sk-ui-0123456789abcdef';
const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4';
const TESTED_AT = '2026-11-27T02:00:00.000Z';

let fake: FakeAgentService;
let server: ReturnType<typeof installAgentServer>;
let storage: ReturnType<typeof installMemoryStorage>;

beforeEach(() => {
  resetAgentServiceStoreForTests();
  fake = createFakeAgentService();
  storage = installMemoryStorage();
  server = installAgentServer(fake.routes);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBlock(canEdit = true): void {
  render(<AntdApp component={false}><AgentServiceBlock canEdit={canEdit} /></AntdApp>);
}
async function renderLoaded(canEdit = true): Promise<void> {
  renderBlock(canEdit);
  await screen.findAllByRole('tab');
}

const tabNames = (): string[] => screen.getAllByRole('tab').map((tab) => tab.querySelector('.lpl-agent-service-item-name')!.textContent);
const tab = (name: string): HTMLElement => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
/** 顶部「当前模型：…」文字（标签与值分两个元素） */
const summary = (): string => screen.getByText('当前模型：').textContent!;
const selectTab = (name: string): void => { fireEvent.click(tab(name)); };
/** 按文字找按钮：antd 会给两个汉字的按钮插空格（保 存 / 更 换），逐字允许空白；
 *  不锚定首尾——loading 结束后 antd 的加载图标可能还留在 DOM 里，名字前面会多一个 loading */
const btn = (text: string): HTMLButtonElement => screen.getByRole('button', {
  name: new RegExp(text.split('').join('\\s*')),
}) as HTMLButtonElement;
/** 名字须完全相等（「添加」会同时命中「手动添加」时用） */
const btnExact = (text: string): HTMLButtonElement => screen.getByRole('button', {
  name: new RegExp(`^${text.split('').join('\\s*')}$`),
}) as HTMLButtonElement;
const search = (): HTMLInputElement => screen.getByLabelText('搜索服务商') as HTMLInputElement;
const typeKey = (value: string): void => { fireEvent.change(screen.getByLabelText(/^API Key/), { target: { value } }); };
const saveCalls = () => server.callsTo('POST', '/api/agent/providers');

/** 打开模型下拉并点选选项（下拉在 portal 里，只认当前展开的那一份；选项 title = 模型显示名） */
async function pickModel(label: string): Promise<void> {
  const trigger = screen.getByLabelText('模型');
  fireEvent.mouseDown(trigger.closest('.ant-select-selector') ?? trigger);
  const dropdown = await waitFor(() => {
    const el = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].pop();
    if (!el) throw new Error('模型下拉未展开');
    return el as HTMLElement;
  });
  const option = await waitFor(() => {
    const el = [...dropdown.querySelectorAll('.ant-select-item-option')].find((item) => item.getAttribute('title') === label);
    if (!el) throw new Error(`选项未找到：${label}`);
    return el as HTMLElement;
  });
  fireEvent.click(option);
}

async function openModelList(): Promise<HTMLElement> {
  const trigger = screen.getByLabelText('模型');
  fireEvent.mouseDown(trigger.closest('.ant-select-selector') ?? trigger);
  return waitFor(() => {
    const el = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].pop();
    if (!el) throw new Error('模型下拉未展开');
    return el as HTMLElement;
  });
}

const advanced = (): HTMLDetailsElement => document.querySelector('details.lpl-agent-service-advanced') as HTMLDetailsElement;

describe('① 服务商列表', () => {
  it('左侧 11 家预置可搜索：自定义恒在最后；Anthropic 标「即将支持」且不可配置', async () => {
    await renderLoaded();
    expect(tabNames()).toEqual([
      '智谱 BigModel', 'Kimi / Moonshot', 'DeepSeek', '阿里百炼 Qwen', '硅基流动', 'OpenAI', 'Anthropic',
      'OpenRouter', 'Ollama（本地）', 'LM Studio（本地）', '自定义 OpenAI 兼容',
    ]);
    // 默认落在第一家可配置的服务商；列表是纵向 tablist，右列是它的 tabpanel
    expect(screen.getByRole('tablist', { name: '模型服务商' }).getAttribute('aria-orientation')).toBe('vertical');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('agent-service-tab-zhipu');
    expect(summary()).toBe('当前模型：本地引擎（未配置模型服务）');

    // 按名称 / 模型 / 别名搜索；结果里自定义仍在最后
    fireEvent.change(search(), { target: { value: 'kimi' } });
    expect(tabNames()).toEqual(['Kimi / Moonshot']);
    fireEvent.change(search(), { target: { value: 'qwen' } });
    expect(tabNames()).toEqual(['阿里百炼 Qwen', '硅基流动', 'LM Studio（本地）']);
    fireEvent.change(search(), { target: { value: '自定义' } });
    expect(tabNames()).toEqual(['自定义 OpenAI 兼容']);
    fireEvent.change(search(), { target: { value: '不存在的服务商' } });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByText('没有匹配的服务商')).toBeTruthy();

    // Anthropic：可见、标「即将支持」、选中后没有任何可配置项
    fireEvent.change(search(), { target: { value: '' } });
    expect(within(tab('Anthropic')).getByText('即将支持')).toBeTruthy();
    fireEvent.click(tab('Anthropic'));
    expect(tab('Anthropic').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('该服务商即将支持，暂不可配置。')).toBeTruthy();
    expect(screen.queryAllByLabelText(/^API Key/)).toHaveLength(0);
    expect(screen.queryByLabelText('模型')).toBeNull();
    expect(screen.queryByRole('button', { name: /测\s*试\s*连\s*接/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /保\s*存/ })).toBeNull();
    // 官方文档外链仍在（新窗口、不带来源）
    expect(screen.getByRole('link', { name: '官方文档' }).getAttribute('rel')).toBe('noreferrer');
    expect(screen.getByRole('link', { name: '官方文档' }).getAttribute('href')).toBe('https://docs.anthropic.com/en/docs/about-claude/models');
  });

  it('方向键 / Home / End 在可配置的服务商间移动（跳过即将支持的），全列表只有一处选中', async () => {
    await renderLoaded();
    expect(tab('智谱').tabIndex).toBe(0);
    expect(tab('Kimi').tabIndex).toBe(-1);
    fireEvent.keyDown(tab('智谱'), { key: 'ArrowDown' });
    expect(tab('Kimi').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Kimi'));
    fireEvent.click(tab('OpenAI'));
    fireEvent.keyDown(tab('OpenAI'), { key: 'ArrowDown' });
    expect(tab('OpenRouter').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('OpenRouter'), { key: 'End' });
    expect(tab('自定义').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('自定义'), { key: 'ArrowUp' });
    expect(tab('LM Studio').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('LM Studio'), { key: 'Home' });
    expect(tab('智谱').getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1);
  });
});

describe('② 选智谱：必填项与原因', () => {
  it('未填 Key：「测试连接」「保存」「获取模型列表」禁用并在旁边写出原因；填 Key 后只剩「请先选择模型」；选模型后可用', async () => {
    await renderLoaded();
    expect(within(screen.getByRole('tabpanel')).getByText('智谱 BigModel')).toBeTruthy();
    expect(screen.getByText('GLM 系列，OpenAI 兼容接口。')).toBeTruthy();
    for (const name of ['测试连接', '保存', '获取模型列表']) expect(btn(name).disabled).toBe(true);
    expect(screen.getByText('请先填写 API Key；请先选择模型')).toBeTruthy();

    typeKey(SECRET);
    expect(screen.getByText('请先选择模型')).toBeTruthy();
    expect(btn('获取模型列表').disabled).toBe(false);
    expect(btn('测试连接').disabled).toBe(true);
    expect(btn('保存').disabled).toBe(true);

    await pickModel('GLM-5.3-Flash');
    expect(btn('测试连接').disabled).toBe(false);
    expect(btn('保存').disabled).toBe(false);
    expect(screen.queryByText(/请先/)).toBeNull();
  });

  it('API Key 是密码态、可显示 / 隐藏；服务地址已预填并收在默认收起的高级设置里', async () => {
    await renderLoaded();
    const input = screen.getByLabelText('API Key') as HTMLInputElement;
    expect(input.type).toBe('password');
    // 关自动填充与拼写纠正；不用 new-password（浏览器会弹「建议强密码」）
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocapitalize')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    fireEvent.change(input, { target: { value: SECRET } });
    fireEvent.click(document.querySelector('.ant-input-password-icon') as Element);
    await waitFor(() => expect((screen.getByLabelText('API Key') as HTMLInputElement).type).toBe('text'));
    fireEvent.click(document.querySelector('.ant-input-password-icon') as Element);
    await waitFor(() => expect((screen.getByLabelText('API Key') as HTMLInputElement).type).toBe('password'));
    expect(advanced().open).toBe(false);
    expect((screen.getByLabelText('服务地址') as HTMLInputElement).value).toBe(ZHIPU_URL);
    // 密钥输入框不命名（不给密码管理器 / 自动填充留钩子）
    expect(input.getAttribute('name')).toBeNull();
  });
});

describe('③ 保存与密钥', () => {
  it('保存：密钥随请求体提交；保存后只剩掩码占位与「更换」，页面与浏览器存储都没有明文', async () => {
    await renderLoaded();
    typeKey(SECRET);
    await pickModel('GLM-5.3');
    fireEvent.click(btn('保存'));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const call = saveCalls()[0]!;
    expect(call.body).toEqual({
      provider: 'zhipu', enabled: true, baseUrl: ZHIPU_URL, apiKey: SECRET, model: 'glm-5.3',
      models: ['glm-5.3-flash', 'glm-5.3-flashx-legal', 'glm-5.3-flashx', 'glm-5.3', 'glm-5.2', 'glm-5.1', 'glm-5v-turbo', 'glm-5'],
    });
    expect(fake.savedKeys).toEqual([SECRET]);
    expect(call.url).not.toContain(SECRET);

    // 明文输入框消失：只剩禁用的掩码占位 + 更换
    await waitFor(() => expect(btn('更换')).toBeTruthy());
    const keyInputs = screen.getAllByLabelText(/^API Key/);
    expect(keyInputs).toHaveLength(1);
    const masked = keyInputs[0] as HTMLInputElement;
    expect(masked.value).toBe('••••••••••••');
    expect(masked.disabled).toBe(true);
    expect(screen.queryByDisplayValue(SECRET)).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);
    expect(storage.writes).toEqual([]);
    // 状态区：已保存未测试；第一家自动成为当前模型
    expect(screen.getByText('已保存，尚未测试')).toBeTruthy();
    expect(screen.getByText('当前使用中')).toBeTruthy();
    expect(summary()).toBe('当前模型：智谱 BigModel · glm-5.3');
    expect(await screen.findByText(/已保存，下次 Agent 运行即使用 glm-5.3/)).toBeTruthy();

    // 再保存一次不带新密钥：请求体里没有 apiKey（服务器 = 保留原密钥）
    await pickModel('GLM-5.2');
    fireEvent.click(btn('保存'));
    await waitFor(() => expect(saveCalls()).toHaveLength(2));
    expect(saveCalls()[1]!.body).not.toHaveProperty('apiKey');
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('已保存密钥：点「更换」才出现空输入框；「取消」不改动、留空保存不覆盖', async () => {
    fake.state.providers.zhipu = { enabled: true, baseUrl: ZHIPU_URL, models: ['glm-5.3'], model: 'glm-5.3', hasKey: true };
    fake.state.active = { provider: 'zhipu', model: 'glm-5.3' };
    await renderLoaded();
    expect((screen.getByLabelText('API Key（已保存，不显示明文）') as HTMLInputElement).value).toBe('••••••••••••');
    fireEvent.click(btn('更换'));
    const input = screen.getByLabelText('API Key') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: 'another-key-9876543210' } });
    fireEvent.click(btn('取消'));
    expect(screen.getByLabelText('API Key（已保存，不显示明文）')).toBeTruthy();
    expect(document.body.textContent).not.toContain('another-key-9876543210');
    // 留空更换后保存：不带 apiKey
    fireEvent.click(btn('更换'));
    fireEvent.click(btn('保存'));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0]!.body).not.toHaveProperty('apiKey');
  });
});

describe('④ 测试连接', () => {
  it('失败：直接显示服务器给的人话原因，不出现原始报错', async () => {
    fake.respond.test({ body: { ok: false, latencyMs: null, model: 'glm-5.3-flash', message: 'API Key 无效或已失效：Incorrect API key provided' } });
    await renderLoaded();
    typeKey(SECRET);
    await pickModel('GLM-5.3-Flash');
    fireEvent.click(btn('测试连接'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('连接失败：API Key 无效或已失效：Incorrect API key provided');
    expect(document.body.textContent).not.toContain('Failed to fetch');
    expect(document.body.textContent).not.toContain('TypeError');
    // 未保存的密钥随测试请求提交（先验证再保存），页面仍不回显
    expect(server.callsTo('POST', '/api/agent/test')[0]!.body).toEqual({ provider: 'zhipu', model: 'glm-5.3-flash', apiKey: SECRET });
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('成功：显示「连接成功 · 延迟 · 模型」', async () => {
    await renderLoaded();
    typeKey(SECRET);
    await pickModel('GLM-5.3-Flash');
    fireEvent.click(btn('测试连接'));
    expect((await screen.findByText('连接成功 · 412 ms · glm-5.3-flash')).textContent).toBe('连接成功 · 412 ms · glm-5.3-flash');
  });

  it('测的是已保存的那份时不带临时地址 / 密钥（服务器才会记录结果），状态区随之变成「已连接 · 时间 · 延迟」', async () => {
    fake.state.providers.zhipu = { enabled: true, baseUrl: ZHIPU_URL, models: ['glm-5.3-flash'], model: 'glm-5.3-flash', hasKey: true };
    fake.state.active = { provider: 'zhipu', model: 'glm-5.3-flash' };
    await renderLoaded();
    expect(screen.getByText('已保存，尚未测试')).toBeTruthy();
    fireEvent.click(btn('测试连接'));
    expect(server.callsTo('POST', '/api/agent/test')[0]!.body).toEqual({ provider: 'zhipu', model: 'glm-5.3-flash' });
    await waitFor(() => expect(screen.getByText('已连接').parentElement!.textContent).toBe(`已连接 · ${formatTestedAt(TESTED_AT)} · 412 ms`));
  });

  it('改了密钥保存后不再把旧的「已连接」当作当前结论', async () => {
    fake.state.providers.zhipu = {
      enabled: true, baseUrl: ZHIPU_URL, models: ['glm-5.3-flash'], model: 'glm-5.3-flash', hasKey: true,
      status: 'connected', testedAt: TESTED_AT, latencyMs: 300, lastError: '',
    };
    fake.state.active = { provider: 'zhipu', model: 'glm-5.3-flash' };
    await renderLoaded();
    expect(screen.getByText('已连接').parentElement!.textContent).toContain('300 ms');
    fireEvent.click(btn('更换'));
    typeKey('brand-new-key-5555');
    fireEvent.click(btn('保存'));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.getByText('已保存，配置已变更')).toBeTruthy());
    expect(screen.getByText(/上次测试（已连接）针对的是旧配置，请重新测试连接。/)).toBeTruthy();
    expect(screen.queryByText('已连接')).toBeNull();
  });
});

describe('⑤ 获取模型列表', () => {
  it('失败：回退预置清单并写明「自动获取失败，已显示预置清单：原因」', async () => {
    fake.respond.models({ body: { ok: false, models: [], message: '连不上服务：请确认服务已启动，地址与端口正确' } });
    await renderLoaded();
    typeKey(SECRET);
    fireEvent.click(btn('获取模型列表'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('自动获取失败，已显示预置清单：连不上服务：请确认服务已启动，地址与端口正确');
    expect(server.callsTo('POST', '/api/agent/models')[0]!.body).toEqual({ provider: 'zhipu', apiKey: SECRET });
    const dropdown = await openModelList();
    const titles = [...dropdown.querySelectorAll('.ant-select-item-option')].map((item) => item.getAttribute('title'));
    expect(titles).toEqual(['GLM-5.3-Flash', 'GLM-5.3-FlashX-Legal', 'GLM-5.3-FlashX', 'GLM-5.3', 'GLM-5.2', 'GLM-5.1', 'GLM-5V-Turbo', 'GLM-5']);
  });

  it('成功：下拉换成获取到的清单，保留当前已选模型，并提示数量', async () => {
    await renderLoaded();
    typeKey(SECRET);
    await pickModel('GLM-5.3-Flash');
    fireEvent.click(btn('获取模型列表'));
    expect((await screen.findByText('已获取 3 个模型')).textContent).toBe('已获取 3 个模型');
    const dropdown = await openModelList();
    const titles = [...dropdown.querySelectorAll('.ant-select-item-option')].map((item) => item.getAttribute('title'));
    // 选项 title = 显示名：预置里有的沿用预置名，没有的（服务商线上才有）直接用模型 ID
    expect(titles).toEqual(['GLM-5.3-Flash', 'GLM-5.3', 'live-only-model']);
    expect(dropdown.textContent).toContain('已获取');
  });

  it('接口本身出错（非 2xx）：同样回退预置清单，原因用服务器的人话', async () => {
    installAgentServer({ ...fake.routes, 'POST /api/agent/models': () => ({ status: 400, body: { error: '请先填写 API Key' } }) });
    fake.state.providers.zhipu = { enabled: true, baseUrl: ZHIPU_URL, models: ['glm-5.3-flash'], model: 'glm-5.3-flash', hasKey: true };
    await renderLoaded();
    fireEvent.click(btn('获取模型列表'));
    expect((await screen.findByRole('alert')).textContent).toBe('自动获取失败，已显示预置清单：请先填写 API Key');
  });

  it('没有预置清单的服务商（Ollama）获取失败：提示改为引导手动添加', async () => {
    fake.respond.models({ body: { ok: false, models: [], message: '连不上服务：请确认服务已启动，地址与端口正确' } });
    await renderLoaded();
    selectTab('Ollama');
    fireEvent.click(btn('获取模型列表'));
    expect((await screen.findByRole('alert')).textContent).toBe('自动获取失败，可点「手动添加」填写模型 ID：连不上服务：请确认服务已启动，地址与端口正确');
  });
});

describe('本机服务 / 自定义 / 权限', () => {
  it('本机服务（Ollama）：没有 API Key 字段，显示「本机服务，无需密钥」；只差模型时原因只写模型', async () => {
    await renderLoaded();
    selectTab('Ollama');
    expect(screen.getByText('本机服务，无需密钥')).toBeTruthy();
    expect(screen.queryAllByLabelText(/^API Key/)).toHaveLength(0);
    expect((screen.getByLabelText('服务地址') as HTMLInputElement).value).toBe('http://127.0.0.1:11434/v1');
    expect(screen.getByText('请先选择模型')).toBeTruthy();
    expect(screen.queryByText(/请先填写 API Key/)).toBeNull();
    expect(btn('获取模型列表').disabled).toBe(false);
  });

  it('自定义服务商完整可用：地址必填且默认展开 → 手动添加模型 → 无密钥保存 → 成为当前模型', async () => {
    await renderLoaded();
    selectTab('自定义');
    expect(advanced().open).toBe(true);
    expect(screen.getByText('请先填写服务地址；请先选择模型')).toBeTruthy();
    expect(screen.getByText('自定义服务商必须填写服务地址。')).toBeTruthy();
    // 可选密钥：标签仍是「API Key」，旁边用小字标「可选」
    expect(screen.getByText('可选')).toBeTruthy();
    expect(screen.getByLabelText(/^API Key/).id).toBe('agent-service-key-custom');
    expect(screen.getByRole('complementary', { name: '模型服务说明' }).textContent).toContain('只改写结论叙述与后续问题建议');

    fireEvent.change(screen.getByLabelText('服务地址'), { target: { value: 'http://127.0.0.1:9999/v1' } });
    expect(screen.getByText('请先选择模型')).toBeTruthy();
    expect(btn('手动添加').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn('手动添加'));
    fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: '  my-model  ' } });
    fireEvent.click(btnExact('添加'));
    await waitFor(() => expect(btn('保存').disabled).toBe(false));
    expect(btn('测试连接').disabled).toBe(false);
    expect(screen.queryByText(/请先/)).toBeNull();

    fireEvent.click(btn('保存'));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0]!.body).toEqual({
      provider: 'custom', enabled: true, baseUrl: 'http://127.0.0.1:9999/v1', models: ['my-model'], model: 'my-model',
    });
    await waitFor(() => expect(screen.getByText('当前使用中')).toBeTruthy());
    expect(fake.state.active).toEqual({ provider: 'custom', model: 'my-model' });
  });

  it('自定义服务商的可选密钥：标注「可选」，填了才随保存提交', async () => {
    await renderLoaded();
    selectTab('自定义');
    fireEvent.change(screen.getByLabelText('服务地址'), { target: { value: 'http://127.0.0.1:9999/v1' } });
    fireEvent.click(btn('手动添加'));
    fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'my-model' } });
    fireEvent.keyDown(screen.getByLabelText('模型 ID'), { key: 'Enter' });
    await waitFor(() => expect(btn('保存').disabled).toBe(false));
    typeKey('local-token-1234567890');
    fireEvent.click(btn('保存'));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0]!.body).toMatchObject({ provider: 'custom', apiKey: 'local-token-1234567890', model: 'my-model' });
    expect(document.body.textContent).not.toContain('local-token-1234567890');
  });

  it('查阅者：输入框与按钮全部禁用并写出原因；点「测试连接」不发请求', async () => {
    fake.state.providers.zhipu = {
      enabled: true, baseUrl: ZHIPU_URL, models: ['glm-5.3-flash'], model: 'glm-5.3-flash', hasKey: true,
      status: 'connected', testedAt: TESTED_AT, latencyMs: 300, lastError: '',
    };
    fake.state.active = { provider: 'zhipu', model: 'glm-5.3-flash' };
    await renderLoaded(false);
    expect(screen.getByText('查阅者不可修改配置，请联系 GTM')).toBeTruthy();
    for (const name of ['测试连接', '保存', '更换']) expect(btn(name).disabled).toBe(true);
    expect((screen.getByLabelText('API Key（已保存，不显示明文）') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: '模型' }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(btn('测试连接'));
    expect(server.callsTo('POST', '/api/agent/test')).toHaveLength(0);
    expect(saveCalls()).toHaveLength(0);
    // 只读也能看全部信息
    expect(screen.getByText('已连接').parentElement!.textContent).toContain('300 ms');
    expect(screen.getByText('当前使用中')).toBeTruthy();
  });

  it('「改用本地引擎」取消当前模型；「删除配置」确认后发 remove，该家回到未配置', async () => {
    fake.state.providers.zhipu = { enabled: true, baseUrl: ZHIPU_URL, models: ['glm-5.3-flash'], model: 'glm-5.3-flash', hasKey: true };
    fake.state.active = { provider: 'zhipu', model: 'glm-5.3-flash' };
    await renderLoaded();
    selectTab('智谱');
    fireEvent.click(btn('改用本地引擎'));
    await waitFor(() => expect(server.callsTo('POST', '/api/agent/active')).toHaveLength(1));
    expect(server.callsTo('POST', '/api/agent/active')[0]!.body).toEqual({});
    await waitFor(() => expect(summary()).toBe('当前模型：本地引擎（未配置模型服务）'));
    // 取消后「改用本地引擎」退场（已不是当前模型），「删除配置」仍在
    await waitFor(() => expect(screen.queryByRole('button', { name: /改用本地引擎/ })).toBeNull());
    fireEvent.click(btn('删除配置'));
    fireEvent.click(btnExact('删除'));
    await waitFor(() => expect(fake.state.providers.zhipu).toBeUndefined());
    expect(server.callsTo('POST', '/api/agent/providers')[0]!.body).toEqual({ provider: 'zhipu', remove: true });
    await waitFor(() => expect(tab('智谱').textContent).not.toContain('已配置'));
  });

  it('「设为当前模型」：保存另一家后出现，点击调 POST /api/agent/active；有未保存修改时写明「请先保存修改」', async () => {
    fake.state.providers.zhipu = { enabled: true, baseUrl: ZHIPU_URL, models: ['glm-5.3-flash'], model: 'glm-5.3-flash', hasKey: true };
    fake.state.active = { provider: 'zhipu', model: 'glm-5.3-flash' };
    await renderLoaded();
    // 默认落在当前使用的那家；已是当前模型时不再显示该动作
    expect(tab('智谱').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('button', { name: /设为当前模型/ })).toBeNull();

    selectTab('DeepSeek');
    typeKey(SECRET);
    await pickModel('DeepSeek V4.1 Flash 1017');
    fireEvent.click(btn('保存'));
    await waitFor(() => expect(screen.getByRole('button', { name: /设为当前模型/ })).toBeTruthy());
    // 改了模型但没保存：动作禁用并写出原因
    await pickModel('DeepSeek V4 Pro');
    expect(btn('设为当前模型').disabled).toBe(true);
    expect(screen.getByText('请先保存修改')).toBeTruthy();
    fireEvent.click(btn('保存'));
    await waitFor(() => expect(btn('设为当前模型').disabled).toBe(false));

    fireEvent.click(btn('设为当前模型'));
    await waitFor(() => expect(server.callsTo('POST', '/api/agent/active')).toHaveLength(1));
    expect(server.callsTo('POST', '/api/agent/active')[0]!.body).toEqual({ provider: 'deepseek', model: 'deepseek-v4-pro' });
    await waitFor(() => expect(screen.getAllByText('当前使用中').length).toBeGreaterThan(0));
    expect(summary()).toBe('当前模型：DeepSeek · deepseek-v4-pro');
    expect(tab('智谱').textContent).not.toContain('使用中');
    expect(tab('DeepSeek').textContent).toContain('使用中');
  });
});

describe('状态区', () => {
  it('四态文字明确：未配置 / 已连接（时间与延迟）/ 连接失败（原因）/ 已停用', async () => {
    fake.state.providers.zhipu = {
      enabled: true, baseUrl: ZHIPU_URL, models: ['glm-5.3-flash'], model: 'glm-5.3-flash', hasKey: true,
      status: 'connected', testedAt: TESTED_AT, latencyMs: 300, lastError: '',
    };
    fake.state.providers.deepseek = {
      enabled: true, baseUrl: 'https://api.deepseek.com', models: ['deepseek-flash'], model: 'deepseek-flash', hasKey: true,
      status: 'failed', testedAt: TESTED_AT, latencyMs: null, lastError: 'API Key 无效或已失效',
    };
    fake.state.providers.moonshot = { enabled: false, baseUrl: 'https://api.moonshot.ai/v1', models: ['kimi-k3'], model: 'kimi-k3', hasKey: true };
    fake.state.active = { provider: 'zhipu', model: 'glm-5.3-flash' };
    await renderLoaded();
    expect(screen.getByText('已连接').parentElement!.textContent).toBe(`已连接 · ${formatTestedAt(TESTED_AT)} · 300 ms`);
    expect(screen.getByText('当前使用中')).toBeTruthy();
    // 列表里的状态点：已连接与连接失败不同色，未配置中性
    const dotOf = (name: string): string | null => tab(name).querySelector('[data-provider-status]')?.getAttribute('data-provider-status') ?? null;
    // 当前使用的那家显示「使用中」而不是状态点
    expect(dotOf('智谱')).toBeNull();
    expect(tab('智谱').textContent).toContain('使用中');
    expect(dotOf('DeepSeek')).toBe('failed');
    expect(dotOf('Kimi')).toBe('disabled');
    expect(dotOf('OpenAI')).toBe('unconfigured');
    expect(tab('OpenAI').textContent).toContain('未配置');

    selectTab('DeepSeek');
    expect(screen.getByText('连接失败').parentElement!.textContent).toBe('连接失败：API Key 无效或已失效');
    expect(screen.queryByText('当前使用中')).toBeNull();
    expect(btn('设为当前模型').disabled).toBe(false);

    selectTab('Kimi');
    expect(within(screen.getByRole('tabpanel')).getByText('已停用')).toBeTruthy();
    expect(screen.getByText('保存后重新启用。')).toBeTruthy();
    expect(btn('设为当前模型').title).toBe('该服务商已停用，保存后重新启用');
  });

  it('读取失败：给出人话原因与「重试」，不渲染表单；重试成功后恢复', async () => {
    let failing = true;
    installAgentServer({
      'GET /api/agent/providers': () => (failing ? { status: 404, body: null } : { body: fake.state }),
    });
    renderBlock();
    expect((await screen.findByRole('alert')).textContent).toContain('读取模型服务配置失败：本机服务器没有模型服务接口，请把服务器更新到包含「Agent 模型服务」的版本');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    failing = false;
    fireEvent.click(btn('重试'));
    await screen.findAllByRole('tab');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
