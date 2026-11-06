# Batch 2｜迭代预测：四步量价推演工作台

> 建议分支：`zcode/pricelens-iterate-t428u-20261107`  
> 目标：在迭代渠道把量价预测收敛为一条可审计、可回滚、可由人修正的四步推演链。  
> 参考稿：[`../mockups/c-forecast-pipeline.html`](../mockups/c-forecast-pipeline.html)、[`../mockups/shots/c-forecast-pipeline.png`](../mockups/shots/c-forecast-pipeline.png)

## 1. 交付边界

本批只改迭代预测页面及其直接样式/测试，不改变稳定渠道，不把演示 fixture 伪装成实时数据。页面信息架构固定为：

1. 参考产品基线：同产业、同国家/地区、相近档位的历史量价事实，生成首轮基线。
2. 大盘修正：以大盘时间序列与已审核事件形成第一轮修正。
3. 库存修正：核对库存、DOS、可售量上限，形成第二轮修正。
4. 成本 + 销毛预测：汇总最终输出，展示成本情景与销毛结果。

用户口述的“消毛”统一映射为“销毛”，文案和字段不得出现“消毛”。口径固定为：

```text
单台销毛额 = 单台收入 − 单台成本
销毛率 = 单台销毛额 ÷ 单台收入
```

保持现有“顶部一张主图 + 底部四张小卡”的产品约束；四步导航可定位到对应卡，但不复制第二套数字。

## 2. 现有实现可复用点

- 页面入口：`pricelens/src/pages/ForecastPage.tsx`。
- 主链已有 `workbenchFixture`、`useWorkbenchParams`、`computeWorkbench`、`useMarginScenario`/`computeMarginView`；主图、数据表、摘要和成本销毛卡应继续消费同一结果。
- 参考卡：`pricelens/src/pages/forecast/ReferencePanel.tsx`。
- 大盘卡：`pricelens/src/pages/forecast/MarketBusPanel.tsx`。
- 库存卡：`pricelens/src/pages/forecast/InventoryValidationCard.tsx`。
- 成本销毛卡：`pricelens/src/pages/forecast/ForecastMarginCostCard.tsx`。
- 主图及取证：`MainForecastChart.tsx`、`EvidenceFrame.tsx`、`ReferenceTimeTrack.tsx`。
- 参数/模型：`workbenchModel.ts`、`workbenchFixture.ts`、`forecastModel.ts`、`forecastSnapshot.ts`、`forecastModelPack.ts`、`useSiConfirmations.ts`。
- 情报审核容器：`useIntelligenceReview.ts`、`intelligenceModel.ts`。当前真实候选注入为空，必须保留待接入空态。

现状事实：预测页面当前主要由 `workbenchFixture` 模拟；历史段标识“模拟实际”，预测段为本地确定性规则基线，未调用模型服务；情报候选是模拟/待接入。不要添加“实时抓取”“已校准置信度”或未经证据支持的百分比。

## 3. 页面与组件契约

### 3.1 页面结构

```text
页签/范围工具行
└─ 四步 PipelineNav（参考 → 大盘 → 库存 → 成本销毛）
└─ 主图 + 预测摘要（唯一结果总览）
   ├─ 参考产品卡（基线）
   ├─ 大盘总量总线卡（第一轮修正）
   ├─ 库存验证卡（第二轮修正）
   └─ 成本与销毛卡（最终输出）
```

每一步均展示“输入 / 假设 / 修正 / 证据 / 数据状态”，但默认只露结论；细节通过可展开区域查看。步骤之间必须能看到前一步输出如何成为下一步输入。

### 3.2 交互状态

| 状态 | 页面行为 | 约束 |
| --- | --- | --- |
| 初始/示例 | 显示 `示例数据` 或 `模拟` 状态，主图可读 | 不显示真实置信度百分比；缺数不插值 |
| 当前步骤 | Pipeline 节点蓝色选中，卡头显示步骤标题与输入 | 只定位/聚焦，不隐式重算 |
| 已完成步骤 | 节点可回看，显示已生成的输入/修正记录 | 回看不篡改当前参数 |
| 待接入 | 显示“待接入/待确认/无法计算”，保留下一步占位 | 不用空值填成 0，不编造来源 |
| 手动修改 | 点击柱/单元格打开就地编辑；数量或价格修正旁必须填写原因 | 原因写入 override/event，并回写主图与审计轨迹 |
| 重算中 | 按钮进入 loading/禁用重复提交，保留原结果 | 失败不清空已有结果 |
| 重算失败 | 显示可读错误、重试；保留上次成功结果 | 不能把失败当成 0 或“已完成” |
| 上下文变化 | 显示旧 fingerprint/旧范围提醒，动作卡禁用或要求重新确认 | 不把旧结果静默套到新国家/产品 |
| SI 未确认 | 页首显示待确认月份数；主图注明为计划参考结果 | 完成确认前不可标“人工确认完成” |
| 无周数据 | 页面空态说明检查 fixture/数据源 | 不渲染 NaN、空图例或伪摘要 |

### 3.3 统一取证操作

- 主图预测点/柱、修正周、事件点：`hover` 展示 tooltip（输入、修正、来源、时间窗）；`click` 固定取证卡或定位到对应步骤。
- 键盘：所有可交互点可通过 `Tab` 到达；`Enter`/`Space` 固定取证或打开编辑；`Esc` 关闭 tooltip/弹层；焦点始终有 `:focus-visible` 高亮。
- 取证卡必须能读到数据状态、数据版本/采集时间（若缺失写“待确认”）、计算关系和缺失字段。
- 大盘/月度事件、库存上限和成本/价格 override 均需内联原因；取消不写入参数，保存才回写主图及对应小卡。
- 四步节点点击仅滚动/聚焦目标卡并显示“来自……返回”条，不应产生第二套计算。

## 4. 四步开发细则

### Step 1｜参考产品基线

输入参考产品、历史价格与周销量、国家/产业/渠道/时间范围。输出首轮基线和可审阅的历史参照。匹配规则若未被数据契约证明，文案写“匹配规则待确认”。

主图应区分历史实柱/实线与预测虚线；预测区间仅在有真实区间契约时展示。当前只能写“范围示意/待接入”，不得写置信度百分比。

### Step 2｜大盘修正

输入历史月序列、统一预测月序列、已审核情报事件和人工月度事件。输出第一轮修正量、修正原因和可回看对比。情报候选为空时保留“候选生成能力待接入”空态；不能把模拟候选写成实时新闻。

### Step 3｜库存修正

输入库存、DOS、SI/可售量确认。输出可售上限、首个修正周及被压低的销量缺口。库存缺数时显示“无法计算”，不静默补点；`min(基线 SO, 可售)` 等公式需在取证中可复核。

### Step 4｜成本 + 销毛预测

输入按月版本成本、价格情景、销量结果。输出预测期销毛、单台销毛额、销毛率及变化来源；单位/金额轴分离，不能把总销毛金额与单价共用坐标。所有手调价格/成本都要有原因并与主图、④卡同源。

## 5. 数据契约：已具 vs 待补

### 已具（可直接复用）

- `workbenchFixture` 的演示上下文、周/月日历、历史/预测状态和显式 `simulated` provenance。
- `WorkbenchParams`/`WorkbenchResult` 的参考产品、大盘月度 override、库存/SI 确认、事件记录和重算结果。
- `MarginView` 的成本、价格、销量、历史/预测销毛同源计算；公式可追溯。
- Agent/页面可传递 `ForecastSnapshot`、`ForecastDataset`、context fingerprint；本地确定性引擎优先，远端只负责叙述/编排。
- 情报模型的 `real | simulated | mixed`、候选审核状态、证据字段和“依据齐全/部分待核/需人工补参”语义。

### 待补（本批只留契约/空态，不伪造实现）

- 真实参考产品匹配服务及可验证的价格/销量时间序列、采集时间、数据版本。
- 真实国家/产业大盘、库存/DOS/SI、成本版本和来源映射；多国汇率/市场序列不能由演示值推断。
- 真实情报抓取、去重、来源 URL、发布时间与国家上市阶段；候选注入接口当前为空。
- 预测区间校准、置信度定义、样本量/覆盖率/回测门槛。未有契约前一律显示“待接入”，不编 `%`。
- 持久化 override、审计日志、并发/失败重试和权限边界；当前会话状态不等于后端落库。

建议最小接口形状（名称可按现有类型落地，不得另起第二套模型）：

```ts
type ForecastEvidence = {
  id: string;
  label: string;
  source: string;
  sourceUrl?: string;
  capturedAt?: string;
  dataVersion?: string;
  status: 'real' | 'simulated' | 'mixed' | 'pending' | 'missing';
};

type ForecastStepResult = {
  step: 1 | 2 | 3 | 4;
  inputs: Record<string, unknown>;
  assumptions: string[];
  adjustments: Array<{ key: string; value: number | null; reason?: string }>;
  evidence: ForecastEvidence[];
  calculationStatus: 'ready' | 'partial' | 'pending' | 'cannot_compute' | 'failed';
};
```

## 6. 文件白名单与禁止项

### 允许修改

- `pricelens/src/pages/ForecastPage.tsx`
- `pricelens/src/pages/forecast/{MainForecastChart,PipelineNav,ReferencePanel,MarketBusPanel,InventoryValidationCard,ForecastMarginCostCard,EvidenceFrame,ReferenceTimeTrack}.tsx`
- 与本批直接相关的 `pricelens/src/pages/forecast/*.ts` 模型/fixture/测试（仅在契约需要时）
- `pricelens/src/theme/tokens.ts` 仅在 Batch 1 未提供所需稳定 token 时，经主代理确认后修改；优先复用现有 token
- 本 brief 与对应迭代 `.impeccable/surfaces/` 决策文件、测试快照/说明

### 禁止修改

- `pricelens/src/appChannel.ts` 的稳定/迭代切换语义；不得新增环境旁路开关。
- 稳定页面、稳定截图对应的行为或 `pricelens/src/**` 无关模块。
- 任何真实抓取、后端接口、模型服务、置信度百分比的伪实现；不得把模拟数据标为真实。
- 不得出现“消毛”；不得删除“销毛”公式、证据状态或缺数不插值规则。
- 不得启动/停止开发服务器，不得修改 `node_modules` symlink，不得 `git commit`/`git push`。

## 7. 验证命令与 DoD

从仓库根目录执行：

```bash
npm --prefix pricelens run design:check
npm --prefix pricelens run design:lint
npm --prefix pricelens run typecheck
npm --prefix pricelens run check
```

若只改文档/测试而未触及应用行为，仍至少运行前三项；本批触及预测行为时必须跑完整 `check`。另外执行：

```bash
git diff --check
git status --short
```

DoD：

- [ ] 四步 Pipeline 与“顶部主图 + 底部四卡”在迭代页面可见，节点定位不会复制或分叉结果。
- [ ] 每步均有输入、假设、修正、证据、数据状态；模拟/待接入/无法计算状态可辨识。
- [ ] hover + click 固定取证 + 键盘操作覆盖主图、步骤节点、编辑控件和证据按钮。
- [ ] 手动数量/价格/月度事件/库存/SI 修正均要求原因并回写主图、摘要、对应卡和审计轨迹；取消不写入。
- [ ] 销毛公式、单位轴和成本版本口径一致；没有“消毛”或未经契约的置信度百分比。
- [ ] 缺数不插值；情报候选为空时显示待接入空态；失败/旧上下文可重试且不丢上次结果。
- [ ] `design:check`、`design:lint`、`typecheck`、`check`、`git diff --check` 均有通过证据。

## 8. 交付动作

完成后只显式暂存本批允许文件（示例）：

```bash
git add docs/design/zcode-briefs/batch2-iterate-forecast.md \\
  pricelens/src/pages/ForecastPage.tsx \\
  pricelens/src/pages/forecast/<仅实际修改的文件>
```

不要使用 `git add -A`，不要暂存 `pricelens/node_modules`，不要 commit 或 push。回报中列出实际修改文件、验证命令结果、仍待补的数据契约和阻塞项。
