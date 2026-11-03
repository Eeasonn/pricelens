// ============================================================
// 推演工作台 v2 · 层③量价参考（可多个）：至少两个参照小图并列——
// 「上一代上市同期」与「友商当年促销」，各自可换参照对象（下拉占位）。
// 参照线只用于人工核对走势形态：基准走势形态取自上一代同期（演示口径），
// 不进计算公式；上一代 W45 起为已发生历史按同周龄映射，不是未来实际。
// ============================================================
import { useState } from 'react';
import { Select } from 'antd';
import { brandColor, color, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { ReferenceSeriesSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';
import { SectionHead, WorkbenchLegend, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

const CHART_W = 560;
const CHART_H = 200;

function ReferenceChart({ fixture, result, series, selectValue, onSelect, selectLabel, title, subtitle }: {
  fixture: WorkbenchFixture;
  result: WorkbenchResult;
  series: ReferenceSeriesSeed[];
  selectValue: string;
  onSelect: (id: string) => void;
  selectLabel: string;
  title: string;
  subtitle: string;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const active = series.find((item) => item.id === selectValue) ?? series[0];
  const weeks = result.weeks;
  const left = 44;
  const right = 14;
  const top = 16;
  const bottom = 26;
  const plotW = CHART_W - left - right;
  const plotH = CHART_H - top - bottom;
  const mainValues = weeks.map((week) => week.final ?? week.sales ?? 0);
  const maxValue = Math.max(1, niceCeil(Math.max(...mainValues, ...active.points) * 1.12));
  const x = (index: number): number => left + (index + 0.5) * (plotW / weeks.length);
  const y = (value: number): number => top + plotH * (1 - value / maxValue);
  const line = (values: number[], from: number, to: number): string =>
    values.slice(from, to + 1).map((value, offset) => `${offset === 0 ? 'M' : 'L'}${x(from + offset).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  const boundaryX = (x(7) + x(8)) / 2;
  const bandStartX = x(9) - plotW / weeks.length / 2 + 2;
  const bandEndX = x(12) + plotW / weeks.length / 2 - 2;
  const historyMain = weeks.slice(0, 8).reduce((total, week) => total + (week.sales ?? 0), 0);
  const historyRef = active.points.slice(0, 8).reduce((total, value) => total + value, 0);
  const historyDelta = historyRef > 0 ? (((historyMain / historyRef) - 1) * 100).toFixed(1) : '—';

  const legendItems: LegendItem[] = [
    { key: 'main', label: '主品周销（实→虚）', shape: 'line', color: brandColor.HUAWEI },
    { key: 'ref', label: active.label, shape: 'dash', color: color.hairlineStrong },
  ];

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
      <div style={{ fontSize: 11, color: color.mute, marginBottom: space.sm }} title={subtitle}>{subtitle}</div>
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          width="100%"
          role="img"
          aria-label={`${title}：主品与${active.label}的周销对照（历史 ${fixture.context.historyRange} 实线、预测 ${fixture.context.forecastRange} 虚线）；历史段累计主品 ${(historyMain / 10000).toFixed(1)} 万台 vs 参照 ${(historyRef / 10000).toFixed(1)} 万台（${Number(historyDelta) > 0 ? '+' : ''}${historyDelta}%）。`}
          style={{ display: 'block', height: 'auto', minWidth: 320 }}
        >
          <rect x={bandStartX} y={top} width={bandEndX - bandStartX} height={plotH} fill={color.warningSoft} opacity={0.45} />
          {[0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line x1={left} y1={y(maxValue * fraction)} x2={CHART_W - right} y2={y(maxValue * fraction)} stroke={fraction === 1 ? color.hairlineStrong : color.hairline} />
              <text x={left - 6} y={y(maxValue * fraction) + 3} fontSize={10} fill={color.mute} textAnchor="end">{Math.round(maxValue * fraction / 10000)}</text>
            </g>
          ))}
          <text x={left - 6} y={top - 4} fontSize={10} fill={color.mute} textAnchor="end">万台</text>
          <line x1={boundaryX} y1={top - 4} x2={boundaryX} y2={top + plotH} stroke={color.hairlineStrong} strokeDasharray="4 4" />
          {!hidden.has('ref') && (
            <path d={line(active.points, 0, weeks.length - 1)} fill="none" stroke={color.hairlineStrong} strokeWidth={1.6} strokeDasharray="5 4" />
          )}
          {!hidden.has('main') && (
            <>
              <path d={line(mainValues, 0, 7)} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2.4} />
              <path d={line(mainValues, 8, weeks.length - 1)} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2.2} strokeDasharray="6 5" />
            </>
          )}
          <g fontSize={10} fill={color.mute} textAnchor="middle" fontWeight={400}>
            {weeks.map((week, index) => (index % 4 === 0 || index === weeks.length - 1
              ? <text key={week.week} x={x(index)} y={CHART_H - 8}>{week.week}</text>
              : null))}
          </g>
        </svg>
      </div>
      <WorkbenchLegend
        items={legendItems}
        hidden={hidden}
        onToggle={(key) => setHidden((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        })}
        style={{ marginTop: 0 }}
      />
      <div className="tnum" style={{ marginTop: space.xs, fontSize: 11, color: color.body }}>
        {`历史段（${fixture.context.historyRange}）累计：主品 ${(historyMain / 10000).toFixed(1)} 万台 vs ${active.label} ${(historyRef / 10000).toFixed(1)} 万台（${Number(historyDelta) > 0 ? '+' : ''}${historyDelta}%）`}
      </div>
    </div>
  );
}

export default function ReferencePanel({ fixture, result }: { fixture: WorkbenchFixture; result: WorkbenchResult }) {
  const [prevGenId, setPrevGenId] = useState(fixture.references.prevGenPool[0].id);
  const [competitorId, setCompetitorId] = useState(fixture.references.competitorPool[0].id);
  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="量价参考"
        hint="参照小图用于人工核对走势形态：基准走势形态取自上一代同期（演示口径），不进计算公式；上一代 W45 起为已发生历史按同周龄映射，不是未来实际。下拉可换参照对象（演示占位）。"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: space.md }}>
        <ReferenceChart
          fixture={fixture}
          result={result}
          series={fixture.references.prevGenPool}
          selectValue={prevGenId}
          onSelect={setPrevGenId}
          selectLabel="选择上一代参照对象"
          title="上一代上市同期"
          subtitle={`按周龄对齐：主品 W37 上市周 vs ${fixture.references.prevGenPool.find((item) => item.id === prevGenId)?.label ?? ''}上市周（演示）`}
        />
        <ReferenceChart
          fixture={fixture}
          result={result}
          series={fixture.references.competitorPool}
          selectValue={competitorId}
          onSelect={setCompetitorId}
          selectLabel="选择友商参照对象"
          title="友商当年促销"
          subtitle="同窗对照：友商上市 / 促销期的量价形态（演示），用于核对档期应对节奏——不对竞品动作做因果归因"
        />
      </div>
    </section>
  );
}
