// ============================================================
// 推演工作台 v2 · 层①主图（视觉重心，只露最终结果——库存修正过程不呈现，
// 仅保留修正周琥珀描边微痕）：
// 历史实柱 + 预测虚柱（销量只留柱）+ 上一代同周龄参考线 + 价格线右轴
// （历史实线 / 预测虚线）+ 今天分界虚线 + 库存修正周琥珀描边微痕 +
// 手调墨色菱形（原因内联小字 + 图下名录）+ 产品级小事件锚点 +
// 促销档期轴下日期标注（轴上最小标记，不上色带）。
// 2026-11-04 三方评审「大减法」下线：历史销量黑线（只是把销量点描了一遍，
// 信息重复）、把握帽与把握区间带、调价/档期锚点竖线（档位线）、大促琥珀
// 色带。把握帽计算源自 workbenchModel.ts（该文件另一 Agent 施工中不改），
// 本组件仅在渲染层停用，计算函数保留待主线清理。
// 2026-11-04 清洁第二轮：预测区灰底衬（canvasSoft2 分区色块）与「实际 /
// 预测 · 向未来」说明文字下线——分区靠虚柱 / 价格虚线本身区分；今天分界
// 只留虚线 + 轴上「今天」日期。X 轴刻度改全站日历周格式（2026W37）：
// 取刻度与文案同源价格走势页 axisTickPlan / shortBucketLabel
//（chart/PriceTrend/helpers，桶号 YYYYWW 由周数据的完整日期年份拼装）。
// 时间边界（预测起点 / 历史终点 / 今天分界）一律从周状态派生（WP5 Step 3，
// 禁写死下标）；价格轴由数据派生（Step 5）；缺数不造 0、实线不跨缺失段
// （跨缺灰虚，Step 1/6）；图例分「数据系列 / 说明项」两组（Step 7）；
// 手调墨色与库存琥珀双状态共存（Step 8，修正事实读 supplyCapped）。
// 悬停 / 聚焦预测周出「本周考量」构成浮窗；点击或 Enter 打开微调
// （原因选填——2026-11-04 评审放宽，弹窗与校验在 ForecastPage，空原因照常应用）。
// 受控视图 view（heightScale / showYTicks / labelMode / promoBandOn）与
// controls 插槽供 WP6 共享工具行接入，默认值 = 当前视觉（Step 11）。
// ============================================================
import { useState, type CSSProperties, type ReactNode } from 'react';
import { brandColor, color, font, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { ProductEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult, WorkbenchWeekResult } from './workbenchModel';
import { WorkbenchLegend, fmtWan, wanOf, type LegendItem } from './WorkbenchBits';
import { buildAxisTicks, buildLineSegments, firstForecastIndex, segmentPathD } from './workbenchChartSegments';
import { axisTickPlan } from '../../chart/PriceTrend/helpers';

const W = 1180;
/** heightScale = 1 时的画布高度（H = TOP + BASE_PLOT_H + BOTTOM）；heightScale 只缩放绘图区。 */
const BASE_PLOT_H = 300;
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
  /** 周标签密度：compact = 每 2 个 + 末尾；detail = 每周。 */
  labelMode: 'compact' | 'detail';
  /** 促销呈现开关：档期琥珀色带已下线（2026-11-04 评审），现仅控制轴下促销日期标注显隐；字段名保留兼容共享工具行。 */
  promoBandOn: boolean;
}

export const DEFAULT_MAIN_FORECAST_VIEW: MainForecastView = {
  heightScale: 1,
  showYTicks: true,
  labelMode: 'compact',
  promoBandOn: true,
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
  cannibalization: '自家挤兑',
};

/** 数据系列图例（均可点击切换显隐；库存描边是预测样式，归说明项）。
 *  「柱顶帽 = 把握区间」随把握帽下线移除（2026-11-04 评审）。 */
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

const thStyle: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: color.mute, textAlign: 'right',
  padding: '5px 8px', borderBottom: `1px solid ${color.hairline}`, whiteSpace: 'nowrap',
};
const tdStyle: CSSProperties = {
  fontSize: 12, color: color.body, textAlign: 'right',
  padding: '4px 8px', borderBottom: `1px solid ${color.hairline}`, whiteSpace: 'nowrap',
};

const fmtUnits = (value: number | null): string => (value != null ? value.toLocaleString('en-US') : '—');

export default function MainForecastChart({
  fixture,
  params,
  result,
  onTuneWeek,
  onRemoveProductEvent,
  view,
  controls,
}: {
  fixture: WorkbenchFixture;
  params: { productEvents: ProductEventSeed[] };
  result: WorkbenchResult;
  onTuneWeek: (weekNumber: number) => void;
  onRemoveProductEvent: (id: string) => void;
  /** 受控视图（WP6 共享工具行）；缺省 = DEFAULT_MAIN_FORECAST_VIEW。 */
  view?: Partial<MainForecastView>;
  /** 渲染在主图上方的插槽（共享工具行），不含卡头操作。 */
  controls?: ReactNode;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const show = (key: string): boolean => !hidden.has(key);
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const weeks = result.weeks;
  const viewState = { ...DEFAULT_MAIN_FORECAST_VIEW, ...view };
  const heightScale = Number.isFinite(viewState.heightScale) && viewState.heightScale > 0 ? viewState.heightScale : 1;
  const plotH = BASE_PLOT_H * heightScale;
  const H = TOP + plotH + BOTTOM;
  const showYTicks = viewState.showYTicks;
  const labelMode = viewState.labelMode;

  // 时间边界派生（WP5 Step 3）：预测起点 / 历史终点 / 今天分界共用同一来源，禁写死下标。
  const forecastStart = firstForecastIndex(weeks);
  const hasForecast = forecastStart >= 0;
  const hasHistory = forecastStart > 0;
  const historyEnd = hasForecast ? forecastStart - 1 : weeks.length - 1;
  const slot = PLOT_W / weeks.length;
  const x = (index: number): number => LEFT + (index + 0.5) * slot;
  const boundaryX = hasHistory && hasForecast ? (x(historyEnd) + x(forecastStart)) / 2 : null;

  // 促销档期 = 轴下日期标注（2026-11-04 评审：琥珀色带下线，只留轴上最小日期标记）。
  const promoStartIndex = weeks.findIndex((week) => week.weekNumber >= fixture.promoBand.startWeek);
  const promoMarkOn = viewState.promoBandOn && promoStartIndex >= 0;

  // 纵轴：销量覆盖全部有值点（缺数不参与，不当 0）；价格轴由数据派生（Step 5）。
  const volumeValues = weeks.flatMap((week) => [week.sales, week.final]).filter((value): value is number => value != null);
  const volumePeak = Math.max(0, ...volumeValues, ...weeks.map((week) => week.prevGenSales));
  const yMax = Math.max(1, niceCeil(volumePeak * 1.12));
  const y = (value: number): number => TOP + plotH * (1 - value / yMax);
  const prices = weeks.map((week) => week.price);
  // 价格轴由数据派生（Step 5），不写死轴范围。（原「预测把握带极值入轴域」
  // 随把握带下线一并移除——把握帽已下线（2026-11-04 评审），计算函数保留待主线清理。）
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

  // 横轴刻度与文案同源价格走势页（第一百五十二轮口径）：axisTickPlan 取刻度
  //（首末恒显示 + 抽稀让位），文案走周自带年份短格式（2026W37，shortBucketLabel）。
  // 桶号 YYYYWW 由周数据的完整日期年份 + weekNumber 拼装（年份不写死）；compact /
  // detail 两档密度映射为抽稀步长（compact = 全站图轴同款 ceil(n/9)，detail = 每周）。
  const weekBucketIds = weeks.map((week) => {
    const source = fixture.weeks.find((candidate) => candidate.weekNumber === week.weekNumber);
    const year = source ? source.date.slice(0, 4) : '';
    return `${year}${String(week.weekNumber).padStart(2, '0')}`;
  });
  const labelStep = labelMode === 'detail' ? 1 : Math.max(1, Math.ceil(weekBucketIds.length / 9));
  const axisPlan = axisTickPlan('week', weekBucketIds, labelStep, weekBucketIds.length > 1 ? [0, weekBucketIds.length - 1] : [0]);
  const axisShown = new Set(axisPlan.indexes);

  // 折线段（WP5 Step 1）：连续段实线、跨缺段灰虚，缺数不造点。
  const prevGenPointAt = (index: number): { x: number; y: number } => ({ x: x(index), y: y(weeks[index].prevGenSales) });
  const prevGenSegments = buildLineSegments(weeks.map((week) => week.prevGenSales));
  const pricePathD = (from: number, to: number, anchorM: string | null = null): string | null => {
    if (from > to || from < 0 || to >= weeks.length) return null;
    const points = weeks.slice(from, to + 1)
      .map((_, offset) => `${offset === 0 && !anchorM ? 'M' : 'L'}${x(from + offset).toFixed(1)} ${yPrice(prices[from + offset]).toFixed(1)}`);
    if (anchorM) points.unshift(anchorM);
    return points.join(' ');
  };
  const historyPriceD = hasHistory ? pricePathD(0, historyEnd) : null;

  // 接缝（A4）：价格预测线以最后一个历史点为起点 M，与历史线无缝衔接。
  const priceSeamM = hasForecast
    ? `M${x(historyEnd).toFixed(1)} ${yPrice(prices[historyEnd]).toFixed(1)}`
    : null;
  const forecastPriceD = hasForecast ? pricePathD(forecastStart, weeks.length - 1, priceSeamM) : null;

  // 库存修正双状态（WP5 Step 8）：capped = 当前显示态（柱琥珀描边）；supplyCapped = 截断事实（名录/aria，不随手调消失）。
  const cappedFactWeeks = weeks.filter((week) => week.supplyCapped);
  const manualWeeks = weeks.filter((week) => week.manual != null);

  if (!weeks.length) {
    return (
      <div style={{ display: 'grid', gap: space.sm }}>
        {controls}
        <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: space.lg, fontSize: 12, color: color.mute, textAlign: 'center' }}>
          当前范围无可推演数据
        </div>
      </div>
    );
  }

  const ariaLabel = `${fixture.context.product} 量价预测主图：历史 ${fixture.context.historyRange} 演示实际实柱、预测 ${fixture.context.forecastRange} 虚柱；预测期总销量 ${fmtWan(result.summary.totalSales)}；大促峰 W${result.summary.peak.weekNumber} ${fmtWan(result.summary.peak.value)}；促销档期 W${fixture.promoBand.startWeek} 起（轴下日期标注）；${cappedFactWeeks.length ? `库存上限修正 W${cappedFactWeeks[0].weekNumber} 起` : '未触发库存上限修正'}；详细数值见下方数据表。`;

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
            {/* 今天分界：只留虚线 + 轴上「今天」日期；预测区灰底衬与「实际 /
                预测 · 向未来」分区说明文字已下线（2026-11-04 清洁第二轮：
                分区靠虚柱 / 价格虚线本身区分）；大促档期琥珀色带已下线（2026-11-04 评审） */}
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

            {/* 上一代同周龄参考线（灰虚，按周龄对齐；W45 起为已发生历史映射） */}
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
                  key={`bar-${week.week}`}
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
                  <title>{`${week.week}（${week.dateLabel}）${forecast ? '预测' : '实际'} 周销 ${fmtWan(value)}${adjusted ? ' · 按可售量修正' : ''}${week.manual ? ` · 手调${reason ? `：${reason}` : ''}` : ''} · 价格 $${week.price}`}</title>
                </rect>
              );
            })}

            {/* 周销连线已下线（2026-11-04 评审「删黑线」）：黑线只是把销量点描了一遍，
                信息重复；销量只留柱。预测段区分由虚柱 + 价格虚线承担。 */}

            {/* 价格线右轴：实（历史）→ 虚（预测）；边界从周状态派生 */}
            {show('price') && historyPriceD && (
              <path d={historyPriceD} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2.4} />
            )}
            {show('price') && forecastPriceD && (
              <path d={forecastPriceD} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2.2} strokeDasharray="6 5" />
            )}

            {/* 把握帽已下线（2026-11-04 评审）：使用者已知预测不准，把握提示无意义还多算；
                区间计算函数保留待主线清理。 */}

            {/* 手调标记（墨色菱形，琥珀只留给库存修正）+ 原因内联小字（原因选填，空原因只留菱形） */}
            {weeks.map((week, index) => {
              if (week.manual == null || week.final == null) return null;
              const cx = x(index);
              const cy = y(week.final) - 14;
              const reason = week.manual.reason;
              const short = reason.length > 12 ? `${reason.slice(0, 12)}…` : reason;
              return (
                <g key={`manual-${week.week}`}>
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

            {/* 主图小事件锚点（产品级三类，与参考卡事实同源色系） */}
            {params.productEvents.map((event, order) => {
              const index = weeks.findIndex((week) => week.weekNumber === event.week);
              if (index < 0) return null;
              const cx = x(index);
              const tone = PRODUCT_EVENT_COLOR[event.type];
              return (
                <g key={`pe-${event.id}`}>
                  <line x1={cx} y1={TOP - 4} x2={cx} y2={TOP + plotH} stroke={tone} strokeDasharray="3 4" opacity={0.55} />
                  <circle cx={cx} cy={TOP + 6} r={8.5} fill={color.canvas} stroke={tone} strokeWidth={1.4} />
                  <text x={cx} y={TOP + 9.5} textAnchor="middle" fontSize={10} fill={tone} fontWeight={600}>{`A${order + 1}`}</text>
                  <title>{`${PRODUCT_EVENT_LABEL[event.type]} · ${event.label}（W${event.week}，${event.magnitudePct > 0 ? '+' : ''}${event.magnitudePct}%）`}</title>
                </g>
              );
            })}

            {/* 调价 / 档期锚点竖线已下线（2026-11-04 评审「删档位线」）：
                调价读价格线折点，档期读轴下促销日期标注 */}

            {/* 横轴周标签：全站日历周格式（2026W37，短格式自带年份）；取刻度
                同源 axisTickPlan（首末恒显示 + 抽稀让位），labelMode 只切换抽稀步长 */}
            <g fontSize={10} fill={color.mute} textAnchor="middle" fontFamily={font.mono}>
              {weeks.map((week, index) => (axisShown.has(index)
                ? <text key={week.week} x={x(index)} y={H - 24}>{axisPlan.dateText(index)}</text>
                : null))}
            </g>

            {/* 促销档期日期标注：轴下最小标记（起点小刻度 + 日期文字），不上色带 */}
            {promoMarkOn && (
              <g key="promo-mark">
                <line x1={x(promoStartIndex)} x2={x(promoStartIndex)} y1={H - 21} y2={H - 14} stroke={color.hairlineStrong} strokeWidth={1} />
                <text x={x(promoStartIndex)} y={H - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill={color.body}>{fixture.promoBand.label}</text>
              </g>
            )}

            {/* 命中区：悬停读数；有值的预测周可聚焦 / 点击微调（缺数周不可微调） */}
            {weeks.map((week, index) => {
              const tunable = week.status === 'forecast' && week.final != null;
              return (
                <rect
                  key={`hit-${week.week}`}
                  x={x(index) - slot / 2}
                  y={TOP}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  style={{ cursor: tunable ? 'pointer' : 'default' }}
                  tabIndex={tunable ? 0 : -1}
                  role={tunable ? 'button' : undefined}
                  aria-label={tunable ? `微调 ${week.week} 预测销量，当前 ${fmtWan(week.final)}` : undefined}
                  onMouseEnter={() => setHoverIndex(index)}
                  onMouseLeave={() => setHoverIndex((prev) => (prev === index ? null : prev))}
                  onFocus={() => setHoverIndex(index)}
                  onBlur={() => setHoverIndex((prev) => (prev === index ? null : prev))}
                  onClick={() => tunable && onTuneWeek(week.weekNumber)}
                  onKeyDown={(event) => {
                    if (!tunable) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onTuneWeek(week.weekNumber);
                    }
                  }}
                />
              );
            })}
          </svg>

          {/* 悬停浮窗：周读数 + 本周考量构成（各来源影响幅度） */}
          {hoverIndex != null && weeks[hoverIndex] && (
            <WeekTooltip
              week={weeks[hoverIndex]}
              prevWeek={hoverIndex > 0 ? weeks[hoverIndex - 1] : null}
              leftPct={(x(hoverIndex) / W) * 100}
              flip={hoverIndex > weeks.length / 2}
            />
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

      {/* 图下名录：小事件（可删）+ 手调原因（选填，空原因只列周）+ 库存修正状态（读 supplyCapped 事实） */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12, color: color.body }}>
        {params.productEvents.map((event, order) => (
          <span key={event.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <span aria-hidden style={{ width: 17, height: 17, borderRadius: '50%', border: `1px solid ${PRODUCT_EVENT_COLOR[event.type]}`, fontSize: 9.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: PRODUCT_EVENT_COLOR[event.type], fontWeight: 600 }}>{`A${order + 1}`}</span>
            {`${PRODUCT_EVENT_LABEL[event.type]} · ${event.label}（W${event.week}，${event.magnitudePct > 0 ? '+' : ''}${event.magnitudePct}%）`}
            <button
              type="button"
              aria-label={`删除小事件 ${event.label}`}
              onClick={() => onRemoveProductEvent(event.id)}
              style={{ border: 'none', background: 'transparent', color: color.mute, fontSize: 11, cursor: 'pointer', padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}
        {manualWeeks.map((week) => (
          <span key={`manual-${week.week}`} title={week.manual?.reason || undefined} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <span aria-hidden style={{ color: color.ink, fontSize: 10 }}>◆</span>
            {`手调 · ${week.week}${week.manual?.reason ? `：${week.manual.reason}` : ''}`}
          </span>
        ))}
        <span title="min(基线 SO, 可售) 回写主图" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <span aria-hidden style={{ width: 17, height: 17, borderRadius: '50%', border: `1px solid ${color.warning}`, background: color.warningSoft, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: color.warningInk }}>修</span>
          {cappedFactWeeks.length ? `库存上限修正 · W${cappedFactWeeks[0].weekNumber} 起` : '当前考量未触发库存上限修正'}
        </span>
      </div>

      {/* 文字替代：逐周数据表（缺数显「—」不当 0；缺数周无微调入口） */}
      <details style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px` }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: color.body, fontWeight: 600 }}>查看预测主图数据表</summary>
        <div style={{ overflowX: 'auto', marginTop: space.sm }}>
          <table className="tnum" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              {ariaLabel}
            </caption>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>周</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>状态</th>
                <th style={thStyle}>周销（台）</th>
                <th style={thStyle}>价格</th>
                <th style={thStyle}>上一代同周龄（台）</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.week}>
                  <td style={{ ...tdStyle, textAlign: 'left', color: color.ink }}><span className="mono">{week.week}</span></td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    {week.status === 'actual' ? '实际' : week.manual != null ? '手调' : week.capped ? '库存上限修正' : '预测'}
                  </td>
                  <td style={{ ...tdStyle, color: color.ink }}>{fmtUnits(week.final)}</td>
                  <td style={tdStyle}>{`$${week.price}`}</td>
                  <td style={tdStyle}>{week.prevGenSales.toLocaleString('en-US')}</td>
                  <td style={tdStyle}>
                    {week.status === 'forecast' && week.final != null ? (
                      <button type="button" onClick={() => onTuneWeek(week.weekNumber)} style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 12, color: color.link, cursor: 'pointer' }}>
                        微调
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** 悬停浮窗：图上只留数据，考量构成用小条表达（正 = 蓝、负 = 红，另有文字）。 */
function WeekTooltip({ week, prevWeek, leftPct, flip }: { week: WorkbenchWeekResult; prevWeek: { sales: number | null } | null; leftPct: number; flip: boolean }) {
  const forecast = week.status === 'forecast';
  const consider = forecast ? week.consider : [];
  const maxPct = Math.max(1, ...consider.map((item) => (item.pct != null ? Math.abs(item.pct) : 0)));
  const wow = !forecast && prevWeek?.sales != null && week.sales != null
    ? `${((week.sales / prevWeek.sales - 1) * 100).toFixed(1)}%`
    : null;
  return (
    <div
      role="status"
      style={{
        position: 'absolute', top: 8, left: `${leftPct}%`,
        transform: flip ? 'translateX(-105%)' : 'translateX(12px)',
        width: 268, zIndex: 5, pointerEvents: 'none',
        background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card,
        boxShadow: '0 1px 1px rgba(0,0,0,.02), 0 2px 2px rgba(0,0,0,.04), inset 0 0 0 1px rgba(0,0,0,.08)',
        padding: `${space.md - 2}px ${space.md}px`, fontSize: 12, lineHeight: 1.6, color: color.body,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: color.mute, marginBottom: 4 }}>
        {week.week} · {week.dateLabel} · {forecast ? '预测' : '实际'}
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        <TipRow label="周销" value={fmtWan(week.final)} />
        <TipRow label="价格" value={`$${week.price}`} />
        <TipRow label="上一代同周龄" value={fmtWan(week.prevGenSales)} />
        {!forecast && wow != null && <TipRow label="周环比" value={wow} />}
        {week.manual?.reason && <TipRow label="手调原因" value={week.manual.reason} />}
      </div>
      {forecast && (
        <div style={{ marginTop: 7, paddingTop: 7, borderTop: `1px solid ${color.hairline}`, display: 'grid', gap: 3 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: color.mute }}>本周考量构成</div>
          {consider.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 96, flex: 'none', fontSize: 11, color: color.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.label}>{item.label}</span>
              {item.pct != null ? (
                <>
                  <span aria-hidden style={{ flex: 1, height: 5, borderRadius: 3, background: color.canvasSoft2, position: 'relative', overflow: 'hidden' }}>
                    <span style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${Math.max(4, (Math.abs(item.pct) / maxPct) * 100)}%`, background: item.pct >= 0 ? color.link : color.error }} />
                  </span>
                  <span className="tnum" style={{ width: 44, flex: 'none', textAlign: 'right', fontWeight: 600, color: item.pct >= 0 ? color.body : color.error }}>
                    {item.pct > 0 ? '+' : item.pct < 0 ? '−' : ''}{Math.abs(item.pct).toFixed(0)}%
                  </span>
                </>
              ) : (
                <span style={{ flex: 1, fontSize: 11, color: color.mute }}>{item.note}</span>
              )}
            </div>
          ))}
          <div style={{ marginTop: 4, paddingTop: 6, borderTop: `1px solid ${color.hairline}`, fontSize: 11, color: color.mute }}>
            点击柱体或按 Enter 微调本周
          </div>
        </div>
      )}
    </div>
  );
}

function TipRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span>{label}</span>
      <b className="tnum" style={{ fontWeight: 600, color: color.ink }}>{value}</b>
    </div>
  );
}
