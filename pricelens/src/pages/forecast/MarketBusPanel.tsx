// ============================================================
// 推演工作台 v2 · 层②大盘修正（2026-11-05 拍板：高保真 market-card-hifi
// 为实施规格，逐条对齐）：
// 主序列 = 月粒度（历史月度实线 + 统一 12 个预测月虚线，AI 季节 × 趋势季度
// 基线的月形分布，确定性外推禁随机）；卡头 = 「② 大盘修正」+ 模拟 chip +
// 「AI 推测 · 可改」徽章（hover 三步链 v2-3）+ 图内高亮开关 + 「事件与情报」
// 右侧滑出菜单按钮。
// 信息删减（全部删除不留残根）：头部说明长句、「输入与读数」整块（IoBar +
// AI 季基线读数行）、底部说明长句、事件与情报相关说明行；保留图例行
// （实际 / 预测 / AI 基线 / 事件，每项显隐开关）与月调整应用后反馈行
// （role=status）。月度证据浮框（v2-1）与图上双锚点（v2-2）不动。
// 事件形态（2026-11-05 拍板）：
// - 右侧滑出菜单（默认收起，图表占满全宽）：transform translateX 过渡 +
//   半透明遮罩，Esc / ✕ / 遮罩点击关闭；内容 = 情报候选区
//   （IntelligenceReviewPanel availability="pending" 空态，真实候选另议）+
//   人工事件列表（名称、起止周段、幅度、衰减 + 编辑/删除）+「＋ 添加事件」。
// - 添加事件浮窗（绝对定位悬浮在图上，不改变图表区高度）：名称选填、
//   起止周 = 双月周历选择器（两月并排、行 = 整周[周一起]、行首 ISO 周号、
//   选中实蓝白字、区间内浅蓝、跨月连续、‹ › 月导航；起点行→终点行选择，
//   自动收起回填）、幅度 %、衰减 chips（递减/恒定）、说明选填；保存经
//   workbenchModel.monthSeedOfWeekRange 映射进既有 MarketMonthEventSeed
//   （startMonth/startDay = 起始周周一所属月与日期、durationMonths = 跨月数
//   向上取整；模型契约不变，仅新增可选 decay 形状）。
// - 图上标注统一（与量价参考同款箭头-线小标）：人工月事件（琥珀）与周口径
//   行业事件（灰）渲染在图顶部 = 左右小箭头 + 中间线，hover → 对应周区间
//   临时高亮；图内高亮开关（默认关）= 所有事件区间常驻底衬；「事件」图例
//   项控制小标层。月事件周范围经 workbenchModel.weekRangeOfMonthEvent 由
//   startMonth/startDay+duration 反推。
// - 衰减形状（2026-11-05 拍板）：MarketMonthEventSeed 可选 decay
//   （缺省递减 = 现行为）；flat = 事件覆盖的完整月恒定乘子（首月仍按日均摊
//   占比），公式见 workbenchModel.marketMonthEventFactor。
// 按月调整沿用会话草稿机制（onMonthOverride(key, null) 还原）。X 轴月标签 =
// 全站月视图日历格式 YYYY-MM；历史/预测分界虚线保留（定位参考非说明）。
// 卡体延续 A2 定高策略（MARKET_BODY_HEIGHT）+ 卡内纵向滚动。
// 全部视觉取 theme/tokens 既有 token 与 WorkbenchBits 既有控件语言，无新视觉。
// ============================================================
import { useState } from 'react';
import { Button, Input, InputNumber } from 'antd';
import { color, motion, radius, selectSoft, selectSoftInk, shadow, space, trackColors } from '../../theme/tokens';
import { prefersReducedMotion } from '../../theme/motion';
import type { CalendarWeek } from './workbenchCalendar';
import { buildForecastCalendar, durationOfWeekRange } from './workbenchCalendar';
import type { MarketMonthEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { MarketMonthPoint, MarketTrendWindowPoint, WorkbenchParams, WorkbenchResult } from './workbenchModel';
import {
  daysInMonthOf,
  MARKET_TREND_WINDOW_MONTHS,
  marketMonthEventFactor,
  marketMonthShape,
  marketTrendWindow,
  monthCoverageRatio,
  monthKeyOfDate,
  monthSeedOfWeekRange,
  monthsBetween,
  MONTH_OVERRIDE_MAX,
  MONTH_OVERRIDE_MIN,
  weekRangeOfMonthEvent,
} from './workbenchModel';
import { overrideSourceOf } from './workbenchModel';
import IntelligenceReviewPanel from './IntelligenceReviewPanel';
import { AiJudgeBadge, SectionHead, SimChip, WorkbenchLegend, fmtSignedPct, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

// 2026-11-04 视觉一致性：viewBox 宽度对齐左栏实际渲染宽度（≈760，缩放比 ≈1，
// 文字回归真实 px）；图高与全站 ≈252px 对齐。
const CHART_W = 760;
const CHART_H = 252;

/**
 * 卡体定高策略（2026-11-04 视觉一致性修订；2026-11-05 起卡体恒为单列——
 * 事件与情报收进右侧滑出菜单，图表恒占满全宽）：内容区固定 330px，超高由
 * 卡内纵向滚动兜底（lpl-card-scroll 细滚动条）。
 */
const MARKET_BODY_HEIGHT = 330;

/** 右侧滑出菜单宽度（高保真 340px）。 */
const DRAWER_W = 340;
/** 添加事件浮层宽度（高保真 300px；与证据浮层同上限口径）。 */
const EVENT_FORM_W = 300;
/** 双月周历选择器宽度（两月并排，高保真 ≈460px）。 */
const WEEK_PICKER_W = 440;

// 图例系列 key（显隐状态按 key 记录；AI 基线只控制对照虚线，「事件」控制
// 图顶部箭头-线小标层 + 区间底衬）。
const SERIES_ACTUAL = 'actual';
const SERIES_FORECAST = 'forecast';
const SERIES_AI_BASELINE = 'ai-baseline';
const SERIES_EVENT = 'event';

/** 证据浮层（v2-1 四层）宽度上限（设计稿：总宽 ≤300px）。 */
const EVIDENCE_W = 300;
/** 调整表单浮层宽度（既有口径不变）。 */
const POPOVER_W = 248;

/** 指数文案（1 位小数，与模型 round1 口径一致）。 */
const fmtIndex = (value: number): string => value.toFixed(1);

/** 模型同款 round1（浮框算例复算用：值本身仍是模型输出，此处只做同口径取整）。 */
const round1Local = (value: number): number => Math.round(value * 10) / 10;

/** 事件起始日展示（MM-DD）。 */
const fmtDay = (day: number): string => String(day).padStart(2, '0');

/**
 * 月键 → 日历标签：全站月视图日历格式 YYYY-MM（与价格走势主图悬停
 * Chart.fmt_hoverDate、量价明细 weekDetail.detailDateOf、大盘份额
 * marketBoardModel.monthLabel 同一口径；'YYYYMM' 桶号归一为 'YYYY-MM'，
 * 本卡月键已是 YYYY-MM 原样透传）。禁止另造缩写格式。
 */
const fmtMonthCalendar = (key: string): string =>
  /^\d{6}$/.test(key) ? `${key.slice(0, 4)}-${key.slice(4)}` : key;

/** 月键 → 轴标签刻度月（季度首月出标签，保持可扫描密度；其余月不刻）。 */
const isQuarterStartMonth = (key: string): boolean => /-(01|04|07|10)$/.test(key);

/** 衰减形状标签（列表行 / 小标详情共用；缺省递减）。 */
const decayLabelOf = (event: Pick<MarketMonthEventSeed, 'decay'>): string =>
  event.decay === 'flat' ? '恒定' : '递减';

/** 月度事件首月覆盖读数（covered/days；口径见 workbenchModel.monthCoverageRatio）。 */
function monthCoverageText(event: MarketMonthEventSeed): string {
  const dim = daysInMonthOf(event.startMonth);
  if (dim == null) return '';
  const covered = Math.round(monthCoverageRatio(dim, event.startDay) * dim);
  return `首月覆盖 ${covered}/${dim} 天`;
}

/** 浮层通用视觉（与主图悬停浮窗同一语言：白底 + hairline + 卡片圆角 + L5 阴影）。 */
const popoverShellStyle: React.CSSProperties = {
  position: 'absolute', top: 0, zIndex: 6,
  background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card,
  boxShadow: shadow.l5, padding: `${space.md - 2}px ${space.md}px`, fontSize: 12, lineHeight: 1.6, color: color.body,
};

/**
 * 复算提示行（含事件/手调月顶部；设计稿开放问题 4：确保「生效值」能被完整
 * 复算）。数字全部来自模型路径：事件乘子 = marketMonthEventFactor，月中均摊
 * = monthCoverageRatio；手调 = point.override/reason。
 */
function recalcNoticesOf(point: MarketMonthPoint, params: Pick<WorkbenchParams, 'marketMonthEvents'>): string[] {
  const notices: string[] = [];
  for (const event of params.marketMonthEvents) {
    const factor = marketMonthEventFactor(event, point.key);
    if (factor == null) continue;
    const pct = round1Local((factor - 1) * 100);
    const offset = monthsBetween(event.startMonth, point.key);
    const dim = daysInMonthOf(point.key);
    const spread = offset === 0 && event.startDay > 1 && dim != null
      ? `（均摊 ${Math.round(monthCoverageRatio(dim, event.startDay) * dim)}/${dim} 天）`
      : '';
    notices.push(`含事件 ${fmtSignedPct(pct)}${spread}`);
  }
  if (point.override != null) {
    notices.push(`含手调${point.reason ? `（${point.reason}）` : ''}`);
  }
  return notices;
}

/**
 * v2-1 hover 证据浮框（只读态；四层各一行，总宽 ≤300px，无形容词）：
 * 头部（月名 + AI 基线/生效）→ 复算提示（条件）→ 趋势行（sparkline：
 * 近 6 个月实际实线 + 基线虚线延伸）→ 月形行（去年同季三根小柱 + 占比，
 * 本月高亮 + 构成算例）→ 底部「调整此月」。数据全部来自 workbenchModel
 * 导出（marketTrendWindow / marketMonthShape / computeMarketMonths 既有字段），
 * UI 不另算第二套数字。
 */
function MonthEvidencePopover({
  point,
  fixture,
  params,
  trendWindow,
  quarterValue,
  flip,
  onAdjust,
  onClose,
}: {
  point: MarketMonthPoint;
  fixture: WorkbenchFixture;
  params: Pick<WorkbenchParams, 'marketMonthEvents'>;
  /** 近 6 个月趋势窗口（workbenchModel.marketTrendWindow 导出，模型侧唯一口径）。 */
  trendWindow: { months: MarketTrendWindowPoint[]; avgMomPct: number | null };
  /** 所属季度基线（result.marketQuarters 季度基线链），算例首项。 */
  quarterValue: number;
  /** 锚点位于图右半区时左翻（与主图悬停浮窗同款翻转语言）。 */
  flip: boolean;
  onAdjust: () => void;
  onClose: () => void;
}) {
  const shape = marketMonthShape(fixture, point.quarter);
  const highlightIndex = shape.findIndex((month) => month.key.slice(5) === point.key.slice(5));
  const weight = highlightIndex >= 0 ? shape[highlightIndex].weight : 1;
  const shapeValues = shape.map((month) => month.value).filter((value): value is number => value != null);
  const shapeMax = Math.max(...shapeValues, 1);
  const notices = recalcNoticesOf(point, params);
  // 趋势 sparkline：近 6 个月实际（实线）+ hover 月 AI 基线（虚线延伸）。
  const sparkValues = [...trendWindow.months.map((month) => month.value), point.baseline];
  const sparkMin = Math.min(...sparkValues);
  const sparkMax = Math.max(...sparkValues);
  const sparkSpan = sparkMax - sparkMin || 1;
  const sparkX = (index: number): number => 10 + (index * 240) / (sparkValues.length - 1);
  const sparkY = (value: number): number => 8 + (1 - (value - sparkMin) / sparkSpan) * 28;
  const actualPoints = trendWindow.months.map((month, index) => `${sparkX(index).toFixed(1)},${sparkY(month.value).toFixed(1)}`);
  const extPoints = [
    ...actualPoints.slice(-1),
    `${sparkX(sparkValues.length - 1).toFixed(1)},${sparkY(point.baseline).toFixed(1)}`,
  ];
  // 构成算例（月形 × 季度基线 × 事件乘子 → 生效；手调另列）：数字可逐步复算。
  const preOverride = round1Local(point.baseline * (point.eventFactor ?? 1));
  const calcParts = [`${fmtIndex(quarterValue)} × ${(weight * 100).toFixed(2)}%`];
  if (point.eventFactor != null) calcParts.push(`× ${(point.eventFactor * 100).toFixed(1)}%`);
  const calcText = point.override != null
    ? `${calcParts.join(' ')} ≈ ${fmtIndex(preOverride)} → 手调 ${fmtIndex(point.value)}`
    : `${calcParts.join(' ')} ≈ ${fmtIndex(point.value)}`;
  const trendReadout = trendWindow.avgMomPct != null
    ? `趋势 · 近 ${MARKET_TREND_WINDOW_MONTHS} 个月环比 ${fmtSignedPct(trendWindow.avgMomPct)}/月`
    : `趋势 · 近 ${MARKET_TREND_WINDOW_MONTHS} 个月环比无法计算（样本不足）`;
  const layerLabelStyle: React.CSSProperties = { fontSize: 10.5, color: color.mute, letterSpacing: '0.05em' };
  return (
    <div
      data-lpl-month-popover
      data-popover-mode="evidence"
      role="dialog"
      aria-label={`${point.key} 预测月证据`}
      onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
      style={{ ...popoverShellStyle, width: EVIDENCE_W, transform: flip ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)' }}
    >
      {/* 层① 头部：月名 + AI 基线/生效 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, paddingRight: 16 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: color.ink }}>{`${fmtMonthCalendar(point.key)} · 预测月`}</span>
        <span className="tnum" style={{ fontSize: 11, color: color.mute }}>{`AI 基线 ${fmtIndex(point.baseline)} · 生效 ${fmtIndex(point.value)}`}</span>
      </div>
      <button
        type="button"
        aria-label={`关闭 ${point.key} 证据浮框`}
        onClick={onClose}
        style={{
          position: 'absolute', top: 2, right: 4, border: 'none', background: 'transparent',
          color: color.mute, fontSize: 12, lineHeight: 1.2, cursor: 'pointer', padding: 2,
        }}
      >
        ×
      </button>
      {/* 复算提示（含事件/手调月顶部一行） */}
      {notices.length > 0 && (
        <div data-lpl-evidence-recalc className="tnum" style={{ marginTop: 3, fontSize: 11, color: color.warningInk }}>
          {notices.join(' · ')}
        </div>
      )}
      {/* 层② 趋势行：近 6 个月实际实线 + 基线虚线延伸；环比读数来自模型导出 */}
      <div data-lpl-evidence-trend style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 8, paddingTop: 8 }}>
        <div data-lpl-evidence-trend-readout className="tnum" style={layerLabelStyle}>{trendReadout}</div>
        {trendWindow.months.length >= 2 ? (
          <svg
            data-lpl-evidence-sparkline
            viewBox="0 0 260 46"
            width="100%"
            height={46}
            role="img"
            aria-label={`近 ${trendWindow.months.length} 个月实际：${trendWindow.months.map((month) => `${fmtMonthCalendar(month.key)} ${fmtIndex(month.value)}（${month.momPct == null ? '首月' : fmtSignedPct(month.momPct)}）`).join('、')}；${fmtMonthCalendar(point.key)} AI 基线 ${fmtIndex(point.baseline)} 虚线延伸`}
            style={{ display: 'block', marginTop: 2 }}
          >
            <polyline points={actualPoints.join(' ')} fill="none" stroke={color.ink} strokeWidth={2} />
            {/* 基线延伸 = 辅线档（≤1.4，2026-11-05 线宽统一） */}
            <polyline points={extPoints.join(' ')} fill="none" stroke={color.link} strokeWidth={1.4} strokeDasharray="4 3" />
            <circle cx={sparkX(trendWindow.months.length - 1)} cy={sparkY(trendWindow.months[trendWindow.months.length - 1].value)} r={2.5} fill={color.ink} />
            <circle cx={sparkX(sparkValues.length - 1)} cy={sparkY(point.baseline)} r={3} fill={color.link} />
            <text x={4} y={44} fontSize={9} fill={color.mute}>{fmtMonthCalendar(trendWindow.months[0].key)}</text>
            <text x={sparkX(trendWindow.months.length - 1)} y={44} fontSize={9} fill={color.mute} textAnchor="middle">{fmtMonthCalendar(trendWindow.months[trendWindow.months.length - 1].key)}</text>
            <text x={256} y={44} fontSize={9} fill={color.link} textAnchor="end">{fmtMonthCalendar(point.key)}</text>
          </svg>
        ) : (
          <div style={{ fontSize: 11, color: color.mute, marginTop: 4 }}>实际样本不足，无法绘制趋势段</div>
        )}
      </div>
      {/* 层③ 月形行：去年同季三根小柱 + 占季内均值占比，本月高亮 + 构成算例 */}
      <div data-lpl-evidence-shape style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 8, paddingTop: 8 }}>
        <div style={layerLabelStyle}>月形 · 来源：去年同季</div>
        <div style={{ display: 'flex', gap: space.md, alignItems: 'flex-end', marginTop: 6 }}>
          {shape.map((month, index) => {
            const highlighted = index === highlightIndex;
            const monthNum = Number(month.key.slice(5));
            return (
              <div key={month.key} data-lpl-shape-bar={month.key} data-lpl-shape-highlighted={highlighted || undefined} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: 30, height: 34, borderRadius: 3, position: 'relative', overflow: 'hidden',
                    background: color.canvas, border: `${highlighted ? 1.4 : 1}px solid ${highlighted ? color.link : color.hairlineStrong}`,
                  }}
                >
                  {month.value != null && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: `${Math.max(4, (month.value / shapeMax) * 100)}%`,
                        background: highlighted ? selectSoft : color.canvasSoft2,
                      }}
                    />
                  )}
                </div>
                <div
                  className="tnum"
                  style={{
                    fontSize: 10, marginTop: 3, whiteSpace: 'nowrap',
                    color: highlighted ? color.link : color.mute, fontWeight: highlighted ? 700 : 400,
                  }}
                >
                  {`${monthNum} 月 ${month.value != null ? `${(month.weight * 100).toFixed(2)}%` : '—'}`}
                </div>
              </div>
            );
          })}
          <span className="tnum" style={{ flex: 1, fontSize: 11.5, padding: '4px 8px', borderRadius: radius.control, background: color.canvasSoft2, color: color.ink }}>
            {calcText}
          </span>
        </div>
      </div>
      {/* 层④ 底部：就地调整入口（点击切换为调整表单，同一浮层两态） */}
      <div style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
        <span style={{ fontSize: 10.5, color: color.mute }}>调整后直接修正该月对应预测周</span>
        <button
          type="button"
          data-lpl-evidence-adjust
          onClick={onAdjust}
          style={{
            border: 'none', padding: '3px 12px', borderRadius: radius.control, background: color.ink,
            color: color.onPrimary, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          调整此月
        </button>
      </div>
    </div>
  );
}

/**
 * 按月调整就地浮层（证据浮框「调整此月」就地切换的两态之二；与主图悬停
 * 浮窗同一浮层视觉语言：白底 + hairline + 卡片圆角 + L5 阴影）。两式输入 =
 * 调整后指数 / 增减幅%；调整原因选填（评审拍板：不得以「不填无法应用」
 * 强迫，空值照常应用）。取消 = 回到证据态（同一浮层两态，不再分开）。
 */
function MonthAdjustPopover({ point, flip, onApply, onRestore, onBack }: {
  point: MarketMonthPoint;
  /** 锚点位于图右半区时左翻（与主图悬停浮窗同款翻转语言），避免被图区右缘裁切。 */
  flip: boolean;
  onApply: (value: number, reason: string) => void;
  onRestore: () => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'abs' | 'pct'>('abs');
  const [absValue, setAbsValue] = useState<number | null>(point.value);
  const [pctValue, setPctValue] = useState<number | null>(0);
  const [reason, setReason] = useState(point.reason);
  const absOk = absValue != null && Number.isFinite(absValue) && absValue >= MONTH_OVERRIDE_MIN && absValue <= MONTH_OVERRIDE_MAX;
  const pctOk = pctValue != null && Number.isFinite(pctValue) && pctValue >= -50 && pctValue <= 100;
  const applyValue = mode === 'abs'
    ? (absOk ? Math.round(absValue * 10) / 10 : null)
    : (pctOk ? Math.round(point.value * (1 + pctValue / 100) * 10) / 10 : null);
  const modeBtn = (key: 'abs' | 'pct', label: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={mode === key}
      onClick={() => setMode(key)}
      style={{
        border: 'none', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
        background: mode === key ? selectSoft : color.canvas,
        color: mode === key ? selectSoftInk : color.body,
        fontWeight: mode === key ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      data-lpl-month-popover
      data-popover-mode="adjust"
      role="dialog"
      aria-label={`调整 ${point.key}`}
      style={{ ...popoverShellStyle, width: POPOVER_W, transform: flip ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)' }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: color.mute, marginBottom: 4 }}>
        {`调整 · ${point.key}（预测月）`}
      </div>
      <div style={{ display: 'grid', gap: 2, marginBottom: 6 }} className="tnum">
        <span>{`AI 基线 ${fmtIndex(point.baseline)} · 生效 ${fmtIndex(point.value)}`}</span>
        {point.eventFactor != null && <span>{`含事件乘子 ×${point.eventFactor.toFixed(3)}`}</span>}
        {point.override != null && <span style={{ color: color.link }}>{`已调整（原填 ${fmtIndex(point.override)}${point.reason ? ` · ${point.reason}` : ''}）`}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', border: `1px solid ${color.hairlineStrong}`, borderRadius: 6, overflow: 'hidden' }}>
          {modeBtn('abs', '调整后指数')}
          {modeBtn('pct', '增减幅%')}
        </span>
        {mode === 'abs' ? (
          <InputNumber
            aria-label="调整后指数"
            min={MONTH_OVERRIDE_MIN}
            max={MONTH_OVERRIDE_MAX}
            step={0.1}
            precision={1}
            value={absValue}
            onChange={(value) => setAbsValue(value == null ? null : Number(value))}
            style={{ width: 92 }}
          />
        ) : (
          <InputNumber
            aria-label="增减幅（%）"
            min={-50}
            max={100}
            step={1}
            precision={1}
            value={pctValue}
            formatter={(value) => (value == null ? '' : `${value}%`)}
            parser={(text) => Number((text ?? '').replace('%', ''))}
            onChange={(value) => setPctValue(value == null ? null : Number(value))}
            style={{ width: 92 }}
          />
        )}
      </div>
      <label style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 600, color: color.body, marginBottom: 6 }}>
        {`调整原因（选填）`}
        <Input
          aria-label="调整原因（选填）"
          placeholder="选填：帮助追溯调整依据"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        {point.override != null && (
          <Button size="small" type="text" onClick={onRestore}>还原 AI</Button>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: space.sm }}>
          <Button size="small" onClick={onBack}>取消</Button>
          <Button
            size="small"
            type="primary"
            disabled={applyValue == null}
            onClick={() => { if (applyValue != null) onApply(applyValue, reason); }}
          >
            应用
          </Button>
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: color.mute }}>
        只调整该月；应用后预测线即时重算，本会话内可还原（还原该月即回 AI 基线口径）。
      </div>
    </div>
  );
}

/**
 * 双月周历选择器行（添加事件浮窗 · 高保真形态）：两月并排、行 = 整周
 * （周一起）、行首 = ISO 周号、默认浅蓝底、区间内更浅蓝、选中 = 实蓝白字；
 * 选择 = 点起点行 → 点终点行（同周再点 = 重选起点）。跨月区间连续高亮。
 */
function WeekRangePicker({
  months,
  page,
  onPage,
  startWeekId,
  endWeekId,
  onPick,
}: {
  /** 可选月序列（统一日历预测月，每月 = 其内整周行）。 */
  months: Array<{ key: string; label: string; weeks: CalendarWeek[] }>;
  /** 当前页（显示 months[page] 与 months[page+1]）。 */
  page: number;
  onPage: (next: number) => void;
  /** 已选起点周（ISO WeekId）；null = 未选。 */
  startWeekId: string | null;
  /** 已选终点周；null = 待选（区间未完成）。 */
  endWeekId: string | null;
  onPick: (weekId: string) => void;
}) {
  const a = months[page];
  const b = months[page + 1] ?? a;
  if (a == null) return null;
  const rangeDone = startWeekId != null && endWeekId != null;
  // 起止周绝对序位（区间内衬判定用；跨月页仍连续高亮）。
  const indexOfWeek = (id: string): number | null => {
    for (const month of months) {
      const hit = month.weeks.find((week) => week.id === id);
      if (hit != null) return hit.index;
    }
    return null;
  };
  const lo = startWeekId != null ? indexOfWeek(startWeekId) : null;
  const hi = endWeekId != null ? indexOfWeek(endWeekId) : null;
  const loHi = lo != null && hi != null ? { lo: Math.min(lo, hi), hi: Math.max(lo, hi) } : null;
  const renderMonth = (month: { key: string; label: string; weeks: CalendarWeek[] }) => (
    <div data-lpl-week-month={month.key} style={{ minWidth: 0 }}>
      <div className="tnum" style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: color.ink, marginBottom: 4 }}>{month.label}</div>
      {month.weeks.map((week) => {
        const selected = week.id === startWeekId || week.id === endWeekId;
        const inRange = !selected && loHi != null && week.index > loHi.lo && week.index < loHi.hi;
        // 周行 7 个日格：从周一起逐日；不属于本月页的日期降灰（跨月连续）。
        const monday = Date.UTC(Number(week.date.slice(0, 4)), Number(week.date.slice(5, 7)) - 1, Number(week.date.slice(8, 10)));
        const cells = Array.from({ length: 7 }, (_, offset) => {
          const iso = new Date(monday + offset * 86_400_000).toISOString().slice(0, 10);
          return { day: Number(iso.slice(8, 10)), inMonth: iso.slice(0, 7) === month.key };
        });
        return (
          <div
            key={week.id}
            data-lpl-week-row={week.id}
            data-week-number={week.weekNumber}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${week.id}（第 ${week.weekNumber} 周）`}
            onClick={() => onPick(week.id)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick(week.id); } }}
              style={{
                display: 'grid', gridTemplateColumns: '26px repeat(7, 1fr)', gap: 2, alignItems: 'center',
                padding: '1px 2px', borderRadius: 5, marginBottom: 2, cursor: 'pointer',
                background: selected ? color.link : inRange ? trackColors.fill : selectSoft,
                color: selected ? color.onPrimary : color.ink,
              }}
          >
            <span className="tnum" style={{ fontSize: 10, textAlign: 'center', color: selected ? color.onPrimary : color.mute }}>{week.weekNumber}</span>
            {cells.map((cell, index) => (
              <span
                key={index}
                className="tnum"
                style={{
                  fontSize: 11, textAlign: 'center',
                  color: selected ? color.onPrimary : cell.inMonth ? color.ink : color.hairlineStrong,
                }}
              >
                {cell.day}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
  return (
    <div
      data-lpl-week-picker
      data-range-done={rangeDone ? 'true' : undefined}
      style={{
        position: 'absolute', right: 0, top: '100%', marginTop: 6, width: WEEK_PICKER_W, zIndex: 20,
        background: color.canvas, border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.card,
        boxShadow: shadow.l5, padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <button
          type="button"
          data-lpl-week-nav="prev"
          aria-label="上一月"
          disabled={page <= 0}
          onClick={() => onPage(Math.max(0, page - 1))}
          style={{ border: 'none', background: color.canvasSoft2, borderRadius: 5, width: 22, height: 22, color: color.body, fontSize: 12, cursor: 'pointer' }}
        >
          ‹
        </button>
        <span className="tnum" style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 700, color: color.ink }}>
          {`${a.label} / ${b.label}`}
        </span>
        <button
          type="button"
          data-lpl-week-nav="next"
          aria-label="下一月"
          disabled={page >= months.length - 2}
          onClick={() => onPage(Math.min(months.length - 2, page + 1))}
          style={{ border: 'none', background: color.canvasSoft2, borderRadius: 5, width: 22, height: 22, color: color.body, fontSize: 12, cursor: 'pointer' }}
        >
          ›
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {renderMonth(a)}
        {b.key !== a.key && renderMonth(b)}
      </div>
    </div>
  );
}

// AI 候选事件占位已由真实候选容器 IntelligenceReviewPanel 接管（任务 8）：
// 能力未接入 = 空态「候选生成能力待接入」+ 禁用按钮，不再画假候选（3.3.A）。
// 页级 items/recommendations/回调接线归页级任务（届时经 props 传入真实候选容器）。

export default function MarketBusPanel({
  fixture,
  params,
  result,
  onMonthOverride,
  onMonthEventAdd,
  onMonthEventRemove,
  onMonthEventUpdate,
  onViewMainChart,
  onCheckInventory,
}: {
  fixture: WorkbenchFixture;
  params: WorkbenchParams;
  result: WorkbenchResult;
  /** 按月调整（点击预测月浮层应用）：value = null 还原该月；reason 选填可空。 */
  onMonthOverride: (monthKey: string, value: number | null, reason: string) => void;
  /** 新增人工月度事件（周历选择器映射产物；id 由页面侧循环查重生成）。 */
  onMonthEventAdd: (event: Omit<MarketMonthEventSeed, 'id'>) => void;
  onMonthEventRemove: (id: string) => void;
  /** 编辑人工月度事件（同一浮窗编辑器；缺省回退 = 删除 + 新增，页面撤销层可撤）。 */
  onMonthEventUpdate?: (id: string, event: Omit<MarketMonthEventSeed, 'id'>) => void;
  /** 月调整应用后反馈行的「查看主图」（跨卡定位，页级接线）。 */
  onViewMainChart?: () => void;
  /** 月调整应用后反馈行的「检查库存」（跨卡定位，页级接线）。 */
  onCheckInventory?: () => void;
  /** 兼容保留（A2 删理由栏后 UI 不再消费）：页面壳仍传该回调，契约不动，勿删。 */
  onRationaleChange: (text: string) => void;
}) {
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set());
  /** v2-1 一层化两态：evidence = 证据浮框（hover 临时）；adjust = 调整表单（就地切换，粘滞）。 */
  const [popover, setPopover] = useState<{ key: string; mode: 'evidence' | 'adjust' } | null>(null);
  /** v2-3 徽章三步链浮层（hover/点击临时，零新增常驻元素）。 */
  const [chainOpen, setChainOpen] = useState(false);
  /** 事件与情报右侧滑出菜单（默认收起；组件内存态，不持久化）。 */
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** 图内高亮开关（默认关；开 = 所有事件区间常驻底衬）。 */
  const [highlightAll, setHighlightAll] = useState(false);
  /** hover 事件小标 → 对应周区间临时高亮（移开即恢复）。 */
  const [hoverEventId, setHoverEventId] = useState<string | null>(null);
  /** 添加/编辑事件浮窗（绝对定位悬浮在图上，不改变图表区高度）。 */
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formStartWeekId, setFormStartWeekId] = useState<string | null>(null);
  const [formEndWeekId, setFormEndWeekId] = useState<string | null>(null);
  const [formMagnitude, setFormMagnitude] = useState<number | null>(5);
  const [formDecay, setFormDecay] = useState<'decreasing' | 'flat'>('decreasing');
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [pickerPage, setPickerPage] = useState(0);
  /** 月调整应用反馈（B.5.6）：应用后显示「本月比值 ×… · 已联动 N 个预测周」（比值 = 应用值 ÷ 该月 AI 基线）。 */
  const [feedback, setFeedback] = useState<{ monthKey: string; value: number } | null>(null);

  // 统一日历（周历选择器 / 事件小标区间反推的唯一时间来源）。
  const calendar = buildForecastCalendar(fixture.calendar);
  /** 周历选择器月页：统一日历预测月（每月 = 其内整周行，按周一归属月）。 */
  const pickerMonths = calendar.forecastMonths.map((month) => ({
    key: month.key,
    label: `${month.key.slice(0, 4)}年 ${Number(month.key.slice(5))}月`,
    weeks: calendar.weeks.filter((week) => week.monthKey === month.key),
  }));
  const firstPickerWeekId = pickerMonths[0]?.weeks[0]?.id ?? null;

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEventFormOpen(false);
    setWeekPickerOpen(false);
    setEditingEventId(null);
  };

  const openEventForm = (event?: MarketMonthEventSeed) => {
    if (event != null) {
      setEditingEventId(event.id);
      setFormLabel(event.label);
      setFormNote('');
      setFormMagnitude(event.magnitudePct);
      setFormDecay(event.decay === 'flat' ? 'flat' : 'decreasing');
      const range = weekRangeOfMonthEvent(calendar, event);
      setFormStartWeekId(range?.startWeekId ?? firstPickerWeekId);
      setFormEndWeekId(range?.endWeekId ?? firstPickerWeekId);
      const pageIndex = pickerMonths.findIndex((month) => month.key === event.startMonth);
      setPickerPage(Math.min(Math.max(0, pageIndex), Math.max(0, pickerMonths.length - 2)));
    } else {
      setEditingEventId(null);
      setFormLabel('');
      setFormNote('');
      setFormMagnitude(5);
      setFormDecay('decreasing');
      setFormStartWeekId(firstPickerWeekId);
      setFormEndWeekId(firstPickerWeekId);
      setPickerPage(0);
    }
    setWeekPickerOpen(false);
    setEventFormOpen(true);
  };

  /** 周历行点击：首点 = 起点；次点 = 终点（自动收起回填）；同周再点 = 重选起点。 */
  const pickWeek = (weekId: string) => {
    if (formStartWeekId != null && formEndWeekId == null && weekId !== formStartWeekId) {
      const a = calendar.weekById.get(formStartWeekId);
      const b = calendar.weekById.get(weekId);
      if (a == null || b == null) return;
      const [start, end] = a.index <= b.index ? [a.id, b.id] : [b.id, a.id];
      setFormStartWeekId(start);
      setFormEndWeekId(end);
      // 高保真：完成选择后短暂展示区间再自动收起回填。
      window.setTimeout(() => setWeekPickerOpen(false), 350);
    } else {
      setFormStartWeekId(weekId);
      setFormEndWeekId(null);
    }
  };

  /** 起止周范围读数（按钮标签与校验；周数 = 统一日历绝对 index 口径）。 */
  const formWeeks = formStartWeekId != null && formEndWeekId != null
    ? { start: calendar.weekById.get(formStartWeekId), end: calendar.weekById.get(formEndWeekId) }
    : null;
  const formWeekCount = formWeeks && formWeeks.start != null && formWeeks.end != null
    ? durationOfWeekRange(calendar, { startWeekId: formWeeks.start.id, endWeekId: formWeeks.end.id })
    : null;
  /** 周范围 → 月度事件三字段映射（保存路径；workbenchModel 纯函数）。 */
  const formMapped = formStartWeekId != null && formEndWeekId != null
    ? monthSeedOfWeekRange(calendar, { startWeekId: formStartWeekId, endWeekId: formEndWeekId })
    : null;
  const formMagnitudeOk = formMagnitude != null && Number.isFinite(formMagnitude) && formMagnitude >= -30 && formMagnitude <= 30;
  const eventFormValid = formMapped != null && formWeeks?.start != null && formWeeks?.end != null && formWeekCount != null && formMagnitudeOk;

  const toggleSeries = (key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const seriesOn = (key: string) => !hiddenSeries.has(key);

  const months = result.marketMonths;
  const actualCount = months.filter((point) => point.status === 'actual').length;
  const forecastMonthKeys = months.filter((point) => point.status === 'forecast').map((point) => point.key);
  // v3：季度基线链随主链结果输出（marketQuarters forecast 段），不再另调 v2 外推函数。
  const quarterForecast = result.marketQuarters.filter((point) => point.status === 'forecast');
  const hasMonthAdjust = forecastMonthKeys.some((key) => params.marketMonthOverrides[key] != null);
  const showAiGhost = (hasMonthAdjust || params.marketMonthEvents.length > 0) && seriesOn(SERIES_AI_BASELINE);

  // v2 口径（模型侧唯一来源）：近 6 个月趋势窗口 + 徽章三步链算例读数。
  const trendWindow = marketTrendWindow(fixture);
  const chainQuarters = quarterForecast.map((quarter) => ({
    key: quarter.key,
    value: quarter.value,
    baselines: months.filter((point) => point.quarter === quarter.key && point.status === 'forecast').map((point) => fmtIndex(point.baseline)),
  }));

  const legendItems: LegendItem[] = [
    { key: SERIES_ACTUAL, label: '实际（月度）', shape: 'line', color: color.ink },
    { key: SERIES_FORECAST, label: '预测 · 未来 4 季逐月', shape: 'dash', color: color.link },
    { key: SERIES_AI_BASELINE, label: 'AI 基线', shape: 'dash', color: color.hairlineStrong },
    { key: SERIES_EVENT, label: '事件', shape: 'line', color: color.warning },
  ];

  const sectionHead = (
    <SectionHead
      title="② 大盘修正"
      extra={<>
        <SimChip title="月度序列为演示样本：历史月为模拟数据，预测月为模型假设（确定性外推）" />
        <span
          data-lpl-ai-chain-root
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={chainOpen}
          aria-label="AI 推测 · 可改（hover 或按 Enter 展开三步证据链）"
          onMouseEnter={() => setChainOpen(true)}
          onMouseLeave={() => setChainOpen(false)}
          onClick={() => setChainOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setChainOpen((open) => !open);
            }
            if (event.key === 'Escape') setChainOpen(false);
          }}
          style={{ position: 'relative', display: 'inline-flex' }}
        >
          <AiJudgeBadge source={overrideSourceOf(params)} />
          {chainOpen && (
            <div
              data-lpl-ai-chain-popover
              role="dialog"
              aria-label="这版预测怎么来的（三步证据链）"
              onKeyDown={(event) => { if (event.key === 'Escape') setChainOpen(false); }}
              style={{
                position: 'absolute', right: 0, top: 26, width: 340, zIndex: 7,
                background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card,
                boxShadow: shadow.l5, padding: `${space.md}px`, fontSize: 12, lineHeight: 1.65, color: color.body,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 700, color: color.ink, marginBottom: 6 }}>这版预测怎么来的 · 三步</div>
              {(() => {
                const sampleMonths = fixture.market.months;
                const sample = `${fmtMonthCalendar(sampleMonths[0]?.key ?? '')} – ${fmtMonthCalendar(sampleMonths[sampleMonths.length - 1]?.key ?? '')} · ${sampleMonths.length} 个月大盘指数（模拟实际，无预测段混入）`;
                const example = chainQuarters[1];
                const shapeQ1 = marketMonthShape(fixture, example?.key ?? '');
                const seasonText = shapeQ1.map((month) => `${(month.weight * 100).toFixed(2)}%`).join(' / ');
                const trendText = trendWindow.avgMomPct != null ? fmtSignedPct(trendWindow.avgMomPct) : '无法计算';
                const windowRange = trendWindow.months.length
                  ? `${fmtMonthCalendar(trendWindow.months[0].key)}–${fmtMonthCalendar(trendWindow.months[trendWindow.months.length - 1].key)}`
                  : '样本不足';
                const steps: Array<{ title: string; body: React.ReactNode; calc?: string }> = [
                  { title: '样本', body: sample },
                  {
                    title: '两个规律',
                    body: (
                      <>① 季节形状 = 沿用去年同季的月形（占季内均值，如 {example?.key ?? ''}：{seasonText}）；② 趋势 = 近 {MARKET_TREND_WINDOW_MONTHS} 个月（{windowRange}）环比均值 <b className="tnum">{trendText}</b>/月（逐月环比列于月度证据浮框）。</>
                    ),
                  },
                  {
                    title: '外推',
                    body: '季度基线逐季递推（同季比 × 年度趋势比），季内三月按去年月形分摊（三月合计 = 季度基线 × 3，不多不少）。',
                    calc: example ? `例：${example.key} 基线 ${fmtIndex(example.value)} × 去年同季月形 → ${example.baselines.join(' · ')}` : undefined,
                  },
                ];
                return steps.map((step, index) => (
                  <div key={step.title} data-lpl-chain-step={step.title} style={{ display: 'flex', gap: space.sm, alignItems: 'flex-start', padding: `${space.sm - 2}px 0`, borderTop: index === 0 ? 'none' : `1px solid ${color.hairline}` }}>
                    <span
                      aria-hidden
                      style={{
                        flex: 'none', width: 20, height: 20, borderRadius: radius.pill, marginTop: 2,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: color.canvasSoft2, border: `1px solid ${color.hairlineStrong}`,
                        color: color.ink, fontSize: 11, fontWeight: 700,
                      }}
                    >
                      {index + 1}
                    </span>
                    <span style={{ fontSize: 12 }}>
                      <b style={{ color: color.ink }}>{step.title}</b>：{step.body}
                      {step.calc && (
                        <span className="tnum" style={{ display: 'block', marginTop: 4, padding: '4px 8px', borderRadius: radius.control, background: color.canvasSoft2, color: color.ink, fontSize: 11.5 }}>
                          {step.calc}
                        </span>
                      )}
                    </span>
                  </div>
                ));
              })()}
              <div style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 4, paddingTop: 6, fontSize: 10.5, color: color.mute }}>
                口径：季度基线 = 同季比 × 年度趋势比（主链不变）；趋势读数 = 近 {MARKET_TREND_WINDOW_MONTHS} 个月实际段环比，模型与浮框同一函数。
              </div>
            </div>
          )}
        </span>
        {/* 图内高亮开关（默认关；开 = 所有事件区间常驻底衬） */}
        <span
          data-lpl-highlight-switch
          role="switch"
          aria-checked={highlightAll}
          tabIndex={0}
          aria-label={`图内高亮：${highlightAll ? '开' : '关'}`}
          onClick={() => setHighlightAll((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setHighlightAll((value) => !value);
            }
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: color.body, cursor: 'pointer', userSelect: 'none' }}
        >
          <span
            aria-hidden
            style={{
              width: 30, height: 17, borderRadius: radius.pill, position: 'relative',
              background: highlightAll ? color.link : color.hairlineStrong, transition: `background ${motion.fast}ms`,
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute', top: 2, left: highlightAll ? 15 : 2, width: 13, height: 13,
                borderRadius: radius.pill, background: color.canvas, transition: `left ${motion.fast}ms`,
              }}
            />
          </span>
          {`图内高亮：${highlightAll ? '开' : '关'}`}
        </span>
        {/* 「事件与情报」右侧滑出菜单开关（默认收起） */}
        <button
          type="button"
          data-lpl-drawer-button
          aria-expanded={drawerOpen}
          aria-controls="lpl-market-drawer"
          onClick={() => (drawerOpen ? closeDrawer() : setDrawerOpen(true))}
          onKeyDown={(event) => { if (event.key === 'Escape') closeDrawer(); }}
          style={{
            display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: radius.control,
            border: `1px solid ${color.hairlineStrong}`, background: color.canvas, color: color.ink,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          事件与情报
        </button>
      </>}
    />
  );

  // 空态：无月度数据不渲染 NaN / Infinity SVG。
  if (months.length === 0) {
    return (
      <section style={workbenchCardStyle}>
        {sectionHead}
        <div style={{ padding: `${space.lg}px 0`, fontSize: 12.5, color: color.mute }}>当前范围无大盘数据</div>
      </section>
    );
  }

  // 图几何：36 个月（24 实际 + 12 预测 = 统一 12 个月预测窗）；top 加高为
  // 图顶部事件小标轨道（箭头-线 + 名称）留位（2026-11-05 图上标注统一）。
  const left = 40;
  const right = 14;
  const top = 32;
  const bottom = 48;
  const plotW = CHART_W - left - right;
  const plotH = CHART_H - top - bottom;
  const values = months.map((point) => point.value).concat(months.map((point) => point.baseline));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(2, (rawMax - rawMin) * 0.15);
  const yMin = Math.floor(rawMin - pad);
  const yMax = Math.ceil(rawMax + pad);
  const colW = plotW / months.length;
  const xm = (index: number): number => left + (index + 0.5) * colW;
  const ym = (value: number): number => top + plotH * (1 - (value - yMin) / (yMax - yMin));
  const yTicks = Array.from({ length: 4 }, (_, index) => Math.round(yMin + ((yMax - yMin) * index) / 3));
  const actualPath = months.slice(0, actualCount)
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xm(index).toFixed(1)} ${ym(point.value).toFixed(1)}`)
    .join(' ');
  const forecastPath = months.slice(actualCount - 1)
    .map((point, offset) => `${offset === 0 ? 'M' : 'L'}${xm(actualCount - 1 + offset).toFixed(1)} ${ym(point.value).toFixed(1)}`)
    .join(' ');
  const ghostPath = [
    { index: actualCount - 1, value: months[actualCount - 1]?.value ?? 0 },
    ...months.slice(actualCount).map((point, offset) => ({ index: actualCount + offset, value: point.baseline })),
  ].map((point, offset) => `${offset === 0 ? 'M' : 'L'}${xm(point.index).toFixed(1)} ${ym(point.value).toFixed(1)}`)
    .join(' ');
  const todayX = (xm(actualCount - 1) + xm(actualCount)) / 2;

  /** 首月（months[0]）的绝对月序；日期 → x 用它归一到 0..months.length-1。 */
  const baseMonthAbs = (() => {
    const key = months[0]?.key ?? '';
    return Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1);
  })();
  /** ISO 日期 → 时间轴 x（月列内按日均分；窗外的月序钳制到首/末月）。 */
  const xOfDate = (iso: string): number => {
    const monthKey = monthKeyOfDate(iso);
    const dim = monthKey != null ? daysInMonthOf(monthKey) : null;
    if (monthKey == null || dim == null) return left;
    const abs = Number(monthKey.slice(0, 4)) * 12 + (Number(monthKey.slice(5, 7)) - 1);
    const index = Math.min(Math.max(abs - baseMonthAbs, 0), months.length - 1);
    const day = Math.min(Math.max(Number(iso.slice(8, 10)), 1), dim);
    return left + (index + (day - 1) / dim) * colW;
  };

  // 图上事件小标统一层（2026-11-05）：人工月事件（琥珀，经日历反推周范围）
  // + 周口径行业事件（灰，自带 WeekRange）；同一箭头-线形态，hover → 区间
  // 临时高亮，「事件」图例项控制整层。
  const eventMarks = (() => {
    const marks: Array<{
      id: string; kind: 'month' | 'week'; label: string; color: string; detail: string;
      x1: number; x2: number;
    }> = [];
    for (const event of params.marketMonthEvents) {
      const range = weekRangeOfMonthEvent(calendar, event);
      if (range == null) continue;
      const start = calendar.weekById.get(range.startWeekId);
      const end = calendar.weekById.get(range.endWeekId);
      if (start == null || end == null) continue;
      marks.push({
        id: event.id,
        kind: 'month',
        label: event.label || '未命名事件',
        color: color.warning,
        detail: `${event.label || '未命名事件'}（${event.startMonth}-${fmtDay(event.startDay)} 起 · ${event.durationMonths} 个月 · ${fmtSignedPct(event.magnitudePct)} · ${decayLabelOf(event)}${event.startDay > 1 ? ` · ${monthCoverageText(event)}` : ''}）`,
        x1: xOfDate(start.date),
        x2: xOfDate(end.endDate),
      });
    }
    for (const event of params.marketEvents) {
      const start = calendar.weekById.get(event.startWeekId);
      const end = calendar.weekById.get(event.endWeekId);
      if (start == null || end == null || start.index > end.index) continue;
      marks.push({
        id: event.id,
        kind: 'week',
        label: event.label || '未命名事件',
        color: color.mute,
        detail: `${event.label || '未命名事件'}（${event.startWeekId}–${event.endWeekId} · ${fmtSignedPct(event.magnitudePct)} · ${event.decay === 'flat' ? '恒定' : '递减'} · 周口径行业事件（人工录入假设））`,
        x1: xOfDate(start.date),
        x2: xOfDate(end.endDate),
      });
    }
    return marks;
  })();
  const eventsVisible = seriesOn(SERIES_EVENT);
  const hoverMark = hoverEventId != null && eventsVisible ? eventMarks.find((mark) => mark.id === hoverEventId) ?? null : null;

  // v2-1 / v2-2：hover（或键盘 Enter）预测月 → 证据浮框 + 图上双锚点临时高亮。
  const popoverPoint = popover != null ? months.find((point) => point.key === popover.key) ?? null : null;
  const anchorActive = popoverPoint != null;
  const popoverAnchorPct = popoverPoint ? (xm(months.indexOf(popoverPoint)) / CHART_W) * 100 : 0;
  const popoverFlip = popoverAnchorPct > 50;
  const trendWindowValid = trendWindow.months.length >= 2 && trendWindow.months.length === MARKET_TREND_WINDOW_MONTHS;
  const trendFirstIndex = actualCount - trendWindow.months.length;
  /** 去年同位实际月（月形来源点）：hover 月键年份 −1，须为历史实际月。 */
  const lastYearAnchor = (() => {
    if (!popoverPoint) return null;
    const lastYearKey = `${Number(popoverPoint.key.slice(0, 4)) - 1}-${popoverPoint.key.slice(5, 7)}`;
    const index = months.findIndex((point) => point.key === lastYearKey && point.status === 'actual');
    return index >= 0 ? { index, key: lastYearKey, value: months[index].value } : null;
  })();

  /** 滑出菜单动效（高保真 translateX 过渡；prefers-reduced-motion 即时态）。 */
  const reducedMotion = prefersReducedMotion();
  const drawerTransition = reducedMotion
    ? 'none'
    : `transform ${motion.base}ms ${drawerOpen ? motion.enter : motion.exit}`;

  /** 滑出菜单内人工事件行的「起止周段」（月事件经日历反推；窗外回退起始月-日）。 */
  const eventRangeText = (event: MarketMonthEventSeed): string => {
    const range = weekRangeOfMonthEvent(calendar, event);
    return range != null ? `${range.startWeekId}–${range.endWeekId}` : `${event.startMonth}-${fmtDay(event.startDay)} 起`;
  };

  return (
    <section style={{ ...workbenchCardStyle, position: 'relative', overflow: 'hidden' }}>
      {sectionHead}
      {/* 卡体定高（MARKET_BODY_HEIGHT）恒单列：事件与情报收进右侧滑出菜单，
          图表占满全宽（无左右空白）；极窄视口由卡内滚动兜底。 */}
      <div
        className="lpl-card-scroll"
        data-testid="market-body-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          height: MARKET_BODY_HEIGHT,
          overflow: 'auto',
        }}
      >
        {/* 图表区（月度单线 SVG + 图例；无口径脚注——信息删减拍板） */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* 月调整应用反馈（B.5.6）：应用后显示「本月比值 ×… · 已联动 N 个预测周」+ 查看主图 / 检查库存 */}
          {(() => {
            const feedbackPoint = feedback != null
              ? months.find((point) => point.key === feedback.monthKey && point.status === 'forecast') ?? null
              : null;
            if (feedback == null || feedbackPoint == null || feedbackPoint.baseline <= 0) return null;
            const linkedWeeks = result.weeks.filter((week) => week.status === 'forecast' && week.monthKey === feedbackPoint.key).length;
            return (
              <div
                role="status"
                aria-live="polite"
                data-lpl-month-feedback={feedbackPoint.key}
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginBottom: space.xs, padding: '4px 10px', borderRadius: radius.control, border: `1px solid ${color.hairline}`, background: color.canvasSoft2 }}
              >
                <span className="tnum" style={{ fontSize: 11.5, fontWeight: 600, color: color.ink }}>
                  {`本月比值 ×${(feedback.value / feedbackPoint.baseline).toFixed(2)} · 已联动 ${linkedWeeks} 个预测周`}
                </span>
                <button
                  type="button"
                  onClick={() => onViewMainChart?.()}
                  style={{ border: 'none', background: 'transparent', color: color.link, font: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  查看主图
                </button>
                <button
                  type="button"
                  onClick={() => onCheckInventory?.()}
                  style={{ border: 'none', background: 'transparent', color: color.link, font: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  检查库存
                </button>
                <button
                  type="button"
                  aria-label={`关闭 ${feedbackPoint.key} 调整反馈`}
                  onClick={() => setFeedback(null)}
                  style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: color.mute, fontSize: 12, lineHeight: 1.2, cursor: 'pointer', padding: 2 }}
                >
                  ×
                </button>
              </div>
            );
          })()}
          {/* v2-2「移开即恢复」：证据态浮层随鼠标离开图区关闭（调整态粘滞，需显式取消/应用）。 */}
          <div
            style={{ position: 'relative', flex: 1, minHeight: 0 }}
            onMouseLeave={() => setPopover((prev) => (prev?.mode === 'evidence' ? null : prev))}
          >
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              width="100%"
              role="img"
              aria-label={`大盘月度指数：历史 ${months[0]?.key ?? ''}–${months[actualCount - 1]?.key ?? ''}（模拟实际）；预测 ${forecastMonthKeys[0] ?? ''}–${forecastMonthKeys[forecastMonthKeys.length - 1] ?? ''}（未来 4 季逐月，AI 基线）；顶部事件箭头小标 hover 高亮区间；hover 或 Enter 预测月查看证据浮框并可调整。`}
              style={{ display: 'block' }}
            >
              <g stroke={color.hairline}>
                {yTicks.map((tick) => (
                  <line key={tick} x1={left} y1={ym(tick)} x2={CHART_W - right} y2={ym(tick)} />
                ))}
              </g>
              <g fontSize={10} fill={color.mute} textAnchor="end">
                {yTicks.map((tick) => (
                  <text key={tick} x={left - 6} y={ym(tick) + 3}>{tick}</text>
                ))}
              </g>
              <text x={left - 6} y={top - 6} fontSize={10} fill={color.mute} textAnchor="end">指数</text>
              {/* 图内高亮（开关常开态）：所有事件区间底衬（事件色 × 0.10） */}
              {eventsVisible && highlightAll && (
                <g data-lpl-event-bands>
                  {eventMarks.map((mark) => (
                    <rect
                      key={`band-${mark.id}`}
                      data-lpl-event-band={mark.id}
                      x={mark.x1}
                      y={top - 8}
                      width={Math.max(2, mark.x2 - mark.x1)}
                      height={plotH + 8}
                      rx={3}
                      fill={mark.color}
                      opacity={0.1}
                    />
                  ))}
                </g>
              )}
              {/* v2-2 双锚点 · 趋势源段浅底衬带（hover 临时，canvasSoft2 系，非新线非箭头） */}
              {anchorActive && trendWindowValid && (
                <g data-anchor="trend-source">
                  <rect
                    data-anchor="trend-band"
                    data-anchor-window={`${trendWindow.months[0].key}..${trendWindow.months[trendWindow.months.length - 1].key}`}
                    x={left + trendFirstIndex * colW}
                    y={top}
                    width={trendWindow.months.length * colW}
                    height={plotH}
                    rx={4}
                    fill={color.canvasSoft2}
                    opacity={0.7}
                  />
                  <text
                    x={left + (trendFirstIndex + trendWindow.months.length / 2) * colW}
                    y={top - 4}
                    fontSize={9.5}
                    fill={color.mute}
                    textAnchor="middle"
                  >
                    {`趋势源 · 近 ${MARKET_TREND_WINDOW_MONTHS} 个月`}
                  </text>
                </g>
              )}
              {/* hover 事件小标 → 对应周区间临时高亮（移开即恢复） */}
              {hoverMark && (
                <rect
                  data-lpl-event-band-hover={hoverMark.id}
                  x={hoverMark.x1}
                  y={top - 8}
                  width={Math.max(2, hoverMark.x2 - hoverMark.x1)}
                  height={plotH + 8}
                  rx={3}
                  fill={hoverMark.color}
                  opacity={0.14}
                />
              )}
              {/* 历史/预测分界虚线（定位参考非说明；「今天」文字标签已删） */}
              <line x1={todayX} y1={top - 4} x2={todayX} y2={top + plotH} stroke={color.hairlineStrong} strokeDasharray="4 4">
                <title>历史 | 预测分界</title>
              </line>
              {/* 历史月实线（墨）→ 预测月虚线（蓝，随事件与按月调整即时重算）+ AI 基线对照灰虚线；
                  线宽 = 全站主类线基准 2（实/虚同宽，虚线 dasharray 区分）；
                  双锚点激活时其余线段降不透明（data-dim），移开即恢复 */}
              {seriesOn(SERIES_ACTUAL) && (
                <path
                  data-series="actual"
                  data-dim={anchorActive ? 'true' : undefined}
                  d={actualPath}
                  fill="none"
                  stroke={color.ink}
                  strokeWidth={2}
                  opacity={anchorActive ? 0.25 : 1}
                />
              )}
              {seriesOn(SERIES_FORECAST) && (
                <path
                  data-series="forecast"
                  data-dim={anchorActive ? 'true' : undefined}
                  d={forecastPath}
                  fill="none"
                  stroke={color.link}
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  opacity={anchorActive ? 0.25 : 1}
                />
              )}
              {showAiGhost && (
                <g data-series="ai-ghost" data-dim={anchorActive ? 'true' : undefined} opacity={anchorActive ? 0.3 : 0.85}>
                  <path d={ghostPath} fill="none" stroke={color.hairlineStrong} strokeWidth={1.4} strokeDasharray="2 4" />
                </g>
              )}
              {/* v2-2 双锚点 · 趋势源段加重（同一段实际线的强调描边，hover 临时） */}
              {anchorActive && trendWindowValid && seriesOn(SERIES_ACTUAL) && (
                <path
                  data-anchor="trend-seg"
                  d={trendWindow.months.map((month, index) => `${index === 0 ? 'M' : 'L'}${xm(trendFirstIndex + index).toFixed(1)} ${ym(month.value).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={color.ink}
                  strokeWidth={2}
                />
              )}
              {/* 已调整月 = 轻量标记：生效点实心蓝点（评审拍板：小点 / 月标签加重取其一） */}
              {seriesOn(SERIES_FORECAST) && months.slice(actualCount).map((point, offset) => (
                point.override != null ? (
                  <circle
                    key={`adj-${point.key}`}
                    data-adjusted={point.key}
                    cx={xm(actualCount + offset)}
                    cy={ym(point.value)}
                    r={3.2}
                    fill={color.link}
                    stroke={color.canvas}
                    strokeWidth={1.4}
                  />
                ) : null
              ))}
              {/* v2-2 双锚点 · 去年同位点圆环 + 来源连线 + hover 月加重点（hover 临时） */}
              {anchorActive && popoverPoint && (() => {
                const hoverIndex = months.indexOf(popoverPoint);
                const hoverX = xm(hoverIndex);
                const hoverY = ym(popoverPoint.value);
                return (
                  <g data-anchor="dual-anchor">
                    {lastYearAnchor && (
                      <>
                        <circle
                          data-anchor="last-year-ring"
                          data-anchor-month={lastYearAnchor.key}
                          cx={xm(lastYearAnchor.index)}
                          cy={ym(lastYearAnchor.value)}
                          r={7}
                          fill="none"
                          stroke={color.link}
                          strokeWidth={2}
                        />
                        <text
                          x={xm(lastYearAnchor.index)}
                          y={ym(lastYearAnchor.value) - 11}
                          fontSize={9.5}
                          fill={color.link}
                          textAnchor="middle"
                        >
                          {`月形来源 · 去年 ${Number(lastYearAnchor.key.slice(5))} 月`}
                        </text>
                        <line
                          data-anchor="source-link"
                          x1={xm(lastYearAnchor.index)}
                          y1={ym(lastYearAnchor.value)}
                          x2={hoverX}
                          y2={hoverY}
                          stroke={color.link}
                          strokeWidth={1}
                          strokeDasharray="2 4"
                          opacity={0.45}
                        />
                      </>
                    )}
                    <circle data-anchor="hover-point" cx={hoverX} cy={hoverY} r={4.5} fill={color.link} stroke={color.canvas} strokeWidth={1.4} />
                    <text data-anchor="hover-label" x={hoverX} y={hoverY + 16} fontSize={9.5} fill={color.link} fontWeight={600} textAnchor="middle">
                      {fmtMonthCalendar(popoverPoint.key)}
                    </text>
                  </g>
                );
              })()}
              {/* X 轴月份刻度（季度首月出标签；全站月视图日历格式 YYYY-MM） */}
              <g fontSize={9.5} fill={color.mute} textAnchor="middle">
                {months.map((point, index) => (
                  isQuarterStartMonth(point.key)
                    ? <text key={point.key} x={xm(index)} y={CHART_H - 30}>{fmtMonthCalendar(point.key)}</text>
                    : null
                ))}
              </g>
              {/* 图上事件小标统一层（箭头-线 + 名称；「事件」图例项控制整层）：
                  人工月事件 = 琥珀；周口径行业事件 = 灰。hover → 区间临时高亮。 */}
              {eventsVisible && (
                <g data-lpl-event-track>
                  {eventMarks.map((mark) => {
                    const x1 = mark.x1 + 2;
                    const x2 = mark.x2 - 2;
                    const y0 = 14;
                    return (
                      <g
                        key={`tick-${mark.id}`}
                        data-lpl-event-tick={mark.id}
                        data-month-event-id={mark.kind === 'month' ? mark.id : undefined}
                        data-week-event-id={mark.kind === 'week' ? mark.id : undefined}
                        style={{ cursor: 'default' }}
                        onMouseEnter={() => setHoverEventId(mark.id)}
                        onMouseLeave={() => setHoverEventId((prev) => (prev === mark.id ? null : prev))}
                      >
                        <rect x={x1} y={4} width={Math.max(6, x2 - x1)} height={22} fill="rgba(0,0,0,0)" pointerEvents="all" />
                        <path d={`M${(x1 + 5).toFixed(1)} ${y0 - 5} L${x1.toFixed(1)} ${y0} L${(x1 + 5).toFixed(1)} ${y0 + 5}`} fill="none" stroke={mark.color} strokeWidth={1.6} />
                        <line x1={(x1 + 5).toFixed(1)} y1={y0} x2={(x2 - 5).toFixed(1)} y2={y0} stroke={mark.color} strokeWidth={1.6} />
                        <path d={`M${(x2 - 5).toFixed(1)} ${y0 - 5} L${x2.toFixed(1)} ${y0} L${(x2 - 5).toFixed(1)} ${y0 + 5}`} fill="none" stroke={mark.color} strokeWidth={1.6} />
                        <text x={((x1 + x2) / 2).toFixed(1)} y={y0 - 4} textAnchor="middle" fontSize={10} fill={mark.color} fontWeight={600}>{mark.label}</text>
                        <title>{mark.detail}</title>
                      </g>
                    );
                  })}
                </g>
              )}
              {/* 预测月交互列（v2-1 证据浮框入口）：键盘可达（Tab + Enter 触发证据浮框），
                  hover 同效；浮框内「调整此月」就地切换调整表单 */}
              {months.slice(actualCount).map((point, offset) => {
                const index = actualCount + offset;
                const x = left + index * colW;
                return (
                  <rect
                    key={`hit-${point.key}`}
                    data-month={point.key}
                    x={x}
                    y={top}
                    width={colW}
                    height={plotH}
                    fill="transparent"
                    role="button"
                    tabIndex={0}
                    aria-label={`查看 ${point.key} 预测证据（当前 ${fmtIndex(point.value)}，AI 基线 ${fmtIndex(point.baseline)}），浮框内可调整`}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setPopover((prev) => (prev?.mode === 'adjust' ? prev : { key: point.key, mode: 'evidence' }))}
                    onFocus={() => setPopover((prev) => (prev?.mode === 'adjust' ? prev : { key: point.key, mode: 'evidence' }))}
                    onClick={() => setPopover({ key: point.key, mode: 'evidence' })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setPopover({ key: point.key, mode: 'evidence' });
                      }
                    }}
                  />
                );
              })}
            </svg>
            {/* 就地浮层（HTML 覆盖层，与主图悬停浮窗同视觉语言；两态 = 证据 / 调整表单；
                跟随月份列定位，右半区左翻） */}
            {popoverPoint && popover && (
              <div style={{ position: 'absolute', left: `${popoverAnchorPct}%`, top: 0, width: 0, height: 0 }}>
                {popover.mode === 'adjust' ? (
                  <MonthAdjustPopover
                    key={`adj-${popoverPoint.key}`}
                    point={popoverPoint}
                    flip={popoverFlip}
                    onApply={(value, reason) => {
                      onMonthOverride(popoverPoint.key, value, reason);
                      // B.5.6：应用后反馈「本月比值 ×… · 已联动 N 个预测周」（比值 = 应用值 ÷ AI 基线）。
                      setFeedback({ monthKey: popoverPoint.key, value });
                      setPopover(null);
                    }}
                    onRestore={() => {
                      onMonthOverride(popoverPoint.key, null, '');
                      setFeedback((prev) => (prev?.monthKey === popoverPoint.key ? null : prev));
                      setPopover(null);
                    }}
                    onBack={() => setPopover({ key: popoverPoint.key, mode: 'evidence' })}
                  />
                ) : (
                  <MonthEvidencePopover
                    key={`ev-${popoverPoint.key}`}
                    point={popoverPoint}
                    fixture={fixture}
                    params={params}
                    trendWindow={trendWindow}
                    quarterValue={quarterForecast.find((quarter) => quarter.key === popoverPoint.quarter)?.value ?? Number.NaN}
                    flip={popoverFlip}
                    onAdjust={() => setPopover({ key: popoverPoint.key, mode: 'adjust' })}
                    onClose={() => setPopover(null)}
                  />
                )}
              </div>
            )}
            {/* 添加/编辑事件浮窗（绝对定位悬浮在图上，不改变图表区高度；
                字段风格与量价参考编辑器同款：label 上标 + 小输入 + chips 行） */}
            {eventFormOpen && drawerOpen && (
              <div
                data-lpl-event-popover
                data-lpl-event-popover-mode={editingEventId != null ? 'edit' : 'add'}
                role="dialog"
                aria-label={editingEventId != null ? '编辑事件' : '添加事件'}
                onKeyDown={(event) => { if (event.key === 'Escape') { setEventFormOpen(false); setWeekPickerOpen(false); } }}
                style={{
                  position: 'absolute', top: 6, right: DRAWER_W + 12, width: EVENT_FORM_W, zIndex: 10,
                  background: color.canvas, border: `1px solid ${color.link}`, borderRadius: radius.card,
                  boxShadow: shadow.l5, padding: `${space.md - 2}px ${space.md}px`, fontSize: 12, lineHeight: 1.6, color: color.body,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: color.ink }}>{editingEventId != null ? '编辑事件' : '添加事件'}</span>
                  <button
                    type="button"
                    aria-label="关闭添加事件浮窗"
                    onClick={() => { setEventFormOpen(false); setWeekPickerOpen(false); }}
                    style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: color.mute, fontSize: 13, lineHeight: 1.2, cursor: 'pointer', padding: '0 2px' }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: 'grid', gap: space.sm - 2, marginTop: space.sm - 2 }}>
                  <label style={{ display: 'grid', gap: 3 }}>
                    <span style={{ fontSize: 11, color: color.mute }}>事件名称（选填）</span>
                    <Input
                      aria-label="事件名称（选填）"
                      placeholder="如：苹果折叠屏上线"
                      value={formLabel}
                      onChange={(input) => setFormLabel(input.target.value)}
                      size="small"
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 3 }}>
                    <span style={{ fontSize: 11, color: color.mute }}>事件说明（选填）</span>
                    <Input
                      aria-label="事件说明（选填）"
                      placeholder="发生了什么（选填）"
                      value={formNote}
                      onChange={(input) => setFormNote(input.target.value)}
                      size="small"
                    />
                  </label>
                  <div style={{ display: 'grid', gap: 3, position: 'relative' }}>
                    <span style={{ fontSize: 11, color: color.mute }}>起止周（整周 · 含年月）</span>
                    <button
                      type="button"
                      data-lpl-week-range-button
                      aria-expanded={weekPickerOpen}
                      aria-haspopup="dialog"
                      onClick={() => {
                        if (!weekPickerOpen && formStartWeekId != null) {
                          // 打开时跳到起点周所在月页（两月并排的左月）。
                          const week = calendar.weekById.get(formStartWeekId);
                          const pageIndex = week != null ? pickerMonths.findIndex((month) => month.key === week.monthKey) : -1;
                          if (pageIndex >= 0) setPickerPage(Math.min(Math.max(0, pageIndex), Math.max(0, pickerMonths.length - 2)));
                        }
                        setWeekPickerOpen((open) => !open);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px',
                        border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control,
                        background: color.canvas, color: color.ink, fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      <span className="tnum" style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formWeeks?.start != null && formWeeks?.end != null && formWeekCount != null
                          ? `${formWeeks.start.id} → ${formWeeks.end.id} · ${formWeekCount} 周`
                          : '请选择起止周'}
                      </span>
                      <span aria-hidden style={{ color: color.mute }}>▾</span>
                    </button>
                    {weekPickerOpen && (
                      <WeekRangePicker
                        months={pickerMonths}
                        page={pickerPage}
                        onPage={setPickerPage}
                        startWeekId={formStartWeekId}
                        endWeekId={formEndWeekId}
                        onPick={pickWeek}
                      />
                    )}
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
                    <span style={{ fontSize: 11, color: color.mute }}>幅度</span>
                    <InputNumber
                      aria-label="事件影响幅度（%）"
                      size="small"
                      min={-30}
                      max={30}
                      step={1}
                      precision={0}
                      value={formMagnitude}
                      formatter={(value) => (value == null ? '' : `${value}%`)}
                      parser={(text) => Number((text ?? '').replace('%', ''))}
                      onChange={(value) => setFormMagnitude(value == null ? null : Number(value))}
                      style={{ width: 84 }}
                    />
                  </label>
                  <div style={{ display: 'grid', gap: 3 }}>
                    <span style={{ fontSize: 11, color: color.mute }}>衰减</span>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {([
                        { key: 'decreasing', label: '递减' },
                        { key: 'flat', label: '恒定' },
                      ] as const).map((chip) => (
                        <button
                          key={chip.key}
                          type="button"
                          data-lpl-decay-chip={chip.key}
                          aria-pressed={formDecay === chip.key}
                          onClick={() => setFormDecay(chip.key)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px',
                            borderRadius: radius.pill, cursor: 'pointer', fontSize: 11,
                            border: `1px solid ${formDecay === chip.key ? color.ink : color.hairlineStrong}`,
                            background: color.canvas,
                            color: formDecay === chip.key ? color.ink : color.body,
                            fontWeight: formDecay === chip.key ? 600 : 400,
                          }}
                        >
                          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 2, background: chip.key === 'flat' ? color.mute : color.warning }} />
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: space.sm, marginTop: space.md, justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => { setEventFormOpen(false); setWeekPickerOpen(false); setEditingEventId(null); }}>取消</Button>
                  <Button
                    size="small"
                    type="primary"
                    disabled={!eventFormValid}
                    onClick={() => {
                      if (!eventFormValid || formMapped == null || formMagnitude == null) return;
                      const label = [formLabel.trim(), formNote.trim()].filter(Boolean).join('；');
                      const next = {
                        label,
                        startMonth: formMapped.startMonth,
                        startDay: formMapped.startDay,
                        durationMonths: formMapped.durationMonths,
                        magnitudePct: Math.max(-30, Math.min(30, Math.round(formMagnitude))),
                        decay: formDecay,
                      };
                      if (editingEventId != null) {
                        if (onMonthEventUpdate != null) onMonthEventUpdate(editingEventId, next);
                        else {
                          // 缺省回退：删除 + 新增（页面侧函数式更新保证两步都落；id 由页面重生成）。
                          onMonthEventRemove(editingEventId);
                          onMonthEventAdd(next);
                        }
                        setEditingEventId(null);
                      } else {
                        onMonthEventAdd(next);
                      }
                      setEventFormOpen(false);
                      setWeekPickerOpen(false);
                      setFormLabel('');
                      setFormNote('');
                    }}
                  >
                    {editingEventId != null ? '保存修改' : '保存事件'}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <WorkbenchLegend items={legendItems} hidden={hiddenSeries} onToggle={toggleSeries} style={{ marginTop: 0 }} />
        </div>
      </div>

      {/* 半透明遮罩（滑出菜单打开时；点击遮罩关闭） */}
      {drawerOpen && (
        <div
          data-lpl-drawer-scrim
          onClick={closeDrawer}
          style={{ position: 'absolute', inset: 0, zIndex: 8, background: color.ink, opacity: 0.28, cursor: 'pointer' }}
        />
      )}

      {/* 右侧滑出菜单（高保真形态）：transform translateX 过渡；内容 = 情报候选
          （IntelligenceReviewPanel availability="pending" 空态，真实候选另议）+
          人工事件列表（名称、起止周段、幅度、衰减 + 编辑/删除）+「＋ 添加事件」。
          Esc / ✕ / 遮罩点击关闭。 */}
      <div
        id="lpl-market-drawer"
        data-lpl-drawer
        data-open={drawerOpen ? 'true' : 'false'}
        role="dialog"
        aria-label="事件与情报"
        aria-hidden={!drawerOpen}
        onKeyDown={(event) => { if (event.key === 'Escape') closeDrawer(); }}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: DRAWER_W, zIndex: 9,
          display: 'flex', flexDirection: 'column', gap: 0,
          background: color.canvas, borderLeft: `1px solid ${color.hairlineStrong}`, boxShadow: shadow.l5,
          transform: drawerOpen ? 'translateX(0)' : `translateX(105%)`,
          transition: drawerTransition,
          padding: `${space.md - 2}px ${space.md}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.sm - 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: color.ink }}>事件与情报</span>
          <button
            type="button"
            data-lpl-drawer-close
            aria-label="关闭事件与情报"
            onClick={closeDrawer}
            style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: color.mute, fontSize: 13, lineHeight: 1.2, cursor: 'pointer', padding: '0 2px' }}
          >
            ✕
          </button>
        </div>
        <div className="lpl-card-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: space.md, alignContent: 'start', paddingRight: 2 }}>
          <IntelligenceReviewPanel availability="pending" />
          <div style={{ display: 'grid', gap: space.sm - 2 }}>
            <div style={{ fontSize: 11, color: color.mute, letterSpacing: '0.06em' }}>{`人工事件 · ${params.marketMonthEvents.length}`}</div>
            {params.marketMonthEvents.map((event) => (
              <div
                key={event.id}
                data-lpl-month-event-row={event.id}
                style={{ display: 'grid', gap: 3, border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: `${space.sm - 2}px 10px` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: space.sm - 2, minWidth: 0 }}>
                  <span aria-hidden style={{ flex: 'none', width: 8, height: 8, borderRadius: 2, background: color.warning }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.label || '未命名事件'}>
                    {event.label || '未命名事件'}
                  </span>
                  <button
                    type="button"
                    aria-label={`编辑事件 ${event.label || '未命名事件'}`}
                    onClick={() => openEventForm(event)}
                    style={{ border: 'none', background: 'transparent', color: color.mute, fontSize: 12, cursor: 'pointer', padding: 0 }}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    aria-label={`删除事件 ${event.label || '未命名事件'}`}
                    onClick={() => {
                      if (editingEventId === event.id) {
                        setEditingEventId(null);
                        setEventFormOpen(false);
                        setWeekPickerOpen(false);
                      }
                      onMonthEventRemove(event.id);
                    }}
                    style={{ border: 'none', background: 'transparent', color: color.mute, fontSize: 12, cursor: 'pointer', padding: 0 }}
                  >
                    删除
                  </button>
                </div>
                <div className="tnum" style={{ fontSize: 11, color: color.mute, display: 'flex', flexWrap: 'wrap', gap: '0 8px' }}>
                  <span>{eventRangeText(event)}</span>
                  <span>{`${fmtSignedPct(event.magnitudePct)} · ${decayLabelOf(event)}`}</span>
                </div>
              </div>
            ))}
            {params.marketMonthEvents.length === 0 && (
              <div style={{ border: `1px dashed ${color.hairlineStrong}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px`, fontSize: 12, color: color.mute }}>
                暂无人工事件
              </div>
            )}
            <button
              type="button"
              data-lpl-add-event-button
              onClick={() => openEventForm()}
              style={{
                width: '100%', marginTop: space.xs, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                height: 30, borderRadius: radius.control, border: `1px dashed ${color.hairlineStrong}`,
                background: color.canvas, color: color.link, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              ＋ 添加事件
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
