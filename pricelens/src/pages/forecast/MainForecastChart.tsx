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
// 产品范围事件图顶锚 = A 编号 + 起止端点 + 范围线（不铺全高色带）；
// 重叠 ≤2 lane，其余 +N 打开图下名录筛选；名录行提供编辑 / 删除（键盘可达）。
// 价格手调墨色「价」小标与周销墨色菱形并存；库存截断琥珀描边读 supplyCapped。
// 价格系列显示过渡态 effectivePrice（marginView prop 可选；缺省 = fixture 原价
// ——MarginView 正式接线在任务 9 / T10）。数据表替换为 MainForecastDataTable
// （B.5.4 列，只读 WorkbenchResult + MarginView，吸收 WeeklyLedger 职责）。
// 大减法下线（2026-11-04 评审）保持：无历史销量黑线、无把握帽/区间带、
// 无调价档期锚点竖线、无档期琥珀色带、无预测区灰底衬；计算函数保留待清理。
// ============================================================
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { brandColor, color, font, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { ProductEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult, WorkbenchWeekResult } from './workbenchModel';
import { WorkbenchLegend, fmtSignedPct, fmtWan, wanOf, type LegendItem } from './WorkbenchBits';
import { buildAxisTicks, buildLineSegments, firstForecastIndex, segmentPathD } from './workbenchChartSegments';
import { axisTickPlan } from '../../chart/PriceTrend/helpers';
import { buildForecastCalendar, durationOfWeekRange } from './workbenchCalendar';
import EvidenceFrame from './EvidenceFrame';
import MainForecastDataTable, { type MainForecastMarginView } from './MainForecastDataTable';

const W = 1180;
/** heightScale = 1 时的画布高度（H = TOP + BASE_PLOT_H + BOTTOM）；heightScale 只缩放绘图区。
 *  2026-11-04 视觉一致性：与价格走势页图高（≈252px）对齐。 */
const BASE_PLOT_H = 172;
const LEFT = 64;
const RIGHT = 64;
const TOP = 34;
const BOTTOM = 46;
const PLOT_W = W - LEFT - RIGHT;

/** 主图受控视图（WP6 共享工具行写入；默认 = 当前视觉）。 */
export interface MainForecastView {
  /** 绘图区高度缩放（只缩放绘图区，不含轴与边距）；1 = 默认。 */
  heightScale: number;
  /** 是否显示纵向刻度与网格（左轴 + 右轴）。 */
  showYTicks: boolean;
  /** 周标签密度：compact = 月刻度抽稀步长 ×1.5；detail = 每月。 */
  labelMode: 'compact' | 'detail';
  /** 促销呈现开关：档期琥珀色带已下线（2026-11-04 评审），现仅控制轴下促销日期标注显隐；字段名保留兼容共享工具行。 */
  promoBandOn: boolean;
  /** 视图窗（B.5.4）：full = 全期（默认）；m3 = 预测末三月；w8 = 近 8 周。只改可见范围，不裁剪模型。 */
  window?: 'full' | 'm3' | 'w8';
}

export const DEFAULT_MAIN_FORECAST_VIEW: MainForecastView = {
  heightScale: 1,
  showYTicks: true,
  labelMode: 'compact',
  promoBandOn: true,
  window: 'full',
};

/** 主图小事件锚点色（与参考卡事实锚同源色系）。 */
export const PRODUCT_EVENT_COLOR: Record<ProductEventSeed['type'], string> = {
  'competitor-launch': color.link,
  'own-promo': color.warning,
  cannibalization: color.ink,
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

/** 数据系列图例（均可点击切换显隐；库存描边是预测样式，归说明项）。 */
const LEGEND_SERIES: LegendItem[] = [
  { key: 'actual', label: '周销 实际', shape: 'rect', color: color.link },
  { key: 'forecast', label: '周销 预测', shape: 'rectDash', color: color.link },
  { key: 'price', label: '价格（右轴）', shape: 'line', color: brandColor.HUAWEI },
  { key: 'prevGen', label: '参考 · 上一代同周龄', shape: 'dash', color: color.hairlineStrong },
];
/** 说明项图例（无 key = 纯说明，不可点击）。 */
const LEGEND_NOTES: LegendItem[] = [
  { label: '库存上限修正周（琥珀描边 · 预测样式）', shape: 'rectAmber', color: color.warning },
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
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [overflowIds, setOverflowIds] = useState<string[] | null>(null);
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
  // 视图窗（B.5.4）：full = 全期；m3 = 预测末三月；w8 = 近 8 周。只裁可见范围，数据表 / 名录仍列全期。
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
    return allWeeks;
  }, [allWeeks, viewState.window]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // Esc 分级：先回证据（关固定回预览），再关闭（预览随 hover 消失）。
      setPinnedIndex((prev) => (prev != null ? null : prev));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const weeks = chartWeeks;
  // 时间边界派生（WP5 Step 3）：预测起点 / 历史终点 / 今天分界共用同一来源，禁写死下标。
  const forecastStart = firstForecastIndex(weeks);
  const hasForecast = forecastStart >= 0;
  const hasHistory = forecastStart > 0;
  const historyEnd = hasForecast ? forecastStart - 1 : weeks.length - 1;
  const slot = PLOT_W / weeks.length;
  const x = (index: number): number => LEFT + (index + 0.5) * slot;
  const boundaryX = hasHistory && hasForecast ? (x(historyEnd) + x(forecastStart)) / 2 : null;

  // 促销档期 = 轴下日期标注（琥珀色带下线，只留轴上最小日期标记）。
  const forecastPromoWindow = fixture.promoWindows.find((window) =>
    weeks.some((week) => week.weekId === window.startWeekId && week.status === 'forecast')) ?? null;
  const promoStartIndex = forecastPromoWindow
    ? weeks.findIndex((week) => week.weekId === forecastPromoWindow.startWeekId)
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
  const prevGenPointAt = (index: number): { x: number; y: number } => ({ x: x(index), y: y(weeks[index]!.prevGenSales ?? 0) });
  const prevGenSegments = buildLineSegments(weeks.map((week) => week.prevGenSales));
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

  // 范围事件图顶锚（B.5.4）：A 编号 + 起止端点 + 范围线；重叠 ≤2 lane，其余 +N 名录筛选。
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

  const ariaLabel = `${fixture.context.product} 量价预测主图：历史 ${fixture.context.historyRange} 演示实际实柱、预测 ${fixture.context.forecastRange} 虚柱；预测期总销量 ${fmtWan(result.summary.totalSales)}；大促峰 ${result.summary.peak.weekId} ${fmtWan(result.summary.peak.value)}；促销档期 ${forecastPromoWindow ? `${forecastPromoWindow.startWeekId} 起` : '无'}（轴下日期标注）；${cappedFactWeeks.length ? `库存上限修正 ${cappedFactWeeks[0]!.weekId} 起` : '未触发库存上限修正'}；横轴按月分组，周详情见证据浮框与数据表。`;

  const activeIndex = pinnedIndex ?? hoverIndex;
  const activeWeek = activeIndex != null ? weeks[activeIndex] ?? null : null;

  return (
    <div style={{ display: 'grid', gap: space.sm }}>
      {controls}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ position: 'relative', minWidth: 960 }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={ariaLabel}
            style={{ display: 'block', height: 'auto' }}
          >
            {/* 今天分界：只留虚线 + 轴上「今天」日期 */}
            {boundaryX != null && (
              <>
                <line x1={boundaryX} x2={boundaryX} y1={TOP - 6} y2={TOP + plotH} stroke={color.hairlineStrong} strokeDasharray="4 4" />
                <text x={boundaryX - 6} y={H - 8} textAnchor="end" fontSize={10} fontWeight={600} fill={color.body}>{`今天 ${fixture.context.todayLabel}`}</text>
              </>
            )}

            {/* 网格 + 左轴（万台）+ 右轴（$，数据派生刻度）；showYTicks=false 时整体隐藏 */}
            {showYTicks && (
              <>
                <g stroke={color.hairline}>
                  {volumeTicks.map((tick) => (
                    <line key={`grid-${tick}`} x1={LEFT} y1={y(tick)} x2={W - RIGHT} y2={y(tick)} />
                  ))}
                </g>
                <g fontSize={10} fill={color.mute} textAnchor="end">
                  {volumeTicks.map((tick) => (
                    <text key={`vt-${tick}`} x={LEFT - 8} y={y(tick) + 3}>{wanOf(tick)}</text>
                  ))}
                </g>
                <text x={LEFT - 8} y={TOP - 10} fontSize={10} fill={color.mute} textAnchor="end">万台</text>
                <g fontSize={10} fill={color.mute} textAnchor="start">
                  {priceTicks.map((tick) => (
                    <text key={`pt-${tick}`} x={W - RIGHT + 8} y={yPrice(tick) + 3}>{`$${tick}`}</text>
                  ))}
                </g>
              </>
            )}

            {/* 上一代同周龄参考线（灰虚，按周龄对齐） */}
            {show('prevGen') && prevGenSegments.map((segment) => (
              <path
                key={`pg-${segment.from}-${segment.to}`}
                d={segmentPathD(segment, prevGenPointAt)}
                fill="none"
                stroke={color.hairlineStrong}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            ))}

            {/* 周销柱：历史实柱（浅蓝）/ 预测虚柱（描边；库存修正周琥珀描边微痕）；缺数周不造柱 */}
            {weeks.map((week, index) => {
              const value = week.final;
              if (value == null) return null;
              const forecast = week.status === 'forecast';
              if (forecast ? !show('forecast') : !show('actual')) return null;
              const adjusted = week.capped;
              const reason = week.manual?.reason ?? '';
              return (
                <rect
                  key={`bar-${week.weekId}`}
                  x={x(index) - barW / 2}
                  y={y(value)}
                  width={barW}
                  height={Math.max(0, TOP + plotH - y(value))}
                  rx={2}
                  fill={forecast ? color.canvas : color.link}
                  fillOpacity={forecast ? 1 : 0.16}
                  stroke={forecast ? (adjusted ? color.warning : color.link) : 'none'}
                  strokeWidth={forecast ? 1.4 : 0}
                  strokeDasharray={forecast ? '4 3' : undefined}
                >
                  <title>{`${week.weekId}（${week.dateLabel}）${forecast ? '预测' : '实际'} 周销 ${fmtWan(value)}${adjusted ? ' · 按可售量修正' : ''}${week.manual ? ` · 手调${reason ? `：${reason}` : ''}` : ''} · 价格 $${displayPriceOf(week)}`}</title>
                </rect>
              );
            })}

            {/* 价格线右轴：实（历史）→ 虚（预测）；显示价读 MarginView 过渡字段（缺省原价） */}
            {show('price') && historyPriceD && (
              <path d={historyPriceD} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2.4} />
            )}
            {show('price') && forecastPriceD && (
              <path d={forecastPriceD} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2.2} strokeDasharray="6 5" />
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
                  <text x={cx} y={cy + 1} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={color.onPrimary}>价</text>
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
                    <text x={cx} y={cy - 10} textAnchor="middle" fontSize={9} fill={color.body}>
                      {short}
                      <title>{reason}</title>
                    </text>
                  )}
                </g>
              );
            })}

            {/* 产品范围事件图顶锚（B.5.4）：A 编号 + 起止端点 + 范围线；≤2 lane；不铺全高色带 */}
            {rangeAnchors.placed.map(({ event, order, lane, startIdx, endIdx }) => {
              const tone = PRODUCT_EVENT_COLOR[event.type];
              const laneY = laneYOf(lane);
              const x1 = x(startIdx);
              const x2 = x(endIdx);
              return (
                <g key={`range-${event.id}`} data-range-anchor={event.id}>
                  <line data-range-event-id={event.id} x1={x1} y1={laneY} x2={x2} y2={laneY} stroke={tone} strokeWidth={2} />
                  <rect x={x1 - 3} y={laneY - 3} width={6} height={6} fill={color.canvas} stroke={tone} strokeWidth={1.4} />
                  <rect x={x2 - 3} y={laneY - 3} width={6} height={6} fill={color.canvas} stroke={tone} strokeWidth={1.4} />
                  <circle cx={x1} cy={laneY} r={8.5} fill={color.canvas} stroke={tone} strokeWidth={1.4} />
                  <text x={x1} y={laneY + 3.5} textAnchor="middle" fontSize={10} fill={tone} fontWeight={600}>{`A${order + 1}`}</text>
                  <title>{`${PRODUCT_EVENT_LABEL[event.type]} · ${event.label || '未命名事件'}（${event.startWeekId}–${event.endWeekId}，${fmtSignedPct(event.magnitudePct)} · ${DECAY_TEXT[event.decay]}）`}</title>
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
                <rect x={W - RIGHT - 74} y={TOP - 2} width={44} height={16} rx={8} fill={color.canvas} stroke={color.hairlineStrong} strokeWidth={1} />
                <text x={W - RIGHT - 52} y={TOP + 10} textAnchor="middle" fontSize={10} fontWeight={600} fill={color.body}>{`+${rangeAnchors.overflow.length}`}</text>
                <title>其余重叠范围事件：打开图下名录筛选</title>
              </g>
            )}

            {/* 横轴月分组刻度：全站月日历格式 YYYY-MM；取刻度同源 axisTickPlan */}
            <g fontSize={10} fill={color.mute} textAnchor="middle" fontFamily={font.mono}>
              {monthPlan.indexes.map((monthIndex) => {
                const weekIndex = monthFirstWeekIndex.get(monthKeys[monthIndex]!) ?? 0;
                return <text key={monthKeys[monthIndex]!} x={x(weekIndex)} y={H - 24}>{monthKeys[monthIndex]}</text>;
              })}
            </g>

            {/* 促销档期日期标注：轴下最小标记（起点小刻度 + 日期文字），不上色带 */}
            {promoMarkOn && (
              <g key="promo-mark">
                <line x1={x(promoStartIndex)} x2={x(promoStartIndex)} y1={H - 21} y2={H - 14} stroke={color.hairlineStrong} strokeWidth={1} />
                <text x={x(promoStartIndex)} y={H - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill={color.body}>{forecastPromoWindow?.label ?? '促销档期'}</text>
              </g>
            )}

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
                  onClick={() => forecast && setPinnedIndex((prev) => (prev === index ? null : index))}
                  onKeyDown={(event) => {
                    if (!forecast) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setPinnedIndex((prev) => (prev === index ? null : index));
                    }
                  }}
                />
              );
            })}
          </svg>

          {/* 证据浮框：hover/focus = 预览（role=status，不拦截指针）；click/Enter = 固定（role=dialog）。
              固定态粘滞（页面周销弹窗打开时保持），Esc 先回证据再关闭。 */}
          {activeWeek != null && activeIndex != null && (
            pinnedIndex != null ? (
              <WeekEvidence
                week={activeWeek}
                learning={result.learning}
                productEventCount={params.productEvents.length}
                promoLabel={fixture.promoWindows.find((window) => window.id === coveringPromoId(calendar, fixture, activeWeek.weekId))?.label ?? null}
                displayPrice={displayPriceOf(activeWeek)}
                leftPct={(x(activeIndex) / W) * 100}
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
                leftPct={(x(activeIndex) / W) * 100}
                flip={activeIndex > weeks.length / 2}
                onFocusCard={onFocusCard}
                onTuneWeek={onTuneWeek}
                onClose={() => setHoverIndex(null)}
              />
            )
          )}
        </div>
      </div>

      {/* 图例：数据系列（可点击切换显隐）/ 说明项（纯说明）两组分开 */}
      <div style={{ display: 'grid', justifyContent: 'center', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: color.mute, flex: 'none' }}>数据系列</span>
          <WorkbenchLegend items={LEGEND_SERIES} hidden={hidden} onToggle={toggle} style={{ marginTop: 0 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: color.mute, flex: 'none' }}>说明项</span>
          <WorkbenchLegend items={LEGEND_NOTES} hidden={hidden} style={{ marginTop: 0 }} />
        </div>
      </div>

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
          WorkbenchResult + MarginView，sticky header + 局部横滚，缺数「—」。 */}
      <MainForecastDataTable
        result={result}
        productEvents={params.productEvents}
        marginView={marginView}
        onTuneWeek={onTuneWeek}
      />
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

const stageRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' };

/**
 * 周证据浮框（B.5.3 四层 + 3.2 结果主图分卡规范）：
 * 头部（周 · 日期 · 状态 + 阶段显示口径）→ 条件 notices → 阶段值 + 学习证据 +
 * 构成（排序 + 定位）→ 动作「微调本周」。预览态 role=status（hover 临时，
 * pointerEvents none）；固定态 role=dialog（click/Enter 固定，Esc 关闭）。
 * 全部数字来自 result（含 result.learning），UI 不复算、不反推。
 */
function WeekEvidence({
  week,
  learning,
  productEventCount,
  promoLabel,
  displayPrice,
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
          <span style={{ fontSize: 10.5, color: color.mute }}>{forecast ? '微调进入逐周手调，原因选填' : '实际周不微调'}</span>
          {tunable && (
            <button
              type="button"
              onClick={() => onTuneWeek?.(week.weekId)}
              style={{
                border: 'none', padding: '3px 12px', borderRadius: radius.control, background: color.ink,
                color: color.onPrimary, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
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
    </EvidenceFrame>
  );
}
