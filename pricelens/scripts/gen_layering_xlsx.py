#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成《PriceLens-数据分层方案-源表到指标-2026-11-20.xlsx》。

结构（Eason 拍板五层 + 配置即数据）：
  源端 → 原表层 → 配置关系（10 张现成表，全量数据入方案）→ 中间层匹配表 → 事实表+维表 → 指标层。
拍板记录：PSI 4 列；前端映射只进指标层；异常规则/人工裁定/市场采集规则/上一代关系不做。
用法：python3 scripts/gen_layering_xlsx.py <输出.xlsx>
"""
import sys
import os
import json
import importlib.util
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties

TITLE_FONT = Font(name="微软雅黑", size=12, bold=True, color="FFFFFF")
TITLE_FILL = PatternFill("solid", fgColor="1F3864")
SEC_FONT = Font(name="微软雅黑", size=11, bold=True, color="1F3864")
SEC_FILL = PatternFill("solid", fgColor="DEEBF7")
DATA_FONT = Font(name="Consolas", size=9)
HEAD_FONT = Font(name="微软雅黑", size=10, bold=True)
HEAD_FILL = PatternFill("solid", fgColor="D9E2F1")
BODY_FONT = Font(name="微软雅黑", size=10)
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
TOPWRAP = Alignment(vertical="top", wrap_text=True)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)

HDR8 = ["表名", "#", "字段（英文）", "中文名", "类型", "参考值域", "规则", "备注"]
W8 = [16, 4, 19, 15, 9, 30, 44, 22]
HDR9 = ["指标（中文）", "指标（英文）", "计算规则", "数据来源", "前端页面", "前端位置与控件"]


def vis_len(s):
    return sum(2 if ord(c) > 0x2E7F else 1 for c in str(s))


def row_height(values, widths, base=13.2, pad=6, min_h=16):
    lines = 1
    for v, w in zip(values, widths):
        if v is None:
            continue
        per = max(w * 0.95, 6)
        n = 0
        for seg in str(v).split("\n"):
            n += max(1, -(-vis_len(seg) // per))
        lines = max(lines, n)
    return max(min_h, lines * base + pad)


def page_setup(ws):
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0


def write_layer_sheet(wb, name, title, blocks, widths, hdr=HDR8):
    ws = wb.create_sheet(name)
    ncol = len(hdr)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncol)
    c = ws.cell(row=1, column=1, value=title)
    c.font, c.fill, c.alignment = TITLE_FONT, TITLE_FILL, Alignment(vertical="center", horizontal="left", indent=1)
    ws.row_dimensions[1].height = 24
    r = 2
    for sec, rows in blocks:
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=ncol)
        c = ws.cell(row=r, column=1, value=sec)
        c.font, c.fill, c.alignment = SEC_FONT, SEC_FILL, Alignment(vertical="center", horizontal="left", indent=1)
        ws.row_dimensions[r].height = 20
        r += 1
        for j, h in enumerate(hdr, 1):
            c = ws.cell(row=r, column=j, value=h)
            c.font, c.fill, c.alignment, c.border = HEAD_FONT, HEAD_FILL, CENTER, BORDER
        ws.row_dimensions[r].height = 18
        r += 1
        for row in rows:
            for j, v in enumerate(row, 1):
                c = ws.cell(row=r, column=j, value=v)
                c.font, c.border = BODY_FONT, BORDER
                c.alignment = CENTER if j == 2 else TOPWRAP
            ws.row_dimensions[r].height = row_height(row, widths)
            r += 1
    for j, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.freeze_panes = "A3"
    page_setup(ws)
    return ws


def write_config_sheet(wb, name, title, tables):
    """配置关系页签：每表 = 区块标题（作用/去向/粒度）+ 数据头 + 全量现成数据。"""
    ws = wb.create_sheet(name)
    ncol = max(len(t["cols"]) for t in tables)
    for t in tables:
        t["widths"] = [34] * len(t["cols"])
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncol)
    c = ws.cell(row=1, column=1, value=title)
    c.font, c.fill, c.alignment = TITLE_FONT, TITLE_FILL, Alignment(vertical="center", horizontal="left", indent=1)
    ws.row_dimensions[1].height = 24
    r = 2
    for t in tables:
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=ncol)
        c = ws.cell(row=r, column=1, value=t["sec"])
        c.font, c.fill, c.alignment = SEC_FONT, SEC_FILL, Alignment(vertical="center", horizontal="left", indent=1)
        ws.row_dimensions[r].height = 20
        r += 1
        for j, h in enumerate(t["cols"], 1):
            c = ws.cell(row=r, column=j, value=h)
            c.font, c.fill, c.alignment, c.border = HEAD_FONT, HEAD_FILL, CENTER, BORDER
        ws.row_dimensions[r].height = 18
        r += 1
        for row in t["rows"]:
            vals = []
            for v in row:
                if v is None:
                    v = ""
                elif not isinstance(v, (str, int, float)):
                    v = json.dumps(v, ensure_ascii=False)
                vals.append(str(v))
            for j, v in enumerate(vals, 1):
                c = ws.cell(row=r, column=j, value=v)
                c.font, c.border = DATA_FONT, BORDER
                c.alignment = TOPWRAP
            ws.row_dimensions[r].height = row_height(vals, t["widths"], base=14, pad=5, min_h=17)
            r += 1
        ws.row_dimensions[r].height = 4  # 表间留白空行
        r += 2
    for j in range(1, ncol + 1):
        ws.column_dimensions[get_column_letter(j)].width = 34
    ws.freeze_panes = "A3"
    page_setup(ws)
    return ws


def read_config():
    """现成配置关系：config.json + ingest_pack 内置字典常量 + dim_default_channel.json。"""
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = {}
    p = os.path.join(base, "server", "data", "config.json")
    if os.path.exists(p):
        cfg = json.load(open(p, encoding="utf-8"))
    spec = importlib.util.spec_from_file_location("ingest_pack", os.path.join(base, "server", "ingest_pack.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    dicts = {
        "国家": getattr(mod, "COUNTRY_CODES", {}),
        "平台": getattr(mod, "PLATFORM_ALIASES", {}),
        "店铺类型": getattr(mod, "STORE_ALIASES", {}),
        "品类": getattr(mod, "INDUSTRY_OF_CAT", {}),
    }
    ch = {}
    p2 = os.path.join(base, "src", "data", "dim_default_channel.json")
    if os.path.exists(p2):
        ch = json.load(open(p2, encoding="utf-8"))
    return cfg, dicts, ch


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "docs", "PriceLens-数据分层方案-源表到指标-2026-11-20.xlsx")
    cfg, dicts, default_ch = read_config()

    wb = Workbook()
    wb.remove(wb.active)

    # ================================================== 0 说明页
    ws = wb.create_sheet("0-方案说明")
    page_setup(ws)
    lines = [
        ("PriceLens 数据分层方案：从源表到指标（配置即数据版）", 16, True),
        ("2026-11-20 · 五层：数据源 → 原表层 → 配置关系 → 中间层（匹配表）→ 事实表 + 维表 → 指标层（前端）", 11, False),
        ("", 10, False),
        ("阅读约定", 13, True),
        ("① 每表 8 列（表名/#/字段英文/中文名/类型/参考值域/规则/备注）；只有指标层落前端映射——前端页面+具体控件（见『7-指标映射』）。", 10, False),
        ("② 规则写法：数学规则写公式（如 美金价 = 本币价 ÷ 汇率）；拆解/字典处理点名配置表（如 按 cfg_dict_category 归一）。", 10, False),
        ("③ 原表字段对照真实源表：offer 29 列；PSI 4 列（country/product/period_id/qty）。", 10, False),
        ("④ PSI 无独立规格列，category1-4 全部从 product 串拆解，与 offer 侧共用同一匹配表。", 10, False),
        ("⑤ 周格式 2026w01（ISO 周三锚）；国家码两位大写。", 10, False),
        ("⑥ 源表暂无『官网』3 列（字段预留，补列后直取）；美金 4 列=本币÷汇率，源表直供则校验。", 10, False),
        ("", 10, False),
        ("五层总览（架构图见配套 PPT）", 13, True),
        ("L1 数据源：offer 价格采集（周度 CSV）｜PSI 销量（周度 CSV）｜手工补录（配置 xlsx）", 10, False),
        ("L2 原表层：offer_raw（29+2 列）、psi_raw（4+2 列）——原样层不改值", 10, False),
        ("L2.5 配置关系（10 张现成表，全量数据见『3-配置关系』页签）：字典 4 + 匹配规则 2 + 业务关系 3 + 默认取价 1", 10, False),
        ("L3 中间层：product_match 匹配表——两侧原表字段进来，按配置规则拆出 category1-4/系列/档位等", 10, False),
        ("L4 事实+维表：fact_pv 量价统一事实表 + 6 维表支撑筛选器", 10, False),
        ("L5 指标层：事实字段 × 维表过滤 → 指标 → 前端页面具体控件（唯一带前端映射的层）", 10, False),
        ("", 10, False),
        ("拍板记录（2026-11-20）", 13, True),
        ("· 异常规则/人工裁定不做：脏数据由业务侧在 offer 原表清洗，平台不做处理", 10, False),
        ("· 市场采集规则不做：南非第一期不接 IT 落地系统，现有口径先行", 10, False),
        ("· 上一代关系不做：无消费点", 10, False),
        ("· 默认取价 = 每国默认取价/展示的平台店铺（dim_default_channel 26 国现成预填）：进页默认渠道 + 指标取价口径锚；产品级可覆盖，空=沿用国家级", 10, False),
        ("· 配置即数据方向：cfg_* 物理化进库为唯一源、config.json 降级为导入暂存（本方案 10 张配置表即未来 cfg_* 表）", 10, False),
        ("", 10, False),
        ("表间连接键", 13, True),
        ("offer_raw.型号+型号规格 / psi_raw.product →(按配置规则拆解匹配) product_match.sku_id / model_id / category1-4", 10, False),
        ("product_match → fact_pv：sku_id / model_id（销量挂型号级）", 10, False),
        ("维表 → fact_pv：week_id｜country_code｜channel_id｜tier_code（cfg_tier_ladders）｜promo_id（cfg_promo_calendar）｜benchmark（cfg_benchmark_matrix）", 10, False),
        ("fact_pv → 指标：字段直出（价/RRP/折扣/促销/取证）或聚合（均价/销量/份额/环比）", 10, False),
    ]
    for i, (t, sz, bold) in enumerate(lines, 1):
        c = ws.cell(row=i, column=1, value=t)
        c.font = Font(name="微软雅黑", size=sz, bold=bold)
        c.alignment = Alignment(vertical="center", wrap_text=False)
        ws.row_dimensions[i].height = 22 if sz >= 13 else 17
    ws.column_dimensions["A"].width = 150

    # ================================================== 1 数据源
    src_hdr = ["来源", "#", "内容", "形式", "频率", "交付形态", "进入哪张原表", "备注"]
    write_layer_sheet(wb, "1-数据源", "L1 数据源（3 个来源：价格采集 / PSI 销量 / 手工补录配置）",
        [("来源清单", [
            ["offer 价格采集", 1, "街价明细：官网价/平台价/折扣/促销/分期/取证（29 列）", "结构化", "每周", "offers.csv（utf-8-sig）", "offer_raw", "价格事实唯一来源"],
            ["PSI", 2, "周销量：Product×国家×周（4 列；category1-2 由 product 串拆解）", "结构化", "每周", "sales.csv", "psi_raw", "销量事实唯一来源；颜色不进销量"],
            ["手工补录", 3, "业务规则与关系：系列/别名/对标/档位/档期/字典/默认渠道", "半结构化", "随业务变更", "配置 xlsx → config.json → 派生", "10 张配置关系表（见 3-配置关系）", "改后「重新派生」生效；全量现成数据随方案交付"],
        ])], [16, 4, 40, 10, 8, 26, 20, 24], hdr=src_hdr)

    # ================================================== 2 原表层
    offer_rows = [
        ["offer_raw", 1, "offer_id", "行序号", "INTEGER", "0..N−1", "导入时按行序生成，唯一索引", "技术列", ""],
        ["offer_raw", 2, "period", "时间周期", "TEXT", "2026-01-03 / 2026W43", "直取", "", ""],
        ["offer_raw", 3, "week", "周", "TEXT", "2026w01、2026w02", "period→所在 ISO 周周三→2026w{WW}；已带 W 统一小写", "技术列", ""],
        ["offer_raw", 4, "category", "品类", "TEXT", "手机/平板/穿戴/音频/iot/pc", "直取；按 cfg_dict_category 归一 industry（中英同收）", "", ""],
        ["offer_raw", 5, "brand", "品牌", "TEXT", "HUAWEI/Samsung/Apple…", "直取；HUAWEI=我司", "", ""],
        ["offer_raw", 6, "model", "型号", "TEXT", "Pura 90s Pro / iPhone 17…", "直取", "", ""],
        ["offer_raw", 7, "sku", "型号规格", "TEXT", "12+512 GB Black 整串", "直取整串，不预拆；拆解见 4-中间层匹配表 category1-4", "", ""],
        ["offer_raw", 8, "platform", "平台", "TEXT", "DNS/OZON/Mvideo/Amazon…", "直取；按 cfg_dict_platform 归并", "", ""],
        ["offer_raw", 9, "country_region", "国家/地区", "TEXT", "中英文名/国家码", "直取；按 cfg_dict_country 归一两位大写码", "", ""],
        ["offer_raw", 10, "store_type", "店铺类型", "TEXT", "1P/3P/独立站", "直取；按 cfg_dict_store_type 归一", "", ""],
        ["offer_raw", 11, "shop_name", "店铺名称", "TEXT", "具体卖家店铺名", "直取；去重键成员", "", ""],
        ["offer_raw", 12, "shop_name_new", "显示店铺名称", "TEXT", "渠道展示名", "直取；空兜底「平台 店铺类型」", "", ""],
        ["offer_raw", 13, "official_rrp_local", "官网建议零售价-本币", "REAL", ">0 本币", "直取（源表暂无此列，补列后生效）", "预留", ""],
        ["offer_raw", 14, "official_price_local", "官网成交价-本币", "REAL", ">0 本币", "直取（同上预留）", "预留", ""],
        ["offer_raw", 15, "official_discount_rate", "官网折扣率", "REAL", "−1~0", "直取；-15%/-0.15 统一负小数", "预留", ""],
        ["offer_raw", 16, "platform_rrp_local", "平台建议零售价-本币", "REAL", ">0 本币", "直取", "", "价格走势 RRP 线；明细卡 RRP"],
        ["offer_raw", 17, "platform_price_local", "平台成交价-本币", "REAL", ">0 本币", "直取；去重同键同刻保最低价", "", "价格走势均价线；悬停卡成交价"],
        ["offer_raw", 18, "platform_discount_rate", "平台显示折扣率", "REAL", "−1~0", "直取", "", "悬停卡折扣行"],
        ["offer_raw", 19, "platform_real_discount_rate", "平台实际折扣率", "REAL", "−1~0", "直取", "", "悬停卡折扣行（实际）"],
        ["offer_raw", 20, "currency", "货币", "TEXT", "ISO 4217，22 种", "直取", "", ""],
        ["offer_raw", 21, "exchange_rate", "汇率", "REAL", "1 USD = N 本币，>0", "直取；倒挂自愈（同币种中位数取倒数）", "", ""],
        ["offer_raw", 22, "official_rrp_usd", "官网建议零售价-美金", "REAL", ">0 USD", "官网建议零售价-本币 ÷ 汇率；源表直供则校验一致", "预留", ""],
        ["offer_raw", 23, "official_price_usd", "官网成交价-美金", "REAL", ">0 USD", "官网成交价-本币 ÷ 汇率；直供则校验", "预留", ""],
        ["offer_raw", 24, "platform_rrp_usd", "平台建议零售价-美金", "REAL", ">0 USD", "平台建议零售价-本币 ÷ 汇率；直供则校验", "", "价格走势 RRP 线（USD 视图）"],
        ["offer_raw", 25, "platform_price_usd", "平台成交价-美金", "REAL", ">0 USD", "平台成交价-本币 ÷ 汇率；直供则校验；>20000 剔除", "", "价格走势均价线（USD 视图）"],
        ["offer_raw", 26, "is_bundle", "是否组合销售", "TEXT", "Y/N/TRUE/是", "直取；归一 0/1", "", "悬停卡组合销售标"],
        ["offer_raw", 27, "installment", "分期付款", "TEXT", "政策原文", "直取；列空=权益行不出", "", "悬停卡分期行"],
        ["offer_raw", 28, "promotion_details", "促销政策", "TEXT", "促销原文", "直取；列空=权益行不出", "", "悬停卡促销行"],
        ["offer_raw", 29, "url", "网址链接", "TEXT", "取证 URL", "直取", "", "悬停卡取证链接"],
        ["offer_raw", 30, "screenshot_name", "截图命名", "TEXT", "截图文件名", "直取", "", "悬停卡截图"],
        ["offer_raw", 31, "collection_time", "采集时间", "TEXT", "datetime", "直取；去重排序键", "", "新鲜度标注"],
    ]
    psi_rows = [
        ["psi_raw", 1, "psi_id", "行序号", "INTEGER", "0..N−1", "导入时按行序生成，唯一索引", "技术列", ""],
        ["psi_raw", 2, "country", "国家", "TEXT", "中英文名/国家码", "直取；按 cfg_dict_country 归一两位大写码", "", ""],
        ["psi_raw", 3, "product", "产品 SKU", "TEXT", "型号码+规格串原文", "直取；category1-4 与型号匹配全部由此串拆解（见 4-中间层匹配表），无独立规格列", "", ""],
        ["psi_raw", 4, "period_id", "周期", "TEXT", "2026043（YYYY0WW）", "直取；转周剥前导 0 → 2026w43", "", ""],
        ["psi_raw", 5, "week", "周", "TEXT", "2026w01…", "由 period_id 转换", "技术列", ""],
        ["psi_raw", 6, "qty", "销量", "REAL", ">0 台", "直取；同键（product+拆出维度+国家+周）多行求和；≤0 剔除；颜色不进销量", "", "量价页量柱；大盘销量指标"],
    ]
    write_layer_sheet(wb, "2-原表层", "L2 原表层：源表原样落库（不改值）",
        [("原表 1：offer_raw 街价采集原样表（源表 29 列原样 + offer_id/week 两个技术列；粒度=一条采集明细；去重键=周×SKU×国家×平台×店铺类型×店铺名称，同键同刻保最低价）", [r[:8] for r in offer_rows]),
         ("原表 2：psi_raw PSI 周销量原样表（源表 4 列原样 + psi_id/week；粒度=Product×周期，无独立规格列）", [r[:8] for r in psi_rows])],
        W8)

    # ================================================== 3 配置关系（现成数据全量）
    def dict_table(sec, cols, d):
        return {"sec": sec, "cols": cols, "rows": sorted(d.items())}

    tables = [
        dict_table("cfg_dict_country 国家别名 → 归一层（国家归一两位大写码；空表=出厂默认兜底）｜现成 57 条",
                   ["别名（中英文/简称）", "国家码"], dicts["国家"]),
        dict_table("cfg_dict_platform 平台别名 → 归一层（平台归并）｜现成 13 条",
                   ["别名", "平台"], dicts["平台"]),
        dict_table("cfg_dict_store_type 店铺类型别名 → 归一层（1P/3P/独立站）｜现成 6 条",
                   ["别名", "店铺类型"], dicts["店铺类型"]),
        dict_table("cfg_dict_category 品类映射 → 匹配表 industry（品类翻译）｜现成 16 条",
                   ["品类原文", "产业"], dicts["品类"]),
        {"sec": "cfg_series_rules 系列规则 → 匹配表 series（型号名/归一键前缀或正则命中即归入系列；{n}/{w} 引正则捕获组）｜现成 133 条",
         "cols": ["品牌", "匹配模式", "系列"],
         "rows": [[r.get("brand", ""), r.get("pattern", ""), r.get("series", "")] for r in cfg.get("seriesRules", [])]},
        {"sec": "cfg_model_alias 型号别名 → 匹配表 model_id（解析失败型号的纠错表）｜现成 1 条",
         "cols": ["品牌", "别名（归一键）", "目标型号（归一键）"],
         "rows": [[r.get("brand", ""), r.get("from", ""), r.get("to", "")] for r in cfg.get("modelAliases", [])]},
        {"sec": "cfg_benchmark_matrix 竞品对标矩阵 → 维表 dim_benchmark（国家×我司型号×配置×竞品 SKU，便宜对便宜配对）｜现成 950 条",
         "cols": ["国家", "我司型号 ID", "我司配置", "竞品 SKU ID", "排序"],
         "rows": [[r.get("country_code", ""), r.get("own_model_id", ""), r.get("own_romram", ""),
                   r.get("competitor_sku_id", ""), r.get("sort", "")] for r in cfg.get("benchmarkMatrix", [])]},
        {"sec": "cfg_tier_ladders 分档阶梯 → 维表 dim_tier（产业→USD 价格点升序；参考价落档得 tier_code）｜现成 6 产业",
         "cols": ["产业", "价格阶梯（USD 价格点，逗号分隔升序）"],
         "rows": sorted((k, v) for k, v in (cfg.get("tierLadders") or {}).items())},
        {"sec": "cfg_promo_calendar 大促档期 → 维表 dim_promo（国家×促销×起止×深度；图上大促带）｜现成 66 条",
         "cols": ["国家", "促销名", "起始日", "结束日", "深度"],
         "rows": [[r.get("country_code", ""), r.get("promo_name", ""), r.get("start_date", ""),
                   r.get("end_date", ""), r.get("depth_hint") or r.get("depth", "")] for r in cfg.get("promoRows", [])]},
        {"sec": "cfg_default_channel 默认取价渠道 → 库内 dim_default_channel（每国默认取价/展示的平台店铺=进页默认+指标取价锚；产品级可覆盖）｜现成 26 条",
         "cols": ["国家", "默认渠道（国家:平台slug:店铺类型）"],
         "rows": sorted(default_ch.items())},
    ]
    write_config_sheet(wb, "3-配置关系", "配置关系（10 张现成表，全量数据随方案交付；去向=未来库内 cfg_* 表族）", tables)

    # ================================================== 4 中间层匹配表
    match_rows = [
        ["product_match", 1, "model_id", "型号 ID", "TEXT", "own-huawei-pura-90s-pro / cmp-…", "品牌+型号剥品牌词得归一键，同键取最高频原文为正名；拼装 (own|cmp)-品牌slug-型号slug；psi.product 查 cfg_model_alias→同一归一键（撞车我司优先）", "两侧共用", "价格走势系列；销量 join"],
        ["product_match", 2, "sku_id", "SKU ID", "TEXT", "…__12-256gb__black", "model_id__rom_key__color_key 三段拼装，键段=拆出值 slug 化", "", "选品主体；URL main= 参数"],
        ["product_match", 3, "brand", "品牌（正名）", "TEXT", "HUAWEI/Samsung…", "组内原文；型号剥前缀品牌词", "", "名称带品牌行"],
        ["product_match", 4, "model_name", "型号（正名）", "TEXT", "Pura 90s Pro", "同归一键取最高频原文", "", "名称带型号行"],
        ["product_match", 5, "category1", "维度 1（存储/表盘）", "TEXT", "12+512 GB / 46mm / 空", "从规格串取『12+512 GB』『1TB』形存储词（GB/TB 归一）；穿戴取表盘『46mm』（型号全局 ≥2 尺寸才保留）；音频留空", "offer 取型号规格列；psi 取 product 串；销量 join 键", "筛选器·存储版本；名称带配置行"],
        ["product_match", 6, "category2", "维度 2（屏幕）", "TEXT", "11.5英寸 / 空", "平板取屏幕『11.5 英寸』形；其余留空", "同上两侧拆解；销量 join 键", "筛选器·屏幕尺寸（平板）"],
        ["product_match", 7, "category3", "维度 3（柔光屏）", "TEXT", "PaperMatte / 空", "平板规格串含『柔光』『PaperMatte』『纸感』→ PaperMatte；其余留空", "建模预留；psi.product 同样拆解", "筛选器·柔光版（预留）"],
        ["product_match", 8, "category4", "维度 4（预留）", "TEXT", "恒空", "预留占位，建表即含列", "", "—"],
        ["product_match", 9, "romram", "存储配置（展示）", "TEXT", "12+512 GB / —", "category1 的展示形；穿戴无存储为 —", "", "名称带配置行"],
        ["product_match", 10, "color", "颜色/变体（展示）", "TEXT", "Black/钛黑/WiFi 版", "规格串去掉存储/屏幕/表盘后的剩余修饰词", "", "名称带颜色；版本胶囊"],
        ["product_match", 11, "is_own", "我司标识", "INTEGER", "0/1", "品牌=HUAWEI→1", "", "全局我司/竞品分流"],
        ["product_match", 12, "series", "系列", "TEXT", "Pura/Mate/nova/GT…", "按 cfg_series_rules 前缀/正则命中；未命中我司取型号首词、竞品取型号名", "", "产品树第三列；筛选器·系列"],
        ["product_match", 13, "industry", "产业", "TEXT", "phone/tablet/wearable/audio/iot/pc", "品类原文查 cfg_dict_category", "", "产业页签；筛选器"],
        ["product_match", 14, "ref_price_usd", "参考价", "REAL", ">0 USD", "型号级 RRP 美金中位数；无 RRP 用成交价中位数", "", "档位落档依据"],
        ["product_match", 15, "tier_code", "价格档位", "TEXT", "100-200/800+…", "参考价按 cfg_tier_ladders 产业阶梯落档；分国中位价可落分国档", "", "筛选器·价格档位；大盘档位占比"],
        ["product_match", 16, "match_source", "匹配来源", "TEXT", "offer / psi / alias", "标记映射驱动侧；alias=经 cfg_model_alias 命中", "销量解析诊断", "配置页 unmatched 诊断"],
    ]
    write_layer_sheet(wb, "4-中间层匹配表", "L3 中间层：product_match（offer-psi 匹配表）——从原表哪个字段来、按哪张配置表、拆出什么",
        [("product_match（粒度=型号×规格原文；价格侧由 offer_raw 拆解，销量侧由 psi_raw.product 解析复用同一映射；category1-4 即业务说的 category 1234）", [r[:8] for r in match_rows])],
        W8)

    # ================================================== 5 事实表
    fact_rows = [
        ["fact_pv", 1, "week", "周", "TEXT", "2026w01…", "offer_raw.week / psi_raw.week；连 dim_week.week_id", "粒度键", "全局时间轴；筛选器·时间"],
        ["fact_pv", 2, "sku_id", "SKU ID", "TEXT", "→product_match", "product_match.sku_id", "粒度键", "选品；URL main= 参数"],
        ["fact_pv", 3, "model_id", "型号 ID", "TEXT", "→product_match", "product_match.model_id；销量挂型号级，同型号同国家同周各行带同一 qty 不摊分", "", ""],
        ["fact_pv", 4, "country_code", "国家码", "TEXT", "两位大写", "offer_raw.国家/地区 按 cfg_dict_country 归一；连 dim_region", "粒度键", "筛选器·国家"],
        ["fact_pv", 5, "channel_id", "渠道 ID", "TEXT", "AE:carrefour:3P", "国家:平台slug:店铺类型 拼装；连 dim_channel", "粒度键", "筛选器·平台/店铺类型"],
        ["fact_pv", 6, "seller", "店铺", "TEXT", "店铺名，缺省 —", "offer_raw.店铺名称", "逻辑键", "渠道下钻店铺"],
        ["fact_pv", 7, "platform_rrp_local", "平台建议零售价-本币", "REAL", ">0/空", "直取 offer_raw", "", "价格走势 RRP 线（本币）"],
        ["fact_pv", 8, "platform_price_local", "平台成交价-本币", "REAL", ">0", "直取 offer_raw；同键同刻保最低价", "", "价格走势均价线（本币）；明细卡"],
        ["fact_pv", 9, "platform_rrp_usd", "平台建议零售价-美金", "REAL", ">0/空", "platform_rrp_local ÷ exchange_rate", "", "价格走势 RRP 线（USD）"],
        ["fact_pv", 10, "platform_price_usd", "平台成交价-美金", "REAL", ">0", "platform_price_local ÷ exchange_rate；>20000 剔除", "", "价格走势均价线（USD）"],
        ["fact_pv", 11, "official_rrp_local / official_price_local", "官网建议零售价/成交价-本币", "REAL", ">0/空", "offer_raw 官网列直取（源表暂无，预留）", "", "官网价对比（预留）"],
        ["fact_pv", 12, "discount_display", "平台显示折扣率", "REAL", "−1~0", "直取 offer_raw", "", "悬停卡折扣行"],
        ["fact_pv", 13, "discount_actual", "平台实际折扣率", "REAL", "−1~0", "直取 offer_raw", "", "悬停卡折扣行（实际）"],
        ["fact_pv", 14, "currency / exchange_rate", "货币/汇率", "TEXT/REAL", "22 币种；>0", "直取 offer_raw（汇率自愈后）", "", "币种切换"],
        ["fact_pv", 15, "is_bundle", "组合销售", "INTEGER", "0/1", "offer_raw 归一 0/1", "", "悬停卡组合销售标"],
        ["fact_pv", 16, "installment", "分期付款", "TEXT", "原文/空", "直取 offer_raw；列空=行不出", "", "悬停卡分期行"],
        ["fact_pv", 17, "promotion_details", "促销政策", "TEXT", "原文/空", "直取 offer_raw；列空=行不出", "", "悬停卡促销权益行"],
        ["fact_pv", 18, "url / screenshot_name", "取证链接/截图", "TEXT", "URL/文件名", "直取 offer_raw", "", "悬停卡取证"],
        ["fact_pv", 19, "collection_time", "采集时间", "TEXT", "datetime", "直取 offer_raw；去重排序键", "", "新鲜度标注"],
        ["fact_pv", 20, "qty", "销量（型号级）", "REAL", "≥0 台", "psi_raw.qty 按 product 拆解维度+国家+周 求和；型号×国家有行=整模型真实销量，无行回落估算，两口径不混", "", "量价页量柱；悬停卡销量"],
        ["fact_pv", 21, "sales_source", "销量口径标记", "TEXT", "psi / estimate", "有 PSI 行=psi；否则 estimate", "", "量带悬停口径标"],
        ["fact_pv", 22, "category1..4 快照", "维度 1-4 快照", "TEXT", "同 product_match", "product_match.category1-4 导入时快照，免 join", "", "销量下钻维度"],
    ]
    write_layer_sheet(wb, "5-事实表", "L4 事实表：fact_pv 量价统一事实表（价格+销量一张宽表）",
        [("fact_pv（粒度=周×SKU×国家×渠道×店铺；价格字段 SKU 级、销量字段型号级挂载；连接键见每行规则）", [r[:8] for r in fact_rows])], W8)

    # ================================================== 6 维表
    dim_rows = [
        ["dim_week", 1, "week_id", "周 ID", "TEXT", "2026w01…", "offer/psi 周去重", "主键", "筛选器·时间；周/月/季切换"],
        ["dim_week", 2, "week_wed_date", "周三锚日期", "TEXT", "2026-01-07", "period 所在 ISO 周的周三", "", "时间轴刻度"],
        ["dim_week", 3, "month_id / quarter_id", "月/季 ID", "TEXT", "202601 / 2026Q1", "周三锚所属月；真日期算季", "", "月/季聚合"],
        ["dim_region", 1, "country_code", "国家码", "TEXT", "两位大写", "offer 国家按 cfg_dict_country 归一去重", "主键", "筛选器·国家"],
        ["dim_region", 2, "region_code / region_name", "区域码/名", "TEXT", "APAC/EU/EURASIA/LATAM/MEA", "手工补录", "", "区域分组"],
        ["dim_region", 3, "currency", "币种", "TEXT", "ISO 4217", "手工补录", "", "币种切换默认值"],
        ["dim_region", 4, "default_platform / default_own_models", "默认平台/默认我司型号", "TEXT", "JSON", "手工补录", "", "进页默认视图"],
        ["dim_channel", 1, "channel_id", "渠道 ID", "TEXT", "AE:carrefour:3P", "国家+平台+店铺类型组合去重", "主键", "筛选器·平台/店铺类型"],
        ["dim_channel", 2, "platform / store_type", "平台/店铺类型", "TEXT", "归一后值", "按 cfg_dict_platform / cfg_dict_store_type 归并", "", "筛选器·平台；筛选器·店铺类型"],
        ["dim_channel", 3, "display_name / shops", "展示名/店铺数", "TEXT/INTEGER", "", "offer 聚合", "", "渠道下拉展示"],
        ["dim_tier", 1, "industry / ladder", "产业/阶梯", "TEXT", "6 产业；USD 升序", "来源 cfg_tier_ladders", "", "档位边界"],
        ["dim_tier", 2, "tier_code / label", "档位码/标签", "TEXT", "100-200/200-400…", "相邻价格点成档；ref_price_usd 落档", "", "筛选器·价格档位；大盘档位占比"],
        ["dim_promo", 1, "promo_id", "档期 ID", "TEXT", "国家-哈希-起始日", "来源 cfg_promo_calendar 一行一档期", "主键", "大促带"],
        ["dim_promo", 2, "country_code / promo_name", "国家/促销名", "TEXT", "", "cfg_promo_calendar 直取", "", "筛选器·档期；档期标注"],
        ["dim_promo", 3, "start_date / end_date / depth", "起止/深度", "TEXT", "YYYY-MM-DD；浅/中/深", "周与起止相交圈影响周", "", "价格走势大促带（深度=带深浅）"],
        ["dim_benchmark", 1, "country_code + own_model_id + own_romram", "国家+我司型号+配置", "TEXT", "", "来源 cfg_benchmark_matrix", "", "对比区"],
        ["dim_benchmark", 2, "competitor_sku_id", "竞品 SKU", "TEXT", "cmp-…", "矩阵直取；连 product_match.sku_id", "", "对比区竞品线"],
        ["dim_benchmark", 3, "sort / source", "排序/来源", "INTEGER/TEXT", "matrix/manual", "矩阵 sort；人工层 manual", "", "对比区顺序"],
        ["dim_default_channel", 1, "country_code → channel_id", "国家→默认渠道", "TEXT", "RU:dns:独立站", "来源 cfg_default_channel（每国默认取价/展示的平台店铺）", "主键=国家", "进页默认渠道；指标取价口径锚"],
        ["dim_default_channel", 2, "model_id（可空）", "产品级覆盖", "TEXT", "空=沿用国家级", "个别型号默认渠道取不到价时单独指定", "", "特殊型号取价"],
    ]
    write_layer_sheet(wb, "6-维表", "L5 维表（7 张）：支撑筛选器与图上标注，均连接 fact_pv",
        [("维表清单（连接键=维表主键 ↔ fact_pv 外键；dim_default_channel 为配置直载维表，26 国现成数据见 3-配置关系）", [r[:8] for r in dim_rows])], W8)

    # ================================================== 7 指标映射
    idx_rows = [
        ["周均价（成交）", "avg_price", "platform_price_usd 按周×SKU 平均/中位（可切）", "fact_pv", "价格走势页", "主图系列均价线"],
        ["RRP", "rrp", "platform_rrp_usd 直取/均值", "fact_pv", "价格走势页", "RRP 线；悬停卡 RRP 行"],
        ["平台价差", "platform_spread", "同周同 SKU 跨渠道成交价差", "fact_pv", "价格走势页", "悬停卡平台价差区"],
        ["折扣率", "discount", "discount_display / discount_actual 直取", "fact_pv", "价格走势页", "悬停卡折扣行"],
        ["促销权益", "promo_benefits", "promotion_details / installment / is_bundle 直取", "fact_pv", "价格走势/量价页", "悬停卡促销/分期/赠品行"],
        ["周销量", "weekly_qty", "qty 直取（求和已在上游）", "fact_pv", "量价页", "量柱（右轴）；悬停卡销量"],
        ["销量口径", "sales_source", "psi / estimate", "fact_pv", "量价页", "量带悬停口径标"],
        ["销毛率（模拟）", "gross_margin", "（成交价−模拟成本）÷成交价；竞品面板屏蔽", "fact_pv+成本配置", "量价页", "销毛水位线/轴；明细卡销毛格"],
        ["区间极差/涨跌", "range_amp", "选区 max−min 与首尾涨跌", "fact_pv", "价格走势页", "区间量尺幅度框"],
        ["大促档期", "promo_band", "dim_promo 起止圈影响周", "dim_promo", "价格走势/大盘页", "图上大促带；档期标签"],
        ["品牌份额走势", "brand_share", "销量按 brand 聚合 ÷ 国家×周总量", "fact_pv", "大盘页", "品牌份额多线卡"],
        ["档位占比", "tier_share", "销量按 tier_code 聚合占比", "fact_pv+dim_tier", "大盘页", "档位结构卡"],
        ["同比/环比", "yoy_wow", "周/月/季错位对比", "fact_pv", "大盘/量价页", "环比 chip；同比曲线"],
        ["生命周期", "lifecycle", "SKU 首末有数周", "fact_pv", "价格走势页", "产品树排序；生命周期带"],
        ["取证信息", "evidence", "url+screenshot+collection_time", "fact_pv", "全页面", "悬停卡取证"],
        ["对比组", "benchmark_set", "国家+我司型号圈竞品集", "dim_benchmark", "价格走势/量价页", "对比区（≤3 家）"],
        ["默认取价", "default_pricing", "dim_default_channel：页面默认渠道 + 指标取价锚", "dim_default_channel", "全页面", "进页默认渠道；档位/预警基准价"],
        ["国家/平台/店铺类型筛选", "filters", "dim_region / dim_channel", "维表", "全页面", "筛选条"],
        ["存储/屏幕/柔光筛选", "cat_filters", "product_match.category1-4", "product_match", "全页面", "配置维度筛选（cat3 预留）"],
        ["价格档位筛选", "tier_filter", "dim_tier + tier_code", "dim_tier", "全页面", "价格档位筛选"],
        ["时间筛选", "time_filter", "dim_week；自动时间策略", "dim_week", "全页面", "时间条（周/月/季）"],
        ["进页默认视图", "default_view", "default_platform / default_own_models", "dim_region", "全页面", "首屏默认选中"],
        ["数据新鲜度", "freshness", "max(collection_time) 与 generatedAt", "fact_pv+meta", "配置页数据卡", "15s 轮询刷新"],
    ]
    write_layer_sheet(wb, "7-指标映射", "L6 指标层：事实表字段 × 维表过滤 → 指标 → 前端页面具体控件（唯一带前端映射的层）",
        [("指标映射（计算规则=数学公式或聚合口径；前端位置落到具体页面+控件）", idx_rows)],
        [16, 13, 40, 16, 14, 30], HDR9)

    wb.save(out)
    print("written:", out)


if __name__ == "__main__":
    main()
