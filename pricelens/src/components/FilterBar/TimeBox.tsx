// ============================================================
// 顶部筛选条 · 时间筛选簇（2026-11-13 Eason 时间筛选单值化）：包装 XBrush 导出的
// TimeRangeCluster（最晚时间单值选择器）。旧「自动时间/回到自动」按钮与
// 「已固定时间范围」提示条随自动概念一并退役——最早时间由看板底部时间拖块
// 控制，最晚时间在此单值选定；手动选定 = 固定时间范围（adaptive 置 false，
// 不再跟随产品的默认近段窗口），口径切换/重置视图时回落默认。
// 桶枚举与 dataBucketRange/enumerateBuckets 同口径（价格看板与量价看板共用
// 本入口，FilterBar showTime 时渲染在币种右侧）。
// ============================================================
import { useMemo } from 'react';
import { TimeRangeCluster } from '../../chart/PriceTrend/XBrush';
import { dataBucketRange, enumerateBuckets, type Bucket } from '../../chart/PriceTrend/helpers';
import { useFilters } from '../../state/FiltersContext';
import { useNarrowViewport } from '../../state/useNarrowViewport';

/** 单值选定的状态机（纯函数，测试锁定）：起点保持（由拖块控制）；起点越界
 *  （> 新终点）时一并钉到终点（起点 ≤ 终点不变式）。恒带 adaptive:false =
 *  手动固定时间范围（退出跟随产品的默认近段窗口）。 */
export function endChangePatch(
  rangeStart: string,
  buckets: Bucket[],
  nextEnd: string,
): { adaptive: false; rangeStart?: string; rangeEnd: string } | null {
  const endIdx = buckets.findIndex((b) => b.id === nextEnd);
  if (endIdx < 0) return null;
  const startIdx = buckets.findIndex((b) => b.id === rangeStart);
  if (startIdx >= 0 && startIdx > endIdx) {
    return { adaptive: false, rangeStart: nextEnd, rangeEnd: nextEnd };
  }
  return { adaptive: false, rangeEnd: nextEnd };
}

export default function TimeBox() {
  const { state, actions } = useFilters();
  // 全集桶 = 枚举基准（与看板同款：dataBucketRange 定全集、enumerateBuckets 出序列）
  const [dataStart, dataEnd] = useMemo(() => dataBucketRange(state.granularity), [state.granularity]);
  const buckets: Bucket[] = useMemo(
    () => enumerateBuckets(state.granularity, dataStart, dataEnd),
    [state.granularity, dataStart, dataEnd],
  );
  // 当前最晚桶（选择器的值）；持久化/链接携带的坏 id 回落数据末端
  const endId = useMemo(() => {
    const i = buckets.findIndex((b) => b.id === state.rangeEnd);
    return i >= 0 ? buckets[i].id : buckets[buckets.length - 1]?.id ?? state.rangeEnd;
  }, [buckets, state.rangeEnd]);

  // 桌面定宽不抢位（2026-11-13 Eason：所有筛选器保持一行、时间筛选器收窄——
  // 原 flex '1 1 220px'/maxWidth 340 会把选择产品列挤窄、窄视口整行折行；
  // 触发器「最晚·周」前缀同步撤下）；窄屏仍拉满当前行，避免选择器被裁切
  const narrow = useNarrowViewport();
  return (
    <div style={{ flex: narrow ? '1 1 100%' : '0 0 auto', minWidth: 0 }}>
      <TimeRangeCluster
        buckets={buckets}
        endId={endId}
        granularity={state.granularity}
        agg={state.agg}
        onAggChange={(agg) => actions.set({ agg })}
        onEndChange={(nextEnd) => {
          const patch = endChangePatch(state.rangeStart, buckets, nextEnd);
          if (patch) actions.set(patch);
        }}
        placement="bottomRight"
      />
    </div>
  );
}
