import type { AgentContextSnapshot, AgentResponse } from './contracts';
import { runAgent } from './core';

export interface AgentRunRequest {
  text: string;
  context: AgentContextSnapshot;
  clientRequestId: string;
  baseline?: AgentResponse;
}

export interface AgentClient {
  run(request: AgentRunRequest, signal?: AbortSignal): Promise<AgentResponse>;
}

/** 离线开发 adapter：无后端时保持页面可演示、可测试。 */
export const localAgentClient: AgentClient = {
  run: (request, signal) => request.baseline ? Promise.resolve(request.baseline) : runAgent(request.text, request.context, signal),
};

/** POST + SSE 客户端：远端 Agent 只负责叙述与编排，数值卡片仍由本地确定性引擎生成。 */
export function createSseAgentClient(options: { baseUrl: string; fetcher?: typeof fetch }): AgentClient {
  const fetcher = options.fetcher ?? fetch;
  return {
    async run(request, signal) {
      const baseline = request.baseline ?? (request.context?.state ? await runAgent(request.text, request.context, signal) : undefined);
      const response = await fetcher(`${options.baseUrl.replace(/\/$/, '')}/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({ ...request, baseline }),
        signal,
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null) as { fallback?: AgentResponse } | null;
        if (errorBody?.fallback) return { ...errorBody.fallback, provider: { name: '本地确定性回退', model: 'local' } };
        throw new Error(`Agent 服务异常（${response.status}）`);
      }
      if (!response.body) throw new Error(`Agent 服务异常（${response.status}）`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let responseValue: AgentResponse | null = null;
      while (true) {
        const part = await reader.read();
        buffer += decoder.decode(part.value ?? new Uint8Array(), { stream: !part.done });
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const data = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim();
          if (!data) continue;
          const event = JSON.parse(data) as { type?: string; response?: AgentResponse };
          if (event.response) responseValue = event.response;
        }
        if (part.done) break;
      }
      if (!responseValue) throw new Error('Agent 服务未返回完整结果');
      return responseValue;
    },
  };
}

/** 按构建时配置选择真实服务端或离线确定性适配器。 */
export function defaultAgentClient(): AgentClient {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const baseUrl = env?.VITE_AGENT_API_BASE_URL;
  const protocol = (globalThis as typeof globalThis & { location?: { protocol?: string } }).location?.protocol;
  return baseUrl && protocol !== 'file:' ? createSseAgentClient({ baseUrl }) : localAgentClient;
}
