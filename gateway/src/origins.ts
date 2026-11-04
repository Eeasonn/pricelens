/** Origin/Referer 锁：纯函数，fail-closed。 */
import { normalizeOriginEntry } from './config';

/**
 * 从请求头解析请求来源：优先 Origin；Origin 缺失或为字面量 "null"
 * （file:// 等）时退回 Referer 的 origin；两者都拿不到返回 null。
 * 与白名单条目同口径归一到 scheme+host+port：标准浏览器 Origin 本就
 * 不含路径，这里额外容忍非标准客户端（带路径的 Origin 头）也能匹配。
 */
export function resolveRequestOrigin(headers: Headers): string | null {
  const origin = headers.get('origin');
  if (origin && origin !== 'null') return normalizeOriginEntry(origin);
  const referer = headers.get('referer');
  if (referer) {
    try {
      return normalizeOriginEntry(new URL(referer).origin);
    } catch {
      return null;
    }
  }
  return null;
}

export type OriginRejectReason = 'unconfigured' | 'missing-origin' | 'not-allowlisted';

export type OriginDecision =
  | { allowed: true; origin: string; reason: 'allowed' }
  | { allowed: false; origin: string | null; reason: OriginRejectReason };

/**
 * fail-closed：白名单未配置、来源头缺失、或不在白名单一律拒绝。
 * health 等豁免路由由调用方自行绕过本检查。
 */
export function checkOrigin(origin: string | null, allowlist: readonly string[] | null): OriginDecision {
  if (!allowlist || allowlist.length === 0) return { allowed: false, origin, reason: 'unconfigured' };
  if (!origin) return { allowed: false, origin, reason: 'missing-origin' };
  if (allowlist.includes(origin)) return { allowed: true, origin, reason: 'allowed' };
  return { allowed: false, origin, reason: 'not-allowlisted' };
}

export const ORIGIN_REJECT_REASON_LABEL: Record<OriginRejectReason, string> = {
  unconfigured: '服务端未配置 ALLOWED_ORIGINS',
  'missing-origin': '请求缺少 Origin/Referer 头',
  'not-allowlisted': '来源不在白名单内',
};
