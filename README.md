# PriceLens · 多国多产业价格情报看板（统一版·内建 Agent）

华为 vs 竞品的价格走势、量价分析与预警订阅看板，内建 **PriceLens Agent**（自然语言查价、比价、解释预警）。数据为多国真实电渠爬取价格：国家维表 29 国（启用 24 国）× 六产业（手机/平板/穿戴/音频/PC/IoT）× 499 型号 1,121 SKU，时间 2026-W19 → 2026-W42（2026-05-06 → 10-14，共 24 周 84,841 行）。纯前端单文件交付：数据构建时内嵌（列式 gzip+base64），双击 `PriceLens.html` 即可离线打开，也可访问在线版。

**版本口径（重要）**：PriceLens 只有一个统一产品版本，Agent 已并入主应用，同一份源码、同一个站点。不维护「Copilot 版 / 非 Copilot 版」两套前端或两个站点；旧独立 Copilot 页、录制页、演示页均不是产品入口。

**在线版**：<https://eeasonn.github.io/pricelens/>（push `main` 自动构建部署，见 `.github/workflows/deploy.yml`）

**产品口径一页**：`PriceLens-产品说明.md`（v0.4 统一版，模块/数据/口径/对齐基线以此为准）

## 功能模块

- **价格走势**：多产品对比 + 多平台对比两视图；折后价 / RRP 双口径，季/月/周粒度；Y 轴纯自适应 + 断轴压缩 + 价格档位带（齿轮弹层）；促销力度热力带；时间刷选轨道；时点摘要、明细宽表与商城页取证外链
- **量价走势**：价格与周销量面板并排，量价联动分析，面板头可改取价平台
- **量价预测**：价格情景 → 历史基准需求 → 供给可售上限约束 → 下一周可售销量区间（演示模型口径，假设可追溯）
- **情报中心**：市场信号——外部事件整理成可跟进的价格线索，按发生周查看（演示数据口径）
- **预警中心**：调价、折扣、平台价差、档位间距四类规则订阅与阈值管理，预警可跳看板定位触发周
- **配置**：竞品对标矩阵、上一代关系、参考汇率、默认店铺维护
- **PriceLens Agent**：页头「问 PriceLens」或 ⌘/Ctrl+K 唤起；只读分析、结果可追溯；数值一律由本地确定性聚合引擎计算，Agent 只做叙述与编排

## 数据接入（真实数据）

```bash
cd pricelens
npm run ingest   # scripts/ingest_real.py：全量数据表.xlsx + 产品竞品矩阵/国家主要电渠/国家大促日历.txt → src/data/dim_*.json + fact_pack_gzip.b64.txt
```

- **数据再生必须跑全三步**：`ingest_real.py` → `python3 scripts/patch_comp_series.py`（系列回补）→ `python3 scripts/prefill_default_shops.py`（默认店铺预填，verify 有漂移断言）。
- 增量补录：同 29 列 xlsx 放入 `pricelens/data/real/incoming/` 后重跑；人工纠偏只改 `pricelens/data/real/overrides.json`；每次产出 `data/real/ingest_report.md` 验收单。

## 本地开发

```bash
cd pricelens
npm install
npm run dev -- --port 5174 --strictPort   # http://localhost:5174（5173 留给其他项目）

# 可选：真实方舟 Agent 服务（密钥只在服务端，不写入前端或仓库）
ARK_API_KEY="<your-ark-api-key>" npm run agent-server

npm run check    # typecheck + verify(47 项数据断言) + vitest 金测 + build(自动同步根 PriceLens.html)
```

不提交 `pricelens/.env.production` / `.env.development`（已列 `.gitignore`）：线上构建无此文件时 Agent 自动回退本地确定性适配器，页面功能完整可用；契约示例见 `pricelens/.env.example`。

## 发布对齐（每次发布照此执行）

1. 发布对象 = 应用源码 + Agent + 页面 + 样式 + 测试 + 根目录 `PriceLens.html`（build 后与 `pricelens/dist/index.html` 逐字节一致）。
2. 不提交：设计素材/视频中间产物（`design-proposals/`）、录制与演示页（`src/roadshowDemo`、`src/roadshowRecorder`，不入库）、env 文件、`.zcode/`；无关的 docs 增删不夹带进发布提交。
3. 提交经 pre-commit hook 全链（typecheck → verify → test → build；纯文档提交可 `SKIP_CHECK=1`）；推 feature 分支与 `main` 双分支，`main` 触发 Pages 部署，`gh run list` 确认 success。

## 技术栈

React 18 · TypeScript · Ant Design 5 · ECharts 5（按需注册）· Vite（`vite-plugin-singlefile` 单文件）

## 目录

- `pricelens/` —— 看板源码（React + TS，开发说明见 `pricelens/README.md`）；`src/data/` 为构建时内嵌的维度/事实数据
- `PriceLens.html` —— 构建产物单文件（每次 build 自动同步，可直接分发）
- `docs/` —— 设计与调研文档
