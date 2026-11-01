// ============================================================
// What-if 本地草稿：价格变化 / 促销强度增量 / 可供量变化三个独立滑杆。
// 只在本地对预测窗口（当前周之后）重算，不写入真实数据与外部系统；
// 重置恢复基准。三个变量独立生效：成本与竞品事件不可通过草稿修改。
// ============================================================
import { Button, Slider } from 'antd';
import { color, fontSize, radius, space } from '../../theme/tokens';
import type { ScenarioDraft, ScenarioSummary } from './forecastModel';
import { fmtMoney, fmtUnits } from './ForecastBits';

interface SliderSpec {
  key: keyof ScenarioDraft;
  label: string;
  ariaLabel: string;
  min: number;
  max: number;
  hints: [string, string, string];
  format: (value: number) => string;
}

const SLIDERS: SliderSpec[] = [
  {
    key: 'priceDeltaPct',
    label: '消费者感知价格变化',
    ariaLabel: '消费者感知价格变化（百分比，仅预测窗口生效）',
    min: -10,
    max: 10,
    hints: ['降价 10%', '基准', '涨价 10%'],
    format: (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`,
  },
  {
    key: 'promoDeltaPct',
    label: '促销强度增量',
    ariaLabel: '促销强度增量（百分点，仅预测窗口生效）',
    min: 0,
    max: 15,
    hints: ['无增量', '当前基准', '+15'],
    format: (value) => `+${value}`,
  },
  {
    key: 'supplyDeltaPct',
    label: '可供量变化',
    ariaLabel: '可供量变化（百分比，仅预测窗口生效）',
    min: -20,
    max: 20,
    hints: ['−20%', '基准', '+20%'],
    format: (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`,
  },
];

export default function WhatIfDraft({
  draft,
  scenario,
  forecastRangeLabel,
  onChange,
  onReset,
}: {
  draft: ScenarioDraft;
  scenario: ScenarioSummary;
  forecastRangeLabel: string;
  onChange: (patch: Partial<ScenarioDraft>) => void;
  onReset: () => void;
}) {
  return (
    <div style={{ display: 'grid', gap: space.md, alignContent: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: scenario.active ? color.warningInk : color.mute, background: scenario.active ? color.warningSoft : color.canvasSoft2, padding: '2px 8px', borderRadius: radius.pill }}>
          {scenario.active ? '本地草稿已修改' : '本地草稿'}
        </span>
        <span style={{ fontSize: 11, color: color.mute }}>作用于预测窗口 {forecastRangeLabel}，实际周不可改写</span>
      </div>
      {SLIDERS.map((slider) => (
        <div key={slider.key} style={{ display: 'grid', gap: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
            <span style={{ color: color.body }}>{slider.label}</span>
            <strong className="tnum" style={{ color: color.ink }}>{slider.format(draft[slider.key])}</strong>
          </div>
          <Slider
            ariaLabelForHandle={slider.ariaLabel}
            aria-label={slider.label}
            min={slider.min}
            max={slider.max}
            step={1}
            value={draft[slider.key]}
            onChange={(next) => onChange({ [slider.key]: Number(next) } as Partial<ScenarioDraft>)}
            tooltip={{ formatter: (next) => slider.format(Number(next ?? 0)) }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: color.mute }}>
            {slider.hints.map((hint) => <span key={hint}>{hint}</span>)}
          </div>
        </div>
      ))}
      <div style={{ display: 'grid', gap: 6, padding: `${space.md - 2}px ${space.md}px`, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
        {[
          { label: `剩余预测 SO（${forecastRangeLabel}）`, value: `${fmtUnits(scenario.forecastSo)} 台`, signed: `${scenario.soDelta > 0 ? '+' : scenario.soDelta < 0 ? '−' : ''}${fmtUnits(Math.abs(scenario.soDelta))} 台 vs 基准` },
          { label: '剩余预测销毛变化', value: `${scenario.marginDelta > 0 ? '+' : scenario.marginDelta < 0 ? '−' : ''}${fmtMoney(Math.abs(scenario.marginDelta))}`, signed: `基准 ${fmtMoney(scenario.baselineMargin)}` },
          { label: '草稿下风险周', value: scenario.riskWeeks.length ? scenario.riskWeeks.slice(0, 6).join('、') : '暂无', signed: '可供量低于无约束需求的预测周' },
        ].map((row) => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
            <span style={{ color: color.mute }}>{row.label}</span>
            <span className="tnum" style={{ textAlign: 'right', color: color.ink, fontWeight: 600 }}>{row.value}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
        <Button onClick={onReset} disabled={!scenario.active}>重置草稿</Button>
        <span style={{ fontSize: fontSize.caption, lineHeight: 1.5, color: color.mute }}>草稿只在本地重算，不写入真实数据或外部系统；成本与竞品事件不可通过草稿修改。</span>
      </div>
    </div>
  );
}
