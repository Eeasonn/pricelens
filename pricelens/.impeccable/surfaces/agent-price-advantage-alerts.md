---
name: agent-price-advantage-alerts
description: PriceLens Agent 的价格优势与价格预警闭环。
mode: operate
---

# Agent：价格优势与价格预警

## 用户任务

用户在当前国家、产业、渠道和时间范围内询问“价格优势”或“价格预警”。Agent 先显示解析意图、读取事实、计算/校验和生成结论四个阶段，再给出可展开证据的结果卡。

## 事实边界

- 价格、币种、SKU、我司排序和优势/落后关系全部来自本地确定性价格聚合与既有 `buildAlerts` 规则。
- 远端只负责意图解析与叙述；远端卡片、数字和 SKU 与本地事实冲突时，保留本地卡片并显示“已按本地数据校准”。
- 结果必须带 real/mixed/simulated 文字状态、数据/规则来源和当前 context fingerprint。
- 缺采周保持缺失，不插值；无法计算时说明覆盖范围。

## 交互契约

- 价格优势卡支持“全部 / 只看占优 / 只看落后”、多规格 SKU chip、点击行定位国家×渠道×周，并保留自动竞品匹配。
- 价格预警卡支持每条展开证据、一键跳转看板或预警中心、应用筛选/标记状态，并能撤销或回退。
- 所有写入筛选的动作沿用现有 FilterResultCard 的验证、撤销和 stale guard。
- 运行中展示阶段与增量文本；Stop 后旧事件不能写入。失败状态在块内提供重试。

## Batch 4 增补（2026-11-07）

- 状态机补 `empty`（运行成功但零结果卡）：头部状态与 live status 显示琥珀「无结果 · 可调整范围」，消息区渲染 empty 卡，附「缩小到最近 8 周」（真实 filter 预览）与「重新描述问题」（回输入框）两个药丸；`AgentRunStatus` 与 JSON schema enum 同步。
- 结果卡结构对齐 UX 契约：结论 → 事实 → 规则/计算边界（价格优势卡以「规则 · 计算边界」标注 note）→ 来源证据 → 药丸。
- 证据缺失一律显式「暂无快照」（EvidenceList 空态），不用装饰占位。
- 药丸全部绑定真实 handler：价格优势卡「回看价格走势」（navBus 定位最新对齐周 + go dashboard）、「打开价格预警」（触发 price_alert 意图）、迭代渠道「跳 GTM 情报」（go intelligence）；预警事件卡「打开预警中心」「回看价格走势」「跳量价预测」（go forecast）。stable 渠道不渲染工作台捷径（页面不可达，避免假捷径）。
- forecast 页快问首项「解释量价预测」：不强制 query 意图，交 classifyIntent 路由到 forecast_explain，得到真实解释卡；其余页面维持三条已验证核心意图。
- 语音输入浏览器不支持时：按钮禁用 + 可见降级文案「当前浏览器不支持语音输入，请直接文字提问」。
- 组件库决策：不引入 @ant-design/x（MIT 但 peer antd^6 与本仓 antd^5 冲突），对话壳继续树内迭代（详见 docs/design/zcode-briefs/batch4-iterate-agent.md §8）。

## Batch 4 收口：共性缺陷 R1–R8（2026-11-07，Codex 稳定线审查）

- **R1 证据动作不设 stale gate**：「查看证据」改为 EvidenceList 内置的原地只读展开（`查看证据 · N` toggle，无证据时「暂无快照」）；CardActions 的 contextFingerprint stale 保护只作用于 `open`（导航）与 `apply`（写筛选）两类动作，followup/copy 不受影响。
- **R2 空卡五段结构**：EmptyResultCard 与空/未监控 AlertListCard 都显式渲染「事实 → 计算 / 规则 → 判断边界」分段（CardSection 组件），动作药丸永远排在边界之后；预警卡的规则段带出四类阈值与订阅状态（未监控明说）。
- **R3 终态收敛**：AgentContext 在 run 进入终态时用 `finalizeStepsForTerminalRun` 收敛响应步骤（running/queued/waiting_for_approval → success 或 failed）；ToolCallCard 渲染层再兜底一次，并把原先落入「运行中」的 warning 步骤显示为「已完成 · 注意」。
- **R4 空优势卡重跑**：`rerunWithPatch(text, intent, patch)`（AgentContext）走 applyFilter 同一写入通道落地 patch（可撤销），再用合并 patch 后的 context 重跑指定意图；空优势卡「调整范围 · 最近 12 周」绑定 `recentRangePatch(state, 12)` + price_advantage，不退化为纯 filter 预览。
- **R5 跨国查询**：`stateForPriceAdvantageCountry` 让「AE 页问 RU 价格优势」按请求国重建我司主品与竞品矩阵（全不在架时落该国默认主品）；结果卡「回看价格走势」在卡国 ≠ 当前国时先落地该国 filterPatch 再跳看板。
- **R6 范围合并计算**：带「最近 N 周」的查询（含 clarify 建议按钮）用 `stateWithRecentRange` 合并新 recentRange 后的 state 计算，不读看板旧范围。
- **R7 行级动作后置**：预警展开行顺序为 触发事实 → 规则 → 证据 → 判断边界（证据状态/阈值/不推断因果）→ 行级动作（应用预警筛选 / 查看完整证据）。
- **R8 tokens 化**：CardSection/卡片样式只用 `space.*`（8/12/16）与 `fontSize.*`（caption=12）；AgentPanel 内 `marginTop: 9`、`fontSize: 10.5` 及 9px padding 全部清除（rg 自检）。

## 视觉与动效

- 复用 AgentPanel 的白卡、hairline、等宽数字、neutral token 和现有按钮样式；蓝色用于选中/有利比较，琥珀用于待核查/回退/无结果提示，红色用于我司更贵或错误。
- 不新增 AI 紫、渐变、glow 或无限循环脉冲。阶段过渡使用现有 GSAP token，并在 `prefers-reduced-motion` 下即时完成。
- Batch4 收口：控件圆角统一 6（icon 按钮/警示条从 4/5 归位）、用户气泡 8（radius.card）、药丸 hover 仅收紧边框到强调蓝、价格优势表行 hover 用页面底色 #fafafa；焦点环沿用全站 button:focus-visible。
