// ============================================================
// 推演工作台 v2 · 层②大盘 · 总量总线（2026-11-03 晚纲领版）：
// 左图 = 单条季度线 2025Q1 连贯到当前（2026Q3 实际），向后只预测下一季：
// 推演两格附 AI 时间序列基线（ghost 空心灰点，AI 推的第一版）与当前生效值
// （人工改格后实心蓝点；未改时两者重合）；
// 右栏 = 大盘考量面板：AI 基线读数（季节 × 趋势，挂 AI 标）+ 下一季度预测格
// 直接编辑（人工修改两条路之一）+ 影响大盘的关键事件四件套（起周[可落历史段
// 作解释性标记] + 时长 + 峰值幅度 + 衰减方式[默认递减]，人工录入，AI 不猜）
// + 理由栏。竞品常规迭代不在此配置。
// ============================================================
import { Button, Input, InputNumber } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import type { MarketEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchParams, WorkbenchResult } from './workbenchModel';
import { effectiveQuarterIndexes, eventWeeklyFactor, marketSeriesBaseline } from './workbenchModel';
import { AiJudgeBadge, SectionHead, WorkbenchLegend, fmtSignedPct, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

/** TODO 待拍板（brief 开放问题 3/4 关联）：新增事件名称来自预设池占位（仅行业级事件），清单维护方待定。 */
const ADD_EVENT_POOL = ['三折叠上市', '地缘冲突扰动', '汇率跳变', '平台补贴退坡'];
const MAGNITUDE_MIN = -30;
const MAGNITUDE_MAX = 30;
const WEEK_MIN = 38; // 事件起周可落历史段（W38 起，解释性标记）
const WEEK_MAX = 52;
const DURATION_MIN = 1;
const DURATION_MAX = 8;

const CHART_W = 520;
const CHART_H = 224;

function Stepper({ label, value, onStep, dec, inc, decLabel, incLabel }: {
  label: string;
  value: string;
  onStep: (delta: number) => void;
  dec: boolean;
  inc: boolean;
  decLabel: string;
  incLabel: string;
}) {
  const btn = (arrow: string, delta: number, disabled: boolean, aria: string) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={aria}
      onClick={() => onStep(delta)}
      style={{
        width: 22, height: 22, borderRadius: 5, border: `1px solid ${color.hairlineStrong}`,
        background: color.canvas, color: color.body, fontSize: 13, lineHeight: 1, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.48 : 1, padding: 0,
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
  /** 人工直接改预测格（修正下一季度预测）：field = 'q4' | 'q1'。 */
  onOverride: (field: 'q4' | 'q1', value: number | null) => void;
  /** 事件四件套步进：field = magnitudePct ±1pt / startWeek ±1 / durationWeeks ±1。 */
  onEventStep: (id: string, field: 'magnitudePct' | 'startWeek' | 'durationWeeks', delta: number) => void;
  onEventDecay: (id: string, decay: 'decreasing' | 'flat') => void;
  onEventRemove: (id: string) => void;
  onEventAdd: () => void;
  onRationaleChange: (text: string) => void;
}) {
  const quarters = result.marketQuarters;
  const { aiQ4, aiQ1 } = marketSeriesBaseline(fixture);
  const { q4Index, q1Index } = effectiveQuarterIndexes(fixture, params);
  const actualCount = quarters.filter((point) => point.status === 'actual').length;
  const humanQ4 = params.q4Override != null;
  const humanQ1 = params.q1Override != null;
  const q1LastYear = quarters.find((point) => point.key === '2025Q1')?.value ?? 0;
  const yoyNext = q1LastYear > 0 ? ((q1Index / q1LastYear - 1) * 100).toFixed(1) : '—';

  // 左图几何：单条季度线（9 格 = 7 实际 + 2 推演）。
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

  // 事件标记：startWeek 所属格（历史段事件画在实际段对应位置，解释性锚）。
  const weekToIndex = (weekNumber: number): number => {
    const start = 37;
    return Math.max(0, Math.min(quarters.length - 1, Math.floor(((weekNumber - start) / (52 - start + 1)) * quarters.length)));
  };

  const legendItems: LegendItem[] = [
    { label: '大盘指数 · 实际（2025Q1 起）', shape: 'line', color: color.ink },
    { label: '推演（当前生效值）', shape: 'dash', color: color.link },
    { label: 'AI 时间序列基线（ghost）', shape: 'dash', color: color.hairlineStrong },
  ];

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="大盘 · 总量总线"
        hint={`单条季度线从 2025Q1 连贯到当前；向后只预测下一季（2027Q1，同比 2025Q1 约 ${yoyNext}%）。推演第一版 = 纯时间序列（周期性季节因素 × 全局性趋势，AI 推），人工可直接改预测格或录入行业级事件修正。`}
        extra={<AiJudgeBadge source={params.overrideSource} />}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: space.lg, alignItems: 'start' }}>
        {/* 左图：单条连贯季度线 + AI ghost + 事件标记 */}
        <div>
          <div style={{ overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              width="100%"
              role="img"
              aria-label={`大盘季度指数单线：实际 ${quarters.filter((point) => point.status === 'actual').map((point) => `${point.key} ${point.value}`).join(' / ')}；推演 2026Q4 ${q4Index}、2027Q1 ${q1Index}；AI 时间序列基线 ${aiQ4} / ${aiQ1}。`}
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
              {/* 实际段（墨实线）→ 推演段（蓝虚线）+ AI 基线 ghost（灰虚点） */}
              <path d={actualPath} fill="none" stroke={color.ink} strokeWidth={2.2} />
              <path d={forecastPath} fill="none" stroke={color.link} strokeWidth={2.2} strokeDasharray="6 5" />
              {(humanQ4 || humanQ1) && (
                <path d={aiGhostPath} fill="none" stroke={color.hairlineStrong} strokeWidth={1.4} strokeDasharray="2 4" opacity={0.85} />
              )}
              <circle cx={xq(actualCount)} cy={yq(q4Index)} r={3.4} fill={humanQ4 ? color.link : color.canvas} stroke={color.link} strokeWidth={1.6} />
              <circle cx={xq(nextIdx)} cy={yq(q1Index)} r={4.6} fill={humanQ1 ? color.link : color.canvas} stroke={color.link} strokeWidth={2} />
              <circle cx={xq(nextIdx)} cy={yq(q1Index)} r={2} fill={color.link} />
              {(humanQ4 || humanQ1) && (
                <>
                  <circle cx={xq(actualCount)} cy={yq(aiQ4)} r={3} fill="none" stroke={color.hairlineStrong} strokeWidth={1.2} />
                  <circle cx={xq(nextIdx)} cy={yq(aiQ1)} r={3} fill="none" stroke={color.hairlineStrong} strokeWidth={1.2} />
                </>
              )}
              {/* 同比读数（vs 去年同季） */}
              {quarters.map((point, index) => {
                const base = quarters[index - 4];
                if (!base || base.value <= 0) return null;
                const yoy = ((point.value / base.value - 1) * 100).toFixed(1);
                return (
                  <text key={point.key} x={xq(index)} y={yq(point.value) - 7} textAnchor="middle" fontSize={9.5} fill={point.status === 'forecast' ? color.link : color.mute}>
                    {`${Number(yoy) > 0 ? '+' : ''}${yoy}%`}
                  </text>
                );
              })}
              {/* 行业级事件标记（起周所属格；历史段 = 解释性锚） */}
              {params.marketEvents.map((event) => {
                const index = weekToIndex(event.startWeek);
                const cx = xq(index);
                const inHistory = event.startWeek < 45;
                return (
                  <g key={`mk-${event.id}`}>
                    <line x1={cx} y1={top - 6} x2={cx} y2={top + plotH} stroke={color.hairlineStrong} strokeDasharray="2 4" opacity={inHistory ? 0.5 : 0.8} />
                    <circle cx={cx} cy={top - 2} r={4} fill={inHistory ? color.hairlineStrong : color.warning} />
                    <title>{`${event.label}（W${event.startWeek} 起 ${event.durationWeeks} 周 · ${event.decay === 'decreasing' ? '递减' : '恒定'}${inHistory ? ' · 历史段解释标记' : ''}）`}</title>
                  </g>
                );
              })}
              {/* X 轴季度标签 */}
              <g fontSize={10} fill={color.mute} textAnchor="middle">
                {quarters.map((point) => (
                  <text key={point.key} x={xq(quarters.indexOf(point))} y={CHART_H - 24}>
                    {point.key.endsWith('Q1') ? point.key : point.key.slice(5)}
                  </text>
                ))}
              </g>
              <text x={xq(nextIdx)} y={CHART_H - 10} textAnchor="middle" fontSize={9.5} fill={color.link} fontWeight={600}>下季预测</text>
            </svg>
          </div>
          <WorkbenchLegend items={legendItems} hidden={new Set()} style={{ marginTop: 0 }} />
          <div style={{ marginTop: space.xs, fontSize: 11, lineHeight: 1.6, color: color.mute }}>
            大盘只看总量总线，不下钻品牌 / 品（展示层与推演层分离，避免循环论证）；预测只延伸到下一季。事件允许落在历史段（解释性标记，不参与推演修正）。
          </div>
        </div>

        {/* 右栏：AI 基线 + 预测格直接编辑 + 事件四件套 + 理由栏 */}
        <div style={{ display: 'grid', gap: space.md, minWidth: 0 }}>
          <div style={{ display: 'grid', gap: space.sm }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>下一季度预测（直接改格修正走势）</span>
              <AiJudgeBadge source={params.overrideSource} />
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.6, color: color.mute }}>
              AI 基线 = 纯时间序列（周期性季节因素 × 全局性趋势）：2026Q4 {aiQ4} · 2027Q1 {aiQ1}。改任意一格即转「人工确认」，图中灰 ghost 保留 AI 第一版对照。
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
              四件套 = 起始周（周粒度，可落历史段作解释性标记）+ 影响时长 + 脉冲幅度 + 衰减方式（默认递减）。只收行业级开天辟地事件；竞品常规迭代由量价参考与主图小事件承载。
            </div>
            {params.marketEvents.map((event: MarketEventSeed) => {
              const activeNow = eventWeeklyFactor(event, 45) != null;
              const endWeek = event.startWeek + event.durationWeeks - 1;
              return (
                <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap', border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px` }}>
                  <div style={{ flex: '1 1 140px', minWidth: 120 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>{event.label}</div>
                    <div style={{ fontSize: 11, color: color.mute }}>
                      {`W${event.startWeek}–W${endWeek}${activeNow ? ' · 作用于本季预测' : event.startWeek < 45 ? ' · 历史段解释标记' : ' · 不在本季窗口'}`}
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
                            background: event.decay === key ? selectSoftBg : color.canvas,
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
            <div style={{ fontSize: 11, color: color.mute }}>理由是圆桌会议后截图贴 PPT 的关键假设载体。</div>
          </div>
        </div>
      </div>
    </section>
  );
}

const selectSoftBg = '#e8f1ff';
const selectSoftInk = '#0053c2';
