# PriceLens · 单国价格看板打样

需求基线：`../PriceLens-单国打样-自包含落地方案.md`（唯一事实来源）

```bash
npm install        # 安装依赖（已执行过则跳过）
npm run gen        # 造数：scripts/gen-data.mjs → src/data/*.json + fact 的 gzip+base64（seed 20261009，可复现）
npm run dev        # 本地开发
npm run build      # 产出单文件 dist/index.html 并同步覆盖仓库根 PriceLens.html（铁律：单文件版永远最新）
npm run typecheck  # tsc --noEmit
npm run verify     # 造数 + 聚合契约断言 + 单文件一致性（scripts/verify.mjs，47 项）
npm run test       # vitest：chartModel 纯计算层金测（快照钉住图表行为）
npm run check      # typecheck + verify + test + build 全链路
```

## 提交前防线（pre-commit hook）

hook 已随仓库提交（`scripts/hooks/pre-commit`），克隆后在本仓库根目录执行一次即启用：

```bash
git config core.hooksPath pricelens/scripts/hooks
```

每次 commit 自动串跑 `typecheck → verify → test → build`（build 最后同步 PriceLens.html），任一失败即拒绝提交；
verify 末项检查根目录 `PriceLens.html` 与 `dist/index.html` 逐字节一致（手工改过单文件或忘记构建即红）；
纯文档/注释类提交可 `SKIP_CHECK=1 git commit …` 临时跳过。

## 默认视图：月 · USD · 我司 + 配置竞品（第二十五轮）

- `defaultFilters` 改：粒度 `month`、币种 `usd`（参考汇率 80 折算）、默认范围
  `202607→202610`（月桶，与粒度自洽；自适应开时仍被数据跨度覆盖）。
- 数据默认勾选带出**配置竞品**：我司 = Pura 90s Pro · 12+256（最低价颜色）不变，
  `computeDataDefaults` 追加 `competitors = groupsFromBenchmark(own)`（主竞品在前，
  当前矩阵 = iPhone 17 · 8+256 → Galaxy S26 · 12+256）。切换我司仍不自动带出
  （反馈第 8 条不变），「匹配竞品」照旧重匹配。
- 持久化载荷加默认视图版本号 `v`（`DEFAULTS_V=2`）：旧版持久化（无 `v` 或版本旧）
  视为过期，本次启动直接落新默认视图；其后用户改动照常留存。`reset()` 同步回新默认。

## 缺采仅虚线跨接 + 币种档位锚定 USD + 断轴刻度修复（第二十二~二十四轮）

- **缺采呈现（第二十四轮）**：周价格未抓取（`crawl_status=missing`）不再画空心插值点，
  仅保留跨接虚线桥（`gapRuns` 桥接段不变，`hollowPoints` 已删除）；缺采点本就无
  跳转/下钻图标，交互零影响。**追加（同轮用户复核）：孤立有值周一并吸收**——
  两侧缺采夹一个有价周（如 iPhone 17 8+256 @202620）不再画点/放数值标签，两段短桥
  合并为一条整桥直连越过（`gapAbsorbedIdx` + `gapRuns` 合并；首末有值点不吸收，
  ≤2 有值点的短系列不会整条消失；悬停明细/跳转仍可看真实值）。
- **币种档位锚定（第二十三轮）**：`computeYAxis` 全链路（断轴阈值/内缘呼吸/整格吸附/
  格数/像素分配）在 USD 等值空间计算（÷perUsd），出口段域 ×perUsd、步长
  `niceStep(USD档×perUsd)` 吸附本币 nice 档——同一数据 ₽ 与 USD 格数/图高/断轴形态
  逐位一致（USD 100 一档 ↔ ₽ 10K 一档），未来加币种只需在 `helpers.perUsdOf` 登记
  对 USD 参考比价（`data/index.ts#localPerUsd` = dim_fx 终值）。`YScale.intervalUsd`
  供步长滞回跨币种复现。
- **断轴刻度两连修（第二十二轮）**：① `fmtAxisTick(v, interval)` 步长感知缩写——K 级
  50 步长的 1050/1100/1150 不再全部显示 1.1K；② 断轴时步长不细于连续轴档位，压缩
  只回收空白像素、图高不再反增（392 < 460）。

## 时间自适应 + 刷选轨道收编（第十九轮）

- **铁律**：`npm run build` / `check` 的最后一步自动把 `dist/index.html` 覆盖到仓库根
  `PriceLens.html`（`scripts/sync-single.mjs`），单文件离线交付版永远与源码一致。
- **自适应按钮**（时间格，季/月/周之后，默认开）：开 = 时间范围自动 = 所选产品数据跨度
  ±2 个时间间隔（左缘钳数据起点、右缘钳数据末端 = 当前时间，如跨度 202603–202608 →
  可选 202601–202610），RangePicker 冻结不可选；关 = 回手动。范围推导是纯函数
  `helpers.ts#seriesSpanRange/adaptiveRangeOf`（金测覆盖）。
- **刷选轨道 = 所选范围**（修 bug）：XBrush 轨道不再 = 数据全集，而是上方 RangePicker
  所选的 [rangeStart, rangeEnd]；窗口平移/双端拖柄一律钳在轨道内——下面的时间范围
  必须按上面所选限制。**例外 = ‹ › 箭头**：点击让窗口越出轨道一步，越出的那一侧把
  rangeStart/End 极值扩展到窗口端点（RangePicker 最小/最大值随之变化，grow-only）；
  自适应开 = 范围冻结，箭头顶到轨道边界即置灰。
- 筛选条宽度重排：时间格 352→428（容纳自适应按钮）；币种 96→140（修复 radio 组溢出
  被右缘裁切的旧账）；华为/竞品 226→190、国家 112→104、平台 124→108；分隔线呼吸 8→6。

## RRP 覆盖 S..E 且 ≥ 实际价 + 单产品轨迹内不断轴（第二十一轮）

- **RRP ≥ 实际价（用户口径）**：gen 撤「上市供应紧张溢价」台阶（曾 +5%/+2%，使折后价高于
  RRP）——上市段 = 首销原价 = RRP，此后全为折扣（坚挺/大促/清库）。verify 新增全表逐行
  不变量 `折后价 ≤ RRP`（₽ 与 USD）；促销力度带上市月 0%（不再出现溢价琥珀格）。
- **RRP 覆盖 S..E**：aggregate 的 RRP 原按「桶锚周」取值——上市/退市落在月中时锚周无行，
  RRP 留洞（折后价有值而 RRP 为 null）。改桶内扫描取最后一个有值周：折后价聚合全桶有值
  周，RRP 同样扫全桶 → 有价必有 RRP，虚线从 S 贯通到 E。verify 新增「每行都有 RRP」。
- **单产品曲线内不断轴**：computeYAxis 断轴判定从「值点集合的相邻空隙」改为**系列占用
  区间合并**——平滑曲线连续经过自身两点间的全部中间值，每系列占其 [min,max]，合并后
  区间之间的空隙（真正的跨产品无人区）才是候选断点。单产品自身涨跌（如 66800→65210）
  不再压出断轴；多产品值域不相交时断轴保留。金测：双系列断轴 / 单系列不断轴 /
  allowBreak 关 / scaleToDisplay（改双系列 fixture）。
- verify 45→47 项；金测 34→35 项。

## S/E 数值 + 月/季下钻图标 + USD 阶梯稳定 + Y 轴自动压缩（第二十轮）

- **S/E 端点数值标签**：端点标记点（S/E/‹›）此前 `symbol:'none'`——ECharts 的 line 标签
  画在符号元素上，符号没了标签一起被吞（S 点无数值；仅 RRP 视图更是一个标签都不剩）。
  改 `symbolSize: 0`（隐符号不吞标签）+ S/E 并入标签避让 P0 必放集（段中截止的 E 未必是
  首末/极值），端点徽标旁恒有数值；徽标点的标签距离让出徽标半径（12/10px）。
- **月/季悬停下钻图标**：月/季视图悬停时间竖线时，有值数据点变白底黑「放大镜+」图标
  （`DrillIcon.tsx`，同周视图跳转图标款式），点击 = 下钻该期间（与圈点点击同一 onDrill）。
- **USD 阶梯稳定（RRP 合理性）**：USD 折算弃周汇率（±1.5% 噪声让 RRP/折后价每周微抖，
  用户反馈「RRP ≤2 次涨价、不得频繁变化」），改固定参考汇率 80（§A8，与 launch_price_usd/
  tier_code 同源）——USD 与 ₽ 同阶梯，只在真实事件变价；`dim_fx` 保留供口径参考。
  verify 新增不变量：`usd = round(₽/80)` 全表一致、RRP 两币种各自「恒定 + 至多一次上调」。
- **Y 轴自动压缩**（齿轮弹层改名，替代第十六轮「断轴处显示省略号」）：开 = 值簇空白 ≥
  阈值处断轴压缩（灰带/虚线边/⋮ 随断轴出现）；关 = 跳过断轴检测（`computeYAxis allowBreak`），
  Y 轴完全连续展示。开关穿透主图（index 受控）与迷你图（Chart 内部缺省）。
- 连带修复：**单值退化轴**（RRP 稳定后仅 RRP 视图 = 恒定价一条线，此前整轴刻度显示同一
  数值）——轴跨度至少撑到量级 2%；**端点徽标跟随主价口径**（仅 RRP 时徽标贴 RRP 虚线，
  不再按折后价钳在轴外）。

## 单文件交付瘦身（第十八轮）

- `fact_price_weekly.json`（5.7MB）不再进 bundle：`gen-data.mjs` 同步产出
  `fact_price_weekly_gzip.b64.txt`（~268KB），`src/data/index.ts` 模块加载时用
  fflate 同步解压；`.json` 原件仅供 `verify.mjs` 与人工核对。
- ECharts 按需注册（`echarts/core` + Line/Scatter + Grid + Canvas）。
- 效果：`dist/index.html` 7.33MB → ~1.7MB（-77%）。

## 分工（并行）

| 模块 | 负责人 | 主要文件 |
| --- | --- | --- |
| 造数 + §7.3 聚合契约 | Agent A | `data/master/*.json`、`scripts/gen-data.mjs`、`src/data/*`、`src/dataModel/aggregate.ts` |
| 筛选条五框 + 配置页 | Agent B | `src/state/FiltersContext.tsx`、`src/components/FilterBar/*`、`src/components/ProductCascader/*`、`src/pages/Config.tsx` |
| 价格走势图全家桶 | Agent C | `src/chart/PriceTrend/*`、`src/pages/Dashboard.tsx`（纯计算层 `chartModel.ts` 与金测 `__tests__/`） |

公共冻结文件（不许改）：`src/theme/tokens.ts`、`src/dataModel/types.ts`、`src/state/filtersTypes.ts`（B 仅可追加字段）、`src/state/lplKeys.ts`、`src/App.tsx`、`src/main.tsx`、构建配置。
