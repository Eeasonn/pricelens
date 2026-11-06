# 量价预测 · 四步推演工作台（Batch 2 · 2026-11-07）

> 路由 `page = 'forecast'`（`pricelens/src/pages/ForecastPage.tsx`）。
> 本文件为 Batch 2（`docs/design/zcode-briefs/batch2-iterate-forecast.md`）
> 的实施正典；与 `forecast-workbench-v2.md`（v3 收敛版）叠加生效——本文
> 只记录 Batch 2 新增/变更决策，未提及处沿用 v3 正典。

## 目标（Batch 2 增量）

把量价预测收敛为一条**可审计、可回滚、可由人修正**的四步推演链：
①参考产品基线 → ②大盘修正 → ③库存修正 → ④成本及销毛。保持「顶部一张
主图 + 底部四张小卡」单源数据不分裂；PipelineNav / 审计卡只定位与展示，
不复制第二套数字。

## 口径铁律（本批红线）

- 文案与字段**只写「销毛」**，禁用用户口述的同音误写词（源码 0 处该字面量，
  检测用码点转义）：单台销毛额 = 单台收入 − 单台
  成本；销毛率 = 单台销毛额 ÷ 单台收入（销毛率唯一公式来源 =
  `marginScenarioModel.forecastMarginRateOf`）。
- 单位轴与金额轴严格分离（周销毛 $M 左轴 / 价格与成本 USD/台 右轴，
  沿用④卡几何）；不把总销毛金额与单价共用坐标。
- 无真实模型置信契约**不展示任何百分比置信度**；预测区间只写
  「范围示意 / 待接入」。情报候选注入为空时保留「候选生成能力待接入」
  空态语义（模拟候选显式「模拟」，更新能力 title 待接入）。

## Batch 2 决策

### 1. 修正原因必填（覆盖 2026-11-04「选填」拍板）

brief §3.2 / DoD：手动数量/价格/月度事件/库存/SI 修正均须内联填写原因，
**保存才回写主图、摘要、对应卡与审计轨迹；取消不写入**。落地：

| 编辑入口 | 必填字段 | 保存通道 | 取消通道 |
| --- | --- | --- | --- |
| 周销微调 `TuneDialog` | 调整原因（必填） | 应用按钮（缺原因禁用） | 取消/Esc |
| 大盘按月调整 `MonthAdjustPopover` | 调整原因（必填） | 应用按钮（缺原因禁用） | 取消（回证据态） |
| 月度事件 `＋事件` 浮窗 | 事件说明（必填，即修正原因，并入 label） | 保存事件/保存修改 | 取消/✕/Esc |
| SI 月计划行内编辑 | 修正原因（必填，仅当数值 ≠ 已提交值） | 失焦/Enter/保存按钮（`tryCommit`） | Esc/取消按钮 |
| 成本假设 `ForecastMarginCostCard` | 成本假设原因（必填） | 保存按钮（缺原因禁用） | 取消 |
| 价格手调 `PriceAdjustDialog` | 参考说明（必填，自动带入可改） | 应用价格调整（缺原因禁用） | 取消 |

模型侧：`WorkbenchParams.siReasons: Record<MonthKey, string>` 与
`siPlanMonthly` 平行（原因不参与计算，只进审计与导出）；写入走纯函数
`withSiPlanEntry`（数值与原因同笔；回基准清原因）；
`normalizeWorkbenchParams` 清理孤儿原因（数值回基准的月不残留原因）。
历史草稿兼容：类型仍允许空原因（audit/导出显示「未填（历史草稿）」），
新写入一律经必填 UI。

### 2. 步间对比与因果记录（新审计卡 `ForecastAuditTrail`）

位置：主图卡之后、①参考卡之前；数据源 = `forecastSteps.ts`
`buildForecastSteps(fixture, params, result, marginView, scenario, siState)`
——**只从既有模型派生**（WorkbenchParams / WorkbenchResult / MarginView /
MarginScenario / SiConfirmationState），不另起第二套预测模型。

- 每步行默认只露**结论**（数字与主图同源：①基线合计 Σ baselineSales、
  ②人工调整/事件计数、 ③首修正周 + 缺口 + SI 待确认、 ④预测期销毛 +
  销毛率 + 覆盖率）；展开见五要素：**输入（前一步输出 = 本步输入）/
  假设 / 修正（含内联原因）/ 证据（数据状态 + 数据版本 + 采集时间）/
  数据状态与待补契约**，另附公式行（④ = 销毛口径铁律文案）。
- 证据状态词汇：`real`（会话内人工事实，如 SI 确认记录、价格/成本假设）/
  `simulated`（演示样本）/ `mixed` / `pending`（能力待接入）/ `missing`；
  `capturedAt` 缺失时 UI 写「采集时间：待确认」。
- 步骤计算状态：`ready`（可计算）/ `partial`（部分可算，缺数周不掩盖）/
  `pending`（待接入）/ `cannot_compute`（无法计算）；行 chip 文字承载语义。
- 「定位」按钮 = 跨卡滚动聚焦 + 「来自 步间审计」返回条（与 PipelineNav
  同一纪律：不写 params、不重算）；Esc 收起展开态。

### 3. 重算守卫（失败保留旧值可重试）

`ForecastPage` 对 `computeWorkbench` 加 try/catch：抛错时保留
`lastResultRef` 上次成功结果（主图/摘要/四卡继续渲染旧值，失败不当 0），
审计卡顶部 `role=alert` 横幅「重算失败：… 已保留上次成功结果」+ 重试按钮
（`computeTick` 触发 memo 重跑）；首帧即失败（无旧值）时整页降级为
可读错误 + 重试（不渲染 NaN 图表）。重算口径如实说明：**本地确定性引擎
同步重算（无异步等待），不伪造 loading/spinner**。

### 4. 上下文指纹与漂移提醒

审计卡头部 mono chip「上下文 {fingerprint}」（`referenceScopeHash` =
国家/产业/渠道/产品/模型版本哈希）；全局筛选与固定样本国家不一致时显示
`contextStaleNote`（role=status）：提醒换国后以指纹比对，不把旧结果静默
套到新国家/产品。

### 5. 统一取证补齐（数据状态行）

- 主图周证据浮框（`WeekEvidence`）：新增数据状态行「数据状态：模拟（…）·
  数据版本 {modelVersion} · 采集时间：待确认 · 缺数周不插值」。
- 大盘月证据浮框（`MonthEvidencePopover`）：同款数据状态行 + 缺失字段
  （真实大盘来源 URL / 采集时间待接入）。
- hover 预览（role=status）/ click·Enter 固定（role=dialog）/ Esc 分级 /
  触屏可点的既有交互不变。

### 6. 导出与话术

`workbenchExport`：SI 逐月行附「原因：…」；④段落新增销毛率行（口径铁律
文案）。PipelineNav / 页面禁词纪律不变（因子/约束/置信区间/我司/刚性砍/
销毛误写词均不得出现）。

## 允许的实现边界（Batch 2 白名单）

`ForecastPage.tsx`；`forecast/{ForecastAuditTrail,forecastSteps,MarketBusPanel,
InventoryValidationCard,ForecastMarginCostCard,PriceAdjustDialog,MainForecastChart,
EvidenceFrame,workbenchModel,marginScenarioModel,workbenchExport}.ts(x)` 及对应
`__tests__`。tokens 未新增（全部复用既有 token 与 WorkbenchBits 控件语言）；
`appChannel` / 稳定渠道 / 真实抓取 / 置信度百分比零改动。

## 仍待补数据契约（不伪造实现）

真实参考产品匹配服务与时间序列、真实大盘/库存/DOS/SI/成本来源（URL +
采集时间 + 数据版本）、真实情报候选注入、预测区间与置信度契约、override
与审计的后端落库。接入前一律显示「待接入 / 待确认」，不造数、不造百分比。
