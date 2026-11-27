"""PSI 销量关联（server/psi_linkage.py + ingest_pack.build_map_product）单元测试。
运行：cd pricelens && python3 -X utf8 -m unittest discover -s server/tests
用例取自 Eason 2026-11-27 贴的真实 PSI 清单与周数据样例（7 列格式）。"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ingest_pack as ip  # noqa: E402
import psi_linkage as pl  # noqa: E402


def mr(cc, model, mid, cat="手机", c1="", c2="", c3="", brand="HUAWEI", psi_product="", active=1):
    """一条匹配表行（map_product 形态）"""
    return {"country": cc, "category": cat, "brand": brand, "model": model, "series": "S",
            "category1": c1, "category2": c2, "category3": c3, "category4": "", "info": "",
            "psi_product": psi_product, "is_active": active, "model_id": mid, "source": "xlsx"}


def psi(cc, product, sku, week="2025008", qty=100, psi_type="Sell Out", **extra):
    """一条 PSI 原始行（normalize_psi_rows 之后的形态）"""
    row = {"region": "", "country_raw": "", "cc": cc, "product": product, "product_sku": sku,
           "category1": "", "category2": "", "category3": "", "period_id": week, "psi_type": psi_type,
           "qty": qty}
    row.update(extra)
    return row


def run(psi_rows, match_rows):
    sku_rows = pl.build_map_psi_sku(psi_rows, match_rows, None)
    facts, diag = pl.derive_fact_sales(psi_rows, sku_rows, match_rows)
    return sku_rows, facts, diag


def got(facts, mid, c1, c2="", c3=""):
    return sum(f["qty"] for f in facts if f["match_status"] == "matched"
               and f["model_id"] == mid and (f["category1"], f["category2"], f["category3"]) == (c1, c2, c3))


class T01Period(unittest.TestCase):
    def test_period_forms(self):
        # Eason 样例：2025008 = 2025 年第 8 周
        self.assertEqual(pl.normalize_period_id("2025008"), "202508")
        self.assertEqual(pl.normalize_period_id(202508), "202508")
        self.assertEqual(pl.normalize_period_id("202643"), "202643")
        self.assertEqual(pl.normalize_period_id("2026-W43"), "202643")
        self.assertEqual(pl.normalize_period_id("2026w43"), "202643")
        self.assertEqual(pl.normalize_period_id(202508.0), "202508")

    def test_period_invalid(self):
        for bad in ("2025000", "2025054", "20250083", "xx", "", None, "2025"):
            self.assertEqual(pl.normalize_period_id(bad), "", bad)


class T02Parse(unittest.TestCase):
    def p(self, industry, product, sku, **src):
        return pl.parse_psi_config(industry, product, sku, src.get("c1", ""), src.get("c2", ""), src.get("c3", ""))

    def test_phone(self):
        r = self.p("phone", "Mate X7", "HUAWEI Mate X7 16GB+512GB 云锦白 双卡 公开渠道版 英规")
        self.assertEqual((r["category1"], r["category2"], r["category3"]), ("16+512 GB", "", ""))
        self.assertEqual(r["info"], "云锦白 双卡 公开渠道版 英规")
        self.assertEqual(r["parse_source"], "rule")

    def test_phone_model_name_digits_are_not_memory(self):
        # 回归：旧实现把整串交给存储解析，型号名末尾数字被当成内存（13+12 GB）
        r = self.p("phone", "HUAWEI nova 13", "HUAWEI nova 13 12GB+256GB 星耀黑 双卡 公开渠道版 英规")
        self.assertEqual(r["category1"], "12+256 GB")
        r = self.p("phone", "HUAWEI nova 14", "HUAWEI nova 14 12GB+1TB 冰晶蓝 双卡 公开渠道版 俄规")
        self.assertEqual(r["category1"], "12+1 TB")

    def test_phone_unparsed(self):
        r = self.p("phone", "X", "HUAWEI X 512GB 黑色")
        self.assertEqual(r["parse_source"], "unparsed")
        self.assertEqual(r["category1"], "")

    def test_tablet(self):
        r = self.p("tablet", "HUAWEI MatePad 11.5吋 2023",
                   "HUAWEI MatePad 11.5\" 标准版 WIFI 6GB+128GB 深空灰")
        self.assertEqual((r["category1"], r["category2"], r["category3"]), ("6+128 GB", '11.5"', "Normal"))
        r = self.p("tablet", "HUAWEI MatePad 11.5英寸 2024",
                   "HUAWEI MatePad 11.5 柔光版 WIFI 8GB+256GB 深空灰 带键盘")
        self.assertEqual((r["category1"], r["category2"], r["category3"]), ("8+256 GB", '11.5"', "PaperMatte"))
        r = self.p("tablet", "MatePad SE 10.4英寸 2022", "HUAWEI MatePad SE 10.36吋 WIFI 3GB+32GB 曜石黑")
        self.assertEqual((r["category1"], r["category2"]), ("3+32 GB", '10.36"'))

    def test_tablet_size_from_product_name(self):
        # SKU 串不带尺寸：从 Product 名取
        r = self.p("tablet", "HUAWEI MatePad Pro 12.2英寸 2024", "HUAWEI MatePad Pro WIFI 12GB+512GB 砚黑")
        self.assertEqual((r["category1"], r["category2"]), ("12+512 GB", '12.2"'))

    def test_tablet_size_absent_everywhere(self):
        r = self.p("tablet", "HUAWEI MatePad 11.5 2025", "HUAWEI MatePad 11.5 WIFI 8GB+128GB 深空灰")
        self.assertEqual((r["category1"], r["category2"]), ("8+128 GB", ""))
        self.assertEqual(r["parse_source"], "rule")  # 尺寸缺失不算解析失败，由匹配规则沿用清洗表

    def test_wearable(self):
        r = self.p("wearable", "WATCH GT 6", "HUAWEI WATCH GT 6 41mm 流光紫 紫色氟橡胶表带")
        self.assertEqual((r["category1"], r["category2"]), ("41mm", ""))
        self.assertEqual(r["info"], "流光紫 紫色氟橡胶表带")
        r = self.p("wearable", "Band 8", "HUAWEI Band 8 标准款 幻夜黑 幻夜黑TPU表带")
        self.assertEqual(r["category1"], "")
        self.assertEqual(r["info"], "标准款 幻夜黑 幻夜黑TPU表带")

    def test_audio_all_info(self):
        r = self.p("audio", "FreeBuds 5i", "HUAWEI FreeBuds 5i 有线充 星际黑 海外通用版")
        self.assertEqual((r["category1"], r["category2"], r["category3"]), ("", "", ""))
        self.assertEqual(r["info"], "有线充 星际黑 海外通用版")

    def test_source_columns(self):
        # 旧形态 / 模拟数据：源表自带配置列
        r = self.p("phone", "Mate X7", "16+512 GB", c1="16+512 GB")
        self.assertEqual((r["category1"], r["parse_source"]), ("16+512 GB", "source"))
        r = self.p("tablet", "MatePad Pro 2025", '12+512 GB/12.2"', c1="12+512 GB", c2='12.2"')
        self.assertEqual((r["category1"], r["category2"], r["category3"]), ("12+512 GB", '12.2"', ""))
        r = self.p("tablet", "MatePad Pro 2025", "12+512 GB/12.2\"/PaperMatte", c1="12+512 GB", c2='12.2"')
        self.assertEqual(r["category3"], "PaperMatte")
        r = self.p("tablet", "MatePad Pro 2025", "x", c1="12+512 GB", c2="12.2\"", c3="Normal")
        self.assertEqual(r["category3"], "Normal")


class T03Resolve(unittest.TestCase):
    def test_exact_and_brand_prefix(self):
        rows = [mr("SA", "Mate X7", "own-huawei-mate-x7", c1="16+512 GB")]
        idx = pl.MatchIndex(rows)
        self.assertEqual(idx.resolve("Mate X7"), ("own-huawei-mate-x7", "auto"))
        self.assertEqual(idx.resolve("HUAWEI Mate X7"), ("own-huawei-mate-x7", "auto"))

    def test_drop_size_marker(self):
        rows = [mr("SA", "MatePad SE", "own-huawei-matepad-se", cat="平板", c1="4+128 GB", c2='11"'),
                mr("SA", "MatePad Air 2026", "own-huawei-matepad-air-2026", cat="平板", c1="12+256 GB", c2='12"')]
        idx = pl.MatchIndex(rows)
        self.assertEqual(idx.resolve("HUAWEI MatePad SE 11-inch"), ("own-huawei-matepad-se", "auto-nosize"))
        self.assertEqual(idx.resolve("HUAWEI MatePad Air 12英寸 2026"),
                         ("own-huawei-matepad-air-2026", "auto-nosize"))

    def test_cross_generation_not_matched(self):
        rows = [mr("SA", "MatePad SE", "own-huawei-matepad-se", cat="平板", c1="4+128 GB", c2='11"')]
        idx = pl.MatchIndex(rows)
        self.assertEqual(idx.resolve("MatePad SE 10.4英寸 2022"), ("", "unmatched"))
        self.assertEqual(idx.resolve("MatePad 11.5\"S"), ("", "unmatched"))

    def test_near_name_is_not_alias(self):
        # 包含关系不算别名：FreeBuds 6i ≠ FreeBuds 6
        rows = [mr("DE", "FreeBuds 6", "own-huawei-freebuds-6", cat="音频")]
        self.assertEqual(pl.MatchIndex(rows).resolve("FreeBuds 6i"), ("", "unmatched"))

    def test_chinese_name_needs_explicit_psi_product(self):
        rows = [mr("SA", "Band 11", "own-huawei-band-11", cat="穿戴")]
        self.assertEqual(pl.MatchIndex(rows).resolve("手环 11"), ("", "unmatched"))
        rows[0]["psi_product"] = "手环 11"
        self.assertEqual(pl.MatchIndex(rows).resolve("手环 11"), ("own-huawei-band-11", "xlsx"))

    def test_same_name_cross_brand_own_first(self):
        rows = [mr("DE", "Band 10", "cmp-xiaomi-band-10", cat="穿戴", brand="XIAOMI"),
                mr("DE", "Band 10", "own-huawei-band-10", cat="穿戴")]
        self.assertEqual(pl.MatchIndex(rows).resolve("Band 10"), ("own-huawei-band-10", "auto"))

    def test_inactive_and_unhooked_rows_ignored(self):
        rows = [mr("SA", "Mate X7", "own-huawei-mate-x7", active=0), mr("SA", "Pura 80", "")]
        idx = pl.MatchIndex(rows)
        self.assertEqual(idx.resolve("Mate X7"), ("", "unmatched"))
        self.assertEqual(idx.resolve("Pura 80"), ("", "unmatched"))


class T04Derive(unittest.TestCase):
    def test_sum_at_category_grain(self):
        # 沙特 Mate X7：4 个颜色串同属 16+512 GB → 一个销量结果；12+512 GB 另一个
        rows = [mr("SA", "Mate X7", "own-huawei-mate-x7", c1="16+512 GB"),
                mr("SA", "Mate X7", "own-huawei-mate-x7", c1="12+512 GB")]
        ps = [psi("SA", "Mate X7", f"HUAWEI Mate X7 16GB+512GB {c} 双卡 公开渠道版 英规", qty=120)
              for c in ("云锦白", "寰宇红", "曜石黑", "幻影紫")]
        ps.append(psi("SA", "Mate X7", "HUAWEI Mate X7 16GB+1TB 红色 双卡 公开渠道版 英规", qty=7))
        sku_rows, facts, diag = run(ps, rows)
        self.assertEqual(got(facts, "own-huawei-mate-x7", "16+512 GB"), 480)
        self.assertEqual(diag["psiMatched"], 4)
        self.assertEqual(diag["psiUnmatchedConfig"], 1)  # 清洗表没有 16+1 TB
        f = next(f for f in facts if f["category1"] == "16+512 GB")
        self.assertEqual((f["period_id"], f["psi_type"], f["country_code"], f["category"]),
                         ("202508", "Sell Out", "SA", "手机"))
        self.assertEqual(f["match_status"], "matched")
        self.assertEqual(len([r for r in sku_rows if r["model_id"]]), 5)

    def test_two_sizes_two_results(self):
        rows = [mr("RU", "Watch GT 6", "own-huawei-watch-gt-6", cat="穿戴", c1="41mm"),
                mr("RU", "Watch GT 6", "own-huawei-watch-gt-6", cat="穿戴", c1="46mm")]
        ps = [psi("RU", "WATCH GT 6", "HUAWEI WATCH GT 6 41mm 流光紫 紫色氟橡胶表带", qty=10),
              psi("RU", "WATCH GT 6", "HUAWEI WATCH GT 6 41mm 浮光白 白色复合素皮表带", qty=11),
              psi("RU", "WATCH GT 6", "HUAWEI WATCH GT 6 46mm 冰川灰 灰色复合素皮表带", qty=20)]
        _, facts, _ = run(ps, rows)
        self.assertEqual(got(facts, "own-huawei-watch-gt-6", "41mm"), 21)
        self.assertEqual(got(facts, "own-huawei-watch-gt-6", "46mm"), 20)

    def test_rule_row_dim_empty_takes_any(self):
        # GT 7 Pro 清洗表没拆表盘：PSI 的 46mm 汇入型号级那一行
        rows = [mr("DE", "Watch GT 7 Pro", "own-huawei-watch-gt-7-pro", cat="穿戴")]
        _, facts, diag = run([psi("DE", "WATCH GT 7 Pro", "HUAWEI WATCH GT 7 Pro 46mm 曜石黑 黑色氟橡胶表带")], rows)
        self.assertEqual(got(facts, "own-huawei-watch-gt-7-pro", ""), 100)
        self.assertEqual(diag["psiMatched"], 1)

    def test_rule_psi_dim_missing_inherits(self):
        # SKU 串不带尺寸，清洗表该型号只有一个尺寸 → 沿用
        rows = [mr("SA", "MatePad 11.5 2025", "own-huawei-matepad-11-5-2025", cat="平板", c1="8+128 GB",
                   c2='11.5"', c3="Normal")]
        _, facts, diag = run([psi("SA", "HUAWEI MatePad 11.5 2025", "HUAWEI MatePad 11.5 WIFI 8GB+128GB 深空灰")], rows)
        self.assertEqual(got(facts, "own-huawei-matepad-11-5-2025", "8+128 GB", '11.5"', "Normal"), 100)
        self.assertEqual(diag["psiMatched"], 1)

    def test_rule_psi_dim_missing_ambiguous(self):
        rows = [mr("SA", "MatePad Pro 2025", "own-huawei-matepad-pro-2025", cat="平板", c1="12+256 GB",
                   c2='12.2"', c3="Normal"),
                mr("SA", "MatePad Pro 2025", "own-huawei-matepad-pro-2025", cat="平板", c1="12+256 GB",
                   c2='13.2"', c3="Normal")]
        _, facts, diag = run([psi("SA", "MatePad Pro 2025", "HUAWEI MatePad Pro WIFI 12GB+256GB 砚黑")], rows)
        self.assertEqual(diag["psiAmbiguous"], 1)
        self.assertEqual([f for f in facts if f["match_status"] == "matched"], [])
        self.assertEqual(facts[0]["match_status"], "ambiguous")

    def test_matte_mismatch_not_assigned(self):
        rows = [mr("SA", "MatePad Pro 2025", "own-huawei-matepad-pro-2025", cat="平板", c1="12+512 GB",
                   c2='12.2"', c3="PaperMatte")]
        _, facts, diag = run([psi("SA", "HUAWEI MatePad Pro 12.2英寸 2025",
                                  "HUAWEI MatePad Pro 12.2\" WIFI 12GB+512GB 流金")], rows)
        self.assertEqual(diag["psiConfigMismatch"], 1)
        self.assertEqual([f for f in facts if f["match_status"] == "matched"], [])

    def test_matte_splits_configs(self):
        rows = [mr("SA", "MatePad 12 X 2025", "own-huawei-matepad-12-x-2025", cat="平板", c1="12+256 GB",
                   c2='12"', c3="Normal"),
                mr("SA", "MatePad 12 X 2025", "own-huawei-matepad-12-x-2025", cat="平板", c1="12+256 GB",
                   c2='12"', c3="PaperMatte")]
        ps = [psi("SA", "HUAWEI MatePad 12 X 12-inch 2025", "HUAWEI MatePad 12 X 12.0\" WIFI 12GB+256GB 羽砂白", qty=5),
              psi("SA", "HUAWEI MatePad 12 X 12-inch 2025",
                  "HUAWEI MatePad 12 X 12.0\" 柔光版 WIFI 12GB+256GB 草木绿", qty=9)]
        _, facts, _ = run(ps, rows)
        self.assertEqual(got(facts, "own-huawei-matepad-12-x-2025", "12+256 GB", '12"', "Normal"), 5)
        self.assertEqual(got(facts, "own-huawei-matepad-12-x-2025", "12+256 GB", '12"', "PaperMatte"), 9)

    def test_unknown_dim_with_variants_is_ambiguous(self):
        # PSI 行没带柔光（旧格式不带 category3），清洗表同存储同尺寸有 Normal 与 PaperMatte 两行：
        # 不猜怎么分 → 不分配，进待处理清单
        rows = [mr("SA", "MatePad 12 X 2025", "own-huawei-matepad-12-x-2025", cat="平板", c1="12+256 GB",
                   c2='12"', c3="Normal"),
                mr("SA", "MatePad 12 X 2025", "own-huawei-matepad-12-x-2025", cat="平板", c1="12+256 GB",
                   c2='12"', c3="PaperMatte")]
        _, facts, diag = run([psi("SA", "MatePad 12 X 2025", '12+256 GB/12"', category1="12+256 GB",
                                  category2='12"')], rows)
        self.assertEqual(diag["psiAmbiguous"], 1)
        self.assertEqual([f for f in facts if f["match_status"] == "matched"], [])

    def test_source_category3_column_resolves_variants(self):
        # 源表自带 category3 列时按列取：Normal 与 PaperMatte 各取各的
        rows = [mr("SA", "MatePad 12 X 2025", "own-huawei-matepad-12-x-2025", cat="平板", c1="12+256 GB",
                   c2='12"', c3="Normal"),
                mr("SA", "MatePad 12 X 2025", "own-huawei-matepad-12-x-2025", cat="平板", c1="12+256 GB",
                   c2='12"', c3="PaperMatte")]
        # （PSI 侧的键是「型号名 + SKU 串」，两个配置的 product_sku 必须是不同的串）
        ps = [psi("SA", "MatePad 12 X 2025", '12+256 GB/12"/Normal', category1="12+256 GB", category2='12"',
                  category3="Normal", qty=3),
              psi("SA", "MatePad 12 X 2025", '12+256 GB/12"/PaperMatte', category1="12+256 GB", category2='12"',
                  category3="PaperMatte", qty=8)]
        _, facts, diag = run(ps, rows)
        self.assertEqual(diag["psiMatched"], 2)
        self.assertEqual(got(facts, "own-huawei-matepad-12-x-2025", "12+256 GB", '12"', "Normal"), 3)
        self.assertEqual(got(facts, "own-huawei-matepad-12-x-2025", "12+256 GB", '12"', "PaperMatte"), 8)

    def test_unsplit_shell_row_loses_to_concrete(self):
        rows = [mr("AE", "MatePad Air 2026", "own-huawei-matepad-air-2026", cat="平板"),
                mr("AE", "MatePad Air 2026", "own-huawei-matepad-air-2026", cat="平板", c1="12+256 GB",
                   c2='12"', c3="PaperMatte")]
        _, facts, _ = run([psi("AE", "HUAWEI MatePad Air 12英寸 2026",
                               "HUAWEI MatePad Air 12\" 柔光版 WIFI 12GB+256GB 晴光蓝")], rows)
        self.assertEqual(got(facts, "own-huawei-matepad-air-2026", "12+256 GB", '12"', "PaperMatte"), 100)
        self.assertEqual(got(facts, "own-huawei-matepad-air-2026", ""), 0)

    def test_unmatched_reasons(self):
        rows = [mr("SA", "Mate X6", "own-huawei-mate-x6", c1="12+512 GB")]
        ps = [psi("MX", "Mate X6", "HUAWEI Mate X6 12GB+512GB 曜石黑 双卡 公开渠道版 美规"),   # 该国无价格
              psi("SA", "Mate X6", "HUAWEI Mate X6 16GB+512GB 曜石黑 双卡 公开渠道版 英规"),   # 该国无此配置
              psi("SA", "Pura 70", "HUAWEI Pura 70 12GB+256GB 樱玫红 双卡 公开渠道版 英规"),   # 无此型号
              psi("SA", "Mate X6", "HUAWEI Mate X6 星耀黑")]                                    # 解析不出存储
        _, facts, diag = run(ps, rows)
        self.assertEqual((diag["psiUnmatchedCountry"], diag["psiUnmatchedConfig"],
                          diag["psiUnmatchedModel"], diag["psiUnparsed"]), (1, 1, 1, 1))
        self.assertEqual(sorted(f["match_status"] for f in facts),
                         ["unmatched_config", "unmatched_country", "unmatched_model", "unparsed"])
        self.assertTrue(all(f["model_id"] == "" for f in facts))

    def test_bad_rows_skipped(self):
        rows = [mr("SA", "Mate X6", "own-huawei-mate-x6", c1="12+512 GB")]
        ps = [psi("SA", "Mate X6", "HUAWEI Mate X6 12GB+512GB 曜石黑", qty=0),
              psi("SA", "Mate X6", "HUAWEI Mate X6 12GB+512GB 曜石黑", qty=None),   # QTY = xx
              psi("SA", "Mate X6", "HUAWEI Mate X6 12GB+512GB 曜石黑", week="2025"),
              psi("SA", "Mate X6", "HUAWEI Mate X6 12GB+512GB 曜石黑", week="202509", qty=3)]
        _, facts, diag = run(ps, rows)
        self.assertEqual((diag["psiNonPositiveQty"], diag["psiNoPeriod"]), (1, 1))
        self.assertEqual([f["period_id"] for f in facts if f["match_status"] == "matched"], ["202509"])

    def test_alias_via_psi_product(self):
        rows = [mr("RU", "Mate XT", "own-huawei-mate-xt", c1="16+1 TB", psi_product="Mate XT | ULTIMATE DESIGN")]
        _, facts, _ = run([psi("RU", "Mate XT | ULTIMATE DESIGN",
                               "HUAWEI Mate XT | ULTIMATE DESIGN 16GB+1TB 红色 双卡 公开渠道版 俄规")], rows)
        self.assertEqual(got(facts, "own-huawei-mate-xt", "16+1 TB"), 100)

    def test_same_psi_name_two_models_sizes(self):
        # 一个清洗后型号对应两个 PSI 型号名（按尺寸分）：各行用自己的 psi_product 取数
        rows = [mr("SA", "MatePad Pro 2025", "own-huawei-matepad-pro-2025", cat="平板", c1="12+512 GB",
                   c2='12.2"', c3="Normal", psi_product="HUAWEI MatePad Pro 12.2英寸 2025"),
                mr("SA", "MatePad Pro 2025", "own-huawei-matepad-pro-2025", cat="平板", c1="12+512 GB",
                   c2='13.2"', c3="PaperMatte", psi_product="HUAWEI MatePad Pro 13.2英寸 2025")]
        ps = [psi("SA", "HUAWEI MatePad Pro 12.2英寸 2025", "HUAWEI MatePad Pro 12.2\" WIFI 12GB+512GB 流金", qty=4),
              psi("SA", "HUAWEI MatePad Pro 13.2英寸 2025",
                  "HUAWEI MatePad Pro 13.2\" 柔光版 WIFI 12GB+512GB 流金", qty=6)]
        _, facts, _ = run(ps, rows)
        self.assertEqual(got(facts, "own-huawei-matepad-pro-2025", "12+512 GB", '12.2"', "Normal"), 4)
        self.assertEqual(got(facts, "own-huawei-matepad-pro-2025", "12+512 GB", '13.2"', "PaperMatte"), 6)

    def test_inactive_row_not_matched(self):
        rows = [mr("SA", "Mate X6", "own-huawei-mate-x6", c1="12+512 GB", active=0)]
        # 停用行不进索引：该型号等于不存在
        _, facts, diag = run([psi("SA", "Mate X6", "HUAWEI Mate X6 12GB+512GB 曜石黑")], rows)
        self.assertEqual(diag["psiUnmatchedModel"], 1)


class T05MapPsiSku(unittest.TestCase):
    def test_one_row_per_distinct_sku_string(self):
        rows = [mr("SA", "Mate X7", "own-huawei-mate-x7", c1="16+512 GB"),
                mr("AE", "Mate X7", "own-huawei-mate-x7", c1="16+512 GB")]
        ps = [psi("SA", "Mate X7", "HUAWEI Mate X7 16GB+512GB 云锦白 双卡 公开渠道版 英规"),
              psi("AE", "Mate X7", "HUAWEI Mate X7 16GB+512GB 云锦白 双卡 公开渠道版 英规"),
              psi("AE", "Mate X7", "HUAWEI Mate X7 16GB+512GB 幻影紫 双卡 公开渠道版 英规")]
        out = pl.build_map_psi_sku(ps, rows, None)
        self.assertEqual(len(out), 2)  # 不分国家
        self.assertEqual(out[0]["countries"], 2)
        self.assertEqual((out[0]["category"], out[0]["model_id"], out[0]["parse_source"], out[0]["model_source"]),
                         ("手机", "own-huawei-mate-x7", "rule", "auto"))

    def test_override_wins(self):
        rows = [mr("SA", "Mate X7", "own-huawei-mate-x7", c1="16+512 GB")]
        ps = [psi("SA", "Mate X7", "HUAWEI Mate X7 星耀黑")]
        out = pl.build_map_psi_sku(ps, rows, {("Mate X7", "HUAWEI Mate X7 星耀黑"): {"category1": "16+512 GB"}})
        self.assertEqual((out[0]["category1"], out[0]["parse_source"]), ("16+512 GB", "override"))
        # 覆盖后能正常分配
        sku_rows = pl.build_map_psi_sku(ps, rows, {("Mate X7", "HUAWEI Mate X7 星耀黑"): {"category1": "16+512 GB"}})
        facts, _ = pl.derive_fact_sales(ps, sku_rows, rows)
        self.assertEqual(got(facts, "own-huawei-mate-x7", "16+512 GB"), 100)
        # 通配：product_sku 留空 = 该型号名下所有串
        out = pl.build_map_psi_sku(ps, rows, {("Mate X7", ""): {"category1": "16+512 GB"}})
        self.assertEqual(out[0]["parse_source"], "override")
        # 覆盖页签里没填 category 的行不生效
        self.assertEqual(ip._psi_sku_overrides([{"psi_product": "Mate X7", "product_sku": "a"}]), {})

    def test_unparsed_flagged(self):
        rows = [mr("SA", "Mate X7", "own-huawei-mate-x7", c1="16+512 GB")]
        out = pl.build_map_psi_sku([psi("SA", "Mate X7", "HUAWEI Mate X7 星耀黑")], rows, None)
        self.assertEqual(out[0]["parse_source"], "unparsed")


class T06Pack(unittest.TestCase):
    def test_only_matched_rows_with_model_id(self):
        rows = [mr("SA", "Mate X7", "own-huawei-mate-x7", c1="16+512 GB"),
                mr("SA", "MatePad 12 X 2025", "own-huawei-matepad-12-x-2025", cat="平板", c1="12+256 GB",
                   c2='12"', c3="PaperMatte")]
        ps = [psi("SA", "Mate X7", "HUAWEI Mate X7 16GB+512GB 云锦白 双卡 公开渠道版 英规", qty=120.0),
              psi("SA", "Mate X7", "HUAWEI Mate X7 16GB+1TB 红色 双卡 公开渠道版 英规"),
              psi("SA", "HUAWEI MatePad 12 X 12-inch 2025",
                  "HUAWEI MatePad 12 X 12.0\" 柔光版 WIFI 12GB+256GB 草木绿", qty=30)]
        _, facts, _ = run(ps, rows)
        pack = pl.sales_pack_rows(facts, rows)
        self.assertEqual(len(pack), 2)
        self.assertEqual(pack[0], {"country": "SA", "product": "Mate X7", "modelId": "own-huawei-mate-x7",
                                   "category1": "16+512 GB", "category2": None, "periodId": "202508",
                                   "qty": 120, "psiType": "Sell Out"})
        self.assertEqual((pack[1]["modelId"], pack[1]["category2"], pack[1]["category3"], pack[1]["qty"]),
                         ("own-huawei-matepad-12-x-2025", '12"', "PaperMatte", 30))

    def test_two_real_types_keep_sell_out(self):
        f = lambda t: {"match_status": "matched", "psi_type": t}
        keep, dropped = pl.pick_sales_types([f("Sell In"), f("Sell Out"), f("simulated")])
        self.assertEqual(sorted(r["psi_type"] for r in keep), ["Sell Out", "simulated"])
        self.assertEqual(dropped, ["Sell In"])
        keep, dropped = pl.pick_sales_types([f("Sell Out"), f("simulated")])
        self.assertEqual((len(keep), dropped), (2, []))
        keep, dropped = pl.pick_sales_types([f("Sell In"), f("Sell Thru")])
        self.assertEqual((len(keep), dropped), (1, ["Sell In"]))  # Sell Thru 同为出货侧口径，优先于 Sell In
        keep, dropped = pl.pick_sales_types([f("Sell In"), f("Inventory")])
        self.assertEqual((len(keep), dropped), (2, []))  # 都是出货侧之外的口径：不擅自取舍


def offer(cc, brand, model, mid, sku, ind, c1, c2=None, spec=""):
    return {"country": cc, "category": ip.CAT_CN[ind], "brand": brand, "model": model, "color_size": spec,
            "series": "S", "cat1": c1, "cat2": c2, "industry": ind, "model_id": mid, "sku_id": sku}


def xl(cc, cat, brand, model, c1="", c2="", c3="", **kw):
    row = {"country": cc, "category": cat, "brand": brand, "model": model, "orig_brand": brand,
           "orig_model": kw.pop("orig_model", model), "color_size": kw.pop("color_size", ""),
           "series": "S", "category1": c1, "category2": c2, "category3": c3, "category4": "",
           "info": kw.pop("info", ""), "psi_product": "", "product_sku": "", "is_active": 1}
    row.update(kw)
    return row


class T07BuildMapProduct(unittest.TestCase):
    def test_no_psi_rows_enter_match_table(self):
        # 主表只对应 offer：PSI 行不再生成 auto-psi 行
        rows = ip.build_map_product([xl("SA", "手机", "HUAWEI", "Mate X7", "16+512 GB")],
                                    [offer("SA", "HUAWEI", "Mate X7", "own-huawei-mate-x7", "own-huawei-mate-x7__x", "phone", "16+512 GB")])
        self.assertEqual([r["source"] for r in rows], ["xlsx"])
        self.assertEqual((rows[0]["model_id"], rows[0]["match_status"]), ("own-huawei-mate-x7", "matched"))
        self.assertEqual((rows[0]["psi_product"], rows[0]["product_sku"]), ("", ""))

    def test_uncovered_offer_becomes_auto_row(self):
        offers = [offer("SA", "HUAWEI", "Mate X7", "own-huawei-mate-x7", "s1", "phone", "12+512 GB"),
                  offer("SA", "HUAWEI", "Mate X7", "own-huawei-mate-x7", "s2", "phone", "16+512 GB")]
        rows = ip.build_map_product([xl("SA", "手机", "HUAWEI", "Mate X7", "12+512 GB", color_size="12+512 GB")], offers)
        self.assertEqual(sorted(r["source"] for r in rows), ["auto-offer", "xlsx"])
        auto = next(r for r in rows if r["source"] == "auto-offer")
        self.assertEqual((auto["sku_id"], auto["category1"]), ("s2", "16+512 GB"))

    def test_brand_aware_hook(self):
        # 华为 Band 10 与小米 Band 10 同名：各自挂各自的 SKU
        offers = [offer("DE", "XIAOMI", "Band 10", "cmp-xiaomi-band-10", "cmp-xiaomi-band-10__std__black", "wearable", None),
                  offer("DE", "HUAWEI", "Band 10", "own-huawei-band-10", "own-huawei-band-10__std__black", "wearable", None)]
        rows = ip.build_map_product([xl("DE", "穿戴", "XIAOMI", "Band 10", series="Redmi"),
                                     xl("DE", "穿戴", "HUAWEI", "Band 10", series="Band")], offers)
        by = {r["brand"]: r for r in rows}
        self.assertEqual(by["XIAOMI"]["sku_id"], "cmp-xiaomi-band-10__std__black")
        self.assertEqual(by["HUAWEI"]["sku_id"], "own-huawei-band-10__std__black")
        self.assertEqual(by["XIAOMI"]["series"], "Redmi")
        self.assertEqual(by["HUAWEI"]["series"], "Band")

    def test_parent_brand_name_still_hooks_when_unambiguous(self):
        # 人工行写母公司品牌（TRANSSION），引擎里是子品牌（TECNO）：只有一个候选品牌 → 仍挂上
        offers = [offer("ID", "TECNO", "XPAD 20", "cmp-tecno-xpad-20", "s", "tablet", "4+128 GB", '11"')]
        rows = ip.build_map_product([xl("ID", "平板", "TRANSSION", "XPAD 20", "4+128 GB", '11"')], offers)
        self.assertEqual((rows[0]["sku_id"], rows[0]["brand"]), ("s", "TRANSSION"))

    def test_parent_brand_fallback_not_applied_when_two_brands_share_name(self):
        # 型号名同名且分属两个品牌：品牌对不上时不回落（防跨品牌串行）
        offers = [offer("DE", "XIAOMI", "Band 10", "cmp-xiaomi-band-10", "sx", "wearable", None),
                  offer("DE", "HUAWEI", "Band 10", "own-huawei-band-10", "sh", "wearable", None)]
        rows = ip.build_map_product([xl("DE", "穿戴", "REDMI", "Band 10")], offers)
        self.assertEqual(rows[0]["model_id"], "")

    def test_wrong_brand_on_unique_name_still_hooks(self):
        # 品牌写错但型号名下只有一个品牌的 SKU（如把联想写成 HUAWEI）：仍挂上——
        # 与旧行为一致，靠修数据纠正；品牌检查只为拦「同名分属多个品牌」的串行
        offers = [offer("SA", "LENOVO", "Idea Tab", "cmp-lenovo-idea-tab", "cmp-lenovo-idea-tab__x", "tablet", "8+256 GB", '11"')]
        rows = ip.build_map_product([xl("SA", "平板", "HUAWEI", "Idea Tab", "8+256 GB", '11"')], offers)
        self.assertEqual((rows[0]["model_id"], rows[0]["match_status"]), ("cmp-lenovo-idea-tab", "matched"))

    def test_screen_size_aware_hook(self):
        # MatePad Pro 2025：12.2" 与 13.2" 同存储，必须各挂各的
        offers = [offer("DE", "HUAWEI", "MatePad Pro 2025", "own-huawei-matepad-pro-2025", "sku-122", "tablet", "12+256 GB", '12.2"'),
                  offer("DE", "HUAWEI", "MatePad Pro 2025", "own-huawei-matepad-pro-2025", "sku-132", "tablet", "12+256 GB", '13.2"')]
        rows = ip.build_map_product([xl("DE", "平板", "HUAWEI", "MatePad Pro 2025", "12+256 GB", '12.2"', "Normal",
                                        color_size='12+256 GB/12.2"/Normal'),
                                     xl("DE", "平板", "HUAWEI", "MatePad Pro 2025", "12+256 GB", '13.2"', "Normal",
                                        color_size='12+256 GB/13.2"/Normal')], offers)
        by = {r["category2"]: r for r in rows}
        self.assertEqual(by['12.2"']["sku_id"], "sku-122")
        self.assertEqual(by['13.2"']["sku_id"], "sku-132")

    def test_matte_splits_same_storage_size(self):
        offers = [offer("SA", "HUAWEI", "MatePad 12 X 2025", "own-huawei-matepad-12-x-2025", "sku-n", "tablet", "12+256 GB", '12"'),
                  offer("SA", "HUAWEI", "MatePad 12 X 2025", "own-huawei-matepad-12-x-2025", "sku-p", "tablet", "12+256 GB", '12"',
                        spec='12" PaperMatte 12+256 GB')]
        rows = ip.build_map_product([xl("SA", "平板", "HUAWEI", "MatePad 12 X 2025", "12+256 GB", '12"', "Normal"),
                                     xl("SA", "平板", "HUAWEI", "MatePad 12 X 2025", "12+256 GB", '12"', "PaperMatte")], offers)
        by = {r["category3"]: r["sku_id"] for r in rows}
        self.assertEqual(by, {"Normal": "sku-n", "PaperMatte": "sku-p"})

    def test_empty_config_row_does_not_blank_sku(self):
        # 人工行没声明配置、SKU 拆出了配置：不挂（否则空配置会把 SKU 的配置抹掉）
        offers = [offer("SA", "HUAWEI", "Mate X7", "own-huawei-mate-x7", "s", "phone", "16+512 GB", spec="16+512 GB")]
        rows = ip.build_map_product([xl("SA", "手机", "HUAWEI", "Mate X7", "")], offers)
        self.assertEqual(rows[0]["model_id"], "")
        self.assertEqual([r["source"] for r in rows], ["xlsx", "auto-offer"])

    def test_collapsed_sku_gets_declared_config(self):
        # 穿戴塌缩行：引擎 SKU 没拆出表盘，人工行带 41mm → 仍挂上
        offers = [offer("SA", "HUAWEI", "Watch GT 6", "own-huawei-watch-gt-6", "s", "wearable", None)]
        rows = ip.build_map_product([xl("SA", "穿戴", "HUAWEI", "Watch GT 6", "41mm")], offers)
        self.assertEqual(rows[0]["sku_id"], "s")

    def test_orig_model_fallback(self):
        offers = [offer("SA", "SAMSUNG", "Z Fold8 Ultra", "cmp-samsung-z-fold8-ultra", "s", "phone", "12+256 GB")]
        rows = ip.build_map_product([xl("SA", "手机", "SAMSUNG", "Galaxy Z Fold8 Ultra", "12+256 GB",
                                        orig_model="Z Fold8 Ultra")], offers)
        self.assertEqual(rows[0]["sku_id"], "s")
        self.assertEqual(rows[0]["model"], "Galaxy Z Fold8 Ultra")

    def test_status_no_psi_only(self):
        rows = ip.build_map_product([xl("SA", "手机", "HUAWEI", "Mate X7", "16+512 GB", psi_product="Mate X7")], [])
        self.assertEqual(rows[0]["match_status"], "offer_only")  # 旧逻辑会因 psi_product 判成 psi_only


class T09Normalize(unittest.TestCase):
    def test_header_variants(self):
        # 真实 7 列（Eason 2026-11-27 样例）
        real = ip.normalize_psi_rows([{
            "Management Region": "中东非洲终端业务部", "Management Country/Region": "沙特阿拉伯",
            "Product": "HUAWEI nova 13",
            "Product SKU": "HUAWEI nova 13 12GB+256GB 星耀黑 双卡 公开渠道版 英规",
            "Period ID": "2025008", "PSI Type": "Sell Out", "QTY": "xx"}])[0]
        self.assertEqual((real["cc"], real["product"], real["psi_type"], real["period_id"], real["qty"]),
                         ("SA", "HUAWEI nova 13", "Sell Out", "2025008", None))  # QTY=xx 解不出 = 跳过
        self.assertEqual(real["region"], "中东非洲终端业务部")  # 部门名原样保留
        self.assertEqual(real["country_raw"], "沙特阿拉伯")
        # 模拟数据文件：psi_type 带下划线（回归：此前映射不到，来源类型为空 → 页面把模拟当真实 PSI）
        mock = ip.normalize_psi_rows([{"country": "AE", "product": "X", "product_sku": "", "category1": "",
                                       "category2": "", "category3": "", "period_id": "202619",
                                       "psi_type": "simulated", "qty": "165"}])[0]
        self.assertEqual((mock["cc"], mock["psi_type"], mock["qty"]), ("AE", "simulated", 165.0))
        self.assertIsNone(mock["extra_json"])


class T08Overrides(unittest.TestCase):
    def test_xlsx_sheet_rows_to_override_map(self):
        rows = [{"psi_product": "Mate X7", "product_sku": "HUAWEI Mate X7 星耀黑", "category1": "16+512 GB"},
                {"psi_product": "Mate X7", "product_sku": "", "category2": " "},
                {"psi_product": "", "product_sku": "x", "category1": "1 TB"}]
        self.assertEqual(ip._psi_sku_overrides(rows), {("Mate X7", "HUAWEI Mate X7 星耀黑"): {
            "category1": "16+512 GB", "category2": "", "category3": "", "category4": ""}})


if __name__ == "__main__":
    unittest.main()
