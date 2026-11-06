// ============================================================
// 量价预测 · 推演工作台 v3 · 页级管线导航 PipelineNav（任务 6 · B.5.1 / B.5.2）：
// 一条全局管线的四个节点（只读状态 + 定位）。2026-11-06 P0-3：并入首卡工具行——
// 紧凑形态（无独立厚条边框 / 无「推演顺序」占位标签），节点只显「① 名称」，
// 实时状态读数收进节点 title（悬停可读，跨卡导航能力不变）。
//   ①自动学习基线（学习状态 + 参考名）→ ②大盘修正（人工调整数）→
//   ③库存修正（SI 待确认数 + 首修正周）→ ④成本及销毛（预测期销毛 + 暂不联动销量）
// 红线（B.5.2 / IA 评审 2.3 A）：
//   - 点击只回调 onNavigate(stage)（页级据此 scrollIntoView + 目标卡 tabIndex=-1
//     聚焦，跨卡焦点为 React 内存瞬态）；不写 WorkbenchParams、不重算、不提交编辑；
//   - 当前定位用 aria-current="step" 文字等价；④不是“对主图的第五步修正”，
//     节点 title 固定「④读取最终 SO、价格与成本，输出经营结果；不回写主图」；
//   - 窄屏横向滚动，不把四个节点压成难以点击的小字；
//   - 待审核候选数（②）属情报审核域（任务 8），数据到位前不显示占位假数。
// marginView 只读最小切片（PipelineMarginRead）：任务 9 的 MarginView 落地后
// 结构兼容直接可用；本组件不另造 MarginView 类型、不算销毛公式。
// ============================================================
import { Fragment, useState } from 'react';
import { color, radius } from '../../theme/tokens';
import type { ForecastCalendar } from './workbenchCalendar';
import type { WorkbenchParams, WorkbenchResult } from './workbenchModel';
import { siMonthStatusOf, type SiConfirmationState } from './useSiConfirmations';
import { fmtMillionUsd } from './WorkbenchBits';

/** 页级管线节点序号（①–④；与卡内链路「无编号」纪律区分，见 WorkbenchBits.FlowBar）。 */
export type ForecastStage = 1 | 2 | 3 | 4;

/** PipelineNav 对销毛视图的最小读取切片（任务 9 MarginView 的结构子集）。 */
export interface PipelineMarginRead {
  /** 预测期销毛（USD）。 */
  forecastMargin: number;
  /** 价格→销量关系拍板前恒为 false（B.4.3；过渡期显示「暂不联动销量」）。 */
  priceDemandLinked: boolean;
}

export interface PipelineNavProps {
  calendar: ForecastCalendar;
  result: WorkbenchResult;
  params: WorkbenchParams;
  confirmationState: SiConfirmationState;
  marginView: PipelineMarginRead;
  onNavigate: (stage: ForecastStage) => void;
  /** ①节点参考名（fixture.references.prevGenPool 的 label，页级接线时传入；
   *  缺省回退 learning.referenceId——id 可读性差，页面应传 label）。 */
  referenceLabel?: string;
}

/** ①学习状态文案（B.5.1：自动学习 / 学习回退；partial 补「部分样本」文字）。 */
function learningStatusText(status: 'completed' | 'partial' | 'fallback'): string {
  if (status === 'completed') return '自动学习';
  return status === 'partial' ? '自动学习 · 部分样本' : '学习回退';
}

export default function PipelineNav({
  calendar,
  result,
  params,
  confirmationState,
  marginView,
  onNavigate,
  referenceLabel,
}: PipelineNavProps) {
  // 当前定位（内存瞬态）：只驱动 aria-current="step"，不进入 params / 持久化。
  const [current, setCurrent] = useState<ForecastStage | null>(null);

  // ③SI 待确认数：已确认 = 有记录且 confirmedValue === 当前值（B.4.3）。
  const pendingCount = calendar.forecastMonths.filter((month) => {
    const value = params.siPlanMonthly[month.key] ?? 0;
    return siMonthStatusOf(confirmationState.byMonth[month.key], value) !== 'confirmed';
  }).length;
  const firstAdjustedWeek = result.firstAdjustedWeek;

  // ②人工调整数（月调整键数）；待审核候选数属任务 8 情报域，数据到位前不显示。
  const manualAdjustCount = Object.keys(params.marketMonthOverrides).length;

  const stages: { stage: ForecastStage; numeral: string; label: string; status: string; title: string }[] = [
    {
      stage: 1,
      numeral: '①',
      label: '自动学习基线',
      status: `${learningStatusText(result.learning.status)} · 参考 ${referenceLabel ?? result.learning.referenceId}`,
      title: '①自动学习基线：本地确定性学习（上一代同周龄 + 趋势 + 促销特征），未调用模型服务，可直接修改；切换上一代 = 重新学习',
    },
    {
      stage: 2,
      numeral: '②',
      label: '大盘修正',
      status: manualAdjustCount > 0 ? `人工调整 ${manualAdjustCount} 个月` : 'AI 基线',
      title: '②大盘按月生效值修正对应预测周（季度基线外推 + 人工按月调整）；调整与待审核候选在②卡内操作，这里只读状态',
    },
    {
      stage: 3,
      numeral: '③',
      label: '库存修正',
      status: `SI 待确认 ${pendingCount} / 12 · ${firstAdjustedWeek != null ? `${firstAdjustedWeek} 起` : '未触发'}`,
      title: '③SI 月计划逐月确认（唯一人工输入）；可售不足的预测周按 min(基线 SO, 可售) 修正并回写主图',
    },
    {
      stage: 4,
      numeral: '④',
      label: '成本及销毛',
      status: `${fmtMillionUsd(marginView.forecastMargin)} · ${marginView.priceDemandLinked ? '已联动销量' : '暂不联动销量'}`,
      // ④不是“对主图的第五步修正”（B.5.2）：title 固定，不改写。
      title: '④读取最终 SO、价格与成本，输出经营结果；不回写主图',
    },
  ];

  return (
    <nav
      data-pipeline-nav=""
      aria-label="推演管线导航（①自动学习基线 → ②大盘修正 → ③库存修正 → ④成本及销毛）"
      style={{
        display: 'flex', alignItems: 'center', gap: '4px 8px', overflowX: 'auto', whiteSpace: 'nowrap',
        minWidth: 0,
      }}
    >
      {stages.map((stage, index) => (
        <Fragment key={stage.stage}>
          {index > 0 && <span aria-hidden style={{ color: color.hairlineStrong, fontSize: 11 }}>→</span>}
          <button
            type="button"
            data-pipeline-stage={stage.stage}
            aria-current={current === stage.stage ? 'step' : undefined}
            title={`${stage.title} · 当前：${stage.status}`}
            onClick={() => {
              // 只定位：不写 params、不重算、不自动提交任何编辑（B.5.2）。
              setCurrent(stage.stage);
              onNavigate(stage.stage);
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flex: 'none', height: 24, padding: '0 10px',
              borderRadius: radius.control, fontSize: 12, lineHeight: 1, whiteSpace: 'nowrap', cursor: 'pointer',
              background: color.canvasSoft2, border: `1px solid ${color.hairline}`, font: 'inherit',
            }}
          >
            <span style={{ fontWeight: 600, color: color.ink }}>{`${stage.numeral} ${stage.label}`}</span>
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
