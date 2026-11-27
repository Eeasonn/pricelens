#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""上一代配置（config_tables.xlsx「上一代配置」页签）→ 解析、落库行、进包。

Eason 2026-11-27 拍板：上一代要到 cat 层级，不能只到 model——fact_sales 的键正是
（周 × 国家 × 型号 × category1~3），只有配置级的前后代才能做同周龄对比。

一行 = 当前「型号 × 配置」→ 上一代「型号 × 配置」：
  - 配置 = 匹配表里的 category1~4（手机：存储；平板：存储 / 尺寸 / Normal·PaperMatte；
    穿戴：表壳尺寸；PC：CPU / 内存 / 存储；音频 / IoT 无配置 = 型号级）；
  - prev_category 某列留空 = 沿用当前同名值；当前型号本身没有配置维度时四个都留空
    = 上一代整个型号（全部配置合计）；
  - 一个上一代可对多个下一代；当前侧每个「型号 × 配置」只允许一行。

本模块只有纯函数（无 IO），与 psi_linkage 同一风格：ingest_pack 读页签后把原始行与
匹配表行（built["mapProduct"]）交给这里，拿回落库行与进包的配置组映射。
"""
from collections import defaultdict
import re
import unicodedata

import ingest_pack as ip

CAT_FIELDS = ("category1", "category2", "category3", "category4")
PREV_FIELDS = tuple(f"prev_{c}" for c in CAT_FIELDS)

# 页签表头别名（容忍人工改名 / 中英文混写）；键 = 规范列名
HEADER_ALIASES = {
    "category": ("category", "cat", "产业", "品类"),
    "brand": ("brand", "品牌", "当前品牌"),
    "model": ("model", "型号", "当前型号"),
    "category1": ("category1", "cat1", "当前category1", "当前cat1"),
    "category2": ("category2", "cat2", "当前category2", "当前cat2"),
    "category3": ("category3", "cat3", "当前category3", "当前cat3"),
    "category4": ("category4", "cat4", "当前category4", "当前cat4"),
    "prev_brand": ("prev_brand", "上一代品牌", "上一代brand"),
    "prev_model": ("prev_model", "上一代型号", "上一代model", "previous_model_id"),
    "prev_category1": ("prev_category1", "prev_cat1", "上一代category1", "上一代cat1"),
    "prev_category2": ("prev_category2", "prev_cat2", "上一代category2", "上一代cat2"),
    "prev_category3": ("prev_category3", "prev_cat3", "上一代category3", "上一代cat3"),
    "prev_category4": ("prev_category4", "prev_cat4", "上一代category4", "上一代cat4"),
    "is_active": ("is_active", "生效", "启用"),
    "note": ("note", "备注"),
    "updated_at": ("updated_at", "更新日期"),
    "maintainer": ("maintainer", "维护人"),
}

# cfg_prev_gen 表列序（与 ingest_pack.SCHEMA 一致）
COLUMNS = (
    "category", "brand", "model", *CAT_FIELDS,
    "prev_brand", "prev_model", *PREV_FIELDS,
    "is_active", "note", "updated_at", "maintainer",
    "model_id", "prev_model_id", "match_status",
)

STATUS_MATCHED = "matched"
STATUS_INACTIVE = "inactive"
# 待处理原因（非 matched / inactive 的行 = 待处理清单）
PENDING_REASONS = (
    "cur_model_not_found",      # 当前型号在匹配表里找不到（品牌 / 型号写法不一致）
    "industry_mismatch",        # 页签填的产业与匹配表里该型号的产业不一致
    "cur_config_not_found",     # 当前配置在匹配表该型号下不存在
    "prev_model_not_found",     # 上一代型号在匹配表里找不到
    "prev_config_not_found",    # 上一代配置在匹配表该型号下不存在
    "self_reference",           # 上一代 = 当前自己
    "duplicate_current",        # 当前「型号 × 配置」重复出现多行
)


# ---------------------------------------------------------------- 归一键

def _text(v):
    return ip.jstr(v)


def _squash(s):
    """NFKC + 去全部空白 + casefold：'12+512 GB' 与 '12+512GB'、'PaperMatte' 与 'papermatte' 同键"""
    s = unicodedata.normalize("NFKC", str(s or ""))
    return re.sub(r"\s+", "", s).casefold()


def slot_key(v):
    """单个配置值归一键；空 / '—' / '-' = 未填"""
    s = _text(v)
    if s in ("", "—", "-", "–"):
        return ""
    if "+" in s:
        norm = ip.normalize_storage(s)
        if norm:
            return _squash(norm)
    return _squash(s)


def cats_key(c1, c2, c3, c4):
    return tuple(slot_key(v) for v in (c1, c2, c3, c4))


def brand_key(b):
    return _squash(_text(b))


def _model_key(brand, model):
    return ip.normkey(ip.fold(_text(brand)).lower() or "", _text(model))


def _as_bool(v):
    """is_active：匹配表同一约定——显式 0 / 否 / FALSE 才算停用，其余（含空）= 生效"""
    s = _text(v).casefold()
    if s in ("", "nan"):
        return 1
    if s in ("0", "否", "false", "n", "no", "off", "停用"):
        return 0
    n = ip.jnum(v)
    return 0 if n == 0 else 1


# ---------------------------------------------------------------- 页签行

def normalize_rows(dicts):
    """页签原始行（表头 → 值）→ 规范列名行；全空行丢弃，值统一成去空白字符串"""
    out = []
    for raw in dicts or []:
        if not isinstance(raw, dict):
            continue
        row = {}
        for k, v in raw.items():
            name = _text(k).casefold().replace(" ", "")
            for col, aliases in HEADER_ALIASES.items():
                if name in aliases and col not in row:
                    row[col] = _text(v)
                    break
        if any(row.get(c) for c in HEADER_ALIASES if c != "is_active"):
            out.append(row)
    return out


class MatchModelIndex:
    """匹配表行（built["mapProduct"]，xlsx + auto 全量）→ 型号 / 配置索引"""

    def __init__(self, match_rows):
        self.by_model = {}        # (brand_key, model_key) → 型号信息
        self.by_model_only = defaultdict(set)  # model_key → {(brand_key, model_key)}
        for r in match_rows or []:
            mid = _text(r.get("model_id"))
            if not mid:
                continue
            bk = brand_key(r.get("brand"))
            mk = _model_key(r.get("brand"), r.get("model"))
            k = (bk, mk)
            info = self.by_model.get(k)
            if info is None:
                info = self.by_model[k] = {
                    "model_id": mid, "brand": _text(r.get("brand")), "model": _text(r.get("model")),
                    "industry": _text(r.get("category")), "cats": defaultdict(set),
                }
            self.by_model_only[mk].add(k)
            ck = cats_key(*(r.get(c) for c in CAT_FIELDS))
            info["cats"][ck].add(_text(r.get("sku_id")))

    def find(self, brand, model):
        """(品牌, 型号) → 型号信息。品牌留空时只在型号名全局唯一才命中——同名分属多个
        品牌不回落（与匹配表挂接同一原则：宁可进待处理，也不猜）。"""
        mk = _model_key(brand, model)
        if not mk:
            return None
        k = (brand_key(brand), mk)
        if k in self.by_model:
            return self.by_model[k]
        if not _text(brand):
            cands = self.by_model_only.get(mk) or set()
            if len(cands) == 1:
                return self.by_model[next(iter(cands))]
        return None


def _row_out(row, status, cur=None, prev=None, prev_cats=None):
    cats = [row.get(c, "") for c in CAT_FIELDS]
    pc = list(prev_cats) if prev_cats is not None else ["", "", "", ""]
    return {
        "category": row.get("category", "") or (cur["industry"] if cur else ""),
        "brand": row.get("brand", "") or (cur["brand"] if cur else ""),
        "model": row.get("model", ""),
        **dict(zip(CAT_FIELDS, cats)),
        "prev_brand": row.get("prev_brand", "") or (prev["brand"] if prev else (cur["brand"] if cur else "")),
        "prev_model": row.get("prev_model", ""),
        **dict(zip(PREV_FIELDS, pc)),
        "is_active": _as_bool(row.get("is_active")),
        "note": row.get("note", ""),
        "updated_at": row.get("updated_at", ""),
        "maintainer": row.get("maintainer", ""),
        "model_id": cur["model_id"] if cur else "",
        "prev_model_id": prev["model_id"] if prev else "",
        "match_status": status,
    }


def resolve_prev_gen(dicts, match_rows):
    """页签行 + 匹配表行 → (落库行列表, 诊断)。prev_category 落库为解析后的显式值。

    诊断键：rows（有效行）/ matched / inactive / pending（{原因: 行数}）。
    行内 _cur_skus / _prev_skus / _cur_model_level / _prev_model_level 供进包用，不落库。
    """
    rows = normalize_rows(dicts)
    idx = MatchModelIndex(match_rows)
    out, seen = [], set()
    diag = {"rows": len(rows), "matched": 0, "inactive": 0, "pending": {}}
    for row in rows:
        cur = idx.find(row.get("brand"), row.get("model"))
        active = _as_bool(row.get("is_active")) == 1
        if not active:
            out.append(_row_out(row, STATUS_INACTIVE, cur))
            diag["inactive"] += 1
            continue
        if cur is None:
            out.append(_row_out(row, "cur_model_not_found"))
            continue
        # 产业列只做软校验：匹配表里该型号的产业为空时不判（模板里就有 8 条这样的行）
        want_ind, have_ind = _squash(row.get("category")), _squash(cur["industry"])
        if want_ind and have_ind and have_ind != want_ind:
            out.append(_row_out(row, "industry_mismatch", cur))
            continue
        cur_vals = [row.get(c, "") for c in CAT_FIELDS]
        cur_key = cats_key(*cur_vals)
        cur_level = not any(cur_key)
        if not cur_level and cur_key not in cur["cats"]:
            out.append(_row_out(row, "cur_config_not_found", cur))
            continue
        dedup = (cur["model_id"], cur_key)
        if dedup in seen:
            out.append(_row_out(row, "duplicate_current", cur))
            continue
        seen.add(dedup)
        prev = idx.find(row.get("prev_brand"), row.get("prev_model"))
        if prev is None:
            out.append(_row_out(row, "prev_model_not_found", cur))
            continue
        # 留空 = 沿用当前同名值；四个都留空 = 当前也没填配置 → 上一代整个型号
        prev_cats = [row.get(f"prev_{c}", "") or cur_val for c, cur_val in zip(CAT_FIELDS, cur_vals)]
        prev_key = cats_key(*prev_cats)
        prev_level = not any(prev_key)
        if not prev_level and prev_key not in prev["cats"]:
            out.append(_row_out(row, "prev_config_not_found", cur, prev, prev_cats))
            continue
        if prev["model_id"] == cur["model_id"] and prev_key == cur_key:
            out.append(_row_out(row, "self_reference", cur, prev, prev_cats))
            continue
        rec = _row_out(row, STATUS_MATCHED, cur, prev, prev_cats)
        # 进包用的 sku 集合：型号级 = 该型号下全部 sku（按匹配表）
        rec["_cur_skus"] = sorted({s for ss in cur["cats"].values() for s in ss if s}) if cur_level else sorted(cur["cats"][cur_key])
        rec["_prev_skus"] = sorted({s for ss in prev["cats"].values() for s in ss if s}) if prev_level else sorted(prev["cats"][prev_key])
        rec["_cur_model_level"] = cur_level
        rec["_prev_model_level"] = prev_level
        out.append(rec)
        diag["matched"] += 1
    for r in out:
        if r["match_status"] not in (STATUS_MATCHED, STATUS_INACTIVE):
            diag["pending"][r["match_status"]] = diag["pending"].get(r["match_status"], 0) + 1
    return out, diag


def db_row(rec):
    """落库行（列序 = COLUMNS）"""
    return [rec.get(c, "") if c not in ("is_active",) else (1 if rec.get(c) else 0) for c in COLUMNS]


# ---------------------------------------------------------------- 进包

def prev_gen_pack_groups(resolved, dims_product):
    """已解析行 + 包内 sku 字典（dims.product）→ 配置组映射（前端「匹配上一代」直接查）。

    返回 (groups, diag)：groups 每项 = {"m": 当前型号 id, "r": 当前配置组(romram),
    "p": [[上一代型号 id, 上一代配置组], …]}；同一当前组的多个上一代目标合并去重。
    diag：groups（映射条数）/ unmappedRows（任一侧在包里没有对应配置组的已解析行）。
    """
    by_sku = {}
    groups_of = defaultdict(set)
    for p in dims_product or []:
        mid, rom = _text(p.get("model_id")), _text(p.get("romram")) or "—"
        if p.get("sku_id"):
            by_sku[p["sku_id"]] = (mid, rom)
        if mid:
            groups_of[mid].add(rom)
    out, unmapped = {}, 0
    for rec in resolved or []:
        if rec.get("match_status") != STATUS_MATCHED:
            continue
        cur_g = ({(rec["model_id"], r) for r in groups_of.get(rec["model_id"], ())}
                 if rec.get("_cur_model_level") else {by_sku[s] for s in rec.get("_cur_skus", ()) if s in by_sku})
        prev_g = ({(rec["prev_model_id"], r) for r in groups_of.get(rec["prev_model_id"], ())}
                  if rec.get("_prev_model_level") else {by_sku[s] for s in rec.get("_prev_skus", ()) if s in by_sku})
        prev_g -= cur_g
        if not cur_g or not prev_g:
            unmapped += 1
            continue
        for cg in cur_g:
            out.setdefault(cg, set()).update(prev_g)
    groups = [{"m": m, "r": r, "p": [list(x) for x in sorted(ps)]} for (m, r), ps in sorted(out.items())]
    return groups, {"groups": len(groups), "unmappedRows": unmapped}
