// ============================================================
// 推演工作台 v2 · 层④库存验证（带预测的因子卡，最后一步）：
// 左轴渠道 DOS（蓝实→虚）+ 全流程 DOS（灰虚）双线、右轴渠道库存柱 + SI ▼；
// 历史段实 / 预测段虚（预测段 = 上游基线 SO + SI 月计划推演）。
// SI 按月给入 = 唯一明确人工输入；健康判定（DOS 70–90 天 + 库存降幅 <20–30%，
// 预警解释）→ 不健康 / 库存不足则刚性砍 min(基线 SO, 可售) 回写主图
// （纲领：中间计算过程不呈现，主图只显最终 + 砍周琥珀描边微痕）。
// ============================================================
import { useState } from 'react';
import { InputNumber } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import { fmtVolume } from '../volume/volumeAxis';
import type { WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchParams, WorkbenchResult } from './workbenchModel';
import { DOS_BAND, INV_CRASH_HEAVY_PCT, INV_CRASH_LIGHT_PCT } from './workbenchModel';
import { CertaintyBadge, IoBar, SectionHead, WorkbenchLegend, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

const W = 640;
const H = 250;
const LEFT = 40;
const RIGHT = 52;
const TOP = 14;
const BOTTOM = 26;
const PLOT_W = W - LEFT - RIGHT;
const PLOT_H = H - TOP - BOTTOM;
const FORECAST_START = 8;

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
  onSiMonthCommit: (monthKey: string, units: number) => void;
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
  const cappedWeeks = forecastWeeks.filter((week) => week.capped);

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
        hint="左轴 DOS（渠道蓝实→虚 / 全流程灰虚）、右轴渠道库存柱 + SI ▼；预测段 = 上游基线 SO + SI 月计划推演。健康判定（预警解释）→ 不健康或库存不足则刚性砍 min(基线 SO, 可售) 回写主图——中间计算过程不呈现，主图只显最终。"
        extra={<CertaintyBadge level="high" />}
      />
      <IoBar
        input="SI 月计划（唯一人工输入）· 上游基线 SO（大盘+量价考量）· 期初渠道库存"
        output={`未来 DOS / 库存反算与健康判定；不健康周刚性砍回写主图（${cappedWeeks.length ? `W${cappedWeeks[0].weekNumber} 起` : '当前未触发'}）`}
      />
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`库存验证：渠道库存柱（右轴）、渠道 DOS 与全流程 DOS 双线（左轴，合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天）；${cappedWeeks.length ? `W${cappedWeeks[0].weekNumber} 起刚性修正（min(基线 SO, 可售)，回写主图）` : '当前考量未触发库存修正'}。详细判定见下方输出框。`}
          style={{ display: 'block', height: 'auto', minWidth: 460 }}
        >
          {/* 预测段浅底 + 今天分界 */}
          <rect x={boundaryX} y={TOP - 4} width={W - RIGHT - boundaryX} height={PLOT_H + 4} fill={color.canvasSoft2} opacity={0.5} />
          <line x1={boundaryX} y1={TOP - 4} x2={boundaryX} y2={TOP + PLOT_H} stroke={color.hairlineStrong} strokeDasharray="4 4" />
          <text x={boundaryX + 4} y={TOP + 8} fontSize={10} fill={color.body}>预测 / 计划</text>
          {/* 网格 + 左轴（天）+ 右轴（库存台） */}
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
            <text key={fraction} x={W - RIGHT + 6} y={yInv(invMax * fraction) + 3.5} fontSize={10} fill={color.mute}>{fmtVolume(invMax * fraction)}</text>
          ))}
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
                <title>{`${week.week} 渠道库存 ${Math.round(week.channelInv).toLocaleString('en-US')} 台 · 渠道 DOS ${week.channelDos} 天 · 全流程 DOS ${week.fullDos} 天${week.si > 0 ? ` · SI ${Math.round(week.si).toLocaleString('en-US')} 台` : ''}`}</title>
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
                <title>{`${forecast ? 'SI 计划' : 'SI 补货'} ${Math.round(week.si).toLocaleString('en-US')} 台`}</title>
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
          {/* 修正起点（随当前考量变化；未触发不画固定标记） */}
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
                  if (Number.isFinite(raw)) onSiMonthCommit(month.key, Math.max(0, raw) * 1000);
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

      {/* 输出框：健康判定（预警解释）+ 刚性砍回写（结论级，中间过程不呈现） */}
      <div style={{ marginTop: space.md, padding: `${space.md - 2}px ${space.md}px`, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft, display: 'grid', gap: 6, fontSize: 12, lineHeight: 1.7, color: color.body }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ flex: 'none', fontWeight: 600, color: color.body }}>输出</span>
          <span>
            {cappedWeeks.length
              ? <><b style={{ color: color.warningInk }}>{`W${cappedWeeks[0].weekNumber} 起库存不足以支撑基线 SO`}</b>，刚性修正至可售量并回写主图（主图只显最终值，砍周琥珀描边标识）</>
              : '当前考量未触发库存修正（库存可支撑基线 SO），主图预测柱不受影响'}
          </span>
        </div>
        {cappedWeeks.length > 0 && (
          <div className="tnum" style={{ display: 'flex', gap: 8 }}>
            <span style={{ flex: 'none', fontWeight: 600, color: color.body }}>判定</span>
            <span>
              {cappedWeeks.map((week) => `${week.week} 修正至 ${fmtVolume(week.final ?? 0)} 台`).join(' · ')}
              ；{cappedWeeks[0].health?.reasonText}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ flex: 'none', fontWeight: 600, color: color.body }}>规则</span>
          <span>{`演示规则（待拍板）：DOS 合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天；库存较前 4 周均值降幅 ≥${INV_CRASH_LIGHT_PCT}% 预警，≥${INV_CRASH_HEAVY_PCT}% 重警；库存不足 → 刚性砍 min(基线 SO, 可售)，不按比例打折`}</span>
        </div>
      </div>
    </section>
  );
}
