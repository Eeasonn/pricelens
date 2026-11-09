// ============================================================
// 顶部筛选条 · 时间筛选簇（第一百三十一轮波2）：包装 XBrush 导出的
// TimeRangeCluster（「自动」开关 + 时间范围选择器），不自建交互逻辑。
// 桶枚举与筛选范围下标推导与两看板同口径（dataBucketRange/enumerateBuckets
// + state.rangeStart/rangeEnd → [lo, hi]）；时间状态全局同源（useFilters，
// URL/持久化同步照旧），价格看板与量价看板共用本入口（FilterBar showTime
// 时渲染在币种右侧）。手动选段 = 退出自动模式；「自动」= 跟随所选产品
// 最早/最晚有价时间。查看窗口复位由各看板监听范围变化自理。
// 2026-11-04（Eason 看图反馈）：周/月/季粒度切换移出本簇（常驻筛选条
// 币种右侧 GranularityBox），本簇收窄让位（flex 基准 280→220、上限 460→340，
// 选择器 240→200）。
// 2026-11-09（用户反馈「自动时间不按逻辑来」）：Agent 价差/预警定位与带
// rs=re 的分享链接会静默退出自动——这类程序路径退出经 autoTimeBus 打标，
// 此处消费后显示「已固定时间范围（原因）· 回自动」提示条；用户自己手选
// 范围不走信封、无提示。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { TimeRangeCluster } from '../../chart/PriceTrend/XBrush';
import { dataBucketRange, enumerateBuckets, type Bucket } from '../../chart/PriceTrend/helpers';
import { useFilters } from '../../state/FiltersContext';
import { clearAutoTimeExit, consumeAutoTimeExit } from '../../state/autoTimeBus';
import { color } from '../../theme/tokens';

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

  // 程序路径退出自动 → 显性提示（信封在同一次 set 前打标，这里消费一次；
  // 用户手选范围无信封 = 不提示；回自动/重新开自动 = 清提示）
  const [exitNotice, setExitNotice] = useState<string | null>(null);
  const prevAdaptiveRef = useRef(state.adaptive);
  useEffect(() => {
    if (state.adaptive) {
      clearAutoTimeExit();
      setExitNotice(null);
    } else if (prevAdaptiveRef.current) {
      const exit = consumeAutoTimeExit();
      setExitNotice(exit ? exit.reason : null);
    }
    prevAdaptiveRef.current = state.adaptive;
  }, [state.adaptive]);

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

  // 桌面定宽一行；窄屏拉满当前行，避免范围选择器被裁切（2026-11-04 收窄让位粒度控件）
  return (
    <div style={{ flex: '1 1 220px', width: 'auto', maxWidth: 340, minWidth: 0 }}>
      <TimeRangeCluster
        buckets={buckets}
        lo={lo}
        hi={hi}
        adaptive={state.adaptive}
        granularity={state.granularity}
        agg={state.agg}
        onAggChange={(agg) => actions.set({ agg })}
        onRangeChange={onRangeChange}
        onToggleAdaptive={() => actions.set({ adaptive: !state.adaptive })}
        placement="bottomRight"
      />
      {exitNotice !== null && !state.adaptive ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 2,
            fontSize: 11, lineHeight: '16px', color: color.mute,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            已固定时间范围（{exitNotice}），不再跟随产品变化
          </span>
          <button
            type="button"
            onClick={() => actions.set({ adaptive: true })}
            style={{
              flexShrink: 0, border: 'none', background: 'none', padding: 0,
              fontSize: 11, color: color.body, textDecoration: 'underline', cursor: 'pointer',
            }}
          >
            回自动
          </button>
        </div>
      ) : null}
    </div>
  );
}
