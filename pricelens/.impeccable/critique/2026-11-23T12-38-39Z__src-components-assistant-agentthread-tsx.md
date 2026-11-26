---
target: 当前稳定版 Agent 用户交互评审（assistant-ui 基准）
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
p2_count: 1
target_identity: "file:/Users/eason/Documents/Eason's Projects/Price Intelligence/pricelens/src/components/Assistant/AgentThread.tsx"
target_fingerprint: "sha256:9d70922d6813b31a165020485e20d9be4e181a9a7cb274dc38b30d6d1f174e3f"
target_path: /Users/eason/Documents/Eason's Projects/Price Intelligence/pricelens/src/components/Assistant/AgentThread.tsx
timestamp: 2026-11-23T12-38-39Z
slug: src-components-assistant-agentthread-tsx
---
Method: dual-agent (A: agent-3 · B: agent-2)；另有独立视觉评审 agent-4、独立 UX 走查 agent-1。

# PriceLens 稳定版 Agent 用户交互评审

## 结论先行

**当前是“领域结果卡较成熟、通用对话骨架已合格，但完成态与持续工作尚未成熟”的内部 Agent。Nielsen 评分 26/40，属于 Acceptable，而不是 Excellent。**

可以胜任受控演示和内部试用，不宜把“已接入 assistant-ui”当作“体验已经成熟”。真正差距不在皮肤，而在五件事：隐式筛选写入、降级与数据状态诚信、长结果首读位置、会话恢复、密集结果的阅读效率。

评审对象是默认生产稳定通道及根目录 `PriceLens.html`，不是 dev 迭代版或历史 roadshow。真实走查覆盖提问、价格优势、证据展开、筛选预览、应用与撤销、刷新恢复；远端在线流式服务未验证，静态离线版的本地回退路径已实测。

## Design Health Score

| # | 启发式 | 分数 | 关键问题 |
|---|---|---:|---|
| 1 | 系统状态可见性 | 2 | 有运行/停止/取消状态，但“结果已生成”与“4/5 完成”并置，异常影响不明。 |
| 2 | 系统与现实世界匹配 | 3 | 领域语言自然，但 `usd → local`、无分隔周 ID 等机器格式泄漏。 |
| 3 | 用户控制与自由 | 3 | 停止、后台运行、重试、撤销/Esc 已有；部分“导航”会隐式改筛选。 |
| 4 | 一致性与标准 | 3 | token、卡片、选中态统一；状态徽章和格式化口径不统一。 |
| 5 | 错误预防 | 2 | 有错指纹锁和筛选校验，但定位/回看可绕过预览确认。 |
| 6 | 识别优于回忆 | 3 | 范围和动作可见；长结果的结论、表头会离开视口，历史不可恢复。 |
| 7 | 灵活性与效率 | 3 | 有快捷键、三种面板模式、重问；缺少结果内部导航与分支。 |
| 8 | 美学与极简 | 2 | 空态克制；完成态把业务动作、诊断、追问、复制、重试近似平铺。 |
| 9 | 错误诊断与恢复 | 3 | 取消和复制/应用失败有出口；异常工具及本地回退被折叠。 |
| 10 | 帮助与文档 | 2 | 有建议与输入提示；缺少针对执行异常和能力边界的即时说明。 |
| **总分** | | **26/40** | **Acceptable：基础良好，关键信任问题需优先修复。** |

认知负荷为 **3/8 项失败，中等**：顶部约 7 个信息片、结果首读层级错误、完成态约 10 个入口。情绪旅程是“进入平静 → 运行可控 → 得到证据时信心最高 → 看到 4/5 与隐藏回退后信任下降 → 面对过多后续入口收尾”。

## Design Specificity Verdict

**领域内容高度专属，线程交互中度专属。**国家/产品/时间/币种口径、确定性价格卡、证据、判断边界和动作锁都不是可随便换皮的通用聊天组件；这部分应坚决保留。

但对话仍停留在通用“消息流 + 卡片 + 一排追问”。每次回答还没有稳定成为一份**先读结论、能核验、能安全推进、能恢复的分析简报**。Detector 仅额外发现 `pricelens/src/components/CopilotStable/AgentPanel.tsx:203` 的 2px 微柱条圆角 advisory，不影响上述主判断。

## 做得好的三点

- **证据不是事后补充。**范围、事实、计算规则、判断边界、来源与动作锁构成 PriceLens 的明确产品性格，见 `pricelens/src/components/CopilotStable/AgentPanel.tsx:38-55`、`:379-499`。
- **运行控制有工程基础。**发送/停止互斥、运行中草稿、迟到响应隔离、关闭后继续、IME、复制失败与焦点恢复均已覆盖；项目内相关 2 个测试文件、21 项测试通过，见 `pricelens/src/components/Assistant/AgentThread.tsx:137-194`、`pricelens/src/state/AgentContextStable.tsx:243-393`。
- **筛选预览是正确范式。**“尚未应用 → 前后值 → 应用/继续修改 → 撤销/重做”已真实走通，应用时 URL 从 `cur=usd` 变为 `cur=local`，撤销后恢复，见 `pricelens/src/components/CopilotStable/AgentPanel.tsx:157-179`。

## Priority Issues

### 1. [P1] “定位/回看”名为导航，实际直接修改全局筛选

- **证据**：价格优势整行和“看板”先 `applyFilter` 再跳页，见 `pricelens/src/components/CopilotStable/AgentPanel.tsx:236-263`；带 `filterPatch` 的 open 动作同样直接应用，见 `:127-150`。
- **影响**：用户以为是只读查看，却改变国家、产品、平台或时间口径；绕过产品“所有筛选写入先预览确认”的承诺。可撤销不等于已预防误操作。
- **建议**：目标口径不同就先展示变更字段并确认；口径相同才直接导航。移除整行隐式写入，按钮明确命名为“在看板定位 · 将调整筛选”，目标页保留可见撤销。

### 2. [P1] “生成了结果”掩盖了降级能力和未回答用户问题的事实

- **证据**：真实离线回退中，顶部显示“结果已在 Agent 面板生成”，折叠区却是“4/5 完成”，展开后才看到 `remote.agent 失败`；独立 UX 走查询问“为什么只有 W45 有价格”时得到通用平台比较，点击“解释趋势变化”又误入预警结果。
- **影响**：用户会把“有输出”误认为“问题已回答”，也无法判断失败步骤是否影响数字和覆盖范围。
- **建议**：分开表达回答状态、工具终态和结果可用性，例如“4 成功 · 1 失败 · 已回退本地结果”。在答案就近说明“当前只能做本地摘要/规则核对，无法回答原因”；不能回答时直接说不能，不用其他卡片替代答案。运行中活动工具默认可见，完成后再折叠。

### 3. [P1] 数据真实性、计算方式、运行提供方混为一体

- **证据**：消息头只有“价格数据分析”，价格卡只有“本地确定性”；`ProviderBadge` 仅从 `source.includes('simulated')` 猜演示状态，其余统一处理，见 `pricelens/src/components/CopilotStable/AgentPanel.tsx:398-403`。
- **影响**：“本地确定性”只说明计算可重复，不证明输入是真实数据；不符合产品对 `real / simulated / mixed` 显式标识的约束。
- **建议**：用结构化字段呈现“数据：真实/模拟/混合｜计算：本地确定性｜运行：远端/本地回退”，并同屏给出覆盖率与采集时间；不要从来源字符串猜数据状态。

### 4. [P1] 会话不能恢复，“新对话”无确认地清空工作

- **证据**：刷新后重新打开 Agent 回到欢迎页，之前消息与结果卡全部消失；`newConversation` 直接清空 messages、undo/redo 和 applied IDs，见 `pricelens/src/state/AgentContextStable.tsx:182-184`、`:394`。
- **影响**：价格分析往往需要跨页面核对、刷新和持续补证，当前只够一次性演示；“修改后重问/重试”也只是新运行，没有可返回分支。
- **建议**：先持久化单会话、草稿、上下文 fingerprint 和结果卡；有内容的新对话需确认或提供撤销。随后用 external-store 的 `messageRepository + headId + onEdit/onReload/setMessages` 实现真正分支，再决定是否开放 ThreadList，不默认引入 AssistantCloud。

### 5. [P2] 长结果首读落在表格中段，完成态行动层级过平

- **证据**：桌面与手机结果截图都先显示表格中段或判断边界，结论和表头不在视口；1280×720 空态标题也被上沿裁切。底部同时出现卡片动作、两个折叠区、三个追问、复制与重试。证据：`.oil-ui/agent-stable-review-20261123/shots/desktop/page-价格优势结果.png`、`.oil-ui/agent-stable-review-20261123/shots/compact-desktop/page-空态.png`。
- **影响**：实际首读顺序变成“部分事实 → 规则 → 边界 → 动作”，破坏产品的结论优先；用户需反复滚动才能恢复上下文。
- **建议**：当前安装的 `@assistant-ui/react@0.15.35` 已支持 `turnAnchor="top"`，直接在 `pricelens/src/components/Assistant/AgentThread.tsx:215` 采用顶部回合锚点，让问题与结论先出现；空态关闭初始化自动滚底，保留用户上翻所有权。完成态只保留一个主要业务动作和最多三个相关追问，其余进入统一次级区。

## Persona Red Flags

- **Alex（熟练分析用户）**：第一次查询很快，但核对结论、表头、异常步骤和证据要反复滚动；“复制”只复制 `message.text`，不包含结构化事实和来源，难以直接形成纪要。
- **Sam（键盘/低视力用户）**：基础焦点、live status 与 Esc 良好；11px 表格、10–11px 元数据、32px 控件和整行 button 内嵌按钮削弱复杂结果可用性。读屏与 200% 缩放未实测。
- **Riley（边界压力测试者）**：最容易遇到“导航却写入”“完成却 4/5”“本地确定性却无真实数据标签”的契约不一致；功能可能正确，但行为需要懂实现才能预测。

## Minor Observations

- `pricelens/src/components/Assistant/AgentThread.tsx:109-115` 复制仅含结论文本，应提供“复制完整结果”，包含范围、事实、规则、边界和来源。
- 顶部、scopeLabel 和筛选预览使用不同格式；统一为用户可读的时间与币种，如“2026-W38 至 W45”“USD → 本币（实际代码）”，不要显示 `usd → local`。
- 初始建议在多个页面完全同构，价格优势完成后仍重复“价格优势”；独立走查的“解释趋势变化”还误入预警。建议按当前结果生成真正的后续动作，并先校验 intent。
- 移动端仍显示桌面式 Enter 提示；32×32px 发送/关闭/新建目标可在 coarse pointer 下扩大至 44×44px，视觉图标不必变大。
- 宽屏 dock 会遮住看板右侧，若强调并排分析，应让主工作区重排或提供局部滚动，而非单纯覆盖。

## 激进参考 assistant-ui 的正确顺序

1. **先修线程与信任，不加皮肤**：顶部回合锚点、阅读位置、真实停止/错误恢复、工具终态、明确数据状态、所有写入先确认。
2. **再修持续工作**：单会话持久化、新对话撤销、完整结果复制、动态建议；随后接 `onEdit/onReload` 和分支 repository。
3. **最后才扩展**：历史 ThreadList、队列、反馈按真实需求开放；语音、通用附件、AssistantCloud、原始 chain-of-thought 和另一套 AI 紫色主题都不是当前必选项。

官方依据：[Thread Viewport / turnAnchor](https://www.assistant-ui.com/docs/primitives/thread)、[ExternalStoreRuntime / 编辑、分支与持久化](https://www.assistant-ui.com/docs/runtimes/custom/external-store)、[工具与人工批准](https://www.assistant-ui.com/docs/tools/tool-ui)。完整第一方资料汇总：`docs/research/assistant-ui-agent-interaction-benchmark-20261123.md`。

## Questions to Consider

- 如果每次回答只能保留一个下一步动作，价格优势结果最应该让用户核对证据、定位看板，还是继续缩小范围？
- “回看板”究竟是只读导航还是筛选写入？能否仅看按钮名称就知道后果？
- 一张不滚动的结果截图，能否同时回答结论、范围、数据真实性、证据位置和下一步？
