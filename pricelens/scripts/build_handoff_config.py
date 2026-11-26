#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
交接包预填配置表生成器（2026-11-18 C3 显性化起脚本化——此前为会话产物）。

从仓库权威源 1:1 展开九页签预填 xlsx（列头与前端 configTemplate.ts
SHEET_DEFINITIONS 逐字一致，parseConfigWorkbook 按表头解析）：
  系列规则 133 = ingest_real.OWN_SERIES_RULES（21 前缀）+ series_rules._RULES（112 正则）
  型号别名   1 = data/real/overrides.json model_aliases
  对标矩阵 919 = src/data/dim_benchmark.json（行数随维表；改对标行后须重跑本脚本）
  分档阶梯   6 = ingest_real.TIER_LADDERS
  大促档期  66 = src/data/dim_promo.json
  国家别名/平台别名/店铺类型别名/品类映射 = server/ingest_pack.py 出厂字典
    （COUNTRY_CODES 已并入 PSI 侧别名，与前端 DEFAULT_DICTIONARIES 同源）

用法：python3 scripts/build_handoff_config.py [输出路径]
  缺省输出 public/handoff-config.xlsx（前端 fetch 下载位）。
"""
import json
import os
import sys

from openpyxl import Workbook

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # pricelens/
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "server"))

import ingest_real  # noqa: E402
import series_rules  # noqa: E402
import ingest_pack  # noqa: E402

SHEETS = [
    "说明", "市场采集规则", "默认店铺", "产品默认店铺", "竞品对标", "上一代关系",
    "异常规则", "人工裁定", "系列规则", "型号别名", "对标矩阵", "分档阶梯", "大促档期",
    "国家别名", "平台别名", "店铺类型别名", "品类映射",
]


def build_rows():
    """各页签数据行（不含表头；说明/市场采集规则等七页签由前端模板承载，此处只填九个规则/字典页签）"""
    series_rules_rows = []
    for prefix, series in ingest_real.OWN_SERIES_RULES:
        series_rules_rows.append(("HUAWEI", prefix, series))
    for brand, rx, template in series_rules._RULES:
        series_rules_rows.append((brand, f"re:{rx}", template))

    with open(os.path.join(ROOT, "data", "real", "overrides.json"), encoding="utf-8") as f:
        overrides = json.load(f)
    alias_rows = []
    for key, target in (overrides.get("model_aliases") or {}).items():
        brand, _, frm = key.partition("|")
        alias_rows.append((brand or "HUAWEI", frm, target))

    with open(os.path.join(ROOT, "src", "data", "dim_benchmark.json"), encoding="utf-8") as f:
        benchmark = json.load(f)
    benchmark_rows = [(b.get("country_code") or "", b["own_model_id"], b.get("own_romram") or "",
                       b["competitor_sku_id"], b.get("sort") or 0, b.get("note") or "")
                      for b in benchmark]

    ladder_rows = [(ind, ",".join(str(p) for p in points))
                   for ind, points in ingest_real.TIER_LADDERS.items()]

    with open(os.path.join(ROOT, "src", "data", "dim_promo.json"), encoding="utf-8") as f:
        promos = json.load(f)
    promo_rows = [(p["country_code"], p["promo_name"], p["start_date"], p["end_date"],
                   p.get("depth_hint") or "深", ",".join(p["platforms"]) if p.get("platforms") else "")
                  for p in promos]

    return {
        "系列规则": [("品牌", "规则", "系列名")] and series_rules_rows,
        "型号别名": alias_rows,
        "对标矩阵": benchmark_rows,
        "分档阶梯": ladder_rows,
        "大促档期": promo_rows,
        "国家别名": [(alias, cc) for alias, cc in ingest_pack.COUNTRY_CODES.items()],
        "平台别名": [(alias, pf) for alias, pf in ingest_pack.PLATFORM_ALIASES.items()],
        "店铺类型别名": [(alias, st) for alias, st in ingest_pack.STORE_ALIASES.items()],
        "品类映射": [(raw, ind) for raw, ind in ingest_pack.INDUSTRY_OF_CAT.items()],
    }


HEADERS = {
    "系列规则": ("品牌", "规则", "系列名"),
    "型号别名": ("品牌", "原始型号", "目标型号"),
    "对标矩阵": ("country_code", "own_model_id", "own_romram", "competitor_sku_id", "sort", "note"),
    "分档阶梯": ("产业", "阶梯（逗号分隔 USD 价格点）"),
    "大促档期": ("country_code", "促销名", "开始日期", "结束日期", "深浅（浅/中/深）", "平台（逗号分隔，留空=全部）"),
    "国家别名": ("别名（中英文/简称）", "国家码"),
    "平台别名": ("别名", "平台名"),
    "店铺类型别名": ("别名", "店铺类型（1P/3P/独立站）"),
    "品类映射": ("品类原文", "产业（phone/tablet/wearable/audio/iot/pc）"),
}


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "public", "handoff-config.xlsx")
    rows_by_sheet = build_rows()
    wb = Workbook()
    wb.remove(wb.active)
    for name in SHEETS:
        ws = wb.create_sheet(title=name)
        if name not in HEADERS:
            continue  # 说明等七页签：留空（前端模板下载含说明与表头，预填表只需规则页签）
        ws.append(list(HEADERS[name]))
        for row in rows_by_sheet[name]:
            ws.append(list(row))
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    wb.save(out_path)
    counts = {k: len(v) for k, v in rows_by_sheet.items()}
    total = sum(counts.values())
    print(f"[build_handoff_config] {out_path}")
    print(f"[build_handoff_config] {counts} 共 {total} 行")


if __name__ == "__main__":
    main()
