// ============================================================
// 量价预测 · 推演工作台 v3 · ③库存修正（任务 6 · B.5.7 SI 逐月确认）：
// - 卡头「③ 库存修正」+ 状态 chips：「SI 待确认 N / 12」（>0 附「未全部确认」）、
//   「未触发 / YYYYWww 起」；修正段波动参考中性 chip 保留（评审 1b）。
// - SI 月计划格子（唯一人工输入）v3 逐月确认状态机：
//   12 格分四个连续三月组（组头 = 月份区间 + 待确认 n / 3，不隐藏）；
//   输入用本地 raw 草稿（输入中不提交）；合法值（0–2000 千台整数）blur/Enter
//   写 siPlanMonthly 并更新参考预览，但该月仍待确认；点「确认本月」才写确认
//   工作区（onConfirmMonth → useSiConfirmations，键 forecast.siConfirmation.
//   workbench-demo-v3）；空白显示「请输入 0 或恢复基准」（不提交、不变 0）；
//   0 = 「本月不补货」正常提交；非法值 aria-invalid + 就地错误、不调 setter；
//   Esc 恢复最后合法值；「恢复基准」单月回基准并重新待确认；无「全部确认」。
//   确认按钮可访问名：基准值未改时为「确认本月」，已改时为「确认 <月键> SI」
//   （指明所确认的对象；文档 Step 1 用例契约）。
// - 每格显示拆周结果（月总量→周整数守恒，余数月初起 +1，读 siWeeklyPlan；
//   无 calendar prop 的过渡页回退 = result.weeks 同源 si 值，不另算第二套公式）。
// - SI 联动反馈：合法提交后同帧更新③库存柱 / DOS / 修正周 / 主图（props 链）；
//   结果条（aria-live=polite）写实际前后变化，如「2027-02 SI +10 千台 →
//   2027W08 修正已解除」；手调周写「截断事实仍在，主图该周显示手调值」。
// - 图面契约（2026-11-04 二轮精简，保持）：图上只留渠道库存柱（右轴，万台）+
//   渠道 DOS 线（左轴）+ 轴刻度；全流程 DOS 收进库存柱悬停 title；70–90 健康
//   带与 50 格线不上图；SI 不上图。
// - 链路条 FlowBar 上收 WorkbenchBits 共享并去编号（页级管线①–④唯一编号）。
// - 输出框修正周提供「回主图查看该周」（onNavigate 跨卡焦点回调；任务 10 接线）。
// 2026-11-05 视觉精简二轮（Eason 看图反馈）：
// - DOS 线宽统一到全站主类线基准 2（实/虚同宽，虚线 dasharray 区分）。
// - 默认视图 = 卡头（chip「SI 待确认 N/12」保留在头）+ 图（柱 + DOS 线）：
//   SI 格子行、联动反馈、IoBar、FlowBar、输出框收进共享 CollapsibleSection
//   「SI 月计划与输出」（默认收起，组件内存态不持久化），置于图与图例之下。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { color, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { ForecastCalendar, WeekId } from './workbenchCalendar';
import type { WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchParams, WorkbenchResult, WorkbenchWeekResult } from './workbenchModel';
import { DOS_BAND, INV_CRASH_HEAVY_PCT, INV_CRASH_LIGHT_PCT, siWeeklyPlan } from './workbenchModel';
import { firstForecastIndex } from './workbenchChartSegments';
import {
  CollapsibleSection,
  FlowBar,
  IoBar,
  SectionHead,
  SimChip,
  WorkbenchLegend,
  fmtWan,
  wanOf,
  workbenchCardStyle,
  type FlowStep,
  type LegendItem,
} from './WorkbenchBits';
import type { SiConfirmation, SiConfirmationState, SiSaveState } from './useSiConfirmations';
import { siMonthStatusOf } from './useSiConfirmations';

// 2026-11-04 视觉一致性：viewBox 宽度对齐左列实际渲染宽度（≈720）。
const W = 720;
const H = 252;
const LEFT = 40;
const RIGHT = 52;
const TOP = 14;
const BOTTOM = 26;
const PLOT_W = W - LEFT - RIGHT;
const PLOT_H = H - TOP - BOTTOM;

/** 库存上限修正公式（收 title，不进正文）。 */
const MIN_FORMULA_TITLE = '库存上限修正：min(基线 SO, 可售)；可售 = 期初库存 + SI 补货';

/** SI 单月取值边界（千台/月）：0 合法（本月不补货），上限沿用既有 0–2000 带。 */
const SI_MAX_KUNITS = 2000;
const SI_INVALID_TEXT = 'SI 需为 0–2000 的整数（千台）';
const SI_BLANK_TEXT = '请输入 0 或恢复基准';

/** 台 → 千台展示（去掉多余的 0；拆周守恒读数）。 */
const fmtThousandUnits = (units: number): string => String(Math.round((units / 1000) * 1000) / 1000);

/** 轻量状态 chip（文字承载语义）。 */
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

/**
 * 修正周判定（读该周自己的 health 行结构化字段，不共用首周原因；输出只讲结果）：
 * 本周 DOS / 库存降幅 → 可售不足时按可售量修正读数（人工手调周保留手调事实）。
 */
function verdictLine(week: WorkbenchWeekResult): string {
  const health = week.health;
  const parts: string[] = [];
  if (health) {
    const dosText = health.channelDos != null ? health.channelDos.toFixed(1) : '—';
    parts.push(health.dosOk
      ? `DOS ${dosText} 天在合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天内`
      : `DOS ${dosText} 天越出合理带 ${DOS_BAND.min}–${DOS_BAND.max} 天`);
    parts.push(health.crash === 'none'
      ? `库存较前 4 周均值 ${health.invChangePct > 0 ? '+' : ''}${health.invChangePct}%`
      : `库存较前 4 周均值下降 ${Math.abs(health.invChangePct).toFixed(1)}%（≥${health.crash === 'heavy' ? INV_CRASH_HEAVY_PCT : INV_CRASH_LIGHT_PCT}%）`);
  }
  const result = week.manual != null
    ? `可售不足，主图当前按人工手调 ${fmtWan(week.manual.value)} 显示`
    : `可售不足，按可售量修正至 ${fmtWan(week.final ?? 0)}`;
  return `${week.weekId} ${parts.join('；')} → ${result}`;
}

/** 单月 SI 草稿的本地态种类：无 / 空白（不提交）/ 非法（不提交）。 */
type SiDraftIssue = 'blank' | 'invalid';

export default function InventoryValidationCard({
  fixture,
  calendar,
  params,
  result,
  confirmationState = { byMonth: {} },
  onSiMonthLive,
  onConfirmMonth,
  onResetMonth,
  onNavigate,
  siSaveState = 'ready',
  onRetrySiPersist,
}: {
  fixture: WorkbenchFixture;
  /** 统一日历（B.6.2 工厂契约）；缺省（过渡页）时拆周回退 result.weeks 同源读数。 */
  calendar?: ForecastCalendar;
  params: WorkbenchParams;
  result: WorkbenchResult;
  /** SI 确认工作区（useSiConfirmations，页面持有）；缺省 = 全部待确认。 */
  confirmationState?: SiConfirmationState;
  /** 合法值 blur/Enter 提交（写 params.siPlanMonthly，同帧重算主链）。 */
  onSiMonthLive?: (monthKey: string, units: number) => void;
  /** 「确认本月」写确认工作区（useSiConfirmations.confirmMonth）。 */
  onConfirmMonth?: (monthKey: string, confirmedValue: number) => void;
  /** 「恢复基准」清该月确认记录（重新待确认）；基准值回写走 onSiMonthLive。 */
  onResetMonth?: (monthKey: string) => void;
  /** 跨卡焦点回调：回主图定位修正周（任务 10 接线页级）。 */
  onNavigate?: (weekId: WeekId) => void;
  /** 确认工作区持久化状态（未持久化显式可重试，B.5.10）。 */
  siSaveState?: SiSaveState;
  onRetrySiPersist?: () => void;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const show = (key: string): boolean => !hidden.has(key);
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  // ------------------------------------------------------------
  // SI 提交值的本地镜像（乐观呈现）：提交即更新本卡读数与状态，不等页面
  // 回写 params；页面回写一致则无感，页面外部变更（如重置基准）按差异采纳。
  // ------------------------------------------------------------
  const [siLocal, setSiLocal] = useState<Record<string, number>>(() => ({ ...params.siPlanMonthly }));
  const reportedRef = useRef(siLocal);
  useEffect(() => {
    const reported = reportedRef.current;
    const externalChanged = Object.keys(params.siPlanMonthly)
      .some((key) => reported[key] !== params.siPlanMonthly[key]);
    if (externalChanged) {
      const next = { ...params.siPlanMonthly };
      reportedRef.current = next;
      setSiLocal(next);
    }
  }, [params.siPlanMonthly]);

  // 确认记录的本地镜像（乐观呈现）：props（页面工作区）优先，本地确认即时可见。
  const [localConfirmed, setLocalConfirmed] = useState<Record<string, SiConfirmation>>({});
  const byMonth: SiConfirmationState['byMonth'] = { ...localConfirmed, ...confirmationState.byMonth };

  // 本地 raw 草稿与提交阻断态（输入中不提交；B.5.7）。
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Record<string, SiDraftIssue | undefined>>({});

  const monthKeys = fixture.forecastMonths.map((month) => month.key);
  const committedOf = (monthKey: string): number => siLocal[monthKey] ?? params.siPlanMonthly[monthKey] ?? 0;
  const baselineOf = (monthKey: string): number => fixture.inventory.siPlanMonthly[monthKey] ?? 0;

  const commitMonth = (monthKey: string, units: number) => {
    const next = { ...siLocal, [monthKey]: units };
    reportedRef.current = next;
    setSiLocal(next);
    setDrafts((prev) => {
      if (!(monthKey in prev)) return prev;
      const nextDrafts = { ...prev };
      delete nextDrafts[monthKey];
      return nextDrafts;
    });
    setIssues((prev) => (prev[monthKey] == null ? prev : { ...prev, [monthKey]: undefined }));
    onSiMonthLive?.(monthKey, units);
  };

  const handleBlur = (monthKey: string) => {
    const raw = drafts[monthKey];
    if (raw == null) return; // 未编辑过，不处理
    const text = raw.trim();
    if (text === '') {
      // 空白是未完成：不提交、不变 0（B.5.7）。
      setIssues((prev) => ({ ...prev, [monthKey]: 'blank' }));
      return;
    }
    const num = Number(text);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > SI_MAX_KUNITS) {
      setIssues((prev) => ({ ...prev, [monthKey]: 'invalid' }));
      return;
    }
    commitMonth(monthKey, num * 1000);
  };

  const confirmMonth = (monthKey: string) => {
    const value = committedOf(monthKey);
    setLocalConfirmed((prev) => ({
      ...prev,
      [monthKey]: { confirmedValue: value, confirmedAt: new Date().toISOString() },
    }));
    onConfirmMonth?.(monthKey, value);
  };

  const restoreBaseline = (monthKey: string) => {
    // 单月恢复基准：回写基准值 + 清确认记录（该月重新待确认；B.5.7）。
    commitMonth(monthKey, baselineOf(monthKey));
    onResetMonth?.(monthKey);
  };

  // 拆周（月总量→周整数守恒，余数月初起 +1）：有日历读 siWeeklyPlan（唯一公式）；
  // 无日历的过渡页回退 result.weeks 同源 si 值（页面提交后同帧重算，仍准确）。
  const splitByWeek = useMemo(() => (calendar != null ? siWeeklyPlan(calendar, siLocal) : null), [calendar, siLocal]);
  const splitOfWeek = (monthKey: string): { weekId: WeekId; units: number }[] => {
    if (calendar != null && splitByWeek != null) {
      return (calendar.monthByKey.get(monthKey)?.forecastWeekIds ?? [])
        .map((weekId) => ({ weekId, units: splitByWeek.get(weekId) ?? 0 }));
    }
    return result.weeks
      .filter((week) => week.status === 'forecast' && week.monthKey === monthKey)
      .map((week) => ({ weekId: week.weekId, units: week.si }));
  };

  // ------------------------------------------------------------
  // SI 联动反馈（B.5.7）：合法提交后同帧更新③库存柱 / DOS / 修正周 / 主图
  //（props 链重算）；本条写实际前后变化，手调周写「截断事实仍在」。
  // ------------------------------------------------------------
  const [feedback, setFeedback] = useState('');
  const prevSnapshotRef = useRef<{ si: Record<string, number>; first: WeekId | null; cappedIds: WeekId[] } | null>(null);
  useEffect(() => {
    const first = result.firstAdjustedWeek;
    const cappedIds = result.weeks.filter((week) => week.supplyCapped).map((week) => week.weekId);
    const prev = prevSnapshotRef.current;
    prevSnapshotRef.current = { si: siLocal, first, cappedIds };
    if (prev == null) return; // 首帧不生成反馈
    const changedMonth = monthKeys.find((key) => prev.si[key] !== siLocal[key]);
    if (changedMonth == null) return;
    const deltaUnits = (siLocal[changedMonth] ?? 0) - (prev.si[changedMonth] ?? 0);
    const deltaText = `${deltaUnits > 0 ? '+' : deltaUnits < 0 ? '−' : '±'}${Math.abs(deltaUnits) / 1000} 千台`;
    const manualNoteOf = (weekId: WeekId | null): string => (
      weekId != null && params.manual[weekId] != null ? '；截断事实仍在，主图该周显示手调值' : ''
    );
    let outcome: string;
    if (prev.first != null && !cappedIds.includes(prev.first)) {
      outcome = `${prev.first} 修正已解除${manualNoteOf(first)}`;
    } else if (prev.first == null && first != null) {
      outcome = `${first} 起新增修正${manualNoteOf(first)}`;
    } else {
      outcome = `${first ?? prev.first} 起修正仍在${manualNoteOf(first)}`;
    }
    setFeedback(`${changedMonth} SI ${deltaText} → ${outcome}`);
  }, [result, siLocal, monthKeys, params.manual]);

  // ------------------------------------------------------------
  // 图（渠道库存柱 + 渠道 DOS 线；契约与 v2 精简版一致）
  // ------------------------------------------------------------
  const weeks = result.weeks;
  const weekBucketIds = weeks.map((week) => week.weekId);
  const forecastStart = firstForecastIndex(weeks);
  const forecastWeeks = weeks.filter((week) => week.status === 'forecast');
  const slot = PLOT_W / weeks.length;
  const barW = Math.min(24, slot * 0.46);
  const x = (index: number): number => LEFT + (index + 0.5) * slot;
  const dosMax = Math.max(1, niceCeil(Math.max(...weeks.map((week) => week.channelDos ?? 0))));
  const invMax = Math.max(1, niceCeil(Math.max(...weeks.map((week) => week.channelInv ?? 0))));
  const yDos = (value: number): number => TOP + PLOT_H * (1 - value / dosMax);
  const yInv = (value: number): number => TOP + PLOT_H * (1 - value / invMax);
  const dosLine = (from: number, to: number): string =>
    weeks.slice(from, to + 1)
      .map((week, offset) => `${offset === 0 ? 'M' : 'L'}${x(from + offset).toFixed(1)} ${yDos(week.channelDos ?? 0).toFixed(1)}`)
      .join(' ');
  const cappedWeeks = forecastWeeks.filter((week) => week.supplyCapped);
  const capTriggered = cappedWeeks.length > 0;

  // 逐月确认状态（B.4.3）：已确认 / 已修改·待确认 / 待确认（基准值显式标注）。
  const statusOf = (monthKey: string): 'confirmed' | 'modified' | 'pending' =>
    siMonthStatusOf(byMonth[monthKey], committedOf(monthKey));
  const pendingCount = monthKeys.filter((key) => statusOf(key) !== 'confirmed').length;

  // 链路指示条（去编号；FlowBar 共享件）：状态 = 触发修正时「上限修正」琥珀注首周。
  const flowSteps: FlowStep[] = [
    { label: '主图基线 SO', title: '基线 SO 先在主图预测出（大盘 + 量价参考 + 事件推完），本卡在其上做库存推演' },
    { label: '反算 DOS/库存', title: '用基线 SO 反算渠道 DOS 与库存（近 4 周均销）' },
    { label: '健康判定', title: `DOS ${DOS_BAND.min}–${DOS_BAND.max} 天 + 库存降幅 ${INV_CRASH_LIGHT_PCT}%／${INV_CRASH_HEAVY_PCT}%（预警解释，阈值未核定）` },
    capTriggered
      ? { label: '上限修正', note: `${cappedWeeks[0]!.weekId} 起`, title: MIN_FORMULA_TITLE, state: 'amber' as const }
      : { label: '上限修正', title: MIN_FORMULA_TITLE },
    capTriggered
      ? { label: '回写主图', title: '修正后 SO 回写主图预测柱（修正周琥珀描边标识）', state: 'active' as const }
      : { label: '回写主图', note: '未触发', title: '库存可支撑基线 SO，主图预测柱不受影响', state: 'muted' as const },
  ];

  const legendItems: LegendItem[] = [
    { key: 'inv', label: '渠道库存（右轴）', shape: 'rect', color: color.ink },
    { key: 'chdos', label: '渠道 DOS', shape: 'line', color: color.link },
  ];

  // 四个连续三月组（2026-11—01 / 02—04 / 05—07 / 08—10）。
  const monthGroups: string[][] = [
    monthKeys.slice(0, 3),
    monthKeys.slice(3, 6),
    monthKeys.slice(6, 9),
    monthKeys.slice(9, 12),
  ];

  const inputStyle = (invalid: boolean): CSSProperties => ({
    width: 72, padding: '2px 6px', fontSize: 12, fontVariantNumeric: 'tabular-nums',
    border: `1px solid ${invalid ? color.error : color.hairline}`, borderRadius: radius.control,
    color: color.ink, background: color.canvas,
  });

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="③ 库存修正"
        hint="SI 月计划逐月确认（唯一人工输入）：合法值 blur/Enter 提交并全链重算，「确认本月」写入确认工作区；未确认时主图结果为参考预览。图上只留渠道库存柱（右轴，万台）+ 渠道 DOS 线（左轴）；可售不足的预测周按可售量修正并回写主图，修正周琥珀描边标识。"
        extra={<>
          <SimChip title="库存推演为演示样本：SI 计划仅存会话草稿，不写真实数据" />
          <StateChip
            label={`SI 待确认 ${pendingCount} / 12${pendingCount > 0 ? ' · 未全部确认' : ' · 已全部确认'}`}
            title={pendingCount > 0
              ? 'SI 月计划需逐月确认；未确认时主图为参考预览，不标人工已确认'
              : '12 个预测月 SI 已全部确认'}
          />
          {capTriggered
            ? <StateChip label={`${result.firstAdjustedWeek} 起`} title={`库存上限修正自 ${result.firstAdjustedWeek} 起（修正周琥珀描边）`} />
            : <StateChip label="未触发" title="当前库存可支撑基线 SO：未触发库存上限修正" />}
          {cappedWeeks.length > 0
            ? <StateChip label="修正段 · 波动参考 ±2%" title="库存修正段按可售量修正，±2% 为演示波动参考口径，非统计置信区间" />
            : <StateChip label="库存可支撑" title="当前库存推演可支撑基线 SO：未触发库存上限修正" />}
          {siSaveState === 'unpersisted' && (
            <button
              type="button"
              onClick={onRetrySiPersist}
              title="SI 确认状态未能写入浏览器会话存储：内存态继续生效，点击重试持久化"
              style={{
                display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill,
                fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', font: 'inherit',
                background: color.warningSoft, border: `1px solid ${color.warning}`, color: color.warningInk,
              }}
            >
              未持久化 · 重试
            </button>
          )}
        </>}
      />

      {/* 「SI 月计划与链路」收起区（2026-11-05 视觉精简二轮，默认收起 = 组件内存态）：
          SI 格子行（唯一人工输入）+ 联动反馈 + IoBar + FlowBar；卡头状态 chip 与
          图（柱 + DOS 线）保留可见。 */}
      <CollapsibleSection label="SI 月计划与链路">
        {/* SI 月计划：12 格四个连续三月组，逐月输入 + 确认（B.5.7）。 */}
        <div
          data-si-cell-row=""
        role="group"
        aria-label="SI 月计划（按月格子输入）"
        style={{ overflowX: 'auto', marginBottom: space.sm }}
      >
        <div style={{ minWidth: 'max-content' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: space.sm, marginBottom: space.xs }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>SI 月计划</span>
            <span style={{ fontSize: 11, color: color.mute }}>
              千台/月 · 月内均分到周（整数守恒，余数月初起 +1）· 逐月确认，无「全部确认」
            </span>
          </div>
          <div style={{ display: 'flex', gap: space.md, alignItems: 'stretch' }}>
            {monthGroups.map((group) => {
              const groupLabel = `${group[0]}—${group[group.length - 1]}`;
              const groupPending = group.filter((key) => statusOf(key) !== 'confirmed').length;
              return (
                <div
                  key={groupLabel}
                  data-si-group={groupLabel}
                  style={{
                    border: `1px solid ${color.hairline}`, borderRadius: radius.control,
                    padding: `${space.xs}px ${space.sm}px`, minWidth: 320, background: color.canvas,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, padding: '2px 0 6px' }}>
                    <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>{groupLabel}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: groupPending > 0 ? color.warningInk : color.mute }}>
                      {`待确认 ${groupPending} / ${group.length}`}
                    </span>
                  </div>
                  {group.map((monthKey, monthIndex) => {
                    const status = statusOf(monthKey);
                    const value = committedOf(monthKey);
                    const atBaseline = value === baselineOf(monthKey);
                    const draft = drafts[monthKey];
                    const issue = issues[monthKey];
                    const invalid = issue === 'invalid';
                    const statusText = status === 'confirmed'
                      ? `${monthKey} · 已确认`
                      : status === 'modified' || !atBaseline
                        ? '已修改·待确认'
                        : '基准·待确认';
                    return (
                      <div
                        key={monthKey}
                        data-si-month={monthKey}
                        style={{
                          borderTop: monthIndex === 0 ? 'none' : `1px solid ${color.hairline}`,
                          padding: '6px 0',
                          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: color.ink, minWidth: 52 }}>{monthKey}</span>
                          <input
                            aria-label={`${monthKey} SI 计划（千台/月）`}
                            aria-invalid={invalid}
                            inputMode="numeric"
                            value={draft ?? String(Math.round(value / 1000))}
                            onChange={(event) => {
                              const raw = event.target.value;
                              setDrafts((prev) => ({ ...prev, [monthKey]: raw }));
                              setIssues((prev) => (prev[monthKey] == null ? prev : { ...prev, [monthKey]: undefined }));
                            }}
                            onBlur={() => handleBlur(monthKey)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                (event.target as HTMLInputElement).blur();
                              } else if (event.key === 'Escape') {
                                // Esc 恢复最后合法值：丢弃草稿与错误态，回显已提交值。
                                setDrafts((prev) => {
                                  if (!(monthKey in prev)) return prev;
                                  const next = { ...prev };
                                  delete next[monthKey];
                                  return next;
                                });
                                setIssues((prev) => (prev[monthKey] == null ? prev : { ...prev, [monthKey]: undefined }));
                              }
                            }}
                            style={inputStyle(invalid)}
                          />
                          <span style={{ fontSize: 11, color: color.mute }}>千台</span>
                          <span
                            data-si-status={monthKey}
                            style={{
                              display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px',
                              borderRadius: radius.pill, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                              background: status === 'confirmed' ? color.ink : status === 'modified' ? color.warningSoft : color.canvasSoft2,
                              color: status === 'confirmed' ? color.onPrimary : status === 'modified' ? color.warningInk : color.body,
                              border: status === 'confirmed' ? 'none' : `1px solid ${color.hairline}`,
                            }}
                          >
                            {statusText}
                          </span>
                          {value === 0 && <span style={{ fontSize: 11, fontWeight: 600, color: color.body }}>本月不补货</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {status !== 'confirmed' && (
                            <button
                              type="button"
                              data-si-confirm={monthKey}
                              aria-label={atBaseline ? undefined : `确认 ${monthKey} SI`}
                              title={`确认 ${monthKey} SI = ${fmtThousandUnits(value)} 千台：写入确认工作区（数值仍以 params 为准）`}
                              onClick={() => confirmMonth(monthKey)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px',
                                borderRadius: radius.control, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                                cursor: 'pointer', font: 'inherit',
                                background: color.ink, border: `1px solid ${color.ink}`, color: color.onPrimary,
                              }}
                            >
                              确认本月
                            </button>
                          )}
                          <button
                            type="button"
                            data-si-restore={monthKey}
                            aria-label={`恢复 ${monthKey} 基准 SI`}
                            title={`恢复 ${monthKey} 基准值 ${fmtThousandUnits(baselineOf(monthKey))} 千台，该月重新待确认`}
                            onClick={() => restoreBaseline(monthKey)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px',
                              borderRadius: radius.control, fontSize: 11, whiteSpace: 'nowrap',
                              cursor: 'pointer', font: 'inherit',
                              background: color.canvas, border: `1px solid ${color.hairline}`, color: color.body,
                            }}
                          >
                            恢复基准
                          </button>
                          <span
                            data-si-split={monthKey}
                            className="tnum"
                            title="拆周 = siWeeklyPlan（月总量→周整数守恒，余数月初起 +1）"
                            style={{ fontSize: 11, color: color.mute }}
                          >
                            {splitOfWeek(monthKey).map(({ weekId, units }) => `${weekId} ${fmtThousandUnits(units)}`).join(' · ')}
                            {' 千台'}
                          </span>
                        </div>
                        {issue != null && (
                          <span
                            role={invalid ? 'alert' : undefined}
                            style={{
                              gridColumn: '1 / -1', fontSize: 11,
                              color: invalid ? color.error : color.mute, fontWeight: invalid ? 600 : 400,
                            }}
                          >
                            {issue === 'invalid' ? SI_INVALID_TEXT : SI_BLANK_TEXT}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SI 联动反馈（aria-live=polite；写实际前后变化，不生成泛化赞美）。 */}
      <div
        role="status"
        aria-live="polite"
        data-si-feedback=""
        style={{
          minHeight: 20, fontSize: 12, lineHeight: 1.6, color: color.body,
          padding: `0 ${space.sm}px`, marginBottom: space.sm,
        }}
      >
        {feedback}
      </div>

      <IoBar
        input="SI 月计划（唯一人工输入，逐月确认）· 上游基线 SO（大盘+量价考量）· 期初渠道库存"
        output={`未来 DOS / 库存反算与健康判定；可售不足周按可售量修正回写主图（${cappedWeeks.length ? `${cappedWeeks[0]!.weekId} 起` : '当前未触发'}）`}
      />
        <FlowBar
          ariaLabel="库存链路：主图基线 SO → 反算 DOS/库存 → 健康判定 → 上限修正 → 回写主图"
          steps={flowSteps}
        />
      </CollapsibleSection>

      {/* 图（渠道库存柱 + 渠道 DOS 线）：默认视图保留（2026-11-05 视觉精简二轮） */}
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`库存验证：渠道库存柱（右轴，万台）+ 渠道 DOS 线（左轴）；全流程 DOS 不上图，悬停库存柱读数值；${cappedWeeks.length ? `${cappedWeeks[0]!.weekId} 起库存上限修正（按可售量修正回写主图，修正周琥珀描边）` : '当前库存可支撑基线 SO，未触发修正'}。详细判定见下方输出框。`}
          style={{ display: 'block', height: 'auto', minWidth: 700 }}
        >
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
          {weeks.map((week, index) => (index % 4 === 0 || index === weeks.length - 1
            ? <text key={week.weekId} x={x(index)} y={H - 8} textAnchor="middle" fontSize={10} fill={color.mute}>{weekBucketIds[index]}</text>
            : null))}
          {show('inv') && weeks.map((week, index) => {
            const forecast = index >= forecastStart;
            return (
              <rect
                key={`inv-${week.weekId}`}
                x={x(index) - barW / 2}
                y={yInv(week.channelInv ?? 0)}
                width={barW}
                height={Math.max(1, TOP + PLOT_H - yInv(week.channelInv ?? 0))}
                rx={2}
                fill={forecast ? color.canvas : color.ink}
                fillOpacity={forecast ? 1 : 0.14}
                stroke={forecast ? color.ink : color.hairline}
                strokeOpacity={forecast ? 0.5 : 1}
                strokeWidth={1}
                strokeDasharray={forecast ? '4 3' : undefined}
              >
                <title>{`${week.weekId} 渠道库存 ${fmtWan(week.channelInv)} · 渠道 DOS ${week.channelDos ?? '—'} 天 · 全流程 DOS ${week.fullDos ?? '—'} 天${week.si > 0 ? ` · SI ${fmtWan(week.si)}` : ''}`}</title>
              </rect>
            );
          })}
          {show('chdos') && (
            <>
              {/* DOS 线宽 = 全站主类线基准 2（实/虚同宽，虚线 dasharray 区分，2026-11-05） */}
              <path d={dosLine(0, Math.max(0, forecastStart - 1))} fill="none" stroke={color.link} strokeWidth={2} />
              <path d={dosLine(forecastStart, weeks.length - 1)} fill="none" stroke={color.link} strokeWidth={2} strokeDasharray="5 4" />
            </>
          )}
          {result.firstAdjustedWeek != null && (() => {
            const index = weeks.findIndex((week) => week.weekId === result.firstAdjustedWeek);
            if (index < 0) return null;
            const px = x(index);
            return (
              <g>
                <line x1={px} y1={TOP} x2={px} y2={TOP + PLOT_H} stroke={color.warning} strokeDasharray="3 4" opacity={0.7} />
                <text x={px + 4} y={TOP + 20} fontSize={9.5} fontWeight={600} fill={color.warningInk}>{`${result.firstAdjustedWeek} 起修正`}</text>
              </g>
            );
          })()}
        </svg>
      </div>
      <WorkbenchLegend items={legendItems} hidden={hidden} onToggle={toggle} style={{ marginTop: 0 }} />

      {/* 「输出与规则」收起区（2026-11-05 视觉精简二轮，默认收起）：输出框
          （健康判定 + 库存上限修正结论 + 回主图导航 + 规则行） */}
      <CollapsibleSection label="输出与规则">
        {/* 输出框：健康判定（预警解释）+ 库存上限修正（结论级，只讲结果）+ 回主图导航 */}
        <div style={{ padding: `${space.md - 2}px ${space.md}px`, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft, display: 'grid', gap: 6, fontSize: 12, lineHeight: 1.7, color: color.body }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ flex: 'none', fontWeight: 600, color: color.body }}>输出</span>
          <span>
            {cappedWeeks.length
              ? <><b style={{ color: color.warningInk }}>{`${cappedWeeks[0]!.weekId} 起可售不足`}</b>，按可售量修正并回写主图（修正周琥珀描边标识）</>
              : '当前考量未触发库存修正（库存可支撑基线 SO），主图预测柱不受影响'}
          </span>
        </div>
        {cappedWeeks.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flex: 'none', fontWeight: 600, color: color.body }} title={MIN_FORMULA_TITLE}>判定</span>
            <span style={{ display: 'grid', gap: 2 }}>
              {cappedWeeks.map((week) => (
                <span key={week.weekId} className="tnum">{verdictLine(week)}</span>
              ))}
            </span>
          </div>
        )}
        {cappedWeeks.length > 0 && onNavigate != null && result.firstAdjustedWeek != null && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 'none', fontWeight: 600, color: color.body }}>跳转</span>
            <button
              type="button"
              data-nav-to-week={result.firstAdjustedWeek}
              onClick={() => onNavigate(result.firstAdjustedWeek!)}
              title={`跨卡导航：回主图定位 ${result.firstAdjustedWeek}（只滚动与临时聚焦，不清除手调、不改库存）`}
              style={{
                display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 10px',
                borderRadius: radius.control, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                cursor: 'pointer', font: 'inherit',
                background: color.canvas, border: `1px solid ${color.hairlineStrong}`, color: color.ink,
              }}
            >
              回主图查看该周
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 'none', fontWeight: 600, color: color.body }}>规则</span>
          <span title={MIN_FORMULA_TITLE}>{`DOS ${DOS_BAND.min}–${DOS_BAND.max} 天 · 降幅预警 ${INV_CRASH_LIGHT_PCT}%／${INV_CRASH_HEAVY_PCT}%`}</span>
          <StateChip label="阈值未核定" title="DOS 合理带与库存降幅预警阈值尚未获业务核定" />
        </div>
        </div>
      </CollapsibleSection>
    </section>
  );
}
