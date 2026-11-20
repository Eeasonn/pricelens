#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成《PriceLens-数据建模方案-数据字典与ER图》Excel 版。

数据源 = 本脚本内结构化定义，与同名 .md 文档（docs/PriceLens-数据建模方案-
数据字典与ER图-2026-11-19.md）逐字段一致；改字段先改 md 再同步此处。
用法：python3 scripts/build_model_dict_xlsx.py <输出.xlsx>（缺省输出到 docs/）。
"""
import sys
import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties

TITLE_FONT = Font(name="微软雅黑", size=13, bold=True, color="FFFFFF")
TITLE_FILL = PatternFill("solid", fgColor="1F3864")
HEAD_FONT = Font(name="微软雅黑", size=10, bold=True)
HEAD_FILL = PatternFill("solid", fgColor="D9E2F1")
BODY_FONT = Font(name="微软雅黑", size=10)
MONO_FONT = Font(name="Consolas", size=9)
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
TOPWRAP = Alignment(vertical="top", wrap_text=True)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)

# ================================================================ 数据定义

F = []  # 字典行：(表名, #, 字段, 中文名, 类型, 值域, 规则)

F += [
    ("ods_offer_raw", 1, "pack_id", "导入批次号", "TEXT", "YYYYMMDD-HHMMSS", "批次隔离键；同批导入同值"),
    ("ods_offer_raw", 2, "row_ix", "行序号", "INTEGER", "0..N−1", "源表行序，批内唯一"),
    ("ods_offer_raw", 3, "period", "时间周期", "TEXT", "20261021（日期）/ 2026043、202643（周号）", "原样收；规范在 DWD 做"),
    ("ods_offer_raw", 4, "category", "品类", "TEXT", "手机/平板/穿戴/音频/iot/pc（中英同收）", "必备；C3-4 字典映射 industry"),
    ("ods_offer_raw", 5, "brand", "品牌", "TEXT", "27 品牌（HUAWEI/Samsung/Apple/Xiaomi…）", "必备；HUAWEI = 我司"),
    ("ods_offer_raw", 6, "model", "型号", "TEXT", "型号名原文（可含品牌词）", "必备；正名时剥前缀品牌词"),
    ("ods_offer_raw", 7, "spec", "型号规格", "TEXT", "12+512 GB Black 整串", "不要预拆；拆列在 map_spec_split"),
    ("ods_offer_raw", 8, "platform", "平台", "TEXT", "DNS/OZON/Mvideo/Amazon…", "必备；别名归并（C3-2）"),
    ("ods_offer_raw", 9, "country", "国家/地区", "TEXT", "中/英/国家码均收（俄罗斯/Russia/RU）", "必备；归一到两位大写码（C3-1）"),
    ("ods_offer_raw", 10, "store_type", "店铺类型", "TEXT", "1P / 3P / 独立站", "必备；别名映射（C3-3）"),
    ("ods_offer_raw", 11, "shop", "店铺名称", "TEXT", "具体卖家店铺名", "去重键成员；空=—"),
    ("ods_offer_raw", 12, "shop_disp", "显示店铺名称", "TEXT", "渠道展示名", "缺省兜底「平台 店铺类型」"),
    ("ods_offer_raw", 13, "rrp_local", "平台建议零售价-本币", "REAL", "> 0，本币计", "强烈建议；缺失降级（99.6% 有值）"),
    ("ods_offer_raw", 14, "price_local", "平台成交价-本币", "REAL", "> 0，本币计", "必备；÷fx 折 USD"),
    ("ods_offer_raw", 15, "currency", "货币", "TEXT", "ISO 4217（RUB/PLN/EUR/AED…22 种）", "必备"),
    ("ods_offer_raw", 16, "fx", "汇率", "REAL", "1 USD = N 本币，> 0", "必备；倒挂行自愈（中位数校验取倒数）"),
    ("ods_offer_raw", 17, "bundle", "是否组合销售", "TEXT", "Y / N / TRUE / 是", "原样收；DWD 转 0/1"),
    ("ods_offer_raw", 18, "installment", "分期付款", "TEXT", "分期政策原文", "空列=权益行不出，不做虚假拆分"),
    ("ods_offer_raw", 19, "promo", "促销政策", "TEXT", "促销原文（可为综合 offer 长文）", "同上；悬停可见全文"),
    ("ods_offer_raw", 20, "discount_display", "平台显示折扣率", "REAL/TEXT", "-15% / -0.15", "原样收；DWD 统一负小数"),
    ("ods_offer_raw", 21, "discount_actual", "平台实际折扣率", "REAL/TEXT", "-15% / -0.15", "同上"),
    ("ods_offer_raw", 22, "url", "网址链接", "TEXT", "取证 URL", "空=''"),
    ("ods_offer_raw", 23, "screenshot", "截图命名", "TEXT", "取证截图文件名", "空=''"),
    ("ods_offer_raw", 24, "crawled_at", "采集时间", "TEXT", "datetime 原文", "去重排序键（同键同刻保最低价）"),
    ("ods_offer_raw", 25, "extra_json", "原文扩展列", "TEXT", "JSON 对象", "规范列之外的源字段全量保留"),
    ("ods_psi_sales", 1, "pack_id", "导入批次号", "TEXT", "YYYYMMDD-HHMMSS", ""),
    ("ods_psi_sales", 2, "row_ix", "行序号", "INTEGER", "0..N−1", ""),
    ("ods_psi_sales", 3, "country", "国家", "TEXT", "Management Country/Region 原文", "中英/码均收"),
    ("ods_psi_sales", 4, "product", "产品型号", "TEXT", "Product 列原文", "解析失败挂 salesProductAliases"),
    ("ods_psi_sales", 5, "category1", "维度 1", "TEXT", "手机/平板=存储、穿戴=表盘、音频=null", "join 键成分"),
    ("ods_psi_sales", 6, "category2", "维度 2", "TEXT", "平板=屏幕英寸、其余 null", "join 键成分"),
    ("ods_psi_sales", 7, "period_id", "周期", "TEXT", "YYYY0WW（2026043）", "兼容 YYYYWW"),
    ("ods_psi_sales", 8, "qty", "销量", "REAL", "> 0（台）", "≤0/非法行计 skipped；同键多行求和"),
]

F += [
    ("map_model", 1, "model_id", "型号 ID", "TEXT", "own-huawei-pura-90s-pro / cmp-samsung-galaxy-s26", "PK；拼装 = (own|cmp)-品牌slug-型号slug"),
    ("map_model", 2, "brand", "品牌", "TEXT", "27 品牌", "归一后品牌名"),
    ("map_model", 3, "model_name", "型号正名", "TEXT", "同 (品牌, 归一键) 最高频原文", "剥前缀品牌词"),
    ("map_model", 4, "is_own", "我司标识", "INTEGER", "0 / 1", "1 ⇔ 品牌=HUAWEI；全局我司/竞品分流"),
    ("map_model", 5, "series", "品牌系列", "TEXT", "我司 21 条规则系（Pura/Mate/nova…）", "C1-1 规则派生；未命中兜底=我司首词/竞品型号名"),
    ("map_model", 6, "industry", "行业", "TEXT", "phone/tablet/wearable/audio/pc/iot", "品类列经 C3-4 映射；产业页签"),
    ("map_sku", 1, "sku_id", "SKU ID", "TEXT", "cmp-amazfit-active-2-round__std__sport-black", "PK；model_id__rom_key__color_key（键含塌缩前旧值，稳定契约）"),
    ("map_sku", 2, "model_id", "型号 ID", "TEXT", "→ map_model", "FK"),
    ("map_sku", 3, "rom_key", "存储键", "TEXT", "12-512；无存储=std", "slug 化；匹配键"),
    ("map_sku", 4, "color_key", "颜色键", "TEXT", "black / sport-black…；无颜色=std", "slug 化；匹配键"),
    ("map_sku", 5, "romram", "存储配置（展示）", "TEXT", "12+512 GB / —", "展示层；穿戴无存储=—"),
    ("map_sku", 6, "color", "颜色（展示）", "TEXT", "Black / 钛黑…", "展示层原文"),
    ("map_spec_split", 1, "model_id", "型号 ID", "TEXT", "→ map_model", "PK/FK"),
    ("map_spec_split", 2, "spec", "规格原文", "TEXT", "12+512 GB Black", "PK；源 spec 整串"),
    ("map_spec_split", 3, "romram", "拆出存储", "TEXT", "12+512 GB / —", "按品类规则拆（见 07 全局规则）"),
    ("map_spec_split", 4, "rom_key", "拆出存储键", "TEXT", "12-512 / std", ""),
    ("map_spec_split", 5, "color", "拆出颜色/变体", "TEXT", "Black / 钛黑", ""),
    ("map_spec_split", 6, "color_key", "拆出颜色键", "TEXT", "black… / std", ""),
    ("map_tier", 1, "model_id", "型号 ID", "TEXT", "→ map_model", "PK/FK"),
    ("map_tier", 2, "tier_code", "档位码", "TEXT", "阶梯区间：75-150 / 150-300 / 400+ / 800-1200…", "C1-4 阶梯 × 参考价落档；无=—"),
    ("map_tier", 3, "ref_price_usd", "参考价", "REAL", "USD，> 0", "model 级 rrp 中位数，缺则成交价中位数"),
    ("map_tier", 4, "tier_by_country", "分国档位", "TEXT", "JSON：{\"RU\":\"800+\",\"DE\":\"600-800\"}", "分国中位价落档"),
    ("map_alias", 1, "brand", "品牌", "TEXT", "大写归一", "C1-2 导入"),
    ("map_alias", 2, "from_key", "别名原文", "TEXT", "归一键匹配", "派生时生效"),
    ("map_alias", 3, "to_key", "目标型号", "TEXT", "归一键", "弱引用 map_model"),
]

F += [
    ("dim_channel", 1, "channel_id", "渠道 ID", "TEXT", "AE:carrefour:3P、RU:dns:1P", "PK；国家:平台slug:店铺类型"),
    ("dim_channel", 2, "country_code", "国家码", "TEXT", "两位大写（25 国有事实）", "FK → dim_region"),
    ("dim_channel", 3, "platform", "平台", "TEXT", "归一平台名（Carrefour/DNS/OZON…）", "C3-2 别名归并后"),
    ("dim_channel", 4, "store_type", "店铺类型", "TEXT", "1P / 3P / 独立站", "三值封闭"),
    ("dim_channel", 5, "display_name", "渠道展示名", "TEXT", "平台原文/展示名", "缺省「平台 店铺类型」"),
    ("dim_channel", 6, "shops", "店铺数", "INTEGER", "≥ 1", "该渠道下 shop 计数"),
    ("dim_time", 1, "week_id", "周 ID", "TEXT", "YYYYWW（当前 202619–202645）", "PK；ISO 周三锚"),
    ("dim_time", 2, "week_wed_date", "周三锚日期", "TEXT", "YYYY-MM-DD（2026-05-06~2026-11-04）", "日期→所在 ISO 周的周三"),
    ("dim_time", 3, "month_id", "月 ID", "TEXT", "YYYYMM", "周三锚所属月（月度汇总键）"),
    ("dim_time", 4, "quarter_id", "季 ID", "TEXT", "YYYYQn", "真日期算季（非周号整除）"),
    ("dim_time", 5, "week_start_date", "周起始日", "TEXT", "YYYY-MM-DD", "周三锚 −2 天"),
    ("dim_fx", 1, "currency", "币种", "TEXT", "ISO 4217，22 种", "PK；关联 dim_region.currency"),
    ("dim_fx", 2, "month_id", "月 ID", "TEXT", "YYYYMM", "PK"),
    ("dim_fx", 3, "per_usd", "兑美元汇率", "REAL", "> 0；1 USD = N 本币", "行内汇率按 (国家×周)→币种中位数补缺"),
    ("dim_region", 1, "country_code", "国家码", "TEXT", "两位大写 ISO（29 国）", "PK"),
    ("dim_region", 2, "region_code", "区域码", "TEXT", "APAC / EU / EURASIA / LATAM / MEA", "五区封闭"),
    ("dim_region", 3, "region_name", "区域名", "TEXT", "亚太/欧洲/欧亚/拉美/中东非", "展示"),
    ("dim_region", 4, "country_name", "国名", "TEXT", "中文国名", "展示"),
    ("dim_region", 5, "enabled", "启用", "INTEGER", "0 / 1", "筛选器可见性"),
    ("dim_region", 6, "sort", "排序", "INTEGER", "≥ 0", "国别排序"),
    ("dim_region", 7, "currency", "币种", "TEXT", "ISO 4217", "→ dim_fx"),
    ("dim_region", 8, "core_platforms", "核心平台", "TEXT", "JSON 数组", "该国采集口径"),
    ("dim_region", 9, "default_platform", "默认平台", "TEXT", "平台名", "进页默认渠道"),
    ("dim_region", 10, "default_own_models", "默认我司型号", "TEXT", "JSON：{\"phone\":\"pura-90s-pro\",…}", "进页默认选品（按产业）"),
    ("dim_promo", 1, "promo_id", "档期 ID", "TEXT", "DE-b2e65d-2026-02-11", "PK；国家-哈希-起始日；同名同起止稳定"),
    ("dim_promo", 2, "country_code", "国家码", "TEXT", "两位大写", "FK → dim_region"),
    ("dim_promo", 3, "promo_name", "促销名", "TEXT", "原文名", ""),
    ("dim_promo", 4, "start_date", "起始日", "TEXT", "YYYY-MM-DD", ""),
    ("dim_promo", 5, "end_date", "结束日", "TEXT", "YYYY-MM-DD", "> start_date"),
    ("dim_promo", 6, "depth_hint", "促销深度", "TEXT", "浅 / 中 / 深", "三值封闭"),
    ("dim_promo", 7, "platforms", "适用平台", "TEXT", "JSON 数组 / null", "null=全部"),
    ("dim_promo", 8, "channel_raw", "渠道原文", "TEXT", "源表渠道描述", "空=''"),
    ("dim_benchmark", 1, "country_code", "国家码", "TEXT", "两位大写", "FK → dim_region"),
    ("dim_benchmark", 2, "own_model_id", "我司型号 ID", "TEXT", "own-huawei-…", "FK → map_model"),
    ("dim_benchmark", 3, "own_romram", "我司配置", "TEXT", "12+512 GB / 空=全配置", "空串=不限"),
    ("dim_benchmark", 4, "competitor_sku_id", "竞品 SKU ID", "TEXT", "cmp-…__rom__color", "FK → map_sku"),
    ("dim_benchmark", 5, "sort", "排序", "INTEGER", "≥ 0", "对比区顺序"),
    ("dim_benchmark", 6, "source", "来源", "TEXT", "matrix / manual", "C1-3 矩阵层 / C2-1 人工层（人工按组覆盖矩阵）"),
    ("dim_benchmark", 7, "note", "备注", "TEXT", "自由文本", ""),
    ("dim_tier", 1, "ladders", "分档阶梯", "TEXT", "JSON：产业→USD 价格点升序数组（6 产业）", "C1-4；逗号价格点"),
    ("dim_tier", 2, "labels", "档位标签", "TEXT", "JSON：产业→档位码→标签", "展示名"),
]

F += [
    ("fact_price_weekly", 1, "week_id", "周 ID", "TEXT", "YYYYWW", "PK 成分；FK → dim_time"),
    ("fact_price_weekly", 2, "sku_id", "SKU ID", "TEXT", "→ map_sku", "PK 成分；FK"),
    ("fact_price_weekly", 3, "country_code", "国家码", "TEXT", "两位大写", "PK 成分；FK → dim_region"),
    ("fact_price_weekly", 4, "channel_id", "渠道 ID", "TEXT", "→ dim_channel", "PK 成分；FK；店铺区分保留在 seller"),
    ("fact_price_weekly", 5, "seller", "店铺", "TEXT", "店铺名，缺省 —", "逻辑键成员"),
    ("fact_price_weekly", 6, "rrp_local", "建议零售价-本币", "REAL", "> 0 / null", "null≈0.4%（99.6% 有值）"),
    ("fact_price_weekly", 7, "price_local", "成交价-本币", "REAL", "> 0", "必有"),
    ("fact_price_weekly", 8, "fx", "汇率", "REAL", "> 0，1 USD=N 本币", "自愈后行内汇率"),
    ("fact_price_weekly", 9, "rrp_usd", "建议零售价-USD", "REAL", "> 0 / null", "rrp_local ÷ fx"),
    ("fact_price_weekly", 10, "price_usd", "成交价-USD", "REAL", "> 0", "price_local ÷ fx"),
    ("fact_price_weekly", 11, "discount_display", "显示折扣率", "REAL", "−1~0 负小数", "DWD 统一（源 -15% / -0.15）"),
    ("fact_price_weekly", 12, "discount_actual", "实际折扣率", "REAL", "−1~0 负小数", "同上"),
    ("fact_price_weekly", 13, "bundle", "组合销售", "INTEGER", "0 / 1", "源 Y/N/TRUE/是 → 1"),
    ("fact_price_weekly", 14, "installment", "分期政策", "TEXT", "原文 / null", "null=无行"),
    ("fact_price_weekly", 15, "promo_text", "促销原文", "TEXT", "原文 / null", "同上"),
    ("fact_price_weekly", 16, "url", "取证链接", "TEXT", "URL / ''", ""),
    ("fact_price_weekly", 17, "screenshot", "取证截图", "TEXT", "文件名 / ''", ""),
    ("fact_price_weekly", 18, "crawled_at", "采集时间", "TEXT", "datetime 原文", "去重排序键"),
    ("fact_price_weekly", 19, "crawl_status", "采集状态", "TEXT", "ok", "预留位，当前恒 ok"),
    ("fact_sales_weekly【逻辑表】", 1, "week_id", "周 ID", "TEXT", "YYYYWW", "FK → dim_time"),
    ("fact_sales_weekly【逻辑表】", 2, "country_code", "国家码", "TEXT", "两位大写", "FK → dim_region"),
    ("fact_sales_weekly【逻辑表】", 3, "model_id", "型号 ID", "TEXT", "→ map_model", "FK；join 键=型号级"),
    ("fact_sales_weekly【逻辑表】", 4, "cat1", "维度 1", "TEXT", "存储（phone/tablet）/表盘（wearable）/null", "join 键"),
    ("fact_sales_weekly【逻辑表】", 5, "cat2", "维度 2", "TEXT", "屏幕（tablet）/null", "join 键"),
    ("fact_sales_weekly【逻辑表】", 6, "qty", "销量", "REAL", "≥ 0（台）", "同键多行求和"),
]

F += [
    ("cfg_kv", 1, "key", "配置键", "TEXT", "C1/C2/C3 配置族键名", "PK"),
    ("cfg_kv", 2, "json", "配置值", "TEXT", "JSON（结构随键族）", "当前配置走 data/config.json，本表预留物理化位"),
    ("meta_import", 1, "id", "批次号", "TEXT", "YYYYMMDD-HHMMSS", "PK；= pack_id"),
    ("meta_import", 2, "ts", "时间戳", "TEXT", "YYYY-MM-DDTHH:MM:SS", "本机时刻"),
    ("meta_import", 3, "kind", "导入类型", "TEXT", "v3-offers / v1v2-pack / pack", "通道标记"),
    ("meta_import", 4, "rows_in", "入库行数", "INTEGER", "≥ 0", "源表行数"),
    ("meta_import", 5, "rows_out", "派生事实行数", "INTEGER", "≥ 0", "去重后事实行数"),
    ("meta_import", 6, "diag_json", "诊断", "TEXT", "JSON（剔除/修复明细）", "导入自检三件套数据源"),
]

ENTITIES = [
    ("ods_offer_raw", "街价采集原样表", "ODS", "一条采集明细", "97,299", "无（pack_id+row_ix 定位）"),
    ("ods_psi_sales", "PSI 周销量原样表", "ODS", "Product×维度×周期", "0（源空）", "无（pack_id+row_ix 定位）"),
    ("map_model", "型号匹配表", "MAP", "一个型号", "564", "model_id"),
    ("map_sku", "SKU 匹配表", "MAP", "型号×存储×颜色", "1,263", "sku_id"),
    ("map_spec_split", "规格拆列匹配表", "MAP", "型号×规格原文", "1,306", "(model_id, spec)"),
    ("map_tier", "档位匹配表", "MAP", "一个型号", "564", "model_id"),
    ("map_alias", "型号别名字典", "MAP", "品牌×别名", "1", "无（小表全扫）"),
    ("dim_channel", "渠道维表", "DIM", "国家×平台×店铺类型", "92", "channel_id"),
    ("dim_time", "时间维表（周）", "DIM", "一周", "27", "week_id"),
    ("dim_fx", "汇率维表", "DIM", "币种×月", "112", "(currency, month_id)"),
    ("dim_region", "地区/国家维表", "DIM", "一个国家", "29", "country_code"),
    ("dim_promo", "大促档期维表", "DIM", "国家×促销×起止", "66", "promo_id"),
    ("dim_benchmark", "竞品对标矩阵", "DIM", "国家×我司型号×配置×竞品 SKU", "950", "无逻辑主键"),
    ("dim_tier", "分档阶梯维表", "DIM", "全局单行（JSON）", "1", "单行"),
    ("fact_price_weekly", "周价格事实表", "FACT", "周×SKU×国家×渠道×店铺", "95,922", "(week,sku,country,channel,seller)"),
    ("fact_sales_weekly", "周销量事实表【逻辑，未物理化】", "FACT", "周×型号×国家×cat1×cat2", "—", "(week,model,country,cat1,cat2)"),
    ("cfg_kv", "配置键值表", "CFG", "一个配置键", "0（预留）", "key"),
    ("meta_import", "导入批次元数据", "META", "一次导入", "20", "id"),
]

LAYERS = [
    ("ODS 源样层", "ods_", "源表原样落库，零派生列（原表有的）", "导入时整包置换"),
    ("MAP 匹配小表层", "map_", "全部「我们加的」派生内容，独立小表键挂接（匹配小表原则）", "导入/重派生时重建"),
    ("DIM 维表层", "dim_", "渠道/时间/汇率/地区 + 业务配置型维度（档期/对标/阶梯）", "同上"),
    ("FACT 事实层", "fact_", "周×SKU×国家×渠道粒度价格事实；销量事实（逻辑表）", "同上"),
    ("CFG 配置层", "cfg_", "配置键值（当前服务器配置走 data/config.json，表预留）", "随配置导入"),
    ("META 元数据层", "meta_", "导入批次历史与诊断", "每次导入追加"),
]

REL = [
    # (实体A, 基数, 实体B, 关联字段, 类型, 说明)
    ("MAP_MODEL", "1 : N", "MAP_SKU", "model_id", "强关联", ""),
    ("MAP_MODEL", "1 : 1", "MAP_TIER", "model_id", "强关联", ""),
    ("MAP_MODEL", "1 : N", "MAP_SPEC_SPLIT", "model_id", "强关联", ""),
    ("MAP_ALIAS", "N : 1", "MAP_MODEL", "to_key → 归一键", "弱引用", "指向归一键而非 model_id，型号正名前生效"),
    ("DIM_REGION", "1 : N", "DIM_CHANNEL", "country_code", "强关联", ""),
    ("DIM_REGION", "1 : N", "DIM_PROMO", "country_code", "强关联", ""),
    ("DIM_REGION", "1 : N", "DIM_BENCHMARK", "country_code", "强关联", ""),
    ("DIM_REGION", "1 : N", "DIM_FX", "currency", "强关联", "经 dim_region.currency"),
    ("MAP_SKU", "1 : N", "FACT_PRICE_WEEKLY", "sku_id", "强关联", ""),
    ("DIM_TIME", "1 : N", "FACT_PRICE_WEEKLY", "week_id", "强关联", ""),
    ("DIM_CHANNEL", "1 : N", "FACT_PRICE_WEEKLY", "channel_id", "强关联", ""),
    ("DIM_REGION", "1 : N", "FACT_PRICE_WEEKLY", "country_code", "强关联", ""),
    ("MAP_MODEL", "1 : N", "DIM_BENCHMARK", "own_model_id", "强关联", ""),
    ("MAP_SKU", "1 : N", "DIM_BENCHMARK", "competitor_sku_id", "强关联", ""),
    ("DIM_TIME", "1 : N", "FACT_SALES_WEEKLY", "week_id", "强关联", ""),
    ("DIM_REGION", "1 : N", "FACT_SALES_WEEKLY", "country_code", "强关联", ""),
    ("MAP_MODEL", "1 : N", "FACT_SALES_WEEKLY", "model_id", "强关联", ""),
    ("ODS_OFFER_RAW", "N : 1", "MAP_SPEC_SPLIT", "(model_id, spec)", "ETL 血缘", "多源行归一拆列"),
    ("ODS_OFFER_RAW", "N : 1", "FACT_PRICE_WEEKLY", "去重键", "ETL 血缘", "同键同刻保最低价折叠"),
    ("ODS_PSI_SALES", "N : 1", "FACT_SALES_WEEKLY", "join 键", "ETL 血缘", "同键求和"),
]

KEYS = [
    ("model_id", "(own|cmp)-品牌slug-型号slug", "own-huawei-pura-90s-pro", "own/cmp 前缀由 is_own 定"),
    ("sku_id", "model_id__rom_key__color_key", "cmp-amazfit-active-2-round__std__sport-black", "键含塌缩前旧值（维度退化不改键）"),
    ("channel_id", "国家码:平台slug:店铺类型", "AE:carrefour:3P", "店铺粒度留在 seller"),
    ("week_id", "YYYYWW（ISO 周三锚）", "202645", "日期/周号一律锚到周三"),
    ("promo_id", "国家-短哈希-起始日", "DE-b2e65d-2026-02-11", "同名同起止稳定"),
    ("slug", "小写-连字符", "pura-90s-pro", "非字母数字→-，压缩连续"),
]

RULES = [
    ("拓展维度 cat3（2026-11-20 增）", "平板柔光屏：PaperMatte / 空（标准版或非平板）；DWD 从规格原文特殊屏词派生（当前并入 color 变体，落地时剥离）；PSI 源暂无对应列，join 预留——建模预留，引擎未落地"),
    ("拓展维度 cat4（2026-11-20 增）", "预留：恒空；未来新匹配维度先占位（产品维表建表即含 cat3/cat4 两列，避免后补迁移）"),
    ("去重唯一键", "周 × SKU × 国家 × 平台 × 店铺类型 × 店铺名称；同键同采集时间保留最低价、有价行优先"),
    ("USD 折算", "usd = local ÷ 行内 fx"),
    ("单位错位修正", "价 >8× 同型号中位且 ÷100 落 0.5–2× → ÷100；对称低侧"),
    ("脏数据护栏", "price_usd > 20,000 行剔除"),
    ("汇率自愈", "币种中位数自校验倒挂取倒数；(国家×周)→币种中位数补缺"),
    ("周期锚定", "日期/周号（含 YYYY0WW）→ 所在 ISO 周周三 → week_id"),
    ("规格拆列（按品类）", "phone=数字+数字 单位 颜色；tablet=屏幕/联网/存储/特殊屏（联网并入颜色）；wearable=表盘mm 联网 材质 颜色（≥2 尺寸才升维度1）；audio=只留颜色；源已按 Category1/2/info 拆列则跳过"),
    ("销量汇总口径", "QTY 按 (product, category1, category2, country, period_id) 求和；颜色不进销量；型号×国家有行=整模型真实销量，无行回落估算，不混口径"),
    ("档位与参考价", "ref_price_usd = model 级 rrp 中位数（缺则成交价中位数）；tier = C1-4 阶梯 × 参考价；tier_by_country = 分国中位价落档"),
]

SNAPSHOT = [
    ("ods_offer_raw", "97,299", "24 列真实源表全量"),
    ("ods_psi_sales", "0", "PSI 源未接（接入后自动生成销量事实）"),
    ("map_model", "564", "我司 102 / 竞品 462 / 27 品牌 / 6 产业"),
    ("map_sku", "1,263", "当前数据集全部 SKU"),
    ("map_spec_split", "1,306", "规格原文→拆列对账可追溯"),
    ("map_tier", "564", "参考价覆盖 564/564（100%）"),
    ("map_alias", "1", "配置侧别名 1 条"),
    ("dim_channel", "92", "25 国 × 平台 × 店铺类型"),
    ("dim_time", "27", "202619–202645（周三锚 2026-05-06 ~ 2026-11-04）"),
    ("dim_fx", "112", "22 币种 × 月"),
    ("dim_region", "29", "APAC 8 / EU 9 / EURASIA 1 / LATAM 6 / MEA 5"),
    ("dim_promo", "66", "大促档期"),
    ("dim_benchmark", "950", "全部 source=matrix"),
    ("dim_tier", "1", "6 产业阶梯（JSON 单行）"),
    ("fact_price_weekly", "95,922", "25 国 / 1,263 SKU / 92 渠道；rrp_local 非空 95,498（99.6%）"),
    ("cfg_kv", "0", "预留物理化位（当前配置走 data/config.json）"),
    ("meta_import", "20", "导入历史与诊断（最近：20261119-010026 v3-offers 97,299→95,922）"),
]

NOTES = [
    ("整包置换语义", "每次导入清空全部业务表重灌（无增量 upsert），meta_import 留痕；批次隔离靠 pack_id"),
    ("逻辑外键", "SQLite 未建物理 FK 约束，引用完整性由双引擎（前端 offerIngest / 服务器 ingest_pack.py，逐字对等金标）保证；迁正式数仓建议物理化 FK"),
    ("ODS 与 MAP 不可混", "源表加列需求一律进 map_* / extra_json，不动 ods_*（匹配小表原则）"),
    ("销量侧", "sales 源接入后 fact_sales_weekly 按字典物理化即可，join 键与口径已定义"),
    ("配置面", "C1 规则改动需「重新派生」；C2 读时生效；C3 字典空表=出厂默认（与业务规则空表=无规则的语义不同）"),
]

MERMAID_SRC = """erDiagram
    MAP_MODEL ||--o{ MAP_SKU : "model_id"
    MAP_MODEL ||--|| MAP_TIER : "model_id"
    MAP_MODEL ||--o{ MAP_SPEC_SPLIT : "model_id"
    MAP_ALIAS }o..|| MAP_MODEL : "to_key"
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
    ODS_OFFER_RAW }o..|| MAP_SPEC_SPLIT : "ETL 拆列"
    ODS_OFFER_RAW }o..|| FACT_PRICE_WEEKLY : "ETL 去重折叠"
    ODS_PSI_SALES }o..|| FACT_SALES_WEEKLY : "ETL 归一求和"
（完整字段级实体定义见配套 .md 文档的 mermaid 块；上表可直接粘贴 mermaid.live 渲染）"""


def vis_len(s):
    """显示宽度：CJK 记 2。"""
    return sum(2 if ord(c) > 0x2E7F else 1 for c in str(s))


def row_height(values, widths, base=13.2, pad=6, min_h=16):
    """行高估算：列宽单位≈ASCII 字符宽，CJK 记 2 单位；显式换行分段计。"""
    lines = 1
    for v, w in zip(values, widths):
        if v is None:
            continue
        per = max(w * 0.95, 6)  # 每行显示预算（宽度单位）
        n = 0
        for seg in str(v).split("\n"):
            n += max(1, -(-vis_len(seg) // per))
        lines = max(lines, n)
    return max(min_h, lines * base + pad)


def write_sheet(wb, name, title, headers, rows, widths, tail=None):
    ws = wb.create_sheet(name)
    ncol = len(headers)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncol)
    c = ws.cell(row=1, column=1, value=title)
    c.font, c.fill, c.alignment = TITLE_FONT, TITLE_FILL, Alignment(vertical="center", horizontal="left", indent=1)
    ws.row_dimensions[1].height = 26
    for j, h in enumerate(headers, 1):
        c = ws.cell(row=2, column=j, value=h)
        c.font, c.fill, c.alignment, c.border = HEAD_FONT, HEAD_FILL, CENTER, BORDER
    ws.row_dimensions[2].height = 20
    for i, r in enumerate(rows, 3):
        for j, v in enumerate(r, 1):
            c = ws.cell(row=i, column=j, value=v)
            c.font, c.border = BODY_FONT, BORDER
            c.alignment = CENTER if j == 2 else TOPWRAP
        ws.row_dimensions[i].height = row_height(r, widths)
    for j, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(j)].width = w
    # 打印/导 PDF：横向 + 整宽一页（消灭条带分页的截断与空白带页）
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.freeze_panes = "A3"
    ws.auto_filter.ref = f"A2:{get_column_letter(ncol)}{2 + len(rows)}"
    if tail:
        r0 = 3 + len(rows) + 1
        ws.merge_cells(start_row=r0, start_column=1, end_row=r0, end_column=ncol)
        c = ws.cell(row=r0, column=1, value=tail)
        c.font, c.alignment = Font(name="微软雅黑", size=9, color="595959"), TOPWRAP
        ws.row_dimensions[r0].height = row_height([tail], [sum(widths)])
    return ws


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "docs", "PriceLens-数据建模方案-数据字典与ER图-2026-11-19.xlsx")
    wb = Workbook()
    wb.remove(wb.active)

    write_sheet(wb, "00-总览", "PriceLens 数据建模方案 · 总览（2026-11-19）——配套《数据架构方案》《部署架构方案》",
                ["分层", "表前缀", "职责", "装载时机"], LAYERS, [16, 10, 72, 24])
    write_sheet(wb, "01-实体清单", "实体清单：17 张物理表 + 1 张逻辑表（行数 = 2026-11-19 真实库）",
                ["物理表名", "中文名", "层", "粒度（一行 =）", "当前行数", "主键"],
                ENTITIES, [18, 22, 7, 34, 11, 26])
    write_sheet(wb, "02-ER关系", "E-R 关系（17 强关联/弱引用 + 3 ETL 血缘；Mermaid 源码见本表末尾）",
                ["实体 A", "基数(A:B)", "实体 B", "关联字段", "关系类型", "说明"],
                REL, [17, 9, 18, 18, 9, 36],
                tail="Mermaid 源码（可整段粘贴 mermaid.live 渲染）：\n" + MERMAID_SRC)
    dict_headers = ["表名", "#", "字段（英文）", "中文名", "类型", "参考值域", "规则"]
    dict_widths = [22, 4, 17, 17, 11, 42, 44]
    write_sheet(wb, "03-ODS源样层", "ODS 源样层 · 数据字典（零派生列；值与源 CSV 完全一致）",
                dict_headers, [r for r in F if r[0].startswith("ods_")], dict_widths,
                tail="源侧必备性：★必备 = 品类/品牌/型号/平台/国家/店铺类型/两价/货币/汇率；○强烈建议 = 时间周期/RRP/采集时间；其余可缺省。")
    write_sheet(wb, "04-MAP匹配小表层", "MAP 匹配小表层 · 数据字典（全部「我们加的」，独立表键挂接）",
                dict_headers, [r for r in F if r[0].startswith("map_")], dict_widths)
    write_sheet(wb, "05-DIM维表层", "DIM 维表层 · 数据字典",
                dict_headers, [r for r in F if r[0].startswith("dim_")], dict_widths)
    write_sheet(wb, "06-FACT事实层", "FACT 事实层 · 数据字典（fact_sales_weekly 为逻辑表，服务器库未物理化）",
                dict_headers, [r for r in F if r[0].startswith("fact_")], dict_widths,
                tail="fact_price_weekly 逻辑主键 = (week_id, sku_id, country_code, channel_id, seller)；去重：同键同采集时间保留最低价、有价行优先。")
    write_sheet(wb, "07-CFG与META", "CFG 配置层 / META 元数据层 · 数据字典",
                dict_headers, [r for r in F if r[0].startswith(("cfg_", "meta_"))], dict_widths)
    write_sheet(wb, "08-全局键与规则", "全局键拼装契约 + 跨表业务规则",
                ["类别", "键/规则", "格式/口径", "示例", "说明"],
                [("ID 拼装", k[0], k[1], k[2], k[3]) for k in KEYS]
                + [("业务规则", r[0], r[1], "", "") for r in RULES],
                [12, 16, 60, 40, 34])
    write_sheet(wb, "09-数据集快照", "当前完整数据集快照（2026-11-19 真实库）",
                ["表", "行数", "覆盖说明"], SNAPSHOT, [18, 10, 62],
                tail="库：pricelens/server/data/pricelens.db（104MB）；源：offers.csv 39.8MB + config.json；"
                     "CSV mtime 变更自动重派生约 13s。\n"
                     "覆盖汇总：25 国有事实 / 1,263 SKU / 564 型号（我司 102·竞品 462）/ 92 渠道 / "
                     "27 周（202619–202645）/ 22 币种 / 950 矩阵（全 matrix 源）。")
    write_sheet(wb, "10-IT落地注意", "IT 落地注意",
                ["条目", "说明"], NOTES, [16, 78])

    wb.save(out)
    print("written:", out)


if __name__ == "__main__":
    main()
