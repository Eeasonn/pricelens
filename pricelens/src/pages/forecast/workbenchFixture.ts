// ============================================================
// 量价预测 · 推演工作台 v3 统一模拟数据（forecast-workbench-v3）
// 正典：design-proposals/forecast-global-ia-review.md 附录 A.2 / B.4 / B.6。
// 数据 = workbenchSimulation.createWorkbenchSimulation 在统一日历（任务 1）上
// 固定种子确定性生成（52 实际周含缺采 · 参考 108 周零缺口 · 24 实际大盘月 ·
// 12 个月 SI/成本/价格计划 · 4 个已知促销窗口）。
//
// ⚠️ 任务 5 拍板（IA 文档 B.6.2，替换本文件旧头注释的并存约束）：
// workbenchFixture 即唯一 fixture 出口（modelVersion = workbench-demo-v3）。
// 旧 v2 fixture（16 周 W37–W52、basePath、promoBand、defaultMarketEvents、
// anchors、fromWeek 成本版本）已随 v2 预测主链一并删除，此后不得保留两套
// 预测主链或两套 fixture。WorkbenchFixtureV3 / workbenchFixtureV3 仅为
// Wave 2 纯函数（workbenchLearning / workbenchSimulation）与既有 v3 测试
// 的同名别名，指向同一份数据。
// 相对 v2 的字段变化（B.4.1 / B.4.4 拍板）：
//   - 新增 calendar：统一日历输入（buildForecastCalendar 的入参形态）；
//   - weeks 改带跨年周 id（YYYYWww 唯一主键）与 lifecycleIndex（本品周龄，
//     映射 lifecyclePool 同周龄点）；缺采周 sales=null 不造 0；
//   - costVersions 改 monthKey 键控（不再 fromWeek 裸周号，跨年不串值）；
//   - 新增 promoWindows（B.4.4 PromoWindow，多个已知促销窗口，学习促销
//     特征与档期价共用），取代 v2 单一 promoBand 概念；
//   - 不再携带 basePath：①基线必须自动学习（B.1），预置基线不得改名后
//     冒充学习结果；不再携带 defaultMarketEvents / promoBand / anchors
//     （行业级事件由 params.marketEvents 承载，基准 = 空数组）。
// 全部数值为演示（simulated）：销量单位台、价格/成本 USD；只存输入事实，
// 派生值（学习基线、大盘修正、库存推演、DOS、健康判定、销毛）由
// workbenchModel 计算。
// ============================================================
import { buildForecastCalendar } from './workbenchCalendar';
import type { ForecastCalendarInput, WeekRange } from './workbenchCalendar';
import { createWorkbenchSimulation } from './workbenchSimulation';

/** 大盘季度指数（单序列：实际值；预测季由模型按季度基线链外推，不存 fixture）。 */
export interface MarketQuarterSeed {
  /** 季度键，如 '2025Q1'。 */
  key: string;
  /** 季度指数（实际值）。 */
  value: number;
}

/** 大盘月度指数（历史实际月为模拟样本；预测月由②按季度基线月形分布生成）。 */
export interface MarketMonthSeed {
  /** 月键，如 '2025-01'。 */
  key: string;
  /** 月度指数（模拟实际）。 */
  value: number;
}

/**
 * 行业级大盘事件（v3 · B.4.2 WeekRange 口径）：任意起止周闭区间 + 脉冲幅度 +
 * 衰减形状；落点只按统一日历绝对 index（跨年不串值）。人工录入假设；
 * 基准考量 marketEvents = []（v3 fixture 不再预填行业事件）。
 */
export interface MarketEventSeed extends WeekRange {
  id: string;
  label: string;
  /** 脉冲幅度峰值（%，正 = 抬升总量，负 = 压低）。 */
  magnitudePct: number;
  /** 衰减方式：递减（线性从峰值衰减）/ 恒定。 */
  decay: 'decreasing' | 'flat';
}

/**
 * 大盘人工月度事件（三字段极简口径）：起始时间（月/日）+ 持续时长（月）+
 * 影响幅度%；事件名称选填（可为 ''）。月中起始按日均摊口径生效
 * （见 workbenchModel.marketMonthEventFactor），衰减固定递减。
 */
export interface MarketMonthEventSeed {
  id: string;
  /** 事件名称（选填；空 = UI 显示「未命名事件」）。 */
  label: string;
  /** 起始月（YYYY-MM，如 '2027-01'）。 */
  startMonth: string;
  /** 起始日（1–31；超出当月天数按当月末日处理）。 */
  startDay: number;
  /** 持续时长（月，≥1）。 */
  durationMonths: number;
  /** 影响幅度（%，正 = 抬升大盘，负 = 压低）。 */
  magnitudePct: number;
}

/**
 * 主图小事件（产品级三类，v3 · B.4.2 WeekRange 口径）：一个事件一个范围，
 * 不自动拆条；名称选填（空串合法）；录入时弹参考品事实回放。
 */
export interface ProductEventSeed extends WeekRange {
  id: string;
  /** 事件类型（决定回放场景与锚点色）。 */
  type: 'competitor-launch' | 'own-promo' | 'cannibalization';
  /** 事件名称（选填；空串合法）。 */
  label: string;
  /** 影响幅度（%，参考回放段预填，可改）。 */
  magnitudePct: number;
  /** 形状：递减（线性从峰值衰减）/ 恒定。 */
  decay: 'decreasing' | 'flat';
  /** 回放场景 id（fixture.replayScenarios）。 */
  replayId: string;
}

/** 参考卡事实锚（参照对象历史窗内的可观测事实：大促 / 发布 / 调价）。 */
export interface ReferenceFactSeed {
  label: string;
  /** 历史窗内周序号（0 = 首个历史周）。 */
  weekIndex: number;
  type: 'promo' | 'launch' | 'price';
}

/** 量价参照小图序列（演示参照对象，可下拉切换；points 与统一日历周序对齐）。 */
export interface ReferenceSeriesSeed {
  id: string;
  label: string;
  /** 与主品同窗对齐的周销（台；长度 = calendar.weeks.length）。 */
  points: number[];
}

/** 生命周期事件锚（四类：竞品上市 / 品上市 / 促销 / 挤兑；智能弹框组稿用）。 */
export interface LifecycleEventSeed {
  /** 稳定 id（产品内唯一）：本地覆写层（referenceWorkspace overrides）以此为锚，
   *  不使用可编辑的周、类型或标题作 key。 */
  id: string;
  /** 生命周期周序（0 = 上市首周）。 */
  week: number;
  type: 'competitor-launch' | 'own-launch' | 'promo' | 'cannibalization';
  label: string;
  /** 参考影响读数（演示预标，%）：对同类主品的对应情境影响。 */
  impactPct?: number;
  /** 影响持续周数。 */
  impactWeeks?: number;
}

/** 生命周期大促档期带（琥珀背景带 + 档期价）。 */
export interface LifecyclePromoBandSeed {
  label: string;
  startWeek: number;
  endWeek: number;
  /** 档期内价格直降（USD）。 */
  priceDrop?: number;
}

/** 全生命周期参考产品（量柱 + 价格线 + 档期带 + 事件锚的数据源）。 */
export interface LifecycleProductSeed {
  id: string;
  label: string;
  brand: string;
  /** 上市周标签（如 2025-W02），仅作上下文展示。 */
  launchWeekLabel: string;
  /** 全生命周期周销（台，周序 0 起；null = 缺采周，显示「—」不造 0）。 */
  points: Array<number | null>;
  /** 全生命周期价格（USD，与 points 同周序对齐；null = 缺采周，不造 0）。 */
  pricePoints: Array<number | null>;
  /** 大促档期带（生命周期周序）。 */
  promoBands: LifecyclePromoBandSeed[];
  /** 事件锚（四类各 ≥1 覆盖于池内）。 */
  events: LifecycleEventSeed[];
  /** 进主链的 prevGenPool 映射 id（选择写入 prevGenReferenceId）；缺省 = 纯对照。 */
  chainRefId?: string;
}

/** v3 统一周序列项：周 id 为唯一主键，weekNumber 仅作跨年不唯一的周号读数。 */
export interface WorkbenchWeekV3 {
  /** 跨年周 ID（YYYYWww；来自 workbenchCalendar，2026W53 与 2027W01 不串值）。 */
  id: string;
  /** ISO 周号读数（跨年不唯一，仅展示；不作键）。 */
  weekNumber: number;
  /** 周一完整日期（YYYY-MM-DD）。 */
  date: string;
  /** 周一日期展示（MM-DD）。 */
  dateLabel: string;
  status: 'actual' | 'forecast';
  /** 历史周销（台）；缺采周与预测周为 null（保留真实缺采状态，不转 0）。 */
  sales: number | null;
  /** 价格（USD）：历史实际 + 预测价格计划（promoWindows 内为档期价）。 */
  price: number;
  /** 本品周龄（0 = 首个历史周）；映射 references.lifecyclePool 同周龄点（B.4.4）。 */
  lifecycleIndex: number;
}

/** v3 月版本成本：monthKey 键控（YYYY-MM 跨年月键），不再用裸周号 fromWeek。 */
export interface WorkbenchCostVersionV3 {
  /** 版本所属月（YYYY-MM）。 */
  monthKey: string;
  /** 版本展示名（如「2026-11 版本」）。 */
  label: string;
  /** 版本生效成本（USD/台）。 */
  unitCost: number;
}

/** 已知促销窗口（B.4.4）：起止周闭区间；①学习促销特征 p 与档期价共用。 */
export interface PromoWindow extends WeekRange {
  id: string;
  label: string;
}

/**
 * v3 统一模拟 fixture 契约（workbench-demo-v3 · 任务 5 起为唯一 fixture 出口）。
 * 旧 v2 契约（weeks 裸周号 / basePath / promoBand / defaultMarketEvents /
 * anchors / fromWeek 成本版本）已删除，不得回迁。
 */
export interface WorkbenchFixture {
  meta: {
    status: 'simulated';
    modelVersion: string;
    source: string;
    generatedAt: string;
    currency: string;
    note: string;
  };
  context: {
    country: string;
    industry: string;
    channel: string;
    product: string;
    prevGenProduct: string;
    competitor: string;
    priceBand: string;
    todayLabel: string;
    /** 当前周（跨年周 ID，如 2026W45）。 */
    currentWeek: string;
    /** 历史范围（如 2025W45–2026W44）。 */
    historyRange: string;
    /** 预测范围（如 2026W45–2027W46）。 */
    forecastRange: string;
  };
  /** 统一日历输入：buildForecastCalendar(workbenchFixture.calendar) 可复建同一日历。 */
  calendar: ForecastCalendarInput;
  /** 统一周序列：顺序与 calendar.weeks 一致（52 实际 + 52 预测）。 */
  weeks: WorkbenchWeekV3[];
  /** 多个已知促销窗口（含历史窗口供①训练行、预测窗口供价格计划）。 */
  promoWindows: PromoWindow[];
  market: {
    quarters: MarketQuarterSeed[];
    /**
     * 历史月度主序列（模拟样本，2024-11–2026-10 共 24 个连续实际月）：季内三月
     * 均值恒等于季度值（构造守恒）。预测月不在 fixture 存储，由
     * workbenchModel.computeMarketMonths 按季度基线 × 去年同季月形确定性生成。
     */
    months: MarketMonthSeed[];
    /** 月度序列模拟外推口径注释（显式声明，非静默造数）。 */
    monthlyNote: string;
    /** AI 时间序列基线说明（周期性季节因素 × 全局性趋势因素，挂 AI 标）。 */
    aiRationale: string;
  };
  inventory: {
    /** 首个历史周期初渠道库存（台）。 */
    initialChannelInv: number;
    /** 历史 SI（台，按实际周序对齐；0 = 无补货周，图上不画 ▼）。 */
    historySi: number[];
    /** 人工 SI 月计划初始值（台，键 = 统一 12 个预测月键）。 */
    siPlanMonthly: Record<string, number>;
    /** 全流程 DOS 演示系数（含机关已产出未发货）。 */
    fullDosFactor: number;
  };
  /** 月版本成本（12 个预测月逐月覆盖；monthKey 键控）。 */
  costVersions: WorkbenchCostVersionV3[];
  /** 预测月（12 个月；weekIds / forecastWeekIds 与统一日历同源）。 */
  forecastMonths: Array<{ key: string; label: string; weekIds: string[]; forecastWeekIds: string[] }>;
  references: {
    prevGenPool: ReferenceSeriesSeed[];
    competitorPool: ReferenceSeriesSeed[];
    /** 参照对象历史窗内的事实锚（事实还原：大促 / 发布 / 调价，与主图事件同源色系）。 */
    facts: ReferenceFactSeed[];
    /** 全生命周期参考池（≥4 产品 × 108 周量价 + 档期带 + 事件锚；参考卡自由选择）。 */
    lifecyclePool: LifecycleProductSeed[];
  };
  /** 主图小事件录入的事实回放场景（历史事实段，四类解释场景）。 */
  replayScenarios: Array<{
    id: string;
    /** 匹配的主图事件类型。 */
    match: ProductEventSeed['type'];
    title: string;
    /** 回放说明（参照对象 + 当时情境）。 */
    desc: string;
    /** 回放段周销（台，8 点历史段）。 */
    points: number[];
    refLabel: string;
    /** 当时影响（对同类主品的冲击读数）。 */
    impactPct: number;
    impactWeeks: number;
    impactText: string;
  }>;
}

/** Wave 2 纯函数与 v3 测试沿用的类型别名（任务 5 起 = WorkbenchFixture 同一契约）。 */
export type WorkbenchFixtureV3 = WorkbenchFixture;

/** v3 统一日历输入：唯一预测范围 2026-11—2027-10 · 12 个月（附录 A.2 拍板）。 */
const WORKBENCH_V3_CALENDAR_INPUT: ForecastCalendarInput = {
  historyStart: '2025-11-03',
  historyThrough: '2026W44',
  horizonStart: '2026-11',
  horizonEnd: '2027-10',
};

/**
 * 唯一 fixture 出口（任务 5 起）：固定 fixture + 固定种子 + 固定日历推导
 * （确定性，不读系统当前时间，不在渲染中随机）。
 */
export const workbenchFixture: WorkbenchFixture = createWorkbenchSimulation(
  buildForecastCalendar(WORKBENCH_V3_CALENDAR_INPUT),
);

/** Wave 2 纯函数与既有 v3 测试沿用的别名（任务 5 起 = workbenchFixture 同一导出）。 */
export const workbenchFixtureV3: WorkbenchFixture = workbenchFixture;
