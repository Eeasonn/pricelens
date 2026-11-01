# PriceLens 全量审视报告（2026-11-01）

> 范围：commit d2823c1（量价走势 demo 收口 + 量价预测 Lifecycle OS 简单版）之上，本会话完成 4 项拍板落地 + 全仓库审查修复。
> 审查方式：3 个并行只读审查 Agent（量价页 / 预测页 / 全站横切，均实跑模型与真实数据核验）+ Playwright 双视口（1440/390）浏览器审计 + 完整静态链。
> 边界：并行会话未提交 WIP（agent/**、AlertCenter、Copilot/**、DataHelpModal、PageHeader、App、index.css、tokens、FiltersContext、navBus、alerts、AlertsPage、server/**）一律未审未改未提交。

## 一、拍板项落地（Eason 2026-11-01 15:31：4 项全按建议处理）

| 拍板项 | 落地 |
|---|---|
| ① 预测页「我司」×3 | 按 114 轮无我司铁律改为「华为份额压力」：DriverWaterfall 边界句、fixture E04 detail、竞品因子 boundary 三处；surface brief 例外记录同步改写 |
| ② 量价点击=选单周 / 观察列回落=区间末周 | d2823c1 已实现（PointerShield 按下即单周起选；activeIdx = 悬停 ?? 区间末周 ?? 窗口末桶），本会话浏览器实测确认：单击出「10-07 — 10-07×」胶囊、键盘 ← 明细卡 W41→W40、拖选出区间、× 清除回提示 |
| ③ 预测页币种 / 区间带 / ChartContentBar | ①挂载 ChartContentBar 三页签（页头下方白底行，预测页可一键切回价格/量价走势，aria-current 正确）；②范围行改「币种 USD（固定）」独立 chip，全局筛选范围不再展示无效的全局币种；③区间带维持不画——fixture 只有点估计（P50），无残差/分位数字段，画带即造数（03 交接文档允许只展示点预测），例外与理由已写入 surface brief |
| ④ P2-3 档位 chip 与轴刻度易混淆 | 档位梯子顶部加「价格档位」常驻小标（8px，Chart.tsx 主图轴区 + SplitAxisColumn 分离轴列同款；分离轴列贴绘图区顶定位，避开 Y 轴上下限输入盒） |
| ④ P2-4 标注尺轻微越界 | 标注尺白底标签框钳入绘图区（clampRulerX）：选区贴右缘价格尺标签不再压销量轴列、贴左缘销量尺标签不溢出面板左缘；全区间选区实测标签均在绘图区内 |

## 二、已修 bug（本轮审查发现并直接修复）

### P1（数据错标 / 状态串台级）

1. **图例药丸配置 chip 挂错配置**（`BrandLegendStrip.tsx` romTextOf）：原按型号维表首行取 romram，多配置型号的非首配置系列全部显示首行配置（数据中 159 个多配置型号受影响，如 iPhone 16 Pro Max 12+256 系列显示「12+1 TB」）。改为按系列 key 后缀（本系列自己的配置）反查。
2. **价格看板查看窗口跨页换粒度后静默错位**（`index.tsx`）：`dashboard.windowIds` 是会话态但无粒度戳——在量价页把粒度从周改为月/季再切回，旧桶 id 被字符串序兜底错读（周月季 id 字典序不可比，窗口落到错误时段或被钳到端点）。补 `windowIdsGran` 粒度戳 + 挂载自愈（与既有 panelWinsGran 同款）。
3. **量价主产品阅读视图被残留独立窗口冻结**（`VolumePrice.tsx` effWins）：组内对比关过「时间轴同步」留下的 panelWins 泄漏进阅读视图——图冻结在旧独立窗口、时间轴显示共享窗、拖时间轴图不动。timeSynced（阅读视图/开同步）恒用共享窗口。

### P2（口径失真 / 承诺未兑现级）

4. **Y 轴上下限不随取价渠道变化复位**（`index.tsx` limitScopeSig）：注释承诺「内容签名含渠道」但 contentSignature 不含 platform——经平台小药丸/店铺同步换渠道后旧 yMin/yMax 继续裁新渠道数据。签名追加各组 platform。
5. **销量估算缓存不随默认平台店铺配置失效**（`volume.ts` volCache）：促销档期平台锚点随默认店铺变化，但模块级缓存整会话不失效——Config 页「看板取价即时生效」承诺落空。监听 CONFIG_CHANGED_EVENT 清缓存（与 tree.ts latestCache 同款）。
6. **中间删面板后独立窗口/销量轴限位错位串面板**（`VolumePrice.tsx`）：面板态数组按下标 fit，删中间面板时被删面板的 panelWins 平移到下一张；面板成员变化时 panelWins 一并清（volumeLimits 已由 scaleResetKey 覆盖）。
7. **预测页促销滑杆「当前基准」提示锚在中位指向非基准值**（`WhatIfDraft.tsx`）：量程 0..15 基准在最左，中位 hint「当前基准」浮在 +7.5 处误导；静止读数显「+0」。hint 改「基准 · 无增量 / +8 / +15」，format 加零值分支。
8. **周账事件列漏标促销透支周**（`WeeklyLedger.tsx` + `forecastModel.ts`）：模型对活动后一周施加 0.92 透支（W8/W21 需求凹陷）但事件列显「—」。模型补 promoEvent 字段（窗口含 end+1），周账显示「促销 · X」/「促销后回落 · X」。
9. **万单位把混合量级小值抹成「0万」**（`periodSummary.ts` + `VolumePrice.tsx`）：区间跨 [300, 15000] 时极差卡最低显「0万」。新 shouldUseWanUnits：全部非空值 ≥1 万才开万档，否则千分位（含测试）。

### P3（呈现与边界）

10. **明细卡环比在窗口首桶误显「—」**（`VolumePrice.tsx`）：prevPrice 原取视图切片，窗口首周即使全量域前一周有值也显缺采。改取全量域。
11. **PointerShield 拖选越出绘图区时冻结**（`PointerShield.tsx`）：拖过左/右缘选不中边缘桶。拖动中钳到边缘桶。
12. **周账脚注硬编码「价格 × 86%」**（`WeeklyLedger.tsx`）：改由账面周数据推导（公司净收入/价格），fixture 调渠道费率后不失真。
13. **What-if 供给放大组合可把期末库存推负且无解释**（`WeeklyLedger.tsx`）：供给 +20% × 降价 −10% 时库存最低 −878（SO 越过 Sell-in 流入）。模型保留「期末 = 期初 + SI − SO」恒等式（不静默钳 0），负值标红 + 悬停提示 + 脚注「供给欠配信号」。
14. **DriverWaterfall 容器 aria-label 无 role 不被读屏播报**：加 role="group"（与页内其他卡对齐）。
15. **分离轴列断轴省略号在轴列宽 0 时负偏移压面板**（`SplitAxisColumn.tsx`）：chrome.visible 为 false 不渲染。
16. **情报中心汇率卡「区间最低/最高」为全年常量**（`IntelligenceCenter.tsx`）：改按选定区间切片计算。

### 补测试（536 全绿，+9 组）

- `forecastModel.test.ts`：极值与钳制不变量 5 组——程序化极值草稿全字段有限、促销响应钳 0（−120 盖过窗口基准 1.128）、竞品压力钳制只清零压力 ≤ −1 的周且衰减后恢复（无跨周传染）、可达滑杆组合 SO ≤ 可供量且库存非负、供给放大组合库存可穿零（语义钉住）。
- `periodSummary.test.ts`：shouldUseWanUnits 4 组（混合量级/缺采/组合格式化）。

## 三、未修问题（分级 + 原因）

| 级别 | 问题 | 原因 |
|---|---|---|
| P2 | 预测页双导航当前项：页头管理页签与图表页签同时高亮「量价预测」，同页两个 aria-current="page" | 页头 TABS 在并行会话 WIP 文件 PageHeader.tsx 中，本轮不可动；建议 WIP 落地后把页头该页签退役或退为普通链接（ChartContentBar 已成主入口） |
| P3 | antd 弃用告警 ×2（RangePicker dropdownClassName / Tooltip destroyTooltipOnHide），控制台 error 级打印 | 升级 antd API 面（牵涉 DatePicker/Tooltip 多处），建议单独一轮处理；首次加载另有 favicon 404（单文件离线包无 favicon，无功能影响） |
| P3 | What-if 风险周读数只列缺货截断周，不含库存穿零周 | riskWeeks 契约按 surface brief 定义为截断周；扩展口径需 Eason 拍板（建议：库存 < 0 周并入风险读数） |
| P3 | 预测页周账/图在极窄面板的可读性依赖局部横滚（既有设计），24 行表无虚拟化 | 数据量固定 24 周，性能无压力；保持现状 |
| P3 | 量价面板 volumeLimits 按下标存（未按面板 key） | 删中间面板场景已由 scaleResetKey 兜底复位；彻底改 key 制属小重构，收益有限 |
| P3 | Chart.tsx 内置档位带（多平台对比/下钻弹窗用）与 SplitAxisColumn 的逐像素同款靠人工维护 | 本轮两处已同步（小标同款）；长期建议抽公共组件 |
| P3 | PointerShield / VolumePrice 交互层无组件级测试（DOM 测试环境未搭建） | vitest 现为纯函数测试；引入 jsdom/RTL 属基建决策，本轮以浏览器实测覆盖 |

## 四、推荐优化（按价值/成本排序）

1. **预测页接入真实模型时补区间带**（价值高/成本中）：fixture 增加 P10/P90 字段后图上画残差带 + 图例，兑现「区间来源必须说明」的完整形态；ForecastChart 已留摘要句位。
2. **What-if 风险读数扩展库存穿零周**（价值高/成本极低）：`riskWeeks` 并入 `inventory < 0` 的预测周，配合本轮负库存标红形成完整风险链。
3. **页头「量价预测」双入口收敛**（价值中/成本极低）：PageHeader WIP 落地后退役该页签，主导航唯一选中规则回归纯粹。
4. **antd 弃用 API 清理**（价值中/成本低）：两个告警是控制台 error 级，演示时观感差；改 `classNames.popup.root` / `destroyOnHidden` 即可。
5. **面板态数组整体改按面板 key 存**（价值中/成本中）：panelWins/volumeLimits/geoms 统一 key 制，彻底消除增删面板的下标错位类问题（本轮已修两个实例）。
6. **Chart/SplitAxisColumn 档位带抽公共组件**（价值低/成本中）：消除同款维护负担。

## 五、检查与验证记录

- 静态链：design:check ✅、design:lint 0-0 ✅、typecheck ✅、test 536/536 ✅、verify 46/47（唯一 fail = 根目录 PriceLens.html 未与 dist 一致——工作区含并行 WIP 不可 build，提交时按干净树重建后即过）。
- 浏览器审计（Playwright + Chromium 1219 内核，1440/390 双视口）：价格走势/量价走势/量价预测/配置/预警/情报中心全页无横向溢出、无 pageerror；预测页三页签导航、币种 chip、无「我司」、华为份额压力文案、档位小标、标注尺贴边全区间钳制均实测通过；点击选单周/键盘切观察周/拖选/清除交互逐项复验通过；图像审查确认档位小标可见且与刻度区分、标注尺标签框在绘图区内。
- 审查排除项：overview/pricing 两页当前在 PageContext.DISABLED_PAGES 中不可达，其死代码路径问题未计入。

## 五·二、追修记录（2026-11-01 晚 · 第三节未修问题 7 项收口）

> 在 dfd1482 之上继续（期间并行会话追加了 2235a89 / 12f91a2 两笔纯设计文档提交，与本次改动零交集）。
> 边界：并行会话 WIP（agent/**、AlertCenter、Copilot/**、DataHelpModal、PageHeader、App、index.css、tokens、FiltersContext、navBus、alerts、AlertsPage、server/**、docs/briefs/、docs/design/、竞品自动匹配清单删除）一律未动未混入；只本地 commit，未推送。PriceLens.html 按干净树（HEAD 12f91a2 + 本次补丁）重建。

| # | 问题 | 处理结果 |
|---|---|---|
| 1 | P2 预测页双导航同页两个 aria-current="page" | ✅ **已修（ChartContentBar 侧降级，未碰 PageHeader WIP）**：预测页签保留视觉选中（墨色下划线 + 600 字重）但省略 aria-current，同页唯一程序化当前页标记 = 页头那枚；新增 Tab suppressCurrent 属性 + 代码注释，surface brief 例外记录同步。浏览器实测：预测页 aria-current 仅 1 处且在页头；dashboard / 量价页仍各唯一。WIP 落地退役页头页签后还原（brief 已记） |
| 2 | P3 antd 弃用告警 ×2 + favicon 404 | ✅ **已修**：① `destroyTooltipOnHide` → `destroyOnHidden`（antd 5.29 实测安装版 API，6 处：PlatformCompareView ×2、BrandLegendStrip、PlatformBox、ProductPickerModal、TemplateEditorFlyout）；② XBrush RangePicker 删冗余 `dropdownClassName`（`classNames.popup.root` 原本已在用，删后弹层类名不变）；③ index.html 内联 data-URI favicon（墨底白 P，离线单文件自包含，无外部资源）。浏览器实测：控制台零 antd 告警、零 404、零 pageerror |
| 3 | P3 What-if 风险周不含库存穿零周 | ✅ **已修（按建议，用户已同意）**：`riskWeeks` 扩为 `{week, kind: 'stockout' \| 'negative'}`，风险周 = 截断周 ∪ 期末库存 < 0 周（同周并存按截断归组，与主账「截断」标签一致）；What-if 读数分两行「草稿下风险周 · 截断 / · 库存穿零」，超 6 周显式计数「等 N 周」（不静默截断）；顺手移除该卡从未渲染的 `signed` 死字段。surface brief 例外记录 + 模型测试 +2 组。浏览器实测四态：基准 = 暂无/暂无；供给 −20% → 截断 13 周、穿零暂无；价 −10% + 供给 +20% → 截断暂无、穿零 W20–W24 |
| 4 | P3 volumeLimits 按下标存（删中间面板错位） | ✅ **已修**：改按面板 key（`modelId__配置`）Record 存储；新 `fitVolumeLimitsByKey`（保已有键限位 / 新键补自动 / 移除键清除 / 无变化返回原引用），独立 effect 按面板 key 签名收纳（同数换成员也覆盖）；换产品 / 价格类型 / 币种的整表复位（scaleResetKey）保留。纯函数测试 +3 组（删中键 / 引用稳定 / 空表首收） |
| 5 | P3 Chart 与 SplitAxisColumn 档位带人工同款 | ✅ **已修**：抽 `TierBand.tsx` 公共组件（梯子区块 + 顶部「价格档位」小标），chartModel 导出 `TierBox` 类型；逐像素一致由构造保证——两组渲染的样式对象原样迁移，唯一口径差异 = 主图小标补 `Math.max(0, ·)` 钳制与显式 `height: 13`（主图 plotTop ≥ 13，渲染无变化），差异已在组件头注说明。浏览器实测：dashboard 主图与量价页分离轴列小标 + 梯子均在位（各 2 档区块） |
| 6 | P3 PointerShield / 量价交互层无组件级测试 | ✅ **已建基建并补测**：devDeps 新增 jsdom 30 + @testing-library/react 16（+ @testing-library/dom）；新增 `PointerShield.test.tsx` 7 组（悬停列换算 / 参考位钳绘图区 / 点击=单周 / 拖选提交 / 反向拖选有序闭区间 / pointerCancel 回滚 / 越缘钳边缘桶不冻结）与 `VolumeBars.test.tsx` 7 组（缺采桶不画柱 / 悬停列加亮 / 手动上限超限提示 / 编辑器 Enter 提交 / 清空恢复自动 / Escape 取消保快照 / 自动手动标签）。注：VolumePrice 整页挂载依赖 Chart 实测几何上报（jsdom 无布局），交互层以 PointerShield + VolumeBars（= volumeLimits 交互面）直测覆盖 |
| 7 | P3 预测页 24 行表无虚拟化 | **保持现状**（第三节结论：数据量固定 24 周、性能无压力、极窄面板局部横滚为既有设计） |

**追修后全套静态链**：design:check ✅、design:lint 0 error 0 warning ✅、typecheck ✅、test **554/554** ✅（536 → 554，+18）、verify **47/47** ✅（PriceLens.html 干净树重建后逐字节一致，5.50MB）、build ✅（devDeps 变更含 jsdom/RTL，不影响产物体积口径外的运行时）。

**追修后浏览器复验**（Playwright + 本机 Chrome，1440/390 双视口）：dashboard / 量价预测 / 量价走势三页均无横向溢出、无 pageerror、无 404、控制台无 antd 弃用告警；预测页 aria-current 唯一（页头）且图表页签视觉选中保留（600 字重 + 墨色下划线实测）；量价页档位带双路径（Chart / SplitAxisColumn）在位，销量轴限位「输入 500 → 手动 + 超出当前上限 → 清空恢复自动」实测通过。

**遗留与环境**：/tmp/pl-clean 临时 worktree 因会话权限未能 `git worktree remove`（目录在 /tmp，重启自清；如需即刻清理：`git worktree remove --force /tmp/pl-clean`）；5174 dev server 留跑。
