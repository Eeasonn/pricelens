// ============================================================
// 推演工作台 v3 · 结果主图（forecast-global-ia-review B.5.4 · 任务 7）：
// 全期周图（完整历史 + 统一 12 个月预测窗）+ 月分组横轴刻度（YYYY-MM；
// 周详情 YYYYWww 保留在柱 title / 证据浮框 / 数据表）+ 视图窗
// （全期默认；「三月 / 近 8 周」只改视图不裁剪模型）。
// 预测周命中区：hover/focus 出证据预览（role=status）、click/Enter 固定
// （EvidenceFrame role=dialog，B.5.3 四层：阶段头「① 自动学习基线 /
// ② 大盘修正后 / ③ 库存修正后 / 手调后显示值」→ 条件 notices → 学习证据
// [样本窗/有效周数/特征/系数/留出 MAE/MAPE——全部来自 result.learning] →
// 构成按 ①学习→①范围事件→②大盘→③库存→手调 排序、每项可定位对应卡 →
// 动作「微调本周」）；Esc 关闭固定（编辑态粘滞由页面周销弹窗承接）。
// 产品范围事件 / 促销档期事件锚（2026-11-05 Eason 全局 #2）：起始周小方块点
// （7px 事件色 + A 编号小标）——「起止端点 + 范围线」与「轴下档期文字标注」
// 下线；hover / focus 显示起止区间底衬（0.14）+ 精简证据浮框（EvidenceFrame
// role=status），click / Enter 固定（role=dialog）；重叠 ≤2 lane，其余 +N 打开
// 图下名录筛选；名录行提供编辑 / 删除（键盘可达）。
// 价格手调墨色「价」小标与周销墨色菱形并存；库存截断琥珀描边读 supplyCapped。
// 价格系列显示过渡态 effectivePrice（marginView prop 可选；缺省 = fixture 原价
// ——MarginView 正式接线在任务 9 / T10）。数据表替换为 MainForecastDataTable
// （B.5.4 列，只读 WorkbenchResult + MarginView，吸收 WeeklyLedger 职责）。
// 大减法下线（2026-11-04 评审）保持：无历史销量黑线、无把握帽/区间带、
// 无调价档期锚点竖线、无档期琥珀色带、无预测区灰底衬；计算函数保留待清理。
// 2026-11-05 视觉精简二轮（Eason 看图反馈）：
// - 上一代同周龄灰虚参考线与图例项「参考：上一代同周龄」删除（上一代对照
//   仍由①参考卡承担；prevGenSales 数据读取与①学习器不动）。
// - 图下新增主图时间轨（volume/PanelTimeTrack 同款样式：trackColors 轨道 +
//   选中窗 + 两端拖柄 + 键盘微调；轨道域 = 全期，选中窗 = 可见窗），与
//   「全期 / 三月 / 近 8 周」视图预设联动：预设点击同步轨道窗，拖动 = 改窗
//   （window = 'custom' + windowRange，只改可见范围不裁剪模型）。
// - 线宽统一到价格走势页基准：主类线 width 2（实/虚同宽，虚线 dasharray 区分）。
// - 图下名录 + 数据表 + 页面传入的 extras（IoBar / 摘要）收进共享
//   CollapsibleSection「数据与操作」（默认收起；默认视图 = 卡头 + 图表本身）。
// 2026-11-05 Eason 全局反馈落实（主图）：#1 图例全部可点（「库存上限修正」
//   描边与「事件」整层收进可点图例，「说明项」行下线）；#8 SVG 文本对齐量价
//   页基准（font.family + tabular-nums + 字号 10 + mute；月分组刻度弃用 mono）。
//   #3 卡头「模拟」chip → HintInfo 在页面卡头（ForecastPage），主线统一处理。
// 2026-11-06 P0（价格走势设计语言对齐，来源回执 forecast-gap-20261106）：
// - P0-1 viewBox 宽 = ResizeObserver 实测容器宽（CHART_W_FALLBACK 1180 仅作
//   无 RO / jsdom 回退），刻度字号回归真实 px 不随缩放变小（同 MarketBusPanel）。
// - P0-2 周销柱（实际浅实柱 / 预测虚柱描边）改本品品牌色 brandColor.HUAWEI
//   （蓝 = 选中/链接语义，不再作数据色）；cannibalization 事件色退出 ink
//   （墨色只留给唯一主按钮），改登记的扩展色 #be123c（与 referenceEventPalette
//   同步）；浮框动作「微调本周」改 hairlineStrong 描边静默主按钮（不占墨色）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { brandColor, color, font, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { ProductEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult, WorkbenchWeekResult } from './workbenchModel';
import { CollapsibleSection, WorkbenchLegend, fmtSignedPct, fmtWan, wanOf, type LegendItem } from './WorkbenchBits';
import { buildAxisTicks, firstForecastIndex } from './workbenchChartSegments';
import { axisTickPlan } from '../../chart/PriceTrend/helpers';
import { buildForecastCalendar, durationOfWeekRange } from './workbenchCalendar';
import PanelTimeTrack from '../volume/PanelTimeTrack';
import EvidenceFrame from './EvidenceFrame';
import MainForecastDataTable, { type MainForecastMarginView } from './MainForecastDataTable';

/** P0-1（2026-11-06）：绘图宽 = ResizeObserver 实测容器宽；本常量仅作无 RO /
 *  jsdom 环境的回退估值（不再作为固定绘制宽）。图表地板宽由包裹层 minWidth 保证。 */
const CHART_W_FALLBACK = 1180;
/** heightScale = 1 时的画布高度（H = TOP + BASE_PLOT_H + BOTTOM）；heightScale 只缩放绘图区。
 *  2026-11-04 视觉一致性：与价格走势页图高（≈252px）对齐。 */
const BASE_PLOT_H = 172;
const LEFT = 64;
const RIGHT = 64;
const TOP = 34;
const BOTTOM = 46;

/** 主图受控视图（WP6 共享工具行写入；默认 = 当前视觉）。 */
export interface MainForecastView {
  /** 绘图区高度缩放（只缩放绘图区，不含轴与边距）；1 = 默认。 */
  heightScale: number;
  /** 是否显示纵向刻度与网格（左轴 + 右轴）。 */
  showYTicks: boolean;
  /** 周标签密度：compact = 月刻度抽稀步长 ×1.5；detail = 每月。 */
  labelMode: 'compact' | 'detail';
  /** 促销呈现开关：档期琥珀色带已下线（2026-11-04 评审），现仅控制促销档期起始周小方块点显隐；字段名保留兼容共享工具行。 */
  promoBandOn: boolean;
  /** 视图窗（B.5.4）：full = 全期（默认）；m3 = 预测末三月；w8 = 近 8 周；custom = 时间轨手调窗（windowRange）。只改可见范围，不裁剪模型。 */
  window?: 'full' | 'm3' | 'w8' | 'custom';
  /** custom 窗的全期周序区间 [start, end]（闭区间；时间轨拖柄写入，越界钳制）。 */
  windowRange?: [number, number];
}

export const DEFAULT_MAIN_FORECAST_VIEW: MainForecastView = {
  heightScale: 1,
  showYTicks: true,
  labelMode: 'compact',
  promoBandOn: true,
  window: 'full',
};

/** 主图小事件锚点色（与参考卡事实锚同源色系）。2026-11-06 P0-2：cannibalization
 *  退出 color.ink（墨色只留给唯一主按钮），改扩展图表色板已登记的压力/风险色
 *  #be123c（与 tokens.referenceEventPalette 挤兑默认同步换色，保持同源）。 */
export const PRODUCT_EVENT_COLOR: Record<ProductEventSeed['type'], string> = {
  'competitor-launch': color.link,
  'own-promo': color.warning,
  cannibalization: '#be123c',
};
export const PRODUCT_EVENT_LABEL: Record<ProductEventSeed['type'], string> = {
  'competitor-launch': '竞品上市',
  'own-promo': '营销价促',
  cannibalization: '自家品挤兑',
};

/** 范围事件形状读数（B.5.4 名录派生周数 + 形状）。 */
const DECAY_TEXT: Record<ProductEventSeed['decay'], string> = {
  flat: '恒定',
  decreasing: '递减',
};

/** 跨卡定位目标（B.5.2 CrossCardFocus 子集：主图证据构成项 → 对应卡）。 */
export type MainChartFocusCard = 'reference' | 'market' | 'inventory';

/** 促销档期方块点的固定事件 id（与范围事件 id 共用 hover/pin 状态机）。 */
const PROMO_MARK_ID = 'promo-window';

/** 主图图例（2026-11-05 Eason 全局 #1）：全部可点（WorkbenchLegend 规格：
 *  aria-pressed + 隐藏态 opacity .45），图外底部居中一行，「数据系列 / 说明项」
 *  分组行下线。「参考 · 上一代同周龄」参考线项保持删除（对照由①参考卡承担）；
 *  「库存上限修正」= 预测柱琥珀描边样式显隐；「事件」= 范围事件 / 促销档期
 *  方块点 + 事件区间底衬整层显隐。
 *  2026-11-06 P0-2：周销实际/预测柱色 = 本品品牌色 brandColor.HUAWEI（蓝 =
 *  选中/链接语义，不再作数据色）；「事件」为多色层（蓝/琥珀/#be123c），图例
 *  色块用 mute 中性指示（不声称单一系列色）。 */
const LEGEND_ITEMS: LegendItem[] = [
  { key: 'actual', label: '周销 实际', shape: 'rect', color: brandColor.HUAWEI },
  { key: 'forecast', label: '周销 预测', shape: 'rectDash', color: brandColor.HUAWEI },
  { key: 'price', label: '价格（右轴）', shape: 'line', color: brandColor.HUAWEI },
  { key: 'capped', label: '库存上限修正（琥珀描边）', shape: 'rectAmber', color: color.warning },
  { key: 'events', label: '事件', shape: 'rect', color: color.mute },
];

/** 构成项阶段排序（B.5.4：①学习 → ①范围事件 → ②大盘 → ③库存 → 手调）。 */
const CONSIDER_ORDER: Record<string, number> = {
  reference: 0,
  promo: 0,
  productEvent: 1,
  market: 2,
  event: 2,
  inventory: 3,
  manual: 4,
};
/** 构成项可定位的对应卡（B.5.2：每项可跳对应卡；主图内锚点项不跳）。 */
const CONSIDER_CARD: Record<string, MainChartFocusCard | null> = {
  reference: 'reference',
  promo: null,
  productEvent: null,
  market: 'market',
  event: 'market',
  inventory: 'inventory',
  manual: null,
};

const fmtUnits = (value: number | null): string => (value != null ? value.toLocaleString('en-US') : '—');

export default function MainForecastChart({
  fixture,
  params,
  result,
  onTuneWeek,
  onRemoveProductEvent,
  onEditProductEvent,
  onFocusCard,
  marginView,
  view,
  controls,
  extras,
  onViewChange,
}: {
  fixture: WorkbenchFixture;
  params: { productEvents: ProductEventSeed[] };
  result: WorkbenchResult;
  onTuneWeek: (weekId: string) => void;
  onRemoveProductEvent: (id: string) => void;
  /** 范围事件编辑入口（图下名录「编辑」；页面侧打开同一范围编辑器）。 */
  onEditProductEvent?: (event: ProductEventSeed) => void;
  /** 跨卡定位（构成项「定位来源」）：reference = ①参考卡 / market = ②大盘 / inventory = ③库存。 */
  onFocusCard?: (card: MainChartFocusCard, weekId: string) => void;
  /** MarginView 过渡接线（显示价 effectivePrice；缺省 = fixture 原价；正式接线在任务 9 / T10）。 */
  marginView?: MainForecastMarginView | null;
  /** 受控视图（WP6 共享工具行）；缺省 = DEFAULT_MAIN_FORECAST_VIEW。 */
  view?: Partial<MainForecastView>;
  /** 渲染在主图上方的插槽（共享工具行），不含卡头操作。 */
  controls?: ReactNode;
  /** 2026-11-05 视觉精简：页面侧次级信息插槽（IoBar / 摘要四格），渲染在
   *  「数据与操作」收起区内（名录 / 数据表之前）；默认随区收起。 */
  extras?: ReactNode;
  /** 视图写入回调（时间轨 / 窗口预设用）：页面侧 patchMainView。 */
  onViewChange?: (patch: Partial<MainForecastView>) => void;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  /** 事件锚（范围事件 / 促销档期方块点）hover / 固定态（2026-11-05 全局 #2）。 */
  const [hoverEventId, setHoverEventId] = useState<string | null>(null);
  const [pinnedEventId, setPinnedEventId] = useState<string | null>(null);
  const [overflowIds, setOverflowIds] = useState<string[] | null>(null);
  /** P0-1（2026-11-06）：图表区实测渲染宽——viewBox 宽 = 真实渲染宽（缩放比 1，
   *  刻度字号回归真实 px）；无 RO / jsdom 环境回退 CHART_W_FALLBACK。 */
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const [chartW, setChartW] = useState(CHART_W_FALLBACK);
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.round(entry.contentRect.width);
        // 函数式更新：避免闭包旧值吞掉「resize 回回退估值宽度」的合法更新。
        setChartW((prev) => (width >= 320 && width !== prev ? width : prev));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const show = (key: string): boolean => !hidden.has(key);
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const viewState = { ...DEFAULT_MAIN_FORECAST_VIEW, ...view };
  const heightScale = Number.isFinite(viewState.heightScale) && viewState.heightScale > 0 ? viewState.heightScale : 1;
  const plotH = BASE_PLOT_H * heightScale;
  const H = TOP + plotH + BOTTOM;
  const showYTicks = viewState.showYTicks;
  const labelMode = viewState.labelMode;

  const allWeeks = result.weeks;
  // 视图窗（B.5.4）：full = 全期；m3 = 预测末三月；w8 = 近 8 周；custom = 时间轨手调窗。
  // 只裁可见范围，数据表 / 名录仍列全期。
  const chartWeeks = useMemo(() => {
    if (viewState.window === 'w8') return allWeeks.slice(Math.max(0, allWeeks.length - 8));
    if (viewState.window === 'm3') {
      const forecastKeys: string[] = [];
      for (const week of allWeeks) {
        if (week.status === 'forecast' && forecastKeys[forecastKeys.length - 1] !== week.monthKey) forecastKeys.push(week.monthKey);
      }
      const keys = new Set(forecastKeys.slice(-3));
      const start = allWeeks.findIndex((week) => keys.has(week.monthKey));
      return start >= 0 ? allWeeks.slice(start) : allWeeks;
    }
    if (viewState.window === 'custom' && viewState.windowRange) {
      // 时间轨手调窗：全期周序闭区间，越界钳制；非法回退全期。
      const max = allWeeks.length - 1;
      const s = Math.min(Math.max(0, Math.round(viewState.windowRange[0])), max);
      const e = Math.min(Math.max(s, Math.round(viewState.windowRange[1])), max);
      return allWeeks.slice(s, e + 1);
    }
    return allWeeks;
  }, [allWeeks, viewState.window, viewState.windowRange]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // Esc 分级：先回事件证据（关固定回预览），再回周证据（预览随 hover 消失）。
      if (pinnedEventId != null) {
        setPinnedEventId(null);
        return;
      }
      setPinnedIndex((prev) => (prev != null ? null : prev));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [pinnedEventId]);

  const weeks = chartWeeks;
  // 时间边界派生（WP5 Step 3）：预测起点 / 历史终点 / 今天分界共用同一来源，禁写死下标。
  const forecastStart = firstForecastIndex(weeks);
  const hasForecast = forecastStart >= 0;
  const hasHistory = forecastStart > 0;
  const historyEnd = hasForecast ? forecastStart - 1 : weeks.length - 1;
  /** P0-1：绘图宽随实测渲染宽（chartW）派生，不再用固定 1180。 */
  const plotW = chartW - LEFT - RIGHT;
  const slot = plotW / weeks.length;
  const x = (index: number): number => LEFT + (index + 0.5) * slot;
  const boundaryX = hasHistory && hasForecast ? (x(historyEnd) + x(forecastStart)) / 2 : null;

  // 促销档期 = 起始周小方块点（轴下文字标注与琥珀色带均已下线，2026-11-05 全局 #2）。
  const forecastPromoWindow = fixture.promoWindows.find((window) =>
    weeks.some((week) => week.weekId === window.startWeekId && week.status === 'forecast')) ?? null;
  const promoStartIndex = forecastPromoWindow
    ? weeks.findIndex((week) => week.weekId === forecastPromoWindow.startWeekId)
    : -1;
  // 档期区间在可见窗内的终点（止周被视图裁掉时 = 可见末周；底衬只画可见范围）。
  const promoEndIndex = forecastPromoWindow
    ? weeks.findIndex((week) => week.weekId === forecastPromoWindow.endWeekId)
    : -1;
  const promoMarkOn = viewState.promoBandOn && promoStartIndex >= 0;

  // 纵轴：销量覆盖全部有值点（缺数不参与，不当 0）；价格轴由数据派生（显示价 = MarginView effectivePrice ?? 原价）。
  const displayPriceOf = (week: WorkbenchWeekResult): number =>
    marginView?.weeks?.[week.weekId]?.effectivePrice != null
      ? (marginView.weeks![week.weekId]!.effectivePrice as number)
      : week.price;
  const volumeValues = weeks.flatMap((week) => [week.sales, week.final]).filter((value): value is number => value != null);
  const volumePeak = Math.max(0, ...volumeValues, ...weeks.map((week) => week.prevGenSales ?? 0));
  const yMax = Math.max(1, niceCeil(volumePeak * 1.12));
  const y = (value: number): number => TOP + plotH * (1 - value / yMax);
  const prices = weeks.map(displayPriceOf);
  const priceLo = Math.min(...prices);
  const priceHi = Math.max(...prices);
  const pricePad = (priceHi - priceLo) * 0.12 || Math.max(1, priceHi * 0.12);
  const priceMin = priceLo - pricePad;
  const priceMax = priceHi + pricePad;
  const yPrice = (value: number): number => TOP + plotH * (1 - (value - priceMin) / (priceMax - priceMin));
  const volumeTicks = buildAxisTicks(0, yMax, 4);
  if (volumeTicks.length && volumeTicks[volumeTicks.length - 1] < yMax) volumeTicks.push(yMax);
  const priceTicks = buildAxisTicks(priceMin, priceMax, 3);
  const barW = Math.min(34, slot * 0.55);

  // 横轴：月分组刻度（B.5.4「以月份分组」）——取刻度同源 axisTickPlan（首末恒显示 +
  // 抽稀让位），文案 = 全站月日历格式 YYYY-MM；周详情 YYYYWww 保留在柱 title /
  // 证据浮框 / 数据表（不裸排在轴上）。labelMode 只切换抽稀步长（compact 更稀）。
  const monthKeys: string[] = [];
  for (const week of weeks) {
    if (monthKeys[monthKeys.length - 1] !== week.monthKey) monthKeys.push(week.monthKey);
  }
  const monthStep = labelMode === 'detail' ? 1 : Math.max(1, Math.ceil(monthKeys.length / 9));
  const monthPlan = monthKeys.length > 0
    ? axisTickPlan('month', monthKeys, monthStep, monthKeys.length > 1 ? [0, monthKeys.length - 1] : [0])
    : { indexes: [] as number[] };
  /** 月分组首周的绘图序（刻度画在该月第一个周的中线位置）。 */
  const monthFirstWeekIndex = new Map<string, number>();
  weeks.forEach((week, index) => {
    if (!monthFirstWeekIndex.has(week.monthKey)) monthFirstWeekIndex.set(week.monthKey, index);
  });

  // 折线段（WP5 Step 1）：连续段实线、跨缺段灰虚，缺数不造点。
  // 2026-11-05：上一代同周龄灰虚参考线渲染删除（对照由①参考卡承担；
  // prevGenSales 数据读取不动——纵轴域仍覆盖上一代值，学习器不受影响）。
  const pricePathD = (from: number, to: number, anchorM: string | null = null): string | null => {
    if (from > to || from < 0 || to >= weeks.length) return null;
    const points = weeks.slice(from, to + 1)
      .map((_, offset) => `${offset === 0 && !anchorM ? 'M' : 'L'}${x(from + offset).toFixed(1)} ${yPrice(prices[from + offset]).toFixed(1)}`);
    if (anchorM) points.unshift(anchorM);
    return points.join(' ');
  };
  const historyPriceD = hasHistory ? pricePathD(0, historyEnd) : null;
  const priceSeamM = hasForecast
    ? `M${x(historyEnd).toFixed(1)} ${yPrice(prices[historyEnd]).toFixed(1)}`
    : null;
  const forecastPriceD = hasForecast ? pricePathD(forecastStart, weeks.length - 1, priceSeamM) : null;

  // 库存修正双状态（WP5 Step 8）：capped = 当前显示态（柱琥珀描边）；supplyCapped = 截断事实。
  const cappedFactWeeks = allWeeks.filter((week) => week.supplyCapped);
  const manualWeeks = allWeeks.filter((week) => week.manual != null);

  // 范围事件方块点（2026-11-05 全局 #2：起止端点 + 范围线下线，只留起始周点 +
  // hover 区间底衬）；lane 仍按起止区间分配，避免相邻事件方块点 / A 标重叠；
  // 重叠 ≤2 lane，其余 +N 名录筛选。
  const calendar = useMemo(() => buildForecastCalendar(fixture.calendar), [fixture.calendar]);
  const chartIndexOfWeekId = useMemo(() => new Map(weeks.map((week, index) => [week.weekId, index])), [weeks]);
  const rangeAnchors = useMemo(() => {
    const placed: Array<{ event: ProductEventSeed; order: number; lane: number; startIdx: number; endIdx: number }> = [];
    const overflow: ProductEventSeed[] = [];
    const laneEnds: Array<Array<{ startIdx: number; endIdx: number }>> = [[], []];
    params.productEvents.forEach((event, order) => {
      const startIdx = chartIndexOfWeekId.get(event.startWeekId) ?? -1;
      const endIdx = chartIndexOfWeekId.get(event.endWeekId) ?? -1;
      if (startIdx < 0 || endIdx < 0) return;
      const lo = Math.min(startIdx, endIdx);
      const hi = Math.max(startIdx, endIdx);
      const lane = laneEnds.findIndex((ranges) => ranges.every((range) => hi < range.startIdx || lo > range.endIdx));
      if (lane >= 0) {
        laneEnds[lane].push({ startIdx: lo, endIdx: hi });
        placed.push({ event, order, lane, startIdx: lo, endIdx: hi });
      } else {
        overflow.push(event);
      }
    });
    return { placed, overflow };
  }, [params.productEvents, chartIndexOfWeekId]);
  const laneYOf = (lane: number): number => TOP + 8 + lane * 16;

  if (!weeks.length) {
    return (
      <div style={{ display: 'grid', gap: space.sm }}>
        {controls}
        <MainForecastDataTable result={result} productEvents={params.productEvents} marginView={marginView} onTuneWeek={onTuneWeek} />
        <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: space.lg, fontSize: 12, color: color.mute, textAlign: 'center' }}>
          当前范围无可推演数据
        </div>
      </div>
    );
  }

  const ariaLabel = `${fixture.context.product} 量价预测主图：历史 ${fixture.context.historyRange} 演示实际实柱、预测 ${fixture.context.forecastRange} 虚柱；预测期总销量 ${fmtWan(result.summary.totalSales)}；大促峰 ${result.summary.peak.weekId} ${fmtWan(result.summary.peak.value)}；促销档期 ${forecastPromoWindow ? `${forecastPromoWindow.startWeekId} 起（起始周小方块点，悬停显示档期区间）` : '无'}；范围事件 ${params.productEvents.length} 个（起始周小方块点，悬停显示起止区间）；${cappedFactWeeks.length ? `库存上限修正 ${cappedFactWeeks[0]!.weekId} 起` : '未触发库存上限修正'}；横轴按月分组，周详情见证据浮框与数据表。`;

  const activeIndex = pinnedIndex ?? hoverIndex;
  const activeWeek = activeIndex != null ? weeks[activeIndex] ?? null : null;

  // 时间轨（2026-11-05 视觉精简二轮）：轨道域 = 全期，选中窗 = 当前可见窗。
  // chartWeeks 恒为 allWeeks 的连续切片，可见窗周序 = 首周下标 → 首周下标 + 窗长 − 1。
  const visibleStart = weeks.length
    ? Math.max(0, allWeeks.findIndex((week) => week.weekId === weeks[0]!.weekId))
    : 0;
  const visibleEnd = weeks.length
    ? Math.min(allWeeks.length - 1, visibleStart + weeks.length - 1)
    : Math.max(0, allWeeks.length - 1);
  const windowPreset: 'full' | 'm3' | 'w8' | 'custom' = viewState.window ?? 'full';
  const windowPresetDefs: Array<{ key: 'full' | 'm3' | 'w8'; label: string }> = [
    { key: 'full', label: '全期' },
    { key: 'm3', label: '三月' },
    { key: 'w8', label: '近 8 周' },
  ];

  // 事件锚焦点（2026-11-05 Eason 全局 #2）：固定 > hover；事件浮框优先于周证据浮框。
  const eventFocusId = pinnedEventId ?? hoverEventId;
  const focusAnchor = eventFocusId != null
    ? rangeAnchors.placed.find((anchor) => anchor.event.id === eventFocusId) ?? null
    : null;
  const promoFocusActive = eventFocusId === PROMO_MARK_ID && promoMarkOn;
  /** 方块点点击 / Enter：固定（或取消固定）事件证据；周固定证据让位。 */
  const toggleEventPin = (id: string): void => {
    setPinnedIndex(null);
    setPinnedEventId((prev) => (prev === id ? null : id));
  };

  return (
    <div style={{ display: 'grid', gap: space.sm }}>
      {controls}
      <div style={{ overflowX: 'auto' }}>
        <div ref={chartWrapRef} style={{ position: 'relative', minWidth: 960 }}>
          <svg
            viewBox={`0 0 ${chartW} ${H}`}
            width="100%"
            role="img"
            aria-label={ariaLabel}
            style={{ display: 'block', height: 'auto' }}
          >
            {/* 今天分界：只留虚线 + 轴上「今天」日期（全局 #8：font.family + tabular-nums + mute） */}
            {boundaryX != null && (
              <>
                <line x1={boundaryX} x2={boundaryX} y1={TOP - 6} y2={TOP + plotH} stroke={color.hairlineStrong} strokeDasharray="4 4" />
                <text x={boundaryX - 6} y={H - 8} textAnchor="end" fontSize={10} fontWeight={600} fill={color.mute} fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>{`今天 ${fixture.context.todayLabel}`}</text>
              </>
            )}

            {/* 网格 + 左轴（万台）+ 右轴（$，数据派生刻度）；showYTicks=false 时整体隐藏 */}
            {showYTicks && (
              <>
                <g stroke={color.hairline}>
                  {volumeTicks.map((tick) => (
                    <line key={`grid-${tick}`} x1={LEFT} y1={y(tick)} x2={chartW - RIGHT} y2={y(tick)} />
                  ))}
                </g>
                <g fontSize={10} fill={color.mute} textAnchor="end" fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {volumeTicks.map((tick) => (
                    <text key={`vt-${tick}`} x={LEFT - 8} y={y(tick) + 3}>{wanOf(tick)}</text>
                  ))}
                </g>
                <text x={LEFT - 8} y={TOP - 10} fontSize={10} fill={color.mute} textAnchor="end" fontFamily={font.family}>万台</text>
                <g fontSize={10} fill={color.mute} textAnchor="start" fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {priceTicks.map((tick) => (
                    <text key={`pt-${tick}`} x={chartW - RIGHT + 8} y={yPrice(tick) + 3}>{`$${tick}`}</text>
                  ))}
                </g>
              </>
            )}

            {/* 上一代同周龄参考线已删（2026-11-05 视觉精简二轮）：上一代对照由①参考卡承担 */}

            {/* 周销柱（P0-2 2026-11-06：本品品牌色，不再用 link 蓝——蓝 = 选中/链接
                语义）：历史实柱（HUAWEI 浅实柱）/ 预测虚柱（HUAWEI 描边；库存修正周
                琥珀描边微痕）；缺数周不造柱 */}
            {weeks.map((week, index) => {
              const value = week.final;
              if (value == null) return null;
              const forecast = week.status === 'forecast';
              if (forecast ? !show('forecast') : !show('actual')) return null;
              const adjusted = week.capped && show('capped');
              const reason = week.manual?.reason ?? '';
              return (
                <rect
                  key={`bar-${week.weekId}`}
                  x={x(index) - barW / 2}
                  y={y(value)}
                  width={barW}
                  height={Math.max(0, TOP + plotH - y(value))}
                  rx={2}
                  fill={forecast ? color.canvas : brandColor.HUAWEI}
                  fillOpacity={forecast ? 1 : 0.16}
                  stroke={forecast ? (adjusted ? color.warning : brandColor.HUAWEI) : 'none'}
                  strokeWidth={forecast ? 1.4 : 0}
                  strokeDasharray={forecast ? '4 3' : undefined}
                >
                  <title>{`${week.weekId}（${week.dateLabel}）${forecast ? '预测' : '实际'} 周销 ${fmtWan(value)}${adjusted ? ' · 按可售量修正' : ''}${week.manual ? ` · 手调${reason ? `：${reason}` : ''}` : ''} · 价格 $${displayPriceOf(week)}`}</title>
                </rect>
              );
            })}

            {/* 价格线右轴：实（历史）→ 虚（预测）；线宽 = 全站主类线基准 2（实/虚同宽，虚线 dasharray 区分）；
                显示价读 MarginView 过渡字段（缺省原价） */}
            {show('price') && historyPriceD && (
              <path d={historyPriceD} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2} />
            )}
            {show('price') && forecastPriceD && (
              <path d={forecastPriceD} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2} strokeDasharray="6 5" />
            )}

            {/* 价格手调墨色「价」小标（与周销墨色菱形并存）：MarginView 提供且异于
                原价 = 存在价格人工调整（任务 9 PriceAdjustDialog 写入）；锚在显示价折点上方 */}
            {weeks.map((week, index) => {
              const overridePrice = marginView?.weeks?.[week.weekId]?.effectivePrice;
              if (overridePrice == null || overridePrice === week.price || week.final == null) return null;
              const cx = x(index);
              const cy = yPrice(prices[index]) - 10;
              return (
                <g key={`manual-price-${week.weekId}`}>
                  <rect x={cx - 8} y={cy - 9} width={16} height={13} rx={2.5} fill={color.ink} stroke={color.canvas} strokeWidth={1.2}>
                    <title>{`价格手调 · 显示价 $${overridePrice}`}</title>
                  </rect>
                  <text x={cx} y={cy + 1} textAnchor="middle" fontSize={10} fontWeight={700} fill={color.onPrimary} fontFamily={font.family}>价</text>
                </g>
              );
            })}

            {/* 周销手调标记（墨色菱形，琥珀只留给库存修正）+ 原因内联小字 */}
            {weeks.map((week, index) => {
              if (week.manual == null || week.final == null) return null;
              const cx = x(index);
              const cy = y(week.final) - 14;
              const reason = week.manual.reason;
              const short = reason.length > 12 ? `${reason.slice(0, 12)}…` : reason;
              return (
                <g key={`manual-${week.weekId}`}>
                  <path d={`M${cx} ${cy - 5} l5 5 l-5 5 l-5 -5 Z`} fill={color.ink} stroke={color.canvas} strokeWidth={1.2}>
                    <title>{`手调${reason ? `：${reason}` : ''}`}</title>
                  </path>
                  {reason && (
                    <text x={cx} y={cy - 10} textAnchor="middle" fontSize={10} fill={color.mute} fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {short}
                      <title>{reason}</title>
                    </text>
                  )}
                </g>
              );
            })}

            {/* 产品范围事件 / 促销档期方块点统一收进「事件层」（命中区之后渲染，
                保证 hover / focus 可达；见下方 data-event-layer） */}

            {/* 横轴月分组刻度：全站月日历格式 YYYY-MM；取刻度同源 axisTickPlan。
                2026-11-05 全局 #8：font.family + tabular-nums（DESIGN.md：Geist Mono
                只用于周 ID / 版本等技术标记，YYYY-MM 日历刻度随量价页用正文字体）。 */}
            <g fontSize={10} fill={color.mute} textAnchor="middle" fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {monthPlan.indexes.map((monthIndex) => {
                const weekIndex = monthFirstWeekIndex.get(monthKeys[monthIndex]!) ?? 0;
                return <text key={monthKeys[monthIndex]!} x={x(weekIndex)} y={H - 24}>{monthKeys[monthIndex]}</text>;
              })}
            </g>

            {/* 促销档期轴下日期标注已删（2026-11-05 全局 #2）：改为事件层内起始周小方块点 */}

            {/* 命中区：hover/focus 出证据预览；预测周可聚焦（button），click/Enter 固定证据；
                微调经证据动作「微调本周」（周销弹窗原因选填，页面承接） */}
            {weeks.map((week, index) => {
              const forecast = week.status === 'forecast';
              return (
                <rect
                  key={`hit-${week.weekId}`}
                  x={x(index) - slot / 2}
                  y={TOP}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  style={{ cursor: forecast ? 'pointer' : 'default' }}
                  tabIndex={forecast ? 0 : -1}
                  role={forecast ? 'button' : undefined}
                  aria-label={forecast ? `查看 ${week.weekId} 预测证据` : undefined}
                  onMouseEnter={() => setHoverIndex(index)}
                  onMouseLeave={() => setHoverIndex((prev) => (prev === index ? null : prev))}
                  onFocus={() => setHoverIndex(index)}
                  onBlur={() => setHoverIndex((prev) => (prev === index && pinnedIndex !== index ? null : prev))}
                  onClick={() => {
                    if (!forecast) return;
                    // 固定周证据让位事件固定态（同一时刻只有一个证据浮框）。
                    setPinnedEventId(null);
                    setPinnedIndex((prev) => (prev === index ? null : index));
                  }}
                  onKeyDown={(event) => {
                    if (!forecast) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setPinnedEventId(null);
                      setPinnedIndex((prev) => (prev === index ? null : index));
                    }
                  }}
                />
              );
            })}

            {/* 事件层（2026-11-05 Eason 全局 #2，渲染在命中区之上保证 hover/focus 可达）：
                范围事件 / 促销档期统一「起始周小方块点」（7px 事件色 + A 编号小标）；
                hover / focus 显示起止区间底衬（0.14）+ 精简证据浮框，click/Enter 固定；
                图例「事件」隐藏时整层（方块点 + 底衬 + +N）隐藏。 */}
            {show('events') && (
              <g data-event-layer="">
                {/* 事件区间底衬（hover / focus 临时；pointerEvents none 不挡周命中区） */}
                {focusAnchor != null && (
                  <rect
                    data-event-shade={focusAnchor.event.id}
                    x={x(focusAnchor.startIdx) - slot / 2}
                    y={TOP}
                    width={(focusAnchor.endIdx - focusAnchor.startIdx + 1) * slot}
                    height={plotH}
                    fill={PRODUCT_EVENT_COLOR[focusAnchor.event.type]}
                    fillOpacity={0.14}
                    pointerEvents="none"
                  />
                )}
                {promoFocusActive && forecastPromoWindow != null && (
                  <rect
                    data-event-shade={PROMO_MARK_ID}
                    x={x(promoStartIndex) - slot / 2}
                    y={TOP}
                    width={(Math.max(promoEndIndex, weeks.length - 1) - promoStartIndex + 1) * slot}
                    height={plotH}
                    fill={color.warning}
                    fillOpacity={0.14}
                    pointerEvents="none"
                  />
                )}
                {/* 范围事件方块点：起始周 7px 事件色方块 + A 编号小标（范围线 / 起止端点已删） */}
                {rangeAnchors.placed.map(({ event, order, lane, startIdx }) => {
                  const tone = PRODUCT_EVENT_COLOR[event.type];
                  const laneY = laneYOf(lane);
                  const dotCx = x(startIdx);
                  return (
                    <g
                      key={`event-dot-${event.id}`}
                      data-event-dot={event.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={eventFocusId === event.id}
                      aria-label={`事件 A${order + 1} · ${PRODUCT_EVENT_LABEL[event.type]}（${event.startWeekId}–${event.endWeekId}），悬停显示起止区间`}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoverEventId(event.id)}
                      onMouseLeave={() => setHoverEventId((prev) => (prev === event.id ? null : prev))}
                      onFocus={() => setHoverEventId(event.id)}
                      onBlur={() => setHoverEventId((prev) => (prev === event.id && pinnedEventId !== event.id ? null : prev))}
                      onClick={() => toggleEventPin(event.id)}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                          keyEvent.preventDefault();
                          toggleEventPin(event.id);
                        }
                      }}
                    >
                      <rect x={dotCx - 3.5} y={laneY - 3.5} width={7} height={7} fill={tone} stroke={color.canvas} strokeWidth={1}>
                        <title>{`${PRODUCT_EVENT_LABEL[event.type]} · ${event.label || '未命名事件'}（${event.startWeekId}–${event.endWeekId}，${fmtSignedPct(event.magnitudePct)} · ${DECAY_TEXT[event.decay]}）· 悬停看区间，点击固定`}</title>
                      </rect>
                      <text x={dotCx + 8} y={laneY + 3.5} textAnchor="start" fontSize={10} fontWeight={600} fill={tone} fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>{`A${order + 1}`}</text>
                    </g>
                  );
                })}
                {/* 重叠超出两条 lane：+N 打开名录筛选（键盘可达） */}
                {rangeAnchors.overflow.length > 0 && (
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`其余 ${rangeAnchors.overflow.length} 个重叠范围事件 · 名录筛选`}
                    onClick={() => setOverflowIds(rangeAnchors.overflow.map((event) => event.id))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setOverflowIds(rangeAnchors.overflow.map((event) => event.id));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect x={chartW - RIGHT - 74} y={TOP - 2} width={44} height={16} rx={8} fill={color.canvas} stroke={color.hairlineStrong} strokeWidth={1} />
                    <text x={chartW - RIGHT - 52} y={TOP + 10} textAnchor="middle" fontSize={10} fontWeight={600} fill={color.body} fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>{`+${rangeAnchors.overflow.length}`}</text>
                    <title>其余重叠范围事件：打开图下名录筛选</title>
                  </g>
                )}
                {/* 促销档期方块点：起点 7px 琥珀方块（轴下常驻文字标注已删），hover 出档期区间底衬与名称 */}
                {promoMarkOn && forecastPromoWindow != null && (
                  <g
                    key="promo-dot"
                    data-event-dot={PROMO_MARK_ID}
                    role="button"
                    tabIndex={0}
                    aria-pressed={eventFocusId === PROMO_MARK_ID}
                    aria-label={`促销档期 ${forecastPromoWindow.label || ''}（${forecastPromoWindow.startWeekId}–${forecastPromoWindow.endWeekId}），悬停显示档期区间`}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoverEventId(PROMO_MARK_ID)}
                    onMouseLeave={() => setHoverEventId((prev) => (prev === PROMO_MARK_ID ? null : prev))}
                    onFocus={() => setHoverEventId(PROMO_MARK_ID)}
                    onBlur={() => setHoverEventId((prev) => (prev === PROMO_MARK_ID && pinnedEventId !== PROMO_MARK_ID ? null : prev))}
                    onClick={() => toggleEventPin(PROMO_MARK_ID)}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                        keyEvent.preventDefault();
                        toggleEventPin(PROMO_MARK_ID);
                      }
                    }}
                  >
                    <rect x={x(promoStartIndex) - 3.5} y={TOP + plotH - 3.5} width={7} height={7} fill={color.warning} stroke={color.canvas} strokeWidth={1}>
                      <title>{`${forecastPromoWindow.label || '促销档期'}（${forecastPromoWindow.startWeekId}–${forecastPromoWindow.endWeekId}）· 悬停看档期区间`}</title>
                    </rect>
                  </g>
                )}
              </g>
            )}
          </svg>

          {/* 证据浮框（2026-11-05 全局 #2）：事件锚浮框（固定 > hover 预览）优先于
              周证据；周证据 hover/focus = 预览（role=status，不拦截指针）、
              click/Enter = 固定（role=dialog）。固定态粘滞（页面周销弹窗打开时
              保持），Esc 先回证据再关闭。 */}
          {focusAnchor != null && (
            <EventEvidence
              event={focusAnchor.event}
              order={focusAnchor.order}
              duration={durationOfWeekRange(calendar, focusAnchor.event)}
              flip={focusAnchor.startIdx > weeks.length / 2}
              pinned={pinnedEventId === focusAnchor.event.id}
              onClose={() => {
                if (pinnedEventId === focusAnchor.event.id) setPinnedEventId(null);
                else setHoverEventId(null);
              }}
            />
          )}
          {focusAnchor == null && promoFocusActive && forecastPromoWindow != null && (
            <PromoEvidence
              promo={forecastPromoWindow}
              duration={durationOfWeekRange(calendar, forecastPromoWindow)}
              flip={promoStartIndex > weeks.length / 2}
              pinned={pinnedEventId === PROMO_MARK_ID}
              onClose={() => {
                if (pinnedEventId === PROMO_MARK_ID) setPinnedEventId(null);
                else setHoverEventId(null);
              }}
            />
          )}
          {focusAnchor == null && !promoFocusActive && activeWeek != null && activeIndex != null && (
            pinnedIndex != null ? (
              <WeekEvidence
                week={activeWeek}
                learning={result.learning}
                productEventCount={params.productEvents.length}
                promoLabel={fixture.promoWindows.find((window) => window.id === coveringPromoId(calendar, fixture, activeWeek.weekId))?.label ?? null}
                displayPrice={displayPriceOf(activeWeek)}
                modelVersion={fixture.meta.modelVersion}
                leftPct={(x(activeIndex) / chartW) * 100}
                flip={activeIndex > weeks.length / 2}
                pinned
                onFocusCard={onFocusCard}
                onTuneWeek={onTuneWeek}
                onClose={() => setPinnedIndex(null)}
              />
            ) : (
              <WeekEvidence
                week={activeWeek}
                learning={result.learning}
                productEventCount={params.productEvents.length}
                promoLabel={fixture.promoWindows.find((window) => window.id === coveringPromoId(calendar, fixture, activeWeek.weekId))?.label ?? null}
                displayPrice={displayPriceOf(activeWeek)}
                modelVersion={fixture.meta.modelVersion}
                leftPct={(x(activeIndex) / chartW) * 100}
                flip={activeIndex > weeks.length / 2}
                onFocusCard={onFocusCard}
                onTuneWeek={onTuneWeek}
                onClose={() => setHoverIndex(null)}
              />
            )
          )}
        </div>
      </div>

      {/* 主图时间轨（2026-11-05 视觉精简二轮）：volume/PanelTimeTrack 同款样式
          （trackColors 轨道 + 选中窗 + 两端拖柄 + 键盘微调，量价页/参考卡同语言）。
          轨道域 = 全期周序，选中窗 = 当前可见窗；与「全期 / 三月 / 近 8 周」视图
          预设联动——预设点击同步轨道窗，轨道拖动 = 改窗（custom + windowRange），
          只改可见范围不裁剪模型。 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
        <div
          role="group"
          aria-label="主图视图窗预设"
          style={{ display: 'inline-flex', flex: 'none', marginTop: 2, border: `1px solid ${color.hairline}`, borderRadius: radius.control, overflow: 'hidden' }}
        >
          {windowPresetDefs.map((presetDef) => {
            const active = windowPreset === presetDef.key;
            return (
              <button
                key={presetDef.key}
                type="button"
                aria-pressed={active}
                aria-label={`视图窗预设 · ${presetDef.label}`}
                onClick={() => onViewChange?.({ window: presetDef.key })}
                style={{
                  border: 'none', padding: '3px 9px', font: 'inherit', fontSize: 11, cursor: 'pointer',
                  background: active ? selectSoft : color.canvas,
                  color: active ? selectSoftInk : color.body,
                  fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
                }}
              >
                {presetDef.label}
              </button>
            );
          })}
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <PanelTimeTrack
            ids={allWeeks.map((week) => week.weekId)}
            lo={0}
            hi={Math.max(0, allWeeks.length - 1)}
            s={visibleStart}
            e={visibleEnd}
            granularity="week"
            onChange={(start, end) => onViewChange?.({ window: 'custom', windowRange: [start, end] })}
          />
        </div>
      </div>

      {/* 图例（2026-11-05 Eason 全局 #1）：全部可点（aria-pressed + 隐藏态 opacity .45），
          图外底部居中一行；「事件」隐藏 = 方块点 + 事件底衬整层隐藏。 */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <WorkbenchLegend items={LEGEND_ITEMS} hidden={hidden} onToggle={toggle} />
      </div>

      {/* 「数据与操作」收起区（2026-11-05 视觉精简二轮，默认收起 = 组件内存态）：
          extras（页面传入的 IoBar / 摘要四格）+ 图下名录 + 数据表。默认视图 =
          卡头 + PipelineNav + 图表本身（图 + 图例 + 时间轨 + 证据浮框）。 */}
      <CollapsibleSection label="数据与操作">
        {extras}
        {/* 图下名录：范围事件（A 编号 + 起止 + 派生周数/形状 + 编辑/删除，键盘可达；
            +N 筛选态含清除）+ 手调（周销菱形 / 价格「价」标）+ 库存修正事实 */}
        <div style={{ display: 'grid', gap: 6, fontSize: 12, color: color.body }}>
        {overflowIds != null && (
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: color.warningInk }}>名录筛选 · 其余重叠范围事件（{overflowIds.length} 条）</span>
            <button
              type="button"
              aria-label="清除名录筛选"
              onClick={() => setOverflowIds(null)}
              style={{ border: 'none', background: 'transparent', color: color.link, fontSize: 11, cursor: 'pointer', padding: 0 }}
            >
              清除筛选
            </button>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
          {params.productEvents
            .filter((event) => overflowIds == null || overflowIds.includes(event.id))
            .map((event, order) => {
              const duration = durationOfWeekRange(calendar, event);
              return (
                <span key={event.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span aria-hidden style={{ width: 17, height: 17, borderRadius: '50%', border: `1px solid ${PRODUCT_EVENT_COLOR[event.type]}`, fontSize: 9.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: PRODUCT_EVENT_COLOR[event.type], fontWeight: 600 }}>{`A${order + 1}`}</span>
                  {`${PRODUCT_EVENT_LABEL[event.type]} · ${event.label || '未命名事件'}（${event.startWeekId}–${event.endWeekId}，${fmtSignedPct(event.magnitudePct)}）`}
                  <span className="tnum" style={{ color: color.mute, fontSize: 11 }}>
                    {duration != null ? `${duration} 周 · ${DECAY_TEXT[event.decay]}` : '起止无效'}
                  </span>
                  <button
                    type="button"
                    aria-label={`编辑事件 ${event.startWeekId}–${event.endWeekId}`}
                    onClick={() => onEditProductEvent?.(event)}
                    style={{ border: 'none', background: 'transparent', color: color.link, fontSize: 11, cursor: 'pointer', padding: 0 }}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    aria-label={`删除小事件 ${event.label || '未命名事件'}`}
                    onClick={() => onRemoveProductEvent(event.id)}
                    style={{ border: 'none', background: 'transparent', color: color.mute, fontSize: 11, cursor: 'pointer', padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              );
            })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
          {manualWeeks.map((week) => (
            <span key={`manual-${week.weekId}`} title={week.manual?.reason || undefined} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span aria-hidden style={{ color: color.ink, fontSize: 10 }}>◆</span>
              {`手调 · ${week.weekId}${week.manual?.reason ? `：${week.manual.reason}` : ''}`}
            </span>
          ))}
          <span title="min(基线 SO, 可售) 回写主图" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <span aria-hidden style={{ width: 17, height: 17, borderRadius: '50%', border: `1px solid ${color.warning}`, background: color.warningSoft, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: color.warningInk }}>修</span>
            {cappedFactWeeks.length ? `库存上限修正 · ${cappedFactWeeks[0]!.weekId} 起` : '当前考量未触发库存上限修正'}
          </span>
        </div>
      </div>

        {/* 数据表（B.5.4）：MainForecastDataTable 吸收 WeeklyLedger 职责——全期只读
            WorkbenchResult + MarginView，sticky header + 局部横滚，缺数「—」。
            2026-11-05：并入「数据与操作」收起区（与收起语义合一，无第二套开关）。 */}
        <MainForecastDataTable
          result={result}
          productEvents={params.productEvents}
          marginView={marginView}
          onTuneWeek={onTuneWeek}
        />
      </CollapsibleSection>
    </div>
  );
}

/** 促销窗口覆盖判定（id；供证据浮框 notices）。 */
function coveringPromoId(calendar: ReturnType<typeof buildForecastCalendar>, fixture: WorkbenchFixture, weekId: string): string | null {
  const week = calendar.weekById.get(weekId);
  if (!week) return null;
  for (const window of fixture.promoWindows) {
    const start = calendar.weekById.get(window.startWeekId);
    const end = calendar.weekById.get(window.endWeekId);
    if (!start || !end || start.index > end.index) continue;
    if (week.index >= start.index && week.index <= end.index) return window.id;
  }
  return null;
}

/** 构成项定位映射（B.5.2：每项可跳对应卡；无对应卡 = null 不出按钮）。 */
function locateCardOf(kind: string): MainChartFocusCard | null {
  return CONSIDER_CARD[kind] ?? null;
}

/**
 * 范围事件精简证据浮框（2026-11-05 Eason 全局 #2）：方块点 hover/focus = 预览
 * （role=status，不拦截指针）、click/Enter = 固定（role=dialog）。读数全部来自
 * 事件种子与日历派生（durationOfWeekRange），UI 不复算、不反推。
 */
function EventEvidence({
  event,
  order,
  duration,
  flip,
  pinned,
  onClose,
}: {
  event: ProductEventSeed;
  order: number;
  /** 派生周数（日历绝对 index；起止无效 = null）。 */
  duration: number | null;
  flip: boolean;
  pinned?: boolean;
  onClose: () => void;
}) {
  const valueRow = (label: string, value: string): ReactNode => (
    <div key={label} style={stageRowStyle}>
      <span>{label}</span>
      <b style={{ fontWeight: 600, color: color.ink }}>{value}</b>
    </div>
  );
  return (
    <EvidenceFrame
      title={`事件 A${order + 1} · ${PRODUCT_EVENT_LABEL[event.type]}`}
      status={`${event.startWeekId} – ${event.endWeekId}`}
      role={pinned ? 'dialog' : 'status'}
      ariaLabel={`事件 A${order + 1} 证据`}
      flip={flip}
      onClose={onClose}
      shellProps={pinned ? undefined : { style: { pointerEvents: 'none' } }}
    >
      {valueRow('名称', event.label || '未命名事件')}
      {valueRow('幅度（起始峰值）', fmtSignedPct(event.magnitudePct))}
      {valueRow('形状', DECAY_TEXT[event.decay])}
      {valueRow('派生周数', duration != null ? `${duration} 周` : '—')}
    </EvidenceFrame>
  );
}

/**
 * 促销档期精简证据浮框（2026-11-05 Eason 全局 #2）：档期方块点 hover/focus 显示
 * 档期区间底衬与名称；读数来自 fixture.promoWindows 与日历派生。
 */
function PromoEvidence({
  promo,
  duration,
  flip,
  pinned,
  onClose,
}: {
  promo: WorkbenchFixture['promoWindows'][number];
  duration: number | null;
  flip: boolean;
  pinned?: boolean;
  onClose: () => void;
}) {
  const valueRow = (label: string, value: string): ReactNode => (
    <div key={label} style={stageRowStyle}>
      <span>{label}</span>
      <b style={{ fontWeight: 600, color: color.ink }}>{value}</b>
    </div>
  );
  return (
    <EvidenceFrame
      title={promo.label || '促销档期'}
      status="促销档期"
      role={pinned ? 'dialog' : 'status'}
      ariaLabel={`促销档期 ${promo.label || ''}`}
      flip={flip}
      onClose={onClose}
      shellProps={pinned ? undefined : { style: { pointerEvents: 'none' } }}
    >
      {valueRow('起止', `${promo.startWeekId} – ${promo.endWeekId}`)}
      {valueRow('派生周数', duration != null ? `${duration} 周` : '—')}
    </EvidenceFrame>
  );
}

const stageRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' };

/**
 * 周证据浮框（B.5.3 四层 + 3.2 结果主图分卡规范）：
 * 头部（周 · 日期 · 状态 + 阶段显示口径）→ 条件 notices → 阶段值 + 学习证据 +
 * 构成（排序 + 定位）→ 数据状态行（Batch 2：模拟 · 数据版本 · 采集时间待确认）
 * → 动作「微调本周」（原因必填）。预览态 role=status（hover 临时，
 * pointerEvents none）；固定态 role=dialog（click/Enter 固定，Esc 关闭）。
 * 全部数字来自 result（含 result.learning），UI 不复算、不反推。
 */
function WeekEvidence({
  week,
  learning,
  productEventCount,
  promoLabel,
  displayPrice,
  modelVersion,
  leftPct,
  flip,
  pinned,
  onFocusCard,
  onTuneWeek,
  onClose,
}: {
  week: WorkbenchWeekResult;
  learning: WorkbenchResult['learning'];
  productEventCount: number;
  promoLabel: string | null;
  /** 显示价（MarginView 过渡接线后的口径；缺省 = 原价）。 */
  displayPrice: number;
  /** 数据版本（fixture.meta.modelVersion；数据状态行展示）。 */
  modelVersion: string;
  leftPct: number;
  flip: boolean;
  pinned?: boolean;
  onFocusCard?: (card: MainChartFocusCard, weekId: string) => void;
  onTuneWeek?: (weekId: string) => void;
  onClose: () => void;
}) {
  const forecast = week.status === 'forecast';
  const stageHead = !forecast
    ? '实际值'
    : week.manual != null ? '手调后显示值' : week.capped ? '③ 库存修正后（显示值）' : '③ 库存修正后';
  const notices: string[] = [];
  if (week.supplyCapped && week.manual != null) notices.push('库存截断事实仍在 · 显示手调值');
  else if (week.supplyCapped) notices.push('库存截断 · 按可售量修正');
  if (week.manual != null) notices.push(`含手调${week.manual.reason ? `：${week.manual.reason}` : ''}`);
  if (promoLabel) notices.push(`${promoLabel}内 · 档期形状已含在学习基线`);
  if (learning.status === 'fallback') notices.push('学习回退 · 中位数回退（证据见①）');
  else if (learning.status === 'partial' && learning.fallbackWeekIds.includes(week.weekId)) notices.push('参考缺口回退周 · 中位数回退');

  const stageRows: Array<{ label: string; value: number | null }> = forecast
    ? [
      { label: '① 自动学习基线', value: week.learnedBase },
      ...(productEventCount > 0 ? [{ label: '① 范围事件后', value: week.baselineSales }] : []),
      { label: '② 大盘修正后', value: week.marketAdjusted },
      { label: '③ 库存修正后', value: week.inventoryAdjusted },
      ...(week.manual != null ? [{ label: '手调后显示值', value: week.final }] : []),
    ]
    : [{ label: '周销（实际）', value: week.sales }];

  const consider = forecast
    ? [...week.consider].sort((a, b) => (CONSIDER_ORDER[a.kind] ?? 9) - (CONSIDER_ORDER[b.kind] ?? 9))
    : [];
  const coefficients = learning.coefficients;
  const tunable = forecast && week.final != null;

  return (
    <EvidenceFrame
      title={`${week.weekId} · ${week.dateLabel} · ${stageHead}`}
      status={forecast ? (learning.status === 'completed' ? '自动学习' : learning.status === 'partial' ? '部分回退' : '学习回退') : '实际'}
      notices={notices}
      role={pinned ? 'dialog' : 'status'}
      ariaLabel={`${week.weekId} 预测证据`}
      flip={flip}
      onClose={onClose}
      shellProps={pinned ? undefined : { style: { pointerEvents: 'none' } }}
      actions={(
        <>
          <span style={{ fontSize: 10.5, color: color.mute }}>{forecast ? '微调进入逐周手调，原因必填（取消不写入）' : '实际周不微调'}</span>
          {tunable && (
            <button
              type="button"
              onClick={() => onTuneWeek?.(week.weekId)}
              title="打开周销微调弹窗（调整只落在本周；原因必填）"
              style={{
                border: `1px solid ${color.hairlineStrong}`, padding: '3px 12px', borderRadius: radius.control, background: color.canvas,
                color: color.ink, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              微调本周
            </button>
          )}
        </>
      )}
    >
      {/* 阶段值（①②③ + 手调，直接读结果字段，不反推） */}
      <div style={{ display: 'grid', gap: 2 }}>
        {stageRows.map((row) => (
          <div key={row.label} style={stageRowStyle}>
            <span>{row.label}</span>
            <b style={{ fontWeight: 600, color: color.ink }}>{fmtWan(row.value)}</b>
          </div>
        ))}
        <div style={stageRowStyle}>
          <span>显示价</span>
          <b style={{ fontWeight: 600, color: color.ink }}>{`$${displayPrice.toLocaleString('en-US')}`}</b>
        </div>
      </div>
      {/* 学习证据（B.4.4：全部来自学习器输出；回测只展示可复核误差） */}
      {forecast && (
        <div style={{ display: 'grid', gap: 2, fontSize: 11, color: color.mute }}>
          <div style={{ fontSize: 10.5, color: color.mute, letterSpacing: '0.05em' }}>学习证据 · {learning.algorithm}</div>
          {learning.sampleStart != null && learning.sampleEnd != null && (
            <div>{`样本窗 ${learning.sampleStart} – ${learning.sampleEnd}`}</div>
          )}
          <div>{`有效周 ${learning.validSampleCount}（训练 ${learning.trainCount} / 留出 ${learning.holdoutCount}）`}</div>
          <div>{`特征 ${learning.featureNames.join(' · ')}（价格关系未纳入）`}</div>
          {coefficients != null && (
            <div>{`系数 ${coefficients.map((value) => value.toFixed(3)).join(' · ')}`}</div>
          )}
          {learning.holdoutMae != null && learning.holdoutMape != null && (
            <div>{`回测 留出 MAE ${fmtUnits(learning.holdoutMae)} 台 · MAPE ${Math.round(learning.holdoutMape * 10) / 10}%（可复核误差）`}</div>
          )}
        </div>
      )}
      {/* 本周考量构成（按 ①学习→①范围事件→②大盘→③库存→手调 排序；可定位对应卡） */}
      {forecast && consider.length > 0 && (
        <div style={{ display: 'grid', gap: 3 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: color.mute }}>本周考量构成</div>
          {consider.map((item) => {
            const card = locateCardOf(item.kind);
            return (
              <div key={`${item.kind}-${item.label}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 104, flex: 'none', fontSize: 11, color: color.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.label}>{item.label}</span>
                <span className="tnum" style={{ width: 46, flex: 'none', textAlign: 'right', fontWeight: 600, color: (item.pct ?? 0) < 0 ? color.error : color.body }}>
                  {item.pct != null ? fmtSignedPct(item.pct) : '—'}
                </span>
                {card != null && onFocusCard ? (
                  <button
                    type="button"
                    aria-label={`定位 ${item.label} 来源`}
                    title="定位到对应卡的证据来源"
                    onClick={() => onFocusCard?.(card, week.weekId)}
                    style={{ border: 'none', background: 'transparent', color: color.link, fontSize: 11, cursor: 'pointer', padding: 0, flex: 'none' }}
                  >
                    定位
                  </button>
                ) : (
                  <span style={{ flex: 1, fontSize: 10.5, color: color.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.note}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* 数据状态行（Batch 2 统一取证）：状态 + 数据版本 + 采集时间（缺失写待确认）+ 缺数口径 */}
      <div data-week-evidence-status className="tnum" style={{ fontSize: 11, color: color.mute }}>
        {`数据状态：${forecast ? '模拟（预测段为本地确定性推演，未调用模型服务）' : '模拟（历史段为模拟实际）'} · 数据版本 ${modelVersion} · 采集时间：待确认 · 缺数周不插值`}
      </div>
    </EvidenceFrame>
  );
}
