# 后端 v2 数据模型重构 · 全量 BUG 审查报告

> 2026-11-23。审查对象 = 2026-11-23 后端 v2 重构（`ingest_pack.py` / `xlsx_reader.py` / `server.py` / `build_server_bundle.mjs`）。
> 方法：①函数级边界用例脚本（空 sales / 缺列 / 坏值 / 裸码 / 双格式表头 / xlsx 全空行 / 日期序列号 / 未知列）逐条打引擎；②真实数据全链复跑（旧 24 列中文 97,299 行 + 新 29 列英文 97,299 行 + PSI 新 7 列 2,736 行 + config_tables.xlsx 四页签）；③四道门禁复验。
> 结论：**发现并修复 11 项**（1 高 / 6 中 / 4 低；A9–A11 为晚间补记），低危记录 4 项（不修，附理由）；修复后四道门禁全绿。

## 1. 已修复（11 项）

| # | 级别 | 问题 | 场景 | 修复 |
|---|---|---|---|---|
| A1 | **高** | offers 行国家归一 `cc_of` 不认裸两位码——新 29 列底表 country 若投 `DE`/`SA` 直码，**整行按「未知国家」丢弃** | 新格式真实数据（ISO 码投递很常见） | 行归一改 `cc_of_loose`（字典 + 裸两位码兜底）；中文全名/英文全名行为不变 |
| A2 | 中 | `build_map_product` 不跳过 xlsx 全空行——Excel 尾部残留空行/误插行全部落入 map_product 表 | 人工回填 config_tables.xlsx | 全空行跳过守卫 |
| A3 | 中 | `fact_sales` 收录 period_id 为空的行——周期解不出的 PSI 行落成脏事实（拍板②周粒度无法定位） | PSI 导出坏行 | 空 period 行剔除，diag 新增 `psiNoPeriod` 计数 |
| A4 | 中 | 价格档位表分国去重并列时**短序列胜出**——9 国档位数不一致时（某国漏行）会选错基准阶梯 | 分国档位行维护 | tie-break 改取最长阶梯（band 多的序列更完整） |
| A5 | **中**（数据丢失类） | CSV 重派生把 `monthly` / `salesProductAliases` 置空——**上传过 ZA 小册子包后，一旦编辑任何 CSV，月度分期数据即被抹掉** | 服务模式混合数据源 | `maybe_rebuild` / `_rebuild_worker` / `/api/rederive` 三处均从 last-import.json 继承 monthly 与别名 |
| A6 | 低 | PSI 表头下划线变体 `product_sku` 不识别（只认空格版 `Product SKU`） | 手工 CSV | PSI_HEADER_MAP 增补下划线别名 |
| A7 | 低 | `ods_psi.extra_json` 恒空——PSI 源规范列外字段（如未知新列）落库时丢失 | ODS 原样层契约 | normalize_psi_rows 收集未映射键进 extra_json（pack 视图不带，仅落库） |
| A8 | 低 | 匹配表 `updated_at` 若被 Excel 转成日期序列号（如 46000）原样入库 | 人工编辑 xlsx | `excel_date_to_str` 兜底转 YYYY-MM-DD（与 promo 起止同款） |
| A9 | **中** | `fact_sales` 对 QTY ≤ 0 的行不剔除，负值直接参与求和（实测 5 + (−3) + 0 → 2）——与契约「≤0 / 非法行剔除并计数」不符，负销量会冲低真实销量 | PSI 源含 0 或负 QTY 行（冲退 / 占位行） | `derive_fact_sales` 跳过 QTY ≤ 0 行，diag 新增 `psiNonPositiveQty` 计数（写交接提示词逐条核对承诺时发现） |
| A10 | 低 | `scripts/export_all_tables_csv.py` 硬编码旧 17 张表名——对 v2 库只能导出 2 张、新表全漏 | 交接用全表导出 | 表清单改为取库里实际存在的表、按 `ingest_pack.TABLES` 分层顺序排列 |
| A11 | 中 | v1 → v2 **原地升级残留旧表**：把新服务器文件覆盖到旧部署目录（保留旧 pricelens.db）时，9 张 v1 专有表（含 95,922 行过期的 fact_price_weekly）原样留在库里与新表并存——库变成 33 张表，按旧表名查询读到过期数据 | 在旧部署上升级（非全新部署） | `_sqlite_clear_and_load` 建表后 DROP 旧表（`LEGACY_TABLES`）并 VACUUM 回收空间；实测升级后恰好 24 张表、库文件 99→95MB、产出包与现网包一致 |

## 2. 低危记录（不修，附理由）

| # | 现象 | 不修理由 |
|---|---|---|
| L1 | `_psi_industry_of` 竞品平板词覆盖不全（如 Redmi Pad → phone） | PSI 首期为我司销量导出；该函数只服务 psi_only 行的辅助分类，无指标影响；真数出现竞品时再补词表 |
| L2 | xlsx 行 ID 回填同键多颜色 SKU 取首条——颜色级归属可能任意（型号级恒正确） | 颜色级归属本就属人工回填职责；回填后以人工值为准 |
| L3 | 混合表头（同时含 color_size 与 Category1/2/info）按新英文形态处理，拆列列进 extra | 结构上不该出现的组合；文档已注明格式互斥 |
| L4 | parity fixture 的 factPackB64 字节级每次运行不同（gzip 头嵌 mtime） | 测试契约明文允许（只比解码语义）；非缺陷 |

## 3. 门禁复验（修复后）

| 门禁 | 结果 |
|---|---|
| A · 旧格式零漂移 | 现 24 列中文库 97,299 行 → 95,922 事实行逐列相等 + 8 段 dims 全同 ✅ |
| B · parity 金标语义 | raw-sample 派生 vs fixture：dims/factPack/sales/aliases 语义全同（无需再重生成）✅ |
| C · 新格式端到端 | 29 列 offers + 7 列 sales + config_tables.xlsx → 事实 95,922 / fact_sales 2,723（脏行 0：period 空 0、country 空 0）/ promo 104 / tier 6 档 / benchmark 661 ✅ |
| D · 全量 check | verify 53 项 + 205 文件 2,102 测试全绿 ✅ |

## 4. 边界用例清单（审计脚本覆盖，全部通过）

空 sales；旧 6 列 sales（中文国名+裸码+qty 字符串）；非法 qty；空 period；未知列（extra_json）；xlsx 全空行；xlsx 日期序列号；xlsx 行 ID 回填；竞品反解 main_model 精确 + is_active=0 跳过；tier 两国同阶梯去重；promo 坏日期；旧中文表头（穿戴+店铺别名+俄名）；缺必备列报错文案；xlsx_reader 读真实模板 7,735 行。

## 5. 遗留待办（数据侧，非 BUG）

1. **竞品匹配表建议加 `main_model` 列**：维度组只有 series 粒度时反解歧义 638/950（引擎已支持该列，填了即精确）——Eason 回填 xlsx 时采纳。
2. 匹配表预配对颜色键未参与（948 启发式命中只落 273 行）——人工回填 psi_only/offer_only 行即消化。
3. AUDIT 后同步：审计修复未触前端（四取数口契约与金标钉住）；`agent-server.mjs` 不在本次范围。

## 6. 映射验证中发现（2026-11-23 晚，前端侧，未修）

> 做《指标映射方案-事实到指标与指标到前端》时，用 SQL 在真实库上复算前端数值，暴露两处前端口径问题。
> 属稳定版行为变更，未动代码，留 Eason 拍板（对应映射方案「待拍板」Q13 / Q14）。

| # | 位置 | 现象 | 证据 | 建议 |
|---|---|---|---|---|
| F1 | 宽表「近4周环比」——`chart/PriceTrend/tableModel.ts` `recentFourWeekChange` | 用**取整到整数**的周价计算（`buildSeries` 输出的 `SeriesPoint.price` 已 `Math.round`），舍入边界处差 0.1 个点 | RU · DNS 独立站 · 窗口末周 202645：Samsung S26 Ultra 12+256 未取整 = −7.1475%（应显示 −7.1%），前端显示 −7.2%；Pura 90s Pro Max、iPhone 17 Pro 两品不受影响 | 比率计算用未取整值（`alerts.ts` 的调价预警已是此口径，代码注释亦明写）；需让宽表拿到未取整的周价序列 |
| F2 | 竞品价差百分比 | 两处分母不同：宽表 =（对比品 − 主品）÷ **主品**（`diffModel.ts`「(行−列)/列」）；Agent 价格优势卡 =（竞品 − 我司）÷ **竞品**（`priceAdvantage.ts`） | 同一对产品两个百分比：Pura 992 vs iPhone 1501，宽表 +51.3%，按 Agent 口径是 +33.9% | 不是谁错，是两个口径并存且未说明；定义竞品价差指标时必须指定分母，界面文案区分 |

**已知边界（未修，属前端范围）**：单文件兜底版的内置引擎（`src/dataModel/ingestText.ts` 别名表）不认英文 29 列表头——新格式数据只能走服务器派生；已在交接提示词与 README 写明。补齐需前后端两套引擎别名同步并重生成 parity fixture。

**已验证无误的部分**（同一轮验证）：按映射 SQL（渠道收敛 + 颜色平均）复算 RU · Pura 90s Pro Max 12+256 · DNS 独立站的周折后价，202639–202645 = 992 / 1012 / 1030 / 1021 /（202643 无采）/ 1096 / 1074，与前端主图及宽表逐周一致；近4周环比 Pura +5.2%、iPhone +1.7% 与前端一致。
