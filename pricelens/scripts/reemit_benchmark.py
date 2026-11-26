# -*- coding: utf-8 -*-
"""对标行按最终维表重发（2026-11-25）：不重跑 ingest 全链，只把 dim_benchmark.json 里
指定产业的行按「最终 dim_product + data/real/matrix_resolution.json」重新配对。

为什么需要：pair_configs 改规则后要重生对标行，但全链重跑会连带重置 ZA 小册子层
（ingest_real 排在小册子步骤之前，之后的步骤都不补发对标行）。本脚本复用主管线的
emit_matrix_bench / cap_bench（ingest_real 模块级，单一实现），只镜像 main() 里
「分国块 → 默认块 × 有数国家」两遍矩阵循环；读最终维表，所以小册子后进来的 SKU
也能配上对标。

行为：只替换 --industries 产业（按我司型号的产业判定）的配置组，其余行原样保留、
顺序不变；新出现的配置组插在同我司型号最后一组之后。幂等：重复执行结果不变。

用法：
    python3 scripts/reemit_benchmark.py              # 重发手机/平板行并写回
    python3 scripts/reemit_benchmark.py --dry-run    # 只打印差异，不写文件
    python3 scripts/reemit_benchmark.py --industries phone,tablet,wearable,audio
"""
import argparse
import base64
import gzip
import json
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # pricelens/
sys.path.insert(0, HERE)

import ingest_real as ir  # noqa: E402

DEFAULT_RESOLUTION = os.path.join(ROOT, "data", "real", "matrix_resolution.json")
DEFAULT_INDUSTRIES = "phone,tablet"


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_jsonl(path):
    """单行 JSON 文件原文（写回时保持管线同款紧凑格式）。"""
    with open(path, encoding="utf-8") as f:
        return f.read()


def weeks_of_pack(pack_path):
    """SKU_CC_WEEKS 等价物：(sku_id, cc) → 有数周数（= main() 的 raw.groupby(...).week_id.nunique()）。"""
    with open(pack_path, encoding="ascii") as f:
        pack = json.loads(gzip.decompress(base64.b64decode(f.read().strip())))
    seen = set()
    for w, s, h in zip(pack["cols"]["w"], pack["cols"]["s"], pack["cols"]["h"]):
        seen.add((pack["skus"][s], pack["channels"][h].split(":")[0], pack["weeks"][w]))
    return dict(Counter((s, cc) for s, cc, _ in seen))


def reemit(products, resolution, weeks):
    """镜像 ingest_real.main() 的两遍矩阵循环 + 对标上限 → (截断后对标行, 诊断)。
    两处须同步改：main()「第一遍：分国块」「第二遍：默认块 × 有数据国家」。"""
    ir.DIM_PRODUCT = products
    ir.SKU_CC_WEEKS = weeks
    bench = []
    declared_own = set()
    country_entries = [e for e in resolution if not e.get("default")]
    default_entries = [e for e in resolution if e.get("default")]

    for e in country_entries:  # 第一遍：分国块（显式声明优先）
        cc = e.get("country_code")
        ind = ir.INDUSTRY_OF_CN.get(e.get("industry") or "")
        own_mids = [o["model_id"] for o in e.get("own") or []]
        if not cc or not ind or not e.get("own_raw"):
            continue
        if ir.parse_tier_text(e.get("tier") or ""):
            for om in own_mids:
                declared_own.add((cc, om))
        ir.emit_matrix_bench(own_mids, e["comps"], cc, ind, bench)

    data_ccs = sorted({cc for p in products for cc in p["countries"]})
    for e in default_entries:   # 第二遍：默认块 × 有数国家（分国块已声明的让位）
        ind = ir.INDUSTRY_OF_CN.get(e.get("industry") or "")
        if not ind or not e.get("own_raw"):
            continue
        for om in [o["model_id"] for o in e.get("own") or []]:
            for cc in data_ccs:
                if (cc, om) not in declared_own:
                    ir.emit_matrix_bench([om], e["comps"], cc, ind, bench)

    capped, trimmed, over_groups = ir.cap_bench(bench)
    return capped, {"emitted": len(bench), "trimmed": trimmed, "overCapGroups": over_groups}


def group_key(b):
    return (b["country_code"], b["own_model_id"], b["own_romram"])


def merge(committed, fresh, industries, industry_of_own):
    """committed 里我司型号属 industries 的配置组换成 fresh 的同名组；其余行原样保留、
    顺序不变；fresh 新出现的组插在同我司型号最后一组之后（没有则追加文末）。
    → (合并后列表, 被替换的组数, 新增的组数)"""
    fresh_groups = {}
    for b in fresh:
        fresh_groups.setdefault(group_key(b), []).append(b)
    target = {k for k in fresh_groups if industry_of_own.get(k[1]) in industries}

    # committed 按块切分（同键的连续行为一块；管线产物与 merge 输出都保证同键连续）
    blocks = []
    for b in committed:
        k = group_key(b)
        if blocks and blocks[-1][0] == k:
            blocks[-1][1].append(b)
        else:
            blocks.append((k, [b]))
    seen = {k for k, _ in blocks}
    # 新组：排到同我司型号第一段连续块之后（保持与该型号其余配置相邻），型号无块则追加文末
    pending = {}
    for k, rows in fresh_groups.items():
        if k in target and k not in seen:
            pending.setdefault(k[1], []).append((k, rows))

    out, placed = [], set()

    def place(model):
        for k, rows in pending.get(model, []):
            if k not in placed:
                out.extend(rows)
                placed.add(k)

    for i, (k, rows) in enumerate(blocks):
        out.extend(fresh_groups[k] if k in target else rows)
        if i + 1 == len(blocks) or blocks[i + 1][0][1] != k[1]:
            place(k[1])
    for model in pending:
        place(model)
    replaced = len(seen & target)
    added = len(placed)
    return out, replaced, added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=os.path.join(ROOT, "src", "data"))
    ap.add_argument("--resolution", default=DEFAULT_RESOLUTION)
    ap.add_argument("--industries", default=DEFAULT_INDUSTRIES,
                    help="重发哪些产业的行（按我司型号产业判定），逗号分隔")
    ap.add_argument("--dry-run", action="store_true", help="只打印差异，不写文件")
    args = ap.parse_args()
    industries = {x.strip() for x in args.industries.split(",") if x.strip()}

    products = load_json(os.path.join(args.data_dir, "dim_product.json"))
    resolution = load_json(args.resolution)
    weeks = weeks_of_pack(os.path.join(args.data_dir, "fact_pack_gzip.b64.txt"))
    bench_path = os.path.join(args.data_dir, "dim_benchmark.json")
    raw_text = load_jsonl(bench_path)
    committed = json.loads(raw_text)
    by_sku = {p["sku_id"]: p for p in products}
    industry_of_own = {p["model_id"]: p["industry"] for p in products if p.get("is_own")}

    fresh, diag = reemit(products, resolution, weeks)
    merged, replaced, added = merge(committed, fresh, industries, industry_of_own)

    def by_ind(rows):
        return Counter(by_sku[b["competitor_sku_id"]]["industry"] for b in rows)

    before, after = by_ind(committed), by_ind(merged)
    print(f"[reemit] 全量重发 {diag['emitted']} 行（上限截断 {diag['trimmed']} 条 / 超限 {diag['overCapGroups']} 组）"
          f" → 按产业替换 {'/'.join(sorted(industries))}：{len(committed)} 行 → {len(merged)} 行"
          f"（替换 {replaced} 组 / 新增 {added} 组）")
    for ind in sorted(set(before) | set(after)):
        if before.get(ind, 0) != after.get(ind, 0):
            print(f"  {ind}: {before.get(ind, 0)} → {after.get(ind, 0)}")

    old_groups, new_groups = defaultdict(list), defaultdict(list)
    for b in committed:
        old_groups[group_key(b)].append(b)
    for b in merged:
        new_groups[group_key(b)].append(b)
    changed = [k for k in new_groups if k in old_groups
               and sorted(b["competitor_sku_id"] for b in old_groups[k]) != sorted(b["competitor_sku_id"] for b in new_groups[k])]
    print(f"  竞品 SKU 集合发生变化的我司配置组：{len(changed)}；"
          f"其中前端可见（每配置前 3 款）变化："
          f"{sum(1 for k in changed if sorted(b['competitor_sku_id'] for b in sorted(old_groups[k], key=lambda x: x['sort'])[:3]) != sorted(b['competitor_sku_id'] for b in sorted(new_groups[k], key=lambda x: x['sort'])[:3]))}")

    text = json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
    if raw_text.endswith("\n"):
        text += "\n"
    if args.dry_run:
        print("[reemit] --dry-run：未写文件")
        return 0
    if text == raw_text:
        print("[reemit] 与现有 dim_benchmark.json 一致，未写文件")
        return 0
    ir.write_atomic(bench_path, text)
    print(f"[reemit] 已写回 {os.path.relpath(bench_path, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
