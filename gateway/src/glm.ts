/**
 * BigModel GLM chat/completions 流式传输层。
 * 请求体完全由服务端组装：Bearer key 来自 env，model 在白名单内，stream=true，
 * 提示词与采样参数固定——客户端无法覆盖任何上游参数。
 */
import { GLM_MAX_TOKENS, GLM_TEMPERATURE, type GlmMessage } from './prompt';

export const GLM_CHAT_COMPLETIONS_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 20_000;

export class GlmError extends Error {}

/**
 * 从 GLM 流式 chunk 里取增量文本：只取 choices[0].delta.content。
 * glm-5.3-flash 是思考模型，增量里还有 delta.reasoning_content——
 * 那是模型内部推理，绝不进叙述文本或回执帧（PRODUCT.md 的 Agent 边界）。
 */
export function extractDeltaContent(payload: unknown): string {
  const choice = (payload as { choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }> } | null)?.choices?.[0];
  return typeof choice?.delta?.content === 'string' ? choice.delta.content : '';
}

/** 拆完整 SSE 行：只取 data: 行；未换行的尾巴留在 remainder。 */
export function splitSseDataLines(buffer: string, flush: boolean): { lines: string[]; remainder: string } {
  const parts = buffer.split('\n');
  const remainder = flush ? '' : (parts.pop() ?? '');
  const lines = parts
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.startsWith('data:'))
    .map((line) => (line.startsWith('data: ') ? line.slice(6) : line.slice(5)));
  return { lines, remainder };
}

export interface OpenedGlmStream {
  upstream: Response;
  /** 消费上游流，返回拼接后的完整文本；onDelta 收到累计文本。 */
  consume(onDelta?: (fullText: string) => void): Promise<string>;
  /** 无论如何都要调用：清掉超时定时器并中止上游。 */
  close(): void;
}

/**
 * 打开 GLM 流：fetch + 状态码检查在响应给客户端之前完成，
 * 因此上游拒绝/超时仍可返回非 2xx + fallback 信封（见 handlers）。
 * 超时定时器覆盖整个 fetch + 流消费过程（单一 20s 截止线）。
 */
export async function openGlmStream(options: {
  apiKey: string;
  model: string;
  messages: GlmMessage[];
  /** thinking 参数：默认 disabled——30s 客户端超时内必须出正文；enabled 时 max_tokens 需覆盖思考 token。 */
  thinking?: 'enabled' | 'disabled';
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<OpenedGlmStream> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let upstream: Response;
  try {
    upstream = await fetcher(GLM_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        stream: true,
        messages: options.messages,
        thinking: { type: options.thinking ?? 'disabled' },
        temperature: GLM_TEMPERATURE,
        max_tokens: GLM_MAX_TOKENS,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if ((error as Error)?.name === 'AbortError') throw new GlmError(`GLM 请求超时（${timeoutMs}ms）`);
    throw new GlmError(`GLM 请求失败：${(error as Error)?.message ?? 'unknown error'}`);
  }
  if (!upstream.ok) {
    clearTimeout(timer);
    throw new GlmError(`GLM 请求失败（${upstream.status}）`);
  }
  const body = upstream.body;
  if (!body) {
    clearTimeout(timer);
    throw new GlmError('GLM 响应缺少正文');
  }
  return {
    upstream,
    async consume(onDelta?: (fullText: string) => void): Promise<string> {
      try {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';
        const handleData = (dataText: string): void => {
          if (!dataText || dataText === '[DONE]') return;
          let payload: unknown;
          try {
            payload = JSON.parse(dataText);
          } catch {
            return;
          }
          const delta = extractDeltaContent(payload);
          if (delta) {
            full += delta;
            onDelta?.(full);
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (value) buffer += decoder.decode(value, { stream: true });
          if (done) buffer += decoder.decode();
          const parsed = splitSseDataLines(buffer, done);
          buffer = parsed.remainder;
          parsed.lines.forEach(handleData);
          if (done) break;
        }
        return full;
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw new GlmError(`GLM 请求超时（${timeoutMs}ms）`);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    close(): void {
      clearTimeout(timer);
      controller.abort();
    },
  };
}
