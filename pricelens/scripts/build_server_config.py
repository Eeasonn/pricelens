#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
服务器预置 config.json 生成器（2026-11-19 部署开箱即用）：
与 build_handoff_config.py 同源（仓库权威常量/dim_*.json），输出 server
config.json 形态（seriesRules/modelAliases/tierLadders/promoRows/benchmarkMatrix
/dictionaries 六段）——bundle 装配时预置进 data/，内部起服务器即带全量规则
（零内置语义下规则唯一源开箱即带，无需先手动导配置表）。

用法：python3 scripts/build_server_config.py [输出路径]
  缺省输出 server/data/config.json 模板位（开发态）；bundle 装配传部署路径。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # pricelens/
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "server"))

import ingest_real  # noqa: E402
import series_rules  # noqa: E402
import ingest_pack  # noqa: E402


def build_config():
    with open(os.path.join(ROOT, "data", "real", "overrides.json"), encoding="utf-8") as f:
        overrides = json.load(f)
    with open(os.path.join(ROOT, "src", "data", "dim_benchmark.json"), encoding="utf-8") as f:
        benchmark = json.load(f)
    with open(os.path.join(ROOT, "src", "data", "dim_promo.json"), encoding="utf-8") as f:
        promos = json.load(f)
    return {
        "seriesRules": (
            [{"brand": "HUAWEI", "pattern": prefix, "series": series}
             for prefix, series in ingest_real.OWN_SERIES_RULES]
            + [{"brand": brand, "pattern": f"re:{rx}", "series": template}
               for brand, rx, template in series_rules._RULES]
        ),
        "modelAliases": [
            {"brand": key.split("|")[0], "from": key.split("|")[1], "to": target}
            for key, target in (overrides.get("model_aliases") or {}).items()
        ],
        "tierLadders": ingest_real.TIER_LADDERS,
        "promoRows": [
            {"promo_id": p["promo_id"], "country_code": p["country_code"],
             "promo_name": p["promo_name"], "start_date": p["start_date"],
             "end_date": p["end_date"], "depth_hint": p.get("depth_hint") or "深",
             "platforms": p.get("platforms")}
            for p in promos
        ],
        "benchmarkMatrix": [
            {"country_code": b.get("country_code"), "own_model_id": b["own_model_id"],
             "own_romram": b.get("own_romram") or "", "competitor_sku_id": b["competitor_sku_id"],
             "sort": b.get("sort") or 0}
            for b in benchmark
        ],
        "dictionaries": {
            "countryCodes": ingest_pack.COUNTRY_CODES,
            "platformAliases": ingest_pack.PLATFORM_ALIASES,
            "storeAliases": ingest_pack.STORE_ALIASES,
            "industryOfCat": ingest_pack.INDUSTRY_OF_CAT,
        },
    }


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "server", "data", "config.json")
    config = build_config()
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, separators=(",", ":"))
    counts = {
        "seriesRules": len(config["seriesRules"]),
        "modelAliases": len(config["modelAliases"]),
        "tierLadders": len(config["tierLadders"]),
        "promoRows": len(config["promoRows"]),
        "benchmarkMatrix": len(config["benchmarkMatrix"]),
        "countryCodes": len(config["dictionaries"]["countryCodes"]),
    }
    print(f"[build_server_config] {out_path}")
    print(f"[build_server_config] {counts}")


if __name__ == "__main__":
    main()
