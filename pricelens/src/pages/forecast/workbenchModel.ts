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
// 全部计算为纯函数：不读时间、不用随机数，同输入两次计算逐字段一致。
// ============================================================
import type { MarketEventSeed, ProductEventSeed, WorkbenchFixture } from './workbenchFixture';
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
  /** 主图小事件（产品级三类，参考回放段预填幅度，可改）。 */
  productEvents: ProductEventSeed[];
  /** 人工 SI 月计划（台），键 = '2026-11' / '2026-12'；库存验证层唯一新输入。 */
  siPlanMonthly: Record<string, number>;
  /** 手调（键 = 周序号）：值 + 必填原因（原因标注在主图手调处）。 */
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

/** 主图小事件乘子（锚定单周；局部修正）。 */
export function productEventFactorAt(events: readonly ProductEventSeed[], weekNumber: number): number {
  return events
    .filter((event) => event.week === weekNumber)
    .reduce((factor, event) => factor * (1 + event.magnitudePct / 100), 1);
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

/**
 * 周度大盘考量倍数（只作用于预测周 W45+）：人工改格比率（当前 Q4 生效值 / AI 基线）
 * × 行业级事件乘子直接叠加（事件 = 人工录入假设：删除即回落、改参数即换乘子）。
 * 预测窗口 W45–W52 全部落在 2026Q4，改格比率按 Q4 口径作用；
 * historical 事件（起周早于首个预测周）只作解释，一律跳过，不修正预测周。
 */
export function computeMarketFactor(
  fixture: WorkbenchFixture,
  params: Pick<WorkbenchParams, 'q4Override' | 'marketEvents'>,
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
// 手调（原因必填；原因标注在主图手调处）
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
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    if (amount == null || amount < 0 || !reason) continue;
    manual[weekNumber] = { value: Math.round(amount), reason };
  }
  return manual;
}

/**
 * 会话草稿恢复校验：输入未知数据（坏 JSON / 错型字段 / 失效参照）时逐项回退基准，
 * 返回值永远可直接进 computeWorkbench。
 * - q4/q1 非有限数字 → null；overrideSource 按两格重算（任一非 null = human，都 null = ai）。
 * - marketEvents / productEvents：非数组回退基准数组；数组内坏条目剔除（失效回放场景 id 亦剔除）。
 * - siPlanMonthly：非对象整字段回退基准；单月错型回退基准月值；数字负值钳 0。
 * - manual：只保留预测周、有限非负值、非空原因（值取整、原因去空白）。
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
  return {
    q4Override,
    q1Override,
    overrideSource: q4Override != null || q1Override != null ? 'human' : 'ai',
    marketEvents: Array.isArray(value.marketEvents)
      ? value.marketEvents.map((event) => sanitizeMarketEvent(event)).filter((event): event is MarketEventSeed => event != null)
      : base.marketEvents,
    productEvents: Array.isArray(value.productEvents)
      ? value.productEvents.map((event) => sanitizeProductEvent(event, fixture)).filter((event): event is ProductEventSeed => event != null)
      : base.productEvents,
    siPlanMonthly: sanitizeSiPlan(fixture, value.siPlanMonthly, base.siPlanMonthly),
    manual: sanitizeManual(fixture, value.manual),
    rationale: typeof value.rationale === 'string' ? value.rationale : base.rationale,
    prevGenReferenceId: referenceId,
  };
}
