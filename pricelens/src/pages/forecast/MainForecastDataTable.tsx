// ============================================================
// 主图数据表（forecast-global-ia-review B.5.4 · 任务 7）：
// 只读 WorkbenchResult + MarginView（显示价 / 销毛的过渡接线，键 = WeekId），
// 吸收 WeeklyLedger 的表格职责（sticky header、数字对齐、局部横滚），
// 成为全期唯一逐周表——不出现第二套「主账」。
// 列（B.5.4 拍板）：周、状态、学习基线、①后、②后、SI、③后、手调、
// 最终 SO、期末库存、渠道 DOS、显示价格、成本、单台销毛、周销毛、事件/操作。
// 缺数「—」不当 0；负销毛照实显示（不钳 0）；历史周阶段列显「—」。
// ============================================================
import type { CSSProperties } from 'react';
import { color, radius } from '../../theme/tokens';
import type { WorkbenchResult, WorkbenchWeekResult } from './workbenchModel';
import type { ProductEventSeed } from './workbenchFixture';

/**
 * MarginView 结构子集（任务 9 marginScenarioModel 交付前的过渡解耦：
 * 只声明本表消费的字段，键 = WeekId；缺字段回退 WorkbenchWeekResult 同名值）。
 */
export interface MainForecastMarginWeek {
  effectivePrice?: number | null;
  unitMargin?: number | null;
  weeklyMargin?: number | null;
}
export interface MainForecastMarginView {
  weeks?: Record<string, MainForecastMarginWeek> | null;
}

const thStyle: CSSProperties = {
  position: 'sticky', top: 0, zIndex: 1, background: color.canvas,
  fontSize: 11, fontWeight: 600, color: color.mute, textAlign: 'right',
  padding: '6px 8px', borderBottom: `1px solid ${color.hairlineStrong}`, whiteSpace: 'nowrap',
};
const tdStyle: CSSProperties = {
  fontSize: 12, color: color.body, textAlign: 'right',
  padding: '4px 8px', borderBottom: `1px solid ${color.hairline}`, whiteSpace: 'nowrap',
};

const fmtUnits = (value: number | null | undefined): string =>
  value != null && Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '—';
const fmtUsd = (value: number | null | undefined): string =>
  value != null && Number.isFinite(value) ? `$${Math.round(value).toLocaleString('en-US')}` : '—';
const fmtDos = (value: number | null | undefined): string =>
  value != null && Number.isFinite(value) ? `${Math.round(value * 10) / 10}` : '—';

/** 事件/操作列：命中范围事件的产品事件（A 编号 = 名录同序）。
 *  范围命中按全期周序（跨年 2026W53 → 2027W01 不做字符串比较）。 */
function eventChipsOf(
  week: WorkbenchWeekResult,
  productEvents: ProductEventSeed[],
  indexOf: Map<string, number>,
): string[] {
  const startOrder = new Map(productEvents.map((event, index) => [event.id, index]));
  return productEvents
    .filter((event) => {
      if (week.status !== 'forecast') return false;
      const self = indexOf.get(week.weekId);
      const a = indexOf.get(event.startWeekId);
      const b = indexOf.get(event.endWeekId);
      if (self == null || a == null || b == null) return false;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return self >= lo && self <= hi;
    })
    .map((event) => `A${(startOrder.get(event.id) ?? 0) + 1}`);
}

export default function MainForecastDataTable({
  result,
  productEvents = [],
  marginView,
  onTuneWeek,
}: {
  result: WorkbenchResult;
  /** 产品范围事件（事件/操作列 A 编号与图顶锚、名录同序）。 */
  productEvents?: ProductEventSeed[];
  /** MarginView 过渡接线（显示价 / 销毛；缺省回退周结果原价与模型过渡字段）。 */
  marginView?: MainForecastMarginView | null;
  /** 微调入口（预测周且有最终值）；缺省不渲染微调按钮。 */
  onTuneWeek?: (weekId: string) => void;
}) {
  const weeks = result.weeks;
  const indexOf = new Map(weeks.map((week, index) => [week.weekId, index]));
  if (!weeks.length) return null;
  const marginWeekOf = (weekId: string): MainForecastMarginWeek => marginView?.weeks?.[weekId] ?? {};
  return (
    <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto', border: `1px solid ${color.hairline}`, borderRadius: radius.control }}>
      <table className="tnum" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1180 }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          预测主图数据表：全期逐周学习基线、①产品事件后、②大盘修正后、SI、③库存修正后、手调、最终 SO、期末库存、渠道 DOS、显示价格、成本与销毛；缺数为「—」。
        </caption>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left' }}>周</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>状态</th>
            <th style={thStyle}>学习基线</th>
            <th style={thStyle}>①后</th>
            <th style={thStyle}>②后</th>
            <th style={thStyle}>SI</th>
            <th style={thStyle}>③后</th>
            <th style={thStyle}>手调</th>
            <th style={thStyle}>最终 SO</th>
            <th style={thStyle}>期末库存</th>
            <th style={thStyle}>渠道 DOS</th>
            <th style={thStyle}>显示价格</th>
            <th style={thStyle}>成本</th>
            <th style={thStyle}>单台销毛</th>
            <th style={thStyle}>周销毛</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>事件/操作</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => {
            const marginWeek = marginWeekOf(week.weekId);
            const effectivePrice = marginWeek.effectivePrice != null ? marginWeek.effectivePrice : week.price;
            const unitMargin = marginWeek.unitMargin != null ? marginWeek.unitMargin : week.unitMargin;
            const weeklyMargin = marginWeek.weeklyMargin != null ? marginWeek.weeklyMargin : week.weeklyMargin;
            const chips = eventChipsOf(week, productEvents, indexOf);
            const tunable = week.status === 'forecast' && week.final != null && onTuneWeek != null;
            return (
              <tr key={week.weekId}>
                <td style={{ ...tdStyle, textAlign: 'left', color: color.ink }}><span className="mono">{week.weekId}</span></td>
                <td style={{ ...tdStyle, textAlign: 'left' }}>
                  {week.status === 'actual' ? '实际' : week.manual != null ? '手调' : week.capped ? '库存上限修正' : '预测'}
                </td>
                <td style={tdStyle}>{fmtUnits(week.learnedBase)}</td>
                <td style={tdStyle}>{fmtUnits(week.baselineSales)}</td>
                <td style={tdStyle}>{fmtUnits(week.marketAdjusted)}</td>
                <td style={tdStyle}>{week.si.toLocaleString('en-US')}</td>
                <td style={tdStyle}>{fmtUnits(week.inventoryAdjusted)}</td>
                <td style={tdStyle}>{week.manual != null ? fmtUnits(week.manual.value) : '—'}</td>
                <td style={{ ...tdStyle, color: color.ink, fontWeight: 600 }}>{fmtUnits(week.final)}</td>
                <td style={tdStyle}>{fmtUnits(week.channelInv)}</td>
                <td style={tdStyle}>{fmtDos(week.channelDos)}</td>
                <td style={tdStyle}>{fmtUsd(effectivePrice)}</td>
                <td style={tdStyle}>{fmtUsd(week.unitCost)}</td>
                <td style={{ ...tdStyle, color: unitMargin < 0 ? color.error : undefined }}>{fmtUsd(unitMargin)}</td>
                <td style={{ ...tdStyle, color: weeklyMargin < 0 ? color.error : undefined }}>{fmtUsd(weeklyMargin)}</td>
                <td style={{ ...tdStyle, textAlign: 'left' }}>
                  {chips.length > 0 && (
                    <span style={{ marginRight: 8, color: color.mute, fontSize: 11 }} aria-label={`本周命中事件 ${chips.join('、')}`}>
                      {chips.map((chip, index) => (
                        <span key={`${chip}-${index}`} aria-hidden style={{ display: 'inline-flex', width: 16, height: 16, marginRight: 2, borderRadius: '50%', border: `1px solid ${color.hairlineStrong}`, fontSize: 9, alignItems: 'center', justifyContent: 'center' }}>{chip}</span>
                      ))}
                    </span>
                  )}
                  {tunable ? (
                    <button
                      type="button"
                      aria-label={`微调 ${week.weekId} 预测销量`}
                      onClick={() => onTuneWeek?.(week.weekId)}
                      style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 12, color: color.link, cursor: 'pointer' }}
                    >
                      微调
                    </button>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
