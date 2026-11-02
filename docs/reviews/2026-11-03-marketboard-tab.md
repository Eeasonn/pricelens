# Review：主导航新增「大盘走势」页签（2026-11-03）

任务简报：`docs/briefs/2026-11-03-0300-marketboard-tab.md`。基线 `c1b057d`（`feature/market-board-gfk` 三轮反馈后的三图），本班只做「接入主导航」，不重做图表。

## 做了什么

| 文件 | 变更 |
| --- | --- |
| `pricelens/src/components/ChartContentBar.tsx` | 「量价走势」后新增「大盘走势」页签（目标顺序：价格走势 → 量价走势 → 大盘走势 → 量价预测），选中态墨色下划线 + `aria-current="page"`，与既有页签同款 |
| `pricelens/src/state/PageContext.tsx` | `Page` 联合类型与 `initialPage` 白名单加入 `'marketboard'` |
| `pricelens/src/state/urlSync.ts` | `PAGES` 数组加入 `'marketboard'`（`?p=marketboard` 链接可恢复、切页写 URL） |
| `pricelens/src/App.tsx` | `pageLabel` 增「大盘走势」；`analysis` 壳条件加入 `marketboard`；`AnalysisShell` 内渲染 `MarketBoardPage`——与价格/量价/定价推演同壳，切页不重挂筛选器（顶部筛选条、页头、滚动容器共享） |
| `pricelens/src/pages/MarketBoardPage.tsx`（新增） | 页主体：首卡 = `ChartContentBar` 页签行 + 口径行（「模拟数据」徽标 + `region · 销量单位万台 · 均价为美元 · 口径参考 GFK 看板` + 产业 `Segmented`）；其下纵排复用 `marketboard/` 三卡（`TierBrandShareCard` / `BrandShareTrendCard` / `BrandTierYoYCard`，`key` 随产业重挂=卡内档位筛选回默认，与预览面同款）；页脚数据说明行。产业选择走 `usePageViewState`（会话级跨页保留，与量价页视图态同口径） |
| `pricelens/src/components/Copilot/AgentPanel.tsx` | Agent 卡片动作跳页白名单加入 `'marketboard'` |
| `pricelens/src/agent/core.ts` | `buildAgentContext` 的 `pageLabel` 增 `marketboard: '大盘走势'` |
| `pricelens/.impeccable/surfaces/market-board-gfk.md` | 头部说明由「独立预览面、未接主导航」更新为「已接分析壳页 `marketboard`」，记录页面组装与视图态键；dev 预览入口保留 |
| `pricelens/src/pages/marketboard/__tests__/marketBoardTab.test.tsx`（新增） | 冒烟测试 6 例（见下） |
| `PriceLens.html` | `npm run build` 再生（单文件离线版随新页签/新页更新，`verify` 逐字节一致性过） |

未改动：三卡与 `marketBoardData/Model/UI`（零改动复用）、`PageHeader`（并行会话 WIP，marketboard 非管理页、无需改）、5177 预览会话与桌面端未触碰、`logs/` 未提交。

## 设计对齐

- 复用 `AnalysisShell`（第一百八十四轮共享壳）：切页签只换 `<main>` 内主体，筛选器不刷新。
- 白卡 + hairline + L1 阴影 + 8px 圆角，全取 `tokens.ts`；无新增 token、无新硬编码视觉值。
- 数据状态恒 simulated 且由文字徽标承载（页口径行 1 枚 + 三卡卡头各 1 枚），满足「不能只靠颜色区分」。
- 产业切换对齐预览行为（`Segmented` + key 重挂）；「大盘走势」不在 `PageHeader` 管理页签中，仍属图表内容导航（第一百八十九轮双层页签定版语义不变）。

## 测了什么

- 新增 `marketBoardTab.test.tsx`（jsdom；`echarts/core` 等模块 mock，只测 React 组装与导航，图内数值逻辑仍由既有 `marketBoardModel.test.ts` 覆盖）：
  1. 页签顺序四项正确；
  2. 点「大盘走势」→ page=marketboard、`aria-current="page"`、URL 写入 `p=marketboard`；
  3. 价格↔量价↔大盘↔预测往返切换页面状态正确；
  4. `?p=marketboard` 经 `readUrlOverrides` 恢复并作为 `PageProvider` 初始页；
  5. 页面组装：4 枚「模拟数据」徽标 + 三卡标题 + 页签行嵌首卡且当前页选中；
  6. 产业切换（穿戴→手机）口径行/数据说明随产业更新，且会话级保留（重挂后仍是手机）。
- 门禁：`npm run check` 全绿 = design:check + design:lint + typecheck + verify（46 项，含 PriceLens.html 逐字节一致）+ vitest **66 文件 / 636 测试全过（原 630 + 新增 6）** + build。
- 注：首次跑 verify 时 fresh worktree 无 `dist/` 导致单文件一致性一项失败，属顺序问题（verify 在 build 前）；build 后重跑 `npm run check` 全绿。

## 风险与遗留

- **数据仍是模拟**：三卡数据源 `marketBoardData.ts` 未接真实大盘数据；页/卡均带「模拟数据」徽标与口径说明，切换真实源只需替换该文件（口径行 tooltip 已注明）。
- **筛选器与大盘图不联动**：大盘页共用顶部筛选条（国家/产业上下文由页面内产业 Segmented 自理），筛选器当前不驱动大盘图——与 surface「不做档位联动」决策一致，属有意取舍。
- **产业选择会话级保留**：`LPL3.view.marketboard.industry`（sessionStorage），页签关闭即弃；若希望每次进入固定回穿戴，去掉 `usePageViewState` 换 `useState` 即可。
- Agent：仅登记了页面标签与跳转白名单；未新增大盘专属问答卡（后续真实数据接入时再做）。
- 预览面 `marketboard-preview.html` 保留（dev-only，不进构建），如需下线另行处理。
