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
// - 默认视图 = 卡头（活状态 chip 保留在头）+ 图（柱 + DOS 线）+ 图例。
// 2026-11-05 拍板实施（Eason：库存+销毛成本都先按推荐改；依据
// inventory-card-hifi.html + si-input-variants.html V2「输入+库存即时联动」）：
// - SI 区展开态 = V2 双栏：左列 12 个月输入行（月份 + 输入 + 状态 chip +
//   拆周读数 + 恢复基准/确认本月），右列「期末渠道库存」迷你柱图随任意月 SI
//   合法提交即时重算（复用 v3 主链 computeWorkbench 同源递推，改 SI → 库存柱
//   立刻反映）；V4 三月组网格退役（data-si-group 不再产出）。
// - 纪律全保留：逐月确认（无「全部确认」）、0=本月不补货、空白≠0、非法输入
//   不静默钳制（红色错误态）、拆周守恒读数、恢复基准。
// - 收起态保持：「▸ SI 月计划与链路」一条默认收起（CollapsibleSection），按
//   高保真置于图与图例之下；卡头活状态读数保留（SI 待确认 N/12、未触发 /
//   首修正周起）；说明性 chip（「模拟」「修正段 · 波动参考 ±2%」等）退役为
//   单个 HintInfo（title 合并说明并保留模拟语境）。
// - 图例全部可点显隐（WorkbenchLegend 规格）；svg 文本取值对齐价格走势页
//   同源组件（font.family / 10px / color.mute / tabular-nums）。
// - 不实现时间轨（全局已退役）。
// 2026-11-06 P0（价格走势设计语言对齐，来源回执 forecast-gap-20261106）：
// - P0-1 viewBox 宽 = ResizeObserver 实测容器宽（CHART_W_FALLBACK 720 仅作
//   无 RO / jsdom 回退），刻度字号回归真实 px（同 MarketBusPanel / 主图）。
// - P0-2 SI「已确认」状态胶囊退出墨色（墨色只留给唯一主按钮），改已登记的
//   alert.lifecycle.resolved 绿色系（文字 + 底色双通道，与预警系统同源）。
// 2026-11-07 Batch 2（batch2-iterate-forecast §3.2）：SI 修改必须内联填写
// 修正原因——数值与原因同笔保存（withSiPlanEntry：onSiMonthLive 携带原因，
// 页面写 params.siPlanMonthly + params.siReasons）；缺原因置 'reason' 阻断
// 态不提交；保存（失焦/Enter/保存按钮）才回写，取消/Esc 不写入；恢复基准
// 清原因；已提交原因在行内「原因：…」展示并进步间审计轨迹。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { color, font, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { ForecastCalendar, WeekId } from './workbenchCalendar';
import type { WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchParams, WorkbenchResult, WorkbenchWeekResult } from './workbenchModel';
import {
  DOS_BAND,
  INV_CRASH_HEAVY_PCT,
  INV_CRASH_LIGHT_PCT,
  computeWorkbench,
  siWeeklyPlan,
} from './workbenchModel';
import { firstForecastIndex } from './workbenchChartSegments';
import {
  CollapsibleSection,
  FlowBar,
  HintInfo,
  IoBar,
  SectionHead,
  WorkbenchLegend,
  fmtWan,
  wanOf,
  workbenchCardStyle,
  type FlowStep,
  type LegendItem,
} from './WorkbenchBits';
import type { SiConfirmation, SiConfirmationState, SiSaveState } from './useSiConfirmations';
import { siMonthStatusOf } from './useSiConfirmations';

/** P0-1（2026-11-06）：绘图宽 = ResizeObserver 实测容器宽；本常量仅作无 RO /
 *  jsdom 环境的回退估值（2026-11-04 视觉一致性按左列实际渲染宽 ≈720 定）。
 *  图表地板宽由包裹层 minWidth 保证，不再作为固定绘制宽拉伸。 */
const CHART_W_FALLBACK = 720;
const H = 252;
const LEFT = 40;
const RIGHT = 52;
const TOP = 14;
const BOTTOM = 26;
const PLOT_H = H - TOP - BOTTOM;

// V2 右列迷你柱图（si-input-variants V2 语义）：期末渠道库存，月粒度 12 柱。
const MINI_W = 300;
const MINI_H = 122;
const MINI_L = 10;
const MINI_R = 8;
const MINI_T = 16;
const MINI_B = 20;
const MINI_PLOT_W = MINI_W - MINI_L - MINI_R;
const MINI_PLOT_H = MINI_H - MINI_T - MINI_B;

/** svg 文本取值（全局 #8 对齐价格走势页同源组件）：font.family + tabular-nums。 */
const axisTextProps = {
  fontFamily: font.family,
  style: { fontVariantNumeric: 'tabular-nums' } as CSSProperties,
};

/** 库存上限修正公式（收 title，不进正文）。 */
const MIN_FORMULA_TITLE = '库存上限修正：min(基线 SO, 可售)；可售 = 期初库存 + SI 补货';

/** SI 单月取值边界（千台/月）：0 合法（本月不补货），上限沿用既有 0–2000 带。 */
const SI_MAX_KUNITS = 2000;
const SI_INVALID_TEXT = 'SI 需为 0–2000 的整数（千台）';
const SI_BLANK_TEXT = '请输入 0 或恢复基准';
/** Batch 2（2026-11-07）：SI 修改必须内联填写修正原因（保存才回写，取消不写入）。 */
const SI_REASON_REQUIRED_TEXT = '请填写修正原因（必填）：填原因后按 Enter 或失焦保存；Esc 取消不写入';

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

/** 单月 SI 草稿的本地态种类：无 / 空白（不提交）/ 非法（不提交）/ 缺原因（不提交）。 */
type SiDraftIssue = 'blank' | 'invalid' | 'reason';

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
  /** 合法值 + 原因提交（Batch 2：修改值必须带原因；原因与数值同笔写 params 并
   *  全链重算，保存才回写、取消不写入）。 */
  onSiMonthLive?: (monthKey: string, units: number, reason: string) => void;
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
  /** P0-1（2026-11-06）：图区实测渲染宽——viewBox 宽 = 真实渲染宽（缩放比 1，
   *  刻度字号回归真实 px）；无 RO / jsdom 环境回退 CHART_W_FALLBACK。 */
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const [chartW, setChartW] = useState(CHART_W_FALLBACK);
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.round(entry.contentRect.width);
        setChartW((prev) => (width >= 320 && width !== prev ? width : prev));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ------------------------------------------------------------
  // SI 提交值的本地镜像（乐观呈现）：提交即更新本卡读数与状态，不等页面
  // 回写 params；页面回写一致则无感，页面外部变更（如重置基准）按差异采纳。
  // Batch 2：修正原因（siReasons）与数值同笔——镜像 / 草稿 / 提交三态同构。
  // ------------------------------------------------------------
  const [siLocal, setSiLocal] = useState<Record<string, number>>(() => ({ ...params.siPlanMonthly }));
  const [siReasonsLocal, setSiReasonsLocal] = useState<Record<string, string>>(() => ({ ...params.siReasons }));
  const reportedRef = useRef(siLocal);
  const reportedReasonsRef = useRef(siReasonsLocal);
  useEffect(() => {
    const reported = reportedRef.current;
    const externalChanged = Object.keys(params.siPlanMonthly)
      .some((key) => reported[key] !== params.siPlanMonthly[key]);
    if (externalChanged) {
      const next = { ...params.siPlanMonthly };
      reportedRef.current = next;
      setSiLocal(next);
    }
    const reportedReasons = reportedReasonsRef.current;
    const reasonsChanged = Object.keys(params.siReasons)
      .some((key) => reportedReasons[key] !== params.siReasons[key])
      || Object.keys(reportedReasons).some((key) => params.siReasons[key] == null);
    if (reasonsChanged) {
      const nextReasons = { ...params.siReasons };
      reportedReasonsRef.current = nextReasons;
      setSiReasonsLocal(nextReasons);
    }
  }, [params.siPlanMonthly, params.siReasons]);

  // 确认记录的本地镜像（乐观呈现）：props（页面工作区）优先，本地确认即时可见。
  const [localConfirmed, setLocalConfirmed] = useState<Record<string, SiConfirmation>>({});
  const byMonth: SiConfirmationState['byMonth'] = { ...localConfirmed, ...confirmationState.byMonth };

  // 本地 raw 草稿与提交阻断态（输入中不提交；B.5.7 + Batch 2 原因必填）。
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Record<string, SiDraftIssue | undefined>>({});

  const monthKeys = useMemo(() => fixture.forecastMonths.map((month) => month.key), [fixture]);
  const committedOf = (monthKey: string): number => siLocal[monthKey] ?? params.siPlanMonthly[monthKey] ?? 0;
  const committedReasonOf = (monthKey: string): string => siReasonsLocal[monthKey] ?? '';
  const baselineOf = (monthKey: string): number => fixture.inventory.siPlanMonthly[monthKey] ?? 0;

  const clearDraftOf = (monthKey: string) => {
    setDrafts((prev) => {
      if (!(monthKey in prev)) return prev;
      const next = { ...prev };
      delete next[monthKey];
      return next;
    });
    setIssues((prev) => (prev[monthKey] == null ? prev : { ...prev, [monthKey]: undefined }));
  };

  const commitMonth = (monthKey: string, units: number, reason: string) => {
    const next = { ...siLocal, [monthKey]: units };
    reportedRef.current = next;
    setSiLocal(next);
    const trimmed = reason.trim();
    const nextReasons = { ...siReasonsLocal };
    if (trimmed !== '') nextReasons[monthKey] = trimmed;
    else delete nextReasons[monthKey];
    reportedReasonsRef.current = nextReasons;
    setSiReasonsLocal(nextReasons);
    setDrafts((prev) => {
      if (!(monthKey in prev)) return prev;
      const nextDrafts = { ...prev };
      delete nextDrafts[monthKey];
      return nextDrafts;
    });
    setReasonDrafts((prev) => {
      if (!(monthKey in prev)) return prev;
      const nextReasonDrafts = { ...prev };
      delete nextReasonDrafts[monthKey];
      return nextReasonDrafts;
    });
    setIssues((prev) => (prev[monthKey] == null ? prev : { ...prev, [monthKey]: undefined }));
    onSiMonthLive?.(monthKey, units, reason);
  };

  /** 保存路径（数值失焦 / 原因 Enter 共用）：数值合法 + 与已提交值不同时必须
   *  已填原因；缺原因置 'reason' 阻断态（保存才回写，取消不写入）。 */
  const tryCommit = (monthKey: string) => {
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
    const units = num * 1000;
    if (units === committedOf(monthKey)) {
      // 数值与已提交值一致（含改回原值）：只清草稿，不要求原因。
      clearDraftOf(monthKey);
      return;
    }
    const reason = (reasonDrafts[monthKey] ?? '').trim();
    if (reason === '') {
      setIssues((prev) => ({ ...prev, [monthKey]: 'reason' }));
      return;
    }
    commitMonth(monthKey, units, reason);
  };

  const handleBlur = tryCommit;

  const confirmMonth = (monthKey: string) => {
    const value = committedOf(monthKey);
    setLocalConfirmed((prev) => ({
      ...prev,
      [monthKey]: { confirmedValue: value, confirmedAt: new Date().toISOString() },
    }));
    onConfirmMonth?.(monthKey, value);
  };

  const restoreBaseline = (monthKey: string) => {
    // 单月恢复基准：回写基准值 + 清确认记录与修正原因（该月重新待确认；B.5.7）。
    commitMonth(monthKey, baselineOf(monthKey), '');
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
  // V2 右列联动（已拍板 si-input-variants.html V2）：期末渠道库存迷你柱图随
  // 任意月 SI 合法提交即时重算——复用 v3 主链 computeWorkbench 同源递推（把
  // 乐观 siLocal 写回 siPlanMonthly），改 SI → 库存柱立刻反映；页面回写
  // params 后与 props.result 汇合同帧一致。
  // ------------------------------------------------------------
  const siPreview = useMemo(
    () => computeWorkbench(fixture, { ...params, siPlanMonthly: siLocal }),
    [fixture, params, siLocal],
  );
  const monthEndInv = useMemo(() => {
    const entries = monthKeys.map((monthKey) => ({ monthKey, value: null as number | null }));
    const byKey = new Map(entries.map((entry) => [entry.monthKey, entry]));
    for (const week of siPreview.weeks) {
      if (week.status !== 'forecast' || week.channelInv == null) continue;
      const entry = byKey.get(week.monthKey);
      if (entry != null) entry.value = week.channelInv; // 周序遍历，月末周最后写入
    }
    return entries;
  }, [siPreview, monthKeys]);
  const miniInvMax = Math.max(
    1,
    niceCeil(Math.max(1, ...monthEndInv.map((entry) => entry.value ?? 0))),
  );

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
  /** P0-1：绘图宽随实测渲染宽（chartW）派生，不再用固定 720。 */
  const plotW = chartW - LEFT - RIGHT;
  const slot = plotW / weeks.length;
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

  const inputStyle = (invalid: boolean): CSSProperties => ({
    width: 72, padding: '2px 6px', fontSize: 12, fontVariantNumeric: 'tabular-nums',
    border: `1px solid ${invalid ? color.error : color.hairline}`, borderRadius: radius.control,
    color: color.ink, background: color.canvas,
  });

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="③ 库存修正"
        hint="SI 月计划逐月确认（唯一人工输入）：修改数值必须内联填写修正原因，保存（失焦/Enter/保存按钮）才回写主链，「确认本月」写入确认工作区，取消/Esc 不写入；未确认时主图结果为参考预览。图上只留渠道库存柱（右轴，万台）+ 渠道 DOS 线（左轴）；可售不足的预测周按可售量修正并回写主图，修正周琥珀描边标识。"
        extra={<>
          <HintInfo
            label="库存修正卡说明"
            text="模拟数据 · 推演参考，波动 ±2%：库存推演为演示样本，SI 计划仅存会话草稿，不写真实数据；修正段按可售量修正，±2% 为演示波动参考口径，非统计置信区间；SI 月计划逐月确认（唯一人工输入），未确认时主图结果为参考预览。"
          />
          <StateChip
            label={`SI 待确认 ${pendingCount} / 12${pendingCount > 0 ? ' · 未全部确认' : ' · 已全部确认'}`}
            title={pendingCount > 0
              ? 'SI 月计划需逐月确认；未确认时主图为参考预览，不标人工已确认'
              : '12 个预测月 SI 已全部确认'}
          />
          {capTriggered
            ? <StateChip label={`${result.firstAdjustedWeek} 起`} title={`库存上限修正自 ${result.firstAdjustedWeek} 起（修正周琥珀描边）`} />
            : <StateChip label="未触发" title="当前库存可支撑基线 SO：未触发库存上限修正" />}
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

      {/* 图（渠道库存柱 + 渠道 DOS 线）：默认视图 = 卡头 + 图 + 图例（2026-11-05 拍板实施）。
          P0-1（2026-11-06）：viewBox 宽 = 包裹层实测渲染宽（chartW），地板宽 700 由
          包裹层 minWidth 保证（窄容器横向滚动，不缩放字号）。 */}
      <div style={{ overflowX: 'auto' }}>
        <div ref={chartWrapRef} style={{ minWidth: 700 }}>
        <svg
          viewBox={`0 0 ${chartW} ${H}`}
          width="100%"
          role="img"
          aria-label={`库存验证：渠道库存柱（右轴，万台）+ 渠道 DOS 线（左轴）；全流程 DOS 不上图，悬停库存柱读数值；${cappedWeeks.length ? `${cappedWeeks[0]!.weekId} 起库存上限修正（按可售量修正回写主图，修正周琥珀描边）` : '当前库存可支撑基线 SO，未触发修正'}。详细判定见下方输出框。`}
          style={{ display: 'block', height: 'auto' }}
        >
          {[0, 1].map((fraction) => {
            const gy = TOP + PLOT_H * (1 - fraction);
            return (
              <g key={fraction}>
                <line x1={LEFT} y1={gy} x2={chartW - RIGHT} y2={gy} stroke={fraction === 0 ? color.hairlineStrong : color.hairline} />
                <text {...axisTextProps} x={LEFT - 6} y={gy + 3.5} fontSize={10} fill={color.mute} textAnchor="end">{Math.round(dosMax * fraction)}</text>
              </g>
            );
          })}
          <text {...axisTextProps} x={LEFT - 6} y={TOP - 3} fontSize={10} fill={color.mute} textAnchor="end">天</text>
          {[0, 0.5, 1].map((fraction) => (
            <text {...axisTextProps} key={fraction} x={chartW - RIGHT + 6} y={yInv(invMax * fraction) + 3.5} fontSize={10} fill={color.mute}>{wanOf(invMax * fraction)}</text>
          ))}
          <text {...axisTextProps} x={chartW - RIGHT + 6} y={TOP - 3} fontSize={10} fill={color.mute}>万台</text>
          {weeks.map((week, index) => (index % 4 === 0 || index === weeks.length - 1
            ? <text {...axisTextProps} key={week.weekId} x={x(index)} y={H - 8} textAnchor="middle" fontSize={10} fill={color.mute}>{weekBucketIds[index]}</text>
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
                <text {...axisTextProps} x={px + 4} y={TOP + 20} fontSize={10} fontWeight={600} fill={color.warningInk}>{`${result.firstAdjustedWeek} 起修正`}</text>
              </g>
            );
          })()}
        </svg>
        </div>
      </div>
      <WorkbenchLegend items={legendItems} hidden={hidden} onToggle={toggle} style={{ marginTop: 0 }} />

      {/* 「SI 月计划与链路」收起区（默认收起，组件内存态；按高保真置于图与图例之下）。
          展开态 = si-input-variants.html V2「输入 + 库存即时联动」双栏（已拍板）：
          左列 12 个月输入行（逐月确认纪律全保留），右列期末渠道库存迷你柱图随任意月
          SI 合法提交即时重算（v3 主链 computeWorkbench 同源递推）。不实现时间轨。 */}
      <CollapsibleSection label="SI 月计划与链路">
        <div
          data-si-cell-row=""
          role="group"
          aria-label="SI 月计划（按月格子输入）"
          style={{
            display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(230px, 300px)',
            gap: space.md, alignItems: 'start', marginBottom: space.sm,
          }}
        >
          {/* 左列：12 个月输入行（月份 + 输入 + 状态 chip + 拆周读数 + 恢复基准/确认本月）。 */}
          <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: space.sm, marginBottom: 2, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>SI 月计划</span>
              <span style={{ fontSize: 11, color: color.mute }}>
                千台/月 · 月内均分到周（整数守恒，余数月初起 +1）· 逐月确认，无「全部确认」
              </span>
            </div>
            {monthKeys.map((monthKey) => {
              const status = statusOf(monthKey);
              const value = committedOf(monthKey);
              const atBaseline = value === baselineOf(monthKey);
              const draft = drafts[monthKey];
              const issue = issues[monthKey];
              const invalid = issue === 'invalid';
              const draftNum = draft != null && draft.trim() !== '' ? Number(draft.trim()) : null;
              const draftNumOk = draftNum != null && Number.isFinite(draftNum) && Number.isInteger(draftNum) && draftNum >= 0 && draftNum <= SI_MAX_KUNITS;
              const showReasonEditor = issue === 'reason' || (draftNumOk && Math.round(draftNum * 1000) !== value);
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
                    border: `1px solid ${invalid ? color.error : color.hairline}`, borderRadius: radius.control,
                    background: color.canvas, padding: '6px 10px', display: 'grid', gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                          // Esc 取消：丢弃数值与原因草稿（取消不写入），回显已提交值。
                          clearDraftOf(monthKey);
                          setReasonDrafts((prev) => {
                            if (!(monthKey in prev)) return prev;
                            const next = { ...prev };
                            delete next[monthKey];
                            return next;
                          });
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
                        // P0-2（2026-11-06）：已确认退出墨色（墨色只留给唯一主按钮），
                        // 改已登记的 alert.lifecycle.resolved 绿色系（文字 + 底色双通道）。
                        background: status === 'confirmed' ? color.alert.lifecycle.resolved.bg : status === 'modified' ? color.warningSoft : color.canvasSoft2,
                        color: status === 'confirmed' ? color.alert.lifecycle.resolved.fg : status === 'modified' ? color.warningInk : color.body,
                        border: `1px solid ${status === 'confirmed' ? color.alert.lifecycle.resolved.bg : color.hairline}`,
                      }}
                    >
                      {statusText}
                    </span>
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {value === 0 && <span style={{ fontSize: 11, fontWeight: 600, color: color.body }}>本月不补货</span>}
                    <span
                      data-si-split={monthKey}
                      className="tnum"
                      title="拆周 = siWeeklyPlan（月总量→周整数守恒，余数月初起 +1）"
                      style={{ fontSize: 11, color: color.mute }}
                    >
                      {splitOfWeek(monthKey).map(({ weekId, units }) => `${weekId} ${fmtThousandUnits(units)}`).join(' · ')}
                      {' 千台'}
                    </span>
                    {committedReasonOf(monthKey) !== '' && (
                      <span
                        data-si-reason={monthKey}
                        title="SI 修正原因（Batch 2 起必填，随数值同笔写入审计轨迹）"
                        style={{ fontSize: 11, color: color.warningInk, minWidth: 0 }}
                      >
                        {`原因：${committedReasonOf(monthKey)}`}
                      </span>
                    )}
                  </div>
                  {/* 内联原因输入（Batch 2：修改值必填原因，保存才回写；Esc 取消不写入）。
                      出现时机 = 数值草稿合法且与已提交值不同（含 'reason' 阻断态）。 */}
                  {showReasonEditor && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: color.body, minWidth: 0 }}>
                        {`修正原因（必填）`}
                        <input
                          aria-label={`${monthKey} SI 修正原因（必填）`}
                          value={reasonDrafts[monthKey] ?? ''}
                          placeholder="如：渠道压货节奏提前"
                          onChange={(event) => setReasonDrafts((prev) => ({ ...prev, [monthKey]: event.target.value }))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              tryCommit(monthKey);
                            } else if (event.key === 'Escape') {
                              clearDraftOf(monthKey);
                              setReasonDrafts((prev) => {
                                if (!(monthKey in prev)) return prev;
                                const next = { ...prev };
                                delete next[monthKey];
                                return next;
                              });
                            }
                          }}
                          style={{
                            ...inputStyle(false), flex: '1 1 160px', width: 'auto',
                            borderColor: issue === 'reason' ? color.error : color.hairline,
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        data-si-save={monthKey}
                        aria-label={`保存 ${monthKey} SI 修改`}
                        title="保存数值与原因（同笔写入参数与主链）；原因必填"
                        disabled={(reasonDrafts[monthKey] ?? '').trim() === ''}
                        onClick={() => tryCommit(monthKey)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px',
                          borderRadius: radius.control, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                          cursor: 'pointer', font: 'inherit',
                          background: color.canvas, border: `1px solid ${color.hairline}`,
                          color: (reasonDrafts[monthKey] ?? '').trim() === '' ? color.hairlineStrong : color.body,
                        }}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        data-si-cancel={monthKey}
                        aria-label={`取消 ${monthKey} SI 修改`}
                        title="取消：不写入任何参数，回显已提交值"
                        onClick={() => {
                          clearDraftOf(monthKey);
                          setReasonDrafts((prev) => {
                            if (!(monthKey in prev)) return prev;
                            const next = { ...prev };
                            delete next[monthKey];
                            return next;
                          });
                        }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px',
                          borderRadius: radius.control, fontSize: 11, whiteSpace: 'nowrap',
                          cursor: 'pointer', font: 'inherit',
                          background: color.canvas, border: `1px solid ${color.hairline}`, color: color.body,
                        }}
                      >
                        取消
                      </button>
                    </div>
                  )}
                  {issue != null && (
                    <span
                      role={invalid || issue === 'reason' ? 'alert' : undefined}
                      style={{ fontSize: 11, color: invalid || issue === 'reason' ? color.error : color.mute, fontWeight: invalid || issue === 'reason' ? 600 : 400 }}
                    >
                      {issue === 'invalid' ? SI_INVALID_TEXT : issue === 'reason' ? SI_REASON_REQUIRED_TEXT : SI_BLANK_TEXT}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 右列：期末渠道库存迷你柱图（随任意月 SI 修改即时重算 · v3 主链同源递推）。 */}
          <div data-si-mini-chart="" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: color.mute, marginBottom: 4 }}>期末渠道库存（随 SI 即时重算 · 万台）</div>
            <svg
              viewBox={`0 0 ${MINI_W} ${MINI_H}`}
              width="100%"
              role="img"
              aria-label={`期末渠道库存迷你柱图：12 个预测月的月末读数（右轴万台），随任意月 SI 合法提交即时重算（v3 主链 computeWorkbench 同源递推）；悬停柱读月份与库存值。`}
              style={{ display: 'block', height: 'auto' }}
            >
              <line x1={MINI_L} y1={MINI_T} x2={MINI_W - MINI_R} y2={MINI_T} stroke={color.hairline} />
              <text {...axisTextProps} x={MINI_L} y={MINI_T - 4} fontSize={10} fill={color.mute}>{`${wanOf(miniInvMax)} 万台`}</text>
              <line x1={MINI_L} y1={MINI_T + MINI_PLOT_H} x2={MINI_W - MINI_R} y2={MINI_T + MINI_PLOT_H} stroke={color.hairlineStrong} />
              {monthEndInv.map(({ monthKey, value }, index) => {
                const slotW = MINI_PLOT_W / monthEndInv.length;
                const barMiniW = Math.min(16, slotW * 0.52);
                const v = value ?? 0;
                const topY = MINI_T + MINI_PLOT_H * (1 - v / miniInvMax);
                return (
                  <g key={monthKey}>
                    <rect
                      data-si-mini-bar={monthKey}
                      x={MINI_L + (index + 0.5) * slotW - barMiniW / 2}
                      y={topY}
                      width={barMiniW}
                      height={Math.max(1, MINI_T + MINI_PLOT_H - topY)}
                      rx={1.5}
                      fill={color.ink}
                      fillOpacity={0.16}
                      stroke={color.hairline}
                    >
                      <title>{`${monthKey} 期末渠道库存 ${fmtWan(v)}（随 SI 即时重算）`}</title>
                    </rect>
                    {(index % 2 === 0 || index === monthEndInv.length - 1) && (
                      <text
                        {...axisTextProps}
                        x={MINI_L + (index + 0.5) * slotW}
                        y={MINI_H - 6}
                        textAnchor="middle"
                        fontSize={10}
                        fill={color.mute}
                      >
                        {monthKey.slice(2)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <div style={{ fontSize: 11, color: color.mute, marginTop: 6 }}>
              改任意月 SI → 柱即时反映期末库存变化（v3 主链同源递推）；确认状态仍在行内。
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
