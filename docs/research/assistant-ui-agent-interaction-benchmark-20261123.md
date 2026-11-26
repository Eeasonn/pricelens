# assistant-ui 成熟 Agent 交互基准研究

- **研究日期**：2026-11-23
- **研究对象**：assistant-ui 官方文档、官方 GitHub 仓库与示例；GitHub `main` 核对点为 [`8227544705c6045e70545711ee38d09040e1a282`](https://github.com/assistant-ui/assistant-ui/commit/8227544705c6045e70545711ee38d09040e1a282)。
- **范围**：只研究外部交互基准；未查看或修改 PriceLens 业务代码，也不对 PriceLens 现状下结论。
- **证据边界**：下文“支持”指官方提供原语、组件、运行时契约或示例，**不等于所有运行时默认开启，也不等于接入后自动达到成熟体验**。本次是文档与源码核实，未逐一运行官方示例，未做 WCAG 合规审计或真机测试。

## 1) 官方事实与来源

assistant-ui 官方定位是开源 TypeScript/React AI Chat 库：由运行时、可组合原语、可安装样式组件及适配器组成，而非一个封闭的聊天气泡组件。官方 README 明确列出 streaming、auto-scroll、retries、attachments、voice dictation、keyboard shortcuts、accessibility、Generative UI 与 human approvals，但实际能力仍取决于所选运行时和适配器。[官方仓库 README](https://github.com/assistant-ui/assistant-ui) · [运行时适配器支持矩阵](https://www.assistant-ui.com/docs/runtimes/concepts/adapters)

| 能力 | 官方事实与已核实边界 | 第一方来源 |
|---|---|---|
| **消息流与流式状态** | `LocalRuntime` 用 `async *run` 逐次产出**累计完整内容**，不是 delta；assistant message 有 `running / requires-action / complete / incomplete` 状态。文本和 reasoning 通常只有最后一个 part 报 `running`，工具调用状态独立；提前放空文本 part 会改变 reasoning 的流式状态。`MessagePartPrimitive.InProgress` 可渲染流式指示，完整 `Thread` 也有 running 状态。 | [LocalRuntime](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime) · [Message](https://www.assistant-ui.com/docs/primitives/message) · [Thread](https://www.assistant-ui.com/docs/ui/thread) |
| **Composer** | 原生 `<form>`、`<textarea>`、`<button>`，处理自动增高、焦点、文件粘贴和提交；同一组原语既能新建消息也能原位编辑。支持 Enter / Shift+Enter、Ctrl/Cmd+Enter、Escape，区分禁用整个输入与只禁用发送；可组合附件、听写、引用、@提及、斜杠命令和运行中消息队列。队列并非所有运行时默认能力，`LocalRuntime` 对应选项目前标为 `unstable`。 | [Composer 原语](https://www.assistant-ui.com/docs/primitives/composer) · [Composer API](https://www.assistant-ui.com/docs/api-reference/primitives/composer) · [ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store) |
| **附件** | 有 `add / send / remove` 适配器生命周期、拖放、粘贴、多文件、待发送预览/移除、已发送只读展示、上传进度及分类错误事件；所有附件完成后才交给运行时，发送失败或取消可把文字和附件带回 composer。内置 base64 方式主要适合图片和小文件，大文件应上传服务器；文件类型能否使用仍取决于模型和后端，不是 UI 接收了就一定可推理。 | [Attachments 指南](https://www.assistant-ui.com/docs/guides/attachments) · [Attachment 原语](https://www.assistant-ui.com/docs/primitives/attachment) · [Composer 原语](https://www.assistant-ui.com/docs/primitives/composer) |
| **语音** | 官方明确分成三种：composer 按说转写（STT）、单条消息朗读（TTS）、实时双向语音；分别由 `DictationAdapter`、`SpeechSynthesisAdapter`、`RealtimeVoiceAdapter` 提供。支持 interim/final transcript、停止、静音、音量及语音消息状态；浏览器内置听写依赖 Web Speech 兼容性与麦克风权限。默认 action bar **不包含**朗读按钮；实时语音转写能否持久化、是否进入后续模型上下文因运行时而异。 | [Voice 总览](https://www.assistant-ui.com/docs/guides/voice) · [Dictation](https://www.assistant-ui.com/docs/guides/dictation) · [Speech](https://www.assistant-ui.com/docs/guides/speech) |
| **停止与断点恢复** | 可用 `ComposerPrimitive.Cancel` 或 `aui.thread.cancelRun()` 停止；官方示例在运行时把 Send 换成 Cancel。后端是否真正停止取决于适配器是否传递 `abortSignal`。恢复不是“重试”的同义词：`canResume` 只能在后端保留当前 run checkpoint 时开启，并需 `onResume`；普通取消不必然可恢复。 | [状态外置读取与停止](https://www.assistant-ui.com/docs/guides/state-outside-the-thread) · [LocalRuntime](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime) · [恢复语义](https://www.assistant-ui.com/docs/runtimes/custom/external-store) |
| **重试、编辑与分支** | `ActionBarPrimitive.Reload` 重新生成，`Edit` 打开消息自己的 composer；编辑历史用户消息会从该点重提并形成新分支，重新生成也产生分支，`BranchPicker` 提供 `n / m` 切换。进入编辑模式本身不会停止正在生成的回复，产品需自行决定此时策略。ExternalStore 需要相应 callbacks；恢复完整分支树还需 `parentId`、repository 和当前 `headId`，不能只保存线性消息。 | [Message Editing](https://www.assistant-ui.com/docs/guides/editing) · [Branching](https://www.assistant-ui.com/docs/guides/Branching) · [BranchPicker](https://www.assistant-ui.com/docs/primitives/branch-picker) · [ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store) |
| **历史会话** | **默认只有单条内存会话，刷新即重置**。单会话持久化需 history adapter；多会话可选 AssistantCloud、自定义远程适配器或外部 store。`ThreadList` 覆盖新建、切换、改名、归档/恢复、删除、标题、分页与加载状态；远程 thread-list adapter 只管会话元数据，消息历史仍需另行持久化。加载更早消息时可保持当前可视位置。 | [Threads](https://www.assistant-ui.com/docs/runtimes/concepts/threads) · [Adapters / History](https://www.assistant-ui.com/docs/runtimes/concepts/adapters) · [ThreadList](https://www.assistant-ui.com/docs/primitives/thread-list) · [Thread](https://www.assistant-ui.com/docs/primitives/thread) |
| **建议问题** | 同时支持空会话欢迎页的静态建议和会话后的动态 follow-up；点击可直接发送或只填入 composer。`SuggestionAdapter` 可在 assistant turn 后生成建议，但适配器支持矩阵并不覆盖所有运行时；外部 store 的建议生命周期由应用自己管理，新 run 是否清除旧建议不能一概而论。 | [Suggested Prompts](https://www.assistant-ui.com/docs/guides/suggestions) · [Suggestion 原语](https://www.assistant-ui.com/docs/primitives/suggestion) · [支持矩阵](https://www.assistant-ui.com/docs/runtimes/concepts/adapters) |
| **工具调用与人工批准** | Tool UI 可呈现参数、进度、结果、错误及交互；支持三种不同流程：human tool 由用户 `addResult`，前端工具执行中 `human()` / `resume()`，服务端 approval gate 由 `respondToApproval()` 允许/拒绝。默认 `ToolFallback` 有待审批控件和完成后的决策回执；“本次/会话/永远允许”等持久授权语义由宿主保存，assistant-ui 不自动替后续审批做决定。运行时必须具备相应能力，只读 transcript 不应保留可操作控件。 | [Tool UI](https://www.assistant-ui.com/docs/tools/tool-ui) · [LocalRuntime / HITL](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime) · [ToolFallback](https://www.assistant-ui.com/docs/ui/tool-fallback) |
| **生成式 UI** | 官方区分固定 Tool UI、模型从组件词汇表组装的 `present` / spec mode、后端推送的 data/generative-ui parts；spec mode 是新应用推荐路径，默认词汇表含 35 类组件。模型只能选用宿主注册组件，无 `eval` 或动态 import，但 props 仍是不可信输入，URL、原始 HTML、图片来源和流式半成品都需处理；可推迟到参数完整后再挂载图表。 | [Generative UI](https://www.assistant-ui.com/docs/tools/generative-ui) · [Tool UI / Deferred Rendering](https://www.assistant-ui.com/docs/tools/tool-ui) · [官方示例](https://github.com/assistant-ui/assistant-ui/tree/main/examples/with-generative-ui) |
| **推理过程** | 运行时把接收到的 reasoning 作为 message parts，不替后端生成推理。可将连续 reasoning 和 tool-call 分组为可折叠区域；流式时有活动提示和底部跟随，用户上翻或手动展开/收起后尊重其选择。`unstable_summary`、`unstable_redacted` 默认不由 `Reasoning` 展示，需应用显式处理；新代码应使用 `MessagePrimitive.GroupedParts`，旧 `ChainOfThoughtPrimitive` 属 legacy。 | [Reasoning](https://www.assistant-ui.com/docs/ui/reasoning) · [Chain of Thought 指南](https://www.assistant-ui.com/docs/guides/chain-of-thought) · [LocalRuntime / part 状态](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime) |
| **反馈** | `FeedbackAdapter` 支持赞/踩及可选 comment；按钮有 `data-submitted` 和 `aria-pressed`，默认 Thread 仅在运行时有反馈能力时显示按钮。文字反馈需另加 `FeedbackDialog` 或自定义表单。Assistant Cloud 对缺 remote id 等情况会跳过并记录警告，请求失败也主要记录日志，因此“用户是否收到失败反馈”仍需产品设计。 | [Adapters / Feedback](https://www.assistant-ui.com/docs/runtimes/concepts/adapters) · [ActionBar](https://www.assistant-ui.com/docs/primitives/action-bar) · [Cloud Feedback](https://www.assistant-ui.com/docs/cloud/scores) |
| **滚动行为** | 新内容流式到达时，仅在用户未手动上翻时自动跟随；展开消息内 disclosure 会暂停跟随，回到底部或点击 ScrollToBottom 可恢复。支持 bottom 与 `turnAnchor="top"` 两种回合锚点，并分别控制 run start、初始化、切换会话时滚动；加载更早消息保持原消息可视位置。Reasoning 内部还有独立的流式跟随与用户上翻判定。 | [Thread / Viewport](https://www.assistant-ui.com/docs/primitives/thread) · [Reasoning / 滚动](https://www.assistant-ui.com/docs/ui/reasoning) |
| **错误、空态与加载态** | 完整 Thread 区分新会话欢迎页、切换会话时的 history skeleton 和运行中指示，避免把历史加载误显为欢迎页；`AuiIf` / Context API 暴露 `isEmpty / isRunning / isLoading / isLoadingEarlier`。`ErrorPrimitive` 用 `role="alert"` 展示消息错误；另有工具、附件、会话切换和历史写入错误状态/事件。它们需被组合成恢复流程：例如 thread-list 分页错误会被运行时吞掉并保留下次重试游标，可见错误提示要应用自行补。 | [Thread](https://www.assistant-ui.com/docs/ui/thread) · [Error](https://www.assistant-ui.com/docs/primitives/error) · [Context API](https://www.assistant-ui.com/docs/guides/context-api) · [Threads / 错误与分页](https://www.assistant-ui.com/docs/runtimes/concepts/threads) |
| **键盘与可访问性** | 原生表单/按钮语义、Enter 提交模式、Escape 取消、编辑取消后的焦点返还；ThreadList 支持 Tab 与方向键、当前会话 `aria-current`、菜单键盘行为；另有错误 `role="alert"`、反馈 `aria-pressed`、推理 disclosure `aria-expanded`。`asChild` 和自定义 Tool UI 把正确标签、焦点与键盘支持交给实现者；本次查阅未看到整库 WCAG 合规认证，不能据此免做审计。 | [Composer API](https://www.assistant-ui.com/docs/api-reference/primitives/composer) · [ThreadList / Accessibility](https://www.assistant-ui.com/docs/primitives/thread-list) · [Error](https://www.assistant-ui.com/docs/primitives/error) · [Tool UI / Best Practices](https://www.assistant-ui.com/docs/tools/tool-ui) |
| **移动端** | Web composer 可用 `unstable_insertNewlineOnTouchEnter` 让触摸主设备 Enter 换行、显式按钮发送；该选项目前是 experimental，布局仍由应用 CSS 负责。另有独立 Expo / React Native 包和元素：safe area、键盘避让、48dp 触控目标、屏幕阅读器公告、减少动态效果、长列表锚定；但 ToolGroup、follow-up suggestions、Sources 等 Web 元素在 native 尚未齐备。**React Native 能力不能反证移动 Web 已合格。** | [Composer / Touch](https://www.assistant-ui.com/docs/primitives/composer) · [React Native](https://www.assistant-ui.com/docs/react-native) · [React Native Elements / On a phone](https://www.assistant-ui.com/docs/react-native/elements) · [稳定性政策](https://www.assistant-ui.com/docs/migrations/deprecation-policy) |

**官方源码示例的交叉核对**：

- `with-chain-of-thought` 的 [`MyThread.tsx`](https://github.com/assistant-ui/assistant-ui/blob/8227544705c6045e70545711ee38d09040e1a282/examples/with-chain-of-thought/app/MyThread.tsx) 实际组合了 running 时 Send→Cancel、底部滚动按钮、建议问题、reasoning 分组、ToolFallback 和 Sources，不是只展示静态气泡。
- `with-generative-ui` 的 [`ChartToolUI`](https://github.com/assistant-ui/assistant-ui/blob/8227544705c6045e70545711ee38d09040e1a282/examples/with-generative-ui/components/chart-tool-ui.tsx) 展示工具运行态到响应式图表；[`ContactFormToolUI`](https://github.com/assistant-ui/assistant-ui/blob/8227544705c6045e70545711ee38d09040e1a282/examples/with-generative-ui/components/contact-form-tool-ui.tsx) 展示表单校验、`addResult` 和提交后的结果回执。
- `with-chain-of-thought` 的 [`README`](https://github.com/assistant-ui/assistant-ui/blob/8227544705c6045e70545711ee38d09040e1a282/examples/with-chain-of-thought/README.md) 还提供了无 API key 的确定性 mock 流，说明成熟交互可以用可控数据做离线验收，不必依赖每次真实模型输出。

## 2) 可借鉴的交互原则（我的归纳）

> 以下全部是我基于上述资料做出的归纳，**不是 assistant-ui 官方原话，也不是 PriceLens 现状判断**。

1. **先建状态机，再做视觉皮肤。** 一次 Agent turn 至少同时有消息、消息 part、工具、附件、历史写入等状态；成熟感来自每个状态都有呈现和出口，而不是圆角、阴影或一个“正在思考”动画。
2. **自动行为必须服从用户意图。** 自动滚动、自动展开 reasoning、自动聚焦都不能抢夺阅读位置和键盘上下文；用户上翻、手动展开、选择文本或切换会话后，系统应退让。
3. **每个长任务都要可停止、可恢复、可解释。** Stop 要真正取消后端并忽略迟到 chunk；Retry 要针对同一上下文而非重复用户消息；Resume 只能承诺后端确实保存的 checkpoint。
4. **编辑不是覆盖历史，而是创建可返回的选择。** 编辑与重试形成分支，分支切换与刷新恢复必须保留当前 head；否则“n / m”只是表面装饰。
5. **Agent 工作应可检查，决策应留下回执。** 工具参数、运行态、结果、错误、取消、审批和过期都要可见；用户处理过的表单或审批应沉淀为只读事实，避免历史消息里继续出现可重复提交的活按钮。
6. **渐进披露，而不是把所有技术细节都藏起来。** 默认突出最终回答，按需展开推理摘要和工具轨迹；有副作用的动作则反向前置暴露对象、参数和风险，不能以“简洁”为由隐藏审批上下文。
7. **生成式 UI 应是受约束的数据契约。** 只允许白名单组件、明确 schema、稳定业务 ID 和可追溯数据；流式参数未完整时显示结构占位，不让半组数据驱动图表或业务结论。
8. **历史、身份与恢复是核心交互，不是后台附属。** 会话切换、后台运行、分支 head、草稿、分页、账号/工作区隔离及写失败都要进入验收；只保存线性文本不足以支撑成熟 Agent。
9. **能力缺失时应诚实降级。** 没适配器、浏览器不支持、后端无 checkpoint 时，应隐藏或解释控件，而不是留下可点击但无效、假成功或永久 loading 的 UI。
10. **键盘、触屏和减少动态效果属于首轮验收。** 不能用 hover-only 动作、桌面 Enter 假设或不断闪烁的指示器，把可访问性留到“最后优化”。

## 3) 评审 PriceLens 时的检查清单

> 以下是**待执行的评审项，不是已发现的 PriceLens 问题**。建议每项记录“通过 / 部分 / 缺失 / 不适用”、复现步骤、截图或录屏，以及依赖的后端契约；`N/A` 必须说明产品范围理由。P0 是对话主闭环，P1 是 Agent 成熟度，P2 是跨输入方式发布门槛。

### P0：先验证主闭环与故障恢复

- [ ] **流式分阶段**：用慢流、首 token 延迟、空 chunk、乱序/迟到 chunk 测试；无重复、闪烁、清空前文，文本/推理/工具各自状态正确，最终能从 running 落到 complete、stopped 或 error。
- [ ] **真实停止**：流式中 Stop 始终可找到且可键盘触发；后端请求确实中止，迟到内容被忽略，已生成内容保留并明确标为停止，不会擅自继续或重试。
- [ ] **错误与重试**：分别模拟断网、超时、4xx、5xx、后端异常；错误靠近对应消息且可读，Retry 不重复用户消息、不串到别的分支，未发送草稿与附件不丢。
- [ ] **恢复边界**：只有后端有 checkpoint 才显示 Resume；刷新、断网重连、切会话再返回时，明确是续传、重新生成还是不可恢复，绝不伪装成无缝恢复。
- [ ] **编辑/重试/分支**：编辑旧消息与重新生成后能产生可切换版本；分支上下文正确，刷新后仍回到所选分支；流式中点击编辑的行为有明确策略，不会后台生成污染新分支。
- [ ] **Composer 全流程**：长文、多行、粘贴、中文 IME 组词、Enter/Shift+Enter/Escape、发送后焦点、编辑取消焦点均正确；只禁用发送时仍允许输入，运行中策略不会无提示吞稿。
- [ ] **滚动所有权**：用户在底部时跟随新 token；上翻阅读历史时不被拉回；有清晰回到底部入口；展开推理/工具不跳动；顶部插入历史消息不改变当前阅读位置。
- [ ] **空/加载/失败不混淆**：新会话、无消息但历史加载中、历史为空、首 token 等待、空回复、加载失败均有不同状态；不会在切换会话时闪欢迎页，也不会无限 spinner。

### P1：验证 Agent 特有成熟度

- [ ] **工具全生命周期**：每类工具至少覆盖 waiting/running/requires-action/success/error/cancelled；能看到工具名、关键参数、结果与失败原因，而不是只有通用 spinner 或原始 JSON。
- [ ] **人工批准只生效一次**：有副作用工具展示对象、参数和影响；Allow/Deny 可键盘操作，提交中防重复，拒绝/过期/取消有回执；刷新后不能重新意外执行，只读历史没有活审批按钮。
- [ ] **生成式 UI 可信**：组件来自白名单并通过 schema 校验；图表、卡片、表单使用稳定业务 ID 与真实数据血缘，流式半成品不造成误导；已提交控件变成只读回执。
- [ ] **推理展示诚实且克制**：仅展示模型/后端实际提供且允许公开的推理摘要或工作轨迹； streaming、完成、redacted 状态有区分，默认折叠且用户选择不被下一次 token 覆盖。
- [ ] **附件闭环**：类型/大小限制、上传进度、待发送移除、失败重试、已发送预览完整；模型实际支持该模态，大文件不会无保护地 base64 化，失败发送能恢复文字和附件。
- [ ] **建议问题有时效**：欢迎建议覆盖真实高频任务，turn 后建议随上下文变化；填入与立即发送的语义清楚，新 run、切分支或切会话后不会残留过期建议。
- [ ] **反馈不是假按钮**：赞/踩有选中态并持久化，负反馈可补充原因；缺远端 ID、网络失败时用户能知道未提交，不只写控制台。
- [ ] **历史会话可靠性**：新建、切换、改名、归档、删除、分页、刷新恢复均验证；切走仍在运行的会话后状态一致，历史写失败有提示，不同账号/工作区绝不串会话。
- [ ] **语音按范围验收**：若纳入范围，分别测听写 interim/final、麦克风拒绝、无语音、停止、朗读打断及权限恢复；不支持的环境明确降级。不要把全双工语音当作文本 Agent 的必选项。

### P2：键盘、读屏与移动 Web

- [ ] **全键盘路径**：仅用 Tab、Shift+Tab、Enter、Space、Escape 和方向键完成发送、停止、重试、编辑、分支、审批、会话管理；焦点可见，菜单/弹层关闭后焦点合理返回，无 hover-only 关键动作。
- [ ] **读屏状态表达**：图标按钮有名称，当前会话/反馈/展开状态有对应语义，错误会公告；流式 token 不应逐字轰炸 live region，加载与审批结果则有适度通知。
- [ ] **移动 Web 实测**：至少覆盖 320/375/768px 与触摸设备；软键盘不遮 composer，安全区正确，触控目标建议不小于 44px，工具卡/图表不横向溢出，关键功能不依赖 hover。
- [ ] **移动 Enter 与中文输入**：触摸键盘 Return 的行为符合产品约定，不误发半句；外接键盘与中文 IME 不冲突，发送按钮始终可达。
- [ ] **长会话与减少动态效果**：长历史、连续工具卡和多 token 更新不造成滚动抖动；开启 reduced motion 后 shimmer、pulse、平滑滚动等不妨碍阅读，必要时采用分页或虚拟化。

## 4) 不应盲目照搬之处

- **不要把“安装 Thread”当作“获得成熟 Agent”。** assistant-ui 的价值主要是状态与交互骨架；历史、取消、重试、附件、语音、反馈和审批仍需要正确的运行时、适配器、后端和故障策略。
- **不要为追求功能清单而倒置优先级。** 先打穿 streaming → stop → error/retry → edit/branch → persistence → keyboard/mobile，再考虑全双工语音、复杂生成式 UI 或花哨动效。
- **不要默认采用 AssistantCloud。** 托管会话、标题、同步和文件存储很省事，但必须另行评估 PriceLens 的数据边界、账号/工作区隔离、部署形态与合规；自定义 thread list 也不等于消息已持久化。
- **不要把原始 chain-of-thought 当成熟度的必要条件。** 应优先展示供应商允许公开的推理摘要、工具调用和证据轨迹；没有真实 reasoning 数据时，不应生成一条“看似思考”的伪轨迹。
- **不要让模型自由生成任意业务 UI。** 白名单并不等于安全完成：props、URL、图片源、部分 JSON 和动作 payload 仍不可信。PriceLens 尤其应坚持确定性数据、稳定实体 ID、证据链接和业务规则校验。
- **不要照搬小文件 base64 或浏览器语音默认值。** 大附件要走受控上传与服务端校验；语音要处理浏览器差异、权限、成本和服务端凭证，且需核实选定运行时如何保存语音转写。
- **不要把 experimental / legacy API 当长期地基。** `unstable_*` 可在任意版本变化；新实现应优先当前支持的 `GroupedParts`、`AuiIf` 等路径，而非旧 `ChainOfThoughtPrimitive`、`ThreadPrimitive.Empty`，并单独审查 Attachment、Context、Runtime 等 API 的稳定性等级。[官方稳定性政策](https://www.assistant-ui.com/docs/migrations/deprecation-policy)
- **不要照搬桌面默认焦点、Enter 和 hover。** 自动聚焦可能抢输入，触摸设备 Enter 可能误发，hover 才出现的操作可能不可发现；中文 IME、移动 Web 和关键动作可见性必须按 PriceLens 用户重新验证。
- **不要复制通用建议问题与视觉主题。** 建议应来自 PriceLens 的真实任务和当前数据上下文；组件应服从 PriceLens 的设计 token、信息密度和证据规则，而不是把 assistant-ui 示例截图当成目标外观。
- **不要混用 React Native 与移动 Web 的结论。** Native 的 48dp、KeyboardAvoidingView、FlatList 等实现值得借鉴，但 PriceLens 若是 Web，仍需独立验证响应式布局、软键盘、触摸和浏览器可访问性。
