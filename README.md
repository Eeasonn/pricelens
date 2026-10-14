# PriceLens · 欧亚手机市场价格看板

华为 vs 竞品的周度价格走势与生命周期分析看板。纯前端单文件交付：数据构建时内嵌（gzip+base64），双击 `PriceLens.html` 即可离线打开，也可访问在线版。

**在线版**：<https://eeasonn.github.io/pricelens/>（push main 自动构建部署，见 `.github/workflows/deploy.yml`）

## 功能

- **价格走势**：折后价 / RRP 双口径，季/月/周三种粒度；Y 轴纯自适应 + 断轴压缩 + 刻度密度调节（齿轮弹层）；时间范围自适应或手动刷选
- **筛选体系**：国家｜产业｜产品（级联多选，前几层点行 = 整组勾选）｜竞品｜平台；时间 + 币种（本币 / USD 参考汇率）
- **促销力度热力带**：与时间轴逐像素对齐的窗口促销矩阵
- **生命周期标注**：季粒度下系列名第二行显示「生命周期 −X%」（首销季 → 末季季均折后价变化）
- **下钻分析**：月/季悬停下钻弹窗、周视图跳转、端点 S/E 徽标与窗口外续接
- **配置页**：上一代关系、竞品基准矩阵、参考汇率维护

## 技术栈

React 18 · TypeScript · Ant Design 5 · ECharts 5（按需注册）· Vite（`vite-plugin-singlefile` 单文件）

## 本地开发

```bash
cd pricelens
npm install
npm run dev      # http://localhost:5199
npm run check    # typecheck + verify(数据断言) + vitest 金测 + build(自动同步根 PriceLens.html)
npm run gen      # 重新生成演示数据（seed 确定性）
```

## 目录

- `pricelens/` —— 看板源码（React + TS）；`src/data/` 为构建时内嵌的维度/事实数据
- `PriceLens.html` —— 构建产物单文件（每次 build 自动同步，可直接分发）
- `生命周期设计示意.html` —— 生命周期分析设计示意稿

## 数据口径

演示数据：周度「台阶+平台」稳定价模型，seed 确定性生成；RRP 恒定（至多一次只涨上调）；折后价 ≤ RRP；USD = ₽ ÷ 参考汇率 80。口径细节见 `pricelens/README.md` 与看板页脚。
