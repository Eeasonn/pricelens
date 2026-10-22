// ============================================================
// §6.5 时间范围：时间筛选簇（TimeRangeCluster）+ 当前筛选范围内的查看窗口轨道。
// 自动模式按所选产品的最早/最晚有效价格桶更新筛选器；窗口只负责缩放查看。
// 第一百一十九轮（走查会）：左侧时间筛选簇抽成 TimeRangeCluster 导出组件。
// 第一百二十三轮：刻度主行恒短格式（周=MM-DD/月=MM/季=Qn，窗口两端拖柄标签同样
// 短格式、只加粗区分），年份独立第二行（最左显示刻度恒带、换年刻度带）；拖柄两端
// 标签与中间刻度改按像素区间避让（原按桶数让位在窄轨道/密周窗口下仍叠字）。
// 第一百三十一轮波2：时间筛选器统一上移顶部筛选条（FilterBar/TimeBox）——刷选条
// 左列（时间筛选/「同步」占位）整列退役，本组件收敛为纯查看窗口轨道（价格看板
// 合并模式专用），通栏一行、左右缘与绘图区对齐；TimeRangeCluster 仍由本文件导出
// （顶部筛选条 TimeBox 在用）。波2修：TimeRangeCluster 弹层即时开关（不依赖
// CSS transitionend）+ 再点输入框关闭，见 TimeRangeCluster 注。
// ============================================================
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarOutlined } from '@ant-design/icons';
import { ConfigProvider, DatePicker, Segmented } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { bucketIdOfDate, dateOfBucket } from '../../components/FilterBar/timeUtils';
import { filterBarTheme } from '../../components/FilterBar';
import type { Granularity } from '../../dataModel/types';
import { axisTickPlan, fullBucketLabel, GRID, hideOverlappingTicks, MIN_WINDOW, panWindow, type Bucket } from './helpers';
import { color, font, fontSize, radius, selectAccent, selectSoft, selectSoftInk, trackColors } from '../../theme/tokens';

export interface TimeRangeClusterProps {
  buckets: Bucket[];
  /** 上方极值筛选器对应的桶区间。 */
  lo: number;
  hi: number;
  adaptive: boolean;
  granularity: Granularity;
  /** 修改上方极值筛选器，退出自动模式。 */
  onRangeChange: (startId: string, endId: string) => void;
  /** 在时间设置面板中切换图表粒度。 */
  onGranularityChange: (granularity: Granularity) => void;
  onToggleAdaptive: () => void;
  /** 弹层展开方向：位于页面顶部时向下展开。 */
  placement?: 'topLeft' | 'bottomLeft';
  /** 弹层挂载容器（缺省挂在组件自身根节点）。 */
  popupContainerRef?: RefObject<HTMLDivElement | null>;
}

/** 时间筛选簇 = 「自动」跟随开关 + 时间范围选择器（粒度切换在选择器面板内）。
 *  独立导出：底部刷选条与量价卡顶工具行共用同一交互。
 *  第一百三十一轮波2修：①弹层显隐不依赖 CSS 过渡（transitionName 置空，即时
 *  开关）；②外点/Escape 关闭改由本组件直接 setState（rc-picker 把关闭延迟一帧
 *  raf，在 rAF 挂起的嵌入 webview 里永不执行 → 弹层关不掉，见下方 effect 注）；
 *  ③再点输入框 = 关闭切换（rc-picker 原生对输入框点击恒保持打开）。 */
export function TimeRangeCluster(props: TimeRangeClusterProps) {
  const { buckets, lo, hi, adaptive, granularity, onRangeChange, onGranularityChange, onToggleAdaptive, placement = 'topLeft', popupContainerRef } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const reopenPickerRef = useRef(false);
  // 输入框再点切换用：pointerdown 先于 focus/click 落表（focus 会把选择器打开，
  // 点击批内再取渲染值恒为"已开"），故在按下时刻捕获打开态，点击时据此判定切换。
  const rangeOpenRef = useRef(false);
  rangeOpenRef.current = rangeOpen;
  const pressOpenRef = useRef(false);
  const n = buckets.length;
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
  // 关闭兜底（第一百三十一轮波2修）：rc-picker 的外点/Escape 关闭被刻意延迟一帧
  // （useDelayState 的 raf(doUpdate)，防快速开→关抖动），在 rAF 被挂起的环境
  // （后台/遮挡的嵌入 webview）里该帧永不执行，经其内部的关闭路径全部失效、
  // 弹层关不掉（只有直接 setState 的"完成选择"能关）。弹层显隐跟随本组件受控
  // open，这里监听后直接同步 setState，不再等帧。面板挂载在卡片根、不在本簇
  // 子树内，故以 xbrush-range-popup 类白名单放行面板内部点击（选段/切粒度）。
  useEffect(() => {
    if (!rangeOpen) return undefined;
    const onDocPointerDown = (e: PointerEvent): void => {
      const path = (e.composedPath?.() ?? []) as Node[];
      const inPopup = path.some((n2) => n2 instanceof Element && n2.classList.contains('xbrush-range-popup'));
      const root = rootRef.current;
      if (inPopup || (root !== null && path.includes(root))) return;
      setRangeOpen(false);
    };
    const onDocKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setRangeOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      document.removeEventListener('keydown', onDocKeyDown, true);
    };
  }, [rangeOpen]);
  if (n === 0) return null;

  const formatId = (id: string): string => {
    if (granularity === 'week' && /^\d{6}$/.test(id)) return `${id.slice(0, 4)}-W${id.slice(4)}`;
    if (granularity === 'month' && /^\d{6}$/.test(id)) return `${id.slice(0, 4)}-${id.slice(4)}`;
    return id;
  };
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

  return (
    <div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <button
        type="button"
        aria-label="自动时间范围"
        aria-pressed={adaptive}
        title={adaptive ? '自动覆盖所选产品的最早～最新有价时间' : '恢复所选产品的自动时间范围'}
        onClick={onToggleAdaptive}
        style={{
          height: 30, padding: '0 9px', borderRadius: radius.control,
          border: `1px solid ${adaptive ? selectAccent : color.hairlineStrong}`,
          background: adaptive ? selectSoft : color.canvas,
          color: adaptive ? selectSoftInk : color.body,
          font: 'inherit', fontSize: fontSize.caption, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        }}
      >自动</button>
      {/* 输入框再点 = 开↔关切换（同步 setState）：面板挂在卡片根（不在本簇子树），
          面板内部点击不会冒泡到这里。打开/关闭都不依赖 rc-picker 内部那帧 raf
          （受控开启同样被延迟，挂起环境里点输入框打不开），与关闭兜底同一思路。
          display:contents 不产生盒模型，选择器沿用簇内原 flex 尺寸。 */}
      <span
        onPointerDown={() => {
          pressOpenRef.current = rangeOpenRef.current;
        }}
        onClick={() => {
          if (pressOpenRef.current) setRangeOpen(false);
          else setRangeOpen(true);
        }}
        style={{ display: 'contents' }}
      >
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
            placement={placement}
            transitionName="" // 弹层即时开关：不依赖 CSS transitionend（嵌入 webview 不回报，见上注）
            getPopupContainer={() => popupContainerRef?.current ?? rootRef.current ?? document.body}
            styles={{ popup: { root: { width: '100%', left: 0 } } }}
            style={{ minWidth: 0, flex: '1 1 240px', width: 240, height: 30 }}
          />
        </ConfigProvider>
      </span>
    </div>
  );
}

export interface XBrushProps {
  buckets: Bucket[];
  /** 当前查看窗口，始终位于 [lo, hi] 内。 */
  s: number;
  e: number;
  /** 上方极值筛选器对应的桶区间（轨道 = 该范围）。 */
  lo: number;
  hi: number;
  /** 与图表绘图区左缘对齐：轨道通栏一行，左缘内缩到绘图区、右缘到容器右缘。 */
  plotLeft: number;
  granularity: Granularity;
  /** 调整下方查看窗口，不改变上方极值筛选器。 */
  onChange: (s: number, e: number) => void;
  onAdjusting?: (v: boolean) => void;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
type DragKind = 'start' | 'end' | 'pan';

/** 元素实宽（ResizeObserver；第一百二十三轮像素让位——轨道宽度决定刻度标签像素区间） */
function useObservedWidth(): [MutableRefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) setW(en.contentRect.width);
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

let labelMeasureCtx: CanvasRenderingContext2D | null = null;
/** 刻度标签单行像素宽（让位判定用；无 DOM 环境按 0.6×字号/字符粗估） */
const measureTickText = (s: string, px: number): number => {
  if (!s) return 0;
  if (typeof document === 'undefined') return s.length * px * 0.6;
  if (!labelMeasureCtx) labelMeasureCtx = document.createElement('canvas').getContext('2d');
  if (!labelMeasureCtx) return s.length * px * 0.6;
  labelMeasureCtx.font = `${px}px ${font.family}`;
  return labelMeasureCtx.measureText(s).width;
};

export default function XBrush(props: XBrushProps) {
  const {
    buckets, s, e, lo, hi, plotLeft, granularity, onChange, onAdjusting,
  } = props;
  const n = buckets.length;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: DragKind; startX: number; startS: number; startE: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [activeDrag, setActiveDrag] = useState<DragKind | null>(null);
  const [widthRef, trackW] = useObservedWidth();
  if (n === 0) return null;

  const pct = (i: number): number => ((i - lo) / Math.max(1, hi - lo + 1)) * 100;
  const tickPct = (i: number): number => ((i - lo + 0.5) / Math.max(1, hi - lo + 1)) * 100;
  const rangeLabel = (i: number): string => fullBucketLabel(granularity, buckets[i].id);
  // 刻度计划（第123轮口径）：主行恒短格式；窗口两端拖柄标签 = 加粗短格式，
  // 年份行规则同中间刻度（最左显示刻度恒带、换年刻度带）
  const domainIds = buckets.slice(lo, hi + 1).map((b) => b.id);
  const span = Math.max(1, hi - lo + 1);
  const tickStep = granularity === 'week'
    ? Math.max(4, Math.ceil(span / 8 / 4) * 4)
    : Math.max(1, Math.ceil(span / 8));
  const plan = axisTickPlan(granularity, domainIds, tickStep, [s - lo, e - lo]);
  // 像素让位（第一百二十三轮）：拖柄两端标签像素区间 = 文本实宽 + 白底 padding；
  // 与之相交（含 4px 间距）的中间刻度标签与刻度线整组隐藏。轨道实宽未知（首帧）
  // 时先全显示，ResizeObserver 回调宽度后重算。
  const EDGE_PAD = 3;
  const labelWOf = (idx: number): number => {
    const year = plan.yearText(idx);
    return Math.max(measureTickText(plan.dateText(idx), 11), year ? measureTickText(year, 11) : 0);
  };
  const xPxOfTick = (i: number): number => ((i - lo + 0.5) / span) * trackW;
  const edgeIdx = plan.indexes.filter((i) => plan.isEdge(i));
  const midIdx = plan.indexes.filter((i) => !plan.isEdge(i));
  const midHidden =
    trackW > 0
      ? hideOverlappingTicks(
          midIdx.map((i) => ({ x: xPxOfTick(i + lo), w: labelWOf(i) })),
          edgeIdx.map((i) => ({ x: xPxOfTick(i + lo), w: labelWOf(i) + EDGE_PAD * 2 })),
          4,
        )
      : midIdx.map(() => false);
  const hiddenSet = new Set(midIdx.filter((_, k) => midHidden[k]));

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
      // 第一百二十五轮：起点上界 = 终点前留足 MIN_WINDOW 桶、终点不越过 hi（与键盘处理同款钳制口径）
      onChange(clamp(i, lo, Math.max(lo, d.startE - (MIN_WINDOW - 1))), d.startE);
    } else {
      onChange(d.startS, clamp(i, Math.min(hi, d.startS + MIN_WINDOW - 1), hi));
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
    background: activeDrag === kind ? selectAccent : trackColors.handle,
    boxShadow: activeDrag === kind ? '0 1px 3px rgba(0, 112, 243, 0.28)' : undefined,
  });
  const labelStyle = (i: number, edge: boolean): CSSProperties => ({
    position: 'absolute', left: `${tickPct(i)}%`, top: 34, transform: 'translateX(-50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
    fontSize: 11, lineHeight: '14px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums',
    color: edge ? color.body : color.mute, fontWeight: edge ? 600 : 400, whiteSpace: 'nowrap',
    // 第一百二十三轮：拖柄两端标签白底 + 左右 padding——与相邻灰色刻度叠上时兜底遮盖
    background: edge ? color.canvas : undefined,
    padding: edge ? '0 3px' : undefined,
  });
  const tickStyle = (edge: boolean): CSSProperties => ({
    position: 'absolute', top: 10, width: 1,
    height: edge ? 8 : 5,
    transform: 'translateX(-50%)', background: edge ? color.hairlineStrong : trackColors.tick,
    pointerEvents: 'none',
  });

  return (
    <div
      style={{
        position: 'relative',
        // 通栏一行：左缘内缩到绘图区（plotLeft）、右缘贴容器（预留 GRID.right），
        // 轨道刻度与上方图表的横向位置逐像素对齐。
        margin: `0 ${GRID.right}px 0 0`,
        paddingLeft: plotLeft,
        zIndex: 12,
      }}
    >
      {/* 时间调整窗口轨道（第一百三十一轮波2起唯一内容；时间筛选/「同步」开关已上移）。 */}
      <div
        ref={(el) => {
          trackRef.current = el;
          widthRef.current = el;
        }}
        style={{ position: 'relative', height: 58, minWidth: 0 }}
      >
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 28, borderRadius: 6, background: trackColors.rail, boxShadow: `inset 0 0 0 1px ${color.hairline}` }} />
          <div
            title="拖动调整下方图表的时间范围"
            aria-label="平移时间段"
            style={{
              position: 'absolute', left: `${pct(s)}%`, width: `${pct(e + 1) - pct(s)}%`, top: 0, height: 28,
              borderRadius: 6, background: panning ? trackColors.fillStrong : trackColors.fill,
              boxShadow: `inset 0 0 0 1px ${trackColors.handleSoft}`, cursor: panning ? 'grabbing' : 'grab', touchAction: 'none', zIndex: 1,
            }}
            onPointerDown={onDragDown('pan')} onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}
          />
          {plan.indexes.map((idx) => {
            const i = idx + lo;
            const edge = plan.isEdge(idx);
            // 像素让位：与拖柄两端标签相交的中间刻度线一并隐藏（第一百二十三轮）
            if (hiddenSet.has(idx)) return null;
            return <span key={`tick-${idx}`} aria-hidden="true" style={{ ...tickStyle(edge), left: `${tickPct(i)}%` }} />;
          })}
          {plan.indexes.map((idx) => {
            const i = idx + lo;
            const edge = plan.isEdge(idx);
            const year = plan.yearText(idx);
            if (hiddenSet.has(idx)) return null;
            return (
              <span key={`label-${idx}`} aria-hidden="true" style={{ ...labelStyle(i, edge) }}>
                <span>{plan.dateText(idx)}</span>
                {year && <em style={{ fontStyle: 'italic', color: color.mute }}>{year}</em>}
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
  );
}
