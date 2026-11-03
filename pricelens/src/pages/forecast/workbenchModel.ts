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
// 大盘层：季度推演 + 周度考量倍数
// ------------------------------------------------------------

/** 今年 Q4 指数 = Q3 × (1 + 环比降幅/100)。季度粒度（同比不下钻到周）。 */
export function forecastQuarterIndex(fixture: WorkbenchFixture, qoqDeclinePct: number): number {
  const q3 = fixture.market.quarters.find((quarter) => quarter.label === 'Q3')?.thisYear;
  if (q3 == null) return 0;
  return round1(q3 * (1 + qoqDeclinePct / 100));
}

/** 事件在某周是否生效（从生效周起持续到预测窗口末，衰减曲率不做）。 */
export function isEventActiveAt(event: MarketEventSeed, weekNumber: number): boolean {
  return weekNumber >= event.startWeek;
}

/**
 * 周度大盘考量倍数（相对基准考量）：环比降幅变化 + 事件增删改，都只作用于预测周。
 * 基准考量本身 = 1（basePath 已含基准大盘走势与黑五形状）。
 */
export function marketFactorAt(params: WorkbenchParams, base: WorkbenchParams, weekNumber: number): number {
  const qoqRatio = (1 + params.qoqDeclinePct / 100) / (1 + base.qoqDeclinePct / 100);
  // 事件倍数 = 当前考量的事件乘子 ÷ 基准考量的事件乘子（同一事件改幅度 = 换乘子，删除 = 除回）。
  const eventIds = new Set([...params.marketEvents.map((event) => event.id), ...base.marketEvents.map((event) => event.id)]);
  let eventRatio = 1;
  for (const id of eventIds) {
    const current = params.marketEvents.find((event) => event.id === id);
    const baseEvent = base.marketEvents.find((event) => event.id === id);
    if (current && isEventActiveAt(current, weekNumber)) eventRatio *= 1 + current.magnitudePct / 100;
    if (baseEvent && isEventActiveAt(baseEvent, weekNumber)) eventRatio /= 1 + baseEvent.magnitudePct / 100;
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

export interface WorkbenchResult {
  weeks: WorkbenchWeekResult[];
  /** 大盘季度对照（今年 Q4 为推演值，随环比降幅联动）。 */
  marketQuarters: Array<{ label: string; lastYear: number; thisYear: number; thisYearForecast: boolean }>;
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
        label: '大盘 · Q4 环比',
        pct: params.qoqDeclinePct,
        note: `今年 Q4 指数推演 ${forecastQuarterIndex(fixture, params.qoqDeclinePct)}（Q3 = ${fixture.market.quarters[2].thisYear}）`,
      },
      ...params.marketEvents.map((event) => ({
        kind: 'event' as const,
        label: event.label,
        pct: isEventActiveAt(event, week.weekNumber) ? event.magnitudePct : null,
        note: isEventActiveAt(event, week.weekNumber) ? `生效中（W${event.startWeek} 起）` : `W${event.startWeek} 起生效`,
      })),
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
  const marketQuarters = fixture.market.quarters.map((quarter) =>
    quarter.thisYear != null
      ? { label: quarter.label, lastYear: quarter.lastYear, thisYear: quarter.thisYear, thisYearForecast: false }
      : { label: quarter.label, lastYear: quarter.lastYear, thisYear: forecastQuarterIndex(fixture, params.qoqDeclinePct), thisYearForecast: true },
  );

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
// 推演纪要：纯函数留痕（确定性演示时钟，不读系统时间）
// ------------------------------------------------------------

export type MemoType = '生成' | '考量' | '事件' | 'SI 计划' | '手调' | '纪要' | '情景' | '重置';

export interface MemoEntry {
  id: string;
  /** 演示时钟（初始 14:02，每条 +2 分钟）。 */
  time: string;
  type: MemoType;
  /** 操作人（演示名）。 */
  operator: string;
  content: string;
  reason?: string;
}

export const MEMO_BASE_MINUTES = 14 * 60 + 2;
export const MEMO_STEP_MINUTES = 2;
export const MEMO_DEMO_OPERATOR = '王峰';

/** 演示时钟：第 index 条（0 起）的时间文本。 */
export function memoTimeAt(index: number): string {
  const minutes = (MEMO_BASE_MINUTES + index * MEMO_STEP_MINUTES) % (24 * 60);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 追加纪要（纯函数）：返回新数组，id / 时间 / 操作人自动分配，原数组不变。 */
export function appendMemo(
  entries: MemoEntry[],
  input: { type: MemoType; content: string; reason?: string; operator?: string },
): MemoEntry[] {
  const index = entries.length;
  return [
    ...entries,
    {
      id: `memo-${index + 1}`,
      time: memoTimeAt(index),
      type: input.type,
      operator: input.operator ?? MEMO_DEMO_OPERATOR,
      content: input.content,
      reason: input.reason?.trim() ? input.reason.trim() : undefined,
    },
  ];
}

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

/** 纪要独立 HTML 文档（生成纪要导出用）：含摘要、当前考量、调整记录与演示边界声明。 */
export function buildMemoHtml(input: {
  fixture: WorkbenchFixture;
  params: WorkbenchParams;
  result: WorkbenchResult;
  memo: MemoEntry[];
}): string {
  const { fixture, params, result, memo } = input;
  const escape = (text: string): string =>
    text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);
  const fmtWan = (units: number): string => `${(units / 10000).toFixed(2)} 万台`;
  const rows = memo
    .map((entry) => `<tr><td>${entry.time}</td><td>${escape(entry.type)}</td><td>${escape(entry.operator)}</td><td>${escape(entry.content)}</td><td>${escape(entry.reason ?? '—')}</td></tr>`)
    .join('');
  const adjustedWeeks = result.weeks.filter((week) => week.inventoryAdjusted).map((week) => week.week);
  const summary = [
    `预测期总销量（${fixture.context.forecastRange}）：${fmtWan(result.summary.totalSales)}（${result.summary.vsHistoryPct > 0 ? '+' : ''}${result.summary.vsHistoryPct}% vs ${fixture.context.historyRange}）`,
    `大促峰 W${result.summary.peak.weekNumber}：${fmtWan(result.summary.peak.value)}（${result.summary.peak.note}）`,
    `库存修正缺口：${result.summary.gap > 0 ? `−${fmtWan(result.summary.gap)}（${adjustedWeeks.join('、') || '未触发'}）` : '未触发'}`,
    `预测期销毛：$${(result.summary.forecastMargin / 1e6).toFixed(1)}M（按月版本成本）`,
  ];
  const events = params.marketEvents.length
    ? params.marketEvents.map((event) => `${escape(event.label)} ${event.magnitudePct > 0 ? '+' : ''}${event.magnitudePct}%（W${event.startWeek} 起）`).join('；')
    : '无';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>PriceLens 量价预测推演纪要</title><style>body{font:14px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;max-width:1080px;margin:40px auto;padding:0 24px;color:#171717}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ebebeb;text-align:left;vertical-align:top}th{color:#737373}h1{font-size:22px}h2{font-size:17px;margin-top:28px}.note{color:#805b00;background:#ffefcf;padding:12px 16px;border-radius:8px}</style></head><body>`
    + `<h1>量价预测推演纪要 · ${escape(fixture.context.product)}</h1>`
    + `<p>${escape(fixture.context.country)} · ${escape(fixture.context.industry)} · ${escape(fixture.context.channel)} · 历史 ${fixture.context.historyRange} · 预测 ${fixture.context.forecastRange} · 生成于 ${fixture.meta.generatedAt}</p>`
    + `<p class="note">全部数值为演示模型输出（${fixture.meta.modelVersion}），不作为业务事实、统计结论或经营承诺。</p>`
    + `<h2>当前摘要</h2><ul>${summary.map((line) => `<li>${line}</li>`).join('')}</ul>`
    + `<h2>当前考量</h2><p>大盘 Q4 环比 ${params.qoqDeclinePct}%（${params.qoqSource === 'ai' ? 'AI 判断' : '人工确认'}）；事件：${events}。</p><p>理由：${escape(params.rationale || '—')}</p>`
    + `<h2>调整记录（${memo.length} 条）</h2><table><thead><tr><th>时间</th><th>类型</th><th>操作人</th><th>内容</th><th>原因</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<p>库存修正周：${adjustedWeeks.join('、') || '未触发'}；SI 计划（${fixture.context.forecastRange}）：${Object.values(params.siPlan).map((v) => Math.round(v / 1000)).join(' / ')} 千台。</p>`
    + `</body></html>`;
}
