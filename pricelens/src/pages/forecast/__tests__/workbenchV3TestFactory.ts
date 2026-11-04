// ============================================================
// v3 共享测试工厂（forecast-global-ia-review B.6.2 · 任务 5 交付 + 任务 10 收敛）：
// 基础 helper = makeCalendar / makeParams / makeResult（任务 5）；
// 任务 10 收敛 makeExportContext（导出测试唯一上下文工厂：真实日历/结果、
// 空 SI 确认、默认 MarginView、空审核工作区——不使用散落的 mock 数字）。
// 本文件仅供测试使用，生产代码不得 import。
// ============================================================
import { buildForecastCalendar } from '../workbenchCalendar';
import type { ForecastCalendar } from '../workbenchCalendar';
import { workbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench } from '../workbenchModel';
import type { WorkbenchParams, WorkbenchResult } from '../workbenchModel';
import { computeMarginView } from '../marginScenarioModel';
import type { MarginScenario } from '../marginScenarioModel';
import type { WorkbenchExportContext } from '../workbenchExport';

/** 统一日历（唯一预测范围 2026-11—2027-10；跨年 WeekId 唯一主键）。 */
export function makeCalendar(): ForecastCalendar {
  return buildForecastCalendar(workbenchFixture.calendar);
}

/** 基准考量参数（fixture 默认：空事件 / 初始 SI / prevGenPool[0] 参照）。 */
export function makeParams(): WorkbenchParams {
  return baseWorkbenchParams(workbenchFixture);
}

/** v3 主链结果（同 fixture + 同 params 逐字段一致）。 */
export function makeResult(params: WorkbenchParams): WorkbenchResult {
  return computeWorkbench(workbenchFixture, params);
}

/** 空成本/价格情景（基准 = 无任何人工成本/价格假设）。 */
export function emptyScenario(): MarginScenario {
  return { costOverrides: {}, priceOverrides: {} };
}

/** 默认 MarginView（空情景；与页面 computeMarginView 同一公式来源）。 */
export function makeMargin(result: WorkbenchResult, scenario: MarginScenario = emptyScenario()) {
  return computeMarginView(workbenchFixture, result, scenario);
}

/**
 * 「复制关键假设」导出上下文（B.6.2 makeExportContext · 任务 10 收敛）：
 * 真实日历 / 真实主链结果、空 SI 确认（12 个月全部待确认）、默认 MarginView、
 * 空情报审核工作区。不散落 mock 数字。
 */
export function makeExportContext(
  calendar: ReturnType<typeof buildForecastCalendar>,
  result: WorkbenchResult,
): WorkbenchExportContext {
  return {
    calendar,
    learning: result.learning,
    siConfirmation: { byMonth: {} },
    marginView: makeMargin(result),
    intelligenceReview: { byCandidate: {} },
  };
}
