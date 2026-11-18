#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据包 v3（原表模式）→ v2 规范化包 + SQLite 落库（PriceLens 本机服务器引擎）。

与前端 src/dataModel/offerIngest.ts 逐段对齐（2026-11-18 权威口径：零内置规则，
配置表是唯一规则源，config.json 注入）；编码段对齐 src/data/index.ts
encodeFactPackB64（列存本币价、周/SKU/渠道索引、五字典去重、gzip+base64）。

纯标准库实现——v3 JSON 输入逐行处理（与前端逐字对齐零失真），无需 pandas；
「原表 vs 我们加的」在 SQLite 里一眼可分：ODS 原样层零派生列，全部派生内容
落独立匹配小表（map_*），维表/事实另列（Eason 2026-11-18 拍板：降低理解成本）。

行内常量（国家/平台/店铺/品类字典）为解析器出厂词汇；config.json 的
dictionaries 段可全量覆盖（WP-C 起与前端配置表同源）。
"""
import base64
import gzip
import json
import math
import os
import re
import sqlite3
import unicodedata
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))

# ================================================================ 常量
# （对齐 src/dataModel/ingestText.ts——WP-C 起可被 config.json dictionaries 覆盖）
BRAND_TOKENS = {
    "APPLE": ["apple"], "SAMSUNG": ["samsung", "galaxy", "三星"], "XIAOMI": ["xiaomi", "poco", "小米"],
    "HONOR": ["honor", "荣耀"], "HUAWEI": ["huawei", "华为"], "GARMIN": ["garmin"], "AMAZFIT": ["amazfit"],
    "SOUNDCORE": ["soundcore", "anker"], "SHOKZ": ["shokz"], "SONY": ["sony"], "JBL": ["jbl"],
    "AIMOTO": ["aimoto"],
    "BOSE": ["bose"], "COROS": ["coros", "高驰"], "LENOVO": ["lenovo", "motorola", "smartfon"],
    "OPPO": ["oppo"], "REALME": ["realme"], "NOTHING": ["nothing"], "FITBIT": ["fitbit"],
    "WHOOP": ["whoop"], "ASUS": ["asus"], "HP": ["hp"], "INFINIX": ["infinix"],
    "TRANSSION": ["transsion"], "VIVO": ["vivo"], "ZTE": ["zte"], "TP-LINK": ["tp-link", "tplink"],
    "TENDA": ["tenda"], "CUDY": ["cudy"], "MERCURY": ["mercury"],
}
STRIP_TOKENS = {
    "5g", "4g", "wifi", "lte", "dual", "sim", "esim", "版", "代", "系列",
    "series", "collection", "smartfon", "tablet", "new", "earbuds", "buds",
    "smart", "mi", "gb", "tb", "gen", "th", "rd", "st", "nd",
    "szary", "rysik", "klawiatura", "matowy", "ekran", "matt", "英寸", "寸",
}
INDUSTRY_OF_CAT = {
    "smartphone": "phone", "tablets": "tablet", "tablet": "tablet", "wearables": "wearable",
    "wearable": "wearable", "smartphones": "phone", "phone": "phone", "earbud": "audio",
    "earbuds": "audio", "iot": "iot", "pc": "pc", "personal computer": "pc",
    "手机": "phone", "平板": "tablet", "穿戴": "wearable", "音频": "audio",
}
PLATFORM_ALIASES = {
    "mercadolibre": "Mercado Libre", "amazon méxico": "Amazon", "amazon mexico": "Amazon",
    "mercadolivre": "Mercado Libre", "amazon.sa": "Amazon", "amazon tr": "Amazon",
    "amazon.de": "Amazon", "amazon.com.tr": "Amazon", "mediamarkt tr": "MediaMarkt",
    "vatan bilgisayar": "Vatan",
    "m.video": "Mvideo", "m video": "Mvideo", "mvm": "Mvideo",
}
STORE_ALIASES = {
    "平台型零售商": "1P", "平台第三方卖家": "3P", "marketplace": "3P",
    "跨境3p": "3P", "3p_international": "3P", "官网": "独立站",
}
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
SERIES_NAME_MARKERS = [
    "iphone", "ipad", "macbook", "mac ", "airpods",
    "galaxy", "redmi", "poco", "magic",
    "mate", "pura", "nova", "enjoy", "freebuds", "freearc", "freeclip",
    "watch gt", "watch fit", "watch ultimate", "watch kids", "watch d",
    "thinkpad", "ideapad", "yoga",
]
COLUMN_ALIASES = [
    ("品类", ["类别", "品类名称"]),
    ("型号", ["商品型号", "型号名称"]),
    ("型号规格", ["规格", "商品规格"]),
    ("国家/地区", ["国家地区", "国家", "地区"]),
    ("平台", ["电商平台", "渠道平台"]),
    ("店铺类型", ["渠道类型"]),
    ("店铺名称", ["卖家名称"]),
    ("显示店铺名称", ["展示店铺名称"]),
    ("时间周期", ["周期", "日期"]),
    ("采集时间", ["抓取时间", "采集日期"]),
    ("是否组合销售", ["是否组合"]),
    ("网址链接", ["网址"]),
    ("截图命名", ["截图"]),
]
# ODS 22 规范列（数据架构方案 A1；落库列名）
ODS_COLUMNS = [
    "period", "category", "brand", "model", "spec", "platform", "country", "store_type",
    "shop", "shop_disp", "rrp_local", "price_local", "currency", "fx", "bundle",
    "installment", "promo", "discount_display", "discount_actual", "url", "screenshot",
    "crawled_at",
]
# 原键 → 规范列（列名归一结果映射到 ODS 列；Category1/2/info 进 extra 保留）
FIELD_TO_ODS = {
    "时间周期": "period", "品类": "category", "品牌": "brand", "型号": "model",
    "型号规格": "spec", "Category1": "cat1", "Category2": "cat2", "info": "info",
    "平台": "platform", "国家/地区": "country", "店铺类型": "store_type",
    "店铺名称": "shop", "显示店铺名称": "shop_disp",
    "平台建议零售价-本币": "rrp_local", "平台成交价-本币": "price_local",
    "货币": "currency", "汇率": "fx", "是否组合销售": "bundle",
    "分期付款": "installment", "促销政策": "promo",
    "平台显示折扣率": "discount_display", "平台实际折扣率": "discount_actual",
    "网址链接": "url", "截图命名": "screenshot", "采集时间": "crawled_at",
}

# ================================================================ 小工具（JS 语义对齐）


def jstr(v):
    """JS String() + trim + 'nan'/'NaT'/'None'/'null' → ''（offerIngest.str）"""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return ""
        return repr(v) if not v.is_integer() else str(int(v))
    s = str(v).strip()
    return "" if s in ("nan", "NaT", "None", "null") else s


def jnum(v):
    """JS Number()（offerIngest.num）：去逗号 parseFloat，非法/NaN → None"""
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v) if math.isfinite(v) else None
    try:
        return float(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return None


def jr2(x):
    """JS Math.round(x*100)/100（半上舍入，对齐前端 round2）"""
    return math.floor(x * 100 + 0.5) / 100


def jr4(x):
    return math.floor(x * 10000 + 0.5) / 10000


def jr10(x):
    return math.floor(x * 10 + 0.5) / 10


def median_of(values):
    if not values:
        return None
    s = sorted(values)
    mid = len(s) >> 1
    return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2


def pad2(n):
    return f"{n:02d}"


def date_str(d):
    return f"{d.year}-{pad2(d.month)}-{pad2(d.day)}"


def time_str(d):
    return f"{date_str(d)} {pad2(d.hour)}:{pad2(d.minute)}"


def fold(s):
    """NFKD 折叠去组合音标（ingestText.fold）"""
    if s is None:
        return ""
    return "".join(c for c in unicodedata.normalize("NFKD", str(s)) if not unicodedata.combining(c))


def slug(s):
    """id slug：非 [0-9a-z] 归 -、收边、叠 - 压平；空回 'x'（ingestText.slug）"""
    out = fold(s).lower()
    out = re.sub(r"[^0-9a-z]+", "-", out)
    out = re.sub(r"^-+|-+$", "", out)
    out = re.sub(r"-{2,}", "-", out)
    return out or "x"


def normkey(brand, name):
    """型号归一键（ingestText.normkey）：折音、去品牌词/连接词/年份、字母数字边界切分"""
    s = fold(name).lower()
    s = re.sub(r"\b(5g|4g|lte|wi-?fi\d?|esim|e-sim|dual\s*sim)\b", " ", s)
    s = re.sub(r"(\d)\.(\d)", r"\1§\2", s)  # 保护小数点
    s = re.sub(r"([\u4e00-\u9fff]+)", r" \1 ", s)
    s = re.sub(r"[（）()[\]{}“”\"'‘’·，,。.:：;；！!？?\\|/／+\-–—]+", " ", s)
    s = re.sub(r"([a-z]+)(\d)", r"\1 \2", s)
    s = re.sub(r"(\d)([a-z]+)", r"\1 \2", s)
    s = s.replace("§", ".")
    bts = set(BRAND_TOKENS.get(brand, []))
    out = []
    for raw in s.split():
        t = re.sub(r"^[.-]+|[.-]+$", "", raw)
        if not t or t in bts or t in STRIP_TOKENS:
            continue
        if re.match(r"^(19|20)\d\d$", t):
            continue
        out.append(t)
    return " ".join(out)


def industry_of_cat(raw):
    return INDUSTRY_OF_CAT.get(fold(raw).strip().lower())


def cc_of(name):
    return COUNTRY_CODES.get(fold(name).strip().lower())


def parse_pct(v):
    """折扣率 → 负小数（ingestText.parsePct）：'-15%' / '15%' / -0.15 全收"""
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        n = float(v)
        if -1 <= n <= 0:
            return n
        if 0 < n <= 1:
            return -n
        return None
    s = str(v).replace("−", "-").strip()
    m = re.match(r"^-?\s*(\d+(?:\.\d+)?)\s*%$", s)
    return -abs(float(m.group(1))) / 100 if m else None


def title_case_color(c):
    return title_color(c)


def unit_free_color(c):
    s = str(c if c is not None else "").strip()
    return "—" if re.match(r"^(gb|tb|g|t)$", s, re.I) else title_color(s)


def title_color(c):
    s = re.sub(r"\s+", " ", str(c if c is not None else "")).strip()
    if not s or s in ("-", "\\", "/"):
        return "—"
    return s[0].upper() + s[1:]


FMT_CACHE = {}


def fmt_num(n):
    """JS Number(n.toFixed(2)) → '12' / '11.5'（去尾零，salesIngest.fmtNum）"""
    v = jr2(float(n))
    if v == int(v):
        return str(int(v))
    return repr(v)


def parse_datetime_cell(v):
    """单元格 → datetime（Excel 序列 / ISO 串；失败 None）。ingestText.parseDatetimeCell"""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day)
    s = str(v).strip()
    if not s:
        return None
    if re.match(r"^\d+(\.\d+)?$", s):
        serial = float(s)
        try:
            base = datetime(1899, 12, 30)
            d = base + timedelta(days=serial)
        except OverflowError:
            return None
        return d
    no_tz = re.sub(r"\s*\+\d{2}:?\d{2}$", "", s)
    fmts = [
        (re.compile(r"^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})"), True),
        (re.compile(r"^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$"), True),
        (re.compile(r"^(\d{4})-(\d{2})-(\d{2})$"), True),
    ]
    for rx, _ in fmts:
        m = rx.match(no_tz)
        if m:
            g = m.groups()
            hh = int(g[3]) if len(g) > 3 else 0
            mi = int(g[4]) if len(g) > 4 else 0
            ss = int(g[5]) if len(g) > 5 else 0
            return datetime(int(g[0]), int(g[1]), int(g[2]), hh, mi, ss)
    # JS new Date(s) 兜底：常见斜杠/紧凑格式
    m = re.match(r"^(\d{4})/(\d{1,2})/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?", s)
    if m:
        g = m.groups()
        return datetime(int(g[0]), int(g[1]), int(g[2]), int(g[3] or 0), int(g[4] or 0))
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def to_week_wed(d):
    """日期 → 所在 ISO 周的周三（ingestText.toWeekWed）。Python weekday() 周一=0…
    周日=6，与 JS (getDay()+6)%7 的周一=0 同义，直接用。"""
    monday = d - timedelta(days=d.weekday())
    return monday + timedelta(days=2)


def iso_week_of(d):
    """ISO 周号（周四所在年为准；ingestText.isoWeekOf）"""
    target = date(d.year, d.month, d.day)
    day_nr = target.weekday()
    target = target - timedelta(days=day_nr) + timedelta(days=3)  # 本周四
    first_thursday = date(target.year, 1, 4)
    f_day_nr = first_thursday.weekday()
    first_thursday = first_thursday - timedelta(days=f_day_nr) + timedelta(days=3)
    week = 1 + round((target - first_thursday).days / 7)
    return target.year, week


def week_of(v):
    """周期单元格 → (week_id, 周三日期)；YYYY0WW/YYYYWW 原样收（ingestText.weekOf）"""
    s = str(v if v is not None else "").strip()
    if re.match(r"^\d{7}$", s) and s[4] == "0":
        y, w = s[:4], int(s[5:])
        if 1 <= w <= 53:
            return f"{y}{pad2(w)}", ""
    if re.match(r"^\d{6}$", s):
        w = int(s[4:])
        if 1 <= w <= 53:
            return s, ""
    d = parse_datetime_cell(v)
    if not d:
        return None
    w = to_week_wed(d)
    y, wk = iso_week_of(w)
    return f"{y}{pad2(wk)}", date_str(w)


def week_wed_of(week_id):
    """ISO 周 → 周三日期（offerIngest.weekWedOf）"""
    year, week = int(week_id[:4]), int(week_id[4:])
    jan4 = date(year, 1, 4)
    week1_monday = jan4 - timedelta(days=jan4.weekday())
    return week1_monday + timedelta(days=(week - 1) * 7 + 2)


ALL_NAME_MARKERS = sorted(
    [t for ts in BRAND_TOKENS.values() for t in ts] + SERIES_NAME_MARKERS, key=len, reverse=True
)


def is_brand_inline(model_name):
    t = fold(model_name).lower()
    if not t:
        return True
    return not any(tok in t for tok in ALL_NAME_MARKERS)


# ================================================================ 列名归一（mapSourceColumns）


def base_header(col):
    base = re.split(r"\\n|\n", str(col), 1)[0].strip()
    base = re.sub(r"（[^）]*）|\([^)]*\)", "", base).strip()
    return base


def map_source_columns(header_keys):
    base_of = {}
    for key in header_keys:
        base_of[key] = base_header(key)
    present = {b for b in base_of.values() if b}
    spec_present = any(c in present for c in ("Category1", "Category2", "info", "tech_date"))
    col_map = {k: b for k, b in base_of.items() if b}
    for canonical, candidates in COLUMN_ALIASES:
        if canonical in present:
            continue
        source = next((c for c in candidates if c in present), None)
        if not source:
            continue
        for k, b in base_of.items():
            if b == source:
                col_map[k] = canonical
    if spec_present:
        for k, b in base_of.items():
            if b == "tech_date":
                col_map[k] = "时间周期"
            elif b in ("Category1", "Category2", "info"):
                col_map[k] = b
    have = lambda name: name in set(base_of.values())
    missing = []
    for name in ["时间周期", "品类", "品牌", "型号", "平台", "国家/地区", "店铺类型", "货币", "汇率"]:
        if not have(name) and not (name == "时间周期" and spec_present):
            missing.append(name)
    return col_map, missing, spec_present


# ================================================================ 规格拆列（salesIngest 辅助 + parseRomram）


def storage_parse(raw):
    """存储文本 → (ram, romGB, romUnit)；salesIngest.storageParse"""
    if raw is None:
        return None
    s = str(raw).lower().strip()
    if not s or s in ("—", "-", "规格未标明"):
        return None
    has_sep = bool(re.search(r"[+/]", s))
    tokens = []
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(tb|t|gb|g)?(?=[\s+/]|$)", s):
        unit = m.group(2)
        tokens.append({"n": float(m.group(1)), "tb": unit in ("tb", "t")})
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
    rom_gb = rom["n"] * 1024 if rom["tb"] else rom["n"]
    ram_n = 0
    if ram is not None:
        ram_n = ram["n"] * 1024 if ram["tb"] else ram["n"]
    return ram_n, rom_gb, ("TB" if rom["tb"] else "GB")


def normalize_storage(raw):
    p = storage_parse(raw)
    if not p:
        return ""
    ram, rom, unit = p
    rom_s = fmt_num(rom / 1024) if unit == "TB" else fmt_num(rom)
    return f"{fmt_num(ram)}+{rom_s} {unit}" if ram > 0 else f"{rom_s} {unit}"


def normalize_case_size(raw):
    if raw is None:
        return None
    m = re.search(r"(\d{2}(?:\.\d+)?)\s*mm\b", str(raw), re.I)
    return f"{fmt_num(float(m.group(1)))}mm" if m else None


def normalize_screen(raw):
    if raw is None:
        return None
    m = re.search(r"(\d{1,2}(?:\.\d+)?)\s*(?:['\"“”″寸]|\-?inch\b|\bin\b)", str(raw), re.I)
    return f'{fmt_num(float(m.group(1)))}"' if m else None


def strip_screen_prefix(romram):
    return re.sub(r"^\s*\d{1,2}(?:\.\d+)?\s*(?:['\"“”″寸]|\-?inch\b|\bin\b)\s*", "", str(romram), flags=re.I).strip()


def normalize_screen_column(raw):
    if raw is None:
        return None
    s = str(raw).strip()
    n = normalize_screen(s)
    if n:
        return n
    return f'{fmt_num(float(s))}"' if re.match(r"^\d{1,2}(\.\d+)?$", s) else None


def parse_romram(industry, spec):
    """型号规格 → (romram, rom_key, color, color_key)；offerIngest.parseRomram 四分支"""
    s = str(spec if spec is not None else "").strip()
    if not s or s in ("-", "\\", "/"):
        return "—", "std", "—", "—"
    if industry == "phone":
        m = re.match(r"^(\d+)\s*\+\s*(\d+)\s*(TB|T|GB|G)?\s*(?:GB)?\s+(.+)$", s, re.I)
        if m:
            unit = "TB" if (m.group(3) or "").upper().startswith("T") else "GB"
            disp = f"{m.group(1)}+{m.group(2)} {unit}"
            color = unit_free_color(m.group(4))
            return disp, f"{m.group(1)}+{m.group(2)}{unit}".lower(), color, color
        m = re.match(r"^(\d+)\s*(GB|TB|T)\s+(.+)$", s, re.I)
        if m:
            unit = "TB" if m.group(2).upper().startswith("T") else "GB"
            disp = f"{m.group(1)} {unit}"
            color = unit_free_color(m.group(3))
            return disp, f"{m.group(1)}{unit}".lower(), color, color
        return s, slug(s), title_color(s), title_color(s)
    if industry == "tablet":
        parts = [p.strip() for p in s.split("/")]
        size = next((p for p in parts if re.match(r"^\d+(\.\d+)?(″|\"|in)", p, re.I)), "")
        conn_map = {"WIFI": "WiFi", "CELLULAR": "Cellular", "5G": "5G", "5G LTE": "5G",
                    "5G LTE+WIFI": "5G", "NG LTE": "LTE"}
        conn_raw = next((p for p in parts if p.upper() in
                         ("WIFI", "LTE", "5G", "5G LTE", "5G LTE+WIFI", "CELLULAR", "NG LTE")), "")
        conn = conn_map.get(conn_raw.upper(), conn_raw)
        mem = next((p for p in parts if re.search(r"\d+\s*\+\s*\d+", p)), "")
        memd = ""
        mm = re.search(r"(\d+)\s*\+\s*(\d+)\s*(TB|GB|G)?", mem, re.I)
        if mm:
            romd = mm.group(2) + (" TB" if (mm.group(3) or "").upper().startswith("T") else " GB")
            memd = f"{mm.group(1)}+{romd}"
        variant = next((p for p in parts if p.lower() in ("papermatte", "nano-texture glass")), "")
        key = "".join([x for x in (size, conn, memd, variant) if x]).replace('"', "in").replace("″", "in").replace(" ", "").lower()
        disp = " ".join([x for x in (size, memd, variant) if x]) or "—"
        return disp, key, conn or "—", "—"
    if industry == "wearable":
        conn_pat = re.compile(r"\b(GPS\s*\+\s*Cellular|Cellular|LTE|GPS|Bluetooth|WiFi)\b", re.I)
        tech_pat = re.compile(r"\b(AMOLED|Solar)\b", re.I)
        conns = [re.sub(r" ", "", m.group(1).upper()) for m in conn_pat.finditer(s)]
        techs = [m.group(1) for m in tech_pat.finditer(s)]
        rest = conn_pat.sub("", tech_pat.sub("", s)).strip()
        rest = re.sub(r"^[\s/-]+|[\s/-]+$", "", rest)
        ms = re.match(r"^(\d+(?:\.\d+)?)\s*mm\s*(.*)$", rest, re.I)
        size = None
        color = rest
        if ms:
            size = f"{ms.group(1)}mm"
            color = ms.group(2).strip() or "—"
        letter = re.compile(r"(^|[\s+/\-])([^\W\d_])", re.U)

        def title_case(v):
            return letter.sub(lambda m: m.group(1) + m.group(2).upper(), v.lower())
        uniq_conns = []
        for c in conns:
            t = title_case(c).replace("Gps", "GPS").replace("Lte", "LTE")
            if t not in uniq_conns:
                uniq_conns.append(t)
        variant = " ".join(sorted(uniq_conns + techs))
        disp = " ".join([x for x in (size, variant) if x]) or "—"
        color_disp = title_color(color) if color != "—" else "—"
        key = "std" if disp == "—" else disp.replace(" ", "").lower()
        label = " ".join([x for x in (disp if disp != "—" else "", color_disp if color_disp != "—" else "") if x])
        return "—", key, label or "—", color_disp
    if industry == "pc":
        cpu = re.match(r"^(.*?)\s*\|", s)
        ram = re.search(r"RAM:\s*(\d+)", s, re.I)
        sto = re.search(r"STO:\s*(\d+(?:\.\d+)?)\s*(TB|GB)?", s, re.I)
        ramd = f"{ram.group(1)}+" if ram else ""
        stod = (sto.group(1) + (" TB" if (sto.group(2) or "").upper().startswith("T") else " GB")) if sto else ""
        disp = ((f"{cpu.group(1).strip()} " if cpu else "") + ramd + stod).strip() or s
        return disp, disp.replace(" ", "").lower(), "—", "—"
    return "—", "std", title_color(s), title_color(s)


def romram_from_spec_cats(industry, cat1, cat2, info):
    """规格拆列形态 → 同构部件（offerIngest.romramFromSpecCats）"""
    c1 = str(cat1 if cat1 is not None else "").strip()
    c2 = str(cat2 if cat2 is not None else "").strip()
    inf = str(info if info is not None else "").strip()
    color = title_color(inf) if inf else "—"
    color_key = slug(inf) if inf else "—"
    if industry == "phone":
        return (normalize_storage(c1) if c1 else "—"), (slug(c1) if c1 else "std"), color, color_key
    if industry == "tablet":
        screen = (normalize_screen_column(c2) or c2) if c2 else ""
        romram = " ".join([x for x in (screen, normalize_storage(c1) if c1 else "") if x]) or "—"
        key = "".join(slug(x) for x in (c1, c2) if x) or "std"
        return romram, key, color, color_key
    if industry == "wearable":
        size = normalize_case_size(c1)
        return (size if size else "—"), (slug(c1) if c1 else "std"), color, color_key
    return "—", "std", color, color_key


# ================================================================ 系列与档位（offerSeries 对等）


def fill_template(template, capture):
    def repl(m):
        return (capture or "") if m.group(1) == "n" else (capture or "").strip()
    return re.sub(r"\{([nw])\}", repl, template).strip()


def compile_series_rule(rule):
    brand = str(rule.get("brand", "")).strip()
    series = str(rule.get("series", "")).strip()
    pattern = str(rule.get("pattern", "")).strip()
    if not brand or not series or not pattern:
        return None
    if pattern.lower().startswith("re:"):
        try:
            return {"brand": brand, "rx": re.compile(pattern[3:], re.I), "prefix": None, "series": series}
        except re.error:
            return None
    return {"brand": brand, "rx": None, "prefix": pattern, "series": series}


def series_of_model(brand, model_name, is_own, own_norm_key, custom_rules):
    if custom_rules:
        for rule in custom_rules:
            compiled = compile_series_rule(rule)
            if not compiled or compiled["brand"].lower() != brand.lower():
                continue
            if compiled["rx"] is not None:
                m = compiled["rx"].search(model_name)
                if m:
                    return fill_template(compiled["series"], m.group(1) if m.groups() else None)
            elif compiled["prefix"] is not None:
                p = compiled["prefix"]
                if model_name.lower().startswith(p.lower()) or own_norm_key.startswith(re.sub(r"\s+", "", p.lower())):
                    return compiled["series"]
    if is_own:
        return (model_name.split() or ["其他"])[0] or "其他"
    return model_name


def tier_code_of(price_usd, industry, ladders):
    lad = (ladders or {}).get(industry)
    if not lad:
        return "—"
    price = price_usd if price_usd is not None and math.isfinite(price_usd) else 0
    lo = 0
    for hi in lad:
        if price < hi:
            return f"<{hi}" if lo == 0 else f"{lo}-{hi}"
        lo = hi
    return f"{lad[-1]}+"


def tier_rank(code):
    lt = re.match(r"^<(\d+)", code)
    if lt:
        return (0, int(lt.group(1)), 0)
    span = re.match(r"^(\d+)-(\d+)", code)
    if span:
        return (0, int(span.group(1)), 1)
    plus = re.match(r"^(\d+)\+", code)
    return (1, int(plus.group(1)) if plus else 0, 0)


def tier_rank_rank(code):
    major, mid, _ = tier_rank(code)
    return major * 100000 + mid


def tier_label(code):
    lt = re.match(r"^<(\d+)", code)
    if lt:
        return f"入门 · <$" + str(int(lt.group(1)))
    span = re.match(r"^(\d+)-(\d+)", code)
    if span:
        return f"${int(span.group(1)):,}–${int(span.group(2)):,}"
    plus = re.match(r"^(\d+)\+", code)
    return f"旗舰 · ${int(plus.group(1))}+" if plus else code


def build_dim_tier(ladders):
    code_seq, labels = {}, {}
    for ind, lad in (ladders or {}).items():
        codes = []
        lo = 0
        for hi in lad:
            codes.append(f"<{hi}" if lo == 0 else f"{lo}-{hi}")
            lo = hi
        codes.append(f"{lad[-1]}+")
        code_seq[ind] = codes
        labels[ind] = {c: tier_label(c) for c in codes}
    return {"ladders": code_seq, "labels": labels}


# ================================================================ 穿戴表盘升级（offerIngest.upgradeWearableSizes）

SIZE_IN_COLOR_RE = re.compile(r"(\d{2}(?:\.\d+)?)\s*mm", re.I)
JUNK_COLORS = {"大", "小"}


def strip_size_from_color(text):
    stripped = re.sub(r"\d{2}(?:\.\d+)?\s*mm", " ", text, flags=re.I)
    stripped = re.sub(r"\s+", " ", stripped).strip()
    stripped = re.sub(r"^[\s/-]+|[\s/-]+$", "", stripped)
    return stripped or "—"


def upgrade_wearable_sizes(rows, diag):
    by_model = {}
    for r in rows:
        if r["industry"] != "wearable":
            continue
        by_model.setdefault(r["modelId"], []).append(r)
    for model_rows in by_model.values():
        size_rows = [r for r in model_rows if SIZE_IN_COLOR_RE.search(r["color"])]
        sizes = {SIZE_IN_COLOR_RE.search(r["color"]).group(1) + "mm" for r in size_rows}
        clean_rows = [r for r in model_rows if r["color"] not in JUNK_COLORS]
        if len(sizes) >= 2:
            for r in size_rows:
                size = SIZE_IN_COLOR_RE.search(r["color"]).group(1) + "mm"
                r["romram"] = size
                r["color"] = strip_size_from_color(r["color"])
                diag["fixed"]["穿戴表盘升配置维"] = diag["fixed"].get("穿戴表盘升配置维", 0) + 1
        elif len(sizes) == 1:
            for r in size_rows:
                r["color"] = strip_size_from_color(r["color"])
                diag["fixed"]["穿戴唯一尺寸剥词"] = diag["fixed"].get("穿戴唯一尺寸剥词", 0) + 1
        for r in model_rows:
            if r["color"] not in JUNK_COLORS:
                continue
            if any(c["cc"] == r["cc"] for c in clean_rows):
                r["_drop"] = True
                diag["droppedBy"]["穿戴脏色行(正身已覆盖)"] = diag["droppedBy"].get("穿戴脏色行(正身已覆盖)", 0) + 1
            else:
                r["color"] = "—"
                r["colorKey"] = "—"
                diag["fixed"]["穿戴脏色行清洗保留"] = diag["fixed"].get("穿戴脏色行清洗保留", 0) + 1


# ================================================================ 主引擎（offerIngest.buildFromOffers 对等）


def build_from_offers(offers, ctx):
    diag = {"rowsIn": len(offers), "rowsOut": 0, "droppedBy": {}, "fixed": {},
            "models": 0, "skus": 0, "channels": 0, "weeks": 0}
    if not isinstance(offers, list) or not offers:
        raise ValueError("offers 为空（原表模式至少需要 1 行采集明细）")

    # 1. 列名归一
    header_keys = list(dict.fromkeys([k for r in offers for k in (r or {}).keys()]))
    col_map, missing, spec_mode = map_source_columns(header_keys)
    if missing:
        raise ValueError("原表缺少必要字段：" + "、".join(missing))
    canon_keys = {}  # canonical → 原键
    for src_key, canonical in col_map.items():
        canon_keys.setdefault(canonical, src_key)

    def field_of(src, field):
        k = canon_keys.get(field)
        return src.get(k) if k else None

    # 2. 别名表（完全来自配置）
    alias_map = {}
    for row in ctx.get("modelAliasRows") or []:
        brand = jstr(row.get("brand")).strip().upper()
        frm = jstr(row.get("from")).strip()
        to = jstr(row.get("to")).strip()
        if brand and frm and to:
            alias_map[f"{brand}|{normkey(brand, frm)}"] = normkey(brand, to)

    # 3. 行级归一
    rows = []
    for src in offers:
        brand = jstr(field_of(src, "品牌")).strip().upper()
        model_raw = jstr(field_of(src, "型号")).strip()
        if not model_raw:
            diag["droppedBy"]["无型号"] = diag["droppedBy"].get("无型号", 0) + 1
            continue
        industry = industry_of_cat(field_of(src, "品类"))
        if not industry:
            diag["droppedBy"]["行业未识别"] = diag["droppedBy"].get("行业未识别", 0) + 1
            continue
        cc = cc_of(field_of(src, "国家/地区"))
        if not cc:
            diag["droppedBy"]["未知国家"] = diag["droppedBy"].get("未知国家", 0) + 1
            continue
        wk = week_of(field_of(src, "时间周期"))
        if not wk:
            diag["droppedBy"]["无周期"] = diag["droppedBy"].get("无周期", 0) + 1
            continue
        nkey = normkey(brand or "—", model_raw)
        nkey = alias_map.get(f"{brand}|{nkey}", nkey)
        platform_raw = jstr(field_of(src, "平台")).strip()
        platform = PLATFORM_ALIASES.get(fold(platform_raw).lower(), platform_raw)
        store_raw = jstr(field_of(src, "店铺类型")).strip()
        mapped_store = STORE_ALIASES.get(store_raw, store_raw)
        store_type = mapped_store if mapped_store in ("1P", "3P", "独立站") else "3P"
        crawled = parse_datetime_cell(field_of(src, "采集时间"))
        rows.append({
            "cc": cc, "industry": industry, "brand": brand, "nkey": nkey, "modelRaw": model_raw,
            "platform": platform, "storeType": store_type,
            "shop": jstr(field_of(src, "店铺名称")) or "—",
            "shopDisp": jstr(field_of(src, "显示店铺名称")) or "—",
            "weekId": wk[0],
            "currency": jstr(field_of(src, "货币")).strip().upper(),
            "fx": jnum(field_of(src, "汇率")),
            "rrpLocal": jnum(field_of(src, "平台建议零售价-本币")),
            "priceLocal": jnum(field_of(src, "平台成交价-本币")),
            "dd": parse_pct(field_of(src, "平台显示折扣率")),
            "da": parse_pct(field_of(src, "平台实际折扣率")),
            "bundle": jstr(field_of(src, "是否组合销售")).upper() in ("Y", "YES", "TRUE", "是"),
            "installment": jstr(field_of(src, "分期付款")),
            "promo": jstr(field_of(src, "促销政策")),
            "url": jstr(field_of(src, "网址链接")),
            "shot": jstr(field_of(src, "截图命名")),
            "crawledAt": time_str(crawled) if crawled else "1970-01-01 00:00",
            "spec": jstr(field_of(src, "型号规格")),
            "cat1Src": jstr(field_of(src, "Category1")) if spec_mode else "",
            "cat2Src": jstr(field_of(src, "Category2")) if spec_mode else "",
            "infoSrc": jstr(field_of(src, "info")) if spec_mode else "",
            "_src": src,
        })

    def drop_marked():
        rows[:] = [r for r in rows if not r.get("_drop")]

    if not rows:
        raise ValueError("原表无有效行（国家/周期/行业全部未识别）")

    # 4. 汇率自愈
    by_cur = {}
    for r in rows:
        if r["currency"] and r["fx"] is not None and r["fx"] > 0:
            by_cur.setdefault(r["currency"], []).append(r["fx"])
    cur_med = {k: median_of(v) for k, v in by_cur.items() if median_of(v) is not None}
    inverted = 0
    for r in rows:
        if r["fx"] is None or not r["currency"]:
            continue
        med = cur_med.get(r["currency"])
        if med is None:
            continue
        if (r["fx"] < 1 and med >= 1) or (r["fx"] > 1 and 0 < med <= 1):
            r["fx"] = 1 / r["fx"]
            inverted += 1
    if inverted:
        diag["fixed"]["汇率倒挂(取倒数)"] = inverted

    def fill_median(key_of):
        groups = {}
        for r in rows:
            if r["fx"] is not None and r["fx"] > 0:
                groups.setdefault(key_of(r), []).append(r["fx"])
        meds = {k: median_of(v) for k, v in groups.items() if median_of(v) is not None}
        for r in rows:
            if (r["fx"] is None or r["fx"] <= 0) and key_of(r) in meds:
                r["fx"] = meds[key_of(r)]

    fill_median(lambda r: f"{r['cc']}|{r['weekId']}")
    fill_median(lambda r: r["currency"])
    no_fx = 0
    for r in rows:
        if r["fx"] is None or r["fx"] <= 0:
            r["_drop"] = True
            no_fx += 1
    if no_fx:
        diag["droppedBy"]["无汇率"] = no_fx
    drop_marked()

    # 5. USD + 单位错位修正
    for r in rows:
        if r["fx"] is None or r["fx"] <= 0:
            continue
        if r["rrpLocal"] is not None:
            r["rrpUsd"] = jr2(r["rrpLocal"] / r["fx"])
        else:
            r["rrpUsd"] = None
        if r["priceLocal"] is not None:
            r["priceUsd"] = jr2(r["priceLocal"] / r["fx"])
        else:
            r["priceUsd"] = None
    groups = {}
    for r in rows:
        if r.get("priceUsd") is None:
            continue
        groups.setdefault(f"{r['brand']}|{r['nkey']}|{r['spec']}|{r['cc']}", []).append(r["priceUsd"])
    meds = {k: median_of(v) for k, v in groups.items() if median_of(v) is not None}
    fix_hi = fix_lo = 0

    def rescale(r, factor):
        if r["rrpLocal"] is not None:
            r["rrpLocal"] *= factor
        if r["priceLocal"] is not None:
            r["priceLocal"] *= factor
        if r["fx"] is not None and r["fx"] > 0:
            if r["rrpLocal"] is not None:
                r["rrpUsd"] = jr2(r["rrpLocal"] / r["fx"])
            if r["priceLocal"] is not None:
                r["priceUsd"] = jr2(r["priceLocal"] / r["fx"])

    for r in rows:
        med = meds.get(f"{r['brand']}|{r['nkey']}|{r['spec']}|{r['cc']}")
        if r.get("priceUsd") is None or med is None or med == 0:
            continue
        ratio = r["priceUsd"] / med
        if ratio > 8 and 0.5 < ratio / 100 < 2:
            rescale(r, 1 / 100)
            fix_hi += 1
        elif ratio < 1 / 8 and 0.5 < ratio * 100 < 2:
            rescale(r, 100)
            fix_lo += 1
    if fix_hi:
        diag["fixed"]["价格单位错位(÷100)"] = fix_hi
    if fix_lo:
        diag["fixed"]["价格单位错位(×100)"] = fix_lo
    absurd = 0
    for r in rows:
        if r.get("priceUsd") is not None and r["priceUsd"] > 20000:
            r["_drop"] = True
            absurd += 1
    if absurd:
        diag["droppedBy"]["USD价格>20000(不可信)"] = absurd
    drop_marked()

    # 6. 型号正名
    name_groups = {}
    for r in rows:
        name_groups.setdefault(f"{r['brand']}|{r['nkey']}", []).append(r)
    for key, g in name_groups.items():
        brand = key.split("|")[0]
        counts = {}
        for r in g:
            counts[r["modelRaw"]] = counts.get(r["modelRaw"], 0) + 1
        name = sorted(counts.items(), key=lambda kv: -kv[1])[0][0]
        toks = name.split()
        brand_lower = brand.lower()
        head_tok = re.sub(r"[.,]$", "", fold(toks[0]).lower()) if toks else ""
        if head_tok and head_tok in (brand_lower, brand_lower.replace("-", "")):
            name = " ".join(toks[1:]) or name
        for r in g:
            r["modelName"] = name

    # 7. 拆列 + id 拼装
    spec_split = {}  # (modelId, spec 原文) → 拆列结果（map_spec_split 匹配小表用）
    for r in rows:
        prefix = "own" if r["brand"] == "HUAWEI" else "cmp"
        parts = (romram_from_spec_cats(r["industry"], r["cat1Src"], r["cat2Src"], r["infoSrc"])
                 if spec_mode else parse_romram(r["industry"], r["spec"]))
        r["romram"], r["romKey"], r["color"], r["colorKey"] = parts
        r["isOwn"] = prefix == "own"
        model_slug = slug(r["brand"])
        name_slug = slug(r["modelName"])
        r["modelId"] = f"{prefix}-{model_slug}-{name_slug}"
        r["skuId"] = f"{r['modelId']}__{slug(r['romKey'])}__{slug(r['colorKey'])}"
        spec_split.setdefault((r["modelId"], r["spec"] if not spec_mode else
                               f"[C1]{r['cat1Src']}[C2]{r['cat2Src']}[I]{r['infoSrc']}"), parts)
    upgrade_wearable_sizes(rows, diag)
    drop_marked()

    # 8. 去重（同键 keep-last=同刻最低价）
    def key_of(r):
        return f"{r['weekId']}|{r['skuId']}|{r['cc']}|{r['platform']}|{r['storeType']}|{r['shop']}"

    import functools

    def dedup_cmp(a, b):
        ka, kb = key_of(a), key_of(b)
        if ka != kb:
            return -1 if ka < kb else 1
        if a["crawledAt"] != b["crawledAt"]:
            return -1 if a["crawledAt"] < b["crawledAt"] else 1
        ha = 1 if a["priceLocal"] is not None else 0
        hb = 1 if b["priceLocal"] is not None else 0
        if ha != hb:
            return ha - hb
        pa = a["priceLocal"] if a["priceLocal"] is not None else -math.inf
        pb = b["priceLocal"] if b["priceLocal"] is not None else -math.inf
        return pb - pa

    sorted_rows = sorted(rows, key=functools.cmp_to_key(dedup_cmp))
    last_by_key = {}
    for r in sorted_rows:
        last_by_key[key_of(r)] = r
    dropped_dup = len(rows) - len(last_by_key)
    if dropped_dup > 0:
        diag["droppedBy"]["重复行(周×SKU×国×渠道×店铺)"] = dropped_dup
    rows[:] = list(last_by_key.values())

    if not rows:
        raise ValueError("原表无有效周期")

    # 9. 维表：时间 / 汇率 / 渠道 / 地区
    week_ids = sorted(r["weekId"] for r in rows)
    cur = week_wed_of(week_ids[0])
    end = week_wed_of(week_ids[-1])
    seen = set()
    dim_time = []
    while cur <= end:
        y, wk = iso_week_of(cur)
        wid = f"{y}{pad2(wk)}"
        if wid not in seen:
            seen.add(wid)
            dim_time.append({
                "week_id": wid, "week_wed_date": date_str(cur),
                "month_id": f"{cur.year}{pad2(cur.month)}",
                "quarter_id": f"{cur.year}Q{cur.month // 3 + 1}",
                "week_start_date": date_str(cur - timedelta(days=2)),
            })
        cur += timedelta(days=7)
    diag["weeks"] = len(dim_time)

    dim_fx = []
    fx_groups = {}
    for r in rows:
        if r["fx"] is None or not r["currency"]:
            continue
        wed = week_wed_of(r["weekId"])
        month_id = f"{wed.year}{pad2(wed.month)}"
        fx_groups.setdefault(f"{r['currency']}|{month_id}", []).append(r["fx"])
    for k, arr in fx_groups.items():
        m = median_of(arr)
        if m is None:
            continue
        currency, month_id = k.split("|")
        dim_fx.append({"currency": currency, "month_id": month_id, "per_usd": jr4(m)})
    dim_fx.sort(key=lambda f: (f["currency"], f["month_id"]))

    ch_groups = {}
    for r in rows:
        ch_groups.setdefault(f"{r['cc']}|{r['platform']}|{r['storeType']}", []).append(r)
    entries = sorted(ch_groups.items(), key=lambda kv: (kv[0].split("|")[0], -len(kv[1])))
    dim_channel = []
    channel_id_of = {}
    for k, g in entries:
        cc, pf, st = k.split("|")
        cid = f"{cc}:{slug(pf)}:{st}"
        channel_id_of[k] = cid
        disp_counts = {}
        shop_set = set()
        for r in g:
            disp_counts[r["shopDisp"]] = disp_counts.get(r["shopDisp"], 0) + 1
            shop_set.add(r["shop"])
        disp = sorted(disp_counts.items(), key=lambda kv: -kv[1])[0][0]
        pf_head = fold(pf).lower()[:3]
        if disp.lower() in ("unknown", "—", "nan", "") or not disp.lower().startswith(pf_head):
            disp = f"{pf} {st}"
        dim_channel.append({"channel_id": cid, "country_code": cc, "platform": pf,
                            "store_type": st, "display_name": disp, "shops": len(shop_set)})
    diag["channels"] = len(dim_channel)

    dim_region = [dict(r, core_platforms=list(r.get("core_platforms") or []),
                       default_own_models=dict(r.get("default_own_models") or {}))
                  for r in ctx.get("regionBase") or []]
    region_by_cc = {r["country_code"]: r for r in dim_region}
    by_cc = {}
    for r in rows:
        by_cc.setdefault(r["cc"], []).append(r)
    for cc, g in by_cc.items():
        region = region_by_cc.get(cc)
        if not region:
            continue
        region["enabled"] = True
        cur_counts = {}
        pf_counts = {}
        for r in g:
            if r["currency"]:
                cur_counts[r["currency"]] = cur_counts.get(r["currency"], 0) + 1
            pf_counts[r["platform"]] = pf_counts.get(r["platform"], 0) + 1
        cur_mode = sorted(cur_counts.items(), key=lambda kv: -kv[1])[0] if cur_counts else None
        if cur_mode:
            region["currency"] = cur_mode[0]
        fact_platforms = set(pf_counts)
        core = [p for p in region["core_platforms"] if p in fact_platforms]
        region["core_platforms"] = core if core else \
            [p for p, _ in sorted(pf_counts.items(), key=lambda kv: -kv[1])[:2]]
        region["default_platform"] = region["core_platforms"][0] if region["core_platforms"] else None
    had_rows = set(by_cc)
    for region in dim_region:
        if region["country_code"] not in had_rows:
            region["enabled"] = False

    # 10. 参考价 / 分国档位 / 系列 / 产品维
    ladders = dict(ctx.get("tierLadders") or {})

    def med_by(key_of_r, val_of):
        acc = {}
        for r in rows:
            v = val_of(r)
            if v is not None:
                acc.setdefault(key_of_r(r), []).append(v)
        return {k: median_of(v) for k, v in acc.items() if median_of(v) is not None}

    rrp_med = med_by(lambda r: r["modelId"], lambda r: r.get("rrpUsd"))
    prc_med = med_by(lambda r: r["modelId"], lambda r: r.get("priceUsd"))
    ref_by_model = {}
    for mid in set(rrp_med) | set(prc_med):
        v = rrp_med.get(mid) or prc_med.get(mid)
        if v is not None:
            ref_by_model[mid] = v

    ref_cc_rrp = med_by(lambda r: f"{r['modelId']}|{r['cc']}", lambda r: r.get("rrpUsd"))
    ref_cc_prc = med_by(lambda r: f"{r['modelId']}|{r['cc']}", lambda r: r.get("priceUsd"))
    ref_cc = {}
    for mid_cc in set(ref_cc_rrp) | set(ref_cc_prc):
        v = ref_cc_rrp.get(mid_cc) or ref_cc_prc.get(mid_cc)
        if v is not None:
            ref_cc[mid_cc] = v

    model_ccs = {}
    industry_of_model = {}
    for r in rows:
        model_ccs.setdefault(r["modelId"], set()).add(r["cc"])
        industry_of_model[r["modelId"]] = r["industry"]
    tier_by_country_by_model = {}
    tier_code_by_model = {}
    for mid, ccs in model_ccs.items():
        ind = industry_of_model.get(mid, "phone")
        per = {}
        counts = {}
        for cc in sorted(ccs):
            v = ref_cc.get(f"{mid}|{cc}")
            code = tier_code_of(v, ind, ladders)
            per[cc] = code
            counts[code] = counts.get(code, 0) + 1
        glob = ""
        best_count = -1
        for code, n in counts.items():
            better = n > best_count or (n == best_count and glob != "" and tier_rank_rank(code) > tier_rank_rank(glob))
            if better:
                glob, best_count = code, n
        tier_by_country_by_model[mid] = per
        tier_code_by_model[mid] = glob

    series_by_model = {}
    seen_models = set()
    for r in rows:
        if r["modelId"] in seen_models:
            continue
        seen_models.add(r["modelId"])
        k = normkey(r["brand"], r["modelName"]).replace(" ", "")
        series_by_model[r["modelId"]] = series_of_model(r["brand"], r["modelName"], r["isOwn"], k, ctx.get("seriesRules"))

    by_sku = {}
    for r in rows:
        by_sku.setdefault(r["skuId"], []).append(r)
    dim_product = []
    for sku_id in sorted(by_sku):
        g = by_sku[sku_id]
        head = g[0]
        mid = head["modelId"]
        ind = head["industry"]
        weeks_sorted = sorted(r["weekId"] for r in g)
        launch = sorted(date_str(week_wed_of(r["weekId"])) for r in g)[0]
        cat1 = cat2 = None
        if ind == "phone":
            cat1 = normalize_storage(head["romram"] if head["romram"] != "—" else "") or None
        elif ind == "tablet":
            cat2 = normalize_screen(head["romram"])
            cat1 = normalize_storage(strip_screen_prefix(head["romram"])) or None
        elif ind == "wearable":
            cat1 = normalize_case_size(head["romram"])
        dim_product.append({
            "sku_id": sku_id, "model_id": mid, "industry": ind, "brand": head["brand"],
            "is_own": head["isOwn"], "series": series_by_model.get(mid, head["modelName"]),
            "model_name": head["modelName"], "romram": head["romram"], "color": head["color"],
            "brand_inline": is_brand_inline(head["modelName"]),
            "tier_code": tier_code_by_model.get(mid, "—"),
            "tier_by_country": tier_by_country_by_model.get(mid, {}),
            "ref_price_usd": jr10(ref_by_model[mid]) if mid in ref_by_model else None,
            "launch_date": launch, "eol_date": None,
            "first_week": weeks_sorted[0], "last_week": weeks_sorted[-1],
            "countries": sorted({r["cc"] for r in g}),
            "cat1": cat1, "cat2": cat2,
        })
    diag["models"] = len({p["model_id"] for p in dim_product})
    diag["skus"] = len(dim_product)

    # 11. 事实行
    sorted_rows = sorted(rows, key=lambda r: f"{r['cc']}|{r['skuId']}|{r['weekId']}|{r['platform']}|{r['storeType']}")
    fact_rows = [{
        "week_id": r["weekId"], "sku_id": r["skuId"], "country_code": r["cc"],
        "channel_id": channel_id_of.get(f"{r['cc']}|{r['platform']}|{r['storeType']}",
                                        f"{r['cc']}:{slug(r['platform'])}:{r['storeType']}"),
        "seller": r["shop"], "rrp_local": r["rrpLocal"], "price_local": r["priceLocal"],
        "fx": jr4(r["fx"] if r["fx"] is not None else 1),
        "rrp_usd": r.get("rrpUsd"), "price_usd": r.get("priceUsd"),
        "discount_display": r["dd"], "discount_actual": r["da"], "bundle": r["bundle"],
        "installment": r["installment"] or None, "promo_text": r["promo"] or None,
        "url": r["url"], "screenshot": r["shot"], "crawled_at": r["crawledAt"],
        "crawl_status": "ok",
    } for r in sorted_rows]
    diag["rowsOut"] = len(fact_rows)

    dims = {
        "region": dim_region, "product": dim_product, "channel": dim_channel,
        "time": dim_time, "fx": dim_fx,
        "promo": ctx.get("promoRows") or [], "benchmark": ctx.get("benchmarkRows") or [],
        "tier": build_dim_tier(ladders),
    }
    return {"dims": dims, "factRows": fact_rows, "diag": diag, "specSplit": spec_split}


# ================================================================ 编码（index.ts encodeFactPackB64 对等）


def encode_fact_pack_b64(rows):
    weeks = sorted({r["week_id"] for r in rows})
    skus = sorted({r["sku_id"] for r in rows})
    channels = sorted({r["channel_id"] for r in rows})
    week_idx = {w: i for i, w in enumerate(weeks)}
    sku_idx = {s: i for i, s in enumerate(skus)}
    ch_idx = {c: i for i, c in enumerate(channels)}
    dict_arrs = {"url": [], "shot": [], "inst": [], "promo": [], "seller": []}
    dict_pos = {k: {} for k in dict_arrs}

    def didx(kind, val):
        pos = dict_pos[kind]
        key = val if val is not None else "\x00null"
        if key in pos:
            return pos[key]
        i = len(dict_arrs[kind])
        dict_arrs[kind].append(val)
        pos[key] = i
        return i

    cols = {k: [] for k in ("w", "s", "h", "rrp", "p", "fx", "dd", "da", "b",
                            "inst", "promo", "url", "shot", "seller", "t")}
    for r in rows:
        cols["w"].append(week_idx.get(r["week_id"], 0))
        cols["s"].append(sku_idx.get(r["sku_id"], 0))
        cols["h"].append(ch_idx.get(r["channel_id"], 0))
        cols["rrp"].append(r["rrp_local"])
        cols["p"].append(r["price_local"])
        fx = r["fx"]
        cols["fx"].append(fx if isinstance(fx, (int, float)) and math.isfinite(fx) and fx > 0 else 1)
        cols["dd"].append(r["discount_display"])
        cols["da"].append(r["discount_actual"])
        cols["b"].append(1 if r["bundle"] else 0)
        cols["inst"].append(didx("inst", r.get("installment")))
        cols["promo"].append(didx("promo", r.get("promo_text")))
        cols["url"].append(didx("url", r["url"] or ""))
        cols["shot"].append(didx("shot", r["screenshot"] or ""))
        cols["seller"].append(didx("seller", r["seller"] or "—"))
        cols["t"].append(r.get("crawled_at") or "")
    pack = {"v": 1, "weeks": weeks, "skus": skus, "channels": channels,
            "dict": dict_arrs, "cols": cols}
    blob = json.dumps(pack, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(gzip.compress(blob, 9)).decode("ascii")


# ================================================================ v2 包组装（applyDataPack v3 分支对等）


def build_v2_pack(raw_pack, ctx):
    offers = raw_pack.get("offers") if isinstance(raw_pack.get("offers"), list) else []
    if not offers:
        raise ValueError("原表模式数据包 offers 段为空（至少需要 1 行采集明细）")
    if not all(r is not None and isinstance(r, dict) for r in offers):
        raise ValueError("offers 必须是对象数组（每行一条采集明细）")
    built = build_from_offers(offers, ctx)
    v2 = {
        "kind": "pricelens-data-pack",
        "v": 2,
        "generatedAt": raw_pack.get("generatedAt") if isinstance(raw_pack.get("generatedAt"), str) else "",
        "dims": built["dims"],
        "factPackB64": encode_fact_pack_b64(built["factRows"]),
        "monthly": raw_pack.get("monthly") if isinstance(raw_pack.get("monthly"), list) else [],
        "sales": raw_pack.get("sales") if isinstance(raw_pack.get("sales"), list) else [],
        "salesProductAliases": raw_pack.get("salesProductAliases")
        if isinstance(raw_pack.get("salesProductAliases"), dict) else {},
    }
    return v2, built


# ================================================================ SQLite 落库（匹配小表原则）


SCHEMA = """
-- ODS 原样层：零派生列（Eason 2026-11-18「原表 vs 我们加的一眼可分」）
CREATE TABLE IF NOT EXISTS ods_offer_raw (
    pack_id TEXT NOT NULL, row_ix INTEGER NOT NULL,
    period TEXT, category TEXT, brand TEXT, model TEXT, spec TEXT,
    platform TEXT, country TEXT, store_type TEXT, shop TEXT, shop_disp TEXT,
    rrp_local REAL, price_local REAL, currency TEXT, fx REAL, bundle TEXT,
    installment TEXT, promo TEXT, discount_display REAL, discount_actual REAL,
    url TEXT, screenshot TEXT, crawled_at TEXT, extra_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_ods_offer_pack ON ods_offer_raw(pack_id);
CREATE TABLE IF NOT EXISTS ods_psi_sales (
    pack_id TEXT NOT NULL, row_ix INTEGER NOT NULL,
    country TEXT, product TEXT, category1 TEXT, category2 TEXT,
    period_id TEXT, qty REAL
);
CREATE INDEX IF NOT EXISTS ix_ods_sales_pack ON ods_psi_sales(pack_id);
-- 匹配小表层：全部「我们加的」派生内容，独立表键挂接
CREATE TABLE IF NOT EXISTS map_model (
    model_id TEXT PRIMARY KEY, brand TEXT, model_name TEXT, is_own INTEGER,
    series TEXT, industry TEXT
);
CREATE TABLE IF NOT EXISTS map_sku (
    sku_id TEXT PRIMARY KEY, model_id TEXT, rom_key TEXT, color_key TEXT,
    romram TEXT, color TEXT
);
CREATE TABLE IF NOT EXISTS map_spec_split (
    model_id TEXT, spec TEXT, romram TEXT, rom_key TEXT, color TEXT, color_key TEXT,
    PRIMARY KEY (model_id, spec)
);
CREATE TABLE IF NOT EXISTS map_tier (
    model_id TEXT PRIMARY KEY, tier_code TEXT, ref_price_usd REAL, tier_by_country TEXT
);
CREATE TABLE IF NOT EXISTS map_alias (brand TEXT, from_key TEXT, to_key TEXT);
-- DIM / DWD / CFG / META
CREATE TABLE IF NOT EXISTS dim_channel (
    channel_id TEXT PRIMARY KEY, country_code TEXT, platform TEXT, store_type TEXT,
    display_name TEXT, shops INTEGER
);
CREATE TABLE IF NOT EXISTS dim_time (
    week_id TEXT PRIMARY KEY, week_wed_date TEXT, month_id TEXT,
    quarter_id TEXT, week_start_date TEXT
);
CREATE TABLE IF NOT EXISTS dim_fx (currency TEXT, month_id TEXT, per_usd REAL,
    PRIMARY KEY (currency, month_id));
CREATE TABLE IF NOT EXISTS dim_region (
    country_code TEXT PRIMARY KEY, region_code TEXT, region_name TEXT, country_name TEXT,
    enabled INTEGER, sort INTEGER, currency TEXT, core_platforms TEXT,
    default_platform TEXT, default_own_models TEXT
);
CREATE TABLE IF NOT EXISTS dim_promo (
    promo_id TEXT, country_code TEXT, promo_name TEXT, start_date TEXT,
    end_date TEXT, depth_hint TEXT, platforms TEXT, channel_raw TEXT
);
CREATE TABLE IF NOT EXISTS dim_benchmark (
    country_code TEXT, own_model_id TEXT, own_romram TEXT,
    competitor_sku_id TEXT, sort INTEGER, source TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS dim_tier (ladders TEXT, labels TEXT);
CREATE TABLE IF NOT EXISTS fact_price_weekly (
    week_id TEXT, sku_id TEXT, country_code TEXT, channel_id TEXT, seller TEXT,
    rrp_local REAL, price_local REAL, fx REAL, rrp_usd REAL, price_usd REAL,
    discount_display REAL, discount_actual REAL, bundle INTEGER,
    installment TEXT, promo_text TEXT, url TEXT, screenshot TEXT,
    crawled_at TEXT, crawl_status TEXT
);
CREATE INDEX IF NOT EXISTS ix_fact_week_sku ON fact_price_weekly(week_id, sku_id);
CREATE TABLE IF NOT EXISTS cfg_kv (key TEXT PRIMARY KEY, json TEXT);
CREATE TABLE IF NOT EXISTS meta_import (
    id TEXT PRIMARY KEY, ts TEXT, kind TEXT, rows_in INTEGER, rows_out INTEGER, diag_json TEXT
);
"""


def load_to_sqlite(db_path, raw_pack, built, pack_id, config=None):
    """v3 原包（ODS）+ 派生结果（匹配小表/DIM/DWD）落 SQLite；整包置换语义（pack_id 隔离旧包）"""
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA)
        cur = conn.cursor()
        for table in ("ods_offer_raw", "ods_psi_sales", "map_model", "map_sku", "map_spec_split",
                      "map_tier", "map_alias", "dim_channel", "dim_time", "dim_fx", "dim_region",
                      "dim_promo", "dim_benchmark", "dim_tier", "fact_price_weekly"):
            cur.execute(f"DELETE FROM {table}")
        cur.executemany("INSERT INTO map_alias VALUES (?,?,?)",
                        [[jstr(a.get("brand")).strip().upper(), jstr(a.get("from")).strip(),
                          jstr(a.get("to")).strip()]
                         for a in (config or {}).get("modelAliases") or []])
        # ODS：22 规范列 + extra_json（全部原文，超出规范列的字段原样保留）
        offers = raw_pack.get("offers") or []
        ods_rows = []
        for ix, src in enumerate(offers):
            vals = {}
            extras = {}
            for key, canonical in (map_source_columns(list(src.keys()))[0] or {}).items():
                target = FIELD_TO_ODS.get(canonical)
                v = src.get(key)
                if target in ODS_COLUMNS:
                    vals[target] = _sqlite_scalar(v)
                elif target:
                    extras[target] = _sqlite_scalar(v)
                else:
                    extras[key] = _sqlite_scalar(v)
            ods_rows.append([pack_id, ix] + [vals.get(c) for c in ODS_COLUMNS]
                            + [json.dumps(extras, ensure_ascii=False) if extras else None])
        cur.executemany(
            f"INSERT INTO ods_offer_raw VALUES ({','.join('?' * (len(ODS_COLUMNS) + 3))})", ods_rows)
        sales = raw_pack.get("sales") or []
        cur.executemany(
            "INSERT INTO ods_psi_sales VALUES (?,?,?,?,?,?,?,?)",
            [[pack_id, ix, jstr(s.get("country")) or None, jstr(s.get("product")) or None,
              jstr(s.get("category1")) or None, jstr(s.get("category2")) or None,
              jstr(s.get("periodId")) or None, jnum(s.get("qty"))]
             for ix, s in enumerate(sales)])
        # 匹配小表 + DIM + DWD（全部从派生结果导出，不重复计算）
        dims = built["dims"]
        cur.executemany("INSERT OR REPLACE INTO map_model VALUES (?,?,?,?,?,?)",
                        [[p["model_id"], p["brand"], p["model_name"], 1 if p["is_own"] else 0,
                          p["series"], p["industry"]] for p in dims["product"]])
        cur.executemany("INSERT OR REPLACE INTO map_sku VALUES (?,?,?,?,?,?)",
                        [[p["sku_id"], p["model_id"], slug(p["romram"]),
                          slug(p["color"]), p["romram"], p["color"]] for p in dims["product"]])
        # map_spec_split：型号 × 规格原文 → 拆列结果（build 第 7 步收集的匹配样本）
        cur.executemany("INSERT OR REPLACE INTO map_spec_split VALUES (?,?,?,?,?,?)",
                        [[mid, spec, parts[0], parts[1], parts[2], parts[3]]
                         for (mid, spec), parts in (built.get("specSplit") or {}).items()])
        cur.executemany("INSERT OR REPLACE INTO map_tier VALUES (?,?,?,?)",
                        [[p["model_id"], p["tier_code"], p["ref_price_usd"],
                          json.dumps(p["tier_by_country"], ensure_ascii=False)] for p in dims["product"]])
        cur.executemany("INSERT INTO dim_channel VALUES (?,?,?,?,?,?)",
                        [[c["channel_id"], c["country_code"], c["platform"], c["store_type"],
                          c["display_name"], c["shops"]] for c in dims["channel"]])
        cur.executemany("INSERT INTO dim_time VALUES (?,?,?,?,?)",
                        [[t["week_id"], t["week_wed_date"], t["month_id"], t["quarter_id"],
                          t["week_start_date"]] for t in dims["time"]])
        cur.executemany("INSERT OR REPLACE INTO dim_fx VALUES (?,?,?)",
                        [[f["currency"], f["month_id"], f["per_usd"]] for f in dims["fx"]])
        cur.executemany("INSERT OR REPLACE INTO dim_region VALUES (?,?,?,?,?,?,?,?,?,?)",
                        [[r["country_code"], r.get("region_code"), r.get("region_name"),
                          r.get("country_name"), 1 if r.get("enabled") else 0, r.get("sort"),
                          r.get("currency"), json.dumps(r.get("core_platforms") or [], ensure_ascii=False),
                          r.get("default_platform"),
                          json.dumps(r.get("default_own_models") or {}, ensure_ascii=False)]
                         for r in dims["region"]])
        cur.executemany("INSERT INTO dim_promo VALUES (?,?,?,?,?,?,?,?)",
                        [[p.get("promo_id"), p["country_code"], p["promo_name"], p["start_date"],
                          p["end_date"], p.get("depth_hint"),
                          json.dumps(p.get("platforms"), ensure_ascii=False) if p.get("platforms") is not None else None,
                          p.get("channel_raw") or ""] for p in dims["promo"]])
        cur.executemany("INSERT INTO dim_benchmark VALUES (?,?,?,?,?,?,?)",
                        [[b.get("country_code"), b["own_model_id"], b.get("own_romram") or "",
                          b["competitor_sku_id"], b.get("sort") or 0, b.get("source") or "matrix",
                          b.get("note")] for b in dims["benchmark"]])
        tier = dims["tier"]
        cur.execute("INSERT INTO dim_tier VALUES (?,?)",
                    [json.dumps(tier.get("ladders") or {}, ensure_ascii=False),
                     json.dumps(tier.get("labels") or {}, ensure_ascii=False)])
        fact = built["factRows"]
        cur.executemany("INSERT INTO fact_price_weekly VALUES (" + ",".join("?" * 19) + ")",
                        [[r["week_id"], r["sku_id"], r["country_code"], r["channel_id"], r["seller"],
                          r["rrp_local"], r["price_local"], r["fx"], r["rrp_usd"], r["price_usd"],
                          r["discount_display"], r["discount_actual"], 1 if r["bundle"] else 0,
                          r["installment"], r["promo_text"], r["url"], r["screenshot"],
                          r["crawled_at"], r["crawl_status"]] for r in fact])
        now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        cur.execute("INSERT OR REPLACE INTO meta_import VALUES (?,?,?,?,?,?)",
                    [pack_id, now, "v3-offers", built["diag"]["rowsIn"], built["diag"]["rowsOut"],
                     json.dumps(built["diag"], ensure_ascii=False)])
        conn.commit()
    finally:
        conn.close()


def _sqlite_scalar(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip()
    return None if s in ("", "nan", "NaT", "None", "null") else s


# ================================================================ 配置与编排


def load_config(config_path):
    """config.json（前端配置表导入后 POST 的同一形态）；缺文件 = 全空（零内置规则）"""
    if not os.path.exists(config_path):
        return {}
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (ValueError, OSError):
        return {}


def ctx_from_config(config, region_base_path):
    with open(region_base_path, "r", encoding="utf-8") as f:
        region_base = json.load(f)
    return {
        "seriesRules": config.get("seriesRules") or None,
        "modelAliasRows": config.get("modelAliases") or None,
        "tierLadders": config.get("tierLadders") or None,
        "promoRows": config.get("promoRows") or None,
        "benchmarkRows": config.get("benchmarkMatrix") or None,
        "regionBase": region_base,
    }


def validate_fact_pack_invariants(v2_pack):
    """前端 validateFactPack 同款不变量自检（15 列等长/索引不越界/fx>0/字典索引合法）"""
    blob = base64.b64decode(v2_pack["factPackB64"])
    pack = json.loads(gzip.decompress(blob).decode("utf-8"))
    cols = pack["cols"]
    n = len(cols["w"])
    problems = []
    for name, arr in cols.items():
        if len(arr) != n:
            problems.append(f"列 {name} 长度 {len(arr)} ≠ {n}")
    for name, limit in (("w", len(pack["weeks"])), ("s", len(pack["skus"])), ("h", len(pack["channels"]))):
        bad = [v for v in cols[name] if not (0 <= v < limit)]
        if bad:
            problems.append(f"索引列 {name} 越界（limit={limit}）")
    if any(not (math.isfinite(v) and v > 0) for v in cols["fx"]):
        problems.append("fx 存在非正/非有限值")
    for kind in ("inst", "promo", "url", "shot", "seller"):
        limit = len(pack["dict"][kind])
        if any(not (0 <= v < limit) for v in cols[kind]):
            problems.append(f"字典列 {kind} 索引越界")
    return problems


def ingest_v3_pack(pack, config, region_base_path, db_path):
    """v3 原表包 → (v2 包, 诊断)；含不变量自检与 SQLite 落库"""
    ctx = ctx_from_config(config, region_base_path)
    v2_pack, built = build_v2_pack(pack, ctx)
    problems = validate_fact_pack_invariants(v2_pack)
    if problems:
        raise ValueError("事实包不变量校验失败：" + "; ".join(problems))
    pack_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    load_to_sqlite(db_path, pack, built, pack_id, config)
    return v2_pack, built["diag"], pack_id
