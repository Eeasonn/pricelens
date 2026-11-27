"""模拟 PSI 销量造数（1a：估算口径同粒度反推）→ server/data/sales.csv。
粒度=国家×型号×规格(cat1)×周；qty=产业基准×固定 seed 抖动（可复跑）。
走真实 PSI 同一条链（2026-11-27 四表结构）：ods_psi → map_psi_sku（本文件自带配置列
category1/2/3，parse_source=source）× 匹配表 → fact_sales → 派生包 → 页面。
product_sku = 该配置的规格串（同一型号下不同配置必须是不同的串，PSI 侧的键是「型号名 + SKU 串」）。"""
import json
import random
import sqlite3

DB = "/Users/eason/Documents/Eason's Projects/Price Intelligence/pricelens/server/data/pricelens.db"
OUT = "/Users/eason/Documents/Eason's Projects/Price Intelligence/pricelens/server/data/sales.csv"
PSI_TYPE = "simulated"
BASE_QTY = {"phone": (120, 900), "tablet": (40, 260), "wearable": (60, 380),
            "audio": (50, 280), "pc": (15, 90), "iot": (25, 140)}


def cat3_of(sku):
    """平板的柔光维度（Normal / PaperMatte）；其余产业为空"""
    if sku.get("industry") != "tablet":
        return ""
    return "PaperMatte" if "papermatte" in str(sku.get("romram") or "").lower() else "Normal"


def main():
    rng = random.Random(20261126)
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    weeks = [r[0] for r in conn.execute(
        "SELECT DISTINCT week_id FROM fact_price ORDER BY 1")]
    prod = {}
    for p in json.load(open("/Users/eason/Documents/Eason's Projects/Price Intelligence/"
                            "pricelens/server/data/latest-pack.json"))["dims"]["product"]:
        prod[p["sku_id"]] = p
    combos = conn.execute(
        "SELECT DISTINCT country_code, model_id FROM fact_price").fetchall()
    out = []
    for r in combos:
        cc, mid = r["country_code"], r["model_id"]
        sku = next((p for p in prod.values()
                    if p["model_id"] == mid and cc in (p.get("countries") or [])), None)
        if sku is None:
            sku = next((p for p in prod.values() if p["model_id"] == mid), None)
        if sku is None:
            continue
        lo, hi = BASE_QTY.get(sku["industry"], (30, 150))
        base = rng.randint(lo, hi)
        spec = str(sku.get("spec_display") or sku.get("romram") or "")
        spec = "" if spec in ("—", "-") else spec
        for w in weeks:
            qty = max(1, int(base * rng.uniform(0.7, 1.3)))
            out.append([cc, sku["model_name"], spec, sku["cat1"] or "", sku["cat2"] or "",
                        cat3_of(sku), w, PSI_TYPE, qty])
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        import csv as _csv
        w = _csv.writer(f)
        w.writerow(["country", "product", "product_sku", "category1", "category2", "category3",
                    "period_id", "psi_type", "qty"])
        w.writerows(out)
    print(f"MOCK PSI rows={len(out)} combos={len(set((r[0], r[1]) for r in out))} weeks={len(weeks)} -> {OUT}")

if __name__ == "__main__":
    main()
