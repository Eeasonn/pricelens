# Batch 4｜迭代：Agent 功能与 UX 升级

> 建议分支：`zcode/pricelens-iterate-t428u-20261107`（或独立 `zcode/pricelens-iterate-agent-t428u-20261107`）  
> 基线：迭代现行 @ `a22d21e`；稳定对照 @ `1374114`（只读回归）  
> 参考稿：[`../mockups/d-agent-ux.html`](../mockups/d-agent-ux.html)、[`../mockups/shots/d-agent-ux.png`](../mockups/shots/d-agent-ux.png)  
> 已验收线索：`receipts/pricelens-agent-ux-codex-20261106.md`、`pricelens-agentux-impl-20261106.md`、`pricelens-bench-cap-country-sync-20261106.md`

## 1. 目标

在迭代线完善 Agent：**意图 → 上下文 → 调用 → 状态/结果 → 后续动作**。  
组件可评估引入 **Ant Design X**（或同等）的气泡/发送区能力，但 **视觉必须服从** `DESIGN.md` / tokens（Apple/Notion 极简），禁止全站 Ant 默认皮。

稳定线：本批 **不重做**；若有共享组件改动，必须跑稳定回归且不破坏「价格优势」「价格预警」、换国同步、BENCHMARK_CAP 文案。

## 2. 开源库评估要求（写入实现注释或本 brief 附录）

在动手前用公开 npm/仓库信息核验（不可访问则标「待核实」）：

| 库 | 查 license | 栈匹配 | 体积 | 可定制 | 维护活跃 |
|---|---|---|---|---|---|
| `@ant-design/x` | 必查 | React+antd5 | 必查 | 主题/样式覆盖 | 必查 |
| 备选 1（如 Vercel AI SDK elements / 自研） | 同上 | 同上 | 同上 | 同上 | 同上 |

结论原则：能少依赖就少依赖；若引入，仅用于对话壳，业务结果卡仍用现有 Copilot 组件。

## 3. 真实能力审计（以代码为准，禁止臆造工具）

已存在能力（须接真实动作）：

- 价格优势查询与定位（含换国竞品矩阵同步，见 `priceAdvantage.ts` / countrySync 测试）  
- 价格预警准备/打开（Alerts）  
- Agent 面板状态：ready/running/success/error 等骨架  
- 语音输入入口（browser）— 若环境不支持需降级文案  

缺口（本批可做 UX，不可假装已接通）：

- GTM 情报卡片动作（依赖 Batch3 数据）  
- 预测四步「重算/固定取证」深链（依赖 Batch2）  
- 任意「置信度 %」展示 — **禁止编造**

## 4. UX 契约

- 业务结果小卡片：结论 → 事实 → 规则/计算边界 → 动作药丸  
- 来源证据：可打开；无则「暂无快照」  
- 药丸按钮必须绑定真实 handler（跳转页面/定位行/打开预警），禁摆设  
- 快问 / 输入建议：仅列已支持意图  
- 状态：运行中、失败重试、取消、无结果、上下文不足  
- **不暴露模型推理链**  
- 动效：160ms 反馈，720ms dock 连续重排（已有则复用）；尊重 `prefers-reduced-motion`

## 5. 文件白名单

- `pricelens/src/components/Copilot/**`  
- `pricelens/src/agent/**`（合约与适配，不扩未实现远端工具）  
- `pricelens/src/state/AgentContext.tsx`  
- 对应测试  
- 可选：`package.json` 仅当明确批准引入 `@ant-design/x` 且评估表已填  

禁改：Forecast 公式、Intelligence 假数据源、稳定专属文案边界、凭据、push。

## 6. 验证

```bash
npm --prefix pricelens run typecheck
npm --prefix pricelens run test
# 重点：
# pricelens/src/agent/__tests__/priceAdvantage.countrySync.test.ts
# pricelens/src/agent/__tests__/agentux*.test.*
npm --prefix pricelens run build:iterate
```

手工：迭代打开 Agent → 价格优势（换国）→ 价格预警 → 失败重试；稳定 worktree 抽测同路径不回归。

## 7. DoD

- [ ] 评估表落地（或「待核实」阻塞标明）  
- [ ] 结果卡/证据/药丸/状态齐全且动作真实  
- [ ] 无推理链、无虚构置信度  
- [ ] 稳定回归通过  
- [ ] 显式 git add，不 push

## 8. 开源库评估结论（2026-11-07 实核落地）

评估基线见设计稿 §16.1（`pricelens-t428u-design-20261107.md`），本节为实现侧最终结论：

| 库 | license | 栈匹配 | 体积 | 可定制 | 维护活跃 | 结论 |
|---|---|---|---|---|---|---|
| `@ant-design/x` | MIT（npm 2.10.0，2026-10-29 更新） | React；**新版 peer 指向 `antd^6`，本仓为 `antd^5.21`，安装即 peer 冲突** | 周下载约 10 万级；引入需连带气泡/发送区全家桶 | 可主题化，但须整体压成 PriceLens 皮（去 Ant 默认蓝/圆角/阴影体系） | 维护活跃 | **不引入** |
| 备选：树内 Copilot 壳（`components/Copilot/*` + `state/AgentContext.tsx`） | 自有代码 | 已在树内，antd5 原生契合 | 零新增依赖 | 完全受控，直接消费 `tokens.ts` | 在维护（本轮继续迭代） | **采用** |

**决策**：不引入 `@ant-design/x`。peer 依赖冲突（`antd^6` vs 本仓 `antd^5`）意味着要么锁旧版长期背着升级债，要么全仓升 antd 6——两者都超出本批「对话壳升级」的收益半径。气泡、发送区、状态机与结果卡继续在树内 Copilot 壳上迭代，视觉服从 `DESIGN.md` Apple/Notion 极简规范与 `tokens.ts` 唯一色值源；业务结果卡仍由本地确定性引擎生成（`agent/core.ts`），远端只允许改写叙述。该结论已同步落在 `AgentPanel.tsx` 组件头注释。

## 9. Batch 4 实现记录（ZCode，2026-11-07）

- 状态机补 `empty`（运行成功但零结果卡）：`AgentRunStatus` 增补、schema enum 同步、面板提供「缩小时间范围 / 重新描述」真实动作。
- 结果卡结构对齐 UX 契约：结论 → 事实 → 规则/计算边界 → 来源证据（无证据时显式「暂无快照」）→ 药丸动作。
- 药丸动作全部绑定真实 handler：回看价格走势（定位周）、打开价格预警（`price_alert` 意图）、迭代渠道独占的「跳 GTM 情报 / 跳量价预测」导航捷径（stable 渠道不渲染，避免落回 dashboard 的假捷径）。
- 语音输入：浏览器不支持时除禁用态外给出可见降级文案。
- 快问建议保持三条已验证核心意图；forecast 页追加「解释量价预测」（真实 `forecastCards` 路径）。
