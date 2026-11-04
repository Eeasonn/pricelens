/**
 * Worker 绑定与环境变量的类型声明。
 * 数据边界：GLM_API_KEY 只能以 env/secret 名出现，绝不写字面量 key。
 */
export interface GatewayEnv {
  /** BigModel GLM API key：只存 Worker secret（wrangler secret put GLM_API_KEY）。 */
  readonly GLM_API_KEY?: string;
  /** 模型覆写：必须在 src/config.ts 白名单内，否则回落默认模型（glm-5.3-flash）。 */
  readonly GLM_MODEL?: string;
  /** thinking 参数覆写：'enabled' | 'disabled'（默认 disabled，保证 30s 客户端超时内出正文）。 */
  readonly GLM_THINKING?: string;
  /** 逗号分隔的跨域白名单；未配置 = 拒绝所有跨域请求（fail-closed），health 除外。 */
  readonly ALLOWED_ORIGINS?: string;
  /** 每 isolate、每 IP 滑动窗内最大请求数（默认 20）。 */
  readonly RATE_LIMIT_MAX?: string;
  /** 滑动窗宽度（秒，默认 60）。 */
  readonly RATE_LIMIT_WINDOW_SECONDS?: string;
  /** 每日 GLM 调用配额；0 = 不限量（默认 200）。 */
  readonly QUOTA_DAILY_MAX?: string;
  /** 可选 KV 绑定：存在时日配额持久计数；未绑定降级 isolate 内存计数。 */
  readonly QUOTA_KV?: KVNamespace;
}
