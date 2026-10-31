import { useMemo, useState } from 'react';
import { RobotOutlined } from '@ant-design/icons';
import { Button, Slider, Tag } from 'antd';
import PageHeader from '../components/PageHeader';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { color, fontSize, formatPrice, radius, shadow, space } from '../theme/tokens';

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

function Bar({ label, value, max, colorValue }: { label: string; value: number; max: number; colorValue: string }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr 56px', alignItems: 'center', gap: 8, fontSize: 12 }}><span style={{ color: color.body }}>{label}</span><div style={{ height: 12, borderRadius: 9999, background: color.canvasSoft2, overflow: 'hidden' }}><div style={{ width: `${Math.max(2, Math.min(100, value / max * 100))}%`, height: '100%', background: colorValue, borderRadius: 9999, transition: 'width 160ms ease' }} /></div><span className="tnum" style={{ textAlign: 'right', color: color.ink }}>{value.toLocaleString()}</span></div>;
}

export default function ForecastPage() {
  const { state } = useFilters();
  const { openAgent } = useAgent();
  const [price, setPrice] = useState(499);
  const result = useMemo(() => forecastAtPrice(price), [price]);
  const priceText = formatPrice(result.price, state.currency);
  return (
    <div style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }} data-lpl-scroll>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <PageHeader />
        <main style={{ flex: 1, padding: `${space.lg}px`, maxWidth: 1280, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: space.md, flexWrap: 'wrap' }}><div><h1 style={{ margin: 0, fontSize: fontSize.displaySm, color: color.ink }}>量价预测</h1><div style={{ marginTop: 5, fontSize: 12, color: color.mute }}>{state.countryCode} · 演示模型：Pura 90s Pro 12+512 · 下一周情景推演</div></div><Tag color="blue" style={{ marginLeft: 'auto' }}>演示模型</Tag><Button icon={<RobotOutlined />} onClick={() => openAgent('full', '解释当前量价预测的关键假设，并指出最需要验证的风险')}>让 Agent 解释</Button></div>
          <section data-lpl-forecast-grid style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.8fr) minmax(360px, 1.2fr)', gap: space.md, alignItems: 'stretch' }}>
            <div style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>价格情景</h2><p style={{ margin: '6px 0 22px', fontSize: 12, lineHeight: 1.5, color: color.mute }}>拖动价格，观察需求与可售销量如何变化。模型使用历史弹性做方向性判断。</p><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 12, color: color.mute }}>建议零售价</span><strong className="tnum" style={{ fontSize: 26, color: color.ink }}>{priceText}</strong></div><Slider ariaLabelForHandle="建议零售价" min={399} max={599} step={10} value={price} onChange={(value) => setPrice(Number(value))} tooltip={{ formatter: (value) => formatPrice(Number(value), state.currency) }} /><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: color.mute }}><span>{formatPrice(399, state.currency)}</span><span>{formatPrice(599, state.currency)}</span></div><div style={{ marginTop: 28, display: 'grid', gap: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: color.mute }}>历史基准需求</span><strong>{result.demand.toLocaleString()} 台</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: color.mute }}>可售上限</span><strong>{result.supplyCap.toLocaleString()} 台</strong></div></div></div>
            <div style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}><div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>预测结果</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>下一周可售销量区间</div></div><span style={{ flex: 1 }} /><span style={{ fontSize: 11, color: color.mute }}>置信区间为演示口径</span></div><div style={{ marginTop: 28, display: 'grid', gap: 18 }}><Bar label="低位" value={result.low} max={result.supplyCap} colorValue="#9dbbe8" /><Bar label="基准" value={result.base} max={result.supplyCap} colorValue={color.link} /><Bar label="高位" value={result.high} max={result.supplyCap} colorValue="#75a8f0" /></div><div style={{ marginTop: 28, padding: '10px 12px', borderRadius: radius.control, background: color.canvasSoft, fontSize: 12, lineHeight: 1.6, color: color.body }}>当前价格下，理论需求约 <strong style={{ color: color.ink }}>{result.demand.toLocaleString()} 台</strong>，受供给上限约束后，建议以 <strong style={{ color: color.ink }}>{result.base.toLocaleString()} 台</strong> 作为备货基准。</div></div>
          </section>
          <section style={{ marginTop: space.md, background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}><div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>模型口径</h2><span style={{ fontSize: 11, color: color.mute }}>可追溯假设</span></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: space.md, marginTop: space.md }}>{[['需求基准', '4,600 台'], ['价格弹性', '-1.85'], ['供给上限', '7,200 台'], ['履约率', '90%']].map(([label, value]) => <div key={label} style={{ padding: 12, border: `1px solid ${color.hairline}`, borderRadius: radius.card }}><div style={{ fontSize: 11, color: color.mute }}>{label}</div><div className="tnum" style={{ marginTop: 5, fontSize: 16, fontWeight: 600, color: color.ink }}>{value}</div></div>)}</div><div style={{ marginTop: space.md, fontSize: 11, color: color.mute }}>本页为演示预测，真实接入后会展示模型版本、训练时间、误差区间和可替换的业务假设。</div></section>
        </main>
      </div>
    </div>
  );
}
