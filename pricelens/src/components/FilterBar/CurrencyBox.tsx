// 币种与粒度使用同款 Segmented；切换仅改变显示口径，不重新取数。
import { Segmented } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import type { CurrencyMode } from '../../dataModel/types';

export default function CurrencyBox() {
  const { state, actions } = useFilters();
  return (
    <Segmented
      value={state.currency}
      onChange={(value) => actions.set({ currency: value as CurrencyMode })}
      options={[{ label: '本币', value: 'local' }, { label: 'USD', value: 'usd' }]}
    />
  );
}
