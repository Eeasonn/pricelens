import { transitionAgent, canApplyFilters } from './agentMachine.js';
import { DEFAULT_SCENARIO, forecastScenario, buildContinuousSeries } from './scenario.js';
import { RECORDING_SHOTS, recordingDuration, validateRecordingShots } from './recording.js';
import { ACTUAL_WEEKS, PREVIOUS_PRIOR, MARKET_EVENTS, REASONS, PROMO_ALERT, FX_ALERT, FX_POINTS, MEMORY_RANGES, MARKET_TIERS, DUO } from './data.js';
import { renderSOChart, renderFactorChart, renderFxChart, renderPriceDemoChart } from './charts.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const timers = new Set();
const state = {
  scene: 'agent-fullscreen',
  agentState: 'agent-fullscreen-empty',
  mode: 'fullscreen',
  agentHidden: false,
  messages: [],
  unread: 0,
  scenario: clone(DEFAULT_SCENARIO),
  selectedFactor: null,
  split: false,
  promo: true,
  benefits: false,
  rangeStart: 19,
  recordingIndex: 0,
  recordingPlaying: false,
  directorVisible: true,
};

function later(callback, delay) {
  const timer = setTimeout(() => {
    timers.delete(timer);
    callback();
  }, delay);
  timers.add(timer);
  return timer;
}

function icon(name) {
  const paths = {
    spark: '<path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17.5v.1"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    expand: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    send: '<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.spark}</svg>`;
}

function statusBadge(kind) {
  if (kind === 'real') return '<span class="badge real">真实资料</span>';
  if (kind === 'mixed') return '<span class="badge mixed">真实数据 · 模拟规则</span>';
  return '<span class="badge demo">模拟数据</span>';
}

function topChrome() {
  return `<header class="topbar"><div class="brandline"><span class="wordmark">PriceLens</span><span class="scope">单国家分析</span><span class="divider"></span><button class="country">欧亚 / R国 <span>⌄</span></button></div><div class="topactions"><nav><button data-scene="price" class="${state.scene === 'price' ? 'active' : ''}">价格分析</button><button data-scene="intel" class="${state.scene === 'intel' ? 'active' : ''}">情报中心</button><button>配置</button><button>预警</button></nav><a class="real-link" href="http://localhost:5174/" target="_blank" rel="noopener noreferrer">真实 PriceLens ↗</a><button class="agent-launcher" data-action="open-agent">${icon('spark')}Price Agent${state.unread ? `<span class="unread">${state.unread}</span>` : ''}</button></div></header>`;
}

function priceScene() {
  return `<main class="page-scroll"><div class="filters"><button class="filter"><span class="muted">产业</span>手机 ⌄</button><button class="filter product"><i class="dot red"></i><b>Huawei Pura 90s Pro · 全部型号</b><span class="muted">vs 自动竞品</span></button><div class="seg"><span>本币</span><span class="on">USD</span></div><button class="auto">自动</button><button class="filter mono" id="rangeLabel">2026W${state.rangeStart} → 2026W42</button><button class="btn" data-action="template">全部存为模板</button><button class="btn" data-action="clear">清空</button></div>
  <section class="card"><nav class="chart-tabs"><button class="active">价格走势</button><button data-scene="so">量价走势（demo）</button><button class="disabled">定价推演</button></nav><div class="chart-body"><div class="toolbar"><button class="btn ${state.split ? 'on' : ''}" data-action="split">${icon('chart')}${state.split ? '合并' : '分图'}</button><button class="btn ${state.promo ? 'on' : ''}" data-action="promo">大促档期</button><button class="btn ${state.benefits ? 'on' : ''}" data-action="benefits">促销权益</button><button class="btn" data-action="save-view">保存当前视图</button><div class="grow"></div><button class="btn link">多平台对比 →</button></div><div class="legend"><span class="product-chip main"><i class="dot red"></i><b>Pura 90s Pro</b><small>全部型号</small></span><span class="muted">vs</span><span class="product-chip"><i class="dot"></i><b>iPhone 17 Pro</b><small>自动匹配</small></span><span class="product-chip"><i class="dot blue"></i><b>S26 Ultra</b><small>自动匹配</small></span></div><div class="chart-stage" id="priceChartArea">${renderPriceDemoChart(state)}<div class="chart-tooltip" id="chartTooltip"></div></div><div class="brush"><div class="brush-track"></div><div class="brush-controls"><span class="mono">2026W${state.rangeStart}</span><input type="range" min="19" max="35" value="${state.rangeStart}" data-range="start" aria-label="调整时间轴起点"><span class="mono">2026W42</span></div></div></div></section>
  <section class="card detail-card"><div class="card-head"><h2>价差与明细</h2>${statusBadge('simulated')}<div class="grow"></div><button class="btn" data-action="copy">复制明细</button></div><div class="table-scroll"><table><thead><tr><th>产品</th><th>配置</th><th>类型</th><th>2026W42</th><th>2026W41</th><th>上期环比</th><th>来源</th></tr></thead><tbody><tr><td>Pura 90s Pro</td><td>12+256 GB</td><td>我司</td><td>$1,021</td><td>$1,030</td><td class="blue-text">↓ 0.9%</td><td><button class="source-link" data-action="source">DNS 商品页 ${icon('link')}</button></td></tr><tr><td>iPhone 17 Pro</td><td>12+256 GB</td><td>竞品</td><td>$1,345</td><td>$1,458</td><td class="amber-text">↓ 7.8%</td><td><button class="source-link" data-action="source">查看依据</button></td></tr></tbody></table></div></section></main>`;
}

function intelScene() {
  return `<main class="page-scroll intel-page"><div class="page-heading"><div><div class="eyebrow">INTELLIGENCE CENTER / RUSSIA</div><h1>情报中心 <span class="badge real">R国</span></h1><p>汇率、产业大盘、上游成本和新品事件在同一分析上下文 · 截至 2026-10-29</p></div><div class="grow"></div><button class="btn" data-action="fx-alert">${icon('alert')}模拟汇率推送</button><button class="btn primary" data-scene="so">${icon('spark')}进入 SO 预测</button></div>
  <div class="kpi-grid"><div class="kpi"><span>USD / RUB ${statusBadge('real')}</span><b>80.8664</b><small>年初至今 +2.63% · 卢布兑美元走弱</small></div><div class="kpi"><span>年内官方汇率区间 ${statusBadge('real')}</span><b class="small-value">70.7902–86.9963</b><small>5月22日低点 / 9月3日高点</small></div><div class="kpi"><span>R国手机大盘 ${statusBadge('simulated')}</span><b>1.86M <em>台</em></b><small>最近4周 · 环比 +3.2% · 仅演示</small></div><div class="kpi"><span>4Q26 DRAM 合约价 ${statusBadge('real')}</span><b>+10–15%</b><small>QoQ · TrendForce 2026-09-30</small></div></div>
  <div class="intel-grid"><section class="card intel-card wide"><div class="card-head"><div><h2>俄罗斯卢布兑美元汇率</h2><p>USD/RUB · 数值越高表示 1 美元可兑换更多卢布 · 俄罗斯央行官方汇率</p></div><a href="https://www.cbr.ru/eng/currency_base/dynamics/" target="_blank" rel="noopener noreferrer">CBR 数据源 ↗</a></div><div class="fx-summary"><b>80.8664</b><span>RUB / USD · 10月29日</span><em>10月8日以来 −5.40%</em></div>${renderFxChart(FX_POINTS)}<div class="fx-events"><div><b>70.7902 · 5月22日</b>年内官方汇率低点</div><div><b>86.9963 · 9月3日</b>年内官方汇率高点</div><div><b>80.8664 · 10月29日</b>10月高位后回落</div></div><div class="forecast-strip"><span>2026 全年均值 · 分析师预测 <b>80.0</b></span><span>2026 Q4 隐含均值 <b>85.3</b></span><span>2027 年均值 · 分析师预测 <b>89.4</b></span><a href="https://www.cbr.ru/eng/statistics/ddkp/mo_br/" target="_blank" rel="noopener noreferrer">宏观调查 ↗</a></div></section>
  <section class="card intel-card"><div class="card-head"><div><h2>全球存储市场变动 ${statusBadge('real')}</h2><p>DRAM / NAND Flash 合约价季度环比预测区间</p></div><a href="https://www.trendforce.com/presscenter/news/20260930-13258.html" target="_blank" rel="noopener noreferrer">TrendForce ↗</a></div><div class="memory-list">${MEMORY_RANGES.map((row) => `<a class="memory-row" href="${row.url}" target="_blank" rel="noopener noreferrer"><span>${row.quarter}</span><b>${row.dram}</b><b>${row.nand}</b><span>↗</span></a>`).join('')}</div><div class="memory-legend"><span><i class="dot blue"></i>DRAM</span><span><i class="dot amber"></i>NAND Flash</span></div><div class="note-box"><b>对手机成本的含义</b><br>AI 与服务器需求持续挤占先进产能，移动 DRAM 供应仍紧；但前期大涨已计入，4Q 增速趋缓。NAND 涨幅在 4Q 高于 DRAM。用于单台成本模型时应转换为“情景假设”，而非直接叠加百分比。</div></section>
  <section class="card intel-card"><div class="card-head"><div><h2>R国分产业、分价格档位大盘 ${statusBadge('simulated')}</h2><p>最近4周销量规模、环比与我司份额 · 仅用于界面和预测逻辑演示</p></div></div><div class="tier-head"><span>价格档位</span><span>规模（千台）</span><span>环比</span><span>我司份额</span></div>${MARKET_TIERS.map((row) => `<div class="tier-row"><span>${row.tier}</span><div class="tier-bar"><i style="width:${Math.round(row.value / 6.5)}%"></i><span>${row.value}</span></div><span>${row.change}</span><span>${row.share}</span></div>`).join('')}<div class="note-box demo-box">模拟口径：全渠道 Sell-Out，不代表真实市场统计。档位下降可能来自终端需求缩减，也可能来自产品退出或迁移；档位增长也可能来自新品进入。</div></section></div>
  <section class="card duo-card"><div class="duo-visual"><img src="${DUO.image}" alt="Apple 官方 iPhone Duo 两种配色" referrerpolicy="no-referrer"></div><div class="duo-content"><div class="eyebrow">NEW PRODUCT INTELLIGENCE · APPLE OFFICIAL</div><h2>iPhone Duo</h2>${statusBadge('real')}<p>7.6 英寸内屏与 5.4 英寸外屏，搭载 A20 Pro。美国起售价 $1,999；10 月 16 日开启预订，10 月 23 日首批上市。作为超高端新品事件，可联动观察 R国 $2K+ 档位的价格锚与供应变化。</p><div class="duo-specs"><div><b>7.6″</b><span>OLED 折叠内屏</span></div><div><b>5.4″</b><span>外屏</span></div><div><b>A20 Pro</b><span>2nm 芯片</span></div><div><b>$1,999</b><span>美国起售价</span></div></div><div class="note-box demo-box">R国上市时间、当地售价和渠道供货未在引用的 Apple 资料中确认；这里仅作为全球新品情报，不写成“已在 R国上市”。</div><div class="duo-links"><a href="${DUO.news}" target="_blank" rel="noopener noreferrer">Apple 官方发布 ↗</a><a href="${DUO.specs}" target="_blank" rel="noopener noreferrer">技术规格 ↗</a><a href="${DUO.availability}" target="_blank" rel="noopener noreferrer">10月23日上市报道 ↗</a></div></div></section></main>`;
}

function scenarioForecast() {
  return forecastScenario(state.scenario);
}

function soSeries() {
  return buildContinuousSeries(ACTUAL_WEEKS, scenarioForecast());
}

function factorCards() {
  const forecast = scenarioForecast();
  const definitions = [
    { id: 'cost', title: '单台成本趋势及预测', note: '成本先影响价格与毛利情景，不直接决定 SO。', actual: ACTUAL_WEEKS.map((row) => row.cost), future: forecast.map((_, index) => 338 * (1 + 0.006 * (index + 1))), color: '#b45309', value: '每周 +0.6% · 模拟' },
    { id: 'market', title: '终端大盘趋势及预测', note: '只描述终端真实需求，不含产品进出档位的构成效应。', actual: ACTUAL_WEEKS.map((row) => row.market), future: forecast.map((_, index) => 101 * state.scenario.marketFactor * (1 + index * 0.01)), color: '#0070f3', value: `因子 ${state.scenario.marketFactor.toFixed(2)}` },
    { id: 'competition', title: '竞品格局及预测', note: '主要竞品发布、价促和份额变化独立修正我品需求。', actual: ACTUAL_WEEKS.map(() => 100), future: forecast.map(() => 100 * state.scenario.competitionFactor), color: '#0070f3', value: `因子 ${state.scenario.competitionFactor.toFixed(2)}` },
    { id: 'tier', title: '档位构成变化', note: '新品进入、产品退出或迁移档位，不等同于终端需求变化。', actual: ACTUAL_WEEKS.map((_, index) => 100 - Math.max(0, index - 7)), future: forecast.map(() => 100 * state.scenario.tierCompositionFactor), color: '#0070f3', value: `因子 ${state.scenario.tierCompositionFactor.toFixed(2)}` },
    { id: 'supply', title: '可售库存与履约', note: '实际 SO 不能超过可售库存与渠道履约共同约束的上限。', actual: ACTUAL_WEEKS.map((row) => row.inventory), future: forecast.map((row) => row.inventoryAvailableForecast), color: '#b45309', value: `履约率 ${Math.round(state.scenario.fulfillmentRate * 100)}%` },
  ];
  return definitions.map((factor) => `<button class="factor-card ${state.selectedFactor === factor.id ? 'selected' : ''}" data-factor="${factor.id}"><div class="factor-head"><b>${factor.title}</b><span>${factor.value}</span></div>${renderFactorChart(factor.actual, factor.future, factor.color)}<p>${factor.note}</p></button>`).join('');
}

function soScene() {
  const forecast = scenarioForecast();
  const total = forecast.slice(0, 4).reduce((sum, row) => sum + row.soForecastBase, 0);
  const demand = forecast.reduce((sum, row) => sum + row.unconstrainedDemand, 0);
  const actual = forecast.reduce((sum, row) => sum + row.soForecastBase, 0);
  return `<main class="page-scroll so-page"><div class="page-heading"><div><h1>量价走势 <span class="badge demo">demo · 固定模拟数据</span></h1><p>Pura 90s Pro 连续 SO 主视图 · 实际 W31–W42 + 预测 W43–W50</p></div><div class="grow"></div><button class="btn" data-action="replay">重播预测动效</button></div>
  <div class="so-kpis"><div><span>当前价格假设</span><b id="priceKpi">$${state.scenario.priceAssumption}</b></div><div><span>动态弹性</span><b>${state.scenario.elasticity}</b></div><div><span>未来4周 SO</span><b id="forecastTotal">${(total / 1000).toFixed(1)}K</b></div><div><span>供应满足率</span><b id="supplyRate">${Math.round(actual / demand * 100)}%</b></div><div><span>预测起点</span><b class="mono">2026W42</b></div></div>
  <section class="card so-main-card"><div class="card-head"><div><h2>Pura 90s Pro · 持续监控与滚动预测</h2><p>价格实线接虚线 · 实际 SO 实柱接预测虚线柱 · 同一坐标轴</p></div><div class="chart-legend"><span><i class="legend-line red"></i>价格实际</span><span><i class="legend-line dashed red"></i>价格预测</span><span><i class="legend-bar"></i>SO 实际</span><span><i class="legend-bar dashed"></i>SO 预测</span><span><i class="legend-line dashed blue"></i>无约束需求</span></div></div><div id="soChartContainer">${renderSOChart(soSeries(), state.selectedFactor)}</div><div class="chart-foot"><span id="factorAssumption">${state.selectedFactor ? `已选择因素：${state.selectedFactor} · 高亮其预测假设` : '点击因素卡可查看当前假设；修改只影响未来预测段'}</span><span>实际 SO = min（无约束需求，可售库存 × 履约率）</span></div></section>
  <section class="scenario-grid"><div class="card controls-card"><div class="card-head"><h2>预测情景控制</h2>${statusBadge('simulated')}</div>${scenarioControl('priceAssumption', '给定价格', 449, 549, 10, state.scenario.priceAssumption, '$')}${scenarioControl('marketFactor', '终端大盘因子', 0.9, 1.1, 0.01, state.scenario.marketFactor, '×')}${scenarioControl('competitionFactor', '竞品格局因子', 0.85, 1.05, 0.01, state.scenario.competitionFactor, '×')}${scenarioControl('tierCompositionFactor', '档位构成因子', 0.85, 1.1, 0.01, state.scenario.tierCompositionFactor, '×')}${scenarioControl('inventoryAvailable', '每周可售库存', 2400, 6000, 200, state.scenario.inventoryAvailable[0], '')}${scenarioControl('fulfillmentRate', '渠道履约率', 0.6, 1, 0.05, state.scenario.fulfillmentRate, '%')}</div><div class="factor-grid" id="factorCharts">${factorCards()}</div></section>
  <section class="card reasons-card"><div class="card-head"><div><h2>本周 SO 下滑的可能原因 <span class="badge demo">非因果定论</span></h2><p>Pura 90s Pro · 2026W42 · SO 环比 −12%（模拟） · 按证据强弱排列</p></div><button class="btn primary" data-action="apply-scenario">作为情景纳入预测</button></div><div class="reasons-grid">${REASONS.map((reason, index) => `<div class="reason"><span>0${index + 1}</span><div><b>${reason.title}</b><p>${reason.detail}</p><em>${reason.strength}</em></div></div>`).join('')}</div><div class="note-box"><b>Price Agent 的谨慎结论</b><br>本周下滑可能与供应收紧、竞品价促和档位构成变化共同相关。当前信息无法确定主因，也不建议把这些因素简单相加为确定的销量贡献。</div></section>
  <div class="so-bottom-grid"><details class="card prior-card"><summary><span><b>Pura 80 Pro · 上一代先验</b><small>查看关键价格节点与弹性先验</small></span><span>弹性 ${PREVIOUS_PRIOR.elasticity} ⌄</span></summary><div class="prior-events">${PREVIOUS_PRIOR.events.map((event) => `<div class="prior-event"><span class="mono">${event.week}</span><b>${event.label}</b><p>${event.note}</p><span>$${event.price} · SO ${event.so}</span></div>`).join('')}</div></details><section class="card events-card"><div class="card-head"><h2>关键事件如何进入预测</h2>${statusBadge('simulated')}</div><div class="event-list">${MARKET_EVENTS.map((event) => `<div class="event-row"><span class="mono">${event.week}</span><div><b>${event.title}</b><p>${event.detail}</p></div><span class="event-status">${event.status === 'actual' ? '已发生' : '情景假设'}</span></div>`).join('')}</div></section></div></main>`;
}

function scenarioControl(key, label, min, max, step, value, unit) {
  const display = key === 'fulfillmentRate' ? `${Math.round(value * 100)}%` : key.includes('Factor') ? Number(value).toFixed(2) : value;
  return `<div class="control-row"><div><span>${label}</span><b id="${key}Value">${unit === '$' ? '$' : ''}${display}</b></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-scenario-key="${key}" aria-label="${label}"></div>`;
}

function closingScene() {
  return `<main class="closing-page"><div class="closing-copy"><div class="eyebrow">PRICELENS · PRICE AGENT</div><h1>从价格监控，到持续经营决策</h1><p>历史可追溯 · 假设可检查 · 预测可修正</p></div><img src="/roadshow/price-agent-rolling-forecast-v2.png" alt="已定稿的全生命周期量价滚动预测逻辑图"></main>`;
}

function renderBoard() {
  const board = $('#board');
  if (state.mode === 'fullscreen') {
    board.classList.remove('visible');
    board.innerHTML = '';
    return;
  }
  board.classList.add('visible');
  board.classList.toggle('agent-hidden', state.agentHidden);
  const content = state.scene === 'intel' ? intelScene() : state.scene === 'so' ? soScene() : state.scene === 'closing' ? closingScene() : priceScene();
  board.innerHTML = `${topChrome()}<div class="scene-content">${content}</div>`;
  bindPriceHover();
}

function renderAlert(message) {
  return `<article class="message-alert" data-message-id="${message.id}"><div class="alert-head"><span class="alert-symbol">${icon('alert')}</span><div><b>${message.title}</b><small>${message.time}</small></div><div class="grow"></div>${statusBadge(message.dataStatus)}</div><div class="alert-context">${message.product}</div><div class="alert-headline">${message.headline}</div><ul>${message.details.map((detail) => `<li>${detail}</li>`).join('')}</ul><div class="alert-explain"><b>Price Agent 解释</b><p>${message.explanation}</p></div><div class="alert-actions"><button class="btn primary" data-action="${message.id === 'alert-fx-w42' ? 'intel' : 'locate'}">${message.id === 'alert-fx-w42' ? '进入情报中心' : '查看价格点'}</button><button class="btn" data-action="ask-alert">追问 Agent</button></div></article>`;
}

function renderMessages() {
  return state.messages.map((message) => {
    if (message.kind === 'proactive-alert') return renderAlert(message);
    if (message.kind === 'scenario-summary') return `<div class="agent-answer scenario-summary"><b>已作为情景纳入，而非确认因果</b><p>${message.body}</p></div>`;
    if (message.kind === 'user') return `<div class="user-message">${message.body}</div>`;
    return `<div class="agent-answer">${message.body}</div>`;
  }).join('');
}

function renderAgent() {
  const shell = $('#agentShell');
  shell.className = `agent-shell ${state.mode === 'fullscreen' ? 'fullscreen' : 'dock'}${state.agentHidden ? ' hidden' : ''}`;
  const body = $('#agentBody');
  if (state.mode === 'fullscreen') {
    if (state.agentState === 'agent-fullscreen-empty' || state.agentState === 'agent-fullscreen-listening') {
      body.innerHTML = `<div class="voice-home"><div class="agent-orb">${icon('mic')}</div><div class="eyebrow">PRICELENS · PRICE AGENT</div><h1>从一句话，开始价格分析</h1><p>试着说：“我要查看 R 国的 Pura 90s Pro 价格情况”</p><button class="voice-button ${state.agentState === 'agent-fullscreen-listening' ? 'listening' : ''}" data-action="voice">${icon('mic')}<span>${state.agentState === 'agent-fullscreen-listening' ? '正在聆听…' : '点击开始语音输入'}</span></button><div class="transcript ${state.agentState === 'agent-fullscreen-listening' ? 'active' : ''}" id="transcript">${state.agentState === 'agent-fullscreen-listening' ? '正在识别中文语音…' : '语音识别为确定性模拟，不请求麦克风权限'}</div></div>`;
    } else {
      body.innerHTML = `<div class="full-preview"><div class="eyebrow">TRANSCRIPT CONFIRMED</div><div class="preview-user">我要查看 R 国的 Pura 90s Pro 价格情况。</div><div class="preview-answer"><h2>已为您找到 Pura 90s Pro 全部型号的价格走势</h2><p>并自动带出 iPhone 17 Pro、Samsung S26 Ultra 等竞品。您可以基于实际情况，在筛选器中修改产品。</p><div class="preview-grid"><div><span>国家与产业</span><b>R国 / 手机</b></div><div><span>主分析产品</span><b>Pura 90s Pro · 全部型号</b></div><div><span>自动竞品</span><b>iPhone 17 Pro / S26 Ultra</b></div><div><span>当前口径</span><b>USD · 自动时间范围</b></div></div><button class="btn primary large" data-action="apply">应用到看板 ${icon('arrow')}</button><button class="btn large" data-action="reset">重新输入</button></div></div>`;
    }
    return;
  }
  body.innerHTML = `<div class="context"><div>${icon('link')}跟随当前看板<span>每次提问保存快照</span></div><div class="chips"><span class="chip blue">R国 · 手机</span><span class="chip">Pura 90s Pro</span><span class="chip">全部型号</span><span class="chip">USD</span></div></div><div class="messages" role="log" aria-live="off">${renderMessages()}</div><div class="composer"><div class="composer-box"><button data-action="voice-disabled" aria-label="语音输入（模拟）">${icon('mic')}</button><textarea aria-label="向 Price Agent 提问" placeholder="继续询问价格、图表或预警…"></textarea><button class="send" aria-label="发送">${icon('send')}</button></div><small>数字由 PriceLens 数据与模拟情景计算 · 请核对口径与证据</small></div>`;
}

function renderDirector() {
  const director = $('#director');
  director.classList.toggle('hidden', !state.directorVisible);
  const shot = RECORDING_SHOTS[state.recordingIndex];
  $('#shotProgress').textContent = `${String(state.recordingIndex + 1).padStart(2, '0')} / 14 · ${shot.id} · ${(recordingDuration([shot]) / 1000).toFixed(0)}s`;
  $('#recordingTotal').textContent = `${(recordingDuration(RECORDING_SHOTS) / 1000).toFixed(0)}s`;
  $('#playRecording').textContent = state.recordingPlaying ? '暂停' : '播放主片';
  $$('#director [data-scene]').forEach((button) => button.classList.toggle('active', button.dataset.scene === state.scene || (button.dataset.scene === 'alerts' && state.scene === 'alerts')));
}

function startVoice() {
  if (state.agentState !== 'agent-fullscreen-empty') return;
  state.agentState = transitionAgent(state.agentState, 'START_VOICE');
  renderAgent();
  later(() => { $('#transcript').textContent = '“我要查看 R 国的……”'; }, 650);
  later(() => { $('#transcript').textContent = '“我要查看 R 国的 Pura 90s Pro……”'; }, 1300);
  later(() => {
    $('#transcript').textContent = '“我要查看 R 国的 Pura 90s Pro 价格情况。”';
    state.agentState = transitionAgent(state.agentState, 'TRANSCRIPT_READY');
  }, 2050);
  later(() => {
    state.agentState = transitionAgent(state.agentState, 'PREVIEW_READY');
    renderAgent();
  }, 2650);
}

function applyFilters() {
  if (!canApplyFilters(state.agentState)) return;
  state.agentState = transitionAgent(state.agentState, 'APPLY');
  if (!state.messages.some((message) => message.kind === 'user')) {
    state.messages.push({ kind: 'user', body: '我要查看 R 国的 Pura 90s Pro 价格情况。' });
    state.messages.push({ kind: 'answer', body: '<b>已为您找到 Pura 90s Pro 全部型号的价格走势，</b>并自动带出 iPhone 17 Pro、Samsung S26 Ultra 等竞品。您可以基于实际情况，在筛选器中修改产品。' });
  }
  state.mode = 'transitioning';
  renderAgent();
  later(() => {
    state.scene = 'price';
    renderBoard();
  }, 120);
  later(() => {
    state.mode = 'dock';
    state.agentState = transitionAgent(state.agentState, 'TRANSITION_COMPLETE');
    renderAgent();
  }, 850);
}

function addAlert(alert) {
  if (state.messages.some((message) => message.id === alert.id)) return;
  state.messages.push(clone(alert));
  state.unread += 1;
  renderAgent();
  renderBoard();
}

function setScene(scene) {
  if (scene === 'closing') {
    state.scene = 'closing';
    state.mode = 'dock';
    state.agentHidden = true;
    renderBoard();
    renderDirector();
    return;
  }
  if (state.mode === 'fullscreen') return;
  state.mode = 'dock';
  state.agentHidden = scene === 'closing';
  state.scene = scene;
  if (scene === 'alerts') addAlert(PROMO_ALERT);
  if (scene === 'intel') addAlert(FX_ALERT);
  state.unread = 0;
  renderBoard();
  renderAgent();
  renderDirector();
}

function updateScenario(key, value) {
  if (key === 'inventoryAvailable') state.scenario.inventoryAvailable = Array(8).fill(Number(value));
  else state.scenario[key] = Number(value);
  const container = $('#soChartContainer');
  if (container) container.innerHTML = renderSOChart(soSeries(), state.selectedFactor);
  const factors = $('#factorCharts');
  if (factors) factors.innerHTML = factorCards();
  const forecast = scenarioForecast();
  const total = forecast.slice(0, 4).reduce((sum, row) => sum + row.soForecastBase, 0);
  const demand = forecast.reduce((sum, row) => sum + row.unconstrainedDemand, 0);
  const actual = forecast.reduce((sum, row) => sum + row.soForecastBase, 0);
  if ($('#forecastTotal')) $('#forecastTotal').textContent = `${(total / 1000).toFixed(1)}K`;
  if ($('#supplyRate')) $('#supplyRate').textContent = `${Math.round(actual / demand * 100)}%`;
  if ($('#priceKpi')) $('#priceKpi').textContent = `$${state.scenario.priceAssumption}`;
  syncScenarioControls();
}

function syncScenarioControls() {
  $$('[data-scenario-key]').forEach((input) => {
    const key = input.dataset.scenarioKey;
    const value = key === 'inventoryAvailable' ? state.scenario.inventoryAvailable[0] : state.scenario[key];
    input.value = value;
    const output = $(`#${key}Value`);
    if (output) output.textContent = key === 'fulfillmentRate' ? `${Math.round(value * 100)}%` : key === 'priceAssumption' ? `$${value}` : key.includes('Factor') ? Number(value).toFixed(2) : value;
  });
}

function applyMarketScenario() {
  updateScenario('marketFactor', 0.98);
  updateScenario('competitionFactor', 0.95);
  updateScenario('tierCompositionFactor', 0.97);
  updateScenario('inventoryAvailable', 3200);
  state.messages.push({ kind: 'scenario-summary', body: '终端大盘 0.98、竞品格局 0.95、档位构成 0.97、每周可售库存 3,200 台。上述参数仅用于比较预测情景，不能视为本周 SO 下滑的确定解释。' });
  renderAgent();
  $('#soChartContainer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function bindPriceHover() {
  const area = $('#priceChartArea');
  const tip = $('#chartTooltip');
  if (!area || !tip) return;
  area.addEventListener('pointermove', (event) => {
    const rect = area.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const week = Math.round(19 + 23 * ratio);
    tip.innerHTML = `<b>2026W${week}</b><span>Pura 90s Pro <strong>$${Math.round(1021 + (42 - week) * 4)}</strong></span><span>iPhone 17 Pro <strong>$${Math.round(1345 + (42 - week) * 9)}</strong></span><small>DNS · 折后在架价 · 模拟</small>`;
    tip.style.left = `${Math.min(rect.width - 190, Math.max(8, event.clientX - rect.left + 12))}px`;
    tip.style.top = `${Math.max(8, event.clientY - rect.top - 58)}px`;
    tip.classList.add('show');
  });
  area.addEventListener('pointerleave', () => tip.classList.remove('show'));
}

function goToShot(index) {
  if (index >= RECORDING_SHOTS.length) {
    state.recordingPlaying = false;
    renderDirector();
    return;
  }
  state.recordingIndex = index;
  const shot = RECORDING_SHOTS[index];
  if (shot.scene === 'agent-fullscreen') {
    if (shot.id === 'opening') resetOpening(true);
    if (shot.id === 'voice') startVoice();
  } else if (shot.scene === 'transition') {
    applyFilters();
  } else {
    setScene(shot.scene);
  }
  renderDirector();
  if (state.recordingPlaying) later(() => goToShot(index + 1), shot.durationMs);
}

function playRecording() {
  state.recordingPlaying = !state.recordingPlaying;
  if (state.recordingPlaying) {
    if (state.recordingIndex >= RECORDING_SHOTS.length - 1) state.recordingIndex = 0;
    goToShot(state.recordingIndex);
  } else {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
  }
  renderDirector();
}

function resetOpening(preservePlayback = false) {
  const recordingPlaying = preservePlayback ? state.recordingPlaying : false;
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  Object.assign(state, {
    scene: 'agent-fullscreen', agentState: 'agent-fullscreen-empty', mode: 'fullscreen', agentHidden: false,
    messages: [], unread: 0, scenario: clone(DEFAULT_SCENARIO), selectedFactor: null,
    split: false, promo: true, benefits: false, rangeStart: 19, recordingPlaying, recordingIndex: 0,
  });
  renderBoard();
  renderAgent();
  renderDirector();
}

function showTitleTransition() {
  const overlay = $('#titleTransition');
  overlay.classList.add('show');
  later(() => overlay.classList.remove('show'), 1200);
}

function toast(text) {
  const element = $('#toast');
  element.textContent = text;
  element.classList.add('show');
  later(() => element.classList.remove('show'), 2400);
}

document.addEventListener('click', (event) => {
  const sceneButton = event.target.closest('[data-scene]');
  if (sceneButton) {
    setScene(sceneButton.dataset.scene);
    return;
  }
  const factorButton = event.target.closest('[data-factor]');
  if (factorButton) {
    state.selectedFactor = state.selectedFactor === factorButton.dataset.factor ? null : factorButton.dataset.factor;
    updateScenario('__highlight__', 0);
    $('#factorAssumption').textContent = state.selectedFactor ? `已选择因素：${state.selectedFactor} · 当前值仅作为预测情景假设` : '点击因素卡可查看当前假设；修改只影响未来预测段';
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'voice') startVoice();
  if (action === 'apply') applyFilters();
  if (action === 'reset') resetOpening();
  if (action === 'open-agent') {
    state.agentHidden = false;
    state.unread = 0;
    renderAgent();
    renderBoard();
  }
  if (action === 'close-agent') {
    state.agentHidden = true;
    renderAgent();
    renderBoard();
  }
  if (action === 'split') { state.split = !state.split; renderBoard(); }
  if (action === 'promo') { state.promo = !state.promo; renderBoard(); }
  if (action === 'benefits') { state.benefits = !state.benefits; renderBoard(); }
  if (action === 'template') toast('已将当前全部产品组合存为模板');
  if (action === 'save-view') toast('当前视图已保存');
  if (action === 'clear') toast('已清空产品 · 可手动选择 Pura 80（补充镜头）');
  if (action === 'copy') toast('明细已复制（演示）');
  if (action === 'source') $('#sourceDialog').showModal();
  if (action === 'close-source') $('#sourceDialog').close();
  if (action === 'intel') setScene('intel');
  if (action === 'fx-alert') addAlert(FX_ALERT);
  if (action === 'locate') toast('已定位 iPhone 17 Pro · 2026W42 价格点');
  if (action === 'ask-alert') toast('已将预警上下文带入当前对话');
  if (action === 'apply-scenario') applyMarketScenario();
  if (action === 'replay') updateScenario('__replay__', 0);
  if (action === 'voice-disabled') toast('语音模拟请在开场全屏中演示');
});

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-range="start"]')) {
    state.rangeStart = Number(event.target.value);
    renderBoard();
  }
  if (event.target.matches('[data-scenario-key]')) updateScenario(event.target.dataset.scenarioKey, event.target.value);
});

$('#playRecording').addEventListener('click', playRecording);
$('#resetRecording').addEventListener('click', resetOpening);
$('#titleButton').addEventListener('click', showTitleTransition);
$('#hideDirector').addEventListener('click', () => {
  state.directorVisible = !state.directorVisible;
  renderDirector();
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('textarea,input')) return;
  const key = event.key.toLowerCase();
  if (key === '1') setScene('price');
  if (key === '2') setScene('alerts');
  if (key === '3') setScene('intel');
  if (key === '4') setScene('so');
  if (key === 'v') startVoice();
  if (key === 's') { state.split = !state.split; renderBoard(); }
  if (key === 'p') { state.promo = !state.promo; renderBoard(); }
  if (key === 'o') { state.benefits = !state.benefits; renderBoard(); }
  if (key === 'r') updateScenario('__replay__', 0);
  if (key === 't') showTitleTransition();
  if (key === 'h') { state.directorVisible = !state.directorVisible; renderDirector(); }
  if (event.key === 'Escape') {
    if ($('#sourceDialog').open) $('#sourceDialog').close();
    $('#titleTransition').classList.remove('show');
  }
});

const validation = validateRecordingShots(RECORDING_SHOTS);
if (!validation.valid) throw new Error(validation.errors.join('；'));
renderBoard();
renderAgent();
renderDirector();
