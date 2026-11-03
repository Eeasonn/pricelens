// ============================================================
// 量价预测 · 推演工作台 v2 演示数据（forecast-workbench-v2）
// 正典：pricelens/.impeccable/surfaces/forecast-workbench-v2.md。
// 周历：2026 真实周历（周一锚定 2026-01-05 = W1，W44 = 11-02 周，今天 11-03）；
// 主图窗口 W37–W44（演示实际）+ W45–W52（预测，向未来 8 周）。
// 全部数值为演示（simulated）：销量单位台、价格/成本 USD；只存输入事实，
// 派生值（不含库存限制预测、库存推演、DOS、健康判定、销毛）由 workbenchModel 计算。
// 口径注意（与 brief 一致）：
//   - 大盘 = 总量总线，季度粒度（同比不下钻到周）；
//   - 关键事件 = 大盘图事件（折叠屏阵营 / 内存供应等行业级），幅度 + 时间两参数；
//   - 大促档期（黑五）形状已含在基准走势内，画为主图背景带；
//   - SI 计划为人工输入（库存验证层唯一新输入），其余库存推演来自上游预测。
// ============================================================

/** 演示周：W37–W52，历史（模拟实际）+ 预测。 */
export interface WorkbenchWeek {
  /** 周标签，如 W37。 */
  week: string;
  /** ISO 风格周序号（与 2026 真实周历对齐，W44 = 11-02 周）。 */
  weekNumber: number;
  /** 周一日期展示（MM-DD）。 */
  dateLabel: string;
  status: 'actual' | 'forecast';
  /** 历史周销（台）；预测周为 null（由模型计算）。 */
  sales: number | null;
  /** 价格（USD）：历史实际 + 预测价格计划（黑五价期 W46–W49 = 799）。 */
  price: number;
  /** 上一代同周龄周销（台）；W45 起为已发生历史按周龄映射，不是未来实际。 */
  prevGenSales: number;
}

/** 大盘关键事件（仅行业级；四件套：起周 + 时长 + 脉冲幅度 + 衰减方式，周粒度，可落历史段作解释性标记）。 */
export interface MarketEventSeed {
  id: string;
  label: string;
  /** 起始周（周粒度；允许落在历史段 = 解释性标记，不参与推演修正）。 */
  startWeek: number;
  /** 影响时长（周）。 */
  durationWeeks: number;
  /** 脉冲幅度峰值（%，正 = 抬升总量，负 = 压低）。 */
  magnitudePct: number;
  /** 衰减方式：递减（默认，线性衰减）/ 恒定。 */
  decay: 'decreasing' | 'flat';
}

/** 主图小事件（产品级三类：竞品上市 / 营销价促 / 自家品挤兑；录入时弹参考品事实回放）。 */
export interface ProductEventSeed {
  id: string;
  /** 事件类型（决定回放场景与锚点色）。 */
  type: 'competitor-launch' | 'own-promo' | 'cannibalization';
  label: string;
  /** 锚定预测周。 */
  week: number;
  /** 影响幅度（%，参考回放段预填，可改）。 */
  magnitudePct: number;
  /** 回放场景 id（fixture.replayScenarios）。 */
  replayId: string;
}

/** 参考卡事实锚（参照对象历史窗内的可观测事实：大促 / 发布 / 调价）。 */
export interface ReferenceFactSeed {
  label: string;
  /** 历史窗内周序号（0 = W37 … 7 = W44）。 */
  weekIndex: number;
  type: 'promo' | 'launch' | 'price';
}

/** 大盘季度指数（单序列：2025Q1 起连贯到当前实际；2026Q4 / 2027Q1 由模型推演）。 */
export interface MarketQuarterSeed {
  /** 季度键，如 '2025Q1'。 */
  key: string;
  /** 季度指数（实际值）。 */
  value: number;
}

/** 量价参照小图序列（演示参照对象，可下拉切换）。 */
export interface ReferenceSeriesSeed {
  id: string;
  label: string;
  /** W37–W52 与主品同窗对齐的周销（台）。 */
  points: number[];
}

export interface WorkbenchFixture {
  meta: {
    status: 'simulated';
    modelVersion: string;
    source: string;
    generatedAt: string;
    currency: string;
    note: string;
  };
  context: {
    country: string;
    industry: string;
    channel: string;
    product: string;
    prevGenProduct: string;
    competitor: string;
    priceBand: string;
    todayLabel: string;
    currentWeek: string;
    historyRange: string;
    forecastRange: string;
  };
  weeks: WorkbenchWeek[];
  /** 大促档期背景带（黑五 11-27 主峰在 W47）。 */
  promoBand: { label: string; startWeek: number; endWeek: number; peakWeek: number; peakNote: string };
  market: {
    quarters: MarketQuarterSeed[];
    /** AI 时间序列基线说明（周期性季节因素 × 全局性趋势因素，挂 AI 标）。 */
    aiRationale: string;
  };
  defaultMarketEvents: MarketEventSeed[];
  /** 月版本成本（USD/台），按周所属月份取版本。 */
  costVersions: Array<{ monthLabel: string; fromWeek: number; unitCost: number }>;
  /** 基准走势（台，W45–W52）：大盘延续 + 黑五形状 + 上一代同期形态（演示口径），未含参数调整。 */
  basePath: number[];
  inventory: {
    /** W37 期初渠道库存（台）。 */
    initialChannelInv: number;
    /** 历史 SI（台，0 = 无补货周，图上不画 ▼）。 */
    historySi: number[];
    /** 人工 SI 月计划初始值（台）：11 月 = W45–W48，12 月 = W49–W52。 */
    siPlanMonthly: Record<string, number>;
    /** 全流程 DOS 演示系数（含机关已产出未发货）。 */
    fullDosFactor: number;
  };
  references: {
    prevGenPool: ReferenceSeriesSeed[];
    competitorPool: ReferenceSeriesSeed[];
    /** 参照对象历史窗内的事实锚（事实还原：大促 / 发布 / 调价，与主图事件同源色系）。 */
    facts: ReferenceFactSeed[];
  };
  /** 主图小事件录入的事实回放场景（四类解释场景，全部为历史事实段）。 */
  replayScenarios: Array<{
    id: string;
    /** 匹配的主图事件类型。 */
    match: ProductEventSeed['type'];
    title: string;
    /** 回放说明（参照对象 + 当时情境）。 */
    desc: string;
    /** 回放段周销（台，8 点历史段）。 */
    points: number[];
    refLabel: string;
    /** 当时影响（对同类主品的冲击读数）。 */
    impactPct: number;
    impactWeeks: number;
    impactText: string;
  }>;
  /** 预测窗按月拆分（SI 按月给入 = 唯一人工输入）。 */
  forecastMonths: Array<{ key: string; label: string; weekNumbers: number[] }>;
  /** 主图锚点事件行（图下名录）。 */
  anchors: Array<{ week: number; label: string }>;
}

const HISTORY_SALES = [18, 26, 33, 38, 36, 34, 39, 43].map((v) => v * 1000);
const HISTORY_PRICES = [899, 899, 899, 899, 899, 849, 849, 849];
const FORECAST_PRICES = [849, 799, 799, 799, 799, 849, 849, 849];
const PREV_GEN = [15, 22, 29, 34, 37, 39, 41, 43, 45, 47, 49, 52, 50, 46, 42, 39].map((v) => v * 1000);
const BASE_PATH = [47, 52, 66, 55, 50, 47, 45, 43].map((v) => v * 1000);

/** 周一日期：W1 = 2026-01-05，逐周 +7 天。 */
function mondayLabel(weekNumber: number): string {
  const date = new Date(Date.UTC(2026, 0, 5 + (weekNumber - 1) * 7));
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

const weeks: WorkbenchWeek[] = Array.from({ length: 16 }, (_, index) => {
  const weekNumber = 37 + index;
  const isHistory = index < 8;
  return {
    week: `W${weekNumber}`,
    weekNumber,
    dateLabel: mondayLabel(weekNumber),
    status: isHistory ? ('actual' as const) : ('forecast' as const),
    sales: isHistory ? HISTORY_SALES[index] : null,
    price: isHistory ? HISTORY_PRICES[index] : FORECAST_PRICES[index - 8],
    prevGenSales: PREV_GEN[index],
  };
});

export const workbenchFixture: WorkbenchFixture = {
  meta: {
    status: 'simulated',
    modelVersion: 'workbench-demo-v2',
    source: 'demo_seed_v2',
    generatedAt: '2026-11-03',
    currency: 'USD',
    note: '演示数据：大盘、参照、库存与 SI 计划均为演示假设，不代表真实市场、销量、库存或利润。',
  },
  context: {
    country: '俄罗斯',
    industry: '手机',
    channel: '全渠道',
    product: 'HUAWEI Mate 90 · 12+512GB',
    prevGenProduct: 'HUAWEI Mate 80 · 12+512GB',
    competitor: 'iPhone 18 Pro',
    priceBand: 'USD 750–900',
    todayLabel: '11-03',
    currentWeek: 'W44',
    historyRange: 'W37–W44',
    forecastRange: 'W45–W52',
  },
  weeks,
  promoBand: { label: '黑五档期 11.14–12.02', startWeek: 46, endWeek: 49, peakWeek: 47, peakNote: '主峰 11-27（黑五）' },
  market: {
    quarters: [
      { key: '2025Q1', value: 115 },
      { key: '2025Q2', value: 113 },
      { key: '2025Q3', value: 111 },
      { key: '2025Q4', value: 116 },
      { key: '2026Q1', value: 108 },
      { key: '2026Q2', value: 106 },
      { key: '2026Q3', value: 104 },
    ],
    aiRationale:
      'AI 初始推演（第一版，可修改）：纯时间序列口径 = 周期性季节因素（去年 Q4/Q3、Q1/Q4 季节比）× 全局性趋势因素（今年/去年同比水平比）；下方关键事件为人工录入假设，可增删改。',
  },
  defaultMarketEvents: [
    { id: 'ev-fold', label: '折叠屏阵营扩容', startWeek: 46, durationWeeks: 5, magnitudePct: 8, decay: 'decreasing' },
    { id: 'ev-mem', label: '内存供应涨价', startWeek: 50, durationWeeks: 3, magnitudePct: -6, decay: 'decreasing' },
  ],
  costVersions: [
    { monthLabel: '9 月版本', fromWeek: 37, unitCost: 612 },
    { monthLabel: '10 月版本', fromWeek: 41, unitCost: 598 },
    { monthLabel: '11 月版本', fromWeek: 45, unitCost: 591 },
    { monthLabel: '12 月版本', fromWeek: 49, unitCost: 585 },
  ],
  basePath: BASE_PATH,
  inventory: {
    initialChannelInv: 147000,
    historySi: [16, 22, 28, 34, 30, 20, 24, 26].map((v) => v * 1000),
    /** 人工 SI 月计划初始值（台）：11 月 = W45–W48，12 月 = W49–W52。 */
    siPlanMonthly: { '2026-11': 220000, '2026-12': 32000 },
    fullDosFactor: 1.45,
  },
  forecastMonths: [
    { key: '2026-11', label: '11 月（W45–W48）', weekNumbers: [45, 46, 47, 48] },
    { key: '2026-12', label: '12 月（W49–W52）', weekNumbers: [49, 50, 51, 52] },
  ],
  references: {
    prevGenPool: [
      { id: 'ref-mate80', label: 'Mate 80（上一代）', points: PREV_GEN },
      { id: 'ref-pura90', label: 'Pura 90 Pro（上上代）', points: [14, 20, 26, 30, 33, 35, 36, 38, 40, 42, 44, 46, 45, 43, 40, 37].map((v) => v * 1000) },
    ],
    competitorPool: [
      { id: 'ref-ip17', label: 'iPhone 17 上市同期', points: [12, 18, 25, 31, 29, 27, 26, 28, 26, 25, 27, 30, 28, 26, 24, 22].map((v) => v * 1000) },
      { id: 'ref-s25', label: 'Galaxy S25 促销期', points: [20, 21, 22, 28, 26, 25, 24, 26, 25, 24, 26, 29, 27, 25, 23, 21].map((v) => v * 1000) },
    ],
    facts: [
      { label: 'Mate 80 官方降价（上一代）', weekIndex: 5, type: 'price' },
      { label: 'Galaxy S25 促销期', weekIndex: 3, type: 'promo' },
      { label: 'Galaxy 新配色上市', weekIndex: 1, type: 'launch' },
    ],
  },
  replayScenarios: [
    {
      id: 'rp-comp-promo',
      match: 'competitor-launch',
      title: '友商促销 / 新品上市期',
      desc: 'Galaxy S25 上市 + 首销促销期（去年 W40–W44），同档位友商放量、我司同期被分流。',
      points: [26, 28, 31, 34, 30, 27, 26, 25].map((v) => v * 1000),
      refLabel: 'Galaxy S25 · 上市促销段',
      impactPct: -6,
      impactWeeks: 4,
      impactText: '当时对同期我司旗舰的冲击约 −6%，持续 4 周，2 周后回到原趋势',
    },
    {
      id: 'rp-own-marketing',
      match: 'own-promo',
      title: '自家营销 / 官方价促',
      desc: 'Mate 80 官方降价促销（去年 W40–W44），降价次周起销量明显抬升。',
      points: [30, 29, 33, 39, 43, 45, 42, 40].map((v) => v * 1000),
      refLabel: 'Mate 80 · 官方价促段',
      impactPct: 15,
      impactWeeks: 3,
      impactText: '当时降价后 3 周销量 +15%~+23%，随促销退坡回落',
    },
    {
      id: 'rp-cannib',
      match: 'cannibalization',
      title: '自家品挤兑',
      desc: 'Pura 90 Pro 上市挤兑同期 Mate 80（价格带重叠 $750–850）。',
      points: [34, 33, 30, 27, 26, 27, 28, 29].map((v) => v * 1000),
      refLabel: 'Mate 80 · 被挤兑段',
      impactPct: -9,
      impactWeeks: 3,
      impactText: '当时被挤兑 −9%，持续 3 周；家族合计份额仍 +1.8pt',
    },
    {
      id: 'rp-promo-sale',
      match: 'own-promo',
      title: '大促降价（档期脉冲）',
      desc: '去年黑五档期（W46–W49）降价脉冲，主峰周抬升显著。',
      points: [38, 42, 52, 58, 47, 41, 38, 36].map((v) => v * 1000),
      refLabel: 'Mate 80 · 去年黑五段',
      impactPct: 30,
      impactWeeks: 4,
      impactText: '档期脉冲峰值 +35%，档期后 2 周回落',
    },
  ],
  anchors: [
    { week: 42, label: '调价 −$50（899→849）' },
    { week: 46, label: '黑五档期 11.14–12.02 · 主峰 W47（11-27）' },
  ],
};
