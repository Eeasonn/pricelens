// ============================================================
// 量价参考卡 · 每面板生命周期时间轨（替换 A5 的底部共享时间轨）：
// 视觉与交互复用既有范式（trackColors 轨道 + 选中窗 + 两端拖柄缩放 +
// 整段平移 + ←/→ 1 周、Shift+←/→ 4 周键盘微调；panWindow 平移钳制），
// 刻度为相对周龄 W1…W末周（不走日历 axisTickPlan，参考卡既有例外约定）。
// 本组件只管「本面板」窗口：窗口预设（全周期 / 最近 16 周 / 当前事件窗）
// + 单面板锁定（锁定后同步 / 回放定位 / 名录定位都不得改写它；锁图标 +
// aria-pressed + 文字 title，不靠颜色单独表达）。窗口只决定查看范围，
// 不裁剪模型输入、不重算同周龄比值。
// ============================================================
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Select } from 'antd';
import { panWindow } from '../../chart/PriceTrend/helpers';
import { color, font, radius, selectAccent, trackColors } from '../../theme/tokens';

/** 最小窗口（周）与聚焦跨度：与参考卡模型同源口径。 */
const TRACK_MIN_WINDOW = 8;

export type ReferenceWindowPreset = 'full' | 'last16' | 'event' | 'custom';

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));

export default function ReferenceTimeTrack(props: {
  /** 面板产品名（可访问名称区分同卡多轨）。 */
  productLabel: string;
  /** 可调全域长度 = product.points.length。 */
  total: number;
  win: [number, number];
  onChange: (s: number, e: number) => void;
  /** 单面板锁定：轨道与预设禁用；解锁后才能手动调整。 */
  locked: boolean;
  onToggleLock: () => void;
  /** 事件窗预设可用性（有选中事件时出现）。 */
  eventRange: [number, number] | null;
  onPreset: (preset: Exclude<ReferenceWindowPreset, 'custom'>) => void;
}) {
  const { productLabel, total, win, onChange, locked, onToggleLock, eventRange, onPreset } = props;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: 'start' | 'end' | 'pan'; startX: number; startS: number; startE: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [activeDrag, setActiveDrag] = useState<'start' | 'end' | 'pan' | null>(null);
  const n = total;
  if (n <= 0) return null;
  const zoomable = n >= TRACK_MIN_WINDOW;

  const pct = (i: number): number => (i / Math.max(1, n)) * 100;
  const s = clampInt(win[0], 0, n - 1);
  const e = clampInt(win[1], s, n - 1);

  const onDragDown = (kind: 'start' | 'end' | 'pan') => (ev: ReactPointerEvent<HTMLElement>): void => {
    if (locked || !zoomable) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragRef.current = { kind, startX: ev.clientX, startS: s, startE: e };
    setActiveDrag(kind);
    if (kind === 'pan') setPanning(true);
    if (typeof ev.currentTarget.setPointerCapture === 'function') ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onDragMove = (ev: ReactPointerEvent<HTMLElement>): void => {
    const d = dragRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width <= 0) return;
    if (d.kind === 'pan') {
      const delta = Math.round(((ev.clientX - d.startX) / rect.width) * n);
      const w = panWindow(d.startS, d.startE, 0, n - 1, delta);
      if (w.s !== s || w.e !== e) onChange(w.s, w.e);
      return;
    }
    const i = clampInt(((ev.clientX - rect.left) / rect.width) * n, 0, n - 1);
    // 与键盘微调同钳法：起点 ≤ 终点 −(MIN−1)、终点 ≥ 起点 + MIN−1
    if (d.kind === 'start') onChange(clampInt(i, 0, Math.max(0, d.startE - (TRACK_MIN_WINDOW - 1))), d.startE);
    else onChange(d.startS, clampInt(i, Math.min(n - 1, d.startS + TRACK_MIN_WINDOW - 1), n - 1));
  };
  const onDragUp = (ev: ReactPointerEvent<HTMLElement>): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPanning(false);
    setActiveDrag(null);
    const el = ev.currentTarget;
    if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(ev.pointerId)) {
      el.releasePointerCapture(ev.pointerId);
    }
  };
  const nudge = (kind: 'start' | 'end', delta: number): void => {
    if (kind === 'start') onChange(clampInt(s + delta, 0, Math.max(0, e - (TRACK_MIN_WINDOW - 1))), e);
    else onChange(s, clampInt(e + delta, Math.min(n - 1, s + TRACK_MIN_WINDOW - 1), n - 1));
  };

  // 窗口预设识别（custom = 手调后的任意窗）
  const isFull = s === 0 && e === n - 1;
  const isLast16 = zoomable && s === Math.max(0, n - 16) && e === n - 1;
  const isEvent = eventRange != null && s === eventRange[0] && e === eventRange[1];
  const presetValue: ReferenceWindowPreset = isEvent ? 'event' : isFull ? 'full' : isLast16 ? 'last16' : 'custom';

  // 中间刻度（密度 n/4）：与窗口端点相邻 ±1 的让位（端点标签恒标）
  const step = Math.max(1, Math.ceil(n / 4));
  const midIdx = Array.from({ length: n }, (_, i) => i)
    .filter((i) => i % step === 0 && Math.abs(i - s) > 1 && Math.abs(i - e) > 1);

  const gripStyle = (kind: 'start' | 'end'): CSSProperties => ({
    width: activeDrag === kind ? 5 : 3,
    height: 20,
    borderRadius: radius.pill,
    background: activeDrag === kind ? selectAccent : trackColors.handle,
  });
  const handleStyle = (kind: 'start' | 'end'): CSSProperties => ({
    position: 'absolute',
    left: `${pct(kind === 'start' ? s : e + 1)}%`,
    top: 0,
    width: 18,
    height: 20,
    border: 0,
    background: 'transparent',
    transform: 'translateX(-50%)',
    cursor: locked || !zoomable ? 'default' : 'ew-resize',
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    zIndex: 3,
  });
  const disabledUi = locked || !zoomable;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4, minWidth: 0 }}>
      <Select
        size="small"
        aria-label={`${productLabel} 窗口预设`}
        title="窗口只决定查看范围，不改变参照数据与模型输入"
        value={presetValue}
        disabled={locked}
        onChange={(value) => {
          if (value !== 'custom') onPreset(value);
        }}
        options={[
          { value: 'full', label: '全周期' },
          ...(zoomable ? [{ value: 'last16', label: '最近 16 周' }] : []),
          ...(eventRange ? [{ value: 'event', label: '当前事件窗' }] : []),
          ...(presetValue === 'custom' ? [{ value: 'custom', label: `W${s + 1}–W${e + 1}` }] : []),
        ]}
        style={{ width: 108, flex: 'none' }}
        popupMatchSelectWidth={false}
      />
      <div ref={trackRef} style={{ position: 'relative', height: 52, flex: '1 1 auto', minWidth: 0, opacity: locked ? 0.45 : 1 }}>
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 20, borderRadius: 5, background: trackColors.rail, boxShadow: `inset 0 0 0 1px ${color.hairline}` }} />
        <div
          title={locked ? '本面板窗口已锁定' : '拖动调整本面板查看窗口，不改变参照数据范围'}
          aria-label={`${productLabel} 平移参考时间窗`}
          aria-disabled={locked || !zoomable}
          style={{
            position: 'absolute',
            left: `${pct(s)}%`,
            width: `${pct(e + 1) - pct(s)}%`,
            top: 0,
            height: 20,
            borderRadius: 5,
            background: panning ? trackColors.fillStrong : trackColors.fill,
            boxShadow: `inset 0 0 0 1px ${trackColors.handleSoft}`,
            cursor: panning ? 'grabbing' : locked || !zoomable ? 'default' : 'grab',
            touchAction: 'none',
            zIndex: 1,
          }}
          onPointerDown={onDragDown('pan')}
          onPointerMove={onDragMove}
          onPointerUp={onDragUp}
          onPointerCancel={onDragUp}
        />
        {[s, e].map((m) => (
          <span key={`edge-tick-${m}`} aria-hidden="true" style={{ position: 'absolute', left: `${pct(m) + 0.5 / n}%`, top: 4, width: 1, height: 12, transform: 'translateX(-50%)', background: color.hairlineStrong, pointerEvents: 'none' }} />
        ))}
        {midIdx.map((i) => (
          <span key={`mid-tick-${i}`} aria-hidden="true" style={{ position: 'absolute', left: `${pct(i) + 0.5 / n}%`, top: 7, width: 1, height: 6, transform: 'translateX(-50%)', background: trackColors.tick, pointerEvents: 'none' }} />
        ))}
        {/* 两端拖柄标签（恒标，白底兜底遮盖；中间刻度只画线 + 少量灰标签） */}
        <span aria-hidden="true" className="tnum" style={{ position: 'absolute', left: `${pct(s)}%`, top: 26, transform: 'translateX(-12%)', fontSize: 12, lineHeight: '14px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.body, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none', background: color.canvas, padding: '0 3px' }}>
          {`W${s + 1}`}
        </span>
        <span aria-hidden="true" className="tnum" style={{ position: 'absolute', left: `${pct(e + 1)}%`, top: 26, transform: 'translateX(-88%)', fontSize: 12, lineHeight: '14px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.body, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none', background: color.canvas, padding: '0 3px' }}>
          {`W${e + 1}`}
        </span>
        {midIdx.map((i) => (
          <span
            key={`mid-label-${i}`}
            aria-hidden="true"
            className="tnum"
            style={{ position: 'absolute', left: `${pct(i) + 0.5 / n}%`, top: 26, transform: 'translateX(-50%)', fontSize: 12, lineHeight: '14px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.mute, whiteSpace: 'nowrap', pointerEvents: 'none' }}
          >
            {`W${i + 1}`}
          </span>
        ))}
        {(['start', 'end'] as const).map((kind) => (
          <div
            key={kind}
            style={handleStyle(kind)}
            role="slider"
            tabIndex={locked || !zoomable ? -1 : 0}
            aria-label={`${productLabel} 时间窗${kind === 'start' ? '起点' : '终点'}拖柄`}
            aria-disabled={disabledUi}
            aria-valuemin={kind === 'start' ? 0 : Math.min(n - 1, s + TRACK_MIN_WINDOW - 1)}
            aria-valuemax={kind === 'start' ? Math.max(0, e - TRACK_MIN_WINDOW + 1) : n - 1}
            aria-valuenow={kind === 'start' ? s : e}
            onKeyDown={(event) => {
              if (locked || !zoomable) return;
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 4 : 1);
              nudge(kind, delta);
            }}
            onPointerDown={onDragDown(kind)}
            onPointerMove={onDragMove}
            onPointerUp={onDragUp}
            onPointerCancel={onDragUp}
          >
            <span style={gripStyle(kind)} />
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label={`${productLabel} ${locked ? '解锁' : '锁定'}时间窗`}
        aria-pressed={locked}
        title={locked
          ? '本面板窗口已锁定：同步、回放定位与名录定位都不会改写它；点击解锁后才能手动调整'
          : '锁定本面板窗口：同步、回放定位与名录定位都不会改写它'}
        onClick={onToggleLock}
        style={{
          flex: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 24,
          width: 26,
          borderRadius: radius.control,
          border: `1px solid ${locked ? color.ink : color.hairline}`,
          background: locked ? color.canvasSoft2 : color.canvas,
          color: locked ? color.ink : color.mute,
          font: 'inherit',
          fontSize: 12,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {locked ? '锁' : '开'}
      </button>
    </div>
  );
}
