# PriceLens Agent UX 2026-11-08 验收回执

## 结论

本轮代码验证、stable/iterate 构建以及真实浏览器桌面/窄屏验收通过。完整 Vitest 低并发与受控串行均通过；默认沙箱的一次运行仅因 server 监听权限阻塞，已单独记录。任务 commit 已提交并合入本地整合分支，4302 保持原 PID 热加载更新。

## 分支、基线与状态

- 任务 worktree：`/Users/eason/zcode-wt/pricelens-agent-ux-20261108`
- 任务分支：`codex/pricelens-agent-ux-20261108`
- 基线：`b07e1cc56b1e0f50dbcd729f8befa2efc7713431`
- 目标整合分支：`zcode/pricelens-integrate-t428u-20261107`，核实基线同为 `b07e1cc`
- 本轮 commit：`2d88441b2c8195698ac3714dc7979a651ca81202`（仅任务文件）
- 目标分支合并：`adfd776c7c16060bab1378c722b8558e751ef0f1`，`--no-ff`，无冲突
- 报告收口 commit：`f8f4de1e44e184550d68742fc6fe41ae20f32ae7`（仅报告/回执）
- 报告收口合并：`832995f684fee6b85156b74e04a204a5b107eb28`
- 4302：未触碰；启动时记录的现役 PID 为 `33763`，工作目录在整合 worktree

## 变更点

- Agent iterate/stable 的 action target 增加完整 `filterPatch` scope envelope，结果带 `scopeLabel`，结果卡、回看与追问展示同一口径。
- iterate 多轮追问通过 `rerunWithPatch` 继承上一结果 scope；用户明确新国家、平台、主品/多产品或范围时覆盖旧 scope，并以 origin fingerprint 区分有意写回与 stale。
- stable 追问把当前 scope 传入执行上下文，保留 stable 现有平台比较和最近有价周算法，不扩大本轮修复范围。
- AgentPanel / CopilotStable 面板补充结果口径显示、禁用态与建议交互边界；运行中不重复触发建议。
- 修复 ReferenceEventComposer 重复色板值造成的 React key 警告，按色板位置生成稳定 key；不改变业务语义。
- 新增 `src/agent/__tests__/agentux-scope-inheritance.test.ts`，覆盖跨国追问、图表/表格一致 scope、多轮继承与显式覆盖、stable scope。
- 将已有 Agent 预警端到端测试的单测超时设为 30s；该用例在默认 5s 下因完整交互耗时被误判超时，单测本身与全量低并发均通过。
- 根目录 `PriceLens.html` 由 stable 构建同步生成，保持与 `pricelens/dist/index.html` 一致。

## Ant Design 规范对照

本轮未在线核实 Ant Design 文档，以下按公开规范的已知约定记录；未引入整套 antd，继续使用现有 `DESIGN.md` 与 `theme/tokens.ts`。

| 规范 | 采纳情况 | 实现/理由 | 来源 |
|---|---|---|---|
| Button 主次层级、危险/禁用态 | 采纳 | 保留主操作与次操作层级；运行中禁用重复发送与建议按钮 | https://ant.design/components/button-cn |
| Form/输入的 Enter 与 Shift+Enter | 采纳 | Enter 提交、Shift+Enter 换行；焦点态沿用项目 token | https://ant.design/components/input-cn |
| Drawer/Modal 响应式与键盘关闭 | 采纳 | 窄屏转 drawer/full 模式，Escape、焦点回收与 `aria-modal` 保持 | https://ant.design/components/drawer-cn |
| Alert/Message 的结果与错误反馈 | 部分采纳 | 结果口径、无价、错误与重试使用现有消息/卡片语言，避免假进度与假推理 | https://ant.design/components/alert-cn / https://ant.design/components/message-cn |
| Empty 空态 | 采纳 | 空结果使用结论→事实→规则→判断边界→动作的渐进呈现 | https://ant.design/components/empty-cn |
| Spin/Loading | 采纳 | 使用既有 loading/disabled 状态；不新增假流式进度 | https://ant.design/components/spin-cn |
| Card 结果层级 | 采纳 | 结果卡保留来源、scopeLabel、边界和可操作动作 | https://ant.design/components/card-cn |
| 全量 antd 组件库 | 未采纳 | 设计约束要求不换主题、不引入整套依赖；复用已有 shell/components/tokens | https://ant.design/docs/spec/introduce |

## 测试真实结果

| 检查 | 结果 | 证据 |
|---|---|---|
| 定向 scope/回归 | 通过：6 files，62 passed，2 skipped | `pricelens/.codex-run/focused-final.log` |
| `typecheck` | 通过，`tsc --noEmit` exit 0 | `pricelens/.codex-run/typecheck-final.log` |
| `design:check` | 通过 | `pricelens/.codex-run/design-check-final.log` |
| `design:lint` | 通过：0 errors，0 warnings，1 info | `pricelens/.codex-run/design-lint-final.log` |
| `git diff --check` | 通过 | 本轮命令 exit 0 |
| `verify` | 通过：47 项通过，0 项失败 | `pricelens/.codex-run/verify-after-build.log` |
| full Vitest（默认沙箱） | 部分阻塞：188 files 中 187 passed、1 failed；1901 passed、5 skipped；唯一失败是 server 监听 `127.0.0.1` 的 EPERM | `pricelens/.codex-run/full-tests-final.log` |
| server 单测（授权权限） | 通过：1 file，2 passed | 授权运行结果；失败原因是沙箱监听权限，不是断言 |
| 并行超时套件隔离复跑 | 通过：R4UnifiedScope 16/16、R8 scope handoff 14/14、volumeLayer 20/20、Batch4 19/19 | agent 隔离运行结果 |
| 高并发授权 full Vitest | 未完成：因默认 5 秒 UI 测试超时与资源争用，主动 Ctrl-C；未计为 PASS | 终止结果 exit 1 |
| 低并发 full Vitest | 通过：188 files，1903 passed，3 skipped（1906 total），exit 0，612.75s；server 2/2 通过 | `pricelens/.codex-run/full-tests-final-low-concurrency.log` |
| 受控串行授权 full Vitest | 通过：188 files，1903 passed，3 skipped（1906 total），exit 0，908.45s；server 2/2 通过 | `pricelens/.codex-run/full-tests-serial-20261108.log`，命令含 `--no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=30000 --hookTimeout=30000` |

## 构建与源码指纹

- iterate：Vite `5.4.21`，3801 modules，`6,378.84 kB`（gzip `2,933.08 kB`），最终构建 `pricelens/.codex-run/build-iterate-final-ui.log`，dist/index.html SHA-256 `94567de24570198a514c54a9ee2d27012fc889b07646b4bfd4bf42d5a3f924ae`，6,495,688 bytes。
- stable：Vite `5.4.21`，3801 modules，`6,288.45 kB`（gzip `2,897.13 kB`），`PriceLens.html` 与 stable `dist/index.html` SHA-256 `698c190e3a20cb39ceb0dea408d8ffed359d78ca94263082b434c0df7018e7c2`，6,402,085 bytes。
- iterate：最后一次独立预览构建使用 `build:iterate`，之后已重新构建 stable；verify 再次确认根目录单文件与 dist 逐字节一致。

## UI 验收

- 预览目标：`http://127.0.0.1:4310/?c=RU&i=phone&g=week&cur=usd&main=own-huawei-pura-80__12%2B256GB%2Cown-huawei-nova-14__12%2B256GB&plat=DNS&pt=d&agg=avg&p=forecast`。
- 通过原生 Chrome 加载目标 URL，并以 AX 树和实际截图验收：桌面显示国家/平台/DNS、USD、周范围、两产品走势/明细表；Agent 显示当前页、2 个产品、2026W19–2026W42、USD、仅折后价、来源与 Enter/Shift+Enter 操作说明。
- 通过真实窗口缩放到 `430 × 900` CSS 像素的窄屏验收：Agent drawer、范围芯片、澄清卡、工具卡、输入区和底部来源均可见，长产品标识换行，无横向溢出；没有用 HTML 解析替代 UI。
- 截图：`.codex-run/shots/desktop-iterate.png`（3024×1964，SHA-256 `417c7b400df9f7b7f26444c9406904e3c253ac01586bc8d6216f23a9d1454c10`）；`.codex-run/shots/narrow-iterate.png`（3024×1964 屏幕截图，窗口内容 430×900，SHA-256 `ee14770c53684dd008f40ee94d5a0e3ae9f226194bb8a9d39a5828e565adcde3`）。
- 4310 预览由本任务 worktree 启动并在截图后关闭；现役 4302 PID `33763` 未停止或替换。

## 旧产物、回滚与未完成项

- 旧产物保存在 `.codex-run/backup-before-merge/PriceLens.html.before`、`dist-index.html.before`，对应 SHA-256 与状态记录在同目录。
- 整合分支旧 PriceLens/dist 指纹：`5d9be3ea397eb7c7cf849e140d9f4bbad3bd14ce86ffe370a8de3d763e6cbb72`，6,400,937 bytes（审计记录）。
- 若未来已合入后需回滚，使用目标 worktree 中的 `git revert -m 1 <merge-commit>`；不要 reset/stash。若切换失败，恢复 backup 中的旧单文件并按原 4302 启动命令重启，仅操作本任务启动的进程。
- 4302 更新证据：PID `33763`、cwd `/Users/eason/zcode-wt/pricelens-integrate-t428u-20261107/pricelens` 保持不变；`curl -I http://127.0.0.1:4302/` 返回 `HTTP/1.1 200 OK`。从 `/src/agent/core.ts` 与 `/src/components/Copilot/AgentPanel.tsx` 读取到 `filterPatch`（5 次）与 `scopeLabel`（3 次），说明现役 Vite 已热加载合并源码；未停止/替换进程。
- 回滚：在目标 worktree 执行 `git revert -m 1 adfd776c7c16060bab1378c722b8558e751ef0f1`；如需恢复构建单文件，使用 `.codex-run/backup-before-merge/PriceLens.html.before` 与 `dist-index.html.before` 对照后再启动新进程，不能 reset/stash。
- 未完成项：Ant Design 文档本轮未在线核实；stable 平台比较与最近有价周算法按任务边界保留未改。其余验收项已完成。

## 候选启动命令

```bash
cd /Users/eason/zcode-wt/pricelens-agent-ux-20261108/pricelens
VITE_APP_CHANNEL=iterate npm run build:iterate
npm run preview -- --host 127.0.0.1 --port 4310 --strictPort
```
