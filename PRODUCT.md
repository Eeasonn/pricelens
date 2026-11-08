# PriceLens · Product context

<!-- impeccable:product-schema 5 -->

> 用途：这是 PriceLens 的产品上下文文件，供设计、实现和审查工具（包括 Impeccable）理解产品边界、用户任务和可信度要求。它约束产品语义，不替代运行时视觉令牌。更新日期：2026-11-01。

## Platform: web

## Positioning / 产品定位

PriceLens 是华为海外终端品牌方使用的多国、多产业价格情报与量价分析工作台。它帮助用户看清“我司产品现在卖多少钱、相对 RRP 打了多少折、相对主要竞品处于什么水位、价格变化为什么发生，以及下一步应该核对什么”。

PriceLens 是一个统一产品版本：价格看板、量价分析、预测、情报中心、预警中心、配置和 PriceLens Agent 都在同一应用中。Agent 嵌入分析现场，负责自然语言查询、解释和编排；它不替代看板筛选、预警规则或人工判断。

产品气质是**克制、高密度、可扫描、证据优先的企业级价格决策工作台**。我司产品是视觉和叙事主角；竞品是参照系；每个数字都应能回答“所以该怎么办”，并能回到事实、规则或来源。

## Operating Context

PriceLens is an internal web workbench for Huawei overseas brand-side teams. Users typically work at a desktop while reviewing a country, industry, product, platform, and time scope, then move from a signal to a fact row, product page, or snapshot before deciding on a pricing action. The application serves both dense daily analysis and management summaries, so desktop scanability is primary while key values, status, and evidence remain understandable at narrower widths.

## 目标用户

| 角色 | 主要任务 | 需要得到的结果 |
| --- | --- | --- |
| 国家 / 产业负责人 | 快速掌握本国价格水位和异常 | 当前发生了什么、影响哪个产品、回看板核对 |
| 定价经理 | 判断调价、折扣和价格档位间距 | 当前水位、变化原因、规则触发、可比较的候选情景 |
| 渠道运营 | 处理平台价差和商品证据 | 哪个平台/哪一周有差异、商品页或快照证据 |
| 经营分析人员 | 比较价格和销量并解释波动 | 结论、事实、计算口径、覆盖范围和待核查项 |
| 管理者 | 快速获取经营摘要 | 范围明确的结论、风险、证据和下一步动作 |
| 数据 / 运营管理员 | 维护维度、匹配矩阵、店铺和规则 | 可审计的配置变化与数据状态 |

## 核心任务

用户通常沿着以下路径完成工作：

```text
发现异常或提出问题
  → 确认国家、产业、产品、平台、时间和价格口径
  → 查看折后价与 RRP、竞品水位、销量、促销和事件
  → 回到事实行、商品页或快照核对
  → 判断是否需要调价、订阅预警或继续分析
```

PriceLens 的核心任务包括：

- 查看价格走势：折后价为主、RRP 为参照，支持周 / 月 / 季和 USD / 本币。
- 比较我司与主要竞品：我司产品保持主视角，竞品按配置矩阵自动匹配并作为对照。
- 分析量价关系：并排查看价格与周销量；量价预测只展示可追溯的演示模型假设和区间。
- 解释价格变化：结合促销日历、促销深度、生命周期调价和市场情报。
- 处理预警：调价、折扣、平台价差、档位间距四类规则可订阅、查看和回到触发周。
- 获取证据：从摘要、图表、明细、商品链接或快照定位到可复核的事实。
- 使用 Agent：自然语言查询、澄清范围、解释预警、生成筛选预览、回看板和继续追问。

## 产品范围与入口

当前正式模块：

1. **价格走势**：多产品与多平台视图、折后价 / RRP、促销带、时间刷选、时点摘要和取证外链。
2. **量价走势**：价格与周销量联动，支持取价平台选择。
3. **量价预测**：价格情景、历史需求基准、供给上限和下一周可售销量区间；假设必须可追溯。
4. **情报中心**：汇率、新品、市场事件和可跟进的价格线索；演示数据必须显式标识。
5. **预警中心**：四类预警规则、阈值和订阅状态。
6. **配置**：竞品对标矩阵、上一代关系、参考汇率和默认店铺。
7. **PriceLens Agent**：页头「问 PriceLens」或 `⌘/Ctrl+K` 进入；默认只读，结果可追溯。

正式交付有三个入口，但共享同一源码和产品口径：

- 在线版：GitHub Pages；
- 单文件离线版：仓库根目录 `PriceLens.html`；
- 本地开发版：`http://localhost:5174`。

旧的独立 Copilot、录制、roadshow 和演示页面是历史素材，不是产品入口，也不能作为正式设计或交互基线。

## 业务边界

PriceLens 面向品牌方内部的价格操盘和经营分析，不是面向公众的比价平台。以下能力不属于产品范围：

- 全网低价导购、优惠券聚合、降价提醒、心愿单、价保赔付和销量排名；
- 自动改价、自动执行经营动作、自动修改竞品矩阵或无确认的阈值订阅；
- 无证据的业务因果结论，或虚构销量、收入、毛利、库存和履约影响；
- 开放网页搜索、任意 SQL / JavaScript / URL 执行，以及通用文档、邮件、日程或 IM 助手；
- 将规划中的成本、销毛、真实 SO、库存和履约能力当作当前已接入能力。

任何会写入筛选、订阅、阈值、情景或配置的动作，都必须先预览、确认、记录版本并支持撤销；默认路径始终是“先读取、后计算、最后写入”。

## 数据与可信度

### 数据范围

- 国家维表 29 国，当前启用 25 国；产业覆盖手机、平板、穿戴、音频、PC、IoT。
- 当前批次覆盖 557 个型号、1,253 个 SKU，时间范围为 2026-W19 至 2026-W45，共 27 周。
- 事实表包含 95,946 行周度平台价；默认产品、国家、平台和时间范围以应用当前状态为准。

## Evidence on Hand

- The repository contains the current React and TypeScript implementation, shared runtime tokens, chart models, tests, and the generated offline single-file build.
- The current data batch contains 29 countries in the dimension table, 25 enabled countries, 1,253 SKUs, and 95,946 weekly platform-price facts spanning 2026-W19 to 2026-W45.
- Existing product, UX, roadshow, and research documents are available as historical decision records. Roadshow and recording assets are evidence of exploration, not formal product entry points or visual authority.
- Evidence quality is incomplete by design: some intelligence and forecast surfaces are simulated or mixed and must carry an explicit status label. There are no approved customer testimonials or public consumer research materials in the current product evidence set.

### 价格口径

- **折后价**：平台实抓在架价，是主视图和默认主角；自动取价优先使用默认店铺 / 主店 / 默认平台。
- **RRP**：官方建议零售价，是参照口径；它从生命周期起点贯通到终点，并不等同于当前成交价。
- **Offer**：赠品、分期、平台券等文本权益，不计入价格、不画成价格线；使用琥珀语义表达关注。
- **缺采周**：不插值、不造点，只用虚线跨接；悬停、明细和取证仍显示真实状态。

### 可信度规则

每个结果都应明确数据状态、采集时间和覆盖范围：`real`（真实）、`simulated`（演示 / 模拟）或 `mixed`（混合）。真实资料须带来源名称和可访问链接；没有快照时明确显示“暂无快照”；数据不足时显示“无法计算”并说明可用范围。

每个派生数字必须能够展开为：

```text
输入事实点 → 筛选条件 → 计算公式 → 舍入 / 币种规则 → 输出
```

每条预警解释必须能够展开为：

```text
触发事件 → 当时规则与阈值 → 前后值 → 数据点与采集时间 → 证据
```

Agent 只负责理解、叙述和编排；数值卡片由本地确定性聚合引擎计算。历史解释应区分事实、可能原因、证据强度和待核查项，不能把相关性写成确定因果。未来结果必须写明假设、区间和置信度。

## 术语与口径

| 术语 | 约定含义 |
| --- | --- |
| 我司 | 华为 / HUAWEI；在图表、摘要和列表中始终为主视角 |
| 竞品 | 由配置级对标矩阵匹配的 Apple、Samsung 等品牌 / 型号；是参照系 |
| 折后价 | 平台在架成交价，默认价格口径 |
| RRP | 官方建议零售价，参照口径 |
| Offer | 非价格的文本权益，如赠品、分期、平台券 |
| 水位 | 我司与竞品在同一范围和口径下的价格相对位置 |
| 最近有价周 | 在当前筛选范围内仍有有效价格事实的最近时间桶；不能静默等同于自然月 |
| 自动取价 | 按默认店铺、主店、默认平台的优先级选取价格；规则必须可解释 |
| 缺采 | 当前时间桶没有有效采集值；不等于零价，也不等于可插值 |
| 数据状态 | `real`、`simulated`、`mixed` 三种状态，必须通过文字 badge 等方式显式表达 |
| 证据 | 事实行、快照、商品页、规则或来源链接；有状态和采集时间 |
| ContextSnapshot | 页面、筛选、图表焦点、数据 / 规则版本和 fingerprint 的统一上下文快照 |

涉及“最近”“最便宜”“当前价”“主竞品”等含糊表达时，Agent 应优先澄清时间定义、聚合方式、产品匹配和平台范围，不得静默猜测。

## Agent 约束

Agent 是嵌入 PriceLens 分析现场的只读优先副驾。每条回答采用固定顺序：

1. **结论**：一句话给出方向、范围和限制；
2. **事实**：数值、时间、平台、覆盖、来源和采集时间；
3. **计算 / 规则**：公式、阈值、数据版本和执行步骤；
4. **判断边界**：可能原因、证据强度和待核查项；
5. **动作**：回看板、定位周、查看证据、应用或继续追问。

Agent 运行过程可见但不展示模型内部推理。工具步骤只显示工具名、输入摘要、数据范围、输出摘要、耗时和错误信息。筛选、订阅、阈值和情景写入都必须经过用户确认，应用后可撤销；主动预警以消息 / 结果卡进入 Agent 消息流，不以强制抢焦的 toast 代替。

## Product Principles

- Evidence before inference: every conclusion exposes its facts, calculation, boundary, and next action.
- Huawei is the primary decision subject; competitors provide a stable comparison frame.
- Read first, calculate second, write last: any change to filters, subscriptions, thresholds, scenarios, or configuration requires preview, confirmation, versioning, and undo.
- Real, simulated, and mixed data remain visibly distinct; missing evidence is stated rather than decorated.
- The formal product shell stays restrained and dense. Experiments, historical roadshows, and recordings do not silently redefine it.

## Brand Commitments

- Preserve the Huawei-first hierarchy and stable chart identities across countries, industries, and time views.
- Keep the formal shell neutral, evidence-first, and free of gradients, glow, or an AI-only accent color.
- Use clear Chinese UI copy with concise labels, visible units, and explicit data status; avoid causal certainty when evidence supports only a hypothesis.

## 设计执行约束

- 正式视觉令牌的运行时唯一来源是 `pricelens/src/theme/tokens.ts`；设计文档中的 token 名称、组件和示例应与它保持一致。
- 视觉语言是白色卡片、页面浅灰底、1px hairline、低层级阴影、紧凑信息密度和 4 / 8 / 12 / 16px 间距节奏。
- 墨色用于主要操作和关键文字；蓝色用于链接、选中和正向参照；琥珀用于 Offer / 需要关注；红色用于错误或我司相对更贵。不要新增 AI 紫色、渐变或“智能程度”专属颜色。
- 我司线保持最强视觉层级；竞品线降存在感但仍可读。图表层预算优先给价格线，其次是可选促销背景带和 RRP 参照线；长文本下沉到摘要、tooltip、事件行或详情卡。
- Agent 与看板共用卡片、hairline、圆角、等宽数字和选中态；Agent 消息使用结论文字和结构化白卡，不另造一套聊天视觉。
- 真实、演示和混合状态不能只靠颜色区分；必须有文字 badge、来源或数据状态说明。图表必须有文字摘要或数据表替代，窄屏不能裁切关键数值。
- 交互必须支持键盘焦点、明确的可访问名称和状态；`prefers-reduced-motion` 下保留即时状态反馈而不依赖动画。

## 实现与维护约定

- `PRODUCT.md`：产品受众、任务、边界、术语和可信度上下文。
- `DESIGN.md`：正式设计系统、组件规则、token 解释、Do / Don’t 和审查基线。
- `.impeccable/surfaces/*.md`：页面或复杂模块的局部设计决策。
- `pricelens/src/theme/tokens.ts`：运行时 token 的唯一真源；不要在组件中新增散落硬编码。
- `PriceLens-产品说明.md`：产品模块、数据批次和交付形态的业务基线。
- `PriceLens-UX需求文档.md`：交互原则、已定稿页面决策和历史迭代记录。
- Agent 规划文档：`docs/Price-Agent-优化规划-2026-11-01.md` 与 `docs/情报中心与Agent视觉对齐设计-2026-10-31.md`。

当来源之间冲突时，优先级为：用户当前明确决策 → `PriceLens-产品说明.md` 的统一版口径 → 当前实现和测试契约 → 本文件的产品上下文 → 历史原型、roadshow 和演示文档。历史记录只用于理解决策背景，不能作为新的产品入口或视觉规范。

