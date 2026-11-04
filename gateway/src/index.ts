/** Worker 运行时入口：路由决策都在 handlers.ts，这里只持有一份 isolate 级状态。 */
import { handleGatewayRequest } from './handlers';
import { createGatewayState, type GatewayState } from './runtime';
import type { GatewayEnv } from './types';

/**
 * isolate 级共享状态：限流与（未绑定 KV 时的）日配额计数都存活于单个 isolate
 * 的内存里，isolate 回收即重置。语义与限制见 README「已知限制」。
 */
let sharedState: GatewayState | undefined;

export default {
  fetch(request: Request, env: GatewayEnv): Promise<Response> {
    sharedState ??= createGatewayState(env);
    return handleGatewayRequest(request, sharedState);
  },
} satisfies ExportedHandler<GatewayEnv>;
