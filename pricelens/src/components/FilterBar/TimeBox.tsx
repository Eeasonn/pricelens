// ============================================================
// 顶部筛选条 · 时间筛选簇（第一百三十一轮波2）：包装 XBrush 导出的
// TimeRangeCluster（「自动」开关 + 周/月/季范围选择器），不自建交互逻辑。
// 桶枚举与筛选范围下标推导与两看板同口径（dataBucketRange/enumerateBuckets
// + state.rangeStart/rangeEnd → [lo, hi]）；时间状态全局同源（useFilters，
// URL/持久化同步照旧），价格看板与量价看板共用本入口（FilterBar showTime
// 时渲染在币种右侧）。手动选段 = 退出自动模式；「自动」= 跟随所选产品
// 最早/最晚有价时间。查看窗口复位由各看板监听范围变化自理。
// 2026-11-03：disabled 由 FilterBar 传入（大盘走势页置灰，时间不作用于该页
// 样例）。时间簇无停用入参，在外层停用：原生 fieldset 让簇内按钮与输入框不可
// 聚焦、不可触发；componentDisabled 让日期选择器置灰且不展开；指针穿透到外层
// （悬停示禁用光标，停用期间也不会留下展开态）。「自动时间」是行内样式的原生
// 按钮，停用态灰化由下方局部样式补齐。fieldset 常驻，切页不重挂时间簇。
// ============================================================
import { useMemo } from 'react';
import { ConfigProvider } from 'antd';
import { TimeRangeCluster } from '../../chart/PriceTrend/XBrush';
import { dataBucketRange, enumerateBuckets, type Bucket } from '../../chart/PriceTrend/helpers';
import { useFilters } from '../../state/FiltersContext';
import { color } from '../../theme/tokens';

/** 停用态作用域类：灰化簇内原生按钮（其行内样式只能以 !important 覆盖） */
const DISABLED_CLASS = 'lpl-timebox-disabled';

export default function TimeBox({ disabled = false }: { disabled?: boolean } = {}) {
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
    <div style={{ flex: '1 1 280px', width: 'auto', maxWidth: 460, minWidth: 0, cursor: disabled ? 'not-allowed' : undefined }}>
      <fieldset
        disabled={disabled}
        className={disabled ? DISABLED_CLASS : undefined}
        style={{ minWidth: 0, margin: 0, padding: 0, border: 0, pointerEvents: disabled ? 'none' : undefined }}
      >
        <ConfigProvider componentDisabled={disabled}>
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
        </ConfigProvider>
      </fieldset>
      {disabled && (
        <style>{`
          .${DISABLED_CLASS} button:disabled {
            color: ${color.hairlineStrong} !important;
            background: ${color.canvasSoft2} !important;
            border-color: ${color.hairline} !important;
          }
        `}</style>
      )}
    </div>
  );
}
