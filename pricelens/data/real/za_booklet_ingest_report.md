# ZA Vodacom 小册子导入报告

生成时间：2026-11-11T10:33:07+00:00
源文件：ZA_VODACOM_1109.xlsx
门禁状态：owner-approved

## 结果

- 全量数据行：1,886
- offer 数：1,621
- 有价记录：1,886
- 无价格记录：0
- 发布行：1,886
- 发布状态：PUBLISHED
- 复核状态：{'PASS': 1886}
- 价格类型：{'installment': 1241, 'prepaid': 645}
- SKU 匹配：{'matched-spec-complete': 960, 'matched-model': 926}

## 发布条件

每条记录同时满足以下条件才进入 published 文件。

- 源统计页 gate_status 为 PASS，或使用已记录的 owner-approved-source-import 发布方式。
- 复核台账 offer 状态为 PASS。
- 页面审计 review_status 为 PASS。
- 型号能够匹配到唯一 SKU，或使用带来源记录的型号级 ZA 小册子 SKU。
- 月供记录为 24 或 36 期，有价格记录可有价发布。
- 无价格记录保留在 staging，不能作为零价发布。

## 阻断原因


原始附件的其他页签保留为证据和复核依据，不作为事实源写入 weekly real fact pack。
发布方式：owner-approved-source-import。
月度发布应由后续 FactPriceMonthly 读取 published 文件，继续保留 period_id、term_months、price_type 和 source provenance。
当前 runtime monthly facts：/Users/eason/Documents/Eason's Projects/Price Intelligence/pricelens/src/data/fact_price_monthly.json（1,886 行）。
