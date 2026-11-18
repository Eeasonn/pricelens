# PriceLens 部署架构方案（前后端分离 · 本机 Python 服务器）

> 2026-11-18。Eason 拍板：117MB 级全量数据包在浏览器单文件模式下导入失败
> （内存天花板）——工程上前后端分离，以更合理的方式承载数据；**Windows 上起
> 本机服务器而不是单 HTML**；技术走 **Python + SQLite 简单路线**（pandas/
> dataframe 生态、方便部署）；所有原表新增内容以**独立匹配小表**存在（降低
> 理解成本）。配套：《PriceLens-数据架构方案-2026-11-18》（数据侧总纲）、
> 《内部系统数据准备要求》（数据包契约）。

---

## 0. 问题与决策

| 项 | 单文件模式（旧主力） | 服务器模式（新主力） |
|---|---|---|
| 数据承载 | 浏览器 IndexedDB（structured clone） | 本机进程内存 + SQLite 文件 |
| 全量包上限 | ~30-50MB JSON（五份全量内存拷贝：file.text → JSON.parse 对象树 → IngestRow+factRows → encode stringify → IDB clone，117MB 必崩） | 无实质上限（Python 64 位堆；22,225 行 2.4s、117MB 级预估 ~10-60s） |
| 前端收到的 | 整包原样 JSON | gzip 编码 v2 包（117MB → 约 10-20MB） |
| 部署形态 | 双击 PriceLens.html | 双击 `启动PriceLens.bat` → 浏览器 localhost:8321 |
| 依赖 | 无 | Python 3.10+（**纯标准库，零第三方依赖**） |

**双模式并存**：服务器没启动时前端自动回落单文件模式（同一套前端，探测
`/api/ping` 2.5s 超时）——外网演示/无 Python 环境仍可双击 `web/index.html`。

## 1. 拓扑

```
内部 Windows 机
└─ PriceLens-Server-<日期>/
   ├─ 启动PriceLens.bat        chcp 65001 + python -X utf8 server.py + 自动开浏览器
   ├─ server.py                纯 stdlib ThreadingHTTPServer（端口 8321，PRICLENS_PORT 可改）
   ├─ ingest_pack.py           v3 JSON → 归一引擎 → SQLite + gzip v2 包
   │                              （offerIngest.ts 的 Python 逐段对等实现，纯 stdlib）
   ├─ dim_region.json          地区基座（29 国静态表，与前端 src/data 同源）
   ├─ web/                     前端静态文件（= vite dist 单文件 + public 资源）
   ├─ 配置表/                  预填配置 xlsx（九页签全量，必导）
   ├─ 安装依赖.bat + wheels/    零依赖占位（未来扩展位；--with-wheels 可预下载 win_amd64 轮子）
   └─ data/                    运行时生成：pricelens.db / config.json /
                               last-import.json（原包存档，重派生用）/ latest-pack.json
```

开发态（仓库内）：`npm run server`（pricelens/server/server.py，web 用 dist/、
数据在 server/data/）；前端 dev 下 vite proxy `/api` → 8321（`/api/agent` → 8787
精确规则在前，两服务并存）。

## 2. API 契约

| 方法与路径 | 语义 | 返回 |
|---|---|---|
| GET /api/ping | 探测（前端启动判服务模式） | {ok, service, hasPack, meta} |
| GET /api/pack | 最新 v2 编码包（no-store） | 包 JSON / 404 |
| POST /api/datapack | 导入：body = 数据包 JSON（前端 File 直接做 body 流式上传，零内存压力）；v3 走引擎派生+落库，v1/v2 透传存档 | {ok, diag, meta} / 400 |
| POST /api/rederive | 用 last-import 原包 + 当前 config 重跑（配置变更后） | 同上 |
| GET /api/config | 服务器配置（前端启动镜像同步） | config JSON |
| POST /api/config | 存配置 + 有原包时自动重派生 | {ok, rederived, diag} |
| POST /api/datapack/reset | 清服务端数据（回前端内置兜底） | {ok} |

## 3. SQLite（data/pricelens.db）——匹配小表原则

「原表有的」与「我们加的」一眼可分（Eason 2026-11-18 拍板：**不加列、独立小表**）：

| 层 | 表 | 内容 |
|---|---|---|
| ODS 原样层 | `ods_offer_raw`（22 规范列 + extra_json 全原文）、`ods_psi_sales` | 原表零派生列 |
| **匹配小表** | `map_model`（型号正名/is_own/系列）、`map_sku`（拆列→SKU）、`map_spec_split`（规格原文→拆列结果）、`map_tier`（档位/参考价）、`map_alias`（别名） | 全部「我们加的」派生内容，键挂接 |
| DIM | `dim_region/product→(map_sku 承载)/channel/time/fx/promo/benchmark/tier` | 维表 |
| DWD | `fact_price_weekly`（19 字段） | 价格事实 |
| CFG | `cfg_kv` | 配置存档 |
| META | `meta_import` | 导入历史 + 诊断 JSON |

## 4. 双引擎对齐契约

- `server/ingest_pack.py` = `src/dataModel/offerIngest.ts` 的 Python 逐段对等
  （列名归一→行清洗→型号正名→穿戴表盘升级→去重→八维表→事实编码）；
  编码段对齐 `src/data/index.ts encodeFactPackB64`（列式+五字典+gzip9+b64）。
- **配置唯一规则源**（零内置）：双端 ctx 均从 config 注入（seriesRules/
  modelAliases/tierLadders/promoRows/benchmarkMatrix + **C3 四字典**）；
  算法层维持「逐字对齐」契约，金标测试钉死（样例包 SKU/事实行/抽样值双端一致）。
- 已实测对齐锚点（raw-sample.json 22,225 行）：SKU 658、事实行 22,225、
  汇率倒挂自愈 188、穿戴表盘升维 1899、唯一尺寸剥词 685——双端一致。

## 5. 数据流

```
内部 Agent 产 v3 JSON ──POST /api/datapack──▶ ingest_pack（Python 引擎）
                                                ├─ ods_* 原样落库
                                                ├─ map_* 匹配小表 + dim_* + fact_*
                                                └─ latest-pack.json（gzip v2）
浏览器 ──启动：/api/ping 探测──▶ GET /api/pack ──▶ applyDataPack（前端只解码）
配置 xlsx ──前端解析──▶ POST /api/config ──▶ 存 cfg + 自动重派生
                       └─同时写 localStorage（读时消费点零改动；启动时镜像同步回写）
```

## 6. 部署与运维

- 装配：`npm run server:bundle`（自动 build + 拷贝；`--with-wheels` 附
  win_amd64 离线轮子；`--no-build` 复用现有 dist）。产物在仓库根
  `PriceLens-Server/PriceLens-Server-<日期>/`（未跟踪，不入库）。
- 迁移/备份：拷整个文件夹（含 data/）。
- 端口：默认 8321，`PRICLENS_PORT` 环境变量覆盖。
- Windows 中文：bat `chcp 65001` + `python -X utf8`（防 GBK 乱码）。

## 7. 演进路线（未排期）

- **P2 多用户**：服务器上移到内网共享机 + 简单口令（当前单机单用户假设）；
  配置从「个人级 localStorage 镜像」升级为服务器权威 + RBAC（对接预算拍板表
  平台基建项）。
- **P3 IT 落地**：SQLite schema 即《数据架构方案》A/B/C 分层的物理实现——
  IT 自建数仓时可按同构表迁移；`ods_*` ↔ A1/B1，`map_*` ↔ A3 拓展维度，
  `fact_*` ↔ A4/B2，`cfg_kv` ↔ C 配置面。
- 导入异步化（当前同步等待，全量 ~1 分钟内；>5 分钟量级再改任务队列+轮询）。
- xlsx 源表直导（当前入口 = v3 JSON；若内部只能给 xlsx，server 侧加
  pandas+openpyxl 读取层——wheels/requirements 已预留）。
