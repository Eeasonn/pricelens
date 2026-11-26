// ============================================================
// Agent 模型服务 · 本机服务器接口封装（同源 /api/agent/*，JSON）
//  - 出错统一抛 AgentServiceApiError：优先用服务器给的 {error}（已是人话），
//    没有服务器消息时按状态码给出本机部署场景下的可操作提示；绝不把 fetch 的
//    原始报错、响应体或请求体拼进错误信息。
//  - 密钥只出现在请求体里（apiKey 字段），不进 URL、不进错误信息、不进任何日志；
//    响应消息里若意外带回本次提交的密钥，一律打码后再交给界面。
//  - 所有请求带超时（服务器侧：拉模型 15s、测试连接 30s 上游超时），服务器挂死时
//    界面不会永远转圈。
//  - POST /api/agent/active 取消当前模型：契约写的是请求体 null，但服务器对非对象
//    请求体会回「请求体必须是 JSON 对象」，所以这里发空对象（服务器语义相同）。
// ============================================================
import type { ActiveModel, AgentServiceState } from './providers';

const BASE_URL = '/api/agent';

/** 毫秒：读状态 / 保存 / 切换 */
const DEFAULT_TIMEOUT_MS = 10_000;
/** 服务器拉模型列表的上游超时是 15s，客户端留余量 */
const FETCH_MODELS_TIMEOUT_MS = 20_000;
/** 服务器测试连接的上游超时是 30s（个别模型参数不兼容时还会重试一次），客户端留余量 */
const TEST_TIMEOUT_MS = 65_000;

export class AgentServiceApiError extends Error {
  /** HTTP 状态码；网络失败 / 超时 / 响应无法解析时为 null */
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'AgentServiceApiError';
    this.status = status;
  }
}

/** 保存某家配置的请求体（apiKey 留空 = 保留服务器上已保存的密钥） */
export interface SaveProviderConfig {
  provider: string;
  enabled: boolean;
  baseUrl: string;
  /** 空字符串或缺省 = 保留服务器上已保存的密钥 */
  apiKey?: string;
  clearKey?: boolean;
  models?: string[];
  model: string;
  makeActive?: boolean;
}

/** 删除某家在本机保存的配置（连同密钥）；它若正是当前模型，服务器一并取消 */
export interface RemoveProviderPayload {
  provider: string;
  remove: true;
}

export type SaveProviderPayload = SaveProviderConfig | RemoveProviderPayload;

export interface EffectiveConfigPayload {
  provider: string;
  /** 缺省 = 用服务器上已保存的地址 */
  baseUrl?: string;
  /** 缺省 = 用服务器上已保存的密钥 */
  apiKey?: string;
}

export interface FetchModelsResult {
  ok: boolean;
  models: string[];
  message: string;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number | null;
  model: string;
  message: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
  /** 调用方取消（如组件卸载）；取消不翻译成「服务器错误」 */
  signal?: AbortSignal;
}

const MAX_MESSAGE_LENGTH = 400;

const clip = (text: string): string => (text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…` : text);

/** 把文本里出现的密钥明文替换为打码（防服务商把密钥回显在错误详情里） */
export function redactSecret(text: string, secret: string | undefined | null): string {
  const value = secret?.trim();
  // 过短的输入（随手敲的测试字符）不打码：真密钥不会这么短，打了反而把整句消息搅乱
  if (!value || value.length < 6 || !text) return text;
  return text.split(value).join('••••••••');
}

/** 服务器消息已是人话；这里只做收尾清理（去标签、空白归一、截断），不改写措辞 */
function humanMessage(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return text ? clip(text) : '';
}

function describeHttpError(data: { error?: unknown } | null, status: number): string {
  const fromServer = humanMessage(data?.error);
  if (fromServer) return fromServer;
  if (status === 404) return '本机服务器没有模型服务接口，请把服务器更新到包含「Agent 模型服务」的版本';
  if (status === 401 || status === 403) return '没有权限访问模型服务';
  if (status === 413) return '请求内容过大';
  if (status >= 500) return '模型服务内部错误，详情见服务器窗口日志';
  return `服务器响应异常（HTTP ${status}）`;
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data != null && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
}

async function request<T>(path: string, options: RequestOptions, secret?: string): Promise<T> {
  const method = options.method ?? 'GET';
  const hasBody = options.body !== undefined;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onOuterAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort, { once: true });
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      cache: 'no-store',
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    // 调用方主动取消：原样抛 AbortError，由调用方决定是否提示
    if (options.signal?.aborted) {
      const cancelled = new Error('已取消');
      cancelled.name = 'AbortError';
      throw cancelled;
    }
    if (timedOut) {
      throw new AgentServiceApiError(
        path === '/test'
          ? '服务器响应超时：服务商长时间没有回应，请检查服务地址与网络后重试'
          : '服务器响应超时，请确认本机 PriceLens 服务器仍在运行后重试',
        null,
      );
    }
    // fetch 的原始报错（Failed to fetch 等）对人没有帮助，换成能照着做的一句话
    throw new AgentServiceApiError('连不上本机服务器，请确认 PriceLens 服务器正在运行', null);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }

  const raw: unknown = await response.json().catch(() => null);
  const body = asRecord(raw);
  if (!response.ok) {
    throw new AgentServiceApiError(redactSecret(describeHttpError(body, response.status), secret), response.status);
  }
  if (!body) {
    throw new AgentServiceApiError('服务器返回的内容无法识别，请确认本机服务器为最新版本', response.status);
  }
  return body as T;
}

const strList = (value: unknown): string[] => [...new Set(
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean),
)];

/** 读取完整状态（预置 + 已保存配置 + 当前模型）；校验最小形态，坏响应按错误处理 */
async function getState(): Promise<AgentServiceState> {
  const data = await request<Partial<AgentServiceState>>('/providers', {});
  if (!Array.isArray(data.presets) || asRecord(data.providers) == null) {
    throw new AgentServiceApiError('服务器返回的模型服务配置不完整，请确认本机服务器为最新版本', 200);
  }
  const active = asRecord(data.active);
  return {
    service: typeof data.service === 'string' ? data.service : 'local',
    active: active && typeof active.provider === 'string' && typeof active.model === 'string'
      ? { provider: active.provider, model: active.model }
      : null,
    presets: data.presets,
    providers: data.providers as AgentServiceState['providers'],
  };
}

export const agentServiceApi = {
  getState,
  /** 保存某家配置；apiKey 留空 = 保留已保存的密钥。返回与 GET 相同的完整状态 */
  saveProvider(payload: SaveProviderPayload): Promise<AgentServiceState> {
    const removing = 'remove' in payload;
    return request<AgentServiceState>(
      '/providers',
      { method: 'POST', body: removing ? { provider: payload.provider, remove: true } : payload },
      removing ? undefined : payload.apiKey,
    );
  },
  /** 切换当前模型（下一次运行生效）；传 null = 取消当前模型 */
  setActive(active: ActiveModel | null): Promise<AgentServiceState> {
    return request<AgentServiceState>('/active', { method: 'POST', body: active ?? {} });
  },
  /** 让服务器代发 {baseUrl}/models 拉模型列表，免浏览器跨域 */
  async fetchModels(payload: EffectiveConfigPayload): Promise<FetchModelsResult> {
    const result = await request<Partial<FetchModelsResult>>('/models', { method: 'POST', body: payload, timeoutMs: FETCH_MODELS_TIMEOUT_MS }, payload.apiKey);
    return {
      ok: result.ok === true,
      models: strList(result.models),
      message: redactSecret(humanMessage(result.message), payload.apiKey),
    };
  },
  /** 用选定模型发一次最小真实请求；服务器把上游异常翻译成人话 */
  async testConnection(payload: EffectiveConfigPayload & { model: string }): Promise<TestConnectionResult> {
    const result = await request<Partial<TestConnectionResult>>('/test', { method: 'POST', body: payload, timeoutMs: TEST_TIMEOUT_MS }, payload.apiKey);
    return {
      ok: result.ok === true,
      latencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : null,
      model: typeof result.model === 'string' ? result.model : payload.model,
      message: redactSecret(humanMessage(result.message), payload.apiKey),
    };
  },
};
