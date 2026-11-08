#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build an auditable staging set for South Africa's monthly Vodacom booklets.

The workbook contains two different levels of detail. ``全量数据`` is the
row-level source used for staging, while ``复核台账`` and ``页面审计`` provide
review state and provenance.  The script keeps every source row, normalizes
the monthly fact contract, and writes a publishable subset only when all
review gates pass.  It deliberately does not write the weekly real fact pack.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
DEFAULT_XLSX = Path("/tmp/codex-remote-attachments/01a1ba22-61a2-7f23-a829-c088607b8170/5A1CD1B6-C2A6-4205-B9C0-7DB931EB2AC2/1-ZA_VODACOM_manuals_2026-01_10_unified29_20261103.xlsx")
DEFAULT_STAGING = ROOT / "data" / "real" / "za_booklet_staging.json"
DEFAULT_PUBLISHED = ROOT / "data" / "real" / "za_booklet_published.json"
DEFAULT_REPORT = ROOT / "data" / "real" / "za_booklet_ingest_report.md"
DEFAULT_RUNTIME = ROOT / "src" / "data" / "fact_price_monthly.json"
PRODUCT_JSON = ROOT / "src" / "data" / "dim_product.json"
PRODUCT_MAP_JSON = ROOT / "data" / "real" / "za_booklet_product_map.json"


def normalized_header(value: Any) -> str:
    return str(value).split("\n", 1)[0].split("/", 1)[0].strip()


def read_sheet(book: pd.ExcelFile, name: str) -> pd.DataFrame:
    frame = book.parse(name)
    frame = frame.rename(columns={column: normalized_header(column) for column in frame.columns})
    return frame


def text(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)) or pd.isna(value):
        return None
    result = str(value).strip()
    return result or None


def number(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)) or pd.isna(value):
        return None
    parsed = pd.to_numeric(value, errors="coerce")
    return None if pd.isna(parsed) else float(parsed)


def integer(value: Any) -> int | None:
    parsed = number(value)
    return None if parsed is None else int(parsed)


def key(value: Any) -> str:
    raw = unicodedata.normalize("NFKD", text(value) or "").lower()
    raw = "".join(char for char in raw if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "", raw)


def offer_id_of(value: Any) -> str | None:
    match = re.search(r"(VDC-\d{4}-\d{2}-P\d+-O\d+)", text(value) or "")
    return match.group(1) if match else None


def page_id_of(offer_id: str | None) -> str | None:
    return re.sub(r"-O\d+$", "", offer_id) if offer_id else None


def period_id_of(value: Any) -> str | None:
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.strftime("%Y%m")


def price_type_of(value: Any) -> str:
    label = text(value) or ""
    if "无价格" in label:
        return "no-price"
    if "一次性" in label or "买断" in label or "预付" in label:
        return "prepaid"
    return "installment"


def term_months_of(value: Any) -> int | None:
    label = text(value) or ""
    match = re.search(r"(24|36)", label)
    return int(match.group(1)) if match else None


def source_page_of(value: Any) -> int | None:
    match = re.search(r"page\s*=\s*(\d+)|p\.?\s*(\d+)", text(value) or "", re.I)
    if not match:
        return None
    return int(next(group for group in match.groups() if group is not None))


def load_product_candidates() -> dict[tuple[str, str], list[dict[str, Any]]]:
    if not PRODUCT_JSON.exists():
        return {}
    products = json.loads(PRODUCT_JSON.read_text(encoding="utf-8"))
    candidates: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for product in products:
        candidates[(key(product.get("brand")), key(product.get("model_name")))].append(product)
    return candidates


def match_product(
    brand: Any,
    model: Any,
    sku_spec: Any,
    candidates: dict[tuple[str, str], list[dict[str, Any]]],
    mapped: dict[str, Any] | None = None,
) -> dict[str, Any]:
    brand_key = key(brand)
    model_key = key(model)
    if mapped is not None:
        return {
            "match_status": mapped.get("match_status", "matched-model"),
            "model_id": mapped.get("model_id"),
            "romram": mapped.get("romram"),
            "sku_id": mapped.get("sku_id"),
            "candidate_model_ids": mapped.get("candidate_model_ids", []),
            "candidate_sku_ids": mapped.get("candidate_sku_ids", []),
        }
    hits = candidates.get((brand_key, model_key), [])
    if not hits:
        return {
            "match_status": "unmatched",
            "model_id": None,
            "romram": None,
            "sku_id": None,
            "candidate_model_ids": [],
            "candidate_sku_ids": [],
        }
    candidate_model_ids = sorted({item["model_id"] for item in hits})
    model_id = candidate_model_ids[0] if len(candidate_model_ids) == 1 else None
    candidate_sku_ids = [item["sku_id"] for item in hits]
    spec = text(sku_spec)
    if not spec:
        return {
            "match_status": "pending-spec",
            "model_id": model_id,
            "romram": None,
            "sku_id": None,
            "candidate_model_ids": candidate_model_ids,
            "candidate_sku_ids": candidate_sku_ids,
        }
    spec_key = key(spec)
    spec_hits = [item for item in hits if key(item.get("romram")) == spec_key]
    if len(spec_hits) == 1:
        return {
            "match_status": "matched-spec-complete",
            "model_id": spec_hits[0]["model_id"],
            "romram": spec_hits[0]["romram"],
            "sku_id": spec_hits[0]["sku_id"],
            "candidate_model_ids": candidate_model_ids,
            "candidate_sku_ids": candidate_sku_ids,
        }
    return {
        "match_status": "unmatched",
        "model_id": model_id,
        "romram": None,
        "sku_id": None,
        "candidate_model_ids": candidate_model_ids,
        "candidate_sku_ids": candidate_sku_ids,
    }


def gate_status_of(stats: pd.DataFrame) -> str:
    for _, row in stats.iterrows():
        if key(row.get("统计项")) == "gatestatus":
            return (text(row.get("值")) or "FAIL").upper()
    return "FAIL"


def review_status_of(
    *,
    gate_status: str,
    offer_status: str | None,
    page_status: str | None,
    match_status: str,
    required_ok: bool,
    owner_approved: bool = False,
) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if gate_status != "PASS":
        reasons.append(f"source_gate_{gate_status.lower()}")
    if offer_status != "PASS" and not owner_approved:
        reasons.append(f"offer_status_{(offer_status or 'MISSING').lower()}")
    if page_status != "PASS" and not owner_approved:
        reasons.append(f"page_status_{(page_status or 'MISSING').lower()}")
    if match_status not in {"matched-spec-complete", "matched-model"}:
        reasons.append(match_status)
    if not required_ok:
        reasons.append("required_field_missing")
    if not required_ok:
        return "FAIL", reasons
    return ("PASS", reasons) if not reasons else ("PENDING", reasons)


def load_product_map() -> dict[tuple[str, str], dict[str, Any]]:
    if not PRODUCT_MAP_JSON.exists():
        return {}
    payload = json.loads(PRODUCT_MAP_JSON.read_text(encoding="utf-8"))
    rows = payload.get("rows", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return {}
    return {
        (key(row.get("brand")), key(row.get("model"))): row
        for row in rows
        if isinstance(row, dict) and key(row.get("brand")) and key(row.get("model"))
    }


def build_records(workbook_path: Path, owner_approved: bool = False) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    book = pd.ExcelFile(workbook_path)
    required_sheets = {"全量数据", "复核台账", "报价明细", "页面审计", "统计"}
    missing = sorted(required_sheets - set(book.sheet_names))
    if missing:
        raise ValueError(f"南非小册子缺少页签：{', '.join(missing)}")

    all_data = read_sheet(book, "全量数据")
    ledger = read_sheet(book, "复核台账")
    details = read_sheet(book, "报价明细")
    pages = read_sheet(book, "页面审计")
    stats = read_sheet(book, "统计")
    candidates = load_product_candidates()
    product_map = load_product_map()

    ledger_by_offer = {
        text(row["报价ID"]): row
        for _, row in ledger.iterrows()
        if text(row.get("报价ID"))
    }
    detail_by_offer: dict[str, list[pd.Series]] = defaultdict(list)
    for _, row in details.iterrows():
        offer_id = text(row.get("报价ID"))
        if offer_id:
            detail_by_offer[offer_id].append(row)
    page_by_id = {
        text(row["页面ID"]): row
        for _, row in pages.iterrows()
        if text(row.get("页面ID"))
    }
    gate_status = gate_status_of(stats)
    records: list[dict[str, Any]] = []

    for source_index, (_, row) in enumerate(all_data.iterrows(), start=2):
        offer_id = offer_id_of(row.get("截图命名"))
        ledger_row = ledger_by_offer.get(offer_id or "")
        page_row = page_by_id.get(page_id_of(offer_id) or "")
        price_type = price_type_of(row.get("分期付款"))
        details_for_offer = detail_by_offer.get(offer_id or "", [])
        detail_row = next(
            (
                candidate
                for candidate in details_for_offer
                if price_type_of(candidate.get("价格类型")) == price_type
            ),
            details_for_offer[0] if details_for_offer else None,
        )
        sku_spec = text(row.get("型号规格")) or text(ledger_row.get("型号规格") if ledger_row is not None else None)
        match = match_product(
            row.get("品牌"),
            row.get("型号"),
            sku_spec,
            candidates,
            product_map.get((key(row.get("品牌")), key(row.get("型号")))),
        )
        if owner_approved and match["match_status"] == "matched-model" and not sku_spec:
            sku_spec = match.get("romram") or "—"
        price_local = number(row.get("平台成交价-本币"))
        if price_local is None and detail_row is not None:
            price_local = number(detail_row.get("价格ZAR"))
        rrp_local = number(row.get("平台建议零售价-本币"))
        if rrp_local is None and detail_row is not None:
            rrp_local = number(detail_row.get("原价ZAR"))
        fx_rate = number(row.get("汇率"))
        if fx_rate is None and detail_row is not None:
            fx_rate = number(detail_row.get("月汇率"))
        price_usd = number(row.get("平台成交价-美金"))
        if price_usd is None and detail_row is not None:
            price_usd = number(detail_row.get("折USD"))
        term_months = term_months_of(row.get("分期付款"))
        if term_months is None and detail_row is not None:
            term_months = integer(detail_row.get("分期期数"))

        offer_status = text(ledger_row.get("状态") if ledger_row is not None else None)
        page_status = text(page_row.get("页面处置") if page_row is not None else None)
        period_id = period_id_of(row.get("时间周期")) or text(detail_row.get("采集月份") if detail_row is not None else None)
        required_ok = bool(
            offer_id
            and period_id
            and text(row.get("品牌"))
            and text(row.get("型号"))
            and price_type in {"installment", "prepaid", "no-price"}
            and (price_type == "no-price" or price_local is not None)
            and (price_type != "installment" or term_months in {24, 36})
        )
        review_status, generated_reasons = review_status_of(
            gate_status=gate_status,
            offer_status=offer_status,
            page_status=page_status,
            match_status=match["match_status"],
            required_ok=required_ok,
            owner_approved=owner_approved,
        )
        if owner_approved and required_ok and match["match_status"] in {"matched-spec-complete", "matched-model"}:
            review_status = "PASS"
            generated_reasons = ["owner_approved_source_import", *generated_reasons]
        source_page_ref = text(detail_row.get("证据") if detail_row is not None else None) or text(ledger_row.get("源页") if ledger_row is not None else None)
        source_document = text(page_row.get("源PDF") if page_row is not None else None)
        source_sha256 = text(page_row.get("源SHA256") if page_row is not None else None)
        source_page = integer(page_row.get("页码") if page_row is not None else None) or source_page_of(source_page_ref)
        original_reasons = [
            part.strip()
            for part in (text(ledger_row.get("复核要求") if ledger_row is not None else None) or "").split("/")
            if part.strip()
        ]
        records.append(
            {
                "source_row": source_index,
                "source_workbook": workbook_path.name,
                "offer_id": offer_id,
                "period_id": period_id,
                "country_code": "ZA",
                "platform": text(row.get("平台")) or "VODACOM SHOP",
                "store_type": text(row.get("店铺类型")) or "1P",
                "brand": text(row.get("品牌")),
                "model": text(row.get("型号")),
                "sku_spec": sku_spec,
                "model_id": match["model_id"],
                "romram": match["romram"],
                "sku_id": match["sku_id"],
                "candidate_model_ids": match["candidate_model_ids"],
                "candidate_sku_ids": match["candidate_sku_ids"],
                "match_status": match["match_status"],
                "price_type": price_type,
                "price_local": price_local,
                "currency": text(row.get("货币")) or "ZAR",
                "fx_rate": fx_rate,
                "price_usd": price_usd,
                "rrp_local": rrp_local,
                "term_months": term_months,
                "offer_review_status": offer_status,
                "page_review_status": page_status,
                "review_status": review_status,
                "gate_status": gate_status,
                "source_gate_status": gate_status,
                "publish_basis": "owner-approved-source-import" if owner_approved else "review-gated",
                "gate_reasons": sorted(set(original_reasons + generated_reasons)),
                "source_document": source_document,
                "source_page": source_page,
                "source_sha256": source_sha256,
                "source_page_ref": source_page_ref,
                "source_url": text(row.get("网址链接")),
                "source_screenshot": text(row.get("截图命名")),
                "promotion_text": text(row.get("促销政策")),
                "installment_text": text(row.get("分期付款")),
                "bundle": text(row.get("是否组合销售")) in {"Y", "YES", "TRUE", "是"},
            }
        )

    return {
        "schema_version": "za-operator-booklet-staging-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_workbook": workbook_path.name,
        "source_sheets": book.sheet_names,
        "gate_status": gate_status,
        "source_gate_status": gate_status,
        "publish_basis": "owner-approved-source-import" if owner_approved else "review-gated",
    }, records


def write_outputs(
    metadata: dict[str, Any],
    records: list[dict[str, Any]],
    staging: Path,
    published: Path,
    report: Path,
    runtime_output: Path,
    owner_approved: bool = False,
) -> None:
    staging.parent.mkdir(parents=True, exist_ok=True)
    counts = Counter(record["review_status"] for record in records)
    price_types = Counter(record["price_type"] for record in records)
    match_statuses = Counter(record["match_status"] for record in records)
    offers = {record["offer_id"] for record in records if record["offer_id"]}
    published_rows = [record for record in records if record["review_status"] == "PASS"]
    published_payload = {
        **metadata,
        "publish_status": "PUBLISHED" if published_rows else "BLOCKED",
        "rows": published_rows,
    }
    staging_payload = {
        **metadata,
        "publish_status": "PUBLISHED" if published_rows else "BLOCKED",
        "row_count": len(records),
        "offer_count": len(offers),
        "priced_row_count": sum(record["price_type"] != "no-price" for record in records),
        "no_price_row_count": sum(record["price_type"] == "no-price" for record in records),
        "review_status_counts": dict(counts),
        "price_type_counts": dict(price_types),
        "match_status_counts": dict(match_statuses),
        "rows": records,
    }
    staging.write_text(json.dumps(staging_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    published.write_text(json.dumps(published_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    runtime_output.parent.mkdir(parents=True, exist_ok=True)
    runtime_output.write_text(json.dumps(published_rows, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    reasons = Counter(reason for record in records for reason in record["gate_reasons"])
    lines = [
        "# ZA Vodacom 小册子导入报告",
        "",
        f"生成时间：{metadata['generated_at']}",
        f"源文件：{metadata['source_workbook']}",
        f"门禁状态：{metadata['gate_status']}",
        "",
        "## 结果",
        "",
        f"- 全量数据行：{len(records):,}",
        f"- offer 数：{len(offers):,}",
        f"- 有价记录：{sum(record['price_local'] is not None for record in records):,}",
        f"- 无价格记录：{sum(record['price_local'] is None for record in records):,}",
        f"- 发布行：{len(published_rows):,}",
        f"- 发布状态：{'PUBLISHED' if published_rows else 'BLOCKED'}",
        f"- 复核状态：{dict(counts)}",
        f"- 价格类型：{dict(price_types)}",
        f"- SKU 匹配：{dict(match_statuses)}",
        "",
        "## 发布条件",
        "",
        "每条记录同时满足以下条件才进入 published 文件。",
        "",
        "- 源统计页 gate_status 为 PASS，或使用已记录的 owner-approved-source-import 发布方式。",
        "- 复核台账 offer 状态为 PASS。",
        "- 页面审计 review_status 为 PASS。",
        "- 型号能够匹配到唯一 SKU，或使用带来源记录的型号级 ZA 小册子 SKU。",
        "- 月供记录为 24 或 36 期，有价格记录可有价发布。",
        "- 无价格记录保留在 staging，不能作为零价发布。",
        "",
        "## 阻断原因",
        "",
    ]
    lines.extend(f"- {reason}：{count:,} 行" for reason, count in reasons.most_common())
    lines += [
        "",
        "原始附件的其他页签保留为证据和复核依据，不作为事实源写入 weekly real fact pack。",
        f"发布方式：{'owner-approved-source-import' if owner_approved else 'review-gated'}。",
        "月度发布应由后续 FactPriceMonthly 读取 published 文件，继续保留 period_id、term_months、price_type 和 source provenance。",
        f"当前 runtime monthly facts：{runtime_output}（{len(published_rows):,} 行）。",
    ]
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--staging", type=Path, default=DEFAULT_STAGING)
    parser.add_argument("--published", type=Path, default=DEFAULT_PUBLISHED)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--runtime-output", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument(
        "--owner-approved",
        action="store_true",
        help="按产品负责人确认的真实小册子源导入月度事实，保留原始 gate/status 字段和发布依据。",
    )
    args = parser.parse_args()
    metadata, records = build_records(args.xlsx, owner_approved=args.owner_approved)
    write_outputs(metadata, records, args.staging, args.published, args.report, args.runtime_output, owner_approved=args.owner_approved)
    print(json.dumps({
        "staging": str(args.staging),
        "published": str(args.published),
        "report": str(args.report),
        "runtime_output": str(args.runtime_output),
        "rows": len(records),
        "published_rows": sum(record["review_status"] == "PASS" for record in records),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
