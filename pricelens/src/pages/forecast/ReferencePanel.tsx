// ============================================================
// 推演工作台 v2 · 层②量价参考（历史参照卡，WP3 生产化版）：
// 上一代同期 = 受控选择器（写入 params.prevGenReferenceId 进主链；
// 同周龄比值校正由模型计算，卡内不另算比值）+ 友商同期 = 仅对照
// 与回放（卡内查看状态，不改主图基线）；参照对象量价走势 + 历史
// 窗内可观测事实锚（大促 / 发布 / 调价，与主图小事件同源色系）。
// 仅历史、无预测段。缺数纪律：缺数不造 0——实线只连相邻有值点，
// 跨缺失段灰虚线桥接，缺数周显示「—」。
// ============================================================
import { useState } from 'react';
import { Select } from 'antd';
import { brandColor, color, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { ReferenceFactSeed, ReferenceSeriesSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';
import { IoBar, SectionHead, SimChip, WorkbenchLegend, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

const CHART_W = 560;
const CHART_H = 204;
const HISTORY_LEN = 8;

/** 事实锚色（与主图小事件同源：promo 琥珀 / launch 蓝 / price 墨）。 */
const FACT_COLOR: Record<ReferenceFactSeed['type'], string> = {
  promo: color.warning,
  launch: color.link,
  price: color.ink,
};

/** 缺数几何：连续有值段（实线只连接相邻有值点，缺数不造点）。 */
function solidSegmentsOf(values: Array<number | null>): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  values.forEach((value, index) => {
    if (value == null) {
      if (current.length > 1) segments.push(current);
      current = [];
    } else {
      current.push(index);
    }
  });
  if (current.length > 1) segments.push(current);
  return segments;
}

/** 缺数几何：跨缺失桥接段（连接缺失两侧最近的有值点，灰虚线表达）。 */
function bridgeSegmentsOf(values: Array<number | null>): Array<[number, number]> {
  const bridges: Array<[number, number]> = [];
  let lastValid: number | null = null;
  values.forEach((value, index) => {
    if (value != null) {
      if (lastValid != null && index - lastValid > 1) bridges.push([lastValid, index]);
      lastValid = index;
    }
  });
  return bridges;
}

function ReferenceChart({
  fixture,
  series,
  selectValue,
  onSelect,
  selectLabel,
  title,
  subtitle,
  facts,
  footNote,
}: {
  fixture: WorkbenchFixture;
  series: ReferenceSeriesSeed[];
  selectValue: string;
  onSelect: (id: string) => void;
  selectLabel: string;
  title: string;
  subtitle: string;
  facts: ReferenceFactSeed[];
  /** 来自推演模型的说明行（如同周龄比值校正读数）；缺省不渲染。 */
  footNote?: string;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  // 空参照池：显示空态，不渲染图表（缺数不造 0 的前置守卫）。
  if (!series.length) {
    return (
      <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: `${space.md}px ${space.base}px ${space.sm}px`, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: color.ink }}>{title}</h3>
        <div role="status" style={{ padding: `${space.lg}px 0`, textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>
      </div>
    );
  }

  const active = series.find((item) => item.id === selectValue) ?? series[0];
  const left = 44;
  const right = 14;
  const top = 18;
  const bottom = 26;
  const plotW = CHART_W - left - right;
  const plotH = CHART_H - top - bottom;
  // 纯历史窗（W37–W44）：主品 8 点（可缺数）+ 参照 8 点，无预测段（纲领拍板）。
  const mainValues: Array<number | null> = fixture.weeks.slice(0, HISTORY_LEN).map((week) => week.sales);
  const refValues = active.points.slice(0, HISTORY_LEN);
  const peak = Math.max(0, ...mainValues.filter((value): value is number => value != null), ...refValues);
  const maxValue = Math.max(1, niceCeil(peak * 1.15));
  const x = (index: number): number => left + (index + 0.5) * (plotW / HISTORY_LEN);
  const y = (value: number): number => top + plotH * (1 - value / maxValue);
  const line = (values: number[]): string =>
    values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  const pathOf = (indexes: number[], values: Array<number | null>): string =>
    indexes.map((index, position) => `${position === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(values[index] as number).toFixed(1)}`).join(' ');
  const solidSegments = solidSegmentsOf(mainValues);
  const bridges = bridgeSegmentsOf(mainValues);
  const historyMain = mainValues.reduce<number>((total, value) => total + (value ?? 0), 0);
  const historyRef = refValues.reduce((total, value) => total + value, 0);
  const historyDelta = historyRef > 0 ? (((historyMain / historyRef) - 1) * 100).toFixed(1) : '—';
  const missingWeeks = fixture.weeks.slice(0, HISTORY_LEN).filter((week) => week.sales == null).map((week) => week.week);
  const missingNote = missingWeeks.length ? `缺数周 ${missingWeeks.join('、')} 显示「—」，不计 0` : '';
  const historyText = `历史段（${fixture.context.historyRange}）累计：主品 ${(historyMain / 10000).toFixed(1)} 万台 vs ${active.label} ${(historyRef / 10000).toFixed(1)} 万台（${Number(historyDelta) > 0 ? '+' : ''}${historyDelta}%）${missingNote ? ` · ${missingNote}` : ''}`;

  const legendItems: LegendItem[] = [
    { key: 'main', label: '主品周销（历史）', shape: 'line', color: brandColor.HUAWEI },
    { key: 'ref', label: active.label, shape: 'dash', color: color.hairlineStrong },
    { key: 'facts', label: '事实锚（促销琥珀 / 发布蓝 / 调价墨）', shape: 'marker', color: color.warning },
  ];
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: `${space.md}px ${space.base}px ${space.sm}px`, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.sm, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: color.ink }}>{title}</h3>
        <Select
          size="small"
          aria-label={selectLabel}
          value={active.id}
          onChange={onSelect}
          options={series.map((item) => ({ value: item.id, label: item.label }))}
          style={{ minWidth: 168, marginLeft: 'auto' }}
        />
      </div>
      <div style={{ fontSize: 11, color: color.mute, marginBottom: space.sm, minWidth: 0 }} title={subtitle}>{subtitle}</div>
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          width="100%"
          role="img"
          aria-label={`${title}：主品与${active.label}的历史周销对照（仅 ${fixture.context.historyRange}，无预测段）；${historyText}；事实锚 ${facts.map((fact) => fact.label).join('、')}。`}
          style={{ display: 'block', height: 'auto', minWidth: 320 }}
        >
          {[0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line x1={left} y1={y(maxValue * fraction)} x2={CHART_W - right} y2={y(maxValue * fraction)} stroke={fraction === 1 ? color.hairlineStrong : color.hairline} />
              <text x={left - 6} y={y(maxValue * fraction) + 3} fontSize={10} fill={color.mute} textAnchor="end">{Math.round(maxValue * fraction / 10000)}</text>
            </g>
          ))}
          <text x={left - 6} y={top - 6} fontSize={10} fill={color.mute} textAnchor="end">万台</text>
          {!hidden.has('ref') && (
            <path d={line(refValues)} fill="none" stroke={color.hairlineStrong} strokeWidth={1.6} strokeDasharray="5 4" />
          )}
          {/* 主品实线：只连接相邻有值点；缺数不画零值点。 */}
          {!hidden.has('main') && solidSegments.map((segment, segmentIndex) => (
            <path key={`main-solid-${segmentIndex}`} d={pathOf(segment, mainValues)} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2.4} />
          ))}
          {/* 跨缺失段：灰虚线桥接（连接缺失两侧有值点，不冒充实测）。 */}
          {!hidden.has('main') && bridges.map(([from, to], bridgeIndex) => (
            <path
              key={`main-bridge-${bridgeIndex}`}
              d={`M${x(from).toFixed(1)} ${y(mainValues[from] as number).toFixed(1)} L${x(to).toFixed(1)} ${y(mainValues[to] as number).toFixed(1)}`}
              fill="none"
              stroke={color.hairlineStrong}
              strokeWidth={1.4}
              strokeDasharray="2 3"
              opacity={0.85}
            />
          ))}
          {/* 事实锚（参照对象历史窗内的可观测事实，与主图小事件同源色系） */}
          {!hidden.has('facts') && facts.map((fact) => {
            const cx = x(fact.weekIndex);
            const tone = FACT_COLOR[fact.type];
            return (
              <g key={fact.label}>
                <line x1={cx} y1={top} x2={cx} y2={top + plotH} stroke={tone} strokeDasharray="3 4" opacity={0.5} />
                <rect x={cx - 5} y={top + 2} width={10} height={10} rx={2} fill={color.canvas} stroke={tone} strokeWidth={1.3} />
                <title>{`${fact.label}（${fixture.weeks[fact.weekIndex]?.week ?? ''} 周）`}</title>
              </g>
            );
          })}
          <g fontSize={10} fill={color.mute} textAnchor="middle">
            {fixture.weeks.slice(0, HISTORY_LEN).map((week, index) => (index % 2 === 0 || index === HISTORY_LEN - 1
              ? <text key={week.week} x={x(index)} y={CHART_H - 8}>{week.week}</text>
              : null))}
          </g>
        </svg>
      </div>
      <WorkbenchLegend items={legendItems} hidden={hidden} onToggle={toggle} style={{ marginTop: 0 }} />
      <div className="tnum" style={{ marginTop: space.xs, fontSize: 11, color: color.body, minWidth: 0 }}>{historyText}</div>
      {footNote && (
        <div className="tnum" style={{ marginTop: space.xs, fontSize: 11, color: color.mute, minWidth: 0 }}>{footNote}</div>
      )}
    </div>
  );
}

export interface ReferencePanelProps {
  fixture: WorkbenchFixture;
  result: WorkbenchResult;
  /** 受控：params.prevGenReferenceId（状态由页面持有）；基准 = prevGenPool[0]。 */
  prevGenReferenceId: string;
  /** 选择回调：写入 params.prevGenReferenceId，经模型同周龄比值校正主图基线。 */
  onPrevGenReferenceChange: (id: string) => void;
}

export default function ReferencePanel({
  fixture,
  result,
  // 受控值；页面（WP6 集成）接线前回退基准参照，保证渲染安全。
  prevGenReferenceId = fixture.references.prevGenPool[0]?.id ?? '',
  onPrevGenReferenceChange,
}: ReferencePanelProps) {
  // 友商参照 = 卡内查看状态（仅对照与回放），不写入主链。
  const [competitorId, setCompetitorId] = useState(fixture.references.competitorPool[0]?.id ?? '');
  const firstForecastWeek = result.weeks.find((week) => week.status === 'forecast');
  const referenceConsider = firstForecastWeek?.consider.find((item) => item.kind === 'reference');
  const prevGenFootnote = firstForecastWeek && referenceConsider
    ? `主图基线校正 · 首预测周 ${firstForecastWeek.week}：${referenceConsider.note}`
    : undefined;
  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="量价参考"
        hint="历史参照：上一代同期与友商同窗的量价走势 + 可观测事实锚（大促 / 发布 / 调价）；纯历史 · 无预测段。上一代参照经同周龄比值进入主图基线校正。"
        extra={(
          <>
            <span
              title="历史窗演示样本 · 纯历史数据，无预测段"
              style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: color.canvasSoft2, color: color.body }}
            >
              仅历史
            </span>
            <SimChip variant="simHistory" title="参照序列为模拟样本回放，不代表真实市场" />
          </>
        )}
      />
      <IoBar
        input="参照对象历史量价与事实锚（上一代同期 / 友商促销期）"
        output="上一代参照经同周龄比值校正主图基线；友商仅对照；主图小事件录入时回放此处事实"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: space.md }}>
        <ReferenceChart
          fixture={fixture}
          series={fixture.references.prevGenPool}
          selectValue={prevGenReferenceId}
          onSelect={(id) => onPrevGenReferenceChange?.(id)}
          selectLabel="选择上一代参照对象"
          title="上一代上市同期"
          subtitle={`按周龄对齐（同周龄同窗）：主品上市周 vs ${fixture.references.prevGenPool.find((item) => item.id === prevGenReferenceId)?.label ?? fixture.references.prevGenPool[0]?.label ?? ''} 上市同期；选择经同周龄比值校正主图基线`}
          facts={fixture.references.facts.filter((fact) => fact.type !== 'promo')}
          footNote={prevGenFootnote}
        />
        <ReferenceChart
          fixture={fixture}
          series={fixture.references.competitorPool}
          selectValue={competitorId}
          onSelect={setCompetitorId}
          selectLabel="选择友商参照对象"
          title="友商同期量价"
          subtitle="同窗对照 · 仅对照：友商上市 / 促销期的量价事实，用于核对档期应对节奏——不修改主图基线，不对竞品动作做因果归因"
          facts={fixture.references.facts}
        />
      </div>
    </section>
  );
}
