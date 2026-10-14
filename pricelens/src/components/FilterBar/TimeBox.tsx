// ============================================================
// §5.4 框四：时间 —— 时间粒度 Segmented（季/月/周，默认周）+ 自适应按钮 + 时间范围 RangePicker。
// 第十九轮：自适应默认开 —— 范围自动 = 所选产品数据跨度 ±2 个间隔（右缘钳在当前时间），
// RangePicker 冻结不可选；关闭后回手动（RangePicker 可选，拖刷轨道钳在所选范围内，
// 仅图表下 ‹› 箭头可把范围极值外扩）。范围的实际写入在图表侧（PriceTrend 自适应 effect）。
// 严格照抄 antd DatePicker.RangePicker 双面板弹层范式：
// 周 = 双月日历整周行选 + 左侧灰 ISO 周号列；月/季 = 双年宫格（月宫格/季宫格）；
// 两次点选（第一下开始、第二下结束、点更早日期 = 重新开始，antd 原生语义）；
// 数据范围外（2024-12-30 → 2026-10-07）禁用。
// 写入 state 的 rangeStart/rangeEnd = 当前粒度桶 id（周 YYYYWW / 月 YYYYMM / 季 YYYYQn）。
// 反馈 2.4：选中范围/面板选中格/聚焦边框浅蓝由 FilterBar 嵌套 ConfigProvider 生效。
// ============================================================
import { useMemo, type CSSProperties } from 'react';
import { DatePicker, Segmented, Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useFilters } from '../../state/FiltersContext';
import { computeTimeBounds, bucketIdOfDate, dateOfBucket } from './timeUtils';
import { color, fontSize, radius, selectAccent, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import { CONTROL_ROW_H } from './controlHeight';
import type { Granularity } from '../../dataModel/types';

const { RangePicker } = DatePicker;

/** 自适应按钮（第十九轮）：选中浅蓝底（与筛选条 Segmented 选中态同源），未选白底灰字 */
const adaptiveBtnStyle = (on: boolean): CSSProperties => ({
  flexShrink: 0,
  height: CONTROL_ROW_H,
  padding: '0 11px',
  borderRadius: radius.control,
  border: `1px solid ${on ? selectAccent : color.hairline}`,
  background: on ? selectSoft : color.canvas,
  color: on ? selectSoftInk : color.mute,
  fontSize: fontSize.bodySm,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

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
          { label: '季', value: 'quarter' },
          { label: '月', value: 'month' },
          { label: '周', value: 'week' },
        ]}
      />
      {/* 自适应（第十九轮，默认开）：开 = 范围随所选产品跨度自动适配（±2 个间隔、不超当前时间），
          范围选择框冻结；关 = 手动选择范围（图表下 ‹› 箭头仍可外扩范围极值） */}
      <Tooltip title="开：时间范围自动适配所选产品的数据跨度（±2 个间隔，不超过当前时间），范围框冻结；关：手动选择时间范围">
        <button
          type="button"
          aria-pressed={state.adaptive}
          style={adaptiveBtnStyle(state.adaptive)}
          onClick={() => actions.set({ adaptive: !state.adaptive })}
        >
          自适应
        </button>
      </Tooltip>
      <RangePicker
        picker={g}
        value={value}
        format={formatId}
        disabledDate={disabledDate}
        disabled={state.adaptive}
        allowClear={false}
        order
        // 第二十九轮：上限 560→420（用户反馈仍过大；内容 ~320px，收紧富余）
        style={{ flex: '0 1 420px', minWidth: 320 }}
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
