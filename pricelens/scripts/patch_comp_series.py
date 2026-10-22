# -*- coding: utf-8 -*-
"""就地修补 src/data/dim_product.json 的 series（第一百一十七轮立，第一百三十二轮扩）。

竞品行：用 series_rules.comp_series 重算（多系列品牌按产品线成组、苹果按代际）。
我司行：竞品规则不覆盖，仅按 OWN_TABLET_SERIES 把平板子线名补齐 MatePad 家族前缀
（Pro/Air/mini/SE/数字 → MatePad Pro/MatePad Air/…，与 ingest_real.OWN_SERIES_RULES
同口径——那边管再生成，这边管已入库数据）。可在未来维表数据更新后重复执行（幂等）。用法：
    python3 scripts/patch_comp_series.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from series_rules import comp_series  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "src", "data", "dim_product.json")

# 我司平板：旧子线名 → MatePad 家族名（industry=tablet 才适用；第一百三十二轮）
OWN_TABLET_SERIES = {
    "Pro": "MatePad Pro",
    "Air": "MatePad Air",
    "mini": "MatePad mini",
    "SE": "MatePad SE",
    "数字": "MatePad 数字系列",
}


def main() -> None:
    with open(PATH, encoding="utf-8") as f:
        rows = json.load(f)
    changed = 0
    own_changed = 0
    groups = {}
    for r in rows:
        if r.get("is_own"):
            if r.get("industry") == "tablet" and r["series"] in OWN_TABLET_SERIES:
                r["series"] = OWN_TABLET_SERIES[r["series"]]
                own_changed += 1
            continue
        new = comp_series(r["brand"], r["model_name"])
        if new != r["series"]:
            r["series"] = new
            changed += 1
        groups.setdefault(new, set()).add(r["model_name"])
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    multi = sorted(((s, len(m)) for s, m in groups.items() if len(m) > 1), key=lambda x: -x[1])
    print(f"竞品行 {sum(1 for r in rows if not r.get('is_own'))} 条，series 改写 {changed} 条；我司平板改写 {own_changed} 条")
    print(f"系列组 {len(groups)} 个（多型号组 {len(multi)} 个）：")
    for s, n in multi[:20]:
        print(f"  {s}: {n} 型号")


if __name__ == "__main__":
    main()
