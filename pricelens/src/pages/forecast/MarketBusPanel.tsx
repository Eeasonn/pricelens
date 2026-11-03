// ============================================================
// 推演工作台 v2 · 层②大盘 · 总量总线（2026-11-03 生产化版）：
// 左图 = 单条季度线 2025Q1 连贯到当前（2026Q3 实际），向后只预测下一季
// （2026Q4 当前季估读 → 2027Q1 预测）；AI 基线 = 本地确定性规则（季节 × 趋势），
// 人工改格后图中保留 AI 基线灰色对照点，当前生效值用实心点；
// 右栏 = AI 基线读数（挂 AI 标）+ 下一季度预测格直接编辑（人工修改路径之一，
// 还原后自动回 AI 标）+ 行业级事件录入（起周[可落历史段作解释] + 时长 +
// 峰值幅度 + 衰减方式[默认递减]，人工录入，AI 不猜）+ 理由栏。
// 竞品常规迭代不在此配置。事件锚点季度用 quarterKeyOfWeek 从周完整日期推导，
// 生效状态用 marketEventDisposition 三态（历史解释 / 本季生效 / 不在预测窗口）。
// ============================================================
import { useState } from 'react';
import { Button, Input, InputNumber } from 'antd';
import { color, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import type { MarketEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { MarketQuarterPoint, WorkbenchParams, WorkbenchResult } from './workbenchModel';
import { effectiveQuarterIndexes, marketSeriesBaseline } from './workbenchModel';
import { marketEventDisposition, quarterKeyOfWeek, type MarketEventDisposition } from './workbenchTime';
import { AiJudgeBadge, IoBar, SectionHead, SimChip, WorkbenchLegend, fmtSignedPct, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

const MAGNITUDE_MIN = -30;
const MAGNITUDE_MAX = 30;
const WEEK_MIN = 38; // 事件起周可落历史段（W38 起，解释性标记）
const WEEK_MAX = 52;
const DURATION_MIN = 1;
const DURATION_MAX = 8;

const CHART_W = 520;
const CHART_H = 224;

// 图例系列 key（显隐状态按 key 记录；AI 基线只控制对照点，不影响生效值渲染）。
const SERIES_ACTUAL = 'actual';
const SERIES_FORECAST = 'forecast';
const SERIES_AI_BASELINE = 'ai-baseline';

/** 事件三态文案（WP1 marketEventDisposition 唯一来源，禁止组件内另算）。 */
const DISPOSITION_TEXT: Record<MarketEventDisposition, string> = {
  historical: '历史解释',
  active: '本季生效',
  inactive: '不在预测窗口',
};

/** 去年同季键：'2027Q1' → '2026Q1'；非季度键返回 null。 */
function priorYearKey(key: string): string | null {
  const match = /^(\d{4})Q([1-4])$/.exec(key);
  return match ? `${Number(match[1]) - 1}Q${match[2]}` : null;
}

/**
 * 季度同比（%，1 位小数）：与去年同季比较（如 2027Q1 vs 2026Q1）。
 * 卡头副标与图内同比读数共用本 helper，保证单一口径；缺去年同季或基数 ≤ 0 返回 null。
 */
function quarterYoYPct(quarters: readonly MarketQuarterPoint[], key: string): number | null {
  const point = quarters.find((candidate) => candidate.key === key);
  const baseKey = priorYearKey(key);
  const base = baseKey ? quarters.find((candidate) => candidate.key === baseKey) : undefined;
  if (!point || !base || base.value <= 0) return null;
  return Math.round((point.value / base.value - 1) * 1000) / 10;
}

/** 带符号同比文案（+12.7% / −13.3% / —），与 fmtSignedPct 同一符号约定。 */
function fmtYoY(pct: number | null): string {
  return pct == null ? '—' : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(1)}%`;
}

function Stepper({ label, value, onStep, dec, inc, decLabel, incLabel }: {
  label: string;
  value: string;
  onStep: (delta: number) => void;
  dec: boolean;
  inc: boolean;
  decLabel: string;
  incLabel: string;
}) {
  // dec / inc = 「该方向可步进」（界内 true）；到边界按钮禁用（disabled = 取反）。
  const btn = (arrow: string, delta: number, enabled: boolean, aria: string) => (
    <button
      type="button"
      disabled={!enabled}
      aria-label={aria}
      onClick={() => onStep(delta)}
      style={{
        width: 22, height: 22, borderRadius: 5, border: `1px solid ${color.hairlineStrong}`,
        background: color.canvas, color: color.body, fontSize: 13, lineHeight: 1, cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.48, padding: 0,
      }}
    >
      {arrow}
    </button>
  );
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 10, color: color.mute }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {btn('−', -1, dec, decLabel)}
        <b className="tnum" style={{ minWidth: 44, textAlign: 'center', fontSize: 13, fontWeight: 600, color: color.ink }}>{value}</b>
        {btn('＋', 1, inc, incLabel)}
      </div>
    </div>
  );
}

export default function MarketBusPanel({
  fixture,
  params,
  result,
  onOverride,
  onEventStep,
  onEventDecay,
  onEventRemove,
  onEventAdd,
  onRationaleChange,
}: {
  fixture: WorkbenchFixture;
  params: WorkbenchParams;
  result: WorkbenchResult;
  /** 人工直接改预测格（修正下一季度预测）：field = 'q4' | 'q1'；还原传 null（来源回 AI）。 */
  onOverride: (field: 'q4' | 'q1', value: number | null) => void;
  /** 事件参数步进：field = magnitudePct ±1pt / startWeek ±1 / durationWeeks ±1。 */
  onEventStep: (id: string, field: 'magnitudePct' | 'startWeek' | 'durationWeeks', delta: number) => void;
  onEventDecay: (id: string, decay: 'decreasing' | 'flat') => void;
  onEventRemove: (id: string) => void;
  onEventAdd: () => void;
  onRationaleChange: (text: string) => void;
}) {
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set());
  const toggleSeries = (key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const seriesOn = (key: string) => !hiddenSeries.has(key);

  const quarters = result.marketQuarters;
  const { aiQ4, aiQ1 } = marketSeriesBaseline(fixture);
  const { q4Index, q1Index } = effectiveQuarterIndexes(fixture, params);
  const actualCount = quarters.filter((point) => point.status === 'actual').length;
  const humanQ4 = params.q4Override != null;
  const humanQ1 = params.q1Override != null;
  // 下季 = 序列末格；同比与去年同季比较（单一口径 helper，卡头与图内共用）。
  const nextQuarterKey = quarters[quarters.length - 1]?.key ?? '';
  const nextPriorKey = priorYearKey(nextQuarterKey);
  const yoyNext = quarterYoYPct(quarters, nextQuarterKey);

  const legendItems: LegendItem[] = [
    { key: SERIES_ACTUAL, label: '实际（2025Q1 起）', shape: 'line', color: color.ink },
    { key: SERIES_FORECAST, label: '当前推演', shape: 'dash', color: color.link },
    { key: SERIES_AI_BASELINE, label: 'AI 基线', shape: 'dash', color: color.hairlineStrong },
  ];

  const ioBar = <IoBar input="季度指数 · 行业事件" output="主图周销基准" />;
  const sectionHead = (
    <SectionHead
      title="大盘 · 总量总线"
      hint={nextQuarterKey
        ? `单条季度线 2025Q1 连贯到当前实际；向后只预测下一季（${nextQuarterKey}，同比 ${nextPriorKey ?? '去年同季'} ${fmtYoY(yoyNext)}）。`
        : '单条季度线 2025Q1 连贯到当前实际；向后只预测下一季。'}
      extra={<>
        <SimChip title="季度序列为演示样本：实际段为模拟数据，推演段为模型假设" />
        <AiJudgeBadge source={params.overrideSource} />
      </>}
    />
  );

  // 空态：无季度数据不渲染 NaN / Infinity SVG。
  if (quarters.length === 0) {
    return (
      <section style={workbenchCardStyle}>
        {sectionHead}
        {ioBar}
        <div style={{ padding: `${space.lg}px 0`, fontSize: 12.5, color: color.mute }}>当前范围无大盘数据</div>
      </section>
    );
  }

  // 左图几何：单条季度线（7 实际 + 2 推演）。
  const left = 40;
  const right = 14;
  const top = 22;
  const bottom = 42;
  const plotW = CHART_W - left - right;
  const plotH = CHART_H - top - bottom;
  const values = quarters.map((point) => point.value).concat(quarters.map((point) => point.aiBaseline ?? point.value));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(2, (rawMax - rawMin) * 0.15);
  const yMin = Math.floor(rawMin - pad);
  const yMax = Math.ceil(rawMax + pad);
  const xq = (index: number): number => left + (index + 0.5) * (plotW / quarters.length);
  const yq = (value: number): number => top + plotH * (1 - (value - yMin) / (yMax - yMin));
  const yTicks = Array.from({ length: 4 }, (_, index) => Math.round(yMin + ((yMax - yMin) * index) / 3));
  const actualPath = quarters.slice(0, actualCount)
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xq(index).toFixed(1)} ${yq(point.value).toFixed(1)}`)
    .join(' ');
  const forecastPath = quarters.slice(actualCount - 1)
    .map((point, offset) => `${offset === 0 ? 'M' : 'L'}${xq(actualCount - 1 + offset).toFixed(1)} ${yq(point.value).toFixed(1)}`)
    .join(' ');
  const aiGhostPath = [
    { index: actualCount - 1, value: quarters[actualCount - 1]?.value ?? 0 },
    { index: actualCount, value: aiQ4 },
    { index: actualCount + 1, value: aiQ1 },
  ].map((point, offset) => `${offset === 0 ? 'M' : 'L'}${xq(point.index).toFixed(1)} ${yq(point.value).toFixed(1)}`)
    .join(' ');
  const todayX = (xq(actualCount - 1) + xq(actualCount)) / 2;
  const nextIdx = quarters.length - 1;
  const showAiGhost = (humanQ4 || humanQ1) && seriesOn(SERIES_AI_BASELINE);

  // 事件锚点：起周所属季度（quarterKeyOfWeek 从周完整日期推导，禁止按数组比例猜季度）；
  // 季度键解析不到时（超出 fixture 周窗）锚到末格并标「不在预测窗口」。
  const eventAnchorIndex = (event: MarketEventSeed): number => {
    const quarterKey = quarterKeyOfWeek(fixture, event.startWeek);
    if (!quarterKey) return quarters.length - 1;
    const found = quarters.findIndex((point) => point.key === quarterKey);
    return found >= 0 ? found : quarters.length - 1;
  };

  return (
    <section style={workbenchCardStyle}>
      {sectionHead}
      {ioBar}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: space.lg, alignItems: 'start' }}>
        {/* 左图：单条连贯季度线 + AI 基线对照点 + 事件锚点 */}
        <div>
          <div style={{ overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              width="100%"
              role="img"
              aria-label={`大盘季度指数单线：实际 ${quarters.filter((point) => point.status === 'actual').map((point) => `${point.key} ${point.value}`).join(' / ')}；推演 2026Q4 ${q4Index}、2027Q1 ${q1Index}；AI 基线 ${aiQ4} / ${aiQ1}。`}
              style={{ display: 'block', height: 'auto', minWidth: 300 }}
            >
              <g stroke={color.hairline}>
                {yTicks.map((tick) => (
                  <line key={tick} x1={left} y1={yq(tick)} x2={CHART_W - right} y2={yq(tick)} />
                ))}
              </g>
              <g fontSize={10} fill={color.mute} textAnchor="end">
                {yTicks.map((tick) => (
                  <text key={tick} x={left - 6} y={yq(tick) + 3}>{tick}</text>
                ))}
              </g>
              <text x={left - 6} y={top - 8} fontSize={10} fill={color.mute} textAnchor="end">指数</text>
              <line x1={todayX} y1={top - 6} x2={todayX} y2={top + plotH} stroke={color.hairlineStrong} strokeDasharray="4 4" />
              <text x={todayX - 5} y={CHART_H - 14} textAnchor="end" fontSize={10} fill={color.body}>{`今天 ${fixture.context.todayLabel}`}</text>
              {/* 实际段（墨实线）→ 推演段（蓝虚线）+ AI 基线对照（灰虚点，仅人工改格后出现） */}
              {seriesOn(SERIES_ACTUAL) && <path data-series="actual" d={actualPath} fill="none" stroke={color.ink} strokeWidth={2.2} />}
              {seriesOn(SERIES_FORECAST) && <path data-series="forecast" d={forecastPath} fill="none" stroke={color.link} strokeWidth={2.2} strokeDasharray="6 5" />}
              {showAiGhost && (
                <g data-series="ai-ghost">
                  <path d={aiGhostPath} fill="none" stroke={color.hairlineStrong} strokeWidth={1.4} strokeDasharray="2 4" opacity={0.85} />
                  <circle cx={xq(actualCount)} cy={yq(aiQ4)} r={3} fill="none" stroke={color.hairlineStrong} strokeWidth={1.2} />
                  <circle cx={xq(nextIdx)} cy={yq(aiQ1)} r={3} fill="none" stroke={color.hairlineStrong} strokeWidth={1.2} />
                </g>
              )}
              {seriesOn(SERIES_FORECAST) && (
                <g data-series="forecast-value">
                  <circle cx={xq(actualCount)} cy={yq(q4Index)} r={3.4} fill={humanQ4 ? color.link : color.canvas} stroke={color.link} strokeWidth={1.6} />
                  <circle cx={xq(nextIdx)} cy={yq(q1Index)} r={4.6} fill={humanQ1 ? color.link : color.canvas} stroke={color.link} strokeWidth={2} />
                  <circle cx={xq(nextIdx)} cy={yq(q1Index)} r={2} fill={color.link} />
                </g>
              )}
              {/* 同比读数（vs 去年同季；与卡头共用 quarterYoYPct 单口径） */}
              {quarters.map((point) => {
                const yoy = quarterYoYPct(quarters, point.key);
                if (yoy == null) return null;
                const index = quarters.indexOf(point);
                return (
                  <text key={point.key} x={xq(index)} y={yq(point.value) - 7} textAnchor="middle" fontSize={9.5} fill={point.status === 'forecast' ? color.link : color.mute}>
                    {fmtYoY(yoy)}
                  </text>
                );
              })}
              {/* 行业级事件锚点（起周所属季度格；historical = 历史解释锚） */}
              {params.marketEvents.map((event) => {
                const disposition = marketEventDisposition(fixture, event);
                const index = eventAnchorIndex(event);
                const cx = xq(index);
                const anchorQuarter = quarterKeyOfWeek(fixture, event.startWeek) ?? '';
                const endWeek = event.startWeek + event.durationWeeks - 1;
                return (
                  <g
                    key={`mk-${event.id}`}
                    data-event-id={event.id}
                    data-quarter={anchorQuarter}
                    data-disposition={disposition}
                  >
                    <line x1={cx} y1={top - 6} x2={cx} y2={top + plotH} stroke={color.hairlineStrong} strokeDasharray="2 4" opacity={disposition === 'historical' ? 0.5 : 0.8} />
                    <circle cx={cx} cy={top - 2} r={4} fill={disposition === 'historical' ? color.hairlineStrong : color.warning} />
                    <title>{`${event.label}（W${event.startWeek}–W${endWeek} · ${event.decay === 'decreasing' ? '递减' : '恒定'} · ${DISPOSITION_TEXT[disposition]}）`}</title>
                  </g>
                );
              })}
              {/* X 轴季度标签 */}
              <g fontSize={10} fill={color.mute} textAnchor="middle">
                {quarters.map((point, index) => (
                  <text key={point.key} x={xq(index)} y={CHART_H - 24}>
                    {point.key.endsWith('Q1') ? point.key : point.key.slice(5)}
                  </text>
                ))}
              </g>
              <text x={xq(nextIdx)} y={CHART_H - 10} textAnchor="middle" fontSize={9.5} fill={color.link} fontWeight={600}>下季预测</text>
            </svg>
          </div>
          <WorkbenchLegend items={legendItems} hidden={hiddenSeries} onToggle={toggleSeries} style={{ marginTop: 0 }} />
          <div style={{ marginTop: space.xs, fontSize: 11, lineHeight: 1.6, color: color.mute }}>
            大盘只看总量，不下钻品牌 / 品；预测只延伸到下一季。历史段事件仅作解释，不参与推演修正。
          </div>
        </div>

        {/* 右栏：AI 基线 + 预测格直接编辑 + 行业级事件 + 理由栏 */}
        <div style={{ display: 'grid', gap: space.md, minWidth: 0 }}>
          <div style={{ display: 'grid', gap: space.sm }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>下一季度预测（直接改格修正走势）</span>
              <AiJudgeBadge source={params.overrideSource} />
            </div>
            <div
              style={{ fontSize: 11, lineHeight: 1.6, color: color.mute }}
              title={`AI 基线为本地确定性规则推演（季节 × 趋势：去年同季比 × 今年/去年水平比），未调用模型服务；人工改格后图中保留 AI 基线灰色对照点，还原改格即回到 AI 基线。`}
            >
              {`AI 基线：2026Q4 ${aiQ4} · 2027Q1 ${aiQ1}。改任意一格即转「人工确认」。`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
                2026Q4（当前季估读）
                <InputNumber
                  aria-label="2026Q4 大盘指数（人工修正）"
                  min={40}
                  max={200}
                  step={1}
                  precision={1}
                  value={q4Index}
                  status={humanQ4 ? 'warning' : undefined}
                  onChange={(value) => { if (value != null) onOverride('q4', Math.max(40, Math.min(200, Number(value)))); }}
                  style={{ width: 92 }}
                />
                {humanQ4 && <Button size="small" type="text" onClick={() => onOverride('q4', null)}>还原 AI</Button>}
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
                2027Q1（下季预测）
                <InputNumber
                  aria-label="2027Q1 大盘指数（人工修正）"
                  min={40}
                  max={200}
                  step={1}
                  precision={1}
                  value={q1Index}
                  status={humanQ1 ? 'warning' : undefined}
                  onChange={(value) => { if (value != null) onOverride('q1', Math.max(40, Math.min(200, Number(value)))); }}
                  style={{ width: 92 }}
                />
                {humanQ1 && <Button size="small" type="text" onClick={() => onOverride('q1', null)}>还原 AI</Button>}
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gap: space.sm }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>影响大盘的关键事件（仅行业级 · 人工录入）</div>
            <div style={{ fontSize: 11, lineHeight: 1.6, color: color.mute }}>
              每个事件含起始周（周粒度，可落历史段作解释）、影响时长、峰值幅度与衰减方式（默认递减）；只收行业级事件，竞品常规迭代由量价参考与主图事件承载。
            </div>
            {params.marketEvents.map((event: MarketEventSeed) => {
              const disposition = marketEventDisposition(fixture, event);
              const endWeek = event.startWeek + event.durationWeeks - 1;
              return (
                <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap', border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px` }}>
                  <div style={{ flex: '1 1 140px', minWidth: 120 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>{event.label}</div>
                    <div style={{ fontSize: 11, color: color.mute }}>
                      {`W${event.startWeek}–W${endWeek} · ${DISPOSITION_TEXT[disposition]}`}
                    </div>
                  </div>
                  <Stepper
                    label="起周"
                    value={`W${event.startWeek}`}
                    onStep={(delta) => onEventStep(event.id, 'startWeek', delta)}
                    dec={event.startWeek > WEEK_MIN}
                    inc={event.startWeek < WEEK_MAX}
                    decLabel={`提前 ${event.label} 起始周`}
                    incLabel={`推后 ${event.label} 起始周`}
                  />
                  <Stepper
                    label="时长"
                    value={`${event.durationWeeks} 周`}
                    onStep={(delta) => onEventStep(event.id, 'durationWeeks', delta)}
                    dec={event.durationWeeks > DURATION_MIN}
                    inc={event.durationWeeks < DURATION_MAX}
                    decLabel={`缩短 ${event.label} 影响时长`}
                    incLabel={`延长 ${event.label} 影响时长`}
                  />
                  <Stepper
                    label="峰值幅度"
                    value={fmtSignedPct(event.magnitudePct)}
                    onStep={(delta) => onEventStep(event.id, 'magnitudePct', delta)}
                    dec={event.magnitudePct > MAGNITUDE_MIN}
                    inc={event.magnitudePct < MAGNITUDE_MAX}
                    decLabel={`减弱 ${event.label} 峰值幅度`}
                    incLabel={`增强 ${event.label} 峰值幅度`}
                  />
                  <div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 10, color: color.mute }}>衰减</span>
                    <span style={{ display: 'inline-flex', border: `1px solid ${color.hairlineStrong}`, borderRadius: 6, overflow: 'hidden' }}>
                      {([['decreasing', '递减'], ['flat', '恒定']] as const).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={event.decay === key}
                          onClick={() => onEventDecay(event.id, key)}
                          style={{
                            border: 'none', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
                            background: event.decay === key ? selectSoft : color.canvas,
                            color: event.decay === key ? selectSoftInk : color.body,
                            fontWeight: event.decay === key ? 600 : 400,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                  </div>
                  <Button size="small" aria-label={`删除事件 ${event.label}`} onClick={() => onEventRemove(event.id)}>删除</Button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={onEventAdd}
              style={{
                border: `1px dashed ${color.hairlineStrong}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px`,
                background: color.canvas, color: color.link, fontSize: 12.5, cursor: 'pointer', textAlign: 'center',
              }}
            >
              ＋ 添加行业级事件（起周 + 时长 + 幅度 + 衰减）
            </button>
          </div>

          <div style={{ display: 'grid', gap: space.xs }}>
            <label htmlFor="workbench-rationale" style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>理由 · 为什么这么推</label>
            <Input.TextArea
              id="workbench-rationale"
              aria-label="推演理由（为什么这么推）"
              value={params.rationale}
              onChange={(event) => onRationaleChange(event.target.value)}
              autoSize={{ minRows: 3, maxRows: 6 }}
            />
            <div style={{ fontSize: 11, color: color.mute }}>理由是推演结论的关键假设说明。</div>
          </div>
        </div>
      </div>
    </section>
  );
}
