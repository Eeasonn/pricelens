// ============================================================
// 推演工作台 · 层④成本销毛（任务 9 · IA 文档第四节 / B.4.3 / B.4.7 / B.5.8）：
// 卡内只用 hairline 分「成本参考区 / 经营结果区」两个阅读区、一个结果，
// 不新增嵌套卡：
// - 成本参考区：月版本、生效成本、相对上版变化、模拟来源状态、成本编辑
//   （只写 costOverrides，原因选填，可还原）、成本证据浮框位（版本阶梯 +
//   单台/周销毛算例）；方向性提示「成本上升 · 请核对价格」——成本只是
//   是否调价的参考，系统不自动给出涨价金额；
// - 经营结果区：销毛柱 / 价格线 / 成本阶梯 / 公式；主数字读
//   MarginView.forecastMargin（与主图摘要同源由任务 10 完成页级接线，本卡
//   内部先统一消费 computeMarginView）；覆盖率如实显示（缺数周不计 0）；
//   结果回读「含主图价格手调 Wn / 含成本假设 N 项」（点击回跳回调由任务 10
//   接线，缺省只读 chip）；
// - 唯一人工动作「带到主图调价」打开 PriceAdjustDialog（跳转与草稿预填，
//   不是自动映射；价格→销量关系未纳入 · 暂不联动销量）。
// 红线不变：成本只进④销毛，不修改需求主链；本卡不写 WorkbenchResult /
// WorkbenchParams。图形几何沿用 WP5（$M 轴 / 预测起点派生 / 负销毛向下 /
// 空态显式）。
// ============================================================
import { Fragment, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, Input, InputNumber } from 'antd';
import { brandColor, color, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import { buildForecastCalendar } from './workbenchCalendar';
import type { ForecastCalendar, MonthKey, WeekId } from './workbenchCalendar';
import type { WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';
import { computeMarginView } from './marginScenarioModel';
import type { MarginPriceOverride, MarginScenario, MarginView } from './marginScenarioModel';
import useMarginScenario from './useMarginScenario';
import type { PriceAdjustReviewMeta } from './PriceAdjustDialog';
import PriceAdjustDialog from './PriceAdjustDialog';
import { IoBar, SectionHead, SimChip, WorkbenchLegend, fmtMillionUsd, workbenchCardStyle, type LegendItem } from './WorkbenchBits';
import { buildAxisTicks, firstForecastIndex } from './workbenchChartSegments';

// 2026-11-04 视觉一致性：viewBox 宽度对齐右列实际渲染宽度（≈560-720，缩放比 ≈1，
// 文字回归真实 px——旧 1000 宽被压缩导致轴字体过小）；图高与全站 ≈252px 对齐。
const W = 720;
const H = 252;
const LEFT = 52;
const RIGHT = 50;
const TOP = 16;
const BOTTOM = 26;
const PLOT_W = W - LEFT - RIGHT;
const PLOT_H = H - TOP - BOTTOM;

const fmtUnits = (value: number | null): string => (value != null ? value.toLocaleString('en-US') : '—');
const fmtUsd = (value: number): string => `$${Math.round(value * 10) / 10}`;
const fmtSignedUsd = (value: number): string => (value > 0 ? `+${fmtUsd(value)}` : value === 0 ? `±${fmtUsd(0)}` : `−${fmtUsd(-value)}`);

// ------------------------------------------------------------
// 依赖链路条（纯展示，卡内实现；与库存卡同一形态）：贴 IoBar 的
// 小 chip + → 分隔语言，节点状态「文字 + 底色」双通道；末节点点亮
// 表「预测期销毛」是本卡输出且不回写主图。
// ------------------------------------------------------------
type FlowStepState = 'base' | 'active' | 'amber' | 'muted';

interface FlowStep {
  label: string;
  /** 节点前分隔符（默认 →；「+」表并列输入）。 */
  join?: string;
  /** 节点补充注记（如 不回写主图）。 */
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

/** 成本销毛依赖链路：单台销毛 = 主图价格 − 成本月版本，× 主图 SO 汇总为期销毛。
 *  2026-11-04 评审：量价 = 输入，销毛 = 经营结果（结果区不回写、不进模型输入）。
 *  任务 9：数字来源 = 统一 MarginView（显示价含价格手调 / 成本含假设）。 */
const COST_FLOW_ARIA = '成本销毛依赖链路：主图价格预测 + 成本月版本 → 单台销毛 → × 主图 SO → 预测期销毛（不回写主图）；量价 = 输入，销毛 = 经营结果';

function costFlowSteps(): FlowStep[] {
  return [
    { label: '主图价格预测', title: '单台销毛只跟价的预测有关：价格线（历史实 / 预测虚）来自主图；主图价格手调改显示价' },
    { label: '成本月版本', join: '+', title: '成本按月版本阶梯（实→虚）；成本 ↔ 价格无直接数学映射，成本只是是否调价的参考' },
    { label: '单台销毛', title: '单台销毛 = 主图价格 − 成本月版本' },
    { label: '× 主图 SO', title: '乘主图最终 SO（量价链推完）得周销毛' },
    { label: '预测期销毛', note: '不回写主图', title: '经营结果（链路末端独立推测）：汇总为预测期销毛，不修正主图；对结果不满意回到量价输入调整', state: 'active' },
  ];
}

/** 轻量中性 chip（与库存卡 StateChip 同形态）：波动参考口径，不用「把握」话术。 */
function RefChip({ label, title }: { label: string; title: string }) {
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

/** 小按钮（行内操作：编辑 / 证据 / 还原；11px 中性；aria-label 含月份保证唯一可达名称）。 */
function RowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.control,
        fontSize: 11, color: color.body, background: 'transparent', border: `1px solid ${color.hairline}`,
        cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap',
      }}
    >
      {label.split(' ')[0]}
    </button>
  );
}

/** 结果回读 chip（B.5.8）：有回跳回调 = 可点击 button；缺省 = 只读 span（任务 10 接线）。 */
function ReadbackChip({ label, title, onJump }: { label: string; title: string; onJump?: () => void }) {
  const style: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill,
    fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    background: color.canvasSoft2, color: color.body, border: `1px solid ${color.hairline}`,
    ...(onJump ? { cursor: 'pointer' } : {}),
  };
  if (onJump) {
    return <button type="button" title={title} onClick={onJump} style={{ ...style, font: 'inherit' }}>{label}</button>;
  }
  return <span title={title} style={style}>{label}</span>;
}

const zoneHeadStyle: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px', marginBottom: space.sm, minWidth: 0,
};
const zoneTitleStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: color.ink };
const zoneHintStyle: CSSProperties = { fontSize: 11, lineHeight: 1.6, color: color.mute, minWidth: 0 };

export default function ForecastMarginCostCard({
  fixture,
  result,
  marginView,
  scenario,
  onApplyPriceOverrides,
  onSetCostOverride,
  onClearCostOverride,
  onResetMarginScenario,
  onJumpToPriceOverride,
  onJumpToCostMonth,
}: {
  fixture: WorkbenchFixture;
  result: WorkbenchResult;
  /** 页级统一销毛视图（任务 10 页级接线；缺省 = 本卡按情景内部计算）。 */
  marginView?: MarginView;
  /** 页级情景（受控显示；缺省 = 本卡内部工作区，会话持久化 + 撤销）。 */
  scenario?: MarginScenario;
  /** 页级写入回调（任务 10；缺省 = 本卡内部工作区）。 */
  onApplyPriceOverrides?: (entries: Record<WeekId, MarginPriceOverride>, meta: PriceAdjustReviewMeta) => void;
  onSetCostOverride?: (monthKey: MonthKey, unitCost: number, reason: string) => void;
  onClearCostOverride?: (monthKey: MonthKey) => void;
  onResetMarginScenario?: () => void;
  /** 结果回读回跳（任务 10 页级导航；缺省 = 只读 chip）。 */
  onJumpToPriceOverride?: (weekId: WeekId) => void;
  onJumpToCostMonth?: (monthKey: MonthKey) => void;
}) {
  const workspace = useMarginScenario(fixture.meta.modelVersion);
  const calendar = useMemo(() => buildForecastCalendar(fixture.calendar), [fixture.calendar]);
  const activeScenario = scenario ?? workspace.scenario;
  const computedView = useMemo(
    () => computeMarginView(fixture, result, activeScenario),
    [fixture, result, activeScenario],
  );
  const view = marginView ?? computedView;

  // 写入路由：页级回调优先，缺省内部工作区（会话持久化 + 20 步撤销）。
  const applyEntries = onApplyPriceOverrides ?? workspace.applyPriceOverrides;
  const setCost = onSetCostOverride ?? workspace.setCostOverride;
  const clearCost = onClearCostOverride ?? workspace.clearCostOverride;
  const resetAll = onResetMarginScenario ?? workspace.resetScenario;

  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey | null>(null);
  const [evidenceMonth, setEvidenceMonth] = useState<MonthKey | null>(null);
  const [editingMonth, setEditingMonth] = useState<MonthKey | null>(null);
  const [editValue, setEditValue] = useState<number | null>(null);
  const [editReason, setEditReason] = useState('');
  const show = (key: string): boolean => !hidden.has(key);
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const versions = fixture.costVersions;
  const versionOf = (monthKey: MonthKey) => versions.find((version) => version.monthKey === monthKey);
  const effectiveCostOf = (monthKey: MonthKey): number =>
    activeScenario.costOverrides[monthKey]?.unitCost ?? versionOf(monthKey)?.unitCost ?? 0;
  const overrideOf = (monthKey: MonthKey) => activeScenario.costOverrides[monthKey];
  // 方向性提示（4.3）：存在「生效成本高于上一月版本」时提示核对价格；系统不给出价格数值建议。
  const riseMonths = versions
    .slice(1)
    .filter((version, index) => effectiveCostOf(version.monthKey) > versions[index]!.unitCost)
    .map((version) => version.monthKey);
  const dialogMonth = selectedMonth ?? riseMonths[0] ?? versions[0]?.monthKey ?? null;
  const dialogWeekId = (dialogMonth != null
    ? calendar.monthByKey.get(dialogMonth)?.forecastWeekIds[0]
    : undefined)
    ?? calendar.forecastWeeks[0]?.id ?? null;
  const openEditor = (monthKey: MonthKey) => {
    setEditingMonth(monthKey);
    setEditValue(effectiveCostOf(monthKey));
    setEditReason(overrideOf(monthKey)?.reason ?? '');
    setSelectedMonth(monthKey);
  };
  const saveEditor = (monthKey: MonthKey) => {
    const base = versionOf(monthKey)?.unitCost ?? 0;
    setCost(monthKey, editValue != null && Number.isFinite(editValue) ? editValue : base, editReason);
    setEditingMonth(null);
    setEditValue(null);
    setEditReason('');
  };

  const priceOverrideWeekIds = Object.keys(activeScenario.priceOverrides);

  const head = (
    <>
      <SectionHead
        title="成本销毛 · 经营结果"
        hint="经营结果 · 由上述量价与成本推导（月版本成本阶梯 + 预测销毛柱，历史实 / 预测虚）：周销毛 = 主图最终 SO ×（价格 − 当月版本成本），演示口径不含渠道费率；不回写主图——对销毛不满意，回到量价输入区调整。"
        extra={<>
          <SimChip title="成本与销毛为演示样本推演：月版本成本 × 主图价格，不含渠道费率" />
          <RefChip label="推演参考 · 波动 ±8%" title="销毛为链路末端推演结果，±8% 为演示波动参考口径，非统计置信区间" />
        </>}
      />
      <IoBar
        input="输入（量价）：主图最终 SO（量价链推完）· 主图价格 · 成本月版本趋势（仅调价参考）"
        output="经营结果：预测期销毛（独立推测，不修正主图）"
      />
      <FlowBar ariaLabel={COST_FLOW_ARIA} steps={costFlowSteps()} />
    </>
  );

  // 空态（WP5 Step 10）：无周数据不渲染计算结果为 NaN 的 SVG。
  const weeksAll = view.weeks;
  if (!weeksAll.length) {
    return (
      <section style={workbenchCardStyle}>
        {head}
        <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: space.lg, fontSize: 12, color: color.mute, textAlign: 'center' }}>
          暂无成本销毛数据
        </div>
      </section>
    );
  }

  // 时间边界派生（WP5 Step 3）：与主图共用 firstForecastIndex，禁写死下标。
  const weeks = weeksAll;
  const forecastStart = firstForecastIndex(weeks);
  const hasForecast = forecastStart >= 0;
  const hasHistory = forecastStart > 0;
  const historyEnd = hasForecast ? forecastStart - 1 : weeks.length - 1;
  const slot = PLOT_W / weeks.length;
  const barW = Math.min(26, slot * 0.52);
  const x = (index: number): number => LEFT + (index + 0.5) * slot;

  // 周销毛轴：正负同轴，零基线；缺失周（weeklyMargin=null）不入域不画柱。
  const marginValues = weeks
    .map((week) => week.weeklyMargin)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const marginMax = Math.max(0, ...marginValues);
  const marginMin = Math.min(0, ...marginValues);
  const yMax = Math.max(1, niceCeil(marginMax * 1.1));
  const yMin = marginMin < 0 ? -Math.max(1, niceCeil(-marginMin * 1.1)) : 0;
  const y = (value: number): number => TOP + PLOT_H * (1 - (value - yMin) / (yMax - yMin));
  const zeroY = y(0);
  // 刻度：0 基线必画；有负值段时补负端点；其余由数据域生成。
  const tickValues = Array.from(new Set([yMin < 0 ? yMin : 0, ...buildAxisTicks(yMin, yMax, 2)])).sort((a, b) => a - b);

  // 右轴（USD/台）：覆盖生效成本与显示价（含手调），头尾留 8% 呼吸。
  const unitValues = weeks.flatMap((week) => [week.unitCost, week.effectivePrice]);
  const uLo = Math.min(...unitValues);
  const uHi = Math.max(...unitValues);
  const uPad = (uHi - uLo) * 0.08 || uHi * 0.08 || 1;
  const uMin = uLo - uPad;
  const uMax = uHi + uPad;
  const yUnit = (value: number): number => TOP + PLOT_H * (1 - (value - uMin) / (uMax - uMin));

  const stepPath = (pick: (week: (typeof weeks)[number]) => number, from: number, to: number): string => {
    if (from > to || from < 0 || to >= weeks.length) return '';
    let d = '';
    weeks.slice(from, to + 1).forEach((week, offset) => {
      const value = pick(week);
      const px = x(from + offset);
      d += `${d ? 'L' : 'M'}${(px - slot / 2).toFixed(1)} ${yUnit(value).toFixed(1)}`;
      d += `L${(px + slot / 2).toFixed(1)} ${yUnit(value).toFixed(1)}`;
    });
    return d;
  };
  // 档期价格读数从 fixture 派生（v3：promoWindows 起止周 WeekId 闭区间，覆盖预测段的窗口）。
  const forecastPromoWindows = fixture.promoWindows.filter((window) =>
    weeks.some((week) => week.status === 'forecast' && week.weekId >= window.startWeekId && week.weekId <= window.endWeekId));
  const promoPrices = [...new Set(
    weeks
      .filter((week) => forecastPromoWindows.some((window) => week.weekId >= window.startWeekId && week.weekId <= window.endWeekId))
      .map((week) => week.effectivePrice),
  )];
  const costHistoryD = hasHistory ? stepPath((week) => week.unitCost, 0, historyEnd) : '';
  const costForecastD = hasForecast ? stepPath((week) => week.unitCost, forecastStart, weeks.length - 1) : '';
  const priceHistoryD = hasHistory ? stepPath((week) => week.effectivePrice, 0, historyEnd) : '';
  const priceForecastD = hasForecast ? stepPath((week) => week.effectivePrice, forecastStart, weeks.length - 1) : '';
  const costChangeMonthKeys = versions.slice(1).map((version) => version.monthKey);
  const legendItems: LegendItem[] = [
    { key: 'margin', label: '周销毛（$M）', shape: 'rect', color: color.warning },
    { key: 'cost', label: '成本 · 月版本（实→虚）', shape: 'line', color: color.hairlineStrong },
    { key: 'price', label: '价格', shape: 'line', color: brandColor.HUAWEI },
  ];

  // 版本阶梯小图（成本证据浮框）：生效成本阶梯 + 选中月高亮。
  const evidenceKey = evidenceMonth ?? null;
  const ladderW = 300;
  const ladderH = 88;
  const ladderPad = 10;
  const ladderValues = versions.map((version) => effectiveCostOf(version.monthKey));
  const ladderLo = Math.min(...ladderValues);
  const ladderHi = Math.max(...ladderValues);
  const ladderSpan = ladderHi - ladderLo || 1;
  const ladderY = (value: number): number => ladderPad + (ladderH - ladderPad * 2) * (1 - (value - ladderLo) / ladderSpan);
  const ladderSlot = (ladderW - ladderPad * 2) / versions.length;
  const ladderD = versions.map((version, index) => {
    const lx = ladderPad + index * ladderSlot;
    const ly = ladderY(ladderValues[index]!);
    return `${index === 0 ? 'M' : 'L'}${(lx - ladderSlot / 2).toFixed(1)} ${ly.toFixed(1)}L${(lx + ladderSlot / 2).toFixed(1)} ${ly.toFixed(1)}`;
  }).join('');
  const evidenceWeek = evidenceKey != null
    ? view.weeks.find((week) => week.weekId === (calendar.monthByKey.get(evidenceKey)?.forecastWeekIds[0] ?? ''))
    : undefined;

  return (
    <section style={workbenchCardStyle}>
      {head}

      {/* ── 成本参考区（hairline 分区 · 只读区 1）：月版本 / 较上版 / 来源状态 / 编辑 / 证据 ── */}
      <div
        data-zone="cost-reference"
        style={{ borderTop: `1px solid ${color.hairline}`, marginTop: space.xs, paddingTop: space.sm, minWidth: 0 }}
      >
        <div style={zoneHeadStyle}>
          <b style={zoneTitleStyle}>成本参考区</b>
          <span style={zoneHintStyle}>月版本成本 · 模拟样本 · 成本只是是否调价的参考，不进模型输入（只进本区销毛结果）</span>
          {riseMonths.length > 0 && (
            <span
              title="成本只是调价参考：系统不自动给出涨价金额，也不联动销量；请人工核对价格"
              style={{ fontSize: 11, fontWeight: 600, color: color.warningInk }}
            >
              成本上升 · 请核对价格
            </span>
          )}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: space.sm, alignItems: 'center' }}>
            {editingMonth == null && (
              <Button size="small" onClick={() => { setSelectedMonth(null); setAdjustOpen(true); }}>带到主图调价</Button>
            )}
          </span>
        </div>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, fontSize: 10.5, fontWeight: 600, color: color.mute, padding: '2px 4px' }}>
            <span style={{ width: 96 }}>月份</span>
            <span style={{ width: 76 }}>生效成本</span>
            <span style={{ width: 76 }}>较上版</span>
            <span style={{ width: 84 }}>来源状态</span>
            <span>操作</span>
          </div>
          {versions.map((version, index) => {
            const monthKey = version.monthKey;
            const override = overrideOf(monthKey);
            const effective = effectiveCostOf(monthKey);
            const prevBase = index > 0 ? versions[index - 1]!.unitCost : null;
            const delta = prevBase != null ? effective - prevBase : null;
            const isEditing = editingMonth === monthKey;
            return (
              <div
                key={monthKey}
                style={{
                  display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
                  fontSize: 11.5, color: color.body, padding: '2px 4px', borderRadius: radius.control,
                  background: isEditing || evidenceKey === monthKey ? color.canvasSoft2 : 'transparent',
                }}
              >
                <span style={{ width: 96, color: color.ink }}>{version.label}</span>
                <span className="tnum" style={{ width: 76, fontWeight: override != null ? 600 : 400, color: override != null ? color.warningInk : color.body }}>
                  {fmtUsd(effective)}
                </span>
                <span className="tnum" style={{ width: 76, color: delta != null && delta > 0 ? color.warningInk : color.mute }}>
                  {delta != null ? fmtSignedUsd(Math.round(delta * 10) / 10) : '—'}
                </span>
                <span style={{ width: 84 }}>
                  {override != null
                    ? <span title={`成本假设：${override.reason || '（无原因）'}`} style={{ fontWeight: 600, color: color.warningInk }}>已改</span>
                    : <span title="月版本成本为模拟演示样本" style={{ color: color.mute }}>模拟样本</span>}
                </span>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {isEditing ? (
                    <>
                      <InputNumber
                        aria-label={`成本假设 ${monthKey}（USD/台）`}
                        size="small"
                        min={0}
                        step={1}
                        value={editValue}
                        onChange={(value) => setEditValue(value == null ? null : Math.max(0, Number(value)))}
                        style={{ width: 92 }}
                      />
                      <Input
                        aria-label={`成本假设原因 ${monthKey}（选填）`}
                        size="small"
                        value={editReason}
                        placeholder="原因（选填）"
                        onChange={(event) => setEditReason(event.target.value)}
                        style={{ width: 140 }}
                      />
                      <Button size="small" type="primary" aria-label={`保存成本假设 ${monthKey}`} onClick={() => saveEditor(monthKey)}>保存</Button>
                      <Button size="small" aria-label={`取消编辑 ${monthKey}`} onClick={() => { setEditingMonth(null); setEditValue(null); setEditReason(''); }}>取消</Button>
                    </>
                  ) : (
                    <>
                      <RowButton label={`编辑成本版本 ${monthKey}`} onClick={() => openEditor(monthKey)} />
                      <RowButton
                        label={`成本证据 ${monthKey}`}
                        onClick={() => {
                          setEvidenceMonth((prev) => (prev === monthKey ? null : monthKey));
                          setSelectedMonth(monthKey);
                        }}
                      />
                      {override != null && (
                        <RowButton label={`还原成本基准 ${monthKey}`} onClick={() => clearCost(monthKey)} />
                      )}
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* 成本证据浮框位（3.2 ④）：版本阶梯小图 + 单台/周销毛算例；UI 不另编数字 */}
        {evidenceKey != null && (
          <div
            data-evidence-panel=""
            style={{
              marginTop: space.sm, border: `1px solid ${color.hairline}`, borderRadius: radius.card,
              background: color.canvas, padding: space.md, display: 'grid', gap: 6, minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 12, color: color.ink }}>{`成本证据 · ${versionOf(evidenceKey)?.label ?? evidenceKey}`}</b>
              <span style={{ fontSize: 11, color: color.mute }}>模拟样本 · 版本覆盖该月预测周</span>
              <button
                type="button"
                aria-label="关闭成本证据"
                onClick={() => setEvidenceMonth(null)}
                style={{ marginLeft: 'auto', border: 'none', background: 'transparent', font: 'inherit', fontSize: 11, color: color.mute, cursor: 'pointer' }}
              >
                关闭
              </button>
            </div>
            <svg viewBox={`0 0 ${ladderW} ${ladderH}`} width="100%" role="img" aria-label="成本版本阶梯（生效成本）" style={{ display: 'block', height: 'auto', maxWidth: 320 }}>
              <path d={ladderD} fill="none" stroke={color.hairlineStrong} strokeWidth={2} />
              {versions.map((version, index) => (
                <circle
                  key={version.monthKey}
                  cx={ladderPad + index * ladderSlot}
                  cy={ladderY(ladderValues[index]!)}
                  r={version.monthKey === evidenceKey ? 3.4 : 2}
                  fill={version.monthKey === evidenceKey ? color.ink : color.canvas}
                  stroke={color.hairlineStrong}
                  strokeWidth={1.4}
                />
              ))}
            </svg>
            <div className="tnum" style={{ fontSize: 11.5, lineHeight: 1.7, color: color.body, display: 'grid', gap: 2 }}>
              <span>
                {`版本阶梯：${versions.map((version) => `${version.monthKey} ${fmtUsd(effectiveCostOf(version.monthKey))}`).join(' → ')}`}
              </span>
              {evidenceWeek && (
                <>
                  <span>{`单台销毛 = 价格 ${fmtUsd(evidenceWeek.effectivePrice)} − 当月版本成本 ${fmtUsd(evidenceWeek.unitCost)} = ${fmtUsd(evidenceWeek.unitMargin)}（${evidenceWeek.weekId} 算例）`}</span>
                  <span>{`周销毛 = ${fmtUsd(evidenceWeek.unitMargin)} × 最终 SO ${fmtUnits(evidenceWeek.finalSales)} = ${fmtMillionUsd(evidenceWeek.weeklyMargin ?? 0)}`}</span>
                </>
              )}
              <span>{`预测期销毛（12 个预测月）= ${fmtMillionUsd(view.forecastMargin)}`}</span>
              {overrideOf(evidenceKey) != null && (
                <span style={{ color: color.warningInk }}>
                  {`含成本假设：${fmtUsd(effectiveCostOf(evidenceKey))}（相对基准 ${fmtSignedUsd(Math.round((effectiveCostOf(evidenceKey) - (versionOf(evidenceKey)?.unitCost ?? 0)) * 10) / 10)}）· 原因 ${overrideOf(evidenceKey)!.reason || '（无）'}`}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 工作区操作条（内部工作区模式）：未持久化重试 / 20 步撤销 / 整体还原 */}
        {scenario == null && (workspace.saveState === 'unpersisted' || workspace.canUndo) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', marginTop: space.sm }}>
            {workspace.saveState === 'unpersisted' && (
              <Button size="small" onClick={workspace.retryPersist}>未持久化 · 重试</Button>
            )}
            {workspace.canUndo && (
              <Button size="small" onClick={workspace.undo}>{`撤销 · ${workspace.lastAction ?? '上一步'}`}</Button>
            )}
            {(view.appliedCostCount + view.appliedPriceCount > 0) && (
              <Button size="small" onClick={resetAll}>还原成本与价格基准</Button>
            )}
            <span style={{ fontSize: 11, color: color.mute }}>成本/价格假设仅本页签会话内生效，可撤销；不进入需求主链</span>
          </div>
        )}
      </div>

      {/* ── 经营结果区（hairline 分区 · 只读区 2）：销毛柱 / 价格线 / 公式 / 主数字 ── */}
      <div
        data-zone="business-result"
        style={{ borderTop: `1px solid ${color.hairline}`, marginTop: space.sm, paddingTop: space.sm, minWidth: 0 }}
      >
        <div style={zoneHeadStyle}>
          <b style={zoneTitleStyle}>经营结果区</b>
          <span style={zoneHintStyle}>销毛按当前量价与成本计算（演示口径不含渠道费率）· 唯一人工调价入口在成本参考区</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <ReadbackChip
              label={view.appliedPriceCount > 0 ? `含主图价格手调 W${view.appliedPriceCount}` : '无主图价格手调'}
              title={view.appliedPriceCount > 0
                ? `价格手调周：${priceOverrideWeekIds.join('、')}（来自④成本参考 · 暂不联动销量）`
                : '主图价格无人工手调'}
              onJump={onJumpToPriceOverride != null && priceOverrideWeekIds.length > 0
                ? () => onJumpToPriceOverride(priceOverrideWeekIds[0]!)
                : undefined}
            />
            <ReadbackChip
              label={`含成本假设 ${view.appliedCostCount} 项`}
              title={view.appliedCostCount > 0
                ? `成本假设月：${Object.keys(activeScenario.costOverrides).join('、')}`
                : '成本按月版本基准，无人工假设'}
              onJump={onJumpToCostMonth != null && Object.keys(activeScenario.costOverrides).length > 0
                ? () => onJumpToCostMonth(Object.keys(activeScenario.costOverrides)[0]!)
                : undefined}
            />
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {/* SVG 地板宽 560：本卡在页面 ④⑤ 左右两列的右列，1440 最小工作宽下
              右列卡内 ≈565px——下探地板避免列内横向滚动（2026-11-04 清洁第二轮） */}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={`成本销毛（经营结果 · 由上述量价与成本推导）：周销毛柱与月版本成本阶梯（${versions.map((version) => `${version.label} $${version.unitCost}`).join(' → ')}）；预测期（${fixture.context.forecastRange}）销毛 ${fmtMillionUsd(view.forecastMargin)}，历史 ${fixture.context.historyRange} 销毛 ${fmtMillionUsd(view.historyMargin)}；不回写主图。`}
            style={{ display: 'block', height: 'auto', minWidth: 560 }}
          >
            {/* 周销毛轴（$M）：0 基线强分隔，其余刻度弱网格；负值向下 */}
            {tickValues.map((value) => {
              const gy = y(value);
              return (
                <g key={value}>
                  <line x1={LEFT} y1={gy} x2={W - RIGHT} y2={gy} stroke={value === 0 ? color.hairlineStrong : color.hairline} />
                  <text x={LEFT - 6} y={gy + 3.5} fontSize={10} fill={color.mute} textAnchor="end">{fmtMillionUsd(value)}</text>
                </g>
              );
            })}
            {[0, 0.5, 1].map((fraction) => {
              const value = uMin + (uMax - uMin) * fraction;
              return <text key={fraction} x={W - RIGHT + 6} y={yUnit(value) + 3.5} fontSize={10} fill={color.mute}>{`$${Math.round(value / 10) * 10}`}</text>;
            })}
            {weeks.map((week, index) => {
              if (index % 4 === 0 || index === weeks.length - 1) {
                return <text key={week.weekId} x={x(index)} y={H - 8} textAnchor="middle" fontSize={10} fill={color.mute}>{week.weekId}</text>;
              }
              return null;
            })}
            {/* 周销毛柱：历史实（琥珀）/ 预测虚柱；正 = 零基线向上，负 = 向下（不静默丢柱）；
                缺数周 weeklyMargin = null 不画柱（缺数不当 0，覆盖率行如实显示） */}
            {show('margin') && weeks.map((week, index) => {
              const value = week.weeklyMargin;
              if (value == null || value === 0) return null;
              const forecast = week.status === 'forecast';
              const top = value > 0 ? y(value) : zeroY;
              const height = Math.abs(y(value) - zeroY);
              return (
                <rect
                  key={`mg-${week.weekId}`}
                  x={x(index) - barW / 2}
                  y={top}
                  width={barW}
                  height={height}
                  rx={2}
                  fill={forecast ? color.canvas : color.warning}
                  fillOpacity={forecast ? 1 : 0.35}
                  stroke={forecast ? color.warning : color.warningInk}
                  strokeOpacity={forecast ? 1 : 0.55}
                  strokeWidth={1}
                  strokeDasharray={forecast ? '4 3' : undefined}
                >
                  <title>{`${week.weekId} 周销毛 ${fmtMillionUsd(value)} · 周销 ${fmtUnits(week.finalSales)} 台 · 价格 $${week.effectivePrice} − 成本 $${week.unitCost} = 单台 $${week.unitMargin}`}</title>
                </rect>
              );
            })}
            {/* 成本月版本阶梯（实→虚，生效成本含假设）+ 版本切换点 */}
            {show('cost') && (
              <>
                {costHistoryD && <path d={costHistoryD} fill="none" stroke={color.hairlineStrong} strokeWidth={2} />}
                {costForecastD && <path d={costForecastD} fill="none" stroke={color.hairlineStrong} strokeWidth={2} strokeDasharray="5 4" />}
                {costChangeMonthKeys.map((monthKey) => {
                  const anchorWeekId = calendar.monthByKey.get(monthKey)?.forecastWeekIds[0];
                  const index = anchorWeekId != null ? weeks.findIndex((week) => week.weekId === anchorWeekId) : -1;
                  if (index < 0) return null;
                  return <circle key={monthKey} cx={x(index)} cy={yUnit(weeks[index]!.unitCost)} r={3} fill={color.canvas} stroke={color.hairlineStrong} strokeWidth={1.6} />;
                })}
              </>
            )}
            {/* 价格线（实→虚，显示价含手调） */}
            {show('price') && (
              <>
                {priceHistoryD && <path d={priceHistoryD} fill="none" stroke={brandColor.HUAWEI} strokeWidth={1.8} />}
                {priceForecastD && <path d={priceForecastD} fill="none" stroke={brandColor.HUAWEI} strokeWidth={1.8} strokeDasharray="5 4" />}
              </>
            )}
          </svg>
        </div>
        <WorkbenchLegend items={legendItems} hidden={hidden} onToggle={toggle} style={{ marginTop: 0 }} />
        <div className="tnum" style={{ marginTop: space.xs, fontSize: 12, lineHeight: 1.6, color: color.body, padding: `${space.sm}px ${space.md}px`, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
          {/* 2026-11-04 评审：销毛 = 经营结果而非输入；成本只是是否调价的参考，不进模型输入 */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ color: color.mute }}>经营结果</span>
            <span>由上述量价与成本推导（链路末端独立推测）；成本只是是否调价的参考，不进模型输入；对销毛不满意 → 回头调价</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ color: color.mute }}>成本版本</span>
            <span>{versions.map((version) => `${version.label} $${version.unitCost}`).join(' → ')}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
            <span style={{ color: color.mute }}>预测期销毛</span>
            <b style={{ color: color.ink, fontWeight: 600 }}>{`${fmtMillionUsd(view.forecastMargin)}（历史 ${fixture.context.historyRange} ${fmtMillionUsd(view.historyMargin)}）`}</b>
            <span style={{ color: color.mute }}>与主图摘要同源；{promoPrices.length ? `档期内价格 ${promoPrices.map((price) => fmtUsd(price)).join(' / ')}（${forecastPromoWindows.map((window) => window.label).join('、')}）单台毛利收窄` : '预测档期不在本预测窗'}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
            <span style={{ color: color.mute }}>覆盖率</span>
            <span>{`预测覆盖 ${view.forecastCoverage.validWeeks}/${view.forecastCoverage.totalWeeks} 周 · 历史覆盖 ${view.historyCoverage.validWeeks}/${view.historyCoverage.totalWeeks} 周（缺数周不计 0，不掩盖）`}</span>
          </div>
        </div>
      </div>

      {/* 唯一人工动作：带到主图调价（跳转与草稿预填，不是自动映射） */}
      {adjustOpen && dialogMonth != null && (
        <PriceAdjustDialog
          fixture={fixture}
          calendar={calendar}
          result={result}
          scenario={activeScenario}
          initialWeekId={dialogWeekId}
          sourceCostMonth={dialogMonth}
          onCancel={() => setAdjustOpen(false)}
          onApply={(entries, meta) => {
            applyEntries(entries, meta);
            setAdjustOpen(false);
          }}
        />
      )}
    </section>
  );
}
