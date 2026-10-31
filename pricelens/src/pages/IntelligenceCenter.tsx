import { useMemo } from 'react';
import { ArrowRightOutlined, RobotOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import PageHeader from '../components/PageHeader';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { usePage } from '../state/PageContext';
import { dimTime } from '../data';
import { getLocalCurrency } from '../state/fx';
import { scopeLabels } from '../dataModel/scope';
import { color, fontSize, radius, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';

type SignalTone = 'neutral' | 'warning' | 'positive';
type DataStatus = '真实' | '模拟' | '混合';
interface Signal {
  title: string;
  value: string;
  detail: string;
  tone: SignalTone;
  points: number[];
  status: DataStatus;
  source: string;
}

interface NewProduct {
  id: string;
  brand: string;
  name: string;
  stage: '即将发布' | '全球已发布' | '本国已上市' | '状态待确认';
  date: string;
  launchPrice: string;
  priceBand: string;
  summary: string;
  status: DataStatus;
  source: string;
}

interface Kpi {
  title: string;
  value: string;
  detail: string;
  status: DataStatus;
  source: string;
}

const FX_WEEKLY = [
  78.4, 77.8, 76.9, 75.4, 74.8, 72.1, 70.7902, 72.2, 74.1, 76.8, 78.5, 80.4,
  82.2, 84.6, 86.9963, 85.9, 84.8, 85.4811, 84, 83.2, 82.1, 81.4, 81, 80.8664,
];

const MARKET_BANDS = [
  ['<$300', '612', '+2%', '18%'],
  ['$300–600', '498', '+5%', '24%'],
  ['$600–1K', '351', '+4%', '16%'],
  ['$1K+', '229', '−1%', '9%'],
  ['$2K+', '170', '+8%', '3%'],
];

const STORAGE_FORECAST = [
  ['1Q26', '90–95', '55–60'],
  ['2Q26', '58–63', '70–75'],
  ['3Q26', '13–18', '10–15'],
  ['4Q26', '10–15', '15–20'],
];

const SIGNALS: Signal[] = [
  { title: '汇率', value: 'USD / RUB 80.8664', detail: '选定区间内 −5.4%，本币换算压力回落但仍需观察', tone: 'warning', points: [42, 44, 43, 47, 50, 49, 53], status: '模拟', source: '演示 CBR 序列 · 2026-10-29' },
  { title: '市场需求', value: '中高端需求回升', detail: '高端机型搜索热度连续 3 周改善', tone: 'positive', points: [32, 34, 35, 37, 39, 42, 46], status: '模拟', source: '演示情报' },
  { title: '存储成本', value: 'LPDDR5X +4.2%', detail: '成本端向上，促销空间需要重新核算', tone: 'warning', points: [35, 34, 37, 38, 40, 42, 45], status: '混合', source: '行业趋势 · 模拟映射' },
  { title: '竞品动态', value: '2 个价格动作', detail: 'Apple 与 Samsung 在 W42 加深促销', tone: 'neutral', points: [48, 47, 48, 46, 45, 44, 43], status: '模拟', source: '演示情报' },
];

const EVENTS = [
  ['W42', 'Samsung', 'Galaxy S25 12+256', '促销加深 3.5pp', '影响中'],
  ['W42', 'Apple', 'iPhone 16 Pro 256GB', '平台价差扩大至 6.1%', '影响高'],
  ['W41', '市场', '高端手机', '搜索热度环比 +8%', '机会'],
  ['W40', '成本', 'LPDDR5X', '供应商报价上调 4.2%', '风险'],
];

/** 新品情报只保留可核对的阶段，不把全球发布误写成本国上市。 */
const NEW_PRODUCTS: NewProduct[] = [
  {
    id: 'iphone-duo',
    brand: 'Apple',
    name: 'iPhone Duo',
    stage: '全球已发布',
    date: '10 月 23 日首批上市 · R国待确认',
    launchPrice: 'USD 1,999 起',
    priceBand: '$2K+ 档',
    summary: '可作为超高端价格锚，需观察 R国渠道供货与本地定价。',
    status: '混合',
    source: 'Apple 官方发布摘要 · R国暂无快照',
  },
  {
    id: 'galaxy-next',
    brand: 'Samsung',
    name: 'Galaxy S26 Ultra',
    stage: '即将发布',
    date: '预计 2027 Q1 · 日期待确认',
    launchPrice: '待确认',
    priceBand: '高端旗舰',
    summary: '若延续上一代价位，可能改变高端竞品促销节奏。',
    status: '模拟',
    source: '演示情景 · 待官方确认',
  },
  {
    id: 'pura-next',
    brand: 'HUAWEI',
    name: 'Pura 系列下一代',
    stage: '状态待确认',
    date: '暂无可靠上市日期',
    launchPrice: '待确认',
    priceBand: '当前产品价格带',
    summary: '先保留关注位，补齐官方资料后再进入预测情景。',
    status: '混合',
    source: '内部关注项 · 暂无快照',
  },
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

function statusColor(status: DataStatus): { color: string; background: string } {
  if (status === '真实') return { color: selectSoftInk, background: selectSoft };
  if (status === '混合') return { color: '#805b00', background: color.warningSoft };
  return { color: color.mute, background: color.canvasSoft2 };
}

function StatusBadge({ status }: { status: DataStatus }) {
  const tone = statusColor(status);
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px', borderRadius: radius.pill, color: tone.color, background: tone.background, fontSize: 10, lineHeight: 1.3, whiteSpace: 'nowrap' }}>{status}</span>;
}

function rangeLabel(granularity: string, start: string, end: string): string {
  const format = (id: string): string => granularity === 'week' && /^\d{6}$/.test(id)
    ? `${id.slice(0, 4)}W${id.slice(4)}`
    : id;
  const first = format(start);
  const last = format(end);
  return first === last ? first : `${first}–${last}`;
}

function rangeIndexes(granularity: string, start: string, end: string): [number, number] {
  const rows = dimTime.filter((row) => {
    if (granularity === 'month') return row.month_id >= start && row.month_id <= end;
    if (granularity === 'quarter') return row.quarter_id >= start && row.quarter_id <= end;
    return row.week_id >= start && row.week_id <= end;
  });
  if (rows.length === 0) return [0, FX_WEEKLY.length - 1];
  const first = dimTime.findIndex((row) => row.week_id === rows[0].week_id);
  const last = dimTime.findIndex((row) => row.week_id === rows[rows.length - 1].week_id);
  return [Math.max(0, first), Math.min(FX_WEEKLY.length - 1, last)];
}

function pctChange(start: number, end: number): string {
  const pct = start === 0 ? 0 : ((end - start) / start) * 100;
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  return <article style={{ background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: space.md, minHeight: 106 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: color.mute, fontSize: 11 }}>{kpi.title}<StatusBadge status={kpi.status} /></div>
    <div className="tnum" style={{ marginTop: 7, fontSize: 21, lineHeight: 1.2, fontWeight: 650, color: color.ink }}>{kpi.value}</div>
    <div style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.45, color: color.body }}>{kpi.detail}</div>
    <div style={{ marginTop: 7, fontSize: 10, color: color.mute }}>{kpi.source}</div>
  </article>;
}

export default function IntelligenceCenter() {
  const { state } = useFilters();
  const { openAgent } = useAgent();
  const { go } = usePage();
  const labels = useMemo(() => scopeLabels(state), [state]);
  const scope = `${labels.country} · ${labels.industry}`;
  const selectedRange = useMemo(() => rangeLabel(state.granularity, state.rangeStart, state.rangeEnd), [state.granularity, state.rangeEnd, state.rangeStart]);
  const fxCurrency = getLocalCurrency();
  const fxPair = `USD / ${fxCurrency}`;
  const [fxStartIdx, fxEndIdx] = useMemo(() => rangeIndexes(state.granularity, state.rangeStart, state.rangeEnd), [state.granularity, state.rangeEnd, state.rangeStart]);
  const fxStart = FX_WEEKLY[fxStartIdx];
  const fxEnd = FX_WEEKLY[fxEndIdx];
  const fxDelta = pctChange(fxStart, fxEnd);
  const signals = useMemo(() => SIGNALS.map((signal) => signal.title === '汇率'
    ? { ...signal, value: `${fxPair} ${fxEnd.toFixed(4)}`, detail: `选定区间内 ${fxDelta}，本币换算压力${fxEnd >= fxStart ? '上升' : '回落'}`, source: `演示 CBR 序列 · ${selectedRange}` }
    : signal), [fxDelta, fxEnd, fxPair, fxStart, selectedRange]);
  const kpis: Kpi[] = [
    { title: fxPair, value: fxEnd.toFixed(4), detail: `选定区间 ${fxDelta} · ${selectedRange}`, status: '模拟', source: `演示 CBR 序列 · ${selectedRange}` },
    { title: '年内官方汇率区间', value: '70.7902–86.9963', detail: '低点 5 月 22 日 · 高点 9 月 3 日', status: '模拟', source: '演示序列 · 暂无实时快照' },
    { title: `${labels.country} ${labels.industry}大盘`, value: '1.86M 台', detail: '最近 4 周环比 +3.2% · Sell-in 口径', status: '模拟', source: '演示大盘 · 仅用于预测逻辑' },
    { title: '4Q26 DRAM 合约价', value: '+10–15%', detail: '行业预测 · 转换为成本情景，不直接叠加', status: '模拟', source: 'TrendForce 摘要 · 2026-09-30' },
  ];
  return (
    <div style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }} data-lpl-scroll>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <PageHeader />
        <main style={{ flex: 1, padding: `${space.lg}px`, maxWidth: 1440, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: space.md, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 11, color: color.mute, letterSpacing: '.04em' }}>INTELLIGENCE CENTER / {state.countryCode}</div><h1 style={{ margin: '3px 0 0', fontSize: fontSize.displaySm, color: color.ink }}>情报中心</h1><div style={{ marginTop: 5, fontSize: 12, color: color.mute }}>{scope} · 汇率、产业大盘、上游成本和新品事件 · 截至 {selectedRange}</div></div>
            <Tag color="blue" style={{ marginLeft: 'auto' }}>演示数据</Tag>
            <Button onClick={() => go('forecast')}>进入量价预测</Button>
            <Button icon={<RobotOutlined />} onClick={() => openAgent('full', `总结当前情报中心的关键变化，并指出对价格和库存的影响（区间：${selectedRange}）`)}>让 Agent 总结</Button>
          </div>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: space.md, marginBottom: space.md }}>
            {kpis.map((kpi) => <KpiCard key={kpi.title} kpi={kpi} />)}
          </section>
          <section style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg, marginBottom: space.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: space.md }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>市场信号</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>把外部事件整理成可跟进的价格线索</div></div><span style={{ fontSize: 11, color: color.mute }}>区间：{selectedRange} · 更新时间：2026-10-30 18:00（北京时间）</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: space.md }}>
              {signals.map((signal) => <article key={signal.title} style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: space.md, minHeight: 130 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.mute }}>{signal.title}<StatusBadge status={signal.status} /></span><Sparkline points={signal.points} tone={signal.tone} label={`${signal.title}在${selectedRange}内的趋势`} /></div><div className="tnum" style={{ marginTop: 4, fontSize: 17, fontWeight: 600, color: color.ink }}>{signal.value}</div><div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5, color: toneColor(signal.tone) }}>{signal.detail}</div><div style={{ marginTop: 7, fontSize: 10.5, color: color.mute }}>{signal.source}</div></article>)}
            </div>
          </section>
          <section data-lpl-intelligence-grid style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.2fr) minmax(280px, .8fr)', gap: space.md, marginBottom: space.md }}>
            <article style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>{fxPair} 汇率变化</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>数值越高表示 1 美元可兑换更多 {fxCurrency} · 选定区间同步</div></div><StatusBadge status="模拟" /></div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 18 }}><strong className="tnum" style={{ fontSize: 28, color: color.ink }}>{fxEnd.toFixed(4)}</strong><span className="tnum" style={{ fontSize: 13, color: fxDelta.startsWith('−') ? '#18794e' : '#9a6700' }}>{fxDelta}</span><span style={{ fontSize: 11, color: color.mute }}>{selectedRange}</span></div>
              <div style={{ display: 'flex', alignItems: 'end', gap: 4, height: 68, marginTop: 12, padding: '0 4px', borderBottom: `1px solid ${color.hairline}` }} aria-label={`${fxPair} ${selectedRange} 汇率趋势`} role="img">{FX_WEEKLY.slice(fxStartIdx, fxEndIdx + 1).map((value, index, values) => { const min = Math.min(...values); const max = Math.max(...values); return <span aria-hidden="true" key={`${value}-${index}`} style={{ flex: 1, minWidth: 3, height: `${Math.max(10, ((value - min) / Math.max(0.01, max - min)) * 52 + 10)}px`, background: color.link, opacity: .3 + index / Math.max(1, values.length) * .65, borderRadius: '2px 2px 0 0' }} />; })}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space.sm, marginTop: 14, fontSize: 11 }}><div><div style={{ color: color.mute }}>区间起点</div><div className="tnum" style={{ marginTop: 3, color: color.body }}>{fxStart.toFixed(4)}</div></div><div><div style={{ color: color.mute }}>区间最低</div><div className="tnum" style={{ marginTop: 3, color: color.body }}>70.7902</div></div><div><div style={{ color: color.mute }}>区间最高</div><div className="tnum" style={{ marginTop: 3, color: color.body }}>86.9963</div></div></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space.sm, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${color.hairline}`, fontSize: 11 }}><div><div style={{ color: color.mute }}>2026 全年均值</div><div className="tnum" style={{ marginTop: 3, color: color.body }}>80.0</div></div><div><div style={{ color: color.mute }}>2026 Q4 隐含均值</div><div className="tnum" style={{ marginTop: 3, color: color.body }}>85.3</div></div><div><div style={{ color: color.mute }}>2027 年均值</div><div className="tnum" style={{ marginTop: 3, color: color.body }}>89.4</div></div></div>
              <div style={{ marginTop: 12, padding: '9px 10px', borderRadius: radius.control, background: color.canvasSoft, fontSize: 11, lineHeight: 1.55, color: color.body }}>汇率只用于解释进口成本与本币折算压力，不能把某一周价格变化直接归因于汇率；预测值是演示假设，不是确定性承诺。</div>
            </article>
            <article style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>情报如何进入量价模型</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>事实、假设与模型输入分离</div></div><Tag style={{ margin: 0 }}>4 条映射</Tag></div>
              <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>{[['01', '汇率', '本币进口成本情景'], ['02', '大盘', '修正产品无约束需求'], ['03', '存储', '形成单台成本上行情景'], ['04', '新品', '高档位供给与竞品价格锚']].map(([index, label, detail]) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '24px 54px 1fr', gap: 8, alignItems: 'center', fontSize: 12 }}><span className="tnum" style={{ color: color.link }}>{index}</span><strong style={{ color: color.ink }}>{label}</strong><span style={{ color: color.body }}>{detail}</span></div>)}</div>
              <button type="button" onClick={() => go('forecast')} style={{ marginTop: 18, border: 0, background: 'transparent', padding: 0, color: color.link, cursor: 'pointer', fontSize: 12 }}>进入量价预测，调整这些情景 <ArrowRightOutlined /></button>
            </article>
          </section>
          <section data-lpl-intelligence-grid style={{ display: 'grid', gridTemplateColumns: 'minmax(330px, 1.1fr) minmax(300px, .9fr)', gap: space.md, marginBottom: space.md }}>
            <article style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: space.md }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>{labels.country} 分产业、分价格档位大盘</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>最近 4 周销量规模、环比与我司份额</div></div><StatusBadge status="模拟" /></div>
              <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 11.5 }}><thead><tr>{['价格档位', '规模（千台）', '环比', '我司份额'].map((head) => <th key={head} style={{ textAlign: 'left', padding: '7px 5px', color: color.mute, fontWeight: 500, borderBottom: `1px solid ${color.hairline}` }}>{head}</th>)}</tr></thead><tbody>{MARKET_BANDS.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${row[0]}-${index}`} className={index > 0 ? 'tnum' : undefined} style={{ padding: '8px 5px', color: index === 2 && cell.startsWith('−') ? '#9a6700' : color.body, borderBottom: `1px solid ${color.hairline}` }}>{cell}</td>)}</tr>)}</tbody></table></div>
              <div style={{ marginTop: 10, fontSize: 10.5, lineHeight: 1.5, color: color.mute }}>模拟口径：全渠道 Sell-in，不代表真实市场统计。高档位增长可能来自新品上市与供应恢复，需结合价格、渠道和锁量验证。</div>
            </article>
            <article style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: space.md }}><div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>全球存储市场变动</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>DRAM / NAND Flash 合约价季度环比预测</div></div><StatusBadge status="模拟" /></div>
              <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 310, borderCollapse: 'collapse', fontSize: 11.5 }}><thead><tr>{['季度', 'DRAM', 'NAND Flash'].map((head) => <th key={head} style={{ textAlign: 'left', padding: '7px 5px', color: color.mute, fontWeight: 500, borderBottom: `1px solid ${color.hairline}` }}>{head}</th>)}</tr></thead><tbody>{STORAGE_FORECAST.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${row[0]}-${index}`} className={index > 0 ? 'tnum' : undefined} style={{ padding: '8px 5px', color: color.body, borderBottom: `1px solid ${color.hairline}` }}>{cell}{index > 0 ? '%' : ''}</td>)}</tr>)}</tbody></table></div>
              <div style={{ marginTop: 10, fontSize: 10.5, lineHeight: 1.5, color: color.mute }}>行业预测只转换成单台成本情景，不能直接把季度涨幅相加到成本或终端价格。</div>
            </article>
          </section>
          <section style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg, marginBottom: space.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: space.md, flexWrap: 'wrap' }}>
              <div><h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>新品上市情报</h2><div style={{ marginTop: 4, fontSize: 12, color: color.mute }}>把新品事件放进当前价格带，区分已确认事实与待核查信息</div></div>
              <span style={{ fontSize: 11, color: color.mute }}>全球发布 ≠ {labels.country} 已上市</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: space.md }}>
              {NEW_PRODUCTS.map((product) => <article key={product.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: space.md, minHeight: 174 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ fontSize: 11, color: color.mute }}>{product.brand}</span><StatusBadge status={product.status} /><span style={{ marginLeft: 'auto', fontSize: 11, color: color.body }}>{product.stage}</span></div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><h3 style={{ margin: 0, fontSize: 15, color: color.ink }}>{product.name}</h3><span style={{ fontSize: 11, color: color.mute }}>{product.priceBand}</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}><div><div style={{ color: color.mute }}>上市节点</div><div style={{ marginTop: 2, color: color.body }}>{product.date}</div></div><div><div style={{ color: color.mute }}>价格锚</div><div style={{ marginTop: 2, color: color.body }}>{product.launchPrice}</div></div></div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: color.body }}>{product.summary}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 5, borderTop: `1px solid ${color.hairline}` }}><span title={product.source} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.mute, fontSize: 10.5 }}>{product.source}</span><button type="button" onClick={() => openAgent('dock', `评估 ${product.brand} ${product.name} 对当前产品价格、销量和库存的影响（区间：${selectedRange}）`)} style={{ marginLeft: 'auto', color: color.link, cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}>让 Agent 评估 <ArrowRightOutlined /></button></div>
              </article>)}
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
