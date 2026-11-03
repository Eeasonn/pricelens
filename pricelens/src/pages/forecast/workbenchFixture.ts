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

/** 大盘关键事件（幅度 + 时间两参数，衰减曲率不做 —— brief 拍板）。 */
export interface MarketEventSeed {
  id: string;
  label: string;
  /** 影响幅度（%，正 = 抬升总量，负 = 压低）。 */
  magnitudePct: number;
  /** 生效周（W45–W52 内）。 */
  startWeek: number;
}

/** 大盘季度对照（去年线 vs 今年线，季度粒度）。 */
export interface MarketQuarterSeed {
  label: string;
  /** 去年（2025）季度指数。 */
  lastYear: number;
  /** 今年（2026）季度指数；Q4 为推演值（null 由模型按环比降幅计算）。 */
  thisYear: number | null;
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
    /** AI 判断的初始 Q4 环比降幅（%，负 = 下滑）；人工改动后转「人工确认」。 */
    baselineQoqDeclinePct: number;
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
    /** 人工 SI 计划初始值（台，W45–W52）。 */
    siPlan: number[];
    /** 全流程 DOS 演示系数（含机关已产出未发货）。 */
    fullDosFactor: number;
  };
  references: {
    prevGenPool: ReferenceSeriesSeed[];
    competitorPool: ReferenceSeriesSeed[];
  };
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
      { label: 'Q1', lastYear: 115, thisYear: 108 },
      { label: 'Q2', lastYear: 113, thisYear: 106 },
      { label: 'Q3', lastYear: 111, thisYear: 104 },
      { label: 'Q4', lastYear: 116, thisYear: null },
    ],
    baselineQoqDeclinePct: -4,
    aiRationale:
      'AI 初始判断：今年 Q4 延续 Q3 弱势、环比 −4%（去年 Q4 旺季基数 116，同比约 −14%）；黑五档期热度按近两届取中，竞品新机分流已在事件中单列。',
  },
  defaultMarketEvents: [
    { id: 'ev-fold', label: '折叠屏阵营扩容', magnitudePct: 8, startWeek: 47 },
    { id: 'ev-mem', label: '内存供应涨价', magnitudePct: -6, startWeek: 50 },
  ],
  costVersions: [
    { monthLabel: '9 月版本', fromWeek: 37, unitCost: 612 },
    { monthLabel: '10 月版本', fromWeek: 41, unitCost: 598 },
    { monthLabel: '11 月版本', fromWeek: 45, unitCost: 591 },
    { monthLabel: '12 月版本', fromWeek: 49, unitCost: 585 },
  ],
  basePath: BASE_PATH,
  inventory: {
    initialChannelInv: 285000,
    historySi: [33, 46, 58, 73, 66, 44, 49, 53].map((v) => v * 1000),
    siPlan: [62, 74, 110, 90, 66, 0, 0, 0].map((v) => v * 1000),
    fullDosFactor: 1.45,
  },
  references: {
    prevGenPool: [
      { id: 'ref-mate80', label: 'Mate 80（上一代）', points: PREV_GEN },
      { id: 'ref-pura90', label: 'Pura 90 Pro（上上代）', points: [14, 20, 26, 30, 33, 35, 36, 38, 40, 42, 44, 46, 45, 43, 40, 37].map((v) => v * 1000) },
    ],
    competitorPool: [
      { id: 'ref-ip17', label: 'iPhone 17 上市同期', points: [12, 18, 25, 31, 29, 27, 26, 28, 26, 25, 27, 30, 28, 26, 24, 22].map((v) => v * 1000) },
      { id: 'ref-s25', label: 'Galaxy S25 促销期', points: [20, 21, 22, 28, 26, 25, 24, 26, 25, 24, 26, 29, 27, 25, 23, 21].map((v) => v * 1000) },
    ],
  },
  anchors: [
    { week: 42, label: '调价 −$50（899→849）' },
    { week: 46, label: '黑五档期 11.14–12.02 · 主峰 W47（11-27）' },
  ],
};
