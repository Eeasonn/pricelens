# Batch 3｜迭代：国家情报 → GTM 情报工作台

> 建议分支：`zcode/pricelens-iterate-t428u-20261107`（可与 Batch2 同分支分 commit，或独立 `zcode/pricelens-iterate-gtm-t428u-20261107`）  
> 基线：迭代现行 `zcode/pricelens-iterate-forecast-design-p0-20261106` @ `a22d21e`  
> 参考稿：[`../mockups/b-gtm-intel-workbench.html`](../mockups/b-gtm-intel-workbench.html)、[`../mockups/shots/b-gtm-intel-workbench.png`](../mockups/shots/b-gtm-intel-workbench.png)  
> 现状对照：[`../shots/current/iterate-intel.png`](../shots/current/iterate-intel.png)

## 1. 交付边界

把 `IntelligenceCenter` 从偏新闻列表的「国家情报」升级为 **GTM 情报工作台**：图文并茂、可筛选联动、可溯源，服务 GTM 决策。  
**是工作台，不是营销海报墙。**  
稳定渠道本批不做（稳定隐藏 `intelligence` 页，见 `hiddenInStable`）。

## 2. 模块清单（须分「已具数据 / 待补接入」）

| 模块 | 目标内容 | 数据现状（以代码为准） | 本批要求 |
|---|---|---|---|
| 新品 | 产品图卡 + 上市地区/时间 + 关键规格变化 + GTM 意义 | 现有情报页有模拟/本地卡片能力；真实新品图与源链接 **待接入** | UI + 契约 + 示例标注；真实源接口标 TODO |
| 竞品 | 竞品动态、对标档位、渠道可见性 | 部分可复用配置/benchmark；动态情报 **待接入** | 卡片可展开溯源；无数据空态 |
| 渠道 | 渠道上架/下架、可见促销位 | **待接入** | 结构占位 + 明确「待接入」 |
| 价格促销 | 促销事件、价带变化 | 可与预警/量价事件对齐部分字段；全量促销情报 **待接入** | 与筛选国家/产业联动 |
| 市场事件 | 政策/展会/大促日历 | 预测侧有事件模型可参考；情报中心真实源 **待接入** | 时间线 + 溯源 |

## 3. 图卡与溯源契约

每张情报卡默认展示：

1. 产品/事件是什么（标题 + 一句话）  
2. 哪里（国家/地区）  
3. 什么时候（事件时间 / 采集时间）  
4. 关键变化（价/规/渠道/份额等，缺则「暂无」）  
5. 对 GTM 的意义（短判断，必须挂证据或标「示例判断」）

展开后必须可追溯：**原始链接 / 时间 / 地区 / 来源状态**。  
真实图片：仅官方或许可可用源；失败显示中性 fallback（灰底+品名缩写），**禁止热图堆砌**。  
**所有示例数据必须可见标注「示例」**，不得冒充实时。

## 4. 交互

- 顶栏：国家 / 产业 / 时间窗 / 模块 chips 筛选；与全局 scope 双向联动（读 `FiltersState`，写回需确认不破坏稳定）  
- 主区：模块分区或统一信息流（二选一，优先分区工作台，对齐 mockup B）  
- 右栏或抽屉：详情 + 证据 + 「进入量价预测」捷径（已有 `go('forecast')`）  
- 键盘：卡片可 Tab 聚焦，Enter 展开；Esc 关闭抽屉  
- 动效：160ms 展开，240ms 抽屉；`prefers-reduced-motion` 去掉位移

## 5. 文件白名单（建议）

- `pricelens/src/pages/IntelligenceCenter.tsx` 及同目录拆出的 `intelligence/**` 新组件  
- 必要的 `pricelens/src/theme/tokens.ts` 补齐（若 Batch1 未合入，只加本批用到的）  
- 对应 `__tests__/**`  
- 禁止：伪造 ingest、改稳定 `appChannel` 暴露情报页、改预测业务公式、`git push`

## 6. 验证

```bash
npm --prefix pricelens run typecheck
npm --prefix pricelens run test
npm --prefix pricelens run design:check
npm --prefix pricelens run build:iterate
```

浏览器（迭代 worktree 自起端口，避开 5191）：打开 `?p=intelligence`  
- 有「示例」徽章  
- 筛选联动  
- 展开可见溯源字段  
- 图片失败 fallback  
- 对比截图 `docs/design/shots/current/iterate-intel.png`

## 7. DoD

- [ ] 五类模块 IA 落地或明确「待接入」空态，无假实时  
- [ ] 图卡 5 要素 + 溯源齐全  
- [ ] 示例标注可见  
- [ ] 稳定线无情报页回归问题  
- [ ] 显式 `git add` 目标文件，不 push
