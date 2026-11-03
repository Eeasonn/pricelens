// ============================================================
// 推演工作台 v2 · 层④库存验证（带预测的因子卡，最后一步）：
// 左轴渠道 DOS（蓝实→虚）+ 全流程 DOS（灰虚）双线、右轴渠道库存柱（万台）+ SI ▼；
// 历史段实 / 预测段虚（预测段 = 上游基线 SO + SI 月计划推演）。
// SI 按月给入 = 唯一明确人工输入；健康判定（DOS 70–90 天 + 库存降幅 20%/30%，
// 预警解释，阈值未核定）→ 可售不足的预测周按可售量修正（min(基线 SO, 可售)，
// 公式收 title）回写主图，修正周琥珀描边微痕；微痕读 supplyCapped（截断事实，
// 手调不覆盖），capped 只表当前显示。输出只讲结果。
// ============================================================
import { useState } from 'react';
import { InputNumber } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchParams, WorkbenchResult, WorkbenchWeekResult } from './workbenchModel';
import { DOS_BAND, INV_CRASH_HEAVY_PCT, INV_CRASH_LIGHT_PCT } from './workbenchModel';
import { CertaintyBadge, IoBar, SectionHead, SimChip, WorkbenchLegend, fmtWan, wanOf, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

const W = 640;
const H = 250;
const LEFT = 40;
const RIGHT = 52;
const TOP = 14;
const BOTTOM = 26;
const PLOT_W = W - LEFT - RIGHT;
const PLOT_H = H - TOP - BOTTOM;
const FORECAST_START = 8;

/** 库存上限修正公式（收 title，不进正文）。 */
const MIN_FORMULA_TITLE = '库存上限修正：min(基线 SO, 可售)；可售 = 期初库存 + SI 补货';

/**
 * 修正周判定（读该周自己的 health 行结构化字段，不共用首周原因；输出只讲结果）：
 * 本周 DOS / 库存降幅 → 可售不足时按可售量修正读数（人工手调周保留手调事实）。
 */
function verdictLine(week: WorkbenchWeekResult): string {
  const health = week.health;
  const parts: string[] = [];
  if (health) {
    parts.push(health.dosOk
      ? `DOS ${health.channelDos.toFixed(1)} 天在合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天内`
      : `DOS ${health.channelDos.toFixed(1)} 天越出合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天`);
    parts.push(health.crash === 'none'
      ? `库存较前 4 周均值 ${health.invChangePct > 0 ? '+' : ''}${health.invChangePct}%`
      : `库存较前 4 周均值下降 ${Math.abs(health.invChangePct).toFixed(1)}%（≥${health.crash === 'heavy' ? INV_CRASH_HEAVY_PCT : INV_CRASH_LIGHT_PCT}%）`);
  }
  const result = week.manual != null
    ? `可售不足，主图当前按人工手调 ${fmtWan(week.manual.value)} 显示`
    : `可售不足，按可售量修正至 ${fmtWan(week.final ?? 0)}`;
  return `${week.week} ${parts.join('；')} → ${result}`;
}

/** 轻量状态 chip（文字承载语义）：库存可支撑 / 阈值未核定。 */
function StateChip({ label, title }: { label: string; title: string }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill,
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
        background: color.canvasSoft2, color: color.mute,
      }}
    >
      {label}
    </span>
  );
}

export default function InventoryValidationCard({
  fixture,
  params,
  result,
  onSiMonthLive,
  onSiMonthCommit,
}: {
  fixture: WorkbenchFixture;
  params: WorkbenchParams;
  result: WorkbenchResult;
  onSiMonthLive: (monthKey: string, units: number) => void;
  /** 可选落库口（WP6 8.2 Step 4）：本轮 SI 只进本地草稿、不写真实数据，
   *  页面不再传假提交回调（onSiMonthCommit={() => {}} 已移除）。 */
  onSiMonthCommit?: (monthKey: string, units: number) => void;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const show = (key: string): boolean => !hidden.has(key);
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const weeks = result.weeks;
  const forecastWeeks = weeks.filter((week) => week.status === 'forecast');
  const slot = PLOT_W / weeks.length;
  const barW = Math.min(24, slot * 0.46);
  const x = (index: number): number => LEFT + (index + 0.5) * slot;
  const dosMax = Math.max(
    niceCeil(Math.max(...weeks.flatMap((week) => [week.channelDos, week.fullDos]))),
    DOS_BAND.max + 1,
  );
  const invMax = Math.max(1, niceCeil(Math.max(...weeks.map((week) => week.channelInv))));
  const yDos = (value: number): number => TOP + PLOT_H * (1 - value / dosMax);
  const yInv = (value: number): number => TOP + PLOT_H * (1 - value / invMax);
  const dosLine = (key: 'channelDos' | 'fullDos', from: number, to: number): string =>
    weeks.slice(from, to + 1)
      .map((week, offset) => `${offset === 0 ? 'M' : 'L'}${x(from + offset).toFixed(1)} ${yDos(week[key]).toFixed(1)}`)
      .join(' ');
  const boundaryX = (x(7) + x(FORECAST_START)) / 2;
  // 微痕读 supplyCapped（截断事实，手调不覆盖）；capped 只表当前是否按库存值显示。
  const cappedWeeks = forecastWeeks.filter((week) => week.supplyCapped);

  const legendItems: LegendItem[] = [
    { key: 'inv', label: '渠道库存（右轴）', shape: 'rect', color: color.ink },
    { key: 'chdos', label: '渠道 DOS', shape: 'line', color: color.link },
    { key: 'fulldos', label: '全流程 DOS', shape: 'dash', color: color.hairlineStrong },
    { key: 'si', label: 'SI ▼', shape: 'marker', color: color.link },
  ];

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="库存验证"
        hint="左轴 DOS（渠道蓝实→虚 / 全流程灰虚）、右轴渠道库存柱（万台）+ SI ▼；预测段 = 上游基线 SO + SI 月计划推演。健康判定（预警解释）→ 可售不足的预测周按可售量修正并回写主图，修正周琥珀描边标识。"
        extra={<>
          <SimChip title="库存推演为演示样本：SI 计划仅存本地草稿，不写真实数据" />
          {cappedWeeks.length > 0
            ? <CertaintyBadge level="high" />
            : <StateChip label="库存可支撑" title="当前库存推演可支撑基线 SO：未触发库存上限修正" />}
        </>}
      />
      <IoBar
        input="SI 月计划（唯一人工输入）· 上游基线 SO（大盘+量价考量）· 期初渠道库存"
        output={`未来 DOS / 库存反算与健康判定；可售不足周按可售量修正回写主图（${cappedWeeks.length ? `W${cappedWeeks[0].weekNumber} 起` : '当前未触发'}）`}
      />
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`库存验证：渠道库存柱（右轴，万台）、渠道 DOS 与全流程 DOS 双线（左轴，合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天）；${cappedWeeks.length ? `W${cappedWeeks[0].weekNumber} 起库存上限修正（按可售量修正回写主图，修正周琥珀描边）` : '当前库存可支撑基线 SO，未触发修正'}。详细判定见下方输出框。`}
          style={{ display: 'block', height: 'auto', minWidth: 460 }}
        >
          {/* 预测段浅底 + 今天分界 */}
          <rect x={boundaryX} y={TOP - 4} width={W - RIGHT - boundaryX} height={PLOT_H + 4} fill={color.canvasSoft2} opacity={0.5} />
          <line x1={boundaryX} y1={TOP - 4} x2={boundaryX} y2={TOP + PLOT_H} stroke={color.hairlineStrong} strokeDasharray="4 4" />
          <text x={boundaryX + 4} y={TOP + 8} fontSize={10} fill={color.body}>预测 / 计划</text>
          {/* 网格 + 左轴（天）+ 右轴（万台） */}
          {[0, 0.5, 1].map((fraction) => {
            const gy = TOP + PLOT_H * (1 - fraction);
            return (
              <g key={fraction}>
                <line x1={LEFT} y1={gy} x2={W - RIGHT} y2={gy} stroke={fraction === 0 ? color.hairlineStrong : color.hairline} />
                <text x={LEFT - 6} y={gy + 3.5} fontSize={10} fill={color.mute} textAnchor="end">{Math.round(dosMax * fraction)}</text>
              </g>
            );
          })}
          <text x={LEFT - 6} y={TOP - 3} fontSize={10} fill={color.mute} textAnchor="end">天</text>
          {[0, 0.5, 1].map((fraction) => (
            <text key={fraction} x={W - RIGHT + 6} y={yInv(invMax * fraction) + 3.5} fontSize={10} fill={color.mute}>{wanOf(invMax * fraction)}</text>
          ))}
          <text x={W - RIGHT + 6} y={TOP - 3} fontSize={10} fill={color.mute}>万台</text>
          {/* DOS 合理带 70–90 天（mute 虚线 + 浅带） */}
          <rect x={LEFT} y={yDos(DOS_BAND.max)} width={PLOT_W} height={Math.max(0, yDos(DOS_BAND.min) - yDos(DOS_BAND.max))} fill={color.canvasSoft2} opacity={0.6} />
          {[DOS_BAND.min, DOS_BAND.max].map((days) => (
            <g key={days}>
              <line x1={LEFT} y1={yDos(days)} x2={W - RIGHT} y2={yDos(days)} stroke={color.mute} strokeWidth={1} strokeDasharray="3 4" opacity={0.7} />
              <text x={W - RIGHT - 2} y={yDos(days) - 3} textAnchor="end" fontSize={9.5} fill={color.mute}>{`${days} 天`}</text>
            </g>
          ))}
          {/* X 周标签 */}
          {weeks.map((week, index) => (index % 4 === 0 || index === weeks.length - 1
            ? <text key={week.week} x={x(index)} y={H - 8} textAnchor="middle" fontSize={10} fill={color.mute}>{week.week}</text>
            : null))}
          {/* 渠道库存柱：历史实（中性墨）/ 预测虚柱 */}
          {show('inv') && weeks.map((week, index) => {
            const forecast = index >= FORECAST_START;
            return (
              <rect
                key={`inv-${week.week}`}
                x={x(index) - barW / 2}
                y={yInv(week.channelInv)}
                width={barW}
                height={Math.max(1, TOP + PLOT_H - yInv(week.channelInv))}
                rx={2}
                fill={forecast ? color.canvas : color.ink}
                fillOpacity={forecast ? 1 : 0.14}
                stroke={forecast ? color.ink : color.hairline}
                strokeOpacity={forecast ? 0.5 : 1}
                strokeWidth={1}
                strokeDasharray={forecast ? '4 3' : undefined}
              >
                <title>{`${week.week} 渠道库存 ${fmtWan(week.channelInv)} · 渠道 DOS ${week.channelDos} 天 · 全流程 DOS ${week.fullDos} 天${week.si > 0 ? ` · SI ${fmtWan(week.si)}` : ''}`}</title>
              </rect>
            );
          })}
          {/* SI 补货 ▼：历史墨 / 计划蓝 */}
          {show('si') && weeks.map((week, index) => {
            if (week.si <= 0) return null;
            const forecast = index >= FORECAST_START;
            const px = x(index);
            const py = yInv(week.channelInv) - 8;
            return (
              <path key={`si-${week.week}`} d={`M${px - 4} ${py - 6} L${px + 4} ${py - 6} L${px} ${py} Z`} fill={forecast ? color.link : color.ink}>
                <title>{`${forecast ? 'SI 计划' : 'SI 补货'} ${fmtWan(week.si)}`}</title>
              </path>
            );
          })}
          {/* DOS 双线：历史实 / 预测虚 */}
          {show('fulldos') && (
            <path d={dosLine('fullDos', 0, weeks.length - 1)} fill="none" stroke={color.hairlineStrong} strokeWidth={1.5} strokeDasharray="5 4" />
          )}
          {show('chdos') && (
            <>
              <path d={dosLine('channelDos', 0, 7)} fill="none" stroke={color.link} strokeWidth={2.2} />
              <path d={dosLine('channelDos', FORECAST_START, weeks.length - 1)} fill="none" stroke={color.link} strokeWidth={2.2} strokeDasharray="5 4" />
            </>
          )}
          {/* 修正起点（微痕读 supplyCapped，随截断事实变化；未触发不画固定标记） */}
          {result.firstAdjustedWeek != null && (() => {
            const index = weeks.findIndex((week) => week.weekNumber === result.firstAdjustedWeek);
            if (index < 0) return null;
            const px = x(index);
            return (
              <g>
                <line x1={px} y1={TOP} x2={px} y2={TOP + PLOT_H} stroke={color.warning} strokeDasharray="3 4" opacity={0.7} />
                <text x={px + 4} y={TOP + 20} fontSize={9.5} fontWeight={600} fill={color.warningInk}>{`W${result.firstAdjustedWeek} 起修正`}</text>
              </g>
            );
          })()}
        </svg>
      </div>
      <WorkbenchLegend items={legendItems} hidden={hidden} onToggle={toggle} style={{ marginTop: 0 }} />

      {/* 人工 SI 月计划输入（本层唯一新输入；月内均分到周，改后全链重算） */}
      <div style={{ marginTop: space.sm, display: 'grid', gap: space.xs }}>
        <div style={{ fontSize: 12, color: color.body }}>
          <span style={{ fontWeight: 600, color: color.ink }}>人工 SI 计划（按月）</span>
          <span style={{ marginLeft: 8, fontSize: 11, color: color.mute }}>千台/月 · 唯一明确人工输入，月内均分到周；调整后全链重算</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md }}>
          {fixture.forecastMonths.map((month) => (
            <label key={month.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
              <span style={{ fontWeight: 600 }}>{month.label}</span>
              <InputNumber
                aria-label={`${month.label} SI 计划（千台/月）`}
                min={0}
                max={2000}
                step={10}
                precision={0}
                value={Math.round((params.siPlanMonthly[month.key] ?? 0) / 1000)}
                onChange={(value) => {
                  if (value == null) return;
                  onSiMonthLive(month.key, Math.max(0, Number(value)) * 1000);
                }}
                onBlur={(event) => {
                  const raw = Number(event.target.value);
                  if (Number.isFinite(raw)) onSiMonthCommit?.(month.key, Math.max(0, raw) * 1000);
                }}
                onPressEnter={(event) => (event.target as HTMLInputElement).blur()}
                size="small"
                style={{ width: 84 }}
              />
              <span style={{ fontSize: 11, color: color.mute }}>千台</span>
            </label>
          ))}
        </div>
      </div>

      {/* 输出框：健康判定（预警解释）+ 库存上限修正（结论级，只讲结果） */}
      <div style={{ marginTop: space.md, padding: `${space.md - 2}px ${space.md}px`, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft, display: 'grid', gap: 6, fontSize: 12, lineHeight: 1.7, color: color.body }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ flex: 'none', fontWeight: 600, color: color.body }}>输出</span>
          <span>
            {cappedWeeks.length
              ? <><b style={{ color: color.warningInk }}>{`W${cappedWeeks[0].weekNumber} 起可售不足`}</b>，按可售量修正并回写主图（修正周琥珀描边标识）</>
              : '当前考量未触发库存修正（库存可支撑基线 SO），主图预测柱不受影响'}
          </span>
        </div>
        {cappedWeeks.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flex: 'none', fontWeight: 600, color: color.body }} title={MIN_FORMULA_TITLE}>判定</span>
            <span style={{ display: 'grid', gap: 2 }}>
              {cappedWeeks.map((week) => (
                <span key={week.week} className="tnum">{verdictLine(week)}</span>
              ))}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 'none', fontWeight: 600, color: color.body }}>规则</span>
          <span title={MIN_FORMULA_TITLE}>{`DOS ${DOS_BAND.min}–${DOS_BAND.max} 天 · 降幅预警 ${INV_CRASH_LIGHT_PCT}%／${INV_CRASH_HEAVY_PCT}%`}</span>
          <StateChip label="阈值未核定" title="DOS 合理带与库存降幅预警阈值尚未获业务核定" />
        </div>
      </div>
    </section>
  );
}
