// ============================================================
// Agent 模型服务 · 接口封装单测（mock fetch）：
// 请求形态（方法 / 路径 / JSON 请求体 / 密钥只在请求体里）/ 非 2xx 与网络失败一律给
// 人话（不抛原始报错）/ 超时中止 / 响应消息里的密钥打码 / 取消当前模型发空对象。
// ============================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentServiceApiError, agentServiceApi, redactSecret } from '../api';
import { emptyAgentState, installAgentServer, type RecordedCall } from './fakeAgentServer';

const SECRET = 'sk-test-0123456789abcdef';

/** 统一拿到 rejection（并断言确实是 AgentServiceApiError） */
async function rejection(promise: Promise<unknown>): Promise<AgentServiceApiError> {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(AgentServiceApiError);
  return error as AgentServiceApiError;
}

const savePayload = {
  provider: 'zhipu', enabled: true, baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3-flash',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('接口 · 读状态 / 保存 / 切换', () => {
  it('GET /api/agent/providers：同源相对路径、不带请求体、不缓存', async () => {
    const server = installAgentServer({ 'GET /api/agent/providers': () => ({ body: emptyAgentState() }) });
    const state = await agentServiceApi.getState();
    expect(state.active).toBeNull();
    expect(state.presets.length).toBeGreaterThan(0);
    const call = server.calls[0]!;
    expect(call.url).toBe('/api/agent/providers');
    expect(call.method).toBe('GET');
    expect(call.rawBody).toBeUndefined();
    expect(call.init?.cache).toBe('no-store');
  });

  it('保存：JSON 请求体带 apiKey 与 Content-Type；密钥只出现在请求体里，不进 URL', async () => {
    const server = installAgentServer({ 'POST /api/agent/providers': () => ({ body: emptyAgentState() }) });
    await agentServiceApi.saveProvider({ ...savePayload, apiKey: SECRET, models: ['glm-5.3-flash'] });
    const call = server.callsTo('POST', '/api/agent/providers')[0]!;
    expect(call.body).toEqual({ ...savePayload, apiKey: SECRET, models: ['glm-5.3-flash'] });
    expect(call.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(call.url).not.toContain(SECRET);
    expect(call.path).not.toContain(SECRET);
  });

  it('保存不带新密钥时：请求体里没有 apiKey / clearKey 字段（服务器语义 = 保留已保存的密钥）', async () => {
    const server = installAgentServer({ 'POST /api/agent/providers': () => ({ body: emptyAgentState() }) });
    await agentServiceApi.saveProvider(savePayload);
    expect(server.callsTo('POST', '/api/agent/providers')[0]!.body).toEqual(savePayload);
  });

  it('切换当前模型：POST /api/agent/active { provider, model }', async () => {
    const server = installAgentServer({ 'POST /api/agent/active': () => ({ body: emptyAgentState() }) });
    await agentServiceApi.setActive({ provider: 'zhipu', model: 'glm-5.3' });
    expect(server.callsTo('POST', '/api/agent/active')[0]!.body).toEqual({ provider: 'zhipu', model: 'glm-5.3' });
  });

  it('取消当前模型：发空对象而不是 JSON null（服务器对非对象请求体会回 400）', async () => {
    const server = installAgentServer({ 'POST /api/agent/active': () => ({ body: emptyAgentState() }) });
    await agentServiceApi.setActive(null);
    expect(server.callsTo('POST', '/api/agent/active')[0]!.rawBody).toBe('{}');
  });
});

describe('接口 · 非 2xx 与网络失败一律给人话', () => {
  it('服务器给了 {error}：原样抛出（服务器已是人话）并带状态码', async () => {
    installAgentServer({ 'POST /api/agent/providers': () => ({ status: 400, body: { error: '该服务商需要 API Key' } }) });
    const error = await rejection(agentServiceApi.saveProvider(savePayload));
    expect(error.message).toBe('该服务商需要 API Key');
    expect(error.status).toBe(400);
  });

  it('没有服务器消息：404 提示更新服务器、5xx 提示看服务器窗口、其余给出状态码', async () => {
    installAgentServer({ 'GET /api/agent/providers': () => ({ status: 404, body: null }) });
    expect((await rejection(agentServiceApi.getState())).message).toBe('本机服务器没有模型服务接口，请把服务器更新到包含「Agent 模型服务」的版本');
    installAgentServer({ 'GET /api/agent/providers': () => ({ status: 502, body: null }) });
    expect((await rejection(agentServiceApi.getState())).message).toBe('模型服务内部错误，详情见服务器窗口日志');
    installAgentServer({ 'GET /api/agent/providers': () => ({ status: 418, body: { ok: true } }) });
    expect((await rejection(agentServiceApi.getState())).message).toBe('服务器响应异常（HTTP 418）');
  });

  it('代理返回 HTML 错误页：不把原始报错抛给人', async () => {
    installAgentServer({ 'GET /api/agent/providers': () => ({ status: 504, body: '<html><body>504 Gateway Time-out</body></html>' }) });
    const error = await rejection(agentServiceApi.getState());
    expect(error.message).toBe('模型服务内部错误，详情见服务器窗口日志');
    expect(error.message).not.toContain('<html>');
  });

  it('服务器消息里的标签与多余空白会被清理，措辞不改写', async () => {
    installAgentServer({
      'POST /api/agent/test': () => ({ status: 400, body: { error: '  请先选择一个模型\n' } }),
    });
    expect((await rejection(agentServiceApi.testConnection({ provider: 'zhipu', model: '' }))).message).toBe('请先选择一个模型');
  });

  it('fetch 抛错（Failed to fetch）→ 连不上本机服务器，不带原始报错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const error = await rejection(agentServiceApi.getState());
    expect(error.message).toBe('连不上本机服务器，请确认 PriceAgent 服务器正在运行');
    expect(error.status).toBeNull();
  });

  it('服务器挂死：到点中止请求并提示超时（读状态 10s；测试连接最长 65s）', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const read = rejection(agentServiceApi.getState());
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await read).message).toBe('服务器响应超时，请确认本机 PriceAgent 服务器仍在运行后重试');
    const test = rejection(agentServiceApi.testConnection({ provider: 'zhipu', model: 'glm-5.3-flash' }));
    await vi.advanceTimersByTimeAsync(64_999);
    // 还没到点：请求仍在等（没有提前判超时）
    let settled = false;
    void test.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect((await test).message).toBe('服务器响应超时：服务商长时间没有回应，请检查服务地址与网络后重试');
  });

  it('错误信息里若带回本次提交的密钥，先打码再交给界面', async () => {
    installAgentServer({
      'POST /api/agent/test': () => ({ status: 400, body: { error: `Invalid request: key ${SECRET} rejected` } }),
    });
    const error = await rejection(agentServiceApi.testConnection({ provider: 'zhipu', model: 'm', apiKey: SECRET }));
    expect(error.message).toBe('Invalid request: key •••••••• rejected');
  });

  it('2xx 但响应不是 JSON 对象（如代理回的字符串）→ 内容无法识别', async () => {
    installAgentServer({ 'GET /api/agent/providers': () => ({ body: 'ok' }) });
    expect((await rejection(agentServiceApi.getState())).message).toBe('服务器返回的内容无法识别，请确认本机服务器为最新版本');
  });

  it('状态响应缺 active / presets 形态不对时按不完整处理，不让坏数据进界面', async () => {
    installAgentServer({ 'GET /api/agent/providers': () => ({ body: { providers: {} } }) });
    expect((await rejection(agentServiceApi.getState())).message).toBe('服务器返回的模型服务配置不完整，请确认本机服务器为最新版本');
  });
});

describe('接口 · 拉模型列表与测试连接', () => {
  it('拉模型成功：只带 provider（地址 / 密钥缺省 = 用服务器已保存的）', async () => {
    const server = installAgentServer({
      'POST /api/agent/models': () => ({ body: { ok: true, models: ['b', 'a', 3, null, 'a'], message: '' } }),
    });
    const result = await agentServiceApi.fetchModels({ provider: 'ollama' });
    expect(result).toEqual({ ok: true, models: ['b', 'a'], message: '' });
    expect(server.callsTo('POST', '/api/agent/models')[0]!.body).toEqual({ provider: 'ollama' });
  });

  it('拉模型失败：ok=false，人话原因原样返回', async () => {
    installAgentServer({
      'POST /api/agent/models': () => ({ body: { ok: false, models: [], message: '连不上服务：请确认服务已启动，地址与端口正确' } }),
    });
    const result = await agentServiceApi.fetchModels({ provider: 'ollama' });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('连不上服务：请确认服务已启动，地址与端口正确');
  });

  it('测试失败：message 原样返回；服务商把密钥回显进错误详情时打码', async () => {
    installAgentServer({
      'POST /api/agent/test': () => ({ body: { ok: false, latencyMs: null, model: 'glm-5.3-flash', message: `API Key 无效或已失效：Incorrect API key provided: ${SECRET}` } }),
    });
    const result = await agentServiceApi.testConnection({ provider: 'zhipu', model: 'glm-5.3-flash', apiKey: SECRET });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('API Key 无效或已失效：Incorrect API key provided: ••••••••');
  });

  it('测试成功：延迟与模型回传；测试请求体 = provider + model（+ 临时地址 / 密钥）', async () => {
    const server = installAgentServer({
      'POST /api/agent/test': () => ({ body: { ok: true, latencyMs: 318, model: 'glm-5.3-flash', message: '连接成功' } }),
    });
    const result = await agentServiceApi.testConnection({ provider: 'zhipu', model: 'glm-5.3-flash', apiKey: SECRET });
    expect(result).toEqual({ ok: true, latencyMs: 318, model: 'glm-5.3-flash', message: '连接成功' });
    const call: RecordedCall = server.callsTo('POST', '/api/agent/test')[0]!;
    expect(call.body).toEqual({ provider: 'zhipu', model: 'glm-5.3-flash', apiKey: SECRET });
    expect(call.url).not.toContain(SECRET);
  });

  it('打码只针对够长的真密钥；过短的测试字符不打码（避免把整句搅乱）', () => {
    expect(redactSecret('x 已失效 x', 'x')).toBe('x 已失效 x');
    expect(redactSecret('key abc123456 end', ' abc123456 ')).toBe('key •••••••• end');
    expect(redactSecret('没有任何密钥', undefined)).toBe('没有任何密钥');
  });
});
