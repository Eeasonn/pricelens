// ============================================================
// 量价预测 · 推演工作台 v2 确定性模型（forecast-workbench-v2）
// 2026-11-03 晚纲领版：大盘 = 纯时间序列基线（周期性季节 × 全局性趋势，
// AI 推第一版挂 AI 标，人工直接改预测格）+ 行业级事件四件套（起周 + 时长 +
// 脉冲幅度 + 衰减方式[默认递减]，周粒度，可落历史段作解释性标记）；
// 上一代参照（prevGenReferenceId）经同周龄比值校正进入主链，友商参照不进入；
// 主图小事件（竞品上市 / 营销价促 / 自家挤兑）按参考品回放段幅度局部修正；
// 库存验证 = 大盘+量价先出基线 SO → 反算 DOS/库存 → 健康判定（先跑完整
// 库存序列再筛预测周，预警解释）→ 刚性 min(基线 SO, 可售) 回写主图；
// supplyCapped 保留截断事实（手调不覆盖），供给缺口只算供给截断；
// 成本销毛 = 链路末端独立推测，不回写主图。
// 2026-11-04 拍板扩展（呈现层 + 大盘段，主链管线结构不动）：
//   - 大盘主序列改月粒度：季度基线链外推到未来 4 季（同季比 × 趋势，确定性，
//     前两季与既有 aiQ4/aiQ1 同源同值），预测月 = 季度基线按去年同期季内月形
//     分布（季内三月合计恒 = 季度基线 × 3，容量守恒）；
//   - 按月调整 = 点击预测月就地调整（marketMonthOverrides，原因选填），
//     有调整的季度经「季内三月（调整 ?? AI 基线）均值」同步 q4/q1Override
//     进主链（事件乘子不触发季度同步，回 AI 口径不变）；
//   - 人工月度事件三字段（起始月/日 + 时长（月）+ 幅度%，名称选填），
//     月中起始按日均摊：首月影响 × 覆盖天数 ÷ 当月天数（显式口径，非静默
//     造数），衰减固定递减；周口径行业事件（marketEvents）与主链结构不变。
//   - 证据信任 v2（2026-11-04 晚拍板）：趋势证据窗口 = 近 6 个月实际段
//     （MARKET_TREND_WINDOW_MONTHS），环比均值读数由 marketTrendWindow 导出，
//     大盘卡证据浮框 / 图上趋势源段 / 徽章三步链共用同一函数，UI 不另算
//     第二套数字；去年同季月形（marketMonthShape）与 lastYearMonthWeights
//     同源导出。口径注释：季度基线外推链（marketQuarterForecast：同季比 ×
//     年度趋势比）是主链口径、结构不动，6 个月窗口只服务「证据语言」读数
//     （趋势怎么来的），两套读数同出本文件、互不改写。
// 2026-11-05 v3 任务 4（IA 文档 B.4.5 / B.4.6；computeWorkbench 主链不动，
//   任务 5 独占切换）：
//   - computeMarketMonths 新增 (v3 fixture, calendar, params) 三参重载：季度基线
//     链外推到覆盖 horizon 的全部季度（按窗口位置映射同季比，与 v2 前两季同源
//     同值），再筛选统一 12 个预测月；部分实际季（2026Q4 的 2026-10 已实际）
//     不重摊残差，完整未来季三月合计 = 季度基线 × 3（末月吸收舍入残差）；
//   - marketFactorAt：周修正比值 = 所属月生效值 ÷ 所属月 AI 基线（基线不可用
//     回退 1 并注明）；
//   - rangeEventFactorAt / productEventFactorAt(calendar, …, weekId)：任意周范围
//     事件乘子（绝对 index，跨年不串值；flat / decreasing 两形状），产品事件只调
//     同一公式，不维护第二份；
//   - v2 两参重载与 computeWorkbench 主链保持原行为（v2/v3 并存至任务 5 移除）。
// 全部计算为纯函数：不读时间、不用随机数，同输入两次计算逐字段一致。
// ============================================================
import type { ForecastCalendar, WeekId, WeekRange } from './workbenchCalendar';
import type { MarketEventSeed, MarketMonthEventSeed, ProductEventSeed, WorkbenchFixture, WorkbenchFixtureV3 } from './workbenchFixture';
import { marketEventDisposition } from './workbenchTime';

/** TODO 待拍板（brief 开放问题 2）：DOS 合理带 70–90 天与降幅阈值 20%/30% 为演示规则，待业务确认与维护方。 */
export const DOS_BAND = { min: 70, max: 90 } as const;
/** TODO 待拍板：库存相对前 4 周均值降幅阈值（%）。 */
export const INV_CRASH_LIGHT_PCT = 20;
export const INV_CRASH_HEAVY_PCT = 30;

export type OverrideSource = 'ai' | 'human';

export interface WorkbenchParams {
  /** 人工直接修改的当前季（2026Q4）指数；null = 用 AI 时间序列基线。 */
  q4Override: number | null;
  /** 人工直接修改的下一季（2027Q1）指数；null = 用 AI 基线。 */
  q1Override: number | null;
  /** 预测格来源：ai = AI 时间序列基线（第一版）；human = 人工已改。 */
  overrideSource: OverrideSource;
  /** 行业级大盘事件（人工录入假设，至多预填默认值；不挂 AI 标）。 */
  marketEvents: MarketEventSeed[];
  /** 人工月度事件（极简三字段：起始月/日 + 时长（月）+ 幅度%；名称选填）。 */
  marketMonthEvents: MarketMonthEventSeed[];
  /** 大盘按月调整（键 = 预测月 '2027-03'；value = 调整后指数，reason 选填可空）。 */
  marketMonthOverrides: Record<string, { value: number; reason: string }>;
  /** 主图小事件（产品级三类，参考回放段预填幅度，可改）。 */
  productEvents: ProductEventSeed[];
  /** 人工 SI 月计划（台），键 = '2026-11' / '2026-12'；库存验证层唯一新输入。 */
  siPlanMonthly: Record<string, number>;
  /** 手调（键 = 周序号）：值 + 选填原因（填了则标注在主图手调处；2026-11-04 评审拍板改选填）。 */
  manual: Record<number, { value: number; reason: string }>;
  /** 理由栏：为什么这么推（截图贴 PPT 的关键假设载体）。 */
  rationale: string;
  /** 上一代参照选择（受控）：进入主链做同周龄比值校正；默认 = fixture.references.prevGenPool[0].id。友商参照不进入主链。 */
  prevGenReferenceId: string;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** 基准考量：AI 时间序列基线 + 预填默认事件 + 初始 SI 月计划 + 默认上一代参照，无手调。 */
export function baseWorkbenchParams(fixture: WorkbenchFixture): WorkbenchParams {
  const siPlanMonthly: Record<string, number> = {};
  fixture.forecastMonths.forEach((month) => {
    siPlanMonthly[month.key] = fixture.inventory.siPlanMonthly[month.key] ?? 0;
  });
  return {
    q4Override: null,
    q1Override: null,
    overrideSource: 'ai',
    marketEvents: fixture.defaultMarketEvents.map((event) => ({ ...event })),
    marketMonthEvents: fixture.defaultMarketMonthEvents.map((event) => ({ ...event })),
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
    params.q4Override !== base.q4Override
    || params.q1Override !== base.q1Override
    || JSON.stringify(params.marketEvents) !== JSON.stringify(base.marketEvents)
    || JSON.stringify(params.marketMonthEvents) !== JSON.stringify(base.marketMonthEvents)
    || JSON.stringify(params.marketMonthOverrides) !== JSON.stringify(base.marketMonthOverrides)
    || JSON.stringify(params.productEvents) !== JSON.stringify(base.productEvents)
    || JSON.stringify(params.siPlanMonthly) !== JSON.stringify(base.siPlanMonthly)
    || Object.keys(params.manual).length > 0
    || params.prevGenReferenceId !== base.prevGenReferenceId
  );
}

// ------------------------------------------------------------
// 大盘层：纯时间序列基线（AI 第一版）+ 事件周乘子 + 人工改格
// ------------------------------------------------------------

/** 事件在某周的脉冲乘子（覆盖周内；递减 = 线性从峰值衰减，恒定 = 全程峰值）；覆盖外 = null。 */
export function eventWeeklyFactor(event: MarketEventSeed, weekNumber: number): number | null {
  const offset = weekNumber - event.startWeek;
  if (offset < 0 || offset >= event.durationWeeks) return null;
  if (event.decay === 'flat') return 1 + event.magnitudePct / 100;
  const decayed = event.magnitudePct * (1 - offset / event.durationWeeks);
  return 1 + decayed / 100;
}

// ------------------------------------------------------------
// v3 自由范围事件（B.4.2 / B.4.6 · 任务 4）：任意起止周 + 幅度 + 形状；
// offset / duration 一律按日历绝对 index（跨年 2026W53 → 2027W01 不串值）。
// ------------------------------------------------------------

/** v3 范围事件公共形状：大盘周口径事件与产品范围事件共用（B.4.6 单一公式）。 */
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
 * 主图小事件乘子（双口径重载；任务 5 切 v3 主链后移除 v2 槽位）：
 * - v3（calendar, events, weekId）：产品范围事件——只调 rangeEventFactorAt，
 *   不维护第二份公式；事件可携带 id / type / label / replayId 等额外字段（按
 *   RangeEventSeed 结构子集接受）。
 * - v2（events, weekNumber）：锚定单周小事件（computeWorkbench v2 主链既有
 *   行为，保持不变：同周事件连乘 1 + magnitudePct / 100）。
 */
export function productEventFactorAt(calendar: ForecastCalendar, events: ReadonlyArray<RangeEventSeed>, weekId: WeekId): number;
export function productEventFactorAt(events: readonly ProductEventSeed[], weekNumber: number): number;
export function productEventFactorAt(
  calendarOrEvents: ForecastCalendar | readonly ProductEventSeed[],
  eventsOrWeekNumber: ReadonlyArray<RangeEventSeed> | number,
  weekId?: WeekId,
): number {
  if (typeof eventsOrWeekNumber === 'number') {
    const events = calendarOrEvents as readonly ProductEventSeed[];
    return events
      .filter((event) => event.week === eventsOrWeekNumber)
      .reduce((factor, event) => factor * (1 + event.magnitudePct / 100), 1);
  }
  return rangeEventFactorAt(calendarOrEvents as ForecastCalendar, eventsOrWeekNumber, weekId as WeekId);
}

/** AI 时间序列基线：周期性季节因素（去年同季比）× 全局性趋势因素（今年/去年水平比）。 */
export function marketSeriesBaseline(fixture: WorkbenchFixture): { aiQ4: number; aiQ1: number } {
  const values = fixture.market.quarters.map((quarter) => quarter.value);
  const lastYear = values.slice(0, 4);
  const thisYear = values.slice(4);
  const seasonQ4 = lastYear[3] / lastYear[2];
  const seasonQ1 = lastYear[0] / lastYear[3];
  const avg = (list: number[]): number => list.reduce((sum, v) => sum + v, 0) / list.length;
  const trend = avg(thisYear) / avg(lastYear);
  const aiQ4 = round1(thisYear[thisYear.length - 1] * seasonQ4 * trend);
  const aiQ1 = round1(aiQ4 * seasonQ1 * trend);
  return { aiQ4, aiQ1 };
}

/** 当前生效的两格推演值（人工改格优先，否则 AI 基线）。 */
export function effectiveQuarterIndexes(
  fixture: WorkbenchFixture,
  params: Pick<WorkbenchParams, 'q4Override' | 'q1Override'>,
): { q4Index: number; q1Index: number } {
  const { aiQ4, aiQ1 } = marketSeriesBaseline(fixture);
  return { q4Index: params.q4Override ?? aiQ4, q1Index: params.q1Override ?? aiQ1 };
}

/**
 * 季度覆盖编辑（纯函数）：设置 'q4' / 'q1' 的人工改格值（null = 还原该格）。
 * 按修改后的 Q4／Q1 重算 overrideSource：任一格非 null = human；两者都 null = 回 ai。
 */
export function withQuarterOverride(
  params: WorkbenchParams,
  field: 'q4' | 'q1',
  value: number | null,
): WorkbenchParams {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const next: WorkbenchParams = { ...params, [field === 'q4' ? 'q4Override' : 'q1Override']: safeValue };
  const overrideSource: OverrideSource = next.q4Override != null || next.q1Override != null ? 'human' : 'ai';
  return { ...next, overrideSource };
}

// ------------------------------------------------------------
// 大盘月度段（2026-11-04 拍板）：季度基线外推 4 季 → 逐月分布（容量守恒）
// + 按月调整（点击预测月）+ 月度事件月中均摊。全部纯函数、确定性、禁随机。
// ------------------------------------------------------------

/** 大盘按月调整的取值边界（与季度改格 40–200 同带）。 */
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
 *   递减（三字段极简口径不再暴露衰减选择；与周口径事件递减默认同语言）；
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

/**
 * 未来 4 个季度的 AI 基线（确定性外推，禁随机）：前两季 = 既有
 * marketSeriesBaseline 的 aiQ4/aiQ1（与主链单格口径同源同值，不出现第二套
 * 数字）；后两季沿同一链继续（同季比 × 趋势；链上取上一格四舍五入值，
 * 与 aiQ1 链式口径一致）。
 */
export function marketQuarterForecast(fixture: WorkbenchFixture): Array<{ key: string; value: number }> {
  const { aiQ4, aiQ1 } = marketSeriesBaseline(fixture);
  const values = fixture.market.quarters.map((quarter) => quarter.value);
  const lastYear = values.slice(0, 4);
  const avg = (list: number[]): number => list.reduce((sum, v) => sum + v, 0) / list.length;
  const trend = avg(values.slice(4)) / avg(lastYear);
  let key = fixture.market.quarters[fixture.market.quarters.length - 1]?.key ?? '';
  const keys: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    key = nextQuarterKey(key);
    keys.push(key);
  }
  const q2 = round1(aiQ1 * (lastYear[1] / lastYear[0]) * trend);
  const q3 = round1(q2 * (lastYear[2] / lastYear[1]) * trend);
  return [
    { key: keys[0], value: aiQ4 },
    { key: keys[1], value: aiQ1 },
    { key: keys[2], value: q2 },
    { key: keys[3], value: q3 },
  ];
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

/** 历史月点（v2/v3 共用单一来源）：fixture.market.months 原样（模拟样本，不动）。 */
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

/** 生效值链（v2/v3 单一规则）：月度事件月中按日均摊合成乘子；人工月调整覆盖事件后值。 */
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
 * 大盘月度主序列 v2 实现（历史月 + 未来 4 季度逐月预测；既有行为保持不变）：
 * - 历史月直接取 fixture.market.months（模拟样本，不动）；
 * - 预测月 = 季度基线 × 去年同季月形权重；round1 后季内末月吸收舍入残差，
 *   保证季内三月合计精确 = 季度基线 × 3（容量守恒）；
 * - 生效值链与 v3 共用 withMarketMonthChain（单一规则来源）。
 */
function computeMarketMonthsV2(
  fixture: WorkbenchFixture,
  params: Pick<WorkbenchParams, 'marketMonthEvents' | 'marketMonthOverrides'>,
): MarketMonthPoint[] {
  const forecastQuarters = marketQuarterForecast(fixture);
  const forecastPoints: MarketMonthPoint[] = [];
  for (const quarter of forecastQuarters) {
    const monthKeys = monthsOfQuarterKey(quarter.key);
    const weights = lastYearMonthWeights(fixture, quarter.key);
    // month_i = 季度基线 ×（去年同季该月 ÷ 去年同季月均）≈ 季度基线；季内合计 = 基线 × 3。
    const raw = monthKeys.map((key, index) => ({ key, raw: quarter.value * weights[index] }));
    // 容量守恒：前两月 round1，末月吸收残差（季内合计精确 = 季度基线 × 3）。
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
        baseline: values[index],
        eventFactor: null,
        value: values[index],
        override: null,
        reason: '',
      });
    });
  }
  return withMarketMonthChain([...actualMarketMonthPoints(fixture), ...forecastPoints], params);
}

/**
 * v3 季度基线链（与 marketSeriesBaseline / marketQuarterForecast 同源同规则，
 * 唯一差别：外推到「季首月越出 horizon 终月」为止，覆盖 horizon 全部季度）：
 * - 窗口 = quarters 前 4 / 后 4 季（thisYear 紧接 lastYear）；趋势 = thisYear 均值 ÷ lastYear 均值；
 * - 入位比按窗口位置映射（v2 固定 Q1 起窗时与原公式逐值一致；v3 fixture 起窗
 *   2024Q4，位置 0…3 = Q4,Q1,Q2,Q3，逐季同样得到日历一致的「进入该季 ÷ 上一季」比）：
 *   进入位置 p（1–3）= lastYear[p] ÷ lastYear[p−1]；进入位置 0 = lastYear[0] ÷ lastYear[3]；
 * - 链首格 = round1(最后实际季值 × 入位比 × 趋势)，之后沿链 round1(上一格 × 入位比 × 趋势)；
 * - 季度不足两窗（< 8）或键不合法返回空链（不造数）；guard 24 季防异常输入死循环。
 */
function marketQuarterChainV3(
  fixture: Pick<WorkbenchFixtureV3, 'market'>,
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

/**
 * 大盘月度主序列 v3 实现（B.4.5 · 任务 4）：
 * - 季度链外推覆盖 horizon 全部季度（marketQuarterChainV3），先按原月季同源
 *   规则生成全部月份，再筛选到统一 12 个预测月（calendar.forecastMonths）；
 *   不得只生成前两季后让 Q2 以后回退 1；
 * - 完整未来季：前两月 round1、末月吸收舍入残差（季内合计 = 季度基线 × 3）；
 * - 部分实际季（如 2026Q4 的 2026-10 已是实际月）：预测月各自 = round1(季度基线
 *   × 去年月形)，不把实际与旧季目标的差额重摊给未来月（季度读数改按
 *   「实际 + 基线」月均由展示层另算，不在本函数输出）；
 * - 实际月 = fixture.market.months 原样；生效值链与 v2 共用 withMarketMonthChain。
 */
function computeMarketMonthsV3(
  fixture: WorkbenchFixtureV3,
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
          baseline: values[index],
          eventFactor: null,
          value: values[index],
          override: null,
          reason: '',
        });
      });
    } else {
      // 部分实际季：各预测月独立取「季度基线 × 去年月形」（不重摊残差）。
      futureIndexes.forEach((index) => {
        const baseline = round1(quarter.value * weights[index]);
        forecastPoints.push({
          key: monthKeys[index],
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
 * 大盘月度主序列（重载并存至任务 5 移除 v2 槽位）：
 * - v3（fixture, calendar, params）（B.4.5 · 任务 4）：季度基线链外推覆盖 horizon
 *   全部季度 → 统一 12 个预测月；部分实际季不重摊残差；完整未来季容量守恒；
 * - v2（fixture, params）：历史月 + 未来 4 季逐月（computeWorkbench v2 主链与
 *   MarketBusPanel 既有消费，行为不变）。
 * 实际月与生效值链两口径同源（actualMarketMonthPoints / withMarketMonthChain）。
 */
export function computeMarketMonths(
  fixture: WorkbenchFixtureV3,
  calendar: ForecastCalendar,
  params: Pick<WorkbenchParams, 'marketMonthEvents' | 'marketMonthOverrides'>,
): MarketMonthPoint[];
export function computeMarketMonths(
  fixture: WorkbenchFixture,
  params: Pick<WorkbenchParams, 'marketMonthEvents' | 'marketMonthOverrides'>,
): MarketMonthPoint[];
export function computeMarketMonths(
  fixture: WorkbenchFixture | WorkbenchFixtureV3,
  calendarOrParams: ForecastCalendar | Pick<WorkbenchParams, 'marketMonthEvents' | 'marketMonthOverrides'>,
  maybeParams?: Pick<WorkbenchParams, 'marketMonthEvents' | 'marketMonthOverrides'>,
): MarketMonthPoint[] {
  if (maybeParams != null) {
    return computeMarketMonthsV3(fixture as WorkbenchFixtureV3, calendarOrParams as ForecastCalendar, maybeParams);
  }
  return computeMarketMonthsV2(
    fixture as WorkbenchFixture,
    calendarOrParams as Pick<WorkbenchParams, 'marketMonthEvents' | 'marketMonthOverrides'>,
  );
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
// 证据信任 v2（2026-11-04 晚拍板）：趋势窗口 6 个月 + 去年同季月形读数。
// 模型侧唯一口径：大盘卡证据浮框（趋势行 sparkline / 月形行小柱 / 算例）、
// 图上「趋势源段」双锚点、卡头徽章三步链全部消费这两个导出，UI 不另算。
// 口径注释：季度基线外推链（marketQuarterForecast，同季比 × 年度趋势比）
// 是主链口径、结构不动；6 个月窗口是「证据语言」读数（回答趋势从哪来），
// 两者同出本文件、互不改写，不允许 UI 与模型两套口径。
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
 * round1（展示值逐月 round1，均值由原始值计算更精确）。实际月不足窗口时
 * 取全部实际月；无相邻月对时均值为 null（不造数）。
 */
export function marketTrendWindow(fixture: WorkbenchFixture): {
  months: MarketTrendWindowPoint[];
  avgMomPct: number | null;
} {
  const actual = fixture.market.months.slice(-MARKET_TREND_WINDOW_MONTHS);
  const months: MarketTrendWindowPoint[] = actual.map((point, index) => {
    const prev = index > 0 ? actual[index - 1].value : null;
    const momPct = prev != null && prev > 0 ? (point.value / prev - 1) * 100 : null;
    return { key: point.key, value: point.value, momPct: momPct == null ? null : round1(momPct) };
  });
  const rawRates = actual.slice(1).map((point, index) => (point.value / actual[index].value - 1) * 100);
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
export function marketMonthShape(fixture: WorkbenchFixture, quarterKey: string): MarketMonthShapePoint[] {
  const match = /^(\d{4})Q([1-4])$/.exec(quarterKey);
  if (!match) return [];
  const lastYearQuarter = `${Number(match[1]) - 1}Q${match[2]}`;
  const keys = monthsOfQuarterKey(lastYearQuarter);
  const weights = lastYearMonthWeights(fixture, quarterKey);
  return keys.map((key, index) => {
    const value = fixture.market.months.find((month) => month.key === key)?.value;
    return { key, value: typeof value === 'number' && Number.isFinite(value) ? value : null, weight: weights[index] };
  });
}

/**
 * 按月调整（纯函数）：设置 / 还原某预测月的人工调整（value null = 还原；
 * 原因选填，空串合法），并同步季度改格进主链——
 * 有人工调整的季度：q4/q1Override = 季内三月（调整 ?? AI 月基线）均值（人工确认）；
 * 无人工调整的季度：对应 override 回 null（回 AI）。事件乘子不参与季度同步
 * （事件走周口径主链修正段），季度同步永不改变 AI 口径本身。
 */
export function withMarketMonthOverride(
  params: WorkbenchParams,
  fixture: WorkbenchFixture,
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
  const months = computeMarketMonths(fixture, { marketMonthEvents: params.marketMonthEvents, marketMonthOverrides: overrides });
  const syncQuarters = marketQuarterForecast(fixture).slice(0, 2).map((quarter) => quarter.key);
  const quarterOverride = (quarterKey: string): number | null => {
    const quarterMonths = months.filter((point) => point.quarter === quarterKey && point.status === 'forecast');
    if (!quarterMonths.length || !quarterMonths.some((point) => overrides[point.key] != null)) return null;
    const avg = quarterMonths.reduce((sum, point) => sum + (overrides[point.key]?.value ?? point.baseline), 0) / quarterMonths.length;
    return round1(avg);
  };
  const q4Override = syncQuarters[0] ? quarterOverride(syncQuarters[0]) : null;
  const q1Override = syncQuarters[1] ? quarterOverride(syncQuarters[1]) : null;
  const overrideSource: OverrideSource = q4Override != null || q1Override != null ? 'human' : 'ai';
  return { ...params, marketMonthOverrides: overrides, q4Override, q1Override, overrideSource };
}

/** 新增月度事件：ID 循环查重（`me-custom-N` 取第一个未使用值，删除任一事件不影响后续新增）。 */
export function nextMarketMonthEventId(existing: ReadonlyArray<MarketMonthEventSeed>): string {
  const used = new Set(existing.map((event) => event.id));
  let serial = 1;
  while (used.has(`me-custom-${serial}`)) serial += 1;
  return `me-custom-${serial}`;
}

/**
 * 周度大盘考量倍数（只作用于预测周 W45+）：人工改格比率（当前 Q4 生效值 / AI 基线）
 * × 行业级事件乘子 × 月度事件乘子（按周所属月份取当月乘子，月中按日均摊）
 * 直接叠加（事件 = 人工录入假设：删除即回落、改参数即换乘子）。
 * 预测窗口 W45–W52 全部落在 2026Q4，改格比率按 Q4 口径作用；
 * historical 事件（起周早于首个预测周）只作解释，一律跳过，不修正预测周。
 */
export function computeMarketFactor(
  fixture: WorkbenchFixture,
  params: Pick<WorkbenchParams, 'q4Override' | 'marketEvents' | 'marketMonthEvents'>,
  weekNumber: number,
): number {
  const { aiQ4 } = marketSeriesBaseline(fixture);
  const overrideRatio = (params.q4Override ?? aiQ4) / aiQ4;
  let eventFactor = 1;
  for (const event of params.marketEvents) {
    if (marketEventDisposition(fixture, event) === 'historical') continue;
    const factor = eventWeeklyFactor(event, weekNumber);
    if (factor != null) eventFactor *= factor;
  }
  // 月度事件（三字段 · 月中按日均摊）：按周完整日期所属月份取当月乘子；
  // 周日期缺失 / 月份不合法时跳过（不造数）。附加叠加，周口径事件结构不变。
  const weekDate = fixture.weeks.find((week) => week.weekNumber === weekNumber)?.date;
  const monthKey = weekDate ? monthKeyOfDate(weekDate) : null;
  if (monthKey != null) {
    for (const event of params.marketMonthEvents) {
      const factor = marketMonthEventFactor(event, monthKey);
      if (factor != null) eventFactor *= factor;
    }
  }
  return overrideRatio * eventFactor;
}

// ------------------------------------------------------------
// 库存验证：推演 + 健康判定（预警解释）+ 刚性砍
// ------------------------------------------------------------

export interface InventoryRow {
  weekNumber: number;
  status: 'actual' | 'forecast';
  /** 基线 SO（历史实际 / 预测周 = 大盘+量价考量后的无约束需求）。 */
  desiredSales: number;
  /** 实际/修正后销量：预测周 = min(基线 SO, 可售)，即刚性砍结果。 */
  sales: number;
  /** 本周被刚性砍（sales < desired）。 */
  capped: boolean;
  si: number;
  /** 期末渠道库存（推演值）。 */
  channelInv: number;
  /** 渠道 DOS（天）= 期末库存 ÷ 近 4 周平均销量 × 7。 */
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
  capped: boolean;
  reasonText: string;
}

/**
 * 健康判定（演示规则，TODO 待拍板）：DOS 落在 70–90 天带 + 库存较前 4 周均值
 * 降幅 < 20% = 健康；越界 / 降幅超阈 = 预警（解释性），叠加刚性砍结果输出。
 */
export function judgeInventoryHealth(rows: InventoryRow[]): HealthRow[] {
  return rows.map((row, index) => {
    const prevWindow = rows.slice(Math.max(0, index - 4), index).map((item) => item.channelInv);
    const prevAvg = prevWindow.length ? prevWindow.reduce((total, v) => total + v, 0) / prevWindow.length : row.channelInv;
    const invChangePct = prevAvg > 0 ? round1(((row.channelInv - prevAvg) / prevAvg) * 100) : 0;
    const dropPct = -invChangePct;
    const dosOk = row.channelDos >= DOS_BAND.min && row.channelDos <= DOS_BAND.max;
    const crash: HealthRow['crash'] = dropPct >= INV_CRASH_HEAVY_PCT ? 'heavy' : dropPct >= INV_CRASH_LIGHT_PCT ? 'light' : 'none';
    const parts: string[] = [];
    if (dosOk) parts.push(`DOS ${row.channelDos.toFixed(1)} 天在合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天内`);
    else parts.push(`DOS ${row.channelDos.toFixed(1)} 天越出合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天`);
    parts.push(crash === 'none'
      ? `库存较前 4 周均值 ${invChangePct > 0 ? '+' : ''}${invChangePct}%`
      : `库存较前 4 周均值下降 ${dropPct.toFixed(1)}%（≥${crash === 'heavy' ? INV_CRASH_HEAVY_PCT : INV_CRASH_LIGHT_PCT}%）`);
    const verdict = row.capped
      ? `库存不足以支撑基线 SO，刚性修正至 ${Math.round(row.sales).toLocaleString('en-US')} 台`
      : '库存可支撑基线 SO';
    return {
      weekNumber: row.weekNumber,
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
// 主链：computeWorkbench
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
  week: string;
  weekNumber: number;
  dateLabel: string;
  status: 'actual' | 'forecast';
  /** 历史周销（台）。 */
  sales: number | null;
  /** 基线 SO（台，仅预测周）：大盘+量价+参照考量后、库存验证前的需求。不上主图。 */
  unconstrained: number | null;
  /** 库存 min 是否在手调前触发（截断事实，不因手调丢失）。 */
  supplyCapped: boolean;
  /** 当前是否按库存结果显示：手调后 = false（final 为手调值）。 */
  capped: boolean;
  /** 主图最终柱：手调优先，否则刚性砍结果（仅预测周）。 */
  final: number | null;
  manual: { value: number; reason: string } | null;
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
  /** 周销毛（USD，主图最终柱 × 单台销毛）。 */
  weeklyMargin: number;
  health?: HealthRow;
  /** 本周考量构成（仅预测周，悬停浮窗用）。 */
  consider: ConsiderItem[];
}

export interface MarketQuarterPoint {
  key: string;
  value: number;
  status: 'actual' | 'forecast';
  /** 推演格附 AI 时间序列基线（ghost 对照）；人工未改时 = value。 */
  aiBaseline?: number;
}

export interface WorkbenchResult {
  weeks: WorkbenchWeekResult[];
  /** 大盘季度单序列（2025Q1 连贯到当前实际 + 2026Q4/2027Q1 推演，附 AI 基线）。 */
  marketQuarters: MarketQuarterPoint[];
  /** 大盘月度主序列（历史月 + 未来 4 季度逐月预测；大盘卡月线唯一数据源）。 */
  marketMonths: MarketMonthPoint[];
  /** 预测周健康判定（预警解释输出框用；先对完整库存序列判定，再筛预测周）。 */
  health: HealthRow[];
  /** 首个库存截断周（supplyCapped）的周序号（未触发 = null；不因手调消失）。 */
  firstAdjustedWeek: number | null;
  summary: {
    totalSales: number;
    vsHistoryPct: number;
    peak: { weekNumber: number; value: number; note: string };
    /** 供给缺口 = Σ 预测周库存推演的 (desiredSales − sales)，只算供给截断，不含手调。 */
    gap: number;
    forecastMargin: number;
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

/**
 * 月 SI 计划 → 周序列（确定性整数余数分配）：每周先取 floor(月总量 / 周数)，
 * 余数按周序每周 +1（如 10001 台 / 4 周 = [2501,2500,2500,2500]，总量守恒）。
 * 负值 / 非有限输入钳 0；可整除时与均分一致。
 */
export function siWeeklyPlan(fixture: WorkbenchFixture, siPlanMonthly: Record<string, number>): Map<number, number> {
  const plan = new Map<number, number>();
  for (const month of fixture.forecastMonths) {
    if (!month.weekNumbers.length) continue;
    const raw = siPlanMonthly[month.key];
    const total = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    const per = Math.floor(total / month.weekNumbers.length);
    const remainder = total - per * month.weekNumbers.length;
    month.weekNumbers.forEach((weekNumber, weekIndex) => {
      plan.set(weekNumber, weekIndex < remainder ? per + 1 : per);
    });
  }
  return plan;
}

/** 上一代参照在某预测周的同周龄比值校正信息（进 consider 与 unconstrained）。 */
interface ReferenceRatio {
  /** 校正比值；缺数回退 1。 */
  ratio: number;
  /** 比值影响（%）；比值中性（= 1）或缺数回退时为 null。 */
  pct: number | null;
  /** 考量说明：比值或缺数原因。 */
  note: string;
  /** 参照名称。 */
  label: string;
}

/**
 * 上一代参照比值校正：referenceRatio = selected.points[i] / default.points[i]
 * （default = prevGenPool[0]，即基准参照）。points 为与主品同窗（W37–W52）对齐的
 * 16 点序列，i 取该周在 fixture.weeks 中的同序位（同周龄同窗对齐）。
 * 分母为 0、序列缺点或参照不存在（含友商参照，不在 prevGenPool）时比值回退 1，
 * 考量写「参照缺数，未修正」。
 */
function referenceRatioAt(fixture: WorkbenchFixture, referenceId: string, alignedIndex: number): ReferenceRatio {
  const defaultRef = fixture.references.prevGenPool[0] ?? null;
  const selected = fixture.references.prevGenPool.find((ref) => ref.id === referenceId) ?? null;
  const label = selected?.label ?? defaultRef?.label ?? '上一代参照';
  const fallback: ReferenceRatio = { ratio: 1, pct: null, note: '参照缺数，未修正', label };
  if (selected == null || defaultRef == null) return fallback;
  const selectedPoint = selected.points[alignedIndex];
  const defaultPoint = defaultRef.points[alignedIndex];
  if (typeof selectedPoint !== 'number' || !Number.isFinite(selectedPoint)
    || typeof defaultPoint !== 'number' || !Number.isFinite(defaultPoint) || defaultPoint <= 0) {
    return fallback;
  }
  const ratio = selectedPoint / defaultPoint;
  return {
    ratio,
    pct: ratio === 1 ? null : round1((ratio - 1) * 100),
    note: `同周龄比值 ×${ratio.toFixed(2)}（${selected.label} / ${defaultRef.label}）`,
    label,
  };
}

export function computeWorkbench(fixture: WorkbenchFixture, params: WorkbenchParams): WorkbenchResult {
  const { aiQ4, aiQ1 } = marketSeriesBaseline(fixture);
  const { q4Index, q1Index } = effectiveQuarterIndexes(fixture, params);
  const siPlan = siWeeklyPlan(fixture, params.siPlanMonthly);
  const weeks: WorkbenchWeekResult[] = [];
  const inventoryRows: InventoryRow[] = [];
  const referenceByWeek = new Map<number, ReferenceRatio>();
  let channelInv = fixture.inventory.initialChannelInv;

  fixture.weeks.forEach((week, index) => {
    const isForecast = week.status === 'forecast';
    const si = isForecast ? (siPlan.get(week.weekNumber) ?? 0) : fixture.inventory.historySi[index];
    let unconstrained: number | null = null;
    if (isForecast) {
      const forecastIndex = index - 8;
      // 参照 points 与主品同窗对齐（W37–W52），取该周同序位（同周龄）比值。
      const reference = referenceRatioAt(fixture, params.prevGenReferenceId, index);
      referenceByWeek.set(week.weekNumber, reference);
      const factor = computeMarketFactor(fixture, params, week.weekNumber)
        * productEventFactorAt(params.productEvents, week.weekNumber)
        * reference.ratio;
      unconstrained = Math.max(0, Math.round(fixture.basePath[forecastIndex] * factor));
    }
    // 库存验证定序：基线 SO（大盘+量价+参照考量）→ 反算 DOS/库存 → 刚性砍 min(SO, 可售)。
    const desired = isForecast ? (unconstrained as number) : (week.sales as number);
    const available = channelInv + si;
    const sales = isForecast ? Math.min(desired, Math.max(0, available)) : desired;
    const capped = isForecast && sales < desired;
    channelInv = Math.max(0, channelInv + si - sales);
    const window = inventoryRows.slice(-3).map((row) => row.sales);
    const rollingAvg = window.length ? (window.reduce((total, v) => total + v, 0) + sales) / (window.length + 1) : sales;
    const channelDos = rollingAvg > 0 ? round1((channelInv / rollingAvg) * 7) : 0;
    inventoryRows.push({ weekNumber: week.weekNumber, status: week.status, desiredSales: desired, sales, capped, si, channelInv, channelDos });

    const unitCost = unitCostOfWeek(fixture, week.weekNumber);
    const unitMargin = week.price - unitCost;
    weeks.push({
      week: week.week,
      weekNumber: week.weekNumber,
      dateLabel: week.dateLabel,
      status: week.status,
      sales: week.sales,
      unconstrained,
      supplyCapped: false,
      capped: false,
      final: isForecast ? null : week.sales,
      manual: null,
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

  const forecastRows = inventoryRows.filter((row) => row.status === 'forecast');
  // 健康判定先对完整库存序列（含历史）跑，再筛预测周：降幅窗口不能缺历史段。
  const forecastWeekSet = new Set(forecastRows.map((row) => row.weekNumber));
  const health = judgeInventoryHealth(inventoryRows).filter((row) => forecastWeekSet.has(row.weekNumber));
  const healthByWeek = new Map(health.map((row) => [row.weekNumber, row]));
  const cappedByWeek = new Map(forecastRows.map((row) => [row.weekNumber, row.capped]));

  // 回写主图：刚性砍结果（min），手调优先；截断事实保留在 supplyCapped。
  weeks.forEach((week) => {
    if (week.status !== 'forecast' || week.unconstrained == null) return;
    const row = healthByWeek.get(week.weekNumber);
    const supplyCapped = cappedByWeek.get(week.weekNumber) ?? false;
    const cappedValue = inventoryRows.find((candidate) => candidate.weekNumber === week.weekNumber)?.sales ?? week.unconstrained;
    const manual = params.manual[week.weekNumber] ?? null;
    week.supplyCapped = supplyCapped;
    week.capped = supplyCapped && manual == null;
    week.manual = manual;
    week.final = manual != null ? manual.value : cappedValue;
    week.weeklyMargin = week.final * week.unitMargin;
    week.health = row;
    const inPromo = week.weekNumber >= fixture.promoBand.startWeek && week.weekNumber <= fixture.promoBand.endWeek;
    const reference = referenceByWeek.get(week.weekNumber);
    const consider: ConsiderItem[] = [
      {
        kind: 'market',
        label: '大盘 · 时间序列',
        pct: null,
        note: params.overrideSource === 'ai'
          ? `AI 基线：2026Q4 ${aiQ4} · 2027Q1 ${aiQ1}（季节 × 趋势）`
          : `人工修正：2026Q4 ${q4Index} · 2027Q1 ${q1Index}（AI 基线 ${aiQ4} / ${aiQ1}）`,
      },
      {
        kind: 'reference',
        label: reference?.label ?? '上一代参照',
        pct: reference?.pct ?? null,
        note: reference?.note ?? '参照缺数，未修正',
      },
      ...params.marketEvents.map((event) => {
        const endWeek = event.startWeek + event.durationWeeks - 1;
        if (marketEventDisposition(fixture, event) === 'historical') {
          return {
            kind: 'event' as const,
            label: event.label,
            pct: null,
            note: `历史事件 W${event.startWeek}–W${endWeek} · 仅解释，不影响预测推演`,
          };
        }
        const factor = eventWeeklyFactor(event, week.weekNumber);
        return {
          kind: 'event' as const,
          label: event.label,
          pct: factor != null ? round1((factor - 1) * 100) : null,
          note: factor != null
            ? `生效中（W${event.startWeek}–W${endWeek}，${event.decay === 'decreasing' ? '递减' : '恒定'}）`
            : `W${event.startWeek}–W${endWeek}${week.weekNumber < event.startWeek ? '未生效' : '已结束'}`,
        };
      }),
      ...params.productEvents.filter((event) => event.week === week.weekNumber).map((event) => ({
        kind: 'productEvent' as const,
        label: event.label,
        pct: event.magnitudePct,
        note: '主图小事件 · 参考品事实回放（人工录入）',
      })),
      ...(() => {
        // 月度事件（三字段）：按周所属月份取当月乘子（月中按日均摊口径）；
        // 未覆盖该周月份的事件不产出考量项（与周口径事件的覆盖外语义一致）。
        const weekDate = fixture.weeks.find((candidate) => candidate.weekNumber === week.weekNumber)?.date;
        const monthKey = weekDate ? monthKeyOfDate(weekDate) : null;
        if (monthKey == null) return [];
        return params.marketMonthEvents
          .map((event) => ({ event, factor: marketMonthEventFactor(event, monthKey) }))
          .filter((entry): entry is { event: MarketMonthEventSeed; factor: number } => entry.factor != null)
          .map((entry) => {
            const pct = round1((entry.factor - 1) * 100);
            return {
              kind: 'event' as const,
              label: entry.event.label || '未命名事件',
              pct: pct === 0 ? null : pct,
              note: `月度事件 ${entry.event.startMonth}-${entry.event.startDay} 起 · ${entry.event.durationMonths} 个月（月中按日均摊）`,
            };
          });
      })(),
      {
        kind: 'promo',
        label: fixture.promoBand.label,
        pct: null,
        note: inPromo ? '档期形状已含在基准走势内' : '不在档期',
      },
      {
        kind: 'inventory',
        label: '库存上限修正',
        pct: supplyCapped && week.unconstrained > 0 ? round1(((cappedValue / week.unconstrained) - 1) * 100) : null,
        note: supplyCapped ? row?.reasonText ?? '可售不足，按可售量修正' : '库存可支撑',
      },
    ];
    if (manual != null) {
      const before = cappedValue;
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
  // 供给缺口只算供给截断（库存推演 desiredSales − sales），手调不进缺口。
  const gap = forecastRows.reduce((total, row) => total + Math.max(0, row.desiredSales - row.sales), 0);
  const peakWeekResult = forecastWeeks.reduce((best, week) => ((week.final ?? 0) > (best?.final ?? 0) ? week : best), forecastWeeks[0]);
  const cappedForecast = forecastWeeks.filter((week) => week.supplyCapped);
  const marketQuarters: MarketQuarterPoint[] = [
    ...fixture.market.quarters.map((quarter) => ({ key: quarter.key, value: quarter.value, status: 'actual' as const })),
    { key: '2026Q4', value: q4Index, status: 'forecast' as const, aiBaseline: aiQ4 },
    { key: '2027Q1', value: q1Index, status: 'forecast' as const, aiBaseline: aiQ1 },
  ];

  return {
    weeks,
    marketQuarters,
    marketMonths: computeMarketMonths(fixture, params),
    health,
    firstAdjustedWeek: cappedForecast.length ? cappedForecast[0].weekNumber : null,
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
// 手调（2026-11-04 评审拍板：原因选填，不填即可应用；原因填了则标注在主图手调处）
// ------------------------------------------------------------

/** 手调设置（纯函数）：原因选填（空原因照常应用，后台字段结构保留）。 */
export function setManualAdjustment(
  params: WorkbenchParams,
  weekNumber: number,
  value: number,
  reason: string,
): WorkbenchParams | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return { ...params, manual: { ...params.manual, [weekNumber]: { value: Math.round(value), reason: reason.trim() } } };
}

/** 清除某周手调。 */
export function clearManualAdjustment(params: WorkbenchParams, weekNumber: number): WorkbenchParams {
  const manual = { ...params.manual };
  delete manual[weekNumber];
  return { ...params, manual };
}

// ------------------------------------------------------------
// 会话草稿恢复校验（坏 JSON / 错型 / 失效参照回退基准，永不崩溃）
// ------------------------------------------------------------

const PRODUCT_EVENT_TYPES: readonly ProductEventSeed['type'][] = ['competitor-launch', 'own-promo', 'cannibalization'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeMarketEvent(value: unknown): MarketEventSeed | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const startWeek = finiteOrNull(value.startWeek);
  const durationWeeks = finiteOrNull(value.durationWeeks);
  const magnitudePct = finiteOrNull(value.magnitudePct);
  if (!id || startWeek == null || durationWeeks == null || magnitudePct == null) return null;
  return {
    id,
    label: typeof value.label === 'string' ? value.label : '',
    startWeek: Math.round(startWeek),
    durationWeeks: Math.max(1, Math.round(durationWeeks)),
    magnitudePct,
    decay: value.decay === 'flat' ? 'flat' : 'decreasing',
  };
}

function sanitizeProductEvent(value: unknown, fixture: WorkbenchFixture): ProductEventSeed | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const week = finiteOrNull(value.week);
  const magnitudePct = finiteOrNull(value.magnitudePct);
  const type = PRODUCT_EVENT_TYPES.includes(value.type as ProductEventSeed['type'])
    ? (value.type as ProductEventSeed['type'])
    : null;
  const replayId = typeof value.replayId === 'string' ? value.replayId : '';
  const replayExists = replayId !== '' && fixture.replayScenarios.some((scenario) => scenario.id === replayId);
  const forecastWeeks = new Set(fixture.weeks.filter((week) => week.status === 'forecast').map((week) => week.weekNumber));
  if (!id || type == null || week == null || !Number.isInteger(week) || !forecastWeeks.has(week)
    || magnitudePct == null || !replayExists) {
    return null;
  }
  return { id, type, label: typeof value.label === 'string' ? value.label : '', week, magnitudePct, replayId };
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

/** 大盘按月调整校验：只保留预测月键、有限值（钳 40–200）；原因选填（去空白，空串合法）。 */
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

/** SI 月计划校验：非对象整字段回退基准；单月非数字（错型）回退基准月值；数字负值钳 0。 */
function sanitizeSiPlan(fixture: WorkbenchFixture, value: unknown, base: Record<string, number>): Record<string, number> {
  const source = isRecord(value) ? value : {};
  const plan: Record<string, number> = {};
  for (const month of fixture.forecastMonths) {
    const amount = finiteOrNull(source[month.key]);
    plan[month.key] = amount != null ? Math.max(0, amount) : (base[month.key] ?? 0);
  }
  return plan;
}

function sanitizeManual(fixture: WorkbenchFixture, value: unknown): Record<number, { value: number; reason: string }> {
  const source = isRecord(value) ? value : {};
  const forecastWeeks = new Set(fixture.weeks.filter((week) => week.status === 'forecast').map((week) => week.weekNumber));
  const manual: Record<number, { value: number; reason: string }> = {};
  for (const [key, entry] of Object.entries(source)) {
    const weekNumber = Number(key);
    if (!Number.isInteger(weekNumber) || !forecastWeeks.has(weekNumber) || !isRecord(entry)) continue;
    const amount = finiteOrNull(entry.value);
    // 原因选填（2026-11-04 评审拍板）：空原因照常保留手调（后台字段结构不变）。
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    if (amount == null || amount < 0) continue;
    manual[weekNumber] = { value: Math.round(amount), reason };
  }
  return manual;
}

/**
 * 会话草稿恢复校验：输入未知数据（坏 JSON / 错型字段 / 失效参照）时逐项回退基准，
 * 返回值永远可直接进 computeWorkbench。
 * - q4/q1 非有限数字 → null；overrideSource 按两格重算（任一非 null = human，都 null = ai）。
 * - marketEvents / marketMonthEvents / productEvents：非数组回退基准数组；数组内坏条目剔除
 *   （月度事件起始月须为合法 YYYY-MM；失效回放场景 id 亦剔除）。
 * - marketMonthOverrides：只保留预测月键、有限值（钳 40–200）；原因选填（空串合法）。
 * - siPlanMonthly：非对象整字段回退基准；单月错型回退基准月值；数字负值钳 0。
 * - manual：只保留预测周、有限非负值（值取整；原因选填，去空白，空串合法）。
 * - prevGenReferenceId：不在 prevGenPool → 回基准参照。
 */
export function normalizeWorkbenchParams(fixture: WorkbenchFixture, value: unknown): WorkbenchParams {
  const base = baseWorkbenchParams(fixture);
  if (!isRecord(value)) return base;
  const q4Override = finiteOrNull(value.q4Override);
  const q1Override = finiteOrNull(value.q1Override);
  const validReferenceIds = new Set(fixture.references.prevGenPool.map((ref) => ref.id));
  const referenceId = typeof value.prevGenReferenceId === 'string' && validReferenceIds.has(value.prevGenReferenceId)
    ? value.prevGenReferenceId
    : base.prevGenReferenceId;
  const forecastMonthKeys = new Set(
    computeMarketMonths(fixture, { marketMonthEvents: [], marketMonthOverrides: {} })
      .filter((point) => point.status === 'forecast')
      .map((point) => point.key),
  );
  return {
    q4Override,
    q1Override,
    overrideSource: q4Override != null || q1Override != null ? 'human' : 'ai',
    marketEvents: Array.isArray(value.marketEvents)
      ? value.marketEvents.map((event) => sanitizeMarketEvent(event)).filter((event): event is MarketEventSeed => event != null)
      : base.marketEvents,
    marketMonthEvents: Array.isArray(value.marketMonthEvents)
      ? value.marketMonthEvents.map((event) => sanitizeMarketMonthEvent(event)).filter((event): event is MarketMonthEventSeed => event != null)
      : base.marketMonthEvents,
    marketMonthOverrides: sanitizeMonthOverrides(value.marketMonthOverrides, forecastMonthKeys),
    productEvents: Array.isArray(value.productEvents)
      ? value.productEvents.map((event) => sanitizeProductEvent(event, fixture)).filter((event): event is ProductEventSeed => event != null)
      : base.productEvents,
    siPlanMonthly: sanitizeSiPlan(fixture, value.siPlanMonthly, base.siPlanMonthly),
    manual: sanitizeManual(fixture, value.manual),
    rationale: typeof value.rationale === 'string' ? value.rationale : base.rationale,
    prevGenReferenceId: referenceId,
  };
}
