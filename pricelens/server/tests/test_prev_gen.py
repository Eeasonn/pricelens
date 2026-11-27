#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""上一代配置（server/prev_gen.py）单测。

运行：cd pricelens && python3 -X utf8 -m unittest discover -s server/tests
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import prev_gen  # noqa: E402


def mr(brand, model, model_id, cats=("", "", "", ""), sku="", industry="手机"):
    """一行匹配表行（built["mapProduct"] 形态的最小子集）"""
    return {"brand": brand, "model": model, "model_id": model_id, "category": industry,
            **dict(zip(prev_gen.CAT_FIELDS, cats)), "sku_id": sku}


def sheet(model, prev_model, brand="HUAWEI", cats=("", "", "", ""), prev_cats=(None, None, None, None),
          prev_brand="", **extra):
    row = {"category": "", "brand": brand, "model": model, **dict(zip(prev_gen.CAT_FIELDS, cats)),
           "prev_brand": prev_brand, "prev_model": prev_model,
           **dict(zip(prev_gen.PREV_FIELDS, ["" if v is None else v for v in prev_cats]))}
    row.update(extra)
    return row


def status_of(rows, i=-1):
    return rows[i]["match_status"]


MATCH = [
    # 手机：配置 = 存储
    mr("HUAWEI", "Mate X7", "own-huawei-mate-x7", ("12+512 GB", "", "", ""), "x7-512", industry="手机"),
    mr("HUAWEI", "Mate X7", "own-huawei-mate-x7", ("16+512 GB", "", "", ""), "x7-16", industry="手机"),
    mr("HUAWEI", "Mate X6", "own-huawei-mate-x6", ("12+512 GB", "", "", ""), "x6-512", industry="手机"),
    mr("HUAWEI", "Pura 90s Pro", "own-huawei-pura-90s-pro", ("12+256 GB", "", "", ""), "p90-256", industry="手机"),
    mr("HUAWEI", "Pura 80 Pro", "own-huawei-pura-80-pro", ("12+512 GB", "", "", ""), "p80-512", industry="手机"),
    # 平板：配置 = 存储 / 尺寸 / 柔光
    mr("HUAWEI", "MatePad Air 2026", "own-huawei-matepad-air-2026", ("12+256 GB", '12"', "Normal", ""), "air-n", industry="平板"),
    mr("HUAWEI", "MatePad Air 2026", "own-huawei-matepad-air-2026", ("12+256 GB", '12"', "PaperMatte", ""), "air-p", industry="平板"),
    mr("HUAWEI", "MatePad 12 X 2025", "own-huawei-matepad-12-x-2025", ("12+256 GB", '12"', "Normal", ""), "12x-n", industry="平板"),
    # 穿戴：Band 11 没有配置维度；Watch GT 7 有表壳尺寸
    mr("HUAWEI", "Band 11", "own-huawei-band-11", ("", "", "", ""), "band11", industry="穿戴"),
    mr("HUAWEI", "Band 10", "own-huawei-band-10", ("", "", "", ""), "band10", industry="穿戴"),
    mr("HUAWEI", "Watch GT 7", "own-huawei-watch-gt-7", ("41mm", "", "", ""), "gt7-41", industry="穿戴"),
    mr("HUAWEI", "Watch GT 7", "own-huawei-watch-gt-7", ("46mm", "", "", ""), "gt7-46", industry="穿戴"),
    mr("HUAWEI", "Watch GT 6", "own-huawei-watch-gt-6", ("41mm", "", "", ""), "gt6-41", industry="穿戴"),
    mr("HUAWEI", "Watch GT 6", "own-huawei-watch-gt-6", ("46mm", "", "", ""), "gt6-46", industry="穿戴"),
    # 同一型号名分属两个品牌（小米 Band 10 / 华为 Band 10 的历史缺陷形态）
    mr("XIAOMI", "Band 10", "comp-xiaomi-band-10", ("", "", "", ""), "xb10", industry="穿戴"),
]

PRODUCT = [  # dims.product 最小子集：sku_id → (model_id, romram)
    {"sku_id": "x7-512", "model_id": "own-huawei-mate-x7", "romram": "12+512 GB"},
    {"sku_id": "x7-16", "model_id": "own-huawei-mate-x7", "romram": "16+512 GB"},
    {"sku_id": "x6-512", "model_id": "own-huawei-mate-x6", "romram": "12+512 GB"},
    {"sku_id": "p90-256", "model_id": "own-huawei-pura-90s-pro", "romram": "12+256 GB"},
    {"sku_id": "p80-512", "model_id": "own-huawei-pura-80-pro", "romram": "12+512 GB"},
    {"sku_id": "air-n", "model_id": "own-huawei-matepad-air-2026", "romram": '12+256 GB/12"'},
    {"sku_id": "air-p", "model_id": "own-huawei-matepad-air-2026", "romram": '12+256 GB/12"/PaperMatte'},
    {"sku_id": "12x-n", "model_id": "own-huawei-matepad-12-x-2025", "romram": '12+256 GB/12"'},
    {"sku_id": "band11", "model_id": "own-huawei-band-11", "romram": ""},
    {"sku_id": "band10", "model_id": "own-huawei-band-10", "romram": "—"},
    {"sku_id": "gt7-41", "model_id": "own-huawei-watch-gt-7", "romram": "41mm"},
    {"sku_id": "gt7-46", "model_id": "own-huawei-watch-gt-7", "romram": "46mm"},
    {"sku_id": "gt6-41", "model_id": "own-huawei-watch-gt-6", "romram": "41mm"},
    {"sku_id": "gt6-46", "model_id": "own-huawei-watch-gt-6", "romram": "46mm"},
]


class T01Keys(unittest.TestCase):
    def test_slot_key_ignores_space_and_case(self):
        self.assertEqual(prev_gen.slot_key("12+512 GB"), prev_gen.slot_key("12+512GB"))
        self.assertEqual(prev_gen.slot_key("PaperMatte"), prev_gen.slot_key("papermatte"))
        self.assertEqual(prev_gen.slot_key('12"'), prev_gen.slot_key(' 12 " '))
        self.assertEqual(prev_gen.slot_key("RAM:16"), prev_gen.slot_key("ram:16"))

    def test_slot_key_blank_forms(self):
        for v in (None, "", "—", "-", "–", "nan", "None"):
            self.assertEqual(prev_gen.slot_key(v), "")

    def test_storage_unit_is_kept(self):
        # 单位不换算（16+1 TB ≠ 16+1024 GB）：匹配表里写法本就统一，只容忍空格差异
        self.assertEqual(prev_gen.slot_key("16+1 TB"), prev_gen.slot_key("16+1TB"))
        self.assertNotEqual(prev_gen.slot_key("16+1 TB"), prev_gen.slot_key("16+1024 GB"))

    def test_cats_key_is_four_tuple(self):
        self.assertEqual(prev_gen.cats_key("a", None, " ", "—"), ("a", "", "", ""))

    def test_is_active_convention(self):
        self.assertEqual(prev_gen._as_bool(""), 1)
        self.assertEqual(prev_gen._as_bool("1"), 1)
        self.assertEqual(prev_gen._as_bool("0"), 0)
        self.assertEqual(prev_gen._as_bool("否"), 0)
        self.assertEqual(prev_gen._as_bool(0), 0)

    def test_normalize_rows_header_aliases(self):
        rows = prev_gen.normalize_rows([
            {"产业": "手机", "品牌": "HUAWEI", "型号": "Mate X7", "当前cat1": "12+512 GB",
             "上一代型号": "Mate X6", "生效": "1", "备注": "x"},
            {" prev_model ": "Mate X6"},  # 表头带空格
            {"brand": "", "model": "", "note": ""},  # 全空行丢弃
            "not-a-dict",
        ])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["category"], "手机")
        self.assertEqual(rows[0]["brand"], "HUAWEI")
        self.assertEqual(rows[0]["model"], "Mate X7")
        self.assertEqual(rows[0]["category1"], "12+512 GB")
        self.assertEqual(rows[0]["prev_model"], "Mate X6")
        self.assertEqual(rows[0]["is_active"], "1")
        self.assertEqual(rows[0]["note"], "x")
        self.assertEqual(rows[1]["prev_model"], "Mate X6")


class T02Resolve(unittest.TestCase):
    def resolve(self, dicts):
        return prev_gen.resolve_prev_gen(dicts, MATCH)

    def test_exact_config_inherits_blank_prev_cats(self):
        rows, diag = self.resolve([sheet("Mate X7", "Mate X6", cats=("12+512 GB", "", "", ""))])
        self.assertEqual(status_of(rows), "matched")
        self.assertEqual(rows[0]["prev_category1"], "12+512 GB")  # 落库为显式值
        self.assertEqual(rows[0]["model_id"], "own-huawei-mate-x7")
        self.assertEqual(rows[0]["prev_model_id"], "own-huawei-mate-x6")
        self.assertEqual(rows[0]["prev_brand"], "HUAWEI")  # 品牌留空沿用当前
        self.assertEqual(rows[0]["category"], "手机")  # 产业留空取匹配表
        self.assertEqual(rows[0]["_cur_skus"], ["x7-512"])
        self.assertEqual(rows[0]["_prev_skus"], ["x6-512"])
        self.assertEqual(diag, {"rows": 1, "matched": 1, "inactive": 0, "pending": {}})

    def test_nearest_storage_is_just_another_explicit_row(self):
        rows, _ = self.resolve([sheet("Pura 90s Pro", "Pura 80 Pro", cats=("12+256 GB",),
                                     prev_cats=("12+512 GB",))])
        self.assertEqual(status_of(rows), "matched")
        self.assertEqual(rows[0]["prev_category1"], "12+512 GB")

    def test_tablet_three_config_dims(self):
        rows, _ = self.resolve([sheet("MatePad Air 2026", "MatePad 12 X 2025", cats=("12+256 GB", '12"', "PaperMatte"),
                                      prev_cats=(None, None, "Normal"))])
        self.assertEqual(status_of(rows), "matched")
        self.assertEqual([rows[0][c] for c in prev_gen.PREV_FIELDS], ["12+256 GB", '12"', "Normal", ""])

    def test_model_level_when_current_has_no_config(self):
        # Band 11 没有配置维度：整型号 → Band 10 整型号（Band 10 两个品牌都有，须写明上一代品牌）
        rows, _ = self.resolve([sheet("Band 11", "Band 10", prev_brand="HUAWEI")])
        self.assertEqual(status_of(rows), "matched")
        self.assertTrue(rows[0]["_cur_model_level"] and rows[0]["_prev_model_level"])
        self.assertEqual(rows[0]["_cur_skus"], ["band11"])
        self.assertEqual([rows[0][c] for c in prev_gen.PREV_FIELDS], ["", "", "", ""])

    def test_inactive_rows_kept_but_not_resolved(self):
        rows, diag = self.resolve([sheet("Mate X7", "Nope Model", is_active="0")])
        self.assertEqual(status_of(rows), "inactive")
        self.assertEqual(rows[0]["is_active"], 0)
        self.assertEqual(diag["inactive"], 1)
        self.assertEqual(diag["pending"], {})

    def test_pending_cur_model_not_found(self):
        rows, diag = self.resolve([sheet("Mate X99", "Mate X6")])
        self.assertEqual(status_of(rows), "cur_model_not_found")
        self.assertEqual(diag["pending"], {"cur_model_not_found": 1})

    def test_pending_industry_mismatch(self):
        rows, _ = self.resolve([sheet("Mate X7", "Mate X6", cats=("12+512 GB",), category="平板")])
        self.assertEqual(status_of(rows), "industry_mismatch")

    def test_industry_check_is_soft_when_match_table_industry_is_blank(self):
        # 匹配表里该型号的产业为空 → 不判不一致（只做软校验）
        rows, _ = prev_gen.resolve_prev_gen(
            [sheet("Mate X7", "Mate X6", cats=("12+512 GB",), category="手机")],
            [dict(r, category="") for r in MATCH])
        self.assertEqual(status_of(rows), "matched")

    def test_pending_cur_config_not_found(self):
        rows, _ = self.resolve([sheet("Mate X7", "Mate X6", cats=("8+128 GB",))])
        self.assertEqual(status_of(rows), "cur_config_not_found")

    def test_pending_prev_model_not_found(self):
        rows, _ = self.resolve([sheet("Mate X7", "Mate X99", cats=("12+512 GB",))])
        self.assertEqual(status_of(rows), "prev_model_not_found")

    def test_pending_prev_config_not_found(self):
        # Mate X6 没有 16+512
        rows, _ = self.resolve([sheet("Mate X7", "Mate X6", cats=("16+512 GB",))])
        self.assertEqual(status_of(rows), "prev_config_not_found")
        self.assertEqual(rows[0]["prev_category1"], "16+512 GB")

    def test_pending_self_reference(self):
        rows, _ = self.resolve([sheet("Mate X7", "Mate X7", cats=("12+512 GB",))])
        self.assertEqual(status_of(rows), "self_reference")

    def test_pending_duplicate_current(self):
        rows, diag = self.resolve([
            sheet("Mate X7", "Mate X6", cats=("12+512 GB",)),
            sheet("Mate X7", "Mate X6", cats=("12+512 GB",), note="第二行重复"),
        ])
        self.assertEqual([r["match_status"] for r in rows], ["matched", "duplicate_current"])
        self.assertEqual(diag["pending"], {"duplicate_current": 1})
        # 写法差异（空格）也算同一个配置
        rows2, _ = self.resolve([
            sheet("Mate X7", "Mate X6", cats=("12+512 GB",)),
            sheet("Mate X7", "Mate X6", cats=("12+512GB",)),
        ])
        self.assertEqual(status_of(rows2), "duplicate_current")

    def test_one_prev_to_many_current_allowed(self):
        rows, diag = self.resolve([
            sheet("Mate X7", "Mate X6", cats=("12+512 GB",)),
            sheet("MatePad Air 2026", "Mate X6"),  # 荒谬但结构上合法：上一代侧可重复
        ])
        self.assertEqual(diag["matched"], 2)
        self.assertEqual({r["prev_model_id"] for r in rows}, {"own-huawei-mate-x6"})

    def test_same_model_name_under_two_brands_needs_brand(self):
        # 两个品牌都有 Band 10：上一代品牌留空不回落（哪怕与当前行同品牌），写明才解析
        rows, _ = self.resolve([sheet("Watch GT 7", "Band 10", brand="HUAWEI", cats=("41mm",))])
        self.assertEqual(status_of(rows), "prev_model_not_found")
        rows, _ = self.resolve([sheet("Band 11", "Band 10", brand="HUAWEI", prev_brand="XIAOMI")])
        self.assertEqual(status_of(rows), "matched")
        self.assertEqual(rows[0]["prev_model_id"], "comp-xiaomi-band-10")

    def test_blank_brand_on_current_row_hits_only_unique_model_name(self):
        rows, _ = self.resolve([sheet("Mate X7", "Mate X6", brand="", cats=("12+512 GB",))])
        self.assertEqual(status_of(rows), "matched")
        self.assertEqual(rows[0]["brand"], "HUAWEI")
        # 型号名不唯一（Band 10 两个品牌都有）→ 待处理，不猜
        rows, _ = self.resolve([sheet("Band 10", "Band 11", brand="")])
        self.assertEqual(status_of(rows), "cur_model_not_found")

    def test_config_level_current_cannot_map_to_whole_model_without_configs(self):
        # Mate X7 12+512 ← 小米 Band 10（没有配置维度）：留空被当成「沿用 12+512」，对不上 → 待处理
        rows, _ = self.resolve([sheet("Mate X7", "Band 10", cats=("12+512 GB",), prev_brand="XIAOMI")])
        self.assertEqual(status_of(rows), "prev_config_not_found")

    def test_explicit_prev_brand_other_than_current(self):
        rows, _ = self.resolve([sheet("Band 11", "Band 10", prev_brand="XIAOMI")])
        self.assertEqual(status_of(rows), "matched")
        self.assertEqual(rows[0]["prev_brand"], "XIAOMI")
        self.assertEqual(rows[0]["prev_model_id"], "comp-xiaomi-band-10")

    def test_none_input(self):
        rows, diag = prev_gen.resolve_prev_gen(None, MATCH)
        self.assertEqual(rows, [])
        self.assertEqual(diag, {"rows": 0, "matched": 0, "inactive": 0, "pending": {}})

    def test_db_row_column_order(self):
        rows, _ = self.resolve([sheet("Mate X7", "Mate X6", cats=("12+512 GB",), note="n", maintainer="zcode",
                                      updated_at="2026-11-27")])
        vals = prev_gen.db_row(rows[0])
        self.assertEqual(len(vals), len(prev_gen.COLUMNS))
        d = dict(zip(prev_gen.COLUMNS, vals))
        self.assertEqual(d["model"], "Mate X7")
        self.assertEqual(d["prev_model"], "Mate X6")
        self.assertEqual(d["prev_category1"], "12+512 GB")
        self.assertEqual(d["is_active"], 1)
        self.assertEqual(d["note"], "n")
        self.assertEqual(d["match_status"], "matched")
        self.assertNotIn("_cur_skus", d)


class T03PackGroups(unittest.TestCase):
    def groups(self, dicts):
        rows, _ = prev_gen.resolve_prev_gen(dicts, MATCH)
        return prev_gen.prev_gen_pack_groups(rows, PRODUCT)

    def test_group_mapping_uses_pack_romram(self):
        groups, diag = self.groups([sheet("Mate X7", "Mate X6", cats=("12+512 GB",))])
        self.assertEqual(groups, [{"m": "own-huawei-mate-x7", "r": "12+512 GB",
                                   "p": [["own-huawei-mate-x6", "12+512 GB"]]}])
        self.assertEqual(diag, {"groups": 1, "unmappedRows": 0})

    def test_tablet_group_string_keeps_size_and_matte(self):
        groups, _ = self.groups([sheet("MatePad Air 2026", "MatePad 12 X 2025", cats=("12+256 GB", '12"', "PaperMatte"),
                                       prev_cats=(None, None, "Normal"))])
        self.assertEqual(groups, [{"m": "own-huawei-matepad-air-2026", "r": '12+256 GB/12"/PaperMatte',
                                   "p": [["own-huawei-matepad-12-x-2025", '12+256 GB/12"']]}])

    def test_model_level_rows_map_to_dash_group(self):
        # 两个型号都没有配置维度：包里 romram 为空 / — 都归一成 —（与前端 ProductSelection 一致）
        groups, _ = self.groups([sheet("Band 11", "Band 10", prev_brand="HUAWEI")])
        self.assertEqual(groups, [{"m": "own-huawei-band-11", "r": "—",
                                   "p": [["own-huawei-band-10", "—"]]}])

    def test_model_level_prev_expands_to_all_groups_of_prev_model(self):
        # 当前整型号 → 上一代整型号：上一代有 41mm / 46mm 两个配置组，全部带出
        groups, _ = self.groups([sheet("Band 11", "Watch GT 6")])
        self.assertEqual(groups, [{"m": "own-huawei-band-11", "r": "—",
                                   "p": [["own-huawei-watch-gt-6", "41mm"], ["own-huawei-watch-gt-6", "46mm"]]}])

    def test_many_current_to_one_prev(self):
        groups, _ = self.groups([
            sheet("Mate X7", "Mate X6", cats=("12+512 GB",)),
            sheet("Pura 90s Pro", "Mate X6", cats=("12+256 GB",), prev_cats=("12+512 GB",)),
        ])
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0]["p"], [["own-huawei-mate-x6", "12+512 GB"]])
        self.assertEqual(groups[1]["p"], [["own-huawei-mate-x6", "12+512 GB"]])

    def test_model_level_row_plus_config_row_merge_prev_targets(self):
        # 整型号一行（GT 7 全部 → GT 6 全部）+ 某配置一行（GT 7 41mm → GT 6 41mm）：
        # 41mm 这个当前组的上一代目标 = 两行并集；46mm 组只来自整型号那一行
        groups, _ = self.groups([
            sheet("Watch GT 7", "Watch GT 6"),
            sheet("Watch GT 7", "Watch GT 6", cats=("41mm",)),
        ])
        self.assertEqual(groups, [
            {"m": "own-huawei-watch-gt-7", "r": "41mm",
             "p": [["own-huawei-watch-gt-6", "41mm"], ["own-huawei-watch-gt-6", "46mm"]]},
            {"m": "own-huawei-watch-gt-7", "r": "46mm",
             "p": [["own-huawei-watch-gt-6", "41mm"], ["own-huawei-watch-gt-6", "46mm"]]},
        ])

    def test_same_model_different_config_is_not_self_reference(self):
        groups, _ = self.groups([sheet("Mate X7", "Mate X7", cats=("12+512 GB",), prev_cats=("16+512 GB",))])
        # X7 12+512 → X7 16+512 不是自指（配置不同），合法
        self.assertEqual(groups, [{"m": "own-huawei-mate-x7", "r": "12+512 GB",
                                   "p": [["own-huawei-mate-x7", "16+512 GB"]]}])

    def test_unmapped_when_prev_sku_missing_in_pack(self):
        product = [p for p in PRODUCT if p["sku_id"] != "x6-512"]
        rows, _ = prev_gen.resolve_prev_gen([sheet("Mate X7", "Mate X6", cats=("12+512 GB",))], MATCH)
        groups, diag = prev_gen.prev_gen_pack_groups(rows, product)
        self.assertEqual(groups, [])
        self.assertEqual(diag, {"groups": 0, "unmappedRows": 1})

    def test_pending_and_inactive_rows_never_enter_pack(self):
        groups, _ = self.groups([
            sheet("Mate X7", "Nope", cats=("12+512 GB",)),
            sheet("Mate X7", "Mate X6", cats=("16+512 GB",), is_active="0"),
        ])
        self.assertEqual(groups, [])

    def test_empty_inputs(self):
        self.assertEqual(prev_gen.prev_gen_pack_groups(None, None), ([], {"groups": 0, "unmappedRows": 0}))


if __name__ == "__main__":
    unittest.main()
