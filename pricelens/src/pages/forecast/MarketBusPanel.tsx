// ============================================================
// 推演工作台 v2 · 层②大盘 · 总量总线（2026-11-04 月粒度重构版）：
// 主序列 = 月粒度（大盘数据粒度 = 月，调整颗粒度 = 月）：历史月度实线
// （2025-01–2026-09 模拟样本）+ 未来 4 个季度逐月预测虚线（2026-10–2027-09，
// AI 季节 × 趋势季度基线的月形分布，确定性外推禁随机，口径见
// fixture.market.monthlyNote）；卡内布局 = 图表区左 2/3 主视觉 + 事件区右 1/3。
// 按月调整 = 点击预测月就地浮层（调整后指数 / 增减幅两式，原因选填不拦截），
// 应用后预测线即时重算；已调整月 = 生效点实心蓝点标记；还原复用页面既有
// 会话草稿机制（onMonthOverride(key, null)），有人工调整的季度经季内三月
// 均值同步 q4/q1Override 进主链（workbenchModel.withMarketMonthOverride）。
// 事件区（右 1/3）两块：上块 = AI 候选事件 Top5 占位（空态注明「候选生成
// 能力待接入，抓取逻辑另议」，先列后删交互骨架为禁用态静态示意，不接数据）；
// 下块 = 人工月度事件列表 + 极简三字段录入（起始月/日 + 时长（月）+ 幅度%，
// 名称选填）。事件在图上的呈现 = 次要标记（轴下小标记 + hover 详情，
// 不占主视觉）：月中起始按日均摊（首月影响 × 覆盖天数 ÷ 当月天数，显式口径）。
// 卡体延续 A2 定高策略（MARKET_BODY_HEIGHT）+ 右栏卡内纵向滚动。
// 全部视觉取 theme/tokens 既有 token 与 WorkbenchBits 既有控件语言，无新视觉。
// ============================================================
import { useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Select } from 'antd';
import { color, radius, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import type { MarketMonthEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { MarketMonthPoint, WorkbenchParams, WorkbenchResult } from './workbenchModel';
import {
  daysInMonthOf,
  marketQuarterForecast,
  monthCoverageRatio,
  monthKeyOfDate,
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

const POPOVER_W = 248;

/** 指数文案（1 位小数，与模型 round1 口径一致）。 */
const fmtIndex = (value: number): string => value.toFixed(1);

/** 事件起始日展示（MM-DD）。 */
const fmtDay = (day: number): string => String(day).padStart(2, '0');

/** 月键 → 轴标签（季度首月 'YYYY-MM' → 'YY-MM'；其余月不刻标签）。 */
const isQuarterStartMonth = (key: string): boolean => /-(01|04|07|10)$/.test(key);

/** 月度事件首月覆盖读数（covered/days；口径见 workbenchModel.monthCoverageRatio）。 */
function monthCoverageText(event: MarketMonthEventSeed): string {
  const dim = daysInMonthOf(event.startMonth);
  if (dim == null) return '';
  const covered = Math.round(monthCoverageRatio(dim, event.startDay) * dim);
  return `首月覆盖 ${covered}/${dim} 天`;
}

/**
 * 按月调整就地浮层（点击预测月弹出；与主图悬停浮窗同一浮层视觉语言：
 * 白底 + hairline + 卡片圆角 + L5 阴影）。两式输入 = 调整后指数 / 增减幅%；
 * 调整原因选填（评审拍板：不得以「不填无法应用」强迫，空值照常应用）。
 */
function MonthAdjustPopover({ point, flip, onApply, onRestore, onClose }: {
  point: MarketMonthPoint;
  /** 锚点位于图右半区时左翻（与主图悬停浮窗同款翻转语言），避免被图区右缘裁切。 */
  flip: boolean;
  onApply: (value: number, reason: string) => void;
  onRestore: () => void;
  onClose: () => void;
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
      role="dialog"
      aria-label={`调整 ${point.key}`}
      style={{
        position: 'absolute', top: 6, width: POPOVER_W, zIndex: 6,
        transform: flip ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
        background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card,
        boxShadow: shadow.l5, padding: `${space.md - 2}px ${space.md}px`, fontSize: 12, lineHeight: 1.6, color: color.body,
      }}
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
          <Button size="small" onClick={onClose}>取消</Button>
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
  const [popoverMonth, setPopoverMonth] = useState<string | null>(null);
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

  const legendItems: LegendItem[] = [
    { key: SERIES_ACTUAL, label: '实际（月度）', shape: 'line', color: color.ink },
    { key: SERIES_FORECAST, label: '预测 · 未来 4 季逐月', shape: 'dash', color: color.link },
    { key: SERIES_AI_BASELINE, label: 'AI 基线', shape: 'dash', color: color.hairlineStrong },
  ];

  const ioBar = <IoBar input="月度指数 · 行业事件（月中按日均摊）" output="主图周销基准" />;
  const sectionHead = (
    <SectionHead
      title="大盘 · 总量总线"
      hint={`历史月度线 2025-01 连贯至当前实际；向后按月预测未来 4 个季度（${forecastMonthKeys[0] ?? ''} … ${forecastMonthKeys[forecastMonthKeys.length - 1] ?? ''}，AI 基线逐月分布）。点击预测月就地调整；调整只落当月，可撤销。`}
      extra={<>
        <SimChip title="月度序列为演示样本：历史月为模拟数据，预测月为模型假设（确定性外推）" />
        <AiJudgeBadge source={params.overrideSource} />
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
  const popoverPoint = popoverMonth != null ? months.find((point) => point.key === popoverMonth) ?? null : null;
  const popoverAnchorPct = popoverPoint ? (xm(months.indexOf(popoverPoint)) / CHART_W) * 100 : 0;
  const popoverFlip = popoverAnchorPct > 55;

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
          极窄视口由卡内滚动兜底（lpl-card-scroll 细滚动条）。 */}
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
          <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`大盘月度指数：历史 ${months[0]?.key ?? ''}–${months[actualCount - 1]?.key ?? ''}（模拟实际）；预测 ${forecastMonthKeys[0] ?? ''}–${forecastMonthKeys[forecastMonthKeys.length - 1] ?? ''}（未来 4 季度逐月，AI 基线）；点击预测月可调整。`}
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
              {/* 今天分界（历史段 | 预测段） */}
              <line x1={todayX} y1={top - 4} x2={todayX} y2={top + plotH} stroke={color.hairlineStrong} strokeDasharray="4 4" />
              <text x={todayX + 4} y={top + 6} fontSize={9.5} fill={color.body}>{`今天 ${fixture.context.todayLabel}`}</text>
              {/* 历史月实线（墨）→ 预测月虚线（蓝，随事件与按月调整即时重算）+ AI 基线对照灰虚线 */}
              {seriesOn(SERIES_ACTUAL) && <path data-series="actual" d={actualPath} fill="none" stroke={color.ink} strokeWidth={2.2} />}
              {seriesOn(SERIES_FORECAST) && <path data-series="forecast" d={forecastPath} fill="none" stroke={color.link} strokeWidth={2.2} strokeDasharray="6 5" />}
              {showAiGhost && (
                <g data-series="ai-ghost">
                  <path d={ghostPath} fill="none" stroke={color.hairlineStrong} strokeWidth={1.4} strokeDasharray="2 4" opacity={0.85} />
                </g>
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
              {/* X 轴月份刻度（季度首月出标签，保持可扫描密度） */}
              <g fontSize={9.5} fill={color.mute} textAnchor="middle">
                {months.map((point, index) => (
                  isQuarterStartMonth(point.key)
                    ? <text key={point.key} x={xm(index)} y={CHART_H - 30}>{point.key.slice(2)}</text>
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
              {/* 预测月点击列（就地浮层入口）：键盘可达（Tab + Enter），hover 出月度详情 */}
              {months.slice(actualCount).map((point, offset) => {
                const index = actualCount + offset;
                const x = left + index * colW;
                return (
                  <g key={`hit-${point.key}`}>
                    <rect
                      data-month={point.key}
                      x={x}
                      y={top}
                      width={colW}
                      height={plotH}
                      fill="transparent"
                      role="button"
                      tabIndex={0}
                      aria-label={`调整 ${point.key} 预测（当前 ${fmtIndex(point.value)}，AI 基线 ${fmtIndex(point.baseline)}）`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setPopoverMonth(point.key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setPopoverMonth(point.key);
                        }
                      }}
                    >
                      <title>{`${point.key} · 预测 ${fmtIndex(point.value)}（AI 基线 ${fmtIndex(point.baseline)}${point.eventFactor != null ? ` · 含事件 ×${point.eventFactor.toFixed(3)}` : ''}${point.override != null ? ' · 已调整' : ''}）`}</title>
                    </rect>
                  </g>
                );
              })}
            </svg>
            {/* 就地浮层（HTML 覆盖层，与主图悬停浮窗同视觉语言；跟随被点击月份列定位，右半区左翻） */}
            {popoverPoint && (
              <div style={{ position: 'absolute', left: `${popoverAnchorPct}%`, top: 0, width: 0, height: 0 }}>
                <MonthAdjustPopover
                  key={popoverPoint.key}
                  point={popoverPoint}
                  flip={popoverFlip}
                  onApply={(value, reason) => {
                    onMonthOverride(popoverPoint.key, value, reason);
                    setPopoverMonth(null);
                  }}
                  onRestore={() => {
                    onMonthOverride(popoverPoint.key, null, '');
                    setPopoverMonth(null);
                  }}
                  onClose={() => setPopoverMonth(null)}
                />
              </div>
            )}
          </div>
          <WorkbenchLegend items={legendItems} hidden={hiddenSeries} onToggle={toggleSeries} style={{ marginTop: 0 }} />
          <div style={{ marginTop: space.xs, fontSize: 11, lineHeight: 1.6, color: color.mute }}>
            大盘只看总量，不下钻品牌 / 品；预测覆盖未来 4 个季度（月粒度）。调整原因选填；月中事件按日均摊口径见事件区说明。
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
