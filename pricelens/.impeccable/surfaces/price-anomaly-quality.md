# 异常价格守卫（全局数据质量口径 + 隔离态标注）

> 设计正典：`docs/design/2026-11-01-price-anomaly-threshold.md`（方案 A，§8 全按推荐拍板）。
> 本文件只记落地口径与代码落点。

## 目标

爬虫相对形态脏点（相邻两周 ±50% 以上的假尖峰）不再污染任何派生计算：判定进
`buildSeries` 取数层，全站（价格走势/量价/多平台/宽表/预警）同源打标；原值永远
可见（不吞点），只是隔离点退出可信链。

## 拍板口径（2026-11-01 19:04，§8 全按推荐）

1. 默认开启 50%。
2. 持续位移判据 K=2（新水平维持 ≥2 点 → 真实变化，只标注不隔离）。
3. 不进 URL（默认店铺先例；`LPL3.filters` 零改动）。
4. 涨跌对称单阈值。
5. 行级 5% 低侧守卫维持现状，只在「数据质量」块说明句文档化。

## 落点

- **判定纯函数** `dataModel/anomaly.ts · detectSuspects`：对上一**原始**有值点比环比
  （prev 跨缺采延续，与 alerts/chartModel/weekDetail 三处现行公式一致）；「回到可信
  水平」的点不是候选（脏点后干净回弹不误伤）；候选依次过 人工裁定 → 促销带下跌 →
  RRP 同向同步 三类豁免；V 型（下一有值点回到可信水平）→ `quarantined`；
  持续位移 → `pending/shift`；末端 → `pending/tail`（最新一周绝不静默剔除）。
- **取数层** `aggregate.ts · buildSeries`：产点后追加判定 pass 写 `SeriesPoint.suspect/
  suspectReason/suspectWow`；月/季先在构成周序列判一道（隔离周不进桶聚合）、桶级再判
  一道（双保险）。周 id 人工裁定命中其构成月/季桶。
- **图上隔离态** `chartModel.ts（buildOption 断线 + buildLabelPlan 标签排除 +
  buildSuspectBadges/suspectBadgeText/suspectTitleText）`、`Chart.tsx（DOM 覆盖层）`：
  隔离 = 断线 + 空心灰点（mute 描边白芯）+ 琥珀胶囊「疑 ±X%」；待核对/待确认 = 实线 +
  琥珀空心点 + 胶囊；已确认 = 蓝「已确认」小标。`anomalyActions`（价格/多平台图）时
  胶囊可点弹裁定浮层（确认真实价格 / 标记异常 + 查看商品页）；量价页裁定入口在
  单周明细卡（指针层接管图面）。
- **可信链消费方**：`tableModel.recentFourWeekChange`（隔离周不进均值）、
  `alerts.ts buildAlerts`（隔离周不触发调价/折扣/平台价差、prev 链与 own-gap 现价取
  最新可信周）、量价极差卡/标注尺（隔离周不进极值；区间全隔离 → 空卡「区间内无可信
  价格」）、量价环比（对上一可信点 + 「跨 N 隔离周」小注；观察周隔离 → 「已隔离，
  不计环比」）、销毛带与明细卡（隔离周「价格不可信」不造销毛）、月/季聚合。
- **配置** `pages/config/DataQualityBlock.tsx`（配置页「数据质量」块）：开关 +
  档位 Segmented（关闭/30%/50%/自定义 10–90 整数）+ 人工裁定清单（撤销）。
  存 `LPL3.config.anomalyRule` / `anomalyMarks`，保存广播 `CONFIG_CHANGED_EVENT`。
- **刷新通道** `state/configStore.ts · useConfigVersion`：配置版本号进各页
  buildSeries memo 依赖（价格/量价/多平台/AlertCenter.useAlerts），配置一改立即重算。
- **只读 chip** `components/AnomalyQualityChip.tsx`：价格走势/量价/多平台工具行右端
  常驻（预测页不放——模拟数据）；390px 短文案「质量 ≥50% · 隔离 2」；点击 Popover
  （规则一句 + 本页隔离点清单 + 查看配置）。宽表折后价原值照显 + 琥珀「疑」上标。

## 例外与边界

- 人工裁定按点生效（exempt 参与计算并标「已确认」；isolate 隔离且退出可信链），
  清单同点覆写、可撤销；撤销后回自动判定。
- 促销放行点参与可信链：档期后回升周若相对促销价超阈，按规则可成「待确认」候选
  （真实大促降幅通常远低于阈值；构造的极端档期见 anomaly.test）。
- 连续异常串保守处理：贴近脏水平的后续点不成候选（宁可漏——人工隔离一次即可）。
- 真实数据锚点：DE 穿戴 Galaxy Watch 8 Classic 46mm 2026W39 = 瞬态隔离点；
  RU 手机 iPhone 16 Pro Max 2026W22 = 持续位移待核对点（anomaly.test 端到端钉住）。

## 有意偏差（相对设计稿，QA 报告备案）

- 裁定入口用「图上胶囊 Popover（含 Popconfirm 确认）」而非悬停 tooltip 内按钮：
  tooltip 本为 pointer-events:none 的只读浮层，胶囊即点位本位、命中区更大；
  tooltip 内仍补了打标说明行（事实层）。
- 预警解释卡的「该周价格已隔离」状态位未做：隔离周不再产生预警，无处回看展示；
  如需历史预警回看态另轮补。
