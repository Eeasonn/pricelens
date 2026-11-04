import { DEFAULT_SCENARIO, forecastScenario, buildContinuousSeries } from '../roadshowDemo/scenario.js';
import { ACTUAL_WEEKS, PREVIOUS_PRIOR, MARKET_EVENTS, REASONS, FX_POINTS, MEMORY_RANGES, MARKET_TIERS, DUO } from '../roadshowDemo/data.js';
import { renderSOChart, renderFactorChart, renderFxChart } from '../roadshowDemo/charts.js';

const badge = (kind) => kind === 'real' ? '<span class="badge real">真实资料</span>' : kind === 'mixed' ? '<span class="badge mixed">真实数据 · 模拟规则</span>' : '<span class="badge demo">模拟数据</span>';

export function topChrome(scene) {
  return `<header class="topbar"><div class="brandline"><span class="wordmark">PriceLens</span><span class="scope">单国家分析</span><span class="divider"></span><span class="country">欧亚 / R国</span></div><div class="topactions"><nav><button data-scene="price" class="${scene === 'price' ? 'active' : ''}">价格分析</button><button data-scene="intel" class="${scene === 'intel' ? 'active' : ''}">情报中心</button><button data-scene="so" class="${scene === 'so' ? 'active' : ''}">量价走势（demo）</button></nav><a class="real-link" href="http://localhost:5174/" target="_blank" rel="noopener noreferrer">真实 PriceLens ↗</a></div></header>`;
}

export function intelScene() {
  return `<main class="page-scroll intel-page"><div class="page-heading"><div><div class="eyebrow">INTELLIGENCE CENTER / RUSSIA</div><h1>情报中心 <span class="badge real">R国</span></h1><p>汇率、产业大盘、上游成本和新品事件在同一分析上下文 · 截至 2026-10-29</p></div><div class="grow"></div><button class="btn primary" data-scene="so">进入 SO 预测</button></div>
  <div class="kpi-grid"><div class="kpi"><span>USD / RUB ${badge('real')}</span><b>80.8664</b><small>年初至今 +2.63% · 卢布兑美元走弱</small></div><div class="kpi"><span>年内官方汇率区间 ${badge('real')}</span><b class="small-value">70.7902–86.9963</b><small>5月22日低点 / 9月3日高点</small></div><div class="kpi"><span>R国手机大盘 ${badge('simulated')}</span><b>1.86M <em>台</em></b><small>最近4周 · 环比 +3.2% · 仅演示</small></div><div class="kpi"><span>4Q26 DRAM 合约价 ${badge('real')}</span><b>+10–15%</b><small>QoQ · TrendForce 2026-09-30</small></div></div>
  <div class="intel-grid"><section class="card intel-card wide"><div class="card-head"><div><h2>俄罗斯卢布兑美元汇率</h2><p>USD/RUB · 数值越高表示 1 美元可兑换更多卢布 · 俄罗斯央行官方汇率</p></div><a href="https://www.cbr.ru/eng/currency_base/dynamics/" target="_blank" rel="noopener noreferrer">CBR 数据源 ↗</a></div><div class="fx-summary"><b>80.8664</b><span>RUB / USD · 10月29日</span><em>10月8日以来 −5.40%</em></div>${renderFxChart(FX_POINTS)}<div class="fx-events"><div><b>70.7902 · 5月22日</b>年内官方汇率低点</div><div><b>86.9963 · 9月3日</b>年内官方汇率高点</div><div><b>80.8664 · 10月29日</b>10月高位后回落</div></div><div class="forecast-strip"><span>2026 全年均值 · 分析师预测 <b>80.0</b></span><span>2026 Q4 隐含均值 <b>85.3</b></span><span>2027 年均值 · 分析师预测 <b>89.4</b></span><a href="https://www.cbr.ru/eng/statistics/ddkp/mo_br/" target="_blank" rel="noopener noreferrer">宏观调查 ↗</a></div></section>
  <section class="card intel-card"><div class="card-head"><div><h2>全球存储市场变动 ${badge('real')}</h2><p>DRAM / NAND Flash 合约价季度环比预测区间</p></div><a href="https://www.trendforce.com/presscenter/news/20260930-13258.html" target="_blank" rel="noopener noreferrer">TrendForce ↗</a></div><div class="memory-list">${MEMORY_RANGES.map((row) => `<a class="memory-row" href="${row.url}" target="_blank" rel="noopener noreferrer"><span>${row.quarter}</span><b>${row.dram}</b><b>${row.nand}</b><span>↗</span></a>`).join('')}</div><div class="memory-legend"><span><i class="dot blue"></i>DRAM</span><span><i class="dot amber"></i>NAND Flash</span></div><div class="note-box"><b>对手机成本的含义</b><br>AI 与服务器需求持续挤占先进产能，移动 DRAM 供应仍紧；但前期大涨已计入，4Q 增速趋缓。NAND 涨幅在 4Q 高于 DRAM。用于单台成本模型时应转换为“情景假设”，而非直接叠加百分比。</div></section>
  <section class="card intel-card"><div class="card-head"><div><h2>R国分产业、分价格档位大盘 ${badge('simulated')}</h2><p>最近4周销量规模、环比与我司份额 · 仅用于界面和预测逻辑演示</p></div></div><div class="tier-head"><span>价格档位</span><span>规模（千台）</span><span>环比</span><span>我司份额</span></div>${MARKET_TIERS.map((row) => `<div class="tier-row"><span>${row.tier}</span><div class="tier-bar"><i style="width:${Math.round(row.value / 6.5)}%"></i><span>${row.value}</span></div><span>${row.change}</span><span>${row.share}</span></div>`).join('')}<div class="note-box demo-box">模拟口径：全渠道 Sell-Out，不代表真实市场统计。档位下降可能来自终端需求缩减，也可能来自产品退出或迁移；档位增长也可能来自新品进入。</div></section></div>
  <section class="card duo-card"><div class="duo-visual"><img src="${DUO.image}" alt="Apple 官方 iPhone Duo 两种配色" referrerpolicy="no-referrer"></div><div class="duo-content"><div class="eyebrow">NEW PRODUCT INTELLIGENCE · APPLE OFFICIAL</div><h2>iPhone Duo</h2>${badge('real')}<p>7.6 英寸内屏与 5.4 英寸外屏，搭载 A20 Pro。美国起售价 $1,999；10 月 16 日开启预订，10 月 23 日首批上市。作为超高端新品事件，可联动观察 R国 $2K+ 档位的价格锚与供应变化。</p><div class="duo-specs"><div><b>7.6″</b><span>OLED 折叠内屏</span></div><div><b>5.4″</b><span>外屏</span></div><div><b>A20 Pro</b><span>2nm 芯片</span></div><div><b>$1,999</b><span>美国起售价</span></div></div><div class="note-box demo-box">R国上市时间、当地售价和渠道供货未在引用的 Apple 资料中确认；这里仅作为全球新品情报，不写成“已在 R国上市”。</div><div class="duo-links"><a href="${DUO.news}" target="_blank" rel="noopener noreferrer">Apple 官方发布 ↗</a><a href="${DUO.specs}" target="_blank" rel="noopener noreferrer">技术规格 ↗</a><a href="${DUO.availability}" target="_blank" rel="noopener noreferrer">10月23日上市报道 ↗</a></div></div></section></main>`;
}

function scenarioControl(key, label, min, max, step, value) {
  const display = key === 'fulfillmentRate' ? `${Math.round(value * 100)}%` : key.includes('Factor') ? Number(value).toFixed(2) : key === 'priceAssumption' ? `$${value}` : value;
  return `<div class="control-row"><div><span>${label}</span><b id="${key}Value">${display}</b></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-scenario-key="${key}" aria-label="${label}"></div>`;
}

function factorCards(state) {
  const forecast = forecastScenario(state.scenario);
  const definitions = [
    { id: 'cost', title: '单台成本趋势及预测', note: '成本先影响价格与毛利情景，不直接决定 SO。', actual: ACTUAL_WEEKS.map((row) => row.cost), future: forecast.map((_, index) => 338 * (1 + 0.006 * (index + 1))), color: '#b45309', value: '每周 +0.6% · 模拟' },
    { id: 'market', title: '终端大盘趋势及预测', note: '只描述终端真实需求，不含产品进出档位的构成效应。', actual: ACTUAL_WEEKS.map((row) => row.market), future: forecast.map((_, index) => 101 * state.scenario.marketFactor * (1 + index * 0.01)), color: '#0070f3', value: `因子 ${state.scenario.marketFactor.toFixed(2)}` },
    { id: 'competition', title: '竞品格局及预测', note: '主要竞品发布、价促和份额变化独立修正我品需求。', actual: ACTUAL_WEEKS.map(() => 100), future: forecast.map(() => 100 * state.scenario.competitionFactor), color: '#0070f3', value: `因子 ${state.scenario.competitionFactor.toFixed(2)}` },
    { id: 'tier', title: '档位构成变化', note: '新品进入、产品退出或迁移档位，不等同于终端需求变化。', actual: ACTUAL_WEEKS.map((_, index) => 100 - Math.max(0, index - 7)), future: forecast.map(() => 100 * state.scenario.tierCompositionFactor), color: '#0070f3', value: `因子 ${state.scenario.tierCompositionFactor.toFixed(2)}` },
    { id: 'supply', title: '可售库存与履约', note: '实际 SO 不能超过可售库存与渠道履约共同约束的上限。', actual: ACTUAL_WEEKS.map((row) => row.inventory), future: forecast.map((row) => row.inventoryAvailableForecast), color: '#b45309', value: `履约率 ${Math.round(state.scenario.fulfillmentRate * 100)}%` },
  ];
  return definitions.map((factor) => `<button class="factor-card ${state.selectedFactor === factor.id ? 'selected' : ''}" data-factor="${factor.id}"><div class="factor-head"><b>${factor.title}</b><span>${factor.value}</span></div>${renderFactorChart(factor.actual, factor.future, factor.color)}<p>${factor.note}</p></button>`).join('');
}

export function soScene(state) {
  const forecast = forecastScenario(state.scenario);
  const series = buildContinuousSeries(ACTUAL_WEEKS, forecast);
  const total = forecast.slice(0, 4).reduce((sum, row) => sum + row.soForecastBase, 0);
  const demand = forecast.reduce((sum, row) => sum + row.unconstrainedDemand, 0);
  const actual = forecast.reduce((sum, row) => sum + row.soForecastBase, 0);
  return `<main class="page-scroll so-page"><div class="page-heading"><div><h1>量价走势 <span class="badge demo">demo · 固定模拟数据</span></h1><p>Pura 90s Pro 连续 SO 主视图 · 实际 W31–W42 + 预测 W43–W50</p></div><div class="grow"></div><button class="btn" data-action="replay">重播预测动效</button></div>
  <div class="so-kpis"><div><span>当前价格假设</span><b id="priceKpi">$${state.scenario.priceAssumption}</b></div><div><span>动态弹性</span><b>${state.scenario.elasticity}</b></div><div><span>未来4周 SO</span><b id="forecastTotal">${(total / 1000).toFixed(1)}K</b></div><div><span>供应满足率</span><b id="supplyRate">${Math.round(actual / demand * 100)}%</b></div><div><span>预测起点</span><b class="mono">2026W42</b></div></div>
  <section class="card so-main-card"><div class="card-head"><div><h2>Pura 90s Pro · 持续监控与滚动预测</h2><p>价格实线接虚线 · 实际 SO 实柱接预测虚线柱 · 同一坐标轴</p></div><div class="chart-legend"><span><i class="legend-line red"></i>价格实际</span><span><i class="legend-line dashed red"></i>价格预测</span><span><i class="legend-bar"></i>SO 实际</span><span><i class="legend-bar dashed"></i>SO 预测</span><span><i class="legend-line dashed blue"></i>无约束需求</span></div></div><div id="soChartContainer">${renderSOChart(series, state.selectedFactor)}</div><div class="chart-foot"><span id="factorAssumption">${state.selectedFactor ? `已选择因素：${state.selectedFactor} · 当前值仅作为预测情景假设` : '点击因素卡可查看当前假设；修改只影响未来预测段'}</span><span>实际 SO = min（无约束需求，可售库存 × 履约率）</span></div></section>
  <section class="scenario-grid"><div class="card controls-card"><div class="card-head"><h2>预测情景控制</h2>${badge('simulated')}</div>${scenarioControl('priceAssumption', '给定价格', 449, 549, 10, state.scenario.priceAssumption)}${scenarioControl('marketFactor', '终端大盘因子', 0.9, 1.1, 0.01, state.scenario.marketFactor)}${scenarioControl('competitionFactor', '竞品格局因子', 0.85, 1.05, 0.01, state.scenario.competitionFactor)}${scenarioControl('tierCompositionFactor', '档位构成因子', 0.85, 1.1, 0.01, state.scenario.tierCompositionFactor)}${scenarioControl('inventoryAvailable', '每周可售库存', 2400, 6000, 200, state.scenario.inventoryAvailable[0])}${scenarioControl('fulfillmentRate', '渠道履约率', 0.6, 1, 0.05, state.scenario.fulfillmentRate)}</div><div class="factor-grid" id="factorCharts">${factorCards(state)}</div></section>
  <section class="card reasons-card"><div class="card-head"><div><h2>本周 SO 下滑的可能原因 <span class="badge demo">非因果定论</span></h2><p>Pura 90s Pro · 2026W42 · SO 环比 −12%（模拟） · 按证据强弱排列</p></div><button class="btn primary" data-action="apply-scenario">作为情景纳入预测</button></div><div class="reasons-grid">${REASONS.map((reason, index) => `<div class="reason"><span>0${index + 1}</span><div><b>${reason.title}</b><p>${reason.detail}</p><em>${reason.strength}</em></div></div>`).join('')}</div><div class="note-box"><b>Price Agent 的谨慎结论</b><br>本周下滑可能与供应收紧、竞品价促和档位构成变化共同相关。当前信息无法确定主因，也不建议把这些因素简单相加为确定的销量贡献。</div></section>
  <div class="so-bottom-grid"><details class="card prior-card"><summary><span><b>Pura 80 Pro · 上一代先验</b><small>查看关键价格节点与弹性先验</small></span><span>弹性 ${PREVIOUS_PRIOR.elasticity} ⌄</span></summary><div class="prior-events">${PREVIOUS_PRIOR.events.map((event) => `<div class="prior-event"><span class="mono">${event.week}</span><b>${event.label}</b><p>${event.note}</p><span>$${event.price} · SO ${event.so}</span></div>`).join('')}</div></details><section class="card events-card"><div class="card-head"><h2>关键事件如何进入预测</h2>${badge('simulated')}</div><div class="event-list">${MARKET_EVENTS.map((event) => `<div class="event-row"><span class="mono">${event.week}</span><div><b>${event.title}</b><p>${event.detail}</p></div><span class="event-status">${event.status === 'actual' ? '已发生' : '情景假设'}</span></div>`).join('')}</div></section></div></main>`;
}

export function closingScene() {
  return `<main class="closing-page"><div class="closing-copy"><div class="eyebrow">PRICELENS · PRICE AGENT</div><h1>从价格监控，到持续经营决策</h1><p>历史可追溯 · 假设可检查 · 预测可修正</p></div><img src="/roadshow/price-agent-rolling-forecast-v2.png" alt="已定稿的全生命周期量价滚动预测逻辑图"></main>`;
}

export function updateScenario(state, key, value) {
  if (key === 'inventoryAvailable') state.scenario.inventoryAvailable = Array(8).fill(Number(value));
  else if (!key.startsWith('__')) state.scenario[key] = Number(value);
  const container = document.querySelector('#soChartContainer');
  if (container) container.innerHTML = renderSOChart(buildContinuousSeries(ACTUAL_WEEKS, forecastScenario(state.scenario)), state.selectedFactor);
  const factors = document.querySelector('#factorCharts');
  if (factors) factors.innerHTML = factorCards(state);
  const forecast = forecastScenario(state.scenario);
  const total = forecast.slice(0, 4).reduce((sum, row) => sum + row.soForecastBase, 0);
  const demand = forecast.reduce((sum, row) => sum + row.unconstrainedDemand, 0);
  const actual = forecast.reduce((sum, row) => sum + row.soForecastBase, 0);
  const set = (selector, text) => { const el = document.querySelector(selector); if (el) el.textContent = text; };
  set('#forecastTotal', `${(total / 1000).toFixed(1)}K`);
  set('#supplyRate', `${Math.round(actual / demand * 100)}%`);
  set('#priceKpi', `$${state.scenario.priceAssumption}`);
  document.querySelectorAll('[data-scenario-key]').forEach((input) => {
    const inputKey = input.dataset.scenarioKey;
    const current = inputKey === 'inventoryAvailable' ? state.scenario.inventoryAvailable[0] : state.scenario[inputKey];
    input.value = current;
    const output = document.querySelector(`#${inputKey}Value`);
    if (output) output.textContent = inputKey === 'fulfillmentRate' ? `${Math.round(current * 100)}%` : inputKey === 'priceAssumption' ? `$${current}` : inputKey.includes('Factor') ? Number(current).toFixed(2) : current;
  });
}

export function initialScenario() {
  return JSON.parse(JSON.stringify(DEFAULT_SCENARIO));
}
