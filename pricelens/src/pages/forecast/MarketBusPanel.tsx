// ============================================================
// 推演工作台 v2 · 层②大盘修正（2026-11-05 Eason 看图反馈 #5-#7 + 全局
// #1/#2/#8 整改）：
// 布局（#5+#6）：情报改右侧 1/3 完全常驻（340px 列，窄屏 ≤760px 经
// index.css [data-lpl-forecast-grid] 断点退化为上下堆叠）——滑出抽屉机制
// （drawerOpen / translateX 过渡 / 遮罩 /「事件与情报」按钮）整体删除。
// 卡体两栏 = 左图表区 + 右情报常驻列：IntelligenceReviewPanel 以
// availability="ready" 注入 simulatedIntelligenceCandidates（模拟候选 5 条，
// 字段对齐 B.4.3，dataStatus 显式 'simulated'），先列后删 / 逐条审核 / 批量
// 规则交互照旧（真实候选接入与页面级 apply 回调仍归页级任务 10）；人工事件
// 名录 = CollapsibleSection 收起头 + 11px 列表行（与量价参考名录同语言）。
// 图表区（#2/#7/#8）：viewBox 宽 = ResizeObserver 实测渲染宽（视觉一致性：
// viewBox 宽 = 真实渲染宽，文字回归真实 px；jsdom / 无 RO 环境回退
// CHART_W 估值），CHART_H 恒 252；y 轴横向 gridline 全删只留刻度文字；
// SVG text 全部 fontFamily + 字号 10 + fill=mute + tabular-nums，主线宽 2px
// （与 pages/volume 图表同口径）。历史/预测分界虚线保留（定位参考）。
// 事件形态（全局 #2 语言统一）：图上小标从箭头-线改为小方块点（8px 事件色，
// rx 2，对齐事件起始位置）；hover 方块点 → 该事件受影响区间底衬 + 既有
// 精简 tooltip；「事件」图例项控制整层（含方块点轨 + 底衬）。图内高亮开关
// （#6 后半）从卡头挪到图例行「事件」项旁（与量价参考卡同处理，默认关，
// 开 = 所有事件区间常驻底衬）；「＋事件」按钮提升到卡头右侧控件簇（形态
// 对齐 ReferencePanel 卡头 headButtonStyle）。
// 卡头（#7）：「模拟」chip 与「AI 推测 · 可改」徽章退役，合并为单个
// HintInfo（title = 模拟语境 + 「AI 基线 · 可直接修改，改动即人工确认」）；
// 三步链浮层随徽章入口一并退役。
// 添加事件浮窗（不变，改挂在图表区内）：名称选填、起止周 = 双月周历选择器
// （两月并排、行 = 整周[周一起]、行首 ISO 周号、选中实蓝白字、区间内浅蓝、
// 跨月连续、‹ › 月导航；起点行→终点行选择，自动收起回填）、幅度 %、衰减
// chips（递减/恒定）、说明必填（Batch 2 起）；保存经 workbenchModel.monthSeedOfWeekRange
// 映射进既有 MarketMonthEventSeed（模型契约不变，可选 decay 形状）。
// 衰减形状：MarketMonthEventSeed 可选 decay（缺省递减）；flat = 事件覆盖的
// 完整月恒定乘子（首月仍按日均摊占比），公式见 marketMonthEventFactor。
// 按月调整沿用会话草稿机制（onMonthOverride(key, null) 还原）；月度证据
// 浮框（v2-1）、图上双锚点（v2-2）、月调整反馈行（B.5.6 role=status）不动。
// 卡体延续定高策略（MARKET_BODY_HEIGHT=330）+ 卡内纵向滚动；图例四项
// （实际 / 预测 / AI 基线 / 事件）全部可点显隐（WorkbenchLegend 规格）。
// 全部视觉取 theme/tokens 既有 token 与 WorkbenchBits 既有控件语言，无新视觉。
// 2026-11-07 Batch 2（batch2-iterate-forecast）：按月调整原因改必填（保存才
// 回写，取消不写入）；月度事件「事件说明」改必填（说明 = 内联原因，随事件
// label 进审计轨迹）；月度证据浮框新增数据状态行（模拟 · 数据版本 · 采集时间
// 待确认 · 缺失字段），情报候选注入为空的待接入空态语义不变（模拟候选显式
// 「模拟」，更新能力 title 仍「候选生成能力待接入」）。
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, InputNumber } from 'antd';
import { color, font, motion, radius, selectSoft, selectSoftInk, shadow, space, trackColors } from '../../theme/tokens';
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
import IntelligenceReviewPanel from './IntelligenceReviewPanel';
import { simulatedIntelligenceCandidates } from './intelligenceModel';
import { CollapsibleSection, HintInfo, SectionHead, WorkbenchLegend, fmtSignedPct, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

// 视觉一致性（2026-11-05 整改 #1）：viewBox 宽 = ResizeObserver 实测渲染宽
// （缩放比 1，文字回归真实 px）。CHART_W 仅作 jsdom / 无 RO 环境的回退估值
// （1440 最小工作宽下左栏 ≈1fr 列的量级）；CHART_H 保持全站 252 标准。
const CHART_W = 908;
const CHART_H = 252;

/**
 * 卡体定高策略（2026-11-05 整改：卡体两栏 = 左图表区 + 右情报常驻列）：
 * 内容区固定 330px；右列超高出列内纵向滚动兜底，图表行不被推走
 * （lpl-card-scroll 细滚动条）。
 */
const MARKET_BODY_HEIGHT = 330;

/** 右侧情报常驻列宽度（复用既有 340px 常量；窄屏 ≤760px 由
 *  index.css [data-lpl-forecast-grid] 断点退化为单列堆叠）。 */
const INTEL_COL_W = 340;
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
  pinned,
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
  /** R2 M6：click/Enter/Space 钉住态（role=dialog 固定，pointerleave 不收起）。 */
  pinned?: boolean;
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
  const layerLabelStyle: React.CSSProperties = { fontSize: 12, color: color.mute, letterSpacing: '0.05em' };
  return (
    <div
      data-lpl-month-popover
      data-popover-mode="evidence"
      data-evidence-pinned={pinned || undefined}
      role="dialog"
      aria-label={`${point.key} 预测月证据`}
      onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
      style={{ ...popoverShellStyle, width: EVIDENCE_W, transform: flip ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)' }}
    >
      {/* 层① 头部：月名 + AI 基线/生效 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, paddingRight: 16 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: color.ink }}>{`${fmtMonthCalendar(point.key)} · 预测月`}</span>
        <span className="tnum" style={{ fontSize: 12, color: color.mute }}>{`AI 基线 ${fmtIndex(point.baseline)} · 生效 ${fmtIndex(point.value)}`}</span>
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
        <div data-lpl-evidence-recalc className="tnum" style={{ marginTop: 3, fontSize: 12, color: color.warningInk }}>
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
            <text x={4} y={44} fontSize={12} fill={color.mute}>{fmtMonthCalendar(trendWindow.months[0].key)}</text>
            <text x={sparkX(trendWindow.months.length - 1)} y={44} fontSize={12} fill={color.mute} textAnchor="middle">{fmtMonthCalendar(trendWindow.months[trendWindow.months.length - 1].key)}</text>
            <text x={256} y={44} fontSize={12} fill={color.link} textAnchor="end">{fmtMonthCalendar(point.key)}</text>
          </svg>
        ) : (
          <div style={{ fontSize: 12, color: color.mute, marginTop: 4 }}>实际样本不足，无法绘制趋势段</div>
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
                    fontSize: 12, marginTop: 3, whiteSpace: 'nowrap',
                    color: highlighted ? color.link : color.mute, fontWeight: highlighted ? 700 : 400,
                  }}
                >
                  {`${monthNum} 月 ${month.value != null ? `${(month.weight * 100).toFixed(2)}%` : '—'}`}
                </div>
              </div>
            );
          })}
          <span className="tnum" style={{ flex: 1, fontSize: 12, padding: '4px 8px', borderRadius: radius.control, background: color.canvasSoft2, color: color.ink }}>
            {calcText}
          </span>
        </div>
      </div>
      {/* 数据状态行（Batch 2 统一取证）：状态 + 数据版本 + 采集时间（缺失写待确认）+ 缺失字段 */}
      <div
        data-lpl-evidence-status
        className="tnum"
        style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 8, paddingTop: 8, fontSize: 12, color: color.mute }}
      >
        {`数据状态：模拟（演示样本，非实时）· 数据版本 ${fixture.meta.modelVersion} · 采集时间：待确认 · 缺失：真实大盘来源 URL / 采集时间（待接入）`}
      </div>
      {/* 层④ 底部：就地调整入口（点击切换为调整表单，同一浮层两态） */}
      <div style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
        <span style={{ fontSize: 12, color: color.mute }}>调整后直接修正该月对应预测周</span>
        <button
          type="button"
          data-lpl-evidence-adjust
          onClick={onAdjust}
          title="就地调整该月生效值（原因必填，保存才回写；还原基线随时可退）"
          style={{
            // P0-2（2026-11-06）：浮框动作退出墨色实心主按钮（墨色只留给唯一主按钮），
            // 改 hairlineStrong 描边静默样式（与主图证据浮框「微调本周」同语言）。
            border: `1px solid ${color.hairlineStrong}`, padding: '3px 12px', borderRadius: radius.control, background: color.canvas,
            color: color.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
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
 * 调整后指数 / 增减幅%；调整原因必填（Batch 2 · 2026-11-07 起 brief §3.2：
 * 保存才回写主图与审计轨迹，取消不写入）。取消 = 回到证据态（同一浮层两态）。
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
  const reasonOk = reason.trim() !== '';
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
        border: 'none', padding: '3px 8px', fontSize: 12, cursor: 'pointer',
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
      <div style={{ fontSize: 12, fontWeight: 600, color: color.mute, marginBottom: 4 }}>
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
        {`调整原因（必填）`}
        <Input
          aria-label="调整原因（必填）"
          placeholder="必填：如大促流量前置，帮助追溯并写入审计轨迹"
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
            disabled={applyValue == null || !reasonOk}
            onClick={() => { if (applyValue != null && reasonOk) onApply(applyValue, reason.trim()); }}
          >
            应用
          </Button>
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: reasonOk ? color.mute : color.warningInk }}>
        {reasonOk
          ? '只调整该月；应用后预测线即时重算并写入审计轨迹，本会话内可还原（还原该月即回 AI 基线口径）。'
          : '请填写调整原因后应用（不填不可应用；取消不写入任何参数）。'}
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
            <span className="tnum" style={{ fontSize: 12, textAlign: 'center', color: selected ? color.onPrimary : color.mute }}>{week.weekNumber}</span>
            {cells.map((cell, index) => (
              <span
                key={index}
                className="tnum"
                style={{
                  fontSize: 12, textAlign: 'center',
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

// 情报列（2026-11-05 整改）：IntelligenceReviewPanel 常驻右 1/3，以
// availability="ready" 注入 simulatedIntelligenceCandidates（模拟候选 5 条，
// 先列后删 / 逐条审核 / 批量规则照旧）；真实候选接入层与页面级 apply /
// reviewState 持久化回调仍归页级任务（届时经 props 传入并接线）。
/** 卡头「＋事件」按钮（形态对齐量价参考卡卡头 headButtonStyle）。 */
const headAddButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 3, height: 24, padding: '0 8px',
  borderRadius: radius.control, border: `1px solid ${color.hairline}`, background: color.canvas,
  color: color.body, font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

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
  /** 按月调整（点击预测月浮层应用）：value = null 还原该月；reason 必填（Batch 2 起，不填不可应用）。 */
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
  /** R2（本轮返修 M6）：月证据固定态——hover 只预览，click / Enter / Space 固定为
   *  role=dialog 的钉住浮层；pointerleave 不收起，再次点同月 / 关闭钮 / 外部点击 /
   *  Escape 解除并安全归还焦点到该月命中区。 */
  const [pinnedMonth, setPinnedMonth] = useState<string | null>(null);
  /** 图内高亮开关（默认关；开 = 所有事件区间常驻底衬）。 */
  const [highlightAll, setHighlightAll] = useState(false);
  /** hover 事件方块点 → 对应周区间临时高亮（移开即恢复）。 */
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
  /** 图表区实测渲染宽（视觉一致性：viewBox 宽 = 真实渲染宽；无 RO 环境回退 CHART_W）。 */
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const [chartW, setChartW] = useState(CHART_W);
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.round(entry.contentRect.width);
        // 函数式更新：避免闭包旧值吞掉「resize 回回退估值宽度」的合法更新
        setChartW((prev) => (width >= 320 && width !== prev ? width : prev));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** 关闭钉住的月证据浮层，并把焦点安全归还该月 SVG 命中区（键盘用户不丢焦点）。 */
  const closePinnedMonth = useCallback((monthKey: string | null) => {
    if (monthKey != null) {
      const hit = chartWrapRef.current?.querySelector<SVGRectElement>(`[data-month="${monthKey}"]`);
      hit?.focus?.();
    }
    setPopover(null);
    setPinnedMonth(null);
  }, []);

  // R2 M6 键盘关闭：焦点无论还在月命中区（点击后焦点不离开 SVG）还是已进入浮层
  // dialog，Escape 都能解除钉住并归还焦点（浮层内自身的 onKeyDown 关闭不含
  // 焦点归还，这里统一兜底）。
  useEffect(() => {
    if (popover?.mode !== 'evidence' || pinnedMonth == null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closePinnedMonth(pinnedMonth);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closePinnedMonth, pinnedMonth, popover?.mode]);

  // R2 M6 外部点击关闭：钉住态下点到图区（含浮层与月命中区）以外 = 解除钉住。
  useEffect(() => {
    if (popover == null || pinnedMonth == null) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const wrap = chartWrapRef.current;
      if (wrap?.contains(event.target as Node)) return;
      setPopover(null);
      setPinnedMonth(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pinnedMonth, popover]);

  // 统一日历（周历选择器 / 事件小标区间反推的唯一时间来源）。
  const calendar = buildForecastCalendar(fixture.calendar);
  /** 周历选择器月页：统一日历预测月（每月 = 其内整周行，按周一归属月）。 */
  const pickerMonths = calendar.forecastMonths.map((month) => ({
    key: month.key,
    label: `${month.key.slice(0, 4)}年 ${Number(month.key.slice(5))}月`,
    weeks: calendar.weeks.filter((week) => week.monthKey === month.key),
  }));
  const firstPickerWeekId = pickerMonths[0]?.weeks[0]?.id ?? null;

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
  // Batch 2：事件说明必填（月度事件 = 人工修正，须内联原因并进审计轨迹）。
  const formNoteOk = formNote.trim() !== '';
  const eventFormValid = formMapped != null && formWeeks?.start != null && formWeeks?.end != null && formWeekCount != null && formMagnitudeOk && formNoteOk;

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

  // v2 口径（模型侧唯一来源）：近 6 个月趋势窗口（证据浮框趋势行 / 双锚点共用）。
  const trendWindow = marketTrendWindow(fixture);

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
        {/* 「模拟」chip 与「AI 推测 · 可改」徽章退役（2026-11-05 反馈 #7）：
            合并为单个 HintInfo，title = 模拟语境 + AI 基线信任语言。 */}
        <HintInfo
          label="大盘修正卡说明"
          text="模拟数据 · 推演演示：历史月为模拟数据，预测月为模型假设（确定性外推）；AI 基线 · 可直接修改，改动即人工确认。"
        />
        {/* 「＋事件」提升到卡头控件簇（形态对齐量价参考卡卡头同名按钮） */}
        <button
          type="button"
          data-lpl-add-event-button
          aria-label="添加事件"
          onClick={() => openEventForm()}
          style={headAddButtonStyle}
        >
          ＋事件
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
  // 图顶部事件方块点轨留位；绘图宽随右栏收窄后按实测渲染宽（chartW）取值。
  const left = 40;
  const right = 14;
  const top = 32;
  const bottom = 48;
  const plotW = chartW - left - right;
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

  // 图上事件小标统一层（2026-11-05 全局 #2 语言统一）：人工月事件（琥珀，
  // 经日历反推周范围）+ 周口径行业事件（灰，自带 WeekRange）；统一小方块点
  // 形态（8px，对齐事件起始位置），hover → 区间临时高亮，「事件」图例项
  // 控制整层（方块点轨 + 底衬）。
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
  const popoverAnchorPct = popoverPoint ? (xm(months.indexOf(popoverPoint)) / chartW) * 100 : 0;
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

  /** 情报列人工事件行的「起止周段」（月事件经日历反推；窗外回退起始月-日）。 */
  const eventRangeText = (event: MarketMonthEventSeed): string => {
    const range = weekRangeOfMonthEvent(calendar, event);
    return range != null ? `${range.startWeekId}–${range.endWeekId}` : `${event.startMonth}-${fmtDay(event.startDay)} 起`;
  };

  return (
    <section style={{ ...workbenchCardStyle, position: 'relative', overflow: 'hidden' }}>
      {sectionHead}
      {/* 卡体定高（MARKET_BODY_HEIGHT）两栏（2026-11-05 整改 #5+#6）：左图表区
          + 右情报常驻列（INTEL_COL_W）；≤760px 由 index.css 既有
          [data-lpl-intelligence-grid] 断点退化为上下堆叠（其注释即
          「情报与预测页的两栏内容」，且不与 [data-lpl-forecast-grid]
          的 ④⑤ 两列网格选择器串选择）。 */}
      <div
        className="lpl-card-scroll"
        data-testid="market-body-grid"
        data-lpl-intelligence-grid
        style={{
          display: 'grid',
          gridTemplateColumns: `minmax(0, 1fr) minmax(0, ${INTEL_COL_W}px)`,
          gap: space.md,
          height: MARKET_BODY_HEIGHT,
          overflow: 'auto',
        }}
      >
        {/* 图表区（月度单线 SVG + 图例 + 图内高亮开关；无口径脚注——信息删减拍板） */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
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
                <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>
                  {`本月比值 ×${(feedback.value / feedbackPoint.baseline).toFixed(2)} · 已联动 ${linkedWeeks} 个预测周`}
                </span>
                <button
                  type="button"
                  onClick={() => onViewMainChart?.()}
                  style={{ border: 'none', background: 'transparent', color: color.link, font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  查看主图
                </button>
                <button
                  type="button"
                  onClick={() => onCheckInventory?.()}
                  style={{ border: 'none', background: 'transparent', color: color.link, font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
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
          {/* v2-2「移开即恢复」：证据态浮层随鼠标离开图区关闭（调整态粘滞，需显式取消/应用；
              R2 M6：钉住（pinned）的证据浮层同样粘滞，pointerleave 不收起）。 */}
          <div
            ref={chartWrapRef}
            style={{ position: 'relative', flex: 1, minHeight: 0 }}
            onMouseLeave={() => setPopover((prev) => (prev?.mode === 'evidence' && pinnedMonth == null ? null : prev))}
          >
            <svg
              viewBox={`0 0 ${chartW} ${CHART_H}`}
              width="100%"
              role="img"
              aria-label={`大盘月度指数：历史 ${months[0]?.key ?? ''}–${months[actualCount - 1]?.key ?? ''}（模拟实际）；预测 ${forecastMonthKeys[0] ?? ''}–${forecastMonthKeys[forecastMonthKeys.length - 1] ?? ''}（未来 4 季逐月，AI 基线）；顶部事件方块点 hover 高亮区间；hover 或 Enter 预测月查看证据浮框并可调整。`}
              style={{ display: 'block' }}
            >
              {/* y 轴横向 gridline 已删（2026-11-05 反馈 #5：与价格走势页一致的无网格净图），只留刻度文字 */}
              <g fontSize={12} fill={color.mute} textAnchor="end" fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {yTicks.map((tick) => (
                  <text key={tick} x={left - 6} y={ym(tick) + 3}>{tick}</text>
                ))}
              </g>
              <text x={left - 6} y={top - 6} fontSize={12} fill={color.mute} textAnchor="end" fontFamily={font.family}>指数</text>
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
                    fontSize={12}
                    fill={color.mute}
                    textAnchor="middle"
                    fontFamily={font.family}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
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
                          fontSize={12}
                          fill={color.link}
                          textAnchor="middle"
                          fontFamily={font.family}
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
                    <text data-anchor="hover-label" x={hoverX} y={hoverY + 16} fontSize={12} fill={color.link} fontWeight={600} textAnchor="middle" fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtMonthCalendar(popoverPoint.key)}
                    </text>
                  </g>
                );
              })()}
              {/* X 轴月份刻度（季度首月出标签；全站月视图日历格式 YYYY-MM） */}
              <g fontSize={12} fill={color.mute} textAnchor="middle" fontFamily={font.family} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {months.map((point, index) => (
                  isQuarterStartMonth(point.key)
                    ? <text key={point.key} x={xm(index)} y={CHART_H - 30}>{fmtMonthCalendar(point.key)}</text>
                    : null
                ))}
              </g>
              {/* 图上事件小标统一层（2026-11-05 全局 #2：小方块点 8px，对齐事件起始
                  位置；人工月事件 = 琥珀；周口径行业事件 = 灰；箭头-线呈现已删）。
                  hover 方块点 → 对应周区间临时高亮 + 既有精简 tooltip（<title>）。 */}
              {eventsVisible && (
                <g data-lpl-event-track>
                  {eventMarks.map((mark) => {
                    const x1 = mark.x1;
                    const x2 = mark.x2;
                    return (
                      <g
                        key={`dot-${mark.id}`}
                        data-lpl-event-tick={mark.id}
                        data-month-event-id={mark.kind === 'month' ? mark.id : undefined}
                        data-week-event-id={mark.kind === 'week' ? mark.id : undefined}
                        style={{ cursor: 'default' }}
                        onMouseEnter={() => setHoverEventId(mark.id)}
                        onMouseLeave={() => setHoverEventId((prev) => (prev === mark.id ? null : prev))}
                      >
                        {/* hover 命中区（区间整段；方块点只对齐起始位置） */}
                        <rect x={x1} y={4} width={Math.max(8, x2 - x1)} height={20} fill="rgba(0,0,0,0)" pointerEvents="all" />
                        <rect
                          data-lpl-event-dot
                          x={Math.max(0, x1 - 4)}
                          y={10}
                          width={8}
                          height={8}
                          rx={2}
                          fill={mark.color}
                        />
                        <title>{mark.detail}</title>
                      </g>
                    );
                  })}
                </g>
              )}
              {/* 预测月交互列（v2-1 证据浮框入口）：键盘可达（Tab + Enter 触发证据浮框），
                  hover 同效；浮框内「调整此月」就地切换调整表单。
                  R2 M6：hover/focus 只预览；click / Enter / Space 钉住（role=dialog 浮层
                  固定、pointerleave 不收起）；再次点同月解除。 */}
              {months.slice(actualCount).map((point, offset) => {
                const index = actualCount + offset;
                const x = left + index * colW;
                const isPinned = pinnedMonth === point.key;
                const pinMonth = () => {
                  if (isPinned) {
                    closePinnedMonth(point.key);
                    return;
                  }
                  setPopover({ key: point.key, mode: 'evidence' });
                  setPinnedMonth(point.key);
                };
                return (
                  <rect
                    key={`hit-${point.key}`}
                    data-month={point.key}
                    data-month-pinned={isPinned || undefined}
                    x={x}
                    y={top}
                    width={colW}
                    height={plotH}
                    fill="transparent"
                    role="button"
                    tabIndex={0}
                    aria-label={`查看 ${point.key} 预测证据（当前 ${fmtIndex(point.value)}，AI 基线 ${fmtIndex(point.baseline)}），浮框内可调整`}
                    aria-pressed={isPinned}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setPopover((prev) => (pinnedMonth != null || prev?.mode === 'adjust' ? prev : { key: point.key, mode: 'evidence' }))}
                    onFocus={() => setPopover((prev) => (pinnedMonth != null || prev?.mode === 'adjust' ? prev : { key: point.key, mode: 'evidence' }))}
                    onClick={pinMonth}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        pinMonth();
                      }
                    }}
                  />
                );
              })}
            </svg>
            {/* 就地浮层（HTML 覆盖层，与主图悬停浮窗同视觉语言；两态 = 证据 / 调整表单；
                跟随月份列定位，右半区左翻） */}
            {popoverPoint && popover && (
              <div style={{ position: 'absolute', left: `${popoverAnchorPct}%`, top: 0, width: 0, height: 0 }} data-lpl-popover-pinned={popover.mode === 'evidence' && pinnedMonth === popover.key ? 'true' : undefined}>
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
                      setPinnedMonth(null);
                    }}
                    onRestore={() => {
                      onMonthOverride(popoverPoint.key, null, '');
                      setFeedback((prev) => (prev?.monthKey === popoverPoint.key ? null : prev));
                      setPopover(null);
                      setPinnedMonth(null);
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
                    pinned={pinnedMonth === popoverPoint.key}
                    onAdjust={() => setPopover({ key: popoverPoint.key, mode: 'adjust' })}
                    onClose={() => closePinnedMonth(pinnedMonth === popoverPoint.key ? popoverPoint.key : null)}
                  />
                )}
              </div>
            )}
            {/* 添加/编辑事件浮窗（绝对定位悬浮在图上，不改变图表区高度；
                字段风格与量价参考编辑器同款：label 上标 + 小输入 + chips 行） */}
            {eventFormOpen && (
              <div
                data-lpl-event-popover
                data-lpl-event-popover-mode={editingEventId != null ? 'edit' : 'add'}
                role="dialog"
                aria-label={editingEventId != null ? '编辑事件' : '添加事件'}
                onKeyDown={(event) => { if (event.key === 'Escape') { setEventFormOpen(false); setWeekPickerOpen(false); } }}
                style={{
                  position: 'absolute', top: 6, right: 12, width: EVENT_FORM_W, zIndex: 10,
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
                    <span style={{ fontSize: 12, color: color.mute }}>事件名称（选填）</span>
                    <Input
                      aria-label="事件名称（选填）"
                      placeholder="如：苹果折叠屏上线"
                      value={formLabel}
                      onChange={(input) => setFormLabel(input.target.value)}
                      size="small"
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 3 }}>
                    <span style={{ fontSize: 12, color: color.mute }}>事件说明（必填 · 写入审计轨迹的原因）</span>
                    <Input
                      aria-label="事件说明（必填）"
                      placeholder="必填：发生了什么（如竞品新品首销，作为修正原因随事件记录）"
                      value={formNote}
                      onChange={(input) => setFormNote(input.target.value)}
                      size="small"
                    />
                  </label>
                  <div style={{ display: 'grid', gap: 3, position: 'relative' }}>
                    <span style={{ fontSize: 12, color: color.mute }}>起止周（整周 · 含年月）</span>
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
                    <span style={{ fontSize: 12, color: color.mute }}>幅度</span>
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
                    <span style={{ fontSize: 12, color: color.mute }}>衰减</span>
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
                            borderRadius: radius.pill, cursor: 'pointer', fontSize: 12,
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
          {/* 图例行（与量价参考卡同处理）：实际 / 预测 / AI 基线 / 事件全部可点
              显隐（aria-pressed + 隐藏态 opacity .45）+ 图内高亮开关（默认关，
              开 = 所有事件区间常驻底衬；hover 方块点临时高亮不受开关影响）。 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
            <WorkbenchLegend items={legendItems} hidden={hiddenSeries} onToggle={toggleSeries} style={{ marginTop: 4, flex: '1 1 auto' }} />
            <button
              type="button"
              role="switch"
              data-lpl-highlight-switch
              aria-checked={highlightAll}
              title={highlightAll
                ? '图内高亮已开：所有事件区间渲染各自颜色的 0.10 透明度底色；悬停方块点仍临时加深'
                : '图内高亮已关：图内只保留事件方块点；悬停方块点仍临时高亮对应区间'}
              onClick={() => setHighlightAll((prev) => !prev)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none', padding: '2px 4px',
                border: 'none', background: 'transparent', font: 'inherit', fontSize: 12,
                color: color.body, cursor: 'pointer', borderRadius: radius.control, whiteSpace: 'nowrap',
              }}
            >
              <span
                aria-hidden
                style={{
                  position: 'relative', display: 'inline-block', width: 26, height: 15,
                  borderRadius: radius.pill, flex: 'none',
                  background: highlightAll ? color.link : color.hairlineStrong, transition: `background ${motion.fast}ms`,
                }}
              >
                <span
                  style={{
                    position: 'absolute', top: 2, left: highlightAll ? 13 : 2, width: 11, height: 11,
                    borderRadius: radius.pill, background: color.canvas, transition: `left ${motion.fast}ms`,
                  }}
                />
              </span>
              {`图内高亮${highlightAll ? '：开' : '：关'}`}
            </button>
          </div>
        </div>

        {/* 右 1/3 情报常驻列（2026-11-05 整改 #5+#6）：模拟候选 5 条常驻展示
            （availability="ready"，先列后删 / 逐条审核 / 批量规则照旧；真实候选
            接入层与页面级 apply / reviewState 持久化回调归页级任务）+ 人工事件
            名录（CollapsibleSection 收起头 + 11px 列表行，量价参考名录语言；
            「＋事件」入口在卡头控件簇）。列内超高 = 列内纵向滚动兜底。 */}
        <aside
          data-lpl-market-intel
          aria-label="事件与情报"
          className="lpl-card-scroll"
          style={{
            minWidth: 0, minHeight: 0, overflowY: 'auto',
            display: 'grid', gap: space.md, alignContent: 'start',
            borderLeft: `1px solid ${color.hairline}`, paddingLeft: space.md, paddingRight: 2,
          }}
        >
          <IntelligenceReviewPanel
            availability="ready"
            items={simulatedIntelligenceCandidates.items}
            recommendations={simulatedIntelligenceCandidates.recommendations}
            calendar={calendar}
            params={params}
            result={result}
            fixture={fixture}
          />
          <CollapsibleSection label={`人工事件 · ${params.marketMonthEvents.length}`}>
            {params.marketMonthEvents.length === 0 ? (
              <div style={{ border: `1px dashed ${color.hairlineStrong}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px`, fontSize: 12, color: color.mute }}>
                暂无人工事件；卡头「＋事件」新增。
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 4 }}>
                {params.marketMonthEvents.map((event) => {
                  const rowLabel = event.label || '未命名事件';
                  return (
                    <div
                      key={event.id}
                      data-lpl-month-event-row={event.id}
                      style={{
                        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px 8px',
                        padding: '3px 6px', borderRadius: radius.control, background: color.canvasSoft2, minWidth: 0,
                      }}
                    >
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: color.warning, flex: 'none' }} />
                      <span className="tnum" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
                        {eventRangeText(event)}
                      </span>
                      <span style={{ fontSize: 12, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={rowLabel}>
                        {rowLabel}
                      </span>
                      <span className="tnum" style={{ fontSize: 12, color: color.mute, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {`${fmtSignedPct(event.magnitudePct)} · ${decayLabelOf(event)}`}
                      </span>
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none' }}>
                        <button
                          type="button"
                          aria-label={`编辑事件 ${rowLabel}`}
                          onClick={() => openEventForm(event)}
                          style={{ border: 'none', background: 'transparent', color: color.mute, fontSize: 12, cursor: 'pointer', padding: 0 }}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          aria-label={`删除事件 ${rowLabel}`}
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
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleSection>
        </aside>
      </div>
    </section>
  );
}
