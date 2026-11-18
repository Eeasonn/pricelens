# PriceLens 最新稳定版全量 BUG 审计（2026-11-18）

> **修复状态：全部 P1 + 全部 P2 + 待核-3 已修 @ab944bc**（本地领先 origin/main 4 笔待推）。未动的两项：待核-1（realSalesOf 配置维度无行=空 Map 的「0 在售 vs 丢数据」语义）与待核-2（切 ZA 显式时间被 publishedRange 整体替换的口径）——均需 Eason 拍板后再动。全量 check EXIT=0（verify 53/53 + vitest 2088 过/7 跳 + typecheck + design 双检）。


- **审计对象**：HEAD `3237a2d`（= origin/main + 3 笔待推：71c751a 数据包 v3 原表模式+配置表五页签 / c36f930 --with-sales / 3237a2d 业务规则零内置）。稳定版范围 = 除大盘 / 预测 / 情报三页外的全部页面。
- **方法**：3 路并行深审（数据链路 / 稳定版图表页面 / 全局状态交互）+ 主线逐条交叉验证（全部 P1 与 3 个高可见 P2 亲自读码复核）。
- **基线**：`typecheck` + `design:check` + `design:lint` + vitest 2081 用例全绿。**系统全绿 ≠ 无 bug**，以下共 **5×P1 + 17×P2 + 3×待核**。
- **结论速览**：P0（崩溃/大面积数据错算）未发现。5 个 P1 全部集中在**最新 3 笔提交的 v3 原表导入路径**与**两条跨页状态链路**——恰好是测试覆盖最薄、真机演示走不到的路径。

---

## P1（功能错，建议随 3 笔待推提交一并修复后再推）

### P1-1 v3 导入：品牌列未归一大写 → 我司/竞品错位、型号分裂 ✅已复核
- 位置：`pricelens/src/dataModel/offerIngest.ts:347`（读入只 trim）、`:526`（`r.brand === 'HUAWEI'` 大小写敏感）、`pricelens/src/dataModel/ingestText.ts:54`（`BRAND_TOKENS[brand]` 键全大写）
- 机理：Python 金标 `ingest_real.py:761` 有 `raw["品牌"].str.strip().str.upper()`，TS 移植漏掉。品牌列出现 `Huawei`/`huawei` 时：① `prefixOf` 判为竞品 → `isOwn=false` → 产品树（按 `is_own` 过滤）里我司型号消失、对标矩阵 `own_model_id` 不匹配、PSI 销量「我司优先」解析失效；② `normkey` 查不到品牌词表 → 归一键与别名表/系列规则错位；③ 别名映射键 `${brand}|${nkey}` 与配置表里的 `HUAWEI` 不一致 → 别名静默失效；④ 同一品牌两种写法产出两个 model_id → 型号分裂。
- 触发：任何真实原表品牌列非全大写（Python 加这行就是历史上踩过的证据）。样例包品牌恒大写，端到端测不出。
- 修复：`offerIngest.ts:347` 加 `.toUpperCase()`，别名键两侧同归一。

### P1-2 v3 导入：空「型号」行不剔除 → 幻影型号 `*-x__…` 带真实价格进事实包 ✅已复核
- 位置：`pricelens/src/dataModel/offerIngest.ts:348`（`modelRaw` 无空判）、`:514`（`''` 可成正名）、`ingestText.ts:22`（`slug('')='x'`）；金标 `ingest_real.py:758` 有专门剔除+计数
- 机理：`modelRaw=''` 一路放行 → `nkey=''` → 正名 `''` → `slug('')='x'` → 生成 `cmp-samsung-x__256gb__black` 类空名幻影 SKU 混进 dimProduct 与事实包；产品树出现空名型号、量价聚合被污染；`droppedBy` 无对应计数，诊断行不可见。
- 触发：原表混有空型号/占位行，或型号值为 `'nan'/'None'`。
- 修复：空型号行 `bump(diag.droppedBy,'无型号'); continue`。

### P1-3 配置表：大促档期 xlsx 导入把平台名按空格切碎 → 「Mercado Libre」等带空格平台永不匹配 ✅已复核
- 位置：`pricelens/src/state/configTemplate.ts:521`（`split(/[,，\s]+/)`）
- 机理：模板口径「逗号分隔」，实现连空格一起切。`'Mercado Libre'` → `['Mercado','Libre']`；消费端 `chart/PriceTrend/index.tsx:1064` 精确成员比对（`mercado ≠ mercadolibre`）→ 该档期带在选中这些平台时**静默消失**。JSON 快照导入路径无此问题，仅 xlsx 路径坏。
- 触发：墨西哥/巴西/阿根廷等把 `Mercado Libre` 写进大促档期·平台列。
- 修复：只按 `,`/`，` 切分，段两端 trim。

### P1-4 稳定版页头 AI 搜索：NL 补丁落地 + 旧闭包 send → 按旧口径计算 + 结果整体判 stale、动作全禁用 ✅已复核
- 位置：`pricelens/src/components/PriceTrendSearchStable.tsx:176-190`（`actions.set(patch)` 后 `setTimeout(() => send(trimmed), 0)`，闭包捕获旧渲染的 `send`）；`pricelens/src/state/AgentContextStable.tsx:243-254`（`send` 依赖 `context`）、`:320-322`（stale 判定）
- 机理：补丁（国家/产品/币种/时间词）提交后 Provider 已重渲染出新 `send`，定时器里仍是旧引用 → `runContext` 用**旧国家/旧主品**计算答案；运行结束时 `contextRef.current.fingerprint ≠ requestContextFingerprint` → `stale_context`，CopilotStable 面板据此禁用全部回看/追问按钮。稳定面板自己追问走 `send(..., scope)` 路径不受影响，唯独页头搜索踩雷。
- 触发：稳定版页头搜索输 AI 模式回车，查询含产品/国家/币种/时间词（绝大多数自然语言查询）。
- 修复：补丁作为 `send` 第 5 参 `scope` 传入（稳定 send 已支持 scope 合成 runContext），或经 ref 取最新 send。

### P1-5 手动时间范围快照不带粒度 → ZA 往返后「周桶 id + 月粒度」错配，窗口失效并被 URL/持久化钉死 ✅已复核
- 位置：`pricelens/src/state/FiltersContext.tsx:670-672`（快照只存 adaptive/rangeStart/rangeEnd）、`:683-688`（恢复同三字段）、`:968`（非锁国粒度随 next 带走）；根因配套 `marketProfile.ts`（ZA `granularityLocked`）
- 机理链：RU（周+手动范围）→ 切 ZA（粒度锁 month、范围换发布月）→ 切回 RU：`:968` 非锁国保持 `next.granularity`='month'（ZA 强制的粒度泄漏回 RU）→ 快照恢复 RU 的**周桶 id** 但粒度仍 month → 终态 `RU + month + rs/re=202630/202640`。消费端 `filterBounds` 的 `indexOf` 找不到 → 图表显示全集而非手动窗口；URL/持久化效应把错配写盘 → **刷新后依旧错**，仅用户再手动动一次时间才自愈。
- 触发：RU 手动拉过时间范围 → 去一趟 ZA → 回 RU。正是「D=手动范围按国家.产业快照隔离」契约场景。
- 修复：快照落盘/恢复携带 `granularity`，或恢复时经 `convertRangeBuckets` 换算到当前粒度。

---

## P2（边界/口径缺陷，按影响面排序）

### 数据链路（v3/配置表）
| # | 标题 | 位置 | 一句话机理 |
|---|---|---|---|
| P2-1 | 店铺类型未钳制 {1P,3P,独立站} | `offerIngest.ts:360-361` | Python 有 `where(isin(...),'3P')` 兜底，TS 保留任意原文 → 平台类型筛选项永不命中这些渠道 |
| P2-2 | region.enabled 只置 true 不复位 | `offerIngest.ts:654-684` | v3 以内置 25 国全启用为基座，无数据国仍可选；`default_own_models` 悬空靠 FiltersContext 存在性校验兜底（脆弱依赖） |
| P2-3 | validateFactPack 不拦负字典索引 | `src/data/index.ts:102-112,129,140-141` | `-1 >= dict.length` 为假通过校验，`dict.url[-1]`→undefined 进 FactPriceWeekly.url（外部包注入面） |
| P2-4 | 系列模板 {n}/{w} 无捕获组时空串残余 | `offerSeries.ts:24-28,63-65` | `re:Watch GT` + `WATCH GT {n}` 产出 `"WATCH GT "` 尾随空格进分组键；导入只验正则不验模板-捕获组配套 |
| P2-5 | 对标矩阵空国家码 = 死行 | `configTemplate.ts:494-495` + `configStore.ts:118` | 留空通过校验，运行时 `'' ≠ 任何真国家码` → 配了竞品完全无效果且无提示 |
| P2-6 | 分档阶梯允许小数价格点 | `configImportExport.ts:397` + `offerSeries.ts:95-102` | `200.5` 产出码 `<200.5`，下游 `^(\d+)` 正则全失配 → 档位比较失分辨力、总览档位带塌成同带 |
| P2-7 | 导入预览文案与「零内置」语义相反 | `Config.tsx:912,918` + `lplKeys.ts:24,31` | 3237a2d 已删内置规则，文案仍说「无 → 用系统内置」——误导 GTD（另 `configTemplate.ts:522` 深浅留空默认「深」而校验允许留空，同族） |

### 图表与呈现（稳定版页面）
| # | 标题 | 位置 | 一句话机理 |
|---|---|---|---|
| P2-8 | 悬停卡周环比未跳过隔离点 ✅已复核语境 | `Chart.tsx:2627-2630,2707-2709` | `primaryPriceOf` 不过滤 quarantined，图上徽标（跳隔离点）与悬停卡（含隔离点）读数互相矛盾 |
| P2-9 | 合并单图销量万档判定窗口错位 → 可显「0万」 ✅已复核 | `VolumePrice.tsx:1030-1036` vs `:1044` | 万档按面板独立窗口判、显示值按共享窗口取——注释自己警告的「0万」失真恰会发生 |
| P2-10 | ZA 融资系列明细表配置列恒空 ✅已复核 | `TrendTables.tsx:122-127` | `specOfKey` 不剥 `__i24/__i36/__i48/__pp` 后缀，dimProduct 反查恒败（同族问题在 seriesPillMetaOf/pickChannel 已修，此处漏网） |
| P2-11 | 量轴中档刻度 Math.round 失真 | `Chart.tsx:1711-1716` | `vMax/2=7.5/1.25` 等时刻度线画真值、标签写整数（最高 25% 失真） |
| P2-12 | volumeInline 量带实际高度 ≈ 页面规划的 2/3 | `Chart.tsx:943-945` vs `VolumePrice.tsx:885-904` | 页面按压缩前总高 30% 推 volH 并压缩价格区，inline 分支忽略传入值改按压缩后 plotHeight×30% |
| P2-13 | 同图销量数字三种千分位混排 | `chartModel.ts:937`（ru-RU 空格）vs `Chart.tsx:1716/470`（en-US 逗号） | 同一根柱图上标「4 582」、轴上读「4,582」 |
| P2-14 | yPxOf 无下缘钳制 → DOM 覆盖层越出绘图区 | `helpers.ts:654-664` | Y 下限抬过数据最低点时，徽标/隔离胶囊/悬停点画到轴标签区（只有上缘防御） |
| P2-15 | Esc 全局清空图内选区，与任意输入框 Esc 冲突 | `Chart.tsx:1027-1035` | window keydown 不看 target：Y 轴输入框里按 Esc 取消编辑会连带清掉量尺选区 |

### 全局交互
| # | 标题 | 位置 | 一句话机理 |
|---|---|---|---|
| P2-16 | 预警监控浮窗：点触发器=关又立即重开+搜索被重置 ✅已复核 | `AlertsPage.tsx:1604-1619` + `:1761-1778` | capture pointerdown 先关（触发器不在 `.lpl-monitor-pop` 内），随后的 click 又让 rc-trigger 请求 open → 守卫放行 open 分支并重置 search/tier——无法用触发器关窗 |
| P2-17 | 监控浮窗 Esc 不分层 | `AlertsPage.tsx:1612-1614` | 内层档位 Select 下拉开着时一次 Esc 连下拉带整窗全关；仓库已有 `useTopEscClose`+`antdEscLayerOpen` 正典实现未接入 |

## 待核（需数据形态/产品拍板才能定罪）

1. **realSalesOf 配置维度无行 → 空 Map**（`dataModel/volume.ts:211-247`）：型号在国有销售行但该配置 cat1/cat2 一行都没有时整条序列全 null 不回落估算——是「0 在售」语义还是丢数据，需对 PSI v2 真数据核。
2. **切入 ZA 显式时间被 publishedRange 整体替换**（`FiltersContext.tsx:956-963`）：周→月 convert 分支成死代码；替换成 1 个月还是全区间，需 Eason 拍板口径。
3. **SchemeCharts 区间 ±0.12 硬编码**（`pages/pricing/SchemeCharts.tsx:296`，mock 页）：与 UNCERTAINTY_BAND 常量脱钩，改常量即文案与带宽不符。

---

## 环境坑（非运行时 BUG，推送前必办）

- **根目录 PriceLens.html 与 pricelens/dist/index.html 不同步**（10MB 中 6 字节 minified 漂移，已知坑复发）：`npm run check` 的 verify 项 53 中第 53 项挂即此。**推送前须先 `npm --prefix pricelens run build` 重建同步再 add**，否则 CI/pre-commit 拒收。
- 本轮 12:09 有他方 build 动过产物（主工作区共享），审计期间未再动 dist。

## 修复顺序建议

1. **随待推 3 笔一起修**：P1-1 / P1-2 / P1-3（都是 v3+配置表新路径，推出去就是内部系统要踩的）+ P2-7（文案与零内置语义相反，GTD 误导）。
2. **独立小修一批**：P1-4（页头搜索 scope 传参一行级）、P1-5（快照带粒度）、P2-9 / P2-10（一行级对齐修复）。
3. **批量口径对齐**：P2-1/2/3/5/6（配置表校验收紧）+ P2-8/11/13/14/15（图表口径统一）+ P2-16/17（预警浮窗守卫正典化）。
4. P2-4 / P2-12 / 待核三项按 Eason 拍板后排期。
