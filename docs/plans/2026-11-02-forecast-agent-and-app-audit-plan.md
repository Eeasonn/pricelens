# PriceLens 预测、Agent 与全应用审查修复计划

> 日期：2026-11-02  
> 状态：核心实现已落地；自动化门槛与关键路由回归通过，进入真实 Adapter、预测校准和全站多尺寸回归
> 适用范围：`pricelens/src/pages/forecast/**`、`ForecastPage.tsx`、`pricelens/src/agent/**`、AgentShell、共享导航与全站 UIUX/BUG 审查  
> 当前边界：量价走势（`VolumePrice.tsx`、`src/pages/volume/**`）已有部分布局实现，另有 codingagent 负责增补；本计划只记录现状缺口和兼容契约，不覆盖并行改动。

可直接分派给 coding agent 的任务编号和文件边界见：
`docs/plans/2026-11-02-coding-agent-task-manifest.md`。

本轮已落地：ForecastSnapshot 与结构化 `forecast_explain` 意图、历史观测 / 删失与预测分离、价格一周滞后、滚动 DOS、促销激励进销毛、竞品半衰期、有限因子 fit 回退、24 周 Demo / 104+8 周完整 Adapter 注册表、预测解释卡，以及量价走势极差 sticky 层和成本 / 销毛双轴独立时间轴。预测页“让 Agent 解释”已验证为单击即运行并返回可追溯结构化结果。自动化门槛已通过：`design:check`、`design:lint`、`typecheck`、`verify`（47/47）、全量测试（59 files / 572 tests）和生产构建；关键路由浏览器回归（forecast、volume、alerts、intelligence、config）当前无 console error/warn。剩余工作集中在真实数据接入、校准区间和 390/768 等多尺寸全站回归。

版本与存储口径见：[完整 Adapter 模拟数据规范](../PRICE-LENS-FORECAST-DEMO-DATA.md) 与 [模型配置与存储草案](../lifecycle-os-mvp/04-model-storage-schema.md)。当前 UI 的 canonical fixture 是 `simple-demo-v1`（R国 / 直营电商 / Pura 90 / USD / 24 周）；`simple-full-v1` 只用于完整 Adapter、拟合和验模。

## 1. 目标与完成定义

本轮工作不把目标定义成“页面能打开”或“测试保持绿色”，而是完成一条可核对的预测闭环：

```text
当前筛选范围
  → 可识别的数据集
  → 真实历史观测 / 删失标记
  → 有限因子和事件特征
  → 可解释的权重学习
  → 预测、库存、DOS、销毛和风险
  → Agent 使用同一份计算快照解释
  → 页面显示来源、样本、边界和下一步动作
```

完成条件：

- 预测页、Agent 和全局筛选不会出现两套范围或两套数字。
- 历史观测、模型估计、预测结果和模拟数据在数据结构与 UI 上明确分开。
- 价格、促销、竞品、基线四类因子可以在有足够历史样本时学习权重；样本不足时回退到先验并显示“待学习 / 证据不足”。
- 缺货周按删失观测处理，不把 SO 下降直接解释成需求下降。
- 预测区间、P50、置信度和因子状态只在有真实计算依据时显示。
- Agent 解释结果中的数字、范围、公式、模型版本与预测页完全一致。
- 全应用完成一轮可复现的 UIUX、响应式、可访问性、控制台和数据口径审查。
- 量价走势的四项新要求按现状复核：双主品横滚和单主品中性色基本已完成，极差 sticky / overlay 与成本销毛双 Y 轴 / 独立 X 轴仍需补齐。
- 跨页面 freshness 必须来自共享契约，或明确标注数据源：当前预警中心为 2026-W41、预测页为 2026-W42，不能让用户误读为同一批次。
- 配置页长列表需要可见分区导航、字段搜索和保存反馈；不能把超过数百个配置节点直接堆成长页面。

## 2. 当前基线与已知问题

当前基线是 `7f82875`，本轮审查范围为预测和 Agent 相关实现。工作树存在其他并行 WIP，执行时不得把无关改动误合并。

注意：交接文档的“全局筛选一致”验收条款与 `forecast-simple-v1` 固定 Demo 口径存在冲突。Phase 1 必须先拍平这条契约：Demo 阶段明确哪些字段只是全局上下文、哪些字段固定；真实 Adapter 阶段再要求数据结果与筛选联动，不能继续保留半联动状态。

交接文档原先引用已删除的旧测试路径 `pricelens/src/pages/__tests__/forecast.test.ts`，本轮已统一修正为 `pricelens/src/pages/forecast/__tests__/forecastModel.test.ts`；执行时仍需检查其他复制出来的任务说明，避免 coding agent 按不存在的文件排查。

### P1：必须先修

| 问题 | 当前证据 | 修复方向 |
| --- | --- | --- |
| 预测页“让 Agent 解释”未命中预测意图 | `ForecastPage.tsx:83` 发送“简单版预测”，`core.ts:145,372` 未匹配该词 | 使用结构化意图 `forecast_explain`，文字正则只作兼容；补浏览器级回归 |
| Agent 使用旧预测黑箱 | `core.ts:317-331` 固定 499 / 4600 / -1.85 / 7200 | Agent 读取当前页面的 `ForecastSnapshot`，禁止第二套预测常数 |
| 页面固定 Fixture 却显示全局筛选范围 | `ForecastPage.tsx:49-56,86-103` 与 `forecastFixture.ts:71-89` | 建立按 scope 选择的 dataset registry；无数据时显示明确空态，或锁定 Demo 范围 |
| “实际周”由同一模型生成 | `forecastModel.ts:295-345` 对所有周统一计算 | 增加 observed SO / stockout censoring；历史段读取观测值，模型只输出估计与未来值 |
| 因子标为“模型学习”但没有学习过程 | `forecastFixture.ts:109-149` 与固定参数 `forecastModel.ts:110-125` | 先改为先验/证据不足；随后接入 fit 结果、样本数、窗口、区间和版本 |
| 价格没有按规格延迟一周生效 | `forecastModel.ts:301-302` 直接使用当周价格 | 增加 `effectivePriceLagWeeks=1`，调价周测试必须验证下一周才变化 |
| 促销/激励成本未进入销毛 | `forecastModel.ts:318-345` 无 `incentive` 字段 | 增加激励输入，按净收入 → 单台销毛 → 周销毛计算 |
| 未实现的 P50 / 残差区间被写入 UI | `ForecastKpiStrip.tsx:14`、`ForecastChart.tsx:139`、`CalculationPath.tsx:90` | 统一改为“模型点估计”；真实校准后再显示 P10/P50/P90 |

### P2：P1 完成后处理

- 竞品“半衰期”字段的数学定义与 `exp(-age / halfLife)` 不一致；统一为真正半衰期或重命名为时间常数。
- 竞品上市窗口的“上市周 + 后续 N 周”边界需要统一并加入数值测试。
- DOS 改为滚动四周无约束需求，而不是当周需求。
- 周度主账补充 Sell-in 列，能够逐周复核库存恒等式。
- 货币从 `USD` 字面量扩展为通用货币类型；金额格式化由数据集决定。
- Fixture 日期、真实事实截止周和页面文案统一。
- 促销后透支、成本上调等主账脚注从事件配置派生，移除硬编码周次。
- 因子证据增加样本量、拟合窗口、数据状态、最新观测周和证据强度。
- 保留旧 `forecastAtPrice` / `rollingForecast` 的兼容 re-export，或完成仓内外引用迁移。
- PageHeader 与 ChartContentBar 的预测入口最终收敛为一个主入口；当前 `aria-current` 降级方案只作为过渡。
- Agent 主动预警缺失价格不能回退为 0；保留 `null` 并显示“— / 暂无价格”。
- Agent 结果动作使用结构化目标路由，不再依赖 prompt 是否包含“预测”等显示文案。
- Agent 停止运行时要补齐 `run.cancelled` 审计事件，再丢弃迟到响应。

## 3. 分阶段执行计划

### Phase 0：冻结基线、建立审查清单

**目标**：让后续改动可以归因、可回滚、可验证。

动作：

1. 记录当前提交、工作树状态、开发服务器地址和现有测试结果。
2. 把预测、Agent、共享壳、全站页面按路由建立审查矩阵。
3. 为每个问题登记：严重级别、复现路径、代码位置、目标行为、验收测试。
4. 量价走势外部 agent 进入后，先做三方 diff：基线、外部版本、当前工作树。

完成门槛：

- 无关 WIP 不被纳入修复提交。
- 所有 P1 都有明确的目标文件和验收测试。
- 量价走势未合并前不改动 `VolumePrice.tsx` 或 `src/pages/volume/**`。

### Phase 1：预测与 Agent 的口径收口

**目标**：先消除错误数字、错误意图和错误文案，不增加模型复杂度。

#### 1.1 统一 ForecastSnapshot

新增一个只读快照接口，建议放在 `pricelens/src/pages/forecast/forecastModel.ts` 或独立 `forecastSnapshot.ts`，并遵循 `04-model-storage-schema.md` 的版本化契约：

```ts
type ForecastSnapshot = {
  scope: {
    country: string;
    industry: string;
    channel: string;
    product: string;
    currency: string;
    range: string;
  };
  dataStatus: 'real' | 'simulated' | 'mixed';
  modelVersion: string;
  currentWeek: string;
  current: ComputedWeek;
  forecastWeeks: ComputedWeek[];
  factors: ForecastFactorSnapshot[];
  kpi: ForecastComputation['kpi'];
  scenario: ScenarioSummary;
  attemptId: string;
  contextFingerprint: string;
  schemaVersion: string;
};
```

`ForecastPage` 和 Agent 只消费这一份快照。Agent 不直接读取组件状态，也不重新维护价格、基线和供给常数。

#### 1.2 修正意图路由

把“解释当前简单版预测”改为结构化入口：

```ts
openAgent('full', {
  intent: 'forecast_explain',
  prompt: '解释当前简单版量价预测的关键假设、证据和风险',
  snapshot: forecastSnapshot,
});
```

如果当前 Agent API 只能接收文本，至少把提示词改成包含“量价预测”，并让 `isForecast` 匹配“简单版预测 / 预测假设 / 解释预测”。长期应废弃依赖正则的页面意图识别。

#### 1.3 删除伪精确表述

- `模型点估计（P50）` 改成 `模型点估计`。
- `历史残差带` 改成 `暂未校准预测区间`。
- `模型学习` 改成 `固定先验` 或 `待学习`。
- `实际周` 在模拟 Fixture 中改成 `历史段（模拟）`。
- 所有预测卡片显示数据状态和模型版本。

完成门槛：

- 从预测页点击 Agent 后，第一条结果必须是预测解释，而不是通用价格摘要。
- Agent 结果中的基准价格、需求、弹性、可供量与页面当前值一致。
- 页面不再出现没有字段支持的 P50、残差区间或已学习权重。

### Phase 2：数据契约与 Dataset Adapter

**目标**：从“模型生成历史”切换为“历史观测驱动模型”。

#### 2.1 输入契约

扩展 `ForecastInputWeek`：

```ts
type ForecastInputWeek = {
  week: string;
  date: string;
  status: 'history' | 'forecast';
  dataStatus: 'real' | 'simulated' | 'mixed';
  baseDemand?: number;
  observedSO?: number;
  soStatus?: 'observed' | 'censored' | 'missing';
  coveragePct?: number;
  available: number;
  supplyCap?: number;
  si: number;
  openingInventory?: number;
  inventoryEndObserved?: number;
  price: number;
  effectivePrice?: number;
  incentive: number;
  cost: number;
};
```

模型输出单独保存：

```ts
type ForecastOutputWeek = {
  modelDemand: number;
  unconstrainedDemand: number;
  forecastSO?: number;
  observedSO?: number;
  residual?: number;
  inventory: number;
  dos: number;
  weeklyGrossMargin: number;
};
```

#### 2.2 Adapter 与 Fixture

先建立 `forecastDatasetRegistry`，至少支持：

- 当前 24 周 Demo Fixture：明确为 `simulated`；
- 完整 104 周历史 + 8 周预测 Fixture：字段结构与真实接入一致；
- 当前国家 / 产品 / 渠道 / 币种无法匹配时的空数据状态。

验模 truth 字段只进入测试 adapter，不进入页面和 Agent 结果。

#### 2.3 删失处理

- `so_status=censored` 的周不能直接用于普通需求回归。
- 缺货周保留观测 SO 作为下界，并保留 `lostSales` 只供验模或区间估计。
- 数据覆盖不足时，学习结果回退到先验并显示原因。

完成门槛：

- 历史周能区分 observed SO、model demand 和 forecast SO。
- 缺货周不会被页面解释成需求下降。
- 切换 Fixture 不需要改动页面组件。

### Phase 3：有限因子权重学习

**目标**：实现用户最初要求的“给有限变量，AI 自己对比控制变量并学习权重”，同时保持可解释和可回退。

首期只学习四类因子，不增加因子数量：

1. 需求基线：趋势、季节、生命周期。
2. 价格响应：调价后一周生效的价格 kernel。
3. 促销响应：预热、活动期、活动后一周透支。
4. 竞品压力：上市事件、价格差和衰减 kernel。

建议的第一版可解释模型：

```text
log(demand_t)
  = baseline_t
  + β_price × price_kernel_t
  + β_promo × promo_kernel_t
  + β_competitor × competitor_kernel_t
  + seasonality_t
  + lifecycle_t
  + error_t
```

学习输出：

```ts
type LearnedParameter = {
  factor: string;
  coefficient: number;
  prior: number;
  sampleCount: number;
  effectiveWeeks: number;
  fitWindow: { start: string; end: string };
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  interval?: [number, number];
  modelVersion: string;
  fittedAt: string;
  exclusions: { censored: number; confounded: number; missing: number };
};
```

规则：

- 非缺货周优先用于拟合；缺货周单独处理。
- 价格与促销同周标记 `confounded=true`，不作为干净因果样本。
- 至少有 3 次独立促销、3 次独立调价和 2 次竞品事件后，才允许将对应因子标记为可学习。
- 样本不足、事件高度重叠或残差异常时回退到先验。
- 每次 fit 保存版本、时间、输入范围、排除行数和误差指标。

完成门槛：

- 每个因子都能显示“权重、样本数、拟合窗口、置信度、排除原因”。
- 修改一个因子只影响对应链路，供给仍然是成交约束，成本仍然只进利润链。
- 同一数据和版本重复拟合结果确定性一致。

### Phase 4：预测页产品化

**目标**：让业务用户能读懂模型，也能判断何时不该相信模型。

页面调整：

- 范围卡显示实际 Dataset scope；固定 Demo 只在明确锁定状态下展示。
- KPI 拆开“历史观测”和“未来预测”，不再把两者混成一个累计值。
- 图表增加 observed / model / forecast 的来源图例。
- What-if 只改未来周，显示“历史不变、未来草稿重算”。
- 因子证据增加样本数、窗口、拟合状态、数据状态和下一步补数建议。
- 计算路径显示价格滞后、促销成本、滚动 DOS 和库存删失处理。
- 主账补充 Sell-in、期初库存、期末库存和激励费用。
- 有 P10/P50/P90 时再绘制区间；无区间时保持点估计并明确原因。

可访问性与响应式：

- 图表始终有文字摘要和可滚动表格替代。
- 滑杆可键盘操作，改变值时通过 `aria-live` 提示结果摘要。
- 宽表只在局部横向滚动，页头和关键 KPI 不被裁切。
- `prefers-reduced-motion` 下不依赖动画传递状态。

完成门槛：

- 1440px、1024px、768px、390px 四个宽度通过截图审查。
- 预测页无横向页面溢出；表格溢出只发生在局部容器。
- 所有数字能展开到输入事实、公式、舍入、版本和数据状态。

### Phase 5：Agent 产品化与上下文一致性

**目标**：Agent 成为预测页的解释层，而不是另一个预测器。

实现顺序：

1. Agent 接收 `ContextSnapshot + ForecastSnapshot`。
2. 预测解释结果固定为：结论 → 事实 → 计算 / 规则 → 判断边界 → 动作。
3. 结果卡显示数据状态、模型版本、拟合窗口、样本数和证据链接。
4. What-if 解释必须明确是本地草稿，不写入真实数据。
5. 旧预测意图和旧常数全部移除，增加字符串级和浏览器级回归。
6. 预测数据不足时，Agent 给出“无法计算 / 需要补充哪些数据”，不回退成旧模型数字。

完成门槛：

- 预测页按钮、页头 Agent、快捷问题、自然语言追问都能进入同一意图处理器。
- 新旧请求并发时，旧结果不能覆盖新范围的结果。
- Agent 解释中的所有数值都能通过 `attemptId + contextFingerprint` 回到页面快照。

### Phase 6：全应用 UIUX 与 BUG 审查

**目标**：把预测修复扩展成一轮全站质量审查，而不是只修单页。

#### 路由审查矩阵

| 区域 | 主要入口 | 必查内容 |
| --- | --- | --- |
| 价格走势 | `Dashboard`、`PriceTrend/**` | 价格 / RRP 口径、缺采、窗口与粒度切换、极值卡、平台同步、Y 轴复位 |
| 量价走势 | `VolumePrice`、`pages/volume/**` | 双主产品宽度、极差卡占位、成本 / 销毛双 Y 轴、独立 X 轴、单主产品视觉层级 |
| 量价预测 | `ForecastPage`、`forecast/**` | 范围一致、历史 / 预测来源、学习证据、What-if、计算路径 |
| Agent | `AgentPanel`、`AgentContext`、`agent/**` | 意图命中、上下文、运行状态、失败恢复、引用、响应式、键盘操作 |
| 预警中心 | `AlertsPage`、`AlertCenter` | 规则与阈值、最新 / 历史分层、缺采、数据状态、回看板和 Agent 联动 |
| 情报中心 | `IntelligenceCenter` | 模拟数据标签、日期与范围、汇率区间、证据状态、空态 |
| 配置 | `Config`、`BenchmarkConfigBlock` | 保存 / 撤销、配置变更通知、上一代关系、竞品矩阵和读写边界 |
| 共享壳 | `App`、`PageHeader`、`FilterBar`、`ChartContentBar` | 入口唯一性、URL 同步、筛选持久化、窄屏换行、ARIA current、焦点环 |

#### 每个区域的审查步骤

1. 读取当前 scope、数据状态和上下文。
2. 以默认数据打开页面，记录首屏信息层级。
3. 改变国家、产业、产品、平台、币种、粒度和时间范围，检查结果是否真正变化。
4. 检查空数据、缺采、模拟、混合、错误、加载和极端长文本状态。
5. 以键盘操作所有入口、筛选器、图表交互、抽屉和 Agent 输入。
6. 在 1440 / 1024 / 768 / 390 宽度检查溢出、遮挡、固定宽度和局部滚动。
7. 检查浏览器 console：pageerror、404、antd deprecated API、未处理 Promise。
8. 检查每个数字是否能回到事实、公式、来源和数据版本。

审查输出分为：

- P0：崩溃、错误写入、数据串台、严重安全 / 权限问题。
- P1：用户会据此做出错误判断，或核心路径无法完成。
- P2：口径、可访问性、响应式和一致性缺陷。
- P3：呈现瑕疵、重构机会和维护成本。

每条问题必须包含：复现步骤、当前行为、期望行为、文件 / 行号、影响、修复建议、回归测试。

### Phase 7：量价走势外部 agent 合并审查

当前工作树已经包含一部分量价走势布局实现，因此 Phase 7 先按“现状复核 + 缺口补齐”执行；如果后续另有外部 agent 提交，仍需先做三方 diff，不覆盖现有行为契约。

1. 确认两个主产品并排时的最小可读宽度：当前局部横向滚动是已有实现，仍要在真实双主品和 390 / 768 宽度下验证不压缩到不可读。
2. 确认价格极差和销量极差位于图表顶部，并使用 sticky / overlay 行保持可见；当前已实现局部 sticky 层，仍需在真实双主品和窄屏验证遮挡与可读性。
3. 确认成本与销毛使用不同 Y 轴，成本 / 销毛图拥有独立 X 轴，并与主图的观察周联动；当前 `MarginCostBand` 已拆分左右轴和独立时间轴，仍需补齐拖选、键盘观察周和缺采回归。
4. 仅显示主产品时，移除品牌色的大面积背景和不必要图例；当前基本完成，需补单主品 / 空态 / 缺采回归。
5. 验证缺采、窄面板、拖选、键盘观察周、删除中间面板和切换平台时状态不串台。
6. 验证与预测、Agent、共享筛选器和离线构建无回归。

量价走势的兼容契约：

- 保留 `VolumePrice` 路由和现有时间同步 / 独立语义。
- 保留局部横向滚动，不把整个页面推宽。
- 成本和销毛仍显式标注模拟状态。
- 不使用品牌色作为通用 UI 状态色。
- 图表必须有文字摘要或明细表替代。

## 4. 测试与发布门槛

### 定向测试

- `forecastModel.test.ts`：观测 / 预测分离、供给删失、价格滞后、促销窗口、竞品半衰期、激励费用、滚动 DOS、确定性。
- `agent/core.test.ts`：预测意图、简单版解释、当前快照数值、旧请求隔离、无数据回复。
- 组件测试：ForecastPage、What-if、AgentPanel、共享导航和量价走势交互层。
- 数据 adapter 测试：字段完整性、缺失字段、状态传播、币种、日期、truth 字段剥离。

### 全量门槛

```bash
npm --prefix pricelens run design:check
npm --prefix pricelens run design:lint
npm --prefix pricelens run typecheck
npm --prefix pricelens run test
npm --prefix pricelens run verify
```

行为、数据或生成单文件改变时额外运行：

```bash
npm --prefix pricelens run check
```

浏览器验收至少覆盖：

- `?p=dashboard`
- `?p=volume`
- `?p=forecast`
- `?p=alerts`
- `?p=intelligence`
- `?p=config`
- Agent dock / drawer / full-screen
- 1440 / 1024 / 768 / 390 宽度

## 5. 推荐执行顺序与提交边界

建议每个阶段单独提交，避免把数据模型、页面视觉和共享壳混在一起：

1. `forecast:trust-copy-and-agent-intent`
2. `forecast:dataset-contract-and-adapter`
3. `forecast:learned-parameters`
4. `forecast:observed-vs-forecast-ui`
5. `agent:forecast-context-and-result-cards`
6. `audit:app-uiux-and-bugs`
7. `volume:external-agent-integration-review`

每个提交都必须说明：改动范围、未覆盖范围、测试结果和是否重建 `PriceLens.html`。量价走势外部版本未进入当前工作树前，不把第 7 项标记为完成。

## 6. 风险与回退策略

- 真实历史样本不足：保留先验，显示证据不足，不强行学习。
- 缺货比例过高：停止输出单点因果结论，切换为需求下界 / 区间说明。
- 竞品上市与促销高度混杂：输出方向性判断，不输出扩盘 / 分流结论。
- 全局筛选没有对应 Fixture：显示空态并解释覆盖范围，不偷偷使用 R国 Demo。
- Agent 服务异常：使用当前页面的本地快照解释，禁止回退旧硬编码预测器。
- 外部 volume agent 与当前共享状态冲突：先保留行为契约，解决 key、时间轴和筛选状态串台后再合并视觉。

