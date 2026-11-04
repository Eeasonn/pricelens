// ============================================================
// 量价预测 · 推演工作台 v2 演示数据（forecast-workbench-v2）
// 正典：pricelens/.impeccable/surfaces/forecast-workbench-v2.md。
// 周历：2026 真实周历（周一锚定 2026-01-05 = W1，W44 = 11-02 周，今天 11-03）；
// 主图窗口 W37–W44（演示实际）+ W45–W52（预测，向未来 8 周）。
// 全部数值为演示（simulated）：销量单位台、价格/成本 USD；只存输入事实，
// 派生值（不含库存限制预测、库存推演、DOS、健康判定、销毛）由 workbenchModel 计算。
// 口径注意（与 brief 一致）：
//   - 大盘 = 总量总线；2026-11-04 拍板后主序列为**月粒度**（历史月 + 未来 4
//     个季度逐月预测），market.quarters 保留（季度基线 = 月分布的聚合口径，
//     与主链 q4/q1 单格口径一致）；market.months = 历史月度模拟样本
//     （季内三月均值恒等于季度值，构造守恒），预测月由 workbenchModel 按
//     季度基线 × 去年同季月形分布生成（确定性外推，禁随机）——模拟外推口径
//     注释见 market.monthlyNote；
//   - 关键事件：行业级周口径四件套（marketEvents，主链既有输入）保留；
//     2026-11-04 拍板新增人工月度事件三字段（起始月/日 + 时长（月）+ 幅度%，
//     名称选填），月中起始按日均摊（首月影响 × 覆盖天数 ÷ 当月天数），
//     默认演示事件锚定 2027-01-29（主链预测窗 W45–W52 之外，不改基准数字）；
//   - 大促档期（黑五）形状已含在基准走势内，画为主图背景带；
//   - SI 计划为人工输入（库存验证层唯一新输入），其余库存推演来自上游预测。
//   - 参考池：lifecyclePool = 全生命周期量价（52 周 × ≥4 产品，含档期带与
//     事件锚，A1 参考卡重构新增）；prevGenPool / competitorPool 保留（主链
//     比值校正与事件回放仍消费）。
// ============================================================

/** 演示周：W37–W52，历史（模拟实际）+ 预测。 */
export interface WorkbenchWeek {
  /** 周标签，如 W37。 */
  week: string;
  /** ISO 风格周序号（与 2026 真实周历对齐，W44 = 11-02 周）。 */
  weekNumber: number;
  /** 周一完整日期（YYYY-MM-DD）；季度与时间边界从该日期推导（workbenchTime）。 */
  date: string;
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

/**
 * 大盘人工月度事件（2026-11-04 评审拍板的极简三字段）：
 * 起始时间（月/日）+ 持续时长（月）+ 影响幅度%；事件名称选填（可为 ''）。
 * 月中起始按日均摊口径生效（见 workbenchModel.marketMonthEventFactor），
 * 衰减固定递减（三字段不再暴露衰减选择）。
 */
export interface MarketMonthEventSeed {
  id: string;
  /** 事件名称（选填；空 = UI 显示「未命名事件」）。 */
  label: string;
  /** 起始月（YYYY-MM，如 '2027-01'）。 */
  startMonth: string;
  /** 起始日（1–31；超出当月天数按当月末日处理）。 */
  startDay: number;
  /** 持续时长（月，≥1）。 */
  durationMonths: number;
  /** 影响幅度（%，正 = 抬升大盘，负 = 压低）。 */
  magnitudePct: number;
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

/** 大盘月度指数（主序列：历史月为模拟样本；预测月由模型按季度基线月分布生成）。 */
export interface MarketMonthSeed {
  /** 月键，如 '2025-01'。 */
  key: string;
  /** 月度指数（模拟实际）。 */
  value: number;
}

/** 量价参照小图序列（演示参照对象，可下拉切换）。 */
export interface ReferenceSeriesSeed {
  id: string;
  label: string;
  /** W37–W52 与主品同窗对齐的周销（台）。 */
  points: number[];
}

/** 生命周期事件锚（四类：竞品上市 / 品上市 / 促销 / 挤兑；智能弹框组稿用）。 */
export interface LifecycleEventSeed {
  /** 稳定 id（产品内唯一）：本地覆写层（referenceWorkspace overrides）以此为锚，
   *  不使用可编辑的周、类型或标题作 key。 */
  id: string;
  /** 生命周期周序（0 = 上市首周）。 */
  week: number;
  type: 'competitor-launch' | 'own-launch' | 'promo' | 'cannibalization';
  label: string;
  /** 参考影响读数（演示预标，%）：对同类主品的对应情境影响。 */
  impactPct?: number;
  /** 影响持续周数。 */
  impactWeeks?: number;
}

/** 生命周期大促档期带（琥珀背景带 + 档期价）。 */
export interface LifecyclePromoBandSeed {
  label: string;
  startWeek: number;
  endWeek: number;
  /** 档期内价格直降（USD）。 */
  priceDrop?: number;
}

/** 全生命周期参考产品（量柱 + 价格线 + 档期带 + 事件锚的数据源）。 */
export interface LifecycleProductSeed {
  id: string;
  label: string;
  brand: string;
  /** 上市周标签（如 2025-W02），仅作上下文展示。 */
  launchWeekLabel: string;
  /** 全生命周期周销（台，周序 0 起；null = 缺采周，显示「—」不造 0）。 */
  points: Array<number | null>;
  /** 全生命周期价格（USD，与 points 同周序对齐；null = 缺采周，不造 0）。 */
  pricePoints: Array<number | null>;
  /** 大促档期带（生命周期周序）。 */
  promoBands: LifecyclePromoBandSeed[];
  /** 事件锚（四类各 ≥1 覆盖于池内）。 */
  events: LifecycleEventSeed[];
  /** 进主链的 prevGenPool 映射 id（选择写入 prevGenReferenceId）；缺省 = 纯对照。 */
  chainRefId?: string;
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
    /**
     * 历史月度主序列（2025-01–2026-09，模拟样本）：季内三月均值恒等于季度值
     * （偏差三元组逐季轮换、合计为 0，构造守恒）。预测月不在 fixture 存储，
     * 由 workbenchModel.marketQuarterForecast + computeMarketMonths 确定性生成
     * （未来 4 个季度 = 2026-10–2027-09）。
     */
    months: MarketMonthSeed[];
    /** 月度序列模拟外推口径注释（显式声明，非静默造数）。 */
    monthlyNote: string;
    /** AI 时间序列基线说明（周期性季节因素 × 全局性趋势因素，挂 AI 标）。 */
    aiRationale: string;
  };
  defaultMarketEvents: MarketEventSeed[];
  /** 人工月度事件预填（三字段极简口径；默认演示事件在主链预测窗之外，不改基准数字）。 */
  defaultMarketMonthEvents: MarketMonthEventSeed[];
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
    /** 全生命周期参考池（≥4 产品 × 52 周量价 + 档期带 + 事件锚；参考卡自由选择）。 */
    lifecyclePool: LifecycleProductSeed[];
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

/** 周一日期：W1 = 2026-01-05，逐周 +7 天；同时产出完整 date（YYYY-MM-DD）与 MM-DD 展示标签。 */
function mondayParts(weekNumber: number): { date: string; dateLabel: string } {
  const iso = new Date(Date.UTC(2026, 0, 5 + (weekNumber - 1) * 7)).toISOString().slice(0, 10);
  return { date: iso, dateLabel: iso.slice(5) };
}

// ============================================================
// 全生命周期参考池（A1 参考卡重构新增）：≥4 个可参考产品 × 52 周量价 +
// 大促档期带 + 事件锚（竞品上市 / 品上市 / 促销 / 挤兑四类于池内各 ≥1）。
// 形状 = 首销爬坡（0–7 周）→ 平台波动（8–31）→ 生命末期衰减（32–51）
// + 档期脉冲 + 事件凹坑；随机成分来自固定种子 LCG（mulberry32），
// 同种子恒同序列——数据完全确定性。周序相对上市周（0 = 上市首周）。
// ============================================================

const LIFECYCLE_WEEKS = 52;

/** 固定种子 LCG（mulberry32）：确定性伪随机，同种子恒同序列。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 全生命周期周销：爬坡 → 平台波动 → 衰减 + 档期脉冲 + 事件凹坑 + 缺采周。 */
function lifecycleVolumes(seed: number, cfg: {
  /** 爬坡顶（首销峰，台）。 */
  peak: number;
  /** 平台期基准（台）。 */
  base: number;
  /** 生命末期衰减底线系数（×base）。 */
  floor: number;
  /** 档期脉冲幅度（档期末周 ×1.1、其余周 ×0.9）。 */
  promoPulse: number;
  promoBands: LifecyclePromoBandSeed[];
  /** 事件凹坑（pct 为负 = 压低）。 */
  dips: Array<{ week: number; weeks: number; pct: number }>;
  /** 缺采周（null，不造 0）。 */
  missingWeeks?: number[];
}): Array<number | null> {
  const rand = mulberry32(seed);
  const out: Array<number | null> = [];
  for (let w = 0; w < LIFECYCLE_WEEKS; w++) {
    let v: number;
    if (w < 8) v = (0.55 + (w / 7) * 0.45) * cfg.peak;
    else if (w < 32) v = cfg.base * (0.92 + rand() * 0.16);
    else v = (1 - (1 - cfg.floor) * ((w - 32) / (LIFECYCLE_WEEKS - 33))) * cfg.base * (0.9 + rand() * 0.2);
    for (const band of cfg.promoBands) {
      if (w >= band.startWeek && w <= band.endWeek) v *= 1 + cfg.promoPulse * (w === band.endWeek ? 1.1 : 0.9);
    }
    for (const dip of cfg.dips) {
      if (w >= dip.week && w < dip.week + dip.weeks) v *= 1 + dip.pct;
    }
    out.push(Math.max(1000, Math.round(v / 100) * 100));
  }
  for (const week of cfg.missingWeeks ?? []) if (week >= 0 && week < LIFECYCLE_WEEKS) out[week] = null;
  return out;
}

/** 全生命周期价格：阶梯调价表（week 起生效）+ 档期直降。 */
function lifecyclePrices(launch: number, cuts: Array<{ week: number; price: number }>, promoBands: LifecyclePromoBandSeed[]): Array<number | null> {
  const out: number[] = [];
  for (let w = 0; w < LIFECYCLE_WEEKS; w++) {
    let price = launch;
    for (const cut of cuts) if (w >= cut.week) price = cut.price;
    for (const band of promoBands) if (w >= band.startWeek && w <= band.endWeek) price -= band.priceDrop ?? 0;
    out.push(price);
  }
  return out;
}

const lifecyclePool: LifecycleProductSeed[] = [
  {
    id: 'lc-mate80',
    label: 'Mate 80（上一代）',
    brand: 'HUAWEI',
    launchWeekLabel: '2025-W02',
    chainRefId: 'ref-mate80',
    points: lifecycleVolumes(101, {
      peak: 44000,
      base: 36000,
      floor: 0.55,
      promoPulse: 0.42,
      promoBands: [
        { label: '618 档期', startWeek: 22, endWeek: 25, priceDrop: 50 },
        { label: '黑五档期', startWeek: 46, endWeek: 49, priceDrop: 100 },
      ],
      dips: [
        { week: 18, weeks: 4, pct: -0.06 },
        { week: 34, weeks: 3, pct: -0.09 },
      ],
    }),
    pricePoints: lifecyclePrices(899, [{ week: 16, price: 849 }], [
      { label: '618 档期', startWeek: 22, endWeek: 25, priceDrop: 50 },
      { label: '黑五档期', startWeek: 46, endWeek: 49, priceDrop: 100 },
    ]),
    promoBands: [
      { label: '618 档期', startWeek: 22, endWeek: 25, priceDrop: 50 },
      { label: '黑五档期', startWeek: 46, endWeek: 49, priceDrop: 100 },
    ],
    events: [
      { id: 'ev-m80-launch', week: 0, type: 'own-launch', label: '上市首销', impactPct: 30, impactWeeks: 4 },
      { id: 'ev-m80-s26', week: 18, type: 'competitor-launch', label: 'Galaxy S26 上市', impactPct: -6, impactWeeks: 4 },
      { id: 'ev-m80-618', week: 22, type: 'promo', label: '618 档期脉冲', impactPct: 42, impactWeeks: 4 },
      { id: 'ev-m80-pura90', week: 34, type: 'cannibalization', label: 'Pura 90 上市挤兑', impactPct: -9, impactWeeks: 3 },
      { id: 'ev-m80-bf', week: 46, type: 'promo', label: '黑五档期脉冲', impactPct: 46, impactWeeks: 4 },
    ],
  },
  {
    id: 'lc-pura90',
    label: 'Pura 90 Pro（上上代）',
    brand: 'HUAWEI',
    launchWeekLabel: '2024-W40',
    chainRefId: 'ref-pura90',
    points: lifecycleVolumes(202, {
      peak: 39000,
      base: 32000,
      floor: 0.5,
      promoPulse: 0.38,
      promoBands: [
        { label: '618 档期', startWeek: 20, endWeek: 23, priceDrop: 50 },
        { label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 80 },
      ],
      dips: [{ week: 38, weeks: 3, pct: -0.07 }],
    }),
    pricePoints: lifecyclePrices(849, [{ week: 18, price: 799 }], [
      { label: '618 档期', startWeek: 20, endWeek: 23, priceDrop: 50 },
      { label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 80 },
    ]),
    promoBands: [
      { label: '618 档期', startWeek: 20, endWeek: 23, priceDrop: 50 },
      { label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 80 },
    ],
    events: [
      { id: 'ev-p90-launch', week: 0, type: 'own-launch', label: '上市首销', impactPct: 26, impactWeeks: 4 },
      { id: 'ev-p90-618', week: 20, type: 'promo', label: '618 档期脉冲', impactPct: 38, impactWeeks: 4 },
      { id: 'ev-p90-m80', week: 38, type: 'cannibalization', label: 'Mate 80 上市挤兑', impactPct: -7, impactWeeks: 3 },
      { id: 'ev-p90-d11', week: 44, type: 'promo', label: '双11 档期脉冲', impactPct: 38, impactWeeks: 4 },
    ],
  },
  {
    id: 'lc-s25',
    label: 'Galaxy S25（友商同期）',
    brand: 'SAMSUNG',
    launchWeekLabel: '2025-W06',
    points: lifecycleVolumes(303, {
      peak: 36000,
      base: 30000,
      floor: 0.6,
      promoPulse: 0.5,
      promoBands: [
        { label: '首销促销', startWeek: 1, endWeek: 4, priceDrop: 60 },
        { label: '黑五档期', startWeek: 46, endWeek: 49, priceDrop: 110 },
      ],
      dips: [{ week: 30, weeks: 3, pct: -0.05 }],
    }),
    pricePoints: lifecyclePrices(999, [{ week: 20, price: 949 }], [
      { label: '首销促销', startWeek: 1, endWeek: 4, priceDrop: 60 },
      { label: '黑五档期', startWeek: 46, endWeek: 49, priceDrop: 110 },
    ]),
    promoBands: [
      { label: '首销促销', startWeek: 1, endWeek: 4, priceDrop: 60 },
      { label: '黑五档期', startWeek: 46, endWeek: 49, priceDrop: 110 },
    ],
    events: [
      { id: 'ev-s25-launch', week: 0, type: 'competitor-launch', label: '上市首销', impactPct: -6, impactWeeks: 4 },
      { id: 'ev-s25-promo', week: 1, type: 'promo', label: '首销促销期', impactPct: -6, impactWeeks: 4 },
      { id: 'ev-s25-edge', week: 30, type: 'competitor-launch', label: 'Galaxy S25 Edge 上市', impactPct: -5, impactWeeks: 3 },
      { id: 'ev-s25-bf', week: 46, type: 'promo', label: '黑五档期促销', impactPct: -7, impactWeeks: 3 },
    ],
  },
  {
    id: 'lc-ip17',
    label: 'iPhone 17（友商同期）',
    brand: 'APPLE',
    launchWeekLabel: '2025-W37',
    points: lifecycleVolumes(404, {
      peak: 33000,
      base: 26000,
      floor: 0.62,
      promoPulse: 0.25,
      promoBands: [{ label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 60 }],
      dips: [{ week: 8, weeks: 3, pct: -0.04 }],
      missingWeeks: [30],
    }),
    pricePoints: lifecyclePrices(999, [{ week: 26, price: 969 }], [
      { label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 60 },
    ]),
    promoBands: [{ label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 60 }],
    events: [
      { id: 'ev-ip17-launch', week: 0, type: 'competitor-launch', label: '上市首销', impactPct: -8, impactWeeks: 5 },
      { id: 'ev-ip17-17e', week: 26, type: 'competitor-launch', label: 'iPhone 17e 上市', impactPct: -4, impactWeeks: 3 },
      { id: 'ev-ip17-d11', week: 44, type: 'promo', label: '双11 档期促销', impactPct: -5, impactWeeks: 3 },
    ],
  },
  {
    id: 'lc-x200',
    label: 'X200（友商同期）',
    brand: 'VIVO',
    launchWeekLabel: '2025-W42',
    points: lifecycleVolumes(505, {
      peak: 24000,
      base: 19000,
      floor: 0.6,
      promoPulse: 0.45,
      promoBands: [{ label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 70 }],
      dips: [{ week: 20, weeks: 3, pct: -0.05 }],
      missingWeeks: [12, 13],
    }),
    pricePoints: lifecyclePrices(799, [{ week: 24, price: 749 }], [
      { label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 70 },
    ]),
    promoBands: [{ label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 70 }],
    events: [
      { id: 'ev-x200-launch', week: 0, type: 'competitor-launch', label: '上市首销', impactPct: -4, impactWeeks: 3 },
      { id: 'ev-x200-d11', week: 44, type: 'promo', label: '双11 档期促销', impactPct: -6, impactWeeks: 3 },
    ],
  },
];

const weeks: WorkbenchWeek[] = Array.from({ length: 16 }, (_, index) => {
  const weekNumber = 37 + index;
  const isHistory = index < 8;
  const { date, dateLabel } = mondayParts(weekNumber);
  return {
    week: `W${weekNumber}`,
    weekNumber,
    date,
    dateLabel,
    status: isHistory ? ('actual' as const) : ('forecast' as const),
    sales: isHistory ? HISTORY_SALES[index] : null,
    price: isHistory ? HISTORY_PRICES[index] : FORECAST_PRICES[index - 8],
    prevGenSales: PREV_GEN[index],
  };
});

// ============================================================
// 大盘历史月度序列（2025-01–2026-09，21 个月 = 7 个完整季度）：
// 季内三月 = 季度值 + 偏差三元组（逐季轮换、合计恒为 0），三月均值精确等于
// 季度值（构造守恒）——月度主序列与季度聚合口径不出现两套数字。
// 偏差形态为固定模拟样本（确定性，无随机）。
// ============================================================

/** 季内月度偏差三元组（合计 = 0；按季度序号轮换）。 */
const QUARTER_MONTH_DEVIATIONS: ReadonlyArray<readonly [number, number, number]> = [
  [0.6, 0, -0.6],
  [-0.4, 0.4, 0],
  [0, -0.6, 0.6],
];

/** 季度值 → 三个月度值（round1；月均值守恒）。 */
function monthsOfQuarter(seed: MarketQuarterSeed, quarterIndex: number): MarketMonthSeed[] {
  const [q1, q2, q3] = QUARTER_MONTH_DEVIATIONS[quarterIndex % QUARTER_MONTH_DEVIATIONS.length];
  const year = Number(seed.key.slice(0, 4));
  const quarter = Number(seed.key.slice(5, 6));
  const baseMonth = (quarter - 1) * 3 + 1;
  const mm = (month: number): string => `${year}-${String(month).padStart(2, '0')}`;
  const round1 = (value: number): number => Math.round(value * 10) / 10;
  return [
    { key: mm(baseMonth), value: round1(seed.value + q1) },
    { key: mm(baseMonth + 1), value: round1(seed.value + q2) },
    { key: mm(baseMonth + 2), value: round1(seed.value + q3) },
  ];
}

/** 大盘季度实际值（2025Q1–2026Q3；2026Q4 起由模型推演）。 */
const MARKET_QUARTERS: MarketQuarterSeed[] = [
  { key: '2025Q1', value: 115 },
  { key: '2025Q2', value: 113 },
  { key: '2025Q3', value: 111 },
  { key: '2025Q4', value: 116 },
  { key: '2026Q1', value: 108 },
  { key: '2026Q2', value: 106 },
  { key: '2026Q3', value: 104 },
];

const marketMonths: MarketMonthSeed[] = MARKET_QUARTERS.map((quarter, index) => monthsOfQuarter(quarter, index)).flat();

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
    quarters: MARKET_QUARTERS,
    months: marketMonths,
    monthlyNote:
      '月度序列口径（模拟外推，显式声明）：历史月为模拟样本，季内三月均值恒等于季度值（构造守恒）；'
      + '预测月 = 未来 4 个季度基线（季节 × 趋势确定性外推，禁随机）按去年同期季内月形分布，'
      + '季内三月合计恒等于季度基线 × 3（容量守恒）；月中事件按日均摊：首月影响 ×（覆盖天数 ÷ 当月天数）。',
    aiRationale:
      'AI 初始推演（可修改）：纯时间序列口径 = 周期性季节因素（去年 Q4/Q3、Q1/Q4 季节比）× 全局性趋势因素（今年/去年同比水平比）；本地确定性规则基线，未调用模型服务；下方关键事件为人工录入假设，可增删改。',
  },
  defaultMarketEvents: [
    { id: 'ev-fold', label: '折叠屏阵营扩容', startWeek: 46, durationWeeks: 5, magnitudePct: 8, decay: 'decreasing' },
    { id: 'ev-mem', label: '内存供应涨价', startWeek: 50, durationWeeks: 3, magnitudePct: -6, decay: 'decreasing' },
  ],
  // 月度三字段事件预填演示：起始日 29（月中）示范日均摊（首月覆盖 3/31 天）；
  // 起始月 2027-01 在主链预测窗（W45–W52 = 2026-11/12）之外，不改基准推演数字。
  defaultMarketMonthEvents: [
    { id: 'ev-fold-m', label: '折叠屏阵营扩容', startMonth: '2027-01', startDay: 29, durationMonths: 1, magnitudePct: 8 },
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
    lifecyclePool,
  },
  replayScenarios: [
    {
      id: 'rp-comp-promo',
      match: 'competitor-launch',
      title: '友商促销 / 新品上市期',
      desc: 'Galaxy S25 上市 + 首销促销期（去年 W40–W44）：同期观察到同档位友商放量，本品周销被分流。',
      points: [26, 28, 31, 34, 30, 27, 26, 25].map((v) => v * 1000),
      refLabel: 'Galaxy S25 · 上市促销段',
      impactPct: -6,
      impactWeeks: 4,
      impactText: '同期观察到本品周销约 −6%，持续 4 周，2 周后回到原趋势，作为人工推演参照',
    },
    {
      id: 'rp-own-marketing',
      match: 'own-promo',
      title: '自家营销 / 官方价促',
      desc: 'Mate 80 官方降价促销（去年 W40–W44）：同期观察到降价次周起销量明显抬升。',
      points: [30, 29, 33, 39, 43, 45, 42, 40].map((v) => v * 1000),
      refLabel: 'Mate 80 · 官方价促段',
      impactPct: 15,
      impactWeeks: 3,
      impactText: '同期观察到降价后 3 周销量 +15%~+23%，随促销退坡回落，作为人工推演参照',
    },
    {
      id: 'rp-cannib',
      match: 'cannibalization',
      title: '自家品挤兑',
      desc: '同期观察到 Pura 90 Pro 上市后 Mate 80 周销回落（价格带重叠 $750–850）。',
      points: [34, 33, 30, 27, 26, 27, 28, 29].map((v) => v * 1000),
      refLabel: 'Mate 80 · 被挤兑段',
      impactPct: -9,
      impactWeeks: 3,
      impactText: '同期观察到 Mate 80 周销 −9%，持续 3 周，作为人工推演参照',
    },
    {
      id: 'rp-promo-sale',
      match: 'own-promo',
      title: '大促降价（档期脉冲）',
      desc: '去年黑五档期（W46–W49）降价脉冲：同期观察到主峰周销量显著抬升。',
      points: [38, 42, 52, 58, 47, 41, 38, 36].map((v) => v * 1000),
      refLabel: 'Mate 80 · 去年黑五段',
      impactPct: 30,
      impactWeeks: 4,
      impactText: '同期观察到档期脉冲峰值 +35%，档期后 2 周回落，作为人工推演参照',
    },
  ],
  anchors: [
    { week: 42, label: '调价 −$50（899→849）' },
    { week: 46, label: '黑五档期 11.14–12.02 · 主峰 W47（11-27）' },
  ],
};
