// ============================================================
// 顶部筛选条 · 时间粒度（2026-11-04 Eason 看图反馈）：周/月/季从时间筛选簇
// 弹层里拿出来常驻筛选条——币种右侧直接可见可切，不再先开弹层再切；时间簇
// 随之收窄让位。控件 = 全站既有 antd Segmented 同款语言（filterBarTheme 下
// itemSelected 浅蓝），aria-label 沿用原弹层内控件的「时间粒度」。
// 状态同源 useFilters().granularity（actions.setGranularity 保持时间跨度换桶，
// 各看板查看窗口复位口径不变）。仅 showTime 的看板渲染（粒度是看板级口径，
// 总览/预警等不出现）。
// ============================================================
import { Segmented } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import type { Granularity } from '../../dataModel/types';
import { marketDataProfileOf } from '../../dataModel/marketProfile';

export default function GranularityBox() {
  const { state, actions } = useFilters();
  const profile = marketDataProfileOf(state.countryCode);
  return (
    <Segmented
      size="small"
      aria-label={profile.granularityLocked ? '时间粒度（南非月度锁定）' : '时间粒度'}
      value={state.granularity}
      options={profile.granularityLocked
        ? [{ label: '月', value: 'month' }]
        : [
            { label: '周', value: 'week' },
            { label: '月', value: 'month' },
            { label: '季', value: 'quarter' },
          ]}
      onChange={(value) => actions.setGranularity(value as Granularity)}
    />
  );
}
