# -*- coding: utf-8 -*-
"""就地修补 src/data/dim_product.json 的分类维度（2026-11-17 Eason offer/PSI 契约）。

目的：让模拟底表满足四产业看数/筛选诉求，并与真实数据接入契约同构——
  1) 穿戴：表盘大小（41mm/46mm…）从 color 提升为配置维度 romram（≥2 个尺寸的型号），
     颜色等其他信息留在 color（次级菜单）；唯一尺寸/不涉尺寸的型号剥掉尺寸词、配置置空
     （GT 6 Pro 特例=只保留颜色字段，同 Eason 口径）；'大'/'小' 合成脏行剔除。
  2) 全表回填 cat1/cat2（DimProduct 新字段，销量匹配键；显示文案仍走 romram）：
     手机 cat1=存储；平板 cat1=存储 + cat2=屏幕；穿戴 cat1=表盘；音频/iot/pc=空（产品级）。
归一规则与前端 src/dataModel/salesIngest.ts 逐字对齐（storageParse/normalizeScreen/
normalizeCaseSize），两侧不得各自漂移。可在维表再生成后重复执行（幂等）：管线顺序
    ingest_real.py → patch_comp_series.py → patch_dim_categories.py → prefill → …
用法：
    python3 scripts/patch_dim_categories.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "src", "data", "dim_product.json")
BENCH_PATH = os.path.join(ROOT, "src", "data", "dim_benchmark.json")

SIZE_RE = re.compile(r"(\d{2}(?:\.\d+)?)\s*mm\b", re.IGNORECASE)
SCREEN_PREFIX_RE = re.compile(r"""^\s*\d{1,2}(?:\.\d+)?\s*(?:['"“”″寸]|-?inch\b|\bin\b)\s*""", re.IGNORECASE)
SCREEN_RE = re.compile(r"""(\d{1,2}(?:\.\d+)?)\s*(?:['"“”″寸]|-?inch\b|\bin\b)""", re.IGNORECASE)
STORAGE_TOKEN_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(tb|t|gb|g)?(?=[\s+/]|$)", re.IGNORECASE)
JUNK_COLORS = {"大", "小"}


def fmt_num(n: float) -> str:
    s = f"{n:.2f}".rstrip("0").rstrip(".")
    return s


def storage_parse(text):
    """镜像 salesIngest.storageParse：返回 (ram, romGB, romUnit) 或 None。"""
    if text is None:
        return None
    s = str(text).strip().lower()
    if not s or s in ("—", "-", "规格未标明"):
        return None
    has_sep = bool(re.search(r"[+/]", s))
    tokens = [(float(m.group(1)), bool(m.group(2) and m.group(2).lower() in ("tb", "t"))) for m in STORAGE_TOKEN_RE.finditer(s)]
    if not tokens:
        return None
    if has_sep:
        ram, rom = tokens[0], (tokens[1] if len(tokens) > 1 else None)
    elif len(tokens) >= 2:
        ram, rom = tokens[-2], tokens[-1]
    else:
        ram, rom = None, tokens[0]
    if rom is None:
        return None
    rom_gb = rom[0] * 1024 if rom[1] else rom[0]
    ram_n = (ram[0] * 1024 if ram[1] else ram[0]) if ram else 0
    return ram_n, rom_gb, ("TB" if rom[1] else "GB")


def normalize_storage(text):
    """镜像 salesIngest.normalizeStorage：'12+512 GB' / '12+1 TB' / '256 GB'；解不出 = None。"""
    p = storage_parse(text)
    if p is None:
        return None
    ram, rom_gb, unit = p
    rom = rom_gb / 1024 if unit == "TB" else rom_gb
    if ram > 0:
        return f"{fmt_num(ram)}+{fmt_num(rom)} {unit}"
    return f"{fmt_num(rom)} {unit}"


def normalize_screen(text):
    m = SCREEN_RE.search(str(text)) if text else None
    return f'{fmt_num(float(m.group(1)))}"' if m else None


def strip_size_from_color(color: str, size: str) -> str:
    """剥掉表盘词后的余量（'42mm Beige'→'Beige'；'42mm Cellular X'→'Cellular X'）。"""
    rest = re.sub(rf"\s*{re.escape(size)}\s*mm\b\s*", " ", color, flags=re.IGNORECASE)
    rest = re.sub(r"[\s/]+", " ", rest).strip(" /-")
    return rest or "—"


def main() -> None:
    with open(PATH, encoding="utf-8") as f:
        rows = json.load(f)

    # ---- ① 穿戴：表盘大小 color → romram（型号级规则）----
    dropped = 0
    resized = 0
    stripped = 0
    kept = 0
    wear = [r for r in rows if r["industry"] == "wearable"]
    by_model = {}
    for r in wear:
        by_model.setdefault(r["model_id"], []).append(r)
    for model_id, group in by_model.items():
        # 合成脏行（'大'/'小'）：正身尺寸行已覆盖其国家的直接剔除；否则保留为
        # 「—」无尺寸配置并清掉脏色——它们是该型号在未覆盖国家的唯一价格载体
        # （如 Watch 6/6 Pro 的 DE/PL 只有 std 行），剔除会把整个国家数据删没。
        junk = [r for r in group if r.get("color") in JUNK_COLORS]
        covered = set()
        for x in group:
            if x not in junk:
                covered.update(x.get("countries", []))
        for r in junk:
            uncovered = [c for c in r.get("countries", []) if c not in covered]
            if uncovered:
                r["countries"] = uncovered
                r["color"] = "—"
                kept += 1
            else:
                rows.remove(r)
                dropped += 1
        group = [r for r in group if r not in junk]
        # 只处理 romram='—' 且 color 含尺寸词的行（'规格未标明'/booklet 行不动）
        sizes = {}
        for r in group:
            if r["romram"] != "—":
                continue
            ms = SIZE_RE.findall(str(r.get("color") or ""))
            if len(ms) > 1:
                print(f"  ! {model_id} 单行多尺寸不处理: {r['color']!r}")
                continue
            if len(ms) == 1:
                size = fmt_num(float(ms[0])) + "mm"
                sizes.setdefault(size, []).append(r)
        if len(sizes) >= 2:
            # 多尺寸 = 配置维度：romram=尺寸，color=余量
            for size, srows in sizes.items():
                for r in srows:
                    r["romram"] = size
                    r["color"] = strip_size_from_color(str(r["color"]), size[:-2])
                    resized += 1
        elif len(sizes) == 1:
            # 唯一尺寸 = 不作维度（GT 6 Pro 口径）：剥词留颜色，romram 保持 '—'
            for r in next(iter(sizes.values())):
                r["color"] = strip_size_from_color(str(r["color"]), next(iter(sizes))[:-2])
                stripped += 1

    # ---- ② 全表 cat1/cat2 回填（显示文案不动，只加匹配键字段）----
    for r in rows:
        industry = r["industry"]
        cat1 = None
        cat2 = None
        if industry == "phone":
            cat1 = normalize_storage(r["romram"])
        elif industry == "tablet":
            romram = r["romram"]
            if romram not in ("—", "规格未标明"):
                cat1 = normalize_storage(SCREEN_PREFIX_RE.sub("", romram, count=1))
                cat2 = normalize_screen(romram)
        elif industry == "wearable":
            if re.fullmatch(r"\d+(?:\.\d+)?mm", str(r["romram"])):
                cat1 = r["romram"]
        r["cat1"] = cat1
        r["cat2"] = cat2

    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))

    # ---- ③ 对标矩阵自愈：own_romram 悬空行（'—' 配置已拆成尺寸）按现存配置展开 ----
    config_keys = {(r["model_id"], r["romram"]) for r in rows}
    configs_of = {}
    for r in rows:
        configs_of.setdefault(r["model_id"], []).append(r["romram"])
    with open(BENCH_PATH, encoding="utf-8") as f:
        bench = json.load(f)
    expanded = 0
    next_bench = []
    for b in bench:
        if (b["own_model_id"], b["own_romram"]) in config_keys:
            next_bench.append(b)
            continue
        cfgs = sorted(set(configs_of.get(b["own_model_id"], [])))
        if not cfgs:
            next_bench.append(b)  # 型号整体不在（历史遗留），保持原样
            continue
        for cfg in cfgs:
            clone = dict(b)
            clone["own_romram"] = cfg
            if "表盘拆分适配" not in (clone.get("note") or ""):
                clone["note"] = f"{(clone.get('note') or '')} 表盘拆分适配 2026-11-17".strip()
            next_bench.append(clone)
            expanded += 1
    with open(BENCH_PATH, "w", encoding="utf-8") as f:
        json.dump(next_bench, f, ensure_ascii=False, separators=(",", ":"))

    total_cat = sum(1 for r in rows if r.get("cat1") is not None or r.get("cat2") is not None)
    print(f"穿戴：{resized} 行尺寸升配置维，{stripped} 行剥唯一尺寸，{dropped} 行脏值剔除，{kept} 行保留清洗；cat1/cat2 回填 {total_cat}/{len(rows)} 行；对标悬空行展开 {expanded} 条")

    # ---- ④ 事实包 SKU 清洗：剔除已不在 dim_product 的 SKU（被剔脏行的价格行）----
    import base64
    import gzip
    PACK_PATH = os.path.join(ROOT, "src", "data", "fact_pack_gzip.b64.txt")
    dim_ids = {r["sku_id"] for r in rows}
    pack = json.loads(gzip.decompress(base64.b64decode(open(PACK_PATH, encoding="ascii").read().strip())))
    old_skus = pack["skus"]
    old_to_new = {}
    for idx, s in enumerate(old_skus):
        if s in dim_ids:
            old_to_new[idx] = len(old_to_new)
    drop_rows = [i for i, si in enumerate(pack["cols"]["s"]) if si not in old_to_new]
    if drop_rows:
        drop_set = set(drop_rows)
        cols = pack["cols"]
        for key, arr in cols.items():
            if key == "s":
                cols[key] = [old_to_new[v] for i, v in enumerate(arr) if i not in drop_set]
            else:
                cols[key] = [v for i, v in enumerate(arr) if i not in drop_set]
        pack["skus"] = [s for s in old_skus if s in dim_ids]
        gz = gzip.compress(json.dumps(pack, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        with open(PACK_PATH, "w", encoding="ascii") as f:
            f.write(base64.b64encode(gz).decode("ascii"))
        print(f"事实包：剔除 {len(drop_rows)} 行脏 SKU 事实（skus {len(old_skus)} → {len(pack['skus'])}）")
    else:
        print("事实包：无脏 SKU，跳过清洗")


if __name__ == "__main__":
    sys.exit(main())
