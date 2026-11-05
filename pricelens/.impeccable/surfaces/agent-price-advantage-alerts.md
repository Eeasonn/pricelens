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

## 视觉与动效

- 复用 AgentPanel 的白卡、hairline、等宽数字、neutral token 和现有按钮样式；蓝色用于选中/有利比较，琥珀用于待核查/回退，红色用于我司更贵或错误。
- 不新增 AI 紫、渐变、glow 或无限循环脉冲。阶段过渡使用现有 GSAP token，并在 `prefers-reduced-motion` 下即时完成。
