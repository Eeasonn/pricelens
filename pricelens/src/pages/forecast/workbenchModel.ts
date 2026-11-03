// ============================================================
// 量价预测 · 推演工作台 v2 确定性模型（forecast-workbench-v2）
// 顺序执行链（brief 两条铁律）：
//   大盘参数（Q4 环比 + 关键事件）→ 基准走势 × 大盘考量倍数 = 不含库存限制的预测
//   → 库存推演（期初 + SI − 预测销量）→ 健康判定（演示规则）→ 打折系数
//   → 回写主图最终柱（手调优先）→ 摘要 / 纪要同步。
// 库存验证不在预测链上游：判定基于「上游预测销量 + SI 计划」的推演值，
// 打折只修正主图最终柱，不回流改库存推演（避免循环论证）。
// 全部计算为纯函数：不读时间、不用随机数，同输入两次计算逐字段一致。
// ============================================================
import type { MarketEventSeed, WorkbenchFixture } from './workbenchFixture';

/** TODO 待拍板（brief 开放问题 2）：DOS 合理带 70–90 天与降幅阈值 20%/30% 为演示规则，待业务确认与维护方。 */
export const DOS_BAND = { min: 70, max: 90 } as const;
/** TODO 待拍板：库存相对前 4 周均值降幅阈值（%）。 */
export const INV_CRASH_LIGHT_PCT = 20;
export const INV_CRASH_HEAVY_PCT = 30;
/** 打折两档：降幅 ≥30%（或降幅 ≥20% 且 DOS 同时越界）= 8 折；单项不达标 = 9 折。 */
export const DISCOUNT_LIGHT = 0.9;
export const DISCOUNT_HEAVY = 0.8;

export type QoqSource = 'ai' | 'human';

export interface WorkbenchParams {
  /** 今年 Q4 环比降幅（%，负 = 下滑）。初始为 AI 判断值，人工改动后 qoqSource 转 human。 */
  qoqDeclinePct: number;
  qoqSource: QoqSource;
  /** 关键事件（幅度 + 时间两参数，衰减曲率不做）。 */
  marketEvents: MarketEventSeed[];
  /** 理由栏：为什么这么推（截图贴 PPT 的关键假设载体）。 */
  rationale: string;
  /** 人工 SI 计划（台），键 = 周序号 W45–W52。库存验证层唯一新输入。 */
  siPlan: Record<number, number>;
  /** 手调（键 = 周序号）：值 + 必填原因。 */
  manual: Record<number, { value: number; reason: string }>;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** 基准考量：AI 判断的 Q4 环比 + 默认事件 + 初始 SI 计划，无手调。 */
export function baseWorkbenchParams(fixture: WorkbenchFixture): WorkbenchParams {
  const siPlan: Record<number, number> = {};
  fixture.weeks.forEach((week, index) => {
    if (week.status === 'forecast') siPlan[week.weekNumber] = fixture.inventory.siPlan[index - 8];
  });
  return {
    qoqDeclinePct: fixture.market.baselineQoqDeclinePct,
    qoqSource: 'ai',
    marketEvents: fixture.defaultMarketEvents.map((event) => ({ ...event })),
    rationale: fixture.market.aiRationale,
    siPlan,
    manual: {},
  };
}

/** 是否偏离基准考量（理由栏文本不参与判断，只看影响计算的项）。 */
export function isParamsActive(params: WorkbenchParams, fixture: WorkbenchFixture): boolean {
  const base = baseWorkbenchParams(fixture);
  return (
    params.qoqDeclinePct !== base.qoqDeclinePct
    || JSON.stringify(params.marketEvents) !== JSON.stringify(base.marketEvents)
    || JSON.stringify(params.siPlan) !== JSON.stringify(base.siPlan)
    || Object.keys(params.manual).length > 0
  );
}

// ------------------------------------------------------------
// 大盘层：季度推演（当前季 + 下一季）+ 周度考量倍数
// ------------------------------------------------------------

/** 大盘推演季：'2026Q4'（当前季，主图预测周所在季）与 '2027Q1'（下一季，产品全景预测目标）。 */
export const FORECAST_QUARTERS = ['2026Q4', '2027Q1'] as const;
export type ForecastQuarter = (typeof FORECAST_QUARTERS)[number];

export function isForecastQuarter(key: string): key is ForecastQuarter {
  return (FORECAST_QUARTERS as readonly string[]).includes(key);
}

/** 事件在某推演季是否生效（自生效季起持续 durationQuarters 个季，裁剪到推演段）。 */
export function isEventActiveIn(event: MarketEventSeed, quarter: ForecastQuarter): boolean {
  const start = FORECAST_QUARTERS.indexOf(event.startQuarter as ForecastQuarter);
  if (start < 0) return false;
  const index = FORECAST_QUARTERS.indexOf(quarter);
  return index >= start && index < start + event.durationQuarters;
}

function eventFactorIn(events: readonly MarketEventSeed[], quarter: ForecastQuarter): number {
  return events
    .filter((event) => isEventActiveIn(event, quarter))
    .reduce((factor, event) => factor * (1 + event.magnitudePct / 100), 1);
}

/**
 * 大盘季度推演（季度环比趋势 + 事件按季叠加，逐季连乘）：
 * 2026Q4 = 2026Q3 × (1 + 环比%) × 事件(Q4)；2027Q1 = 2026Q4 × (1 + 环比%) × 事件(Q1)。
 * 环比趋势为 AI 判断值（人工可改），逐季延续——「去年直接抄 + 叠加今年自然变化」的口径。
 */
export function forecastQuarterIndexes(
  fixture: WorkbenchFixture,
  qoqDeclinePct: number,
  events: readonly MarketEventSeed[],
): { q4Index: number; q1NextIndex: number } {
  const lastActual = fixture.market.quarters[fixture.market.quarters.length - 1]?.value ?? 0;
  const qoq = 1 + qoqDeclinePct / 100;
  const q4 = lastActual * qoq * eventFactorIn(events, '2026Q4');
  const q1Next = q4 * qoq * eventFactorIn(events, '2027Q1');
  return { q4Index: round1(q4), q1NextIndex: round1(q1Next) };
}

/**
 * 周度大盘考量倍数（相对基准考量）：环比趋势 + 事件增删改，只作用于预测周
 * （主图预测窗口 W45–W52 全部落在 2026Q4）。基准考量本身 = 1（basePath 已含基准走势）。
 */
export function marketFactorAt(params: WorkbenchParams, base: WorkbenchParams, weekNumber: number): number {
  const qoqRatio = (1 + params.qoqDeclinePct / 100) / (1 + base.qoqDeclinePct / 100);
  const eventIds = new Set([...params.marketEvents.map((event) => event.id), ...base.marketEvents.map((event) => event.id)]);
  let eventRatio = 1;
  for (const id of eventIds) {
    const current = params.marketEvents.find((event) => event.id === id);
    const baseEvent = base.marketEvents.find((event) => event.id === id);
    if (current && isEventActiveIn(current, '2026Q4')) eventRatio *= 1 + current.magnitudePct / 100;
    if (baseEvent && isEventActiveIn(baseEvent, '2026Q4')) eventRatio /= 1 + baseEvent.magnitudePct / 100;
  }
  return qoqRatio * eventRatio;
}

// ------------------------------------------------------------
// 库存验证：推演 + 健康判定（演示规则）
// ------------------------------------------------------------

export interface InventoryRow {
  weekNumber: number;
  status: 'actual' | 'forecast';
  /** 本周销量（历史实际 / 预测周用不含库存限制的预测）。 */
  sales: number;
  si: number;
  /** 期末渠道库存（推演值）。 */
  channelInv: number;
  /** 渠道 DOS（天）= 期末库存 ÷ 近 4 周平均周销 × 7。 */
  channelDos: number;
}

export interface HealthRow {
  weekNumber: number;
  channelDos: number;
  channelInv: number;
  /** 相对前 4 周库存均值的变动（%，负 = 下降）。 */
  invChangePct: number;
  dosOk: boolean;
  crash: 'none' | 'light' | 'heavy';
  discount: number;
  reasonText: string;
}

/**
 * 库存健康判定（演示规则，TODO 待拍板）：
 * 条件 A = DOS 落在 70–90 天合理带；条件 B = 库存相对前 4 周均值降幅 < 20%。
 * A、B 均满足 = 健康（不修正）；否则打折修正：降幅 ≥30%，或降幅 ≥20% 且 DOS 同时越界 = 8 折；其余 = 9 折。
 */
export function judgeInventoryHealth(rows: InventoryRow[]): HealthRow[] {
  return rows.map((row, index) => {
    const prevWindow = rows.slice(Math.max(0, index - 4), index).map((item) => item.channelInv);
    const prevAvg = prevWindow.length ? prevWindow.reduce((total, v) => total + v, 0) / prevWindow.length : row.channelInv;
    const invChangePct = prevAvg > 0 ? round1(((row.channelInv - prevAvg) / prevAvg) * 100) : 0;
    const dropPct = -invChangePct;
    const dosOk = row.channelDos >= DOS_BAND.min && row.channelDos <= DOS_BAND.max;
    const crash: HealthRow['crash'] = dropPct >= INV_CRASH_HEAVY_PCT ? 'heavy' : dropPct >= INV_CRASH_LIGHT_PCT ? 'light' : 'none';
    let discount = 1;
    if (!(dosOk && crash === 'none')) {
      discount = crash === 'heavy' || (crash === 'light' && !dosOk) ? DISCOUNT_HEAVY : DISCOUNT_LIGHT;
    }
    const parts: string[] = [];
    if (dosOk) parts.push(`DOS ${row.channelDos.toFixed(1)} 天在合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天内`);
    else parts.push(`DOS ${row.channelDos.toFixed(1)} 天越出合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天`);
    parts.push(crash === 'none'
      ? `库存较前 4 周均值 ${invChangePct > 0 ? '+' : ''}${invChangePct}%`
      : `库存较前 4 周均值下降 ${dropPct.toFixed(1)}%（≥${crash === 'heavy' ? INV_CRASH_HEAVY_PCT : INV_CRASH_LIGHT_PCT}%）`);
    const verdict = discount === 1 ? '健康，不修正' : `打 ${discount === DISCOUNT_HEAVY ? 8 : 9} 折`;
    return {
      weekNumber: row.weekNumber,
      channelDos: row.channelDos,
      channelInv: row.channelInv,
      invChangePct,
      dosOk,
      crash,
      discount,
      reasonText: `${parts.join('；')} → ${verdict}`,
    };
  });
}

// ------------------------------------------------------------
// 主链：computeWorkbench
// ------------------------------------------------------------

export type ConsiderKind = 'market' | 'event' | 'promo' | 'inventory' | 'manual';

export interface ConsiderItem {
  kind: ConsiderKind;
  label: string;
  /** 影响幅度（%）；null = 本周不在影响窗口，仅展示状态。 */
  pct: number | null;
  note: string;
}

export interface WorkbenchWeekResult {
  week: string;
  weekNumber: number;
  dateLabel: string;
  status: 'actual' | 'forecast';
  /** 历史周销（台）。 */
  sales: number | null;
  /** 不含库存限制的预测（台，仅预测周）。 */
  unconstrained: number | null;
  /** 健康判定打折系数（1 / 0.9 / 0.8，仅预测周）。 */
  discount: number;
  /** 打折修正后的预测柱（台，仅预测周；未含手调）。 */
  corrected: number | null;
  /** 主图最终柱：手调优先，否则打折修正值。 */
  final: number | null;
  manual: { value: number; reason: string } | null;
  /** 该周是否被库存修正（打折 < 1 且未手调覆盖）。 */
  inventoryAdjusted: boolean;
  price: number;
  prevGenSales: number;
  si: number;
  channelInv: number;
  channelDos: number;
  fullDos: number;
  /** 月版本成本（USD/台）。 */
  unitCost: number;
  /** 单台销毛 = 价格 − 当月成本（演示口径，与走势页成本卡一致不含渠道费率）。 */
  unitMargin: number;
  /** 周销毛（USD，台 × 单台销毛）。 */
  weeklyMargin: number;
  health?: HealthRow;
  /** 本周考量构成（仅预测周，悬停浮窗用）。 */
  consider: ConsiderItem[];
}

export interface MarketQuarterPoint {
  key: string;
  value: number;
  status: 'actual' | 'forecast';
}

export interface WorkbenchResult {
  weeks: WorkbenchWeekResult[];
  /** 大盘季度单序列（2025Q1 连贯到当前实际 + 2026Q4/2027Q1 推演，产品全景视角）。 */
  marketQuarters: MarketQuarterPoint[];
  /** 预测周健康判定（库存验证输出框用）。 */
  health: HealthRow[];
  /** 首个库存修正周的周序号（未触发 = null）。 */
  firstAdjustedWeek: number | null;
  summary: {
    /** 预测期总销量（台，最终柱口径）。 */
    totalSales: number;
    /** 相对历史 8 周的变动（%）。 */
    vsHistoryPct: number;
    /** 大促峰周（周序号 / 台 / 标注）。 */
    peak: { weekNumber: number; value: number; note: string };
    /** 库存修正缺口（台，≥ 0）：不含库存限制 − 最终柱。 */
    gap: number;
    /** 预测期销毛（USD，最终柱 × 单台销毛）。 */
    forecastMargin: number;
    /** 历史 8 周销毛（USD）。 */
    historyMargin: number;
  };
}

/** 月版本成本：按周序号取生效版本。 */
export function unitCostOfWeek(fixture: WorkbenchFixture, weekNumber: number): number {
  let cost = fixture.costVersions[0].unitCost;
  for (const version of fixture.costVersions) {
    if (weekNumber >= version.fromWeek) cost = version.unitCost;
  }
  return cost;
}

export function computeWorkbench(fixture: WorkbenchFixture, params: WorkbenchParams): WorkbenchResult {
  const base = baseWorkbenchParams(fixture);
  const { q4Index, q1NextIndex } = forecastQuarterIndexes(fixture, params.qoqDeclinePct, params.marketEvents);
  const weeks: WorkbenchWeekResult[] = [];
  const inventoryRows: InventoryRow[] = [];
  let channelInv = fixture.inventory.initialChannelInv;

  fixture.weeks.forEach((week, index) => {
    const isForecast = week.status === 'forecast';
    const si = isForecast ? Math.max(0, Math.round(params.siPlan[week.weekNumber] ?? 0)) : fixture.inventory.historySi[index];
    let unconstrained: number | null = null;
    if (isForecast) {
      const factor = marketFactorAt(params, base, week.weekNumber);
      unconstrained = Math.max(0, Math.round(fixture.basePath[index - 8] * factor));
    }
    // 库存推演：历史周用实际销量，预测周用不含库存限制的预测（验证性分析，打折不回流）。
    const salesForInventory = isForecast ? (unconstrained as number) : (week.sales as number);
    channelInv = channelInv + si - salesForInventory;
    const window = inventoryRows.slice(-3).map((row) => row.sales);
    const rollingAvg = window.length ? (window.reduce((total, v) => total + v, 0) + salesForInventory) / (window.length + 1) : salesForInventory;
    const channelDos = rollingAvg > 0 ? round1((channelInv / rollingAvg) * 7) : 0;
    inventoryRows.push({ weekNumber: week.weekNumber, status: week.status, sales: salesForInventory, si, channelInv, channelDos });

    const unitCost = unitCostOfWeek(fixture, week.weekNumber);
    const unitMargin = week.price - unitCost;
    weeks.push({
      week: week.week,
      weekNumber: week.weekNumber,
      dateLabel: week.dateLabel,
      status: week.status,
      sales: week.sales,
      unconstrained,
      discount: 1,
      corrected: null,
      final: isForecast ? null : week.sales,
      manual: null,
      inventoryAdjusted: false,
      price: week.price,
      prevGenSales: week.prevGenSales,
      si,
      channelInv,
      channelDos,
      fullDos: round1(channelDos * fixture.inventory.fullDosFactor),
      unitCost,
      unitMargin,
      weeklyMargin: week.sales != null ? week.sales * unitMargin : 0,
      consider: [],
    });
  });

  // 健康判定只针对预测周（判定基于预测的 DOS / 库存）。
  const forecastRows = inventoryRows.filter((row) => row.status === 'forecast');
  const health = judgeInventoryHealth(forecastRows);
  const healthByWeek = new Map(health.map((row) => [row.weekNumber, row]));

  // 回写主图：打折修正 → 手调优先。
  weeks.forEach((week) => {
    if (week.status !== 'forecast' || week.unconstrained == null) return;
    const row = healthByWeek.get(week.weekNumber);
    const discount = row?.discount ?? 1;
    const corrected = Math.max(0, Math.round(week.unconstrained * discount));
    const manual = params.manual[week.weekNumber] ?? null;
    week.discount = discount;
    week.corrected = corrected;
    week.manual = manual;
    week.inventoryAdjusted = discount < 1 && manual == null;
    week.final = manual != null ? manual.value : corrected;
    week.weeklyMargin = week.final * week.unitMargin;
    week.health = row;
    const inPromo = week.weekNumber >= fixture.promoBand.startWeek && week.weekNumber <= fixture.promoBand.endWeek;
    const consider: ConsiderItem[] = [
      {
        kind: 'market',
        label: '大盘 · 季度趋势',
        pct: params.qoqDeclinePct,
        note: `季度环比 ${params.qoqDeclinePct}% 逐季延续：2026Q4 指数 ${q4Index} · 2027Q1 指数 ${q1NextIndex}`,
      },
      ...params.marketEvents.map((event) => {
        const active = isEventActiveIn(event, '2026Q4');
        return {
          kind: 'event' as const,
          label: event.label,
          pct: active ? event.magnitudePct : null,
          note: active
            ? `生效中（${event.startQuarter} 起，持续 ${event.durationQuarters} 季）`
            : `${event.startQuarter} 起生效（持续 ${event.durationQuarters} 季），不影响本季周度预测`,
        };
      }),
      {
        kind: 'promo',
        label: fixture.promoBand.label,
        pct: null,
        note: inPromo ? '档期形状已含在基准走势内' : '不在档期',
      },
      {
        kind: 'inventory',
        label: '库存修正',
        pct: discount < 1 ? -round1((1 - discount) * 100) : null,
        note: discount < 1 ? row?.reasonText ?? '已触发打折修正' : '本周未触发',
      },
    ];
    if (manual != null) {
      const before = corrected;
      consider.push({
        kind: 'manual',
        label: '人工手调',
        pct: before > 0 ? round1(((manual.value - before) / before) * 100) : null,
        note: manual.reason,
      });
    }
    week.consider = consider;
  });

  const historyWeeks = weeks.filter((week) => week.status === 'actual');
  const forecastWeeks = weeks.filter((week) => week.status === 'forecast');
  const historySalesTotal = historyWeeks.reduce((total, week) => total + (week.sales ?? 0), 0);
  const totalSales = forecastWeeks.reduce((total, week) => total + (week.final ?? 0), 0);
  const gap = forecastWeeks.reduce((total, week) => total + Math.max(0, (week.unconstrained ?? 0) - (week.final ?? 0)), 0);
  const peakWeekResult = forecastWeeks.reduce((best, week) => ((week.final ?? 0) > (best?.final ?? 0) ? week : best), forecastWeeks[0]);
  const adjusted = forecastWeeks.filter((week) => week.inventoryAdjusted);
  const marketQuarters: MarketQuarterPoint[] = [
    ...fixture.market.quarters.map((quarter) => ({ key: quarter.key, value: quarter.value, status: 'actual' as const })),
    { key: '2026Q4', value: q4Index, status: 'forecast' as const },
    { key: '2027Q1', value: q1NextIndex, status: 'forecast' as const },
  ];

  return {
    weeks,
    marketQuarters,
    health,
    firstAdjustedWeek: adjusted.length ? adjusted[0].weekNumber : null,
    summary: {
      totalSales,
      vsHistoryPct: historySalesTotal > 0 ? round1((totalSales / historySalesTotal - 1) * 100) : 0,
      peak: {
        weekNumber: peakWeekResult.weekNumber,
        value: peakWeekResult.final ?? 0,
        note: peakWeekResult.weekNumber === fixture.promoBand.peakWeek ? fixture.promoBand.peakNote : '预测周销最高',
      },
      gap,
      forecastMargin: forecastWeeks.reduce((total, week) => total + week.weeklyMargin, 0),
      historyMargin: historyWeeks.reduce((total, week) => total + week.weeklyMargin, 0),
    },
  };
}

// ------------------------------------------------------------
// 手调（原因必填；留痕展示层已删，原因标注在主图手调处）
// ------------------------------------------------------------

/** 手调设置（纯函数）：原因必填，空原因返回 null（调用方据此禁用保存）。 */
export function setManualAdjustment(
  params: WorkbenchParams,
  weekNumber: number,
  value: number,
  reason: string,
): WorkbenchParams | null {
  if (!reason.trim()) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return { ...params, manual: { ...params.manual, [weekNumber]: { value: Math.round(value), reason: reason.trim() } } };
}

/** 清除某周手调。 */
export function clearManualAdjustment(params: WorkbenchParams, weekNumber: number): WorkbenchParams {
  const manual = { ...params.manual };
  delete manual[weekNumber];
  return { ...params, manual };
}
