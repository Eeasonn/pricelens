#!/usr/bin/env python3
# ============================================================
# 默认平台店铺「冷启动预填」生成脚本（python3 scripts/prefill_default_shops.py，纯 stdlib）
#
# 规则（2026-10-22 Eason 已批准）：某国默认店铺 = 该国默认平台（dim_region.default_platform）
# 下「有事实价行数最多」的渠道（数据最全 = 主店；并列取 channel_id 字典序最小）。
# 事实行数从事实包统计：src/data/fact_pack_gzip.b64.txt（base64 → gzip → 列式 JSON，
# 解码方式与 src/data/index.ts / scripts/ingest_real.py 同一布局）。
#
# 产物：src/data/dim_default_channel.json —— {"RU":"RU:dns:独立站", ...}
#   另含 "_comment" 字段记录生成规则与日期（非国家码，应用侧查询天然不命中）。
# 应用侧：src/dataModel/aggregate.ts defaultChannelOf 回退链第 2 级（人工覆盖 → 预填 → null）。
#
# 注意：ingest_real.py 不重建本文件。事实包重接后需重跑本脚本刷新预填
# （scripts/verify.mjs 内置预填一致性断言会在漂移时报错）。
# ============================================================
import argparse
import base64
import collections
import gzip
import json
import os
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description="生成 dim_default_channel.json（默认平台店铺预填）")
    ap.add_argument("--data-dir", default=os.path.join(ROOT, "src", "data"))
    ap.add_argument("--dry-run", action="store_true", help="只打印结果表，不写文件")
    args = ap.parse_args()

    dd = args.data_dir
    regions = load(os.path.join(dd, "dim_region.json"))
    dim_ch = load(os.path.join(dd, "dim_channel.json"))
    with open(os.path.join(dd, "fact_pack_gzip.b64.txt"), encoding="ascii") as f:
        pack = json.loads(gzip.decompress(base64.b64decode(f.read().strip())).decode("utf-8"))

    channels = pack["channels"]
    col_p = pack["cols"]["p"]
    col_h = pack["cols"]["h"]

    # 事实包外键自检：渠道索引必须都在维表内（与 verify.mjs 同口径）
    dim_ids = {c["channel_id"] for c in dim_ch}
    unknown = sorted({channels[i] for i in set(col_h)} - dim_ids)
    if unknown:
        print(f"FAIL 事实包渠道不在 dim_channel：{unknown}", file=sys.stderr)
        return 1

    # 渠道行数统计：total = 全部事实行；priced = 有平台成交价（p 非空）的行（排名口径）
    total = collections.Counter()
    priced = collections.Counter()
    for i, h in enumerate(col_h):
        total[h] += 1
        if col_p[i] is not None:
            priced[h] += 1

    row_of_id = {c["channel_id"]: c for c in dim_ch}
    enabled = [r for r in regions if r.get("enabled")]

    out = {}
    rows = []
    problems = []
    for r in sorted(enabled, key=lambda x: x["sort"]):
        cc, dp = r["country_code"], r["default_platform"]
        cands = sorted(c["channel_id"] for c in dim_ch if c["country_code"] == cc and c["platform"] == dp)
        if not cands:
            problems.append(f"{cc} 默认平台 {dp} 在 dim_channel 无渠道")
            continue
        # 排名 = 有价事实行数降序；并列取 channel_id 字典序最小（cands 已按字典序排序，
        # 用严格大于比较保证并列时保留先到者）
        best_id, best_n = None, -1
        for cid in cands:
            n = priced[channels.index(cid)]
            if n > best_n:
                best_id, best_n = cid, n
        out[cc] = best_id
        ch = row_of_id[best_id]
        rows.append((cc, r["country_name"], dp, best_id, ch["display_name"], best_n, total[channels.index(best_id)], len(cands)))

    if problems:
        print("FAIL " + "；".join(problems), file=sys.stderr)
        return 1
    if len(out) < 20:
        print(f"FAIL 启用国家 {len(enabled)} 国但仅 {len(out)} 国产出预填", file=sys.stderr)
        return 1

    print(f"预填规则：默认平台内有价事实行最多的渠道（并列取 channel_id 字典序最小）")
    print(f"{'国':<4} {'国家':<6} {'平台':<14} {'channel_id':<26} {'有价行':>7} {'总行':>7} {'候选':>4}  店铺显示名")
    for cc, cname, dp, cid, disp, n, tot, nc in rows:
        print(f"{cc:<4} {cname:<6} {dp:<14} {cid:<26} {n:>7} {tot:>7} {nc:>4}  {disp}")

    out["_comment"] = (
        f"默认平台店铺冷启动预填：由 scripts/prefill_default_shops.py 于 {date.isoformat(date.today())} 生成。"
        "规则 = 该国默认平台（dim_region.default_platform）下有事实价行数最多的渠道"
        "（数据最全=主店；并列取 channel_id 字典序最小）；键=国家码，_comment 非国家码。"
        "应用侧 defaultChannelOf：人工覆盖 → 本表 → null（回默认平台全渠道口径）。"
        "事实包重接后请重跑脚本刷新。"
    )

    if args.dry_run:
        print("\n(dry-run：未写文件)")
        return 0

    dest = os.path.join(dd, "dim_default_channel.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\n已写 {dest}（{len(out) - 1} 国）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
