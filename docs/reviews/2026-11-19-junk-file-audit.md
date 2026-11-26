# PriceLens 项目垃圾文件审查与清理（2026-11-19）

> 审查范围 = 仓库根 `/Users/eason/Documents/Eason's Projects/Price Intelligence` 全目录
> （含未跟踪区；`.git` 内部只统计不深查）。方法：顶层体积普查 → 垃圾模式扫描
> （.DS_Store/__pycache__/*.log/*.swp/缓存目录）→ 可疑目录逐个开箱核实 →
> git tracked 状态核对 → 分类处置。**已清项全部经过内容核实，tracked 删除走显式
> 提交 `ee62ca6`（git 历史可回溯）**。

## 一、已清理（无争议垃圾，约 54MB + 零散）

| 项 | 体积 | 内容核实 | 处置 |
|---|---|---|---|
| `.codex-run/` | 20M | 11-08 codex 4302 任务残留：rollout-response.html / changes.patch / pid / receipt-followup | **tracked，随 `ee62ca6` 删除入库** |
| `backup/大盘分析-2026-11-01/` | 56K | 合并前临时备份（MarketBoard.tsx/market.ts 等，大盘代码早已在 main） | 同上 |
| 根 `PriceLens-Server/` | 26M | 部署态实测时的 bundle 解压副本（11-19 11:58）；正式位 = `docs/内部交接包/00-服务器版/` | 已删（untracked） |
| 根 `node_modules/` | 284K | 只含 `.vite`/`.vitest-cache` 两个缓存目录、**零实体包**（根 package.json 的依赖从未装在这里） | 已删（可随时重建） |
| `.oil-ui/` | 3.0M | 11-10 设计审计缓存输出（结论已收口 `docs/reviews/2026-11-10-oil-ui-design-audit.md`） | 已删 |
| `.shots/` | 3.7M | 10 月上旬 IAB 取证截图 23 张（价值已沉淀进审计报告） | 已删 |
| `归档.zip`（根） | 748K | 10-10 的旧归档 zip | 已删 |
| `.DS_Store` ×78 | 零散 | 全项目（含 node_modules 内）；最大簇在 .consolidation-backup（56 个） | 已删 |
| `__pycache__` ×4 | 零散 | pricelens/server、pricelens/scripts、pricelens-video ×2 | 已删 |

清理后复查：垃圾模式扫描零残留；`git status` 无意外 D；tracked 删除一笔
`ee62ca6`（pre-commit verify 53/53 过）。

## 二、待拍板（AskUserQuestion 已问未答，**全部原地保留**）

| 项 | 体积 | 说明 | 我的建议 |
|---|---|---|---|
| `.consolidation-backup-20261108/` | **1.7G** | 11-08 worktree 大合并前保险备份：main 693M + worktrees 104M + **restore-test 恢复演练 887M**（main-clone + main-mirror.git + 对账文件）。主工作区已稳定 11 天、多笔已推 main | 至少删 restore-test（验证已过、零价值）；胆大可全删 |
| `portable/PriceLens-便携版-20261114/` | 15M | 旧便携版产物（最新 20261118 版保留）；`npm run portable` 可再生 | 删旧版 |
| `title-v5.png`（根） | 6.3M | 11-19 凌晨 LibTV 视频项目封面图，不该躺项目根 | 移入 `pricelens-video/` |
| `demo/simple-demand-model/` | 56K | 11-01 简单需求模型 demo | 体积近零，留否随意 |

## 三、确认保留（有主/拍板过/在用）

| 项 | 体积 | 保留理由 |
|---|---|---|
| `pricelens-video/` | 3.3G | 视频素材，2026-11-09 大清理拍板「只留本地」 |
| `design-proposals/` | 318M | 出稿/高保真区，拍板保留 |
| `docs/` | 230M | 交付物与文档（内部交接包 154M = 今天的 zip+全表CSV+bundle，底表样例 44M，调研报告 HTML 25M） |
| `gateway/` | 59M | GLM 网关活跃项目（node_modules 59M 属正常依赖） |
| `portable/PriceLens-便携版-20261118/` | 16M | 最新便携版 |
| `pricelens/`（node_modules 463M / dist 27M） | 723M | 开发必需 |
| `.agents/skills/impeccable` + `huashu-motion`、`skills-lock.json` | 2.6M | skill 正常安装形态（AGENTS.md 引用 / lock 管理） |
| `.zcode` `.impeccable` `.superpowers` `.cursor` `.codex` `.github` 等 | <100K | 工具配置 |

## 四、提示项（不建议动，仅备案）

- **`.git` 5.2G**（size-pack 2.32GiB）：历史里有 49MB 级 design-proposals 大 blob 等。
  瘦身需 rewrite 历史 + force push（协作风险大），收益 2-3G——**不值得动**；
  若未来仓库迁移再议。
- `.consolidation-backup` 若拍板全删，项目体积 12.6G → 10.9G；再清 `.git` 瘦身
  可到 ~8.5G（不建议）。

## 五、清理前后对比

| 指标 | 前 | 后 |
|---|---|---|
| 顶层目录数 | 25 | 19 |
| 垃圾模式命中 | 78 DS_Store + 4 pycache + 7 目录/文件 | **0** |
| git 工作区 | — | 干净（untracked 均为有意保留的交付物） |
| 本地待推 | — | 累计 7 笔（b69fbea/26c6799/9318b8b/e86f924/6abd5ed/ee62ca6 + 前序）待 Eason「推送」 |
