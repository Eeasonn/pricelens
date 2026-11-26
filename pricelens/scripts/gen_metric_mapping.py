#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成《PriceLens-指标映射方案-事实到指标与指标到前端-<日期>.xlsx》。

补齐数据建模方案 v2 的两块（指标基线 = Eason 2026-11-23 提供的 35 个 MSS 指标，
原文见 RAW_BLOCK，逐字收录不改写）：
  ① 事实到指标：每个指标从哪张事实表、哪些字段、怎么算（L0 原子 → L1 基价 → L2 派生）
  ② 指标到前端：前端每个取值位置在什么筛选与上卷规则下取哪个指标
     （现状口径取自代码实读：aggregate.ts / tableModel.ts / chartModel.ts /
      weekDetail.ts / alerts.ts / priceAdvantage.ts / rangeRuler.ts）
取代《数据分层方案-源表到指标》「7-指标映射」页签的映射内容（那张是粗粒度占位）。

用法：
  python3 scripts/gen_metric_mapping.py <输出.xlsx> [--date 2026-11-23]
  python3 scripts/gen_metric_mapping.py <输出.xlsx> --check-sql <pricelens.db>
      对 v2 库实跑「计算示例SQL」各语句并打印行数（SQL 可执行性复验）
"""
import os
import sqlite3
import sys
import textwrap
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
P = "MSS_CHNL_PRICE_ANALYSIS_"

# ---------------------------------------------------------------- 指标原文（Eason 2026-11-23 提供，逐字）
# 格式：指标名称 || 指标标识 || 业务指标 || 业务含义 || 计算公式 || 时间维度
# （原文「维度」列 35 行完全相同，见 DIM）
RAW_BLOCK = """
MSS_量价_折后价_周环比_美金 || MSS_CHNL_PRICE_ANALYSIS_DISCOUNT_WOW_USD || 折后价周环比-美金 || 产品折后价（美金）的周环比变化幅度（本周对比上周）。 || (本周[折后价-美金-周] - 上周[折后价-美金-周]) / 上周[折后价-美金-周] * 100% || 周
MSS_量价_折后价_近4周周环比_美金 || MSS_CHNL_PRICE_ANALYSIS_DISCOUNT_4W_WOW_USD || 折后价近4周周环比-美金 || 近4周折后价（美金）均值对比上一段4周折后价均值的变化幅度，按自然周取值，截止至当前窗口末尾。 || (AVG(最近4周[折后价-美金-周]) - AVG(前4周[折后价-美金-周])) / AVG(前4周[折后价-美金-周]) * 100% || 周
MSS_量价_RRP_周环比_美金 || MSS_CHNL_PRICE_ANALYSIS_RRP_WOW_USD || RRP周环比-美金 || 产品建议零售价（RRP，美金）的周环比变化幅度（本周对比上周）。 || (本周[RRP-美金-周] - 上周[RRP-美金-周]) / 上周[RRP-美金-周] * 100% || 周
MSS_量价_RRP_近4周周环比_美金 || MSS_CHNL_PRICE_ANALYSIS_RRP_4W_WOW_USD || RRP近4周周环比-美金 || 近4周建议零售价（RRP，美金）均值对比上一段4周RRP均值的变化幅度，按自然周取值，截止至当前窗口末尾。 || (AVG(最近4周[RRP-美金-周]) - AVG(前4周[RRP-美金-周])) / AVG(前4周[RRP-美金-周]) * 100% || 周
MSS_量价_折后价_周环比_本币 || MSS_CHNL_PRICE_ANALYSIS_DISCOUNT_WOW_LOCAL || 折后价周环比-本币 || 产品折后价（本币）的周环比变化幅度（本周对比上周）。 || (本周[折后价-本币-周] - 上周[折后价-本币-周]) / 上周[折后价-本币-周] * 100% || 周
MSS_量价_折后价_近4周周环比_本币 || MSS_CHNL_PRICE_ANALYSIS_DISCOUNT_4W_WOW_LOCAL || 折后价近4周周环比-本币 || 近4周折后价（本币）均值对比上一段4周折后价均值的变化幅度，按自然周取值，截止至当前窗口末尾。 || (AVG(最近4周[折后价-本币-周]) - AVG(前4周[折后价-本币-周])) / AVG(前4周[折后价-本币-周]) * 100% || 周
MSS_量价_RRP_周环比_本币 || MSS_CHNL_PRICE_ANALYSIS_RRP_WOW_LOCAL || RRP周环比-本币 || 产品建议零售价（RRP，本币）的周环比变化幅度（本周对比上周）。 || (本周[RRP-本币-周] - 上周[RRP-本币-周]) / 上周[RRP-本币-周] * 100% || 周
MSS_量价_RRP_近4周周环比_本币 || MSS_CHNL_PRICE_ANALYSIS_RRP_4W_WOW_LOCAL || RRP近4周周环比-本币 || 近4周建议零售价（RRP，本币）均值对比上一段4周RRP均值的变化幅度，按自然周取值，截止至当前窗口末尾。 || (AVG(最近4周[RRP-本币-周]) - AVG(前4周[RRP-本币-周])) / AVG(前4周[RRP-本币-周]) * 100% || 周
MSS_量价_折后价_月环比_美金 || MSS_CHNL_PRICE_ANALYSIS_DISCOUNT_MOM_USD || 折后价月环比-美金 || 产品折后价（美金）的月环比变化幅度（本月对比上月）。 || (本月[折后价-美金-月] - 上月[折后价-美金-月]) / 上月[折后价-美金-月] * 100% || 月
MSS_量价_折后价_近4月月环比_美金 || MSS_CHNL_PRICE_ANALYSIS_DISCOUNT_4M_MOM_USD || 折后价近4月月环比-美金 || 近4月折后价（美金）均值对比上一段4月折后价均值的变化幅度，按自然月取值，截止至当前窗口末尾。 || (AVG(最近4月[折后价-美金-月]) - AVG(前4月[折后价-美金-月])) / AVG(前4月[折后价-美金-月]) * 100% || 月
MSS_量价_RRP_月环比_美金 || MSS_CHNL_PRICE_ANALYSIS_RRP_MOM_USD || RRP月环比-美金 || 产品建议零售价（RRP，美金）的月环比变化幅度（本月对比上月）。 || (本月[RRP-美金-月] - 上月[RRP-美金-月]) / 上月[RRP-美金-月] * 100% || 月
MSS_量价_RRP_近4月月环比_美金 || MSS_CHNL_PRICE_ANALYSIS_RRP_4M_MOM_USD || RRP近4月月环比-美金 || 近4月建议零售价（RRP，美金）均值对比上一段4月RRP均值的变化幅度，按自然月取值，截止至当前窗口末尾。 || (AVG(最近4月[RRP-美金-月]) - AVG(前4月[RRP-美金-月])) / AVG(前4月[RRP-美金-月]) * 100% || 月
MSS_量价_官网折扣率_美金_月 || MSS_CHNL_PRICE_ANALYSIS_OFFICIAL_DISCOUNT_RATE_MONTH_USD || 官网折扣率-美金-月 || 显示官网折后价与官网建议零售价之间的off折扣（美金、月均价口径）。 || (官网折后价(成交价)-美金-月 / 官网建议零售价(RRP)-美金-月) - 100% || 月
MSS_量价_平台显示折扣率_美金_月 || MSS_CHNL_PRICE_ANALYSIS_PLATFORM_DISPLAY_DISCOUNT_RATE_MONTH_USD || 平台显示折扣率-美金-月 || 电渠平台折后价与电商平台建议零售价之间的off折扣（美金、月均价口径）。 || (平台折后价(成交价)-美金-月 / 平台建议零售价(RRP)-美金-月) - 100% || 月
MSS_量价_平台实际折扣率_美金_月 || MSS_CHNL_PRICE_ANALYSIS_PLATFORM_ACTUAL_DISCOUNT_RATE_MONTH_USD || 平台实际折扣率-美金-月 || 电渠平台折后价与官网建议零售价之间的off折扣（美金、月均价口径）。 || (平台折后价(成交价)-美金-月 / 官网建议零售价(RRP)-美金-月) - 100% || 月
MSS_量价_折后价_月环比_本币 || MSS_CHNL_PRICE_ANALYSIS_DISCOUNT_MOM_LOCAL || 折后价月环比-本币 || 产品折后价（本币）的月环比变化幅度（本月对比上月）。 || (本月[折后价-本币-月] - 上月[折后价-本币-月]) / 上月[折后价-本币-月] * 100% || 月
MSS_量价_折后价_近4月月环比_本币 || MSS_CHNL_PRICE_ANALYSIS_DISCOUNT_4M_MOM_LOCAL || 折后价近4月月环比-本币 || 近4月折后价（本币）均值对比上一段4月折后价均值的变化幅度，按自然月取值，截止至当前窗口末尾。 || (AVG(最近4月[折后价-本币-月]) - AVG(前4月[折后价-本币-月])) / AVG(前4月[折后价-本币-月]) * 100% || 月
MSS_量价_RRP_月环比_本币 || MSS_CHNL_PRICE_ANALYSIS_RRP_MOM_LOCAL || RRP月环比-本币 || 产品建议零售价（RRP，本币）的月环比变化幅度（本月对比上月）。 || (本月[RRP-本币-月] - 上月[RRP-本币-月]) / 上月[RRP-本币-月] * 100% || 月
MSS_量价_RRP_近4月月环比_本币 || MSS_CHNL_PRICE_ANALYSIS_RRP_4M_MOM_LOCAL || RRP近4月月环比-本币 || 近4月建议零售价（RRP，本币）均值对比上一段4月RRP均值的变化幅度，按自然月取值，截止至当前窗口末尾。 || (AVG(最近4月[RRP-本币-月]) - AVG(前4月[RRP-本币-月])) / AVG(前4月[RRP-本币-月]) * 100% || 月
MSS_量价_官网建议零售价_本币 || MSS_CHNL_PRICE_ANALYSIS_OFFICIAL_RRP_LOCAL || 官网建议零售价（本币） || 优先采集官网自营商城价格（即官网划线价），如无官网RRP可取平台建议零售价（如巴西无商城、或产品在官网下线等场景） || official_rrp_local ||
MSS_量价_官网成交价_本币 || MSS_CHNL_PRICE_ANALYSIS_OFFICIAL_SELLING_PRICE_LOCAL || 官网成交价（本币） || 优先采集官网自营商城成交价格，如无官网成交价格可取平台成交价 || official_selling_price_local ||
MSS_量价_官网折扣率 || MSS_CHNL_PRICE_ANALYSIS_OFFICIAL_DISCOUNT_RATE || 官网折扣率 || 显示官网成交价与官网建议零售价之间的off折扣，公式=（官网成交价/官网建议零售价）-100% || official_discount_rate ||
MSS_量价_平台建议零售价_本币 || MSS_CHNL_PRICE_ANALYSIS_PLATFORM_RRP_LOCAL || 平台建议零售价-本币 || 即电渠平台显示的划线价 || platform_rrp_local ||
MSS_量价_平台成交价_本币 || MSS_CHNL_PRICE_ANALYSIS_PLATFORM_SELLING_PRICE_LOCAL || 平台成交价-本币 || 即电渠平台显示的界面成交价 || platform_selling_price_local ||
MSS_量价_平台显示折扣率 || MSS_CHNL_PRICE_ANALYSIS_PLATFORM_DISCOUNT_RATE || 平台显示折扣率 || 即电渠平台成交价与电商平台建议零售价之间的off折扣，公式=（平台成交价/平台建议零售价）-100% || platform_discount_rate ||
MSS_量价_平台实际折扣率 || MSS_CHNL_PRICE_ANALYSIS_PLATFORM_REAL_DISCOUNT_RATE || 平台实际折扣率 || 即电渠平台成交价与官网建议零售价之间的off折扣，公式=（平台成交价/官网建议零售价）-100% || platform_real_discount_rate ||
MSS_量价_官网零售价_美金 || MSS_CHNL_PRICE_ANALYSIS_OFFICIAL_RRP_USD || 官网零售价-美金 || ：优先采集官网自营商城价格（即官网划线价），如无官网RRP可取平台建议零售价（如巴西无商城、或产品在官网下线等场景） || official_rrp_usd ||
MSS_量价_官网成交价_美金 || MSS_CHNL_PRICE_ANALYSIS_OFFICIAL_SELLING_PRICE_USD || 官网成交价-美金 || 优先采集官网自营商城成交价格，如无官网成交价格可取平台成交价—美金 || official_selling_price_usd ||
MSS_量价_平台建议零售价_美金 || MSS_CHNL_PRICE_ANALYSIS_PLATFORM_RRP_USD || 平台建议零售价-美金 || 即电渠平台显示的划线价，如无划线价则取实际成交价（如R国DNS）--美元 || platform_rrp_usd ||
MSS_量价_平台成交价_美金 || MSS_CHNL_PRICE_ANALYSIS_PLATFORM_SELLING_PRICE_USD || 平台成交价-美金 || 即电渠平台显示的界面成交价，并非最终结算价格，部分折扣（如学生折扣、信用卡付款折扣）需要用户登录后结算显示—美元 || platform_selling_price_usd ||
MSS_量价_网址链接 || MSS_CHNL_PRICE_ANALYSIS_URL || 网址链接 || agent抓取的链接 || URL ||
MSS_量价_网站截图 || MSS_CHNL_PRICE_ANALYSIS_SCREENSHOT || 网站截图 || agent抓取时的页面截图 || screenshot ||
MSS_量价_币种 || MSS_CHNL_PRICE_ANALYSIS_CURRENCY || 币种 || 抓取价格国家的货币 || currency ||
MSS_量价_分期付款 || MSS_CHNL_PRICE_ANALYSIS_INSTALLMENT || 分期付款 || offer包含分期付款 || installment ||
MSS_量价_促销政策 || MSS_CHNL_PRICE_ANALYSIS_PROMOTION_DETAILS || 促销政策 || 包括捆绑销售/赠品/金融权益等，捆绑/赠品会查询网页价格标注价值 ，金融权益（主要是分期免息） || promotion_details ||
"""

DIM = ("采集时间：tech_date、品类：category、品牌：brand、型号：model、SKU：color_size、"
       "平台：platform、国家：country、店铺类型：store_type、店铺名称：shop_name")


def parse_raw():
    rows = []
    for raw_ln in RAW_BLOCK.splitlines():
        ln = raw_ln.strip()
        if not ln:
            continue
        if ln.endswith("||"):
            ln += " "  # 行尾分隔符后为空（原子指标无时间维度）
        parts = [p.strip() for p in ln.split(" || ")]
        if len(parts) != 6:
            raise SystemExit(f"RAW_BLOCK 字段数异常（{len(parts)}）：{ln[:40]}")
        rows.append(parts)  # 名称, 标识, 业务指标, 业务含义, 计算公式, 时间维度
    if len(rows) != 35:
        raise SystemExit(f"RAW_BLOCK 应为 35 个指标，实际 {len(rows)}")
    return rows


def classify(ident):
    """标识 → (类别, 基价词, 周期码, 币种)"""
    t = ident[len(P):].split("_")
    cur = t[-1] if t[-1] in ("USD", "LOCAL") else ""
    body = t[:-1] if cur else t
    if body[0] in ("DISCOUNT", "RRP") and body[1] in ("WOW", "MOM"):
        return "wow", body[0], body[1], cur
    if body[0] in ("DISCOUNT", "RRP") and body[1] in ("4W", "4M"):
        return "four", body[0], body[1], cur
    if "RATE" in body and "MONTH" in body:
        return "disc_m", "_".join(body[:-1]), None, cur
    return "atomic", "_".join(t), None, cur      # 原子指标：键 = 完整标识词干（含币种后缀）


def ids(*suffixes):
    return " / ".join(P + s for s in suffixes)


SELL_W = ids("PLATFORM_SELLING_PRICE_USD", "PLATFORM_SELLING_PRICE_LOCAL")
SELL_M = ids("DISCOUNT_MONTH_USD", "DISCOUNT_MONTH_LOCAL")
RRP_W = ids("PLATFORM_RRP_USD", "PLATFORM_RRP_LOCAL")
RRP_M = ids("RRP_MONTH_USD", "RRP_MONTH_LOCAL")
DISC_ROW = ids("PLATFORM_DISCOUNT_RATE")
DISC_M_USD = ids("PLATFORM_DISPLAY_DISCOUNT_RATE_MONTH_USD")
WOW = ids("DISCOUNT_WOW_USD", "DISCOUNT_WOW_LOCAL")
W4 = ids("DISCOUNT_4W_WOW_USD", "DISCOUNT_4W_WOW_LOCAL")
MOM = ids("DISCOUNT_MOM_USD", "DISCOUNT_MOM_LOCAL")
EVID = ids("SCREENSHOT", "URL")
OFFER = ids("PROMOTION_DETAILS", "INSTALLMENT")
NONE = "无指标"

# ================================================================ 样式与写表
HDR_FILL = PatternFill("solid", fgColor="1F2329")
HDR_FONT = Font(name="Microsoft YaHei", bold=True, color="FFFFFF", size=10)
BODY_FONT = Font(name="Microsoft YaHei", size=10)
BOLD_FONT = Font(name="Microsoft YaHei", size=10, bold=True)
MONO_FONT = Font(name="Consolas", size=9)
THIN = Border(*[Side(style="hair", color="D9D9D9")] * 4)
FILL = {"green": "E8F3EA", "amber": "FFF3DC", "red": "FBE5E4", "grey": "F0F0F0"}


# ---------------------------------------------------------------- 行高估算：真实字体度量 + 模拟折行
# 启发式（CJK 记 2、西文记 1 个列宽单位）会低估大写字母 + 下划线组成的标识符宽度，
# 导致单元格文字被截（2026-11-23 视觉验收抓到 4 处）。这里直接量字体文件：
# 正文 = 微软雅黑 10pt（Excel for Mac 自带），标识符 / SQL = Consolas 9pt。
_FONT_SPECS = {
    "body": (["msyh.ttc", "msyh.ttf", "NotoSansCJK-Regular.ttc", "wqy-microhei.ttc"], 10.0),
    "mono": (["Consola.ttf", "consola.ttf", "Consolas.ttf", "DejaVuSansMono.ttf", "Menlo.ttc"], 9.0),
}
_FONT_DIRS = ["/Applications/Microsoft Excel.app/Contents/Resources/DFonts", "/Library/Fonts",
              os.path.expanduser("~/Library/Fonts"), "/System/Library/Fonts", "/System/Library/Fonts/Supplemental",
              "/usr/share/fonts/truetype", "/usr/share/fonts"]
_REF_PX = 64.0
UNIT_PX = 7.0      # Excel 列宽单位 = 工作簿默认字体（Calibri 11）的最大数字宽 7px
_SAFE = 0.90       # 可用宽度安全系数（给字体回退、加粗留余量）
_CLOSE = "）」』】，。；：、！？》”’"
_OPEN = "（「『【《“‘"
_FONT_CACHE = {}


def _font(kind):
    """→ (测宽函数 str→px, 行高 pt)；找不到字体文件返回 (None, None) → 退回启发式"""
    if kind not in _FONT_CACHE:
        meas, lh = None, None
        try:
            from PIL import ImageFont
            names, pt = _FONT_SPECS[kind]
            path = next((os.path.join(d, n) for n in names for d in _FONT_DIRS
                         if os.path.exists(os.path.join(d, n))), None)
            if path:
                f = ImageFont.truetype(path, int(_REF_PX))
                k = pt * 96 / 72 / _REF_PX
                asc, desc = f.getmetrics()
                if kind == "body":
                    meas = lambda t, f=f, k=k: f.getlength(t) * k
                else:   # 等宽字体里没有 CJK 字形 → CJK 按全角（1em）计
                    adv = {}
                    meas = lambda t, f=f, k=k, adv=adv: sum(
                        pt * 96 / 72 if ord(ch) > 0x2E7F else
                        adv.setdefault(ch, f.getlength(ch) * k) for ch in t)
                lh = pt * 1.35 if kind == "mono" else (asc + desc) * k * 72 / 96 + 0.8   # 等宽字体行距大，按 Excel 实测取
        except Exception:
            meas, lh = None, None
        _FONT_CACHE[kind] = (meas, lh)
    return _FONT_CACHE[kind]


def _units(s):
    return sum(2 if ord(ch) > 0x2E7F else 1 for ch in str(s))


def _atoms(text):
    """拆成可换行的原子：西文 / 数字连续串为一个原子；每个 CJK 字一个原子；空格是可断点；
    闭合标点跟前一原子、开括号跟后一原子（不单独成行）"""
    out, buf = [], ""

    def flush():
        nonlocal buf
        if buf:
            out.append(buf)
            buf = ""

    for ch in text:
        if ch.isspace():
            flush()
            out.append(ch)
        elif ch in _OPEN:
            buf += ch
        elif ch in _CLOSE and (buf or (out and not out[-1].isspace())):
            if buf:
                buf += ch
            else:
                out[-1] += ch
        elif ord(ch) > 0x2E7F:
            flush()
            out.append(ch)
        else:
            buf += ch
    flush()
    return out


def _cell_lines(text, width, kind="body"):
    """单元格折成几行：贪心装行，单个西文串超过整行时按字符硬折"""
    usable = (width * UNIT_PX + 5) * _SAFE
    measure, _ = _font(kind)
    if measure is None:   # 无字体文件：退回启发式
        per = UNIT_PX * (0.66 if kind == "mono" else 1.08)
        measure = (lambda t, per=per: _units(t) * per)
    n = 0
    for part in str(text if text is not None else "").split("\n"):
        if not part:
            n += 1
            continue
        lines, cur = 1, 0.0
        for a in _atoms(part):
            w = measure(a)
            if cur + w <= usable:
                cur += w
                continue
            if a.isspace():
                continue          # 行尾空格丢弃，下一个原子另起一行
            lines += 1
            cur = 0.0
            while w > usable:     # 单个西文长串超过整行 → 按字符硬折
                lines += 1
                w -= usable
            cur = w
        n += lines
    return n


def _cell_height(text, width, kind="body"):
    _, lh = _font(kind)
    return _cell_lines(text, width, kind) * (lh or (13.0 if kind == "mono" else 14.0))


def _status_fill(s):
    if "缺口" in s or "无指标" in s:
        return FILL["red"]
    if "非指标" in s or "演示" in s:
        return FILL["grey"]
    if any(k in s for k in ("部分", "待确认", "待定", "预留", "建议", "偏差", "补定义")):
        return FILL["amber"]
    if s.startswith("已"):
        return FILL["green"]
    return None


def write_sheet(wb, name, headers, rows, widths, first=False, freeze="B2", status_col=None, mono_cols=(), fit_w=1):
    mono_cols = tuple(mono_cols)
    ws = wb.active if first else wb.create_sheet(name)
    if first:
        ws.title = name
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        cell = ws.cell(1, c)
        cell.fill, cell.font = HDR_FILL, HDR_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[cell.column_letter].width = widths[c - 1]
    ws.row_dimensions[1].height = max(30, max(_cell_lines(h, widths[c]) for c, h in enumerate(headers)) * 14.2 + 12)
    for r in rows:
        ws.append(["" if v is None else v for v in r])
    for row in ws.iter_rows(min_row=2):
        height = 14.0
        for i, cell in enumerate(row):
            kind = "mono" if (i + 1) in mono_cols else "body"
            cell.border = THIN
            if isinstance(cell.value, str) and cell.data_type == "f":
                cell.data_type = "s"  # 以「=」开头的纯文本（如「= 前端…」）必须按字符串写入，不能当公式
            cell.font = MONO_FONT if kind == "mono" else BODY_FONT
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            height = max(height, _cell_height(cell.value, widths[i], kind) + 5)
        ws.row_dimensions[row[0].row].height = min(height, 400)   # Excel 行高上限 409pt
        if status_col:
            fill = _status_fill(str(row[status_col - 1].value))
            if fill:
                row[status_col - 1].fill = PatternFill("solid", fgColor=fill)
                row[status_col - 1].font = BOLD_FONT
    ws.freeze_panes = freeze
    if not first:
        ws.auto_filter.ref = ws.dimensions
        ws.print_title_rows = "1:1"  # 打印 / 导出 PDF 时每页重复表头
    # 打印设置：A3 横向、按宽度缩放（fit_w = 允许的横向页数；宽表给 2 页宽，避免缩到字太小）
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A3
    ws.page_setup.fitToWidth = fit_w
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    return ws


# ================================================================ ① 指标清单
def _metric_note(name, kind, key):
    if kind == "atomic":
        if key.startswith("OFFICIAL"):
            return "官网价族 = 预留：official_* 现库恒空（2026-11-22 拍板①）；「无官网价取平台价」属采集侧回退（Q6）"
        if key == "PLATFORM_REAL_DISCOUNT_RATE":
            return "分母是官网 RRP，现库该列恒空——底表折扣列的实际口径需与采集侧核对；标识词根 REAL 与月度版 ACTUAL 不一致（Q11）"
        if key == "PLATFORM_DISCOUNT_RATE":
            return "标识与月度版（多 DISPLAY）不一致，建议统一（Q11）"
        if key in ("PLATFORM_RRP_LOCAL", "PLATFORM_RRP_USD"):
            return "「无划线价取成交价」为采集侧回退——此类行折扣率恒 0%（Q9）"
        if key == "PLATFORM_SELLING_PRICE_LOCAL":
            return "= 前端「折后价」的原子来源（Q1）"
        if key == "PLATFORM_SELLING_PRICE_USD":
            return "= 前端「折后价」的原子来源（Q1）；事实表值为引擎重算（C3）"
        return ""
    if kind == "wow":
        return "公式里的基价记法未绑定指标标识，见「事实到指标」L1；" + ("「折后价」推定 = 平台成交价（Q1）" if key == "DISCOUNT" else "「RRP」推定 = 平台建议零售价（Q2）")
    if kind == "four":
        return "公式里的基价记法未绑定指标标识，见「事实到指标」L1；缺周处理待拍板 Q5"
    if key == "OFFICIAL_DISCOUNT_RATE":
        return "官网价族 = 预留；依赖两个未定义月基价（官网折后价-美金-月、官网建议零售价-美金-月）；本币月版未定义（G3）"
    if key == "PLATFORM_ACTUAL_DISCOUNT_RATE":
        return "分母是官网 RRP，官网价族预留期间无数据；本币月版未定义（G3）"
    return "本币月版未定义（G3）；RRP 回退为成交价的行本指标恒 0%（Q9）"


def metric_status(name, kind, key):
    if kind == "atomic":
        return "预留（待数据）" if "官网" in name else "已定义"
    if kind == "disc_m" and key in ("OFFICIAL_DISCOUNT_RATE", "PLATFORM_ACTUAL_DISCOUNT_RATE"):
        return "已定义·依赖预留"
    return "已定义"


def metric_rows(raw):
    out = []
    for i, (name, ident, biz, meaning, formula, tdim) in enumerate(raw, 1):
        kind, key, _, _ = classify(ident)
        out.append((i, "原子" if kind == "atomic" else "派生", name, ident, biz, meaning, formula, DIM, tdim,
                    metric_status(name, kind, key), _metric_note(name, kind, key)))
    return out


# ================================================================ ② 维度映射
DIM_ROWS = [
    (1, "tech_date", "采集日期", "week_id",
     "采集日期归所在 ISO 周的周三锚，格式 YYYYWW；月指标再经 dim_time 取所属自然月 month_id（YYYYMM）",
     "dim_time", "时间筛选器（最早 / 最晚时间）、粒度切换（周 / 月 / 季）",
     "周指标时间键 = week_id；月指标 = month_id。底表 collection_time（采集时刻）只用于周内去重"),
    (2, "category", "品类", "category", "英文品类翻译为中文产业（手机 / 平板 / 穿戴 / 音频；IoT / PC 同理）", "dim_category",
     "产业筛选器", "引擎内部产业码 phone / tablet / wearable / audio / iot / pc；事实表存中文"),
    (3, "brand", "品牌", "brand", "直取（统一大写）", "dim_brand", "品牌筛选；我司 / 竞品分流（HUAWEI = 我司）", ""),
    (4, "model", "型号", "model_id", "归一正名（剥品牌词、同义型号合并），拼 (own|cmp)-品牌slug-型号slug", "dim_model",
     "选品器（主分析卡 / 对比品）", "稳定键契约：维度调整不改键"),
    (5, "color_size", "SKU", "sku_id", "按产业拆列：存储键 + 颜色键，拼 model_id__存储键__颜色键", "dim_sku",
     "配置（存储 / 表盘）、颜色", "前端主图线把同一配置的多个颜色 SKU 平均成一个价（上卷规则 U2）"),
    (6, "platform", "平台", "platform", "别名归一（如 mvm → Mvideo）", "dim_platform", "平台筛选（渠道一级）", ""),
    (7, "country", "国家", "country_code", "归一两位码（中文名 / 英文名 / 裸码均收）", "dim_region", "国家选择器（页头）", ""),
    (8, "store_type", "店铺类型", "store_type", "归一为 1P / 3P / 独立站", "dim_store_type", "店铺类型筛选（渠道二级）", ""),
    (9, "shop_name", "店铺名称", "shop", "取 shop_name_new（归一显示名），缺省回 shop_name", "dim_shop", "店铺筛选（渠道三级）", ""),
    (10, "（派生）系列", "—", "—（经 model_id 关联）", "匹配表 map_product.series（系列规则预填 + 人工核对）", "dim_series",
     "系列分组 / 产业页签下钻", "指标维度未列；前端按系列筛选时需要（Q12）"),
    (11, "（派生）规格 category1", "—", "—（经 sku_id 关联）", "匹配表拆列：手机 / 平板 = 存储、穿戴 = 表盘尺寸", "dim_sku.cat1",
     "配置切换", "同上"),
    (12, "（派生）尺寸 category2", "—", "—（经 sku_id 关联）", "匹配表拆列：平板屏幕英寸", "dim_sku.cat2", "平板尺寸筛选", "同上"),
    (13, "（派生）柔光 category3", "—", "—（经 map_product 关联）", "匹配表：PaperMatte / Normal（仅平板）", "map_product.category3",
     "（预留）平板柔光拆分", "同上"),
    (14, "（派生）档位", "—", "—（落档派生）", "按美金价落入 map_price_band（min ≤ 价 < max）", "map_price_band", "档位带 / 档位排序",
     "同上"),
    (15, "（派生）大区", "—", "—（经 country_code 关联）", "dim_region.region_code（国家上卷层，对应 PSI 的 Management Region）",
     "dim_region", "（预留）大区上卷", "同上"),
    (16, "（随行，非维度）exchange_rate / is_bundle", "—", "exchange_rate / is_bundle",
     "随事实行保留：汇率用于本币 ↔ 美金折算；组合标记用于取价「裸机优先」", "—", "币种切换", "不属于指标维度，但参与折算与取价规则"),
]

# ================================================================ ③ 口径约定
RULE_ROWS = [
    ("C1", "计算", "时间键",
     "tech_date → 所在 ISO 周的周三锚 week_id（YYYYWW）；月指标时间键 = week_id 所属自然月 month_id（YYYYMM），经 dim_time。"
     "「本周 / 上周」「本月 / 上月」按自然周 / 月衔接，跨年经 dim_time。", "已定", "周指标 = week_id；月指标 = month_id"),
    ("C2", "计算", "周内去重",
     "同一（周 × 国家 × 平台 × 店铺类型 × 店铺 × SKU）一周内多条采集 → 只保留采集时间最新的一行（同一时刻取平台成交价最低）。",
     "已定", "结果 = fact_price 一行；所以「周基价」就是事实表行值，无需再聚合"),
    ("C3", "计算", "美金折算",
     "美金 = 本币 ÷ exchange_rate（行内汇率 = 采集当时，不用月末汇率）。汇率倒挂自愈、缺失按 国家 × 周 中位数补。", "已定",
     "事实表美金列为引擎重算值；底表 *_usd 列原值留存于 ods_offer 原样层"),
    ("C4", "计算", "数据清洗",
     "美金价 > 20,000 剔除；单位错位（约百倍）自动修正；归一失败行（无型号 / 未知国家 / 无周期 / 无汇率）剔除并计数。", "已定",
     "被剔除的行不进任何指标；命中单位错位修正的行，事实表价格为修正值"),
    ("C5", "计算", "月聚合（折后价）", "折后价月值 = 该自然月内有值周的算术平均（周等权，不按采集行数加权）。", "待确认", "Q3"),
    ("C6", "计算", "月聚合（RRP）", "RRP 月值 = 月内最后一个有值周的 RRP（RRP 是阶梯价，取月末值；现 PriceLens 口径）。备选 = 月均。",
     "待确认", "Q3"),
    ("C7", "计算", "空值", "参与计算的价缺失、或分母 ≤ 0 → 指标为空（NULL），不置 0、不插值、不跨期借值。", "已定", "前端显示「—」"),
    ("C8", "计算", "符号与单位",
     "折扣率 = 成交价 ÷ RRP − 1，负值 = 低于 RRP（off 折扣）；环比 =（本期 − 上期）÷ 上期；比率型指标存小数（0.052 = +5.2%）。",
     "待确认", "Q10"),
    ("C9", "计算", "舍入", "事实层保留原值（美金 2 位小数）；比率型指标用未取整值计算；展示层价格取整、比率保留 1 位小数。",
     "已定（前端有偏差）", "前端宽表「近4周环比」用取整后的周价计算，边界处差 0.1 个点（Q13）"),
    ("C10", "计算", "异常价格守卫", "被判定隔离的异常周不进派生计算（环比、近4周 / 近4月、预警），原值照显并带标记。", "已定",
     "指标层若内置计算需同步该规则；与上一期口径一并见 Q4"),
    ("C11", "计算", "官网价族", "official_* 5 列为预留字段，现库恒空；官网类指标「已定义、待数据」。", "已定（预留）",
     "「无官网价取平台价」属采集侧回退，指标层直取列值、不二次回退（Q6）"),
    ("C12", "计算", "RRP 回退标记", "采集侧「无划线价取成交价」的行，平台显示折扣率恒为 0%。", "待确认", "Q9"),
    ("U0", "上卷", "筛选器 → 指标后缀",
     "cur=usd → *_USD；cur=local → *_LOCAL。g=week → 周基价 / _WOW / _4W_WOW；g=month → 月基价 / _MOM / _4M_MOM；"
     "g=quarter → 无指标。re（最晚时间）→ 近4周 / 近4月的窗口末尾。c / i / main / 平台筛选 → 维度过滤条件。", "已定",
     "对应前端 URL 参数 cur / g / rs / re / c / i / main"),
    ("U1", "上卷", "渠道收敛",
     "同 SKU 同周多条店铺行 → 一个价。显式选了平台 / 店铺 = 所选集合内最低在架价（裸机优先于套装、异常低价行剔除）；"
     "未选 = 默认锚渠道（产品级默认店铺 → 国家默认店铺），该周无价即缺采、不回落其他平台。", "已定（现口径）",
     "指标粒度自带 platform / store_type / shop 三维"),
    ("U2", "上卷", "颜色收敛", "多个 color_size 属于同一配置（型号 × 存储）→ 各有价颜色周价的算术平均（仅统计有价颜色）。", "已定（现口径）", ""),
    ("U3", "上卷", "月 / 季桶", "桶内有值周的算术平均（可切换为「最低」）；隔离周不进桶。", "已定（现口径）", "季度无指标，见 Q8"),
    ("U4", "上卷", "折扣率重算", "上卷后的折后价 ÷ 上卷后的 RRP − 1。不对折扣率列求平均。", "待确认", "Q7"),
    ("U5", "上卷", "展示取整", "价格取整到整数；折扣率、环比保留 1 位小数。", "已定（现口径）", "比率计算必须先于取整（C9）"),
]

# ================================================================ ④ 事实到指标
GRAIN_W = "周 × 国家 × 平台 × 店铺类型 × 店铺 × SKU（= fact_price 一行）"
GRAIN_M = "月 × 国家 × 平台 × 店铺类型 × 店铺 × SKU"
SRC_E = "Eason 提供"
SRC_B = "本方案补定义·待确认"
SRC_S = "建议补充·待确认"
NULL_STD = "列空 → 指标空（不置 0）"
RESERVE = "官网价族预留：现库恒 NULL；「无官网价取平台价」属采集侧回退，指标层不做二次回退（Q6）"
ENGINE_USD = "事实表值 = 本币 ÷ exchange_rate（引擎重算、四舍五入 2 位，已含单位错位修正）；底表 *_usd 原值留存于 ods_offer。"

# 标识词干 → (事实表列, 计算逻辑, 空值规则, 备注)；官网族另有统一备注
ATOMIC_DETAIL = {
    "OFFICIAL_RRP_LOCAL": ("official_rrp_local", "行级直取。", NULL_STD, ""),
    "OFFICIAL_SELLING_PRICE_LOCAL": ("official_selling_price_local", "行级直取。", NULL_STD, ""),
    "OFFICIAL_DISCOUNT_RATE": ("official_discount_rate",
                               "行级直取；校验公式 = 官网成交价_本币 ÷ 官网建议零售价_本币 − 1（行级应相等，可对账）。",
                               "任一价缺失或 RRP ≤ 0 → 空", ""),
    "OFFICIAL_RRP_USD": ("official_rrp_usd", "行级直取（= 官网建议零售价_本币 ÷ 行内汇率）。", NULL_STD, ""),
    "OFFICIAL_SELLING_PRICE_USD": ("official_selling_price_usd", "行级直取（= 官网成交价_本币 ÷ 行内汇率）。", NULL_STD, ""),
    "PLATFORM_RRP_LOCAL": ("platform_rrp_local", "行级直取。", NULL_STD + "；现库约 0.4% 行无 RRP",
                           "采集侧「无划线价取成交价」的行 RRP = 成交价（Q9）"),
    "PLATFORM_SELLING_PRICE_LOCAL": ("platform_selling_price_local", "行级直取。", "缺失行在归一层剔除，事实表必有值",
                                     "= 前端「折后价」的原子来源（Q1）"),
    "PLATFORM_DISCOUNT_RATE": ("platform_discount_rate",
                               "行级直取；校验公式 = 平台成交价_本币 ÷ 平台建议零售价_本币 − 1。",
                               "任一价缺失或 RRP ≤ 0 → 空",
                               "= 前端「折扣率」的对应概念（前端为价格重算，Q7）；标识与月度版不一致（Q11）"),
    "PLATFORM_REAL_DISCOUNT_RATE": ("platform_real_discount_rate",
                                    "行级直取；校验公式 = 平台成交价_本币 ÷ 官网建议零售价_本币 − 1。",
                                    "官网 RRP 缺失（现库全部缺失）→ 空",
                                    "底表该列有值但官网 RRP 为空——实际分母需与采集侧核对；标识与月度版不一致（Q11）"),
    "PLATFORM_RRP_USD": ("platform_rrp_usd", "行级直取。" + ENGINE_USD, NULL_STD,
                         "采集侧「无划线价取成交价」的行 RRP = 成交价（Q9）"),
    "PLATFORM_SELLING_PRICE_USD": ("platform_selling_price_usd", "行级直取。" + ENGINE_USD, "事实表必有值",
                                   "= 前端「折后价」的原子来源（Q1）"),
    "URL": ("url", "行级直取。", "空串 = 无链接", ""),
    "SCREENSHOT": ("screenshot", "行级直取。", "空串 = 无截图", ""),
    "CURRENCY": ("currency", "行级直取。", "—", ""),
    "INSTALLMENT": ("installment", "行级直取。", "空 = 无分期信息", ""),
    "PROMOTION_DETAILS": ("promotion_details", "行级直取。", "空 = 无促销信息", ""),
}


def fact_rows(raw):
    rows = []

    def add(level, src, name, ident, table, field, logic, grain, tkey, null, status, note):
        rows.append((level, src, name, ident, table, field, logic, grain, tkey, null, status, note))

    for name, ident, biz, meaning, formula, tdim in raw:
        kind, key, per, cur = classify(ident)
        if kind != "atomic":
            continue
        col, logic, null, note = ATOMIC_DETAIL[key]
        status = "预留（待数据）" if key.startswith("OFFICIAL") else "已定义"
        add("L0 原子", SRC_E, name, ident, "fact_price", col, logic, GRAIN_W, "week_id", null, status,
            (RESERVE if key.startswith("OFFICIAL") else "") + ("；" if key.startswith("OFFICIAL") and note else "") + note)

    wk = [
        ("[折后价-美金-周] 折后价-美金-周", "DISCOUNT_WEEK_USD", "platform_selling_price_usd", "= L0「平台成交价-美金」行级值"),
        ("[折后价-本币-周] 折后价-本币-周", "DISCOUNT_WEEK_LOCAL", "platform_selling_price_local", "= L0「平台成交价-本币」行级值"),
        ("[RRP-美金-周] RRP-美金-周", "RRP_WEEK_USD", "platform_rrp_usd", "= L0「平台建议零售价-美金」行级值；与折后价同一行带出"),
        ("[RRP-本币-周] RRP-本币-周", "RRP_WEEK_LOCAL", "platform_rrp_local", "= L0「平台建议零售价-本币」行级值；与折后价同一行带出"),
    ]
    for name, ident, col, logic in wk:
        add("L1 基价", SRC_B, name, P + ident, "fact_price", col, logic + "；周内同键多采集已按 C2 去重。", GRAIN_W, "week_id",
            NULL_STD, "补定义", "公式用记法引用、未绑定标识；本标识为建议名（Q1 / Q2）")

    mo = [
        ("[折后价-美金-月] 折后价-美金-月", "DISCOUNT_MONTH_USD", "折后价-美金-周", "月值 = AVG（该自然月内有值周的周值）。", "补定义", ""),
        ("[折后价-本币-月] 折后价-本币-月", "DISCOUNT_MONTH_LOCAL", "折后价-本币-周", "月值 = AVG（该自然月内有值周的周值）。", "补定义", ""),
        ("[RRP-美金-月] RRP-美金-月", "RRP_MONTH_USD", "RRP-美金-周",
         "月值 = 月内最后一个有值周的值（阶梯价，现口径）；备选 = 月均。", "补定义", ""),
        ("[RRP-本币-月] RRP-本币-月", "RRP_MONTH_LOCAL", "RRP-本币-周",
         "月值 = 月内最后一个有值周的值（阶梯价，现口径）；备选 = 月均。", "补定义", ""),
        ("[官网折后价-美金-月] 官网折后价-美金-月", "OFFICIAL_SELLING_PRICE_MONTH_USD", "官网成交价_美金（L0）",
         "月值 = AVG（月内有值周）。", "预留（待数据）", RESERVE + "；"),
        ("[官网建议零售价-美金-月] 官网建议零售价-美金-月", "OFFICIAL_RRP_MONTH_USD", "官网零售价_美金（L0）",
         "月值 = 月内最后一个有值周的值；备选 = 月均。", "预留（待数据）", RESERVE + "；"),
    ]
    for name, ident, dep, logic, status, note in mo:
        add("L1 基价", SRC_B, name, P + ident, "依赖 L1 / L0", dep, logic, GRAIN_M, "month_id", "月内无有值周 → 空", status,
            note + "指标方案未定义；月聚合规则待拍板（Q3）；本标识为建议名")

    for name, ident, biz, meaning, formula, tdim in raw:
        kind, key, per, cur = classify(ident)
        if kind in ("wow", "four"):
            base = "折后价" if key == "DISCOUNT" else "RRP"
            cur_cn = "美金" if cur == "USD" else "本币"
            unit = "周" if per in ("WOW", "4W") else "月"
            kind_base = f"{base}-{cur_cn}"
            short = name.replace("MSS_量价_", "")
            if kind == "wow":
                shift = "week_id 减 1，跨年经 dim_time 衔接" if unit == "周" else "month_id 减 1，跨年经 dim_time 衔接"
                logic = (f"t = 本{unit}，t−1 = 上一自然{unit}（{shift}）；指标 =（基价(t) − 基价(t−1)）÷ 基价(t−1)，"
                         f"基价 = {kind_base}-{unit}。")
                null = f"基价(t) 或基价(t−1) 缺失、或基价(t−1) ≤ 0 → 空"
                note = "上一期缺采 / 隔离周的处理待拍板（Q4）"
            else:
                logic = (f"t = 窗口末{unit}（时间筛选器最晚{unit}）；最近4{unit} = t−3…t，前4{unit} = t−7…t−4；"
                         f"各窗口内仅有值{unit}参与算术平均；指标 =（AVG(最近4{unit}) − AVG(前4{unit})）÷ AVG(前4{unit})，"
                         f"基价 = {kind_base}-{unit}。")
                null = f"任一窗口无有值{unit}、或 AVG(前4{unit}) ≤ 0 → 空"
                note = "缺周处理与有效期数下限待拍板（Q5）"
            add("L2 派生", SRC_E, short, ident, "依赖 L1", f"{kind_base}-{unit}", logic,
                GRAIN_W if unit == "周" else GRAIN_M, "week_id" if unit == "周" else "month_id", null, "已定义", note)
        elif kind == "disc_m":
            short = name.replace("MSS_量价_", "")
            num, den = {
                "OFFICIAL_DISCOUNT_RATE": ("官网折后价-美金-月", "官网建议零售价-美金-月"),
                "PLATFORM_DISPLAY_DISCOUNT_RATE": ("折后价-美金-月", "RRP-美金-月"),
                "PLATFORM_ACTUAL_DISCOUNT_RATE": ("折后价-美金-月", "官网建议零售价-美金-月"),
            }[key]
            if key == "PLATFORM_DISPLAY_DISCOUNT_RATE":
                status, note = "已定义", "本币月版未定义（G3）；RRP 回退为成交价的行本指标恒 0%（Q9）"
            else:
                status, note = "已定义·依赖预留", "官网价族现库无数据；本币月版未定义（G3）"
            add("L2 派生", SRC_E, short, ident, "依赖 L1", f"{num}；{den}", f"指标 = {num} ÷ {den} − 1（先算月基价再相除）。",
                GRAIN_M, "month_id", "分子或分母月值缺失、或分母 ≤ 0 → 空", status, note)

    sug = [
        ("平台显示折扣率-本币-月", "PLATFORM_DISPLAY_DISCOUNT_RATE_MONTH_LOCAL", "折后价-本币-月", "RRP-本币-月"),
        ("平台实际折扣率-本币-月", "PLATFORM_ACTUAL_DISCOUNT_RATE_MONTH_LOCAL", "折后价-本币-月", "官网建议零售价-本币-月"),
        ("官网折扣率-本币-月", "OFFICIAL_DISCOUNT_RATE_MONTH_LOCAL", "官网折后价-本币-月", "官网建议零售价-本币-月"),
    ]
    for name, ident, num, den in sug:
        add("L2 派生", SRC_S, name, P + ident, "依赖 L1", f"{num}；{den}", f"指标 = {num} ÷ {den} − 1。", GRAIN_M, "month_id",
            "分子或分母月值缺失、或分母 ≤ 0 → 空", "建议补充",
            "前端「本币 + 月」组合需要；本标识为建议名。同一汇率下与美金版相等（比率约掉汇率），仅月内汇率波动时有微小差异")
    return rows


# ================================================================ ⑤ 指标到前端
ROLL = "国家 = 当前国家；型号 + SKU = 所选配置；渠道按 U1 收敛为一个价；多颜色按 U2 取平均"
ROLL_M = ROLL + "；月桶按 U3"
ROLL_DISC = ROLL + "；折扣率 = 上卷后的折后价 ÷ RRP − 1 重算（U4）"
WIN = "时间范围 = 时间筛选器（rs / re）"
IMPL_MAIN = "dataModel/aggregate.ts · buildSeries"
CUR_MAIN = "每个颜色 SKU 在渠道内取最低在架价（裸机优先于套装、异常低价行剔除）→ 有价颜色的算术平均；展示取整"
CUR_MAIN_M = "月 / 季桶 = 桶内有值周的算术平均（可切换「最低」）；隔离周不进桶"
CUR_RRP = "取每周最低价所在行的 RRP；月 / 季桶 = 桶内最后一个有值周的 RRP（阶梯语义）"


def _fe(page, pos, cond, status, mname, mid, roll, impl, cur, note):
    return (page, pos, cond, status, mname, mid, roll, impl, cur, note)


def frontend_rows():
    r = []
    A = r.append
    # ---- 价格走势页
    A(_fe("价格走势", "主图·折后价线", "g=week；cur=usd → 美金、local → 本币", "已映射", "折后价-美金-周 / 折后价-本币-周", SELL_W,
          ROLL + "；" + WIN, IMPL_MAIN, CUR_MAIN, "周基价 = 原子指标的周粒度值；记法待绑定（G1）"))
    A(_fe("价格走势", "主图·折后价线", "g=month", "已映射", "折后价-美金-月 / 折后价-本币-月", SELL_M, ROLL_M, IMPL_MAIN, CUR_MAIN_M,
          "月基价为补定义；聚合规则待拍板（Q3）"))
    A(_fe("价格走势", "主图·折后价线", "g=quarter", "缺口", "—", NONE, "—", IMPL_MAIN, "季桶 = 桶内有值周的算术平均",
          "指标方案无季度粒度（G4）"))
    A(_fe("价格走势", "主图·RRP 虚线", "g=week", "已映射", "RRP-美金-周 / RRP-本币-周", RRP_W, ROLL + "；RRP 随最低价行带出",
          IMPL_MAIN, "每周最低价所在行的 RRP", "「RRP」推定 = 平台建议零售价（Q2）"))
    A(_fe("价格走势", "主图·RRP 虚线", "g=month；g=quarter 为缺口", "部分", "RRP-美金-月 / RRP-本币-月（仅月）", RRP_M, ROLL_M,
          IMPL_MAIN, CUR_RRP, "月 RRP 取值口径待拍板（Q3）；季度无指标"))
    A(_fe("价格走势", "摘要条·折后价", "默认 = 窗口内最新有值点；时点模式 = 所选时点", "已映射",
          "折后价周基价（月视图取月基价）", SELL_W + "（月：" + SELL_M + "）", "同主图线，取该时点",
          "chart/PriceTrend/chartModel.ts · buildPriceSummary", "最后有值点（或所选时点）的折后价", ""))
    A(_fe("价格走势", "摘要条·RRP", "同上", "已映射", "RRP 周基价（月视图取月基价）", RRP_W + "（月：" + RRP_M + "）", "同上",
          "chartModel.ts · buildPriceSummary", "该时点的 RRP", ""))
    A(_fe("价格走势", "摘要条·折扣率", "同上", "部分",
          "周视图 = 平台显示折扣率（重算）；月·美金 = 平台显示折扣率-美金-月；月·本币 = 缺口",
          DISC_ROW + "（月·美金：" + DISC_M_USD + "）", ROLL_DISC,
          "chartModel.ts · buildPriceSummary；折扣 = tableModel.ts discountOf", "折扣率 = 折后价 ÷ RRP − 1（价格重算）",
          "周粒度只有原子行级指标，配置级需重算（Q7）；月·本币未定义（G3）"))
    A(_fe("价格走势", "时点面板（时点摘要）", "标题行「时点摘要」按钮打开", "已映射",
          "同摘要条（折扣徽章 / 现价 / 划线 RRP / 来源）", "同摘要条", "同摘要条",
          "chart/PriceTrend/PointPanel.tsx（复用 PriceSummary 条目）", "数值同摘要条", ""))
    A(_fe("价格走势", "宽表·RRP（USD）行", "—", "已映射", "RRP-美金-周", ids("PLATFORM_RRP_USD"), "列 = 窗口各周；" + ROLL,
          "chart/PriceTrend/TrendTables.tsx", "各周 RRP", "宽表固定美金口径"))
    A(_fe("价格走势", "宽表·折后价（USD）行", "—", "已映射", "折后价-美金-周", ids("PLATFORM_SELLING_PRICE_USD"),
          "列 = 窗口各周；" + ROLL, "TrendTables.tsx", "各周折后价", ""))
    A(_fe("价格走势", "宽表·折扣率行", "—", "部分", "平台显示折扣率（重算）", DISC_ROW, "列 = 窗口各周；" + ROLL_DISC,
          "tableModel.ts discountOf", "各周 折后价 ÷ RRP − 1", "同摘要条折扣率"))
    A(_fe("价格走势", "宽表·近4周环比", "恒按周：月 / 季视图下取窗口末周回溯 4 周", "已映射", "折后价近4周周环比-美金 / 本币", W4,
          "截止周 = 窗口末周；" + ROLL, "tableModel.ts recentFourWeekChange（index.tsx:964，输入 weeklySeries）",
          "最近 4 周均值 vs 前 4 周均值；缺价周、隔离周不进均值；任一窗口无值 = 空",
          "公式与指标一致 ✓；但前端用取整后的周价计算，舍入边界处差 0.1 个点（Q13）"))
    A(_fe("价格走势", "宽表·产品价差行", "—", "缺口", "—", NONE, "—", "chart/PriceTrend/diffModel.ts（(行 − 列) ÷ 列）", "（对比品 − 主品）÷ 主品",
          "缺口：竞品价差率（G6）；分母 = 主品价，与 Agent 卡不同（Q14）"))
    A(_fe("价格走势", "宽表·平台-店铺行", "—", "非指标", "（维度）platform / store_type / shop", "—", "取该列最低价所在行",
          IMPL_MAIN + "（shopName）", "平台-店铺名随最低价行带出", "维度而非指标；指标粒度自带这三维"))
    A(_fe("价格走势", "宽表·记录行（快照 / 现页）", "—", "已映射", "网站截图 / 网址链接", EVID,
          "取该列最低价所在行（月 / 季 = 桶内首个有值周）", IMPL_MAIN + "（url）", "快照与商城链接", ""))
    A(_fe("价格走势", "宽表·offer 行", "—", "已映射", "促销政策 / 分期付款", OFFER, "同上", "tableModel.ts offerText",
          "多项权益以「；」连接", ""))
    A(_fe("价格走势", "offer 徽章 / 弹卡", "—", "已映射", "促销政策 / 分期付款（+ is_bundle 维度）", OFFER, "同上",
          "chart/PriceTrend/OfferPopover.tsx", "折扣 / 分期 / 赠品明细", ""))
    A(_fe("价格走势", "多平台对比·各平台 / 渠道 / 卖家线", "—", "已映射", "折后价-美金-周 / 折后价-本币-周", SELL_W,
          "按 platform / store_type / shop 维度分别成线（不做渠道收敛）；颜色仍按 U2",
          "chart/PriceTrend/PlatformCompareView.tsx（buildSeries 换 PlatformQuery）", "各平台、渠道、卖家各自一条线",
          "该视图粒度 ≈ 指标粒度，无需 U1"))
    A(_fe("价格走势", "大促档期带 / 事件行", "—", "非指标", "（配置表）map_promo", "—", "—", "PromoBand（chartModel.ts）",
          "促销日历叠加", "配置表，非指标"))
    A(_fe("价格走势", "档位带", "—", "非指标", "（配置表）map_price_band", "—", "—", "TierBand.tsx", "阶梯 + 型号参考价落档",
          "配置表，非指标"))
    A(_fe("价格走势", "销量柱叠加（开关）", "—", "缺口", "—", NONE, "—", "dataModel/volume.ts · volumeByBuckets",
          "真实 PSI 优先，无真实行回落估算", "缺口：销量族（G5）"))
    A(_fe("价格走势", "区间量尺·区间涨跌 / 区间极差", "—", "缺口", "—", NONE, "—", "chart/PriceTrend/rangeRuler.ts",
          "trend = 最晚比最早、extreme = 最高最低；输出涨跌额与涨跌率", "缺口：区间涨跌（G6）"))
    A(_fe("价格走势", "端点标注 / 极值点", "—", "已映射", "折后价周 / 月基价", SELL_W + "（月：" + SELL_M + "）", "同主图线",
          "chartModel.ts buildEndpointMarks", "窗口首末有值点与高低点", ""))
    # ---- 量价走势页
    A(_fe("量价走势", "面板·折后价线", "g=week / month；quarter 为缺口", "部分", "折后价周 / 月基价", SELL_W + "（月：" + SELL_M + "）",
          ROLL_M, "pages/VolumePrice.tsx → " + IMPL_MAIN, "同价格走势主图", "季度无指标"))
    A(_fe("量价走势", "面板·销量柱", "—", "缺口", "—", NONE, "—", "dataModel/volume.ts · volumeByBuckets", "同价格走势页销量柱",
          "缺口：销量族（G5）"))
    A(_fe("量价走势", "明细卡·折后价", "—", "已映射", "折后价周 / 月基价", SELL_W + "（月：" + SELL_M + "）", "取观察桶", IMPL_MAIN,
          "观察桶折后价", ""))
    A(_fe("量价走势", "明细卡·RRP（删除线）", "—", "已映射", "RRP 周 / 月基价", RRP_W + "（月：" + RRP_M + "）", "取观察桶",
          IMPL_MAIN, "观察桶 RRP", ""))
    A(_fe("量价走势", "明细卡·环比胶囊", "g=week（周环比）", "已映射", "折后价周环比-美金 / 本币", WOW, "对上一桶；" + ROLL,
          "pages/volume/weekDetail.ts wowOf；VolumePrice.tsx:1012",
          "（本桶价 ÷ 上一可信桶价）− 1；上一桶缺采 = 空；上一桶被隔离则回看更早可信桶",
          "指标公式 = 对上一自然周；缺采 / 隔离周处理待拍板（Q4）"))
    A(_fe("量价走势", "明细卡·环比胶囊", "g=month（月环比）", "已映射", "折后价月环比-美金 / 本币", MOM, "对上一月", "同上",
          "同上（按月桶）", "同上（Q4）"))
    A(_fe("量价走势", "明细卡·环比胶囊", "g=quarter（季环比）", "缺口", "—", NONE, "—", "同上", "（本季价 ÷ 上一可信季价）− 1",
          "缺口：季度粒度（G4）"))
    A(_fe("量价走势", "明细卡·销量", "—", "缺口", "—", NONE, "—", "volumeByBuckets", "观察桶销量", "缺口：销量族（G5）"))
    A(_fe("量价走势", "明细卡·销毛 / 成本", "—", "缺口", "—", NONE, "—", "pages/volume/marginCost.ts", "模拟成本，非事实数据",
          "缺口：无成本数据源（G7）"))
    A(_fe("量价走势", "区间摘要 / 极差卡", "—", "缺口", "—", NONE, "—",
          "pages/volume/periodSummary.ts rangeSpreadOf；spreadCards.ts", "区间内最高、最低及极差与涨跌率",
          "缺口：区间涨跌 / 极差（G6）"))
    A(_fe("量价走势", "合并单图", "—", "部分", "折后价线 = 折后价周 / 月基价；销量柱 = 缺口", SELL_W + "（月：" + SELL_M + "）",
          ROLL_M, "pages/volume/MergedCompareChart.tsx", "多产品价格线 + 销量柱同区", "销量缺口"))
    # ---- 总览页
    A(_fe("总览", "矩阵·现价", "—", "已映射", "折后价-美金-周 / 折后价-本币-周（最新有值周）", SELL_W, ROLL + "；时间 = 最新有值周",
          "aggregate.ts latestOf（buildOverviewMatrix）", "最新有值周最低在架价", ""))
    A(_fe("总览", "矩阵·RRP", "—", "已映射", "RRP-美金-周 / RRP-本币-周（最新有值周最低价行）", RRP_W, "同上", "aggregate.ts latestOf",
          "最新有值周最低价行的 RRP", ""))
    A(_fe("总览", "矩阵·折扣率", "—", "部分", "平台显示折扣率（重算）", DISC_ROW, ROLL_DISC, "buildOverviewMatrix", "现价 ÷ RRP − 1",
          "同摘要条折扣率"))
    A(_fe("总览", "迷你走势", "—", "已映射", "折后价周基价（时序）", SELL_W, ROLL, "aggregate.ts sparkPoints", "窗口内各周折后价", ""))
    A(_fe("总览", "颜色级现价", "—", "已映射", "折后价-美金-周", ids("PLATFORM_SELLING_PRICE_USD"),
          "按 SKU 维度直取（不合并颜色）；渠道按 U1", "buildOverviewMatrix（colors[].price）", "单颜色 SKU 最低价", "与指标粒度一致"))
    A(_fe("总览", "竞品行（现价 / RRP）", "—", "部分", "折后价 / RRP 周基价（竞品维度）；价差 = 缺口", SELL_W + "；" + RRP_W,
          "竞品由配置表 map_competitor 关联；" + ROLL, "buildOverviewMatrix（comps）", "竞品最新价 / RRP", "缺口：竞品价差（G6）"))
    A(_fe("总览", "型号卡·上市价", "—", "缺口", "—", NONE, "—", "dims.product.ref_price_usd（型号级 RRP 中位数）",
          "型号参考价", "缺口：参考价 / 上市价（G6）"))
    A(_fe("总览", "型号卡·生命周期进度", "—", "缺口", "—", NONE, "—", "aggregate.ts lifecycleDeltaOf", "首末有值周折后价变化",
          "缺口：生命周期涨跌（G6）"))
    A(_fe("总览", "型号卡·档位", "—", "非指标", "（配置表）map_price_band", "—", "—", "aggregate.ts tierOf", "型号参考价落档",
          "配置表，非指标"))
    # ---- 预警页
    A(_fe("预警", "调价预警", "—", "已映射", "折后价周环比-美金 / 本币", WOW, "代表色单 SKU × 默认渠道",
          "dataModel/alerts.ts · buildAlerts", "|本周价 ÷ 上一可信有值周价 − 1| ≥ 阈值",
          "指标 = 对上一自然周、SKU 粒度；现状跳过缺采周（Q4）"))
    A(_fe("预警", "折扣预警", "—", "部分", "平台显示折扣率（周，重算）的变化量", DISC_ROW, "同上", "alerts.ts:306",
          "促销力度 = 1 − 折扣率；本周力度 − 上周力度 ≥ 阈值（百分点）", "周版折扣率记法未绑定（G1）"))
    A(_fe("预警", "事件流·现价 / RRP / 对 RRP 幅度", "—", "已映射", "折后价周基价 / RRP 周基价 / 平台显示折扣率",
          SELL_W + "；" + RRP_W + "；" + DISC_ROW, "同上", "alerts.ts", "事件行的现价、RRP、价 ÷ RRP − 1", ""))
    A(_fe("预警", "平台价差预警", "—", "缺口", "—", NONE, "—", "alerts.ts · platformPriceSpread",
          "同周各平台折后价 最高 ÷ 最低 − 1（仅我司）", "缺口：平台价差（G6）"))
    A(_fe("预警", "档位间距预警", "—", "缺口", "—", NONE, "—", "alerts.ts（own-gap）", "同型号相邻 ROM 档最新现价间距",
          "缺口：档位间距（G6）"))
    # ---- Agent
    A(_fe("Agent", "价格优势卡", "—", "缺口", "—", NONE, "—", "agent/priceAdvantage.ts",
          "价差 = 竞品价 − 我司价；百分比 = 价差 ÷ 竞品价；按国家 × 渠道 × 周对齐",
          "缺口：竞品价差（G6）；分母 = 竞品价，与宽表不同（Q14）"))
    A(_fe("Agent", "渠道建议", "—", "已映射", "折后价周基价（渠道级）", SELL_W, "按 platform 维度分别取",
          "aggregate.ts pricedChannelIdsOfSelection", "各渠道有价情况", ""))
    # ---- 演示数据页
    A(_fe("大盘走势", "档位份额 / 份额趋势 / 档位同比等卡", "—", "演示数据", "—", NONE, "—",
          "marketboard/marketBoardData.ts（静态）", "未接真实数据", "接真数需销量族 + 份额指标（G5）"))
    A(_fe("量价预测", "主图 / 参考卡", "—", "演示数据", "—", NONE, "—", "forecast/forecastFixture.ts", "固定演示样本",
          "接真数需销量族 + 成本"))
    A(_fe("定价推演", "全部卡片", "—", "演示数据", "—", NONE, "—", "pricing/mockData.ts", "静态模拟", "接真数需销量族 + 成本"))
    return [(i,) + row for i, row in enumerate(r, 1)]


# ================================================================ ⑥ 计算示例 SQL（SQLite，v2 表结构；均已在真实库全量实跑，单条 < 1s）
def _ind(text, n=2):
    """整体右缩进（S7 把 S2 包成 CTE 用）"""
    pad = " " * n
    return "\n".join(pad + ln if ln else ln for ln in text.splitlines())


S2_QUERY = textwrap.dedent("""\
    WITH w AS (
      SELECT t.month_id, f.country_code, f.platform, f.store_type, f.shop, f.sku_id, f.week_id,
             f.platform_selling_price_usd AS p, f.platform_rrp_usd AS r
      FROM fact_price f JOIN dim_time t ON t.week_id = f.week_id
      WHERE f.platform_selling_price_usd IS NOT NULL
    ),
    last_w AS (            -- 各组月内最后一个有值周
      SELECT month_id, country_code, platform, store_type, shop, sku_id, MAX(week_id) AS last_week
      FROM w GROUP BY 1, 2, 3, 4, 5, 6
    )
    SELECT w.month_id, w.country_code, w.platform, w.store_type, w.shop, w.sku_id,
           AVG(w.p) AS discount_month_usd,                                -- 月内有值周平均
           MAX(CASE WHEN w.week_id = l.last_week THEN w.r END) AS rrp_month_usd   -- 月内最后有值周
    FROM w
    JOIN last_w l ON l.month_id = w.month_id AND l.country_code = w.country_code
                 AND l.platform = w.platform AND l.store_type = w.store_type
                 AND l.shop = w.shop AND l.sku_id = w.sku_id
    GROUP BY 1, 2, 3, 4, 5, 6;""")

# S2 单独执行带分号；S7 把它包成 CTE 时去掉分号
S7_QUERY = ("WITH m AS (\n" + _ind(S2_QUERY.rstrip(";")) + "\n)\n" + textwrap.dedent("""\
    -- 月度折扣率 = 月折后价 ÷ 月 RRP − 1（先算月基价再相除，不对周折扣率求平均）
    SELECT month_id, country_code, platform, store_type, shop, sku_id,
           discount_month_usd / rrp_month_usd - 1 AS platform_display_discount_rate_month_usd
    FROM m
    WHERE rrp_month_usd > 0;"""))

SQL_ROWS = [
    ("S1", "周基价（折后价 / RRP，美金 / 本币）", ids("DISCOUNT_WEEK_USD", "DISCOUNT_WEEK_LOCAL", "RRP_WEEK_USD", "RRP_WEEK_LOCAL"),
     textwrap.dedent("""\
        -- 周基价 = fact_price 行值（周内同键多采集已在入库时去重，见口径约定 C2）
        SELECT week_id, country_code, category, brand, model_id, sku_id,
               platform, store_type, shop,
               platform_selling_price_usd   AS discount_week_usd,
               platform_selling_price_local AS discount_week_local,
               platform_rrp_usd             AS rrp_week_usd,
               platform_rrp_local           AS rrp_week_local
        FROM fact_price;"""),
     "原子指标的周粒度值；不需要聚合。本币 ↔ 美金两列同时给，对应 cur 筛选。"),
    ("S2", "月基价（折后价 = 月内有值周平均；RRP = 月内最后有值周）",
     ids("DISCOUNT_MONTH_USD", "RRP_MONTH_USD"), S2_QUERY,
     "AVG 只统计有价周；RRP 取该配置月内最后一个有价周所在行的值（阶梯价口径，待拍板 Q3）。本币版把两列换成 *_local。"),
    ("S3", "折后价周环比（严格上一自然周）", ids("DISCOUNT_WOW_USD", "DISCOUNT_WOW_LOCAL"),
     textwrap.dedent("""\
        WITH b AS (
          SELECT f.week_id, f.country_code, f.platform, f.store_type, f.shop, f.sku_id,
                 f.platform_selling_price_usd AS p,
                 LAG(f.week_id) OVER (
                     PARTITION BY f.country_code, f.platform, f.store_type, f.shop, f.sku_id
                     ORDER BY f.week_id) AS prev_week,
                 LAG(f.platform_selling_price_usd) OVER (
                     PARTITION BY f.country_code, f.platform, f.store_type, f.shop, f.sku_id
                     ORDER BY f.week_id) AS prev_p
          FROM fact_price f
          WHERE f.platform_selling_price_usd IS NOT NULL
        )
        SELECT b.week_id, b.country_code, b.platform, b.store_type, b.shop, b.sku_id,
               (b.p - b.prev_p) * 1.0 / b.prev_p AS discount_wow_usd        -- 小数比率，0.052 = +5.2%
        FROM b
        JOIN dim_time t  ON t.week_id = b.week_id
        JOIN dim_time tp ON tp.week_id = b.prev_week
                        AND tp.week_wed_date = date(t.week_wed_date, '-7 days')   -- 上一行必须恰好是上一自然周
        WHERE b.prev_p > 0;"""),
     "LAG 取同组上一有价周，再用 dim_time 校验它恰好是上一自然周（周三锚日期差 7 天，跨年也对）；"
     "上一自然周缺采即不出行（= 指标为空）。若要改成「上一有值周」，去掉 dim_time tp 这个校验即可。"
     "月环比同理：把 week_id 换成 month_id、7 天换成上一自然月。"),
    ("S4", "折后价近4周周环比（窗口末周 = :end_week）", ids("DISCOUNT_4W_WOW_USD", "DISCOUNT_4W_WOW_LOCAL"),
     textwrap.dedent("""\
        WITH b AS (
          SELECT f.week_id, f.country_code, f.platform, f.store_type, f.shop, f.sku_id,
                 f.platform_selling_price_usd AS p
          FROM fact_price f
          WHERE f.platform_selling_price_usd IS NOT NULL
        ),
        e AS (SELECT week_id AS end_week, week_wed_date AS end_date FROM dim_time WHERE week_id = :end_week),
        w AS (
          SELECT b.*, CAST((julianday(e.end_date) - julianday(t.week_wed_date)) / 7 AS INTEGER) AS k   -- 距窗口末周的周数
          FROM b JOIN dim_time t ON t.week_id = b.week_id CROSS JOIN e
        )
        SELECT country_code, platform, store_type, shop, sku_id,
               (AVG(CASE WHEN k BETWEEN 0 AND 3 THEN p END) - AVG(CASE WHEN k BETWEEN 4 AND 7 THEN p END))
               / AVG(CASE WHEN k BETWEEN 4 AND 7 THEN p END) AS discount_4w_wow_usd
        FROM w
        WHERE k BETWEEN 0 AND 7
        GROUP BY country_code, platform, store_type, shop, sku_id
        HAVING COUNT(CASE WHEN k BETWEEN 0 AND 3 THEN p END) > 0        -- 任一窗口无有值周 → 不出行
           AND AVG(CASE WHEN k BETWEEN 4 AND 7 THEN p END) > 0;"""),
     "k = 0…3 是最近 4 周、4…7 是前 4 周；AVG 忽略 NULL，即只有值周参与（待拍板 Q5）。近4月同理，把周换成月。"),
    ("S5", "配置级周折后价（上卷 U1 渠道收敛 + U2 颜色平均）—— 复算前端主图线",
     ids("PLATFORM_SELLING_PRICE_USD", "PLATFORM_SELLING_PRICE_LOCAL"),
     textwrap.dedent("""\
        WITH pick AS (        -- U1：同 SKU 同周多条店铺行取最低在架价（裸机优先）
          SELECT country_code, sku_id, week_id, platform_selling_price_usd AS p,
                 ROW_NUMBER() OVER (PARTITION BY country_code, sku_id, week_id
                                    ORDER BY is_bundle, platform_selling_price_usd) AS rn
          FROM fact_price
          WHERE platform_selling_price_usd IS NOT NULL AND country_code = :cc
            AND platform = :platform AND store_type = :store_type      -- 渠道范围（U1）
        )
        SELECT p.week_id, d.model_id, d.romram,
               AVG(p.p) AS discount_week_usd                               -- U2：颜色平均
        FROM pick p
        JOIN dim_sku d ON d.sku_id = p.sku_id
        WHERE p.rn = 1 AND d.model_id = :model_id AND d.romram = :romram
        GROUP BY 1, 2, 3 ORDER BY 1;"""),
     "实库复算：RU · Pura 90s Pro Max 12+256 · DNS 独立站，202639–202645 = 992 / 1012 / 1030 / 1021 /（202643 无采）/ 1096 / 1074，"
     "与前端主图及宽表逐周一致。"),
    ("S6", "配置级近4周周环比（U1 + U2 + 近4周）—— 复算前端宽表「近4周环比」", ids("DISCOUNT_4W_WOW_USD", "DISCOUNT_4W_WOW_LOCAL"),
     textwrap.dedent("""\
        WITH pick AS (
          SELECT country_code, sku_id, week_id, platform_selling_price_usd AS p,
                 ROW_NUMBER() OVER (PARTITION BY country_code, sku_id, week_id
                                    ORDER BY is_bundle, platform_selling_price_usd) AS rn
          FROM fact_price
          WHERE platform_selling_price_usd IS NOT NULL AND country_code = :cc
            AND platform = :platform AND store_type = :store_type
        ),
        cfg AS (             -- U2：颜色平均 → 配置级周价
          SELECT p.week_id, AVG(p.p) AS p
          FROM pick p JOIN dim_sku d ON d.sku_id = p.sku_id
          WHERE p.rn = 1 AND d.model_id = :model_id AND d.romram = :romram
          GROUP BY p.week_id
        ),
        e AS (SELECT week_wed_date AS end_date FROM dim_time WHERE week_id = :end_week),
        w AS (
          SELECT cfg.p, CAST((julianday(e.end_date) - julianday(t.week_wed_date)) / 7 AS INTEGER) AS k
          FROM cfg JOIN dim_time t ON t.week_id = cfg.week_id CROSS JOIN e
        )
        SELECT (AVG(CASE WHEN k BETWEEN 0 AND 3 THEN p END) - AVG(CASE WHEN k BETWEEN 4 AND 7 THEN p END))
               / AVG(CASE WHEN k BETWEEN 4 AND 7 THEN p END) AS discount_4w_wow_usd
        FROM w WHERE k BETWEEN 0 AND 7
        HAVING COUNT(CASE WHEN k BETWEEN 0 AND 3 THEN p END) > 0
           AND AVG(CASE WHEN k BETWEEN 4 AND 7 THEN p END) > 0;"""),
     "实库复算（窗口末周 202645）：Pura 90s Pro Max +5.2%、iPhone 17 Pro +1.7%，与前端一致；Samsung S26 Ultra SQL −7.1% 而前端 −7.2%——"
     "前端用取整后的周价算近4周，正压在舍入边界（Q13）。"),
    ("S7", "平台显示折扣率-美金-月", ids("PLATFORM_DISPLAY_DISCOUNT_RATE_MONTH_USD"),
     S7_QUERY,
     "先算月基价再相除（不对周折扣率求平均）。平台实际折扣率把分母换成官网建议零售价-美金-月；官网折扣率把分子换成官网折后价-美金-月。"),
]

# ================================================================ ⑦ 指标缺口
GAP_ROWS = [
    (1, "记法未绑定", "公式里的 4 个周基价记法：[折后价-美金-周]、[折后价-本币-周]、[RRP-美金-周]、[RRP-本币-周]",
     "全部 16 个环比 / 近4周指标公式；前端折后价线、RRP 线、摘要条、宽表、总览、预警",
     "映射到原子指标的周粒度值（平台成交价 / 平台建议零售价）", "在指标方案写明「折后价 = 平台成交价」「RRP = 平台建议零售价」",
     "Eason"),
    (2, "未定义", "6 个月基价：折后价-美金 / 本币-月、RRP-美金 / 本币-月、官网折后价-美金-月、官网建议零售价-美金-月",
     "8 个月环比 / 近4月指标公式；3 个月度折扣率公式；前端月视图", "本方案补定义（标识为建议名）",
     "确认月聚合规则：折后价 = 月内有值周平均；RRP = 月内最后有值周 还是 月均", "Eason"),
    (3, "未定义", "折扣率 月·本币版 3 个（官网 / 平台显示 / 平台实际）", "前端摘要条、宽表在「本币 + 月」组合下的折扣率",
     "本方案给出建议标识与公式", "…_OFFICIAL_DISCOUNT_RATE_MONTH_LOCAL 等三个", "Eason"),
    (4, "未定义", "季度粒度：折后价 / RRP 季值、季环比、近4季", "前端粒度切换的「季」档（折后价线、RRP 线、环比胶囊）", "未映射",
     "同构扩展（_QOQ / _4Q_QOQ），或明确「季度由前端按季桶聚合」", "Eason"),
    (5, "未定义", "销量族：销量、销量环比、型号 / 品牌份额、平板柔光拆分",
     "价格走势与量价走势的销量柱、明细卡销量、大盘页、量价预测页、定价推演页",
     "未映射（v2 建模方案 m11–m15 仅为占位命名）", "待提供指标定义；事实来源 = fact_sales（周粒度）", "Eason"),
    (6, "未定义", "复合族：竞品价差率、平台价差、档位间距、区间涨跌 / 极差、参考价 / 上市价、生命周期涨跌",
     "宽表产品价差行、区间量尺、极差卡、总览上市价与生命周期、平台价差与档位间距预警、Agent 价格优势卡",
     "未映射（v2 建模方案 m4 / m5 / m16 / m19 仅为占位命名）",
     "待提供指标定义；竞品价差须指定百分比分母（Q14：宽表与 Agent 卡现在不统一）", "Eason"),
    (7, "无数据源", "成本 / 销毛", "量价走势明细卡（现为模拟）", "前端保持「模拟」标识", "需成本数据源与指标定义", "Eason / 业务"),
    (8, "预留", "官网价族：8 个原子指标 + 官网折扣率系列", "—（暂无前端取值位）", "映射已写好；现库 official_* 恒空",
     "采集侧补采后自动生效；启用时需补前端取值位", "采集侧"),
]

# ================================================================ ⑧ 待拍板
DECIDE_ROWS = [
    (1, "「折后价」的原子归属", "折后价 = 平台成交价（唯一价族，官网价族预留）",
     "派生指标名里有「折后价」，但原子指标只有「平台成交价」「官网成交价」，未写明对应关系",
     "折后价 = 平台成交价（platform_selling_price）", "13 个折后价派生指标；前端折后价线、摘要条、宽表、总览"),
    (2, "派生指标里的「RRP」", "RRP = 平台建议零售价（平台划线价）",
     "原子指标有「官网建议零售价」「平台建议零售价」两个，未写明环比用哪个", "RRP = 平台建议零售价（platform_rrp）",
     "8 个 RRP 环比指标；前端 RRP 线"),
    (3, "月基价聚合规则", "折后价月 = 桶内有值周平均；RRP 月 = 桶内最后有值周的值", "未给（只有本月 / 上月 / AVG 最近4月）",
     "折后价 = 月内有值周平均；RRP = 月内最后有值周（阶梯价）", "11 个月度指标；前端月视图"),
    (4, "环比的「上一期」", "明细卡：上一桶缺采 = 空；上一桶被隔离则回看更早可信桶。预警：对上一可信有值周",
     "公式写「本周对比上周」", "上一自然周无值 → 指标为空；隔离周不参与并带质量标记", "8 个环比指标；明细卡、调价预警"),
    (5, "近4周 / 近4月的窗口", "缺价周、隔离周不进均值；任一窗口无值 = 空；不设有效期数下限", "公式只写 AVG，未写缺周处理",
     "沿用 PriceLens 现口径", "8 个近4周 / 近4月指标"),
    (6, "官网价族的回退", "官网价族预留，现库无数据", "业务含义写「无官网 RRP / 成交价时取平台值」",
     "回退在采集侧完成；指标层直取列值、不做二次回退", "8 个官网原子指标；官网折扣率系列"),
    (7, "折扣率的取值方式", "前端在配置级用价格重算（折后价 ÷ RRP − 1）", "原子折扣率 = 底表列直取；月度 = 公式",
     "SKU × 渠道粒度可直取底表列；上卷到配置级后必须按公式重算，不能平均折扣率列", "全部折扣率指标；前端折扣率显示位"),
    (8, "季度粒度", "前端有周 / 月 / 季三档", "只有周、月", "待定：纳入指标方案，或明确由前端按季桶聚合", "前端季视图 3 处"),
    (9, "RRP 回退为成交价的行", "采集侧「无划线价取成交价」的行，折扣率恒 0%", "业务含义已写明该回退",
     "待定：是否增加「RRP 来源」标记（真实划线价 / 回退成交价 / 回退平台 RRP）", "折扣率类指标解读；折扣预警"),
    (10, "比率型指标的存储单位", "存小数（0.052），显示 5.2%", "公式写「* 100%」「− 100%」", "存小数比率，展示层转百分数",
     "全部比率型指标"),
    (11, "标识命名一致性", "—",
     "原子「平台显示折扣率」= PLATFORM_DISCOUNT_RATE、「平台实际折扣率」= PLATFORM_REAL_DISCOUNT_RATE；"
     "月度版 = …PLATFORM_DISPLAY_DISCOUNT_RATE_MONTH_USD / …PLATFORM_ACTUAL_DISCOUNT_RATE_MONTH_USD",
     "同一概念同一词根（统一 DISPLAY / ACTUAL，或统一去掉）", "指标检索与接口对接"),
    (12, "指标维度的扩展", "前端筛选器还有系列 / 规格 / 尺寸 / 柔光 / 档位 / 大区", "指标维度只列了 9 个底表列",
     "增列「可下钻维度」：dim_model.series、dim_sku.cat1 / cat2、map_product.category3、map_price_band、dim_region.region_code",
     "前端按系列 / 规格筛选时的取数"),
    (13, "近4周环比的取整时机（前端缺陷）",
     "宽表用取整到整数的周价计算（buildSeries 里 Math.round），舍入边界处会差 0.1 个点。"
     "实例：Samsung S26 Ultra 前端 −7.2%，未取整值算是 −7.1%",
     "公式未说明；指标层应按未取整值计算", "比率型指标一律用未取整值计算，仅展示层取整（调价预警已是此口径）；前端宽表这一处需改",
     "近4周 / 近4月指标；前端宽表近4周环比"),
    (14, "竞品价差百分比的分母",
     "两处并存且未说明：宽表 =（对比品 − 主品）÷ 主品（diffModel.ts「(行−列)/列」）；"
     "Agent 价格优势卡 =（竞品 − 我司）÷ 竞品（priceAdvantage.ts）",
     "指标方案未定义竞品价差（缺口 G6）",
     "定义指标时指定分母；建议统一为 ÷ 我司价（主品），并在界面文案写明。实例：Pura 992 vs iPhone 1501，"
     "宽表 +51.3%，Agent 口径 +33.9%", "宽表产品价差行；Agent 价格优势卡；待定义的竞品价差指标"),
]


def build(out_path, date):
    raw = parse_raw()
    wb = Workbook()
    m = metric_rows(raw)
    f = fact_rows(raw)
    fe = frontend_rows()
    cnt = lambda pred: sum(1 for r in fe if pred(r[4]))
    n_mapped, n_part, n_gap, n_non = cnt(lambda s: s == "已映射"), cnt(lambda s: s == "部分"), \
        cnt(lambda s: s == "缺口"), cnt(lambda s: s in ("非指标", "演示数据"))
    n_atomic = sum(1 for r in m if r[1] == "原子")
    n_derived = len(m) - n_atomic
    n_l1w = sum(1 for r in f if r[0] == "L1 基价" and r[8] == "week_id")
    n_l1m = sum(1 for r in f if r[0] == "L1 基价" and r[8] == "month_id")
    n_sug = sum(1 for r in f if r[1] == SRC_S)
    intro = [
        ("文件目的", "补齐数据建模方案 v2 的两块：①事实表 → 指标层映射（每个指标从哪张事实表、哪些字段、怎么算）；"
         "②指标 → 前端映射（前端每个取值位置在什么筛选与上卷规则下取哪个指标）。"),
        ("指标基线", f"Eason {date} 提供的《指标方案》共 {len(m)} 个 MSS 指标（原子 {n_atomic} + 派生 {n_derived}），"
         "原样收录于「指标清单」——名称、标识、含义、公式、维度逐字未改。"),
        ("取代关系", "本文件取代《PriceLens-数据分层方案-源表到指标-2026-11-20.xlsx》「7-指标映射」页签的映射内容"
         "（那张是 23 行泛指标名的粗粒度占位，无 MSS 标识、前端位置未落到代码）。分层方案的表结构部分仍有效。"),
        ("配套文档", "表结构与链接关系：《PriceLens-数据方案-表结构与链接关系-稳定版-2026-11-22.xlsx》；"
         "建模论证与拍板：《PriceLens-数据建模方案-深层重构-2026-11-22.md》。"),
        ("指标粒度", "原子指标 = 事实表 fact_price 行级（周 × 国家 × 平台 × 店铺类型 × 店铺 × SKU）；"
         "派生指标 = 同粒度 + 时间位移或聚合。前端展示位多是「配置 × 渠道范围」粒度，需按「口径约定」U1–U4 收敛。"),
        ("现状与目标", "现状：PriceLens 前端在浏览器内由事实行自算（buildSeries / volumeByBuckets / buildAlerts / "
         "buildOverviewMatrix 四个取数口）。目标：内部系统按「事实到指标」产出指标层，前端按指标标识取数。两种模式共用本表。"),
        ("验证", "「计算示例SQL」各语句已在 v2 库（95,922 行事实）实跑。按 SQL 复算 RU · Pura 90s Pro Max 12+256 · DNS 独立站"
         "的周折后价，202639–202645 与前端主图逐周一致（含 202643 缺采）；近4周环比三品中两品与前端一致，"
         "第三品差 0.1 个点，原因是前端用取整周价计算（见待拍板 Q13）。"),
        ("结论一·记法未绑定 / 未定义",
         f"公式引用了 {n_l1w + n_l1m} 个周期基价，指标方案未给定义：{n_l1w} 个周基价是原子指标的周粒度值（记法未绑定标识）；"
         f"{n_l1m} 个月基价完全未定义（月聚合规则也没给）。本方案在「事实到指标」L1 补定义，标识为建议名。"),
        ("结论二·前端缺口",
         f"前端 {len(fe)} 个取值位置：已映射 {n_mapped}、部分映射 {n_part}、缺口 {n_gap}、非指标（配置表 / 维度 / 演示数据）{n_non}。"
         "缺口集中在：销量族、复合族（竞品价差 / 平台价差 / 档位间距 / 区间涨跌 / 参考价）、季度粒度、月·本币折扣率、成本。详见「指标缺口」。"),
        ("结论三·口径对齐", f"近4周环比：前端实现与指标公式一致（取整问题除外）。需拍板 {len(DECIDE_ROWS)} 项，见「待拍板」："
         "折后价与 RRP 的原子归属、月基价聚合、环比的上一期、折扣率重算、比率存储单位、标识命名、取整时机等。"),
        ("各页签", "指标清单（35 个，原样）→ 维度映射（指标维度如何落到事实表与维表）→ 口径约定（计算规则 C1–C12 + 上卷规则 U0–U5）→ "
         "事实到指标（L0 原子 → L1 基价 → L2 派生）→ 指标到前端（逐取值位置）→ 计算示例SQL → 指标缺口 → 待拍板。"),
        ("取数示例", "页面 = 价格走势，cur=usd，g=week，main = Pura 90s Pro Max 12+256，平台 = DNS 独立站，国家 = RU → "
         "主图线取 MSS_CHNL_PRICE_ANALYSIS_PLATFORM_SELLING_PRICE_USD；条件 country_code = 'RU'、sku_id ∈ 该配置的颜色 SKU、"
         "platform = 'DNS'、store_type = '独立站'；每周先按 U1 取最低价、再按 U2 颜色平均（即计算示例SQL S5）。"),
        ("本方案新增的标识", f"「事实到指标」里 {n_l1w + n_l1m} 个 L1 基价与 {n_sug} 个建议补充指标的标识均为本方案建议名，未经确认，"
         "以 Eason 最终指标方案为准。"),
        ("生成", f"{date} · pricelens/scripts/gen_metric_mapping.py（可复跑；前端口径取自代码实读，文件与函数见「指标到前端」现状实现列）"),
    ]
    write_sheet(wb, "说明", ["项目", "内容"], intro, [22, 128], first=True, freeze="A2")
    write_sheet(wb, "指标清单",
                ["序号", "指标类别", "指标名称", "指标标识", "业务指标", "业务含义", "计算公式", "维度（）", "时间维度", "状态", "备注"],
                m, [5, 8, 34, 66, 24, 50, 56, 58, 10, 17, 44], freeze="D2", status_col=10, mono_cols=(4,), fit_w=2)
    write_sheet(wb, "维度映射",
                ["#", "指标维度（底表列）", "含义", "事实表列（fact_price）", "加工规则", "关联维表", "前端筛选器 / 取值", "备注"],
                DIM_ROWS, [4, 24, 12, 26, 52, 20, 30, 46])
    write_sheet(wb, "口径约定", ["编号", "类别", "约定", "规则", "状态", "说明"], RULE_ROWS, [7, 8, 20, 88, 20, 46], status_col=5)
    write_sheet(wb, "事实到指标",
                ["#", "层级", "来源", "指标名称", "指标标识", "来源表", "来源字段 / 依赖指标", "计算逻辑", "输出粒度", "时间键",
                 "空值规则", "状态", "备注"],
                [(i,) + row for i, row in enumerate(f, 1)],
                [4, 9, 18, 30, 66, 13, 34, 68, 30, 10, 32, 19, 46], freeze="E2", status_col=12, mono_cols=(5,), fit_w=2)
    write_sheet(wb, "指标到前端",
                ["#", "页面", "取值位置", "分支条件", "映射状态", "指标名称", "指标标识", "维度筛选与上卷", "现状实现（文件 · 函数）",
                 "现状口径", "口径差异 / 备注"],
                fe, [4, 10, 24, 28, 12, 38, 70, 40, 42, 52, 46], freeze="E2", status_col=5, mono_cols=(7,), fit_w=2)
    write_sheet(wb, "计算示例SQL", ["编号", "对应指标", "指标标识", "SQL（SQLite，v2 表结构）", "说明与验证"], SQL_ROWS,
                [6, 30, 66, 128, 52], freeze="B2", mono_cols=(3, 4), fit_w=1)
    write_sheet(wb, "指标缺口", ["#", "缺口类别", "缺口项", "被谁引用", "本方案处理", "建议", "待定人"], GAP_ROWS,
                [4, 14, 46, 46, 38, 52, 12])
    write_sheet(wb, "待拍板", ["#", "事项", "PriceLens 现口径", "指标方案口径", "本方案推定 / 建议", "影响范围"], DECIDE_ROWS,
                [4, 26, 50, 46, 50, 40])
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    wb.save(out_path)
    selfcheck(out_path)
    print(f"saved: {out_path}")
    print(f"指标清单 {len(m)}（原子 {n_atomic} / 派生 {n_derived}）| 事实到指标 {len(f)}（L1 周基价 {n_l1w}，L1 月基价 {n_l1m}，"
          f"建议补充 {n_sug}）| 前端 {len(fe)}（已映射 {n_mapped} / 部分 {n_part} / 缺口 {n_gap} / 非指标 {n_non}）| "
          f"待拍板 {len(DECIDE_ROWS)}")


def selfcheck(path):
    """保存后回读自检：全表不得有公式型单元格（以「=」开头的文本被当公式会让 Excel 报损坏）"""
    from openpyxl import load_workbook
    bad = [f"{ws.title}!{cell.coordinate}"
           for ws in load_workbook(path).worksheets for row in ws.iter_rows() for cell in row
           if cell.data_type == "f"]
    if bad:
        raise SystemExit(f"自检失败：{len(bad)} 个单元格被写成公式，例如 {bad[:5]}")


def check_sql(db_path):
    """对 v2 库实跑各 SQL（参数取示例值），打印行数 —— SQL 可执行性复验"""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    args = {"cc": "RU", "platform": "DNS", "store_type": "独立站", "model_id": "own-huawei-pura-90s-pro-max",
            "romram": "12+256 GB", "end_week": "202645"}
    for code, title, _, sql, _ in SQL_ROWS:
        body = "\n".join(ln for ln in sql.splitlines() if not ln.strip().startswith("--"))
        try:
            rows = conn.execute(body, args).fetchall()
            print(f"{code} OK  {len(rows):>7} 行  {title}")
        except sqlite3.Error as e:
            print(f"{code} FAIL  {title}  →  {e}")
            raise


if __name__ == "__main__":
    argv = sys.argv[1:]
    date = "2026-11-23"
    if "--date" in argv:
        i = argv.index("--date")
        date = argv[i + 1]
        del argv[i:i + 2]
    if "--check-sql" in argv:
        i = argv.index("--check-sql")
        check_sql(argv[i + 1])
        del argv[i:i + 2]
    if not argv:
        raise SystemExit(__doc__)
    build(argv[0], date)
