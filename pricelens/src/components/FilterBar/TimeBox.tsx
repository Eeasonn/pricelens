import { Segmented } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import type { Granularity } from '../../dataModel/types';

/** Chart-level bucket granularity; the time extrema filter lives above the bottom window rail. */
export function GranularityControl() {
  const { state, actions } = useFilters();
  return (
    <Segmented
      style={{ flexShrink: 0 }}
      value={state.granularity}
      onChange={(value) => actions.setGranularity(value as Granularity)}
      options={[
        { label: '季', value: 'quarter' },
        { label: '月', value: 'month' },
        { label: '周', value: 'week' },
      ]}
    />
  );
}
