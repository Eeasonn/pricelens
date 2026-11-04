# ForecastPage v2「量价参考产品」卡作业化重设计

> 日期：2026-11-04  
> 交付性质：纯设计文档，不包含源码、测试或配置改动。  
> 目标文件：`ReferencePanel.tsx` / `ReferenceVolumeChart.tsx` / `ReferenceEventComposer.tsx` 及其页面接线。  
> 界面模式：**Operate**。优先级是事实可核对、作业可恢复、操作可撤销，而不是增加视觉表现力。

## 0. 方案结论

采用“**统一有效事件视图 + 独立参考工作区 + 每面板独立时间窗**”：

1. 卡标题改为「量价参考产品」，卡头只保留「仅历史」「模拟历史」两个必要状态标。
2. 删除底部共享时间轨，每张参考图下设置自己的时间轨；默认仍看各自全生命周期，支持可选的同周龄同步与单面板锁定。
3. fixture 永不原地修改。预标事件通过 `override` 覆盖，补录事件通过独立 `composed` 记录保存，两者汇总为同一个 `EffectiveReferenceEvent` 供图表、名录、编辑器和读数使用。
4. 事件由单周升级为闭区间 `[startWeek, endWeek]`，起止周下拉与图上拖选等价；时长由区间派生。可选的参考幅度、影响时长、衰减只作历史标注，绝不送入模型。
5. 本地草稿升级为 `localStorage` 持久化，刷新、切页、关闭页签后均可恢复；未提交的编辑器内容也可恢复。所有保存、删除、恢复预标均有版本与撤销。
6. 颜色提升到事件类型库，不再从弹层组件导出固定映射。默认同主图语义，允许自定义；参考卡配色不反写主图。
7. 名录与图锚共用选中态；时段事件在图顶事件轨显示范围，点击后呈现“事件时段读数”。读数只从本参考产品量价事实计算，不使用 fixture 的预标影响值冒充实测。

**本方案没有红线变更建议。** 不增加预测段，不改变 `prevGenReferenceId` 主链语义，不让补录或预标覆写进入 `WorkbenchParams` / `computeWorkbench`，不引入新 UI 框架。

---

## 1. 事实基线与现状问题

### 1.1 必须保持的产品与视觉边界

- 本卡应是历史参照层，纯历史、无预测段；上一代参照进入主链，友商仅对照，这一页面结构已有明确约定（`pricelens/.impeccable/surfaces/forecast-workbench-v2.md:13-18`）。
- 主链实际使用 `params.prevGenReferenceId`，比值是 `selected.points[i] / default.points[i]`，并乘入预测周基线；友商 id 或缺数会回退为不修正（`pricelens/src/pages/forecast/workbenchModel.ts:330-365`、`pricelens/src/pages/forecast/workbenchModel.ts:379-391`）。因此，本卡的窗口、事件和颜色状态都不能成为第二个主链输入源。
- 缺采周不造 0、不插值，派生数字必须能回到事实与公式，相关性不得写成因果（`PRODUCT.md:101-124`）。
- 图上只放数据与控件；长解释应下沉到 tooltip、事件行或详情（`pricelens/DESIGN.md:195-199`）。时间轨继续使用 `trackColors`，控件继续使用既有圆角、间距和选中色（`pricelens/src/theme/tokens.ts:92-97`、`pricelens/src/theme/tokens.ts:120-136`）。

### 1.2 当前实现事实

| 现状 | 代码证据 | 设计判断 |
|---|---|---|
| 卡头标题与长 hint 同时存在 | `pricelens/src/pages/forecast/ReferencePanel.tsx:701-716` | 标题泛化，长 hint 删除。 |
| 底部一条 `SharedTimeTrack` 控制所有面板 | `pricelens/src/pages/forecast/ReferencePanel.tsx:122-126`、`pricelens/src/pages/forecast/ReferencePanel.tsx:576-597`、`pricelens/src/pages/forecast/ReferencePanel.tsx:878-880` | 改为每面板自己的域和窗口。 |
| 全域长度取参考池最大长度 | `pricelens/src/pages/forecast/ReferencePanel.tsx:577-580` | 共享域会让短序列面板出现无效尾部；新窗口按各自 `points.length` 钳制。 |
| 默认窗口是全生命周期，最小 8 周 | `pricelens/src/pages/forecast/ReferencePanel.tsx:49-54`、`pricelens/src/pages/forecast/ReferencePanel.tsx:581-592` | 保留这两个已建立口径。 |
| 补录只存卡内 state，刷新即清 | `pricelens/src/pages/forecast/ReferencePanel.tsx:599-635` | 不满足连续作业，升级为独立本地工作区。 |
| 补录只有 `type / week / note` | `pricelens/src/pages/forecast/ReferenceEventComposer.tsx:18-39` | 升级起止周、标题、说明和可选参考影响标注。 |
| 预标来自 fixture，只有 `week / type / label / impactPct / impactWeeks` | `pricelens/src/pages/forecast/workbenchFixture.ts:89-99` | 需要稳定 id 和本地覆写层。 |
| 预标与补录以复合 key 或自增 id 识别 | `pricelens/src/pages/forecast/ReferenceVolumeChart.tsx:164-186`、`pricelens/src/pages/forecast/ReferencePanel.tsx:624-627` | 预标 `type + week` 可能碰撞；自增 id 刷新后也会重号，均需更换。 |
| 预标在名录只读，补录只有删除按钮 | `pricelens/src/pages/forecast/ReferencePanel.tsx:446-484` | 两类统一编辑入口，预标另提供“恢复预标”。 |
| 图例是解释性长标签 | `pricelens/src/pages/forecast/ReferenceVolumeChart.tsx:222-227` | 改为「销量 / 价格 / 档期 / 事件」。 |
| 事件锚只有 SVG `<title>`，事件层 `pointerEvents: none`，指针由 `PointerShield` 接管 | `pricelens/src/pages/forecast/ReferenceVolumeChart.tsx:303-334`、`pricelens/src/pages/forecast/ReferenceVolumeChart.tsx:376-400` | 当前不能可靠地点锚定位名录，需要统一选中模型。 |
| `PointerShield` 已支持按下、拖动、松手提交区间 | `pricelens/src/pages/volume/PointerShield.tsx:48-95` | 图上拖选时段可复用同一交互，不必新增框架。 |
| 时间轨键盘可调，量价页也有每面板独立轨道范式 | `pricelens/src/pages/volume/PanelTimeTrack.tsx:44-54`、`pricelens/src/pages/volume/PanelTimeTrack.tsx:210-237` | 视觉和键盘行为复用，生命周期 W 标签单独适配。 |
| 页面主链草稿使用 `sessionStorage`，页签关闭即弃 | `pricelens/src/pages/forecast/useWorkbenchParams.ts:1-8`、`pricelens/src/state/usePageViewState.ts:54-72` | 时间窗可复用会话视图态；事件作业草稿不能复用其会话生命周期。 |
| fixture 影响值定义为“对同类主品的对应情境影响” | `pricelens/src/pages/forecast/workbenchFixture.ts:89-99` | 它不是本参考产品自身事件实测，必须与图内计算读数分栏。 |
| 行业事件四件套是起周、时长、幅度、衰减 | `pricelens/src/pages/forecast/workbenchFixture.ts:37-49` | 本卡借用同语言，但不复用会进入推演的 `MarketEventSeed`。 |
| 主图产品小事件目前仍是单周、幅度、回放 id | `pricelens/src/pages/forecast/workbenchFixture.ts:51-63` | “起止周 + 时长 + 幅度 + 衰减”并非当前所有主图事件的统一类型；本方案不改这两类主链模型。 |

### 1.3 主动发现、原需求未点名的问题

1. **轴位置与注释不一致。** 注释和图无障碍名声称“左量右价”（`pricelens/src/pages/forecast/ReferenceVolumeChart.tsx:5-11`、`pricelens/src/pages/forecast/ReferenceVolumeChart.tsx:303-307`），但价格刻度实际画在 `GRID_L - 6` 的左侧（`pricelens/src/pages/forecast/ReferenceVolumeChart.tsx:263-275`），量轴则位于 `plotLeft + plotWidth + 10` 的右侧（`pricelens/src/pages/volume/VolumeBars.tsx:171-180`、`pricelens/src/pages/volume/VolumeBars.tsx:213-225`）。新设计落实为**左量右价**，不能只改文案。
2. **价格缺数类型不诚实。** 图表已按可空价格处理（`pricelens/src/pages/forecast/ReferenceVolumeChart.tsx:135-147`），测试也构造空价格，但 fixture 类型是 `number[]`（`pricelens/src/pages/forecast/workbenchFixture.ts:117-120`）。应改为 `Array<number | null>`。
3. **智能提示并不真正按事件类型或周龄匹配。** 当前只筛有影响值的事件，再优先促销，每面板取一条（`pricelens/src/pages/forecast/ReferencePanel.tsx:73-83`）；`weekLabel` 只用于展示（`pricelens/src/pages/forecast/ReferencePanel.tsx:740-743`）。新方案不得再把这些条目称为精准的“类似时间”。
4. **8 秒自动消失不利于核对。** 当前提示条 8 秒关闭（`pricelens/src/pages/forecast/ReferencePanel.tsx:669-673`）。作业中应改为保留至手动关闭或下一信号替换。
5. **区间读数实际取首个/末个有效点，但界面只显示所选端点周。** 代码会回退有效点（`pricelens/src/pages/forecast/ReferenceVolumeChart.tsx:192-216`）。新读数必须标出实际参与计算的周，避免误以为就是端点值。
6. **独立窗口会放大跨图斜率误读。** 每张图当前按各自窗口价格极值缩放（`pricelens/src/pages/forecast/ReferenceVolumeChart.tsx:135-148`）。同步时间不等于同步纵轴，方案需明确“跨面板读数值，不直接比较线斜率”。
7. **删除面板与删除草稿是不同动作。** 当前补录按产品 id 保留，删面板只隐藏（`pricelens/src/pages/forecast/ReferencePanel.tsx:559-574`）。新方案保留这一点，避免误删作业。

---

## 2. 总体信息架构与方案取舍

### 2.1 推荐结构

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 量价参考产品                                             [仅历史] [模拟历史] │
├──────────────────────────────────────────────────────────────────────────────┤
│ [参考回放……（仅有信号时出现）]                                                │
│ [☐ 同周龄同步]                                  [事件类型] [＋ 添加参考]      │
│ ┌───────────────────────────────┐  ┌───────────────────────────────┐         │
│ │ ● Mate 80  [主链 · 同周龄校正]│  │ ● Galaxy S25       [仅对照]   │         │
│ │ [草稿 2]          [＋事件] [×]│  │                   [＋事件] [×]│         │
│ │ 事件轨：  □────□      □       │  │ 事件轨：  □  □────□           │         │
│ │ 销量柱 + 价格线 + 档期带       │  │ 销量柱 + 价格线 + 档期带       │         │
│ │ W1 … W52        销量 / 价格 / 档期 / 事件                               │         │
│ │ W1–W52  [────●════════●────] [锁定]│  │ W1–W52 [────●════════●────] [解锁]│         │
│ │ 事件 3                                             展开全部 ↓     │         │
│ │ W23–W26 618 档期脉冲  [预标·已改] [读数] [编辑]                  │         │
│ │ W35 Pura 90 上市挤兑  [预标]       [读数] [编辑]                  │         │
│ │ W45–W48 店庆补贴      [草稿]       [读数] [编辑] [×]              │         │
│ │ 首预测周 W45 · 同周龄比值 ×0.89（仅主链面板）                     │         │
│ └───────────────────────────────┘  └───────────────────────────────┘         │
│ 横向滚动：>2 面板仍保持每格约半屏宽，不再共享底部时间轨                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

结构原则：

- **卡级工具只管理多面板与同步方式**；窗口是图级视图，不与数据范围混为一谈。该区分符合“筛选回答看什么数据、图表控件回答如何看”的规范（`pricelens/DESIGN.md:167-173`）。
- **面板头只保留身份、主链语义、草稿状态和动作**。不再常驻解释性 chip。
- **图顶新增轻量事件轨**，不是新的数据系列；价格线和量柱仍是主层。
- **图下顺序固定为图例 → 本面板时间轨 → 事件名录 → 主链实际读数**，避免底部共享控件与面板列脱节。
- ≤2 面板均分、>2 横向滚动的既有策略不变（`pricelens/src/pages/forecast/ReferencePanel.tsx:693-699`）。

### 2.2 三种实现方向的取舍

| 方向 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| A. 在现有 state 上继续加字段 | 改动表面较小 | fixture、补录、颜色、历史记录继续分散，撤销与恢复难保证 | 不选 |
| **B. 统一有效事件视图 + 独立工作区** | 图、名录、编辑、读数同一数据源；主链完全隔离；可测试纯函数 | 需要一次领域模型整理 | **推荐** |
| C. 把事件、窗口全部放进 `WorkbenchParams` | 复用页面草稿 | 会把解释性草稿混入主链参数，扩大归一化与模型契约，违背红线 | 禁止 |

---

## 3. 六个必答题的具体设计

### 3.1 必答 1：卡标题改为「量价参考产品」

- `SectionHead title` 唯一改为 **「量价参考产品」**，替换当前「上一代上市同期 / 友商同期量价」（现值见 `ReferencePanel.tsx:703-705`）。
- 不再加副标题。产品角色由每个面板的「主链 · 同周龄校正」「仅对照」表达，不在卡名中枚举。
- 「仅历史」和「模拟历史」保留，因为它们分别承担无预测段与数据状态标识，不属于解释性废话；模拟状态必须有文字标的依据见 `PRODUCT.md:108-110`。

### 3.2 必答 2：每面板独立、可调的时间窗

#### 承载位置与控件

删除 `SharedTimeTrack` 及其底部实例，把轨道放进每个 `ReferenceChartCard`，位于图例下、事件名录上。新组件暂名 `ReferenceTimeTrack`：

```text
  W1–W52   全周期 ▾    [──────●══════════════════●──────]   [锁]
                            起点      整段平移       终点

  全周期 ▾ = 全周期 / 最近 16 周 / 当前事件窗（有选中事件时）
  拖柄     = 缩放；选中段 = 平移；←/→ = 1 周；Shift+←/→ = 4 周
  锁       = 锁定本面板窗口，禁止同步和定位改写；再次点击才可手动调整
```

- 轨道视觉复用 `trackColors`、20px 高轨道、52px 含标签总高、两端拖柄和键盘语义，对齐现有 `PanelTimeTrack`（`pricelens/src/pages/volume/PanelTimeTrack.tsx:165-237`）。
- 刻度是相对周龄 `W1…W末周`，不是自然年周。不能硬套日历 `axisTickPlan`；沿用当前生命周期的例外约定（`pricelens/.impeccable/surfaces/forecast-reference-panels.md:63-67`）。
- 每个面板的可调域为 `[0, product.points.length - 1]`；最短 8 周。产品不足 8 周时显示全长并禁用缩放，但仍可选事件。

#### 默认窗与持久化

- **默认窗 = 该产品全生命周期**，与当前默认一致；不擅自把用户首次看到的范围缩成 16 周。
- 新加面板也先显示自身全周期；从事件或回放进入时用当前 `FOCUS_SPAN = 16` 聚焦，事件居中并保证完整起止范围可见（现常量见 `ReferencePanel.tsx:51-52`）。
- `panelIds`、各面板窗口、同步开关、锁定状态存入会话视图态 `forecast.referenceView.<scopeKey>`，复用 `usePageViewState`，切页和刷新恢复，页签关闭可清空。
- 悬停、拖动中区间、打开的菜单等瞬态不持久化。

#### 同步与锁定策略

- 卡级「同周龄同步」**默认关闭**，确保每面板真正独立。
- 开启时，以正在操作的面板为本次来源，把相同的**数值周龄** `[s, e]` 应用到其他未锁定面板；各面板按自身长度和最小窗口钳制。同步的是周龄，不是日历日期，也不是纵轴。
- 任一未锁定面板都可驱动同步，不设置隐藏的唯一主面板。
- 关闭同步时保留各面板当前窗口，之后各自调整。
- 单面板锁定后，其轨道和窗口预设禁用；同步、回放定位、名录定位均不得改写它。锁定状态要有锁图标、`aria-pressed` 和文字 title，不能只靠颜色。
- 事件定位在同步开启时只移动未锁定面板；全锁定时不移动窗口，只展开事件详情。

#### 与「同周龄对比」的关系

- 窗口只决定**查看哪些历史事实**，不裁剪 `prevGenPool` 的模型输入，也不重算同周龄比值。
- 主链仍由 `ForecastPage` 的 `params.prevGenReferenceId` 受控写入（`pricelens/src/pages/ForecastPage.tsx:355-363`）。本卡不得新增“以当前窗口校正”之类的动作。
- 主链徽标固定写「主链 · 同周龄校正」；实际模型读数固定写「首预测周 W45 · 同周龄比值 ×…」，其内容继续来自 `result.weeks[].consider`，卡内不另算（当前来源见 `ReferencePanel.tsx:686-691`）。

### 3.3 必答 3：预标与补录都可编辑，fixture 采用覆写层

#### 可编辑字段

| 字段 | 预标 | 补录 | 规则 |
|---|---:|---:|---|
| 事件类型 | 可改 | 可改 | 从类型库选择；改名不丢历史 id。 |
| 起周、止周 | 可改 | 可改 | 0 基存储，UI 显示 W+1；闭区间，起周 ≤ 止周。 |
| 时长 | 派生 | 派生 | `endWeek - startWeek + 1`，不另存一份可漂移的事件时长。 |
| 标题 | 可改 `label` | 可改 `label` | 名录主标题，必填，≤40 字。 |
| 说明 | 可新增/改 `note` | 可改 `note` | 记录“发生了什么、为什么”；保存时去首尾空白，≤200 字。 |
| 参考幅度 | 可改 | 选填 | 百分比；仅历史参考标注，不进模型。 |
| 参考影响时长 | 可改 | 选填 | 正整数周；允许与事件发生区间不同。 |
| 衰减 | 新增可选 | 选填 | `递减 / 恒定 / 未标`；旧 fixture 缺省迁移为「未标」。 |
| 删除 | 不物理删除 | 可删 | 预标只能覆写和恢复，避免把事实源“删没”；补录删除走软删除与撤销。 |
| 恢复 | 恢复预标 | 不适用 | 删除该事件的 override，回到当前 fixture 原值。 |

说明：当前补录要求说明必填（`ReferenceEventComposer.tsx:90-100`）。新模型把短 `label` 作为名录必填项，`note` 仍必填，以保留作业原因；预标 fixture 没有 `note` 时初始为空，但首次保存预标覆写也必须补齐。

#### 覆写模型

```text
当前 fixture 预标（只读）
        + 该 sourceEventId 的本地 override.patch
        = 有效预标事件（EffectiveReferenceEvent）

本地补录 composed（未软删除）
        = 有效补录事件（EffectiveReferenceEvent）

有效预标 + 有效补录
        → 图表事件轨 / 名录 / 编辑器 / 参考回放 / 时段读数
```

- 给每条 `LifecycleEventSeed` 增加稳定 `id`；override 使用 `productId + sourceEventId`，**不使用可编辑的周、类型或标题作 key**。
- override 保存 `baseFingerprint`。fixture 更新后若原预标已变，名录标「源已更新」，让用户选择“采用新预标”或“保留我的覆写”；不静默覆盖。
- 删除面板不删除 override 或补录；重新添加同产品后恢复显示。
- 覆写只改变本卡有效视图。`computeWorkbench` 继续读取原 fixture 和原主链参数，二者在数据流上隔离。

#### 编辑入口与撤销

- 名录每行提供「编辑」；图锚选中后详情浮层也提供「编辑」。
- 预标行显示「预标」，有 override 时显示「预标 · 已改」和「恢复」；补录显示「草稿」。
- 保存后生成新 `revision`，卡底出现轻量操作条：「已保存事件 · 撤销」。删除为「已删除事件 · 撤销」，恢复为「已恢复预标 · 撤销」。
- 撤销采用 before/after patch 重放，生成新 revision，不把整个工作区回滚到旧快照；避免撤销 A 时误删之后编辑的 B。
- 历史保留最近 20 个动作，刷新后仍可撤销；超出容量淘汰最旧记录。编辑器未提交内容不参与历史。

### 3.4 必答 4：事件支持时间段，起止周与图上拖选等价

#### 弹层

```text
┌ 新增事件 / 编辑事件                              [本地草稿] ┐
│ 类型  [竞品上市 ▾]                         [管理类型]       │
│ 起周  [W23 ▾]   止周 [W26 ▾]   时长 4 周                  │
│ [图上拖选]   已选 W23–W26                                   │
│ 标题  [618 档期脉冲                                      ] │
│ 说明  [平台补贴与档期降价叠加                            ] │
│ 参考读数（选填） ▾                                          │
│   幅度 [+42] %   影响时长 [4] 周   衰减 [未标 ▾]           │
│ 状态  已自动保存到本浏览器                                  │
│ [保存事件]  [收起]  [丢弃草稿]              [恢复预标]      │
└─────────────────────────────────────────────────────────────┘
```

- 起止周下拉覆盖该产品全部生命周期周，起周变化后若大于止周，止周自动跟到起周；止周不得早于起周。
- 单周是 `startWeek === endWeek` 的特例，时长恒显示 1 周，不再维护单周与时段两套数据。
- 「参考读数（选填）」默认收起，避免把历史补录误做成模型参数录入。其“影响时长”是参考标注字段，与事件区间时长分列，不能混写。
- 主按钮统一「保存事件」；「收起」保留未提交草稿，「丢弃草稿」需确认并支持撤销。

#### 图上拖选

1. 点击「图上拖选」，弹层暂时收起，面板顶出现操作条「拖选事件时段 · Esc 取消」。
2. 复用 `PointerShield` 的按下—拖动—松手能力；按下周为起点、松手周为终点，反向拖动时排序。
3. 拖动中只显示蓝色选区与 `W起–W止 · N 周`，不显示普通量价读数，避免两种选区语义并存。
4. 松手后回填起止周并恢复弹层，已填类型、标题、说明和参考读数不丢。
5. 单击等价于起止同周。`Esc` 或「取消拖选」返回弹层，不清空已填内容。
6. 键盘用户通过起止周下拉完成同样任务，不要求使用指针。

#### 与主图事件口径对齐

- 共用语言：**起周、止周、时长、幅度、衰减**，全部周粒度；本卡止周与时长换算为 `duration = end - start + 1`。
- 行业事件的现有存储是 `startWeek + durationWeeks + magnitudePct + decay`（`workbenchFixture.ts:37-49`）；本卡为了拖选直观存 `startWeek + endWeek`，在适配器提供同样的派生读法，不把本卡记录塞进 `MarketEventSeed`。
- 主图产品小事件当前是单周模型（`workbenchFixture.ts:51-63`）。是否把它也改成四件套属于另一项主链模型变更，**不在本方案内**。

### 3.5 必答 5：全部可见文案的保留 / 删除清单

原则：数据状态、主链语义、草稿保存状态、控件名称、错误和空态是有效文案；操作教程、重复解释、括号内的视觉描述删除。单位不能为追求裸标签而丢失（`pricelens/DESIGN.md:161-165`）。

#### A. 卡头、工具行与参考回放

| 位置 | 当前可见文案 | 处理 | 目标文案 / 理由 |
|---|---|---|---|
| 卡标题 | 上一代上市同期 / 友商同期量价 | 替换 | **量价参考产品** |
| 卡头 hint | “历史参照：参考面板可增删……刷新即清”整段（`ReferencePanel.tsx:705`） | **删除** | 操作由控件表达，状态由短标表达。 |
| 卡头状态 | 仅历史 | 保留 | 无预测段的必要状态。 |
| 卡头状态 | 模拟历史 | 保留 | 数据可信状态的必要标识。 |
| IoBar | “输入 参照产品全生命周期……／输出 上一代面板经……”（`ReferencePanel.tsx:718-721`） | **整行删除** | 与主链 chip、实际比值行、草稿标重复。 |
| 工具行说明 | “历史事件补录：为已发生的量价变化补记原因……”（`ReferencePanel.tsx:801-805`） | **删除** | 不再常驻教程。 |
| 添加按钮 | ＋ 添加参考 | 保留 | 控件。 |
| 添加菜单分组 | 上一代 · 进主链 / 友商 / 其他 · 对照 | 精简 | **上一代 · 主链** / **友商 · 对照**。 |
| 菜单空态 | 参考池为空 / 参考池产品已全部添加 | 精简 | **参考池为空** / **已全部添加**。 |
| 回放标题 | 我参考了这些产品 | 替换 | **参考回放**。 |
| 回放说明 | “主图录入产品事件／手动微调后，它们在类似时间的表现” | **删除** | 当前匹配并不支持这一精确承诺。 |
| 回放条目 | 产品 + 事件 + 影响值 | 保留但重排 | `Mate 80 · W23 · 618 档期脉冲`（未改预标仍是单周），预标影响放详情。 |
| 回放空态 | 当前参照产品无可回放的事件锚 | 精简 | **无可回放事件**。 |
| 回放关闭 | × | 保留 | 控件；不再 8 秒强制关闭。 |

#### B. 面板头、图表与名录

| 位置 | 当前可见文案 | 处理 | 目标文案 / 理由 |
|---|---|---|---|
| 产品名 | 如 Mate 80（上一代） | 保留 | 身份。 |
| 主链 chip | 进主链 · 基线校正 | 精简 | **主链 · 同周龄校正**。 |
| 对照 chip | 对照 · 不影响主图基线 | 精简 | **仅对照**。 |
| 常驻草稿 chip | 补录 · 会话内 | 删除并改条件显示 | 有本地事件/覆写时显示 **草稿 N**，无草稿不占位。 |
| 补录按钮 | ＋ 补录事件 | 精简 | **＋事件**。 |
| 删除面板 | × 删除 | 精简 | **×** 图标按钮；保留可访问名称与禁用原因 title。 |
| 点选提示 | 点击图上某周完成补录 / 取消补录 | 替换 | **拖选事件时段 · Esc 取消** / **取消**。 |
| 图例 | 周销（量柱）/ 价格（线 · 右轴 $）/ 档期带（琥珀）/ 事件锚（预标 / 补录） | 替换 | **销量 / 价格 / 档期 / 事件**。轴旁仍保留台、$ 单位。 |
| X 轴、档期名、价格/销量刻度 | Wn、618 档期、$899 等 | 保留 | 全是数据。 |
| 量轴状态 | 自动 / 手动 / 超出当前上限 | 保留 | 控件与异常状态，不是解释文案。 |
| 区间读数 | 区间 W… · N 周 / 价 / 量 | 保留并明确 | **事件时段读数**或**区间读数**；列实际参与计算的周。 |
| 缺数说明 | 缺数周 W13、W14 显示「—」，不计 0 | 精简 | **缺数 W13、W14 · 不计 0**。 |
| 空态 | 暂无可参照历史 | 保留 | 必要空态；同一区域只出现一次。 |
| 名录分组 | 预标 / 补录（会话内草稿） | 替换 | 不再按来源分两大段；统一按起周排序，每行用 **预标 / 预标 · 已改 / 草稿**。 |
| 预标影响 | `+42%×4 周` | 移入详情 | 标为 **预标参考 +42% · 4 周**，不与实测读数连写。 |
| 名录删除 | × | 保留 | 仅补录；预标改为「恢复」。 |
| 主链读数 | 主图基线校正 · 首预测周 W45：… | 精简 | **首预测周 W45 · 同周龄比值 ×…**。仅显示一处；主链面板不可见时才在卡底兜底。 |

#### C. 编辑器

| 当前可见文案 | 处理 | 目标文案 |
|---|---|---|
| 补录历史事件 | 按模式替换 | **新增事件 / 编辑事件** |
| 仅本次会话 · 历史补录 | 替换 | **本地草稿**；保存失败时改显 **未持久化**。 |
| 事件类型 / 事件周（生命周期周序） | 精简 | **类型 / 起周 / 止周**。 |
| 在图上点选 | 替换 | **图上拖选**。 |
| 已选 W…（上市起第…周） | 精简 | **W…–W… · N 周**。 |
| 说明（必填） | 精简 | **说明 \***。 |
| “如：对手首销促销压价” placeholder | 保留 | 是输入样例，不是常驻解释。 |
| 必须选择事件周：下拉选周或点击…… | 精简 | **请选择起止周**。 |
| 必须填写说明（发生了什么、为什么） | 精简 | **请填写说明**。 |
| 补录到图上 | 替换 | **保存事件**。 |
| 取消 | 按行为替换 | **收起**（保留草稿）与 **丢弃草稿**（显式清除）。 |

悬停 title 和 aria 文案不属于常驻视觉文案，但也要同步事实：不再写“刷新即清”“共享窗口”“点选单周”；图的无障碍名改为实际“左量右价”，并提供事件名录这一文字替代。

### 3.6 必答 6：事件类型颜色可自定义

#### 默认色与主图关系

| 内置类型 | 默认色 | 与主图关系 |
|---|---|---|
| 竞品上市 | `color.link` `#0070f3` | 同主图 `PRODUCT_EVENT_COLOR['competitor-launch']`（`MainForecastChart.tsx:54-63`）。 |
| 我司上市 | `color.link` `#0070f3` | 保留当前参考卡默认；与竞品上市仍由文字类型区分。 |
| 促销投放 | `color.warning` `#f5a623` | 同主图营销价促色系。 |
| 挤兑 | `color.ink` `#171717` | 同主图挤兑色系。 |
| 其他 | `color.mute` `#737373` | 保留当前默认。 |

- 默认只保证**同语义色系**，不要求参考卡与主图所有形状一致：主图是字母圆锚，参考卡是方形锚/时段轨。
- 自定义色是**参考卡类型库的本地显示配置**，不修改 `PRODUCT_EVENT_COLOR`，不改变主链事件或模型。P2 若要跨卡同步，必须另开决策，不能隐式反写。

#### 选择交互

```text
类型名  [促销投放________________]   顺序  [↑] [↓]
颜色    [■ 默认色板 ▾]  [#F5A623]  [原生取色器]   [恢复默认]
预览    ■ 促销投放   □────□ W23–W26
```

- P0 在事件编辑器的类型行提供当前色块入口，可完成内置类型改色与恢复默认；P1 再由完整「事件类型」管理器承接自定义类型、排序和引用管理，两个入口写同一类型库，不形成两套配置。
- 色板按钮展开 8 个预设色；也可通过原生 `input[type=color]` 与十六进制文本输入选任意色，不假设项目已有 ColorPicker。
- 默认 8 色建议新增语义 token `referenceEventPalette`：前四项取 `color.link / warning / ink / mute`，扩展项取现有扩展图表色板中的 `#0f766e`、`#be123c`、`#a16207`、`#0891b2`（扩展值来源见 `tokens.ts:55-66`）。实现时必须先在 `tokens.ts` 登记并在 `DESIGN.md` 说明，不在组件散落硬编码。
- 对比度不足、与量柱/价格品牌色过近时显示非阻断提醒；文字标签始终存在，颜色绝不单独承载类型或状态。
- 颜色按类型统一生效，不为单事件再设一套颜色，避免同类型多色失去识别意义。

#### 持久化范围

- 内置类型的颜色覆写、自定义类型及其颜色保存在浏览器级 `LPL3.config.referenceEventTypes`，跨预测工作区复用。
- 「恢复默认」只恢复当前类型；「恢复全部默认」需二次确认并支持撤销。
- 事件只存 `typeId`，不复制当前色值；调色后所有引用同步更新。被引用类型不允许直接硬删，避免历史事件失色。

---

## 4. 自由补全：面向连续作业的完整设计

### 4.1 草稿持久化与生命周期

#### 分层存储

| 状态 | 存储 | 生命周期 | 是否进主链 |
|---|---|---|---|
| 面板构成、独立窗口、同步/锁定 | `usePageViewState` → `sessionStorage` | 刷新、切页恢复；页签结束可清 | 否 |
| 已保存补录、预标覆写、软删除、撤销历史 | 新 `referenceWorkspaceStore` → `localStorage` | 刷新、页签/浏览器重启恢复；无自动过期 | **否** |
| 未提交的新增/编辑内容 | 同一工作区的 `editorDrafts` | 自动保存；下次点击事件按钮恢复，不自动抢开弹层 | **否** |
| 类型、颜色、排序 | `referenceEventTypeStore` → `localStorage` | 浏览器级长期配置 | 否 |
| 悬停、拖动中、弹层坐标 | 组件内存 | 离场即清 | 否 |

工作区键建议为 `LPL3.forecast.referenceWorkspace.<scopeHash>`；`scopeHash` 由 `modelVersion + country + industry + channel + product` 稳定序列化生成。当前工作台是固定样本（`pricelens/.impeccable/surfaces/forecast-workbench-v2.md:29-32`），仍需保留 scope，避免未来接入真实筛选后串草稿。

#### 生命周期

```text
打开新增/编辑
   │ 首次有效修改
   ▼
未提交 editorDraft ── 自动保存 ──► 收起/刷新/切页 ──► 「未完成」→ 点击恢复
   │ 保存事件                                      │ 丢弃（确认）
   ▼                                              ▼
有效本地草稿 + 新 revision + 可撤销             清除 editorDraft + 可撤销
   │ 编辑 / 删除 / 恢复预标
   ▼
新 revision；history 追加 before/after patch
   │ 清空本卡草稿（独立入口、二次确认）
   ▼
仅清当前 scope 的补录与覆写；类型库和主链参数不动
```

- 点击「重置基准」只执行现有 `resetParams`，**不自动清参考工作区**；参考草稿另有「清空本卡草稿」入口。
- 写入失败不能像现有配置工具一样完全静默（现有静默兜底见 `configStore.ts:21-36`）：本卡必须显示「未能保存到浏览器，仅当前页面有效」，同时保留内存态，允许重试。
- 读取时做 schema 校验与迁移；坏记录逐条隔离，不因一条坏事件拖垮整卡。`schemaVersion` 变化时先迁移，无法迁移的原始值保留在备份键，不直接销毁。
- P1 处理多页签 `storage` 事件；同事件冲突按 `revision / updatedAt` 提示，不做无提示的字段级乱合并。

### 4.2 事件类型库管理

卡级「事件类型」打开既有 Ant Design `Modal`，不引入新框架：

```text
┌ 事件类型                                             [＋新增类型] ┐
│ 排序  色   名称          来源      引用       操作               │
│  ↑↓   ■   竞品上市       内置       12        改名 / 改色         │
│  ↑↓   ■   促销投放       内置       8         改名 / 改色         │
│  ↑↓   ■   渠道补贴       自定义     3         改名 / 改色 / 删除  │
│  ↑↓   ■   物流扰动       自定义     0         改名 / 改色 / 删除  │
│ [恢复全部默认]                                  [取消] [保存]     │
└──────────────────────────────────────────────────────────────────┘
```

- 新增时生成稳定 `typeId = custom-<uuid>`，名称与 id 解耦；名称必填、去空白、同库不区分大小写查重，≤12 字。
- 内置类型允许改显示名和颜色，不允许删除；提供恢复默认。自定义类型可增删、改名、改色、排序。
- **删除规则**：引用数为 0 可删除并撤销；引用数 >0 时禁止硬删，显示引用数量并提供「查看引用」。P2 可增加“批量改型后删除”，不在 P0 隐式改历史事件。
- 排序只影响类型选择器、管理器和类型筛选顺序；事件名录始终按起周、止周、创建次序排序，避免类型排序破坏时间阅读。
- 编辑器内修改先存临时副本，点「保存」一次性提交；取消不改变当前图表。保存后生成配置 revision 并支持撤销。

### 4.3 事件与量价数据的联动读数

#### 选择行为

- 点击「读数」、事件锚或时段轨：将普通选区设为该事件 `[startWeek, endWeek]`，显示事件详情与「事件时段读数」。
- 若事件不在窗内，先按事件范围扩展到至少 `N` 周、至多全周期；通常用 16 周聚焦。锁定面板不改窗，只展开详情。
- 读数始终使用当前参考产品的 `points / pricePoints`，不使用 `impactPct` 计算，也不把预标值当作实测。

#### 推荐读数

以下是结构示意；尖括号均为运行时由事实点计算的值，不是预填结论。周段假设用户已把原单周预标改为 W23–W26。

```text
┌ W23–W26 · 618 档期脉冲                         [预标·已改] ┐
│ 事件时段 4 周 · 销量有效 <有效周>/4 · 价格有效 <有效周>/4    │
│ 销量  期内均周销 <均值> 台   较前 4 周 <变化率>              │
│ 价格  <期初有效周/价格> → <期末有效周/价格>  <变化率>        │
│ 计算  前段 <实际周段> · 均值比均值；端点取实际有效周          │
│ 预标参考  +42% · 4 周 · 未标衰减（仅预标，不参与上述计算）    │
│ 说明  平台补贴与档期降价叠加                                  │
│ [编辑] [恢复预标]                              [关闭]         │
└───────────────────────────────────────────────────────────────┘
```

确定性公式：

- `N = endWeek - startWeek + 1`。
- 事件期均周销 = 事件期有效销量之和 / 有效周数；前段默认取紧邻的等长区间 `[start-N, start-1]`，不足时取可用前缀并显示实际周段。
- 销量变化率 = `(事件期均周销 / 前段均周销 - 1) × 100%`；前段均值为 0 或任一侧有效周不足 2 周时显示「无法计算」，不得用 0 补周。
- 价格保留当前“区间内首个有效点 → 末个有效点”的方向，但必须同时显示两个实际有效周及其价格；首值为 0 时只显示绝对差，不显示百分比。
- 缺采保持缺失，覆盖率写为 `有效周 / 事件周`；不插值、不造 0，延续 `PRODUCT.md:103-106`。
- 标题只用「事件时段读数」「较前 N 周」，不写“事件导致”“事件贡献”。这只是共时与前后对比，不能证明因果。

### 4.4 名录与图锚的联动、过多事件收纳

#### 双向联动

- `hover` 名录行：对应锚/时段加粗，显示弱竖线；离开恢复。
- 点击名录行：设置 `selectedEventId`，打开详情并定位；再次点击关闭详情，不取消编辑草稿。
- 点击图锚/时段：设置同一 `selectedEventId`，名录滚动到该行并短暂强调；键盘 `Enter / Space` 等效。
- 编辑器保存后保持同一事件选中，避免用户丢失上下文；删除后选择下一最近事件，无事件则清空。
- 所有 hover 增强都有 click / focus 等价路径，不能只服务鼠标。

#### 名录收纳

- 默认显示按时间排序的前 3 条；底部「全部 N 条 / 收起」。若当前选中事件不在前 3 条，自动将其纳入可见集合。
- 提供「窗内」筛选 chip；默认关闭（显示全部），开启后仅保留与窗口相交的事件。窗外事件仍可一键定位。
- 超过 12 条时增加类型筛选与按标题搜索，不增加分页；局部滚动最大高度约 8 行，表头「事件 N」保持可见。
- 同名事件以 `id` 区分，编辑器和删除按钮的可访问名称包含周段与标题。

#### 图上收纳

- 单周沿用虚线 + 方形锚；时段在图顶事件轨画 `□────□`，只用低透明描边和起止短线，不再铺一条全高浓色带。
- 事件轨最多两条 lane；同周或重叠事件按起周分配 lane。第三条及以后聚合为 `+N`，点击打开只含这些事件的名录筛选。
- 时段与档期重叠时，档期仍是底层琥珀带，事件轨在其上方；文字只留在名录/详情，不挤进图内。
- 选中的时段允许加粗和显示端点周；非选中事件不显示长标题。

### 4.5 参考回放与页面接线的修正

- `ReferenceInputSignal` 增加可选 `eventType`。`ForecastPage` 对比前后 `params.productEvents`：新增时传新增项类型；删除时传 `undefined` 并回退通用回放，不能把删除后剩余数组的末项误当被删事件。现有接线只传 `kind / weekLabel`（`ForecastPage.tsx:137-164`）。
- 产品事件按明确映射筛选参考事件：`competitor-launch → competitor-launch`、`own-promo → promo`、`cannibalization → cannibalization`；手动微调无类型时展示当前有效事件，不声称“相似事件”。
- 多条候选按“与当前面板窗口中心的距离、起周、id”稳定排序，每面板最多 1 条；没有匹配则显示「无可回放事件」。
- 回放读取统一有效事件，因此预标覆写会反映；补录若参与回放必须带「草稿」标。它仍只是查看入口，不参与主链计算。
- 提示条不再 8 秒自动消失；下一信号替换或用户关闭。点击条目只定位目标面板及同步组中的未锁定面板。

### 4.6 状态、异常、可访问性与响应式

- **空参考池**：只保留一个「暂无可参照历史」空态，隐藏同步与事件类型之外的无意义面板控件。
- **产品无点**：保留面板身份和事件编辑入口；图区空态，时间轨禁用。
- **短序列**：不足 8 周显示全长，禁用缩放手柄，仍允许事件选择。
- **存储不可用**：显式「未持久化」状态与重试；内存操作不中断。
- **fixture 源更新**：预标显示「源已更新」，提供采用新源或保留覆写，不静默合并。
- **类型被禁用/配置损坏**：使用内置「其他」作为显示兜底并标「类型不可用」，编辑时要求另选类型；原 `typeId` 保留以便恢复配置。
- **删除面板**：只从视图移除，不清事件；主链回退逻辑保持现有行为（`ReferencePanel.tsx:559-573`）。
- **键盘**：时间轨、图锚、名录行、编辑、撤销、锁、同步全部可 Tab 到达；`Esc` 先退拖选，再关详情/弹层。
- **可访问名称**：周段、标题、来源、动作完整，例如「编辑事件 W23–W26 618 档期脉冲」。事件色彩都有文字类型。
- **减少动态效果**：选中、撤销和定位立即呈现，不做必要信息依赖的位移动画，遵循 `pricelens/DESIGN.md:175-179`。
- **窄屏**：继续 880px 局部横滚下限（`ReferencePanel.tsx:53-54`）；每面板自己的轨道随列滚动，不再出现底部共享轨与面板错位。

---

## 5. 状态与数据模型变更清单

以下是**类型草案**，用于规定职责和迁移边界，不是要求把解释性事件加入主链。

### 5.1 统一事件与影响标注

```ts
type ReferenceEventSource = 'fixture' | 'composed'
type ReferenceDecay = 'decreasing' | 'flat' | 'unspecified'

interface ReferenceImpactAnnotation {
  magnitudePct: number | null
  durationWeeks: number | null
  decay: ReferenceDecay
}

interface ReferenceEventEditableFields {
  typeId: string
  startWeek: number       // 0 基、闭区间
  endWeek: number         // 0 基、闭区间
  label: string
  note: string
  impact: ReferenceImpactAnnotation | null
}

interface EffectiveReferenceEvent extends ReferenceEventEditableFields {
  id: string
  productId: string
  source: ReferenceEventSource
  sourceEventId?: string  // fixture 预标的稳定 id
  overridden: boolean
  revision: number          // 未覆写预标为 0
  createdAt: string | null  // 纯 fixture 无本地时间；覆写/补录才有
  updatedAt: string | null
}
```

迁移旧预标：`startWeek = endWeek = week`，`label = label`，`note = ''`，旧 `impactPct / impactWeeks` 转入 `impact`，旧值没有衰减所以 `decay = 'unspecified'`。**不得**把旧 `impactWeeks` 自动变成事件 `endWeek`，因为旧字段描述的是对同类主品的参考影响，不是该事件在参考产品上的已发生区间。

### 5.2 fixture 与覆写

```ts
interface LifecycleEventSeed {
  id: string                    // 新增：稳定且产品内唯一
  week: number
  type: 'competitor-launch' | 'own-launch' | 'promo' | 'cannibalization'
  label: string
  impactPct?: number
  impactWeeks?: number
}

interface LifecycleProductSeed {
  // 其余字段不变
  pricePoints: Array<number | null>  // 由 number[] 修正
}

interface ReferenceEventOverride {
  id: string
  scopeKey: string
  productId: string
  sourceEventId: string
  baseFingerprint: string
  patch: Partial<ReferenceEventEditableFields>
  revision: number
  createdAt: string
  updatedAt: string
}
```

### 5.3 工作区、编辑器与历史

```ts
interface ComposedReferenceEvent extends ReferenceEventEditableFields {
  id: string                    // crypto UUID 或等效稳定唯一 id
  productId: string
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface ReferenceEditorDraft {
  id: string
  mode: 'create' | 'edit'
  productId: string
  eventId: string | null
  value: ReferenceEventEditableFields
  baseRevision: number | null
  updatedAt: string
}

interface ReferenceWorkspaceChange {
  composed?: Record<string, ComposedReferenceEvent | null>
  overrides?: Record<string, ReferenceEventOverride | null>
  editorDrafts?: Record<string, ReferenceEditorDraft | null>
}

interface ReferenceHistoryEntry {
  actionId: string
  action: 'create' | 'edit' | 'delete' | 'restore-preset' | 'discard-draft' | 'clear'
  targetId: string            // 单事件 id；clear 使用 scopeKey
  before: ReferenceWorkspaceChange
  after: ReferenceWorkspaceChange
  timestamp: string
}

interface ReferenceWorkspace {
  schemaVersion: 1
  scopeKey: string
  revision: number
  composed: Record<string, ComposedReferenceEvent>
  overrides: Record<string, ReferenceEventOverride>
  editorDrafts: Record<string, ReferenceEditorDraft>
  history: ReferenceHistoryEntry[]  // 上限 20
  updatedAt: string
}
```

### 5.4 时间视图与类型库

```ts
interface ReferenceViewState {
  panelIds: string[]
  windows: Record<string, [number, number]>
  syncAge: boolean
  lockedByProduct: Record<string, boolean>
}

interface ReferenceEventType {
  id: string
  label: string
  color: string
  origin: 'builtin' | 'custom'
  order: number
  updatedAt: string
}

interface ReferenceEventTypeLibrary {
  schemaVersion: 1
  revision: number
  types: ReferenceEventType[]
  updatedAt: string
}
```

### 5.5 纯函数边界

建议新增 `referenceEventModel.ts`，只放无副作用逻辑：

- `migratePresetEvent(product, event)`：旧 fixture → 统一字段。
- `mergeEffectiveEvents(product, composed, overrides)`：图、名录、编辑、回放唯一数据源。
- `clampReferenceWindow(product, window)`：独立窗口钳制。
- `rangeOfEvent(event)` / `durationOfEvent(event)`：闭区间和时长。
- `computeEventRangeReading(product, event)`：只读历史事实，返回输入周、有效覆盖、公式所需中间值。
- `sanitizeReferenceWorkspace(...)` / `migrateReferenceWorkspace(...)`：坏数据防御与版本迁移。
- `contrastHintOf(color)`：颜色提示，不影响模型。

`ReferencePanel` 负责编排，`ReferenceVolumeChart` 负责呈现和指针事件，`ReferenceEventComposer` 只负责受控编辑与校验，store 负责持久化。颜色、类型和有效事件类型不再从弹层组件反向导出，解除当前图表对 composer 的依赖（当前依赖见 `ReferenceVolumeChart.tsx:21-22`）。

---

## 6. 涉及文件与变更责任

| 文件 | 未来实现责任 |
|---|---|
| `pricelens/src/pages/forecast/ReferencePanel.tsx` | 改标题与文案；移除共享轨；每面板窗口/锁/同步；接入统一工作区；名录选中与撤销；保持主链回调原语义。 |
| `pricelens/src/pages/forecast/ReferenceVolumeChart.tsx` | 统一有效事件输入；单周锚与时段轨；图锚选择；拖选事件；事件读数；裸图例；修正左量右价。 |
| `pricelens/src/pages/forecast/ReferenceEventComposer.tsx` | 新增/编辑共用；起止周、标题、说明、可选参考标注；自动保存状态；不再拥有固定颜色映射。 |
| `pricelens/src/pages/forecast/referenceEventModel.ts`（新） | 上述类型、迁移、合并、窗口、读数、校验纯函数。 |
| `pricelens/src/pages/forecast/useReferenceWorkspace.ts`（新） | 工作区读写、自动保存、revision、软删除、20 步撤销、失败状态。 |
| `pricelens/src/pages/forecast/referenceEventTypeStore.ts`（新） | 浏览器级类型库、默认色、排序与配置迁移。 |
| `pricelens/src/pages/forecast/ReferenceTimeTrack.tsx`（新） | 生命周期 W 标签的每面板轨道；复用 `panWindow`、`trackColors` 和既有键盘行为。 |
| `pricelens/src/pages/forecast/ReferenceEventList.tsx`（新） | 统一名录、筛选、选中、编辑、恢复、删除和展开收纳。 |
| `pricelens/src/pages/forecast/ReferenceEventTypeManager.tsx`（新，P1） | 自定义类型增删改色排序。 |
| `pricelens/src/pages/forecast/workbenchFixture.ts` | 预标增加稳定 id；价格数组类型允许 null；旧事件值本身不为主链改写。 |
| `pricelens/src/pages/ForecastPage.tsx` | 回放信号可带 `eventType`；`prevGenReferenceId` 接线保持不变。 |
| `pricelens/src/pages/volume/VolumeBars.tsx` | 可选 `axisSide`，默认仍右轴以保护量价页；参考卡传左侧，配合价格刻度移右。 |
| `pricelens/src/theme/tokens.ts` | P0 登记 `referenceEventPalette` 以支持内置类型改色；其余复用现有 token。 |
| `pricelens/src/state/lplKeys.ts` | 登记工作区与类型库键；会话视图键继续由 `usePageViewState` 加前缀。 |
| `pricelens/src/state/usePageViewState.ts` | **不改**，只复用于窗口和面板视图。 |
| `pricelens/src/pages/forecast/workbenchModel.ts` / `useWorkbenchParams.ts` | **不改事件和窗口契约**；防止补录进入主链。 |
| 三个现有 `__tests__/Reference*.test.tsx` | 更新旧标题、共享轨、单周、会话即清和固定色断言；补独立窗口、覆写、持久化、撤销、时段、读数测试。 |
| `__tests__/referenceEventModel.test.ts` / `useReferenceWorkspace.test.ts`（新） | 纯函数、迁移、合并、缺数、存储失败与历史边界。 |
| `pricelens/.impeccable/surfaces/forecast-reference-panels.md` | 实现时更新局部正典，去除“共享时间轨、会话内、唯一差异补录”的旧决策。 |
| `pricelens/DESIGN.md` | 仅在新增事件色板 token 时补语义与使用边界。 |
| 根目录 `PriceLens.html` | 实现完成时由项目标准离线构建生成，不手改。 |

---

## 7. 分阶段落地与验收

### P0：六项必答 + 可恢复作业闭环

范围：

- 新标题与全部文案收敛；每面板独立时间窗、同步与锁。
- fixture 稳定 id、统一有效事件、预标覆写、补录编辑/删除、恢复预标。
- 起止周与图上拖选；单周/时段图锚；名录双向定位与基础收纳。
- `localStorage` 工作区、未提交草稿恢复、20 步撤销、保存失败提示。
- 内置类型颜色自定义与持久化；主图色不变。
- 基础事件时段读数、缺数纪律、左量右价修正。

验收标准：

1. 两个面板分别调成 `[W1,W16]`、`[W17,W32]` 后互不影响；刷新保持。开启同步后，调整任一未锁定面板，其他未锁定面板按同周龄钳制；锁定面板不动。
2. 在同步/非同步、窗口调整、事件定位前后，`prevGenReferenceId` 和相同输入下的 `computeWorkbench` 结果完全不变。
3. 编辑预标的类型、周段、标题、说明和参考标注后，图、名录、详情一致；恢复预标回到 fixture；fixture 原始对象未被修改。
4. 新增 W23–W26 事件，反向拖选也得到同一闭区间和 4 周时长；单击得到 1 周；键盘不拖图也能完成。
5. 刷新、切页、关闭再开页签后，已保存事件与未提交编辑草稿均可恢复；删除面板不删事件，重加可恢复。
6. 创建、编辑、删除、恢复预标均可撤销；连续编辑 A、B 后撤销 A 不清掉 B；history 最多 20 条。
7. 修改内置类型颜色后所有同类型事件同步变色，刷新保持；主图事件色与模型结果不变。
8. 图例仅「销量 / 价格 / 档期 / 事件」；卡头长 hint、IoBar、工具行教程和常驻会话 chip 均不存在；模拟与草稿状态仍有文字。
9. 事件读数展示实际输入周、有效覆盖和公式；预标 `impactPct` 不参与计算；全缺或前段无效时显示「无法计算」，不补 0。
10. 价格刻度在右、销量刻度在左；缺价类型与运行时一致；量价走势页默认轴侧不变。
11. 键盘可完成窗口、事件选择、编辑、保存、撤销；所有颜色状态有文字等价。

### P1：完整类型库与高密度事件治理

范围：自定义类型增删、改名、排序、引用检查；类型筛选与搜索；`+N` 图锚聚合；fixture 源更新冲突；多页签同步；参考回放按类型匹配。

验收标准：

1. 自定义类型可新增、改名、改色、排序、删除并撤销；被引用类型不能硬删且能看到引用数。
2. 20+ 事件、同周多事件和跨窗事件下，名录可搜索/筛选，图上最多两条 lane，`+N` 能回到准确事件集合。
3. fixture 同源事件发生变化时出现「源已更新」，用户选择前不覆盖本地覆写。
4. 两页签同时编辑不会静默串值；冲突有明确来源和时间，坏记录不会使整卡崩溃。
5. 产品事件回放按类型匹配，补录条目带「草稿」；无匹配时不伪造“类似时间”结论。

### P2：协作与进阶分析（不在本次核心承诺）

范围：服务端/账号级共享、草稿导入导出、批量改型后删除、可选共享纵轴、事件证据链接、是否跨卡同步类型色。

验收标准：

- 必须先有对应业务决策与数据契约；本地草稿向服务端迁移可撤销、可区分作者与版本。
- 共享纵轴开启/关闭都有明显状态，不与同周龄时间同步混为一谈。
- 任一扩展仍不自动写主链；若未来要让事件进入推演，必须另写“红线变更建议”、单独评审模型与证据规则。

未来实现的交接检查仍按项目约定执行：`npm --prefix pricelens run design:check`、`design:lint`、`typecheck`，以及行为/离线构建受影响时的 `npm --prefix pricelens run check`。本次只写设计文档，未执行这些命令。

---

## 8. 留给 Eason 拍板的开放问题

1. **草稿协作边界**：P0/P1 采用同浏览器 `localStorage` 是否足够？推荐先本地持久化，账号/多设备共享放 P2。
2. **“重置基准”是否应同时清参考工作区**：推荐不清；主链基准与解释性作业分开，参考卡提供独立清空入口。
3. **预标影响字段是否允许编辑**：本方案推荐允许，但只作为本地预标覆写，并永久标「预标参考」，绝不进入模型；若它应视为锁定证据，则需把幅度/时长/衰减改为只读。
4. **参考事件与主图产品事件的长期口径**：当前产品小事件仍为单周 + 幅度 + 回放 id。是否未来也升级为起止周 + 时长 + 幅度 + 衰减？这属于主链模型变更，本方案不代做。
5. **类型色是否需要跨参考卡与主图同步**：推荐当前只同步默认语义、不共享用户自定义值；若要求全局一致，需要独立配置契约。
6. **被引用自定义类型的删除策略**：推荐 P1 禁止硬删，P2 再提供“批量改型后删除”；是否接受这一保守策略？
7. **事件前后读数的比较基线**：推荐默认取紧邻等长前段并显示实际周；是否需要允许用户手选另一对照时段？
8. **未提交草稿恢复方式**：推荐刷新后只显示「未完成」，点击后恢复，不自动弹层抢焦；是否符合作业习惯？
9. **独立窗口下的纵轴**：推荐继续各图自动缩放，并明确不同步纵轴；若作业更重视跨图斜率比较，可在 P2 增加共享纵轴开关。

---

## 9. 完成定义（设计层）

本设计完成的判断不是“功能更多”，而是以下闭环成立：

```text
选择参考产品
  → 各自调整同周龄窗口（必要时同步/锁定）
  → 从图或名录选择已发生事件
  → 核对本参考产品真实量价读数与预标参考值
  → 新增/编辑/恢复事件并自动保存
  → 刷新后继续、误操作可撤销
  → 上一代选择仍按原接口进入主链，其他操作均不改变推演
```

只要任一事件编辑会改 fixture、任一补录会进入 `WorkbenchParams`、任一读数把预标影响当实测，或任一窗口调整会改主链比值，就视为越界，不予验收。
