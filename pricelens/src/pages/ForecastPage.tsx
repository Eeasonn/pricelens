import { useMemo, useState, type ReactNode } from 'react';
import { RobotOutlined } from '@ant-design/icons';
import { Button, Slider, Tag } from 'antd';
import PageHeader from '../components/PageHeader';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { scopeLabels } from '../dataModel/scope';
import { color, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';

export interface ForecastOutput {
  price: number;
  demand: number;
  low: number;
  base: number;
  high: number;
  supplyCap: number;
}

/** 轻量确定性预测：用于演示 what-if 交互，假设和结果都在页面显式展示。 */
export function forecastAtPrice(price: number, basePrice = 499, baseDemand = 4600, elasticity = -1.85, supplyCap = 7200): ForecastOutput {
  const unconstrained = Math.max(0, baseDemand * Math.pow(Math.max(0.2, price / basePrice), elasticity));
  const supply = Math.min(unconstrained, supplyCap);
  return { price, demand: Math.round(unconstrained), low: Math.round(supply * 0.86), base: Math.round(supply), high: Math.round(Math.min(supplyCap, supply * 1.12)), supplyCap };
}

export interface RollingForecastInput {
  price: number;
  marketTrendPct: number;
  competitionAdjustmentPct: number;
  supplyCap: number;
  /** 成本情景只描述成本压力，不直接当作终端需求变化。 */
  costTrendPct: number;
  horizon?: number;
  basePrice?: number;
  baseDemand?: number;
  elasticity?: number;
  startWeek?: number;
}

export interface RollingForecastWeek {
  label: string;
  unconstrainedDemand: number;
  low: number;
  high: number;
  supplyCap: number;
  actualSales: number;
  cumulativeCostPct: number;
}

export interface RollingForecastOutput {
  weeks: RollingForecastWeek[];
  totalFourWeekSales: number;
  supplyRatePct: number;
  price: number;
  marketTrendPct: number;
  competitionAdjustmentPct: number;
  supplyCap: number;
  costTrendPct: number;
  baseDemand: number;
  elasticity: number;
}

/**
 * Roadshow 量价模型：价格弹性先生成无约束需求，再叠加终端大盘与竞品情景，
 * 最后由每周供应上限裁剪为实际 SO。成本情景保留为可追溯输入，避免把成本
 * 直接误写成需求变化；后续接入成本传导模型时可替换该独立变量。
 */
export function rollingForecast(input: RollingForecastInput): RollingForecastOutput {
  const horizon = Math.max(1, Math.round(input.horizon ?? 8));
  const basePrice = input.basePrice ?? 499;
  const baseDemand = input.baseDemand ?? 4600;
  const elasticity = input.elasticity ?? -1.85;
  const supplyCap = Math.max(0, Math.round(input.supplyCap));
  const { marketTrendPct, competitionAdjustmentPct, costTrendPct } = input;
  const priceFactor = Math.pow(Math.max(0.2, input.price / basePrice), elasticity);
  const weeks = Array.from({ length: horizon }, (_, index) => {
    const unconstrainedDemand = Math.max(
      0,
      Math.round(baseDemand * priceFactor * (1 + index * 0.025) * (1 + marketTrendPct / 100) * (1 + competitionAdjustmentPct / 100)),
    );
    const actualSales = Math.min(unconstrainedDemand, supplyCap);
    return {
      label: `W${(input.startWeek ?? 43) + index}`,
      unconstrainedDemand,
      low: Math.round(unconstrainedDemand * 0.88),
      high: Math.round(unconstrainedDemand * 1.12),
      supplyCap,
      actualSales,
      cumulativeCostPct: Math.round(costTrendPct * (index + 1) * 10) / 10,
    };
  });
  const demandTotal = weeks.reduce((total, week) => total + week.unconstrainedDemand, 0);
  const salesTotal = weeks.reduce((total, week) => total + week.actualSales, 0);
  return {
    weeks,
    totalFourWeekSales: weeks.slice(0, 4).reduce((total, week) => total + week.actualSales, 0),
    supplyRatePct: demandTotal > 0 ? Math.round((salesTotal / demandTotal) * 100) : 0,
    price: input.price,
    marketTrendPct,
    competitionAdjustmentPct,
    supplyCap,
    costTrendPct,
    baseDemand,
    elasticity,
  };
}

function formatSignedPct(value: number, digits = 1): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function Bar({ label, value, max, colorValue }: { label: string; value: number; max: number; colorValue: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr 56px', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ color: color.body }}>{label}</span>
      <div style={{ height: 12, borderRadius: 9999, background: color.canvasSoft2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(2, Math.min(100, value / Math.max(1, max) * 100))}%`, height: '100%', background: colorValue, borderRadius: 9999, transition: 'width 160ms ease' }} />
      </div>
      <span className="tnum" style={{ textAlign: 'right', color: color.ink }}>{value.toLocaleString()}</span>
    </div>
  );
}

function ControlRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
        <span style={{ color: color.body }}>{label}</span>
        <strong className="tnum" style={{ color: color.ink }}>{display}</strong>
      </div>
      <Slider
        ariaLabelForHandle={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(next) => onChange(Number(next))}
        tooltip={{ formatter: (next) => String(next ?? '') }}
      />
    </div>
  );
}

function ModelChain() {
  const nodes = [
    '价格节点',
    '量变化',
    '动态弹性',
    '成本 / 真实大盘',
    '竞品格局修正',
    '无约束需求',
    '供应锁量',
    '实际 SO',
  ];
  return (
    <div aria-label="量价预测模型链" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      {nodes.map((node, index) => (
        <span key={node} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ padding: '5px 8px', border: `1px solid ${index === 2 || index === 4 || index > 6 ? selectAccent : color.hairline}`, borderRadius: radius.control, background: index === 2 || index === 4 || index > 6 ? selectSoft : color.canvas, color: index === 2 || index === 4 || index > 6 ? selectSoftInk : color.body, fontSize: 11, fontWeight: index === 2 || index === 4 || index > 6 ? 600 : 400, whiteSpace: 'nowrap' }}>{node}</span>
          {index < nodes.length - 1 && <span aria-hidden style={{ color: color.mute }}>→</span>}
        </span>
      ))}
    </div>
  );
}

function RollingForecastChart({ result }: { result: RollingForecastOutput }) {
  const width = 760;
  const height = 290;
  const left = 48;
  const right = 16;
  const top = 30;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, ...result.weeks.flatMap((week) => [week.high, week.supplyCap])) * 1.08;
  const x = (index: number): number => left + (index / Math.max(1, result.weeks.length - 1)) * plotWidth;
  const y = (value: number): number => top + plotHeight - (value / maxValue) * plotHeight;
  const line = (values: number[]): string => values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  const upper = result.weeks.map((week) => week.high);
  const lower = result.weeks.map((week) => week.low);
  const area = `${line(upper)} ${lower.slice().reverse().map((value, index) => `L${x(lower.length - index - 1).toFixed(1)} ${y(value).toFixed(1)}`).join(' ')} Z`;
  const gridValues = [0.25, 0.5, 0.75, 1];
  const aria = `未来 ${result.weeks.length} 周销量预测；首周无约束需求 ${result.weeks[0]?.unconstrainedDemand.toLocaleString() ?? 0} 台，供应上限 ${result.supplyCap.toLocaleString()} 台，实际 SO ${result.weeks[0]?.actualSales.toLocaleString() ?? 0} 台`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={aria} style={{ display: 'block', width: '100%', minWidth: 560, height: 'auto' }}>
      <path d={area} fill={selectSoft} opacity="0.72" />
      <g stroke={color.hairline}>
        {gridValues.map((fraction) => <line key={fraction} x1={left} y1={y(maxValue * fraction)} x2={width - right} y2={y(maxValue * fraction)} />)}
      </g>
      <path d={line(result.weeks.map((week) => week.unconstrainedDemand))} fill="none" stroke={color.link} strokeWidth="2.2" strokeDasharray="6 4" />
      <path d={line(result.weeks.map((week) => week.supplyCap))} fill="none" stroke={color.hairlineStrong} strokeWidth="1.8" strokeDasharray="3 4" />
      <path d={line(result.weeks.map((week) => week.actualSales))} fill="none" stroke="#c7000b" strokeWidth="3" />
      {result.weeks.map((week, index) => <circle key={week.label} cx={x(index)} cy={y(week.actualSales)} r="3.5" fill="#c7000b" />)}
      <g fill={color.mute} fontSize="10" textAnchor="middle">
        {result.weeks.map((week, index) => <text key={week.label} x={x(index)} y={height - 14}>{week.label}</text>)}
      </g>
      <g fontSize="10" fill={color.mute}>
        <text x={left} y="15">无约束需求</text><line x1={left + 75} y1="11" x2={left + 98} y2="11" stroke={color.link} strokeDasharray="5 3" />
        <text x={left + 115} y="15">供应上限</text><line x1={left + 170} y1="11" x2={left + 193} y2="11" stroke={color.hairlineStrong} strokeDasharray="3 3" />
        <text x={left + 210} y="15">实际 SO</text><line x1={left + 250} y1="11" x2={left + 273} y2="11" stroke="#c7000b" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

interface Cause {
  title: string;
  body: string;
  evidence: string;
  tone: 'strong' | 'medium' | 'pending';
}

const CAUSES: Cause[] = [
  { title: '供应约束可能直接限制实际 SO', body: '本周锁量模拟下调 18%；即使无约束需求不变，实际 SO 也可能下降。', evidence: '证据较强', tone: 'strong' },
  { title: '主要竞品价促可能分流需求', body: 'iPhone 17 Pro 模拟降价 7.8% 并叠加权益，可能削弱我品相对竞争力。', evidence: '证据中等', tone: 'medium' },
  { title: '档位规模下降不一定等于需求流失', body: '$400–600 档位模拟缩减 6%，同期 2 款产品退出或迁移档位；真实终端需求与构成效应尚待拆分。', evidence: '待核实', tone: 'pending' },
  { title: '新品进入也可能改变竞争基盘', body: '新进入产品带来档位规模增长时，我品仍可能因份额被稀释而下滑。', evidence: '待核实', tone: 'pending' },
];

const causeTone: Record<Cause['tone'], { background: string; border: string; text: string }> = {
  strong: { background: color.warningSoft, border: '#ead2a8', text: '#805b00' },
  medium: { background: selectSoft, border: '#c7ddff', text: selectSoftInk },
  pending: { background: color.canvasSoft2, border: color.hairline, text: color.body },
};

function CauseCard({ cause }: { cause: Cause }) {
  const tone = causeTone[cause.tone];
  return (
    <article style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: space.md, display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 13, color: color.ink }}>{cause.title}</strong>
        <span style={{ marginLeft: 'auto', flexShrink: 0, padding: '2px 6px', border: `1px solid ${tone.border}`, borderRadius: radius.control, background: tone.background, color: tone.text, fontSize: 10 }}>{cause.evidence}</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: color.body }}>{cause.body}</div>
    </article>
  );
}

export default function ForecastPage() {
  const { state } = useFilters();
  const { openAgent } = useAgent();
  const labels = scopeLabels(state);
  const [price, setPrice] = useState(499);
  const [marketTrendPct, setMarketTrendPct] = useState(2);
  const [competitionAdjustmentPct, setCompetitionAdjustmentPct] = useState(0);
  const [supplyCap, setSupplyCap] = useState(3800);
  const [costTrendPct, setCostTrendPct] = useState(0.6);
  const [scenarioApplied, setScenarioApplied] = useState(false);
  const rolling = useMemo(() => rollingForecast({ price, marketTrendPct, competitionAdjustmentPct, supplyCap, costTrendPct }), [price, marketTrendPct, competitionAdjustmentPct, supplyCap, costTrendPct]);
  const next = rolling.weeks[0];
  const priceText = formatPrice(price, state.currency);
  const applyScenario = (): void => {
    setMarketTrendPct(-2);
    setCompetitionAdjustmentPct(-5);
    setSupplyCap(3200);
    setScenarioApplied(true);
  };
  const inputControls: ReactNode = (
    <div style={{ display: 'grid', gap: space.md, marginTop: space.md }}>
      <ControlRow label="Pura 90s Pro 给定价格" value={price} display={priceText} min={449} max={549} step={10} onChange={setPrice} ariaLabel="Pura 90s Pro 给定价格" />
      <ControlRow label="终端大盘周趋势" value={marketTrendPct} display={formatSignedPct(marketTrendPct)} min={-5} max={8} step={1} onChange={setMarketTrendPct} ariaLabel="终端大盘周趋势" />
      <ControlRow label="竞品格局修正" value={competitionAdjustmentPct} display={formatSignedPct(competitionAdjustmentPct, 0)} min={-12} max={6} step={1} onChange={setCompetitionAdjustmentPct} ariaLabel="主要竞品变化对需求的模拟修正" />
      <ControlRow label="每周锁量 / 供应上限" value={supplyCap} display={`${supplyCap.toLocaleString()} 台`} min={2400} max={6000} step={200} onChange={setSupplyCap} ariaLabel="每周供应上限" />
      <ControlRow label="单台成本情景" value={costTrendPct} display={`${formatSignedPct(costTrendPct)} / 周`} min={-2} max={3} step={0.1} onChange={setCostTrendPct} ariaLabel="单台成本每周变化情景" />
      <div style={{ fontSize: 11, lineHeight: 1.55, color: color.mute }}>成本压力进入价格传导与可行价格边界分析，不直接等同于终端需求变化；当前累计成本压力为 {formatSignedPct(next?.cumulativeCostPct ?? 0)}。</div>
    </div>
  );
  return (
    <div style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }} data-lpl-scroll>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <PageHeader />
        <main style={{ flex: 1, padding: `${space.lg}px`, maxWidth: 1280, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: space.md, flexWrap: 'wrap' }}>
            <div><h1 style={{ margin: 0, fontSize: fontSize.displaySm, color: color.ink }}>量价预测</h1><div style={{ marginTop: 5, fontSize: 12, color: color.mute }}>{labels.country} · Pura 90s Pro 12+512 · 未来 8 周滚动情景</div></div>
            <Tag color="blue" style={{ marginLeft: 'auto' }}>演示模型</Tag>
            <Button icon={<RobotOutlined />} onClick={() => openAgent('full', '解释当前量价预测的关键假设，并指出最需要验证的风险')}>让 Agent 解释</Button>
          </div>

          <section data-lpl-forecast-grid style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.8fr) minmax(360px, 1.2fr)', gap: space.md, alignItems: 'stretch' }}>
            <div style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}>
              <h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>预测输入</h2>
              <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: color.mute }}>调整独立情景变量，观察需求、供应约束和实际 SO 如何变化。</p>
              {inputControls}
            </div>
            <div style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>未来 8 周滚动销量预测</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>给定价格 → 动态弹性 → 大盘与竞争修正 → 无约束需求 → 供应锁量 → 实际 SO</div></div><span style={{ marginLeft: 'auto', fontSize: 11, color: color.link }}>每周滚动重估</span></div>
              <div style={{ marginTop: space.md, overflowX: 'auto' }}><RollingForecastChart result={rolling} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: space.md }}>
                {[['未来 4 周实际 SO', `${(rolling.totalFourWeekSales / 1000).toFixed(1)}K`], ['供应满足率', `${rolling.supplyRatePct}%`], ['动态弹性', rolling.elasticity.toFixed(2)], ['预测更新', 'W42']].map(([label, value]) => <div key={label} style={{ padding: '9px 10px', border: `1px solid ${color.hairline}`, borderRadius: radius.control }}><div style={{ fontSize: 10, color: color.mute }}>{label}</div><strong className="tnum" style={{ display: 'block', marginTop: 3, fontSize: 15, color: color.ink }}>{value}</strong></div>)}
              </div>
              <div style={{ marginTop: space.md, padding: '9px 11px', borderRadius: radius.control, background: color.canvasSoft, fontSize: 11, lineHeight: 1.6, color: color.body }}>虚线为无约束需求与供应上限，红线为受供应约束后的实际 SO；蓝色带为模拟置信范围（需求 ±12%）。实际 SO 不会超过供应上限。</div>
            </div>
          </section>

          <section style={{ marginTop: space.md, background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: space.md, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>模型链</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>把情报、价格与供给拆成可单独调整的模型输入</div></div><span style={{ marginLeft: 'auto', fontSize: 11, color: color.mute }}>基准需求 {rolling.baseDemand.toLocaleString()} 台 · 弹性 {rolling.elasticity.toFixed(2)}</span></div>
            <ModelChain />
          </section>

          <section style={{ marginTop: space.md, background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: space.md, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>本周 SO 下滑的可能原因</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>Pura 90s Pro · 2026W42 · 按证据强弱排列，不把相关关系写成确定因果</div></div><Button type="primary" style={{ marginLeft: 'auto' }} onClick={applyScenario}>作为情景纳入预测</Button></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: space.md }}>{CAUSES.map((cause) => <CauseCard key={cause.title} cause={cause} />)}</div>
      <div style={{ marginTop: space.md, padding: '10px 12px', borderLeft: `2px solid ${color.link}`, background: selectSoft, fontSize: 12, lineHeight: 1.65, color: color.body }}><strong style={{ color: color.ink }}>谨慎结论：</strong>本周下滑可能与供应收紧、竞品价促和档位构成变化共同相关。当前信息无法确定主因，情景变量应分别纳入并滚动重估，而不是简单相加。</div>
            {scenarioApplied && <div role="status" style={{ marginTop: 8, fontSize: 11, color: selectSoftInk }}>已作为情景纳入：大盘 −2%、竞品修正 −5%、供应上限 3,200 台；这不是因果确认。</div>}
          </section>

          <section style={{ marginTop: space.md, background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>模型口径</h2><span style={{ fontSize: 11, color: color.mute }}>可追溯假设</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: space.md, marginTop: space.md }}>
              {[['需求基准', `${rolling.baseDemand.toLocaleString()} 台`], ['价格弹性', rolling.elasticity.toFixed(2)], ['供应上限', `${rolling.supplyCap.toLocaleString()} 台`], ['成本情景', `${formatSignedPct(rolling.costTrendPct)} / 周`]].map(([label, value]) => <div key={label} style={{ padding: 12, border: `1px solid ${color.hairline}`, borderRadius: radius.card }}><div style={{ fontSize: 11, color: color.mute }}>{label}</div><div className="tnum" style={{ marginTop: 5, fontSize: 16, fontWeight: 600, color: color.ink }}>{value}</div></div>)}
            </div>
            <div style={{ marginTop: space.md, fontSize: 11, color: color.mute }}>本页为演示预测。真实接入后应展示模型版本、训练时间、误差区间和可替换的业务假设；成本影响价格传导与可行价格边界，不直接等同于需求变化。</div>
          </section>
        </main>
      </div>
    </div>
  );
}
