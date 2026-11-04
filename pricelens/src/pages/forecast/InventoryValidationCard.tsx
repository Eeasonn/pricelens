// ============================================================
// 推演工作台 v2 · 层④库存验证（带预测的因子卡，最后一步）：
// 卡头下加「链路指示条」（纯展示，贴 IoBar 视觉语言）把定序表达成
// 五节点：主图基线 SO → 反算 DOS/库存 → 健康判定 → 上限修正 → 回写主图；
// 触发修正周时「上限修正」琥珀点亮注「W{n} 起」、「回写主图」点亮；
// 未触发则末节点灰化注「未触发」。
// 2026-11-04 三方评审图面精简（只留「库存柱 + 渠道 DOS」）：
// 右轴渠道库存柱（万台）+ 左轴渠道 DOS（蓝实→虚）单线；删全流程 DOS 线
//（仅作考量因素，数值收进库存柱悬停提示）、删 SI ▼ 小三角、删 DOS 50
// 参考格线（左轴只标 0 与上限）。SI 不上图：改卡头格子按月输入（唯一
// 人工输入；SI 够高 → 库存柱自然高，从 DOS 反推可见）。
// 2026-11-04 清洁第二轮：删 DOS 70–90 天健康带（底衬 rect + 两条边界虚线 +
// 「70 天 / 90 天」边界标注 + aria 里的合理带描述）——图上只剩库存柱 +
// 渠道 DOS 线 + 轴刻度；左轴定标随之改回纯数据派生（不再为健康带保底
// DOS_BAND.max + 1）。健康判定规则本身不动（DOS 合理带阈值仍是判定口径，
// 收在输出框规则行 / 判定行与链路条 title，不上图）。
// 历史段实 / 预测段虚（预测段 = 上游基线 SO + SI 月计划推演）。
// SI 按月给入 = 唯一明确人工输入；健康判定（DOS 70–90 天 + 库存降幅 20%/30%，
// 预警解释，阈值未核定）→ 可售不足的预测周按可售量修正（min(基线 SO, 可售)，
// 公式收 title）回写主图，修正周琥珀描边微痕；微痕读 supplyCapped（截断事实，
// 手调不覆盖），capped 只表当前显示。输出只讲结果。安全库存区间（两条可配置
// 虚线）按评审「暂不默认展示」后置，本轮不实现。修正段徽标随评审 1b（置信
// 区间提示不必要）改中性「修正段 · 波动参考 ±2%」chip，不再用「把握」话术。
// 图形几何（A3 尺寸对齐）：viewBox 1000×210（原 640×250）——宽幅比与大盘卡
// 半栏图（520×224）一致，满宽渲染高 ≈ 大盘卡图（1440 下 282 vs 284px），
// 字号 / 线宽渲染比例同步回到 1.34（原 2.1 过大）。
// ============================================================
import { Fragment, useState } from 'react';
import type { CSSProperties } from 'react';
import { InputNumber } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchParams, WorkbenchResult, WorkbenchWeekResult } from './workbenchModel';
import { DOS_BAND, INV_CRASH_HEAVY_PCT, INV_CRASH_LIGHT_PCT } from './workbenchModel';
import { IoBar, SectionHead, SimChip, WorkbenchLegend, fmtWan, wanOf, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

// 2026-11-04 视觉一致性：viewBox 宽度对齐左列实际渲染宽度（≈720，缩放比 ≈1，
// 文字回归真实 px——旧 1000 宽被压到 0.6 倍导致轴字体过小）；图高与全站 ≈252px 对齐。
const W = 720;
const H = 252;
const LEFT = 40;
const RIGHT = 52;
const TOP = 14;
const BOTTOM = 26;
const PLOT_W = W - LEFT - RIGHT;
const PLOT_H = H - TOP - BOTTOM;
const FORECAST_START = 8;

/** 库存上限修正公式（收 title，不进正文）。 */
const MIN_FORMULA_TITLE = '库存上限修正：min(基线 SO, 可售)；可售 = 期初库存 + SI 补货';

// ------------------------------------------------------------
// 链路指示条（纯展示，卡内实现；与成本卡同一形态）：贴 IoBar 的
// 小 chip + → 分隔语言，节点状态「文字 + 底色」双通道；琥珀只用于
// 库存修正语义（PRODUCT.md：amber = 档期 / 库存修正 / 预警）。
// ------------------------------------------------------------
type FlowStepState = 'base' | 'active' | 'amber' | 'muted';

interface FlowStep {
  label: string;
  /** 节点前分隔符（默认 →；「+」表并列输入）。 */
  join?: string;
  /** 节点补充注记（如 W50 起 / 未触发 / 不回写主图）。 */
  note?: string;
  /** 口径 / 公式收 title，不进正文。 */
  title?: string;
  state?: FlowStepState;
}

const FLOW_STEP_STYLE: Record<FlowStepState, CSSProperties> = {
  base: { background: color.canvas, border: `1px solid ${color.hairline}`, color: color.body },
  active: { background: color.ink, border: `1px solid ${color.ink}`, color: color.onPrimary },
  amber: { background: color.warningSoft, border: `1px solid ${color.warning}`, color: color.warningInk },
  muted: { background: color.canvasSoft2, border: `1px solid ${color.hairline}`, color: color.mute },
};

function FlowBar({ ariaLabel, steps }: { ariaLabel: string; steps: FlowStep[] }) {
  return (
    <div
      data-flow-bar=""
      aria-label={ariaLabel}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', marginBottom: space.sm }}
    >
      {steps.map((step, index) => {
        const state = step.state ?? 'base';
        return (
          <Fragment key={step.label}>
            {index > 0 && (
              <span aria-hidden style={{ color: color.hairlineStrong, fontSize: 11 }}>{step.join ?? '→'}</span>
            )}
            <span
              data-flow-step={step.label}
              data-state={state}
              title={step.title}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px',
                borderRadius: radius.control, fontSize: 11, whiteSpace: 'nowrap',
                fontWeight: state === 'base' ? 400 : 600,
                ...FLOW_STEP_STYLE[state],
              }}
            >
              <span aria-hidden style={{ fontSize: 10, fontWeight: 600, opacity: 0.64 }}>{index + 1}</span>
              {step.label}
              {step.note && <span style={{ fontWeight: 600 }}>{step.note}</span>}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

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
  // X 周标签 = 全站日历周格式（2026W45）：桶号 YYYYWW 由周数据完整日期年份 + weekNumber 拼装（与主图同口径，年份不写死）。
  const weekBucketIds = weeks.map((week) => {
    const source = fixture.weeks.find((candidate) => candidate.weekNumber === week.weekNumber);
    const year = source ? source.date.slice(0, 4) : '';
    return `${year}W${String(week.weekNumber).padStart(2, '0')}`;
  });
  const forecastWeeks = weeks.filter((week) => week.status === 'forecast');
  const slot = PLOT_W / weeks.length;
  const barW = Math.min(24, slot * 0.46);
  const x = (index: number): number => LEFT + (index + 0.5) * slot;
  // 轴域只按渠道 DOS 数据派生（全流程 DOS 已下架、健康带已删——不再为
  // 70–90 天带保底 DOS_BAND.max + 1，2026-11-04 清洁第二轮）
  const dosMax = Math.max(1, niceCeil(Math.max(...weeks.map((week) => week.channelDos))));
  const invMax = Math.max(1, niceCeil(Math.max(...weeks.map((week) => week.channelInv))));
  const yDos = (value: number): number => TOP + PLOT_H * (1 - value / dosMax);
  const yInv = (value: number): number => TOP + PLOT_H * (1 - value / invMax);
  const dosLine = (from: number, to: number): string =>
    weeks.slice(from, to + 1)
      .map((week, offset) => `${offset === 0 ? 'M' : 'L'}${x(from + offset).toFixed(1)} ${yDos(week.channelDos).toFixed(1)}`)
      .join(' ');
  // 微痕读 supplyCapped（截断事实，手调不覆盖）；capped 只表当前是否按库存值显示。
  const cappedWeeks = forecastWeeks.filter((week) => week.supplyCapped);
  const capTriggered = cappedWeeks.length > 0;

  // 链路指示条：把「SO 先预测出 → 反算 → 判定 → 修正 → 回写」定序画在卡上
  //（定序与 surface brief 层④一致）；激活态 = 触发修正时「上限修正」琥珀注 W{n} 起。
  const flowSteps: FlowStep[] = [
    { label: '主图基线 SO', title: '基线 SO 先在主图预测出（大盘 + 量价参考 + 事件推完），本卡在其上做库存推演' },
    { label: '反算 DOS/库存', title: '用基线 SO 反算渠道 DOS 与库存（近 4 周均销）' },
    { label: '健康判定', title: `DOS ${DOS_BAND.min}–${DOS_BAND.max} 天 + 库存降幅 ${INV_CRASH_LIGHT_PCT}%／${INV_CRASH_HEAVY_PCT}%（预警解释，阈值未核定）` },
    capTriggered
      ? { label: '上限修正', note: `W${cappedWeeks[0].weekNumber} 起`, title: MIN_FORMULA_TITLE, state: 'amber' as const }
      : { label: '上限修正', title: MIN_FORMULA_TITLE },
    capTriggered
      ? { label: '回写主图', title: '修正后 SO 回写主图预测柱（修正周琥珀描边标识）', state: 'active' as const }
      : { label: '回写主图', note: '未触发', title: '库存可支撑基线 SO，主图预测柱不受影响', state: 'muted' as const },
  ];

  // 图例 = 图上实有系列（2026-11-04 评审：只留库存柱 + 渠道 DOS）
  const legendItems: LegendItem[] = [
    { key: 'inv', label: '渠道库存（右轴）', shape: 'rect', color: color.ink },
    { key: 'chdos', label: '渠道 DOS', shape: 'line', color: color.link },
  ];

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="库存验证"
        hint="图上只留渠道库存柱（右轴，万台）+ 渠道 DOS 线（左轴，蓝实→虚）；全流程 DOS 不上图，悬停库存柱读数值。SI 月计划在上方格子输入（唯一人工输入）：SI 够高 → 库存柱自然高。健康判定（预警解释）→ 可售不足的预测周按可售量修正并回写主图，修正周琥珀描边标识。"
        extra={<>
          <SimChip title="库存推演为演示样本：SI 计划仅存本地草稿，不写真实数据" />
          {/* 2026-11-04 评审（1b 同精神）：置信区间「把握」提示不必要 → 中性波动参考 chip */}
          {cappedWeeks.length > 0
            ? <StateChip label="修正段 · 波动参考 ±2%" title="库存修正段按可售量修正，±2% 为演示波动参考口径，非统计置信区间" />
            : <StateChip label="库存可支撑" title="当前库存推演可支撑基线 SO：未触发库存上限修正" />}
        </>}
      />
      {/* SI 月计划：页签格子输入（2026-11-04 评审：SI 不上图）。月内均分到周，
          改后全链重算；SI 够高 → 库存柱自然高，从渠道 DOS 反推可见。 */}
      <div
        data-si-cell-row=""
        role="group"
        aria-label="SI 月计划（按月格子输入）"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', marginBottom: space.sm }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>SI 月计划</span>
        <span style={{ fontSize: 11, color: color.mute }}>千台/月 · 月内均分到周，调整后全链重算</span>
        {fixture.forecastMonths.map((month) => (
          <label key={month.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', border: `1px solid ${color.hairline}`, borderRadius: radius.control, fontSize: 12, color: color.body }}>
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
      <IoBar
        input="SI 月计划（唯一人工输入）· 上游基线 SO（大盘+量价考量）· 期初渠道库存"
        output={`未来 DOS / 库存反算与健康判定；可售不足周按可售量修正回写主图（${cappedWeeks.length ? `W${cappedWeeks[0].weekNumber} 起` : '当前未触发'}）`}
      />
      <FlowBar
        ariaLabel="库存链路：主图基线 SO → 反算 DOS/库存 → 健康判定 → 上限修正 → 回写主图"
        steps={flowSteps}
      />
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`库存验证：渠道库存柱（右轴，万台）+ 渠道 DOS 线（左轴）；全流程 DOS 不上图，悬停库存柱读数值；${cappedWeeks.length ? `W${cappedWeeks[0].weekNumber} 起库存上限修正（按可售量修正回写主图，修正周琥珀描边）` : '当前库存可支撑基线 SO，未触发修正'}。详细判定见下方输出框。`}
          style={{ display: 'block', height: 'auto', minWidth: 700 }}
        >
          {/* 预测段浅底/分界线/「预测 / 计划」说明已下线（2026-11-04 晚清洁：预测周靠虚柱本身区分，图上只留数据） */}
          {/* 网格 + 左轴（天）+ 右轴（万台）；2026-11-04 评审删 DOS 50 参考格线：左轴只标 0 与上限 */}
          {[0, 1].map((fraction) => {
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
          {/* DOS 70–90 天健康带（底衬 + 边界虚线 + 边界标注）已下线
              （2026-11-04 清洁第二轮）：图上只剩库存柱 + 渠道 DOS 线 + 轴刻度；
              合理带阈值仍在判定口径（输出框规则行 / 判定行、链路条 title） */}
          {/* X 周标签（全站日历周格式 2026W45） */}
          {weeks.map((week, index) => (index % 4 === 0 || index === weeks.length - 1
            ? <text key={week.week} x={x(index)} y={H - 8} textAnchor="middle" fontSize={10} fill={color.mute}>{weekBucketIds[index]}</text>
            : null))}
          {/* 渠道库存柱：历史实（中性墨）/ 预测虚柱；悬停 title = 选中点读数
              （含全流程 DOS 与 SI 数值——评审：全流程不上线，仅考量因素） */}
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
          {/* 渠道 DOS 单线：历史实 / 预测虚（2026-11-04 评审删全流程 DOS 线，
              其数值收进库存柱悬停 title；dosLine 只画渠道 DOS） */}
          {show('chdos') && (
            <>
              <path d={dosLine(0, 7)} fill="none" stroke={color.link} strokeWidth={2.2} />
              <path d={dosLine(FORECAST_START, weeks.length - 1)} fill="none" stroke={color.link} strokeWidth={2.2} strokeDasharray="5 4" />
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
