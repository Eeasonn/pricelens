// ============================================================
// 推演工作台 v2 · 层②量价参考（事实还原型输入因子卡，2026-11-03 晚纲领）：
// 尽可能还原事实——参照对象量价走势 + 历史窗内全部可观测事实锚（大促 / 发布 /
// 调价，与主图小事件同源色系）；一定是历史数据、无预测段。
// 参考对象首当其冲是上一代；多参照一行并列。定位 = 主图预测的输入因子
// （修正主图形态与幅度），不是「仅供参考」。
// ============================================================
import { useState } from 'react';
import { Select } from 'antd';
import { brandColor, color, radius, space } from '../../theme/tokens';
import { niceCeil } from '../../dataModel/volume';
import type { ReferenceFactSeed, ReferenceSeriesSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';
import { IoBar, SectionHead, WorkbenchLegend, workbenchCardStyle, type LegendItem } from './WorkbenchBits';

const CHART_W = 560;
const CHART_H = 204;
const HISTORY_LEN = 8;

/** 事实锚色（与主图小事件同源：promo 琥珀 / launch 蓝 / price 墨）。 */
const FACT_COLOR: Record<ReferenceFactSeed['type'], string> = {
  promo: color.warning,
  launch: color.link,
  price: color.ink,
};

function ReferenceChart({ fixture, series, selectValue, onSelect, selectLabel, title, subtitle, facts }: {
  fixture: WorkbenchFixture;
  series: ReferenceSeriesSeed[];
  selectValue: string;
  onSelect: (id: string) => void;
  selectLabel: string;
  title: string;
  subtitle: string;
  facts: ReferenceFactSeed[];
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const active = series.find((item) => item.id === selectValue) ?? series[0];
  const left = 44;
  const right = 14;
  const top = 18;
  const bottom = 26;
  const plotW = CHART_W - left - right;
  const plotH = CHART_H - top - bottom;
  // 纯历史窗（W37–W44）：主品 8 点 + 参照 8 点，无预测段（纲领拍板）。
  const mainValues = fixture.weeks.slice(0, HISTORY_LEN).map((week) => week.sales ?? 0);
  const maxValue = Math.max(1, niceCeil(Math.max(...mainValues, ...active.points.slice(0, HISTORY_LEN)) * 1.15));
  const x = (index: number): number => left + (index + 0.5) * (plotW / HISTORY_LEN);
  const y = (value: number): number => top + plotH * (1 - value / maxValue);
  const line = (values: number[]): string =>
    values.slice(0, HISTORY_LEN).map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  const historyMain = mainValues.reduce((total, value) => total + value, 0);
  const historyRef = active.points.slice(0, HISTORY_LEN).reduce((total, value) => total + value, 0);
  const historyDelta = historyRef > 0 ? (((historyMain / historyRef) - 1) * 100).toFixed(1) : '—';

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
      <div style={{ fontSize: 11, color: color.mute, marginBottom: space.sm }} title={subtitle}>{subtitle}</div>
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          width="100%"
          role="img"
          aria-label={`${title}：主品与${active.label}的历史周销对照（仅 ${fixture.context.historyRange}，无预测段）；历史段累计主品 ${(historyMain / 10000).toFixed(1)} 万台 vs 参照 ${(historyRef / 10000).toFixed(1)} 万台（${Number(historyDelta) > 0 ? '+' : ''}${historyDelta}%）；事实锚 ${facts.map((fact) => fact.label).join('、')}。`}
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
            <path d={line(active.points)} fill="none" stroke={color.hairlineStrong} strokeWidth={1.6} strokeDasharray="5 4" />
          )}
          {!hidden.has('main') && (
            <path d={line(mainValues)} fill="none" stroke={brandColor.HUAWEI} strokeWidth={2.4} />
          )}
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
      <div className="tnum" style={{ marginTop: space.xs, fontSize: 11, color: color.body }}>
        {`历史段（${fixture.context.historyRange}）累计：主品 ${(historyMain / 10000).toFixed(1)} 万台 vs ${active.label} ${(historyRef / 10000).toFixed(1)} 万台（${Number(historyDelta) > 0 ? '+' : ''}${historyDelta}%）`}
      </div>
    </div>
  );
}

export default function ReferencePanel({ fixture, result }: { fixture: WorkbenchFixture; result: WorkbenchResult }) {
  void result;
  const [prevGenId, setPrevGenId] = useState(fixture.references.prevGenPool[0].id);
  const [competitorId, setCompetitorId] = useState(fixture.references.competitorPool[0].id);
  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="量价参考"
        hint="事实还原型输入因子卡：还原参照对象量价走势 + 历史窗内全部可观测事实（大促 / 发布 / 调价，含自家与竞品）；一定是历史数据、无预测段。参考对象首当其冲是上一代，支持多参照一行。"
        extra={<span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: color.canvasSoft2, color: color.body }}>纯历史 · 无预测段</span>}
      />
      <IoBar
        input="参照对象历史量价与事实锚（上一代同期 / 友商促销期）"
        output="主图预测的形态与幅度参照（基线走势形态取自上一代同期）；主图小事件录入时回放此处事实"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: space.md }}>
        <ReferenceChart
          fixture={fixture}
          series={fixture.references.prevGenPool}
          selectValue={prevGenId}
          onSelect={setPrevGenId}
          selectLabel="选择上一代参照对象"
          title="上一代上市同期"
          subtitle={`按周龄对齐：主品 W37 上市周 vs ${fixture.references.prevGenPool.find((item) => item.id === prevGenId)?.label ?? ''}上市周（演示）`}
          facts={fixture.references.facts.filter((fact) => fact.type !== 'promo')}
        />
        <ReferenceChart
          fixture={fixture}
          series={fixture.references.competitorPool}
          selectValue={competitorId}
          onSelect={setCompetitorId}
          selectLabel="选择友商参照对象"
          title="友商同期量价"
          subtitle="同窗对照：友商上市 / 促销期的量价事实（演示），用于核对档期应对节奏——不对竞品动作做因果归因"
          facts={fixture.references.facts}
        />
      </div>
    </section>
  );
}
