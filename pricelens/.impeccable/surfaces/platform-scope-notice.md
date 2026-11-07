# 平台口径归一说明条幅（platform-scope-notice）· R7-M1 局部决策

日期：2026-11-07（t428u Round 7）。属正式产品面（稳定版价格走势 / 量价走势 / 国家总览三处筛选卡）。

## 目标与范围

稳定版把平台/店铺口径在 Provider 入口（load / `actions.set` / 换国）统一经 `normalizePlatformScope` 归一（国家合法 + 店铺级透明展开平台级）后，原始店铺输入从 `state.platform` 移除。本组件把归一**事实**（剔除/展开、最终口径）在筛选卡内常驻展示，用户不必打开 Agent 也能看到「口径为什么变成这样」。

- 数据源：`FiltersState.platformScopeNotice`（`{ note, countryCode, platform }` provenance，随 v12 持久化留存）。
- 挂载点：`FilterBar`（价格走势/量价）字段行下方、总览筛选卡字段行下方；迭代版恒不渲染（无此归一）。
- 生命周期：notice 与当前国家 + 当前平台逐集相等才显示；deliberate 换平台/换国/重置后失效整条消失；刷新后同一口径下仍在（provenance 随包持久化）。

## 信息层级与语义

- 一条 `caption`（12px/18px）文字行，`warningSoft` 底 + `warningInk` 字（「用户输入被调整、需要关注」语义；文字本身承载全部事实，颜色只作提示，符合「状态不靠颜色单独传达」）。
- 文案即 `normalizePlatformScope` 产出的说明原文：非法项被剔除的事实 + 「稳定版仅支持平台级：已选店铺 X 已按所属平台展开为 Y 平台（含平台内全部店铺）参与计算与回看」三要素。
- 非交互（`role="status"`、`aria-label="平台口径归一说明"`、`data-platform-scope-note` 测试锚）；不是 toast，不会自动消失。

## 证据呈现与例外

- Agent 四类结果卡（图卡图注 / 最新价格摘要 / 价格优势 / 最新有价周平台比较）与预警卡边界经 `platformScopeProvenanceNote` 引用同一条说明，页面与结果口径一致。
- 迭代版无归一说明（行为不变）；混合合法/非法输入时说明先事实后动作，与 R5/R6 卡边界措辞同源。
