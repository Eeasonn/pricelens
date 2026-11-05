# 价格走势页 · 第196轮五条整改（Eason 2026-11-05 指令）

> **2026-11-05 复检补充（Eason 三条，稳定版为先）**：
> ①销毛迷你卡只留「销毛率 + 模拟徽标 + 大数字」，单行卡高 30px（毛利/成本小字段删除）。
> ②名称带位置改「Y 轴刻度标签右侧、绘图区左缘之间」（带右缘贴绘图区，不再压刻度）；
>   对齐改「与价格线位置对齐」——期望位 = 该线首个可见桶 y（钳带内），重叠时
>   resolveCollisions 最小位移上下避让（等距分布退役）；带宽自适应保留。
> ③稳定版价格页全局平台化（全部 STABLE 门控，iterate 不动）：取数 platform =
>   全局 state.platform（店铺级经 platformLevelForChannel 降平台级，每线覆写失效）；
>   渠道 chip / 店铺同步 / 每线渠道小药丸 / 「多平台对比」入口在 stable 不渲染；
>   URL shop=/seller= stable 忽略并剥离（写侧恒 null 删键），plat= 继续驱动全局；
>   旧持久化店铺级平台启动降级。平台化回归测试：stableGlobalPlatform（mock 钉 stable）
>   + iterateGlobalPlatformRegression（无 mock 锁现状）。


范围：`pricelens/src/chart/PriceTrend/**` 与 `pages/Dashboard.tsx`。量价侧（pages/volume、VolumePrice）只 import 不改。

## 1. 悬停小卡「价差」列

- Chart.tsx 悬停明细（浮层 tip 与 tipBox 两模式同一 `body`）在「周环比/折扣率」列后新增「价差」列。
- 口径与图下「价差与明细」宽表（TrendTables）完全同源：`diffPct(对比.price, 主品.price)`（helpers.ts，
  与 TrendTables.tsx 价差区同一函数同一调用形态）；主品行留空（基准），对比行显示带符号百分比；
  任一侧缺价 / 主品价 ≤ 0 → 「—」。着色沿用宽表：行更贵红（color.error）、更便宜蓝（color.link）、平 ±0.0% 中性。
- 触发条件：Chart 新增可选 prop `tipDiffBaseKey`（主分析产品系列 key）。index 层合并图传第一组主品、
  分图传各面板主品；未传（量价/下钻/多平台）不渲染该列，宽度计算不变。
- 列样式沿用 188 轮收口语言：表头与数据行逐元素同宽居中、列间 1px hairline 竖线满行高。

## 2. Y 轴默认只刻度；档位默认关；轴列宽度内容自适应

- `dashboard.showTiers` 默认值 true → false（会话态，仅影响新会话）；Chart 内部兜底状态同翻转。
  齿轮「已修改」蓝点判断改对每页默认值比较（ChartToolbar 新增 `tiersDefault`，缺省 true = 量价页不变）。
- `axisChrome(currency, showYTicks, showTiers, tickTexts?)`：仅刻度场景轴列宽 = 最长刻度文案估宽
  （axisTickGutter 同公式，钳 [34, 64]）+ 短横线；仅档位 = 档位文字带（TIER_LABEL_W），不预留刻度空位；
  两者同开 = 现状堆叠。`tickTexts` 由调用方显式传入才生效——VolumePrice/多平台/下钻不传，行为不变。
- index 层用 `axisTickTextsOf(scale)`（纯函数，helpers）从当前 Y 模型取刻度文案，同源喂给
  estGridLeft / splitAxisWidth / Chart.axisTickTexts / SplitAxisColumn.tickTexts，四处逐像素一致。

## 3. 恢复图左侧产品名称预留带（zone 模式，第115轮回收 → 本轮恢复）

- 旧实现蓝本：`git show 987da34^:pricelens/src/chart/PriceTrend/chartModel.ts`（buildLabelPlan
  forceNameZone 分支 + 等距分布）与 `987da34^:.../index.tsx`（合并 gridLeft=estGridLeft+188、面板
  gridLeft=NAME_ZONE_W=188）。按当前结构重写等价物，不整段回贴。
- buildLabelPlan 新增 `nameZone?: { width: number; axisW: number }`：名称药丸全部进入
  [plotLeft − axisW − width, plotLeft − axisW] 带，按折线起点纵向排序后等距分布（槽位 ≥ 药丸高+4、
  整组绘图区纵向居中）——与旧算法逐语义一致；SeriesNameItem 新增 `zone` 标记 → ZoneNamePill 单行
  nowrap（带内不换行，宽度按 measureText 自适应预留）。
- 带宽自适应：`nameZoneWidthOf(names)`（chartModel）= clamp(最长药丸宽, 112, 320)，旧基准 188；
  index 对合并图与全部分离面板统一取全局最长名（面板等宽）。宽度进 estGridLeft（合并）与面板
  gridLeft（分图），任何场景不留空。
- 与图顶品牌图例带并存：BrandLegendStrip 不动；药丸悬停起点引线（hoverNameKey→svg line）在带内继续可用。

## 4. 销毛迷你卡（悬停小卡上方）

- index 层用我司主品（第一组 main）序列调 `marginCostOf`（pages/volume/marginCost，只 import），
  按当前国家/窗口桶出逐桶销毛点，经 `margins` prop 传入 Chart；Chart 悬停浮层上方 8px、左缘对齐
  处渲染迷你卡（同圆角/描边/L2 投影，高≈价格卡一半）：标题行「销毛率 · 模拟」（数据状态显性）+
  大数字销毛率 + 小字单台毛利/成本。缺数据该格显示「—」。
- 数据边界：marginCostOf 为**月版本模拟模型**（`simulated: true`，输入=显示币种折后价月均），
  非真实成本；仅我司主品渲染；桶对不上月（无有效价月）→ null → 「—」。量价页未传 margins 不受影响。

## 5. 量层叠加 + 工具行「量」开关

- ChartToolbar 大促档期组框左侧（同组框内首位）新增「量」Checkbox（默认关）；开启后同组追加
  柱|面积 Segmented。仅 index（actions 行）传入新 props，其余调用方零变化。
- Chart 新增 `volumeOn / volumeMode / volumes / volumeColor / volumeHeight`：量层在价格绘图区**下方**，
  带 Y=0 贴带底、最高柱顶=价格绘图区底缘，中间无分界线（x 轴线随量层隐藏，时间标签经
  buildOption.bottomExtra 下移到量带之下）；右轴 1px hairline + 三档刻度（vMax/vMax/2/0）随量层缩放，
  gridRight 量层开启时 24→56。柱模式视觉常量照抄 VolumeBars（柱宽 0.62×列宽、rx=1、品牌色 α0.18、
  悬停列 α0.38）；面积模式=纯半透明面积、无描边。悬停卡不加销量行（保持五列）。
- 价格区压缩在 index 完成：`yCfgVol` 以有效 sliderScale 重新 computeYAxis，使量带高 = 压缩前总高 × 30%
  （clamp 后以视觉舒适为准）；yAdaptKey 计入 volumeOn 保证步长解冻。合并图与分图同机制，分图逐面板
  各自主品的 `volumeByBuckets` 周量。
- 量数据边界：dataModel/volume 估算模型（无真实销量事实，确定性微扰可金测），与量价页同一只读口径。

## 量层五件套 + 呈现四条微调（2026-11-05 复检，Eason 看真机）

- 面积渐变再淡 50%：α 0.34/0.04 → 0.17/0.02，仅面积模式（柱模式不动）。
- 量带归属药丸：量带左缘、名称带同列，说明「这条量是谁的」= 合并图第一张卡主品 / 分图各面板主品
  （volumeOwner 对象传入，主品线被图例隐藏时药丸仍在）。规格与名称带药丸单一来源（NAME_PILL_BOX /
  NAME_PILL_TEXT：11px、3px 8px、高 24），不截断、长度随内容，带内垂直居中；无量数据不渲染。
- 悬停量带：透明捕获层只占量带（价格区悬停逻辑不动，事件照常冒泡算时间列）；浮出单行
  「销量 N 台」小卡（与销毛卡同容器语言），缺量桶显「销量 —」不造 0；量带内细竖参考线到该桶。
  悬停量带时不在价格区与量带交界画横虚线（守住「中间无分界线」）。
- 三点标注：最高上 / 最低下 / 最新看来向，纯数字文本（品牌色、10px、等宽数字、细白描边，无框），
  柱|面积两模式都标，带内独立 resolveCollisions 避让、横向钳入绘图区，同桶只出一枚。
- 联动高亮：悬停量带或归属药丸 → 只留主品线、对比品降淡，走名称药丸同一通道（hoverNameKey → litKeys）；
  量带联动不画名称引线；悬停中关量层/换产品时自愈，不残留降淡。litKeys 记忆化，逐桶悬停不重绘 ECharts。
- 三卡同组（tipGroupPlacement）：价格主卡定侧，销毛卡 / 销量卡永远同侧、贴触发线的那条边对齐
  （右侧 = 左缘一线；左侧 = 右缘一线，translateX(-100%) 不依赖估算宽）。主卡外框按 content-box
  外框宽算（W + 内边距 20 + 描边 2）——真机量出旧算法左翻时主卡压线 6px、三卡错位 22px，已修。
  该列无价（主卡不在场）时销量卡自己定侧。垂直位置不变。
- 销毛卡数据门控：主品为竞品时不出销毛卡（口径 = 我司产品），量带归属仍如实显示其名。
- 真机核验（5174 dev，Pura 90s Pro 卡）：药丸与名称带外框 24px 同高、同内边距、文字不截断、带内居中偏差 0；
  三点标注无底无框；卡组右侧（W31）/ 左侧（W40、W42）贴线边三卡差 0.0px、主卡距触发线 16px。

## 验收映射

| 断言 | 测试 |
| --- | --- |
| 价差列与明细表同源 | `__tests__/tipDiffColumn.test.tsx` |
| 轴列自适应宽（仅刻度 / 仅档位） | `__tests__/axisAdaptiveWidth.test.tsx` |
| 名称带结构 + 等距间距 | `__tests__/nameZonePlan.test.ts` |
| 销毛小卡 | `__tests__/marginMiniCard.test.tsx` |
| 量开关/两模式/右轴 | `__tests__/volumeLayer.test.tsx` |
| 档位默认关 | `__tests__/tiersDefaultOff.test.tsx` |
