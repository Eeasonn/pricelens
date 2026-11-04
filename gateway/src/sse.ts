/**
 * 既有 SSE 信封格式（与 pricelens/src/agent/client.ts 的 parseSseFrames 对齐）：
 * `event: <name>\ndata: <json>\n\n`，json 含 isAgentEvent 校验的 event
 * 和/或 {type:'response', response} 帧。
 */
export interface GatewayEventBody {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  status?: string;
  timestamp: string;
  message?: string;
  provenance?: Record<string, unknown>;
}

/** 帧格式：event 行 + data 行 + 空行；data 必须是单行合法 JSON。 */
export function namedSseFrame(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/** 事件体满足前端 isAgentEvent 浅校验：id/runId/sequence(整数)/type/timestamp。 */
export function buildRunEvent(
  runId: string,
  sequence: number,
  type: string,
  message: string,
  provenance?: Record<string, unknown>,
  status?: string,
): GatewayEventBody {
  return {
    id: `${runId}-${type}-${sequence}`,
    runId,
    sequence,
    type,
    ...(status ? { status } : {}),
    timestamp: new Date().toISOString(),
    message,
    ...(provenance ? { provenance } : {}),
  };
}

/** 最终结果帧：client.ts 以 isAgentResponse 校验 frame.response。 */
export function responseSsePayload(response: unknown): { type: string; response: unknown } {
  return { type: 'response', response };
}
