# PriceLens 量价预测完整 Adapter 模拟数据规范

> 适用：简单版的完整 Adapter / 验模 fixture。此文件不替换当前页面的 24 周 UI Demo，不替换真实价格事实表，也不改变现有页面、数据包和计算层。

## 与当前 UI Demo 的版本边界

当前页面的 canonical UI Demo 是 `simple-demo-v1`：R国、直营电商、HUAWEI Pura 90 Pro、USD、W1–W24，定义见 `docs/lifecycle-os-mvp/02-simple-demo-simulation-data.md`。本文件是 `simple-full-v1`：RU、DNS、Pura 80 Pro、RUB、104 周历史 + 8 周预测，用于 Dataset Adapter、权重拟合和验模。两者字段契约必须兼容，但不能因为读取本文件就把当前页面切换到另一套产品、币种或时间范围。

## 1. Fixture 范围

| 项目 | 约定 |
| --- | --- |
| 场景 | `simple-full-v1` |
| 国家 / 产业 / 渠道 | RU / phone / DNS |
| 币种 | RUB |
| 关注产品 | Pura 80 Pro |
| 对照产品 | Pura 70 Pro（上一代）、iPhone 17 Pro、S26 Ultra |
| 历史 | 104 周：2024-W44 至 2026-W43 |
| 预测 | 8 周：2026-W44 至 2026-W51 |
| UI 默认窗口 | 最近 52 周；模型可读取完整 104 周 |
| 首期因子 | baseline、price、promo、competitor、supply、margin |

建议 fixture 目录为 `demo/simple-demand-model/fixtures/`。当前界面用 `data.js` 内的 24 周切片展示闭环；后续接入完整 fixture 时通过 adapter 读取该目录，不能替换 `src/data/fact_pack_gzip.b64.txt`、`src/dataModel/volume.ts` 或真实维表。所有记录使用 `data_status=simulated`，通过“演示数据”文字 badge 与真实数据区分。

## 2. 文件与字段

### `scenario.json`

```json
{
  "scenario_id": "simple-full-v1",
  "scope": { "country_code": "RU", "industry": "phone", "channel_id": "RU:dns:独立站", "currency": "RUB" },
  "history_start_week": "2024-W44",
  "history_end_week": "2026-W43",
  "forecast_start_week": "2026-W44",
  "forecast_horizon": 8,
  "data_status": "simulated",
  "generator_version": "forecast-demo-1.0",
  "visible_products": ["demo-own-pura80-pro", "demo-cmp-iphone17-pro", "demo-cmp-s26-ultra"],
  "factor_set": ["baseline", "price", "promo", "competitor", "supply", "margin"],
  "truth_hidden_fields": ["unconstrained_demand_truth", "lost_sales_truth"]
}
```

### 周、产品与价格

`weeks.csv`：每周一行（112 行）。

```text
week_id,week_start,week_end,week_wed,month_id,quarter_id,week_index,is_forecast,season_index,market_size_units,market_growth_yoy_pct,market_status
```

`market_size_units` 是国家 × 手机 × 目标价格档的周总需求，不是我司 SO；未来周填空并用 assumption 生成情景。

`products.csv`：

```text
product_id,model_id,product_name,generation,brand,is_own,is_focus,industry,price_tier,launch_week,eol_week,reference_price_local,reference_price_usd,cost_base_local,previous_product_id,primary_competitor_id
demo-own-pura80-pro,PURA80-PRO,Pura 80 Pro,current,HUAWEI,true,true,phone,800-1200,2025-W10,,89990,1120,52000,demo-own-pura70-pro,demo-cmp-iphone17-pro
demo-own-pura70-pro,PURA70-PRO,Pura 70 Pro,previous,HUAWEI,true,false,phone,800-1200,2024-W44,2025-W09,84990,1060,50000,,
demo-cmp-iphone17-pro,IPHONE17-PRO,iPhone 17 Pro,competitor,APPLE,false,false,phone,1000+,2025-W40,,129990,1620,,,demo-own-pura80-pro
demo-cmp-s26-ultra,S26-ULTRA,S26 Ultra,competitor,SAMSUNG,false,false,phone,1000+,2025-W05,,124990,1560,,,demo-own-pura80-pro
```

`price_weekly.csv`（每个产品 × 每周一行，约 448 行）：

```text
week_id,product_id,rrp_local,net_price_local,discount_pct,price_change_pct_vs_prev,price_status,available_flag,channel_id
```

`net_price_local` 是消费者感知到手价；Offer、赠品、分期保留在事件和说明字段，不隐式折算到价格。

### 事件、供给、SO 与利润

`promo_events.csv`：

```text
event_id,event_type,event_name,scope_product_id,country_code,channel_id,preheat_start_week,start_week,end_week,aftermath_end_week,depth_pct,traffic_lift_pct,planned_or_actual,data_status,source_note
```

统一用预热、活动期、活动后窗口描述。depth_pct 是活动强度，uplift 由模型学习，不能直接写成销量结果。

`competitor_events.csv`：

```text
event_id,competitor_product_id,event_type,announcement_week,on_sale_week,end_week,price_change_pct,market_scope,planned_or_actual,notes
```

简单版把竞品事件统一映射为我司份额压力；market_scope 先固定为 `same_tier`，不自动判断扩盘还是分流。

`supply_weekly.csv`：

```text
week_id,product_id,opening_inventory_units,inbound_units,allocated_units,supply_cap_units,stockout_flag,lead_time_weeks,inventory_end_units,dos,availability_status
```

供给是需求观测的删失条件。库存和 DOS 是结果与风险指标，不作为需求因子。

`sellout_weekly.csv`：

```text
week_id,product_id,observed_so_units,so_status,coverage_pct,unconstrained_demand_truth,lost_sales_truth,confidence,data_status
```

模型和 UI 只读取 observed_so_units。truth 字段建议放在 `truth/` 或由 adapter 读取后剥离，仅供验模；缺货周使用 `so_status=censored`，不能把 SO 下降直接解释为需求下降。

`cost_margin_weekly.csv`：

```text
week_id,product_id,unit_cost_local,channel_fee_pct,incentive_local,net_revenue_local,unit_margin_local,margin_status
```

成本只进入利润链，不直接改需求；预测期使用成本情景曲线。

`factor_config.json`：

```json
{
  "baseline": { "kernel": "trend+seasonality+lifecycle", "learnable": true },
  "price": { "kernel": "step", "lag_weeks": 1, "learnable": true, "prior": -1.7 },
  "promo": { "kernel": "preheat_peak_aftermath", "lag_weeks": 0, "learnable": true },
  "competitor": { "kernel": "decay", "half_life_weeks": 6, "learnable": true },
  "supply": { "kernel": "censor", "role": "constraint", "learnable": false },
  "margin": { "kernel": "accounting", "role": "output", "learnable": false }
}
```

## 3. 事件覆盖与样例

历史必须同时具备可识别和混杂样本：

- 只促销不调价：双 12、黑五、618 至少 3 次；
- 只调价不促销：至少 3 次；
- 价格与促销同周：至少 2 次，事件备注 `confounded=true`；
- 竞品上市：至少 2 次；事件前后各保留 4 个无事件周；
- 缺货：至少 3 个短窗口（例如 2025-W51、2026-W18~W19、2026-W42）；
- 预测期事件使用 `planned` / `assumption`，不填真实 SO。

```text
promo-12-2025,mega,双12,all,RU,DNS,2025-W49,2025-W50,2025-W51,2025-W52,0.08,0.12,actual,simulated,
promo-blackfriday-2025,mega,黑五,all,RU,DNS,2025-W47,2025-W48,2025-W49,2025-W50,0.10,0.16,actual,simulated,
cmp-launch-iphone17pro,demo-cmp-iphone17-pro,launch,2025-W39,2025-W40,2025-W46,0,same_tier,actual,上市冲击 6 周递减
cmp-price-iphone17pro-26w17,demo-cmp-iphone17-pro,price_cut,,2026-W17,2026-W20,-0.06,same_tier,actual,
cmp-launch-s26ultra-26w08,demo-cmp-s26-ultra,launch,2026-W07,2026-W08,2026-W14,0,same_tier,actual,
```

## 4. 确定性生成规则

固定 seed 或 hash，连续生成必须逐行一致：

```text
M_t = 56000 × (1 + 0.04 × year_progress) × season_index(month) × seeded_noise(±3%)
D_truth = M_t × base_share × lifecycle × price_factor × promo_factor × competitor_factor × seeded_noise(±4%)
SO = min(D_truth, supply_cap)
lost_sales = max(0, D_truth - SO)
inventory_end = max(0, opening_inventory + inbound - SO)
DOS = inventory_end / max(rolling_4w_demand, 1) × 7
```

建议参数：

- 月季节系数：Jan .88、Feb .92、Mar .98、Apr 1.00、May .97、Jun 1.02、Jul 1.03、Aug 1.05、Sep 1.02、Oct 1.10、Nov 1.20、Dec 1.14；
- 生命周期：首销三周 [.62,.84,1.00]，成熟段每周 ×.992，W40 后每周 ×.985；
- 价格：`price_factor=(net_price/reference_price)^(-1.70)`，调价后一周生效；
- 促销：预热 ×1.05，活动期 `1 + depth_pct × 1.6`，活动后一周 ×.92；
- 竞品：相对价差 `exp(-.75 × (own_net - weighted_comp_net) / weighted_comp_net)`；上市压力 `1 - .12 × exp(-age_weeks / 6)`；简单版不改变 market_size；
- 成本：`unit_cost=52000 × (1 + .03 × year_progress)`；`net_revenue=net_price × (1-channel_fee_pct) - incentive_local`；`unit_margin=net_revenue-unit_cost`。

## 5. 数据质量门槛

- 历史 104 周；非缺货周至少 85%；
- 每类事件有前置对照周和后置观察周；
- `observed_so <= supply_cap`、`unconstrained_demand_truth >= observed_so`、库存不为负；
- 价格和利润公式可以由 CSV 输入复算；
- 生成器固定 seed/hash，两次生成完全一致；
- UI 只展示事实和计算结果，truth 字段只用于验模；
- 历史样本不足时显示“待学习 / 证据不足”，不能生成伪精确静态权重。

## 6. 与现有仓库的边界

仓库现有 `dim_product`、`dim_promo`、`dim_channel`、`dim_time` 和 `dataModel/volume.ts` 已有生命周期、促销、折扣的确定性生成参考。Demo 可以沿用字段命名和单位，但应在 adapter 中映射 `demo_*` ID，并显式保留 `simulated` 状态；禁止改写真实 fact pack、真实维表或现有量价计算层。
