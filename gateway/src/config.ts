/** 环境变量解析：纯函数，全部服务端钳制在这里集中可见。 */
import type { GatewayEnv } from './types';

export const DEFAULT_GLM_MODEL = 'glm-5.3-flash';

/**
 * 模型白名单：env（GLM_MODEL）只能覆写成列表内的型号。
 * 放开新型号 = 一次显式的代码变更，而不是任何客户端/环境可注入的字符串。
 * 当前型号定为 glm-5.3-flash（2026-11-04 实测）。
 */
export const GLM_MODEL_WHITELIST: readonly string[] = [
  'glm-5.3-flash',
];

export const DEFAULT_RATE_LIMIT_MAX = 20;
export const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
export const DEFAULT_QUOTA_DAILY_MAX = 200;

export type GlmThinkingMode = 'enabled' | 'disabled';

export interface GatewayConfig {
  apiKey?: string;
  model: string;
  /** thinking 参数：默认 disabled——glm-5.3-flash 是思考模型，30s 客户端超时内必须出正文。 */
  thinking: GlmThinkingMode;
  /** null = 未配置 ALLOWED_ORIGINS → fail-closed 拒绝所有跨域（health 除外）。 */
  allowedOrigins: string[] | null;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  quotaDailyMax: number;
}

/** 统一来源字符串口径：去空白、去尾斜杠、小写。 */
export function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * 白名单条目口径：浏览器 Origin 头永远不含路径，Pages 子路径站点
 * （如 https://eeasonn.github.io/pricelens）的实际 Origin 是 https://eeasonn.github.io，
 * 所以配置条目统一解析到 scheme+host+port（解析失败保留原样）。
 */
export function normalizeOriginEntry(raw: string): string {
  const trimmed = normalizeOrigin(raw);
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

/** 解析逗号分隔白名单；空白/未配置返回 null（= fail-closed）。 */
export function parseAllowedOrigins(raw: string | undefined): string[] | null {
  const entries = (raw ?? '')
    .split(',')
    .map(normalizeOriginEntry)
    .filter((entry) => entry.length > 0);
  return entries.length ? Array.from(new Set(entries)) : null;
}

export function isWhitelistedModel(model: string): boolean {
  return GLM_MODEL_WHITELIST.includes(model);
}

/** GLM_MODEL 白名单覆写：不在名单内的值一律回落默认模型。 */
export function resolveModel(raw: string | undefined): string {
  const configured = (raw ?? '').trim();
  return isWhitelistedModel(configured) ? configured : DEFAULT_GLM_MODEL;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').trim());
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** 配额专用：显式 0 = 不限量，其余非法值回落默认。 */
function parseQuotaMax(raw: string | undefined, fallback: number): number {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fallback;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/** GLM_THINKING 覆写：只接受 enabled / disabled，默认 disabled。 */
export function parseGlmThinking(raw: string | undefined): GlmThinkingMode {
  return raw?.trim().toLowerCase() === 'enabled' ? 'enabled' : 'disabled';
}

export function parseGatewayConfig(env: GatewayEnv): GatewayConfig {
  return {
    apiKey: env.GLM_API_KEY?.trim() || undefined,
    model: resolveModel(env.GLM_MODEL),
    thinking: parseGlmThinking(env.GLM_THINKING),
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    rateLimitMax: parsePositiveInt(env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
    rateLimitWindowMs:
      parsePositiveInt(env.RATE_LIMIT_WINDOW_SECONDS, DEFAULT_RATE_LIMIT_WINDOW_SECONDS) * 1000,
    quotaDailyMax: parseQuotaMax(env.QUOTA_DAILY_MAX, DEFAULT_QUOTA_DAILY_MAX),
  };
}
