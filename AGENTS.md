# PriceLens Agent instructions

When a task changes a user-facing page, component, chart, layout, style, token, AgentShell, alert, or interaction, read these files before editing:

1. [`PRODUCT.md`](./PRODUCT.md) for product context, data boundaries, evidence rules, and Agent behavior.
2. [`pricelens/DESIGN.md`](./pricelens/DESIGN.md) for the formal visual system and component rules.
3. [`docs/PRICE-LENS-DESIGN-HANDOFF.md`](./docs/PRICE-LENS-DESIGN-HANDOFF.md) for the execution sequence and completion criteria.

Treat `pricelens/src/theme/tokens.ts` as the runtime token source of truth. Reuse existing shell and component patterns before adding new primitives. For a new route or complex surface, create a matching local decision file under `pricelens/.impeccable/surfaces/` before implementation.

Before handing off a UI change, run from the repository root:

```bash
npm --prefix pricelens run design:check
npm --prefix pricelens run design:lint
npm --prefix pricelens run typecheck
```

Run `npm --prefix pricelens run check` when the change affects application behavior, tests, or the generated offline build. A task is complete only when the applicable checks pass and the handoff checklist is satisfied.

## Git 工位与分支契约（2026-11-09）

**任务落位决策表**——开工位前先过此表，默认不开工位：

| 任务类型 | 干活位置 | 工位 | 分支 |
|---|---|---|---|
| 改代码且与其他活并行 | `~/lpl-wt/<任务名>-<日期>` | ✅ 须 Eason 在派活指令指定 | ✅ 须 Eason 指定 |
| 改代码，串行单线 | 主工作区 | ❌ | ✅ 开分支 |
| 文档/简报/纪要（`docs/` 已 ignore） | 主工作区 docs/ 或仓库外 | ❌ | ❌ |
| 视频/素材（`pricelens-video/` 已 ignore） | 主工作区或仓库外 | ❌ | ❌ |
| 出稿/高保真/HTML demo（design-proposals 等未跟踪区） | 专属文件夹 | ❌ | ❌ |
| 探索要动代码原型 | 按代码任务处理 | 看是否并行 | ✅ |

**纪律**：

- **工位路径与分支名由 Eason 在派活指令中指定**；Agent 不得自行 `git worktree add`、不得自创分支名、不得移动/删除既有工位。
- Agent 红线：① 禁止 `git push`（推 main 由 Eason 拍板后执行）② 禁止大资产入库（视频素材/构建产物/备份目录/截图集）③ 只在本工位内操作，不跨工位、不动主工作区。
- 收工状态行必须含：工位路径 / 分支名 / 领先 origin/main 提交数 / `npm --prefix pricelens run check` 结果 / `git status --short` 全量。
- 任务合入 main 后由 Eason 拍板收口三件套：`git worktree remove` + `git branch -d` + 台账销账。
- 长驻例外（不受收口约束，周审计白名单）：`~/lpl-wt/reports`（reports 日报）、`~/lpl-wt/promo-marketboard-20261103`（大促产业联动锁定待用）、`~/lpl-wt/gsap-motion-20261105`（本地 GSAP 动效实验，未推远程）、`~/lpl-wt/t428u-design-docs-20261107`（t428u 设计文档留档）。
