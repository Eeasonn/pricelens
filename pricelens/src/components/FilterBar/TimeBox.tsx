// ============================================================
// 顶部筛选条 · 时间筛选簇（第一百三十一轮波2）：包装 XBrush 导出的
// TimeRangeCluster（「自动」开关 + 周/月/季范围选择器），不自建交互逻辑。
// 桶枚举与筛选范围下标推导与两看板同口径（dataBucketRange/enumerateBuckets
// + state.rangeStart/rangeEnd → [lo, hi]）；时间状态全局同源（useFilters，
// URL/持久化同步照旧），价格看板与量价看板共用本入口（FilterBar showTime
// 时渲染在币种右侧）。手动选段 = 退出自动模式；「自动」= 跟随所选产品
// 最早/最晚有价时间。查看窗口复位由各看板监听范围变化自理。
// ============================================================
import { useMemo } from 'react';
import { TimeRangeCluster } from '../../chart/PriceTrend/XBrush';
import { dataBucketRange, enumerateBuckets, type Bucket } from '../../chart/PriceTrend/helpers';
import { useFilters } from '../../state/FiltersContext';

export default function TimeBox() {
  const { state, actions } = useFilters();
  // 全集桶 = 枚举基准（与看板同款：dataBucketRange 定全集、enumerateBuckets 出序列）
  const [dataStart, dataEnd] = useMemo(() => dataBucketRange(state.granularity), [state.granularity]);
  const buckets: Bucket[] = useMemo(
    () => enumerateBuckets(state.granularity, dataStart, dataEnd),
    [state.granularity, dataStart, dataEnd],
  );
  // 筛选范围 → 桶下标 [lo, hi]（选择器可选区间；与看板 filterBounds 同款推导）
  const [lo, hi] = useMemo<[number, number]>(() => {
    const indexOf = (id: string, fallback: number): number => {
      const i = buckets.findIndex((b) => b.id === id);
      return i >= 0 ? i : fallback;
    };
    const start = indexOf(state.rangeStart, 0);
    const end = indexOf(state.rangeEnd, Math.max(0, buckets.length - 1));
    return start <= end ? [start, end] : [end, start];
  }, [buckets, state.rangeStart, state.rangeEnd]);

  /** 用户明确指定极值 → 退出自动（原看板内 onRangeFilterChange 同口径，
   *  端点按桶序归正先后）。 */
  const onRangeChange = (startId: string, endId: string): void => {
    const start = buckets.findIndex((b) => b.id === startId);
    const end = buckets.findIndex((b) => b.id === endId);
    if (start < 0 || end < 0) return;
    const first = Math.min(start, end);
    const last = Math.max(start, end);
    actions.set({ adaptive: false, rangeStart: buckets[first].id, rangeEnd: buckets[last].id });
  };

  // 桌面定宽一行；窄屏拉满当前行，避免范围选择器被裁切
  return (
    <div style={{ flex: '1 1 280px', width: 'auto', maxWidth: 460, minWidth: 0 }}>
      <TimeRangeCluster
        buckets={buckets}
        lo={lo}
        hi={hi}
        adaptive={state.adaptive}
        granularity={state.granularity}
        agg={state.agg}
        onAggChange={(agg) => actions.set({ agg })}
        onRangeChange={onRangeChange}
        onGranularityChange={actions.setGranularity}
        onToggleAdaptive={() => actions.set({ adaptive: !state.adaptive })}
        placement="bottomRight"
      />
    </div>
  );
}
