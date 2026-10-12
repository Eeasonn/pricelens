// ============================================================
// §5.4 框四：时间 —— 时间粒度 Segmented（月/周/季，默认周）+ 时间范围 RangePicker。
// 反馈 2.2/2.5：控件行=「粒度 + 范围」单行（高 32），标题「时间」由 FilterBar 的
// FilterCell 统一渲染，保证各筛选器控件行底部对齐。
// 严格照抄 antd DatePicker.RangePicker 双面板弹层范式：
// 周 = 双月日历整周行选 + 左侧灰 ISO 周号列；月/季 = 双年宫格（月宫格/季宫格）；
// 两次点选（第一下开始、第二下结束、点更早日期 = 重新开始，antd 原生语义）；
// 数据范围外（2024-12-30 → 2026-10-07）禁用。
// 写入 state 的 rangeStart/rangeEnd = 当前粒度桶 id（周 YYYYWW / 月 YYYYMM / 季 YYYYQn）。
// 反馈 2.4：选中范围/面板选中格/聚焦边框浅蓝由 FilterBar 嵌套 ConfigProvider 生效。
// ============================================================
import { useMemo } from 'react';
import { DatePicker, Segmented } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useFilters } from '../../state/FiltersContext';
import { computeTimeBounds, bucketIdOfDate, dateOfBucket } from './timeUtils';
import { space } from '../../theme/tokens';
import { CONTROL_ROW_H } from './FilterCell';
import type { Granularity } from '../../dataModel/types';

const { RangePicker } = DatePicker;

export default function TimeBox() {
  const { state, actions } = useFilters();
  const bounds = useMemo(() => computeTimeBounds(), []);
  const g = state.granularity;

  /** 范围外禁用（按当前粒度的桶 id 判断，dimTime 就绪时取真实窗口） */
  const disabledDate = (d: Dayjs): boolean => {
    const id = bucketIdOfDate(d.toDate(), g);
    if (g === 'week') return id < bounds.weekMin || id > bounds.weekMax;
    if (g === 'month') return id < bounds.monthMin || id > bounds.monthMax;
    return id < bounds.quarterMin || id > bounds.quarterMax;
  };

  const start = dateOfBucket(state.rangeStart, g);
  const end = dateOfBucket(state.rangeEnd, g);
  const value: [Dayjs, Dayjs] | undefined = start && end ? [dayjs(start), dayjs(end)] : undefined;

  /** 输入框展示桶 id 技术标记：周 `2026-W29`；月 `202607`；季 `2026Q3`（§6.2） */
  const formatId = (d: Dayjs): string => {
    const id = bucketIdOfDate(d.toDate(), g);
    return g === 'week' ? `${id.slice(0, 4)}-W${Number(id.slice(4))}` : id;
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: space.sm,
        alignItems: 'center',
        height: CONTROL_ROW_H,
        width: '100%',
        minWidth: 0,
      }}
    >
      <Segmented
        style={{ flexShrink: 0 }}
        value={g}
        onChange={(v) => actions.setGranularity(v as Granularity)}
        options={[
          { label: '月', value: 'month' },
          { label: '周', value: 'week' },
          { label: '季', value: 'quarter' },
        ]}
      />
      <RangePicker
        picker={g}
        value={value}
        format={formatId}
        disabledDate={disabledDate}
        allowClear={false}
        order
        style={{ flex: 1, minWidth: 0 }}
        onChange={(dates) => {
          if (!dates || !dates[0] || !dates[1]) return;
          let startId = bucketIdOfDate(dates[0].toDate(), g);
          let endId = bucketIdOfDate(dates[1].toDate(), g);
          if (startId > endId) [startId, endId] = [endId, startId];
          // §5.6 切换时间范围：窗口收缩至新范围（X 轴窗口收缩由图表侧消费 state 完成）
          actions.set({ rangeStart: startId, rangeEnd: endId });
        }}
      />
    </div>
  );
}
