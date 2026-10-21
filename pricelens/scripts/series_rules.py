# -*- coding: utf-8 -*-
"""竞品系列规则：品牌 × 型号名 → 系列名（第一百一十七轮，统一产品选择器）。

维表 dim_product 的竞品 series 原先由「型号名首词」兜底（如三星全部落 'Galaxy'
一个大桶），无法支撑产品树的系列层。此模块按「代际 + 产品线」给系列：
Galaxy S25 全家（含 +/Ultra/Edge/FE）= Galaxy S25；无规则命中回退型号名本身
（型号即系列，单型号组）。

ingest_real.py 在生成维表时调用；scripts/patch_comp_series.py 用同一份规则
就地修补已入库的 dim_product.json，保证两边口径一致。
"""
import re

# (品牌, 正则, 系列模板) —— 按声明顺序取首个命中；{n} 引用捕获组数字。
_RULES = [
    # ---- SAMSUNG ----
    ("SAMSUNG", r"^(?:Galaxy )?Z ?Fold", "Galaxy Z Fold"),
    ("SAMSUNG", r"^(?:Galaxy )?Z ?Flip", "Galaxy Z Flip"),
    ("SAMSUNG", r"^(?:Galaxy )?S(\d+)", "Galaxy S{n}"),
    ("SAMSUNG", r"^(?:Galaxy )?A(\d+)", "Galaxy A{n}"),
    ("SAMSUNG", r"^Galaxy Tab S(\d+)", "Galaxy Tab S{n}"),
    ("SAMSUNG", r"^Galaxy Tab A(\d+)", "Galaxy Tab A{n}"),
    ("SAMSUNG", r"^Galaxy Watch Ultra", "Galaxy Watch Ultra"),
    ("SAMSUNG", r"^Galaxy Watch (\d+)", "Galaxy Watch {n}"),
    ("SAMSUNG", r"^Galaxy FIT (\d+)", "Galaxy Fit"),
    ("SAMSUNG", r"^Galaxy Buds(\d+)", "Galaxy Buds{n}"),
    ("SAMSUNG", r"^Galaxy Buds (\w+)", "Galaxy Buds {w}"),
    # ---- APPLE ----
    ("APPLE", r"^iPhone (\d+)", "iPhone {n}"),
    ("APPLE", r"^iPhone (\w+)", "iPhone {w}"),
    ("APPLE", r"^iPad Air", "iPad Air"),
    ("APPLE", r"^iPad Mini", "iPad Mini"),
    ("APPLE", r"^iPad Pro", "iPad Pro"),
    ("APPLE", r"^iPad", "iPad"),
    ("APPLE", r"^Watch SERIES (\d+)", "Apple Watch Series {n}"),
    ("APPLE", r"^Watch SE", "Apple Watch SE"),
    ("APPLE", r"^Watch Ultra", "Apple Watch Ultra"),
    ("APPLE", r"^AirPods Pro", "AirPods Pro"),
    ("APPLE", r"^AirPods (\d+)", "AirPods {n}"),
    ("APPLE", r"^MacBook Air", "MacBook Air"),
    ("APPLE", r"^MacBook Neo", "MacBook Neo"),
    ("APPLE", r"^MacBook Pro", "MacBook Pro"),
    # ---- XIAOMI ----
    ("XIAOMI", r"^(\d+)T", "Xiaomi {n}T"),
    ("XIAOMI", r"^(\d+)", "Xiaomi {n}"),
    ("XIAOMI", r"^Poco (\w+)", "Poco {w}"),
    ("XIAOMI", r"^Redmi Note(\d+)", "Redmi Note {n}"),
    ("XIAOMI", r"^Redmi ([AC]\d*)", "Redmi {w}"),
    ("XIAOMI", r"^Redmi (\d+)", "Redmi {n}"),
    ("XIAOMI", r"^Redmi Buds (\d+)", "Redmi Buds {n}"),
    ("XIAOMI", r"^Redmi Watch (\d+)", "Redmi Watch {n}"),
    ("XIAOMI", r"^Redmi Pad", "Redmi Pad"),
    ("XIAOMI", r"^POCO Pad", "POCO Pad"),
    ("XIAOMI", r"^Pad (\d+)", "Xiaomi Pad {n}"),
    ("XIAOMI", r"^Pad Mini", "Xiaomi Pad Mini"),
    ("XIAOMI", r"^Band (\d+)", "Xiaomi Band {n}"),
    ("XIAOMI", r"^Watch S(\d+)", "Xiaomi Watch S{n}"),
    ("XIAOMI", r"^Watch (\d+)", "Xiaomi Watch {n}"),
    # ---- HONOR ----
    ("HONOR", r"^Magic V", "HONOR Magic V"),
    ("HONOR", r"^Magic(\d+)", "HONOR Magic{n}"),
    ("HONOR", r"^MagicBook", "HONOR MagicBook"),
    ("HONOR", r"^Magic Pad", "HONOR Magic Pad"),
    ("HONOR", r"^X(\d+)", "HONOR X{n}"),
    ("HONOR", r"^Pad V", "HONOR Pad V"),
    ("HONOR", r"^Pad X(\d+)", "HONOR Pad X{n}"),
    ("HONOR", r"^Pad (\d+)", "HONOR Pad {n}"),
    ("HONOR", r"^(\d+)", "HONOR {n}"),
    ("HONOR", r"^Watch (\d+)", "HONOR Watch {n}"),
    # ---- OPPO / VIVO ----
    ("OPPO", r"^A(\d+)", "OPPO A{n}"),
    ("OPPO", r"^Find N", "OPPO Find N"),
    ("OPPO", r"^Reno (\d+)", "OPPO Reno {n}"),
    ("OPPO", r"^Pad", "OPPO Pad"),
    ("VIVO", r"^V(\d+)", "vivo V{n}"),
    ("VIVO", r"^X Fold", "vivo X Fold"),
    ("VIVO", r"^X(\d+)", "vivo X{n}"),
    ("VIVO", r"^Y(\d+)", "vivo Y{n}"),
    # ---- LENOVO（含 moto） ----
    ("LENOVO", r"^Edge", "Motorola Edge"),
    ("LENOVO", r"^Moto G", "Motorola Moto G"),
    ("LENOVO", r"^Razr", "Motorola Razr"),
    ("LENOVO", r"^Idea ?Tab", "Lenovo Idea Tab"),
    ("LENOVO", r"^Yoga Tab", "Lenovo Yoga Tab"),
    ("LENOVO", r"^Tab", "Lenovo Tab"),
    ("LENOVO", r"^Idea ?Pad", "Lenovo IdeaPad"),
    ("LENOVO", r"^Yoga", "Lenovo Yoga"),
    # ---- ASUS / HP ----
    ("ASUS", r"^Vivo ?Book", "ASUS VivoBook"),
    ("ASUS", r"^Zen ?Book", "ASUS ZenBook"),
    ("ASUS", r"^ExpertBook", "ASUS ExpertBook"),
    ("HP", r"^Pavilion", "HP Pavilion"),
    ("HP", r"^EliteBook", "HP EliteBook"),
    ("HP", r"^Notebook", "HP Notebook"),
    ("HP", r"^14", "HP 14"),
    # ---- 穿戴：GARMIN / AMAZFIT / COROS / WHOOP / FITBIT ----
    ("GARMIN", r"^Fenix (\d+)", "Garmin Fenix {n}"),
    ("GARMIN", r"^Forerunner (\d+)", "Garmin Forerunner {n}"),
    ("GARMIN", r"^Instinct", "Garmin Instinct"),
    ("GARMIN", r"^Venu", "Garmin Venu"),
    ("GARMIN", r"^Vivoactive", "Garmin Vivoactive"),
    ("AMAZFIT", r"^Active", "Amazfit Active"),
    ("AMAZFIT", r"^Bip", "Amazfit Bip"),
    ("AMAZFIT", r"^T-Rex", "Amazfit T-Rex"),
    ("AMAZFIT", r"^Balance", "Amazfit Balance"),
    ("COROS", r"^(\w+)", "Coros {w}"),
    ("WHOOP", r"^(\w+)", "Whoop {w}"),
    # ---- TRANSSION（TECNO/Infinix 系） ----
    ("TRANSSION", r"^KL8 SPARK", "TECNO Spark"),
    ("TRANSSION", r"^[Ss]park", "TECNO Spark"),
    ("TRANSSION", r"^Camon", "TECNO Camon"),
    ("TRANSSION", r"^POVA", "TECNO POVA"),
    ("INFINIX", r"^XPAD", "Infinix XPAD"),
    # ---- 音频 ----
    ("SONY", r"^LinkBuds", "Sony LinkBuds"),
    ("SONY", r"^WF-", "Sony WF"),
    ("JBL", r"^Live Beam", "JBL Live Beam"),
    ("JBL", r"^Soundgear", "JBL Soundgear"),
    ("JBL", r"^Tune Beam", "JBL Tune Beam"),
    ("JBL", r"^WAVE BEAM", "JBL Wave Beam"),
    ("SOUNDCORE", r"^AeroClip", "Soundcore AeroClip"),
    ("SOUNDCORE", r"^AeroFit", "Soundcore AeroFit"),
    ("SOUNDCORE", r"^Liberty", "Soundcore Liberty"),
    ("SOUNDCORE", r"^([PR]\d)", "Soundcore {w}"),
    ("SHOKZ", r"^Open Dots", "Shokz Open Dots"),
    ("SHOKZ", r"^OpenFit", "Shokz OpenFit"),
    ("BOSE", r"^QC", "Bose QC"),
    # ---- 路由器（IoT） ----
    ("TP-LINK", r"^Archer", "TP-Link Archer"),
    ("TP-LINK", r"^Deco", "TP-Link Deco"),
    ("TP-LINK", r"^X50", "TP-Link Deco"),
    ("TP-LINK", r"^M4", "TP-Link Deco"),
    ("TP-LINK", r"^RE\d", "TP-Link RE"),
    ("TP-LINK", r"^EX\d", "TP-Link EX"),
    ("TENDA", r"^Nova", "Tenda Nova"),
    ("TENDA", r"^T[XY]", "Tenda TX"),
    ("TENDA", r"^AC", "Tenda AC"),
    ("CUDY", r"^(WR|BE|AX)", "Cudy {w}"),
]

_COMPILED = [
    (brand, re.compile(pattern, re.IGNORECASE), template)
    for brand, pattern, template in _RULES
]


def comp_series(brand: str, model_name: str) -> str:
    """竞品型号 → 系列名；未命中规则回退型号名本身（型号即系列）。"""
    for brand_rule, rx, template in _COMPILED:
        if brand_rule != brand:
            continue
        m = rx.match(model_name)
        if not m:
            continue
        groups = {"n": m.group(1) if m.groups() and m.group(1) else "",
                  "w": (m.group(1) or "").strip() if m.groups() else ""}
        return template.format(**groups)
    return model_name
