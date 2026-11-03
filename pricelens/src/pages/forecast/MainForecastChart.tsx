// ============================================================
// 推演工作台 v2 · 层①主图（视觉重心，只露最终结果——纲领：库存刚性砍的
// 中间过程不呈现，仅保留砍周琥珀描边微痕标识）：
// 历史实柱实线（W37–W44 演示实际）+ 预测虚柱虚线（W45–W52）+ 上一代同周龄
// 参考线（灰虚）+ 把握区间帽（柱顶 I 形，窄 = 把握大）+ 库存修正周（琥珀描边）
// + 价格线右轴（实→虚）+ 大促档期背景带 + 今天分界线 + 主图小事件锚点
// （竞品上市蓝 / 营销价促琥珀 / 自家挤兑墨，与参考卡事实同源色系）。
// 手调原因内联标注在主图手调处（小字截断 + hover 全文）。
// 悬停 / 聚焦预测周出「本周考量」构成浮窗；点击或 Enter 打开微调（原因必填）。
// 图例可点击切换系列显隐。数据表（details）提供文字替代。
// ============================================================
import { useState, type CSSProperties } from 'react';
import { brandColor, color, font, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { ProductEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult, WorkbenchWeekResult } from './workbenchModel';
import { WorkbenchLegend, fmtWan, wanOf, type LegendItem } from './WorkbenchBits';

const W = 1180;
const H = 380;
const LEFT = 64;
const RIGHT = 64;
const TOP = 34;
const BOTTOM = 46;
const PLOT_W = W - LEFT - RIGHT;
const PLOT_H = H - TOP - BOTTOM;
const PRICE_MIN = 650;
const PRICE_MAX = 950;
/** 预测周首个下标（W45 = index 8）。 */
const FORECAST_START = 8;

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

const LEGEND_ITEMS: LegendItem[] = [
  { label: '周销 实际', shape: 'rect', color: color.link },
  { label: '周销 预测', shape: 'rectDash', color: color.link },
  { label: '预测 · 库存刚性修正', shape: 'rectAmber', color: color.warning },
  { key: 'price', label: '价格（右轴）', shape: 'line', color: brandColor.HUAWEI },
  { key: 'prevGen', label: '参考 · 上一代同周龄', shape: 'dash', color: color.hairlineStrong },
  { key: 'band', label: '柱顶帽 = 把握区间（窄 = 把握大）', shape: 'dash', color: color.warning },
  { label: '手调标记（内联原因）', shape: 'marker', color: color.warning },
  { label: '小事件锚点（竞品=蓝 / 价促=琥珀 / 挤兑=墨）', shape: 'marker', color: color.link },
];

const thStyle: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: color.mute, textAlign: 'right',
  padding: '5px 8px', borderBottom: `1px solid ${color.hairline}`, whiteSpace: 'nowrap',
};
const tdStyle: CSSProperties = {
  fontSize: 12, color: color.body, textAlign: 'right',
  padding: '4px 8px', borderBottom: `1px solid ${color.hairline}`, whiteSpace: 'nowrap',
};

export default function MainForecastChart({
  fixture,
  params,
  result,
  onTuneWeek,
  onRemoveProductEvent,
}: {
  fixture: WorkbenchFixture;
  params: { productEvents: ProductEventSeed[] };
  result: WorkbenchResult;
  onTuneWeek: (weekNumber: number) => void;
  onRemoveProductEvent: (id: string) => void;
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
  const slot = PLOT_W / weeks.length;
  const x = (index: number): number => LEFT + (index + 0.5) * slot;
  const maxVolume = Math.max(...weeks.flatMap((week) => [week.sales ?? 0, week.final ?? 0, week.prevGenSales]));
  const yMax = Math.max(1, niceCeil(maxVolume * 1.12));
  const y = (value: number): number => TOP + PLOT_H * (1 - value / yMax);
  const yPrice = (value: number): number => TOP + PLOT_H * (1 - (value - PRICE_MIN) / (PRICE_MAX - PRICE_MIN));
  const barW = Math.min(34, slot * 0.55);
  const boundaryX = (x(7) + x(FORECAST_START)) / 2;
  const bandStartX = x(9) - slot / 2 + 2;
  const bandEndX = x(12) + slot / 2 - 2;
  const volumeTicks = [0.25, 0.5, 0.75, 1].map((f) => yMax * f);
  const priceTicks = [700, 800, 900];
  const gridFractions = [0.25, 0.5, 0.75, 1];

  const linePath = (values: Array<number | null | undefined>, from: number, to: number): string => {
    const points = values.slice(from, to + 1)
      .map((value, offset) => ({ value, index: from + offset }))
      .filter((point): point is { value: number; index: number } => point.value != null);
    return points.map((point, offset) => `${offset === 0 ? 'M' : 'L'}${x(point.index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
  };
  const pricePath = (from: number, to: number): string =>
    weeks.slice(from, to + 1)
      .map((week, offset) => `${offset === 0 ? 'M' : 'L'}${x(from + offset).toFixed(1)} ${yPrice(week.price).toFixed(1)}`)
      .join(' ');

  const hoverWeek = hoverIndex != null ? weeks[hoverIndex] : null;
  const cappedWeeks = weeks.filter((week) => week.capped);
  const ariaLabel = `${fixture.context.product} 量价预测主图：历史 ${fixture.context.historyRange} 实柱、预测 ${fixture.context.forecastRange} 虚柱；预测期总销量 ${fmtWan(result.summary.totalSales)}；大促峰 W${result.summary.peak.weekNumber} ${fmtWan(result.summary.peak.value)}；${cappedWeeks.length ? `库存刚性修正 W${cappedWeeks[0].weekNumber} 起` : '未触发库存修正'}；详细数值见下方数据表。`;

  return (
    <div style={{ display: 'grid', gap: space.sm }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ position: 'relative', minWidth: 960 }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={ariaLabel}
            style={{ display: 'block', height: 'auto' }}
          >
            {/* 大促档期背景带 + 今天分界（先画底层） */}
            <rect x={bandStartX} y={TOP - 4} width={bandEndX - bandStartX} height={PLOT_H + 4} fill={color.warningSoft} opacity={0.55} />
            <text x={(bandStartX + bandEndX) / 2} y={TOP + 8} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={color.warningInk}>{fixture.promoBand.label}</text>
            <rect x={boundaryX} y={TOP - 6} width={W - RIGHT - boundaryX} height={PLOT_H + 6} fill={color.canvasSoft2} opacity={0.45} />
            <line x1={boundaryX} x2={boundaryX} y1={TOP - 6} y2={TOP + PLOT_H} stroke={color.hairlineStrong} strokeDasharray="4 4" />
            <text x={boundaryX - 6} y={TOP - 10} textAnchor="end" fontSize={10.5} fill={color.body}>演示实际</text>
            <text x={boundaryX + 6} y={TOP - 10} fontSize={10.5} fill={color.body}>预测 · 向未来</text>
            <text x={boundaryX - 6} y={H - 8} textAnchor="end" fontSize={10} fontWeight={600} fill={color.body}>{`今天 ${fixture.context.todayLabel}`}</text>

            {/* 网格 + 左轴（万台）+ 右轴（$） */}
            <g stroke={color.hairline}>
              {gridFractions.map((fraction) => (
                <line key={fraction} x1={LEFT} y1={TOP + PLOT_H * (1 - fraction)} x2={W - RIGHT} y2={TOP + PLOT_H * (1 - fraction)} />
              ))}
            </g>
            <g fontSize={10} fill={color.mute} textAnchor="end">
              {volumeTicks.map((tick) => (
                <text key={tick} x={LEFT - 8} y={y(tick) + 3}>{wanOf(tick)}</text>
              ))}
            </g>
            <text x={LEFT - 8} y={TOP - 10} fontSize={10} fill={color.mute} textAnchor="end">万台</text>
            <g fontSize={10} fill={color.mute} textAnchor="start">
              {priceTicks.map((tick) => (
                <text key={tick} x={W - RIGHT + 8} y={yPrice(tick) + 3}>{`$${tick}`}</text>
              ))}
            </g>

            {/* 上一代同周龄参考线（灰虚，按周龄对齐；W45 起为已发生历史映射） */}
            {show('prevGen') && (
              <path d={linePath(weeks.map((week) => week.prevGenSales), 0, weeks.length - 1)} fill="none" stroke={color.hairlineStrong} strokeWidth={1.5} strokeDasharray="5 4" />
            )}

            {/* 周销柱：历史实柱（浅蓝）/ 预测虚柱（描边；库存刚性修正周琥珀描边微痕） */}
            {weeks.map((week, index) => {
              const value = week.final;
              if (value == null) return null;
              const forecast = week.status === 'forecast';
              const adjusted = week.capped;
              return (
                <rect
                  key={`bar-${week.week}`}
                  x={x(index) - barW / 2}
                  y={y(value)}
                  width={barW}
                  height={Math.max(0, TOP + PLOT_H - y(value))}
                  rx={2}
                  fill={forecast ? color.canvas : color.link}
                  fillOpacity={forecast ? 1 : 0.16}
                  stroke={forecast ? (adjusted ? color.warning : color.link) : 'none'}
                  strokeWidth={forecast ? 1.4 : 0}
                  strokeDasharray={forecast ? '4 3' : undefined}
                >
                  <title>{`${week.week}（${week.dateLabel}）${week.status === 'actual' ? '演示实际' : '预测'} 周销 ${fmtWan(value)}${adjusted ? ' · 按可售修正' : ''}${week.manual ? ` · 手调：${week.manual.reason}` : ''} · 价格 $${week.price}`}</title>
                </rect>
              );
            })}

            {/* 主品周销线：历史实线 / 预测虚线 */}
            <path d={linePath(weeks.map((week) => week.sales), 0, 7)} fill="none" stroke={color.ink} strokeWidth={1.4} />
            <path d={linePath(weeks.map((week) => week.final), FORECAST_START, weeks.length - 1)} fill="none" stroke={color.ink} strokeWidth={1.4} strokeDasharray="5 4" />

            {/* 价格线右轴：实 → 虚（主品最粗线） */}
            {show('price') && (
              <>
                <path d={pricePath(0, 7)} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2.4} />
                <path d={pricePath(FORECAST_START, weeks.length - 1)} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2.2} strokeDasharray="6 5" />
              </>
            )}

            {/* 把握区间帽：修正周 ±2%（琥珀·窄，把握度大）/ 其余 ±8%（蓝·中） */}
            {show('band') && weeks.map((week, index) => {
              if (week.status !== 'forecast' || week.final == null) return null;
              const bandPct = week.capped ? 0.02 : 0.08;
              const cx = x(index);
              const y1 = y(week.final * (1 - bandPct));
              const y2 = y(week.final * (1 + bandPct));
              const stroke = week.capped ? color.warning : color.link;
              return (
                <g key={`band-${week.week}`} stroke={stroke} strokeWidth={1.3}>
                  <line x1={cx} y1={y1} x2={cx} y2={y2} />
                  <line x1={cx - 4} y1={y1} x2={cx + 4} y2={y1} />
                  <line x1={cx - 4} y1={y2} x2={cx + 4} y2={y2} />
                </g>
              );
            })}

            {/* 手调标记（琥珀菱形）+ 原因内联小字（纲领：原因标注内联在主图手调处） */}
            {weeks.map((week, index) => {
              if (week.manual == null || week.final == null) return null;
              const cx = x(index);
              const cy = y(week.final) - 14;
              const reason = week.manual.reason;
              const short = reason.length > 12 ? `${reason.slice(0, 12)}…` : reason;
              return (
                <g key={`manual-${week.week}`}>
                  <path d={`M${cx} ${cy - 5} l5 5 l-5 5 l-5 -5 Z`} fill={color.warning} stroke={color.canvas} strokeWidth={1.2}>
                    <title>{`手调：${reason}`}</title>
                  </path>
                  <text x={cx} y={cy - 10} textAnchor="middle" fontSize={9} fill={color.warningInk}>
                    {short}
                    <title>{reason}</title>
                  </text>
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
                  <line x1={cx} y1={TOP - 4} x2={cx} y2={TOP + PLOT_H} stroke={tone} strokeDasharray="3 4" opacity={0.55} />
                  <circle cx={cx} cy={TOP + 6} r={8.5} fill={color.canvas} stroke={tone} strokeWidth={1.4} />
                  <text x={cx} y={TOP + 9.5} textAnchor="middle" fontSize={10} fill={tone} fontWeight={600}>{`A${order + 1}`}</text>
                  <title>{`${PRODUCT_EVENT_LABEL[event.type]} · ${event.label}（W${event.week}，${event.magnitudePct > 0 ? '+' : ''}${event.magnitudePct}%）`}</title>
                </g>
              );
            })}

            {/* 锚点：调价 / 档期（编号 + 图下名录） */}
            {fixture.anchors.map((anchor, order) => {
              const index = weeks.findIndex((week) => week.weekNumber === anchor.week);
              if (index < 0) return null;
              const cx = x(index);
              return (
                <g key={anchor.week}>
                  <line x1={cx} y1={TOP - 4} x2={cx} y2={TOP + PLOT_H} stroke={color.hairlineStrong} strokeDasharray="3 4" opacity={0.8} />
                  <circle cx={cx} cy={TOP + 6} r={8.5} fill={color.canvas} stroke={color.hairlineStrong} />
                  <text x={cx} y={TOP + 9.5} textAnchor="middle" fontSize={10} fill={color.body}>{order + 1}</text>
                </g>
              );
            })}

            {/* 横轴周标签（等宽技术标识） */}
            <g fontSize={10} fill={color.mute} textAnchor="middle" fontFamily={font.mono}>
              {weeks.map((week, index) => (index % 2 === 0 || index === weeks.length - 1
                ? <text key={week.week} x={x(index)} y={H - 24}>{week.week}</text>
                : null))}
            </g>

            {/* 命中区：悬停读数；预测周可聚焦 / 点击微调 */}
            {weeks.map((week, index) => {
              const forecast = week.status === 'forecast';
              return (
                <rect
                  key={`hit-${week.week}`}
                  x={x(index) - slot / 2}
                  y={TOP}
                  width={slot}
                  height={PLOT_H}
                  fill="transparent"
                  style={{ cursor: forecast ? 'pointer' : 'default' }}
                  tabIndex={forecast ? 0 : -1}
                  role={forecast ? 'button' : undefined}
                  aria-label={forecast ? `微调 ${week.week} 预测销量，当前 ${fmtWan(week.final)}` : undefined}
                  onMouseEnter={() => setHoverIndex(index)}
                  onMouseLeave={() => setHoverIndex((prev) => (prev === index ? null : prev))}
                  onFocus={() => setHoverIndex(index)}
                  onBlur={() => setHoverIndex((prev) => (prev === index ? null : prev))}
                  onClick={() => forecast && onTuneWeek(week.weekNumber)}
                  onKeyDown={(event) => {
                    if (!forecast) return;
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
          {hoverWeek && (
            <WeekTooltip week={hoverWeek} prevWeek={hoverIndex != null && hoverIndex > 0 ? weeks[hoverIndex - 1] : null} leftPct={(x(hoverIndex as number) / W) * 100} flip={(hoverIndex as number) > 9} />
          )}
        </div>
      </div>

      <WorkbenchLegend items={LEGEND_ITEMS} hidden={hidden} onToggle={toggle} />

      {/* 图下事件行：锚点名录 + 小事件名录（可删）+ 库存修正状态 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12, color: color.body }}>
        {fixture.anchors.map((anchor, order) => (
          <span key={anchor.week} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <span aria-hidden style={{ width: 17, height: 17, borderRadius: '50%', border: `1px solid ${color.hairlineStrong}`, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: color.body }}>{order + 1}</span>
            {anchor.label}
          </span>
        ))}
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
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <span aria-hidden style={{ width: 17, height: 17, borderRadius: '50%', border: `1px solid ${color.warning}`, background: color.warningSoft, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: color.warningInk }}>砍</span>
          {cappedWeeks.length ? `库存刚性修正 · W${cappedWeeks[0].weekNumber} 起（min(基线 SO, 可售) 回写主图）` : '当前考量未触发库存修正'}
        </span>
      </div>

      {/* 文字替代：逐周数据表（预测周带微调键盘入口） */}
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
                <th style={{ ...thStyle, textAlign: 'left' }}>把握度</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.week}>
                  <td style={{ ...tdStyle, textAlign: 'left', color: color.ink }}><span className="mono">{week.week}</span></td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    {week.status === 'actual' ? '演示实际' : week.manual != null ? '手调' : week.capped ? '库存刚性修正' : '预测'}
                  </td>
                  <td style={{ ...tdStyle, color: color.ink }}>{(week.final ?? 0).toLocaleString('en-US')}</td>
                  <td style={tdStyle}>{`$${week.price}`}</td>
                  <td style={tdStyle}>{week.prevGenSales.toLocaleString('en-US')}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    {week.status === 'actual' ? '—' : `${week.capped ? '±2%（把握度大）' : '±8%（把握度中）'}`}
                  </td>
                  <td style={tdStyle}>
                    {week.status === 'forecast' ? (
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
        {week.week} · {week.dateLabel} · {forecast ? '预测' : '演示实际'}
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        <TipRow label="周销" value={fmtWan(week.final)} />
        <TipRow label="价格" value={`$${week.price}`} />
        <TipRow label="上一代同周龄" value={fmtWan(week.prevGenSales)} />
        {forecast && <TipRow label="把握度" value={week.capped ? '±2%（把握度大）' : '±8%（把握度中）'} />}
        {!forecast && wow != null && <TipRow label="周环比" value={wow} />}
        {week.manual != null && <TipRow label="手调原因" value={week.manual.reason} />}
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
            点击柱体或按 Enter 微调本周（需填原因）
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
