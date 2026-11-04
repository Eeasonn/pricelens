export const ACTUAL_WEEKS = [
  { week: '202631', price: 529, so: 1800, cost: 312, market: 100, inventory: 6200 },
  { week: '202632', price: 529, so: 1950, cost: 313, market: 101, inventory: 6100 },
  { week: '202633', price: 519, so: 2300, cost: 314, market: 102, inventory: 5900 },
  { week: '202634', price: 519, so: 2400, cost: 316, market: 102, inventory: 5700 },
  { week: '202635', price: 509, so: 2900, cost: 318, market: 103, inventory: 5500 },
  { week: '202636', price: 509, so: 3200, cost: 320, market: 104, inventory: 5300 },
  { week: '202637', price: 499, so: 3600, cost: 323, market: 104, inventory: 5100 },
  { week: '202638', price: 499, so: 3500, cost: 326, market: 105, inventory: 4900 },
  { week: '202639', price: 489, so: 4500, cost: 329, market: 104, inventory: 4700 },
  { week: '202640', price: 499, so: 4100, cost: 332, market: 103, inventory: 4500 },
  { week: '202641', price: 499, so: 4000, cost: 335, inventory: 4300, market: 102 },
  { week: '202642', price: 499, so: 4200, cost: 338, inventory: 4000, market: 101 },
];

export const PREVIOUS_PRIOR = {
  product: 'Pura 80 Pro',
  elasticity: -2.1,
  events: [
    { week: '202631', label: '首次降价叠加平台大促', price: 449, so: 3300, note: '降价与平台流量可能共同放大需求，不能全部计为自然弹性。' },
    { week: '202637', label: '大促降价，SO 增幅扩大', price: 399, so: 4100, note: '作为促销弹性参考，但在模型中降权，避免高估日常弹性。' },
    { week: '202641', label: '成本上行，价格部分传导', price: 389, so: 3900, note: '清库或竞争压力可能优先于成本传导，价格成本空间被压缩。' },
  ],
};

export const MARKET_EVENTS = [
  { week: '202635', type: 'promo', title: '平台大促', detail: '价格和流量同时变化，历史解释需拆分自然弹性与活动弹性。', status: 'actual', strength: 'medium' },
  { week: '202639', type: 'supply', title: '锁量释放', detail: '可售库存改善，SO 增长不能全部解释为价格弹性。', status: 'actual', strength: 'strong' },
  { week: '202642', type: 'competitor-price', title: '主要竞品价促', detail: 'iPhone 17 Pro 模拟降价并叠加权益，可能削弱我品相对竞争力。', status: 'actual', strength: 'medium' },
  { week: '202642', type: 'tier-exit', title: '产品退出或迁移档位', detail: '档位规模下降可能来自构成效应，不一定等于终端需求流失。', status: 'actual', strength: 'unknown' },
  { week: '202645', type: 'competitor-launch', title: '竞品新品进入（预测）', detail: '可能抬高档位规模，同时增加我品份额压力。', status: 'assumption', strength: 'unknown' },
  { week: '202647', type: 'supply', title: '预计补货（预测）', detail: '到货情景改善可售库存，实际 SO 仍取决于无约束需求。', status: 'assumption', strength: 'medium' },
];

export const REASONS = [
  { title: '供应约束可能直接限制实际 SO', detail: '本周锁量模拟下调 18%，即使无约束需求不变，实际 SO 也可能下降。', strength: '证据较强' },
  { title: '主要竞品价促可能分流需求', detail: 'iPhone 17 Pro 模拟降价 7.8% 并叠加权益，可能削弱我品相对竞争力。', strength: '证据中等' },
  { title: '档位规模下降不一定等于需求流失', detail: '$400–600 档位模拟缩减 6%，同期 2 款产品退出或迁移档位，构成效应尚待拆分。', strength: '待核实' },
  { title: '新品进入也可能改变竞争基盘', detail: '新进入产品带来档位规模增长时，我品仍可能因份额被稀释而下滑。', strength: '待核实' },
];

export const PROMO_ALERT = {
  id: 'alert-promo-w42',
  kind: 'proactive-alert',
  title: '主动预警 · 竞品位促',
  time: '今天 10:42',
  dataStatus: 'simulated',
  product: 'iPhone 17 Pro · R国 / DNS / 2026W42',
  headline: '$1,458 → $1,345 · 降幅 7.8%',
  details: ['平台券：满 $1,200 减 $80', '以旧换新：最高补贴 $120', '与 Pura 的相对价差：$324'],
  explanation: '标价调整和平台权益共同影响到手价。价格竞争力可能增强，但现有数据不能证明 SO 必然提升，建议继续观察后续 SO 与供应。',
  unread: true,
};

export const FX_ALERT = {
  id: 'alert-fx-w42',
  kind: 'proactive-alert',
  title: '主动预警 · 汇率波动',
  time: '今天 10:48',
  dataStatus: 'mixed',
  product: 'USD / RUB · R国 / 2026W42',
  headline: '年内官方汇率区间 70.7902–86.9963',
  details: ['10月8日：85.4811', '10月29日：80.8664', '期间回落 5.40% · 预警规则为模拟'],
  explanation: '波动会影响本币报价和进口成本情景，但不能直接推导终端涨价。建议结合存储成本、大盘和新品事件继续分析。',
  unread: true,
};

export const FX_POINTS = [
  ['01-13', 78.7913], ['01-29', 76.2662], ['02-14', 77.1944], ['02-28', 77.2736],
  ['03-14', 80.2254], ['03-20', 84.8379], ['04-01', 81.2504], ['04-17', 76.0861],
  ['05-01', 74.8014], ['05-22', 70.7902], ['06-02', 71.5532], ['06-19', 73.3591],
  ['06-30', 77.7539], ['07-15', 77.4912], ['07-31', 79.8573], ['08-08', 82.1665],
  ['08-18', 85.0136], ['08-29', 85.6007], ['09-03', 86.9963], ['09-11', 84.3508],
  ['09-30', 84.4283], ['10-08', 85.4811], ['10-15', 83.9497], ['10-23', 81.1255], ['10-29', 80.8664],
];

export const MEMORY_RANGES = [
  { quarter: '1Q26', dram: '90–95%', nand: '55–60%', url: 'https://www.trendforce.com/presscenter/news/20260202-12911.html' },
  { quarter: '2Q26', dram: '58–63%', nand: '70–75%', url: 'https://www.trendforce.com/presscenter/news/20260331-12995.html' },
  { quarter: '3Q26', dram: '13–18%', nand: '10–15%', url: 'https://www.trendforce.com/presscenter/news/20260703-13134.html' },
  { quarter: '4Q26', dram: '10–15%', nand: '15–20%', url: 'https://www.trendforce.com/presscenter/news/20260930-13258.html' },
];

export const MARKET_TIERS = [
  { tier: '<$300', value: 612, change: '+2%', share: '18%' },
  { tier: '$300–600', value: 498, change: '+5%', share: '24%' },
  { tier: '$600–1K', value: 351, change: '+4%', share: '16%' },
  { tier: '$1K+', value: 229, change: '−1%', share: '9%' },
  { tier: '$2K+', value: 170, change: '+8%', share: '3%' },
];

export const DUO = {
  image: 'https://www.apple.com/newsroom/images/2026/09/apple-unveils-iphone-duo/article/Apple-iPhone-Duo-colors-260909_big.jpg.large.jpg',
  news: 'https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/',
  specs: 'https://www.apple.com/iphone-duo/specs/',
  availability: 'https://www.apple.com/newsroom/2026/10/iphone-duo-arrives-at-apple-store-locations-worldwide/',
};
