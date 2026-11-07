# 访问角色与配置导入导出设计（GTM / 查阅者）

日期：2026-11-06 ｜ 通道：稳定版（stable） ｜ 分支：`zcode/pricelens-stable-config-rbac-20261106`
授权：Yixuan t75u ｜ 实现入口：配置页页头工具行

## 1. 背景与目标

稳定版配置（竞品对标、上一代关系、默认店铺、异常守卫）目前存于浏览器 localStorage（`LPL3.config.*`），任何打开页面的人都可以修改，且换浏览器 / 清缓存即丢失。本轮补两件事：

1. **配置快照导入/导出**：单一 JSON 文件（`.pricelens-config.json`）完成备份与跨浏览器迁移；
2. **角色分组（可演示）**：`gtm`（可编辑 + 导入导出）与 `viewer`（查阅者，只读 + 可导出），为后续 Huawei 账号权限下发预留判定源。

近期**不做**真实登录 / 后端 ACL / SSO。

## 2. 角色表

| 角色 | 值 | 语义 | 获得方式 |
| --- | --- | --- | --- |
| GTM | `gtm` | 配置维护者：编辑全部配置、导入、导出、恢复默认 | 默认角色（未设置/值非法时回退） |
| 查阅者 | `viewer` | 只读：查看全部配置、导出备份；一切写入控件禁用、导入与破坏性操作不渲染 | 配置页工具行「角色」切换（演示） |

- 存储：`LPL3.access.role`（localStorage；§13 键前缀对齐。lplKeys.ts 为冻结登记文件，键常量登记于 `src/access/role.ts` 并注释对齐）。
- 默认 `gtm`：现网人人可配的现状不因升级突变锁死。
- 变更广播：`ROLE_CHANGED_EVENT`（`lpl3-access-role-changed`）；`useRole()` 订阅后配置页控件态即时切换。
- UI 文案显式标注：「正式环境将由账号权限下发」（开发/演示用）。

## 3. 能力矩阵

| 能力 | GTM | 查阅者 |
| --- | --- | --- |
| 查看配置页全部块（对标/店铺/异常守卫/上一代/汇率/大促） | ✅ | ✅ |
| 编辑竞品对标（编辑弹窗增删/排序/保存/恢复默认） | ✅ | ❌ 全部禁用 + 「查阅者只读」 |
| 编辑默认店铺（平台/店铺下拉、清除人工配置） | ✅ | ❌ 禁用 |
| 编辑上一代关系（下拉、恢复默认） | ✅ | ❌ 禁用 |
| 编辑异常守卫（开关/档位/自定义阈值/撤销裁定） | ✅ | ❌ 禁用 |
| 图上逐点人工裁定（确认真实价格/标记异常） | ✅ | ❌（store 写 API no-op） |
| 导入配置 | ✅ | ❌ 入口不渲染；`applyImportPayload` 内再校验 |
| 导出配置 | ✅ | ✅（只读备份） |
| 查阅者横幅 | — | ✅「查阅者不可修改配置，请联系 GTM」 |

### 防御纵深（三层）

1. **UI 门控**：配置页 / 对标编辑弹窗（`BenchConfigModal` 被配置页与总览共用，内部统一门控）所有写入控件 `disabled`，导入与「恢复默认」等破坏性操作不渲染或禁用；
2. **导入门控**：`applyImportPayload()` 校验 `canEditConfig()`，viewer 直接拒绝；
3. **store 写 API no-op**：`saveBenchmark` / `clearBenchmarkEntry` / `savePrevGenOverrides` / `clearPrevGenOverridesForModels` / `saveDefaultShopOverrides` / `saveAnomalyRule` / `addAnomalyMark` / `undoAnomalyMark` 在 viewer 下直接返回，不落盘（覆盖图上逐点裁定等旁路）。

## 4. 配置快照格式（schemaVersion 1）

```json
{
  "schemaVersion": 1,
  "exportedAt": "<ISO8601>",
  "appChannel": "stable",
  "keys": {
    "benchmark":   [ … ] | null,
    "prevGen":     { modelId → prevModelId | null } | null,
    "defaultShop": { cc → channel_id } | null,
    "anomalyRule": { "enabled": bool, "thresholdPct": 10–90 } | null,
    "anomalyMarks":[ … ] | null,
    "fx":          { currency → rate } | number | null
  }
}
```

- 语义：导出 = 各键**原始持久化值**（无人工配置的键为 `null`）；导入时 `null` = 移除该键、恢复系统默认。这样「导出 → 清配置 → 导入」严格还原，auto 口径不被人为固化成 manual 快照。
- 明确**不进**快照：`LPL3.filters`、`LPL3.ui.mainCombos` 与迭代 forecast 键（`referenceEventTypes` / `referenceWorkspace` / `intelligenceReview`）；含未知键的文件整份拒绝。
- `fx` 为只读历史键（真实汇率按行折算，UI 无编辑入口）：导出带上当前值以备份完整，导入若含则原样写回。
- 导出：工具行「导出配置」→ 下载 `pricelens-config-<时间戳>.pricelens-config.json`（viewer 也可）。
- 导入（仅 GTM）：选文件 → 全量校验（schemaVersion / 每键类型守卫，任一不符即整份拒绝、**绝不半写入**）→ 预览摘要（导出时间、来源通道、各国竞品条数、上一代/店铺覆盖数、异常规则口径、裁定条数）→ 确认后一次性写回并派发 `CONFIG_CHANGED_EVENT`（defaultShop 读缓存失效，全部页面即时生效）。

## 5. Huawei 账号 / SSO 扩展点

近期无 SSO；接入时的唯一改动点在 `src/access/role.ts`：

1. 登录态拿到 token 后，从 claim（如 `roles: ["pricelens.gtm"]`）解析出 `AccessRole`；
2. **claim 覆盖 localStorage**：`setRole(claimRole)`（或新增 `applyClaimRole()`，仅 claim 存在时覆盖、缺省不回退清除），本地演示切换即失效；
3. `getRole()` / `canEditConfig()` / `useRole()` 签名不变，全站 UI 与 store 门控零改动；
4. 未登录 / claim 缺失时的默认值届时按产品决策收紧（如回退 `viewer`），只需改 `getRole()` 默认分支并补测试。

## 6. 涉及文件

- `src/access/role.ts`（+ `__tests__/role.test.ts`）：角色唯一判定源
- `src/state/configImportExport.ts`（+ `__tests__/configImportExport.test.ts`）：快照导出/校验/应用/摘要
- `src/pages/Config.tsx`（+ `__tests__/Config.rbac.test.tsx`）：工具行（锚点 + 搜索 + 角色切换 + 导入导出）、查阅者横幅、导入预览确认、全页控件门控
- `src/pages/config/BenchmarkConfigBlock.tsx` / `DataQualityBlock.tsx`：`canEdit` 门控 + 长说明收进 Tooltip
- `src/pages/overview/BenchConfigModal.tsx`：内部统一只读门控（覆盖总览「＋添加竞品」入口）
- `src/state/configStore.ts` / `defaultShopStore.ts` / `src/dataModel/anomaly.ts`：写 API viewer no-op

## 7. 验收口径

1. viewer：竞品/上一代/店铺/异常规则均不可改；导入入口不出现；**可导出**；
2. gtm：可改 + 导入导出 round-trip（导出 → 清配置 → 导入 → 恢复）；
3. 单测覆盖 role gate / import validate / export shape / 配置页组件态；
4. `npm run check`（design / typecheck / verify / vitest / build）全绿。
