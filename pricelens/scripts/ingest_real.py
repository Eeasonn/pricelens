#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
真实数据接入管线（多国多产业 cutover）。
输入（默认仓库根，可用参数覆盖）：
  全量数据表.xlsx        主事实（sheet「全量数据」，29 列）；增量补录放 data/real/incoming/*.xlsx（同 29 列即可）
  产品竞品矩阵.txt       默认产品选择矩阵（区域/国家/产业/系列/产品/价格挡位/竞品1..3）
  国家主要电渠.txt       各国核心电渠（默认平台）
  国家大促日历.txt       分国大促日历（模糊日期解析到具体区间）
  data/real/overrides.json  人工纠偏/补录映射（型号别名、矩阵指认、品牌修正、人工对标、核心电渠覆写）
输出：
  src/data/dim_*.json + src/data/fact_pack_gzip.b64.txt   应用直接装载
  data/real/matrix_resolution.json                        矩阵解析明细（不进 bundle）
  data/real/ingest_report.md                              本轮接入评估报告
幂等：同输入重跑输出一致；incoming 增量按唯一键 upsert（采集时间新者优先）。
"""
import argparse
import base64
import csv
import glob
import gzip
import hashlib
import json
import os
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

import pandas as pd

from series_rules import comp_series

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # pricelens/
REPO = os.path.dirname(ROOT)          # 价格管理-v109/

# ---------------------------------------------------------------- 常量表
COUNTRY_CODES = {
    "saudi arabia": "SA", "russia": "RU", "mexico": "MX", "malaysia": "MY",
    "philippines": "PH", "thailand": "TH", "singapore": "SG", "indonesia": "ID",
    "united arab emirates": "AE", "ae": "AE", "germany": "DE", "vietnam": "VN",
    "turkey": "TR", "poland": "PL", "spain": "ES", "italy": "IT", "france": "FR",
    "united kingdom": "GB", "romania": "RO", "south africa": "ZA", "japan": "JP",
    "brazil": "BR", "peru": "PE", "argentina": "AR", "colombia": "CO",
    "bulgaria": "BG", "chile": "CL", "kuwait": "KW", "egypt": "EG", "hong kong": "HK",
    "沙特": "SA", "r国": "RU", "阿联酋": "AE", "波兰": "PL", "德国": "DE",
    "菲律宾": "PH", "泰国": "TH", "马来西亚": "MY", "马来": "MY", "印尼": "ID",
    "墨西哥": "MX", "巴西": "BR", "保加利亚": "BG", "智利": "CL", "秘鲁": "PE",
    "哥伦比亚": "CO", "阿根廷": "AR", "南非": "ZA", "土耳其": "TR", "越南": "VN",
    "新加坡": "SG", "日本": "JP",
}
REGION_TABLE = [
    ("EU", "欧洲", "FR", "法国", 1), ("EU", "欧洲", "DE", "德国", 2), ("EU", "欧洲", "TR", "土耳其", 3),
    ("EU", "欧洲", "IT", "意大利", 4), ("EU", "欧洲", "GB", "英国", 5), ("EU", "欧洲", "ES", "西班牙", 6),
    ("EU", "欧洲", "RO", "罗马尼亚", 7), ("EU", "欧洲", "PL", "波兰", 8), ("EU", "欧洲", "BG", "保加利亚", 9),
    ("LATAM", "拉美", "CO", "哥伦比亚", 10), ("LATAM", "拉美", "AR", "阿根廷", 11), ("LATAM", "拉美", "CL", "智利", 12),
    ("LATAM", "拉美", "PE", "秘鲁", 13), ("LATAM", "拉美", "BR", "巴西", 14), ("LATAM", "拉美", "MX", "墨西哥", 15),
    ("MEA", "中东非", "ZA", "南非", 16), ("MEA", "中东非", "KW", "科威特", 17), ("MEA", "中东非", "EG", "埃及", 18),
    ("MEA", "中东非", "SA", "沙特", 19), ("MEA", "中东非", "AE", "阿联酋", 20),
    ("APAC", "亚太", "MY", "马来西亚", 21), ("APAC", "亚太", "ID", "印尼", 22), ("APAC", "亚太", "JP", "日本", 23),
    ("APAC", "亚太", "SG", "新加坡", 24), ("APAC", "亚太", "HK", "中国香港", 25), ("APAC", "亚太", "TH", "泰国", 26),
    ("APAC", "亚太", "PH", "菲律宾", 27), ("APAC", "亚太", "VN", "越南", 28),
    ("EURASIA", "欧亚", "RU", "R国", 29),
]
INDUSTRY_OF_CAT = {"smartphone": "phone", "tablet": "tablet", "wearable": "wearable",
                   "earbuds": "audio", "iot": "iot", "pc": "pc"}
INDUSTRY_OF_CN = {"手机": "phone", "平板": "tablet", "穿戴": "wearable", "音频": "audio"}
TIER_LADDERS = {
    "phone": [200, 400, 600, 800, 1000],
    "tablet": [150, 250, 350, 500, 800],
    "wearable": [25, 75, 150, 300, 400],
    "audio": [50, 100, 200],
    "iot": [50, 100, 200, 400],
    "pc": [500, 800, 1200],
}
PLATFORM_ALIASES = {
    "mercadolibre": "Mercado Libre", "amazon méxico": "Amazon", "amazon mexico": "Amazon",
    "amazon.sa": "Amazon", "amazon tr": "Amazon", "mediamarkt tr": "MediaMarkt",
    "vatan bilgisayar": "Vatan",
}
STORE_ALIASES = {"平台型零售商": "1P", "平台第三方卖家": "3P", "marketplace": "3P",
                 "跨境3p": "3P", "3p_international": "3P", "官网": "独立站"}
BRAND_TOKENS = {
    "APPLE": ["apple"], "SAMSUNG": ["samsung", "galaxy", "三星"], "XIAOMI": ["xiaomi", "poco", "小米"],
    "HONOR": ["honor", "荣耀"], "HUAWEI": ["huawei", "华为"], "GARMIN": ["garmin"], "AMAZFIT": ["amazfit"],
    "SOUNDCORE": ["soundcore", "anker"], "SHOKZ": ["shokz"], "SONY": ["sony"], "JBL": ["jbl"],
    "BOSE": ["bose"], "COROS": ["coros", "高驰"], "LENOVO": ["lenovo", "motorola", "smartfon"],
    "OPPO": ["oppo"], "REALME": ["realme"], "NOTHING": ["nothing"], "FITBIT": ["fitbit"],
    "WHOOP": ["whoop"], "ASUS": ["asus"], "HP": ["hp"], "INFINIX": ["infinix"],
    "TRANSSION": ["transsion"], "VIVO": ["vivo"], "ZTE": ["zte"], "TP-LINK": ["tp-link", "tplink"],
    "TENDA": ["tenda"], "CUDY": ["cudy"], "MERCURY": ["mercury"],
}
BRAND_OF_TOKEN = {t: b for b, ts in BRAND_TOKENS.items() for t in ts}
STRIP_TOKENS = {"5g", "4g", "wifi", "lte", "dual", "sim", "esim", "版", "代", "系列",
                "series", "collection", "smartfon", "tablet", "new", "earbuds", "buds",
                "smart", "mi", "gb", "tb", "gen", "th", "rd", "st", "nd",
                "szary", "rysik", "klawiatura", "matowy", "ekran", "matt", "英寸", "寸"}
OWN_SERIES_RULES = [
    ("watchultimate", "WATCH Ultimate"), ("watchgt", "WATCH GT"), ("watchfit", "WATCH FIT"),
    ("watchkids", "WATCH KIDS"), ("watchd", "WATCH"), ("watch", "WATCH"), ("band", "Band"),
    ("freeclip", "FreeClip"), ("freebuds", "FreeBuds"), ("freearc", "FreeArc"),
    ("matepadpromax", "MatePad Pro"), ("matepadpro", "MatePad Pro"), ("matepadair", "MatePad Air"),
    ("matepadmini", "MatePad mini"), ("matepadse", "MatePad SE"), ("matepad", "MatePad 数字系列"), ("matebook", "MateBook"),
    ("matex", "Mate"), ("mate", "Mate"), ("pura", "Pura"), ("nova", "nova"),
]
AUTO_INDUSTRIES = ("phone", "tablet", "wearable", "audio")
BRAND_PRIORITY = {
    "phone": ["APPLE", "SAMSUNG", "XIAOMI", "HONOR", "OPPO", "VIVO", "LENOVO", "TRANSSION"],
    "tablet": ["APPLE", "SAMSUNG", "XIAOMI", "HONOR", "LENOVO", "OPPO", "INFINIX"],
    "wearable": ["APPLE", "SAMSUNG", "GARMIN", "XIAOMI", "HONOR", "AMAZFIT", "COROS", "WHOOP", "FITBIT"],
    "audio": ["APPLE", "SAMSUNG", "SONY", "BOSE", "XIAOMI", "JBL", "SOUNDCORE", "SHOKZ"],
}
PROMO_COUNTRY = {"德国": "DE", "r国": "RU", "沙特": "SA", "南非": "ZA",
                 "马来西亚": "MY", "泰国": "TH", "菲律宾": "PH"}
DEPTH_MAP = {"大促": "深", "高": "深", "中促": "中", "中": "中", "小促": "浅", "低": "浅"}
CN_MONTH = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
            "十一": 11, "十二": 12, "十": 10}
PROMO_PLATFORMS = {"亚马逊": ["Amazon"], "shopee+lazada": ["Shopee", "Lazada"],
                   "takealot": ["TAKEALOT"], "线下only": ["线下"], "all": None, "": None}
GUESS_TOKENS = ["tag heuer", "apple", "iphone", "ipad", "samsung", "galaxy", "xiaomi", "redmi",
                "poco", "honor", "garmin", "amazfit", "soundcore", "anker", "shokz", "sony",
                "jbl", "bose", "coros", "lenovo", "motorola", "smartfon", "oppo", "nothing",
                "realme", "aimoto", "imoo", "fitbit", "yandex", "whoop", "tablet", "vivo",
                "suunto", "xplora", "小米", "荣耀", "三星", "高驰", "华为"]

# ---------------------------------------------------------------- 基础工具
def fold(s):
    """NFKD 折叠并去掉组合音标（vívoactive → vivoactive）。"""
    return "".join(c for c in unicodedata.normalize("NFKD", s or "") if not unicodedata.combining(c))


def sval(v):
    """pandas 3 str/NA 安全取字符串：缺失 → None。"""
    if v is None or v is pd.NA or (isinstance(v, float) and pd.isna(v)):
        return None
    return str(v)


def slug(s):
    s = fold(s).lower()
    s = re.sub(r"[^0-9a-z]+", "-", s).strip("-")
    return re.sub(r"-{2,}", "-", s) or "x"


def normkey(brand, name):
    """型号归一键（token 串）：折音、去品牌词/连接词/年份、数字母边界切分。"""
    s = fold(sval(name) or "").lower()
    s = re.sub(r"\b(5g|4g|lte|wi-?fi\d?|esim|e-sim|dual\s*sim)\b", " ", s)
    s = re.sub(r"(\d)\.(\d)", r"\1§\2", s)                     # 保护小数点（11.5 / 12.2）
    s = re.sub(r"([\u4e00-\u9fff]+)", r" \1 ", s)
    s = re.sub(r"[（）()\[\]{}“”\"'‘’·，,。.:：;；！!？?\\|/／+\-–—]+", " ", s)
    s = re.sub(r"([a-z]+)(\d)", r"\1 \2", s)
    s = re.sub(r"(\d)([a-z]+)", r"\1 \2", s)
    s = s.replace("§", ".")
    out = []
    bts = {t for t in BRAND_TOKENS.get(brand, [])}
    for t in s.split():
        t = t.strip(".-")
        if not t or t in bts or t in STRIP_TOKENS:
            continue
        if re.fullmatch(r"(19|20)\d\d", t):
            continue
        out.append(t)
    return " ".join(out)


def clean_matrix_text(t):
    """矩阵单元格去噪：SRP 价、内存配置、刷新率/尺寸单位、型号编码、s pen。"""
    t = sval(t) or ""
    t = re.sub(r"(?is)\bsrp\b[\d\s.,]*", " ", t)
    t = re.sub(r"(?i)\+?\s*s\s*pen", " ", t)
    t = re.sub(r"(?i)\b\d+\s*/\s*\d+\s*(gb|tb)?\b", " ", t)
    t = re.sub(r"(?i)\b\d+\s*(gb|tb)\b", " ", t)
    t = re.sub(r"(?i)\b\d+(\.\d+)?\s*hz\b", " ", t)
    t = re.sub(r"\d+,\d+\s*(''|\"|″)", " ", t)
    t = re.sub(r"\d+(\.\d+)?\s*(''|\"|″)", " ", t)
    t = re.sub(r"\(([A-Z]{2,}\d[\w-]*)\)", " ", t)
    return " ".join(t.split())


def is_size_token(t):
    """屏幕尺寸样式的数字 token（7–15.5 英寸），用于『iPad Air 13 / MatePad SE 11』剔尺寸重试。"""
    return bool(re.fullmatch(r"\d{1,2}(\.\d)?", t)) and 7 <= float(t) <= 15.5


def parse_tier_text(code):
    s = (code or "").replace("＞", ">").replace("＜", "<").replace("≥", ">=").strip()
    for pat in (r"(\d+(?:\.\d+)?)\s*[-–~<]\s*(\d+(?:\.\d+)?)",
                r"(?:>=?>|>)\s*(\d+(?:\.\d+)?)",
                r"(\d+(?:\.\d+)?)\s*\+",
                r"<\s*(\d+(?:\.\d+)?)",
                r"~?=?\s*(\d+(?:\.\d+)?)"):
        m = re.fullmatch(pat, s)
        if m:
            g = m.groups()
            if len(g) == 2:
                return float(g[0]), float(g[1])
            v = float(g[0])
            return (v, None) if ("<" not in pat[:6]) else (0.0, v)
    return None


def tier_code_of(price_usd, industry):
    lad = TIER_LADDERS[industry]
    if price_usd is None:
        price_usd = 0.0
    lo = 0.0
    for hi in lad:
        if price_usd < hi:
            return f"<{int(hi)}" if lo == 0 else f"{int(lo)}-{int(hi)}"
        lo = hi
    return f"{int(lad[-1])}+"


def tier_rank(code):
    m = re.match(r"<(\d+)", code)
    if m:
        return (0, float(m.group(1)), 0)
    m = re.match(r"(\d+)-(\d+)", code)
    if m:
        return (0, float(m.group(1)), 1)
    m = re.match(r"(\d+)\+", code)
    return (1, float(m.group(1)) if m else 0, 0)


def parse_pct(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (int, float)):
        x = float(v)
        return x if -1.0 <= x <= 0 else (-x if 0 < x <= 1 else None)
    s = str(v).replace("−", "-").strip()
    m = re.fullmatch(r"-?\s*(\d+(?:\.\d+)?)\s*%", s)
    return -abs(float(m.group(1))) / 100.0 if m else None


def unit_free_color(c):
    """规格串尾部重复单位（"12+256 GB GB"）不是颜色 → —"""
    c = (sval(c) or "").strip()
    return "—" if re.fullmatch(r"(gb|tb|g|t)", c.lower()) else title_color(c)


def title_color(c):
    c = re.sub(r"\s+", " ", (sval(c) or "").strip())
    if not c or c in {"-", "\\", "/"}:
        return "—"
    return c[:1].upper() + c[1:]


def parse_romram(industry, spec):
    """型号规格 → (romram 显示文案, rom_key, color)。"""
    s = (sval(spec) or "").strip()
    if not s or s in {"-", "\\", "/"}:
        return "—", "std", "—"
    if industry == "phone":
        m = re.match(r"^(\d+)\s*\+\s*(\d+)\s*(TB|T|GB|G)?\s*(?:GB)?\s+(.+)$", s, re.I)
        if m:
            ram, rom, unit, color = m.group(1), m.group(2), (m.group(3) or "GB").upper(), m.group(4).strip()
            unit = "TB" if unit in ("T", "TB") else "GB"
            return f"{ram}+{rom} {unit}", f"{ram}+{rom}{unit}".lower(), unit_free_color(color)
        m = re.match(r"^(\d+)\s*(GB|TB|T)\s+(.+)$", s, re.I)
        if m:
            rom, unit, color = m.group(1), m.group(2).upper(), m.group(3).strip()
            unit = "TB" if unit in ("T", "TB") else "GB"
            return f"{rom} {unit}", f"{rom}{unit}".lower(), unit_free_color(color)
        return s, slug(s), title_color(s)
    if industry == "tablet":
        parts = [p.strip() for p in s.split("/")]
        size = next((p for p in parts if re.match(r"^\d+(\.\d+)?(″|\"|in)", p, re.I)), "")
        conn_raw = next((p for p in parts if p.upper() in {"WIFI", "LTE", "5G", "5G LTE", "5G LTE+WIFI", "CELLULAR", "NG LTE"}), "")
        conn = {"WIFI": "WiFi", "CELLULAR": "Cellular", "5G": "5G", "5G LTE": "5G",
                "5G LTE+WIFI": "5G", "NG LTE": "LTE"}.get(conn_raw.upper(), conn_raw)
        mem = next((p for p in parts if re.search(r"\d+\s*\+\s*\d+", p)), "")
        memd = ""
        mm = re.search(r"(\d+)\s*\+\s*(\d+)\s*(TB|GB|G)?", mem, re.I)
        if mm:
            romd = mm.group(2) + (" TB" if (mm.group(3) or "").upper().startswith("T") else " GB")
            memd = f"{mm.group(1)}+{romd}"
        variant = next((p for p in parts if p.lower() in {"papermatte", "nano-texture glass"}), "")
        disp = " ".join(x for x in [size, conn, memd, variant] if x)
        key = disp.replace('"', "in").replace("″", "in").replace(" ", "").lower()
        return disp, key, "—"
    if industry == "wearable":
        conn_pat = re.compile(r"\b(GPS\s*\+\s*Cellular|Cellular|LTE|GPS|Bluetooth|WiFi)\b", re.I)
        tech_pat = re.compile(r"\b(AMOLED|Solar)\b", re.I)
        conns = [c.upper().replace(" ", "") for c in conn_pat.findall(s)]
        techs = [t for t in tech_pat.findall(s)]
        rest = tech_pat.sub("", conn_pat.sub("", s)).strip(" /-")
        ms = re.match(r"^(\d+(?:\.\d+)?)\s*mm\s*(.*)$", rest, re.I)
        size, color = None, rest
        if ms:
            size, color = ms.group(1) + "mm", ms.group(2).strip() or "—"
        variant = " ".join(sorted({c.title().replace("Gps", "GPS").replace("Lte", "LTE") for c in conns} | set(techs)))
        disp = " ".join(x for x in [size, variant] if x) or "—"
        return disp, disp.replace(" ", "").lower(), title_color(color) if color != "—" else "—"
    if industry == "pc":
        cpu = re.search(r"^(.*?)\s*\|", s)
        ram = re.search(r"RAM:\s*(\d+)", s, re.I)
        sto = re.search(r"STO:\s*(\d+(?:\.\d+)?)\s*(TB|GB)?", s, re.I)
        ramd = f"{ram.group(1)}+" if ram else ""
        stod = (sto.group(1) + (" TB" if (sto.group(2) or "GB").upper().startswith("T") else " GB")) if sto else ""
        disp = ((cpu.group(1).strip() + " " if cpu else "") + ramd + stod).strip() or s
        return disp, disp.replace(" ", "").lower(), "—"
    return "—", "std", title_color(s)


def to_week_wed(d):
    return d - timedelta(days=d.weekday()) + timedelta(days=2)


def parse_datetime_cell(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, datetime):
        return v
    s = str(v).strip()
    if re.fullmatch(r"\d+(\.\d+)?", s):
        try:
            return datetime(1899, 12, 30) + timedelta(days=float(s))
        except Exception:
            return None
    s = re.sub(r"\s*\+\d{2}:?\d{2}$", "", s)
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def parse_promo_part(cell):
    """『2月中旬 / 三月 / 6月底 / 11 月』→ (月, 日from, 日to)。"""
    s = (cell or "").replace(" ", "").replace("\u3000", "")
    m = re.search(r"(\d{1,2})月|(十[一二]?|[一二三四五六七八九])月", s)
    if not m:
        return None
    mon = int(m.group(1)) if m.group(1) else CN_MONTH.get(m.group(2))
    if not mon:
        return None
    tail = s[m.end():]
    if re.search(r"中下|下中", tail):
        return mon, 11, 31
    if re.search(r"底|下旬|月末", tail):
        return mon, 21, 31
    if re.search(r"中旬|中", tail):
        return mon, 11, 20
    if re.search(r"初|上旬|月初", tail):
        return mon, 1, 10
    return mon, 1, 31


def month_days(mon, year):
    nxt = datetime(year + (mon == 12), (mon % 12) + 1, 1)
    return (nxt - timedelta(days=1)).day


def cc_of(name):
    return COUNTRY_CODES.get((sval(name) or "").strip().lower())


# ---------------------------------------------------------------- 模块级状态（管线内共享）
DIM_PRODUCT = []
SKU_CC_WEEKS = {}


def country_configs(model_id, cc):
    out = {p["romram"] for p in DIM_PRODUCT if p["model_id"] == model_id and cc in p["countries"]}
    return sorted(out)


def rep_sku(model_id, romram, cc):
    """竞品代表色 SKU：国家内周覆盖最多的颜色（并列取 sku_id 字典序最小）；国内无数据返回 None。"""
    rows = [(SKU_CC_WEEKS.get((p["sku_id"], cc), 0), p["sku_id"]) for p in DIM_PRODUCT
            if p["model_id"] == model_id and p["romram"] == romram and cc in p["countries"]]
    rows.sort(key=lambda x: (-x[0], x[1]))
    return rows[0][1] if rows else None


def cfg_features(industry, romram):
    s = romram.replace('"', "in").replace("″", "in").lower()
    ram = rom_gb = None
    m = re.search(r"(\d+)\+(\d+)\s*(tb|gb)", s)
    if m:
        ram = int(m.group(1))
        rom_gb = int(float(m.group(2)) * (1024 if m.group(3) == "tb" else 1))
    else:
        m = re.search(r"(\d+)\s*(tb|gb)", s)
        if m:
            rom_gb = int(float(m.group(1)) * (1024 if m.group(2) == "tb" else 1))
    mm = re.search(r"(\d+(?:\.\d+)?)mm", s)
    inch = re.search(r"(\d+(?:\.\d+)?)in", s)
    return {"rom": rom_gb, "ram": ram,
            "mm": float(mm.group(1)) if mm else None,
            "in": float(inch.group(1)) if inch else None,
            "cellular": bool(re.search(r"cellular|lte", s))}


def pair_configs(own_cfgs, comp_cfgs, industry):
    """SKU 级配置匹配（2026-10-20 拍板）：
    手机/平板 ROM+RAM，优先 ROM；华为 1 配置 vs 友商多配置 → 友商全显；
    华为多配置 vs 友商 1 配置 → 全部对友商该配置；都多 → 一一对应（同 ROM 优先同 RAM，其次 ROM 就近；平板叠尺寸就近）。
    穿戴：表盘尺寸档（<43mm 小 / ≥43mm 大）+ 蜂窝偏好一致 + 尺寸就近；友商 1 配置 → 全对。
    音频/IoT/PC：1:1。"""
    if not own_cfgs or not comp_cfgs:
        return []
    if industry in ("phone", "tablet"):
        if len(own_cfgs) == 1 and len(comp_cfgs) > 1:
            if industry == "phone":
                return [(own_cfgs[0], c) for c in comp_cfgs]
            # 平板变体多（尺寸×内存×联网），按就近排序后最多取 4 个
            o = cfg_features(industry, own_cfgs[0])
            def close(c):
                f = cfg_features(industry, c)
                return (abs((f["in"] or 0) - (o["in"] or 0)) if o["in"] and f["in"] else 1,
                        abs((f["rom"] or 0) - (o["rom"] or 0)), c)
            return [(own_cfgs[0], c) for c in sorted(comp_cfgs, key=close)[:4]]
        if len(comp_cfgs) == 1:
            return [(o, comp_cfgs[0]) for o in own_cfgs]
        of = [cfg_features(industry, c) for c in own_cfgs]
        cf = [cfg_features(industry, c) for c in comp_cfgs]
        used, pairs = set(), []
        for i, o in enumerate(of):
            best = None
            for j, c in enumerate(cf):
                if j in used:
                    continue
                if o["rom"] and c["rom"]:
                    if o["rom"] == c["rom"]:
                        sc = 0 if o["ram"] == c["ram"] else 1 + abs((o["ram"] or 0) - (c["ram"] or 0)) / 100
                    else:
                        sc = 2 + abs((o["rom"] or 0) - (c["rom"] or 0)) / max(o["rom"], c["rom"])
                else:
                    sc = 5
                if industry == "tablet" and o["in"] and c["in"]:
                    sc += abs(o["in"] - c["in"]) / 10
                if best is None or sc < best[0]:
                    best = (sc, j)
            if best:
                pairs.append((own_cfgs[i], comp_cfgs[best[1]]))
                used.add(best[1])
        return pairs
    if industry == "wearable":
        if len(comp_cfgs) == 1:
            return [(o, comp_cfgs[0]) for o in own_cfgs]
        of = [cfg_features(industry, c) for c in own_cfgs]
        cf = [cfg_features(industry, c) for c in comp_cfgs]
        if len(own_cfgs) == 1 and len(comp_cfgs) > 1:
            same = [j for j in range(len(cf)) if cf[j]["cellular"] == of[0]["cellular"]] or list(range(len(cf)))
            ranked = sorted(same, key=lambda j: (cf[j]["mm"] is None, abs((cf[j]["mm"] or 0) - (of[0]["mm"] or 0))))
            return [(own_cfgs[0], comp_cfgs[j]) for j in ranked[:4]]
        used, pairs = set(), []
        for i, o in enumerate(of):
            best = None
            for j, c in enumerate(cf):
                if j in used:
                    continue
                sc = (3 if ((o["mm"] or 0) < 43) != ((c["mm"] or 0) < 43) else 0)
                sc += 1 if c["cellular"] != o["cellular"] else 0
                sc += abs((c["mm"] or 0) - (o["mm"] or 0)) / 100
                if best is None or sc < best[0]:
                    best = (sc, j)
            if best:
                pairs.append((own_cfgs[i], comp_cfgs[best[1]]))
                used.add(best[1])
        return pairs
    if len(own_cfgs) == 1 and len(comp_cfgs) > 1:
        return [(own_cfgs[0], c) for c in comp_cfgs]
    if len(comp_cfgs) == 1:
        return [(o, comp_cfgs[0]) for o in own_cfgs]
    return [(own_cfgs[0], comp_cfgs[0])]


def derive_series(p):
    k = normkey(p["brand"], p["model_name"]).replace(" ", "")
    for pre, name in OWN_SERIES_RULES:
        if k.startswith(pre):
            return name
    # 第一百一十七轮：竞品按「代际+产品线」规则成组（scripts/series_rules.py，
    # 与 patch_comp_series.py 同源）；未命中回退型号名本身（型号即系列）
    if not p.get("is_own"):
        return comp_series(p["brand"], p["model_name"])
    return (p["model_name"].split() or ["其他"])[0]


def guess_brand(text):
    t = fold(sval(text) or "").lower()
    for tok in sorted(GUESS_TOKENS, key=len, reverse=True):
        if tok in t:
            if tok == "iphone" or tok == "ipad":
                return "APPLE"
            if tok in ("redmi", "poco"):
                return "XIAOMI"
            if tok == "galaxy":
                return "SAMSUNG"
            if tok == "imoo":
                return "IMOO"
            if tok == "aimoto":
                return "AIMOTO"
            b = BRAND_OF_TOKEN.get(tok)
            if b:
                return b
    return "OTHER"


# ---------------------------------------------------------------- 主流程
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default=os.path.join(REPO, "全量数据表.xlsx"))
    ap.add_argument("--matrix", default=os.path.join(REPO, "产品竞品矩阵.txt"))
    ap.add_argument("--channels", default=os.path.join(REPO, "国家主要电渠.txt"))
    ap.add_argument("--promos", default=os.path.join(REPO, "国家大促日历.txt"))
    ap.add_argument("--overrides", default=os.path.join(ROOT, "data", "real", "overrides.json"))
    ap.add_argument("--incoming", default=os.path.join(ROOT, "data", "real", "incoming"))
    ap.add_argument("--outdir", default=os.path.join(ROOT, "src", "data"))
    ap.add_argument("--workdir", default=os.path.join(ROOT, "data", "real"))
    args = ap.parse_args()

    os.makedirs(args.workdir, exist_ok=True)
    os.makedirs(args.incoming, exist_ok=True)
    with open(args.overrides, encoding="utf-8") as f:
        OV = json.load(f)
    model_aliases = {tuple(k.split("|", 1)): v for k, v in (OV.get("model_aliases") or {}).items()}
    matrix_aliases = OV.get("matrix_aliases") or {}
    brand_fixes = OV.get("brand_fixes") or []
    bench_manual = OV.get("benchmark_manual") or []
    core_platform_ov = OV.get("core_platform_overrides") or {}
    log = {"dropped": Counter(), "fixed": Counter(), "notes": []}

    # ---------- 1. 载入事实源（主表 + incoming 增量） ----------
    files = [args.xlsx] + sorted(glob.glob(os.path.join(args.incoming, "*.xlsx")))
    frames = []
    for fp in files:
        df = pd.read_excel(fp, sheet_name="全量数据")
        df["__src"] = os.path.basename(fp)
        frames.append(df)
    raw = pd.concat(frames, ignore_index=True)
    n_raw = len(raw)
    log["notes"].append(f"输入文件 {len(files)} 个，原始行 {n_raw:,}")

    raw = raw[raw["型号"].notna() & (raw["型号"].astype(str).str.strip() != "")].copy()
    log["dropped"]["无型号"] = n_raw - len(raw)

    raw["品牌"] = raw["品牌"].astype(str).str.strip().str.upper()
    raw["品类"] = raw["品类"].astype(str).str.strip()
    raw["行业"] = raw["品类"].str.lower().map(INDUSTRY_OF_CAT)
    n_nocat = int(raw["行业"].isna().sum())
    # 品类按 (品牌, 归一键) 多数票修正（含缺品类行与错标行）
    raw["nkey0"] = [normkey(b, m) for b, m in zip(raw["品牌"], raw["型号"].astype(str))]
    cat_major = raw.dropna(subset=["行业"]).groupby(["品牌", "nkey0"])["行业"].agg(lambda s: s.value_counts().index[0])
    fixed_cat = 0
    new_ind = []
    for b, k, ind in zip(raw["品牌"], raw["nkey0"], raw["行业"]):
        mj = cat_major.get((b, k))
        if pd.isna(ind):
            new_ind.append(mj if isinstance(mj, str) else "iot")
        elif isinstance(mj, str) and mj != ind:
            new_ind.append(mj)
            fixed_cat += 1
        else:
            new_ind.append(ind)
    raw["行业"] = new_ind
    log["fixed"]["品类多数票修正"] = fixed_cat
    log["fixed"]["缺品类补齐"] = n_nocat

    raw["nkey"] = [normkey(b, m) for b, m in zip(raw["品牌"], raw["型号"].astype(str))]
    for (b, k), v in model_aliases.items():
        raw.loc[(raw["品牌"] == b) & (raw["nkey"] == k), "nkey"] = v
    for fix in brand_fixes:
        m = raw["nkey"].str.startswith(fix["model_prefix"])
        if fix.get("from_brand"):
            m &= raw["品牌"] == fix["from_brand"]
        m &= raw["品牌"] != fix["to_brand"]
        log["fixed"][f"品牌→{fix['to_brand']}"] += int(m.sum())
        raw.loc[m, "品牌"] = fix["to_brand"]

    raw["cc"] = raw["国家/地区"].astype(str).map(cc_of)
    log["dropped"]["未知国家"] = int(raw["cc"].isna().sum())
    raw = raw[raw["cc"].notna()].copy()
    raw["平台"] = raw["平台"].astype(str).str.strip().map(lambda p: PLATFORM_ALIASES.get(fold(p).lower(), p))
    raw["店铺类型"] = raw["店铺类型"].astype(str).str.strip().map(lambda s: STORE_ALIASES.get(s, s))
    raw["店铺类型"] = raw["店铺类型"].where(raw["店铺类型"].isin(["1P", "3P", "独立站"]), "3P")

    parsed = raw["时间周期"].map(lambda v: _wk(v))
    raw["week_id"] = [p[0] if p else None for p in parsed]
    raw["week_wed"] = [p[1] if p else None for p in parsed]
    log["dropped"]["无周期"] = int(raw["week_id"].isna().sum())
    raw = raw[raw["week_id"].notna()].copy()

    raw["汇率"] = pd.to_numeric(raw["汇率"], errors="coerce")
    inv = raw["汇率"].notna() & (raw["汇率"] < 1) & (~raw["货币"].isin(["EUR", "GBP"]))
    log["fixed"]["汇率倒挂(取倒数)"] = int(inv.sum())
    raw.loc[inv, "汇率"] = 1 / raw.loc[inv, "汇率"]
    raw["汇率"] = raw.groupby(["cc", "week_id"])["汇率"].transform(lambda s: s.fillna(s.median()))
    raw["汇率"] = raw.groupby(["货币"])["汇率"].transform(lambda s: s.fillna(s.median()))
    log["dropped"]["无汇率"] = int(raw["汇率"].isna().sum())
    raw = raw[raw["汇率"].notna() & (raw["汇率"] > 0)].copy()

    for c in ["官网建议零售价-本币", "官网成交价-本币", "平台建议零售价-本币", "平台成交价-本币"]:
        raw[c] = pd.to_numeric(raw[c], errors="coerce")
    raw["rrp_usd"] = (raw["官网建议零售价-本币"] / raw["汇率"]).round(2)
    raw["price_usd"] = (raw["平台成交价-本币"] / raw["汇率"]).round(2)
    # 价格单位错位修正：同 SKU×国家 的 USD 中位数 8 倍以上、且 ÷100 后落回 0.5–2 倍区间 → 判为「少了小数点」÷100；
    # 仍 > 20,000 USD 的行视为不可信剔除（消费电子单品不可能）
    key_cols = ["品牌", "nkey", "型号规格", "cc"]
    med = raw.groupby(key_cols)["price_usd"].transform("median")
    ratio = raw["price_usd"] / med
    fix100 = raw["price_usd"].notna() & med.notna() & (ratio > 8) & ((ratio / 100) > 0.5) & ((ratio / 100) < 2)
    for c in ["官网建议零售价-本币", "官网成交价-本币", "平台建议零售价-本币", "平台成交价-本币"]:
        raw.loc[fix100, c] = raw.loc[fix100, c] / 100
    raw.loc[fix100, "rrp_usd"] = (raw.loc[fix100, "官网建议零售价-本币"] / raw.loc[fix100, "汇率"]).round(2)
    raw.loc[fix100, "price_usd"] = (raw.loc[fix100, "平台成交价-本币"] / raw.loc[fix100, "汇率"]).round(2)
    log["fixed"]["价格单位错位(÷100)"] = int(fix100.sum())
    absurd = raw["price_usd"].notna() & (raw["price_usd"] > 20000)
    log["dropped"]["USD 价格>20000(不可信)"] = int(absurd.sum())
    raw = raw[~absurd].copy()
    for c in ["官网折扣率", "平台显示折扣率", "平台实际折扣率"]:
        raw[c] = raw[c].map(parse_pct)
    raw["bundle"] = raw["是否组合销售"].astype(str).str.strip().str.upper().isin(["Y", "YES", "TRUE", "是"])
    for c, fill in [("店铺名称", "—"), ("显示店铺名称", "—"), ("网址链接", ""), ("截图命名", ""),
                    ("分期付款", None), ("促销政策", None)]:
        raw[c] = raw[c].where(raw[c].notna(), fill)
    raw["crawled_at"] = raw["采集时间"].map(lambda v: (parse_datetime_cell(v) or datetime(1970, 1, 1)).strftime("%Y-%m-%d %H:%M"))

    # 型号正名：同 (品牌, nkey) 取最高频原文；剥原文前缀品牌词
    canon = {}
    for (b, k), g in raw.groupby(["品牌", "nkey"]):
        name = str(g["型号"].astype(str).str.strip().value_counts().index[0])
        toks = name.split()
        if toks and fold(toks[0]).lower().rstrip(".,") in {b.lower(), b.lower().replace("-", "")}:
            name = " ".join(toks[1:]) or name
        canon[(b, k)] = name
    raw["model_name"] = [canon[(b, k)] for b, k in zip(raw["品牌"], raw["nkey"])]

    rr = [parse_romram(ind, sp) for ind, sp in zip(raw["行业"], raw["型号规格"])]
    raw["romram"] = [x[0] for x in rr]
    raw["rom_key"] = [x[1] for x in rr]
    raw["color"] = [x[2] for x in rr]

    raw["prefix"] = raw["品牌"].eq("HUAWEI").map({True: "own", False: "cmp"})
    raw["model_id"] = raw["prefix"] + "-" + raw["品牌"].map(slug) + "-" + raw["model_name"].map(slug)
    raw["sku_id"] = raw["model_id"] + "__" + raw["rom_key"].map(slug) + "__" + raw["color"].map(slug)

    before = len(raw)
    raw["__price"] = raw["平台成交价-本币"].fillna(raw["官网成交价-本币"]).fillna(1e18)
    raw = raw.sort_values(["crawled_at", "__price"]).drop_duplicates(
        subset=["week_id", "sku_id", "cc", "平台", "店铺类型", "店铺名称"], keep="last")
    log["dropped"]["重复行(周×SKU×国×渠道×店铺)"] = before - len(raw)
    log["notes"].append(f"清洗后事实行 {len(raw):,}")

    # ---------- 2. 维度：时间 / 汇率 / 地区 / 渠道 ----------
    weds = sorted(set(raw["week_wed"]))
    weeks = []
    d = datetime.strptime(weds[0], "%Y-%m-%d")
    d1 = datetime.strptime(weds[-1], "%Y-%m-%d")
    while d <= d1:
        y, wn, _ = d.isocalendar()
        weeks.append({"week_id": f"{y}{wn:02d}", "week_wed_date": d.strftime("%Y-%m-%d"),
                      "month_id": f"{d.year}{d.month:02d}",
                      "quarter_id": f"{d.year}Q{(d.month - 1) // 3 + 1}",
                      "week_start_date": (d - timedelta(days=2)).strftime("%Y-%m-%d")})
        d += timedelta(days=7)
    week_ids = [w["week_id"] for w in weeks]
    log["notes"].append(f"时间维 {weeks[0]['week_id']}({weeks[0]['week_wed_date']}) → "
                        f"{weeks[-1]['week_id']}({weeks[-1]['week_wed_date']})，共 {len(weeks)} 周")

    fxmap = (raw.assign(m=raw["week_wed"].str.slice(0, 7).str.replace("-", ""))
             .groupby(["货币", "m"])["汇率"].median().round(4).reset_index())
    dim_fx = [{"currency": str(r.货币), "month_id": str(r.m), "per_usd": float(r.汇率)}
              for r in fxmap.itertuples()]
    dim_fx.sort(key=lambda x: (x["currency"], x["month_id"]))

    core_raw = defaultdict(list)
    with open(args.channels, encoding="utf-8-sig") as f:
        for row in csv.reader(f, delimiter="\t"):
            if not row or row[0].strip() in ("", "区域"):
                continue
            cc = cc_of(row[1])
            if cc:
                core_raw[cc].extend([c.strip() for c in row[2:] if c.strip()])
    core_platforms = {r[2]: (core_platform_ov.get(r[2]) or []) for r in REGION_TABLE}
    for cc, names in core_raw.items():
        if cc not in core_platform_ov:
            core_platforms[cc] = names

    dim_channel = []
    channel_of = {}
    for (cc, pf, st), g in raw.groupby(["cc", "平台", "店铺类型"]):
        cid = f"{cc}:{slug(pf)}:{st}"
        disp = str(g["显示店铺名称"].value_counts().index[0])
        # 显示名须以平台名开头（源表把 MVM 标成 M.Video、unknown 等）→ 否则用「平台 店铺类型」兜底
        if disp.lower() in {"unknown", "—", "nan", ""} or not disp.lower().startswith(fold(pf).lower()[:3]):
            disp = f"{pf} {st}"
        dim_channel.append({"channel_id": cid, "country_code": cc, "platform": pf, "store_type": st,
                            "display_name": disp,
                            "shops": int(g["店铺名称"].nunique()), "rows": int(len(g))})
        channel_of[(cc, pf, st)] = cid
    dim_channel.sort(key=lambda c: (c["country_code"], -c["rows"]))
    for c in dim_channel:
        c.pop("rows")

    countries_in_data = set(raw["cc"])
    dim_region = []
    for rc, rn, cc, cn, sort in REGION_TABLE:
        has = cc in countries_in_data
        sub = raw[raw["cc"] == cc]
        cur = sub["货币"].mode()
        pf_rows = sub["平台"].value_counts()
        core = [p for p in core_platforms.get(cc, []) if p in set(pf_rows.index)]
        if not core:
            core = list(pf_rows.index[:2])
        dim_region.append({"region_code": rc, "region_name": rn, "country_code": cc, "country_name": cn,
                           "enabled": bool(has), "sort": sort,
                           "currency": str(cur.iloc[0]) if len(cur) else None,
                           "core_platforms": core, "default_platform": core[0] if core else None,
                           "default_own_models": {}})
    region_by_cc = {r["country_code"]: r for r in dim_region}

    # ---------- 3. 产品维 + 档位 ----------
    rrp_med = raw.dropna(subset=["rrp_usd"]).groupby("model_id")["rrp_usd"].median()
    prc_med = raw.dropna(subset=["price_usd"]).groupby("model_id")["price_usd"].median()
    ref_price = rrp_med.combine_first(prc_med)
    for sku, g in raw.groupby("sku_id"):
        head = g.iloc[0]
        mid, ind = head["model_id"], head["行业"]
        ref = ref_price.get(mid)
        DIM_PRODUCT.append({
            "sku_id": sku, "model_id": mid, "industry": ind, "brand": head["品牌"],
            "is_own": head["prefix"] == "own", "series": "",
            "model_name": head["model_name"], "romram": head["romram"], "color": head["color"],
            "tier_code": tier_code_of(ref, ind),
            "ref_price_usd": round(float(ref), 1) if pd.notna(ref) else None,
            "launch_date": str(g["week_wed"].min()), "eol_date": None,
            "first_week": str(g["week_id"].min()), "last_week": str(g["week_id"].max()),
            "countries": sorted(set(g["cc"])),
        })
    model_min = {}
    for p in DIM_PRODUCT:
        cur = model_min.get(p["model_id"])
        if cur is None or tier_rank(p["tier_code"]) < tier_rank(cur):
            model_min[p["model_id"]] = p["tier_code"]
    for p in DIM_PRODUCT:
        p["tier_code"] = model_min[p["model_id"]]
    wks = raw.groupby(["sku_id", "cc"])["week_id"].nunique()
    SKU_CC_WEEKS.update({k: int(v) for k, v in wks.items()})
    ind_of_model = {p["model_id"]: p["industry"] for p in DIM_PRODUCT}

    # ---------- 4. 矩阵解析 + 竞品匹配 ----------
    universe = defaultdict(dict)   # (brand, industry) -> {nkey: [model_id]}
    nkey_of = {}
    for p in DIM_PRODUCT:
        k = normkey(p["brand"], p["model_name"])
        nkey_of[p["model_id"]] = k
        lst = universe[(p["brand"], p["industry"])].setdefault(k, [])
        if p["model_id"] not in lst:
            lst.append(p["model_id"])

    def contiguous(sub, full):
        n, m = len(sub), len(full)
        return any(full[i:i + n] == sub for i in range(m - n + 1)) if n else False

    substitute_hits = set()

    def resolve_name(brand, industry, text, strict_own=False):
        """矩阵名 → ([model_id], status, 规范后原文)。status: exact|series|subset|reverse|none
        strict_own（第115轮）：我司侧解析——子集匹配时型号名多出的代际数字 token
        （WATCH ultimate → ultimate 2）不算命中，防相邻矩阵行互相串味。"""
        txt = " ".join(str(text).split())
        spec_hint = None
        if txt in matrix_aliases:
            ma = matrix_aliases[txt]
            brand = ma.get("brand", brand)
            text = ma["model"]
            spec_hint = ma.get("spec")
            if ma.get("substitute"):
                substitute_hits.add(txt)
        text = clean_matrix_text(text)
        k = normkey(brand, text)
        pool = universe.get((brand, industry))
        if not pool:
            if brand != "OTHER":
                return [], "none", txt           # 已知品牌但该产业无数据：不猜
            pool = {}
            for (b, i), ks in universe.items():
                if i == industry and b != "HUAWEI":
                    pool.update(ks)
        if not k:
            return [], "none", txt
        if k in pool:
            return list(pool[k]), "exact", txt
        nos = k.replace(" ", "")
        hit_nos = [mid for kk, mids in pool.items() if kk.replace(" ", "") == nos for mid in mids]
        if hit_nos:
            return hit_nos, "exact", txt
        kt = k.split()
        series_mode = bool(re.search(r"系列|series", str(text), re.I))
        scored = []
        for kk, mids in pool.items():
            tt = kk.split()
            if series_mode and contiguous(kt, tt):
                scored.append((2 + 0.1 * (len(tt) - len(kt)), mids))
            elif contiguous(kt, tt):
                if strict_own and any(re.search(r"\d", e) for e in tt if e not in kt):
                    continue  # 型号名多出代际数字（ultimate 2）→ 非本行产品
                scored.append((3 + 0.1 * (len(tt) - len(kt)), mids))
            elif contiguous(tt, kt):
                extra = [t for t in kt if t not in tt]
                if extra and all(not re.search(r"\d", e) for e in extra) and len(extra) <= 2:
                    scored.append((4 + 0.1 * len(extra), mids))
        cands = []
        if scored:
            scored.sort(key=lambda x: x[0])
            top = [s for s in scored if s[0] <= scored[0][0] + 1e-9]
            for _, mids in top:
                cands.extend(m for m in mids if m not in cands)
        else:
            # 尺寸剔除重试（MatePad SE 11 / iPad Air 13"）：任意位置剔除一个类尺寸数字
            for i, t in enumerate(kt):
                if is_size_token(t) and len(kt) >= 3:
                    k2tokens = kt[:i] + kt[i + 1:]
                    k2 = " ".join(k2tokens)
                    if k2 in pool:
                        cands = list(pool[k2])
                        spec_hint = t
                        break
                    hit = []
                    for kk, mids in pool.items():
                        if contiguous(k2tokens, kk.split()) or (" ".join(k2tokens).replace(" ", "") == kk.replace(" ", "")):
                            hit.extend(m for m in mids if m not in hit)
                    if hit:
                        cands = hit
                        spec_hint = t
                        break
        if not cands:
            return [], "none", txt
        if len(kt) == 1 and len(cands) > 1 and not series_mode:
            return [], "ambiguous", txt
        # 同构候选（仅芯片代次 m1..m9/a16 等一个 token 不同）→ 取最新代
        if len(cands) > 1:
            keys = [nkey_of[c] for c in cands]
            tl = [x.split() for x in keys]
            if len(set(len(x) for x in tl)) == 1:
                diff_cols = [j for j in range(len(tl[0])) if len({t[j] for t in tl}) > 1]
                if len(diff_cols) == 1 and all(re.fullmatch(r"[ma]?\d*", tl[0][diff_cols[0]]) for t in tl):
                    j = diff_cols[0]
                    cands = [cands[max(range(len(tl)), key=lambda i2: int(re.sub(r"\D", "", tl[i2][j]) or 0))]]
        if spec_hint:
            keep = [m for m in cands if any(spec_hint in p["romram"] for p in DIM_PRODUCT if p["model_id"] == m)]
            if keep:
                cands = keep
        return cands, ("exact" if k in pool else ("series" if series_mode else "subset")), txt

    matrix_rows = []
    with open(args.matrix, encoding="utf-8-sig") as f:
        rd = csv.reader(f, delimiter="\t")
        next(rd)
        for r in rd:
            r = [(c or "").strip() for c in r] + [""] * 9
            matrix_rows.append({"country": r[1], "industry_cn": r[2], "series": r[3],
                                "product": r[4], "tier": r[5], "comps": r[6:9]})
    cur = {"country": None, "industry": None, "series": None}
    for m in matrix_rows:
        if m["country"] and m["country"] != cur["country"]:
            cur["country"] = m["country"]
            cur["industry"] = m["industry_cn"] or None
            cur["series"] = m["series"] or None
        cur["industry"] = m["industry_cn"] or cur["industry"]
        cur["series"] = m["series"] or cur["series"]
        m["country"] = cur["country"]
        m["industry"] = cur["industry"]
        m["series"] = cur["series"]

    def split_cell(cell):
        out = []
        for line in (sval(cell) or "").splitlines():
            line = line.strip()
            if not line or line in {"/", "\\", "-"} or re.match(r"(?i)^srp\b", line):
                continue
            line = clean_matrix_text(line)
            alts = [a.strip() for a in line.split("/") if a.strip() and a.strip() not in {"\\", "-"}]
            if alts:
                out.append(alts)   # "Tab S11/S10+" → 备选列表，解析时依次尝试
        return out

    matrix_resolution = []
    bench = []
    unresolved = []
    matrix_tier_decl = {}   # (cc, own model_id) -> (lo, hi) 矩阵声明档位（分国）
    for mi, m in enumerate(matrix_rows):
        cc = cc_of(m["country"])
        ind = INDUSTRY_OF_CN.get(m["industry"] or "")
        entry = {"country": m["country"], "country_code": cc, "industry": m["industry"],
                 "series": m["series"], "tier": m["tier"], "own_raw": m["product"], "own": [], "comps": []}
        matrix_resolution.append(entry)
        if not cc or not ind or not m["product"]:
            if m["product"]:
                unresolved.append({"kind": "own", "text": m["product"], "country": m["country"], "why": "国家/产业缺失"})
            continue
        own_mids, st, txt = resolve_name("HUAWEI", ind, m["product"], strict_own=True)
        entry["own"] = [{"model_id": x, "status": st} for x in own_mids]
        declared = parse_tier_text(m["tier"])
        if declared:
            for om in own_mids:
                matrix_tier_decl[(cc, om)] = declared
        if not own_mids:
            unresolved.append({"kind": "own", "text": txt, "country": cc, "industry": ind, "why": st})
        comp_entries = []
        seen_models = set()
        for ci, cell in enumerate(m["comps"]):
            for alts in split_cell(cell):
                mids, st2, txt2, bguess, name = [], "none", alts[0], "OTHER", alts[0]
                for alt in alts:
                    bguess = guess_brand(alt)
                    mids, st2, txt2 = resolve_name(bguess, ind, alt)
                    name = alt
                    if mids:
                        break
                comp_entries.append({"raw": " / ".join(alts), "brand": bguess, "col": ci + 1,
                                     "substitute": txt2 in substitute_hits,
                                     "models": [{"model_id": x, "status": st2} for x in mids]})
                if not mids:
                    unresolved.append({"kind": "comp", "text": txt2, "country": cc, "industry": ind, "why": st2})
                else:
                    for x in mids:
                        seen_models.add(x)
        entry["comps"] = comp_entries
        for om in own_mids:
            own_cfg = country_configs(om, cc)
            if not own_cfg:
                continue
            sort_by_cfg = Counter()
            seen_pair = set()
            for centry in comp_entries:
                for cm in [x["model_id"] for x in centry["models"]]:
                    comp_cfg = country_configs(cm, cc)
                    if not comp_cfg:
                        continue
                    for own_r, comp_r in pair_configs(own_cfg, comp_cfg, ind):
                        rep = rep_sku(cm, comp_r, cc)
                        if not rep or (own_r, rep) in seen_pair:
                            continue
                        seen_pair.add((own_r, rep))
                        sort_by_cfg[own_r] += 1
                        bench.append({"country_code": cc, "own_model_id": om, "own_romram": own_r,
                                      "competitor_sku_id": rep, "sort": sort_by_cfg[own_r],
                                      "source": "substitute" if centry.get("substitute") else "matrix",
                                      "note": centry["raw"]})
    # 人工对标追加
    for mb in bench_manual:
        cand = [p for p in DIM_PRODUCT
                if p["brand"] == mb["comp_brand"]
                and nkey_of[p["model_id"]] == normkey(mb["comp_brand"], mb["comp_model"])
                and mb["comp_romram"] in ("*", p["romram"])]
        cand = [p for p in cand if mb.get("country", p["countries"][0]) in p["countries"]]
        if not cand:
            unresolved.append({"kind": "manual", "text": str(mb), "why": "未找到竞品 SKU"})
            continue
        bench.append({"country_code": mb.get("country", cand[0]["countries"][0]),
                      "own_model_id": mb["own_model"], "own_romram": mb["own_romram"],
                      "competitor_sku_id": cand[0]["sku_id"], "sort": int(mb.get("sort", 99)),
                      "source": "manual", "note": "manual"})

    # 分国档位：该国矩阵有声明 → 业务声明；否则按该国 RRP（缺则成交价）USD 中位数落产业阶梯。
    # 全局 tier_code = 各国档位的众数（并列取高），仅作无国家上下文时的兜底。
    rrp_cc = raw.dropna(subset=["rrp_usd"]).groupby(["model_id", "cc"])["rrp_usd"].median()
    prc_cc = raw.dropna(subset=["price_usd"]).groupby(["model_id", "cc"])["price_usd"].median()
    ref_cc = rrp_cc.combine_first(prc_cc)
    model_ccs = defaultdict(set)
    for p in DIM_PRODUCT:
        for cc in p["countries"]:
            model_ccs[p["model_id"]].add(cc)
    tier_by_model = {}
    declared_n = 0
    for mid, ccs in model_ccs.items():
        ind = ind_of_model.get(mid)
        per = {}
        for cc in sorted(ccs):
            decl = matrix_tier_decl.get((cc, mid))
            if decl:
                lo, hi = decl
                point = (lo + 0.5) if lo and lo > 0 else ((hi - 0.5) if hi else 0.5)
                per[cc] = tier_code_of(point, ind)
                declared_n += 1
            else:
                v = ref_cc.get((mid, cc))
                per[cc] = tier_code_of(float(v) if v is not None and pd.notna(v) else None, ind)
        cnt = Counter(per.values())
        glob_code = max(cnt.items(), key=lambda kv: (kv[1], tier_rank(kv[0])))[0]
        tier_by_model[mid] = (per, glob_code)
    for p in DIM_PRODUCT:
        per, glob_code = tier_by_model[p["model_id"]]
        p["tier_by_country"] = per
        p["tier_code"] = glob_code
    log["notes"].append(f"分国档位：{declared_n} 个 国家×型号 采用矩阵声明，其余按该国参考价推算")

    # ---------- 4b. 自动竞品匹配（矩阵未覆盖的 国家×我司型号） ----------
    price_med = raw.dropna(subset=["price_usd"]).groupby(["model_id", "cc"])["price_usd"].median()
    matrix_pairs = defaultdict(Counter)       # own model -> Counter(comp model) 跨国矩阵知识
    for entry in matrix_resolution:
        for o in entry["own"]:
            for ce in entry["comps"]:
                for cm in ce["models"]:
                    matrix_pairs[o["model_id"]][cm["model_id"]] += 1
    covered = {(b["country_code"], b["own_model_id"]) for b in bench}
    name_of = {}
    brand_of = {}
    ind_of = {}
    for p in DIM_PRODUCT:
        name_of[p["model_id"]] = p["model_name"]
        brand_of[p["model_id"]] = p["brand"]
        ind_of[p["model_id"]] = p["industry"]
    comp_models_cc = defaultdict(set)         # (cc, industry) -> comp model ids with data
    own_models_cc = set()
    for p in DIM_PRODUCT:
        if p["industry"] not in AUTO_INDUSTRIES:
            continue
        for cc in p["countries"]:
            if p["is_own"]:
                own_models_cc.add((cc, p["model_id"]))
            else:
                comp_models_cc[(cc, p["industry"])].add(p["model_id"])
    auto_rows = []
    auto_bench = 0
    for cc, om in sorted(own_models_cc):
        if (cc, om) in covered:
            continue
        ind = ind_of[om]
        own_price = price_med.get((om, cc))
        own_price = float(own_price) if own_price is not None and pd.notna(own_price) else None
        pool = comp_models_cc.get((cc, ind), set())
        picks = []
        for cm, freq in matrix_pairs[om].most_common():
            if cm in pool and len(picks) < 3:
                picks.append((cm, f"矩阵他国同款竞品（{freq} 国）"))
        if own_price and len(picks) < 3:
            ranked = []
            for cm in pool:
                if any(cm == x[0] for x in picks):
                    continue
                cp = price_med.get((cm, cc))
                if cp is None or pd.isna(cp):
                    continue
                rel = float(cp) / own_price - 1
                if abs(rel) > 0.35:
                    continue
                br = brand_of[cm]
                rank = BRAND_PRIORITY[ind].index(br) if br in BRAND_PRIORITY[ind] else len(BRAND_PRIORITY[ind])
                ranked.append((abs(rel) + 0.04 * rank, rel, rank, cm))
            ranked.sort()
            used_brands = {brand_of[x[0]] for x in picks}
            for _, rel, rank, cm in ranked:          # 先每品牌一个
                if len(picks) >= 3:
                    break
                if brand_of[cm] in used_brands:
                    continue
                used_brands.add(brand_of[cm])
                picks.append((cm, f"同档就近：价差 {rel:+.0%}"))
            for _, rel, rank, cm in ranked:          # 再补足
                if len(picks) >= 3:
                    break
                if any(cm == x[0] for x in picks):
                    continue
                picks.append((cm, f"同档就近：价差 {rel:+.0%}"))
        if not picks:
            auto_rows.append({"cc": cc, "industry": ind, "own": om, "own_price": own_price,
                              "comp": None, "comp_price": None, "reason": "该国无可比竞品数据" if not pool else "无价格或价差>35%"})
            continue
        own_cfg = country_configs(om, cc)
        sort_by_cfg = Counter()
        seen_pair = set()
        for cm, reason in picks:
            cp = price_med.get((cm, cc))
            auto_rows.append({"cc": cc, "industry": ind, "own": om, "own_price": own_price,
                              "comp": cm, "comp_price": float(cp) if cp is not None and pd.notna(cp) else None,
                              "reason": reason})
            comp_cfg = country_configs(cm, cc)
            for own_r, comp_r in pair_configs(own_cfg, comp_cfg, ind):
                rep_id = rep_sku(cm, comp_r, cc)
                if not rep_id or (own_r, rep_id) in seen_pair:
                    continue
                seen_pair.add((own_r, rep_id))
                sort_by_cfg[own_r] += 1
                bench.append({"country_code": cc, "own_model_id": om, "own_romram": own_r,
                              "competitor_sku_id": rep_id, "sort": sort_by_cfg[own_r],
                              "source": "auto", "note": reason})
                auto_bench += 1
    log["notes"].append(f"自动匹配：{len({(r['cc'], r['own']) for r in auto_rows if r['comp']})} 个国家×我司型号补齐竞品，"
                        f"{auto_bench} 条对标；{len([r for r in auto_rows if not r['comp']])} 个无可比对象")
    write_auto_list(args, auto_rows, name_of, brand_of, region_by_cc)

    # ---------- 4c. 对标上限（第115轮评审拍板）：每 国家×我司型号×配置 最多 4 款竞品 ----------
    # 来源优先级：人工 > 矩阵（列序）> 替代 > 自动；先保「每竞品型号至多一款配置」的
    # 品牌覆盖面，槽位富余（<4）时才允许同型号第二配置补位；截断后组内 sort 重排 1..n。
    BENCH_MAX = 4
    bench_priority = lambda b: ({"manual": 0, "matrix": 1, "substitute": 2, "auto": 3}.get(b["source"], 4), b.get("sort", 99))
    bench_groups = defaultdict(list)
    for b in bench:
        bench_groups[(b["country_code"], b["own_model_id"], b["own_romram"])].append(b)
    capped_bench = []
    trimmed_pairs = 0
    for rows in bench_groups.values():
        rows.sort(key=bench_priority)  # 稳定排序：同优先级保持矩阵列序/生成序
        picked, picked_models = [], set()
        for b in rows:  # 第一遍：每竞品型号取一款
            if len(picked) >= BENCH_MAX:
                break
            mid = b["competitor_sku_id"].split("__")[0]
            if mid in picked_models:
                continue
            picked_models.add(mid)
            picked.append(b)
        for b in rows:  # 第二遍：槽位富余补同型号其他配置
            if len(picked) >= BENCH_MAX:
                break
            if b in picked:
                continue
            picked.append(b)
        trimmed_pairs += len(rows) - len(picked)
        for i, b in enumerate(picked):
            b["sort"] = i + 1
        capped_bench.extend(picked)
    over_groups = sum(1 for rows in bench_groups.values() if len(rows) > BENCH_MAX)
    bench = capped_bench
    log["notes"].append(f"对标上限{BENCH_MAX}：{over_groups} 组超限截断 {trimmed_pairs} 条，"
                        f"截断后共 {len(bench)} 条（每配置 ≤{BENCH_MAX} 款竞品）")

    # 每国×产业默认我司型号（矩阵序首个有数型号）
    for m, entry in zip(matrix_rows, matrix_resolution):
        cc = cc_of(m["country"])
        ind = INDUSTRY_OF_CN.get(m["industry"] or "")
        if not cc or not ind:
            continue
        r = region_by_cc.get(cc)
        if r and ind not in r["default_own_models"]:
            for o in entry["own"]:
                if any(p["model_id"] == o["model_id"] and cc in p["countries"] for p in DIM_PRODUCT):
                    r["default_own_models"][ind] = o["model_id"]
                    break
    for p in DIM_PRODUCT:
        if not p["series"]:
            p["series"] = derive_series(p)
    DIM_PRODUCT.sort(key=lambda p: (p["industry"], p["model_id"], p["sku_id"]))

    # ---------- 5. 大促日历 ----------
    dim_promo = []
    promo_rows = []
    with open(args.promos, encoding="utf-8-sig") as f:
        rd = csv.reader(f, delimiter="\t")
        next(rd)
        for r in rd:
            r = [(c or "").strip() for c in r] + [""] * 7
            country, channel, name, s_raw, e_raw, depth = r[1], r[2], r[3], r[4], r[5], r[6]
            cc = PROMO_COUNTRY.get((country or "").strip().lower())
            if not cc:
                if name:
                    promo_rows.append((country, name, "未支持国家"))
                continue
            ps = parse_promo_part(s_raw)
            if not ps:
                promo_rows.append((country, name, "起始日期解析失败"))
                continue
            start = f"2026-{ps[0]:02d}-{ps[1]:02d}"
            pe = parse_promo_part(e_raw) if e_raw else None
            if pe and pe[0] < ps[0]:
                end = f"2027-{pe[0]:02d}-{min(pe[2], month_days(pe[0], 2027)):02d}"
            elif pe:
                end = f"2026-{pe[0]:02d}-{min(pe[2], month_days(pe[0], 2026)):02d}"
            else:
                end = f"2026-{ps[0]:02d}-{min(ps[2], month_days(ps[0], 2026)):02d}"
            pid_tail = slug(name) if slug(name) != "x" else hashlib.md5(name.encode("utf-8")).hexdigest()[:6]
            dim_promo.append({"promo_id": f"{cc}-{pid_tail}-{start}", "country_code": cc,
                              "promo_name": name, "start_date": start, "end_date": end,
                              "depth_hint": DEPTH_MAP.get(depth, "中"),
                              "platforms": PROMO_PLATFORMS.get(fold(channel).lower()), "channel_raw": channel})
            promo_rows.append((country, name, f"{start}→{end} {DEPTH_MAP.get(depth, '中')}"))

    # ---------- 6. 事实列式包 ----------
    raw = raw.sort_values(["cc", "sku_id", "week_id", "平台", "店铺类型"])
    pk = raw.rename(columns={"官网建议零售价-本币": "rrp", "官网成交价-本币": "op",
                             "平台建议零售价-本币": "lp", "平台成交价-本币": "p",
                             "官网折扣率": "do", "平台显示折扣率": "dd", "平台实际折扣率": "da",
                             "分期付款": "inst", "促销政策": "promo", "网址链接": "url",
                             "截图命名": "shot", "店铺名称": "seller"})
    wk_idx = {w: i for i, w in enumerate(week_ids)}
    sku_list = sorted(pk["sku_id"].unique())
    sku_idx = {s: i for i, s in enumerate(sku_list)}
    ch_list = sorted({channel_of[(cc, pf, st)] for cc, pf, st in zip(pk["cc"], pk["平台"], pk["店铺类型"])})
    ch_idx = {c: i for i, c in enumerate(ch_list)}
    dict_arrs = {"url": [], "shot": [], "inst": [], "promo": [], "seller": []}
    dict_pos = {k: {} for k in dict_arrs}

    def didx(kind, val):
        pos = dict_pos[kind]
        i = pos.get(val)
        if i is None:
            i = len(dict_arrs[kind])
            dict_arrs[kind].append(val)
            pos[val] = i
        return i

    def nd(v):
        return None if pd.isna(v) else float(v)

    cols = defaultdict(list)
    for r in pk.itertuples():
        cid = channel_of[(r.cc, getattr(r, "平台"), getattr(r, "店铺类型"))]
        cols["w"].append(wk_idx[r.week_id])
        cols["s"].append(sku_idx[r.sku_id])
        cols["h"].append(ch_idx[cid])
        cols["rrp"].append(nd(r.rrp))
        cols["op"].append(nd(r.op))
        cols["lp"].append(nd(r.lp))
        cols["p"].append(nd(r.p))
        cols["fx"].append(round(float(r.汇率), 4))
        cols["do"].append(nd(r.do))
        cols["dd"].append(nd(r.dd))
        cols["da"].append(nd(r.da))
        cols["b"].append(1 if r.bundle else 0)
        cols["inst"].append(didx("inst", sval(r.inst) or None))
        cols["promo"].append(didx("promo", sval(r.promo) or None))
        cols["url"].append(didx("url", sval(r.url) or ""))
        cols["shot"].append(didx("shot", sval(r.shot) or ""))
        cols["seller"].append(didx("seller", sval(r.seller) or "—"))
        cols["t"].append(r.crawled_at)
    pack = {"v": 1, "weeks": week_ids, "skus": sku_list, "channels": ch_list,
            "dict": dict_arrs, "cols": dict(cols)}
    blob = json.dumps(pack, ensure_ascii=False, separators=(",", ":"))
    gz = gzip.compress(blob.encode("utf-8"), 9)
    b64 = base64.b64encode(gz).decode("ascii")
    with open(os.path.join(args.outdir, "fact_pack_gzip.b64.txt"), "w") as f:
        f.write(b64)
    with open(os.path.join(args.workdir, "fact_expanded.json"), "w", encoding="utf-8") as f:
        f.write(blob)
    log["notes"].append(f"事实包 {len(cols['w']):,} 行；b64 {len(b64):,} B（gzip {len(gz):,} B）")

    # ---------- 7. 落盘 JSON ----------
    def dump(name, obj):
        with open(os.path.join(args.outdir, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    dump("dim_region.json", dim_region)
    dump("dim_product.json", DIM_PRODUCT)
    dump("dim_channel.json", dim_channel)
    dump("dim_time.json", weeks)
    dump("dim_fx.json", dim_fx)
    dump("dim_promo.json", dim_promo)
    dump("dim_benchmark.json", bench)
    ladders = {}
    for ind, lad in TIER_LADDERS.items():
        codes, lo = [], 0
        for hi in lad:
            codes.append(f"<{int(hi)}" if lo == 0 else f"{int(lo)}-{int(hi)}")
            lo = hi
        codes.append(f"{int(lad[-1])}+")
        ladders[ind] = codes
    dump("dim_tier.json", {"ladders": ladders,
                           "labels": {ind: {c: tier_label(ind, c) for c in codes} for ind, codes in ladders.items()}})
    with open(os.path.join(args.workdir, "matrix_resolution.json"), "w", encoding="utf-8") as f:
        json.dump(matrix_resolution, f, ensure_ascii=False, indent=1)

    write_report(args, log, raw, dim_region, bench, unresolved, matrix_resolution,
                 promo_rows, len(b64), len(gz))
    print(f"[ingest] dim_product {len(DIM_PRODUCT)} SKU / dim_benchmark {len(bench)} / "
          f"dim_promo {len(dim_promo)} / fact b64 {len(b64):,}B / 未解析 {len(unresolved)}")


def _wk(v):
    d = parse_datetime_cell(v)
    if d is None:
        return None
    w = to_week_wed(d)
    y, wn, _ = w.isocalendar()
    return f"{y}{wn:02d}", w.strftime("%Y-%m-%d")


def tier_label(industry, code):
    m = re.match(r"<(\d+)", code)
    if m:
        return f"入门 · <${int(m.group(1))}"
    m = re.match(r"(\d+)-(\d+)", code)
    if m:
        return f"${int(m.group(1)):,}–{int(m.group(2)):,}"
    m = re.match(r"(\d+)\+", code)
    return f"旗舰 · ${int(m.group(1))}+" if m else code


def write_auto_list(args, rows, name_of, brand_of, region_by_cc):
    """自动匹配清单：docs/竞品自动匹配清单-<日期>.md + .xlsx（供业务讨论勾兑）。"""
    docs = os.path.join(REPO, "docs")
    os.makedirs(docs, exist_ok=True)
    day = datetime.now().strftime("%Y-%m-%d")
    ind_cn = {"phone": "手机", "tablet": "平板", "wearable": "穿戴", "audio": "音频"}
    L = [f"# 竞品自动匹配清单（{day}）", "",
         "矩阵未覆盖的「国家 × 我司型号」由规则自动配竞品：优先沿用产品竞品矩阵在其他国家给同一我司型号配过的竞品（有该国数据者），不足 3 个时按同产业、价差 ±35% 内就近补齐（品牌优先序：手机 Apple>Samsung>Xiaomi>Honor>OPPO>vivo；平板 Apple>Samsung>Xiaomi>Honor>Lenovo；穿戴 Apple>Samsung>Garmin>Xiaomi>Honor>Amazfit；音频 Apple>Samsung>Sony>Bose>Xiaomi>JBL>Soundcore），每品牌先取一个。价格 = 该国平台成交价 USD 中位数（全渠道）。",
         "", "**请逐行勾兑：保留 / 替换 / 删除**，结论回填 `pricelens/data/real/overrides.json` 的 `benchmark_manual` 或告知后由我更新规则。", ""]
    by = defaultdict(list)
    for r in rows:
        by[(r["cc"], r["industry"])].append(r)
    for (cc, ind) in sorted(by, key=lambda k: (region_by_cc[k[0]]["sort"], k[1])):
        L.append(f"## {region_by_cc[cc]['country_name']}（{cc}）· {ind_cn.get(ind, ind)}")
        L.append("")
        L.append("| 我司型号 | 我司中位价 USD | 竞品 | 竞品中位价 USD | 价差 | 依据 |")
        L.append("|---|---|---|---|---|---|")
        for r in by[(cc, ind)]:
            own = name_of.get(r["own"], r["own"])
            op = f"{r['own_price']:,.0f}" if r["own_price"] else "—"
            if r["comp"]:
                comp = f"{brand_of[r['comp']]} {name_of[r['comp']]}"
                cp = f"{r['comp_price']:,.0f}" if r["comp_price"] else "—"
                diff = f"{r['comp_price'] / r['own_price'] - 1:+.0%}" if r["comp_price"] and r["own_price"] else "—"
            else:
                comp, cp, diff = "（无）", "—", "—"
            L.append(f"| {own} | {op} | {comp} | {cp} | {diff} | {r['reason']} |")
        L.append("")
    with open(os.path.join(docs, f"竞品自动匹配清单-{day}.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    try:
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "自动匹配清单"
        ws.append(["国家", "产业", "我司型号", "我司中位价USD", "竞品品牌", "竞品型号", "竞品中位价USD", "价差", "依据", "业务结论(保留/替换/删除)", "备注"])
        for r in sorted(rows, key=lambda r: (region_by_cc[r["cc"]]["sort"], r["industry"], r["own"])):
            ws.append([region_by_cc[r["cc"]]["country_name"], ind_cn.get(r["industry"], r["industry"]), name_of.get(r["own"], r["own"]),
                       round(r["own_price"]) if r["own_price"] else None,
                       brand_of.get(r["comp"], "") if r["comp"] else "", name_of.get(r["comp"], "") if r["comp"] else "（无）",
                       round(r["comp_price"]) if r["comp_price"] else None,
                       (round(r["comp_price"] / r["own_price"] - 1, 3) if r["comp_price"] and r["own_price"] else None),
                       r["reason"], "", ""])
        for col, w in zip("ABCDEFGHIJK", [10, 8, 24, 14, 12, 28, 14, 8, 30, 22, 20]):
            ws.column_dimensions[col].width = w
        ws.freeze_panes = "A2"
        wb.save(os.path.join(docs, f"竞品自动匹配清单-{day}.xlsx"))
    except Exception as e:  # openpyxl 缺失不阻塞
        print("[ingest] xlsx 清单未生成:", e)


def write_report(args, log, raw, dim_region, bench, unresolved, matrix_resolution,
                 promo_rows, b64_len, gz_len):
    L = ["# 真实数据接入报告（scripts/ingest_real.py）", "",
         f"生成时间：{datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')}", "",
         "## 一、总体", ""]
    L += [f"- {n}" for n in log["notes"]]
    L += [f"- 修正：{k} {v} 行" for k, v in sorted(log["fixed"].items())]
    L += [f"- 剔除：{k} {v} 行" for k, v in sorted(log["dropped"].items())]
    L += ["", "## 二、覆盖面（有数国家）", "", "| 国家 | 周数 | SKU | 事实行 | 默认电渠 | 核心电渠 |",
          "|---|---|---|---|---|---|"]
    for r in dim_region:
        if not r["enabled"]:
            continue
        sub = raw[raw["cc"] == r["country_code"]]
        L.append(f"| {r['country_name']}({r['country_code']}) | {sub['week_id'].nunique()} | "
                 f"{sub['sku_id'].nunique():,} | {len(sub):,} | {r['default_platform']} | {','.join(r['core_platforms'])} |")
    L += ["", "## 三、矩阵解析未命中清单", "", f"共 {len(unresolved)} 条：", ""]
    for u in unresolved:
        L.append(f"- [{u['kind']}] {u.get('country', '')} {u.get('industry', '')}「{u['text']}」：{u['why']}")
    L += ["", "## 四、对标样例（每国前 8 条）", ""]
    seen = Counter()
    for b in bench:
        if seen[b["country_code"]] >= 8:
            continue
        seen[b["country_code"]] += 1
        sku = next((p for p in DIM_PRODUCT if p["sku_id"] == b["competitor_sku_id"]), None)
        label = f"{sku['brand']} {sku['model_name']} {sku['romram']}" if sku else b["competitor_sku_id"]
        L.append(f"- {b['country_code']}｜{b['own_model_id']} {b['own_romram']} ← {label}（sort {b['sort']}）")
    L += ["", "## 五、大促日历解析", ""]
    L += [f"- {c}｜{n}｜{st}" for c, n, st in promo_rows]
    rep = os.path.join(args.workdir, "ingest_report.md")
    with open(rep, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"[ingest] 报告 → {rep}")


if __name__ == "__main__":
    main()
