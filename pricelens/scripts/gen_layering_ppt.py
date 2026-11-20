#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成《PriceLens-数据架构图-五层-2026-11-20.pptx》——照 Eason 手绘模板：
数据源 → 数据源表 → 匹配表（中间层）→ 量价事实表 + 维表 → 指标层（前端），
框间箭头标注连接字段/主键。单页 16:9。
用法：python3 scripts/gen_layering_ppt.py <输出.pptx>
"""
import sys
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_CONNECTOR
from pptx.oxml.ns import qn

INK = RGBColor(0x26, 0x26, 0x26)
BLUE = RGBColor(0x2B, 0x57, 0x9A)
ARROW = RGBColor(0x2B, 0x57, 0x9A)
KEY = RGBColor(0xB4, 0x50, 0x00)
FILL_SRC = RGBColor(0xF2, 0xF2, 0xF2)
FILL_RAW = RGBColor(0xFF, 0xF6, 0xE0)
FILL_MATCH = RGBColor(0xE2, 0xEF, 0xDA)
FILL_FACT = RGBColor(0xDE, 0xEB, 0xF7)
FILL_DIM = RGBColor(0xFF, 0xF6, 0xE0)
FILL_IDX = RGBColor(0xE8, 0xE8, 0xF4)


def box(slide, x, y, w, h, lines, fill, size=11, bold_first=True, align=PP_ALIGN.CENTER):
    from pptx.enum.shapes import MSO_SHAPE
    sp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sp.fill.solid()
    sp.fill.fore_color.rgb = fill
    sp.line.color.rgb = INK
    sp.line.width = Pt(1.2)
    sp.shadow.inherit = False
    tf = sp.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = tf.margin_right = Pt(4)
    tf.margin_top = tf.margin_bottom = Pt(2)
    for i, (txt, sz, b) in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        r = p.add_run()
        r.text = txt
        r.font.size = Pt(sz)
        r.font.bold = b
        r.font.color.rgb = INK
        r.font.name = "微软雅黑"
        r._r.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑") if hasattr(r._r.rPr, "rFonts") else None
    return sp


def arrow(slide, x1, y1, x2, y2, label="", key_color=False):
    conn = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    conn.line.color.rgb = ARROW
    conn.line.width = Pt(1.6)
    ln = conn.line._get_or_add_ln()
    tail = ln.makeelement(qn("a:tailEnd"), {"type": "triangle", "w": "med", "len": "med"})
    ln.append(tail)
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        tb = slide.shapes.add_textbox(Inches(mx - 1.0), Inches(my - 0.14), Inches(2.0), Inches(0.28))
        tf = tb.text_frame
        tf.word_wrap = False
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        r = p.add_run()
        r.text = label
        r.font.size = Pt(8.5)
        r.font.bold = True
        r.font.color.rgb = KEY if key_color else BLUE
        r.font.name = "微软雅黑"
    return conn


def col_header(slide, x, w, txt):
    tb = slide.shapes.add_textbox(Inches(x), Inches(0.62), Inches(w), Inches(0.35))
    p = tb.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = txt
    r.font.size = Pt(14)
    r.font.bold = True
    r.font.color.rgb = INK
    r.font.name = "微软雅黑"


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "docs", "PriceLens-数据架构图-五层-2026-11-20.pptx")
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    slide = prs.slides.add_slide(prs.slide_layouts[6])

    t = slide.shapes.add_textbox(Inches(0.5), Inches(0.16), Inches(12.3), Inches(0.4))
    p = t.text_frame.paragraphs[0]
    r = p.add_run()
    r.text = "PriceLens 数据架构图：源端 → 原表 → 匹配 → 事实/维表 → 指标（2026-11-20）"
    r.font.size = Pt(18)
    r.font.bold = True
    r.font.color.rgb = INK
    r.font.name = "微软雅黑"

    # ---- L1 数据源
    col_header(slide, 0.30, 1.7, "数据源")
    box(slide, 0.40, 1.30, 1.50, 0.80, [("offer 价格采集", 11, True)], FILL_SRC)
    box(slide, 0.40, 2.60, 1.50, 0.80, [("PSI 销量", 11, True)], FILL_SRC)
    box(slide, 0.40, 4.10, 1.50, 1.30, [("手工补录", 11, True), ("（Excel 配置表）", 9, False)], FILL_SRC)

    # ---- L2 原表
    col_header(slide, 2.30, 2.0, "数据源表（原样层）")
    box(slide, 2.40, 1.30, 1.80, 0.80, [("offer_raw", 12, True), ("街价采集 29 列", 9, False)], FILL_RAW)
    box(slide, 2.40, 2.60, 1.80, 0.80, [("psi_raw", 12, True), ("PSI 销量 4 列", 9, False)], FILL_RAW)
    box(slide, 2.40, 4.00, 1.80, 1.60, [("配置关系 10 张", 12, True), ("字典 4：国家/平台/店铺/品类", 9, False), ("匹配 2：系列规则/别名", 9, False), ("关系 3：对标/档位/档期", 9, False), ("默认渠道（26 国现成）", 9, False)], FILL_RAW)

    # ---- L3 匹配表
    col_header(slide, 4.70, 2.0, "中间层（匹配表）")
    box(slide, 4.80, 1.55, 2.00, 2.95, [
        ("offer-psi 匹配表", 12, True), ("product_match", 10, True),
        ("拆出：", 9, True),
        ("model_id / sku_id", 9, False),
        ("category1 存储/表盘", 9, False),
        ("category2 屏幕", 9, False),
        ("category3 柔光屏", 9, False),
        ("category4 预留", 9, False),
        ("系列·正名·产业·档位", 9, False),
        ("psi.product 同样拆解", 8, False)], FILL_MATCH)

    # ---- L4 事实 + 维表
    col_header(slide, 7.30, 3.6, "事实表 + 维表")
    box(slide, 7.40, 1.30, 3.40, 1.20, [("量价事实表 fact_pv", 13, True), ("周×SKU×国家×渠道×店铺（价格 SKU 级 + 销量型号级）", 9, False)], FILL_FACT)
    dims = [
        ("时间维\nweek_id", 7.40, 3.00), ("地区/国家维\ncountry_code", 9.05, 3.00), ("渠道维\nchannel_id", 10.70, 3.00),
        ("价格档位维\ntier_code", 7.40, 4.15), ("大促档期维\npromo_id", 9.05, 4.15), ("竞品对标维\nbenchmark", 10.70, 4.15),
    ]
    for txt, x, y in dims:
        l1, l2 = txt.split("\n")
        box(slide, x, y, 1.55, 0.85, [(l1, 10, True), (l2, 8.5, False)], FILL_DIM)

    # ---- L5 指标
    col_header(slide, 12.28, 1.0, "指标层")
    box(slide, 12.25, 1.30, 0.95, 3.70, [
        ("前端", 11, True),
        ("价格\n走势页", 9, False), ("量价页", 9, False), ("大盘页", 9, False),
        ("预警/预测", 9, False), ("筛选器", 9, False), ("悬停卡\n取证", 9, False)], FILL_IDX)

    # ---- 箭头 + 圆号编号（键说明统一在底部对照，标注不入框区）
    def badge(x, y, t):
        b = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(0.34), Inches(0.3))
        bp = b.text_frame.paragraphs[0]
        br = bp.add_run()
        br.text = t
        br.font.size = Pt(12)
        br.font.bold = True
        br.font.color.rgb = KEY
        br.font.name = "微软雅黑"

    arrow(slide, 1.90, 1.70, 2.40, 1.70)
    arrow(slide, 1.90, 3.00, 2.40, 3.00)
    arrow(slide, 1.90, 4.75, 2.40, 4.75)
    arrow(slide, 4.20, 1.70, 4.80, 2.10)
    badge(4.30, 1.58, "①")
    arrow(slide, 4.20, 3.00, 4.80, 3.30)
    badge(4.30, 2.90, "②")
    arrow(slide, 4.20, 4.80, 4.80, 3.90)
    badge(4.30, 4.48, "③")
    arrow(slide, 6.80, 2.60, 7.40, 1.90)
    badge(6.88, 2.40, "④")
    arrow(slide, 6.80, 3.60, 7.40, 4.60)
    badge(6.88, 4.38, "⑤")
    arrow(slide, 9.10, 2.50, 9.10, 3.00)
    badge(9.24, 2.58, "⑥")
    arrow(slide, 10.80, 1.90, 12.25, 2.60)
    badge(11.30, 1.96, "⑦")

    # ---- 底部圆号对照（连接键全集）
    tb = slide.shapes.add_textbox(Inches(0.45), Inches(5.62), Inches(12.4), Inches(1.65))
    tf = tb.text_frame
    tf.word_wrap = True
    notes = [
        "① offer_raw.型号+型号规格 → 匹配表（拆出 model_id / sku_id / category1-4）",
        "② psi_raw.product（SKU 串，无独立规格列）→ 匹配表（同一套拆解规则）",
        "③ 配置关系 10 张现成表（字典 4 + 匹配规则 2 + 业务关系 3 + 默认渠道）→ 归一层/匹配表/维表",
        "④ 匹配表 → fact_pv：sku_id / model_id / category1-4 快照",
        "⑤ 维表由 product_match 结果与配置关系构建",
        "⑥ 维表 → fact_pv 过滤：week_id · country_code · channel_id · tier_code · promo_id · benchmark",
        "⑦ fact_pv → 指标层：字段直出（价/RRP/折扣/促销/取证）或聚合（均价/销量/份额/环比）→ 前端页面具体控件",
    ]
    for i, line in enumerate(notes):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        r = p.add_run()
        r.text = line
        r.font.size = Pt(9)
        r.font.color.rgb = INK
        r.font.name = "微软雅黑"

    prs.save(out)
    print("written:", out)


if __name__ == "__main__":
    main()
