# PriceLens 数据建模方案——数据字典 · E-R 图 · 数据集清单

> 2026-11-19。**2026-11-20 增订**：拓展维度加 `cat3`（平板柔光屏 PaperMatte）/`cat4`（预留）——见 §4.1；**PSI 源表改 4 列口径（无 Category1/2，维度由 product 串拆解）**——§3.2。
> 配套文档：《PriceLens-数据架构方案-2026-11-18.md》（数据架构总纲）、
> 《PriceLens-部署架构方案-前后端分离-2026-11-18.md》（部署/工程侧）、
> 《底表结构与真实数据接入契约-2026-11-17.md》（源表契约）。
> 本文档是**字段级建模规格**：每个实体的中英文字段名、类型、参考值域、字段规则，
> E-R 图，以及当前真实数据集全量快照。物理实现 = 服务器 SQLite
> （`pricelens/server/data/pricelens.db`，建表语句 `server/ingest_pack.py SCHEMA`）；
> 前端 v2 数据包 `dims/factPack` 与之逐字段同构（双引擎金标
> `src/data/__tests__/engineParity.test.ts` 钉死）。

---

## 1. 建模总览

### 1.1 分层与命名

| 层 | 前缀 | 职责 | 装载时机 |
|---|---|---|---|
| ODS 源样层 | `ods_` | 源表原样落库，**零派生列**（原表有的） | 导入时整包置换 |
| MAP 匹配小表层 | `map_` | 全部「我们加的」派生内容，独立小表键挂接（**匹配小表原则**，2026-11-18 拍板） | 导入/重派生时重建 |
| DIM 维表层 | `dim_` | 渠道/时间/汇率/地区 + 业务配置型维度（档期/对标/阶梯） | 同上 |
| FACT 事实层 | `fact_` | 周×SKU×国家×渠道粒度价格事实；销量事实（逻辑表） | 同上 |
| CFG 配置层 | `cfg_` | 配置键值（物理表已建；当前服务器配置走 `data/config.json`，cfg_kv 预留） | 随配置导入 |
| META 元数据层 | `meta_` | 导入批次历史与诊断 | 每次导入追加 |

### 1.2 实体清单（17 张物理表 + 1 张逻辑表）

| # | 物理表名 | 中文名 | 粒度（一行 = ） | 当前行数 |
|---|---|---|---|---|
| 1 | `ods_offer_raw` | 街价采集原样表 | 一条采集明细 | 97,299 |
| 2 | `ods_psi_sales` | PSI 周销量原样表 | Product×维度×周期 | 0（源空） |
| 3 | `map_model` | 型号匹配表 | 一个型号 | 564 |
| 4 | `map_sku` | SKU 匹配表 | 型号×存储×颜色 | 1,263 |
| 5 | `map_spec_split` | 规格拆列匹配表 | 型号×规格原文 | 1,306 |
| 6 | `map_tier` | 档位匹配表 | 一个型号 | 564 |
| 7 | `map_alias` | 型号别名字典 | 品牌×别名 | 1 |
| 8 | `dim_channel` | 渠道维表 | 国家×平台×店铺类型 | 92 |
| 9 | `dim_time` | 时间维表（周） | 一周 | 27 |
| 10 | `dim_fx` | 汇率维表 | 币种×月 | 112 |
| 11 | `dim_region` | 地区/国家维表 | 一个国家 | 29 |
| 12 | `dim_promo` | 大促档期维表 | 国家×促销×起止 | 66 |
| 13 | `dim_benchmark` | 竞品对标矩阵 | 国家×我司型号×配置×竞品 SKU | 950 |
| 14 | `dim_tier` | 分档阶梯维表 | 全局单行（JSON） | 1 |
| 15 | `fact_price_weekly` | 周价格事实表 | 周×SKU×国家×渠道×店铺 | 95,922 |
| 16 | `fact_sales_weekly` | 周销量事实表【逻辑表，未物理化】 | 周×型号×国家×cat1×cat2 | — |
| 17 | `cfg_kv` | 配置键值表 | 一个配置键 | 0（预留） |
| 18 | `meta_import` | 导入批次元数据 | 一次导入 | 20 |

---

## 2. E-R 图

```mermaid
erDiagram
    ODS_OFFER_RAW {
        string pack_id
        int row_ix
        string period
        string brand
        string model
        string spec
    }
    ODS_PSI_SALES {
        string pack_id
        string country
        string product
        string period_id
        real qty
    }
    MAP_MODEL {
        string model_id PK
        string brand
        string model_name
        int is_own
        string series
        string industry
    }
    MAP_SKU {
        string sku_id PK
        string model_id FK
        string rom_key
        string color_key
    }
    MAP_SPEC_SPLIT {
        string model_id PK, FK
        string spec PK
        string romram
        string color
    }
    MAP_TIER {
        string model_id PK_FK
        string tier_code
        real ref_price_usd
    }
    MAP_ALIAS {
        string brand
        string from_key
        string to_key
    }
    DIM_CHANNEL {
        string channel_id PK
        string country_code FK
        string platform
        string store_type
    }
    DIM_TIME {
        string week_id PK
        string week_wed_date
        string month_id
        string quarter_id
    }
    DIM_FX {
        string currency PK
        string month_id PK
        real per_usd
    }
    DIM_REGION {
        string country_code PK
        string region_code
        string currency
        int enabled
    }
    DIM_PROMO {
        string promo_id PK
        string country_code FK
        string promo_name
        string depth_hint
    }
    DIM_BENCHMARK {
        string country_code FK
        string own_model_id FK
        string competitor_sku_id FK
        int sort
    }
    DIM_TIER {
        string ladders
        string labels
    }
    FACT_PRICE_WEEKLY {
        string week_id PK, FK
        string sku_id PK, FK
        string country_code PK, FK
        string channel_id PK, FK
        real price_local
        real price_usd
    }
    FACT_SALES_WEEKLY {
        string week_id PK, FK
        string model_id PK, FK
        string country_code PK, FK
        string cat1
        string cat2
        real qty
    }

    MAP_MODEL ||--o{ MAP_SKU : "model_id"
    MAP_MODEL ||--|| MAP_TIER : "model_id"
    MAP_MODEL ||--o{ MAP_SPEC_SPLIT : "model_id"
    MAP_ALIAS }o..|| MAP_MODEL : "to_key → 归一键（弱引用）"

    DIM_REGION ||--o{ DIM_CHANNEL : "country_code"
    DIM_REGION ||--o{ DIM_PROMO : "country_code"
    DIM_REGION ||--o{ DIM_BENCHMARK : "country_code"
    DIM_REGION ||--o{ DIM_FX : "currency"

    MAP_SKU ||--o{ FACT_PRICE_WEEKLY : "sku_id"
    DIM_TIME ||--o{ FACT_PRICE_WEEKLY : "week_id"
    DIM_CHANNEL ||--o{ FACT_PRICE_WEEKLY : "channel_id"
    DIM_REGION ||--o{ FACT_PRICE_WEEKLY : "country_code"

    MAP_MODEL ||--o{ DIM_BENCHMARK : "own_model_id"
    MAP_SKU ||--o{ DIM_BENCHMARK : "competitor_sku_id"

    DIM_TIME ||--o{ FACT_SALES_WEEKLY : "week_id"
    DIM_REGION ||--o{ FACT_SALES_WEEKLY : "country_code"
    MAP_MODEL ||--o{ FACT_SALES_WEEKLY : "model_id"

    ODS_OFFER_RAW }o..|| MAP_SPEC_SPLIT : "ETL 拆列（多源行归一拆列）"
    ODS_OFFER_RAW }o..|| FACT_PRICE_WEEKLY : "ETL 去重折叠（同键同刻保最低价）"
    ODS_PSI_SALES }o..|| FACT_SALES_WEEKLY : "ETL 归一求和"
```

**关系读法**：
- 实线 = 外键强关联（逻辑外键，SQLite 未建物理 FK 约束，完整性由引擎保证）；虚线 = 血缘/弱引用。
- `fact_price_weekly` 逻辑主键 = `(week_id, sku_id, country_code, channel_id, seller)`，去重后每键一行（同刻最低价）。
- `ods_*` 两表不与下游建关联——整包置换语义（新包导入清空重灌），血缘只到 ETL 派生方向。
- `map_alias.to_key` 指向型号**归一键**（非 model_id），在型号正名之前生效，故为弱引用。

---

## 3. 数据字典（逐表）

> 类型列 = SQLite 物理类型。值域给的是**参考值域 + 当前真实数据取值**；
> 规则列含主外键、空值语义与派生规则。金额字段 REAL，无精度约束（呈现层四舍五入）。

### 3.1 `ods_offer_raw` 街价采集原样表

粒度：一行 = 一条采集明细（源表 offers.csv 逐行）。主键：无物理主键，`(pack_id, row_ix)` 定位。
**零派生列**：值与源 CSV 完全一致；源表超出规范列的字段全部收进 `extra_json`。

| # | 字段（英文） | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `pack_id` | 导入批次号 | TEXT | `YYYYMMDD-HHMMSS` | 批次隔离键；同批导入同值 |
| 2 | `row_ix` | 行序号 | INTEGER | 0..N−1 | 源表行序，批内唯一 |
| 3 | `period` | 时间周期 | TEXT | `20261021`（日期）/ `2026043`、`202643`（周号） | 原样收；规范在 DWD 做 |
| 4 | `category` | 品类 | TEXT | 手机/平板/穿戴/音频/iot/pc（中英同收） | 必备；C3-4 字典映射 industry |
| 5 | `brand` | 品牌 | TEXT | 27 品牌（HUAWEI/Samsung/Apple/Xiaomi…） | 必备；`HUAWEI` = 我司 |
| 6 | `model` | 型号 | TEXT | 型号名原文（可含品牌词） | 必备；正名时剥前缀品牌词 |
| 7 | `spec` | 型号规格 | TEXT | `12+512 GB Black` 整串 | **不要预拆**；拆列在 map_spec_split |
| 8 | `platform` | 平台 | TEXT | DNS/OZON/Mvideo/Amazon… | 必备；别名归并（C3-2） |
| 9 | `country` | 国家/地区 | TEXT | 中/英/国家码均收（俄罗斯/Russia/RU） | 必备；归一到两位码（C3-1） |
| 10 | `store_type` | 店铺类型 | TEXT | 归一 `1P`/`3P`/`独立站` | 必备；别名映射（C3-3） |
| 11 | `shop` | 店铺名称 | TEXT | 具体卖家店铺名 | 去重键成员；空=— |
| 12 | `shop_disp` | 显示店铺名称 | TEXT | 渠道展示名 | 缺省兜底 `平台 店铺类型` |
| 13 | `rrp_local` | 平台建议零售价-本币 | REAL | > 0，本币计 | 强烈建议；缺失降级（99.6% 有值） |
| 14 | `price_local` | 平台成交价-本币 | REAL | > 0，本币计 | 必备；÷fx 折 USD |
| 15 | `currency` | 货币 | TEXT | ISO 4217（RUB/PLN/EUR/AED…22 种） | 必备 |
| 16 | `fx` | 汇率 | REAL | `1 USD = N 本币`，> 0 | 必备；倒挂行自愈（中位数校验取倒数） |
| 17 | `bundle` | 是否组合销售 | string | Y/N/TRUE/是 | 原样收；DWD 转 0/1 |
| 18 | `installment` | 分期付款 | TEXT | 分期政策原文 | 空列=权益行不出，不做虚假拆分 |
| 19 | `promo` | 促销政策 | TEXT | 促销原文（可为综合 offer 长文） | 同上；悬停可见全文 |
| 20 | `discount_display` | 平台显示折扣率 | REAL/TEXT | `-15%` / `-0.15` | 原样收；DWD 统一负小数 |
| 21 | `discount_actual` | 平台实际折扣率 | REAL/TEXT | 同上 | 同上 |
| 22 | `url` | 网址链接 | TEXT | 取证 URL | 空='' |
| 23 | `screenshot` | 截图命名 | TEXT | 取证截图文件名 | 空='' |
| 24 | `crawled_at` | 采集时间 | TEXT | datetime 原文 | 去重排序键（同键同刻保最低价） |
| 25 | `extra_json` | 原文扩展列 | TEXT | JSON 对象 | 规范列之外的源字段全量保留 |

**源侧必备性**：★ 必备（3/4/5/6/8/9/10/13/14/15/16）；○ 强烈建议（1/11/23）；其余可缺省。

### 3.2 `ods_psi_sales` PSI 周销量原样表

粒度：一行 = Product×周期。字段名固定英文（PSI 系统导出原样）。
**2026-11-20 拍板：PSI 源表 4 列，无 Category1/2——维度全部由 product 串拆解（与 offer 侧共用匹配表规则）。**

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `pack_id` | 导入批次号 | TEXT | 同上 | |
| 2 | `row_ix` | 行序号 | INTEGER | 0..N−1 | |
| 3 | `country` | 国家 | TEXT | Management Country/Region 原文 | 中英/码均收，按 cfg_dict_country 归一 |
| 4 | `product` | 产品 SKU | TEXT | **含规格串原文**（`Mate 70 Pro 12+512 GB`） | 解析失败挂 `salesProductAliases`；category1-4 与型号匹配全部由此串拆解 |
| 5 | `period_id` | 周期 | TEXT | **YYYY0WW**（`2026043`） | 兼容 YYYYWW |
| 6 | `qty` | 销量 | REAL | > 0（台） | ≤0/非法行计 skipped |

**汇总口径**：QTY 按 `(product, country, period_id)` 求和（维度由拆解补全）；同键多行自动合并；颜色等次级信息不进销量。

### 3.3 `map_model` 型号匹配表（MAP 层核心）

粒度：一行 = 一个型号。主键 `model_id`。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `model_id` | 型号 ID | TEXT | `own-huawei-pura-90s-pro` / `cmp-samsung-galaxy-s26` | PK；拼装 = `(own\|cmp)-品牌slug-型号slug` |
| 2 | `brand` | 品牌 | TEXT | 27 品牌 | 归一后品牌名 |
| 3 | `model_name` | 型号正名 | TEXT | 同 (品牌, 归一键) 最高频原文 | 剥前缀品牌词 |
| 4 | `is_own` | 我司标识 | INTEGER | 0/1 | 1 ⇔ 品牌=HUAWEI；全局我司/竞品分流 |
| 5 | `series` | 品牌系列 | TEXT | 我司 21 条规则系（Pura/Mate/nova…） | C1-1 规则派生；未命中兜底=我司首词/竞品型号名 |
| 6 | `industry` | 行业 | TEXT | phone/tablet/wearable/audio/pc/iot | 品类列经 C3-4 映射；产业页签 |

### 3.4 `map_sku` SKU 匹配表

粒度：一行 = 型号×存储×颜色。主键 `sku_id`。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `sku_id` | SKU ID | TEXT | `cmp-amazfit-active-2-round__std__sport-black` | PK；`model_id__rom_key__color_key`（键含塌缩前旧值，稳定契约） |
| 2 | `model_id` | 型号 ID | TEXT | → map_model | FK |
| 3 | `rom_key` | 存储键 | TEXT | `12-512`；无存储=`std` | slug 化；匹配键 |
| 4 | `color_key` | 颜色键 | TEXT | `black`/`sport-black`…；无颜色=`std` | slug 化；匹配键 |
| 5 | `romram` | 存储配置（展示） | TEXT | `12+512 GB` / `—` | 展示层；穿戴无存储=— |
| 6 | `color` | 颜色（展示） | TEXT | `Black`/`钛黑`… | 展示层原文 |

### 3.5 `map_spec_split` 规格拆列匹配表

粒度：一行 = 型号×规格原文。主键 `(model_id, spec)`。记录「每条规格原文拆成了什么」——
型号正名/维度键的可追溯依据。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `model_id` | 型号 ID | TEXT | → map_model | PK/FK |
| 2 | `spec` | 规格原文 | TEXT | `12+512 GB Black` | PK；源 spec 整串 |
| 3 | `romram` | 拆出存储 | TEXT | `12+512 GB` / `—` | 按品类规则拆（见下） |
| 4 | `rom_key` | 拆出存储键 | TEXT | `12-512`/`std` | |
| 5 | `color` | 拆出颜色/变体 | TEXT | `Black`/`钛黑` | |
| 6 | `color_key` | 拆出颜色键 | TEXT | `black`…/`std` | |

**拆列规则（按品类）**：phone=`数字+数字 单位 颜色`；tablet=`屏幕/联网/存储/特殊屏`（联网并入颜色）；wearable=`表盘mm 联网 材质 颜色`（同型号全局 ≥2 尺寸才升维度 1，唯一尺寸剥词不作维度）；audio=只留颜色。源表若已按 Category1/2/info 拆列（三列齐）则跳过自动拆。

### 3.6 `map_tier` 档位匹配表

粒度：一行 = 一个型号。主键 `model_id`。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `model_id` | 型号 ID | TEXT | → map_model | PK/FK |
| 2 | `tier_code` | 档位码 | TEXT | 阶梯区间：`75-150`/`150-300`/`400+`/`800-1200`… | C1-4 阶梯 × 参考价落档；无=— |
| 3 | `ref_price_usd` | 参考价 | REAL | USD，> 0 | model 级 rrp 中位数，缺则成交价中位数 |
| 4 | `tier_by_country` | 分国档位 | TEXT | JSON：`{"RU":"800+","DE":"600-800"}` | 分国中位价落档 |

### 3.7 `map_alias` 型号别名字典

粒度：一行 = 品牌×别名。无主键（小表全扫）。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `brand` | 品牌 | TEXT | 大写归一 | C1-2 导入 |
| 2 | `from_key` | 别名原文 | TEXT | 归一键匹配 | 派生时生效 |
| 3 | `to_key` | 目标型号 | TEXT | 归一键 | 弱引用 map_model |

### 3.8 `dim_channel` 渠道维表

粒度：一行 = 国家×平台×店铺类型。主键 `channel_id`。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `channel_id` | 渠道 ID | TEXT | `AE:carrefour:3P`、`RU:dns:1P` | PK；`国家:平台slug:店铺类型` |
| 2 | `country_code` | 国家码 | TEXT | 两位大写（AE/BR/DE/RU…25 国有事实） | FK → dim_region |
| 3 | `platform` | 平台 | TEXT | 归一平台名（Carrefour/DNS/OZON…） | C3-2 别名归并后 |
| 4 | `store_type` | 店铺类型 | TEXT | `1P`/`3P`/`独立站` | 三值封闭 |
| 5 | `display_name` | 渠道展示名 | TEXT | 平台原文/展示名 | 缺省 `平台 店铺类型` |
| 6 | `shops` | 店铺数 | INTEGER | ≥ 1 | 该渠道下 shop 计数 |

### 3.9 `dim_time` 时间维表（周粒度）

粒度：一行 = 一周。主键 `week_id`。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `week_id` | 周 ID | TEXT | `YYYYWW`（当前 202619–202645） | PK；ISO 周三锚 |
| 2 | `week_wed_date` | 周三锚日期 | TEXT | `YYYY-MM-DD`（2026-05-06~2026-11-04） | 日期→所在 ISO 周的周三 |
| 3 | `month_id` | 月 ID | TEXT | `YYYYMM` | 周三锚所属月（月度汇总键） |
| 4 | `quarter_id` | 季 ID | TEXT | `YYYYQn` | 真日期算季（非周号整除） |
| 5 | `week_start_date` | 周起始日 | TEXT | `YYYY-MM-DD` | 周三锚 −2 天 |

### 3.10 `dim_fx` 汇率维表

粒度：一行 = 币种×月。主键 `(currency, month_id)`。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `currency` | 币种 | TEXT | ISO 4217，22 种 | PK；关联 dim_region.currency |
| 2 | `month_id` | 月 ID | TEXT | `YYYYMM` | PK |
| 3 | `per_usd` | 兑美元汇率 | REAL | > 0；`1 USD = N 本币` | 行内汇率按 (国家×周)→币种中位数补缺 |

### 3.11 `dim_region` 地区/国家维表

粒度：一行 = 一个国家。主键 `country_code`。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `country_code` | 国家码 | TEXT | 两位大写 ISO（29 国） | PK |
| 2 | `region_code` | 区域码 | TEXT | APAC/EU/EURASIA/LATAM/MEA | 五区封闭 |
| 3 | `region_name` | 区域名 | TEXT | 亚太/欧洲/欧亚/拉美/中东非 | 展示 |
| 4 | `country_name` | 国名 | TEXT | 中文国名 | 展示 |
| 5 | `enabled` | 启用 | INTEGER | 0/1 | 筛选器可见性 |
| 6 | `sort` | 排序 | INTEGER | ≥ 0 | 国别排序 |
| 7 | `currency` | 币种 | TEXT | ISO 4217 | → dim_fx |
| 8 | `core_platforms` | 核心平台 | TEXT | JSON 数组 | 该国采集口径 |
| 9 | `default_platform` | 默认平台 | TEXT | 平台名 | 进页默认渠道 |
| 10 | `default_own_models` | 默认我司型号 | TEXT | JSON：`{"phone":"pura-90s-pro",…}` | 进页默认选品（按产业） |

### 3.12 `dim_promo` 大促档期维表

粒度：一行 = 国家×促销×起止。主键 `promo_id`。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `promo_id` | 档期 ID | TEXT | `DE-b2e65d-2026-02-11` | PK；国家-哈希-起始日 |
| 2 | `country_code` | 国家码 | TEXT | 两位大写 | FK → dim_region |
| 3 | `promo_name` | 促销名 | TEXT | 原文名 | |
| 4 | `start_date` | 起始日 | TEXT | `YYYY-MM-DD` | |
| 5 | `end_date` | 结束日 | TEXT | `YYYY-MM-DD` | > start_date |
| 6 | `depth_hint` | 促销深度 | TEXT | `浅`/`中`/`深` | 三值封闭 |
| 7 | `platforms` | 适用平台 | TEXT | JSON 数组 / null | null=全部 |
| 8 | `channel_raw` | 渠道原文 | TEXT | 源表渠道描述 | 空='' |

### 3.13 `dim_benchmark` 竞品对标矩阵

粒度：一行 = 国家×我司型号×配置×竞品 SKU。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `country_code` | 国家码 | TEXT | 两位大写 | FK → dim_region |
| 2 | `own_model_id` | 我司型号 ID | TEXT | `own-huawei-…` | FK → map_model |
| 3 | `own_romram` | 我司配置 | TEXT | `12+512 GB` / 空=全配置 | 空串=不限 |
| 4 | `competitor_sku_id` | 竞品 SKU ID | TEXT | `cmp-…__rom__color` | FK → map_sku |
| 5 | `sort` | 排序 | INTEGER | ≥ 0 | 对比区顺序 |
| 6 | `source` | 来源 | TEXT | `matrix`/`manual` | C1-3 矩阵层 / C2-1 人工层（人工按组覆盖矩阵） |
| 7 | `note` | 备注 | TEXT | 自由文本 | |

### 3.14 `dim_tier` 分档阶梯维表（全局单行）

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `ladders` | 分档阶梯 | TEXT | JSON：产业→USD 价格点升序数组（6 产业） | C1-4；逗号价格点 |
| 2 | `labels` | 档位标签 | TEXT | JSON：产业→档位码→标签 | 展示名 |

### 3.15 `fact_price_weekly` 周价格事实表（DWD 核心）

粒度：一行 = 周×SKU×国家×渠道×店铺。逻辑主键 = `(week_id, sku_id, country_code, channel_id, seller)`；
去重规则：同键同采集时间保留最低价、有价行优先。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `week_id` | 周 ID | TEXT | `YYYYWW` | FK → dim_time |
| 2 | `sku_id` | SKU ID | TEXT | → map_sku | FK |
| 3 | `country_code` | 国家码 | TEXT | 两位大写 | FK → dim_region |
| 4 | `channel_id` | 渠道 ID | TEXT | → dim_channel | FK；店铺区分保留在 seller |
| 5 | `seller` | 店铺 | TEXT | 店铺名，缺省 `—` | 逻辑键成员 |
| 6 | `rrp_local` | 建议零售价-本币 | REAL | > 0 / null | null≈0.4%（99.6% 有值） |
| 7 | `price_local` | 成交价-本币 | REAL | > 0 | 必有 |
| 8 | `fx` | 汇率 | REAL | > 0，1 USD=N 本币 | 自愈后行内汇率 |
| 9 | `rrp_usd` | 建议零售价-USD | REAL | > 0 / null | `rrp_local ÷ fx` |
| 10 | `price_usd` | 成交价-USD | REAL | > 0 | `price_local ÷ fx` |
| 11 | `discount_display` | 显示折扣率 | REAL | −1~0 负小数 | DWD 统一（源 `-15%`/`-0.15`） |
| 12 | `discount_actual` | 实际折扣率 | REAL | −1~0 负小数 | 同上 |
| 13 | `bundle` | 组合销售 | INTEGER | 0/1 | 源 Y/N/TRUE/是 → 1 |
| 14 | `installment` | 分期政策 | TEXT | 原文 / null | null=无行 |
| 15 | `promo_text` | 促销原文 | TEXT | 原文 / null | 同上 |
| 16 | `url` | 取证链接 | TEXT | URL / '' | |
| 17 | `screenshot` | 取证截图 | TEXT | 文件名 / '' | |
| 18 | `crawled_at` | 采集时间 | TEXT | datetime 原文 | 去重排序键 |
| 19 | `crawl_status` | 采集状态 | TEXT | `ok` | 预留位，当前恒 ok |

**折算与剔除规则**：`usd = local ÷ fx`；单位错位修正（价 >8× 同型号中位且 ÷100 落 0.5–2× → ÷100，对称低侧）；
`price_usd > 20,000` 行剔除（脏数据护栏）。

### 3.16 `fact_sales_weekly` 周销量事实表【逻辑表】

> 前端由 v2 包 `sales[]` PSI 归一产出；服务器库当前未物理化（sales 源空），
> IT 数仓落地照此建表。

| # | 字段 | 中文名 | 类型 | 参考值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `week_id` | 周 ID | TEXT | `YYYYWW` | FK → dim_time |
| 2 | `country_code` | 国家码 | TEXT | 两位大写 | FK → dim_region |
| 3 | `model_id` | 型号 ID | TEXT | → map_model | FK；join 键=型号级 |
| 4 | `cat1` | 维度 1 | TEXT | 存储（phone/tablet）/表盘（wearable）/null | join 键 |
| 5 | `cat2` | 维度 2 | TEXT | 屏幕（tablet）/null | join 键 |
| 6 | `qty` | 销量 | REAL | ≥ 0（台） | 同键多行求和 |

**口径规则**：型号×国家存在任何销量行 → 该型号该国整模型走真实销量（同维度不同 info 共享同一销量，不摊分）；无销量行回落估算，两口径不混。

### 3.17 `cfg_kv` 配置键值表

| # | 字段 | 中文名 | 类型 | 值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `key` | 配置键 | TEXT | C1/C2/C3 配置族键名 | PK |
| 2 | `json` | 配置值 | TEXT | JSON（结构随键族） | 当前配置走 `data/config.json`，本表预留物理化位 |

### 3.18 `meta_import` 导入批次元数据

粒度：一行 = 一次导入。主键 `id`。

| # | 字段 | 中文名 | 类型 | 值域 | 规则 |
|---|---|---|---|---|---|
| 1 | `id` | 批次号 | TEXT | `YYYYMMDD-HHMMSS` | PK；= pack_id |
| 2 | `ts` | 时间戳 | TEXT | `YYYY-MM-DDTHH:MM:SS` | 本机时刻 |
| 3 | `kind` | 导入类型 | TEXT | `v3-offers` / `v1v2-pack` / `pack` | 通道标记 |
| 4 | `rows_in` | 入库行数 | INTEGER | ≥ 0 | 源表行数 |
| 5 | `rows_out` | 派生事实行数 | INTEGER | ≥ 0 | 去重后事实行数 |
| 6 | `diag_json` | 诊断 | TEXT | JSON（剔除/修复明细） | 导入自检三件套数据源 |

---

## 4. 全局键与 ID 拼装规则（跨表契约）

### 4.1 拓展维度字段契约（cat1–cat4，2026-11-20 增订 cat3/cat4）

| 字段 | 中文名 | 值域 | 状态 |
|---|---|---|---|
| `cat1` | 维度 1 | phone/tablet=存储规范形；wearable=表盘（≥2 尺寸型号）；audio=null | 已实现（PSI join 键） |
| `cat2` | 维度 2 | tablet=屏幕（`11.5"`）；其余 null | 已实现（PSI join 键） |
| `cat3` | 维度 3 · 柔光屏 | `PaperMatte` / 空（标准版或非平板）——平板是否柔光版；DWD 从规格原文特殊屏词派生（当前并入 color 变体，落地时剥离）；PSI 源暂无对应列，join 预留 | **建模预留**（2026-11-20 拍板，引擎未落地） |
| `cat4` | 维度 4 · 预留 | 恒空——未来新匹配维度占位，建表即含列避免后补迁移 | 建模预留 |

IT 建表指引：产品维表（dim_product 形态）预置 `cat3 TEXT NULL / cat4 TEXT NULL` 两列；
销量事实表（fact_sales_weekly 形态）暂不加（PSI 无源列），PSI 侧未来出对应列时随 join 键扩展。

| 键 | 格式 | 示例 | 稳定性契约 |
|---|---|---|---|
| `model_id` | `(own\|cmp)-品牌slug-型号slug` | `own-huawei-pura-90s-pro` | own/cmp 前缀由 is_own 定 |
| `sku_id` | `model_id__rom_key__color_key` | `cmp-amazfit-active-2-round__std__sport-black` | 键含塌缩前旧值（维度退化不改键） |
| `channel_id` | `国家码:平台slug:店铺类型` | `AE:carrefour:3P` | 店铺粒度留在 seller |
| `week_id` | `YYYYWW`（ISO 周三锚） | `202645` | 日期/周号一律锚到周三 |
| `promo_id` | `国家-短哈希-起始日` | `DE-b2e65d-2026-02-11` | 同名同起止稳定 |
| `slug` | 小写-连字符 | `pura-90s-pro` | 非字母数字→`-`，压缩连续 |

---

## 5. 当前完整数据集快照（2026-11-19）

**库**：`pricelens/server/data/pricelens.db`（104 MB，SQLite）
**源**：`server/data/offers.csv`（39.8 MB，utf-8-sig）+ `sales.csv`（空占位）+ `config.json`
**派生链**：CSV mtime 变更 → 自动重派生（约 13s 全量）→ 前端 15s 轮询自刷新

| 表 | 行数 | 覆盖说明 |
|---|---|---|
| ods_offer_raw | 97,299 | 24 列真实源表全量 |
| ods_psi_sales | 0 | PSI 源未接（接入后自动生成销量事实） |
| map_model | 564 | 我司 102 / 竞品 462 / 27 品牌 / 6 产业 |
| map_sku | 1,263 | 当前数据集全部 SKU |
| map_spec_split | 1,306 | 规格原文→拆列对账可追溯 |
| map_tier | 564 | 参考价覆盖 564/564（100%） |
| map_alias | 1 | 配置侧别名 1 条 |
| dim_channel | 92 | 25 国 × 平台 × 店铺类型 |
| dim_time | 27 | 202619–202645（周三锚 2026-05-06 ~ 2026-11-04） |
| dim_fx | 112 | 22 币种 × 月 |
| dim_region | 29 | APAC 8 / EU 9 / EURASIA 1 / LATAM 6 / MEA 5 |
| dim_promo | 66 | 大促档期 |
| dim_benchmark | 950 | 全部 source=matrix |
| dim_tier | 1 | 6 产业阶梯（JSON 单行） |
| fact_price_weekly | 95,922 | 25 国 / 1,263 SKU / 92 渠道；rrp_local 非空 95,498（99.6%） |
| cfg_kv | 0 | 预留物理化位（当前配置走 data/config.json） |
| meta_import | 20 | 导入历史与诊断 |

**最近导入**：`20261119-010026 v3-offers 97,299 → 95,922`。

**交付/演示数据集副本**：
- 交接包：`docs/内部交接包/02-数据包/`（演示包）+ `04-配置表/`（九页签预填配置 xlsx：系列规则 133 / 矩阵 950 / 档期 66 / 阶梯 6 产业 / 字典 57+13+6+16）
- 底表样例：`docs/底表样例/`
- 配置唯一源：`server/data/config.json`（与前端「导入配置」双写同步）

---

## 6. IT 落地注意

1. **整包置换语义**：每次导入清空全部业务表重灌（无增量 upsert），meta_import 留痕；批次隔离靠 pack_id。
2. **逻辑外键**：SQLite 未建物理 FK 约束，引用完整性由双引擎（前端 `offerIngest` / 服务器 `ingest_pack.py`，逐字对等金标）保证；迁正式数仓时建议物理化 FK。
3. **ODS 与 MAP 不可混**：源表加列需求一律进 `map_*`/`extra_json`，不动 ods_*（匹配小表原则）。
4. **销量侧**：sales 源接入后 `fact_sales_weekly` 按第 3.16 节物理化即可，join 键与口径已定义。
5. **配置面**：C1 规则改动需「重新派生」；C2 读时生效；C3 字典空表=出厂默认（与业务规则空表=无规则的语义不同）。
