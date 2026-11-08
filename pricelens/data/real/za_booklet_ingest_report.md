# ZA Vodacom 小册子导入报告

生成时间：2026-11-08T16:47:33+00:00
源文件：1-ZA_VODACOM_manuals_2026-01_10_unified29_20261103.xlsx
门禁状态：FAIL

## 结果

- 全量数据行：986
- offer 数：663
- 有价记录：930
- 无价格记录：56
- 发布行：986
- 发布状态：PUBLISHED
- 复核状态：{'PASS': 986}
- 价格类型：{'installment': 592, 'prepaid': 338, 'no-price': 56}
- SKU 匹配：{'matched-model': 986}

## 发布条件

每条记录同时满足以下条件才进入 published 文件。

- 源统计页 gate_status 为 PASS，或使用已记录的 owner-approved-source-import 发布方式。
- 复核台账 offer 状态为 PASS。
- 页面审计 review_status 为 PASS。
- 型号能够匹配到唯一 SKU，或使用带来源记录的型号级 ZA 小册子 SKU。
- 月供记录为 24 或 36 期，有价格记录可有价发布。
- 无价格记录保留在 staging，不能作为零价发布。

## 阻断原因

- gift_accuracy_unverified：986 行
- installment_accuracy_unverified：986 行
- model_accuracy_unverified：986 行
- owner_approved_source_import：986 行
- price_accuracy_unverified：986 行
- promotion_accuracy_unverified：986 行
- source_gate_fail：986 行
- two_pass_review_missing：986 行
- price_missing：56 行

原始附件的其他页签保留为证据和复核依据，不作为事实源写入 weekly real fact pack。
发布方式：owner-approved-source-import。
月度发布应由后续 FactPriceMonthly 读取 published 文件，继续保留 period_id、term_months、price_type 和 source provenance。
当前 runtime monthly facts：/Users/eason/Documents/Eason's Projects/Price Intelligence/pricelens/src/data/fact_price_monthly.json（986 行）。
