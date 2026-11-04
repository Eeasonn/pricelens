// ============================================================
// 任务 9 · 统一销毛视图纯函数测试（forecast-global-ia-review 任务 9 Step 1
// 给定测试照抄 + B.4.7 边界补充）：
// - 价格/成本 override 只改显示价（effectivePrice）与销毛，不改变 SO / 库存 /
//   DOS；computeWorkbench 主链结果 structuredClone 前后逐字段相等（引用与
//   数值都不变，不调学习器）；
// - priceDemandLinked 恒为 false（关系拍板前不得翻 true）；
// - 归一化剔除范围外记录（历史周 / horizon 外月份恒事实值）；
// - 销量缺失周 weeklyMargin = null，覆盖率如实显示不掩盖（缺数不当 0）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench } from '../workbenchModel';
import { computeMarginView, emptyMarginScenario, normalizeMarginScenario, nextPriceBatchId } from '../marginScenarioModel';

describe('MarginView', () => {
  it('applies price and cost only to displayed price and margin', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    const result = computeWorkbench(workbenchFixture, params);
    const snapshot = structuredClone(result);
    const week = result.weeks.find((item) => item.status === 'forecast')!;
    const view = computeMarginView(workbenchFixture, result, {
      costOverrides: { [week.monthKey]: { unitCost: 600, reason: '' } },
      priceOverrides: { [week.weekId]: { price: 1000, reason: '', batchId: 'price-test-1' } },
    });
    const changed = view.weeks.find((item) => item.weekId === week.weekId)!;
    expect(changed.effectivePrice).toBe(1000);
    expect(changed.unitMargin).toBe(400);
    expect(changed.weeklyMargin).toBe((week.final ?? 0) * 400);
    expect(view.priceDemandLinked).toBe(false);
    expect(result).toEqual(snapshot);
  });

  it('主链引用相等：computeMarginView 不改 WorkbenchResult（weeks / 库存 / DOS 引用不变）', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    const result = computeWorkbench(workbenchFixture, params);
    const weeksRef = result.weeks;
    const firstRef = result.weeks[0];
    computeMarginView(workbenchFixture, result, {
      costOverrides: { '2026-11': { unitCost: 600, reason: '内存涨价假设' } },
      priceOverrides: { [weeksRef[52]!.weekId]: { price: 1000, reason: '', batchId: 'price-test-2' } },
    });
    expect(result.weeks).toBe(weeksRef);
    expect(result.weeks[0]).toBe(firstRef);
    expect(result.weeks[0]!.channelDos).toBe(firstRef!.channelDos);
    expect(result.weeks[52]!.final).toBe(weeksRef[52]!.final);
    expect(result.summary.forecastMargin).toBe(
      computeWorkbench(workbenchFixture, params).summary.forecastMargin,
    );
  });

  it('历史周恒事实值：历史周 / horizon 外记录被归一化剔除，不计入 applied 计数', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    const result = computeWorkbench(workbenchFixture, params);
    const historyWeek = result.weeks.find((item) => item.status === 'actual')!;
    const view = computeMarginView(workbenchFixture, result, {
      // 历史周价格手调 + 历史月（2026-10 在 horizon 外）成本假设 + 一个合法预测周。
      costOverrides: {
        '2026-10': { unitCost: 1, reason: '范围外应被剔除' },
        '2026-11': { unitCost: 600, reason: 'horizon 内生效' },
      },
      priceOverrides: {
        [historyWeek.weekId]: { price: 9999, reason: '历史周应被剔除', batchId: 'price-test-3' },
      },
    });
    const historyView = view.weeks.find((item) => item.weekId === historyWeek.weekId)!;
    expect(historyView.effectivePrice).toBe(historyWeek.price);
    expect(historyView.unitCost).toBe(historyWeek.unitCost);
    expect(historyView.priceOverridden).toBe(false);
    expect(historyView.costOverridden).toBe(false);
    // 归一化：范围外记录剔除，只剩 1 条成本假设；历史周价格记录剔除。
    const normalized = normalizeMarginScenario(workbenchFixture, {
      costOverrides: { '2026-10': { unitCost: 1, reason: '' }, '2026-11': { unitCost: 600, reason: '' } },
      priceOverrides: { [historyWeek.weekId]: { price: 9999, reason: '', batchId: 'b' } },
    });
    expect(Object.keys(normalized.costOverrides)).toEqual(['2026-11']);
    expect(normalized.priceOverrides[historyWeek.weekId]).toBeUndefined();
    expect(view.appliedPriceCount).toBe(0);
    expect(view.appliedCostCount).toBe(1);
  });

  it('销量缺失周 weeklyMargin = null，汇总只累计有效周并如实显示覆盖率（缺数不当 0 不掩盖）', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    const result = computeWorkbench(workbenchFixture, params);
    const forecastWeek = result.weeks.find((item) => item.status === 'forecast' && item.final != null)!;
    const missing = {
      ...result,
      weeks: result.weeks.map((week) => (week.weekId === forecastWeek.weekId ? { ...week, final: null } : week)),
    };
    const baseline = computeMarginView(workbenchFixture, result, emptyMarginScenario());
    const view = computeMarginView(workbenchFixture, missing, emptyMarginScenario());
    const missingView = view.weeks.find((item) => item.weekId === forecastWeek.weekId)!;
    expect(missingView.finalSales).toBeNull();
    expect(missingView.weeklyMargin).toBeNull();
    expect(view.forecastCoverage.totalWeeks).toBe(baseline.forecastCoverage.totalWeeks);
    expect(view.forecastCoverage.validWeeks).toBe(baseline.forecastCoverage.validWeeks - 1);
    // 缺失周不当 0：预测期销毛严格少该周销毛。
    const lost = baseline.weeks.find((item) => item.weekId === forecastWeek.weekId)!.weeklyMargin!;
    expect(view.forecastMargin).toBeCloseTo(baseline.forecastMargin - lost, 6);
    // 汇总 = Σ 预测周非空 weeklyMargin。
    const sum = view.weeks
      .filter((week) => week.status === 'forecast' && week.weeklyMargin != null)
      .reduce((total, week) => total + (week.weeklyMargin ?? 0), 0);
    expect(view.forecastMargin).toBeCloseTo(sum, 6);
    expect(view.historyCoverage.totalWeeks).toBeGreaterThan(0);
    expect(view.historyCoverage.validWeeks).toBeGreaterThan(0);
  });

  it('空情景 = 事实值：effectivePrice / unitCost / weeklyMargin 与主链过渡字段一致，手调标记全 false', () => {
    const params = baseWorkbenchParams(workbenchFixture);
    const result = computeWorkbench(workbenchFixture, params);
    const view = computeMarginView(workbenchFixture, result, emptyMarginScenario());
    const week = result.weeks.find((item) => item.status === 'forecast')!;
    const weekView = view.weeks.find((item) => item.weekId === week.weekId)!;
    expect(weekView.effectivePrice).toBe(week.price);
    expect(weekView.unitCost).toBe(week.unitCost);
    expect(weekView.weeklyMargin).toBe(week.final! * week.unitMargin);
    expect(weekView.priceOverridden).toBe(false);
    expect(weekView.costOverridden).toBe(false);
    expect(view.weeks.every((item) => !item.priceOverridden && !item.costOverridden)).toBe(true);
  });

  it('nextPriceBatchId：基于既有 batchId 确定性递增（price-batch-N 取最大 +1）', () => {
    expect(nextPriceBatchId(emptyMarginScenario())).toBe('price-batch-1');
    const withExisting = {
      costOverrides: {},
      priceOverrides: {
        '2026W45': { price: 900, reason: '', batchId: 'price-batch-3' },
        '2026W46': { price: 900, reason: '', batchId: 'price-batch-1' },
      },
    };
    expect(nextPriceBatchId(withExisting)).toBe('price-batch-4');
    // 自定义 batchId（非 price-batch-N 形态）不参与序号，回退首个未使用值。
    expect(nextPriceBatchId({
      costOverrides: {},
      priceOverrides: { '2026W45': { price: 900, reason: '', batchId: 'price-test-1' } },
    })).toBe('price-batch-1');
  });
});
