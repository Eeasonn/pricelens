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
import hashlib
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
# 引擎产业码 → 中文产业（数据建模方案 v2：匹配表/事实表 category 列 = 中文四产业）
CAT_CN = {"phone": "手机", "tablet": "平板", "wearable": "穿戴", "audio": "音频",
          "iot": "IoT", "pc": "PC"}
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
    "沙特": "SA", "沙特阿拉伯": "SA", "r国": "RU", "俄罗斯": "RU", "俄罗斯联邦": "RU", "阿联酋": "AE",
    "阿拉伯联合酋长国": "AE", "波兰": "PL", "德国": "DE",
    "菲律宾": "PH", "泰国": "TH", "马来西亚": "MY", "马来": "MY", "印尼": "ID",
    "墨西哥": "MX", "巴西": "BR", "保加利亚": "BG", "智利": "CL", "秘鲁": "PE",
    "哥伦比亚": "CO", "阿根廷": "AR", "南非": "ZA", "土耳其": "TR", "越南": "VN",
    "新加坡": "SG", "日本": "JP",
    # PSI 侧独有别名（与前端 DEFAULT_COUNTRY_ALIASES 并集同源）
    "turkiye": "TR", "uk": "GB", "britain": "GB", "saudi": "SA", "uae": "AE",
}
SERIES_NAME_MARKERS = [
    "iphone", "ipad", "macbook", "mac ", "airpods",
    "galaxy", "redmi", "poco", "magic",
    "mate", "pura", "nova", "enjoy", "freebuds", "freearc", "freeclip",
    "watch gt", "watch fit", "watch ultimate", "watch kids", "watch d",
    "thinkpad", "ideapad", "yoga",
]
COLUMN_ALIASES = [
    ("品类", ["类别", "品类名称", "category"]),
    ("品牌", ["brand"]),
    ("型号", ["商品型号", "型号名称", "model"]),
    ("型号规格", ["规格", "商品规格", "color_size"]),
    ("国家/地区", ["国家地区", "国家", "地区", "country"]),
    ("平台", ["电商平台", "渠道平台", "platform"]),
    ("店铺类型", ["渠道类型", "store_type"]),
    ("店铺名称", ["卖家名称", "shop_name"]),
    ("显示店铺名称", ["展示店铺名称", "shop_name_new"]),
    ("时间周期", ["周期", "日期", "tech_date"]),
    ("采集时间", ["抓取时间", "采集日期", "collection_time"]),
    ("是否组合销售", ["是否组合", "is_bundle"]),
    ("网址链接", ["网址", "URL", "url"]),
    ("截图命名", ["截图", "screenshot"]),
    ("货币", ["currency"]),
    ("汇率", ["exchange_rate"]),
    ("平台建议零售价-本币", ["platform_rrp_local"]),
    ("平台成交价-本币", ["platform_selling_price_local"]),
    ("平台显示折扣率", ["platform_discount_rate"]),
    ("平台实际折扣率", ["platform_real_discount_rate"]),
    ("分期付款", ["installment"]),
    ("促销政策", ["promotion_details"]),
]
# ODS 29 规范列（数据建模方案 v2 2026-11-22「offer 底表」；落库列名。官方价族
# 5 列 = 预留字段（拍板①），落库不进指标；旧 24 列中文输入由 FIELD_TO_ODS 归一到同列名）
ODS_COLUMNS = [
    "tech_date", "category", "brand", "model", "color_size", "platform", "country",
    "store_type", "shop_name", "shop_name_new",
    "official_rrp_local", "official_selling_price_local", "official_discount_rate",
    "platform_rrp_local", "platform_selling_price_local", "platform_discount_rate",
    "platform_real_discount_rate", "currency", "exchange_rate",
    "official_rrp_usd", "official_selling_price_usd", "platform_rrp_usd",
    "platform_selling_price_usd",
    "is_bundle", "installment", "promotion_details", "url", "screenshot", "collection_time",
]
# 原键 → 规范列（列名归一结果映射到 ODS 列；Category1/2/info 进 extra 保留）
FIELD_TO_ODS = {
    "时间周期": "tech_date", "品类": "category", "品牌": "brand", "型号": "model",
    "型号规格": "color_size", "Category1": "cat1", "Category2": "cat2", "info": "info",
    "平台": "platform", "国家/地区": "country", "店铺类型": "store_type",
    "店铺名称": "shop_name", "显示店铺名称": "shop_name_new",
    "官方建议零售价-本币": "official_rrp_local", "官方到手价-本币": "official_selling_price_local",
    "官方折扣率": "official_discount_rate",
    "平台建议零售价-本币": "platform_rrp_local", "平台成交价-本币": "platform_selling_price_local",
    "货币": "currency", "汇率": "exchange_rate", "是否组合销售": "is_bundle",
    "分期付款": "installment", "促销政策": "promotion_details",
    "平台显示折扣率": "platform_discount_rate", "平台实际折扣率": "platform_real_discount_rate",
    "官方建议零售价-美金": "official_rrp_usd", "官方成交价-美金": "official_selling_price_usd",
    "平台建议零售价-美金": "platform_rrp_usd", "平台成交价-美金": "platform_selling_price_usd",
    "网址链接": "url", "截图命名": "screenshot", "采集时间": "collection_time",
    # 新 29 列英文底表的直通列（无中文规范名的官方价族 + USD 列）
    "official_rrp_local": "official_rrp_local",
    "official_selling_price_local": "official_selling_price_local",
    "official_discount_rate": "official_discount_rate",
    "official_rrp_usd": "official_rrp_usd",
    "official_selling_price_usd": "official_selling_price_usd",
    "platform_rrp_usd": "platform_rrp_usd",
    "platform_selling_price_usd": "platform_selling_price_usd",
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


def industry_of_cat(raw, table=None):
    return (table or INDUSTRY_OF_CAT).get(fold(raw).strip().lower())


def cc_of(name, table=None):
    return (table or COUNTRY_CODES).get(fold(name).strip().lower())


def cc_of_loose(name, table=None):
    """cc_of + 裸两位码兜底（PSI 导出/配置表 country 列常为 SA/AE/PL 直码）"""
    cc = cc_of(name, table)
    if cc:
        return cc
    bare = fold(name).strip().upper()
    return bare if (len(bare) == 2 and bare.isalpha()) else ""


def platform_alias_of(name, table=None):
    return (table or PLATFORM_ALIASES).get(fold(name).lower(), name)


def store_alias_of(name, table=None):
    return (table or STORE_ALIASES).get(name, name)


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
            # JS new Date 语义：越界时/分/秒自动进位（99 分 = 1 时 39 分；脏采集
            # 时间行前端不报错照收）——Python datetime 直构会抛错，改 timedelta
            # 组合保持逐字对齐
            return datetime(int(g[0]), int(g[1]), int(g[2])) + timedelta(hours=hh, minutes=mi, seconds=ss)
    # JS new Date(s) 兜底：常见斜杠/紧凑格式
    m = re.match(r"^(\d{4})/(\d{1,2})/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?", s)
    if m:
        g = m.groups()
        return datetime(int(g[0]), int(g[1]), int(g[2])) + timedelta(hours=int(g[3] or 0), minutes=int(g[4] or 0))
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
    # 新 29 列英文底表（color_size 在场）：整串规格形态，tech_date 只是周期锚别名；
    # 旧输入（含 v3 包 tech_date+Category1/2/info 拆列形态）行为逐字不变（金标约束）
    en_form = "color_size" in present
    spec_present = (not en_form) and any(c in present for c in ("Category1", "Category2", "info", "tech_date"))
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
    # 必备列检查用「归一后规范名集合」——英文表头经别名映射后同样满足（旧中文表头行为不变）
    resolved = set(col_map.values())
    missing = []
    for name in ["时间周期", "品类", "品牌", "型号", "平台", "国家/地区", "店铺类型", "货币", "汇率"]:
        if name not in resolved and not (name == "时间周期" and spec_present):
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

    # 2. 别名表（完全来自配置）；C3 字典默认在此解一次（None = 出厂默认整套，
    #    与前端 ingestText.DEFAULT_DICTIONARIES 同源——config.json dictionaries 覆盖）
    dicts = ctx.get("dictionaries") or {}
    dict_industry = dicts.get("industryOfCat") or INDUSTRY_OF_CAT
    dict_country = dicts.get("countryCodes") or COUNTRY_CODES
    dict_platform = dicts.get("platformAliases") or PLATFORM_ALIASES
    dict_store = dicts.get("storeAliases") or STORE_ALIASES
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
        industry = industry_of_cat(field_of(src, "品类"), dict_industry)
        if not industry:
            diag["droppedBy"]["行业未识别"] = diag["droppedBy"].get("行业未识别", 0) + 1
            continue
        cc = cc_of_loose(field_of(src, "国家/地区"), dict_country)
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
        platform = platform_alias_of(platform_raw, dict_platform)
        store_raw = jstr(field_of(src, "店铺类型")).strip()
        mapped_store = store_alias_of(store_raw, dict_store)
        store_type = mapped_store if mapped_store in ("1P", "3P", "独立站") else "3P"
        crawled = parse_datetime_cell(field_of(src, "采集时间"))

        def raw_num(*names):
            for n in names:
                if n in src:
                    return jnum(src[n])
            return None
        rows.append({
            # 官方价族（预留字段，拍板①：落库不进指标；旧格式输入无列 = None）
            "oRrpLocal": raw_num("official_rrp_local", "官方建议零售价-本币"),
            "oPriceLocal": raw_num("official_selling_price_local", "官方到手价-本币"),
            "oDisc": parse_pct(next((src[n] for n in ("official_discount_rate", "官方折扣率") if n in src), None)),
            "oRrpUsd": raw_num("official_rrp_usd", "官方建议零售价-美金"),
            "oPriceUsd": raw_num("official_selling_price_usd", "官方成交价-美金"),
            "pRrpUsd": raw_num("platform_rrp_usd", "平台建议零售价-美金"),
            "pPriceUsd": raw_num("platform_selling_price_usd", "平台成交价-美金"),
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
        "platform": r["platform"], "store_type": r["storeType"], "shop": r["shop"],
        "category_cn": CAT_CN.get(r["industry"], r["industry"]), "brand": r["brand"],
        "seller": r["shop"], "rrp_local": r["rrpLocal"], "price_local": r["priceLocal"],
        "fx": jr4(r["fx"] if r["fx"] is not None else 1),
        "rrp_usd": r.get("rrpUsd"), "price_usd": r.get("priceUsd"),
        "discount_display": r["dd"], "discount_actual": r["da"], "bundle": r["bundle"],
        "installment": r["installment"] or None, "promo_text": r["promo"] or None,
        "url": r["url"], "screenshot": r["shot"], "crawled_at": r["crawledAt"],
        "crawl_status": "ok",
        # v2 双价族直通（官方族=预留；旧格式输入恒 None）
        "o_rrp_local": r.get("oRrpLocal"), "o_price_local": r.get("oPriceLocal"),
        "o_discount": r.get("oDisc"), "o_rrp_usd": r.get("oRrpUsd"), "o_price_usd": r.get("oPriceUsd"),
        "p_rrp_usd": r.get("pRrpUsd"), "p_price_usd": r.get("pPriceUsd"),
        "currency": r["currency"], "exchange_rate": r["fx"],
        "model_id": r["modelId"],
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


# ================================================================ PSI 归一 + map_product（数据建模方案 v2 §2.2/§3.1/§4.2）

PSI_HEADER_MAP = {
    "management region": "region", "management country/region": "country_raw",
    "country": "country_raw", "product": "product",
    "product sku": "product_sku", "product_sku": "product_sku",
    "period id": "period_id", "periodid": "period_id", "period_id": "period_id",
    "psi type": "psi_type", "qty": "qty", "category1": "category1", "category2": "category2",
}
_SERIES_PREFIX = [
    ("MATEPAD PRO MAX", "MatePad Pro Max"), ("MATEPAD PRO", "MatePad Pro"), ("MATEPAD AIR", "MatePad Air"),
    ("MATEPAD SE", "MatePad SE"), ("MATEPAD MINI", "MatePad Mini"), ("MATEPAD", "MatePad"),
    ("MATE X", "Mate X"), ("MATE", "Mate"), ("PURA", "Pura"), ("NOVA", "nova"),
    ("WATCH ULTIMATE", "WATCH Ultimate"), ("WATCH GT", "WATCH GT"), ("WATCH FIT", "WATCH FIT"),
    ("WATCH KIDS", "WATCH KIDS"), ("WATCH D", "WATCH D"), ("WATCH BUDS", "WATCH Buds"), ("WATCH", "WATCH"),
    ("BAND", "Band"), ("手环", "手环"), ("超新星", "超新星"), ("SCALE", "Scale"), ("HONMA", "HONMA联名"),
    ("FREEBUDS", "FreeBuds"), ("FREECLIP", "FreeClip"), ("FREELACE", "FreeLace"),
    ("FREEARC", "FreeArc"), ("EYEWEAR", "Eyewear"),
]


def _today_str():
    return datetime.now().strftime("%Y-%m-%d")


def _norm_text(s):
    """弱归一键：小写去非字母数字（匹配表启发式配对用，只做预配，人工 xlsx 权威）"""
    return re.sub(r"[^a-z0-9]", "", strip_brand_text(s).lower())


def strip_brand_text(s):
    t = str(s or "").strip()
    for b in ("HUAWEI", "Huawei", "huawei", "华为"):
        if t.startswith(b):
            return t[len(b):].strip()
    return t


def _psi_industry_of(product):
    p = strip_brand_text(product).upper()
    if "MATEPAD" in p or "IPAD" in p:
        return "tablet"
    if "WATCH" in p or "BAND" in p or "SCALE" in p or "手环" in str(product) or "超新星" in str(product):
        return "wearable"
    if any(k in p for k in ("FREEBUDS", "FREECLIP", "FREELACE", "FREEARC", "EYEWEAR", "AIRPODS", "BUDS")):
        return "audio"
    return "phone"


def _cat_key_of_text(text):
    """规格文本 → 匹配键：存储 (ram, rom) 或表盘 mm；解析不出 = None"""
    p = storage_parse(text)
    if p and (p[0] or p[1]):
        return ("sto", round(p[0]), round(p[1]))
    m = re.search(r"(\d{2}(?:\.\d+)?)\s*mm", str(text or ""), re.I)
    if m:
        return ("mm", float(m.group(1)))
    return None


def normalize_psi_rows(sales_rows, dict_country=None):
    """PSI 源行归一（新 7 列 Management…/旧 6 列 country/product 双形态自适应）：
    表头小写匹配、国家归一两位码、qty 数值化。行 = {region, country_raw, cc, product,
    product_sku, category1, category2, period_id, psi_type, qty}。"""
    out = []
    for src in sales_rows or []:
        if not isinstance(src, dict):
            continue
        row = {"region": "", "country_raw": "", "cc": "", "product": "", "product_sku": "",
               "category1": "", "category2": "", "period_id": "", "psi_type": "", "qty": None}
        extras = {}
        for k, v in src.items():
            target = PSI_HEADER_MAP.get(str(k).strip().lower())
            if target:
                row[target] = jstr(v).strip()
            elif str(k).strip():
                extras[str(k).strip()] = _sqlite_scalar(v)
        row["cc"] = cc_of_loose(row["country_raw"], dict_country or COUNTRY_CODES)
        row["qty"] = jnum(row["qty"])
        row["extra_json"] = json.dumps(extras, ensure_ascii=False) if extras else None
        out.append(row)
    return out


def _psi_prefill_dims(s):
    """PSI SKU 串正则预填（category1=存储/表盘、category2=平板屏幕、category3=平板柔光、
    info=去数值段剩余）——与《配置表补录表-预填》同一套规则；人工核对后以 xlsx 为准"""
    industry = _psi_industry_of(s["product"])
    text = jstr(s["product_sku"] or s["product"])
    cat1 = normalize_storage(text) or normalize_case_size(text) or ""
    cat2 = (normalize_screen(text) or "") if industry == "tablet" else ""
    cat3 = ""
    if industry == "tablet":
        cat3 = "PaperMatte" if ("柔光" in text or "papermatte" in text.lower()) else "Normal"
    info = re.sub(r"\d+\s*(?:GB|TB)?\s*\+\s*\d+\s*(?:GB|TB)", " ", text, flags=re.I)
    info = re.sub(r"\d{2}(?:\.\d+)?\s*mm", " ", info, flags=re.I)
    info = re.sub(r"\s+", " ", info).strip(" ，,；;")
    return cat1, cat2, cat3, info[:80]


def series_guess_from_product(product):
    u = strip_brand_text(product).upper()
    for p, sv in _SERIES_PREFIX:
        if u.startswith(p):
            return sv
    return ""


def _offer_inventory(built):
    """派生结果 → offer 侧匹配清单（一行 = 国家×型号×规格原文×SKU）：specSplit 提供
    规格原文，dims.product 提供 SKU 维度/系列/countries；color_size 用规格串原文。"""
    by_sku = {p["sku_id"]: p for p in built["dims"]["product"]}
    spec_sku = {}
    for (mid, spec), parts in (built.get("specSplit") or {}).items():
        sku_id = f"{mid}__{slug(parts[1])}__{slug(parts[3])}"
        if sku_id in by_sku:
            spec_sku[(mid, spec)] = sku_id
    model_cc = {}
    for p in built["dims"]["product"]:
        for cc in p.get("countries") or []:
            model_cc.setdefault(p["model_id"], set()).add(cc)
    rows = []
    for (mid, spec), sku_id in spec_sku.items():
        head = by_sku[sku_id]
        for cc in sorted(model_cc.get(mid) or {""}):
            rows.append({
                "country": cc, "category": CAT_CN.get(head["industry"], head["industry"]),
                "brand": head["brand"], "model": head["model_name"], "color_size": spec,
                "series": head.get("series") or "", "cat1": head.get("cat1") or "",
                "cat2": head.get("cat2") or "", "industry": head["industry"],
                "model_id": mid, "sku_id": sku_id,
            })
    return rows


def build_map_product(xlsx_rows, offer_rows, psi_rows):
    """匹配表三源合并：①xlsx 人工行（config_tables.xlsx「匹配表(补录)」，权威）
    ②自动 offer 行（引擎派生清单）③PSI 行（正则预填+启发式配对）。
    match_status：xlsx 行按人工值；自动行 = matched / offer_only / psi_only。"""
    rows = []
    seen_offer = set()
    seen_psi = set()

    def base_row(**kw):
        row = {"country": "", "category": "", "brand": "", "model": "",
               "orig_brand": "", "orig_model": "", "color_size": "",
               "series": "", "category1": "", "category2": "", "category3": "", "category4": "",
               "info": "", "psi_product": "", "product_sku": "", "is_active": 1,
               "match_status": "offer_only", "updated_at": _today_str(), "maintainer": "auto",
               "model_id": "", "sku_id": "", "source": "auto"}
        row.update(kw)
        return row

    # 自动 offer 行索引（xlsx 人工行的 model_id/sku_id 回填源；xlsx 结构无 ID 列）。
    # 同键多行全存——挂接即整键压制（人工行接管整个 (国家, 型号, 规格键) 组合）
    auto_by_key = {}
    for o in offer_rows:
        auto_by_key.setdefault((o["country"], _norm_text(o["model"]), _cat_key_of_text(o["cat1"])), []).append(o)

    for r in xlsx_rows or []:
        # 全空/无键行跳过（Excel 尾部残留空行、误插行不入表）
        if not any(jstr(v).strip() for v in r.values()):
            continue
        pp, ps = jstr(r.get("psi_product")).strip(), jstr(r.get("product_sku")).strip()
        cc = cc_of_loose(r.get("country"), COUNTRY_CODES)
        status = jstr(r.get("match_status")).strip().lower()
        if status not in ("matched", "offer_only", "psi_only"):
            status = "matched" if (pp and ps) else ("psi_only" if pp else "offer_only")
        act = jnum(r.get("is_active"))
        # 工程键回填：xlsx 行按 (国家, 型号弱归一, 规格键) 挂接引擎 SKU（音频等
        # 无规格键行以 key=None 精确对位）；同键多 SKU 取首条（颜色级由人工定夺）。
        # 人工改过 model 原文时用 orig_model（修订前引擎值）兜底；挂接即整键压制
        cat_key = _cat_key_of_text(jstr(r.get("category1")).strip())
        autos = (auto_by_key.get((cc, _norm_text(jstr(r.get("model")).strip()), cat_key))
                 or auto_by_key.get((cc, _norm_text(jstr(r.get("orig_model")).strip()), cat_key))
                 or [])
        auto = autos[0] if autos else None
        if not autos and cat_key is not None:
            # 规格键失配兜底（穿戴塌缩行：引擎侧 cat1=None 而 xlsx 行带表盘）：
            # 退 (国家, 型号, None) 键；info（颜色等非表盘信息）用于选同 model 最优行
            autos = (auto_by_key.get((cc, _norm_text(jstr(r.get("model")).strip()), None))
                     or auto_by_key.get((cc, _norm_text(jstr(r.get("orig_model")).strip()), None))
                     or [])
            info_n = _norm_text(jstr(r.get("info")).strip())
            auto = (next((a for a in autos if info_n and info_n in _norm_text(a["color_size"])), None)
                    or (autos[0] if autos else None))
        for a in autos:
            a["_covered"] = True
        rows.append(base_row(
            country=cc, category=jstr(r.get("category")).strip(), brand=jstr(r.get("brand")).strip(),
            model=jstr(r.get("model")).strip(),
            orig_brand=jstr(r.get("orig_brand")).strip(), orig_model=jstr(r.get("orig_model")).strip(),
            color_size=jstr(r.get("color_size")).strip(),
            series=jstr(r.get("series")).strip() or (auto["series"] if auto else ""),
            category1=jstr(r.get("category1")).strip(), category2=jstr(r.get("category2")).strip(),
            category3=jstr(r.get("category3")).strip(), category4=jstr(r.get("category4")).strip(),
            info=jstr(r.get("info")).strip(), psi_product=pp, product_sku=ps,
            is_active=0 if act == 0 else 1, match_status=status,
            updated_at=excel_date_to_str(r.get("updated_at")) or _today_str(),
            maintainer=jstr(r.get("maintainer")).strip() or "xlsx", source="xlsx",
            model_id=(auto["model_id"] if auto else ""), sku_id=(auto["sku_id"] if auto else "")))
        if cc and jstr(r.get("model")).strip():
            seen_offer.add((cc, jstr(r.get("model")).strip(), jstr(r.get("color_size")).strip()))
        if pp:
            seen_psi.add((pp, ps))

    for o in offer_rows:
        if o.get("_covered") or (o["country"], o["model"], o["color_size"]) in seen_offer:
            continue
        cat3 = ""
        if o["industry"] == "tablet":
            spec_l = str(o["color_size"]).lower()
            cat3 = "PaperMatte" if ("柔光" in spec_l or "papermatte" in spec_l) else "Normal"
        rows.append(base_row(
            country=o["country"], category=o["category"], brand=o["brand"], model=o["model"],
            color_size=o["color_size"], series=o["series"], category1=o["cat1"],
            category2=o["cat2"], category3=cat3, info="",
            model_id=o["model_id"], sku_id=o["sku_id"],
            match_status="offer_only", maintainer="auto", source="auto-offer"))
    offer_by_key = {}
    for r in rows:
        if r["model"] and r["country"]:
            offer_by_key.setdefault((r["country"], _norm_text(r["model"])), []).append(r)

    for s in psi_rows:
        if not s["product"] or (s["product"], s["product_sku"]) in seen_psi:
            continue
        cat1, cat2, cat3, info = _psi_prefill_dims(s)
        cands = offer_by_key.get((s["cc"], _norm_text(s["product"]))) or []
        key = _cat_key_of_text(s["product_sku"] or s["product"])
        m = next((c for c in cands if c["match_status"] != "matched"
                  and (key is None or _cat_key_of_text(c["category1"]) == key)), None)
        industry = (m["category"] if m else _psi_industry_of(s["product"]))
        rows.append(base_row(
            country=s["cc"], category=industry,
            brand=(m["brand"] if m else _psi_brand_of(s["product"])),
            model=m["model"] if m else s["product"], color_size="",
            series=(m["series"] if m else series_guess_from_product(s["product"])),
            category1=cat1 or (m["category1"] if m else ""),
            category2=cat2 or (m["category2"] if m else ""),
            category3=cat3, info=info,
            psi_product=s["product"], product_sku=s["product_sku"],
            match_status="matched" if m else "psi_only",
            model_id=(m["model_id"] if m else ""), sku_id=(m["sku_id"] if m else ""),
            maintainer="auto", source="auto-psi"))
    return rows


def derive_fact_sales(psi_rows, match_rows):
    """PSI × 匹配表 → fact_sales（粒度=周期×口径×国家×型号×SKU；同键 qty 求和；
    未匹配行也落库（model_id=''，维度留空）——销量口径「型号×国家有真实行即整型号
    走真实」由前端 realSalesOf 判定，本表只供真实 PSI 承载。"""
    psi_idx = {}
    offer_idx = {}
    for m in match_rows:
        if jnum(m.get("is_active")) == 0:
            continue
        pp, ps = jstr(m.get("psi_product")).strip(), jstr(m.get("product_sku")).strip()
        # 只收挂接成功的行（model_id 非空）——psi_only 预填行未挂接，纳入会自我命中空行
        if pp and ps and m.get("model_id"):
            psi_idx.setdefault((pp, ps), m)
        cc, model = jstr(m.get("country")).strip(), jstr(m.get("model")).strip()
        if cc and model and m.get("model_id"):
            offer_idx.setdefault((cc, _norm_text(model)), []).append(m)
    acc = {}
    matched = unmatched = 0
    no_period = 0
    non_positive = 0
    for s in psi_rows:
        if s["qty"] is None:
            continue
        if s["qty"] <= 0:
            # 非正销量不进事实（契约：QTY ≤0 / 非法行剔除并计数）；负值若参与求和会冲低真实销量
            non_positive += 1
            continue
        if not s["period_id"]:
            # 周期解不出 = 周粒度事实无法定位（拍板②），不落脏行，diag 计数
            no_period += 1
            continue
        m = psi_idx.get((s["product"], s["product_sku"])) if s["product_sku"] else None
        if m is None and s["product"]:
            cands = offer_idx.get((s["cc"], _norm_text(s["product"]))) or []
            key = _cat_key_of_text(s["product_sku"] or s["product"])
            m = next((c for c in cands
                      if key is None or _cat_key_of_text(c.get("category1")) == key), None)
        if m is not None:
            matched += 1
        else:
            unmatched += 1
        k = (s["period_id"] or "", s["psi_type"] or "", s["cc"] or "",
             jstr(m.get("model_id")).strip() if m else "", s["product_sku"] or s["product"])
        slot = acc.get(k)
        if slot is None:
            slot = acc[k] = {
                "period_id": k[0], "psi_type": k[1], "country_code": k[2], "model_id": k[3],
                "product_sku": k[4], "category": "", "brand": "", "series": "",
                "category1": "", "category2": "", "category3": "", "category4": "", "qty": 0.0,
            }
            if m is not None:
                slot.update(category=jstr(m.get("category")).strip(),
                            brand=jstr(m.get("brand")).strip(), series=jstr(m.get("series")).strip(),
                            category1=jstr(m.get("category1")).strip(),
                            category2=jstr(m.get("category2")).strip(),
                            category3=jstr(m.get("category3")).strip(),
                            category4=jstr(m.get("category4")).strip())
        slot["qty"] += s["qty"] or 0.0
    rows = sorted(acc.values(), key=lambda r: (r["period_id"], r["country_code"], r["model_id"], r["product_sku"]))
    return rows, {"psiIn": len(psi_rows), "psiMatched": matched, "psiUnmatched": unmatched,
                  "psiNoPeriod": no_period, "psiNonPositiveQty": non_positive,
                  "factSalesRows": len(rows)}


def sales_pack_view(s):
    """PSI 归一行 → 前端 SalesSourceRow 形态（country=两位码；product_sku/psiType/
    region 为容忍附加键，前端 normalizeSalesRows 只读已知键；qty 整数化保持
    JSON 字节形态与旧透传一致——parity 金标约束）"""
    qty = s["qty"]
    if isinstance(qty, float) and qty.is_integer():
        qty = int(qty)
    row = {"country": s["cc"], "product": s["product"],
           "category1": s["category1"] or None, "category2": s["category2"] or None,
           "periodId": s["period_id"], "qty": qty}
    if s["product_sku"]:
        row["productSku"] = s["product_sku"]
    if s["psi_type"]:
        row["psiType"] = s["psi_type"]
    if s["region"]:
        row["region"] = s["region"]
    return row


def build_sales_aliases(match_rows, raw_aliases):
    """salesProductAliases：PSI Product 原文 → 型号正名。只收**已匹配**行
    （model_id 非空，真绑定才进别名）；原 raw 包别名兜底先入——人工映射覆盖同键。
    未匹配产品不进别名（psi_only 积压等人工回填，禁自造恒等别名污染契约）。"""
    aliases = dict(raw_aliases or {})
    for m in match_rows:
        pp = jstr(m.get("psi_product")).strip()
        if not pp or not jstr(m.get("model_id")).strip():
            continue
        target = jstr(m.get("model")).strip()
        if target:
            aliases[pp] = target
    return aliases


def _psi_brand_of(product):
    """PSI 产品串品牌词兜底识别（BRAND_TOKENS 扫描）；无品牌词 = 我司
    （PSI 表首期为我司销量导出）"""
    low = str(product or "").lower()
    for brand, tokens in BRAND_TOKENS.items():
        for t in tokens:
            if t in low:
                return brand
    return "HUAWEI"


def excel_date_to_str(v):
    """Excel 日期序列号兜底（数值 20000–60000 ≈ 1954–2064）→ YYYY-MM-DD；其余原样"""
    if isinstance(v, (int, float)) and not isinstance(v, bool) and 20000 <= v <= 60000:
        return (date(1899, 12, 30) + timedelta(days=int(v))).strftime("%Y-%m-%d")
    return jstr(v).strip()


def read_config_tables(path):
    """data/config_tables.xlsx 四页签（配置表+补录表交付工作簿）→ dict；前缀匹配
    页签名（容忍人工改名）；缺文件/页签 = None（回退 config.json 现路径）。"""
    if not path or not os.path.exists(path):
        return None
    try:
        import xlsx_reader
        names = xlsx_reader.sheet_names(path)

        def pick(prefix):
            for n in names:
                if n.startswith(prefix):
                    return xlsx_reader.read_sheet_dicts(path, n)
            return None
        return {
            "matchRows": pick("匹配表"),
            "competitorRows": pick("竞品匹配"),
            "priceBandRows": pick("价格档位"),
            "promoRows": pick("大促档期"),
        }
    except Exception:  # noqa: BLE001 —— 配置表坏档不阻断主链，回退 config.json
        return None


def resolve_benchmarks(comp_rows, dims_product):
    """竞品匹配表（维度组）→ pack dims.benchmark（ID 直连形态，前端契约不变）。
    own 侧：main_series+main_category1（空=不限）→ 我方 model；com 侧：品牌+型号
    （弱归一包含匹配）+规格 → 竞品 sku（多候选取参考价最低）。解不出/停用跳过，
    计数进 diag。"""
    own_models = {}
    for p in dims_product:
        if not p.get("is_own"):
            continue
        rec = own_models.setdefault(p["model_id"], {"series": p.get("series") or "",
                                                    "name": _norm_text(p.get("model_name")),
                                                    "cat1s": set()})
        if p.get("cat1"):
            rec["cat1s"].add(p["cat1"])
    com_skus = [p for p in dims_product if not p.get("is_own")]
    out = []
    diag = {"compIn": 0, "compResolved": 0, "compOwnMissing": 0, "compComMissing": 0,
            "compAmbiguous": 0, "compInactive": 0}
    for r in comp_rows or []:
        diag["compIn"] += 1
        if jnum(r.get("is_active")) == 0:
            diag["compInactive"] += 1
            continue
        cc = cc_of_loose(r.get("country"), COUNTRY_CODES)
        mm = _norm_text(jstr(r.get("main_model")).strip())
        series, mc1 = jstr(r.get("main_series")).strip(), jstr(r.get("main_category1")).strip()
        if mm:
            # main_model 列（建议增补）：型号精确反解，歧义归零
            own_hits = [mid for mid, rec in own_models.items() if rec["name"] == mm]
        else:
            own_hits = [mid for mid, rec in own_models.items()
                        if (not series or rec["series"] == series)
                        and (not mc1 or mc1 in rec["cat1s"])]
        if len(own_hits) > 1:
            diag["compAmbiguous"] += 1
            own_hits = [sorted(own_hits)[0]]
        if not own_hits:
            diag["compOwnMissing"] += 1
            continue
        com_brand = strip_brand_text(jstr(r.get("com_brand")).strip()).upper()
        com_prod = _norm_text(jstr(r.get("com_product")).strip())
        cc1 = jstr(r.get("com_category1")).strip()
        cands = [p for p in com_skus
                 if strip_brand_text(jstr(p.get("brand")).strip()).upper() == com_brand
                 and (not com_prod or com_prod in _norm_text(p.get("model_name"))
                      or _norm_text(p.get("model_name")) == com_prod)
                 and (not cc1 or cc1 == (p.get("cat1") or ""))]
        if not cands:
            diag["compComMissing"] += 1
            continue
        cands.sort(key=lambda p: (p.get("ref_price_usd") is None,
                                  p.get("ref_price_usd") if p.get("ref_price_usd") is not None else 0,
                                  p["sku_id"]))
        out.append({"country_code": cc, "own_model_id": own_hits[0],
                    "own_romram": mc1 or "—", "competitor_sku_id": cands[0]["sku_id"],
                    "sort": int(jnum(r.get("comp_rank")) or 0), "source": "manual", "note": None})
        diag["compResolved"] += 1
    return out, diag


def build_tier_from_bands(band_rows):
    """价格档位表行（分国×产业显式行）→ pack dims.tier（码=min-max/min+/<max，
    labels=price_band 展示名）。pack tier 契约是全局单对象（无国家维度）——分国
    行先按国家分组取「众数阶梯」（当前 9 国同源展开 = 完全一致，去重即还原），
    分国差异计数进 diag 供人工知悉。派生层型号落档仍走 config tierLadders。"""
    CAT_EN = {"手机": "phone", "平板": "tablet", "穿戴": "wearable", "音频": "audio"}

    def bands_of(rs):
        rs = sorted(rs, key=lambda r: (jnum(r.get("band_sort")) or 0))
        seq = []
        for r in rs:
            mn, mx = jnum(r.get("min_price")), jnum(r.get("max_price"))
            if mn is None and mx is not None:
                code = f"<{int(mx)}"
            elif mx is None and mn is not None:
                code = f"{int(mn)}+"
            elif mn is not None and mx is not None:
                code = f"{int(mn)}-{int(mx)}"
            else:
                continue
            seq.append((code, jstr(r.get("price_band")).strip() or tier_label(code)))
        return seq

    groups = {}
    for r in band_rows or []:
        ind = CAT_EN.get(jstr(r.get("category")).strip())
        if ind:
            cc = jstr(r.get("country")).strip().upper()
            groups.setdefault(ind, {}).setdefault(cc, []).append(r)
    ladders, labels = {}, {}
    for ind, by_cc in groups.items():
        seqs = {cc: bands_of(rs) for cc, rs in by_cc.items()}
        variants = {}
        for seq in seqs.values():
            key = tuple(seq)
            variants[key] = variants.get(key, 0) + 1
        # 并列时取最长阶梯（band 更多的国家序列更完整，短序列多为漏行）
        best = sorted(variants.items(),
                      key=lambda kv: (-kv[1], -len(kv[0]), kv[0][0][0] if kv[0] else ""))[0][0]
        codes = [c for c, _ in best]
        lab = {c: t for c, t in best}
        if codes:
            ladders[ind] = codes
            labels[ind] = lab
    return {"ladders": ladders, "labels": labels}


def build_promo_from_rows(promo_rows):
    """大促档期表行（国家×产业×平台×起止）→ pack dims.promo（promo_info 尾部
    （深/中/浅）解析回 depth_hint；platform 空=全部 → platforms=None）。"""
    out = []
    for r in promo_rows or []:
        cc = cc_of_loose(r.get("country"), COUNTRY_CODES)
        if not cc:
            continue
        info = jstr(r.get("promo_info")).strip()
        depth = ""
        m = re.search(r"[（(]([深中浅])[)）]\s*$", info)
        if m:
            depth = m.group(1)
            info = info[:m.start()].strip()
        start, end = excel_date_to_str(r.get("start_date")), excel_date_to_str(r.get("end_date"))
        plat = jstr(r.get("platform")).strip()
        platforms = [plat] if plat and plat not in ("全部", "全平台") else None
        pid_src = f"{cc}|{plat}|{start}|{info}"
        pid = f"{cc}-{hashlib.sha1(pid_src.encode('utf-8')).hexdigest()[:6]}-{start}"
        out.append({"promo_id": pid, "country_code": cc, "promo_name": info,
                    "start_date": start, "end_date": end,
                    "depth_hint": depth or None, "platforms": platforms,
                    "channel_raw": "config_tables.xlsx"})
    return out


# ================================================================ v2 包组装（applyDataPack v3 分支对等）


def apply_human_overrides(built, match_rows):
    """人工匹配行（xlsx「匹配表(补录)」权威）→ sku 字典覆盖：series/brand/model 修订
    生效，并为 sku 字典新增 spec_display（cat1/cat2/cat3 展示串）/spec_info（次级筛选
    值，IoT 少一层=空）。sku 对应：挂接 sku_id 优先；行 info 与 sku.color 不符时在同
    model 同规格内按 info 重选（防同键多颜色取首条时的颜色错位）。"""
    dims_prod = built.get("dims", {}).get("product") or []
    if not dims_prod or not match_rows:
        return
    by_sku = {p["sku_id"]: p for p in dims_prod}
    diag = {"ovrRows": 0, "ovrApplied": 0, "ovrReselected": 0, "ovrUnhooked": 0}
    for r in match_rows:
        if r.get("source") != "xlsx" or not r.get("sku_id"):
            continue
        diag["ovrRows"] += 1
        target = by_sku.get(r["sku_id"])
        info_n = _norm_text(jstr(r.get("info")).strip())
        cat1_n = _norm_text(jstr(r.get("category1")).strip())
        if target is not None and info_n:
            if _norm_text(jstr(target.get("color")).strip()) != info_n:
                alt = next((p for p in dims_prod
                            if p["model_id"] == target["model_id"]
                            and _norm_text(jstr(p.get("color")).strip()) == info_n
                            and (not cat1_n
                                 or _norm_text(jstr(p.get("romram")).strip()) == cat1_n
                                 or _norm_text(jstr(p.get("cat1") or "").strip()) == cat1_n)), None)
                if alt is not None:
                    target = alt
                    diag["ovrReselected"] += 1
        if target is None:
            diag["ovrUnhooked"] += 1
            continue
        diag["ovrApplied"] += 1
        for field, val in (("series", r.get("series")), ("brand", r.get("brand")),
                           ("model_name", r.get("model"))):
            v = jstr(val).strip()
            if v:
                target[field] = v
        # 直写 romram/color（次级显示与筛选器的既有消费字段，前端零改动；
        # sku_id 契约不受影响——ID 字符串保持不变）。IoT 行 color_size 空 → romram 空
        # = 产品筛选器自然少一层。
        target["romram"] = jstr(r.get("color_size")).strip() or "—"
        target["color"] = jstr(r.get("info")).strip() or "—"
        target["spec_display"] = jstr(r.get("color_size")).strip()
        target["spec_info"] = jstr(r.get("info")).strip()
    built["diag"]["humanOverrides"] = diag


def build_v2_pack(raw_pack, ctx):
    offers = raw_pack.get("offers") if isinstance(raw_pack.get("offers"), list) else []
    if not offers:
        raise ValueError("原表模式数据包 offers 段为空（至少需要 1 行采集明细）")
    if not all(r is not None and isinstance(r, dict) for r in offers):
        raise ValueError("offers 必须是对象数组（每行一条采集明细）")
    built = build_from_offers(offers, ctx)
    # --- PSI × 匹配表 × 配置三表（数据建模方案 v2 主链；无 sales/config_tables 时
    # 全部退化为 v1 行为：sales=[]、aliases 透传、dims 维持 config.json 路径） ---
    cfg = ctx.get("configTables") or {}
    psi_rows = normalize_psi_rows(raw_pack.get("sales"))
    match_rows = build_map_product(cfg.get("matchRows"), _offer_inventory(built), psi_rows)
    apply_human_overrides(built, match_rows)
    fact_sales_rows, sales_diag = derive_fact_sales(psi_rows, match_rows)
    sales_pack_rows = [sales_pack_view(s) for s in psi_rows]
    aliases = build_sales_aliases(match_rows, raw_pack.get("salesProductAliases")
                                  if isinstance(raw_pack.get("salesProductAliases"), dict) else {})
    if cfg.get("competitorRows") is not None:
        built["dims"]["benchmark"], bench_diag = resolve_benchmarks(cfg["competitorRows"],
                                                                    built["dims"]["product"])
    else:
        bench_diag = {}
    if cfg.get("priceBandRows"):
        built["dims"]["tier"] = build_tier_from_bands(cfg["priceBandRows"])
    if cfg.get("promoRows") is not None:
        built["dims"]["promo"] = build_promo_from_rows(cfg["promoRows"])
    built["diag"]["sales"] = dict(sales_diag, **bench_diag)
    built["psi"] = psi_rows
    built["mapProduct"] = match_rows
    built["factSales"] = fact_sales_rows
    built["configTables"] = cfg
    v2 = {
        "kind": "pricelens-data-pack",
        "v": 2,
        "generatedAt": raw_pack.get("generatedAt") if isinstance(raw_pack.get("generatedAt"), str) else "",
        "dims": built["dims"],
        "factPackB64": encode_fact_pack_b64(built["factRows"]),
        "monthly": raw_pack.get("monthly") if isinstance(raw_pack.get("monthly"), list) else [],
        "sales": sales_pack_rows,
        "salesProductAliases": aliases,
    }
    return v2, built


# ================================================================ SQLite 落库（v2 数据模型，2026-11-23 重构）

TABLES = (
    # ODS 原样层（零派生列；extra_json 兜住规范列外字段）
    "ods_offer", "ods_psi",
    # 补录/配置层（人工维护的业务配置；xlsx 权威行规范化落库）
    "cfg_competitor", "map_price_band", "map_promo", "map_region",
    # MAP 匹配层（「我们加的」匹配规则；xlsx 人工行权威，auto 行引擎预填）
    "map_product",
    # FACT 事实层（宽表：描述属性/周历/大区随行 stamp，查询免 join）
    "fact_price", "fact_sales",
    # CFG / META
    "cfg_kv", "meta_import",
)
# 旧版遗留表（v1 → v2 → v3 原地升级，把新服务器文件覆盖到旧部署目录、保留旧
# pricelens.db 时）必须删除——否则过期数据与新表并存（2026-11-23 审计 A11；
# v3 收编：v2 全部 dim_* 镜像 + map_competitor 旧 row_json 形态）。2026-11-26 v3。
LEGACY_TABLES = (
    "ods_offer_raw", "ods_psi_sales", "map_model", "map_sku", "map_spec_split", "map_tier",
    "map_alias", "dim_channel", "fact_price_weekly",
    "map_competitor",
    "dim_category", "dim_brand", "dim_series", "dim_model", "dim_sku",
    "dim_platform", "dim_store_type", "dim_shop",
    "dim_region", "dim_time", "dim_fx", "dim_promo", "dim_benchmark", "dim_tier",
)
# schema 版本（PRAGMA user_version）：v1/v2 落库从未设置（=0），v3=3、v3.1（map_region
# 瘦身三列）=4——版本不符时 _sqlite_clear_and_load 先整体 DROP 再建，防旧结构残留
SCHEMA_VERSION = 5

SCHEMA = """
-- ODS 原样层（数据建模方案 v2 §2：offer 底表 29 规范列 / PSI 表 7 规范列+旧形态 2 列）
CREATE TABLE IF NOT EXISTS ods_offer (
    pack_id TEXT NOT NULL, row_ix INTEGER NOT NULL,
    tech_date TEXT, category TEXT, brand TEXT, model TEXT, color_size TEXT,
    platform TEXT, country TEXT, store_type TEXT, shop_name TEXT, shop_name_new TEXT,
    official_rrp_local REAL, official_selling_price_local REAL, official_discount_rate REAL,
    platform_rrp_local REAL, platform_selling_price_local REAL,
    platform_discount_rate REAL, platform_real_discount_rate REAL,
    currency TEXT, exchange_rate REAL,
    official_rrp_usd REAL, official_selling_price_usd REAL,
    platform_rrp_usd REAL, platform_selling_price_usd REAL,
    is_bundle TEXT, installment TEXT, promotion_details TEXT,
    url TEXT, screenshot TEXT, collection_time TEXT, extra_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_ods_offer_pack ON ods_offer(pack_id);
CREATE TABLE IF NOT EXISTS ods_psi (
    pack_id TEXT NOT NULL, row_ix INTEGER NOT NULL,
    management_region TEXT, management_country TEXT, product TEXT, product_sku TEXT,
    category1 TEXT, category2 TEXT, period_id TEXT, psi_type TEXT, qty REAL,
    extra_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_ods_psi_pack ON ods_psi(pack_id);
-- MAP 匹配配置层（§3：统一匹配表 + 工程键；xlsx「匹配表(补录)」页签=权威；
-- orig_* = 人工修订前的引擎原值，供清洗对照）
CREATE TABLE IF NOT EXISTS map_product (
    country TEXT, category TEXT, brand TEXT, model TEXT,
    orig_brand TEXT, orig_model TEXT, color_size TEXT,
    series TEXT, category1 TEXT, category2 TEXT, category3 TEXT, category4 TEXT,
    info TEXT, psi_product TEXT, product_sku TEXT,
    is_active INTEGER, match_status TEXT, updated_at TEXT, maintainer TEXT,
    model_id TEXT, sku_id TEXT, source TEXT
);
CREATE INDEX IF NOT EXISTS ix_map_product_psi ON map_product(psi_product, product_sku);
CREATE INDEX IF NOT EXISTS ix_map_product_offer ON map_product(country, model);
-- 竞品配置表 17 权威列（country=国家 category=品类 main_*=我司品牌/系列/规格/尺寸/
-- 柔光/预留 com_*=竞品品牌/系列/型号/规格/尺寸/柔光/预留 comp_rank=竞品排序
-- is_active=生效位）+ main_model 建议增补列（resolve_benchmarks 型号精确反解）；
-- 数据质量问题直接修 xlsx「竞品匹配」源，派生层只做映射不做清洗
CREATE TABLE IF NOT EXISTS cfg_competitor (
    country TEXT, category TEXT,
    main_brand TEXT, main_model TEXT, main_series TEXT,
    main_category1 TEXT, main_category2 TEXT, main_category3 TEXT, main_category4 TEXT,
    com_brand TEXT, com_series TEXT, com_product TEXT,
    com_category1 TEXT, com_category2 TEXT, com_category3 TEXT, com_category4 TEXT,
    comp_rank REAL, is_active REAL
);
CREATE TABLE IF NOT EXISTS map_price_band (
    country TEXT, category TEXT, price_band TEXT, band_sort REAL, max_price REAL, min_price REAL
);
CREATE TABLE IF NOT EXISTS map_promo (
    country TEXT, category TEXT, platform TEXT, start_date TEXT, end_date TEXT, promo_info TEXT
);
-- DIM 维表层已裁撤（v3，2026-11-26）：描述属性/周历/大区随行 stamp 进 fact_price
-- 宽列，DB 直读免 join；ID 字典与 pack 契约形态（promo/benchmark/tier 同构直读）
-- 只活在 pack JSON 的 dims——前端契约不受影响，DB 不再存第二形态。
-- region 匹配表（只提供 国家 → 国家中文名 → 大区 的纯匹配关系；
-- 运行时配置如默认电渠/核心平台只活在 pack JSON dims.region，不入原始表）
CREATE TABLE IF NOT EXISTS map_region (
    country_code TEXT PRIMARY KEY, country_name TEXT, region_name TEXT
);
-- FACT 事实层（§4：宽表——键+stamp 11 列+渠道+双价族[官方族=预留]）
CREATE TABLE IF NOT EXISTS fact_price (
    -- 键
    week_id TEXT, country_code TEXT, sku_id TEXT,
    -- stamp：描述属性（sku 字典）/ 大区（region 匹配表）/ 周历（时间粒度拓展）
    region_name TEXT, industry TEXT, category TEXT, brand TEXT, is_own INTEGER,
    model_id TEXT, series TEXT, romram TEXT, color TEXT, tier_code TEXT,
    month_id TEXT, quarter_id TEXT, week_start_date TEXT, week_wed_date TEXT,
    -- 渠道
    platform TEXT, store_type TEXT, shop TEXT,
    -- 双价族（官方族=预留，旧格式输入恒 NULL）
    official_rrp_local REAL, official_selling_price_local REAL, official_discount_rate REAL,
    platform_rrp_local REAL, platform_selling_price_local REAL,
    platform_discount_rate REAL, platform_real_discount_rate REAL,
    currency TEXT, exchange_rate REAL,
    official_rrp_usd REAL, official_selling_price_usd REAL,
    platform_rrp_usd REAL, platform_selling_price_usd REAL,
    -- 其他
    is_bundle INTEGER, installment TEXT, promotion_details TEXT,
    url TEXT, screenshot TEXT, collection_time TEXT
);
CREATE INDEX IF NOT EXISTS ix_fact_price_week_sku ON fact_price(week_id, sku_id);
CREATE INDEX IF NOT EXISTS ix_fact_price_country_month ON fact_price(country_code, month_id);
CREATE TABLE IF NOT EXISTS fact_sales (
    period_id TEXT, psi_type TEXT, country_code TEXT, category TEXT, brand TEXT,
    model_id TEXT, series TEXT, category1 TEXT, category2 TEXT, category3 TEXT,
    category4 TEXT, product_sku TEXT, qty REAL
);
CREATE INDEX IF NOT EXISTS ix_fact_sales_period ON fact_sales(period_id, model_id);
CREATE TABLE IF NOT EXISTS cfg_kv (key TEXT PRIMARY KEY, json TEXT);
CREATE TABLE IF NOT EXISTS meta_import (
    id TEXT PRIMARY KEY, ts TEXT, kind TEXT, rows_in INTEGER, rows_out INTEGER, diag_json TEXT
);
"""


def load_to_sqlite(db_path, raw_pack, built, pack_id, config=None):
    """v3 原包（ODS）+ 派生结果（map_product/DIM/fact_price/fact_sales）落 SQLite；
    整包置换语义（TABLES 全清重灌，pack_id 隔离旧包）"""
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        _sqlite_clear_and_load(conn, raw_pack, built, pack_id, kind="v3-offers")
    finally:
        conn.close()


def _band_range(code):
    """档位码 → (min, max)：首段 <N → (0, N)；末段 N+ → (N, None)；N-M → (N, M)"""
    s = str(code)
    if s.startswith("<"):
        return 0.0, float(s[1:])
    if s.endswith("+"):
        return float(s[:-1]), None
    lo, hi = s.split("-", 1)
    return float(lo), float(hi)


def _sqlite_clear_and_load(conn, raw_pack, built, pack_id, kind="v3-offers"):
    """SCHEMA 建表 + TABLES 全清 + ODS/补录/MAP/FACT 重灌（v3 主链与 v1/v2 落库共用）"""
    # schema 版本门：旧库（v1/v2）同名表结构已过时（fact_price 28→39 列等），
    # IF NOT EXISTS 不会更新列——版本不符先整体 DROP 再建（v3，2026-11-26）
    ver = conn.execute("PRAGMA user_version").fetchone()[0]
    if ver < SCHEMA_VERSION:
        for table in TABLES + LEGACY_TABLES:
            conn.execute(f"DROP TABLE IF EXISTS {table}")
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
    conn.executescript(SCHEMA)
    cur = conn.cursor()
    for table in LEGACY_TABLES:
        cur.execute(f"DROP TABLE IF EXISTS {table}")
    for table in TABLES:
        cur.execute(f"DELETE FROM {table}")
    # ODS offer：29 规范列 + extra_json（超出规范列的字段原样保留）
    offers = (raw_pack or {}).get("offers") or []
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
        f"INSERT INTO ods_offer VALUES ({','.join('?' * (len(ODS_COLUMNS) + 3))})", ods_rows)
    # ODS psi：PSI 7 规范列 + 旧形态 category1/2 + extra_json
    psi_rows = built.get("psi") if isinstance(built, dict) else None
    if psi_rows is None:
        psi_rows = normalize_psi_rows((raw_pack or {}).get("sales"))
    known = set(PSI_HEADER_MAP.values()) | {"qty"}
    cur.executemany(
        f"INSERT INTO ods_psi VALUES ({','.join('?' * 12)})",
        [[pack_id, ix, r["region"] or None, r["country_raw"] or None, r["product"] or None,
          r["product_sku"] or None, r["category1"] or None, r["category2"] or None,
          r["period_id"] or None, r["psi_type"] or None, r["qty"],
          r.get("extra_json")] for ix, r in enumerate(psi_rows)])
    # MAP：统一匹配表（三源合并行）+ 配置三表（xlsx 权威行原样）
    cur.executemany(
        f"INSERT INTO map_product VALUES ({','.join('?' * 22)})",
        [[r.get("country") or None, r.get("category") or None, r.get("brand") or None,
          r.get("model") or None,
          r.get("orig_brand") or None, r.get("orig_model") or None,
          r.get("color_size") or None, r.get("series") or None,
          r.get("category1") or None, r.get("category2") or None, r.get("category3") or None,
          r.get("category4") or None, r.get("info") or None,
          r.get("psi_product") or None, r.get("product_sku") or None,
          1 if jnum(r.get("is_active")) != 0 else 0,
          r.get("match_status") or "offer_only", r.get("updated_at") or None,
          r.get("maintainer") or None, r.get("model_id") or None, r.get("sku_id") or None,
          r.get("source") or None]
         for r in (built.get("mapProduct") or [])])
    cfg = (built.get("configTables") or {}) if isinstance(built, dict) else {}
    # 补录/配置层：xlsx 权威行规范化落库（v3：竞品配置 17+1 列，不再 row_json 照存）
    comp_rows = cfg.get("competitorRows") or []
    if not comp_rows:
        # xlsx「竞品匹配」页签未建（过渡期）：从生效配对（config.json matrix，ID 直连）
        # 回填 17+1 列业务原文——表不为空、行行可溯；页签建立后 xlsx 行自然接管
        prod_by_id = {p["sku_id"]: p for p in ((built.get("dims") or {}).get("product") or [])}
        model_by_id = {}
        for p in (built.get("dims") or {}).get("product") or []:
            if p.get("is_own") and p["model_id"] not in model_by_id:
                model_by_id[p["model_id"]] = p
        region_by_cc = {r["country_code"]: r for r in (built.get("dims") or {}).get("region") or []}
        for b in (built.get("dims") or {}).get("benchmark") or []:
            own = model_by_id.get(b.get("own_model_id")) or {}
            com = prod_by_id.get(b.get("competitor_sku_id")) or {}
            rg = region_by_cc.get(b.get("country_code")) or {}
            comp_rows.append({
                "country": rg.get("country_name") or b.get("country_code"),
                "category": CAT_CN.get(own.get("industry"), own.get("industry")),
                "main_brand": own.get("brand"), "main_model": own.get("model_name"),
                "main_series": own.get("series"),
                "main_category1": b.get("own_romram"), "main_category2": own.get("cat2"),
                "main_category3": "", "main_category4": "",
                "com_brand": com.get("brand"), "com_series": com.get("series"),
                "com_product": com.get("model_name"),
                "com_category1": com.get("cat1") or com.get("romram"),
                "com_category2": com.get("cat2"), "com_category3": "", "com_category4": "",
                "comp_rank": b.get("sort"), "is_active": 1,
            })
    cur.executemany(f"INSERT INTO cfg_competitor VALUES ({','.join('?' * 18)})",
                    [[jstr(r.get("country")).strip(), jstr(r.get("category")).strip(),
                      jstr(r.get("main_brand")).strip(), jstr(r.get("main_model")).strip(),
                      jstr(r.get("main_series")).strip(),
                      jstr(r.get("main_category1")).strip(), jstr(r.get("main_category2")).strip(),
                      jstr(r.get("main_category3")).strip(), jstr(r.get("main_category4")).strip(),
                      jstr(r.get("com_brand")).strip(), jstr(r.get("com_series")).strip(),
                      jstr(r.get("com_product")).strip(),
                      jstr(r.get("com_category1")).strip(), jstr(r.get("com_category2")).strip(),
                      jstr(r.get("com_category3")).strip(), jstr(r.get("com_category4")).strip(),
                      jnum(r.get("comp_rank")), jnum(r.get("is_active"))]
                     for r in comp_rows])
    band_rows = cfg.get("priceBandRows") or []
    if not band_rows:
        # xlsx「价格档位」页签未建（过渡期）：从生效阶梯（config tierLadders → pack
        # dims.tier，6 产业全局阶梯）× 25 启用国展开分国显式行；页签建立后 xlsx 行接管
        tier = (built.get("dims") or {}).get("tier") or {}
        for rg in (built.get("dims") or {}).get("region") or []:
            if not rg.get("enabled"):
                continue
            cname = rg.get("country_name") or rg["country_code"]
            for ind, codes in (tier.get("ladders") or {}).items():
                labels = (tier.get("labels") or {}).get(ind) or {}
                for ix, code in enumerate(codes):
                    lo, hi = _band_range(code)
                    band_rows.append({
                        "country": cname, "category": CAT_CN.get(ind, ind),
                        "price_band": labels.get(code) or code,
                        "band_sort": ix + 1, "max_price": hi, "min_price": lo,
                    })
    cur.executemany("INSERT INTO map_price_band VALUES (?,?,?,?,?,?)",
                    [[jstr(r.get("country")).strip(), jstr(r.get("category")).strip(),
                      jstr(r.get("price_band")).strip(), jnum(r.get("band_sort")),
                      jnum(r.get("max_price")), jnum(r.get("min_price"))]
                     for r in band_rows])
    promo_rows = cfg.get("promoRows") or []
    if not promo_rows:
        # xlsx「大促档期」页签未建（过渡期）：从生效档期（config promoRows → pack
        # dims.promo）反填业务原文；页签建立后 xlsx 行接管
        rg_by_cc = {r["country_code"]: r for r in (built.get("dims") or {}).get("region") or []}
        for p in (built.get("dims") or {}).get("promo") or []:
            rg = rg_by_cc.get(p.get("country_code")) or {}
            hint = p.get("depth_hint")
            promo_rows.append({
                "country": rg.get("country_name") or p.get("country_code"),
                "category": "",
                "platform": "、".join(p.get("platforms") or []) if p.get("platforms") else "",
                "start_date": p.get("start_date"), "end_date": p.get("end_date"),
                "promo_info": f"{p.get('promo_name') or ''}（深度:{hint}）" if hint else (p.get("promo_name") or ""),
            })
    cur.executemany("INSERT INTO map_promo VALUES (?,?,?,?,?,?)",
                    [[jstr(r.get("country")).strip(), jstr(r.get("category")).strip(),
                      jstr(r.get("platform")).strip(),
                      excel_date_to_str(r.get("start_date")) or None,
                      excel_date_to_str(r.get("end_date")) or None,
                      jstr(r.get("promo_info")).strip()]
                     for r in promo_rows])
    _load_dims_and_facts(cur, built["dims"], built["factRows"], pack_id,
                         kind=kind, diag=built.get("diag"),
                         fact_sales_rows=built.get("factSales") or [])
    conn.commit()
    conn.isolation_level = None
    conn.execute("VACUUM")   # 回收旧表 / 上一批次占用的空间（库文件不随导入次数膨胀）


def _load_dims_and_facts(cur, dims, fact_rows, pack_id, spec_split=None, kind="pack", diag=None,
                         fact_sales_rows=None):
    """fact_price（v3 宽表 stamp）+ map_region + fact_sales 落库。
    DIM 层已裁撤：描述属性/周历/大区随行 stamp 进 fact 宽列（查询免 join）；
    ID 字典与 pack 契约形态只活在 pack JSON，DB 不再存第二形态。"""
    products = dims.get("product") or []
    # stamp 查典：sku 字典 / 周历 / region 匹配表（缺行落 NULL，不阻断装载）
    sku_by_id = {p["sku_id"]: p for p in products}
    time_by_week = {t["week_id"]: t for t in dims.get("time") or []}
    region_by_cc = {r["country_code"]: r for r in dims.get("region") or []}
    # map_region（纯匹配关系：国家 → 中文名 → 大区；运行时配置留 pack JSON）
    cur.executemany("INSERT OR REPLACE INTO map_region VALUES (?,?,?)",
                    [[r["country_code"], r.get("country_name"), r.get("region_name")]
                     for r in dims.get("region") or []])
    # fact_price（v3 宽表 39 列：键 3 + stamp 14 + 渠道 3 + 双价族 16 + 其他 3；
    # stamp 11 列=industry/region_name/系列配置/tier/is_own + 周历 4 列）
    def _stamp(r):
        sku = sku_by_id.get(r.get("sku_id")) or {}
        t = time_by_week.get(r.get("week_id")) or {}
        rg = region_by_cc.get(r.get("country_code")) or {}
        return [r["week_id"], r["country_code"], r["sku_id"],
                rg.get("region_name"), sku.get("industry"), r.get("category_cn"),
                r.get("brand"), 1 if sku.get("is_own") else 0,
                r.get("model_id"), sku.get("series"), sku.get("romram"),
                sku.get("color"), sku.get("tier_code", "—"),
                t.get("month_id"), t.get("quarter_id"),
                t.get("week_start_date"), t.get("week_wed_date"),
                r.get("platform") or "—", r.get("store_type") or "—", r.get("shop") or "—",
                r.get("o_rrp_local"), r.get("o_price_local"), r.get("o_discount"),
                r["rrp_local"], r["price_local"], r["discount_display"], r["discount_actual"],
                r.get("currency") or None, r.get("exchange_rate"),
                r.get("o_rrp_usd"), r.get("o_price_usd"),
                r.get("rrp_usd"), r.get("price_usd"),
                1 if r.get("bundle") else 0, r.get("installment"), r.get("promo_text"),
                r["url"], r["screenshot"], r["crawled_at"]]
    cur.executemany(f"INSERT INTO fact_price VALUES ({','.join('?' * 39)})",
                    [_stamp(r) for r in fact_rows])
    # fact_sales（周粒度物理化，拍板⑦）
    cur.executemany(f"INSERT INTO fact_sales VALUES ({','.join('?' * 13)})",
                    [[r.get("period_id"), r.get("psi_type") or None, r.get("country_code"),
                      r.get("category") or None, r.get("brand") or None, r.get("model_id") or None,
                      r.get("series") or None, r.get("category1") or None,
                      r.get("category2") or None, r.get("category3") or None,
                      r.get("category4") or None, r.get("product_sku") or None, r.get("qty")]
                     for r in fact_sales_rows or []])
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    cur.execute("INSERT OR REPLACE INTO meta_import VALUES (?,?,?,?,?,?)",
                [pack_id, now, kind, diag.get("rowsIn") if diag else len(fact_rows),
                 len(fact_rows), json.dumps(diag or {"rowsOut": len(fact_rows)}, ensure_ascii=False)])


def load_v2_pack_to_sqlite(db_path, v2_pack, pack_id):
    """v1/v2 规范化包落 SQLite（2026-11-18 补「把所有数据都更新上去」）：解码
    factPackB64 列式 → 展开事实行，dims 原样入库；ODS offer 层无原表（v3 主链
    才有），sales 段（如有）走 PSI 归一 → fact_sales（v2 物理化）。"""
    blob = base64.b64decode(v2_pack["factPackB64"])
    pack = json.loads(gzip.decompress(blob).decode("utf-8"))
    weeks, skus, channels = pack["weeks"], pack["skus"], pack["channels"]
    d = pack["dict"]
    cols = pack["cols"]
    n = len(cols["w"])
    fact_rows = []
    for i in range(n):
        cid = channels[cols["h"][i]]
        # fx 防除零（2026-11-18 审计：外部 v1/v2 包不经前端 validateFactPack，
        # fx<=0 畸形值在此除零崩——兜底为 1，USD 列失真但落库与包透传不断）
        fx_i = cols["fx"][i]
        if not (isinstance(fx_i, (int, float)) and math.isfinite(fx_i) and fx_i > 0):
            fx_i = 1
        price_i, rrp_i = cols["p"][i], cols["rrp"][i]
        cc = cid.split(":")[0]
        st = cid.rsplit(":", 1)[-1] if cid.count(":") >= 2 else "—"
        pf = cid.split(":")[1] if cid.count(":") >= 2 else "—"
        sku = next((p for p in v2_pack.get("dims", {}).get("product") or [] if p["sku_id"] == skus[cols["s"][i]]), None)
        fact_rows.append({
            "week_id": weeks[cols["w"][i]], "sku_id": skus[cols["s"][i]],
            "country_code": cc, "channel_id": cid,
            "platform": pf, "store_type": st,
            "shop": d["seller"][cols["seller"][i]], "seller": d["seller"][cols["seller"][i]],
            "category_cn": CAT_CN.get((sku or {}).get("industry"), (sku or {}).get("industry")),
            "brand": (sku or {}).get("brand"), "model_id": (sku or {}).get("model_id"),
            "rrp_local": rrp_i, "price_local": price_i, "fx": fx_i,
            "rrp_usd": jr2(rrp_i / fx_i) if rrp_i is not None else None,
            "price_usd": jr2(price_i / fx_i) if price_i is not None else None,
            "discount_display": cols["dd"][i], "discount_actual": cols["da"][i],
            "bundle": bool(cols["b"][i]),
            "installment": d["inst"][cols["inst"][i]], "promo_text": d["promo"][cols["promo"][i]],
            "url": d["url"][cols["url"][i]], "screenshot": d["shot"][cols["shot"][i]],
            "crawled_at": cols["t"][i], "crawl_status": "ok",
            "currency": None, "exchange_rate": fx_i,
        })
    psi_rows = normalize_psi_rows(v2_pack.get("sales"))
    match_rows = build_map_product(None, [], psi_rows)
    fact_sales_rows, sales_diag = derive_fact_sales(psi_rows, match_rows)
    built = {
        "dims": v2_pack.get("dims") or {}, "factRows": fact_rows,
        "psi": psi_rows, "mapProduct": match_rows, "factSales": fact_sales_rows,
        "configTables": {}, "diag": {"rowsIn": len(fact_rows), "rowsOut": len(fact_rows), "sales": sales_diag},
    }
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        _sqlite_clear_and_load(conn, {}, built, pack_id, kind="v1v2-pack")
    finally:
        conn.close()
    return len(fact_rows)


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
        # C3 字典（2026-11-18 显性化）：config.json dictionaries 段（前端配置表
        # 「国家别名/平台别名/店铺类型别名/品类映射」四页签同步上来）；缺省 = 出厂默认
        "dictionaries": config.get("dictionaries") or None,
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
    """v3 原表包 → (v2 包, 诊断)；含不变量自检与 SQLite 落库。
    data/config_tables.xlsx（配置表+补录表四页签，存在即权威）随派生读取——
    缺文件/缺页签逐段回退 config.json 现路径。"""
    ctx = ctx_from_config(config, region_base_path)
    cfg_tables = read_config_tables(os.path.join(os.path.dirname(db_path) or ".", "config_tables.xlsx"))
    if cfg_tables:
        ctx["configTables"] = cfg_tables
    v2_pack, built = build_v2_pack(pack, ctx)
    problems = validate_fact_pack_invariants(v2_pack)
    if problems:
        raise ValueError("事实包不变量校验失败：" + "; ".join(problems))
    pack_id = datetime.now().strftime("%Y%m%d-%H%M%S") + f"-{os.getpid() % 10000:04d}"
    load_to_sqlite(db_path, pack, built, pack_id, config)
    return v2_pack, built["diag"], pack_id
