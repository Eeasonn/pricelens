// ============================================================
// 量价预测 · v3 推演工作台统一模拟数据（forecast-global-ia-review 附录 A.2 / 任务 2）
// 在任务 1 的统一日历上以固定种子（mulberry32 LCG）确定性生成整套模拟样本：
// 52+ 本品实际周（保留真实缺采 null，不造 0）、覆盖全部训练与预测周龄的
// 参考生命周期序列（108 周）、2024-11—2026-10 共 24 个连续实际大盘月、
// 12 个月 SI / 成本 / 价格计划、多个已知促销窗口（B.4.4 PromoWindow）。
// 全部为纯函数：不读系统当前时间、不用 Math.random；同 fixture + 同日历
// 重复调用逐字段一致（B.1 全局约束）。
//
// ⚠️ 并存约束（任务 2 拍板）：本模块产出的 workbenchFixtureV3 与既有
// workbenchFixture（v2）并存，仅为纯函数开发期的隔离环境；任务 5 独占完成
// computeWorkbench 主链切换后，必须移除 v2 预测主链与其 fixture 出口，
// 不得长期保留两套预测主链。任务 5 之前不改动 v2 导出与当前页面。
// ============================================================
import type {
  ForecastCalendar,
} from './workbenchCalendar';
import type {
  LifecycleEventSeed,
  LifecycleProductSeed,
  LifecyclePromoBandSeed,
  MarketMonthSeed,
  MarketQuarterSeed,
  PromoWindow,
  ReferenceFactSeed,
  ReferenceSeriesSeed,
  WorkbenchCostVersionV3,
  WorkbenchFixtureV3,
  WorkbenchWeekV3,
} from './workbenchFixture';

/** 固定种子 LCG（mulberry32）：确定性伪随机，同种子恒同序列（与 v2 fixture 同法）。 */
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

/** 千元取整（台）。 */
function roundThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

/** 百元取整（台）。 */
function roundHundred(value: number): number {
  return Math.round(value / 100) * 100;
}

/** 周一日期 → 周 ID（该日期必须存在于日历；fixture 档期窗口只锚定真实周）。 */
function weekIdByDate(calendar: ForecastCalendar, date: string): string {
  const week = calendar.weeks.find((candidate) => candidate.date === date);
  if (!week) throw new Error(`workbenchSimulation: 档期日期「${date}」不在统一日历内`);
  return week.id;
}

/** 闭区间周范围覆盖的全部周 ID（含起止）。 */
function coveredWeekIds(calendar: ForecastCalendar, startWeekId: string, endWeekId: string): Set<string> {
  const start = calendar.weekById.get(startWeekId);
  const end = calendar.weekById.get(endWeekId);
  if (!start || !end || start.index > end.index) {
    throw new Error(`workbenchSimulation: 非法档期范围 ${startWeekId}–${endWeekId}`);
  }
  const ids = new Set<string>();
  for (let index = start.index; index <= end.index; index += 1) {
    ids.add(calendar.weeks[index]!.id);
  }
  return ids;
}

// ============================================================
// 已知促销窗口（B.4.4 PromoWindow；学习促销特征 p 与档期价共用同一窗口）：
// 两个历史窗口（黑五 2025 / 618 2026，供①训练行取 p=1）+
// 两个预测窗口（黑五 2026 / 618 2027，供价格计划与①预测行取 p=1）。
// 起 / 止均为统一日历内的真实周一日期。
// ============================================================

const PROMO_WINDOW_DATES: ReadonlyArray<{ id: string; label: string; start: string; end: string; price: number }> = [
  { id: 'pw-bf-2025', label: '黑五档期 2025', start: '2025-11-24', end: '2025-12-15', price: 799 },
  { id: 'pw-618-2026', label: '618 档期 2026', start: '2026-05-25', end: '2026-06-15', price: 799 },
  { id: 'pw-bf-2026', label: '黑五档期 2026', start: '2026-11-09', end: '2026-11-30', price: 799 },
  { id: 'pw-618-2027', label: '618 档期 2027', start: '2027-05-31', end: '2027-06-21', price: 799 },
];

/** 本品周销模拟（台）：首销爬坡 → 平台波动 → 近期回落；档期窗口 ×1.28 脉冲。 */
function ownWeekSales(rand: () => number, lifecycleIndex: number, inPromo: boolean): number {
  let value: number;
  if (lifecycleIndex < 8) {
    value = (0.55 + (lifecycleIndex / 7) * 0.45) * 46000;
  } else if (lifecycleIndex < 40) {
    value = 44000 * (0.9 + rand() * 0.18);
  } else {
    value = 44000 * (1 - 0.18 * ((lifecycleIndex - 40) / 63)) * (0.92 + rand() * 0.14);
  }
  if (inPromo) value *= 1.28;
  return roundHundred(value);
}

/**
 * 本品周序列：lifecycleIndex = 本品周龄（0 = 首个历史周），映射参考产品
 * lifecyclePool 同周龄点；缺采周（OWN_MISSING_INDEXES）保留 sales=null，
 * 不转 0；预测周 sales=null（由模型计算）。
 */
const OWN_MISSING_INDEXES = [13, 44];

function buildOwnWeeks(calendar: ForecastCalendar, promoWeekIds: Set<string>): WorkbenchWeekV3[] {
  const rand = mulberry32(9001);
  return calendar.weeks.map((week, lifecycleIndex) => {
    const inPromo = promoWeekIds.has(week.id);
    const sales = week.status === 'actual' && !OWN_MISSING_INDEXES.includes(lifecycleIndex)
      ? ownWeekSales(rand, lifecycleIndex, inPromo)
      : null;
    return {
      id: week.id,
      weekNumber: week.weekNumber,
      date: week.date,
      dateLabel: week.date.slice(5),
      status: week.status,
      sales,
      price: ownWeekPrice(lifecycleIndex, inPromo),
      lifecycleIndex,
    };
  });
}

/** 本品价格计划（USD）：上市 899 → 黑五/618 档期价 799 → 官方降价 849（第 26 周起）。 */
function ownWeekPrice(lifecycleIndex: number, inPromo: boolean): number {
  if (inPromo) return 799;
  if (lifecycleIndex < 26) return 899;
  return 849;
}

/** 促销窗口（从日历锚定真实周 ID）与其覆盖周集合。 */
function buildPromoWindows(calendar: ForecastCalendar): { windows: PromoWindow[]; covered: Set<string> } {
  const windows = PROMO_WINDOW_DATES.map((entry) => ({
    id: entry.id,
    label: entry.label,
    startWeekId: weekIdByDate(calendar, entry.start),
    endWeekId: weekIdByDate(calendar, entry.end),
  }));
  const covered = new Set<string>();
  for (const window of windows) {
    for (const id of coveredWeekIds(calendar, window.startWeekId, window.endWeekId)) covered.add(id);
  }
  return { windows, covered };
}

// ============================================================
// 大盘月历史（A.2：至少 24 个连续实际月，补足到 2026-10；预测月不在
// fixture 存储，由②按季度基线确定性外推）。季度实际值到 2026Q3（最后一个
// 完整实际季），季内三月 = 季度值 + 偏差三元组（逐季轮换、合计恒为 0，
// 三月均值守恒）；2026-10 为最新实际月（部分实际季，单独给值不重摊）。
// ============================================================

const QUARTER_MONTH_DEVIATIONS: ReadonlyArray<readonly [number, number, number]> = [
  [0.6, 0, -0.6],
  [-0.4, 0.4, 0],
  [0, -0.6, 0.6],
];

/** 大盘季度实际值（2024Q4–2026Q3；2026Q4 起由模型外推）。 */
const MARKET_QUARTERS_V3: MarketQuarterSeed[] = [
  { key: '2024Q4', value: 112 },
  { key: '2025Q1', value: 108 },
  { key: '2025Q2', value: 106 },
  { key: '2025Q3', value: 104 },
  { key: '2025Q4', value: 111 },
  { key: '2026Q1', value: 107 },
  { key: '2026Q2', value: 105 },
  { key: '2026Q3', value: 103 },
];

/** 季度值 → 三个月度值（round1；月均值守恒，与 v2 同法）。 */
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

function buildMarketMonths(): MarketMonthSeed[] {
  const months = MARKET_QUARTERS_V3
    .map((quarter, index) => monthsOfQuarter(quarter, index))
    .flat()
    .filter((month) => month.key >= '2024-11');
  // 补足到 2026-10：最新实际月（2026Q4 为部分实际季，10 月实际单独给值，
  // 不把季度目标差额重摊给 11/12 月——该规则由②在任务 4 实现）。
  months.push({ key: '2026-10', value: 101.5 });
  return months;
}

// ============================================================
// 全生命周期参考池（≥4 产品 × 108 周量价）：形状 = 首销爬坡（0–7）→
// 平台波动（8–39）→ 生命末期衰减（40–107）。数组覆盖本品全部周龄
// （0–103 = 52 实际 + 52 预测），满足 B.4.4「模拟 fixture 必须扩展参考
// 生命周期，不得把末值无限平铺」；缺采周保留 null 不造 0（本品主链参考
// lc-mate80 / lc-pura90 / lc-s25 全量，缺采仅出现在 lc-x200 演示「—」）。
// ============================================================

const LIFECYCLE_WEEKS_V3 = 108;

/** 全生命周期周销：爬坡 → 平台波动 → 衰减 + 档期脉冲 + 事件凹坑 + 缺采周。 */
function lifecycleVolumesV3(seed: number, cfg: {
  peak: number;
  base: number;
  floor: number;
  promoPulse: number;
  promoBands: LifecyclePromoBandSeed[];
  dips: Array<{ week: number; weeks: number; pct: number }>;
  missingWeeks?: number[];
}): Array<number | null> {
  const rand = mulberry32(seed);
  const out: Array<number | null> = [];
  for (let w = 0; w < LIFECYCLE_WEEKS_V3; w++) {
    let v: number;
    if (w < 8) v = (0.55 + (w / 7) * 0.45) * cfg.peak;
    else if (w < 40) v = cfg.base * (0.92 + rand() * 0.16);
    else v = (1 - (1 - cfg.floor) * ((w - 40) / (LIFECYCLE_WEEKS_V3 - 41))) * cfg.base * (0.9 + rand() * 0.2);
    for (const band of cfg.promoBands) {
      if (w >= band.startWeek && w <= band.endWeek) v *= 1 + cfg.promoPulse * (w === band.endWeek ? 1.1 : 0.9);
    }
    for (const dip of cfg.dips) {
      if (w >= dip.week && w < dip.week + dip.weeks) v *= 1 + dip.pct;
    }
    out.push(Math.max(1000, roundHundred(v)));
  }
  for (const week of cfg.missingWeeks ?? []) if (week >= 0 && week < LIFECYCLE_WEEKS_V3) out[week] = null;
  return out;
}

/** 全生命周期价格：阶梯调价表（week 起生效）+ 档期直降（108 周全覆盖）。 */
function lifecyclePricesV3(launch: number, cuts: Array<{ week: number; price: number }>, promoBands: LifecyclePromoBandSeed[]): Array<number | null> {
  const out: Array<number | null> = [];
  for (let w = 0; w < LIFECYCLE_WEEKS_V3; w++) {
    let price = launch;
    for (const cut of cuts) if (w >= cut.week) price = cut.price;
    for (const band of promoBands) if (w >= band.startWeek && w <= band.endWeek) price -= band.priceDrop ?? 0;
    out.push(price);
  }
  return out;
}

/** 本品周龄窗口（0–103）内参考点切片：prevGen/competitor 池与主品同窗对齐。 */
function alignedSlice(points: Array<number | null>, calendar: ForecastCalendar): number[] {
  const aligned = points.slice(0, calendar.weeks.length);
  if (aligned.some((point) => point === null)) {
    throw new Error('workbenchSimulation: 对齐参考序列含缺采周，不得进入数值池');
  }
  return aligned as number[];
}

function buildLifecyclePool(): LifecycleProductSeed[] {
  const mate80Bands: LifecyclePromoBandSeed[] = [
    { label: '618 档期', startWeek: 22, endWeek: 25, priceDrop: 50 },
    { label: '黑五档期', startWeek: 46, endWeek: 49, priceDrop: 100 },
    { label: '618 档期 · 次年', startWeek: 74, endWeek: 77, priceDrop: 60 },
    { label: '黑五档期 · 次年', startWeek: 98, endWeek: 101, priceDrop: 110 },
  ];
  const pura90Bands: LifecyclePromoBandSeed[] = [
    { label: '618 档期', startWeek: 20, endWeek: 23, priceDrop: 50 },
    { label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 80 },
    { label: '618 档期 · 次年', startWeek: 72, endWeek: 75, priceDrop: 60 },
    { label: '双11 档期 · 次年', startWeek: 96, endWeek: 99, priceDrop: 90 },
  ];
  const s25Bands: LifecyclePromoBandSeed[] = [
    { label: '首销促销', startWeek: 1, endWeek: 4, priceDrop: 60 },
    { label: '黑五档期', startWeek: 46, endWeek: 49, priceDrop: 110 },
    { label: '黑五档期 · 次年', startWeek: 98, endWeek: 101, priceDrop: 120 },
  ];
  const ip17Bands: LifecyclePromoBandSeed[] = [
    { label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 60 },
    { label: '双11 档期 · 次年', startWeek: 96, endWeek: 99, priceDrop: 70 },
  ];
  const x200Bands: LifecyclePromoBandSeed[] = [
    { label: '双11 档期', startWeek: 44, endWeek: 47, priceDrop: 70 },
    { label: '双11 档期 · 次年', startWeek: 96, endWeek: 99, priceDrop: 80 },
  ];

  const mate80Events: LifecycleEventSeed[] = [
    { id: 'ev-m80-launch', week: 0, type: 'own-launch', label: '上市首销', impactPct: 30, impactWeeks: 4 },
    { id: 'ev-m80-s26', week: 18, type: 'competitor-launch', label: 'Galaxy S26 上市', impactPct: -6, impactWeeks: 4 },
    { id: 'ev-m80-618', week: 22, type: 'promo', label: '618 档期脉冲', impactPct: 42, impactWeeks: 4 },
    { id: 'ev-m80-pura90', week: 34, type: 'cannibalization', label: 'Pura 90 上市挤兑', impactPct: -9, impactWeeks: 3 },
    { id: 'ev-m80-bf', week: 46, type: 'promo', label: '黑五档期脉冲', impactPct: 46, impactWeeks: 4 },
    { id: 'ev-m80-m90', week: 52, type: 'cannibalization', label: 'Mate 90 上市挤兑', impactPct: -11, impactWeeks: 5 },
    { id: 'ev-m80-618-2', week: 74, type: 'promo', label: '次年 618 档期脉冲', impactPct: 38, impactWeeks: 4 },
  ];
  const pura90Events: LifecycleEventSeed[] = [
    { id: 'ev-p90-launch', week: 0, type: 'own-launch', label: '上市首销', impactPct: 26, impactWeeks: 4 },
    { id: 'ev-p90-618', week: 20, type: 'promo', label: '618 档期脉冲', impactPct: 38, impactWeeks: 4 },
    { id: 'ev-p90-m80', week: 38, type: 'cannibalization', label: 'Mate 80 上市挤兑', impactPct: -7, impactWeeks: 3 },
    { id: 'ev-p90-d11', week: 44, type: 'promo', label: '双11 档期脉冲', impactPct: 38, impactWeeks: 4 },
    { id: 'ev-p90-618-2', week: 72, type: 'promo', label: '次年 618 档期脉冲', impactPct: 34, impactWeeks: 4 },
  ];
  const s25Events: LifecycleEventSeed[] = [
    { id: 'ev-s25-launch', week: 0, type: 'competitor-launch', label: '上市首销', impactPct: -6, impactWeeks: 4 },
    { id: 'ev-s25-promo', week: 1, type: 'promo', label: '首销促销期', impactPct: -6, impactWeeks: 4 },
    { id: 'ev-s25-edge', week: 30, type: 'competitor-launch', label: 'Galaxy S25 Edge 上市', impactPct: -5, impactWeeks: 3 },
    { id: 'ev-s25-bf', week: 46, type: 'promo', label: '黑五档期促销', impactPct: -7, impactWeeks: 3 },
    { id: 'ev-s25-edge2', week: 55, type: 'competitor-launch', label: 'Galaxy S26 上市', impactPct: -6, impactWeeks: 4 },
  ];
  const ip17Events: LifecycleEventSeed[] = [
    { id: 'ev-ip17-launch', week: 0, type: 'competitor-launch', label: '上市首销', impactPct: -8, impactWeeks: 5 },
    { id: 'ev-ip17-17e', week: 26, type: 'competitor-launch', label: 'iPhone 17e 上市', impactPct: -4, impactWeeks: 3 },
    { id: 'ev-ip17-d11', week: 44, type: 'promo', label: '双11 档期促销', impactPct: -5, impactWeeks: 3 },
    { id: 'ev-ip17-18', week: 60, type: 'competitor-launch', label: 'iPhone 18 上市', impactPct: -6, impactWeeks: 4 },
  ];
  const x200Events: LifecycleEventSeed[] = [
    { id: 'ev-x200-launch', week: 0, type: 'competitor-launch', label: '上市首销', impactPct: -4, impactWeeks: 3 },
    { id: 'ev-x200-d11', week: 44, type: 'promo', label: '双11 档期促销', impactPct: -6, impactWeeks: 3 },
    { id: 'ev-x200-next', week: 70, type: 'competitor-launch', label: 'X300 上市', impactPct: -5, impactWeeks: 3 },
  ];

  return [
    {
      id: 'lc-mate80',
      label: 'Mate 80（上一代）',
      brand: 'HUAWEI',
      launchWeekLabel: '2025-W02',
      chainRefId: 'ref-mate80',
      points: lifecycleVolumesV3(101, {
        peak: 44000, base: 36000, floor: 0.55, promoPulse: 0.42,
        promoBands: mate80Bands,
        dips: [
          { week: 18, weeks: 4, pct: -0.06 },
          { week: 34, weeks: 3, pct: -0.09 },
          { week: 70, weeks: 3, pct: -0.05 },
        ],
      }),
      pricePoints: lifecyclePricesV3(899, [{ week: 16, price: 849 }, { week: 68, price: 799 }], mate80Bands),
      promoBands: mate80Bands,
      events: mate80Events,
    },
    {
      id: 'lc-pura90',
      label: 'Pura 90 Pro（上上代）',
      brand: 'HUAWEI',
      launchWeekLabel: '2024-W40',
      chainRefId: 'ref-pura90',
      points: lifecycleVolumesV3(202, {
        peak: 39000, base: 32000, floor: 0.5, promoPulse: 0.38,
        promoBands: pura90Bands,
        dips: [
          { week: 38, weeks: 3, pct: -0.07 },
          { week: 62, weeks: 3, pct: -0.06 },
        ],
      }),
      pricePoints: lifecyclePricesV3(849, [{ week: 18, price: 799 }], pura90Bands),
      promoBands: pura90Bands,
      events: pura90Events,
    },
    {
      id: 'lc-s25',
      label: 'Galaxy S25（友商同期）',
      brand: 'SAMSUNG',
      launchWeekLabel: '2025-W06',
      points: lifecycleVolumesV3(303, {
        peak: 36000, base: 30000, floor: 0.6, promoPulse: 0.5,
        promoBands: s25Bands,
        dips: [{ week: 30, weeks: 3, pct: -0.05 }],
      }),
      pricePoints: lifecyclePricesV3(999, [{ week: 20, price: 949 }], s25Bands),
      promoBands: s25Bands,
      events: s25Events,
    },
    {
      id: 'lc-ip17',
      label: 'iPhone 17（友商同期）',
      brand: 'APPLE',
      launchWeekLabel: '2025-W37',
      points: lifecycleVolumesV3(404, {
        peak: 33000, base: 26000, floor: 0.62, promoPulse: 0.25,
        promoBands: ip17Bands,
        dips: [{ week: 8, weeks: 3, pct: -0.04 }],
      }),
      pricePoints: lifecyclePricesV3(999, [{ week: 26, price: 969 }], ip17Bands),
      promoBands: ip17Bands,
      events: ip17Events,
    },
    {
      id: 'lc-x200',
      label: 'X200（友商同期）',
      brand: 'VIVO',
      launchWeekLabel: '2025-W42',
      points: lifecycleVolumesV3(505, {
        peak: 24000, base: 19000, floor: 0.6, promoPulse: 0.45,
        promoBands: x200Bands,
        dips: [{ week: 20, weeks: 3, pct: -0.05 }],
        missingWeeks: [12, 13],
      }),
      pricePoints: lifecyclePricesV3(799, [{ week: 24, price: 749 }], x200Bands),
      promoBands: x200Bands,
      events: x200Events,
    },
  ];
}

function lifecycleById(pool: LifecycleProductSeed[], id: string): LifecycleProductSeed {
  const product = pool.find((candidate) => candidate.id === id);
  if (!product) throw new Error(`workbenchSimulation: 生命周期产品「${id}」不存在`);
  return product;
}

// ============================================================
// 12 个月 SI / 成本 / 价格计划 + 历史库存（③④输入，跨年月键不串值）。
// ============================================================

function buildSiPlanMonthly(calendar: ForecastCalendar): Record<string, number> {
  const rand = mulberry32(7003);
  const plan: Record<string, number> = {};
  for (const month of calendar.forecastMonths) {
    plan[month.key] = roundThousand(150000 + rand() * 150000);
  }
  return plan;
}

function buildCostVersions(calendar: ForecastCalendar): WorkbenchCostVersionV3[] {
  const rand = mulberry32(7002);
  return calendar.forecastMonths.map((month, index) => ({
    monthKey: month.key,
    label: `${month.key} 版本`,
    // 成本缓降（规模效应）+ 轻微波动，全部为模拟演示值。
    unitCost: Math.round(596 - index * 1.6 + (rand() * 8 - 4)),
  }));
}

function buildHistorySi(weekCount: number): number[] {
  const rand = mulberry32(7004);
  return Array.from({ length: weekCount }, (_, index) => {
    if (index % 9 === 8) return 0; // 无补货周（合法输入，图上不画 ▼）
    return roundThousand(16000 + rand() * 18000);
  });
}

/**
 * 生成 v3 统一模拟 fixture（B.6 任务 2）：
 * 输入为任务 1 的 ForecastCalendar；输出 JSON 可序列化的完整样本
 * （不含 Map / Date / 派生结果——派生值一律由模型计算）。
 * 与 workbenchFixture（v2）并存至任务 5 主链切换，之后必须移除旧主链。
 */
export function createWorkbenchSimulation(calendar: ForecastCalendar): WorkbenchFixtureV3 {
  const { windows: promoWindows, covered: promoWeekIds } = buildPromoWindows(calendar);
  const weeks = buildOwnWeeks(calendar, promoWeekIds);
  const lifecyclePool = buildLifecyclePool();
  const firstActual = calendar.weeks.find((week) => week.status === 'actual')!;
  const lastActual = [...calendar.weeks].reverse().find((week) => week.status === 'actual')!;
  const firstForecast = calendar.forecastWeeks[0]!;
  const lastForecast = calendar.forecastWeeks[calendar.forecastWeeks.length - 1]!;

  const forecastMonths = calendar.forecastMonths.map((month) => ({
    key: month.key,
    label: `${Number(month.key.slice(5, 7))} 月（${month.weekIds[0]}–${month.weekIds[month.weekIds.length - 1]}）`,
    weekIds: month.weekIds,
    forecastWeekIds: month.forecastWeekIds,
  }));

  return {
    meta: {
      status: 'simulated',
      modelVersion: 'workbench-demo-v3',
      source: 'demo_seed_v3',
      // 模拟样本时钟固定为 2026-11-03（附录 A.2）；非系统当前时间。
      generatedAt: '2026-11-03',
      currency: 'USD',
      note: '演示数据：周历史、参考生命周期、大盘、SI、成本与价格计划均为固定种子模拟，不代表真实市场、销量、库存或利润；与 workbenchFixture（v2）并存至任务 5 主链切换，之后不得保留两套预测主链。',
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
      currentWeek: firstForecast.id,
      historyRange: `${firstActual.id}–${lastActual.id}`,
      forecastRange: `${firstForecast.id}–${lastForecast.id}`,
    },
    calendar: {
      historyStart: firstActual.date,
      historyThrough: calendar.historyThrough,
      horizonStart: calendar.horizonStart,
      horizonEnd: calendar.horizonEnd,
    },
    weeks,
    promoWindows,
    market: {
      quarters: MARKET_QUARTERS_V3,
      months: buildMarketMonths(),
      monthlyNote:
        '月度序列口径（模拟外推，显式声明）：2024-11—2026-10 共 24 个连续实际月为模拟样本，季内三月均值恒等于季度值（构造守恒）；'
        + '2026-10 为最新实际月（2026Q4 部分实际季，10 月实际不重摊残差）；预测月由②按季度基线 × 去年同季月形确定性外推，禁随机。',
      aiRationale:
        'AI 初始推演（可修改）：纯时间序列口径 = 周期性季节因素（去年同季比）× 全局性趋势因素（今年/去年同比水平比）；本地确定性规则基线，未调用模型服务。',
    },
    inventory: {
      initialChannelInv: 168000,
      historySi: buildHistorySi(weeks.filter((week) => week.status === 'actual').length),
      siPlanMonthly: buildSiPlanMonthly(calendar),
      fullDosFactor: 1.45,
    },
    costVersions: buildCostVersions(calendar),
    forecastMonths,
    references: {
      prevGenPool: [
        { id: 'ref-mate80', label: 'Mate 80（上一代）· 同周龄对齐', points: alignedSlice(lifecycleById(lifecyclePool, 'lc-mate80').points, calendar) },
        { id: 'ref-pura90', label: 'Pura 90 Pro（上上代）· 同周龄对齐', points: alignedSlice(lifecycleById(lifecyclePool, 'lc-pura90').points, calendar) },
      ],
      competitorPool: [
        { id: 'ref-s25', label: 'Galaxy S25（友商同期）· 同周龄对齐', points: alignedSlice(lifecycleById(lifecyclePool, 'lc-s25').points, calendar) },
        { id: 'ref-ip17', label: 'iPhone 17（友商同期）· 同周龄对齐', points: alignedSlice(lifecycleById(lifecyclePool, 'lc-ip17').points, calendar) },
      ],
      facts: [
        { label: '黑五档期脉冲（本品档期价 799）', weekIndex: 3, type: 'promo' },
        { label: '竞品新配色上市', weekIndex: 17, type: 'launch' },
        { label: '官方降价 899→849', weekIndex: 26, type: 'price' },
        { label: '618 档期脉冲（本品档期价 799）', weekIndex: 29, type: 'promo' },
      ] satisfies ReferenceFactSeed[],
      lifecyclePool,
    },
    replayScenarios: [
      {
        id: 'rp-comp-promo',
        match: 'competitor-launch',
        title: '友商促销 / 新品上市期',
        desc: 'Galaxy S25 上市 + 首销促销期（周龄 W1–W8）：同期观察到同档位友商放量，本品周销被分流。',
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
        desc: 'Mate 80 官方降价促销（周龄 W14–W21）：同期观察到降价次周起销量明显抬升。',
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
        desc: '去年黑五档期降价脉冲：同期观察到主峰周销量显著抬升。',
        points: [38, 42, 52, 58, 47, 41, 38, 36].map((v) => v * 1000),
        refLabel: 'Mate 80 · 黑五档期段',
        impactPct: 30,
        impactWeeks: 4,
        impactText: '同期观察到档期脉冲峰值 +35%，档期后 2 周回落，作为人工推演参照',
      },
    ],
  };
}
