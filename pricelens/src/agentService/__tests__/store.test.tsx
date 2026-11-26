// ============================================================
// Agent 模型服务 · 共享状态单测（mock fetch）：
// 读取合并并发 / 新鲜窗口内不重复请求 / 失败不抛只写 error / 保存与切换整体替换状态 /
// 订阅广播 / 密钥不进任何浏览器存储。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  getAgentServiceSnapshot,
  loadAgentService,
  resetAgentServiceStoreForTests,
  saveAgentProvider,
  setActiveModel,
  subscribeAgentService,
  useAgentService,
} from '../store';
import { createFakeAgentService, installAgentServer, installMemoryStorage, type FakeAgentService } from './fakeAgentServer';

const SECRET = 'sk-store-0123456789abcdef';

function Probe({ label }: { label: string }) {
  const snapshot = useAgentService();
  return <div data-testid={label}>{JSON.stringify({
    loading: snapshot.loading, error: snapshot.error,
    active: snapshot.data?.active ?? null, hasZhipu: Boolean(snapshot.data?.providers.zhipu),
  })}</div>;
}

let fake: FakeAgentService;
beforeEach(() => {
  resetAgentServiceStoreForTests();
  fake = createFakeAgentService();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('共享状态 · 读取', () => {
  it('首次读取：loading → data 就位、error 清空；并发调用合并成一次请求', async () => {
    const server = installAgentServer(fake.routes);
    const seen: string[] = [];
    const unsubscribe = subscribeAgentService(() => seen.push(getAgentServiceSnapshot().loading ? 'loading' : 'ready'));
    const [first, second] = await Promise.all([loadAgentService(), loadAgentService()]);
    expect(first).toBe(second);
    expect(server.callsTo('GET', '/api/agent/providers')).toHaveLength(1);
    expect(getAgentServiceSnapshot().data?.presets.length).toBeGreaterThan(0);
    expect(getAgentServiceSnapshot().error).toBeNull();
    expect(getAgentServiceSnapshot().loading).toBe(false);
    expect(seen[0]).toBe('loading');
    unsubscribe();
  });

  it('新鲜窗口（5 秒）内重复读取直接用缓存；force 才再请求', async () => {
    const server = installAgentServer(fake.routes);
    await loadAgentService();
    await loadAgentService();
    expect(server.callsTo('GET', '/api/agent/providers')).toHaveLength(1);
    await loadAgentService({ force: true });
    expect(server.callsTo('GET', '/api/agent/providers')).toHaveLength(2);
  });

  it('读取失败不抛：返回 null，人话原因写进 error，data 仍为空', async () => {
    installAgentServer({ 'GET /api/agent/providers': () => ({ status: 404, body: null }) });
    expect(await loadAgentService()).toBeNull();
    const snapshot = getAgentServiceSnapshot();
    expect(snapshot.data).toBeNull();
    expect(snapshot.error).toBe('本机服务器没有模型服务接口，请把服务器更新到包含「Agent 模型服务」的版本');
  });

  it('已有数据时刷新失败：旧数据保留并标出错误，界面不闪空', async () => {
    let down = false;
    const server = installAgentServer({
      'GET /api/agent/providers': () => (down ? { status: 500, body: { error: '模型服务内部错误' } } : { body: fake.state }),
    });
    await loadAgentService();
    const before = getAgentServiceSnapshot().data;
    down = true;
    await loadAgentService({ force: true });
    expect(getAgentServiceSnapshot().data).toBe(before);
    expect(getAgentServiceSnapshot().error).toBe('模型服务内部错误');
    expect(server.callsTo('GET', '/api/agent/providers')).toHaveLength(2);
  });
});

describe('共享状态 · 保存与切换', () => {
  it('保存成功：整体替换成服务器返回的最新状态，密钥只出现在请求体', async () => {
    const storage = installMemoryStorage();
    const server = installAgentServer(fake.routes);
    const next = await saveAgentProvider({ provider: 'zhipu', enabled: true, baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: SECRET, model: 'glm-5.3-flash' });
    expect(next.active).toEqual({ provider: 'zhipu', model: 'glm-5.3-flash' });
    expect(getAgentServiceSnapshot().data).toBe(next);
    expect(getAgentServiceSnapshot().data?.providers.zhipu?.hasKey).toBe(true);
    expect(JSON.stringify(next)).not.toContain(SECRET);
    expect(server.callsTo('POST', '/api/agent/providers')[0]!.body).toMatchObject({ apiKey: SECRET });
    expect(storage.writes).toEqual([]);
  });

  it('保存失败：抛带人话的错误，旧状态不动', async () => {
    installAgentServer({
      'GET /api/agent/providers': () => ({ body: fake.state }),
      'POST /api/agent/providers': () => ({ status: 400, body: { error: '该服务商需要 API Key' } }),
    });
    await loadAgentService();
    const before = getAgentServiceSnapshot().data;
    await expect(saveAgentProvider({ provider: 'zhipu', enabled: true, baseUrl: 'x', model: 'm' })).rejects.toThrow('该服务商需要 API Key');
    expect(getAgentServiceSnapshot().data).toBe(before);
  });

  it('切换当前模型：POST /api/agent/active 后状态整体更新；取消发空对象', async () => {
    fake.state.providers.zhipu = { enabled: true, baseUrl: 'a', models: ['glm-a', 'glm-b'], model: 'glm-a', hasKey: true };
    const server = installAgentServer(fake.routes);
    const next = await setActiveModel({ provider: 'zhipu', model: 'glm-b' });
    expect(next.active).toEqual({ provider: 'zhipu', model: 'glm-b' });
    expect(server.callsTo('POST', '/api/agent/active')[0]!.body).toEqual({ provider: 'zhipu', model: 'glm-b' });
    await setActiveModel(null);
    expect(getAgentServiceSnapshot().data?.active).toBeNull();
    expect(server.callsTo('POST', '/api/agent/active')[1]!.rawBody).toBe('{}');
  });
});

describe('共享状态 · React 订阅', () => {
  it('useAgentService 订阅：保存后组件即时重渲染', async () => {
    installAgentServer(fake.routes);
    render(<Probe label="a" />);
    expect(screen.getByTestId('a').textContent).toContain('"loading":false,"error":null,"active":null');
    await act(async () => { await loadAgentService(); });
    expect(screen.getByTestId('a').textContent).toContain('"active":null');
    await act(async () => {
      await saveAgentProvider({ provider: 'zhipu', enabled: true, baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: SECRET, model: 'glm-5.3-flash' });
    });
    expect(screen.getByTestId('a').textContent).toContain('"hasZhipu":true');
    expect(screen.getByTestId('a').textContent).toContain('"active":{"provider":"zhipu","model":"glm-5.3-flash"}');
  });
});
