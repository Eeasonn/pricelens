// ============================================================
// 量价预测 · 四步推演契约测试（Batch 2 · 2026-11-07 · batch2-iterate-forecast）：
// buildForecastSteps 只从既有模型派生（不另起第二套数字）——四步元数据齐全、
// 结论与主图/四卡同源（基线合计 / 首修正周 / 预测期销毛与销毛率）、
// 修正原因随 override/event/SI 进入 adjustments、证据数据状态如实
// （模拟 / real / pending），口径铁律文案只写「销毛」（口述映射禁词以码点转义检测）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import {
  baseWorkbenchParams,
  computeWorkbench,
  setManualAdjustment,
  withMarketMonthOverride,
  withSiPlanEntry,
  type WorkbenchParams,
} from '../workbenchModel';
import { computeMarginView, emptyMarginScenario, forecastMarginRateOf } from '../marginScenarioModel';
import buildForecastSteps from '../forecastSteps';

const fixture = workbenchFixture;

/** 口径铁律禁词（用户口述映射词）：以码点转义书写，保证源码 0 处字面量。 */
const BANNED_TERM = '\u6d88\u6bdb';

describe('buildForecastSteps · 四步推演元数据', () => {
  it('基准参数：四步齐全、逐步输出成为下一步输入、无人工修正时 ①②无 adjustments', () => {
    const params = baseWorkbenchParams(fixture);
    const result = computeWorkbench(fixture, params);
    const marginView = computeMarginView(fixture, result, emptyMarginScenario());
    const steps = buildForecastSteps(fixture, params, result, marginView, emptyMarginScenario(), { byMonth: {} });
    expect(steps.map((step) => step.step)).toEqual([1, 2, 3, 4]);
    // 前一步输出 = 下一步输入（链路文案显式可见）
    expect(steps[1]!.inputs.some((line) => line.includes('①输出：预测期基线'))).toBe(true);
    expect(steps[2]!.inputs.some((line) => line.includes('②输出：大盘修正后基线 SO'))).toBe(true);
    expect(steps[3]!.inputs.some((line) => line.includes('③输出：最终 SO'))).toBe(true);
    // 基准：① 无产品事件、② 无人工调整、③ SI 全为基准 → adjustments 均空
    expect(steps[0]!.adjustments).toHaveLength(0);
    expect(steps[1]!.adjustments).toHaveLength(0);
    expect(steps[2]!.adjustments).toHaveLength(0);
    // ② 情报候选 = 待接入（如实，不造假候选）
    const intel = steps[1]!.evidence.find((evidence) => evidence.id === 'intelligence-candidates');
    expect(intel?.status).toBe('pending');
    // ③ 基准触发库存修正（fixture 首周即截断）：结论含首修正周与缺口
    expect(steps[2]!.conclusion).toContain('已修正');
    expect(steps[2]!.conclusion).toContain('2026W46 起');
    expect(steps[2]!.tone).toBe('amber');
  });

  it('结论数字与主图同源：①基线合计 = Σ baselineSales；④销毛 = MarginView.forecastMargin', () => {
    const params = baseWorkbenchParams(fixture);
    const result = computeWorkbench(fixture, params);
    const marginView = computeMarginView(fixture, result, emptyMarginScenario());
    const steps = buildForecastSteps(fixture, params, result, marginView, emptyMarginScenario(), { byMonth: {} });
    const baselineTotal = result.weeks
      .filter((week) => week.status === 'forecast')
      .reduce((total, week) => total + (week.baselineSales ?? 0), 0);
    expect(steps[0]!.conclusion).toContain(`${(baselineTotal / 10000).toFixed(1)} 万台`);
    expect(steps[3]!.conclusion).toContain(`$${(marginView.forecastMargin / 1e6).toFixed(1)}M`);
    // ④ 销毛率与 marginScenarioModel.forecastMarginRateOf 同源
    const rate = forecastMarginRateOf(marginView);
    expect(rate).not.toBeNull();
    expect(steps[3]!.conclusion).toContain(`${(rate! * 100).toFixed(1)}%`);
    // ④ 公式 = 口径铁律（销毛措辞；全步元数据不含口述映射禁词）
    expect(steps[3]!.formula).toContain('单台销毛额 = 单台收入 − 单台成本');
    expect(steps[3]!.formula).toContain('销毛率 = 单台销毛额 ÷ 单台收入');
    for (const step of steps) {
      expect(JSON.stringify(step)).not.toContain(BANNED_TERM);
    }
  });

  it('人工修正带原因进入对应步骤 adjustments：②月调整 / ③SI（原因同笔）/ ④成本假设', () => {
    let params: WorkbenchParams = baseWorkbenchParams(fixture);
    params = withMarketMonthOverride(params, '2027-03', 92, '竞品降价跟随');
    params = withSiPlanEntry(params, '2026-12', 200000, '春节备货提前')!;
    const marginScenario = {
      costOverrides: { '2027-01': { unitCost: 780, reason: '核价更新' } },
      priceOverrides: {},
    };
    const result = computeWorkbench(fixture, params);
    const marginView = computeMarginView(fixture, result, marginScenario);
    const steps = buildForecastSteps(fixture, params, result, marginView, marginScenario, { byMonth: {} });
    const marketAdjustment = steps[1]!.adjustments.find((entry) => entry.key === 'mo-2027-03');
    expect(marketAdjustment?.value).toBe(92);
    expect(marketAdjustment?.reason).toBe('竞品降价跟随');
    const siAdjustment = steps[2]!.adjustments.find((entry) => entry.key === 'si-2026-12');
    expect(siAdjustment?.reason).toBe('春节备货提前');
    const costAdjustment = steps[3]!.adjustments.find((entry) => entry.key === 'cost-2027-01');
    expect(costAdjustment?.value).toBe(780);
    expect(costAdjustment?.reason).toBe('核价更新');
    // ③ SI 确认记录 = real（会话内人工事实，capturedAt 有值）
    const siEvidence = steps[2]!.evidence.find((evidence) => evidence.id === 'si-confirmations');
    expect(siEvidence?.status).toBe('real');
  });

  it('SI 原因孤儿清理：数值回基准后 normalize 不保留原因；周销手调原因进入③末端人工修正', () => {
    let params: WorkbenchParams = baseWorkbenchParams(fixture);
    params = withSiPlanEntry(params, '2026-12', 200000, '春节备货提前')!;
    // 回基准 → 原因清除
    params = withSiPlanEntry(params, '2026-12', fixture.inventory.siPlanMonthly['2026-12'] ?? 0, '')!;
    expect(params.siReasons['2026-12']).toBeUndefined();
    const result = computeWorkbench(fixture, params);
    const marginView = computeMarginView(fixture, result, emptyMarginScenario());
    const steps = buildForecastSteps(fixture, params, result, marginView, emptyMarginScenario(), { byMonth: {} });
    expect(steps[2]!.adjustments.find((entry) => entry.key === 'si-2026-12')).toBeUndefined();
    // R2（C3）：周销手调与原因（如「黑五资源加投」）纳入第③步 adjustments——
    // 四步因果审计可见可定位，且显式标注「末端人工修正」，不与自动步骤混淆。
    const tuned = setManualAdjustment(params, '2026W47', 60000, '黑五资源加投')!;
    const tunedResult = computeWorkbench(fixture, tuned);
    const tunedSteps = buildForecastSteps(
      fixture,
      tuned,
      tunedResult,
      computeMarginView(fixture, tunedResult, emptyMarginScenario()),
      emptyMarginScenario(),
      { byMonth: {} },
    );
    const manualAdjustment = tunedSteps[2]!.adjustments.find((entry) => entry.key === 'manual-2026W47');
    expect(manualAdjustment).toBeTruthy();
    expect(manualAdjustment!.value).toBe(60000);
    expect(manualAdjustment!.reason).toBe('黑五资源加投');
    expect(manualAdjustment!.label).toContain('末端人工修正');
    expect(manualAdjustment!.label).toContain('2026W47');
    // 原因真的进了审计元数据（旧断言「不包含原因」按 C3 反转）
    expect(JSON.stringify(tunedSteps)).toContain('黑五资源加投');
    // 结论同步显出「周销手调 N 周（末端人工修正）」
    expect(tunedSteps[2]!.conclusion).toContain('周销手调 1 周（末端人工修正）');
  });

  it('forecastMarginRateOf：无有效收入周返回 null（不造数）', () => {
    const empty = computeMarginView(
      fixture,
      computeWorkbench(fixture, baseWorkbenchParams(fixture)),
      emptyMarginScenario(),
    );
    expect(forecastMarginRateOf(empty)).not.toBeNull();
    expect(forecastMarginRateOf({
      ...empty,
      weeks: empty.weeks.map((week) => ({ ...week, finalSales: null, weeklyMargin: null })),
    })).toBeNull();
  });
});
