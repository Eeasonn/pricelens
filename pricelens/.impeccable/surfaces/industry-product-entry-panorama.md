# 产业与产品入口 · 产品对标 / 品牌全景 · 局部决策（2026-11-27）

属正式产品面（稳定版价格走势页 + 共享筛选条 + 选择面板）。用户决策（已确认目标）：采用「一个产业与产品入口、两种分析结构」，保留产品对标，新增品牌全景；系统用户可见品牌名由 PriceLens 改为 **PriceAgent**。本文件只记录局部决策，视觉令牌一律取 `src/theme/tokens.ts`，未新增令牌。

## 1. 目标与范围

- **入口**：筛选条一枚「产业与产品」chip（`aria-label="产业与产品"`，`role=dialog` 浮窗）。关闭态显示 `产业 · 当前分析结构的选择摘要`；面板顶栏 = 产业选择（全局范围开关）+「产品对标 | 品牌全景」模式切换。
- **国家选择器**（地区部 → 国家）从页头下移到筛选条首槽（原「产业」槽位，宽 168）；「单国家分析」徽标退役；「产业」不再作为独立筛选控件，也不作为产品树一级。筛选条外部「国家 / 平台 / 币种 / 粒度」文字标题全部删除，控件自身可访问名保留。国家弹层每列按实际 `scrollHeight` 设置完整高度，240ms 过渡（reduced-motion 瞬时），禁止滚动条。
- 涉及文件：`components/FilterBar/{index,ScopeFields}.tsx`、`components/PageHeader.tsx`、`components/PriceAgentMark.tsx`、`components/ProductPicker/{ProductPickerModal,PanoramaPicker,TierRecommendModal,tierRecommend,pickerBits}.{tsx,ts}`、`state/{filtersTypes,mainSelection,panorama,FiltersContext,urlSync,tierSelection}.ts(x)`、`chart/PriceTrend/{BrandPanorama,LegendTools,Chart,chartModel,helpers,tableModel,TrendTables,index}.tsx(ts)`、`pages/{Dashboard,VolumePrice}.tsx`。

## 2. 双模式（两套草稿分别保存）

| | 产品对标 | 品牌全景 |
|---|---|---|
| 草稿 | `state.mains`（主分析卡） | `state.panorama`（`{ brands[], sharedY, baselineKey }`） |
| 单位 | 主品卡 + 对比区 | 品牌 → 型号 × 配置（默认最低价色） |
| 默认 | 数据默认卡 + 自动匹配 | **无默认品牌 / 主品 / 基准** |
| 图 | 合并 / 分图（原样保留） | 每品牌一张图，三列网格换行 |
| 图下 | 价差与明细 | 品牌价格明细（选了临时基准才出价差区） |

- `state.analysisMode` 只切换「看哪一套草稿」；来回切换两套草稿都原样保留。草稿按 国家×产业 会话快照隔离（`LPL3.filters.panoramaOf.<cc>.<industry>`，与 `mainsOf` 同级别），刷新随 `LPL3.filters` 持久化。
- 切产业直接执行，不再弹确认条：当前产业有已选（任一结构）时也直接切换；各产业选择分别保留，切回恢复，无需用户二次确认。
- 补丁显式携带 `mains`（Agent 结果卡回看 / 页头快搜 / 预警与总览下钻）或 URL 带 `main=` 时，分析结构回落产品对标（屏上所见即补丁所写）。量价走势在品牌全景下显示说明条：它按产品对标选择取数。Agent 的筛选上下文仍以产品对标草稿为准（未扩展，见 §8）。

## 3. 来源并集（对比区）

- 对比区 = **用户补充 ∪（自动匹配开：对标矩阵产出 − `excluded`）**，同型号同配置去重、剔除与主品同组者，**无条数上限**。
- 用户补充登记在 `card.compareSources`（`selKey → 'manual' | 'tier'`）：手动添加（树勾选 / 更换 / 模板合并 / 档位批量）记 `manual`，「同档位推荐」加入记 `tier`。矩阵产出不入册——是否矩阵项由当前矩阵动态判定（`compareSourcesOf` 给展示用来源）。
- 手动增删**不再**整体退出自动匹配（旧铁律退役）：`setCardCompares` 按新旧键集对账（`withCompares`），`addCardCompares(…, source)` 追加补充（`withComparesAdded`）。自动匹配开时被移除的矩阵项记入 `card.excluded`，矩阵重算 / 刷新恢复不再带回；用户手动加回即解除排除；换主品清空。
- 旧持久化卡（无登记）兼容：自动匹配关 = 全部对比视作手动补充；开 = 视作矩阵产出。刷新恢复仍强制华为主品卡 `auto=true`（2026-11-26 决策不变），但重算为并集，手动 / 同档推荐补充随刷新保留。
- 单一落点：`state/mainSelection.ts`（`withAutoOn / withAutoOff / withCompares / withComparesAdded / withMain / tidyMains`）。

## 4. 同档位推荐

- 入口：主品卡组头「同档位推荐」（无主品置灰）。候选 = 主品配置在当前国家的 `tier_by_country`（缺省回落 `tier_code`）同档、同国家、同产业的全部型号 × 配置，去掉主品自身与已在对比区的组；默认只看竞品品牌，「含我司品牌」可包含我司；按品牌分组。
- 每行展示：配置、**当前参考价**（默认最低价色在默认电渠口径下最新有价周/期的折后价，币种随筛选）、**相对主品价差**（(候选−主品)÷主品）、**数据覆盖**（当前国家有价周数/全量周数；南非为月数；任意渠道有价即计入）、**来源状态**（真实 · 最新时点 / 暂无价格——文字徽标）。
- 排序与「每品牌选 1 款」规则明示：组内按与主品现价最接近在前（|价差| 升序 → 无价殿后 → 名称），取组内第一款。**不做 AI 打分、不虚构数据**。
- 动作：每品牌选 1 款 / 全选当前结果 / 清空本次勾选 / 固定底部「加入对比（N）」。加入 = `addCardCompares(cardId, sels, 'tier')`，不改自动匹配开关。

## 5. 固定几何（修「Huawei 切 Samsung 弹层整体收窄」）

- 树浮窗在**打开时刻按未过滤全量树**量一次四列宽（`pickerBits.cascadeFrameOf` → `CascadePanel.frameColumnWidth`，与自适应列宽同一公式）与外框宽、落位；品牌 / 系列 / 型号 / 勾选 / 搜索 / 档位变化都不改外框位置、宽高与四列列宽，**仅视口变化重算**。上限 `min(视口−48, 1100)`，超限面板内横向滚动（列宽不压缩、信息不截断）。
- **固定四列骨架**：无配置层级的型号不再删第四列，留空并说明原因（`CascadeColumnSpec.emptyText`）。
- 列按列序保持挂载（`CascadePanel` 列 key = 索引），滚动位置保留；`sticky` 模式下仅打开 / 当前路径失效重定位（`locateEpoch`）时把选中行滚入视野——勾选不重排、不滚动。
- 档位批量动作带常驻定高 28（选 / 不选档位只换内容，外框高度不变）。
- 落位钳制改用布局值量测（`offsetWidth` / `offsetLeft` / `offsetTop`，不受入场动画 transform 影响；右对齐落位 bottomRight 时 rc-trigger 写 `left:auto + right`，必须读布局位置而不是 `style.left`，否则钳制落空、品牌列被推出屏幕左侧），并以 `MutationObserver` 在 rc-trigger 每次重写定位后立即重新钳制——**动画不改变布局**。主浮窗（`LevelSwitchPopover`）与模板编辑浮窗（`TemplateEditorFlyout.PickPopover`）外框宽同口径冻结。
- 真机量测（Chrome，1440 视口）：主品上下文外框 (268, 367, 988×388)、列宽 [204, 198, 382, 184]；对比上下文外框 (24, 417, 1056×388)、列宽 [204, 198, 416, 218]——切品牌 / 系列 / 型号、搜索、选档位、勾选整品牌前后逐项不变。

## 6. 无限条数（取消单图 8 线 / 8 张主品卡 / 合并 16 线）

- `MAX_LINES_PER_CHART / MAINS_CAP / MERGE_LINES_CAP / cardQuota / clampMains` 全部退役；持久化（`tidyMains` 只做结构整理）、URL、自动匹配、批量添加、模板追加、Agent 补丁均不截断。合并恒可用，不再超限置灰或自动回落分图。
- 渲染层：`SERIES_PX_CAP` 退役，绘图区高度随实际系列数生长（标签 / 图体适应）；标签避让的向下找位步数随已放置盒数走。
- 折线再多也全画，**不阻止、不自动减少、不强制切图**；可读性交给 `LegendTools`（工具行「图例」入口）：搜索（可一键「只看匹配」= 隔离）、单条隔离 / 只看本品牌、逐条隐藏 / 全部显示；折线 ≥ 12 条时入口旁给一句非阻断文字提示。
- 产品对标分图仍是单行横向轨道（滚动查看，不截断）；品牌全景用三列网格换行。

## 7. 品牌全景图（`chart/PriceTrend/BrandPanorama.tsx`）

- **列数**：`panoramaColumnsOf(n) = min(3, n)`——三品牌默认三列，每品牌一张图、只画该品牌全部已选产品；品牌数不设上限，超过三列换行。每行一根共享 Y 轴列（换行后各行都读得到刻度）。
- **默认共享**：查看时间轴（各图底部时间轨，拖任一条全部联动）、区间刷选、Y 轴（全部图并集算一次受控传入）、跨图悬停十字线与横向虚线。可切「Y 轴：共享 | 独立」（独立 = 各图自适应、各自带轴）与「轴同步」关（各图独立调整查看时间）。
- **辨认同品牌多条线**（不新增色板）：品牌色恒定（`brandColorOf`）；线型按品牌内选择序循环 `PANORAMA_DASH_PATTERNS`（首条实线，其后虚线节律）；名称带药丸把品牌色点换成同色线段样条；tooltip 与悬停隔离照常。**缺采跨接段恒为 `[4, 4]` 短虚线桥**，与线型字段无关、不造点。
- **临时基准**：工具行「价差基准」下拉（默认无）。选定后：悬停明细出价差列、区间量尺量基准线、图下品牌价格明细出价差区（基准列头写「价差基准」）；未选 = 只看价格。基准系列须在图上有数据才生效。
- 品牌价格明细复用 `TrendTables`（`title / detailCaption / baseCaption` 与 `TableGroup.label` 为品牌名），近 4 周环比口径与产品对标一致。

## 8. 空态、证据边界与未覆盖

- 品牌全景未选：虚线卡 `role="status"`「品牌全景尚未选择产品」+ 入口引导；某品牌在所选时间范围无数据：图内空态文案；取数异常：「数据加载异常 / 请刷新重试」。
- 事实口径不变：`buildSeries` 同源、`real / simulated / mixed` 与缺采语义照旧；同档位推荐的现价 / 覆盖 / 来源全部来自维表与事实表，无价显示「—」并标「暂无价格」。
- 未扩展（如实记录）：Agent 的筛选上下文与补丁仍以产品对标草稿为准；品牌全景图未接下钻弹窗、offer 徽章与价格变化提醒；品牌色板的扩展色在超过 6 个品牌时仍可能相近（线型只区分同品牌内）。
