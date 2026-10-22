# -*- coding: utf-8 -*-
"""竞品系列规则：品牌 × 型号名 → 系列名（第一百一十七轮立，第一百三十二轮重审）。

系列档口径（第一百三十二轮定稿）：**多系列品牌按产品线成组（系列名不带代际号），
少系列品牌（苹果）按代际成组**。即：
- 三星手机 = Galaxy S / Galaxy A / Galaxy Z 三条产品线（S25 全家与 S26 全家同在
  「Galaxy S」，折叠 Fold+Flip 同在「Galaxy Z」），代际区分留在型号层（S25、S26…）；
- 荣耀 = HONOR Magic（含 Magic V 折叠）/ HONOR 数字系列 / HONOR X；
- 小米 = Xiaomi 数字系列（含 T 版）/ Redmi 数字系列 / Redmi Note / Redmi A / POCO X…
- 苹果系列少，维持按代际：iPhone 17 / iPhone 16 …（代际即系列）。
仅以数字命名的产品线标「数字系列」（Redmi 数字系列），字母/名字线用裸产品名
（Galaxy S、HONOR X、Redmi Note）。无规则命中回退型号名本身（型号即系列）。

ingest_real.py 在生成维表时调用竞品分支；scripts/patch_comp_series.py 用同一份
规则就地修补已入库的 dim_product.json，保证两边口径一致。
"""
import re

# (品牌, 正则, 系列模板) —— 按声明顺序取首个命中；{n} 引用捕获组数字。
_RULES = [
    # ---- SAMSUNG：产品线成组，代际留型号层 ----
    ("SAMSUNG", r"^(?:Galaxy )?Z ?Fold", "Galaxy Z"),
    ("SAMSUNG", r"^(?:Galaxy )?Z ?Flip", "Galaxy Z"),
    ("SAMSUNG", r"^(?:Galaxy )?S(\d+)", "Galaxy S"),
    ("SAMSUNG", r"^(?:Galaxy )?A(\d+)", "Galaxy A"),
    ("SAMSUNG", r"^Galaxy Tab S(\d+)", "Galaxy Tab S"),
    ("SAMSUNG", r"^Galaxy Tab A(\d+)", "Galaxy Tab A"),
    ("SAMSUNG", r"^Galaxy Watch Ultra", "Galaxy Watch Ultra"),
    ("SAMSUNG", r"^Galaxy Watch (\d+)", "Galaxy Watch"),
    ("SAMSUNG", r"^Galaxy FIT (\d+)", "Galaxy Fit"),
    ("SAMSUNG", r"^Galaxy Buds", "Galaxy Buds"),
    # ---- APPLE：系列少，按代际 ----
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
    # ---- XIAOMI：数字线/Note 线/字母线分开 ----
    ("XIAOMI", r"^(\d+)T", "Xiaomi 数字系列"),
    ("XIAOMI", r"^(\d+)", "Xiaomi 数字系列"),
    ("XIAOMI", r"^POCO Pad", "POCO Pad"),
    ("XIAOMI", r"^Poco ([FXMC])", "POCO {w}"),
    ("XIAOMI", r"^Poco (\w+)", "POCO {w}"),
    ("XIAOMI", r"^Redmi Note(\d+)", "Redmi Note"),
    ("XIAOMI", r"^Redmi ([AC])(\d*)", "Redmi {w}"),
    ("XIAOMI", r"^Redmi (\d+)", "Redmi 数字系列"),
    ("XIAOMI", r"^Redmi Buds", "Redmi Buds"),
    ("XIAOMI", r"^Redmi Watch", "Redmi Watch"),
    ("XIAOMI", r"^Redmi Pad", "Redmi Pad"),
    ("XIAOMI", r"^Pad (\d+)", "Xiaomi Pad 数字系列"),
    ("XIAOMI", r"^Pad Mini", "Xiaomi Pad Mini"),
    ("XIAOMI", r"^Band (\d+)", "Xiaomi Band"),
    ("XIAOMI", r"^Watch S(\d+)", "Xiaomi Watch S"),
    ("XIAOMI", r"^Watch (\d+)", "Xiaomi Watch"),
    # ---- HONOR：Magic（含折叠）/数字系列/X ----
    ("HONOR", r"^Magic V", "HONOR Magic"),
    ("HONOR", r"^Magic(\d+)", "HONOR Magic"),
    ("HONOR", r"^MagicBook", "HONOR MagicBook"),
    ("HONOR", r"^Magic Pad", "HONOR Magic Pad"),
    ("HONOR", r"^X(\d+)", "HONOR X"),
    ("HONOR", r"^Pad V", "HONOR Pad V"),
    ("HONOR", r"^Pad X(\d+)", "HONOR Pad X"),
    ("HONOR", r"^Pad (\d+)", "HONOR Pad 数字系列"),
    ("HONOR", r"^(\d+)", "HONOR 数字系列"),
    ("HONOR", r"^Watch (\d+)", "HONOR Watch"),
    # ---- OPPO / VIVO：产品线成组 ----
    ("OPPO", r"^A(\d+)", "OPPO A"),
    ("OPPO", r"^Find N", "OPPO Find N"),
    ("OPPO", r"^Reno", "OPPO Reno"),
    ("OPPO", r"^Pad", "OPPO Pad"),
    ("VIVO", r"^V(\d+)", "vivo V"),
    ("VIVO", r"^X Fold", "vivo X"),
    ("VIVO", r"^X(\d+)", "vivo X"),
    ("VIVO", r"^Y(\d+)", "vivo Y"),
    # ---- LENOVO（含 moto）----
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
    ("GARMIN", r"^Fenix (\d+)", "Garmin Fenix"),
    ("GARMIN", r"^Forerunner (\d+)", "Garmin Forerunner"),
    ("GARMIN", r"^Instinct", "Garmin Instinct"),
    ("GARMIN", r"^Venu", "Garmin Venu"),
    ("GARMIN", r"^Vivoactive", "Garmin Vivoactive"),
    ("AMAZFIT", r"^Active", "Amazfit Active"),
    ("AMAZFIT", r"^Bip", "Amazfit Bip"),
    ("AMAZFIT", r"^T-Rex", "Amazfit T-Rex"),
    ("AMAZFIT", r"^Balance", "Amazfit Balance"),
    ("COROS", r"^(\w+)", "Coros {w}"),
    ("WHOOP", r"^(\w+)", "Whoop {w}"),
    # ---- TRANSSION（TECNO/Infinix 系）----
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
    ("SOUNDCORE", r"^([PR])", "Soundcore {w}"),
    ("SHOKZ", r"^Open Dots", "Shokz Open Dots"),
    ("SHOKZ", r"^OpenFit", "Shokz OpenFit"),
    ("BOSE", r"^QC", "Bose QC"),
    # ---- 路由器（IoT）----
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
