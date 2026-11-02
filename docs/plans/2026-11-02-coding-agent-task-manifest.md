# PriceLens 预测、Agent 与全应用修复任务清单

> 交付对象：后续 coding agent / reviewer  
> 关联计划：[预测、Agent 与全应用修复计划](./2026-11-02-forecast-agent-and-app-audit-plan.md)  
> 关联审计：[全应用 UIUX 与 BUG 审计](../reviews/2026-11-02-app-uiux-bug-audit.md)  
> 原则：每个任务独立可回滚；没有完成验收证据的任务不得标记完成。

## 使用规则

1. 先读 `PRODUCT.md`、`pricelens/DESIGN.md`、`pricelens/.impeccable/surfaces/forecast-simple-v1.md`，再读 Lifecycle OS 三份交接材料、[完整 Adapter 模拟数据规范](../PRICE-LENS-FORECAST-DEMO-DATA.md)和[模型配置与存储草案](../lifecycle-os-mvp/04-model-storage-schema.md)。
2. 当前工作树存在大量并行 WIP。开始前记录 `git status`，只提交自己负责的文件，不能把 `PriceLens.html` 或无关 roadshow 文件带入预测修复。
3. Demo 阶段的固定范围必须显式写成“固定演示范围”；真实 Adapter 阶段才允许由全局筛选驱动计算。不能保留半联动状态。
4. 所有事实、模拟、模型输出、业务假设、确定性计算都要有结构化状态和文字标签，颜色不能是唯一依据。
5. 任何 Agent 数字都必须来自当前页面快照；禁止新增第二套预测常数或 prompt 正则路由。

## 任务总览与依赖

当前实现状态：F0–F6 已有代码落地，V2 已补齐本地双轴 / 独立时间轴与极差 sticky 层；关键路由浏览器与 console 回归已通过（forecast、volume、alerts、intelligence、config，当前无 error/warn），完整 F7 仍需补齐 390/768 多尺寸、空态 / 缺采 / 错误态和真实 Adapter 联动，外部量价 agent 若有新版本仍需三方 diff。

```text
F0 基线冻结
 └─ F1 口径与文案
     └─ F2 ForecastSnapshot + Agent 意图
         └─ F3 Dataset Adapter + observed / forecast
             └─ F4 有限因子学习
                 ├─ F5 预测页证据 UI
                 └─ F6 Agent 解释卡与运行状态
                     └─ F7 全应用 UIUX / BUG 审计回归

V1 量价走势现状复核（可并行）
 └─ V2 sticky 极差层 + 双 Y 轴 / 独立 X 轴
```

## F0：基线冻结与契约决策

**范围**：文档、测试清单、运行证据。不得改业务逻辑。

- 记录当前提交、工作树、开发服务器、`typecheck`、定向测试和浏览器路由状态。
- 决定 Demo 范围策略：首期固定 R国 / 直营电商 / Pura 90 / USD，并在入口锁定；后续 Adapter 再联动全局筛选。
- 更新所有旧测试路径和旧 P50 口径。
- 建立问题编号到文件、复现路径、测试和验收条件的映射。

**验收**：评审者能从文档判断每个数字是模拟、观测、模型输出还是业务假设；无关 WIP 不进入提交。canonical 数据源固定为 `simple-demo-v1`（当前 UI 的 R国 / 直营电商 / Pura 90 / USD / 24 周），`simple-full-v1`（RU / DNS / Pura 80 / RUB / 104+8 周）仅供 Adapter、拟合和验模，不自动替换 UI。

F0 同时冻结可持久化契约：`manifest`、`factor-config`、`fit_runs`、`learned_parameters` 和 `forecast_snapshots` 必须符合 [04-model-storage-schema.md](../lifecycle-os-mvp/04-model-storage-schema.md)，并提供 `schemaVersion`、迁移策略、`attemptId` 和 `contextFingerprint`。竞品上市事件必须保存 `marketEffect=unknown|neutral|expansion|substitution` 与证据缺口。

## F1：预测信任文案与范围状态

**文件范围**：`ForecastPage.tsx`、`ForecastKpiStrip.tsx`、`ForecastChart.tsx`、`CalculationPath.tsx`、`FactorEvidence.tsx`、`forecastFixture.ts`。

- `模型学习` 改成 `固定先验` / `待学习`，直到有真实 fit 结果。
- `模型点估计（P50）` 改成 `模型点估计`；没有校准结果就不显示 P10/P50/P90 或残差区间。
- W1–W10 显示 `历史段（模拟）`，不要显示 `实际`。
- 范围卡同时显示 `dataStatus`、`modelVersion`、固定 Demo 标记和事实截止周。
- 明确当前页面筛选器是上下文还是计算输入。

**验收测试**：AX 树不再出现伪 P50、伪残差区间或“模型学习”字样；模拟状态在文字中可见。

## F2：ForecastSnapshot 与 Agent 结构化意图

**文件范围**：`forecastModel.ts` / 新建 `forecastSnapshot.ts`、`ForecastPage.tsx`、`agent/contracts.ts`、`agent/core.ts`、`AgentContext.tsx`、`AgentPanel.tsx`。

- 建立唯一 `ForecastSnapshot`，遵循存储草案的版本化契约，包含 scope、dataStatus、modelVersion、historyWeeks、forecastWeeks、factors、KPI、scenario、`attemptId`、`contextFingerprint`、`schemaVersion`；每周保留 `source`、`observedSO`、`modelDemand`、`forecastSO`、`soStatus` 和 residual。
- 页面按钮发送结构化 `intent: 'forecast_explain'`；兼容文本至少识别“简单版预测”。
- `forecastCards()` 不再保留 499 / 4600 / -1.85 / 7200 等旧常数。
- Agent 结果携带 `action.target` 和 snapshot fingerprint，结果卡不再依赖 prompt 文案判断跳转。
- 主动预警缺价保留 `null`，显示 `— / 暂无价格`，禁止回退为 0。
- `stop()` 显式追加 `run.cancelled`，再丢弃迟到响应。

**验收测试**：预测页按钮、快捷问题、自然语言追问都进入同一个预测解释处理器；Agent 解释中的价格、需求、供给、模型版本与当前快照一致。

## F3：Dataset Adapter 与历史观测分离

**文件范围**：`forecastFixture.ts`、新建 `forecastDatasetRegistry.ts` / adapter、`forecastModel.ts`、`WeeklyLedger.tsx`、相关测试。

- 输入字段增加 `observedSO`、`soStatus`、`dataStatus`、`coveragePct`、`incentive`、`effectivePrice` 和 `effectivePriceLagWeeks`。
- 输出字段分开保存 `modelDemand`、`unconstrainedDemand`、`forecastSO`、`observedSO`、`residual`、inventory、DOS、weeklyGrossMargin。
- 历史观测、模型估计和未来预测在图例、表格和 Agent 中分开。
- `soStatus=censored` 的缺货周保留为需求下界，不当作需求下降。
- Fixture registry 至少支持 24 周 Demo、104+8 周完整模拟、无匹配范围空态。
- Sell-in、期初库存、期末库存和激励费用进入周度主账。

**验收测试**：切换 Fixture 不改页面组件；缺货周可证明“SO 被供给截断”；truth 字段不进入页面和 Agent。

## F4：有限因子权重学习

**首期因子**：基线、价格、促销、竞品压力。供给仍是成交约束，成本仍只进入利润链。

- 使用可解释的 log-demand 模型或等价的确定性回归：

  `log(demand) = baseline + β_price × priceKernel + β_promo × promoKernel + β_competitor × competitorKernel + error`

- 拟合实现使用极小确定性 ridge 稳定项处理重复事件窗口造成的矩阵奇异；这只保证可解，不会绕过样本、删失、混杂和事件覆盖门槛。

- 价格按一周滞后 kernel 生效；促销包含预热、活动期、活动后透支；竞品事件明确窗口和衰减定义。
- 价格与促销同周重叠时标记混杂，不作为干净因果样本。
- 少于 3 次独立促销、3 次调价或 2 次竞品事件时回退到先验；同时检查时间覆盖、非事件对照周、缺货删失比例、共线性 / 可识别性和 seeded truth 参数回收误差。
- 输出 coefficient、prior、sampleCount、fitWindow、confidence、interval、exclusions、modelVersion、fittedAt。
- 同一输入和版本必须确定性重算。

**验收测试**：单独改变一个因子只影响对应链路；样本不足显示“证据不足”；缺货比例过高时不输出强因果结论。

## F5：预测页证据与经营主账 UI

**文件范围**：预测展示组件、表格、图表和计算路径。

- KPI 拆分历史观测与未来预测，避免累计值混合而无解释。
- 图例区分 observed / model / forecast。
- What-if 只改变未来周，并显示“历史不变、未来草稿重算”。
- 因子卡显示样本数、窗口、fit 状态、排除数和补数建议。
- 主账增加 Sell-in、期初库存、激励费用和数据状态。
- DOS 使用滚动四周无约束需求。
- 事件脚注从配置生成，不硬编码 W15 等周次。
- 390 / 768 宽度下只允许局部表格滚动，不允许整页横向溢出。

**验收**：每一个 KPI 都能通过计算路径回到输入、公式、舍入、版本和数据状态。

## F6：Agent 产品化

- 结果顺序固定为：结论 → 事实 → 计算 / 规则 → 判断边界 → 动作。
- 预测解释显示 snapshot fingerprint、modelVersion、fitWindow、sampleCount 和证据链接。
- What-if 结果明确是本地草稿，不写入真实数据。
- 无数据、缺采、模拟、混合、错误和旧上下文都给出明确状态。
- dock / drawer / full 切换不丢输入草稿、运行状态、焦点和结果。
- 关闭面板后后台运行，重新打开必须能区分完成、失败、取消和 stale context。

**验收**：并发请求中旧快照不能覆盖新筛选范围；所有 Agent action 通过结构化 target 回到正确页面。

## F7：全应用 UIUX 与 BUG 回归

逐路由检查：价格走势、量价走势、量价预测、预警中心、情报中心、配置、共享页头、筛选器和 Agent。

每条路由至少验证：

- 默认、空数据、缺采、模拟、混合、错误和长文本状态；
- 国家、产业、产品、平台、币种、粒度和时间范围切换；
- URL、localStorage、页面结果和 Agent context 同步；
- 键盘 focus、ARIA、图表文字摘要和局部横向滚动；
- 1440 / 1024 / 768 / 390 宽度；
- console 的 pageerror、404、Promise rejection、重复 key 和 antd 弃用警告。

新增明确项：`overview` / `pricing` 被禁用时不能静默回退到 dashboard；旧入口和 Agent action 要么移除，要么显示迁移提示。

本轮 F7 复核已完成 390 / 768 / 1024 / 1440 的五条正式路由页面级横溢检查、预测 / 量价图文字摘要、量价键盘观察周、Agent 390px modal / Escape / focus 回收；仍需后续补齐空态 / 缺采 / 错误态的逐路由状态矩阵、真实 Adapter 与多尺寸视觉截图回归，并单独治理并发 Vite HMR 下的 Provider 瞬态报错。

## V1–V2：量价走势增补问题

当前代码已有局部横向滚动、顶部极差卡和单主品中性色背景，但仍需验证并补齐：

- 双主品必须保持最小可读宽度，窄屏使用局部横滚或堆叠；
- 价格 / 销量极差卡改为图表顶部 sticky / overlay 层；
- 成本与销毛使用独立 Y 轴和轴标签；成本销毛图有独立 X 轴，并与观察周、拖选、键盘联动；
- 单主品去掉不必要的品牌大色块和重复品牌图例；
- 平台切换、删除中间面板、缺采和同步 / 独立时间轴不串台。

量价走势实现完成前，不得在发布说明中写成“四项全部完成”。

V2 合并后必须重新执行 F7 全站审计；最终顺序是：外部量价改动合入 → 三方 diff / 冲突检查 → V2 定向测试 → F7 全站回归 → 统一发布门槛。

## 统一发布门槛

```bash
npm --prefix pricelens run design:check
npm --prefix pricelens run design:lint
npm --prefix pricelens run typecheck
npm --prefix pricelens run test
npm --prefix pricelens run verify
```

涉及运行时数据、页面或生成单文件时额外运行 `npm --prefix pricelens run check`，并在提交说明中注明是否重建 `PriceLens.html`。

每个任务提交必须包含：改动范围、未覆盖范围、验证命令、浏览器路由、数据状态和回退方式。
