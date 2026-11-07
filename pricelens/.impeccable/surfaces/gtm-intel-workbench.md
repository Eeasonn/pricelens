# 情报中心 · GTM 情报工作台（Batch 3 · 2026-11-07）

> 路由 `page = 'intelligence'`（`pricelens/src/pages/IntelligenceCenter.tsx` +
> `pricelens/src/pages/intelligence/`）。本文件为 Batch 3
> （`docs/design/zcode-briefs/batch3-iterate-gtm.md`）的实施正典。
> 稳定渠道继续由 `appChannel.ts` 的 `hiddenInStable('intelligence')` 隐藏本页
> （入口不渲染 + `go()` 落回 dashboard）；本批未触碰通道语义。

## 目标（Batch 3）

把「国家情报」（偏新闻列表）升级为**GTM 情报工作台**：高密度、图文并茂、
可筛选联动、可溯源，服务 GTM 决策。是工作台不是营销海报墙——每张卡回答
「是什么 / 哪里 / 什么时候 / 关键变化 / 对 GTM 的意义」，判断必须挂证据或
标「示例判断」。

## 数据状态三分法（诚实性红线）

条目与分区一律携带 `dataMode`，UI 徽章与文案随之：

| dataMode | 徽章 | 语义 | 例子 |
| --- | --- | --- | --- |
| `sample` | 琥珀「示例」 | 演示样例，不代表实时；不伪造 `evidence.url` 外链 | iPhone 17 Pro 上市卡 |
| `local` | 绿「本地」 | 仓内真实本地数据（可挂证据） | `dim_promo` 促销日历（R国 5 条） |
| `pending` | 灰「待接入」 | 结构占位；不填任何伪数值 | 渠道可见性监测卡 |

- 渠道模块整体 `pending`：一张虚线占位卡说明接入后回答什么，分区头写
  「待接入」；不做任何「实时抓取」的视觉或文案暗示。
- 汇率事件只在 R国显示（演示序列是 RUB，避免把 RUB 数值错标他国）；
  数值随全局时间窗联动但徽章仍为「示例」。

## 布局与交互

- 顶栏：五模块 chips（新品 | 竞品 | 渠道 | 价格促销 | 市场事件，`aria-pressed`、
  chip 内显条数/待接入字样），点击收起/恢复分区；右侧行内说明当前联动范围。
- 筛选联动：**只读**消费 `FiltersState`（国家/产业/时间窗），不回写——国家
  选择在共享页头、时间窗在价格走势筛选条，本页不造第二套筛选控件。
- 卡片：整卡 `role="button"` 可点，Tab+Enter 展开右侧详情抽屉
  （240ms 滑入，`prefers-reduced-motion` 直接落位 + 全局 CSS 降级双保险；
  Esc/遮罩/关闭钮关闭；打开时焦点入抽屉、关闭还原焦点）。
- 抽屉：完整 5 要素 + 采集时间 + 来源状态 + 原始链接（有则显）+ 图片授权
  （作者 · 许可 → Commons 文件页）+ 捷径「进入量价预测」（真实 `go('forecast')`）
  与「让 Agent 评估」（`openAgent('dock', …)`）。
- 空态：分区无条目时虚线框 + `moduleEmptyReason`（区分「本就待接入」与
  「当前筛选无条目」），不给装饰占位。

## 图片纪律（Batch 3 强制补充）

- 新品 / 竞品图卡默认渲染**真实上市机型照片**：`public/gtm-samples/*.jpg`
  （Wikimedia Commons CC0 / CC BY 4.0 / CC BY-SA 4.0，480px 压缩件，
  授权表 = `public/gtm-samples/ATTRIBUTION.md`，共 5 张：iPhone 17 Pro、
  Galaxy S25 Ultra、Pura 80 Pro、Magic8 Pro、Xiaomi 15 Ultra）。
- 产品图区**只用于新品 / 竞品模块**（`productImageModule`）；促销 / 事件 /
  渠道卡走纯文字密度，不再生成灰框。
- 未配图（刻意保留 `np-mate80-ru` 一条）与加载失败（含离线单文件场景）
  统一中性灰底缩写：`canvasSoft2` 底 + 发丝框 + 品牌点 + 品名缩写
  （`abbreviateModel` 截前两词）；禁渐变、禁热图、禁装饰占位。

## 复用与 token

- 徽章/选中态全部走 tokens：`warningSoft/warningInk`（示例）、
  `alert.evidence.verified`（本地）、`canvasSoft2/mute`（待接入）、
  `selectSoft/selectSoftInk`（模块 chip 选中，沿用 filter-selected 组件契约）；
  抽屉滑入用 `motion.base`(240ms) + `motion.enter`。未新增 token。
- 促销日历复用 `dim_promo`（数据装载层），周窗映射复用 `dimTime`
  （`weekIdRange` 唯一日历源）；provenance 页脚沿用
  `DEMO_INTELLIGENCE_PROVENANCE` + `provenanceSummary`。

## 待接入（不得假装已有）

新品官方图库与发布源、竞品动态情报、渠道上架/可见性采集、全量促销抓取、
多国汇率序列；接入前本页所有内容保持 sample/local/pending 三态标注。
