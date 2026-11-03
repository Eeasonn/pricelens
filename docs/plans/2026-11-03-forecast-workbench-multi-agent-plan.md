# PriceLens 推演工作台生产化修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 日期：2026-11-03  
> 交付形态：多 Agent 并行开发交接方案  
> 审计基线：2026-11-03 量价预测页只读审计及浏览器证据  
> 正典：`pricelens/.impeccable/surfaces/forecast-workbench-v2.md`，但须先按本计划 WP0 同步最新拍板。

**Goal:** 在不接真实预测数据、不恢复已删除纪要层的前提下，修正推演链数值与状态错误，完成生产话术、BI 交互、会话草稿和窄屏可用性收口。

**Architecture:** `workbenchModel` 继续作为无副作用的确定性计算层；新增时间与参数恢复工具承载周历、季度、历史／预测边界和会话数据校验。页面组件只消费统一的 `WorkbenchParams / WorkbenchResult`，参考品选择通过参数进入主链；共享壳与会话状态最后由单一集成 Agent 接入，避免并行修改 `ForecastPage.tsx`。

**Tech Stack:** React 18、TypeScript、Ant Design 5、SVG、Vitest、Testing Library、Vite、现有 `tokens.ts` 与 `usePageViewState`。

**Spec:** `pricelens/.impeccable/surfaces/forecast-workbench-v2.md` + `PRODUCT.md` + `pricelens/DESIGN.md` + 本文件附录的审计追踪矩阵。

**后续路线图：** `docs/plans/2026-11-03-forecast-workbench-followup-roadmap.md`（R0–R6，不属于当前 WP0–WP7 的实施范围）。

## 1. Global Constraints

- 全程先读 `AGENTS.md`、`PRODUCT.md`、`pricelens/DESIGN.md`、`pricelens/src/theme/tokens.ts`、`docs/PRICE-LENS-DESIGN-HANDOFF.md`。
- 本轮继续使用 `workbenchFixture`；**真实 Adapter、真实筛选联动和 Agent 模型调用不在本轮范围内**。
- 所有模拟结果继续显式标识；页首保留一枚“模拟数据”，数据卡使用轻量“模拟／模拟历史”标识。
- UI 不得出现“因子 / 约束 / 置信区间 / 无约束需求 / 我司”；工程字段 `unconstrained` 可保留。
- 保留“AI 推测 · 可改 → 人工确认”信任语言；AI title 必须说明当前是本地确定性的“季节 × 趋势”规则基线。
- 保留手调原因必填；不恢复“推演纪要 / 生成纪要 / 另存情景”。
- 不恢复“不含库存限制”分叉线或差值着色；库存继续是刚性 `min`，不是 9 折／8 折。
- 预测层不加入品牌份额、Top6、ASP、领跌剔除；大盘只使用总量总线。
- 参考卡保持纯历史、无预测段、上一代居首；大盘只收行业级事件，主图只收产品级事件。
- 成本销毛保持链路末端、独立推测、不回写主图。
- DOS 继续用 70–90 天，库存降幅继续用 20%／30%；这些值尚未获业务核定，UI 用“阈值未核定”轻量状态，不在正文写“待拍板”。
- 所有颜色引用 tokens；组件内 rgba 透明度允许，禁止新增硬编码 hex。优先复用 `ChartToolbar`、`ChartContentBar`、`SuppLegend` 的既有语言。
- 不新增依赖，不另建浏览器测试框架，不改旧 `forecastModel.ts / forecastFixture.ts` 等 simple-v1 文件。
- 每个工作包先写失败测试，再做最小实现；不得为通过测试而改写既有正确契约。
- 本计划本身不要求执行 Git；实际执行时，各 Agent 仅在分配的 worktree／分支内提交，共享分支由集成 owner 统一处理。

## 2. 默认执行决策与边界

以下决策用于消除开发 Agent 的歧义：

1. **参考品联动默认只接“上一代参照”选择器。** 友商参照继续用于历史对照与事件回放，不直接改变主图基线。
2. 演示期的上一代联动采用相对默认参照的比值校正，默认 Mate 80 时比值恒为 1，因此现有基准金测不变：

   ```ts
   referenceRatio = selectedPrevGen.points[forecastIndex] / defaultPrevGen.points[forecastIndex]
   unconstrained = round(basePath[forecastIndex] * marketFactor * productEventFactor * referenceRatio)
   ```

   分母为 0、序列缺点或参照不存在时比值回退 1，并在考量说明中写“参照缺数，未修正”。该公式只属于当前演示模型；真实模型不得未经业务评审直接沿用。
3. **历史起周行业事件一律只作解释。** 即使时长跨入预测段，也不修正任何预测周。
4. 手调仍优先于库存结果；库存是否曾触发截断用独立字段 `supplyCapped` 保留，不因手调而丢失。
5. 预测页进入共享分析壳，但 fixture 阶段**不显示可误解为会联动数据的 FilterBar**；页内用紧凑范围行说明“固定样本 · 不随全局筛选联动”。
6. 会话草稿只存 `sessionStorage`，不写真实数据；本轮不开放生产写路径。
7. 成本图统一用 `$M`；库存与周销统一用“万台”，不再混用 `K`、`万$` 和 `$M` 表达同一量级。
8. “复制关键假设”只输出结构化文本，不恢复纪要页面，不新增导出中心。

## 3. 并行编排与文件锁

### 3.1 阶段图

```text
Phase 0  Coordinator：冻结契约、同步 brief、分配 worktree
    │
Phase 1  WP1 Core Model + Time + Params（唯一前置工作包）
    │
    ├── Phase 2A  WP2 大盘卡
    ├── Phase 2B  WP3 参考卡 + 事件弹窗
    ├── Phase 2C  WP4 库存卡
    └── Phase 2D  WP5 主图 + 成本卡
                   四个 Agent 可全并行
    │
Phase 3  WP6 Integration：ForecastPage / App 壳 / 文案 / 导航 / 导出 / 总装
    │
Phase 4  WP7 QA：全量门禁、浏览器矩阵、截图、缺陷回归
```

### 3.2 文件所有权

| 工作包 | 独占文件 | 禁止修改 |
|---|---|---|
| WP0 Coordinator | `pricelens/.impeccable/surfaces/forecast-workbench-v2.md`、任务看板 | 所有运行时代码 |
| WP1 Core | `pricelens/src/pages/forecast/workbenchModel.ts`（含 `normalizeWorkbenchParams`）、`workbenchFixture.ts`、新增 `workbenchTime.ts`；`forecast/__tests__/workbenchModel.test.ts`、新增 `workbenchTime.test.ts` | 所有 TSX 页面组件 |
| WP2 Market | `forecast/MarketBusPanel.tsx`、新增 `forecast/__tests__/MarketBusPanel.test.tsx` | `WorkbenchBits.tsx`、`ForecastPage.tsx`、模型文件 |
| WP3 Reference/Event | `forecast/ReferencePanel.tsx`、`EventReplayModal.tsx`、新增对应测试 | fixture、模型、页面壳 |
| WP4 Inventory | `forecast/InventoryValidationCard.tsx`、新增 `InventoryValidationCard.test.tsx` | 模型、主图、页面壳 |
| WP5 Main/Cost | `forecast/MainForecastChart.tsx`、`ForecastMarginCostCard.tsx`、新增 `workbenchChartSegments.ts` 及对应测试 | 其他卡片、模型、页面壳 |
| WP6 Integration | `ForecastPage.tsx`、`App.tsx`、`components/PageHeader.tsx`、`components/ChartContentBar.tsx`、`chart/PriceTrend/ChartToolbar.tsx`、`WorkbenchBits.tsx`；新增 `workbenchExport.ts`、测试；集成阶段可对其他已合并文件做纯文案收尾 | 未合并工作包中的文件 |
| WP7 QA | 测试输出与审计记录；缺陷交回原 owner 或 WP6 | 不直接重写功能实现 |

**集成纪律：** WP2–WP5 并行期间不改共享文件。需要共享行为时，通过本计划定义的 props／模型字段消费；无法消费的，记录给 WP6，不在自己的分支另造共享实现。

## 4. 统一接口契约

WP1 完成后，以下名称与语义即冻结，WP2–WP6 不得改名：

```ts
export interface WorkbenchParams {
  q4Override: number | null;
  q1Override: number | null;
  overrideSource: 'ai' | 'human';
  marketEvents: MarketEventSeed[];
  productEvents: ProductEventSeed[];
  siPlanMonthly: Record<string, number>;
  manual: Record<number, { value: number; reason: string }>;
  rationale: string;
  prevGenReferenceId: string;
}

export interface WorkbenchWeekResult {
  // 既有字段保持
  supplyCapped: boolean; // 库存 min 是否在手调前触发
  capped: boolean;       // 当前是否仍按库存结果显示；手调后为 false
}

export function quarterKeyOfWeek(
  fixture: WorkbenchFixture,
  weekNumber: number,
): string | null;

export function marketEventDisposition(
  fixture: WorkbenchFixture,
  event: MarketEventSeed,
): 'historical' | 'active' | 'inactive';

export function withQuarterOverride(
  params: WorkbenchParams,
  field: 'q4' | 'q1',
  value: number | null,
): WorkbenchParams;

export function normalizeWorkbenchParams(
  fixture: WorkbenchFixture,
  value: unknown,
): WorkbenchParams;

export function buildWorkbenchAssumptionText(
  fixture: WorkbenchFixture,
  params: WorkbenchParams,
  result: WorkbenchResult,
): string;
```

`buildWorkbenchAssumptionText` 的实现归 WP6；WP1 不依赖它。`useWorkbenchParams` 归 WP6，但必须调用 WP1 的 `normalizeWorkbenchParams`。

---

## 5. Phase 0｜Coordinator 准备

### WP0：冻结正典和任务边界

- [ ] **Step 1：更新 brief 的旧决策。** 删除“未实施、纪要、9／8 折、不含库存限制分叉线”等现行描述；写入最新五层结构、刚性 `min`、无纪要、生产话术和两类事件入口。
- [ ] **Step 2：记录本计划的四个并行工作包和文件锁。** 不允许两个 Agent 同时获得 `ForecastPage.tsx`、`WorkbenchBits.tsx` 或 `workbenchModel.ts` 写权限。
- [ ] **Step 3：建立审计问题追踪。** 使用附录 A 的映射，不另造问题编号。
- [ ] **Step 4：确认执行基线。** 在当前分支记录 typecheck、design:check、design:lint 和 `npx vitest run src/pages/forecast` 的初始结果；若基线已变红，先报告，不将旧失败归因给本计划。

完成门槛：brief 不再与最新拍板冲突；每个 Agent 均有独立文件锁和可运行测试命令。

---

## 6. Phase 1｜核心模型先行

### WP1：模型、周历、参考品参数与库存口径

**目标：** 先修正所有会影响其他卡片的数值和类型，使卡片 Agent 只消费稳定结果。

**Files:**
- Modify: `pricelens/src/pages/forecast/workbenchModel.ts`
- Modify: `pricelens/src/pages/forecast/workbenchFixture.ts`
- Create: `pricelens/src/pages/forecast/workbenchTime.ts`
- Test: `pricelens/src/pages/forecast/__tests__/workbenchModel.test.ts`
- Create: `pricelens/src/pages/forecast/__tests__/workbenchTime.test.ts`

#### 6.1 周历与大盘事件

- [ ] **Step 1：写失败测试。** 至少覆盖：W38→2026Q3、W44／W46／W50→2026Q4；历史 W44 起 2 周不得影响 W45；W46–50 与 W50–52 都是 `active`。
- [ ] **Step 2：运行测试确认旧实现失败。**

  ```bash
  cd pricelens && npx vitest run src/pages/forecast/__tests__/workbenchTime.test.ts src/pages/forecast/__tests__/workbenchModel.test.ts
  ```

- [ ] **Step 3：给周数据增加完整日期。** `WorkbenchWeek` 新增 `date: 'YYYY-MM-DD'`，由现有周一函数同时生成 `date` 和 `dateLabel`；季度从实际日期计算，禁止按数组比例猜季度。
- [ ] **Step 4：实现事件处置。** 起周早于首个预测周即 `historical`；否则只要覆盖任一预测周即 `active`；其余为 `inactive`。`computeMarketFactor` 跳过 `historical`。
- [ ] **Step 5：保留现有衰减契约。** 首周峰值、末周 `peak / duration`、覆盖外 `null`；补 `flat` 的全链测试，不擅自改成末周归零。

#### 6.2 参考品进入主链

- [ ] **Step 1：加入 `prevGenReferenceId`。** 默认值是 `fixture.references.prevGenPool[0].id`。
- [ ] **Step 2：写默认不变与切换参照测试。** 默认结果与旧基准一致；选择 `ref-pura90` 时，W45 在无事件口径下应为 `41778`：

  ```ts
  // 47000 × (40000 / 45000) = 41777.78 → 41778
  expect(week45.unconstrained).toBe(41778);
  ```

- [ ] **Step 3：实现比值校正与缺数回退。** 在 `consider` 增加 `kind: 'reference'`，明确参照名称、比值或缺数回退原因；友商参照不进入该计算。
- [ ] **Step 4：验证旧金测。** 除新增字段外，默认 W45–W52 基线、大盘、库存与销毛结果不得漂移。

#### 6.3 库存健康与手调

- [ ] **Step 1：写 W45 健康窗口失败测试。** 完整库存序列下，W41–44 库存均值为 `103750`，W45 库存为 `88000`，所以 `invChangePct = -15.2`，不得再是 0。
- [ ] **Step 2：改为全序列计算健康。** 先对完整 `inventoryRows` 调用 `judgeInventoryHealth`，再筛选预测周给 UI；DOS 仍使用与库存扣减同源的 `sales`。
- [ ] **Step 3：增加 `supplyCapped`。** `firstAdjustedWeek`、库存修正标记和供给缺口均读取它；`capped` 继续表示手调后的当前显示状态。
- [ ] **Step 4：库存缺口只算供给截断。** 使用 `inventoryRows` 中 `desiredSales - sales`，不再用 `unconstrained - final`。
- [ ] **Step 5：写手调不污染缺口测试。** 在 SI 充足、无供给截断时把 W47 手调为 60000，`summary.gap` 必须为 0。
- [ ] **Step 6：保留手调优先级。** 手调落在库存截断周时，`final` 仍是手调值，但 `supplyCapped` 必须为 true。

#### 6.4 SI、季度来源与恢复校验

- [ ] **Step 1：SI 使用确定性的整数余数分配。** 每周先取 `floor(total/n)`，余数按周序每周加 1；10001 台分四周应为 `[2501,2500,2500,2500]`，总量保持 10001。现有可被整除的 fixture 不变。
- [ ] **Step 2：补 SI=0。** 单月 0、全部 0、库存耗尽和输入负值钳制均有断言。
- [ ] **Step 3：实现 `withQuarterOverride`。** 根据修改后的 Q4／Q1 计算 `overrideSource`，两者都为 null 时必须回 `ai`。
- [ ] **Step 4：实现 `normalizeWorkbenchParams`。** 校验对象、事件数组、SI 数字、manual reason、reference id；坏 JSON、错型字段、失效参照分别回退到基准，不允许会话数据使页面崩溃。
- [ ] **Step 5：运行 WP1 全量回归。**

  ```bash
  cd pricelens && npx vitest run src/pages/forecast
  npm --prefix ../pricelens run typecheck
  ```

完成门槛：核心测试全绿；默认基准数值不变；接口契约冻结；WP2–WP5 才能开始。

---

## 7. Phase 2｜四个卡片工作包并行

### WP2：大盘卡修正与生产化

**Consumes:** `quarterKeyOfWeek`、`marketEventDisposition`、`withQuarterOverride`、既有 `effectiveQuarterIndexes / eventWeeklyFactor`。  
**Produces:** 不改模型；输出可点击图例和正确事件状态。

- [ ] **Step 1：写组件失败测试。** 覆盖 W46 标记在 2026Q4、两条默认事件显示“本季生效”、2027Q1 同比显示 −13.3%、卡头存在输入／输出条。
- [ ] **Step 2：修正同比。** 2027Q1 与 2026Q1 比较；卡头和图内共用同一季度同比 helper，禁止再次出现两个口径。
- [ ] **Step 3：替换事件映射与状态。** 使用 WP1 helper；历史事件文案为“历史解释”，当前预测窗内为“本季生效”，其余为“不在预测窗口”。
- [ ] **Step 4：补 IoBar。** 推荐文案：输入“季度指数 · 行业事件”，输出“主图周销基准”。
- [ ] **Step 5：三个图例均接显隐。** 实际、当前推演、AI 基线各有 key、`aria-pressed` 和隐藏态；隐藏 AI 基线只影响 ghost，不影响生效值。
- [ ] **Step 6：收敛文案。** 删除“四件套 / 开天辟地 / ghost / 第一版教学说明”；AI 基线公式放 title；理由栏预填缩短，删除“圆桌会议后截图贴 PPT”。
- [ ] **Step 7：tokens 与空态。** 删除文件底部两个 hex，导入 `selectSoft / selectSoftInk`；无季度数据时显示“当前范围无大盘数据”，不渲染计算结果为 NaN 的 SVG。
- [ ] **Step 8：运行测试。**

  ```bash
  cd pricelens && npx vitest run src/pages/forecast/__tests__/MarketBusPanel.test.tsx src/pages/forecast/__tests__/workbenchModel.test.ts
  ```

### WP3：参考卡与事件回放

**Consumes:** `params.prevGenReferenceId`、WP1 的参考品模型契约。  
**Produces:** 受控上一代选择器；四类回放均可达；窄屏弹窗可用。

- [ ] **Step 1：把上一代选择器改为受控 props。**

  ```ts
  interface ReferencePanelProps {
    fixture: WorkbenchFixture;
    result: WorkbenchResult;
    prevGenReferenceId: string;
    onPrevGenReferenceChange: (id: string) => void;
  }
  ```

  友商选择器仍可保留为卡内查看状态，但文案不得暗示它直接改主图基线。

- [ ] **Step 2：写联动与缺数测试。** 选择 Pura 90 必须调用回调；主品缺失销量保持 null／“—”，不得转 0；空参照池显示“暂无可参照历史”。
- [ ] **Step 3：修正历史线缺数。** 实线只连接相邻有值点；跨缺失段用灰虚线，不把缺数画成零值点。
- [ ] **Step 4：收敛参考卡文案。** “事实还原型输入因子卡”改“历史参照”；删除“首当其冲／一定是／（演示）”；卡头保留“仅历史”。
- [ ] **Step 5：让全部回放场景可选。** 当同类型有多个场景时增加 `Select`，`aria-label="选择历史回放场景"`；切类型或场景时幅度重新取该场景预填值。
- [ ] **Step 6：修复窄屏。** 回放区使用：

  ```tsx
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))'
  ```

  所有文字容器 `minWidth: 0`，图表 `maxWidth: '100%'`；390px 下footer不得横向出屏。
- [ ] **Step 7：缩短弹窗操作文案。** 标题“新增产品事件 · 历史参照”，主按钮“应用事件”；“可改／画锚点／图下删除”等教学说明迁 title。
- [ ] **Step 8：清理禁词。** 类型 hint 中“我司”改“本品”；fixture 内的因果句由 WP6 在集成阶段统一清理，WP3 不改 fixture。
- [ ] **Step 9：运行组件测试与模型联动测试。**

### WP4：库存卡修正与格式统一

**Consumes:** `supplyCapped`、完整历史健康判定、修正后的 `summary.gap`。  
**Produces:** 库存修正状态不随手调消失，SI 输入与输出格式一致。

- [ ] **Step 1：写组件测试。** 覆盖 SI=0、库存截断周、手调覆盖截断周、无修正状态和规则文案。
- [ ] **Step 2：库存微痕读取 `supplyCapped`。** 手调周的库存截断仍能在库存卡和主图模型中被识别；`capped` 只表示当前是否按库存值显示。
- [ ] **Step 3：输出只讲结果。** 删除“中间过程不呈现／主图只显最终／刚性砍”；使用“库存上限修正／按可售量修正／修正周”。
- [ ] **Step 4：修正判定列表。** 多个修正周分别对应各自 health，不把第一个修正周的原因拼到全部周之后。
- [ ] **Step 5：统一单位。** 输出和右轴使用“万台”，不再出现 `33.4K 台` 与 `8,000 台` 混排。
- [ ] **Step 6：收敛规则。** “DOS 70–90 天 · 降幅预警 20%／30%”一行展示；“阈值未核定”用 chip；`min` 公式放 title。
- [ ] **Step 7：把握度只在有对应语义时出现。** 修正段可显示“把握大 ±2%”；未触发修正时显示“库存可支撑”，不无条件给整张卡挂 ±2%。
- [ ] **Step 8：保留全部图例显隐与键盘输入。** 删除无实际提交作用的空回调由 WP6 处理；WP4 不自行新增真实写入。
- [ ] **Step 9：运行库存组件和模型测试。**

### WP5：主图、成本图与通用缺数几何

**Consumes:** `supplyCapped`、模型最终值、参考品考量项。  
**Produces:** 可变窗口安全的 SVG、正确成本轴、完整图例行为，以及供 WP6 接入共享工具行的受控视图接口。

```ts
export interface MainForecastView {
  heightScale: number;
  showYTicks: boolean;
  labelMode: 'compact' | 'detail';
  promoBandOn: boolean;
}

// MainForecastChart 新增可选属性；默认值保持当前视觉。
view?: MainForecastView;       // 默认 { heightScale: 1, showYTicks: true, labelMode: 'compact', promoBandOn: true }
controls?: ReactNode;          // 渲染在主图上方，不包含卡头操作
```

- [ ] **Step 1：新增纯几何 helper。** `workbenchChartSegments.ts` 输入 `(number | null)[]`，输出连续有值段与缺失跨接段；连续段实线、跨缺段虚线，缺数本身不造点。
- [ ] **Step 2：写缺数和边界测试。** 首尾缺数、中间单周缺数、全空、不同历史／预测长度均有断言。
- [ ] **Step 3：主图删除写死下标。** `forecastStart` 从首个 `status==='forecast'` 派生；历史终点、预测线、今天分界、库存分界和成本图共用同一逻辑。
- [ ] **Step 4：促销带按周号查找。** 使用 `promoBand.startWeek / endWeek`，禁止再用 `x(9) / x(12)`。
- [ ] **Step 5：价格轴由数据派生。** 覆盖全部价格，留合理 padding 并生成刻度；不得继续固定 650–950／700–900。
- [ ] **Step 6：缺失值显示“—”。** 数据表不得把 `final ?? 0` 当真实零销量；空周不渲染可微调按钮。
- [ ] **Step 7：图例按“数据系列”与“说明项”分组。** 实际、预测、价格、上一代、把握度可切换；库存描边是预测样式，不伪装成独立数据系列。手调与小事件说明放图下。
- [ ] **Step 8：手调与库存双状态共存。** 手调菱形用墨色；库存截断保留琥珀描边；AI 标改中性色由 WP6 统一处理。
- [ ] **Step 9：成本轴改 `$M`。** 所有 tick 与 tooltip 使用 `value / 1e6` 或 `fmtMillionUsd`；不得再把原始 USD 标成“万$”。销毛柱图例增加真实显隐。
- [ ] **Step 10：成本空态与负值。** 无数据时显示“暂无成本销毛数据”；出现负单台销毛时不得静默丢柱，使用零基线向下表达并补测试。
- [ ] **Step 11：实现受控主图视图。** `heightScale` 只改变绘图区高度；`showYTicks` 控制刻度与网格；`labelMode` 在周标签每 2 个／每个显示之间切换；`promoBandOn` 控制档期背景带。`controls` 只负责布局，不在 WP5 自写齿轮或菜单。
- [ ] **Step 12：运行主图／成本组件测试和预测全量模型测试。**

Phase 2 完成门槛：四个工作包各自测试通过；没有共享文件冲突；没有新增 UI 禁词或硬编码 hex。

---

## 8. Phase 3｜单 Agent 总装

### WP6：共享壳、会话草稿、生产话术、导航与关键假设复制

**Files:**
- Modify: `pricelens/src/pages/ForecastPage.tsx`
- Modify: `pricelens/src/App.tsx`
- Modify: `pricelens/src/components/PageHeader.tsx`
- Modify: `pricelens/src/components/ChartContentBar.tsx`
- Modify: `pricelens/src/chart/PriceTrend/ChartToolbar.tsx`
- Modify: `pricelens/src/pages/forecast/WorkbenchBits.tsx`
- Modify: `pricelens/src/pages/forecast/workbenchFixture.ts`（仅集成后的文案收尾）
- Create: `pricelens/src/pages/forecast/useWorkbenchParams.ts`
- Create: `pricelens/src/pages/forecast/workbenchExport.ts`
- Test: `pricelens/src/pages/forecast/__tests__/ForecastPageWorkbench.test.tsx`
- Test: `pricelens/src/pages/__tests__/appShell.test.tsx`
- Create: `pricelens/src/pages/forecast/__tests__/workbenchExport.test.ts`

#### 8.1 共享壳与导航

- [ ] **Step 1：将 forecast 纳入 analysis 壳。** `AnalysisShell` 增加 `showFilters` 或等价明确参数；forecast 传 false，其余现有页保持 true。
- [ ] **Step 2：删除 ForecastPage 自挂的 PageHeader 和独立滚动壳。** 保留卡片内 `ChartContentBar`，主内容使用与前三页一致的外边距节奏。
- [ ] **Step 3：收敛双重当前页签。** 从 PageHeader 管理页签删除 forecast，并取消它作为 managementPage 的特例；ChartContentBar 的预测项恢复正常 `aria-current="page"`。
- [ ] **Step 4：更新 shell 测试。** 同一页面只能有一个预测 current；价格／量价／大盘既有导航与筛选状态不回归。

#### 8.2 会话草稿

- [ ] **Step 1：实现 `useWorkbenchParams`。** 使用现有 `usePageViewState`，键包含 `fixture.meta.modelVersion`；读写前调用 `normalizeWorkbenchParams`。

  ```ts
  const key = `forecast.workbench.${fixture.meta.modelVersion}`;
  ```

- [ ] **Step 2：替换普通 useState。** 切到价格／量价／大盘再返回，季度覆盖、事件、SI、手调原因和理由均保留；关闭浏览器页签后可自然失效。
- [ ] **Step 3：定义重置。** “重置基准”只清当前模型版本的本地草稿，不清全局筛选和其他页面视图态。
- [ ] **Step 4：移除空 commit。** SI 使用明确的本地草稿更新，不保留 `onSiMonthCommit={() => {}}` 这种假提交口；不宣称已写真实数据。

#### 8.3 页面状态和文案总装

- [ ] **Step 1：范围卡压缩为标题、状态／操作和一行范围口径。** 删除顶部结构教学和大段固定演示声明；保留“固定样本 · 不随全局筛选联动”。
- [ ] **Step 2：模拟标识分级。** 页首只保留 `DataStatusBadge`，移除重复的页级 DemoChip；主图、参考、大盘、库存、成本各有轻量模拟状态。
- [ ] **Step 3：可见“演示实际”改“实际”。** SVG aria-label 和表格 caption 继续保留模拟语境。
- [ ] **Step 4：接入受控参考品参数。** `ReferencePanel` 的上一代选择写入 `prevGenReferenceId`，主图摘要和考量随之重算。
- [ ] **Step 5：季度编辑使用 `withQuarterOverride`。** 还原最后一格后来源必须回 AI。
- [ ] **Step 6：修复事件 ID。** 新增时循环检查现有 id，直到取得未使用值；删除任一事件不影响其他事件。行业事件池只保留一个来源，删除未使用的重复常量。
- [ ] **Step 7：清理禁词和因果句。** fixture 回放改为“同期观察到……，作为人工推演参照”；“我司”全部改“本品／主品”；不把模拟场景写成已证实冲击。
- [ ] **Step 8：统一琥珀语义。** AI 与手调使用中性／墨色；琥珀优先给档期、库存修正和预警。文字标签继续保留，不能只换颜色。
- [ ] **Step 9：收敛共享 SectionHead / IoBar / Legend。** 说明文字放副标或 title；无可点击项的图例不得叫“点击切换系列显隐”。
- [ ] **Step 10：接入共享主图工具行。** 为 `ChartToolbar` 增加默认不改旧行为的 `featureVisibility?: Partial<Record<'scale' | 'yTicks' | 'tiers' | 'yCompress' | 'lineShape', boolean>>`。预测页只启用 `scale / yTicks`，关闭 `tiers / yCompress / lineShape`；⋯ 中启用标签密度，档期开关用既有 `presentationSlot`。视图值用 `usePageViewState<MainForecastView>('forecast.mainView', ...)` 保存并传给 WP5 的 `view`，工具行传 `controls`。不显示 RRP、价格类型或异常 chip 等无意义控件。
- [ ] **Step 11：补页面空态。** fixture 无周数据时显示“当前范围无可推演数据”；加载异常与无数据使用不同文案，不渲染 NaN 图表。

#### 8.4 复制关键假设

- [ ] **Step 1：实现纯文本构造函数。** 输出顺序固定为：范围与模拟状态 → 模型版本 → 季度基线与人工覆盖 → 行业事件 → 上一代参照 → 产品事件 → SI → 手调及原因 → 库存规则 → 总销量／峰值／库存缺口／销毛。
- [ ] **Step 2：每个数字来自当前 result／params。** 禁止另写常量，不调用 Agent，不生成无依据结论。
- [ ] **Step 3：加入“复制关键假设”按钮。** 成功显示“已复制”，失败显示“复制失败”；不新增纪要层。
- [ ] **Step 4：写导出测试。** 手调原因、模型版本、SI、库存规则与结果摘要必须出现在文本中；模拟状态必须在首段。

#### 8.5 集成验证

  ```bash
  npm --prefix pricelens run design:check
  npm --prefix pricelens run design:lint
  npm --prefix pricelens run typecheck
  cd pricelens && npx vitest run src/pages/forecast src/pages/__tests__/appShell.test.tsx
  ```

完成门槛：所有集成测试通过；页面无双 current、无 UI 禁词、无硬编码 hex；跨页往返草稿保留；参考品、事件、SI、手调和复制关键假设形成一条同源链。

---

## 9. Phase 4｜独立 QA 与交付

### WP7：全量门禁和浏览器验收

- [ ] **Step 1：运行完整项目检查。** 本轮改变应用行为与离线交付，集成后必须运行：

  ```bash
  npm --prefix pricelens run check
  ```

  若出现与本次无关的既有失败，保留证据并单列，不修复无关问题。

- [ ] **Step 2：运行预测测试全集。**

  ```bash
  cd pricelens && npx vitest run src/pages/forecast
  ```

- [ ] **Step 3：检查生成物。** `check` 会构建并同步离线单文件；只纳入本任务预期产物，不把日志、临时截图或缓存提交为源码。
- [ ] **Step 4：执行桌面浏览器矩阵。** 1440×900 与 1280×800 均检查：首屏主图位置、范围行、五层卡序、图例、数据表、卡头换行、控制台无新增 error／warning。
- [ ] **Step 5：执行窄屏矩阵。** 768×1024 与 390×844 均检查：页面关键数值不被裁、图表局部横滚、事件弹窗单列、footer 可达、输入和按钮可聚焦。
- [ ] **Step 6：执行真实操作链。**

  ```text
  切换上一代参照 → 主图变化
  → 修改 Q4 → 人工确认与 AI 基线对照出现
  → 还原 Q4/Q1 → AI 状态恢复
  → 新增行业事件并移动起周 → 历史／预测状态正确
  → 新增产品事件并切换四种回放 → 应用与删除正确
  → SI 单月设 0 → 库存与主图按 min 修正
  → Enter 微调预测周 → 空原因不能保存 → 填原因保存
  → 复制关键假设 → 文本与当前结果一致
  → 切到价格走势再返回 → 草稿仍在
  → 重置基准 → 当前草稿回到 fixture 默认值
  ```

- [ ] **Step 7：键盘与弹窗。** 验证 Tab 圈禁、Esc 关闭、焦点返还、Enter／Space 微调、图例 `aria-pressed`、SVG 可访问名称和数据表替代。
- [ ] **Step 8：复测审计截图点。** 重点对照：大盘 W46 不再落 2026Q2、下季同比 −13.3%、成本轴 `$M`、390px 弹窗无横向裁切。
- [ ] **Step 9：交接记录。** 列出通过命令、浏览器尺寸、真实操作结果、未解决项和有意保留的 fixture／阈值边界。

## 10. 完成定义（DoD）

只有全部满足才可交接：

- [ ] 附录 A 所有 P1 项都有实现和回归证据。
- [ ] P2 项全部完成，或由产品 owner 明确记录为不阻断交付的例外；P3 不得挤占 P1 修复时间。
- [ ] 预测测试全集与 `npm --prefix pricelens run check` 通过。
- [ ] 桌面和 390px 的真实操作链通过，弹窗 footer 可达。
- [ ] 页面没有“因子 / 约束 / 置信区间 / 无约束需求 / 我司”可见 UI 文本。
- [ ] 模拟状态显性、轻量且一致；没有大段 demo／教学腔声明。
- [ ] 主图、参考、大盘、库存、成本共享同一参数和结果，不出现第二套数字。
- [ ] 未恢复纪要、库存分叉线、打折系数或展示层品牌指标。
- [ ] 未接真实数据、未宣称 AI 已调用 Agent、未把本地草稿写成生产提交。
- [ ] brief、实现和测试契约一致。

---

## 附录 A｜审计问题到工作包追踪

| 审计项 | 工作包 | 验收证据 |
|---|---|---|
| P1-01 参考选择不接模型 | WP1 + WP3 + WP6 | 默认基准不变；Pura W45=41778；浏览器切换主图变化 |
| P1-02 事件季度与生效状态 | WP1 + WP2 | W46/W50→2026Q4；默认事件“本季生效” |
| P1-03 下季同比 | WP2 | 2027Q1 vs 2026Q1 = −13.3% |
| P1-04 历史事件跨界 | WP1 | W44 起 2 周不影响 W45 |
| P1-05 健康窗口缺历史 | WP1 | W45 `invChangePct=-15.2` |
| P1-06 手调污染库存缺口 | WP1 + WP4 + WP5 | 无截断手调时 gap=0；截断周 `supplyCapped=true` |
| P1-07 成本轴单位 | WP5 | 原始 USD 不直接挂“万$”；轴与 tooltip 同为 `$M` |
| P1-08 移动弹窗裁切 | WP3 + WP7 | 390px 单列、footer 可达 |
| P1-09 缺数／空态／写死结构 | WP1 + WP2–WP6 | 缺数不转 0、实线不跨缺、可变长度与空数组测试 |
| P1-10 页签切换丢草稿 | WP6 | 会话恢复、版本隔离、重置只清当前草稿 |
| P1-11 禁词与无证据因果 | WP3 + WP6 | 全文扫描为零；回放只写同期观察与人工假设 |
| P2 生产文案与密度 | WP2–WP6 | 范围区缩短、卡头不超一行、图上只留数据和控件 |
| P2 IoBar／图例／AI 还原／回放可达 | WP1–WP4、WP6 | 组件测试与浏览器操作 |
| P2 事件 ID、状态徽标、把握度、琥珀、tokens | WP1、WP4–WP6 | 唯一性、文案、颜色与状态检查 |
| P2 brief 漂移 | WP0 | brief 与最新拍板一致 |
| P3 字号／数字格式／命中区 | WP2、WP4–WP6 | token 扫描、单位扫描、键盘与窄屏检查 |
| I DOS／AI 来源／关键假设／量价主面板图例 | WP0、WP6 | 阈值边界明示；AI 规则来源明示；文本复制完成；量价主面板不纳入本轮 |

## 附录 B｜各 Agent 最小交接提示

### WP1 Agent

> 你只负责核心模型、周历、参数与模型测试。先按 WP1 写失败测试，再实现；冻结第 4 节接口。不得改任何 TSX。默认 fixture 的既有正确结果不能漂移。完成后报告新增字段、测试数值和可供卡片 Agent 消费的函数。

### WP2 Agent

> 你只负责 `MarketBusPanel.tsx` 与其组件测试。WP1 接口已冻结；禁止修改模型和共享 Bits。修正同比、事件季度与状态，补 IoBar、可点击图例、空态和生产话术。用 WP2 命令验收。

### WP3 Agent

> 你只负责 `ReferencePanel.tsx`、`EventReplayModal.tsx` 与其测试。上一代选择器是受控输入，友商选择不直接改主图；四类回放必须可达，390px 弹窗必须单列且 footer 可见。不得改 fixture 或模型。

### WP4 Agent

> 你只负责库存卡及测试。消费 `supplyCapped` 和修正后的健康结果；统一万台格式，分别显示各修正周原因，收敛规则与把握度。不得修改模型或 ForecastPage。

### WP5 Agent

> 你只负责主图、成本图、缺数几何 helper 及测试。派生所有时间边界与价格轴，缺数不造 0，成本统一 `$M`，图例真实显隐，手调与库存标记共存。不得修改其他卡片或页面壳。

### WP6 Agent

> 你是唯一集成 owner。只有 WP1–WP5 完成后才开始。负责共享壳、单 current、会话草稿、范围压缩、文案和禁词总扫、事件 ID、状态徽标、关键假设复制及集成测试。不得把 fixture 阶段伪装成真实筛选联动。

### WP7 Agent

> 你只做独立验证，不直接重写实现。按 WP7 的命令、浏览器矩阵和操作链逐项留证；失败项按附录 A 退回对应 owner，修复后只重跑受影响检查和完整交接门禁。
