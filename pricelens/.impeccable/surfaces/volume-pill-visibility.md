# 量价页产品显隐（移除式隐藏 + 暂存条）

> 设计正典：`docs/design/2026-11-01-volume-price-pill-toggle.md`（方案 A，§8 全按推荐拍板）。
> 本文件只记落地口径，供后续会话快速对齐。

## 目标

量价页面板头药丸点击 = 该产品面板整体移出网格，被隐藏产品收进面板区下方的
「已隐藏」暂存条，点击恢复。与价格走势页药丸行为完全同构（点击隐藏、虚线可恢复、
Y 轴收缩、主品同规则）。

## 拍板口径（2026-11-01 19:04，§8 全按推荐）

1. 主产品可隐藏，允许全部隐藏（空态兜底「已隐藏全部产品 + 全部恢复」，无死锁）。
2. 暂存条在面板区内、时间轴行下方；不进横滚区。
3. 阅读 ↔ 组内对比（含换组）切换即清空隐藏集。
4. 不做「仅看主产品」快捷。
5. 价格页 hiddenKeys 本轮不动。

## 状态与复位

- 会话态 `usePageViewState<string[]>('volume.hiddenPanels')`（存数组）；不进 URL、不落 localStorage。
- 复位时机：视图模式切换、`scaleResetKey`（产品清单/价格类型/币种）变化 → 清空。
- 粒度/国家切换不清（面板 key = `modelId__配置去空格` 不随其变化）。

## 渲染层过滤（核心手法）

`panelSpecs`/`panelData`/`panelViews` 与全部按下标挂的面板态数组
（hoverIdxs/geoms/brushes/brushLive/volumeLimits/panelWins）保持全量不动；
只在 `orderedPanels` 之后按隐藏集过滤出 `visiblePanels` 再渲染。
grid 列数与轨道宽按**可见数**重算（≤3 均分，>3 横滚同现状公式）。

- `visUnion`（共享 Y 轴并集）与 `adaptiveSeries`（时间自适应）只聚合可见面板。
- 页面级联动（同步时间轴、悬停列、拖选 brush）只看可见面板；面板级状态按面板保留，恢复即回。
- `panelOrder` 拖拽换位与隐藏正交；隐藏面板的位置序保留，恢复插回原位。

## 组内对比旧「面板保留 + 图表清空」语义整体移除

`panelHidden` 分支、emptyHint「已隐藏，点击产品名恢复显示」、
`series={panelHidden ? [] : p.vis}` 等全部退役；阅读视图面板头从纯文本升级为
可点击 `PillUnit`（信息结构不变：平台行 + 品牌行 + 名称行 + 配置 chip，
右侧「本组对比（N）」保留）。

## 暂存条与空态

- 暂存条 `pages/volume/HiddenTray.tsx`：`role="group"` + `aria-label="已隐藏产品，N 个"`；
  迷你药丸单行虚线态（BrandDot + 名称 + 配置 chip，`lpl-hit` 外扩命中区）+「全部恢复」。
  无隐藏不渲染；全部隐藏时也不渲染（空态承担恢复）。
- 全隐藏空态：虚线框「已隐藏全部产品」+ 居中「全部恢复」，替换面板网格区。

## 焦点承接（键盘）

- 药丸点击隐藏 → 焦点移到暂存条对应迷你药丸；
- 迷你药丸点击恢复 → 焦点回该面板头药丸；
- 「全部恢复」→ 焦点落到第一个恢复面板的药丸。
- 实现为渲染后 ref 定位（pendingFocus + layout effect）。

## 例外与边界

- 390px：暂存条 flex-wrap 换行、「全部恢复」恒可见；面板区维持 minWidth 880 局部横滚。
- 动效 160ms fade（暂存条出现）；reduced-motion 直跳；面板重排不做位移动画（浏览器
  scroll anchoring 兜底）。
- 阅读视图主品隐藏后其「本组对比（N）」入口暂不可达（恢复即回），空态永远提供出口。
