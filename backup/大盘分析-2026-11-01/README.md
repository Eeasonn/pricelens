# 大盘分析 / 大盘环比贡献拆解 · 备份（2026-11-01）

Eason 要求删除量价看板底部的「大盘分析」卡（含卡内「大盘环比贡献拆解」），
留档备用。本目录为删除前的完整原样备份（与删除提交的父提交逐字节一致）。

## 备份文件

| 文件 | 原路径 | 说明 |
| --- | --- | --- |
| `MarketBoard.tsx` | `pricelens/src/pages/volume/MarketBoard.tsx` | 大盘分析卡：档位分布 100% 柱（堆叠=品牌构成）+ 档位筛选 + 点击柱选期 + 大盘环比贡献拆解（品牌行 + 产品子行） |
| `market.ts` | `pricelens/src/dataModel/market.ts` | 大盘数据模型：marketConfigs / tierStructure / brandContribution / marketBrandOrder / fmtSignedInt / marketKeyOf |
| `market.golden.test.ts` | `pricelens/src/dataModel/__tests__/market.golden.test.ts` | 上述两者的金测（253 行） |

## 同步删除的接线（恢复时需重做）

- `pricelens/src/pages/VolumePrice.tsx`：`import MarketBoard`、`marketWin` useMemo（大盘卡时间域：同步=共享窗口 / 非同步=各面板生效窗口并集）、页面底部 `<MarketBoard …>` 区块
- `pricelens/src/components/DataHelpModal.tsx`：章节标题「五、销量口径（量价看板 / 大盘分析）」中的大盘分析字样、大盘分析口径说明一行
- `pricelens/src/dataModel/__tests__/tierBands.test.ts`：头注释中的「大盘档位轴」字样

## 如何恢复

方式一（推荐）：从本目录把三个文件拷回原路径，再按上一节把 VolumePrice.tsx
三处接线补回（可参考删除提交的父提交，例如
`git show <删除提交>^:pricelens/src/pages/VolumePrice.tsx` 中的对应片段）。

方式二：直接从 git 历史取删除提交的父版本：

```bash
git show <删除提交>^:pricelens/src/pages/volume/MarketBoard.tsx
```

注意：`market.ts` 仅被 MarketBoard 引用，恢复后无需改动其他模块；
定价推演「大盘预估卡」、推演页「终端大盘」、情报中心「产业大盘」是各自
独立功能，与本次删除无关，未受影响。
