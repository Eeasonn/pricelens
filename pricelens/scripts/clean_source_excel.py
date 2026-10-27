# -*- coding: utf-8 -*-
"""全量数据表源表清洗（2026-10-27 业务反馈五条，对齐原始 Excel 结构输出清洗版）。

清洗规则：
  1) MVM 与 M.Video 同平台 → 统一「Mvideo」；两条显示店铺名称裸「M.Video」的行实为独立站主店
  2) Amazon 全变体（amazon.sa / amazon tr / amazon mexico(éxico) / AMAZON）→ 统一「Amazon」
  3) mediamarkt tr → 「MediaMarkt」
  4) mercadolibre → 「Mercado Libre」
  5) vatan bilgisayar → 「Vatan」
  6) 官网价格相关 5 列删除（官网建议零售价/成交价-本币+美金、官网折扣率——模拟数据无作用）

维度同步去后缀：
  - 显示店铺名称：家族行内的变体拼写统一、国别后缀删除（Mexico/com.tr/.sa/TR/Bilgisayar/Computer）、
    裸平台名补「平台 店铺类型」、占位值（unknown/店铺名未露出/页面未显示卖家/nan）按行店铺类型回填；
    不含平台词根的真实卖家显示名（如 Tienda oficial Huawei）不动
  - 店铺名称：仅当值恰好是平台名变体（含国别后缀）时归一到平台名；真实卖家名与跨区 storefront
    （Amazon Germany / Amazon UAE / Amazon.sa Marketplace 等）不动
  - 与 ingest_real.py 的 PLATFORM_ALIASES 同口径（那边管应用侧再生成，这边管源表交付）

用法：python3 scripts/clean_source_excel.py [--xlsx 路径] [--out 路径]
输出：仓库根「全量数据表-清洗版.xlsx」，四张表结构保留（行序/行数/其余列不动），
      控制台打印逐规则变更报告 + 变更后平台清单复核。
"""
import argparse
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # 仓库根（pricelens 上一级）

OFFICIAL_COLS = ["官网建议零售价-本币", "官网成交价-本币", "官网折扣率",
                 "官网建议零售价-美金", "官网成交价-美金"]  # 全量数据 5 列；未入库/不可采另有「平台与官网成交价差」→ 按名称含「官网」通配删除
DATA_SHEETS = ["全量数据", "未入全量与待复核", "不可采_没货"]

# 平台归并：fold 折叠小写 → 规范名（与 ingest_real.PLATFORM_ALIASES 同口径）
CANON = {
    "mvm": "Mvideo", "m.video": "Mvideo", "m video": "Mvideo",
    "amazon": "Amazon", "amazon.sa": "Amazon", "amazon tr": "Amazon",
    "amazon mexico": "Amazon", "amazon méxico": "Amazon",
    "mediamarkt": "MediaMarkt", "mediamarkt tr": "MediaMarkt", "media markt": "MediaMarkt",
    "mercadolibre": "Mercado Libre", "mercado libre": "Mercado Libre",
    "vatan": "Vatan", "vatan bilgisayar": "Vatan",
}
# 家族词根（fold 小写包含即视为该家族的显示名/店铺名）
FAMILY_TOKEN = {
    "Mvideo": ("m.video", "m video", "mvm", "mvideo"),
    "Amazon": ("amazon",),
    "MediaMarkt": ("mediamarkt", "media markt"),
    "Mercado Libre": ("mercado",),
    "Vatan": ("vatan",),
}
# 显示名内的变体拼写 → 规范名（大小写不敏感，先替换拼写再删后缀）
CANON_PATTERNS = [
    (r"m\.video", "Mvideo"), (r"\bm\s+video\b", "Mvideo"), (r"\bmvm\b", "Mvideo"),
    (r"media\s+markt", "MediaMarkt"), (r"mediamarkt", "MediaMarkt"),
    (r"mercadolibre", "Mercado Libre"),
    (r"\bMercado\b(?! Libre)", "Mercado Libre"),  # 源表简写「Mercado …」补全（Mexico Mercado Samsung 等）
    (r"amazon", "Amazon"),
    (r"vatan", "Vatan"),
]
# 国别/语言后缀 token（词边界删除；com.tr 须先于 tr）
SUFFIX_PATTERNS = [r"\bcom\.tr\s*", r"\.sa\b", r"\bsa\b", r"\btr\b",
                   r"\bm[eé]xico\b", r"\bbilgisayar\b", r"\bcomputer\b"]
# 占位显示名（含 nan/空）→ 按行店铺类型回填
PLACEHOLDERS = {"", "nan", "none", "unknown", "<na>", "<nat>", "店铺名未露出", "页面未显示卖家"}
# 店铺名称精确变体（fold 小写）→ 规范店铺名；跨区 storefront 不在内
SHOP_CANON = {
    "amazon": "Amazon", "amazon.sa": "Amazon", "amazon sa": "Amazon",
    "amazon méxico": "Amazon", "amazon mexico": "Amazon",
    "amazon.com.tr": "Amazon", "amazon tr": "Amazon", "amazon mx": "Amazon", "amazon_mx": "Amazon",
    "m.video": "Mvideo", "mvideo": "Mvideo",
    "mediamarkt": "MediaMarkt",
    "mercadolibre": "Mercado Libre", "mercado libre": "Mercado Libre",
    "mercado libre méxico": "Mercado Libre", "mercado libre mexico": "Mercado Libre",
    "vatan": "Vatan", "vatan bilgisayar": "Vatan", "vatan computer": "Vatan",
}


def fold(s):
    """NFKD 折叠去组合符（与 ingest_real.fold 同实现；NA 安全）。"""
    if s is None or (not isinstance(s, str) and pd.isna(s)):
        s = ""
    return "".join(c for c in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(c))


def canon_of(platform):
    if platform is None or (not isinstance(platform, str) and pd.isna(platform)):
        return None
    return CANON.get(fold(platform).strip().lower())


def clean_display(disp, platform_canon, store_type):
    """显示店铺名称：家族行拼写统一+去后缀；占位回填；非家族真实卖家名不动。"""
    s = str(disp).strip()
    st = None if pd.isna(store_type) else str(store_type).strip()
    if fold(s).lower() in PLACEHOLDERS:
        return f"{platform_canon} {st}" if st else platform_canon
    low = fold(s).lower()
    if not any(tok in low for tok in FAMILY_TOKEN[platform_canon]):
        return disp  # 不含平台词根 → 真实卖家显示名，保留
    t = s.replace("İ", "I").replace("ı", "i")  # 土耳其语点 I：re.I 无法匹配 İ/ı（İ 折叠为 i̇ 双码点），先 ASCII 化再正则
    for pat, rep in CANON_PATTERNS:
        t = re.sub(pat, rep, t, flags=re.I)
    for pat in SUFFIX_PATTERNS:
        t = re.sub(pat, " ", t, flags=re.I)
    t = re.sub(r"\s+", " ", t).strip(" .-,")
    if not t or t == platform_canon:  # 裸平台名 → 补店铺类型
        return f"{platform_canon} {st}" if st else platform_canon
    return t


def clean_shop(shop):
    """店铺名称：仅精确等于平台名变体时归一；真实卖家/跨区 storefront 不动。"""
    key = fold(shop).strip().lower()
    return SHOP_CANON.get(key, shop)


def clean_sheet(df, report, sheet):
    df = df.copy()
    pf = df["平台"].map(canon_of)
    in_family = pf.notna()
    report["平台归并"][sheet] = Counter(
        zip(df.loc[in_family, "平台"].map(str), pf[in_family]))
    df.loc[in_family, "平台"] = pf[in_family]

    disp_old = df["显示店铺名称"].copy()
    disp_new = [
        clean_display(d, c, st) if isinstance(c, str) else d
        for d, c, st in zip(df["显示店铺名称"], pf, df["店铺类型"])
    ]
    changed = [(str(o), str(n)) for o, n, c in zip(disp_old, disp_new, pf)
               if isinstance(c, str) and str(o) != str(n)]
    report["显示店铺名称"][sheet] = Counter(changed)
    df["显示店铺名称"] = disp_new

    shop_old = df["店铺名称"].copy()
    shop_new = df["店铺名称"].map(clean_shop)
    report["店铺名称"][sheet] = Counter(
        (str(o), str(n)) for o, n in zip(shop_old, shop_new) if str(o) != str(n))
    df["店铺名称"] = shop_new

    dropped = [c for c in df.columns if "官网" in str(c)]
    df = df.drop(columns=dropped)
    report["删除官网列"][sheet] = dropped
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default=os.path.join(ROOT, "全量数据表.xlsx"))
    ap.add_argument("--out", default=os.path.join(ROOT, "全量数据表-清洗版.xlsx"))
    args = ap.parse_args()

    xl = pd.ExcelFile(args.xlsx)
    report = {k: defaultdict(Counter) for k in ("平台归并", "显示店铺名称", "店铺名称", "删除官网列")}
    out_sheets = {}
    for sheet in xl.sheet_names:
        df = xl.parse(sheet)
        if sheet in DATA_SHEETS:
            n0 = len(df)
            df = clean_sheet(df, report, sheet)
            assert len(df) == n0, f"{sheet} 行数变化 {n0}→{len(df)}"
        out_sheets[sheet] = df

    with pd.ExcelWriter(args.out, engine="openpyxl") as w:
        for sheet, df in out_sheets.items():
            df.to_excel(w, sheet_name=sheet, index=False)

    # ---------- 变更报告 ----------
    print(f"[clean] {args.xlsx} → {args.out}")
    for sheet in DATA_SHEETS:
        print(f"\n== {sheet}")
        for kind in ("平台归并", "店铺名称"):
            pairs = report[kind][sheet]
            print(f"  [{kind}] {sum(pairs.values()):,} 行：")
            for (o, n), c in sorted(pairs.items(), key=lambda x: -x[1]):
                print(f"     {o!r} → {n!r}  ×{c:,}")
        pairs = report["显示店铺名称"][sheet]
        print(f"  [显示店铺名称] {sum(pairs.values()):,} 行（top 25）：")
        for (o, n), c in sorted(pairs.items(), key=lambda x: -x[1])[:25]:
            print(f"     {o!r} → {n!r}  ×{c:,}")
        print(f"  [删除官网列] {report['删除官网列'][sheet]}")

    print("\n== 清洗后平台清单（三张数据表合计）")
    plats = Counter()
    for sheet in DATA_SHEETS:
        for p in out_sheets[sheet]["平台"].dropna():
            plats[str(p)] += 1
    for p, c in sorted(plats.items(), key=lambda x: -x[1]):
        print(f"   {p:20s} {c:>8,}")
    bad = [p for p in plats if "." in p or fold(p).lower() in
           {"mvm", "mercadolibre", "amazon.sa", "amazon tr", "amazon mexico",
            "amazon méxico", "mediamarkt tr", "vatan bilgisayar", "m video"}]
    if bad:
        print(f"[clean] ✗ 残留未归并平台：{bad}")
        sys.exit(1)
    print("[clean] ✓ 五条归并规则复核通过，无残留变体")


if __name__ == "__main__":
    main()
