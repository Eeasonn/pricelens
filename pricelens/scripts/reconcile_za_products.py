#!/usr/bin/env python3
"""Create auditable ZA booklet model mappings and model-level product rows.

The Vodacom booklet identifies a product model but does not provide a SKU
configuration. A unique existing SKU is reused where the catalogue has one
candidate. Ambiguous or new models receive a synthetic model-level SKU with
romram ``规格未标明``. This preserves the source granularity instead of
assigning a colour or memory variant that the booklet did not state.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PRODUCT_JSON = ROOT / "src" / "data" / "dim_product.json"
MAP_JSON = ROOT / "data" / "real" / "za_booklet_product_map.json"
DEFAULT_XLSX = Path("/tmp/codex-remote-attachments/01a1ba22-61a2-7f23-a829-c088607b8170/5A1CD1B6-C2A6-4205-B9C0-7DB931EB2AC2/1-ZA_VODACOM_manuals_2026-01_10_unified29_20261103.xlsx")
MODEL_LEVEL_ROMRAM = "规格未标明"

TIER_LADDERS = {
    "phone": ["<200", "200-400", "400-600", "600-800", "800-1000", "1000+"],
    "tablet": ["<150", "150-250", "250-350", "350-500", "500-800", "800+"],
    "wearable": ["<25", "25-75", "75-150", "150-300", "300-400", "400+"],
    "audio": ["<50", "50-100", "100-200", "200+"],
    "iot": ["<50", "50-100", "100-200", "200-400", "400+"],
    "pc": ["<500", "500-800", "800-1200", "1200+"],
}


def text(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def key(value: Any) -> str:
    raw = unicodedata.normalize("NFKD", text(value)).lower()
    raw = "".join(char for char in raw if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "", raw)


def industry_for(model: str, candidates: list[dict[str, Any]]) -> str:
    if candidates:
        return candidates[0].get("industry", "phone")
    value = model.lower()
    if any(token in value for token in ("buds", "earbud", "headphone", "speaker", "air pods", "airpods")):
        return "audio"
    if any(token in value for token in ("watch", "band", "fit", "ring")):
        return "wearable"
    if any(token in value for token in ("ipad", "pad", "tab", "macbook", "magicbook", "book")):
        return "tablet"
    return "phone"


def tier_for(industry: str, candidate: dict[str, Any] | None) -> str:
    ladder = TIER_LADDERS[industry]
    if candidate and candidate.get("tier_code") in ladder:
        return candidate["tier_code"]
    return {
        "phone": "<200",
        "tablet": "<150",
        "wearable": "<25",
        "audio": "50-100",
        "iot": "<50",
        "pc": "<500",
    }[industry]


def read_source_models(path: Path) -> list[tuple[str, str]]:
    frame = pd.read_excel(path, sheet_name="全量数据")
    columns = {str(column).split("\n", 1)[0].split("/", 1)[0].strip(): column for column in frame.columns}
    brand_col = columns.get("品牌")
    model_col = columns.get("型号")
    if not brand_col or not model_col:
        raise ValueError("全量数据缺少品牌或型号列")
    seen: dict[tuple[str, str], tuple[str, str]] = {}
    for _, row in frame.iterrows():
        brand, model = text(row.get(brand_col)), text(row.get(model_col))
        if brand and model:
            seen.setdefault((key(brand), key(model)), (brand, model))
    return list(seen.values())


def build(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    products = json.loads(PRODUCT_JSON.read_text(encoding="utf-8"))
    # Rebuild the generated model-level rows deterministically when the same
    # source workbook is ingested again. Existing catalogue rows remain intact.
    products = [product for product in products if not str(product.get("sku_id", "")).startswith("za-booklet-")]
    by_key: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for product in products:
        by_key[(key(product.get("brand")), key(product.get("model_name")))].append(product)

    mapping: list[dict[str, Any]] = []
    used_product_ids = {p["sku_id"] for p in products}
    for brand, model in read_source_models(path):
        candidates = by_key.get((key(brand), key(model)), [])
        if len(candidates) == 1:
            candidate = candidates[0]
            countries = list(candidate.get("countries") or [])
            if "ZA" not in countries:
                countries.append("ZA")
                candidate["countries"] = countries
            candidate.setdefault("tier_by_country", {})["ZA"] = candidate.get("tier_code", "300-400")
            mapping.append({
                "brand": brand,
                "model": model,
                "model_id": candidate["model_id"],
                "sku_id": candidate["sku_id"],
                "romram": candidate.get("romram") or "—",
                "match_status": "matched-model",
                "mapping_kind": "unique-existing-sku",
                "candidate_model_ids": sorted({c["model_id"] for c in candidates}),
                "candidate_sku_ids": [c["sku_id"] for c in candidates],
            })
            continue

        base = candidates[0] if candidates else None
        industry = industry_for(model, candidates)
        tier = tier_for(industry, base)
        model_id = f"za-booklet-{key(brand)}-{key(model)}"
        sku_id = f"{model_id}__booklet"
        if sku_id in used_product_ids:
            raise ValueError(f"ZA synthetic SKU collision: {sku_id}")
        used_product_ids.add(sku_id)
        product = {
            "sku_id": sku_id,
            "model_id": model_id,
            "industry": industry,
            "brand": brand,
            "is_own": brand == "HUAWEI",
            "series": base.get("series", model) if base else model,
            "model_name": model,
            "romram": MODEL_LEVEL_ROMRAM,
            "color": "—",
            "tier_code": tier,
            "ref_price_usd": base.get("ref_price_usd") if base else None,
            "launch_date": "2026-01-01",
            "eol_date": None,
            "first_week": "202601",
            "last_week": "202610",
            "countries": ["ZA"],
            "tier_by_country": {"ZA": tier},
        }
        products.append(product)
        by_key[(key(brand), key(model))].append(product)
        mapping.append({
            "brand": brand,
            "model": model,
            "model_id": model_id,
            "sku_id": sku_id,
            "romram": MODEL_LEVEL_ROMRAM,
            "match_status": "matched-model",
            "mapping_kind": "synthetic-model-sku" if not candidates else "ambiguous-model-sku",
            "candidate_model_ids": sorted({c["model_id"] for c in candidates}),
            "candidate_sku_ids": [c["sku_id"] for c in candidates],
        })

    payload = {
        "schema_version": "za-booklet-product-map-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_workbook": path.name,
        "rows": sorted(mapping, key=lambda row: (row["brand"], row["model"])),
    }
    return products, [payload]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    args = parser.parse_args()
    products, payloads = build(args.xlsx)
    PRODUCT_JSON.write_text(json.dumps(products, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    MAP_JSON.write_text(json.dumps(payloads[0], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"products": len(products), "mappings": len(payloads[0]["rows"]), "map": str(MAP_JSON)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
