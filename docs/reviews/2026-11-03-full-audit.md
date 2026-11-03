# PriceLens 全量审查报告 · 2026-11-03

> 审查人：ZCode（全量审查员，只审不推）。任务书：`docs/briefs/2026-11-03-0400-full-audit.md`。
> 审查基线：`be9eea2`（= 线上 origin/main，含大盘走势页签）。全部结论在该基线 + 本报告「已实施修复」节所列本地 commit 上验证。
> 硬性约束遵守情况：未 push、未部署、未改 main / 远端分支、未杀 5177（审查期间 5177 无进程监听）、未读凭据、未碰其他 worktree、未提交 logs/。

## 0. 方法与限制

- **逐页覆盖**：总览（overview）/ 价格走势（dashboard）/ 量价走势（volume）/ 大盘走势（marketboard，必审）/ 量价预测（forecast）/ 定价推演（pricing）/ Agent 面板，外加情报中心 / 预警 / 配置的导航可达性检查。
- **实测手段**：本会话浏览器控制不可用（IAB 不可达），用户视角测试以三层替代——①真实 `App` 组件树 RTL 组装测试（jsdom，mock echarts）；②vite dev 服务器（自起 5180 端口，HTTP 冒烟 6 条路由 + 改动模块 transform 200）；③逐文件代码审查（本报告全部问题均带 `file:line` 证据）。组合场景（切页不丢筛选 / URL 同步 / 刷新恢复 / 空态 / 边界值 / 口径 / 模拟数据徽标）在代码与既有测试（urlSync 24 例、marketBoardTab 6 例等）层核对。
- **门禁**：`npm run check` 全套在本 worktree 重跑（见 §4）。

## 1. 结论摘要

| 级别 | 数量 | 状态 |
| --- | --- | --- |
| P0 | 0 | — |
| P1 | 2 | 1 已修复（双页头）；1 待产品决策（定价页无导航入口，未擅动） |
| P2 | 3 | 1 已修复（Agent 页名缺「国家总览」）；2 待拍板（大盘口径脱节、check 门禁顺序） |

大盘走势页签本身（路由 / URL 恢复 / 产业会话保留 / 模拟数据徽标×4 / 三卡组装）经现有 `marketBoardTab.test.tsx` 6 例 + 代码复审，未发现新缺陷。

## 2. 问题清单

### P1-1 定价推演页在 UI 上无任何入口（不可达）｜待产品决策，未修

- **页面**：全局导航 / 定价推演（pricing）。
- **复现**：打开应用，在任意页面寻找「定价推演」入口——ChartContentBar 四个页签为 价格走势 / 量价走势 / 大盘走势 / 量价预测（`pricelens/src/components/ChartContentBar.tsx:99-105`）；页头管理页签为 情报中心 / 量价预测 / 配置 / 预警（`pricelens/src/components/PageHeader.tsx:27-32`）。全仓 `grep go('pricing')` 零调用；仅 Agent 跳转白名单（`pricelens/src/components/Copilot/AgentPanel.tsx:62`）与 URL 恢复（`pricelens/src/state/urlSync.ts:24`）仍支持。
- **期望 vs 实际**：定价推演是完成度很高的页面（165 轮波 1–3，含 20+ 单测、依据抽屉、方案快照），且保留在路由 / Agent 白名单 / `pageLabel` 里；用户审查清单也把它列为受审页面。实际上用户只能手改 URL `?p=pricing` 或靠 Agent 跳入。
- **成因（git 考古）**：f71af10（10-27，165 轮）建立页面并挂 PageHeader 顶签 → 366040e（10-29，183/184 轮）将其纳入分析壳、页签改为 ChartContentBar 内 disabled「即将开放（并行改造中）」→ d2823c1（11-01）disabled 页签位被「量价预测」顶替，此后定价页彻底无入口。注意 `PRODUCT.md`「产品范围与入口」（2026-11-01 更新）也未列定价推演——**入口缺失可能是「暂缓」决策的延续，但页面代码、路由、Agent 白名单又全部保留，两处状态互相矛盾**。
- **建议**：需拍板二选一——①恢复入口：ChartContentBar 在「量价预测」后加第 5 页签「定价推演」，或页头管理组加入口（同时更新 PRODUCT.md 模块清单）；②正式下线：摘路由 / urlSync PAGES / Agent 白名单，页面代码留档。导航收敛是 Eason 189 轮拍板，本轮不擅动。

### P1-2 定价推演页双页头（经 URL / Agent 进入时）｜已修复

- **页面**：定价推演。
- **复现**：`/?p=pricing` 打开 → 页头 → 筛选条 → **又一个一模一样的 64px 页头** → 定价内容。
- **期望 vs 实际**：分析壳（`pricelens/src/App.tsx:182-185`）已渲染 PageHeader + FilterBar；PricingPage 又自带 `<PageHeader />`（修复前 `pricelens/src/pages/pricing/PricingPage.tsx:395`）。RTL 探针实测：pricing 页 `header.lpl-page-header` ×2（dashboard / volume / marketboard 均 ×1）。中间那条 FilterBar（国家 / 产业 / 产品 / 币种 / 时间）对该全模拟页也全部无效，与双页头叠在一起观感是「页面套了两次壳」。
- **成因**：183 轮 pricing 进分析壳时页面自带页头未摘；因 P1-1 页面自那时起 UI 不可达，缺陷一直不可见。与 Dashboard / VolumePrice / MarketBoardPage（均不自带页头）不同口径，属遗留。
- **修复**：移除 PricingPage 自带 PageHeader 及 import，注释注明壳归属（commit 见 §3）；新增回归测试 `pricelens/src/pages/__tests__/appShell.test.tsx`（4 个分析页页头唯一性，4 例全绿）。

### P2-1 大盘走势页口径与全局筛选脱节（标题 / 筛选条 vs 卡片内容）｜待拍板，未修

- **页面**：大盘走势。
- **复现**：进入大盘走势 → 顶部筛选条切国家（如 俄罗斯→沙特）或切产业 → 三张卡内容完全不变；`document.title` 随全局口径变为「PriceLens · 大盘走势 · 中东 / 沙特…」而页面内容恒为「阿联酋」（三卡口径行明示 `阿联酋 · 销量单位万台 · 均价为美元 · 口径参考 GFK 看板`）。
- **证据**：三卡数据恒来自 `marketBoardData.ts` 固定产业集（穿戴/手机/平板，均为阿联酋），页面产业走独立会话态 `usePageViewState('marketboard.industry')`（`pricelens/src/pages/MarketBoardPage.tsx:22`），不读 `state.countryCode / state.industry`；FilterBar 由分析壳对 4 页统一渲染（`pricelens/src/App.tsx:184`），在大盘页全部可交互但全部无效；title 取全局 `scopeLabels`（`pricelens/src/App.tsx:81-83`）。
- **期望 vs 实际**：用户视角「改了筛选，图没反应」且无任何禁用或提示。可取之处：口径行有「模拟数据」徽标 + 阿联酋口径文字说明（符合 PRODUCT.md「数据状态显式」铁律），产业 Segmented 会话级保留 + 切换 key 重挂（档位筛选回默认）行为正常（`marketBoardTab.test.tsx` 锁定）。
- **建议**（任选其一，需拍板）：①全局产业 → 大盘产业单向联动（phone→智能手机、wearable→智能穿戴、tablet→平板，其余回落首项）；②大盘页对 FilterBar 置灰 + 口径行注明「本页为固定演示口径，不随顶部筛选变化」；③title 在 marketboard 页改用固定文案。①体验最好但涉及映射语义。

### P2-2 Agent 上下文页名缺「国家总览」｜已修复

- **页面**：总览 + Agent 面板。
- **复现**：总览页打开 Agent（⌘/Ctrl+K）→ 上下文芯片首枚显示「当前页 · overview」（英文 id 裸露）。
- **证据**：`pricelens/src/agent/core.ts:537-545` 的 `pageLabel` 映射缺 `overview` 键（其余 8 页齐全，且与 `App.tsx:70-80` 的同款映射不同步）；`AgentPanel.tsx:38` 以 `context.pageLabel ?? context.page` 兜底，于是裸显 id。
- **修复**：`agent/core.ts` 映射补 `overview: '国家总览'`（commit 见 §3）。

### P2-3 `npm run check` 在全新 worktree 首跑必失败（verify 先于 build 依赖其产物）｜备案，未修

- **场景**：clone / 新 worktree（`pricelens/dist/` 被 gitignore，不存在）→ `npm run check`。脚本顺序为 design:check && design:lint && typecheck && **verify** && test && **build**（`pricelens/package.json`），而 verify 第 4 节要求「根目录 PriceLens.html 与 `pricelens/dist/index.html` 逐字节一致」（`pricelens/scripts/verify.mjs:298-313`），dist 尚未生成 → `ENOENT` 失败，test / build 根本不会执行。
- **本 worktree 实测**：首跑 EXIT=1（前 3 步已绿）；先 `npm run build` 再跑 verify → 47/47 全绿。上一会话（868a61e 提交信息「636 测试全绿」）应有残留 dist，故未暴露。
- **建议**：`check` 序列把 build 挪到 verify 前（`... && typecheck && test && build && verify`），或 verify 第 4 节在 dist 缺失时提示「先执行 build」而不是判 FAIL。改门禁顺序影响协作流程，留待拍板。

### 备注与低危观察（不列为缺陷，随相关决策一并处理）

1. **定价页内部细节**（因 P1-1 页面不可达，随其决策一并修）：`PricingPage.tsx:118` `Metric` 的 `onKeyDown={onOpen}` 任意键触发（应限 Enter/Space）；方案 chip 的 ✕ 删除仅鼠标可达（`PricingPage.tsx:586`）；`saveScheme` 以 `saved.length + 1` 命名（`PricingPage.tsx:352`），删除中位方案后再保存会出现重复「方案 N」标签。
2. `VolumePrice.tsx:1786` 底部注释描述「已隐藏暂存条在面板区下方、卡内底部」，实际渲染于工具行上方（`VolumePrice.tsx:1542-1546`）——陈旧注释，行为正确。
3. `VolumePrice.tsx:1431` 明细卡 IIFE 内局部 `const synced` 遮蔽外层时间轴同步同名 state——作用域正确但易误读，建议改名 `storeSynced`。
4. `PageHeader.tsx:34` 的 `title` prop 声明在类型里但从未使用（`Overview.tsx:158` 传入 `title="国家总览"` 无效）——死参数。
5. `AgentPanel.tsx:281` `pageSuggestions` 无 marketboard / pricing / config / overview 条目（回落默认建议，可用不致错）。
6. 量价走势「已隐藏」暂存条 / 焦点承接 / 全隐藏空态 / 面板拖拽换位等 2026-11-01~02 的改版行为均有测试与代码双重复核，未发现回归。

## 3. 已实施修复（本地 commit，未 push）

| 文件 | 改动 |
| --- | --- |
| `pricelens/src/pages/pricing/PricingPage.tsx` | 移除自带 `<PageHeader />` 与 import（P1-2），注释注明分析壳归属 |
| `pricelens/src/agent/core.ts` | `pageLabel` 补 `overview: '国家总览'`（P2-2） |
| `pricelens/src/pages/__tests__/appShell.test.tsx` | 新增回归：4 个分析页（dashboard/volume/marketboard/pricing）在分析壳内 `header.lpl-page-header` 恰 1 个（mock echarts 需含 `clear`，jsdom） |
| `PriceLens.html` | 随 `npm run build` 再生同步（5,921,431 字节），按任务书约定随本任务提交 |

commit SHA：`10166aa`（分支 `fix/full-audit-2026-11-03`，pre-commit 钩子 typecheck / verify 47 / test 647 / build 四步全过；**未 push**，待用户过目）。

未修项：P1-1（导航入口属产品决策）、P2-1（口径联动方案需拍板）、P2-3（门禁顺序影响协作流程）、备注 1–5。

## 4. 门禁结果（修复后全量重跑）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 设计契约 | `npm run design:check` | ✅ 全 PASS（PRODUCT/DESIGN/tokens/impeccable 配置 18 项） |
| 设计 lint | `npm run design:lint` | ✅ 0 违规 |
| 类型 | `npm run typecheck` | ✅ 0 错误 |
| 数据与单文件校验 | `npm run verify` | ✅ 47/47（含 PriceLens.html 与 dist 逐字节一致 5.65MB） |
| 单测 | `npm run test` | ✅ 67 文件 / **647 例**全绿（含新增 appShell 4 例；基线 be9eea2 为 643 例） |
| 构建 | `npm run build` | ✅ dist 5,843.59 kB（gzip 2,754.02 kB），PriceLens.html 再生同步 |

注：`npm run check` 一条龙在全新 worktree 的首跑失败是 P2-3 所述既有顺序问题（verify 先于 build）；本次按 design:check → design:lint → typecheck → build → verify → test 分步全绿，与一条龙等价。

## 5. 逐页核对手册（要点与证据）

- **总览**：口径切换视图态失效自愈（`Overview.tsx:123-130` 用「上次口径键」比对避免挂载首跑误清）；`buildOverviewMatrix` 依赖项核对无失义（只消费 currency/platform/country/industry，`dataModel/aggregate.ts:981-996`）；摆位图筛选（产品/档位互斥清空）正常。
- **价格走势**：空态引导带（`PriceTrend/index.tsx:1414-1431`）；取数异常 ≠ 空态（185 轮口径，`LOAD_ERROR_HINT`）；Y 轴范围控件（A1 移驻工具行）行为由 `yLimitInputs.test.tsx` 9 例锁定；多平台对比入口（工具行右端 → 原位返回）与 PCV 会话快照机制正常。
- **量价走势**：自适应范围与价格页同口径（2026-11-02 纠偏，`VolumePrice.tsx:464-488`，flatSelections 合并取数只算范围）；窗口/独立时间轴跨粒度自愈（粒度戳 `panelWinsGran`）；隐藏/暂存/全隐藏空态齐备（`VolumePrice.tsx:1648-1676`）。
- **大盘走势**：三卡模拟数据徽标 ×4、口径行文字、产业 Segmented 会话保留、切换 key 重挂（`MarketBoardPage.tsx:62-65`）——`marketBoardTab.test.tsx` 6 例锁定；插值确定性 `marketBoardModel.test.ts`；同比曲线断开语义（本期同期皆无不标注）已在 c1b057d 修复并保留。
- **量价预测**：固定演示口径声明（不随全局筛选，`ForecastPage.tsx:122-124`）；数据缺失空态（`ForecastPage.tsx:59-70`）；What-if 仅本地草稿。
- **定价推演**：P1-1/P1-2 见上；模拟徽标、依据抽屉、方案快照恢复（含 elasticity 跳坑修复）机制正常。
- **Agent 面板**：跳转白名单 9 页齐全（含 marketboard，868a61e 同步）；筛选写入走「只读预览 → 应用 → 撤销/重做」符合「先读后算再写」；上下文过期指纹提示（stale chip + 动作按钮禁用）齐备；P2-2 已修。
- **URL 同步 / 刷新恢复**：写侧 `FiltersContext.tsx:491-504`（c/i/g/cur/main/plat/shop/seller/rs/re/pt/agg）与读侧 `urlSync.readUrlOverrides` 对称；`?p=` 由 PageProvider 写（默认页省略）；24 例 urlSync 测试覆盖归一/越界/静默忽略；localStorage（LPL3.filters v12）+ sessionStorage（LPL3.view.*）分层持久化经代码复核无越权写。

## 6. 排除备案

- 真机浏览器走查未执行（本会话浏览器控制不可用）；以 RTL 真实组件树组装测试 + dev 5180 HTTP 冒烟 + 全量代码审查替代，所有 UI 结论均有代码行号或测试证据，无凭印象项。
- `pricelens/marketboard-preview.html` 与 `previewMain.tsx` 为历史预览入口（PRODUCT.md 明示非产品入口），未计入审查范围。
- 情报中心 / 预警中心 / 配置三页仅做导航可达性与门禁级回归（不在本次 7 页清单内），未做逐控件细测。
- 5177 端口审查期间无监听进程（curl 000）；自起 dev 预览于 5180，仍在线未杀。

## 7. 提交记录

- 修复 commit：`10166aa`（fix/full-audit-2026-11-03；PricingPage 双页头摘除 + agent pageLabel 补 overview + appShell 回归测试 + PriceLens.html 再生 + 任务书入库）。
- 本报告 commit：见 `git log -1 docs/reviews/2026-11-03-full-audit.md`。
- 两个 commit 均本地提交、未 push、未动 main / 远端分支；未使用 --no-verify。
