// ============================================================
// 推演工作台 v2 · 层②大盘 · 总量总线（产品全景视角，2026-11-03 晚 Eason 拍板）：
// 左图 = 单条季度线从 2025Q1 连贯到当前（2026Q3 实际），向后只推演到下一季
// （2026Q4 当前季估读 → 2027Q1 下一季预测目标），实线→虚线一条线；
// 右栏 = 大盘考量面板：季度环比趋势（AI 判断 · 可修改，逐季延续）+
// 影响大盘的关键事件（仅行业级：生效季度 + 持续季数 + 幅度三参数，可增删）
// + 理由栏。竞品常规迭代不在此配置（量价参考 / 竞品考量承载）。
// ============================================================
import { Button, Input, InputNumber, Slider } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import type { MarketEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchParams, WorkbenchResult } from './workbenchModel';
import { forecastQuarterIndexes, isEventActiveIn } from './workbenchModel';
import { AiJudgeBadge, CertaintyBadge, SectionHead, WorkbenchLegend, fmtSignedPct, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

/** TODO 待拍板（brief 开放问题 3/4 关联）：新增事件名称来自预设池占位（仅行业级事件），清单维护方与 AI 初始来源待定。 */
const ADD_EVENT_POOL = ['三折叠上市', '地缘冲突扰动', '汇率跳变', '平台补贴退坡'];
const MAGNITUDE_MIN = -30;
const MAGNITUDE_MAX = 30;
const DURATION_MAX = 2;

const CHART_W = 520;
const CHART_H = 220;

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
  onQoqLive,
  onQoqCommit,
  onEventStep,
  onEventRemove,
  onEventAdd,
  onRationaleChange,
}: {
  fixture: WorkbenchFixture;
  params: WorkbenchParams;
  result: WorkbenchResult;
  onQoqLive: (value: number) => void;
  onQoqCommit: (value: number) => void;
  /** field：magnitudePct 幅度 ±1pt / quarterShift 生效季前后移 / durationStep 持续季数 ±1 */
  onEventStep: (id: string, field: 'magnitudePct' | 'quarterShift' | 'durationStep', delta: number) => void;
  onEventRemove: (id: string) => void;
  onEventAdd: () => void;
  onRationaleChange: (text: string) => void;
}) {
  const quarters = result.marketQuarters;
  const { q4Index, q1NextIndex } = forecastQuarterIndexes(fixture, params.qoqDeclinePct, params.marketEvents);
  const actualCount = quarters.filter((point) => point.status === 'actual').length;
  const q1LastYear = quarters.find((point) => point.key === '2025Q1')?.value ?? 0;
  const yoyNext = q1LastYear > 0 ? ((q1NextIndex / q1LastYear - 1) * 100).toFixed(1) : '—';

  // 左图几何：单条季度线（10 格 = 8 实际 + 2 推演）。
  const left = 40;
  const right = 14;
  const top = 20;
  const bottom = 40;
  const plotW = CHART_W - left - right;
  const plotH = CHART_H - top - bottom;
  const values = quarters.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(2, (rawMax - rawMin) * 0.15);
  const yMin = Math.floor(rawMin - pad);
  const yMax = Math.ceil(rawMax + pad);
  const xq = (index: number): number => left + (index + 0.5) * (plotW / quarters.length);
  const yq = (value: number): number => top + plotH * (1 - (value - yMin) / (yMax - yMin));
  const tickCount = 3;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, index) => Math.round(yMin + ((yMax - yMin) * index) / tickCount));
  // 单线：实际段实线（墨）；推演段从最后一个实际点起虚线延续（蓝）——一条线连贯。
  const actualPath = quarters.slice(0, actualCount)
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xq(index).toFixed(1)} ${yq(point.value).toFixed(1)}`)
    .join(' ');
  const forecastPath = quarters.slice(actualCount - 1)
    .map((point, offset) => `${offset === 0 ? 'M' : 'L'}${xq(actualCount - 1 + offset).toFixed(1)} ${yq(point.value).toFixed(1)}`)
    .join(' ');
  const todayX = (xq(actualCount - 1) + xq(actualCount)) / 2;
  const nextIdx = quarters.length - 1;

  const legendItems: LegendItem[] = [
    { label: '大盘指数 · 实际（2025Q1 起）', shape: 'line', color: color.ink },
    { label: '推演（当前季 → 下一季）', shape: 'dash', color: color.link },
  ];

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="大盘 · 总量总线"
        hint={`单条季度线从 2025Q1 连贯到当前（同比不下钻到周——大促周序逐年漂移）；向后只预测到下一季：2026Q4 为当前季估读，2027Q1 为下一季预测目标（同比 2025Q1 约 ${yoyNext}%）。季度环比趋势逐季延续，事件按季叠加。`}
        extra={<><CertaintyBadge level="mid" /></>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: space.lg, alignItems: 'start' }}>
        {/* 左图：单条连贯季度线 */}
        <div>
          <div style={{ overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              width="100%"
              role="img"
              aria-label={`大盘季度指数单线：实际 ${quarters.filter((point) => point.status === 'actual').map((point) => `${point.key} ${point.value}`).join(' / ')}；推演 2026Q4 ${q4Index}、2027Q1（下一季）${q1NextIndex}，季度环比 ${params.qoqDeclinePct}% 逐季延续。`}
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
              <text x={left - 6} y={top - 6} fontSize={10} fill={color.mute} textAnchor="end">指数</text>
              {/* 今天分界（最后一个实际季与推演季之间） */}
              <line x1={todayX} y1={top - 4} x2={todayX} y2={top + plotH} stroke={color.hairlineStrong} strokeDasharray="4 4" />
              <text x={todayX - 5} y={CHART_H - 14} textAnchor="end" fontSize={10} fill={color.body}>{`今天 ${fixture.context.todayLabel}`}</text>
              {/* 实际段（墨实线）→ 推演段（蓝虚线，同一条线延续） */}
              <path d={actualPath} fill="none" stroke={color.ink} strokeWidth={2.2} />
              <path d={forecastPath} fill="none" stroke={color.link} strokeWidth={2.2} strokeDasharray="6 5" />
              <circle cx={xq(actualCount)} cy={yq(q4Index)} r={3.2} fill={color.canvas} stroke={color.link} strokeWidth={1.6} />
              {/* 下一季预测点（视觉强调） */}
              <circle cx={xq(nextIdx)} cy={yq(q1NextIndex)} r={4.5} fill={color.canvas} stroke={color.link} strokeWidth={2} />
              <circle cx={xq(nextIdx)} cy={yq(q1NextIndex)} r={2} fill={color.link} />
              {/* 同比读数（vs 去年同季；2025 段无对照不标） */}
              {quarters.map((point, index) => {
                const base = quarters[index - 4];
                if (!base || base.value <= 0) return null;
                const yoy = ((point.value / base.value - 1) * 100).toFixed(1);
                const forecastTone = point.status === 'forecast';
                return (
                  <text
                    key={point.key}
                    x={xq(index)}
                    y={yq(point.value) - 7}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill={forecastTone ? color.link : color.mute}
                  >
                    {`${Number(yoy) > 0 ? '+' : ''}${yoy}%`}
                  </text>
                );
              })}
              {/* X 轴季度标签（Q1 带完整年份，其余只显示季度） */}
              <g fontSize={10} fill={color.mute} textAnchor="middle">
                {quarters.map((point) => (
                  <text key={point.key} x={xq(quarters.indexOf(point))} y={CHART_H - 26}>
                    {point.key.endsWith('Q1') ? point.key : point.key.slice(5)}
                  </text>
                ))}
              </g>
              <text x={xq(nextIdx)} y={CHART_H - 14} textAnchor="middle" fontSize={9.5} fill={color.link} fontWeight={600}>下季预测</text>
            </svg>
          </div>
          <WorkbenchLegend items={legendItems} hidden={new Set()} style={{ marginTop: 0 }} />
          <div style={{ marginTop: space.xs, fontSize: 11, lineHeight: 1.6, color: color.mute }}>
            大盘只看总量总线，不下钻品牌 / 品（展示层与推演层分离，避免循环论证）；预测只延伸到下一季，不更远。
          </div>
        </div>

        {/* 右栏：大盘考量面板 */}
        <div style={{ display: 'grid', gap: space.md, minWidth: 0 }}>
          <div style={{ display: 'grid', gap: space.sm }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>季度环比趋势（自 2026Q4 起逐季延续）</span>
              <AiJudgeBadge source={params.qoqSource} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <Slider
                  aria-label="季度环比趋势（百分比，负 = 下滑）"
                  min={-20}
                  max={10}
                  step={1}
                  value={params.qoqDeclinePct}
                  onChange={(value) => onQoqLive(Number(value))}
                  onChangeComplete={(value) => onQoqCommit(Number(value))}
                  tooltip={{ formatter: (value) => fmtSignedPct(Number(value ?? 0)) }}
                />
              </div>
              <InputNumber
                aria-label="季度环比趋势数值输入（百分比）"
                min={-30}
                max={30}
                step={1}
                precision={0}
                value={params.qoqDeclinePct}
                formatter={(value) => (value == null ? '' : `${value}%`)}
                parser={(text) => Number((text ?? '').replace('%', ''))}
                onChange={(value) => {
                  if (value == null) return;
                  const next = Math.max(-30, Math.min(30, Number(value)));
                  onQoqLive(next);
                  onQoqCommit(next);
                }}
                style={{ width: 84 }}
              />
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.6, color: color.mute }}>
              {`逐季连乘：2026Q3 ${quarters[actualCount - 1]?.value} → 2026Q4 ${q4Index} → 2027Q1 ${q1NextIndex}（均含季度环比 ${fmtSignedPct(params.qoqDeclinePct)} 与当季生效事件）。`}
            </div>
          </div>

          <div style={{ display: 'grid', gap: space.sm }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>影响大盘的关键事件（仅行业级）</div>
            <div style={{ fontSize: 11, lineHeight: 1.6, color: color.mute }}>
              只配置影响整个市场的事件（生效季度 + 持续季数 + 幅度）；竞品常规迭代不在这里，由量价参考与竞品考量承载。
            </div>
            {params.marketEvents.map((event: MarketEventSeed) => (
              <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap', border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px` }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>{event.label}</div>
                  <div style={{ fontSize: 11, color: color.mute }}>
                    {`${event.startQuarter} 起 · 持续 ${event.durationQuarters} 季${isEventActiveIn(event, '2026Q4') ? ' · 本季生效中' : ' · 自下一季生效'}`}
                  </div>
                </div>
                <Stepper
                  label="幅度"
                  value={fmtSignedPct(event.magnitudePct)}
                  onStep={(delta) => onEventStep(event.id, 'magnitudePct', delta)}
                  dec={event.magnitudePct <= MAGNITUDE_MIN}
                  inc={event.magnitudePct >= MAGNITUDE_MAX}
                  decLabel={`减弱 ${event.label} 影响幅度`}
                  incLabel={`增强 ${event.label} 影响幅度`}
                />
                <Stepper
                  label="生效季"
                  value={event.startQuarter.replace('2026', "'26").replace('2027', "'27")}
                  onStep={(delta) => onEventStep(event.id, 'quarterShift', delta)}
                  dec={event.startQuarter === '2027Q1'}
                  inc={event.startQuarter === '2026Q4'}
                  decLabel={`提前 ${event.label} 生效季`}
                  incLabel={`推后 ${event.label} 生效季`}
                />
                <Stepper
                  label="持续"
                  value={`${event.durationQuarters} 季`}
                  onStep={(delta) => onEventStep(event.id, 'durationStep', delta)}
                  dec={event.durationQuarters <= 1}
                  inc={event.durationQuarters >= DURATION_MAX}
                  decLabel={`缩短 ${event.label} 持续时间`}
                  incLabel={`延长 ${event.label} 持续时间`}
                />
                <Button size="small" aria-label={`删除事件 ${event.label}`} onClick={() => onEventRemove(event.id)}>删除</Button>
              </div>
            ))}
            <button
              type="button"
              onClick={onEventAdd}
              style={{
                border: `1px dashed ${color.hairlineStrong}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px`,
                background: color.canvas, color: color.link, fontSize: 12.5, cursor: 'pointer', textAlign: 'center',
              }}
            >
              ＋ 添加行业级事件（生效季 + 持续 + 幅度）
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
