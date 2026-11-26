# PriceAgent（PriceLens 稳定版）· 内部部署教程

> 版本：2026-11-18（当晚二版：新增形态 S 本机 Python 服务器——**内部主力**）· 基于稳定版 `codex/agent-assistant-ui-refactor` 分支
> 读者：内部系统 Agent（自动化部署）与实施人员
> 目标：在内网部署一份**收窄到指定国家集合（如 9 国）**的 PriceAgent，数据通过「国家子集数据包」导入

---

## 1. 部署形态选择

| 形态 | 适用 | 载体 | 数据生效方式 |
|---|---|---|---|
| **S. 本机 Python 服务器（内部主力）** | 内部 Windows 机；**全量大数据包（117MB 级）** | `PriceLens-Server-<日期>/` 文件夹（`npm run server:bundle` 装配） | 双击 `启动PriceLens.bat` → 浏览器 localhost:8321；配置页「导入数据包」= 流式上传服务器（Python 引擎派生 + SQLite 落库） |
| **A. 单文件便携版（兜底）** | 无 Python 环境 / 外网演示 / 小数据量 | 仓库根 `PriceLens.html`（单文件，双击即用） | 目标机器配置页导入 9 国数据包（存本机 IndexedDB；≤~50MB） |
| **B. 静态托管** | 内网多人数十~上百人 | 构建产物 `pricelens/dist/` 整目录挂内网静态服务（Nginx/IIS/OSS） | 同 A，每人浏览器各导入一次；或预置 9 国包重建（见 §5 进阶） |
| **C. 开发/构建定制** | 需要开箱即 9 国（无需每人导入） | 源码构建时替换内嵌事实包（见 §5） | 构建期内嵌 9 国事实包，出厂即收窄 |

四形态共享同一源码与数据口径；S/A/B 数据通过「数据包导入」加载，C 数据在构建期内嵌。
**S 与 A 是同一套前端的两种运行方式**：服务器没启动时页面自动探测回落单文件模式。

### 形态 S：本机 Python 服务器（2026-11-18 新增，推荐内部主力）

- **为什么**：单文件模式导入全量包（117MB 级）必崩（浏览器要同时持有约 5 份全量
  内存拷贝）——数据承载上移到本机 Python 进程（64 位堆无压力，22,225 行实测 2.4s，
  117MB 级预估 10-60s），浏览器只收 gzip 编码包（约 10-20MB）。
- **零第三方依赖**：server.py 纯 Python 标准库（http.server + sqlite3），内部只需
  Python 3.10+（安装勾选 Add to PATH），无需 pip 联网。
- **装配**（开发机）：`npm run server:bundle`（自动 build + 拷贝；`--with-wheels`
  可附 win_amd64 离线轮子备未来扩展）。产物 = 仓库根 `PriceLens-Server/PriceLens-Server-<日期>/`。
- **部署**（内部机）：整个文件夹拷过去 → 双击 `启动PriceLens.bat`（chcp 65001 +
  `python -X utf8` + 自动开浏览器 `http://localhost:8321`；端口用环境变量
  `PRICLENS_PORT` 可改）。
- **数据/配置**：与形态 A 完全同一操作（配置页导入配置表 → 导入数据包）——服务器
  模式下导入自动改走 API（File 流式上传）；改配置表后点「用当前配置表重新派生」。
- **数据承载**：`data/pricelens.db`（SQLite：ODS 原样层 + map_* 匹配小表 + 维表/
  事实——「原表有的」与「我们加的」一眼可分）+ `data/config.json`。备份/迁移 =
  拷整个文件夹。
- **API 契约与架构细节**：见《PriceLens-部署架构方案-前后端分离-2026-11-18.md》。
- **已实测**：干净启动 → POST 22,225 行 v3 包 → SQLite 落库（ods 22,225 + map_sku
  658 + fact 22,225）+ latest-pack 产出全链通；双引擎金标（Python ≡ 前端）测试钉死。

## 2. 环境要求

- Node ≥ 22（仅形态 C 构建时需要；A/B 交付物是纯静态文件）
- 目标浏览器：Chrome / Edge 现代版本（Chromium 内核；应用在 `file://` 与 `http(s)://` 均可运行）
- 无后端依赖：全部数据与计算在浏览器本地完成，无外联接口

## 3. 数据准备：生成 9 国子集数据包

配套脚本：`pricelens/scripts/build_country_subset_datapack.mjs`（仓库内，需在 `pricelens/` 目录运行）

```bash
# 在 pricelens/ 目录下运行；--countries 换成实际要部署的国家集合
node scripts/build_country_subset_datapack.mjs --countries RU,PL,DE,FR,GB,IT,ES,SA,AE
# 可选：--regions-only（维表也收窄，国家选择器只显示所选国——需全链回归，默认不建议）
# 可选：--out <路径>（默认输出 docs/底表样例/pricelens-datapack-<国家集合>.json）
```

脚本行为：
1. 以当前内置维表 + 事实包为基座（`src/data/`）；
2. **事实包按国家过滤**：仅保留所选国家的渠道与价格事实行，并对渠道索引做**重映射**
   （channels 数组收窄后行的索引必须指向新数组，否则导入校验报「渠道索引越界」——脚本已处理）；
3. **月度事实按国家过滤**（不残留包外国数据）；
4. 维表（region/product/channel/time/fx/promo/benchmark/tier）默认**全量保留**（安全路径：
   国家选择器仍显示全量启用国，未包含国家显示无数据空态）；
   `--regions-only` 时维表同步收窄（选择器只显示所选国，但需全链回归后再用）；
5. 输出 `pricelens-data-pack` v2 格式 JSON（与配置页「导入数据包」完全兼容）。

**已实测**（RU,PL,DE,FR,GB,IT,ES,SA,AE）：事实行 53,344 / 96,623、渠道 40 / 94、包体积 3.1MB；
导入后 RU 图表正常渲染、未含国（如 BR）显示空态「暂无数据」、无报错无崩溃。

## 4. 部署步骤

### 形态 A：单文件便携版

1. 取仓库根 `PriceLens.html`（与 `pricelens/dist/index.html` 同源的单文件构建产物，随代码同步重建）；
2. 拷贝两个文件到目标机器：`PriceLens.html` + `pricelens-datapack-<国家集合>.json`；
3. 目标机器双击打开 `PriceLens.html`（`file://` 协议即可）；
4. 顶部「配置」→ 数据卡「**导入数据包**」→ 选择 9 国数据包 JSON；
5. 应用会自动校验、写入本机 IndexedDB 并**自动刷新**（两段式：导入持久化 → 刷新载入）；
6. 刷新后数据卡显示「数据来源：导入数据包 + 数据包生成时间/导入应用时间」即为生效。

### 形态 B：静态托管

1. `pricelens/` 下 `npm ci && npm run build`，产物 `dist/` 整目录（含 index.html 与资源）挂内网静态服务；
2. 服务需允许 `localhost`/内网域为 **secure context**（`http://内网IP` 亦可，IndexedDB 可用）；
3. 每位用户首次访问后：配置页导入 9 国数据包（同 A 第 4-6 步，持久化在各自浏览器）；
4. 数据更新：重新生成数据包 → 用户重新导入（或走 §5 出厂内嵌免导入）。

### 形态 C：构建期定制（进阶）

1. 运行 §3 脚本生成 9 国 `factPackB64`；
2. 用其替换 `pricelens/src/data/fact_pack_gzip.b64.txt`（内嵌事实包），
   并同步 `src/data/dim_channel.json`（渠道过滤后清单）与 `fact_price_monthly.json`；
3. `npm run build` → `dist/` 与根 `PriceLens.html` 重建（构建脚本自动同步单文件）；
4. 产物开箱即 9 国，无需任何导入操作。**注意**：此改动影响主仓库数据，建议在独立分支进行，
   与主线全量数据版本并存维护。

## 5. 数据包格式与校验（供内部 Agent 自动化对接）

数据包 = `pricelens-data-pack` v2 JSON：

```jsonc
{
  "kind": "pricelens-data-pack",
  "v": 2,
  "generatedAt": "ISO 时间",
  "dims": { "region": [...], "product": [...], "channel": [...], "time": [...],
            "fx": [...], "promo": [...], "benchmark": [...], "tier": {...} },
  "factPackB64": "<gzip+base64 的列式事实包>",
  "monthly": [...],           // 月度事实（运营者手册口径，ZA 现行）
  "sales": [...],             // 可选：PSI 周销量源行（缺省 = 销量回落估算口径）
  "salesProductAliases": {}   // 可选：PSI Product 原文 → 内部型号别名
}
```

导入校验（`validateFactPack` + `applyDataPack`，代码 `src/data/index.ts`）为**结构级**：
- 列长度一致、周/SKU/渠道索引不越界、汇率有限正数；
- **无国家覆盖校验**——任意国家子集均可导入（含单国）；
- 校验失败会 toast 具体原因（如「行 N 渠道索引越界」= 生成脚本未做索引重映射）。

导入成功后自动持久化（IndexedDB）并自动刷新；若浏览器拒绝持久化会明确警告「仅本次会话生效」。

## 6. 验证清单（部署后逐项确认）

- [ ] 配置页数据卡显示「数据来源：导入数据包」+ 生成/应用时间；
- [ ] counts 与预期一致（如 9 国包：事实周行 53,344 · 渠道 40 · 国家 29[维表全量模式]）；
- [ ] 所含国家（如 RU）价格走势/量价走势图表正常渲染，明细表有数；
- [ ] 未含国家（如 BR）显示空态「暂无数据，请先在上方筛选器选择产品」，无报错；
- [ ] 预警中心、监控添加、Agent 问答在所含国家上正常工作；
- [ ] `file://` 形态确认刷新后数据仍在（IndexedDB 按 origin，`file://` 亦持久化）。

## 7. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 导入 toast「事实包结构无效：渠道索引越界」 | 生成脚本未做渠道索引重映射 | 使用本仓库 `build_country_subset_datapack.mjs`（已内置重映射） |
| 导入成功但刷新后回到内置数据 | IndexedDB 持久化被拒绝（隐私模式/配额） | 按提示调整浏览器设置后重新导入；或改用形态 C 出厂内嵌 |
| 刷新后部分国家显示「暂无数据」 | 该国不在数据包国家集合（预期行为） | 确认 `--countries` 参数；补国家需重新生成并导入 |
| 点「选择主分析产品」素框后树不见 | 旧版本 bug（已于 `e692735` 修复） | 使用 `ad1e725` 之后的构建产物 |
| 预警添加监控点型号层整窗关闭 | 旧版本 bug（已于 `137d5dd`+`ad1e725` 修复） | 同上 |
| 时间面板连续改选周卡死 | 旧版本 bug（已于 `62a51f0` 修复） | 同上 |

## 8. 数据边界提醒

- 量带销量为**估算口径**（悬停可见标注）；如需 PSI 真实销量，数据包 v2 的 `sales` 段按
  `docs/底表结构与真实数据接入契约-2026-11-17.md` 结构提供即可自动切换；
- 未含国家的所有页面呈现空态/「无法计算」，**不造数、不插值**；
- 导入只替换价格/维表数据，个人配置（选品、模板、阈值）走「配置导入导出」另行搬运。

## 9. 真实数据替换 SOP（2026-11-23 后端 v2 重构后）

> 2026-11-23 起，服务器按《PriceLens 数据建模方案·深层重构 v2》重构：源文件双格式自适应
> （新英文格式权威、旧中文格式兼容）、PSI 周销量物理化（fact_sales）、配置表+补录表 xlsx
> 直接进系统。**每周替换真实数据 = 只换两个文件，其余全部不动。**

### 9.1 投递位与格式

部署目录 `data/` 下（与 server.py 同级的 data 文件夹）：

| 文件 | 权威格式（新） | 兼容格式（旧） | 说明 |
|---|---|---|---|
| `offers.csv` | **29 列英文表头**：tech_date, category, brand, model, color_size, platform, country, store_type, shop_name, shop_name_new, official_rrp_local, official_selling_price_local, official_discount_rate, platform_rrp_local, platform_selling_price_local, platform_discount_rate, platform_real_discount_rate, currency, exchange_rate, official_rrp_usd, official_selling_price_usd, platform_rrp_usd, platform_selling_price_usd, is_bundle, installment, promotion_details, URL, screenshot, collection_time | 24 列中文表头（现库格式） | 官方价族 5 列=预留字段，可不填；列序不限，表头自适应识别 |
| `sales.csv` 或 `sales.xlsx` | **7 列**：Management Region, Management Country/Region, Product, Product SKU, Period ID（周 `YYYY0WW`，如 2026045）, PSI Type（周度）, QTY | 6 列：country, product, category1, category2, periodId, qty | 二选一，xlsx 优先级同 csv；中文国名/两位码均可 |
| `config_tables.xlsx` | 四页签：匹配表(补录) / 竞品匹配表(配置) / 价格档位表(配置) / 大促档期表(配置) | —（无此文件时回退 config.json 对应段） | 《PriceLens-配置表补录表》工作簿回填后整文件替换；**存在即权威** |
| `config.json` | 配置兜底（系列规则/矩阵/阶梯/档期/字典） | — | config_tables.xlsx 缺页签时对应段生效；预置全量，通常不动 |

### 9.2 操作步骤

1. 把新一周的 `offers.csv` 与 `sales.csv`（或 `sales.xlsx`）放进/替换 `data/` 同名文件；
2. 无需任何命令——服务器检测到文件变化自动重新派生（约 10-60 秒），浏览器端 ~15 秒内自动刷新；
3. 配置有变时回填 `config_tables.xlsx` 对应页签（匹配表把 psi_only 行补上 offer 键、offer_only 行补上 PSI 键），整文件替换；
4. 验证：浏览器打开后，价格走势/量价走势出线即成功；`data/pricelens.db` 可查
   `fact_sales`（周销量物理化）与 `map_product`（匹配状态 matched/offer_only/psi_only）。

### 9.3 常见错误

| 现象 | 原因 | 处理 |
|---|---|---|
| 重派生后数据没变 | CSV 编码异常（既非 UTF-8 也非 GBK） | Excel 另存为「CSV UTF-8」 |
| sales 页面销量仍为估算 | PSI 行的国家/型号没匹配上（map_product 无该绑定） | 回填匹配表 xlsx 对应行；估算与真实不混算（型号级判定） |
| ping 返回 rebuilding:true 持续很久 | 97k 行级全量重派生正常耗时（10-60 秒） | 等待即可，前端自动拿新包 |
| 端口被占 | 已有实例在跑 | `set PRICLENS_PORT=8322` 换端口 |

### 9.4 表结构依据

- 表结构与链接关系：`docs/PriceLens-数据方案-表结构与链接关系-稳定版-2026-11-22.xlsx`
- 配置表+补录表（预填）：`docs/PriceLens-配置表补录表-预填-2026-11-22.xlsx`（bundle 内置同款
  于 `data/config_tables.xlsx`）
- 建模论证与拍板：`docs/PriceLens-数据建模方案-深层重构-2026-11-22.md`
