// ============================================================
// 量价预测 · 推演工作台 v3 确定性模型（forecast-workbench-v3 · 任务 5 主链切换）
// 主链（B.2 / B.4.2）：每次 computeWorkbench 调用一次①学习器
// learnWorkbenchBaseline（本品历史 + 上一代同周龄 + 已知促销窗口）→
// learnedBase × 产品范围事件乘子 = baselineSales → × 大盘月生效值比值
// = marketAdjusted → 库存递推 min(marketAdjusted, 可售) = inventoryAdjusted →
// final = manual?.value ?? inventoryAdjusted。参考已进学习器：主链不再套旧
// referenceRatioAt 乘子（切换参考 = 重新学习）。
//   - ②大盘：computeMarketMonths（季度基线链外推覆盖 horizon 全部季度 → 统一
//     12 个预测月；部分实际季不重摊残差）+ marketFactorAt（周修正比值 =
//     所属月生效值 ÷ 所属月 AI 基线）；月生效值 = override ?? round1(baseline ×
//     月事件乘子)，月调整只写 marketMonthOverrides、不同步季度改格；
//   - ③库存：SI 月计划只分摊到各月预测周；逐周 available = 期初 + SI、
//     inventoryAdjusted = min(marketAdjusted, max(0, available))、supplyCapped
//     保留截断事实、DOS 继续用近 4 周均销（缺采/不可算周不入均值）；
//   - 手调：manual 改 WeekId 键控；手调不进入后续库存递推、不改变缺口；
//   - ④成本销毛 = 链路末端独立推测（unitMargin / weeklyMargin / summary 销毛
//     为任务 9 MarginView 到位前的过渡字段，数值全部模型侧计算，UI 不另算）。
// 2026-11-05 任务 5 移除的 v2 过渡槽位：q4Override / q1Override /
// overrideSource 手存字段、eventWeeklyFactor、marketSeriesBaseline、
// effectiveQuarterIndexes、withQuarterOverride、marketQuarterForecast、
// computeMarketMonths 两参重载（computeMarketMonthsV2）、
// productEventFactorAt 两参重载（裸周号）、computeMarketFactor、
// referenceRatioAt 主链乘子（替代为仅展示的同周龄比值）。
// 全部计算为纯函数：不读时间、不用随机数，同输入两次计算逐字段一致。
// ============================================================
import type { ForecastCalendar, ISODate, MonthKey, WeekId, WeekRange } from './workbenchCalendar';
import { buildForecastCalendar } from './workbenchCalendar';
import type { LearningEvidence } from './workbenchLearning';
import { learnWorkbenchBaseline } from './workbenchLearning';
import type { MarketEventSeed, MarketMonthEventSeed, ProductEventSeed, WorkbenchFixture } from './workbenchFixture';

/** TODO 待拍板（brief 开放问题 2）：DOS 合理带 70–90 天与降幅阈值 20%/30% 为演示规则，待业务确认与维护方。 */
export const DOS_BAND = { min: 70, max: 90 } as const;
/** TODO 待拍板：库存相对前 4 周均值降幅阈值（%）。 */
export const INV_CRASH_LIGHT_PCT = 20;
export const INV_CRASH_HEAVY_PCT = 30;

export type OverrideSource = 'ai' | 'human';

/**
 * 推演参数（v3 · B.4.2）：全部影响需求/库存主链的用户输入；来源元数据、
 * SI 确认状态、成本/价格情景分别放专用工作区，不塞进模型。
 * manual / 产品与大盘范围事件一律 WeekId（YYYYWww）键控或锚定，跨年不串值。
 */
export interface WorkbenchParams {
  /** 行业级大盘事件（人工录入假设，任意起止周闭区间；基准 = 空数组）。 */
  marketEvents: MarketEventSeed[];
  /** 人工月度事件（极简三字段：起始月/日 + 时长（月）+ 幅度%；名称选填）。 */
  marketMonthEvents: MarketMonthEventSeed[];
  /** 大盘按月调整（键 = 统一 12 个预测月键；value = 调整后指数，reason 选填可空）。 */
  marketMonthOverrides: Record<MonthKey, { value: number; reason: string }>;
  /** 主图小事件（产品级三类，任意起止周闭区间；一个事件一个范围）。 */
  productEvents: ProductEventSeed[];
  /** 人工 SI 月计划（台），键 = 统一 12 个预测月键；库存验证层唯一新输入。 */
  siPlanMonthly: Record<MonthKey, number>;
  /** 手调（键 = 预测周 WeekId）：值 + 选填原因（空串合法）。 */
  manual: Record<WeekId, { value: number; reason: string }>;
  /** 理由栏：为什么这么推（截图贴 PPT 的关键假设载体）。 */
  rationale: string;
  /** 上一代参照选择（受控）：进入①学习器做同周龄学习；切换 = 重新学习。 */
  prevGenReferenceId: string;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** 卡头人工状态派生（B.4.2）：overrideSource 不再手存——没有月调整为 AI 基线，有任一有效月调整为人工确认。 */
export function overrideSourceOf(params: Pick<WorkbenchParams, 'marketMonthOverrides'>): OverrideSource {
  return Object.keys(params.marketMonthOverrides).length > 0 ? 'human' : 'ai';
}

/** 基准考量：空事件 + 初始 SI 月计划 + 默认上一代参照（prevGenPool[0]），无手调无月调整。 */
export function baseWorkbenchParams(fixture: WorkbenchFixture): WorkbenchParams {
  const siPlanMonthly: Record<string, number> = {};
  fixture.forecastMonths.forEach((month) => {
    siPlanMonthly[month.key] = fixture.inventory.siPlanMonthly[month.key] ?? 0;
  });
  return {
    marketEvents: [],
    marketMonthEvents: [],
    marketMonthOverrides: {},
    productEvents: [],
    siPlanMonthly,
    manual: {},
    rationale: fixture.market.aiRationale,
    prevGenReferenceId: fixture.references.prevGenPool[0]?.id ?? '',
  };
}

/** 是否偏离基准考量（理由栏文本不参与判断，只看影响计算的项，含上一代参照选择）。 */
export function isParamsActive(params: WorkbenchParams, fixture: WorkbenchFixture): boolean {
  const base = baseWorkbenchParams(fixture);
  return (
    JSON.stringify(params.marketEvents) !== JSON.stringify(base.marketEvents)
    || JSON.stringify(params.marketMonthEvents) !== JSON.stringify(base.marketMonthEvents)
    || JSON.stringify(params.marketMonthOverrides) !== JSON.stringify(base.marketMonthOverrides)
    || JSON.stringify(params.productEvents) !== JSON.stringify(base.productEvents)
    || JSON.stringify(params.siPlanMonthly) !== JSON.stringify(base.siPlanMonthly)
    || Object.keys(params.manual).length > 0
    || params.prevGenReferenceId !== base.prevGenReferenceId
  );
}

// ------------------------------------------------------------
// 大盘月度段：季度基线链外推 → 逐月分布（容量守恒）+ 月度事件月中均摊
// + 按月调整（点击预测月）。全部纯函数、确定性、禁随机。
// ------------------------------------------------------------

/** 大盘按月调整的取值边界（40–200 同带）。 */
export const MONTH_OVERRIDE_MIN = 40;
export const MONTH_OVERRIDE_MAX = 200;

/** 日期（YYYY-MM-DD）→ 月键（YYYY-MM）；格式不合法返回 null。 */
export function monthKeyOfDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const month = Number(date.slice(5, 7));
  if (month < 1 || month > 12) return null;
  return date.slice(0, 7);
}

/** 季度键 '2027Q1' → 含三月键 ['2027-01','2027-02','2027-03']；非季度键返回空数组。 */
export function monthsOfQuarterKey(quarterKey: string): string[] {
  const match = /^(\d{4})Q([1-4])$/.exec(quarterKey);
  if (!match) return [];
  const year = Number(match[1]);
  const baseMonth = (Number(match[2]) - 1) * 3 + 1;
  return [baseMonth, baseMonth + 1, baseMonth + 2].map((month) => `${year}-${String(month).padStart(2, '0')}`);
}

/** 月键 → 所属季度键（'2027-03' → '2027Q1'）；月键不合法返回 null。 */
export function quarterKeyOfMonth(monthKey: string): string | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) return null;
  const quarter = Math.floor((Number(match[2]) - 1) / 3) + 1;
  return `${match[1]}Q${quarter}`;
}

/** 当月天数（公历口径，含闰年规则）；月键不合法返回 null。纯日历计算，不读系统时间。 */
export function daysInMonthOf(monthKey: string): number | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === 2 && leap ? 29 : lengths[month - 1];
}

/**
 * 月中事件当月覆盖占比（显式均摊口径）：月度大盘值均匀分摊到当月每一天
 * （每日 = 月值 ÷ 当月天数），事件自起始日（含当日）生效，当月覆盖占比 =
 * （当月天数 − 起始日 + 1）÷ 当月天数。起始日超出当月天数按当月末日处理
 * （不静默丢弃）。startDay 非有限数按全月（占比 1）处理。
 */
export function monthCoverageRatio(daysInMonth: number, startDay: number): number {
  if (!Number.isFinite(startDay)) return 1;
  const day = Math.min(Math.max(1, Math.round(startDay)), daysInMonth);
  return (daysInMonth - day + 1) / daysInMonth;
}

/** 月份差：startMonth → monthKey 的整月偏移（'2026-11' → '2027-01' = 2）；键不合法返回 null。 */
export function monthsBetween(startMonth: string, monthKey: string): number | null {
  const parse = (key: string): number | null => {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
    return match ? Number(match[1]) * 12 + (Number(match[2]) - 1) : null;
  };
  const start = parse(startMonth);
  const target = parse(monthKey);
  if (start == null || target == null) return null;
  return target - start;
}

/**
 * 月度事件在某月的乘子（月中按日均摊口径）：
 * - 覆盖首月（offset 0）：影响 = 幅度 × 当月覆盖占比（monthCoverageRatio）；
 * - 后续整月（offset ≥ 1）：影响 = 幅度 ×（1 − offset ÷ 时长月数）——衰减固定
 *   递减（三字段极简口径不再暴露衰减选择）；
 * - 覆盖外返回 null（不修正该月）。
 */
export function marketMonthEventFactor(event: MarketMonthEventSeed, monthKey: string): number | null {
  const offset = monthsBetween(event.startMonth, monthKey);
  if (offset == null || offset < 0 || offset >= event.durationMonths) return null;
  const dim = daysInMonthOf(monthKey);
  if (dim == null) return null;
  const coverage = offset === 0 ? monthCoverageRatio(dim, event.startDay) : 1;
  const impact = event.magnitudePct * (1 - offset / event.durationMonths);
  return 1 + (impact * coverage) / 100;
}

function nextQuarterKey(key: string): string {
  const match = /^(\d{4})Q([1-4])$/.exec(key);
  if (!match) return key;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return quarter === 4 ? `${year + 1}Q1` : `${year}Q${quarter + 1}`;
}

/** 去年同季三月权重（月形分布源）：缺月回退均等 1/3（显式回退，不造数）。 */
function lastYearMonthWeights(fixture: Pick<WorkbenchFixture, 'market'>, quarterKey: string): number[] {
  const match = /^(\d{4})Q([1-4])$/.exec(quarterKey);
  const fallback = [1 / 3, 1 / 3, 1 / 3];
  if (!match) return fallback;
  const lastYearMonths = monthsOfQuarterKey(`${Number(match[1]) - 1}Q${match[2]}`);
  const values = lastYearMonths.map((monthKey) => fixture.market.months.find((month) => month.key === monthKey)?.value);
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || (value as number) <= 0)) return fallback;
  const avg = (values.reduce<number>((sum, v) => sum + (v as number), 0)) / 3;
  if (!(avg > 0)) return fallback;
  return values.map((value) => (value as number) / avg);
}

/** 历史月点（单一来源）：fixture.market.months 原样（模拟样本，不动）。 */
function actualMarketMonthPoints(fixture: Pick<WorkbenchFixture, 'market'>): MarketMonthPoint[] {
  return fixture.market.months.map((month) => ({
    key: month.key,
    status: 'actual' as const,
    quarter: quarterKeyOfMonth(month.key) ?? '',
    baseline: month.value,
    eventFactor: null,
    value: month.value,
    override: null,
    reason: '',
  }));
}

/** 生效值链（单一规则）：月度事件月中按日均摊合成乘子；人工月调整覆盖事件后值。 */
function withMarketMonthChain(
  points: MarketMonthPoint[],
  params: Pick<WorkbenchParams, 'marketMonthEvents' | 'marketMonthOverrides'>,
): MarketMonthPoint[] {
  return points.map((point) => {
    if (point.status !== 'forecast') return point;
    let factor: number | null = null;
    for (const event of params.marketMonthEvents) {
      const monthly = marketMonthEventFactor(event, point.key);
      if (monthly != null) factor = (factor ?? 1) * monthly;
    }
    const entry = params.marketMonthOverrides[point.key];
    const override = entry != null && Number.isFinite(entry.value) ? entry.value : null;
    const value = override ?? round1(point.baseline * (factor ?? 1));
    return { ...point, eventFactor: factor, value, override, reason: entry?.reason ?? '' };
  });
}

/**
 * v3 季度基线链（B.4.5）：窗口 = quarters 前 4 / 后 4 季（thisYear 紧接 lastYear）；
 * 趋势 = thisYear 均值 ÷ lastYear 均值；入位比按窗口位置映射（进入位置 p（1–3）
 * = lastYear[p] ÷ lastYear[p−1]；进入位置 0 = lastYear[0] ÷ lastYear[3]）。
 * 链首格 = round1(最后实际季值 × 入位比 × 趋势)，之后沿链 round1(上一格 × 入位比
 * × 趋势)，外推到「季首月越出 horizon 终月」为止，覆盖 horizon 全部季度。
 * 季度不足两窗（< 8）或键不合法返回空链（不造数）；guard 24 季防异常输入死循环。
 */
function marketQuarterChainV3(
  fixture: Pick<WorkbenchFixture, 'market'>,
  horizonEnd: string,
): Array<{ key: string; value: number }> {
  const quarters = fixture.market.quarters;
  const values = quarters.map((quarter) => quarter.value);
  if (quarters.length === 0 || values.length < 8) return [];
  const windowStart = /^(\d{4})Q([1-4])$/.exec(quarters[0].key);
  const last = /^(\d{4})Q([1-4])$/.exec(quarters[quarters.length - 1].key);
  if (!windowStart || !last) return [];
  const lastYear = values.slice(0, 4);
  const thisYear = values.slice(4);
  const avg = (list: number[]): number => list.reduce((sum, v) => sum + v, 0) / list.length;
  const trend = avg(thisYear) / avg(lastYear);
  const intoRatio = (position: number): number => (position === 0 ? lastYear[0] / lastYear[3] : lastYear[position] / lastYear[position - 1]);
  const windowStartQuarter = Number(windowStart[2]);
  // 链首格（最后实际季的下一季）在窗口中的位置 =（入位季号 − 起窗季号 + 4）mod 4。
  let position = ((Number(last[2]) % 4) + 1 - windowStartQuarter + 4) % 4;
  let key = quarters[quarters.length - 1].key;
  let value = round1(values[values.length - 1] * intoRatio(position) * trend);
  const chain: Array<{ key: string; value: number }> = [];
  for (let guard = 0; guard < 24; guard += 1) {
    key = nextQuarterKey(key);
    if ((monthsOfQuarterKey(key)[0] ?? '') > horizonEnd) break;
    chain.push({ key, value });
    position = (position + 1) % 4;
    value = round1(value * intoRatio(position) * trend);
  }
  return chain;
}

/** 大盘月度点（月粒度主序列）：baseline = AI 口径（actual = fixture 值；forecast = 季度基线月分布）。 */
export interface MarketMonthPoint {
  /** 月键，如 '2026-11'。 */
  key: string;
  status: 'actual' | 'forecast';
  /** 所属季度键，如 '2026Q4'。 */
  quarter: string;
  /** AI 口径基线（人工未调整、无事件时的值）。 */
  baseline: number;
  /** 覆盖该月的月度事件合成乘子；无事件覆盖 = null。 */
  eventFactor: number | null;
  /** 生效值 = override ?? round1(baseline × (eventFactor ?? 1))。 */
  value: number;
  /** 人工按月调整值（未调整 = null）。 */
  override: number | null;
  /** 调整原因（选填，可为空串）。 */
  reason: string;
}

/**
 * 大盘月度主序列（v3 · B.4.5 唯一口径；v2 两参重载已随主链切换移除）：
 * - 季度基线链外推覆盖 horizon 全部季度（marketQuarterChainV3），先按月季同源
 *   规则生成全部月份，再筛选到统一 12 个预测月（calendar.forecastMonths）；
 *   不得只生成前两季后让 Q2 以后回退 1；
 * - 完整未来季：前两月 round1、末月吸收舍入残差（季内合计 = 季度基线 × 3）；
 * - 部分实际季（如 2026Q4 的 2026-10 已是实际月）：预测月各自 = round1(季度基线
 *   × 去年月形)，不把实际与旧季目标的差额重摊给未来月；
 * - 实际月 = fixture.market.months 原样；生效值链 = withMarketMonthChain。
 */
export function computeMarketMonths(
  fixture: WorkbenchFixture,
  calendar: ForecastCalendar,
  params: Pick<WorkbenchParams, 'marketMonthEvents' | 'marketMonthOverrides'>,
): MarketMonthPoint[] {
  const chain = marketQuarterChainV3(fixture, calendar.horizonEnd);
  const actualMonthKeys = new Set(fixture.market.months.map((month) => month.key));
  const horizonMonthKeys = new Set(calendar.forecastMonths.map((month) => month.key));
  const forecastPoints: MarketMonthPoint[] = [];
  for (const quarter of chain) {
    const monthKeys = monthsOfQuarterKey(quarter.key);
    const weights = lastYearMonthWeights(fixture, quarter.key);
    const futureIndexes = monthKeys
      .map((key, index) => (actualMonthKeys.has(key) ? -1 : index))
      .filter((index) => index >= 0);
    if (!futureIndexes.length) continue; // 整季已实际（契约外情形，防御：不产出预测月）
    if (futureIndexes.length === monthKeys.length) {
      // 完整未来季：前两月 round1，末月吸收残差（季内合计 = 季度基线 × 3，容量守恒）。
      const raw = monthKeys.map((key, index) => ({ key, raw: quarter.value * weights[index] }));
      const values = raw.map((month, index) => {
        if (index < raw.length - 1) return round1(month.raw);
        const total = round1(quarter.value * 3);
        const consumed = raw.slice(0, index).reduce((sum, item) => sum + Math.round(item.raw * 10) / 10, 0);
        return round1(total - consumed);
      });
      monthKeys.forEach((key, index) => {
        forecastPoints.push({
          key,
          status: 'forecast',
          quarter: quarter.key,
          baseline: values[index]!,
          eventFactor: null,
          value: values[index]!,
          override: null,
          reason: '',
        });
      });
    } else {
      // 部分实际季：各预测月独立取「季度基线 × 去年月形」（不重摊残差）。
      futureIndexes.forEach((index) => {
        const baseline = round1(quarter.value * weights[index]!);
        forecastPoints.push({
          key: monthKeys[index]!,
          status: 'forecast',
          quarter: quarter.key,
          baseline,
          eventFactor: null,
          value: baseline,
          override: null,
          reason: '',
        });
      });
    }
  }
  const horizonPoints = forecastPoints.filter((point) => horizonMonthKeys.has(point.key));
  return withMarketMonthChain([...actualMarketMonthPoints(fixture), ...horizonPoints], params);
}

/**
 * 大盘周修正比值（B.4.5）：factor = 该周所属月的生效值 ÷ 所属月 AI 基线；
 * 同一月所有预测周共用同一比值（不把指数当销量均摊）。
 * 周不在日历 / 无所属月点 / 基线非有限或 ≤ 0 时回退 1，note 写「大盘基线不可用，未修正」。
 */
export function marketFactorAt(
  calendar: ForecastCalendar,
  months: MarketMonthPoint[],
  weekId: WeekId,
): { factor: number; note: string } {
  const week = calendar.weekById.get(weekId);
  const point = week != null ? months.find((month) => month.key === week.monthKey) : undefined;
  const baseline = point?.baseline;
  if (point == null || typeof baseline !== 'number' || !Number.isFinite(baseline) || baseline <= 0) {
    return { factor: 1, note: '大盘基线不可用，未修正' };
  }
  const factor = point.value / baseline;
  return {
    factor,
    note: `所属月 ${point.key}：大盘生效值 ${point.value} ÷ AI 基线 ${baseline} = ×${factor.toFixed(2)}`,
  };
}

// ------------------------------------------------------------
// v3 自由范围事件（B.4.2 / B.4.6）：任意起止周 + 幅度 + 形状；
// offset / duration 一律按日历绝对 index（跨年 2026W53 → 2027W01 不串值）。
// ------------------------------------------------------------

/** 范围事件公共形状：大盘周口径事件与产品范围事件共用（B.4.6 单一公式）。 */
export type RangeEventSeed = WeekRange & {
  /** 脉冲幅度峰值（%，正 = 抬升，负 = 压低）。 */
  magnitudePct: number;
  /** 形状：递减（线性从峰值衰减）/ 恒定（全程峰值）。 */
  decay: 'decreasing' | 'flat';
};

/**
 * 范围事件在某周的乘子（B.4.6 确定性规则，唯一公式来源）：
 * - offset = week.index − startWeek.index；duration = end.index − start.index + 1；
 * - flat = 1 + magnitudePct / 100（全程峰值）；
 * - decreasing = 1 + magnitudePct × (1 − offset / duration) / 100（首周峰值、末周趋 1）；
 * - 范围外不乘（该事件乘子 = 1）；多事件按数组顺序连乘（数组顺序在归一化时稳定）；
 * - 起止周不在该日历、或起晚于止（倒置）的事件不乘（无效范围不静默造数）。
 */
export function rangeEventFactorAt(
  calendar: ForecastCalendar,
  events: ReadonlyArray<RangeEventSeed>,
  weekId: WeekId,
): number {
  const week = calendar.weekById.get(weekId);
  if (!week) return 1;
  let factor = 1;
  for (const event of events) {
    const start = calendar.weekById.get(event.startWeekId);
    const end = calendar.weekById.get(event.endWeekId);
    if (!start || !end || start.index > end.index) continue;
    const offset = week.index - start.index;
    const duration = end.index - start.index + 1;
    if (offset < 0 || offset >= duration) continue;
    factor *= event.decay === 'flat'
      ? 1 + event.magnitudePct / 100
      : 1 + (event.magnitudePct * (1 - offset / duration)) / 100;
  }
  return factor;
}

/**
 * 主图小事件乘子（v3 唯一口径；裸周号两参重载已随主链切换移除）：
 * 产品范围事件——只调 rangeEventFactorAt，不维护第二份公式；事件可携带
 * id / type / label / replayId 等额外字段（按 RangeEventSeed 结构子集接受）。
 */
export function productEventFactorAt(
  calendar: ForecastCalendar,
  events: ReadonlyArray<RangeEventSeed>,
  weekId: WeekId,
): number {
  return rangeEventFactorAt(calendar, events, weekId);
}

// ------------------------------------------------------------
// 证据信任读数（趋势窗口 6 个月 + 去年同季月形）：大盘卡证据浮框 /
// 图上趋势源段 / 徽章三步链的唯一数字来源，UI 不另算。
// ------------------------------------------------------------

/** 趋势证据窗口（2026-11-04 拍板定为 6 个月；与模型外推读数严格一致）。 */
export const MARKET_TREND_WINDOW_MONTHS = 6;

/** 趋势窗口月点：key = 月键；momPct = 相邻月环比（%，首月无上一月 = null）。 */
export interface MarketTrendWindowPoint {
  key: string;
  value: number;
  momPct: number | null;
}

/**
 * 近 6 个月实际段趋势窗口（纯函数）：窗口 = 收盘于最后一个实际月的连续
 * 6 个实际月（fixture.market.months 尾段，与 computeMarketMonths 历史段同源）；
 * 逐月环比 = 本月/上月 − 1（%），窗口环比均值 = 未取整环比的算术平均后
 * round1。实际月不足窗口时取全部实际月；无相邻月对时均值为 null（不造数）。
 */
export function marketTrendWindow(fixture: Pick<WorkbenchFixture, 'market'>): {
  months: MarketTrendWindowPoint[];
  avgMomPct: number | null;
} {
  const actual = fixture.market.months.slice(-MARKET_TREND_WINDOW_MONTHS);
  const months: MarketTrendWindowPoint[] = actual.map((point, index) => {
    const prev = index > 0 ? actual[index - 1]!.value : null;
    const momPct = prev != null && prev > 0 ? (point.value / prev - 1) * 100 : null;
    return { key: point.key, value: point.value, momPct: momPct == null ? null : round1(momPct) };
  });
  const rawRates = actual.slice(1).map((point, index) => (point.value / actual[index]!.value - 1) * 100);
  const avgMomPct = rawRates.length
    ? round1(rawRates.reduce((sum, rate) => sum + rate, 0) / rawRates.length)
    : null;
  return { months, avgMomPct };
}

/** 去年同季月形点：value = 去年该月实际值（缺月 null）；weight = 占季内均值权重。 */
export interface MarketMonthShapePoint {
  key: string;
  value: number | null;
  weight: number;
}

/**
 * 去年同季月形（纯函数）：与月形分布 lastYearMonthWeights 同源（缺月回退
 * 均等 1/3），供证据浮框「月形行」三根小柱与徽章三步链算例消费。
 * quarterKey 非法返回空数组。
 */
export function marketMonthShape(fixture: Pick<WorkbenchFixture, 'market'>, quarterKey: string): MarketMonthShapePoint[] {
  const match = /^(\d{4})Q([1-4])$/.exec(quarterKey);
  if (!match) return [];
  const lastYearQuarter = `${Number(match[1]) - 1}Q${match[2]}`;
  const keys = monthsOfQuarterKey(lastYearQuarter);
  const weights = lastYearMonthWeights(fixture, quarterKey);
  return keys.map((key, index) => {
    const value = fixture.market.months.find((month) => month.key === key)?.value;
    return { key, value: typeof value === 'number' && Number.isFinite(value) ? value : null, weight: weights[index]! };
  });
}

/**
 * 按月调整（纯函数 · v3 口径）：设置 / 还原某预测月的人工调整（value null =
 * 还原；原因选填，空串合法）。只写 marketMonthOverrides，不同步季度改格
 * （B.4.5 #6）；卡头人工状态由 overrideSourceOf 从有效月调整派生。
 */
export function withMarketMonthOverride(
  params: WorkbenchParams,
  monthKey: string,
  value: number | null,
  reason: string,
): WorkbenchParams {
  const overrides = { ...params.marketMonthOverrides };
  if (value == null || !Number.isFinite(value)) delete overrides[monthKey];
  else {
    overrides[monthKey] = {
      value: Math.max(MONTH_OVERRIDE_MIN, Math.min(MONTH_OVERRIDE_MAX, round1(value))),
      reason: reason.trim(),
    };
  }
  return { ...params, marketMonthOverrides: overrides };
}

/** 新增月度事件：ID 循环查重（`me-custom-N` 取第一个未使用值，删除任一事件不影响后续新增）。 */
export function nextMarketMonthEventId(existing: ReadonlyArray<MarketMonthEventSeed>): string {
  const used = new Set(existing.map((event) => event.id));
  let serial = 1;
  while (used.has(`me-custom-${serial}`)) serial += 1;
  return `me-custom-${serial}`;
}

// ------------------------------------------------------------
// 库存验证：推演 + 健康判定（预警解释）+ 刚性 min
// ------------------------------------------------------------

export interface InventoryRow {
  /** 跨年周 ID（YYYYWww；健康行与主链周同键，不再用裸周号）。 */
  weekId: WeekId;
  status: 'actual' | 'forecast';
  /** 基线 SO（历史实际 / 预测周 = 大盘修正后、库存验证前的需求；缺采为 null）。 */
  desiredSales: number | null;
  /** 实际/修正后销量：预测周 = min(基线 SO, 可售)，即刚性砍结果；缺采为 null。 */
  sales: number | null;
  /** 本周被刚性砍（sales < desired）。 */
  capped: boolean;
  si: number;
  /** 期末渠道库存（推演值）。 */
  channelInv: number;
  /** 渠道 DOS（天）= 期末库存 ÷ 近 4 周平均销量 × 7；销量不可算为 null。 */
  channelDos: number | null;
}

export interface HealthRow {
  /** 跨年周 ID（YYYYWww）。 */
  weekId: WeekId;
  channelDos: number | null;
  channelInv: number;
  /** 相对前 4 周库存均值的变动（%，负 = 下降）。 */
  invChangePct: number;
  dosOk: boolean;
  crash: 'none' | 'light' | 'heavy';
  capped: boolean;
  reasonText: string;
}

/**
 * 健康判定（演示规则，TODO 待拍板）：DOS 落在 70–90 天带 + 库存较前 4 周均值
 * 降幅 < 20% = 健康；越界 / 降幅超阈 = 预警（解释性），叠加刚性砍结果输出。
 * 销量不可算周（缺采 / 无法学习）DOS 记 null、判越界，解释文本显式说明。
 */
export function judgeInventoryHealth(rows: InventoryRow[]): HealthRow[] {
  return rows.map((row, index) => {
    const prevWindow = rows.slice(Math.max(0, index - 4), index).map((item) => item.channelInv);
    const prevAvg = prevWindow.length ? prevWindow.reduce((total, v) => total + v, 0) / prevWindow.length : row.channelInv;
    const invChangePct = prevAvg > 0 ? round1(((row.channelInv - prevAvg) / prevAvg) * 100) : 0;
    const dropPct = -invChangePct;
    const dosOk = row.channelDos != null && row.channelDos >= DOS_BAND.min && row.channelDos <= DOS_BAND.max;
    const crash: HealthRow['crash'] = dropPct >= INV_CRASH_HEAVY_PCT ? 'heavy' : dropPct >= INV_CRASH_LIGHT_PCT ? 'light' : 'none';
    const dosText = row.channelDos != null
      ? `DOS ${row.channelDos.toFixed(1)} 天在合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天内`
      : `DOS ${DOS_BAND.min}–${DOS_BAND.max} 天带不可算（销量不可算）`;
    const parts: string[] = [dosOk
      ? dosText
      : row.channelDos != null
        ? `DOS ${row.channelDos.toFixed(1)} 天越出合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天`
        : dosText];
    parts.push(crash === 'none'
      ? `库存较前 4 周均值 ${invChangePct > 0 ? '+' : ''}${invChangePct}%`
      : `库存较前 4 周均值下降 ${dropPct.toFixed(1)}%（≥${crash === 'heavy' ? INV_CRASH_HEAVY_PCT : INV_CRASH_LIGHT_PCT}%）`);
    const verdict = row.capped
      ? `库存不足以支撑基线 SO，按可售量修正至 ${Math.round(row.sales ?? 0).toLocaleString('en-US')} 台`
      : '库存可支撑基线 SO';
    return {
      weekId: row.weekId,
      channelDos: row.channelDos,
      channelInv: row.channelInv,
      invChangePct,
      dosOk,
      crash,
      capped: row.capped,
      reasonText: `${parts.join('；')} → ${verdict}`,
    };
  });
}

// ------------------------------------------------------------
// 主链：computeWorkbench（①学习 → 产品范围事件 → ②大盘 → ③库存 → 手调）
// ------------------------------------------------------------

export type ConsiderKind = 'market' | 'reference' | 'event' | 'productEvent' | 'promo' | 'inventory' | 'manual';

export interface ConsiderItem {
  kind: ConsiderKind;
  label: string;
  /** 影响幅度（%）；null = 本周无数值影响（不在影响窗口 / 比值中性 / 缺数回退），仅展示说明。 */
  pct: number | null;
  note: string;
}

export interface WorkbenchWeekResult {
  /** 跨年周 ID（YYYYWww，唯一主键；跨年标签用它本身，如 2027W01）。 */
  weekId: WeekId;
  /** ISO 周号读数（跨年不唯一，仅展示）。 */
  weekNumber: number;
  /** 周一完整日期（YYYY-MM-DD）。 */
  date: ISODate;
  /** 周一日期展示（MM-DD）。 */
  dateLabel: string;
  /** 所属月（按周一日期归属）。 */
  monthKey: MonthKey;
  status: 'actual' | 'forecast';
  /** 历史周销（台）；缺采周为 null（保留真实缺采状态，不转 0）。 */
  sales: number | null;
  /** ①学习器输出、产品事件前（仅预测周；无法学习为 null）。 */
  learnedBase: number | null;
  /** ①学习基线 × 产品范围事件（仅预测周）。 */
  baselineSales: number | null;
  /** ②大盘月生效值修正后、库存前（仅预测周）。 */
  marketAdjusted: number | null;
  /** ③库存 min 后、手调前（仅预测周）。 */
  inventoryAdjusted: number | null;
  /** 主图最终柱：手调优先，否则刚性砍结果（历史周 = 实际销量，缺采为 null）。 */
  final: number | null;
  /** 库存 min 是否在手调前触发（截断事实，不因手调丢失）。 */
  supplyCapped: boolean;
  /** 当前是否按库存结果显示：手调后 = false（final 为手调值）。 */
  capped: boolean;
  manual: { value: number; reason: string } | null;
  price: number;
  /** 默认上一代参照（prevGenPool[0]）同周龄周销（台）；缺点为 null。 */
  prevGenSales: number | null;
  si: number;
  /** 期末渠道库存（销量不可算周仍累加 SI；无法推演为 null，不伪造 0）。 */
  channelInv: number | null;
  /** 渠道 DOS（天）；销量不可算为 null（UI 显示「—」）。 */
  channelDos: number | null;
  /** 全流程 DOS（演示系数）；channelDos 为 null 时为 null。 */
  fullDos: number | null;
  /** 月版本成本（USD/台）。 */
  unitCost: number;
  /** 单台销毛 = 价格 − 当月成本（任务 9 起由 MarginView 提供的过渡字段）。 */
  unitMargin: number;
  /** 周销毛（USD，最终柱 × 单台销毛；任务 9 起由 MarginView 提供的过渡字段）。 */
  weeklyMargin: number;
  /** 本周健康判定行（仅预测周；预警解释输出框用）。 */
  health?: HealthRow;
  /** 本周考量构成（仅预测周，悬停浮窗用）。 */
  consider: ConsiderItem[];
}

export interface MarketQuarterPoint {
  key: string;
  value: number;
  status: 'actual' | 'forecast';
}

/** ①学习运行 = 学习证据 + 主链接线（B.4.2）：本次预测使用的参照与逐预测周产品事件乘子。 */
export interface LearningRun extends LearningEvidence {
  /** 本次学习使用的上一代参照 id（= params.prevGenReferenceId；切换 = 重新学习）。 */
  referenceId: string;
  /** 每个预测周的产品范围事件乘子（baselineSales = round(learnedBase × 该值)）。 */
  productFactorByWeek: Record<WeekId, number>;
}

export interface WorkbenchResult {
  weeks: WorkbenchWeekResult[];
  /** 大盘月度主序列（历史月 + 统一 12 个预测月；大盘卡月线唯一数据源）。 */
  marketMonths: MarketMonthPoint[];
  /** 大盘季度单序列（实际 + 季度基线链外推；季度只用于生成与解释大盘基线）。 */
  marketQuarters: MarketQuarterPoint[];
  /** 预测周健康判定（预警解释输出框用；先对完整库存序列判定，再筛预测周）。 */
  health: HealthRow[];
  /** 首个库存截断周（supplyCapped）的周 ID（未触发 = null；不因手调消失）。 */
  firstAdjustedWeek: WeekId | null;
  /** ①学习运行（证据 + 参照 + 逐周产品事件乘子；证据 UI 与测试同源消费）。 */
  learning: LearningRun;
  summary: {
    totalSales: number;
    peak: { weekId: WeekId; value: number; note: string };
    /** 供给缺口 = Σ 预测周库存推演的 (desiredSales − sales)，只算供给截断，不含手调。 */
    gap: number;
    /** vs 历史窗口（%；任务 9 起对照口径另设等长历史窗口的过渡字段）。 */
    vsHistoryPct: number;
    /** 预测期销毛（任务 9 起权威来源 = MarginView.forecastMargin 的过渡字段）。 */
    forecastMargin: number;
    /** 历史期销毛（任务 9 起权威来源 = MarginView.historyMargin 的过渡字段）。 */
    historyMargin: number;
  };
}

/** 月版本成本：按周所属月键取生效版本；该月无版本时回退首个版本（确定性，不造第二口径）。 */
export function unitCostOfWeek(fixture: WorkbenchFixture, monthKey: MonthKey): number {
  const version = fixture.costVersions.find((candidate) => candidate.monthKey === monthKey);
  return version?.unitCost ?? fixture.costVersions[0]?.unitCost ?? 0;
}

/**
 * 月 SI 计划 → 周序列（B.4.6 · 确定性整数余数分配）：只对每月 forecastWeekIds
 * 分配（SI 不分摊到已发生周）；每周先取 floor(月总量 / 周数)，余数按预测周序
 * 每周 +1（如 10001 台 / 4 周 = [2501,2500,2500,2500]，月总量守恒）。
 * 负值 / 非有限输入钳 0；可整除时与均分一致。
 */
export function siWeeklyPlan(
  calendar: ForecastCalendar,
  siPlanMonthly: Record<MonthKey, number>,
): Map<WeekId, number> {
  const plan = new Map<WeekId, number>();
  for (const month of calendar.forecastMonths) {
    if (!month.forecastWeekIds.length) continue;
    const raw = siPlanMonthly[month.key];
    const total = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    const per = Math.floor(total / month.forecastWeekIds.length);
    const remainder = total - per * month.forecastWeekIds.length;
    month.forecastWeekIds.forEach((weekId, weekIndex) => {
      plan.set(weekId, weekIndex < remainder ? per + 1 : per);
    });
  }
  return plan;
}

/**
 * 参考展示比值（仅展示，不进主链）：selected.points[i] / default.points[i]
 * （default = prevGenPool[0]，i = 该周在统一日历的同序位 = 同周龄对齐）。
 * v3 参考已进①学习器，主链不再乘该比值；本读数只供参考卡与考量浮窗说明。
 */
function referenceDisplayRatioAt(
  fixture: WorkbenchFixture,
  referenceId: string,
  weekIndex: number,
): { label: string; pct: number | null; note: string } | null {
  const defaultRef = fixture.references.prevGenPool[0] ?? null;
  const selected = fixture.references.prevGenPool.find((ref) => ref.id === referenceId) ?? null;
  if (selected == null || defaultRef == null) return null;
  const label = selected.label;
  const selectedPoint = selected.points[weekIndex];
  const defaultPoint = defaultRef.points[weekIndex];
  if (typeof selectedPoint !== 'number' || !Number.isFinite(selectedPoint)
    || typeof defaultPoint !== 'number' || !Number.isFinite(defaultPoint) || defaultPoint <= 0) {
    return { label, pct: null, note: '参照同周龄缺数，仅展示读数不可用' };
  }
  const ratio = selectedPoint / defaultPoint;
  return {
    label,
    pct: ratio === 1 ? null : round1((ratio - 1) * 100),
    note: `同周龄比值 ×${ratio.toFixed(2)}（${selected.label} / ${defaultRef.label}）· 供①学习参照，不另乘主链`,
  };
}

/** 促销窗口覆盖判定（起止不在日历或倒置的窗口不视为覆盖）。 */
function coveringPromoWindow(
  calendar: ForecastCalendar,
  windows: WorkbenchFixture['promoWindows'],
  weekId: WeekId,
): WorkbenchFixture['promoWindows'][number] | null {
  const week = calendar.weekById.get(weekId);
  if (!week) return null;
  for (const window of windows) {
    const start = calendar.weekById.get(window.startWeekId);
    const end = calendar.weekById.get(window.endWeekId);
    if (!start || !end || start.index > end.index) continue;
    if (week.index >= start.index && week.index <= end.index) return window;
  }
  return null;
}

/**
 * v3 主链（B.2 / B.4.2 / B.4.4 / B.4.5 / B.4.6）：外部签名保持
 * computeWorkbench(fixture, params)；每次调用学习器一次（切换参考 = 重新学习），
 * learnedBase × productEventFactor = baselineSales → × marketFactor =
 * marketAdjusted → 库存递推 min(marketAdjusted, 可售) → final = manual ??
 * inventoryAdjusted；不再套旧 referenceRatioAt 乘子；保留 supplyCapped / gap /
 * DOS 语义；主链结果确定性（同 fixture + 同 params 逐字段一致）。
 */
export function computeWorkbench(fixture: WorkbenchFixture, params: WorkbenchParams): WorkbenchResult {
  const calendar = buildForecastCalendar(fixture.calendar);
  // ① 自动学习（每次调用一次；切换参考 = 重新学习）。
  const learned = learnWorkbenchBaseline(fixture, calendar, params.prevGenReferenceId);
  // 逐预测周产品范围事件乘子（证据与主链同源；测试与证据 UI 消费同一份）。
  const productFactorByWeek: Record<WeekId, number> = {};
  for (const week of calendar.forecastWeeks) {
    productFactorByWeek[week.id] = productEventFactorAt(calendar, params.productEvents, week.id);
  }
  const learning: LearningRun = {
    ...learned.evidence,
    referenceId: params.prevGenReferenceId,
    productFactorByWeek,
  };
  // ② 大盘月生效值（月事件 + 人工月调整）与周修正比值。
  const months = computeMarketMonths(fixture, calendar, params);
  const siPlan = siWeeklyPlan(calendar, params.siPlanMonthly);
  let channelInv = fixture.inventory.initialChannelInv;
  const weeks: WorkbenchWeekResult[] = [];
  const inventoryRows: InventoryRow[] = [];

  calendar.weeks.forEach((calWeek, index) => {
    const fixtureWeek = fixture.weeks[index];
    if (fixtureWeek == null || fixtureWeek.id !== calWeek.id) {
      throw new Error(`workbenchModel: fixture 周序列与统一日历不同源（index ${index}）`);
    }
    const isForecast = calWeek.status === 'forecast';
    // SI：历史周用 historySi（按实际周序对齐），预测周用月计划分摊值。
    const si = isForecast ? (siPlan.get(calWeek.id) ?? 0) : (fixture.inventory.historySi[index] ?? 0);

    let learnedBase: number | null = null;
    let baselineSales: number | null = null;
    let marketAdjusted: number | null = null;
    let marketFactor = 1;
    let marketNote = '大盘基线不可用，未修正';
    if (isForecast) {
      learnedBase = learned.baseByWeek.get(calWeek.id) ?? null;
      const factor = marketFactorAt(calendar, months, calWeek.id);
      marketFactor = factor.factor;
      marketNote = factor.note;
      if (learnedBase != null) {
        // ① × 产品范围事件 → baselineSales；再 × 大盘比值 → marketAdjusted。
        baselineSales = Math.max(0, Math.round(learnedBase * (productFactorByWeek[calWeek.id] ?? 1)));
        marketAdjusted = Math.round(baselineSales * marketFactor);
      }
    }

    // ③ 库存递推（全序列连续：历史周按实际销量消耗，缺采周不消耗；阶段字段只写在预测周）。
    const desired = isForecast ? marketAdjusted : fixtureWeek.sales;
    const available = channelInv + si;
    const inventoryAdjusted = isForecast && desired != null ? Math.min(desired, Math.max(0, available)) : null;
    const supplyCapped = isForecast && desired != null && inventoryAdjusted != null && inventoryAdjusted < desired;
    const rowSales = isForecast ? inventoryAdjusted : fixtureWeek.sales;
    channelInv = Math.max(0, channelInv + si - (rowSales ?? 0));

    // DOS = 期末库存 ÷ 近 4 周平均销量 × 7（缺采 / 不可算周不入均值；无样本为 null）。
    const windowValues = inventoryRows.slice(-3).map((row) => row.sales).filter((value): value is number => value != null);
    const dosWindow = rowSales != null ? [...windowValues, rowSales] : windowValues;
    const rollingAvg = dosWindow.length ? dosWindow.reduce((total, v) => total + v, 0) / dosWindow.length : null;
    const channelDos = rollingAvg != null && rollingAvg > 0 ? round1((channelInv / rollingAvg) * 7) : null;
    inventoryRows.push({
      weekId: calWeek.id,
      status: calWeek.status,
      desiredSales: desired,
      sales: rowSales,
      capped: supplyCapped,
      si,
      channelInv,
      channelDos,
    });

    const manual = isForecast ? (params.manual[calWeek.id] ?? null) : null;
    const final = isForecast ? (manual != null ? manual.value : inventoryAdjusted) : fixtureWeek.sales;
    const unitCost = unitCostOfWeek(fixture, calWeek.monthKey);
    const unitMargin = fixtureWeek.price - unitCost;

    weeks.push({
      weekId: calWeek.id,
      weekNumber: calWeek.weekNumber,
      date: calWeek.date,
      dateLabel: fixtureWeek.dateLabel,
      monthKey: calWeek.monthKey,
      status: calWeek.status,
      sales: fixtureWeek.sales,
      learnedBase,
      baselineSales,
      marketAdjusted,
      inventoryAdjusted,
      final,
      supplyCapped,
      capped: supplyCapped && manual == null,
      manual,
      price: fixtureWeek.price,
      prevGenSales: fixture.references.prevGenPool[0]?.points[index] ?? null,
      si,
      channelInv,
      channelDos,
      fullDos: channelDos != null ? round1(channelDos * fixture.inventory.fullDosFactor) : null,
      unitCost,
      unitMargin,
      weeklyMargin: final != null ? final * unitMargin : 0,
      consider: [],
    });
  });

  const forecastWeekIds = new Set(calendar.forecastWeeks.map((week) => week.id));
  // 健康判定先对完整库存序列（含历史）跑，再筛预测周：降幅窗口不能缺历史段。
  const health = judgeInventoryHealth(inventoryRows).filter((row) => forecastWeekIds.has(row.weekId));
  const healthByWeek = new Map(health.map((row) => [row.weekId, row]));
  const forecastRows = inventoryRows.filter((row) => forecastWeekIds.has(row.weekId));
  const cappedForecast = forecastRows.filter((row) => row.capped);

  // 考量构成（仅预测周）：大盘月生效值 / 学习参照 / 范围事件 / 月度事件 /
  // 促销档期 / 库存修正 / 手调——数字全部来自模型同源计算，UI 不另算。
  weeks.forEach((week) => {
    if (week.status !== 'forecast') return;
    const calWeek = calendar.weekById.get(week.weekId);
    if (calWeek == null) return;
    const healthRow = healthByWeek.get(week.weekId);
    // 大盘项：pct 用 round1 后比值差、note 用 marketFactorAt 说明（数字与②同源）。
    const { factor, note } = marketFactorAt(calendar, months, week.weekId);
    const consider: ConsiderItem[] = [
      {
        kind: 'market',
        label: '大盘 · 月生效值',
        pct: factor !== 1 ? round1((factor - 1) * 100) : null,
        note,
      },
    ];
    const reference = referenceDisplayRatioAt(fixture, params.prevGenReferenceId, calWeek.index);
    if (reference) consider.push({ kind: 'reference', label: reference.label, pct: reference.pct, note: reference.note });
    for (const event of params.productEvents) {
      const start = calendar.weekById.get(event.startWeekId);
      const end = calendar.weekById.get(event.endWeekId);
      if (!start || !end || start.index > end.index) continue;
      if (calWeek.index < start.index || calWeek.index > end.index) continue;
      const single = rangeEventFactorAt(calendar, [event], week.weekId);
      consider.push({
        kind: 'productEvent',
        label: event.label.trim() !== '' ? event.label : '未命名产品事件',
        pct: single !== 1 ? round1((single - 1) * 100) : null,
        note: `范围事件 ${event.startWeekId}–${event.endWeekId} · 学习基线后叠加`,
      });
    }
    for (const event of params.marketMonthEvents) {
      const monthly = marketMonthEventFactor(event, calWeek.monthKey);
      if (monthly == null) continue;
      const pct = round1((monthly - 1) * 100);
      consider.push({
        kind: 'event',
        label: event.label.trim() !== '' ? event.label : '未命名事件',
        pct: pct === 0 ? null : pct,
        note: `月度事件 ${event.startMonth}-${event.startDay} 起 · ${event.durationMonths} 个月（月中按日均摊）`,
      });
    }
    const promo = coveringPromoWindow(calendar, fixture.promoWindows, week.weekId);
    consider.push({
      kind: 'promo',
      label: promo?.label ?? '促销档期',
      pct: null,
      note: promo ? '档期形状已含在学习基线促销特征内' : '不在档期',
    });
    consider.push({
      kind: 'inventory',
      label: '库存上限修正',
      pct: week.supplyCapped && (week.marketAdjusted ?? 0) > 0
        ? round1(((week.inventoryAdjusted ?? 0) / (week.marketAdjusted ?? 1) - 1) * 100)
        : null,
      note: week.supplyCapped ? healthRow?.reasonText ?? '可售不足，按可售量修正' : '库存可支撑',
    });
    if (week.manual != null) {
      const before = week.inventoryAdjusted ?? 0;
      consider.push({
        kind: 'manual',
        label: '人工手调',
        pct: before > 0 ? round1(((week.manual.value - before) / before) * 100) : null,
        note: week.manual.reason,
      });
    }
    week.consider = consider;
  });

  const historyWeeks = weeks.filter((week) => week.status === 'actual');
  const forecastWeeks = weeks.filter((week) => week.status === 'forecast');
  const historySalesTotal = historyWeeks.reduce((total, week) => total + (week.sales ?? 0), 0);
  const totalSales = forecastWeeks.reduce((total, week) => total + (week.final ?? 0), 0);
  // 供给缺口只算供给截断（库存推演 desiredSales − sales），手调不进缺口。
  const gap = forecastRows.reduce((total, row) => (
    row.desiredSales != null && row.sales != null ? total + Math.max(0, row.desiredSales - row.sales) : total
  ), 0);
  const peakWeekResult = forecastWeeks.reduce<WorkbenchWeekResult | null>(
    (best, week) => ((week.final ?? 0) > (best?.final ?? 0) ? week : best),
    null,
  );
  const peakPromo = peakWeekResult != null
    ? coveringPromoWindow(calendar, fixture.promoWindows, peakWeekResult.weekId)
    : null;
  const marketQuarters: MarketQuarterPoint[] = [
    ...fixture.market.quarters.map((quarter) => ({ key: quarter.key, value: quarter.value, status: 'actual' as const })),
    ...marketQuarterChainV3(fixture, calendar.horizonEnd).map((quarter) => ({ key: quarter.key, value: quarter.value, status: 'forecast' as const })),
  ];

  return {
    weeks,
    marketMonths: months,
    marketQuarters,
    health,
    firstAdjustedWeek: cappedForecast.length ? cappedForecast[0]!.weekId : null,
    learning,
    summary: {
      totalSales,
      peak: peakWeekResult != null
        ? {
          weekId: peakWeekResult.weekId,
          value: peakWeekResult.final ?? 0,
          note: peakPromo ? `${peakPromo.label}内周销最高` : '预测周销最高',
        }
        : { weekId: '', value: 0, note: '无预测周' },
      gap,
      vsHistoryPct: historySalesTotal > 0 ? round1((totalSales / historySalesTotal - 1) * 100) : 0,
      forecastMargin: forecastWeeks.reduce((total, week) => total + week.weeklyMargin, 0),
      historyMargin: historyWeeks.reduce((total, week) => total + week.weeklyMargin, 0),
    },
  };
}

// ------------------------------------------------------------
// 手调（原因选填：不填即可应用；原因填了则标注在主图手调处；WeekId 键控）
// ------------------------------------------------------------

/** 手调设置（纯函数）：原因选填（空原因照常应用，后台字段结构保留）；键 = 预测周 WeekId。 */
export function setManualAdjustment(
  params: WorkbenchParams,
  weekId: WeekId,
  value: number,
  reason: string,
): WorkbenchParams | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return { ...params, manual: { ...params.manual, [weekId]: { value: Math.round(value), reason: reason.trim() } } };
}

/** 清除某周手调。 */
export function clearManualAdjustment(params: WorkbenchParams, weekId: WeekId): WorkbenchParams {
  const manual = { ...params.manual };
  delete manual[weekId];
  return { ...params, manual };
}

// ------------------------------------------------------------
// 会话草稿恢复校验（坏 JSON / 错型 / 失效参照 / 非法范围回退基准，永不崩溃）
// ------------------------------------------------------------

const PRODUCT_EVENT_TYPES: readonly ProductEventSeed['type'][] = ['competitor-launch', 'own-promo', 'cannibalization'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 周 ID 格式（YYYYWww）。 */
const WEEK_ID_PATTERN = /^(\d{4})W(\d{2})$/;

/**
 * 范围事件公共校验（B.4.2 / Step 4）：起止周 ID 必须存在于统一日历（按 WeekId
 * sanitize），倒置范围（起晚于止）拒绝；label 选填（空串保留）。
 */
function sanitizeWeekRange(value: unknown, calendar: ForecastCalendar): WeekRange | null {
  if (!isRecord(value)) return null;
  const startWeekId = typeof value.startWeekId === 'string' && WEEK_ID_PATTERN.test(value.startWeekId)
    ? value.startWeekId
    : '';
  const endWeekId = typeof value.endWeekId === 'string' && WEEK_ID_PATTERN.test(value.endWeekId)
    ? value.endWeekId
    : '';
  const start = startWeekId !== '' ? calendar.weekById.get(startWeekId) : undefined;
  const end = endWeekId !== '' ? calendar.weekById.get(endWeekId) : undefined;
  if (!start || !end || start.index > end.index) return null;
  return { startWeekId, endWeekId };
}

function sanitizeMarketEvent(value: unknown, calendar: ForecastCalendar): MarketEventSeed | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const magnitudePct = finiteOrNull(value.magnitudePct);
  const range = sanitizeWeekRange(value, calendar);
  if (!id || magnitudePct == null || range == null) return null;
  return {
    id,
    label: typeof value.label === 'string' ? value.label : '',
    startWeekId: range.startWeekId,
    endWeekId: range.endWeekId,
    magnitudePct,
    decay: value.decay === 'flat' ? 'flat' : 'decreasing',
  };
}

function sanitizeProductEvent(value: unknown, calendar: ForecastCalendar, fixture: WorkbenchFixture): ProductEventSeed | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const magnitudePct = finiteOrNull(value.magnitudePct);
  const type = PRODUCT_EVENT_TYPES.includes(value.type as ProductEventSeed['type'])
    ? (value.type as ProductEventSeed['type'])
    : null;
  const replayId = typeof value.replayId === 'string' ? value.replayId : '';
  const replayExists = replayId !== '' && fixture.replayScenarios.some((scenario) => scenario.id === replayId);
  const range = sanitizeWeekRange(value, calendar);
  if (!id || type == null || magnitudePct == null || !replayExists || range == null) return null;
  return {
    id,
    type,
    // 名称选填：空串合法（不静默改写）。
    label: typeof value.label === 'string' ? value.label : '',
    startWeekId: range.startWeekId,
    endWeekId: range.endWeekId,
    magnitudePct,
    decay: value.decay === 'flat' ? 'flat' : 'decreasing',
    replayId,
  };
}

/** 月度事件校验：起始月须为合法 'YYYY-MM'；日 1–31、时长 1–24、幅度 −30..30 钳制；坏条目剔除。 */
function sanitizeMarketMonthEvent(value: unknown): MarketMonthEventSeed | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const startMonth = typeof value.startMonth === 'string' && /^(\d{4})-(0[1-9]|1[0-2])$/.test(value.startMonth)
    ? value.startMonth
    : '';
  const startDay = finiteOrNull(value.startDay);
  const durationMonths = finiteOrNull(value.durationMonths);
  const magnitudePct = finiteOrNull(value.magnitudePct);
  if (!id || !startMonth || startDay == null || durationMonths == null || magnitudePct == null) return null;
  return {
    id,
    label: typeof value.label === 'string' ? value.label : '',
    startMonth,
    startDay: Math.max(1, Math.min(31, Math.round(startDay))),
    durationMonths: Math.max(1, Math.min(24, Math.round(durationMonths))),
    magnitudePct: Math.max(-30, Math.min(30, magnitudePct)),
  };
}

/** 大盘按月调整校验：只保留统一 12 个预测月键、有限值（钳 40–200）；原因选填（去空白，空串合法）。 */
function sanitizeMonthOverrides(
  value: unknown,
  validMonthKeys: ReadonlySet<string>,
): Record<string, { value: number; reason: string }> {
  const source = isRecord(value) ? value : {};
  const overrides: Record<string, { value: number; reason: string }> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (!validMonthKeys.has(key) || !isRecord(entry)) continue;
    const amount = finiteOrNull(entry.value);
    if (amount == null) continue;
    overrides[key] = {
      value: Math.max(MONTH_OVERRIDE_MIN, Math.min(MONTH_OVERRIDE_MAX, amount)),
      reason: typeof entry.reason === 'string' ? entry.reason.trim() : '',
    };
  }
  return overrides;
}

/** SI 月计划归一：恰好统一日历 12 个预测月键；单月非数字（错型）回退基准月值；数字负值钳 0。 */
function sanitizeSiPlan(
  calendar: ForecastCalendar,
  value: unknown,
  base: Record<string, number>,
): Record<string, number> {
  const source = isRecord(value) ? value : {};
  const plan: Record<string, number> = {};
  for (const month of calendar.forecastMonths) {
    const amount = finiteOrNull(source[month.key]);
    plan[month.key] = amount != null ? Math.max(0, amount) : (base[month.key] ?? 0);
  }
  return plan;
}

/** 手调校验：只保留预测周 WeekId 键、有限非负值（值取整；原因选填，去空白，空串合法）。 */
function sanitizeManual(
  forecastWeekIds: ReadonlySet<string>,
  value: unknown,
): Record<string, { value: number; reason: string }> {
  const source = isRecord(value) ? value : {};
  const manual: Record<string, { value: number; reason: string }> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (!forecastWeekIds.has(key) || !isRecord(entry)) continue;
    const amount = finiteOrNull(entry.value);
    // 原因选填：空原因照常保留手调（后台字段结构不变）。
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    if (amount == null || amount < 0) continue;
    manual[key] = { value: Math.round(amount), reason };
  }
  return manual;
}

/**
 * 会话草稿恢复校验（v3）：输入未知数据（坏 JSON / 错型字段 / 失效参照）时逐项
 * 回退基准，返回值永远可直接进 computeWorkbench。
 * - 不读 v2 数字键草稿：q4/q1/overrideSource/裸周号 manual / 裸周号事件全部
 *   按 v3 契约丢弃（会话按 modelVersion=workbench-demo-v3 隔离，双保险）。
 * - marketEvents / productEvents：范围按 WeekId sanitize（未知 / 倒置拒绝），
 *   名称选填（空串保留）；产品事件回放 id 失效剔除。
 * - marketMonthOverrides：只保留统一 12 个预测月键（钳 40–200；空原因合法）。
 * - siPlanMonthly：归一到恰好 12 个月键；单月错型回退基准月值；负值钳 0。
 * - manual：只保留预测周 WeekId、有限非负值（值取整；空原因合法）。
 * - prevGenReferenceId：不在 prevGenPool → 回基准参照。
 */
export function normalizeWorkbenchParams(fixture: WorkbenchFixture, value: unknown): WorkbenchParams {
  const base = baseWorkbenchParams(fixture);
  if (!isRecord(value)) return base;
  const calendar = buildForecastCalendar(fixture.calendar);
  const forecastWeekIds = new Set(calendar.forecastWeeks.map((week) => week.id));
  const forecastMonthKeys = new Set(calendar.forecastMonths.map((month) => month.key));
  const validReferenceIds = new Set(fixture.references.prevGenPool.map((ref) => ref.id));
  const referenceId = typeof value.prevGenReferenceId === 'string' && validReferenceIds.has(value.prevGenReferenceId)
    ? value.prevGenReferenceId
    : base.prevGenReferenceId;
  return {
    marketEvents: Array.isArray(value.marketEvents)
      ? value.marketEvents.map((event) => sanitizeMarketEvent(event, calendar)).filter((event): event is MarketEventSeed => event != null)
      : base.marketEvents,
    marketMonthEvents: Array.isArray(value.marketMonthEvents)
      ? value.marketMonthEvents.map((event) => sanitizeMarketMonthEvent(event)).filter((event): event is MarketMonthEventSeed => event != null)
      : base.marketMonthEvents,
    marketMonthOverrides: sanitizeMonthOverrides(value.marketMonthOverrides, forecastMonthKeys),
    productEvents: Array.isArray(value.productEvents)
      ? value.productEvents.map((event) => sanitizeProductEvent(event, calendar, fixture)).filter((event): event is ProductEventSeed => event != null)
      : base.productEvents,
    siPlanMonthly: sanitizeSiPlan(calendar, value.siPlanMonthly, base.siPlanMonthly),
    manual: sanitizeManual(forecastWeekIds, value.manual),
    rationale: typeof value.rationale === 'string' ? value.rationale : base.rationale,
    prevGenReferenceId: referenceId,
  };
}
