import type { AgentContextSnapshot, AgentResponse } from './contracts';
import { runAgent } from './core';

export interface AgentRunRequest {
  text: string;
  context: AgentContextSnapshot;
  clientRequestId: string;
}

export interface AgentClient {
  run(request: AgentRunRequest, signal?: AbortSignal): Promise<AgentResponse>;
}

/** 离线开发 adapter：无后端时保持页面可演示、可测试。 */
export const localAgentClient: AgentClient = {
  run: (request, signal) => runAgent(request.text, request.context, signal),
};

/** POST + SSE 客户端骨架：服务端按方案文档发送 result.upsert/content.delta/run.completed 事件。 */
export function createSseAgentClient(options: { baseUrl: string; fetcher?: typeof fetch }): AgentClient {
  const fetcher = options.fetcher ?? fetch;
  return {
    async run(request, signal) {
      const response = await fetcher(`${options.baseUrl.replace(/\/$/, '')}/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(request),
        signal,
      });
      if (!response.ok || !response.body) throw new Error(`Agent 服务异常（${response.status}）`);
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
