// ============================================================
// 计算路径抽屉内容：输入事实 → 因子响应 → 无约束需求 → 供给截断 →
// 库存 / DOS / 销毛。当周（W10）真实计算数值可手工复算；
// 附数据状态、模型版本与来源，不进入任何真实系统。
// ============================================================
import { color, fontSize, radius, space } from '../../theme/tokens';
import type { ForecastComputation, ForecastDataset } from './forecastModel';
import { DataStatusBadge, fmtMoney, fmtPressure, fmtUnits } from './ForecastBits';

interface Step {
  title: string;
  lines: { label: string; value: string }[];
}

function StepBlock({ index, step }: { index: number; step: Step }) {
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden className="tnum" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 999, border: `1px solid ${color.hairlineStrong}`, fontSize: 11, color: color.body }}>{index}</span>
        <strong style={{ fontSize: fontSize.bodySm, color: color.ink }}>{step.title}</strong>
      </div>
      <div style={{ display: 'grid', gap: 3, padding: `8px 10px`, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
        {step.lines.map((line) => (
          <div key={line.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
            <span style={{ color: color.mute }}>{line.label}</span>
            <span className="tnum" style={{ color: color.ink, fontWeight: 600, textAlign: 'right' }}>{line.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CalculationPath({ dataset, computation }: { dataset: ForecastDataset; computation: ForecastComputation }) {
  const { current, factors, kpi } = computation;
  const steps: Step[] = [
    {
      title: '输入事实（模拟 · demo_seed）',
      lines: [
        { label: '需求基线', value: `${fmtUnits(current.baseDemand)} 台` },
        { label: '消费者感知价格 / 参考价', value: `$${current.price} / $${current.rrp}` },
        { label: '促销强度（活动期）', value: current.promoIntensity > 0 ? `${Math.round(current.promoIntensity * 100)}%` : '无窗口' },
        { label: '竞品压力', value: current.competitorPressure < 0 ? fmtPressure(current.competitorPressure) : '无事件' },
        { label: '可供量 / Sell-in', value: `${fmtUnits(current.available)} / ${fmtUnits(current.si)} 台` },
        { label: '单台成本', value: fmtMoney(current.cost) },
      ],
    },
    {
      title: '因子响应（乘法链）',
      lines: [
        { label: `价格响应 = (价格 ÷ ${dataset.params.referencePrice})^${dataset.params.priceElasticity.toFixed(2)}`, value: `× ${factors.priceFactor.toFixed(3)}` },
        { label: '促销响应（窗口内脉冲，活动后一周回落）', value: `× ${factors.promoFactor.toFixed(3)}` },
        { label: '竞品压力响应（1 + 压力）', value: `× ${factors.competitorFactor.toFixed(3)}` },
      ],
    },
    {
      title: '无约束需求',
      lines: [
        { label: `${fmtUnits(current.baseDemand)} × 价格 × 促销 × 竞品（逐步取整）`, value: `${fmtUnits(current.unconstrainedDemand)} 台` },
      ],
    },
    {
      title: '供给截断（确定性计算）',
      lines: [
        { label: `SO = min(${fmtUnits(current.unconstrainedDemand)}, ${fmtUnits(current.available)})`, value: `${fmtUnits(current.so)} 台` },
        { label: '是否截断', value: current.stockout ? '是（缺货周，需求不代表下降）' : '否' },
      ],
    },
    {
      title: '库存 / DOS / 销毛',
      lines: [
        { label: '期末库存 = 期初 + Sell-in − SO', value: `${fmtUnits(current.inventory)} 台` },
        { label: 'DOS = 期末库存 ÷ 当周需求 × 7', value: `${kpi.dos} 天` },
        { label: `单台销毛 = 净收入（$${current.companyNetRevenue}）− 成本（$${current.cost}）`, value: fmtMoney(current.unitGrossMargin) },
        { label: '周销毛 = SO × 单台销毛', value: fmtMoney(current.weeklyGrossMargin) },
      ],
    },
  ];
  return (
    <div style={{ display: 'grid', gap: space.md }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <DataStatusBadge status={dataset.meta.status} />
        <span className="mono" style={{ fontSize: 11, color: color.body }}>{dataset.meta.modelVersion}</span>
        <span style={{ fontSize: 11, color: color.mute }}>来源 {dataset.meta.source} · 生成 {dataset.meta.generatedAt}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: color.body }}>
        以当前周 {current.week}（{current.status === 'actual' ? '实际周' : '预测周'}）为例，展示从输入事实到销毛的完整计算路径。价格、促销、竞品为可解释因子；供给只作 SO 上限；成本只进入销毛链，不修改需求。
      </p>
      {steps.map((step, index) => <StepBlock key={step.title} index={index + 1} step={step} />)}
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: color.mute }}>{dataset.meta.note}预测区间来源为历史残差带，未做分位数校准；简单版不自动判断竞品上市是扩盘还是分流。</p>
    </div>
  );
}
