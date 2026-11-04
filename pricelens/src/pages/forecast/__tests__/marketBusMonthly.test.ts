// ============================================================
// 大盘月度段纯函数金测（v3 · forecast-global-ia-review B.4.5，任务 4/7 迁移）：
// 覆盖 workbenchModel 大盘月度段纯函数——
// ① 月度主序列（computeMarketMonths(fixture, calendar, params) 唯一签名）：
//    历史月不动、统一 12 个预测月 = 季度基线链（marketQuarterChainV3，经
//    result.marketQuarters 消费）按去年同季月形分布；容量守恒 = 完整未来季
//    三月合计恒等季度基线 × 3；确定性 = 同输入两次计算逐字段一致；
//    部分实际季（2026Q4 的 2026-10 已实际）不重摊残差；事件乘子只作用于预测月。
// ② 月中事件均摊（daysInMonthOf / monthCoverageRatio / marketMonthEventFactor：
//    首月按日均摊 = 幅度 × 覆盖天数 ÷ 当月天数，覆盖外 null，起始日超月按末日）。
// ③ 按月调整（withMarketMonthOverride：覆盖生效值、原因选填、钳 40–200；
//    还原 = null；无季度改格同步——v3 卡头人工状态由 overrideSourceOf 派生）。
// ④ 大盘周修正比值（marketFactorAt）：周因子 = 所属月生效值 ÷ AI 基线，
//    同月所有预测周共用同一比值；周外 / 基线不可用回退 1（不造数）。
// ⑤ 证据信任口径：marketTrendWindow（近 6 个月实际段 + 逐月环比 + 均值）与
//    marketMonthShape（去年同季月形权重）——大盘卡证据浮框 / 图上趋势源段 /
//    徽章三步链的唯一数字来源，UI 不另算（环比数字与模型同源断言）。
// 全部断言不依赖运行时间与随机数；v2 出口（marketSeriesBaseline /
// marketQuarterForecast / computeMarketFactor 两参重载）已随 v2 主链删除，
// 相关断言迁移到 computeMarketMonths / marketFactorAt / result.marketQuarters。
// ============================================================
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildForecastCalendar } from '../workbenchCalendar';
import { workbenchFixture, workbenchFixtureV3 } from '../workbenchFixture';
import {
  baseWorkbenchParams,
  computeMarketMonths,
  computeWorkbench,
  daysInMonthOf,
  MARKET_TREND_WINDOW_MONTHS,
  marketFactorAt,
  marketMonthEventFactor,
  marketMonthShape,
  marketTrendWindow,
  monthCoverageRatio,
  monthKeyOfDate,
  monthsBetween,
  monthsOfQuarterKey,
  nextMarketMonthEventId,
  overrideSourceOf,
  quarterKeyOfMonth,
  withMarketMonthOverride,
  type MarketMonthPoint,
  type WorkbenchParams,
} from '../workbenchModel';

const fixture = workbenchFixture;
const calendar = buildForecastCalendar(workbenchFixtureV3.calendar);
const base: WorkbenchParams = baseWorkbenchParams(fixture);

const forecastOf = (months: MarketMonthPoint[]): MarketMonthPoint[] => months.filter((point) => point.status === 'forecast');
const baselineOfQuarter = (months: MarketMonthPoint[], quarter: string): number[] =>
  months.filter((point) => point.quarter === quarter && point.status === 'forecast').map((point) => point.baseline);
const sum = (list: number[]): number => list.reduce((total, value) => total + value, 0);

// ------------------------------------------------------------
// ① computeMarketMonths · 月度主序列（容量守恒 + 确定性）
// ------------------------------------------------------------

describe('computeMarketMonths · 月度主序列（v3 唯一签名）', () => {
  const months = computeMarketMonths(fixture, calendar, { marketMonthEvents: [], marketMonthOverrides: {} });

  it('结构：历史月（fixture 原样 24 个月）+ 统一 12 个预测月（2026-11 … 2027-10）', () => {
    expect(months).toHaveLength(fixture.market.months.length + 12);
    expect(months[0]).toMatchObject({ key: '2024-11', status: 'actual', baseline: fixture.market.months[0].value, value: fixture.market.months[0].value });
    expect(months.slice(0, fixture.market.months.length).every((point) => point.status === 'actual')).toBe(true);
    expect(forecastOf(months).map((point) => point.key)).toEqual([
      '2026-11', '2026-12',
      '2027-01', '2027-02', '2027-03',
      '2027-04', '2027-05', '2027-06',
      '2027-07', '2027-08', '2027-09', '2027-10',
    ]);
    expect(forecastOf(months).map((point) => point.key)).toEqual(calendar.forecastMonths.map((month) => month.key));
    expect(months.map((point) => point.quarter)).toContain('2027Q4');
  });

  it('容量守恒：每个完整预测季的三月合计精确 = 季度基线 × 3（末月吸收舍入残差）', () => {
    const chainQuarters = computeWorkbench(fixture, base).marketQuarters.filter((point) => point.status === 'forecast');
    for (const quarter of ['2027Q1', '2027Q2', '2027Q3']) {
      const chainValue = chainQuarters.find((point) => point.key === quarter)!.value;
      const quarterBaselines = baselineOfQuarter(months, quarter);
      expect(quarterBaselines).toHaveLength(3);
      expect(sum(quarterBaselines)).toBeCloseTo(chainValue * 3, 6);
    }
    // 与主链同源的具体读数（2027Q1 = 105.0 → 105 · 104.4 · 105.6，合计 315 = 105 × 3）。
    expect(baselineOfQuarter(months, '2027Q1')).toEqual([105, 104.4, 105.6]);
    expect(baselineOfQuarter(months, '2027Q2')).toEqual([102.7, 102.1, 101.5]);
  });

  it('部分实际季不重摊残差：2026Q4 的 2026-11/12 各自 = round1(季基线 × 去年月形)', () => {
    // 2026Q4 链值 109.9（2026-10 已实际）；去年同季月形 = 2025-10/11/12（110.6/111.4/111，均值 111）。
    expect(months.find((point) => point.key === '2026-10')?.status).toBe('actual');
    expect(months.find((point) => point.key === '2026-11')?.baseline).toBe(110.3);
    expect(months.find((point) => point.key === '2026-12')?.baseline).toBe(109.9);
  });

  it('确定性：同输入两次计算逐字段一致（禁随机）', () => {
    const input = { marketMonthEvents: [], marketMonthOverrides: {} };
    expect(computeMarketMonths(fixture, calendar, input)).toEqual(months);
  });

  it('生效值链：生效 = override ?? round1(baseline × 事件乘子)；事件只作用于预测月，历史月原样', () => {
    const withEvent = computeMarketMonths(fixture, calendar, {
      marketMonthEvents: [{ id: 'me-jan', label: '', startMonth: '2027-01', startDay: 29, durationMonths: 1, magnitudePct: 8 }],
      marketMonthOverrides: {},
    });
    // 首月按日均摊（覆盖 3/31 天）：2027-01 生效 = round1(105 × (1 + 8 × 3/31 / 100)) = 105.8
    const january = withEvent.find((point) => point.key === '2027-01');
    expect(january?.baseline).toBe(105);
    expect(january?.eventFactor).not.toBeNull();
    expect(january?.value).toBe(105.8);
    // 历史月不受事件影响（事件只作用于预测月）
    const history = withEvent[5]!;
    expect(history.status).toBe('actual');
    expect(history.eventFactor).toBeNull();
    expect(history.value).toBe(history.baseline);
  });

  it('computeWorkbench 输出附带同一 marketMonths（单一数据源）', () => {
    const result = computeWorkbench(fixture, base);
    expect(result.marketMonths).toEqual(months);
    // 季度链随结果输出（v2 marketQuarterForecast 出口已删，链值经 result.marketQuarters 消费）。
    expect(result.marketQuarters.filter((point) => point.status === 'forecast').map((point) => point.key))
      .toEqual(['2026Q4', '2027Q1', '2027Q2', '2027Q3', '2027Q4']);
    expect(result.marketQuarters.find((point) => point.key === '2027Q1')?.value).toBe(105);
  });
});

// ------------------------------------------------------------
// ② 月中事件均摊口径（纯日历计算，不读时间）
// ------------------------------------------------------------

describe('月中事件均摊口径（纯日历计算，不读时间）', () => {
  it('daysInMonthOf：平年闰年与各月天数；非法月键 null', () => {
    expect(daysInMonthOf('2026-02')).toBe(28);
    expect(daysInMonthOf('2028-02')).toBe(29);
    expect(daysInMonthOf('2000-02')).toBe(29);
    expect(daysInMonthOf('1900-02')).toBe(28);
    expect(daysInMonthOf('2026-01')).toBe(31);
    expect(daysInMonthOf('2026-04')).toBe(30);
    expect(daysInMonthOf('2026-13')).toBeNull();
    expect(daysInMonthOf('bad')).toBeNull();
  });

  it('monthCoverageRatio：29 日起（31 天月）= 3/31；1 日 = 1；超月起始日钳当月末日；非有限按全月', () => {
    expect(monthCoverageRatio(31, 29)).toBeCloseTo(3 / 31, 12);
    expect(monthCoverageRatio(31, 1)).toBe(1);
    expect(monthCoverageRatio(30, 15)).toBeCloseTo(16 / 30, 12);
    // 起始日 29 遇 28 天月 → 钳当月末日（占比 1/28，不静默丢弃）
    expect(monthCoverageRatio(28, 29)).toBeCloseTo(1 / 28, 12);
    expect(monthCoverageRatio(31, 99)).toBeCloseTo(1 / 31, 12);
    expect(monthCoverageRatio(31, Number.NaN)).toBe(1);
  });

  it('monthsBetween / monthKeyOfDate / quarterKeyOfMonth / monthsOfQuarterKey（月键工具）', () => {
    expect(monthsBetween('2026-11', '2026-11')).toBe(0);
    expect(monthsBetween('2026-11', '2027-01')).toBe(2);
    expect(monthsBetween('2026-11', '2026-10')).toBe(-1);
    expect(monthsBetween('bad', '2026-11')).toBeNull();
    expect(monthKeyOfDate('2026-11-02')).toBe('2026-11');
    expect(monthKeyOfDate('2026-13-02')).toBeNull();
    expect(monthKeyOfDate('bad')).toBeNull();
    expect(quarterKeyOfMonth('2026-11')).toBe('2026Q4');
    expect(quarterKeyOfMonth('2027-03')).toBe('2027Q1');
    expect(monthsOfQuarterKey('2027Q1')).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(monthsOfQuarterKey('2026Q4')).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('marketMonthEventFactor：首月按日均摊，后续整月线性递减（衰减固定递减），覆盖外 null', () => {
    const event = { id: 'e', label: 'x', startMonth: '2026-11', startDay: 29, durationMonths: 3, magnitudePct: 9 };
    expect(marketMonthEventFactor(event, '2026-10')).toBeNull();
    // 首月（11 月，30 天，覆盖 2/30）= 1 + 9% × (2/30)
    expect(marketMonthEventFactor(event, '2026-11')).toBeCloseTo(1 + 0.09 * (2 / 30), 12);
    // 第二月（offset 1）= 1 + 9% × (1 − 1/3)
    expect(marketMonthEventFactor(event, '2026-12')).toBeCloseTo(1 + 0.09 * (2 / 3), 12);
    // 第三月（offset 2）= 1 + 9% × (1 − 2/3)
    expect(marketMonthEventFactor(event, '2027-01')).toBeCloseTo(1 + 0.09 * (1 / 3), 12);
    expect(marketMonthEventFactor(event, '2027-02')).toBeNull();
    // 负幅度对称压低
    const negative = { ...event, magnitudePct: -6 };
    expect(marketMonthEventFactor(negative, '2026-11')).toBeCloseTo(1 - 0.06 * (2 / 30), 12);
  });

  it('主链接入（②大盘修正）：月度事件按周所属月生效；预测窗外无影响；基准无事件 = 中性', () => {
    // 基准（无任何事件/调整）：全部预测周大盘比值 = 1（未修正）。
    const baseMonths = computeMarketMonths(fixture, calendar, { marketMonthEvents: [], marketMonthOverrides: {} });
    for (const week of calendar.forecastWeeks.slice(0, 12)) {
      expect(marketFactorAt(calendar, baseMonths, week.id).factor).toBe(1);
    }
    // 覆盖 2026-12 的月度事件：2026W50–W53（12 月周）生效，11 月周不受影响。
    // （factor = 生效值 ÷ AI 基线，生效值经 round1 → 因子容差按两位小数断言。）
    const dec = computeMarketMonths(fixture, calendar, {
      marketMonthEvents: [{ id: 'me-d', label: '', startMonth: '2026-12', startDay: 1, durationMonths: 1, magnitudePct: 10 }],
      marketMonthOverrides: {},
    });
    expect(marketFactorAt(calendar, dec, '2026W49').factor).toBe(1);
    expect(marketFactorAt(calendar, dec, '2026W50').factor).toBeCloseTo(1.1, 2);
    expect(marketFactorAt(calendar, dec, '2026W53').factor).toBeCloseTo(1.1, 2);
    // 月中起始（12-29，覆盖 3/31）：12 月周乘子 ≈ 1 + 10% × 3/31（生效值经 round1）
    const partial = computeMarketMonths(fixture, calendar, {
      marketMonthEvents: [{ id: 'me-p', label: '', startMonth: '2026-12', startDay: 29, durationMonths: 1, magnitudePct: 10 }],
      marketMonthOverrides: {},
    });
    expect(marketFactorAt(calendar, partial, '2026W50').factor).toBeCloseTo(1 + 0.1 * (3 / 31), 2);
    // marketFactorAt note 与模型同源（浮框算例直接消费）。
    const note = marketFactorAt(calendar, dec, '2026W50').note;
    expect(note).toContain('120.9 ÷ AI 基线 109.9 = ×1.10');
  });
});

// ------------------------------------------------------------
// ③ withMarketMonthOverride · 按月调整（v3：不同步季度改格）
// ------------------------------------------------------------

describe('withMarketMonthOverride · 按月调整（v3 口径）', () => {
  it('单月调整：覆盖生效值 + 原因选填（空串合法）；只写 marketMonthOverrides', () => {
    const adjusted = withMarketMonthOverride(base, '2026-11', 120, '投屏会领导上调');
    expect(adjusted.marketMonthOverrides['2026-11']).toEqual({ value: 120, reason: '投屏会领导上调' });
    const months = computeMarketMonths(fixture, calendar, adjusted);
    const november = months.find((point) => point.key === '2026-11');
    expect(november?.override).toBe(120);
    expect(november?.value).toBe(120);
    expect(months.find((point) => point.key === '2026-10')?.override).toBeNull();
    // v3：无季度改格槽位；卡头人工状态由 overrideSourceOf 派生。
    expect(overrideSourceOf(adjusted)).toBe('human');
    expect(overrideSourceOf(base)).toBe('ai');
  });

  it('还原该月调整（value null）→ override 移除、overrideSource 回 ai', () => {
    const adjusted = withMarketMonthOverride(base, '2026-11', 120, '');
    const restored = withMarketMonthOverride(adjusted, '2026-11', null, '');
    expect(restored.marketMonthOverrides['2026-11']).toBeUndefined();
    expect(overrideSourceOf(restored)).toBe('ai');
  });

  it('事件乘子不触发人工状态：无月调整时 overrideSource 保持 ai（事件走②生效值，不算人工）', () => {
    const withEvents: WorkbenchParams = {
      ...base,
      marketMonthEvents: [{ id: 'me-x', label: '', startMonth: '2026-11', startDay: 1, durationMonths: 3, magnitudePct: 20 }],
    };
    expect(overrideSourceOf(withEvents)).toBe('ai');
    const months = computeMarketMonths(fixture, calendar, withEvents);
    const november = months.find((point) => point.key === '2026-11');
    expect(november?.override).toBeNull();
    expect(november?.value).toBe(Math.round(november!.baseline * november!.eventFactor! * 10) / 10);
  });

  it('调整值钳 40–200（round1）', () => {
    const low = withMarketMonthOverride(base, '2027-03', 10, '');
    expect(low.marketMonthOverrides['2027-03']?.value).toBe(40);
    const high = withMarketMonthOverride(base, '2027-03', 999, '');
    expect(high.marketMonthOverrides['2027-03']?.value).toBe(200);
    const rounded = withMarketMonthOverride(base, '2027-03', 93.555, '');
    expect(rounded.marketMonthOverrides['2027-03']?.value).toBe(93.6);
  });

  it('nextMarketMonthEventId：循环查重，删除任一事件不影响后续新增', () => {
    expect(nextMarketMonthEventId([])).toBe('me-custom-1');
    const existing = [
      { id: 'me-custom-1', label: '', startMonth: '2026-11', startDay: 1, durationMonths: 1, magnitudePct: 5 },
      { id: 'me-custom-2', label: '', startMonth: '2026-11', startDay: 1, durationMonths: 1, magnitudePct: 5 },
    ];
    expect(nextMarketMonthEventId(existing)).toBe('me-custom-3');
    expect(nextMarketMonthEventId([existing[0]!])).toBe('me-custom-2');
  });
});

// ------------------------------------------------------------
// ④ 证据信任口径 · marketTrendWindow / marketMonthShape（窗口 = 6 个月）
// ------------------------------------------------------------

describe('证据信任口径 · marketTrendWindow / marketMonthShape（2026-11-04 拍板：窗口 = 6 个月）', () => {
  it('MARKET_TREND_WINDOW_MONTHS = 6（模型与 UI 统一口径常量，禁止两套口径）', () => {
    expect(MARKET_TREND_WINDOW_MONTHS).toBe(6);
  });

  it('窗口 = 收盘于最后实际月的连续 6 个实际月；逐月环比 round1、首月 null（不造数）', () => {
    const { months, avgMomPct } = marketTrendWindow(fixture);
    expect(months.map((point) => point.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(months.map((point) => point.value)).toEqual([105, 104.4, 102.6, 103.4, 103, 101.5]);
    // 环比由所画 6 个月真实计算：104.4/105−1 ≈ −0.571% → −0.6；102.6/104.4−1 ≈ −1.724% → −1.7；
    // 103.4/102.6−1 ≈ +0.780% → +0.8；103/103.4−1 ≈ −0.387% → −0.4；101.5/103−1 ≈ −1.456% → −1.5
    expect(months.map((point) => point.momPct)).toEqual([null, -0.6, -1.7, 0.8, -0.4, -1.5]);
    // 均值由未取整环比的算术平均（−0.712…）→ round1 = −0.7（浮框「近 6 个月环比 −0.7%/月」同源）
    expect(avgMomPct).toBe(-0.7);
  });

  it('窗口与月度主序列历史段同源（computeMarketMonths 历史尾段 = 窗口，UI 高亮段即模型窗口）', () => {
    const all = computeMarketMonths(fixture, calendar, { marketMonthEvents: [], marketMonthOverrides: {} });
    const actualTail = all.filter((point) => point.status === 'actual').slice(-MARKET_TREND_WINDOW_MONTHS);
    const { months } = marketTrendWindow(fixture);
    expect(months.map((point) => point.key)).toEqual(actualTail.map((point) => point.key));
    expect(months.map((point) => point.value)).toEqual(actualTail.map((point) => point.value));
  });

  it('确定性：同输入两次计算逐字段一致（禁随机）', () => {
    expect(marketTrendWindow(fixture)).toEqual(marketTrendWindow(fixture));
  });

  it('marketMonthShape：去年同季月形与月形分布（lastYearMonthWeights）同源，权重 = 月值 ÷ 季内均值', () => {
    const shape = marketMonthShape(fixture, '2027Q1');
    expect(shape.map((point) => point.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(shape.map((point) => point.value)).toEqual([107, 106.4, 107.6]);
    expect(shape.map((point) => point.weight)).toEqual([107 / 107, 106.4 / 107, 107.6 / 107]);
    // 浮框算例同源：2027-02 基线 = round1(2027Q1 基线 105 × 2026-02 权重) = 104.4
    const monthsList = computeMarketMonths(fixture, calendar, { marketMonthEvents: [], marketMonthOverrides: {} });
    const february = monthsList.find((point) => point.key === '2027-02');
    expect(february?.baseline).toBe(Math.round(105 * (106.4 / 107) * 10) / 10);
    expect(february?.baseline).toBe(104.4);
  });

  it('marketMonthShape：非法季度键返回空数组；去年同季缺月回退均等 1/3 权重、value null（不造数）', () => {
    expect(marketMonthShape(fixture, 'bad')).toEqual([]);
    // 2028Q1 去年同季 = 2027Q1（不在 24 个历史月内）→ 均等回退
    const shape = marketMonthShape(fixture, '2028Q1');
    expect(shape.map((point) => point.key)).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(shape.map((point) => point.value)).toEqual([null, null, null]);
    expect(shape.map((point) => point.weight)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });
});

// ------------------------------------------------------------
// ⑤ v3 12 个预测月大盘（B.4.5 · IA 文档任务 4，保留段）
// ------------------------------------------------------------

describe('v3 market months', () => {
  it('covers the shared horizon and applies a mid-2027 override', () => {
    const baseline = computeMarketMonths(workbenchFixtureV3, calendar, {
      marketMonthEvents: [], marketMonthOverrides: {},
    });
    const adjusted = computeMarketMonths(workbenchFixtureV3, calendar, {
      marketMonthEvents: [], marketMonthOverrides: { '2027-06': { value: 120, reason: '' } },
    });
    expect(baseline.filter((point) => point.status === 'forecast').map((point) => point.key))
      .toEqual(calendar.forecastMonths.map((month) => month.key));
    const june = adjusted.find((point) => point.key === '2027-06')!;
    const juneWeek = calendar.forecastWeeks.find((week) => week.monthKey === '2027-06')!;
    expect(marketFactorAt(calendar, adjusted, juneWeek.id).factor).toBeCloseTo(120 / june.baseline, 10);
  });

  it('does not redistribute October actuals into November or December', () => {
    const input = { marketMonthEvents: [], marketMonthOverrides: {} };
    const result = computeMarketMonths(workbenchFixtureV3, calendar, input);
    const changedFixture = {
      ...workbenchFixtureV3,
      market: {
        ...workbenchFixtureV3.market,
        months: workbenchFixtureV3.market.months.map((month) => month.key === '2026-10'
          ? { ...month, value: month.value + 10 }
          : month),
      },
    };
    const changed = computeMarketMonths(changedFixture, calendar, input);
    expect(result.find((point) => point.key === '2026-10')?.status).toBe('actual');
    expect(changed.find((point) => point.key === '2026-11')?.baseline)
      .toBe(result.find((point) => point.key === '2026-11')?.baseline);
    expect(changed.find((point) => point.key === '2026-12')?.baseline)
      .toBe(result.find((point) => point.key === '2026-12')?.baseline);
  });

  it('keeps every horizon month on the quarter chain (2027-10 not fallen back to 1)', () => {
    // 季度外推覆盖 horizon 全部季度：2027-10 属 2027Q4，链上生成后筛选，
    // 不得只生成前两季后让 Q2 以后回退 1。
    const months = computeMarketMonths(workbenchFixtureV3, calendar, { marketMonthEvents: [], marketMonthOverrides: {} });
    const forecast = months.filter((point) => point.status === 'forecast');
    expect(forecast).toHaveLength(12);
    expect(forecast.every((point) => point.baseline > 0)).toBe(true);
    expect(months.find((point) => point.key === '2027-10')?.quarter).toBe('2027Q4');
  });

  it('conserves full future quarters at chain value × 3 and keeps partial-Q4 months independent', () => {
    // 与实现同源重算季度链（原月季同源规则，按窗口位置映射入位比）：
    // quarters[0] = 2024Q4 → 窗口位置 0…3 = Q4,Q1,Q2,Q3；入位比 [p]/[p−1]，位置 0 = [0]/[3]。
    const values = workbenchFixtureV3.market.quarters.map((quarter) => quarter.value);
    const lastYear = values.slice(0, 4);
    const thisYear = values.slice(4);
    const avg = (list: number[]): number => list.reduce((total, v) => total + v, 0) / list.length;
    const trend = avg(thisYear) / avg(lastYear);
    const into = (position: number): number => (position === 0 ? lastYear[0] / lastYear[3] : lastYear[position] / lastYear[position - 1]);
    const q4 = Math.round(thisYear[3] * into(0) * trend * 10) / 10; // 2026Q4（入位 0）
    const q1 = Math.round(q4 * into(1) * trend * 10) / 10; // 2027Q1
    const q2 = Math.round(q1 * into(2) * trend * 10) / 10; // 2027Q2
    const q3 = Math.round(q2 * into(3) * trend * 10) / 10; // 2027Q3
    const months = computeMarketMonths(workbenchFixtureV3, calendar, { marketMonthEvents: [], marketMonthOverrides: {} });
    const sumOf = (quarter: string): number =>
      months.filter((point) => point.quarter === quarter && point.status === 'forecast')
        .reduce((total, point) => total + point.baseline, 0);
    // 完整未来季：三月合计精确 = 季度链值 × 3（末月吸收舍入残差）
    expect(sumOf('2027Q1')).toBeCloseTo(q1 * 3, 6);
    expect(sumOf('2027Q2')).toBeCloseTo(q2 * 3, 6);
    expect(sumOf('2027Q3')).toBeCloseTo(q3 * 3, 6);
    // 部分实际季（2026Q4 的 2026-10 已实际）：11/12 月各自 = round1(季度基线 × 去年月形)，
    // 不把实际与旧季度目标的差额重摊给未来月。
    const shape = ['2025-10', '2025-11', '2025-12']
      .map((key) => workbenchFixtureV3.market.months.find((month) => month.key === key)!.value);
    const shapeAvg = (shape[0]! + shape[1]! + shape[2]!) / 3;
    const november = months.find((point) => point.key === '2026-11');
    const december = months.find((point) => point.key === '2026-12');
    expect(november?.baseline).toBe(Math.round(q4 * (shape[1]! / shapeAvg) * 10) / 10);
    expect(december?.baseline).toBe(Math.round(q4 * (shape[2]! / shapeAvg) * 10) / 10);
  });
});
