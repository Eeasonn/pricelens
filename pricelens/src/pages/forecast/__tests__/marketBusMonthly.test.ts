// ============================================================
// 大盘月度段纯函数金测（2026-11-04 拍板 · marketBusMonthly）：
// 覆盖 workbenchModel 大盘月度段四组纯函数——
// ① 季度基线 4 季外推（marketQuarterForecast：前两季与 marketSeriesBaseline
//    的 aiQ4/aiQ1 同源同值；后两季同链确定性外推，禁随机）；
// ② 月度主序列（computeMarketMonths：历史月不动、预测月 = 季度基线按去年
//    同季月形分布；**容量守恒** = 季内三月合计恒等季度基线 × 3；确定性 =
//    同输入两次计算逐字段一致；事件乘子只作用于预测月）；
// ③ 月中事件均摊（daysInMonthOf / monthCoverageRatio / marketMonthEventFactor：
//    首月按日均摊 = 幅度 × 覆盖天数 ÷ 当月天数，覆盖外 null，起始日超月按末日）；
// ④ 按月调整（withMarketMonthOverride：覆盖生效值、原因选填、有人工调整的
//    季度经季内三月均值同步 q4/q1Override，无调整季度回 null = AI）。
// ⑤ 证据信任 v2 口径（2026-11-04 晚拍板：趋势窗口 = 6 个月）：
//    marketTrendWindow（近 6 个月实际段 + 逐月环比 + 环比均值）与
//    marketMonthShape（去年同季月形权重）——大盘卡证据浮框/图上趋势源段/
//    徽章三步链的唯一数字来源，UI 不另算（环比数字与模型同源断言）。
// 全部断言不依赖运行时间与随机数。
// ============================================================
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { workbenchFixture } from '../workbenchFixture';
import {
  baseWorkbenchParams,
  computeMarketFactor,
  computeMarketMonths,
  computeWorkbench,
  daysInMonthOf,
  MARKET_TREND_WINDOW_MONTHS,
  marketMonthEventFactor,
  marketMonthShape,
  marketQuarterForecast,
  marketSeriesBaseline,
  marketTrendWindow,
  monthCoverageRatio,
  monthKeyOfDate,
  monthsBetween,
  monthsOfQuarterKey,
  nextMarketMonthEventId,
  quarterKeyOfMonth,
  withMarketMonthOverride,
  type MarketMonthPoint,
} from '../workbenchModel';

const fixture = workbenchFixture;
const base = baseWorkbenchParams(fixture);

const forecastOf = (months: MarketMonthPoint[]): MarketMonthPoint[] => months.filter((point) => point.status === 'forecast');
const baselineOfQuarter = (months: MarketMonthPoint[], quarter: string): number[] =>
  months.filter((point) => point.quarter === quarter && point.status === 'forecast').map((point) => point.baseline);
const sum = (list: number[]): number => list.reduce((total, value) => total + value, 0);

describe('marketQuarterForecast · 季度基线 4 季外推', () => {
  it('前两季与 marketSeriesBaseline 的 aiQ4/aiQ1 同源同值（不出现第二套数字）', () => {
    const { aiQ4, aiQ1 } = marketSeriesBaseline(fixture);
    const forecast = marketQuarterForecast(fixture);
    expect(forecast).toHaveLength(4);
    expect(forecast[0]).toEqual({ key: '2026Q4', value: aiQ4 });
    expect(forecast[1]).toEqual({ key: '2027Q1', value: aiQ1 });
  });

  it('后两季沿同链外推：Q2 = round1(Q1 × 2025Q2/2025Q1 × 趋势)、Q3 = round1(Q2 × 2025Q3/2025Q2 × 趋势)', () => {
    const values = fixture.market.quarters.map((quarter) => quarter.value);
    const lastYear = values.slice(0, 4);
    const avg = (list: number[]): number => list.reduce((total, v) => total + v, 0) / list.length;
    const trend = avg(values.slice(4)) / avg(lastYear);
    const { aiQ1 } = marketSeriesBaseline(fixture);
    const expectQ2 = Math.round(aiQ1 * (lastYear[1] / lastYear[0]) * trend * 10) / 10;
    const expectQ3 = Math.round(expectQ2 * (lastYear[2] / lastYear[1]) * trend * 10) / 10;
    const forecast = marketQuarterForecast(fixture);
    expect(forecast[2].key).toBe('2027Q2');
    expect(forecast[2].value).toBe(expectQ2);
    expect(forecast[3].key).toBe('2027Q3');
    expect(forecast[3].value).toBe(expectQ3);
    // 递减链（大盘同比漂移为负）+ 确定性：两次调用逐字段一致
    expect(forecast[3].value).toBeLessThan(forecast[2].value);
    expect(forecast[2].value).toBeLessThan(forecast[1].value);
    expect(marketQuarterForecast(fixture)).toEqual(forecast);
  });
});

describe('computeMarketMonths · 月度主序列（容量守恒 + 确定性）', () => {
  const months = computeMarketMonths(fixture, base);

  it('结构：33 个月 = 历史月（fixture 原样）21 + 预测月 12（未来 4 季 × 3）', () => {
    expect(months).toHaveLength(fixture.market.months.length + 12);
    expect(months[0]).toMatchObject({ key: '2025-01', status: 'actual', baseline: fixture.market.months[0].value, value: fixture.market.months[0].value });
    expect(months.slice(0, fixture.market.months.length).every((point) => point.status === 'actual')).toBe(true);
    expect(forecastOf(months).map((point) => point.key)).toEqual([
      '2026-10', '2026-11', '2026-12',
      '2027-01', '2027-02', '2027-03',
      '2027-04', '2027-05', '2027-06',
      '2027-07', '2027-08', '2027-09',
    ]);
    expect(months.map((point) => point.quarter)).toContain('2027Q3');
  });

  it('容量守恒：每个预测季的三月合计精确 = 季度基线 × 3（含默认月度事件前的 baseline 口径）', () => {
    for (const quarter of marketQuarterForecast(fixture)) {
      const quarterBaselines = baselineOfQuarter(months, quarter.key);
      expect(quarterBaselines).toHaveLength(3);
      expect(sum(quarterBaselines)).toBeCloseTo(quarter.value * 3, 6);
    }
    expect(sum(baselineOfQuarter(months, '2026Q4'))).toBeCloseTo(303.9, 6);
    expect(sum(baselineOfQuarter(months, '2027Q1'))).toBeCloseTo(280.8, 6);
  });

  it('确定性：同输入两次计算逐字段一致（禁随机）', () => {
    expect(computeMarketMonths(fixture, base)).toEqual(months);
  });

  it('生效值链：生效 = override ?? round1(baseline × 事件乘子)；事件只作用于预测月，历史月原样', () => {
    // 默认月度事件（2027-01-29 起 1 个月 +8%）：2027-01 生效 = round1(93.3 × (1 + 8 × 3/31 / 100)) = 94
    const january = months.find((point) => point.key === '2027-01');
    expect(january?.baseline).toBeCloseTo(93.3, 6);
    expect(january?.eventFactor).not.toBeNull();
    expect(january?.value).toBe(94);
    // 历史月不受事件影响（事件只作用于预测月）
    const history = months[5];
    expect(history.status).toBe('actual');
    expect(history.eventFactor).toBeNull();
    expect(history.value).toBe(history.baseline);
  });

  it('computeWorkbench 输出附带同一 marketMonths（单一数据源）', () => {
    const result = computeWorkbench(fixture, base);
    expect(result.marketMonths).toEqual(months);
  });
});

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

  it('主链接入（大盘修正段附加叠加）：月度事件按周所属月生效；预测窗外无影响；基准无月度事件 = 既有口径', () => {
    // 基准（默认月度事件 2027-01 起，主链预测窗 W45–W52 = 2026-11/12 之外）→ 清零周口径事件后各周乘子仍 = 1
    const noWeekly = { ...base, marketEvents: [] };
    for (let week = 45; week <= 52; week += 1) {
      expect(computeMarketFactor(fixture, noWeekly, week)).toBe(1);
    }
    // 覆盖 2026-12 的月度事件：W49–W52（12 月周）生效，W45–W48（11 月周）不受影响
    const dec = { ...noWeekly, marketMonthEvents: [{ id: 'me-d', label: '', startMonth: '2026-12', startDay: 1, durationMonths: 1, magnitudePct: 10 }] };
    expect(computeMarketFactor(fixture, dec, 48)).toBe(1);
    expect(computeMarketFactor(fixture, dec, 49)).toBeCloseTo(1.1, 10);
    expect(computeMarketFactor(fixture, dec, 52)).toBeCloseTo(1.1, 10);
    // 月中起始（12-29，覆盖 3/31）：12 月周乘子 = 1 + 10% × 3/31
    const partial = { ...dec, marketMonthEvents: [{ id: 'me-p', label: '', startMonth: '2026-12', startDay: 29, durationMonths: 1, magnitudePct: 10 }] };
    expect(computeMarketFactor(fixture, partial, 49)).toBeCloseTo(1 + 0.1 * (3 / 31), 10);
  });
});

describe('withMarketMonthOverride · 按月调整与季度同步', () => {
  it('单月调整：覆盖生效值 + 原因选填（空串合法）；同季三月中只有调整月变值', () => {
    const adjusted = withMarketMonthOverride(base, fixture, '2026-11', 120, '投屏会领导上调');
    expect(adjusted.marketMonthOverrides['2026-11']).toEqual({ value: 120, reason: '投屏会领导上调' });
    const months = computeMarketMonths(fixture, adjusted);
    const november = months.find((point) => point.key === '2026-11');
    expect(november?.override).toBe(120);
    expect(november?.value).toBe(120);
    expect(months.find((point) => point.key === '2026-10')?.override).toBeNull();
  });

  it('季度同步：有人工调整的季度 q4Override = round1(季内三月（调整 ?? AI 月基线）均值) 并转 human', () => {
    const months = computeMarketMonths(fixture, { marketMonthEvents: [], marketMonthOverrides: {} });
    const q4 = months.filter((point) => point.quarter === '2026Q4').map((point) => point.baseline);
    const adjusted = withMarketMonthOverride(base, fixture, '2026-11', 120, '');
    // (101.8 + 120 + 100.8) / 3 = 107.533…→ round1 = 107.5（与月度 AI 口径一致，非季度链口径）
    expect(adjusted.q4Override).toBe(Math.round(((q4[0] + 120 + q4[2]) / 3) * 10) / 10);
    expect(adjusted.q4Override).toBe(107.5);
    expect(adjusted.q1Override).toBeNull();
    expect(adjusted.overrideSource).toBe('human');
  });

  it('还原该季唯一调整月 → 对应季度 override 回 null、overrideSource 回 ai（回 AI 口径不变）', () => {
    const adjusted = withMarketMonthOverride(base, fixture, '2026-11', 120, '');
    const restored = withMarketMonthOverride(adjusted, fixture, '2026-11', null, '');
    expect(restored.marketMonthOverrides['2026-11']).toBeUndefined();
    expect(restored.q4Override).toBeNull();
    expect(restored.q1Override).toBeNull();
    expect(restored.overrideSource).toBe('ai');
  });

  it('事件乘子不触发季度同步：无人工调整时季度改格保持 null（事件走周口径修正段）', () => {
    const withEvents = { ...base, marketMonthEvents: [{ id: 'me-x', label: '', startMonth: '2026-10', startDay: 1, durationMonths: 3, magnitudePct: 20 }] };
    const synced = withMarketMonthOverride(withEvents, fixture, '2027-05', 90, '');
    // 只调 2027-05（2027Q2，无主链改格槽位）→ q4/q1 仍 null（事件对 Q4 月线的抬升不改写季度改格）
    expect(synced.q4Override).toBeNull();
    expect(synced.q1Override).toBeNull();
    expect(synced.overrideSource).toBe('ai');
  });

  it('调整值钳 40–200（round1）', () => {
    const low = withMarketMonthOverride(base, fixture, '2027-03', 10, '');
    expect(low.marketMonthOverrides['2027-03']?.value).toBe(40);
    const high = withMarketMonthOverride(base, fixture, '2027-03', 999, '');
    expect(high.marketMonthOverrides['2027-03']?.value).toBe(200);
    const rounded = withMarketMonthOverride(base, fixture, '2027-03', 93.555, '');
    expect(rounded.marketMonthOverrides['2027-03']?.value).toBe(93.6);
  });

  it('nextMarketMonthEventId：循环查重，删除任一事件不影响后续新增', () => {
    expect(nextMarketMonthEventId([])).toBe('me-custom-1');
    const existing = [
      { id: 'me-custom-1', label: '', startMonth: '2026-10', startDay: 1, durationMonths: 1, magnitudePct: 5 },
      { id: 'me-custom-2', label: '', startMonth: '2026-10', startDay: 1, durationMonths: 1, magnitudePct: 5 },
    ];
    expect(nextMarketMonthEventId(existing)).toBe('me-custom-3');
    expect(nextMarketMonthEventId([existing[0]])).toBe('me-custom-2');
  });
});

describe('证据信任 v2 口径 · marketTrendWindow / marketMonthShape（2026-11-04 拍板：窗口 = 6 个月）', () => {
  it('MARKET_TREND_WINDOW_MONTHS = 6（模型与 UI 统一口径常量，禁止两套口径）', () => {
    expect(MARKET_TREND_WINDOW_MONTHS).toBe(6);
  });

  it('窗口 = 收盘于最后实际月的连续 6 个实际月；逐月环比 round1、首月 null（不造数）', () => {
    const { months, avgMomPct } = marketTrendWindow(fixture);
    expect(months.map((point) => point.key)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(months.map((point) => point.value)).toEqual([106, 105.4, 106.6, 104.6, 104, 103.4]);
    // 环比由所画 6 个月真实计算：105.4/106−1 ≈ −0.566% → −0.6；106.6/105.4−1 ≈ +1.139% → +1.1；
    // 104.6/106.6−1 ≈ −1.876% → −1.9；104/104.6−1 ≈ −0.574% → −0.6；103.4/104−1 ≈ −0.577% → −0.6
    expect(months.map((point) => point.momPct)).toEqual([null, -0.6, 1.1, -1.9, -0.6, -0.6]);
    // 均值由未取整环比的算术平均（−0.4908…）→ round1 = −0.5（浮框「近 6 个月环比 −0.5%/月」同源）
    expect(avgMomPct).toBe(-0.5);
  });

  it('窗口与月度主序列历史段同源（computeMarketMonths 历史尾段 = 窗口，UI 高亮段即模型窗口）', () => {
    const all = computeMarketMonths(fixture, { marketMonthEvents: [], marketMonthOverrides: {} });
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
    expect(shape.map((point) => point.value)).toEqual([107.6, 108.4, 108]);
    expect(shape.map((point) => point.weight)).toEqual([107.6 / 108, 108.4 / 108, 1]);
    // 浮框算例同源：2027-02 基线 = round1(2027Q1 基线 93.6 × 2026-02 权重) = 93.9
    const monthsList = computeMarketMonths(fixture, { marketMonthEvents: [], marketMonthOverrides: {} });
    const february = monthsList.find((point) => point.key === '2027-02');
    expect(february?.baseline).toBe(Math.round(93.6 * (108.4 / 108) * 10) / 10);
    expect(february?.baseline).toBe(93.9);
  });

  it('marketMonthShape：非法季度键返回空数组；去年同季缺月回退均等 1/3 权重、value null（不造数）', () => {
    expect(marketMonthShape(fixture, 'bad')).toEqual([]);
    // 2028Q1 去年同季 = 2027Q1（不在 21 个历史月内）→ 均等回退
    const shape = marketMonthShape(fixture, '2028Q1');
    expect(shape.map((point) => point.key)).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(shape.map((point) => point.value)).toEqual([null, null, null]);
    expect(shape.map((point) => point.weight)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });
});
