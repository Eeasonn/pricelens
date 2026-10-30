# PriceLens Copilot 开发版

这个分支在现有看板旁增加了一个全局 Copilot 面板，默认是右侧 dock，也可以切换全屏。它采用“显式计划 + 白名单工具 + 结构化结果卡”的 Agent 编排方式：

- `catalog.resolve` 解析当前页面和产品口径；
- `series.query` 调用现有 `buildSeries`；
- `series.compare` 使用现有确定性聚合与平台最低价引擎；
- `alerts.query` / `alerts.explain` 读取现有预警结果；
- `view.preview` 只生成 `FilterPatch`，点击“应用到看板”前不会写入筛选状态。

## 已实现的交互

- 页头“问 PriceLens”全局入口，`Cmd/Ctrl + K` 快捷键；
- 图表工具行“问此图”入口；
- 预警行“解释”入口；
- 上下文 chips、运行步骤摘要、图表/表格/预警解释卡；
- 筛选预览、显式应用、精确撤销；
- 输入框 Enter 发送、Shift+Enter 换行、停止运行；
- 浏览器语音输入；语音代理地址可通过 `VITE_ARK_VOICE_PROXY` 接入单独部署的 ASR 服务；
- 旧版页面仍由原分支提供，新版开发文件位于独立 worktree。

## 方舟语音代理边界

前端只发送 `{ language: "zh-CN" }` 到同源 `/api/agent/voice`，期望返回：

```json
{ "transcript": "查看最近八周价格", "confidence": 0.96 }
```

本分支自带的 `agent-server.mjs` 负责文本 Agent，不包含 ASR WebSocket 代理；需要方舟 ASR 时应部署独立代理并从服务端环境变量读取凭证。不要把 API Key 写进 `VITE_*` 变量或浏览器代码。

## 接入真实 Agent 服务

`server/agent-server.mjs` 已实现同源 `POST /api/agent/runs`：服务端从 `ARK_API_KEY` 读取凭证，调用方舟 Agent Plan Responses 接口，模型只改写结论和建议；数字卡片仍由本地确定性引擎生成。上游不可用时返回基线结果，前端继续可用。

生产构建已默认指向 `/api/agent`，页面需要从代理提供的 HTTP 地址打开；双击 `file://` 单文件时会自动回退到本地 adapter。

## 验证命令

```bash
npm run typecheck
npm run verify
npm test -- --run
npm run build
```
