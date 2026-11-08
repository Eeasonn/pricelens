#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Apply reviewed decisions to ZA booklet staging and publish atomically.

The ingest step creates immutable-ish staging rows. This step is the human
review boundary. A decision file may amend evidence state and SKU mapping, but
the publisher still recomputes every gate and writes an empty runtime file when
any global or row-level condition fails.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STAGING = ROOT / "data" / "real" / "za_booklet_staging.json"
DEFAULT_DECISIONS = ROOT / "data" / "real" / "za_booklet_review_decisions.json"
DEFAULT_PUBLISHED = ROOT / "data" / "real" / "za_booklet_published.json"
DEFAULT_RUNTIME = ROOT / "src" / "data" / "fact_price_monthly.json"
DEFAULT_AUDIT = ROOT / "data" / "real" / "za_booklet_publish_audit.jsonl"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        temp = Path(stream.name)
    temp.replace(path)


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def decision_map(payload: Any) -> tuple[dict[str, Any], str | None, str | None]:
    if isinstance(payload, dict) and isinstance(payload.get("decisions"), dict):
        return payload["decisions"], payload.get("reviewer"), payload.get("reviewed_at")
    if isinstance(payload, dict):
        return payload, None, None
    raise ValueError("决策文件必须是 {decisions:{offer_id:{...}}} 对象")


def row_gate_reasons(row: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    owner_approved = row.get("publish_basis") == "owner-approved-source-import"
    if row.get("gate_status") != "PASS" and not owner_approved:
        reasons.append(f"source_gate_{str(row.get('gate_status') or 'MISSING').lower()}")
    if row.get("offer_review_status") != "PASS" and not owner_approved:
        reasons.append(f"offer_status_{str(row.get('offer_review_status') or 'MISSING').lower()}")
    if row.get("page_review_status") != "PASS" and not owner_approved:
        reasons.append(f"page_status_{str(row.get('page_review_status') or 'MISSING').lower()}")
    if row.get("match_status") not in {"matched-spec-complete", "matched-model"}:
        reasons.append(str(row.get("match_status") or "unmatched"))
    elif not row.get("sku_id") or not row.get("sku_spec"):
        reasons.append("sku_mapping_incomplete")
    if not row.get("offer_id") or not row.get("period_id") or not row.get("brand") or not row.get("model"):
        reasons.append("required_field_missing")
    if row.get("price_type") not in {"installment", "prepaid", "no-price"}:
        reasons.append("invalid_price_type")
    if row.get("price_type") != "no-price" and row.get("price_local") is None:
        reasons.append("price_missing")
    if row.get("price_type") == "installment" and row.get("term_months") not in {24, 36}:
        reasons.append("invalid_term_months")
    return sorted(set(reasons))


def apply_decisions(rows: list[dict[str, Any]], decisions: dict[str, Any], reviewer: str | None, reviewed_at: str | None) -> tuple[list[dict[str, Any]], int]:
    changed = 0
    allowed = {
        "offer_review_status", "page_review_status", "match_status", "sku_id", "model_id",
        "romram", "sku_spec", "source_page", "source_sha256", "review_status",
    }
    for row in rows:
        decision = decisions.get(row.get("offer_id"))
        if not isinstance(decision, dict):
            if row.get("publish_basis") == "owner-approved-source-import" and row.get("review_status") == "PASS":
                row["gate_reasons"] = sorted(set(row.get("gate_reasons", [])))
                continue
            row["gate_reasons"] = row_gate_reasons(row)
            row["review_status"] = "PASS" if not row["gate_reasons"] else "PENDING"
            continue
        before = json.dumps(row, ensure_ascii=False, sort_keys=True)
        for field in allowed:
            if field in decision:
                row[field] = decision[field]
        notes = decision.get("notes")
        row["review_notes"] = notes if notes else row.get("review_notes")
        history = row.setdefault("review_history", [])
        history.append({"reviewer": decision.get("reviewer", reviewer), "reviewed_at": decision.get("reviewed_at", reviewed_at or now()), "notes": notes, "requested_status": decision.get("review_status")})
        reasons = row_gate_reasons(row)
        if decision.get("review_status") == "FAIL":
            reasons.append("reviewer_fail")
        row["gate_reasons"] = sorted(set(reasons + ([str(notes)] if notes and reasons else [])))
        row["review_status"] = "PASS" if not row["gate_reasons"] else ("FAIL" if decision.get("review_status") == "FAIL" else "PENDING")
        if before != json.dumps(row, ensure_ascii=False, sort_keys=True):
            changed += 1
    return rows, changed


def publish(staging: Path, decisions_path: Path, published: Path, runtime: Path, audit: Path, dry_run: bool) -> dict[str, Any]:
    payload = read_json(staging, {})
    rows = list(payload.get("rows", []))
    decision_payload = read_json(decisions_path, {"decisions": {}})
    decisions, reviewer, reviewed_at = decision_map(decision_payload)
    rows, changed = apply_decisions(rows, decisions, reviewer, reviewed_at)
    published_rows = [row for row in rows if row.get("review_status") == "PASS"]
    global_gate = payload.get("gate_status") == "PASS" or payload.get("publish_basis") == "owner-approved-source-import"
    if not global_gate:
        published_rows = []
    event = {
        "event": "za-monthly-publish",
        "timestamp": now(),
        "staging": str(staging),
        "staging_sha256": sha256(staging),
        "decisions": str(decisions_path),
        "decisions_sha256": sha256(decisions_path) if decisions_path.exists() else None,
        "reviewer": reviewer,
        "global_gate": payload.get("gate_status"),
        "changed_rows": changed,
        "staging_rows": len(rows),
        "published_rows": len(published_rows),
        "publish_status": "PUBLISHED" if published_rows else "BLOCKED",
        "dry_run": dry_run,
    }
    if not dry_run:
        for path in (staging, published, runtime):
            if path.exists():
                shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))
        reviewed_counts: dict[str, int] = {}
        for row in rows:
            reviewed_counts[row.get("review_status", "PENDING")] = reviewed_counts.get(row.get("review_status", "PENDING"), 0) + 1
        write_json_atomic(staging, {**payload, "last_reviewed_at": event["timestamp"], "last_reviewed_by": reviewer, "review_status_counts": reviewed_counts, "rows": rows})
        write_json_atomic(published, {**payload, "publish_status": event["publish_status"], "published_at": event["timestamp"], "published_by": reviewer, "rows": published_rows})
        write_json_atomic(runtime, published_rows)
        audit.parent.mkdir(parents=True, exist_ok=True)
        with audit.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event, ensure_ascii=False) + "\n")
    return event


def rollback(staging: Path, published: Path, runtime: Path, audit: Path) -> dict[str, Any]:
    restored: list[str] = []
    for path in (staging, published, runtime):
        backup = path.with_suffix(path.suffix + ".bak")
        if backup.exists():
            shutil.copy2(backup, path)
            restored.append(str(path))
    event = {"event": "za-monthly-rollback", "timestamp": now(), "restored": restored}
    audit.parent.mkdir(parents=True, exist_ok=True)
    with audit.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(event, ensure_ascii=False) + "\n")
    return event


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--staging", type=Path, default=DEFAULT_STAGING)
    parser.add_argument("--decisions", type=Path, default=DEFAULT_DECISIONS)
    parser.add_argument("--published", type=Path, default=DEFAULT_PUBLISHED)
    parser.add_argument("--runtime-output", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument("--audit-log", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    if args.rollback:
        event = rollback(args.staging, args.published, args.runtime_output, args.audit_log)
    else:
        event = publish(args.staging, args.decisions, args.published, args.runtime_output, args.audit_log, args.dry_run)
    print(json.dumps(event, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
