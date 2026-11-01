// ============================================================
// 量价预测 · 24 周模拟数据 fixture（typed adapter，状态 simulated）
// 造数依据 docs/lifecycle-os-mvp/02-simple-demo-simulation-data.md：
//   范围：R国 · 直营电商 · HUAWEI Pura 90 Pro 12+256GB · 生命周期 W1–W24
//   （W1–W10 实际，W11–W24 预测，当前周 W10），来源 demo_seed。
// 规则落点：
//   1. 基线先爬坡后缓慢下降，无随机跳点；
//   2. 价格仅在 W6 / W10 / W15 少量阶跃，不与促销周同时发生；
//   3. 大促只影响活动窗口及活动后一周（透支回落），不永久外推；
//   4. 竞品上市（W10）首周冲击后按 exp(-age/6) 逐周递减，窗口 6 周，
//      竞品促销（W12）单周脉冲叠加；简单版只作为我司份额压力；
//   5. W8–W9 可供量低于无约束需求，形成可解释缺货截断；
//   6. 库存恒等式 / 销毛链由 forecastModel 计算，不在 fixture 存派生值；
//   7. 成本 W15 阶跃上调，只影响销毛与价格底线，不改需求。
// 这里只存输入事实（不含 unconstrained_demand_truth 等验模真值）。
// ============================================================
import type { ForecastDataset, ForecastInputWeek, LifecyclePhase, WeekStatus } from './forecastModel';

const WEEK_COUNT = 24;
const ACTUAL_WEEKS = 10; // W1–W10 实际，W11–W24 预测

/** 生命周期周起始日期（模拟，与独立 Demo 对齐：2026-01-05 起每周一档）。 */
function weekDate(index: number): string {
  return new Date(Date.UTC(2026, 0, 5 + index * 7)).toISOString().slice(0, 10);
}

function phaseOf(week: number): LifecyclePhase {
  if (week <= 4) return 'launch';
  if (week <= 10) return 'growth';
  if (week <= 18) return 'mature';
  return 'decline';
}

function statusOf(week: number): WeekStatus {
  return week <= ACTUAL_WEEKS ? 'actual' : 'forecast';
}

/** 基线需求（台）：首销爬坡 → 成熟缓慢下降 → 衰退加速（规则 1，无随机项）。 */
const BASE_DEMAND = [520, 620, 710, 770, 810, 825, 820, 810, 800, 790, 780, 770, 760, 748, 736, 724, 712, 700, 688, 676, 664, 652, 640, 628];

/** 消费者感知价格（USD）：W6 999→979、W10 979→959、W15 959→939（规则 2）。 */
const PRICE = [999, 999, 999, 999, 999, 979, 979, 979, 979, 959, 959, 959, 959, 959, 939, 939, 939, 939, 939, 939, 939, 939, 939, 939];

const RRP = 999;

/** 当周可供成交量（台）：W8–W9 供应波动压到需求之下（规则 5）。 */
const AVAILABLE = [650, 760, 840, 900, 920, 1060, 1050, 650, 670, 820, 930, 930, 920, 900, 880, 860, 840, 820, 900, 860, 800, 760, 720, 720];

/** Sell-in 计划（台）。 */
const SI = [680, 780, 860, 900, 940, 1080, 1060, 560, 650, 780, 860, 880, 840, 820, 800, 780, 760, 740, 760, 720, 700, 680, 660, 640];

/** 单台成本（USD）：W15 起上调 680→700（规则 7）。 */
const COST = [...Array<number>(14).fill(680), ...Array<number>(WEEK_COUNT - 14).fill(700)];

const weeks: ForecastInputWeek[] = Array.from({ length: WEEK_COUNT }, (_, index) => {
  const week = index + 1;
  return {
    week: `W${week}`,
    date: weekDate(index),
    status: statusOf(week),
    phase: phaseOf(week),
    baseDemand: BASE_DEMAND[index],
    price: PRICE[index],
    rrp: RRP,
    available: AVAILABLE[index],
    si: SI[index],
    cost: COST[index],
  };
});

/** 简单版演示数据集：全部字段 simulated，不随全局筛选变化。 */
export const forecastFixture: ForecastDataset = {
  meta: {
    status: 'simulated',
    modelVersion: 'simple-demo-v1',
    source: 'demo_seed',
    generatedAt: '2026-11-01',
    currency: 'USD',
    note: '模拟数据，仅用于演示简单版量价预测闭环，不代表真实市场、销量或利润。',
  },
  context: {
    country: 'R国',
    channel: '直营电商',
    product: 'HUAWEI Pura 90 Pro 12+256GB',
    competitors: ['Apple iPhone 17 8+256GB', 'Samsung S26 12+256GB'],
    priceBand: 'USD 800–1000',
    currentWeek: 'W10',
    weekRange: 'W1–W24',
  },
  weeks,
  promoWindows: [
    { id: 'promo-summer', label: '夏季大促', start: 6, end: 7, depth: 0.14 },
    { id: 'promo-yearend', label: '年末清库促销', start: 19, end: 20, depth: 0.08 },
  ],
  competitorLaunches: [
    // 上市后 6 周递减：压力 = -12% × exp(-age / 6)，不改变市场总量。
    { id: 'cmp-launch-w10', label: '竞品新品上市', week: 10, impact: -0.12, windowWeeks: 6, halfLifeWeeks: 6 },
  ],
  competitorPulses: [{ id: 'cmp-promo-w12', label: '竞品促销', week: 12, impact: -0.05 }],
  events: [
    { id: 'E01', weekLabel: 'W1', type: 'lifecycle', label: '当前产品上市', shape: '爬坡后平台', detail: '建立首销与生命周期基线' },
    { id: 'E02', weekLabel: 'W6–W7', type: 'promo', label: '夏季大促', shape: '平台脉冲', detail: '活动强度 14%，活动后一周透支回落，不永久外推' },
    { id: 'E03', weekLabel: 'W8–W9', type: 'supply', label: '供应波动', shape: '供给上限', detail: '无约束需求保留，SO 按可供量截断' },
    { id: 'E04', weekLabel: 'W10', type: 'competitor', label: '竞品新品上市', shape: '首周冲击后递减', detail: '简单版只将其作为我司份额压力，扩盘比例待验证' },
    { id: 'E05', weekLabel: 'W12', type: 'competitor', label: '竞品促销', shape: '单周脉冲', detail: '在上市递减窗口上叠加一周份额压力' },
    { id: 'E06', weekLabel: 'W15', type: 'cost', label: '成本上调', shape: '成本阶跃', detail: '只影响销毛和价格底线，不修改需求' },
    { id: 'E07', weekLabel: 'W19–W20', type: 'promo', label: '年末清库促销', shape: '平台脉冲', detail: '活动强度 8%，促进成交与库存消化' },
  ],
  factorProfiles: [
    {
      key: 'baseline',
      label: '需求基线',
      scope: '需求',
      window: 'W1–W24',
      shape: '趋势 + 季节 + 生命周期爬坡 / 衰减',
      status: '模型学习',
      evidence: '上一代同期 + 当前实际（模拟）',
      confidence: '中',
    },
    {
      key: 'price',
      label: '消费者感知价格',
      scope: '需求',
      window: '调价周起持续生效',
      shape: '价格阶跃 × 弹性 −1.70（可学习）',
      status: '模型学习',
      evidence: '历史调价周（模拟）',
      confidence: '中',
    },
    {
      key: 'promo',
      label: '促销事件',
      scope: '需求',
      window: '活动周 + 活动后一周',
      shape: '平台脉冲 + 透支回落',
      status: '业务假设',
      evidence: '促销日历 / 活动强度',
      confidence: '中',
    },
    {
      key: 'competitor',
      label: '竞品压力',
      scope: '份额压力',
      window: '上市后 6 周',
      shape: '首周冲击后逐周递减（半衰期 6 周）',
      status: '方向性判断',
      evidence: '竞品事件 + 可比价格',
      confidence: '低',
      boundary: '简单版只将其作为我司份额压力，扩盘比例待验证',
    },
    {
      key: 'supply',
      label: '可供量 / 缺货',
      scope: '成交约束',
      window: '按周',
      shape: '上限截断：SO = min(无约束需求, 可供量)',
      status: '确定性计算',
      evidence: '供应计划 / 配额（模拟）',
      confidence: '高',
    },
  ],
  params: {
    referencePrice: RRP,
    priceElasticity: -1.7,
    promoLiftCoefficient: 1.6,
    promoAftermathFactor: 0.92,
    channelFeeRate: 0.14,
    initialInventory: 460,
    currentWeekIndex: 9, // W10
  },
};
