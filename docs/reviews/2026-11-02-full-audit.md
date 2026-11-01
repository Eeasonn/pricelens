# PriceLens 全量审计报告(2026-11-02)

> 分支 `fix/full-audit-2026-11-02`(基于 `feature/quality-pill-2026-11-01` @ `18d7616`)。
> 任务:全量检查 + 修复发现的问题,不新增功能、不改变既有设计意图与行为。
> 本报告为该轮审计的完整交付物;测试日志另存 `logs/round1-data-and-state.md`、`logs/round2-browser-matrix.md`、`logs/round3-cross-review.md`(不入库)。

## 0. 结论速览

- **四轮审计**(数据层探测 → 浏览器深测矩阵 → 白盒交叉审视 ×2 → 最终回归),共执行约 **370 项自动化断言/探测点** + 人工代码复核约 1.1 万行。
- **发现并修复 9 项缺陷**,分两个提交:`059090a`(图表层 4 项)、`f94bb24`(页面层 5 项);每项均附回归断言或浏览器验证。
- **8 项查证后排除/备案不修**(含 3 项 UI 不可达的防御性观察),逐项给出理由。
- 回归:**vitest 54 文件 559 测试全绿**(基线 553,新增 6)+ `npm run check` 全链绿(design:check / design:lint / typecheck / verify 47 项 / build 单文件同步)+ 修复后浏览器全量复跑无回归。
- 全程真实数据(2026-W19–W42 事实表),**无任何构造/伪造数据**;未 push、未部署、未读取凭据。

## 1. 环境与方法

- 环境:worktree `~/lpl-full-audit`;dev server `localhost:5214`(防串其他会话);Playwright(chromium,headless,channel=chrome);视口 1440×940 与 390×844。
- 数据层探测:照 `verify.mjs` 的 tsc 编译注入方式,直接以真实数据调用 `buildSeries` / `buildOverviewMatrix` / `buildAlerts` / `computeYAxis` 等纯函数(脚本会话级,不入库)。
- 浏览器测试:控制台错误/页面异常/失败请求全量收集(存量第三方警告白名单除外);状态注入走 `addInitScript` 预写 localStorage(先于应用挂载)。
- 白盒:两个 general-purpose 审查代理分别通读图表层 9 文件与页面层 14 文件,**所有候选均经人工逐条验证后**才决定修复与否。

## 2. 测试矩阵(页面 × 操作 × 数据条件)

### 2.1 第一轮:数据层 / 状态层 / URL(probe1 196 断言 + b1/b3/b4/b6 系列)

| 场景组 | 覆盖 | 结果 |
|---|---|---|
| buildSeries 极端 query | 0 组;重复组;坏 SKU/坏型号回退;反向日期范围;起止同桶;超大数据外范围;全平台并集;同型号全 SKU 大组;24 国 × 产业 × 3 粒度 × 2 币种全扫(1320 系列) | 全过:无崩溃、price/rrp 恒为正有限值 |
| buildOverviewMatrix | 24 国全产业 × USD + RU 本币抽查(343 档位带);极值下标一致性 | 全过 |
| buildAlerts | 空订阅;全部 own 系列(378 条);阈值 0 / 100%;竞品订阅(无平台价差);不存在系列;key 唯一性 | 全过 |
| 生命周期/平台价差 | 80 own 型号 launchInfoOf/lifecycleDeltaOf;24 国平台价差升序 | 全过 |
| computeYAxis | 空数据/全 null/单点/全同值/0.5 vs 50000 悬殊/负值注入/sliderScale 0.1 与 9(钳制 [0.5,3]) | 全过 |
| URL 直达极端参数(20 组) | 反向 rs>re 忽略;非法桶 id/国家/产业/主品/平台/店铺/pt/agg/g/cur/p;跨国产店铺;单周/单月/超宽范围;MX 本币大杂烩 | 全部静默兜底,无崩溃 |
| localStorage 极端载荷(19+8 组) | 坏 JSON/null/空对象/v9 旧版/缺 required 字段/mains:null/坏 platform/他国渠道/8 空对卡/9 卡超限/主品+20 对比/8 卡×7 对比/竞品做主品 | 全部兜底;超限截断;空对回默认(见观察 F3) |
| 数据特征摸底 | 最长型号名 35 字(Deco BE65-5G Router);252 个产品名含括号类字符;price 缺失仅 6 行、0 价 0 行;price_usd ∈ [3.98, 15707.51] | 无危险字符(`〈〉"'&\`)型号名 |

### 2.2 第二轮:浏览器深测矩阵(b7–b21 系列,16 组场景)

| 模块 | 场景 | 结果 |
|---|---|---|
| 预警中心 | 空态;添加监控(combobox 搜索 Pura/iPhone);矩阵四列(华为四类/苹果无平台价差);全局阈值 Popover+滑杆;四类开关;跳看板 | 全过 |
| 配置页 | 竞品对标编辑浮窗开/取消;产业四向切换;异常价格守卫 关/30/自定义/回 50;默认店铺块;汇率块(只读) | 全过 |
| 量价页 | 本币;月粒度;拖选区间;组内对比;隐藏/恢复/全部恢复/回阅读;国家 DE | 全过 |
| 390 窄屏 | 六页 scrollWidth 溢出 = 0px、0 控制台错误;时点摘要面板展开(布局换行防护,无白板) | 全过 |
| 图表深交互 | 悬停 tooltip(环比/RRP/取证/快照);快照浮窗;促销权益开关;大促档期开关;变化提醒滑杆极小;Y 轴弹层上下限 1/99999/清空/箭头连点 | 全过 |
| 状态保留 | 月粒度+本币+隐藏对比 → reload → URL/localStorage/页面三态完整保留 | 全过 |
| 跨页一致性 | Pura 最新价 **$1,021** = 摘要条 = 复制明细 TSV 末列 = 量价页(三处同源);Agent 问价回答同值 | 全过 |
| 导出 | 复制明细 19 行 TSV(24 周表头);复制价差 3 行;季粒度表头 2026Q2–Q4;月粒度 2026-05–10 | 全过 |
| 竞态 | 币种连点 20 次;国家连切 6 次;页签混合连切 16 次(含返回看板) | 0 错误,落点完整恢复 |
| 离线单文件版 | file:// 打开 `PriceLens.html` 六页 + 币种/粒度交互;file: 协议 Agent 回退本地 | 全过(alerts 空态 166 字为正常) |
| 渠道浮窗 | RU 单平台;DE 三列级联(Amazon.de/MediaMarkt/Otto.de;卖家 99 周) | 全过 |
| 守卫金标复测 | DE wearable ⋯ 菜单「异常价格守卫 ≥50%」状态行在位 | 全过 |
| platform-gap 低价 | 全国家全 own 系列 1903 条预警(阈值 0.1% 放大触发面)无一 gapHigh/Low 取整到 0 | 无真实触发点(见备案 O-2) |
| Agent | ⌘K 唤起;问价($1,021/DNS,与看板一致);追问 | 全过 |
| 键盘 | 量价 ←/→/Home/End;dashboard Tab×8/Esc | 全过 |

### 2.3 第三/四轮:白盒交叉审视 + 修复验证

- 图表层 9 文件、页面层 14 文件全量通读(两个审查代理)+ 人工复核全部候选(16 个),确凿 9 项修复、8 项排除/备案(见 §3/§4)。
- 修复后全量复跑:b1 冒烟、16 连切、三方一致性(4 态)、离线版——无回归。

## 3. 发现并修复的缺陷(9 项)

### 提交 `059090a`(图表层 4 项)

**Bug#1 分离面板下钻丢失平台口径**(正确性)
- 现象:分图模式下面板图点月/季圈点下钻,弹窗价格线与面板折线口径不一致——钉定平台(如 Amazon)的面板线下钻后回落「自动全渠道最低价」重查,整条线数值可能不同。
- 复现:≥2 张卡(分图)→ 平台药丸为某产品钉定非默认平台 → 月粒度 → 面板图点数据点下钻。
- 根因:`index.tsx` `makePanelDrill` 构造的 group 缺 `platform` 字段;合并图 `onDrill` 带 `platform: s.platform ?? null`,两处不对称。
- 修复:补齐 `platform: s.platform ?? null`(与合并图逐字段同口径)。验证:typecheck + 全量回归;`buildSeries` 消费 `g.platform` 的链路为既有测试覆盖。

**Bug#2 价格变化徽标的环比基线包含已隔离点**(数据可信链)
- 现象:异常守卫隔离一个瞬态尖峰后,次周恢复点按 `恢复价/被隔离价 − 1` 显示大幅 ↓X% 徽标(如 500→101 会显示 ↓80%),误导。
- 根因:`chartModel.buildChangeMarks` 的 prev 基线链只看 `price`,不看 `suspect === 'quarantined'`;违反守卫「隔离点退出计算」契约(同族 `recentFourWeekChange` 已剔除,此处漏剔)。
- 修复:隔离点不产徽标、不进基线链(与 `detectSuspects` 的 lastTrusted 同语义);exempted/pending 照常参与。
- 回归:`chartModel.golden.test.ts` 新增「隔离点不产徽标、不进 prev 基线链」用例(100→500 隔离→101 恢复:恢复点不标,后续 90 相对 101 标 −10.9%)。

**Bug#3 已确认(人工裁定)点被永久压掉变化徽标**(信息丢失)
- 现象:点「疑 ±X%」胶囊 → 裁定「确认真实价格」后,该点只剩「已确认」胶囊(不带幅度),↓/↑ 徽标也被压制——裁定后信息反而变少。
- 根因:`Chart.tsx` 徽标压制集含全部 suspect 态;「疑/待核对胶囊已带 ±X%」的压制理由对 exempted(胶囊只有「已确认」三字)不成立。
- 修复:压制集排除 `exempted`(quarantined/pending 仍压制,避免叠压)。

**Bug#4 单桶窗口时间轨道重复 key**(React 契约)
- 现象:筛选范围/查看窗口只有 1 个桶时,分离面板时间轨道渲染两个 `edge-tick-{同值}` 同 key 兄弟节点(duplicate key 警告 + reconciliation 错位隐患)。
- 根因:`SplitTimeTrack.tsx` `{[markS, markE].map(...)}` 在 s===e 时未去重。
- 修复:`[...new Set([markS, markE])]`。回归:新增 `SplitTimeTrack.test.tsx` 组件测试 2 例(单桶/多桶,断言无 same-key 警告)。

### 提交 `f94bb24`(页面层 5 项)

**Bug#5 情报中心汇率币种随国家错标**(事实性错误)
- 现象:国家切到德国后,情报中心 KPI/汇率卡/市场信号显示「USD / EUR 80.8664」「数值越高表示 1 美元可兑换更多 EUR」——数值实为 R国 CBR 的 RUB 演示序列,币种标签张冠李戴(EUR 实际约 0.9)。
- 根因:多国化(2026-10-20)后 `fxPair` 仍用 `getLocalCurrency()` 随国家拼接,而 `FX_WEEKLY` 演示序列是 RUB。页面虽有「演示数据」Tag,但演示不等于可币种错标。
- 修复:币种标签与演示序列一致固定 `USD / RUB`(来源文案本就写「演示 CBR 序列」);多国真实汇率序列接入后再随国切换。浏览器验证:DE 下显示 USD/RUB、无 USD/EUR。
- 说明:同页「{国家} {产业}大盘」等演示 KPI 数值随国家变标题属演示内容已知边界(页面级「演示数据」Tag 承载),未改动。

**Bug#6 渠道选择弹层交互态被父渲染清空**(交互缺陷)
- 现象:多平台对比 → 店铺 chip 筛选弹层内输入搜索词/展开平台列 → 鼠标悬停任一店铺 chip(图例高亮)→ 搜索词被清空、展开列跳回默认。
- 根因:`ChannelSelectPopover` 重置 effect 依赖 `[cc, skuIds]` 数组引用;`PlatformCompareView` 传内联 `skuIds={[repSkuId]}`(每次渲染新引用),父组件 hover setState 触发 re-render 即误重置。
- 修复:两层——①组件 effect 依赖改内容签名 `skuIds.join('|')`;②调用方 `repSkuIds` useMemo 稳定化。回归:新增 `ChannelSelectPopover.test.tsx` 3 例(同内容新引用保留/真变重置/切国重置)+ 浏览器悬停验证搜索词保留。

**Bug#7 预警页「只看正常」误显「历史 0 条」**(文案误导)
- 现象:状态筛选「只看正常」且存在最新预警时,概览条显示「这些系列在当前类型下没有最新预警 · 历史 0 条」——历史并非 0,是被口径刻意隐藏。
- 根因:`filtered` 在「只看正常」时早退为 `[]`,尾注 `filtered.length !== latestFiltered.length` 恒真,输出「历史 0 条」。
- 修复:该分支不显示历史尾注。浏览器验证:无「历史 0 条」。

**Bug#8 月粒度桶 id 裸显**(显示粗糙)
- 现象:时间粒度切「月」后,情报中心标题/汇率卡与 Agent 面板上下文 chip 显示「截至 202605–202610」(裸 id)。
- 根因:两处 `formatBucket`/`rangeLabel` 只格式化周(`2026W19`),月未转 `2026-05`(AnomalyQualityChip 已有同款转换)。
- 修复:周/月/季三态格式化,与全站桶文案口径对齐。

**Bug#9 Agent 上下文 chip 非手机产业显示英文码**(显示不一致)
- 现象:产业切穿戴/平板/音频后,Agent 面板 chip 显示「RU · wearable」等原始码。
- 根因:硬编码三元 `industry === 'phone' ? '手机' : state.industry`,未用现成的 `INDUSTRY_LABELS`。
- 修复:改用 `INDUSTRY_LABELS`。浏览器验证:显示「穿戴」。

## 4. 查证后排除 / 备案不修(8 项)

| # | 事项 | 结论/理由 |
|---|---|---|
| E-1 | 分离模式 Y 轴上下限钳制基准用合并图 yCfg(输入框显示 splitYCfg 值) | 语义漂移小(仅吸附格边界可能不贴分轴);共享限位 + 双 Y 模型的固有权衡,改动易引入新的不一致;`computeYAxis` 对非法覆盖有整体回自动兜底。备案 |
| E-2 | 隔离点参与缺采跨接桥/端点标记 | 非缺陷:隔离「不吞点、原值可见」是设计(空心点/胶囊画在原值位),桥线锚点与之一致 |
| E-3 | 容器 <160px 时图区白板 | 实测不可达:390 视口 + 时点摘要展开,窄屏布局防护(面板换行到图下),无白板无溢出 |
| E-4 | focusKey 在系列数降到阈值以下后残留 | 鼠标移出即自愈(`onMouseLeave` 清除);现网触发路径已随「图例外置 + 隐藏入口退役」关闭 |
| E-5 | `navBus.alertsFocus` 全库无写入方(总览→预警定向聚焦死分支) | 总览页在 `DISABLED_PAGES`(2026-10-20 起禁用),入口已随页签退役;死代码无用户影响,接线属新功能,备案 |
| E-6 | PageHeader 声明却忽略 `title` prop | 无运行时影响,接口遗留;清理属代码整洁非缺陷 |
| E-7 | AgentContext.send 并发守卫用 state 非 ref(同 tick 双发窗口) | React 18 离散事件逐个 flush,实际触发概率趋零;引入 ref 同步的复杂度风险大于收益。备案 |
| E-8 | `buildAlerts` platform-gap 的 `gapHigh/LowPrice` 用 `Math.round` 而非 `displayRound`(<$1 低价会取整到 0) | 口径不一致属实但**真实数据无触发点**(全国家全 own 系列 1903 条预警无一为 0;displayRound 注释提的 $0.3x 配件无多平台价差组合)。按「不改既有行为」不动,备案防未来数据触发 |

**防御性观察(极端持久化注入才可达,正常 UI 全入口有去重/校验)**
- F-1:`readPersistedState` required 校验中 `alertTypes/alertThresholds/alertProducts` 缺失宽容跳过,唯 `alertSubs` 缺失作废整包(宽严不对称;写侧恒全量,用户不可达)。
- F-2:手工注入 8 张同产品卡可渲染但触发 React duplicate key 警告(建卡所有 UI 入口按 selKey 去重,正常操作不可达)。
- F-3:`main=null` 空对卡刷新后被回填默认卡(`applyScopeDefaults` needMain 语义);UI 无建空对卡入口(添加即带主品、删除删整卡),不可达。

## 5. 回归测试结果

| 项 | 基线 | 修复后 |
|---|---|---|
| vitest | 52 文件 553 测试 | **54 文件 559 测试全绿**(+6:buildChangeMarks 隔离基线 1、SplitTimeTrack 2、ChannelSelectPopover 3) |
| verify(数据/契约断言) | 47 项 | 47 项全过 |
| typecheck / design:check / design:lint | 过 | 过 |
| build + 根 `PriceLens.html` 逐字节同步 | 过 | 过(两提交均带同步后的单文件版) |
| pre-commit hook 全链 | — | 两提交均全绿 |
| 浏览器(修复后复跑) | — | b1 八页冒烟 / 16 连切 / 三方一致性 4 态 / 离线版 / 第二批修复逐项验证,全部通过,0 新控制台错误 |

## 6. 存量第三方警告(非本轮引入,不修,与前轮 QA §4.6 口径一致)

- antd RangePicker `dropdownClassName` 弃用警告 ×3;React `border/borderLeft` 混用警告(面板根样式既有写法)。
- React `findDOMNode`/StrictMode 弃用警告(产品选择浮窗打开时,antd trigger 组件引发,仅 dev 模式可见)。
- antd `message` 静态调用无法消费 context 警告(dev)。

## 7. 尚未修复或不确定的问题

即 §4 的 E-1/E-5/E-7/E-8 与 F-1/F-2/F-3——均给出原因;其余无遗留。另注:本轮全部探测脚本为会话级(/tmp),关键行为已沉到仓库测试(6 个新用例);`PriceLens-功能一览.html` 等历史演示文件未在本轮审计范围(非产品入口)。
