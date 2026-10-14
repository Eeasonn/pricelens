// ============================================================
// §5.5 框五：币种 —— 单选 本地货币（RUB，默认）/ USD。
// 切换只改 state.currency（显示层重算由图表侧按汇率完成，§7.3，不重取数）。
// 反馈 2.2/2.5：控件行与其它筛选器统一为单行高 32、底部对齐 → 改横向排布，
// 标题「币种」由 FilterBar 的 Cell 行外统一渲染（第二十八轮：全部标签外置）。
// 反馈 2.4：选中圆点浅蓝由 FilterBar 嵌套 ConfigProvider 生效。
// ============================================================
import { Radio } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { CONTROL_ROW_H } from './controlHeight';

export default function CurrencyBox() {
  const { state, actions } = useFilters();
  return (
    <Radio.Group
      value={state.currency}
      onChange={(e) => actions.set({ currency: e.target.value })}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: CONTROL_ROW_H,
        whiteSpace: 'nowrap',
      }}
    >
      <Radio value="local">本币</Radio>
      <Radio value="usd">USD</Radio>
    </Radio.Group>
  );
}
