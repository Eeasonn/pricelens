# 稳定版优化 · 局部决策（2026-11-27）

属正式产品面（稳定版价格走势 / 量价走势页 + 共享图表导航行 + 数据模型纯函数层）。本文件按追加式分节记录 2026-11-27 起的稳定版优化决策，后续轮次在此文件追加新节。视觉令牌一律取 `src/theme/tokens.ts`，未新增令牌。

## 1. 量价走势页签标「施工中」

**是什么**：`ChartContentBar` 的「量价走势」页签文字降为弱灰、尾随一枚「施工中」中性小药丸；页签**仍可点击**（视觉降级 ≠ 禁用），激活态文字回墨色、墨色下划线照常。

**为什么**：量价走势当前用于讨论竞品销量与成本的对比方式，口径（竞品销量来源、成本模拟口径）尚未定稿。直接下线会把讨论载体拿走，原样展示又容易被误读为正式结论——降级标记 + 常驻说明条是两者之间的如实表达。

**行为**：

- `Tab` 新增 `wip?: boolean`。wip 时：未激活文字色 `color.mute`（弱灰，非禁用色 `hairlineStrong`——禁用是「不可用」，施工中是「可看但口径未定」）；尾随「施工中」小药丸（11px、1px `hairlineStrong` 边、`canvasSoft2` 底、`mute` 字、pill 圆角——中性灰，不用 amber/red，不带图标）；`title` 提示「讨论稿：竞品销量与成本口径未定，暂不作为正式结论」；可访问名带后缀「（施工中）」（`aria-label`），激活态 `aria-current` 照常。
- 量价走势页 `ChartContentBar` 正下方常驻说明条（`role="note"`、`data-testid="volume-wip-note"`，与 `volume-panorama-note` 同一视觉语言：hairline 边、`canvasSoft` 底、12px body 字）：「施工中 · 讨论稿：量价走势用于讨论竞品销量与成本的对比方式，口径尚未确定，页面内容不作为正式结论。」恒显示，不随任何状态消失。
- 价格走势页签不受影响；页面内容本身（图、面板、交互）全部不变。

## 2. 现价与落档口径（`dataModel/tierPrice.ts`）

**是什么**：一组纯函数，裁定一个「型号 × 配置」在某国的**现价**与该现价落入的**档位**。2026-11-27 Eason 拍板口径，五条规则全部确定性、可解释（不做 AI 打分、不虚构数据）：

1. **档位阶梯**沿用 `tierBandsOf(industry)`（`aggregate.ts`，phone = `<200 / 200-400 / 400-600 / 600-800 / 800-1000 / 1000+`）；归属 = min 含、max 不含（恰好 400 → `400-600`）；顶档开放上界（max null）。
2. **现价取数**：该配置全部颜色 SKU 在**最新有价期**的全部价格点（各平台/店铺行全取）。周度市场 = `factPriceWeekly`（country/sku 命中、`price_usd != null`，最新 = max `week_id`）；ZA（运营商小册子月度）= `factPriceMonthly` 中 `price_type === 'prepaid'` 的行（最新 = max `period_id`）——installment 行是月供分期金额，与一次性买断价不可比，剔除。
3. **异常剔除**：均值一次性算全量点（不迭代）；点数 ≥ 2 时剔除 `usd < 均值 × 0.7` 的点（低于均值 30% 以上；恰为 70% 保留）；单点永不剔除。
4. **现价** = 剩余点的 min usd，本币价带同一行。
5. **落档恒按 USD**（币种开关只影响展示）；无价格 = tier null（界面表达「暂无现价」）。

**适用范围（边界，务必遵守）**：本口径只服务两处——「按档位」模式的档位落档蓝框，与「匹配竞品 · 同档位」候选。**其余一切场景沿用 `tier_by_country`**（选择面板档位筛选、同档位推荐分组、Y 轴档位带等），不替换、不回填。

**实现约定**：无副作用、无 React、不缓存——事实表在数据包置换时原位替换，索引一律按调用现算（与 `components/ProductPicker/tierRecommend.ts` 同一约定）。运营商小册子市场判定走 `isOperatorBookletMarket`（`marketProfile.ts`），不硬编码 `'ZA'`。API：`pickCurrentPrice`（纯，规则 3-4）、`latestPricePoints`（规则 2 取数）、`currentPriceOf`（2+3+4 串联）、`priceBandOf`（规则 1+5）、`neighborBands`（阶梯 ±1 档）、`currentTierOfSelection`（型号 × 配置组：dimProduct 同 modelId + 空白归一 romram、覆盖该国的全部颜色 SKU）。

**未接线（如实记录）**：本轮只落纯函数与测试，UI（按档位蓝框、同档位候选）尚未消费；接线轮次在此文件追加新节。

## 3. 选择方式（按产品 / 按档位）与「匹配竞品 ▾」收口（2026-11-27 二轮改版）

**是什么**：「产品对标」分析结构内的选择产品面板新增**选择方式**开关；原分散的对比区来源入口收口为一枚下拉；树浮窗内的档位体系整体迁到独立的按档位看板。

**决定（Eason 拍板）**：

1. **选择方式开关**：`按产品 | 按档位` Segmented（label「选择方式」），位于面板顶栏产业与分析结构之间，仅在 `analysisMode === 'compare'` 时出现；组件态、默认按产品、不持久化、不进 URL。「分析结构（产品对标/品牌全景）」Segmented 原样保留，后续轮次另行重构。
2. **按产品模式的瘦身**：树浮窗（LevelSwitchPopover）的「全部档位」Select 与档位批量动作带（「该档位 … 全部各成一组 / 全部加入对比」）退役——档位选择不再是树内筛选，而是独立看板。固定骨架规则（§5 industry-product-entry-panorama）照旧：外框宽高、四列列宽仍按全量树冻结，批量带是搜索行下的独立条，移除后不影响级联区几何。`state/tierSelection.ts`（`configsInTier` / `appendTierCards`）自此无生产调用方，文件与其单测原样保留（后续轮次决定是否删除；`filtersTypes` 注释里的引用为历史描述，未改）。
3. **「匹配竞品 ▾」下拉**：卡级「自动匹配竞品」开关 pill 与「同档位推荐」入口 pill 两枚收口为一枚下拉 pill「匹配竞品 ▾」（沿用 MatchPill 视觉，`card.auto` 开时呈选中态）。菜单三项：**对标矩阵**（勾选态 = `card.auto`，点击 = `autoMatchCard`；非华为主品置灰 + 原「仅支持华为产品」提示）、**同档位…**（打开 TierRecommendModal，无主品置灰）、**上一代**（`groupsFromPrevGeneration` 带出、已在对比区的不重复加入；成功「已加入 N 款上一代」，全部已在 = 「上一代已在对比区」，无映射 = 「数据包未登记 {型号} 的上一代配置」）。可访问名「匹配竞品 {型号}」。顶栏「自动匹配竞品」（全部卡批量开关）原样保留。
4. **同档位推荐改现价落档口径**：主品档位 = 主品现价落档（§2 `currentTierOfSelection`），候选 = 同国同产业有数据的全部组里现价落档同档者（批量裁定 `currentPricesByGroup`，事实表一遍扫描）；「当前参考价」= 该组现价；价差对主品现价。头部明示「按现价落档」+ ⓘ 口径说明；主品无现价 = 空态「主品暂无现价，无法按档位推荐」；被剔除异常低价的行在价格 tooltip 带「已剔除 N 个异常低价」。**`tier_by_country` 声明档不再参与本弹窗**（其余场景不受影响，同 §2 边界）。
5. **按档位看板（`TierBoardPicker` + 纯模型 `tierBoard.ts`）**：
   - 列 = 当前国家+产业有组的品牌（树序），最左 = **锚定品牌**（默认我司，列头 Select 可换，换后该品牌提最左、其余保持树序）；行 = 型号 × 配置 + 现价（USD 降序、无现价殿后灰显「— 暂无现价」），分段 = 落档从高到低 + 无现价段；价格 tooltip = `{期} · {N} 个价格点 · 已剔除 N 个异常低价 $x`。
   - **蓝框只是提示，永不自动勾选**：非锚列档位 ∈ 锚列已勾选档位集 = 同档（1px `selectAccent` 描边）；±1 档（`neighborBands`）且不在锚档位集 = 相邻档（新增 token `selectAccentFaint = rgba(0, 112, 243, 0.32)`）；既是 A 锚同档又是 B 锚相邻档 = 同档优先。非颜色表达 = 行内 visually-hidden 文案「同档 / 相邻档」+ 看板上方图例行「蓝框 = 与已选 {锚} 同档 · 浅框 = 相邻档（±1）」+ ⓘ 现价口径。
   - **应用（方案 A）**：每个勾选锚行各成一组（锚列行序）；非锚行按 |USD 价差| 就近分配给锚（并列取靠前锚、行或全锚无价回退首锚）。建卡走 `withMain` + `withComparesAdded(…, 'tier')` helper 链、`newCardId()`、`auto: false`（落主品时撤销 withMain 的空对矩阵自动填充——按档位组装不用矩阵）；`actions.setMains` **整表替换**；`message.success`「已按档位生成 N 组」带内联「撤销」恢复替换前数组；应用后切回按产品。初始勾选 = 当前 mains 推导（锚品牌主品 + 其对比区中板上存在的组）。底栏：「按提示全选同档」（无锚勾选禁用）/「清空」/主按钮「应用（N）」（无锚勾选禁用 + 「先在 {锚} 列选择至少一款」）。
   - **固定几何**：看板与分析对列表共用同一高度预算（`PAIR_LIST_MAX_H`），列 min-width 200、整板横向滚动、列内纵向滚动、列头 sticky；面板外框不随选择方式改变尺寸。
6. **合并开关核验（如实记录）**：价格走势 ≥2 组时「分图/合并」切换（`mergeView`，第一百二十三轮⑥宽容合并）仍在 ChartToolbar 原样保留——按档位生成的多组此后可由用户自行合并，本次不动。

**测试**：`tierBoard.test.ts`（列序 / 行序 / 分段 / 提示含重叠与顶底档边界 / 就近分配并列与无价回退 + 真实数据冒烟）、`TierBoardPicker.test.tsx`（真实数据 RTL：锚列最左、勾锚出同档提示、应用替换 + 撤销恢复、初始勾选）、`tierRecommend.test.ts` 重写（现价落档候选 / 排除 / 分组 / 价差 / 覆盖文案）、`tierPrice.test.ts` 追加 `currentPricesByGroup` 批量 = 逐组一致性（MX/RU/ZA 三国抽查）、`industryProductEntry.test.tsx` 同档推荐入口改走下拉。

## 4. 视图：对标 / 分列（品牌全景退场）（2026-11-27 二轮）

**是什么**：「分析结构（产品对标 / 品牌全景）」双草稿结构整体退场，取而代之的是两个独立维度——**选择方式**（§3，按产品 / 按档位，只写 `state.mains` 这一份唯一选择草稿）与**视图**（`对标 | 分列`，只决定怎么摆）。原品牌全景的多品牌分图能力以「分列视图」的**按品牌分组**原样保留，另新增**按系列 / 按档位**两种摆法。

**为什么（理由记录）**：一轮的「两套草稿分别保存」让同一些产品在两个结构间来回倒手——全景里勾好的产品，切回产品对标得重选；选择（跟谁比）与摆放（怎么摆）本是两个独立问题，却捆在同一个开关上。二轮拆开后：**分组/合并 = 跟谁比**（选择层，mains 卡结构），**分列 = 怎么摆**（视图层），互不干扰、往返不丢。

**状态形状**（`state/filtersTypes.ts`）：

```ts
export type ViewMode = 'compare' | 'columns';          // 'lineage'（代际）后续轮次追加
export type ColumnsGroupBy = 'brand' | 'series' | 'tier';
export interface ColumnsView { groupBy: ColumnsGroupBy; sharedY: boolean; baselineKey: string | null }
// FiltersState: viewMode / columns 替代原 analysisMode / panorama
```

- 默认 `viewMode: 'compare'`、`columns: { groupBy: 'brand', sharedY: true, baselineKey: null }`；随 `LPL3.filters` 持久化（坏形状跳过字段不作废整包）。
- URL：`view=columns`（对标缺省不写）+ `by=brand|series|tier`（品牌缺省不写）；品牌全景从未进过 URL，无 legacy 链接参数需要映射（如实记录）。
- 动作：`setViewMode` / `setColumns(patch)` 替代 `setAnalysisMode` / `setPanorama`。
- **基准随 mains 收口**（`sanitizeBaseline`）：基准 selKey 不再指向任何在册主品/对比条目即清空——统一挂在所有写 mains 的路径（setMains / setCardCompares / addCardCompares / autoMatch 开关 / scope 收口）与显式写 baselineKey 的 setColumns 上；category1 快切换配置时走 `actions.set` 原子补丁（mains + columns 同包），基准键随新配置改写而不被收口误清。
- 品牌全景的 `panoramaOf.<cc>.<industry>` 会话快照整套删除——分列视图没有独立草稿可快照（mains 自有快照口径不变）。

**迁移**（持久化读入时，`migrateLegacyView`；两路均有单测）：

- `analysisMode === 'panorama'` 且旧全景有选择：**mains 无任何选择** → 全景选择折成一张卡（主品 = 首个我司品牌选择，无则 null；其余按 selKey 去重进对比区、来源 `manual`、`auto: false`——不用 `withMain`，避免矩阵自动填充混进迁移结果）；**mains 已有选择** → mains 为准（全景选择是同一批产品的另一种摆法，不重复并入）。两路都 `viewMode: 'columns'`、`groupBy: 'brand'`，沿用旧 `sharedY` / `baselineKey`（基准不在迁移后选择中时由收口清空）。
- `analysisMode === 'compare'` / 缺省 → 视图字段原样（新载荷已带 viewMode/columns 则尊重）。迁移后旧字段不进 FiltersState。
- 持久化格式版本不升（仍 v12）：v12 是载荷结构版本号，视图字段按可选键读、旧字段按可选键迁移——新旧载荷同版兼容（判断调用，记录于此）。
- 「补丁带 mains 回落产品对标」规则随草稿合并退役——视图共享同一草稿，写选择不再隐含换视图；Agent patch 未扩展（`viewMode` 不在现有 patch 白名单就不加，如实记录）。

**分列分组（`chart/PriceTrend/columnsModel.ts` 纯模型）**：输入 = mains 在册选择（逐卡 主品 → 对比，卡序保序，`selKey` 首次出现为准去重），组内保持输入顺序。

- **brand** = `brandOfModel` 事实品牌；组序 = brandOrder（选择产品树序：我司置顶 → 矩阵列序 → 型号数）；label = `brandLabelOf`；组带 `brand` 键（卡头 BrandDot）。
- **series** = 选择产品树同一系列节点——`effectiveSeriesOf`（读时生效链，与 `buildProductTree` 完全同口径，不自造规则）；组序 = 品牌序 × 树内系列序（`localeCompare numeric`）；label = `{品牌} {系列}`。
- **tier** = 现价落档（§2 口径，`currentPricesByGroup` 批量裁定，键 `${modelId}|${romram}` 空白归一——与 selKey 同归一，天然对齐）；组序 = 档位从高到低（ladder index 降序）；无现价归末组「暂无现价」；label = `tierLabelShort` 短标，UI 旁挂「按现价落档」ⓘ 提示。

**渲染**：`BrandPanorama.tsx` → `ColumnsView.tsx`（git 级改名以文件复制+删除落地，导出 `COLUMNS_DASH_PATTERNS` / `dashPatternAt` / `COLUMNS_GRID` / `columnsGridOf`）。全部行为保留：三列网格换行、共享/独立 Y、轴同步、跨图十字线、临时基准、组内虚线节律（颜色 = 品牌色 `brandColorOf`——series/tier 跨品牌组照样可辨，线型按组内序循环）、空态、图下经 `onSeriesWindow` 喂 `TrendTables`（`TableGroup.label` = 组名，宽表标题/说明「分列价格明细」）。会话视图态键 `panorama.*` → `columns.*`（`columns.synced` / `columns.groupWins` / `columns.groupWinsGran`；旧 `panorama.*` 键无迁移价值，随会话自然消亡）。系列归属改按 selKey 落组（原 `s.brand === b.brand` 在跨品牌组会丢线）。

**视图开关落位（判断调用，记录）**：放在**图表卡内 ChartContentBar 正下方的常驻切换行**（`view-switch-row`）而非 ChartToolbar——对标视图工具行在 PriceTrend 内、分列视图工具行在 ColumnsView 内，只有卡头行是两视图共享的同一容器，切换不位移、对照明显。行内：「视图」Segmented（对标 | 分列）；分列时旁挂「分列依据」Select（品牌 / 系列 / 档位），档位依据旁挂「按现价落档」ⓘ 口径提示。多平台对比入口只在 PriceTrend 工具行（对标视图）——分列视图天然不渲染，与品牌全景期等价。

**退场清单**：`PanoramaPicker.tsx`、`state/panorama.ts` 与其单测、`BrandPanorama.tsx`（更名 ColumnsView）、选择面板「分析结构」Segmented（选择方式恒显）、FilterBar 摘要的品牌全景分支（摘要恒描述 mains）、Category1QuickSwitch 全景分支（恒写 mains + 基准改写）、量价页 `volume-panorama-note`（视图不跨页影响量价）。历史归属注释（chartModel/helpers/tableModel 里「2026-11-27 品牌全景」）统一改口「分列视图」。

**测试**：`columnsModel.test.ts`（在册序列去重保序 / 三组分组组序与标签 / 无现价末组 / 空输入）、`columnsView.test.ts`（原 brandPanorama 金测改名重指：网格 / 线型循环 / buildOption 线型接线 / 图例搜索）、`FiltersContext.legacyViewMigration.test.tsx`（迁移两分支 + compare 无迁移 + 新字段恢复 + 旧字段不落状态）、`urlSync.test.ts`（view/by 读入）、`industryProductEntry.test.tsx` 重写三套件（分析结构开关缺席 + 视图往返不丢草稿 + 分列分图三列网格与 Y 轴切换）、`category1QuickSwitch.test.tsx`（基准键随切换改写）。

## 5. 代际视图（2026-11-27 三轮）

**是什么**：视图第三种「代际」（`ViewMode` 增 `'lineage'`；切换行 `对标 | 分列 | 代际`；URL `view=lineage`，持久化同其他视图）。把 mains 在册选择按数据包 prevGen 映射拼成**代际链**，逐链一条阶梯线：上一代替役、新一代接棒的价格谱系。「分列依据」下拉在代际同样出现，驱动卡片分组（沿用 `columns.groupBy`，品牌默认）；选择草稿仍是 mains。渲染 = 轻 SVG（`chart/PriceTrend/LineageView.tsx`，不用 ECharts——阶梯几何与标注更好控制），卡片三列网格同分列视图。

**链规则**（`chart/PriceTrend/lineageModel.ts` 纯模型）：

- **链尖** = 在册选择中不是另一在册选择（maxBack=3 代传递闭包内）上一代的产品；从链尖沿 `prevGenTargetsFor` 向前回溯最多 3 代、按 key 防环。**未在册的上一代自动拼进链**（`selected:false`）——这正是拼接的意义；解析与 `groupsFromPrevGeneration` 同源（最低价颜色 SKU、romram 取 dimProduct 原值、主数据没有的映射目标跳过）。已在册的上一代直接用册内选择（解析/跳过规则只管未在册拼接代）。一对多上一代 = 每条路径各成一链（相同路径去重）；链序 = 链尖出现在选择序列的次序。
- **交接**：每桶位活跃代 = 该桶位有价、且已到自己首个有价桶位的最新一代——交接发生在最新一代首个有价桶位；两代同有价时最新一代赢，老一代交接后的价不丢、作 **overlap** 淡色呈现（1px、opacity .35）。最新一代缺采的桶位回落到仍有价的老一代（缺采不造点、不插值；缺失段走 [4,4] 虚线桥、桥上无标注）。
- **阶梯** = 显示整数取整后等价的连续价格段，段首为一个 step；`changePct` = 段价对上一段价，交接 step 对上一代最后价同算。
- **标注抽稀**（`thinnedStepLabels`）：交接 step 与首段恒标；其余仅 `|changePct| ≥ 0.03` 标；超过 6 个保留 交接+首段+|changePct| 最大者至 6 个。未标注 step 在悬停明细照样全量。
- **卡片分组**（`lineageCardsOf`）：按**链尖**（最新一代）的品牌/系列/档位归组，复用 columnsOf 口径（组序/标签/brandOrder 完全同分列）。

**渲染口径**：

- 线 = 阶梯路径（H then V），活跃代品牌色（`brandColorOf`）1.75px；交接 tick（短竖线）+ 新一代名标在交接点上方。价格标注在段首上方（11px `font.family` + tabular-nums），涨/降/持平在段首下方——**涨跌色与 TrendTables 近 4 周环比 chip 同口径**（涨 = `color.link`、降 = `#b45309`，不新造），文字恒带「涨/降/持平」不单靠颜色。
- **时间轴 = 当前粒度数据全集**（`dataBucketRange`）：谱系跨度天然长、窗口裁剪会剪断链，故与刷选窗口解耦（判断调用，记录于此）；所有卡共享同一桶范围，轴刻度在每卡底部抽稀到 ~6 个。**行内 Y 独立归一**（看阶梯形态，不看跨行绝对高度——规格未要求跨行共享 Y，判断调用同上）。币种/粒度随全局筛选，不强制季粒度。
- 行左标签 = 最老代名（16 字符截断）+「未登记上一代」小字（`!registered`）。悬停 = 卡内跨行竖直参考线 + 跟随 tooltip（桶标签、各链活跃代名+价、overlap 代「上一代在售」价格）。键盘 = 每行 focusable，aria-label「{链名 →}：起 X → 现 Y，n 次调价」；每卡附 visually-hidden 数据表（桶 × 链，PRODUCT.md 文本/表格备选要求）。
- **空态**：无选择 = 与分列同款空卡（「代际视图尚未选择产品」）；有选择但没有任何链拼出上一代 = 照常画本代 + 顶部 `role="note"`：「当前数据包未登记所选产品的上一代配置（服务器配置表『上一代配置』页签维护），代际拼接暂只显示本代。」
- 代际视图**不出 TrendTables**（明细留在对标/分列——代际是拼接形态不是对比形态）；Dashboard 宽表区在代际不渲染，无布局塌陷（宽表本来就有条件渲染）。

**数据注意（如实记录）**：内置静态包**没有 prevGen 段**（`dataPack.test.ts` 已证：`prevGenTargetsFor` 查空）——真实拼接只有服务器配置表维护过「上一代配置」页签的数据包才有；且当前批次时间窗口短，上一代价格跨度可能很薄。组件测试用注入 prevGen 段的方式覆盖拼接渲染（交接名/价格标注/涨跌文本/读屏表/整页说明两态）。

**测试**：`lineageModel.test.ts`（13 例：链尖排除/未在册拼接/一对多/防环/深度上限/幽灵目标跳过；交接/overlap/缺采回落/等价并段/changePct 跨交接/无价；抽稀三态）、`lineageView.test.tsx`（4 例：切换行出代际 + 拼接渲染全要素、注入时有/无整页说明两态、URL view=lineage 直链与切回）。`buildDataPack()` 是对当前内存态的活序列化——测试间「还原无 prevGen 包」必须显式 `delete pack.prevGen`（坑已记录在测试注释）。

## §3.1 按档位看板二版（一行一款 · 配置 chip）（2026-11-28）

**为什么**：一版看板每个「型号 × 配置」各占一行，同一款手机 3–4 个配置铺满一列，用户反馈「太挤、看不出有哪几款」。二版把行单位收到**型号**，配置收进行内 chip，仍可换到更细的配置。

**决定**（覆盖 §3 第 5 条的行 / 分段 / 勾选描述；应用方案 A、撤销、锚品牌切换、图例、固定几何不变）：

1. **一行一款**：行 = 型号，挂全部配置（`compareRomram` 序）。单行 28px：勾选 · 型号名（省略号，title 全名）· **配置 chip**（`12+256 ▾`，pill、`EDITABLE_BORDER` 描边，短文 = `configTextOf` 去 GB）· 显示配置的现价右对齐（`font.family` + tabular-nums）。只有一个配置 = chip 退化为纯文本、无 ▾；无配置层级的产业不出 chip。
2. **起售配置定位**：型号的分段 / 段内排序 = **起售配置**（有价配置里 USD 最低，并列取配置序靠前）的落档与价格；勾选、换配置、锚变化都**不挪行**。分段高 → 低；全部配置无现价的型号进底部**可折叠**「暂无现价（N）」段（默认折叠，点击展开；不穿插在价格段里）。列头计数改「N 款」（型号数）。
3. **显示配置优先级**：①用户显式选择（chip 换配置，或勾选时锁定）②非锚列且锚已勾：**最优提示配置**——同档 > 相邻档；同级取 |USD − 最近锚价| 最小；再并列取起售配置 / 配置序靠前 ③起售配置。
4. **蓝框提示**按型号全部配置取最优（同上规则），视觉不变（同档 1px `selectAccent`、相邻档 `selectAccentFaint`）；提示由非起售配置驱动时 chip 直接显示该配置（所见即原因）。sr-only 文案带配置：「同档（12+512 GB）」。有显式选择的行按所选配置判提示（所见即应用）。锚列行无提示。
5. **配置 Popover**（antd Popover `trigger="click"`，`POPOVER_Z`）：listbox 列全部配置——配置文本 · 同档/相邻档小标（非锚列）· 档位短名（`tierLabelShort(TIER_LABELS[code])`）· 现价；有价在前，无价殿后灰显「暂无现价」但**仍可选**（用户可能就要看那一款）。打开后焦点落到当前配置，↑↓ 移动、Enter/Space 选择、Esc 关闭（`useTopEscClose`，焦点还 chip）；选择即关闭并还焦。chip `aria-label`「更换配置：{型号} 当前 {配置}」，`aria-haspopup="listbox"` + `aria-expanded`。
6. **勾选**：勾上 = 把当下显示配置写成显式选择（锁定，之后锚变化不漂移）；锚档位集 / 锚价集 = 锚列已勾型号所选配置。**按提示全选同档** = 勾上非锚列所有「行提示 = 同档」的未勾型号，并锁定到匹配配置。**应用** = 锚列已勾型号按板上行序各成一组，非锚按所选配置现价就近分配（`cardsFromBoard`，泛型化，`agent-stable/intentFilter` 旧 `BoardItem` 调用不变）。**初始勾选** = `state.mains` 中出现过的任一配置（主品或对比）→ 该型号勾上并锁定该配置。
7. **键格式无关**：看板不读 `currentPricesByGroup` 的 Map 键，只用 `entry.sel / price / tier`；配置比较 / 草稿存储一律 `selKey`（`dataKeys` 也按 `selKey` 建）。
8. **密度 / 几何**：列 min-width 220（宽 232 不变）；面板外框尺寸、`PAIR_LIST_MAX_H` 高度预算、底栏占位不变（industry-product-entry-panorama §5 固定几何）。未新增 token。

**纯模型 API**（`tierBoard.ts`）：`BoardModel` / `BoardConfig` / `BoardColumn{sections[{band, models}], count=款数}`；`buildBoardColumns`、`startConfigOf`、`hintOf`、`bestConfigHint`、`displayedConfig`、`rowViewOf`、`initialDraft`、`anchorContextOf`、`toggleModel`、`checkAllSameDraft`、`boardPicks`、`cardsFromBoard`。

**测试**：`tierBoard.test.ts`（21 例：三配置 → 一行、起售定位 / 段序 / 无现价段、键格式无关、hintOf 边界、最优提示同档胜相邻与最近价并列、显示优先级、初始草稿、勾选锁定不漂移、全选同档锁配置、应用 sel 与就近分配、真实数据冒烟 行数 = 型号数）；`TierBoardPicker.test.tsx`（4 例：每列行数 = 型号数与「N 款」、chip Popover 换配置后行价变化、勾锚出同档提示含配置文本 + 全选同档 + 应用 / 撤销、初始勾选来自 mains）。

**三版打磨（2026-11-28 晚）**（覆盖上文第 4 / 5 / 8 条的视觉细节，模型与应用规则不变）：

- **列宽** 232 → `BOARD_COL_W = 264`（min `BOARD_COL_MIN_W = 248`，导出自 `tierBoard.ts`）；整板已在固定面板内横向滚动，加宽不改外框几何。行内：型号名吃剩余 flex（省略号，title 全名）· chip `max-width: 76px` 省略（短文 = `configTextOf` 去 GB）· 价格列定宽 64px 右对齐（`font.family` + tabular-nums）。行 gap 4 / padding 0 6px。
- **分段标签**一律「起售 · {档位短名}」（无现价段仍为「暂无现价（N）」），把「行按起售落档」说清楚。
- **chip 提示样式**：新增纯函数 `chipHintOf(model, displayed, explicit, anchors)` → `'same' | 'adjacent' | null`。显示配置因提示偏离起售配置（且非用户显式选择 / 勾选锁定）时，chip 挂同档（`selectAccent` 实线框 + 字）/ 相邻档（`selectAccentFaint` 虚线框 + `selectSoftInk` 字）；tooltip「{配置} 现价 {价} 落 {档}，与已选 {锚品牌} 同档 / 相邻档；起售配置 {配置} {价}」。显式选择 / 显示 = 起售 / 无锚 / 锚列 → null。行与 chip 上带 `data-chip-hint`。
- **同档 vs 相邻档可分**：同档 = 1px solid `selectAccent`；相邻档 = 1px **dashed** `selectAccentFaint`（行框、chip、Popover 小标同一 `hintBorder`）。图例「[实线样本][虚线样本] 实线蓝框 = 与已选 {锚} 同档 · 虚线框 = 相邻档（±1）」；口径 tooltip 补一句排序 / chip 提示说明（不加新 chrome）。
- **Popover 落位**：`getPopupContainer` = `[data-lpl-picker-panel]` 面板根（留在 dialog 叠放上下文内，不再溢出到图表上），`autoAdjustOverflow`；默认 `bottomRight`，chip 距面板底不足（40 + 29 × 配置数）时 `topRight`。列表宽 240：配置 · 同档/相邻档小标 · 档位短名 · 现价。
- 未新增 token。测试：`tierBoard.test.ts` +3（chipHintOf same / adjacent / null 四态、列宽常量）；`TierBoardPicker.test.tsx` 断言新图例文案、「起售 · 」前缀、chip 提示 tooltip 带起售配置。截图：`/tmp/tier-board-v3-before*.png` → `/tmp/tier-board-v3-after*.png`。


---

## §5 补记（2026-11-28 三轮返修）：代际视图走共享 Chart + 档位键归一修复

两轮反馈后返修：①分列依据=档位在代际全落「暂无现价」；②代际 SVG 自绘与全站图卡语言不一、无悬停交互。

### 键归一修复（根因）
`currentPricesByGroup` 的 Map 键原用 dimProduct 原值 romram（`8+256 GB` 带空格），而 columnsModel/intentFilter 查询侧用空白剥离键 → 全部 miss。修法：**源头统一**——`tierPrice.ts` 导出 `groupKeyOf(modelId, romram)`（romram 空白剥离，与 selKey 同归一），批量 Map 建键与全部查询侧（columnsModel 档位分组、intentFilter）共用它。`tierRecommend.ts` 的 dataKeys/groupSkus 入参由调用方按 dimProduct 原值键构建（ProductPickerModal 与 TierBoardPicker 皆然），在 buildTierCandidates 内部归一后比对——两侧键口径解耦，调用方不再受键格式牵连。回归测试：columnsModel 金测补「带空格 romram 不落暂无现价」三例（分列·档位/代际·档位/批量命中）；tierPrice/tierRecommend/intentFilter 测试内的键构造同步对齐新契约。

### 代际视图重建（共享 Chart）
- 自绘 SVG LineageView 删除；Dashboard 渲染 `ColumnsView` + 新增可选 prop `lineage?: Map<groupKey, LineageChain[]>`。
- 传入 lineage 后：取数扩展到全部代（含未在册上一代）；每组系列替换为**每链一条拼接序列**——`splicedSeriesPointsOf` 沿全集桶逐桶产出，活跃桶复制活跃代 SeriesPoint 全真字段（price/rrp/offer/url/shopName/missing），不造点；`SeriesPoint.genLabel` 新字段附当代名，悬停小卡在产品名下出「当代：…」行。overlap（上一代交接后仍有价）= 同色细虚线陪衬系列，标签「…（上一代在售）」。
- 线型恒 step（拼接口径=期内恒定，smooth 会虚构中间价）。
- 交接标记：Chart 新增可选 prop `markers?: {idx,label}[]`——DOM 覆盖层 1px 竖线 + genShortName 短名置顶（与十字竖线同源 xPxOf 几何，不入侵 ECharts 网格）。交接在窗口前发生的链不出标记（正确语义）。
- 链标签：多代链「老 → 新短名」、单代链全名 +「（未登记上一代）」后缀（原行级 tag 的语言移进系列名）。
- 图下明细：代际视图渲染 TrendTables「代际价格明细」（与分列同一 onSeriesWindow 管道），insight strip 随之自动生效。无 prevGen 的 role=note 说明保留。
- 删除：LineageView.tsx、thinnedStepLabels、placeLane/placeHandoverNames/estTextWidth（标注放置纯函数随 SVG 一并退役）；保留 genShortName（交接短名仍用）与全部链模型金测。
