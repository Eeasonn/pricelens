# 量价预测 · 推演工作台 v3（surface 文件沿用 forecast-workbench-v2.md）

> 路由 `page = 'forecast'`（`pricelens/src/pages/ForecastPage.tsx`）。
> 正典状态：2026-11-05 v3 收敛版（`design-proposals/forecast-global-ia-review.md`
> 附录 A 拍板 + 附录 B 任务 1–10 交付；本文为该页审计与实施正典）。
> 2026-11-06 P0 修订（来源回执 forecast-gap-20261106，对齐价格走势设计语言）：
> 首卡收敛单工具行 + PipelineNav 并入；主图/库存卡实测宽绘制；周销柱品牌色
> 与事件色/状态色语义收敛（详见「页面结构」§1–3 标注）。
> v2 旧决策（预置 basePath 季度基线、8 周主图、单周事件、原因必填、库存
> 「刚性」话术、未来 4 季度逐月）全部退役；与本文冲突的旧段落不再有效。

## 目标

让操盘者在单页完成「结果总览 → 假设修正 → 逐月确认 → 经营结果」闭环：
统一日历 2026-11—2027-10（12 个月预测窗，跨年 WeekId 唯一主键）下，
①自动学习基线（上一代同周龄参照，本地确定性学习）→ ②大盘按月修正
（12 个预测月生效值 + 人工月事件 + 主图自由范围事件）→ ③SI 逐月确认与
库存上限修正 `min(基线 SO, 可售)` → ④成本销毛（MarginView 统一口径）。
全部数值为演示（固定种子模拟），生产话术呈现。

## 页面结构（首卡单工具行 + 五卡，自上而下；2026-11-06 P0-3 修订）

1. **首卡**：图表页签行 + **单条工具行**（与价格走势首卡同密度）——去掉了与
   页签重复的大标题「量价预测 · 推演工作台」（页面不再渲染 h1）；7 段范围
   口径压缩为「固定样本 · 不随全局筛选联动 + 产品名 + ？号」，完整口径
   （国家/产业/渠道、币种、当前周/今天、历史/预测窗、主参考、参照竞品）进
   ？号 title；DataStatusBadge 一处 + 模型版本 mono chip；SI 未全部确认时
   显式「SI 未全部确认（待确认 N / 12）」（B.5.7）；PipelineNav 紧凑形态
   并入工具行；「让 Agent 解释」「复制关键假设」（v3 管线顺序导出）为 24px
   小号按钮。
2. **PipelineNav**（B.5.1–B.5.2，2026-11-06 P0-3 并入首卡工具行）：管线
   ①自动学习基线 → ②大盘修正 → ③库存修正（SI 待确认 N / 12 + 首修正周）→
   ④成本及销毛（预测期销毛 + 暂不联动销量）的**紧凑形态**——无独立厚条边框
   与「推演顺序」占位标签，节点只显「① 名称」，实时状态读数收进节点 title。
   点击只定位：滚动 + 目标卡 `tabIndex=-1` 聚焦 + 目标卡顶
   「来自{来源} · {周}　返回」返回条；不写 params、不重算、不提交编辑；
   `returnScrollY` 为内存瞬态。
3. **① 结果总览（主图 + 摘要）**：全期周图（完整历史 + 统一预测窗，月分组
   横轴，周详情 `YYYYWww`）；视图窗「全期 / 三月 / 近 8 周」只改视图不裁模型。
   **2026-11-06 P0-1**：主图与③库存卡 viewBox 宽 = ResizeObserver 实测容器宽
   （`CHART_W_FALLBACK` 1180 / 720 仅作无 RO 兜底；地板宽 960 / 700 由包裹层
   minWidth 保证），刻度字号恒真实 px。**P0-2 数据色**：周销实际/预测柱 =
   `brandColor.HUAWEI`（蓝 = 选中/链接语义，不作数据色）；`cannibalization`
   事件锚色 = `#be123c`（退出 ink；`referenceEventPalette` 挤兑默认同步）；
   证据浮框动作（「微调本周」「调整此月」）与 SI「已确认」/「本地考量已修改」
   状态胶囊均退出墨色（描边静默按钮 / resolved 绿 / 琥珀=需要关注）。
   预测周证据 = EvidenceFrame（hover/focus 预览 `role=status`，click/Enter
   固定 `role=dialog`，Esc 回证据/关闭）：阶段值 `learnedBase / baselineSales /
   marketAdjusted / inventoryAdjusted / final`，构成按 ①学习→①范围事件→②大盘
   →③库存→手调排序、每项可定位对应卡。产品范围事件 = 图顶 A 编号 + 起止
   端点 + 范围线（重叠 ≤2 lane，其余 +N 打开名录筛选）；一个事件一个自由
   起止周闭区间（`EventReplayModal`，回放预填可改，名称/原因选填），名录
   「编辑」= 同范围原位替换。周销手调墨色菱形与价格手调「价」小标并存
   （价格手调来自④）；库存截断琥珀描边读 `supplyCapped`（不随手调消失）。
   价格系列显示价 = `MarginView.weeks.effectivePrice`；主表 `MainForecastDataTable`
   （B.5.4 列：周 / 状态 / 学习基线 / ①后 / ②后 / SI / ③后 / 手调 / 最终 SO /
   期末库存 / 渠道 DOS / 显示价格 / 成本 / 单台销毛 / 周销毛 / 事件操作），
   缺数「—」。摘要四格销毛读 `MarginView`（与④同源）。
4. **② 量价参考（①基线预测 · 历史参照）**：纯历史无预测段；上一代同周龄
   对齐进①学习器（切换 = 重新学习，非静态比值）；首预测周读数 = 「首预测周
   YYYYWww · 同周龄证据」；主图学习证据可定位本卡（`locateRequest`，锁定面板
   只展开详情不改窗）；补录/覆写/20 步撤销工作区不变。
5. **③ 大盘 · 总量总线（②大盘修正）**：历史月 + 统一 12 个预测月（月生效值
   直接修正对应预测周；季度基线只作生成与解释，无季度改格）；月浮框 = 近 6
   个月趋势 + 去年同季月形 + 算例；「调整后指数 / 增减幅」两式、原因选填、
   还原基线；人工月事件三字段（名称选填）可编辑/删除；右 1/3 事件区 =
   `IntelligenceReviewPanel` 容器位（真实候选未接入 = `availability="pending"`
   空态「候选生成能力待接入」，不画假候选）；应用反馈行提供「查看主图 /
   检查库存」跨卡定位。
6. **④ 库存修正 + ⑤ 成本销毛（左右两列，≤760px 单列）**：④ = SI 逐月确认
   （12 格四月组；本地 raw 草稿，合法值写 `siPlanMonthly` 仍待确认，点击
   「确认本月」才写确认工作区；空白/0/非法就地报错不提交；修改已确认月自动
   回待确认）+ 库存图与修正事实输出（修正周可「回主图查看」）；⑤ = 成本
   版本表（编辑只写 `costOverrides`，原因选填可还原）+ MarginView 经营结果
   （覆盖率如实显示）+「带到主图调价」`PriceAdjustDialog`（周/月两式，月展开
   为共享 batchId 周记录；预览固定「价格→销量关系未纳入 · 暂不联动销量」）。

## 自动学习①（B.4.2）

- 唯一算法 `ridge-log-volume-v1`：上一代同周龄 log 量 + 趋势 + 促销特征，
  本地确定性、可复算；证据含样本窗 / 有效周数 / 特征 / 系数 / 留出 MAE / MAPE。
- 样本不足或特征缺失显式回退（`fallbackReasons` + 影响周），不冒称「学习
  完成」；学习回退在 PipelineNav、①卡与导出同显。
- 参考比值只进①学习，不另乘第二遍；参考卡不产生第二套基线数字。

## 状态存储与重置（B.5.10）

| 状态 | 位置 / 键 | 生命周期 |
|---|---|---|
| `WorkbenchParams` | `usePageViewState`：`forecast.workbench.workbench-demo-v3` | 页签会话；归一化后使用 |
| 主图/参考视图窗口 | `forecast.mainView`、`forecast.referenceView.<scopeHash>` | 页签会话；只影响呈现 |
| SI 确认 | `forecast.siConfirmation.workbench-demo-v3` | 页签会话；数值以 params 为准 |
| 成本/价格情景与撤销 | `forecast.marginScenario.workbench-demo-v3` | 页签会话；scenario + 20 步 before/after |
| 情报审核工作区 | `LPL3.forecast.intelligenceReview.<scopeHash>` | 浏览器本地；v2/v3 不串 |
| 参考事件工作区 | `LPL3.forecast.referenceWorkspace.<scopeHash>` | 浏览器本地；不动 |

- 「重置基准」只清 v3 主链 params 与 SI 确认，确认文案明确「成本价格、参考
  事件与情报审核工作区不清」；⑤另有独立「还原成本与价格基准」。
- 存储失败不静默丢数据：内存态继续 + 「未持久化 · 重试」（SI / 成本价格 /
  情报审核同模式）；schema 读取先 validate/migrate，坏数据隔离不崩页。
- 重置后候选工作区把对应链接标「事件已随重置移除」，不自动重新应用。

## 导出（复制关键假设 · 任务 10）

`buildWorkbenchAssumptionText(fixture, params, result, context)`，context 固定含
`calendar / learning / siConfirmation / marginView / intelligenceReview`
（测试经 B.6.2 `__tests__/workbenchV3TestFactory.ts#makeExportContext` 收敛）。
段落顺序 = 管线顺序：【范围与模拟状态】（含统一预测窗 `2026-11—2027-10`、
12 个月、模型版本）→【① 基线预测】（自动学习 / 回退警示）→【② 大盘修正】
（季度链 + 12 月生效值 + 行业/月度事件）→【③ 库存修正】（SI 十二月逐月值 +
逐月确认状态 + `SI 待确认 N / 12` + 库存规则 + 修正事实，未确认时显式警示）
→【④ 成本及销毛】（成本/价格情景 + MarginView 销毛与覆盖 +
「价格→销量关系未纳入」）→ 其余（上一代参照 / 产品事件 / 手调 / 审核状态）。
禁词回归：置信区间 / 无约束需求 / 刚性砍 / 我司（另禁 因子 / 约束）。

## 孤儿处置（第六节，已执行）

`CalculationPath / DriverWaterfall / WhatIfDraft / EventTimeline /
FactorEvidence / ForecastKpiStrip / WeeklyLedger` 七个 v1 页面组件及其专属
测试已删除（grep 全 src 零生产引用后删）；`forecastModel /
forecastDatasetRegistry / forecastSnapshot / forecastLearning` 保留——Agent
情景快照链路仍消费（`src/agent/core.ts`）。`MainForecastDataTable` 吸收
`WeeklyLedger` 表格职责（sticky header / 数字对齐 / 局部横滚），全期只此一张主账。

## 信任与话术纪律

- AI 推测处挂 AI 标（「AI 推测 · 可改」→ 人工改后「人工确认」）；①为「自动
  学习 · 可改」，回退显式。证据语言零概率词：无置信区间 / P10·P50·P90 /
  置信度 / 区间覆盖。
- 手调与事件名称、原因一律选填（不填即可应用；填写则内联标注）；不恢复
  必填拦截。
- UI 禁词：因子 / 约束 / 置信区间 / 无约束需求 / 我司（工程字段
  `unconstrained` 允许）；库存话术 = 「库存上限修正 / 按可售量修正 / 修正周」。
- 模拟标识分级轻量：页首 DataStatusBadge 一处 + 各卡「模拟 / 模拟历史」chip；
  范围行写「固定样本 · 不随全局筛选联动」。
- 价格→销量关系未拍板：只联动销毛并显式「暂不联动销量」；不出现「预计销量
  随之变化」；拍板后另改契约，不得静默翻 `priceDemandLinked`。

## 接口契约（v3 冻结）

统一日历 `workbenchCalendar.buildForecastCalendar / WeekId / durationOfWeekRange`；
主链 `workbenchModel.computeWorkbench`（v3 主链字段 + `LearningRun`）；统一
销毛 `marginScenarioModel.computeMarginView / MarginView`（priceDemandLinked
恒 false 直至另开契约）；SI 确认 `useSiConfirmations`；成本价格工作区
`useMarginScenario`；情报审核 `useIntelligenceReview`；页级管线
`PipelineNav`（`ForecastStage 1–4`，只读状态 + 定位）；统一证据外壳
`EvidenceFrame`；主表 `MainForecastDataTable`；导出
`workbenchExport.buildWorkbenchAssumptionText`（4 参 + WorkbenchExportContext）。

## 范围外（本轮不做）

真实数据 Adapter、真实筛选联动、真实情报抓取、价格→销量数学关系、自动改价
与自动执行经营动作；账号级多人协作与纪要层；品牌份额 / Top6 / ASP / 领跌
剔除（展示层页签职责）；量价走势主面板逐元素图例；旧 `forecastModel.ts /
forecastFixture.ts`（simple-v1，Agent 链在用）不动。

## 审计追踪

实施问题编号沿用 `design-proposals/forecast-global-ia-review.md` 附录 B 任务
1–11 与其 B.7 交付门禁；不由本文另造。
