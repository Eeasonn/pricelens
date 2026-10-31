import { useMemo } from 'react';
import { ArrowRightOutlined, RobotOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import PageHeader from '../components/PageHeader';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { color, fontSize, radius, shadow, space } from '../theme/tokens';

type SignalTone = 'neutral' | 'warning' | 'positive';
interface Signal {
  title: string;
  value: string;
  detail: string;
  tone: SignalTone;
  points: number[];
}

const SIGNALS: Signal[] = [
  { title: '汇率', value: 'USD / CNY 7.18', detail: '近 4 周 +1.6%，本币价格换算压力上升', tone: 'warning', points: [42, 44, 43, 47, 50, 49, 53] },
  { title: '市场需求', value: '中高端需求回升', detail: '高端机型搜索热度连续 3 周改善', tone: 'positive', points: [32, 34, 35, 37, 39, 42, 46] },
  { title: '存储成本', value: 'LPDDR5X +4.2%', detail: '成本端向上，促销空间需要重新核算', tone: 'warning', points: [35, 34, 37, 38, 40, 42, 45] },
  { title: '竞品动态', value: '2 个价格动作', detail: 'Apple 与 Samsung 在 W42 加深促销', tone: 'neutral', points: [48, 47, 48, 46, 45, 44, 43] },
];

const EVENTS = [
  ['W42', 'Samsung', 'Galaxy S25 12+256', '促销加深 3.5pp', '影响中'],
  ['W42', 'Apple', 'iPhone 16 Pro 256GB', '平台价差扩大至 6.1%', '影响高'],
  ['W41', '市场', '高端手机', '搜索热度环比 +8%', '机会'],
  ['W40', '成本', 'LPDDR5X', '供应商报价上调 4.2%', '风险'],
];

function Sparkline({ points, tone, label }: { points: number[]; tone: SignalTone; label: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const barColor = tone === 'warning' ? color.warning : tone === 'positive' ? color.link : color.ink;
  return <div role="img" aria-label={label} style={{ display: 'flex', alignItems: 'end', gap: 3, height: 34 }}>{points.map((point, index) => <span aria-hidden="true" key={`${point}-${index}`} style={{ width: 7, height: `${Math.max(5, ((point - min) / Math.max(1, max - min)) * 26 + 5)}px`, background: barColor, opacity: 0.28 + index / points.length * 0.6, borderRadius: '2px 2px 0 0' }} />)}</div>;
}

function toneColor(tone: SignalTone): string {
  return tone === 'warning' ? '#9a6700' : tone === 'positive' ? '#0053c2' : color.body;
}

export default function IntelligenceCenter() {
  const { state } = useFilters();
  const { openAgent } = useAgent();
  const scope = useMemo(() => `${state.countryCode} · ${state.industry === 'phone' ? '手机' : state.industry}`, [state.countryCode, state.industry]);
  return (
    <div style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }} data-lpl-scroll>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <PageHeader />
        <main style={{ flex: 1, padding: `${space.lg}px`, maxWidth: 1440, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: space.md, flexWrap: 'wrap' }}>
            <div><h1 style={{ margin: 0, fontSize: fontSize.displaySm, color: color.ink }}>情报中心</h1><div style={{ marginTop: 5, fontSize: 12, color: color.mute }}>{scope} · W42 最新情报</div></div>
            <Tag color="blue" style={{ marginLeft: 'auto' }}>演示数据</Tag>
            <Button icon={<RobotOutlined />} onClick={() => openAgent('full', '总结当前情报中心的关键变化，并指出对价格和库存的影响')}>让 Agent 总结</Button>
          </div>
          <section style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg, marginBottom: space.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: space.md }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>市场信号</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>把外部事件整理成可跟进的价格线索</div></div><span style={{ fontSize: 11, color: color.mute }}>演示数据 · 更新时间：2026-10-30 18:00（北京时间）</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: space.md }}>
              {SIGNALS.map((signal) => <article key={signal.title} style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: space.md, minHeight: 130 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ fontSize: 12, color: color.mute }}>{signal.title}</span><Sparkline points={signal.points} tone={signal.tone} label={`${signal.title}近 4 周趋势`} /></div><div style={{ marginTop: 4, fontSize: 17, fontWeight: 600, color: color.ink }}>{signal.value}</div><div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5, color: toneColor(signal.tone) }}>{signal.detail}</div></article>)}
            </div>
          </section>
          <section style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: space.md }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>事件流</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>按发生周查看可能影响价格的事件</div></div><span style={{ flex: 1 }} /><button type="button" onClick={() => openAgent('dock', '解释情报中心最近一条事件对当前产品价格的影响')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: color.link, cursor: 'pointer', fontSize: 12 }}>解释这组事件 <ArrowRightOutlined /></button></div>
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 12 }}><thead><tr>{['周次', '来源', '对象', '事件', '判断'].map((head) => <th key={head} style={{ textAlign: 'left', padding: '8px 6px', color: color.mute, fontWeight: 500, borderBottom: `1px solid ${color.hairline}` }}>{head}</th>)}</tr></thead><tbody>{EVENTS.map((event) => <tr key={`${event[0]}-${event[1]}-${event[2]}`}>{event.map((cell, index) => <td key={`${event[0]}-${index}`} style={{ padding: '10px 6px', color: index === 4 ? color.ink : color.body, borderBottom: `1px solid ${color.hairline}`, fontWeight: index === 4 ? 600 : 400 }}>{cell}</td>)}</tr>)}</tbody></table></div>
          </section>
          <div style={{ marginTop: space.md, fontSize: 11, color: color.mute }}>口径说明：本页内容为演示情报，进入真实接入后会显示来源、采集时间和证据链接。</div>
        </main>
      </div>
    </div>
  );
}
