# -*- coding: utf-8 -*-
"""就地修补 src/data/dim_product.json 的竞品 series（第一百一十七轮）。

用 series_rules.comp_series 重算全部非我司行的 series（我司行已有真实系列，
不动）。可在未来维表数据更新后重复执行（幂等）。用法：
    python3 scripts/patch_comp_series.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from series_rules import comp_series  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "src", "data", "dim_product.json")


def main() -> None:
    with open(PATH, encoding="utf-8") as f:
        rows = json.load(f)
    changed = 0
    groups = {}
    for r in rows:
        if r.get("is_own"):
            continue
        new = comp_series(r["brand"], r["model_name"])
        if new != r["series"]:
            r["series"] = new
            changed += 1
        groups.setdefault(new, set()).add(r["model_name"])
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    multi = sorted(((s, len(m)) for s, m in groups.items() if len(m) > 1), key=lambda x: -x[1])
    print(f"竞品行 {sum(1 for r in rows if not r.get('is_own'))} 条，series 改写 {changed} 条")
    print(f"系列组 {len(groups)} 个（多型号组 {len(multi)} 个）：")
    for s, n in multi[:20]:
        print(f"  {s}: {n} 型号")


if __name__ == "__main__":
    main()
