# PriceLens GLM Gateway

为 GitHub Pages 静态站提供安全的预设模型接入的 Cloudflare Worker。

```
GitHub Pages（pricelens 静态站）
  └─ POST {网关}/runs（SSE）          浏览器只持有网关地址，绝不持有 key
        └─ Cloudflare Worker（本目录）
              ├─ Origin 锁 / 限流 / 日配额 / 参数钳制
              └─ BigModel https://open.bigmodel.cn/api/paas/v4/chat/completions
                    └─ Bearer GLM_API_KEY（只存 Worker secret）
```

数据边界（红线）：**GLM API key 只存 Worker secret，绝不进前端 bundle、绝不进 git、绝不写进任何文件字面量。** 密钥只能以 `env.GLM_API_KEY` / secret 名引用。

## 本地开发与测试

```bash
cd gateway
npm install
npx tsc --noEmit      # 严格类型检查
npx vitest run        # 80 个单测，零网络（上游 fetch 全 mock）
cp .dev.vars.example .dev.vars   # 然后编辑 .dev.vars 填入本地 key（已被 .gitignore 忽略）
npx wrangler dev      # 本地起网关，默认 http://127.0.0.1:8787
```

架构分层：`src/config.ts` / `origins.ts` / `rateLimit.ts` / `quota.ts` / `prompt.ts` / `validate.ts` / `merge.ts` / `sse.ts` / `glm.ts` 全部是纯函数；运行时入口只有 `index.ts`（持有 isolate 级状态）和 `handlers.ts`（编排）。

## 部署 runbook（Eason 手动执行）

### 0. 前置条件

- 一台能访问 `dash.cloudflare.com` 与 `open.bigmodel.cn` 的电脑。
- BigModel（智谱开放平台）账号，且已生成一个 API key。
- 已安装 Node 22+ 与 npm。

### 1. 创建 Cloudflare 账号并登录

1. 注册/登录 <https://dash.cloudflare.com>（免费计划即可）。
2. 本机登录 wrangler（浏览器会弹出授权页）：

```bash
cd gateway
npx wrangler login
npx wrangler whoami   # 确认已登录
```

### 2.（可选）创建 KV 用于日配额持久化

不绑 KV 也能跑：日配额降级为 isolate 内存计数（`/api/agent/health` 的 `rateLimitPrecision` 会如实标注 `memory-per-isolate`）。

```bash
npx wrangler kv namespace create QUOTA_KV
```

把命令输出的 `id` 填进 `wrangler.toml`，并取消 `[[kv_namespaces]]` 三行注释。

### 3. 写入 GLM API key（关键安全步骤）

```bash
npx wrangler secret put GLM_API_KEY
# 按提示在终端粘贴 key 后回车
```

强调三条红线：**key 不要贴进任何聊天窗口；不要写进任何文件（包括 `.dev.vars` 之外的一切）；不要 commit。** `.dev.vars` 只给本地 `wrangler dev` 用且已被 git 忽略；生产 key 只存在于 Cloudflare secret 存储。

### 4. 配置 ALLOWED_ORIGINS（跨域白名单）

非敏感配置，两种方式任选：

- 改 `wrangler.toml` 的 `[vars]`，取消注释 `ALLOWED_ORIGINS` 一行并改成你的实际域名；或
- dashboard → Workers & Pages → `pricelens-glm-gateway` → Settings → Variables and Secrets → 添加文本变量 `ALLOWED_ORIGINS`。

值 = 你的 GitHub Pages 域名 + 本地开发端口，逗号分隔，例如：

```
https://eeasonn.github.io/pricelens,http://localhost:5173,http://localhost:5177
```

白名单条目会自动归一到 `scheme+host+port`（写 Pages 子路径也可以）。**不配置 = 拒绝所有跨域请求（fail-closed）**，仅 `/api/agent/health` 例外。

### 5. 部署

```bash
npx wrangler deploy
```

记下输出的 `https://pricelens-glm-gateway.<你的子域>.workers.dev`。

### 6. 绑定自定义域名（大陆受众必须）

`*.workers.dev` 在大陆被墙，必须绑自定义域：

1. 在 Cloudflare 添加一个域名（免费计划即可，NS 迁到 Cloudflare）。
2. dashboard → Workers & Pages → `pricelens-glm-gateway` → Settings → Domains & Routes → Add → Custom Domain，例如 `gateway.你的域名.com`。
3. 等证书签发完成（通常几分钟）。以后所有配置都用这个自定义域地址。

### 7. Pages 侧配置 AGENT_GATEWAY_URL

1. GitHub 仓库 → Settings → Secrets and variables → Actions → **Variables** 标签 → New repository variable：
   - Name：`AGENT_GATEWAY_URL`
   - Value：`https://gateway.你的域名.com`（步骤 6 的自定义域；不要带尾部斜杠）
2. 重新触发部署：Actions → Deploy to GitHub Pages → Run workflow（或 push 一次 main）。
3. CI 会在构建时把该值注入 `VITE_AGENT_API_BASE_URL`；未配置时为空串 = 维持本地引擎，向后兼容。

### 8. 验收步骤

```bash
# ① health：无鉴权、轻量、不调上游模型
curl https://gateway.你的域名.com/api/agent/health
# 期望：{"ok":true,"model":"glm-5.3-flash","provider":"GLM Gateway","rateLimitPrecision":"...","originsConfigured":true}

# ② fail-closed：无 Origin/Referer 的请求必须被拒
curl -X POST https://gateway.你的域名.com/runs -d '{}' -H 'content-type: application/json' -i
# 期望：HTTP 403，且响应不含 access-control-allow-origin

# ③ 白名单来源放行（带上 Pages 域名 Origin）
curl -X POST https://gateway.你的域名.com/runs \
  -H 'content-type: application/json' -H 'accept: text/event-stream' \
  -H 'origin: https://eeasonn.github.io' \
  -d '{"text":"测试","clientRequestId":"smoke-1","baseline":{"intent":"clarify","summary":"基线","steps":[],"cards":[],"citations":[],"suggestions":[],"contextFingerprint":"ctx-smoke"}}' -i
# 期望：HTTP 200，text/event-stream，帧里出现 run.status / step.updated / response / run.completed
```

浏览器侧：

1. 打开 Pages 站点，页头「问 PriceLens」发起提问；
2. Agent 面板小字应显示「平台预设网关 · GLM 叙述 · 本地兜底」字样（不再是自配提示）；
3. 停掉网关（或改错 AGENT_GATEWAY_URL）再提问：结果由本地确定性引擎兜底且 provider 标注「本地确定性回退」——回退链路成立。

### 9. BigModel 控制台消费上限与告警

网关侧的限流/配额只是护栏，**真正的硬上限要在 BigModel 控制台设置**：

1. 登录 <https://open.bigmodel.cn> → 财务/费用中心；
2. 设置并发与消费上限（建议先设一个小的日消费上限，如 ¥5/天）；
3. 开启余额/消费告警（余额低于阈值时通知）；
4. 记录 key 的用量页，部署后头几天每日巡检。

### 10. Cloudflare WAF 免费限流规则（真正的硬限流）

Worker 内置限流是 per-isolate 内存滑动窗（见「已知限制」），硬限流请配置 WAF 免费规则：

1. dashboard → 你的域名 → Security → WAF → Rate limiting rules；
2. Create rule（免费计划含 1 条）：
   - 匹配：`http.request.uri.path eq "/runs"`；
   - 特征：IP address；
   - 阈值：例如 30 requests / 1 minute（高于网关默认的 20/min，作为外层兜底）；
   - 动作：Block，时长 1 分钟；
3. 保存后用连续快速 curl 验证会命中 429。

### 11. key 轮换

1. BigModel 控制台生成新 key（旧 key 先保留）；
2. `npx wrangler secret put GLM_API_KEY` → 粘贴新 key（覆盖式更新，即时生效）；
3. `curl .../api/agent/health` 确认 `"ok":true`，浏览器端跑一次提问；
4. BigModel 控制台吊销旧 key；
5. 轮换期间不需要改任何代码/文件——key 从头到尾只在 secret 存储里。

## 请求处理流程（POST /runs）

```
OPTIONS 预检 / 路由分发（index.ts → handlers.ts）
  1. Origin/Referer 锁：白名单未配置或来源不匹配 → 403（无 CORS 头，fail-closed）
  2. 每 IP 速率限制：isolate 内存滑动窗（默认 20 次/60s）→ 429 + retry-after
  3. 日配额：KV 绑定时持久计数，未绑定降级内存计数 → 429
  4. 请求 shape 校验：复用 agent-server.mjs 口径 + 必须携带合法 baseline → 400/413
  5. 打开 GLM 流（Bearer secret key、模型白名单、thinking=disabled、
     max_tokens=1024、服务端固定系统提示词，客户端无法覆盖任何参数）
     失败/超时（20s）→ 502 + {fallback: baseline}，前端自然落本地兜底
  6. SSE 回发：run.started → step.updated 叙述帧（增量，≤40 帧）→
     response 帧（GLM 叙述合并进 baseline，provider=GLM Gateway）→ run.completed
     流中断裂 → run.failed + 基线 response 帧（provider 如实标注「回退基线」）
```

模型口径（2026-11-04 实测）：`glm-5.3-flash` 是思考模型，`choices[].delta.reasoning_content` 是模型内部推理，**绝不进回执帧**——叙述与合并只取 `delta.content`。`thinking` 默认 `disabled`（30s 客户端超时内必须出正文），可用 env `GLM_THINKING=enabled` 覆盖；enabled 时思考 token 也计入 completion_tokens，故 `max_tokens` 钳制为 1024。

## 安全四件套与已知限制

| 机制 | 实现 | 已知限制 |
| --- | --- | --- |
| Origin/Referer 锁 | `ALLOWED_ORIGINS` 白名单，fail-closed；health 例外 | 白名单归一到 scheme+host+port；无法防白名单页面内的 XSS |
| 每 IP 限流 | isolate 内存滑动窗（`cf-connecting-ip`） | **per-isolate 语义**：多 isolate 各自计数、isolate 回收即清零；硬限流靠 WAF 规则（见 §10） |
| 日配额 | KV 绑定时持久计数（TTL 48h 自动清理）；未绑定降级 isolate 内存计数，health 如实标注 precision | KV 最终一致（读取侧缓存约 60s），计数是近似值；KV 故障时 fail-open 放行；硬上限靠 BigModel 控制台（见 §9） |
| 参数钳制 | 模型白名单、固定系统提示词、temperature/max_tokens/thinking 全部服务端固定；无 baseline 的请求直接拒绝 | 上游行为变化（如模型输出超大 JSON）只影响叙述，不触碰 baseline 数值 |

其他说明：

- Worker 不记录上游响应体与授权信息；`npx wrangler tail` 可看网关侧错误摘要。
- `rateLimitPrecision` 取值：`kv-daily`（KV 绑定）或 `memory-per-isolate`（降级）。
- 免费计划 Worker 有每日请求额度（10 万次/天），对本产品量级足够；超限会由 Cloudflare 直接拒掉。
