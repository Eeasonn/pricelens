# PriceLens t428u 详细设计（2026-11-07）

> 状态：设计定稿（阶段 1）— 可供用户回看，可直接交 ZCode 分批开发  
> 工作树：`_worktrees/pricelens-design-20261107` / 分支 `codex/pricelens-design-20261107` @ `a22d21e`  
> 规范沿用：`pricelens/DESIGN.md` + `pricelens/src/theme/tokens.ts`（不另起冲突体系）  
> 口述映射：**「消毛预测」= 代码/文档「销毛（成本与销毛）预测」**（全仓 0 处「消毛」）

---

## 1. 摘要与范围

本设计覆盖 Yixuan 授权的 t428u 四块：

| 代号 | 主题 | 主落点 |
|---|---|---|
| A | 全局样式检查与优化 | 迭代版重点；稳定版仅 token/一致性小步 |
| B | 国家情报 → GTM 情报工作台 | **仅迭代** |
| C | 量价预测重构（信任度 + 易用性） | **仅迭代** |
| D | Agent 功能与 UX | 稳定守住既有能力 + 迭代升级；GTM/预测深链跟 B/C |

**不做**：`git push`、合 main、部署上线、付费 API、编造实时抓取/置信度%、改主仓脏 WIP。

开发顺序建议见 §17；可直接转交 GLM BOT / ZCode 的 brief 在 `docs/design/zcode-briefs/`。

---

## 2. 现场基线（Step1 核验）

### 2.1 仓库

- 路径：`/Users/eason/Documents/Eason's Projects/Price Intelligence`
- 远端：`https://github.com/Eeasonn/pricelens.git`
- symlink：`价格管理-v109` → 同上
- 技术栈：React 18 + Vite 5 + TypeScript + antd 5 + echarts + vitest  
- 命令：`npm run dev` / `build` / `build:iterate` / `test` / `typecheck` / `check`（含 design:check/lint）/ `agent-server`

### 2.2 稳定 / 迭代现行（以现场 worktree 为准）

| 线 | worktree | 分支 | HEAD | 状态 |
|---|---|---|---|---|
| 迭代 | `~/zcode-wt/pricelens-gsap-agent` | `zcode/pricelens-iterate-forecast-design-p0-20261106` | `a22d21ea1a651f28b41e03669ce274dec7b394eb` | clean |
| 稳定 | `~/zcode-wt/pricelens-quicksearch` | `zcode/pricelens-stable-config-rbac-20261106` | `137411426f63d51a606a80031581206c487723a6` | clean |

记忆线索 `zcode/pricelens-*-agentux-20261106` 仍在本地，但已被上述分支超越。

### 2.3 严禁触碰

主仓 checkout `feature/volume-detail-compact` @ `97abe4d` 含大量未提交 M/??（VolumePrice、forecast 卡、RangeRuler、tokens、DESIGN.md 等）。设计与后续开发均使用独立 worktree，不得 checkout 切换该目录分支。

### 2.4 本设计专用 worktree

| 用途 | 路径 | 分支 |
|---|---|---|
| 设计文档 | `_worktrees/pricelens-design-20261107` | `codex/pricelens-design-20261107` |
| 稳定只读审计/截图 | `_worktrees/pricelens-stable-audit-20261107` | `codex/pricelens-stable-audit-20261107` |

本地预览（勿杀 5191）：迭代 `127.0.0.1:5201`，稳定 `127.0.0.1:5202`。

---

## 3. 既有设计规范沿用要点

摘自 `pricelens/DESIGN.md` / `tokens.ts`（实现以源文件为准）：

- 画布：页面 `#fafafa`，卡片 `#fff`，内衬 `#f5f5f5`，发丝线 `#ebebeb`
- 强调：链接/选中/焦点 `#0070f3`；主 CTA 近黑 `#171717`；警告琥珀、错误红
- 字体：Inter / 系统中文；标题 20/600，正文 14–16，辅助 12；等宽 Geist Mono 12
- 间距：4px 级数；页头约 64px → 筛选 → 视图控件 → 图/表 → 摘要/证据
- 圆角：控件 6 / 卡片 8 / 弹层 12；药丸仅用于标签/状态
- 动效：反馈 160ms、模式切换 240ms、跨场景 320ms；Agent dock 连续重排可复用 720ms；**必须**尊重 `prefers-reduced-motion`（保留状态、去掉位移/分段入场）
- 禁：紫色大渐变、玻璃厚面板、堆砌营销卡片、把品牌图表色当 UI 状态色
- 渠道：`appChannel.ts` 区分 stable/iterate；稳定隐藏 `marketboard` / `forecast` / `intelligence`

---

## 4. 现状问题（配图）

| 问题 | 证据图 | 说明 |
|---|---|---|
| 情报偏列表，GTM 业务图卡弱 | `shots/current/iterate-intel.png` | 需工作台化（新品/竞品/渠道/促销/事件），示例与实时必须分离 |
| 预测像看板，推演因果弱 | `shots/current/iterate-forecast.png` | 虽有 PipelineNav 四步，但输入/假设/修正量/取证统一性不足 |
| 稳定预警/看板可用但 Agent 外壳仍偏简 | `shots/current/stable-alerts.png` / `stable-dashboard.png` | 守住价格优势/预警；迭代再升级壳与结果卡 |
| 量价密度与 token 偶发漂移风险 | `shots/current/iterate-volume.png` | A 全局样式以 tokens 为准统一 |

目标布局示意（高保真 mockup，示例数据已标「示例」）：

- B：`mockups/shots/b-gtm-intel-workbench.png`
- C：`mockups/shots/c-forecast-pipeline.png`
- D：`mockups/shots/d-agent-ux.png`

---

## 5. 页面与组件清单

### 5.1 迭代可见页

| 页面 | 关键组件（现状） | t428u 动作 |
|---|---|---|
| 情报 `intelligence` | `IntelligenceCenter.tsx` | **B 重构为 GTM 工作台** |
| 量价预测 `forecast` | `ForecastPage` + `PipelineNav` + `ReferencePanel` + `MarketBusPanel` + `InventoryValidationCard` + `ForecastMarginCostCard` + `MainForecastChart` + `EvidenceFrame`… | **C 按四步推演强化 IA/取证/因果** |
| 量价 `volume` / 价格看板等 | `VolumePrice` / chart | A 样式一致性；不改业务公式 |
| 预警 `alerts` | `AlertsPage` | D 稳定+迭代 Agent 深链；功能守住 |
| Agent 壳 | `components/Copilot/*` + `src/agent/*` | **D** |

### 5.2 稳定可见页

隐藏预测/情报/市场看板；保留概览/价格/量价/配置/预警等。Agent 价格优势、价格预警必须可交互。

---

## 6. 信息架构

### 6.1 迭代 GTM 情报工作台（B）

```
全局 Scope（国家/产业/时间）
 └─ 模块 chips：新品 | 竞品 | 渠道 | 价格促销 | 市场事件
     └─ 工作台主区（分区卡片流，非海报墙）
         └─ 详情抽屉：溯源链接 / 时间 / 地区 / 来源状态 / GTM 意义
             └─ 捷径：进入量价预测
```

### 6.2 迭代量价预测（C）— 对齐现有 PipelineNav 文案

代码已定义四步（`PipelineNav.tsx`），本设计强化为任务流而非看板：

1. **① 自动学习基线（参考产品）** → 首轮基线预测  
2. **② 大盘修正** → 第一轮修正（含人工按月调整）  
3. **③ 库存修正** → 第二轮修正（SI 确认）  
4. **④ 成本及销毛** → 最终成本预测 + **销毛预测**

```
PipelineNav（①→②→③→④）
 └─ 主图 + 摘要（唯一结果总览，步骤对比叠层可选）
     ├─ 参考产品卡
     ├─ 大盘总量总线卡（统一取证交互）
     ├─ 库存验证卡
     └─ 成本与销毛卡
```

### 6.3 Agent（D）

```
意图（快问/输入）→ 组装上下文（国家/产品/页）→ 调用已注册能力
 → 状态（running/…）→ 结果小卡片 + 证据 → 药丸动作（真实跳转/定位）
```

---

## 7. 交互状态机（摘要）

| 域 | 状态 | 行为 |
|---|---|---|
| 情报卡 | 示例 / 待接入 / 已接入 / 加载 / 失败 | 示例必徽章；失败 fallback；待接入不装实时 |
| 预测步 | 未跑 / 有基线 / 已修正 / 缺数 / 过期 | 步间显示修正量；缺数提示单位口径；过期标取证时间 |
| 取证 | 收起 / hover 预览 / 固定展开 / 键盘打开 | hover 非唯一入口；点击固定；Esc 关闭 |
| Agent | ready / running / success / error / cancelled / empty / context-insufficient | 重试/取消/无结果动作真实 |

---

## 8. 内容与数据契约

### 8.1 已具（代码/本地可演示）

- 预测工作台：`workbenchFixture` 模拟链；Pipeline 四步；成本销毛卡与 `marginScenarioModel`  
- 销毛口径文档与公式（见 §8.3）  
- Agent：价格优势、价格预警相关调用与 country-sync 测试；结果卡/状态骨架  
- 稳定：配置 RBAC、预警页、价格/量价主路径  

### 8.2 待补接入（不得假装已有）

- 情报真实候选注入、新品官方图许可源、渠道/促销全量源  
- 预测真实大盘/库存/成本 API（当前多为模拟/本地规则）  
- **任何模型置信度百分比**（无真实值则不展示 %）  
- Ant Design X 是否引入（待公开 npm/license 核验，见 §16）

### 8.3 「消毛 / 销毛」口径（已确认）

全仓搜索 **「消毛」= 0**。业务原文为 **销毛**：

> 单台销毛额 = 单台收入 − 单台成本  
> 销毛率 = 单台销毛额 ÷ 单台收入  

来源：`docs/PriceLens-主产品经营视图与量价销毛成本设计定稿.md`；预测 UI 文案「成本及销毛」/「成本与销毛（模拟）」。  
**产品文案禁止写「消毛」**；设计/需求层注明口述映射即可。

---

## 9. 动效与无障碍

| 场景 | 时长 | Easing 建议 | 触发 | reduced-motion |
|---|---|---|---|---|
| 按钮/芯片反馈 | 160ms | ease-out | pointer/keyboard | 保留色态，无位移 |
| 抽屉/展开 | 240ms | ease-in-out | click/Enter | 瞬时切换 |
| 预测步间数值过渡 | 320ms | ease-in-out | 步切换/重算完成 | 直接跳最终值 |
| Agent dock 重排 | 720ms（现有） | 既有曲线 | 布局变化 | 取消连续动画 |

无障碍：

- Pipeline 使用 `aria-current="step"`（已有方向）  
- 取证不依赖 hover：焦点可打开，触屏可点  
- 对比/状态不单靠颜色（辅以文案/图标）  
- 焦点环可见（`#0070f3`）

---

## 10. 改造优先级

1. **P0** Batch1 稳定 token + Agent 守住回归  
2. **P0** Batch2 迭代预测四步因果与取证统一（信任度核心）  
3. **P1** Batch3 GTM 工作台 IA + 示例/待接入诚实空态  
4. **P1** Batch4 迭代 Agent 壳/结果卡/药丸；库评估  

---

## 11. 稳定 / 迭代范围矩阵

| 需求项 | 稳定 | 迭代 | 备注 |
|---|---|---|---|
| A 全局 tokens/字号/间距/空态一致性 | 小步对齐 | **重点** | 禁紫渐变玻璃 |
| B GTM 情报工作台 | 不做（页隐藏） | **做** | 示例必标 |
| C 预测四步重构 | 不做（页隐藏） | **做** | 销毛口径 |
| C 统一取证 hover+固定+键盘 | — | **做** | 审视 MarketBus 现有 hover 区间 |
| D 价格优势可用 | **守住** | 守住+增强 | country-sync |
| D 价格预警可用 | **守住** | 守住+深链 | |
| D Agent 换国同步 / BENCHMARK_CAP 文案 | **守住** | 守住 | receipts 已验收 |
| D 结果卡/证据/药丸/状态机 | 小步 | **升级** | 动作必须真实 |
| D 引入 Ant Design X | 默认不引入 | 评估后可选壳层 | 视觉服从规范 |
| 编造置信度% / 假实时 | **禁止** | **禁止** | |
| push / 部署 | **禁止** | **禁止** | 本轮本地验收 |

---

## 12. 验收测试用例（摘要）

1. **A**：迭代关键页截图对比；无新增违禁视觉；`design:check` / `design:lint` 通过  
2. **B**：情报页五模块可见或诚实空态；卡片含产品/地区/时间/变化/GTM 意义；展开有链接时间地区；示例徽章；图失败 fallback  
3. **C**：①→②→③→④ 可导航；每步可见输入/假设/修正量/数据源时间；主图步间可感知变化；取证键盘可达；无置信%  
4. **销毛**：文案为销毛；展示符合收入−成本口径；负销毛可见零基线（若图展示）  
5. **D 稳定**：价格优势换国矩阵正确；预警可开；文案 cap 不回归  
6. **D 迭代**：结果卡动作跳转真实；失败可重试；无推理链  
7. **构建**：稳定 `npm run check`；迭代另跑 `build:iterate`  

---

## 13. A 全局样式（迭代重点）

- 统一消费 `tokens.ts`：字号层级、4px 间距、发丝边框、表/卡/弹层  
- 表与图：主图优先，辅助带不抢色；加载用轻骨架，错误/空态一文案+次要操作  
- Hover/选中：`#0070f3` 与发丝线，无厚阴影玻璃  
- 响应式：窄屏先纵向堆叠卡片，不缩可读字号低于 12  
- 详细执行以 Batch1 + 迭代页局部 lint 为准  

---

## 14. B GTM 情报工作台

见 mockup B 与 `zcode-briefs/batch3-iterate-gtm.md`。  
核心：工作台分区、筛选联动、溯源、示例标注、待接入诚实、官方图许可与 fallback。

---

## 15. C 量价预测重构

见 mockup C 与 `zcode-briefs/batch2-iterate-forecast.md`。

**统一取证交互**（替换「只会 hover」）：

1. Hover：浮层预览区间/事件摘要（指针设备）  
2. Click：固定展开 `EvidenceFrame` 类面板  
3. Keyboard：焦点 + Enter 打开，Esc 关闭  
4. Touch：点按 = 固定展开  

每步元数据：数据源、取证时间、参考产品依据、修正幅度与原因、单位口径、区间、缺数/过期。  
动效：基线→大盘→库存→最终 320ms 克制过渡。  
**无真实置信 → 不显示百分比。**

---

## 16. D Agent 功能与 UX

见 mockup D 与 `zcode-briefs/batch1-*.md` / `batch4-*.md`。

### 16.1 组件库评估（待公开源核验）

| 候选 | license | 栈 | 体积 | 可定制 | 维护 | 结论草案 |
|---|---|---|---|---|---|---|
| Ant Design X (`@ant-design/x`) | **MIT**（npm 2.10.0，2026-10-29 更新；https://www.npmjs.com/package/@ant-design/x） | React；**注意**新版 peer 指向 antd^6，而本仓 antd^5 — 兼容性需实测或锁旧版 | 周下载约 10万级；精确 gzip **待测** | 可主题化，须压成 PriceLens 皮 | 维护活跃 | 仅可作对话壳；默认仍推荐现有 Copilot，引入前必须过 antd5 peer 实测 |
| 维持现有 Copilot 壳 | n/a | 已在树内 | 最小 | 高 | 在维护 | **默认推荐**，除非评估证明 X 明显减负 |

### 16.2 能力与缺口

- 已具：价格优势、价格预警、country-sync、状态骨架、语音入口（环境降级）  
- 缺口：GTM/预测深链动作随 B/C；禁止虚构工具  

---

## 17. ZCode 开发契约（分批）

| 批次 | Brief | 建议分支 / worktree | 目标 |
|---|---|---|---|
| 1 | `zcode-briefs/batch1-stable-tokens-agent.md` | `zcode/pricelens-stable-t428u-20261107` ← stable `1374114` | tokens + Agent 小改 + 回归 |
| 2 | `zcode-briefs/batch2-iterate-forecast.md` | `zcode/pricelens-iterate-t428u-20261107` ← iterate `a22d21e` | 预测四步/取证/销毛 |
| 3 | `zcode-briefs/batch3-iterate-gtm.md` | 同上或独立 gtm 分支 | GTM 工作台 |
| 4 | `zcode-briefs/batch4-iterate-agent.md` | 同上或独立 agent 分支 | 迭代 Agent 升级 |

通则：独立 worktree；显式 `git add`；不 push；不碰主仓 WIP；单测 + typecheck +（迭代）`build:iterate`；浏览器关键路径截图。

---

## 18. 待确认 / 阻塞项

1. Ant Design X：**license=MIT 已核**；剩余阻塞=与 antd5 peer 兼容性、bundle 体积实测、是否值得替代现有 Copilot 壳  
2. 情报/预测真实数据源与图片许可 SLA — **待产品/数据确认**  
3. 是否存在业务侧对「消毛」的另一套口径 — 代码侧仅「销毛」；若财务另有定义需书面确认  
4. 主仓 `feature/volume-detail-compact` 脏 WIP 与 t428u 合并策略 — **待 Yixuan 指示**（本轮不碰）  
5. Codex 两轮会话曾 TLS 断流 / apply_patch 失败；主 MD 由设计 worktree 补齐，mockup 仍为 Codex 产出  

---

## 19. 自检

- [x] A/B/C/D 覆盖  
- [x] 无编造置信度/假实时；数据分已具/待补  
- [x] 销毛口径确认并映射口述消毛  
- [x] 有现状图 + B/C/D mockup 图  
- [x] 稳定/迭代矩阵完整  
- [x] 四份 ZCode brief 可执行  
- [x] 业务源码未改（仅 `docs/design/**`）

---

## 20. 资产索引

```
docs/design/pricelens-t428u-design-20261107.md          ← 本文
docs/design/_step1-field-verify-20261107.md
docs/design/mockups/{b,c,d}-*.html
docs/design/mockups/shots/{b,c,d}-*.png
docs/design/shots/current/*.png
docs/design/zcode-briefs/batch{1,2,3,4}-*.md
```
