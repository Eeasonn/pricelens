// 币种与粒度使用同款 Segmented；切换仅改变显示口径，不重新取数。
// 2026-11-03：disabled 由 FilterBar 传入（大盘走势页置灰，币种不作用于该页样例）；
// 总览直接挂载时不传，保持可用。
import { Segmented } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import type { CurrencyMode } from '../../dataModel/types';

export default function CurrencyBox({ disabled = false }: { disabled?: boolean } = {}) {
  const { state, actions } = useFilters();
  return (
    <Segmented
      value={state.currency}
      disabled={disabled}
      onChange={(value) => actions.set({ currency: value as CurrencyMode })}
      options={[{ label: '本币', value: 'local' }, { label: 'USD', value: 'usd' }]}
    />
  );
}
