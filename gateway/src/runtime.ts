/** isolate 级共享状态工厂：限流器 + 日配额桶 + 解析后的网关配置。 */
import { parseGatewayConfig, type GatewayConfig } from './config';
import { createDailyQuota, type DailyQuota } from './quota';
import { SlidingWindowRateLimiter } from './rateLimit';
import type { GatewayEnv } from './types';

export interface GatewayState {
  config: GatewayConfig;
  limiter: SlidingWindowRateLimiter;
  quota: DailyQuota;
}

export function createGatewayState(env: GatewayEnv): GatewayState {
  const config = parseGatewayConfig(env);
  return {
    config,
    limiter: new SlidingWindowRateLimiter(config.rateLimitMax, config.rateLimitWindowMs),
    quota: createDailyQuota(env.QUOTA_KV ?? null, config.quotaDailyMax),
  };
}
