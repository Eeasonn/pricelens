# 价格走势 · 名称带两行药丸（2026-11-13）

## 拍板（Eason）

图表左侧名称带药丸改两行：**行1 = 品牌色点 + [品牌词] + 产品名；行2 = 配置 chip**。
品牌词显隐规则（同日拍板）：型号名一眼认出品牌的（iPhone/Galaxy/Redmi…）**不**内联
品牌词（品牌只在悬停出）；看不出的（小米数字系列/A37/X9D 这类裸型号名）**恒**内联。
判定来自清洗层 `dim_product.brand_inline`（ingest `is_brand_inline` + 人工覆写），
运行层唯一判定源 = `BrandMark.pillBrandLabel`。

## 同日纠偏

「药丸两行」原误落在竞品配置页（BenchmarkConfigBlock）——该页原本就是
「色点 + 型号 · 配置」单行、无需改，已恢复原状（仅保留「竞品怎么匹配」②
配置对配置匹配规则的新提示文案）。图顶药丸带 BrandLegendStrip 的两行版式
（177/178 轮语言）为本次名称带实现的参照蓝本。

## 实现要点

- 拆行口径单一来源 = `chartModel.seriesPillMetaOf`（curveNameOf 剥配置后缀；
  romram '—'/'规格未标明' 不出 chip 回落单行；financeTag 分期标注留在行1）。
- 几何：`buildLabelPlan` 新增 `pillSpecOf` 注入，chip 行 `ZONE_CFG_ROW_H=16`
  计入避让盒；带宽 `nameZoneWidthOf` 接受两行 spec、取两行较宽者（量价页
  字符串入参行为不变）；不传 pillSpecOf 时几何与字段与旧版一致（金测零漂移）。
- chip 样式 = 图顶药丸带同款（10px/600/selectSoft 浅蓝底/selectSoftInk/tnum）。
- 量带归属药丸（volume-owner-pill）本次**未**改两行——涉及量带几何锚点偏移，
  待 Eason 看过名称带效果再定（单一来源纪律 NAME_PILL_BOX 仍在共享）。

## 验收

typecheck / design:check / design:lint / `npm run check`（1994+7skip，金测 84 全过）
全绿；稳定版单文件已重建。
