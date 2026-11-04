// ============================================================
// 推演工作台 v2 · 层②大盘 · 总量总线（2026-11-04 月粒度重构 + 证据信任 v2）：
// 主序列 = 月粒度（大盘数据粒度 = 月，调整颗粒度 = 月）：历史月度实线
// （2025-01–2026-09 模拟样本）+ 未来 4 个季度逐月预测虚线（2026-10–2027-09，
// AI 季节 × 趋势季度基线的月形分布，确定性外推禁随机，口径见
// fixture.market.monthlyNote）；卡内布局 = 图表区左 2/3 主视觉 + 事件区右 1/3。
// 证据信任 v2（2026-11-04 晚拍板，设计稿 design-proposals/forecast-baseline-trust.html
// v2-1 / v2-2 / v2-3 三节）：
// - v2-1 hover 证据浮框：hover/Tab+Enter 预测月 → 四层浮框 = 头部（月名 +
//   AI 基线/生效）→ 趋势行（近 6 个月实际实线 + 基线虚线延伸 sparkline，
//   环比数字由 workbenchModel.marketTrendWindow 导出，UI 不另编）→ 月形行
//   （去年同季三根小柱 + 占季内均值占比，本月高亮，构成算例）→ 底部
//   「调整此月」就地切换为既有调整表单（一层化：证据与调整同一浮层两态）；
//   含事件/手调月顶部加复算提示（如「含事件 +0.8%（均摊 3/31 天）」）。
// - v2-2 图上双锚点：hover 月同时图上临时高亮——趋势源段（近 6 个月实际段）
//   浅底衬带（canvasSoft2 系，非新线）+ 去年同位点圆环 + 其余线段降不透明；
//   移开即恢复，零新增常驻元素。
// - v2-3 徽章三步链：卡头既有「AI 推测 · 可改」徽章 hover/点击 → 三步链浮层
//   （样本 → 两个规律 → 外推，含算例，数字同出模型导出），整卡常驻元素零增加。
// - 口径一致：浮框/高亮窗口与数字全部来自 workbenchModel 实际计算路径
//   （marketTrendWindow 6 个月窗口 / marketMonthShape 去年同季月形 /
//   computeMarketMonths 月形分布），季度基线外推链（主链口径）结构不动。
// 按月调整沿用会话草稿机制（onMonthOverride(key, null) 还原），有人工调整的
// 季度经季内三月均值同步 q4/q1Override 进主链（workbenchModel.withMarketMonthOverride）。
// 事件区（右 1/3）两块：上块 = AI 候选事件 Top5 占位（空态注明「候选生成
// 能力待接入，抓取逻辑另议」，先列后删交互骨架为禁用态静态示意，不接数据）；
// 下块 = 人工月度事件列表 + 极简三字段录入（起始月/日 + 时长（月）+ 幅度%，
// 名称选填）。事件在图上的呈现 = 次要标记（轴下小标记 + hover 详情，
// 不占主视觉）：月中起始按日均摊（首月影响 × 覆盖天数 ÷ 当月天数，显式口径）。
// X 轴月标签 = 全站月视图日历格式 YYYY-MM（与价格走势/量价月视图悬停与明细
// 同一口径，fmtMonthCalendar 复用该格式，不新造）；「今天」文字标签已删
// （说明性内容），历史/预测分界虚线保留（定位参考非说明）。
// 卡体延续 A2 定高策略（MARKET_BODY_HEIGHT）+ 右栏卡内纵向滚动。
// 全部视觉取 theme/tokens 既有 token 与 WorkbenchBits 既有控件语言，无新视觉。
// ============================================================
import { useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Select } from 'antd';
import { color, radius, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import type { MarketMonthEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { MarketMonthPoint, MarketTrendWindowPoint, WorkbenchParams, WorkbenchResult } from './workbenchModel';
import {
  daysInMonthOf,
  MARKET_TREND_WINDOW_MONTHS,
  marketMonthEventFactor,
  marketMonthShape,
  marketQuarterForecast,
  marketTrendWindow,
  monthCoverageRatio,
  monthKeyOfDate,
  monthsBetween,
  MONTH_OVERRIDE_MAX,
  MONTH_OVERRIDE_MIN,
} from './workbenchModel';
import { AiJudgeBadge, IoBar, SectionHead, SimChip, WorkbenchLegend, fmtSignedPct, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

const CHART_W = 560;
const CHART_H = 240;

/**
 * 卡体定高策略（A2 底部拉齐延续）：图表区左 2/3 + 事件区右 1/3，内容区固定
 * 420px；右栏（事件区）内容超高由卡内纵向滚动兜底（lpl-card-scroll 细滚动条），
 * 本卡底边可预测，与相邻卡统一高度策略。左图 SVG 在剩余高度内自适应
 * （viewBox 等比缩放）。
 */
const MARKET_BODY_HEIGHT = 420;

// 图例系列 key（显隐状态按 key 记录；AI 基线只控制对照虚线，不影响生效值渲染）。
const SERIES_ACTUAL = 'actual';
const SERIES_FORECAST = 'forecast';
const SERIES_AI_BASELINE = 'ai-baseline';

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
  /** 所属季度基线（marketQuarterForecast 导出），算例首项。 */
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
            <polyline points={extPoints.join(' ')} fill="none" stroke={color.link} strokeWidth={1.8} strokeDasharray="4 3" />
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
        <span style={{ fontSize: 10.5, color: color.mute }}>调整后按季度均值同步主链</span>
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
        只调整该月；应用后预测线即时重算，本会话内可还原（还原空月季度回 AI 口径）。
      </div>
    </div>
  );
}

/** AI 候选事件 Top5 占位（2026-11-04 评审：只留界面占位，不接任何数据）。 */
function AiCandidatePlaceholder() {
  const chipStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: radius.pill,
    fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    background: color.canvasSoft2, color: color.body, border: `1px solid ${color.hairline}`,
  };
  return (
    <div style={{ display: 'grid', gap: space.sm, paddingBottom: space.md, borderBottom: `1px solid ${color.hairline}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>AI 候选事件 Top5</span>
        <span style={chipStyle}>待接入</span>
        <Button size="small" disabled title="候选生成能力待接入，抓取逻辑另议">弹出候选</Button>
      </div>
      {/* 先列后删交互骨架（静态禁用态示意）：勾选 + 删除，全部禁用，不接数据 */}
      <div role="group" aria-label="AI 候选事件占位列表（禁用态示意）" style={{ display: 'grid', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((index) => (
          <div
            key={index}
            aria-hidden="true"
            style={{
              display: 'flex', alignItems: 'center', gap: space.sm,
              border: `1px solid ${color.hairline}`, borderRadius: radius.control,
              padding: `3px ${space.sm}px`, background: color.canvasSoft, opacity: 0.62,
            }}
          >
            <Checkbox disabled />
            <span style={{ flex: 1, fontSize: 11.5, color: color.mute }}>{`候选事件位 ${index} · 待接入`}</span>
            <Button size="small" disabled>删除</Button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.6, color: color.mute }}>
        候选生成能力待接入，抓取逻辑另议；接入后先列后删（勾选候选 → 删除入人工事件）。
      </div>
    </div>
  );
}

export default function MarketBusPanel({
  fixture,
  params,
  result,
  onMonthOverride,
  onMonthEventAdd,
  onMonthEventRemove,
}: {
  fixture: WorkbenchFixture;
  params: WorkbenchParams;
  result: WorkbenchResult;
  /** 按月调整（点击预测月浮层应用）：value = null 还原该月；reason 选填可空。 */
  onMonthOverride: (monthKey: string, value: number | null, reason: string) => void;
  /** 新增人工月度事件（极简三字段产物；id 由页面侧循环查重生成）。 */
  onMonthEventAdd: (event: Omit<MarketMonthEventSeed, 'id'>) => void;
  onMonthEventRemove: (id: string) => void;
  /** 兼容保留（A2 删理由栏后 UI 不再消费）：页面壳仍传该回调，契约不动，勿删。 */
  onRationaleChange: (text: string) => void;
}) {
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set());
  /** v2-1 一层化两态：evidence = 证据浮框（hover 临时）；adjust = 调整表单（就地切换，粘滞）。 */
  const [popover, setPopover] = useState<{ key: string; mode: 'evidence' | 'adjust' } | null>(null);
  /** v2-3 徽章三步链浮层（hover/点击临时，零新增常驻元素）。 */
  const [chainOpen, setChainOpen] = useState(false);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [formMonth, setFormMonth] = useState<string>('');
  const [formDay, setFormDay] = useState<number | null>(1);
  const [formDuration, setFormDuration] = useState<number | null>(1);
  const [formMagnitude, setFormMagnitude] = useState<number | null>(5);
  const [formLabel, setFormLabel] = useState('');
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
  const quarterForecast = marketQuarterForecast(fixture);
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
  ];

  const ioBar = <IoBar input="月度指数 · 行业事件（月中按日均摊）" output="主图周销基准" />;
  const sectionHead = (
    <SectionHead
      title="大盘 · 总量总线"
      hint={`历史月度线 2025-01 连贯至当前实际；向后按月预测未来 4 个季度（${forecastMonthKeys[0] ?? ''} … ${forecastMonthKeys[forecastMonthKeys.length - 1] ?? ''}，AI 基线逐月分布）。hover 预测月看证据浮框（趋势 / 月形 / 算例），浮框内就地调整；调整只落当月，可撤销。`}
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
          <AiJudgeBadge source={params.overrideSource} />
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
      </>}
    />
  );

  // 空态：无月度数据不渲染 NaN / Infinity SVG。
  if (months.length === 0) {
    return (
      <section style={workbenchCardStyle}>
        {sectionHead}
        {ioBar}
        <div style={{ padding: `${space.lg}px 0`, fontSize: 12.5, color: color.mute }}>当前范围无大盘数据</div>
      </section>
    );
  }

  // 左图几何：33 个月（21 实际 + 12 预测 = 未来 4 季度逐月）。
  const left = 40;
  const right = 14;
  const top = 18;
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

  /** 月度事件在图上的起始月序（起始月不在当前窗口时返回 null，不画标记）。 */
  const monthEventIndex = (event: MarketMonthEventSeed): number | null => {
    const index = months.findIndex((point) => point.key === event.startMonth);
    return index >= 0 ? index : null;
  };
  /** 周口径行业事件锚月序（起周所属月，缺周回 null 不画）。 */
  const weekEventIndex = (event: { startWeek: number }): number | null => {
    const week = fixture.weeks.find((candidate) => candidate.weekNumber === event.startWeek);
    const monthKey = week ? monthKeyOfDate(week.date) : null;
    if (!monthKey) return null;
    const index = months.findIndex((point) => point.key === monthKey);
    return index >= 0 ? index : null;
  };

  const eventFormValid = formMonth !== '' && formDay != null && Number.isFinite(formDay) && formDay >= 1 && formDay <= 31
    && formDuration != null && formDuration >= 1 && formDuration <= 12
    && formMagnitude != null && Number.isFinite(formMagnitude) && formMagnitude >= -30 && formMagnitude <= 30;

  return (
    <section style={workbenchCardStyle}>
      {sectionHead}
      {ioBar}
      {/* 卡体定高（MARKET_BODY_HEIGHT）：图表区左 2/3 主视觉 + 事件区右 1/3；
          极窄视口由卡内滚动兜底（lpl-card-scroll 细滚动条对齐系统样式）。 */}
      <div
        className="lpl-card-scroll"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: space.lg,
          height: MARKET_BODY_HEIGHT,
          overflow: 'auto',
        }}
      >
        {/* 左 2/3：图表区（四季度 AI 基线读数 + 月度单线 SVG + 图例 + 口径脚注） */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            className="tnum"
            style={{ fontSize: 11, color: color.mute, marginBottom: space.xs }}
            title="季度基线 = 季内三月均值（容量守恒：季内三月合计恒等季度基线 × 3）；按月调整后，有人工调整的季度均值同步主链改格。"
          >
            {`AI 四季度基线：${quarterForecast.map((quarter) => `${quarter.key} ${fmtIndex(quarter.value)}`).join(' · ')}（逐月分布见图）`}
          </div>
          {/* v2-2「移开即恢复」：证据态浮层随鼠标离开图区关闭（调整态粘滞，需显式取消/应用）。 */}
          <div
            style={{ position: 'relative', flex: 1, minHeight: 0 }}
            onMouseLeave={() => setPopover((prev) => (prev?.mode === 'evidence' ? null : prev))}
          >
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`大盘月度指数：历史 ${months[0]?.key ?? ''}–${months[actualCount - 1]?.key ?? ''}（模拟实际）；预测 ${forecastMonthKeys[0] ?? ''}–${forecastMonthKeys[forecastMonthKeys.length - 1] ?? ''}（未来 4 季度逐月，AI 基线）；hover 或 Enter 预测月查看证据浮框并可调整。`}
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
              {/* 历史/预测分界虚线（定位参考非说明；「今天」文字标签按 2026-11-04 拍板删除） */}
              <line x1={todayX} y1={top - 4} x2={todayX} y2={top + plotH} stroke={color.hairlineStrong} strokeDasharray="4 4">
                <title>历史 | 预测分界</title>
              </line>
              {/* 历史月实线（墨）→ 预测月虚线（蓝，随事件与按月调整即时重算）+ AI 基线对照灰虚线；
                  双锚点激活时其余线段降不透明（data-dim），移开即恢复 */}
              {seriesOn(SERIES_ACTUAL) && (
                <path
                  data-series="actual"
                  data-dim={anchorActive ? 'true' : undefined}
                  d={actualPath}
                  fill="none"
                  stroke={color.ink}
                  strokeWidth={2.2}
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
                  strokeWidth={2.2}
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
                  strokeWidth={2.8}
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
              {/* 事件次要标记（轴下小标记 + hover 详情，不占主视觉）：
                  月度三字段事件 = 琥珀实心菱；周口径行业事件（预填默认，仍在主链生效）= 灰空心圆 */}
              {params.marketMonthEvents.map((event) => {
                const index = monthEventIndex(event);
                if (index == null) return null;
                const cx = xm(index);
                const markY = CHART_H - 13;
                return (
                  <g key={`me-${event.id}`} data-month-event-id={event.id} data-start-month={event.startMonth}>
                    <rect
                      x={cx - 3.4}
                      y={markY - 3.4}
                      width={6.8}
                      height={6.8}
                      transform={`rotate(45 ${cx} ${markY})`}
                      fill={color.warning}
                    />
                    <title>
                      {`${event.label || '未命名事件'}（${event.startMonth}-${fmtDay(event.startDay)} 起 · ${event.durationMonths} 个月 · ${fmtSignedPct(event.magnitudePct)}${event.startDay > 1 ? ` · ${monthCoverageText(event)}` : ''}）`}
                    </title>
                  </g>
                );
              })}
              {params.marketEvents.map((event) => {
                const index = weekEventIndex(event);
                if (index == null) return null;
                const cx = xm(index);
                const markY = CHART_H - 13;
                const endWeek = event.startWeek + event.durationWeeks - 1;
                return (
                  <g key={`we-${event.id}`} data-week-event-id={event.id}>
                    <circle cx={cx} cy={markY} r={3.4} fill={color.canvas} stroke={color.hairlineStrong} strokeWidth={1.4} />
                    <title>{`${event.label}（W${event.startWeek}–W${endWeek} · ${fmtSignedPct(event.magnitudePct)} · 周口径行业事件，主链生效中）`}</title>
                  </g>
                );
              })}
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
                      setPopover(null);
                    }}
                    onRestore={() => {
                      onMonthOverride(popoverPoint.key, null, '');
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
          </div>
          <WorkbenchLegend items={legendItems} hidden={hiddenSeries} onToggle={toggleSeries} style={{ marginTop: 0 }} />
          <div style={{ marginTop: space.xs, fontSize: 11, lineHeight: 1.6, color: color.mute }}>
            大盘只看总量，不下钻品牌 / 品；预测覆盖未来 4 个季度（月粒度）。hover 预测月看证据（近 6 个月趋势 / 去年同季月形 / 算例），浮框内可调整；调整原因选填；月中事件按日均摊口径见事件区说明。
          </div>
        </div>

        {/* 右 1/3：事件区两块（上 = AI 候选事件 Top5 占位；下 = 人工月度事件三字段录入）。
            内容超高由卡内纵向滚动兜底（lpl-card-scroll 细滚动条对齐系统样式）。 */}
        <div className="lpl-card-scroll" style={{ display: 'grid', gap: space.md, minWidth: 0, minHeight: 0, overflowY: 'auto', alignContent: 'start', paddingRight: 2 }}>
          <AiCandidatePlaceholder />

          <div style={{ display: 'grid', gap: space.sm }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>人工事件（月度 · 三字段）</div>
            <div style={{ fontSize: 11, lineHeight: 1.6, color: color.mute }}>
              事件 = 起始（月 / 日）+ 时长（月）+ 幅度（%）；名称选填。月中起始按日均摊：首月影响 ×（覆盖天数 ÷ 当月天数），后续月线性递减。
            </div>
            {params.marketMonthEvents.map((event) => (
              <div key={event.id} style={{ display: 'grid', gap: 3, border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.label || '未命名事件'}
                  </span>
                  <Button size="small" aria-label={`删除事件 ${event.label || '未命名事件'}`} onClick={() => onMonthEventRemove(event.id)}>删除</Button>
                </div>
                <div className="tnum" style={{ fontSize: 11, color: color.mute }}>
                  {`${event.startMonth}-${fmtDay(event.startDay)} 起 · ${event.durationMonths} 个月 · ${fmtSignedPct(event.magnitudePct)}${event.startDay > 1 ? ` · ${monthCoverageText(event)}` : ''}`}
                </div>
              </div>
            ))}
            {eventFormOpen ? (
              <div style={{ display: 'grid', gap: space.sm, border: `1px dashed ${color.hairlineStrong}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
                    起始月
                    <Select
                      aria-label="事件起始月"
                      size="small"
                      value={formMonth || forecastMonthKeys[0]}
                      onChange={(value: string) => setFormMonth(value)}
                      options={forecastMonthKeys.map((key) => ({ value: key, label: key }))}
                      style={{ width: 104 }}
                    />
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
                    起始日
                    <InputNumber
                      aria-label="事件起始日（1–31）"
                      size="small"
                      min={1}
                      max={31}
                      step={1}
                      precision={0}
                      value={formDay}
                      onChange={(value) => setFormDay(value == null ? null : Number(value))}
                      style={{ width: 64 }}
                    />
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
                    时长（月）
                    <InputNumber
                      aria-label="事件时长（月）"
                      size="small"
                      min={1}
                      max={12}
                      step={1}
                      precision={0}
                      value={formDuration}
                      onChange={(value) => setFormDuration(value == null ? null : Number(value))}
                      style={{ width: 64 }}
                    />
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
                    幅度
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
                      style={{ width: 76 }}
                    />
                  </label>
                </div>
                <label style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 600, color: color.body }}>
                  {`事件名称（选填）`}
                  <Input
                    aria-label="事件名称（选填）"
                    placeholder="选填：如 内存涨价"
                    value={formLabel}
                    onChange={(input) => setFormLabel(input.target.value)}
                  />
                </label>
                <div style={{ display: 'flex', gap: space.sm, justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => setEventFormOpen(false)}>收起</Button>
                  <Button
                    size="small"
                    type="primary"
                    disabled={!eventFormValid}
                    onClick={() => {
                      if (!eventFormValid || formDay == null || formDuration == null || formMagnitude == null) return;
                      onMonthEventAdd({
                        label: formLabel.trim(),
                        startMonth: formMonth,
                        startDay: Math.max(1, Math.min(31, Math.round(formDay))),
                        durationMonths: Math.max(1, Math.min(12, Math.round(formDuration))),
                        magnitudePct: Math.max(-30, Math.min(30, Math.round(formMagnitude))),
                      });
                      setEventFormOpen(false);
                      setFormLabel('');
                    }}
                  >
                    添加事件
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setFormMonth((prev) => prev || forecastMonthKeys[0] || '');
                  setEventFormOpen(true);
                }}
                style={{
                  border: `1px dashed ${color.hairlineStrong}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px`,
                  background: color.canvas, color: color.link, fontSize: 12.5, cursor: 'pointer', textAlign: 'center',
                }}
              >
                ＋ 添加事件（起始 月/日 + 时长 + 幅度；名称选填）
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
