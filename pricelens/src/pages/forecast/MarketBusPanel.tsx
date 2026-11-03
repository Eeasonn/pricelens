// ============================================================
// 推演工作台 v2 · 层②大盘 · 总量总线（工作台形态）：
// 左图 = 去年 Q1 至今双线对照（去年线灰 vs 今年线墨，季度粒度——同比不下钻
// 到周，大促周序逐年漂移；今年 Q4 为推演值，随环比降幅联动）；
// 右栏 = 大盘考量面板：Q4 环比降幅（AI 判断 · 可修改 → 人工确认）+
// 关键事件（幅度 + 时间两参数步进器，可增删，衰减曲率不做）+ 理由栏。
// ============================================================
import { Button, Input, InputNumber, Slider } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import type { MarketEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchParams, WorkbenchResult } from './workbenchModel';
import { forecastQuarterIndex } from './workbenchModel';
import { AiJudgeBadge, CertaintyBadge, SectionHead, WorkbenchLegend, fmtSignedPct, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

/** TODO 待拍板（brief 开放问题 3/4 关联）：新增事件的名称来自预设池占位，清单维护方与 AI 初始来源待定。 */
const ADD_EVENT_POOL = ['三折叠上市', '地缘冲突扰动', '汇率跳变', '平台补贴退坡'];
const FORECAST_WEEK_MIN = 45;
const FORECAST_WEEK_MAX = 52;
const MAGNITUDE_MIN = -30;
const MAGNITUDE_MAX = 30;

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
  onEventStep: (id: string, field: 'magnitudePct' | 'startWeek', delta: number) => void;
  onEventRemove: (id: string) => void;
  onEventAdd: () => void;
  onRationaleChange: (text: string) => void;
}) {
  const quarters = result.marketQuarters;
  const q4 = quarters.find((quarter) => quarter.label === 'Q4');
  const lastYearQ4 = q4?.lastYear ?? 0;
  const q4Index = forecastQuarterIndex(fixture, params.qoqDeclinePct);
  const yoyQ4 = lastYearQ4 > 0 ? ((q4Index / lastYearQ4 - 1) * 100).toFixed(1) : '—';

  // 左图几何：季度粒度双线。
  const left = 40;
  const right = 14;
  const top = 20;
  const bottom = 40;
  const plotW = CHART_W - left - right;
  const plotH = CHART_H - top - bottom;
  const values = quarters.flatMap((quarter) => [quarter.lastYear, quarter.thisYear]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(2, (rawMax - rawMin) * 0.15);
  const yMin = Math.floor(rawMin - pad);
  const yMax = Math.ceil(rawMax + pad);
  const xq = (index: number): number => left + (index + 0.5) * (plotW / quarters.length);
  const yq = (value: number): number => top + plotH * (1 - (value - yMin) / (yMax - yMin));
  const tickCount = 3;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, index) => Math.round(yMin + ((yMax - yMin) * index) / tickCount));
  const lastYearPath = quarters.map((quarter, index) => `${index === 0 ? 'M' : 'L'}${xq(index).toFixed(1)} ${yq(quarter.lastYear).toFixed(1)}`).join(' ');
  const thisYearActual = quarters.filter((quarter) => !quarter.thisYearForecast);
  const thisYearPath = thisYearActual.map((quarter, index) => `${index === 0 ? 'M' : 'L'}${xq(quarters.indexOf(quarter)).toFixed(1)} ${yq(quarter.thisYear).toFixed(1)}`).join(' ');
  const q3Point = thisYearActual[thisYearActual.length - 1];
  const q3Index = quarters.indexOf(q3Point);
  const q4IndexPos = quarters.length - 1;
  const forecastPath = `M${xq(q3Index).toFixed(1)} ${yq(q3Point.thisYear).toFixed(1)} L${xq(q4IndexPos).toFixed(1)} ${yq(q4?.thisYear ?? 0).toFixed(1)}`;
  const todayX = (xq(q3Index) + xq(q4IndexPos)) / 2;

  const legendItems: LegendItem[] = [
    { label: '去年（2025）', shape: 'line', color: color.hairlineStrong },
    { label: '今年（2026 · 至 Q3）', shape: 'line', color: color.ink },
    { label: `今年 Q4 推演`, shape: 'dash', color: color.link },
  ];

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="大盘 · 总量总线"
        hint="季度粒度对照（同比不下钻到周——大促周序逐年漂移）；今年 Q4 为推演值，随右侧考量联动。关键事件自生效周起持续作用到预测窗口末（衰减曲率不做）。"
        extra={<><CertaintyBadge level="mid" /></>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: space.lg, alignItems: 'start' }}>
        {/* 左图：季度双线对照 */}
        <div>
          <div style={{ overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              width="100%"
              role="img"
              aria-label={`大盘总量对照（季度）：去年线 ${quarters.map((quarter) => `${quarter.label} ${quarter.lastYear}`).join(' / ')}；今年线 ${quarters.map((quarter) => `${quarter.label} ${quarter.thisYear}`).join(' / ')}，其中 Q4 ${q4Index} 为推演值（环比 ${params.qoqDeclinePct}%，同比去年 Q4 ${yoyQ4}%）。`}
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
              {/* 今天分界（Q3 / Q4 之间） */}
              <line x1={todayX} y1={top - 4} x2={todayX} y2={top + plotH} stroke={color.hairlineStrong} strokeDasharray="4 4" />
              <text x={todayX - 5} y={CHART_H - 14} textAnchor="end" fontSize={10} fill={color.body}>{`今天 ${fixture.context.todayLabel}`}</text>
              {/* 去年线（灰） */}
              <path d={lastYearPath} fill="none" stroke={color.hairlineStrong} strokeWidth={2} />
              {/* 今年线（墨，实）→ Q4 推演（蓝，虚） */}
              <path d={thisYearPath} fill="none" stroke={color.ink} strokeWidth={2.2} />
              <path d={forecastPath} fill="none" stroke={color.link} strokeWidth={2} strokeDasharray="6 5" />
              <circle cx={xq(q4IndexPos)} cy={yq(q4?.thisYear ?? 0)} r={3.5} fill={color.canvas} stroke={color.link} strokeWidth={1.6} />
              {/* 同比读数（数据标注） */}
              {quarters.map((quarter, index) => {
                const yoy = quarter.thisYear != null && quarter.lastYear > 0 ? ((quarter.thisYear / quarter.lastYear - 1) * 100).toFixed(1) : null;
                if (yoy == null) return null;
                return (
                  <text key={quarter.label} x={xq(index)} y={yq(quarter.thisYear as number) - 7} textAnchor="middle" fontSize={9.5} fill={color.mute}>
                    {`${Number(yoy) > 0 ? '+' : ''}${yoy}%`}
                  </text>
                );
              })}
              {/* X 轴季度标签 */}
              <g fontSize={10} fill={color.mute} textAnchor="middle">
                {quarters.map((quarter, index) => (
                  <text key={quarter.label} x={xq(index)} y={CHART_H - 26}>{quarter.label}</text>
                ))}
                <text x={todayX + 5} y={CHART_H - 14} textAnchor="start" fontSize={9.5} fill={color.link}>Q4 推演</text>
              </g>
            </svg>
          </div>
          <WorkbenchLegend items={legendItems} hidden={new Set()} style={{ marginTop: 0 }} />
          <div style={{ marginTop: space.xs, fontSize: 11, lineHeight: 1.6, color: color.mute }}>
            大盘只看总量总线，不下钻品牌 / 品（展示层与推演层分离，避免循环论证）。
          </div>
        </div>

        {/* 右栏：大盘考量面板 */}
        <div style={{ display: 'grid', gap: space.md, minWidth: 0 }}>
          <div style={{ display: 'grid', gap: space.sm }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>Q4 环比降幅（今年 Q4 vs Q3）</span>
              <AiJudgeBadge source={params.qoqSource} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <Slider
                  aria-label="Q4 环比降幅（百分比，负 = 下滑）"
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
                aria-label="Q4 环比降幅数值输入（百分比）"
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
              {`今年 Q4 指数推演 ${q4Index}（Q3 ${quarters[2].thisYear} × 环比 ${fmtSignedPct(params.qoqDeclinePct)}）；同比去年 Q4 ${lastYearQ4} 约 ${yoyQ4}%。`}
            </div>
          </div>

          <div style={{ display: 'grid', gap: space.sm }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>关键事件（幅度 + 时间）</div>
            {params.marketEvents.map((event: MarketEventSeed) => (
              <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap', border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: `${space.sm}px ${space.md}px` }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>{event.label}</div>
                  <div style={{ fontSize: 11, color: color.mute }}>{`自 W${event.startWeek} 起持续作用到预测窗口末（不做衰减）`}</div>
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
                  label="生效周"
                  value={`W${event.startWeek}`}
                  onStep={(delta) => onEventStep(event.id, 'startWeek', delta)}
                  dec={event.startWeek <= FORECAST_WEEK_MIN}
                  inc={event.startWeek >= FORECAST_WEEK_MAX}
                  decLabel={`提前 ${event.label} 生效周`}
                  incLabel={`延后 ${event.label} 生效周`}
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
              ＋ 添加事件（幅度 + 时间两参数）
            </button>
          </div>

          <div style={{ display: 'grid', gap: space.xs }}>
            <label htmlFor="workbench-rationale" style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>理由 · 为什么这么推</label>
            <Input.TextArea
              id="workbench-rationale"
              aria-label="推演理由（为什么这么推，随纪要导出）"
              value={params.rationale}
              onChange={(event) => onRationaleChange(event.target.value)}
              autoSize={{ minRows: 3, maxRows: 6 }}
            />
            <div style={{ fontSize: 11, color: color.mute }}>理由是圆桌会议后截图贴 PPT 的关键假设载体，随「生成纪要」一并导出。</div>
          </div>
        </div>
      </div>
    </section>
  );
}
