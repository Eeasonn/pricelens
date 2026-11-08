# ZA 小册子复核与发布流程

## 1. 生成 staging

```bash
npm --prefix pricelens run ingest:za -- --xlsx "/path/to/ZA_VODACOM_manuals.xlsx"
```

该命令只更新 staging、发布闸门和报告。它不会写入周度事实包。

上传的小册子只标注到型号、没有明确容量或颜色时，先运行产品映射。唯一候选 SKU 会复用现有目录，歧义型号会生成带 `规格未标明` 的型号级 ZA 小册子 SKU，映射写入 `za_booklet_product_map.json`。

```bash
python3 scripts/reconcile_za_products.py --xlsx "/path/to/ZA_VODACOM_manuals.xlsx"
```

## 2. 填写复核决策

编辑 `za_booklet_review_decisions.json`。`decisions` 的键是 `offer_id`，支持覆写以下字段。

```json
{
  "schema_version": "za-operator-booklet-review-v1",
  "reviewer": "name",
  "reviewed_at": "2026-11-08T12:00:00+08:00",
  "decisions": {
    "VDC-2026-01-P01-O1": {
      "review_status": "PASS",
      "offer_review_status": "PASS",
      "page_review_status": "PASS",
      "match_status": "matched-spec-complete",
      "sku_spec": "8+128 GB",
      "sku_id": "cmp-samsung-galaxy-tab-a11__8-7inwifi8-128gb__x",
      "notes": "两轮视觉核验完成"
    }
  }
}
```

`review_status` 只是复核意图。发布器会重新计算门禁。源 gate、offer、页面、规格匹配任一不满足时，记录仍为 PENDING 或 FAIL。

## 3. 预览发布

```bash
npm --prefix pricelens run review:za -- --dry-run
```

预览会输出决策文件摘要、修改行数、可发布行数和阻断原因，不修改任何发布文件。

## 4. 正式发布

```bash
npm --prefix pricelens run review:za
```

正式发布会写入 `za_booklet_published.json` 和 `src/data/fact_price_monthly.json`，并追加 `za_booklet_publish_audit.jsonl`。发布前会保留 `.bak` 文件。

当产品负责人确认本次上传的真实小册子可直接进入系统，但附件内的视觉复核页仍保留 `FAIL/SUMMARY/REVIEW_REQUIRED` 状态时，使用 owner-approved source import。该方式只放行必填字段完整、月供为 24 或 36 期、且已经完成型号级映射的记录。原始 `source_gate_status`、复核状态和原因保留在 staging、published 和 runtime 中。

```bash
npm --prefix pricelens run ingest:za -- --xlsx "/path/to/ZA_VODACOM_manuals.xlsx" --owner-approved
npm --prefix pricelens run review:za
```

## 5. 回滚

```bash
npm --prefix pricelens run review:za -- --rollback
```

回滚恢复最近一次发布前的 staging、published 和 runtime 文件，并将操作追加到审计日志。
