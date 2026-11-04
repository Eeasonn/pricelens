// ============================================================
// 量价预测 · ④成本销毛统一视图纯函数（任务 9 · IA 文档第四节 / B.4.3 / B.4.7）
// 成本双重性唯一合法口径：
//   角色 A · 调价参考：成本证据 → 人判断 → 人设参 → 主图价格微调；
//   角色 B · 销毛输入：成本版本 + 主图价格 + 最终 SO → 单台/周/期销毛。
// 禁止：成本变化 --自动公式--> 主图价格或销量。
//
// MarginView（B.4.3 / B.4.7 过渡态公式）：
//   effectivePrice = priceOverrides[weekId]?.price ?? resultWeek.price
//   unitCost       = costOverrides[monthKey]?.unitCost ?? resultWeek.unitCost
//   unitMargin     = effectivePrice − unitCost
//   weeklyMargin   = finalSales == null ? null : finalSales × unitMargin
//   forecastMargin = Σ 预测周非空 weeklyMargin；historyMargin = Σ 历史周非空
// - 价格/成本 override 只允许作用于预测周和统一 horizon 月份；历史周与历史
//   月份始终使用事实值，归一化时剔除范围外记录（不允许改历史美化对照）。
// - 周销毛在销量缺失时为 null；汇总只累计有效周并输出
//   forecastCoverage / historyCoverage（不得把缺失周当 0 或掩盖覆盖率）。
// - priceDemandLinked=false 时本模块不得调用学习器或修改 WorkbenchResult：
//   销量、库存和 DOS 引用与数值都保持不变；未来价格关系拍板后必须另改
//   类型与主链契约，不得偷偷翻成 true。
// 全部为纯函数：不读时间、不用随机数、不依赖 DOM。
// ============================================================
import { buildForecastCalendar } from './workbenchCalendar';
import type { MonthKey, WeekId } from './workbenchCalendar';
import type { WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';

/** 主图价格手调记录（B.4.3）：周价格调整 = 一条周价格记录（批次 id 共享）。 */
export interface MarginPriceOverride {
  /** 调整后价格（USD/台）。 */
  price: number;
  /** 原因/参考说明（选填，空串合法）。 */
  reason: string;
  /** 批次 id：月展开的周记录共享同一 batchId（可整批追溯/撤销）。 */
  batchId: string;
}

/** 成本版本假设（B.4.3）：只写④销毛工作区，原因选填，可还原。 */
export interface MarginCostOverride {
  /** 调整后成本（USD/台）。 */
  unitCost: number;
  /** 原因（选填，空串合法）。 */
  reason: string;
}

/** 成本/价格情景（B.4.3）：与 WorkbenchParams 完全分离，不进需求主链。 */
export interface MarginScenario {
  costOverrides: Record<MonthKey, MarginCostOverride>;
  priceOverrides: Record<WeekId, MarginPriceOverride>;
}

/** 统一销毛周（B.4.3 MarginWeek）：显示值口径，非主链结果。 */
export interface MarginWeek {
  weekId: WeekId;
  status: 'actual' | 'forecast';
  /** 最终 SO（历史实际 / 预测推演；缺采为 null，不转 0）。 */
  finalSales: number | null;
  /** 显示价 = 价格手调价 ?? 主链价格（仅预测周可被手调）。 */
  effectivePrice: number;
  /** 显示成本 = 成本假设 ?? 主链月版本成本（仅预测周可被假设）。 */
  unitCost: number;
  /** 单台销毛 = effectivePrice − unitCost。 */
  unitMargin: number;
  /** 周销毛 = finalSales == null ? null : finalSales × unitMargin。 */
  weeklyMargin: number | null;
  priceOverridden: boolean;
  costOverridden: boolean;
}

/** 统一销毛视图（B.4.3 MarginView）：过渡态所有卡片/摘要消费的同一份数字。 */
export interface MarginView {
  weeks: MarginWeek[];
  forecastMargin: number;
  historyMargin: number;
  /** 覆盖率如实显示：有效周 = finalSales 非空的周数（缺数不掩盖）。 */
  forecastCoverage: { validWeeks: number; totalWeeks: number };
  historyCoverage: { validWeeks: number; totalWeeks: number };
  /** 生效中的价格手调周数（归一化后在范围内的记录数）。 */
  appliedPriceCount: number;
  /** 生效中的成本假设项数（归一化后在 horizon 内的记录数）。 */
  appliedCostCount: number;
  /** 显式过渡标记：价格→销量关系拍板前恒为 false。 */
  priceDemandLinked: false;
}

/** 空情景（基准 = 无任何人工成本/价格假设）。 */
export function emptyMarginScenario(): MarginScenario {
  return { costOverrides: {}, priceOverrides: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 情景归一化（B.4.7）：剔除范围外记录——价格手调只保留统一日历预测周键，
 * 成本假设只保留统一 horizon 12 个月键；非有限/负值（价格须 > 0）剔除；
 * 历史周与历史月份不允许通过 override 美化对照。纯函数，输入不被修改。
 */
export function normalizeMarginScenario(fixture: WorkbenchFixture, scenario: MarginScenario): MarginScenario {
  const calendar = buildForecastCalendar(fixture.calendar);
  const forecastWeekIds = new Set(calendar.forecastWeeks.map((week) => week.id));
  const horizonMonthKeys = new Set(calendar.forecastMonths.map((month) => month.key));
  const costOverrides: Record<MonthKey, MarginCostOverride> = {};
  const priceOverrides: Record<WeekId, MarginPriceOverride> = {};
  const sourceCost = isRecord(scenario) && isRecord(scenario.costOverrides) ? scenario.costOverrides : {};
  const sourcePrice = isRecord(scenario) && isRecord(scenario.priceOverrides) ? scenario.priceOverrides : {};
  for (const [monthKey, entry] of Object.entries(sourceCost)) {
    if (!horizonMonthKeys.has(monthKey) || !isRecord(entry)) continue;
    const unitCost = finiteNumber(entry.unitCost);
    if (unitCost == null || unitCost < 0) continue;
    costOverrides[monthKey] = { unitCost, reason: typeof entry.reason === 'string' ? entry.reason : '' };
  }
  for (const [weekId, entry] of Object.entries(sourcePrice)) {
    if (!forecastWeekIds.has(weekId) || !isRecord(entry)) continue;
    const price = finiteNumber(entry.price);
    if (price == null || price <= 0) continue;
    priceOverrides[weekId] = {
      price,
      reason: typeof entry.reason === 'string' ? entry.reason : '',
      batchId: typeof entry.batchId === 'string' ? entry.batchId : '',
    };
  }
  return { costOverrides, priceOverrides };
}

/**
 * 统一销毛视图（B.4.3 / B.4.7 唯一公式来源，UI 不另算）：
 * - 逐周按公式计算 effectivePrice / unitCost / unitMargin / weeklyMargin；
 * - 历史周恒事实值（override 不作用于 status='actual' 的周）；
 * - forecastMargin / historyMargin 只累计非空 weeklyMargin；
 * - 输出覆盖率与生效手调计数（归一化后口径）；
 * - 不调用学习器、不修改 result（引用与数值都不变）；priceDemandLinked 恒 false。
 */
export function computeMarginView(fixture: WorkbenchFixture, result: WorkbenchResult, scenario: MarginScenario): MarginView {
  const clean = normalizeMarginScenario(fixture, scenario);
  const priceOverrideByWeek = new Map(Object.entries(clean.priceOverrides));
  const costOverrideByMonth = clean.costOverrides;
  let forecastMargin = 0;
  let historyMargin = 0;
  let forecastValid = 0;
  let forecastTotal = 0;
  let historyValid = 0;
  let historyTotal = 0;
  const weeks: MarginWeek[] = result.weeks.map((week) => {
    const isForecast = week.status === 'forecast';
    const priceEntry = isForecast ? priceOverrideByWeek.get(week.weekId) : undefined;
    const costEntry = isForecast ? costOverrideByMonth[week.monthKey] : undefined;
    const effectivePrice = priceEntry != null ? priceEntry.price : week.price;
    const unitCost = costEntry != null ? costEntry.unitCost : week.unitCost;
    const unitMargin = effectivePrice - unitCost;
    const weeklyMargin = week.final == null ? null : week.final * unitMargin;
    if (isForecast) {
      forecastTotal += 1;
      if (week.final != null) {
        forecastValid += 1;
        forecastMargin += weeklyMargin ?? 0;
      }
    } else {
      historyTotal += 1;
      if (week.final != null) {
        historyValid += 1;
        historyMargin += weeklyMargin ?? 0;
      }
    }
    return {
      weekId: week.weekId,
      status: week.status,
      finalSales: week.final,
      effectivePrice,
      unitCost,
      unitMargin,
      weeklyMargin,
      priceOverridden: priceEntry != null,
      costOverridden: costEntry != null,
    };
  });
  return {
    weeks,
    forecastMargin,
    historyMargin,
    forecastCoverage: { validWeeks: forecastValid, totalWeeks: forecastTotal },
    historyCoverage: { validWeeks: historyValid, totalWeeks: historyTotal },
    appliedPriceCount: priceOverrideByWeek.size,
    appliedCostCount: Object.keys(costOverrideByMonth).length,
    priceDemandLinked: false,
  };
}

const PRICE_BATCH_PATTERN = /^price-batch-(\d+)$/;

/**
 * 新价格批次 id（确定性）：扫描既有记录中 price-batch-N 形态的最大序号 +1；
 * 无既有序号（或全部为其他形态）时从 price-batch-1 起。同输入恒同输出。
 */
export function nextPriceBatchId(scenario: MarginScenario): string {
  let max = 0;
  for (const entry of Object.values(scenario?.priceOverrides ?? {})) {
    const match = PRICE_BATCH_PATTERN.exec(entry?.batchId ?? '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `price-batch-${max + 1}`;
}
