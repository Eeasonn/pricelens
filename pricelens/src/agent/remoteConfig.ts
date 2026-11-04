/**
 * 远端 Agent 地址的运行时配置。
 *
 * 纯静态托管（GitHub Pages）没有同源代理，构建时写死的 `/api/agent` 必然 404；
 * 允许使用者用 localStorage 键自行指定远端服务地址，未指定或不可达时由
 * `withLocalFallback` 回退本地确定性引擎（见 client.ts）。
 * 数据边界：浏览器侧只保存服务地址，绝不保存 API key。
 */

/** localStorage 键：显式自配的远端 Agent 服务地址（绝对 URL，如 http://127.0.0.1:8787）。 */
export const AGENT_REMOTE_BASE_URL_KEY = 'pricelens.agent.remoteBaseUrl';

export type AgentEngineSource = 'local-storage' | 'env' | 'none';

export interface AgentEngineConfig {
  /** 参与选择的远端地址；undefined 表示本次会话纯本地引擎。 */
  baseUrl?: string;
  source: AgentEngineSource;
}

function readStoredBaseUrl(): string {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(AGENT_REMOTE_BASE_URL_KEY);
    return (raw ?? '').trim();
  } catch {
    // 隐私模式 / 受限环境读不到 localStorage，视为未自配。
    return '';
  }
}

/** 解析远端地址：localStorage 显式自配优先于构建时 env，两侧都为空则纯本地。 */
export function resolveAgentEngine(env?: Record<string, string | undefined>): AgentEngineConfig {
  const stored = readStoredBaseUrl();
  if (stored) return { baseUrl: stored, source: 'local-storage' };
  const fromEnv = (env ?? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env)?.VITE_AGENT_API_BASE_URL?.trim();
  if (fromEnv) return { baseUrl: fromEnv, source: 'env' };
  return { source: 'none' };
}

export interface AgentEngineLabel {
  engine: 'local' | 'remote-with-fallback';
  /** 面板小字展示的引擎来源。 */
  label: string;
  /** title 提示：解释回退语义与自配方式。 */
  hint: string;
}

/**
 * Agent 面板小字标注：区分「平台预设网关」（构建时 env 注入，key 只存服务端）
 * 与「自配」（localStorage 显式指定地址）两种远端引擎来源。
 */
export function describeAgentEngine(config: AgentEngineConfig): AgentEngineLabel {
  if (!config.baseUrl) return { engine: 'local', label: '本地确定性引擎 · 离线可用', hint: '未配置远端 Agent 服务；所有数值与结论均由本地确定性引擎计算。' };
  if (config.source === 'env') {
    return {
      engine: 'remote-with-fallback',
      label: '平台预设网关 · GLM 叙述 · 本地兜底',
      hint: `已接入平台预设 GLM 网关（${config.baseUrl}）；API key 只存网关服务端，浏览器与构建产物不含密钥。GLM 不可达时自动回退本地确定性引擎。`,
    };
  }
  return {
    engine: 'remote-with-fallback',
    label: '远端 Agent 叙述 · 本地引擎兜底',
    hint: `自配远端服务 ${config.baseUrl}；不可达时自动回退本地确定性引擎。将 localStorage 键 ${AGENT_REMOTE_BASE_URL_KEY} 设为服务地址即可自行接入。`,
  };
}
