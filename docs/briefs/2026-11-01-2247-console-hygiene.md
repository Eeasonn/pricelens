# 任务书 2026-11-01 22:47：PriceLens 控制台卫生 + 无障碍小修（新功能分支）

背景：feature/quality-pill-2026-11-01 QA 报告「仍未修」第 6 条点名存量控制台警告（border/borderLeft 混用；antd RangePicker dropdownClassName 弃用 ×3）。本任务与极差 6 版方案无关——**不要实现** docs/design/2026-11-01-volume-spread-options.html 任一方案（等用户挑选）。

## 目标
1. 从当前可编译基线新建分支 `feature/console-hygiene-2026-11-01`（推荐独立 worktree，勿污染 ~/lpl-quality-pill 与主工作区其他 WIP）。
2. 消除上述控制台弃用/混用警告（改用 antd 现行 API；梳理面板根样式 border 写法）。
3. 顺手核对 prefers-reduced-motion 与焦点环在量价/配置相关新控件上是否仍在；缺则小补，不做大改版。
4. 定向测试 → typecheck → 全量测试；docs/night-log.md（若无则创建于 docs/）追加进度；本地 commit。
5. **git add 只加本任务改动的文件**；绝不 stage 其他会话 WIP；不 push、不部署、不合并。
6. 不碰 anomaly/显隐功能行为；不改 volume-spread 设计稿。

## 硬规则（必须遵守）
- 新功能分支；只 git add 本任务文件；不碰其他会话 WIP；编码工具仅 ZCode/Cursor/Kimi Code。
- 多轮；本地 commit；night-log Asia/Shanghai 时间戳。
- 模型 GLM-5.3；识图 GLM-5.3-Flash。
- 不发布/登录/push/部署；不读凭证；缺 key 跳过记 env；无付费 API；不造数据；结束杀自启进程。
- 小红书若触及仅匿名读；禁用 cookie/签名工具。
- Capture 只写 /Users/eason/Documents/Eason-x-echo/Capture/（不写 wiki/）。
- 自包含执行。
