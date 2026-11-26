#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""只读 .xlsx（OOXML）解析器——纯标准库（zipfile + xml.etree），零第三方依赖。

用途（2026-11-23 后端 v2 重构）：读取 data/config_tables.xlsx（配置表+补录表四页签，
Eason 在交付工作簿里人工回填后投递）与 data/sales.xlsx（PSI 新 7 列导出）。
只读不写；单元格值三态：字符串 / 数字(float) / 布尔；空单元格 = None。

已知限制（够用即停）：①日期单元格在 xlsx 内是「序列号+样式」，本读取器不解析
样式——若 Excel 把日期列转成序列号（如 46000），消费方用 ingest_pack.excel_date_to_str
按数值范围兜底转 YYYY-MM-DD；②公式单元格读缓存值（t="str"）；③只读第一个
<x:sheet> 命中页签，不支持合并单元格展开。
"""
import re
import zipfile
import xml.etree.ElementTree as ET

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
NS_PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def _col_index(cell_ref):
    """'BC12' → 列序号（0 基）；无字母（异常单元格）返回 None"""
    m = re.match(r"([A-Za-z]+)", cell_ref or "")
    if not m:
        return None
    n = 0
    for ch in m.group(1).upper():
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _shared_strings(zf):
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out = []
    for si in root.findall(f"{NS_MAIN}si"):
        # <si><t>文本</t></si> 或富文本 <si><r><t>…</t></r>…——取全部 t 拼接
        out.append("".join(t.text or "" for t in si.iter(f"{NS_MAIN}t")))
    return out


def sheet_names(path):
    """工作簿全部页签名（按 workbook.xml 顺序）"""
    with zipfile.ZipFile(path) as zf:
        wb = ET.fromstring(zf.read("xl/workbook.xml"))
    return [(sh.get("name") or "") for sh in wb.iter(f"{NS_MAIN}sheet")]


def _sheet_target(zf, sheet_name):
    """workbook.xml 页签名 → zip 内路径（经 rels 解析 r:id）"""
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    rid = None
    for sh in wb.iter(f"{NS_MAIN}sheet"):
        if (sh.get("name") or "").strip() == (sheet_name or "").strip():
            rid = sh.get(f"{NS_REL}id")
            break
    if rid is None:
        raise KeyError(f"页签不存在：{sheet_name}（现有：{[s.get('name') for s in wb.iter(NS_MAIN + 'sheet')]}）")
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    for rel in rels.iter(f"{NS_PKG_REL}Relationship"):
        if rel.get("Id") == rid:
            target = rel.get("Target") or ""
            if target.startswith("/"):
                return target.lstrip("/")
            return "xl/" + target if not target.startswith("xl/") else target
    raise KeyError(f"页签关系缺失：{sheet_name} ({rid})")


def _cell_value(c, shared):
    t = c.get("t")
    if t == "inlineStr":
        is_el = c.find(f"{NS_MAIN}is")
        return "".join(x.text or "" for x in is_el.iter(f"{NS_MAIN}t")) if is_el is not None else None
    v = c.find(f"{NS_MAIN}v")
    raw = v.text if v is not None else None
    if raw is None:
        return None
    if t == "s":
        try:
            return shared[int(raw)]
        except (ValueError, IndexError):
            return None
    if t == "b":
        return raw not in ("0", "")
    if t in (None, "n"):
        try:
            f = float(raw)
            return int(f) if f.is_integer() and abs(f) < 1e15 else f
        except ValueError:
            return raw
    return raw  # t="str"（公式缓存）等原样


def read_sheet_rows(path, sheet_name):
    """读一个页签 → 行数组（每行为与最大列对齐的值列表，空位 None）"""
    with zipfile.ZipFile(path) as zf:
        shared = _shared_strings(zf)
        target = _sheet_target(zf, sheet_name)
        root = ET.fromstring(zf.read(target))
    rows = []
    for row_el in root.iter(f"{NS_MAIN}row"):
        cells = {}
        width = 0
        for c in row_el.findall(f"{NS_MAIN}c"):
            idx = _col_index(c.get("r"))
            if idx is None:
                idx = width
            cells[idx] = _cell_value(c, shared)
            width = max(width, idx + 1)
        rows.append([cells.get(i) for i in range(width)] if cells else [])
    return rows


def read_sheet_dicts(path, sheet_name):
    """首行为表头 → 行 dict 数组（表头 str(key).strip()；None 值统一为 ''，
    与 server._read_rows 的 CSV 形态一致——引擎归一层原样收）"""
    rows = read_sheet_rows(path, sheet_name)
    if not rows:
        return []
    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    out = []
    for r in rows[1:]:
        if not any(v is not None and str(v).strip() != "" for v in r):
            continue  # 整行空跳过（Excel 尾部残留空行）
        out.append({h: ("" if r[i] is None else r[i]) for i, h in enumerate(headers) if h})
    return out
