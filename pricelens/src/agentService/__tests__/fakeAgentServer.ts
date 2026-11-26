// ============================================================
// 测试辅助：Agent 模型服务的假服务器（fetch 桩）
//  - installAgentServer：按「METHOD path」路由的 fetch 桩，记录每次调用的请求体
//    （供断言「密钥只出现在请求体里」）；
//  - createFakeAgentService：带内存状态的假服务器，语义对齐 server/agent_gateway.py
//    （首次保存自动成为当前模型 / 切换只认已启用且在列表里的模型 / 响应永不带密钥）。
// ============================================================
import { vi } from 'vitest';
import { LOCAL_PROVIDER_PRESETS, type AgentServiceState } from '../providers';

export interface JsonBody { [key: string]: unknown }

export interface RouteResult {
  status?: number;
  body: unknown;
}

export type RouteHandler = (body: JsonBody | undefined, init: RequestInit | undefined) => RouteResult | Promise<RouteResult>;

export interface RecordedCall {
  method: string;
  path: string;
  url: string;
  body: JsonBody | undefined;
  rawBody: BodyInit | null | undefined;
  init: RequestInit | undefined;
}

export const emptyAgentState = (): AgentServiceState => ({
  service: 'local',
  active: null,
  presets: LOCAL_PROVIDER_PRESETS.map((preset) => ({ ...preset })),
  providers: {},
});

/** 深拷贝：真实服务器每次响应都是新对象，组件据此做 memo 依赖 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function installAgentServer(routes: Record<string, RouteHandler>) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const path = new URL(url, 'http://localhost').pathname;
    const rawBody = init?.body;
    const body = typeof rawBody === 'string' ? (JSON.parse(rawBody) as JsonBody) : undefined;
    calls.push({ method, path, url, body, rawBody, init });
    const handler = routes[`${method} ${path}`];
    const result: RouteResult = handler
      ? await handler(body, init)
      : { status: 404, body: { error: `未知 API：${method} ${path}` } };
    const status = result.status ?? 200;
    return { ok: status < 400, status, json: async () => clone(result.body) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const callsTo = (method: string, path: string): RecordedCall[] => calls.filter((call) => call.method === method && call.path === path);
  return { calls, fetchMock, callsTo };
}

export interface FakeAgentService {
  routes: Record<string, RouteHandler>;
  /** 可直接改写的内存状态（下一次响应生效） */
  state: AgentServiceState;
  /** 服务器收到过的密钥明文（只在本假服务器内，模拟落盘；响应永不带出） */
  savedKeys: string[];
  /** 改写后续测试连接 / 拉模型列表的返回 */
  respond: { test: (result: RouteResult) => void; models: (result: RouteResult) => void };
}

/** 内存版假服务器；test / models 默认成功，可由 respond 逐次改写 */
export function createFakeAgentService(): FakeAgentService {
  const state = emptyAgentState();
  const savedKeys: string[] = [];
  let testResult: RouteResult = { body: { ok: true, latencyMs: 412, model: '', message: '连接成功' } };
  let modelsResult: RouteResult = { body: { ok: true, models: ['glm-5.3-flash', 'glm-5.3', 'live-only-model'], message: '' } };
  const routes: Record<string, RouteHandler> = {
    'GET /api/agent/providers': () => ({ body: state }),
    'POST /api/agent/providers': (body) => {
      const provider = String(body?.provider ?? '');
      // 与真实服务器一致：remove = 删除该家配置（连同密钥）；若正是当前模型则一并取消
      if (body?.remove) {
        delete state.providers[provider];
        if (state.active?.provider === provider) state.active = null;
        return { body: state };
      }
      const previous = state.providers[provider];
      const key = typeof body?.apiKey === 'string' && body.apiKey ? body.apiKey : '';
      if (key) savedKeys.push(key);
      const models = Array.isArray(body?.models) ? (body!.models as string[]) : previous?.models ?? [];
      state.providers[provider] = {
        ...(previous ?? {}),
        enabled: body?.enabled !== false,
        baseUrl: String(body?.baseUrl ?? previous?.baseUrl ?? ''),
        models,
        model: String(body?.model ?? ''),
        hasKey: key ? true : (previous?.hasKey ?? false),
      };
      if (state.providers[provider]!.enabled && !state.active) {
        state.active = { provider, model: state.providers[provider]!.model };
      }
      return { body: state };
    },
    'POST /api/agent/active': (body) => {
      if (!body || !body.provider) { state.active = null; return { body: state }; }
      const record = state.providers[String(body.provider)];
      if (!record) return { status: 400, body: { error: '该服务商尚未保存配置' } };
      if (!record.enabled) return { status: 400, body: { error: '该服务商已停用，请先启用' } };
      if (!record.models.includes(String(body.model))) return { status: 400, body: { error: '模型不在该服务商的模型列表里' } };
      state.active = { provider: String(body.provider), model: String(body.model) };
      return { body: state };
    },
    'POST /api/agent/models': () => modelsResult,
    'POST /api/agent/test': (body) => {
      if (testResult.body && typeof testResult.body === 'object' && 'model' in (testResult.body as object)) {
        const record = state.providers[String(body?.provider ?? '')];
        const result: Record<string, unknown> = { ...(testResult.body as Record<string, unknown>), model: String(body?.model ?? '') };
        // 与真实服务器一致：只测已保存的那份（请求里没带临时地址 / 密钥）才记录结果
        if (record && !body?.baseUrl && !body?.apiKey) {
          record.status = result.ok === true ? 'connected' : 'failed';
          record.testedAt = '2026-11-27T02:00:00.000Z';
          record.latencyMs = (result.latencyMs as number | null) ?? null;
          record.lastError = String(result.message ?? '');
        }
        return { body: result };
      }
      return testResult;
    },
  };
  return {
    routes,
    state,
    savedKeys,
    respond: {
      test: (result) => { testResult = result; },
      models: (result) => { modelsResult = result; },
    },
  };
}

/** 内存版 localStorage / sessionStorage：记录所有写入，供「密钥不落浏览器存储」断言 */
export function installMemoryStorage(): { writes: { store: string; key: string; value: string }[] } {
  const writes: { store: string; key: string; value: string }[] = [];
  const make = (store: string): Storage => {
    const mem = new Map<string, string>();
    return {
      getItem: (key) => mem.get(key) ?? null,
      setItem: (key, value) => { mem.set(key, String(value)); writes.push({ store, key, value: String(value) }); },
      removeItem: (key) => void mem.delete(key),
      clear: () => mem.clear(),
      key: (index) => [...mem.keys()][index] ?? null,
      get length() { return mem.size; },
    };
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: make('localStorage') });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: make('sessionStorage') });
  return { writes };
}
