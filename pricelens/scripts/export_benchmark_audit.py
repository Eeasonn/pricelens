#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""竞品匹配核对表导出（2026-11-10 Eason 要求：matrix-only + 层级塌缩落地后全量核对）。

读 src/data 维表 + data/real/matrix_resolution.json，产出 docs/竞品匹配核对表-<日期>.xlsx：
  Sheet1 竞品匹配总表 —— 指定国家的全部「我司型号×配置」及生效竞品1..3
          （含矩阵未覆盖、矩阵竞品无采数的置空行与原因），供逐行核对匹配关系；
  Sheet2 矩阵解析明细 —— 每条矩阵行的原文 → 我司/竞品解析结果与状态
          （默认块 + 分国块全量，置空名单在这里）。
幂等：同输入重跑输出一致（文件名按当天日期，同日覆盖）。用法：
    python3 scripts/export_benchmark_audit.py
"""
import json
import os
import sys
from datetime import date

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = os.path.dirname(ROOT)
DATA = os.path.join(ROOT, "src", "data")

# 2026-11-10 Eason 指定的核对国家（顺序即表内出现顺序）
AUDIT_COUNTRIES = ["PL", "DE", "RU", "BR", "MX", "AE", "SA", "ZA", "PH", "TH"]
IND_CN = {"phone": "手机", "tablet": "平板", "wearable": "穿戴", "audio": "音频", "pc": "PC", "iot": "IoT"}
IND_ORDER = {"phone": 0, "tablet": 1, "wearable": 2, "audio": 3, "pc": 4, "iot": 5}

HEADER_FILL = PatternFill("solid", fgColor="EFEFEF")
WRAP = Alignment(vertical="top", wrap_text=True)


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def display(p):
    """产品显示名：品牌 型号 · 配置 · 变体（'—' 段整段隐藏）。"""
    parts = [p["brand"], p["model_name"]]
    if p["romram"] and p["romram"] != "—":
        parts.append(p["romram"])
    if p["color"] and p["color"] != "—":
        parts.append(p["color"])
    return " ".join(parts[:2]) + (" · " + " · ".join(parts[2:]) if len(parts) > 2 else "")


def main():
    products = load("dim_product.json")
    bench = load("dim_benchmark.json")
    regions = load("dim_region.json")
    with open(os.path.join(ROOT, "data", "real", "matrix_resolution.json"), encoding="utf-8") as f:
        resolution = json.load(f)

    sku_by_id = {p["sku_id"]: p for p in products}
    name_cn = {r["country_code"]: r["country_name"] for r in regions}
    region_cn = {r["country_code"]: r["region_name"] for r in regions}
    region_sort = {r["country_code"]: r["sort"] for r in regions}

    # ---------- Sheet1 数据：国家 × 我司型号 × 配置 ----------
    # 我司侧枚举 = 维表 countries 含该国的 own SKU（塌缩后同型号同配置一行）
    own_rows = {}
    for p in products:
        if not p["is_own"]:
            continue
        for cc in p["countries"]:
            if cc not in AUDIT_COUNTRIES:
                continue
            key = (cc, p["model_id"], p["romram"])
            if key not in own_rows:
                own_rows[key] = {
                    "cc": cc, "industry": p["industry"], "series": p["series"],
                    "model_name": p["model_name"], "romram": p["romram"],
                    "tier": (p.get("tier_by_country") or {}).get(cc) or p["tier_code"],
                    "comps": {},
                }
    # 生效对标（matrix-only 维表）
    covered_pairs = set()
    for b in bench:
        cc = b["country_code"]
        if cc not in AUDIT_COUNTRIES:
            continue
        key = (cc, b["own_model_id"], b["own_romram"])
        row = own_rows.get(key)
        if row is None:
            # 对标行存在但该国维表枚举不到（理论不该发生）——保留成孤立行便于发现
            row = own_rows[key] = {"cc": cc, "industry": "?", "series": "", "model_name": b["own_model_id"],
                                   "romram": b["own_romram"], "tier": "", "comps": {}}
        slot = int(b.get("sort") or 99)
        sku = sku_by_id.get(b["competitor_sku_id"])
        label = display(sku) if sku else f"{b['competitor_sku_id']}（SKU 缺失）"
        if not sku:
            row["orphan"] = True
        row["comps"].setdefault(slot, label)
        covered_pairs.add(key)

    # 矩阵覆盖面：分国块显式声明的 (cc, own model_id) + 默认块 × 该国有数据
    matrix_covered = set()
    data_ccs = {cc for p in products for cc in p["countries"]}
    for e in resolution:
        for x in e.get("own", []):
            mid = x.get("model_id")
            if not mid:
                continue
            if e.get("default"):
                for cc in data_ccs:
                    matrix_covered.add((cc, mid))
            elif e.get("country_code"):
                matrix_covered.add((e["country_code"], mid))

    for key, row in own_rows.items():
        if key not in covered_pairs:
            row["empty_reason"] = ("矩阵已声明、但竞品在该国无采数（置空）" if (key[0], key[1]) in matrix_covered
                                   else "矩阵未覆盖（matrix-only 不自动补齐）")

    sheet1 = []
    for (cc, _mid, _rom), row in own_rows.items():
        reason = row.get("empty_reason", "")
        if row["comps"]:
            partial = "；".join(f"竞品{i} 置空" for i in (1, 2, 3) if i not in row["comps"])
            if partial:
                reason = (reason + "；" if reason else "") + partial
            if row.get("orphan"):
                reason = (reason + "；" if reason else "") + "存在竞品 SKU 在维表缺失"
        elif not reason:
            reason = "矩阵未覆盖（matrix-only 不自动补齐）"
        sheet1.append({
            "region": region_cn.get(cc, ""), "cc": cc, "country": name_cn.get(cc, cc),
            "industry": IND_CN.get(row["industry"], row["industry"]),
            "series": row["series"], "model": row["model_name"], "romram": row["romram"],
            "tier": row["tier"],
            "c1": row["comps"].get(1, ""), "c2": row["comps"].get(2, ""), "c3": row["comps"].get(3, ""),
            "note": reason,
        })
    sheet1.sort(key=lambda r: (AUDIT_COUNTRIES.index(r["cc"]), IND_ORDER.get(r["industry"], 9), r["model"], r["romram"]))

    # ---------- Sheet2 数据：矩阵解析明细 ----------
    sheet2 = []
    for e in resolution:
        cc = e.get("country_code") or ""
        is_default = bool(e.get("default"))
        own = e.get("own") or []
        own_txt = "；".join(f"{x['model_id']}（{x['status']}）" for x in own) or "（未解析→置空）"
        comp_cells = []
        for ce in e.get("comps", []):
            models = ce.get("models") or []
            if models:
                comp_cells.append(f"{ce['raw']} → " + "；".join(f"{m['model_id']}（{m['status']}）" for m in models))
            else:
                comp_cells.append(f"{ce['raw']} → （置空）")
        if not own:
            status = "我司未解析"
        elif not e.get("comps"):
            status = "OK（无竞品列）"
        elif all(not ce.get("models") for ce in e["comps"]):
            status = "竞品全置空"
        elif any(not ce.get("models") for ce in e["comps"]):
            status = "竞品部分置空"
        else:
            status = "OK"
        scope = "默认块（全部国家）" if is_default else f"{region_cn.get(cc, '')} {name_cn.get(cc, cc) or e.get('country', '')}".strip()
        sheet2.append({
            "scope": scope,
            "industry": IND_CN.get(e.get("industry") or "", e.get("industry") or ""),
            "series": e.get("series") or "",
            "own_raw": e.get("own_raw") or "",
            "own_resolved": own_txt,
            "comps": "\n".join(comp_cells),
            "status": status,
        })
    sheet2.sort(key=lambda r: (not r["scope"].startswith("默认块"), r["scope"], r["industry"], r["own_raw"]))

    # ---------- 落盘 ----------
    wb = Workbook()
    ws1 = wb.active
    ws1.title = "竞品匹配总表"
    heads1 = ["区域", "国家", "产业", "系列", "我司型号", "我司配置", "价格档位(声明/推算)",
              "竞品1（主）", "竞品2", "竞品3", "说明"]
    ws1.append(heads1)
    for r in sheet1:
        ws1.append([r["region"], r["country"], r["industry"], r["series"], r["model"], r["romram"],
                    r["tier"], r["c1"], r["c2"], r["c3"], r["note"]])
    for col, w in zip(range(1, len(heads1) + 1), [8, 8, 7, 14, 20, 18, 16, 30, 30, 30, 28]):
        ws1.column_dimensions[get_column_letter(col)].width = w
    for c in ws1[1]:
        c.font = Font(bold=True)
        c.fill = HEADER_FILL
        c.alignment = WRAP
    for row in ws1.iter_rows(min_row=2):
        for c in row:
            c.alignment = WRAP
    ws1.freeze_panes = "A2"
    ws1.auto_filter.ref = f"A1:{get_column_letter(len(heads1))}{ws1.max_row}"

    ws2 = wb.create_sheet("矩阵解析明细")
    heads2 = ["适用范围", "产业", "系列", "矩阵产品（原文）", "我司解析", "竞品解析（原文→型号）", "状态"]
    ws2.append(heads2)
    for r in sheet2:
        ws2.append([r["scope"], r["industry"], r["series"], r["own_raw"], r["own_resolved"], r["comps"], r["status"]])
    for col, w in zip(range(1, len(heads2) + 1), [18, 7, 14, 24, 34, 60, 12]):
        ws2.column_dimensions[get_column_letter(col)].width = w
    for c in ws2[1]:
        c.font = Font(bold=True)
        c.fill = HEADER_FILL
        c.alignment = WRAP
    for row in ws2.iter_rows(min_row=2):
        for c in row:
            c.alignment = WRAP
    ws2.freeze_panes = "A2"
    ws2.auto_filter.ref = f"A1:{get_column_letter(len(heads2))}{ws2.max_row}"

    out = os.path.join(REPO, "docs", f"竞品匹配核对表-{date.today().isoformat()}.xlsx")
    wb.save(out)
    n_empty = sum(1 for r in sheet1 if not r["c1"] and not r["c2"] and not r["c3"])
    print(f"[audit] {out}")
    print(f"[audit] 总表 {len(sheet1)} 行（其中全置空 {n_empty} 行）；解析明细 {len(sheet2)} 行")


if __name__ == "__main__":
    sys.exit(main())
