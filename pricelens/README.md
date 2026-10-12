# PriceLens · 单国价格看板打样

需求基线：`../PriceLens-单国打样-自包含落地方案.md`（唯一事实来源）

```bash
npm install        # 安装依赖（已执行过则跳过）
npm run gen        # 造数：scripts/gen-data.mjs → src/data/*.json（seed 20261009，可复现）
npm run dev        # 本地开发
npm run build      # 产出单文件 dist/index.html（离线双击可用）
npm run typecheck  # tsc --noEmit
```

## 分工（并行）

| 模块 | 负责人 | 主要文件 |
| --- | --- | --- |
| 造数 + §7.3 聚合契约 | Agent A | `data/master/*.json`、`scripts/gen-data.mjs`、`src/data/*`、`src/dataModel/aggregate.ts` |
| 筛选条五框 + 配置页 | Agent B | `src/state/FiltersContext.tsx`、`src/components/FilterBar/*`、`src/components/ProductCascader/*`、`src/pages/Config.tsx` |
| 价格走势图全家桶 | Agent C | `src/chart/PriceTrend/*`、`src/pages/Dashboard.tsx` |

公共冻结文件（不许改）：`src/theme/tokens.ts`、`src/dataModel/types.ts`、`src/state/filtersTypes.ts`（B 仅可追加字段）、`src/state/lplKeys.ts`、`src/App.tsx`、`src/main.tsx`、构建配置。
