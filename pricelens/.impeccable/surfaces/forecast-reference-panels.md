# 量价预测 · 参考卡作业化重设计（forecast-reference-panels）

> 隶属 `forecast-workbench-v2` 页面的层②「量价参考产品」卡；本文记录
> 2026-11-04 三轮重构（规格 `design-proposals/reference-card-ops-redesign.md`
> §7 P0 全项落地）的局部决策，替换 2026-11-04 二轮（A5）的旧决策——
> **共享时间轨、会话内草稿、「唯一差异 = 补录」均已废止**。权威优先级
> 低于 PRODUCT.md / DESIGN.md 与用户当前拍板。

## 目标

量价参考卡是**历史参照层 + 可恢复事件作业区**：预标（fixture，稳定 id）
经本地覆写、补录经独立 localStorage 工作区，两者合并为统一有效事件
（`EffectiveReferenceEvent`）供图 / 名录 / 编辑器 / 参考回放 / 时段读数消费。
补录、覆写、窗口、颜色**绝不进入** `WorkbenchParams` / `computeWorkbench`；
`prevGenReferenceId` 受控语义原样。

## 范围

`pricelens/src/pages/forecast/ReferencePanel.tsx`、`ReferenceVolumeChart.tsx`、
`ReferenceEventComposer.tsx`、`ReferenceTimeTrack.tsx`（新）、
`ReferenceEventList.tsx`（新）、`referenceEventModel.ts`（新，纯函数）、
`useReferenceWorkspace.ts`（新，localStorage 工作区）、
`referenceEventTypeStore.ts`（新，浏览器级类型库）及对应测试；
`volume/VolumeBars.tsx` 只加了可选 `axisSide`（默认 'right'，量价页几何不变）。

## 信息层级（卡内自上而下）

1. SectionHead「量价参考产品」+ 仅历史 / 模拟历史两个状态标。
   （无 hint、无 IoBar、无常驻教程、无「补录 · 会话内」常驻 chip。）
2. 参考回放条（仅有信号时）：标题「参考回放」，条目 = 产品 · 周段 · 标题，
   补录带「草稿」标；**不自动消失**（手动关 / 下一信号替换）；无匹配显
   「无可回放事件」；点击定位未锁定面板（eventType 匹配 + 窗口中心距离
   稳定排序，每面板 1 条）。
3. 工具行：卡级「同周龄同步」（默认关）+「未持久化」警示（写失败时）+
   「＋ 添加参考」下拉（分组「上一代 · 主链 / 友商 · 对照」；空态
   「参考池为空 / 已全部添加」）。
4. 面板网格（≤2 均分、>2 单一横滚容器 minWidth 880）：每面板 = 头
   （品牌点 + 名 + 「主链 · 同周龄校正」/「仅对照」+ 条件「草稿 N」+
   条件「未完成」+ ＋事件 + ×）→ 拖选操作条（仅拖选态）→ 图（左量右价）
   → 本面板时间轨 → 统一名录 → 主链读数（首预测周 W45 · 同周龄比值 ×…）。
5. 卡底：撤销操作条（最近一步 · 撤销，20 步 before/after patch 重放）。

## 每面板独立时间窗（替换共享时间轨）

- `ReferenceTimeTrack`：trackColors 轨道 + 两端拖柄 + 整段平移 + 键盘
  （←/→ 1 周、Shift 4 周）+ 窗口预设（全周期 / 最近 16 周 / 当前事件窗）+
  单面板锁（锁图标 + aria-pressed + title；锁定后同步 / 回放定位 / 名录定位
  均不改写）。刻度 = 生命周期周龄 W1…W末周（不走日历 axisTickPlan 的例外
  约定保留）。
- 窗口只决定查看范围，不裁剪模型输入、不重算同周龄比值；最短 8 周；
  产品不足 8 周显示全长并禁缩放。
- 面板构成 / 各面板窗口 / 同步 / 锁定存 `usePageViewState`
  键 `forecast.referenceView.<scopeHash>`（sessionStorage）；悬停与拖动
  瞬态不持久化。同周龄同步 = 数值周龄（非日历、非纵轴）。

## 图（ReferenceVolumeChart）

- **左量右价**：量柱复用 `volume/VolumeBars`（新可选 `axisSide='left'`，
  量价页默认 'right' 不变）+ 价格刻度画在绘图区右侧（$）。
- 图顶事件轨（≤2 lane）：时段事件画 □────□（端点方形锚 + 连接线），单周
  沿用虚线 + 方形锚；第三条重叠起聚合 +N，点击回填名录只看集合。文字
  （标题 / 周段）只留在名录与详情，图内锚点无长 title；可访问名称含周段
  与标题（role button + 键盘等效）。
- 图例收敛「销量 / 价格 / 档期 / 事件」；缺数注记「缺数 W13、W14 · 不计 0」；
  图 aria 名按实际左量右价并提供名录文字替代。
- 选区两语义：手动拖选 = 区间读数（价 / 量端点取首个 / 末个**实际有效周**
  并标注）；拖选事件时段模式 = 只回填起止周（W起–W止 · N 周），无量价读数。
  事件锚点击 = 统一选中态（selectedEventId），与名录双向联动（hover 加粗 +
  弱竖线；click 等价；focus 滚动定位）。

## 事件作业（统一有效事件视图）

- fixture 预标带稳定 id（`workbenchFixture` LifecycleEventSeed.id）；本地
  覆写以 `productId + sourceEventId` 为键并保存 `baseFingerprint`（源变更
  显「源已更新」，不静默覆盖）；补录软删除；两者合并为统一名录行标
  「预标 / 预标 · 已改 / 草稿」。fixture 原始对象永不原地修改。
- 编辑器（新增 / 编辑共用）：类型（类型库下拉）+ 类型色块入口（色板 8 色
  = tokens.referenceEventPalette / 原生取色器 / hex / 恢复默认；颜色按类型
  生效，写 `LPL3.config.referenceEventTypes`，不反写主图）、起止周闭区间
  （起周 > 止周自动跟随；时长派生）、图上拖选、标题（≤40 必填）、说明
  （≤200 必填）、「参考读数（选填）」默认收起（幅度 / 影响时长 / 衰减，
  仅历史标注不进模型）、状态行（本地草稿 / 未持久化 + 重试）、保存事件 /
  收起（保留草稿）/ 丢弃草稿（确认 + 撤销）/ 恢复预标。
- 工作区（`LPL3.forecast.referenceWorkspace.<scopeHash>`，localStorage）：
  已保存补录 / 覆写 / 软删除 / 20 步撤销 / 编辑器草稿自动保存（刷新后
  「未完成」点击恢复，不自动抢开弹层）；删除面板不清事件（重加恢复）；
  读写经 sanitize（坏记录逐条隔离；schemaVersion 变化原值落备份键）；
  写失败显式「未持久化」+ 重试（不静默兜底）。

## 事件时段读数（确定性公式，无因果词）

只读本参考产品 `points / pricePoints`：期均周销 + 紧邻等长前段（可用前缀
并显示实际周段）+ 变化率（前段均值 0 / 任一侧有效周 <2 → 「无法计算」，
不补 0）+ 价格首 / 末有效点（带实际周；首值 ≤0 只显绝对差）+ 覆盖率
（有效周 / 事件周）。预标 impact 只作「预标参考 …（仅预标，不参与上述
计算）」分栏。

## 状态语义

- 双轴常显（左量右价）；缺采周不造 0（柱不画 / 实线断开 / 灰虚桥接 /
  读数「—」）；拖选区间各面板独立；窗口独立（同步开启时周龄联动）。
- 事件色彩都有文字类型；状态一律「文字 + 色」双通道；类型不可用时以
  内置「其他」显示兜底并标「类型不可用」（原 typeId 保留）。

## 响应式行为

1440/1280：≤2 面板均分；>2 横滚（每面板自己的时间轨随列滚动）。390：
卡内横滚（minWidth 880），页面级无横向溢出。

## 例外

- 生命周期周为相对周龄刻度（W1 = 上市首周），不走日历 axisTickPlan。
- 面板构成 / 窗口 / 同步 / 锁定 = 会话视图态（sessionStorage）；事件作业 =
  localStorage 工作区（跨页签长期）——两者分开，均不进主链参数草稿。
- 「重置基准」只清主链参数草稿，不清参考工作区（独立清空入口 P1）。
