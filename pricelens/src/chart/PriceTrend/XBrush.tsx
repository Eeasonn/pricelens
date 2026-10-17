// ============================================================
// §6.5 时间范围：左侧是全局时间筛选，右侧是当前筛选范围内的查看窗口。
// 自动模式按所选产品的最早/最晚有效价格桶更新上方筛选器；窗口只负责缩放查看。
// ============================================================
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarOutlined } from '@ant-design/icons';
import { ConfigProvider, DatePicker, Segmented } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { bucketIdOfDate, dateOfBucket } from '../../components/FilterBar/timeUtils';
import { filterBarTheme } from '../../components/FilterBar';
import type { Granularity } from '../../dataModel/types';
import { color, font, fontSize, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';
import { GRID, MIN_WINDOW, panWindow, type Bucket } from './helpers';

export interface XBrushProps {
  buckets: Bucket[];
  /** 当前查看窗口，始终位于 [lo, hi] 内。 */
  s: number;
  e: number;
  /** 上方极值筛选器对应的桶区间。 */
  lo: number;
  hi: number;
  /** 与图表绘图区左缘对齐，保证轨道边界与折线边界一致。 */
  plotLeft: number;
  adaptive: boolean;
  granularity: Granularity;
  /** 调整下方查看窗口，不改变上方极值筛选器。 */
  onChange: (s: number, e: number) => void;
  /** 修改上方极值筛选器，退出自动模式。 */
  onRangeChange: (startId: string, endId: string) => void;
  /** 在时间设置面板中切换图表粒度。 */
  onGranularityChange: (granularity: Granularity) => void;
  onToggleAdaptive: () => void;
  onAdjusting?: (v: boolean) => void;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
type DragKind = 'start' | 'end' | 'pan';

export default function XBrush(props: XBrushProps) {
  const {
    buckets, s, e, lo, hi, plotLeft, adaptive, granularity,
    onChange, onRangeChange, onGranularityChange, onToggleAdaptive, onAdjusting,
  } = props;
  const n = buckets.length;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const brushRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: DragKind; startX: number; startS: number; startE: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [activeDrag, setActiveDrag] = useState<DragKind | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const reopenPickerRef = useRef(false);
  useEffect(() => {
    if (!reopenPickerRef.current) return undefined;
    reopenPickerRef.current = false;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setRangeOpen(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [granularity]);
  if (n === 0) return null;

  const pct = (i: number): number => ((i - lo) / Math.max(1, hi - lo + 1)) * 100;
  const tickPct = (i: number): number => ((i - lo + 0.5) / Math.max(1, hi - lo + 1)) * 100;
  const formatId = (id: string): string => {
    if (granularity === 'week' && /^\d{6}$/.test(id)) return `${id.slice(0, 4)}-W${id.slice(4)}`;
    if (granularity === 'month' && /^\d{6}$/.test(id)) return `${id.slice(0, 4)}-${id.slice(4)}`;
    return id;
  };
  const rangeLabel = (i: number): string => formatId(buckets[i].id);
  const startId = buckets[lo]?.id ?? buckets[0].id;
  const endId = buckets[hi]?.id ?? buckets[n - 1].id;
  const granularityLabel: Record<Granularity, string> = { week: '周', month: '月', quarter: '季' };
  const pickerMode: 'week' | 'month' | 'quarter' = granularity;
  const pickerValue: [Dayjs, Dayjs] = [
    dayjs(dateOfBucket(startId, granularity) ?? new Date()),
    dayjs(dateOfBucket(endId, granularity) ?? new Date()),
  ];
  const pickerFormat = (value: Dayjs): string => formatId(bucketIdOfDate(value.toDate(), granularity));
  const disabledDate = (value: Dayjs): boolean => {
    const id = bucketIdOfDate(value.toDate(), granularity);
    const index = buckets.findIndex((bucket) => bucket.id === id);
    return index < lo || index > hi;
  };
  const onPickerChange = (values: [Dayjs | null, Dayjs | null] | null): void => {
    const start = values?.[0];
    const end = values?.[1];
    if (!start || !end) return;
    onRangeChange(
      bucketIdOfDate(start.toDate(), granularity),
      bucketIdOfDate(end.toDate(), granularity),
    );
    setRangeOpen(false);
  };
  const handleGranularityChange = (next: Granularity): void => {
    if (next === granularity) return;
    // 粒度切换会改变图表高度；先关闭再重开，让 AntD 重新计算弹层锚点。
    reopenPickerRef.current = rangeOpen;
    setRangeOpen(false);
    onGranularityChange(next);
  };
  const renderPickerPanel = (panel: ReactNode): ReactNode => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px 5px', borderBottom: `1px solid ${color.hairline}` }}>
        <span style={{ color: color.body, fontSize: fontSize.caption, fontWeight: 600 }}>时间范围</span>
        <Segmented
          size="small"
          value={granularity}
          options={[{ label: '周', value: 'week' }, { label: '月', value: 'month' }, { label: '季', value: 'quarter' }]}
          onChange={(value) => handleGranularityChange(value as Granularity)}
        />
      </div>
      {panel}
    </div>
  );

  const onDragDown = (kind: DragKind) => (ev: ReactPointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    dragRef.current = { kind, startX: ev.clientX, startS: s, startE: e };
    setActiveDrag(kind);
    if (kind === 'pan') setPanning(true);
    onAdjusting?.(true);
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onDragMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width <= 0) return;
    if (d.kind === 'pan') {
      const delta = Math.round(((ev.clientX - d.startX) / rect.width) * (hi - lo + 1));
      const w = panWindow(d.startS, d.startE, lo, hi, delta);
      if (w.s !== s || w.e !== e) onChange(w.s, w.e);
      return;
    }
    const i = clamp(Math.floor(((ev.clientX - rect.left) / rect.width) * (hi - lo + 1)) + lo, lo, hi);
    if (d.kind === 'start') {
      onChange(clamp(i, Math.min(lo, d.startE - (MIN_WINDOW - 1)), d.startE), d.startE);
    } else {
      onChange(d.startS, clamp(i, d.startS + MIN_WINDOW - 1, Math.max(hi, d.startS + MIN_WINDOW - 1)));
    }
  };
  const onDragUp = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPanning(false);
    setActiveDrag(null);
    onAdjusting?.(false);
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const handleStyle = (kind: DragKind): CSSProperties => ({
    position: 'absolute', top: 0, width: 24, height: 28, border: 0, background: 'transparent',
    transform: 'translateX(-50%)', cursor: kind === 'pan' ? (panning ? 'grabbing' : 'grab') : 'ew-resize',
    touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3,
  });
  const handleGripStyle = (kind: DragKind): CSSProperties => ({
    width: activeDrag === kind ? 6 : 4,
    height: 28,
    borderRadius: radius.pill,
    background: activeDrag === kind ? selectAccent : '#4f8fe8',
    boxShadow: activeDrag === kind ? '0 1px 3px rgba(0, 112, 243, 0.28)' : undefined,
  });
  const labelStyle = (i: number): CSSProperties => ({
    position: 'absolute', left: `${tickPct(i)}%`, top: 34, transform: 'translateX(-50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
    fontSize: 11, lineHeight: '14px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.mute, whiteSpace: 'nowrap',
  });
  const tickStyle = (i: number): CSSProperties => ({
    position: 'absolute', left: `${tickPct(i)}%`, top: 10, width: 1,
    height: i === lo || i === hi ? 8 : 5,
    transform: 'translateX(-50%)', background: i === lo || i === hi ? color.hairlineStrong : '#aeb8c6',
    pointerEvents: 'none',
  });
  const span = Math.max(1, hi - lo + 1);
  const tickStep = granularity === 'week'
    ? Math.max(4, Math.ceil(span / 8 / 4) * 4)
    : Math.max(1, Math.ceil(span / 8));
  const yearMarks = new Set<number>();
  const calendarYearOf = (i: number): string => {
    const id = buckets[i].id;
    if (granularity === 'week') {
      const date = dateOfBucket(id, granularity);
      return date ? String(date.getFullYear()) : id.slice(0, 4);
    }
    return id.slice(0, 4);
  };
  for (let i = lo + 1; i <= hi; i += 1) {
    if (calendarYearOf(i) !== calendarYearOf(i - 1)) yearMarks.add(i);
  }
  // 刻度绝对等距：只按固定桶步长布点，跨年桶/末桶不再插位（插位会打乱间距）；
  // 跨年信息由该步长刻度标签第二行的年份表达（跨年桶不在刻度上时，归到其后首个刻度）。
  const tickIndexes: number[] = [];
  for (let i = lo; i <= hi; i += tickStep) tickIndexes.push(i);
  const yearChangedAt = (k: number): boolean => {
    if (k === 0) return true;
    const prev = tickIndexes[k - 1];
    for (const m of yearMarks) if (m > prev && m <= tickIndexes[k]) return true;
    return false;
  };
  const tickParts = (i: number, yearChanged: boolean): { date: string; year?: string } => {
    const id = buckets[i].id;
    if (granularity === 'week') return { date: buckets[i].xLabel, year: yearChanged ? id.slice(0, 4) : undefined };
    if (granularity === 'month') return { date: id.slice(4), year: yearChanged ? id.slice(0, 4) : undefined };
    return { date: id.slice(5), year: yearChanged ? id.slice(0, 4) : undefined };
  };

  return (
    <div
      ref={brushRef}
      style={{
        position: 'relative', display: 'grid', gridTemplateColumns: `${plotLeft}px minmax(0, 1fr)`,
        gap: 0, margin: `0 ${GRID.right}px 0 0`,
        zIndex: 12,
      }}
    >
      {/* 左侧：全局时间筛选/自动跟随。它决定轨道的可用边界。 */}
      <div style={{ position: 'relative', minHeight: 58, padding: '0 12px 7px 0', borderRight: `1px solid ${color.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <button
            type="button"
            aria-label="自动时间范围"
            aria-pressed={adaptive}
            title={adaptive ? '自动跟随所选产品的最早/最晚爬价时间' : '恢复所选产品的自动时间范围'}
            onClick={onToggleAdaptive}
            style={{
              height: 30, padding: '0 9px', borderRadius: radius.control,
              border: `1px solid ${adaptive ? selectAccent : color.hairlineStrong}`,
              background: adaptive ? selectSoft : color.canvas,
              color: adaptive ? selectSoftInk : color.body,
              font: 'inherit', fontSize: fontSize.caption, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
            }}
          >自动</button>
          <ConfigProvider locale={zhCN} theme={filterBarTheme}>
            <DatePicker.RangePicker
              key={pickerMode}
              aria-label="时间范围筛选器"
              className="xbrush-range-picker"
              dropdownClassName="xbrush-range-popup"
              classNames={{ popup: { root: 'xbrush-range-popup' } }}
              value={pickerValue}
              picker={pickerMode}
              format={pickerFormat}
              separator={<span style={{ color: color.mute }}>→</span>}
              prefix={<span style={{ color: color.mute, fontSize: fontSize.caption }}>{granularityLabel[granularity]}</span>}
              suffixIcon={<CalendarOutlined style={{ color: color.mute }} />}
              allowClear={false}
              inputReadOnly
              disabledDate={disabledDate}
              open={rangeOpen}
              onOpenChange={setRangeOpen}
              onChange={onPickerChange}
              panelRender={renderPickerPanel}
              placement="topLeft"
              getPopupContainer={() => brushRef.current ?? document.body}
              styles={{ popup: { root: { width: '100%', left: 0 } } }}
              style={{ minWidth: 0, flex: '1 1 240px', width: 240, height: 30 }}
            />
          </ConfigProvider>
        </div>
      </div>

      {/* 右侧：时间调整轴。与拖柄同高，紧贴大促标签行。 */}
      <div style={{ minWidth: 0, padding: 0 }}>
        <div ref={trackRef} style={{ position: 'relative', height: 58, minWidth: 0 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 28, borderRadius: 6, background: '#edf0f4', boxShadow: `inset 0 0 0 1px ${color.hairline}` }} />
          <div
            title="拖动查看窗口，不改变左侧时间筛选器"
            aria-label="平移时间段"
            style={{
              position: 'absolute', left: `${pct(s)}%`, width: `${pct(e + 1) - pct(s)}%`, top: 0, height: 28,
              borderRadius: 6, background: panning ? '#c7ddff' : '#dceaff',
              boxShadow: 'inset 0 0 0 1px #8db4f0', cursor: panning ? 'grabbing' : 'grab', touchAction: 'none', zIndex: 1,
            }}
            onPointerDown={onDragDown('pan')} onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}
          />
          {tickIndexes.map((i) => <span key={`tick-${i}`} aria-hidden="true" style={tickStyle(i)} />)}
          {tickIndexes.map((i, k) => {
            const tick = tickParts(i, yearChangedAt(k));
            return (
              <span key={`label-${i}`} aria-hidden="true" style={labelStyle(i)}>
                <span>{tick.date}</span>
                {tick.year && <em style={{ fontStyle: 'italic', color: color.mute }}>{tick.year}</em>}
              </span>
            );
          })}
          <div
            style={{ ...handleStyle('start'), left: `${pct(s)}%` }} role="slider" tabIndex={0}
            aria-label="时间范围起点" aria-valuemin={lo} aria-valuemax={Math.max(lo, e - MIN_WINDOW + 1)} aria-valuenow={s} aria-valuetext={rangeLabel(s)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const next = clamp(s + (event.key === 'ArrowRight' ? 1 : -1), lo, Math.max(lo, e - MIN_WINDOW + 1));
              if (next !== s) onChange(next, e);
            }}
            onPointerDown={onDragDown('start')} onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}
          >
            <span style={handleGripStyle('start')} />
          </div>
          <div
            style={{ ...handleStyle('end'), left: `${pct(e + 1)}%` }} role="slider" tabIndex={0}
            aria-label="时间范围终点" aria-valuemin={Math.min(hi, s + MIN_WINDOW - 1)} aria-valuemax={hi} aria-valuenow={e} aria-valuetext={rangeLabel(e)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const next = clamp(e + (event.key === 'ArrowRight' ? 1 : -1), Math.min(hi, s + MIN_WINDOW - 1), hi);
              if (next !== e) onChange(s, next);
            }}
            onPointerDown={onDragDown('end')} onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}
          >
            <span style={handleGripStyle('end')} />
          </div>
        </div>
      </div>
    </div>
  );
}
