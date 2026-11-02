# 实现任务：主导航新增「大盘走势」页签（2026-11-03 07:41 额度恢复重开）

## 背景
- 大盘三图已在本分支落地（`feature/market-board-gfk` → 本 worktree 基线 `c1b057d`，含 Eason 三轮反馈），预览入口 `pricelens/marketboard-preview.html`，组件在 `pricelens/src/pages/marketboard/`。
- surface 说明 `pricelens/.impeccable/surfaces/market-board-gfk.md` 写明**尚未接入主导航**；本班专门把它们接到图表导航「量价走势」后面。
- 凌晨 03:00 因 GLM 1310 秒死未改代码；Yixuan 于 07:41 确认已重置周限额，要求**立即闭环价格相关事项**。本班只落地页签并本地 commit；**本班不 push/不部署**（交随后全量审查测绿后再 push+部署，用户已授权全绿后上线）。
- 旧备份 `/Users/eason/lpl-market-board/backup/大盘分析-2026-11-01/` 不要用。不碰占用 5177 的既有预览/桌面端会话。

## 基线
- worktree：`/Users/eason/zcode-wt/lpl-marketboard-tab`
- 分支：`feat/marketboard-tab-20261103`（自 `feature/market-board-gfk` @ `c1b057d`）
- 复用组件（不要另起炉灶）：
  - `TierBrandShareCard.tsx`（图1 核心档位品牌份额趋势）
  - `BrandShareTrendCard.tsx`（图2 品牌份额趋势）
  - `BrandTierYoYCard.tsx`（图3 各品牌核心档位结构同比）
  - 以及同目录 `marketBoardData.ts` / `marketBoardModel.ts` / `marketBoardUI.tsx`
  - 预览组装参考 `MarketBoardPreview.tsx` / `previewMain.tsx`

## 当前导航实况（动手前核对）
- `ChartContentBar.tsx` 现有顺序：价格走势 → 量价走势 → 量价预测
- `Page` 类型尚无 `marketboard`；`App.tsx` 的 `AnalysisShell` 目前含 `dashboard | volume | pricing`
- 目标顺序：价格走势 → 量价走势 → **大盘走势** → 量价预测

## 要做
1. **页签**：在 `pricelens/src/components/ChartContentBar.tsx`「量价走势」**后面**新增「大盘走势」。
2. **路由/页面态**：扩展 `Page`（`pricelens/src/state/PageContext.tsx`）与 `urlSync.ts`、`App.tsx` 分析壳、相关 pageLabel/agent 枚举，使「大盘走势」与价格/量价一样走共享 `AnalysisShell`（切页不重挂筛选器）。page id 用 `marketboard`；标题「大盘走势」。
3. **页主体**：新建页（建议 `pricelens/src/pages/MarketBoardPage.tsx`）在分析壳内自上而下放置上述三张卡；产业切换若 surface/预览已有则对齐预览行为；风格严格复用 `pricelens/DESIGN.md` + `tokens.ts`（白卡、hairline、墨+单蓝+限量琥珀；涨蓝跌琥珀；`brandColorOf`）。可参考 `MarketBoardPreview.tsx` 的布局与数据接线，但要嵌进分析壳（带 ChartContentBar），不是独立预览页。
4. **不要**：重做图表、读凭据、付费 API、编硬事实、push/部署、动别人 WIP、占用/杀掉 5177 预览、碰桌面端 `zcode-host-local`。
5. **测试（用户视角）**：页签切换（价格↔量价↔大盘↔预测）筛选器不丢；大盘空态/加载/模拟数据徽标；三图现有组合（全档位/单档位、产业切换）；相关单测全绿（可补页签/路由冒烟）。跑 `cd pricelens && pnpm test`（或仓库惯用）确认绿。
6. **交付**：写 `docs/reviews/2026-11-03-marketboard-tab.md`（做了什么、测了什么、风险）；**显式 `git add` 仅本任务文件**后本地 commit。本班结束时分支上有清晰 commit。

## 验收
- 主导航可见「大盘走势」，点开能看到三张已有大盘图（复用 marketboard/ 组件），不是空白或新写的替代实现。
- `pnpm test` / typecheck / design:check 等既有门禁绿。
- 有 review 文档 + 本地 commit；工作区无无关脏文件（logs/ 勿提交）。
